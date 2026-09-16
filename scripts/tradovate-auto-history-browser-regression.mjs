// Owned-browser integration proof. Synthetic auth/provider responses only, no live APIs.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { parsePerformanceReport } from '../api/_lib/tradovate-performance.js';
const output=process.env.AUTO_HISTORY_EVIDENCE || join(tmpdir(),'cova-auto-history-browser');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'cova-auto-history-chrome-'));
const now=new Date(), day=now.toISOString().slice(0,10), tomorrow=new Date(Date.parse(day)+86400000).toISOString().slice(0,10);
const date=`${day.slice(5,7)}/${day.slice(8,10)}/${day.slice(0,4)}`;
const window={startDate:day,endDate:tomorrow,timeZone:'UTC',timezoneOffset:0};
const header='symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration';
const report=`${header}\r\nMNQZ6,-2,0,0.25,101,102,1,20000,20006,$12.00,${date} 00:00:00,${date} 00:00:10,10sec\r\n`;
const payload={status:'history_ready',provider:'Tradovate',coverage:'bounded_matched_fill_pairs',pnlBasis:'gross_before_fees',window,accounts:[71,72].map(id=>({account:{id:String(id),name:`Synthetic ${id}`},status:'ready',...parsePerformanceReport(report,String(id),window)}))};
const token=`${Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:'history-owner',session_id:'history-session',exp:Math.floor(Date.now()/1000)+3600,amr:[{method:'password'}]})).toString('base64url')}.synthetic`;
for(const key of Object.keys(process.env))if(key.startsWith('VITE_'))delete process.env[key];
Object.assign(process.env,{VITE_SUPABASE_URL:'https://synthetic.supabase.test',VITE_SUPABASE_ANON_KEY:'synthetic-anon',VITE_ENABLE_DEMO_PREVIEW:'false'});
const styles=[...(await readFile('src/main.tsx','utf8')).matchAll(/import "([^"]+)";/g)].map(m=>m[1]).filter(n=>n.startsWith('@fontsource')||n.endsWith('.css')).map(n=>`import '${n.startsWith('./')?'/src/'+n.slice(2):n}';`).join('\n');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';${styles}
const user={id:'history-owner',email:'history@example.test',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{plan:'pro',provider:'email'},user_metadata:{},identities:[],created_at:new Date().toISOString()};
if(!sessionStorage.getItem('fixture-initialized')){localStorage.setItem('cova-supabase-auth-v1',JSON.stringify({access_token:${JSON.stringify(token)},refresh_token:'synthetic-refresh',expires_at:${Math.floor(Date.now()/1000)+3600},expires_in:3600,token_type:'bearer',user}));localStorage.setItem('cova-auth-session-v1',JSON.stringify({userId:user.id,email:user.email,source:'supabase',providerSessionId:'history-session',plan:'pro',mode:'login',signedInAt:new Date().toISOString()}));sessionStorage.setItem('fixture-initialized','1');}
const {defaultRules}=await import('/src/lib/risk.ts');
if(!localStorage.getItem('cova-react-risk-os-v2:history-owner'))localStorage.setItem('cova-react-risk-os-v2:history-owner',JSON.stringify({trades:[{id:'older-synthetic',date:'2025-01-01',market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl:20,risk:75,setup:'User setup',notes:'Preserve older note'}],rules:defaultRules}));
window.__historyCalls=[];window.__fixtureDelay=false;window.__fixtureError=false;window.__fixtureConnected=!location.search.includes('disconnected=1');window.__fixtureUser=user;
const nativeFetch=window.fetch.bind(window);const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url||input.href,location.href);
if(url.hostname==='synthetic.supabase.test'){if(url.pathname.endsWith('/user'))return json(user);if(url.pathname.endsWith('/logout'))return json({});throw new Error('Unexpected auth fixture path');}
if(url.pathname==='/api/auth/consent')return json({accepted:true,privacyVersion:'fixture',termsVersion:'fixture'});
if(url.pathname==='/api/auth/logout')return json({signedOut:true});
if(url.pathname==='/api/rithmic/status')return json({available:false});
if(url.pathname==='/api/tradovate/status')return json({available:true,connected:window.__fixtureConnected,connectionId:window.__fixtureConnected?'synthetic-connection':undefined,provider:'Tradovate'});
if(url.pathname==='/api/tradovate/sync'){
 window.__historyCalls.push(url.search);if(window.__fixtureDelay)await new Promise(resolve=>window.__releaseHistory=resolve);
 if(window.__fixtureError)return json({error:'Synthetic report failure'},502);
 const data=${JSON.stringify(payload)};data.window.startDate=url.searchParams.get('startDate')||data.window.startDate;data.window.endDate=url.searchParams.get('endDate')||data.window.endDate;
 for(const account of data.accounts){
  if(window.__fixtureCorrection){account.csv=account.csv.replace('20006','20010').replace(',12,',',20,');account.trades[0].exit=20010;account.trades[0].pnl=20;}
  if(window.__fixtureMode==='malformed')account.csv=account.csv.replace('20000','oops');
  if(window.__fixtureMode==='empty'){account.csv=account.csv.split('\\n')[0];account.trades=[];account.counts.trades=0;account.status='empty';}
  if(window.__fixtureMode==='failed'){delete account.csv;delete account.trades;delete account.counts;account.status='failed';account.reason='provider_error';}
  if(url.searchParams.get('accountId')&&url.searchParams.get('accountId')!==account.account.id){delete account.csv;delete account.trades;delete account.counts;account.status='deferred';}
 }
 return json(data);
}
if(url.pathname==='/api/connectors/disconnect')return json({provider:'Tradovate'});
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
for(const mobile of [false,true]){
if(mobile) await evaluate('localStorage.clear();sessionStorage.clear()');
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
assert.match(await evaluate('document.querySelector(".astra-kpi-strip")?.innerText || document.body.innerText'),/\+\$12/);
await wait(`!document.body.innerText.includes('History sync:')`);
await screenshot(mobile?'mobile-dashboard':'desktop-dashboard');
assert.equal(await evaluate(`document.querySelector('[data-account-switcher]').getBoundingClientRect().height<=56`),true,'Switcher stays compact');
await select('Trade account','Tradovate:72');
assert.equal(await evaluate(`document.querySelector('[aria-label="Trade account"]').selectedOptions[0].textContent`),'Synthetic 72');
await select('Trade account','all');
assert.equal(await evaluate(`document.querySelector('[aria-label="Trade account"]').selectedOptions[0].textContent`),'All accounts');
await select('Trade account','Tradovate:71');
receipts.push({mobile,imported:3,selected:'Tradovate:71',olderNotePreserved:true,overflow:false,calls:await evaluate('window.__historyCalls.length')});
await evaluate('location.hash="import"');await wait(`Boolean(document.querySelector('[aria-label="History account"]'))`);
await wait(`document.querySelector('[aria-label="History account"]').options.length===3`);
await wait(`document.querySelector('[data-history-trade="tradovate-71:101:102"]')?.textContent.includes('00:00:10')`);
assert.equal(await evaluate('document.querySelectorAll("[data-history-trade]").length'),1);
await evaluate(`document.querySelector('[aria-label="Saved trade history"]').scrollIntoView({block:'center',behavior:'instant'})`);await screenshot(mobile?'mobile-history':'desktop-history');
assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
await select('Trade account','Tradovate:72');
await wait(`Boolean(document.querySelector('[data-history-trade="tradovate-72:101:102"]'))`);
assert.equal(await evaluate('document.querySelectorAll("[data-history-trade]").length'),1);
await select('Trade account','Tradovate:71');
await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Load history").click()');await wait('location.hash==="#dashboard"');
assert.equal(await evaluate('JSON.parse(localStorage.getItem("cova-react-risk-os-v2:history-owner")).trades.length'),3);
receipts[receipts.length-1].repeatAdds=0;
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
 await imported();await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Review trades').click()`);await wait('location.hash==="#dashboard"');
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
assert.deepEqual(failures,[]);await writeFile(join(output,'browser.json'),JSON.stringify({status:'passed',receipts,failures},null,2));console.log(JSON.stringify({status:'passed',receipts,output}));
} catch(error){await writeFile(join(output,'browser.json'),JSON.stringify({status:'failed',error:String(error),receipts,failures},null,2));throw error;} finally {if(ws)ws.close();if(chrome?.pid)try{execFileSync('taskkill.exe',['/PID',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});}
