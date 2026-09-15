import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { parsePerformanceReport } from '../api/_lib/tradovate-performance.js';
const dir=mkdtempSync(join(tmpdir(),'cova-history-client-'));
try {
  const file=new URL('../src/lib/tradovateHistory.ts',import.meta.url);
  assert(existsSync(file),'Guarded recent-history client must exist');
  for(const name of ['risk','tradovateHistory']) {
    const source=readFileSync(new URL(`../src/lib/${name}.ts`,import.meta.url),'utf8').replace('"./risk"','"./risk.mjs"');
    writeFileSync(join(dir,`${name}.mjs`),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
  }
  const lib=await import(pathToFileURL(join(dir,'tradovateHistory.mjs')).href);
  const risk=await import(pathToFileURL(join(dir,'risk.mjs')).href);
  const raw='symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration\nNQZ6,-2,0,0.25,101,102,1,20000,20001,$20.00,11/02/2026 00:00:00,11/02/2026 00:00:10,10sec\n';
  const utc= parsePerformanceReport(raw,'71',{startDate:'2026-11-01',endDate:'2026-11-03',timeZone:'UTC',timezoneOffset:0});
  const clientTrade=risk.parseCsvDetailed(utc.csv).trades[0];
  assert.equal(clientTrade.source.openedAt,'2026-11-02T00:00:00.000Z');
  assert.equal(clientTrade.source.closedAt,'2026-11-02T00:00:10.000Z');
  assert.equal(clientTrade.date,'2026-11-02','legacy calendar date is preserved');
  const late={...clientTrade,id:'late',source:{...clientTrade.source,closedAt:'2026-11-02T23:00:00.000Z'}};
  assert.deepEqual(risk.analyze([late,clientTrade],risk.defaultRules).trades.map(t=>t.id),[clientTrade.id,'late']);
  const csv=utc.csv;
  const data={status:'history_ready',provider:'Tradovate',coverage:'bounded_matched_fill_pairs',window:{startDate:'2026-11-01',endDate:'2026-11-03',timeZone:'UTC',timezoneOffset:0},pnlBasis:'gross_before_fees',accounts:[{account:{id:'71',name:'Synthetic A'},status:'ready',...utc}]};
  const result=lib.validateTradovateHistory(data);
  assert.equal(result.accountId,'71');assert.equal(result.count,1);
  for (const [before,after] of [['20000,20001','oops,20001'],[',Long,',',Whatever,'],[',20,0,',',20,99,'],['.000Z','.000'],['sourceOpenedAt','unknown'],['tradovate-71:101:102','tradovate-71:foo']]) {
    assert.throws(()=>lib.validateTradovateHistory({...data,accounts:[{...data.accounts[0],csv:csv.replace(before,after)}]}),before);
  }
  assert.throws(()=>lib.validateTradovateHistory({...data,accounts:[{...data.accounts[0],trades:[{...utc.trades[0],pnl:999}]}]}));
  assert.throws(()=>lib.validateTradovateHistory(data,'72'),'selected account mismatch');
  for(const change of [{pnlBasis:'net'},{window:{...data.window,timeZone:'America/New_York'}},{accounts:[{...data.accounts[0],account:{id:'72',name:'Synthetic B'}}]},{accounts:[data.accounts[0],data.accounts[0]]},{accounts:[{...data.accounts[0],counts:{trades:2}}]}])assert.throws(()=>lib.validateTradovateHistory({...data,...change}));
  const {mergeTradeLedger,analyze,defaultRules}=await import(pathToFileURL(join(dir,'risk.mjs')).href);
  const other={...result.trades[0],id:'other',pnl:500,source:undefined,notes:'older annotation'};
  const merged=mergeTradeLedger([other],result.trades);
  assert.equal(analyze(lib.filterTradeAccount(merged.trades,'Tradovate:71'),defaultRules).totalPnl,20);
  assert.equal(lib.filterTradeAccount(merged.trades,'local')[0].notes,'older annotation');
  const race=new lib.HistoryRunGuard();const first=race.start();const second=race.start();assert.equal(first.isCurrent(),false);assert.equal(first.signal.aborted,true);assert.equal(second.isCurrent(),true);race.cancel();assert.equal(second.isCurrent(),false);
  assert.deepEqual(lib.recentHistoryWindow(new Date('2026-11-02T00:00:00Z')),{startDate:'2026-10-04',endDate:'2026-11-03'});
  assert.equal(typeof lib.fetchHistoryJson,'function','bounded response reader');
  assert.deepEqual(await lib.fetchHistoryJson(async()=>new Response('{"ok":true}',{headers:{'content-type':'application/json'}}),'/fixture',new AbortController().signal),{ok:true});
  let canceled=false;
  const oversized=new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024));},cancel(){canceled=true;}}),{headers:{'content-type':'application/json'}});
  await assert.rejects(lib.fetchHistoryJson(async()=>oversized,'/fixture',new AbortController().signal,100,2048),/limit/);assert(canceled);
  await assert.rejects(lib.fetchHistoryJson(()=>new Promise(()=>{}),'/fixture',new AbortController().signal,10),/timed out/);
  await assert.rejects(lib.fetchHistoryJson(async()=>new Response('{"status":"unsupported_environment"}',{headers:{'content-type':'application/json'}}),'/fixture',new AbortController().signal),/Simulation/);
  const epoch=new lib.HistorySelectionEpoch();const initial=epoch.capture();epoch.change();epoch.change();assert.equal(initial(),false,'A to B to A invalidates old commit');
  lib.saveHistorySummary('owner-a','connection-a',{accounts:data.accounts,notice:'failed',outcome:'failed',attempted:['range']});
  assert.equal(lib.readHistorySummary('owner-a','connection-a').outcome,'failed');
  assert.equal(lib.readHistorySummary('owner-b','connection-a'),null);
  assert.equal(lib.readHistorySummary('owner-a','connection-b'),null);
  assert.equal(lib.readHistorySummary('owner-a','connection-a').accounts[0].csv,undefined,'no report copy in cache');
  console.log('Tradovate client: strict envelopes, account stats, UTC window and cancellation passed');
} finally {rmSync(dir,{recursive:true,force:true});}
