import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {run,selection,definitionsPath,archive,reportPath} from './helpers/tradovate-stop-history-fixture.mjs';
import {details} from './helpers/tradovate-historical-csv-fixture.mjs';
test('client binds opaque detail reports to reparsed selected identity and exact candidate membership',async()=>{
  const lib=await load(),selected=lib.stopHistorySelection({...trade,source:{...trade.source,contractSymbol:undefined}},'Tradovate:71');
  const output=(await details()).res.body;
  assert.equal(lib.validateStopEvidence(output,selected),output);
  for(const options of [{change(d){d.fills[0]._accountId='72'}},{mutate(d){d[definitionsPath].reports.pop()}}]){
    const unavailable=(await details(options)).res.body;assert.equal(lib.validateStopEvidence(unavailable,selected),unavailable);
  }
  const changes=[
    f=>f.extra='unreviewed',f=>f.status='partial',f=>f.reason='private',f=>delete f.identity,
    f=>f.acceptanceSemantics='verified',f=>f.coverage='complete',f=>f.protectiveLinkage='verified',
    f=>f.identity.contractId='82',f=>f.identity.contractSymbol='MESU6',f=>f.identity.entryOrderId='104',
    f=>f.identity.buyFillId='503',f=>f.identity.openedAt='2026-01-05T10:01:00.999999999Z',f=>f.identity.orderCount++,
    f=>f.identity.extra='unreviewed',f=>f.identity.candidateOrderIds[0]='104',f=>f.identity.candidateOrderIds.push('101'),
    f=>f.reports.pop(),f=>f.reports.push(f.reports[0]),f=>f.reports[1].orderId='103',f=>f.reports[0].orderId='104',
    f=>f.reports[3].orderId='103',f=>f.reports[3].name='Order Details',f=>f.reports[0].name='Orders',
    f=>f.reports[0].status='empty',f=>f.reports[0].textBytes++,f=>f.reports[0].extra='unreviewed',
    f=>{f.reports[0].text='';f.reports[0].textBytes=0},f=>{f.reports[0].text='<script>bad</script>';f.reports[0].textBytes=20},
  ];
  for(const change of changes){const bad=structuredClone(output);change(bad.mismatch.historicalEvidence.followup);assert.throws(()=>lib.validateStopEvidence(bad,selected),/inconsistent/);}
  for(const change of [v=>v.mismatch.historicalEvidence.reports[0].text=v.mismatch.historicalEvidence.reports[0].text.replace('DEMO-SYNTHETIC','OTHER-SYNTHETIC'),v=>v.mismatch.reportDefinitions.reports.pop(),v=>v.mismatch.historicalEvidence.provenance.account.id='72']){
    const bad=structuredClone(output);change(bad);assert.throws(()=>lib.validateStopEvidence(bad,selected),/inconsistent/);
  }
  const probe=new lib.StopHistoryProbe(async url=>json(url==='/api/tradovate/status'?{available:true,connected:true,connectionId:selection.connectionId}:output));
  probe.update({owner:'synthetic-owner',connectionId:selection.connectionId,accountKey:'Tradovate:71',selection:selected});assert.deepEqual(await probe.check(()=>true),output);
});

test('client accepts opaque archive text only with closed exact selected-account and UTC-window provenance',async()=>{
  const lib=await load(),selected=lib.stopHistorySelection({...trade,source:{...trade.source,contractSymbol:undefined}},'Tradovate:71');
  const output=(await archive()).res.body;
  assert.equal(lib.validateStopEvidence(output,selected),output);
  const empty=(await archive({mutate(d){d[reportPath]={data:' \r\n'}}})).res.body;
  assert.equal(lib.validateStopEvidence(empty,selected),empty);
  for(const options of [{mutate(d){d[definitionsPath].reports=[]}},{response:{[reportPath]:()=>json({error:'synthetic failure'})}}]){
    const failure=(await archive(options)).res.body;assert.equal(lib.validateStopEvidence(failure,selected),failure);
  }
  const mutations=[
    v=>v.extra='unreviewed',v=>v.status='partial',v=>v.reason='private',v=>delete v.reports,
    v=>v.provenance.extra='unreviewed',v=>v.provenance.source='validated_rows',
    v=>v.provenance.account.id='72',v=>v.provenance.account.name='',v=>v.provenance.account.name=' padded ',
    v=>v.provenance.account.name='x'.repeat(129),v=>v.provenance.account.extra='unreviewed',
    v=>v.provenance.tradeId='tradovate-71:503:504',v=>v.provenance.openedAt='2026-01-05T10:02:00.000000000Z',
    v=>v.provenance.closedAt='2026-01-05T10:10:00.000000000Z',v=>delete v.provenance.closedAt,
    v=>v.provenance.representationType='html',v=>v.provenance.schema='verified',v=>v.provenance.rowIdentity='verified',v=>v.provenance.coverage='complete',
    v=>v.provenance.window.startDate='2026-01-04',v=>v.provenance.window.endDate='2026-01-07',
    v=>v.provenance.window.startTime='01:00:00',v=>v.provenance.window.endTime='23:59:59',
    v=>v.provenance.window.timeZone='America/New_York',v=>v.provenance.window.timezoneOffset=-300,
    v=>v.provenance.window.endExclusive=false,v=>v.provenance.window.extra='unreviewed',
    v=>v.reports.pop(),v=>v.reports.push(v.reports[0]),v=>v.reports[1].name='Orders',
    v=>v.reports[0].name='Order Details',v=>v.reports[0].extra='unreviewed',v=>delete v.reports[0].textBytes,
    v=>v.reports[0].status='empty',v=>v.reports[0].status='accepted',v=>v.reports[0].textBytes++,
    v=>v.reports[0].text=42,v=>{v.reports[0].text='x'.repeat(131073);v.reports[0].textBytes=131073},
    v=>{v.reports[0].text='<html>bad</html>';v.reports[0].textBytes=16},
  ];
  for(const mutate of mutations){const bad=structuredClone(output);mutate(bad.mismatch.historicalEvidence);assert.throws(()=>lib.validateStopEvidence(bad,selected),/inconsistent/);}
  for(const mutate of [v=>v.mismatch.stage='trade-crosscheck',v=>v.mismatch.counts.accountOrders=1,v=>v.mismatch.reportDefinitions={status:'unavailable',reason:'upstream_rejected'},v=>v.mismatch.reportDefinitions.reports.pop(),v=>v.mismatch.reportDefinitions.reports[1].params[0].paramType='TEXT']){
    const bad=structuredClone(output);mutate(bad);assert.throws(()=>lib.validateStopEvidence(bad,selected),/inconsistent/);
  }
  for(const value of [{status:'unavailable',reason:'private'},{status:'unavailable',reason:'upstream_rejected',reports:[]},{status:'unavailable',reason:'upstream_rejected',provenance:{}}]){
    const bad=structuredClone(output);bad.mismatch.historicalEvidence=value;assert.throws(()=>lib.validateStopEvidence(bad,selected),/inconsistent/);
  }
  const probe=new lib.StopHistoryProbe(async url=>json(url==='/api/tradovate/status'?{available:true,connected:true,connectionId:selection.connectionId}:output));
  probe.update({owner:'synthetic-owner',connectionId:selection.connectionId,accountKey:'Tradovate:71',selection:selected});
  assert.deepEqual(await probe.check(()=>true),output);
});

test('late archived evidence is revoked for changed owner connection account or trade',async()=>{
  const lib=await load(),output=(await archive()).res.body;
  const selected=lib.stopHistorySelection({...trade,source:{...trade.source,contractSymbol:undefined}},'Tradovate:71');
  for(const stage of ['status','evidence'])for(const change of ['owner','connectionId','accountKey','selection']){
    let release;const wait=new Promise(r=>release=r),calls=[];
    const context={owner:'synthetic-owner',connectionId:selection.connectionId,accountKey:'Tradovate:71',selection:selected};
    const probe=new lib.StopHistoryProbe(async(url,init)=>{
      calls.push({url,init});if((stage==='status')===(url==='/api/tradovate/status'))await wait;
      return json(url==='/api/tradovate/status'?{available:true,connected:true,connectionId:context.connectionId}:output);
    });
    probe.update(context);const pending=probe.check(()=>true),rejected=assert.rejects(pending,e=>e.name==='AbortError');
    if(stage==='evidence')while(calls.length<2)await new Promise(r=>setTimeout(r,0));
    probe.update({...context,[change]:change==='selection'?{...selected,tradeId:'tradovate-71:503:504'}:'other'});
    probe.update(context);release();await rejected;
    assert(calls.every(c=>c.init.signal.aborted));assert.equal(calls.length,stage==='status'?1:2);
  }
});

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
    const text=readFileSync(new URL(`../src/lib/${name}.ts`,import.meta.url),'utf8').replaceAll('"./risk"','"./risk.mjs"').replaceAll('"./tradovateHistory"','"./tradovateHistory.mjs"').replaceAll('"../../api/_lib/tradovate-historical-identity.js"',JSON.stringify(new URL('../api/_lib/tradovate-historical-identity.js',import.meta.url).href));
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
