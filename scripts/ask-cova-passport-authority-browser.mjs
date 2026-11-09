// Real producer -> WorkspaceSync hook -> AskCova/client/core. Synthetic auth and
// intercepted HTTP only; no injected lifecycle events and no live endpoints.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/');
const out=process.env.ASK_COVA_EVIDENCE_ROOT || root+'../ask-cova-account-data-evidence/passport-authority/browser';
mkdirSync(out,{recursive:true});
const owner='11111111-1111-4111-8111-111111111111',other='33333333-3333-4333-8333-333333333333',stamp='2026-10-30T00:00:00.000Z';
const records=[{kind:'rules',recordId:'current',accountId:'all',schemaVersion:1,payload:{rules:[]},revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null}];
const id=root+'__passport_authority__.tsx';
const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';
import{useWorkspaceSync}from'${root}src/components/WorkspaceSync.tsx';
import{AskCova}from'${root}src/components/AskCova.tsx';
import{requestPassportProgress}from'${root}src/lib/passportProgressClient.ts';
import{requestAskCovaQuery}from'${root}src/lib/askCovaQueryClient.ts';
import{bindAskCovaAccessAuthority}from'${root}src/lib/askCovaClient.ts';
import{buildAskCovaDataContext}from'${root}src/lib/askCovaData.ts';
import{executeAskCovaQuery}from'${root}src/lib/askCovaQuery.ts';
localStorage.clear();window.authOwner='${owner}';
for(const o of ['${owner}','${other}'])localStorage.setItem('cova-react-risk-os-v2:'+o,JSON.stringify({trades:[],rules:[]}));
localStorage.setItem('cova-active-storage-identity-v1',window.authOwner);
bindAskCovaAccessAuthority(o=>o===window.authOwner);
window.operations=[];window.queryFinished=0;window.query=async(...args)=>{try{return await requestAskCovaQuery(...args);}finally{window.queryFinished++;}};
window.earlyObservations=[];window.addEventListener('cova:passport-data-change',()=>{if(window.observeEarly)window.earlyObservations.push(window.captured());});
window.start=(action,o=window.authOwner)=>{const item={action,owner:o,settled:false};window.operations.push(item);item.promise=requestPassportProgress(o,action?{action}:undefined).then(value=>{item.value=value},error=>{item.error=error.message}).finally(()=>item.settled=true);return window.operations.length-1;};
window.makeAnswer=async(body,snapshot)=>{const context=await buildAskCovaDataContext({snapshot,account:body.account,range:body.range,conversation:body.conversation});const plan={version:'ask-cova-query-plan-v1',decision:{kind:'query',queries:[{id:'count',op:'aggregate',source:'trades',where:[],groupBy:[],measures:[{id:'total',op:'count',field:null}],orderBy:[],mode:'complete',limit:1}]}};const result=await executeAskCovaQuery(context,plan);return{status:'ok',aiResponseUsed:true,protocolVersion:'ask-cova-v4',requestId:body.requestId,snapshotDigest:context.snapshotDigest,contextDigest:context.contextDigest,plan,planDigest:result.planDigest,resultDigest:result.resultDigest,answer:{version:'ask-cova-answer-v2',paragraphs:[{text:'Saved count: {{f:cell_0}}.',evidence:['observation_0']}],detail:[]}};};
function Fixture(){const[activeOwner,O]=useState(window.authOwner),[trades,T]=useState([]),[rules,R]=useState([]);window.changeOwner=o=>{window.authOwner=o;localStorage.setItem('cova-active-storage-identity-v1',o);flushSync(()=>O(o));};const sync=useWorkspaceSync(activeOwner,trades,rules,(t,r)=>{T(t);R(r)});window.sync=sync;return <><p data-phase>{sync.phase}</p><AskCova ownerId={activeOwner} account="local" range="all" trades={trades} ready={sync.phase==='saved'} authorityKey={sync.askCovaAuthorityKey} captureAuthority={sync.captureAskCovaAuthority} request={window.query}/></>}
const root=createRoot(document.getElementById('root'));window.mount=()=>flushSync(()=>root.render(<Fixture/>));window.unmount=()=>flushSync(()=>root.render(null));`;
const built=await build({root,configFile:false,envDir:false,logLevel:'error',plugins:[{name:'passport-authority-fixture',resolveId(v){if(v.endsWith('__passport_authority__.tsx'))return id;},load(v){if(v===id)return entry;if(v.replaceAll('\\','/').endsWith('/src/lib/supabaseClient.ts'))return `export const getSupabaseClient=()=>({auth:{getSession:async()=>({data:{session:{user:{id:window.authOwner},access_token:'synthetic-token'}}})}});`;}},react()],define:{'process.env.NODE_ENV':'"production"','import.meta.env.VITE_WORKSPACE_SYNC_ENABLED':'"true"'},build:{write:false,copyPublicDir:false,lib:{entry:id,formats:['es'],fileName:'probe',cssFileName:'probe'}}});
const files=new Map((Array.isArray(built)?built.flatMap(r=>r.output):built.output).map(o=>['/'+o.fileName,o.type==='chunk'?o.code:o.source]));
const html='<!doctype html><link rel="stylesheet" href="/probe.css"><div id="root"></div><script type="module" src="/probe.js"></script>';
const report={synthetic:true,checks:[],errors:[],blocked:[],workspaceWrites:[],passport:[],ask:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});
let p; const held=[], heldAsk=[];let holdAsk;
async function until(predicate) { const end=Date.now()+7000;while(!predicate()){assert.ok(Date.now()<end,'expected intercepted transport');await new Promise(r=>setTimeout(r,10));} }
async function settle(index,json={},status=200) { await until(()=>held[index]);const h=held[index];await h.route.fulfill({status,json});h.resolve(); }
try {
 const c=await browser.newContext({serviceWorkers:'block'});
 await c.route('**/*',async r=>{
  const req=r.request(),u=new URL(req.url());
  if(u.origin!=='https://passport-authority.test'){report.blocked.push(u.href);return r.abort();}
  if(u.pathname==='/api/passport'){
   const body=req.method()==='POST'?req.postDataJSON():null;
   report.passport.push({method:req.method(),body,authorization:req.headers().authorization});
   await new Promise(resolve=>held.push({route:r,resolve})); return;
  }
  if(u.pathname==='/api/workspace'){
   assert.equal(req.headers().authorization,'Bearer synthetic-token');
   if(req.method()==='GET')return r.fulfill({json:{owner:u.searchParams.get('owner'),revision:1,consent:true,pendingWrite:null,chunk:Buffer.from(records.map(r=>JSON.stringify(r)+'\n').join('')).toString('base64'),next:null}});
   const body=req.postDataJSON();
   if(!['ask_cova_context','ask_cova'].includes(body.action)){report.workspaceWrites.push(body);return r.fulfill({status:503,json:{error:'Unexpected write blocked'}});}
   report.ask.push(body);
   const snapshot={version:'ask-cova-data-v1',owner:body.owner,workspaceRevision:1,workspaceRecords:records,passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}};
   const json=body.action==='ask_cova_context'?snapshot:await p.evaluate(([body,snapshot])=>window.makeAnswer(body,snapshot),[body,snapshot]);
   let heldResponse;
   if(holdAsk===body.action)await new Promise(resolve=>{heldResponse={resolve,done:false};heldAsk.push(heldResponse);});
   await r.fulfill({json});if(heldResponse)heldResponse.done=true;return;
  }
  const body=u.pathname==='/'?html:files.get(u.pathname);
  if(body===undefined){report.blocked.push(u.href);return r.abort();}
  return r.fulfill({body,contentType:u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'text/html'});
 });
 p=await c.newPage();p.setDefaultTimeout(7000);p.on('pageerror',e=>report.errors.push(e.message));
 await p.goto('https://passport-authority.test');await p.waitForFunction(()=>!!window.mount);
 await p.evaluate(()=>{window.start('plan');window.mount();});
 await p.waitForFunction(()=>window.sync?.phase==='saved');
 assert.equal(await p.evaluate(async()=>(await window.sync.captureAskCovaAuthority())===null),true,'mount catches Passport mutation already pending before hook subscription');
 report.checks.push('pre-mount real plan blocks authority after workspace load');
 await p.getByRole('button',{name:'Review my results',exact:true}).click();
 await p.getByText('Let your saved account data finish syncing, then ask again.',{exact:true}).waitFor();
 assert.deepEqual(report.ask,[],'Ask cannot read context or generate while a pre-mount mutation is pending');
 await settle(0);await p.waitForFunction(()=>window.operations[0].settled);
 assert.equal(await p.evaluate(async()=>{window.captured=await window.sync.captureAskCovaAuthority();return window.captured?.();}),true);
 await p.evaluate(()=>{window.observeEarly=true;window.start('review');});
 assert.deepEqual(await p.evaluate(()=>window.earlyObservations),[false],'captured epoch is revoked before an earlier lifecycle listener can reuse it');
 report.checks.push('synchronous producer state revokes captured authority before consumer notification ordering');
 await until(()=>held[1]);
 await p.evaluate(()=>{window.observeEarly=false;window.start('inspect');window.start();});
 await until(()=>held[3]);
 await settle(1,{error:'Synthetic review failure'},503);await p.waitForFunction(()=>window.operations[1].settled);
 assert.equal(await p.evaluate(()=>window.operations[1].error),'Synthetic review failure');
 await settle(3);await p.waitForFunction(()=>window.operations[3].settled);
 assert.equal(await p.evaluate(async()=>(await window.sync.captureAskCovaAuthority())===null),true,'review failure and GET completion cannot clear pending inspect');
 await p.getByRole('button',{name:'Review my results',exact:true}).click();
 await p.getByText('Let your saved account data finish syncing, then ask again.',{exact:true}).waitFor();assert.equal(report.ask.length,0);
 await settle(2);await p.waitForFunction(()=>window.operations[2].settled);
 assert.equal(await p.evaluate(()=>window.captured()),false,'settlement never resurrects old captured authority');
 assert.equal(await p.evaluate(async()=>{window.captured=await window.sync.captureAskCovaAuthority();return window.captured?.();}),true);
 report.checks.push('overlapping real review/inspect + GET, failure release, aggregate block until last write settles');
 const send=async(text)=>{await p.getByRole('textbox',{name:'Message Cova'}).fill(text);await p.getByRole('button',{name:'Send message'}).click();};
 await send('Review my saved results');await p.locator('[data-cova-answer]').waitFor();
 assert.equal(await p.locator('[data-cova-answer]').innerText(),'Saved count: 0.');assert.equal(report.ask.length,2);
 assert.equal(report.passport.length,4,'Ask never triggers a Passport mutation');
 await p.evaluate(()=>window.start());await until(()=>held[4]);
 assert.equal(await p.evaluate(()=>window.captured()),true,'GET must not revoke existing authority');
 assert.equal(await p.locator('[data-cova-answer]').count(),1,'GET must not erase successful chat');
 await settle(4);await p.waitForFunction(()=>window.operations[4].settled);
 assert.equal(await p.evaluate(()=>window.captured()),true);
 report.checks.push('actual Ask context/generation/replay succeeds after settle; GET preserves chat and authority');
 await p.getByRole('textbox',{name:'Message Cova'}).fill('Follow up on that answer');
 assert.equal(await p.evaluate(()=>{const button=document.querySelector('button[type=submit]');window.start('plan');const stale=window.captured();button.click();return stale;}),false);
 await until(()=>held[5]);await p.waitForFunction(()=>!document.querySelector('[data-cova-answer]'));
 assert.equal(report.ask.length,2,'same-task retained Send after real mutation cannot dispatch old history');
 await settle(5);await p.waitForFunction(()=>window.operations[5].settled);
 await send('Review the updated saved data');await p.locator('[data-cova-answer]').waitFor();
 assert.equal(report.ask.length,4);assert.deepEqual(report.ask[3].conversation.history,[],'new send uses fresh conversation');
 report.checks.push('real plan synchronously revokes retained Send and rendered answer; next deliberate Send has fresh context/history');
 for(const [phase,action,index] of [['ask_cova_context','review',6],['ask_cova','inspect',7]]){
  const clear=p.getByRole('button',{name:'Clear conversation',exact:true});if(await clear.count())await clear.click();
  holdAsk=phase;const heldIndex=heldAsk.length,before=report.ask.length,finished=await p.evaluate(()=>window.queryFinished);
  await send('Delayed '+phase);await until(()=>heldAsk[heldIndex]);
  await p.evaluate(action=>window.start(action),action);await until(()=>held[index]);
  holdAsk=undefined;heldAsk[heldIndex].resolve();await until(()=>heldAsk[heldIndex].done);
  await p.waitForFunction(n=>window.queryFinished>n,finished);
  await p.waitForFunction(()=>!document.querySelector('[data-cova-processing]'));
  assert.equal(await p.locator('[data-cova-answer]').count(),0,'late '+phase+' response cannot publish after '+action);
  await settle(index);await p.waitForFunction(i=>window.operations[i].settled,index);
  // A fresh authority capture waits for the actual hook rather than a fixed sleep.
  assert.equal(await p.evaluate(async()=>{const a=await window.sync.captureAskCovaAuthority();return a?.();}),true);
  assert.equal(report.ask.length,before+(phase==='ask_cova_context'?1:2),'no generation after revoked context and no automatic retry');
 }
 report.checks.push('real review during context and inspect during generation revoke late responses; no auto retry');
 await p.evaluate(()=>window.start('plan'));await until(()=>held[8]);
 await p.evaluate(o=>window.changeOwner(o),other);await p.waitForFunction(()=>window.sync?.phase==='saved');
 assert.equal(await p.evaluate(async()=>{const a=await window.sync.captureAskCovaAuthority();return a?.();}),true,'A pending does not block B');
 await p.evaluate(()=>window.start('review'));await until(()=>held[9]);
 await p.evaluate(o=>window.changeOwner(o),owner);await p.waitForFunction(()=>window.sync?.phase==='saved');
 assert.equal(await p.evaluate(async()=>(await window.sync.captureAskCovaAuthority())===null),true,'returning owner catches A still pending');
 await settle(8);await p.waitForFunction(()=>window.operations[8].settled);
 assert.equal(await p.evaluate(async()=>{const a=await window.sync.captureAskCovaAuthority();return a?.();}),true,'B pending cannot contaminate A settlement');
 await p.evaluate(o=>window.changeOwner(o),other);await p.waitForFunction(()=>window.sync?.phase==='saved');
 assert.equal(await p.evaluate(async()=>(await window.sync.captureAskCovaAuthority())===null),true,'returning B catches its pending review');
 await settle(9);await p.waitForFunction(()=>window.operations[9].settled);
 assert.equal(await p.evaluate(async()=>{window.captured=await window.sync.captureAskCovaAuthority();return window.captured?.();}),true);
 await p.evaluate(()=>{window.unmount();window.start('inspect');window.mount();});await until(()=>held[10]);await p.waitForFunction(()=>window.sync?.phase==='saved');
 assert.equal(await p.evaluate(async()=>!window.captured()&&(await window.sync.captureAskCovaAuthority())===null),true,'remount catches an inspect that started without a subscriber');
 await settle(10);await p.waitForFunction(()=>window.operations[10].settled);
 assert.equal(await p.evaluate(async()=>{const a=await window.sync.captureAskCovaAuthority();return a?.();}),true);
 report.checks.push('owner A/B overlap, owner-return catch-up, unmounted inspect/remount catch-up');
 assert.equal(await p.evaluate(()=>window.operations.every(x=>x.settled)),true);
 assert.equal(report.passport.length,11);assert.equal(report.ask.length,7);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.blocked,[]);assert.deepEqual(report.workspaceWrites,[]);
} catch(e) { report.failure=String(e);throw e; }
finally { for(const h of held)h.resolve();await browser.close();writeFileSync(out+'/passport-authority-browser.json',JSON.stringify(report,null,2)); }
console.log(JSON.stringify(report));
