import { createHmac, timingSafeEqual } from "node:crypto";

const BUCKET_NAME = "cova-rithmic-nonces";
const MAX_CLOCK_SKEW_SECONDS = 300;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serviceHeaders(serviceRoleKey, extra = {}) {
  return new Headers({
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  });
}

function nonceMessage(body, timestamp) {
  return `${timestamp}.${body.requestId}.${body.signedAt}`;
}

export function createRithmicNonceSignature(body, { secret, timestamp }) {
  const digest = createHmac("sha256", secret).update(nonceMessage(body, timestamp)).digest("hex");
  return `v1=${digest}`;
}

export function verifyRithmicNonceSignature(body, { secret, signature, timestamp }) {
  const match = /^v1=([a-f0-9]{64})$/i.exec(String(signature || ""));
  if (!match || String(secret || "").length < 32) return false;
  const expected = Buffer.from(createRithmicNonceSignature(body, { secret, timestamp }).slice(3), "hex");
  const received = Buffer.from(match[1], "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function configuredSupabase(env) {
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new Error("nonce_store_not_configured");
  }
  const jwtKey = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(serviceRoleKey);
  const secretKey = /^sb_secret_[A-Za-z0-9_-]{20,}$/.test(serviceRoleKey);
  if (url.protocol !== "https:"
    || !url.hostname.endsWith(".supabase.co")
    || url.username
    || url.password
    || url.search
    || url.hash
    || (!jwtKey && !secretKey)) {
    throw new Error("nonce_store_not_configured");
  }
  return { serviceRoleKey, supabaseUrl };
}

async function responsePayload(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function isAlreadyExists(response, payload) {
  if (![400, 409].includes(response.status)) return false;
  const detail = `${payload?.code || ""} ${payload?.error || ""} ${payload?.message || ""}`;
  return /duplicate|already exists|resource exists/i.test(detail);
}

async function fetchOrThrow(fetchImpl, url, init, code) {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    const transportCode = String(error?.cause?.code || error?.code || "").toLowerCase();
    const allowed = new Set([
      "econnrefused",
      "enotfound",
      "err_invalid_char",
      "err_invalid_url",
      "etimedout",
      "und_err_connect_timeout",
      "und_err_socket",
    ]);
    throw new Error(allowed.has(transportCode) ? `${code}_${transportCode}` : code);
  }
}

async function ensureNonceBucket({ fetchImpl, serviceRoleKey, supabaseUrl }) {
  const bucketUrl = `${supabaseUrl}/storage/v1/bucket/${BUCKET_NAME}`;
  const existing = await fetchOrThrow(fetchImpl, bucketUrl, {
    headers: serviceHeaders(serviceRoleKey),
    method: "GET",
  }, "nonce_bucket_transport_failed");
  if (existing.ok) return;
  if (existing.status !== 404) throw new Error("nonce_bucket_probe_failed");

  const created = await fetchOrThrow(fetchImpl, `${supabaseUrl}/storage/v1/bucket`, {
    body: JSON.stringify({
      allowed_mime_types: ["application/octet-stream"],
      file_size_limit: 1,
      id: BUCKET_NAME,
      name: BUCKET_NAME,
      public: false,
    }),
    headers: serviceHeaders(serviceRoleKey, { "Content-Type": "application/json" }),
    method: "POST",
  }, "nonce_bucket_transport_failed");
  if (created.ok) return;
  const payload = await responsePayload(created);
  if (!isAlreadyExists(created, payload)) throw new Error("nonce_bucket_create_failed");
}

function validateNonce(requestId, signedAt) {
  if (!UUID_PATTERN.test(String(requestId || "")) || !Number.isSafeInteger(Number(signedAt))) {
    throw new Error("invalid_nonce");
  }
}

function configuredRedis(env) {
  const redisUrl = String(env.KV_REST_API_URL || "").replace(/\/$/, "");
  const redisToken = String(env.KV_REST_API_TOKEN || "");
  let url;
  try {
    url = new URL(redisUrl);
  } catch {
    throw new Error("nonce_store_not_configured");
  }
  if (url.protocol !== "https:"
    || !url.hostname.endsWith(".upstash.io")
    || url.username
    || url.password
    || url.search
    || url.hash
    || redisToken.length < 32
    || /[\r\n]/.test(redisToken)) {
    throw new Error("nonce_store_not_configured");
  }
  return { redisToken, redisUrl };
}

export async function claimRithmicNonceInRedis({ env = process.env, fetchImpl = fetch, requestId, signedAt }) {
  validateNonce(requestId, signedAt);
  const { redisToken, redisUrl } = configuredRedis(env);
  const response = await fetchOrThrow(fetchImpl, redisUrl, {
    body: JSON.stringify(["SET", `rithmic:nonce:${requestId}`, "1", "NX", "EX", 600]),
    headers: new Headers({
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json",
    }),
    method: "POST",
  }, "nonce_kv_transport_failed");
  if (!response.ok) throw new Error("nonce_kv_claim_failed");
  const payload = await responsePayload(response);
  if (payload?.result === "OK") return true;
  if (payload?.result === null) return false;
  throw new Error("nonce_kv_claim_failed");
}

export async function claimRithmicNonceInStorage({ env = process.env, fetchImpl = fetch, requestId, signedAt }) {
  validateNonce(requestId, signedAt);
  const { serviceRoleKey, supabaseUrl } = configuredSupabase(env);
  await ensureNonceBucket({ fetchImpl, serviceRoleKey, supabaseUrl });

  const day = new Date(Number(signedAt) * 1000).toISOString().slice(0, 10);
  const objectUrl = `${supabaseUrl}/storage/v1/object/${BUCKET_NAME}/${day}/${requestId}`;
  const response = await fetchOrThrow(fetchImpl, objectUrl, {
    body: Buffer.from([1]),
    headers: serviceHeaders(serviceRoleKey, {
      "Content-Type": "application/octet-stream",
      "x-upsert": "false",
    }),
    method: "POST",
  }, "nonce_object_transport_failed");
  if (response.ok) return true;
  const payload = await responsePayload(response);
  if (isAlreadyExists(response, payload)) return false;
  throw new Error("nonce_object_claim_failed");
}

export async function claimRithmicNonce(options) {
  const env = options?.env || process.env;
  const redisConfigured = Boolean(env.KV_REST_API_URL || env.KV_REST_API_TOKEN);
  return redisConfigured
    ? claimRithmicNonceInRedis({ ...options, env })
    : claimRithmicNonceInStorage({ ...options, env });
}

export function validateRithmicNonceRequest(body, { now, secret, signature, timestamp }) {
  const requestId = String(body?.requestId || "");
  const signedAt = Number(body?.signedAt);
  return Boolean(
    UUID_PATTERN.test(requestId)
    && Number.isSafeInteger(signedAt)
    && Number.isSafeInteger(timestamp)
    && Math.abs(now - timestamp) <= MAX_CLOCK_SKEW_SECONDS
    && Math.abs(now - signedAt) <= MAX_CLOCK_SKEW_SECONDS
    && verifyRithmicNonceSignature({ requestId, signedAt }, { secret, signature, timestamp })
  );
}
