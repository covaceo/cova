import type { Trade } from "./risk";
import { isImportPrincipalCurrent, type ImportPrincipal } from "./importGuard";

/** Notes share the ledger's account boundary, never the broker transport. */
export function saveDashboardTradeNote(trades: Trade[], id: string, notes: string, openedBy: ImportPrincipal | null, current: ImportPrincipal | null): Trade[] | null {
  if (!isImportPrincipalCurrent(openedBy, current) || !trades.some(trade => trade.id === id)) return null;
  return trades.map(trade => trade.id === id ? { ...trade, notes } : trade);
}
