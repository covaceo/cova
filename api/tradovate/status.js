import { requireAuthenticatedUser, sendApiError } from "../_lib/auth.js";
import { parseCookies } from "../_lib/cookies.js";
import { getTradovateConnection } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    res.setHeader("Cache-Control", "no-store");
    const connectionId = parseCookies(req).cova_tradovate_connection;
    if (!connectionId) {
      return res.status(200).json({ connected: false, provider: "Tradovate", status: "not-connected" });
    }

    const connection = await getTradovateConnection(connectionId, user.id);
    if (!connection) {
      return res.status(200).json({ connected: false, provider: "Tradovate", status: "not-connected" });
    }

    return res.status(200).json({ connected: true, provider: "Tradovate", status: connection.status || "connected", expiresAt: connection.expires_at });
  } catch (error) {
    return sendApiError(res, error, "Tradovate status is unavailable.");
  }
}
