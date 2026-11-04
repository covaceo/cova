import type { Trade } from './risk';
import { sumCents } from './journalAccuracy';
import { groupRecapEntries } from './recapEntryGroups';
import { tradeAccountKey } from './tradovateHistory';
import type { AskCovaQuestion } from './askCova';

type Policy = { currency: (row: Trade) => string | null; basis: (row: Trade) => string };
/** One money predicate for complete results, valid subsets and comparisons. */
export function sumAskCovaMoney(values: readonly number[]): bigint {
  if (values.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Invalid money');
  return sumCents(values);
}
type Unit = { rows: Trade[]; pnl: bigint; code: string; basis: string; stratum: string | null; setup: string | null; side: string | null; entry: number | null; duration: number | null };
/** Explicit source instants only: never a date-at-midnight surrogate. */
function sourceInstant(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || +match[2] > 23 || +match[3] > 59 || +match[4] > 59) return null;
  const date = Date.parse(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== match[1]) return null;
  const zone = match[6];
  if (zone !== 'Z' && (+zone.slice(1, 3) > 14 || +zone.slice(4) > 59 || (+zone.slice(1, 3) === 14 && +zone.slice(4) !== 0))) return null;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}
function sourcePair(row: Trade) {
  if (row.source?.provider !== 'Tradovate' || row.source.timeZone !== 'UTC') return { open: null, close: null };
  const open = sourceInstant(row.source.openedAt), close = sourceInstant(row.source.closedAt);
  return { open, close: close !== null && new Date(close).toISOString().slice(0, 10) === row.date ? close : null };
}
/** Normalize only the grouping view; caller evidence and digest inputs stay original. */
function insightGroups(rows: readonly Trade[]) {
  const originals = new Map<Trade, Trade>();
  const views = rows.map(row => {
    if (row.source?.provider !== 'Tradovate') return row;
    const { open, close } = sourcePair(row);
    let valid = open !== null && close !== null && close > open;
    try { sumAskCovaMoney([row.pnl]); } catch { valid = false; }
    // Keep fractional precision in fill identity: Date.parse alone would collapse nanos.
    const canonical = (raw: string, at: number) => new Date(at).toISOString().replace(/\.\d{3}Z$/, `.${(/\.(\d+)/.exec(raw)?.[1] ?? '').padEnd(9, '0')}Z`);
    const source = valid ? { ...row.source, openedAt: canonical(row.source.openedAt!, open!), closedAt: canonical(row.source.closedAt!, close!) }
      : { ...row.source, openedAt: undefined };
    // Unsupported pairs carry no opening-link timestamp, never an invented date.
    // Retain their real IDs/close links so conflicting shared fills still veto joins.
    // Copy descriptors rather than spreading annotations (which could invoke getters).
    const view: Trade = Object.create(Object.getPrototypeOf(row), { ...Object.getOwnPropertyDescriptors(row), source: { value: source, enumerable: true } });
    originals.set(view, row);
    return view;
  });
  return groupRecapEntries(views).map(group => ({ ...group, rows: group.rows.map(row => originals.get(row) ?? row) }));
}
function sourceTimes(rows: Trade[]) {
  const pairs = rows.map(sourcePair);
  const entry = pairs.every(pair => pair.open !== null) ? Math.min(...pairs.map(pair => pair.open!)) : null;
  const duration = entry !== null && pairs.every(pair => pair.close !== null && pair.close > pair.open!)
    ? Math.max(...pairs.map(pair => pair.close!)) - entry : null;
  return { entry, duration };
}
const entryClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function entryBucket(unit: Unit): string | null {
  if (unit.entry === null) return null;
  const parts = entryClock.formatToParts(new Date(unit.entry));
  const minutes = Number(parts.find(part => part.type === 'hour')!.value) * 60 + Number(parts.find(part => part.type === 'minute')!.value);
  return minutes < 360 ? '00:00–06:00' : minutes < 570 ? '06:00–09:30' : minutes < 720 ? '09:30–12:00' : minutes < 960 ? '12:00–16:00' : '16:00–24:00';
}
export function validatedSetup(row: Trade): string | null {
  // A private, local display label, NEVER model text. Ignore accessors and placeholders.
  const value = Object.getOwnPropertyDescriptor(row, 'setup')?.value;
  if (typeof value !== 'string' || value.length > 60 || value.trim().split(/\s+/).length > 8
    || !/^[\p{L}\p{N} _.'()&/−-]+$/u.test(value)) return null;
  const label = value.trim();
  return !label || /^(?:imported|.* import)$/i.test(label) ? null : label;
}
function unitsFor(rows: readonly Trade[], policy: Policy) {
  const groups = insightGroups(rows);
  const units: Unit[] = [];
  for (const group of groups) {
    try {
      const first = group.rows[0], code = policy.currency(first), reportedBasis = policy.basis(first);
      if (!code || group.rows.some(row => policy.currency(row) !== code || policy.basis(row) !== reportedBasis)) continue;
      const pnl = sumAskCovaMoney(group.rows.map(row => row.pnl));
      const setup = validatedSetup(first);
      const side = first.side === 'Long' || first.side === 'Short' ? first.side : null;
      const size = group.rows.reduce((sum, row) => sum + row.contracts, 0);
      const supportedSize = group.rows.every(row => Number.isSafeInteger(row.contracts) && row.contracts > 0) && Number.isSafeInteger(size) && size > 0;
      const stratum = supportedSize ? JSON.stringify([tradeAccountKey(first), first.market, size]) : null;
      units.push({ ...sourceTimes(group.rows), rows: group.rows, pnl, code, basis: reportedBasis, stratum,
        setup: setup && group.rows.every(row => validatedSetup(row) === setup) ? setup : null,
        side: group.rows.every(row => row.side === side) ? side : null });
    } catch { /* Invalid P&L excludes this unit, not independent valid units. */ }
  }
  return { units, count: groups.length };
}
function median(values: bigint[]): string {
  const sorted = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? fixedRatio(sorted[middle], 100n, 2) : fixedRatio(sorted[middle - 1] + sorted[middle], 200n, 2);
}
export type ComparisonMirror = { dimension: string; code: string | null; basis: string | null; total: number; usable: number; sample: number; described: number; matched: boolean | null; support: string[]; categories: { label: string; count: number; mean: string; median: string; sign: 'positive' | 'negative' | 'zero'; support: string[] }[]; gap: string | null; tied: boolean; privateLabels: boolean };
type Comparison = { answer: string; providerAnswer: string; detail: string; compared: boolean; mirror: ComparisonMirror };
function compareDimension(title: string, all: { units: Unit[]; count: number }, label: (unit: Unit) => string | null, privateLabels = false): Comparison {
  const usable = all.units.filter(unit => label(unit) !== null);
  const coverage = `${title}: ${usable.length}/${all.count} usable journal groups; ${all.count - usable.length} excluded.`;
  if (!usable.length) {
    const answer = `No usable ${title.toLowerCase()} evidence in this sample.`;
    return { answer, providerAnswer: answer, detail: coverage, compared: false, mirror:{dimension:title,code:null,basis:null,total:all.count,usable:0,sample:0,described:0,matched:null,support:[],categories:[],gap:null,tied:false,privateLabels} };
  }
  const cohorts = new Map<string, Unit[]>();
  for (const unit of usable) {
    const key = JSON.stringify([unit.code, unit.basis]);
    cohorts.set(key, [...(cohorts.get(key) ?? []), unit]);
  }
  const diverse = (units: Unit[]) => new Set(units.map(label)).size > 1;
  const choices = [...cohorts.entries()].sort((a, b) => Number(diverse(b[1])) - Number(diverse(a[1])) || b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const cohort = choices[0][1];
  const strata = new Map<string, Unit[]>();
  for (const unit of cohort) if (unit.stratum !== null) strata.set(unit.stratum, [...(strata.get(unit.stratum) ?? []), unit]);
  const matched = [...strata.entries()].filter(([, units]) => diverse(units)).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const sample = matched[0]?.[1] ?? cohort;
  const buckets = new Map<string, Unit[]>();
  for (const unit of sample) { const key = label(unit)!; buckets.set(key, [...(buckets.get(key) ?? []), unit]); }
  const ranked = [...buckets.entries()].map(([name, units]) => ({ name, count: units.length, sum: units.reduce((sum, unit) => sum + unit.pnl, 0n), median: median(units.map(unit => unit.pnl)) }));
  ranked.sort((a, b) => {
    const difference = a.sum * BigInt(b.count) - b.sum * BigInt(a.count);
    return difference > 0n ? -1 : difference < 0n ? 1 : a.name.localeCompare(b.name);
  });
  const describe = (item: typeof ranked[number], name = item.name) => `“${name}” averaged ${fixedRatio(item.sum, BigInt(item.count) * 100n, 2)} ${sample[0].code} (n=${item.count})`;
  const first = ranked[0], second = ranked[1];
  const tied = second && first.sum * BigInt(second.count) === second.sum * BigInt(first.count);
  const reason = second ? tied ? 'The means tie; there is no leader.' : `Gap: ${fixedRatio(first.sum * BigInt(second.count) - second.sum * BigInt(first.count), BigInt(first.count) * BigInt(second.count) * 100n, 2)} ${sample[0].code} per journal group.` : 'Only one category is available; there is no comparison.';
  const qualification = matched.length ? 'These groups share market, reported size and account.' : 'Market, size or account differences may explain the gap.';
  const reviewCue = title === 'Setup' ? 'Review the entries behind that gap.' : title === 'Direction' ? 'Compare the execution behind each side.' : title === 'Holding time' ? 'Review exits in each span group.' : 'Review entries in those clock windows.';
  const answerFor = (provider: boolean) => {
    const name = provider && privateLabels ? 'Category A' : first.name;
    const lead = second && !tied ? `“${name}” had the higher mean P&L: averaged ${fixedRatio(first.sum, BigInt(first.count) * 100n, 2)} ${sample[0].code} (n=${first.count})` : describe(first, name);
    return `${lead}${second ? ` versus ${describe(second, provider && privateLabels ? 'Category B' : second.name)}` : ''}. ${reason}${second && !tied ? ` ${reviewCue}` : ''} Comparison: ${sample[0].basis}. Descriptive sample; ${sample.length}/${all.count} compared journal groups.${second && !matched.length ? ' Unmatched groups.' : ''}`;
  };
  const detail = `${coverage} Comparing ${sample.length}/${usable.length} usable groups (${sample[0].basis}); ${usable.length - sample.length} outside the selected comparison. ${qualification} Selection: prefer the largest same-currency/basis cohort with multiple categories, then its largest same-market/account/reported-size stratum with multiple categories; otherwise use that currency/basis cohort. Rank by mean P&L per journal group, never summed P&L. ${ranked.slice(0, 3).map(item => `${describe(item)}, median ${item.median} ${sample[0].code}`).join('; ')}. ${ranked.length > 3 ? `${ranked.length - 3} additional categories not displayed.` : ''} Small samples and multiple comparisons do not establish an edge; reported size is not peak exposure.`;
  const mirror: ComparisonMirror = { dimension:title,code:sample[0].code,basis:sample[0].basis,total:all.count,usable:usable.length,sample:sample.length,described:ranked.slice(0,2).reduce((n,c)=>n+c.count,0),matched:!!matched.length,
    support:all.units.flatMap(u=>u.rows.map(r=>r.id)),privateLabels,
    categories:ranked.slice(0,2).map(c=>({label:c.name,count:c.count,mean:fixedRatio(c.sum,BigInt(c.count)*100n,2),median:c.median,sign:c.sum>0n?'positive':c.sum<0n?'negative':'zero',support:buckets.get(c.name)!.flatMap(u=>u.rows.map(r=>r.id))})),
    gap:second?fixedRatio(first.sum*BigInt(second.count)-second.sum*BigInt(first.count),BigInt(first.count)*BigInt(second.count)*100n,2):null,tied:!!tied };
  return { answer: answerFor(false), providerAnswer: answerFor(true), detail, compared: !!second, mirror };
}
/** Largest valid same-currency/basis subset, never an unsafe combined total. */
export function insightSubset(rows: readonly Trade[], policy: Policy) {
  const all = unitsFor(rows, policy), cohorts = new Map<string, Unit[]>();
  for (const unit of all.units) {
    const key = JSON.stringify([unit.code, unit.basis]);
    const members = cohorts.get(key) ?? []; members.push(unit); cohorts.set(key, members);
  }
  const cohort = [...cohorts.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0]?.[1];
  if (!cohort) return null;
  const total = cohort.reduce((sum, unit) => sum + unit.pnl, 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < -BigInt(Number.MAX_SAFE_INTEGER)) return null;
  // Retain the full-scope validated partition: filtering rows and grouping again
  // could erase an excluded row's conflicting-fill veto and merge usable units.
  const review = reviewStatistics(statisticsForValues(cohort.map(unit => unit.pnl)), cohort[0].code);
  return { review, total, code: cohort[0].code, basis: cohort[0].basis, totalGroups:all.count, selectedGroups:cohort.length, support:cohort.flatMap(unit=>unit.rows.map(row=>row.id)),
    coverage: `Valid subset: ${cohort.length}/${all.count} journal groups; ${all.count - cohort.length} excluded from this subtotal. Largest usable same-currency/basis subset; other currencies, bases or invalid amounts are not combined.` };
}
export function insightComparisons(rows: readonly Trade[], question: AskCovaQuestion, policy: Policy) {
  const all = unitsFor(rows, policy);
  const setup = compareDimension('Setup', all, unit => unit.setup, true);
  const direction = compareDimension('Direction', all, unit => unit.side);
  const durations = all.units.filter(unit => unit.duration !== null).map(unit => unit.duration!).sort((a, b) => a - b);
  const midpoint = Math.floor(durations.length / 2);
  const threshold = durations.length ? durations.length % 2 ? durations[midpoint] : (durations[midpoint - 1] + durations[midpoint]) / 2 : null;
  const holding = compareDimension('Holding time', all, unit => unit.duration === null || threshold === null ? null : unit.duration <= threshold ? 'Shorter spans' : 'Longer spans');
  const timing = compareDimension('Entry time', all, entryBucket);
  const selected = question === 'holding_time' ? holding : question === 'time_of_day' ? timing : question === 'setup_performance' ? setup : question === 'long_vs_short' ? direction
    : setup.compared ? setup : direction.compared ? direction : holding.compared ? holding : timing.compared ? timing : null;
  const qualifier = selected === timing ? ' Entry clock: America/New_York (DST-aware).' : selected === holding && threshold !== null ? ` Observed entry-to-exit spans split at ${(threshold / 60000).toFixed(2)} minutes (shorter ≤ split; longer > split).` : '';
  const timingMethod = `Dimensions exclude unusable money/currency/basis; setup also excludes missing, invalid or inconsistent setup labels (including import placeholders); direction excludes invalid or conflicting sides. Entry buckets use America/New_York with DST, a fixed comparison timezone, not the user's inferred timezone. Earliest verified source entry within each linked group is used; no date-midnight substitution. Holding time is the observed entry-to-exit span from earliest entry to latest exit, only when every source pair is valid and positive; it does not prove a complete position. ${threshold !== null ? `Split at the median of all ${durations.length} usable spans: ${(threshold / 60000).toFixed(2)} minutes; shorter includes the median, longer is strictly above it.` : 'No usable complete source timestamp pairs.'}`;
  const alternative = [setup, direction, holding, timing].find(item => item !== selected && item.compared);
  // Build both views from the same checked comparison. Never redact/replace labels in prose.
  const observationFor = (provider: boolean) => selected ? `${provider ? selected.providerAnswer : selected.answer}${qualifier}${!selected.compared && selected.answer.startsWith('No usable') && alternative ? ` Meanwhile, ${provider ? alternative.providerAnswer : alternative.answer}` : ''}` : null;
  return { selected: selected?.mirror ?? null, alternative: selected && !selected.mirror.categories.length ? alternative?.mirror ?? null : null, thresholdMinutes:threshold===null?null:(threshold/60000).toFixed(2), observation: observationFor(false), providerObservation: observationFor(true), detail: `${setup.detail} ${direction.detail} ${holding.detail} ${timing.detail} ${timingMethod}` };
}

/** All ratios and amounts are computed locally; no model-authored facts. */
function fixedRatio(numerator: bigint, denominator: bigint, digits: number): string {
  const scale = 10n ** BigInt(digits);
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  const rounded = (n * scale + denominator / 2n) / denominator;
  return `${negative ? '−' : ''}${rounded / scale}${digits ? `.${String(rounded % scale).padStart(digits, '0')}` : ''}`;
}
export function insightStatistics(rows: readonly Trade[]) {
  const groups = insightGroups(rows);
  return statisticsForValues(groups.map(group => sumAskCovaMoney(group.rows.map(row => row.pnl))));
}
function statisticsForValues(values: readonly bigint[]) {
  const wins = values.filter(value => value > 0n), losses = values.filter(value => value < 0n);
  const profit = wins.reduce((sum, value) => sum + value, 0n);
  const loss = -losses.reduce((sum, value) => sum + value, 0n);
  return { count: values.length, wins: wins.length, losses: losses.length, breakeven: values.length - wins.length - losses.length,
    profit, loss, winRate: fixedRatio(BigInt(wins.length) * 100n, BigInt(values.length || 1), 1),
    profitFactor: loss > 0n ? fixedRatio(profit, loss, 2) : profit > 0n ? 'undefined (no losses)' : 'undefined (no gains or losses)',
    meanWin: wins.length ? fixedRatio(profit, BigInt(wins.length) * 100n, 2) : null,
    meanLoss: losses.length ? fixedRatio(loss, BigInt(losses.length) * 100n, 2) : null };
}
export function insightReview(rows: readonly Trade[], code: string) {
  return reviewStatistics(insightStatistics(rows), code);
}
function reviewStatistics(stats: ReturnType<typeof statisticsForValues>, code: string) {
  const metrics = `Win rate ${stats.winRate}% and profit factor ${stats.profitFactor}, across ${stats.count} journal groups.`;
  const observation = stats.meanWin && stats.meanLoss
    ? `Winning groups averaged ${stats.meanWin} ${code}; losing groups averaged ${stats.meanLoss} ${code} in losses. ${stats.profit >= stats.loss ? 'Gains covered losses' : 'Losses outweighed gains'}, so review the balance of win size and loss size, not win rate alone.`
    : stats.wins ? 'Only gains or breakevens appear here; without losses, profit factor cannot show the downside. Review these outcomes alongside a broader sample before treating them as a repeatable pattern.'
      : stats.losses ? 'There are no winning groups in this sample. Review the losing outcomes for differences in setup and direction; these results alone do not explain why they lost.'
        : 'Every group broke even on the reported basis. Review the fee basis before interpreting a flat result as a cost-free outcome.';
  const definitions = `${stats.wins} wins, ${stats.losses} losses, ${stats.breakeven} breakeven; win rate includes breakevens in its denominator. Profit factor is summed positive group P&L / absolute summed negative group P&L, undefined with no losses. Verified fill links combine trims and scale-ins; journal groups are not certified completed positions. Unlinked records count individually. These are descriptive results, not a causal or durable edge. Planned risk is not required; no R is inferred.`;
  return { metrics, observation, definitions, stats };
}
