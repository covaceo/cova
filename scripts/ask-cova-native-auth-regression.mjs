import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '../api/_lib/legal-policy.js';

// Compile the real source with native ESM dependency semantics. No injected auth,
// storage, Ask handler or permit, no generated repository runtime, no .env reads.
const built = await build({ root: resolve(import.meta.dirname, '..'), configFile: false,
  envDir: false, logLevel: 'error', ssr: { noExternal: true },
  build: { ssr: 'server/workspace.ts', target: 'node24', write: false,
    rollupOptions: { output: { format: 'es', inlineDynamicImports: true } } } });
assert.equal(built.output.length, 1);
const dir = await mkdtemp(join(tmpdir(), 'cova-native-auth-'));
after(() => rm(dir, { recursive: true, force: true }));
const file = join(dir, 'workspace.mjs');
await writeFile(file, built.output[0].code);
const { default: handler } = await import(pathToFileURL(file));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const baseEnv = {
  WORKSPACE_SYNC_ENABLED: 'true', WORKSPACE_SYNC_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa',
  SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
  SUPABASE_ANON_KEY: 'synthetic-only-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only-storage',
  ASK_COVA_ENABLED: 'true', ASK_COVA_BETA_USER_ID: A,
  OPENAI_API_KEY: 'synthetic-only-not-a-credential', ASK_COVA_BUDGET_ID: 'synthetic-only',
  ASK_COVA_BUDGET_MICRO_USD: '1000000',
  COVA_BILLING_MODE: 'sandbox', COVA_BILLING_ALLOWED_USERS: A + ',' + B,
  COVA_BILLING_ORIGIN: 'https://synthetic-billing.invalid',
  STRIPE_SECRET_KEY: 'sk_test_synthetic_only_not_a_credential', STRIPE_ACCOUNT_ID: 'acct_synthetic',
  STRIPE_PRO_PRICE_ID: 'price_synthetic', STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_synthetic',
  KV_REST_API_URL: 'https://synthetic.upstash.io', KV_REST_API_TOKEN: 'synthetic-only-not-a-credential-123456789',
};
const askBody = owner => ({ action: 'ask_cova', owner, account: 'all', range: 'all',
  question: 'review_results', contextDigest: 'a'.repeat(64), consentVersion: 'ask-cova-v1', requestId: operationId });
const settings = { disclosure_version: 'workspace-cloud-v1', revision: 1, pending_manifest: null };
function fixture(t, { user = B, policy = true, validSession = true, env = {}, billingPlan = 'free' } = {}) {
  const saved = { ...process.env };
  // Exclude any host configuration (including production billing) from this test.
  const relevant = /^(?:ASK_COVA_|WORKSPACE_|SUPABASE_|VITE_|COVA_BILLING_|STRIPE_|KV_|OPENAI_|VERCEL_)/;
  for (const key of Object.keys(process.env)) if (relevant.test(key)) delete process.env[key];
  Object.assign(process.env, baseEnv, env);
  t.after(() => {
    for (const key of Object.keys(process.env)) if (relevant.test(key)) delete process.env[key];
    for (const [key, value] of Object.entries(saved)) if (relevant.test(key)) process.env[key] = value;
  });
  const events = [], writes = [];
  const counts = { billingRedis: 0, stripe: 0, snapshot: 0, askBudget: 0, provider: 0, unexpected: 0 };
  // Stripe uses native HTTP, not necessarily fetch. Never let it reach a socket.
  for (const api of [http, https]) for (const method of ['request', 'get'])
    t.mock.method(api, method, () => { counts.stripe++; throw Error('Native HTTP forbidden in synthetic regression'); });
  for (const method of ['connect', 'createConnection'])
    t.mock.method(net, method, () => { counts.unexpected++; throw Error('Network forbidden'); });
  t.mock.method(net.Socket.prototype, 'connect', () => { counts.unexpected++; throw Error('Socket forbidden'); });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const u = new URL(url);
    const reply = value => new Response(JSON.stringify(value));
    if (u.origin === baseEnv.SUPABASE_URL && u.pathname === '/auth/v1/user') {
      events.push('auth');
      assert.equal(options.headers.Authorization, 'Bearer synthetic-only-token');
      if (!validSession) return new Response('{}', { status: 401 });
      return reply({ id: user, email: 'synthetic@example.invalid', user_metadata: { id: A }, app_metadata: { plan: 'free', id: A } });
    }
    if (u.origin === baseEnv.SUPABASE_URL && u.pathname === '/rest/v1/policy_acceptances') {
      events.push('policy');
      assert.equal(u.searchParams.get('user_id'), 'eq.' + user);
      assert.equal(u.searchParams.get('terms_version'), 'eq.' + CURRENT_TERMS_VERSION);
      assert.equal(u.searchParams.get('privacy_version'), 'eq.' + CURRENT_PRIVACY_VERSION);
      return reply(policy ? [{ id: 'synthetic-policy' }] : []);
    }
    if (u.origin === baseEnv.KV_REST_API_URL) {
      const command = JSON.parse(options.body);
      if (command[0] === 'GET' && command[1] === `cova:billing:v1:sandbox:acct_synthetic:owner:${user}`) {
        counts.billingRedis++; events.push('billingRedis');
        return reply({ result: billingPlan === 'free' ? null : JSON.stringify({ ownerId: user,
          customerId: 'cus_synthetic', verifiedAt: Date.now(), state: { plan: 'pro', paidUntil: new Date(Date.now() + 3600000).toISOString() } }) });
      }
      counts.askBudget++; throw Error('Unexpected Redis command');
    }
    if (u.hostname === 'api.stripe.com') { counts.stripe++; throw Error('Unexpected Stripe call'); }
    if (u.hostname === 'api.openai.com') { counts.provider++; throw Error('Unexpected provider call'); }
    if (u.origin === baseEnv.SUPABASE_URL && u.pathname.startsWith('/rest/v1/workspace_')) {
      counts.snapshot++; events.push(u.pathname.split('/').at(-1));
      if (options.method === 'POST') { writes.push(JSON.parse(options.body)); return reply([settings]); }
      assert.equal(u.searchParams.get('owner_id'), 'eq.' + user);
      return reply(u.pathname.endsWith('workspace_settings') ? [settings] : []);
    }
    if (u.origin === baseEnv.SUPABASE_URL && u.pathname === '/rest/v1/rpc/cova_apply_workspace_plan') {
      events.push('apply'); writes.push(JSON.parse(options.body));
      return reply({ operationId, records: [] });
    }
    counts.unexpected++; throw Error('Unmocked destination forbidden: ' + u.origin + u.pathname);
  });
  return { events, counts, writes };
}
async function request(body, { method = 'POST', owner = B, headers = { authorization: 'Bearer synthetic-only-token' } } = {}) {
  let status, payload; const outputHeaders = {};
  await handler({ method, url: '/api/workspace?owner=' + owner, body, headers }, {
    setHeader(k, v) { outputHeaders[k] = v; }, status(n) { status = n; return this; }, json(p) { payload = p; return this; },
  });
  assert.equal(outputHeaders['Cache-Control'], 'private, no-store');
  return { status, payload };
}
function noSideEffects(f) {
  assert.deepEqual(f.counts, { billingRedis: 0, stripe: 0, snapshot: 0, askBudget: 0, provider: 0, unexpected: 0 });
}

test('native default auth: nonmember denial with configured billing has no billing side effects', async t => {
  const f = fixture(t);
  const r = await request(askBody(B));
  assert.equal(r.status, 404);
  assert.deepEqual(r.payload, { status: 'unavailable', error: 'ask_cova_unavailable' });
  noSideEffects(f);
  assert.deepEqual(f.events, ['auth', 'policy']);
});

for (const flag of ['false', 'true']) for (const user of [A, B]) for (const raw of [false, true]) {
  const label = `flag=${flag}, ${user === A ? 'member' : 'nonmember'}, ${raw ? 'raw' : 'parsed'}`;
  test(`native default auth: discovery is side-effect-free (${label})`, async t => {
    const f = fixture(t, { user, env: { ASK_COVA_ENABLED: flag } });
    const body = { action: 'ask_cova_access', owner: user };
    const r = await request(raw ? JSON.stringify(body) : body);
    assert.equal(r.status, 200);
    assert.deepEqual(r.payload, { owner: user, enabled: flag === 'true' && user === A });
    noSideEffects(f); assert.deepEqual(f.events, ['auth', 'policy']);
  });
  if (flag === 'false' || user === B) {
    test(`native default auth: denied ask is side-effect-free (${label})`, async t => {
      const f = fixture(t, { user, env: { ASK_COVA_ENABLED: flag } });
      const body = askBody(user);
      const r = await request(raw ? JSON.stringify(body) : body);
      assert.equal(r.status, 404);
      assert.deepEqual(r.payload, { status: 'unavailable', error: 'ask_cova_unavailable' });
      noSideEffects(f); assert.deepEqual(f.events, ['auth', 'policy']);
    });
  }
}

for (const action of ['ask_cova', 'ask_cova_access']) {
  for (const [label, setup, options, expected, events] of [
    ['missing bearer', {}, { headers: {} }, 401, []],
    ['invalid session', { validSession: false }, {}, 401, ['auth']],
    ['current policy refused', { policy: false }, {}, 403, ['auth', 'policy']],
    ['forged body owner despite metadata', {}, { bodyOwner: A }, 409, ['auth', 'policy']],
    ['invalid authenticated UUID', { user: 'invalid' }, { bodyOwner: 'invalid' }, 401, ['auth', 'policy']],
    ['wrong project', { env: { WORKSPACE_SYNC_PROJECT_REF: 'wrong' } }, {}, 503, []],
    ['workspace disabled', { env: { WORKSPACE_SYNC_ENABLED: 'false' } }, {}, 404, []],
    ['method guard', {}, { method: 'PUT' }, 405, []],
  ]) {
    test(`native default auth: ${action} preserves ${label}`, async t => {
      const f = fixture(t, setup);
      const r = await request({ action, owner: options.bodyOwner || B }, options);
      assert.equal(r.status, expected); noSideEffects(f); assert.deepEqual(f.events, events);
    });
  }
}

for (const [label, body, status] of [
  ['extra discovery field', { action: 'ask_cova_access', owner: A, enabled: true }, 400],
  ['duplicate discovery owner', `{"action":"ask_cova_access","owner":"${A}","owner":"${A}"}`, 400],
  ['escaped duplicate discovery owner', String.raw`{"action":"ask_cova_access","owner":"${A}","owne\u0072":"${A}"}`, 400],
  ['duplicate discovery action', `{"action":"consent","action":"ask_cova_access","owner":"${A}"}`, 400],
  ['invalid ask consent', { ...askBody(A), consentVersion: 'old' }, 400],
  ['extra ask field', { ...askBody(A), trades: [] }, 400],
  ['duplicate ask action', JSON.stringify(askBody(A)).replace('"action":', '"action":"consent","action":'), 400],
  ['ask byte bound', ' '.repeat(4096) + JSON.stringify(askBody(A)), 413],
]) {
  test(`native default auth: ${label} still rejects before snapshot/billing`, async t => {
    const f = fixture(t, { user: A });
    const r = await request(body);
    assert.equal(r.status, status); noSideEffects(f); assert.deepEqual(f.events, ['auth', 'policy']);
  });
}

for (const body of ['{', ' '.repeat(4000001)]) {
  test(`native default auth: authentication still precedes raw body error (${body.length} bytes)`, async t => {
    const f = fixture(t);
    assert.equal((await request(body, { headers: {} })).status, 401);
    noSideEffects(f); assert.deepEqual(f.events, []);
  });
}

for (const billingPlan of ['free', 'pro']) for (const action of ['GET', 'consent', 'apply']) {
  test(`native default auth: ordinary ${action} retains billing-derived ${billingPlan} semantics`, async t => {
    const f = fixture(t, { billingPlan, env: { ASK_COVA_ENABLED: 'false' } });
    const records = [{ kind: 'daily_note', recordId: '["local","2026-10-01"]', accountId: 'local', schemaVersion: 1,
      payload: { date: '2026-10-01', note: 'Synthetic note', tradeId: null }, expectedRevision: 0, deleted: false }];
    // A GET body cannot opt the ordinary snapshot route out of billing.
    const body = action === 'GET' ? { action: 'ask_cova_access', owner: B } : action === 'consent'
      ? { action, owner: B, disclosure: 'workspace-cloud-v1' }
      : { action, owner: B, operationId, records };
    const r = await request(action === 'GET' ? body : JSON.stringify(body), { method: action === 'GET' ? 'GET' : 'POST' });
    assert.equal(r.status, 200);
    assert.equal(r.payload.owner, B);
    assert.deepEqual(f.events.slice(0, 3), ['auth', 'billingRedis', 'policy']);
    assert.equal(f.counts.billingRedis, 1, 'configured eligible free auth must actually resolve billing');
    assert.equal(f.counts.stripe, 0); assert.equal(f.counts.askBudget, 0);
    assert.equal(f.counts.provider, 0); assert.equal(f.counts.unexpected, 0);
    if (action === 'GET') {
      assert.deepEqual(r.payload, { owner: B, consent: true, pendingWrite: null, revision: 1, chunk: '', next: null });
      assert.deepEqual(f.events.slice(3), ['workspace_settings', 'workspace_records', 'workspace_settings']);
    } else if (action === 'consent') {
      assert.deepEqual(r.payload, { owner: B, consent: true });
      assert.deepEqual(f.writes, [{ owner_id: B, disclosure_version: 'workspace-cloud-v1' }]);
    } else {
      assert.deepEqual(r.payload, { operationId, owner: B, records: [], applied: true });
      assert.equal(f.writes.length, 1); assert.equal(f.writes[0].p_owner, B);
      assert.equal(f.writes[0].p_max_trades, billingPlan === 'pro' ? null : 25);
    }
  });
}
