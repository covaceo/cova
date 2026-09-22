import type { Cash } from './brokerCash';
import type { Trade } from './risk';
export type RecapFees = { signedCents: string; netCashCents: string; asOf: string };
/** Account-window cash, never per-trade fee allocation. Caller validates the full ledger. */
export function recapCashFees(cash: Cash | null, rows: readonly Trade[], window: { start: number; end: number }): RecapFees | null {
  if (!cash || !rows.length || window.start < Date.parse(cash.window.startDate) || window.end > Date.parse(cash.window.endDate)) return null;
  // A trader can finish before the clock window closes. Use only reconciled
  // postings through the sync, inclusive of its exact timestamp, never future rows.
  const end = Math.min(window.end, Date.parse(cash.asOf) + 1);
  if (end <= window.start) return null;
  const inside = (at: string | undefined) => Boolean(at && Date.parse(at) >= window.start && Date.parse(at) < end);
  if (rows.some(row => row.source?.provider !== 'Tradovate' || !inside(row.source.openedAt) || !inside(row.source.closedAt))) return null;
  const entries = cash.entries.filter(entry => inside(entry.at));
  // Performance reports retain the market root, not expiry or cash transaction IDs.
  // Compare both multisets at that supported granularity; this is NOT a fill linkage.
  const market = (contract: string | undefined) => typeof contract === 'string' ? contract.match(/^([A-Z0-9]{1,12}?)[FGHJKMNQUVXZ]\d{1,4}$/)?.[1] ?? '' : '';
  const observed = entries.filter(e => e.category === 'trade').map(e => JSON.stringify([e.at, e.deltaCents, market(e.contract)])).sort();
  const expected = rows.map(row => JSON.stringify([row.source?.provider === 'Tradovate' ? row.source.closedAt : '', Math.round(row.pnl * 100), row.market])).sort();
  if (observed.length !== expected.length || observed.some((value, i) => value !== expected[i])) return null;
  const signed = entries.filter(e => e.category === 'fee').reduce((n, e) => n + BigInt(e.deltaCents), 0n);
  const gross = entries.filter(e => e.category === 'trade').reduce((n, e) => n + BigInt(e.deltaCents), 0n);
  if ([signed, gross + signed].some(n => n > BigInt(Number.MAX_SAFE_INTEGER) || n < -BigInt(Number.MAX_SAFE_INTEGER))) return null;
  return { signedCents: signed.toString(), netCashCents: (gross + signed).toString(), asOf: cash.asOf };
}
