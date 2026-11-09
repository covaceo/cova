// Browser-only synthetic transport; accepted responses use real shared core.
import {syntheticSnapshot,syntheticQueryWire} from './ask-cova-query-core-fixture.mjs';
import {requestAskCovaQuery} from '../../src/lib/askCovaQueryClient.ts';
import {createAskCovaTransport} from '../../src/lib/askCovaClient.ts';
export function installSyntheticQueryTransport(rows,options={}){
 window.calls=[];window.bodies=[];window.contextBodies=[];window.safe=[];window.current=true;window.mode='ok';
 window.saved=true;window.captureAuthority=async()=>()=>window.saved;
 window.wireFor=async input=>(await syntheticQueryWire(input,syntheticSnapshot(input.owner,rows()),{choice:window.choice,detail:window.detail,longAnswer:window.longAnswer,voice:options.voice,utf8:window.streamCase==='utf8'})).wire;
 window.request=async(input,signal,_transport,current)=>{
  window.lastSignal=signal;window.calls.push(structuredClone(input));
  // Uncooperative injected requests intentionally exercise the UI deadline too.
  if(window.mode==='slow')await new Promise(r=>window.finish=r);
  if(window.mode==='throw')throw Error('Synthetic rejected request');
  // Even failures traverse context/authenticated generation and the real parser.
  const snapshot=syntheticSnapshot(input.owner,rows());
  const transport=createAskCovaTransport(input.owner,{current:()=>window.current,session:async()=>({user:{id:input.owner},access_token:'MOCK-TOKEN'}),fetch:async(_,init)=>{
   const body=JSON.parse(init.body);
   if(new Headers(init.headers).get('Authorization')!=='Bearer MOCK-TOKEN'||init.cache!=='no-store')throw Error('Synthetic transport lost authenticated no-store boundary');
   if(body.action==='ask_cova_context'){window.contextBodies.push(body);return new Response(JSON.stringify(snapshot));}
   window.bodies.push(body);window.sentBody=body;
   if(window.mode==='error')return new Response(JSON.stringify({status:'unavailable',error:'account_data_unavailable'}),{status:503});
   const checked=await syntheticQueryWire(body,snapshot,{choice:window.choice,detail:window.detail,longAnswer:window.longAnswer,voice:options.voice,utf8:window.streamCase==='utf8'});
   window.safe.push(checked.historyText);window.lastResult=checked.result;window.lastWire=checked.wire;
   if(window.choice!=='invented_choice'&&(!checked.rendered||!checked.historyText))throw Error('Invalid synthetic positive answer');
   if(window.mode==='body')return new Response(new ReadableStream({start(controller){window.bodyController=controller;window.bodyInput=body;window.bodyWire=checked.wire;}}));
   if(window.mode==='stream'){
    const text=JSON.stringify(checked.wire),bytes=new TextEncoder().encode(window.streamCase==='exact'?text.padEnd(16384):text);let offset=0;
    window.streamReads=0;window.streamCanceled=false;window.streamSplitMultibyte=false;
    const stream=new ReadableStream({pull(controller){window.streamReads++;if(window.streamCase==='stalled'){if(window.streamReads===1)controller.enqueue(new TextEncoder().encode('{'));return;}if(window.streamCase==='oversized'){controller.enqueue(new Uint8Array(4096).fill(120));return;}if(window.streamCase==='invalid'){controller.enqueue(new Uint8Array([255]));return;}if(offset===bytes.length){controller.close();return;}const size=window.streamCase==='utf8'&&offset===0?bytes.findIndex(b=>b>=128)+1:4096;window.streamSplitMultibyte=window.streamSplitMultibyte||((bytes[offset+size]&192)===128);controller.enqueue(bytes.slice(offset,offset+size));offset+=size;if(offset>=bytes.length)controller.close();},cancel(){window.streamCanceled=true;}},{highWaterMark:0});window.stream=stream;
    return new Response(stream,{headers:window.streamCase==='header'?{'Content-Length':'1048576'}:{}});
   }
   return new Response(JSON.stringify(checked.wire));
  }});
  return requestAskCovaQuery(input,signal,transport,current||(()=>window.current));
 };
}
