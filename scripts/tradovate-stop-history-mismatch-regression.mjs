import test from 'node:test';
import assert from 'node:assert/strict';
import {run,definitionsURL,definitionsPath,json,fixtures} from './helpers/tradovate-stop-history-fixture.mjs';

test('mismatch output excludes both ordinary and JSON-escaped serialized credentials',async()=>{
  for(const token of ['synthetic-secret-marker','synthetic-"quote\\slash'])for(const field of ['name','label','paramName','paramType']){
    const r=await run({token,omitQuery:['contractSymbol'],mutate(d){
      d['/order/deps?masterid=71']=[];
      const descriptor={name:'SyntheticArchive',params:[{name:'account',paramType:'accounts',optional:false}]};
      if(field==='paramName')descriptor.params[0].name=token;
      else if(field==='paramType')descriptor.params[0].paramType=token;
      else descriptor[field]=`Synthetic ${token}`;
      d[definitionsPath]=[descriptor];
    }});
    assert.deepEqual(r.res.body,{diagnostic:'tradovate-stop-history-v1',status:'unavailable',reason:'unsafe_output',plannedRisk:'unavailable'});
  }
});

test('invalid input, unowned accounts, foreign edges, unsupported environments and timeout never discover definitions',async()=>{
  for(const options of [
    {query:{accountId:'071'}},{query:{extra:'invalid'}},{query:{entry:'bad'}},
    {base:'https://live.tradovateapi.com/v1'},
    {anonymous:true},{wrongOwner:true},{expired:true},{query:{connectionId:'stale'}},
    {mutate(d){d['/account/list']=[{id:72}]}},
    {mutate(d){d['/order/deps?masterid=71'][0].accountId=72}},
    {omitQuery:['contractSymbol'],mutate(d){d['/fill/deps?masterid=101'][0].contractId=82}},
    {timeout:true,stall:'/account/list'},{timeout:true,stall:'/fill/deps?masterid=101'},
  ]){
    const r=await run(options);
    assert.equal(r.provider.filter(c=>c.target===definitionsURL).length,0);
    assert.equal(r.res.body.mismatch,undefined);
    if(r.res.body.status==='unavailable')assert.equal(Object.keys(r.res.body).length,4);
  }
  const success=await run();assert.equal(success.provider.filter(c=>c.target===definitionsURL).length,0);
});

test('legacy mismatch never discovers definitions across unresolved or cross-contract order links',async()=>{
  for(const key of ['parentId','linkedId'])for(const foreignContract of [false,true]){
    const r=await run({omitQuery:['contractSymbol'],mutate(d){
      d['/fill/deps?masterid=102']=[];
      d['/order/deps?masterid=71'][0][key]=foreignContract?103:999;
      if(foreignContract)d['/order/deps?masterid=71'][2].contractId=82;
    }});
    assert.equal(r.provider.filter(c=>c.target===definitionsURL).length,0);
    assert.equal(r.res.body.reason,'unresolved_order_link');assert.equal(r.res.body.mismatch,undefined);
  }
});

test('definitions discovery shares aggregate byte and time budgets without retries',async()=>{
  const data=fixtures();data['/fill/deps?masterid=101'][0].price=5999;
  const response=Object.fromEntries(Object.entries(data).map(([path,body])=>[path,()=>new Response(JSON.stringify(body).padEnd(path===definitionsPath?100000:170000,' '),{headers:{'content-type':'application/json'}})]));
  const bytes=await run({response});
  assert.equal(bytes.res.body.reason,'trade_mismatch');assert.equal(bytes.res.body.mismatch.stage,'trade-crosscheck');
  assert.deepEqual(bytes.res.body.mismatch.reportDefinitions,{status:'unavailable',reason:'byte_limit'});
  assert.equal(bytes.provider.length,13);assert.equal(bytes.provider.filter(c=>c.target===definitionsURL).length,1);
  for(const options of [
    {stall:definitionsPath},
    {response:{[definitionsPath]:()=>({ok:true,status:200,headers:new Headers({'content-type':'application/json'}),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{})})}})}},
  ]){
    const r=await run({...options,timeout:true,omitQuery:['contractSymbol'],mutate(d){d['/order/deps?masterid=71']=[]}});
    assert.equal(r.res.body.reason,'timeout');assert.equal(r.res.body.mismatch,undefined);
    assert.equal(r.provider.filter(c=>c.target===definitionsURL).length,1);assert.equal(r.releases,1);
    assert(r.provider.every(c=>c.init.signal.aborted));
  }
});

// Synthetic identities and values only; no real account observations in fixtures.
test('owned mismatch distinguishes legacy fill resolution from exact trade crosscheck with bounded counts',async()=>{
  const cases=[
    {options:{omitQuery:['contractSymbol'],mutate(d){d['/fill/deps?masterid=102']=[]}},stage:'legacy-fill-resolution',fills:1,matchedFillIds:1},
    {options:{omitQuery:['contractSymbol'],mutate(d){d['/order/deps?masterid=71']=[]}},stage:'legacy-fill-resolution',fills:0,matchedFillIds:0,orders:0},
    {options:{mutate(d){d['/fill/deps?masterid=101'][0].price=5999}},stage:'trade-crosscheck',fills:2,matchedFillIds:2},
    {options:{omitQuery:['contractSymbol'],mutate(d){d['/fill/deps?masterid=101'][0].price=5999}},stage:'trade-crosscheck',fills:2,matchedFillIds:2},
  ];
  for(const {options,stage,fills,matchedFillIds,orders=3} of cases){
    const {res,releases}=await run(options);
    assert.equal(res.body.reason,'trade_mismatch');assert.equal(res.body.plannedRisk,'unavailable');assert.equal(releases,1);
    assert.equal(res.body.mismatch?.stage,stage);
    assert.deepEqual(res.body.mismatch.counts,{accountOrders:orders,discoveryOrders:orders,fills,matchedFillIds});
    assert.equal(res.body.selection,undefined);assert.equal(res.body.orders,undefined);assert.equal(res.body.fills,undefined);
  }
});

test('owned mismatch makes exactly one definitions GET and exports only bounded descriptor metadata',async()=>{
  const descriptor={name:'SyntheticOrderArchiveV3',label:'Synthetic order archive',params:[{name:'account',paramType:'accounts',optional:false}]};
  for(const wrapped of [false,true]){
    const r=await run({omitQuery:['contractSymbol'],mutate(d){
      d['/fill/deps?masterid=102']=[];
      const reports=[{...descriptor,private:'private-provider-string',fields:['Synthetic field'],params:descriptor.params.map(p=>({...p,defaultValue:'private-provider-string'}))},{name:'SyntheticOtherArchive',params:[]}];
      d[definitionsPath]=wrapped?{reports,private:'private-provider-string'}:reports;
    }});
    assert.deepEqual(r.res.body.mismatch.reportDefinitions,{status:'collected',reports:[descriptor,{name:'SyntheticOtherArchive',params:[]}]});
    const calls=r.provider.filter(c=>c.target===definitionsURL);
    assert.equal(calls.length,1);assert.equal(r.provider.at(-1),calls[0]);
    assert(r.provider.every(c=>c.init.signal===calls[0].init.signal&&c.init.signal.aborted));
    assert.equal(r.res.body.plannedRisk,'unavailable');
  }
});

test('metadata failures are enumerated without raw bodies or exception text and never retry',async()=>{
  const descriptor={name:'SyntheticArchive',params:[]};
  for(const [response,reason] of [
    [()=>json({errorText:'private-provider-string'}),'provider_error'],
    [()=>json({reports:[{...descriptor,errorCode:'private-provider-string'}]}),'provider_error'],
    [()=>json({reports:[{...descriptor,params:[{error:'private-provider-string'}]}]}),'provider_error'],
    [()=>json({reports:{}}),'invalid_reports_envelope'],
    [()=>json(Array(257).fill(descriptor)),'invalid_reports_envelope'],
    [()=>json([{name:'x'.repeat(129),params:[]}]),'invalid_report_descriptor'],
    [()=>json([{...descriptor,params:Array(33).fill({})}]),'invalid_report_params'],
    [()=>json([{...descriptor,params:[{name:'x',paramType:'String'}]}]),'missing_or_invalid_optional'],
    [()=>json([{...descriptor,params:[{name:'x',paramType:'String',optional:false},{name:'x',paramType:'String',optional:true}]}]),'invalid_report_descriptor'],
    [()=>json([{...descriptor,fields:{}}]),'invalid_report_fields'],
    [()=>new Response('private-provider-string',{status:403}),'upstream_rejected'],
    [()=>new Response(null,{status:302,headers:{location:'https://live.tradovateapi.com/v1/reports/requestReportDefinitions'}}),'upstream_rejected'],
    [()=>new Response('private-provider-string',{headers:{'content-type':'text/html'}}),'unsupported_media'],
    [()=>new Response('{private-provider-string',{headers:{'content-type':'application/json'}}),'invalid_json'],
    [()=>new Response('[{"name":"Synthetic","name":"Duplicate","params":[]}]',{headers:{'content-type':'application/json'}}),'duplicate_json_key'],
    [()=>new Response(null,{headers:{'content-type':'application/json'}}),'empty_response'],
    [()=>new Response('[]',{headers:{'content-type':'application/json','content-length':'262145'}}),'byte_limit'],
    [()=>new Response(' '.repeat(262145),{headers:{'content-type':'application/json'}}),'byte_limit'],
    [()=>{throw Object.assign(new Error('private-provider-string'),{reason:'private-provider-string'})},'network_or_redirect'],
  ]){
    const r=await run({omitQuery:['contractSymbol'],mutate(d){d['/order/deps?masterid=71']=[]},response:{[definitionsPath]:response}});
    assert.equal(r.res.body.reason,'trade_mismatch');
    assert.deepEqual(r.res.body.mismatch.reportDefinitions,{status:'unavailable',reason});
    assert.equal(r.provider.filter(c=>c.target===definitionsURL).length,1);assert.equal(r.releases,1);
  }
});
