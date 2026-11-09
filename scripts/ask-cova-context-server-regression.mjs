import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import load from './helpers/load-ts.cjs';
const data = existsSync('server/askCovaDataServer.ts') ? load('server/askCovaDataServer.ts') : {};
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const env = { ASK_COVA_ENABLED: 'true', ASK_COVA_BETA_USER_ID: A };
const settings = { disclosure_version:'workspace-cloud-v1',revision:7,pending_manifest:null };
const at='2026-10-29T00:00:00Z';
const accountRow = {kind:'account',record_id:'local',account_id:'local',schema_version:1,payload:{name:'SAVED ACCOUNT'},revision:1,created_at:at,updated_at:at,deleted_at:null};
const rawData = {
  workspace_records:[accountRow,{...accountRow,kind:'broker_cash',record_id:'Tradovate:7',account_id:'Tradovate:7',payload:{cash:{secret:'OPAQUE'},fingerprint:'opaque'}}],
  passport_rule_plans:[{id:1,owner_id:A,limits:{maxDailyLoss:null,maxTradeLoss:null,maxContracts:null,maxLossStreak:null},created_at:at}],
  passport_session_reviews:[{owner_id:A,session_day:'2026-10-29',account_key:'local',note:'SAVED REVIEW',xp:15,reason:'review',revision:1,evidence_hash:'a'.repeat(64),evidence_as_of:null,updated_at:at}],
  passport_reward_days:[{owner_id:A,session_day:'2026-10-29',account_key:'local'}],
};
function storage(tables=rawData) {
  const events=[];
  const rest=async(path,options)=>{
    events.push({path,...options}); assert.equal(options.body,undefined); assert.equal(options.query.owner_id,'eq.'+A);
    if(path==='workspace_settings') return [structuredClone(settings)];
    assert(Object.hasOwn(tables,path),'only direct read tables');
    const start=Number(options.query.offset);
    return structuredClone(tables[path].slice(start,start+1)); // short pages are NOT terminal
  };
  return {rest,events};
}

test('source reader scans terminal pages of every direct table, excludes opaque cash, pins independent rereads',async()=>{
  assert.equal(typeof data.readAskCovaSourceData,'function','missing complete source reader');
  const f=storage();
  const loaded=await data.readAskCovaSourceData(A,f.rest);
  assert.equal(loaded.snapshot.version,'ask-cova-data-v1');
  assert.equal(loaded.snapshot.workspaceRevision,7);
  assert.equal(loaded.snapshot.workspaceRecords.length,1);
  assert.equal(loaded.snapshot.passportReviews[0].note,'SAVED REVIEW');
  assert.deepEqual(loaded.snapshot.complete,{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true});
  assert.doesNotMatch(JSON.stringify(loaded.snapshot),/OPAQUE|fingerprint/);
  for(const path of Object.keys(rawData)) assert(f.events.some(e=>e.path===path && e.query.offset===String(rawData[path].length)),'terminal sentinel for '+path);
  const before=f.events.length; await loaded.recheck(); assert(f.events.length>before);
  const tables=structuredClone(rawData), mutable=storage(tables);
  const changing=await data.readAskCovaSourceData(A,mutable.rest);
  tables.passport_session_reviews[0].note='changed';
  await assert.rejects(changing.recheck(),/context_changed/);
});
test('complete pages include the last of ten thousand workspace rows and Passport history beyond ninety',async()=>{
 const tables=structuredClone(rawData);tables.workspace_records=Array.from({length:10000},(_,i)=>({...accountRow,record_id:'Tradovate:'+(i+1),account_id:'Tradovate:'+(i+1),payload:{name:i===9999?'LAST PAGE SENTINEL':'Synthetic account'}}));
 tables.passport_rule_plans=Array.from({length:125},(_,i)=>({...rawData.passport_rule_plans[0],id:i+1}));
 const day=i=>new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);
 tables.passport_session_reviews=Array.from({length:125},(_,i)=>({...rawData.passport_session_reviews[0],session_day:day(i),note:i===124?'LAST REVIEW SENTINEL':'Synthetic saved review'}));
 tables.passport_reward_days=Array.from({length:125},(_,i)=>({...rawData.passport_reward_days[0],session_day:day(i)}));
 const events=[];
 const rest=async(path,o)=>{events.push({path,offset:o.query.offset});if(path==='workspace_settings')return[settings];const offset=Number(o.query.offset);return tables[path].slice(offset,offset+250);};
 const loaded=await data.readAskCovaSourceData(A,rest);
 assert.equal(loaded.snapshot.workspaceRecords.length,10000);assert.equal(loaded.snapshot.workspaceRecords.at(-1).payload.name,'LAST PAGE SENTINEL');
 assert.equal(loaded.snapshot.passportPlans.length,125);assert.equal(loaded.snapshot.passportReviews.at(-1).note,'LAST REVIEW SENTINEL');assert.equal(loaded.snapshot.passportRewards.length,125);
 assert(events.some(e=>e.path==='workspace_records'&&e.offset==='10000'));
 tables.workspace_records.push({...accountRow,record_id:'Tradovate:10001',account_id:'Tradovate:10001'});
 await assert.rejects(data.readAskCovaSourceData(A,rest),/workspace_too_large/);
});
test('source transport rejects page overflow, duplicate records and malformed or missing tables instead of partial history',async()=>{
 for(const mode of ['oversize','duplicate','missing','sparse','tombstone']){
  const tables=structuredClone(rawData);
  if(mode==='duplicate')tables.workspace_records.push({...accountRow});
  if(mode==='missing')tables.passport_session_reviews=null;
  if(mode==='tombstone')tables.workspace_records[0].deleted_at=at;
  if(mode==='sparse')tables.passport_rule_plans=new Array(1);
  const rest=async(path,o)=>{if(path==='workspace_settings')return[settings];if(path==='workspace_records'&&mode==='oversize')return Array.from({length:251},()=>accountRow);const rows=tables[path];return rows===null?null:rows.slice(Number(o.query.offset),Number(o.query.offset)+250);};
  await assert.rejects(data.readAskCovaSourceData(A,rest),mode==='oversize'?/workspace_too_large/:/account_data_unavailable/);
 }
});

test('workspace source refuses row revision beyond pinned settings and incomplete manifests',async()=>{
 const tables=structuredClone(rawData);tables.workspace_records[0].revision=8;
 await assert.rejects(data.readAskCovaSourceData(A,storage(tables).rest),/account_data_unavailable/);
 for(const pending_manifest of [{operation:'pending'},'pending']){
  let reads=0;await assert.rejects(data.readAskCovaSourceData(A,async path=>{assert.equal(path,'workspace_settings');reads++;return[{...settings,pending_manifest}];}),/workspace_unavailable/);assert.equal(reads,1);
 }
});

test('source reader rejects extra raw fields before projection and never invokes source getters',async()=>{
  const tables=structuredClone(rawData); tables.workspace_records[0].credential='not permitted';
  await assert.rejects(data.readAskCovaSourceData(A,storage(tables).rest),/account_data_unavailable/);
  let gets=0;
  const row={...accountRow};Object.defineProperty(row,'payload',{get(){gets++;return {};}});
  const rest=async path=>path==='workspace_settings'?[settings]:path==='workspace_records'?[row]:[];
  await assert.rejects(data.readAskCovaSourceData(A,rest),/account_data_unavailable/);assert.equal(gets,0);
});

const body = { action: 'ask_cova_context', owner: A, account: 'local', range: 'all' };
async function request(handler,requestBody=body){
 let status,payload;const headers={};
 await handler({method:'POST',url:'/api/workspace',body:requestBody},{setHeader(k,v){headers[k]=v;},status(n){status=n;return this;},json(p){payload=p;return this;}});
 return {status,payload,headers};
}
test('context-only reads have a separate short deadline so the two-request client deadline remains sufficient',async t=>{
 let clock=0;t.mock.method(performance,'now',()=>clock);
 const f=storage(),rest=async(path,o)=>{const value=await f.rest(path,o);if(path==='workspace_records')clock=25000;return value;};
 let status,payload;
 await data.createAskCovaContextHandler()({body,user:{id:A},environment:env,rest},{setHeader(){},status(n){status=n;return this;},json(p){payload=p;return this;}});
 assert.equal(status,503);assert.equal(payload.status,'unavailable');
});

test('actual context route is billing-free, typed, complete and independent of inference configuration',async()=>{
 const {createWorkspaceHandler}=load('server/workspace.ts');
 const f=storage(),authCalls=[];
 const handler=createWorkspaceHandler({enabled:()=>true,environment:()=>({...env,WORKSPACE_SYNC_PROJECT_REF:'aaaaaaaaaaaaaaaaaaaa',SUPABASE_URL:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'}),auth:async(_req,options)=>{authCalls.push(options);return{id:A};},rest:f.rest});
 const result=await request(handler);
 assert.equal(result.status,200,'missing real context route');
 assert.equal(result.payload.version,'ask-cova-data-v1');
 assert.equal(result.payload.passportReviews[0].xp,15);
 assert.equal(result.headers['Cache-Control'],'private, no-store');
 assert.equal(authCalls.length,1);assert.deepEqual(Object.keys(authCalls[0]).sort(),['billing','fetchImpl']);assert.equal(authCalls[0].billing,false);assert.equal(typeof authCalls[0].fetchImpl,'function');
 assert(load('src/lib/askCovaData.ts').parseAskCovaDataSnapshot(result.payload),'real sibling parser accepts snapshot');
 for(const mutation of [d=>d.passport_rule_plans[0].id=Number.MAX_SAFE_INTEGER+1,d=>d.passport_session_reviews[0].xp=10,d=>d.passport_reward_days.push({...d.passport_reward_days[0]}),d=>d.passport_session_reviews[0].owner_id=B]){
  const rows=structuredClone(rawData);mutation(rows);
  const h=createWorkspaceHandler({enabled:()=>true,environment:()=>({...env,WORKSPACE_SYNC_PROJECT_REF:'aaaaaaaaaaaaaaaaaaaa',SUPABASE_URL:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'}),auth:async()=>({id:A}),rest:storage(rows).rest});
  assert.equal((await request(h)).payload.error,'account_data_unavailable');
 }
});
test('context request boundary enforces authenticated beta owner and exact inert body before reads', () => {
  assert.equal(typeof data.assertAskCovaDataRequest, 'function', 'missing real context authorization boundary');
  assert.doesNotThrow(() => data.assertAskCovaDataRequest({ body, user: { id:A }, environment:env }));
  for (const change of [{ owner:B }, { account:'wrong' }, { range:'year' }, { extra:true }, { action:'inspect' }])
    assert.throws(() => data.assertAskCovaDataRequest({ body:{...body,...change}, user:{id:A}, environment:env }), /invalid_request/);
  assert.throws(() => data.assertAskCovaDataRequest({ body, user:{id:B}, environment:env }), /ask_cova_unavailable/);
  assert.throws(() => data.assertAskCovaDataRequest({ body, user:{id:A}, environment:{...env,ASK_COVA_ENABLED:'false'} }), /ask_cova_unavailable/);
  let gets=0; const accessor = {...body}; Object.defineProperty(accessor,'account',{get(){gets++;return 'local';}});
  assert.throws(() => data.assertAskCovaDataRequest({ body:accessor,user:{id:A},environment:env }), /invalid_request/);
  assert.equal(gets,0);
  assert.throws(() => data.assertAskCovaDataRequest({body,user:{id:A},environment:env,rawBody:JSON.stringify(body).replace('{','{"owner":"'+A+'",')}), /invalid_request/);
});
