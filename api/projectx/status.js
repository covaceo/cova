import { requireAuthenticatedUser, sendApiError } from "../_lib/auth.js";
import { parseCookies } from "../_lib/cookies.js";
import { PROJECTX_COOKIE, PROJECTX_PROVIDER, PROJECTX_PROVIDER_NAME } from "../_lib/projectx.js";
import { getBrokerConnection } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    res.setHeader("Cache-Control", "private, no-store");
    const connectionId = parseCookies(req)[PROJECTX_COOKIE];
    if (!connectionId) {
      return res.status(200).json({
        provider: PROJECTX_PROVIDER_NAME,
        connected: false,
        status: "not-connected",
        message: "No TopstepX connection found yet.",
      });
    }

    const connection = await getBrokerConnection({ connectionId, provider: PROJECTX_PROVIDER, userId: user.id });
    if (!connection) {
      return res.status(200).json({
        provider: PROJECTX_PROVIDER_NAME,
        connected: false,
        status: "not-connected",
        message: "No authorized TopstepX connection was found for this Cova account.",
      });
    }

    return res.status(200).json({
      provider: PROJECTX_PROVIDER_NAME,
      connected: true,
      status: connection.status || "connected",
      expiresAt: connection.expires_at,
      storageConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.COVA_TOKEN_ENCRYPTION_KEY),
      message: "TopstepX connection found for this Cova account. Cova only calls account and trade-history endpoints.",
    });
  } catch (error) {
    return sendApiError(res, error, "TopstepX status is unavailable.");
  }
}
