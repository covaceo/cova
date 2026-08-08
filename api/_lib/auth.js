import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "./legal-policy.js";
import { hasPolicyAcceptance, supabaseServiceHeaders } from "./supabase.js";

export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

function getBearerToken(req) {
  const authorization = String(req.headers?.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function requireAuthenticatedUser(req, { fetchImpl = fetch, timeoutMs = 5_000 } = {}) {
  const token = getBearerToken(req);
  if (!token) {
    throw new ApiError(401, "Sign in to continue.");
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const apiKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !apiKey) {
    throw new ApiError(503, "Member authentication is not configured.");
  }

  let response;
  try {
    response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError(503, "Member authentication is temporarily unavailable.");
  }

  if (!response.ok) {
    throw new ApiError(401, "Your Cova session is invalid or expired. Sign in again.");
  }

  const user = await response.json();
  if (!user?.id) {
    throw new ApiError(401, "Your Cova session could not be verified.");
  }

  return {
    id: String(user.id),
    email: typeof user.email === "string" ? user.email : "",
    plan: user.app_metadata?.plan === "pro" ? "pro" : "free",
  };
}

async function requireCurrentPolicyAcceptance(userId, options = {}) {
  let accepted;
  try {
    accepted = await hasPolicyAcceptance({
      userId,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    }, options);
  } catch {
    throw new ApiError(503, "Cova could not verify policy acceptance.");
  }
  if (!accepted) {
    throw new ApiError(403, "Accept the current Terms and Privacy Policy to continue.");
  }
}

export async function requirePolicyAcceptedUser(req, options = {}) {
  const user = await requireAuthenticatedUser(req, options);
  await requireCurrentPolicyAcceptance(user.id, options);
  return user;
}

export function requireProEntitlement(user) {
  if (user?.plan !== "pro") {
    throw new ApiError(403, "Cova Pro is required for direct sync.");
  }
  return user;
}

export async function requireProUserById(userId, { fetchImpl = fetch, timeoutMs = 5_000 } = {}) {
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new ApiError(503, "Member entitlement verification is not configured.");
  }

  let response;
  try {
    response = await fetchImpl(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(String(userId || ""))}`, {
      headers: supabaseServiceHeaders(serviceRoleKey),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError(503, "Member entitlement verification is temporarily unavailable.");
  }
  if (!response.ok) {
    throw new ApiError(response.status === 404 ? 403 : 503, "Cova could not verify your current Pro access.");
  }

  const payload = await response.json();
  const user = payload?.user || payload;
  if (!user?.id || String(user.id) !== String(userId)) {
    throw new ApiError(403, "Cova could not verify your current Pro access.");
  }

  const entitledUser = requireProEntitlement({
    id: String(user.id),
    email: typeof user.email === "string" ? user.email : "",
    plan: user.app_metadata?.plan === "pro" ? "pro" : "free",
  });
  await requireCurrentPolicyAcceptance(entitledUser.id, { fetchImpl, timeoutMs });
  return entitledUser;
}

export function sendApiError(res, error, fallbackMessage) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const message = statusCode >= 500 ? fallbackMessage : error?.message || fallbackMessage;
  return res.status(statusCode).json({ error: message });
}
