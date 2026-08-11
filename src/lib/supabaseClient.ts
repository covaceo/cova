import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";


let supabaseClient: SupabaseClient | null = null;
export const COVA_SUPABASE_STORAGE_KEY = "cova-supabase-auth-v1";
const initialAuthCallback = readInitialAuthCallback();

function readInitialAuthCallback() {
  if (typeof window === "undefined") return { accessToken: null, type: null };
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash);
  const hashAccessToken = hash.get("access_token");
  const searchAccessToken = search.get("access_token");
  if (hashAccessToken) return { accessToken: hashAccessToken, type: hash.get("type") };
  if (searchAccessToken) return { accessToken: searchAccessToken, type: search.get("type") };
  return { accessToken: null, type: search.get("type") || hash.get("type") };
}

export function hasSupabasePasswordRecoveryCallbackMarker() {
  return initialAuthCallback.type === "recovery";
}

export function isSupabasePasswordRecoveryCallback(accessToken: string) {
  return (
    initialAuthCallback.type === "recovery" &&
    Boolean(initialAuthCallback.accessToken) &&
    initialAuthCallback.accessToken === accessToken
  );
}

function readEnv() {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return {
    anonKey: env.VITE_SUPABASE_ANON_KEY,
    url: env.VITE_SUPABASE_URL,
  };
}

export function getSupabaseClient() {
  const { anonKey, url } = readEnv();
  if (!anonKey || !url) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: COVA_SUPABASE_STORAGE_KEY,
      },
    });
  }

  return supabaseClient;
}

export function isSupabaseConfigured() {
  const { anonKey, url } = readEnv();
  return Boolean(anonKey && url);
}

export async function signUpWithSupabasePassword(email: string, password: string, redirectTo: string) {
  const client = getSupabaseClient();
  if (!client) {
    return { data: { session: null, user: null }, error: new Error("Supabase auth is not configured.") };
  }

  return client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo },
  });
}

export async function signInWithSupabasePassword(email: string, password: string) {
  const client = getSupabaseClient();
  if (!client) {
    return { data: { session: null, user: null }, error: new Error("Supabase auth is not configured.") };
  }

  return client.auth.signInWithPassword({ email, password });
}

export async function resendSupabaseSignupConfirmation(email: string, redirectTo: string) {
  const client = getSupabaseClient();
  if (!client) {
    return { data: { messageId: null }, error: new Error("Supabase auth is not configured.") };
  }

  return client.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: redirectTo },
  });
}

export async function sendSupabasePasswordReset(email: string, redirectTo: string) {
  const client = getSupabaseClient();
  if (!client) {
    return { data: {}, error: new Error("Supabase auth is not configured.") };
  }

  return client.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function verifySupabaseRecoveryIdentity(accessToken: string, expectedUserId: string) {
  return requestSupabaseUser(accessToken, expectedUserId, { method: "GET" });
}

export async function updateSupabasePassword(password: string, accessToken: string, expectedUserId: string) {
  return requestSupabaseUser(accessToken, expectedUserId, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
}

async function requestSupabaseUser(accessToken: string, expectedUserId: string, init: { method: "GET" | "PUT"; body?: string }) {
  const { anonKey, url } = readEnv();
  if (!anonKey || !url || !accessToken || !expectedUserId) {
    return { data: { user: null }, error: new Error("Password recovery is not available.") };
  }

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      method: init.method,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: init.body,
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => null) as (User & { message?: string; msg?: string; error_description?: string }) | null;
    if (!response.ok) {
      return { data: { user: null }, error: new Error(payload?.message || payload?.msg || payload?.error_description || "Password recovery failed.") };
    }
    if (!payload?.id || payload.id !== expectedUserId) {
      return { data: { user: null }, error: new Error("The password reset identity changed. Request a new reset link.") };
    }
    return { data: { user: payload }, error: null };
  } catch (error) {
    return { data: { user: null }, error: error instanceof Error ? error : new Error("Password recovery failed.") };
  }
}

export async function sendSupabaseLoginLink(email: string, redirectTo: string) {
  const client = getSupabaseClient();
  if (!client) {
    return { data: { messageId: null, session: null, user: null }, error: new Error("Supabase auth is not configured.") };
  }

  return client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
    },
  });
}

function purgeSupabasePersistence() {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.removeItem(COVA_SUPABASE_STORAGE_KEY);
    localStorage.removeItem(`${COVA_SUPABASE_STORAGE_KEY}-code-verifier`);
  } catch {
    // In-memory auth is still stopped even if browser storage is unavailable.
  }
}

export function lockSupabaseLocally() {
  supabaseClient?.auth.stopAutoRefresh();
  purgeSupabasePersistence();
}

export async function signOutSupabase() {
  const client = getSupabaseClient();
  if (!client) {
    purgeSupabasePersistence();
    return { error: null };
  }

  let primaryError: unknown = null;
  try {
    const { error } = await client.auth.signOut();
    primaryError = error;
  } catch (error) {
    primaryError = error;
  }
  if (!primaryError) {
    purgeSupabasePersistence();
    return { error: null };
  }

  client.auth.stopAutoRefresh();
  let fallbackError: unknown = null;
  try {
    const result = await client.auth.signOut({ scope: "local" });
    fallbackError = result.error;
  } catch (error) {
    fallbackError = error;
  }
  purgeSupabasePersistence();
  return { error: fallbackError || primaryError };
}

export function getSupabaseUserPlan(user: User) {
  return typeof user.app_metadata?.plan === "string" ? user.app_metadata.plan : "";
}
