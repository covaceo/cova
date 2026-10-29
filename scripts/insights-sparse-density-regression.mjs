// Approved sparse-copy contract, rendered with the real component and model.
// No server, external fixture, account, auth or network is required.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/');
const id=root+'__insights_sparse_density_test__.tsx';
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {InsightsView} from '${root}src/components/InsightsView.tsx';
import {analyze,sampleTrades,defaultRules} from '${root}src/lib/risk.ts';
import '${root}src/styles/limitsInsightsShared.css';
const root=createRoot(document.getElementById('root'));
window.showDensity=(plan='pro',scenario='sparse')=>{
 let trades=sampleTrades.slice(0,3).map((t,i)=>({...t,id:'sparse-'+i,date:['2026-10-22','2026-10-24','2026-10-26'][i],pnl:[-25,40,55][i],contracts:1,setup:'',notes:['','Waited for the retest.','Stopped after the planned exit.'][i],risk:0,riskStatus:'missing'}));
 let rules=defaultRules.map(r=>({...r,enabled:scenario==='disabled'?false:scenario==='unevaluable'?r.metric==='minAvgR':r.enabled}));
 if(scenario==='breach')trades=structuredClone(sampleTrades);
 if(scenario==='provided')trades=trades.map(t=>({...t,risk:100,riskStatus:'provided'}));
 if(scenario==='legacy')trades=trades.map((t,i)=>({...t,id:'csv-'+i,risk:100,riskStatus:undefined}));
 const analysis=analyze(trades,rules);
 window.fixture={analysis,trades,held:JSON.stringify({analysis,trades}),scenario};
 root.render(<InsightsView analysis={analysis} entitlements={{plan,insightLimit:plan==='free'?2:Infinity}} go={route=>window.destination=route} upgradeToPro={()=>window.upgraded=true}/>);
};window.showDensity();`;
const result=await build({root,configFile:false,envDir:false,logLevel:'error',plugins:[{
 name:'isolated-insights-sparse-density',resolveId(value){if(value.endsWith('__insights_sparse_density_test__.tsx'))return id;},load(value){if(value===id)return entry;}
},react()],define:{'process.env.NODE_ENV':'"production"'},build:{write:false,copyPublicDir:false,lib:{entry:id,formats:['es'],fileName:'probe',cssFileName:'probe'}}});
const files=new Map((Array.isArray(result)?result.flatMap(r=>r.output):result.output).map(o=>['/'+o.fileName,o.type==='chunk'?o.code:o.source]));
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${[...files.keys()].filter(k=>k.endsWith('.css')).map(k=>`<link rel="stylesheet" href="${k}">`).join('')}<style>body{margin:0;background:#0f0f0f;color:white}main{padding:16px}*{box-sizing:border-box}</style></head><body><main class="oa-dashboard-app"><div id="root"></div></main><script type="module" src="/probe.js"></script></body></html>`;
const report={fixtureOnly:true,checks:[],cases:[],errors:[],blockedRequests:[]};
const check=(name,value)=>{assert.ok(value,name);report.checks.push(name);};
const questions={working:'What’s working?',tripping:'What’s tripping me up?',why:'Why did I take that?'};
const browser=await chromium.launch({channel:'chrome',headless:true});
async function open(width,plan){
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<=600,hasTouch:width<=600,reducedMotion:'reduce'});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url()),body=url.origin==='http://insights.test'?(url.pathname==='/'?html:files.get(url.pathname)):undefined;
  if(body===undefined){report.blockedRequests.push(url.href);return route.abort();}
  return route.fulfill({body,contentType:url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html'});
 });
 await context.addInitScript(()=>{
  if(window!==window.top)return;
  localStorage.setItem('density-sentinel','unchanged');window.storageWrites=[];
  for(const method of ['setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.storageWrites.push([method,...args]);return original.apply(this,args);};}
 });
 const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto('http://insights.test/');await page.locator('#ip-title').waitFor();
 await page.evaluate(plan=>window.showDensity(plan),plan);await page.locator('[data-open-setup]').waitFor();
 return {page,context};
}
async function closed(page,selector,label){
 check(label,await page.locator(selector).count()===1&&await page.locator(selector).evaluate(e=>e.tagName==='DETAILS'&&!e.open));
}
async function verifyRules(page,label){
 await page.locator('[data-limit-evidence] summary').click();
 const statuses=await page.evaluate(()=>window.fixture.analysis.ruleStatuses.filter(s=>s.rule.enabled));
 check(label+' all enabled limits accessible',await page.locator('[data-rule-evidence]').count()===statuses.length);
 for(const status of statuses){
  const text=await page.locator(`[data-rule-evidence="${status.rule.id}"]`).innerText();
  check(label+' exact '+status.rule.id,text.includes(status.summary)&&text.includes(!status.evaluated?'Not evaluated':status.breached?'Breached':'Inside limit')&&status.evidence.every(line=>text.includes(line)));
 }
}
try{
 for(const width of [320,390,768,1440])for(const plan of ['free','pro'])for(const tab of Object.keys(questions)){
  const label=`${width} ${plan} ${tab}`,record={label,passed:false};let context;
  try{
   const opened=await open(width,plan);context=opened.context;const p=opened.page;
   await p.getByRole('button',{name:questions[tab],exact:true}).click();
   const text=await p.locator('.insights-preview').innerText();
   check(label+' sparse fixture is partial, not all limits checked',await p.evaluate(()=>{const a=window.fixture.analysis;return a.tradeCount===3&&a.riskCount===0&&a.missingRiskCount===3&&a.ruleStatuses.filter(s=>s.rule.enabled).length===6&&a.ruleStatuses.filter(s=>s.rule.enabled&&s.evaluated).length===5&&a.breaches.length===0;}));
   if(tab==='working'){
    check(label+' no internal rows jargon',!text.includes('rows'));
    check(label+' no duplicate comparison caption',await p.locator('.ip-setups > .ip-caption').count()===0);
    const setup=await p.locator('[data-open-setup]').innerText();
    check(label+' adjacent risk count and R minimum',setup.includes('0/3 with planned risk')&&setup.includes('R needs 3'));
    check(label+' exact P&L, rate and missing R',setup.includes('$70.00')&&setup.includes('67%')&&await p.locator('[data-r-bar]').count()===0&&await p.getByLabel('Average R unavailable',{exact:true}).count()===1);
    await closed(p,'[data-setup-method]',label+' calculation details closed');
    check(label+' missing risk qualification is not global',!await p.locator('[data-planned-risk-coverage]').isVisible());
    await p.locator('[data-setup-method] summary').click();
    check(label+' full coverage and limitations accessible',await p.locator('[data-planned-risk-coverage]').isVisible()&&(await p.locator('[data-setup-method]').innerText()).includes('3 of 3 entries have no planned risk. R uses the 0 usable entries; P&L is unchanged.')&&(await p.locator('[data-setup-method]').innerText()).includes('display minimum, not proof of a reliable pattern'));
   }else if(tab==='why'){
    check(label+' no unrelated global warnings',!/rows have no planned risk|usable rows|enabled limit.*not checked|unverified risk|entries have no planned risk/.test(text));
    check(label+' no record inventory',!/\d+ trade records/.test(text));
    check(label+' selected date and money occur once',text.split('2026-10-22').length-1===1&&text.split('-$25.00').length-1===1);
    check(label+' honest absent note',await p.locator('[data-trade-note]').innerText()==='No note on this trade.');
    await closed(p,'[data-trade-details]',label+' trade details closed');
    await p.locator('[data-trade-details] summary').click();
    check(label+' actual contracts and missing risk accessible',(await p.locator('[data-trade-details]').innerText()).includes('1 contract')&&(await p.locator('[data-trade-details]').innerText()).includes('Planned risk: not provided'));
    for(const index of [1,2]){
     if(width<=600)await p.locator('.ip-record-toggle').click();
     check(label+' all records reachable '+index,await p.locator('.ip-trade').count()===3);
     await p.locator('.ip-trade').nth(index).click();
     check(label+' actual note verbatim '+index,await p.locator('[data-trade-note]').innerText()===await p.evaluate(i=>window.fixture.trades[i].notes,index));
    }
    await p.getByRole('button',{name:'Try a reflection',exact:true}).click();
    check(label+' reflection stays read-only',await p.locator('#ip-reflection').isVisible()&&await p.locator('input,textarea,[contenteditable="true"]').count()===0);
    await p.getByRole('button',{name:'Open journal',exact:true}).click();check(label+' journal callback',await p.evaluate(()=>window.destination==='dashboard'));
   }else{
    check(label+' short checked-only primary finding',await p.locator('.ip-finding-statement').innerText()==='No breaches found.');
    check(label+' exactly one primary finding and card',await p.locator('.ip-finding-statement').count()===1&&await p.locator('.ip-workbench > article,.ip-workbench > .ip-context').count()===1);
    check(label+' coverage occurs once',text.split('5 of 6 checked').length-1===1);
    check(label+' no fallback inventory or all-passed claim',!/imported history|Latest session|Needs attention|rows|all limits|Within limits/i.test(text));
    await closed(p,'[data-limit-evidence]',label+' limit evidence closed');
    if(plan==='pro'){
     await closed(p,'[data-insight="finding"] [data-review-context]',label+' Pro context closed inside finding');
     check(label+' exact plain disclosure label',await p.locator('[data-review-context] summary').innerText()==='More details');
     await p.locator('[data-review-context] summary').click();
     const contextText=await p.locator('[data-review-context]').innerText();
     const expected=await p.evaluate(()=>{const a=window.fixture.analysis,b=a.nextSessionBrief;return [b.summary,...b.evidence,...b.watchlist,...b.guardrails,...a.behaviorFlags.flatMap(f=>[f.label,f.summary,...f.evidence])];});
     check(label+' all summary, watchlist, thresholds and flags accessible',expected.every(line=>contextText.includes(line)));
    }else{
     check(label+' Free context gated, finding retained',await p.locator('[data-review-context]').count()===0&&await p.locator('[data-insights-locked]').isVisible());
     await p.getByRole('button',{name:'Unlock Pro',exact:true}).click();check(label+' upgrade callback',await p.evaluate(()=>window.upgraded===true));
    }
    await verifyRules(p,label);
   }
   check(label+' analysis, actual notes and storage unchanged',await p.evaluate(()=>JSON.stringify({analysis:window.fixture.analysis,trades:window.fixture.trades})===window.fixture.held&&window.storageWrites.length===0&&localStorage.getItem('density-sentinel')==='unchanged'));
   record.passed=true;
  }catch(error){record.failure=error.stack;}finally{await context?.close();report.cases.push(record);}
 }
 // Explicit disabled/unevaluable findings and real breach evidence, not waived prose.
 for(const scenario of ['disabled','unevaluable','breach','provided','legacy']){
  const record={label:scenario,passed:false};let context;
  try{
   const opened=await open(390,'pro');context=opened.context;const p=opened.page;
   await p.evaluate(scenario=>window.showDensity('pro',scenario),scenario);
   await p.waitForFunction(scenario=>window.fixture.scenario===scenario,scenario);
   if(['provided','legacy'].includes(scenario)){
    await p.getByRole('button',{name:questions.why,exact:true}).click();
    await closed(p,'[data-trade-details]',scenario+' details closed');await p.locator('[data-trade-details] summary').click();
    const text=await p.locator('[data-trade-details]').innerText();check(scenario+' actual risk and contracts',text.includes('Planned risk: $100.00')&&text.includes('1 contract'));
    check(scenario+' legacy qualification only when applicable',text.includes('Unverified risk from an older CSV.')===(scenario==='legacy'));
   }else{
    await p.getByRole('button',{name:questions.tripping,exact:true}).click();
    const expected=scenario==='disabled'?'No enabled limits to check.':scenario==='unevaluable'?'Enabled limits could not be evaluated.':await p.evaluate(()=>{const a=window.fixture.analysis;return (a.breaches.find(s=>s.rule.severity==='critical')??a.breaches.find(s=>s.rule.severity==='warning')??a.breaches[0]).summary;});
    check(scenario+' exact primary finding',await p.locator('.ip-finding-statement').innerText()===expected);
    if(scenario==='disabled')check('disabled checked count',await p.locator('[data-limit-evidence] summary .li-muted').innerText()==='0 of 0 checked');
    if(scenario==='unevaluable')check('unevaluable checked count',await p.locator('[data-limit-evidence] summary .li-muted').innerText()==='0 of 1 checked');
    if(scenario==='breach'){
     const expectedEvidence=await p.evaluate(()=>{const a=window.fixture.analysis;return (a.breaches.find(s=>s.rule.severity==='critical')??a.breaches.find(s=>s.rule.severity==='warning')??a.breaches[0]).evidence.slice(0,2);});
     assert.ok(expectedEvidence.length>0,'Real breach fixture has evidence');
     check('real breach evidence visible',await p.locator('.ip-visible-evidence').isVisible()&&expectedEvidence.every(line=>line.length>0)&&(await p.locator('.ip-visible-evidence').innerText()).includes(expectedEvidence[0]));
    }
    await verifyRules(p,scenario);
   }
   record.passed=true;
  }catch(error){record.failure=error.stack;}finally{await context?.close();report.cases.push(record);}
 }
 check('no runtime errors',report.errors.length===0);check('no unexpected external requests',report.blockedRequests.length===0);
 report.passed=report.cases.every(c=>c.passed);if(!report.passed)process.exitCode=1;
}finally{
 await browser.close();if(process.env.INSIGHTS_DENSITY_REPORT)writeFileSync(process.env.INSIGHTS_DENSITY_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
