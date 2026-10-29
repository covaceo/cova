// Self-contained production-component browser regression. No server, account, or network required.
// Run from the repository: node scripts/insights-mobile-character-regression.mjs
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/');
const entryId=root+'__insights_mobile_test__.tsx';
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {InsightsView} from '${root}src/components/InsightsView.tsx';
import {analyze,sampleTrades,defaultRules} from '${root}src/lib/risk.ts';
import '${root}src/styles/limitsInsightsShared.css';
const root=createRoot(document.getElementById('root'));
window.renderModel=(analysis,plan='pro')=>{
 window.currentTrades=analysis.trades;window.currentAnalysis=analysis;
 root.render(<InsightsView analysis={analysis} entitlements={{plan,insightLimit:plan==='free'?2:Infinity}} go={route=>window.destination=route} upgradeToPro={()=>window.upgraded=true}/>);
};
window.showHistory=(name='sample',plan='pro')=>{
 let trades=name==='sample'?sampleTrades:name==='empty'?[]:sampleTrades.slice(0,6).map((t,i)=>({...t,id:name+i,setup:i<3?name:name+' second',notes:name+' note '+i}));
 window.renderModel(analyze(trades,defaultRules),plan);
};
window.showNamedSetups=names=>window.renderModel(analyze(names.flatMap((setup,s)=>Array.from({length:3},(_,i)=>({...sampleTrades[0],id:'named-'+s+'-'+i,setup,notes:JSON.stringify(setup)+' exact note '+i,pnl:100,risk:100,riskStatus:'provided'}))),defaultRules));
window.showHistory();`;
const bundle=await build({root,configFile:false,envDir:false,logLevel:'error',plugins:[{name:'isolated-component-test',resolveId(id){if(id.endsWith('__insights_mobile_test__.tsx'))return entryId;},load(id){if(id===entryId)return entry;}},react()],define:{'process.env.NODE_ENV':'"production"'},build:{write:false,copyPublicDir:false,lib:{entry:entryId,formats:['es'],fileName:'probe',cssFileName:'probe'}}});
const outputs=new Map((Array.isArray(bundle)?bundle.flatMap(b=>b.output):bundle.output).map(o=>['/'+o.fileName,o.type==='chunk'?o.code:o.source]));
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#0f0f0f;color:white}main{padding:16px;min-height:1600px}*{box-sizing:border-box}</style>${[...outputs.keys()].filter(k=>k.endsWith('.css')).map(k=>`<link rel="stylesheet" href="${k}">`).join('')}</head><body><main class="oa-dashboard-app"><div id="root"></div></main><script type="module" src="/probe.js"></script></body></html>`;
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={fixtureOnly:true,checks:[],errors:[]};
const check=(name,value)=>{assert.ok(value,name);report.checks.push(name);};
async function open(width){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:width<=600,hasTouch:width<=600,deviceScaleFactor:1,reducedMotion:'reduce'});
 await context.route('**/*',route=>{const url=new URL(route.request().url()),body=url.pathname==='/'?html:outputs.get(url.pathname);return body===undefined?route.abort():route.fulfill({body,contentType:url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html'});});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://insights.test/');await page.locator('[data-open-setup]').first().waitFor();await page.evaluate(()=>document.fonts.ready);return{page,context};
}
try{
 const {page,context}=await open(390);
 check('phone begins with comparison, not stacked notes',!await page.locator('#ip-setup-evidence').isVisible());
 const target=page.locator('[data-open-setup="Breakout continuation"]');await target.scrollIntoViewIfNeeded();const y=await page.evaluate(()=>scrollY);await target.tap();
 check('selection opens deliberate detail',await page.locator('#ip-setup-evidence').isVisible()&&!await page.locator('[data-insight="setups"]').isVisible());
 check('detail has Back to setups',await page.getByRole('button',{name:'Back to setups',exact:true}).isVisible());
 check('focus moves to note heading',await page.locator('#ip-setup-evidence h2').evaluate(e=>document.activeElement===e));
 check('phone has compact record picker',await page.locator('.ip-record-toggle').isVisible());
 check('record list starts collapsed',!await page.locator('.ip-trades').isVisible());
 await page.locator('.ip-record-toggle').tap();
 check('record picker expands all matching trades',await page.locator('.ip-trades').isVisible()&&await page.locator('.ip-trade').count()===6);
 await page.locator('.ip-trade').nth(1).tap();
 check('choosing record closes picker',!await page.locator('.ip-trades').isVisible());
 check('record picker receives focus after selection',await page.locator('.ip-record-toggle').evaluate(e=>document.activeElement===e));
 check('selected note remains exact',await page.locator('[data-trade-note]').innerText()===await page.evaluate(()=>window.currentTrades.filter(t=>t.setup==='Breakout continuation')[1].notes));
 await page.getByRole('button',{name:'Back to setups',exact:true}).tap();
 check('Back restores comparison',await page.locator('[data-insight="setups"]').isVisible()&&!await page.locator('#ip-setup-evidence').isVisible());
 check('Back restores scroll',Math.abs(await page.evaluate(()=>scrollY)-y)<2);
 check('Back restores selected opener focus',await target.evaluate(e=>document.activeElement===e));
 await page.setViewportSize({width:768,height:844});
 check('desktop never displays phone Back',!await page.getByRole('button',{name:'Back to setups',exact:true}).isVisible());
 check('desktop retains simultaneous comparison and notes',await page.locator('[data-insight="setups"]').isVisible()&&await page.locator('#ip-setup-evidence').isVisible());
 await page.locator('.ip-trade').nth(1).focus();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(50);
 check('shrinking viewport keeps focused evidence accessible',await page.locator('#ip-setup-evidence').isVisible()&&await page.locator('.ip-trades').isVisible());
 check('shrinking viewport restores the same focused record',await page.locator('.ip-trade').nth(1).evaluate(e=>document.activeElement===e));
 await page.locator('.ip-trade').nth(1).press('Enter');
 await page.setViewportSize({width:768,height:844});await page.waitForTimeout(50);
 check('expanding viewport transfers focus from phone picker to selected record',await page.locator('.ip-trade[aria-pressed="true"]').evaluate(e=>document.activeElement===e));
 await target.focus();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(50);
 check('phone detail to desktop comparison to phone resolves comparison pane',await page.locator('[data-insight="setups"]').isVisible()&&!await page.locator('#ip-setup-evidence').isVisible());
 check('resize round trip preserves visible comparison keyboard focus',await target.evaluate(e=>document.activeElement===e)&&await target.isVisible());
 await page.keyboard.press('Enter');
 check('round-trip focused comparison still opens detail with keyboard',await page.locator('#ip-setup-evidence').isVisible()&&await page.locator('#ip-setup-evidence h2').evaluate(e=>document.activeElement===e));
 await page.getByRole('button',{name:'Back to setups',exact:true}).click();
 check('round-trip Back returns visible comparison focus',await target.evaluate(e=>document.activeElement===e)&&await target.isVisible());
 await context.close();
 for(const width of [320,360,390,430,600,768,1440]){
  const {page:p,context:c}=await open(width),phone=width<=600;
  const click=locator=>phone?locator.tap():locator.click();
  const fits=async label=>{
   const actual=await p.evaluate(()=>({width:innerWidth,visual:visualViewport.width,scroll:document.documentElement.scrollWidth,small:[...document.querySelectorAll('.insights-preview button,.insights-preview select,.insights-preview summary')].filter(e=>e.getClientRects().length&&(e.getBoundingClientRect().height<44||e.getBoundingClientRect().width<44)).map(e=>e.textContent)}));
   check(`${width} ${label} viewport and overflow`,actual.width===width&&actual.visual===width&&actual.scroll<=width);
   if(phone)check(`${width} ${label} actual touch targets`,!actual.small.length);
  };
  await fits('comparison');
  check(width+' full question labels',JSON.stringify(await p.locator('.ip-question').allTextContents())===JSON.stringify(['What’s working?','What’s tripping me up?','Why did I take that?']));
  if(phone)check(width+' comparison only',!await p.locator('#ip-setup-evidence').isVisible());
  else check(width+' desktop has no mobile controls',!await p.locator('.ip-back-setups').isVisible()&&!await p.locator('.ip-record-toggle').isVisible());
  for(const name of await p.locator('[data-open-setup]').evaluateAll(es=>es.map(e=>e.dataset.openSetup))){
   const choice=p.locator('[data-open-setup]').filter({has:p.locator('strong',{hasText:name})});await click(choice);
   const expected=await p.evaluate(name=>window.currentTrades.filter(t=>t.setup===name),name);
   check(width+' actual note for '+name,await p.locator('[data-trade-note]').innerText()===expected[0].notes);
   if(phone)await click(p.locator('.ip-record-toggle'));
   check(width+' every record for '+name,await p.locator('.ip-trade').count()===expected.length);
   await click(p.locator('.ip-trade').last());
   check(width+' last actual note for '+name,await p.locator('[data-trade-note]').innerText()===expected.at(-1).notes);
   await fits('detail '+name);
   if(phone)await click(p.getByRole('button',{name:'Back to setups',exact:true}));
  }
  // Keyboard-only path, including the formerly hidden picker list.
  const choice=p.locator('[data-open-setup]').first();await choice.focus();await p.keyboard.press('Enter');
  if(phone){await p.locator('.ip-record-toggle').focus();await p.keyboard.press('Enter');await p.keyboard.press('Tab');check(width+' keyboard enters record list',await p.locator('.ip-trade').first().evaluate(e=>document.activeElement===e));await p.keyboard.press('Enter');check(width+' keyboard returns to picker',await p.locator('.ip-record-toggle').evaluate(e=>document.activeElement===e));await p.keyboard.press('Tab');check(width+' collapsed records skipped by Tab',await p.getByRole('button',{name:'Try a reflection',exact:true}).evaluate(e=>document.activeElement===e));}
  await click(p.getByRole('button',{name:'Try a reflection',exact:true}));
  check(width+' reflection is prompt only',await p.locator('.ip-reflection').isVisible()&&await p.locator('.ip-reflection input,.ip-reflection textarea').count()===0);
  await click(p.getByRole('button',{name:'Open journal',exact:true}));check(width+' journal navigates dashboard',await p.evaluate(()=>window.destination)==='dashboard');
  check(width+' reduced-motion computed transitions',await p.locator('.ip-note > button').evaluate(e=>getComputedStyle(e).transitionDuration.split(',').every(t=>parseFloat(t)===0)));
  await click(p.getByRole('button',{name:'What’s tripping me up?',exact:true}));
  check(width+' Pro status available',await p.locator('[data-insight="status"]').isVisible());await p.locator('[data-limit-evidence] summary').focus();await p.keyboard.press('Enter');
  check(width+' native keyboard disclosure opens',await p.locator('[data-limit-evidence]').evaluate(e=>e.open));
  check(width+' all enabled limits retained',await p.locator('[data-rule-evidence]').count()===await p.evaluate(()=>window.currentAnalysis.ruleStatuses.filter(s=>s.rule.enabled).length));
  await fits('tripping');
  await click(p.getByRole('button',{name:'Why did I take that?',exact:true}));await p.locator('.ip-note-filters select').selectOption({label:'All setups'});
  check(width+' All exposes every record',await p.locator('.ip-trade').count()===await p.evaluate(()=>window.currentTrades.length));
  await p.evaluate(()=>{window.originalHeading=document.querySelector('#ip-title');window.showHistory('A');});await p.waitForFunction(()=>document.querySelector('[data-trade-note]')?.textContent.startsWith('A note'));
  check(width+' mounted account update keeps explicit All',await p.locator('.ip-note-filters select').evaluate(e=>e.selectedOptions[0].textContent==='All setups')&&await p.locator('.ip-trade').count()===6);
  check(width+' history updates same mounted component',await p.evaluate(()=>window.originalHeading===document.querySelector('#ip-title')));
  await p.locator('.ip-note-filters select').selectOption({label:'A second'});
  await p.evaluate(()=>window.showHistory('B'));await p.waitForFunction(()=>document.querySelector('[data-trade-note]')?.textContent.startsWith('B note'));
  check(width+' stale setup resolves to current history',await p.locator('.ip-note-filters select').evaluate(e=>e.selectedOptions[0].textContent!=='A second')&&await p.locator('.ip-trade').count()===3);
  await p.evaluate(()=>window.showHistory('empty'));await p.locator('[data-insights-empty]').waitFor();
  await p.evaluate(()=>window.showHistory('C'));await p.locator('[data-trade-note]').waitFor();
  check(width+' empty-to-populated actual note',/^C note /.test(await p.locator('[data-trade-note]').innerText()));
  await p.evaluate(()=>window.showHistory('sample','free'));await click(p.getByRole('button',{name:'What’s tripping me up?',exact:true}));
  check(width+' Free status gated with upgrade',await p.locator('[data-insight="status"]').count()===0&&await p.locator('[data-insights-locked]').isVisible());
  await click(p.getByRole('button',{name:'Unlock Pro',exact:true}));check(width+' Free upgrade action preserved',await p.evaluate(()=>window.upgraded)===true);
  await c.close();
 }
 for(const width of [390,1440]){
  const {page:p,context:c}=await open(width);
  const names=['__all','','Range "A" & <B> / 50% 雪','null','all'];
  await p.evaluate(names=>window.showNamedSetups(names),names);
  await p.getByRole('button',{name:'Why did I take that?',exact:true}).click();
  const select=p.locator('.ip-note-filters select');
  for(const name of names){
   await select.selectOption({label:name||'Untagged'});
   check(width+' setup name filters its exact three records '+JSON.stringify(name),await p.locator('.ip-trade').count()===3&&await p.locator('[data-trade-note]').innerText()===JSON.stringify(name)+' exact note 0');
   check(width+' setup option stays selected '+JSON.stringify(name),await select.evaluate((e,label)=>e.selectedOptions[0].textContent===label,name||'Untagged'));
  }
  const identities=await select.locator('option').evaluateAll(es=>es.map(e=>e.value));
  check(width+' all setup option identities are distinct from All',new Set(identities).size===names.length+1&&identities.length===names.length+1);
  await select.selectOption({label:'All setups'});
  check(width+' All still exposes every named record',await p.locator('.ip-trade').count()===names.length*3);
  await p.evaluate(names=>window.showNamedSetups([...names].reverse()),names);
  check(width+' All identity survives reordered setup options',await select.evaluate(e=>e.selectedOptions[0].textContent==='All setups')&&await p.locator('.ip-trade').count()===names.length*3);
  await select.selectOption({label:'__all'});
  await p.evaluate(names=>window.showNamedSetups(names),names);
  check(width+' reserved-looking user setup survives reordered options',await select.evaluate(e=>e.selectedOptions[0].textContent==='__all')&&await p.locator('.ip-trade').count()===3);
  await c.close();
 }
 for(const width of [320,600]){
  const {page:p,context:c}=await open(width);
  await p.evaluate(()=>window.showNamedSetups(['Selected','Two','Three','Four','Five','Six']));
  const opener=p.locator('[data-open-setup="Selected"]');await opener.click();
  await p.evaluate(()=>{window.savedHeading=document.querySelector('#ip-title');window.showNamedSetups(['Two','Three','Four','Five','Six','Selected']);});
  await p.waitForFunction(()=>document.querySelector('[data-more-setups] [data-open-setup="Selected"]'));
  check(width+' account update moves selected setup into closed disclosure without remount',await p.locator('[data-more-setups]').evaluate(e=>!e.open)&&await p.evaluate(()=>window.savedHeading===document.querySelector('#ip-title'))&&await p.locator('[data-trade-note]').innerText()==='"Selected" exact note 0');
  await p.getByRole('button',{name:'Back to setups',exact:true}).click();
  check(width+' Back opens the closed disclosure containing current selection',await p.locator('[data-more-setups]').evaluate(e=>e.open));
  check(width+' Back fallback focuses visible selected setup in viewport',await opener.isVisible()&&await opener.evaluate(e=>{const r=e.getBoundingClientRect();return document.activeElement===e&&r.bottom>0&&r.top<innerHeight;}));
  await p.keyboard.press('Enter');
  check(width+' Back fallback remains keyboard-operable',await p.locator('#ip-setup-evidence').isVisible());
  await p.locator('.ip-note-filters select').selectOption({label:'All setups'});
  await p.evaluate(()=>window.showHistory('Replacement'));await p.waitForFunction(()=>document.querySelector('[data-trade-note]')?.textContent.startsWith('Replacement note'));
  await p.getByRole('button',{name:'Back to setups',exact:true}).click();
  check(width+' Back with All and detached opener uses visible current comparison control',await p.locator('[data-open-setup]').first().evaluate(e=>document.activeElement===e)&&await p.locator('[data-open-setup]').first().isVisible());
  await c.close();
 }
 // Direct model edge values never acquire invented bars or invalid financial strings.
 for(const width of [320,600,1440]){
  const{page:p,context:c}=await open(width),phone=width<=600;
  await p.evaluate(()=>{
   const a=window.currentAnalysis,template=a.bySetup[0],trade=a.trades[0];
   const defs=[['Tie A',2,3],['Tie B',2,3],['Zero',0,3],['Negative',-1,3],['Extreme',-5,3],['Missing',null,3],['Sparse',1,2],['Nonfinite',Infinity,3],['NaN',NaN,3]];
   const bySetup=defs.map(([name,avgR,riskCount])=>({...template,name,avgR,riskCount,count:3,pnl:name==='Nonfinite'?NaN:avgR===null?300:0,winRate:name==='Nonfinite'?Infinity:0}));
   const trades=bySetup.flatMap(s=>Array.from({length:3},(_,i)=>({...trade,id:s.name+i,setup:s.name,notes:s.name==='Tie A'?'':s.name+' exact note '+i,risk:s.name==='Missing'?null:100,riskStatus:s.name==='Missing'?'missing':'provided'})));
   window.renderModel({...a,bySetup,trades,tradeCount:trades.length,missingRiskCount:3,riskCount:trades.length-3,legacyRiskCount:3});
  });
  await p.locator('[data-open-setup="Tie A"]').waitFor();
  check(width+' ties remain truthful',(await p.locator('.ip-setup-finding').innerText()).includes('joint-highest'));
  check(width+' zero is a zero-width bar',await p.locator('[data-r-bar="0"]').evaluate(e=>e.getBoundingClientRect().width)===0);
  const scale=await p.locator('[data-r-bar="2"]').first().evaluate(e=>e.getBoundingClientRect().width/e.parentElement.getBoundingClientRect().width);
  check(width+' signed scale includes undisclosed extreme',Math.abs(scale-.2)<.005);
  await p.locator('[data-more-setups] summary').click();
  check(width+' all edge setups accessible',await p.locator('[data-open-setup]:visible').count()===9);
  for(const name of ['Missing','Sparse','Nonfinite','NaN'])check(width+' no invented R '+name,await p.locator(`[data-open-setup="${name}"] [data-r-bar]`).count()===0);
  check(width+' invalid money and rate unavailable',!(await p.locator('[data-open-setup="Nonfinite"]').innerText()).includes('NaN')&&!(await p.locator('[data-open-setup="Nonfinite"]').innerText()).includes('Infinity'));
  await p.locator('[data-setup-method] summary').click();check(width+' coverage caveats retained in calculation disclosure',await p.locator('[data-planned-risk-coverage]').isVisible()&&await p.locator('[data-legacy-risk-caveat]').isVisible());
  await p.locator('[data-open-setup="Tie A"]').click();check(width+' missing note honest',await p.locator('[data-trade-note]').innerText()==='No note on this trade.');
  if(phone)await p.getByRole('button',{name:'Back to setups',exact:true}).click();
  await p.locator('[data-open-setup="Missing"]').click();await p.locator('[data-trade-details] summary').click();check(width+' null planned risk honest',(await p.locator('[data-trade-details]').innerText()).includes('Planned risk: not provided'));
  // Change accounts while detail is mounted; Back must not target a detached old setup.
  await p.evaluate(()=>window.showHistory('New account'));await p.waitForFunction(()=>document.querySelector('[data-trade-note]')?.textContent.startsWith('New account note'));
  if(phone){await p.getByRole('button',{name:'Back to setups',exact:true}).click();check(width+' stale opener falls back to current selected setup',await p.locator('[data-open-setup][aria-pressed="true"]').evaluate(e=>document.activeElement===e));}
  await c.close();
 }
 check('no runtime errors',report.errors.length===0);report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;process.exitCode=1;}finally{await browser.close();if(process.env.INSIGHTS_MOBILE_REPORT)writeFileSync(process.env.INSIGHTS_MOBILE_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
