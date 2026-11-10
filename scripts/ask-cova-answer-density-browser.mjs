// Real component/client/query replay. Fixed synthetic prose is NOT model-quality evidence.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../', import.meta.url)).replaceAll('\\', '/');
const out = process.env.ASK_COVA_EVIDENCE_ROOT || root + '../ask-cova-account-data-evidence/review-fixes/presentation/browser';
mkdirSync(out, { recursive: true });
const id = root + '__answer_density__.tsx';
const canonicalCSS = [...readFileSync(root + 'src/main.tsx', 'utf8').matchAll(/import "([^"]+\.css)"/g)].map(([, path]) => `import '${path.startsWith('.') ? root + 'src/' + path.slice(2) : path}';`).join('');
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';
import{AskCova}from'${root}src/components/AskCova.tsx';
import{installSyntheticQueryTransport}from'${root}scripts/helpers/ask-cova-query-fixture.mjs';
import{syntheticSnapshot}from'${root}scripts/helpers/ask-cova-query-core-fixture.mjs';
import{buildAskCovaDataContext}from'${root}src/lib/askCovaData.ts';
import{executeAskCovaQuery,askCovaQueryModelPayload}from'${root}src/lib/askCovaQuery.ts';
import{renderAskCovaQueryAnswer,askCovaQueryHistoryText}from'${root}src/lib/askCovaQueryAnswer.ts';
import{requestAskCovaQuery}from'${root}src/lib/askCovaQueryClient.ts';
import{createAskCovaTransport}from'${root}src/lib/askCovaClient.ts';
const root=createRoot(document.getElementById('root'));
window.rows=[125,-25].map((pnl,i)=>({id:'manual-local-density-'+i,date:'2026-10-'+(20+i),market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl,risk:50,riskStatus:'provided',setup:'',notes:'',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}}));
installSyntheticQueryTransport(()=>window.rows);
window.baseRows=structuredClone(window.rows);
window.useCase=name=>{
 window.rows=structuredClone(window.baseRows);window.current=true;window.saved=true;
 let query={id:'results',op:'aggregate',source:'trades',where:[],groupBy:[],measures:[{id:'net',op:'sum',field:'reported_pnl'}],orderBy:[],mode:'complete',limit:20};
 if(name==='mixed-basis'||name==='mixed-sequence')window.rows[1].manual.pnlBasis='gross_before_fees';
 if(name==='currencies'){delete window.rows[1].manual;window.rows[1].source={provider:'Rithmic',accountId:'9',accountKey:'syntheticserverkey001',currency:'EUR'};}
 if(name==='unknown-currency')delete window.rows[1].manual;
 if(name==='missing-risk'){window.rows[1].risk=0;window.rows[1].riskStatus='missing';query.measures=[{id:'risk',op:'mean',field:'planned_risk'}];}
 if(name==='top-ties'){window.rows=[0,1,2].map(i=>({...structuredClone(window.baseRows[0]),id:'manual-local-tie-'+i,market:['NQ','ES','YM'][i],pnl:10}));query={...query,groupBy:['market'],orderBy:[{key:'net',direction:'desc'}],mode:'top',limit:1};}
 if(['filtered-drawdown','missing-close','mixed-sequence'].includes(name)){
  query={id:'decline',op:'sequence',source:'trades',where:[],metric:'reported_drawdown',order:'verified_close',mode:'complete',limit:1};
  if(name==='filtered-drawdown'){window.rows[1].side='Short';query.where=[[{field:'side',op:'eq',value:{type:'text',value:'Long'}}]];}
  if(name==='missing-close')window.rows[1].date=window.rows[0].date;
 }
 window.request=async(input,signal,_,current)=>{
  window.calls.push(input);const snapshot=syntheticSnapshot(input.owner,window.rows);
  const transport=createAskCovaTransport(input.owner,{current:()=>window.current,session:async()=>({user:{id:input.owner},access_token:'SYNTHETIC'}),fetch:async(_,init)=>{
   const body=JSON.parse(init.body);
   if(body.action==='ask_cova_context'){window.contextBodies.push(body);return new Response(JSON.stringify(snapshot));}
   window.bodies.push(body);const context=await buildAskCovaDataContext({snapshot,account:input.account,range:input.range,conversation:input.conversation});
   const plan={version:'ask-cova-query-plan-v1',decision:{kind:'query',queries:[query]}};
   const result=await executeAskCovaQuery(context,plan);window.lastResult=result;
   const cells=result.cells.filter(c=>c.value!==null&&(c.kind==='money'&&c.field!=='drawdown_peak'&&c.field!=='drawdown_trough'));
   const text=cells.length?'Saved values: '+cells.map(c=>'{{f:'+c.id+'}}').join('; ')+'.':'Not all saved values are available.';
   const evidence=result.observations.map(o=>o.id);const answer={version:'ask-cova-answer-v2',paragraphs:[{text,evidence}],detail:[{text:'These are the saved values behind this answer.',evidence}]};
   const rendered=renderAskCovaQueryAnswer(result,answer);if(!rendered)throw Error('Synthetic fixture answer rejected');
   window.originalNotices=rendered.scopeNotices;window.modelPayload=askCovaQueryModelPayload(result);window.safe.push(askCovaQueryHistoryText(result,answer));
   return new Response(JSON.stringify({status:'ok',aiResponseUsed:true,protocolVersion:'ask-cova-v4',requestId:input.requestId,snapshotDigest:context.snapshotDigest,contextDigest:context.contextDigest,plan,planDigest:result.planDigest,resultDigest:result.resultDigest,answer}));
  }});
  return requestAskCovaQuery(input,signal,transport,current);
 };
 window.show();
};
window.show=()=>flushSync(()=>root.render(<main className="oa-dashboard-app"><section className="astra-dashboard" data-dashboard-visual="reference" style={{display:'block',maxWidth:1040,margin:'24px auto',padding:'0 16px'}}><AskCova ownerId="11111111-1111-4111-8111-111111111111" account="all" range="all" trades={window.rows} ready={true} request={window.request} captureAuthority={window.captureAuthority} ownerCurrent={()=>window.current}/></section></main>));window.show();${canonicalCSS}`;
const built = await build({ root, configFile:false, envDir:false, logLevel:'error', plugins:[{ name:'answer-density', resolveId(v){ if(v.endsWith('__answer_density__.tsx'))return id; }, load(v){ if(v===id)return entry; } },react()],define:{'process.env.NODE_ENV':'"production"'},build:{write:false,copyPublicDir:false,lib:{entry:id,formats:['es'],fileName:'probe',cssFileName:'probe'}} });
const files = new Map((Array.isArray(built)?built.flatMap(r=>r.output):built.output).map(o=>['/'+o.fileName,o.type==='chunk'?o.code:o.source]));
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${[...files.keys()].filter(x=>x.endsWith('.css')).map(x=>`<link rel="stylesheet" href="${x}">`).join('')}</head><body style="background:#101318"><div id="root"></div><script type="module" src="/probe.js"></script></body></html>`;
const report = {synthetic:true,checks:[],views:[],errors:[],unexpectedRequests:[],sourceHashes:Object.fromEntries(['src/components/AskCova.tsx','src/lib/askCovaNoticePresentation.ts','src/styles/askCova.css', 'scripts/ask-cova-answer-density-browser.mjs'].map(path=>[path,createHash('sha256').update(readFileSync(root+path)).digest('hex')])),bundleHashes:Object.fromEntries([...files].map(([path,content])=>[path,createHash('sha256').update(content).digest('hex')]))};
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
 for(const width of [1440,390,320]) {
  const context = await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600,deviceScaleFactor:1});
  await context.route('**/*',route=>{const u=new URL(route.request().url());const body=u.origin==='https://density.test'?(u.pathname==='/'?html:files.get(u.pathname)):undefined;if(body===undefined){report.unexpectedRequests.push(u.href);return route.abort();}return route.fulfill({body,contentType:u.pathname==='/'?'text/html':u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'application/octet-stream'});});
  const page = await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('https://density.test');
  await page.getByRole('textbox',{name:'Message Cova'}).fill('Review my results');await page.getByRole('button',{name:'Send message'}).click();await page.locator('[data-cova-answer]').waitFor();
  const response=page.locator('[data-cova-reply]').first();
  const text=await response.innerText();report.views.push({width,visibleText:text});
  await page.screenshot({path:out+'/answer-'+width+'.png',fullPage:true});
  assert.doesNotMatch(text,/Saved all range:|Saved source completeness|net: self-reported net\./,'INT-02: whole reply must not stack generic diagnostic paragraphs');
  assert.match(text,/\$100\.00/);assert.match(text,/Self-reported net\./);
  assert.ok(text.trim().split(/\s+/).length<=45,'whole default reply, including actions and notices, stays concise');
  const detail=response.getByRole('button',{name:'Answer details',exact:true});
  assert.equal(await detail.getAttribute('aria-expanded'),'false');
  const controlled=await detail.getAttribute('aria-controls');assert.ok(controlled);assert.equal(await page.locator('#'+controlled).isVisible(),false);
  assert.doesNotMatch(await response.ariaSnapshot(),/Saved source completeness/,'collapsed provenance is absent from the accessibility tree');
  await detail.focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Tell me more');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Answer details');
  const before=await page.evaluate(()=>({requests:window.calls.length,bodies:window.bodies.length,context:window.contextBodies.length,metadata:JSON.stringify(window.lastResult),history:JSON.stringify(window.safe)}));
  await detail.focus();await detail.press('Enter');assert.equal(await detail.getAttribute('aria-expanded'),'true');
  const expanded=await response.innerText();
  for(const original of await page.evaluate(()=>window.lastResult.scopeNotices))assert.ok(expanded.includes(original),original);
  assert.match(expanded,/net: self-reported net\./);
  await page.screenshot({path:out+'/details-'+width+'.png',fullPage:true});
  await detail.press('Space');assert.equal(await detail.getAttribute('aria-expanded'),'false');
  assert.doesNotMatch(await response.innerText(),/Saved source completeness/);
  assert.deepEqual(await page.evaluate(()=>({requests:window.calls.length,bodies:window.bodies.length,context:window.contextBodies.length,metadata:JSON.stringify(window.lastResult),history:JSON.stringify(window.safe)})),before,'local disclosure changes no request, history or grounding metadata');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  report.checks.push('whole-bubble density, keyboard disclosure, exact original metadata and no network at '+width);
  for(const [name,patterns] of [
   ['mixed-basis',[/Mixed P&L bases: before fees; self-reported net/,/Keep these results separate/,/−\$25\.00/,/\$125\.00/]],
   ['currencies',[/−EUR 25\.00/,/\$125\.00/]],
   ['unknown-currency',[/currency unknown/,/only 1 of 2 matches/,/\$125\.00/]],
   ['missing-risk',[/planned risk missing/,/only 1 of 2 matches/,/not a complete total/]],
   ['top-ties',[/Showing 1 of 3 groups/,/2 equally ranked results are not shown/,/\$10\.00/]],
   ['filtered-drawdown',[/filtered-out trades do not count/,/not completed positions/,/starts from zero, not your account balance/,/price changes while trades were open are excluded/,/\$0\.00/]],
   ['missing-close',[/closing order is unclear/,/no sequence result is available/]],
   ['mixed-sequence',[/Mixed P&L bases; fees are not reconciled/,/\$25\.00/]]
  ]) {
   if(await page.getByRole('button',{name:'Clear conversation',exact:true}).count())await page.getByRole('button',{name:'Clear conversation',exact:true}).click();
   await page.evaluate(name=>window.useCase(name),name);
   await page.getByRole('textbox',{name:'Message Cova'}).fill('Review the saved data');await page.getByRole('button',{name:'Send message'}).click();await page.locator('[data-cova-answer]').waitFor();
   const bubble=page.locator('[data-cova-reply]').first(),visible=await bubble.innerText();report.views.push({width,case:name,visibleText:visible});
   for(const pattern of patterns)assert.match(visible,pattern,name+' keeps its material qualification visible');
   assert.doesNotMatch(visible,/Saved source completeness|Saved all range:/);
   assert.equal(await bubble.locator('[data-cova-qualifiers]').count(),1,'qualifiers are one compact paragraph');
   const before=await page.evaluate(()=>JSON.stringify({calls:window.calls,bodies:window.bodies,contexts:window.contextBodies,result:window.lastResult,model:window.modelPayload,history:window.safe}));
   const toggle=bubble.getByRole('button',{name:'Answer details',exact:true});await toggle.focus();await toggle.press('Enter');
   const originals=await page.evaluate(()=>window.originalNotices);
   assert.deepEqual(await bubble.locator('[id^="cova-notices-"] p').allTextContents(),originals,'all underlying strings retained exactly');
   for(const notice of originals)assert.ok((await bubble.innerText()).includes(notice));
   await toggle.press('Space');
   assert.equal(await page.evaluate(()=>JSON.stringify({calls:window.calls,bodies:window.bodies,contexts:window.contextBodies,result:window.lastResult,model:window.modelPayload,history:window.safe})),before);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' fits '+width);
   await page.screenshot({path:out+'/'+name+'-'+width+'.png',fullPage:true});
   report.checks.push(name+' visible warning, original details, immutable model/history and local-only disclosure at '+width);
  }
  // Direct retained delegated callbacks: positive control, then revoke in the same task.
  const toggle=page.getByRole('button',{name:'Answer details',exact:true});
  await toggle.evaluate(button=>{window.retainedNotice=button[Object.keys(button).find(key=>key.startsWith('__reactProps$'))].onClick;window.retainedNotice();});
  assert.equal(await toggle.getAttribute('aria-expanded'),'true','retained callback positive control opens current details');
  const callCount=await page.evaluate(()=>window.calls.length);
  await page.evaluate(()=>{window.saved=false;window.retainedNotice();});
  assert.equal(await page.locator('[data-cova-reply]').count(),0);assert.equal(await page.locator('[id^="cova-notices-"]').count(),0);assert.equal(await page.evaluate(()=>window.calls.length),callCount);
  for(const revoke of ['auth','clear']){
   await page.evaluate(()=>{window.saved=true;window.current=true;window.useCase('mixed-basis');});
   await page.getByRole('textbox',{name:'Message Cova'}).fill('Review the saved data');await page.getByRole('button',{name:'Send message'}).click();await page.locator('[data-cova-answer]').waitFor();
   await page.getByRole('button',{name:'Answer details',exact:true}).evaluate(button=>window.retainedNotice=button[Object.keys(button).find(key=>key.startsWith('__reactProps$'))].onClick);
   const before=await page.evaluate(()=>window.calls.length);
   await page.evaluate(revoke=>{if(revoke==='auth')window.current=false;else [...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Clear conversation').click();window.retainedNotice();},revoke);
   assert.equal(await page.locator('[data-cova-reply]').count(),0);assert.equal(await page.evaluate(()=>window.calls.length),before);
  }
  report.checks.push('direct callback positive control and same-task saved/auth/Clear revocation at '+width);
  await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpectedRequests,[]);
} catch(error) {report.failure=String(error);throw error;}
finally {await browser.close();writeFileSync(out+'/answer-density-browser.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
