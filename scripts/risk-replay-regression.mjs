import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

const preview = read("src", "components", "RiskReplayPreview.tsx");
const styles = read("src", "styles", "riskReplayPreview.css");
const main = read("src", "main.tsx");
const html = read("index.html");

assert.match(main, /import RiskReplayPreview from "\.\/components\/RiskReplayPreview"/, "The isolated entrypoint must mount the dedicated Risk Replay preview.");
assert.match(main, /<RiskReplayPreview\s*\/>/, "The preview root must render only Risk Replay.");
assert.doesNotMatch(main, /import App from|<App\s*\/>/, "The disposable preview must not mount the regular Cova site.");
assert.doesNotMatch(main, /index\.css|riskDeskVisualSystem|workspaceRouteRefinement|operatorDossierRevamp|backtestingLab/, "The isolated preview must not load regular website style systems.");
assert.doesNotMatch(main, /instrument-serif|fontsource\/(?:manrope|inter)/, "The isolated preview must not load unused regular-site fonts.");

assert.match(preview, />SAMPLE</, "The experience must visibly label the account as SAMPLE.");
assert.match(preview, /ILLUSTRATIVE DATA/, "The experience must visibly disclose ILLUSTRATIVE DATA.");
assert.match(preview, /Replay this account/, "The entry state must expose a clear replay action.");

const evidenceBlock = preview.slice(preview.indexOf("const EVIDENCE_STOPS"), preview.indexOf("const FINAL_RULE"));
const evidenceIds = [...evidenceBlock.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(
  evidenceIds,
  ["high-water", "early-exits", "off-plan", "pressure-trade"],
  "Risk Replay must include exactly four ordered evidence states.",
);
for (const title of ["High-water mark", "Repeated early exits", "Off-plan entry", "Pressure trade"]) {
  assert.match(evidenceBlock, new RegExp(title, "i"), `Missing required evidence stop: ${title}`);
}
for (const field of ["trade:", "behavior:", "costDollars:", "costR:", "recurrence:", "whyItMatters:"]) {
  assert.equal((evidenceBlock.match(new RegExp(field, "g")) ?? []).length, 4, `Every evidence stop must define ${field}`);
}
assert.equal((preview.match(/data-evidence-stop/g) ?? []).length, 1, "The component must expose one semantic evidence-stop template.");

assert.equal((preview.match(/data-final-rule/g) ?? []).length, 1, "The result must render exactly one final next-session rule.");
assert.match(preview, /const FINAL_RULE\s*=\s*"[^"]+"/, "The next-session rule must be one deterministic sentence.");
assert.match(preview, /NEXT SESSION RULE/, "The final rule must be clearly named.");
assert.match(preview, /SAMPLE PASSPORT IMPACT/, "The final state must label its Passport impact as sample.");
assert.match(preview, /Discipline signal/, "The final state must describe discipline impact without claiming verification.");

assert.doesNotMatch(preview, /broker[ -]?verified|verified (?:broker|account|trades?)|live account|connected account|real (?:account )?results?|Raf(?:ael)?(?:'s|s)? results?/i, "The preview must not imply live, broker-verified, connected, or personal results.");
assert.doesNotMatch(styles, /\.replay-truth-labels span\s*\{\s*display:\s*none;/, "Mobile must keep ILLUSTRATIVE DATA visibly disclosed.");
assert.match(styles, /prefers-reduced-motion:\s*reduce/, "The preview must provide reduced-motion behavior.");
assert.match(preview, /onKeyDown/, "The replay path must expose keyboard stepping.");
assert.match(preview, /aria-valuenow/, "The replay progress control must expose its current value.");
assert.match(html, /Cova Risk Replay/, "The document metadata must identify the standalone concept.");

const cssColor = (name) => styles.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
const relativeLuminance = (hex) => {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
};
const contrastRatio = (foreground, background) => {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
const faint = cssColor("--replay-faint");
const surface = cssColor("--replay-surface");
assert.ok(faint && surface && contrastRatio(faint, surface) >= 4.5, "Supporting text must meet WCAG AA contrast on the dossier surface.");
const remFontSizes = [...styles.matchAll(/font-size:\s*([0-9.]+)rem/g)].map((match) => Number(match[1]));
assert.ok(Math.min(...remFontSizes) >= 0.62, "The replay must not use unusably tiny rem-based type.");

console.log("risk-replay-regression: 4 evidence states, sample truth, one rule, and claim boundaries passed");
