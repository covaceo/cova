import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = new URL("../", import.meta.url);
const read = name => readFileSync(new URL(name, root), "utf8");
const page = read("src/components/CommunityDiscordPage.tsx");
const styles = read("src/styles/communityDiscordPage.css");
const require = createRequire(new URL("../package.json", import.meta.url));
const compiled = ts.transpileModule(page, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)(require, mod, mod.exports);
const html = renderToStaticMarkup(React.createElement(mod.exports.CommunityPage, { go() {} }));
const text = html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// Raf approved the find-us hub, replacing the Discord instructions, not its
// destination or safety boundaries. Test the rendered component, not a mock.
assert.match(html, /<h1>Find us\.<\/h1>/, "Community must lead with the approved Find us. heading.");
const links = [...html.matchAll(/<a\b([^>]+)>([\s\S]*?)<\/a>/g)].map(([, attrs, body]) => ({
  href: /\bhref="([^"]+)"/.exec(attrs)?.[1],
  target: /\btarget="([^"]+)"/.exec(attrs)?.[1],
  rel: /\brel="([^"]+)"/.exec(attrs)?.[1],
  label: body.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
}));
assert.deepEqual(links.map(link => link.href), [
  "https://www.instagram.com/covadesk/", "https://discord.gg/B83Czu3pAf", "https://x.com/covadesk",
], "Exactly the three approved real destinations, in Instagram / Discord / X order.");
assert.deepEqual(links.map(link => link.label), [
  "Instagram @covadesk Follow on Instagram", "Discord Cova Join Discord", "X @covadesk Follow on X",
]);
for (const link of links) {
  assert.equal(link.target, "_blank");
  assert.ok(link.rel.split(/\s+/).includes("noopener"));
  assert.ok(link.rel.split(/\s+/).includes("noreferrer"));
}
assert.match(html, /<nav[^>]+aria-label="Find Cova"/);
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.equal((html.match(/<h2\b/g) || []).length, 3);
assert.doesNotMatch(page, /window\.open|onClick=\{openDiscord\}/, "External destinations must be native accessible links.");
assert.doesNotMatch(text, /Bring the trade|Bring the screenshot|Add the context|Ask what you need|REAL ROOMS|THE ROOM IS OPEN|#trade-review|#risk-discipline|#passport-showcase|#product-feedback|The invite is permanent/, "Retire the explainer instead of hiding it.");
assert.match(text, /No live entry calls, paid signals, copy trading, account management, broker solicitation, or requests for private account information\./);
assert.match(page, /onClick=\{\(\) => go\("resources"\)\}/, "Keep the existing Resources escape path.");
assert.doesNotMatch(text, /\b\d+[,+]? members?\b|active now|online now|live feed|recent messages/i);
assert.doesNotMatch(page, /RiskDisclosureFooter|FooterBrandOrbs/, "Community must not duplicate the shared footer.");
assert.match(read("src/components/MarketingPages.tsx"), /export \{ CommunityPage \} from "\.\/CommunityDiscordPage";/);
assert.match(read("src/components/Navbar.tsx"), /\{ label: "Community", action: "community" \}/);
assert.match(read("src/App.tsx"), /<CommunityPage go=\{go\} \/>/);
assert.match(read("src/main.tsx"), /styles\/communityDiscordPage\.css/);
assert.match(page, /useReducedMotion/);
assert.match(styles, /prefers-reduced-motion:\s*reduce/);
assert.match(styles, /:focus-visible/);
assert.doesNotMatch(page + styles, /community-oa-help-flow|community-oa-rooms|community-oa-brandline|community-oa-join-copy|#18c887|#b9f5df|emerald|copper/i);
assert.match(styles, /#4f7dff|#6f96ff/);
console.log("Community find-us regression passed: three native links, concise copy, preserved route and safety boundary.");
