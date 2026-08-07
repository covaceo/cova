import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";


let supabaseClient: SupabaseClient | null = null;
export const COVA_SUPABASE_STORAGE_KEY = "cova-supabase-auth-v1";

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

export async function sendSupabaseMagicLink(email: string, redirectTo: string, mode: "login" | "signup") {
  const client = getSupabaseClient();
  if (!client) {
    return { error: new Error("Supabase auth is not configured.") };
  }

  return client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: mode === "signup",
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
