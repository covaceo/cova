import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const source = 'src/lib/askCovaClient.ts';
let mod;
if (existsSync(source)) {
 const result = await build({configFile:false,envDir:false,logLevel:'error',ssr:{noExternal:true},build:{ssr:source,write:false,target:'node24'}});
 const out=resolve(process.env.ASK_COVA_EVIDENCE_ROOT || '../ask-cova-insights-evidence/interaction','client-runtime');mkdirSync(out,{recursive:true});
 const file=resolve(out,'client.mjs');writeFileSync(file,result.output[0].code);mod=await import(pathToFileURL(file));
}
const authored={version:'ask-cova-answer-v1',paragraphs:[{text:'checked results.',evidence:['overall']}],detail:[]};
const input={owner:'11111111-1111-4111-8111-111111111111',account:'local',range:'all',question:'review_results',contextDigest:'a'.repeat(64),requestId:'22222222-2222-4222-8222-222222222222'};
test('dispatch sends only scoped identifiers and protocol version, never raw finance or notes',async()=>{
 assert.equal(typeof mod?.requestAskCova,'function','Ask Cova transport exists');
 let captured;const result=await mod.requestAskCova(input,new AbortController().signal,async(url,init)=>{
  captured={url,init};return new Response(JSON.stringify({status:'ok',aiResponseUsed:true,contextDigest:input.contextDigest,answer:authored}));
 },()=>true);
 assert.equal(captured.url,'/api/workspace');assert.equal(captured.init.method,'POST');assert.equal(captured.init.cache,'no-store');
 assert.deepEqual(JSON.parse(captured.init.body),{action:'ask_cova',...input,protocolVersion:'ask-cova-v3'});
 assert.equal(result.status,'ok');assert.equal(result.answer.version,'ask-cova-answer-v1');
});
test('malformed, stale and non-AI responses are blocked without echoing provider text',async()=>{
 for(const body of [null,{status:'ok',aiResponseUsed:false,contextDigest:input.contextDigest,selection:{choice_id:'net',style:'warm'}},{status:'ok',aiResponseUsed:true,contextDigest:'b'.repeat(64),selection:{choice_id:'net',style:'warm'}},{status:'ok',aiResponseUsed:true,contextDigest:input.contextDigest,selection:{choice_id:'net',style:'warm',text:'PRIVATE'}},{status:'ok',aiResponseUsed:true,contextDigest:input.contextDigest,selection:{choice_id:'net',style:'madeup'}}]) {
  const result=await mod.requestAskCova(input,new AbortController().signal,async()=>new Response(JSON.stringify(body)),()=>true);
  assert.equal(result.status,'unavailable');assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 }
});
test('network, malformed JSON, and HTTP failures use safe local copy with no retries',async()=>{
 for(const failure of ['network','json',401,403,404,409,429,500]) {
  let calls=0;const result=await mod.requestAskCova(input,new AbortController().signal,async()=>{calls++;if(failure==='network')throw Error('PRIVATE');if(failure==='json')return new Response('PRIVATE');return new Response(JSON.stringify({error:'PRIVATE'}),{status:failure});},()=>true);
  assert.equal(calls,1);assert.equal(result.status,'unavailable');assert.equal(typeof result.message,'string');assert.ok(!result.message.includes('PRIVATE'));
 }
});
test('owner-bound transport checks before session resolution, dispatch and response',async()=>{
 assert.equal(typeof mod.createAskCovaTransport,'function');
 let current=true,calls=0;const session=async()=>({user:{id:input.owner},access_token:'synthetic-token'});
 const deps={current:()=>current,session,fetch:async(_,init)=>{calls++;assert.equal(new Headers(init.headers).get('Authorization'),'Bearer synthetic-token');return new Response('{}');}};
 let transport=mod.createAskCovaTransport(input.owner,deps);
 current=false;await assert.rejects(()=>transport('/api/workspace',{}));assert.equal(calls,0);
 current=true;transport=mod.createAskCovaTransport(input.owner,{...deps,session:async()=>{current=false;return session();}});
 await assert.rejects(()=>transport('/api/workspace',{}));assert.equal(calls,0);
 current=true;transport=mod.createAskCovaTransport(input.owner,{...deps,session:async()=>({user:{id:'different-owner'},access_token:'synthetic-token'})});
 await assert.rejects(()=>transport('/api/workspace',{}));assert.equal(calls,0);
 transport=mod.createAskCovaTransport(input.owner,{...deps,fetch:async()=>{calls++;current=false;return new Response('{}');}});
 await assert.rejects(()=>transport('/api/workspace',{}));assert.equal(calls,1);
});
test('F-02 owner invalidated during delayed body cannot return a usable selection',async()=>{
 let current=true,bodyController,headersDelivered;
 const headers=new Promise(resolve=>headersDelivered=resolve);
 const transport=mod.createAskCovaTransport(input.owner,{
  current:()=>current,session:async()=>({user:{id:input.owner},access_token:'SYNTHETIC-MOCK-TOKEN'}),
  fetch:async()=>{const response=new Response(new ReadableStream({start(controller){bodyController=controller;}}));headersDelivered();return response;},
 });
 const pending=mod.requestAskCova(input,new AbortController().signal,transport);
 await headers;await new Promise(resolve=>setImmediate(resolve));current=false;
 bodyController.enqueue(new TextEncoder().encode(JSON.stringify({status:'ok',aiResponseUsed:true,contextDigest:input.contextDigest,answer:authored})));bodyController.close();
 assert.equal((await pending).status,'unavailable','authority must still be current after body decoding');
});
test('F-03 oversized stream is canceled after a bounded prefix, not a full MiB',async()=>{
 let chunks=0,canceled=false;
 const stream=new ReadableStream({pull(controller){if(chunks===256){controller.close();return;}chunks++;controller.enqueue(new Uint8Array(4096).fill(120));},cancel(){canceled=true;}},{highWaterMark:0});
 const result=await mod.requestAskCova(input,new AbortController().signal,async()=>new Response(stream),()=>true);
 assert.equal(result.status,'unavailable');
 assert.ok(chunks<=3,`read ${chunks*4096} bytes; expected at most 12288 including the overflow chunk`);
 assert.equal(canceled,true,'overflow must cancel the source stream');
 console.log(JSON.stringify({probe:'F-03 oversized stream',bytesRead:chunks*4096,canceled}));
});
test('F-03 abort interrupts a pending body read and cancels the source',async()=>{
 const controller=new AbortController();let canceled=false,bodyController,reading,reads=0;
 const began=new Promise(resolve=>reading=resolve);
 const stream=new ReadableStream({start(value){bodyController=value;},pull(value){reads++;if(reads===1)value.enqueue(new TextEncoder().encode('{'));else reading();},cancel(){canceled=true;}},{highWaterMark:0});
 const pending=mod.requestAskCova(input,controller.signal,async()=>new Response(stream),()=>true);
 await began;controller.abort();
 let timer;const result=await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),200);})]);clearTimeout(timer);
 if(!canceled)bodyController.close();await pending;
 assert.notEqual(result,null,'aborted pending read must settle without waiting for another body chunk');
 assert.equal(result.status,'unavailable');assert.equal(canceled,true);assert.equal(reads,2);assert.equal(stream.locked,false);
});
test('F-03 pre-aborted request does not dispatch',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 const result=await mod.requestAskCova(input,controller.signal,async()=>{calls++;return new Response('{}');},()=>true);
 assert.equal(result.status,'unavailable');assert.equal(calls,0);
});
for(const [status,headers] of [[200,{'Content-Length':'1048576'}],[429,{}],[500,{'Content-Length':'1048576'}]]){
 test(`F-03 status ${status} rejected at headers cancels without reading`,async()=>{
  let reads=0,canceled=false;
  const stream=new ReadableStream({pull(controller){reads++;controller.enqueue(new TextEncoder().encode('{}'));controller.close();},cancel(){canceled=true;}},{highWaterMark:0});
  const result=await mod.requestAskCova(input,new AbortController().signal,async()=>new Response(stream,{status,headers}),()=>true);
  assert.equal(result.status,'unavailable');assert.equal(reads,0,`status ${status} body must not be read`);assert.equal(canceled,true,`status ${status} body must be canceled`);
 });
}
test('F-03 transport rejection after headers cancels the unused response',async()=>{
 let current=true,canceled=false;
 const transport=mod.createAskCovaTransport(input.owner,{current:()=>current,session:async()=>({user:{id:input.owner},access_token:'MOCK'}),fetch:async()=>{current=false;return new Response(new ReadableStream({cancel(){canceled=true;}},{highWaterMark:0}));}});
 await assert.rejects(()=>transport('/api/workspace'));assert.equal(canceled,true);
});
test('F-03 byte ceiling accepts exactly 8192 bytes and rejects multibyte overflow',async()=>{
 const body=JSON.stringify({status:'ok',aiResponseUsed:true,contextDigest:input.contextDigest,answer:authored});
 for(const [text,status] of [[body.padEnd(8192),'ok'],[body.padEnd(8193),'unavailable'],[JSON.stringify({...JSON.parse(body),padding:'€'.repeat(1400)}),'unavailable']]){
  const result=await mod.requestAskCova(input,new AbortController().signal,async()=>new Response(text,{headers:{'Content-Length':'1'}}),()=>true);
  assert.equal(result.status,status);
 }
 const bytes=new TextEncoder().encode(JSON.stringify({...JSON.parse(body),answer:{...authored,paragraphs:[{text:'checked café.',evidence:['overall']}]}}));let offset=0;
 const response=new Response(new ReadableStream({pull(controller){if(offset===bytes.length)controller.close();else controller.enqueue(bytes.slice(offset,++offset));}},{highWaterMark:0}));
 assert.equal((await mod.requestAskCova(input,new AbortController().signal,async()=>response,()=>true)).status,'ok','UTF-8 code points can cross chunks');
});
test('F-03 decoding and source errors attempt cancellation, release locks and never echo private text',async()=>{
 for(const sourceError of [false,true]){
  let cancelAttempts=0,sourceCanceled=false;
  const stream=new ReadableStream({pull(controller){if(sourceError)controller.error(Error('PRIVATE PROVIDER ERROR'));else controller.enqueue(new Uint8Array([255]));},cancel(){sourceCanceled=true;}},{highWaterMark:0});
  const getReader=stream.getReader.bind(stream);stream.getReader=(...args)=>{const reader=getReader(...args),cancel=reader.cancel.bind(reader);reader.cancel=(...args)=>{cancelAttempts++;return cancel(...args);};return reader;};
  const result=await mod.requestAskCova(input,new AbortController().signal,async()=>new Response(stream),()=>true);
  assert.equal(result.status,'unavailable');assert.ok(!result.message.includes('PRIVATE'));assert.equal(cancelAttempts,1);assert.equal(stream.locked,false);
  if(!sourceError)assert.equal(sourceCanceled,true);
 }
});
test('F-03 timeout cancels a stalled stream without waiting for source cancellation',async()=>{
 let canceled=false;
 const stream=new ReadableStream({cancel(){canceled=true;return new Promise(()=>{});}},{highWaterMark:0});
 const pending=mod.requestAskCova(input,AbortSignal.timeout(20),async()=>new Response(stream),()=>true);
 let timer;const result=await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),500);})]);clearTimeout(timer);
 assert.notEqual(result,null);assert.equal(result.status,'unavailable');assert.equal(canceled,true);assert.equal(stream.locked,false);
});
test('F-02 injected transport alone does not bypass live workspace authority',async()=>{
 let calls=0;const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>''}});
 try{const result=await mod.requestAskCova(input,new AbortController().signal,async()=>{calls++;return new Response('{}');});assert.equal(result.status,'unavailable');assert.equal(calls,0);}
 finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;}
});
test('authored client rejects duplicate decoded keys and extra fields before exposing an answer',async()=>{
 const good={status:'ok',aiResponseUsed:true,contextDigest:input.contextDigest,answer:authored};
 for(const key of ['answer','ans\\u0077er']){
  const text=JSON.stringify(good).replace('{',`{"${key}":{},`);
  assert.deepEqual(JSON.parse(text),good,'escaped key must decode to the same property, not an unrelated literal-backslash key');
  const result=await mod.requestAskCova(input,new AbortController().signal,async()=>new Response(text),()=>true);assert.equal(result.status,'unavailable');
 }
 for(const value of [{...good,extra:'private'}, {...good,answer:{...authored,paragraphs:[{text:'checked',evidence:['overall'],extra:true}]}}]) assert.equal((await mod.requestAskCova(input,new AbortController().signal,async()=>new Response(JSON.stringify(value)),()=>true)).status,'unavailable');
});
test('extra runtime fields never enter outbound request',async()=>{
 let sent;await mod.requestAskCova({...input,notes:'PRIVATE',trades:['PRIVATE']},new AbortController().signal,async(_,init)=>{sent=init.body;return new Response('{}');},()=>true);
 assert.ok(!sent.includes('PRIVATE'));
});
