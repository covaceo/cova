import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createRithmicServiceRequest, requestRithmicStatus, requestRithmicSync } from "../api/_lib/rithmic-service.js";
import { claimRithmicNonceInStorage, createRithmicNonceSignature } from "../api/_lib/rithmic-nonce.js";
import nonceHandler from "../api/rithmic/nonce.js";

const SECRET = "k".repeat(48);
const payload = {
  requestId: "d4d96f6b-f49c-4fe9-a218-1ab2b082a26a",
  user: "trader",
  password: "not-real",
  startIndex: 1_784_000_000,
  finishIndex: 1_784_100_000,
  systemName: "Rithmic Test",
};

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

test("signs the exact JSON body sent to the private connector", () => {
  const timestamp = 1_785_000_000;
  const request = createRithmicServiceRequest(payload, { secret: SECRET, timestamp });
  const expected = createHmac("sha256", SECRET).update(`${timestamp}.${request.body}`).digest("hex");
  assert.equal(request.headers["x-cova-signature"], `v1=${expected}`);
  assert.equal(request.headers["x-cova-timestamp"], String(timestamp));
  assert.equal(request.headers["content-type"], "application/json");
});

test("checks the signed private connector capability without broker credentials", async () => {
  let sentBody;
  const result = await requestRithmicStatus({
    connectorUrl: "https://rithmic.internal.example/api/sync",
    secret: SECRET,
    timestamp: 1_785_000_000,
    fetchImpl: async (_url, init) => {
      sentBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ ok: true, data: { available: true, environment: "Rithmic Test", version: "0.1.0" } }) };
    },
  });
  assert.equal(sentBody.operation, "status");
  assert.equal("user" in sentBody, false);
  assert.deepEqual(result, { available: true, environment: "Rithmic Test" });
});

test("calls only an explicitly configured private service and returns a bounded safe shape", async () => {
  let captured;
  const result = await requestRithmicSync(payload, {
    connectorUrl: "https://rithmic.internal.example/api/sync",
    secret: SECRET,
    timestamp: 1_785_000_000,
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            data: {
              provider: "Rithmic",
              mode: "user-triggered-read-only",
              selectionRequired: true,
              account: { accountId: "A-1", accountName: "Test", currency: "USD" },
              accounts: [{ accountId: "A-1", accountName: "Test", currency: "USD" }, { accountId: "", accountName: "Invalid" }],
              trades: [{ id: "rithmic-trade", date: "2026-08-01", market: "NQU6", side: "Long", entry: 100, exit: 101, contracts: 1, pnl: 20, setup: "Rithmic import", risk: 0, notes: "Gross P&L before commissions", source: { provider: "Rithmic", accountId: "A-1", privateFillId: "drop-me" } }],
              counts: { rawFills: 0, uniqueFills: 0, trades: 1, accounts: 1, historyWindows: 1 },
              missingPointValues: [],
              ignoredFillIds: [],
              uniqueUserId: "must-not-cross-public-api",
              injected: "drop-me",
            },
          };
        },
      };
    },
  });
  assert.equal(captured.url, "https://rithmic.internal.example/api/sync");
  assert.equal(captured.init.method, "POST");
  assert.equal(result.provider, "Rithmic");
  assert.equal(result.selectionRequired, true);
  assert.equal(result.accounts.length, 1);
  assert.equal(result.trades[0]?.side, "Long");
  assert.deepEqual(result.trades[0]?.source, { provider: "Rithmic", accountId: "A-1" });
  assert.match(result.csv, /source_provider,source_account_id/);
  assert.match(result.csv, /Rithmic,A-1/);
  assert.equal("uniqueUserId" in result, false);
  assert.equal("injected" in result, false);
  assert.equal(JSON.stringify(result).includes("not-real"), false);
});

test("fails closed on insecure production URLs and upstream errors", async () => {
  await assert.rejects(() => requestRithmicSync(payload, { connectorUrl: "http://evil.example/api/sync", secret: SECRET }), /configured/);
  await assert.rejects(() => requestRithmicSync(payload, { allowLocal: false, connectorUrl: "http://localhost:5050/api/sync", secret: SECRET }), /configured/);
  await assert.rejects(() => requestRithmicSync(payload, { connectorUrl: "https://user@example.com/api/sync", secret: SECRET }), /configured/);
  await assert.rejects(() => requestRithmicSync(payload, { connectorUrl: "https://rithmic.internal.example/api/sync?debug=1", secret: SECRET }), /configured/);
  await assert.rejects(() => requestRithmicSync(payload, {
    connectorUrl: "https://rithmic.internal.example/api/sync",
    secret: SECRET,
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({ error: "secret detail" }) }),
  }), /Rithmic sync is temporarily unavailable/);
});

test("claims a private Rithmic nonce with an atomic non-upserting storage object", async () => {
  const requests = [];
  const responses = [
    { ok: false, status: 404, json: async () => ({}) },
    { ok: true, status: 200, json: async () => ({}) },
    { ok: true, status: 200, json: async () => ({ Key: "private" }) },
  ];
  const claimed = await claimRithmicNonceInStorage({
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"r".repeat(40)}` },
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      return responses.shift();
    },
    requestId: payload.requestId,
    signedAt: 1_785_000_000,
  });
  assert.equal(claimed, true);
  assert.equal(requests[0].url, "https://example.supabase.co/storage/v1/bucket/cova-rithmic-nonces");
  assert.equal(requests[2].init.headers.get("x-upsert"), "false");
  assert.match(requests[2].url, new RegExp(`/cova-rithmic-nonces/\\d{4}-\\d{2}-\\d{2}/${payload.requestId}$`));
});

test("the server-only nonce endpoint verifies HMAC and reports atomic replays", async () => {
  const body = { requestId: payload.requestId, signedAt: 1_785_000_000 };
  const timestamp = 1_785_000_001;
  const signature = createRithmicNonceSignature(body, { secret: SECRET, timestamp });
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  await nonceHandler({
    body,
    method: "POST",
    headers: { "content-type": "application/json", "x-cova-nonce-signature": signature, "x-cova-nonce-timestamp": String(timestamp) },
  }, response, {
    claimNonce: async () => false,
    env: { COVA_RITHMIC_SERVICE_SECRET: SECRET },
    now: () => timestamp,
  });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, { claimed: false, code: "replayed_request" });
});
