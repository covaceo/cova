import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import Stripe from 'stripe';
import {Readable} from 'node:stream';
assert.ok(existsSync('api/billing.js'),'authenticated billing endpoint is required');
assert.ok(existsSync('api/_lib/billing-store.js'),'durable fenced billing storage is required');
assert.ok(existsSync('api/_lib/billing-webhook.js'),'signed raw-body webhook is required');
const {createBillingStore}=await import('../api/_lib/billing-store.js');
const rows=new Map();const commands=[];
const command=async args=>{commands.push(args);const [op,key,...rest]=args;if(op==='INCR'){const n=(Number(rows.get(key))||0)+1;rows.set(key,n);return n}if(op==='EXPIRE')return 1;if(op==='GET')return rows.get(key)||null;if(op==='SET'){if(rest.includes('NX')&&rows.has(key))return null;rows.set(key,rest[0]);return 'OK'}if(op==='EVAL'){const count=Number(args[2]),keys=args.slice(3,3+count),a=args.slice(3+count);if(rows.get(keys[0])!==a[0])return 0;if(count===1){rows.delete(keys[0]);return 1}if(keys[2]!==keys[1]){const owner=rows.get(keys[2]);if(owner&&owner!==a[2])return -1;rows.set(keys[2],a[2]);}rows.set(keys[1],a[1]);return 1}throw Error('Unexpected command')};
const store=createBillingStore({accountId:'acct_fixture'},{command});
await store.withOwner('owner-a',async(row,save)=>{row.customerId='cus_a';await save();await assert.rejects(()=>store.withOwner('owner-a',async()=>{}),e=>e.statusCode===409)});
assert.equal(await store.ownerForCustomer('cus_a'),'owner-a');
await assert.rejects(()=>store.withOwner('owner-b',async(row,save)=>{row.customerId='cus_a';await save()}),/ownership/);
await store.withOwner('owner-a',async(row,save)=>{const lock=[...rows.keys()].find(k=>k.endsWith(':lock'));rows.delete(lock);await assert.rejects(save,/expired/)});
assert.ok(commands.filter(c=>c[0]==='EVAL'&&c[2]===3).every(c=>c[1].includes("redis.call('GET',KEYS[1])")&&c[1].includes("redis.call('SET',KEYS[2]")));
const res=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}});
const {default:billing}=await import('../api/billing.js');const webhook=(req,res)=>{req.url='/api/billing?webhook=1';return billing(req,res)};
const old={...process.env},originalFetch=globalThis.fetch;try{delete process.env.COVA_BILLING_MODE;
let r=res();await billing({method:'POST',headers:{},body:{action:'checkout'}},r);assert.equal(r.statusCode,401);
r=res();await billing({method:'DELETE',headers:{}},r);assert.equal(r.statusCode,405);
r=res();await webhook({method:'POST',headers:{}},r);assert.equal(r.statusCode,503);
process.env.COVA_BILLING_MODE='sandbox';process.env.VERCEL_ENV='production';r=res();await webhook({method:'POST',headers:{}},r);assert.equal(r.statusCode,503);

Object.assign(process.env,{COVA_BILLING_MODE:'sandbox',VERCEL_ENV:'preview',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_ACCOUNT_ID:'acct_fixture',STRIPE_PRO_PRICE_ID:'price_fixture',STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture',COVA_BILLING_ALLOWED_USERS:'11111111-1111-4111-8111-111111111111',COVA_BILLING_ORIGIN:'https://preview.example.test',STRIPE_WEBHOOK_SECRET:'whsec_fixture_only'});
const sdk=new Stripe('sk_test_fixture'),payload=JSON.stringify({id:'evt_fixture',type:'unhandled.fixture',livemode:false,data:{object:{}}});
const signed=sdk.webhooks.generateTestHeaderString({payload,secret:'whsec_fixture_only'});
for(const[body,signature,status]of[[payload,signed,200],[payload+' ',signed,400],[payload,'t=1,v1=bad',400],[payload,sdk.webhooks.generateTestHeaderString({payload,secret:'whsec_fixture_only',timestamp:1}),400]]){
 const req=Readable.from([Buffer.from(body)]);Object.assign(req,{method:'POST',headers:{'stripe-signature':signature}});r=res();await webhook(req,r);assert.equal(r.statusCode,status,'raw-body signature/timestamp gate');
}

process.env.SUPABASE_URL='https://auth.example.test';process.env.SUPABASE_ANON_KEY='fixture_public';
globalThis.fetch=async()=>new Response(JSON.stringify({id:'11111111-1111-4111-8111-111111111111',email:'one@example.test',app_metadata:{}}),{status:200});
for(const[body,origin,status]of[[JSON.stringify({action:'checkout',customer:'cus_other'}),'https://preview.example.test',400],['{broken','https://preview.example.test',400],['x'.repeat(16385),'https://preview.example.test',413],[JSON.stringify({action:'portal'}),'https://evil.example.test',403]]){
 const req=Readable.from([Buffer.from(body)]);Object.assign(req,{url:'/api/billing',method:'POST',headers:{authorization:'Bearer fixture_token',origin}});r=res();await billing(req,r);assert.equal(r.statusCode,status,'authenticated raw JSON branch cannot accept caller-owned targets or foreign origin');
}
}finally{process.env=old;globalThis.fetch=originalFetch}
console.log('PASS billing API auth/method/production gates and storage lease ownership/fencing contracts');
