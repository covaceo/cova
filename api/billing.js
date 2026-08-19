import Stripe from "stripe";
import { ApiError, requireAuthenticatedUser, requirePolicyAcceptedUser, sendApiError } from "./_lib/auth.js";
import { buildCheckoutSessionParams, normalizeStripePrice } from "./_lib/billing.js";
import { getAuthUserById } from "./_lib/supabase.js";
import { getAppOrigin } from "./_lib/urls.js";

let cachedStripeKey = "";
let cachedStripe = null;

function defaultStripeFactory(secretKey) {
  if (!cachedStripe || cachedStripeKey !== secretKey) {
    cachedStripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 8_000 });
    cachedStripeKey = secretKey;
  }
  return cachedStripe;
}

function trustedStripeUrl(value, hostname, fallbackMessage) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new ApiError(502, fallbackMessage);
  }
  if (url.protocol !== "https:" || (url.hostname !== hostname && !url.hostname.endsWith(`.${hostname}`))) {
    throw new ApiError(502, fallbackMessage);
  }
  return url.toString();
}

function checkoutUrl(value) {
  return trustedStripeUrl(value, "checkout.stripe.com", "Stripe did not return a valid checkout page.");
}

function portalUrl(value) {
  return trustedStripeUrl(value, "billing.stripe.com", "Stripe did not return a valid billing page.");
}

function readAction(req) {
  const raw = req.query?.action;
  return String(Array.isArray(raw) ? raw[0] : raw || "");
}

export function createBillingHandler({
  authenticate = requirePolicyAcceptedUser,
  authenticateOnly = requireAuthenticatedUser,
  environment = process.env,
  getStripe = defaultStripeFactory,
  loadUser = getAuthUserById,
  now = Date.now,
  originForRequest,
} = {}) {
  return async function billingHandler(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    const action = readAction(req);
    try {
      const secretKey = String(environment.STRIPE_SECRET_KEY || "").trim();
      const priceId = String(environment.STRIPE_PRO_PRICE_ID || "").trim();

      if (action === "config") {
        if (req.method !== "GET") {
          res.setHeader("Allow", "GET");
          throw new ApiError(405, "Method not allowed");
        }
        if (!secretKey || !priceId) {
          return res.status(200).json({ enabled: false });
        }
        const stripe = getStripe(secretKey);
        const price = normalizeStripePrice(await stripe.prices.retrieve(priceId));
        return res.status(200).json({ enabled: true, price });
      }

      if (action === "checkout") {
        if (req.method !== "POST") {
          res.setHeader("Allow", "POST");
          throw new ApiError(405, "Method not allowed");
        }
        if (!secretKey || !priceId) {
          throw new ApiError(503, "Cova Pro checkout is not configured yet.");
        }
        const user = await authenticate(req);
        const authoritativeUser = await loadUser(user.id);
        if (user.plan === "pro" || authoritativeUser?.app_metadata?.plan === "pro") {
          throw new ApiError(409, "Cova Pro is already active on this account.");
        }
        const origin = String(originForRequest ? originForRequest(req) : (environment.APP_ORIGIN || environment.APP_URL || environment.PUBLIC_APP_URL || getAppOrigin(req))).replace(/\/$/, "");
        const stripe = getStripe(secretKey);
        const customerId = String(authoritativeUser?.app_metadata?.stripe_customer_id || "");
        const idempotencyKey = `cova-pro:${user.id}:${Math.floor(now() / 1_800_000)}`;
        const session = await stripe.checkout.sessions.create(
          buildCheckoutSessionParams({ customerId, origin, priceId, user }),
          { idempotencyKey },
        );
        return res.status(200).json({ url: checkoutUrl(session?.url) });
      }

      if (action === "status") {
        if (req.method !== "GET") {
          res.setHeader("Allow", "GET");
          throw new ApiError(405, "Method not allowed");
        }
        const user = await authenticateOnly(req);
        const authoritativeUser = await loadUser(user.id);
        const metadata = authoritativeUser?.app_metadata && typeof authoritativeUser.app_metadata === "object" ? authoritativeUser.app_metadata : {};
        return res.status(200).json({
          currentPeriodEnd: Number.isInteger(metadata.stripe_current_period_end) ? metadata.stripe_current_period_end : null,
          plan: metadata.plan === "pro" ? "pro" : "free",
          subscriptionStatus: typeof metadata.stripe_subscription_status === "string" ? metadata.stripe_subscription_status : "none",
        });
      }

      if (action === "portal") {
        if (req.method !== "POST") {
          res.setHeader("Allow", "POST");
          throw new ApiError(405, "Method not allowed");
        }
        if (!secretKey) {
          throw new ApiError(503, "Cova billing management is not configured yet.");
        }
        const user = await authenticateOnly(req);
        const authoritativeUser = await loadUser(user.id);
        const customerId = String(authoritativeUser?.app_metadata?.stripe_customer_id || "");
        if (!/^cus_[A-Za-z0-9_]+$/.test(customerId)) {
          throw new ApiError(409, "No Stripe billing profile is attached to this account.");
        }
        const origin = String(originForRequest ? originForRequest(req) : (environment.APP_ORIGIN || environment.APP_URL || environment.PUBLIC_APP_URL || getAppOrigin(req))).replace(/\/$/, "");
        const session = await getStripe(secretKey).billingPortal.sessions.create({
          customer: customerId,
          return_url: `${origin}/#checkout`,
        });
        return res.status(200).json({ url: portalUrl(session?.url) });
      }

      throw new ApiError(404, "Billing action not found.");
    } catch (error) {
      return sendApiError(res, error, "Cova billing is temporarily unavailable.");
    }
  };
}

export default createBillingHandler();
