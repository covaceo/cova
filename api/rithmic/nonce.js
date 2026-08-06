import { claimRithmicNonceInStorage, validateRithmicNonceRequest } from "../_lib/rithmic-nonce.js";

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(body);
}

function header(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : String(value || "");
}

export default async function handler(req, res, options = {}) {
  const env = options.env || process.env;
  const now = options.now || (() => Math.floor(Date.now() / 1000));
  const claimNonce = options.claimNonce || claimRithmicNonceInStorage;

  if (req.method !== "POST") return send(res, 405, { claimed: false, code: "method_not_allowed" });
  if (!header(req, "content-type").toLowerCase().startsWith("application/json")) {
    return send(res, 415, { claimed: false, code: "unsupported_media_type" });
  }

  const secret = String(env.COVA_RITHMIC_SERVICE_SECRET || "");
  const timestamp = Number(header(req, "x-cova-nonce-timestamp"));
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  if (!validateRithmicNonceRequest(body, {
    now: now(),
    secret,
    signature: header(req, "x-cova-nonce-signature"),
    timestamp,
  })) {
    return send(res, 401, { claimed: false, code: "unauthorized" });
  }

  try {
    const claimed = await claimNonce({
      env,
      requestId: String(body.requestId),
      signedAt: Number(body.signedAt),
    });
    if (!claimed) return send(res, 409, { claimed: false, code: "replayed_request" });
    return send(res, 200, { claimed: true });
  } catch (error) {
    const allowedCodes = new Set([
      "nonce_store_not_configured",
      "nonce_bucket_probe_failed",
      "nonce_bucket_create_failed",
      "nonce_object_claim_failed",
    ]);
    const code = allowedCodes.has(error?.message) ? error.message : "nonce_store_unavailable";
    return send(res, 503, { claimed: false, code });
  }
}
