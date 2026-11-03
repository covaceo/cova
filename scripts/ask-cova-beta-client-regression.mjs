import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve(process.env.ASK_COVA_EVIDENCE_ROOT || '../ask-cova-insights-evidence/interaction','beta-client');mkdirSync(out,{recursive:true});
const result=await build({configFile:false,envDir:false,logLevel:'error',ssr:{noExternal:true},build:{ssr:'src/lib/askCovaClient.ts',write:false,target:'node24'}});
const file=resolve(out,'beta-client.mjs');writeFileSync(file,result.output[0].code);
const mod=await import(pathToFileURL(file));
const owner='11111111-1111-4111-8111-111111111111';
test('capability requires exact owner and boolean true; sends only action/owner with authenticated no-store transport',async()=>{
 assert.equal(typeof mod.requestAskCovaAccess,'function','fail-closed capability client must exist');
 let sent;
 const transport=mod.createAskCovaTransport(owner,{current:()=>true,session:async()=>({user:{id:owner},access_token:'SYNTHETIC'}),fetch:async(url,init)=>{sent={url,init};return Response.json({owner,enabled:true});}});
 assert.equal(await mod.requestAskCovaAccess(owner,new AbortController().signal,transport),true);
 assert.equal(sent.url,'/api/workspace');assert.equal(sent.init.method,'POST');assert.equal(sent.init.cache,'no-store');
 assert.equal(new Headers(sent.init.headers).get('authorization'),'Bearer SYNTHETIC');
 assert.deepEqual(JSON.parse(sent.init.body),{action:'ask_cova_access',owner});
});
test('capability rejects non-exact, malformed, oversized, UTF-8 and network failures',async()=>{
 for(const body of [null,[],{}, {owner,enabled:false},{owner,enabled:'true'},{owner,enabled:1},{owner:'different',enabled:true},{owner,enabled:true,extra:'PRIVATE'},'malformed',JSON.stringify({owner,enabled:true}).padEnd(4097),new Uint8Array([255])]){
  const response=()=>new Response(typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body));
  assert.equal(await mod.requestAskCovaAccess(owner,new AbortController().signal,async()=>response(),()=>true),false);
 }
 for(const status of [401,403,404,429,500])assert.equal(await mod.requestAskCovaAccess(owner,new AbortController().signal,async()=>Response.json({owner,enabled:true},{status}),()=>true),false);
 assert.equal(await mod.requestAskCovaAccess(owner,new AbortController().signal,async()=>{throw Error('PRIVATE');},()=>true),false);
});
test('capability cancels bounded streamed overflow and aborted stalled body',async()=>{
 let chunks=0,canceled=false;
 const stream=new ReadableStream({pull(c){chunks++;c.enqueue(new Uint8Array(4096).fill(32));},cancel(){canceled=true;}},{highWaterMark:0});
 assert.equal(await mod.requestAskCovaAccess(owner,new AbortController().signal,async()=>new Response(stream),()=>true),false);assert(chunks<=2);assert(canceled);
 let began;const reading=new Promise(r=>began=r),controller=new AbortController();canceled=false;
 const stalled=new ReadableStream({pull(){began();},cancel(){canceled=true;}},{highWaterMark:0});
 const pending=mod.requestAskCovaAccess(owner,controller.signal,async()=>new Response(stalled),()=>true);await reading;controller.abort();assert.equal(await pending,false);assert(canceled);assert.equal(stalled.locked,false);
});
test('late body grant cannot cross live generation change',async()=>{
 let current=true,body,reading;const began=new Promise(r=>reading=r);
 const stream=new ReadableStream({start(c){body=c;},pull(){reading();}},{highWaterMark:0});
 const pending=mod.requestAskCovaAccess(owner,new AbortController().signal,async()=>new Response(stream),()=>current);
 await began;current=false;body.enqueue(new TextEncoder().encode(JSON.stringify({owner,enabled:true})));body.close();assert.equal(await pending,false);
});
test('abort during live session resolution never dispatches capability',async()=>{
 const controller=new AbortController();let resolveSession,calls=0;
 const transport=mod.createAskCovaTransport(owner,{current:()=>true,session:()=>new Promise(r=>resolveSession=r),fetch:async()=>{calls++;return Response.json({owner,enabled:true});}});
 const pending=mod.requestAskCovaAccess(owner,controller.signal,transport);controller.abort();resolveSession({user:{id:owner},access_token:'SYNTHETIC'});assert.equal(await pending,false);assert.equal(calls,0);
});
test('internal timeout bounds even a transport that ignores abort',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let signal,resolveResponse,canceled=false;
 const pending=mod.requestAskCovaAccess(owner,new AbortController().signal,async(_,init)=>{signal=init.signal;return new Promise(r=>resolveResponse=r);},()=>true);
 t.mock.timers.tick(8000);await Promise.resolve();assert.equal(signal.aborted,true);
 let settled=false;pending.then(()=>{settled=true;});await new Promise(r=>setImmediate(r));
 const settledBeforeResponse=settled;
 resolveResponse(new Response(new ReadableStream({cancel(){canceled=true;}},{highWaterMark:0})));
 assert.equal(await pending,false);assert.equal(settledBeforeResponse,true,'deadline must settle before uncooperative transport');
 await new Promise(r=>setImmediate(r));assert(canceled,'late response body is canceled');
});
