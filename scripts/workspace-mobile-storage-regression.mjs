// Actual App layout against disposable local fixture. Never touches hosted user notes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
const out=process.env.COVA_MOBILE_EVIDENCE || '/workspace/cova-source-recovery/mobile-header/evidence';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const receipts=[],errors=[];
const baseline=process.argv.includes('--baseline');
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
async function measure(page,state,width,zoom=100,safeTop=0) {
 await page.setViewportSize({width,height:844});
 await page.evaluate(zoom=>{document.documentElement.style.fontSize=16*zoom/100+'px';window.scrollTo(0,0);},zoom);
 await page.waitForTimeout(150);
 const box=await page.evaluate(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
  const header=document.querySelector('.workspace-top-header');
  const panel=document.querySelector('[aria-label="Account storage"]');
  const veil=header.querySelector('.header-scroll-veil');
  return {header:rect(header),veil:rect(veil),panel:rect(panel),viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
   actions:[...panel.querySelectorAll('button')].map(e=>({text:e.textContent,...rect(e)})),dashboard:document.querySelector('.astra-dashboard')?rect(document.querySelector('.astra-dashboard')):null};
 });
 const navBottom=Math.max(box.header.bottom,box.veil.bottom);
 if(baseline) assert(box.panel.top<navBottom,'Expected baseline header overlap');
 else if(width<=850) assert(box.panel.top>=navBottom+4,JSON.stringify({state,width,zoom,safeTop,...box}));
 assert(box.panel.left>=0 && box.panel.right<=width);
 for(const button of box.actions)assert(button.left>=box.panel.left && button.right<=box.panel.right+1,JSON.stringify({state,width,zoom,button}));
 assert(box.scrollWidth<=width,JSON.stringify({state,width,zoom,scrollWidth:box.scrollWidth}));
 if(width===1440){
  const original=await page.locator('[aria-label="Account storage"]').evaluate(e=>{e.classList.remove('workspace-sync-panel');const r=e.getBoundingClientRect();const d=document.querySelector('.astra-dashboard')?.getBoundingClientRect();const result={panel:{top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height},dashboard:d?{top:d.top,bottom:d.bottom,left:d.left,right:d.right,height:d.height}:null};e.classList.add('workspace-sync-panel');return result;});
  assert.deepEqual(original,{panel:box.panel,dashboard:box.dashboard},'Desktop layout must remain unchanged');
 }
 receipts.push({state,width,zoom,safeTop,...box});
 await page.screenshot({path:`${out}/${state}-${width}-${zoom}-${safeTop}.png`});
 if(width<=850 && !baseline){
  await page.evaluate(()=>{window.scrollTo(0,600);document.querySelector('[aria-label="Account storage"]').scrollIntoView({block:'start'});});
  const top=await page.locator('[aria-label="Account storage"]').evaluate(e=>e.getBoundingClientRect().top);
  assert(top>=navBottom+4,`Scroll target hidden: ${top} vs ${navBottom}`);
  for(const button of await page.locator('[aria-label="Account storage"] > button').all()) {
   await button.evaluate(e=>e.scrollIntoView({block:'center'}));
   const visible=await button.evaluate(e=>{const r=e.getBoundingClientRect();const top=Math.max(document.querySelector('.workspace-top-header').getBoundingClientRect().bottom,document.querySelector('.header-scroll-veil').getBoundingClientRect().bottom);const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.top>=top && r.bottom<=innerHeight && r.height>=44 && (hit===e||e.contains(hit));});
   assert(visible,`Action covered or untappable: ${state}/${width}/${zoom}/${await button.innerText()}`);
  }
  if(zoom===200){
   await page.locator('[aria-label="Account storage"] > button').first().evaluate(e=>e.scrollIntoView({block:'start'}));
   await page.screenshot({path:`${out}/${state}-${width}-${zoom}-actions.png`});
  }
 }
}
try {
 const saved=await makePage(true),review=await makePage(false);
 if(baseline){
  await saved.page.locator('[aria-label="Account storage"]').evaluate(e=>e.classList.remove('workspace-sync-panel'));
  await measure(saved.page,'baseline-overlap',390);
  await writeFile(out+'/baseline-receipt.json',JSON.stringify({baselineOverlapConfirmed:true,receipts},null,2));
  console.log('PASS baseline overlap reproduced');
 }else {
 for(const width of [320,375,390,430,768,850,1440]) {
  await measure(saved.page,'saved',width);await measure(review.page,'review',width);
 }
 await saved.page.evaluate(owner=>window.dispatchEvent(new StorageEvent('storage',{key:'cova-workspace-cache-v2:'+owner,newValue:'synthetic-layout-event'})),saved.owner);
 await saved.page.getByText('Account storage needs attention',{exact:true}).waitFor();
 for(const width of [320,375,390,430,1440])await measure(saved.page,'error',width);
 for(const width of [320,390]){await measure(saved.page,'error',width,200);await measure(review.page,'review',width,200);}
 await saved.page.evaluate(()=>{document.documentElement.style.fontSize='16px';window.scrollTo(0,0);});
 await saved.page.getByRole('button',{name:'Keep browser only',exact:true}).click();
 await saved.page.getByText('Saved on this browser only',{exact:true}).waitFor();
 await measure(saved.page,'local',390);
 try {
  const session=await saved.context.newCDPSession(saved.page);
  await session.send('Emulation.setSafeAreaInsets',{insets:{top:44,left:0,bottom:34,right:0}});
  await measure(saved.page,'local-safe-area',390,100,44);
 }catch(e){if(e.message.includes("was not found") || e.message.includes("wasn't found")||e.message.includes('Invalid parameters'))receipts.push({safeAreaEmulation:'unsupported',message:e.message});else throw e;}
 assert.deepEqual(errors,[]);await writeFile(out+'/receipt.json',JSON.stringify({passed:true,receipts,errors},null,2));console.log(JSON.stringify({passed:true,cases:receipts.length},null,2));
}
}finally{await browser.close();}
