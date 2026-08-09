import { encryptSecret } from "./encryption.js";

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ""), serviceRoleKey };
}

export function supabaseServiceHeaders(serviceRoleKey, extra = {}) {
  const headers = {
    apikey: serviceRoleKey,
    "Content-Type": "application/json",
  };
  if (!serviceRoleKey.startsWith("sb_secret_")) {
    headers.Authorization = ["Bearer", serviceRoleKey].join(" ");
  }
  return { ...headers, ...extra };
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

  const endpoint = new URL(`${supabaseUrl}/rest/v1/broker_connections`);
  endpoint.searchParams.set("on_conflict", "user_id,provider");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: supabaseServiceHeaders(serviceRoleKey, { Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(row),
  });
  await requireSuccess(response, "Secure storage rejected the broker connection");

  const payload = await response.json();
  return payload?.[0] || row;
}

export async function saveTradovateConnection({ connectionId, tokenData, userId }) {
  const expirationTime = Date.parse(String(tokenData?.expirationTime || ""));
  const expiresIn = Number(tokenData?.expires_in || tokenData?.expiration || 0);
  const expiresAt = Number.isFinite(expirationTime)
    ? new Date(expirationTime).toISOString()
    : Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;
  if (!expiresAt) {
    throw new Error("Tradovate returned a credential without a valid expiry.");
  }
  if (Date.parse(expiresAt) <= Date.now()) {
    throw new Error("Tradovate returned an expired credential.");
  }
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

function connectionExpiryIsInvalid(connection, provider) {
  if (!connection) return false;
  if (!connection.expires_at) return provider === "tradovate";
  const expiry = Date.parse(String(connection.expires_at));
  return !Number.isFinite(expiry) || expiry <= Date.now();
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
    headers: supabaseServiceHeaders(serviceRoleKey),
  });
  await requireSuccess(response, "Secure storage rejected the connection lookup");
  const rows = await response.json();
  const connection = rows?.[0] || null;
  if (connectionExpiryIsInvalid(connection, provider)) {
    await deleteBrokerConnection({ connectionId, provider, userId });
    return null;
  }
  return connection;
}

export async function getTradovateConnection(connectionId, userId) {
  return getBrokerConnection({ connectionId, provider: "tradovate", userId });
}

export async function getBrokerConnectionForUser({ provider, userId }) {
  if (!provider || !userId) {
    return null;
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const endpoint = new URL(`${supabaseUrl}/rest/v1/broker_connections`);
  endpoint.searchParams.set("provider", `eq.${provider}`);
  endpoint.searchParams.set("user_id", `eq.${userId}`);
  endpoint.searchParams.set("status", "eq.connected");
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("order", "created_at.desc");
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint, { headers: supabaseServiceHeaders(serviceRoleKey) });
  await requireSuccess(response, "Secure storage rejected the owner connection lookup");
  const rows = await response.json();
  const connection = rows?.[0] || null;
  if (connectionExpiryIsInvalid(connection, provider)) {
    await deleteBrokerConnection({ connectionId: connection.id, provider, userId });
    return null;
  }
  return connection;
}

export async function getTradovateConnectionForUser(userId) {
  return getBrokerConnectionForUser({ provider: "tradovate", userId });
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
    headers: supabaseServiceHeaders(serviceRoleKey, { Prefer: "return=minimal" }),
  });
  await requireSuccess(response, "Secure storage rejected connection deletion");
  return true;
}

export async function listBrokerConnectionsForUser(userId) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const endpoint = new URL(`${supabaseUrl}/rest/v1/broker_connections`);
  endpoint.searchParams.set("user_id", `eq.${userId}`);
  endpoint.searchParams.set("select", "provider,status,expires_at");
  endpoint.searchParams.set("order", "created_at.desc");
  const response = await fetch(endpoint, { headers: supabaseServiceHeaders(serviceRoleKey) });
  await requireSuccess(response, "Stored connector status lookup");
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
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
    headers: supabaseServiceHeaders(serviceRoleKey, { Prefer: "return=minimal" }),
  });
  await requireSuccess(response, "Secure storage rejected account connection deletion");
  return true;
}

export async function deleteBrokerConnectionsForProvider({ provider, userId }) {
  if (!provider || !userId) {
    return false;
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const endpoint = new URL(`${supabaseUrl}/rest/v1/broker_connections`);
  endpoint.searchParams.set("user_id", `eq.${userId}`);
  endpoint.searchParams.set("provider", `eq.${provider}`);

  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: supabaseServiceHeaders(serviceRoleKey, { Prefer: "return=minimal" }),
  });
  await requireSuccess(response, "Secure storage rejected provider connection deletion");
  return true;
}

export async function recordPolicyAcceptance({ userId, termsVersion, privacyVersion }) {
  if (!userId || !termsVersion || !privacyVersion) {
    throw new Error("Missing policy acceptance fields.");
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const endpoint = new URL(`${supabaseUrl}/rest/v1/policy_acceptances`);
  endpoint.searchParams.set("on_conflict", "user_id,terms_version,privacy_version");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: supabaseServiceHeaders(serviceRoleKey, { Prefer: "resolution=ignore-duplicates,return=minimal" }),
    body: JSON.stringify({
      user_id: userId,
      terms_version: termsVersion,
      privacy_version: privacyVersion,
      source: "web-signup",
    }),
  });
  await requireSuccess(response, "Secure storage rejected policy acceptance");
  return true;
}

export async function hasPolicyAcceptance({ userId, termsVersion, privacyVersion }, { fetchImpl = fetch, timeoutMs = 5_000 } = {}) {
  if (!userId || !termsVersion || !privacyVersion) {
    return false;
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const endpoint = new URL(`${supabaseUrl}/rest/v1/policy_acceptances`);
  endpoint.searchParams.set("user_id", `eq.${userId}`);
  endpoint.searchParams.set("terms_version", `eq.${termsVersion}`);
  endpoint.searchParams.set("privacy_version", `eq.${privacyVersion}`);
  endpoint.searchParams.set("select", "id");
  endpoint.searchParams.set("limit", "1");
  const response = await fetchImpl(endpoint, {
    headers: supabaseServiceHeaders(serviceRoleKey),
    signal: AbortSignal.timeout(timeoutMs),
  });
  await requireSuccess(response, "Secure storage rejected policy acceptance lookup");
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1;
}

export async function deleteAuthUser(userId) {
  if (!userId) {
    throw new Error("Missing account owner id.");
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: supabaseServiceHeaders(serviceRoleKey),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Authentication provider rejected account deletion (${response.status}).`);
  }
  return true;
}
