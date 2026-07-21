import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { PolicyAcceptance } from "./legal";

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

export async function sendSupabaseMagicLink(email: string, redirectTo: string, policyAcceptance?: PolicyAcceptance) {
  const client = getSupabaseClient();
  if (!client) {
    return { error: new Error("Supabase auth is not configured.") };
  }

  return client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      data: policyAcceptance ? {
        terms_accepted_at: policyAcceptance.acceptedAt,
        terms_version: policyAcceptance.termsVersion,
      } : undefined,
    },
  });
}

export function getSupabaseUserPlan(user: User) {
  return typeof user.app_metadata?.plan === "string" ? user.app_metadata.plan : "";
}
