import assert from 'node:assert/strict';
import test from 'node:test';
import connectorStatus from '../api/connectors/status.js';
import { getTradovateConnection, getTradovateConnectionForUser } from '../api/_lib/supabase.js';

const environment = {
  SUPABASE_URL: 'https://reconnect.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service',
  COVA_TOKEN_ENCRYPTION_KEY: 'test-encryption', TRADOVATE_CLIENT_ID: 'test-client',
  TRADOVATE_CLIENT_SECRET: 'test-secret', KV_REST_API_URL: 'https://reconnect.upstash.test', KV_REST_API_TOKEN: 'test-kv',
};
async function fixture(run, row = {}) {
  const originalFetch = globalThis.fetch;
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = new URL(url); calls.push({ target, options });
    assert.equal(target.origin, environment.SUPABASE_URL, 'No provider requests in expiry tests');
    if (target.pathname === '/auth/v1/user') return Response.json({ id: 'fixture-owner' });
    assert.equal(target.pathname, '/rest/v1/broker_connections');
    assert.equal(target.searchParams.get('user_id'), 'eq.fixture-owner');
    assert.equal(target.searchParams.get('provider'), 'eq.tradovate');
    return Response.json([{ id: 'fixture-link', user_id: 'fixture-owner', status: 'connected', expires_at: '2000-01-01T00:00:00.000Z', access_token_encrypted: 'fixture-never-return', ...row }]);
  };
  try { await run(calls); } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}

const response = () => ({ statusCode: 200, headers: new Map(), setHeader(k, v) { this.headers.set(k.toLowerCase(), v); }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

for (const expires_at of ['2000-01-01T00:00:00.000Z', null, 'invalid']) {
  test(`status retains expired/invalid link (${expires_at}) without reporting a usable connection`, async () => {
    await fixture(async calls => {
      for (const cookie of ['', 'cova_tradovate_connection=fixture-link', 'cova_tradovate_connection=foreign-link']) {
        const res = response();
        await connectorStatus({ method: 'GET', query: { provider: 'tradovate' }, headers: { authorization: 'Bearer fixture-member', cookie } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.status, 'reconnect-required');
        assert.equal(res.body.connected, false);
        assert.equal(res.body.linked, true);
        assert.equal(res.body.connectionId, 'fixture-link');
        assert.equal(res.headers.get('cache-control'), 'private, no-store');
        assert.ok(!JSON.stringify(res.body).includes('fixture-never-return'));
      }
      assert.ok(calls.every(call => (call.options.method || 'GET') === 'GET'));
      const lookups = calls.filter(call => call.target.pathname.includes('/rest/'));
      assert.ok(lookups.every(call => !call.target.searchParams.get('select').includes('*') && !call.target.searchParams.get('select').includes('token')), 'Status must load metadata only');
    }, { expires_at });
  });
}

test('expired Tradovate credentials fail closed without deleting the owner link', async () => {
  await fixture(async calls => {
    assert.equal(await getTradovateConnection('fixture-link', 'fixture-owner'), null);
    assert.equal(await getTradovateConnectionForUser('fixture-owner'), null);
    assert.ok(calls.length >= 2);
    assert.ok(calls.every(call => (call.options.method || 'GET') === 'GET'), 'Expiration must not erase the connection record');
  });
});
