// Cosmetic preferences only. Never use user-editable metadata for authorization.
export type HomeScreenPreferences = { installed: boolean; dismissed: boolean };
export type HomeScreenRepository = {
  load: (owner: string, signal?: AbortSignal) => Promise<HomeScreenPreferences>;
  remember: (owner: string, kind: 'installed' | 'dismissed', signal?: AbortSignal) => Promise<void>;
};
type Session = { user: { id: string }; access_token: string } | null;
type Dependencies = { getSession: () => Promise<Session>; url: string; key: string; fetcher?: typeof fetch };
export function createHomeScreenRepository({ getSession, url, key, fetcher = fetch }: Dependencies): HomeScreenRepository {
  async function request(owner: string, data?: Record<string, true>, signal?: AbortSignal) {
    const session = await getSession();
    if (!owner || session?.user.id !== owner || !session.access_token || signal?.aborted) throw Error('Session changed.');
    // Pin the bearer token to this owner before the async request. An account switch
    // must never retarget an in-flight cosmetic preference write to the new user.
    const response = await fetcher(new URL('/auth/v1/user', url).href, {
      method: data ? 'PUT' : 'GET', cache: 'no-store', redirect: 'error',
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: key, 'Content-Type': 'application/json' },
      ...(data ? { body: JSON.stringify({ data }) } : {}),
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10000)]),
    });
    if (!response.ok) throw Error('Home Screen preference unavailable.');
    const user = await response.json();
    if (user?.id !== owner || (await getSession())?.user.id !== owner || signal?.aborted) throw Error('Session changed.');
    return { installed: user.user_metadata?.cova_home_screen_seen === true, dismissed: user.user_metadata?.cova_home_screen_dismissed === true };
  }
  return {
    load: (owner, signal) => request(owner, undefined, signal),
    async remember(owner, kind, signal) {
      const flag = kind === 'installed' ? 'cova_home_screen_seen' : 'cova_home_screen_dismissed';
      await request(owner, { [flag]: true }, signal);
      const verified = await request(owner, undefined, signal);
      if (!verified[kind]) throw Error('Home Screen preference was not saved.');
    },
  };
}
