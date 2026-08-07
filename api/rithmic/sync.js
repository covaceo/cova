import { isIP } from "node:net";
import { ApiError, requirePolicyAcceptedUser, requireProEntitlement, sendApiError } from "../_lib/auth.js";
import { acquireRithmicSyncPermit } from "../_lib/rithmic-limit.js";
import { requestRithmicSync } from "../_lib/rithmic-service.js";

const ALLOWED_LOOKBACK_DAYS = new Set([30, 90, 180]);

export function rithmicClientIp(req) {
  const value = req?.headers?.["x-forwarded-for"];
  const forwarded = Array.isArray(value) ? value[0] : String(value || "");
  const ipAddress = forwarded.split(",", 1)[0].trim();
  if (!isIP(ipAddress)) throw new ApiError(503, "Rithmic sync protection is temporarily unavailable.");
  return ipAddress;
}

function cleanBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Enter a valid Rithmic login and history range.");
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const accountKey = body.accountKey == null ? undefined : String(body.accountKey).trim();
  const lookbackDays = Number(body.lookbackDays || 90);
  if (!username || username.length > 128 || !password || password.length > 256) throw new ApiError(400, "Enter a valid Rithmic login and history range.");
  if (accountKey && !/^[A-Za-z0-9_-]{20,64}$/.test(accountKey)) throw new ApiError(400, "Enter a valid Rithmic account.");
  if (!ALLOWED_LOOKBACK_DAYS.has(lookbackDays)) throw new ApiError(400, "Choose a valid Rithmic history range.");
  return { accountKey, lookbackDays, password, username };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const user = await requirePolicyAcceptedUser(req);
    requireProEntitlement(user);
    const input = cleanBody(req.body);
    const ipAddress = rithmicClientIp(req);
    const finishIndex = Math.floor(Date.now() / 1000);
    const startIndex = finishIndex - input.lookbackDays * 24 * 60 * 60;
    let permit;
    try {
      permit = await acquireRithmicSyncPermit({ actorId: user.id, ipAddress });
    } catch {
      throw new ApiError(503, "Rithmic sync protection is temporarily unavailable.");
    }
    if (!permit.allowed) {
      res.setHeader("Retry-After", String(permit.retryAfterSeconds));
      throw new ApiError(429, "Too many Rithmic sync attempts. Wait and try again.");
    }
    let data;
    try {
      data = await requestRithmicSync({
        accountKey: input.accountKey,
        finishIndex,
        password: input.password,
        startIndex,
        systemName: "Rithmic Test",
        user: input.username,
      });
    } catch {
      throw new ApiError(502, "Rithmic sync is temporarily unavailable. Check the login and try again.");
    } finally {
      await permit.release();
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
