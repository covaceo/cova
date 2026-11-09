// Synthetic deterministic cohort checks, not model interpretation or browser DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import load from './helpers/load-ts.cjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=Object.assign({},...['askCovaData','askCovaQuery','askCovaQueryAnswer'].map(name=>load(resolve(root,'src/lib/'+name+'.ts'))));
let nativePromise;
function nativeCore(){return nativePromise??=(async()=>{
 const dir=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'cova-money-cohort-')),entry=join(dir,'entry.ts');
 try{
  writeFileSync(entry,['askCovaData','askCovaQuery','askCovaQueryAnswer'].map(name=>'export * from '+JSON.stringify(resolve(root,'src/lib/'+name+'.ts').replaceAll('\\','/'))+';').join('\n'));
  const built=await build({root,configFile:false,envDir:false,logLevel:'silent',build:{write:false,copyPublicDir:false,minify:false,target:'es2022',lib:{entry,formats:['es'],fileName:'core'}}});
  const chunks=(Array.isArray(built)?built:[built]).flatMap(x=>x.output).filter(x=>x.type==='chunk');assert.equal(chunks.length,1);
  return await import('data:text/javascript;base64,'+Buffer.from(chunks[0].code).toString('base64'));
 }finally{rmSync(dir,{recursive:true,force:true});}
})();}
const stamp='2026-10-30T12:00:00Z';
function row(id,{kind='net',pnl=10,risk=5,market='NQ'}={}){
 const rec={kind:'trade',recordId:'manual-'+id,accountId:kind==='eur'?'Rithmic:syntheticserverkey001:9':'local',schemaVersion:1,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null,payload:{id:'manual-'+id,date:'2026-10-30',market,side:'Long',contracts:1,entry:100,exit:101,pnl,risk,setup:'',notes:''}};
 if(kind==='eur')rec.payload.source={provider:'Rithmic',accountKey:'syntheticserverkey001',accountId:'9',currency:'EUR'};
 else if(kind!=='unknown')rec.payload.manual={accountKey:'local',currency:'USD',pnlBasis:kind==='gross'?'gross_before_fees':'reported_net'};
 return rec;
}
const snapshot=records=>({version:'ask-cova-data-v1',owner:'11111111-1111-4111-8111-111111111111',workspaceRevision:1,workspaceRecords:records,passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}});
const plan=query=>({version:'ask-cova-query-plan-v1',decision:{kind:'query',queries:[query]}});
const query=(change={})=>({id:'cohorts',source:'trades',where:[],op:'aggregate',groupBy:['reported_pnl'],measures:[{id:'n',op:'count',field:null}],orderBy:[],mode:'complete',limit:32,...change});
const distinct=(field,change={})=>({id:'cohorts',source:'trades',where:[],op:'distinct',field,orderBy:[],mode:'complete',limit:32,...change});
async function execute(api,records,q){const context=await api.buildAskCovaDataContext({snapshot:snapshot(records),account:'all',range:'all',conversation:{message:'show saved monetary cohorts',history:[]}});return api.executeAskCovaQuery(context,plan(q));}
const moneyFields=new Set(['reported_pnl','planned_risk','risk_value']);
// Independent fixture oracle: no engine row/value/grouping helpers.
function expectedValue(rec,field){
 if(!moneyFields.has(field))return rec.payload[field];
 const p=rec.payload,currency=p.source?'EUR':p.manual?'USD':null;
 const basis=field==='planned_risk'?'self-reported planned risk':field==='risk_value'?'stored risk value; zero does not establish planned risk':p.source?'reported P&L, fees unknown':p.manual?.pnlBasis==='gross_before_fees'?'gross, before fees':p.manual?'self-reported net':'reported P&L, fees unknown';
 const amount=field==='reported_pnl'?p.pnl:p.risk;
 const unavailableReason=field==='planned_risk'&&amount<=0?'risk_unavailable':!Number.isInteger(amount*100)?'invalid_money':currency===null?'unknown_currency':null;
 return {value:unavailableReason?null:amount.toFixed(2),currency,basis,unavailableReason};
}
function expectedGroups(records,fields){
 const groups=new Map();for(const rec of records){const values=fields.map(f=>expectedValue(rec,f)),key=JSON.stringify(values);const g=groups.get(key)??{values,ids:[]};g.ids.push(rec.recordId);groups.set(key,g);}return [...groups.values()];
}
const moneyShape=({value,currency,basis,unavailableReason})=>({value,currency,basis,unavailableReason});
function checkGroups(api,result,records,q){
 const fields=q.op==='distinct'?[q.field]:q.groupBy,expected=expectedGroups(records,fields);
 assert.equal(result.observations.length,expected.length,'typed money cohorts must not merge');
 assert.equal(result.coverage[0].groupCount,expected.length);assert.equal(result.coverage[0].omitted,0);
 const projection=api.askCovaQueryModelPayload(result);assert.deepEqual(projection.data.coverage,result.coverage);
 const seen=[];
 for(const obs of result.observations){
  const ids=new Set([...obs.facts,...obs.categories,...obs.excerpts]);const cells=result.cells.filter(c=>ids.has(c.id));
  const values=fields.map(f=>{const c=cells.find(c=>c.field===f);assert.ok(c);return moneyFields.has(f)?moneyShape(c):c.value;});
  const group=expected.find(g=>JSON.stringify(g.values)===JSON.stringify(values));assert.ok(group,'cohort values and metadata match independent oracle');seen.push(JSON.stringify(values));
  const supports=result.support.find(s=>s.observation===obs.id).rows;
  assert.deepEqual(supports.map(s=>s.recordId).sort(),[...group.ids].sort(),'no support leakage between money cohorts');
  const count=cells.find(c=>c.field==='n');if(count)assert.equal(count.value,String(group.ids.length));
  for(const cell of cells.filter(c=>moneyFields.has(c.field))){
   assert.deepEqual(projection.data.cells.find(c=>c.id===cell.id),cell,'projection retains typed monetary metadata');
   const cov=result.coverage.find(c=>c.id===cell.coverage);assert.equal(cov.matched,group.ids.length);assert.equal(cov.usable,cell.value===null?0:group.ids.length);
   const text=(count?'{{f:'+count.id+'}} records at ':'saved amount: ')+'{{f:'+cell.id+'}}.';
   const answer={version:'ask-cova-answer-v2',paragraphs:[{text,evidence:[obs.id]}],detail:[]};
   const rendered=api.renderAskCovaQueryAnswer(result,answer);
   if(cell.value===null){assert.equal(rendered,null,'unavailable money cannot become a rendered fact');continue;}
   assert.ok(rendered);const amount=cell.value.replace('-',''),display=(cell.value.startsWith('-')?'−':'')+(cell.currency==='USD'?'$':cell.currency+' ')+amount;
   assert.equal(rendered.paragraphs[0],(count?count.value+' records at ':'saved amount: ')+display+'.');
   assert.deepEqual([...rendered.tradeIds].sort(),[...group.ids].sort());
   assert.ok(rendered.scopeNotices.includes(cell.field+': '+cell.basis+'.'),'rendered basis remains attached to the fact');
  }
 }
 assert.equal(new Set(seen).size,expected.length,'no duplicate mislabeled cohorts');
}
async function parity(records,q,check){
 const native=await nativeCore(),a=await execute(source,records,q),b=await execute(native,records,q);
 check(source,a);check(native,b);assert.deepEqual(b,a,'source/native result, coverage, support and digest parity');
 const reversed=await execute(source,[...records].reverse(),q);assert.deepEqual(reversed,a,'input order must not choose a different money label');
 return a;
}
test('each monetary dimension and both group-field positions retain field-specific metadata',async t=>{
 const records=[row('a'),row('b',{kind:'gross'}),row('c',{kind:'eur'}),row('d',{pnl:12,risk:6,market:'ES'})];
 const queries=[...moneyFields].flatMap(field=>[distinct(field),query({groupBy:[field]}),query({groupBy:['market',field]}),query({groupBy:[field,'market']})]);
 queries.push(query({groupBy:['reported_pnl','planned_risk']}),query({groupBy:['planned_risk','reported_pnl']}),query({groupBy:['planned_risk','risk_value']}));
 for(const q of queries)await t.test(q.op+' '+(q.field??q.groupBy.join('+')),async()=>{await parity(records,q,(api,result)=>checkGroups(api,result,records,q));});
});
test('journal group monetary dimensions preserve the cohort and original supporting trade records',async t=>{
 const records=[row('a'),row('b',{kind:'eur'}),row('c',{kind:'gross'}),row('d')];
 for(const q of [distinct('reported_pnl',{source:'journal_groups'}),query({source:'journal_groups',groupBy:['market','reported_pnl']})])await t.test(q.op,async()=>{await parity(records,q,(api,result)=>checkGroups(api,result,records,q));});
});
test('unavailable money dimensions keep currency basis and reason without issuing usable amounts',async t=>{
 const records=[row('a',{pnl:0.001}),row('b',{pnl:0.001,kind:'gross'}),row('c',{pnl:0.001,kind:'eur'}),row('d',{kind:'unknown'})];
 for(const q of [distinct('reported_pnl'),query()])await t.test(q.op,async()=>{await parity(records,q,(api,result)=>checkGroups(api,result,records,q));});
 // Same null amount/currency/basis but different unavailability reason must not pick the first reason.
 const unknown=[row('a',{kind:'unknown',pnl:0.001}),row('b',{kind:'unknown'})];
 const q=query();await parity(unknown,q,(api,result)=>checkGroups(api,result,unknown,q));
});
test('money grouping retains complete limits top counts ties ranking restrictions and evidence membership',async t=>{
 const native=await nativeCore();
 for(const [name,api] of [['source',source],['native',native]])await t.test(name,async()=>{
  const records=[row('a'),row('b',{kind:'eur'}),row('c',{kind:'gross'})];
  for(const q of [query({orderBy:[{key:'reported_pnl',direction:'asc'}]}),distinct('reported_pnl',{orderBy:[{key:'reported_pnl',direction:'asc'}]})])await assert.rejects(()=>execute(api,records,q),e=>e.code==='needs_narrowing','mixed money cannot be ordered as comparable money');
  for(const q of [query({limit:2}),distinct('reported_pnl',{limit:2})])await assert.rejects(()=>execute(api,records,q),e=>e.code==='needs_narrowing','complete result cannot hide a cohort');
  const top=await execute(api,records,query({orderBy:[{key:'n',direction:'desc'}],mode:'top',limit:1}));
  assert.equal(top.coverage[0].groupCount,3);assert.equal(top.coverage[0].returnedGroups,1);assert.equal(top.coverage[0].omitted,2);assert.equal(top.coverage[0].boundaryTies,2);assert.equal(top.cells.find(c=>c.field==='n').value,'1');
  const homogeneous=[row('a',{pnl:-10}),row('b',{pnl:0}),row('c',{pnl:12})];
  const ordered=await execute(api,homogeneous,distinct('reported_pnl',{orderBy:[{key:'reported_pnl',direction:'asc'}]}));assert.deepEqual(ordered.cells.map(c=>c.value),['-10.00','0.00','12.00']);
  const complete=await execute(api,records,query()),other=complete.cells.find(c=>complete.observations[1].facts.includes(c.id)&&c.field==='reported_pnl');
  assert.equal(api.renderAskCovaQueryAnswer(complete,{version:'ask-cova-answer-v2',paragraphs:[{text:'saved result: {{f:'+other.id+'}}.',evidence:[complete.observations[0].id]}],detail:[]}),null,'a different cohort cannot borrow this observation');
 });
});
test('nonmonetary counts and monetary measures retain their original cohort semantics',async()=>{
 const records=[row('a'),row('b',{kind:'gross'}),row('c',{kind:'eur'}),row('d')];
 await parity(records,query({groupBy:['market']}),(api,result)=>{assert.equal(result.observations.length,1);assert.equal(result.cells.find(c=>c.field==='n').value,'4');});
 await parity(records,query({groupBy:[],measures:[{id:'unique',op:'count_distinct',field:'market'}]}),(api,result)=>{assert.equal(result.cells[0].value,'1');});
 for(const field of moneyFields)await parity(records,query({groupBy:[],measures:[{id:'total',op:'sum',field}]}),(api,result)=>{
  assert.equal(result.observations.length,3,'existing original P&L-basis population partitioning must remain');
  assert.deepEqual(result.cells.filter(c=>c.field==='pnl_basis').map(c=>c.value).sort(),['gross, before fees','reported P&L, fees unknown','self-reported net'].sort());
  for(const obs of result.observations){const cell=result.cells.find(c=>obs.facts.includes(c.id)&&c.field==='total'),members=result.support.find(s=>s.observation===obs.id).rows.map(s=>records.find(r=>r.recordId===s.recordId));
   const expected=expectedValue(members[0],field);assert.equal(cell.currency,expected.currency);assert.equal(cell.basis,expected.basis);assert.equal(cell.value,(Number(expected.value)*members.length).toFixed(2));
  }
 });
});
test('count_distinct counts typed money identities without partitioning a supported whole population',async t=>{
 for(const field of moneyFields)await t.test(field,async()=>{
  const records=[row('a'),row('b',{kind:'eur'}),row('c',{kind:'gross'}),row('d'),row('e',{pnl:-10,risk:6}),row('f',{pnl:0,risk:0}),row('g',{kind:'unknown'})];
  const q=query({groupBy:[],measures:[{id:'unique',op:'count_distinct',field},{id:'n',op:'count',field:null}]});
  const values=records.map(r=>expectedValue(r,field)),valid=values.filter(v=>v.value!==null),expected=new Set(valid.map(v=>JSON.stringify(v))).size;
  await parity(records,q,(api,result)=>{
   assert.equal(result.observations.length,1,'count distinct must not silently split the requested whole population');
   const cell=result.cells.find(c=>c.field==='unique');assert.equal(cell.value,String(expected),'count distinct uses amount, currency and field-specific basis');assert.equal(cell.kind,'count');assert.equal(cell.currency,null);assert.equal(cell.basis,null);
   const coverage=result.coverage.find(c=>c.id===cell.coverage);assert.equal(coverage.usable,valid.length);assert.equal(coverage.excluded,records.length-valid.length);
   assert.equal(result.cells.find(c=>c.field==='n').value,String(records.length));
   assert.deepEqual(api.askCovaQueryModelPayload(result).data.cells.find(c=>c.id===cell.id),cell);
   const answer=api.renderAskCovaQueryAnswer(result,{version:'ask-cova-answer-v2',paragraphs:[{text:'distinct saved amounts: {{f:'+cell.id+'}}.',evidence:[result.observations[0].id]}],detail:[]});assert.equal(answer.paragraphs[0],'distinct saved amounts: '+expected+'.');
  });
 });
});
test('monetary distinct and count groups preserve currency and fee basis through projection and rendering',async t=>{
 for(const kind of ['eur','gross'])for(const op of ['distinct','aggregate'])await t.test(kind+' '+op,async()=>{
  const records=[row('a'),row('b',{kind}),row('c')],q=op==='distinct'?distinct('reported_pnl'):query();
  await parity(records,q,(api,result)=>checkGroups(api,result,records,q));
 });
});
