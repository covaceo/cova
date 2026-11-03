import type { AskCovaQuestion } from './askCova';
import { getSupabaseClient } from './supabaseClient';
import { workspaceOwnerCurrent } from './workspaceClient';

type Session = { user: { id: string }; access_token: string } | null;
// In-memory, generation-bound authority. Never restored from browser storage.
let accessAuthority: (owner: string) => boolean = () => false;
export const askCovaAccessCurrent = (owner: string) => accessAuthority(owner) && workspaceOwnerCurrent(owner);
export function bindAskCovaAccessAuthority(authority: (owner: string) => boolean) {
  accessAuthority = authority;
  return () => { if (accessAuthority === authority) accessAuthority = () => false; };
}
async function liveSession(): Promise<Session> {
  const client = getSupabaseClient();
  return client ? (await client.auth.getSession()).data.session : null;
}
function authorizedTransport(owner: string): typeof fetch {
  const authority = accessAuthority;
  return createAskCovaTransport(owner, {
    current: () => authority === accessAuthority && authority(owner) && workspaceOwnerCurrent(owner),
    session: liveSession, fetch: (...args) => fetch(...args),
  });
}
// Keep the same live authority through headers AND body decoding.
const transportAuthorities = new WeakMap<typeof fetch, (owner: string) => boolean>();
export function createAskCovaTransport(owner: string, dependencies: {
  current: () => boolean; session: () => Promise<Session>; fetch: typeof fetch;
} = {
  current: () => workspaceOwnerCurrent(owner),
  session: async () => { const client = getSupabaseClient(); return client ? (await client.auth.getSession()).data.session : null; },
  fetch: (...args) => fetch(...args),
}): typeof fetch {
  const transport: typeof fetch = async (input, init = {}) => {
    init.signal?.throwIfAborted();
    if (!dependencies.current()) throw Error('Session changed');
    const session = await dependencies.session();
    init.signal?.throwIfAborted();
    if (!dependencies.current() || session?.user.id !== owner || !session.access_token) throw Error('Session changed');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${session.access_token}`);
    const response = await dependencies.fetch(input, { ...init, headers, credentials: 'same-origin' });
    if (init.signal?.aborted || !dependencies.current()) { cancelResponse(response); throw Error('Session changed'); }
    return response;
  };
  transportAuthorities.set(transport, candidate => candidate === owner && dependencies.current());
  return transport;
}

export const ASK_COVA_PROTOCOL = 'ask-cova-v2';
export type AskCovaRequest = {
  owner: string; account: string; range: 'today' | 'week' | 'all';
  question: AskCovaQuestion;
  contextDigest: string; requestId: string;
};
export type AskCovaResponse =
  | { status: 'ok'; aiResponseUsed: true; contextDigest: string; selection: { choice_id: string; style: 'plain' | 'warm' | 'direct' } }
  | { status: 'unavailable'; message: string };

const MAX_RESPONSE_BYTES = 4096;
/** Discovery is read-only: never send account data, consent, or a question. */
export async function requestAskCovaAccess(owner: string, signal: AbortSignal,
  transport: typeof fetch = createAskCovaTransport(owner),
  current: () => boolean = () => (transportAuthorities.get(transport) ?? workspaceOwnerCurrent)(owner)): Promise<boolean> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 8000);
  let rejectAborted: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    if (!current()) return false;
    const pendingResponse = transport('/api/workspace', {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ask_cova_access', owner }),
    });
    // Bound auth resolution and headers too; never wait forever on an uncooperative source.
    const response = await Promise.race([
      pendingResponse.then(response => {
        if (controller.signal.aborted) { cancelResponse(response); throw Error('Aborted'); }
        return response;
      }),
      new Promise<never>((_, reject) => {
        rejectAborted = () => reject(Error('Aborted'));
        controller.signal.addEventListener('abort', rejectAborted, { once: true });
        if (controller.signal.aborted) rejectAborted();
      }),
    ]);
    if (!response.ok) { cancelResponse(response); return false; }
    const data: unknown = JSON.parse(await readBoundedResponse(response, controller.signal));
    controller.signal.throwIfAborted();
    return current() && data !== null && typeof data === 'object' && !Array.isArray(data)
      && Object.keys(data).sort().join(',') === 'enabled,owner'
      && (data as { owner: unknown }).owner === owner && (data as { enabled: unknown }).enabled === true;
  } catch { return false; }
  finally {
    clearTimeout(timeout); signal.removeEventListener('abort', abort);
    if (rejectAborted) controller.signal.removeEventListener('abort', rejectAborted);
  }
}
function cancelResponse(response: Response) {
  void response.body?.cancel().catch(() => {});
}
async function readBoundedResponse(response: Response, signal: AbortSignal): Promise<string> {
  const length = response.headers.get('Content-Length');
  if (length !== null && Number(length) > MAX_RESPONSE_BYTES) {
    cancelResponse(response);
    throw Error('Response too large');
  }
  if (!response.body) throw Error('Missing response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let bytes = 0, text = '';
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw Error('Response too large');
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    cancel();
    throw error;
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

/** Only deliberate question/retry actions call this transport. No notes or trade payload leaves this client. */
export async function requestAskCova(input: AskCovaRequest, signal: AbortSignal, transport: typeof fetch = authorizedTransport(input.owner),
  current: () => boolean = () => (transportAuthorities.get(transport) ?? workspaceOwnerCurrent)(input.owner)): Promise<AskCovaResponse> {
  const unavailable = (status = 0): AskCovaResponse => ({ status: 'unavailable', message:
    status === 401 ? 'Your session changed. Sign in again to ask Cova.' :
    status === 403 ? 'Ask Cova needs saved account storage and an active session.' :
    status === 409 ? 'Your saved trades changed. Let them finish syncing, then ask again.' :
    status === 429 ? 'Ask Cova has reached its limit for now. Your trades are still here.' :
    status === 404 ? 'Ask Cova is not available yet.' :
    "I couldn't check that answer. Your trades are unchanged. Try again when you're ready." });
  try {
    signal.throwIfAborted();
    if (!current()) return unavailable(401);
    const response = await transport('/api/workspace', {
      method: 'POST', cache: 'no-store', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ask_cova', owner: input.owner, account: input.account,
        range: input.range, question: input.question, contextDigest: input.contextDigest,
        requestId: input.requestId, protocolVersion: ASK_COVA_PROTOCOL }),
    });
    if (!response.ok) { cancelResponse(response); return unavailable(response.status); }
    const text = await readBoundedResponse(response, signal);
    if (!current()) return unavailable(401);
    const data = JSON.parse(text);
    const selection = data?.selection;
    if (data?.status !== 'ok' || data.aiResponseUsed !== true || data.contextDigest !== input.contextDigest ||
      !selection || Object.keys(selection).sort().join(',') !== 'choice_id,style' ||
      typeof selection.choice_id !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(selection.choice_id) ||
      !['plain', 'warm', 'direct'].includes(selection.style)) return unavailable();
    return { status: 'ok', aiResponseUsed: true, contextDigest: data.contextDigest,
      selection: { choice_id: selection.choice_id, style: selection.style } };
  } catch { return unavailable(); }
}
