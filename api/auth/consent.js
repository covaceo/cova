import { ApiError, requireAuthenticatedUser, sendApiError } from "../_lib/auth.js";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "../_lib/legal-policy.js";
import { hasPolicyAcceptance, recordPolicyAcceptance } from "../_lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    if (req.method === "GET") {
      const accepted = await hasPolicyAcceptance({
        userId: user.id,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      });
      return res.status(200).json({
        accepted,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      });
    }

    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    } catch {
      throw new ApiError(400, "Confirm the current Terms and Privacy Policy through Cova.");
    }
    if (body.termsVersion !== CURRENT_TERMS_VERSION || body.privacyVersion !== CURRENT_PRIVACY_VERSION) {
      throw new ApiError(400, "Confirm the current Terms and Privacy Policy through Cova.");
    }
    const termsVersion = CURRENT_TERMS_VERSION;
    const privacyVersion = CURRENT_PRIVACY_VERSION;

    await recordPolicyAcceptance({ userId: user.id, termsVersion, privacyVersion });
    return res.status(200).json({ accepted: true, termsVersion, privacyVersion });
  } catch (error) {
    return sendApiError(res, error, "Cova could not record policy acceptance.");
  }
}
