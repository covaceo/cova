import type { Cash } from './brokerCash';
import type { RecapFees } from './sessionRecapFees';
export type HotStreak = { days: number; atLeast: boolean };
type DayRecap = { kind: string; date: string; fees: RecapFees | null };
/** Caller supplies owner/account-validated cash and reconciled whole-day recaps. */
export function buildHotStreaks(recaps: readonly DayRecap[], cash: Cash | null): Map<string, HotStreak | null> {
  const result = new Map<string, HotStreak | null>();
  if (!cash) return result;
  const daily = new Map(recaps.filter(r => r.kind === 'daily').map(r => [r.date, r]));
  // Missing dates with no trading/cash activity are idle, not losing days.
  // Fee-only activity is not proof of an idle day or a profitable trading day.
  const dates = [...new Set([...daily.keys(), ...cash.entries.filter(e => e.category !== 'funding').map(e => e.at.slice(0, 10))])]
    .filter(date => date >= cash.window.startDate && date < cash.window.endDate && date <= cash.asOf.slice(0, 10)).sort();
  let days = 0, knownReset = false;
  for (const date of dates) {
    const fees = daily.get(date)?.fees;
    if (!fees) {
      days = 0; knownReset = false; result.set(date, null);
    } else if (BigInt(fees.netCashCents) <= 0n) {
      days = 0; knownReset = true; result.set(date, { days, atLeast: false });
    } else {
      days++; result.set(date, { days, atLeast: !knownReset });
    }
  }
  return result;
}
