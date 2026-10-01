import type { Trade } from './risk';
import { getActiveStorageIdentity } from './storageScope';
import { tradeAccountKey } from './tradovateHistory';

export const MANUAL_NET_PREFIX = 'cova-manual-net-v1:';
const MAX_ROW = 8192, MAX_TOTAL = 256 * 1024;
const active = (owner: string) => Boolean(owner && owner !== 'preview' && getActiveStorageIdentity() === encodeURIComponent(owner.trim().toLowerCase()));
const keyFor = (owner: string, id: string) => `${MANUAL_NET_PREFIX}${encodeURIComponent(id)}:${encodeURIComponent(owner.trim().toLowerCase())}`;
const notify = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('cova:recap-provenance')); };
function ledgerRows(key: string): Trade[] {
  const value = JSON.parse(localStorage.getItem(key) || 'null');
  return Array.isArray(value) ? value : Array.isArray(value?.trades) ? value.trades : [];
}
function exact(rows: readonly Trade[], row: Trade) {
  const found = rows.filter(t => t.id === row.id);
  return found.length === 1 && JSON.stringify(found[0]) === JSON.stringify(row);
}
/** Independent metadata only: never write a ledger or replay a saved row. */
export function persistManualNetConfirmation(owner: string, account: string, rows: readonly Trade[], ledgerKey: string): string | null {
  const written: [string, string][] = [];
  try {
    if (!active(owner) || !rows.length || account === 'all') throw new Error();
    const saved = ledgerRows(ledgerKey);
    const records = rows.map(row => {
      const fingerprint = JSON.stringify(row);
      if (!row.id.startsWith('manual-') || row.id.length > 256 || row.source || row.manual?.currency !== 'USD' || row.manual.pnlBasis !== 'gross_before_fees' || tradeAccountKey(row) !== account || fingerprint.length > MAX_ROW || !exact(saved, row)) throw new Error();
      return [keyFor(owner, row.id), JSON.stringify({ version: 1, owner, account, ledgerKey, fingerprint })] as [string, string];
    });
    let occupied = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(MANUAL_NET_PREFIX)) occupied += key.length + (localStorage.getItem(key)?.length || 0);
    }
    if (occupied + records.reduce((sum, [k, v]) => sum + k.length + v.length, 0) > MAX_TOTAL) throw new Error();
    for (const [key, value] of records) {
      if (!active(owner)) throw new Error();
      localStorage.setItem(key, value);
      written.push([key, value]);
    }
    // Concurrent target edits invalidate the receipt. Unrelated edits are untouched.
    if (!active(owner) || rows.some(row => !exact(ledgerRows(ledgerKey), row))) throw new Error();
    notify();
    return null;
  } catch {
    for (const [key, value] of written) {
      try { if (localStorage.getItem(key) === value) localStorage.removeItem(key); } catch { /* Read path still requires exact evidence. */ }
    }
    notify();
    return 'Could not save confirmation, or these trades changed. Reopen the recap and try again.';
  }
}
/** Apply to recap copies only; changed/deleted/ambiguous rows fail closed on every read. */
export function resolveManualNetConfirmations(rows: readonly Trade[], owner: string): Trade[] {
  return rows.map(row => {
    try {
      if (!active(owner) || row.source || row.manual?.pnlBasis !== 'gross_before_fees' || !row.id.startsWith('manual-') || row.id.length > 256 || !exact(rows, row)) return row;
      const raw = localStorage.getItem(keyFor(owner, row.id));
      if (!raw || raw.length > MAX_ROW * 2 + 2048) return row;
      const record = JSON.parse(raw);
      if (record.version !== 1 || record.owner !== owner || record.account !== tradeAccountKey(row) || record.fingerprint !== JSON.stringify(row) || typeof record.ledgerKey !== 'string' || !exact(ledgerRows(record.ledgerKey), row)) return row;
      return { ...row, manual: { ...row.manual, pnlBasis: 'reported_net' } };
    } catch { return row; }
  });
}
