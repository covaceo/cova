import type { Trade } from './risk';
import type { CashSummary } from './brokerCash';
import { journalSummary } from './journalAccuracy';
import { tradeAccountKey } from './tradovateHistory';

/** Presentation only: all loaded account results, never the rebased visible range. */
export function accountEquityPnlCents(trades: readonly Trade[], cash: CashSummary): number | null {
  if (!trades.length || trades.some(trade => !trade.source && !trade.manual)) return null;
  const scopes = new Set(trades.map(tradeAccountKey));
  if (scopes.size !== 1) return null;
  if (cash.status === 'available' && !trades.some(trade=>trade.manual)) return Number.isSafeInteger(cash.netCents) ? cash.netCents : null;
  const money = journalSummary(trades).money;
  return money.status === 'available' ? Number(money.totalCents) : null;
}
