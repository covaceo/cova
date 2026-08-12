import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

const workspace = read("src", "components", "WorkspaceShell.tsx");
const navbar = read("src", "components", "Navbar.tsx");
const dashboard = read("src", "components", "DashboardView.tsx");
const app = read("src", "App.tsx");
const sourceLabel = read("src", "lib", "tradeSourceLabel.ts");
const dashboardPreviewCss = read("src", "styles", "dashboardLeftRailPreview.css");
const visualSystem = `${read("src", "styles", "riskDeskVisualSystem.css")}\n${dashboardPreviewCss}`;
const main = read("src", "main.tsx");
const packageJson = JSON.parse(read("package.json"));

assert.match(workspace, /const workspaceNavGroups = \[/, "workspace navigation must be grouped rather than rendered as one undifferentiated list");
assert.match(dashboardPreviewCss, /@media \(max-width: 1023px\)[\s\S]*?\.workspace-top-header \.marketing-header[\s\S]*?display: none !important;/, "tablet workspace widths must not render the colliding desktop header");
assert.match(dashboardPreviewCss, /@media \(max-width: 1023px\)[\s\S]*?\.workspace-top-header \.header-mobile-brand[\s\S]*?display: flex !important;/, "tablet workspace widths must expose compact brand and menu chrome");
assert.match(dashboardPreviewCss, /@media \(max-width: 1023px\)[\s\S]*?\.workspace-top-header \.operator-mobile-menu-panel[\s\S]*?display: block !important;/, "tablet workspace menu panel must remain reachable above Tailwind's md hidden breakpoint");
for (const label of ["Review", "Discipline", "Proof"]) {
  assert.match(workspace, new RegExp(`label: \\"${label}\\"`), `workspace rail must include the ${label} group`);
}
assert.match(workspace, /workspace-sidebar-search/, "workspace rail must expose the approved compact search control");
assert.match(workspace, /aria-label="Search workspace"/, "workspace search must have an accessible name");
assert.match(workspace, /workspace-risk-status/, "account risk must render as a compact rail status row");
assert.doesNotMatch(workspace, /workspace-risk-card/, "the oversized account-risk sidebar card must be removed");
assert.match(workspace, /workspace-account-menu/, "account identity and account actions must remain pinned in a dedicated bottom area");
assert.match(workspace, /const riskScoreLabel = Number\.isFinite\(riskScore\) \? String\(riskScore\) : "--";/, "zero must remain a valid rendered risk score");
assert.match(navbar, /const riskScoreLabel = Number\.isFinite\(riskScore\) \? String\(riskScore\) : "--";/, "tablet and mobile fallback chrome must preserve a legitimate zero risk score");
assert.doesNotMatch(navbar, /riskScore \|\| "--"/, "fallback header must not collapse zero into an unavailable placeholder");
assert.match(workspace, /aria-label=\{`Cova risk score \$\{riskScoreLabel === "--" \? "not available" : riskScoreLabel\}`\}/, "risk-score accessibility copy must preserve zero and distinguish unavailable values");
assert.doesNotMatch(workspace, /riskScore \|\|/, "risk score rendering must not erase a valid zero");

assert.match(dashboard, /<h1[^>]*>Risk Desk<\/h1>/, "dashboard must use the concise approved Risk Desk page title");
assert.match(dashboard, /dashboard-range-controls/, "dashboard must expose visible review-range controls");
assert.match(dashboard, /dashboard-summary-strip/, "dashboard must lead with a compact source and risk summary strip");
assert.match(dashboard, /dashboard-instrument-grid/, "dashboard must use the approved equity-instrument and evidence grid");
assert.match(dashboard, /dashboard-review-row/, "dashboard must place the next-session review in a full-width lower row");
assert.match(dashboard, /function getDashboardSummaryAction\(analysis:/, "dashboard summary action must be derived from the selected review state");
assert.match(dashboard, /if \(!analysis\.trades\.length\) return \{ label: "Add trade history", target: "import" \};/, "an empty review must offer trade-history import rather than claim warnings exist");
assert.match(dashboard, /if \(analysis\.breaches\.length\) return \{ label: "Review warnings", target: "rules" \};/, "warning review must remain available when selected history actually has breaches");
assert.match(dashboard, /if \(analysis\.evidenceQuality\.level !== "high"\) return \{ label: "Add more trades", target: "import" \};/, "thin evidence must offer more history rather than fabricate warnings");
assert.match(dashboard, /return \{ label: "Open Passport", target: "passport" \};/, "high-quality warning-free evidence must retain the Passport path");
assert.match(dashboard, /getTradeSourceLabel\(scopedAnalysis\.trades\)/, "dashboard selected ranges must label only the rows in the selected review");
assert.match(dashboard, /label: "Review source"/, "the summary cell must state that it labels selected review provenance rather than global account state");
assert.match(dashboard, /const hasRithmicTrades = scopedAnalysis\.trades\.some/, "Rithmic attribution must follow the selected review rows");
assert.doesNotMatch(dashboard, /brokerStatus/, "connected account state must not overwrite selected-range provenance");
assert.match(app, /getAccountSourceLabel\(trades, brokerStatus\)/, "workspace account identity must use the account-level connection/source label");
assert.doesNotMatch(app, /"CSV trade review"|"Sample \+ CSV review"|"Sample funded review"/, "App must not retain a second drifting source-label classifier");
assert.match(sourceLabel, /export function getAccountSourceLabel[\s\S]*?if \(brokerStatus\?\.connected\) return `\$\{brokerStatus\.provider\} linked`;/, "the account subtitle may truthfully prioritize an active read-only connection");
assert.match(sourceLabel, /export function getTradeSourceLabel\(trades: Trade\[\]\)/, "selected review provenance must be independent of global connection state");
assert.match(sourceLabel, /trade\.source\?\.provider === "Rithmic"/, "Rithmic history must be classified explicitly");
assert.match(sourceLabel, /trade\.source\?\.provider === "Tradovate"/, "Tradovate history must not be mislabeled as CSV");
assert.match(sourceLabel, /!trade\.source\?\.provider && !trade\.id\.startsWith\("demo-"\)/, "CSV history must be limited to non-demo trades without a provider source");
assert.match(sourceLabel, /singleSourceLabels[\s\S]*?Tradovate:\s*"Tradovate history"/, "a retained Tradovate ledger must remain provider-attributed after disconnect");
assert.match(sourceLabel, /sourceLabels\.join\(" \+ "\)/, "mixed review labels must enumerate actual sample, provider, and CSV sources");
assert.doesNotMatch(dashboard, /SectionShell/, "dashboard must not inherit the oversized marketing section-shell heading treatment");
assert.doesNotMatch(dashboard, /ImageAtmosphere/, "authenticated dashboard must not use a decorative marketing-image atmosphere");

assert.match(visualSystem, /\.workspace-sidebar\s*\{[^}]*top:\s*0;[^}]*bottom:\s*0;[^}]*left:\s*0;/s, "desktop workspace rail must be flush to the viewport edges");
assert.match(visualSystem, /\.workspace-sidebar\s*\{[^}]*border-radius:\s*0;/s, "workspace rail must not be a floating rounded card");
assert.match(visualSystem, /\.workspace-sidebar-group-label/, "workspace rail group labels must have an explicit restrained style");
assert.match(visualSystem, /\.dashboard-summary-strip/, "dashboard summary strip must have a dedicated continuous-grid style");
assert.match(visualSystem, /\.dashboard-instrument-grid/, "dashboard instrument grid must have a dedicated layout contract");
assert.match(visualSystem, /\.dashboard-review-row/, "dashboard review row must have a dedicated full-width style");
const activeStateCss = dashboardPreviewCss.slice(
  dashboardPreviewCss.indexOf(".operator-workspace .workspace-sidebar-link-active {"),
  dashboardPreviewCss.indexOf(".operator-workspace .workspace-sidebar-empty"),
);
assert.match(activeStateCss, /border-color:\s*transparent\s*!important;/, "Option A active state must not render a selection outline");
assert.match(activeStateCss, /border-left:\s*1px\s+solid\s+transparent\s*!important;/, "Option A active state must not render the orange left indicator");
assert.match(activeStateCss, /background:\s*transparent\s*!important;/, "Option A active state must not render a filled selection pill");
assert.match(activeStateCss, /\.workspace-sidebar-link-active \.workspace-sidebar-copy\s*\{[^}]*font-weight:\s*650;[^}]*text-shadow:\s*0\s+0\s+12px\s+rgba\(204,\s*132,\s*88,\s*0\.1\);/s, "Option A must use restrained type lift and barely-there warmth behind the label");
assert.match(activeStateCss, /\.workspace-sidebar-link-active \.workspace-sidebar-icon\s*\{[^}]*color:\s*var\(--desk-copper\);/s, "Option A must retain the restrained copper active icon");
assert.doesNotMatch(activeStateCss, /::before|::after|animation:|box-shadow:/, "Option A must not add lines, indicators, pulses, or glowing boxes");
assert.match(main, /import "\.\/styles\/dashboardLeftRailPreview\.css";/, "approved dashboard preview styles must load after the legacy operator system");

assert.equal(packageJson.scripts["test:dashboard-shell"], "node scripts/dashboard-left-rail-regression.mjs");
assert.match(packageJson.scripts.test, /test:dashboard-shell/, "dashboard shell regression must run in the aggregate suite");

console.log("dashboard-left-rail-regression: approved rail and dashboard composition contracts passed");
