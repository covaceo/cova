import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readSource(path) {
  try {
    return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  } catch {
    return "";
  }
}

const [cursorSource, cursorCss, operatorCss, appSource, mainSource, browserAudit, releaseBrowserSource] = await Promise.all([
  readSource("src/components/CustomCursor.tsx"),
  readSource("src/styles/customCursor.css"),
  readSource("src/styles/operatorDossierRevamp.css"),
  readSource("src/App.tsx"),
  readSource("src/main.tsx"),
  readSource("scripts/custom-cursor-browser-audit.mjs"),
  readSource("scripts/release-browser-regression.mjs"),
]);

assert.ok(cursorSource, "CustomCursor component must exist.");
assert.ok(cursorCss, "Custom cursor stylesheet must exist.");
assert.match(appSource, /import\s*\{\s*CustomCursor\s*\}\s*from\s*["']\.\/components\/CustomCursor["']/, "App should import the global cursor component.");
assert.equal((appSource.match(/<CustomCursor\s*\/>/g) ?? []).length, 1, "App should mount exactly one custom cursor.");
assert.match(mainSource, /import\s+["']\.\/styles\/customCursor\.css["']/, "The custom cursor stylesheet should be imported globally.");

assert.match(cursorSource, /\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/, "Cursor should require a fine hover pointer.");
assert.match(cursorSource, /prefers-reduced-motion:\s*reduce/, "Cursor should preserve the native pointer for reduced-motion users.");
assert.match(cursorSource, /forced-colors:\s*active/, "Cursor should preserve the native pointer in forced-colors mode.");
assert.match(cursorSource, /classList\.add\(["']cova-custom-cursor-active["']\)/, "Cursor should activate native-pointer hiding only after readiness.");
assert.match(cursorSource, /classList\.remove\(["']cova-custom-cursor-active["']\)/, "Cursor cleanup should always restore the native pointer.");
assert.match(cursorSource, /requestAnimationFrame/, "Cursor frame should animate through requestAnimationFrame.");
assert.match(cursorSource, /cancelAnimationFrame/, "Cursor cleanup should cancel its animation frame.");
assert.doesNotMatch(cursorSource, /useState/, "Pointer coordinates should not trigger React state renders.");
assert.match(cursorSource, /aria-hidden=["']true["']/, "The decorative cursor must stay out of the accessibility tree.");
assert.match(cursorSource, /pointerType\s*===\s*["']touch["'][\s\S]*pointerType\s*===\s*["']pen["']/, "Touch and pen input should disable the custom pointer.");
assert.match(mainSource, /navigator\.platform\.startsWith\(["']Win["']\)[\s\S]*classList\.add\(["']cova-platform-windows["']\)/, "Windows clients should receive a scoped performance fallback class before render.");
assert.match(cursorSource, /classList\.contains\(["']cova-platform-windows["']\)[\s\S]*return;/, "Windows clients should not install the custom cursor event and paint loop.");

for (const state of ["default", "action", "text", "pressed", "disabled", "grab", "grabbing", "hidden"]) {
  assert.match(cursorSource + cursorCss, new RegExp(`(?:data-cursor-state|is-)[:=\\\"'\\s.-]*${state}`), `Custom cursor should define a ${state} state.`);
}

assert.match(cursorCss, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)[\s\S]*html\.cova-custom-cursor-active[\s\S]*cursor:\s*none\s*!important/, "Native cursor hiding must be capability-gated and activation-gated.");
assert.match(cursorCss, /html\.cova-custom-cursor-active \.cova-cursor\s*\{\s*display:\s*block;/, "The custom layer should render only after desktop activation.");
assert.match(cursorCss, /\.cova-cursor\s*\{[\s\S]*?display:\s*none;/, "The inactive custom layer should stay out of mobile layout geometry.");
assert.doesNotMatch(cursorCss, /^(?![\s\S]*html\.cova-custom-cursor-active)[\s\S]*(?:html|body|\*)\s*\{[^}]*cursor:\s*none/m, "Cursor must never be hidden unconditionally.");
assert.match(cursorCss, /\.cova-cursor\s*\{[\s\S]*pointer-events:\s*none;/, "The custom cursor layer must never intercept input.");
assert.doesNotMatch(cursorCss, /user-select:\s*none/, "Custom cursor styling must not disable text selection.");
assert.match(cursorCss, /\.cova-cursor-frame-geometry\s*\{[\s\S]*?rotate:\s*45deg;/, "The standby reticle should be a 45-degree diamond.");
assert.match(cursorCss, /html\.cova-platform-windows \.cova-cursor\s*\{\s*display:\s*none\s*!important;/, "Windows fallback should remove the custom cursor from paint.");
assert.match(operatorCss, /html\.cova-platform-windows \.header-scroll-veil\s*\{[\s\S]*?backdrop-filter:\s*none\s*!important;/, "Windows fallback should disable the fixed header veil blur.");
assert.match(cursorCss, /\[data-cursor-state=["']action["']\]\s+\.cova-cursor-frame-geometry\s*\{[\s\S]*?rotate:\s*0deg;/, "Interactive hover should rotate the reticle into a square.");
assert.match(cursorCss, /@media[^{]*(?:prefers-reduced-motion|forced-colors)[\s\S]*html\.cova-custom-cursor-active[\s\S]*cursor:\s*revert\s*!important/, "Accessibility fallback media queries should restore the native cursor without waiting for JavaScript.");

assert.ok(browserAudit, "Custom cursor browser audit must exist.");
assert.doesNotMatch(browserAudit, /const port\s*=\s*\d+/, "Browser audit must not use a fixed CDP port.");
assert.match(browserAudit, /createServer/, "Browser audit should allocate a free CDP port.");
assert.match(browserAudit, /CDP request timed out/, "Every CDP request should have a bounded timeout.");
assert.match(browserAudit, /auditTargetToken/, "Browser audit should verify that the page target belongs to its spawned Chrome instance.");
assert.match(browserAudit, /mkdir\(screenshotDir,\s*\{\s*recursive:\s*true\s*\}\)/, "Browser audit should create its screenshot directory in a clean checkout.");
assert.match(browserAudit, /Browser\.close[\s\S]*taskkill\.exe[\s\S]*waitForChromeExit/, "Browser audit should close Chrome through CDP with a bounded process-tree fallback.");
assert.match(browserAudit, /\["EBUSY",\s*"EPERM",\s*"ENOTEMPTY"\]/, "Browser audit should retry transient Windows profile cleanup failures.");
assert.match(releaseBrowserSource, /runNode\(["']scripts\/custom-cursor-browser-audit\.mjs["']/, "The release browser gate should execute the Windows cursor/performance audit.");

console.log("custom-cursor-regression: all checks passed");
