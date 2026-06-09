import crypto from "node:crypto";
import { serializeCookie } from "../_lib/cookies.js";
import { getBaseUrl, getRequestUrl, safeReturnUrl } from "../_lib/urls.js";

const DEFAULT_TRADOVATE_AUTH_URL = "https://trader.tradovate.com/oauth";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const clientId = process.env.TRADOVATE_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "Missing TRADOVATE_CLIENT_ID" });
    return;
  }

  const requestUrl = getRequestUrl(req);
  const baseUrl = getBaseUrl(req);
  const redirectUri = process.env.TRADOVATE_REDIRECT_URI || `${baseUrl}/api/tradovate/callback`;
  const returnTo = safeReturnUrl(requestUrl.searchParams.get("returnUrl"));
  const state = crypto.randomBytes(24).toString("hex");

  const authorizationUrl = new URL(process.env.TRADOVATE_AUTH_URL || DEFAULT_TRADOVATE_AUTH_URL);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", state);

  res.setHeader("Set-Cookie", [
    serializeCookie("cova_tradovate_oauth_state", state, { maxAge: 600 }),
    serializeCookie("cova_tradovate_return_to", returnTo, { maxAge: 600 }),
  ]);
  res.redirect(302, authorizationUrl.toString());
}
