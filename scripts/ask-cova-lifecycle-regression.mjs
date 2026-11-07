import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { setImmediate as nextTurn } from 'node:timers/promises';
import load from './helpers/load-ts.cjs';
import { syntheticAnswer, syntheticEnvelope } from './helpers/ask-cova-authored-fixture.mjs';

// Real source handler + real permit implementation; all I/O is synthetic.
// Never use process.env, real credentials, a provider or a live ledger.
const { createAskCovaHandler } = load('server/askCova.ts');
const { acquireAskCovaPermit } = load('server/askCovaBudget.ts');
const core = load('src/lib/askCova.ts');
const owner = '11111111-1111-4111-8111-111111111111';
const requestId = '33333333-3333-4333-8333-333333333333';
const env = {
  ASK_COVA_ENABLED: 'true', ASK_COVA_BETA_USER_ID: owner,
  OPENAI_API_KEY: 'synthetic-only-not-a-real-credential',
  ASK_COVA_BUDGET_ID: 'synthetic-campaign', ASK_COVA_BUDGET_MICRO_USD: '1000000',
  KV_REST_API_URL: 'https://synthetic.upstash.io',
  KV_REST_API_TOKEN: 'synthetic-only-not-a-credential-123456789',
};
const trade = { id: 'tradovate-7:one', date: '2026-10-29', market: 'NQ', side: 'Long', contracts: 1,
  entry: 100, exit: 101, pnl: 20, risk: 10, setup: '', notes: '',
  source: { provider: 'Tradovate', accountId: '7', pnlBasis: 'gross_before_fees' } };
const record = { kind: 'trade', record_id: trade.id, account_id: 'Tradovate:7', schema_version: 1,
  payload: trade, revision: 1, created_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:00Z', deleted_at: null };
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function fixture(options = {}) {
  const catalog = await core.buildAskCovaCatalog({ ownerId: owner, account: 'Tradovate:7', range: 'all', question: 'review_results', trades: [trade] });
  const answer = syntheticAnswer(core.askCovaModelPayload(catalog), 'warm');
  const events = [], commands = [], commits = [];
  const state = { releaseCalls: 0, releaseSettled: false, countCalls: 0, generationCalls: 0 };
  const releaseStarted = deferred();
  const budgetFetch = async (url, init) => {
    assert.equal(url, env.KV_REST_API_URL);
    const command = JSON.parse(init.body); commands.push(command);
    assert.equal(command[0], 'EVAL');
    if (command[2] === '5') {
      events.push('reserve');
      if (options.reserveFailure) throw Error('SYNTHETIC unknown reservation outcome');
      return new Response(JSON.stringify({ result: options.denial ? [0, options.denial] : [1, 0] }));
    }
    assert.equal(command[2], '1');
    events.push('release-start'); releaseStarted.resolve();
    if (options.releaseFailure === 'timeout') {
      return new Promise((_, reject) => {
        const abort = () => reject(init.signal.reason);
        init.signal.addEventListener('abort', abort, { once: true });
        if (init.signal.aborted) abort();
      });
    }
    await (options.releaseGate || nextTurn());
    if (options.releaseFailure === 'transport') throw Error('SYNTHETIC cleanup transport error');
    if (options.releaseFailure === 'http') return new Response('SYNTHETIC cleanup error', { status: 503 });
    if (options.releaseFailure === 'malformed') return new Response('SYNTHETIC malformed receipt');
    return new Response('{"result":1}');
  };
  const acquirePermit = async args => {
    const permit = await acquireAskCovaPermit({ ...args, fetchImpl: budgetFetch });
    return { ...permit, async release() {
      state.releaseCalls++;
      await permit.release();
      state.releaseSettled = true; events.push('release-settled');
      if (options.releaseFailure === 'reject') throw Error('SYNTHETIC rejected cleanup');
    } };
  };
  const fetchImpl = async url => {
    if (url === 'https://api.openai.com/v1/responses/input_tokens') {
      state.countCalls++; events.push('count');
      if (options.outcome === 'count-error') throw Error('SYNTHETIC count failure');
      if (options.outcome === 'count-large') return new Response('{"object":"response.input_tokens","input_tokens":28097}');
      return new Response('{"object":"response.input_tokens","input_tokens":500}');
    }
    assert.equal(url, 'https://api.openai.com/v1/responses');
    state.generationCalls++; events.push('generation');
    if (options.outcome === 'provider-error') throw Error('SYNTHETIC provider failure');
    if (options.outcome === 'invalid-answer') return new Response('{}');
    return new Response(JSON.stringify(syntheticEnvelope(answer)));
  };
  let settingsReads = 0;
  const rest = async (path, { query }) => {
    assert.equal(query.owner_id, 'eq.' + owner);
    if (path === 'workspace_settings') {
      settingsReads++;
      if (settingsReads === 3 && options.outcome === 'recheck-error') throw Error('SYNTHETIC storage failure');
      return [{ disclosure_version: 'workspace-cloud-v1', revision: settingsReads === 3 && options.outcome === 'context-changed' ? 2 : 1, pending_manifest: null }];
    }
    assert.equal(path, 'workspace_records');
    return query.offset === '0' ? [record] : [];
  };
  const handler = createAskCovaHandler({ acquirePermit, fetchImpl });
  const context = { body: { action: 'ask_cova', owner, account: 'Tradovate:7', range: 'all', question: 'review_results',
    contextDigest: catalog.contextDigest, protocolVersion: 'ask-cova-v3', requestId }, user: { id: owner }, environment: env, rest };
  let status;
  const res = { status(value) { status = value; return this; }, json(payload) {
    events.push('commit');
    const snapshot = structuredClone({ status, payload, ...state, events, commands });
    commits.push(snapshot);
    options.onCommit?.(snapshot);
    return this;
  } };
  return { run: () => handler(context, res), context, answer, catalog, events, commands, commits, state, releaseStarted };
}
function assertResponse(result, outcome, answer, contextDigest) {
  if (outcome === 'success') {
    assert.equal(result.status, 200);
    if (answer) assert.deepEqual(result.payload, { status: 'ok', aiResponseUsed: true, contextDigest, answer });
    else assert.equal(result.payload.aiResponseUsed, true);
  } else {
    assert.equal(result.status, 502);
    assert.deepEqual(result.payload, { status: 'unavailable', error: 'provider_unavailable' });
  }
}
function assertOnlyUnlock(commands) {
  assert.equal(commands.length, 2, 'one reservation and one unlock; no refund, settlement or retry');
  assert.equal(commands[0][2], '5');
  assert.equal(commands[0][10], '4000');
  assert.equal(commands[1][2], '1');
  assert.equal(commands[1][1], "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end");
  assert.equal(commands[1][3], commands[0][7], 'release only the admitted owner lock');
  assert.equal(commands[1][4], commands[0][11], 'release only the admitted lock identity');
}

if (!isMainThread) {
  // Deliberately end this isolated runtime synchronously at response commit.
  // This is a lifecycle simulation, NOT a claim about a live hosting platform.
  const f = await fixture({ outcome: workerData.outcome, onCommit(snapshot) {
    parentPort.postMessage(snapshot);
    process.exit(0);
  } });
  await f.run();
} else {
  for (const outcome of ['success', 'provider-error']) {
    test(`${outcome}: response waits for asynchronous release settlement`, async () => {
      const gate = deferred();
      const f = await fixture({ outcome, releaseGate: gate.promise });
      const pending = f.run();
      await f.releaseStarted.promise;
      try {
        assert.equal(f.state.releaseCalls, 1);
        assert.equal(f.state.releaseSettled, false);
        assert.equal(f.commits.length, 0, `response committed before unlock settled: ${JSON.stringify(f.events)}`);
      } finally { gate.resolve(); await pending; }
      assert.equal(f.commits.length, 1);
      assert.equal(f.commits[0].releaseSettled, true);
      assert.equal(f.commits[0].releaseCalls, 1);
      assertResponse(f.commits[0], outcome, f.answer, f.catalog.contextDigest);
      assertOnlyUnlock(f.commands);
    });
    test(`${outcome}: ending runtime at response commit cannot strand release`, async () => {
      const snapshot = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { outcome } });
        let result;
        worker.once('message', value => { result = value; });
        worker.once('error', reject);
        worker.once('exit', code => code === 0 && result ? resolve(result) : reject(Error(`runtime exited ${code} without a committed response`)));
      });
      assertResponse(snapshot, outcome);
      assert.equal(snapshot.releaseSettled, true, `runtime ended with unlock unfinished: ${JSON.stringify(snapshot.events)}`);
      assert.equal(snapshot.releaseCalls, 1);
      assert.deepEqual(snapshot.events.slice(-3), ['release-start', 'release-settled', 'commit']);
      assertOnlyUnlock(snapshot.commands);
    });
  }

  // Preservation coverage: these paths use the same release-before-commit seam.
  for (const [outcome, status, error, generated] of [
    ['count-error', 503, 'token_count_unavailable', 0],
    ['count-large', 422, 'context_too_large', 0],
    ['invalid-answer', 502, 'provider_unavailable', 1],
    ['context-changed', 409, 'context_changed', 1],
    ['recheck-error', 503, 'ask_cova_unavailable', 1],
  ]) {
    test(`${outcome}: admitted failure releases exactly once before committing`, async () => {
      const f = await fixture({ outcome });
      await f.run();
      assert.equal(f.commits.length, 1);
      const result = f.commits[0];
      assert.equal(result.status, status);
      assert.deepEqual(result.payload, { status: 'unavailable', error });
      assert.equal(result.releaseCalls, 1);
      assert.equal(result.releaseSettled, true);
      assert.equal(result.generationCalls, generated);
      assertOnlyUnlock(f.commands);
    });
  }

  for (const [reason, status, error] of [
    [1, 429, 'rate_limited'], [2, 429, 'duplicate_request'], [3, 429, 'request_in_progress'],
    [4, 429, 'daily_limit'], [5, 429, 'budget_exhausted'], [6, 503, 'budget_unavailable'],
  ]) {
    test(`denial ${reason}: never release, refund, count or generate`, async () => {
      const f = await fixture({ denial: reason });
      await f.run();
      assert.equal(f.commits.length, 1);
      assert.equal(f.commits[0].status, status);
      assert.deepEqual(f.commits[0].payload, { status: 'unavailable', error });
      assert.equal(f.state.releaseCalls, 0);
      assert.equal(f.state.countCalls, 0);
      assert.equal(f.state.generationCalls, 0);
      assert.equal(f.commands.length, 1);
      assert.deepEqual(f.events, ['reserve', 'commit']);
    });
  }

  test('unknown reservation outcome does not release or dispatch', async () => {
    const f = await fixture({ reserveFailure: true });
    await f.run();
    assert.equal(f.commits.length, 1);
    assert.equal(f.commits[0].status, 503);
    assert.equal(f.state.releaseCalls, 0);
    assert.equal(f.state.countCalls, 0);
    assert.equal(f.state.generationCalls, 0);
    assert.equal(f.commands.length, 1);
  });

  for (const failure of ['transport', 'http', 'malformed', 'reject']) {
    for (const outcome of ['success', 'provider-error']) {
      test(`${failure}: cleanup failure preserves ${outcome} without refund or retry`, async () => {
        const f = await fixture({ outcome, releaseFailure: failure });
        await f.run();
        assert.equal(f.commits.length, 1);
        assertResponse(f.commits[0], outcome, f.answer, f.catalog.contextDigest);
        assert.equal(f.commits[0].releaseCalls, 1);
        assert.equal(f.commits[0].releaseSettled, true);
        assertOnlyUnlock(f.commands);
      });
    }
  }

  test('existing five-second release HTTP timeout settles before preserving the answer', async t => {
    // Trigger the supplied abort deterministically, rather than asserting wall-clock timing.
    const deadlines = [];
    t.mock.method(AbortSignal, 'timeout', ms => {
      const controller = new AbortController();
      deadlines.push({ ms, controller });
      return controller.signal;
    });
    const f = await fixture({ releaseFailure: 'timeout' });
    const pending = f.run();
    await f.releaseStarted.promise;
    try {
      assert.deepEqual(deadlines.map(item => item.ms), [5000, 5000, 15000, 5000]);
      assert.equal(f.commits.length, 0);
      assert.equal(f.state.releaseSettled, false);
    } finally {
      deadlines.at(-1).controller.abort(new DOMException('SYNTHETIC timeout', 'TimeoutError'));
      await pending;
    }
    assert.equal(f.commits.length, 1);
    assertResponse(f.commits[0], 'success', f.answer, f.catalog.contextDigest);
    assert.equal(f.commits[0].releaseSettled, true);
    assert.equal(f.commits[0].releaseCalls, 1);
    assertOnlyUnlock(f.commands);
  });
}
