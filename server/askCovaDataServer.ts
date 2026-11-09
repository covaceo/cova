import { createHash } from 'node:crypto';
import { account, uuid, assertRecords, WORKSPACE_DISCLOSURE } from '../src/lib/workspaceValidation';
import { uniqueJson } from '../src/lib/askCovaJson';
import { hasAskCovaAccess } from './askCovaAccess';
import { parseAskCovaDataSnapshot } from '../src/lib/askCovaData';
import { supabaseServiceHeaders } from '../api/_lib/supabase.js';

export class AskCovaDataFailure extends Error {
  constructor(public http: number, public code: string) { super(code); }
}
export function dataFail(http: number, code: string): never { throw new AskCovaDataFailure(http, code); }

// All work (including reading response bodies) shares one monotonic deadline.
// A timeout rejects even a synthetic/noncompliant fetch that ignores its signal.
export class AskCovaDeadline {
  private readonly end: number;
  constructor(ms = 54000) { this.end = performance.now() + Math.min(ms, 54000); }
  check() { if (performance.now() >= this.end) dataFail(503, 'ask_cova_unavailable'); }
  async run<T>(operation: (signal: AbortSignal) => Promise<T>, stageMs: number): Promise<T> {
    this.check();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const expired = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new AskCovaDataFailure(503, 'ask_cova_unavailable')); },
        Math.max(1, Math.min(stageMs, this.end - performance.now())));
    });
    try {
      const value = await Promise.race([Promise.resolve().then(() => {
        this.check(); controller.signal.throwIfAborted();
        return operation(controller.signal);
      }), expired]);
      this.check();
      return value;
    } finally { clearTimeout(timer!); controller.abort(); }
  }
}
export async function readAskCovaJson(response: Response, maxBytes: number, signal: AbortSignal): Promise<any> {
  if (!response.ok || !response.body || signal.aborted) {
    await response.body?.cancel().catch(() => undefined);
    throw Error('Unavailable response');
  }
  const reader = response.body.getReader();
  let cancelling: Promise<void> | undefined;
  const cancel = () => { cancelling ||= reader.cancel().catch(() => undefined); return cancelling; };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      if (signal.aborted) throw Error('Response deadline');
      const { done, value } = await reader.read();
      if (signal.aborted) throw Error('Response deadline');
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw Error('Response limit');
      chunks.push(value);
    }
    return uniqueJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { signal.removeEventListener('abort', cancel); await cancel(); }
}

// Descriptor-first validation: do not evaluate getters/toJSON on injected or
// decoded boundary values. The wire is plain JSON, not executable objects.
export function assertDataObject(value: any, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== keys.length ||
      Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key) ||
        !('value' in Object.getOwnPropertyDescriptor(value, key)!))) dataFail(400, 'invalid_request');
}
export function assertAskCovaDataRequest({ body, rawBody, user, environment: env }: any) {
  if (!hasAskCovaAccess(env, user)) dataFail(404, 'ask_cova_unavailable');
  const paged = body && Object.prototype.hasOwnProperty.call(body, 'cursor');
  assertDataObject(body, paged ? ['action', 'owner', 'account', 'range', 'cursor'] : ['action', 'owner', 'account', 'range']);
  if (paged) {
    assertDataObject(body.cursor, ['version', 'owner', 'snapshotHash', 'totalBytes', 'offset']);
    const c = body.cursor;
    if (c.version !== CONTEXT_PAGE_VERSION || c.owner !== body.owner ||
        typeof c.snapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(c.snapshotHash) ||
        !Number.isSafeInteger(c.totalBytes) || c.totalBytes <= CONTEXT_PAGE_BYTES || c.totalBytes > MAX_BYTES ||
        !Number.isSafeInteger(c.offset) || c.offset <= 0 || c.offset >= c.totalBytes || c.offset % CONTEXT_PAGE_BYTES !== 0)
      dataFail(400, 'invalid_request');
  }
  if (typeof rawBody === 'string') {
    if (Buffer.byteLength(rawBody) > 4096) dataFail(413, 'request_too_large');
    try { uniqueJson(rawBody); } catch { dataFail(400, 'invalid_request'); }
  }
  if (body.action !== 'ask_cova_context' || !uuid(user.id) || body.owner !== user.id ||
      !account(body.account) || !['today', 'week', 'all'].includes(body.range)) dataFail(400, 'invalid_request');
  if (Buffer.byteLength(JSON.stringify(body)) > 4096) dataFail(413, 'request_too_large');
}

// Independent read-set fingerprints detect changed tables; they are NOT a
// cross-table transaction or broker-history completeness attestation.
const TABLES = [
  ['workspace_records', 'kind,record_id,account_id,schema_version,payload,revision,created_at,updated_at,deleted_at', 'kind.asc,record_id.asc'],
  ['passport_rule_plans', 'id,owner_id,limits,created_at', 'id.asc'],
  ['passport_session_reviews', 'owner_id,session_day,account_key,note,xp,reason,revision,evidence_hash,evidence_as_of,updated_at', 'session_day.asc,account_key.asc'],
  ['passport_reward_days', 'owner_id,session_day,account_key', 'session_day.asc'],
] as const;
const MAX_BYTES = 8_388_608;
const CONTEXT_PAGE_VERSION = 'ask-cova-context-page-v1';
// 2MiB decoded -> <2.8MB JSON, comfortably below the hosting response limit.
const CONTEXT_PAGE_BYTES = 2_097_152;
// Also used on injected transport values: validation must precede stringify,
// projection and field reads, not merely validate the projected output.
export function inertData(value: unknown): any {
  let nodes = 0;
  const visit = (v: any, depth: number): any => {
    if (++nodes > 600000 || depth > 32) dataFail(503, 'account_data_unavailable');
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (!v || typeof v !== 'object') dataFail(503, 'account_data_unavailable');
    if (Array.isArray(v)) {
      if (Object.getPrototypeOf(v) !== Array.prototype || v.length > 10000 || Reflect.ownKeys(v).length !== v.length + 1) dataFail(503, 'account_data_unavailable');
      const out = [];
      for (let i = 0; i < v.length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !('value' in d)) dataFail(503, 'account_data_unavailable');
        out.push(visit(d.value, depth + 1));
      }
      return out;
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(v))) dataFail(503, 'account_data_unavailable');
    const out: Record<string, any> = {};
    for (const k of Reflect.ownKeys(v)) {
      const d = Object.getOwnPropertyDescriptor(v, k)!;
      if (typeof k !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(k) || !('value' in d)) dataFail(503, 'account_data_unavailable');
      out[k] = visit(d.value, depth + 1);
    }
    return out;
  };
  return visit(value, 0);
}
function canonical(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
const fingerprint = (value: any) => createHash('sha256').update(canonical(value)).digest('hex');

export async function readAskCovaSourceData(owner: string, rawRest: any, deadline = new AskCovaDeadline()) {
  if (!uuid(owner)) dataFail(400, 'invalid_request');
  const rest = (path: string, options: any) => deadline.run(signal => rawRest(path, { ...options, signal }), 10000);
  const settings = async () => {
    const rows = inertData(await rest('workspace_settings', { query: { owner_id: 'eq.' + owner,
      select: 'disclosure_version,revision,pending_manifest', limit: '1' } }));
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.disclosure_version !== WORKSPACE_DISCLOSURE ||
        rows[0].pending_manifest !== null || !Number.isSafeInteger(rows[0].revision) || rows[0].revision < 0) dataFail(409, 'workspace_unavailable');
    return rows[0];
  };
  const before = await settings();
  const settingsHash = fingerprint(before);
  const checkSettings = async () => { if (fingerprint(await settings()) !== settingsHash) dataFail(409, 'context_changed'); };
  const readTables = async (specs: readonly (typeof TABLES[number])[]) => {
    let totalBytes = 0;
    const result: Record<string, any[]> = {};
    for (const [path, select, order] of specs) {
      const rows: any[] = [];
      let pages = 0;
      while (true) {
        if (++pages > 101) dataFail(422, 'workspace_too_large');
        const page = inertData(await rest(path, { query: { owner_id: 'eq.' + owner,
          select, order, limit: '250', offset: String(rows.length) } }));
        if (!Array.isArray(page)) dataFail(503, 'account_data_unavailable');
        const bytes = Buffer.byteLength(JSON.stringify(page)); totalBytes += bytes;
        if (page.length > 250 || rows.length + page.length > 10000 || bytes > 2_097_152 || totalBytes > MAX_BYTES) dataFail(422, 'workspace_too_large');
        if (!page.length) break; // A short nonempty page is never completeness.
        for (const row of page) {
          try { assertDataObject(row, select.split(',')); } catch { dataFail(503, 'account_data_unavailable'); }
          if (path !== 'workspace_records' && row.owner_id !== owner) dataFail(503, 'account_data_unavailable');
        }
        rows.push(...page);
      }
      result[path] = rows;
    }
    return result;
  };
  const rows = await readTables(TABLES);
  const records = rows.workspace_records.map(r => ({ kind: r.kind, recordId: r.record_id, accountId: r.account_id,
    schemaVersion: r.schema_version, payload: r.payload, revision: r.revision,
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at }));
  try { assertRecords(records); } catch { dataFail(503, 'account_data_unavailable'); }
  if (records.some(r => r.revision > before.revision)) dataFail(503, 'account_data_unavailable');
  const passport = TABLES.slice(1);
  const hashes = passport.map(([path]) => fingerprint(rows[path]));
  const recheck = async () => {
    await checkSettings();
    const fresh = await readTables(passport);
    if (passport.some(([path], i) => fingerprint(fresh[path]) !== hashes[i])) dataFail(409, 'context_changed');
    await checkSettings();
  };
  await recheck();
  const snapshot = { version: 'ask-cova-data-v1' as const, owner, workspaceRevision: before.revision,
    workspaceRecords: records.filter(r => r.kind !== 'broker_cash'),
    passportPlans: rows.passport_rule_plans, passportReviews: rows.passport_session_reviews,
    passportRewards: rows.passport_reward_days,
    complete: { workspace: true, passportPlans: true, passportReviews: true, passportRewards: true } };
  if (Buffer.byteLength(JSON.stringify(snapshot)) > MAX_BYTES) dataFail(422, 'workspace_too_large');
  const validated = parseAskCovaDataSnapshot(snapshot);
  if (!validated) dataFail(503, 'account_data_unavailable');
  deadline.check();
  return { snapshot: validated, recheck };
}

export function askCovaStorageRest(env: any, fetchImpl: typeof fetch) {
  return async (path: string, options: any) => {
    if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL ||
        (path !== 'workspace_settings' && !TABLES.some(t => t[0] === path)) || options.body !== undefined) dataFail(503, 'account_data_unavailable');
    const url = new URL(env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path);
    for (const [key, value] of Object.entries(options.query)) url.searchParams.set(key, String(value));
    try {
      const response = await fetchImpl(url, { method: 'GET', redirect: 'error',
        headers: supabaseServiceHeaders(env.SUPABASE_SERVICE_ROLE_KEY), signal: options.signal });
      return await readAskCovaJson(response, path === 'workspace_settings' ? 4096 : 2_097_152, options.signal);
    } catch (error) {
      if (error instanceof Error && error.message === 'Response limit') dataFail(422, 'workspace_too_large');
      dataFail(503, 'account_data_unavailable');
    }
  };
}
export function createAskCovaContextHandler({ fetchImpl = fetch }: any = {}) {
  return async (request: any, res: any) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      assertAskCovaDataRequest(request);
      const deadline = new AskCovaDeadline(24000);
      const { snapshot } = await readAskCovaSourceData(request.user.id,
        request.rest || askCovaStorageRest(request.environment, fetchImpl), deadline);
      const bytes = Buffer.from(JSON.stringify(snapshot), 'utf8');
      const cursor = request.body.cursor;
      const snapshotHash = createHash('sha256').update(bytes).digest('hex');
      // A cursor is only a consistency assertion, never an access capability.
      // Every page repeats authorization and the complete validated owner read.
      if (cursor && (cursor.snapshotHash !== snapshotHash || cursor.totalBytes !== bytes.length))
        dataFail(409, 'context_changed');
      deadline.check();
      if (!cursor && bytes.length <= CONTEXT_PAGE_BYTES) return res.status(200).json(snapshot);
      const offset = cursor?.offset ?? 0, end = Math.min(offset + CONTEXT_PAGE_BYTES, bytes.length);
      return res.status(200).json({ version: CONTEXT_PAGE_VERSION, owner: snapshot.owner,
        snapshotHash, totalBytes: bytes.length, offset, nextOffset: end === bytes.length ? null : end,
        encoding: 'base64', chunk: bytes.subarray(offset, end).toString('base64') });
    } catch (error) {
      const known = error instanceof AskCovaDataFailure;
      return res.status(known ? error.http : 503).json({ status: 'unavailable', error: known ? error.code : 'account_data_unavailable' });
    }
  };
}
