import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/');
const evidence=(process.env.ASK_COVA_EVIDENCE_ROOT || root+'../ask-cova-insights-evidence/interaction')+'/ui';
mkdirSync(evidence,{recursive:true});
assert.ok(existsSync(root+'src/components/AskCova.tsx'),'Risk Desk Ask Cova component exists');
const id=root+'__ask_cova_ui_test__.tsx';
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{AskCova}from'${root}src/components/AskCova.tsx';import{bindAskCovaAccessAuthority,askCovaAccessCurrent,createAskCovaTransport,requestAskCova}from'${root}src/lib/askCovaClient.ts';
const root=createRoot(document.getElementById('root'));
const trades=[100,-30,20].map((pnl,i)=>({id:'manual-'+i,date:'2026-10-2'+(i+1),market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl,risk:50,riskStatus:'provided',setup:'',notes:'Private journal note',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}}));
window.calls=[];window.mode='ok';window.current=true;window.trades=trades;
// Synthetic capability lifecycle through the same public binding API used by useAskCovaAccess.
// No auth/server discovery is simulated as real; default component authority stays intact.
window.betaCurrent=askCovaAccessCurrent;
window.setBetaGrant=allowed=>{window.removeBetaGrant?.();window.removeBetaGrant=bindAskCovaAccessAuthority(owner=>allowed===true&&owner==='11111111-1111-4111-8111-111111111111'&&window.current);};
window.request=async(input,signal)=>{window.calls.push(input);if(window.mode==='body'){const transport=createAskCovaTransport(input.owner,{current:()=>window.current,session:async()=>({user:{id:input.owner},access_token:'MOCK-TOKEN'}),fetch:async()=>new Response(new ReadableStream({start(controller){window.bodyController=controller;window.bodyInput=input;}}))});return requestAskCova(input,signal,transport);}if(window.mode==='slow')await new Promise(r=>window.finish=r);if(window.mode==='error')return {status:'unavailable',message:'Answer unavailable. Try again.'};return {status:'ok',aiResponseUsed:true,contextDigest:input.contextDigest,selection:{choice_id:window.choice||(input.question==='explain_drawdown'?'drawdown':'result'),style:'warm'}};};
window.showAsk=(ready=true,account='local',range='all',rows=trades,injectedAuthority=true,ownerId='11111111-1111-4111-8111-111111111111')=>root.render(<AskCova ownerId={ownerId} account={account} range={range} trades={rows} ready={ready} request={window.request} ownerCurrent={injectedAuthority ? owner=>owner==='11111111-1111-4111-8111-111111111111'&&window.current : undefined}/>);window.showAsk();`;
const result=await build({root,configFile:false,envDir:false,logLevel:'error',plugins:[{name:'ask-cova-ui',resolveId(v){if(v.endsWith('__ask_cova_ui_test__.tsx'))return id;},load(v){if(v===id)return entry;}},react()],define:{'process.env.NODE_ENV':'"production"'},build:{write:false,copyPublicDir:false,lib:{entry:id,formats:['es'],fileName:'probe',cssFileName:'probe'}}});
const files=new Map((Array.isArray(result)?result.flatMap(r=>r.output):result.output).map(o=>['/'+o.fileName,o.type==='chunk'?o.code:o.source]));
const html=`<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>${[...files.keys()].filter(x=>x.endsWith('.css')).map(x=>`<link rel='stylesheet' href='${x}'>`).join('')}</head><body><div id='root'></div><script type='module' src='/probe.js'></script></body></html>`;
const browser=await chromium.launch({channel:'chrome',headless:true});const report={checks:[],errors:[],requests:[]};
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.route('**/*',r=>{const u=new URL(r.request().url());const body=u.origin==='https://ask.test'?(u.pathname==='/'?html:files.get(u.pathname)):undefined;if(body===undefined){report.requests.push(u.href);return r.abort();}return r.fulfill({body,contentType:u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'text/html'});});
 const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto('https://ask.test');
 await p.getByRole('heading',{name:'Ask Cova'}).waitFor();
 for(const name of ['Review my results','Explain my drawdown','What stands out?'])assert.ok(await p.getByRole('button',{name,exact:true}).isVisible());
 report.checks.push('three accessible full-label presets in Risk Desk panel');
 await p.getByRole('button',{name:'Review my results',exact:true}).click();
 assert.equal(await p.getByRole('button',{name:'Use AI for this review',exact:true}).count(),0);
 await p.waitForFunction(()=>window.calls.length===1);
 assert.equal(report.requests.length,0);report.checks.push('first deliberate preset dispatches exactly once without a consent UI');
 await p.locator('[data-cova-answer]').waitFor({timeout:5000}).catch(async e=>{console.log(await p.locator('body').innerText(),await p.evaluate(()=>window.calls));throw e;});
 assert.match(await p.locator('[data-cova-answer]').innerText(),/90\.00/);
 assert.ok(!JSON.stringify(await p.evaluate(()=>window.calls)).includes('Private journal note'));
 assert.equal(await p.evaluate(()=>window.calls.length),1);report.checks.push('deliberate action -> actual catalog -> guarded selection -> concise bubble');
 await p.getByRole('button',{name:'Tell me more',exact:true}).click();await p.locator('[data-cova-detail]').waitFor();
 assert.equal(await p.evaluate(()=>window.calls.length),1);report.checks.push('detail is a checked follow-up, no second paid call');
 await p.getByRole('button',{name:'Show trades',exact:true}).click();
 await p.getByRole('heading',{name:'Trades behind this answer'}).waitFor();
 assert.ok(!(await p.locator('dialog').innerText()).includes('All dates'));
 assert.match(await p.locator('dialog').innerText(),/Selected answer/);
 assert.equal(await p.locator('dialog [data-journal-accuracy]').count(),0,'Ask Cova evidence keeps currency-aware rows without a second journal summary');
 await p.getByRole('button',{name:'Close trade history'}).click();report.checks.push('exact evidence opens a scoped read-only history dialog');
 await p.evaluate(()=>window.showAsk(true,'local','today'));await p.waitForFunction(()=>!document.querySelector('[data-cova-answer]'));
 assert.equal(await p.locator('[data-cova-detail]').count(),0);report.checks.push('range change clears prior answers and actions');
 await p.evaluate(()=>window.mode='slow');
 await p.getByRole('button',{name:'Review my results',exact:true}).click();
 await p.waitForFunction(()=>window.calls.length===2);
 assert.ok(await p.getByText('Checking your results…').isVisible());
 await p.evaluate(()=>{window.showAsk(true,'manual:other');window.finish();});
 await p.waitForTimeout(100);assert.equal(await p.locator('[data-cova-answer]').count(),0);report.checks.push('late response from previous account is discarded');
 await p.evaluate(()=>{window.mode='error';window.showAsk();});
 await p.getByRole('button',{name:'Review my results',exact:true}).click();
 await p.getByText('Answer unavailable. Try again.').waitFor();assert.equal(await p.getByRole('button',{name:'Show trades',exact:true}).count(),0);assert.equal(await p.locator('[data-cova-answer]').count(),0);
 report.checks.push('failure is visibly not an AI answer and has no actions');
 await p.evaluate(()=>window.mode='ok');await p.getByRole('button',{name:'Try again',exact:true}).click();await p.locator('[data-cova-answer]').waitFor();
 for(const [name,number] of [['Explain my drawdown','30.00'],['What stands out?','90.00']]){
  await p.getByRole('button',{name,exact:true}).click();await p.waitForFunction(number=>[...document.querySelectorAll('[data-cova-answer]')].at(-1)?.textContent.includes(number),number);
 }
 assert.equal(await p.locator('[data-cova-answer]').count(),3,'successful exchanges remain in the conversation');
 assert.equal(await p.getByRole('group',{name:/Cova reply/}).count(),3,'each checked reply has its own accessible group');
 report.checks.push('all three questions render actual checked results and explicit retry works; replies persist');
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();assert.equal(await p.locator('[data-cova-answer]').count(),0);
 const keyboard=p.getByRole('button',{name:'Review my results',exact:true});await keyboard.focus();await p.keyboard.press('Enter');
 await p.locator('[data-cova-answer]').waitFor();await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 assert.equal(await p.locator('[role="log"]').count(),0);report.checks.push('clear revokes the prior epoch; keyboard choice dispatches without another prompt');
 await p.evaluate(()=>{window.choice='empty';window.showAsk(true,'local','all',[]);});await p.getByRole('button',{name:'Review my results',exact:true}).click();await p.locator('[data-cova-answer]').waitFor();
 assert.match(await p.locator('[data-cova-answer]').innerText(),/Log or import a completed trade/);assert.equal(await p.getByRole('button',{name:'Show trades',exact:true}).count(),0);report.checks.push('empty data invites logging a completed trade, without invented evidence');
 await p.evaluate(()=>{window.choice='invented_choice';window.showAsk();});await p.getByRole('button',{name:'Review my results',exact:true}).click();
 await p.getByText("I couldn't check that answer. Your trades are unchanged. Try again when you're ready.").waitFor();assert.equal(await p.locator('[data-cova-answer]').count(),0);report.checks.push('unknown provider selection fails closed in the renderer');
 // F-02: invalidate live authority WITHOUT updating any component props.
 const authorityFailures=[];
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 await p.evaluate(()=>{window.choice='result';window.mode='slow';window.current=true;window.finish=undefined;});
 await p.getByRole('button',{name:'Review my results',exact:true}).click();
 await p.waitForFunction(()=>!!window.finish);await p.evaluate(()=>{window.current=false;window.finish();});
 await p.waitForFunction(()=>!document.body.textContent.includes('Checking your results…'));
 if(await p.locator('[data-cova-answer]').count())authorityFailures.push('stale completion rendered');
 for(const action of ['Show trades','Tell me more']){
  await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
  await p.evaluate(()=>{window.mode='ok';window.current=true;});
  await p.getByRole('button',{name:'Review my results',exact:true}).click();await p.locator('[data-cova-answer]').waitFor();
  await p.evaluate(()=>window.current=false);await p.getByRole('button',{name:action,exact:true}).click();
  if(await p.locator('dialog').count())authorityFailures.push('stale evidence opened');
  if(await p.locator('[data-cova-detail]').count())authorityFailures.push('stale detail opened');
  if(await p.locator('dialog').count())await p.getByRole('button',{name:'Close trade history'}).click();
 }
 // Injecting a request alone must NOT implicitly bypass real workspace authority.
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 await p.evaluate(()=>{window.current=true;window.showAsk(true,'local','all',undefined,false);});
 const beforeDefaultAuthority=await p.evaluate(()=>window.calls.length);
 await p.getByRole('button',{name:'Review my results',exact:true}).click();
 await p.waitForTimeout(100);
 if(await p.evaluate(()=>window.calls.length)!==beforeDefaultAuthority)authorityFailures.push('injected request bypassed default authority');
 assert.deepEqual(authorityFailures,[]);
 report.checks.push('F-02 delayed completion, both stale actions, and production default authority fail closed');
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();await p.evaluate(()=>window.showAsk());
 await p.evaluate(()=>{window.mode='body';window.current=true;});
 await p.getByRole('button',{name:'Review my results',exact:true}).click();
 await p.waitForFunction(()=>!!window.bodyController);
 await p.evaluate(()=>{window.current=false;window.bodyController.enqueue(new TextEncoder().encode(JSON.stringify({status:'ok',aiResponseUsed:true,contextDigest:window.bodyInput.contextDigest,selection:{choice_id:'result',style:'plain'}})));window.bodyController.close();});
 await p.getByText('Your session changed. Sign in again to ask Cova.').waitFor();
 assert.equal(await p.locator('[data-cova-answer]').count(),0);assert.equal(await p.getByRole('button',{name:'Show trades',exact:true}).count(),0);
 report.checks.push('F-02 actual transport/parser delayed-body invalidation cannot render an answer');
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 await p.evaluate(()=>{window.mode='ok';window.current=true;localStorage.setItem('cova-active-storage-identity-v1','11111111-1111-4111-8111-111111111111');window.showAsk(true,'local','all',undefined,false);});
 const beforeBetaGrant=await p.evaluate(()=>{window.setBetaGrant(false);return window.calls.length;});
 assert.equal(await p.evaluate(()=>window.betaCurrent('11111111-1111-4111-8111-111111111111')),false);
 await p.getByRole('button',{name:'Review my results',exact:true}).click();
 await p.getByText('Your session changed. Sign in again to ask Cova.',{exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>window.calls.length),beforeBetaGrant);assert.equal(await p.locator('[data-cova-answer]').count(),0);
 report.checks.push('default authority denies a live storage owner without a verified beta grant');
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();await p.evaluate(()=>window.setBetaGrant(true));
 assert.equal(await p.evaluate(()=>window.betaCurrent('11111111-1111-4111-8111-111111111111')),true);
 await p.getByRole('button',{name:'Review my results',exact:true}).click();await p.locator('[data-cova-answer]').waitFor();
 await p.evaluate(()=>localStorage.removeItem('cova-active-storage-identity-v1'));await p.getByRole('button',{name:'Show trades',exact:true}).click();
 assert.equal(await p.locator('dialog').count(),0);assert.equal(await p.locator('[data-cova-answer]').count(),0);
 report.checks.push('F-02 default authority reads the live storage owner before evidence actions');
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 await p.evaluate(()=>localStorage.setItem('cova-active-storage-identity-v1','11111111-1111-4111-8111-111111111111'));
 await p.getByRole('button',{name:'Review my results',exact:true}).click();await p.locator('[data-cova-answer]').waitFor();
 const beforeBetaRemoval=await p.evaluate(()=>{window.removeBetaGrant();return window.calls.length;});
 assert.equal(await p.evaluate(()=>window.betaCurrent('11111111-1111-4111-8111-111111111111')),false);
 await p.getByRole('button',{name:'Show trades',exact:true}).click();
 assert.equal(await p.locator('dialog').count(),0);assert.equal(await p.locator('[data-cova-answer]').count(),0);
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 await p.getByRole('button',{name:'Review my results',exact:true}).click();
 await p.getByText('Your session changed. Sign in again to ask Cova.',{exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>window.calls.length),beforeBetaRemoval);assert.equal(await p.locator('[data-cova-answer]').count(),0);
 await p.evaluate(()=>localStorage.removeItem('cova-active-storage-identity-v1'));
 report.checks.push('removed beta grant blocks retained evidence and new deliberate questions without changing component props');
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();await p.evaluate(()=>window.showAsk());
 // F-01: exercise the actual evidence action, not only the answer bubble.
 const moneyRow=(id,pnl,extra={})=>({id,date:'2026-10-30',market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl,risk:5,riskStatus:'provided',setup:'',notes:'SYNTHETIC note',...extra});
 const eur=moneyRow('rithmic-eur',2.25,{source:{provider:'Rithmic',accountKey:'MOCK_ACCOUNT',accountId:'9',currency:'EUR'}});
 const usd=moneyRow('manual-usd',3,{manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}});
 const unknown=moneyRow('csv-unknown',4);
 const invalid=moneyRow('manual-invalid',1.001,{risk:5.001,manual:usd.manual});
 for(const sample of [
  {choice:'result',rows:[eur],expected:[['rithmic-eur','2.25 (EUR)','Planned risk5.00 (EUR)']]},
  {choice:'mixed_currencies',rows:[eur,usd],expected:[['rithmic-eur','2.25 (EUR)','Planned risk5.00 (EUR)'],['manual-usd','$3.00','Planned risk$5.00']]},
  {choice:'unknown_currency',rows:[eur,unknown],expected:[['rithmic-eur','2.25 (EUR)','Planned risk5.00 (EUR)'],['csv-unknown','4.00 (currency unknown)','Planned risk5.00 (currency unknown)']]},
  {choice:'invalid_money',rows:[invalid],expected:[['manual-invalid','Unavailable (invalid money)','Planned riskUnavailable (invalid money)']]},
 ]){
  await p.evaluate(({choice,rows})=>{window.choice=choice;window.showAsk(true,'all','all',rows);},sample);
  await p.getByRole('button',{name:'Review my results',exact:true}).click();await p.locator('[data-cova-answer]').waitFor();
  await p.getByRole('button',{name:'Show trades',exact:true}).click();await p.locator('dialog').waitFor();
  for(const [id,pnl,risk] of sample.expected){
   const row=p.locator(`[data-history-trade="${id}"]`);
   assert.equal(await row.locator('[data-history-field="pnl"]').innerText(),pnl);
   assert.equal(await row.locator('[data-history-field="risk"]').innerText(),risk);
  }
  await p.getByRole('button',{name:'Close trade history'}).click();
  report.checks.push('F-01 evidence denomination and validity: '+sample.choice);
 }
 for(const change of ['owner','account','range','readiness','annotation']){
  await p.evaluate(()=>{window.choice='result';window.showAsk();});
  await p.getByRole('button',{name:'Review my results',exact:true}).click();await p.locator('[data-cova-answer]').waitFor();
  await p.getByRole('button',{name:'Tell me more',exact:true}).click();
  await p.evaluate(change=>{
   if(change==='owner')window.showAsk(true,'local','all',undefined,true,'33333333-3333-4333-8333-333333333333');
   if(change==='account')window.showAsk(true,'all');
   if(change==='range')window.showAsk(true,'local','today');
   if(change==='readiness')window.showAsk(false);
   if(change==='annotation')window.showAsk(true,'local','all',window.trades.map(row=>({...row,notes:'edited synthetic note'})));
  },change);
  await p.waitForFunction(()=>!document.querySelector('[data-cova-answer]'));
  assert.equal(await p.locator('[data-cova-detail]').count(),0);assert.equal(await p.getByRole('button',{name:'Show trades',exact:true}).count(),0);
  report.checks.push('scope remount still clears answer/detail/actions: '+change);
 }
 await p.evaluate(()=>window.showAsk(false));await p.getByText('Save your account workspace before asking Cova.').waitFor();
 assert.ok(await p.getByRole('button',{name:'Review my results',exact:true}).isDisabled());report.checks.push('browser-only workspace cannot dispatch');
 assert.deepEqual(report.errors,[]);
 assert.deepEqual(report.requests,[]);
 assert.equal(report.checks.length,27,'complete existing UI coverage plus beta-denied/removed checks');
}finally{await browser.close();writeFileSync(evidence+'/ui.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
