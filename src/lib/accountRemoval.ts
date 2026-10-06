import type { Trade, RiskRule } from './risk';
import type { ImportPrincipal } from './importGuard';
import { tradeAccountKey } from './tradovateHistory';
import { account as validAccount } from './workspaceValidation';
import { getActiveStorageIdentity } from './storageScope';
import { readWorkspaceAux, workspaceAuxKey, WORKSPACE_LOCAL_EVENT } from './workspaceAux';

const scope = (owner: string) => encodeURIComponent(owner.trim().toLowerCase());
const ledgerKey = (owner: string) => `cova-react-risk-os-v2:${scope(owner)}`;
const namesKey = (owner: string) => `cova-account-names-v1:${scope(owner)}`;
const markerKey = (owner: string, key: string) => `cova-account-removed-v1:${encodeURIComponent(key)}:${scope(owner)}`;
const recoveryKey = (owner: string) => `cova-account-removal-recovery-v1:${scope(owner)}`;
const active = (owner: string) => Boolean(owner && getActiveStorageIdentity() === scope(owner));
const allowed = (owner: string, key: string) => key === ledgerKey(owner) || key === namesKey(owner) || key === workspaceAuxKey(owner) ||
  (key.endsWith(':' + scope(owner)) && ['cova-daily-journal-v1:', 'cova-broker-cash-v1:', 'cova-account-removed-v1:'].some(prefix => key.startsWith(prefix)));
const object = (raw: string | null): Record<string, any> => {
  const value = JSON.parse(raw || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Saved account data needs review before removal.');
  return value;
};
function inputs(owner: string, account: string) {
  const keys = new Set([ledgerKey(owner), namesKey(owner), workspaceAuxKey(owner), markerKey(owner, account)]);
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('cova-daily-journal-v1:') && key.endsWith(':' + scope(owner))) keys.add(key);
  }
  if (account.startsWith('Tradovate:')) keys.add(`cova-broker-cash-v1:${account.slice(10)}:${scope(owner)}`);
  return [...keys].sort().map(key => ({ key, before: localStorage.getItem(key) }));
}
export type AccountRemovalPreview = { owner: string; account: string; tradeCount: number; noteCount: number; fingerprint: string; principal?: ImportPrincipal };
export function accountWasRemoved(owner: string, account: string) {
  try { return localStorage.getItem(markerKey(owner, account)) === 'removed'; } catch { return false; }
}
/** The confirmation binds to an exact saved snapshot, not just a displayed count. */
export function prepareAccountRemoval(owner: string, account: string, trades: readonly Trade[], accounts: readonly string[]): AccountRemovalPreview | null {
  if (!active(owner) || !validAccount(account) || account === 'all' || !accounts.includes(account)) return null;
  const saved = inputs(owner, account), aux = readWorkspaceAux(owner);
  const notes = aux ? aux.notes[account] || {} : object(localStorage.getItem(`cova-daily-journal-v1:${encodeURIComponent(account)}:${scope(owner)}`));
  const target = trades.filter(row => tradeAccountKey(row) === account);
  return { owner, account, tradeCount: target.length, noteCount: Object.keys(notes).length, fingerprint: JSON.stringify({ target, saved }) };
}
const setVerified = (key: string, value: string | null) => {
  if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  if (localStorage.getItem(key) !== value) throw Error('Browser storage verification failed.');
};
/** Roll back interrupted multi-key writes before the next account snapshot is loaded. */
export function recoverAccountRemoval(owner: string) {
  if (!active(owner)) return;
  const raw = localStorage.getItem(recoveryKey(owner));
  if (!raw) return;
  const journal = JSON.parse(raw);
  if (journal.owner !== owner || !Array.isArray(journal.entries) || !journal.entries.length || !journal.entries.every((entry: any) =>
    typeof entry.key === 'string' && allowed(owner, entry.key) && [entry.before, entry.after].every(value => value === null || typeof value === 'string')))
    throw Error('Invalid account removal recovery data. Preserve this browser.');
  for (const entry of journal.entries) {
    const current = localStorage.getItem(entry.key);
    if (current !== entry.before && current !== entry.after) throw Error('Account data changed during recovery. Preserve this browser and review storage.');
  }
  for (const entry of journal.entries) setVerified(entry.key, entry.before);
  setVerified(recoveryKey(owner), null);
}
/** Never calls a broker API, removes another owner, changes rules, or acknowledges a cloud save. */
export function commitAccountRemoval(owner: string, preview: AccountRemovalPreview, trades: Trade[], rules: RiskRule[], selection: string): { trades: Trade[]; selection: string; error: string | null } {
  const fail = (error: string) => ({ trades, selection, error });
  if (preview.owner !== owner || !active(owner)) return fail('Your account changed. Reopen Accounts.');
  try {
    if (localStorage.getItem(recoveryKey(owner))) return fail('Reload to recover the previous interrupted removal first.');
    const latest = prepareAccountRemoval(owner, preview.account, trades, [preview.account]);
    if (!latest || latest.fingerprint !== preview.fingerprint) return fail('This account changed. Reopen Remove account and review the new counts.');
    const saved = inputs(owner, preview.account), ledger = object(localStorage.getItem(ledgerKey(owner)));
    if (JSON.stringify(ledger.trades || []) !== JSON.stringify(trades)) return fail('Trade history changed. Reload Accounts before removing it.');
    const removed = new Set(trades.filter(row => tradeAccountKey(row) === preview.account).map(row => row.id));
    const nextTrades = trades.filter(row => tradeAccountKey(row) !== preview.account);
    const nextSelection = selection === preview.account ? 'all' : selection;
    const entries = saved.map(entry => ({ ...entry, after: entry.before }));
    const put = (key: string, after: string | null) => { entries.find(entry => entry.key === key)!.after = after; };
    put(ledgerKey(owner), JSON.stringify({ ...ledger, trades: nextTrades, rules, tradeAccount: nextSelection }));
    const detach = (notes: Record<string, any>) => {
      for (const value of Object.values(notes)) if (value && typeof value === 'object' && removed.has(value.tradeId)) value.tradeId = null;
    };
    const aux = readWorkspaceAux(owner);
    if (aux) {
      if (preview.account === 'local' && aux.names.local) aux.names.local = 'Manual account'; else delete aux.names[preview.account];
      delete aux.notes[preview.account]; delete aux.cash[preview.account];
      for (const notes of Object.values(aux.notes)) detach(notes);
      put(workspaceAuxKey(owner), JSON.stringify(aux));
    }
    const names = object(localStorage.getItem(namesKey(owner)));
    if (preview.account === 'local' && names.local) names.local = 'Manual account'; else delete names[preview.account];
    if (localStorage.getItem(namesKey(owner)) !== null) put(namesKey(owner), JSON.stringify(names));
    for (const entry of entries) {
      if (entry.key.startsWith('cova-daily-journal-v1:')) {
        const encoded = entry.key.slice('cova-daily-journal-v1:'.length, -scope(owner).length - 1);
        if (decodeURIComponent(encoded) === preview.account) entry.after = null;
        else if (entry.before !== null) { const notes = object(entry.before); detach(notes); entry.after = JSON.stringify(notes); }
      }
      if (entry.key.startsWith('cova-broker-cash-v1:')) entry.after = null;
    }
    put(markerKey(owner, preview.account), 'removed');
    const changed = entries.filter(entry => entry.before !== entry.after);
    // Verified undo journal precedes every data mutation. No async gap lets a stale form commit.
    setVerified(recoveryKey(owner), JSON.stringify({ owner, entries: changed }));
    try {
      for (const entry of changed) setVerified(entry.key, entry.after);
      setVerified(recoveryKey(owner), null);
    } catch (error) {
      try { recoverAccountRemoval(owner); } catch { return fail('Removal was interrupted. Your original data is retained in recovery storage. Free browser storage and reload.'); }
      throw error;
    }
    window.dispatchEvent(new Event('cova:account-names'));
    window.dispatchEvent(new Event('cova:broker-cash-updated'));
    window.dispatchEvent(new Event(WORKSPACE_LOCAL_EVENT));
    return { trades: nextTrades, selection: nextSelection, error: null };
  } catch { return fail('Could not remove this account. Original data is kept; check browser storage and retry.'); }
}
