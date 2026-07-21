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

export async function requireAuthenticatedUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw new ApiError(401, "Sign in to continue.");
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const apiKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !apiKey) {
    throw new ApiError(503, "Member authentication is not configured.");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${token}`,
    },
  });

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
  };
}

export function sendApiError(res, error, fallbackMessage) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const message = statusCode >= 500 ? fallbackMessage : error?.message || fallbackMessage;
  return res.status(statusCode).json({ error: message });
}
