import Stripe from "stripe";
import { ApiError } from "./_lib/auth.js";
import { applyStripeEvent } from "./_lib/billing.js";
import { getAuthUserById, updateAuthUserAppMetadata } from "./_lib/supabase.js";

function jsonResponse(status, body) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function defaultStripeFactory(secretKey) {
  return new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 8_000 });
}

export function createBillingWebhookHandler({
  getStripe = defaultStripeFactory,
  loadUser = getAuthUserById,
  saveUserMetadata = updateAuthUserAppMetadata,
  secretKey = process.env.STRIPE_SECRET_KEY,
  webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
} = {}) {
  return async function billingWebhook(request) {
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    }
    const stripeKey = String(secretKey || "").trim();
    const endpointSecret = String(webhookSecret || "").trim();
    if (!stripeKey || !endpointSecret) {
      return jsonResponse(503, { error: "Cova billing webhook is not configured." });
    }
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return jsonResponse(400, { error: "Stripe signature is required." });
    }

    try {
      const rawBody = await request.text();
      let event;
      try {
        event = getStripe(stripeKey).webhooks.constructEvent(rawBody, signature, endpointSecret);
      } catch {
        throw new ApiError(400, "Stripe signature verification failed.");
      }
      await applyStripeEvent(event, { loadUser, saveUserMetadata });
      return jsonResponse(200, { received: true });
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      return jsonResponse(status, { error: status >= 500 ? "Cova could not apply the billing event." : error.message });
    }
  };
}

export const POST = createBillingWebhookHandler();
