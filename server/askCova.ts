import { supabaseServiceHeaders } from '../api/_lib/supabase.js';
import { assertRecords, WORKSPACE_DISCLOSURE, uuid, account } from '../src/lib/workspaceValidation';
import type { Trade } from '../src/lib/risk';
import { buildAskCovaCatalog, askCovaModelPayload, renderAskCovaSelection } from '../src/lib/askCova';
import { acquireAskCovaPermit, askCovaBudgetConfiguration } from './askCovaBudget';
import { hasAskCovaAccess } from './askCovaAccess';

const MODEL = 'gpt-6-luna';
const PROVIDER_URL = 'https://api.openai.com/v1/responses';
const PROMPT = 'Select one verified observation for Cova AI. Choose the most useful eligible choice, not the most flattering. Return only an existing choice_id and plain, warm or direct style. Do not write prose, calculate, infer emotions, give advice or call tools. The application owns every fact and phrase.';
class AskFailure extends Error {
  constructor(public http: number, public code: string) { super(code); }
}
const fail = (http: number, code: string): never => { throw new AskFailure(http, code); };

// JSON.parse alone silently accepts duplicate properties (including escaped keys).
export function uniqueJson(text: string): any {
  const parsed = JSON.parse(text);
  const tokens = text.match(/"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) || [];
  let cursor = 0;
  const value = (depth: number) => {
    if (depth > 32) throw Error('JSON depth');
    const token = tokens[cursor++];
    if (token === '{') {
      const seen = new Set<string>();
      while (tokens[cursor] !== '}') {
        const key = JSON.parse(tokens[cursor++]);
        if (seen.has(key)) throw Error('Duplicate JSON property');
        seen.add(key); cursor++; value(depth + 1);
        if (tokens[cursor] === ',') cursor++; else break;
      }
      cursor++;
    } else if (token === '[') {
      while (tokens[cursor] !== ']') { value(depth + 1); if (tokens[cursor] === ',') cursor++; else break; }
      cursor++;
    }
  };
  value(0);
  return parsed;
}
async function boundedJson(response: Response, maxBytes: number): Promise<any> {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw Error('Unavailable response');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw Error('Response limit');
      chunks.push(value);
    }
    return uniqueJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { await reader.cancel().catch(() => undefined); }
}
function checkedSelection(raw: any, catalog: Awaited<ReturnType<typeof buildAskCovaCatalog>>) {
  const output = raw?.output, usage = raw?.usage;
  if (raw?.model !== MODEL || raw.status !== 'completed' || raw.service_tier !== 'default' ||
      raw.error != null || raw.incomplete_details != null || !usage ||
      !Number.isSafeInteger(usage.input_tokens) || usage.input_tokens < 0 || usage.input_tokens > 28096 ||
      !Number.isSafeInteger(usage.output_tokens) || usage.output_tokens < 0 || usage.output_tokens > 120 ||
      !Array.isArray(output) || output.length !== 1) throw Error('Invalid response');
  const message = output[0];
  if (message?.type !== 'message' || message.role !== 'assistant' || message.status !== 'completed' ||
      !Array.isArray(message.content) || message.content.length !== 1) throw Error('Invalid message');
  const part = message.content[0];
  if (part?.type !== 'output_text' || typeof part.text !== 'string' || Buffer.byteLength(part.text) > 512 ||
      part.annotations !== undefined && (!Array.isArray(part.annotations) || part.annotations.length)) throw Error('Invalid text');
  const selection = uniqueJson(part.text);
  if (!renderAskCovaSelection(catalog, selection)) throw Error('Invalid selection');
  return { choice_id: selection.choice_id, style: selection.style };
}
export function assertAskCovaRequestBytes(serialized: string) {
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized) > 24000) fail(422, 'context_too_large');
}
function providerPayload(catalog: Awaited<ReturnType<typeof buildAskCovaCatalog>>) {
  return JSON.stringify({ model: MODEL, store: false, reasoning: { effort: 'none' },
    prompt_cache_options: { mode: 'explicit' }, tools: [], max_output_tokens: 120, service_tier: 'default',
    input: [{ role: 'developer', content: PROMPT }, { role: 'user', content: JSON.stringify(askCovaModelPayload(catalog)) }],
    text: { format: { type: 'json_schema', name: 'cova_insight_choice', strict: true,
      schema: { type: 'object', properties: { choice_id: { type: 'string', enum: catalog.candidates.map(c => c.id) },
        style: { type: 'string', enum: ['plain', 'warm', 'direct'] } }, required: ['choice_id', 'style'], additionalProperties: false } } },
  });
}
async function savedSnapshot(owner: string, rest: any) {
  const settings = async () => {
    const rows = await rest('workspace_settings', { query: { owner_id: 'eq.' + owner,
      select: 'disclosure_version,revision,pending_manifest', limit: '1' } });
    const value = rows?.[0];
    if (!Array.isArray(rows) || rows.length !== 1 || value.disclosure_version !== WORKSPACE_DISCLOSURE ||
        value.pending_manifest !== null || !Number.isSafeInteger(value.revision) || value.revision < 0) fail(409, 'workspace_unavailable');
    return value;
  };
  const before = await settings();
  const records: any[] = [];
  let pages = 0, bytes = 0;
  while (true) {
    if (++pages > 101) fail(422, 'workspace_too_large');
    const page = await rest('workspace_records', { query: { owner_id: 'eq.' + owner,
      select: 'kind,record_id,account_id,schema_version,payload,revision,created_at,updated_at,deleted_at',
      order: 'kind.asc,record_id.asc', limit: '250', offset: String(records.length) } });
    if (!Array.isArray(page)) fail(503, 'workspace_unavailable');
    const pageBytes = Buffer.byteLength(JSON.stringify(page)); bytes += pageBytes;
    if (page.length > 250 || pageBytes > 2_097_152 || bytes > 8_388_608 || records.length + page.length > 10000) fail(422, 'workspace_too_large');
    if (!page.length) break;
    records.push(...page.map((r: any) => ({ kind: r.kind, recordId: r.record_id, accountId: r.account_id,
      schemaVersion: r.schema_version, payload: r.payload, revision: r.revision,
      createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at })));
  }
  assertRecords(records);
  const fingerprint = JSON.stringify(before);
  const recheck = async () => { if (JSON.stringify(await settings()) !== fingerprint) fail(409, 'context_changed'); };
  await recheck();
  return { trades: records.filter(r => r.kind === 'trade' && !r.deletedAt).map(r => r.payload as unknown as Trade), recheck };
}
function storageRest(env: any, fetchImpl: typeof fetch) {
  return async (path: string, options: any) => {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) fail(503, 'workspace_unavailable');
    const url = new URL(env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path);
    for (const [key, value] of Object.entries(options.query)) url.searchParams.set(key, String(value));
    const response = await fetchImpl(url, { method: 'GET', redirect: 'error',
      headers: supabaseServiceHeaders(env.SUPABASE_SERVICE_ROLE_KEY), signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      fail(503, 'workspace_unavailable');
    }
    try { return await boundedJson(response, path === 'workspace_settings' ? 4096 : 2_097_152); }
    catch (error) { if (error instanceof Error && error.message === 'Response limit') fail(422, 'workspace_too_large'); throw error; }
  };
}
export function createAskCovaHandler({ acquirePermit = acquireAskCovaPermit, fetchImpl = fetch }: any = {}) {
  return async ({ body, rawBody, user, environment: env, rest }: any, res: any) => {
    let permit: any;
    try {
      if (!hasAskCovaAccess(env, user)) fail(404, 'ask_cova_unavailable');
      if (typeof env.OPENAI_API_KEY !== 'string' ||
          env.OPENAI_API_KEY.length < 16 || env.OPENAI_API_KEY.length > 4096 || /\s/.test(env.OPENAI_API_KEY)) fail(503, 'ask_cova_unavailable');
      if (Buffer.byteLength(typeof rawBody === 'string' ? rawBody : JSON.stringify(body)) > 4096) fail(413, 'request_too_large');
      if (typeof rawBody === 'string') { try { uniqueJson(rawBody); } catch { fail(400, 'invalid_request'); } }
      const keys = ['action', 'owner', 'account', 'range', 'question', 'contextDigest', 'consentVersion', 'requestId'];
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== keys.length ||
          Object.keys(body).some(key => !keys.includes(key)) || body.action !== 'ask_cova' ||
          !uuid(user.id) || body.owner !== user.id || !uuid(body.requestId) || !account(body.account) ||
          !['today', 'week', 'all'].includes(body.range) ||
          !['review_results', 'explain_drawdown', 'what_stands_out'].includes(body.question) ||
          typeof body.contextDigest !== 'string' || !/^[a-f0-9]{64}$/.test(body.contextDigest) ||
          body.consentVersion !== 'ask-cova-v1') fail(400, 'invalid_request');
      askCovaBudgetConfiguration(env);
      const snapshot = await savedSnapshot(user.id, rest || storageRest(env, fetchImpl));
      const catalog = await buildAskCovaCatalog({ ownerId: user.id, account: body.account, range: body.range, question: body.question, trades: snapshot.trades });
      if (catalog.contextDigest !== body.contextDigest) fail(409, 'context_changed');
      const payload = providerPayload(catalog);
      assertAskCovaRequestBytes(payload);
      permit = await acquirePermit({ ownerId: user.id, requestId: body.requestId, env });
      if (!permit?.allowed) fail(429, 'rate_limited');
      let selection;
      try {
        const response = await fetchImpl(PROVIDER_URL, { method: 'POST', redirect: 'error',
          headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: payload, signal: AbortSignal.timeout(15000) });
        selection = checkedSelection(await boundedJson(response, 65536), catalog);
      } catch { fail(502, 'provider_unavailable'); }
      await snapshot.recheck();
      return res.status(200).json({ status: 'ok', aiResponseUsed: true, contextDigest: catalog.contextDigest, selection });
    } catch (error) {
      const known = error instanceof AskFailure;
      return res.status(known ? error.http : 503).json({ status: 'unavailable', error: known ? error.code : 'ask_cova_unavailable' });
    } finally { if (permit?.allowed) await permit.release().catch(() => undefined); }
  };
}
