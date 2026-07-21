import { createHmac, timingSafeEqual } from "node:crypto";

const CONTEXT_LIFETIME_MS = 10 * 60 * 1000;

function getSigningSecret() {
  const secret = process.env.OAUTH_COOKIE_SECRET || process.env.COVA_TOKEN_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || "";
  if (!secret) {
    throw new Error("OAuth context signing is not configured.");
  }
  return secret;
}

function sign(payload) {
  return createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");
}

export function createOAuthContext(userId, state) {
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + CONTEXT_LIFETIME_MS,
    state,
    userId,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyOAuthContext(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) {
    return null;
  }

  const expected = sign(payload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded?.userId || !decoded?.state || !Number.isFinite(decoded?.exp) || decoded.exp < Date.now()) {
      return null;
    }
    return {
      exp: decoded.exp,
      state: String(decoded.state),
      userId: String(decoded.userId),
    };
  } catch {
    return null;
  }
}
