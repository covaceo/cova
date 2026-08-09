const REQUIRED_TRADOVATE_ENV = [
  "COVA_TOKEN_ENCRYPTION_KEY",
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "TRADOVATE_CLIENT_ID",
  "TRADOVATE_CLIENT_SECRET",
];

export function tradovateEnvironmentReady(env = process.env) {
  return REQUIRED_TRADOVATE_ENV.every((name) => String(env?.[name] || "").trim().length > 0);
}
