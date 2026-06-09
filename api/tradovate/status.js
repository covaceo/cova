import { parseCookies } from "../_lib/cookies.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const cookies = parseCookies(req);
  const connectionId = cookies.cova_tradovate_connection;
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const encryptionConfigured = Boolean(process.env.COVA_TOKEN_ENCRYPTION_KEY);

  res.status(200).json({
    provider: "Tradovate",
    connected: Boolean(connectionId),
    connectionId,
    storageConfigured: supabaseConfigured && encryptionConfigured,
    message: connectionId
      ? "Tradovate connection cookie found. Secure token storage should be checked in Supabase before trade sync."
      : "No Tradovate connection found yet.",
  });
}
