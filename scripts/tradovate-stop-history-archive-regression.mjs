import test from 'node:test';
import assert from 'node:assert/strict';
import {run,selection,definitionsPath,reportPath,reportURL,json,archive,archiveText as text,archiveDescriptors as descriptors} from './helpers/tradovate-stop-history-fixture.mjs';

test('both report contracts are validated before either POST',async()=>{
  const cases=[
    [r=>r.pop(),'missing_report_contract'],
    [r=>r.push(structuredClone(r[0])),'ambiguous_report_contract'],
    [r=>r[1].params=r[1].params.filter(p=>p.name!=='startTime'),'missing_report_contract'],
    [r=>r[1].params=r[1].params.filter(p=>p.name!=='account'),'missing_report_contract'],
    [r=>r[1].params.find(p=>p.name==='account').paramType='String','unsupported_parameter_type'],
    [r=>r[0].params.find(p=>p.name==='orderStatus').paramType='String','unsupported_parameter_type'],
    [r=>r[1].params.find(p=>p.name==='product').paramType='String','unsupported_parameter_type'],
    [r=>r[1].params.find(p=>p.name==='contract').optional=false,'unsupported_required_parameter'],
    [r=>r[1].params.push({name:'invented',paramType:'TEXT',optional:false}),'unsupported_required_parameter'],
  ];
  for(const [change,reason] of cases){
    const r=await archive({mutate(d){change(d[definitionsPath].reports)}});
    assert.equal(r.provider.filter(c=>c.init.method==='POST').length,0,reason);
    assert.deepEqual(r.res.body.mismatch.historicalEvidence,{status:'unavailable',reason});
  }
  const optional=await archive({mutate(d){d[definitionsPath].reports[1].params.push({name:'unusedOptional',paramType:'TEXT',optional:true})}});
  assert.equal(optional.res.body.mismatch.historicalEvidence.status,'collected');
});

test('report account names must be exact valid unambiguous owned names',async()=>{
  for(const name of [undefined,null,71,'',' spaced ','bad\nname','x'.repeat(129),'OTHER-SYNTHETIC']){
    const r=await archive({mutate(d){d['/account/list'][1].name=name}});
    assert.equal(r.provider.filter(c=>c.init.method==='POST').length,0);
    assert.deepEqual(r.res.body.mismatch.historicalEvidence,{status:'unavailable',reason:'invalid_report_account'});
  }
});

test('unsafe report content is discarded atomically with a closed reason and no retry',async()=>{
  const cases=[
    [()=>json({data:'<html>private-provider-string</html>'}),'unsupported_report_content'],
    [()=>json({data:'synthetic\nvalue,<script>alert(1)</script>'}),'unsupported_report_content'],
    [()=>json({data:' Error: private-provider-string'}),'unsupported_report_content'],
    [()=>json({data:'{"error":"private-provider-string"}'}),'unsupported_report_content'],
    [()=>json({data:{errorText:'private-provider-string'}}),'provider_error'],
    [()=>json({errorText:'private-provider-string',data:text}),'provider_error'],
    [()=>json({data:null}),'unsupported_report_envelope'],
    [()=>json({data:[] }),'unsupported_report_envelope'],
    [()=>json({html:text}),'unsupported_report_envelope'],
    [()=>json([text]),'unsupported_report_envelope'],
    [()=>new Response('private-provider-string',{headers:{'content-type':'text/html'}}),'unsupported_media'],
    [()=>new Response(null,{status:302,headers:{location:'https://live.tradovateapi.com'}}),'upstream_rejected'],
    [()=>new Response(null,{status:403}),'upstream_rejected'],
    [()=>{throw Error('private-provider-string')},'network_or_redirect'],
    [()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'262145'}}),'byte_limit'],
    [()=>new Response(' '.repeat(262145),{headers:{'content-type':'application/json'}}),'byte_limit'],
    [()=>json({data:'x'.repeat(131073)}),'report_text_limit'],
  ];
  for(const [response,reason] of cases)for(const failing of ['Orders','Fills']){
    const r=await archive({response:{[reportPath]:init=>JSON.parse(init.body).name===failing?response():json({data:text})}});
    assert.equal(r.res.body.reason,'trade_mismatch',reason);
    assert.deepEqual(r.res.body.mismatch.historicalEvidence,{status:'unavailable',reason});
    assert.equal(r.provider.filter(c=>c.init.method==='POST').length,failing==='Orders'?1:2);
    assert.equal(r.releases,1);
  }
  const empty=await archive({mutate(d){d[reportPath]={data:''}}});
  assert.deepEqual(empty.res.body.mismatch.historicalEvidence.reports.map(r=>r.status),['empty','empty']);
});

test('credential reflection stops report acquisition before reuse or another report',async()=>{
  for(const token of ['synthetic-secret-marker','synthetic-"quote\\slash'])for(const escaped of [false,true])for(const location of ['account','descriptor','Orders','Fills']){
    const reflected=escaped?JSON.stringify(token).slice(1,-1):token;
    const r=await archive({token,mutate(d){
      if(location==='account')d['/account/list'][1].name=reflected;
      if(location==='descriptor')d[definitionsPath].reports[0].label=reflected;
    },response:{[reportPath]:init=>json({data:JSON.parse(init.body).name===location?`synthetic\n${reflected}`:text})}});
    assert.deepEqual(r.res.body,{diagnostic:'tradovate-stop-history-v1',status:'unavailable',reason:'unsafe_output',plannedRisk:'unavailable'});
    assert.equal(r.provider.filter(c=>c.init.method==='POST').length,location==='Orders'?1:location==='Fills'?2:0);
  }
});

test('archive windows use selected UTC calendar dates including midnight, leap day and eight-day bound',async()=>{
  for(const [openedAt,closedAt,startDate,endDate] of [
    ['2026-03-07T23:59:00.000Z','2026-03-08T00:00:00.000Z','2026-03-07','2026-03-09'],
    ['2024-02-28T23:59:00.000Z','2024-02-29T00:00:00.000Z','2024-02-28','2024-03-01'],
    ['2025-12-31T23:59:00.000Z','2026-01-01T00:00:00.000Z','2025-12-31','2026-01-02'],
    ['2026-01-01T10:00:00.000Z','2026-01-08T10:00:00.000Z','2026-01-01','2026-01-09'],
  ]){
    const r=await archive({query:{openedAt,closedAt}}),window=r.res.body.mismatch.historicalEvidence.provenance.window;
    assert.equal(window.startDate,startDate);assert.equal(window.endDate,endDate);
    assert(Date.parse(endDate)-Date.parse(startDate)<=8*86400000);
    for(const c of r.provider.filter(c=>c.init.method==='POST')){
      const body=JSON.parse(c.init.body),params=Object.fromEntries(body.params.map(p=>[p.name,p.value]));
      assert.equal(params.startDate,`${startDate.slice(5,7)}/${startDate.slice(8,10)}/${startDate.slice(0,4)}`);
      assert.equal(params.endDate,`${endDate.slice(5,7)}/${endDate.slice(8,10)}/${endDate.slice(0,4)}`);
      assert.equal(params.startTime,'00:00:00');assert.equal(params.endTime,'00:00:00');assert.equal(body.timezone,0);
    }
  }
  const tooLong=await archive({query:{openedAt:'2026-01-01T10:00:00.000Z',closedAt:'2026-01-08T10:00:00.001Z'}});
  assert.equal(tooLong.res.body.reason,'invalid_trade_window');assert.equal(tooLong.provider.length,0);
});

test('archive never bypasses existing auth ownership mismatch and closed query gates',async()=>{
  for(const options of [
    {anonymous:true},{plan:'free'},{wrongOwner:true},{expired:true},{query:{connectionId:'stale'}},
    {base:'https://live.tradovateapi.com/v1'},{mutate(d){d['/account/list']=[{id:72,name:'OTHER'}]}},
    ...['accountName','reportName','url','startDate','endDate','order'].map(k=>({query:{[k]:'override'}})),
  ]){
    const r=await archive(options);assert.equal(r.provider.filter(c=>c.init.method==='POST').length,0);
    assert.equal(r.res.body.mismatch,undefined);
  }
  for(const legacy of [false,true]){
    const r=await run({archive:true,...(legacy?{omitQuery:['contractSymbol']}:{}),mutate(d){
      d[definitionsPath]={reports:descriptors()};d['/fill/deps?masterid=101'][0].price=5999;
    }});
    assert.equal(r.res.body.mismatch.stage,'trade-crosscheck');assert.equal(r.res.body.mismatch.historicalEvidence,undefined);
    assert.equal(r.provider.filter(c=>c.init.method==='POST').length,0);
  }
});

test('archive shares timeout abort and output budgets and stops without a partial pair',async()=>{
  for(const failing of ['Orders','Fills'])for(const bodyStall of [false,true]){
    const r=await archive({timeout:true,response:{[reportPath]:init=>{
      if(JSON.parse(init.body).name!==failing)return json({data:text});
      return bodyStall?{ok:true,status:200,headers:new Headers({'content-type':'application/json'}),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{})})}}:new Promise(()=>{});
    }}});
    assert.deepEqual(r.res.body,{diagnostic:'tradovate-stop-history-v1',status:'unavailable',reason:'timeout',plannedRisk:'unavailable'});
    assert.equal(r.provider.filter(c=>c.init.method==='POST').length,failing==='Orders'?1:2);
    assert.equal(r.releases,1);assert(r.provider.every(c=>c.init.signal.aborted));
  }
  const large=await archive({mutate(d){
    for(let i=0;i<220;i++)d[definitionsPath].reports.push({name:`Synthetic-${i}-`+'x'.repeat(110),label:'y'.repeat(120),params:[]});
    d[reportPath]={data:'"'.repeat(125000)};
  }});
  assert.equal(large.res.body.reason,'output_limit');assert.equal(large.res.body.mismatch,undefined);
  assert.equal(large.provider.length,5);assert.equal(large.releases,1);
});

test('zero-order owned mismatch acquires only Orders and Fills CSV with exact UTC provenance',async()=>{
  const r=await archive(), body=r.res.body;
  assert.equal(body.reason,'trade_mismatch');assert.equal(body.plannedRisk,'unavailable');
  const evidence=body.mismatch.historicalEvidence;
  assert(evidence,'historical evidence must be present');
  assert.deepEqual(evidence.provenance,{
    source:'provider_account_filtered_report',account:{id:'71',name:'DEMO-SYNTHETIC'},
    tradeId:selection.tradeId,openedAt:'2026-01-05T10:01:00.000000000Z',closedAt:'2026-01-05T10:09:00.000000000Z',
    window:{startDate:'2026-01-05',endDate:'2026-01-06',startTime:'00:00:00',endTime:'00:00:00',timeZone:'UTC',timezoneOffset:0,endExclusive:true},
    representationType:'csv',rowIdentity:'unverified',schema:'unverified',coverage:'unverified',
  });
  assert.deepEqual(evidence,{status:'collected',provenance:evidence.provenance,reports:['Orders','Fills'].map(name=>({name,status:'collected',text,textBytes:Buffer.byteLength(text)}))});
  const posts=r.provider.filter(c=>c.init.method==='POST');assert.equal(posts.length,2);assert.equal(r.provider.length,5);
  for(const [i,c] of posts.entries()){
    assert.equal(c.target,reportURL);
    assert.deepEqual(JSON.parse(c.init.body),{name:['Orders','Fills'][i],representationType:'csv',timezone:0,params:[
      {name:'startDate',value:'01/05/2026'},{name:'endDate',value:'01/06/2026'},
      {name:'startTime',value:'00:00:00'},{name:'endTime',value:'00:00:00'},{name:'account',value:'DEMO-SYNTHETIC'},
    ]});
  }
  assert.equal(r.releases,1);assert(r.provider.every(c=>c.init.signal===posts[0].init.signal&&c.init.signal.aborted));
});
