import assert from "node:assert/strict";
import { requireAuthenticatedUser } from "../api/_lib/auth.js";
import { createOAuthContext, verifyOAuthContext } from "../api/_lib/oauth-context.js";
import { getAppOrigin, getTradovateRedirectUri } from "../api/_lib/urls.js";
import { getBrokerConnection, saveBrokerConnection } from "../api/_lib/supabase.js";
import projectXConnect from "../api/projectx/connect.js";
import disconnectConnector from "../api/connectors/disconnect.js";
import deleteAccount from "../api/account/delete.js";
import tradovateConnect from "../api/tradovate/connect.js";
import tradovateCallback from "../api/tradovate/callback.js";

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
    return new Response(JSON.stringify({ id: "user-123", email: "member@example.com" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const user = await requireAuthenticatedUser({ headers: { authorization: "Bearer member-token" } });
  assert.deepEqual(user, { id: "user-123", email: "member@example.com" });
  assert.equal(requestedAuth.options.headers.Authorization, "Bearer member-token");
  assert.match(requestedAuth.url, /\/auth\/v1\/user$/);

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
