// Real Limits/Insights components with synthetic history only. No broker or auth requests.
import assert from 'node:assert/strict';
import loadSource from './helpers/load-ts.cjs';
const {analyze}=loadSource('src/lib/risk.ts');
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
const output=process.env.REVIEW_EVIDENCE||join(tmpdir(),'cova-limits-insights');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'cova-review-'));
const styles=[...(await readFile('src/main.tsx','utf8')).matchAll(/import "([^"]+)";/g)].map(m=>m[1]).filter(n=>n.startsWith('@fontsource')||n.endsWith('.css')).map(n=>`import '${n.startsWith('./')?'/src/'+n.slice(2):n}';`).join('\n');
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {RulesEngine,Coach} from '/src/components/WorkspaceSections.tsx';import {Dashboard} from '/src/components/DashboardView.tsx';import {WorkspaceShell} from '/src/components/WorkspaceShell.tsx';import {TradeAccountSelect} from '/src/components/TradeAccountSelect.tsx';import {analyze,defaultRules,sampleTrades} from '/src/lib/risk.ts';${styles}
localStorage.setItem('cova-active-storage-identity-v1','review-owner');
const query=new URLSearchParams(location.search),pro=query.get('plan')!=='free';
function Preview(){const [section,setSection]=useState(query.get('route')||'rules');const [rules,saveRules]=useState(defaultRules);const [account,setAccount]=useState('local');const trades=query.has('empty')||account!=='local'?[]:sampleTrades;const analysis=analyze(trades,rules);window.__reviewRules=rules;window.__reviewTrades=JSON.stringify(trades);window.__reviewAnalysis={breaches:analysis.breaches.length,compliance:analysis.compliance};const entitlements={canEditAdvancedLimits:pro,canExportPassport:pro,insightLimit:pro?3:1,plan:pro?'pro':'free'};const go=route=>{window.__reviewRoute=route;if(['dashboard','rules','coach'].includes(route))setSection(route);};const upgradeToPro=()=>window.__upgrades=(window.__upgrades||0)+1;const accountControl=<div data-account-switcher><TradeAccountSelect owner="review-owner" accounts={['local','Tradovate:visual-empty']} value={account} onChange={setAccount}/></div>;return <div className="oa-dashboard-app"><WorkspaceShell section={section} brokerLabel="Imported history" email="review@example.test" riskScore={analysis.score} go={go} deleteAccount={()=>{}} signOut={()=>{}}>{section==='rules'&&<RulesEngine analysis={analysis} entitlements={entitlements} rules={rules} setRules={saveRules} go={go} upgradeToPro={upgradeToPro} accountControl={accountControl}/ >}{section==='coach'&&<Coach analysis={analysis} entitlements={entitlements} go={go} upgradeToPro={upgradeToPro} accountControl={accountControl}/ >}{section==='dashboard'&&<Dashboard analysis={analysis} rules={rules} go={go} journalReview={false} accountControl={accountControl}/>}</WorkspaceShell></div>};createRoot(document.getElementById('root')).render(<Preview/>);`;
let server,chrome,ws;const errors=[],receipts=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 server=await createServer({envDir:profile,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'net-curve-fixture',resolveId(id){if(id==='/__curve.tsx')return id;},load(id){if(id==='/__curve.tsx')return entry;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url.split('?')[0]!=='/__curve.html')return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/__curve.tsx"></script></body></html>'));});}}]});
 await server.listen();const port=server.httpServer.address().port;
 assert.equal((await fetch(`http://127.0.0.1:${port}/__curve.html`)).status,200);
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
 let debugPort;for(let i=0;i<100;i++){try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{}await sleep(100);}assert(debugPort);
 const tabs=await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 let sequence=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id){const cb=pending.get(m.id);pending.delete(m.id);if(m.error)cb.reject(Error(m.error.message));else cb.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown'||m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value;};
 const wait=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(50);}throw Error('Timeout: '+expression);};
 const key=async(key,code)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});};
 const capture=async(name)=>{await writeFile(join(output,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));};
 await send('Runtime.enable');await send('Page.enable');
 const open=async(route,params='')=>{await send('Page.navigate',{url:`http://127.0.0.1:${port}/__curve.html?route=${route}${params}`});await wait(`Boolean(document.querySelector('[data-workspace-section="${route}"] ${route==='dashboard'?'.astra-panel':'.oa-review-header h1'}')) && document.fonts.status==='loaded'`);await sleep(220);};
 const material=selector=>evaluate(`(()=>{const s=getComputedStyle(document.querySelector(${JSON.stringify(selector)}));return {background:s.backgroundColor,border:s.borderTopColor,radius:s.borderRadius};})()`);
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 for(const [name,width,height,mobile] of [['desktop',1672,941,false],['laptop',1280,720,false],['tablet',1024,768,false],['edge',851,800,false],['phone',390,844,true],['small-phone',360,800,true]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:mobile?5:1});
  await open('dashboard');
  for(const route of ['rules','coach']){
   await open(route);
   await capture(name+'-'+route);
   if(process.env.REVIEW_BASELINE)continue;
   assert.deepEqual(await evaluate('[innerWidth,document.documentElement.clientWidth,Math.round(visualViewport.width)]'),[width,width,width]);
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,name+' root overflow');
   for(const selector of route==='rules'?['.oa-limit-group .oa-review-plate']:['.oa-insight-primary']){
    const panel=await material(selector);assert.match(panel.background,/^rgba\(237, 237, 237, 0\.04\d*\)$/);assert.equal(panel.radius,width<=620?'22px':'26px');
   }
   assert.equal(await evaluate(`document.querySelectorAll('.oa-review-header [data-account-switcher]').length`),1,'One existing account control in the approved header');
   assert.equal(await evaluate(`getComputedStyle(document.querySelector('.oa-review-page h1')).fontWeight`),'500');
   assert.equal(await evaluate(`document.querySelector('.oa-review-page').getBoundingClientRect().width<=1020`),true);
   assert.deepEqual(await evaluate(`['.oa-review-plate','.oa-limit-row','.oa-insight-secondary'].flatMap(s=>[...document.querySelectorAll(s)]).filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.className)`),[],name+' local overflow');
   assert.equal(await evaluate(`[...document.querySelectorAll('.oa-review-page p')].every(e=>getComputedStyle(e).fontFamily.includes('Inter Tight Variable'))`),true,'Same body typography as Risk Desk');
   await wait(`[...document.images].filter(i=>i.checkVisibility()).every(i=>i.complete)`);assert.equal(await evaluate(`[...document.images].filter(i=>i.checkVisibility()&&!i.naturalWidth).length`),0);
   if(route==='rules'){
    const snapshot=await evaluate('window.__reviewTrades');
    assert.equal(await evaluate(`document.querySelectorAll('.oa-limit-row').length`),6);
    await click('.oa-limit-row [role=switch]');await wait(`document.querySelector('.oa-limit-row [role=switch]').getAttribute('aria-checked')==='false'`);assert.match(await evaluate(`document.querySelector('.oa-limit-row').innerText`),/Not checked/);
    await click('.oa-limit-row [role=switch]');await wait(`window.__reviewRules[0].enabled`);
    await click('.oa-limit-adjust summary');await wait(`document.querySelector('.oa-limit-adjust').open`);await evaluate(`document.querySelector('.oa-limit-row input[type=range]').focus()`);await key('ArrowRight',39);await wait(`window.__reviewRules[0].limit===2550`);
    assert.equal(await evaluate(`document.querySelector('.oa-limit-row input[type=number]').value`),'2550');
    await evaluate(`(()=>{const e=document.querySelector('.oa-limit-row input[type=number]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'3000');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(`window.__reviewRules[0].limit===3000`);
    assert.equal(await evaluate('window.__reviewTrades'),snapshot,'Thresholds never rewrite trade history');
    if(mobile)assert.ok(await evaluate(`document.querySelector('.oa-limit-row [role=switch]').getBoundingClientRect().height>=44`),'Phone switch touch target');
    await evaluate(`(()=>{const e=document.querySelector('[data-account-switcher] select');e.value='Tradovate:visual-empty';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(`window.__reviewTrades==='[]'`);assert.equal(await evaluate('window.__reviewAnalysis.breaches'),analyze([],await evaluate('window.__reviewRules')).breaches.length);
    await evaluate(`(()=>{const e=document.querySelector('[data-account-switcher] select');e.value='local';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(`window.__reviewTrades!=='[]'`);assert.equal(await evaluate('window.__reviewTrades'),snapshot,'Account selection keeps histories separate');
    await evaluate(`document.querySelector('.oa-limit-row input[type=range]').focus()`);await key('Tab',9);assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`),'solid','Visible keyboard focus');
    await click('.oa-advanced-limits>summary');await wait(`document.querySelector('.oa-advanced-limits').open`);await evaluate(`document.querySelector('.oa-advanced-limits .oa-limit-row:last-child').scrollIntoView({behavior:'instant',block:'center'})`);await capture(name+'-last-rule');
   }else{
    assert.equal(await evaluate(`document.querySelectorAll('.oa-insight-feed>article').length`),3);
    await evaluate(`document.querySelector('.insight-evidence summary').focus()`);assert.equal(await evaluate(`document.activeElement===document.querySelector('.insight-evidence summary')`),true,'Summary receives keyboard focus');await key('Enter',13);await wait(`document.querySelector('.insight-evidence').open`);
    assert.equal(await evaluate(`document.querySelector('.insight-evidence p').checkVisibility()`),true);
    await capture(name+'-evidence');await key('Enter',13);await wait(`!document.querySelector('.insight-evidence').open`);
    const reviewButton=await evaluate(`[...document.querySelectorAll('.oa-insight-primary button')].find(b=>b.textContent.includes('Review active limits'))!==undefined`);
    if(reviewButton){await click('.oa-insight-primary button');await wait(`window.__reviewRoute==='rules'`);await open('coach');}
    await click('.oa-insight-footer button');assert.equal(await evaluate('window.__reviewRoute'),'passport');
   }
   receipts.push({name,route,width,height,materials:true,overflow:false,interactions:true});
  }
 }
 if(!process.env.REVIEW_BASELINE){
  for(const route of ['rules','coach'])for(const params of ['&plan=free','&empty=1']){
   await open(route,params);await capture(route+(params.includes('free')?'-free':'-empty'));
   if(route==='rules'&&params.includes('free')){
    await click('.oa-advanced-limits>summary');await wait(`document.querySelector('.oa-advanced-limits').open`);
    assert.equal(await evaluate(`document.querySelectorAll('.oa-limit-row input:disabled').length`),4);
    assert.equal(await evaluate(`document.querySelectorAll('.oa-limit-row button[role=switch]:disabled').length`),2);
    await evaluate(`[...document.querySelectorAll('.oa-limit-row button')].find(b=>b.textContent.includes('Pro to edit')).click()`);assert.equal(await evaluate('window.__upgrades'),1);
   }
   if(route==='coach'&&params.includes('free')){
    assert.equal(await evaluate(`document.querySelectorAll('.oa-insight-feed>article:not(.oa-insight-locked)').length`),1);
    await click('.oa-insight-locked button');assert.equal(await evaluate('window.__upgrades'),1);
   }
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  }
 }
 assert.deepEqual(errors,[]);await writeFile(join(output,'browser.json'),JSON.stringify({status:process.env.REVIEW_BASELINE?'baseline':'passed',receipts,errors},null,2));console.log(JSON.stringify({status:process.env.REVIEW_BASELINE?'baseline':'passed',receipts,output}));
} finally {if(ws)ws.close();if(chrome?.pid)try{execFileSync('taskkill.exe',['/PID',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});}
