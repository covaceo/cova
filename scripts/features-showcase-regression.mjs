import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = async (path) => {
  try {
    return await readFile(join(root, path), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
};
// Git blobs use LF; Windows checkouts may use CRLF. Protect content, not checkout encoding.
const digest = (source) => createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex");
assert.equal(digest("protected\r\ncontent\r\n"), digest("protected\ncontent\n"), "Preservation hashes must be checkout-independent.");
assert.notEqual(digest("protected\ncontent\n"), digest("changed\ncontent\n"), "Line-ending normalization must still reject content edits.");

const [packageJson, marketingPages, features, css, main, hero, story, plans, landingCss, browserAudit] = await Promise.all([
  read("package.json"),
  read("src/components/MarketingPages.tsx"),
  read("src/components/FeaturesShowcasePage.tsx"),
  read("src/styles/featuresShowcase.css"),
  read("src/main.tsx"),
  read("src/components/MarketingHero.tsx"),
  read("src/components/StoryStrip.tsx"),
  read("src/components/PlanSections.tsx"),
  read("src/styles/threeUiLanding.css"),
  read("scripts/features-showcase-browser-regression.mjs"),
]);

assert.match(packageJson, /"test":\s*"[^"]*test:features-showcase/, "The aggregate suite must include the Features showcase contract.");
assert.match(packageJson, /"test:features-showcase":\s*"node scripts\/features-showcase-regression\.mjs"/);
assert.match(packageJson, /"test":\s*"[^"]*test:features-showcase-browser/, "The aggregate suite must run rendered Features behavior.");
assert.match(packageJson, /"test:features-showcase-browser":\s*"npm run build && node scripts\/features-showcase-browser-regression\.mjs"/);

assert.equal(digest(hero), "454b49c9ee258b227e51c7404f106aafac853d365f6eac2c3417b317900fb921", "The completed landing hero must remain content-stable (LF normalized).");
assert.match(story, /data-home-story="card-first"/, "The approved homepage card-first composition must remain present beside Features.");
assert.equal(digest(plans), "57b91607c11a671e3b60d39aca912cb7812cc3a65a1db39d29cda2bc9ea8c941", "Pricing and footer source must remain content-stable (LF normalized).");
assert.equal(digest(landingCss), "4db289a9218f473065245da68623ceefc66fa82266c4d1607be438df65b457d8", "The approved landing stylesheet must remain content-stable (LF normalized).");
const pricingSection = marketingPages.slice(marketingPages.indexOf("export function PricingPage"));
assert.equal(digest(pricingSection), "df97decaa65f05ab4690d8994f8daf9734b4df548ba9e23a0f4d0e9ad72679e0", "Pricing must remain content-stable (LF normalized) inside the final marketing release.");

assert.match(marketingPages, /export \{ FeaturesPage \} from "\.\/FeaturesShowcasePage";/, "MarketingPages must hand Features to its dedicated approved owner.");
assert.doesNotMatch(marketingPages, /featureGroups|FeatureActionCard|Everything a trader needs after the trade closes|Built for review/, "The retired generic Features card grid must leave source truth.");

assert.match(features, /export function FeaturesPage/);
assert.match(features, /One account\.[\s\S]*One review system\./);
assert.match(features, /Cova turns trade history into risk review, guardrails, insights, and proof\./);
assert.match(features, /useState<FeatureId>\("risk-review"\)/, "Risk Review must be the default selected system from the approved concept.");
assert.match(features, /role="tablist"/);
assert.match(features, /aria-orientation=\{compactTabs \? "horizontal" : "vertical"\}/, "ARIA orientation must follow the rendered desktop/mobile selector axis.");
assert.match(features, /role="tab"/);
assert.match(features, /aria-selected=\{isActive\}/);
assert.match(features, /aria-controls=\{`feature-panel-\$\{feature\.id\}`\}/);
assert.match(features, /role="tabpanel"/);
assert.match(features, /aria-live="polite"/);
assert.doesNotMatch(features, /(?:initial|exit)=\{\{\s*opacity:\s*0,/, "Feature transitions must not blank the central instrument between selections.");
assert.match(features, /ArrowDown|ArrowRight/);
assert.match(features, /ArrowUp|ArrowLeft/);
assert.match(features, /event\.key === "Home"/);
assert.match(features, /event\.key === "End"/);
assert.match(features, /useReducedMotion/);
assert.match(features, /const OA_LAYOUT_SPRING = \{ type: "spring", stiffness: 550, damping: 40 \} as const;/, "Dashboard transitions must use OA's shared LAYOUT spring.");
assert.match(features, /<FeaturesTabHighlight activeId=\{activeId\}/, "The selected system retains one rail-owned surface across selections.");
const pill = await read("src/components/FeaturesTabHighlight.tsx");
assert.match(pill, /className="features-system-tab-highlight"/, "The traveling selected surface needs a dedicated visual owner.");
assert.doesNotMatch(features, /layoutId="features-oa-active-surface"/, "Do not reintroduce per-tab shared-layout remounts.");
assert.doesNotMatch(features, /features-frame-corner/, "OA dashboard anatomy should replace the decorative corner brackets.");
assert.match(features, /data-features-showcase/);
assert.match(features, /data-feature-instrument=\{activeFeature\.id\}/);
assert.match(features, /data-journal-scroll/);
assert.match(features, /className="features-journal-table"[\s\S]*tabIndex=\{0\}/, "The wide mobile journal must expose a keyboard-reachable scroll owner.");

const expectedFeatures = [
  ["trade-journal", "Trade Journal", "import", "Upload trades"],
  ["risk-review", "Risk Review", "dashboard", "Review account"],
  ["limits", "Limits", "rules", "Set limits"],
  ["insights", "Insights", "coach", "See insights"],
  ["passport", "Passport", "passport", "Open Passport"],
];
for (const [id, label, route, action] of expectedFeatures) {
  assert.match(features, new RegExp(`id: "${id}"[\\s\\S]*label: "${label}"[\\s\\S]*route: "${route}"[\\s\\S]*action: "${action}"`), `Missing approved feature wiring for ${label}.`);
}
assert.equal((features.match(/id: "(?:trade-journal|risk-review|limits|insights|passport)"/g) ?? []).length, 5, "Features must expose exactly five approved systems.");
assert.match(features, /SAMPLE REVIEW/);
assert.match(features, /IMPORTED HISTORY/);
assert.match(features, /SAMPLE \/ NOT VERIFIED/);
assert.match(features, /Cova reviews history only\. No orders\. No money movement\./);
assert.doesNotMatch(features, /liquid-glass|FeatureActionCard|LucideIcon|rounded-\[/, "The new feature explorer must not regress into generic glass/card primitives.");
assert.doesNotMatch(`${features}\n${css}`, /#18c887|#b9f5df|#f0bb91|emerald|copper/i, "Features must use Cobalt Market without legacy green or copper identity.");

assert.match(main, /import "\.\/styles\/featuresShowcase\.css";/);
assert.ok(main.indexOf('./styles/featuresShowcase.css') > main.indexOf('./styles/threeUiLanding.css'), "The scoped Features stylesheet must load after the settled landing styles.");
assert.match(css, /\.features-showcase-layout\s*\{[\s\S]*grid-template-columns:/);
assert.match(css, /--features-ink:\s*#e8eeff/);
assert.match(css, /--features-wash:\s*color-mix\(in srgb, var\(--features-ink\) 5%, transparent\)/, "OA dark neutrals must derive from Cova's polar ink.");
assert.match(css, /\.features-showcase-frame\s*\{[\s\S]*padding:\s*0\.25rem[\s\S]*border-radius:\s*18px[\s\S]*corner-shape:\s*squircle/, "The dashboard frame must use OA's restrained two-layer squircle anatomy.");
assert.match(css, /\.features-showcase-layout\s*\{[\s\S]*gap:\s*0\.25rem[\s\S]*border-radius:\s*14px/, "The page stage between OA plates must be the visible divider.");
const pillRule = css.match(/\.features-system-tab-highlight\s*\{([^}]+)\}/)?.[1];
assert.ok(pillRule, "The traveling pill must have its own style rule.");
for (const declaration of [/position:\s*absolute\s*;/, /top:\s*0\s*;/, /left:\s*0\s*;/, /border-radius:\s*999px\s*;/, /transition:\s*transform 260ms\s/]) {
  assert.match(pillRule, declaration, "The retained pill's geometry and motion must belong to its own selector.");
}
assert.match(css, /\.features-outcome-action\s*\{[\s\S]*border-radius:\s*999px/, "The primary dashboard action must use OA pill anatomy.");
assert.match(css, /\.features-outcome-action:active\s*\{[\s\S]*transform:\s*translateY\(1px\) scale\(0\.98\)/, "OA actions should physically press instead of lifting on hover.");
assert.doesNotMatch(css, /\.features-outcome-action:hover\s*\{[\s\S]{0,180}?transform:/, "OA hover must be color-only; geometry belongs to press state.");
assert.match(css, /\.features-showcase-page :where\(h1, h2, h3, strong, button\)\s*\{[\s\S]*font-weight:\s*500/, "OA's 500 weight ceiling must govern the dashboard surface.");
assert.match(css, /@media \(max-width: 1100px\)/);
assert.match(css, /@media \(min-width: 901px\) and \(max-height: 760px\)[\s\S]*\.features-showcase-layout[\s\S]*min-height:/, "Short laptops need a compact first-fold showcase instead of scrolling the headline under fixed chrome.");
assert.match(css, /@media \(max-width: 767px\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /\.features-system-tab:focus-visible/);
assert.match(css, /\.features-system-tab\[aria-selected="true"\]/);
assert.match(css, /\.features-journal-table\s*\{[\s\S]*overflow-x:\s*auto/);
assert.match(css, /\.features-journal-row\s*\{[\s\S]*min-width:\s*34rem/);
assert.match(css, /\.features-instrument-footer\s*\{[\s\S]*color:\s*rgba\(232,\s*238,\s*255,\s*0\.64\)/, "Instrument caveats need AA contrast.");
assert.match(css, /\.features-outcome-panel small\s*\{[\s\S]*color:\s*rgba\(232,\s*238,\s*255,\s*0\.64\)/, "Selected-system trust copy needs AA contrast.");
assert.match(css, /\.features-showcase-trust\s*\{[\s\S]*color:\s*rgba\(232,\s*238,\s*255,\s*0\.64\)/, "No-orders/no-money-movement copy needs AA contrast.");
assert.doesNotMatch(css, /backdrop-filter|border-radius:\s*(?:2[4-9]|[3-9]\d)px/i, "The showcase must stay matte and sharp rather than glassy or over-rounded.");

assert.match(browserAudit, /data-journal-scroll[\s\S]*scrollWidth[\s\S]*clientWidth[\s\S]*scrollLeft/, "Rendered QA must prove the mobile journal really scrolls to its Review column.");
assert.match(browserAudit, /contrastRatio[\s\S]*4\.5/, "Rendered QA must enforce AA contrast for truth and safety caveats.");
assert.match(browserAudit, /aria-orientation[\s\S]*vertical[\s\S]*horizontal/, "Rendered QA must verify selector orientation at both axes.");
assert.match(browserAudit, /import \{ preview as startPreview \} from "vite"/, "Rendered QA must own the Vite preview server in-process.");
assert.match(browserAudit, /previewServer\.httpServer\.address\(\)/);
assert.match(browserAudit, /await previewServer\.close\(\)/, "Rendered QA teardown must close the exact owned preview server.");
assert.doesNotMatch(browserAudit, /reservePort|waitForHttp|spawn\(process\.execPath/, "Rendered QA must not release a reserved port or borrow readiness from an unrelated listener.");

console.log("features-showcase-regression: isolated interactive product showcase contract passed");
