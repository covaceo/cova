// Local owned-browser test: actual ImportDesk, probe, authenticated fetch and handler projections.
// Synthetic session getter + provider fixtures only. Browser network is loopback-only.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {run,selection} from './helpers/tradovate-stop-history-fixture.mjs';
assert(existsSync('src/components/TradovateStopHistoryCheck.tsx'),'Usable read-only single-trade component must exist');
const output=process.env.STOP_HISTORY_EVIDENCE||join(tmpdir(),'cova-stop-history-browser');await mkdir(output,{recursive:true});
const scratch=await mkdtemp(join(tmpdir(),'cova-stop-history-vite-'));
globalThis.fetch=()=>{throw Error('Unmocked network forbidden')};
const evidence=(await run()).res.body;
const trade={id:selection.tradeId,date:'2026-01-05',market:'MES',side:'Long',contracts:1,entry:6000,exit:6005,pnl:25,risk:0,setup:'Synthetic',notes:'Do not send',source:{provider:'Tradovate',accountId:'71',contractSymbol:'MESM6',openedAt:selection.openedAt,closedAt:selection.closedAt,timeZone:'UTC',pnlBasis:'gross_before_fees'}};
const styles=[...(await readFile('src/main.tsx','utf8')).matchAll(/import "([^"]+)";/g)].map(m=>m[1]).filter(n=>n.startsWith('@fontsource')||n.endsWith('.css')).map(n=>`import '${n.startsWith('./')?'/src/'+n.slice(2):n}';`).join('\n');
const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{ImportDesk}from'/src/components/ImportDesk.tsx';${styles}
window.fixture={owner:'synthetic-owner',account:'Tradovate:71',epoch:0,calls:[],writes:[],commits:0,delay:false,available:true,connectionId:'synthetic-connection'};
const originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){window.fixture.writes.push(k);return originalSet.call(this,k,v)};
const json=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
window.fetch=async(input,init={})=>{const u=new URL(String(input),location.origin);if(!u.pathname.startsWith('/api/'))throw Error('Unexpected fetch');if(new Headers(init.headers).get('Authorization')!=='Bearer synthetic-session')throw Error('Missing real authenticatedFetch header');window.fixture.calls.push(u.pathname+u.search);if(u.pathname==='/api/rithmic/status')return json({available:false});if(u.pathname==='/api/tradovate/status')return json({available:window.fixture.available,connected:true,provider:'Tradovate',connectionId:window.fixture.connectionId,expiresAt:'2099-01-01T00:00:00Z'});if(u.pathname==='/api/tradovate/sync'&&u.searchParams.get('diagnostic')==='stop-history'){if(init.method!=='GET'||init.credentials!=='include')throw Error('Invalid read-only authenticated request');if(window.fixture.delay)await new Promise(r=>window.fixture.release=r);return json(${JSON.stringify(evidence)});}if(u.pathname==='/api/tradovate/sync'&&u.searchParams.get('history')==='recent')return json({status:'history_ready',provider:'Tradovate',coverage:'bounded_matched_fill_pairs',pnlBasis:'gross_before_fees',window:{startDate:u.searchParams.get('startDate'),endDate:u.searchParams.get('endDate'),timeZone:'UTC',timezoneOffset:0},accounts:[]});throw Error('Unexpected API path')};
function Fixture(){const[revision,setRevision]=useState(0);window.renderFixture=()=>setRevision(r=>r+1);const owner=window.fixture.owner;const prepare=()=>{const epoch=window.fixture.epoch, identity=window.fixture.owner;return{scopeKey:identity,isCurrent:()=>window.fixture.owner===identity&&window.fixture.epoch===epoch,commit:()=>{window.fixture.commits++;throw Error('No import')},commitBroker:()=>{window.fixture.commits++;throw Error('No import')},commitHistory:()=>{window.fixture.commits++;throw Error('No import')}}};return <ImportDesk selectStopHistoryAccount={account=>{window.fixture.account=account;window.fixture.epoch++;window.dispatchEvent(new Event('cova:history-selection'));setRevision(r=>r+1)}} owner={owner} selectedAccount={window.fixture.account} trades={[${JSON.stringify(trade)}]} accounts={['Tradovate:71','Tradovate:72']} entitlements={{canUseDirectSync:true,maxStoredTrades:5000,maxTradesPerImport:5000,plan:'pro'}} importCsv={()=>{window.fixture.commits++;throw Error('No import')}} prepareImportCsv={prepare} openFirmOAuth={()=>{throw Error('No OAuth')}} status='' reset={()=>{throw Error('No reset')}} upgradeToPro={()=>{}}/>}createRoot(document.getElementById('root')).render(<Fixture/>);`;
let server,browser;const errors=[],blocked=[];
try{
server=await createServer({envDir:scratch,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'stop-history-fixture',enforce:'pre',transform(code,id){if(id.endsWith('/src/lib/supabaseClient.ts'))return{code:code.replace('export function getSupabaseClient() {',"export function getSupabaseClient() { return {auth:{getSession:async()=>({data:{session:{access_token:'synthetic-session'}}})}} as any;"),map:null};},resolveId(id){if(id==='/__stop.tsx')return id},load(id){if(id==='/__stop.tsx')return entry},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url!=='/__stop.html')return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body class="oa-dashboard-app"><div id="root"></div><script type="module" src="/__stop.tsx"></script></body></html>'));});}}]});await server.listen();
const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
const executablePath=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';assert(existsSync(executablePath),'Owned Chrome installed');
browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
await page.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();blocked.push(route.request().url());return route.abort()});page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin+'/__stop.html');
await page.getByText('Stop-history check',{exact:true}).waitFor();
await page.waitForFunction(()=>window.fixture.calls.some(c=>c.includes('history=recent')));
await page.waitForFunction(()=>!document.body.innerText.includes('Loading history…'));
assert.equal(await page.getByLabel('Stop-history account').count(),1,'Choose the shared selected account on this screen');
assert.equal(await page.getByLabel('Stop-history account').inputValue(),'Tradovate:71');
const select=page.getByLabel('Closed Tradovate trade');await select.selectOption(selection.tradeId);
const baseline=await page.evaluate(()=>({writes:fixture.writes.length,history:fixture.calls.filter(c=>c.includes('history=recent')).length,stop:fixture.calls.filter(c=>c.includes('diagnostic=stop-history')).length}));assert.equal(baseline.stop,0);
await page.getByRole('button',{name:'Check selected trade'}).click();
await page.getByText('Evidence collected. Planned risk remains unavailable.',{exact:true}).waitFor();
assert.equal(await page.getByRole('button',{name:'Download projected evidence'}).count(),1);
const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download projected evidence'}).click()]);
await download.saveAs(join(output,'synthetic-projected-evidence.json'));
assert.deepEqual(JSON.parse(await readFile(join(output,'synthetic-projected-evidence.json'),'utf8')),evidence);
assert.deepEqual(await page.evaluate(()=>({writes:fixture.writes.length,history:fixture.calls.filter(c=>c.includes('history=recent')).length,stop:fixture.calls.filter(c=>c.includes('diagnostic=stop-history')).length,commits:fixture.commits})),{writes:baseline.writes,history:baseline.history,stop:1,commits:0});
await page.screenshot({path:join(output,'desktop.png'),fullPage:true});
await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
const geometry=await page.getByLabel('Closed Tradovate trade').evaluate(select=>{const box=select.getBoundingClientRect(),panel=select.closest('section').getBoundingClientRect();return {right:box.right,panelRight:panel.right,left:box.left,panelLeft:panel.left}});assert(geometry.right<=geometry.panelRight-12,JSON.stringify(geometry));
await page.screenshot({path:join(output,'mobile.png'),fullPage:true});
// Owner/selection changes while response is withheld must erase the previous preview and reject stale result.
await page.evaluate(()=>{fixture.delay=true});await page.getByRole('button',{name:'Check selected trade'}).click();await page.waitForFunction(()=>typeof fixture.release==='function');
await page.getByLabel('Stop-history account').selectOption('Tradovate:72');await page.evaluate(()=>fixture.release());
await page.waitForFunction(()=>!document.body.innerText.includes('Evidence collected. Planned risk remains unavailable.'));
assert.equal(await page.getByRole('button',{name:'Download projected evidence'}).count(),0);
await page.evaluate(()=>{fixture.account='Tradovate:71';fixture.epoch++;fixture.delay=false;renderFixture()});await select.selectOption(selection.tradeId);
await page.evaluate(()=>{fixture.delay=true;fixture.release=undefined});await page.getByRole('button',{name:'Check selected trade'}).click();await page.waitForFunction(()=>typeof fixture.release==='function');
await page.evaluate(()=>{fixture.owner='another-owner';fixture.epoch++;renderFixture();fixture.release()});
await page.waitForFunction(()=>!document.body.innerText.includes('Checking evidence…'));
assert.equal(await page.getByRole('button',{name:'Download projected evidence'}).count(),0);
assert.equal(await page.evaluate(()=>fixture.commits),0);assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
await writeFile(join(output,'browser-results.json'),JSON.stringify({passed:true,actualImportDesk:true,actualAuthorizedFetch:true,actualHandlerProjectedFixture:true,externalRequests:blocked,errors,noProbeStorageWrites:true,noLedgerCommits:true,staleOwnerAndSelection:true,viewports:[1440,390]},null,2));
console.log('PASS actual ImportDesk: explicit one-trade read, authenticated fetch, preview/download, desktop/mobile, stale owner/selection, no probe ledger/cash/storage writes');
}finally{await browser?.close();await server?.close();await rm(scratch,{recursive:true,force:true});}
