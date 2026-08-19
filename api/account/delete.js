import Stripe from "stripe";
import { requireAuthenticatedUser, sendApiError } from "../_lib/auth.js";
import { clearCookie } from "../_lib/cookies.js";
import { deleteAuthUser, getAuthUserById } from "../_lib/supabase.js";

async function cancelStripeBillingForUser(userId) {
  const user = await getAuthUserById(userId);
  const subscriptionId = String(user?.app_metadata?.stripe_subscription_id || "");
  if (!subscriptionId) {
    return false;
  }
  if (!/^sub_[A-Za-z0-9_]+$/.test(subscriptionId)) {
    throw new Error("Stored Stripe subscription is invalid.");
  }
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secretKey) {
    throw new Error("Stripe billing cancellation is not configured.");
  }
  const stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 8_000 });
  await stripe.subscriptions.cancel(subscriptionId);
  return true;
}

export function createDeleteAccountHandler({
  authenticate = requireAuthenticatedUser,
  cancelBilling = cancelStripeBillingForUser,
  deleteUser = deleteAuthUser,
} = {}) {
  return async function deleteAccountHandler(req, res) {
    if (req.method !== "DELETE") {
      res.setHeader("Allow", "DELETE");
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const user = await authenticate(req);
      await cancelBilling(user.id);
      await deleteUser(user.id);

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Clear-Site-Data", '"cache", "cookies"');
      res.setHeader("Set-Cookie", [
        clearCookie("cova_projectx_connection"),
        clearCookie("cova_tradovate_connection"),
        clearCookie("cova_oauth_context"),
      ]);
      return res.status(200).json({ deleted: true });
    } catch (error) {
      return sendApiError(res, error, "Cova could not complete account deletion.");
    }
  };
}

export default createDeleteAccountHandler();
