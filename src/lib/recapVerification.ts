import { getActiveStorageIdentity } from './storageScope';
import type { Trade } from './risk';
import { tradeAccountKey, validateTradovateHistory } from './tradovateHistory';

export type RecapConnection = { owner: string; basis: 'tradovate' | 'owner-approved'; connectionId: string; checkedAt: number; expiresAt: number; broker?: RecapConnection | null };
export type RecapVerification = RecapConnection & { accountId: string };
// Deliberately not persisted: cached provider fields/CSV imports are not sync receipts.
const receipts = new Map<string, { connectionId: string; rows: Set<string> }>();
const key = (owner: string, account: string) => JSON.stringify([owner, account]);
const fingerprint = (t: Trade) => JSON.stringify([t.id,t.date,t.market,t.side,t.contracts,t.entry,t.exit,t.pnl,t.source?.provider,t.source?.accountId,t.source?.provider === 'Tradovate' ? [t.source.openedAt,t.source.closedAt,t.source.timeZone,t.source.pnlBasis] : t.source?.provider === 'Rithmic' ? [t.source.accountKey,t.source.currency] : null]);
// Browser-local provenance is separate from identity authorization. Never persist email,
// connection credentials or auth leases. Existing account deletion removes this scoped key.
const INGESTION_KEY = 'cova-recap-ingestion-v2', MAX_ROW_CHARS = 8192;
// Global, optional metadata budget, measured in UTF-16 code units including keys.
// Browser quotas vary: ledger writes additionally reclaim receipts and retry.
const MAX_INGESTION_CHARS = 256 * 1024;
function ingestionEntries(): [string, number][] {
  const entries: [string, number][] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i);
    if (name?.startsWith(`${INGESTION_KEY}:`)) entries.push([name, name.length + (localStorage.getItem(name)?.length ?? 0)]);
  }
  return entries;
}
function notifyIngestion() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('cova:recap-provenance'));
}
/** Durable trade data always takes priority over optional, reconstructible badges.
 * Never delete ledger/auth/settings or restore a receipt from an old snapshot. */
export function persistTradingLedger(storageKey: string, serialized: string): boolean {
  try { localStorage.setItem(storageKey, serialized); return true; } catch { /* Reclaim optional metadata only. */ }
  try {
    for (const [name] of ingestionEntries()) localStorage.removeItem(name);
    notifyIngestion();
    localStorage.setItem(storageKey, serialized);
    return true;
  } catch { return false; }
}
const activeOwner = (owner: string) => {
  try { return Boolean(owner && owner !== 'preview' && getActiveStorageIdentity() === encodeURIComponent(owner.trim().toLowerCase())); } catch { return false; }
};
// Independent keys end in the existing owner suffix for account-deletion cleanup.
// Never read/modify/write a shared map: another tab may revoke any unrelated row.
const ingestionKey = (owner: string, id: string) => `${INGESTION_KEY}:${encodeURIComponent(id)}:${encodeURIComponent(owner.trim().toLowerCase())}`;
function readIngestion(owner: string, row: Trade): boolean {
  if (!activeOwner(owner) || !row.id || row.id.length > 256) return false;
  try {
    const raw = localStorage.getItem(ingestionKey(owner, row.id));
    if (!raw || raw.length > MAX_ROW_CHARS + 1024) return false;
    const saved = JSON.parse(raw);
    return saved.version === 2 && saved.owner === owner && saved.id === row.id && typeof saved.row === 'string' && saved.row.length <= MAX_ROW_CHARS && saved.row === fingerprint(row);
  } catch { return false; }
}
/** Writes are per accepted row; budget eviction only deletes optional receipts. Never replay saved rows. */
export function recordRecapIngestion(owner: string, rows: readonly Trade[], kind: 'csv' | 'broker') {
  if (!activeOwner(owner)) return;
  let entries: [string, number][];
  try { entries = ingestionEntries(); } catch { return; }
  let occupied = entries.reduce((sum, [, size]) => sum + size, 0);
  // Eviction only deletes; it cannot resurrect another tab's revoked row.
  const makeRoom = (needed: number) => {
    while (occupied + needed > MAX_INGESTION_CHARS && entries.length) {
      const [name, size] = entries.shift()!;
      localStorage.removeItem(name);
      occupied -= size;
    }
  };
  try { makeRoom(0); } catch { return; }
  for (const row of rows) {
    if (!activeOwner(owner)) break;
    if (!row.id || row.id.length > 256) continue;
    const storageKey = ingestionKey(owner, row.id);
    try {
      if (kind === 'broker') localStorage.removeItem(storageKey);
      else {
        const value = fingerprint(row);
        if (value.length > MAX_ROW_CHARS) localStorage.removeItem(storageKey);
        else {
          const serialized = JSON.stringify({ version: 2, owner, id: row.id, row: value });
          const size = storageKey.length + serialized.length;
          // Count replacements conservatively. No stale receipt contents are rewritten.
          makeRoom(size);
          if (!activeOwner(owner)) break;
          localStorage.setItem(storageKey, serialized);
          entries.push([storageKey, size]);
          occupied += size;
        }
      }
    } catch { try { localStorage.removeItem(storageKey); } catch { /* Unavailable storage grants no new provenance. */ } }
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('cova:recap-provenance'));
}
function ownerApprovedRow(owner: string, row: Trade) {
  if (!activeOwner(owner)) return false;
  // Explicit manual metadata is already saved with the ledger by appendManualTrade.
  // CSV parsing never imports this field. It survives ordinary reload without a migration.
  if (!row.source && row.id.startsWith('manual-') && row.manual?.currency === 'USD' && row.manual.pnlBasis === 'gross_before_fees') return true;
  return readIngestion(owner, row);
}
export function recordRecapSync(owner: string, connectionId: string, response: unknown) {
  if (!owner || owner === 'preview' || !connectionId) return;
  const verified = validateTradovateHistory(response);
  for (const item of verified.accounts) {
    if (item.status !== 'ready') continue;
    const rows = verified.trades.filter(t => t.source?.accountId === item.account.id);
    receipts.set(key(owner, item.account.id), { connectionId, rows: new Set(rows.map(fingerprint)) });
  }
  while (receipts.size > 64) receipts.delete(receipts.keys().next().value!);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('cova:recap-provenance'));
}
export function hasRecapSync(owner: string, selectedAccount: string) {
  return /^Tradovate:[1-9]\d{0,15}$/.test(selectedAccount) && receipts.has(key(owner, selectedAccount.slice(10)));
}
export function checkedRecapConnection(owner: string, value: unknown, now = Date.now()): RecapConnection | null {
  const s = value as Record<string, unknown> | null;
  const expires = typeof s?.expiresAt === 'string' ? Date.parse(s.expiresAt) : NaN;
  if (!owner || owner === 'preview' || !s || s.provider !== 'Tradovate' || s.connected !== true || s.linked !== true || s.available !== true || s.status !== 'connected' || typeof s.connectionId !== 'string' || !s.connectionId || !Number.isFinite(expires) || expires <= now) return null;
  return { owner, basis: 'tradovate', connectionId: s.connectionId, checkedAt: now, expiresAt: Math.min(expires, now + 30000) };
}
/** Call only with auth.getUser()'s server response, never a cached session/profile. */
export function checkedRecapIdentity(owner: string, value: unknown, now = Date.now()): RecapConnection | null {
  const u = value as Record<string, unknown> | null;
  if (!owner || owner === 'preview' || !u || u.id !== owner || typeof u.email !== 'string' || u.email.trim().toLowerCase() !== 'lino@covadesk.com' || typeof u.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(u.email_confirmed_at)) || !Number.isFinite(now)) return null;
  return { owner, basis: 'owner-approved', connectionId: '', checkedAt: now, expiresAt: now + 30000 };
}
export function recapVerificationCurrent(value: RecapVerification | null | undefined, now = Date.now()): boolean {
  return Boolean(value && value.owner && value.owner !== 'preview' && (value.basis === 'owner-approved' ? value.accountId && value.accountId !== 'all' : value.basis === 'tradovate' && value.connectionId && /^[1-9]\d{0,15}$/.test(value.accountId)) && Number.isFinite(now) && Number.isFinite(value.checkedAt) && value.checkedAt <= now && value.expiresAt > now && value.expiresAt <= value.checkedAt + 30000);
}
export function verifyRecapTrades(rows: readonly Trade[], owner: string, selectedAccount: string, connection: RecapConnection | null, now = Date.now()): RecapVerification | null {
  if (!connection || connection.owner !== owner || !rows.length || selectedAccount === 'all' || rows.some(t => t.id.startsWith('demo-') || tradeAccountKey(t) !== selectedAccount)) return null;
  if (connection.basis === 'owner-approved') {
    if (!rows.every(row => ownerApprovedRow(owner, row))) return connection.broker?.basis === 'tradovate' ? verifyRecapTrades(rows, owner, selectedAccount, connection.broker, now) : null;
    const result = { ...connection, accountId: selectedAccount };
    return recapVerificationCurrent(result, now) ? result : null;
  }
  if (!hasRecapSync(owner, selectedAccount)) return null;
  const accountId = selectedAccount.slice(10), receipt = receipts.get(key(owner, accountId))!;
  const result = { ...connection, accountId };
  if (!recapVerificationCurrent(result, now) || receipt.connectionId !== connection.connectionId || rows.some(t => t.manual || !t.id.startsWith(`tradovate-${accountId}:`) || t.source?.provider !== 'Tradovate' || t.source.accountId !== accountId || !receipt.rows.has(fingerprint(t)))) return null;
  return result;
}

/** Only badge-affecting identity belongs in a render key; lease timestamps may renew. */
export function recapVerificationKey(value: RecapVerification | null | undefined) {
  return value ? JSON.stringify([value.owner,value.basis,value.connectionId,value.accountId]) : null;
}
