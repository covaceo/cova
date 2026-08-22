import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = async (path) => {
  try {
    return await readFile(join(root, path), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
};

const [packageJson, app, hero, intro, ribbon, shaders, liquidButton, liquidSource, liquidLicense, darkGlassAction, startFreeButton, css, main, vercelConfig, planSections, storyStrip, indexCss, structureCollection, structureBackground, structureRenderer, structureLicense] = await Promise.all([
  read("package.json"),
  read("src/App.tsx"),
  read("src/components/MarketingHero.tsx"),
  read("src/components/CovaSiteIntro.tsx"),
  read("src/components/CovaRibbonField.tsx"),
  read("src/components/covaRibbonFieldShaders.ts"),
  read("src/components/CovaLiquidMetalSignupButton.tsx"),
  read("src/components/cova-liquid-metal-signup.html"),
  read("src/components/covaLiquidMetal/THIRD_PARTY_LICENSE.md"),
  read("src/components/CovaDarkGlassSecondaryAction.tsx"),
  read("src/components/StartFreeButton.tsx"),
  read("src/styles/threeUiLanding.css"),
  read("src/main.tsx"),
  read("vercel.json"),
  read("src/components/PlanSections.tsx"),
  read("src/components/StoryStrip.tsx"),
  read("src/index.css"),
  read("src/components/structureFlow/StructureFlowCollection.tsx"),
  read("src/components/structureFlow/StructureFlowBackground.tsx"),
  read("src/components/structureFlow/structureFlowRenderer.ts"),
  read("src/components/structureFlow/THIRD_PARTY_LICENSE.md"),
]);

assert.match(packageJson, /"test":\s*"[^"]*test:threeui-landing/, "Aggregate test must include the ThreeUI landing contract.");
assert.match(packageJson, /"test:threeui-landing":\s*"node scripts\/threeui-landing-regression\.mjs"/);
assert.equal(intro, "", "The rejected site intro component must be deleted.");
assert.doesNotMatch(app, /CovaSiteIntro|shouldShowCovaSiteIntro|siteIntroActive|setSiteIntroActive/, "The App shell must not retain rejected intro state or auth deferral.");
assert.doesNotMatch(css, /\.cova-site-intro/, "The rejected intro must leave no dead styling.");
assert.match(hero, /import \{ CovaRibbonField \} from "\.\/CovaRibbonField";/);
assert.match(hero, /import \{ CovaLiquidMetalSignupButton \} from "\.\/CovaLiquidMetalSignupButton";/);
assert.match(hero, /market-hero-threeui/);
assert.match(hero, /<CovaRibbonField/);
assert.equal((hero.match(/<CovaLiquidMetalSignupButton/g) ?? []).length, 2, "The hero must render Liquid Metal for signed-out and signed-in primary states only.");
assert.match(hero, /<CovaLiquidMetalSignupButton[\s\S]*text="Open dashboard"[\s\S]*onClick=\{\(\) => go\("dashboard"\)\}/, "Signed-in Liquid Metal must open the real dashboard.");
assert.match(hero, /<CovaLiquidMetalSignupButton[\s\S]*text="Sign up"[\s\S]*onClick=\{\(\) => openAuth\("signup"\)\}/, "Signed-out Liquid Metal must open the real signup sheet.");
assert.doesNotMatch(hero, /<StartFreeButton/, "The hero must not keep the previous plain primary CTA beside Liquid Metal.");
assert.match(startFreeButton, /children = "Sign up"/, "The shared lightweight button must remain available for header, mobile, and secondary routes.");
assert.match(hero, /import \{ CovaDarkGlassSecondaryAction \} from "\.\/CovaDarkGlassSecondaryAction";/);
assert.equal((hero.match(/<CovaDarkGlassSecondaryAction/g) ?? []).length, 1, "The hero must render one secondary Dark Glass action.");
assert.match(hero, /label=\{isSignedIn \? "Link account" : "See how it works"\}/);
assert.match(hero, /icon=\{isSignedIn \? "fingerprint" : "play"\}/);
assert.match(hero, /onClick=\{isSignedIn \? \(\) => go\("import"\) : scrollHowItWorks\}/);
assert.match(hero, /data-auth-state=\{isSignedIn \? "signed-in" : "signed-out"\}/, "Hero actions must expose auth state for collision-free mobile layout.");
assert.doesNotMatch(hero, /#39e3a6|#18c887|#b9f5df/i, "The simulated landing dashboard must not retain legacy green tokens.");
assert.match(main, /import "\.\/styles\/threeUiLanding\.css";/);

assert.match(ribbon, /createCovaRibbonFieldRenderer/);
assert.match(ribbon, /ResizeObserver/);
assert.match(ribbon, /IntersectionObserver/);
assert.match(ribbon, /visibilitychange/);
assert.match(ribbon, /prefers-reduced-motion: reduce/);
assert.match(ribbon, /webglcontextlost/);
assert.match(ribbon, /deleteBuffer/);
assert.match(ribbon, /deleteShader/);
assert.match(ribbon, /deleteProgram/);
assert.match(ribbon, /catch \(error\) \{[\s\S]*deleteShader\(vertex\)[\s\S]*throw error/, "Fragment compilation failure must release the already-compiled vertex shader.");
assert.match(ribbon, /function disposeRibbonResources/);
assert.match(ribbon, /if \(!buffer\) \{[\s\S]*disposeRibbonResources[\s\S]*return null/, "A null WebGL buffer allocation must release every compiled resource and select the fallback.");
assert.match(ribbon, /catch \(error\) \{[\s\S]*disposeRibbonResources[\s\S]*throw error/, "Post-link initialization exceptions must release every resource created so far.");
assert.match(ribbon, /window\.addEventListener\("pointermove"/);
assert.match(ribbon, /data-render-state/);
assert.match(ribbon, /data-pointer-x/);
assert.match(shaders, /RIBBON_FIELD_VERTEX_SHADER/);
assert.match(shaders, /RIBBON_FIELD_FRAGMENT_SHADER/);
assert.match(shaders, /uniform vec2 pointer/);
assert.match(shaders, /#4f7dff|0\.31,\s*0\.49,\s*1\.0/i, "Ribbon shader must carry Cova cobalt.");
assert.doesNotMatch(shaders, /vec3 teal|0\.17,\s*0\.83,\s*0\.75/i, "The source teal identity must be removed from the Cova adaptation.");

assert.match(liquidButton, /cova-liquid-metal-signup\.html\?raw/);
assert.match(liquidButton, /IntersectionObserver/);
assert.match(liquidButton, /visibilitychange/);
assert.match(liquidButton, /prefers-reduced-motion: reduce/);
assert.match(liquidButton, /event\.source !== frameRef\.current\?\.contentWindow/);
assert.match(liquidButton, /data-state/);
assert.match(liquidSource, /<button class="btn" id="btn" type="button">/);
assert.match(liquidSource, /aria-label/);
assert.match(liquidSource, /uHover/);
assert.match(liquidSource, /uPress/);
assert.match(liquidSource, /uPtr/);
assert.match(liquidSource, /idleMotionScale/);
assert.match(liquidSource, /reducedMotion/);
assert.match(liquidSource, /#08090c/i);
assert.match(liquidSource, /#e8eeff/i);
assert.match(liquidSource, /#4f7dff/i);
assert.match(liquidSource, /#6f96ff/i);
assert.doesNotMatch(liquidSource, /rainbow|#18c887|#b9f5df|#bf8964|#cc956d/i, "Liquid Metal must not retain rainbow, green, or copper identity markers.");
assert.match(liquidLicense, /MIT License/);
assert.match(liquidLicense, /ThreeUI|Meng To|Design\+Code/i);
assert.match(liquidLicense, /Circle Buttons|Dark Glass/i);
assert.match(vercelConfig, /frame-ancestors 'none'/, "Cova must remain protected from third-party framing.");
assert.match(vercelConfig, /frame-src 'self'/, "Cova must permit its own sandboxed Liquid Metal srcdoc frame.");
assert.doesNotMatch(vercelConfig, /frame-src 'none'/, "Deployment CSP must not block the Liquid Metal frame.");
const liquidScriptBodies = [...liquidSource.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
assert.equal(liquidScriptBodies.length, 2, "Liquid Metal CSP must bind both reviewed inline scripts.");
for (const scriptBody of liquidScriptBodies) {
  const browserNormalizedBody = scriptBody.replace(/\r\n?/g, "\n");
  const hash = createHash("sha256").update(browserNormalizedBody).digest("base64");
  assert.match(vercelConfig, new RegExp(`'sha256-${hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`), "Deployment CSP must allow only the exact reviewed Liquid Metal inline script body.");
}
assert.doesNotMatch(packageJson, /@designcodeio\/threeui/, "The preview vendors the reviewed MIT source instead of pulling the complete ThreeUI catalog into Cova.");
assert.match(darkGlassAction, /type DarkGlassSecondaryActionProps/);
assert.match(darkGlassAction, /aria-label=\{label\}/);
assert.match(darkGlassAction, /dark-glass-secondary__aura/);
assert.match(darkGlassAction, /dark-glass-secondary__rim/);
assert.match(darkGlassAction, /dark-glass-secondary__face/);
assert.match(darkGlassAction, /onClick=\{onClick\}/);

assert.match(planSections, /import \{ StructureFlowCollection \} from "\.\/structureFlow\/StructureFlowCollection";/);
assert.match(planSections, /<section aria-labelledby="cova-closing-title" className="cova-closing-section">[\s\S]*<StructureFlowCollection variant="structure-flow" className="cova-closing-structure-flow" \/>/, "The requested ThreeUI Structure Flow variant must be the closing background layer.");
for (const protectedCopy of ["One better decision at a time", "Stop repeating the trade", "that keeps costing you.", "Review behavior. Tighten limits. Build proof of discipline.", "Explore Risk Passport"]) {
  assert.match(planSections, new RegExp(protectedCopy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Closing copy/structure changed unexpectedly: ${protectedCopy}`);
}
assert.match(planSections, /className="cova-closing-grid"/, "The existing closing DOM structure must remain intact.");
const closingCss = indexCss.slice(indexCss.indexOf(".cova-closing-section"), indexCss.indexOf(".cova-site-footer"));
assert.doesNotMatch(closingCss, /#f0bb91|cova-logo-minimal-black\.svg/i, "The closing section must not retain peach or the masked Cova logo.");
assert.match(closingCss, /\.cova-closing-section\s*\{[\s\S]*background:\s*#050607/);
assert.match(closingCss, /\.cova-closing-structure-flow\s*\{[\s\S]*position:\s*absolute[\s\S]*inset:\s*0/);
assert.match(structureCollection, /export function StructureFlowCollection/);
assert.match(structureCollection, /variant\?:\s*"structure-flow"/);
assert.match(structureCollection, /lazy\(\(\) =>[\s\S]*import\("\.\/StructureFlowBackground"\)/, "Structure Flow must stay out of the initial landing bundle.");
assert.match(structureCollection, /rootMargin:\s*"600px 0px"/, "Structure Flow should load only when the closing section approaches the viewport.");
assert.match(structureBackground, /ResizeObserver/);
assert.match(structureBackground, /IntersectionObserver/);
assert.match(structureBackground, /visibilitychange/);
assert.match(structureBackground, /prefers-reduced-motion:\s*reduce/);
assert.match(structureBackground, /webglcontextlost/);
assert.match(structureBackground, /data-render-state/);
assert.match(structureRenderer, /const count = 15000/);
assert.match(structureRenderer, /const radius = 25/);
assert.match(structureRenderer, /camera\.position\.z = 30/);
assert.match(structureRenderer, /camera\.position\.y = 5/);
assert.match(structureRenderer, /color:\s*0xffffff/);
assert.match(structureRenderer, /THREE\.AdditiveBlending/);
assert.match(packageJson, /"three128":\s*"npm:three@0\.160\.1"/, "Structure Flow must retain its isolated upstream Three.js runtime range.");
assert.match(structureRenderer, /import \* as THREE from "three128"/);
assert.doesNotMatch(`${structureCollection}\n${structureBackground}\n${structureRenderer}`, /iframe|threeui\.com/);
assert.match(structureLicense, /MIT License/);
assert.match(structureLicense, /Structure Flow|ThreeUI|Meng To/i);

assert.doesNotMatch(storyStrip, /#18c887|#b9f5df|text-emerald/i, "How Cova Works must not retain legacy green.");
assert.match(storyStrip, /#4f7dff|#6f96ff/);
assert.match(css, /\.story-strip-simple\s*\{[\s\S]*#08090c[\s\S]*rgba\(79, 125, 255/);
assert.match(css, /\.story-strip-simple \.story-section-kicker::before\s*\{[\s\S]*background:\s*#4f7dff/);
assert.match(css, /\.trade-proof-summary-panel\s*\{[\s\S]*border-top:\s*1px solid rgba\(79, 125, 255/);
assert.match(css, /\.trade-proof-ledger\s*\{[\s\S]*border-top:\s*1px solid rgba\(79, 125, 255/);
assert.match(css, /\.trade-proof-step-row:hover\s*\{[\s\S]*rgba\(79, 125, 255/);

assert.match(packageJson, /"@fontsource-variable\/bricolage-grotesque"/);
assert.match(packageJson, /"@fontsource\/dm-mono"/);
assert.match(main, /import "@fontsource-variable\/bricolage-grotesque";/);
assert.match(main, /import "@fontsource\/dm-mono\/latin-400\.css";/);
assert.match(main, /import "@fontsource\/dm-mono\/latin-500\.css";/);

assert.match(css, /\.cova-ribbon-field/);
assert.match(css, /\.market-hero-threeui/);
assert.match(css, /--font-cova-display:\s*"Bricolage Grotesque Variable"/);
assert.match(css, /--font-cova-editorial:\s*"Instrument Serif"/);
assert.match(css, /--font-cova-technical:\s*"DM Mono"/);
assert.match(css, /\.market-hero-threeui \.market-hero-title\s*\{[\s\S]*var\(--font-cova-display\)/);
assert.match(css, /\.market-hero-threeui \.market-hero-editorial\s*\{[\s\S]*var\(--font-cova-editorial\)/);
assert.match(css, /\.market-hero-threeui \.market-hero-signal\s*\{[\s\S]*letter-spacing:\s*-0\.035em !important;/, "Only the word patterns must use relaxed Bricolage tracking.");
assert.match(css, /\.dark-glass-secondary\s*\{/);
assert.match(css, /\.dark-glass-secondary__aura\s*\{/);
assert.match(css, /@keyframes cova-dark-glass-orbit/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.dark-glass-secondary__aura/);
assert.doesNotMatch(css, /\.dark-glass-secondary__label::after/, "The Dark Glass text label must not carry a decorative underline.");
assert.match(css, /\.market-hero-threeui \.market-reaction-heading\s*\{[\s\S]*justify-content:\s*center/, "The review heading must center above the review row.");
assert.match(css, /\.market-hero-threeui \.market-reaction-heading span::before\s*\{[\s\S]*display:\s*none !important;[\s\S]*content:\s*none !important;/, "The decorative dash before the review heading must be removed.");
assert.match(css, /\.market-hero-threeui \.market-reaction-heading\s*\{[\s\S]*border-bottom:\s*1px solid rgba\(232, 238, 255, 0\.62\)/, "The review heading rule must use polar grey instead of orange/copper.");
assert.match(css, /\.market-hero-threeui \.market-reaction-strip\s*\{[\s\S]*border-top:\s*0 !important;[\s\S]*border-bottom:\s*1px solid rgba\(232, 238, 255, 0\.24\)/, "The review row must not retain a second warm top line.");
assert.match(css, /\.market-hero-threeui \.market-reaction-item \+ \.market-reaction-item\s*\{[\s\S]*border-left:\s*1px solid rgba\(232, 238, 255, 0\.2\)/, "Review separators must use neutral polar grey.");
assert.match(css, /\.market-hero-threeui \.hero-dashboard-screen\s*\{[\s\S]*background:\s*#08090c/, "The simulated dashboard must be opaque so Ribbon Field cannot bleed through it.");
assert.match(css, /\.market-hero-threeui \.hero-dashboard-shell\s*\{[\s\S]*backdrop-filter:\s*none/, "The simulated dashboard shell must not refract the hero background.");
assert.match(css, /\.market-hero-threeui \.dashboard-candle-body-up\s*\{[\s\S]*fill:\s*#4f7dff/, "Positive sample candles must use Cova cobalt instead of the old green identity.");
assert.match(css, /@media \(max-width: 767px\)/);
assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.market-hero-actions\[data-auth-state="signed-in"\] \.hero-primary-cta-wrap\s*\{[\s\S]*flex:\s*0 0 100%/, "Signed-in mobile Liquid Metal must own a full row instead of occluding Link account.");
assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.market-hero-actions\[data-auth-state="signed-in"\]\s*\{[\s\S]*row-gap:\s*1\.5rem !important/, "Signed-in mobile rows must clear Liquid Metal's transparent iframe padding.");
assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.mobile-hero-dossier\s*\{[\s\S]*#08090c/, "The phone proof card must be an opaque Cova surface.");
assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.market-hero-threeui \.market-hero-copy\s*\{[\s\S]*filter:\s*none\s*!important/, "Phone copy must not be captured or displayed in a blurred entrance state.");
assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.cova-ribbon-field canvas\s*\{[\s\S]*opacity:\s*0\.62\s*!important[\s\S]*brightness\(0\.72\)\s*!important/, "Phone composition must dim the field behind full-width copy.");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
for (const approved of ["#03050b", "#e8eeff", "#4f7dff", "#6f96ff"]) {
  assert.match(`${ribbon}\n${shaders}\n${css}`, new RegExp(approved, "i"), `Missing approved Cova landing color ${approved}.`);
}
for (const forbidden of ["#18c887", "#39e3a6", "#84cc16", "#f59e0b", "#f97316", "#ec4899"]) {
  assert.doesNotMatch(`${ribbon}\n${shaders}\n${css}`, new RegExp(forbidden, "i"), `Off-direction identity color remains in the Ribbon Field layer: ${forbidden}.`);
}

console.log("threeui-landing-regression: rejected intro removed; cobalt Ribbon Field, lifecycle cleanup, responsive dimming, and Cova hero integration contract passed");
