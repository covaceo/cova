import { encryptSecret } from "./encryption.js";

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ""), serviceRoleKey };
}

export async function saveTradovateConnection({ connectionId, tokenData }) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  const expiresIn = Number(tokenData?.expires_in || tokenData?.expiration || 0);
  const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  const row = {
    id: connectionId,
    provider: "tradovate",
    provider_account_id: tokenData?.userId ? String(tokenData.userId) : null,
    access_token_encrypted: encryptSecret(tokenData?.access_token || tokenData?.accessToken),
    refresh_token_encrypted: encryptSecret(tokenData?.refresh_token || tokenData?.refreshToken),
    token_scope: tokenData?.scope || null,
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

export async function getTradovateConnection(connectionId) {
  if (!connectionId) {
    throw new Error("Missing Tradovate connection id");
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const endpoint = new URL(`${supabaseUrl}/rest/v1/broker_connections`);
  endpoint.searchParams.set("id", `eq.${connectionId}`);
  endpoint.searchParams.set("provider", "eq.tradovate");
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
