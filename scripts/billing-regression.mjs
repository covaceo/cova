import assert from "node:assert/strict";
import test from "node:test";
import { applyStripeEvent, buildCheckoutSessionParams, normalizeStripePrice } from "../api/_lib/billing.js";
import { createBillingHandler } from "../api/billing.js";
import { createBillingWebhookHandler } from "../api/billing-webhook.js";
import { createDeleteAccountHandler } from "../api/account/delete.js";
import { getAuthUserById, updateAuthUserAppMetadata } from "../api/_lib/supabase.js";

function responseMock() {
  return {
    body: undefined,
    headers: new Map(),
    statusCode: 200,
    setHeader(name, value) {
      this.headers.set(String(name).toLowerCase(), value);
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("direct Pro checkout is server-priced, user-bound, recurring, and returns to Cova", () => {
  const params = buildCheckoutSessionParams({
    origin: "https://covadesk.com",
    priceId: "price_server_owned",
    user: { id: "user-123", email: "member@example.com", plan: "free" },
  });

  assert.equal(params.mode, "subscription");
  assert.deepEqual(params.line_items, [{ price: "price_server_owned", quantity: 1 }]);
  assert.equal(params.client_reference_id, "user-123");
  assert.equal(params.customer_email, "member@example.com");
  assert.deepEqual(params.metadata, { cova_plan: "pro", cova_user_id: "user-123" });
  assert.deepEqual(params.subscription_data?.metadata, { cova_plan: "pro", cova_user_id: "user-123" });
  assert.equal(params.success_url, "https://covadesk.com/?checkout=success&session_id={CHECKOUT_SESSION_ID}#checkout");
  assert.equal(params.cancel_url, "https://covadesk.com/?checkout=cancelled#checkout");
  assert.match(params.custom_text?.submit?.message || "", /renews automatically/i);
});

test("a zero-dollar recurring Stripe Price remains a valid test checkout offer", () => {
  assert.deepEqual(normalizeStripePrice({
    active: true,
    currency: "usd",
    id: "price_zero_test",
    recurring: { interval: "month", interval_count: 1 },
    unit_amount: 0,
  }), {
    currency: "usd",
    interval: "month",
    intervalCount: 1,
    unitAmount: 0,
  });
});

test("a completed zero-dollar Checkout Session grants Pro from a server-owned webhook", async () => {
  const writes = [];
  const result = await applyStripeEvent({
    id: "evt_checkout_zero",
    created: 1_787_000_000,
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "user-123",
        customer: "cus_123",
        metadata: { cova_plan: "pro", cova_user_id: "user-123" },
        mode: "subscription",
        payment_status: "no_payment_required",
        subscription: "sub_123",
      },
    },
  }, {
    loadUser: async () => ({ id: "user-123", app_metadata: { role: "member" } }),
    saveUserMetadata: async (userId, metadata) => writes.push({ userId, metadata }),
  });

  assert.equal(result.applied, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].userId, "user-123");
  assert.deepEqual(writes[0].metadata, {
    plan: "pro",
    role: "member",
    stripe_billing_event_created: 1_787_000_000,
    stripe_billing_event_id: "evt_checkout_zero",
    stripe_customer_id: "cus_123",
    stripe_subscription_id: "sub_123",
    stripe_subscription_status: "active",
  });
});

test("a mismatched checkout identity cannot grant Pro", async () => {
  await assert.rejects(() => applyStripeEvent({
    id: "evt_mismatch",
    created: 1_787_000_001,
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "victim-user",
        customer: "cus_attacker",
        metadata: { cova_plan: "pro", cova_user_id: "attacker-user" },
        mode: "subscription",
        payment_status: "paid",
        subscription: "sub_attacker",
      },
    },
  }, {
    loadUser: async () => { throw new Error("must not load a user"); },
    saveUserMetadata: async () => { throw new Error("must not write metadata"); },
  }), /identity/i);
});

test("subscription deletion revokes Pro and stale webhook delivery cannot overwrite newer state", async () => {
  const writes = [];
  const stale = await applyStripeEvent({
    id: "evt_old",
    created: 100,
    type: "customer.subscription.deleted",
    data: { object: { customer: "cus_123", id: "sub_123", metadata: { cova_user_id: "user-123" }, status: "canceled" } },
  }, {
    loadUser: async () => ({ id: "user-123", app_metadata: { plan: "pro", stripe_billing_event_created: 101 } }),
    saveUserMetadata: async (userId, metadata) => writes.push({ userId, metadata }),
  });
  assert.deepEqual(stale, { applied: false, reason: "stale" });
  assert.equal(writes.length, 0);

  const current = await applyStripeEvent({
    id: "evt_current",
    created: 102,
    type: "customer.subscription.deleted",
    data: { object: { customer: "cus_123", id: "sub_123", metadata: { cova_user_id: "user-123" }, status: "canceled" } },
  }, {
    loadUser: async () => ({ id: "user-123", app_metadata: { plan: "pro", stripe_billing_event_created: 101 } }),
    saveUserMetadata: async (userId, metadata) => writes.push({ userId, metadata }),
  });
  assert.equal(current.applied, true);
  assert.equal(writes[0].metadata.plan, "free");
  assert.equal(writes[0].metadata.stripe_subscription_status, "canceled");
});

test("billing config and checkout use the configured Stripe Price, including zero-dollar tests", async () => {
  const createdSessions = [];
  const stripe = {
    checkout: {
      sessions: {
        create: async (params, options) => {
          createdSessions.push({ options, params });
          return { id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" };
        },
      },
    },
    prices: {
      retrieve: async (priceId) => ({
        active: true,
        currency: "usd",
        id: priceId,
        recurring: { interval: "month", interval_count: 1 },
        unit_amount: 0,
      }),
    },
  };
  const handler = createBillingHandler({
    authenticate: async () => ({ id: "user-123", email: "member@example.com", plan: "free" }),
    environment: { APP_ORIGIN: "https://covadesk.com", STRIPE_PRO_PRICE_ID: "price_zero_test", STRIPE_SECRET_KEY: "sk_test_fixture" },
    getStripe: () => stripe,
    loadUser: async () => ({ id: "user-123", app_metadata: { stripe_customer_id: "cus_returning_123" } }),
    now: () => 1_800_000,
  });

  const configRes = responseMock();
  await handler({ method: "GET", query: { action: "config" } }, configRes);
  assert.equal(configRes.statusCode, 200);
  assert.deepEqual(configRes.body, {
    enabled: true,
    price: { currency: "usd", interval: "month", intervalCount: 1, unitAmount: 0 },
  });

  const checkoutRes = responseMock();
  await handler({ method: "POST", query: { action: "checkout" }, body: { priceId: "price_attacker" } }, checkoutRes);
  assert.equal(checkoutRes.statusCode, 200);
  assert.deepEqual(checkoutRes.body, { url: "https://checkout.stripe.com/c/pay/cs_test_123" });
  assert.equal(createdSessions.length, 1);
  assert.equal(createdSessions[0].params.line_items[0].price, "price_zero_test");
  assert.equal(createdSessions[0].params.client_reference_id, "user-123");
  assert.equal(createdSessions[0].params.customer, "cus_returning_123");
  assert.equal("customer_email" in createdSessions[0].params, false);
  assert.deepEqual(createdSessions[0].options, { idempotencyKey: "cova-pro:user-123:1" });
});

test("authoritative Pro metadata blocks a duplicate subscription even when the browser token is stale", async () => {
  let created = false;
  const handler = createBillingHandler({
    authenticate: async () => ({ id: "user-123", email: "member@example.com", plan: "free" }),
    environment: { APP_ORIGIN: "https://covadesk.com", STRIPE_PRO_PRICE_ID: "price_live", STRIPE_SECRET_KEY: "sk_test_fixture" },
    getStripe: () => ({ checkout: { sessions: { create: async () => { created = true; } } } }),
    loadUser: async () => ({ id: "user-123", app_metadata: { plan: "pro", stripe_customer_id: "cus_123" } }),
  });
  const res = responseMock();
  await handler({ method: "POST", query: { action: "checkout" } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(created, false);
});

test("the webhook verifies the untouched raw body before provisioning Pro", async () => {
  const event = {
    id: "evt_signed_zero",
    created: 1_787_000_010,
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "user-123",
        customer: "cus_123",
        metadata: { cova_plan: "pro", cova_user_id: "user-123" },
        mode: "subscription",
        payment_status: "no_payment_required",
        subscription: "sub_123",
      },
    },
  };
  const rawBody = JSON.stringify(event);
  const verified = [];
  const writes = [];
  const handler = createBillingWebhookHandler({
    getStripe: () => ({
      webhooks: {
        constructEvent(payload, signature, secret) {
          verified.push({ payload, signature, secret });
          return event;
        },
      },
    }),
    loadUser: async () => ({ id: "user-123", app_metadata: {} }),
    saveUserMetadata: async (userId, metadata) => writes.push({ userId, metadata }),
    secretKey: "sk_test_fixture",
    webhookSecret: "whsec_fixture",
  });

  const response = await handler(new Request("https://covadesk.com/api/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=fixture" },
    body: rawBody,
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.deepEqual(verified, [{ payload: rawBody, signature: "t=1,v1=fixture", secret: "whsec_fixture" }]);
  assert.equal(writes[0].metadata.plan, "pro");

  const unsignedResponse = await handler(new Request("https://covadesk.com/api/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  }));
  assert.equal(unsignedResponse.status, 400);
  assert.equal(writes.length, 1);
});

test("an authenticated member can refresh entitlement and open Stripe billing management", async () => {
  const portalCalls = [];
  const stripe = {
    billingPortal: {
      sessions: {
        create: async (params) => {
          portalCalls.push(params);
          return { url: "https://billing.stripe.com/p/session/test_123" };
        },
      },
    },
  };
  const handler = createBillingHandler({
    authenticate: async () => ({ id: "user-123", email: "member@example.com", plan: "pro" }),
    authenticateOnly: async () => ({ id: "user-123", email: "member@example.com", plan: "pro" }),
    environment: { APP_ORIGIN: "https://covadesk.com", STRIPE_PRO_PRICE_ID: "price_live", STRIPE_SECRET_KEY: "sk_test_fixture" },
    getStripe: () => stripe,
    loadUser: async () => ({
      id: "user-123",
      app_metadata: {
        plan: "pro",
        stripe_current_period_end: 1_790_000_000,
        stripe_customer_id: "cus_123",
        stripe_subscription_status: "active",
      },
    }),
  });

  const statusRes = responseMock();
  await handler({ method: "GET", query: { action: "status" } }, statusRes);
  assert.equal(statusRes.statusCode, 200);
  assert.deepEqual(statusRes.body, {
    currentPeriodEnd: 1_790_000_000,
    plan: "pro",
    subscriptionStatus: "active",
  });

  const portalRes = responseMock();
  await handler({ method: "POST", query: { action: "portal" } }, portalRes);
  assert.equal(portalRes.statusCode, 200);
  assert.deepEqual(portalRes.body, { url: "https://billing.stripe.com/p/session/test_123" });
  assert.deepEqual(portalCalls, [{ customer: "cus_123", return_url: "https://covadesk.com/#checkout" }]);
});

test("account deletion cancels Stripe billing before deleting the Cova owner", async () => {
  const order = [];
  const handler = createDeleteAccountHandler({
    authenticate: async () => ({ id: "user-123", email: "member@example.com", plan: "pro" }),
    cancelBilling: async (userId) => order.push(`cancel:${userId}`),
    deleteUser: async (userId) => order.push(`delete:${userId}`),
  });
  const res = responseMock();
  await handler({ method: "DELETE" }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { deleted: true });
  assert.deepEqual(order, ["cancel:user-123", "delete:user-123"]);
});

test("Supabase billing metadata stays server-owned and preserves the exact account owner", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://synthetic.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-fixture";
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({
      body: init.body ? JSON.parse(init.body) : null,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      method: init.method || "GET",
      url: String(url),
    });
    return new Response(JSON.stringify({ id: "user-123", app_metadata: init.body ? JSON.parse(init.body).app_metadata : { role: "member" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const user = await getAuthUserById("user-123", { fetchImpl });
    assert.equal(user.id, "user-123");
    await updateAuthUserAppMetadata("user-123", { plan: "pro", role: "member" }, { fetchImpl });
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://synthetic.supabase.test/auth/v1/admin/users/user-123");
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[1].method, "PUT");
  assert.deepEqual(requests[1].body, { app_metadata: { plan: "pro", role: "member" } });
  assert.equal(requests[1].headers.authorization, "Bearer service-role-fixture");
});
