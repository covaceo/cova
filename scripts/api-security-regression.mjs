import assert from "node:assert/strict";
import { requireAuthenticatedUser, requireProEntitlement } from "../api/_lib/auth.js";
import { createOAuthContext, verifyOAuthContext } from "../api/_lib/oauth-context.js";
import { getAppOrigin, getTradovateRedirectUri } from "../api/_lib/urls.js";
import { encryptSecret } from "../api/_lib/encryption.js";
import { getBrokerConnection, saveBrokerConnection } from "../api/_lib/supabase.js";
import disconnectConnector from "../api/connectors/disconnect.js";
import logout from "../api/auth/logout.js";
import deleteAccount from "../api/account/delete.js";
import tradovateConnect from "../api/tradovate/connect.js";
import tradovateCallback from "../api/tradovate/callback.js";
import tradovateSync, { serializeTradovateSyncPayload } from "../api/tradovate/sync.js";

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

  assert.throws(
    () => serializeTradovateSyncPayload({ provider: "Tradovate", csv: "x".repeat(2 * 1024 * 1024), trades: [] }),
    /too large to import safely/i,
    "Tradovate must bound the final serialized API response.",
  );

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
    provider: "tradovate",
    userId: "user-123",
  });
  assert.equal(insertedRow.user_id, "user-123", "Stored connector rows should have an owner.");
  assert.notEqual(insertedRow.access_token_encrypted, "provider-access-token", "Provider tokens should be encrypted before storage.");

  let lookupUrl;
  globalThis.fetch = async (url) => {
    lookupUrl = String(url);
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await getBrokerConnection({ connectionId: "connection-1", provider: "tradovate", userId: "user-123" });
  assert.match(lookupUrl, /user_id=eq\.user-123/, "Connector lookup should be scoped to the authenticated owner.");

  for (const [label, handler, request] of [
    ["Tradovate connect", tradovateConnect, { method: "POST", headers: {} }],
    ["Connector disconnect", disconnectConnector, { method: "POST", headers: {}, body: {} }],
    ["Account delete", deleteAccount, { method: "DELETE", headers: {} }],
  ]) {
    const res = responseMock();
    await handler(request, res);
    assert.equal(res.statusCode, 401, `${label} should reject an anonymous request.`);
  }

  for (const [label, handler, request] of [
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
  const callbackRedirect = new URL(callbackRes.redirectUrl);
  assert.equal(callbackRedirect.searchParams.get("message"), "OAuth state validation failed. Start the connection again from Cova.", "Callback should reject invalid state before processing provider denial.");
  assert.equal(callbackRedirect.hash, "#import", "Tradovate callback results must preserve the real import route hash.");
  assert.equal(callbackRedirect.searchParams.get("broker"), "tradovate", "Tradovate callback results must identify the provider in the URL query.");
  assert.equal(callbackRedirect.searchParams.get("brokerStatus"), "error", "Tradovate callback failures must expose a client-readable status query.");
  assert.equal(callbackRedirect.hash.includes("?"), false, "Tradovate callback results must not bury query parameters inside the route hash.");

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
  assert.equal(new URL(freeCallbackRes.redirectUrl).searchParams.get("message"), "Cova Pro is required for direct sync.", "Tradovate callback should recheck the current server-side plan.");
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
  assert.equal(new URL(staleCallbackRes.redirectUrl).searchParams.get("message"), "OAuth state validation failed. Start the connection again from Cova.");
  assert.deepEqual(staleCallbackCalls, [], "A callback after disconnect must make zero entitlement, provider-token, or storage calls.");

  process.env.TRADOVATE_CLIENT_ID = "tradovate-client";
  process.env.TRADOVATE_CLIENT_SECRET = "tradovate-secret";
  const successState = "success-state";
  const successCookie = createOAuthContext("pro-user", successState);
  let storedConnection;
  const successfulCallbackCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    successfulCallbackCalls.push(target);
    if (target.endsWith("/auth/v1/admin/users/pro-user")) {
      return new Response(JSON.stringify({ id: "pro-user", email: "pro@example.com", app_metadata: { plan: "pro" } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (target.includes("/rest/v1/policy_acceptances?")) {
      return new Response(JSON.stringify([{ id: "acceptance-1" }]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (target.includes("tradovateapi.com/auth/oauthtoken")) {
      return new Response(JSON.stringify({ accessToken: "provider-access-token", mdAccessToken: "provider-market-token", expirationTime: "2099-01-01T00:00:00.000Z" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (target.includes("/rest/v1/broker_connections") && options.method === "POST") {
      storedConnection = JSON.parse(String(options.body));
      return new Response(JSON.stringify([storedConnection]), { status: 201, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected successful callback request: ${target}`);
  };
  const successfulCallbackRes = responseMock();
  await tradovateCallback({
    method: "GET",
    headers: { host: "covadesk.com", cookie: `cova_oauth_context=${encodeURIComponent(successCookie)}` },
    query: { code: "provider-code", state: successState },
  }, successfulCallbackRes);
  const successfulRedirect = new URL(successfulCallbackRes.redirectUrl);
  assert.equal(successfulCallbackRes.redirectCode, 302);
  assert.equal(successfulRedirect.hash, "#import", "A successful credential write must return to the actual import route.");
  assert.equal(successfulRedirect.searchParams.get("broker"), "tradovate");
  assert.equal(successfulRedirect.searchParams.get("brokerStatus"), "connected", `A successful credential write must expose a client-readable connected status: ${JSON.stringify({ calls: successfulCallbackCalls, message: successfulRedirect.searchParams.get("message") })}`);
  assert.equal(storedConnection.user_id, "pro-user");
  assert.equal(storedConnection.provider, "tradovate");
  assert.equal(storedConnection.status, "connected");
  assert.ok(!JSON.stringify(storedConnection).includes("provider-access-token"), "Stored provider credentials must remain encrypted.");
  assert.equal(successfulCallbackCalls.length, 4, "Successful callback should verify entitlement and policy, exchange the code, and persist one connection.");

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

  process.env.KV_REST_API_URL = "https://cova-sync.upstash.io";
  process.env.KV_REST_API_TOKEN = "t".repeat(48);
  const throttledSyncCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    throttledSyncCalls.push(target);
    if (target.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "pro-user", app_metadata: { plan: "pro" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (target.includes("/rest/v1/policy_acceptances?")) {
      return new Response(JSON.stringify([{ id: "acceptance-1" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (target === process.env.KV_REST_API_URL) {
      return new Response(JSON.stringify({ result: [6, 1] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Tradovate throttling must stop before ${target}`);
  };
  const throttledSyncRes = responseMock();
  await tradovateSync({
    method: "GET",
    headers: {
      authorization: "Bearer pro-token",
      cookie: "cova_tradovate_connection=fixture-connection",
      "x-forwarded-for": "203.0.113.7",
    },
    query: {},
  }, throttledSyncRes);
  assert.equal(throttledSyncRes.statusCode, 429, "Tradovate sync must rate-limit repeated user or IP attempts before loading stored credentials.");
  assert.equal(throttledSyncRes.headers.get("retry-after"), "60");
  assert.equal(throttledSyncCalls.some((target) => target.includes("/rest/v1/broker_connections") || target.includes("tradovateapi.com")), false, "A throttled sync must make zero connection-store or Tradovate calls.");

  const oversizedRedisResults = [[1, 1], "OK", 1];
  const oversizedProviderSignals = [];
  const encryptedTradovateToken = encryptSecret("provider-access-token");
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "pro-user", app_metadata: { plan: "pro" } }), { status: 200 });
    }
    if (target.includes("/rest/v1/policy_acceptances?")) {
      return new Response(JSON.stringify([{ id: "acceptance-1" }]), { status: 200 });
    }
    if (target === process.env.KV_REST_API_URL) {
      return new Response(JSON.stringify({ result: oversizedRedisResults.shift() }), { status: 200 });
    }
    if (target.includes("/rest/v1/broker_connections?")) {
      return new Response(JSON.stringify([{ access_token_encrypted: encryptedTradovateToken, status: "connected" }]), { status: 200 });
    }
    if (target.includes("tradovateapi.com/v1/fill/list")) {
      oversizedProviderSignals.push(options.signal);
      return new Response("[]", { status: 200, headers: { "Content-Length": String(2 * 1024 * 1024 + 1) } });
    }
    if (target.includes("tradovateapi.com/v1/fillPair/list")) {
      oversizedProviderSignals.push(options.signal);
      return new Response("[]", { status: 200 });
    }
    throw new Error(`Unexpected bounded Tradovate request ${target}`);
  };
  const oversizedSyncRes = responseMock();
  await tradovateSync({
    method: "GET",
    headers: {
      authorization: "Bearer pro-token",
      cookie: "cova_tradovate_connection=fixture-connection",
      "x-forwarded-for": "203.0.113.7",
    },
    query: {},
  }, oversizedSyncRes);
  assert.equal(oversizedSyncRes.statusCode, 502, "Tradovate must reject a provider response whose declared body exceeds the byte ceiling.");
  assert.ok(oversizedProviderSignals.length > 0 && oversizedProviderSignals.every((signal) => signal instanceof AbortSignal), "Every Tradovate provider request must carry an abort deadline.");
  assert.equal(new Set(oversizedProviderSignals).size, 1, "All Tradovate provider requests in one sync must share one overall deadline.");

  const amplifiedOutputRedisResults = [[1, 1], "OK", 1];
  const amplifiedFillPairs = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    buyFillId: index * 2 + 1,
    sellFillId: index * 2 + 2,
    qty: 1,
  }));
  const amplifiedFills = amplifiedFillPairs.flatMap((pair) => [
    { id: pair.buyFillId, contractId: 1, qty: 1, price: 100, timestamp: "2026-01-01T10:00:00Z" },
    { id: pair.sellFillId, contractId: 1, qty: 1, price: 101, timestamp: "2026-01-01T10:01:00Z" },
  ]);
  const oversizedContractName = `NQ${"X".repeat(200_000)}`;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "pro-user", app_metadata: { plan: "pro" } }), { status: 200 });
    if (target.includes("/rest/v1/policy_acceptances?")) return new Response(JSON.stringify([{ id: "acceptance-1" }]), { status: 200 });
    if (target === process.env.KV_REST_API_URL) return new Response(JSON.stringify({ result: amplifiedOutputRedisResults.shift() }), { status: 200 });
    if (target.includes("/rest/v1/broker_connections?")) return new Response(JSON.stringify([{ access_token_encrypted: encryptedTradovateToken }]), { status: 200 });
    if (target.includes("/fill/list")) return new Response(JSON.stringify(amplifiedFills), { status: 200 });
    if (target.includes("/fillPair/list")) return new Response(JSON.stringify(amplifiedFillPairs), { status: 200 });
    if (target.includes("/contract/item")) return new Response(JSON.stringify({ id: 1, name: oversizedContractName }), { status: 200 });
    throw new Error(`Unexpected amplified Tradovate request ${target}`);
  };
  const amplifiedOutputRes = responseMock();
  await tradovateSync({
    method: "GET",
    headers: {
      authorization: "Bearer pro-token",
      cookie: "cova_tradovate_connection=fixture-connection",
      "x-forwarded-for": "203.0.113.7",
    },
    query: {},
  }, amplifiedOutputRes);
  assert.equal(amplifiedOutputRes.statusCode, 200, "Tradovate should safely normalize provider labels instead of amplifying them into the response.");
  assert.ok(Buffer.byteLength(JSON.stringify(amplifiedOutputRes.body), "utf8") <= 2 * 1024 * 1024, "Tradovate response must remain within the final JSON byte ceiling.");
  assert.ok(amplifiedOutputRes.body.trades.every((trade) => trade.notes.length <= 180), "Provider-controlled contract labels must be bounded before they are repeated in trades and CSV.");

  const aggregateBudgetRedisResults = [[1, 1], "OK", 1];
  const aggregateBudgetFills = Array.from({ length: 4 }, (_, index) => ({ id: index + 1, contractId: index + 1 }));
  const aggregateContractPayload = JSON.stringify({ name: `NQ${"Y".repeat(1_600_000)}` });
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "pro-user", app_metadata: { plan: "pro" } }), { status: 200 });
    if (target.includes("/rest/v1/policy_acceptances?")) return new Response(JSON.stringify([{ id: "acceptance-1" }]), { status: 200 });
    if (target === process.env.KV_REST_API_URL) return new Response(JSON.stringify({ result: aggregateBudgetRedisResults.shift() }), { status: 200 });
    if (target.includes("/rest/v1/broker_connections?")) return new Response(JSON.stringify([{ access_token_encrypted: encryptedTradovateToken }]), { status: 200 });
    if (target.includes("/fill/list")) return new Response(JSON.stringify(aggregateBudgetFills), { status: 200 });
    if (target.includes("/fillPair/list")) return new Response("[]", { status: 200 });
    if (target.includes("/contract/item")) return new Response(aggregateContractPayload, { status: 200 });
    throw new Error(`Unexpected aggregate-budget Tradovate request ${target}`);
  };
  const aggregateBudgetRes = responseMock();
  await tradovateSync({
    method: "GET",
    headers: {
      authorization: "Bearer pro-token",
      cookie: "cova_tradovate_connection=fixture-connection",
      "x-forwarded-for": "203.0.113.7",
    },
    query: {},
  }, aggregateBudgetRes);
  assert.equal(aggregateBudgetRes.statusCode, 502, "Tradovate must reject cumulative upstream bytes above the per-sync budget.");

  const rowBoundRedisResults = [[1, 1], "OK", 1];
  const excessiveFills = Array.from({ length: 5_001 }, (_, index) => ({ id: index + 1 }));
  let rowBoundContractCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "pro-user", app_metadata: { plan: "pro" } }), { status: 200 });
    if (target.includes("/rest/v1/policy_acceptances?")) return new Response(JSON.stringify([{ id: "acceptance-1" }]), { status: 200 });
    if (target === process.env.KV_REST_API_URL) return new Response(JSON.stringify({ result: rowBoundRedisResults.shift() }), { status: 200 });
    if (target.includes("/rest/v1/broker_connections?")) return new Response(JSON.stringify([{ access_token_encrypted: encryptedTradovateToken, status: "connected" }]), { status: 200 });
    if (target.includes("tradovateapi.com/v1/fill/list")) return new Response(JSON.stringify(excessiveFills), { status: 200 });
    if (target.includes("tradovateapi.com/v1/fillPair/list")) return new Response("[]", { status: 200 });
    if (target.includes("tradovateapi.com/v1/contract/item")) {
      rowBoundContractCalls += 1;
      return new Response("{}", { status: 200 });
    }
    throw new Error(`Unexpected row-bounded Tradovate request ${target}`);
  };
  const rowBoundSyncRes = responseMock();
  await tradovateSync({
    method: "GET",
    headers: {
      authorization: "Bearer pro-token",
      cookie: "cova_tradovate_connection=fixture-connection",
      "x-forwarded-for": "203.0.113.7",
    },
    query: {},
  }, rowBoundSyncRes);
  assert.equal(rowBoundSyncRes.statusCode, 502, "Tradovate must reject provider lists above the row ceiling.");
  assert.equal(rowBoundContractCalls, 0, "An oversized provider list must stop before contract fanout.");

  const fanoutRedisResults = [[1, 1], "OK", 1];
  const excessiveContracts = Array.from({ length: 201 }, (_, index) => ({ id: index + 1, contractId: index + 1 }));
  let fanoutContractCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "pro-user", app_metadata: { plan: "pro" } }), { status: 200 });
    if (target.includes("/rest/v1/policy_acceptances?")) return new Response(JSON.stringify([{ id: "acceptance-1" }]), { status: 200 });
    if (target === process.env.KV_REST_API_URL) return new Response(JSON.stringify({ result: fanoutRedisResults.shift() }), { status: 200 });
    if (target.includes("/rest/v1/broker_connections?")) return new Response(JSON.stringify([{ access_token_encrypted: encryptedTradovateToken, status: "connected" }]), { status: 200 });
    if (target.includes("tradovateapi.com/v1/fill/list")) return new Response(JSON.stringify(excessiveContracts), { status: 200 });
    if (target.includes("tradovateapi.com/v1/fillPair/list")) return new Response("[]", { status: 200 });
    if (target.includes("tradovateapi.com/v1/contract/item")) {
      fanoutContractCalls += 1;
      return new Response("{}", { status: 200 });
    }
    throw new Error(`Unexpected fanout-bounded Tradovate request ${target}`);
  };
  const fanoutSyncRes = responseMock();
  await tradovateSync({
    method: "GET",
    headers: {
      authorization: "Bearer pro-token",
      cookie: "cova_tradovate_connection=fixture-connection",
      "x-forwarded-for": "203.0.113.7",
    },
    query: {},
  }, fanoutSyncRes);
  assert.equal(fanoutSyncRes.statusCode, 502, "Tradovate must reject syncs above the unique-contract lookup ceiling.");
  assert.equal(fanoutContractCalls, 0, "The unique-contract ceiling must run before contract fanout begins.");

  const concurrencyRedisResults = [[1, 1], "OK", 1];
  const boundedContracts = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, contractId: index + 1 }));
  let activeContractCalls = 0;
  let maxActiveContractCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "pro-user", app_metadata: { plan: "pro" } }), { status: 200 });
    if (target.includes("/rest/v1/policy_acceptances?")) return new Response(JSON.stringify([{ id: "acceptance-1" }]), { status: 200 });
    if (target === process.env.KV_REST_API_URL) return new Response(JSON.stringify({ result: concurrencyRedisResults.shift() }), { status: 200 });
    if (target.includes("/rest/v1/broker_connections?")) return new Response(JSON.stringify([{ access_token_encrypted: encryptedTradovateToken, status: "connected" }]), { status: 200 });
    if (target.includes("tradovateapi.com/v1/fill/list")) return new Response(JSON.stringify(boundedContracts), { status: 200 });
    if (target.includes("tradovateapi.com/v1/fillPair/list")) return new Response("[]", { status: 200 });
    if (target.includes("tradovateapi.com/v1/contract/item")) {
      activeContractCalls += 1;
      maxActiveContractCalls = Math.max(maxActiveContractCalls, activeContractCalls);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeContractCalls -= 1;
      return new Response(JSON.stringify({ id: Number(new URL(target).searchParams.get("id")), name: "NQZ6" }), { status: 200 });
    }
    throw new Error(`Unexpected concurrency-bounded Tradovate request ${target}`);
  };
  const concurrencySyncRes = responseMock();
  await tradovateSync({
    method: "GET",
    headers: {
      authorization: "Bearer pro-token",
      cookie: "cova_tradovate_connection=fixture-connection",
      "x-forwarded-for": "203.0.113.7",
    },
    query: {},
  }, concurrencySyncRes);
  assert.equal(concurrencySyncRes.statusCode, 200, "A bounded Tradovate sync should still complete.");
  assert.ok(maxActiveContractCalls <= 5, `Tradovate contract lookups must cap concurrency at five, observed ${maxActiveContractCalls}.`);

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
