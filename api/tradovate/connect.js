import { randomBytes } from "node:crypto";
import { requireAuthenticatedUser, sendApiError } from "../_lib/auth.js";
import { serializeCookie } from "../_lib/cookies.js";
import { createOAuthContext } from "../_lib/oauth-context.js";
import { getTradovateRedirectUri } from "../_lib/urls.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const clientId = process.env.TRADOVATE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "Tradovate access is not configured yet." });
    }

    const state = randomBytes(32).toString("hex");
    const context = createOAuthContext(user.id, state);
    const authorizeUrl = process.env.TRADOVATE_AUTHORIZE_URL || "https://trader.tradovate.com/oauth";
    const url = new URL(authorizeUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", getTradovateRedirectUri(req));
    url.searchParams.set("state", state);
    if (process.env.TRADOVATE_SCOPE) {
      url.searchParams.set("scope", process.env.TRADOVATE_SCOPE);
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Set-Cookie", serializeCookie("cova_oauth_context", context, { maxAge: 600 }));
    return res.status(200).json({ authorizationUrl: url.toString() });
  } catch (error) {
    return sendApiError(res, error, "Tradovate authorization could not start securely.");
  }
}
