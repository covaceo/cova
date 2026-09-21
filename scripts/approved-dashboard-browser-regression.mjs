// Real component/browser proof. Default data is synthetic; optional private points stay outside git.
import assert from 'node:assert/strict';
import loadSource from './helpers/load-ts.cjs';
import {checkDashboardFocusAlignment} from './helpers/dashboard-focus-alignment.mjs';
import {checkQuietDashboardPanels} from './helpers/dashboard-quiet-panels.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
const output=process.env.DASHBOARD_VISUAL_EVIDENCE||join(tmpdir(),'cova-approved-dashboard-browser');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'cova-approved-dashboard-'));
const fixture=process.env.DASHBOARD_VISUAL_FIXTURE?JSON.parse(await readFile(process.env.DASHBOARD_VISUAL_FIXTURE,'utf8')):null;
const {tradeAverages}=loadSource('src/lib/tradeAverages.ts');
const {moneyText}=loadSource('src/lib/journalAccuracy.ts');
const testTrades=fixture?.trades||loadSource('src/lib/risk.ts').sampleTrades;
function expectedAverages(range) {
 const latest=[...testTrades].sort((a,b)=>a.date.localeCompare(b.date)).at(-1).date;
 const cutoff=new Date(latest+'T00:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()-6);
 const selected=testTrades.filter(row=>range==='all'||(range==='today'?row.date===latest:row.date>=cutoff.toISOString().slice(0,10)));
 const result=tradeAverages(testTrades,selected);
 return [result.winnerCents,result.loserCents].map(value=>value===null?'—':`${value>0n?'+':''}${moneyText(value)}`);
}
const styles=[...(await readFile('src/main.tsx','utf8')).matchAll(/import "([^"]+)";/g)].map(m=>m[1]).filter(n=>n.startsWith('@fontsource')||n.endsWith('.css')).map(n=>`import '${n.startsWith('./')?'/src/'+n.slice(2):n}';`).join('\n');
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {Dashboard} from '/src/components/DashboardView.tsx';import {WorkspaceShell} from '/src/components/WorkspaceShell.tsx';import {TradeAccountSelect} from '/src/components/TradeAccountSelect.tsx';import {analyze,defaultRules,sampleTrades} from '/src/lib/risk.ts';import {saveBrokerCash} from '/src/lib/brokerCash.ts';import {rememberAccountNames} from '/src/lib/accountNames.ts';${styles}
const fixture=${JSON.stringify(fixture)};
localStorage.setItem('cova-active-storage-identity-v1','visual-owner');localStorage.setItem('cova-dashboard-range-v1','all');
const data=fixture?.trades||sampleTrades;const rules=fixture?.rules||defaultRules;
if(fixture?.cash){saveBrokerCash('visual-owner',fixture.cash.accountId,fixture.cash,data);rememberAccountNames('visual-owner',{['Tradovate:'+fixture.cash.accountId]:fixture.name});}
function Preview(){const [trades,setTrades]=useState(data);const analysis=analyze(trades,rules);const account=fixture?.cash?'Tradovate:'+fixture.cash.accountId:'local';const [selection,setSelection]=useState(account);const go=route=>window.__visualRoute=route;return <div className="oa-dashboard-app"><WorkspaceShell section="dashboard" brokerLabel={fixture?.cash?'Tradovate linked':'Imported history'} email="review@example.test" riskScore={analysis.score} go={go} deleteAccount={()=>{}} signOut={()=>{}}><Dashboard analysis={analysis} rules={rules} go={go} journalReview={false} accountControl={<div data-account-switcher><TradeAccountSelect owner="visual-owner" accounts={[account]} value={selection} onChange={setSelection}/></div>} onSaveTradeNote={(id,notes)=>{setTrades(trades.map(t=>t.id===id?{...t,notes}:t));return true;}}/></WorkspaceShell></div>};createRoot(document.getElementById('root')).render(<Preview/>);`;
let server,chrome,ws;const errors=[],receipts=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 server=await createServer({envDir:profile,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'net-curve-fixture',resolveId(id){if(id==='/__curve.tsx')return id;},load(id){if(id==='/__curve.tsx')return entry;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url!=='/__curve.html')return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/__curve.tsx"></script></body></html>'));});}}]});
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
 const key=async(key,code)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});};
 const capture=async(name)=>{await writeFile(join(output,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));};
 const contained=async()=>assert.equal(await evaluate(`(()=>{const t=document.querySelector('.astra-chart-tooltip').getBoundingClientRect(),p=document.querySelector('.astra-chart-main').getBoundingClientRect();return t.left>=p.left && t.right<=p.right && t.top>=p.top && t.bottom<=p.bottom;})()`),true,'Tooltip contained');
 await send('Runtime.enable');await send('Page.enable');
 for(const [name,width,height,mobile] of [['desktop',1672,941,false],['laptop',1280,720,false],['compact',1024,768,false],['desktop-edge',851,800,false],['mobile',390,844,true],['small-phone',360,800,true]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:mobile?5:1});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__curve.html`});
  await wait(`document.querySelector('[data-dashboard-visual="reference"]') && document.fonts.status==='loaded'`);await sleep(120);
  assert.deepEqual(await evaluate('[innerWidth,document.documentElement.clientWidth,Math.round(visualViewport.width)]'),[width,width,width]);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  const overflow=await evaluate(`['.astra-stat-strip','.astra-average-strip','.astra-average-cell','.astra-chart-panel','.astra-discipline','.astra-header-controls','.astra-journal'].filter(s=>[...document.querySelectorAll(s)].some(e=>e.scrollWidth>e.clientWidth+1))`);assert.deepEqual(overflow,[],name+' '+JSON.stringify(await evaluate(`[...document.querySelectorAll('.astra-stat-cell')].map(e=>({id:e.dataset.astraStat,width:e.clientWidth,scroll:e.scrollWidth,value:e.querySelector('.astra-stat-value').textContent,font:getComputedStyle(e.querySelector('.astra-stat-value')).fontSize}))`)));
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.astra-average-cell .astra-stat-value')].map(e=>e.textContent)`),expectedAverages('all'));
  assert.equal(await evaluate(`(()=>{const cells=[...document.querySelectorAll('.astra-average-cell')];return cells.length===2&&cells.every(e=>e.checkVisibility()&&e.getBoundingClientRect().width>0)&&Math.abs(cells[0].getBoundingClientRect().top-cells[1].getBoundingClientRect().top)<=1;})()`),true,'Average values remain visible and aligned');
  assert.equal(await evaluate(`document.querySelectorAll('[data-recent-trade]').length`),4);
  if(fixture?.cash)assert.match(await evaluate(`document.querySelector('[data-astra-stat="pnl"]').innerText`),/801\.22/);
  const firstRead=await evaluate(`document.querySelector('.dashboard-workspace').innerText`);
  for(const clutter of ['Cash report','End exclusive','Gross profit / gross loss','Closed-trade peak to trough','Evidence-based review. Not a trading permission.','Historical review','Evidence and review status'])assert.ok(!firstRead.includes(clutter),name+' default view must not show '+clutter);
  assert.equal(await evaluate(`document.querySelectorAll('.astra-data-content .astra-stat-detail').length`),6,'All six metric explanations remain in Data details');
  assert.equal(await evaluate(`document.querySelectorAll('.astra-observation-value').length`),0,'Exact point values belong in the interactive tooltip, not on every date');
  assert.ok(!await evaluate(`document.querySelector('.astra-chart-note').innerText.includes('$')`),'Do not repeat the headline total in the chart footer');
  await capture(name+'-dashboard');
  await checkQuietDashboardPanels(evaluate,name);
  await checkDashboardFocusAlignment({evaluate,send,capture,name,mobile});
  await evaluate(`document.querySelector('.astra-chart-svg').focus()`);await key('End',35);await wait(`Boolean(document.querySelector('.astra-chart-tooltip'))`);await contained();await capture(name+'-tooltip');await key('Escape',27);
  await evaluate(`document.querySelector('.astra-chart-svg').blur();window.scrollTo({top:0,behavior:'instant'})`);
  for(const [range,label] of [['today','Latest session'],['week','Last 7 days'],['all','All trades']]){await evaluate(`[...document.querySelectorAll('.dashboard-range-controls button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);await wait(`[...document.querySelectorAll('.dashboard-range-controls button')].some(b=>b.textContent===${JSON.stringify(label)}&&b.getAttribute('aria-pressed')==='true')`);assert.deepEqual(await evaluate(`[...document.querySelectorAll('.astra-average-cell .astra-stat-value')].map(e=>e.textContent)`),expectedAverages(range),name+' '+range+' averages follow the selected range');}
  await evaluate(`document.querySelector('.astra-data-details summary').click()`);await wait(`document.querySelector('.astra-data-details').open`);assert.equal(await evaluate(`[...document.querySelectorAll('.astra-stat-detail')].filter(e=>e.checkVisibility()).length`),6,'All metric explanations are readable on demand');await capture(name+'-data-details');await evaluate(`document.querySelector('.astra-data-details summary').click()`);
  await evaluate(`document.querySelector('.astra-trade-link').click()`);await wait(`Boolean(document.querySelector('dialog[open] textarea'))`);
  await evaluate(`document.querySelector('.astra-dialog-close').click()`);await wait(`!document.querySelector('dialog[open]')`);
  await evaluate(`document.querySelector('.astra-import-action').click()`);assert.equal(await evaluate('window.__visualRoute'),'import');
  await evaluate(`window.__visualRoute=null;document.querySelector('.astra-recent-trades .astra-text-link').focus();document.querySelector('.astra-recent-trades .astra-text-link').click()`);
  await wait(`Boolean(document.querySelector('[data-full-trade-history][open]'))`);
  assert.equal(await evaluate('window.__visualRoute'),null,'History opens in Risk Desk, not Import');
  assert.ok(await evaluate(`document.querySelectorAll('[data-history-trade]').length>4`),'All saved entries remain available');
  assert.equal(await evaluate(`(()=>{const d=document.querySelector('[data-full-trade-history]').getBoundingClientRect(),b=document.querySelector('.astra-history-header .astra-dialog-close').getBoundingClientRect();return b.left>=d.left+8 && b.right<=d.right-8 && b.top>=d.top+8 && b.bottom<=d.bottom-8;})()`),true,'Close target safely inside modal');
  await capture(name+'-full-history');
  await key('Escape',27);await wait(`!document.querySelector('[data-full-trade-history][open]')`);
  await wait(`document.activeElement===document.querySelector('.astra-recent-trades .astra-text-link')`);
  receipts.push({name,width,height,rootOverflow:false,localOverflow:false,realRows:4,chartKeyboard:true,tooltipContained:true,rangeControls:true,tradeDialog:true,importAndHistoryRoutes:true});
 }
 assert.deepEqual(errors,[]);await writeFile(join(output,'browser.json'),JSON.stringify({status:'passed',receipts,errors},null,2));console.log(JSON.stringify({status:'passed',receipts,output}));
} finally {if(ws)ws.close();if(chrome?.pid)try{execFileSync('taskkill.exe',['/PID',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});}
