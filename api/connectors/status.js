import { requireAuthenticatedUser, sendApiError } from "../_lib/auth.js";
import { parseCookies } from "../_lib/cookies.js";
import { PROJECTX_COOKIE, PROJECTX_PROVIDER, PROJECTX_PROVIDER_NAME } from "../_lib/projectx.js";
import {
  getBrokerConnection,
  getTradovateConnection,
  listBrokerConnectionsForUser,
} from "../_lib/supabase.js";

function requestedProvider(req) {
  const value = Array.isArray(req.query?.provider) ? req.query.provider[0] : req.query?.provider;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function sendProjectXStatus(req, res, userId) {
  const connectionId = parseCookies(req)[PROJECTX_COOKIE];
  if (!connectionId) {
    return res.status(200).json({
      provider: PROJECTX_PROVIDER_NAME,
      connected: false,
      status: "not-connected",
      message: "No TopstepX connection found yet.",
    });
  }

  const connection = await getBrokerConnection({ connectionId, provider: PROJECTX_PROVIDER, userId });
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
}

async function sendTradovateStatus(req, res, userId) {
  const connectionId = parseCookies(req).cova_tradovate_connection;
  if (!connectionId) {
    return res.status(200).json({ connected: false, provider: "Tradovate", status: "not-connected" });
  }

  const connection = await getTradovateConnection(connectionId, userId);
  if (!connection) {
    return res.status(200).json({ connected: false, provider: "Tradovate", status: "not-connected" });
  }

  return res.status(200).json({
    connected: true,
    provider: "Tradovate",
    status: connection.status || "connected",
    expiresAt: connection.expires_at,
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const provider = requestedProvider(req);
  try {
    const user = await requireAuthenticatedUser(req);
    res.setHeader("Cache-Control", "private, no-store");

    if (provider === "projectx") {
      return await sendProjectXStatus(req, res, user.id);
    }
    if (provider === "tradovate") {
      return await sendTradovateStatus(req, res, user.id);
    }
    if (provider) {
      return res.status(400).json({ error: "Unsupported provider" });
    }

    const rows = await listBrokerConnectionsForUser(user.id);
    return res.status(200).json({
      providers: rows.map((row) => ({
        expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
        provider: String(row.provider || "unknown"),
        status: String(row.status || "connected"),
      })),
    });
  } catch (error) {
    const message = provider === "projectx"
      ? "TopstepX status is unavailable."
      : provider === "tradovate"
        ? "Tradovate status is unavailable."
        : "Saved provider status is unavailable.";
    return sendApiError(res, error, message);
  }
}
