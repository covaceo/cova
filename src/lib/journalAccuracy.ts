import type { RiskRule, Trade } from './risk';

// USD futures supported by the existing Performance parser. Unknown instruments stay gated.
export function journalReviewEnabled() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('journalReview') === '1';
}
const USD_FUTURES = new Set(['NQ','MNQ','ES','MES','YM','MYM','RTY','M2K','CL','MCL','GC','MGC','SI','SIL','HG','ZB','ZN','ZF','ZT']);
function isUsd(row: Trade) {
  if (row.manual && !row.source) return row.manual.currency === "USD";
  return row.source?.provider === 'Rithmic' ? row.source.currency === 'USD'
    : row.source?.provider === 'Tradovate' && row.source.pnlBasis === 'gross_before_fees' && USD_FUTURES.has(row.market);
}


export function rowMoneyText(trade: Trade, amount: number): string {
  try {
    const text = moneyText(cents(amount));
    if (isUsd(trade)) return text;
    return `${text.replace('$', '')} (${trade.source?.provider === 'Rithmic' ? trade.source.currency : 'currency unknown'})`;
  } catch { return 'Unavailable (invalid money)'; }
}

export type DisciplineStatus = 'unconfigured' | 'not applicable' | 'insufficient evidence' | 'within configured limits' | 'breach detected';
export type JudgmentV1 = {
  ruleId: string; label: string; status: DisciplineStatus; observed: number | bigint | null; threshold: number;
  rowIds: string[]; groupIds: string[]; coverage: { checked: number; total: number; unit: 'rows' | 'groups' }; reason: string;
};
export function disciplineReview(rules: readonly RiskRule[], completed: CompletedMetricsV1, rowIds: readonly string[], rawTrades: readonly Trade[] = []) {
  const judgments: JudgmentV1[] = rules.filter(rule => rule.enabled).map(rule => {
    const base: JudgmentV1 = { ruleId: rule.id, label: rule.name, status: 'insufficient evidence', observed: null, threshold: rule.limit,
      rowIds: [...rowIds], groupIds: [], coverage: { checked: 0, total: rowIds.length, unit: 'rows' },
      reason: completed.status === 'unavailable' ? completed.reason : 'Required rule evidence not available' };
    if (rule.metric === 'minProfitFactor') return { ...base, status: 'not applicable', reason: 'Profitability is not discipline evidence' };
    if (rule.metric === 'minAvgR') return { ...base, reason: 'Completed-group planned risk unavailable; no R is manufactured from P&L' };
    if (rule.metric === 'maxContracts' && Number.isSafeInteger(rule.limit) && rule.limit > 0) {
      const offenders = rawTrades.filter(row => rowIds.includes(row.id) && Number.isSafeInteger(row.contracts) && row.contracts > rule.limit);
      if (offenders.length) return { ...base, status: 'breach detected', observed: Math.max(...offenders.map(row => row.contracts)), rowIds: offenders.map(row => row.id), coverage: { checked: rawTrades.length, total: rowIds.length, unit: 'rows' }, reason: 'A matched quantity alone exceeds the current contract limit. This proves a minimum size, not peak exposure.' };
    }
    if (completed.status !== 'available') return base;
    if (!Number.isFinite(rule.limit) || rule.limit < 0) return { ...base, reason: 'Invalid configured threshold' };
    if (rule.metric !== 'maxContracts' && rule.metric !== 'maxTradeLoss') return { ...base, reason: 'Full ordered session / streak evidence is not implemented in v1' };
    const groups = completed.groups;
    const observed = rule.metric === 'maxContracts' ? Math.max(...groups.map(group => group.maxPosition)) : -completed.biggestLossCents;
    let threshold: bigint | number;
    try { threshold = rule.metric === 'maxTradeLoss' ? cents(rule.limit) : rule.limit; }
    catch { return { ...base, reason: 'Invalid monetary threshold' }; }
    return { ...base, observed, status: observed > threshold ? 'breach detected' : 'within configured limits',
      rowIds: groups.flatMap(group => group.rowIds), groupIds: groups.map(group => group.id),
      coverage: { checked: groups.length, total: groups.length, unit: 'groups' },
      reason: rule.metric === 'maxContracts' ? 'Maximum verified position size compared to the current limit' : 'Largest completed-position loss compared to the current limit (observed in cents)' };
  });
  const status: DisciplineStatus = !judgments.length ? 'unconfigured' : judgments.some(j => j.status === 'breach detected') ? 'breach detected'
    : judgments.some(j => j.status === 'insufficient evidence') ? 'insufficient evidence'
    : judgments.some(j => j.status === 'within configured limits') ? 'within configured limits' : 'not applicable';
  return { status, score: null, judgments, basis: 'Current-rule retrospective checks; not proof of a historical pre-trade plan.' };
}

export type JournalMoneyV1 = { status: 'unavailable'; reason: string } | {
  status: 'available'; totalCents: bigint; profitCents: bigint; lossCents: bigint;
  equityPoints: { label: string; value: number }[];
};
/** Existing ledger adapters deliberately supply NO completed-position evidence. */
export function journalSummary(trades: readonly Trade[]) {
  const sorted = [...trades].sort((a, b) => {
    const time = (row: Trade) => row.source?.provider === 'Tradovate' && row.source.closedAt ? row.source.closedAt : `${row.date}T00:00:00.000Z`;
    return time(a).localeCompare(time(b));
  });
  let money: JournalMoneyV1 = { status: 'unavailable', reason: 'No selected rows' };
  let reconciledCents: bigint | null = null;
  try {
    if (new Set(sorted.map(row => row.id)).size !== sorted.length) throw new Error('Duplicate source row identity');
    reconciledCents = sumCents(sorted.map(row => row.pnl));
    if (!sorted.length) throw new Error('No selected rows');
    if (sorted.some(row => !isUsd(row))) throw new Error('Source currency unknown or unsupported; USD currency evidence required');
    let running = 0n;
    const equityPoints = [{ label: 'Start', value: 0 }];
    for (const row of sorted) {
      running = checked(running + cents(row.pnl));
      // The ONLY number conversion is the chart display boundary, not identity or aggregation.
      equityPoints.push({ label: row.date, value: Number(running) / 100 });
    }
    money = { status: 'available', totalCents: reconciledCents,
      profitCents: sumCents(sorted.filter(row => row.pnl > 0).map(row => row.pnl)),
      lossCents: -sumCents(sorted.filter(row => row.pnl < 0).map(row => row.pnl)), equityPoints };
  } catch (error) { money = { status: 'unavailable', reason: error instanceof Error ? error.message : 'Invalid money evidence' }; }
  return {
    version: 1 as const, rows: sorted, matchedWins: sorted.filter(row => row.pnl > 0).length, rowCount: sorted.length, rowIds: sorted.map(row => row.id), money, reconciledCents,
    completed: { status: 'unavailable' as const, reason: 'Completed-trade boundaries unavailable: matched pairs / journal rows do not prove flat-to-flat positions.' },
    fees: null, avgR: null,
    setupNames: [...new Set(sorted.map(row => row.setup.trim()).filter(setup => setup && !/^(imported|.* import)$/i.test(setup)))],
  };
}

export type ExecutionEvidenceV1 = {
  id: string; sequence: number; at: string; quantity: number;
  realizedPnl: string; rowIds: readonly string[]; session: string; decision?: string;
};
/** Contract for a future adapter, NOT a certification of matched pairs.
 * Boundary references must identify actual provider position snapshots. Coverage
 * asserts all executions between those snapshots, including zero-P&L opens.
 * realizedPnl is source money, not computed from execution-price precision.
 */
export type ExecutionWindowV1 = {
  version: 1; provider: string; account: string; instrument: string; currency: string;
  coverage: 'complete' | 'partial'; openingPosition: number; closingPosition: number;
  openingBoundaryRef: string; closingBoundaryRef: string; start: string; end: string;
  executions: readonly ExecutionEvidenceV1[];
};
export type CompletedEpisodeV1 = {
  id: string; provider: string; account: string; instrument: string; currency: string;
  pnlCents: bigint; maxPosition: number; executionIds: string[]; rowIds: string[];
  openedAt: string; closedAt: string; session: string; entryDecision?: string; entryQuantity: number;
};
export type GroupingV1 = { version: 1; status: 'complete' | 'unavailable'; groups: CompletedEpisodeV1[]; reason: string };
export function certifyEpisodes(window: ExecutionWindowV1): GroupingV1 {
  const unavailable = (reason: string): GroupingV1 => ({ version: 1, status: 'unavailable', groups: [], reason });
  const utc = (text: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text) && Number.isFinite(Date.parse(text)) && new Date(text).toISOString() === text;
  if (window.version !== 1 || window.coverage !== 'complete' || window.openingPosition !== 0 || window.closingPosition !== 0 ||
      !window.openingBoundaryRef || !window.closingBoundaryRef || !window.provider || !window.account || !window.instrument || window.currency !== 'USD' ||
      !utc(window.start) || !utc(window.end) || window.start >= window.end) return unavailable('Complete USD scope and verified flat boundaries required');
  const groups: CompletedEpisodeV1[] = [];
  const ids = new Set<string>(), rows = new Set<string>();
  let lastSequence = -1, lastTime = window.start;
  let position = 0;
  let group: CompletedEpisodeV1 | undefined;
  for (const execution of window.executions) {
    if (!execution.id || ids.has(execution.id) || !Number.isSafeInteger(execution.sequence) || execution.sequence <= lastSequence ||
        !utc(execution.at) || execution.at < lastTime || execution.at >= window.end ||
        !Number.isSafeInteger(execution.quantity) || !execution.quantity || !execution.session) return unavailable('Duplicate, unordered, out-of-window or ambiguous execution');
    ids.add(execution.id); lastSequence = execution.sequence; lastTime = execution.at;
    for (const id of execution.rowIds) {
      if (!id || rows.has(id)) return unavailable('Duplicate or missing source row identity');
      rows.add(id);
    }
    const next = position + execution.quantity;
    if (!Number.isSafeInteger(next) || (position !== 0 && next !== 0 && Math.sign(position) !== Math.sign(next))) return unavailable('Reversal requires source-proven close/open allocation; v1 refuses to split it');
    let pnl: bigint;
    try { pnl = cents(execution.realizedPnl); } catch { return unavailable('Invalid execution money'); }
    if ((position === 0 || Math.sign(position) === Math.sign(execution.quantity)) && pnl !== 0n) return unavailable('Opening or scale-in execution cannot realize closing P&L');
    if (position !== 0 && Math.sign(position) !== Math.sign(execution.quantity) && !execution.rowIds.length) return unavailable('Closing execution needs source row evidence');
    if (position === 0) group = {
      id: JSON.stringify([window.provider, window.account, window.instrument, window.currency, execution.id]),
      provider: window.provider, account: window.account, instrument: window.instrument, currency: window.currency,
      pnlCents: 0n, maxPosition: 0, executionIds: [], rowIds: [], openedAt: execution.at, closedAt: execution.at,
      session: execution.session, entryDecision: execution.decision, entryQuantity: Math.abs(execution.quantity),
    };
    position = next;
    try { group!.pnlCents = checked(group!.pnlCents + pnl); } catch { return unavailable('Aggregate money overflow'); }
    group!.maxPosition = Math.max(group!.maxPosition, Math.abs(position));
    group!.executionIds.push(execution.id);
    group!.rowIds.push(...execution.rowIds);
    group!.closedAt = execution.at;
    if (position === 0) groups.push(group!);
  }
  if (position !== 0) return unavailable('Unclosed exposure at the window boundary');
  return { version: 1, status: 'complete', groups, reason: 'Complete execution coverage with verified flat boundaries' };
}

export type EvidenceRowV1 = { id: string; pnl: string | number; provider: string; account: string; instrument: string; currency: string };
export type CompletedMetricsV1 =
  | { status: 'unavailable'; reason: string }
  | { status: 'available'; groups: CompletedEpisodeV1[]; wins: number; total: number; winRateText: string; biggestLossCents: bigint };
export function completedMetrics(windows: readonly ExecutionWindowV1[], rows: readonly EvidenceRowV1[]): CompletedMetricsV1 {
  const unavailable = (reason: string): CompletedMetricsV1 => ({ status: 'unavailable', reason });
  const byId = new Map(rows.map(row => [row.id, row]));
  if (byId.size !== rows.length) return unavailable('Duplicate raw row identity');
  const seen = new Set<string>();
  const groups: CompletedEpisodeV1[] = [];
  for (const window of windows) {
    const result = certifyEpisodes(window);
    if (result.status !== 'complete') return unavailable(result.reason);
    for (const execution of window.executions) {
      const linked: (string | number)[] = [];
      for (const id of execution.rowIds) {
        const row = byId.get(id);
        if (!row || seen.has(id) || row.provider !== window.provider || row.account !== window.account || row.instrument !== window.instrument || row.currency !== window.currency) return unavailable('Source row scope or coverage does not match execution evidence');
        seen.add(id); linked.push(row.pnl);
      }
      try { if (sumCents(linked) !== cents(execution.realizedPnl)) return unavailable('Execution money does not reconcile to source rows'); }
      catch { return unavailable('Invalid source money'); }
    }
    groups.push(...result.groups);
  }
  if (seen.size !== rows.length || !groups.length) return unavailable('No complete sample covering every selected row');
  const wins = groups.filter(group => group.pnlCents > 0n).length;
  return { status: 'available', groups, wins, total: groups.length, winRateText: `${(wins / groups.length * 100).toFixed(2)}%`, biggestLossCents: groups.reduce((worst, group) => group.pnlCents < worst ? group.pnlCents : worst, 0n) };
}

/** Journal v1 is read-only. Raw prices, annotations and the legacy score are not rewritten. */
const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
function checked(value: bigint): bigint {
  if (value > MAX_CENTS || value < -MAX_CENTS) throw new Error('Money exceeds supported minor-unit range');
  return value;
}
export function cents(value: string | number): bigint {
  const text = String(value);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Invalid money: require whole cents');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  return checked((text.startsWith('-') ? -1n : 1n) * (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))));
}
export function sumCents(values: readonly (string | number)[]): bigint {
  return checked(values.reduce((sum, value) => sum + cents(value), 0n));
}
/** Display is formatted from minor units; no float round trip. USD only in v1. */
export function moneyText(value: bigint): string {
  checked(value);
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '−' : ''}$${(absolute / 100n).toLocaleString('en-US')}.${String(absolute % 100n).padStart(2, '0')}`;
}
