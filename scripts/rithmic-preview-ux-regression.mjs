import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(path.join(root, ...parts), "utf8");

const app = read("src", "App.tsx");
const authEnvironment = read("src", "lib", "authEnvironment.ts");
const apiClient = read("src", "lib", "apiClient.ts");
const importDesk = read("src", "components", "ImportDesk.tsx");
const importPanels = read("src", "components", "ImportPanels.tsx");
const packageJson = JSON.parse(read("package.json"));

assert.match(authEnvironment, /isRithmicUiPreview/, "The temporary Rithmic build needs an explicit preview-only environment gate.");
assert.match(app, /isRithmicUiPreview\(\)/, "The temporary Rithmic URL must open without an auth detour.");
assert.match(importDesk, /isRithmicUiPreview\(\)\s*\?\s*"rithmic"\s*:\s*"topstepx"/, "The temporary preview must select Rithmic on first render.");
assert.match(importDesk, /data\.preview/, "The inert preview response must not be presented as a verified Rithmic login.");
assert.match(importDesk, /Visual preview complete\. Nothing was sent, saved, or imported\./, "The preview submit result must be explicit and truthful.");
assert.match(apiClient, /\/api\/rithmic\/status/, "The visual preview must intercept the Rithmic capability request locally.");
assert.match(apiClient, /\/api\/rithmic\/sync/, "The visual preview must intercept the Rithmic submit locally.");
assert.match(apiClient, /url\.origin === window\.location\.origin/, "Preview interception must be restricted to same-origin requests.");
assert.match(apiClient, /method === "GET"/, "The preview status interception must require GET.");
assert.match(apiClient, /method === "POST"/, "The preview sync interception must require POST.");
assert.match(importPanels, /data-provider-picker/, "The provider choice needs one compact, testable selector.");
assert.match(importPanels, /active \? "Selected" : "Select"/, "Every provider card needs a clear select/selected action state.");
assert.match(importPanels, /onClick=\{\(\) => selectFirm\(firm\)\}/, "Choosing a provider must select it without immediately restarting OAuth.");
assert.match(importPanels, /data-broker-lifecycle/, "Production broker lifecycle controls must remain available outside the preview.");
assert.match(importPanels, /!rithmicPreview[\s\S]*checkTradovateStatus[\s\S]*syncTradovate[\s\S]*disconnectBroker/, "Preview cleanup must not remove production status, sync, or disconnect controls.");
assert.doesNotMatch(importPanels, /\{firm\.summary\}/, "Provider cards must not contain explanatory paragraphs.");
assert.match(importPanels, /autoComplete=\{rithmicPreview \? "off" : "username"\}/, "The visual preview must not invite username autofill persistence.");
assert.match(importPanels, /autoComplete=\{rithmicPreview \? "new-password" : "current-password"\}/, "The visual preview must not invite password-manager persistence.");
assert.doesNotMatch(importPanels, /<ImportStat label="Firm"/, "The selector must not repeat provider metadata in a separate stat strip.");
assert.doesNotMatch(importPanels, /source-route-ledger/, "The selector must not repeat internal routing and security reasoning below the form.");
assert.match(importPanels, /Visual only\. Nothing leaves this browser\./, "The temporary form needs one explicit preview boundary.");
assert.match(importPanels, /One-time login\. Credentials are discarded by Cova when it finishes\. No order access\./, "The production Rithmic form needs one concise trust line.");
assert.doesNotMatch(importPanels, /requests accounts, completed fills, and contract values/, "Internal request reasoning must stay out of the customer form.");
assert.match(app, /try \{[\s\S]*setActiveStorageIdentity\(session\.email\);[\s\S]*localStorage\.setItem\(AUTH_SESSION_KEY[\s\S]*\} catch/, "Blocked browser storage must not prevent the visual preview session from opening.");
assert.match(packageJson.scripts.test, /test:rithmic-preview-ux/, "The aggregate test pipeline must include the preview UX regression.");
assert.equal(packageJson.scripts["test:rithmic-preview-ux"], "node scripts/rithmic-preview-ux-regression.mjs", "The preview regression needs a dedicated package script.");

console.log("rithmic preview ux regression: passed");
