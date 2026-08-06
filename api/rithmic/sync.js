import { ApiError, requireAuthenticatedUser, requireProEntitlement, sendApiError } from "../_lib/auth.js";
import { requestRithmicSync } from "../_lib/rithmic-service.js";

const ALLOWED_LOOKBACK_DAYS = new Set([30, 90, 180, 365]);

function cleanBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Enter a valid Rithmic login and history range.");
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const accountId = body.accountId == null ? undefined : String(body.accountId).trim();
  const lookbackDays = Number(body.lookbackDays || 90);
  if (!username || username.length > 128 || !password || password.length > 256) throw new ApiError(400, "Enter a valid Rithmic login and history range.");
  if (accountId && accountId.length > 128) throw new ApiError(400, "Enter a valid Rithmic account.");
  if (!ALLOWED_LOOKBACK_DAYS.has(lookbackDays)) throw new ApiError(400, "Choose a valid Rithmic history range.");
  return { accountId, lookbackDays, password, username };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    requireProEntitlement(user);
    const input = cleanBody(req.body);
    const finishIndex = Math.floor(Date.now() / 1000);
    const startIndex = finishIndex - input.lookbackDays * 24 * 60 * 60;
    let data;
    try {
      data = await requestRithmicSync({
        accountId: input.accountId,
        finishIndex,
        password: input.password,
        startIndex,
        systemName: "Rithmic Test",
        user: input.username,
      });
    } catch {
      throw new ApiError(502, "Rithmic sync is temporarily unavailable. Check the login and try again.");
    }
    if (data.missingPointValues.length) {
      throw new ApiError(422, "Rithmic returned incomplete contract values, so Cova did not import partial P&L.");
    }
    return res.status(200).json({
      ok: true,
      ...data,
      credentialsStored: false,
    });
  } catch (error) {
    return sendApiError(res, error, "Rithmic sync is temporarily unavailable. Check the login and try again.");
  }
}
