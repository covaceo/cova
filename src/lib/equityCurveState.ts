import type { Trade } from './risk';
import type { CashSummary } from './brokerCash';
import { journalSummary } from './journalAccuracy';
import { tradeAccountKey } from './tradovateHistory';

/** Currency/precision gate for the plotted basis. Multi-account views use reported
 * USD trades, never one account's net cash or an invented combined fee allocation. */
export function accountEquityPnlCents(trades: readonly Trade[], cash: CashSummary): number | null {
  if (!trades.length || trades.some(trade => !trade.source && !trade.manual)) return null;
  const scopes = new Set(trades.map(tradeAccountKey));
  if (scopes.size === 1 && cash.status === 'available' && !trades.some(trade=>trade.manual)) return Number.isSafeInteger(cash.netCents) ? cash.netCents : null;
  const money = journalSummary(trades).money;
  return money.status === 'available' ? Number(money.totalCents) : null;
}
