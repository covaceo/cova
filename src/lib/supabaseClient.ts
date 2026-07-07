import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

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
      },
    });
  }

  return supabaseClient;
}

export function isSupabaseConfigured() {
  const { anonKey, url } = readEnv();
  return Boolean(anonKey && url);
}

export async function sendSupabaseMagicLink(email: string, redirectTo: string) {
  const client = getSupabaseClient();
  if (!client) {
    return { error: new Error("Supabase auth is not configured.") };
  }

  return client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
    },
  });
}

export function getSupabaseUserPlan(user: User) {
  const appPlan = typeof user.app_metadata?.plan === "string" ? user.app_metadata.plan : "";
  const userPlan = typeof user.user_metadata?.plan === "string" ? user.user_metadata.plan : "";
  return appPlan || userPlan;
}
