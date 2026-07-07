import { isSupabaseConfigured } from "./supabaseClient";

export type AuthMode = "login" | "signup";

function getViteEnv() {
  return ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
}

export function getHostedAuthEnv(mode: AuthMode) {
  const env = getViteEnv();
  return mode === "signup"
    ? env.VITE_AUTH_SIGNUP_URL || env.VITE_AUTH_LOGIN_URL
    : env.VITE_AUTH_LOGIN_URL;
}

export function getHostedLogoutUrl() {
  const env = getViteEnv();
  return env.VITE_AUTH_LOGOUT_URL || "";
}

export function buildHostedAuthUrl(mode: AuthMode) {
  const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash || "#dashboard"}`;
  const target = new URL(getHostedAuthEnv(mode) || "/api/auth/login", window.location.origin);
  target.searchParams.set("returnUrl", returnUrl);
  target.searchParams.set("covaAuth", mode);
  return target.toString();
}

export function canRedirectToHostedAuth(mode: AuthMode) {
  if (isSupabaseConfigured()) {
    return false;
  }
  const configuredUrl = getHostedAuthEnv(mode);
  return Boolean(configuredUrl && /^https?:\/\//.test(configuredUrl));
}

export function isLocalPreview() {
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
}
