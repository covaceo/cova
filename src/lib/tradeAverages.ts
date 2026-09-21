import { groupJournalEntries, type Trade } from './risk';
import { journalSummary, sumCents } from './journalAccuracy';

/** Mean of grouped reported results. Round only once, to the nearest cent (ties away from zero). */
export function tradeAverages(trades: readonly Trade[], selectedTrades: readonly Trade[] = trades) {
  const selected = new Set(selectedTrades.map(row => row.id));
  const closedAt = (row: Trade) => row.source?.provider === 'Tradovate' && row.source.closedAt ? row.source.closedAt : row.date;
  // Group the account's full history first; range membership follows its last observed exit.
  const groups = groupJournalEntries(trades).filter(group => selected.has(group.rows.reduce((last, row) => closedAt(row) > closedAt(last) ? row : last).id));
  const rows = groups.flatMap(group => group.rows);
  const money = journalSummary(rows).money;
  if (new Set(trades.map(row => row.id)).size !== trades.length) return { status: 'unavailable' as const, reason: 'Duplicate source row identity', winnerCents: null, loserCents: null, winners: 0, losers: 0 };
  if (rows.length && money.status !== 'available') return { status: 'unavailable' as const, reason: money.reason, winnerCents: null, loserCents: null, winners: 0, losers: 0 };
  let profit = 0n, loss = 0n, winners = 0, losers = 0;
  for (const group of groups) {
    const amount = sumCents(group.rows.map(row => row.pnl));
    if (amount > 0n) { profit += amount; winners++; }
    if (amount < 0n) { loss += amount; losers++; }
  }
  const mean = (total: bigint, count: number) => {
    if (!count) return null;
    const absolute = total < 0n ? -total : total;
    const divisor = BigInt(count);
    const rounded = absolute / divisor + (absolute % divisor * 2n >= divisor ? 1n : 0n);
    return total < 0n ? -rounded : rounded;
  };
  return { status: 'available' as const, winnerCents: mean(profit, winners), loserCents: mean(loss, losers), winners, losers };
}
