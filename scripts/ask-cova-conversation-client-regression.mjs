import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const out=resolve(process.env.ASK_COVA_EVIDENCE_ROOT || '../ask-cova-conversation-evidence/frontend','conversation-client');
mkdirSync(out,{recursive:true});
const built=await build({configFile:false,envDir:false,logLevel:'error',ssr:{noExternal:true},build:{ssr:'src/lib/askCovaClient.ts',write:false,target:'node24'}});
const file=resolve(out,'client.mjs');writeFileSync(file,built.output[0].code);
const {requestAskCova}=await import(pathToFileURL(file));
const input={owner:'11111111-1111-4111-8111-111111111111',account:'local',range:'all',question:'review_results',contextDigest:'a'.repeat(64),requestId:'22222222-2222-4222-8222-222222222222'};
const conversation={message:'Could you explain that differently?',history:[{role:'user',content:'Review my results'},{role:'assistant',content:'Your checked net result is $90.00.'}]};
test('approved actual message and recent chat reach transport without unrelated private fields',async()=>{
 let sent;
 await requestAskCova({...input,conversation,notes:'PRIVATE RAW NOTE',trades:['PRIVATE RAW RECORD']},new AbortController().signal,async(_,init)=>{sent=JSON.parse(init.body);return new Response('{}');},()=>true);
 assert.deepEqual(sent,{action:'ask_cova',...input,conversation,protocolVersion:'ask-cova-v3'});
 assert.doesNotMatch(JSON.stringify(sent),/PRIVATE RAW/);
});
test('malformed conversation is rejected before transport, never silently downgraded',async()=>{
 for(const value of [null,{}, {...conversation,notes:'PRIVATE'}, {...conversation,message:'x'.repeat(501)}, {...conversation,history:[{role:'assistant',content:'orphan'}]}, {...conversation,history:[{role:'user',content:'x'},{role:'assistant',content:'€'.repeat(3000)}]}, {...conversation,history:[{role:'user',content:'x',notes:'PRIVATE'},{role:'assistant',content:'ok'}]}]){
  let calls=0;const result=await requestAskCova({...input,conversation:value},new AbortController().signal,async()=>{calls++;return new Response('{}');},()=>true);
  assert.equal(calls,0,JSON.stringify(value).slice(0,100));assert.equal(result.status,'unavailable');
 }
});
