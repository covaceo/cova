import { parseCookies } from "../_lib/cookies.js";
import { PROJECTX_COOKIE, PROJECTX_PROVIDER_NAME } from "../_lib/projectx.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const cookies = parseCookies(req);
  const connectionId = cookies[PROJECTX_COOKIE];
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const encryptionConfigured = Boolean(process.env.COVA_TOKEN_ENCRYPTION_KEY);

  res.status(200).json({
    provider: PROJECTX_PROVIDER_NAME,
    connected: Boolean(connectionId),
    connectionId,
    storageConfigured: supabaseConfigured && encryptionConfigured,
    message: connectionId
      ? "TopstepX connection found. Cova can sync read-only trade history."
      : "No TopstepX connection found yet.",
  });
}
