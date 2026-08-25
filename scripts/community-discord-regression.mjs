import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "src/components/CommunityDiscordPage.tsx");
const stylesPath = path.join(root, "src/styles/communityDiscordPage.css");
const marketingPath = path.join(root, "src/components/MarketingPages.tsx");
const navbarPath = path.join(root, "src/components/Navbar.tsx");
const mainPath = path.join(root, "src/main.tsx");

assert.ok(existsSync(pagePath), "Community must move into a dedicated Discord page owner.");
assert.ok(existsSync(stylesPath), "Community must have one scoped OA stylesheet.");

const page = readFileSync(pagePath, "utf8");
const styles = readFileSync(stylesPath, "utf8");
const marketing = readFileSync(marketingPath, "utf8");
const navbar = readFileSync(navbarPath, "utf8");
const main = readFileSync(mainPath, "utf8");

assert.match(marketing, /export \{ CommunityPage \} from "\.\/CommunityDiscordPage";/, "MarketingPages must hand Community to its dedicated owner.");
assert.match(navbar, /\{ label: "Home", action: "overview" \}/, "The completed landing route must use the approved literal Home label.");
assert.doesNotMatch(navbar, /label: "Product"/, "The old ambiguous Product label must leave public navigation.");
assert.match(navbar, /\{ label: "Community", action: "community" \}/, "Community must render as a direct route, not a fake dropdown trigger.");
assert.doesNotMatch(navbar, /label: "Community"[^\n]*hasChevron/, "Community must not show a chevron when no dropdown exists.");
assert.match(main, /styles\/communityDiscordPage\.css/, "The Community stylesheet must load after settled marketing CSS.");
assert.match(page, /A real Cova community/, "Community must explicitly present the real Cova room.");
assert.match(page, /Bring the trade\. Get help working through it\./, "The hero must lead with concrete help.");
assert.match(page, /Join the Cova Discord/, "Community must expose the requested dominant join action.");
assert.match(page, /<title>Discord<\/title>/, "The join experience must render a real Discord brand mark.");
assert.match(page, /viewBox="0 0 24 24"/, "The Discord mark must use the official icon viewBox.");
assert.match(page, /https:\/\/discord\.gg\/B83Czu3pAf/, "Community must retain the verified permanent invite.");
assert.match(page, /window\.open\(COVA_DISCORD_INVITE_URL, "_blank", "noopener,noreferrer"\)/, "The external join action must open safely.");
assert.match(page, /#trade-review[\s\S]*#risk-discipline[\s\S]*#passport-showcase[\s\S]*#product-feedback/, "The real channel guide must remain ordered and truthful.");
assert.match(page, /No live entry calls, paid signals, copy trading, account management, broker solicitation, or requests for private account information\./, "Community safety boundaries must remain visible.");
assert.match(page, /useReducedMotion/, "Community motion must honor reduced motion.");

assert.doesNotMatch(page, /\b\d+[,+]? members?\b|active now|online now|live feed|recent messages/i, "Community must not fabricate activity or membership.");
assert.doesNotMatch(page, /liquid-glass|SectionShell|ImageAtmosphere|cova-story-frame-04/, "The legacy card shell and broken backdrop must leave Community.");
assert.match(page, /community-oa-brandline/, "Discord branding should sit beside the join copy instead of occupying a boxed logo panel.");
assert.doesNotMatch(page, /community-oa-mark-wrap|className="community-oa-mark"/, "The giant boxed Discord mark must leave the composition.");
assert.doesNotMatch(styles, /1px solid/, "Community must use OA stage gaps and tonal surfaces instead of drawing borders around every region.");
assert.match(styles, /\.community-oa-brand-mark\s*\{[\s\S]*?width:\s*2rem/, "The remaining Discord brand mark must stay restrained at two rem.");
assert.doesNotMatch(page + styles, /#18c887|#b9f5df|emerald|copper/i, "Community must stay in Cobalt Market without retired green or copper identity.");
assert.doesNotMatch(styles, /font-weight:\s*[6-9]00/, "OA weight must stop at 500.");
assert.match(styles, /padding:\s*4px/, "The dominant OA plate must use the four-pixel stage gap.");
assert.match(styles, /border-radius:\s*999px/, "The Discord join action must use OA pill anatomy.");
assert.match(styles, /#4f7dff|#6f96ff/, "Cobalt must remain the single accent.");
assert.match(styles, /prefers-reduced-motion:\s*reduce/, "The stylesheet must include a reduced-motion fallback.");

console.log("Community Discord OA regression passed.");
