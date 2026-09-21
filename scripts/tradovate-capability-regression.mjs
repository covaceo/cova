import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import connectorStatus from "../api/connectors/status.js";
import { tradovateEnvironmentReady } from "../api/_lib/tradovate-capability.js";

const statusSource = await readFile(new URL("../api/connectors/status.js", import.meta.url), "utf8");
const connectSource = await readFile(new URL("../api/tradovate/connect.js", import.meta.url), "utf8");
const importDeskSource = await readFile(new URL("../src/components/ImportDesk.tsx", import.meta.url), "utf8");
const importPanelsSource = await readFile(new URL("../src/components/ImportPanels.tsx", import.meta.url), "utf8");
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");

const completeEnvironment = {
  COVA_TOKEN_ENCRYPTION_KEY: "test-encryption-key",
  KV_REST_API_TOKEN: "test-kv-token",
  KV_REST_API_URL: "https://example.upstash.io",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
  SUPABASE_URL: "https://example.supabase.co",
  TRADOVATE_CLIENT_ID: "test-client-id",
  TRADOVATE_CLIENT_SECRET: "test-client-secret",
};

test("Tradovate is available only when the full connect and sync environment exists", () => {
  assert.equal(tradovateEnvironmentReady(completeEnvironment), true);
  for (const key of Object.keys(completeEnvironment)) {
    const incomplete = { ...completeEnvironment };
    delete incomplete[key];
    assert.equal(tradovateEnvironmentReady(incomplete), false, `${key} must be required`);
  }
});

test("Tradovate rejects blank capability values", () => {
  assert.equal(tradovateEnvironmentReady({ ...completeEnvironment, TRADOVATE_CLIENT_SECRET: "   " }), false);
});

test("the environment template names every Tradovate capability dependency", () => {
  for (const key of Object.keys(completeEnvironment)) {
    assert.match(envExample, new RegExp(`^${key}=`, "m"), `${key} must be documented`);
  }
});

test("Tradovate status fails closed without hiding a retained owner connection", () => {
  assert.match(statusSource, /import \{ tradovateEnvironmentReady \} from "\.\.\/_lib\/tradovate-capability\.js"/);
  assert.match(statusSource, /const available = tradovateEnvironmentReady\(\)/);
  assert.match(statusSource, /available,[\s\S]*connected: true[\s\S]*configuration-unavailable/);
  assert.match(statusSource, /available,[\s\S]*connected: false[\s\S]*unavailable/);
});

test("Tradovate connect refuses partial server configuration", () => {
  assert.match(connectSource, /import \{ tradovateEnvironmentReady \} from "\.\.\/_lib\/tradovate-capability\.js"/);
  assert.match(connectSource, /if \(!tradovateEnvironmentReady\(\)\)[\s\S]*Tradovate access is not configured yet/);
});

test("Trade History discovers Tradovate capability before offering direct connect", () => {
  assert.match(importDeskSource, /const \[tradovateCapability, setTradovateCapability\] = useState\(\{ available: false, checked: false \}\)/);
  assert.match(importDeskSource, /fetchHistoryJson\(authorizedFetch, "\/api\/tradovate\/status", controller\.signal, 5000, 16384\)[\s\S]*available: data\?\.available === true, checked: true/);
  assert.match(importDeskSource, /tradovateAvailable=\{tradovateCapability\.available\}/);
  assert.match(importDeskSource, /tradovateStatusChecked=\{tradovateCapability\.checked\}/);
  assert.match(importDeskSource, /const verified = validateTradovateHistory\(data, historyAccount\)[\s\S]*verified\.window\.startDate !== historyWindow\.startDate[\s\S]*preparedImport\.commitHistory\(verified\.csv/);
  assert.match(importDeskSource, /data\?\.connected === true[\s\S]*writeBrokerStatus\(nextStatus\)/);
  assert.match(importPanelsSource, /const ready = tradovateStatusChecked && tradovateAvailable/);
  assert.match(importPanelsSource, /ready && entitlements.canUseDirectSync && connected/);
  assert.match(importPanelsSource, /connected && <button[\s\S]*?Disconnect/);
  assert.match(importPanelsSource, /if \(!ready \|\| !entitlements.canUseDirectSync/);
});

test("actual status handler supplies the owner-bound connection revision required by auto history", async () => {
  const originalFetch = globalThis.fetch;
  const previous = Object.fromEntries(Object.keys(completeEnvironment).map(key => [key, process.env[key]]));
  Object.assign(process.env, completeEnvironment);
  const response = () => ({ statusCode: 200, headers: new Map(), setHeader(key,value) { this.headers.set(key.toLowerCase(),value); }, status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; } });
  let calls = [];
  let noConnection = false;
  let currentId = "synthetic-owned-connection";
  globalThis.fetch = async (url, options = {}) => {
    const target = new URL(url); calls.push(target.pathname);
    assert.equal(target.origin, "https://example.supabase.co", "No live provider requests");
    if (target.pathname === "/auth/v1/user") return Response.json({ id: "synthetic-owner" });
    assert.equal(target.pathname, "/rest/v1/broker_connections");
    assert.equal(options.method || "GET", "GET");
    assert.equal(target.searchParams.get("user_id"), "eq.synthetic-owner");
    assert.equal(target.searchParams.get("provider"), "eq.tradovate");
    const requested = target.searchParams.get("id");
    return Response.json(noConnection || requested && requested !== `eq.${currentId}` ? [] : [{ id: currentId, status: "connected", expires_at: "2099-01-01T00:00:00.000Z", access_token_encrypted: "synthetic-never-return", refresh_token_encrypted: "synthetic-never-return", user_id: "synthetic-owner" }]);
  };
  try {
    for (const cookie of ["cova_tradovate_connection=synthetic-owned-connection", "", "cova_tradovate_connection=synthetic-foreign-connection"]) {
      const res=response();
      await connectorStatus({method:"GET",query:{provider:"tradovate"},headers:{authorization:"Bearer synthetic-member",cookie}},res);
      assert.equal(res.statusCode,200);
      assert.equal(res.body.connected,true);
      assert.equal(res.body.available,true);
      assert.equal(res.body.connectionId,currentId,"Connected status must expose the owned revision so auto import can start");
      assert.equal(res.headers.get("cache-control"),"private, no-store");
      assert.deepEqual(Object.keys(res.body).sort(),["available","connected","connectionId","expiresAt","provider","status"].sort());
      assert.ok(!JSON.stringify(res.body).includes("synthetic-never-return"));
    }
    currentId="synthetic-reconnected";
    const changed=response();
    await connectorStatus({method:"GET",query:{provider:"tradovate"},headers:{authorization:"Bearer synthetic-member",cookie:"cova_tradovate_connection=synthetic-owned-connection"}},changed);
    assert.equal(changed.body.connectionId,currentId,"Reconnect must change the revision");
    assert.match(changed.headers.get("set-cookie"),/synthetic-reconnected/);
    noConnection=true;
    const missing=response();
    await connectorStatus({method:"GET",query:{provider:"tradovate"},headers:{authorization:"Bearer synthetic-member"}},missing);
    assert.equal(missing.body.connected,false);
    assert.equal(missing.body.connectionId,undefined);
    calls=[];
    const anonymous=response();
    await connectorStatus({method:"GET",query:{provider:"tradovate"},headers:{}},anonymous);
    assert.equal(anonymous.statusCode,401);
    assert.equal(anonymous.body.connectionId,undefined);
    assert.deepEqual(calls,[]);
  } finally {
    globalThis.fetch=originalFetch;
    for (const [key,value] of Object.entries(previous)) { if(value===undefined) delete process.env[key]; else process.env[key]=value; }
  }
});
