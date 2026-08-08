import { requireAuthenticatedUser, sendApiError } from "../_lib/auth.js";
import { parseCookies } from "../_lib/cookies.js";
import {
  getTradovateConnection,
  listBrokerConnectionsForUser,
} from "../_lib/supabase.js";

function requestedProvider(req) {
  const value = Array.isArray(req.query?.provider) ? req.query.provider[0] : req.query?.provider;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
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
    const message = provider === "tradovate"
      ? "Tradovate status is unavailable."
      : "Saved provider status is unavailable.";
    return sendApiError(res, error, message);
  }
}
