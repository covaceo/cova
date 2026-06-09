import crypto from "node:crypto";
import { clearCookie, parseCookies, serializeCookie } from "../_lib/cookies.js";
import { saveTradovateConnection } from "../_lib/supabase.js";
import { addBrokerResult, getBaseUrl, getRequestUrl } from "../_lib/urls.js";

const DEFAULT_TOKEN_URL = "https://live.tradovateapi.com/auth/oauthtoken";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const baseUrl = getBaseUrl(req);
  const requestUrl = getRequestUrl(req);
  const cookies = parseCookies(req);
  const returnTo = cookies.cova_tradovate_return_to || "/#import";
  const clearHandshakeCookies = [
    clearCookie("cova_tradovate_oauth_state"),
    clearCookie("cova_tradovate_return_to"),
  ];

  function redirect(status, params = {}, extraCookies = []) {
    const target = addBrokerResult(returnTo, baseUrl, status, params);
    res.setHeader("Set-Cookie", [...clearHandshakeCookies, ...extraCookies]);
    res.redirect(302, `${target.pathname}${target.search}${target.hash}`);
  }

  const authError = requestUrl.searchParams.get("error");
  if (authError) {
    redirect("error", { reason: authError });
    return;
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  if (!code) {
    redirect("token-error", { reason: "missing-code" });
    return;
  }

  if (!state || state !== cookies.cova_tradovate_oauth_state) {
    redirect("state-mismatch");
    return;
  }

  const clientId = process.env.TRADOVATE_CLIENT_ID;
  const clientSecret = process.env.TRADOVATE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    redirect("missing-env");
    return;
  }

  const redirectUri = process.env.TRADOVATE_REDIRECT_URI || `${baseUrl}/api/tradovate/callback`;
  const tokenUrl = process.env.TRADOVATE_TOKEN_URL || DEFAULT_TOKEN_URL;
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  let tokenData;
  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const raw = await response.text();
    tokenData = raw ? JSON.parse(raw) : {};
    if (!response.ok || tokenData?.error || (!tokenData?.access_token && !tokenData?.accessToken)) {
      redirect("token-error");
      return;
    }
  } catch {
    redirect("token-error");
    return;
  }

  const connectionId = crypto.randomUUID();
  try {
    await saveTradovateConnection({ connectionId, tokenData });
  } catch {
    redirect("needs-storage", { connectionId });
    return;
  }

  redirect("connected", { connectionId }, [
    serializeCookie("cova_tradovate_connection", connectionId, { maxAge: 60 * 60 * 24 * 30 }),
  ]);
}
