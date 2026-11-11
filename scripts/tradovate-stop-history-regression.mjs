import test from 'node:test';
import assert from 'node:assert/strict';
import {run, selection, at, fixtures} from './helpers/tradovate-stop-history-fixture.mjs';

test('actual owner-authorized handler collects one synthetic closed-trade price timeline without writes',async()=>{
  const {res,provider,releases}=await run();
  assert.equal(res.statusCode,200);assert.equal(res.body.status,'collected');
  assert.equal(res.body.selection.tradeId,selection.tradeId);
  assert.equal(res.body.orders.length,3);assert.equal(res.body.fills.length,2);
  assert.equal(res.body.timeline[0].stopPrice,5990);
  assert.equal(res.body.timeline[0].fact,'working_reported');
  assert.equal(res.body.timeline[1].fact,'submitted');
  assert.equal(res.body.commandVersionJoin,'observed_native_client');
  assert.equal(res.body.acceptanceSemantics,'unverified');assert.equal(res.body.archivalCompleteness,'unverified');
  assert.equal(res.body.plannedRisk,'unavailable');
  assert(provider.length>10);assert.equal(releases,1);
  assert(provider.every(c=>c.init.signal.aborted));
});

test('rejections and unknown joins never turn submitted UI statuses into acceptance',async()=>{
  const rejected=await run({mutate(d){d['/commandReport/deps?masterid=302']=[{id:402,commandId:302,timestamp:at('05'),commandStatus:'ExecutionRejected'}]}});
  assert.equal(rejected.res.body.timeline[1].fact,'rejected');
  const conflict=await run({mutate(d){d['/commandReport/deps?masterid=301'][0].commandStatus='RiskRejected'}});
  assert.equal(conflict.res.body.timeline[0].fact,'unknown');
  const missing=await run({mutate(d){d['/orderVersion/deps?masterid=103']=[]}});
  assert.equal(missing.res.body.timeline[0].fact,'unknown');
  const submission=await run({mutate(d){d['/executionReport/deps?masterid=301']=[]}});
  assert.equal(submission.res.body.timeline[0].fact,'submitted');
  assert.equal(submission.res.body.acceptanceSemantics,'unverified');
});

test('candidate lifetime scope removes an earlier terminated unrelated order and post-close modifications',async()=>{
  const scoped=await run({mutate(d){
    d['/order/deps?masterid=71'].push({id:104,accountId:71,contractId:81,action:'Sell',timestamp:'2026-01-04T10:00:00Z',ordStatus:'Canceled'});
    d['/fill/deps?masterid=104']=[];
    d['/command/deps?masterid=104']=[{id:304,orderId:104,timestamp:'2026-01-04T10:01:00Z',commandType:'Cancel',commandStatus:'AtExecution'}];
    d['/orderVersion/deps?masterid=104']=[];
    d['/commandReport/deps?masterid=304']=[];
    d['/executionReport/deps?masterid=304']=[{id:604,commandId:304,orderId:104,accountId:71,contractId:81,timestamp:'2026-01-04T10:02:00Z',action:'Sell',execType:'Canceled',ordStatus:'Canceled'}];
    d['/command/deps?masterid=103'].push({id:305,orderId:103,timestamp:at('10'),commandType:'Modify',commandStatus:'AtExecution'});
    d['/orderVersion/deps?masterid=103'].push({id:305,orderId:103,orderType:'Stop',orderQty:1,stopPrice:6001});
  }});
  assert.equal(scoped.res.body.status,'collected');
  assert.deepEqual(scoped.res.body.orders.map(o=>o.id),['101','102','103']);
  assert.equal(scoped.res.body.commands.some(c=>['304','305'].includes(c.id)),false);
  assert.equal(scoped.res.body.executionReports.some(r=>r.id==='604'),false);
  assert.equal(scoped.res.body.versions.some(v=>v.id==='305'),false);
});

test('orders created after the exact closing fill are not exported',async()=>{
  const r=await run({mutate(d){
    d['/order/deps?masterid=71'].push({id:104,accountId:71,contractId:81,action:'Buy',timestamp:'2026-01-05T10:09:00.900Z',ordStatus:'Working'});
    for(const type of ['fill','command','orderVersion'])d[`/${type}/deps?masterid=104`]=[];
  }});
  assert.equal(r.res.body.status,'collected');assert.equal(r.res.body.orders.some(o=>o.id==='104'),false);
});

test('a rejected pre-entry modification does not end an existing working order lifetime',async()=>{
  const r=await run({mutate(d){
    d['/order/deps?masterid=71'][2].timestamp='2026-01-04T10:00:00Z';
    d['/command/deps?masterid=103'][0].timestamp='2026-01-04T10:00:00Z';
    d['/executionReport/deps?masterid=301'][0].timestamp='2026-01-04T10:00:01Z';
    d['/command/deps?masterid=103'][1].timestamp='2026-01-04T10:00:02Z';
    d['/commandReport/deps?masterid=301']=[];
    d['/executionReport/deps?masterid=302']=[{...d['/executionReport/deps?masterid=301'][0],id:602,commandId:302,timestamp:'2026-01-04T10:00:03Z',execType:'Rejected',ordStatus:'Working'}];
  }});
  assert.equal(r.res.body.status,'collected');assert(r.res.body.orders.some(o=>o.id==='103'));assert.equal(r.res.body.timeline[1].fact,'rejected');
});

test('equal command/version IDs on different orders are a contradictory join',async()=>{
  const r=await run({mutate(d){d['/orderVersion/deps?masterid=101']=[{id:301,orderId:101,orderType:'Stop',orderQty:1,stopPrice:5990}];d['/orderVersion/deps?masterid=103']=[]}});
  assert.equal(r.res.body.reason,'contradictory_version_join');
});

test('raw subsecond fills resolve exact IDs against second-resolution Performance timestamps',async()=>{
  const r=await run({mutate(d){
    d['/fill/deps?masterid=101'][0].timestamp='2026-01-05T10:01:00.1234567Z';
    d['/fill/deps?masterid=102'][0].timestamp='2026-01-05T10:09:00.750Z';
    d['/command/deps?masterid=103'][1].timestamp='2026-01-05T10:09:00.500Z';
  }});
  assert.equal(r.res.body.status,'collected');
  assert.equal(r.res.body.lifetime.openedAt,'2026-01-05T10:01:00.123456700Z');
  assert.equal(r.res.body.lifetime.closedAt,'2026-01-05T10:09:00.750000000Z');
  assert.equal(r.res.body.commands.length,2);
  assert.equal(r.res.body.timestampCrosscheck,'fill_ids_plus_report_second');
});

test('account, contract and dependency edges are checked at every collection',async()=>{
  for(const [path,key,value] of [
    ['/order/deps?masterid=71','accountId',72],['/fill/deps?masterid=101','contractId',82],['/fill/deps?masterid=101','orderId',102],
    ['/command/deps?masterid=103','orderId',101],['/orderVersion/deps?masterid=103','orderId',101],
    ['/commandReport/deps?masterid=301','commandId',302],['/executionReport/deps?masterid=301','commandId',302],
    ['/executionReport/deps?masterid=301','accountId',72],['/executionReport/deps?masterid=301','contractId',82],['/executionReport/deps?masterid=301','orderId',101],
  ]) {
    const r=await run({mutate(d){d[path][0][key]=value}});assert.equal(r.res.body.reason,'foreign_edge',`${path} ${key}`);assert.equal(r.res.body.orders,undefined);
  }
  for(const mutate of [d=>d['/account/list']=[{id:72}],d=>d['/contract/item?id=81'].name='MESU6',d=>d['/fill/deps?masterid=101'][0].price=5999,d=>d['/fill/deps?masterid=101'][0].active=false]) {
    const r=await run({mutate});assert.equal(r.res.body.status,'unavailable');assert.equal(r.res.body.orders,undefined);
  }
});

test('duplicate identity keys are rejected rather than overwritten by JSON parsing',async()=>{
  const r=await run({response:{'/account/list':()=>new Response('[{"id":72,"id":71}]',{headers:{'content-type':'application/json'}})}});
  assert.equal(r.res.body.reason,'duplicate_json_key');assert.equal(r.provider.length,1);
});

test('literal IDs reject malformed tokens while int64 JSON identifiers remain lossless',async()=>{
  for(const accountId of ['071','71.0','7.1e1',' 71','71 ','+71','-71','0','9223372036854775808','9007199254740993oops',['71']]){
    const r=await run({query:{accountId}});assert.equal(r.res.body.status,'unavailable');assert.equal(r.provider.length,0);
  }
  for(const raw of ['71.0','7.1e1','-71','0','9223372036854775808']){
    const r=await run({response:{'/account/list':()=>new Response(`[{"id":${raw}}]`,{headers:{'content-type':'application/json'}})}});assert.equal(r.res.body.reason,'invalid_id');
  }
  const r=await run({query:{tradeId:'tradovate-71:9007199254740993:502'},response:{'/fill/deps?masterid=101':()=>new Response('[{"id":9007199254740993,"orderId":101,"contractId":81,"action":"Buy","timestamp":"2026-01-05T10:01:00Z","qty":1,"price":6000,"active":true}]',{headers:{'content-type':'application/json'}})}});
  assert.equal(r.res.body.status,'collected');assert.equal(r.res.body.fills[0].id,'9007199254740993');assert.equal(r.res.body.selection.buyFillId,'9007199254740993');
});

test('authorization, expiration and exact connection guard precede provider reads',async()=>{
  for(const [options,status] of [[{anonymous:true},401],[{plan:'free'},403],[{wrongOwner:true},404],[{expired:true},404],[{query:{connectionId:'stale-connection'}},409],[{query:{connectionId:undefined}},409]]) {
    const r=await run(options);assert.equal(r.res.statusCode,status);assert.equal(r.provider.length,0);
  }
});

test('Demo gate and fixed routes never follow redirects or fall back to Live',async()=>{
  for(const base of ['https://live.tradovateapi.com/v1','https://demo.tradovateapi.com.attacker.invalid/v1','https://user@demo.tradovateapi.com/v1','https://demo.tradovateapi.com/v1?extra','invalid']){
    const r=await run({base});assert.equal(r.res.body.reason,'unsupported_environment');assert.equal(r.provider.length,0);
  }
  for(const status of [302,401,403,500]) {
    const r=await run({response:{'/order/deps?masterid=71':()=>new Response('private-provider-string',{status,headers:{location:'https://live.tradovateapi.com/v1/order/list'}})}});assert.equal(r.res.body.reason,'upstream_rejected');assert.equal(r.provider.length,2);
  }
  for(const status of [404,405]){
    const r=await run({response:{'/commandReport/deps?masterid=301':()=>new Response(null,{status})}});assert.equal(r.res.body.status,'collected');assert.deepEqual(r.res.body.unsupportedCommandReports,['301']);
  }
});

test('stream bytes, rows, orders, contract count and total time are bounded',async()=>{
  for(const response of [()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'262145'}}),()=>new Response(' '.repeat(262145),{headers:{'content-type':'application/json'}})]){
    const r=await run({response:{'/order/deps?masterid=71':response}});assert.equal(r.res.body.reason,'byte_limit');assert.equal(r.releases,1);
  }
  const rows=await run({mutate(d){d['/account/list']=Array.from({length:4001},(_,i)=>({id:i+1}))}});assert.equal(rows.res.body.reason,'row_limit');
  const orders=await run({mutate(d){d['/order/deps?masterid=71']=Array.from({length:25},(_,i)=>({...d['/order/deps?masterid=71'][0],id:1000+i}))}});assert.equal(orders.res.body.reason,'order_limit');
  const contracts=await run({mutate(d){d['/order/deps?masterid=71']=Array.from({length:17},(_,i)=>({...d['/order/deps?masterid=71'][0],id:1000+i,contractId:2000+i}))}});assert.equal(contracts.res.body.reason,'contract_limit');
  for(const stall of ['/account/list','/fill/deps?masterid=101','/executionReport/deps?masterid=301']){
    const r=await run({timeout:true,stall});assert.equal(r.res.body.reason,'timeout');assert.equal(r.releases,1);assert(r.provider.every(c=>c.init.signal.aborted));
  }
  const body=await run({timeout:true,response:{'/order/deps?masterid=71':()=>({ok:true,status:200,headers:new Headers({'content-type':'application/json'}),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{})})}})}});assert.equal(body.res.body.reason,'timeout');assert.equal(body.releases,1);
});

test('aggregate request and byte budgets stop otherwise individually valid dependent reads',async()=>{
  const requests=await run({mutate(d){
    for(let i=0;i<21;i++){
      const id=1000+i;d['/order/deps?masterid=71'].push({...d['/order/deps?masterid=71'][2],id});
      for(const type of ['fill','command','orderVersion'])d[`/${type}/deps?masterid=${id}`]=[];
    }
    for(let i=0;i<46;i++){
      const id=2000+i;d['/command/deps?masterid=103'].push({...d['/command/deps?masterid=103'][1],id});
      for(const type of ['commandReport','executionReport'])d[`/${type}/deps?masterid=${id}`]=[];
    }
  }});
  assert.equal(requests.res.body.reason,'request_limit');assert.equal(requests.provider.length,160);assert.equal(requests.releases,1);
  const response=Object.fromEntries(Object.entries(fixtures()).map(([path,body])=>[path,()=>new Response(JSON.stringify(body).padEnd(250000,' '),{headers:{'content-type':'application/json'}})]));
  const bytes=await run({response});assert.equal(bytes.res.body.reason,'byte_limit');assert.equal(bytes.provider.length,9);assert.equal(bytes.releases,1);
});

test('unresolved or foreign parent and linked order references fail closed',async()=>{
  for(const key of ['parentId','linkedId']) {
    const r=await run({mutate(d){d['/order/deps?masterid=71'][2][key]=999}});
    assert.equal(r.res.body.reason,'unresolved_order_link');
  }
});
