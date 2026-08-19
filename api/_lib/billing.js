import { ApiError } from "./auth.js";

const BILLING_PLAN = "pro";

function requireValue(value, message) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new ApiError(503, message);
  }
  return normalized;
}

export function normalizeStripePrice(price) {
  if (!price?.active || !Number.isInteger(price.unit_amount) || price.unit_amount < 0) {
    throw new ApiError(503, "Cova Pro pricing is unavailable.");
  }
  const currency = String(price.currency || "").toLowerCase();
  const interval = String(price.recurring?.interval || "");
  const intervalCount = Number(price.recurring?.interval_count || 0);
  if (!/^[a-z]{3}$/.test(currency) || !["day", "week", "month", "year"].includes(interval) || !Number.isInteger(intervalCount) || intervalCount < 1) {
    throw new ApiError(503, "Cova Pro requires an active recurring Stripe Price.");
  }
  return { currency, interval, intervalCount, unitAmount: price.unit_amount };
}

function requiredStripeId(value, label) {
  const id = String(value || "");
  if (!id || !/^[a-z]+_[A-Za-z0-9_]+$/.test(id)) {
    throw new ApiError(400, `Stripe ${label} is invalid.`);
  }
  return id;
}

function entitlementForSubscriptionStatus(status) {
  return status === "active" || status === "trialing" ? "pro" : "free";
}

function eventEntitlement(event) {
  const object = event?.data?.object;
  if (!object || typeof object !== "object") {
    throw new ApiError(400, "Stripe event payload is invalid.");
  }

  if (event.type === "checkout.session.completed") {
    const clientUserId = String(object.client_reference_id || "");
    const metadataUserId = String(object.metadata?.cova_user_id || "");
    if (!clientUserId || clientUserId !== metadataUserId || object.metadata?.cova_plan !== BILLING_PLAN) {
      throw new ApiError(400, "Stripe checkout identity is invalid.");
    }
    if (object.mode !== "subscription" || !["paid", "no_payment_required"].includes(object.payment_status)) {
      return null;
    }
    return {
      customerId: requiredStripeId(object.customer, "customer"),
      plan: "pro",
      status: "active",
      subscriptionId: requiredStripeId(object.subscription, "subscription"),
      userId: clientUserId,
    };
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const userId = String(object.metadata?.cova_user_id || "");
    if (!userId) {
      throw new ApiError(400, "Stripe subscription identity is invalid.");
    }
    const status = event.type === "customer.subscription.deleted" ? "canceled" : String(object.status || "");
    return {
      currentPeriodEnd: Number.isInteger(object.current_period_end) ? object.current_period_end : undefined,
      customerId: requiredStripeId(object.customer, "customer"),
      plan: entitlementForSubscriptionStatus(status),
      status,
      subscriptionId: requiredStripeId(object.id, "subscription"),
      userId,
    };
  }

  return null;
}

export async function applyStripeEvent(event, { loadUser, saveUserMetadata }) {
  const eventId = requiredStripeId(event?.id, "event");
  const eventCreated = Number(event?.created);
  if (!Number.isInteger(eventCreated) || eventCreated < 1) {
    throw new ApiError(400, "Stripe event timestamp is invalid.");
  }
  const entitlement = eventEntitlement(event);
  if (!entitlement) {
    return { applied: false, reason: "ignored" };
  }
  if (typeof loadUser !== "function" || typeof saveUserMetadata !== "function") {
    throw new ApiError(503, "Cova billing storage is unavailable.");
  }

  const user = await loadUser(entitlement.userId);
  if (!user?.id || String(user.id) !== entitlement.userId) {
    throw new ApiError(400, "Stripe billing user is invalid.");
  }
  const currentMetadata = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  const priorCreated = Number(currentMetadata.stripe_billing_event_created || 0);
  if (priorCreated > eventCreated || currentMetadata.stripe_billing_event_id === eventId) {
    return { applied: false, reason: priorCreated > eventCreated ? "stale" : "duplicate" };
  }

  const nextMetadata = {
    ...currentMetadata,
    plan: entitlement.plan,
    stripe_billing_event_created: eventCreated,
    stripe_billing_event_id: eventId,
    stripe_customer_id: entitlement.customerId,
    stripe_subscription_id: entitlement.subscriptionId,
    stripe_subscription_status: entitlement.status,
  };
  if (entitlement.currentPeriodEnd !== undefined) {
    nextMetadata.stripe_current_period_end = entitlement.currentPeriodEnd;
  }
  await saveUserMetadata(entitlement.userId, nextMetadata);
  return { applied: true, plan: entitlement.plan, userId: entitlement.userId };
}

export function buildCheckoutSessionParams({ customerId, origin, priceId, user }) {
  const appOrigin = requireValue(origin, "Cova billing origin is not configured.").replace(/\/$/, "");
  const serverPriceId = requireValue(priceId, "Cova Pro billing is not configured.");
  const userId = requireValue(user?.id, "Sign in to continue.");
  const email = requireValue(user?.email, "Add an email to your Cova account before checkout.");
  const trustedCustomerId = typeof customerId === "string" && /^cus_[A-Za-z0-9_]+$/.test(customerId) ? customerId : "";
  const metadata = { cova_plan: BILLING_PLAN, cova_user_id: userId };

  return {
    mode: "subscription",
    line_items: [{ price: serverPriceId, quantity: 1 }],
    client_reference_id: userId,
    ...(trustedCustomerId ? { customer: trustedCustomerId } : { customer_email: email }),
    metadata,
    subscription_data: { metadata },
    success_url: `${appOrigin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#checkout`,
    cancel_url: `${appOrigin}/?checkout=cancelled#checkout`,
    allow_promotion_codes: false,
    billing_address_collection: "auto",
    custom_text: {
      submit: {
        message: "Cova Pro renews automatically at the price shown until you cancel. Manage or cancel billing from your Cova account.",
      },
    },
  };
}
