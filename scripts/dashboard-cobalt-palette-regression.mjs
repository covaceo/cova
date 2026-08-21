import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");
const dashboardCss = read("src", "styles", "dashboardOaDark.css");
const dashboardView = read("src", "components", "DashboardView.tsx");
const dashboardCards = read("src", "components", "DashboardCards.tsx");
const dashboardBriefs = read("src", "components", "DashboardBriefs.tsx");
const workspaceShell = read("src", "components", "WorkspaceShell.tsx");
const main = read("src", "main.tsx");
const liveDashboardSource = [dashboardView, dashboardCards, dashboardBriefs, workspaceShell].join("\n");

function parseCssColor(input) {
  const value = input.trim().toLowerCase();
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (![3, 4, 6, 8].includes(hex.length)) return null;
    const expanded = hex.length <= 4 ? [...hex].map((part) => `${part}${part}`).join("") : hex;
    const channels = [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16));
    const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
    return [...channels, Number(alpha.toFixed(6))];
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].replace(/,/g, " ").replace(/\//g, " / ").trim().split(/\s+/);
    const slash = parts.indexOf("/");
    const channels = parts.slice(0, slash === -1 ? 3 : slash).slice(0, 3).map((part) => part.endsWith("%") ? Math.round(Number(part.slice(0, -1)) * 2.55) : Math.round(Number(part)));
    if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) return null;
    const alphaPart = slash === -1 ? undefined : parts[slash + 1];
    const alpha = alphaPart === undefined ? 1 : alphaPart.endsWith("%") ? Number(alphaPart.slice(0, -1)) / 100 : Number(alphaPart);
    return [...channels, Number(alpha.toFixed(6))];
  }

  const srgb = value.match(/^color\(srgb\s+([^)]*)\)$/);
  if (srgb) {
    const parts = srgb[1].replace(/\//g, " / ").trim().split(/\s+/);
    const slash = parts.indexOf("/");
    const channels = parts.slice(0, slash === -1 ? 3 : slash).slice(0, 3).map((part) => Math.round(Number(part) * 255));
    if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) return null;
    const alpha = slash === -1 ? 1 : Number(parts[slash + 1]);
    return [...channels, Number(alpha.toFixed(6))];
  }
  return null;
}

function isForbiddenDashboardAccent(color) {
  if (!color || color[3] <= 0.04) return false;
  const [red, green, blue] = color;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;
  if (chroma <= 12) return false;
  let hue;
  if (max === red) hue = ((green - blue) / chroma) % 6;
  else if (max === green) hue = (blue - red) / chroma + 2;
  else hue = (red - green) / chroma + 4;
  hue = (hue * 60 + 360) % 360;
  const isCobaltOrPolar = hue >= 214 && hue <= 232;
  const isEstablishedLossRed = hue >= 345 || hue <= 8;
  return !isCobaltOrPolar && !isEstablishedLossRed;
}

function findForbiddenDashboardAccents(text) {
  const colors = [...text.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|color\(srgb\s+[^)]*\)/gi)]
    .map((match) => ({ source: match[0], color: parseCssColor(match[0]) }))
    .filter(({ color }) => isForbiddenDashboardAccent(color));
  return [...new Set(colors.map(({ source }) => source.toLowerCase()))].sort();
}

const normalizedColorFixtures = [
  ["#3ddc97", [61, 220, 151, 1]],
  ["rgb(61 220 151 / 75%)", [61, 220, 151, 0.75]],
  ["color(srgb 0.239216 0.862745 0.592157 / 0.5)", [61, 220, 151, 0.5]],
];
for (const [input, expected] of normalizedColorFixtures) {
  assert.deepEqual(parseCssColor(input), expected, `Palette normalization must parse ${input}`);
  assert.equal(isForbiddenDashboardAccent(parseCssColor(input)), true, `Palette normalization must reject ${input}`);
}

const requiredTokens = new Map([
  ["--oa-ink", "#e8eeff"],
  ["--oa-page", "#08090c"],
  ["--oa-inset", "#0d0f14"],
  ["--oa-rail", "#0d0f14"],
  ["--oa-card", "#171a21"],
  ["--oa-popover", "#2b303a"],
  ["--oa-primary", "#4f7dff"],
  ["--oa-primary-hover", "#6f96ff"],
  ["--oa-primary-foreground", "#08090c"],
  ["--oa-ring", "#6f96ff"],
  ["--oa-secondary", "#171a21"],
  ["--oa-positive", "#6f96ff"],
  ["--oa-danger", "#ff6578"],
]);

for (const [token, value] of requiredTokens) {
  assert.match(dashboardCss, new RegExp(`${token.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*:\\s*${value}`, "i"), `Dashboard palette must define ${token}: ${value}`);
}

const allowedHex = new Set([...requiredTokens.values()]);
const discoveredHex = new Set([...dashboardCss.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0].toLowerCase()));
assert.deepEqual([...discoveredHex].filter((value) => !allowedHex.has(value)).sort(), [], "Dashboard OA CSS must use only Cobalt Market hex tokens plus the established loss red");
assert.deepEqual(findForbiddenDashboardAccents(dashboardCss), [], "Dashboard OA CSS must not contain normalized green, copper, gold, cyan, or purple accents");

const forbiddenNames = /\b(?:copper|mint|emerald|green)\b|(?:--|[_.-])(?:copper|mint|emerald|green)(?:\b|[-_])/i;
assert.doesNotMatch(dashboardCss, forbiddenNames, "Dashboard OA CSS must not retain copper, mint, green, or emerald token/class/comment names");
assert.doesNotMatch(liveDashboardSource, /(?:emerald|green|copper|mint)|#18c887|#b9f5df/i, "Compiled dashboard owners must not emit retired green, mint, or copper class/literal markers");

assert.match(dashboardCss, /\.dashboard-equity-path\s*\{[^}]*stroke:\s*var\(--oa-primary\)/s, "The dashboard equity line must use cobalt primary");
assert.match(dashboardCss, /\.dashboard-summary-cell strong\.positive\s*\{[^}]*color:\s*var\(--oa-positive\)/s, "Positive summary states must use the non-green cobalt treatment");
assert.match(dashboardCss, /\.dashboard-review-status-ready\s*\{[^}]*color:\s*var\(--oa-positive\)/s, "Ready review state must use the non-green cobalt treatment");
assert.match(dashboardCss, /\.dashboard-summary-actions \.dashboard-summary-primary\s*\{[^}]*background:[^;]*var\(--oa-primary\)/s, "The primary dashboard action must use cobalt");
assert.match(dashboardCss, /color-scheme:\s*dark/, "Dashboard must remain dark-only");
assert.doesNotMatch(dashboardCss, /prefers-color-scheme|color-scheme:\s*light/i, "Dashboard must not add a light or automatic OS theme branch");
assert.match(main, /cobaltMarket\.css[\s\S]*dashboardOaDark\.css/, "The dashboard-only OA layer must remain last after the product-wide Cobalt Market layer");

const distHtmlPath = join(root, "dist", "index.html");
assert.ok(existsSync(distHtmlPath), "Dashboard palette regression requires a fresh production build at dist/index.html");
const distHtml = readFileSync(distHtmlPath, "utf8");
const cssAssets = [...distHtml.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map((match) => match[1]);
assert.ok(cssAssets.length > 0, "Compiled build must expose a CSS asset");
const compiledCss = cssAssets.map((asset) => readFileSync(join(root, "dist", asset.replace(/^\//, "")), "utf8")).join("\n");
const dashboardRules = [...compiledCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter((match) => match[1].includes(".oa-dashboard-app") || match[1].includes(":has(.oa-dashboard-app)"))
  .map((match) => `${match[1]}{${match[2]}}`)
  .join("\n");
assert.ok(dashboardRules.length > 1_000, "Compiled dashboard-scoped CSS rule set must resolve before scanning");
assert.doesNotMatch(dashboardRules, forbiddenNames, "Compiled dashboard-scoped CSS must not contain forbidden palette names");
assert.deepEqual(findForbiddenDashboardAccents(dashboardRules), [], "Compiled dashboard-scoped CSS must not contain normalized green, copper, gold, cyan, or purple accents");
assert.match(dashboardRules, /#4f7dff|rgb\(79\s+125\s+255\)/i, "Compiled dashboard-scoped CSS must contain cobalt primary");
assert.match(dashboardRules, /#e8eeff|rgb\(232\s+238\s+255\)/i, "Compiled dashboard-scoped CSS must contain polar");
for (const marker of ["#08090c", "#0d0f14", "#171a21", "#2b303a"]) {
  assert.match(dashboardRules, new RegExp(marker, "i"), `Compiled dashboard-scoped CSS must contain ${marker}`);
}

console.log("dashboard-cobalt-palette-regression: cobalt, polar, near-black/slate, semantic, dark-only, source, DOM-class, and compiled dashboard CSS contracts passed");
