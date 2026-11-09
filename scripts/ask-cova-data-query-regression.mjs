import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import load from './helpers/load-ts.cjs';
const api=()=>{assert.ok(existsSync('src/lib/askCovaQuery.ts'),'generic query engine exists');return load('src/lib/askCovaQuery.ts');};
const data=()=>load('src/lib/askCovaData.ts');
const plan=q=>({version:'ask-cova-query-plan-v1',decision:{kind:'query',queries:[q]}});
const query=(change={})=>({id:'summary',op:'aggregate',source:'trades',where:[],groupBy:['market'],measures:[{id:'n',op:'count',field:null}],orderBy:[{key:'n',direction:'desc'}],mode:'top',limit:1,...change});
const owner='11111111-1111-4111-8111-111111111111',stamp='2026-11-01T10:00:00.000Z';
const row=(id,pnl,market='NQ',change={})=>({kind:'trade',recordId:'manual-'+id,accountId:'local',schemaVersion:1,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null,payload:{id:'manual-'+id,date:'2026-10-30',market,side:'Long',contracts:1,entry:100,exit:101,pnl,risk:0,setup:'breakout',notes:'',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'},...change}});
const snapshot=records=>({version:'ask-cova-data-v1',owner,workspaceRevision:1,workspaceRecords:records,passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}});
const context=async(records,change={})=>data().buildAskCovaDataContext({snapshot:snapshot(records),account:'local',range:'all',conversation:{message:'whats my most traded symbol',history:[]},...change});
const cells=(result,field)=>result.cells.filter(c=>c.field===field);
test('complete generic aggregation separates frequency and profit winners, keeps money bases, ties and missing money',async()=>{
 assert.equal(typeof api().executeAskCovaQuery,'function','deterministic executor implemented');
 const c=await context([row('a',0.1),row('b',0.2),row('c',100,'ES')]);
 const count=await api().executeAskCovaQuery(c,plan(query()));assert.equal(cells(count,'market')[0].value,'NQ');assert.equal(cells(count,'n')[0].value,'2');assert.equal(count.coverage[0].matched,3);assert.equal(count.coverage[0].omitted,1);assert.equal(count.coverage[0].groupCount,2);
 const profit=await api().executeAskCovaQuery(c,plan(query({measures:[{id:'profit',op:'sum',field:'reported_pnl'}],orderBy:[{key:'profit',direction:'desc'}]})));assert.equal(cells(profit,'market')[0].value,'ES');assert.equal(cells(profit,'profit')[0].value,'100.00');assert.equal(cells(profit,'profit')[0].currency,'USD');
 const total=await api().executeAskCovaQuery(c,plan(query({groupBy:[],measures:[{id:'profit',op:'sum',field:'reported_pnl'}],orderBy:[]})));assert.equal(cells(total,'profit')[0].value,'100.30');
 assert.match(total.resultDigest,/^[a-f0-9]{64}$/);assert.equal(total.contextDigest,c.contextDigest);assert.ok(Object.isFrozen(total));await assert.rejects(()=>api().executeAskCovaQuery(structuredClone(c),plan(query())),e=>e.code==='account_data_unavailable');
 const tie=await api().executeAskCovaQuery(await context([row('a',1),row('b',2,'ES')]),plan(query()));assert.equal(tie.coverage[0].boundaryTies,1);
 const invalid=await api().executeAskCovaQuery(await context([row('a',1),row('b',0.001)]),plan(query({groupBy:[],measures:[{id:'profit',op:'sum',field:'reported_pnl'},{id:'n',op:'count',field:null}],orderBy:[]})));assert.equal(cells(invalid,'profit')[0].value,null);assert.equal(cells(invalid,'profit')[0].unavailableReason,'incomplete_field');assert.equal(cells(invalid,'n')[0].value,'2');assert.equal(invalid.coverage.find(x=>x.id===cells(invalid,'profit')[0].coverage).excluded,1);
});
test('composed predicates and every saved domain are projected with honest field and attachment availability',async()=>{
 const records=[row('a',10,'NQ',{notes:'patient entry',risk:5,riskStatus:'provided'}),row('b',-20,'ES',{side:'Short',notes:'late entry'}),{kind:'daily_note',recordId:JSON.stringify(['local','2026-10-30']),accountId:'local',schemaVersion:1,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null,payload:{date:'2026-10-30',note:'no more entries',tradeId:'manual-a'}},{kind:'rules',recordId:'current',accountId:'all',schemaVersion:1,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null,payload:{rules:[{id:'loss',name:'daily loss',metric:'maxDailyLoss',limit:100,severity:'critical',enabled:true}]}},{kind:'account',recordId:'local',accountId:'local',schemaVersion:1,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null,payload:{name:'Trading account'}}];
 const s=snapshot(records);s.passportPlans=[{id:1,owner_id:owner,limits:{maxDailyLoss:100,maxTradeLoss:50,maxContracts:2,maxLossStreak:null},created_at:stamp}];s.passportReviews=[{owner_id:owner,session_day:'2026-10-30',account_key:'local',note:'patient session review',xp:60,reason:'saved review',revision:1,evidence_hash:'a'.repeat(64),evidence_as_of:stamp,updated_at:stamp}];s.passportRewards=[{owner_id:owner,session_day:'2026-10-30',account_key:'local'}];
 const c=await context(records,{snapshot:s});const fields=load('src/lib/askCovaQueryFields.ts').ASK_COVA_QUERY_FIELDS;
 for(const [source,registry] of Object.entries(fields)){
  const names=Object.keys(registry);for(let i=0;i<names.length;i+=12){const selected=names.slice(i,i+12),result=await api().executeAskCovaQuery(c,plan({id:'projection',op:'rows',source,where:[],fields:selected,orderBy:[],mode:'complete',limit:20}));assert.ok(result.observations.length,source);assert.deepEqual([...new Set(result.cells.map(x=>x.field))],selected,source);assert.equal(result.coverage[0].sourceComplete,true);}
 }
 const combined=await api().executeAskCovaQuery(c,plan(query({where:[[{field:'side',op:'eq',value:{type:'text',value:'Short'}},{field:'recorded_weekday',op:'eq',value:{type:'text',value:'Friday'}},{field:'setup_text',op:'contains',value:'break',match:'nfc_exact'}]],measures:[{id:'n',op:'count',field:null},{id:'profit',op:'sum',field:'reported_pnl'}],mode:'complete',limit:20})));assert.equal(cells(combined,'profit')[0].value,'-20.00');assert.equal(combined.coverage[0].matched,1);
 const search=await api().executeAskCovaQuery(c,plan({id:'search',op:'text_search',source:'trades',where:[],field:'note_text',needle:'patient',match:'nfc_exact',orderBy:[],mode:'complete',limit:20}));assert.equal(cells(search,'note_text')[0].value,'patient entry');assert.equal(search.support[0].rows[0].recordId,'manual-a');
 const distinct=await api().executeAskCovaQuery(c,plan({id:'unique',op:'distinct',source:'trades',where:[],field:'market',orderBy:[{key:'market',direction:'asc'}],mode:'complete',limit:20}));assert.deepEqual(cells(distinct,'market').map(x=>x.value),['ES','NQ']);
});
const timed=(id,pnl,close='2026-10-30T15:00:00Z',change={})=>{const r=row('unused',pnl,'NQ',change);r.recordId=id;r.accountId='Tradovate:7';r.payload.id=id;delete r.payload.manual;r.payload.source={provider:'Tradovate',accountId:'7',timeZone:'UTC',pnlBasis:'gross_before_fees',openedAt:'2026-10-30T14:00:00Z',closedAt:close};return r;};
test('journal grouping precedes query filters and preserves linked-fill unit and exact money',async()=>{
 const a=timed('tradovate-7:10:11',10),b=timed('tradovate-7:10:12',-5,'2026-10-30T16:00:00Z');
 const c=await context([a,b],{account:'Tradovate:7'});
 const result=await api().executeAskCovaQuery(c,plan(query({source:'journal_groups',groupBy:[],measures:[{id:'n',op:'count',field:null},{id:'profit',op:'sum',field:'reported_pnl'},{id:'wins',op:'win_rate',field:'reported_pnl'}],orderBy:[]})));
 assert.equal(cells(result,'n')[0].value,'1');assert.equal(cells(result,'profit')[0].value,'5.00');assert.equal(cells(result,'wins')[0].value,'100.0');assert.equal(result.support[0].rows.length,2);
 const conflict=timed('tradovate-7:10:13',1,'2026-10-30T17:00:00Z',{entry:999,setup:'excluded'});
 const filtered=await api().executeAskCovaQuery(await context([a,b,conflict],{account:'Tradovate:7'}),plan(query({source:'journal_groups',groupBy:[],where:[[{field:'setup_text',op:'eq',value:{type:'text',value:'breakout'}}]],measures:[{id:'n',op:'count',field:null}],orderBy:[]})));assert.equal(cells(filtered,'n')[0].value,'2');
 assert.match(result.scopeNotices.join(' '),/not certified completed positions/);
});
test('schema availability is provider-safe and empty/converse/cash results remain evidence-bound',async()=>{
 const c=await context([]),description=data().describeAskCovaDataContext(c);assert.ok(description.fields?.passport_reviews?.xp,'planner has full source/field registry');assert.ok(description.sources.journal_groups);assert.match(description.unavailable.broker_cash,/opaque|Opaque/);
 const emptyResult=await api().executeAskCovaQuery(c,plan(query({groupBy:[],measures:[{id:'n',op:'count',field:null},{id:'profit',op:'sum',field:'reported_pnl'}],orderBy:[]})));assert.equal(cells(emptyResult,'n')[0].value,'0');assert.equal(cells(emptyResult,'profit')[0].value,null);
 const noRows=await api().executeAskCovaQuery(c,plan({id:'empty',op:'rows',source:'daily_notes',where:[],fields:['note_text'],orderBy:[],mode:'complete',limit:20}));assert.equal(noRows.coverage[0].matched,0);assert.equal(noRows.observations.length,1);assert.ok(noRows.observations[0].predicates.includes('empty_population'));
 const converse=await api().executeAskCovaQuery(c,{version:'ask-cova-query-plan-v1',decision:{kind:'converse',reason:'greeting'}});assert.equal(converse.observations.length,1);assert.ok(converse.observations[0].predicates.includes('no_data_claim'));
 const capability=await api().executeAskCovaQuery(c,plan({id:'cash',op:'rows',source:'capabilities',where:[[{field:'capability',op:'eq',value:{type:'text',value:'broker_cash'}}]],fields:['capability','status','reason'],orderBy:[],mode:'complete',limit:20}));assert.equal(cells(capability,'status')[0].value,'unavailable');assert.equal(capability.support[0].rows.length,0);
});
test('complete scan bounds, unknown cohorts, field coverage and mixed-money ranking fail honestly',async()=>{
 const unknown=row('unknown',999,'UNKNOWN');delete unknown.payload.manual;
 const missing=await api().executeAskCovaQuery(await context([row('valid',5),unknown]),plan(query({measures:[{id:'profit',op:'sum',field:'reported_pnl'}],orderBy:[{key:'profit',direction:'desc'}]})));
 assert.match(missing.scopeNotices.join(' '),/unknown_currency|incomplete_field|incomplete fields/i,'omitted invalid cohort is still disclosed');
 const gross=row('gross',100,'ES',{manual:{accountKey:'local',currency:'USD',pnlBasis:'gross_before_fees'}});
 const mixed=await context([row('net',10),gross]);await assert.rejects(()=>api().executeAskCovaQuery(mixed,plan(query({measures:[{id:'profit',op:'sum',field:'reported_pnl'}],orderBy:[{key:'profit',direction:'desc'}]}))),e=>e.code==='needs_narrowing');
 const many=await context(Array.from({length:40},(_,i)=>row(String(i),1,'M'+i)));
 await assert.rejects(()=>api().executeAskCovaQuery(many,plan(query({mode:'complete',limit:32}))),e=>e.code==='needs_narrowing');
 const sentinelRows=Array.from({length:10000},(_,i)=>row(String(i),0,i===9999?'LAST':'OTHER'));
 const sentinel=await api().executeAskCovaQuery(await context(sentinelRows),plan(query({groupBy:[],where:[[{field:'market',op:'eq',value:{type:'text',value:'LAST'}}]],orderBy:[]})));assert.equal(cells(sentinel,'n')[0].value,'1');assert.equal(sentinel.coverage[0].scoped,10000);
 const projected=await api().executeAskCovaQuery(await context([row('x',1)]),plan({id:'text',op:'rows',source:'trades',where:[],fields:['note_text'],orderBy:[],mode:'complete',limit:20}));assert.equal(projected.coverage[0].groupCount,null);assert.equal(projected.coverage[0].textCoverage,'full_selected_text');
});
test('timestamp comparisons preserve instants across offsets and exact fractional source spans',async()=>{
 const a=timed('tradovate-7:40:41',1,'2026-10-30T15:00:00.000000001Z');a.payload.source.openedAt='2026-10-30T14:59:00.000000001Z';
 const b=timed('tradovate-7:42:43',1,'2026-10-30T16:00:00+01:00');b.payload.source.openedAt='2026-10-30T14:00:00Z';
 const result=await api().executeAskCovaQuery(await context([a,b],{account:'Tradovate:7'}),plan({id:'times',op:'rows',source:'trades',where:[],fields:['closed_at','source_span_minutes'],orderBy:[{key:'closed_at',direction:'asc'}],mode:'complete',limit:20}));
 assert.equal(result.support[0].rows[0].recordId,b.recordId,'15:00:00Z precedes 15:00:00.000000001Z');assert.equal(cells(result,'source_span_minutes')[1].value,'1');
 const same=await api().executeAskCovaQuery(await context([b],{account:'Tradovate:7'}),plan({id:'same',op:'rows',source:'trades',where:[[{field:'closed_at',op:'eq',value:{type:'text',value:'2026-10-30T15:00:00Z'}}]],fields:['closed_at'],orderBy:[],mode:'complete',limit:20}));assert.equal(same.coverage[0].matched,1);
});
test('source identifiers and timestamp literals reject coercion and inherited registry names',async()=>{
 const t=timed('tradovate-7:50:51',1);t.payload.source.accountId=7;assert.equal(data().parseAskCovaDataSnapshot(snapshot([t])),null,'numeric account identifier cannot be coerced');
 assert.equal(api().parseAskCovaQueryPlan(plan(query({source:'__proto__',groupBy:[],orderBy:[]}))),null);
 assert.equal(api().parseAskCovaQueryPlan(plan({id:'bad',op:'rows',source:'trades',where:[[{field:'closed_at',op:'gt',value:{type:'text',value:'not an instant'}}]],fields:['closed_at'],orderBy:[],mode:'complete',limit:20})),null);
 const records=[...Array.from({length:12},(_,i)=>row('a'+i,1,'NQ',{setup:'s'+i})),...Array.from({length:2},(_,i)=>row('b'+i,1,'ES',{setup:'s'+i}))];
 const distinct=await api().executeAskCovaQuery(await context(records),plan(query({measures:[{id:'unique',op:'count_distinct',field:'setup_text'}],orderBy:[{key:'unique',direction:'desc'}]})));assert.equal(cells(distinct,'market')[0].value,'NQ');assert.equal(cells(distinct,'unique')[0].value,'12');
});
test('schema uses shared definitions to keep the fixed planner allowance usable without relaxing runtime validation',()=>{
 const schema=api().ASK_COVA_QUERY_PLAN_SCHEMA;assert.ok(Buffer.byteLength(JSON.stringify(schema))<=12000,'schema transport guard, not a token-count substitute');assert.ok(schema.$defs?.field);
});
test('unknown currency cannot mint a usable money atom and global rules stay explicitly scoped',async()=>{
 const unknown=row('unknown',999);delete unknown.payload.manual;
 const r=await api().executeAskCovaQuery(await context([unknown]),plan({id:'raw',op:'rows',source:'trades',where:[],fields:['reported_pnl','contracts'],orderBy:[],mode:'complete',limit:20}));assert.equal(cells(r,'reported_pnl')[0].value,null);assert.equal(cells(r,'reported_pnl')[0].unavailableReason,'unknown_currency');assert.equal(cells(r,'contracts')[0].value,'1');
 const rule={kind:'rules',recordId:'current',accountId:'all',schemaVersion:1,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null,payload:{rules:[{id:'daily',name:'loss limit',metric:'maxDailyLoss',limit:100,severity:'critical',enabled:true}]}};
 const result=await api().executeAskCovaQuery(await context([rule]),plan({id:'rules',op:'rows',source:'rules',where:[],fields:['rule_limit'],orderBy:[],mode:'complete',limit:20}));assert.match(result.scopeNotices.join(' '),/owner-global.*current|current.*owner-global/);
});
test('duration aggregation uses exact source fractions rather than rounded display strings',async()=>{
 const records=Array.from({length:3},(_,i)=>{const r=timed(`tradovate-7:${100+i}:${200+i}`,1,'2026-10-30T14:00:20Z');return r;});
 const result=await api().executeAskCovaQuery(await context(records,{account:'Tradovate:7'}),plan(query({groupBy:[],measures:[{id:'minutes',op:'sum',field:'source_span_minutes'}],orderBy:[]})));assert.equal(cells(result,'minutes')[0].value,'1');
});
test('risk values and win-rate populations cannot erase stored currency or fee basis',async()=>{
 const net=row('net',1,'NQ',{risk:5}),gross=row('gross',-1,'NQ',{risk:5,manual:{accountKey:'local',currency:'USD',pnlBasis:'gross_before_fees'}});
 const result=await api().executeAskCovaQuery(await context([net,gross]),plan(query({groupBy:[],measures:[{id:'rate',op:'win_rate',field:'reported_pnl'}],orderBy:[],mode:'complete',limit:20})));assert.equal(cells(result,'rate').length,2);assert.deepEqual(cells(result,'rate').map(c=>c.value).sort(),['0.0','100.0']);
 const raw=await api().executeAskCovaQuery(await context([net]),plan({id:'risk',op:'rows',source:'trades',where:[],fields:['risk_value'],orderBy:[],mode:'complete',limit:20}));assert.equal(cells(raw,'risk_value')[0].kind,'money');assert.equal(cells(raw,'risk_value')[0].currency,'USD');
});
test('generic plans validate exact typed composition with strict root schema and no executable override',()=>{
 const p=plan(query());assert.deepEqual(api().parseAskCovaQueryPlan(p),p);
 const rows={id:'r',op:'rows',source:'passport_reviews',where:[[{field:'xp',op:'gte',value:{type:'decimal',value:'15'}}]],fields:['note_text','xp','date'],orderBy:[],mode:'complete',limit:20};assert.ok(api().parseAskCovaQueryPlan(plan(rows)));
 for(const q of [query({source:'sql'}),query({owner:'x'}),query({groupBy:['owner_id']}),query({limit:33}),query({where:[[{field:'contracts',op:'eq',value:{type:'text',value:'1'}}]]}),query({where:[[{field:'contracts',op:'gte',value:{type:'decimal',value:'1e4'}}]]}),query({orderBy:[{key:'missing',direction:'asc'}]}),{...rows,fields:['note_text','secret']},{...rows,where:[[{field:'xp',op:'eq',value:{type:'decimal',value:15}}]]}])assert.equal(api().parseAskCovaQueryPlan(plan(q)),null);
 const walk=x=>{if(!x||typeof x!=='object')return;if(x.type==='object'){assert.equal(x.additionalProperties,false);assert.deepEqual([...x.required].sort(),Object.keys(x.properties).sort());}Object.values(x).forEach(v=>Array.isArray(v)?v.forEach(walk):walk(v));};walk(api().ASK_COVA_QUERY_PLAN_SCHEMA);
 assert.equal(api().ASK_COVA_QUERY_PLAN_SCHEMA.type,'object');
 let called=false;const evil=plan(query());Object.defineProperty(evil.decision.queries[0],'source',{get(){called=true;return 'trades';},enumerable:true});assert.equal(api().parseAskCovaQueryPlan(evil),null);assert.equal(called,false);
});
