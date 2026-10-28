// Isolated real-component hydration; synthetic rows live only in this test bundle.
// All requests are intercepted. No auth fixture, backend, or product source injection.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/');
const id=root+'__insights_interaction_test__.tsx';
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {InsightsView} from '${root}src/components/InsightsView.tsx';
import {NextSessionBriefCard} from '${root}src/components/DashboardBriefs.tsx';
import {OaDisciplineReview} from '${root}src/components/OaDisciplineReview.tsx';
import {analyze,sampleTrades,defaultRules} from '${root}src/lib/risk.ts';
import '${root}src/styles/limitsInsightsShared.css';
const root=createRoot(document.getElementById('root'));
window.showHistory=(name='sample',plan='pro',state='normal')=>{
 const trades=state==='info-breach'?Array.from({length:3},(_,i)=>({id:'info-'+i,date:'2026-01-0'+(i+1),market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl:5,risk:100,riskStatus:'provided',setup:'Small wins',notes:'Exact note '+i,manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}})):name==='sample'?structuredClone(sampleTrades):name==='empty'?[]:sampleTrades.slice(0,6).map((t,i)=>({...t,id:name+i,setup:i<3?name:name+' second',notes:name+' note '+i}));
 if(state==='missing')trades.forEach(t=>{t.risk=0;t.riskStatus='missing';});
 const rules=defaultRules.map(r=>({...r,enabled:state==='disabled'?false:r.enabled}));
 const analysis=analyze(trades,rules);
 window.fixture={trades,analysis,held:JSON.stringify({trades,analysis})};
 root.render(<><InsightsView analysis={analysis} entitlements={{plan,insightLimit:plan==='free'?2:Infinity}} go={route=>window.destination=route} upgradeToPro={()=>window.upgraded=true}/>{state==='info-breach'&&<><div data-dashboard-brief><NextSessionBriefCard analysis={analysis} go={route=>window.destination=route}/></div><OaDisciplineReview analysis={analysis} go={route=>window.destination=route}/></>}</>);
};window.showHistory();`;
const result=await build({root,configFile:false,envDir:false,logLevel:'error',plugins:[{name:'isolated-insights-interaction',resolveId(value){if(value.endsWith('__insights_interaction_test__.tsx'))return id;},load(value){if(value===id)return entry;}},react()],define:{'process.env.NODE_ENV':'"production"'},build:{write:false,copyPublicDir:false,lib:{entry:id,formats:['es'],fileName:'probe',cssFileName:'probe'}}});
const files=new Map((Array.isArray(result)?result.flatMap(r=>r.output):result.output).map(o=>['/'+o.fileName,o.type==='chunk'?o.code:o.source]));
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${[...files.keys()].filter(k=>k.endsWith('.css')).map(k=>`<link rel="stylesheet" href="${k}">`).join('')}<style>body{margin:0;background:#0f0f0f;color:white}main{padding:24px}</style></head><body><main class="oa-dashboard-app"><div id="root"></div></main><script type="module" src="/probe.js"></script></body></html>`;
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={checks:[],errors:[],blockedRequests:[],fixtureOnly:true};
const check=(name,condition)=>{assert.ok(condition,name);report.checks.push(name);};
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());const body=u.origin==='http://insights.test'?(u.pathname==='/'?html:files.get(u.pathname)):undefined;
  if(body===undefined){report.blockedRequests.push(u.href);return route.abort();}
  return route.fulfill({body,contentType:u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'text/html'});
 });
 await context.addInitScript(()=>{
  localStorage.setItem('insights-test-sentinel','unchanged');window.storageWrites=[];
  for(const method of ['setItem','removeItem','clear']){
   const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.storageWrites.push([method,...args]);return original.apply(this,args);};
  }
 });
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://insights.test/');await page.locator('[data-trade-note]').waitFor();
 check('desktop shows comparison and actual notes together',await page.locator('[data-insight="setups"]').isVisible()&&await page.locator('#ip-setup-evidence').isVisible());
 const selected=page.locator('[data-open-setup="Breakout continuation"]');await selected.focus();await page.keyboard.press('Enter');
 check('keyboard selects the full setup control',await selected.getAttribute('aria-pressed')==='true');
 const exact=await page.evaluate(()=>window.fixture.trades.filter(t=>t.setup==='Breakout continuation')[1].notes);
 await page.locator('.ip-trade').nth(1).click();
 check('selected stored note is verbatim',await page.locator('[data-trade-note]').innerText()===exact);
 await page.getByRole('button',{name:'Try a reflection',exact:true}).click();
 check('reflection expands a question rather than an editor',await page.locator('#ip-reflection').isVisible()&&await page.locator('textarea,input,[contenteditable="true"]').count()===0);
 check('reflection does not change stored note',await page.locator('[data-trade-note]').innerText()===exact);
 check('selection/reflection preserve input analysis and storage',await page.evaluate(()=>window.storageWrites.length===0&&JSON.stringify({trades:window.fixture.trades,analysis:window.fixture.analysis})===window.fixture.held));
 await page.getByRole('button',{name:'Open journal',exact:true}).click();check('journal navigation remains Risk Desk',await page.evaluate(()=>window.destination==='dashboard'));
 await page.getByRole('button',{name:'What’s tripping me up?',exact:true}).click();
 check('Pro shows finding and current status summary',await page.locator('[data-insight="finding"]').isVisible()&&await page.locator('[data-insight="status"]').isVisible());
 await page.locator('[data-limit-evidence] summary').click();
 const statuses=await page.evaluate(()=>window.fixture.analysis.ruleStatuses.filter(s=>s.rule.enabled).map(s=>({id:s.rule.id,summary:s.summary,evaluated:s.evaluated,breached:s.breached})));
 for(const status of statuses){
  const block=page.locator(`[data-rule-evidence="${status.id}"]`);
  check(`${status.id}: actual summary and evaluation state`,(await block.innerText()).includes(status.summary)&&(await block.innerText()).includes(!status.evaluated?'Not evaluated':status.breached?'Breached':'Inside limit'));
 }
 await page.evaluate(()=>window.showHistory('sample','free'));await page.locator('[data-insights-locked]').waitFor();
 check('Free gates the Pro summary, not the finding',await page.locator('[data-insight="status"]').count()===0&&await page.locator('[data-insight="finding"]').isVisible());
 await page.getByRole('button',{name:'Unlock Pro',exact:true}).click();check('upgrade action calls the real supplied callback',await page.evaluate(()=>window.upgraded===true));
 await page.getByRole('button',{name:'What’s working?',exact:true}).click();check('Free retains setup comparison',await page.locator('[data-insight="setups"]').isVisible());
 await page.evaluate(()=>window.showHistory('sample','free','missing'));await page.locator('[data-planned-risk-coverage]').waitFor();
 check('missing planned risk renders no invented R marks',await page.locator('[data-r-bar]').count()===0);
 await page.evaluate(()=>window.showHistory('sample','free','disabled'));await page.locator('[data-rules-unchecked]').waitFor();
 check('disabled rules explicitly remain unchecked',(await page.locator('[data-rules-unchecked]').innerText()).includes('have not been checked'));
 await page.evaluate(()=>window.showHistory('A'));await page.locator('[data-open-setup="A"]').waitFor();await page.locator('[data-open-setup="A"]').click();
 await page.evaluate(()=>window.showHistory('B'));await page.waitForFunction(()=>document.querySelector('[data-trade-note]')?.textContent.startsWith('B note '));
 check('account/history update resolves stale setup and trade selections',await page.locator('[data-open-setup][aria-pressed="true"]').count()===1);
 await page.locator('.ip-note-filters select').selectOption({label:'All setups'});await page.evaluate(()=>window.showHistory('C'));await page.waitForFunction(()=>document.querySelector('[data-trade-note]')?.textContent.startsWith('C note '));
 check('explicit All setups survives a history update',await page.locator('.ip-trade').count()===6&&await page.locator('.ip-note-filters select').evaluate(e=>e.selectedOptions[0].textContent==='All setups'));
 // A fresh mount starts auto-selection, then receives empty and populated props.
 await page.reload();await page.locator('[data-trade-note]').waitFor();await page.evaluate(()=>window.showHistory('empty'));await page.locator('[data-insights-empty]').waitFor();
 check('empty history has import, no invented comparison',await page.getByRole('button',{name:'Import trades',exact:true}).isVisible()&&await page.locator('[data-open-setup]').count()===0);
 await page.getByRole('button',{name:'Import trades',exact:true}).click();check('empty action goes to imports',await page.evaluate(()=>window.destination==='import'));
 await page.evaluate(()=>window.showHistory('D'));await page.locator('[data-trade-note]').waitFor();
 check('empty-to-populated update chooses a current leading setup',await page.locator('[data-open-setup][aria-pressed="true"]').count()===1&&(await page.locator('[data-trade-note]').innerText()).startsWith('D note '));
 check('analysis and actual journal input remain read-only',await page.evaluate(()=>JSON.stringify({trades:window.fixture.trades,analysis:window.fixture.analysis})===window.fixture.held));
 check('no persistent writes or deletion',await page.evaluate(()=>window.storageWrites.length===0&&localStorage.getItem('insights-test-sentinel')==='unchanged'));
 await page.getByRole('button',{name:'Share Risk Passport',exact:true}).click();check('sharing goes to Passport',await page.evaluate(()=>window.destination==='passport'));
 await page.evaluate(()=>window.showHistory('Small wins','pro','info-breach'));
 await page.getByRole('button',{name:'What’s tripping me up?',exact:true}).click();
 check('informational breach fixture retains actual ready model semantics',await page.evaluate(()=>{const a=window.fixture.analysis,s=a.ruleStatuses.find(s=>s.rule.metric==='minAvgR');return a.tradeCount===3&&Math.abs(a.avgR-.05)<1e-10&&s.rule.enabled&&s.rule.limit===.1&&s.rule.severity==='info'&&s.evaluated&&s.breached&&a.nextSessionBrief.status==='ready';}));
 await page.getByRole('button',{name:'Review details',exact:true}).click();await page.locator('[data-discipline-details]').waitFor();
 report.readyLabels={insights:await page.locator('[data-insight="status"] > .li-muted').innerText(),dashboard:await page.locator('[data-dashboard-brief] .inline-flex').first().innerText(),discipline:await page.locator('.oa-next-review > span').innerText()};
 check('all three ready displays are neutral, never an all-limits-passed claim: '+JSON.stringify(report.readyLabels),Object.values(report.readyLabels).every(label=>label==='Summary ready'));
 check('ready display correction leaves model and trade inputs unchanged',await page.evaluate(()=>JSON.stringify({trades:window.fixture.trades,analysis:window.fixture.analysis})===window.fixture.held));
 await page.getByRole('button',{name:'Close review details',exact:true}).click();
 check('no runtime errors',report.errors.length===0);check('no unexpected external requests',report.blockedRequests.length===0);
 await context.close();report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;process.exitCode=1;}finally{await browser.close();if(process.env.INSIGHTS_INTERACTION_REPORT)writeFileSync(process.env.INSIGHTS_INTERACTION_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
