// Owned-browser integration proof. Synthetic auth/provider responses only, no live APIs.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { parsePerformanceReport } from '../api/_lib/tradovate-performance.js';
import { parseCashHistory } from '../api/_lib/tradovate-cash.js';
const output=process.env.AUTO_HISTORY_EVIDENCE || join(tmpdir(),'cova-auto-history-browser');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'cova-auto-history-chrome-'));
const now=new Date(), day=now.toISOString().slice(0,10), tomorrow=new Date(Date.parse(day)+86400000).toISOString().slice(0,10);
const date=`${day.slice(5,7)}/${day.slice(8,10)}/${day.slice(0,4)}`;
const window={startDate:day,endDate:tomorrow,timeZone:'UTC',timezoneOffset:0};
const header='symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration';
const report=`${header}\r\nMNQZ6,-2,0,0.25,101,102,1,20000,20006,$12.00,${date} 00:00:00,${date} 00:00:10,10sec\r\n`;
const payload={status:'history_ready',provider:'Tradovate',coverage:'bounded_matched_fill_pairs',pnlBasis:'gross_before_fees',window,accounts:[71,72].map(id=>({account:{id:String(id),name:`Synthetic ${id}`},status:'ready',...parsePerformanceReport(report,String(id),window)}))};
for(const item of payload.accounts){const fee=item.account.id==='71'?'1.21':'2.42';const final=item.account.id==='71'?'10.79':'9.58';item.cash=parseCashHistory(`Account,Transaction ID,Timestamp,Date,Delta,Amount,Cash Change Type,Currency,Contract
${item.account.name},1,${date} 00:00:00,${day},-${fee},-${fee}, Commission,USD,MNQZ6
${item.account.name},2,${date} 00:00:10,${day},12.00,${final}, Trade Paired,USD,MNQZ6
`,item.account,window,item.trades);}
const token=`${Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:'history-owner',session_id:'history-session',exp:Math.floor(Date.now()/1000)+3600,amr:[{method:'password'}]})).toString('base64url')}.synthetic`;
for(const key of Object.keys(process.env))if(key.startsWith('VITE_'))delete process.env[key];
Object.assign(process.env,{VITE_SUPABASE_URL:'https://synthetic.supabase.test',VITE_SUPABASE_ANON_KEY:'synthetic-anon',VITE_ENABLE_DEMO_PREVIEW:'false',VITE_TRADOVATE_CONNECT_URL:'https://synthetic.cova.test/api/tradovate/connect'});
const styles=[...(await readFile('src/main.tsx','utf8')).matchAll(/import "([^"]+)";/g)].map(m=>m[1]).filter(n=>n.startsWith('@fontsource')||n.endsWith('.css')).map(n=>`import '${n.startsWith('./')?'/src/'+n.slice(2):n}';`).join('\n');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';${styles}
const user={id:'history-owner',email:'history@example.test',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{plan:'pro',provider:'email'},user_metadata:{},identities:[],created_at:new Date().toISOString()};
if(!sessionStorage.getItem('fixture-initialized')){localStorage.setItem('cova-supabase-auth-v1',JSON.stringify({access_token:${JSON.stringify(token)},refresh_token:'synthetic-refresh',expires_at:${Math.floor(Date.now()/1000)+3600},expires_in:3600,token_type:'bearer',user}));localStorage.setItem('cova-auth-session-v1',JSON.stringify({userId:user.id,email:user.email,source:'supabase',providerSessionId:'history-session',plan:'pro',mode:'login',signedInAt:new Date().toISOString()}));sessionStorage.setItem('fixture-initialized','1');}
const {defaultRules}=await import('/src/lib/risk.ts');
if(!localStorage.getItem('cova-react-risk-os-v2:history-owner'))localStorage.setItem('cova-react-risk-os-v2:history-owner',JSON.stringify({trades:[{id:'older-synthetic',date:'2025-01-01',market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl:20,risk:75,setup:'User setup',notes:'Preserve older note'}],rules:defaultRules}));
window.__historyCalls=[];window.__fixtureDelay=false;window.__fixtureError=false;window.__fixtureConnected=!location.search.includes('disconnected=1');window.__fixtureUser=user;window.__fixtureExpired=location.search.includes('expired=1');window.__fixtureRevision=location.search.includes('reconnected=1')?'synthetic-reconnected':'synthetic-connection';
const nativeFetch=window.fetch.bind(window);const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url||input.href,location.href);
if(url.hostname==='synthetic.supabase.test'){if(url.pathname.endsWith('/user'))return json(user);if(url.pathname.endsWith('/logout'))return json({});throw new Error('Unexpected auth fixture path');}
if(url.pathname==='/api/auth/consent')return json({accepted:true,privacyVersion:'fixture',termsVersion:'fixture'});
if(url.pathname==='/api/auth/logout')return json({signedOut:true});
if(url.pathname==='/api/rithmic/status')return json({available:false});
if(url.pathname==='/api/tradovate/status'){const result=json({available:true,linked:window.__fixtureConnected,connected:window.__fixtureConnected&&!window.__fixtureExpired,connectionId:window.__fixtureConnected?window.__fixtureRevision:undefined,expiresAt:window.__fixtureExpired?'2000-01-01T00:00:00.000Z':window.__fixtureExpiry||'2099-01-01T00:00:00.000Z',status:window.__fixtureConnected?(window.__fixtureExpired?'reconnect-required':'connected'):'not-connected',provider:'Tradovate'});if(window.__delayStatus)await new Promise(resolve=>window.__releaseStatus=resolve);return result;}
if(url.pathname==='/api/tradovate/connect'){if(init.method!=='POST')throw new Error('Reconnect must use authenticated POST');if(window.__connectDenied)return json({error:'Synthetic authorization canceled'},400);return json({authorizationUrl:location.origin+'/__history.html?reconnected=1&broker=tradovate&brokerStatus=connected#import'});}
if(url.pathname==='/api/tradovate/sync'){
 window.__historyCalls.push(url.search);if(window.__fixtureDelay)await new Promise(resolve=>window.__releaseHistory=resolve);
 if(window.__fixtureError)return json({error:'Synthetic report failure'},502);
 const data=${JSON.stringify(payload)};data.window.startDate=url.searchParams.get('startDate')||data.window.startDate;data.window.endDate=url.searchParams.get('endDate')||data.window.endDate;
 for(const account of data.accounts){
  account.cash.window={startDate:data.window.startDate,endDate:data.window.endDate};
  if(window.__fixtureCorrection){account.csv=account.csv.replace('20006','20010').replace(',12,',',20,');account.trades[0].exit=20010;account.trades[0].pnl=20;}
  if(window.__fixtureMode==='malformed')account.csv=account.csv.replace('20000','oops');
  if(window.__fixtureMode==='empty'){account.csv=account.csv.split('\\n')[0];account.trades=[];account.counts.trades=0;account.status='empty';}
  if(window.__fixtureMode==='failed'){delete account.csv;delete account.trades;delete account.counts;account.status='failed';account.reason='provider_error';}
  if(url.searchParams.get('accountId')&&url.searchParams.get('accountId')!==account.account.id){delete account.csv;delete account.trades;delete account.counts;account.status='deferred';}
 }
 return json(data);
}
if(url.pathname==='/api/connectors/disconnect'){window.__fixtureConnected=false;return json({provider:'Tradovate'});}
if(url.origin===location.origin)return nativeFetch(input,init);throw new Error('External request forbidden in history fixture');};
const {default:App}=await import('/src/App.tsx');createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);`;
let server,chrome,ws;const failures=[];const receipts=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
server=await createServer({envDir:profile,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'history-browser-fixture',resolveId(id){if(id==='/__history.tsx')return id;},load(id){if(id==='/__history.tsx')return entry;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/__history.html'))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/__history.tsx"></script></body></html>'));});}}]});
await server.listen();const port=server.httpServer.address().port;
chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let debugPort;for(let i=0;i<150;i++){try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{}await sleep(100);}assert(debugPort,'Owned Chrome readiness');
const tabs=await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});let sequence=0;const pending=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id){const cb=pending.get(m.id);pending.delete(m.id);if(m.error)cb.reject(new Error(m.error.message));else cb.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')failures.push(m.params.exceptionDetails.text);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result?.value;};
const wait=async(expression)=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error('Browser assertion timed out: '+expression+'; '+await evaluate('JSON.stringify({auth:JSON.parse(localStorage.getItem("cova-auth-session-v1")||"null"),switchError:window.__switchError,body:document.body.innerText.slice(0,1600)})'));};
const select=async(label,value)=>{await evaluate(`{const s=document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)});s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));}`);await sleep(50);};
const load=async()=>{await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Load history").click()');};
const imported=async()=>{await evaluate('location.hash="import"');await wait(`Boolean(document.querySelector('[aria-label="History account"]'))`);await sleep(100);};
const screenshot=async(name)=>{await wait("document.fonts.status==='loaded'");await sleep(350);await writeFile(join(output,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));};
await send('Runtime.enable');await send('Page.enable');
if(!process.argv.includes('--reconnect-only')) {
for(const mobile of [false,true]){
if(mobile) {await evaluate('localStorage.clear();sessionStorage.clear()');await send('Page.navigate',{url:'about:blank'});await wait(`location.href==='about:blank'`);}
await send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1440,height:mobile?844:900,deviceScaleFactor:mobile?3:1,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:mobile?5:1});
await send('Page.navigate',{url:`http://127.0.0.1:${port}/__history.html?broker=tradovate&brokerStatus=connected#import`});
await wait('Boolean(document.querySelector(".workspace-sidebar"))');
await writeFile(join(output,mobile?'mobile-initial.png':'desktop-initial.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
if(process.argv.includes('--baseline')){receipts.push({mobile,baseline:true});continue;}
await wait('JSON.parse(localStorage.getItem("cova-react-risk-os-v2:history-owner")||"{}").trades?.length===3');
await wait('location.hash==="#dashboard"');
assert.equal(await evaluate(`document.querySelector('[aria-label="Trade account"]')?.value`),'Tradovate:71');
assert.equal(await evaluate(`document.querySelector('[aria-label="Trade account"]').selectedOptions[0].textContent`),'Synthetic 71','Use the broker account name, not the internal account key');
assert.equal(await evaluate(`document.querySelector('[aria-label="Trade account"]').closest('label').parentElement.querySelectorAll('p').length`),0,'Account switcher has no explanatory paragraphs underneath');
if(mobile) assert.equal(await evaluate(`document.querySelector('[aria-label="Trade account"]').closest('label').getBoundingClientRect().top >= 80`),true,'Mobile account label must clear the fixed navigation header');
assert.equal(await evaluate('JSON.parse(localStorage.getItem("cova-react-risk-os-v2:history-owner")).trades.find(t=>t.id==="older-synthetic").notes'),'Preserve older note');
assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
assert.deepEqual(await evaluate('[innerWidth,document.documentElement.clientWidth,Math.round(visualViewport.width)]'),mobile?[390,390,390]:[1440,1440,1440]);
await wait('document.querySelector(".astra-source-label")?.textContent.includes("1 trades")');
assert.match(await evaluate(`document.querySelector('[data-astra-stat="pnl"]').innerText`),/Net cash P&L[\s\S]*\+\$10\.79/);
await wait(`!document.body.innerText.includes('History sync:')`);
await wait(`!document.querySelector('.auth-overlay')`);
// Exercise the real App account selector and Canvas renderer with different net results.
const ledgerBeforeRecaps=await evaluate('localStorage.getItem("cova-react-risk-os-v2:history-owner")');
const recapResults=[];
for(const [account,amount] of [['71','+$10.79'],['72','+$9.58'],['71','+$10.79']]) {
  await select('Trade account','Tradovate:'+account);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Share recap').click()`);
  await wait(`Boolean(document.querySelector('dialog[open]'))`);
  // Profile backend is intentionally unavailable in this integration fixture.
  await evaluate(`document.querySelector('#recap-show-identity').click()`);
  await wait(`document.querySelector('[data-recap-preview]')?.complete && !document.querySelector('[data-recap-download]')?.disabled`);
  const result=await evaluate(`({account:document.querySelector('[aria-label="Trade account"]').value,alt:document.querySelector('[data-recap-preview]').alt,src:document.querySelector('[data-recap-preview]').src})`);
  assert(result.alt.includes(amount+' after fees'),JSON.stringify(result));
  recapResults.push(result);
  await screenshot((mobile?'mobile':'desktop')+'-recap-'+account);
  // Switching even while a composer is open must discard the old export.
  await select('Trade account','Tradovate:'+(account==='71'?'72':'71'));
  await wait(`!document.querySelector('dialog[open]')`);
}
assert.equal(new Set(recapResults.map(r=>r.src)).size,3,'Each account opening creates a fresh artifact');
await select('Trade account','Tradovate:71');
assert.deepEqual(JSON.parse(await evaluate('localStorage.getItem("cova-react-risk-os-v2:history-owner")')).trades,JSON.parse(ledgerBeforeRecaps).trades,'Recaps never mutate trading history');
receipts.push({mobile,recapAccounts:recapResults.map(({account,alt})=>({account,alt})),recapSwitchClearsExport:true});
await evaluate(`document.querySelector('.astra-chart-svg').focus()`);
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',windowsVirtualKeyCode:35});
await wait(`Boolean(document.querySelector('.astra-chart-tooltip'))`);
const netTooltip=await evaluate(`document.querySelector('.astra-chart-tooltip').innerText`);
assert.ok(!netTooltip.includes('Trade '),'Cash days must not masquerade as numbered trades');
assert.match(netTooltip,/Cumulative net/);
assert.match(netTooltip,/Day net/);
assert.equal(await evaluate(`document.querySelector('.astra-chart-tooltip strong').textContent`),'+$10.79','Day net leads the contextual tooltip');
assert.match(await evaluate(`document.querySelector('.astra-chart-svg').getAttribute('aria-label')`),/Daily cumulative net P&L/);
assert.equal(await evaluate(`(()=>{const tip=document.querySelector('.astra-chart-tooltip').getBoundingClientRect(),plot=document.querySelector('.astra-chart-main').getBoundingClientRect();return tip.left>=plot.left && tip.right<=plot.right && tip.top>=plot.top && tip.bottom<=plot.bottom;})()`),true,'Net tooltip stays inside its chart on desktop and phone');
await screenshot(mobile?'mobile-net-tooltip':'desktop-net-tooltip');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await evaluate(`document.querySelector('.astra-chart-svg').blur();window.scrollTo({top:0,behavior:'instant'})`);
await screenshot(mobile?'mobile-dashboard':'desktop-dashboard');
assert.equal(await evaluate(`document.querySelector('[data-account-switcher]').getBoundingClientRect().height<=56`),true,'Switcher stays compact');
assert.equal(await evaluate(`Boolean(document.querySelector('.astra-reference-header [data-account-switcher]'))`),true,'Same account control lives in approved header');
assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Trade account"]').length`),1,'One authoritative account selector');
assert.equal(await evaluate(`parseFloat(getComputedStyle(document.querySelector('[data-astra-stat="pnl"] .astra-stat-value')).fontSize)>parseFloat(getComputedStyle(document.querySelector('[data-astra-stat="win-rate"] .astra-stat-value')).fontSize)`),true,'Reference gives profit primary hierarchy');
assert.equal(await evaluate(`Boolean(document.querySelector('.astra-stat-basis'))`),true,'Gross trade stats are visibly separated from net');
await evaluate(`document.querySelector('.astra-data-details summary').click()`);
assert.match(await evaluate(`document.querySelector('[data-cash-coverage]').innerText`),/Funding excluded/);
await evaluate(`document.querySelector('.astra-data-details summary').click()`);
await select('Trade account','Tradovate:72');
assert.equal(await evaluate(`document.querySelector('[aria-label="Trade account"]').selectedOptions[0].textContent`),'Synthetic 72');
assert.match(await evaluate(`document.querySelector('[data-astra-stat="pnl"]').innerText`),/\+\$9\.58/);
await select('Trade account','all');
assert.equal(await evaluate(`document.querySelector('[aria-label="Trade account"]').selectedOptions[0].textContent`),'All accounts');
await select('Trade account','Tradovate:71');
receipts.push({mobile,imported:3,selected:'Tradovate:71',olderNotePreserved:true,overflow:false,calls:await evaluate('window.__historyCalls.length')});
await evaluate('document.querySelector(".astra-recent-trades .astra-text-link").click()');
await wait(`document.querySelector('[data-full-trade-history][open] [data-history-trade="tradovate-71:101:102"]')?.textContent.includes('00:00:10')`);
assert.equal(await evaluate('document.querySelectorAll("[data-history-trade]").length'),1);
await screenshot(mobile?'mobile-history':'desktop-history');
assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
await evaluate('document.querySelector(".astra-history-header .astra-dialog-close").click()');
await select('Trade account','Tradovate:72');
await evaluate('document.querySelector(".astra-recent-trades .astra-text-link").click()');
await wait(`Boolean(document.querySelector('[data-full-trade-history][open] [data-history-trade="tradovate-72:101:102"]'))`);
assert.equal(await evaluate('document.querySelectorAll("[data-history-trade]").length'),1);
await evaluate('document.querySelector(".astra-history-header .astra-dialog-close").click()');
await select('Trade account','Tradovate:71');
await evaluate('location.hash="import"');await wait(`Boolean(document.querySelector('[aria-label="History account"]'))`);
await wait(`document.querySelector('[aria-label="History account"]').options.length===3`);
assert.equal(await evaluate('document.querySelector("[data-history-trade]")'),null,'Connection page does not duplicate the ledger');
await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Load history").click()');await wait('location.hash==="#dashboard"');
assert.equal(await evaluate('JSON.parse(localStorage.getItem("cova-react-risk-os-v2:history-owner")).trades.length'),3);
receipts[receipts.length-1].repeatAdds=0;
assert.match(await evaluate(`document.querySelector('[data-astra-stat="pnl"]').innerText`),/\+\$10\.79/,'Repeat sync must not deduct fees twice');
const netBeforeReload=await evaluate('performance.timeOrigin');await send('Page.reload');await wait(`performance.timeOrigin!==${netBeforeReload} && Boolean(document.querySelector('[data-astra-stat="pnl"]'))`);
assert.match(await evaluate(`document.querySelector('[data-astra-stat="pnl"]').innerText`),/Net cash P&L[\s\S]*\+\$10\.79/,'Net survives reload');
for(const label of ['Latest session','Last 7 days','All trades']) {await evaluate(`[...document.querySelectorAll('.dashboard-range-controls button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);await sleep(60);assert.match(await evaluate(`document.querySelector('[data-astra-stat="pnl"]').innerText`),/\+\$10\.79/);}

if(!mobile){
 await evaluate('location.hash="import"');await wait(`Boolean(document.querySelector('[aria-label="History account"]'))`);
 const before=await evaluate('localStorage.getItem("cova-react-risk-os-v2:history-owner")');
 await evaluate('window.__fixtureDelay=true;window.__fixtureCorrection=true;[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Load history").click()');
 await wait('typeof window.__releaseHistory==="function"');
 await evaluate(`{const s=document.querySelector('[aria-label="Trade account"]');s.value='Tradovate:72';s.dispatchEvent(new Event('change',{bubbles:true}));}`);
 await wait(`document.querySelector('[aria-label="Trade account"]').value==='Tradovate:72'`);
 await evaluate('window.__releaseHistory();window.__fixtureDelay=false');await sleep(300);
 assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem("cova-react-risk-os-v2:history-owner")).trades'),JSON.parse(before).trades,'selection change rejects pending provider correction');
 receipts[receipts.length-1].selectionRace=true;
 // A completed response, explicit retry, and all non-mutating account outcomes.
 await evaluate('window.__fixtureCorrection=false;location.hash="dashboard"');await wait('Boolean(document.querySelector(".astra-trade-link"))');
 await evaluate('document.querySelector(".astra-trade-link").click()');await wait('Boolean(document.querySelector("dialog[open] textarea"))');
 await evaluate(`{const t=document.querySelector('dialog[open] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Synthetic annotation retained');t.dispatchEvent(new Event('input',{bubbles:true}));}`);
 await evaluate('document.querySelector(".astra-save-note").click()');await wait('!document.querySelector("dialog[open]")');
 await imported();await select('History account','72');await evaluate('window.__fixtureCorrection=true');await load();await wait('location.hash==="#dashboard"');
 await wait('document.querySelector(".astra-source-label")?.textContent.includes("1 trades")');
 assert.match(await evaluate('document.body.innerText'),/\+\$20/);
 assert.equal(await evaluate('JSON.parse(localStorage.getItem("cova-react-risk-os-v2:history-owner")).trades.find(t=>t.id==="tradovate-72:101:102").notes'),'Synthetic annotation retained');
 await imported();await select('History account','72');
 for(const mode of ['empty','failed','malformed']){
  const ledger=await evaluate('localStorage.getItem("cova-react-risk-os-v2:history-owner")');
  await evaluate(`window.__fixtureMode=${JSON.stringify(mode)}`);await load();
  await wait(`![...document.querySelectorAll('button')].some(b=>b.textContent==='Loading history…')`);
  assert.equal(await evaluate('localStorage.getItem("cova-react-risk-os-v2:history-owner")'),ledger,mode+' preserves ledger');
 }
 await evaluate('window.__fixtureMode="failed"');await load();await sleep(150);
 assert.equal(await evaluate(`JSON.parse(Object.entries(sessionStorage).find(([k])=>k.startsWith('cova-history-summary:'))[1]).outcome`),'failed');
 const calls=await evaluate('window.__historyCalls.length');await evaluate('location.hash="dashboard"');await wait('Boolean(document.querySelector(".astra-source-label"))');await imported();
 assert.equal(await evaluate('window.__historyCalls.length'),calls,'failed remount does not auto loop');
 await evaluate('window.__fixtureMode=""');await select('History account','72');await load();await wait('location.hash==="#dashboard"');
 receipts[receipts.length-1].manualRetry=true;
 const beforeReload=await evaluate('performance.timeOrigin');
 await send('Page.reload');await wait(`performance.timeOrigin!==${beforeReload} && Boolean(document.querySelector(".astra-source-label")) && Boolean(document.querySelector('[aria-label="Trade account"]'))`);
 assert.equal(await evaluate(`document.querySelector('[aria-label="Trade account"]').value`),'Tradovate:72');
 await imported();assert.equal(await evaluate('window.__historyCalls.length'),0,'reload retains completed scope and inventory');
 assert.equal(await evaluate(`document.querySelector('[aria-label="History account"]').options.length`),3);
 // Connection-change and sign-out races must reject even a transport ignoring abort.
 const ledger=await evaluate('localStorage.getItem("cova-react-risk-os-v2:history-owner")');
 await evaluate('window.__fixtureDelay=true');await load();await wait('typeof window.__releaseHistory==="function"');
 await evaluate(`(async()=>{const m=await import('/src/lib/brokerStatus.ts');m.writeBrokerStatus({...m.readBrokerStatus(),connectionId:'synthetic-reconnected'});})()`);
 await evaluate('window.__releaseHistory();window.__fixtureDelay=false');await sleep(150);
 assert.equal(await evaluate('localStorage.getItem("cova-react-risk-os-v2:history-owner")'),ledger);
 await evaluate('window.__releaseHistory=undefined;window.__fixtureDelay=true');await load();await wait('typeof window.__releaseHistory==="function"');
 await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign out').click()`);await wait('!document.querySelector(".workspace-sidebar")');
 await evaluate('window.__releaseHistory();window.__fixtureDelay=false');await sleep(150);
 assert.equal(await evaluate('localStorage.getItem("cova-react-risk-os-v2:history-owner")'),ledger);
 receipts[receipts.length-1].connectionRace=true;receipts[receipts.length-1].signoutRace=true;
} else {
 await imported();await evaluate(`{const t=document.querySelector('textarea[aria-label="CSV text"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'date,market,side,contracts,entry,exit,pnl,risk,setup,notes\\n2026-05-06,NQ,Long,1,18900,18915,300,250,Opening range,Synthetic browser fixture');t.dispatchEvent(new Event('input',{bubbles:true}));}`);await wait(`!document.querySelector('[data-csv-import] .accounts-button-primary').disabled`);await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Review trades').click()`);await wait('location.hash==="#dashboard"');
 assert.equal(await evaluate(`document.querySelector('[aria-label="Trade account"]').value`),'local','CSV restores local source selection');
 await imported();await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Reset demo').click()`);await sleep(100);
 assert.equal(await evaluate('JSON.parse(localStorage.getItem("cova-react-risk-os-v2:history-owner")).tradeAccount'),'local','demo reset does not leave empty provider filter');
}
}
// The selector also works for a Rithmic-only ledger, without exposing its opaque account key.
await evaluate(`{const key='a'.repeat(32), ledger=JSON.parse(localStorage.getItem('cova-react-risk-os-v2:history-owner'));ledger.trades=[{...ledger.trades[0],id:'rithmic-synthetic',source:{provider:'Rithmic',accountKey:key,accountId:'A-1',currency:'USD'}}];ledger.tradeAccount='Rithmic:'+key+':A-1';localStorage.setItem('cova-react-risk-os-v2:history-owner',JSON.stringify(ledger));location.hash='dashboard';}`);
const rithmicReload=await evaluate('performance.timeOrigin');await send('Page.reload');await wait(`performance.timeOrigin!==${rithmicReload} && Boolean(document.querySelector('.astra-source-label'))`);
assert.equal(await evaluate(`document.querySelector('[aria-label="Trade account"]')?.selectedOptions[0].textContent`),'A-1','Rithmic-only accounts must expose the switcher with their readable account ID');
receipts.push({rithmicOnly:true});
await evaluate(`(async()=>{const {rememberAccountNames}=await import('/src/lib/accountNames.ts');rememberAccountNames('history-owner',{['Rithmic:'+'a'.repeat(32)+':A-1']:'Funded Alpha'});for(const key of Object.keys(sessionStorage))if(key.startsWith('cova-history-summary:'))sessionStorage.removeItem(key);})()`);
const namesReload=await evaluate('performance.timeOrigin');await send('Page.reload');await wait(`performance.timeOrigin!==${namesReload} && Boolean(document.querySelector('[aria-label="Trade account"]'))`);
assert.equal(await evaluate(`document.querySelector('[aria-label="Trade account"]').selectedOptions[0].textContent`),'Funded Alpha');
receipts.push({persistentNames:true});
await evaluate('localStorage.clear();sessionStorage.clear()');
await send('Page.navigate',{url:`http://127.0.0.1:${port}/__history.html?disconnected=1&broker=tradovate&brokerStatus=connected#import`});
await wait('Boolean(document.querySelector(".workspace-sidebar"))');await sleep(200);
assert.equal(await evaluate('window.__historyCalls.length'),0,'forged callback cannot import through expired server status');
assert.equal(await evaluate('JSON.parse(localStorage.getItem("cova-react-risk-os-v2:history-owner")).trades.length'),1);
receipts.push({forgedCallback:true,expiredConnection:true,providerCalls:0});
await evaluate('localStorage.clear();sessionStorage.clear()');
await send('Page.navigate',{url:`http://127.0.0.1:${port}/__history.html?broker=tradovate&brokerStatus=connected#import`});
await wait('location.hash==="#dashboard" && Boolean(document.querySelector(".astra-source-label"))');await imported();
const ownerLedger=await evaluate('localStorage.getItem("cova-react-risk-os-v2:history-owner")');
await evaluate('window.__fixtureDelay=true');await load();await wait('typeof window.__releaseHistory==="function"');
// Model an independently completed ordinary auth ceremony for B. setSession alone
// is correctly rejected by App when it has neither callback nor saved authority.
await evaluate(`localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:'history-owner-b',email:'history-b@example.test',providerSessionId:'history-session-b',plan:'pro',mode:'login',signedInAt:new Date().toISOString()}))`);
await evaluate(`(async()=>{window.__fixtureConnected=false;window.__fixtureUser.id='history-owner-b';window.__fixtureUser.email='history-b@example.test';const session=JSON.parse(localStorage.getItem('cova-supabase-auth-v1'));const parts=session.access_token.split('.');parts[1]=btoa(JSON.stringify({sub:'history-owner-b',session_id:'history-session-b',exp:Math.floor(Date.now()/1000)+3600,amr:[{method:'password'}]})).replace(/=/g,'');parts[2]=btoa('synthetic').replace(/=/g,'');const {getSupabaseClient}=await import('/src/lib/supabaseClient.ts');const result=await getSupabaseClient().auth.setSession({access_token:parts.join('.'),refresh_token:'synthetic-refresh-b'});window.__switchError=result.error?.message;})()`);
await wait(`Boolean(document.querySelector('.workspace-sidebar')) && JSON.parse(localStorage.getItem('cova-react-risk-os-v2:history-owner-b')||'{}').trades?.length===0`);
await evaluate('window.__releaseHistory();window.__fixtureDelay=false');await sleep(200);
assert.equal(await evaluate('localStorage.getItem("cova-react-risk-os-v2:history-owner")'),ownerLedger);
assert.equal(await evaluate('JSON.parse(localStorage.getItem("cova-react-risk-os-v2:history-owner-b")).trades.length'),0);
assert.equal(await evaluate('document.querySelectorAll("[data-history-trade]").length'),0);
receipts.push({identityRace:true,oldOwnerUnchanged:true,newOwnerTrades:0});
}
// The expired link remains usable for reconnect/disconnect, never for history requests.
for (const mobile of [false, true]) {
  await evaluate("if(location.protocol==='http:'){localStorage.clear();sessionStorage.clear()}");
  await send('Page.navigate', {url:'about:blank'}); await wait(`location.href==='about:blank'`);
  await send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1440,height:mobile?844:900,deviceScaleFactor:1,mobile});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__history.html?broker=tradovate&brokerStatus=connected#import`});
  await wait(`location.hash==='#dashboard' && Boolean(document.querySelector('.astra-source-label'))`);
  assert.equal(await evaluate(`(async()=>{const {saveDailyJournal,readDailyJournalEntry}=await import('/src/lib/dailyJournal.ts');if(!saveDailyJournal('history-owner','Tradovate:71','${day}','Preserve journal on expiry','tradovate-71:101:102'))return false;const entry=readDailyJournalEntry('history-owner','Tradovate:71','${day}');return entry.note==='Preserve journal on expiry' && entry.tradeId==='tradovate-71:101:102';})()`),true);
  const snapshot = await evaluate(`JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('cova-react-risk-os-v2:')||k.startsWith('cova-daily-journal-v1:'))))`);
  await evaluate(`location.hash='import'`);
  await wait(`Boolean(document.querySelector('[aria-label="History account"]'))`);
  const callsBeforeExpiry=await evaluate('window.__historyCalls.length');
  await evaluate(`window.__fixtureExpiry=new Date(Date.now()+1200).toISOString();[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Refresh status').click()`);
  await wait(`document.querySelector('[data-platform="tradovate"]')?.textContent.includes('Reconnect to sync')`);
  assert.equal(await evaluate('window.__historyCalls.length'),callsBeforeExpiry,'Expiry must not poll or auto-reauthorize');
  await evaluate('window.__fixtureExpired=true');
  assert.equal(await evaluate(`Boolean([...document.querySelectorAll('[data-platform="tradovate"] button')].find(b=>b.textContent.trim()==='Reconnect Tradovate'))`),true);
  assert.equal(await evaluate(`Boolean([...document.querySelectorAll('[data-platform="tradovate"] button')].find(b=>b.textContent.trim()==='Disconnect'))`),true);
  assert.equal(await evaluate(`Boolean(document.querySelector('[aria-label="History account"]'))`),false,'Expired credential cannot load history');
  await evaluate(`document.querySelector('[data-platform="tradovate"]').scrollIntoView({block:'center',behavior:'instant'})`);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  await screenshot(mobile?'mobile-reconnect':'desktop-reconnect');
  // A real document reload must recover the server link even with no browser status cache.
  await evaluate(`for(const key of Object.keys(localStorage))if(key.startsWith('cova-tradovate-status-v1'))localStorage.removeItem(key)`);
  const beforeReload=await evaluate('performance.timeOrigin');
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__history.html?expired=1#import`});
  await wait(`performance.timeOrigin!==${beforeReload} && document.querySelector('[data-platform="tradovate"]')?.textContent.includes('Reconnect to sync')`);
  assert.equal(await evaluate('window.__historyCalls.length'),0,'Expired reload must not trigger history');
  assert.equal(await evaluate(`JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('cova-react-risk-os-v2:')||k.startsWith('cova-daily-journal-v1:'))))`),snapshot);
  await evaluate(`window.__connectDenied=true;[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Reconnect Tradovate').click()`);
  await wait(`document.body.innerText.includes('Synthetic authorization canceled')`);
  assert.equal(await evaluate(`document.querySelector('[data-platform="tradovate"]').textContent.includes('Reconnect to sync')`),true);
  await evaluate(`window.__connectDenied=false;[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Reconnect Tradovate').click()`);
  await wait(`window.__fixtureRevision==='synthetic-reconnected' && location.hash==='#dashboard' && Boolean(document.querySelector('.astra-source-label'))`);
  assert.equal(await evaluate(`JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('cova-react-risk-os-v2:')||k.startsWith('cova-daily-journal-v1:'))))`),snapshot,'Reconnect preserves trades, notes and attachment without duplicates');
  await evaluate(`window.__fixtureExpired=true;location.hash='import'`);
  await wait(`document.querySelector('[data-platform="tradovate"]')?.textContent.includes('Reconnect to sync')`);
  await evaluate(`[...document.querySelectorAll('[data-platform="tradovate"] button')].find(b=>b.textContent.trim()==='Disconnect').click()`);
  await wait(`document.querySelector('[data-platform="tradovate"]')?.textContent.includes('Not connected')`);
  assert.equal(await evaluate(`JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('cova-react-risk-os-v2:')||k.startsWith('cova-daily-journal-v1:'))))`),snapshot,'Disconnect does not erase trading data');
  await evaluate(`window.__fixtureConnected=true;window.__delayStatus=true;[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Refresh status').click()`);
  await wait(`typeof window.__releaseStatus==='function'`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign out').click()`);
  await wait(`!document.querySelector('.workspace-sidebar')`);
  await evaluate('window.__releaseStatus()'); await sleep(150);
  assert.equal(await evaluate(`Object.keys(localStorage).filter(k=>k.startsWith('cova-tradovate-status-v1')).length`),0,'Late status after signout must not recreate a retained link in another scope');
  receipts.push({mobile,expiredLink:true,reloadRetained:true,reconnect:true,noDuplicates:true,disconnectRetainsHistory:true,lateStatusRejected:true});
}
assert.deepEqual(failures,[]);await writeFile(join(output,'browser.json'),JSON.stringify({status:'passed',receipts,failures},null,2));console.log(JSON.stringify({status:'passed',receipts,output}));
} catch(error){await writeFile(join(output,'browser.json'),JSON.stringify({status:'failed',error:String(error),receipts,failures},null,2));throw error;} finally {if(ws)ws.close();if(chrome?.pid)try{execFileSync('taskkill.exe',['/PID',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});}
