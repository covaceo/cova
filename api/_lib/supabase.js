import { encryptSecret } from "./encryption.js";

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ""), serviceRoleKey };
}

export async function saveBrokerConnection({
  accessToken,
  connectionId,
  expiresAt = null,
  provider,
  providerAccountId = null,
  refreshToken = null,
  tokenScope = null,
}) {
  if (!connectionId) {
    throw new Error("Missing broker connection id");
  }
  if (!provider) {
    throw new Error("Missing broker provider");
  }
  if (!accessToken) {
    throw new Error("Missing broker access token");
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  const row = {
    id: connectionId,
    provider,
    provider_account_id: providerAccountId ? String(providerAccountId) : null,
    access_token_encrypted: encryptSecret(accessToken),
    refresh_token_encrypted: refreshToken ? encryptSecret(refreshToken) : null,
    token_scope: tokenScope,
    expires_at: expiresAt,
    status: "connected",
  };

  const endpoint = `${supabaseUrl}/rest/v1/broker_connections`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = await response.json();
  return payload?.[0] || row;
}

export async function saveTradovateConnection({ connectionId, tokenData }) {
  const expiresIn = Number(tokenData?.expires_in || tokenData?.expiration || 0);
  const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  return saveBrokerConnection({
    connectionId,
    provider: "tradovate",
    providerAccountId: tokenData?.userId,
    accessToken: tokenData?.access_token || tokenData?.accessToken,
    refreshToken: tokenData?.refresh_token || tokenData?.refreshToken,
    tokenScope: tokenData?.scope || null,
    expiresAt,
  });
}

export async function getBrokerConnection({ connectionId, provider }) {
  if (!connectionId) {
    throw new Error("Missing broker connection id");
  }
  if (!provider) {
    throw new Error("Missing broker provider");
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const endpoint = new URL(`${supabaseUrl}/rest/v1/broker_connections`);
  endpoint.searchParams.set("id", `eq.${connectionId}`);
  endpoint.searchParams.set("provider", `eq.${provider}`);
  endpoint.searchParams.set("status", "eq.connected");
  endpoint.searchParams.set("select", "*");

  const response = await fetch(endpoint, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const rows = await response.json();
  return rows?.[0] || null;
}

export async function getTradovateConnection(connectionId) {
  return getBrokerConnection({ connectionId, provider: "tradovate" });
}
