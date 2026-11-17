import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {details,observed,csv,orderHeaders,fillHeaders,selected,window} from './helpers/tradovate-historical-csv-fixture.mjs';
import {reportURL,reportPath,definitionsPath,json} from './helpers/tradovate-stop-history-fixture.mjs';
test('followup descriptors are both validated before any detail or position POST',async()=>{
  const cases=[
    [r=>r.pop(),'missing_report_contract'],[r=>r.push(structuredClone(r[2])),'ambiguous_report_contract'],
    [r=>r[2].params=[],'missing_report_contract'],[r=>r[2].params[0].paramType='String','unsupported_parameter_type'],
    [r=>r[2].params[0].optional=true,'unsupported_required_parameter'],
    [r=>r[2].params.push({name:'account',paramType:'accounts',optional:false}),'unsupported_required_parameter'],
    [r=>r[3].params.find(p=>p.name==='startTime').paramType='String','unsupported_parameter_type'],
    [r=>r[3].params=r[3].params.filter(p=>p.name!=='account'),'missing_report_contract'],
    [r=>r[3].params.push({name:'invented',paramType:'String',optional:false}),'unsupported_required_parameter'],
  ];
  for(const [change,reason] of cases){const r=await details({mutate(d){change(d[definitionsPath].reports)}});assert.equal(r.provider.filter(c=>c.init.method==='POST').length,2);assert.deepEqual(r.res.body.mismatch.historicalEvidence.followup,{status:'unavailable',reason});}
});
test('followup failure retains matched Orders and Fills but never a partial followup',async()=>{
  const d=observed(),texts={Orders:csv(orderHeaders,d.orders),Fills:csv(fillHeaders,d.fills)};
  for(const [response,reason] of [
    [()=>json({data:''}),'empty_response'],[()=>json({data:'<html>bad</html>'}),'unsupported_report_content'],
    [()=>json({errorText:'private-provider-string'}),'provider_error'],[()=>json({data:{error:'bad'}}),'provider_error'],
    [()=>json({data:' Error: bad'}),'unsupported_report_content'],[()=>json({data:null}),'unsupported_report_envelope'],
    [()=>json({data:'x'.repeat(131073)}),'report_text_limit'],[()=>new Response(null,{status:302}),'upstream_rejected'],
    [()=>new Response('bad',{headers:{'content-type':'text/html'}}),'unsupported_media'],[()=>{throw Error('bad')},'network_or_redirect'],
    [()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'262145'}}),'byte_limit'],
  ])for(const index of [2,3,4,5]){
    let call=0;const r=await details({response:{[reportPath]:init=>{const name=JSON.parse(init.body).name;return call++===index?response():json({data:texts[name]??'opaque\nvalue'});}}});
    const h=r.res.body.mismatch.historicalEvidence;assert.equal(h.status,'collected');assert.deepEqual(h.reports.map(x=>x.text),[texts.Orders,texts.Fills]);assert.deepEqual(h.followup,{status:'unavailable',reason});assert.equal(call,index+1);
  }
});
test('followup shares deadline privacy and aggregate output gates with no retry or partial success',async()=>{
  const d=observed(),texts={Orders:csv(orderHeaders,d.orders),Fills:csv(fillHeaders,d.fills)};
  for(const index of [2,5])for(const bodyStall of [false,true]){
    let call=0;const r=await details({timeout:true,response:{[reportPath]:init=>{
      if(call++!==index)return json({data:texts[JSON.parse(init.body).name]??'opaque\nvalue'});
      return bodyStall?{ok:true,status:200,headers:new Headers({'content-type':'application/json'}),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{})})}}:new Promise(()=>{});
    }}});
    assert.deepEqual(r.res.body,{diagnostic:'tradovate-stop-history-v1',status:'unavailable',reason:'timeout',plannedRisk:'unavailable'});assert.equal(call,index+1);assert(r.provider.every(c=>c.init.signal.aborted));
  }
  for(const escaped of [false,true]){
    const token='synthetic-"quote\\slash',reflection=escaped?JSON.stringify(token).slice(1,-1):token;
    let call=0;const r=await details({token,response:{[reportPath]:init=>{call++;return json({data:texts[JSON.parse(init.body).name]??`opaque\n${reflection}`});}}});
    assert.equal(r.res.body.reason,'unsafe_output');assert.equal(r.res.body.mismatch,undefined);assert.equal(call,3);
  }
  const large=observed();for(let i=0;i<9;i++)large.orders.push({...large.orders[1],orderId:String(200+i),'Order ID':String(200+i)});
  let calls=0;const r=await details({response:{[reportPath]:init=>{
    calls++;const name=JSON.parse(init.body).name;return json({data:name==='Orders'?csv(orderHeaders,large.orders):name==='Fills'?texts.Fills:'"'.repeat(120000)});
  }}});
  assert.equal(r.res.body.reason,'output_limit');assert.equal(r.res.body.mismatch,undefined);assert.equal(calls,5,'stop after three detail reports exceed output budget, before a fourth');
});
test('identity and row caps stop all followups while zero and twelve candidates stay exactly bounded',async()=>{
  for(const change of [d=>d.orders[0].Account='OTHER',d=>d.fills[0]._accountId='72',d=>d.orders.push({...d.orders[0]}),d=>d.fills[0]._price='6001',d=>d.fills[0]._timestamp='2026-01-05 10:02:00.123Z',d=>d.orders[1].Type=' StopLimit']){
    const r=await details({change});assert.equal(r.provider.filter(c=>c.init.method==='POST').length,2);assert.equal(r.res.body.mismatch.historicalEvidence.followup.status,'unavailable');
  }
  for(const n of [0,12,13]){
    const r=await details({change(d){d.orders=d.orders.filter(o=>o.Type.trim()!=='Stop');for(let i=0;i<n;i++)d.orders.push({...observed().orders[1],orderId:String(200+i),'Order ID':String(200+i)});}});
    const f=r.res.body.mismatch.historicalEvidence.followup;
    if(n===13){assert.deepEqual(f,{status:'unavailable',reason:'historical_candidate_limit'});assert.equal(r.provider.length,5);}
    else{assert.equal(f.status,'collected');assert.equal(f.reports.length,n+1);assert.equal(r.provider.length,n+6);}
  }
  const rowCap=await details({mutate(d){for(let i=0;i<3998;i++)d['/account/list'].push({id:String(1000+i),name:'SYNTHETIC-'+i});}});
  assert.deepEqual(rowCap.res.body.mismatch.historicalEvidence.followup,{status:'unavailable',reason:'row_limit'});assert.equal(rowCap.provider.length,5);
});
test('followup aggregate input bytes count discarded provider envelope fields too',async()=>{
  const d=observed();for(let i=0;i<9;i++)d.orders.push({...d.orders[1],orderId:String(200+i),'Order ID':String(200+i)});
  let calls=0;
  const r=await details({response:{[reportPath]:init=>{calls++;const name=JSON.parse(init.body).name;return json({data:name==='Orders'?csv(orderHeaders,d.orders):name==='Fills'?csv(fillHeaders,d.fills):'opaque',ignored:'x'.repeat(220000)});}}});
  assert.deepEqual(r.res.body.mismatch.historicalEvidence.followup,{status:'unavailable',reason:'byte_limit'});assert(calls<15);assert.equal(calls,10);
});
test('matched archive acquires exactly derived opposite Stop details and one same-account UTC Position History',async()=>{
  const r=await details(),h=r.res.body.mismatch.historicalEvidence;
  assert.equal(h.followup?.status,'collected');
  assert.deepEqual(h.followup.identity,match());
  assert.equal(h.followup.acceptanceSemantics,'unverified');assert.equal(h.followup.coverage,'unverified');assert.equal(h.followup.protectiveLinkage,'unverified');
  assert.equal(r.res.body.plannedRisk,'unavailable');
  const posts=r.provider.filter(c=>c.init.method==='POST');
  assert.equal(posts.length,6);assert.equal(r.provider.length,9);
  assert(posts.every(c=>c.target===reportURL&&c.init.redirect==='error'&&c.init.signal===posts[0].init.signal));
  for(const [i,id] of ['103','105','106'].entries())assert.deepEqual(JSON.parse(posts[i+2].init.body),{name:'Order Details',representationType:'csv',timezone:0,params:[{name:'order',value:id}]});
  assert.deepEqual(JSON.parse(posts[5].init.body),{...JSON.parse(posts[0].init.body),name:'Position History'});
  assert.deepEqual(h.followup.reports.map(({name,orderId})=>({name,...(orderId?{orderId}:{})})),[{name:'Order Details',orderId:'103'},{name:'Order Details',orderId:'105'},{name:'Order Details',orderId:'106'},{name:'Position History'}]);
  assert(h.followup.reports.every(r=>r.status==='collected'&&r.text==='opaque synthetic report\nnot interpreted\n'&&r.textBytes===Buffer.byteLength(r.text)));
});
const url=new URL('../api/_lib/tradovate-historical-identity.js',import.meta.url);
const parser=existsSync(url)?(await import(url.href)).matchHistoricalIdentity:null;
const match=(d=observed(),s=selected)=>parser(csv(orderHeaders,d.orders),csv(fillHeaders,d.fills),s,'DEMO-SYNTHETIC',window);
test('historical row identity is vetoed on foreign duplicate malformed or inconsistent observed fields',()=>{
  const changes=[
    ...['_id','Fill ID','_orderId','Order ID','_contractId','_accountId'].flatMap(key=>[' 501','0501','1e2','9223372036854775808','0','-1',''].map(v=>d=>d.fills[0][key]=v)),
    ...['orderId','Order ID','lastCommandId','Version ID'].flatMap(key=>[' 101','0101','1e2','9223372036854775808','0',''].map(v=>d=>d.orders[0][key]=v)),
    d=>d.fills.push({...d.fills[0]}),d=>d.orders.push({...d.orders[0]}),
    d=>d.fills[0]._accountId='72',d=>d.fills[0].Account='OTHER',d=>d.orders[0].Account='OTHER',
    d=>d.fills[0]['Fill ID']='503',d=>d.fills[0]['Order ID']='103',d=>d.orders[0]['Order ID']='107',
    d=>d.fills[0]._contractId='82',d=>d.fills[0].Contract='MESU6',d=>d.orders[2].Contract='MESU6',
    d=>d.fills[0]._action='1',d=>d.fills[0]['B/S']='Sell',d=>d.orders[0]['B/S']='Sell',d=>d.fills[0]._active='false',
    ...['_qty','Quantity','_price','Price'].map(key=>d=>d.fills[0][key]='2'),
    ...['_qty','Quantity'].map(key=>d=>{d.fills[0]._qty='2';d.fills[0].Quantity='2'}),
    d=>d.fills[0]._timestamp='2026-02-30 10:01:00.123Z',d=>d.fills[0]._timestamp='2026-01-05 10:02:00.123Z',
    d=>d.fills[0].Timestamp='01/05/2026 10:02:00',d=>d.fills[0].Date='01/06/26',d=>d.fills[0]._tradeDate='2026-99-99',
    d=>d.orders[1].Timestamp='01/06/2026 10:02:00',d=>d.orders[1].Date='01/06/26',
    d=>d.orders[0]['Fill Time']='01/05/2026 10:02:00',d=>d.orders[0].avgPrice='6001',
    d=>d.orders[0]['Filled Qty']='2',d=>d.orders[0].filledQty='2',d=>d.orders[0].Quantity='0',d=>d.orders[0].Quantity='2',
    d=>d.orders.push({...d.orders[0],orderId:'107','Order ID':'107'}),
    d=>d.orders[1].decimalStop='5991',d=>d.orders[1]['Stop Price']='',
    d=>d.orders[3].decimalLimit='6006',d=>d.orders[0].Status=' Canceled',d=>d.orders[1].Status=' Filled',
    d=>d.orders[1]._tickSize='0',d=>d.fills[0]._tickSize='0',
    d=>d.fills.push({...d.fills[0],_id:'503','Fill ID':'503'}),
  ];
  for(const [i,change] of changes.entries()){const d=observed();change(d);assert.throws(()=>match(d),/historical/,`case ${i}`);}
  assert.throws(()=>match(observed(),{...selected,contractSymbol:'MESU6'}),/historical/);
  assert.throws(()=>match(observed(),{...selected,accountId:'72'}),/historical/);
});
test('CSV structure and scan caps reject ambiguity without skipping unsupported protection',()=>{
  const d=observed(),f=csv(fillHeaders,d.fills),o=csv(orderHeaders,d.orders);
  for(const bad of [csv(orderHeaders.slice(1),d.orders),csv([...orderHeaders,'orderId'],d.orders),o+'extra,row\n',o.replace('"orderId"','"orderId"x'),o+'"unclosed',o+'\n','x'.repeat(131073),csv(orderHeaders,Array(4001).fill({}))])assert.throws(()=>parser(bad,f,selected,'DEMO-SYNTHETIC',window),/historical/);
  for(const type of ['StopLimit','TrailingStop','TrailingStopLimit','MarketStopWithProtection','QTS','Unknown','MIT','MarketWithProtection','LimitIfTouched','MarketLimit','NewType']){
    const bad=observed();bad.orders[1].Type=' '+type;assert.throws(()=>match(bad),/unsupported_historical_order_type/,type);
  }
  for(const type of ['Market','Limit']){const bad=observed();bad.orders[1].Type=type;assert.throws(()=>match(bad),/unsupported_historical_order_type/);}
  const many=observed();
  for(let i=0;i<10;i++)many.orders.push({...many.orders[1],orderId:String(200+i),'Order ID':String(200+i)});
  assert.throws(()=>match(many),/historical_candidate_limit/);
  const tooMany=observed();for(let i=0;i<19;i++)tooMany.orders.push({...tooMany.orders[2],orderId:String(200+i),'Order ID':String(200+i)});
  assert.throws(()=>match(tooMany),/historical_order_limit/);
});
test('CSV quoting lossless int64 IDs latest versions and short selections remain supported',()=>{
  const d=observed();d.orders[1].Text='comma, quote " and\nnewline';
  d.orders[1].Timestamp='01/05/2026 23:59:00'; // latest version after the selected exit must not be pruned.
  d.orders[1].orderId=d.orders[1]['Order ID']='9007199254740993';
  assert.deepEqual(match(d).candidateOrderIds,['9007199254740993','105','106']);
  for(const o of d.orders)o['B/S']=o['B/S'].includes('Buy')?' Sell':' Buy';
  for(const f of d.fills){f['B/S']=f['B/S'].includes('Buy')?' Sell':' Buy';f._action=f._action==='0'?'1':'0';}
  const s={...selected,side:'Short',tradeId:'tradovate-71:502:501',buyFillId:'502',sellFillId:'501'};
  assert.deepEqual(match(d,s).candidateOrderIds,['9007199254740993','105','106']);
});
test('observed CSV matches exact fill identities and derives only opposite plain Stops without chronology inference',()=>{
  assert.equal(typeof parser,'function','Observed CSV identity parser is required');
  const identity=match();
  assert.deepEqual(identity,{contractId:'81',contractSymbol:'MESM6',entryOrderId:'101',exitOrderId:'102',buyFillId:'501',sellFillId:'502',openedAt:'2026-01-05T10:01:00.123456789Z',closedAt:'2026-01-05T10:09:00.987654321Z',candidateOrderIds:['103','105','106'],orderCount:6,fillCount:2});
});
