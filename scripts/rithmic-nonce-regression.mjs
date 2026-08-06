import assert from "node:assert/strict";
import test from "node:test";
import {
  claimRithmicNonce,
  claimRithmicNonceInStorage,
  createRithmicNonceSignature,
} from "../api/_lib/rithmic-nonce.js";
import nonceHandler from "../api/rithmic/nonce.js";

const SECRET = "k".repeat(48);
const body = { requestId: "d4d96f6b-f49c-4fe9-a218-1ab2b082a26a", signedAt: 1_785_000_000 };

function responseHarness() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("claims a nonce atomically in Redis with a bounded TTL", async () => {
  const requests = [];
  const env = {
    KV_REST_API_TOKEN: "k".repeat(48),
    KV_REST_API_URL: "https://cova-rithmic.upstash.io",
  };
  const input = {
    requestId: "22222222-2222-4222-8222-222222222222",
    signedAt: 1_786_033_600,
  };
  const claimed = await claimRithmicNonce({
    env,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return { ok: true, status: 200, json: async () => ({ result: "OK" }) };
    },
    ...input,
  });
  assert.equal(claimed, true);
  assert.equal(requests[0].url, env.KV_REST_API_URL);
  assert.deepEqual(JSON.parse(requests[0].init.body), ["SET", `rithmic:nonce:${input.requestId}`, "1", "NX", "EX", 600]);
  assert.equal(requests[0].init.headers.get("Authorization"), `Bearer ${env.KV_REST_API_TOKEN}`);

  const replayed = await claimRithmicNonce({
    env,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ result: null }) }),
    ...input,
  });
  assert.equal(replayed, false);
});

test("claims an atomic non-upserting object in a private Supabase Storage bucket", async () => {
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
    ...body,
  });
  assert.equal(claimed, true);
  assert.equal(requests[0].url, "https://example.supabase.co/storage/v1/bucket/cova-rithmic-nonces");
  assert.equal(requests[2].init.headers.get("x-upsert"), "false");
  assert.match(requests[2].url, new RegExp(`/cova-rithmic-nonces/\\d{4}-\\d{2}-\\d{2}/${body.requestId}$`));

  await assert.rejects(
    () => claimRithmicNonceInStorage({
      env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"r".repeat(40)}` },
      fetchImpl: async () => { throw new Error("network details stay private"); },
      ...body,
    }),
    /nonce_bucket_transport_failed/,
  );
});

test("rejects unsigned calls and reports atomically rejected replays", async () => {
  const unsigned = responseHarness();
  await nonceHandler({ body, method: "POST", headers: { "content-type": "application/json" } }, unsigned, {
    claimNonce: async () => true,
    env: { COVA_RITHMIC_SERVICE_SECRET: SECRET },
    now: () => body.signedAt,
  });
  assert.equal(unsigned.statusCode, 401);

  const timestamp = body.signedAt + 1;
  const signed = responseHarness();
  await nonceHandler({
    body,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cova-nonce-signature": createRithmicNonceSignature(body, { secret: SECRET, timestamp }),
      "x-cova-nonce-timestamp": String(timestamp),
    },
  }, signed, {
    claimNonce: async () => false,
    env: { COVA_RITHMIC_SERVICE_SECRET: SECRET },
    now: () => timestamp,
  });
  assert.equal(signed.statusCode, 409);
  assert.deepEqual(signed.body, { claimed: false, code: "replayed_request" });

  const unavailable = responseHarness();
  await nonceHandler({
    body,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cova-nonce-signature": createRithmicNonceSignature(body, { secret: SECRET, timestamp }),
      "x-cova-nonce-timestamp": String(timestamp),
    },
  }, unavailable, {
    claimNonce: async () => { throw new Error("nonce_store_not_configured"); },
    env: { COVA_RITHMIC_SERVICE_SECRET: SECRET },
    now: () => timestamp,
  });
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.body, { claimed: false, code: "nonce_store_not_configured" });
});
