import type { Trade } from './risk';
import { cents, sumCents } from './journalAccuracy';
import { filterTradeAccount, tradeAccountKey as getTradeAccountKey } from './tradovateHistory';

export type AskCovaQuestion = 'review_results' | 'explain_drawdown' | 'what_stands_out';
export type AskCovaStyle = 'plain' | 'warm' | 'direct';
export const ASK_COVA_QUESTIONS: { id: AskCovaQuestion; label: string }[] = [
  { id: 'review_results', label: 'Review my results' },
  { id: 'explain_drawdown', label: 'Explain my drawdown' },
  { id: 'what_stands_out', label: 'What stands out?' },
];
export type AskCovaCatalog = {
  contextDigest: string;
  question: AskCovaQuestion;
  candidates: { id: string; variants: Record<AskCovaStyle, string>; detail: string; tradeIds: string[] }[];
  tradeIds: string[];
  start: string | null;
  end: string | null;
};
type Candidate = AskCovaCatalog['candidates'][number];
type Input = { ownerId: string; account: string; range: 'today' | 'week' | 'all'; question: AskCovaQuestion; trades: readonly Trade[] };
function candidate(id: string, plain: string, warm: string, direct: string, detail: string, tradeIds: string[] = []): Candidate {
  const fits = (text: string, words: number, characters: number) => text.length > 0 && text.length <= characters && text.trim().split(/\s+/).length <= words;
  if (![plain, warm, direct].every(text => fits(text, 35, 600)) || !fits(detail, 80, 1600)) throw new Error('Engine copy bound exceeded');
  return { id, variants: { plain, warm, direct }, detail, tradeIds: [...tradeIds] };
}
const QUESTIONS = ['review_results', 'explain_drawdown', 'what_stands_out'] as const;
const boundedText = (value: unknown, max = 256): value is string => typeof value === 'string' && value.length <= max && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
// Same supported USD Tradovate market predicate as journalAccuracy; never infer CSV currency.
const USD_FUTURES = new Set(['NQ','MNQ','ES','MES','YM','MYM','RTY','M2K','CL','MCL','GC','MGC','SI','SIL','HG','ZB','ZN','ZF','ZT']);
// Deliberately bounded supported source currencies, not a guessed ticker mapping.
const CURRENCIES = new Set(['USD','EUR','GBP','CAD','AUD','CHF','NZD','SGD','HKD','JPY']);
function currency(row: Trade): string | null {
  if (row.manual && !row.source) return row.manual.currency === 'USD' ? 'USD' : null;
  if (row.source?.provider === 'Rithmic') return CURRENCIES.has(row.source.currency) ? row.source.currency : null;
  return row.source?.provider === 'Tradovate' && row.source.pnlBasis === 'gross_before_fees' && USD_FUTURES.has(row.market) ? 'USD' : null;
}
function basis(row: Trade): string {
  if (row.manual && !row.source && row.manual.pnlBasis === 'reported_net') return 'self-reported net';
  if (row.manual?.pnlBasis === 'gross_before_fees' || (row.source?.provider === 'Tradovate' && row.source.pnlBasis === 'gross_before_fees')) return 'gross, before fees';
  return 'reported P&L, fees unknown';
}
function money(value: bigint, code: string): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '−' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')} ${code}`;
}
const IMPORT_CAVEAT = 'Trade records can include grouped entries or partial closes; they do not prove completed positions. This is not reconciled broker daily cash or allocated account fees.';
function closeInstant(raw: unknown, date: string): bigint | null {
  if (typeof raw !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(raw);
  if (!match || !validDate(match[1]) || +match[2] > 23 || +match[3] > 59 || +(match[4] ?? 0) > 59) return null;
  const zone = match[6];
  if (zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59)) return null;
  const millis = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4] ?? '00'}${zone}`);
  if (!Number.isFinite(millis) || new Date(millis).toISOString().slice(0, 10) !== date) return null;
  return BigInt(millis) * 1000000n + BigInt((match[5] ?? '').padEnd(9, '0'));
}
function chronological(rows: Trade[]): Trade[] | null {
  const groups = new Map<string, { row: Trade; at: bigint | null }[]>();
  for (const row of rows) {
    const raw = row.source?.provider === 'Tradovate' ? row.source.closedAt : undefined;
    const at = raw === undefined ? null : closeInstant(raw, row.date);
    if (raw !== undefined && at === null) return null;
    const group = groups.get(row.date) ?? [];
    group.push({ row, at }); groups.set(row.date, group);
  }
  const ordered: Trade[] = [];
  for (const date of [...groups.keys()].sort()) {
    const group = groups.get(date)!;
    if (group.length > 1 && (group.some(item => item.at === null) || new Set(group.map(item => item.at)).size !== group.length)) return null;
    // IDs are for identity only, NEVER a chronological tie-breaker.
    group.sort((a, b) => a.at === b.at ? 0 : a.at! < b.at! ? -1 : 1);
    ordered.push(...group.map(item => item.row));
  }
  return ordered;
}
function compile(rows: Trade[], question: AskCovaQuestion): Candidate[] {
  const ids = rows.map(row => row.id);
  const unavailable = (id: string, text: string, detail: string) => [candidate(id, text, text, text, detail, ids)];
  if (!rows.length) return [candidate('empty', "There's nothing to review in this range yet. Log or import a completed trade to get started.",
    'Nothing to review here yet. Log or import a completed trade, and we can take a look.',
    'Log or import a completed trade to review your results here.',
    'No trade records match this account and date range.')];
  const currencies = new Set(rows.map(currency));
  if (currencies.has(null)) return unavailable('unknown_currency', "I can't combine these results yet. Their currencies aren't all supported or confirmed.", 'Currency must be confirmed by the source, not guessed from a ticker. No exact total or drawdown is available until every currency is supported and confirmed.');
  if (currencies.size !== 1) return unavailable('mixed_currencies', "These results use different currencies, so there isn't one combined result to report.", 'The currencies need to stay separate. No exchange rates are available for a combined total or drawdown.');
  let total: bigint;
  try {
    if (rows.some(row => typeof row.pnl !== 'number' || !Number.isFinite(row.pnl))) throw new Error('Invalid money');
    total = sumCents(rows.map(row => row.pnl));
  } catch {
    return unavailable('invalid_money', "Some P&L is missing or invalid, so I can't give you a complete result yet.", 'Every trade record needs valid P&L in whole cents within the supported money range. Missing values are not zero; leaving them out could change the total or drawdown.');
  }
  const bases = new Set(rows.map(basis));
  const qualifier = bases.size === 1 ? basis(rows[0]) : 'mixed reported bases, fees not reconciled';
  const caveat = rows.some(row => row.source) ? IMPORT_CAVEAT : 'Manual results are self-reported.';
  if (question === 'explain_drawdown') {
    const ordered = chronological(rows);
    if (!ordered) return unavailable('ambiguous_chronology', "I can't trace the drawdown yet. The closing times don't establish a reliable order.", 'Same-day trade records need distinct closing times with a timezone, matching their UTC dates. Invalid, tied or missing times leave the order unclear.');
    let running = 0n, peak = 0n, maximum = 0n;
    let maximumPeak = 0n, maximumTrough = 0n;
    for (const row of ordered) {
      running += cents(row.pnl);
      if (running > peak) peak = running;
      const decline = peak - running;
      if (decline > maximum) { maximum = decline; maximumPeak = peak; maximumTrough = running; }
      if (running > BigInt(Number.MAX_SAFE_INTEGER) || running < -BigInt(Number.MAX_SAFE_INTEGER) || maximum > BigInt(Number.MAX_SAFE_INTEGER)) return unavailable('invalid_money', "These amounts are beyond what I can safely calculate, so I can't give an exact drawdown.", 'A running total or peak-to-trough decline exceeds the supported money range. An approximate result would not be reliable.');
    }
    const decline = money(maximum, currency(rows[0])!);
    const path = maximum === 0n ? 'The running result never fell below an earlier peak.'
      : `The running result fell from ${money(maximumPeak, currency(rows[0])!)} to ${money(maximumTrough, currency(rows[0])!)}.`;
    return [candidate('drawdown',
      maximum === 0n ? `There was no drawdown between reported results: ${decline} (${qualifier}).` : `Your biggest dip was ${decline} (${qualifier}), measured between reported results.`,
      maximum === 0n ? `No dip between these results. Drawdown was ${decline} (${qualifier}).` : `The biggest dip was ${decline} (${qualifier}). That's how far your running result fell from an earlier peak.`,
      maximum === 0n ? `No drawdown between reported results: ${decline} (${qualifier}).` : `Your running result fell ${decline} from peak to trough (${qualifier}).`,
      `${path} Maximum decline: ${decline} (${qualifier}). The calculation starts at an initial zero before this range, not at your account balance. It excludes price changes while trades were open. ${caveat}`, ids)];
  }
  const amount = money(total, currency(rows[0])!);
  const detail = `Reported P&L is ${amount} (${qualifier}). ${caveat}`;
  const outcome = total === 0n ? 'flat' : total > 0n ? 'green' : 'red';
  const items = [candidate('result', `You finished ${outcome}: ${amount} (${qualifier}).`,
    total === 0n ? `No gain or loss overall: ${amount} (${qualifier}).` : `You ended this stretch in the ${outcome}, at ${amount} (${qualifier}).`,
    `Your result was ${amount} (${qualifier}).`, detail, ids)];
  if (question === 'what_stands_out' && total < 0n && rows.some(row => row.pnl > 0)) {
    items.unshift(candidate('losses_outweigh_gains', `Your losses outweighed your gains (${qualifier}).`,
      `The gains didn't cover the losses this time (${qualifier}).`,
      `You lost more than you gained (${qualifier}).`, detail, ids));
  }
  const missingRisk = rows.filter(row => {
    try { return row.riskStatus === 'missing' || typeof row.risk !== 'number' || cents(row.risk) <= 0n; }
    catch { return true; }
  });
  if (missingRisk.length) items.push(candidate('missing_risk', "Some trades have no usable planned risk, so a full risk comparison isn't available.",
    'The risk comparison has gaps. Some planned-risk amounts are missing or invalid.',
    "Missing or invalid planned risk means I can't compare all results against it.",
    'Some trade records lack a usable positive planned-risk amount. P&L cannot substitute for planned risk. Their P&L still counts toward the result.', missingRisk.map(row => row.id)));
  return items;
}

// Whitelist financial fields; never serialize a raw Trade or annotations.
function scalar(value: unknown): unknown {
  if (value === undefined) return { unavailable: 'undefined' };
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : { invalidNumber: String(value) };
  if (typeof value === 'string' && value.length <= 256) return value;
  throw new Error('Invalid financial evidence field');
}
function financialEvidence(row: Trade) {
  return { id: row.id, date: row.date, account: getTradeAccountKey(row),
    market: scalar(row.market), side: scalar(row.side), contracts: scalar(row.contracts), entry: scalar(row.entry), exit: scalar(row.exit),
    pnl: scalar(row.pnl), risk: scalar(row.risk), riskStatus: scalar(row.riskStatus),
    manual: row.manual ? { accountKey: row.manual.accountKey, currency: scalar(row.manual.currency), pnlBasis: scalar(row.manual.pnlBasis) } : null,
    source: row.source?.provider === 'Rithmic'
      ? { provider: 'Rithmic', accountKey: row.source.accountKey, accountId: row.source.accountId, currency: scalar(row.source.currency) }
      : row.source ? { provider: 'Tradovate', accountId: row.source.accountId, openedAt: scalar(row.source.openedAt), closedAt: scalar(row.source.closedAt), timeZone: scalar(row.source.timeZone), pnlBasis: scalar(row.source.pnlBasis) } : null,
  };
}

// Catalogs are process-local capabilities, not client-authored documents.
const issuedCatalogs = new WeakSet<AskCovaCatalog>();
const STYLES: AskCovaStyle[] = ['plain', 'warm', 'direct'];

export async function buildAskCovaCatalog(input: Input): Promise<AskCovaCatalog> {
  if (!input || !boundedText(input.ownerId) || !boundedText(input.account) || !QUESTIONS.includes(input.question) || !['today', 'week', 'all'].includes(input.range) || !Array.isArray(input.trades) || input.trades.length > 10000) throw new Error('Invalid scope or row limit');
  // Structural identity is never coerced or repaired, including excluded rows.
  for (const row of input.trades) {
    if (!row || !boundedText(row.id) || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(row.id) || (row.manual && row.source)) throw new Error('Invalid or ambiguous row identity');
    if (row.source && (!['Tradovate', 'Rithmic'].includes(row.source.provider) || !boundedText(row.source.accountId))) throw new Error('Invalid source account');
    if (row.source?.provider === 'Rithmic' && !boundedText(row.source.accountKey)) throw new Error('Invalid source account');
    if (row.manual && !boundedText(row.manual.accountKey)) throw new Error('Invalid manual account');
  }
  // Match DashboardView: today is latest recorded date, week is seven calendar dates.
  const accountRows = filterTradeAccount([...input.trades], input.account);
  if (accountRows.some(row => !validDate(row.date))) throw new Error('Invalid recorded date');
  const dates = accountRows.map(row => row.date).sort();
  const end = dates[dates.length - 1] ?? null;
  const start = end === null ? null : input.range === 'all' ? dates[0] : input.range === 'today' ? end
    : new Date(Date.parse(`${end}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
  const rows = accountRows.filter(row => start !== null && end !== null && row.date >= start && row.date <= end)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const tradeIds = rows.map(row => row.id);
  if (new Set(tradeIds).size !== tradeIds.length) throw new Error('Duplicate scoped row identity');
  const candidates = compile(rows, input.question);
  const evidence = rows.map(financialEvidence);
  const binding = JSON.stringify({ version: 'ask-cova-core-v1', owner: input.ownerId, account: input.account, range: input.range, question: input.question, start, end, evidence, candidates });
  const question = input.question;
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(binding));
  const contextDigest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const catalog: AskCovaCatalog = { contextDigest, question, candidates, tradeIds, start, end };
  for (const item of candidates) { Object.freeze(item.variants); Object.freeze(item.tradeIds); Object.freeze(item); }
  Object.freeze(candidates); Object.freeze(tradeIds); Object.freeze(catalog);
  issuedCatalogs.add(catalog);
  return catalog;
}

/** Minimal selector input. Provider/model configuration belongs to the server. */
export function askCovaModelPayload(catalog: AskCovaCatalog): unknown {
  if (!issuedCatalogs.has(catalog)) throw new Error('Invalid engine catalog');
  const choices = catalog.candidates.map(item => ({ id: item.id, variants: { ...item.variants } }));
  const payload = { choices };
  if (choices.length < 1 || choices.length > 3 || new TextEncoder().encode(JSON.stringify(payload)).byteLength > 8192) throw new Error('Invalid catalog payload bound');
  return payload;
}

/** Rebuild and compare contextDigest before accepting in-flight/cached selections or actions.
 * A selection intentionally contains no context key; the caller owns the request epoch.
 * This digest binds evidence, not authentication. ownerId must come from trusted auth.
 */
export function renderAskCovaSelection(catalog: AskCovaCatalog, selection: unknown): { answer: string; detail: string; tradeIds: string[]; choiceId: string; style: AskCovaStyle } | null {
  try {
    if (!issuedCatalogs.has(catalog) || !selection || typeof selection !== 'object' || Array.isArray(selection)) return null;
    const prototype = Object.getPrototypeOf(selection);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(selection);
    if (keys.length !== 2 || !keys.includes('choice_id') || !keys.includes('style')) return null;
    const choice = Object.getOwnPropertyDescriptor(selection, 'choice_id');
    const style = Object.getOwnPropertyDescriptor(selection, 'style');
    if (!choice || !style || !('value' in choice) || !('value' in style) || typeof choice.value !== 'string' || !STYLES.includes(style.value)) return null;
    const item = catalog.candidates.find(item => item.id === choice.value);
    if (!item) return null;
    const selectedStyle = style.value as AskCovaStyle;
    return { answer: item.variants[selectedStyle], detail: item.detail, tradeIds: [...item.tradeIds], choiceId: item.id, style: selectedStyle };
  } catch { return null; }
}
