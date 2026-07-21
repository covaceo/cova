import { encryptSecret } from "./encryption.js";

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ""), serviceRoleKey };
}

function serviceHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: ["Bearer", serviceRoleKey].join(" "),
    "Content-Type": "application/json",
    ...extra,
  };
}

async function requireSuccess(response, message) {
  if (!response.ok) {
    throw new Error(`${message} (${response.status}).`);
  }
  return response;
}

export async function saveBrokerConnection({
  accessToken,
  connectionId,
  expiresAt = null,
  provider,
  providerAccountId = null,
  refreshToken = null,
  tokenScope = null,
  userId,
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
  if (!userId) {
    throw new Error("Cannot store an unowned broker connection.");
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const row = {
    id: connectionId,
    provider,
    user_id: userId,
    provider_account_id: providerAccountId ? String(providerAccountId) : null,
    access_token_encrypted: encryptSecret(accessToken),
    refresh_token_encrypted: refreshToken ? encryptSecret(refreshToken) : null,
    token_scope: tokenScope,
    expires_at: expiresAt,
    status: "connected",
  };

  const response = await fetch(`${supabaseUrl}/rest/v1/broker_connections`, {
    method: "POST",
    headers: serviceHeaders(serviceRoleKey, { Prefer: "return=representation" }),
    body: JSON.stringify(row),
  });
  await requireSuccess(response, "Secure storage rejected the broker connection");

  const payload = await response.json();
  return payload?.[0] || row;
}

export async function saveTradovateConnection({ connectionId, tokenData, userId }) {
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
    userId,
  });
}

export async function getBrokerConnection({ connectionId, provider, userId }) {
  if (!connectionId || !provider || !userId) {
    return null;
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const endpoint = new URL(`${supabaseUrl}/rest/v1/broker_connections`);
  endpoint.searchParams.set("id", `eq.${connectionId}`);
  endpoint.searchParams.set("provider", `eq.${provider}`);
  endpoint.searchParams.set("user_id", `eq.${userId}`);
  endpoint.searchParams.set("status", "eq.connected");
  endpoint.searchParams.set("select", "*");

  const response = await fetch(endpoint, {
    headers: serviceHeaders(serviceRoleKey),
  });
  await requireSuccess(response, "Secure storage rejected the connection lookup");
  const rows = await response.json();
  const connection = rows?.[0] || null;
  if (connection?.expires_at && new Date(connection.expires_at).getTime() <= Date.now()) {
    await deleteBrokerConnection({ connectionId, provider, userId });
    return null;
  }
  return connection;
}

export async function getTradovateConnection(connectionId, userId) {
  return getBrokerConnection({ connectionId, provider: "tradovate", userId });
}

export async function deleteBrokerConnection({ connectionId, provider, userId }) {
  if (!connectionId || !userId) {
    return false;
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const endpoint = new URL(`${supabaseUrl}/rest/v1/broker_connections`);
  endpoint.searchParams.set("id", `eq.${connectionId}`);
  endpoint.searchParams.set("user_id", `eq.${userId}`);
  if (provider) {
    endpoint.searchParams.set("provider", `eq.${provider}`);
  }

  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: serviceHeaders(serviceRoleKey, { Prefer: "return=minimal" }),
  });
  await requireSuccess(response, "Secure storage rejected connection deletion");
  return true;
}

export async function deleteBrokerConnectionsForUser(userId) {
  if (!userId) {
    return false;
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const endpoint = new URL(`${supabaseUrl}/rest/v1/broker_connections`);
  endpoint.searchParams.set("user_id", `eq.${userId}`);

  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: serviceHeaders(serviceRoleKey, { Prefer: "return=minimal" }),
  });
  await requireSuccess(response, "Secure storage rejected account connection deletion");
  return true;
}

export async function deleteAuthUser(userId) {
  if (!userId) {
    throw new Error("Missing account owner id.");
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: serviceHeaders(serviceRoleKey),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Authentication provider rejected account deletion (${response.status}).`);
  }
  return true;
}
