import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");
const packageJson = JSON.parse(read("package.json"));
const releaseBrowserPath = join(root, "scripts", "release-browser-regression.mjs");
const ownedPreviewPath = join(root, "scripts", "owned-vite-preview.mjs");
const authBrowserPath = join(root, "scripts", "auth-modal-browser-regression.mjs");
const dashboardBrowserPath = join(root, "scripts", "dashboard-browser-regression.mjs");
const nativeCursorBrowserPath = join(root, "scripts", "native-cursor-browser-audit.mjs");
assert.equal(existsSync(releaseBrowserPath), true, "The canonical browser release gate must be self-contained in the repository.");
assert.equal(existsSync(ownedPreviewPath), true, "The canonical release gate must ship its owned Vite preview child.");
assert.equal(existsSync(authBrowserPath), true, "The short-mobile AuthSheet browser regression must ship in the repository.");
assert.equal(existsSync(nativeCursorBrowserPath), true, "The native-cursor browser regression must ship in the repository.");
const releaseBrowser = existsSync(releaseBrowserPath) ? readFileSync(releaseBrowserPath, "utf8") : "";
const ownedPreview = existsSync(ownedPreviewPath) ? readFileSync(ownedPreviewPath, "utf8") : "";
const authBrowser = existsSync(authBrowserPath) ? readFileSync(authBrowserPath, "utf8") : "";
const dashboardBrowser = existsSync(dashboardBrowserPath) ? readFileSync(dashboardBrowserPath, "utf8") : "";
const nativeCursorBrowser = existsSync(nativeCursorBrowserPath) ? readFileSync(nativeCursorBrowserPath, "utf8") : "";

const workspace = read("src", "components", "WorkspaceSections.tsx");
const workspaceShell = read("src", "components", "WorkspaceShell.tsx");
const appRoutes = read("src", "lib", "appRoutes.ts");
const brokerStatusSource = read("src", "lib", "brokerStatus.ts");
const tradeSourceLabel = read("src", "lib", "tradeSourceLabel.ts");
const app = read("src", "App.tsx");
const importPanels = read("src", "components", "ImportPanels.tsx");
const importDesk = read("src", "components", "ImportDesk.tsx");
const storyStrip = read("src", "components", "StoryStrip.tsx");
const marketingPages = read("src", "components", "MarketingPages.tsx");
const planSections = read("src", "components", "PlanSections.tsx");
const ctaFooter = planSections.slice(planSections.indexOf("export function CtaFooter"));
const propFirms = read("src", "lib", "propFirms.ts");
const authPanels = read("src", "components", "AuthPanels.tsx");
const oauthConnectPage = read("src", "components", "OAuthConnectPage.tsx");
const dashboard = read("src", "components", "DashboardView.tsx");
const marketingHero = read("src", "components", "MarketingHero.tsx");
const navbar = read("src", "components", "Navbar.tsx");
const riskDeskCss = read("src", "styles", "riskDeskVisualSystem.css");
const dashboardPreviewCss = read("src", "styles", "dashboardLeftRailPreview.css");
const workspaceCss = read("src", "styles", "workspaceRouteRefinement.css");
const operatorDossierCss = read("src", "styles", "operatorDossierRevamp.css");
const mobileAudit = read("scripts", "mobile-audit.mjs");
const indexCss = read("src", "index.css");
const ctaDecorationCss = indexCss.slice(indexCss.indexOf(".cova-closing-grid"), indexCss.indexOf(".cova-closing-content"));
const tradingViewHost = read("src", "components", "practice", "LightweightReplayChart.tsx");
const backtestingTerminal = read("src", "components", "practice", "BacktestingTerminal.tsx");
const backtestingLabCss = read("src", "styles", "backtestingLab.css");
const backtesting = read("src", "lib", "backtesting.ts");
const vercel = read("vercel.json");
const envExample = read(".env.example");
const readme = read("README.md");
const providerPacket = read("docs", "trust", "PROVIDER-SECURITY-AND-PRIVACY-PACKET.md");
const providerBrief = read("docs", "trust", "PROVIDER-APPLICATION-BRIEF.md");
const ownerChecklist = read("docs", "trust", "COUNSEL-AND-OWNER-CHECKLIST.md");
const tempRegressionScripts = [
  read("scripts", "risk-regression.mjs"),
  read("scripts", "backtest-regression.mjs"),
  read("scripts", "practice-history-regression.mjs"),
  read("scripts", "practice-datafeed-regression.mjs"),
];
const practiceUi = `${workspace}\n${backtestingTerminal}`;

assert.match(packageJson.scripts.test, /test:browser-release/, "The canonical test aggregate must run the compiled browser release gate.");
assert.equal(packageJson.scripts["test:browser-release"], "npm run build && node scripts/release-browser-regression.mjs");
assert.match(releaseBrowser, /spawn\([\s\S]*preview[\s\S]*COVA_VIEWPORT_WIDTH[\s\S]*mobile-audit\.mjs[\s\S]*auth-modal-browser-regression\.mjs[\s\S]*finally/, "The release browser gate must start preview, run mobile and AuthSheet audits, and always clean up.");
assert.match(releaseBrowser, /spawn\([\s\S]*owned-vite-preview\.mjs[\s\S]*"ipc"[\s\S]*waitForOwnedPreview[\s\S]*owned-preview-ready/, "The release gate must require a ready IPC event from its own preview child.");
assert.match(releaseBrowser, /type:\s*"shutdown"[\s\S]*waitForPortClosed/, "The release gate must shut down its owned child and verify that its port closes.");
assert.match(ownedPreview, /preview\([\s\S]*port:\s*0[\s\S]*strictPort:\s*true/, "The owned preview child must use an OS-selected strict port.");
assert.match(ownedPreview, /process\.send[\s\S]*owned-preview-ready/, "The owned preview child must report readiness through IPC.");
assert.match(ownedPreview, /server\?\.close|server\.close/, "The owned preview child must support graceful shutdown.");
for (const chromeHarness of [mobileAudit, authBrowser, dashboardBrowser, nativeCursorBrowser]) {
  assert.match(chromeHarness, /--remote-debugging-port=0/, "Chrome QA must request an OS-selected CDP port.");
  assert.match(chromeHarness, /DevToolsActivePort/, "Chrome QA must bind CDP through the spawned run's unique profile.");
}
for (const chromeHarness of [mobileAudit, authBrowser, dashboardBrowser, nativeCursorBrowser]) {
  assert.match(chromeHarness, /taskkill\.exe[\s\S]*?!error \|\| await waitForChromeExit/, "Windows Chrome cleanup must treat an already-exited owned PID as successful while still verifying process exit.");
}
assert.match(releaseBrowser, /taskkill\.exe[\s\S]*?!error \|\| await waitForPreviewExit/, "Windows preview cleanup must treat an already-exited owned PID as successful while still verifying process exit and port closure.");
assert.match(authBrowser, /width:\s*390,\s*height:\s*640[\s\S]*aria-label=.Close.[\s\S]*overlay\.scrollTop[\s\S]*background[\s\S]*allInert/, "The AuthSheet browser regression must verify short-phone close visibility, top scroll position, and background isolation.");

for (const stalePath of [
  "app.js",
  "styles.css",
  "kickbacks.vsix",
  "vite.config.js",
  "vite.config.d.ts",
  "assets/reference",
  "public/reference",
  "public/brand/cova-wordmark-custom-white.png",
  "public/cova-mark.svg",
  "public/cova-dashboard.png",
  "public/cova-operator-reference.png",
  "public/cova-practice.css",
  "public/cova-practice.png",
  "public/cova-trading-platform.png",
  "public/pricing-copper-room.jpg",
  "public/trading_platform/README.md",
  "public/media/cova-dashboard-plate.png",
  "public/media/cova-hero-candles.png",
  "public/media/cova-hero-centerpiece-v1.png",
  "public/media/cova-hero-v2.jpg",
  "public/media/cova-hero-v2.png",
  "public/media/cova-hero-wordmark-source-chromakey.png",
  "public/media/cova-hero-wordmark-v1.png",
  "public/media/cova-logo-favicon.png",
  "public/media/cova-logo-mark.png",
  "public/media/cova-logo-minimal-black.png",
  "public/media/cova-logo-minimal-favicon.png",
  "public/media/cova-logo-minimal-source-chromakey.png",
  "public/media/cova-logo-minimal-white.png",
  "public/media/cova-market-hero-v1.png",
  "public/media/cova-passport-product.png",
  "public/media/cova-story-frame-01.png",
  "public/media/cova-story-frame-03.png",
  "public/media/cova-story-stage-v2.png",
  "public/media/wordmark-options/cova-wordmark-option-1-editorial.png",
  "public/media/wordmark-options/cova-wordmark-option-2-terminal.png",
  "public/media/wordmark-options/cova-wordmark-option-3-sleek.png",
  "public/media/wordmark-options/cova-wordmark-options-preview.png",
  "public/media/wordmark-options/cova-wordmark-option-1-rounded.png",
  "public/media/wordmark-options/cova-wordmark-option-2-sharp.png",
  "public/media/wordmark-options/cova-wordmark-option-4-sleek.png",
]) {
  assert.equal(existsSync(join(root, stalePath)), false, `${stalePath} is an obsolete or generated artifact and must not ship in the application repository.`);
}

for (const script of tempRegressionScripts) {
  assert.match(script, /process\.once\("exit", \(\) => rmSync\(outDir, \{ recursive: true, force: true \}\)\)/, "Regression transpilation directories must be removed when each test process exits.");
}

assert.match(workspace, /Rules calculated · flags found/, "Passport ledger should use factual mixed-state copy when any rules are flagged.");
assert.doesNotMatch(workspace, /Net P&L/, "Passport live cards, privacy rows, previews, and fallback exports must not label provider-reported gross P&L as net.");
assert.match(workspace, /Reported P&L/, "Passport must use provider-neutral P&L wording everywhere the reviewed value appears.");
assert.match(workspace, /Score range", value: Number\.isFinite\(analysis\.score\) \? `\$\{Math\.floor\(analysis\.score \/ 10\) \* 10\}\+` : "Hidden"/, "Passport Ghost mode must preserve a valid score of zero as the 0+ range.");
assert.match(workspace, /analysis\.breaches\.length/, "Passport ledger heading should be tied to actual breach state, not static verified copy.");
assert.match(workspace, /Limit warnings/, "Insights should give the warning card a specific scan label.");
assert.match(workspace, /Review note/, "Insights should frame outputs as retrospective review notes rather than trading directives.");
assert.match(workspace, /Setup review/, "Insights should describe setup evidence without claiming trading permission.");
assert.doesNotMatch(workspace, /Trade normal size|Trade reduced size|Do not trade live size|Setup permission/, "Insights must not issue personalized live-trading directives.");
assert.match(workspace, /Set review thresholds for imported history/, "Limits should describe review thresholds instead of implying order blocking.");
assert.match(workspace, /Changing a threshold can change which warnings appear/, "Limits should explain that edits re-check history without rewriting the trade.");
assert.match(workspace, /Not checked/, "Disabled Limits rules should not be mislabeled clean.");
assert.match(workspace, /Breach in history/, "Limits should label historical breaches without implying that moving the threshold fixes them.");
assert.match(workspace, /Review warnings/, "Limits should provide a direct route into the warning brief.");
assert.match(workspace, /Review active limits/, "Insights should provide a direct route back to the guardrails that generated warnings.");
assert.match(workspace, /data-tone=\{insight\.tone\.toLowerCase\(\)\}/, "Insights should expose severity to the visual system.");

assert.match(importPanels, /Upload CSV first/, "Trade History should make the CSV-first path obvious.");
assert.match(importPanels, /data-csv-primary/, "Trade History should expose a primary CSV decision lane.");
assert.match(propFirms, /id: "topstepx"[\s\S]*?status: "guided"/, "TopstepX must remain available only as a CSV export guide.");
assert.doesNotMatch(propFirms, /ProjectX|VITE_TOPSTEPX_CONNECT_URL|CSV-first beta|Try TopstepX beta/, "The retired TopstepX direct connector must not remain in provider configuration.");
assert.doesNotMatch(importPanels, /ProjectX|projectx|data-projectx-connect|TopstepX direct sync|Paste API key/, "Trade History must not expose the retired TopstepX credential flow.");
assert.doesNotMatch(importDesk, /ProjectX|projectx|\/api\/projectx\//, "Trade History must not call the retired TopstepX connector APIs.");
assert.doesNotMatch(mobileAudit, /Beta connector/, "Browser QA must not expect the retired TopstepX beta connector.");
assert.match(mobileAudit, /TopstepX export/, "Browser QA must verify the surviving TopstepX CSV guide.");
assert.doesNotMatch(app, /readOAuthFirmId\(\) \?\? "topstepx"/, "A stale OAuth route must not default to the retired TopstepX connector.");
assert.match(app, /firmId === "topstepx"[\s\S]*?CSV/, "TopstepX must be rejected by any stale direct-connection callback and returned to CSV import.");
assert.match(app, /saved === "tradovate" \? "tradovate" : null/, "Only the retained Tradovate OAuth route may be restored from browser state.");
assert.match(brokerStatusSource, /parsed\?\.provider === "TopstepX"[\s\S]*?removeScopedStorage\(BROKER_STATUS_KEY\)/, "Legacy TopstepX connected browser state must be purged instead of restored.");
assert.match(importDesk, /brokerStatus\?\.provider === "Tradovate" \? "tradovate" : "all"/, "Unknown legacy broker states must trigger all-provider cleanup rather than a false Tradovate-only disconnect.");
const csvReadFile = importDesk.match(/async function readFile\(file\?: File\) \{([\s\S]*?)\n  \}/)?.[1] || "";
assert.match(importDesk, /const MAX_CSV_FILE_BYTES = 2 \* 1024 \* 1024;/, "Browser CSV imports must have an explicit two-megabyte byte ceiling.");
assert.match(csvReadFile, /file\.size > MAX_CSV_FILE_BYTES/, "CSV files must be rejected by byte size before their contents are allocated.");
assert.ok(csvReadFile.indexOf("file.size > MAX_CSV_FILE_BYTES") < csvReadFile.indexOf("await file.text()"), "The CSV byte ceiling must run before File.text allocates the payload.");
assert.match(csvReadFile, /exceeds the 2 MB CSV limit/, "Oversized CSV files need a clear customer-facing rejection.");
assert.equal(existsSync(join(root, "api", "projectx")), false, "Retired TopstepX serverless endpoints must not ship.");
assert.equal(existsSync(join(root, "api", "_lib", "projectx.js")), false, "Retired TopstepX provider helpers must not ship.");
assert.doesNotMatch(vercel, /projectx/i, "Vercel routing must not expose the retired TopstepX connector.");
for (const releaseDocument of [envExample, readme, providerPacket, providerBrief, ownerChecklist]) {
  assert.doesNotMatch(releaseDocument, /ProjectX|TopstepX \/ ProjectX|api\/projectx|PROJECTX_API_BASE_URL|TOPSTEPX_CONNECT/, "Release documentation must not advertise or request approval for the retired TopstepX direct connector.");
}

assert.match(storyStrip, /What Cova caught/, "Homepage should include concrete product proof, not only process cards.");
assert.match(storyStrip, /Daily loss breach/, "Homepage proof should show a specific risk issue Cova catches.");
assert.match(storyStrip, /Passport proof/, "Homepage proof should connect review output to Passport proof.");
assert.match(marketingHero, /HeroMobileDossier/, "Homepage should render a dedicated mobile risk-review proof instead of shrinking the desktop mockup.");
assert.match(marketingHero, /What people are saying/i, "Homepage should retain the permissioned customer review rail.");
assert.match(marketingHero, /Marcus R\.[\s\S]*Daniel C\.[\s\S]*Jasmine B\./, "Permissioned reviews should retain the supplied names.");
assert.match(marketingHero, /Cova showed me patterns in my trading I never noticed before\. My risk management has improved a lot\./, "Marcus's permissioned quote should remain exact.");
assert.match(marketingHero, /It’s more than a trade tracker\. Cova helps me understand why I keep making the same mistakes\./, "Daniel's permissioned quote should remain exact.");
assert.match(marketingHero, /Cova made my trade reviews faster, clearer, and way more useful\./, "Jasmine's permissioned quote should remain exact.");
assert.equal((marketingHero.match(/rating: 5,/g) ?? []).length, 3, "All three permissioned reviews should retain their five-star rating.");
assert.match(marketingHero, /Cova turns imported trade history into retrospective summaries of behavior, performance, and rule adherence\./, "Homepage hero support copy should describe retrospective analysis without personalized advice.");
assert.match(marketingHero, /See the[\s\S]*patterns[\s\S]*behind your risk\./, "Homepage hero should retain the original dark risk-pattern message.");
assert.doesNotMatch(marketingHero, /market-hero-evidence-room/, "The apricot evidence-room treatment must not replace the homepage hero.");
assert.match(ctaFooter, /cova-closing-section/, "The homepage must end with the dedicated closing CTA instead of a second product hero.");
assert.match(ctaFooter, /One better decision at a time/, "The closing CTA must retain the approved decision-focused label.");
assert.match(ctaFooter, /cova-closing-dock[\s\S]*cova-closing-dock-line[\s\S]*cova-closing-dock-tab[\s\S]*cova-closing-label/, "The closing CTA transition must use the approved engineered docking seam.");
assert.match(ctaFooter, /Stop repeating the trade[\s\S]*that keeps costing you\./, "The closing CTA must retain the approved pain-first headline.");
assert.match(ctaFooter, /Review behavior\. Tighten limits\. Build proof of discipline\./, "The closing CTA must keep its concise product summary.");
assert.match(ctaFooter, /Sign up[\s\S]*Explore Risk Passport/, "The closing CTA must expose conventional signup and Passport actions.");
assert.match(ctaFooter, /cova-site-footer/, "The normal site footer must remain a separate surface beneath the closing CTA.");
assert.match(ctaFooter, /mailto:support@covadesk\.com/, "The normal site footer must preserve the verified public support contact.");
assert.doesNotMatch(ctaFooter, /FooterPerformanceProof|cta-footer-dashboard|What people are saying|testimonial|review-card/i, "The closing CTA must not become a second hero with dashboard or testimonial content.");
assert.doesNotMatch(ctaFooter, /<img\s/i, "The closing CTA must use the approved restrained grid treatment without a product screenshot.");
assert.match(ctaFooter, /<span aria-hidden="true" className="cova-closing-grid" \/>/, "The closing CTA must expose a dedicated decorative texture layer.");
assert.match(ctaFooter, /StructureFlowCollection[\s\S]*variant="structure-flow"[\s\S]*cova-closing-structure-flow/, "The closing CTA must mount the approved ThreeUI Structure Flow background.");
assert.match(ctaDecorationCss, /\.cova-closing-structure-flow\s*\{[\s\S]*position:\s*absolute[\s\S]*inset:\s*0/, "Structure Flow must fill the existing closing background layer.");
assert.doesNotMatch(ctaDecorationCss, /#f0bb91|cova-logo-minimal-black\.svg/, "The retired peach field and masked Cova logo must stay removed.");
assert.match(ctaFooter, /openPassport[\s\S]*Explore Risk Passport/, "The homepage Passport action must open the real workspace rather than scroll backward to old proof.");
assert.match(ctaFooter, /isSignedIn[\s\S]*Open dashboard[\s\S]*Sign up/, "Signed-in visitors must get a dashboard action while signed-out visitors get a conventional signup action.");
assert.match(ctaFooter, /isSignedIn[\s\S]*Open Risk Passport[\s\S]*Explore Risk Passport/, "The Passport label must match the authenticated or public outcome.");
assert.match(app, /function openPassport\(\)[\s\S]*if \(!isSignedIn\)[\s\S]*go\("passport"\);[\s\S]*openAuth\("login"\)/, "Unauthenticated Passport actions must preserve Passport as the post-auth destination.");
assert.match(app, /<CtaFooter[\s\S]*?openPassport=\{openPassport\}/, "App must pass the real Passport flow into the closing CTA.");
assert.match(app, /<CtaFooter[\s\S]*?isSignedIn=\{isSignedIn\}/, "App must pass authentication state into the closing CTA.");
assert.match(indexCss, /\.cova-closing-section\s*\{[\s\S]*?background:\s*#050607/, "The Structure Flow CTA must retain its dark field beneath the renderer.");
assert.match(indexCss, /\.cova-closing-section\s*\{[\s\S]*?--cova-dock-depth:[\s\S]*?clip-path:\s*polygon/, "The closing CTA must interlock with the dark section through a clipped dock joint.");
assert.match(indexCss, /\.cova-closing-dock-line\s*\{[\s\S]*?height:\s*1px[\s\S]*?background:/, "The dock joint must retain its restrained one-pixel registration keyline.");
assert.match(indexCss, /\.cova-closing-section \.cova-closing-primary\.native-start-button\s*\{[\s\S]*?font-size:\s*0\.68rem/, "The desktop primary CTA label must remain readable without losing its restrained technical scale.");
assert.match(indexCss, /\.cova-closing-secondary\s*\{[\s\S]*?font-size:\s*0\.7rem/, "The desktop Passport CTA label must remain readable without overpowering the primary action.");
assert.match(mobileAudit, /\.cova-closing-section[\s\S]*\.cova-closing-primary[\s\S]*\.cova-closing-secondary/, "The compiled browser audit must target the approved CTA surface and actions.");
assert.match(mobileAudit, /dialogLabel[\s\S]*Sign up to Cova[\s\S]*Sign in to Cova/, "The compiled browser audit must distinguish signup from login by each dialog's accessible name.");
assert.match(mobileAudit, /footerSeparate[\s\S]*legalLabels[\s\S]*Privacy\|Terms\|Security\|Support/, "The compiled browser audit must enforce footer separation, legal navigation, and support access.");
assert.match(planSections, /MOST CHOSEN BY ACTIVE TRADERS/, "The Pro plan should retain the exact approved recommendation copy.");
assert.match(planSections, /plan-card-pro/, "The recommendation treatment should remain attached to the Pro card.");
assert.match(operatorDossierCss, /\.plan-card-pro\s*\{[\s\S]*?overflow:\s*visible\s*!important;/, "The Pro card must not clip its attached recommendation tab.");
assert.match(operatorDossierCss, /\.plan-recommendation-tab\s*\{[\s\S]*?position:\s*absolute\s*!important;[\s\S]*?background:\s*#efb88d;/, "The recommendation should remain a restrained attached apricot tab.");
assert.match(operatorDossierCss, /@media \(max-width: 767px\)[\s\S]*?\.market-hero-action-label\s*\{[\s\S]*?display:\s*inline;/, "The restored mobile hero must keep its secondary CTA label visible.");
assert.match(operatorDossierCss, /@media \(min-width: 901px\) and \(max-height: 760px\)[\s\S]*?\.market-hero-title[\s\S]*?font-size:\s*4\.45rem[\s\S]*?\.market-hero-actions[\s\S]*?margin-top:\s*1rem/, "The restored hero should keep its actions above the fold on short desktop viewports.");
assert.match(operatorDossierCss, /\.mobile-hero-dossier\s*\{\s*display:\s*none;/, "The mobile dossier must stay hidden by default so desktop remains unchanged.");
assert.match(operatorDossierCss, /@media \(max-width: 767px\)[\s\S]*?\.hero-dashboard-stage\s*\{[\s\S]*?display:\s*none\s*!important;[\s\S]*?\.mobile-hero-dossier\s*\{[\s\S]*?display:\s*block;/, "Phones should replace the oversized desktop hero mockup with the mobile dossier.");
assert.match(appRoutes, /export function isWorkspaceNavActive\(section: Section, itemId: Section\)[\s\S]*?section === "oauth" && itemId === "import"/, "OAuth connector routes must map to Link account / Trade History for every workspace navigation surface");
assert.match(navbar, /aria-current=\{isWorkspaceNavActive\(section, item\.id\) \? "page" : undefined\}/, "workspace navigation must use the shared route-equivalence helper for aria-current");
assert.match(workspaceShell, /const active = isWorkspaceNavActive\(section, item\.id\);/, "desktop workspace rail must share the same child-route current-state mapping");
assert.match(navbar, /const usesWorkspaceChrome = Boolean\(authSession\) && isProtectedSection\(section\);/, "Only authenticated protected routes should select chrome that desktop CSS hides behind the sidebar.");
assert.match(navbar, /const isAppMode = Boolean\(authSession\) \|\| usesWorkspaceChrome;/, "Signed-in mobile marketing routes should retain their existing app-navigation menu.");
assert.match(navbar, /usesWorkspaceChrome \? "workspace-top-header"/, "Authentication alone must not hide the marketing header on Overview.");
assert.match(navbar, /authSession && !usesWorkspaceChrome \? "marketing-header-signed-in"/, "Signed-in marketing pages should expose a compact desktop-header hook without entering workspace mode.");
assert.match(navbar, /header-scroll-veil-scrolled/, "The header veil should expose a dedicated stronger scrolled state.");
assert.match(navbar, /header-scroll-veil-top/, "The header veil should expose a restrained top-of-page state.");
assert.match(operatorDossierCss, /\.header-scroll-veil\s*\{[\s\S]*?background:\s*rgba\(0,\s*0,\s*0,\s*0\.5/, "The marketing header veil should use neutral black instead of a blue-black gradient.");
assert.match(operatorDossierCss, /\.header-scroll-veil-scrolled\s*\{[\s\S]*?backdrop-filter:\s*blur\(18px\)/, "Scrolling should strengthen the header blur.");
assert.match(operatorDossierCss, /@media \(min-width: 901px\)[\s\S]*?\.hero-dashboard-shell\s*\{[\s\S]*?right:\s*0\s*!important;[\s\S]*?width:\s*min\(100%,\s*57\.5rem\)\s*!important;/, "Desktop hero proof should stay anchored inside its grid lane instead of overlapping the copy.");
assert.match(operatorDossierCss, /@media \(min-width: 1280px\)[\s\S]*?\.hero-dashboard-shell\s*\{[\s\S]*?top:\s*1\.75rem\s*!important;[\s\S]*?right:\s*2\.75rem\s*!important;/, "Wide desktop should keep the dashboard intentionally down and left of its original anchor.");
assert.match(operatorDossierCss, /\.hero-dashboard-shell::after\s*\{[\s\S]*?display:\s*block\s*!important;[\s\S]*?border:\s*1px solid rgba\(191,\s*137,\s*100,\s*0\.42\)\s*!important;/, "The desktop dashboard should retain its crisp copper outer frame.");
assert.match(operatorDossierCss, /\.hero-dashboard-shell::before\s*\{[\s\S]*?display:\s*block\s*!important;[\s\S]*?background:\s*linear-gradient/, "The desktop dashboard should retain its restrained top-edge signal line.");
assert.match(operatorDossierCss, /@media \(min-width: 768px\) and \(max-width: 1100px\)[\s\S]*?\.signed-in-marketing-header-shell \.marketing-header-signed-in\s*\{[\s\S]*?display:\s*none\s*!important;[\s\S]*?\.header-mobile-brand\s*\{[\s\S]*?display:\s*flex\s*!important;[\s\S]*?\.operator-mobile-menu-toggle\s*\{[\s\S]*?display:\s*grid\s*!important;[\s\S]*?\.operator-mobile-menu-panel\s*\{[\s\S]*?display:\s*block\s*!important;/, "Narrow signed-in desktop headers should replace crowded links with an accessible menu, not remove navigation.");

assert.match(marketingPages, /Backtesting lab/, "Backtesting should appear as an active product module.");
assert.match(marketingPages, /in-app replay simulator/i, "Marketing should describe Cova's current in-app Practice simulator.");
assert.match(marketingPages, /deterministic demo tape/i, "Practice marketing must disclose that the current replay is deterministic demo data.");
assert.match(marketingPages, /not historical market data/i, "Practice marketing must not imply real historical replay data is available.");
assert.doesNotMatch(marketingPages, /Planned workspace/, "Marketing must not describe the active Practice simulator as merely planned.");
assert.doesNotMatch(marketingPages, /Use TradingView replay/, "Resources must not send users to an external manual replay workflow now that Practice is in-app.");
assert.match(planSections, /pricing-showcase-header/, "Pricing should use the approved split editorial header.");
assert.match(planSections, /Start small enough to prove the workflow\. Upgrade when Cova becomes part of every session review\./, "Pricing should retain the approved concise support copy.");
assert.doesNotMatch(planSections, /pricing-quick-actions/, "Pricing should not restore the detached CTA row that is absent from the approved reference.");
assert.match(planSections, /plan-primary-action/, "Each plan card should expose its primary decision action above the feature ledger.");
assert.match(operatorDossierCss, /\.pricing-showcase-inner\s*\{[\s\S]*?max-width:\s*58\.75rem;/, "Standard desktop pricing geometry should retain the approved 940px content rail.");
assert.match(operatorDossierCss, /@media \(min-width:\s*1440px\)[\s\S]*?\.pricing-showcase-inner\s*\{[\s\S]*?max-width:\s*80rem;[\s\S]*?\.pricing-showcase-title\s*\{[\s\S]*?font-size:\s*4rem;[\s\S]*?\.plan-feature-row\s*\{[\s\S]*?font-size:\s*0\.68rem;/, "Wide desktop pricing should grow to the surrounding 1280px rail with readable internal type.");
assert.match(operatorDossierCss, /@media \(hover:\s*hover\) and \(pointer:\s*fine\) and \(min-width:\s*901px\)[\s\S]*?\.plan-card:hover\s*\{[\s\S]*?translate:\s*0 -0\.45rem;[\s\S]*?scale:\s*1\.008;/, "Desktop plan cards should expose restrained lift feedback on hover.");
assert.match(operatorDossierCss, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.plan-card[\s\S]*?translate:\s*none;[\s\S]*?scale:\s*none;/, "Pricing hover motion should disable cleanly for reduced-motion users.");
assert.match(operatorDossierCss, /\.pricing-plan-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*0\.82fr\)\s*minmax\(0,\s*1fr\);/, "Desktop pricing cards should retain the approved asymmetric 0.82/1 split.");
assert.match(operatorDossierCss, /\.plan-card\s*\{[\s\S]*?border-radius:\s*0\.5rem;/, "Pricing cards should retain the restrained eight-pixel corners from the approved reference.");
assert.match(operatorDossierCss, /\.pricing-showcase-summary\s*\{[\s\S]*?color:\s*rgba\(237,\s*234,\s*227,\s*0\.52\);/, "Pricing support copy should retain readable contrast.");
assert.match(operatorDossierCss, /\.plan-card-description\s*\{[\s\S]*?color:\s*rgba\(237,\s*234,\s*227,\s*0\.52\);/, "Plan descriptions should retain readable contrast.");
assert.match(operatorDossierCss, /\.plan-card-badge\s*\{[\s\S]*?color:\s*rgba\(239,\s*184,\s*141,\s*0\.6\);/, "Plan status badges should retain readable contrast.");
assert.match(operatorDossierCss, /\.plan-price-note\s*\{[\s\S]*?color:\s*rgba\(237,\s*234,\s*227,\s*0\.52\);/, "Price qualifiers should retain readable contrast.");
assert.match(operatorDossierCss, /\.plan-feature-label\s*\{[\s\S]*?color:\s*rgba\(237,\s*234,\s*227,\s*0\.52\);/, "Plan feature labels should retain readable contrast.");
assert.match(operatorDossierCss, /\.plan-feature-row\s*\{[\s\S]*?color:\s*rgba\(237,\s*234,\s*227,\s*0\.52\);/, "Included plan details should retain readable contrast.");
assert.match(operatorDossierCss, /\.plan-secondary-action\s*\{[\s\S]*?color:\s*rgba\(237,\s*234,\s*227,\s*0\.52\);/, "Secondary plan actions should retain readable contrast.");
assert.match(operatorDossierCss, /@media \(max-width:\s*900px\)[\s\S]*?\.plan-primary-action,[\s\S]*?\.plan-secondary-action\s*\{[\s\S]*?min-height:\s*2\.75rem;/, "Mobile pricing actions should retain a 44px minimum touch target.");
assert.match(planSections, /Up to 25 trades per import/, "Pricing should state the concrete free import cap.");
assert.match(planSections, /25 stored trades total/, "Pricing should state the free stored-trade cap.");
assert.doesNotMatch(planSections, /See sample review/, "Pricing must not send signed-out visitors to an auth-gated route while promising a sample review.");
assert.match(planSections, /Unlimited Passport image exports/, "Pricing should describe the implemented Passport export capability.");
assert.doesNotMatch(planSections, /Saved CSV and review history|Unlimited Risk Passports|saved history/i, "Pricing must not advertise archive or multi-Passport models that do not exist.");
assert.match(planSections, /Unlimited Passport image exports/, "Pro should describe the implemented repeatable export capability.");
assert.match(planSections, /Direct sync access when configured/, "Pro should describe direct sync as conditional on configured connectors.");
assert.match(planSections, /currentPlan === "pro" \? \([\s\S]*?Pro active[\s\S]*?\) : \(/, "The active Pro state must render as status, not reuse the checkout action.");
assert.match(app, /function upgradeToPro\(\)[\s\S]*?const checkoutUrl = getProCheckoutUrl\(\);[\s\S]*?if \(!checkoutUrl && !isDemoPreviewEnabled\(\)\)[\s\S]*?Pro checkout is not open yet[\s\S]*?return;[\s\S]*?if \(!authSession\)/, "An unavailable production checkout must fail closed before asking a visitor to create an account.");
assert.match(planSections, /proCheckoutAvailable[\s\S]*?Pro checkout opening soon/, "Pricing must visibly disclose when the advertised Pro checkout is not open.");
assert.doesNotMatch(app, /maxActivePassports/, "Unused multi-Passport entitlements must not imply a management model that does not exist.");
assert.match(marketingPages, /resource-action-card/, "Resources should provide actionable routes instead of static explainer cards.");
assert.doesNotMatch(marketingPages, /title: "OAuth sign-in"[\s\S]*?route: "oauth"/, "Resources must not route a generic OAuth explainer into the default TopstepX API-key flow.");
assert.match(marketingPages, /https:\/\/discord\.gg\/B83Czu3pAf/, "Community should keep the verified permanent Discord invite.");
assert.match(marketingPages, /Join Cova on Discord/, "Community should expose a direct Discord action.");
assert.match(marketingPages, /#trade-review/, "Community should describe the live trade-review room.");
assert.match(marketingPages, /#risk-discipline/, "Community should describe the live risk-discipline room.");
assert.match(marketingPages, /No live entry calls, paid signals, copy trading, account management, broker solicitation/, "Community should preserve the trading-safety boundaries.");
assert.doesNotMatch(marketingPages, /Product preview · community not open|What this preview proposes|Join the preview/, "Community should not retain obsolete preview-only language.");
assert.match(appRoutes, /"practice"/, "Practice/backtesting should be a real protected workspace route.");
assert.match(appRoutes, /legal-\(privacy\|terms\|security\)-\\d\+/, "Legal table-of-contents anchors must resolve back to their owning legal route.");
assert.match(appRoutes, /documentAnchor/, "Legal table-of-contents navigation must retain the concrete anchor id.");
assert.match(appRoutes, /getElementById[\s\S]*?scrollIntoView/, "Legal anchors must scroll after React renders the target section.");
assert.match(appRoutes, /current\.section === next && !current\.documentAnchor/, "Selecting a legal page from one of its anchors must normalize the route instead of retaining a stale anchor hash.");
assert.match(workspaceShell, /Practice/, "Workspace sidebar should expose the practice route.");
assert.match(app, /PracticeLab/, "App should render the PracticeLab route.");
assert.match(backtestingTerminal, /BacktestingTerminal/, "PracticeLab should render through the dedicated Backtesting terminal.");
assert.match(workspace, /Set practice account/, "PracticeLab should gate simulator access with a practice-account setup modal.");
assert.match(backtestingTerminal, /backtesting-chart-deck/, "PracticeLab should make the replay chart the dominant terminal surface.");
assert.match(workspace, /Choose date/, "PracticeLab should let traders jump to a specific historical date.");
assert.match(backtestingTerminal, /Buy \/ Long/, "PracticeLab should include a simulated buy action.");
assert.match(backtestingTerminal, /Sell \/ Short/, "PracticeLab should include a simulated sell action.");
assert.match(backtestingTerminal, /Close \/ Flatten/, "PracticeLab should close and track simulated practice trades.");
assert.match(backtestingTerminal, /Account balance/, "PracticeLab should show account balance and stats from simulated trades.");
assert.match(backtestingTerminal, /analysis\.readiness\.label/, "PracticeLab should summarize simulator evidence without granting live-trading permission.");
assert.doesNotMatch(practiceUi, /Live permission|earn permission/, "Practice UI must not claim authority over live sizing or trading permission.");
assert.doesNotMatch(backtesting, /Live-size ready|Building permission|live-trading permission|full live size|calling it live-size ready/, "Practice readiness calculations must remain simulation evidence, not live-trading authorization.");
assert.match(backtesting, /Practice sample ready/, "A mature simulator sample should be described as practice evidence only.");
assert.doesNotMatch(workspace, /saved brief history/i, "Insights must not advertise a brief archive that is not implemented.");
assert.match(workspace, /createPortal/, "Practice setup should render through a document-level portal instead of an overflow-clipped route shell.");
assert.match(workspace, /document\.body/, "Practice setup portal should mount against the document viewport.");
assert.match(dashboard, /dashboard-summary-strip/, "Risk Desk should use the approved compact summary grid.");
assert.match(dashboard, /dashboard-instrument-grid/, "Risk Desk should use a dedicated chart-and-evidence grid.");
assert.match(dashboardPreviewCss, /@media \(max-width:\s*1023px\)[\s\S]*?\.dashboard-summary-strip\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, "Risk Desk summary grid should collapse to viewport-safe tracks on tablet and mobile.");
assert.match(backtestingLabCss, /\.backtesting-workbench\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/, "Practice should give the chart a shrinkable dominant track.");
assert.match(backtestingLabCss, /@media \(max-width: 900px\)[\s\S]*?\.backtesting-workbench\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/, "Practice should collapse to one viewport-safe track on tablet and mobile.");
assert.match(backtestingLabCss, /\.backtesting-chart-viewport\s*\{[\s\S]*?overflow:\s*hidden;/, "Practice should contain chart overflow at the terminal boundary.");
assert.match(backtestingLabCss, /\.backtesting-chart-viewport \.practice-tv-container\s*\{[\s\S]*?width:\s*100%;/, "Practice should keep the responsive chart inside its terminal width.");
assert.match(tradingViewHost, /TradingView Lightweight Charts/, "Practice should identify the active official chart renderer.");
assert.match(tradingViewHost, /Deterministic demo tape/, "Practice should disclose that the current tape is deterministic demo data.");
assert.match(tradingViewHost, /not historical market data/, "Practice should preserve the demo-data boundary.");
assert.match(importPanels, /if \(firm\.status === "guided"\)[\s\S]*?if \(!entitlements\.canUseDirectSync\)/, "CSV-guided providers must remain available on Free before direct-sync entitlement checks.");
assert.match(importPanels, /selectedFirm\.status !== "guided"[\s\S]*?Unlock sync/, "CSV-only provider cards must not advertise an unavailable direct-sync upgrade.");
assert.match(app, /if \(!entitlements\.canUseDirectSync\)/, "App-level OAuth entry must enforce the direct-sync entitlement.");
assert.doesNotMatch(tradingViewHost, /Drop `charting_library\.js`/, "Practice must not expose developer installation instructions in the product UI.");
assert.match(workspaceShell, /No live brokerage execution/, "Workspace safety copy should distinguish simulation from live brokerage execution.");
assert.match(app, /const hasSampleTrades = trades\.some\(\(trade\) => trade\.id\.startsWith\("demo-"\)\)/, "Any demo row should keep a mixed Passport visibly sample-derived.");
assert.match(app, /const isSampleReview = hasSampleTrades/, "Passport should derive sample provenance from any demo rows in the review.");
assert.match(tradeSourceLabel, /Sample[\s\S]*CSV[\s\S]*sourceLabels\.join\(" \+ "\)/, "Mixed demo and imported rows should disclose both sources.");
assert.match(tradeSourceLabel, /CSV:\s*"Imported CSV review"/, "Imported CSV history should not remain labeled as a sample funded review.");
assert.match(app, /isSampleReview=\{isSampleReview\}/, "Passport should receive explicit sample provenance.");
assert.match(workspace, /passport-sample-watermark/, "Sample Passports should carry a watermark inside the exported card node.");
assert.match(workspace, /SAMPLE REVIEW · DEMO DATA/, "Sample Passport watermark must state that its data is demo-only.");
assert.match(workspace, /Sample analysis · not account verification/, "Sample Passport proof copy must not claim account verification.");
assert.doesNotMatch(workspace, /high-confidence review|pressure tested|zero-breach week/i, "Passport must not attach unsupported verification or time-window claims to user-supplied history.");
assert.match(workspace, /USER-SUPPLIED DATA · NOT ACCOUNT VERIFIED/, "Imported Passport exports must disclose that source data is user supplied and not account verified.");
assert.match(workspace, /function getPassportExportDisclosure[\s\S]*DEMO DATA · NOT ACCOUNT VERIFIED · LOCAL PNG · USER CONTROLLED[\s\S]*USER-SUPPLIED DATA · NOT ACCOUNT VERIFIED · LOCAL PNG · USER CONTROLLED/, "Passport needs one canonical lifecycle disclosure for sample and user-supplied exports.");
assert.ok((workspace.match(/getPassportExportDisclosure\(isSampleReview\)/g) || []).length >= 3, "Passport card, composed PNG, and fallback export must use the same lifecycle disclosure.");
assert.match(workspace, /PASSPORT_PREFERENCES_STORAGE_KEY/, "Implemented Passport preferences must have an owner-scoped persistence key matching the Privacy disclosure.");
assert.doesNotMatch(workspace, /rank: "Blown"/, "Passport ranks should not shame a red account with a non-strategy tier.");
assert.doesNotMatch(workspace, /passport-(?:tier|card-skin)-blown/, "Passport internals should use rebuild language for red Bronze states.");
assert.doesNotMatch(workspace, /Verified trades/, "Passport should call imported rows reviewed trades, not verified trades.");
assert.match(workspace, /passport-profile-identity/, "Passport should present a believable anonymous trader identity.");
assert.match(workspace, /passport-profile-sparkline/, "Passport should include a compact account-path sparkline for expressive proof.");
assert.match(workspace, /passport-rank-progress/, "Passport should show the next rank target as a visible progress cue.");
assert.match(workspace, /type PassportExportPresetId = "feed" \| "square" \| "story"/, "Passport should support feed, square, and story exports.");
assert.match(workspace, /Feed 4:5/, "Passport should expose a 4:5 feed preset.");
assert.match(workspace, /Square 1:1/, "Passport should expose a square preset.");
assert.match(workspace, /Story 9:16/, "Passport should expose a story preset.");
assert.match(workspace, /aria-pressed=\{shareModeId === mode\.id\}/, "Passport share-mode choices should expose their selected state.");
assert.match(workspace, /aria-pressed=\{exportPresetId === preset\.id\}/, "Passport export choices should expose their selected state.");
assert.match(workspace, /composePassportExport/, "Passport PNG downloads should be composed into the selected social preset.");
assert.match(workspace, /await document\.fonts\.ready/, "Passport export should wait for loaded page fonts before capture.");
assert.match(workspace, /skipFonts:\s*true/, "Passport export should avoid cross-origin Google Fonts re-embedding errors.");
assert.match(indexCss, /\.passport-card-hitbox\.passport-credential-hitbox\s*\{[\s\S]*?aspect-ratio:\s*4\s*\/\s*5/, "Passport's primary card should use a postable 4:5 aspect ratio.");
assert.match(indexCss, /@media \(max-width: 860px\)[\s\S]*?\.passport-card-hitbox\.passport-credential-hitbox\s*\{[\s\S]*?min-height:\s*0/, "Passport mobile should not inherit the old 800px credential minimum height.");
assert.match(indexCss, /@media \(max-width: 1180px\)[\s\S]*?\.passport-share-rail\s*\{[\s\S]*?order:\s*-1/, "Passport controls should appear before the long card preview on narrow screens.");
assert.match(authPanels, /Enter dev preview/, "Dev preview must remain available for Raf's review flow.");
assert.doesNotMatch(authPanels, /Passport history/, "Signup must not advertise a Passport archive that does not exist.");
assert.match(authPanels, /Practice history/, "Signup should name the implemented saved Practice history instead.");
assert.match(authPanels, /dialogRef/, "Auth dialog behavior must be scoped to the rendered modal.");
assert.match(authPanels, /\.inert\s*=\s*true/, "The open auth modal must make background siblings inert.");
assert.match(authPanels, /event\.key !== "Tab"/, "The auth modal must trap keyboard tab focus.");
assert.match(authPanels, /event\.key === "Escape"/, "The auth modal must support Escape dismissal.");
assert.match(authPanels, /openerRef[\s\S]*?\.focus\(\)/, "Closing auth must restore focus to the invoking control.");
assert.match(oauthConnectPage, /!hasConfiguredProvider && !devProviderPreview/, "Missing provider configuration must render a production-safe unavailable state rather than a sign-in simulation.");

console.log("ui-content-regression: all checks passed");
