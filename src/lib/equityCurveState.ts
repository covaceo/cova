import type { Trade } from './risk';
import type { CashSummary } from './brokerCash';
import { journalSummary } from './journalAccuracy';

/** Presentation only: all loaded account results, never the rebased visible range. */
export function accountEquityPnlCents(trades: readonly Trade[], cash: CashSummary): number | null {
  if (!trades.length || trades.some(trade => !trade.source)) return null;
  const scopes = new Set(trades.map(trade => JSON.stringify(trade.source?.provider === 'Rithmic'
    ? [trade.source.provider, trade.source.accountKey, trade.source.accountId]
    : [trade.source?.provider, trade.source?.accountId])));
  if (scopes.size !== 1) return null;
  if (cash.status === 'available') return Number.isSafeInteger(cash.netCents) ? cash.netCents : null;
  const money = journalSummary(trades).money;
  return money.status === 'available' ? Number(money.totalCents) : null;
}
