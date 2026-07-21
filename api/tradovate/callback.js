import { randomUUID } from "node:crypto";
import { clearCookie, parseCookies, serializeCookie } from "../_lib/cookies.js";
import { verifyOAuthContext } from "../_lib/oauth-context.js";
import { saveTradovateConnection } from "../_lib/supabase.js";
import { getAppOrigin, getTradovateRedirectUri } from "../_lib/urls.js";

function redirectToClient(req, res, status, message) {
  const target = new URL(getAppOrigin(req));
  target.hash = `import?broker=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}`;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Set-Cookie", clearCookie("cova_oauth_context"));
  return res.redirect(302, target.toString());
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const state = typeof req.query?.state === "string" ? req.query.state : "";
  const cookies = parseCookies(req);
  const context = verifyOAuthContext(cookies.cova_oauth_context);
  if (!context || !state || context.state !== state) {
    return redirectToClient(req, res, "error", "OAuth state validation failed. Start the connection again from Cova.");
  }

  const userId = context.userId;
  const authError = typeof req.query?.error === "string" ? req.query.error : "";
  if (authError) {
    return redirectToClient(req, res, "denied", "Tradovate authorization was denied.");
  }

  const code = typeof req.query?.code === "string" ? req.query.code : "";
  if (!code) {
    return redirectToClient(req, res, "error", "Tradovate did not return an authorization code.");
  }

  try {
    const clientId = process.env.TRADOVATE_CLIENT_ID;
    const clientSecret = process.env.TRADOVATE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Tradovate OAuth credentials are not configured.");
    }

    const tokenUrl = process.env.TRADOVATE_TOKEN_URL || "https://live.tradovateapi.com/auth/oauthtoken";
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getTradovateRedirectUri(req),
    });
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenResponse.ok) {
      throw new Error(`Tradovate token exchange failed (${tokenResponse.status}).`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData?.access_token || tokenData?.accessToken;
    if (!accessToken) {
      throw new Error("Tradovate did not return an access token.");
    }

    const connectionId = randomUUID();
    await saveTradovateConnection({ connectionId, tokenData, userId });
    const target = new URL(getAppOrigin(req));
    target.hash = "import?broker=connected&message=Tradovate%20connected%20read-only";
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Set-Cookie", [
      serializeCookie("cova_tradovate_connection", connectionId, { maxAge: 60 * 60 * 24 * 30 }),
      clearCookie("cova_oauth_context"),
    ]);
    return res.redirect(302, target.toString());
  } catch {
    return redirectToClient(req, res, "error", "Tradovate could not complete a secure connection. Try again or use CSV import.");
  }
}
