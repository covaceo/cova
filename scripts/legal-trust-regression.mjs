import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");
const legalPagePath = join(root, "src", "components", "LegalPages.tsx");

assert.ok(existsSync(legalPagePath), "Public legal pages should exist.");

const legalPages = read("src", "components", "LegalPages.tsx");
const routes = read("src", "lib", "appRoutes.ts");
const app = read("src", "App.tsx");
const footer = read("src", "components", "PlanSections.tsx");

for (const route of ["privacy", "terms", "security"]) {
  assert.match(routes, new RegExp(`"${route}"`), `${route} should be a public route.`);
  assert.match(app, new RegExp(`section === "${route}"`), `${route} should render from App.`);
  assert.match(footer, new RegExp(`go\\("${route}"\\)`), `${route} should be linked from the public footer.`);
}

for (const heading of [
  "Privacy Policy",
  "Information we collect",
  "How we use information",
  "How we share information",
  "Data retention",
  "Your privacy rights",
  "Terms of Service",
  "Not financial advice",
  "Subscriptions and billing",
  "Warranty disclaimer",
  "Limitation of liability",
  "Security & Data Handling",
  "Broker connections",
  "Incident reporting",
]) {
  assert.match(legalPages, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `Legal pages should include: ${heading}`);
}

assert.match(legalPages, /support@covadesk\.com/g, "Legal pages should publish the verified support contact.");
assert.match(legalPages, /18 years of age|at least 18/i, "Terms should require adult users.");
assert.match(legalPages, /do not sell|does not sell/i, "Privacy Policy should state Cova's sale position.");

const authPanels = read("src", "components", "AuthPanels.tsx");
const supabaseClient = read("src", "lib", "supabaseClient.ts");
const indexHtml = read("index.html");
const mainTsx = read("src", "main.tsx");
const packageJson = read("package.json");

assert.match(authPanels, /policyAccepted/, "Signup should require an affirmative policy checkbox.");
assert.match(authPanels, /I agree to the Terms of Service and Privacy Policy/i, "Signup consent should name both controlling documents.");
assert.match(authPanels, /termsVersion/, "Signup should record the accepted policy version.");
assert.match(supabaseClient, /terms_accepted_at/, "Supabase signup metadata should record acceptance time.");
assert.match(supabaseClient, /terms_version/, "Supabase signup metadata should record the accepted version.");
assert.doesNotMatch(indexHtml, /fonts\.googleapis\.com|fonts\.gstatic\.com/, "Visitors should not contact Google merely to render typography.");
assert.match(mainTsx, /@fontsource\//, "Cova should bundle the fonts used by the interface.");
assert.match(packageJson, /"test:legal"\s*:\s*"node scripts\/legal-trust-regression\.mjs"/, "The legal trust gate should be part of package scripts.");
assert.match(packageJson, /test:legal/, "The canonical test command should run the legal trust gate.");

const requiredSecurityFiles = [
  ["api", "_lib", "auth.js"],
  ["api", "_lib", "oauth-context.js"],
  ["api", "connectors", "disconnect.js"],
  ["api", "account", "delete.js"],
  ["src", "lib", "apiClient.ts"],
];
for (const parts of requiredSecurityFiles) {
  assert.ok(existsSync(join(root, ...parts)), `${parts.join("/")} should exist.`);
}

const sensitiveHandlers = [
  ["api", "projectx", "connect.js"],
  ["api", "projectx", "status.js"],
  ["api", "projectx", "sync.js"],
  ["api", "tradovate", "connect.js"],
  ["api", "tradovate", "status.js"],
  ["api", "tradovate", "sync.js"],
  ["api", "connectors", "disconnect.js"],
  ["api", "account", "delete.js"],
];
for (const parts of sensitiveHandlers) {
  assert.match(read(...parts), /require(?:AuthenticatedUser|DirectSyncUser)/, `${parts.join("/")} should require a signed-in Cova user.`);
}

const callback = read("api", "tradovate", "callback.js");
const contextCheckIndex = callback.indexOf("verifyOAuthContext");
const providerErrorIndex = callback.indexOf("authError");
assert.ok(contextCheckIndex >= 0 && providerErrorIndex >= 0 && contextCheckIndex < providerErrorIndex, "OAuth context and state should be validated before provider denial is processed.");
assert.match(callback, /userId/, "Tradovate callback should bind the connection to the initiating user.");

const supabaseServer = read("api", "_lib", "supabase.js");
assert.match(supabaseServer, /user_id/, "Server connector storage should persist an owner ID.");
assert.match(supabaseServer, /deleteBrokerConnection/, "Server storage should support connector deletion.");
assert.match(supabaseServer, /deleteAuthUser/, "Server storage should support account deletion.");

const schema = read("supabase", "tradovate_connector.sql");
assert.match(schema, /user_id uuid not null/i, "Connector rows should require an owner.");
assert.match(schema, /auth\.uid\(\)/i, "Database RLS should enforce owner access.");

const apiClient = read("src", "lib", "apiClient.ts");
const importDesk = read("src", "components", "ImportDesk.tsx");
const importPanels = read("src", "components", "ImportPanels.tsx");
const workspaceShell = read("src", "components", "WorkspaceShell.tsx");
assert.match(apiClient, /Authorization/, "Connector requests should send the Supabase bearer token.");
assert.match(importDesk, /authorizedFetch/, "Trade History should use authenticated API requests.");
assert.match(importPanels, /disconnectBroker/, "Connected users should have an in-product disconnect control.");
assert.match(workspaceShell, /deleteAccount/, "Signed-in users should have an in-product account deletion control.");

const marketingHero = read("src", "components", "MarketingHero.tsx");
const dashboardBriefs = read("src", "components", "DashboardBriefs.tsx");
const workspaceSections = read("src", "components", "WorkspaceSections.tsx");
const authEnvironment = read("src", "lib", "authEnvironment.ts");
const storageScope = read("src", "lib", "storageScope.ts");
const projectXConnect = read("api", "projectx", "connect.js");
const disconnect = read("api", "connectors", "disconnect.js");
const vercelConfig = read("vercel.json");
const securityTxt = read("public", ".well-known", "security.txt");

assert.match(marketingHero, /Real customer feedback\. Individual experiences vary\./, "Permissioned customer testimonials should carry a concise experience disclosure.");
assert.match(dashboardBriefs, /Retrospective analysis only\. Not financial advice/i, "Advice-like analytics need a point-of-use disclaimer.");
assert.doesNotMatch(workspaceSections, /setVisibility|setExpiry|No expiry|24 hours/, "A local Passport PNG must not expose fake privacy or expiry controls.");
assert.match(workspaceSections, /Cova does not host, revoke, or expire the file/i, "Passport export behavior should be explicit.");
assert.match(app, /scopedStorageKey\(STORAGE_KEY\)/, "Member journal state should use an identity-scoped key.");
assert.match(app, /setActiveStorageIdentity/, "Verified sign-in should select the member storage namespace.");
assert.match(storageScope, /ACTIVE_STORAGE_IDENTITY_KEY/, "The storage namespace helper should exist.");
assert.doesNotMatch(authEnvironment, /hostname\.endsWith\("\.vercel\.app"\)/, "Vercel preview URLs must not automatically unlock Pro demo mode.");
assert.doesNotMatch(supabaseClient, /user_metadata\?\.plan/, "User-editable profile metadata must not grant Pro access.");
assert.match(projectXConnect, /provider token is not scope-limited/i, "ProjectX storage should disclose that the provider token is not technically read-only.");
assert.doesNotMatch(projectXConnect, /projectx:read:/i, "ProjectX should not persist invented read-only scopes.");
assert.match(importPanels, /apiKey: ""/, "The raw ProjectX API key should be cleared from component state after submission.");
assert.match(disconnect, /provider === "all"/, "Sign-out should be able to delete every connector record for the member.");
assert.match(vercelConfig, /Content-Security-Policy/, "Production should send a Content Security Policy.");
assert.match(vercelConfig, /Strict-Transport-Security/, "Production should send HSTS.");
assert.match(securityTxt, /support@covadesk\.com/, "security.txt should publish the security contact.");

console.log("legal-trust-regression: legal routes, consent, truthful claims, scoped storage, connector ownership, and deletion passed");
