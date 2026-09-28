import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {test} from 'node:test';
const file=new URL('./billing-preview-provision.mjs',import.meta.url);
test('preview QA provisioning has an explicit sandbox-only entrypoint',async()=>{
 assert.ok(existsSync(file),'missing opt-in preview provisioner');
 const {provision}=await import(file.href);
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('must not call provider')};
 assert.deepEqual(await provision({env:{},fetchImpl}),{skipped:true});
 for(const env of [{COVA_BILLING_QA_FIXTURE:'{}'}, {COVA_BILLING_QA_FIXTURE:'{}',COVA_BILLING_MODE:'sandbox',VERCEL_ENV:'production'}])await assert.rejects(()=>provision({env,fetchImpl}));
 assert.equal(calls,0);
});
test('provisions only marked synthetic identities and reads them back without exporting secrets',async()=>{
 const {provision}=await import(file.href);
 const id='122d8151-558a-4c8c-82dd-6fd10f5f1979', password='synthetic-test-password-at-least-32-characters';
 const fixture={id,email:`billing-qa-${id}@example.invalid`,password};
 const env={COVA_BILLING_QA_FIXTURE:JSON.stringify([fixture]),COVA_BILLING_MODE:'sandbox',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feat/stripe-sandbox-billing',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',KV_REST_API_URL:'https://test.upstash.io',KV_REST_API_TOKEN:'fixture-kv'};
 let stored=null;const calls=[];
 const fetchImpl=async(url,options={})=>{
  calls.push([url,options]);
  if(url==='https://test.upstash.io')return new Response(JSON.stringify({result:'PONG'}));
  if(options.method==='POST'){const b=JSON.parse(options.body);assert.equal(b.id,id);assert.equal(b.email,fixture.email);assert.equal(b.password,password);assert.equal(b.app_metadata.plan,undefined);stored={id,email:b.email,app_metadata:b.app_metadata};return new Response(JSON.stringify(stored));}
  return new Response(JSON.stringify(stored||{}),{status:stored?200:404});
 };
 const result=await provision({env,fetchImpl});assert.deepEqual(result,{verifiedOwners:[id],redis:'PONG'});assert.equal(calls.length,4);assert.ok(!JSON.stringify(result).includes(password));
 calls.length=0;await provision({env,fetchImpl});assert.equal(calls.length,2,'idempotent read must not reset existing credentials');
 stored.app_metadata={};await assert.rejects(()=>provision({env,fetchImpl}),/Synthetic identity mismatch/);
 for(const change of [{email:'real@covadesk.com'},{id:'bad'},{password:'short'}])await assert.rejects(()=>provision({env:{...env,COVA_BILLING_QA_FIXTURE:JSON.stringify([{...fixture,...change}])},fetchImpl}));
});
