import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import load from './helpers/load-ts.cjs';
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '../api/_lib/legal-policy.js';

// Native ESM compilation of ACTUAL source + ACTUAL sibling core. No repository
// runtime writes and no .env reads. Transport replies below are synthetic only.
const built=await build({root:resolve(import.meta.dirname,'..'),configFile:false,envDir:false,logLevel:'error',ssr:{noExternal:true},build:{ssr:'server/workspace.ts',target:'node24',write:false,rollupOptions:{output:{format:'es',codeSplitting:false}}}});
assert.equal(built.output.length,1);
const dir=await mkdtemp(join(process.env.TMPDIR||tmpdir(),'cova-query-native-'));
after(()=>rm(dir,{recursive:true,force:true}));
const file=join(dir,'workspace.mjs');await writeFile(file,built.output[0].code);
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const requestId='33333333-3333-4333-8333-333333333333';
const environment={WORKSPACE_SYNC_ENABLED:'true',WORKSPACE_SYNC_PROJECT_REF:'aaaaaaaaaaaaaaaaaaaa',SUPABASE_URL:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-storage',ASK_COVA_ENABLED:'true',ASK_COVA_BETA_USER_ID:A,OPENAI_API_KEY:'synthetic-only-not-a-real-credential',ASK_COVA_BUDGET_ID:'synthetic-only',ASK_COVA_BUDGET_MICRO_USD:'1000000',KV_REST_API_URL:'https://synthetic.upstash.io',KV_REST_API_TOKEN:'synthetic-only-not-a-credential-123456789',COVA_BILLING_MODE:'sandbox',COVA_BILLING_ALLOWED_USERS:A+','+B,COVA_BILLING_ORIGIN:'https://synthetic-billing.invalid',STRIPE_SECRET_KEY:'sk_test_synthetic_not_a_real_key',STRIPE_ACCOUNT_ID:'acct_synthetic',STRIPE_PRO_PRICE_ID:'price_synthetic',STRIPE_PORTAL_CONFIGURATION_ID:'bpc_synthetic'};
const snapshot={version:'ask-cova-data-v1',owner:A,workspaceRevision:1,workspaceRecords:[],passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}};
const conversation={message:'hey cova',history:[]};
const plan={version:'ask-cova-query-plan-v1',decision:{kind:'converse',reason:'greeting'}};
const context=await load('src/lib/askCovaData.ts').buildAskCovaDataContext({snapshot,account:'local',range:'all',conversation});
const result=await load('src/lib/askCovaQuery.ts').executeAskCovaQuery(context,plan);
const answer={version:'ask-cova-answer-v2',paragraphs:[{text:'hey, what would you like to look at?',evidence:[result.observations[0].id]}],detail:[]};
const paid={action:'ask_cova',protocolVersion:'ask-cova-v4',owner:A,requestId,snapshotDigest:context.snapshotDigest,contextDigest:context.contextDigest,account:'local',range:'all',conversation};
const contextBody={action:'ask_cova_context',owner:A,account:'local',range:'all'};
const envelope=(value,output)=>({model:'gpt-6-luna',status:'completed',service_tier:'default',usage:{input_tokens:100,output_tokens:output,total_tokens:100+output},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(value),annotations:[]}]}]});
function fixture(t,{user=A,policy=true,invalid=false,countFailure=false,env={}}={}){
 const relevant=/^(?:ASK_COVA_|WORKSPACE_|SUPABASE_|VITE_|COVA_BILLING_|STRIPE_|KV_|OPENAI_|VERCEL_)/;
 const previous=Object.fromEntries(Object.entries(process.env).filter(([k])=>relevant.test(k)));
 for(const k of Object.keys(process.env))if(relevant.test(k))delete process.env[k];
 Object.assign(process.env,environment,env);
 t.after(()=>{for(const k of Object.keys(process.env))if(relevant.test(k))delete process.env[k];Object.assign(process.env,previous);});
 const events=[],commands=[],requests=[];let generations=0;
 t.mock.method(globalThis,'fetch',async(url,o={})=>{
  const u=new URL(url),reply=v=>new Response(JSON.stringify(v));requests.push({url:u.href,...o});
  if(u.origin===environment.SUPABASE_URL&&u.pathname==='/auth/v1/user'){
   events.push('auth');assert.equal(o.headers.Authorization,'Bearer synthetic-session');return invalid?new Response('{}',{status:401}):reply({id:user,app_metadata:{plan:'free'}});
  }
  if(u.origin===environment.SUPABASE_URL&&u.pathname==='/rest/v1/policy_acceptances'){
   events.push('policy');assert.equal(u.searchParams.get('user_id'),'eq.'+user);assert.equal(u.searchParams.get('terms_version'),'eq.'+CURRENT_TERMS_VERSION);assert.equal(u.searchParams.get('privacy_version'),'eq.'+CURRENT_PRIVACY_VERSION);return reply(policy?[{id:'synthetic-policy'}]:[]);
  }
  if(u.origin===environment.SUPABASE_URL&&['workspace_settings','workspace_records','passport_rule_plans','passport_session_reviews','passport_reward_days'].includes(u.pathname.split('/').at(-1))){
   const table=u.pathname.split('/').at(-1);events.push(table);assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.equal(u.searchParams.get('owner_id'),'eq.'+A);
   return reply(table==='workspace_settings'?[{disclosure_version:'workspace-cloud-v1',revision:1,pending_manifest:null}]:[]);
  }
  if(u.origin===environment.KV_REST_API_URL){
   const cmd=JSON.parse(o.body);commands.push(cmd);assert.equal(cmd[0],'EVAL','billing GET or unexpected budget operation forbidden');
   if(cmd[2]==='5'){events.push('reserve');assert.equal(cmd[10],'4000');return reply({result:[1,0]});}
   assert.equal(cmd[2],'1');assert.doesNotMatch(cmd[1],/HSET|DECR|HINCRBY|budget/i);events.push('release');return reply({result:1});
  }
  if(u.href==='https://api.openai.com/v1/responses/input_tokens'){events.push('count');return countFailure?new Response('invalid'):reply({object:'response.input_tokens',input_tokens:100});}
  if(u.href==='https://api.openai.com/v1/responses'){events.push('generation');generations++;return reply(envelope(generations===1?plan:answer,generations===1?384:640));}
  assert.fail('unmocked destination '+u.origin+u.pathname);
 });
 return{events,commands,requests};
}
async function invoke(handler,body=contextBody,headers={authorization:'Bearer synthetic-session'}){
 let status,payload;const out={};await handler({method:'POST',url:'/api/workspace',body,headers},{setHeader(k,v){out[k]=v;},status(n){status=n;return this;},json(p){payload=p;return this;}});
 assert.equal(out['Cache-Control'],'private, no-store');return{status,payload};
}
// Import after installing each synthetic transport: handler factories capture
// the fetch implementation. A cache-busting URL produces fresh native closures.
let serial=0;
async function nativeHandler(){return(await import(pathToFileURL(file).href+'?test='+serial++)).default;}
for(const action of ['context','v4'])test(`native ${action} default auth rejects before storage, billing, permit or provider`,async t=>{
 for(const [setup,owner,status,expected]of [[{user:B},B,404,['auth','policy']],[{policy:false},A,403,['auth','policy']],[{invalid:true},A,401,['auth']],[{},B,409,['auth','policy']],[{env:{ASK_COVA_ENABLED:'false'}},A,404,['auth','policy']]])await t.test(String(status),async sub=>{
  const f=fixture(sub,setup),handler=await nativeHandler();
  const r=await invoke(handler,{...(action==='context'?contextBody:paid),owner});assert.equal(r.status,status);assert.deepEqual(f.events,expected);assert.equal(f.commands.length,0);
 });
});
test('native context default storage is complete, read-only and has no provider/ledger prerequisite',async t=>{
 const f=fixture(t,{env:{OPENAI_API_KEY:'',ASK_COVA_BUDGET_ID:''}}),handler=await nativeHandler();const r=await invoke(handler);
 assert.equal(r.status,200);assert.deepEqual(r.payload,snapshot);assert.equal(f.commands.length,0);
 for(const path of ['workspace_records','passport_rule_plans','passport_session_reviews','passport_reward_days'])assert(f.events.includes(path));
 assert(f.requests.every(r=>!r.url.includes('openai')&&!r.url.includes('upstash')));
});
test('native v4 uses unchanged real budget implementation and actual core then releases before response',async t=>{
 const f=fixture(t),handler=await nativeHandler();const r=await invoke(handler,JSON.stringify(paid));
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.payload.resultDigest,result.resultDigest);assert.equal(r.payload.planDigest,result.planDigest);assert.deepEqual(r.payload.answer,answer);
 assert.deepEqual(f.events.filter(e=>['reserve','count','generation','release'].includes(e)),['reserve','count','generation','count','generation','release']);assert.equal(f.commands.length,2);assert.equal(f.events.at(-1),'release');
});
test('native v4 failed count keeps its one reservation and does not generate or refund',async t=>{
 const f=fixture(t,{countFailure:true}),handler=await nativeHandler();assert.deepEqual(await invoke(handler,paid),{status:503,payload:{status:'unavailable',error:'token_count_unavailable'}});
 assert.deepEqual(f.events.filter(e=>['reserve','count','generation','release'].includes(e)),['reserve','count','release']);assert.equal(f.commands.length,2);
});
