import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
const { createAskCovaHandler } = load('server/askCova.ts');
const { createWorkspaceHandler } = load('server/workspace.ts');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const env = { WORKSPACE_SYNC_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa', SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co', ASK_COVA_ENABLED: 'true', OPENAI_API_KEY: 'synthetic-only-not-a-real-credential', ASK_COVA_BUDGET_ID: 'synthetic-campaign', ASK_COVA_BUDGET_MICRO_USD: '1000000', KV_REST_API_URL: 'https://synthetic.upstash.io', KV_REST_API_TOKEN: 'synthetic-only-not-a-credential-123456789' };
const body = { action: 'ask_cova', owner: A, account: 'all', range: 'all', question: 'review_results', contextDigest: 'a'.repeat(64), protocolVersion: 'ask-cova-v2', requestId: '33333333-3333-4333-8333-333333333333' };
async function response(invoke) {
  let status, payload; const headers = {};
  await invoke({ setHeader(k, v) { headers[k] = v; }, status(n) { status = n; return this; }, json(p) { payload = p; return this; } });
  return { status, payload, headers };
}
async function direct({ environment = env, user = { id: A }, request = body } = {}) {
  const events = [];
  const unexpected = name => async () => { events.push(name); throw Error('Unexpected side effect'); };
  const handler = createAskCovaHandler({ fetchImpl: unexpected('provider/storage fetch'), acquirePermit: unexpected('Redis') });
  const result = await response(res => handler({ body: request, user, environment, rest: unexpected('snapshot') }, res));
  return { ...result, events };
}
async function workspaceRequest({ environment = { ...env, ASK_COVA_BETA_USER_ID: A }, user = { id: A }, request = { action: 'ask_cova_access', owner: user.id }, method = 'POST', overrides = {} } = {}) {
  const events = [];
  const handler = createWorkspaceHandler({
    enabled: () => true, environment: () => environment,
    auth: async () => { events.push('auth'); return user; },
    rest: async () => { events.push('storage'); throw Error('Unexpected storage'); },
    askCova: async (_context, res) => { events.push('ask'); return res.status(200).json({ dispatched: true }); },
    ...overrides,
  });
  const result = await response(res => handler({ method, url: '/api/workspace?owner=' + user.id, body: request }, res));
  return { ...result, events };
}
function denied(r) {
  assert.equal(r.status, 404);
  assert.deepEqual(r.payload, { status: 'unavailable', error: 'ask_cova_unavailable' });
  assert.deepEqual(r.events, []);
}

test('server-only singular UUID is mandatory; broad/frontend/email configuration never enables access', async () => {
  for (const fallback of [{ VITE_ASK_COVA_BETA_USER_ID: A }, { ASK_COVA_BETA_USER_IDS: A }, { ASK_COVA_BETA_EMAIL: 'synthetic@example.invalid' }, { VITE_ASK_COVA_ENABLED: 'true' }]) {
    const environment = { ...env, ...fallback };
    denied(await direct({ environment }));
    const r = await workspaceRequest({ environment });
    assert.equal(r.status, 200); assert.deepEqual(r.payload, { owner: A, enabled: false });
    assert.deepEqual(r.events, ['auth']);
  }
});

test('discovery needs no provider, reservation or saved-workspace configuration', async () => {
  const r = await workspaceRequest({ environment: {
    WORKSPACE_SYNC_PROJECT_REF: env.WORKSPACE_SYNC_PROJECT_REF, SUPABASE_URL: env.SUPABASE_URL,
    ASK_COVA_ENABLED: 'true', ASK_COVA_BETA_USER_ID: A,
  } });
  assert.equal(r.status, 200); assert.deepEqual(r.payload, { owner: A, enabled: true });
  assert.deepEqual(r.events, ['auth']);
});

test('default policy-auth dependency rejects unauthenticated discovery without any transport', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async () => { calls.push('fetch'); throw Error('No live transport'); });
  const r = await workspaceRequest({ overrides: { auth: undefined } });
  assert.equal(r.status, 401); assert.deepEqual(r.events, []); assert.deepEqual(calls, []);
});

test('only Ask Cova POST actions opt out of billing without bypassing policy auth', async () => {
  for (const action of ['ask_cova', 'ask_cova_access', 'consent', 'apply']) for (const raw of [false, true]) {
    const options = [];
    const request = { ...body, action };
    await workspaceRequest({ request: raw ? JSON.stringify(request) : request, overrides: {
      auth: async (...args) => { options.push(args.slice(1)); return { id: A }; },
    } });
    assert.deepEqual(options, action.startsWith('ask_cova') ? [[{ billing: false }]] : [[]]);
  }
  const options = [];
  await workspaceRequest({ method: 'GET', request: body, overrides: {
    auth: async (...args) => { options.push(args.slice(1)); return { id: A }; },
  } });
  assert.deepEqual(options, [[]], 'a GET body cannot disable ordinary billing auth');
});

test('nonmember workspace GET, apply and consent remain available when beta is disabled', async () => {
  const calls = [];
  const operationId = body.requestId;
  const rest = async (path, options) => {
    calls.push({ path, options });
    if (path === 'rpc/cova_apply_workspace_plan') return { records: [], operationId };
    if (path === 'workspace_records') return [];
    assert.equal(path, 'workspace_settings');
    return [{ disclosure_version: 'workspace-cloud-v1', revision: 1, pending_manifest: null }];
  };
  const base = { user: { id: B, plan: 'free' }, environment: { ...env, ASK_COVA_BETA_USER_ID: A, ASK_COVA_ENABLED: 'false' }, overrides: { rest } };
  const get = await workspaceRequest({ ...base, method: 'GET' });
  assert.equal(get.status, 200);
  assert.deepEqual(get.payload, { owner: B, consent: true, pendingWrite: null, revision: 1, chunk: '', next: null });
  assert.deepEqual(calls.map(c => c.path), ['workspace_settings', 'workspace_records', 'workspace_settings']);
  for (const c of calls) assert.equal(c.options.query.owner_id, 'eq.' + B);
  calls.length = 0;
  const consent = await workspaceRequest({ ...base, request: { action: 'consent', owner: B, disclosure: 'workspace-cloud-v1' } });
  assert.equal(consent.status, 200); assert.deepEqual(consent.payload, { owner: B, consent: true });
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].options.body, { owner_id: B, disclosure_version: 'workspace-cloud-v1' });
  calls.length = 0;
  const records = [{ kind: 'daily_note', recordId: '["local","2026-10-01"]', accountId: 'local', schemaVersion: 1,
    payload: { date: '2026-10-01', note: 'Synthetic note', tradeId: null }, expectedRevision: 0, deleted: false }];
  const apply = await workspaceRequest({ ...base, request: { action: 'apply', owner: B, operationId, records } });
  assert.equal(apply.status, 200); assert.deepEqual(apply.payload, { operationId, owner: B, records: [], applied: true });
  assert.equal(calls.length, 1); assert.equal(calls[0].path, 'rpc/cova_apply_workspace_plan');
  assert.equal(calls[0].options.body.p_owner, B); assert.equal(calls[0].options.body.p_max_trades, 25);
  for (const r of [get, consent, apply]) {
    assert.equal(r.headers['Cache-Control'], 'private, no-store'); assert.deepEqual(r.events, ['auth']);
  }
});

test('capability schema accepts only POST action and owner, including raw JSON uniqueness', async () => {
  const valid = { action: 'ask_cova_access', owner: A };
  const accepted = await workspaceRequest({ request: JSON.stringify(valid) });
  assert.equal(accepted.status, 200); assert.deepEqual(accepted.payload, { owner: A, enabled: true });
  const malformed = [
    ...['email', 'user', 'metadata', 'trades', 'enabled', 'account', 'ASK_COVA_BETA_USER_ID'].map(key => ({ ...valid, [key]: A })),
    '{"action":"ask_cova_access","owner":"' + A + '","owner":"' + A + '"}',
    '{"action":"ask_cova_access","owner":"' + B + '","owne\\u0072":"' + A + '"}',
    '{"action":"ignored","action":"ask_cova_access","owner":"' + A + '"}',
    Object.assign([], valid),
  ];
  for (const request of malformed) {
    const r = await workspaceRequest({ request });
    assert.equal(r.status, 400, JSON.stringify(request)); assert.deepEqual(r.events, ['auth']);
    assert.equal(r.headers['Cache-Control'], 'private, no-store');
  }
  for (const request of [{ action: 'ask_cova_access' }, { ...valid, owner: B }, { ...valid, owner: null }]) {
    const r = await workspaceRequest({ request });
    assert.equal(r.status, 409); assert.deepEqual(r.events, ['auth']);
  }
  const method = await workspaceRequest({ method: 'PUT' });
  assert.equal(method.status, 405); assert.deepEqual(method.events, []);
});

test('capability returns exact owner and boolean without storage or dispatch', async () => {
  for (const user of [{ id: A }, { id: B, email: A, user_metadata: { id: A } }]) {
    const r = await workspaceRequest({ user });
    assert.equal(r.status, 200);
    assert.deepEqual(r.payload, { owner: user.id, enabled: user.id === A });
    assert.equal(r.headers['Cache-Control'], 'private, no-store');
    assert.deepEqual(r.events, ['auth']);
  }
  for (const change of [{ ASK_COVA_BETA_USER_ID: undefined }, { ASK_COVA_BETA_USER_ID: '*' }, { ASK_COVA_BETA_USER_ID: A + ',' + B }, { ASK_COVA_BETA_USER_ID: 'synthetic@example.invalid' }, { ASK_COVA_ENABLED: 'false' }, { ASK_COVA_ENABLED: 'TRUE' }]) {
    const r = await workspaceRequest({ environment: { ...env, ASK_COVA_BETA_USER_ID: A, ...change } });
    assert.equal(r.status, 200); assert.deepEqual(r.payload, { owner: A, enabled: false });
    assert.deepEqual(r.events, ['auth']);
  }
});

test('workspace dispatcher denies nonmembers even when Ask Cova handler is injected', async () => {
  for (const environment of [env, { ...env, ASK_COVA_BETA_USER_ID: B }, { ...env, ASK_COVA_BETA_USER_ID: A, ASK_COVA_ENABLED: 'false' }]) {
    const r = await workspaceRequest({ environment, request: body });
    assert.equal(r.status, 404);
    assert.deepEqual(r.payload, { status: 'unavailable', error: 'ask_cova_unavailable' });
    assert.deepEqual(r.events, ['auth']);
    assert.equal(r.headers['Cache-Control'], 'private, no-store');
  }
  const r = await workspaceRequest({ request: body });
  assert.equal(r.status, 200); assert.deepEqual(r.events, ['auth', 'ask']);
});

test('workspace project, policy auth and exact same-owner gates precede discovery and dispatch', async () => {
  for (const action of ['ask_cova_access', 'ask_cova']) {
    const request = { ...body, action, owner: B, email: A };
    const project = await workspaceRequest({ request, environment: {} });
    assert.equal(project.status, 503); assert.deepEqual(project.events, []);
    const disabled = await workspaceRequest({ request, environment: {}, overrides: { enabled: () => false } });
    assert.equal(disabled.status, 404); assert.deepEqual(disabled.events, []);
    for (const statusCode of [401, 403]) {
      const auth = await workspaceRequest({ request, overrides: { auth: async () => { throw Object.assign(Error('Synthetic policy/auth denial'), { statusCode }); } } });
      assert.equal(auth.status, statusCode); assert.deepEqual(auth.events, []);
    }
    const owner = await workspaceRequest({ request });
    assert.equal(owner.status, 409); assert.deepEqual(owner.events, ['auth']);
    const invalidId = await workspaceRequest({ user: { id: 'bad' }, request });
    assert.equal(invalidId.status, 401); assert.deepEqual(invalidId.events, ['auth']);
  }
});

test('direct handler denies missing beta configuration before every side effect', async () => {
  denied(await direct());
});

for (const config of [undefined, '', 'bad', '*', A + ',' + B, A + ' ' + B, [A], [A, B], { id: A }, 'synthetic@example.invalid', ' ' + A, A + '\n', A + '\r\n', '00000000-0000-0000-0000-000000000000']) {
  test(`direct handler rejects malformed single-account config ${JSON.stringify(config)}`, async () => {
    denied(await direct({ environment: { ...env, ASK_COVA_BETA_USER_ID: config } }));
  });
}

test('direct handler trusts only authenticated id, never owner/email/metadata', async () => {
  const environment = { ...env, ASK_COVA_BETA_USER_ID: A };
  for (const user of [null, {}, { id: 'bad' }, { id: B }, { id: B, email: A }, { id: B, email: 'synthetic@example.invalid', user_metadata: { id: A }, app_metadata: { id: A } }]) {
    denied(await direct({ environment, user, request: { ...body, email: A, user: { id: A } } }));
  }
  denied(await direct({ environment, user: { id: B }, request: { ...body, owner: B } }));
});

test('literal kill switch denies even the invited account before side effects', async () => {
  for (const enabled of [undefined, '', 'false', 'TRUE', true, ' true', 'true\n']) {
    denied(await direct({ environment: { ...env, ASK_COVA_BETA_USER_ID: A, ASK_COVA_ENABLED: enabled } }));
  }
});

test('exact authenticated beta account reaches existing snapshot validation only after request validation', async () => {
  const environment = { ...env, ASK_COVA_BETA_USER_ID: A };
  const r = await direct({ environment });
  assert.equal(r.status, 503); assert.deepEqual(r.events, ['snapshot']);
  for (const request of [{ ...body, owner: B }, { ...body, email: 'synthetic@example.invalid' }, { ...body, protocolVersion: 'wrong' }]) {
    const rejected = await direct({ environment, request });
    assert.equal(rejected.status, 400); assert.deepEqual(rejected.events, []);
  }
});
