import {assertFrozenSource} from './helpers/frozen-source-assertion.mjs';
import {restoreApprovedPublicRefreshSource} from './helpers/approved-public-page-refresh.mjs';
import {restoreApprovedPublicSkySource} from './helpers/approved-public-page-sky.mjs';
import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{createServer}from'vite';import{createElement}from'react';import{renderToStaticMarkup}from'react-dom/server';
test('Every non-home header page receives the same decorative starfield without changing its content or protected routes',async()=>{
 const app=readFileSync('src/App.tsx','utf8');for(const r of ['features','pricing','resources','community'])assert(app.includes('<RouteFrame key="'+r+'" sky>'),'Header destination '+r+' must opt into the shared sky');
 assert.equal((app.match(/<RouteFrame[^>]* sky>/g)||[]).length,4,'Exactly the four requested routes, not workspace or legal/auth pages');
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});try{const{RouteFrame}=await server.ssrLoadModule('/src/components/LayoutShell.tsx');const html=renderToStaticMarkup(createElement(RouteFrame,{sky:true},createElement('p',null,'Existing page content')));assert.match(html,/data-public-page-sky="true"/);assert.equal((html.match(/class="cova-landing-stars"/g)||[]).length,1);assert.match(html,/Existing page content/);const ordinary=renderToStaticMarkup(createElement(RouteFrame,null,createElement('p',null,'Existing page content')));assert.doesNotMatch(ordinary,/cova-landing-stars|cova-public-page-sky/)}finally{await server.close()}
 const css=readFileSync('src/styles/publicPageSky.css','utf8');assert.match(css,/background: #05070c/);assert.match(css,/features-showcase-atmosphere/);assert.match(css,/resources-oa-atmosphere/);assert.match(css,/pricing-showcase-top-fade/);assert.doesNotMatch(css,/workspace-sidebar|oa-dashboard-app|cova-space-hero/);
});

test('Only the approved route sky flags and shared shell decoration may change; page content and all account logic remain exact',()=>{
 const b=JSON.parse(readFileSync('scripts/fixtures/public-page-sky-baseline.json','utf8'));
 for(const[p,h]of [['src/App.tsx',b.appLF],['src/components/LayoutShell.tsx',b.layoutLF]])assert.equal(createHash('sha256').update(restoreApprovedPublicSkySource(p,readFileSync(p,'utf8')).replaceAll('\r\n','\n')).digest('hex'),h,p);
 for(const[p,h]of Object.entries(b.protected))assertFrozenSource(p,restoreApprovedPublicRefreshSource(p,readFileSync(p,'utf8')),h);
});
