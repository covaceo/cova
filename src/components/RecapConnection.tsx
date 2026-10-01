import { createContext, useContext, useEffect, useState } from 'react';
import { checkedRecapConnection, checkedRecapIdentity, hasRecapSync, type RecapConnection } from '../lib/recapVerification';
type Evidence = { user: unknown; status?: unknown };
const defaultFetch = async (signal: AbortSignal, needsBroker: boolean): Promise<Evidence> => {
  const { getSupabaseClient } = await import('../lib/supabaseClient');
  const client = getSupabaseClient();
  if (signal.aborted) throw new Error('Verification cancelled');
  if (!client) throw new Error('Sign in to verify');
  // getUser validates against Auth's server; getSession/profile email is not evidence.
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || signal.aborted) throw new Error('Identity unavailable');
  if (!needsBroker) return { user: data.user };
  const { authorizedFetch } = await import('../lib/apiClient');
  try {
    const response = await authorizedFetch('/api/tradovate/status', { signal, cache: 'no-store' });
    return { user: data.user, status: response.ok ? await response.json() : null };
  } catch { return { user: data.user, status: null }; }
};
// The provider is a transport seam for synthetic browser tests, not persisted state.
export const RecapConnectionTransport = createContext(defaultFetch);
export function useRecapConnection(owner: string, selectedAccount: string) {
  const fetchConnection = useContext(RecapConnectionTransport);
  const [current, setCurrent] = useState<RecapConnection | null>(null);
  useEffect(() => {
    let alive = true, sequence = 0, timer: ReturnType<typeof setTimeout>, deadline: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    const refresh = (renewal = false) => {
      const run = ++sequence; controller?.abort(); clearTimeout(timer);
      if (!renewal) { clearTimeout(deadline); setCurrent(null); }
      if (!owner || owner === 'preview' || selectedAccount === 'all') return;
      controller = new AbortController(); const request = controller, signal = request.signal;
      const timeout = setTimeout(() => { request.abort(); if (alive && run === sequence) setCurrent(null); }, 5000);
      void fetchConnection(signal, hasRecapSync(owner, selectedAccount)).then(value => {
        if (!alive || signal.aborted || run !== sequence) return;
        const user = value.user as { id?: string } | null;
        const broker = user?.id === owner ? checkedRecapConnection(owner, value.status) : null;
        const approval = checkedRecapIdentity(owner, user);
        const checked = approval ? { ...approval, broker, expiresAt: Math.min(approval.expiresAt, broker?.expiresAt ?? approval.expiresAt) } : broker;
        setCurrent(checked); clearTimeout(deadline);
        if (checked) {
          const remaining = checked.expiresAt - Date.now();
          deadline = setTimeout(() => { setCurrent(null); refresh(); }, Math.max(1, remaining));
          // Renew while the previous lease is valid; identical evidence keeps exports alive.
          if (remaining > 10000) timer = setTimeout(() => refresh(true), remaining - 10000);
        }
      }).catch(() => { if (alive && run === sequence) setCurrent(null); }).finally(() => clearTimeout(timeout));
    };
    const invalidate = () => refresh();
    const storageChanged = () => {
      // Per-row imports can emit thousands of events in another tab. Revoke now,
      // then perform one fresh auth check after that burst rather than one per row.
      sequence++; controller?.abort(); clearTimeout(timer); clearTimeout(deadline); setCurrent(null);
      timer = setTimeout(() => refresh(), 75);
    };
    const events = ['focus','cova:broker-status','cova:recap-provenance'];
    window.addEventListener('storage', storageChanged);
    events.forEach(event => window.addEventListener(event, invalidate)); refresh();
    return () => { alive = false; sequence++; controller?.abort(); clearTimeout(timer); clearTimeout(deadline); events.forEach(event => window.removeEventListener(event, invalidate)); window.removeEventListener('storage', storageChanged); };
  }, [owner, selectedAccount, fetchConnection]);
  return current?.owner === owner && current.expiresAt > Date.now() ? current : null;
}
