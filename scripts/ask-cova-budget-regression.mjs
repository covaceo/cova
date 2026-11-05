import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import load from './helpers/load-ts.cjs';
const source = 'server/askCovaBudget.ts';
const budget = existsSync(source) ? load(source) : {};
const ownerId = '11111111-1111-4111-8111-111111111111';
const requestId = '33333333-3333-4333-8333-333333333333';
const charge = budget.ASK_COVA_RESERVATION_MICRO_USD;
const syntheticCap = 10 * charge;
const env = { ASK_COVA_BUDGET_ID: 'synthetic-campaign', ASK_COVA_BUDGET_MICRO_USD: String(syntheticCap), KV_REST_API_URL: 'https://synthetic.upstash.io', KV_REST_API_TOKEN: 'synthetic-only-not-a-credential-123456789' };

test('atomic reservation uses pinned campaign, durable dedup and fixed charge; release only unlocks', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    assert.equal(url, env.KV_REST_API_URL);
    calls.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ result: calls.length === 1 ? [1, 0] : 1 }));
  };
  const permit = await budget.acquireAskCovaPermit({ ownerId, requestId, env, fetchImpl });
  assert.equal(permit.allowed, true);
  assert.equal(budget.ASK_COVA_RESERVATION_MICRO_USD, 4000);
  assert.equal(calls[0][0], 'EVAL');
  assert.match(calls[0][1], /redis.call\('TIME'\)/);
  assert.match(calls[0][1], /campaign/);
  assert.equal(calls[0][10], '4000', 'future reservations are fixed $0.004, never a byte-derived estimate or settlement');
  await permit.release(); await permit.release();
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[1][1], /DECR|HINCRBY|budget/i);
  assert.equal(calls[0][3], 'ask-cova:{reservation-v1}:budget');
});

test('prospective charge preserves original ledger policy, campaign/cap and lock-only release', async () => {
  // Frozen from base 21897b170851d1701815f0d3a9ed0cae88e06af1. This is an offline
  // policy-identity check, NOT Redis-engine, live-balance or concurrency evidence.
  assert.equal(createHash('sha256').update(budget.ASK_COVA_RESERVE_LUA).digest('hex'),
    'f970d8b54b629c0e996960a9239b01afb57c9475f9add9f8e48eacc522dda3f7');
  const commands = [];
  const p = await budget.acquireAskCovaPermit({ ownerId, requestId,
    env: { ...env, ASK_COVA_BUDGET_ID: 'ask-cova-private-beta-20261103', ASK_COVA_BUDGET_MICRO_USD: '1000000' },
    fetchImpl: async (_url, options) => { commands.push(JSON.parse(options.body)); return new Response(JSON.stringify({ result: commands.length === 1 ? [1, 0] : 1 })); },
  });
  await p.release(); await p.release();
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[0].slice(8, 11), ['ask-cova-private-beta-20261103', '1000000', '4000']);
  assert.equal(commands[0][3], 'ask-cova:{reservation-v1}:budget');
  assert.match(commands[0][6], /^ask-cova:\{reservation-v1\}:request:/);
  assert.deepEqual(commands[1], ['EVAL', "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", '1', commands[0][7], commands[0][11]]);
});

test('invalid backend origins/caps and malformed receipts fail closed', async () => {
  const changes = [
    { KV_REST_API_URL: 'http://synthetic.upstash.io' }, { KV_REST_API_URL: 'https://synthetic.upstash.io.evil.invalid' },
    { KV_REST_API_URL: 'https://user:pass@synthetic.upstash.io' }, { KV_REST_API_URL: 'https://synthetic.upstash.io/path' },
    { KV_REST_API_URL: 'https://synthetic.upstash.io:443' }, { KV_REST_API_TOKEN: 'short' },
    { ASK_COVA_BUDGET_MICRO_USD: '10000001' }, { ASK_COVA_BUDGET_MICRO_USD: '0' },
    { ASK_COVA_BUDGET_MICRO_USD: String(charge - 1) }, { ASK_COVA_BUDGET_MICRO_USD: '3999' },
    { ASK_COVA_BUDGET_MICRO_USD: '1e6' }, { ASK_COVA_BUDGET_ID: 'bad:key' },
  ];
  for (const change of changes) {
    let calls = 0;
    await assert.rejects(() => budget.acquireAskCovaPermit({ ownerId, requestId, env: { ...env, ...change }, fetchImpl: () => { calls++; throw Error('must not dispatch'); } }));
    assert.equal(calls, 0, JSON.stringify(change));
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

test('configuration minimum is one gated reservation; maximum remains $10, not deployment approval', () => {
  assert.equal(budget.ASK_COVA_MAX_BUDGET_MICRO_USD, 10000000);
  for (const cap of [charge, 9999, 259999, 1000000, 10000000]) {
    assert.equal(budget.askCovaBudgetConfiguration({ ...env, ASK_COVA_BUDGET_MICRO_USD: String(cap) }).cap, cap);
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

// Shared behavioral assertions: real Redis below; any external Lua/shim runner
// must label itself as NOT Redis-engine or concurrency evidence.
async function assertLedgerIntegrity({ command, reserve, reset, budgetKey }) {
  const snapshot = async () => {
    const keys = (await command(['KEYS', 'ask-cova:{reservation-v1}:*'])).sort();
    return Promise.all(keys.map(async key => {
      const type = await command(['TYPE', key]);
      const value = await command([type === 'hash' ? 'HGETALL' : 'GET', key]);
      const canonical = type === 'hash'
        ? Array.from({ length: value.length / 2 }, (_, i) => [value[i * 2], value[i * 2 + 1]]).sort(([a], [b]) => a.localeCompare(b))
        : value;
      return [key, type, canonical, (await command(['PTTL', key])) >= 0];
    }));
  };
  const deniedUnchanged = async (label, overrides = {}) => {
    const before = await snapshot();
    const result = await reserve({ ownerId: randomUUID(), ...overrides });
    assert.equal(result.allowed, false, label + ': must deny');
    assert.equal(result.reason, 6, label + ': invalid ledger');
    await result.release();
    assert.deepEqual(await snapshot(), before, label + ': must not write or repair anything');
  };

  await reset(env.ASK_COVA_BUDGET_MICRO_USD, false);
  await deniedUnchanged('entire ledger never initialized');
  const corruptions = [
    ['whole ledger deleted', ['DEL', budgetKey]],
    ...['campaign', 'cap', 'used'].map(field => [`missing ${field}`, ['HDEL', budgetKey, field]]),
    ['wrong campaign', ['HSET', budgetKey, 'campaign', 'other-campaign']],
    ['empty campaign', ['HSET', budgetKey, 'campaign', '']],
    ['different persisted cap', ['HSET', budgetKey, 'cap', String(syntheticCap + charge)]],
    ['budget has TTL', ['PEXPIRE', budgetKey, '600000']],
    ...['', '-1', '-0', '+0', '00', '010000', '10000.0', '1e4', '0x2710', ' 10000', '10000 ', '10000\n', '10000.5', 'nan', 'inf', String(syntheticCap + 1), '9007199254740993'].map(value => [`malformed used ${JSON.stringify(value)}`, ['HSET', budgetKey, 'used', value]]),
    ...['', '-100000', '+100000', '0100000', '100000.0', '1e5', '0x186a0', ' 100000', '100000 ', '100000\n', 'nan', 'inf'].map(value => [`malformed cap ${JSON.stringify(value)}`, ['HSET', budgetKey, 'cap', value]]),
  ];
  for (const [label, mutation] of corruptions) {
    await reset();
    const spentId = randomUUID();
    const accepted = await reserve({ requestId: spentId });
    assert.equal(accepted.allowed, true, label + ': valid seed must allow first spend');
    await accepted.release();
    assert.equal(await command(['HGET', budgetKey, 'used']), String(charge));
    await command(mutation);
    await deniedUnchanged(label);
    await deniedUnchanged(label + ' even for existing receipt', { requestId: spentId, ownerId });
  }
  await reset();
  await deniedUnchanged('configured campaign mismatch', { env: { ...env, ASK_COVA_BUDGET_ID: 'rotated' } });
  await deniedUnchanged('configured cap increase', { env: { ...env, ASK_COVA_BUDGET_MICRO_USD: String(syntheticCap + charge) } });
  await deniedUnchanged('configured cap decrease', { env: { ...env, ASK_COVA_BUDGET_MICRO_USD: String(syntheticCap - charge) } });
  await command(['HSET', budgetKey, 'used', String(syntheticCap)]);
  const full = await reserve();
  assert.equal(full.allowed, false); assert.equal(full.reason, 5);
  assert.equal(await command(['HGET', budgetKey, 'used']), String(syntheticCap));
  await reset();
  await command(['HSET', budgetKey, 'used', String(syntheticCap - charge)]);
  const last = await reserve(); assert.equal(last.allowed, true); await last.release();
  assert.equal(await command(['HGET', budgetKey, 'used']), String(syntheticCap));
  assert.equal((await reserve({ ownerId: randomUUID() })).reason, 5);
  await reset();
  await command(['HSET', budgetKey, 'used', '1']);
  const prior = await reserve(); assert.equal(prior.allowed, true); await prior.release();
  assert.equal(await command(['HGET', budgetKey, 'used']), String(charge + 1), 'preserve even non-charge-aligned prior spend');
  assert.equal(await command(['HGET', budgetKey, 'campaign']), env.ASK_COVA_BUDGET_ID);
  assert.equal(await command(['HGET', budgetKey, 'cap']), env.ASK_COVA_BUDGET_MICRO_USD);
  assert.equal(await command(['PTTL', budgetKey]), -1);
}
// End shared ledger assertions.

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
  const budgetKey = 'ask-cova:{reservation-v1}:budget';
  // ONLY our newly spawned disposable DB. Production request paths never seed.
  const reset = async (cap = env.ASK_COVA_BUDGET_MICRO_USD, initialize = true) => {
    await redisCommand(port, ['FLUSHDB']);
    if (initialize) await redisCommand(port, ['HSET', budgetKey, 'campaign', env.ASK_COVA_BUDGET_ID, 'cap', cap, 'used', '0']);
  };
  await t.test('invalid or lost ledger denies without any state changes', () => assertLedgerIntegrity({ command: args => redisCommand(port, args), reserve, reset, budgetKey }));

  await reset('1000000'); commands.length = 0;
  // Synthetic legacy ledger: three historical 260000 debits remain untouched.
  await redisCommand(port, ['HSET', budgetKey, 'used', '780000']);
  const legacyReceipt = 'ask-cova:{reservation-v1}:request:synthetic-legacy';
  await redisCommand(port, ['SET', legacyReceipt, 'reserved']);
  const near = await Promise.all(Array.from({ length: 60 }, () => reserve({ ownerId: randomUUID(), env: { ...env, ASK_COVA_BUDGET_MICRO_USD: '1000000' } })));
  assert.equal(near.filter(p => p.allowed).length, 55);
  assert.equal(near.filter(p => !p.allowed).every(p => p.reason === 5), true);
  assert.equal(commands[0][3], budgetKey);
  assert.equal(commands[0][10], '4000');
  assert.equal(await redisCommand(port, ['HGET', budgetKey, 'used']), '1000000');
  assert.equal(await redisCommand(port, ['TTL', budgetKey]), -1);
  await Promise.all(near.map(p => p.release()));
  assert.equal(await redisCommand(port, ['HGET', budgetKey, 'used']), '1000000');
  assert.equal(await redisCommand(port, ['HGET', budgetKey, 'cap']), '1000000');
  assert.equal(await redisCommand(port, ['HGET', budgetKey, 'campaign']), env.ASK_COVA_BUDGET_ID);
  assert.equal(await redisCommand(port, ['GET', legacyReceipt]), 'reserved');
  assert.equal(await redisCommand(port, ['TTL', legacyReceipt]), -1);

  await t.test('$1 cap preserves legacy debits; unlock and day rollover never refund', async () => {
    await reset('1000000'); commands.length = 0;
    await redisCommand(port, ['HSET', budgetKey, 'used', '988000']); // Synthetic prior usage, never repriced.
    const approvedEnv = { ...env, ASK_COVA_BUDGET_MICRO_USD: '1000000' };
    for (let i = 0; i < 3; i++) {
      const permit = await reserve({ env: approvedEnv });
      assert.equal(permit.allowed, true);
      await permit.release();
    }
    const fourth = await reserve({ env: approvedEnv });
    assert.equal(fourth.allowed, false); assert.equal(fourth.reason, 5);
    const keys = commands[0].slice(3, 8);
    await redisCommand(port, ['DEL', keys[1]]); // Disposable fixture: simulate next rate window.
    await redisCommand(port, ['HSET', keys[2], 'day', '-1', 'count', '20']);
    const nextDay = await reserve({ env: approvedEnv });
    assert.equal(nextDay.allowed, false); assert.equal(nextDay.reason, 5);
    assert.equal(await redisCommand(port, ['HGET', budgetKey, 'used']), '1000000');
    assert.equal(await redisCommand(port, ['PTTL', budgetKey]), -1);
    assert.equal(await redisCommand(port, ['PTTL', keys[3]]), -1);
  });

  await reset(); commands.length = 0;
  const same = await Promise.all(Array.from({ length: 10 }, () => reserve()));
  assert.equal(same.filter(p => p.allowed).length, 1);
  assert.equal(await redisCommand(port, ['HGET', budgetKey, 'used']), String(charge));
  await Promise.all(same.map(p => p.release()));

  await reset(); commands.length = 0;
  const identity = randomUUID(); const first = await reserve({ requestId: identity });
  assert(first.allowed); const keys = commands[0].slice(3,8); await first.release();
  const replay = await reserve({ requestId: identity.toUpperCase() }); assert.equal(replay.allowed, false); assert.equal(replay.reason, 2);
  assert.equal(await redisCommand(port, ['TTL', keys[3]]), -1);
  assert.equal((await reserve({ env: { ...env, ASK_COVA_BUDGET_ID: 'rotated' } })).reason, 6);
  assert.equal((await reserve({ env: { ...env, ASK_COVA_BUDGET_MICRO_USD: String(syntheticCap + charge) } })).reason, 6);
  await redisCommand(port, ['HSET', budgetKey, 'used', String(syntheticCap - charge + 1)]);
  assert.equal((await reserve({ ownerId: randomUUID() })).reason, 5);
  assert.equal(await redisCommand(port, ['HGET', budgetKey, 'used']), String(syntheticCap - charge + 1));

  await reset(); commands.length = 0;
  const lostId = randomUUID();
  await assert.rejects(() => reserve({ requestId: lostId, fetchImpl: async (url, options) => { await fetchImpl(url, options); throw Error('response lost after commit'); } }));
  assert.equal(await redisCommand(port, ['HGET', budgetKey, 'used']), String(charge));
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

  await t.test('twenty daily permits remain available with adequate synthetic cap; twenty-first is daily-denied', async () => {
    const dailyCap = String(21 * charge); // NOT the approved deployment cap.
    assert(Number(dailyCap) <= budget.ASK_COVA_MAX_BUDGET_MICRO_USD);
    const dailyEnv = { ...env, ASK_COVA_BUDGET_MICRO_USD: dailyCap };
    await reset(dailyCap); commands.length = 0;
    for (let i = 0; i < 20; i++) {
      const permit = await reserve({ env: dailyEnv });
      assert.equal(permit.allowed, true, `daily permit ${i + 1}`);
      await permit.release();
      await redisCommand(port, ['DEL', commands[0][4]]); // Simulate separate minute windows.
    }
    const denied = await reserve({ env: dailyEnv });
    assert.equal(denied.allowed, false); assert.equal(denied.reason, 4);
    assert.equal(await redisCommand(port, ['HGET', budgetKey, 'used']), String(20 * charge));
    assert.equal(await redisCommand(port, ['HGET', commands[0][5], 'count']), '20');
  });
});

test('missing durable backend fails closed before network access', async () => {
  assert.equal(typeof budget.acquireAskCovaPermit, 'function');
  let calls = 0;
  await assert.rejects(() => budget.acquireAskCovaPermit({ ownerId, requestId, env: {}, fetchImpl: () => { calls++; throw Error('offline'); } }));
  assert.equal(calls, 0);
});
