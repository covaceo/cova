import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readSource(path) {
  try {
    return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  } catch {
    return "";
  }
}

const [marketingHero, riskCore, riskCoreCss] = await Promise.all([
  readSource("src/components/MarketingHero.tsx"),
  readSource("src/components/HeroRiskCore.tsx"),
  readSource("src/styles/heroRiskCore.css"),
]);

assert.ok(riskCore, "HeroRiskCore component must exist.");
assert.ok(riskCoreCss, "HeroRiskCore stylesheet must exist.");
assert.match(marketingHero, /import\s*\{\s*HeroRiskCore\s*\}\s*from\s*["']\.\/HeroRiskCore["']/, "Marketing hero should import the Risk Core.");
assert.equal((marketingHero.match(/<HeroRiskCore\s*\/>/g) ?? []).length, 1, "Marketing hero should mount exactly one Risk Core.");
assert.doesNotMatch(marketingHero, /<HeroDashboardMockup/, "The generic dashboard should no longer be the desktop hero proof.");

assert.match(riskCore, /<svg/, "Risk Core should use deterministic vector geometry rather than a raster hero asset.");
assert.doesNotMatch(riskCore, /\bCanvas\b|@react-three|from\s*["']three["']/, "Risk Core should not depend on a fragile WebGL runtime.");
assert.match(riskCore, /Sample review/, "Risk Core must label its fabricated account evidence as sample data.");
assert.match(riskCore, /Size increased after loss/, "Risk Core should name the highlighted behavioral fracture.");
assert.match(riskCore, /-\$3,840/, "Risk Core should show the sample payout impact tied to the finding.");
assert.match(riskCore, /3 occurrences/, "Risk Core should show evidence frequency, not only a dramatic label.");
assert.match(riskCore, /aria-label=["']Animated sample Cova risk core["']/, "The meaningful hero artifact should have an accessible label.");
assert.match(riskCore, /useReducedMotion/, "The entrance transition should honor reduced-motion preferences in JavaScript as well as CSS.");

assert.match(riskCoreCss, /\.hero-risk-core-stage\s*\{[\s\S]*?pointer-events:\s*none;/, "Risk Core must not intercept hero actions.");
assert.match(riskCoreCss, /\.risk-core-geometry\s*\{[\s\S]*?transform-style:\s*preserve-3d;/, "Risk Core should preserve layered dimensional geometry.");
assert.match(riskCoreCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none\s*!important;/, "Risk Core should disable cinematic loops for reduced-motion users.");
assert.match(riskCoreCss, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.hero-risk-core-stage\s*\{[\s\S]*?display:\s*none\s*!important;/, "Phones should retain the existing mobile dossier instead of shrinking the Risk Core.");
assert.doesNotMatch(riskCoreCss, /backdrop-filter/, "Risk Core should use matte product-truth material rather than fake glass.");

console.log("hero-risk-core-regression: all checks passed");
