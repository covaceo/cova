// Mobile presentation audit against the isolated real-App fixture. Synthetic data only.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import loadSource from './helpers/load-ts.cjs';
import { workspaceBrowserOptions, workspaceEvidence } from './workspace-browser-support.mjs';
const origin=process.env.COVA_MOBILE_ORIGIN||'http://127.0.0.1:4283';
assert.match(origin,/^http:\/\/127\.0\.0\.1:/,'Never seed fixtures on a real service');
const phase=process.env.COVA_MOBILE_PHASE||'before',out=join(workspaceEvidence('mobile-readability'),phase);
await mkdir(out,{recursive:true});
const owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const {sampleTrades,defaultRules}=loadSource('src/lib/risk.ts');
const trades=sampleTrades.map(t=>({...t,manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}}));
const browser=await chromium.launch({...workspaceBrowserOptions,headless:true});
const records=[],errors=[],storageRecovery=[];
async function context(width,auth=true,height=844,seedTrades=trades){
 const c=await browser.newContext({viewport:{width,height},isMobile:width<=850,hasTouch:width<=850,reducedMotion:'reduce'});
 c.on('page',p=>{
  p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404 (Not Found)'))errors.push(m.text());});
  p.on('response',r=>{if(r.status()>=400&&r.url().startsWith(origin+'/')&&!r.url().includes('/api/'))errors.push(`${r.status()} ${r.url()}`);});
 });
 await c.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.fallback():r.abort());
 await c.route('**/api/**',r=>r.request().url().includes('/api/workspace')?r.continue():r.request().url().includes('/api/auth/consent')?r.fulfill({json:{accepted:true}}):r.fulfill({status:404,json:{error:'Isolated fixture'}}));
 if(auth)await c.addInitScript(({owner,trades,rules})=>{
  if(window.top!==window||location.origin==='null')return;
  window.__owner=owner;window.__qaSession={user:{id:owner,email:'mobile-qa@example.invalid',app_metadata:{plan:'pro'}},access_token:'qa-'+owner};
  localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'qa-session',email:'mobile-qa@example.invalid',signedInAt:new Date().toISOString()}));
  localStorage.setItem('cova-workspace-mode-v2:'+owner,'local');
  if(!localStorage.getItem('cova-react-risk-os-v2:'+owner)){
   localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades,rules,tradeAccount:'local'}));
   localStorage.setItem('cova-workspace-aux-v1:'+owner,JSON.stringify({version:1,names:{local:'Mobile test account'},notes:{},cash:{}}));
   localStorage.setItem('cova-dashboard-range-v1','all');
  }
 },{owner,trades:seedTrades,rules:defaultRules});
 return c;
}
async function ready(p,route){
 await p.goto(origin+'/#'+route);await p.locator(['rules','coach','passport','import'].includes(route)?`.astra-workspace-page[data-astra-route="${route}"]`:'main h1').first().waitFor({timeout:20000});
 if(route==='dashboard')await p.locator('.astra-stats-panel').waitFor();
 await p.evaluate(()=>document.fonts.ready);
 await p.evaluate(()=>document.documentElement.style.setProperty('scroll-behavior','auto','important'));
 await p.waitForTimeout(650);
}
async function capture(p,name,fullPage=false){await p.screenshot({path:join(out,name+'.png'),fullPage});}
async function measure(p,route,width){
 return await p.evaluate(({route,width})=>{
  const box=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,font:parseFloat(s.fontSize),lineHeight:s.lineHeight,color:s.color,background:s.backgroundColor,radius:s.borderRadius,text:e.textContent.trim().slice(0,100)}};
  const visible=e=>e.checkVisibility()&&e.getBoundingClientRect().width>0;
  const selectors=['.astra-reference-header','.astra-header-controls','.astra-stats-panel','.astra-stat-label','.astra-stat-value','.astra-panel-heading h2','.dashboard-range-controls button','.cova-account-menu-trigger','.mini-journal textarea','.mini-journal input','.astra-chart-panel','.astra-chart-main','.astra-chart-svg','.astra-discipline','.astra-journal','.astra-desk-main','.astra-desk-side','.workspace-sidebar','.workspace-top-header'];
  return {route,width,actualWidth:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,metrics:Object.fromEntries(selectors.map(s=>[s,[...document.querySelectorAll(s)].filter(visible).map(box)])),smallText:[...document.querySelectorAll('main p,main label,main button,main summary')].filter(visible).map(box).filter(b=>b.font<13),outside:[...document.querySelectorAll('main h1,main h2,main p,main button,main input,main textarea')].filter(visible).map(box).filter(b=>b.x<-.5||b.right>width+.5)};
 },{route,width});
}
try{
 for(const width of [320,390,430,768,850,851,1280,1440]){
  const c=await context(width);const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await ready(p,'dashboard');
  await p.getByText('Signed in. Account stats are unlocked.',{exact:true}).waitFor({state:'hidden',timeout:15000});
  const r=await measure(p,'dashboard',width);records.push(r);assert.equal(r.actualWidth,width);assert(r.overflow<=1,JSON.stringify(r.outside));
  await capture(p,'dashboard-'+width,true);
  if(phase!=='before'&&width<=850){
   const chrome=await p.locator('.workspace-top-header').evaluate(e=>({background:getComputedStyle(e).backgroundColor,height:e.getBoundingClientRect().height}));
   assert.equal(chrome.background,'rgb(15, 15, 15)','Header belongs to the workspace canvas');
   const toggle=await p.getByRole('button',{name:'Toggle menu',exact:true}).evaluate(e=>({background:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderTopWidth}));
   assert.equal(toggle.background,'rgba(0, 0, 0, 0)','No circular menu plate');
   assert.equal(toggle.border,'0px');
   const storage=p.locator('.workspace-sync-compact');
   assert((await storage.boundingBox()).y >= (await p.locator('.astra-dashboard').boundingBox()).y+(await p.locator('.astra-dashboard').boundingBox()).height,'Quiet storage belongs below the desk');
   const storageControl=storage.locator('summary');assert.equal((await storageControl.innerText()).trim(),'Data storage');
   assert.equal(await storageControl.evaluate(e=>getComputedStyle(e).listStyleType),'none','No disclosure triangle');
   await storageControl.tap();assert(await storage.getByText(/not backed up to your Cova account/).isVisible());if(width===390)await capture(p,'storage-details');await storageControl.tap();await p.evaluate(()=>scrollTo(0,0));
   assert((await p.locator('.astra-header-title').boundingBox()).y>=chrome.height+12,'Title clears the fixed header');
   assert((await p.locator('.astra-header-title').boundingBox()).y<120,'No empty status-strip gap');
   for(const b of r.metrics['.astra-stat-label'])assert(b.font>=13,'Readable metric labels '+width);
   for(const b of r.metrics['.dashboard-range-controls button']){assert(b.h>=44,'Range touch height '+width);assert(b.font>=13,'Range type '+width);}
   for(const b of r.metrics['.cova-account-menu-trigger'])assert(b.font>=14,'Account type '+width);
   for(const b of r.metrics['.mini-journal textarea'])assert(b.font>=16,'Journal editing type '+width);
   assert.equal(r.outside.length,0,'No offscreen controls '+JSON.stringify(r.outside));
  }
  if(width===390){
   for(const route of ['rules','coach','passport','import']){await ready(p,route);records.push(await measure(p,route,width));await capture(p,route+'-'+width,true);}
   await ready(p,'dashboard');
   await p.getByRole('button',{name:'Toggle menu',exact:true}).tap();await p.getByRole('navigation',{name:'Workspace navigation'}).waitFor();await capture(p,'workspace-menu');
   await p.getByRole('navigation',{name:'Workspace navigation'}).getByRole('button',{name:'Risk Desk',exact:true}).tap();
   await p.getByRole('navigation',{name:'Workspace navigation'}).waitFor({state:'hidden'});
   await p.getByRole('button',{name:'View all',exact:true}).click();await p.locator('[data-full-trade-history][open]').waitFor();await capture(p,'history');
   await p.locator('.astra-history-header .astra-dialog-close').click();
   await p.locator('.astra-trade-link').first().click();await p.locator('dialog[open]').waitFor();await capture(p,'trade-dialog');await p.locator('.astra-dialog-close').click();
   if(phase!=='before'){
    for(const label of ['Latest session','Last 7 days','All trades']){
     const control=p.getByRole('button',{name:label,exact:true});await control.tap();assert.equal(await control.getAttribute('aria-pressed'),'true');
    }
    const chart=p.locator('.astra-chart-svg');await chart.scrollIntoViewIfNeeded();const box=await chart.boundingBox();await p.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    await p.locator('.astra-chart-tooltip').waitFor();assert.equal(await p.locator('.astra-chart-main').getAttribute('data-chart-pinned'),'true');await capture(p,'touch-chart');await chart.press('Escape');
    await p.getByRole('button',{name:'Share recap',exact:true}).tap();await p.getByRole('dialog',{name:'Session recap',exact:true}).waitFor();await capture(p,'recap');await p.getByRole('button',{name:'Close recap',exact:true}).tap();
    await p.getByRole('textbox',{name:'Journal note',exact:true}).fill('Synthetic mobile regression: saved note.');
    await p.getByRole('button',{name:'Attach trade',exact:true}).tap();await p.locator('[data-journal-trade-option]').first().tap();
    await p.getByRole('button',{name:'Save note',exact:true}).tap();await p.locator('.mini-journal-footer').getByText('Saved',{exact:true}).waitFor();await capture(p,'saved-journal');
    await p.reload();await p.locator('.astra-stats-panel').waitFor();await p.waitForFunction(()=>document.querySelector('[aria-label="Journal note"]')?.value==='Synthetic mobile regression: saved note.');
    assert.equal(await p.locator('[data-journal-attachment]').count(),1);
    await p.getByRole('button',{name:'Add trade',exact:true}).tap();const form=p.locator('.manual-trade-dialog');await form.waitFor();
    for(const [name,value] of Object.entries({date:'2026-05-07',market:'MNQ',contracts:'1',entry:'20000',exit:'20005',pnl:'10'}))await form.locator(`[name="${name}"]`).fill(value);
    await capture(p,'add-trade');await form.getByRole('button',{name:'Save trade',exact:true}).tap();await form.waitFor({state:'hidden'});
    await p.waitForFunction(()=>document.querySelector('[data-dashboard-trade-count]')?.getAttribute('data-dashboard-trade-count')==='26');
    await p.reload();await p.locator('.astra-stats-panel').waitFor();await p.waitForFunction(()=>document.querySelector('[data-dashboard-trade-count]')?.getAttribute('data-dashboard-trade-count')==='26');
    const storage=await p.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)),owner);
    assert.equal(storage.trades.length,26);for(const old of trades)assert.deepEqual(storage.trades.find(t=>t.id===old.id),old,'Existing history unchanged');
    await p.locator('.workspace-sync-compact summary').tap();await p.getByRole('button',{name:'Reload account and review',exact:true}).tap();
    const review=p.locator('.workspace-sync-panel[data-storage-phase="review"]');await review.waitFor();await p.evaluate(()=>scrollTo(0,0));
    assert(!await review.evaluate(e=>e.classList.contains('workspace-sync-compact')),'Review and recovery must not move into the quiet footer');
    await review.getByRole('button',{name:'Keep browser only',exact:true}).tap();
    await p.locator('.workspace-sync-panel[data-storage-phase="local"]').waitFor();
    storageRecovery.push(await p.locator('.workspace-sync-panel').evaluate(e=>({phase:e.getAttribute('data-storage-phase'),text:e.textContent,compact:e.classList.contains('workspace-sync-compact')})));
    // Existing migration warnings can keep the full panel visible after review.
    // The local mode and unchanged ledger, not a cosmetic collapse, prove recovery.
    assert.equal(await p.locator('[data-dashboard-trade-count]').getAttribute('data-dashboard-trade-count'),'26','Storage review preserves the browser ledger');
    await p.setViewportSize({width:320,height:568});await p.evaluate(()=>scrollTo(0,0));await p.getByRole('button',{name:'Toggle menu',exact:true}).tap();
    const nav=p.getByRole('navigation',{name:'Workspace navigation'});await nav.waitFor();await nav.getByRole('button',{name:'Link account',exact:true}).scrollIntoViewIfNeeded();await capture(p,'short-phone-menu');
    await nav.getByRole('button',{name:'Link account',exact:true}).tap();await p.locator('.astra-workspace-page[data-astra-route="import"]').waitFor();
   }
  }
  await c.close();
 }
 if(phase!=='before'){
  const c=await context(320,true,568,[]),p=await c.newPage();await p.goto(origin+'/#dashboard');await p.locator('[data-dashboard-empty="true"]').waitFor();
  assert.equal(await p.locator('.astra-chart-svg').count(),0,'Empty account has no invented results');
  const add=await p.locator('.astra-add-trade').boundingBox(),imp=await p.locator('.astra-import-action').boundingBox();
  assert(Math.abs(add.y-imp.y)<=1,'Empty-account actions share a row');
  await capture(p,'empty-account');await p.locator('.astra-add-trade').tap();await p.locator('.manual-trade-dialog').waitFor();
  const save=p.getByRole('button',{name:'Save trade',exact:true});assert(await save.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=14,'Readable form save button');
  await save.scrollIntoViewIfNeeded();await capture(p,'short-phone-form');await p.getByRole('button',{name:'Close Add trade',exact:true}).tap();await c.close();
 }
 const c=await context(390,false);const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 for(const route of ['overview','features','pricing','resources','community']){
  await ready(p,route);
  await p.evaluate(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=600){scrollTo(0,y);await new Promise(r=>setTimeout(r,50));}scrollTo(0,0)});
  await p.waitForTimeout(400);records.push(await measure(p,route,390));await capture(p,route+'-390',true);
 }
 await c.close();
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'audit.json'),JSON.stringify({phase,records,errors,storageRecovery},null,2));
 console.log(JSON.stringify({phase,out,records:records.length,overflows:records.filter(r=>r.overflow>1).map(r=>({route:r.route,width:r.width,overflow:r.overflow})),smallText:records.map(r=>({route:r.route,width:r.width,count:r.smallText.length}))}));
}finally{await browser.close();}
