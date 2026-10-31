import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import load from './helpers/load-ts.cjs';
const source = 'server/askCovaBudget.ts';
const budget = existsSync(source) ? load(source) : {};
const ownerId = '11111111-1111-4111-8111-111111111111';
const requestId = '33333333-3333-4333-8333-333333333333';
const env = { ASK_COVA_BUDGET_ID: 'synthetic-campaign', ASK_COVA_BUDGET_MICRO_USD: '100000', KV_REST_API_URL: 'https://synthetic.upstash.io', KV_REST_API_TOKEN: 'synthetic-only-not-a-credential-123456789' };

test('atomic reservation uses pinned campaign, durable dedup and fixed charge; release only unlocks', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    assert.equal(url, env.KV_REST_API_URL);
    calls.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ result: calls.length === 1 ? [1, 0] : 1 }));
  };
  const permit = await budget.acquireAskCovaPermit({ ownerId, requestId, env, fetchImpl });
  assert.equal(permit.allowed, true);
  assert.equal(budget.ASK_COVA_RESERVATION_MICRO_USD, 10000);
  assert.equal(calls[0][0], 'EVAL');
  assert.match(calls[0][1], /redis.call\('TIME'\)/);
  assert.match(calls[0][1], /campaign/);
  assert.equal(calls[0].includes('10000'), true);
  await permit.release(); await permit.release();
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[1][1], /DECR|HINCRBY|budget/i);
  assert.equal(calls[0][3], 'ask-cova:{reservation-v1}:budget');
});

test('invalid backend origins/caps and malformed receipts fail closed', async () => {
  const changes = [
    { KV_REST_API_URL: 'http://synthetic.upstash.io' }, { KV_REST_API_URL: 'https://synthetic.upstash.io.evil.invalid' },
    { KV_REST_API_URL: 'https://user:pass@synthetic.upstash.io' }, { KV_REST_API_URL: 'https://synthetic.upstash.io/path' },
    { KV_REST_API_URL: 'https://synthetic.upstash.io:443' }, { KV_REST_API_TOKEN: 'short' },
    { ASK_COVA_BUDGET_MICRO_USD: '10000001' }, { ASK_COVA_BUDGET_MICRO_USD: '9999' },
    { ASK_COVA_BUDGET_MICRO_USD: '1e6' }, { ASK_COVA_BUDGET_ID: 'bad:key' },
  ];
  for (const change of changes) {
    await assert.rejects(() => budget.acquireAskCovaPermit({ ownerId, requestId, env: { ...env, ...change }, fetchImpl: () => assert.fail('must not dispatch') }));
  }
  for (const result of [null, 1, [true,0], [1,1], [0,7], [1,0,0], ['1',0]]) {
    await assert.rejects(() => budget.acquireAskCovaPermit({ ownerId, requestId, env, fetchImpl: async () => new Response(JSON.stringify({ result })) }));
  }
  for (let reason = 1; reason <= 6; reason++) {
    let calls = 0;
    const p = await budget.acquireAskCovaPermit({ ownerId, requestId, env, fetchImpl: async () => { calls++; return new Response(JSON.stringify({ result: [0,reason] })); } });
    assert.equal(p.allowed, false); await p.release(); assert.equal(calls, 1);
  }
});

const malformedRawReceipts = [
  ['duplicate result', '{"result":[0,5],"result":[1,0]}'],
  ['escaped result', '{"result":[0,5],"res\\u0075lt":[1,0]}'],
  ['duplicate error', '{"error":"denied","error":null,"result":[1,0]}'],
  ['escaped error', '{"error":"denied","err\\u006fr":null,"result":[1,0]}'],
  ['nested duplicate', '{"result":[1,0],"extra":{"x":0,"x":1}}'],
  ['invalid UTF-8', Buffer.concat([Buffer.from('{"result":[1,0],"extra":"'), Buffer.from([0xff]), Buffer.from('"}')])],
  ['excessive depth', '{"result":[1,0],"extra":' + '['.repeat(33) + '0' + ']'.repeat(33) + '}'],
];
for (const [label, raw] of malformedRawReceipts) {
  test(`raw reservation decoding rejects ${label} without retry or release`, async () => {
    let calls = 0;
    await assert.rejects(() => budget.acquireAskCovaPermit({ ownerId, requestId, env,
      fetchImpl: async () => { calls++; return new Response(raw); },
    }), /Ask Cova reservation unavailable/);
    assert.equal(calls, 1);
  });
}

test('reservation envelope accepts only one result field, never an ambiguous error or extension', async () => {
  for (const raw of [
    '{"result":[1,0],"error":null}', '{"result":[1,0],"error":false}',
    '{"result":[1,0],"error":0}', '{"result":[1,0],"error":""}',
    '{"result":[1,0],"unknown":"outcome"}', '{"result":[1,0],"__proto__":{}}',
    'null', '[]', '[{"result":[1,0]}]', 'true', '1', '"result"', '{}', '{"error":null}',
  ]) {
    let calls = 0;
    await assert.rejects(() => budget.acquireAskCovaPermit({ ownerId, requestId, env,
      fetchImpl: async () => { calls++; return new Response(raw); },
    }), /Ask Cova reservation unavailable/, raw);
    assert.equal(calls, 1, raw);
  }
});

test('rejected Redis HTTP responses are cancelled without inspecting their body', async () => {
  let cancelled = false;
  await assert.rejects(() => budget.acquireAskCovaPermit({ ownerId, requestId, env, fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 500 }) }));
  assert.equal(cancelled, true);
});

test('lost reservation response is not retried; oversized backend response cancels', async () => {
  let calls = 0;
  await assert.rejects(() => budget.acquireAskCovaPermit({ ownerId, requestId, env, fetchImpl: async () => { calls++; throw Error('unknown committed outcome'); } }));
  assert.equal(calls, 1);
  let cancelled = false;
  await assert.rejects(() => budget.acquireAskCovaPermit({ ownerId, requestId, env, fetchImpl: async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(' '.repeat(5000))); }, cancel() { cancelled = true; } })) }));
  assert.equal(cancelled, true);
});

// Actual Lua is run ONLY against an isolated child Redis on loopback. No remote
// Redis URLs, credentials, existing databases or paid provider are used here.
const redisExecutable = process.env.COVA_TEST_REDIS_SERVER || 'redis-server';
const redisInstalled = spawnSync(redisExecutable, ['--version'], { encoding: 'utf8', timeout: 5000 }).status === 0;
function redisCommand(port, args) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let bytes = Buffer.alloc(0);
    socket.setTimeout(5000, () => socket.destroy(Error('Local Redis timeout')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write('*' + args.length + '\r\n' + args.map(arg => '$' + Buffer.byteLength(String(arg)) + '\r\n' + arg + '\r\n').join('')));
    const parse = (offset = 0) => {
      const end = bytes.indexOf('\r\n', offset); if (end < 0) return null;
      const kind = String.fromCharCode(bytes[offset]), text = bytes.subarray(offset + 1, end).toString();
      let next = end + 2;
      if (kind === '-' ) throw Error(text);
      if (kind === '+' || kind === ':') return { value: kind === ':' ? Number(text) : text, next };
      const length = Number(text); if (length === -1) return { value: null, next };
      if (kind === '$') { if (bytes.length < next + length + 2) return null; return { value: bytes.subarray(next, next + length).toString(), next: next + length + 2 }; }
      if (kind === '*') { const value = []; for (let i = 0; i < length; i++) { const part = parse(next); if (!part) return null; value.push(part.value); next = part.next; } return { value, next }; }
      throw Error('Unexpected local Redis protocol');
    };
    socket.on('data', chunk => { bytes = Buffer.concat([bytes, chunk]); try { const result = parse(); if (result) { socket.end(); resolve(result.value); } } catch (error) { socket.destroy(); reject(error); } });
  });
}

test('actual Redis Lua: concurrency, near-cap, durable replay, campaign pin and unknown outcomes', { skip: !redisInstalled && 'Redis server is not installed; real Lua verification remains a rollout blocker' }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cova-redis-only-test-'));
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const child = spawn(redisExecutable, ['--bind', '127.0.0.1', '--port', String(port), '--save', '', '--appendonly', 'no', '--dir', dir], { stdio: 'ignore' });
  t.after(async () => { child.kill(); await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve)); await rm(dir, { recursive: true, force: true }); });
  let ready = false;
  for (let i = 0; i < 100; i++) { try { ready = await redisCommand(port, ['PING']) === 'PONG'; if (ready) break; } catch {} await new Promise(resolve => setTimeout(resolve, 20)); }
  assert(ready, 'isolated Redis must start');
  const commands = [];
  const fetchImpl = async (_url, options) => { const cmd = JSON.parse(options.body); commands.push(cmd); return new Response(JSON.stringify({ result: await redisCommand(port, cmd) })); };
  const reserve = (overrides = {}) => budget.acquireAskCovaPermit({ ownerId, requestId: randomUUID(), env, fetchImpl, ...overrides });
  const reset = () => redisCommand(port, ['FLUSHDB']); // ONLY our newly spawned disposable DB.

  await reset();
  const near = await Promise.all(Array.from({ length: 40 }, () => reserve({ ownerId: randomUUID(), env: { ...env, ASK_COVA_BUDGET_MICRO_USD: '30000' } })));
  assert.equal(near.filter(p => p.allowed).length, 3);
  const budgetKey = commands[0][3];
  assert.equal(await redisCommand(port, ['HGET', budgetKey, 'used']), '30000');
  assert.equal(await redisCommand(port, ['TTL', budgetKey]), -1);
  await Promise.all(near.map(p => p.release()));
  assert.equal(await redisCommand(port, ['HGET', budgetKey, 'used']), '30000');

  await reset(); commands.length = 0;
  const same = await Promise.all(Array.from({ length: 10 }, () => reserve()));
  assert.equal(same.filter(p => p.allowed).length, 1);
  assert.equal(await redisCommand(port, ['HGET', budgetKey, 'used']), '10000');
  await Promise.all(same.map(p => p.release()));

  await reset(); commands.length = 0;
  const identity = randomUUID(); const first = await reserve({ requestId: identity });
  assert(first.allowed); const keys = commands[0].slice(3,8); await first.release();
  const replay = await reserve({ requestId: identity.toUpperCase() }); assert.equal(replay.allowed, false); assert.equal(replay.reason, 2);
  assert.equal(await redisCommand(port, ['TTL', keys[3]]), -1);
  assert.equal((await reserve({ env: { ...env, ASK_COVA_BUDGET_ID: 'rotated' } })).reason, 6);
  assert.equal((await reserve({ env: { ...env, ASK_COVA_BUDGET_MICRO_USD: '200000' } })).reason, 6);
  await redisCommand(port, ['HSET', budgetKey, 'used', '90001']);
  assert.equal((await reserve({ ownerId: randomUUID() })).reason, 5);
  assert.equal(await redisCommand(port, ['HGET', budgetKey, 'used']), '90001');

  await reset(); commands.length = 0;
  const lostId = randomUUID();
  await assert.rejects(() => reserve({ requestId: lostId, fetchImpl: async (url, options) => { await fetchImpl(url, options); throw Error('response lost after commit'); } }));
  assert.equal(await redisCommand(port, ['HGET', budgetKey, 'used']), '10000');
  assert.equal((await reserve({ requestId: lostId })).reason, 2);

  await reset(); commands.length = 0;
  const start = await reserve(); await start.release();
  const dailyKeys = commands[0].slice(3,8);
  const [seconds] = await redisCommand(port, ['TIME']);
  await redisCommand(port, ['HSET', dailyKeys[2], 'day', String(Math.floor(Number(seconds) / 86400)), 'count', '20']);
  assert.equal((await reserve()).reason, 4);
  await redisCommand(port, ['HSET', dailyKeys[2], 'count', '0']);
  await redisCommand(port, ['SET', dailyKeys[1], '5']);
  assert.equal((await reserve()).reason, 1);
});

test('missing durable backend fails closed before network access', async () => {
  assert.equal(typeof budget.acquireAskCovaPermit, 'function');
  let calls = 0;
  await assert.rejects(() => budget.acquireAskCovaPermit({ ownerId, requestId, env: {}, fetchImpl: () => { calls++; throw Error('offline'); } }));
  assert.equal(calls, 0);
});
