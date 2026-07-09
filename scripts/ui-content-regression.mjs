import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

const workspace = read("src", "components", "WorkspaceSections.tsx");
const workspaceShell = read("src", "components", "WorkspaceShell.tsx");
const appRoutes = read("src", "lib", "appRoutes.ts");
const app = read("src", "App.tsx");
const importPanels = read("src", "components", "ImportPanels.tsx");
const storyStrip = read("src", "components", "StoryStrip.tsx");
const marketingPages = read("src", "components", "MarketingPages.tsx");
const propFirms = read("src", "lib", "propFirms.ts");
const authPanels = read("src", "components", "AuthPanels.tsx");

assert.match(workspace, /Proof checked · flags found/, "Passport ledger should use mixed-state copy when any rules are flagged.");
assert.match(workspace, /analysis\.breaches\.length/, "Passport ledger heading should be tied to actual breach state, not static verified copy.");
assert.match(workspace, /Pre-session risk brief/, "Insights should be framed as a pre-session risk brief.");
assert.match(workspace, /Cap size/, "Insights should include direct action language, not generic coaching copy only.");

assert.match(importPanels, /Upload CSV first/, "Trade History should make the CSV-first path obvious.");
assert.match(importPanels, /Beta connector/, "Trade History should label connector access as beta instead of overclaiming production readiness.");
assert.match(importPanels, /data-csv-primary/, "Trade History should expose a primary CSV decision lane.");
assert.match(propFirms, /CSV-first beta/, "TopstepX connector status should be beta/framed around CSV-first fallback.");

assert.match(storyStrip, /What Cova caught/, "Homepage should include concrete product proof, not only process cards.");
assert.match(storyStrip, /Daily loss breach/, "Homepage proof should show a specific risk issue Cova catches.");
assert.match(storyStrip, /Passport proof/, "Homepage proof should connect review output to Passport proof.");

assert.match(marketingPages, /Backtesting lab/, "Backtesting should appear as a non-invasive planned product module.");
assert.match(marketingPages, /TradingView replay/, "Backtesting scope should reference TradingView replay without promising unsupported automation.");
assert.match(appRoutes, /"practice"/, "Practice/backtesting should be a real protected workspace route.");
assert.match(workspaceShell, /Practice/, "Workspace sidebar should expose the practice route.");
assert.match(app, /PracticeLab/, "App should render the PracticeLab route.");
assert.match(workspace, /Practice replay/, "PracticeLab should frame the route as active replay practice.");
assert.match(workspace, /Log practice rep/, "PracticeLab should let traders record practice reps.");
assert.match(workspace, /Live permission/, "PracticeLab should score whether a setup is ready to trade live.");
assert.match(authPanels, /Enter dev preview/, "Dev preview must remain available for Raf's review flow.");

console.log("ui-content-regression: all checks passed");
