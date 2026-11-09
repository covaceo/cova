import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import load from './helpers/load-ts.cjs';
const path='src/lib/askCovaData.ts';
const api=()=>{assert.ok(existsSync(path),'complete account snapshot implementation exists');return load(path);};
const owner='11111111-1111-4111-8111-111111111111';
const empty=()=>({version:'ask-cova-data-v1',owner,workspaceRevision:0,workspaceRecords:[],passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}});
const stamp='2026-11-01T10:00:00.000Z';
const plan=()=>({id:1,owner_id:owner,limits:{maxDailyLoss:100,maxTradeLoss:null,maxContracts:2,maxLossStreak:3},created_at:stamp});
const review=()=>({owner_id:owner,session_day:'2026-11-01',account_key:'local',note:'saved review note',xp:15,reason:'saved reward',revision:1,evidence_hash:'a'.repeat(64),evidence_as_of:null,updated_at:stamp});
test('Passport exact table rows are validated without lossy bigint or owner coercion',()=>{
 const raw={...empty(),passportPlans:[plan()],passportReviews:[review()],passportRewards:[{owner_id:owner,session_day:'2026-11-01',account_key:'local'}]};
 assert.deepEqual(api().parseAskCovaDataSnapshot(raw),raw);
 for(const mutate of [s=>s.passportPlans[0].id=9007199254740992,s=>s.passportPlans[0].limits.maxContracts=1.5,s=>s.passportPlans[0].limits.maxTradeLoss=0,s=>s.passportReviews[0].owner_id='22222222-2222-4222-8222-222222222222',s=>s.passportReviews[0].xp=16,s=>s.passportReviews[0].session_day='2026-02-30',s=>s.passportPlans.push(plan()),s=>s.passportRewards.push({...s.passportRewards[0],account_key:'Tradovate:7'})]){const s=structuredClone(raw);mutate(s);assert.equal(api().parseAskCovaDataSnapshot(s),null);}
 let touched=0;const malicious=empty();Object.defineProperty(malicious,'owner',{get(){touched++;throw Error('getter');},enumerable:true});assert.equal(api().parseAskCovaDataSnapshot(malicious),null);assert.equal(touched,0);
 for(const value of [Object.assign(new Date(),empty()),{...empty(),workspaceRecords:Array(1)},{...empty(),passportPlans:[Object.assign(Object.create({}),plan())]}])assert.equal(api().parseAskCovaDataSnapshot(value),null);
});
const note=(accountId,day,note)=>({kind:'daily_note',recordId:JSON.stringify([accountId,day]),accountId,schemaVersion:1,payload:{date:day,note,tradeId:null},revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null});
test('issued context binds all saved text and independent sources; latest notes and account scopes resolve deterministically',async()=>{
 assert.equal(typeof api().buildAskCovaDataContext,'function','context builder implemented');
 const raw={...empty(),workspaceRevision:1,workspaceRecords:[note('local','2026-11-02','selected note'),note('all','2026-11-03','global private note')]};
 const args={snapshot:raw,account:'local',range:'today',conversation:{message:'what did i write',history:[]}};
 const c=await api().buildAskCovaDataContext(args);assert.equal(c.scope.start,'2026-11-02');assert.equal(c.scope.end,'2026-11-02');assert.match(c.snapshotDigest,/^[a-f0-9]{64}$/);assert.ok(Object.isFrozen(c));
 const description=api().describeAskCovaDataContext(c);assert.equal(description.sources.daily_notes.count,1);assert.equal(description.sources.trades.count,0);assert.equal(description.sources.capabilities.status,'available');assert.doesNotMatch(JSON.stringify(description),/selected note|global private|11111111/);
 assert.throws(()=>api().describeAskCovaDataContext(structuredClone(c)),/account_data_unavailable/);
 const reversed=await api().buildAskCovaDataContext({...args,snapshot:{...raw,workspaceRecords:[...raw.workspaceRecords].reverse()}});assert.equal(reversed.snapshotDigest,c.snapshotDigest);
 for(const mutate of [s=>s.workspaceRecords[0].payload.note+=' changed',s=>s.passportPlans.push(plan()),s=>s.passportReviews.push(review())]){const snapshot=structuredClone(raw);mutate(snapshot);assert.notEqual((await api().buildAskCovaDataContext({...args,snapshot})).snapshotDigest,c.snapshotDigest);}
 assert.notEqual((await api().buildAskCovaDataContext({...args,conversation:{message:'another question',history:[]}})).contextDigest,c.contextDigest);
 assert.equal((await api().buildAskCovaDataContext({...args,account:'all'})).scope.end,'2026-11-03');
});
test('plain data byte bound stops traversal before oversized trailing objects',()=>{
 let inspected=0;const trailing=new Proxy({}, {getPrototypeOf(target){inspected++;return Object.getPrototypeOf(target);}});
 assert.throws(()=>api().copyAskCovaPlainData(['x'.repeat(80),'y'.repeat(80),trailing],100));assert.equal(inspected,0,'byte budget enforced during traversal, not only after stringify');
});
test('complete snapshot rejects duplicates, malformed tombstones, sparse arrays and oversized reads; valid tombstones stay hash-bound',async()=>{
 const active=note('local','2026-11-02','saved note'),dead={...active,payload:{},deletedAt:stamp};
 for(const records of [[active,active],[{...dead,payload:{note:'resurrect'}}],[{...active,revision:1.5}],[{...active,payload:{...active.payload,extra:'hidden'}}]])assert.equal(api().parseAskCovaDataSnapshot({...empty(),workspaceRevision:1,workspaceRecords:records}),null);
 const s={...empty(),workspaceRevision:1,workspaceRecords:[dead]};assert.ok(api().parseAskCovaDataSnapshot(s));const c=await api().buildAskCovaDataContext({snapshot:s,account:'local',range:'all',conversation:{message:'notes',history:[]}});assert.equal(api().describeAskCovaDataContext(c).sources.daily_notes.count,0);
 const changed=structuredClone(s);changed.workspaceRecords[0].revision=2;assert.notEqual((await api().buildAskCovaDataContext({snapshot:changed,account:'local',range:'all',conversation:{message:'notes',history:[]}})).snapshotDigest,c.snapshotDigest);
 assert.equal(api().parseAskCovaDataSnapshot({...empty(),workspaceRecords:Array(10001).fill(active)}),null);
 const nested={};let cursor=nested;for(let i=0;i<18;i++){cursor.next={};cursor=cursor.next;}assert.throws(()=>api().copyAskCovaPlainData(nested));
 const symbol=empty();symbol[Symbol('extra')]='bad';assert.equal(api().parseAskCovaDataSnapshot(symbol),null);
});
test('empty complete snapshot is meaningful detached immutable data; partial/extra data rejected',()=>{
 const raw=empty(), parsed=api().parseAskCovaDataSnapshot(raw);
 assert.deepEqual(parsed,raw);assert.notEqual(parsed,raw);assert.ok(Object.isFrozen(parsed.workspaceRecords));
 for(const change of [{complete:{...raw.complete,passportReviews:false}},{extra:true},{workspaceRevision:NaN},{owner:'someone'},{workspaceRecords:[{kind:'broker_cash'}]}]) assert.equal(api().parseAskCovaDataSnapshot({...raw,...change}),null);
});
