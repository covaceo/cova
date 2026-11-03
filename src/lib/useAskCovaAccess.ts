import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { bindAskCovaAccessAuthority, createAskCovaTransport, requestAskCovaAccess } from './askCovaClient';
import { getSupabaseClient } from './supabaseClient';
import { workspaceOwnerCurrent } from './workspaceClient';

type Authority = { owner: string; generation: number; token: string };
/** App supplies live provider authority, not its cached display/authSession record. */
export function useAskCovaAccess(enabled: boolean, owner: string | undefined, generation: number,
  token: string | undefined, current: (authority: Authority) => boolean): { enabled: boolean; revoke: () => void } {
  const live = useRef({ enabled, owner, generation, token, current });
  live.current = { enabled, owner, generation, token, current };
  const [grant, setGrant] = useState<Authority | null>(null);
  const cancelAccess = useRef<(() => void) | null>(null);
  // Auth callbacks are outside React's render lifecycle. Revoke action/transport
  // authority first, then COMMIT the old panel's removal before the callback returns.
  // A queued state update or a layout effect alone cannot guarantee that boundary.
  const revoke = useCallback(() => {
    const cancel = cancelAccess.current;
    if (!cancel) return;
    cancel();
    flushSync(() => setGrant(null));
  }, []);
  const valid = (authority: Authority) => {
    const latest = live.current;
    return latest.enabled && latest.owner === authority.owner && latest.generation === authority.generation
      && latest.token === authority.token && latest.current(authority) && workspaceOwnerCurrent(authority.owner);
  };
  useLayoutEffect(() => {
    setGrant(null);
    if (!enabled || !owner || !token) return;
    const authority = { owner, generation, token };
    const controller = new AbortController();
    let granted = false;
    const current = () => !controller.signal.aborted && valid(authority);
    // Both the mounted UI's event handlers and its transport share this live generation.
    const unbind = bindAskCovaAccessAuthority(candidate => granted && candidate === owner && current());
    const transport = createAskCovaTransport(owner, {
      current,
      session: async () => {
        const client = getSupabaseClient();
        const session = client ? (await client.auth.getSession()).data.session : null;
        return session?.access_token === token ? session : null;
      },
      fetch: (...args) => fetch(...args),
    });
    void requestAskCovaAccess(owner, controller.signal, transport, current).then(allowed => {
      if (!current()) return;
      granted = allowed === true;
      if (granted) setGrant(authority);
    });
    const cancel = () => {
      granted = false; controller.abort(); unbind();
      if (cancelAccess.current === cancel) cancelAccess.current = null;
    };
    cancelAccess.current = cancel;
    return cancel;
  }, [enabled, owner, generation, token]);
  // Render checks supplement synchronous revocation; they do not replace it.
  return { enabled: grant !== null && valid(grant), revoke };
}
