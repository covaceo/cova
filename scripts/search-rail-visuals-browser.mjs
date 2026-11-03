// Isolated real-App, canonical CSS, synthetic auth/storage only. No real browser profile.
import assert from 'node:assert/strict';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import path from 'node:path';
import load from './helpers/load-ts.cjs';
const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
const out=path.resolve(process.env.COVA_SEARCH_EVIDENCE || path.join(root,'../search-rail-visuals-evidence/implementation'),`visual-${new Date().toISOString().replace(/[:.]/g,'-')}`);
mkdirSync(out,{recursive:true});
const {defaultRules}=load('src/lib/risk.ts');
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',stamp='2026-10-30T16:00:00.000Z';
const second='Manual:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const names={local:'Morning account',[second]:'Evening account'};
const note='Patient entry 東京; waited for confirmation. '+ 'Full private synthetic note. '.repeat(35)+'END-OF-TRADE-NOTE';
const trades=[{id:'manual-search-one',date:'2026-10-30',market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl:0,risk:0,setup:'Café pullback',notes:note,manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}},{id:'manual-search-two',date:'2026-10-29',market:'ES',side:'Short',contracts:2,entry:120,exit:119,pnl:75,risk:20,setup:'Evening reversal',notes:'Secondary marker',manual:{accountKey:second,currency:'USD',pnlBasis:'reported_net'}}];
const journal='Review patience before the open. '+ 'Complete daily reflection. '.repeat(35)+'END-OF-JOURNAL';
const record=(kind,recordId,accountId,payload)=>({kind,recordId,accountId,schemaVersion:1,payload,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null});
const cloud=[...trades.map(t=>record('trade',t.id,t.manual.accountKey,t)),record('rules','current','all',{rules:defaultRules}),...Object.entries(names).map(([account,name])=>record('account',account,account,{name})),record('daily_note',JSON.stringify(['local','2026-10-29']),'local',{date:'2026-10-29',note:journal,tradeId:'manual-search-one'})];
const report={out,checks:[],failures:[],errors:[],external:[],requests:[],screenshots:[],sourceHashes:{}};
for(const file of ['package.json','scripts/search-rail-visuals-browser.mjs','scripts/helpers/load-ts.cjs','scripts/workspace-search-browser.mjs','scripts/workspace-search-regression.mjs','scripts/auth-regression.mjs'])report.sourceHashes[file]=createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex');
const save=()=>writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
const check=(name,ok,detail)=>{(ok?report.checks:report.failures).push({name,detail});save();};
function isolation(){return {name:'workspace-search-isolation',enforce:'pre',load(id){
 const clean=id.split('?')[0],rel=path.relative(root,clean).replaceAll('\\','/');
 if((rel.startsWith('src/')||rel==='index.html')&&existsSync(clean))report.sourceHashes[rel]=createHash('sha256').update(readFileSync(clean)).digest('hex');
 if(rel==='src/lib/supabaseClient.ts')return readFileSync(id,'utf8').replace('export function getSupabaseClient() {','function unusedRealSupabaseClient() {').replace('export function getSupabaseAuthSessionId(accessToken: string)','function unusedRealSessionId(accessToken: string)')+`\nexport const getSupabaseAuthSessionId=()=>"search-session";export const getSupabaseClient=()=>({auth:{getSession:async()=>({data:{session:window.__searchSession}}),onAuthStateChange:callback=>{window.__searchAuth=callback;return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({error:null})}});`;
 if(rel==='src/lib/profileRepository.ts')return `export const createProfileRepository=()=>({load:async(user_id)=>({user_id,username:'search_fixture',avatar_data:null,username_changed_at:'2020-01-01T00:00:00Z'}),save:async()=>{throw Error('Read-only fixture')}});`;
}}}
let server,browser;
let available=true;
try {
 await build({root,configFile:false,envDir:false,logLevel:'error',plugins:[isolation(),react()],define:{'import.meta.env.VITE_WORKSPACE_SYNC_ENABLED':'"true"','import.meta.env.VITE_ASK_COVA_ENABLED':'"false"'},build:{outDir:path.join(out,'site'),emptyOutDir:true}});
 server=createServer((req,res)=>{const file=path.resolve(out,'site','.'+new URL(req.url,'http://127.0.0.1').pathname);if(file!==path.resolve(out,'site')&&!file.startsWith(path.resolve(out,'site')+path.sep)){res.writeHead(403);return res.end()};const target=existsSync(file)&&path.extname(file)?file:path.join(out,'site/index.html');res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff'}[path.extname(target)]||'application/octet-stream'});res.end(readFileSync(target));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({channel:process.env.COVA_TEST_BROWSER_CHANNEL || 'chrome',headless:true});
 async function open(width=1440,{local=false,rows=trades,notes=journal,motion='reduce'}={}){
  const context=await browser.newContext({viewport:{width,height:width<768?844:1000},isMobile:width<=768,hasTouch:width<=768,deviceScaleFactor:1,reducedMotion:motion,locale:'en-US',timezoneId:'UTC'});
  const state={context,width,cloud:[...cloud.filter(r=>r.kind!=='trade'),...rows.map(t=>record('trade',t.id,t.manual?.accountKey || 'local',t))]};
  await context.addInitScript(({owner,stamp,trades,names,defaultRules,local,notes})=>{
   if(location.origin==='null')return;
   window.__searchSession={user:{id:owner,email:'search@example.invalid',app_metadata:{plan:'pro'}},access_token:'synthetic-search-token'};
   localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'search-session',plan:'pro',email:'search@example.invalid',signedInAt:stamp}));
   if(local)localStorage.setItem('cova-workspace-mode-v2:'+owner,'local');
   localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades,rules:defaultRules,tradeAccount:'local'}));
   localStorage.setItem('cova-workspace-aux-v1:'+owner,JSON.stringify({version:1,names,notes:{local:{'2026-10-29':{note:notes,tradeId:'manual-search-one'}}},cash:{}}));
   localStorage.setItem('cova-dashboard-range-v1','all');
  },{owner,stamp,trades:rows,names,defaultRules,local,notes});
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin){report.external.push(url.href);return route.abort();}
   if(url.pathname.startsWith('/api/')){report.requests.push({path:url.pathname,method:req.method(),body:req.postData()});
    if(url.pathname==='/api/workspace'&&req.method()==='GET')return route.fulfill({json:{owner,consent:true,revision:1,pendingWrite:null,chunk:Buffer.from(state.cloud.map(r=>JSON.stringify(r)).join('\n')+'\n').toString('base64'),next:null}});
    if(req.method()!=='GET')return route.fulfill({status:403,json:{error:'Read-only synthetic fixture'}});
    if(url.pathname==='/api/auth/consent')return route.fulfill({json:{accepted:true}});
    return route.fulfill({json:{connected:false,accounts:[],available,status:'disconnected'}});
   }
   return route.continue();
  });
  state.page=await context.newPage();state.page.setDefaultTimeout(5000);state.page.on('pageerror',e=>report.errors.push(e.message));
  await state.page.goto(origin+'/#dashboard');try { await state.page.locator('.astra-dashboard').waitFor({timeout:20000}); } catch(error) { writeFileSync(path.join(out,'startup.txt'),await state.page.locator('body').innerText());await state.page.screenshot({path:path.join(out,'startup.png')});throw error; } await state.page.evaluate(()=>document.fonts.ready);
  await state.page.waitForTimeout(800);return state;
 }
 async function shot(s,label){const file=`${s.width}-${label}.png`;await s.page.screenshot({path:path.join(out,file)});report.screenshots.push(file);save();}
 async function scenario(name,run){try{await run();}catch(error){report.failures.push({name,error:String(error)});save();}}
 async function search(s){const p=s.page,trigger=p.getByRole('button',{name:'Search workspace',exact:true}).filter({visible:true});await trigger.waitFor();if(s.width<768)await trigger.tap();else await trigger.click();const d=p.getByRole('dialog',{name:'Search workspace',exact:true});await d.waitFor();return {d,input:d.getByRole('combobox',{name:'Search workspace'}),trigger};}

 // No live endpoints: only synthetic availability, no provider actions.
 async function geometry(locator,label,{text=true}={}) {
  await locator.scrollIntoViewIfNeeded();await locator.page().waitForTimeout(100);
  const b=await locator.boundingBox();if(!b){check(label+' visible',false);return;}
  await locator.page().mouse.move(b.x+b.width/2,b.y+b.height/2);await locator.page().waitForTimeout(160);
  const m=await locator.evaluate(el=>{
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}},r=rect(el),c=getComputedStyle(el);
   const points=[[r.x+r.width/2,r.y+r.height/2],[r.x+3,r.y+r.height/2],[r.right-3,r.y+r.height/2],[r.x+r.width/2,r.y+3],[r.x+r.width/2,r.bottom-3]];
   const hits=points.map(([x,y])=>{const hit=document.elementFromPoint(x,y);return {x,y,ok:!!hit&&(hit===el||el.contains(hit)),hit:hit?.className?.baseVal??hit?.className}});
   const texts=[];const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode;if(!n.textContent.trim()||!n.parentElement.checkVisibility({opacityProperty:true,visibilityProperty:true}))continue;const range=document.createRange();range.selectNodeContents(n);for(const rr of range.getClientRects())texts.push({text:n.textContent.trim(),x:rr.x,y:rr.y,right:rr.right,bottom:rr.bottom});}
   let parent=el;const filters=[];while(parent){if(getComputedStyle(parent).filter!=='none')filters.push({class:parent.className,filter:getComputedStyle(parent).filter});parent=parent.parentElement;}
   return {rect:r,hits,texts,filters,hover:el.matches(':hover'),disabled:el.disabled,title:el.title,background:c.backgroundColor,overflow:c.overflow,outline:c.outline,viewport:{width:innerWidth,height:innerHeight}};
  });
  report.measurements??=[];report.measurements.push({label,...m});
  check(label+' center/edges unobstructed',m.hits.every(x=>x.ok),m.hits);
  check(label+' hover reaches option',m.disabled||m.hover,{hover:m.hover,disabled:m.disabled});
  check(label+' surface in viewport',m.rect.x>=-1&&m.rect.right<=m.viewport.width+1&&m.rect.y>=-1&&m.rect.bottom<=m.viewport.height+1,m.rect);
  if(text)check(label+' text inside surface',m.texts.every(t=>t.x>=m.rect.x-1&&t.right<=m.rect.right+1&&t.y>=m.rect.y-1&&t.bottom<=m.rect.bottom+1),m.texts);
  check(label+' crisp unfiltered content',m.filters.length===0,m.filters);return m;
 }
 const widths=[1920,1440,1051,1050,1024,1023,768,390,320];
 for(const width of widths)await scenario('rail-'+width,async()=>{
  const s=await open(width,{motion:'no-preference'}),p=s.page;
  try {
   const sidebar=p.locator('#cova-workspace-sidebar');
   if(await sidebar.isVisible()) {
    const routes=await sidebar.locator('[data-gooey-key]').evaluateAll(els=>els.map(e=>({id:e.dataset.gooeyKey,name:e.getAttribute('aria-label')})));
    report.inventory??={};report.inventory.sidebar=routes;
    for(const collapsed of [false,true]){
     await p.evaluate(()=>location.hash='#dashboard');await p.locator('.astra-dashboard').waitFor();await p.waitForTimeout(250);
     if(collapsed){await sidebar.hover();await p.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await p.waitForTimeout(700);}
     const key=`${width}-${collapsed?'collapsed':'expanded'}`;
     const trigger=p.locator('.cova-gooey-search button');const m=await geometry(trigger,key+' search');
     const account=await geometry(sidebar.locator('.astra-rail-account'),key+' Accounts');
     const rail=await sidebar.boundingBox();
     check(key+' search fills/centers rail',collapsed?Math.abs(m.rect.x+m.rect.width/2-(rail.x+rail.width/2))<1:Math.abs(m.rect.x-account.rect.x)<1&&Math.abs(m.rect.width-account.rect.width)<1,{search:m.rect,account:account.rect,rail});
     check(key+' search height >=40',m.rect.height>=40,m.rect);
     const before=await trigger.boundingBox();await trigger.click();await p.getByRole('dialog',{name:'Search workspace',exact:true}).waitFor();await p.waitForTimeout(600);const after=await trigger.boundingBox();
     check(key+' dialog does not shift/shrink opener',Object.keys(before).every(k=>Math.abs(before[k]-after[k])<1),{before,after});
     await shot(s,key+'-search-open');await p.keyboard.press('Escape');await p.waitForTimeout(600);
     check(key+' focus restored',await trigger.evaluate(el=>el===document.activeElement));
     await shot(s,key+'-rail');
     await sidebar.locator('.astra-rail-account').click();await p.waitForTimeout(300);
     for(const route of routes){
      const item=sidebar.locator(`[data-gooey-key="${route.id}"]`);await geometry(item,key+' inactive/'+route.id);await item.click();await p.waitForTimeout(600);await geometry(item,key+' active/'+route.id);
      check(key+' label/'+route.id,await item.getAttribute('title')===route.name);
      const plate=await p.locator('.cova-gooey-sidebar .cova-gooey-plate').boundingBox(),r=await item.boundingBox();check(key+' active plate/'+route.id,!!plate&&Math.abs(plate.y-r.y)<1&&Math.abs(plate.x-r.x)<1&&Math.abs(plate.width-r.width)<1,{plate,target:r});
     }
     await sidebar.locator('.astra-rail-account').click();await p.waitForTimeout(300);await geometry(sidebar.locator('.astra-rail-account'),key+' active/Accounts');
     await geometry(sidebar.locator('.cova-profile-trigger'),key+' profile');await sidebar.locator('.cova-profile-trigger').click();await p.waitForTimeout(200);
     const menu=p.locator('.cova-profile-popup:visible');const options=menu.locator('button');report.inventory.profile=await options.allTextContents();for(let i=0;i<await options.count();i++)await geometry(options.nth(i),key+' menu/'+i);
     await p.keyboard.press('Escape');
    }
   } else {
    check(width+' mobile search visible',await p.locator('.workspace-mobile-search').isVisible());
    const toggle=p.getByRole('button',{name:'Toggle menu',exact:true});await toggle.click();await p.waitForTimeout(400);
    const nav=p.locator('#operator-mobile-menu'),links=nav.locator('.operator-mobile-menu-link');await shot(s,'mobile-menu');
    report.inventory??={};report.inventory.mobile=await links.allTextContents();
    for(let i=0;i<await links.count();i++){
     await geometry(links.nth(i),width+' mobile inactive/'+i);await links.nth(i).click();await p.waitForTimeout(300);await toggle.click();await p.waitForTimeout(300);await geometry(links.nth(i),width+' mobile active/'+i);
    }
    const utilities=nav.locator('.operator-mobile-account-actions button:visible');report.inventory.mobileUtilities=await utilities.allTextContents();for(let i=0;i<await utilities.count();i++)await geometry(utilities.nth(i),width+' mobile utility/'+i);
    await geometry(nav.locator('.cova-profile-trigger'),width+' mobile profile');await nav.locator('.cova-profile-trigger').click();await p.waitForTimeout(200);const menu=nav.locator('.cova-profile-popup button');for(let i=0;i<await menu.count();i++)await geometry(menu.nth(i),width+' mobile profile option/'+i);await p.keyboard.press('Escape');await toggle.click();await p.waitForTimeout(300);
   }
   await p.evaluate(()=>location.hash='#import');await p.locator('.accounts-connections').waitFor();await p.waitForTimeout(400);
   const cards=p.locator('.accounts-platform');report.inventory??={};report.inventory.cards=await cards.evaluateAll(els=>els.map(e=>e.getAttribute('data-platform')||'csv'));
   for(let i=0;i<await cards.count();i++){const card=cards.nth(i);await geometry(card,width+' card/'+i);const actions=card.locator('button');for(let j=0;j<await actions.count();j++)await geometry(actions.nth(j),width+' card/'+i+'/action/'+j);}
   await p.getByRole('button',{name:'Connect platform',exact:true}).click();const options=p.locator('dialog[open] .utility-picker button');report.inventory.picker=await options.allTextContents();check(width+' all picker options enabled',await options.evaluateAll(es=>es.every(e=>!e.disabled)));
   for(let i=0;i<await options.count();i++)await geometry(options.nth(i),width+' enabled picker/'+i);
   await shot(s,'platform-picker');await p.getByRole('button',{name:'Close account picker'}).click();
  }finally{await s.context.close();}
 });
 for(const height of [600,360])await scenario('short-'+height,async()=>{
  const s=await open(1440),p=s.page;try{
   await p.setViewportSize({width:1440,height});await p.waitForTimeout(300);
   for(const collapsed of [false,true]){
    if(collapsed){await p.locator('#cova-workspace-sidebar').hover();await p.getByRole('button',{name:'Collapse sidebar'}).click();await p.waitForTimeout(300);}
    const links=p.locator('.workspace-sidebar-link');for(let i=0;i<await links.count();i++){await geometry(links.nth(i),`short-${height}-${collapsed}-nav-${i}`);await links.nth(i).click();await p.waitForTimeout(150);const r=await links.nth(i).boundingBox(),plate=await p.locator('.cova-gooey-sidebar .cova-gooey-plate').boundingBox();check(`short-${height}-${collapsed}-plate-${i}`,Math.abs(r.y-plate.y)<1,{target:r,plate});}
    await geometry(p.locator('.cova-gooey-search button'),`short-${height}-${collapsed}-search`);
    await geometry(p.locator('#cova-workspace-sidebar .cova-profile-trigger'),`short-${height}-${collapsed}-profile`);
   }
   await shot(s,'short-'+height);
  }finally{await s.context.close();}
 });
 available=false;await scenario('unavailable-picker',async()=>{const s=await open(390),p=s.page;try{await p.evaluate(()=>location.hash='#import');await p.locator('.accounts-connections').waitFor();await p.waitForTimeout(400);await p.getByRole('button',{name:'Connect platform',exact:true}).click();const options=p.locator('dialog[open] .utility-picker button');report.unavailable=await options.evaluateAll(es=>es.map(e=>({text:e.textContent,disabled:e.disabled})));for(let i=0;i<await options.count();i++)await geometry(options.nth(i),'unavailable-picker-'+i);await shot(s,'unavailable-picker');}finally{await s.context.close();}});available=true;
 for(const width of [320,390,768])await scenario('short-mobile-'+width,async()=>{
  const s=await open(width),p=s.page;try{
   await p.setViewportSize({width,height:360});await p.getByRole('button',{name:'Toggle menu',exact:true}).click();await p.waitForTimeout(300);const nav=p.locator('#operator-mobile-menu');
   const buttons=nav.locator('button:visible');for(let i=0;i<await buttons.count();i++)await geometry(buttons.nth(i),`short-mobile-${width}-option-${i}`);
   await nav.locator('.cova-profile-trigger').click();await p.waitForTimeout(200);const menu=nav.locator('.cova-profile-popup button');check('short-mobile-'+width+' profile inventory',await menu.count()===3);for(let i=0;i<await menu.count();i++)await geometry(menu.nth(i),`short-mobile-${width}-profile-${i}`);await shot(s,'short-mobile-menu');await p.keyboard.press('Escape');await p.getByRole('button',{name:'Toggle menu',exact:true}).click();
   await p.evaluate(()=>location.hash='#import');await p.locator('.accounts-connections').waitFor();await p.getByRole('button',{name:'Connect platform',exact:true}).click();const options=p.locator('dialog[open] .utility-picker button');for(let i=0;i<await options.count();i++)await geometry(options.nth(i),`short-mobile-${width}-picker-${i}`);await shot(s,'short-platform-picker');
  }finally{await s.context.close();}
 });
 for(const motion of ['no-preference','reduce'])await scenario('transition-and-focus-'+motion,async()=>{
  const s=await open(1440,{motion}),p=s.page;try{
   async function startFrames(){await p.evaluate(()=>{window.__visualFrames=[];window.__visualSampling=true;const tick=()=>{if(!window.__visualSampling)return;const rail=document.querySelector('#cova-workspace-sidebar'),r=rail.getBoundingClientRect(),search=rail.querySelector('.cova-gooey-search button'),b=search.getBoundingClientRect();const nav=[...rail.querySelectorAll('.workspace-sidebar-link,.astra-rail-account')].map(el=>{const e=el.getBoundingClientRect(),hit=document.elementFromPoint(e.x+e.width/2,e.y+e.height/2);return {label:el.getAttribute('aria-label'),hit:el===hit||el.contains(hit),x:e.x,right:e.right}});window.__visualFrames.push({rail:{x:r.x,right:r.right,width:r.width},search:{x:b.x,right:b.right,width:b.width},nav});requestAnimationFrame(tick)};requestAnimationFrame(tick)});}
   async function finishFrames(label){await p.waitForTimeout(650);const frames=await p.evaluate(()=>{window.__visualSampling=false;return window.__visualFrames});report.frames??=[];report.frames.push({label,frames});check(label+' transient rail containment and hit targets',frames.length>2&&frames.every(f=>f.search.x>=f.rail.x&&f.search.right<=f.rail.right&&f.nav.every(n=>n.hit&&n.x>=f.rail.x&&n.right<=f.rail.right)),frames.filter(f=>f.nav.some(n=>!n.hit)));}
   for(const label of ['Collapse sidebar','Expand sidebar']){await p.locator('#cova-workspace-sidebar').hover();await startFrames();await p.getByRole('button',{name:label,exact:true}).click();await finishFrames(motion+' '+label);}
   const routes=await p.locator('.workspace-sidebar-link').count();for(let i=0;i<routes;i++){await startFrames();await p.locator('.workspace-sidebar-link').nth(i).click();await finishFrames(motion+' route '+i);}
   for(const width of [1051,1050,1024,1023,768,390,320,1024,1051,1920]){
    await p.setViewportSize({width,height:600});await p.waitForTimeout(450);const trigger=p.getByRole('button',{name:'Search workspace',exact:true}).filter({visible:true});
    // Some inherited responsive layers expose both openers at 851–1023; each is usable.
    for(let i=0;i<await trigger.count();i++)await geometry(trigger.nth(i),motion+' resized '+width+' search '+i);
    check(motion+' resized '+width+' visible opener',await trigger.count()>0);
   }
   await p.setViewportSize({width:1440,height:900});await p.waitForTimeout(400);
   const focusables=p.locator('#cova-workspace-sidebar button');const focusNames=[];
   for(const route of ['dashboard','passport'])for(const collapsed of [false,true]){
    await p.evaluate(route=>location.hash='#'+route,route);await p.waitForTimeout(250);
    const shell=p.locator('.workspace-shell');if((await shell.getAttribute('data-sidebar-state')==='collapsed')!==collapsed){await p.locator('#cova-workspace-sidebar').hover();await p.locator('.workspace-sidebar-toggle').click();await p.waitForTimeout(650);}
    await p.keyboard.press('Tab');for(let i=0;i<await focusables.count();i++){
     const el=focusables.nth(i);if(!await el.isVisible())continue;await el.focus();const m=await el.evaluate(e=>{const c=getComputedStyle(e);return {label:e.getAttribute('aria-label'),focused:e===document.activeElement,ring:c.outlineWidth,offset:c.outlineOffset,nav:e.matches('.workspace-sidebar-link'),style:c.outlineStyle,visible:e.matches(':focus-visible')}});focusNames.push(m.label);check(`${motion} ${route} ${collapsed} keyboard ${m.label}`,m.focused&&m.visible&&parseFloat(m.ring)>=2&&m.style!=='none',m);
     if(m.nav)check(`${motion} ${route} ${collapsed} focus ring fits scroll clip ${m.label}`,parseFloat(m.offset)<=-parseFloat(m.ring),m);
    }
   }report.focusInventory=[...new Set(focusNames)];
   if(motion==='reduce')check('reduced motion inert surfaces unfiltered',await p.locator('.cova-gooey-plates').evaluateAll(es=>es.every(e=>getComputedStyle(e).filter==='none')));
   const result=await search(s);await result.input.fill('patient');await result.input.press('Enter');check(motion+' unchanged exact trade result',await result.d.getByText(note,{exact:true}).isVisible());await p.keyboard.press('Escape');check(motion+' exact detail closes to opener',await result.trigger.evaluate(e=>e===document.activeElement));
  }finally{await s.context.close();}
 });
 check('enumerated sidebar inventory',report.inventory.sidebar.length===4,report.inventory.sidebar);
 check('enumerated provider and picker inventories',report.inventory.cards.length===3&&report.inventory.picker.length===3,report.inventory);
 check('enumerated mobile navigation',report.inventory.mobile?.length===4&&report.inventory.mobileUtilities?.includes('Link account'),report.inventory.mobile);
 check('no page errors',report.errors.length===0,report.errors);check('no external requests',report.external.length===0,report.external);
 check('no write actions',report.requests.filter(r=>r.method!=='GET').every(r=>r.path==='/api/passport'&&JSON.parse(r.body).action==='plan'),report.requests.filter(r=>r.method!=='GET'));
 report.complete=true;
}catch(error){report.fatal=String(error);process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));save();}
if(report.failures.length||report.fatal)process.exitCode=1;
console.log(JSON.stringify({out,checks:report.checks.length,failures:report.failures.map(f=>({name:f.name,error:f.error})),fatal:report.fatal},null,2));
