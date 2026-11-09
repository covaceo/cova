import { parseAskCovaConversation, type AskCovaConversation } from './askCovaConversation';
import { buildAskCovaDataContext, parseAskCovaDataSnapshot } from './askCovaData';
import { uniqueJson } from './askCovaJson';
import { parseAskCovaQueryPlan, executeAskCovaQuery } from './askCovaQuery';
import { renderAskCovaQueryAnswer, askCovaQueryHistoryText } from './askCovaQueryAnswer';
import { authorizedTransport, askCovaAccessCurrent, askCovaTransportCurrent, ASK_COVA_SESSION_TIMEOUT_MS } from './askCovaClient';

export const ASK_COVA_QUERY_PROTOCOL = 'ask-cova-v4';
// Mirrors the enforced context/v4 route contracts, not a latency promise:
// each route has two 5s auth/policy phases, then 24s context or 54s work +
// 6s lock cleanup. Every request also resolves its session within 5s.
const AUTH_POLICY_MS = 2 * 5000, CONTEXT_WORK_MS = 24000, PAID_WORK_AND_CLEANUP_MS = 54000 + 6000;
const LOCAL_PREPARATION_MS = 12000, LOCAL_COMPLETION_MS = 12000; // existing 24s allowance, split explicitly
const PAID_ADMISSION_MS = ASK_COVA_SESSION_TIMEOUT_MS + AUTH_POLICY_MS + PAID_WORK_AND_CLEANUP_MS + LOCAL_COMPLETION_MS;
export const ASK_COVA_QUERY_TIMEOUT_MS = 4 * (ASK_COVA_SESSION_TIMEOUT_MS + AUTH_POLICY_MS + CONTEXT_WORK_MS)
  + LOCAL_PREPARATION_MS + PAID_ADMISSION_MS;
export type AskCovaQueryRequest = {
  owner: string; account: string; range: 'today' | 'week' | 'all';
  requestId: string; conversation: AskCovaConversation;
  previousSnapshotDigest?: string; // Local history binding; never sent as a wire field.
};
const unavailable = (message = 'Saved account data could not be checked. Try again when you’re ready.') => ({ status: 'unavailable' as const, message });
const exactKeys = (value: unknown, keys: string[]) => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === keys.sort().join(',');
function cancel(response: Response) { void response.body?.cancel().catch(() => {}); }
async function read(response: Response, signal: AbortSignal, maxBytes: number) {
  if (Number(response.headers.get('Content-Length')) > maxBytes) { cancel(response); throw Error('Response too large'); }
  if (!response.body) throw Error('Missing response');
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  let bytes = 0, text = '';
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read(); signal.throwIfAborted();
      if (done) return uniqueJson(text + decoder.decode());
      bytes += value.byteLength; if (bytes > maxBytes) throw Error('Response too large');
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) { abort(); throw error; }
  finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}
function failureMessage(status: number, data: unknown): string | undefined {
  if (!exactKeys(data, ['status', 'error'])) return;
  const value = data as { status: string; error: string };
  if (value.status !== 'unavailable') return;
  const messages: Record<string, [number[], string]> = {
    account_data_unavailable: [[422, 503], 'The saved account data needed for this answer is unavailable. Your data is unchanged.'],
    query_invalid: [[422], "That query isn't supported in this saved-data view. Try asking for a simpler comparison or specific saved fields."],
    needs_narrowing: [[422], 'There is too much saved data for this answer. Narrow the account, date range, or fields, then send again.'],
    context_too_large: [[422], 'This request is too large. Narrow the question or saved-data range, then send again.'],
    workspace_too_large: [[422], 'The complete saved account data is too large to check safely. No partial data is used.'],
    scope_required: [[422], 'This question needs a different saved-data range. Choose the account and range yourself, then send it again.'],
    context_changed: [[409], 'Your saved account data changed. Let it finish syncing, then ask again.'],
    request_in_progress: [[429], "The previous request hasn't cleared yet. Wait a moment, then try again."],
    duplicate_request: [[429], 'Ask Cova has already received this request. Ask a new question to continue.'],
    daily_limit: [[429], "You've reached Ask Cova's daily question limit. Your data is unchanged."],
    budget_exhausted: [[429], "Ask Cova has reached its usage limit and can't answer right now. Your data is unchanged."],
    rate_limited: [[429], 'Too many questions in a short time. Wait a moment before asking Cova again.'],
    budget_unavailable: [[503], "Ask Cova can't check its availability right now. Your data is unchanged."],
  };
  const match = Object.prototype.hasOwnProperty.call(messages, value.error) ? messages[value.error] : undefined;
  return match?.[0].includes(status) ? match[1] : undefined;
}
/** Called only by deliberate Send/retry, never mount/background effects. */
export async function requestAskCovaQuery(input: AskCovaQueryRequest, callerSignal: AbortSignal,
  transport: typeof fetch = authorizedTransport(input.owner, { boundedSession: true }), current: () => boolean = () => askCovaAccessCurrent(input.owner),
  sharedDeadline?: number) {
  const deadline = new AbortController(), signal = AbortSignal.any([callerSignal, deadline.signal]);
  // The UI may share its post-capture deadline, never extend this client's cap.
  const start = performance.now();
  const end = sharedDeadline === undefined ? start + ASK_COVA_QUERY_TIMEOUT_MS :
    Math.min(start + ASK_COVA_QUERY_TIMEOUT_MS, Number.isFinite(sharedDeadline) ? sharedDeadline : start);
  const timer = setTimeout(() => deadline.abort(), Math.max(0, end - start));
  const check = () => {
    if (performance.now() >= end) deadline.abort();
    signal.throwIfAborted();
    if (!current() || !askCovaTransportCurrent(transport, input.owner)) throw Error('Authority changed');
  };
  try {
    check();
    const conversation = parseAskCovaConversation(input.conversation);
    if (!conversation) return unavailable();
    const scope = { owner: input.owner, account: input.account, range: input.range }, requestId = input.requestId, previousSnapshotDigest = input.previousSnapshotDigest;
    const post = async (body: unknown) => {
      check();
      const pending = transport('/api/workspace', { method: 'POST', cache: 'no-store', signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let aborted: (() => void) | undefined;
      let response: Response;
      try {
        response = await Promise.race([
          pending.then(value => { try { check(); } catch (error) { cancel(value); throw error; } return value; }),
          new Promise<never>((_, reject) => {
            aborted = () => reject(Error('Request cancelled'));
            signal.addEventListener('abort', aborted, { once: true });
            if (signal.aborted) aborted();
          }),
        ]);
      } finally { if (aborted) signal.removeEventListener('abort', aborted); }
      try { check(); } catch (error) { cancel(response); throw error; }
      return response;
    };
    // One intentional complete read, not a retry: at most four bounded pages.
    // The cursor pins bytes; it never replaces fresh server authorization.
    let data: unknown, assembled: Uint8Array<ArrayBuffer> | undefined, snapshotHash = '', totalBytes = 0, offset = 0;
    let contextBody: Record<string, unknown> = { action: 'ask_cova_context', ...scope };
    for (let page = 0; page < 4; page++) {
      const response = await post(contextBody);
      if (!response.ok) { const failure = await read(response, signal, 2048); check(); return unavailable(failureMessage(response.status, failure)); }
      const value = await read(response, signal, 2_800_000); check();
      if (page === 0 && value?.version !== 'ask-cova-context-page-v1') { data = value; break; }
      if (!exactKeys(value, ['version', 'owner', 'snapshotHash', 'totalBytes', 'offset', 'nextOffset', 'encoding', 'chunk']) ||
          value.version !== 'ask-cova-context-page-v1' || value.owner !== scope.owner || value.encoding !== 'base64' ||
          typeof value.snapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.snapshotHash) ||
          !Number.isSafeInteger(value.totalBytes) || value.totalBytes <= 2_097_152 || value.totalBytes > 8_388_608 ||
          value.offset !== offset) throw Error('Invalid context page');
      if (page === 0) {
        snapshotHash = value.snapshotHash; totalBytes = value.totalBytes;
        assembled = new Uint8Array(totalBytes);
      } else if (value.snapshotHash !== snapshotHash || value.totalBytes !== totalBytes) throw Error('Context changed');
      const length = Math.min(2_097_152, totalBytes - offset), end = offset + length;
      if (value.nextOffset !== (end === totalBytes ? null : end) || typeof value.chunk !== 'string' ||
          value.chunk.length !== 4 * Math.ceil(length / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.chunk))
        throw Error('Invalid context chunk');
      const decoded = atob(value.chunk);
      if (decoded.length !== length || btoa(decoded) !== value.chunk) throw Error('Noncanonical context encoding');
      assembled!.set(Uint8Array.from(decoded, c => c.charCodeAt(0)), offset);
      check();
      if (end === totalBytes) {
        const digest = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', assembled!)), b => b.toString(16).padStart(2, '0')).join('');
        check();
        if (digest !== snapshotHash) throw Error('Context hash mismatch');
        data = uniqueJson(new TextDecoder('utf-8', { fatal: true }).decode(assembled!));
        check(); break;
      }
      offset = end;
      contextBody = { action: 'ask_cova_context', ...scope, cursor: {
        version: 'ask-cova-context-page-v1', owner: scope.owner, snapshotHash, totalBytes, offset,
      } };
    }
    const snapshot = parseAskCovaDataSnapshot(data);
    if (!snapshot || snapshot.owner !== scope.owner) return unavailable();
    const context = await buildAskCovaDataContext({ snapshot, account: scope.account, range: scope.range, conversation }); check();
    if (previousSnapshotDigest !== undefined && previousSnapshotDigest !== context.snapshotDigest)
      return { ...unavailable('Your saved account data changed. The old conversation was cleared; send your question again to use the updated data.'), revokeHistory: true };
    // Reserve the known session + whole paid route + local completion allowance
    // after pages, decoding and context replay. No paid retry or refund is implied.
    check();
    if (end - performance.now() <= PAID_ADMISSION_MS) return unavailable();
    const answer = await post({ action: 'ask_cova', protocolVersion: ASK_COVA_QUERY_PROTOCOL, ...scope,
      requestId, snapshotDigest: context.snapshotDigest, contextDigest: context.contextDigest, conversation });
    if (!answer.ok) {
      const failure = await read(answer, signal, 2048); check();
      return unavailable(failureMessage(answer.status, failure));
    }
    const wire = await read(answer, signal, 16384); check();
    if (!exactKeys(wire, ['status', 'aiResponseUsed', 'protocolVersion', 'requestId', 'snapshotDigest', 'contextDigest', 'plan', 'planDigest', 'resultDigest', 'answer'])
      || wire.status !== 'ok' || wire.aiResponseUsed !== true || wire.protocolVersion !== ASK_COVA_QUERY_PROTOCOL
      || wire.requestId !== requestId || wire.snapshotDigest !== context.snapshotDigest || wire.contextDigest !== context.contextDigest) return unavailable();
    const plan = parseAskCovaQueryPlan(wire.plan);
    if (!plan) return unavailable();
    // Do not accept a server fact table. Replay against this deliberate action's
    // captured complete snapshot and locally reissue all atoms/supports.
    const result = await executeAskCovaQuery(context, plan); check();
    if (wire.planDigest !== result.planDigest || wire.resultDigest !== result.resultDigest) return unavailable();
    const rendered = renderAskCovaQueryAnswer(result, wire.answer), historyText = askCovaQueryHistoryText(result, wire.answer);
    if (!rendered || !historyText) return unavailable();
    check();
    return { status: 'ok' as const, reply: Object.freeze({ ...rendered, contextDigest: context.contextDigest, snapshotDigest: context.snapshotDigest, snapshot }), historyText };
  } catch { return unavailable(); }
  finally { clearTimeout(timer); }
}
