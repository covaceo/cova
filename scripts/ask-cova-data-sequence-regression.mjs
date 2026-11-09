import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
import {readFileSync} from 'node:fs';
test('planner metadata advertises only the exercised bounded sequence contract and retains unsupported limits',async()=>{
 const description=D.describeAskCovaDataContext(await context([]));
 assert.ok(description.sequence,'sequence adapter is discoverable');assert.equal(description.sequence.source,'trades');assert.deepEqual(description.sequence.metrics,['reported_drawdown','loss_streak']);assert.equal(description.sequence.order,'verified_close');assert.equal(description.sequence.unit,'trade_records');
 assert.equal(description.unavailable.sequence,undefined,'blanket sequence denial removed');assert.match(description.unavailable.sequence_analytics,/intratrade|balance/i);
 assert.equal(description.sequence.fields.reported_drawdown.kind,'money');assert.equal(description.sequence.fields.loss_streak.unit,'trade_records');assert.equal(description.fields.trades.reported_drawdown,undefined,'computed sequence output is not a source field');
 const variants=Q.ASK_COVA_QUERY_PLAN_SCHEMA.properties.decision.anyOf[0].properties.queries.items.anyOf;
 const schema=variants.find(v=>v.properties.op.enum.includes('sequence'));assert.ok(schema);assert.deepEqual(schema.properties.metric.enum,['reported_drawdown','loss_streak']);assert.deepEqual(schema.properties.limit.enum,[1]);assert.equal(schema.additionalProperties,false);assert.deepEqual([...schema.required].sort(),Object.keys(query()).sort());
 const policy=readFileSync('server/askCovaQueryProvider.ts','utf8');assert.doesNotMatch(policy,/sequence metrics are unsupported/);assert.match(policy,/reported_drawdown.*loss_streak/);assert.match(policy,/verified_close/);
});
const D=load('src/lib/askCovaData.ts'),Q=load('src/lib/askCovaQuery.ts'),A=load('src/lib/askCovaQueryAnswer.ts'),legacy=load('src/lib/askCova.ts');
const stamp='2026-10-30T10:00:00Z';
const row=(id,pnl,date,extra={})=>({kind:'trade',recordId:'manual-'+id,accountId:'local',schemaVersion:1,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null,payload:{id:'manual-'+id,date,market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl,risk:0,setup:'',notes:'',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'},...extra}});
const snapshot=records=>({version:'ask-cova-data-v1',owner:'11111111-1111-4111-8111-111111111111',workspaceRevision:1,workspaceRecords:records,passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}});
const context=(records,extra={})=>D.buildAskCovaDataContext({snapshot:snapshot(records),account:'local',range:'all',conversation:{message:'Explain my drawdown',history:[]},...extra});
const query=(extra={})=>({id:'sequence',op:'sequence',source:'trades',where:[],metric:'reported_drawdown',order:'verified_close',mode:'complete',limit:1,...extra});
const plan=q=>({version:'ask-cova-query-plan-v1',decision:{kind:'query',queries:[q]}});
const cell=(r,f)=>r.cells.find(c=>c.field===f);
test('loss streak is the longest consecutive negative reported-record run and breakeven resets it',async()=>{
 const amounts=[-1,-2,0,-3,-4,-5,2,-6];
 const records=amounts.map((pnl,i)=>row(String(i),pnl,`2026-10-${String(20+i).padStart(2,'0')}`));
 const p=plan(query({metric:'loss_streak'}));assert.ok(Q.parseAskCovaQueryPlan(p),'loss_streak is a bounded supported sequence metric');
 const r=await Q.executeAskCovaQuery(await context(records),p),streak=cell(r,'loss_streak');
 assert.equal(streak.value,'3');assert.equal(streak.display,'3');assert.equal(streak.unit,'trade_records');assert.equal(streak.basis,'self-reported net');assert.equal(streak.kind,'count');assert.equal(cell(r,'record_count').value,'8');assert.equal(cell(r,'reported_drawdown'),undefined);
 assert.ok(r.observations[0].predicates.includes('breakeven_resets_streak'));assert.match(r.scopeNotices.join(' '),/longest consecutive.*negative.*zero.*positive.*reset/i);
 const r2=await Q.executeAskCovaQuery(await context([...records].reverse()),p);assert.deepEqual(r2,r);
});
test('Explain my drawdown restores legacy exact reported decline with explicit record unit basis and no balance claim',async()=>{
 const records=[row('z',100,'2026-10-28'),row('a',-150,'2026-10-29'),row('m',20,'2026-10-30')];
 const p=plan(query());assert.deepEqual(Q.parseAskCovaQueryPlan(p),p,'strict sequence plan accepted');
 const r=await Q.executeAskCovaQuery(await context(records),p);
 for(const [field,amount,display] of [['reported_drawdown','150.00','$150.00'],['drawdown_peak','100.00','$100.00'],['drawdown_trough','-50.00','−$50.00']]){
  const c=cell(r,field);assert.equal(c.value,amount);assert.equal(c.display,display);assert.equal(c.currency,'USD');assert.equal(c.basis,'self-reported net');assert.equal(c.unit,'reported_pnl');
 }
 assert.equal(cell(r,'record_count').value,'3');assert.equal(cell(r,'record_count').unit,'trade_records');assert.equal(r.coverage[0].unit,'trade_records');assert.equal(r.coverage[0].matched,3);assert.equal(r.coverage[0].excluded,0);
 assert.match(r.scopeNotices.join(' '),/initial zero.*not.*account balance/i);assert.match(r.scopeNotices.join(' '),/not.*intratrade|excludes.*while.*open/i);assert.match(r.scopeNotices.join(' '),/trade records.*not.*completed positions/i);
 assert.ok(r.observations[0].predicates.includes('initial_zero_not_balance'));assert.deepEqual(r.support[0].rows.map(s=>s.recordId).sort(),records.map(s=>s.recordId).sort());
 const raw={version:'ask-cova-answer-v2',paragraphs:[{text:`Reported drawdown: {{f:${cell(r,'reported_drawdown').id}}}`,evidence:[r.observations[0].id]}],detail:[]};
 assert.equal(A.renderAskCovaQueryAnswer(r,raw).paragraphs[0],'Reported drawdown: $150.00');assert.doesNotMatch(JSON.stringify(Q.askCovaQueryModelPayload(r)),/manual-z|manual-a|manual-m/);
 const reordered=await Q.executeAskCovaQuery(await context([...records].reverse()),p);assert.deepEqual(reordered,r,'input storage order never implies chronology');
 const previous=await legacy.buildAskCovaCatalog({ownerId:'fixture',account:'local',range:'all',question:'explain_drawdown',trades:records.map(r=>r.payload)});assert.equal(previous.candidates[0].id,'drawdown');assert.equal(legacy.askCovaModelPayload(previous).facts.find(f=>f.id==='drawdown').value,'150.00');
});
