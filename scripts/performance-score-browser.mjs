import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {workspaceBrowserOptions,workspaceEvidence} from './workspace-browser-support.mjs';
import {chooseAccount,accountValue} from './helpers/account-picker.mjs';
import load from './helpers/load-ts.cjs';
const {analyze,defaultRules}=load('src/lib/risk.ts');
const out=path.resolve(process.env.SCORE_OUT||workspaceEvidence('performance-score-v2'));
const origin='http://127.0.0.1:4414',port=4414;
await mkdir(out,{recursive:true});const scratch=path.join(out,'tmp');await mkdir(scratch,{recursive:true});
const open=()=>new Promise(resolve=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',()=>resolve(false));});
assert.equal(await open(),false,'Never reuse another listener');
const child=spawn(process.execPath,['scripts/workspace-browser-fixture.mjs'],{env:{...process.env,COVA_WORKSPACE_FIXTURE_PORT:String(port),TMPDIR:scratch,TEMP:scratch,TMP:scratch},stdio:['ignore','pipe','pipe']});
let log='',browser;child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
const wait=ms=>new Promise(r=>setTimeout(r,ms)),records=[],errors=[];
const accountB='Manual:11111111-1111-4111-8111-111111111111',empty='Manual:22222222-2222-4222-8222-222222222222';
const row=(pnl,i,account='local')=>({id:`manual-score-${account==='local'?'a':'b'}-${i}`,date:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),market:'BTC',side:'Long',contracts:1,entry:100,exit:101,pnl,risk:25,riskStatus:'provided',setup:'Trend pullback',notes:'Preserved synthetic note',manual:{accountKey:account,currency:'USD',pnlBasis:'reported_net'}});
const a=Array.from({length:30},(_,i)=>row(i%5===4?-60:100,i));
const b=[-100,-120,-80,60,-40,50].map((v,i)=>row(v,i,accountB));
const initial=[...a,...b];const expectedA=analyze(a,defaultRules).score,expectedB=analyze(b,defaultRules).score;
assert.notEqual(expectedA,expectedB);
async function renderedScore(p,expected){await p.waitForFunction(expected=>document.querySelector('.oa-discipline-score strong')?.textContent===(expected===null?'—':String(expected)),expected);}
async function geometry(p){return p.evaluate(()=>{
 const selectors=['.oa-discipline','.oa-discipline-reading','.oa-discipline-score','.oa-review-dialog[open]','.oa-score-breakdown','.oa-score-method','.oa-review-dialog .oa-watch-inset','.oa-review-dialog .oa-watch-row','.oa-review-dialog .oa-watch-row > span'];
 const bounds=selectors.flatMap(selector=>[...document.querySelectorAll(selector)].filter(el=>el.getBoundingClientRect().width>0).map(el=>{const r=el.getBoundingClientRect();return{selector,left:r.left,right:r.right,width:r.width,overflow:el.scrollWidth-el.clientWidth}}));
 return{width:innerWidth,root:document.documentElement.scrollWidth-document.documentElement.clientWidth,bounds,broken:[...document.images].filter(i=>i.complete&&!i.naturalWidth).length};
});}
try{
 for(let n=0;n<400&&!log.includes('LOCAL_WORKSPACE_FIXTURE')&&child.exitCode===null&&child.signalCode===null;n++)await wait(100);
 assert(log.includes(origin+'/__workspace'),log);
 for(const[name,engine,opts]of [['chromium',chromium,workspaceBrowserOptions],['webkit',webkit,{}]]){
  browser=await engine.launch({...opts,headless:true});
  for(const width of [360,390,768,1440]){
   const id=`${name}-${width}`,owner=crypto.randomUUID(),c=await browser.newContext({viewport:{width,height:width<768?844:900},isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce'});
   let cloudWrites=0;
   await c.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.fallback():r.abort());
   await c.route('**/api/**',r=>r.request().url().includes('/api/workspace')?r.fallback():r.request().url().includes('/api/auth/consent')?r.fulfill({json:{accepted:true}}):r.fulfill({status:404,json:{error:'Isolated fixture'}}));
   await c.addInitScript(({owner,initial,defaultRules,accountB,empty})=>{if(window.top!==window||location.origin==='null')return;
    window.__qaSession={user:{id:owner,email:'score-qa@example.invalid',app_metadata:{plan:'pro'}},access_token:'qa-'+owner};
    localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'qa-session',email:'score-qa@example.invalid',signedInAt:new Date().toISOString()}));
    localStorage.setItem('cova-workspace-mode-v2:'+owner,'local');
    if(!localStorage.getItem('cova-react-risk-os-v2:'+owner)){
     localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades:initial,rules:defaultRules,tradeAccount:'local'}));
     localStorage.setItem('cova-workspace-aux-v1:'+owner,JSON.stringify({version:1,names:{local:'Measured performance',[accountB]:'Loss review',[empty]:'Empty account'},notes:{},cash:{}}));
    }
   },{owner,initial,defaultRules,accountB,empty});
   const p=await c.newPage();p.on('pageerror',e=>errors.push(id+': '+e.message));
   p.on('request',r=>{if(r.url().includes('/api/workspace')&&r.method()==='POST')cloudWrites++;});
   await p.goto(origin+'/#dashboard');await p.locator('.astra-dashboard').waitFor();await renderedScore(p,expectedA);
   await p.locator('[data-toast-kind="sign-in"]').waitFor({state:'hidden',timeout:12000});await p.evaluate(()=>document.fonts.ready);
   assert.equal(await accountValue(p),'local');await p.locator('.oa-discipline').scrollIntoViewIfNeeded();
   const metrics=await geometry(p);assert.equal(metrics.width,width);assert(metrics.root<=1);assert.equal(metrics.broken,0);
   await p.locator('.oa-discipline').screenshot({path:path.join(out,id+'-score.png')});
   const details=p.getByRole('button',{name:'Review details',exact:true});await details.focus();await p.keyboard.press('Enter');
   const dialog=p.getByRole('dialog',{name:'Review details',exact:true});await dialog.waitFor();
   const close=dialog.getByRole('button',{name:'Close review details',exact:true});
   await close.focus();
   const focus=await close.evaluate(el=>({active:document.activeElement===el,outline:getComputedStyle(el).outlineStyle,shadow:getComputedStyle(el).boxShadow}));
   assert.equal(focus.active,true);assert.equal(focus.outline,'none','No blue outer ring');assert.match(focus.shadow,/inset/,'Keyboard focus retains a neutral inset indicator');
   assert.match(focus.shadow,/203, 213, 225/);
   assert.equal(await dialog.locator('.oa-score-breakdown,.oa-score-method').count(),0,'Model internals do not belong in the customer view');
   assert.doesNotMatch(await dialog.innerText(),/raw points|history adjustment|concentration-adjusted|root-mean-square|Performance v2|40%|30%/);
   assert.match(await dialog.locator('.oa-review-evidence').innerText(),/Reported net P&L/);
   assert.match(await dialog.innerText(),/Next review/);
   assert.match(await dialog.locator('.dashboard-review-disclosure').innerText(),/Retrospective analysis only/);
   assert.equal(await dialog.getByRole('button',{name:'Open insights',exact:true}).isVisible(),true);
   const expanded=await geometry(p);assert(expanded.root<=1);for(const q of expanded.bounds)assert(q.overflow<=1,JSON.stringify(q));
   await dialog.screenshot({path:path.join(out,id+'-details.png')});
   await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});await p.waitForFunction(()=>document.activeElement?.textContent==='Review details');
   await chooseAccount(p,accountB);await renderedScore(p,expectedB);
   await chooseAccount(p,empty);await p.locator('[data-dashboard-empty="true"]').waitFor();assert.equal(await p.locator('.oa-discipline-score').count(),0);
   assert.match(await p.locator('[data-dashboard-empty="true"]').innerText(),/Import trade history/);
   await chooseAccount(p,'local');await renderedScore(p,expectedA);
   // The actual limits route updates stored rules; performance must not gain points.
   await p.evaluate(()=>{location.hash='#rules'});await p.getByRole('switch').first().waitFor();await p.getByRole('switch').first().click();
   await p.evaluate(()=>{location.hash='#dashboard'});await renderedScore(p,expectedA);
   const load=()=>p.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)),owner);
   const before=await load();assert.deepEqual(before.trades,initial);assert.equal(before.rules[0].enabled,false);
   await p.getByRole('button',{name:'Add trade',exact:true}).click();const form=p.getByRole('dialog',{name:'Add trade',exact:true});await form.waitFor();
   for(const[key,value]of Object.entries({date:'2026-02-05',market:'BTC',contracts:'1',entry:'100',exit:'90',pnl:'-500'}))await form.locator(`[name="${key}"]`).fill(value);
   await form.getByRole('button',{name:'Save trade',exact:true}).click();await form.waitFor({state:'detached'});
   const saved=await load();assert.equal(saved.trades.length,initial.length+1);assert.deepEqual(saved.trades.slice(0,initial.length),initial);
   const selected=saved.trades.filter(t=>t.manual?.accountKey==='local'),expectedAfter=analyze(selected,saved.rules).score;
   assert.ok(expectedAfter<expectedA);await renderedScore(p,expectedAfter);
   const stamp=await p.evaluate(()=>performance.timeOrigin);await p.reload();await p.locator('.astra-dashboard').waitFor();await renderedScore(p,expectedAfter);assert.notEqual(await p.evaluate(()=>performance.timeOrigin),stamp);
   assert.deepEqual((await load()).trades,saved.trades);await chooseAccount(p,accountB);await renderedScore(p,expectedB);await chooseAccount(p,'local');await renderedScore(p,expectedAfter);
   assert.equal(cloudWrites,0,'Browser-local changes must not upload silently');
   records.push({id,scoreBefore:expectedA,scoreOther:expectedB,scoreAfter:expectedAfter,empty:'unavailable',rulesInvariant:true,originalRowsPreserved:true,reloaded:true,cloudWrites,metrics,expanded});
   await writeFile(path.join(out,'results.json'),JSON.stringify(records,null,2));await c.close();
  }
  await browser.close();browser=null;
 }
 assert.equal(records.length,8);assert.deepEqual(errors,[]);console.log('PASS',records.length,'actual-App Chromium/WebKit score, details, account, rule, save and reload scenarios');
}finally{
 if(browser)await browser.close();await writeFile(path.join(out,'fixture.log'),log);await writeFile(path.join(out,'errors.json'),JSON.stringify(errors,null,2));
 child.kill('SIGTERM');for(let n=0;n<120&&child.exitCode===null&&child.signalCode===null;n++)await wait(100);
 assert(child.exitCode!==null||child.signalCode!==null,'Owned fixture must exit');assert.equal(await open(),false,'Owned fixture port must close');
}
