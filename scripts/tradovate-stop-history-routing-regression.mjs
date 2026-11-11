import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/tradovate/sync.js';
import {encryptSecret} from '../api/_lib/encryption.js';
import {json} from './helpers/tradovate-stop-history-fixture.mjs';
async function invoke(query){
 const original=globalThis.fetch,env={...process.env},calls=[];
 Object.assign(process.env,{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic',COVA_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:'synthetic-redis-token'.repeat(3),TRADOVATE_API_BASE_URL:'https://demo.tradovateapi.com/v1'});
 globalThis.fetch=async(input,init={})=>{const u=new URL(input);calls.push(u.pathname);if(u.pathname==='/auth/v1/user')return json({id:'owner',app_metadata:{plan:'pro'}});if(u.pathname==='/rest/v1/policy_acceptances')return json([{id:'policy'}]);if(u.pathname==='/rest/v1/broker_connections'){assert.equal(u.searchParams.get('user_id'),'eq.owner');assert.equal(u.searchParams.get('provider'),'eq.tradovate');return json([{access_token_encrypted:encryptSecret('synthetic-provider'),expires_at:'2099-01-01T00:00:00Z'}])}if(u.origin==='https://fixture.upstash.io'){const b=JSON.parse(init.body);return json({result:b[0]==='SET'?'OK':[1,1]})}assert.equal(u.origin,'https://demo.tradovateapi.com');assert(['/v1/fill/list','/v1/fillPair/list','/v1/position/list'].includes(u.pathname));return json([])};
 const res={code:200,status(n){this.code=n;return this},setHeader(){},json(body){this.body=body;return this}};
 try{await handler({method:'GET',query,headers:{authorization:'Bearer synthetic',cookie:'cova_tradovate_connection=synthetic-connection','x-forwarded-for':'203.0.113.7'}},res)}finally{globalThis.fetch=original;for(const k of Object.keys(process.env))if(!Object.hasOwn(env,k))delete process.env[k];Object.assign(process.env,env)}return{res,calls};
}
test('A04 any present malformed discriminator rejects before auth, credentials or bulk provider reads',async()=>{
 for(const diagnostic of [undefined,null,'',[],['stop-history'],['stop-history','stop-history'],{},0,false,'stop-history-typo','toString']){
  const {res,calls}=await invoke({diagnostic});assert.equal(res.code,400,String(JSON.stringify(diagnostic)));assert.deepEqual(calls,[]);
 }
});
test('A04 ordinary valid no-diagnostic sync retains its bulk route',async()=>{
 const {res,calls}=await invoke({});assert.equal(res.code,200);assert.equal(typeof res.body.csv,'string');assert.deepEqual(calls.filter(p=>p.startsWith('/v1/')).sort(),['/v1/fill/list','/v1/fillPair/list','/v1/position/list'].sort());
});
