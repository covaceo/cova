// Independent offline review: actual committed default handler and native source.
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'vite';
import loadSource from './helpers/load-ts.cjs';
const root=process.cwd().replaceAll('\\','/'),out=resolve(process.env.ASK_COVA_EVIDENCE_ROOT || '../ask-cova-account-data-evidence/review-fixes/deadline-complete');mkdirSync(out,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const base={action:'ask_cova_context',owner:A,account:'local',range:'all'};
const empty={version:'ask-cova-data-v1',owner:A,workspaceRevision:1,workspaceRecords:[],passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}};
const env={WORKSPACE_SYNC_ENABLED:'true',WORKSPACE_SYNC_PROJECT_REF:'aaaaaaaaaaaaaaaaaaaa',SUPABASE_URL:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',ASK_COVA_ENABLED:'true',ASK_COVA_BETA_USER_ID:A,OPENAI_API_KEY:'synthetic-not-real-provider-key',ASK_COVA_BUDGET_ID:'synthetic-integration',ASK_COVA_BUDGET_MICRO_USD:'1000000',KV_REST_API_URL:'https://synthetic.upstash.io',KV_REST_API_TOKEN:'synthetic-not-real-budget-key-123456789'};
Object.assign(env,{COVA_BILLING_MODE:'sandbox',COVA_BILLING_ALLOWED_USERS:A+','+B,COVA_BILLING_ORIGIN:'https://synthetic-billing.invalid',STRIPE_SECRET_KEY:'sk_test_synthetic_only_not_real',STRIPE_ACCOUNT_ID:'acct_synthetic',STRIPE_PRO_PRICE_ID:'price_synthetic',STRIPE_PORTAL_CONFIGURATION_ID:'bpc_synthetic'});
Object.assign(process.env,env);
// Separate executable source bundle embeds installed dependencies so an external
// evidence directory needs no node_modules links or product-file writes.
const executable=await build({root,configFile:false,envDir:false,logLevel:'error',ssr:{noExternal:true},build:{ssr:root+'/server/workspace.ts',target:'node24',write:false,minify:false,rollupOptions:{output:{format:'es',codeSplitting:false}}}});
assert.equal(executable.output.length,1);writeFileSync(out+'/native-source.mjs',executable.output[0].code);
const entry=root+'/__route_deadline_client__.ts';
const clientBuild=await build({root,configFile:false,envDir:false,logLevel:'error',plugins:[{name:'real-deadline-client',resolveId(id){if(id.endsWith('__route_deadline_client__.ts'))return id;},load(id){if(id.endsWith('__route_deadline_client__.ts'))return ['askCovaQueryClient','askCovaClient','askCovaData','askCovaQuery'].map(n=>`export * from '${root}/src/lib/${n}.ts';`).join('\n');}}],ssr:{noExternal:true},build:{ssr:entry,target:'node24',write:false,minify:false,rollupOptions:{output:{format:'es',codeSplitting:false}}}});
assert.equal(clientBuild.output.length,1);writeFileSync(out+'/actual-client.mjs',clientBuild.output[0].code);
const core=await import(pathToFileURL(out+'/actual-client.mjs'));
const plan={version:'ask-cova-query-plan-v1',decision:{kind:'converse',reason:'greeting'}};
const conversation={message:'hello cova',history:[]};
let delegate=()=>{throw Error('Unassigned synthetic delegate');};
globalThis.fetch=(...args)=>delegate(...args);
const nativeSource=await import(pathToFileURL(out+'/native-source.mjs'));
const handlers={committed:(await import(pathToFileURL(root+'/api/workspace.js'))).default,source:loadSource('server/workspace.ts').default,native:nativeSource.default};
let clock=0,virtual=false,workDelay=false;
const realNow=performance.now.bind(performance);
Object.defineProperty(performance,'now',{configurable:true,value:()=>virtual?clock:realNow()});
function fixture(snapshot=empty,mode='ok'){
 let counts=0,gens=0,settings=0,storageCalls=0;const events=[],payloads=[],commands=[];
 const countsFor=mode==='c1-over'?[8193,1]:mode==='sum-over'?[8192,19905]:[8192,19904];
 const reply=x=>new Response(JSON.stringify(x));
 const tables={workspace_records:snapshot.workspaceRecords.map(r=>({kind:r.kind,record_id:r.recordId,account_id:r.accountId,schema_version:r.schemaVersion,payload:r.payload,revision:r.revision,created_at:r.createdAt,updated_at:r.updatedAt,deleted_at:r.deletedAt})),passport_rule_plans:snapshot.passportPlans,passport_session_reviews:snapshot.passportReviews,passport_reward_days:snapshot.passportRewards};
 let answer;
 const setup=async()=>{const context=await core.buildAskCovaDataContext({snapshot,account:'local',range:'all',conversation});const result=await core.executeAskCovaQuery(context,plan);answer={version:'ask-cova-answer-v2',paragraphs:[{text:'hello, what would you like to review?',evidence:[result.observations[0].id]}],detail:[]};return {body:{...base,action:'ask_cova',protocolVersion:'ask-cova-v4',requestId:id,snapshotDigest:context.snapshotDigest,contextDigest:context.contextDigest,conversation},result};};
 const fetch=async(url,options={})=>{
  const u=new URL(url);const tick=n=>{if(virtual&&workDelay)clock+=n;};
  if(u.origin===env.SUPABASE_URL&&u.pathname==='/auth/v1/user'){events.push('auth');tick(4500);assert.equal(options.headers.Authorization,'Bearer synthetic-session');return mode==='invalid-auth'?new Response('{}',{status:401}):reply({id:mode==='foreign-auth'?B:A,app_metadata:{plan:'free'}});}
  if(u.origin===env.SUPABASE_URL&&u.pathname==='/rest/v1/policy_acceptances'){events.push('policy');tick(4500);assert.equal(u.searchParams.get('user_id'),'eq.'+(mode==='foreign-auth'?B:A));return reply(mode==='policy-denied'?[]:[{id:'synthetic-policy'}]);}
  if(u.origin===env.SUPABASE_URL&&u.pathname.startsWith('/rest/v1/')){
   const table=u.pathname.split('/').at(-1);assert(table==='workspace_settings'||Object.hasOwn(tables,table));events.push(table);storageCalls++;
   tick(storageCalls<=2?8000:storageCalls===3?7000:0);
   assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.body,undefined);assert.equal(u.searchParams.get('owner_id'),'eq.'+A);
   if(table==='workspace_settings'){settings++;return reply([{disclosure_version:'workspace-cloud-v1',revision:mode==='context-drift'&&gens?2:snapshot.workspaceRevision,pending_manifest:null}]);}
   assert.equal(u.searchParams.get('limit'),'250');const offset=Number(u.searchParams.get('offset'));const rows=tables[table].slice(offset,offset+250);return reply(rows);
  }
  if(u.origin===env.KV_REST_API_URL){const cmd=JSON.parse(options.body);commands.push(cmd);if(mode==='billing-control'&&cmd[0]==='GET'){assert.match(cmd[1],/^cova:billing:v1:sandbox:acct_synthetic:owner:/);events.push('billing-read');return reply({result:null});}assert.equal(cmd[0],'EVAL');tick(1000);if(cmd[2]==='5'){events.push('reserve');assert.equal(cmd[10],'4000');return reply({result:mode==='permit-denied'?[0,5]:[1,0]});}assert.equal(cmd[2],'1');assert.doesNotMatch(cmd[1],/HSET|DECR|HINCRBY|budget/i);events.push('release');return reply({result:1});}
  if(u.href==='https://api.openai.com/v1/responses/input_tokens'){
   counts++;events.push('count');tick(1000);payloads.push({kind:'count',body:JSON.parse(options.body)});
   if(mode==='bad-count'||mode==='bad-second-count'&&counts===2)return new Response('{"object":"response.input_tokens","input_tokens":0,"input_tokens":100}');
   return reply({object:'response.input_tokens',input_tokens:countsFor[counts-1]});
  }
  if(u.href==='https://api.openai.com/v1/responses'){
   gens++;events.push('generation');tick(12000);payloads.push({kind:'generation',body:JSON.parse(options.body)});
   const value=gens===1?plan:answer;
   return reply({model:'gpt-6-luna',status:'completed',service_tier:'default',usage:{input_tokens:countsFor[gens-1],output_tokens:gens===1?384:640,total_tokens:countsFor[gens-1]+(gens===1?384:640)},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(value),annotations:[]}]}]});
  }
  throw Error('NETWORK_BOUNDARY unexpected destination '+u.origin+u.pathname);
 };
 return{events,payloads,commands,setup,fetch,counts:()=>counts,gens:()=>gens,resetStorage:()=>{storageCalls=0;}};
}
async function invoke(handler,body,f){delegate=f.fetch;let status,payload;const headers={};await handler({method:'POST',url:'/api/workspace',headers:{authorization:'Bearer synthetic-session'},body},{setHeader(k,v){headers[k]=v;},status(n){status=n;return this;},json(value){f.events.push('response');payload=value;return this;}});assert.equal(headers['Cache-Control'],'private, no-store');return{status,payload};}

// Independent maximum-sized valid snapshot, not a mocked partial page.
const large=structuredClone(empty);
large.passportReviews=Array.from({length:4000},(_,i)=>({owner_id:A,session_day:new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10),account_key:'local',note:'review note',xp:15,reason:'',revision:1,evidence_hash:'a'.repeat(64),evidence_as_of:null,updated_at:'2026-10-30T00:00:00Z'}));
let remaining=8388608-Buffer.byteLength(JSON.stringify(large));for(const row of large.passportReviews){const n=Math.min(1989,remaining);row.note+='x'.repeat(n);remaining-=n;}assert.equal(remaining,0);assert.equal(Buffer.byteLength(JSON.stringify(large)),8388608);
assert(core.parseAskCovaDataSnapshot(large),'independent large fixture must pass actual parser');const bytes=Buffer.from(JSON.stringify(large));

// Acceptance assertions, not a reproducer that passes on known data loss.
// This is synthetic virtual timing, not measured production service latency.
const records=[];
async function runAttempt(handler,{slow=false,sessionMs=0,finalAt}={}) {
 const f=fixture(large);await f.setup();clock=0;virtual=true;workDelay=slow;const statuses=[];let sessions=0,reads=0,paid=0;
 const transport=core.createAskCovaTransport(A,{current:()=>true,session:async()=>{sessions++;if(virtual)clock+=sessionMs;return {user:{id:A},access_token:'synthetic-session'};},fetch:async(_url,init)=>{
  assert.equal(new Headers(init.headers).get('Authorization'),'Bearer synthetic-session');
  const body=JSON.parse(init.body);f.resetStorage();if(body.action==='ask_cova_context')reads++;else paid++;
  const r=await invoke(handler,body,f);statuses.push(r.status);
  if(body.action==='ask_cova'&&finalAt!==undefined){virtual=true;clock=finalAt;}
  return new Response(JSON.stringify(r.payload),{status:r.status});
 }},{boundedSession:true});
 let result;try {result=await core.requestAskCovaQuery({owner:A,account:'local',range:'all',requestId:id,conversation},new AbortController().signal,transport,()=>true);}finally{virtual=false;}
 const record={clientStatus:result.status,elapsedMs:clock,deadlineMs:core.ASK_COVA_QUERY_TIMEOUT_MS,statuses,sessions,reads,paid,auth:f.events.filter(x=>x==='auth').length,policy:f.events.filter(x=>x==='policy').length,reservations:f.events.filter(x=>x==='reserve').length,counts:f.counts(),generations:f.gens(),releases:f.events.filter(x=>x==='release').length,commands:f.commands.map(c=>({operation:c[0],keys:c[2]}))};
 assert.deepEqual(statuses,[200,200,200,200,200]);assert.equal(sessions,5);assert.equal(record.auth,5);assert.equal(record.policy,5);assert.equal(reads,4);assert.equal(paid,1);assert.equal(record.reservations,1);assert.equal(record.counts,2);assert.equal(record.generations,2);assert.equal(record.releases,1);assert.deepEqual(record.commands,[{operation:'EVAL',keys:'5'},{operation:'EVAL',keys:'1'}]);
 return record;
}
function save(name,record){records.push({name,...record});writeFileSync(out+'/route-deadline-results.json',JSON.stringify({synthetic:true,records},null,2));}
for(const [name,handler] of Object.entries(handlers)) {
 test(name+': fast actual client/native route positive control',async()=>{const r=await runAttempt(handler);save(name+' fast',r);assert.equal(r.clientStatus,'ok');});
 test(name+': INT-01 accepts 188000ms successful paid response including repeated auth/policy',async()=>{const r=await runAttempt(handler,{slow:true});save(name+' INT-01',r);assert.equal(r.elapsedMs,188000);assert.equal(r.clientStatus,'ok','all five native HTTP 200 responses must not be discarded after two paid generations');});
 test(name+': successful path also accounts for all five client session resolutions',async()=>{const r=await runAttempt(handler,{slow:true,sessionMs:1000});save(name+' session-cost',r);assert.equal(r.elapsedMs,193000);assert.equal(r.clientStatus,'ok');});
}
// Check both sides of the currently declared deadline using actual paid replies.
for(const [offset,expected] of [[-1,'ok'],[0,'unavailable'],[1,'unavailable']]) {
 test('native paid answer at client deadline '+offset+'ms is '+expected,async()=>{clock=0;virtual=true;const r=await runAttempt(handlers.source,{finalAt:core.ASK_COVA_QUERY_TIMEOUT_MS+offset});save('boundary '+offset,r);assert.equal(r.clientStatus,expected);});
}
test('client deadline still settles an uncooperative session without dispatch or automatic retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let sessions=0,fetches=0;
 const transport=core.createAskCovaTransport(A,{current:()=>true,session:()=>{sessions++;return new Promise(()=>{});},fetch:async()=>{fetches++;throw Error('must not dispatch');}});
 const pending=core.requestAskCovaQuery({owner:A,account:'local',range:'all',requestId:id,conversation},new AbortController().signal,transport,()=>true);
 t.mock.timers.tick(core.ASK_COVA_QUERY_TIMEOUT_MS);assert.equal((await pending).status,'unavailable');assert.equal(sessions,1);assert.equal(fetches,0);
});
test('client budget derives all five sessions/auth pairs, four reads, paid cleanup and existing local allowance',()=>{
 assert.equal(core.ASK_COVA_QUERY_TIMEOUT_MS,4*(5000+2*5000+24000)+(5000+2*5000+54000+6000)+24000);
});
for(const phase of ['context-headers','context-body','context-replay'])for(const delta of [-1,0,1])test(`paid admission after ${phase} edge ${delta}`,async()=>{
 const f=fixture();await f.setup();clock=0;virtual=true;workDelay=false;let paid=0,contextRead=false;const originalDigest=crypto.subtle.digest.bind(crypto.subtle);
 const consume=()=>{clock=core.ASK_COVA_QUERY_TIMEOUT_MS-(5000+10000+54000+6000+12000)+delta;};
 if(phase==='context-replay')crypto.subtle.digest=async(...args)=>{const result=await originalDigest(...args);if(contextRead)consume();return result;};
 const transport=core.createAskCovaTransport(A,{current:()=>true,session:async()=>({user:{id:A},access_token:'synthetic-session'}),fetch:async(_,init)=>{
  const body=JSON.parse(init.body);if(body.action==='ask_cova')paid++;
  const r=await invoke(handlers.source,body,f);
  if(body.action==='ask_cova_context'){
   if(phase==='context-headers')consume();contextRead=true;
   if(phase==='context-body')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify(r.payload)));queueMicrotask(()=>{consume();c.close();});}}));
  }
  return new Response(JSON.stringify(r.payload),{status:r.status});
 }},{boundedSession:true});
 let result;try{result=await core.requestAskCovaQuery({owner:A,account:'local',range:'all',requestId:id,conversation},new AbortController().signal,transport,()=>true);}finally{crypto.subtle.digest=originalDigest;virtual=false;}
 assert.equal(paid,delta<0?1:0);assert.equal(result.status,delta<0?'ok':'unavailable');assert.equal(f.events.filter(e=>e==='reserve').length,delta<0?1:0);assert.equal(f.gens(),delta<0?2:0);
});
for(const mode of ['hung','caller-abort'])test(`v4 finite session ${mode} settles and denies late dispatch`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});clock=0;virtual=true;let release,calls=0,settled=false;const controller=new AbortController();
 const transport=core.createAskCovaTransport(A,{current:()=>true,session:()=>new Promise(r=>release=r),fetch:async()=>{calls++;return new Response('{}');}},{boundedSession:true});
 const pending=transport('/api/workspace',{signal:controller.signal}).then(()=>null,e=>{settled=true;return e;});
 if(mode==='caller-abort')controller.abort();else{clock=5000;t.mock.timers.tick(5000);}await flush();const before=settled;
 release({user:{id:A},access_token:'synthetic-session'});await pending;await flush();virtual=false;
 assert.equal(before,true);assert.equal(calls,0);
});
for(const delta of [-1,0,1])test(`v4 session monotonic edge ${delta}`,async()=>{
 clock=0;virtual=true;let calls=0;
 const transport=core.createAskCovaTransport(A,{current:()=>true,session:async()=>{clock+=5000+delta;return {user:{id:A},access_token:'synthetic-session'};},fetch:async()=>{calls++;return new Response('{}');}},{boundedSession:true});
 let error;try{await transport('/api/workspace');}catch(e){error=e;}finally{virtual=false;}
 assert.equal(calls,delta<0?1:0);assert.equal(!!error,delta>=0);
});
test('legacy transport retains original session timing',async()=>{
 clock=0;virtual=true;let calls=0;
 const transport=core.createAskCovaTransport(A,{current:()=>true,session:async()=>{clock+=5001;return {user:{id:A},access_token:'synthetic-session'};},fetch:async()=>{calls++;return new Response('{}');}});
 await transport('/api/workspace');virtual=false;assert.equal(calls,1);
});
const flush=()=>new Promise(r=>setImmediate(r));
for(const runtime of ['source','native'])for(const action of ['context','v4'])for(const phase of ['auth','policy'])for(const kind of ['headers','body'])test(`${runtime} bounded default ${action} ${phase} ${kind}: hung and late completion cannot dispatch`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});clock=0;virtual=true;workDelay=false;
 const f=fixture();const {body}=await f.setup();let release,phaseSignal,cancelled=0,settled=false;
 const original=f.fetch;f.fetch=async(url,options)=>{
  const match=String(url).includes(phase==='auth'?'/auth/v1/user':'/policy_acceptances');
  if(!match)return original(url,options);
  f.events.push(phase);phaseSignal=options.signal;
  const value=phase==='auth'?{id:A,app_metadata:{plan:'free'}}:[{id:'synthetic-policy'}];
  if(kind==='headers')return new Promise(r=>release=()=>r(new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify(value)));c.close();},cancel(){cancelled++;}}))));
  return new Response(new ReadableStream({start(c){release=()=>{try{c.enqueue(new TextEncoder().encode(JSON.stringify(value)));c.close();}catch{}};},cancel(){cancelled++;}}));
 };
 const pending=invoke(handlers[runtime],action==='context'?base:body,f).then(r=>{settled=true;return r;});
 await flush();assert.equal(typeof release,'function');clock=5000;t.mock.timers.tick(5000);await flush();
 const before=settled;release();await flush();const result=await pending;virtual=false;
 save(`${runtime} ${action} ${phase} ${kind} bounded`,{settledAtPhaseDeadline:before,status:result.status,events:f.events,signalAborted:phaseSignal.aborted,cancelled});
 assert.equal(before,true,'default auth/policy must settle at 5000ms even if transport ignores signal');assert.equal(result.status,503);assert.equal(phaseSignal.aborted,true);
 assert.deepEqual(f.events.filter(e=>e!=='response'),phase==='auth'?['auth']:['auth','policy']);assert.equal(f.commands.length,0);assert.equal(f.gens(),0);
});
for(const phase of ['auth','policy'])for(const delta of [-1,0,1])test(`default ${phase} monotonic phase edge ${delta}`,async()=>{
 clock=0;virtual=true;workDelay=false;const f=fixture();const original=f.fetch;
 f.fetch=async(url,options)=>{const value=await original(url,options);if(String(url).includes(phase==='auth'?'/auth/v1/user':'/policy_acceptances'))clock+=5000+delta;return value;};
 const r=await invoke(handlers.source,base,f);virtual=false;
 assert.equal(r.status,delta<0?200:503);if(delta>=0)assert.equal(f.events.some(e=>e==='workspace_settings'),false);
});
test('enclosing auth pair rejects an injected uncooperative auth and never invokes storage after late resolution',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});clock=0;virtual=true;let release,settled=false,calls=0;
 const handler=nativeSource.createWorkspaceHandler({auth:()=>new Promise(r=>release=r),askCovaContext:async(_,res)=>{calls++;return res.status(200).json({});}});
 const f=fixture();const pending=invoke(handler,base,f).then(r=>{settled=true;return r;});await flush();clock=10000;t.mock.timers.tick(10000);await flush();const before=settled;release({id:A});const r=await pending;await flush();virtual=false;
 assert.equal(before,true);assert.equal(r.status,503);assert.equal(calls,0);
});
for(const delta of [-1,0,1])test(`actual client honors earlier shared UI deadline ${delta}`,async()=>{
 const f=fixture();await f.setup();clock=0;virtual=true;workDelay=false;const sharedEnd=100000;let calls=0;
 const transport=core.createAskCovaTransport(A,{current:()=>true,session:async()=>({user:{id:A},access_token:'synthetic-session'}),fetch:async(_,init)=>{calls++;const body=JSON.parse(init.body),r=await invoke(handlers.native,body,f);if(body.action==='ask_cova')clock=sharedEnd+delta;return new Response(JSON.stringify(r.payload),{status:r.status});}},{boundedSession:true});
 const result=await core.requestAskCovaQuery({owner:A,account:'local',range:'all',requestId:id,conversation},new AbortController().signal,transport,()=>true,sharedEnd);virtual=false;
 assert.equal(result.status,delta<0?'ok':'unavailable');assert.equal(calls,2);
});
for(const phase of ['paid-body','paid-replay'])for(const offset of [-1,0,1])test(`actual client ${phase} deadline edge ${offset}`,async()=>{
 const f=fixture();await f.setup();clock=0;virtual=true;workDelay=false;let paid=false,calls=0;const originalDigest=crypto.subtle.digest.bind(crypto.subtle);
 if(phase==='paid-replay')crypto.subtle.digest=async(...args)=>{const r=await originalDigest(...args);if(paid)clock=core.ASK_COVA_QUERY_TIMEOUT_MS+offset;return r;};
 const transport=core.createAskCovaTransport(A,{current:()=>true,session:async()=>({user:{id:A},access_token:'synthetic-session'}),fetch:async(_,init)=>{
  calls++;const body=JSON.parse(init.body),r=await invoke(handlers.native,body,f);paid=body.action==='ask_cova';
  if(paid&&phase==='paid-body')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify(r.payload)));queueMicrotask(()=>{clock=core.ASK_COVA_QUERY_TIMEOUT_MS+offset;c.close();});}}));
  return new Response(JSON.stringify(r.payload),{status:r.status});
 }},{boundedSession:true});
 let result;try{result=await core.requestAskCovaQuery({owner:A,account:'local',range:'all',requestId:id,conversation},new AbortController().signal,transport,()=>true);}finally{virtual=false;crypto.subtle.digest=originalDigest;}
 assert.equal(result.status,offset<0?'ok':'unavailable');assert.equal(calls,2);assert.equal(f.gens(),2);assert.equal(f.events.filter(e=>e==='reserve').length,1);assert.equal(f.events.filter(e=>e==='release').length,1);
});
for(const action of ['GET','consent','apply','ask_cova_access','ask-cova-v3'])test(`unrelated ${action} auth remains unbounded by the v4 enclosure`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});clock=0;virtual=true;let release,options,settled=false,dispatched=0;
 const handler=nativeSource.createWorkspaceHandler({auth:async(_req,opts)=>{options=opts;await new Promise(r=>release=r);return{id:A,plan:'free'};},rest:async(path)=>path==='workspace_settings'?[{disclosure_version:'workspace-cloud-v1',revision:1,pending_manifest:null}]:[],askCova:async(_,res)=>{dispatched++;return res.status(200).json({});}});
 let status;const body=action==='ask-cova-v3'?{...base,action:'ask_cova',protocolVersion:action}:action==='consent'?{action,owner:A,disclosure:'workspace-cloud-v1'}:{action,owner:A};
 const pending=handler({method:action==='GET'?'GET':'POST',url:'/api/workspace?owner='+A,headers:{},body},{setHeader(){},status(n){status=n;return this;},json(){settled=true;}});
 await flush();clock=10001;t.mock.timers.tick(10001);await flush();assert.equal(settled,false);release();await pending;virtual=false;
 assert.deepEqual(options,action.startsWith('ask')?{billing:false}:undefined);assert.equal(status,action==='apply'?400:200);assert.equal(dispatched,action==='ask-cova-v3'?1:0);
});
test('caller abort settles uncooperative fetch and cancels late body without retry',async()=>{
 const controller=new AbortController();let calls=0,release,cancelled=0;
 const pending=core.requestAskCovaQuery({owner:A,account:'local',range:'all',requestId:id,conversation},controller.signal,async()=>{calls++;return new Promise(r=>release=r);},()=>true);
 controller.abort();assert.equal((await pending).status,'unavailable');release(new Response(new ReadableStream({cancel(){cancelled++;}},{highWaterMark:0})));await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(cancelled,1);
});
