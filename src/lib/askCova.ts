import type { Trade } from './risk';
import { parseAskCovaAnswer, tokenizeAskCovaParagraph, type AskCovaFactPacket } from './askCovaVoice';
import { insightReview, insightComparisons, insightSubset, validatedSetup, sumAskCovaMoney } from './askCovaInsights';
import { cents } from './journalAccuracy';
import { filterTradeAccount, tradeAccountKey as getTradeAccountKey } from './tradovateHistory';

export const ASK_COVA_QUESTION_IDS = Object.freeze(['review_results', 'explain_drawdown', 'what_stands_out', 'holding_time', 'setup_performance', 'time_of_day', 'long_vs_short'] as const);
export type AskCovaQuestion = typeof ASK_COVA_QUESTION_IDS[number];
export function isAskCovaQuestion(value: unknown): value is AskCovaQuestion {
  return typeof value === 'string' && (ASK_COVA_QUESTION_IDS as readonly string[]).includes(value);
}
export type AskCovaStyle = 'plain' | 'warm' | 'direct';
export const ASK_COVA_QUESTIONS: { id: AskCovaQuestion; label: string }[] = [
  { id: 'review_results', label: 'Review my results' },
  { id: 'explain_drawdown', label: 'Explain my drawdown' },
  { id: 'what_stands_out', label: 'What stands out?' },
];
export type AskCovaCatalog = {
  contextDigest: string;
  question: AskCovaQuestion;
  /** Legacy financial regression scaffolding; never provider input or live rendered copy. */
  candidates: { id: string; variants: Record<AskCovaStyle, string>; detail: string; tradeIds: string[] }[];
  tradeIds: string[];
  start: string | null;
  end: string | null;
};
type Candidate = AskCovaCatalog['candidates'][number];
type Variants = Record<AskCovaStyle, string>;
const providerVariants = new WeakMap<Candidate, Variants>();
const drawdownMirrors = new WeakMap<Candidate, {maximum:bigint; peak:bigint; trough:bigint; code:string; basis:string}>();
type Input = { ownerId: string; account: string; range: 'today' | 'week' | 'all'; question: AskCovaQuestion; trades: readonly Trade[] };
function candidate(id: string, plain: string, warm: string, direct: string, detail: string, tradeIds: string[] = [], safe: Variants = { plain, warm, direct }): Candidate {
  const fits = (text: string, words: number, characters: number) => text.length > 0 && text.length <= characters && text.trim().split(/\s+/).length <= words;
  if (![plain, warm, direct, ...Object.values(safe)].every(text => fits(text, 140, 2000)) || !fits(detail, 700, 7000)) throw new Error('Engine copy bound exceeded');
  const item = { id, variants: { plain, warm, direct }, detail, tradeIds: [...tradeIds] };
  providerVariants.set(item, Object.freeze({ ...safe }));
  return item;
}
const QUESTIONS = ASK_COVA_QUESTION_IDS;
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
  const specific = ['holding_time', 'setup_performance', 'time_of_day', 'long_vs_short'].includes(question);
  const unavailable = (id: string, text: string, detail: string) => {
    if (question !== 'explain_drawdown') {
      const subset = insightSubset(rows, { currency, basis });
      if (subset) {
        const review = subset.review;
        const comparisons = insightComparisons(rows, question, { currency, basis });
        const partialSummary = `${text} Valid subset P&L: ${money(subset.total, subset.code)} (${subset.basis}). ${review.metrics}`;
        const answerFor = (observation: string | null) => specific && observation
          ? `${observation}${observation.startsWith('No usable') ? ` ${partialSummary}` : ''}`
          : `${partialSummary} ${observation ?? review.observation}`;
        const answer = answerFor(comparisons.observation), safeAnswer = answerFor(comparisons.providerObservation);
        return [candidate(id, answer, answer, answer, `${detail} ${partialSummary} ${subset.coverage} ${review.definitions} ${comparisons.detail}`, ids, { plain: safeAnswer, warm: safeAnswer, direct: safeAnswer })];
      }
    }
    return [candidate(id, text, text, text, detail, ids)];
  };
  if (!rows.length) return [candidate('empty', "There's nothing to review in this range yet. Log or import a completed trade to get started.",
    'Nothing to review here yet. Log or import a completed trade, and we can take a look.',
    'Log or import a completed trade to review your results here.',
    'No trade records match this account and date range.')];
  const currencies = new Set(rows.map(currency));
  if (currencies.has(null)) return unavailable('unknown_currency', "I can't combine these results yet. Their currencies aren't all supported or confirmed.", 'Currency must be confirmed by the source, not guessed from a ticker. No exact total or drawdown is available until every currency is supported and confirmed.');
  if (currencies.size !== 1) return unavailable('mixed_currencies', "These results use different currencies, so there isn't one combined result to report.", 'The currencies need to stay separate. No exchange rates are available for a combined total or drawdown.');
  let total: bigint;
  try {
    total = sumAskCovaMoney(rows.map(row => row.pnl));
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
    const item = candidate('drawdown',
      maximum === 0n ? `There was no drawdown between reported results: ${decline} (${qualifier}).` : `Your biggest dip was ${decline} (${qualifier}), measured between reported results.`,
      maximum === 0n ? `No dip between these results. Drawdown was ${decline} (${qualifier}).` : `The biggest dip was ${decline} (${qualifier}). That's how far your running result fell from an earlier peak.`,
      maximum === 0n ? `No drawdown between reported results: ${decline} (${qualifier}).` : `Your running result fell ${decline} from peak to trough (${qualifier}).`,
      `${path} Maximum decline: ${decline} (${qualifier}). The calculation starts at an initial zero before this range, not at your account balance. It excludes price changes while trades were open. ${caveat}`, ids);
    drawdownMirrors.set(item,{maximum,peak:maximumPeak,trough:maximumTrough,code:currency(rows[0])!,basis:qualifier});
    return [item];
  }
  const amount = money(total, currency(rows[0])!);
  const review = insightReview(rows, currency(rows[0])!);
  const comparisons = insightComparisons(rows, question, { currency, basis });
  const detail = `Reported P&L is ${amount} (${qualifier}). ${review.metrics} ${review.definitions} ${comparisons.detail} ${caveat}`;
  if (specific && comparisons.observation && comparisons.providerObservation) {
    const answerFor = (observation: string) => `${observation}${observation.startsWith('No usable') ? ` Reported P&L: ${amount} (${qualifier}). ${review.metrics}` : ''}`;
    const answer = answerFor(comparisons.observation), safeAnswer = answerFor(comparisons.providerObservation);
    return [candidate('result', answer, answer, answer, detail, ids, { plain: safeAnswer, warm: safeAnswer, direct: safeAnswer })];
  }
  const outcome = total === 0n ? 'flat' : total > 0n ? 'green' : 'red';
  const body = `${review.metrics} ${comparisons.observation ?? review.observation}`;
  const safeBody = `${review.metrics} ${comparisons.providerObservation ?? review.observation}`;
  return [candidate(question === 'what_stands_out' && total < 0n && rows.some(row => row.pnl > 0) ? 'losses_outweigh_gains' : 'result',
    `You finished ${outcome}: ${amount} (${qualifier}). ${body}`,
    `You ended this stretch ${outcome}: ${amount} (${qualifier}). ${body}`,
    `Your result was ${amount} (${qualifier}). ${body}`, detail, ids, {
      plain: `You finished ${outcome}: ${amount} (${qualifier}). ${safeBody}`,
      warm: `You ended this stretch ${outcome}: ${amount} (${qualifier}). ${safeBody}`,
      direct: `Your result was ${amount} (${qualifier}). ${safeBody}`,
    })];
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
    setup: validatedSetup(row), pnl: scalar(row.pnl), risk: scalar(row.risk), riskStatus: scalar(row.riskStatus),
    manual: row.manual ? { accountKey: row.manual.accountKey, currency: scalar(row.manual.currency), pnlBasis: scalar(row.manual.pnlBasis) } : null,
    source: row.source?.provider === 'Rithmic'
      ? { provider: 'Rithmic', accountKey: row.source.accountKey, accountId: row.source.accountId, currency: scalar(row.source.currency) }
      : row.source ? { provider: 'Tradovate', accountId: row.source.accountId, openedAt: scalar(row.source.openedAt), closedAt: scalar(row.source.closedAt), timeZone: scalar(row.source.timeZone), pnlBasis: scalar(row.source.pnlBasis) } : null,
  };
}

// Catalogs are process-local capabilities, not client-authored documents.
const issuedCatalogs = new WeakSet<AskCovaCatalog>();
type VoiceAuthority = { packet: AskCovaFactPacket; supports: Record<string, string[]>; aliases: Record<string, string>; notices: string[] };
const voiceAuthorities = new WeakMap<AskCovaCatalog, VoiceAuthority>();
function basisNotices(value: string): string[] {
  return value==='self-reported net'?[]:[value==='gross, before fees'?'Gross, before fees.':'Fees not reconciled.'];
}
function voiceFacts(rows: Trade[], question: AskCovaQuestion, compiled: Candidate): VoiceAuthority {
  const packet: AskCovaFactPacket = {version:'ask-cova-facts-v1',question,scope:'selected_range',facts:[],categories:[],coverage:[],observations:[],requiredAnswerEvidence:[]};
  const unavailable = (): VoiceAuthority => {
    packet.observations.push({id:'availability',kind:'availability',facts:[],categories:[],coverage:[],predicates:[compiled.id]});packet.requiredAnswerEvidence=['availability'];
    return {packet,supports:{availability:rows.map(r=>r.id)},aliases:{},notices:[]};
  };
  if (!rows.length) return unavailable();
  const drawdown = drawdownMirrors.get(compiled);
  if (question==='explain_drawdown') {
    if (!drawdown) return unavailable();
    const count=insightReview(rows,drawdown.code).stats.count;
    packet.coverage.push({id:'full',kind:'full_scope',totalGroups:count,usableGroups:count,sampleGroups:count,describedGroups:count,matched:null});
    for (const [id,value] of [['drawdown',drawdown.maximum],['drawdown_peak',drawdown.peak],['drawdown_trough',drawdown.trough]] as const) packet.facts.push({id,kind:'money',value:money(value,drawdown.code).split(' ')[0].replace('−','-'),display:money(value,drawdown.code),currency:drawdown.code,basis:drawdown.basis,coverage:'full'});
    packet.observations.push({id:'drawdown',kind:'drawdown',facts:packet.facts.map(f=>f.id),categories:[],coverage:['full'],predicates:['initial_zero_not_balance','reported_results_not_intratrade',drawdown.maximum===0n?'no_decline':'peak_to_trough_decline']});packet.requiredAnswerEvidence=['drawdown'];
    return {packet,supports:{drawdown:rows.map(r=>r.id)},aliases:{},notices:basisNotices(drawdown.basis)};
  }
  const partial = !['result','losses_outweigh_gains'].includes(compiled.id);
  const subset = partial ? insightSubset(rows,{currency,basis}) : null;
  if (partial && !subset) return unavailable();
  const code = subset?.code ?? currency(rows[0])!;
  const stats = subset?.review.stats ?? insightReview(rows,code).stats;
  const bases = new Set(rows.map(basis));
  const reportedBasis = subset?.basis ?? (bases.size===1?basis(rows[0]):'mixed reported bases, fees not reconciled');
  const total = subset?.total ?? sumAskCovaMoney(rows.map(row=>row.pnl));
  const support = subset?.support ?? rows.map(r=>r.id);
  packet.coverage.push({id:'full',kind:partial?'valid_subset':'full_scope',totalGroups:subset?.totalGroups ?? stats.count,usableGroups:stats.count,sampleGroups:stats.count,describedGroups:stats.count,matched:null});
  packet.facts.push(
    {id:'net',kind:'money',value:money(total,code).split(' ')[0].replace('−','-'),display:money(total,code),currency:code,basis:reportedBasis,coverage:'full'},
    {id:'win_rate',kind:'percent',value:stats.winRate,display:stats.winRate+'%',currency:null,basis:reportedBasis,coverage:'full'},
    {id:'profit_factor',kind:'ratio',value:stats.loss ? stats.profitFactor : null,display:stats.profitFactor,currency:null,basis:reportedBasis,coverage:'full'});
  packet.observations.push({id:'overall',kind:'result',facts:['net'],categories:[],coverage:['full'],predicates:[total>0n?'positive_reported_result':total<0n?'negative_reported_result':'flat_reported_result']},
    {id:'payoff',kind:'review',facts:['win_rate','profit_factor'],categories:[],coverage:['full'],predicates:[stats.profit>stats.loss?'gains_exceed_losses':stats.profit<stats.loss?'losses_exceed_gains':'gains_equal_losses']});
  for (const [id,value] of [['group_count',stats.count],['wins',stats.wins],['losses',stats.losses],['breakevens',stats.breakeven]] as const) packet.facts.push({id,kind:'count',value:String(value),display:String(value),currency:null,basis:reportedBasis,coverage:'full'});
  for (const [id,value] of [['mean_win',stats.meanWin],['mean_loss',stats.meanLoss]] as const) if(value!==null) packet.facts.push({id,kind:'money',value:value.replace('−','-'),display:value+' '+code,currency:code,basis:reportedBasis,coverage:'full'});
  packet.observations[1].facts.push(...packet.facts.slice(3).map(f=>f.id));
  packet.observations[1].predicates.push(stats.loss===0n?'profit_factor_undefined_no_losses':'profit_factor_defined','win_rate_includes_breakevens');
  packet.requiredAnswerEvidence=['overall','payoff'];
  const authority: VoiceAuthority = {packet,supports:{overall:support,payoff:support},aliases:{},notices:[...(partial?['Valid subset only.']:[]),...basisNotices(reportedBasis)]};
  const comparisons = insightComparisons(rows,question,{currency,basis});
  const absent=!!comparisons.selected && !comparisons.selected.categories.length;
  const comparison = absent ? comparisons.alternative : comparisons.selected;
  if (comparison?.categories.length) {
    const categories = comparison.categories;
    packet.coverage.push({id:'comparison',kind:'comparison_subset',totalGroups:comparison.total,usableGroups:comparison.usable,sampleGroups:comparison.sample,describedGroups:comparison.described,matched:comparison.matched});
    const facts: string[] = [], categoryIds: string[] = [];
    for (const [index,c] of categories.entries()) {
      const suffix=index===0?'a':'b', id='category_'+suffix;
      categoryIds.push(id); authority.aliases[id]=c.label;
      packet.categories.push({id,description:comparison.privateLabels ? 'Category '+suffix.toUpperCase() : c.label});
      for (const [name,value,kind] of [['mean',c.mean,'money'],['count',String(c.count),'count']] as const) {
        const id=name+'_'+suffix; facts.push(id);
        packet.facts.push({id,kind,value:value.replace('−','-'),display:kind==='money'?value+' '+comparison.code:value,currency:kind==='money'?comparison.code:null,basis:comparison.basis,coverage:'comparison'});
      }
    }
    if (comparison.gap!==null) { facts.push('mean_gap'); packet.facts.push({id:'mean_gap',kind:'money',value:comparison.gap.replace('−','-'),display:comparison.gap+' '+comparison.code,currency:comparison.code,basis:comparison.basis,coverage:'comparison'}); }
    for (const [id,value] of [['compared_count',comparison.sample],['usable_count',comparison.usable],['described_count',comparison.described],['comparison_total',comparison.total]] as const) {
      facts.push(id);packet.facts.push({id,kind:'count',value:String(value),display:String(value),currency:null,basis:null,coverage:'comparison'});
    }
    const predicates=['descriptive_not_edge',comparison.matched?'matched_market_size_account':'unmatched_groups',comparison.tied?'means_tie':categories.length>1?'category_a_mean_higher':'one_category_only'];
    if (comparison.sample<comparison.total) {predicates.push('comparison_partial');authority.notices.push('Comparison uses part of this range.');}
    if (comparison.described<comparison.sample) {predicates.push('top_categories_only');authority.notices.push('Only the leading categories are described.');}
    if (categories.length===2 && categories.every(c=>c.sign==='negative')) predicates.push('both_means_negative');
    predicates.push(...categories.map((c,i)=>'category_'+(i===0?'a':'b')+'_mean_'+c.sign));
    if(comparison.dimension==='Holding time' && comparisons.thresholdMinutes!==null) {facts.push('span_split_minutes');packet.facts.push({id:'span_split_minutes',kind:'duration',value:comparisons.thresholdMinutes,display:comparisons.thresholdMinutes+' minutes',currency:null,basis:null,coverage:'comparison'});predicates.push('observed_source_span_not_position','shorter_includes_median_longer_above');}
    if(comparison.dimension==='Entry time') predicates.push('entry_clock_america_new_york_dst','earliest_verified_source_entry');
    packet.observations.push({id:'comparison',kind:comparison.dimension.toLowerCase().replace(/ /g,'_'),facts,categories:categoryIds,coverage:['comparison'],predicates});
    authority.supports.comparison=rows.map(r=>r.id);
    packet.requiredAnswerEvidence=['holding_time','setup_performance','time_of_day','long_vs_short'].includes(question)?['comparison']:['overall','payoff','comparison'];
  }
  if(absent) {packet.observations.push({id:'dimension_availability',kind:'availability',facts:[],categories:[],coverage:[],predicates:['no_usable_'+question]});authority.supports.dimension_availability=[];packet.requiredAnswerEvidence.push('dimension_availability');}
  return authority;
}
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
  const safeChoices = candidates.map(item => Object.freeze({ id: item.id, variants: providerVariants.get(item)! }));
  const evidence = rows.map(financialEvidence);
  const voice = voiceFacts(rows, input.question, candidates[0]);
  const binding = JSON.stringify({ version: 'ask-cova-core-v2', owner: input.ownerId, account: input.account, range: input.range, question: input.question, start, end, evidence, candidates, safeChoices, voice });
  const question = input.question;
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(binding));
  const contextDigest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const catalog: AskCovaCatalog = { contextDigest, question, candidates, tradeIds, start, end };
  for (const item of candidates) { Object.freeze(item.variants); Object.freeze(item.tradeIds); Object.freeze(item); }
  Object.freeze(candidates); Object.freeze(tradeIds); Object.freeze(catalog);
  issuedCatalogs.add(catalog);
  const freeze = (value: unknown): void => { if(value && typeof value==='object') { for(const child of Object.values(value)) freeze(child); Object.freeze(value); } };
  freeze(voice);
  voiceAuthorities.set(catalog, voice);
  return catalog;
}

/** Explicit provider-safe fact allowlist. No legacy phrases, labels or scope identities. */
export function askCovaModelPayload(catalog: AskCovaCatalog): AskCovaFactPacket {
  if (!issuedCatalogs.has(catalog)) throw new Error('Invalid engine catalog');
  const packet=voiceAuthorities.get(catalog)!.packet;
  if(packet.facts.length>24 || packet.observations.length>8 || packet.coverage.length>3 || packet.categories.length>2 || new TextEncoder().encode(JSON.stringify(packet)).byteLength>8192) throw Error('Invalid packet bound');
  return structuredClone(packet);
}

export function renderAskCovaAnswer(catalog: AskCovaCatalog, value: unknown): { paragraphs: string[]; detail: string[]; scopeNotices: string[]; tradeIds: string[]; contextDigest: string } | null {
  const authority = voiceAuthorities.get(catalog), answer = parseAskCovaAnswer(value);
  if (!authority || !answer) return null;
  const cited = new Set(answer.paragraphs.flatMap(p=>p.evidence));
  if (authority.packet.requiredAnswerEvidence.some(id=>!cited.has(id))) return null;
  try {
    const render = (paragraph: typeof answer.paragraphs[number], detail: boolean) => {
      const observations = paragraph.evidence.map(id=>authority.packet.observations.find(o=>o.id===id));
      if (observations.some(o=>!o) || detail && paragraph.evidence.some(id=>!cited.has(id))) throw Error('Invalid evidence');
      return tokenizeAskCovaParagraph(paragraph.text)!.map(node=>{
        if (node.kind==='text') return node.text;
        if (node.kind==='fact' && observations.some(o=>o!.facts.includes(node.id))) { const fact=authority.packet.facts.find(f=>f.id===node.id); if(fact) return fact.display; }
        if (node.kind==='category' && observations.some(o=>o!.categories.includes(node.id)) && Object.prototype.hasOwnProperty.call(authority.aliases,node.id)) return authority.aliases[node.id];
        throw Error('Unissued atom');
      }).join('');
    };
    const paragraphs=answer.paragraphs.map(p=>render(p,false)), detail=answer.detail.map(p=>render(p,true));
    const words=(parts:string[])=>parts.join(' ').trim().split(/\s+/).length;
    if(words(paragraphs)>160 || words(detail)>80 || [...paragraphs,...detail].join('').length>4800) return null;
    const scopeNotices=new Set<string>();
    const references=authority.packet.observations.filter(o=>cited.has(o.id));
    for(const coverage of authority.packet.coverage.filter(c=>references.some(o=>o.coverage.includes(c.id)))) {
      if(coverage.kind==='valid_subset') scopeNotices.add('Valid subset only.');
      if(coverage.kind==='comparison_subset' && coverage.sampleGroups<coverage.totalGroups) scopeNotices.add('Comparison uses part of this range.');
      if(coverage.describedGroups<coverage.sampleGroups) scopeNotices.add('Only the leading categories are described.');
      for(const fact of authority.packet.facts.filter(f=>f.coverage===coverage.id && f.basis && references.some(o=>o.facts.includes(f.id)))) for(const notice of basisNotices(fact.basis!)) scopeNotices.add(notice);
    }
    return {paragraphs,detail,scopeNotices:[...scopeNotices],tradeIds:[...new Set([...cited].flatMap(id=>authority.supports[id]))].filter(id=>catalog.tradeIds.includes(id)),contextDigest:catalog.contextDigest};
  } catch { return null; }
}

/** Legacy regression oracle ONLY; no server/client/component caller accepts selections.
 * Retained to independently preserve existing financial/string oracles during v3 migration.
 * Rebuild and compare contextDigest before accepting in-flight/cached selections or actions.
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
