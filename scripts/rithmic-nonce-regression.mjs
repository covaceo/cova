import assert from "node:assert/strict";
import test from "node:test";
import { claimRithmicNonceInStorage, createRithmicNonceSignature } from "../api/_lib/rithmic-nonce.js";
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

test("claims an atomic non-upserting object in a private Supabase Storage bucket", async () => {
  const requests = [];
  const responses = [
    { ok: false, status: 404, json: async () => ({}) },
    { ok: true, status: 200, json: async () => ({}) },
    { ok: true, status: 200, json: async () => ({ Key: "private" }) },
  ];
  const claimed = await claimRithmicNonceInStorage({
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "r".repeat(48) },
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
});
