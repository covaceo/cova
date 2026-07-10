import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readSource(path) {
  try {
    return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  } catch {
    return "";
  }
}

const [cursorSource, cursorCss, appSource, mainSource] = await Promise.all([
  readSource("src/components/CustomCursor.tsx"),
  readSource("src/styles/customCursor.css"),
  readSource("src/App.tsx"),
  readSource("src/main.tsx"),
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

for (const state of ["default", "action", "text", "pressed", "disabled", "grab", "grabbing", "hidden"]) {
  assert.match(cursorSource + cursorCss, new RegExp(`(?:data-cursor-state|is-)[:=\\\"'\\s.-]*${state}`), `Custom cursor should define a ${state} state.`);
}

assert.match(cursorCss, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)[\s\S]*html\.cova-custom-cursor-active[\s\S]*cursor:\s*none\s*!important/, "Native cursor hiding must be capability-gated and activation-gated.");
assert.match(cursorCss, /html\.cova-custom-cursor-active \.cova-cursor\s*\{\s*display:\s*block;/, "The custom layer should render only after desktop activation.");
assert.match(cursorCss, /\.cova-cursor\s*\{[\s\S]*?display:\s*none;/, "The inactive custom layer should stay out of mobile layout geometry.");
assert.doesNotMatch(cursorCss, /^(?![\s\S]*html\.cova-custom-cursor-active)[\s\S]*(?:html|body|\*)\s*\{[^}]*cursor:\s*none/m, "Cursor must never be hidden unconditionally.");
assert.match(cursorCss, /\.cova-cursor\s*\{[\s\S]*pointer-events:\s*none;/, "The custom cursor layer must never intercept input.");
assert.doesNotMatch(cursorCss, /user-select:\s*none/, "Custom cursor styling must not disable text selection.");

console.log("custom-cursor-regression: all checks passed");
