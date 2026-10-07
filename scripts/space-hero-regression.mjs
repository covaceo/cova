import {restoreApprovedFreePackagingSource} from './helpers/approved-free-packaging.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const read=p=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
test('the approved orbital artwork replaces the decorative ribbon in the first-fold hero',async()=>{
 const source=read('src/components/MarketingHero.tsx');assert.match(source,/cova-space-hero/);
 const part=source.slice(source.indexOf('export function Hero('),source.indexOf('function HeroMobileDossier'));
 assert.match(part,/src="\/media\/cova-orbital-hero-v1\.png"/);assert.doesNotMatch(part,/<CovaRibbonField/);
 assert.match(source,/cova-space-proof/,'Existing product proof and real reviews survive below the image');
 const image='public/media/cova-orbital-hero-v1.png';assert(existsSync(image));assert.equal(createHash('sha256').update(readFileSync(image)).digest('hex'),'81d211fd65e6dc8a0b2790b07762078b573c1978a7d2270bc2ffcfc10b9f12a7','Use the exact owner-approved artwork');
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true}});
 try{const {Hero}=await server.ssrLoadModule('/src/components/MarketingHero.tsx');for(const signed of [false,true]){const html=renderToStaticMarkup(createElement(Hero,{go:()=>{},openAuth:()=>{},isSignedIn:signed}));assert.match(html,/id="cova-space-title"/);assert.match(html,/cova-orbital-hero-v1/);assert.match(html,/imported trade history/);assert.match(html,signed?/Open dashboard/:/Sign up/);assert.match(html,signed?/Link account/:/See how it works/);assert.match(html,/Marcus R\./);assert.match(html,/Jasmine B\./);assert.doesNotMatch(html,/Trusted by 500|Watermelon|Intelligent Decisions/);}}finally{await server.close();}
});
test('the existing Cova routes, wordmark, workspace and lower product story stay exact',()=>{
 const frozen={"src/components/Navbar.tsx": "3c44686abcb793666c7f9b9b443380f9da949f6988d4dc5cdfe3ace396374dfc", "src/components/WorkspaceShell.tsx": "71714f99d625cd1c5df60b91a917a9992f9e5d2f1989e54f00ec9a74f24ff250", "src/components/WorkspaceSections.tsx": "8c29ea2e26fbb3214882ffd9d82f2fd8a98b898a8a85384ba9b248c93cdf4f99", "src/styles/workspaceDashboardShell.css": "eb1d523248807cc318d1fc9065eefa27040e70ab5d72f2da8924ec7853fbf09c", "src/styles/workspaceSidebarMotion.css": "ce86b58438c52fa461e1f7ebc577c4071b2574f7f3a15c8701862790dc9526c6"};
 for(const [path,hash] of Object.entries(frozen))assert.equal(createHash('sha256').update(read(path)).digest('hex'),hash,path);
 const appSource=read('src/App.tsx');assert.equal((appSource.match(/<StoryStrip openPassport=\{openPassport\} \/>/g)||[]).length,1,'Homepage CTA must use its original Passport authority exactly once');const app=appSource.replace('<StoryStrip openPassport={openPassport} />','<StoryStrip />').split('\n').filter(line=>!['import { HomeLanding } from "./components/landing/HomeLanding";','<HomeLanding go={go}>','</HomeLanding>'].includes(line.trim())).join('\n');assert.equal(createHash('sha256').update(app).digest('hex'),'577c6873e5dfc5a586dcc07dca1a502b28e644e45fdeb6f1cfb6f33863b8e283','All App handlers and non-Home presentation remain exact');
 const hero=read('src/components/MarketingHero.tsx');assert.match(hero,/text="Open dashboard" onClick=\{\(\) => go\("dashboard"\)\}/);assert.match(hero,/text="Sign up" onClick=\{\(\) => openAuth\("signup"\)\}/);assert.match(hero,/onClick=\{isSignedIn \? \(\) => go\("import"\) : scrollHowItWorks\}/);assert.match(hero,/\[data-feature="risk-desk"\]/);
 const css=read('src/styles/covaSpaceHero.css');assert.match(css,/data-section="overview"/);assert.match(css,/prefers-reduced-motion: reduce/);assert.doesNotMatch(css,/\.workspace-sidebar|\.astra-workspace-page|\.oa-dashboard-app/,'Marketing styles never leak into approved workspace');
});
