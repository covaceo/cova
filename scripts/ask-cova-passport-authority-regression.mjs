// Native ESM actual Passport + authorizedFetch; only auth provider/network are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const out = resolve(process.env.ASK_COVA_EVIDENCE_ROOT || '../ask-cova-account-data-evidence/passport-authority', 'native');
mkdirSync(out, { recursive: true });
const owner = '11111111-1111-4111-8111-111111111111';
const other = '33333333-3333-4333-8333-333333333333';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(r => setImmediate(r));
let subject;
async function load() {
  if (subject) return subject;
  const entry = resolve('__passport_native__.ts');
  const built = await build({ configFile:false, envDir:false, logLevel:'error', plugins:[{
    name:'synthetic-auth-only', resolveId(id) { if(id===entry)return id; }, load(id) {
      if(id===entry)return `export * from '${resolve('src/lib/passportProgressClient.ts').replaceAll('\\','/')}';export * from '${resolve('src/lib/passportMutationAuthority.ts').replaceAll('\\','/')}';`;
      if (id.replaceAll('\\','/').endsWith('/src/lib/supabaseClient.ts')) return `export const getSupabaseClient=()=>({auth:{getSession:()=>globalThis.passportAuth()}});`;
    }
  }], ssr:{noExternal:true}, build:{ssr:entry,write:false,target:'node24',rollupOptions:{output:{codeSplitting:false}}} });
  const file=resolve(out,'actual-passport.mjs'); writeFileSync(file,built.output[0].code);
  subject=await import(pathToFileURL(file)); return subject;
}
function setup() {
  globalThis.window = new EventTarget();
  const events=[],calls=[];
  window.addEventListener('cova:passport-data-change', e => events.push(e.detail));
  globalThis.passportAuth = async () => ({data:{session:{user:{id:owner},access_token:'synthetic-token'}}});
  globalThis.fetch = async (url, init) => { calls.push({url,init}); return new Response('{}'); };
  return {events,calls};
}
test('plan reserves owner mutation authority synchronously before auth, settles after actual transport', async () => {
  const {requestPassportProgress}=await load(), {events,calls}=setup();
  const auth=deferred(); globalThis.passportAuth=()=>auth.promise;
  const pending=requestPassportProgress(owner,{action:'plan',limits:{maxContracts:2}});
  assert.equal(events.length,1,'missing synchronous Passport mutation start before auth');
  assert.deepEqual(events[0],{owner,pending:true,pendingCount:1,epoch:1});
  assert.equal(calls.length,0);
  auth.resolve({data:{session:{user:{id:owner},access_token:'synthetic-token'}}});
  assert.deepEqual(await pending,{});
  assert.deepEqual(events[1],{owner,pending:false,pendingCount:0,epoch:2});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'/api/passport');
  assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[0].init.credentials,'include');
  assert.equal(new Headers(calls[0].init.headers).get('Authorization'),'Bearer synthetic-token');
  assert.equal(new Headers(calls[0].init.headers).get('Content-Type'),'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body),{action:'plan',limits:{maxContracts:2},owner});
});
test('overlapping plan/review/inspect aggregate per owner until final settlement; GET never mutates',async()=>{
 const {requestPassportProgress:request,readPassportMutationAuthority:read}=await load(),{events,calls}=setup();
 const before=read(owner),gates=[];
 globalThis.fetch=async(url,init)=>{calls.push({url,init});const gate=deferred();gates.push(gate);return gate.promise;};
 const jobs=['plan','review','inspect'].map(action=>request(owner,{action,owner:other}));
 const get=request(owner);
 assert.deepEqual(read(owner),{pendingCount:3,epoch:before.epoch+3});
 await tick();assert.equal(gates.length,4);
 gates[1].resolve(new Response('{}'));await jobs[1];
 assert.deepEqual(read(owner),{pendingCount:2,epoch:before.epoch+4});
 gates[3].resolve(new Response('{}'));await get;
 assert.deepEqual(read(owner),{pendingCount:2,epoch:before.epoch+4},'GET settlement cannot decrement POST count');
 gates[0].resolve(new Response('{}'));await jobs[0];
 assert.equal(read(owner).pendingCount,1);
 gates[2].resolve(new Response('{}'));await jobs[2];
 assert.deepEqual(read(owner),{pendingCount:0,epoch:before.epoch+6});
 assert.deepEqual(events.map(x=>x.pendingCount),[1,2,3,2,1,0]);
 assert.deepEqual(events.map(x=>x.pending),[true,true,true,true,true,false]);
 for(const call of calls.slice(0,3))assert.equal(JSON.parse(call.init.body).owner,owner,'caller cannot override owner');
 assert.equal(calls[3].url,'/api/passport?owner='+owner);assert.equal(calls[3].init.method,'GET');assert.equal(calls[3].init.body,undefined);
});
test('separate owner state survives auth changes and releasing another owner does not clear it',async()=>{
 const {requestPassportProgress:request,readPassportMutationAuthority:read}=await load();setup();const gates=[];
 let active=owner;globalThis.passportAuth=async()=>({data:{session:{user:{id:active},access_token:'synthetic'}}});
 globalThis.fetch=async()=>{const gate=deferred();gates.push(gate);return gate.promise;};
 const a=request(owner,{action:'plan'});await tick();active=other;
 const b=request(other,{action:'inspect'});await tick();
 assert.equal(read(owner).pendingCount,1);assert.equal(read(other).pendingCount,1);
 gates[1].resolve(new Response('{}'));await b;
 assert.equal(read(owner).pendingCount,1);assert.equal(read(other).pendingCount,0);
 active=owner;gates[0].resolve(new Response('{}'));await a;
 assert.equal(read(owner).pendingCount,0);
});
for(const failure of ['auth-reject','wrong-owner','missing-token','network','json','http','invalid-state','foreign-receipt','owner-after-response','serialization','pre-abort','fetch-abort','body-abort','timeout']){
 test('finally releases exactly once on '+failure,async(t)=>{
  const {requestPassportProgress:request,readPassportMutationAuthority:read}=await load(),{events,calls}=setup();
  const before=read(owner),abort=new AbortController();let body={action:'review'},expected=/failure/,authCalls=0;
  if(failure==='auth-reject')globalThis.passportAuth=async()=>{throw Error('auth failure');};
  if(failure==='wrong-owner'){globalThis.passportAuth=async()=>({data:{session:{user:{id:other}}}});expected=/session changed/;}
  if(failure==='missing-token'){globalThis.passportAuth=async()=>({data:{session:{user:{id:owner}}}});expected=/Sign in/;}
  if(failure==='network')globalThis.fetch=async()=>{throw Error('network failure');};
  if(failure==='json'){globalThis.fetch=async()=>new Response('invalid JSON');expected=SyntaxError;}
  if(failure==='http')globalThis.fetch=async()=>new Response(JSON.stringify({error:'server failure'}),{status:403});
  if(failure==='invalid-state'){globalThis.fetch=async()=>new Response(JSON.stringify({state:{owner_id:owner,total_xp:-1,receipts:[]}}));expected=/Progress does not match/;}
  if(failure==='foreign-receipt'){globalThis.fetch=async()=>new Response(JSON.stringify({receipt:{owner_id:other}}));expected=/Review does not match/;}
  if(failure==='owner-after-response'){globalThis.passportAuth=async()=>({data:{session:{user:{id:++authCalls<3?owner:other},access_token:'synthetic'}}});expected=/session changed/;}
  if(failure==='serialization'){body.self=body;expected=/circular/i;}
  if(failure==='pre-abort'){abort.abort();expected={name:'AbortError'};}
  if(failure==='fetch-abort'||failure==='timeout'){
   expected={name:'AbortError'};
   if(failure==='timeout')t.mock.method(AbortSignal,'timeout',ms=>{assert.equal(ms,20000);return abort.signal;});
   globalThis.fetch=async(_,init)=>{calls.push({init});return new Promise((_,reject)=>{init.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});queueMicrotask(()=>abort.abort());});};
  }
  if(failure==='body-abort'){expected={name:'AbortError'};globalThis.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{}'));abort.abort();c.close();}}));}
  const pending=request(owner,body,failure==='timeout'?undefined:abort.signal);
  assert.equal(read(owner).pendingCount,1);
  await assert.rejects(pending,expected);
  assert.deepEqual(read(owner),{pendingCount:0,epoch:before.epoch+2});
  assert.deepEqual(events.map(x=>x.pendingCount),[1,0]);
  if(['auth-reject','wrong-owner','missing-token','serialization','pre-abort'].includes(failure))assert.equal(calls.length,0);
 });
}
test('GET success and failure preserve epoch and returned state validation without lifecycle events',async()=>{
 const {requestPassportProgress:request,readPassportMutationAuthority:read}=await load(),{events}=setup(),before=read(owner);
 const state={owner_id:owner,total_xp:15,receipts:[{owner_id:owner,xp:15}]};
 globalThis.fetch=async()=>new Response(JSON.stringify(state));assert.deepEqual(await request(owner),state);
 globalThis.fetch=async()=>new Response(JSON.stringify({...state,owner_id:other}));await assert.rejects(request(owner),/Progress does not match/);
 assert.deepEqual(read(owner),before);assert.deepEqual(events,[]);
});
test('an empty owner still releases its reservation when existing auth validation rejects it',async()=>{
 const {requestPassportProgress:request,readPassportMutationAuthority:read}=await load(),{events,calls}=setup();
 await assert.rejects(request('',{action:'plan'}),/session changed/);
 assert.deepEqual(events.map(x=>x.pendingCount),[1,0],'rejected owner must not underflow');
 assert.deepEqual(read(''),{pendingCount:0,epoch:2});assert.equal(calls.length,0);
});
test('authority snapshots are immutable, retained without subscribers, and release is idempotent',async()=>{
 const {beginPassportMutation:begin,readPassportMutationAuthority:read}=await load();setup();
 const before=read(owner);const release=begin(owner),pending=read(owner);
 assert.ok(Object.isFrozen(pending));assert.equal(pending.pendingCount,1);assert.equal(before.pendingCount,0);
 release();release();assert.deepEqual(read(owner),{pendingCount:0,epoch:before.epoch+2});
 assert.equal(pending.pendingCount,1,'old snapshots cannot change beneath readers');
 assert.deepEqual(read(undefined),{pendingCount:0,epoch:0});
 delete globalThis.window;
 const finish=begin(owner);assert.equal(read(owner).pendingCount,1);finish();assert.equal(read(owner).pendingCount,0);
});
