import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import load from './helpers/load-ts.cjs';
const D=load('src/lib/askCovaData.ts'),Q=load('src/lib/askCovaQuery.ts'),A=load('src/lib/askCovaQueryAnswer.ts'),L=load('src/lib/askCova.ts');
const source={...D,...Q,...A};
const stamp='2026-10-30T10:00:00Z',owner='11111111-1111-4111-8111-111111111111';
const row=(id,pnl,date='2026-10-30',extra={})=>({kind:'trade',recordId:'manual-'+id,accountId:'local',schemaVersion:1,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null,payload:{id:'manual-'+id,date,market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl,risk:0,setup:'',notes:'',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'},...extra}});
const timed=(id,pnl,closedAt,date='2026-10-30')=>{const r=row(id,pnl,date);delete r.payload.manual;r.recordId=r.payload.id='tradovate-7:'+id;r.accountId='Tradovate:7';r.payload.source={provider:'Tradovate',accountId:'7',pnlBasis:'gross_before_fees',...(closedAt===undefined?{}:{closedAt})};return r;};
const rithmic=(id,pnl,currency,date='2026-10-30')=>{const r=row(id,pnl,date);delete r.payload.manual;r.payload.source={provider:'Rithmic',accountId:'9',accountKey:'syntheticserverkey001',currency};r.accountId='Rithmic:syntheticserverkey001:9';return r;};
const snapshot=records=>({version:'ask-cova-data-v1',owner,workspaceRevision:1,workspaceRecords:records,passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}});
const input=(records,extra={})=>({snapshot:snapshot(records),account:'all',range:'all',conversation:{message:'Explain my drawdown',history:[]},...extra});
const query=(metric='reported_drawdown',extra={})=>({id:metric,op:'sequence',source:'trades',where:[],metric,order:'verified_close',mode:'complete',limit:1,...extra});
const plan=(...queries)=>({version:'ask-cova-query-plan-v1',decision:{kind:'query',queries}});
const cell=(result,field)=>result.cells.find(c=>c.field===field);
const mixed=[row('net',10,'2026-10-29'),row('gross',-20,'2026-10-30',{manual:{accountKey:'local',currency:'USD',pnlBasis:'gross_before_fees'}})];
const unknown=row('unknown',1);delete unknown.payload.manual;
const cases=[
 {name:'empty stays unavailable, not zero',records:[],reason:'empty_population'},
 {name:'single date needs no manufactured closing time',records:[row('one',-5)],drawdown:'5.00',streak:'1'},
 {name:'all winning path has no decline',records:[row('one',1,'2026-10-29'),row('two',2)],drawdown:'0.00',streak:'0'},
 {name:'all breakeven path is zero',records:[row('one',0,'2026-10-29'),row('two',0)],drawdown:'0.00',streak:'0'},
 {name:'same-day manual records are unordered even with IDs and creation times',records:[row('z',-5),row('a',10)],reason:'ambiguous_chronology'},
 {name:'one missing same-day source close cannot be dropped',records:[timed('1:2',-5),timed('3:4',10,'2026-10-30T14:00:00Z')],reason:'ambiguous_chronology'},
 {name:'equivalent offset instants are tied',records:[timed('1:2',-5,'2026-10-30T14:00:00Z'),timed('3:4',10,'2026-10-30T15:00:00+01:00')],reason:'ambiguous_chronology'},
 {name:'nanosecond source ordering is preserved independently of ID',records:[timed('9:2',-5,'2026-10-30T14:00:00.000000001Z'),timed('1:4',10,'2026-10-30T14:00:00.000000002Z')],drawdown:'5.00',streak:'1'},
 {name:'legacy minute-precision source closes remain available',records:[timed('9:2',-5,'2026-10-30T14:00Z'),timed('1:4',10,'2026-10-30T14:01Z')],drawdown:'5.00',streak:'1'},
 {name:'timezone-free timestamp never becomes UTC',records:[timed('1:2',-5,'2026-10-30T14:00:00')],reason:'ambiguous_chronology'},
 {name:'close date mismatch fails even on unique dates',records:[timed('1:2',-5,'2026-10-29T14:00:00Z')],reason:'ambiguous_chronology'},
 {name:'unique days with missing close retain existing v3 availability',records:[timed('1:2',-5,undefined,'2026-10-29'),timed('3:4',-10,undefined)],drawdown:'15.00',streak:'2'},
 {name:'mixed fee bases retain explicit unreconciled qualifier',records:mixed,drawdown:'20.00',streak:'1',basis:'mixed reported bases, fees not reconciled'},
 {name:'missing currency stays unavailable',records:[unknown],reason:'unknown_currency'},
 {name:'unsupported currency stays unavailable',records:[rithmic('unknown',1,'XYZ')],reason:'unknown_currency'},
 {name:'mixed currencies never converted',records:[row('usd',1,'2026-10-29'),rithmic('eur',-5,'EUR')],reason:'mixed_currencies'},
 {name:'non-USD single cohort remains explicit',records:[rithmic('eur',-5,'EUR')],drawdown:'5.00',streak:'1',currency:'EUR'},
 {name:'subcent money is not silently rounded or omitted',records:[row('bad',0.001)],reason:'invalid_money'},
 {name:'unsafe total is not approximated',records:[row('big',90071992547409.9,'2026-10-29'),row('plus',1)],reason:'invalid_money'},
 {name:'unsafe intermediate path cannot hide behind cancelling total',records:[row('big',90071992547409.9,'2026-10-28'),row('plus',1,'2026-10-29'),row('minus',-1)],reason:'invalid_money'},
];
async function nativeCore(){
 assert.ok(process.env.TMPDIR,'Hermes scratch required');const dir=mkdtempSync(join(process.env.TMPDIR,'cova-sequence-native-')),entry=join(dir,'entry.ts');
 writeFileSync(entry,['askCovaData','askCovaQuery','askCovaQueryAnswer'].map(name=>'export * from '+JSON.stringify(process.cwd().replaceAll('\\','/')+'/src/lib/'+name+'.ts')+';').join('\n'));
 try{const built=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,target:'es2022',lib:{entry,formats:['es'],fileName:'core'}}});const chunk=(Array.isArray(built)?built:[built]).flatMap(x=>x.output).find(x=>x.type==='chunk');assert.ok(chunk);return import('data:text/javascript;base64,'+Buffer.from(chunk.code).toString('base64'));}finally{rmSync(dir,{recursive:true,force:true});}
}
test('source and native browser-target core preserve v3 availability and exact sequence evidence across boundary cases',async t=>{
 const native=await nativeCore();let executed=0;
 for(const c of cases)await t.test(c.name,async()=>{
  const p=plan(query(),query('loss_streak')),ctx=await source.buildAskCovaDataContext(input(c.records));
  const result=await source.executeAskCovaQuery(ctx,p),other=await native.executeAskCovaQuery(await native.buildAskCovaDataContext(input(c.records)),p);assert.deepEqual(other,result);
  const old=await L.buildAskCovaCatalog({ownerId:'fixture',account:'all',range:'all',question:'explain_drawdown',trades:c.records.map(r=>r.payload)}),legacyCandidate=old.candidates[0];
  const dd=cell(result,'reported_drawdown'),streak=cell(result,'loss_streak');assert.equal(cell(result,'record_count').value,String(c.records.length));
  if(c.reason){assert.equal(dd.value,null);assert.equal(streak.value,null);assert.equal(dd.unavailableReason,c.reason);assert.equal(streak.unavailableReason,c.reason);assert.equal(legacyCandidate.id,c.reason==='empty_population'?'empty':c.reason);assert.equal(result.coverage[0].usable,0);assert.equal(result.coverage[0].excluded,c.records.length);assert.ok(result.observations[0].predicates.includes(c.reason));}
  else{assert.equal(legacyCandidate.id,'drawdown');assert.equal(dd.value,c.drawdown);assert.equal(streak.value,c.streak);assert.equal(dd.currency,c.currency??'USD');assert.equal(dd.basis,c.basis??(c.records[0].payload.source?.provider==='Tradovate'?'gross, before fees':c.currency?'reported P&L, fees unknown':'self-reported net'));assert.equal(streak.basis,dd.basis);assert.equal(streak.unit,'trade_records');
   const facts=L.askCovaModelPayload(old).facts;for(const [field,legacyField] of [['reported_drawdown','drawdown'],['drawdown_peak','drawdown_peak'],['drawdown_trough','drawdown_trough']])assert.equal(cell(result,field).value,facts.find(f=>f.id===legacyField).value);
   const raw={version:'ask-cova-answer-v2',paragraphs:[{text:`Reported decline: {{f:${dd.id}}}`,evidence:[result.observations[0].id]}],detail:[]};assert.deepEqual(native.renderAskCovaQueryAnswer(other,raw),source.renderAskCovaQueryAnswer(result,raw));assert.equal(dd.display,c.currency?'EUR '+c.drawdown:'$'+c.drawdown);assert.doesNotMatch(dd.display,/USD\$/);
  }
  assert.deepEqual(native.askCovaQueryModelPayload(other),source.askCovaQueryModelPayload(result));assert.doesNotMatch(JSON.stringify(source.askCovaQueryModelPayload(result)),/manual-|tradovate-7:|11111111/);
  assert.deepEqual(await source.executeAskCovaQuery(await source.buildAskCovaDataContext(input([...c.records].reverse())),p),result);
  executed++;
 });
 assert.equal(executed,cases.length);console.log(JSON.stringify({synthetic:true,actualProviderRequests:0,nativeExecution:'Vite browser-target shared core executed as Node ESM, not DOM',boundaryCases:executed}));
});
test('sequence schema and executor reject scope, ordering, metric, projection and pagination overrides',async()=>{
 const ctx=await D.buildAskCovaDataContext(input([]));
 for(const extra of [{source:'journal_groups'},{source:'daily_notes'},{metric:'balance_drawdown'},{metric:'win_streak'},{order:'date'},{orderBy:[]},{order:'record_ref'},{mode:'top'},{limit:2},{limit:0},{fields:['reported_pnl']},{groupBy:[]},{account:'other'},{where:[[{field:'reported_pnl',op:'eq',value:{type:'text',value:'10'}}]]},{where:[[{field:'reported_drawdown',op:'is_present'}]]}]){
  const p=plan(query('reported_drawdown',extra));assert.equal(Q.parseAskCovaQueryPlan(p),null,JSON.stringify(extra));await assert.rejects(()=>Q.executeAskCovaQuery(ctx,p),e=>e.code==='query_invalid');
 }
 for(const key of ['metric','order','mode','limit','source','where']){const q=query();delete q[key];assert.equal(Q.parseAskCovaQueryPlan(plan(q)),null,key);}
 const valid=plan(query());await assert.rejects(()=>Q.executeAskCovaQuery(structuredClone(ctx),valid),e=>e.code==='account_data_unavailable');
 const extraDate=row('timestamp-date',-2,'2026-10-30T10:00:00Z');const r=await Q.executeAskCovaQuery(await D.buildAskCovaDataContext(input([extraDate])),valid);assert.equal(cell(r,'reported_drawdown').unavailableReason,'ambiguous_chronology','do not silently repair a recorded-date token that v3 rejected');
});
test('finite independent oracle checks full raw-record sequences including zero-reset and maximum decline',async()=>{
 let checked=0;
 for(const a of [-2,0,3])for(const b of [-2,0,3])for(const c of [-2,0,3])for(const d of [-2,0,3]){
  const amounts=[a,b,c,d],records=amounts.map((pnl,i)=>row(String(i),pnl,`2026-10-${20+i}`));
  const cumulative=[0,...amounts.map((_,i)=>amounts.slice(0,i+1).reduce((a,b)=>a+b,0))];
  const decline=Math.max(...cumulative.flatMap((trough,i)=>cumulative.slice(0,i+1).map(peak=>peak-trough)));
  const runs=amounts.map((_,i)=>{let n=0;for(let j=i;j<amounts.length&&amounts[j]<0;j++)n++;return n;});
  const r=await Q.executeAskCovaQuery(await D.buildAskCovaDataContext(input(records)),plan(query(),query('loss_streak')));
  assert.equal(cell(r,'reported_drawdown').value,decline.toFixed(2));assert.equal(cell(r,'loss_streak').value,String(Math.max(...runs)));checked++;
 }
 assert.equal(checked,81);
});
test('linked partial-close records remain raw sequence units rather than fabricated completed positions',async()=>{
 const records=[timed('10:11',-2,'2026-10-30T14:00:00Z'),timed('10:12',-3,'2026-10-30T15:00:00Z'),timed('10:13',10,'2026-10-30T16:00:00Z')];for(const r of records)Object.assign(r.payload.source,{openedAt:'2026-10-30T13:00:00Z',timeZone:'UTC'});
 const ctx=await D.buildAskCovaDataContext(input(records));const r=await Q.executeAskCovaQuery(ctx,plan(query(),query('loss_streak')));assert.equal(cell(r,'record_count').value,'3');assert.equal(cell(r,'reported_drawdown').value,'5.00');assert.equal(cell(r,'loss_streak').value,'2');assert.equal(r.support[0].rows.length,3);
 const group=await Q.executeAskCovaQuery(ctx,plan({id:'groups',op:'aggregate',source:'journal_groups',where:[],groupBy:[],measures:[{id:'n',op:'count',field:null}],orderBy:[],mode:'complete',limit:1}));assert.equal(cell(group,'n').value,'1');
});
test('sequence complete scan includes the final record at the saved-source bound without sampling',async()=>{
 const n=10000,records=Array.from({length:n},(_,i)=>timed(`${10000+i}:${20000+i}`,i===n-1?100:-0.01,`2026-10-30T14:00:00.${String(i).padStart(9,'0')}Z`));
 const result=await Q.executeAskCovaQuery(await D.buildAskCovaDataContext(input(records)),plan(query(),query('loss_streak')));
 assert.equal(cell(result,'record_count').value,String(n));assert.equal(cell(result,'reported_drawdown').value,((n-1)/100).toFixed(2));assert.equal(cell(result,'loss_streak').value,String(n-1));assert.equal(result.coverage[0].matched,n);assert.equal(result.coverage[0].omitted,0);assert.equal(result.support[0].rows.length,n);
 assert.ok(Buffer.byteLength(JSON.stringify(Q.askCovaQueryModelPayload(result)))<=16384);
});
test('sequence filters and selected account/range are applied before ordering with complete matched support',async()=>{
 const records=[row('first',-3,'2026-10-28'),row('reset',2,'2026-10-29',{market:'ES'}),row('last',-5)];
 const p=plan(query('loss_streak',{where:[[{field:'market',op:'eq',value:{type:'text',value:'NQ'}}]]}));
 const r=await Q.executeAskCovaQuery(await D.buildAskCovaDataContext(input(records)),p);assert.equal(cell(r,'loss_streak').value,'2');assert.equal(r.coverage[0].scoped,3);assert.equal(r.coverage[0].matched,2);assert.deepEqual(r.support[0].rows.map(r=>r.recordId).sort(),['manual-first','manual-last']);
 assert.match(r.scopeNotices.join(' '),/matched records after query filters/i);
 const latest=await Q.executeAskCovaQuery(await D.buildAskCovaDataContext(input(records,{account:'local',range:'today'})),plan(query()));assert.equal(cell(latest,'reported_drawdown').value,'5.00');assert.equal(cell(latest,'record_count').value,'1');
 const outside=await Q.executeAskCovaQuery(await D.buildAskCovaDataContext(input(records,{account:'Tradovate:99'})),plan(query()));assert.equal(cell(outside,'reported_drawdown').unavailableReason,'empty_population');
 const changed=structuredClone(records);changed[0].payload.pnl=-4;const next=await Q.executeAskCovaQuery(await D.buildAskCovaDataContext(input(changed)),p);assert.notEqual(next.contextDigest,r.contextDigest);assert.notEqual(next.resultDigest,r.resultDigest);
});
