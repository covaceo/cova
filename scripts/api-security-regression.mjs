import assert from "node:assert/strict";
import { requireAuthenticatedUser, requireProEntitlement } from "../api/_lib/auth.js";
import { createOAuthContext, verifyOAuthContext } from "../api/_lib/oauth-context.js";
import { getAppOrigin, getTradovateRedirectUri } from "../api/_lib/urls.js";
import { getBrokerConnection, saveBrokerConnection } from "../api/_lib/supabase.js";
import projectXConnect from "../api/projectx/connect.js";
import projectXSync from "../api/projectx/sync.js";
import disconnectConnector from "../api/connectors/disconnect.js";
import logout from "../api/auth/logout.js";
import deleteAccount from "../api/account/delete.js";
import tradovateConnect from "../api/tradovate/connect.js";
import tradovateCallback from "../api/tradovate/callback.js";
import tradovateSync from "../api/tradovate/sync.js";

function responseMock() {
  return {
    body: undefined,
    headers: new Map(),
    redirectCode: undefined,
    redirectUrl: undefined,
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
    redirect(code, url) {
      this.redirectCode = code;
      this.redirectUrl = url;
      return this;
    },
  };
}

const originalFetch = globalThis.fetch;
const originalEnvironment = { ...process.env };

try {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "public-anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-test-key";
  process.env.COVA_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.OAUTH_COOKIE_SECRET = "oauth-context-test-secret";
  process.env.APP_ORIGIN = "https://covadesk.com";
  process.env.TRADOVATE_REDIRECT_URI = "https://covadesk.com/api/tradovate/callback";

  await assert.rejects(
    () => requireAuthenticatedUser({ headers: {} }),
    (error) => error?.statusCode === 401,
    "Missing bearer authentication should be rejected.",
  );

  let requestedAuth;
  globalThis.fetch = async (url, options) => {
    requestedAuth = { url: String(url), options };
    return new Response(JSON.stringify({
      id: "user-123",
      email: "member@example.com",
      app_metadata: { plan: "free" },
      user_metadata: { plan: "pro" },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const user = await requireAuthenticatedUser({ headers: { authorization: "Bearer member-token" } });
  assert.deepEqual(user, { id: "user-123", email: "member@example.com", plan: "free" });
  assert.equal(requestedAuth.options.headers.Authorization, "Bearer member-token");
  assert.match(requestedAuth.url, /\/auth\/v1\/user$/);
  assert.throws(
    () => requireProEntitlement(user),
    (error) => error?.statusCode === 403,
    "User-editable metadata must not grant direct-sync access to a Free account.",
  );
  assert.deepEqual(requireProEntitlement({ ...user, plan: "pro" }), { ...user, plan: "pro" });

  const state = "state-value";
  const context = createOAuthContext("user-123", state);
  assert.deepEqual(verifyOAuthContext(context)?.userId, "user-123");
  assert.equal(verifyOAuthContext(`${context}tampered`), null, "Tampered OAuth context should be rejected.");

  let insertedRow;
  globalThis.fetch = async (_url, options) => {
    insertedRow = JSON.parse(String(options.body));
    return new Response(JSON.stringify([insertedRow]), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };
  await saveBrokerConnection({
    accessToken: "provider-access-token",
    connectionId: "11111111-1111-4111-8111-111111111111",
    provider: "projectx",
    userId: "user-123",
  });
  assert.equal(insertedRow.user_id, "user-123", "Stored connector rows should have an owner.");
  assert.notEqual(insertedRow.access_token_encrypted, "provider-access-token", "Provider tokens should be encrypted before storage.");

  let lookupUrl;
  globalThis.fetch = async (url) => {
    lookupUrl = String(url);
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await getBrokerConnection({ connectionId: "connection-1", provider: "projectx", userId: "user-123" });
  assert.match(lookupUrl, /user_id=eq\.user-123/, "Connector lookup should be scoped to the authenticated owner.");

  for (const [label, handler, request] of [
    ["ProjectX connect", projectXConnect, { method: "POST", headers: {}, body: {} }],
    ["Connector disconnect", disconnectConnector, { method: "POST", headers: {}, body: {} }],
    ["Account delete", deleteAccount, { method: "DELETE", headers: {} }],
  ]) {
    const res = responseMock();
    await handler(request, res);
    assert.equal(res.statusCode, 401, `${label} should reject an anonymous request.`);
  }

  for (const [label, handler, request] of [
    ["ProjectX connect", projectXConnect, { method: "POST", headers: { authorization: "Bearer free-token" }, body: { userName: "fixture-user", apiKey: "fixture-api-key" } }],
    ["ProjectX sync", projectXSync, { method: "GET", headers: { authorization: "Bearer free-token", cookie: "cova_projectx_connection=fixture-connection" }, query: {} }],
    ["Tradovate connect", tradovateConnect, { method: "POST", headers: { authorization: "Bearer free-token" } }],
    ["Tradovate sync", tradovateSync, { method: "GET", headers: { authorization: "Bearer free-token", cookie: "cova_tradovate_connection=fixture-connection" }, query: {} }],
  ]) {
    const providerCalls = [];
    globalThis.fetch = async (url) => {
      const requestUrl = String(url);
      providerCalls.push(requestUrl);
      if (requestUrl.endsWith("/auth/v1/user")) {
        return new Response(JSON.stringify({
          id: "free-user",
          email: "free@example.com",
          app_metadata: { plan: "free" },
          user_metadata: { plan: "pro" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (requestUrl.includes("/rest/v1/policy_acceptances")) {
        return new Response(JSON.stringify([{ id: "acceptance-1" }]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected provider call ${requestUrl}`);
    };
    const res = responseMock();
    await handler(request, res);
    assert.equal(res.statusCode, 403, `${label} should reject an authenticated Free account.`);
    assert.equal(res.headers.get("cache-control"), "private, no-store", `${label} entitlement failures must not be cached.`);
    assert.match(res.body?.error || "", /Cova Pro is required/i);
    assert.equal(providerCalls.length, 2, `${label} must stop after authentication, policy acceptance, and entitlement checks.`);
    assert.match(providerCalls[0], /\/auth\/v1\/user$/);
    assert.match(providerCalls[1], /\/rest\/v1\/policy_acceptances/);
  }

  const connectMethodRes = responseMock();
  await tradovateConnect({ method: "GET", headers: {} }, connectMethodRes);
  assert.equal(connectMethodRes.statusCode, 405, "Tradovate OAuth initiation should not accept top-level anonymous GET requests.");

  const callbackRes = responseMock();
  await tradovateCallback({
    method: "GET",
    headers: { host: "covadesk.com", cookie: "" },
    query: { error: "access_denied", state: "wrong" },
  }, callbackRes);
  assert.equal(callbackRes.redirectCode, 302);
  assert.match(callbackRes.redirectUrl, /OAuth%20state%20validation%20failed/, "Callback should reject invalid state before processing provider denial.");

  const freeState = "free-state";
  const freeContext = createOAuthContext("free-user", freeState);
  const callbackCalls = [];
  globalThis.fetch = async (url) => {
    callbackCalls.push(String(url));
    return new Response(JSON.stringify({ id: "free-user", app_metadata: { plan: "free" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const freeCallbackRes = responseMock();
  await tradovateCallback({
    method: "GET",
    headers: { host: "covadesk.com", cookie: `cova_oauth_context=${encodeURIComponent(freeContext)}` },
    query: { code: "fixture-code", state: freeState },
  }, freeCallbackRes);
  assert.equal(freeCallbackRes.redirectCode, 302);
  assert.match(freeCallbackRes.redirectUrl, /Cova%20Pro%20is%20required/i, "Tradovate callback should recheck the current server-side plan.");
  assert.deepEqual(callbackCalls, ["https://example.supabase.co/auth/v1/admin/users/free-user"], "A downgraded callback must stop before provider token exchange or storage.");

  const pendingState = "pending-state";
  const pendingContext = createOAuthContext("free-user", pendingState);
  const disconnectCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    disconnectCalls.push({ method: options.method || "GET", url: String(url) });
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "free-user", app_metadata: { plan: "free" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url).includes("/rest/v1/policy_acceptances")) {
      return new Response(JSON.stringify([{ id: "acceptance-1" }]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(null, { status: 204 });
  };
  const disconnectRes = responseMock();
  await disconnectConnector({
    method: "POST",
    headers: {
      authorization: "Bearer free-token",
      cookie: `cova_tradovate_connection=fixture-connection;cova_oauth_context=${encodeURIComponent(pendingContext)}`,
    },
    body: { provider: "tradovate" },
  }, disconnectRes);
  assert.equal(disconnectRes.statusCode, 200);
  const disconnectCookies = Array.isArray(disconnectRes.headers.get("set-cookie"))
    ? disconnectRes.headers.get("set-cookie")
    : [disconnectRes.headers.get("set-cookie")];
  assert.ok(disconnectCookies.some((cookie) => /^cova_oauth_context=;/.test(cookie) && /Max-Age=0/.test(cookie)), "Tradovate disconnect must invalidate a pending OAuth context cookie.");
  assert.equal(disconnectCalls.filter(({ url }) => !url.endsWith("/auth/v1/user") && !url.includes("/rest/v1/policy_acceptances")).length, 1, "Tradovate disconnect should delete the retained connection once.");

  const staleCallbackCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    staleCallbackCalls.push({ method: options.method || "GET", url: String(url) });
    return new Response(null, { status: 500 });
  };
  const staleCallbackRes = responseMock();
  await tradovateCallback({
    method: "GET",
    headers: { host: "covadesk.com", cookie: "" },
    query: { code: "fixture-code", state: pendingState },
  }, staleCallbackRes);
  assert.equal(staleCallbackRes.redirectCode, 302);
  assert.match(staleCallbackRes.redirectUrl, /OAuth%20state%20validation%20failed/);
  assert.deepEqual(staleCallbackCalls, [], "A callback after disconnect must make zero entitlement, provider-token, or storage calls.");

  const disconnectAllCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    disconnectAllCalls.push({ method: options.method || "GET", url: String(url) });
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "free-user", app_metadata: { plan: "free" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url).includes("/rest/v1/policy_acceptances")) {
      return new Response(JSON.stringify([{ id: "acceptance-1" }]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(null, { status: 204 });
  };
  const disconnectAllRes = responseMock();
  await disconnectConnector({
    method: "POST",
    headers: { authorization: "Bearer free-token", cookie: `cova_oauth_context=${encodeURIComponent(pendingContext)}` },
    body: { provider: "all" },
  }, disconnectAllRes);
  const disconnectAllCookies = disconnectAllRes.headers.get("set-cookie");
  assert.ok(Array.isArray(disconnectAllCookies) && disconnectAllCookies.some((cookie) => /^cova_oauth_context=;/.test(cookie) && /Max-Age=0/.test(cookie)), "Disconnect-all must invalidate a pending OAuth context cookie.");

  const logoutRes = responseMock();
  logout({ method: "POST", headers: {} }, logoutRes);
  const logoutCookies = logoutRes.headers.get("set-cookie");
  assert.ok(Array.isArray(logoutCookies) && logoutCookies.some((cookie) => /^cova_oauth_context=;/.test(cookie) && /Max-Age=0/.test(cookie)), "Logout must invalidate a pending OAuth context cookie.");

  assert.equal(getAppOrigin({ headers: { host: "ignored.example" } }), "https://covadesk.com");
  assert.equal(getTradovateRedirectUri({ headers: {} }), "https://covadesk.com/api/tradovate/callback");

  console.log("api-security-regression: authenticated ownership and OAuth integrity passed");
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnvironment);
}
