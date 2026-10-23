import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {workspaceBrowserOptions,workspaceEvidence} from './workspace-browser-support.mjs';
import {chooseAccount,accountValue} from './helpers/account-picker.mjs';
import load from './helpers/load-ts.cjs';
const {readCompleteWorkspace}=load('src/lib/workspaceSnapshot.ts');
const out=path.resolve(process.env.MANUAL_SAVE_OUT||workspaceEvidence('manual-trade-account-save')),origin='http://127.0.0.1:4413';
await mkdir(out,{recursive:true});const scratch=path.join(out,'tmp');await mkdir(scratch,{recursive:true});
const child=spawn(process.execPath,['scripts/workspace-browser-fixture.mjs'],{env:{...process.env,COVA_WORKSPACE_FIXTURE_PORT:'4413',TMPDIR:scratch,TEMP:scratch,TMP:scratch},stdio:['ignore','pipe','pipe']});
let log='',browser;child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
const wait=ms=>new Promise(r=>setTimeout(r,ms)),records=[],errors=[];
const original={id:'manual-save-original',date:'2026-10-01',market:'ES',side:'Long',contracts:1,entry:100,exit:101,pnl:25,risk:0,riskStatus:'missing',setup:'',notes:'Original retained note',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}};
const perp='Manual:11111111-1111-4111-8111-111111111111';
async function fill(d,pnl='60') {for(const[k,v]of Object.entries({date:'2026-10-06',market:'BTC',contracts:'1',entry:'60000',exit:'60100',pnl}))await d.locator(`[name="${k}"]`).fill(v);}
try{
 for(let n=0;n<400&&!log.includes('LOCAL_WORKSPACE_FIXTURE')&&child.exitCode===null;n++)await wait(100);assert(log.includes(origin+'/__workspace'),log);
 for(const[name,engine,opts]of [['chromium',chromium,workspaceBrowserOptions],['webkit',webkit,{}]]){
  browser=await engine.launch({...opts,headless:true});
  for(const scenario of ['normal','refresh-before-open','refresh-while-open','different-session','signed-out','plan-downgrade','cloud-refresh']){
   const cloud=scenario==='cloud-refresh';const id=`${name}-${scenario}`,owner=crypto.randomUUID(),c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});let writes=0;
   await c.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.fallback():r.abort());
   await c.route('**/api/**',r=>r.request().url().includes('/api/workspace')?r.fallback():r.request().url().includes('/api/auth/consent')?r.fulfill({json:{accepted:true}}):r.fulfill({status:404,json:{error:'Isolated fixture'}}));
   await c.addInitScript(({owner,original,perp,cloud,scenario})=>{if(window.top!==window||location.origin==='null')return;window.__owner=owner;window.__qaSession={user:{id:owner,email:'manual-save@example.invalid',app_metadata:{plan:'pro'}},access_token:'qa-'+owner};localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'qa-session',email:'manual-save@example.invalid',signedInAt:new Date().toISOString()}));if(cloud)return;localStorage.setItem('cova-workspace-mode-v2:'+owner,'local');if(!localStorage.getItem('cova-react-risk-os-v2:'+owner)){localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades:scenario==='plan-downgrade'?Array.from({length:100},(_,i)=>({...original,id:'manual-existing-'+i} )):[original],rules:[],tradeAccount:perp}));localStorage.setItem('cova-workspace-aux-v1:'+owner,JSON.stringify({version:1,names:{local:'Original account',[perp]:'Perp account'},notes:{},cash:{}}));}}, {owner,original,perp,cloud,scenario});
   if(cloud){const headers={Authorization:'Bearer qa-'+owner};for(const data of [{owner,action:'consent',disclosure:'workspace-cloud-v1'},{owner,action:'apply',operationId:crypto.randomUUID(),records:[{kind:'trade',recordId:original.id,accountId:'local',schemaVersion:1,payload:original,expectedRevision:0,deleted:false},{kind:'account',recordId:perp,accountId:perp,schemaVersion:1,payload:{name:'Perp account'},expectedRevision:0,deleted:false}]}]){const res=await c.request.post(origin+'/api/workspace',{headers,data});assert.equal(res.status(),200,await res.text());}}
   const p=await c.newPage();p.on('pageerror',e=>errors.push(id+': '+e.message));p.on('request',r=>{if(r.url().includes('/api/workspace')&&r.method()==='POST')writes++});
   await p.goto(origin+'/#dashboard');await p.locator('.astra-dashboard').waitFor({timeout:25000});await p.locator('[data-toast-kind="sign-in"]').waitFor({state:'hidden',timeout:12000});
   if(cloud){await p.locator('[data-storage-phase="saved"]').waitFor();await chooseAccount(p,perp);}
   const refresh=()=>p.evaluate(scenario=>{window.__qaSession={...window.__qaSession,access_token:window.__qaSession.access_token+'~refreshed'};if(scenario==='different-session')window.__qaSessionIds={[window.__qaSession.access_token]:'different-login'};if(scenario==='plan-downgrade')window.__qaSession.user.app_metadata.plan='free';window.__qaAuthEvent('TOKEN_REFRESHED',window.__qaSession);},scenario);
   if(scenario==='refresh-before-open'){await refresh();await p.waitForTimeout(150);}
   await p.getByRole('button',{name:'Add trade',exact:true}).click();const d=p.getByRole('dialog',{name:'Add trade',exact:true});await d.waitFor();await fill(d);
   if(['refresh-while-open','different-session','plan-downgrade','cloud-refresh'].includes(scenario)){await refresh();await p.waitForTimeout(150);}
   if(scenario==='signed-out'){await p.evaluate(()=>window.__qaAuthEvent('SIGNED_OUT',null));await d.waitFor({state:'detached'});assert.equal(await p.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)).trades.length,owner),1);records.push({id,blocked:true});await c.close();continue;}
   await d.getByRole('button',{name:'Save trade',exact:true}).click();await p.waitForTimeout(250);
   const error=await d.getByRole('alert').count()?await d.getByRole('alert').innerText():null;
   const trades=await p.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)).trades,owner);
   await p.screenshot({path:path.join(out,id+'.png')});records.push({id,error,count:trades.length});await writeFile(path.join(out,'results.json'),JSON.stringify({records,errors},null,2));
   if(['different-session','plan-downgrade'].includes(scenario)){assert.equal(error,scenario==='different-session'?'Account changed. Reopen Add trade.':'Your plan’s stored-trade limit is reached.',id);assert.equal(trades.length,scenario==='plan-downgrade'?100:1);await c.close();continue;}
   assert.equal(error,null,id);await d.waitFor({state:'detached'});assert.equal(trades.length,2);assert.deepEqual(trades.find(t=>t.id===original.id),original);assert.equal(trades[1].manual.accountKey,perp);assert.equal(trades[1].pnl,60);if(!cloud)assert.equal(writes,0);else {await p.locator('[data-storage-phase="saved"]').waitFor();await p.waitForTimeout(700);const snapshot=await readCompleteWorkspace(owner,async cursor=>{const response=await c.request.get(origin+'/api/workspace?'+new URLSearchParams({owner,...cursor}),{headers:{Authorization:'Bearer qa-'+owner}});assert.equal(response.status(),200);return response.json();});assert(snapshot.records.some(r=>r.kind==='trade'&&r.payload.manual?.accountKey===perp&&r.payload.pnl===60),'Exact synthetic cloud record readback');}
   await p.reload();await p.locator('.astra-dashboard').waitFor();assert.equal(await accountValue(p),perp);assert.equal(await p.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)).trades.length,owner),2);
   await chooseAccount(p,'local');await p.getByText('+$25.00',{exact:true}).first().waitFor();await c.close();
  }await browser.close();browser=null;
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({records,errors},null,2));
}finally{await browser?.close();child.kill();for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await wait(50);await writeFile(path.join(out,'fixture.log'),log);}
