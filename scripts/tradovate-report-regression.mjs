import assert from "node:assert/strict";
import { encryptSecret } from "../api/_lib/encryption.js";
import handler from "../api/tradovate/sync.js";
const originalFetch = globalThis.fetch;
const originalTimer = globalThis.setTimeout;
const env = { ...process.env };
const definition = { name: "Performance", params: [
  { name: "startDate", paramType: "Date", optional: false },
  { name: "endDate", paramType: "Date", optional: false },
  { name: "account", paramType: "accounts", optional: false },
  { name: "startTime", paramType: "Time", optional: true },
  { name: "endTime", paramType: "Time", optional: true },
  { name: "contract", paramType: "contracts", optional: true },
] };
// Synthetic schema/rows, NOT actual Performance report columns or Friday trade evidence.
const reportText = "SyntheticColumn,OtherColumn\r\nfixture-row,123\r\n";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const query = { diagnostic: "history-report", accountId: "71", startDate: "2026-09-11", endDate: "2026-09-12" };
let count = 0;
async function run(options = {}) {
  const calls = [], unexpected = [], logs = [];
  const redis = options.redis ? [...options.redis] : [[1, 1], "OK", 1];
  const req = { method: "GET", query: options.query || query, headers: { authorization: "Bearer fixture-cova-token", cookie: "cova_tradovate_connection=fixture-connection", "x-forwarded-for": "203.0.113.7" } };
  if (options.anonymous) delete req.headers.authorization;
  if (options.badIp) req.headers["x-forwarded-for"] = "invalid";
  const res = { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, setHeader(key, value) { this.headers[key.toLowerCase()] = value; } };
  const warn = console.warn;
  console.warn = (...args) => logs.push(args);
  process.env.TRADOVATE_API_BASE_URL = options.base || "https://demo.tradovateapi.com/v1";
  globalThis.setTimeout = (fn, delay, ...args) => { const timer = originalTimer(fn, options.timeout && delay === 25000 ? 20 : delay, ...args); if (options.timeout && delay === 25000) timer.unref = () => timer; return timer; };
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url); calls.push({ target, init });
    if (target.endsWith("/auth/v1/user")) return json({ id: "fixture-owner", app_metadata: { plan: options.plan || "pro" }, user_metadata: { plan: "pro" } }, options.authStatus || 200);
    if (target.includes("/rest/v1/policy_acceptances?")) return json(options.noPolicy ? [] : [{ id: "fixture-acceptance" }]);
    if (target === process.env.KV_REST_API_URL) return json({ result: redis.shift() });
    if (target.includes("/rest/v1/broker_connections?")) {
      const p = new URL(target).searchParams;
      assert.equal(p.get("user_id"), "eq.fixture-owner"); assert.equal(p.get("id"), "eq.fixture-connection"); assert.equal(p.get("provider"), "eq.tradovate");
      assert(!init.method || init.method === "GET", "No expired-row deletion or credential writes");
      return json(options.wrongOwner ? [] : [{ access_token_encrypted: encryptSecret("fixture-provider-token"), expires_at: options.expiry === undefined ? "2099-01-01T00:00:00.000Z" : options.expiry }]);
    }
    assert.equal(init.headers.Authorization, "Bearer fixture-provider-token"); assert.equal(init.redirect, "error"); assert(init.signal);
    if (options.stall === target) return new Promise(() => {});
    if (target === "https://rpt-demo.tradovateapi.com/v1/reports/requestReportDefinitions") {
      assert.equal(init.method, "GET"); return options.defResponse ? options.defResponse() : json(options.definitions || { reports: [{ name: "Unrelated", params: null }, definition] });
    }
    if (target === "https://demo.tradovateapi.com/v1/account/list") {
      assert.equal(init.method, "GET"); return options.accountResponse ? options.accountResponse() : json(options.accounts || [{ id: 71, name: "fixture-owned-account", active: true, userId: "fixture-private-user" }, { id: 72, name: "fixture-other-owned-account", active: false }]);
    }
    if (target === "https://rpt-demo.tradovateapi.com/v1/reports/requestreport") {
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), { name: "Performance", representationType: "csv", template: "Flex.html", timezone: -240, params: [
        { name: "startDate", value: "09/11/2026" }, { name: "endDate", value: options.expectedEndDate || "09/12/2026" },
        { name: "startTime", value: "00:00:00" }, { name: "endTime", value: "00:00:00" }, { name: "account", value: "fixture-owned-account" },
      ] });
      return options.reportResponse ? options.reportResponse() : json({ data: reportText });
    }
    unexpected.push(target); throw new Error("Unexpected mocked request");
  };
  try { await handler(req, res); } finally { console.warn = warn; globalThis.setTimeout = originalTimer; }
  assert.deepEqual(unexpected, []);
  assert.deepEqual(logs, []);
  assert.doesNotMatch(JSON.stringify(res.body), /fixture-private|fixture-provider-token|fixture-cova-token|fixture-connection/);
  const provider = calls.filter(c => c.target.includes("tradovateapi.com"));
  const reports = provider.filter(c => c.init.method === "POST");
  assert(reports.length <= 1); assert(provider.length <= 3);
  if (calls.some(c => c.target.includes("broker_connections"))) assert.equal(redis.length, 0, "Permit released");
  if (provider.length) { assert(provider.every(c => c.init.signal === provider[0].init.signal)); assert(provider.every(c => c.init.signal.aborted)); }
  assert.equal(res.headers["cache-control"], "private, no-store");
  assert.equal(res.body?.trades, undefined); assert.equal(res.body?.csv, undefined, "Never expose an auto-import ledger payload");
  count++;
  return { res, provider, reports, calls };
}
try {
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "fixture-anon", SUPABASE_SERVICE_ROLE_KEY: "fixture-service", COVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), KV_REST_API_URL: "https://fixture-friday.upstash.io", KV_REST_API_TOKEN: "fixture-redis-".repeat(4) });
  const discovery = await run({ query: { diagnostic: "history-discovery" } });
  assert.equal(discovery.res.statusCode, 200);
  assert.equal(discovery.res.body.status, "discovery");
  assert.equal(discovery.reports.length, 0);
  assert.deepEqual(discovery.res.body.accounts, [{ id: "71", name: "fixture-owned-account", status: "active" }, { id: "72", name: "fixture-other-owned-account", status: "inactive" }]);
  assert.equal(discovery.res.body.performance.name, "Performance");
  const report = await run();
  assert.equal(report.res.body.status, "report_data");
  assert.equal(report.res.body.reportText, reportText);
  assert.equal(report.reports.length, 1);
  assert.deepEqual(report.res.body.upstream, { definitions: 200, accounts: 200, report: 200 });
  assert.equal(report.res.body.provenance.account.id, "71");
  assert.equal(report.res.body.provenance.timezoneOffset, -240);
  assert.equal(report.res.body.schemaValidated, false);
  for (const [options, status] of [[{ anonymous: true }, 401], [{ authStatus: 401 }, 401], [{ noPolicy: true }, 403], [{ plan: "free" }, 403], [{ wrongOwner: true }, 404], [{ expiry: "2000-01-01T00:00:00Z" }, 404], [{ expiry: null }, 404], [{ expiry: "invalid" }, 404], [{ badIp: true }, 503], [{ redis: [[6, 1]] }, 429], [{ redis: [[1, 6]] }, 429], [{ redis: [[1, 1], null] }, 429]]) {
    const denied = await run(options); assert.equal(denied.res.statusCode, status); assert.equal(denied.provider.length, 0);
  }
  for (const [endDate, expectedEndDate] of [["2026-09-13", "09/13/2026"], ["2026-10-11", "10/11/2026"]]) {
    const multiDay = await run({ query: { ...query, endDate }, expectedEndDate });
    assert.equal(multiDay.res.body.status, "report_data", "Bounded own-account reporting must allow inspecting the same recent-history range");
  }
  for (const [change, status] of [
    [{ accountId: "" }, "invalid_account_id"], [{ accountId: "071" }, "invalid_account_id"], [{ accountId: ["71"] }, "invalid_account_id"], [{ accountId: "9007199254740993" }, "invalid_account_id"],
    [{ startDate: "2026-02-30" }, "invalid_dates"], [{ startDate: "09/11/2026" }, "invalid_dates"], [{ startDate: ["2026-09-11"] }, "invalid_dates"],
    [{ endDate: "2026-09-11" }, "invalid_date_window"], [{ endDate: "2026-10-12" }, "invalid_date_window"], [{ endDate: "2026-09-10" }, "invalid_date_window"],
    [{ startDate: "2026-11-01", endDate: "2026-11-02" }, "timezone_transition"],
    [{ url: "https://fixture-private.invalid" }, "invalid_request"], [{ template: "fixture-private" }, "invalid_request"], [{ timezone: "0" }, "invalid_request"],
  ]) { const invalid = await run({ query: { ...query, ...change } }); assert.equal(invalid.res.body.status, status); assert.equal(invalid.provider.length, 0); }
  const notOwned = await run({ accounts: [{ id: 72, name: "fixture-other-owned-account" }] });
  assert.equal(notOwned.res.body.status, "account_not_owned"); assert.equal(notOwned.reports.length, 0);
  for (const [definitions, status] of [
    [{ reports: [] }, "performance_missing"], [{ reports: [definition, definition] }, "performance_ambiguous"],
    [{ reports: { errorText: "fixture-private-error" } }, "provider_error"],
    [{ reports: [definition], errorText: "fixture-private-error" }, "provider_error"],
    [{ reports: [{ ...definition, params: null }] }, "invalid_performance_params"],
    [{ reports: [{ ...definition, params: [{ name: "account", paramType: "accounts" }] }] }, "missing_or_invalid_optional"],
    [{ reports: [{ ...definition, params: [...definition.params, { name: "fixture-private-param", paramType: "String", optional: false }] }] }, "unsupported_required_parameter"],
    [{ reports: [{ ...definition, params: [...definition.params, { errorText: "fixture-private-error" }] }] }, "provider_error"],
    [{ reports: [{ ...definition, params: definition.params.filter(p => p.name !== "startTime") }] }, "missing_time_contract"],
  ]) { const invalid = await run({ definitions }); assert.equal(invalid.res.body.status, status); assert.equal(invalid.reports.length, 0); }
  const unrelated = await run({ definitions: { reports: [{ name: "Unrelated", params: [{ arbitrary: "fixture-private" }] }, definition] } });
  assert.equal(unrelated.res.body.status, "report_data");
  for (const accounts of [[{ id: 71, name: "fixture-owned-account" }, { id: 71, name: "fixture-other" }], [{ id: 71, name: "fixture-owned-account" }, { id: 72, name: "fixture-owned-account" }], [{ id: "71", name: "fixture-owned-account" }], [{ id: 71, name: "fixture-provider-token" }], [{ errorText: "fixture-private-error" }]]) {
    const invalid = await run({ accounts }); assert(["invalid_accounts", "provider_error"].includes(invalid.res.body.status)); assert.equal(invalid.reports.length, 0);
  }
  for (const [reportResponse, status] of [
    [() => json({ data: "" }), "empty_report"], [() => json({ errorText: "fixture-private-error", data: reportText }), "provider_error"],
    [() => json({ data: { error: "fixture-private-error" } }), "provider_error"],
    [() => json({ data: "fixture-provider-token" }), "unsafe_report_data"],
    [() => json({ data: "<html>fixture-private-error</html>" }), "unsupported_report_content"],
    [() => json({ data: "Access denied fixture-private-error" }), "unsupported_report_content"],
    [() => json({ data: [{ account: "fixture-private" }] }), "unsupported_report_envelope"],
    [() => json({ downloadUrl: "https://fixture-private.invalid" }), "unsupported_report_envelope"],
    [() => json({ data: "x".repeat(524289) }), "oversized_report_text"],
    [() => new Response("fixture-private", { status: 403 }), "upstream_rejected"],
    [() => new Response(null, { status: 302, headers: { location: "https://fixture-private.invalid" } }), "upstream_rejected"],
    [() => new Response("fixture-private", { headers: { "content-type": "text/html" } }), "unsupported_media"],
    [() => new Response("{fixture-private", { headers: { "content-type": "application/json" } }), "invalid_json"],
    [() => new Response("{}", { headers: { "content-type": "application/json", "content-length": "1048577" } }), "oversized"],
    [() => new Response("x".repeat(1048577), { headers: { "content-type": "application/json" } }), "oversized"],
    [() => { throw new Error("fixture-private-network"); }, "network_or_redirect"],
  ]) { const evidence = await run({ reportResponse }); assert.equal(evidence.res.body.status, status); assert.equal(evidence.reports.length, 1); if (status !== "empty_report") assert.equal(evidence.res.body.reportText, undefined); }
  for (const key of ["defResponse", "accountResponse"]) {
    const denied = await run({ [key]: () => json({ errorText: "fixture-private-denial" }, 401) });
    assert.equal(denied.res.body.status, "upstream_rejected"); assert.equal(denied.reports.length, 0);
  }
  for (const stall of ["https://rpt-demo.tradovateapi.com/v1/reports/requestReportDefinitions", "https://demo.tradovateapi.com/v1/account/list", "https://rpt-demo.tradovateapi.com/v1/reports/requestreport"]) {
    const timeout = await run({ stall, timeout: true }); assert.equal(timeout.res.body.status, "timeout");
  }
  const stalledBody = await run({ timeout: true, reportResponse: () => ({ status: 200, ok: true, headers: new Headers({ "content-type": "application/json" }), body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: () => new Promise(() => {}) }) } }) });
  assert.equal(stalledBody.res.body.status, "timeout");
  for (const base of ["https://live.tradovateapi.com/v1", "https://demo.tradovateapi.com.fixture-private.invalid/v1", "https://demo.tradovateapi.com/v1?query", "invalid"]) { const denied = await run({ base }); assert.equal(denied.res.body.status, "unsupported_environment"); assert.equal(denied.provider.length, 0); }
  console.log(`tradovate report diagnostic: ${count} cases passed`);
} finally {
  globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimer;
  for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
  Object.assign(process.env, env);
}
