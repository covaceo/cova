import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// All requests use synthetic in-memory transports; never dispatch real fetches.
globalThis.fetch = async () => { throw Error('Live network forbidden'); };
const built = await build({ configFile: false, envDir: false, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: 'src/lib/askCovaClient.ts', write: false, target: 'node24' } });
const out = resolve(process.env.ASK_COVA_EVIDENCE_ROOT || '../ask-cova-limit-evidence/client', 'limits-runtime');
mkdirSync(out, { recursive: true });
const file = resolve(out, 'client.mjs');
writeFileSync(file, built.output[0].code);
const { requestAskCova, createAskCovaTransport } = await import(pathToFileURL(file));
const input = { owner: '11111111-1111-4111-8111-111111111111', account: 'local', range: 'all', question: 'review_results', contextDigest: 'a'.repeat(64), requestId: '22222222-2222-4222-8222-222222222222' };
const fallback429 = 'Ask Cova has reached its limit for now. Your trades are still here.';
const fallback = "I couldn't check that answer. Your trades are unchanged. Try again when you're ready.";
const sessionChanged = 'Your session changed. Sign in again to ask Cova.';
const cases = [
  [429, 'rate_limited', 'Too many questions in a short time. Wait a moment before asking Cova again.'],
  [429, 'request_in_progress', 'Ask Cova is already working on a request. Let it finish before asking again.'],
  [429, 'duplicate_request', 'Ask Cova has already received this request. Ask a new question to continue.'],
  [429, 'daily_limit', "You've reached Ask Cova's daily question limit. Your trades are unchanged."],
  [429, 'budget_exhausted', "Ask Cova has reached its usage limit and can't answer right now. Your trades are unchanged."],
  [503, 'budget_unavailable', "Ask Cova can't check its availability right now. Your trades are unchanged."],
];
const body = error => JSON.stringify({ status: 'unavailable', error });
async function request(response, { signal = new AbortController().signal, current = () => true } = {}) {
  let calls = 0;
  const result = await requestAskCova(input, signal, async () => { calls++; return response; }, current);
  assert.equal(calls, 1, 'no implicit retries');
  assert.equal(result.status, 'unavailable');
  return result;
}

for (const [status, reason, message] of cases) {
  test(`${status} ${reason} uses only its local explanation`, async () => {
    assert.deepEqual(await request(new Response(body(reason), { status })), { status: 'unavailable', message });
  });
}

test('strict error envelopes reject malformed, duplicate, extra and hostile fields', async () => {
  const invalid = [
    '', 'PRIVATE account balance $123', 'null', '[]', '42', '"daily_limit"', '{}',
    '{"error":"daily_limit"}', '{"status":"ok","error":"daily_limit"}',
    '{"status":"unavailable","error":null}', '{"status":"unavailable","error":{}}',
    '{"status":"unavailable","error":["daily_limit"]}', body('DAILY_LIMIT'),
    body(' daily_limit'), body('PRIVATE account balance $123'), body('__proto__'),
    JSON.stringify({ status: 'unavailable', error: 'daily_limit', message: 'PRIVATE account balance $123' }),
    '{"status":"unavailable","error":"rate_limited","error":"daily_limit"}',
    '{"status":"unavailable","err\\u006fr":"rate_limited","error":"daily_limit"}',
    '{"status":"ok","sta\\u0074us":"unavailable","error":"daily_limit"}',
  ];
  // Prove escaped-key fixtures are decoded collisions, not unrelated extra fields.
  assert.deepEqual(JSON.parse(invalid.at(-2)), { status: 'unavailable', error: 'daily_limit' });
  assert.deepEqual(JSON.parse(invalid.at(-1)), { status: 'unavailable', error: 'daily_limit' });
  for (const status of [429, 503]) for (const text of invalid) {
    assert.equal((await request(new Response(text, { status }))).message, status === 429 ? fallback429 : fallback, text);
  }
});

test('reason codes must match their HTTP status', async () => {
  for (const [status, reason] of cases) {
    const wrongStatus = status === 429 ? 503 : 429;
    assert.equal((await request(new Response(body(reason), { status: wrongStatus }))).message, wrongStatus === 429 ? fallback429 : fallback);
  }
});

test('auth and other HTTP messages cannot be overridden by hostile reason codes', async () => {
  const messages = [
    [401, sessionChanged],
    [403, 'Ask Cova needs saved account storage and an active session.'],
    [409, 'Your saved trades changed. Let them finish syncing, then ask again.'],
    [404, 'Ask Cova is not available yet.'], [500, fallback],
  ];
  for (const [status, message] of messages) for (const [, reason] of cases) {
    let reads = 0, canceled = false;
    const stream = new ReadableStream({ pull(controller) { reads++; controller.enqueue(new TextEncoder().encode(body(reason))); controller.close(); }, cancel() { canceled = true; } }, { highWaterMark: 0 });
    assert.equal((await request(new Response(stream, { status }))).message, message);
    assert.equal(reads, 0); assert.equal(canceled, true);
  }
});

for (const [status, reason, message] of cases.filter(([, reason]) => ['daily_limit', 'budget_unavailable'].includes(reason))) {
  test(`${status} error decoding accepts exactly 2048 bytes, rejects overflow and missing body`, async () => {
    for (const [text, expected] of [[body(reason).padEnd(2048), message], [body(reason).padEnd(2049), status === 429 ? fallback429 : fallback]]) {
      assert.equal((await request(new Response(text, { status, headers: { 'Content-Length': '1' } }))).message, expected);
    }
    assert.equal((await request(new Response(null, { status }))).message, status === 429 ? fallback429 : fallback);
  });
  test(`${status} oversized streams cancel after a bounded prefix and release the reader`, async () => {
    let chunks = 0, canceled = false;
    const stream = new ReadableStream({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(1024).fill(32)); }, cancel() { canceled = true; } }, { highWaterMark: 0 });
    assert.equal((await request(new Response(stream, { status }))).message, status === 429 ? fallback429 : fallback);
    assert.equal(chunks, 3); assert.equal(canceled, true); assert.equal(stream.locked, false);
  });
  test(`${status} split multibyte decoding stays byte-bounded and invalid UTF-8 fails closed`, async () => {
    // JSON whitespace is ASCII; a valid multi-byte spelling in the code is unknown, never classified.
    const bytes = new TextEncoder().encode(body('daily_limité'));
    let offset = 0;
    const stream = new ReadableStream({ pull(controller) { if (offset === bytes.length) controller.close(); else controller.enqueue(bytes.slice(offset, ++offset)); } }, { highWaterMark: 0 });
    assert.equal((await request(new Response(stream, { status }))).message, status === 429 ? fallback429 : fallback);
    let canceled = false;
    const invalid = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array([255])); }, cancel() { canceled = true; } }, { highWaterMark: 0 });
    assert.equal((await request(new Response(invalid, { status }))).message, status === 429 ? fallback429 : fallback);
    assert.equal(canceled, true); assert.equal(invalid.locked, false);
    const multibyte = JSON.stringify({ status: 'unavailable', error: '€'.repeat(700) });
    assert.ok(multibyte.length < 2048 && new TextEncoder().encode(multibyte).byteLength > 2048);
    assert.equal((await request(new Response(multibyte, { status }))).message, status === 429 ? fallback429 : fallback);
  });
  for (const malformed of [false, true]) {
    test(`${status} owner revoked during ${malformed ? 'malformed' : 'valid'} delayed body wins over reason`, async () => {
      let current = true, release, began;
      const reading = new Promise(resolve => { began = resolve; });
      const stream = new ReadableStream({ start(controller) { release = controller; }, pull() { began(); } }, { highWaterMark: 0 });
      const transport = createAskCovaTransport(input.owner, {
        current: () => current, session: async () => ({ user: { id: input.owner }, access_token: 'SYNTHETIC' }),
        fetch: async () => new Response(stream, { status }),
      });
      const pending = requestAskCova(input, new AbortController().signal, transport);
      await reading; current = false;
      release.enqueue(new TextEncoder().encode(malformed ? 'PRIVATE' : body(reason))); release.close();
      assert.equal((await pending).message, sessionChanged);
      assert.equal(stream.locked, false);
    });
  }
  test(`${status} abort cancels a stalled read without classified UI or waiting on source cancellation`, async () => {
    let began, canceled = false;
    const reading = new Promise(resolve => { began = resolve; });
    const controller = new AbortController();
    const stream = new ReadableStream({ pull() { began(); }, cancel() { canceled = true; return new Promise(() => {}); } }, { highWaterMark: 0 });
    const pending = request(new Response(stream, { status }), { signal: controller.signal });
    await reading; controller.abort();
    let timer;
    const result = await Promise.race([pending, new Promise(resolve => { timer = setTimeout(() => resolve(null), 500); })]);
    clearTimeout(timer);
    assert.notEqual(result, null); assert.equal(result.message, fallback);
    assert.equal(canceled, true); assert.equal(stream.locked, false);
  });
  test(`${status} source error falls back and releases the reader`, async () => {
    const stream = new ReadableStream({ pull(controller) { controller.error(Error('PRIVATE account balance $123')); } }, { highWaterMark: 0 });
    assert.equal((await request(new Response(stream, { status }))).message, status === 429 ? fallback429 : fallback);
    assert.equal(stream.locked, false);
  });
}
