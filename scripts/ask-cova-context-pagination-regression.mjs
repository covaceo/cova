// Real context handler/client; synthetic saved rows only. Run with the no-live guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import load from './helpers/load-ts.cjs';
import { build } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
let client;
async function subject() {
 if (!client) {
  const entry=resolve('__context_pagination_test__.ts');
  const built=await build({configFile:false,envDir:false,logLevel:'error',plugins:[{name:'actual-pagination',resolveId(id){if(id===entry)return id;},load(id){if(id===entry)return ['askCovaQueryClient','askCovaClient','askCovaData','askCovaQuery'].map(name=>`export * from '${resolve('src/lib/'+name+'.ts').replaceAll(String.fromCharCode(92),'/')}';`).join('\n');}}],ssr:{noExternal:true},build:{ssr:entry,write:false,target:'node24'}});
  const out=resolve(process.env.ASK_COVA_EVIDENCE_ROOT || '../ask-cova-limit-evidence/pagination');mkdirSync(out,{recursive:true});const file=resolve(out,'actual-client.mjs');writeFileSync(file,built.output[0].code);client=await import(pathToFileURL(file));
 }
 return client;
}
const server = load('server/askCovaDataServer.ts');
const data = load('src/lib/askCovaData.ts');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const env = { ASK_COVA_ENABLED:'true', ASK_COVA_BETA_USER_ID:A };
const base = { action:'ask_cova_context', owner:A, account:'local', range:'all' };
const PAGE = 2097152, MAX = 8388608, VERSION = 'ask-cova-context-page-v1';
const empty = { version:'ask-cova-data-v1',owner:A,workspaceRevision:1,workspaceRecords:[],passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true} };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function largeSnapshot(size=MAX) {
 const snapshot = structuredClone(empty);
 snapshot.passportReviews = Array.from({length:4000},(_,i)=>({owner_id:A,session_day:new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10),account_key:'local',note:'Synthetic!',xp:15,reason:'',revision:1,evidence_hash:'a'.repeat(64),evidence_as_of:null,updated_at:'2026-10-29T00:00:00Z'}));
 let remaining = size - Buffer.byteLength(JSON.stringify(snapshot));
 for (const r of snapshot.passportReviews) { const n=Math.min(1990,remaining); r.note += 'x'.repeat(n); remaining-=n; }
 assert.equal(remaining,0,'fixture fits valid note ceilings');
 assert.equal(Buffer.byteLength(JSON.stringify(snapshot)),size);
 assert(data.parseAskCovaDataSnapshot(snapshot),'bounded fixture passes actual parser');
 return snapshot;
}
const large = largeSnapshot();
function storage(snapshot=large) {
 const events=[];
 const tables={workspace_records:[],passport_rule_plans:snapshot.passportPlans,passport_session_reviews:snapshot.passportReviews,passport_reward_days:snapshot.passportRewards};
 return { events, rest:async(path,options)=>{
  events.push({path,query:options.query});assert.equal(options.body,undefined);assert.equal(options.query.owner_id,'eq.'+A);
  if(path==='workspace_settings')return [{disclosure_version:'workspace-cloud-v1',revision:snapshot.workspaceRevision,pending_manifest:null}];
  assert(Object.hasOwn(tables,path),'read allowlist');const offset=Number(options.query.offset);return tables[path].slice(offset,offset+250);
 }};
}
async function serve(body=base,fixture=storage(),extra={}) {
 let status,payload;const headers={};
 await server.createAskCovaContextHandler()({body,rawBody:JSON.stringify(body),user:{id:A},environment:env,rest:fixture.rest,...extra},{setHeader(k,v){headers[k]=v;},status(n){status=n;return this;},json(value){payload=value;return this;}});
 return {status,payload,headers};
}
const cursor = page => ({ version:VERSION, owner:page.owner, snapshotHash:page.snapshotHash, totalBytes:page.totalBytes, offset:page.nextOffset });
function pagesFor(bytes=Buffer.from(JSON.stringify(large))) {
 const digest=hash(bytes),pages=[];
 for(let offset=0;offset<bytes.length;offset+=PAGE){const end=Math.min(offset+PAGE,bytes.length);pages.push({version:VERSION,owner:A,snapshotHash:digest,totalBytes:bytes.length,offset,nextOffset:end===bytes.length?null:end,encoding:'base64',chunk:bytes.subarray(offset,end).toString('base64')});}
 return pages;
}
const pages=pagesFor();
test('real server serves complete exact 8MiB snapshot in four hosting-safe hash-bound pages',async()=>{
 const f=storage(),chunks=[],measurements=[];let body=base;
 for(let i=0;i<4;i++) {
  const {status,payload:p,headers}=await serve(body,f);
  assert.equal(status,200);assert.equal(p.version,VERSION,'large context must not return oversized direct snapshot');
  assert.deepEqual(Object.keys(p).sort(),['version','owner','snapshotHash','totalBytes','offset','nextOffset','encoding','chunk'].sort());
  assert.equal(p.owner,A);assert.equal(p.totalBytes,MAX);assert.equal(p.encoding,'base64');assert.equal(p.offset,i*PAGE);
  assert.equal(p.nextOffset,i===3?null:(i+1)*PAGE);assert.equal(p.snapshotHash,hash(Buffer.from(JSON.stringify(large))));
  assert.equal(headers['Cache-Control'],'private, no-store');assert(Buffer.byteLength(JSON.stringify(p))<4500000);
  const chunk=Buffer.from(p.chunk,'base64');assert.equal(chunk.length,PAGE);chunks.push(chunk);
  measurements.push({offset:p.offset,decodedBytes:chunk.length,responseBytes:Buffer.byteLength(JSON.stringify(p)),requestBytes:Buffer.byteLength(JSON.stringify(body))});
  body={...base,cursor:cursor(p)};
 }
 assert.equal(Buffer.concat(chunks).toString('utf8'),JSON.stringify(large));
 assert.equal(f.events.filter(e=>e.path==='workspace_records'&&e.query.offset==='0').length,4,'each page independently reloads owner data');
 const out=resolve(process.env.ASK_COVA_EVIDENCE_ROOT || '../ask-cova-limit-evidence/pagination');mkdirSync(out,{recursive:true});
 writeFileSync(resolve(out,'measured-pages.json'),JSON.stringify({snapshotBytes:Buffer.concat(chunks).length,pages:measurements,maximumResponseBytes:Math.max(...measurements.map(p=>p.responseBytes)),source:'actual handler with synthetic validated 8MiB saved snapshot'},null,2));
});
test('small snapshot keeps the exact existing direct response',async()=>{
 const result=await serve(base,storage(empty));assert.equal(result.status,200);assert.deepEqual(result.payload,empty);
});
const input={owner:A,account:'local',range:'all',requestId:B,conversation:{message:'How many saved trades?',history:[]}};
const plan={version:'ask-cova-query-plan-v1',decision:{kind:'query',queries:[{id:'count',op:'aggregate',source:'trades',where:[],groupBy:[],measures:[{id:'total',op:'count',field:null}],orderBy:[],mode:'complete',limit:1}]}};
async function proof(core,snapshot) {
 const context=await core.buildAskCovaDataContext({snapshot,account:'local',range:'all',conversation:input.conversation});
 const result=await core.executeAskCovaQuery(context,plan);
 return {status:'ok',aiResponseUsed:true,protocolVersion:'ask-cova-v4',requestId:B,snapshotDigest:context.snapshotDigest,contextDigest:context.contextDigest,plan,planDigest:result.planDigest,resultDigest:result.resultDigest,answer:{version:'ask-cova-answer-v2',paragraphs:[{text:'Saved count: {{f:cell_0}}.',evidence:['observation_0']}],detail:[]}};
}
test('actual client reassembles and revalidates all four real server pages before single paid dispatch',async()=>{
 const core=await subject(),wire=await proof(core,large),calls=[],f=storage();
 const result=await core.requestAskCovaQuery(input,new AbortController().signal,async(url,init)=>{
  assert.equal(url,'/api/workspace');assert.equal(init.method,'POST');assert.equal(init.cache,'no-store');
  const body=JSON.parse(init.body);calls.push(body);
  if(body.action==='ask_cova_context') {const r=await serve(body,f);return new Response(JSON.stringify(r.payload),{status:r.status});}
  assert.equal(calls.length,5,'no generation before all four verified pages');assert.equal(body.snapshotDigest,wire.snapshotDigest);assert.equal(body.contextDigest,wire.contextDigest);assert(Buffer.byteLength(init.body)<4096);
  return new Response(JSON.stringify(wire));
 },()=>true);
 assert.equal(result.status,'ok');assert.equal(calls.length,5);assert.deepEqual(result.reply.snapshot,large);assert.deepEqual(result.reply.paragraphs,['Saved count: 0.']);
 for(let i=1;i<4;i++)assert.deepEqual(calls[i],{...base,cursor:{version:VERSION,owner:A,snapshotHash:hash(Buffer.from(JSON.stringify(large))),totalBytes:MAX,offset:i*PAGE}});
});
test('direct cutoff is inclusive and cutoff plus one byte completes via a one-byte final page',async()=>{
 const direct=largeSnapshot(PAGE),paged=largeSnapshot(PAGE+1),first=await serve(base,storage(direct));assert.deepEqual(first.payload,direct);
 const core=await subject(),wire=await proof(core,paged),f=storage(paged),responses=[];let paid=0;
 const result=await core.requestAskCovaQuery(input,new AbortController().signal,async(_,init)=>{const body=JSON.parse(init.body);if(body.action==='ask_cova'){paid++;return new Response(JSON.stringify(wire));}const r=await serve(body,f);responses.push(r.payload);return new Response(JSON.stringify(r.payload),{status:r.status});},()=>true);
 assert.equal(result.status,'ok');assert.equal(responses.length,2);assert.equal(Buffer.from(responses[1].chunk,'base64').length,1);assert.equal(responses[1].nextOffset,null);assert.equal(paid,1);assert.deepEqual(result.reply.snapshot,paged);
});
test('client deadline includes bounded sessions/auth, four context reads, paid work/cleanup and local allowance',async()=>{
 const core=await subject();assert.equal(core.ASK_COVA_QUERY_TIMEOUT_MS,4*(5000+10000+24000)+(5000+10000+54000+6000)+24000);
});
test('monotonic deadline rejects delayed page even before timer callback runs',async t=>{
 const core=await subject();let clock=0,calls=0,paid=0;t.mock.method(performance,'now',()=>clock);
 const result=await core.requestAskCovaQuery(input,new AbortController().signal,async(_,init)=>{
  const body=JSON.parse(init.body);if(body.action==='ask_cova'){paid++;return new Response('{}');}
  const n=calls++;if(n===1)clock=core.ASK_COVA_QUERY_TIMEOUT_MS;return new Response(JSON.stringify(pages[n]));
 },()=>true);
 assert.equal(result.status,'unavailable');assert.equal(calls,2);assert.equal(paid,0);
});
test('server rejects malformed cursors and revoked authority before any owner reads',async()=>{
 const valid=cursor(pages[0]);
 const mutations=[c=>c.version='future',c=>c.owner=B,c=>c.snapshotHash='A'.repeat(64),c=>c.snapshotHash='a',c=>c.totalBytes=MAX+1,c=>c.totalBytes=PAGE,c=>c.totalBytes=NaN,c=>c.offset=0,c=>c.offset=1,c=>c.offset=PAGE+1,c=>c.offset=MAX,c=>c.offset=-PAGE,c=>c.extra=true,c=>delete c.owner];
 for(const mutate of mutations){const c={...valid};mutate(c);const f=storage(empty);const r=await serve({...base,cursor:c},f);assert.equal(r.status,400,String(mutate));assert.equal(f.events.length,0);}
 for(const extra of [{user:{id:B}},{environment:{...env,ASK_COVA_ENABLED:'false'}}]){const f=storage(empty);const r=await serve({...base,cursor:valid},f,extra);assert.equal(r.status,404);assert.equal(f.events.length,0);}
 const f=storage(empty);assert.equal((await serve({...base,owner:B,cursor:{...valid,owner:B}},f)).status,400);assert.equal(f.events.length,0);
 let gets=0;const c={...valid};Object.defineProperty(c,'offset',{get(){gets++;return PAGE;}});
 assert.throws(()=>server.assertAskCovaDataRequest({body:{...base,cursor:c},user:{id:A},environment:env}),/invalid_request/);assert.equal(gets,0);
 const raw=JSON.stringify({...base,cursor:valid}).replace('"offset":','"offset":1,"offset":');
 assert.throws(()=>server.assertAskCovaDataRequest({body:{...base,cursor:valid},rawBody:raw,user:{id:A},environment:env}),/invalid_request/);
});
test('server fresh complete read rejects changed hash and size instead of continuing or restarting',async()=>{
 for(const [snapshot,c] of [[large,{...cursor(pages[0]),snapshotHash:'b'.repeat(64)}],[large,{...cursor(pages[0]),totalBytes:MAX-1}],[empty,cursor(pages[0])]]){
  const f=storage(snapshot),r=await serve({...base,cursor:c},f);assert.equal(r.status,409);assert.equal(r.payload.error,'context_changed');assert(f.events.length>0);
 }
});
test('actual workspace route reauthenticates page followups without billing and denies revoked owner before storage',async()=>{
 const {createWorkspaceHandler}=load('server/workspace.ts'),f=storage(),authCalls=[];let user=A;
 const handler=createWorkspaceHandler({enabled:()=>true,environment:()=>({...env,WORKSPACE_SYNC_PROJECT_REF:'aaaaaaaaaaaaaaaaaaaa',SUPABASE_URL:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'}),auth:async(_req,options)=>{authCalls.push(options);return{id:user};},rest:f.rest});
 async function route(body){let status,payload;await handler({method:'POST',url:'/api/workspace',body},{setHeader(){},status(n){status=n;return this;},json(p){payload=p;return this;}});return{status,payload};}
 const first=await route(base);assert.equal(first.status,200);const follow={...base,cursor:cursor(first.payload)};
 assert.equal((await route(follow)).status,200);const reads=f.events.length;user=B;assert.notEqual((await route(follow)).status,200);assert.equal(f.events.length,reads);assert.equal(authCalls.length,3);for(const options of authCalls){assert.deepEqual(Object.keys(options).sort(),['billing','fetchImpl']);assert.equal(options.billing,false);assert.equal(typeof options.fetchImpl,'function');}
});
test('client rejects page metadata, gaps, overlaps, base64 and response-size corruption before paid dispatch',async()=>{
 const core=await subject();
 const mutations=[p=>p.owner=B,p=>p.snapshotHash='b'.repeat(64),p=>p.totalBytes=MAX-1,p=>p.totalBytes=MAX+1,p=>p.offset=0,p=>p.offset+=1,p=>p.nextOffset-=1,p=>p.nextOffset+=1,p=>p.nextOffset=null,p=>p.encoding='utf8',p=>p.version='future',p=>p.extra=true,p=>delete p.owner,p=>p.chunk=p.chunk.slice(1),p=>p.chunk='!'+p.chunk.slice(1),p=>p.chunk=' '+p.chunk.slice(1),p=>p.chunk=p.chunk.slice(0,-2)+'B=',p=>p.chunk+='AAAA',p=>p.chunk='A'.repeat(2800001)];
 for(const mutate of mutations){let reads=0,paid=0;const corrupt={...pages[1]};mutate(corrupt);
  const result=await core.requestAskCovaQuery(input,new AbortController().signal,async(_,init)=>{if(JSON.parse(init.body).action==='ask_cova'){paid++;return new Response('{}');}return new Response(JSON.stringify(reads++===0?pages[0]:corrupt));},()=>true);
  assert.equal(result.status,'unavailable',String(mutate));assert.equal(reads,2,String(mutate));assert.equal(paid,0,String(mutate));
 }
});
test('client independently verifies whole hash, UTF8, unique JSON and complete snapshot owner/schema',async()=>{
 const core=await subject(),raw=Buffer.from(JSON.stringify(large));
 const invalidUtf8=Buffer.from(raw);invalidUtf8[PAGE]=255;
 const smaller={...large,passportReviews:large.passportReviews.slice(0,-1)};
 const duplicate=JSON.stringify(smaller).replace('{','{"owner":"'+A+'",');
 const variants=[pages.map(p=>({...p,snapshotHash:'a'.repeat(64)})),pagesFor(invalidUtf8),pagesFor(Buffer.from(duplicate)),pagesFor(Buffer.from(JSON.stringify({...smaller,owner:B}))),pagesFor(Buffer.from(JSON.stringify({...smaller,complete:{...smaller.complete,workspace:false}}))),pagesFor(Buffer.from(JSON.stringify({...smaller,workspaceRevision:-1})))];
 for(const variant of variants){let reads=0,paid=0;const result=await core.requestAskCovaQuery(input,new AbortController().signal,async(_,init)=>{if(JSON.parse(init.body).action==='ask_cova'){paid++;return new Response('{}');}return new Response(JSON.stringify(variant[reads++]));},()=>true);assert.equal(result.status,'unavailable');assert.equal(reads,variant.length);assert.equal(paid,0);}
});
test('client accepts UTF8 split across pages and a short final page without dropping bytes',async()=>{
 const core=await subject(),bytes=Buffer.from(JSON.stringify(large));assert.equal(bytes[PAGE-1],120);assert.equal(bytes[PAGE],120);bytes[PAGE-1]=0xc3;bytes[PAGE]=0xa9;
 const snapshot=JSON.parse(bytes.toString('utf8'));snapshot.passportReviews.pop();const encoded=Buffer.from(JSON.stringify(snapshot)),variant=pagesFor(encoded),wire=await proof(core,snapshot);let reads=0,paid=0;
 const result=await core.requestAskCovaQuery(input,new AbortController().signal,async(_,init)=>{if(JSON.parse(init.body).action==='ask_cova'){paid++;return new Response(JSON.stringify(wire));}return new Response(JSON.stringify(variant[reads++]));},()=>true);
 assert.equal(result.status,'ok');assert.equal(reads,4);assert.equal(paid,1);assert.deepEqual(result.reply.snapshot,snapshot);assert.equal(Buffer.byteLength(JSON.stringify(result.reply.snapshot)),encoded.length);
});
test('session-owner changes and authority revocation between pages never dispatch generation',async()=>{
 const core=await subject();
 for(const mode of ['session','authority','body','digest']) {
  let live=true,reads=0,sessions=0,paid=0;const originalDigest=crypto.subtle.digest.bind(crypto.subtle);
  const transport=core.createAskCovaTransport(A,{current:()=>live,session:async()=>({user:{id:++sessions===2&&mode==='session'?B:A},access_token:'synthetic-only'}),fetch:async(url,init)=>{
   assert.equal(url,'/api/workspace');if(JSON.parse(init.body).action==='ask_cova'){paid++;return new Response('{}');}
   const n=reads++;if(n===1&&mode==='authority')live=false;
   if(n===1&&mode==='body')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify(pages[n])));setImmediate(()=>{live=false;c.close();});}}));
   return new Response(JSON.stringify(pages[n]));
  }});
  if(mode==='digest')crypto.subtle.digest=async(...args)=>{const value=await originalDigest(...args);live=false;return value;};
  try {const result=await core.requestAskCovaQuery(input,new AbortController().signal,transport,()=>true);assert.equal(result.status,'unavailable',mode);assert.equal(paid,0,mode);assert.equal(reads,mode==='session'?1:mode==='digest'?4:2,mode);}
  finally {crypto.subtle.digest=originalDigest;}
 }
});
test('caller abort settles unresolved followup headers and bodies without retries',async()=>{
 const core=await subject();
 for(const mode of ['headers','body']){
  const controller=new AbortController();let reads=0,paid=0,canceled=false;
  const result=await core.requestAskCovaQuery(input,controller.signal,async(_,init)=>{
   if(JSON.parse(init.body).action==='ask_cova'){paid++;return new Response('{}');}
   if(++reads===1)return new Response(JSON.stringify(pages[0]));
   setImmediate(()=>controller.abort());
   if(mode==='headers')return new Promise(()=>{});
   return new Response(new ReadableStream({cancel(){canceled=true;}},{highWaterMark:0}));
  },()=>true);
  assert.equal(result.status,'unavailable');assert.equal(reads,2);assert.equal(paid,0);if(mode==='body')assert.equal(canceled,true);
 }
});
test('own deadline settles unresolved followup and cancels a late response',{timeout:5000},async t=>{
 // Keep monotonic time and fake timers on the same exact logical clock.
 const core=await subject();let clock=0;t.mock.method(performance,'now',()=>clock);t.mock.timers.enable({apis:['setTimeout']});let reads=0,paid=0,release,ready,canceled=false;
 const second=new Promise(r=>ready=r);
 const pending=core.requestAskCovaQuery(input,new AbortController().signal,async(_,init)=>{
  if(JSON.parse(init.body).action==='ask_cova'){paid++;return new Response('{}');}
  if(++reads===1)return new Response(JSON.stringify(pages[0]));
  ready();return new Promise(r=>release=r);
 },()=>true);
 await second;clock+=core.ASK_COVA_QUERY_TIMEOUT_MS;t.mock.timers.tick(core.ASK_COVA_QUERY_TIMEOUT_MS);assert.equal((await pending).status,'unavailable');
 release(new Response(new ReadableStream({cancel(){canceled=true;}},{highWaterMark:0})));await new Promise(r=>setImmediate(r));assert.equal(canceled,true);assert.equal(reads,2);assert.equal(paid,0);
});
test('context HTTP errors and malformed duplicate page JSON stop the read without retry or paid dispatch',async()=>{
 const core=await subject();
 for(const [status,error] of [[409,'context_changed'],[422,'workspace_too_large'],[503,'account_data_unavailable'],[401,'unknown'],[200,'duplicate'],[200,'direct-followup'],[200,'early-final']]){
  let reads=0,paid=0;const result=await core.requestAskCovaQuery(input,new AbortController().signal,async(_,init)=>{
   if(JSON.parse(init.body).action==='ask_cova'){paid++;return new Response('{}');}
   if(++reads===1)return new Response(JSON.stringify(pages[0]));
   const payload=error==='duplicate'?JSON.stringify(pages[1]).replace('{','{"offset":0,'):error==='direct-followup'?JSON.stringify(empty):error==='early-final'?JSON.stringify({...pages[1],nextOffset:null}):JSON.stringify({status:'unavailable',error});
   return new Response(payload,{status});
  },()=>true);
  assert.equal(result.status,'unavailable');assert.equal(reads,2);assert.equal(paid,0);if(error==='context_changed')assert.match(result.message,/changed.*sync/i);if(error==='workspace_too_large')assert.match(result.message,/No partial data/);
 }
});
test('first-page bounds reject impossible totals and final-page metadata cannot create a fifth read',async()=>{
 const core=await subject();
 for(const [index,patch] of [[0,{totalBytes:MAX+1}],[0,{totalBytes:PAGE}],[0,{totalBytes:MAX+0.5}],[0,{offset:PAGE}],[3,{nextOffset:MAX}]]) {
  let reads=0,paid=0;const result=await core.requestAskCovaQuery(input,new AbortController().signal,async(_,init)=>{if(JSON.parse(init.body).action==='ask_cova'){paid++;return new Response('{}');}const n=reads++;return new Response(JSON.stringify(n===index?{...pages[n],...patch}:pages[n]));},()=>true);
  assert.equal(result.status,'unavailable');assert.equal(reads,index+1);assert.equal(paid,0);
 }
});
test('missing-source failure message accepts only explicit 422 and 503 status codes',async()=>{
 const core=await subject();
 for(const status of [422,503,400,401,409,429,500]) {
  let calls=0;const result=await core.requestAskCovaQuery(input,new AbortController().signal,async()=>new Response(JSON.stringify(++calls===1?empty:{status:'unavailable',error:'account_data_unavailable'}),{status:calls===1?200:status}),()=>true);
  assert.equal(calls,2);
  if([422,503].includes(status))assert.match(result.message,/saved account data needed for this answer is unavailable/,String(status));
  else assert.doesNotMatch(result.message,/needed for this answer/,String(status));
 }
});
