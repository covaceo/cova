import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function readOptional(path) {
  try { return await readFile(join(root, path), "utf8"); }
  catch { return ""; }
}

async function collectSource(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const chunks = [];
  for (const entry of entries) {
    const relative = join(directory, entry.name);
    if (entry.isDirectory()) chunks.push(await collectSource(relative));
    else if ([".css", ".ts", ".tsx"].includes(extname(entry.name))) chunks.push(await readFile(join(root, relative), "utf8"));
  }
  return chunks.join("\n");
}

const [cursorComponent, cursorCss, appSource, mainSource, packageSource, nativeAudit, releaseBrowser, operatorCss, sourceTree] = await Promise.all([
  readOptional("src/components/CustomCursor.tsx"),
  readOptional("src/styles/customCursor.css"),
  readOptional("src/App.tsx"),
  readOptional("src/main.tsx"),
  readOptional("package.json"),
  readOptional("scripts/native-cursor-browser-audit.mjs"),
  readOptional("scripts/release-browser-regression.mjs"),
  readOptional("src/styles/operatorDossierRevamp.css"),
  collectSource("src"),
]);

assert.equal(cursorComponent, "", "The CustomCursor React runtime must be deleted.");
assert.equal(cursorCss, "", "The custom cursor stylesheet must be deleted.");
assert.doesNotMatch(appSource, /CustomCursor|<CustomCursor\s*\/>/, "App must not import or mount a custom cursor.");
assert.doesNotMatch(mainSource, /styles\/customCursor\.css/, "The global custom cursor stylesheet import must be removed.");
assert.doesNotMatch(sourceTree, /cova-custom-cursor-active|className=["']cova-cursor|cursor:\s*none\s*!important/, "No custom-cursor activation or native-pointer suppression may survive in source.");
assert.match(mainSource, /navigator\.platform\.startsWith\(["']Win["']\)[\s\S]*cova-platform-windows/, "The independent Windows compositing fallback must remain.");
assert.match(operatorCss, /html\.cova-platform-windows \.header-scroll-veil\s*\{[\s\S]*backdrop-filter:\s*none\s*!important/, "Removing the cursor must not remove the independent Windows header-blur fallback.");

assert.match(packageSource, /"test:native-cursor":\s*"node scripts\/native-cursor-regression\.mjs"/);
assert.match(packageSource, /"audit:native-cursor":\s*"node scripts\/native-cursor-browser-audit\.mjs"/);
assert.doesNotMatch(packageSource, /test:custom-cursor|audit:custom-cursor|custom-cursor-regression\.mjs|custom-cursor-browser-audit\.mjs/);
assert.match(nativeAudit, /document\.querySelector\(['"]\.cova-cursor['"]\)/, "Browser QA must prove the decorative cursor layer is absent.");
assert.match(nativeAudit, /cova-custom-cursor-active/, "Browser QA must prove the activation class is absent.");
assert.match(nativeAudit, /assert\.notEqual\([^\n]*(?:Cursor|cursor)[^\n]*["']none["']/, "Browser QA must reject native cursor suppression.");
assert.match(releaseBrowser, /runNode\(["']scripts\/native-cursor-browser-audit\.mjs["']/, "The canonical release browser gate must run native-cursor QA.");
assert.doesNotMatch(releaseBrowser, /custom-cursor-browser-audit|COVA_CURSOR_SCREENSHOT_DIR|cursorScreenshotDir/);

console.log("native-cursor-regression: custom runtime absent; native pointer contract passed");
