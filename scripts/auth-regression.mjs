import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

test("login magic links cannot create a new unconsented account", () => {
  const source = read("src", "lib", "supabaseClient.ts");
  assert.match(source, /shouldCreateUser:\s*mode\s*===\s*["']signup["']/);
});

test("Supabase magic-link callbacks reserve the URL fragment for auth tokens", () => {
  const authPanels = read("src", "components", "AuthPanels.tsx");
  const helperSource = authPanels.match(/function buildSupabaseRedirectUrl\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(helperSource, "expected a dedicated callback URL builder");
  assert.match(authPanels, /sendSupabaseMagicLink\(email, buildSupabaseRedirectUrl\(\), mode\)/);
  assert.doesNotMatch(authPanels, /sendSupabaseMagicLink\(email, redirectUrl\.toString\(\), mode\)/);

  const result = runInNewContext(`
    ${helperSource}
    buildSupabaseRedirectUrl();
  `, {
    URL,
    window: {
      location: {
        href: "https://cova-auth-preview-cova3.vercel.app/#overview",
      },
    },
  });
  const redirectUrl = new URL(result);
  assert.equal(redirectUrl.origin, "https://cova-auth-preview-cova3.vercel.app");
  assert.equal(redirectUrl.pathname, "/");
  assert.equal(redirectUrl.search, "");
  assert.equal(redirectUrl.hash, "");
});

test("policy versions match the current public legal effective date", () => {
  const clientPolicy = read("src", "lib", "legal.ts");
  const serverPolicy = read("api", "_lib", "legal-policy.js");
  const legalPages = read("src", "components", "LegalPages.tsx");
  assert.match(legalPages, /EFFECTIVE_DATE\s*=\s*["']July 22, 2026["']/);
  for (const policy of [clientPolicy, serverPolicy]) {
    assert.match(policy, /CURRENT_TERMS_VERSION\s*=\s*["']2026-07-22["']/);
    assert.match(policy, /CURRENT_PRIVACY_VERSION\s*=\s*["']2026-07-22["']/);
  }
});

test("auth release documents the required public and server environments plus migration", () => {
  const envExample = read(".env.example");
  const readme = read("README.md");
  assert.match(envExample, /^VITE_SUPABASE_URL=/m);
  assert.match(envExample, /^VITE_SUPABASE_ANON_KEY=/m);
  assert.match(envExample, /^SUPABASE_SERVICE_ROLE_KEY=/m);
  assert.doesNotMatch(envExample, /COVA_AUTH_CONSENT_SECRET|CONSENT_INTENT_SIGNING_SECRET/);
  assert.match(readme, /20260807010000_auth_policy_acceptances\.sql/);
  assert.match(readme, /20260807020000_unique_broker_provider_connections\.sql/);
  assert.match(readme, /20260807030000_retire_projectx_connector\.sql/);
  assert.match(readme, /sb_secret_/);
});

function responseHarness() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function installCompleteTradovateEnvironment() {
  const fixture = {
    COVA_TOKEN_ENCRYPTION_KEY: "fixture-encryption-key",
    KV_REST_API_TOKEN: "fixture-kv-token",
    KV_REST_API_URL: "https://fixture.upstash.io",
    TRADOVATE_CLIENT_ID: "fixture-client-id",
    TRADOVATE_CLIENT_SECRET: "fixture-client-secret",
  };
  const previous = Object.fromEntries(Object.keys(fixture).map((key) => [key, process.env[key]]));
  Object.assign(process.env, fixture);
  return () => {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  };
}

test("authenticated member action records exact current policy versions with server time", async () => {
  const priorFetch = global.fetch;
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  process.env.SUPABASE_URL = "https://cova-auth.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role";
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", email: "member@example.com", app_metadata: {} }), { status: 200 });
    }
    if (String(url).includes("/rest/v1/policy_acceptances")) {
      return new Response(JSON.stringify([]), { status: 201, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const { default: handler } = await import(`../api/auth/consent.js?test=${Date.now()}`);
    const anonymousResponse = responseHarness();
    await handler({
      method: "POST",
      headers: {},
      body: { termsVersion: "2026-07-22", privacyVersion: "2026-07-22" },
    }, anonymousResponse);
    assert.equal(anonymousResponse.statusCode, 401);
    assert.equal(calls.length, 0);

    const response = responseHarness();
    await handler({
      method: "POST",
      headers: { authorization: "Bearer member-token" },
      body: { termsVersion: "2026-07-22", privacyVersion: "2026-07-22" },
    }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { accepted: true, termsVersion: "2026-07-22", privacyVersion: "2026-07-22" });
    assert.equal(calls.length, 2);
    const insertUrl = new URL(calls[1].url);
    assert.equal(insertUrl.searchParams.get("on_conflict"), "user_id,terms_version,privacy_version");
    const insert = JSON.parse(calls[1].init.body);
    assert.deepEqual(insert, {
      user_id: "11111111-1111-4111-8111-111111111111",
      terms_version: "2026-07-22",
      privacy_version: "2026-07-22",
      source: "web-signup",
    });
    assert.equal("accepted_at" in insert, false);
  } finally {
    global.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
});

test("policy acceptance migration is immutable, owner-scoped, and cascade-deleted", () => {
  const schema = read("supabase", "migrations", "20260807010000_auth_policy_acceptances.sql");
  const connectorSchema = read("supabase", "tradovate_connector.sql");
  assert.match(schema, /create table public\.policy_acceptances/i);
  assert.match(schema, /user_id uuid not null references auth\.users\s*\(id\) on delete cascade/i);
  assert.match(schema, /accepted_at timestamptz not null default now\(\)/i);
  assert.match(schema, /unique\s*\(user_id, terms_version, privacy_version\)/i);
  assert.match(schema, /enable row level security/i);
  assert.match(schema, /revoke all on public\.policy_acceptances from anon/i);
  assert.match(schema, /grant select, insert on public\.policy_acceptances to service_role/i);
  assert.match(schema, /auth\.uid\(\) = user_id/i);
  assert.match(schema, /prevent_policy_acceptance_update/i);
  assert.match(connectorSchema, /alter table public\.broker_connections[\s\S]*references auth\.users\s*\(id\) on delete cascade/i);
  assert.doesNotMatch(schema, /alter table public\.broker_connections/i);
  assert.doesNotMatch(schema, /grant insert[\s\S]*to authenticated/i);
});

test("session consent status is read from the server-owned acceptance row", async () => {
  const priorFetch = global.fetch;
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  process.env.SUPABASE_URL = "https://cova-auth.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role";
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", email: "member@example.com", app_metadata: {} }), { status: 200 });
    }
    if (String(url).includes("/rest/v1/policy_acceptances")) {
      return new Response(JSON.stringify([{ id: "acceptance-1" }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const { default: handler } = await import(`../api/auth/consent.js?status=${Date.now()}`);
    const response = responseHarness();
    await handler({ method: "GET", headers: { authorization: "Bearer member-token" } }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { accepted: true, termsVersion: "2026-07-22", privacyVersion: "2026-07-22" });
    assert.equal(calls.length, 2);
    const query = new URL(calls[1].url);
    assert.equal(query.searchParams.get("user_id"), "eq.11111111-1111-4111-8111-111111111111");
    assert.equal(query.searchParams.get("terms_version"), "eq.2026-07-22");
    assert.equal(query.searchParams.get("privacy_version"), "eq.2026-07-22");
  } finally {
    global.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
});

test("opaque Supabase secret keys are sent only as apikey and never as a JWT bearer", async () => {
  const priorFetch = global.fetch;
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let capturedHeaders;
  process.env.SUPABASE_URL = "https://cova-auth.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture_only";
  global.fetch = async (_url, init = {}) => {
    capturedHeaders = init.headers;
    return new Response(JSON.stringify([{ id: "acceptance-1" }]), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const { hasPolicyAcceptance } = await import(`../api/_lib/supabase.js?opaque-secret=${Date.now()}`);
    const accepted = await hasPolicyAcceptance({
      userId: "11111111-1111-4111-8111-111111111111",
      termsVersion: "2026-07-22",
      privacyVersion: "2026-07-22",
    });
    assert.equal(accepted, true);
    assert.equal(capturedHeaders.apikey, "sb_secret_fixture_only");
    assert.equal(capturedHeaders.Authorization, undefined);
  } finally {
    global.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
});

test("opaque Supabase secret keys are never misrepresented as JWTs during admin entitlement checks", async () => {
  const priorFetch = global.fetch;
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  process.env.SUPABASE_URL = "https://cova-auth.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture_only";
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers });
    if (String(url).includes("/auth/v1/admin/users/owner-1")) {
      return new Response(JSON.stringify({ id: "owner-1", email: "owner@example.com", app_metadata: { plan: "pro" } }), { status: 200 });
    }
    if (String(url).includes("/rest/v1/policy_acceptances")) {
      return new Response(JSON.stringify([{ id: "acceptance-1" }]), { status: 200 });
    }
    throw new Error(`unexpected entitlement call ${url}`);
  };
  try {
    const { requireProUserById } = await import(`../api/_lib/auth.js?opaque-admin=${Date.now()}`);
    const user = await requireProUserById("owner-1");
    assert.equal(user.id, "owner-1");
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.headers.apikey, "sb_secret_fixture_only");
      assert.equal(call.headers.Authorization, undefined);
    }
  } finally {
    global.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
});

test("connector APIs reject authenticated users without current server-owned assent", async () => {
  const priorFetch = global.fetch;
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://cova-auth.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role";
  global.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", email: "member@example.com", app_metadata: {} }), { status: 200 });
    }
    if (String(url).includes("/auth/v1/admin/users/")) {
      return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", email: "member@example.com", app_metadata: { plan: "pro" } }), { status: 200 });
    }
    if (String(url).includes("/rest/v1/policy_acceptances")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    throw new Error(`unexpected auth call ${url}`);
  };
  try {
    const { requirePolicyAcceptedUser, requireProUserById } = await import(`../api/_lib/auth.js?policy=${Date.now()}`);
    await assert.rejects(
      () => requirePolicyAcceptedUser({ headers: { authorization: "Bearer member-token" } }),
      (error) => error?.statusCode === 403,
    );
    await assert.rejects(
      () => requireProUserById("11111111-1111-4111-8111-111111111111"),
      (error) => error?.statusCode === 403,
    );
    for (const path of [
      ["api", "rithmic", "status.js"],
      ["api", "rithmic", "sync.js"],
      ["api", "tradovate", "connect.js"],
      ["api", "tradovate", "sync.js"],
    ]) {
      assert.match(read(...path), /requirePolicyAcceptedUser/);
    }
    const disconnectSource = read("api", "connectors", "disconnect.js");
    assert.match(disconnectSource, /requireAuthenticatedUser/);
    assert.doesNotMatch(disconnectSource, /requirePolicyAcceptedUser/);
    const connectorStatusSource = read("api", "connectors", "status.js");
    assert.match(connectorStatusSource, /requireAuthenticatedUser/);
    assert.match(connectorStatusSource, /listBrokerConnectionsForUser/);
    assert.match(connectorStatusSource, /sendTradovateStatus/);
    assert.doesNotMatch(connectorStatusSource, /requirePolicyAcceptedUser|requireProEntitlement/);
  } finally {
    global.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
});

test("restricted connector discovery is owner-scoped and never returns credentials", async () => {
  const priorFetch = global.fetch;
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  process.env.SUPABASE_URL = "https://cova-auth.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role";
  global.fetch = async (url) => {
    const requestUrl = String(url);
    calls.push(requestUrl);
    if (requestUrl.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "owner-1", email: "owner@example.com", app_metadata: {} }), { status: 200 });
    }
    if (requestUrl.includes("/rest/v1/broker_connections")) {
      return new Response(JSON.stringify([{ provider: "tradovate", status: "connected", expires_at: null, access_token_encrypted: "must-not-return" }]), { status: 200 });
    }
    throw new Error(`unexpected status call ${requestUrl}`);
  };
  try {
    const { default: handler } = await import(`../api/connectors/status.js?test=${Date.now()}`);
    const response = responseHarness();
    await handler({ method: "GET", headers: { authorization: "Bearer owner-token" } }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { providers: [{ expiresAt: null, provider: "tradovate", status: "connected" }] });
    assert.match(calls[1], /user_id=eq\.owner-1/);
    assert.match(calls[1], /select=provider%2Cstatus%2Cexpires_at/);
    assert.doesNotMatch(JSON.stringify(response.body), /access_token|must-not-return/i);
  } finally {
    global.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
});

test("provider status routes share one authenticated function within the Hobby deployment limit", async () => {
  const restoreTradovateEnv = installCompleteTradovateEnvironment();
  const apiRoot = join(root, "api");
  const endpointFiles = listFiles(apiRoot).filter((path) => {
    const relative = path.slice(apiRoot.length + 1).replaceAll("\\", "/");
    return relative.endsWith(".js") && !relative.split("/").some((part) => part.startsWith("_"));
  });
  assert.equal(endpointFiles.length, 10);

  const vercel = JSON.parse(read("vercel.json"));
  assert.deepEqual(vercel.rewrites, [
    { source: "/api/tradovate/status", destination: "/api/connectors/status?provider=tradovate" },
  ]);

  const priorFetch = global.fetch;
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://cova-auth.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role";
  global.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "owner-1", email: "owner@example.com", app_metadata: {} }), { status: 200 });
    }
    if (requestUrl.includes("/rest/v1/broker_connections")) {
      assert.match(requestUrl, /user_id=eq\.owner-1/);
      assert.match(requestUrl, /provider=eq\.tradovate/);
      assert.match(requestUrl, /id=eq\.connection-1/);
      return new Response(JSON.stringify([{ status: "connected", expires_at: "2099-08-08T00:00:00.000Z" }]), { status: 200 });
    }
    throw new Error(`unexpected consolidated status call ${requestUrl}`);
  };
  try {
    const { default: handler } = await import(`../api/connectors/status.js?provider-test=${Date.now()}`);
    const response = responseHarness();
    await handler({
      method: "GET",
      query: { provider: "tradovate" },
      headers: {
        authorization: "Bearer owner-token",
        cookie: "cova_tradovate_connection=connection-1",
      },
    }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      available: true,
      connected: true,
      provider: "Tradovate",
      status: "connected",
      expiresAt: "2099-08-08T00:00:00.000Z",
    });
  } finally {
    restoreTradovateEnv();
    global.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
});

test("Tradovate status recovers the authenticated owner's durable connection when its browser cookie is missing", async () => {
  const restoreTradovateEnv = installCompleteTradovateEnvironment();
  const priorFetch = global.fetch;
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  process.env.SUPABASE_URL = "https://cova-auth.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role";
  global.fetch = async (url) => {
    const requestUrl = String(url);
    calls.push(requestUrl);
    if (requestUrl.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "owner-1", email: "owner@example.com", app_metadata: {} }), { status: 200 });
    }
    if (requestUrl.includes("/rest/v1/broker_connections")) {
      const query = new URL(requestUrl);
      assert.equal(query.searchParams.get("user_id"), "eq.owner-1");
      assert.equal(query.searchParams.get("provider"), "eq.tradovate");
      assert.equal(query.searchParams.get("status"), "eq.connected");
      assert.equal(query.searchParams.get("limit"), "1");
      assert.equal(query.searchParams.get("id"), null);
      return new Response(JSON.stringify([{
        id: "durable-connection-1",
        provider: "tradovate",
        status: "connected",
        expires_at: "2099-08-08T00:00:00.000Z",
        access_token_encrypted: "must-not-return",
      }]), { status: 200 });
    }
    throw new Error(`unexpected recovered status call ${requestUrl}`);
  };
  try {
    const { default: handler } = await import(`../api/connectors/status.js?cookie-recovery=${Date.now()}`);
    const response = responseHarness();
    await handler({
      method: "GET",
      query: { provider: "tradovate" },
      headers: { authorization: "Bearer owner-token", cookie: "" },
    }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      available: true,
      connected: true,
      provider: "Tradovate",
      status: "connected",
      expiresAt: "2099-08-08T00:00:00.000Z",
    });
    assert.match(String(response.headers["Set-Cookie"] || ""), /^cova_tradovate_connection=durable-connection-1;/);
    assert.doesNotMatch(JSON.stringify(response.body), /access_token|must-not-return/i);
    assert.equal(calls.length, 2);
  } finally {
    restoreTradovateEnv();
    global.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
});

test("browser signup confirms policy only after Supabase authenticates the member", () => {
  const authPanels = read("src", "components", "AuthPanels.tsx");
  const app = read("src", "App.tsx");
  const legal = read("src", "lib", "legal.ts");
  assert.match(legal, /CURRENT_PRIVACY_VERSION/);
  assert.doesNotMatch(authPanels, /consent-intent|covaConsent/);
  assert.match(authPanels, /pendingPolicyConfirmation/);
  assert.match(authPanels, /onPolicyAccepted/);
  assert.match(app, /pendingSupabaseSession/);
  assert.match(app, /acceptPendingPolicies/);
  assert.match(app, /fetchPolicyAcceptance\([^)]*["']GET["']/);
  assert.match(app, /fetchPolicyAcceptance\([^)]*["']POST["']/);
  assert.match(app, /if\s*\(!consent\.accepted\)[\s\S]*setPendingSupabaseSession\(session\)/);
  assert.match(app, /consent\.accepted[\s\S]*completeAuth\(/);
});

test("sign-out inspects SDK results and purges only Cova's Supabase persistence on fallback", () => {
  const supabaseClient = read("src", "lib", "supabaseClient.ts");
  const app = read("src", "App.tsx");
  assert.match(supabaseClient, /COVA_SUPABASE_STORAGE_KEY/);
  assert.match(supabaseClient, /export async function signOutSupabase/);
  assert.match(supabaseClient, /const \{ error \} = await client\.auth\.signOut\(\)/);
  assert.match(supabaseClient, /stopAutoRefresh\(\)/);
  assert.match(supabaseClient, /export function lockSupabaseLocally/);
  assert.match(supabaseClient, /signOut\(\{ scope: ["']local["'] \}\)/);
  assert.match(supabaseClient, /localStorage\.removeItem\(COVA_SUPABASE_STORAGE_KEY\)/);
  assert.match(app, /await signOutSupabase\(\)/);
  assert.doesNotMatch(app, /auth\.signOut\(\)\.catch/);
});

test("account deletion removes the auth owner first and relies on database cascades", async () => {
  const priorFetch = global.fetch;
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  process.env.SUPABASE_URL = "https://cova-auth.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role";
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", email: "member@example.com", app_metadata: {} }), { status: 200 });
    }
    if (String(url).includes("/auth/v1/admin/users/11111111-1111-4111-8111-111111111111") && init.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected pre-delete call ${url}`);
  };
  try {
    const { default: handler } = await import(`../api/account/delete.js?test=${Date.now()}`);
    const response = responseHarness();
    await handler({ method: "DELETE", headers: { authorization: "Bearer member-token" } }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { deleted: true });
    assert.equal(calls.length, 2);
    assert.doesNotMatch(String(response.headers["Clear-Site-Data"] || ""), /storage/i);
  } finally {
    global.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
});

test("temporary auth validation failures hide data without deleting member-scoped storage", () => {
  const app = read("src", "App.tsx");
  const lockBody = app.match(/function lockWorkspace\([^)]*\)\s*\{([\s\S]*?)\n  \}\n\n  async function signOut/)?.[1] || "";
  assert.doesNotMatch(lockBody, /removeScopedStorage/);
  assert.match(app, /function purgeCurrentAccountDeviceData\(\)[\s\S]*removeScopedStorage\(STORAGE_KEY\)/);
  assert.match(app, /async function deleteAccount\(\)[\s\S]*tryPurgeCurrentAccountDeviceData\(\)[\s\S]*lockWorkspace/);
});

test("identity preparation synchronously invalidates in-flight deletion cleanup before deferred validation", () => {
  const app = read("src", "App.tsx");
  const prepareSource = app.match(/function prepareSupabaseIdentity\(session: SupabaseSession\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  assert.ok(prepareSource);

  const events = [];
  const context = {
    authGenerationRef: { current: 11 },
    identitySwitchGenerationRef: { current: 3 },
    providerSessionRef: { current: { access_token: "token-A", user: { id: "user-A" } } },
    validatedAccessTokenRef: { current: "token-A" },
    activeProviderUserIdRef: { current: "user-A" },
    pendingPolicyUserIdRef: { current: null },
    hideWorkspaceForAuthCheck: () => events.push("hide-workspace"),
    setPendingSupabaseSession: (value) => events.push(`pending:${value?.user?.id || "none"}`),
    setAuthMode: (value) => events.push(`mode:${value || "none"}`),
  };
  const executable = prepareSource.replace("session: SupabaseSession", "session");
  runInNewContext(`${executable}; globalThis.prepareSupabaseIdentity = prepareSupabaseIdentity;`, context);

  context.prepareSupabaseIdentity({ access_token: "token-B", user: { id: "user-B" } });

  assert.equal(context.authGenerationRef.current, 12);
  assert.equal(context.identitySwitchGenerationRef.current, 4);
  assert.equal(context.providerSessionRef.current, null);
  assert.equal(context.validatedAccessTokenRef.current, "");
  assert.equal(
    context.authGenerationRef.current === 11 && context.providerSessionRef.current?.user.id === "user-A",
    false,
  );
  assert.deepEqual(events, ["hide-workspace", "pending:none", "mode:none"]);
});

test("auth generation prevents stale validation from reopening a signed-out identity", () => {
  const app = read("src", "App.tsx");
  assert.match(app, /authGenerationRef/);
  assert.match(app, /providerSessionsBlockedRef/);
  assert.match(app, /isCurrentSupabaseTask/);
  assert.match(app, /completeSupabaseAuth\(session,\s*generation\)/);
  assert.match(app, /await fetchPolicyAcceptance[\s\S]*if\s*\(!isCurrentSupabaseTask/);
  assert.match(app, /switchingIdentity[\s\S]*hideWorkspaceForAuthCheck/);
  assert.doesNotMatch(app, /event === "SIGNED_IN"\)\s*\{\s*providerSessionsBlockedRef\.current = false/);
});

test("token refresh adopts the new bearer without replaying login completion", () => {
  const app = read("src", "App.tsx");
  assert.match(app, /event === "TOKEN_REFRESHED"[\s\S]*adoptSupabaseSession/);
  assert.match(app, /function adoptSupabaseSession/);
});

test("same-user refresh and sign-out preserve confirmed deletion cleanup while an identity switch blocks it", () => {
  const app = read("src", "App.tsx");
  const adoptSource = app.match(/function adoptSupabaseSession\(session: SupabaseSession\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  const prepareSource = app.match(/function prepareSupabaseIdentity\(session: SupabaseSession\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  const continuitySource = app.match(/function hasDeletionIdentityContinuity\(userId: string, identityGeneration: number\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  assert.ok(adoptSource);
  assert.ok(prepareSource);
  assert.ok(continuitySource);

  const context = {
    authGenerationRef: { current: 11 },
    identitySwitchGenerationRef: { current: 5 },
    providerSessionRef: { current: { access_token: "token-A", user: { id: "user-A", email: "a@example.com" } } },
    validatedAccessTokenRef: { current: "token-A" },
    pendingPolicyUserIdRef: { current: null },
    activeProviderUserIdRef: { current: "user-A" },
    hideWorkspaceForAuthCheck: () => undefined,
    setPendingSupabaseSession: () => undefined,
    setAuthMode: () => undefined,
    setAuthSession: () => undefined,
    getSupabaseUserPlan: () => "free",
    normalizePlan: () => "free",
  };
  const executable = `${adoptSource.replace("session: SupabaseSession", "session")}\n${prepareSource.replace("session: SupabaseSession", "session")}\n${continuitySource.replace("userId: string, identityGeneration: number", "userId, identityGeneration")}\nglobalThis.adoptSupabaseSession = adoptSupabaseSession; globalThis.prepareSupabaseIdentity = prepareSupabaseIdentity; globalThis.hasDeletionIdentityContinuity = hasDeletionIdentityContinuity;`;
  runInNewContext(executable, context);

  context.adoptSupabaseSession({ access_token: "token-A-refreshed", user: { id: "user-A", email: "a@example.com" } });
  assert.equal(context.authGenerationRef.current, 12);
  assert.equal(context.identitySwitchGenerationRef.current, 5);
  assert.equal(context.hasDeletionIdentityContinuity("user-A", 5), true);

  context.providerSessionRef.current = null;
  assert.equal(context.hasDeletionIdentityContinuity("user-A", 5), true);

  context.providerSessionRef.current = { access_token: "token-A-refreshed", user: { id: "user-A", email: "a@example.com" } };
  context.prepareSupabaseIdentity({ access_token: "token-B", user: { id: "user-B", email: "b@example.com" } });
  assert.equal(context.identitySwitchGenerationRef.current, 6);
  assert.equal(context.hasDeletionIdentityContinuity("user-A", 5), false);

  context.activeProviderUserIdRef.current = "user-B";
  context.providerSessionRef.current = { access_token: "token-B", user: { id: "user-B", email: "b@example.com" } };
  context.prepareSupabaseIdentity({ access_token: "token-A-new", user: { id: "user-A", email: "a@example.com" } });
  assert.equal(context.identitySwitchGenerationRef.current, 7);
  assert.equal(context.hasDeletionIdentityContinuity("user-A", 5), false);

  const normalDeletion = app.match(/async function deleteAccount\(\)\s*\{([\s\S]*?)\r?\n  \}\r?\n\r?\n  function signInAsDevPreview/)?.[1] || "";
  const pendingDeletion = app.match(/async function deletePendingAccount\(\)\s*\{([\s\S]*?)\r?\n  \}\r?\n\r?\n  function handleSupabaseAuthFailure/)?.[1] || "";
  assert.match(normalDeletion, /const deletionIdentityGeneration = identitySwitchGenerationRef\.current/);
  assert.match(normalDeletion, /!hasDeletionIdentityContinuity\(deletingUserId, deletionIdentityGeneration\)/);
  assert.match(pendingDeletion, /const deletionIdentityGeneration = identitySwitchGenerationRef\.current/);
  assert.match(pendingDeletion, /!hasDeletionIdentityContinuity\(session\.user\.id, deletionIdentityGeneration\)/);
});

test("sign-out locks locally before bounded remote cleanup", () => {
  const app = read("src", "App.tsx");
  const body = app.match(/async function signOut\(\)\s*\{([\s\S]*?)\r?\n  \}\r?\n\r?\n  async function deleteAccount/)?.[1] || "";
  assert.ok(body.indexOf("lockWorkspace(") >= 0 && body.indexOf("lockWorkspace(") < body.indexOf("await "));
  assert.match(body, /AbortSignal\.timeout/);
});

test("restricted verified members retain cleanup and deletion controls", () => {
  const authPanels = read("src", "components", "AuthPanels.tsx");
  assert.match(authPanels, /Check saved providers/);
  assert.match(authPanels, /Disconnect saved providers/);
  assert.match(authPanels, /Delete account/);
  assert.match(authPanels, /Sign out/);
});

test("confirmed account deletion locks locally before bounded SDK cleanup", () => {
  const app = read("src", "App.tsx");
  const body = app.match(/async function deleteAccount\(\)\s*\{([\s\S]*?)\r?\n  \}\r?\n\r?\n  function signInAsDevPreview/)?.[1] || "";
  assert.match(body, /tryPurgeCurrentAccountDeviceData/);
  assert.ok(body.indexOf("lockWorkspace(") >= 0 && body.indexOf("lockWorkspace(") < body.lastIndexOf("signOutSupabase("));
});

test("account deletion pins the validated identity and bearer across the request", () => {
  const app = read("src", "App.tsx");
  const body = app.match(/async function deleteAccount\(\)\s*\{([\s\S]*?)\r?\n  \}\r?\n\r?\n  function signInAsDevPreview/)?.[1] || "";
  assert.match(body, /const deletingUserId = authSession\.userId/);
  assert.match(body, /const deletionSession = providerSessionRef\.current/);
  assert.match(body, /deletionSession\.user\.id !== deletingUserId/);
  assert.match(body, /validatedAccessTokenRef\.current !== deletionSession\.access_token/);
  assert.match(body, /Authorization: `Bearer \$\{deletionSession\.access_token\}`/);
  assert.match(body, /const deletionIdentityGeneration = identitySwitchGenerationRef\.current/);
  assert.match(body, /authGenerationRef\.current \+= 1/);
  assert.match(body, /!hasDeletionIdentityContinuity\(deletingUserId, deletionIdentityGeneration\)/);
  assert.doesNotMatch(body, /authGenerationRef\.current !== deletionGeneration/);
  assert.doesNotMatch(body, /authorizedFetch\(["']\/api\/account\/delete/);

  const pendingBody = app.match(/async function deletePendingAccount\(\)\s*\{([\s\S]*?)\r?\n  \}\r?\n\r?\n  function handleSupabaseAuthFailure/)?.[1] || "";
  assert.match(pendingBody, /const deletionIdentityGeneration = identitySwitchGenerationRef\.current/);
  assert.match(pendingBody, /authGenerationRef\.current \+= 1/);
  assert.match(pendingBody, /!hasDeletionIdentityContinuity\(session\.user\.id, deletionIdentityGeneration\)/);
  assert.doesNotMatch(pendingBody, /authGenerationRef\.current !== deletionGeneration/);
});

test("provider reconnect is unique per owner and disconnect deletes every owner-provider credential", () => {
  const storage = read("api", "_lib", "supabase.js");
  const disconnect = read("api", "connectors", "disconnect.js");
  const migration = read("supabase", "migrations", "20260807020000_unique_broker_provider_connections.sql");
  assert.match(storage, /on_conflict["']?,\s*["']user_id,provider["']/);
  assert.match(storage, /resolution=merge-duplicates,return=representation/);
  assert.match(storage, /export async function deleteBrokerConnectionsForProvider/);
  assert.match(disconnect, /deleteBrokerConnectionsForProvider\(\{\s*provider,\s*userId:\s*user\.id\s*\}\)/);
  assert.doesNotMatch(disconnect, /parseCookies|connectionId/);
  assert.match(migration, /partition by user_id, provider/i);
  assert.match(migration, /create unique index[\s\S]*\(user_id, provider\)/i);
});

test("provider disconnect removes owner-provider credentials even without a browser cookie", async () => {
  const priorFetch = global.fetch;
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  process.env.SUPABASE_URL = "https://cova-auth.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role";
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "owner-1", email: "owner@example.com", app_metadata: {} }), { status: 200 });
    }
    if (String(url).includes("/rest/v1/broker_connections") && init.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected disconnect call ${url}`);
  };
  try {
    const { default: handler } = await import(`../api/connectors/disconnect.js?provider-delete=${Date.now()}`);
    const response = responseHarness();
    await handler({ method: "POST", headers: { authorization: "Bearer owner-token" }, body: { provider: "projectx" } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(calls.length, 2);
    const deletion = new URL(calls[1].url);
    assert.equal(calls[1].init.method, "DELETE");
    assert.equal(deletion.searchParams.get("user_id"), "eq.owner-1");
    assert.equal(deletion.searchParams.get("provider"), "eq.projectx");
    assert.equal(deletion.searchParams.has("id"), false);
  } finally {
    global.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
});

test("scoped deletion never erases an unowned legacy base record", () => {
  const storageScope = read("src", "lib", "storageScope.ts");
  const body = storageScope.match(/export function removeScopedStorage\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(body, /removeItem\(scopedStorageKey\(baseKey\)\)/);
  assert.doesNotMatch(body, /removeItem\(baseKey\)/);
});

test("auth dialog starts at the top and scrolls on narrow viewports", () => {
  const authPanels = read("src", "components", "AuthPanels.tsx");
  assert.match(authPanels, /fixed inset-0[^"\n]*items-start[^"\n]*overflow-y-auto[^"\n]*md:items-center/);
});

test("auth dialog locks background scroll and keeps modal isolation through its exit", () => {
  const authPanels = read("src", "components", "AuthPanels.tsx");
  assert.match(authPanels, /modalIsolationActive/);
  assert.match(authPanels, /onExitComplete=\{\(\) => setModalIsolationActive\(false\)\}/);
  assert.match(authPanels, /document\.body\.style\.position = "fixed"/);
  assert.match(authPanels, /document\.documentElement\.style\.overflow = "hidden"/);
  assert.match(authPanels, /window\.scrollTo\(scrollX, scrollY\)/);
  assert.match(authPanels, /overscroll-contain/);
  assert.match(authPanels, /matchMedia\("\(max-width: 767px\)"\)/);
  assert.match(authPanels, /data-auth-mobile-initial-focus/);
});
