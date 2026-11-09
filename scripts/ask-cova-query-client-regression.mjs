// Actual shared core + client, synthetic saved data / transport; no provider quality claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve(process.env.ASK_COVA_EVIDENCE_ROOT||'../ask-cova-account-data-evidence/frontend','client');mkdirSync(out,{recursive:true});
let client;
async function subject(){
 assert.ok(existsSync('src/lib/askCovaQueryClient.ts'),'production generic query client exists');
 if(!client){const entry=resolve('__query_client_test__.ts');const built=await build({configFile:false,envDir:false,logLevel:'error',plugins:[{name:'actual-core',resolveId(id){if(id.endsWith('__query_client_test__.ts'))return id;},load(id){if(id.endsWith('__query_client_test__.ts'))return `export * from '${resolve('src/lib/askCovaQueryClient.ts').replaceAll('\\','/')}';export * from '${resolve('src/lib/askCovaClient.ts').replaceAll('\\','/')}';export * from '${resolve('src/lib/askCovaData.ts').replaceAll('\\','/')}';export * from '${resolve('src/lib/askCovaQuery.ts').replaceAll('\\','/')}';export * from '${resolve('src/lib/askCovaQueryAnswer.ts').replaceAll('\\','/')}';`;}}],ssr:{noExternal:true},build:{ssr:entry,write:false,target:'node24'}});const file=resolve(out,'client.mjs');writeFileSync(file,built.output[0].code);client=await import(pathToFileURL(file));}
 return client;
}
const input={owner:'11111111-1111-4111-8111-111111111111',account:'local',range:'all',requestId:'22222222-2222-4222-8222-222222222222',conversation:{message:'what days am i most profitable',history:[]}};
const snapshot={version:'ask-cova-data-v1',owner:input.owner,workspaceRevision:1,workspaceRecords:[],passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}};
test('fresh complete data uses actual shared digests and v4 exact payload, never old topics or raw records',async()=>{
 const core=await subject(),calls=[];
 const context=await core.buildAskCovaDataContext({snapshot,account:input.account,range:input.range,conversation:input.conversation});
 await core.requestAskCovaQuery(input,new AbortController().signal,async(_,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify(calls.length===1?snapshot:{}));},()=>true);
 assert.equal(calls.length,2);assert.deepEqual(calls[1],{action:'ask_cova',protocolVersion:'ask-cova-v4',...input,snapshotDigest:context.snapshotDigest,contextDigest:context.contextDigest});
});
const plan={version:'ask-cova-query-plan-v1',decision:{kind:'query',queries:[{id:'count',op:'aggregate',source:'trades',where:[],groupBy:[],measures:[{id:'total',op:'count',field:null}],orderBy:[],mode:'complete',limit:1}]}};
async function proof(core,snap=snapshot,query=plan,request=input){
 const context=await core.buildAskCovaDataContext({snapshot:snap,account:request.account,range:request.range,conversation:request.conversation});
 const result=await core.executeAskCovaQuery(context,query);
 const answer={version:'ask-cova-answer-v2',paragraphs:[{text:'Saved count: {{f:cell_0}}.',evidence:['observation_0']}],detail:[]};
 return {wire:{status:'ok',aiResponseUsed:true,protocolVersion:'ask-cova-v4',requestId:request.requestId,snapshotDigest:context.snapshotDigest,contextDigest:context.contextDigest,plan:query,planDigest:result.planDigest,resultDigest:result.resultDigest,answer},result};
}
test('actual shared executor independently replays proof and renders locally issued count',async()=>{
 const core=await subject(),{wire}=await proof(core);let calls=0;
 const answer=await core.requestAskCovaQuery(input,new AbortController().signal,async()=>new Response(JSON.stringify(++calls===1?snapshot:wire)),()=>true);
 assert.equal(answer.status,'ok');assert.deepEqual(answer.reply.paragraphs,['Saved count: 0.']);assert.equal(calls,2);
 assert.ok(answer.historyText.includes('Saved count: 0.'));
});
test('original trader wording and novel combined requests use generic v4 without finite intent gates',async()=>{
 const core=await subject();
 for(const message of ['how many trades have i won','whats my win rate bro lol','what days am i most profitable','whats my most traded asset','whats my most traded symbol','Compare short NQ trades on Monday with notes containing patience']){
  const request={...input,conversation:{message,history:[]}},calls=[],{wire}=await proof(core,snapshot,plan,request);
  const response=await core.requestAskCovaQuery(request,new AbortController().signal,async(_,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify(calls.length===1?snapshot:wire));},()=>true);
  assert.equal(response.status,'ok');assert.equal(calls[1].conversation.message,message);assert.equal(Object.hasOwn(calls[1],'question'),false);
 }
 // Synthetic count plans prove transport/replay, not interpretation or answer quality.
});
test('proof tampering is rejected against a valid replay positive control',async()=>{
 const core=await subject(),{wire}=await proof(core);
 const mutations=[w=>w.resultDigest='f'.repeat(64),w=>w.planDigest='f'.repeat(64),w=>w.snapshotDigest='f'.repeat(64),w=>w.contextDigest='f'.repeat(64),w=>w.requestId='33333333-3333-4333-8333-333333333333',w=>w.protocolVersion='ask-cova-v3',w=>w.aiResponseUsed=false,w=>w.plan.decision.queries[0].source='daily_notes',w=>w.answer.paragraphs[0].text='Saved count: {{f:forged}}.',w=>w.answer.paragraphs[0].evidence=['forged'],w=>w.results={total:999},w=>w.supports=[{recordId:'foreign'}]];
 for(const mutate of mutations){let calls=0;const changed=structuredClone(wire);mutate(changed);const result=await core.requestAskCovaQuery(input,new AbortController().signal,async()=>new Response(JSON.stringify(++calls===1?snapshot:changed)),()=>true);assert.equal(result.status,'unavailable',String(mutate));assert.equal(calls,2);}
});
test('saved authority is checked after delayed context and answer bodies and during replay',async()=>{
 const core=await subject(),{wire}=await proof(core);
 for(const phase of ['context-body','answer-body','replay']){
  let live=true,calls=0,replaying=false;const digest=crypto.subtle.digest.bind(crypto.subtle);
  if(phase==='replay')crypto.subtle.digest=async(...args)=>{const result=await digest(...args);if(replaying)live=false;return result;};
  try{const result=await core.requestAskCovaQuery(input,new AbortController().signal,async()=>{
   const n=++calls,payload=JSON.stringify(n===1?snapshot:wire);
   return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(payload));queueMicrotask(()=>{if((n===1&&phase==='context-body')||(n===2&&phase==='answer-body'))live=false;if(n===2)replaying=true;c.close();});}}));
  },()=>live);assert.equal(result.status,'unavailable',phase);assert.equal(calls,phase==='context-body'?1:2);}finally{crypto.subtle.digest=digest;}
 }
});
test('strict context decoding rejects partial, foreign, duplicate and invalid UTF8 before generation',async()=>{
 const core=await subject();const bodies=[JSON.stringify({...snapshot,complete:{...snapshot.complete,passportReviews:false}}),JSON.stringify({...snapshot,owner:'33333333-3333-4333-8333-333333333333'}),'{"version":"ask-cova-data-v1",'+JSON.stringify(snapshot).slice(1),new Uint8Array([0xc3,0x28])];
 for(const body of bodies){let calls=0;const result=await core.requestAskCovaQuery(input,new AbortController().signal,async()=>{calls++;return new Response(body);},()=>true);assert.equal(result.status,'unavailable');assert.equal(calls,1);}
});
test('success decoder accepts exact server byte ceiling, rejects overflow and duplicate proof keys',async()=>{
 const core=await subject(),{wire}=await proof(core),json=JSON.stringify(wire);
 for(const [body,ok] of [[json+' '.repeat(16384-Buffer.byteLength(json)),true],[json+' '.repeat(16385-Buffer.byteLength(json)),false],['{"status":"ok",'+json.slice(1),false]]){
  let calls=0;const result=await core.requestAskCovaQuery(input,new AbortController().signal,async()=>new Response(++calls===1?JSON.stringify(snapshot):body),()=>true);assert.equal(result.status,ok?'ok':'unavailable');
 }
});
test('authenticated transport authority is independently retained through the response body',async()=>{
 const core=await subject(),{wire}=await proof(core);let live=true,calls=0;
 const transport=core.createAskCovaTransport(input.owner,{current:()=>live,session:async()=>({user:{id:input.owner},access_token:'synthetic-token'}),fetch:async(_,init)=>{
  assert.equal(new Headers(init.headers).get('Authorization'),'Bearer synthetic-token');const n=++calls;
  if(n===1)return new Response(JSON.stringify(snapshot));
  return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify(wire)));setImmediate(()=>{live=false;c.close();});}}));
 }});
 const response=await core.requestAskCovaQuery(input,new AbortController().signal,transport,()=>true);assert.equal(response.status,'unavailable');assert.equal(calls,2);
});
test('fresh remote saved-data changes revoke old chat before paid dispatch',async()=>{
 const core=await subject(),{wire}=await proof(core);let calls=0;
 const result=await core.requestAskCovaQuery({...input,previousSnapshotDigest:wire.snapshotDigest},new AbortController().signal,async()=>{calls++;return new Response(JSON.stringify({...snapshot,workspaceRevision:2}));},()=>true);
 assert.equal(calls,1);assert.equal(result.status,'unavailable');assert.equal(result.revokeHistory,true);
});
test('allowlisted failures distinguish missing sources, unsupported queries, narrowing and changed saved data',async()=>{
 const core=await subject();
 for(const [status,error,expected] of [[503,'account_data_unavailable',/saved.*data.*unavailable/i],[422,'query_invalid',/query.*supported/i],[422,'needs_narrowing',/narrow/i],[409,'context_changed',/changed.*sync/i],[429,'budget_exhausted',/usage limit/i]]){
  let calls=0;const response=await core.requestAskCovaQuery(input,new AbortController().signal,async()=>++calls===1?new Response(JSON.stringify(snapshot)):new Response(JSON.stringify({status:'unavailable',error}),{status}),()=>true);
  assert.match(response.message,expected);assert.equal(calls,2);assert.doesNotMatch(response.message,/no.*paid|not.*charged|refunded/i);
 }
});
test('own deadline settles even uncooperative headers and cancels late body',async(t)=>{
 const core=await subject();t.mock.timers.enable({apis:['setTimeout']});let signal,resolveResponse,canceled=false;
 const pending=core.requestAskCovaQuery(input,new AbortController().signal,async(_,init)=>{signal=init.signal;return new Promise(r=>resolveResponse=r);},()=>true);
 t.mock.timers.tick(core.ASK_COVA_QUERY_TIMEOUT_MS);await Promise.resolve();assert.equal(signal.aborted,true);
 let settled=false;pending.then(()=>{settled=true;});await new Promise(r=>setImmediate(r));assert.equal(settled,true);
 resolveResponse(new Response(new ReadableStream({cancel(){canceled=true;}},{highWaterMark:0})));assert.equal((await pending).status,'unavailable');await new Promise(r=>setImmediate(r));assert.equal(canceled,true);
});
test('client deadline covers complete context read plus bounded two-pass attempt',async()=>{
 const core=await subject();assert.ok(core.ASK_COVA_QUERY_TIMEOUT_MS>=125000);assert.ok(core.ASK_COVA_QUERY_TIMEOUT_MS<300000);
});
test('scope-required explains explicit range selection without automatic widening',async()=>{
 const core=await subject();let calls=0;
 const result=await core.requestAskCovaQuery(input,new AbortController().signal,async()=>{calls++;return calls===1?new Response(JSON.stringify(snapshot)):new Response(JSON.stringify({status:'unavailable',error:'scope_required'}),{status:422});},()=>true);
 assert.match(result.message,/Choose.*range.*send/i);assert.equal(calls,2);
});
test('request identity is captured before asynchronous context read',async()=>{
 const core=await subject(),mutable=structuredClone(input),calls=[];
 await core.requestAskCovaQuery(mutable,new AbortController().signal,async(_,init)=>{calls.push(JSON.parse(init.body));mutable.requestId='33333333-3333-4333-8333-333333333333';return new Response(JSON.stringify(calls.length===1?snapshot:{}));},()=>true);
 assert.equal(calls[1].requestId,input.requestId);
});
test('aborting an unresolved context transport settles once without auto retry',{timeout:1000},async()=>{
 const core=await subject(),controller=new AbortController();let calls=0;
 const pending=core.requestAskCovaQuery(input,controller.signal,async()=>{calls++;queueMicrotask(()=>controller.abort());return new Promise(()=>{});},()=>true);
 const result=await pending;assert.equal(result.status,'unavailable');assert.equal(calls,1);
});
test('revoked saved authority prevents even the fresh context read',async()=>{
 const {requestAskCovaQuery}=await subject();let calls=0;
 const result=await requestAskCovaQuery(input,new AbortController().signal,async()=>{calls++;throw Error('forbidden');},()=>false);
 assert.equal(calls,0);assert.equal(result.status,'unavailable');
});
test('deliberate request reads exact scoped context first; incomplete snapshot never dispatches generation',async()=>{
 const {requestAskCovaQuery}=await subject();const calls=[];
 const result=await requestAskCovaQuery(input,new AbortController().signal,async(url,init)=>{calls.push({url,body:JSON.parse(init.body),cache:init.cache});return new Response('{}');},()=>true);
 assert.deepEqual(calls,[{url:'/api/workspace',body:{action:'ask_cova_context',owner:input.owner,account:input.account,range:input.range},cache:'no-store'}]);assert.equal(result.status,'unavailable');
});
