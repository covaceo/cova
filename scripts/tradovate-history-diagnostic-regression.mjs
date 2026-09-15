import assert from "node:assert/strict";
import { encryptSecret } from "../api/_lib/encryption.js";
import handler from "../api/tradovate/sync.js";

const endpoint = "https://rpt-demo.tradovateapi.com/v1/reports/requestReportDefinitions";
// Structural fixture from the official Reports page. Not a live OAuth access claim.
const performance = { name: "Performance", params: [
  { name: "startDate", paramType: "Date", optional: false },
  { name: "endDate", paramType: "Date", optional: false },
  { name: "account", paramType: "accounts", optional: false },
  { name: "contract", paramType: "contracts", optional: true },
], fields: [], templates: ["Default.html"], pdfEnabled: true };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const originalFetch = globalThis.fetch;
const originalTimeout = globalThis.setTimeout;
const originalWarn = console.warn;
const env = { ...process.env };
let cases = 0;

async function run(options = {}) {
  const calls = [], warnings = [];
  const redis = options.redis ? [...options.redis] : [[1, 1], "OK", 1];
  const req = { method: options.method || "GET", query: { diagnostic: "history", url: "https://fixture-private.invalid" }, headers: {
    authorization: "Bearer fixture-cova-token", cookie: "cova_tradovate_connection=fixture-connection", "x-forwarded-for": "203.0.113.7",
  } };
  if (options.anonymous) delete req.headers.authorization;
  if (options.noCookie) delete req.headers.cookie;
  if (options.badIp) req.headers["x-forwarded-for"] = "invalid";
  const res = { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, setHeader(name, value) { this.headers[name.toLowerCase()] = value; } };
  process.env.TRADOVATE_API_BASE_URL = options.base || "https://demo.tradovateapi.com/v1";
  console.warn = (...args) => warnings.push(args);
  globalThis.setTimeout = (fn, delay, ...args) => {
    const timer = originalTimeout(fn, options.timeout && delay === 25_000 ? 20 : delay, ...args);
    if (options.timeout && delay === 25_000) timer.unref = () => timer;
    return timer;
  };
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    calls.push({ target, init });
    if (target === "https://example.supabase.co/auth/v1/user") return json({ id: "fixture-owner", app_metadata: { plan: options.plan || "pro" }, user_metadata: { plan: "pro" } }, options.authStatus || 200);
    if (target.includes("/rest/v1/policy_acceptances?")) return json(options.noPolicy ? [] : [{ id: "fixture-policy" }]);
    if (target === "https://fixture-history.upstash.io") { assert(redis.length, "Unexpected permit call"); return json({ result: redis.shift() }); }
    if (target.includes("/rest/v1/broker_connections?")) {
      const query = new URL(target).searchParams;
      assert.equal(query.get("user_id"), "eq.fixture-owner");
      assert.equal(query.get("provider"), "eq.tradovate");
      assert.equal(query.get("id"), "eq.fixture-connection");
      if (init.method === "DELETE") return json([]);
      return json(options.wrongOwner ? [] : [{ access_token_encrypted: encryptSecret("fixture-provider-token"), expires_at: options.expiry === undefined ? "2099-01-01T00:00:00.000Z" : options.expiry }]);
    }
    if (target === endpoint) {
      assert.equal(init.method, "GET");
      assert.equal(init.body, undefined);
      assert.equal(init.redirect, "error");
      assert.equal(init.headers.Authorization, "Bearer fixture-provider-token");
      assert(init.signal instanceof AbortSignal);
      return options.provider ? options.provider(init) : json([performance]);
    }
    throw new Error("Unexpected request in history diagnostic regression");
  };
  try { await handler(req, res); } finally { globalThis.setTimeout = originalTimeout; console.warn = originalWarn; }
  const upstream = calls.filter(c => c.target === endpoint);
  assert(upstream.length <= 1, "Never retry a reporting probe");
  assert(!calls.some(c => c.init.method === "DELETE" || c.init.method === "PATCH"), "Diagnostic must not mutate connection storage, even when expired");
  assert(!calls.some(c => c.target.includes("broker_connections") && ![undefined, "GET"].includes(c.init.method)), "No credential writes");
  if (calls.some(c => c.target.includes("broker_connections"))) assert.equal(redis.length, 0, "Always release acquired permit");
  assert.doesNotMatch(JSON.stringify([res.body, warnings]), /fixture-private|fixture-provider-token|fixture-cova-token|fixture-connection|fixture-owner/);
  assert.deepEqual(warnings, [], "No raw provider logging");
  if (res.body?.diagnostic) {
    assert.equal(res.headers["cache-control"], "private, no-store");
    assert.equal(res.body.csv, undefined);
    assert.equal(res.body.trades, undefined);
    assert.equal(res.body.diagnostic, "tradovate-history-definitions-v1");
    assert.deepEqual(Object.keys(res.body).sort(), ["diagnostic", "performanceAvailable", "requiredParameters", "requiredParametersComplete", "status", "upstreamStatus", "validDefinitionCount"].sort());
    for (const call of upstream) assert.equal(call.init.signal.aborted, true, "Terminal cleanup aborts transport");
  }
  cases++;
  return { res, calls, upstream };
}

try {
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "fixture-anon", SUPABASE_SERVICE_ROLE_KEY: "fixture-service", COVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), KV_REST_API_URL: "https://fixture-history.upstash.io", KV_REST_API_TOKEN: "fixture-redis-".repeat(4) });
  const success = await run();
  assert.equal(success.res.statusCode, 200);
  assert.equal(success.res.body.status, "definitions");
  assert.equal(success.res.body.validDefinitionCount, 1);
  assert.equal(success.res.body.performanceAvailable, true);
  assert.equal(success.res.body.requiredParametersComplete, true);
  assert.deepEqual(success.res.body.requiredParameters, performance.params.filter(p => !p.optional));
  assert.equal(success.upstream.length, 1);
  const expired = await run({ expiry: "2000-01-01T00:00:00.000Z" });
  assert.equal(expired.res.statusCode, 404);
  assert.equal(expired.upstream.length, 0);
  for (const [options, status] of [
    [{ anonymous: true }, 401], [{ authStatus: 401 }, 401], [{ noPolicy: true }, 403], [{ plan: "free" }, 403],
    [{ noCookie: true }, 401], [{ wrongOwner: true }, 404], [{ expiry: null }, 404], [{ expiry: "invalid" }, 404],
    [{ badIp: true }, 503], [{ method: "POST" }, 405], [{ redis: [[6, 1]] }, 429], [{ redis: [[1, 6]] }, 429], [{ redis: [[1, 1], null] }, 429],
  ]) {
    const denied = await run(options);
    assert.equal(denied.res.statusCode, status);
    assert.equal(denied.upstream.length, 0);
    if (options.anonymous || options.method === "POST") assert.equal(denied.calls.length, 0);
    if (options.noPolicy || options.plan || options.authStatus || options.redis) assert(!denied.calls.some(c => c.target.includes("broker_connections")));
  }
  for (const base of ["https://live.tradovateapi.com/v1", "https://demo.tradovateapi.com.fixture-private.invalid/v1", "https://demo.tradovateapi.com/v1?fixture-private", "https://demo.tradovateapi.com/v1#fixture-private", "https://fixture-private@demo.tradovateapi.com/v1", "http://demo.tradovateapi.com/v1", "not-a-url"]) {
    const denied = await run({ base });
    assert.equal(denied.res.body.status, "unsupported_environment");
    assert.equal(denied.upstream.length, 0);
  }
  for (const [provider, status] of [
    [() => json({ errorText: "fixture-private-denial" }, 401), "upstream_rejected"],
    [() => json([performance], 403), "upstream_rejected"],
    [() => new Response(null, { status: 302, headers: { Location: "https://fixture-private.invalid" } }), "upstream_rejected"],
    [() => { throw new Error("fixture-private-redirect"); }, "network_or_redirect"],
    [() => json({ errorText: "fixture-private-error", definitions: [performance] }), "provider_error"],
    [() => json([{ ...performance, errorCode: "fixture-private-error" }]), "provider_error"],
    [() => json({ error: "fixture-private-error" }), "provider_error"],
    [() => json({ errorMessage: "fixture-private-error" }), "provider_error"],
    [() => new Response("fixture-private-html", { headers: { "Content-Type": "text/html" } }), "non_json"],
    [() => new Response("{fixture-private", { headers: { "Content-Type": "application/json" } }), "non_json"],
    [() => new Response(null, { headers: { "Content-Type": "application/json" } }), "empty"],
    [() => new Response(" ".repeat(262145), { headers: { "Content-Type": "application/json" } }), "oversized"],
    [() => new Response("[]", { headers: { "Content-Type": "application/json", "Content-Length": "262145" } }), "oversized"],
    [() => json({ definitions: [performance] }), "invalid_definitions"],
    [() => json([performance, performance]), "invalid_definitions"],
    [() => json([{ ...performance, params: [{ name: "account", paramType: "accounts" }] }]), "invalid_definitions"],
    [() => json([{ ...performance, params: [performance.params[0], performance.params[0]] }]), "invalid_definitions"],
    [() => json(Array.from({ length: 257 }, (_, i) => ({ name: `Report${i}`, params: [] }))), "invalid_definitions"],
  ]) {
    const evidence = await run({ provider });
    assert.equal(evidence.res.statusCode, 200);
    assert.equal(evidence.res.body.status, status);
    assert.equal(evidence.upstream.length, 1);
    assert.equal(evidence.res.body.validDefinitionCount, 0);
    assert.equal(evidence.res.body.performanceAvailable, false);
    assert.deepEqual(evidence.res.body.requiredParameters, []);
  }
  const empty = await run({ provider: () => json([]) });
  assert.equal(empty.res.body.status, "definitions");
  assert.equal(empty.res.body.validDefinitionCount, 0);
  assert.equal(empty.res.body.performanceAvailable, false);
  const privateFields = await run({ provider: () => json([{ ...performance, description: "fixture-private-description", accountId: "fixture-private-account", fields: ["fixture-private-field"], params: [...performance.params, { name: "fixture-private-required", paramType: "fixture-private-type", optional: false }] }]) });
  assert.equal(privateFields.res.body.status, "definitions");
  assert.equal(privateFields.res.body.requiredParametersComplete, false);
  assert.deepEqual(privateFields.res.body.requiredParameters, performance.params.filter(p => !p.optional));
  const exactBytes = JSON.stringify([performance]);
  const boundary = await run({ provider: () => new Response(exactBytes + " ".repeat(262144 - Buffer.byteLength(exactBytes)), { headers: { "Content-Type": "application/json" } }) });
  assert.equal(boundary.res.body.status, "definitions");
  for (const provider of [
    () => new Promise(() => {}),
    () => ({ status: 200, ok: true, headers: new Headers({ "Content-Type": "application/json" }), body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: () => new Promise(() => {}) }) } }),
  ]) {
    const timeout = await run({ provider, timeout: true });
    assert.equal(timeout.res.body.status, "timeout");
    assert.equal(timeout.upstream.length, 1);
  }
  for (const cancel of [() => new Promise(() => {}), () => { throw new Error("fixture-private-cancel"); }, () => Promise.reject(new Error("fixture-private-cancel"))]) {
    const evidence = await run({ provider: () => ({ status: 200, ok: true, headers: new Headers({ "Content-Type": "application/json" }), body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(262145) }), cancel }) } }) });
    assert.equal(evidence.res.body.status, "oversized");
  }
  console.log(`tradovate history diagnostic: ${cases} cases passed`);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalTimeout;
  console.warn = originalWarn;
  for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
  Object.assign(process.env, env);
}
