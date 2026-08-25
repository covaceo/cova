import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resourcesPath = path.join(root, "src/components/ResourcesQuickStartPage.tsx");
const stylesPath = path.join(root, "src/styles/resourcesQuickStart.css");
const marketingPath = path.join(root, "src/components/MarketingPages.tsx");
const mainPath = path.join(root, "src/main.tsx");

assert.ok(existsSync(resourcesPath), "Resources must move into a dedicated OA quick-start owner.");
assert.ok(existsSync(stylesPath), "Resources must have one scoped late-loaded stylesheet.");

const resources = readFileSync(resourcesPath, "utf8");
const styles = readFileSync(stylesPath, "utf8");
const marketing = readFileSync(marketingPath, "utf8");
const main = readFileSync(mainPath, "utf8");

assert.match(marketing, /export \{ ResourcesPage \} from "\.\/ResourcesQuickStartPage";/, "MarketingPages must hand Resources to its dedicated owner.");
assert.match(main, /styles\/resourcesQuickStart\.css/, "The Resources stylesheet must load after settled site CSS.");
assert.match(resources, /Start with the trades you already have\./, "The route must lead with the approved launch-focused headline.");
assert.match(resources, /Upload CSV/, "The primary action must say what happens.");

const expectedSteps = [
  "Export your trades",
  "Upload and check the file",
  "Review the account",
  "Set your limits",
  "Export your Passport",
];
const actualSteps = [...resources.matchAll(/title: "([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(actualSteps, expectedSteps, "Resources must render the five approved quick-start steps in order.");

for (const route of ["import", "dashboard", "rules", "passport"]) {
  assert.match(resources, new RegExp(`go\\(\\"${route}\\"\\)`), `Resources must route to #${route}.`);
}
assert.match(resources, /support@covadesk\.com/, "Resources must expose the monitored support mailbox.");
assert.match(resources, /go\("community"\)/, "Resources must expose the real Community route.");
assert.match(resources, /SAMPLE FILE CHECK/, "Resources must show one truthful sample import instrument.");
assert.match(resources, /No orders\. No money movement\./, "Resources must preserve the product boundary beside the import path.");
assert.match(resources, /useReducedMotion/, "Resources motion must honor reduced-motion preference.");

assert.doesNotMatch(resources, /Practice|Backtest|TopstepX|Topstep|ProjectX/i, "Retired or out-of-scope product/provider paths must not return.");
assert.doesNotMatch(resources, /resource-action-card|liquid-glass|ImageAtmosphere|SectionShell|cova-story-frame-02/, "The legacy Resources shell and broken backdrop must leave the route.");
assert.doesNotMatch(resources + styles, /#18c887|#b9f5df|emerald|copper/i, "Resources must stay in Cobalt Market without retired green or copper identity.");
assert.doesNotMatch(styles, /font-weight:\s*[6-9]00/, "OA weight must stop at 500.");
assert.match(styles, /padding:\s*4px/, "The OA two-layer surface must use the page as a four-pixel stage gap.");
assert.match(styles, /border-radius:\s*999px/, "Primary actions must use OA pill anatomy.");
assert.match(styles, /#4f7dff|#6f96ff/, "Cobalt must be the single accent.");
assert.match(styles, /prefers-reduced-motion:\s*reduce/, "The stylesheet must include a reduced-motion fallback.");
assert.match(styles, /\.resources-oa-board-header span[\s\S]*?color:\s*rgba\(232, 238, 255, 0\.58\)[\s\S]*?font-size:\s*0\.68rem/, "Resources header metadata must remain readable and AA-contrast.");
assert.match(styles, /\.resources-oa-sample-header[\s\S]*?color:\s*rgba\(232, 238, 255, 0\.58\)[\s\S]*?font-size:\s*0\.66rem/, "Sample provenance must remain readable and AA-contrast.");
assert.match(styles, /\.resources-oa-file-stats dt[\s\S]*?color:\s*rgba\(232, 238, 255, 0\.58\)[\s\S]*?font-size:\s*0\.65rem/, "Import status labels must remain readable and AA-contrast.");
assert.match(styles, /\.resources-oa-mapping span[\s\S]*?color:\s*rgba\(232, 238, 255, 0\.58\)[\s\S]*?font-size:\s*0\.65rem/, "CSV mapping labels must remain readable and AA-contrast.");
assert.match(styles, /\.resources-oa-boundary\s*\{[\s\S]*?font-size:\s*0\.65rem/, "The no-orders boundary must remain readable.");

console.log("Resources OA quick-start regression passed.");
