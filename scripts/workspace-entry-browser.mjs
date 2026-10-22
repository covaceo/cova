// Actual App and actual SQL/HTTP fixture. Synthetic owners only; external traffic blocked.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {workspaceBrowserOptions} from './workspace-browser-support.mjs';
const out=path.resolve(process.env.WORKSPACE_ENTRY_OUT||'artifacts/workspace-entry');await mkdir(out,{recursive:true});
const origin='http://127.0.0.1:4407',scratch=process.env.TMPDIR||path.join(out,'tmp');await mkdir(scratch,{recursive:true});
const child=spawn(process.execPath,['scripts/workspace-browser-fixture.mjs'],{env:{...process.env,COVA_WORKSPACE_FIXTURE_PORT:'4407',TEMP:scratch,TMP:scratch,TMPDIR:scratch},stdio:['ignore','pipe','pipe']});
let log='',browser;child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
const wait=ms=>new Promise(r=>setTimeout(r,ms));const records=[],errors=[];
const trade={id:'manual-entry-qa-trade',date:'2026-10-20',market:'ES',side:'Long',contracts:1,entry:100,exit:101,pnl:25,risk:0,riskStatus:'missing',setup:'',notes:'Synthetic workspace-entry fixture',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}};
async function open(width,state){
 const owner=crypto.randomUUID();let posts=0,fail=state==='error',hold=state==='loading';
 const c=await browser.newContext({viewport:{width,height:844},isMobile:width<850,hasTouch:width<850,reducedMotion:'reduce'});
 await c.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.fallback():r.abort());
 await c.route('**/api/**',r=>r.request().url().includes('/api/workspace')?r.fallback():r.request().url().includes('/api/auth/consent')?r.fulfill({json:{accepted:true}}):r.fulfill({status:404,json:{error:'Isolated fixture'}}));
 await c.route('**/api/workspace*',r=>{if(r.request().method()==='POST')posts++;if(hold||fail)return fail?r.fulfill({status:503,json:{error:'Account request unavailable. Try again.'}}):new Promise(()=>{});return r.continue();});
 await c.addInitScript(({owner,trade})=>{if(window.top!==window||location.origin==='null')return;window.__owner=owner;window.__qaSession={user:{id:owner,email:'entry-qa@example.invalid',app_metadata:{plan:'pro'}},access_token:'qa-'+owner};localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'qa-session',email:'entry-qa@example.invalid',signedInAt:new Date().toISOString()}));localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades:[trade],rules:[],tradeAccount:'local'}));},{owner,trade});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400&&r.url().startsWith(origin+'/')&&/\.(?:css|js|mjs|png|webp|woff2|svg)(?:\?|$)/.test(r.url()))errors.push('Essential asset '+r.status()+' '+r.url());});await p.goto(origin+'/#dashboard',{waitUntil:'domcontentloaded'});await p.locator('[data-storage-phase="'+state+'"]').waitFor({timeout:18000});await p.evaluate(()=>document.fonts.ready);
 return {c,p,owner,posts:()=>posts,recover:()=>{fail=false;hold=false;}};
}
async function metrics(p){const m=await p.evaluate(()=>{const panel=document.querySelector('.workspace-entry'),s=getComputedStyle(panel);return{width:innerWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,border:s.borderTopWidth,background:s.backgroundColor,panel:JSON.parse(JSON.stringify(panel.getBoundingClientRect())),buttons:[...panel.querySelectorAll(':scope >button')].map(e=>({height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width,font:parseFloat(getComputedStyle(e).fontSize)})),animations:[...panel.querySelectorAll('i')].map(e=>getComputedStyle(e).animationName)};});assert(m.overflow<=1,JSON.stringify(m));assert.equal(m.border,'0px');assert.equal(m.background,'rgba(0, 0, 0, 0)');assert(m.buttons.every(x=>x.height>=44&&x.font>=14));assert(m.animations.every(x=>x==='none'));return m;}
try{
 for(let i=0;i<400&&!log.includes('LOCAL_WORKSPACE_FIXTURE')&&child.exitCode===null;i++)await wait(100);assert(log.includes(origin+'/__workspace'),log);
 const engines=[['chromium',chromium,workspaceBrowserOptions],...(existsSync(webkit.executablePath())?[['webkit',webkit,{}]]:[])];
 for(const [engine,driver,opts]of engines){browser=await driver.launch({...opts,headless:true});
  for(const width of [320,390,1440])for(const state of ['loading','review']){
   const d=await open(width,state),{c,p,owner}=d;assert.equal(await p.locator('.astra-dashboard').count(),0,'No private dashboard before explicit storage choice');assert.equal(d.posts(),0,'No implicit storage write');
   const toast=p.locator('[data-toast-kind="sign-in"]');
   if(width===390&&state==='loading'){await toast.waitFor();const badge=await toast.locator('.cova-sign-in-toast-surface').boundingBox();assert(Math.abs(badge.x+badge.width/2-width/2)<=1,'Actual App sign-in notice is centered');assert.equal(await toast.innerText(),'Signed in');await p.screenshot({path:path.join(out,`${engine}-390-signin-toast.png`)});}
   if(width<850&&await toast.isVisible()){const t=await toast.boundingBox(),mark=await p.locator('.workspace-entry-mark').boundingBox();assert(mark.y>=t.y+t.height,'Sign-in feedback does not cover the entry graphic');}
   await toast.waitFor({state:'hidden',timeout:10000});
   await p.screenshot({path:path.join(out,`${engine}-${width}-${state}.png`)});await p.screenshot({path:path.join(out,`${engine}-${width}-${state}-full.png`),fullPage:true});records.push({engine,width,state,...await metrics(p)});
   if(state==='loading'){assert.equal(await p.locator('.workspace-entry button').count(),0);await p.getByRole('heading',{name:'Opening Risk Desk',exact:true}).waitFor();if(width===390){await p.emulateMedia({reducedMotion:'no-preference'});await p.waitForFunction(()=>[...document.querySelectorAll('.workspace-entry-activity i')].every(e=>getComputedStyle(e).animationName==='workspace-entry-wait'));await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>[...document.querySelectorAll('.workspace-entry-activity i')].every(e=>getComputedStyle(e).animationName==='none'));records[records.length-1].liveMotionPreference=true;}}
   else{
    await p.locator('.workspace-entry-disclosure summary').focus();await p.keyboard.press('Enter');assert(await p.locator('.workspace-entry-disclosure').getAttribute('open')!==null);await p.getByText('Fee confirmations and CSV verification history stay',{exact:false}).waitFor();await p.keyboard.press('Enter');
    if(width===390){p.once('dialog',x=>x.dismiss());await p.getByRole('button',{name:'Back up and use account copy',exact:true}).click();assert.equal(d.posts(),0,'Cancelled destructive replacement sends no write');}
    await p.getByRole('button',{name:'Keep browser only',exact:true}).click();await p.locator('[data-storage-phase="local"]').waitFor();await p.locator('.astra-dashboard').waitFor();assert.equal(d.posts(),0);assert.deepEqual(await p.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)).trades[0],owner),trade);
   }
   await c.close();
  }
  const d=await open(390,'error');await d.p.getByRole('alert').filter({hasText:'Your browser copy and backups are retained.'}).waitFor();await d.p.screenshot({path:path.join(out,`${engine}-390-error.png`),fullPage:true});records.push({engine,width:390,state:'error',...await metrics(d.p)});d.recover();await d.p.getByRole('button',{name:'Reload account and review',exact:true}).click();await d.p.locator('[data-storage-phase="review"]').waitFor();assert.equal(d.posts(),0);await d.c.close();
  await browser.close();browser=null;
 }
 assert.deepEqual(errors,[]);assert.equal(records.length,engines.length*7);await writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,actualApp:true,records,errors,nativeDevice:false},null,2));console.log(JSON.stringify({passed:true,records:records.length,engines:engines.map(x=>x[0]),errors}));
}finally{await browser?.close();child.kill();for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await wait(50);await writeFile(path.join(out,'fixture.log'),log);}
