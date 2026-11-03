import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import load from './helpers/load-ts.cjs';
const server = existsSync('server/askCova.ts') ? load('server/askCova.ts') : {};
const { createWorkspaceHandler } = load('server/workspace.ts');
const core = load('src/lib/askCova.ts');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const env = { WORKSPACE_SYNC_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa', SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co', ASK_COVA_ENABLED: 'true', ASK_COVA_BETA_USER_ID: A, OPENAI_API_KEY: 'synthetic-only-not-a-real-credential', ASK_COVA_BUDGET_ID: 'synthetic-campaign', ASK_COVA_BUDGET_MICRO_USD: '1000000', KV_REST_API_URL: 'https://synthetic.upstash.io', KV_REST_API_TOKEN: 'synthetic-only-not-a-credential-123456789' };
const body = { action: 'ask_cova', owner: A, account: 'Tradovate:7', range: 'all', question: 'review_results', contextDigest: 'a'.repeat(64), protocolVersion: 'ask-cova-v2', requestId };
async function request(handler, bodyValue = body, method = 'POST') {
  let status, payload; const headers = {};
  await handler({ method, url: '/api/workspace', body: bodyValue }, { setHeader(k,v) { headers[k] = v; }, status(n) { status = n; return this; }, json(p) { payload = p; return this; } });
  return { status, payload, headers };
}
function workspace(askCova, overrides = {}) {
  return createWorkspaceHandler({ enabled: () => true, environment: () => env, auth: async () => ({ id: A, plan: 'free' }), rest: () => assert.fail('unexpected storage'), askCova, ...overrides });
}
const savedTrade = (suffix = 'one', accountId = '7') => ({ id: `tradovate-${accountId}:${suffix}`, date: '2026-10-29', market: 'NQ', side: 'Long', contracts: 1, entry: 100, exit: 101, pnl: 20, risk: 10, setup: 'PRIVATE SETUP', notes: 'PRIVATE NOTE', source: { provider: 'Tradovate', accountId, pnlBasis: 'gross_before_fees' } });
const rawRecord = t => ({ kind: 'trade', record_id: t.id, account_id: `Tradovate:${t.source.accountId}`, schema_version: 1, payload: t, revision: 1, created_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:00Z', deleted_at: null });
const settings = { disclosure_version: 'workspace-cloud-v1', revision: 1, pending_manifest: null };
const providerResult = (choice_id = 'result') => ({ model: 'gpt-6-luna', status: 'completed', service_tier: 'default', usage: { input_tokens: 500, output_tokens: 20 }, output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ choice_id, style: 'warm' }), annotations: [] }] }] });
async function fixture(options = {}) {
  const rows = options.rows || [rawRecord(savedTrade()), rawRecord(savedTrade('other', '8'))];
  const trades = rows.filter(r => !r.deleted_at && r.kind === 'trade').map(r => r.payload);
  const catalog = await core.buildAskCovaCatalog({ ownerId: A, account: body.account, range: body.range, question: core.isAskCovaQuestion(options.body?.question) ? options.body.question : body.question, trades });
  const events = [], requests = [];
  const rest = options.rest || (async (path, o) => {
    events.push(path); assert.equal(o.query.owner_id, 'eq.' + A);
    if (path === 'workspace_settings') return [structuredClone(settings)];
    assert.equal(path, 'workspace_records');
    return rows.slice(Number(o.query.offset), Number(o.query.offset) + 1); // Truncated server pages must not truncate scope.
  });
  const acquirePermit = options.acquirePermit || (async () => { events.push('permit'); return { allowed: true, release: async () => events.push('release') }; });
  const fetchImpl = options.fetchImpl || (async (url, o) => { events.push('provider'); requests.push({ url, ...o }); return new Response(JSON.stringify(providerResult(catalog.candidates[0].id))); });
  const ask = server.createAskCovaHandler({ acquirePermit, fetchImpl, ...options.dependencies });
  return { handler: workspace(ask, { rest, ...options.workspace }), catalog, events, requests, body: { ...body, contextDigest: catalog.contextDigest, ...options.body } };
}

test('duplicate request keys and malformed provider credentials are rejected before storage', async () => {
  const f = await fixture();
  const duplicate = JSON.stringify(f.body).replace('"requestId":', '"requestId":"' + requestId + '","requestId":');
  assert.equal((await request(f.handler, duplicate)).status, 400); assert.deepEqual(f.events, []);
  const bad = await fixture({ workspace: { environment: () => ({ ...env, OPENAI_API_KEY: 'synthetic\nheader' }) } });
  assert.equal((await request(bad.handler, bad.body)).status, 503); assert.deepEqual(bad.events, []);
});

test('failed provider HTTP response is cancelled without reading or echoing its body', async () => {
  let cancelled = false;
  const f = await fixture({ fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 500 }) });
  assert.equal((await request(f.handler, f.body)).status, 502);
  assert.equal(cancelled, true);
});

test('unsaved browser digest, missing cloud consent and pending migrations cannot reserve or dispatch', async () => {
  const stale = await fixture({ body: { contextDigest: 'b'.repeat(64) } });
  assert.equal((await request(stale.handler, stale.body)).status, 409);
  assert.equal(stale.events.includes('permit'), false);
  for (const value of [null, { ...settings, disclosure_version: 'old' }, { ...settings, pending_manifest: {} }, { ...settings, revision: '1' }]) {
    const f = await fixture({ rest: async path => { assert.equal(path, 'workspace_settings'); return value ? [value] : []; } });
    assert.equal((await request(f.handler, f.body)).status, 409);
    assert.equal(f.events.includes('permit'), false);
  }
});

test('revision changes during load or provider flight discard the answer', async () => {
  for (const duringProvider of [false, true]) {
    let revision = 1, settingsReads = 0;
    const f = await fixture({ rest: async (path, o) => {
      if (path === 'workspace_settings') { settingsReads++; return [{ ...settings, revision: !duringProvider && settingsReads > 1 ? 2 : revision }]; }
      return Number(o.query.offset) === 0 ? [rawRecord(savedTrade()), rawRecord(savedTrade('other', '8'))] : [];
    }, fetchImpl: async () => { revision = 2; return new Response(JSON.stringify(providerResult())); } });
    const result = await request(f.handler, f.body);
    assert.equal(result.status, 409); assert.equal(result.payload.aiResponseUsed, undefined);
    assert.equal(f.events.includes('permit'), duringProvider);
  }
});

test('tombstones are validated but excluded from the catalog; account and date scope match shared engine', async () => {
  const deleted = { ...rawRecord(savedTrade('deleted')), payload: {}, deleted_at: '2026-10-30T00:00:00Z' };
  const rows = [rawRecord(savedTrade()), rawRecord({ ...savedTrade('old'), date: '2026-10-01' }), rawRecord(savedTrade('other', '8')), deleted];
  for (const account of ['Tradovate:7', 'all']) for (const range of ['today', 'week', 'all']) {
    const f = await fixture({ rows });
    const scoped = await core.buildAskCovaCatalog({ ownerId: A, account, range, question: body.question, trades: rows.filter(r => !r.deleted_at).map(r => r.payload) });
    assert.equal((await request(f.handler, { ...f.body, account, range, contextDigest: scoped.contextDigest })).status, 200);
  }
});

test('permit denials and unknown outcomes never retry or dispatch without reservation', async () => {
  for (const acquirePermit of [async () => ({ allowed: false }), async () => { throw Error('PRIVATE backend failure'); }]) {
    const f = await fixture({ acquirePermit });
    const result = await request(f.handler, f.body);
    assert([429,503].includes(result.status)); assert.equal(f.requests.length, 0);
    assert.doesNotMatch(JSON.stringify(result.payload), /PRIVATE/);
  }
  for (const mode of ['timeout','http','malformed']) {
    let attempts = 0;
    const f = await fixture({ fetchImpl: async (_url, options) => {
      attempts++; assert(options.signal instanceof AbortSignal);
      if (mode === 'timeout') throw new DOMException('PRIVATE transport detail', 'TimeoutError');
      return new Response('PRIVATE provider body', { status: mode === 'http' ? 500 : 200 });
    } });
    assert.equal((await request(f.handler, f.body)).status, 502);
    assert.equal(attempts, 1); assert.equal(f.events.filter(e => e === 'permit').length, 1);
    assert.equal(f.events.at(-1), 'release'); // Unlock, not refund.
  }
});

// Exercise the default workspace -> storage -> budget -> provider path. Every
// transport is synthetic and unexpected destinations throw, never fall through.
async function receiptRequest(t, raw) {
  const catalog = await core.buildAskCovaCatalog({ ownerId: A, account: body.account, range: body.range, question: body.question, trades: [savedTrade()] });
  const commands = []; let providerCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const u = new URL(url);
    if (u.href === env.KV_REST_API_URL + '/') {
      const command = JSON.parse(options.body); commands.push(command);
      return new Response(command[2] === '5' ? raw : '{"result":1}');
    }
    if (u.href === 'https://api.openai.com/v1/responses') {
      providerCalls++;
      return new Response(JSON.stringify(providerResult(catalog.candidates[0].id)));
    }
    assert.equal(u.origin, env.SUPABASE_URL, 'unmocked origin forbidden');
    assert.equal(u.searchParams.get('owner_id'), 'eq.' + A);
    if (u.pathname === '/rest/v1/workspace_settings') return new Response(JSON.stringify([settings]));
    assert.equal(u.pathname, '/rest/v1/workspace_records', 'unmocked path forbidden');
    return new Response(JSON.stringify(u.searchParams.get('offset') === '0' ? [rawRecord(savedTrade())] : []));
  });
  const handler = workspace(undefined, { rest: undefined, environment: () => ({ ...env, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-storage-only' }) });
  const result = await request(handler, { ...body, contextDigest: catalog.contextDigest });
  return { ...result, commands, providerCalls };
}
for (const [label, raw] of [
  ['duplicate result', '{"result":[0,5],"result":[1,0]}'],
  ['escaped result', '{"result":[0,5],"res\\u0075lt":[1,0]}'],
  ['duplicate error', '{"error":"denied","error":null,"result":[1,0]}'],
  ['escaped error', '{"error":"denied","err\\u006fr":null,"result":[1,0]}'],
  ['nested duplicate', '{"result":[1,0],"extra":{"x":0,"x":1}}'],
  ['invalid UTF-8', Buffer.concat([Buffer.from('{"result":[1,0],"extra":"'), Buffer.from([0xff]), Buffer.from('"}')])],
  ['excessive depth', '{"result":[1,0],"extra":' + '['.repeat(33) + '0' + ']'.repeat(33) + '}'],
]) {
  test(`real budget path rejects ${label} before provider dispatch`, async t => {
    const r = await receiptRequest(t, raw);
    assert.equal(r.providerCalls, 0);
    assert.equal(r.status, 503);
    assert.deepEqual(r.payload, { status: 'unavailable', error: 'ask_cova_unavailable' });
    assert.equal(r.commands.length, 1, 'uncertain reservations must not retry, release or refund');
    assert.equal(r.commands[0][2], '5');
  });
}

test('real budget path rejects ambiguous envelope outcomes without retry or provider dispatch', async t => {
  for (const raw of ['{"result":[1,0],"error":null}', '{"result":[1,0],"unknown":"outcome"}', 'null', '[]', '{}', '{"error":"denied"}']) {
    await t.test(raw, async sub => {
      const r = await receiptRequest(sub, raw);
      assert.equal(r.providerCalls, 0);
      assert.equal(r.status, 503);
      assert.equal(r.commands.length, 1);
    });
  }
});

test('real budget path preserves canonical and escaped single results and known denial', async t => {
  for (const [raw, status, providerCalls, commands] of [
    ['{"result":[1,0]}', 200, 1, 2], [' { "res\\u0075lt" : [1, 0] } ', 200, 1, 2],
    ['{"result":[0,5]}', 429, 0, 1],
  ]) {
    await t.test(raw, async sub => {
      const r = await receiptRequest(sub, raw);
      assert.equal(r.status, status);
      assert.equal(r.providerCalls, providerCalls);
      assert.equal(r.commands.length, commands);
      if (providerCalls) assert.equal(r.commands[1][2], '1', 'success releases only the lock');
    });
  }
});

test('server configuration is mandatory despite an injected successful permit', async () => {
  for (const change of [ { ASK_COVA_ENABLED: 'TRUE' }, { OPENAI_API_KEY: '' }, { ASK_COVA_BUDGET_ID: '' }, { ASK_COVA_BUDGET_MICRO_USD: '' }, { KV_REST_API_URL: '' } ]) {
    const f = await fixture({ workspace: { environment: () => ({ ...env, ...change }) } });
    assert.equal((await request(f.handler, f.body)).status, change.ASK_COVA_ENABLED ? 404 : 503); assert.deepEqual(f.events, []);
  }
});

test('full serialized provider payload uses a UTF-8 byte ceiling, not only user input size', () => {
  assert.equal(typeof server.assertAskCovaRequestBytes, 'function');
  assert.doesNotThrow(() => server.assertAskCovaRequestBytes('a'.repeat(24000)));
  assert.throws(() => server.assertAskCovaRequestBytes('a'.repeat(24001)));
  assert.throws(() => server.assertAskCovaRequestBytes('€'.repeat(8001)));
});

test('default storage HTTP failures cancel unread bodies before returning 503 with no provider call', async t => {
  for (const path of ['workspace_settings', 'workspace_records']) for (const status of [500, 503]) {
    await t.test(`${path} HTTP ${status}`, async () => {
      let cancelled = false, reads = 0, providerCalls = 0;
      const f = await fixture({ workspace: { rest: undefined, environment: () => ({ ...env, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-storage-only' }) }, fetchImpl: async (url, options) => {
        const u = new URL(url);
        if (u.href === 'https://api.openai.com/v1/responses') { providerCalls++; throw Error('unexpected provider'); }
        assert.equal(u.origin, env.SUPABASE_URL, 'unmocked origin forbidden');
        assert.equal(options.method, 'GET');
        assert.equal(u.searchParams.get('owner_id'), 'eq.' + A);
        if (u.pathname === '/rest/v1/' + path) return new Response(new ReadableStream({
          pull() { reads++; throw Error('failed storage body must not be read'); },
          cancel() { cancelled = true; },
        }, { highWaterMark: 0 }), { status });
        assert.equal(u.pathname, '/rest/v1/workspace_settings');
        return new Response(JSON.stringify([settings]));
      } });
      const r = await request(f.handler, f.body);
      assert.equal(r.status, 503);
      assert.deepEqual(r.payload, { status: 'unavailable', error: 'workspace_unavailable' });
      assert.equal(providerCalls, 0);
      assert.equal(f.events.includes('permit'), false);
      assert.equal(reads, 0);
      assert.equal(cancelled, true);
    });
  }
});

test('default storage transport cancels oversized pages instead of materializing unbounded JSON', async () => {
  let cancelled = false, reads = 0, paid = 0;
  const f = await fixture({ workspace: { rest: undefined, environment: () => ({ ...env, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-storage-only' }) }, fetchImpl: async (url, options) => {
    const u = new URL(url);
    assert.equal(options.redirect, 'error');
    if (u.host === 'api.openai.com') { paid++; throw Error('unexpected'); }
    assert.equal(u.searchParams.get('owner_id'), 'eq.' + A);
    if (u.pathname.endsWith('workspace_settings')) return new Response(JSON.stringify([settings]));
    return new Response(new ReadableStream({ pull(controller) { reads++; if (reads === 1) controller.enqueue(new TextEncoder().encode(' '.repeat(2097153))); else { controller.enqueue(new TextEncoder().encode('[]')); controller.close(); } }, cancel() { cancelled = true; } }));
  } });
  const r = await request(f.handler, f.body);
  assert.equal(r.status, 422); assert.equal(cancelled, true); assert.equal(paid, 0);
});

test('saved snapshot has hard page/count/byte bounds and rejects malformed rows', async () => {
  for (const mode of ['page', 'bytes', 'pages', 'invalid']) {
    let reads = 0;
    const rest = async (path, o) => {
      if (path === 'workspace_settings') return [settings];
      reads++;
      if (mode === 'page') return reads === 1 ? Array.from({length: 251}, (_, i) => rawRecord(savedTrade(String(i)))) : [];
      if (mode === 'bytes') return reads === 1 ? Array.from({length: 200}, (_, i) => rawRecord({ ...savedTrade(String(i)), notes: '€'.repeat(10000) })) : [];
      if (mode === 'pages') return reads <= 102 ? [rawRecord(savedTrade(String(reads)))] : [];
      return reads === 1 ? [{ ...rawRecord(savedTrade()), payload: { ...savedTrade(), forged: true } }] : [];
    };
    const f = await fixture({ rest });
    const result = await request(f.handler, f.body);
    assert.equal(result.status, mode === 'invalid' ? 503 : 422, mode);
    assert.equal(f.events.includes('permit'), false);
    assert(reads <= 101);
  }
});

test('provider envelope rejects tools, roles, model drift, duplicate keys and unbounded output', async () => {
  const escapedDuplicate = String.raw`{"choice_id":"result","style":"plain","st\u0079le":"warm"}`;
  // Prove the fixture collides after JSON decoding, rather than merely adding
  // an unknown literal-backslash key that the selection schema also rejects.
  assert.deepEqual(JSON.parse(escapedDuplicate), { choice_id: 'result', style: 'warm' });
  assert.throws(() => server.uniqueJson(escapedDuplicate), /Duplicate/);
  const positive = await fixture();
  const accepted = await request(positive.handler, positive.body);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.payload.aiResponseUsed, true);
  assert.equal(positive.requests.length, 1);
  assert.equal(positive.events.filter(x => x === 'permit').length, 1);
  assert.equal(positive.events.at(-1), 'release');
  const alterations = [
    r => { r.model = 'other-model'; }, r => { r.status = 'incomplete'; }, r => { r.service_tier = 'priority'; },
    r => { r.output.push({ type: 'function_call' }); }, r => { r.output[0].role = 'user'; },
    r => { r.output[0].status = 'incomplete'; }, r => { r.output[0].content.push({ type: 'refusal', refusal: 'no' }); },
    r => { r.output[0].content[0].annotations = [{ type: 'url_citation' }]; },
    r => { r.output[0].content[0].text = '{"choice_id":"result","style":"plain","style":"warm"}'; },
    r => { r.output[0].content[0].text = escapedDuplicate; },
    r => { r.output[0].content[0].text = '{"choice_id":"result","style":"warm","answer":"UNTRUSTED"}'; },
    r => { r.output[0].content[0].text = '{"choice_id":"fabricated","style":"warm"}'; },
    r => { r.usage.input_tokens = 30000; }, r => { r.usage.output_tokens = 121; },
    r => { delete r.usage; }, r => { r.output[0].content[0].text = ' '.repeat(70000); },
  ];
  for (const alter of alterations) {
    let calls = 0;
    const f = await fixture({ fetchImpl: async () => { calls++; const r = providerResult(); alter(r); return new Response(JSON.stringify(r)); } });
    const result = await request(f.handler, f.body);
    assert.equal(result.status, 502, String(alter));
    assert.equal(result.payload.aiResponseUsed, undefined); assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(result.payload), /UNTRUSTED|other-model/);
    assert.equal(f.events.filter(x => x === 'permit').length, 1); assert.equal(f.events.at(-1), 'release');
  }
  const f = await fixture({ fetchImpl: async () => new Response('{"model":"wrong","model":"gpt-6-luna","output":[]}') });
  assert.equal((await request(f.handler, f.body)).status, 502);
});

test('request boundary rejects absent protocol, legacy consent, forged fields and bodies over 4 KiB before storage/permit', async () => {
  for (const change of [ { protocolVersion: 'wrong' }, { protocolVersion: undefined }, { consentVersion: 'ask-cova-v1' }, { trades: [] }, { metrics: {} }, { requestId: 'bad' }, { account: 'arbitrary' }, { range: 'year' }, { question: 'write_advice' }, { contextDigest: 'bad' } ]) {
    const f = await fixture({ body: change }); const r = await request(f.handler, f.body);
    assert.equal(r.status, 400, JSON.stringify(change)); assert.deepEqual(f.events, []);
  }
  const f = await fixture();
  const r = await request(f.handler, ' '.repeat(4096) + JSON.stringify(f.body));
  assert.equal(r.status, 413); assert.deepEqual(f.events, []);
});

test('all seven questions share checked saved digest, bounded provider payload and local-only setup labels', async () => {
  for (const question of core.ASK_COVA_QUESTION_IDS) {
    const f = await fixture({ body: { question } });
    const result = await request(f.handler, f.body);
    assert.equal(result.status, 200, question);
    assert.equal(result.payload.contextDigest, f.catalog.contextDigest);
    assert.deepEqual(result.payload.selection, { choice_id: f.catalog.candidates[0].id, style: 'warm' });
    assert.equal(f.requests.length, 1);
    assert.ok(Buffer.byteLength(f.requests[0].body) <= 24000);
    const payload = JSON.parse(f.requests[0].body);
    assert.ok(Buffer.byteLength(payload.input[1].content) <= 8192);
    assert.ok(JSON.parse(payload.input[1].content).choices.length <= 3);
    assert.equal(payload.max_output_tokens, 120);
    assert.doesNotMatch(f.requests[0].body, /PRIVATE|tradovate-7|Tradovate:7|11111111/);
    assert.equal(f.events.filter(x => x === 'permit').length, 1);
  }
});

test('real server uses complete owner saved snapshot and returns checked selection only', async () => {
  const f = await fixture(); const result = await request(f.handler, f.body);
  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, { status: 'ok', aiResponseUsed: true, contextDigest: f.catalog.contextDigest, selection: { choice_id: f.catalog.candidates[0].id, style: 'warm' } });
  assert.equal(f.requests.length, 1);
  const payload = JSON.parse(f.requests[0].body);
  assert.equal(f.requests[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(payload.store, false); assert.equal(payload.max_output_tokens, 120);
  assert.equal(payload.model, 'gpt-6-luna'); assert.equal(payload.reasoning.effort, 'none');
  assert.deepEqual(payload.prompt_cache_options, { mode: 'explicit' }); assert.deepEqual(payload.tools, []);
  assert.equal(payload.text.format.strict, true); assert.equal(payload.service_tier, 'default');
  assert.doesNotMatch(f.requests[0].body, /PRIVATE|tradovate-7|Tradovate:7|11111111/);
  assert(f.events.indexOf('permit') > f.events.indexOf('workspace_records'));
  assert(f.events.lastIndexOf('workspace_settings') > f.events.indexOf('provider'));
  assert.equal(f.events.at(-1), 'release');
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
});

test('disabled Ask Cova is fail closed, including the default workspace dispatcher', async () => {
  assert.equal(typeof server.createAskCovaHandler, 'function');
  const h = workspace(undefined, { environment: () => ({ ...env, ASK_COVA_ENABLED: 'false' }) });
  const result = await request(h);
  assert.equal(result.status, 404);
  assert.deepEqual(result.payload, { status: 'unavailable', error: 'ask_cova_unavailable' });
});

test('Ask Cova dispatch occurs only after owner authentication and project checks', async () => {
  let calls = 0;
  const askCova = async (context, res) => { calls++; assert.equal(context.user.id, A); return res.status(200).json({ dispatched: true }); };
  assert.equal((await request(workspace(askCova))).status, 200);
  assert.equal(calls, 1);
  assert.equal((await request(workspace(askCova), { ...body, owner: B })).status, 409);
  assert.equal((await request(workspace(askCova, { auth: async () => { throw Object.assign(Error('auth'), { statusCode: 401 }); } }))).status, 401);
  assert.equal((await request(workspace(askCova, { environment: () => ({}) }))).status, 503);
  assert.equal(calls, 1);
});
