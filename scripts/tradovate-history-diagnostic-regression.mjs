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
    assert.deepEqual(Object.keys(res.body).sort(), ["diagnostic", "performanceAvailable", "requiredParameters", "requiredParametersComplete", "status", "upstreamStatus", "validDefinitionCount", "shape"].sort());
    if (res.body.shape !== null) {
      const shape = res.body.shape;
      assert.deepEqual(Object.keys(shape).sort(), ["topLevel", "containers", "performanceNameObserved", "performanceScanComplete", "validationFailure"].sort());
      assert.deepEqual(Object.keys(shape.topLevel).sort(), ["count", "type"]);
      const checkTypeCount = value => {
        assert(["null", "array", "object", "string", "number", "boolean"].includes(value.type));
        assert(value.count === null || Number.isSafeInteger(value.count) && value.count >= 0);
      };
      checkTypeCount(shape.topLevel);
      assert(shape.containers.length <= 6);
      for (const container of shape.containers) {
        assert.deepEqual(Object.keys(container).sort(), ["count", "slot", "type"]);
        assert(["reports", "reportDefinitions", "reportDefs", "definitions", "data", "items"].includes(container.slot));
        checkTypeCount(container);
      }
      assert.equal(typeof shape.performanceNameObserved, "boolean");
      assert.equal(typeof shape.performanceScanComplete, "boolean");
      assert(["none", "not_validated", "array_expected", "too_many_definitions", "invalid_definition", "invalid_name", "duplicate_name", "params_array_expected", "too_many_params", "invalid_param", "param_error", "invalid_param_name", "duplicate_param_name", "invalid_param_type", "missing_optional", "invalid_optional"].includes(shape.validationFailure));
      assert(Buffer.byteLength(JSON.stringify(shape)) < 1200, "Shape output is independently bounded");
    }
    for (const call of upstream) assert.equal(call.init.signal.aborted, true, "Terminal cleanup aborts transport");
  }
  cases++;
  return { res, calls, upstream };
}

try {
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "fixture-anon", SUPABASE_SERVICE_ROLE_KEY: "fixture-service", COVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), KV_REST_API_URL: "https://fixture-history.upstash.io", KV_REST_API_TOKEN: "fixture-redis-".repeat(4) });
  // Synthetic envelope, NOT the unobserved live provider format.
  const wrapped = await run({ provider: () => json({ definitions: [performance], "fixture-private-key": "fixture-private-value" }) });
  assert.equal(wrapped.res.body.status, "invalid_definitions", "Shape evidence must not loosen acceptance");
  assert.deepEqual(wrapped.res.body.shape, {
    topLevel: { type: "object", count: 2 },
    containers: [{ slot: "definitions", type: "array", count: 1 }],
    performanceNameObserved: true, performanceScanComplete: true, validationFailure: "array_expected",
  });
  const success = await run();
  assert.equal(success.res.statusCode, 200);
  assert.equal(success.res.body.status, "definitions");
  assert.equal(success.res.body.validDefinitionCount, 1);
  assert.equal(success.res.body.performanceAvailable, true);
  assert.equal(success.res.body.requiredParametersComplete, true);
  assert.deepEqual(success.res.body.requiredParameters, performance.params.filter(p => !p.optional));
  assert.equal(success.upstream.length, 1);
  const missingOptional = await run({ provider: () => json([{ ...performance, params: [{ name: "fixture-private-param", paramType: "fixture-private-type" }] }]) });
  assert.equal(missingOptional.res.body.status, "invalid_definitions");
  assert.equal(missingOptional.res.body.shape.validationFailure, "missing_optional");
  assert.equal(missingOptional.res.body.shape.performanceNameObserved, true);
  assert.equal(missingOptional.res.body.performanceAvailable, false);
  // All shapes below are synthetic privacy/validation fixtures, never live responses.
  for (const [payload, type, count] of [[null, "null", null], [true, "boolean", null], [12345, "number", null], ["fixture-private-string", "string", null], [[], "array", 0], [{ "fixture-private-key": null }, "object", 1]]) {
    const evidence = await run({ provider: () => json(payload) });
    assert.deepEqual(evidence.res.body.shape.topLevel, { type, count });
    assert.equal(evidence.res.body.status, Array.isArray(payload) ? "definitions" : "invalid_definitions");
  }
  for (const slot of ["reports", "reportDefinitions", "reportDefs", "definitions", "data", "items"]) {
    for (const [value, type, count] of [[[performance], "array", 1], [{ "fixture-private-key": "fixture-private" }, "object", 1], [null, "null", null], [false, "boolean", null], [12345, "number", null], ["fixture-private", "string", null]]) {
      const evidence = await run({ provider: () => json({ [slot]: value }) });
      assert.equal(evidence.res.body.status, "invalid_definitions");
      assert.equal(evidence.res.body.validDefinitionCount, 0);
      assert.equal(evidence.res.body.performanceAvailable, false);
      assert.deepEqual(evidence.res.body.shape.containers, [{ slot, type, count }]);
      assert.equal(evidence.res.body.shape.performanceNameObserved, type === "array");
    }
  }
  for (const [payload, reason] of [
    [[null], "invalid_definition"], [[{}], "invalid_name"], [[performance, performance], "duplicate_name"],
    [[{ ...performance, params: {} }], "params_array_expected"],
    [[{ ...performance, params: Array(33).fill(null) }], "too_many_params"],
    [[{ ...performance, params: [null] }], "invalid_param"],
    [[{ ...performance, params: [{ errorText: "fixture-private-error" }] }], "param_error"],
    [[{ ...performance, params: [{}] }], "invalid_param_name"],
    [[{ ...performance, params: [performance.params[0], performance.params[0]] }], "duplicate_param_name"],
    [[{ ...performance, params: [{ name: "fixture-private-param" }] }], "invalid_param_type"],
    [[{ ...performance, params: [{ name: "fixture-private-param", paramType: "fixture-private-type", optional: "false" }] }], "invalid_optional"],
  ]) {
    const evidence = await run({ provider: () => json(payload) });
    assert.equal(evidence.res.body.status, "invalid_definitions");
    assert.equal(evidence.res.body.shape.validationFailure, reason);
  }
  const huge = Array.from({ length: 256 }, (_, i) => ({ name: `fixture-private-report-${i}`, params: [] }));
  const capped = await run({ provider: () => json([...huge, performance]) });
  assert.equal(capped.res.body.shape.topLevel.count, 257);
  assert.equal(capped.res.body.shape.validationFailure, "too_many_definitions");
  assert.equal(capped.res.body.shape.performanceNameObserved, false);
  assert.equal(capped.res.body.shape.performanceScanComplete, false);
  const sharedCap = await run({ provider: () => json({ reports: huge, definitions: [performance] }) });
  assert.equal(sharedCap.res.body.shape.performanceNameObserved, false);
  assert.equal(sharedCap.res.body.shape.performanceScanComplete, false);
  const allSlots = await run({ provider: () => json(Object.fromEntries(["reports", "reportDefinitions", "reportDefs", "definitions", "data", "items"].map(slot => [slot, [performance]]))) });
  assert.equal(allSlots.res.body.shape.containers.length, 6);
  assert.equal(allSlots.res.body.shape.performanceNameObserved, true);
  assert.equal(allSlots.res.body.shape.performanceScanComplete, true);
  const rejectedShape = await run({ provider: () => json({ definitions: [performance] }, 403) });
  assert.equal(rejectedShape.res.body.status, "upstream_rejected");
  assert.equal(rejectedShape.res.body.shape, null);
  const semanticShape = await run({ provider: () => json({ definitions: [performance], errorText: "fixture-private-error" }) });
  assert.equal(semanticShape.res.body.status, "provider_error");
  assert.equal(semanticShape.res.body.shape.validationFailure, "not_validated");
  assert.equal(semanticShape.res.body.performanceAvailable, false);
  const nested = await run({ provider: () => json({ data: { definitions: [performance] }, "fixture-private-key": [performance], constructor: [performance], __proto__: [performance] }) });
  assert.deepEqual(nested.res.body.shape.containers, [{ slot: "data", type: "object", count: 1 }]);
  assert.equal(nested.res.body.shape.performanceNameObserved, false, "No arbitrary-key or recursive traversal");
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
