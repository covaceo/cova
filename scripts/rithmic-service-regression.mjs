import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { acquireRithmicSyncPermit } from "../api/_lib/rithmic-limit.js";
import { requireAuthenticatedUser } from "../api/_lib/auth.js";
import { createRithmicServiceRequest, requestRithmicStatus, requestRithmicSync } from "../api/_lib/rithmic-service.js";

const SECRET = "k".repeat(48);
const ACCOUNT_KEY = "a".repeat(32);
const payload = {
  requestId: "d4d96f6b-f49c-4fe9-a218-1ab2b082a26a",
  user: "trader",
  password: "not-real",
  startIndex: 1_784_000_000,
  finishIndex: 1_784_100_000,
  systemName: "Rithmic Test",
};
const jsonResponse = (body, init = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: { "content-type": "application/json", ...(init.headers || {}) },
});

function safeLedger() {
  return {
    ok: true,
    data: {
      provider: "Rithmic",
      mode: "user-triggered-read-only",
      selectionRequired: false,
      account: { accountKey: ACCOUNT_KEY, accountId: "A-1", accountName: "Test", currency: "USD" },
      accounts: [{ accountKey: ACCOUNT_KEY, accountId: "A-1", accountName: "Test", currency: "USD" }],
      trades: [{
        id: "rithmic-trade",
        date: "2026-08-01",
        market: "NQU6",
        side: "Long",
        entry: 100,
        exit: 101,
        contracts: 1,
        pnl: 20,
        currency: "USD",
        setup: "Rithmic import",
        risk: 0,
        notes: "Gross P&L before commissions",
        source: { provider: "Rithmic", accountKey: ACCOUNT_KEY, accountId: "A-1", currency: "USD", privateFillId: "drop-me" },
      }],
      counts: { rawFills: 2, uniqueFills: 2, trades: 1, accounts: 1, historyWindows: 1 },
      missingPointValues: [],
      uniqueUserId: "must-not-cross-public-api",
      injected: "drop-me",
    },
  };
}

test("the real public Rithmic handlers load with the repository auth contract", async () => {
  const [syncHandler, statusHandler] = await Promise.all([
    import("../api/rithmic/sync.js"),
    import("../api/rithmic/status.js"),
  ]);
  assert.equal(typeof syncHandler.default, "function");
  assert.equal(typeof statusHandler.default, "function");
});

test("the real public handlers reject unauthenticated requests before connector access", async () => {
  const [syncHandler, statusHandler] = await Promise.all([
    import("../api/rithmic/sync.js"),
    import("../api/rithmic/status.js"),
  ]);
  function responseHarness() {
    return {
      statusCode: 200,
      headers: {},
      body: undefined,
      setHeader(name, value) { this.headers[name] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
  }
  const syncResponse = responseHarness();
  await syncHandler.default({ method: "POST", headers: {}, body: {} }, syncResponse);
  assert.equal(syncResponse.statusCode, 401);
  const statusResponse = responseHarness();
  await statusHandler.default({ method: "GET", headers: {} }, statusResponse);
  assert.equal(statusResponse.statusCode, 401);
});

test("derives a validated client IP before rate limiting credential attempts", async () => {
  const { rithmicClientIp } = await import("../api/rithmic/sync.js");
  assert.equal(rithmicClientIp({ headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }), "203.0.113.7");
  assert.equal(rithmicClientIp({ headers: { "x-forwarded-for": "2001:db8::7" } }), "2001:db8::7");
  assert.throws(() => rithmicClientIp({ headers: { "x-forwarded-for": "not-an-ip" } }), /protection is temporarily unavailable/i);
});

test("signs the exact JSON body sent to the private connector", () => {
  const timestamp = 1_785_000_000;
  const request = createRithmicServiceRequest(payload, { secret: SECRET, timestamp });
  const expected = createHmac("sha256", SECRET).update(`${timestamp}.${request.body}`).digest("hex");
  assert.equal(request.headers["x-cova-signature"], `v1=${expected}`);
  assert.equal(request.headers["x-cova-timestamp"], String(timestamp));
});

test("checks the signed private connector capability without broker credentials", async () => {
  let sentBody;
  const result = await requestRithmicStatus({
    connectorUrl: "https://rithmic.internal.example/api/sync",
    secret: SECRET,
    timestamp: 1_785_000_000,
    fetchImpl: async (_url, init) => {
      sentBody = JSON.parse(init.body);
      return jsonResponse({ ok: true, data: { available: true, environment: "Rithmic Test", version: "0.1.0" } });
    },
  });
  assert.equal(sentBody.operation, "status");
  assert.equal("user" in sentBody, false);
  assert.deepEqual(result, { available: true, environment: "Rithmic Test" });
});

test("returns only a strict bounded account-matched ledger", async () => {
  let captured;
  const result = await requestRithmicSync(payload, {
    connectorUrl: "https://rithmic.internal.example/api/sync",
    secret: SECRET,
    timestamp: 1_785_000_000,
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return jsonResponse(safeLedger());
    },
  });
  assert.equal(captured.url, "https://rithmic.internal.example/api/sync");
  assert.equal(captured.init.method, "POST");
  assert.deepEqual(result.trades[0]?.source, { provider: "Rithmic", accountKey: ACCOUNT_KEY, accountId: "A-1", currency: "USD" });
  assert.match(result.csv, /source_provider,source_account_key,source_account_id,source_currency/);
  assert.equal("uniqueUserId" in result, false);
  assert.equal("injected" in result, false);
  assert.equal(JSON.stringify(result).includes("not-real"), false);
});

test("accepts a complete multi-account selection inventory across the public sanitizer", async () => {
  const ledger = safeLedger();
  ledger.data.selectionRequired = true;
  ledger.data.account = null;
  ledger.data.accounts.push({ accountKey: "b".repeat(32), accountId: "A-2", accountName: "Second", currency: "USD" });
  ledger.data.trades = [];
  ledger.data.counts = { accounts: 2, rawFills: 0, uniqueFills: 0, trades: 0, historyWindows: 0 };
  const result = await requestRithmicSync(payload, {
    connectorUrl: "https://rithmic.internal.example/api/sync",
    secret: SECRET,
    fetchImpl: async () => jsonResponse(ledger),
  });
  assert.equal(result.selectionRequired, true);
  assert.equal(result.account, null);
  assert.deepEqual(result.accounts.map((account) => account.accountId), ["A-1", "A-2"]);
});

test("rejects malformed, duplicate, and cross-account upstream trades", async () => {
  const cases = [
    (ledger) => { ledger.data.trades[0].id = "x".repeat(81); },
    (ledger) => { ledger.data.trades[0].market = "N".repeat(81); },
    (ledger) => { ledger.data.trades[0].date = "2026-99-99"; },
    (ledger) => { delete ledger.data.trades[0].entry; },
    (ledger) => { ledger.data.trades[0].contracts = 0; },
    (ledger) => { ledger.data.trades[0].pnl = null; },
    (ledger) => { ledger.data.trades[0].pnl = ""; },
    (ledger) => { ledger.data.trades[0].risk = null; },
    (ledger) => { ledger.data.trades[0].risk = ""; },
    (ledger) => { ledger.data.trades[0].source.accountId = "A-2"; },
    (ledger) => { ledger.data.trades.push({ ...ledger.data.trades[0] }); ledger.data.counts.trades = 2; },
  ];
  for (const mutate of cases) {
    const ledger = safeLedger();
    mutate(ledger);
    await assert.rejects(() => requestRithmicSync(payload, {
      connectorUrl: "https://rithmic.internal.example/api/sync",
      secret: SECRET,
      fetchImpl: async () => jsonResponse(ledger),
    }), /temporarily unavailable/);
  }
});

test("rejects duplicate account keys and selected accounts absent from inventory", async () => {
  const cases = [
    (ledger) => {
      ledger.data.account.accountId = "X".repeat(129);
      ledger.data.accounts[0].accountId = "X".repeat(129);
      ledger.data.trades[0].source.accountId = "X".repeat(129);
    },
    (ledger) => {
      ledger.data.accounts.push({ accountKey: ACCOUNT_KEY, accountId: "A-2", accountName: "Duplicate", currency: "USD" });
      ledger.data.counts.accounts = 2;
    },
    (ledger) => {
      ledger.data.accounts = [{ accountKey: "b".repeat(32), accountId: "A-2", accountName: "Other", currency: "USD" }];
    },
  ];
  for (const mutate of cases) {
    const ledger = safeLedger();
    mutate(ledger);
    await assert.rejects(() => requestRithmicSync(payload, {
      connectorUrl: "https://rithmic.internal.example/api/sync",
      secret: SECRET,
      fetchImpl: async () => jsonResponse(ledger),
    }), /temporarily unavailable/);
  }
});

test("rejects declared and streamed oversized connector responses before JSON parsing", async () => {
  await assert.rejects(() => requestRithmicSync(payload, {
    connectorUrl: "https://rithmic.internal.example/api/sync",
    secret: SECRET,
    fetchImpl: async () => jsonResponse({ ok: true }, { headers: { "content-length": "4000000" } }),
  }), /temporarily unavailable/);
  const chunk = new Uint8Array(3_600_000).fill(32);
  await assert.rejects(() => requestRithmicSync(payload, {
    connectorUrl: "https://rithmic.internal.example/api/sync",
    secret: SECRET,
    fetchImpl: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(chunk); controller.close(); } })),
  }), /temporarily unavailable/);
});

test("bounds member authentication before starting credential work", async () => {
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = "https://cova-auth.example";
  process.env.SUPABASE_ANON_KEY = "test-key";
  let sawSignal = false;
  try {
    await assert.rejects(() => requireAuthenticatedUser(
      { headers: { authorization: "Bearer member-token" } },
      {
        timeoutMs: 20,
        fetchImpl: async (_url, init) => {
          sawSignal = Boolean(init.signal);
          return new Promise((_resolve, reject) => {
            const keepAlive = setTimeout(() => reject(new Error("authentication timeout did not fire")), 250);
            init.signal.addEventListener("abort", () => {
              clearTimeout(keepAlive);
              reject(init.signal.reason);
            }, { once: true });
          });
        },
      },
    ), /authentication is temporarily unavailable/i);
    assert.equal(sawSignal, true);
  } finally {
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = priorKey;
  }
});

test("rate-limits attempts and concurrent private connector calls in Redis", async () => {
  const env = { KV_REST_API_URL: "https://cova-rithmic.upstash.io", KV_REST_API_TOKEN: "t".repeat(48) };
  const results = [[1, 1], "OK", 1];
  const calls = [];
  const permit = await acquireRithmicSyncPermit({
    actorId: "user-1",
    ipAddress: "203.0.113.7",
    env,
    lockId: "lock-1",
    fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return jsonResponse({ result: results.shift() });
    },
  });
  assert.equal(permit.allowed, true);
  await permit.release();
  assert.equal(calls.length, 3);
  assert.equal(calls[1][0], "SET");
  assert.equal(calls[1].includes("NX"), true);

  const blocked = await acquireRithmicSyncPermit({
    actorId: "user-1",
    ipAddress: "203.0.113.7",
    env,
    lockId: "lock-2",
    fetchImpl: async (_url, init) => jsonResponse({ result: JSON.parse(init.body)[0] === "SET" ? null : [1, 1] }),
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 10);

  const throttled = await acquireRithmicSyncPermit({
    actorId: "user-1",
    ipAddress: "203.0.113.7",
    env,
    fetchImpl: async () => jsonResponse({ result: [1, 6] }),
  });
  assert.equal(throttled.allowed, false);
  assert.equal(throttled.retryAfterSeconds, 60);

  await assert.rejects(() => acquireRithmicSyncPermit({
    actorId: "user-1",
    ipAddress: "203.0.113.7",
    env,
    fetchImpl: async (_url, init) => jsonResponse({ result: JSON.parse(init.body)[0] === "EVAL" ? [null, null] : "OK" }),
  }), /unavailable/i);
});

test("shares an aggregate attempt budget across users from one IP", async () => {
  const env = { KV_REST_API_URL: "https://cova-rithmic.upstash.io", KV_REST_API_TOKEN: "t".repeat(48) };
  let setCalled = false;
  const permit = await acquireRithmicSyncPermit({
    actorId: "user-2",
    ipAddress: "203.0.113.7",
    env,
    fetchImpl: async (_url, init) => {
      const redisCommand = JSON.parse(init.body);
      if (redisCommand[0] === "SET") setCalled = true;
      return jsonResponse({ result: redisCommand[0] === "EVAL" ? [1, 6] : "OK" });
    },
  });
  assert.equal(permit.allowed, false);
  assert.equal(permit.retryAfterSeconds, 60);
  assert.equal(setCalled, false);
});

test("fails closed on insecure URLs and upstream errors", async () => {
  await assert.rejects(() => requestRithmicSync(payload, { connectorUrl: "http://evil.example/api/sync", secret: SECRET }), /configured/);
  await assert.rejects(() => requestRithmicSync(payload, { allowLocal: false, connectorUrl: "http://localhost:5050/api/sync", secret: SECRET }), /configured/);
  await assert.rejects(() => requestRithmicSync(payload, { connectorUrl: "https://user@example.com/api/sync", secret: SECRET }), /configured/);
  await assert.rejects(() => requestRithmicSync(payload, {
    connectorUrl: "https://rithmic.internal.example/api/sync",
    secret: SECRET,
    fetchImpl: async () => jsonResponse({ error: "secret detail" }, { status: 502 }),
  }), /temporarily unavailable/);
});
