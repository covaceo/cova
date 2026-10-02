// Actual App layout against disposable local fixture. Never touches hosted user notes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
const out=process.env.COVA_MOBILE_EVIDENCE || '/workspace/cova-source-recovery/mobile-header-all-routes/evidence';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const receipts=[],errors=[];

async function makePage(seed) {
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const owner=crypto.randomUUID();
if(seed) await context.addInitScript(owner=>{
 if(window.top!==window)return;
 owner=localStorage.getItem("qa-owner-override")||owner;
 window.__owner=owner;
 window.__qaSession={user:{id:owner,email:'synthetic@example.invalid',app_metadata:{plan:'pro'}},access_token:'qa-'+owner};
 localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'qa-session',email:'synthetic@example.invalid',signedInAt:'2026-10-01'}));

},owner);
await context.route('**/*', route=>route.request().url().startsWith('http://127.0.0.1:4179/') ? route.fallback() : route.abort());
await context.route('**/api/**',async route=>{
 if(route.request().url().includes('/api/workspace'))return route.continue();
 if(route.request().url().includes('/api/auth/consent'))return route.fulfill({json:{accepted:true}});
 return route.fulfill({status:404,json:{error:'Synthetic local fixture: not available'}});
});

 if(seed) {
  const headers={Authorization:'Bearer qa-'+owner};
  assert.equal((await context.request.post('http://127.0.0.1:4179/api/workspace',{headers,data:{owner,action:'consent',disclosure:'workspace-cloud-v1'}})).status(),200);
 }
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4179/#overview',{waitUntil:'domcontentloaded'});

 await page.waitForTimeout(600);
 const close=page.getByRole('button',{name:'Close auth panel',exact:true});
 if(await close.count())await close.evaluate(b=>b.click());
 await page.getByText('Signed in. Account stats are unlocked.',{exact:true}).waitFor({state:'hidden',timeout:10000});
 assert.equal(await page.locator('vite-error-overlay').count(),0);
 return {page,context,owner};
}

const wordmark='/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png';
async function check(page,signed,route,width=390,zoom=100,scroll=0){
 await page.setViewportSize({width,height:844});
 await page.evaluate(({route,zoom})=>{document.documentElement.style.fontSize=16*zoom/100+'px';location.hash=route;},{route,zoom});
 await page.waitForFunction(route=>document.querySelector('.cova-site-header')?.dataset.section===route,route);
 await page.evaluate(scroll=>window.scrollTo(0,scroll),scroll);
 await page.waitForTimeout(250);
 const data=await page.locator('.cova-site-header').evaluate(h=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const brand=h.querySelector('.header-mobile-brand'),logo=brand.querySelector('img'),toggle=h.querySelector('[aria-label="Toggle menu"]');
  return {headerDisplay:getComputedStyle(h).display,brandDisplay:getComputedStyle(brand).display,veil:getComputedStyle(h.querySelector('.header-scroll-veil')).display,src:logo.getAttribute('src'),loaded:logo.complete&&logo.naturalWidth>0,brand:rect(brand),toggle:rect(toggle),signedMarketing:h.classList.contains('signed-in-marketing-header-shell'),workspace:h.classList.contains('workspace-top-header')};
 });
 assert.equal(data.src,wordmark);assert(data.loaded);
 const mobile=data.headerDisplay!=='none' && data.brandDisplay!=='none';
 if(mobile){
  assert.equal(data.veil,'none',JSON.stringify({signed,route,width,data}));
  assert(data.brand.left>=0&&data.brand.right+16<data.toggle.left);
  assert(data.toggle.right<=width&&data.toggle.width>=44&&data.toggle.height>=44);
  assert(data.brand.height>=44);
  const toggle=page.getByRole('button',{name:'Toggle menu',exact:true});
  await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  const menu=page.locator('#operator-mobile-menu');await menu.waitFor();
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#operator-mobile-menu')).opacity)>0.99);
  assert.equal(await menu.getAttribute('aria-label'),signed?'Workspace navigation':'Site navigation');
  if(route==='overview'&&width===390&&zoom===100&&scroll===0)await page.screenshot({path:`${out}/${signed?'signed-in':'signed-out'}-home-menu.png`});
  await toggle.click();await menu.waitFor({state:'detached'});
 }
 else if(data.headerDisplay!=='none')assert.notEqual(data.veil,'none','Desktop veil preserved');
 receipts.push({signed,route,width,zoom,scroll,...data});
 if(['overview','dashboard'].includes(route))await page.screenshot({path:`${out}/${signed?'signed-in':'signed-out'}-${route}-${width}-${zoom}-${scroll}.png`});
}
try {
 const marketing=['overview','features','pricing','resources','community','privacy','terms','security','disclosures'];
 for(const signed of [false,true]){
  const {page,context}=await makePage(signed);
  for(const route of marketing)await check(page,signed,route);
  if(signed)for(const route of ['dashboard','import','oauth','rules','coach','passport'])await check(page,true,route);
  for(const width of [320,375,430,768,850,1024,1100,1101,1440])await check(page,signed,'overview',width);
  for(const width of [320,390])await check(page,signed,'overview',width,200);
  await check(page,signed,'overview',390,100,400);
  await page.evaluate(()=>window.scrollTo(0,0));
  const toggle=page.getByRole('button',{name:'Toggle menu',exact:true});await toggle.click();
  const menu=page.locator('#operator-mobile-menu');
  await menu.getByRole('button',{name:signed?'Risk Desk':'Features',exact:true}).click();
  await menu.waitFor({state:'detached'});
  assert.match(page.url(),signed?/#dashboard/:/#features/);
  await page.getByRole('button',{name:'Go to Cova home',exact:true}).filter({visible:true}).click();
  assert.match(page.url(),/#overview/);
  await context.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(out+'/receipt.json',JSON.stringify({passed:true,cases:receipts.length,receipts,errors,menuAndHomeNavigationPassed:true},null,2));
 console.log(JSON.stringify({passed:true,cases:receipts.length,menuAndHomeNavigationPassed:true}));
}finally{await browser.close();}
