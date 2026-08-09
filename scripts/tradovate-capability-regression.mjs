import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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
  assert.match(importDeskSource, /authorizedFetch\("\/api\/tradovate\/status"\)[\s\S]*available: response\.ok && data\?\.available === true, checked: true/);
  assert.match(importDeskSource, /tradovateAvailable=\{tradovateCapability\.available\}/);
  assert.match(importDeskSource, /tradovateStatusChecked=\{tradovateCapability\.checked\}/);
  assert.match(importDeskSource, /const verified = parseCsvDetailed\(data\.csv\)[\s\S]*verified\.issues\.length[\s\S]*verified\.trades\.length !== tradeCount[\s\S]*Tradovate returned an inconsistent trade ledger/);
  assert.match(importDeskSource, /data\?\.connected === true[\s\S]*writeBrokerStatus\(nextStatus\)/);
  assert.match(importPanelsSource, /const selectedConnected = connected && brokerStatus\?\.provider === selectedFirm\.name/);
  assert.match(importPanelsSource, /hidden sm:inline/);
  assert.match(importPanelsSource, /tradovateUnavailable \? "Stored · sync unavailable" : "Connected"/);
  assert.match(importPanelsSource, /tradovateUnavailable \? "Unavailable" : providerStatus/);
  assert.match(importPanelsSource, /tradovateAvailable && selectedConnected[\s\S]*Sync trades/);
  assert.match(importPanelsSource, /data-tradovate-unavailable/);
  assert.match(importPanelsSource, /tradovateStatusChecked && !tradovateAvailable[\s\S]*Use CSV/);
  assert.match(importPanelsSource, /selectedFirm\.id === "tradovate"[\s\S]*!tradovateAvailable[\s\S]*CSV import remains available/);
});
