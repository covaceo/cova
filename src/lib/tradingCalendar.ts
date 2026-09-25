import { sampleTrades, type Trade } from './risk';
import { cents, sumCents, journalSummary } from './journalAccuracy';
import type { CashSummary } from './brokerCash';

export type CalendarDay = {
  date: string;
  inMonth: boolean;
  status: 'idle' | 'profit' | 'loss' | 'breakeven' | 'unavailable';
  pnlCents: string | null;
};

function monthStart(month: string): Date {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('Invalid calendar month');
  const value = new Date(`${month}-01T00:00:00.000Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 7) !== month) throw Error('Invalid calendar month');
  return value;
}
export function shiftCalendarMonth(month: string, offset: number): string {
  const date = monthStart(month);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

/** Recorded close dates, not browser-local reinterpretations of broker timestamps. */
export function buildCalendarMonth(month: string, trades: readonly Trade[], cash?: CashSummary): CalendarDay[] {
  const first = monthStart(month);
  const start = first.getTime() - first.getUTCDay() * 86400000;
  const groups = new Map<string, Trade[]>();
  const seen = new Set<string>(), duplicate = new Set<string>();
  for (const trade of trades) {
    if (seen.has(trade.id)) duplicate.add(trade.id);
    seen.add(trade.id);
    const bucket = groups.get(trade.date) ?? [];
    bucket.push(trade);
    groups.set(trade.date, bucket);
  }
  // Only the existing validated, selected-account cash summary can supply net days.
  // It already excludes funding; fee-only dates do not establish trading activity.
  const useNet = cash?.status === 'available' && trades.length > 0 && trades.every(t =>
    t.source?.provider === 'Tradovate' && t.source.accountId === trades[0].source?.accountId);
  const net = new Map<string, bigint>();
  if (useNet) {
    try {
      let previous = 0n;
      let previousDate = '';
      for (const point of cash.points) {
        if (point.label <= previousDate) throw Error('Unordered cash days');
        const total = cents(point.value);
        const delta = total - previous;
        if (delta > BigInt(Number.MAX_SAFE_INTEGER) || delta < -BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Invalid daily money');
        net.set(point.label, delta);
        previous = total;
        previousDate = point.label;
      }
      if (previous !== BigInt(cash.netCents)) throw Error('Cash total mismatch');
    } catch { net.clear(); }
  }
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const cellCount = Math.ceil((next.getTime() - start) / (7 * 86400000)) * 7;
  return Array.from({ length: cellCount }, (_, i) => {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const rows = groups.get(date) ?? [];
    const money = journalSummary(rows).money;
    const sample = rows.length > 0 && rows.every(row => !row.source && !row.manual && sampleTrades.some(s =>
      s.id === row.id && s.date === row.date && s.market === row.market && s.pnl === row.pnl));
    const reported = money.status === 'available' ? money.totalCents : sample ? sumCents(rows.map(row => row.pnl)) : null;
    const pnl = rows.some(row => duplicate.has(row.id)) || reported === null ? null : useNet ? net.get(date) ?? null : reported;
    return { date, inMonth: date.startsWith(month + '-'), pnlCents: pnl?.toString() ?? null,
      status: !rows.length ? 'idle' : pnl === null ? 'unavailable' : pnl > 0n ? 'profit' : pnl < 0n ? 'loss' : 'breakeven' };
  });
}
