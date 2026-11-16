import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {run,selection,definitionsPath} from './helpers/tradovate-stop-history-fixture.mjs';

test('client accepts the actual-handler mismatch projection only through a closed bounded nested schema',async()=>{
  const lib=await load(),selected=lib.stopHistorySelection(trade,'Tradovate:71');
  const output=(await run({omitQuery:['contractSymbol'],mutate(d){
    d['/fill/deps?masterid=102']=[];
    d[definitionsPath]=[{name:'SyntheticArchive',label:'Synthetic order archive',params:[{name:'account',paramType:'accounts',optional:false}]}];
  }})).res.body;
  assert.equal(lib.validateStopEvidence(output,selected),output);
  const crosscheck=(await run({mutate(d){d['/fill/deps?masterid=101'][0].price=5999}})).res.body;
  assert.equal(lib.validateStopEvidence(crosscheck,selected).mismatch.stage,'trade-crosscheck');
  const unavailable=structuredClone(output);unavailable.mismatch.reportDefinitions={status:'unavailable',reason:'upstream_rejected'};
  assert.equal(lib.validateStopEvidence(unavailable,selected),unavailable);
  for(const reason of ['trade_mismatch','timeout','foreign_edge'])assert.equal(lib.validateStopEvidence({diagnostic:'tradovate-stop-history-v1',status:'unavailable',reason,plannedRisk:'unavailable'},selected).reason,reason);
  const mutations=[
    v=>v.mismatch.extra='private',v=>v.mismatch.stage='guessed-archive',v=>delete v.mismatch.stage,
    v=>v.mismatch.counts.extra=1,v=>delete v.mismatch.counts.fills,
    v=>v.mismatch.counts.accountOrders=4001,v=>v.mismatch.counts.discoveryOrders=25,
    v=>v.mismatch.counts.accountOrders=1,v=>v.mismatch.counts.fills=4001,
    v=>v.mismatch.counts.fills=-1,v=>v.mismatch.counts.fills=1.5,v=>v.mismatch.counts.fills='1',
    v=>v.mismatch.counts.matchedFillIds=3,v=>v.mismatch.counts.fills=0,
    v=>v.mismatch.reportDefinitions.extra='private',v=>v.mismatch.reportDefinitions.status='accepted',
    v=>v.mismatch.reportDefinitions.reason='provider_error',v=>delete v.mismatch.reportDefinitions.reports,
    v=>v.mismatch.reportDefinitions.reports=Array(257).fill(v.mismatch.reportDefinitions.reports[0]),
    v=>v.mismatch.reportDefinitions.reports[0].fields=['private'],
    v=>v.mismatch.reportDefinitions.reports[0].name='x'.repeat(129),v=>v.mismatch.reportDefinitions.reports[0].name='',
    v=>v.mismatch.reportDefinitions.reports[0].label=' bad ',v=>v.mismatch.reportDefinitions.reports[0].label='bad\nlabel',
    v=>v.mismatch.reportDefinitions.reports[0].params=Array(33).fill({name:'x',paramType:'String',optional:true}),
    v=>v.mismatch.reportDefinitions.reports[0].params[0].extra='private',
    v=>v.mismatch.reportDefinitions.reports[0].params[0].optional='false',
    v=>delete v.mismatch.reportDefinitions.reports[0].params[0].optional,
    v=>v.mismatch.reportDefinitions.reports[0].params[0].paramType='x'.repeat(129),
    v=>v.mismatch.reportDefinitions.reports[0].params.push({...v.mismatch.reportDefinitions.reports[0].params[0]}),
    v=>v.reason='foreign_edge',v=>v.selection={},v=>v.mismatch=null,
    v=>v.mismatch.reportDefinitions={status:'unavailable',reason:'private-provider-error'},
    v=>v.mismatch.reportDefinitions={status:'unavailable',reason:'upstream_rejected',reports:[]},
  ];
  for(const mutate of mutations){const bad=structuredClone(output);mutate(bad);assert.throws(()=>lib.validateStopEvidence(bad,selected),/inconsistent/);}
  const collected=(await run()).res.body;collected.mismatch=output.mismatch;
  assert.throws(()=>lib.validateStopEvidence(collected,selected),/inconsistent/);
  const context={owner:'synthetic-owner',connectionId:'synthetic-connection',accountKey:'Tradovate:71',selection:selected};
  const client=new lib.StopHistoryProbe(async url=>json(url==='/api/tradovate/status'?{available:true,connected:true,connectionId:context.connectionId}:output));
  client.update(context);assert.deepEqual(await client.check(()=>true),output);
});

const trade={id:selection.tradeId,date:'2026-01-05',market:'MES',side:'Long',contracts:1,entry:6000,exit:6005,pnl:25,risk:0,setup:'Synthetic',notes:'Not sent',source:{provider:'Tradovate',accountId:'71',contractSymbol:'MESM6',openedAt:selection.openedAt,closedAt:selection.closedAt,timeZone:'UTC',pnlBasis:'gross_before_fees'}};
let lib,dir;
async function load(){
  if(lib)return lib;
  const source=new URL('../src/lib/tradovateStopHistory.ts',import.meta.url);
  assert(existsSync(source),'Single-trade read-only client must exist');
  dir=mkdtempSync(join(tmpdir(),'cova-stop-client-'));
  for(const name of ['risk','tradovateHistory','tradovateStopHistory']) {
    const text=readFileSync(new URL(`../src/lib/${name}.ts`,import.meta.url),'utf8').replaceAll('"./risk"','"./risk.mjs"').replaceAll('"./tradovateHistory"','"./tradovateHistory.mjs"');
    writeFileSync(join(dir,`${name}.mjs`),ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
  }
  lib=await import(pathToFileURL(join(dir,'tradovateStopHistory.mjs')).href);return lib;
}
test.after(()=>{if(dir)rmSync(dir,{recursive:true,force:true})});

test('A01 existing 17-column legacy trade resolves full expiry by exact fills transiently',async()=>{
  const lib=await load();
  const {parseCsvDetailed}=await import(pathToFileURL(join(dir,'risk.mjs')).href);
  const header='date,market,side,contracts,entry,exit,pnl,risk,setup,notes,sourceProvider,sourceAccountId,sourceTradeId,sourceOpenedAt,sourceClosedAt,sourceTimeZone,sourcePnlBasis';
  const csv=header+'\n'+[selection.closedAt,'WRONGROOT','Long',1,6000,6005,25,0,'Imported','','Tradovate','71',selection.tradeId,selection.openedAt,selection.closedAt,'UTC','gross_before_fees'].join(',');
  const parsed=parseCsvDetailed(csv);assert.deepEqual(parsed.issues,[]);
  const saved=parsed.trades[0],before=JSON.stringify(saved),selected=lib.stopHistorySelection(saved,'Tradovate:71');
  assert(selected,'Legacy account + exact fill IDs are sufficient for transient resolution');
  assert.equal(selected.contractSymbol,undefined);
  const calls=[];
  const probe=new lib.StopHistoryProbe(async(url)=>{
    calls.push(url);if(url==='/api/tradovate/status')return json({available:true,connected:true,connectionId:selection.connectionId});
    const query=Object.fromEntries(new URL(url,'https://synthetic.invalid').searchParams);assert(!Object.hasOwn(query,'contractSymbol'));
    return json((await run({query,omitQuery:['contractSymbol']})).res.body);
  });
  probe.update({owner:'owner',connectionId:selection.connectionId,accountKey:'Tradovate:71',selection:selected});
  const evidence=await probe.check(()=>true);
  assert.equal(evidence.status,'collected');assert.equal(evidence.selection.contractSymbol,'MESM6');assert.equal(JSON.stringify(saved),before);assert.equal(calls.length,2);
  for(const mutate of [d=>d['/fill/deps?masterid=101'][0].contractId=82,d=>d['/fill/deps?masterid=102'][0].accountId=72,d=>d['/fill/deps?masterid=101'][0].price=6001,d=>d['/fill/deps?masterid=102'][0].qty=0,d=>d['/fill/deps?masterid=101'][0].timestamp=selection.closedAt,d=>d['/fill/deps?masterid=101'][0].action='Sell',d=>d['/contract/item?id=81'].name='MES',d=>d['/fill/deps?masterid=102'][0].id=503]){
    const bad=await run({omitQuery:['contractSymbol'],mutate});assert.equal(bad.res.body.status,'unavailable');
  }
});
const json=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});

test('pending client reads abort on owner, connection or selection changes including A to B to A',async()=>{
  const lib=await load(), output=(await run()).res.body, selected=lib.stopHistorySelection(trade,'Tradovate:71');
  for(const stage of ['status','diagnostic'])for(const change of ['owner','connectionId','accountKey','selection']){
    let resolveWait;const wait=new Promise(resolve=>resolveWait=resolve), calls=[];
    const context={owner:'synthetic-owner',connectionId:'synthetic-connection',accountKey:'Tradovate:71',selection:selected};
    const client=new lib.StopHistoryProbe(async(url,init)=>{calls.push({url,init});if((stage==='status')===(url==='/api/tradovate/status'))await wait;return json(url==='/api/tradovate/status'?{available:true,connected:true,connectionId:context.connectionId}:output)});
    client.update(context);const pending=client.check(()=>true);const rejected=assert.rejects(pending,e=>e.name==='AbortError');
    if(stage==='diagnostic')while(calls.length<2)await new Promise(r=>setTimeout(r,0));
    client.update({...context,[change]:change==='selection'?{...selected,tradeId:'tradovate-71:503:504'}:'other'});client.update(context);
    resolveWait();await rejected;assert(calls.every(c=>c.init.signal.aborted));
    assert.equal(calls.length,stage==='status'?1:2);
  }
});

test('client rejects stale captured principal, mismatched connection, unsafe projection and double clicks',async()=>{
  const lib=await load(), output=(await run()).res.body, selected=lib.stopHistorySelection(trade,'Tradovate:71');
  const context={owner:'synthetic-owner',connectionId:'synthetic-connection',accountKey:'Tradovate:71',selection:selected};
  let calls=0,current=true,release;const wait=new Promise(r=>release=r);
  const client=new lib.StopHistoryProbe(async()=>{calls++;await wait;return json({available:true,connected:true,connectionId:context.connectionId})});client.update(context);
  const first=client.check(()=>current);await assert.rejects(client.check(()=>true),/already running/);current=false;release();await assert.rejects(first,e=>e.name==='AbortError');assert.equal(calls,1);
  const stale=new lib.StopHistoryProbe(async()=>json({available:true,connected:true,connectionId:'another-connection'}));stale.update(context);await assert.rejects(stale.check(()=>true),/connection changed/);
  for(const mutate of [v=>v.extra='private-secret',v=>v.reason='private-secret',v=>v.orders[0].accountId='72',v=>v.fills[0].contractId='82',v=>v.timeline[0].fact='accepted',v=>v.selection.tradeId='tradovate-71:1:2',v=>v.commandReports[0].text='private-secret']){
    const bad=structuredClone(output);mutate(bad);assert.throws(()=>lib.validateStopEvidence(bad,selected),/inconsistent/);
  }
  for(const change of [{id:'tradovate-071:501:502'},{source:{...trade.source,contractSymbol:'MES'}},{source:{...trade.source,openedAt:trade.source.closedAt}},{source:{...trade.source,provider:'Rithmic'}},{contracts:0}])assert.equal(lib.stopHistorySelection({...trade,...change},'Tradovate:71'),null);
});

test('client performs an explicit selected-trade check against actual-handler projected records only',async()=>{
  const lib=await load(), output=(await run()).res.body;
  const context={owner:'synthetic-owner',connectionId:'synthetic-connection',accountKey:'Tradovate:71',selection:lib.stopHistorySelection(trade,'Tradovate:71')};
  assert(context.selection);
  const calls=[];
  const client=new lib.StopHistoryProbe(async(url,init)=>{
    calls.push({url,init});
    if(url==='/api/tradovate/status')return json({available:true,connected:true,connectionId:context.connectionId});
    const q=new URL(url,'https://cova.invalid').searchParams;
    for(const [key,value] of Object.entries(selection))assert.equal(q.get(key),value);
    return json(output);
  });
  client.update(context);
  assert.equal(calls.length,0,'No auto-check on selection');
  const evidence=await client.check(()=>true);
  assert.equal(evidence.status,'collected');assert.equal(evidence.timeline[0].stopPrice,5990);
  assert.equal(calls.length,2);assert(calls.every(c=>c.init.method==='GET'));
  assert.doesNotMatch(JSON.stringify(evidence),/Not sent|notes|setup|riskOwner|credentials/);
  assert.equal(lib.stopHistorySelection(trade,'Tradovate:72'),null);
});
