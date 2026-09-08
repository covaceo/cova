import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(p,'utf8');
test('Features uses the approved actual engraved Diamond, never the retired mock',()=>{
 const source=read('src/components/FeaturesShowcasePage.tsx');
 assert.match(source,/PublicPassportExampleCard/);
 assert.doesNotMatch(source,/features-passport-identity|features-passport-score|Privacy mode: initials/);
});
test('public route changes never fade the whole document to black',()=>{
 const source=read('src/components/LayoutShell.tsx').split('export function RouteFrame')[1];
 assert.ok(source,'RouteFrame owner exists');
 assert.doesNotMatch(source,/opacity:\s*0|exit=/,'Public routes must keep content opaque and interruptible');
 assert.match(source,/useReducedMotion\(\)/);
 assert.match(source,/data-route-frame/);
});

test('route scroll cancels stale requests and never glides over outgoing content',()=>{
 const source=read('src/lib/appRoutes.ts');
 assert.doesNotMatch(source,/behavior: "smooth"/);
 assert.match(source,/cancelAnimationFrame/);
});
test('shared CTA geometry has one CSS owner, not competing Motion transforms',()=>{
 for(const file of ['StartFreeButton','GlassButton']) assert.doesNotMatch(read(`src/components/${file}.tsx`),/motion\.button|whileHover|whileTap/);
});
test('sandboxed Liquid Metal CTA receives its own bundled UI font',()=>{
 const source=read('src/components/CovaLiquidMetalSignupButton.tsx');
 assert.match(source,/inter-tight-latin-wght-normal\.woff2\?inline/);
 assert.match(source,/@font-face/);
 assert.match(source,/srcDoc=\{covaLiquidMetalWithFont\}/);
});

test('Features primary action respects signed-in state',()=>{
 const feature=read('src/components/FeaturesShowcasePage.tsx'),app=read('src/App.tsx');
 assert.match(feature,/isSignedIn \? "Open dashboard" : "Sign up"/);
 assert.match(feature,/isSignedIn \? go\("dashboard"\) : openAuth\("signup"\)/);
 assert.match(app,/<FeaturesPage go=\{go\} openAuth=\{openAuth\} isSignedIn=\{isSignedIn\}/);
});
