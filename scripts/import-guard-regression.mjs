import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(root, "src", "lib", "importGuard.ts");
const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const outDir = mkdtempSync(join(tmpdir(), "cova-import-guard-"));
process.once("exit", () => rmSync(outDir, { recursive: true, force: true }));
const compiledPath = join(outDir, "importGuard.mjs");
writeFileSync(compiledPath, compiled.outputText);

const { isImportPrincipalCurrent, toImportPrincipalIdentity } = await import(`${pathToFileURL(compiledPath).href}?t=${Date.now()}`);

assert.equal(toImportPrincipalIdentity({ email: " Trader@Example.com ", userId: "" }), "trader@example.com");
assert.equal(toImportPrincipalIdentity({ email: "ignored@example.com", userId: " provider-user-1 " }), "provider-user-1");
assert.equal(toImportPrincipalIdentity(null), "");

const start = { authGeneration: 7, identityGeneration: 3, identity: "provider-user-1" };
assert.equal(isImportPrincipalCurrent(start, { ...start }), true, "An unchanged principal may commit its completed import.");
assert.equal(isImportPrincipalCurrent(start, { ...start, authGeneration: 8 }), false, "Sign-out or auth invalidation must reject stale completion.");
assert.equal(isImportPrincipalCurrent(start, { ...start, identityGeneration: 4 }), false, "An identity switch must reject stale completion.");
assert.equal(isImportPrincipalCurrent(start, { ...start, identity: "provider-user-2" }), false, "A different principal must never receive the prior user's import.");
assert.equal(isImportPrincipalCurrent(start, null), false, "A signed-out workspace must reject completion.");
assert.equal(isImportPrincipalCurrent(null, start), false, "A request without an initiating principal must not commit.");

console.log("import principal guard regression: passed");
