// Actual App layout against disposable local fixture. Never touches hosted user notes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
const out=process.env.COVA_MOBILE_EVIDENCE || '/workspace/cova-source-recovery/mobile-wordmark/evidence';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const receipts=[],errors=[];

async function makePage(seed) {
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const owner=crypto.randomUUID();
await context.addInitScript(owner=>{
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
 await page.goto('http://127.0.0.1:4179/#dashboard',{waitUntil:'domcontentloaded'});
 await page.getByText(seed?'Saved to your account':'Review account storage',{exact:true}).waitFor({timeout:15000});
 await page.waitForTimeout(600);
 const close=page.getByRole('button',{name:'Close auth panel',exact:true});
 if(await close.count())await close.evaluate(b=>b.click());
 assert.equal(await page.locator('vite-error-overlay').count(),0);
 return {page,context,owner};
}

async function check(page,width,zoom,scroll=0) {
 await page.setViewportSize({width,height:844});
 await page.evaluate(({zoom,scroll})=>{document.documentElement.style.fontSize=16*zoom/100+'px';window.scrollTo(0,scroll);},{zoom,scroll});
 await page.waitForTimeout(150);
 const data=await page.evaluate(()=>{
  const header=document.querySelector('.workspace-top-header');
  const logo=header.querySelector('.header-mobile-brand img');
  const button=header.querySelector('[aria-label="Toggle menu"]');
  const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const panel=document.querySelector('[aria-label="Account storage"]');
  return {logo:rect(logo),button:rect(button),header:rect(header),panel:rect(panel),logoSrc:logo.getAttribute('src'),logoLoaded:logo.complete&&logo.naturalWidth>0,
   veil:getComputedStyle(header.querySelector('.header-scroll-veil')).display,headerDisplay:getComputedStyle(header).display,scrollWidth:document.documentElement.scrollWidth};
 });
 if(width<768){
  assert.equal(data.veil,'none');assert.equal(data.logoSrc,'/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png');assert(data.logoLoaded);
  assert(data.logo.left>=0 && data.logo.right+16<data.button.left);
  assert(data.button.width>=44&&data.button.height>=44);
  assert(data.scrollWidth<=width);
  if(scroll===0)assert(data.panel.top>data.header.bottom,JSON.stringify({width,zoom,scroll,...data}));
 }else if(width>850)assert.equal(data.headerDisplay,'none');
 else assert.equal(data.veil,'none','Intermediate workspace uses the mobile header');
 receipts.push({width,zoom,scroll,...data});
 await page.screenshot({path:`${out}/header-${width}-${zoom}-${scroll}.png`});
 if(width<768){
  const toggle=page.getByRole('button',{name:'Toggle menu',exact:true});
  await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  const navigation=page.getByRole('navigation',{name:'Workspace navigation',exact:true});await navigation.waitFor();
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#operator-mobile-menu')).opacity)>0.99);
  await page.screenshot({path:`${out}/menu-${width}-${zoom}-${scroll}.png`});
  await navigation.getByRole('button',{name:'Risk Desk',exact:true}).click();
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await navigation.waitFor({state:'detached'});
  await toggle.click();await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await navigation.waitFor({state:'detached'});
 }
}
try {
 const {page}=await makePage(true);
 for(const width of [320,375,390,430,768,850,1440])await check(page,width,100);
 for(const width of [320,390])await check(page,width,200);
 await check(page,390,100,400);
 await page.evaluate(()=>{window.scrollTo(0,0);});
 await page.getByRole('button',{name:'Go to Cova home',exact:true}).filter({visible:true}).click();
 assert.match(page.url(),/#overview/);
 assert.equal(await page.locator('.header-mobile-brand img').getAttribute('src'),'/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png');
 assert.deepEqual(errors,[]);
 await writeFile(out+'/receipt.json',JSON.stringify({passed:true,cases:receipts.length,receipts,errors,homeNavigationPassed:true},null,2));
 console.log(JSON.stringify({passed:true,cases:receipts.length,homeNavigationPassed:true},null,2));
}finally {await browser.close();}
