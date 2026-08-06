import { requireAuthenticatedUser, requireProEntitlement, sendApiError } from "../_lib/auth.js";
import { requestRithmicStatus } from "../_lib/rithmic-service.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    requireProEntitlement(user);
    let capability = { available: false, environment: "Rithmic Test" };
    try {
      capability = await requestRithmicStatus();
    } catch {
      // Unconfigured or unreachable stays fail-closed and is represented as unavailable.
    }
    return res.status(200).json({ ok: true, ...capability });
  } catch (error) {
    return sendApiError(res, error, "Unable to check the Rithmic connector.");
  }
}
