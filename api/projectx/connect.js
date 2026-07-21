import crypto from "node:crypto";
import { requireAuthenticatedUser, sendApiError } from "../_lib/auth.js";
import { serializeCookie } from "../_lib/cookies.js";
import {
  pickPrimaryAccount,
  PROJECTX_COOKIE,
  PROJECTX_PROVIDER,
  PROJECTX_PROVIDER_NAME,
  projectXPost,
  readJsonBody,
} from "../_lib/projectx.js";
import { saveBrokerConnection } from "../_lib/supabase.js";

const TOKEN_TTL_SECONDS = 60 * 60 * 23;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let user;
  try {
    user = await requireAuthenticatedUser(req);
    res.setHeader("Cache-Control", "private, no-store");
  } catch (error) {
    return sendApiError(res, error, "Member authentication is unavailable.");
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    res.status(400).json({ error: "Send a valid JSON body with userName and apiKey." });
    return;
  }

  const userName = String(body?.userName || "").trim();
  const apiKey = String(body?.apiKey || "").trim();
  if (!userName || !apiKey) {
    res.status(400).json({ error: "Enter the TopstepX username and API key from your account settings." });
    return;
  }

  let token;
  let accounts = [];
  try {
    const login = await projectXPost("/Auth/loginKey", { userName, apiKey });
    token = login?.token;
    if (!token) {
      res.status(401).json({ error: "TopstepX accepted the request but did not return a session token." });
      return;
    }

    const accountResponse = await projectXPost("/Account/search", { onlyActiveAccounts: true }, token);
    accounts = Array.isArray(accountResponse?.accounts) ? accountResponse.accounts : [];
  } catch (error) {
    res.status(401).json({
      error: error instanceof Error ? error.message : "TopstepX could not validate those credentials.",
    });
    return;
  }

  const connectionId = crypto.randomUUID();
  const primaryAccount = pickPrimaryAccount(accounts);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

  try {
    await saveBrokerConnection({
      accessToken: token,
      connectionId,
      expiresAt,
      provider: PROJECTX_PROVIDER,
      providerAccountId: primaryAccount?.id ?? userName,
      tokenScope: "Cova allowlist: Account/search and Trade/search; provider token is not scope-limited",
      userId: user.id,
    });
  } catch {
    res.status(200).json({
      provider: PROJECTX_PROVIDER_NAME,
      connected: false,
      verified: true,
      status: "needs-storage",
      accounts: sanitizeAccounts(accounts),
      message: "TopstepX verified the API key, but Cova could not save the encrypted token securely. Use CSV import instead.",
    });
    return;
  }

  res.setHeader("Set-Cookie", [
    serializeCookie(PROJECTX_COOKIE, connectionId, { maxAge: 60 * 60 * 24 * 30 }),
  ]);
  res.status(200).json({
    provider: PROJECTX_PROVIDER_NAME,
    connected: true,
    status: "connected",
    accounts: sanitizeAccounts(accounts),
    message: accounts.length
      ? `Connected ${accounts.length} TopstepX account${accounts.length === 1 ? "" : "s"}. Cova will only call account and trade-history endpoints.`
      : "Connected TopstepX. Cova will not call order endpoints; no active accounts were returned yet.",
  });
}

function sanitizeAccounts(accounts) {
  return (Array.isArray(accounts) ? accounts : []).map((account) => ({
    id: account?.id,
    name: account?.name,
    balance: account?.balance,
    canTrade: account?.canTrade,
    isVisible: account?.isVisible,
    simulated: account?.simulated,
  }));
}
