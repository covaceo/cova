import { requireAuthenticatedUser, sendApiError } from "../_lib/auth.js";
import { clearCookie } from "../_lib/cookies.js";
import { deleteBrokerConnectionsForProvider, deleteBrokerConnectionsForUser } from "../_lib/supabase.js";

const providers = {
  projectx: { cookie: "cova_projectx_connection", label: "TopstepX" },
  tradovate: { cookie: "cova_tradovate_connection", label: "Tradovate" },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const provider = String(body.provider || "").toLowerCase();
    const config = providers[provider];
    if (provider !== "all" && !config) {
      return res.status(400).json({ error: "Choose a supported connection to disconnect." });
    }

    if (provider === "all") {
      await deleteBrokerConnectionsForUser(user.id);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Set-Cookie", [
        clearCookie(providers.projectx.cookie),
        clearCookie(providers.tradovate.cookie),
        clearCookie("cova_oauth_context"),
      ]);
      return res.status(200).json({ disconnected: true, provider: "All Cova connectors" });
    }

    await deleteBrokerConnectionsForProvider({ provider, userId: user.id });

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Set-Cookie", [
      clearCookie(config.cookie),
      clearCookie("cova_oauth_context"),
    ]);
    return res.status(200).json({ disconnected: true, provider: config.label });
  } catch (error) {
    return sendApiError(res, error, "The connection could not be removed securely.");
  }
}
