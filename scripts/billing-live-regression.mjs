import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import Stripe from 'stripe';
import deleteAccount from '../api/account/delete.js';
import {billingConfig,assertBillingOwner,createBillingService} from '../api/_lib/billing.js';
import {createBillingStore} from '../api/_lib/billing-store.js';
import {resolveBillingPlan} from '../api/_lib/billing-runtime.js';
const OWNER='11111111-1111-4111-8111-111111111111';
const env={COVA_BILLING_MODE:'live',COVA_BILLING_LIVE_ENABLED:'true',VERCEL_ENV:'production',STRIPE_SECRET_KEY:'sk_live_fixture_only',STRIPE_ACCOUNT_ID:'acct_fixture',STRIPE_PRO_PRICE_ID:'price_fixture',STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture',COVA_BILLING_ORIGIN:'https://covadesk.com',STRIPE_WEBHOOK_SECRET:'whsec_fixture_only'};
test('live billing requires an explicit production activation, live key and canonical origin at $29',()=>{
 const config=billingConfig(env);assert.equal(config.mode,'live');assert.equal(config.amount,2900);assert.doesNotThrow(()=>assertBillingOwner(config,OWNER));
 for(const overrides of [{COVA_BILLING_LIVE_ENABLED:''},{VERCEL_ENV:'preview'},{VERCEL_TARGET_ENV:'preview'},{STRIPE_SECRET_KEY:'sk_test_fixture_only'},{COVA_BILLING_ORIGIN:'https://preview.example.test'},{COVA_BILLING_ORIGIN:'https://covadesk.com/path'},{STRIPE_WEBHOOK_SECRET:''}])assert.throws(()=>billingConfig({...env,...overrides}));
 assert.throws(()=>assertBillingOwner(config,''));assert.equal(billingConfig({}),null);
});
test('live paid entitlements resolve from a separate owner-bound durable namespace',async()=>{
 const keys=[],row={ownerId:OWNER,customerId:'cus_fixture',verifiedAt:Date.now(),state:{plan:'pro',paidUntil:new Date(Date.now()+3600000).toISOString()}};
 const command=async args=>{keys.push(args[1]);return JSON.stringify(row);};
 assert.equal(await resolveBillingPlan({id:OWNER,plan:'free'},{env,command}),'pro');assert.match(keys[0],/^cova:billing:v1:live:/);
 row.state.paidUntil=new Date(1).toISOString();assert.equal(await resolveBillingPlan({id:OWNER,plan:'free'},{env,command}),'free');
 row.ownerId='22222222-2222-4222-8222-222222222222';await assert.rejects(()=>resolveBillingPlan({id:OWNER,plan:'free'},{env,command}),/ownership/);
 await createBillingStore({...billingConfig(env),mode:'sandbox'},{command}).read(OWNER);assert.match(keys.at(-1),/^cova:billing:v1:sandbox:/);
});
test('live linked accounts cannot bypass deletion protection merely because they are not sandbox allowlisted',async()=>{
 const originalEnv={...process.env},originalFetch=globalThis.fetch;let deleted=false;
 const row={ownerId:OWNER,customerId:'cus_fixture',verifiedAt:Date.now(),state:{plan:'free'}};
 try{
  Object.assign(process.env,env,{SUPABASE_URL:'https://fixture.supabase.test',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture',KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:'fixture'});
  mock.method(Stripe.resources.Accounts.prototype,'retrieve',async()=>({id:'acct_fixture',charges_enabled:true}));
  globalThis.fetch=async(url,options={})=>{
   if(String(url).includes('fixture.upstash.io')){const [op]=JSON.parse(options.body);return Response.json({result:op==='GET'?JSON.stringify(row):op==='SET'?'OK':1});}
   if(options.method==='DELETE')deleted=true;
   return Response.json({id:OWNER,email:'fixture@example.invalid',app_metadata:{}});
  };
  const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}};
  await deleteAccount({method:'DELETE',headers:{authorization:'Bearer fixture'},url:'/api/account/delete'},res);
  assert.equal(res.statusCode,409);assert.equal(deleted,false);
 }finally{process.env=originalEnv;globalThis.fetch=originalFetch;mock.restoreAll();}
});
function fixture(){
 const rows=new Map(),calls=[],sessions=new Map();let sub=null;
 const customer={id:'cus_fixture',livemode:true,metadata:{cova_user_id:OWNER}};
 const account={id:'acct_fixture',charges_enabled:true};
 const price={id:'price_fixture',livemode:true,active:true,unit_amount:2900,currency:'usd',recurring:{interval:'month',interval_count:1}};
 const stripe={accounts:{retrieve:async()=>account},customers:{create:async(p)=>{calls.push(['customer',p]);return customer;},retrieve:async()=>customer},prices:{retrieve:async()=>price},subscriptions:{list:async()=>({data:sub?[sub]:[],has_more:false})},invoices:{retrieve:async()=>sub.latest_invoice},checkout:{sessions:{create:async(p)=>{calls.push(['checkout',p]);const s={id:'cs_live_fixture',customer:customer.id,livemode:true,status:'open',url:'https://checkout.stripe.com/c/pay/cs_live_fixture'};sessions.set(s.id,s);return s;},retrieve:async id=>sessions.get(id)}},billingPortal:{sessions:{create:async p=>{calls.push(['portal',p]);return {url:'https://billing.stripe.com/p/session/live_fixture'};}}}};
 const store={rows,read:async id=>rows.get(id),ownerForCustomer:async id=>[...rows].find(([,v])=>v.customerId===id)?.[0],withOwner:async(owner,run)=>{const row=structuredClone(rows.get(owner)||{ownerId:owner});return run(row,async()=>rows.set(owner,structuredClone(row)));}};
 return {stripe,store,calls,account,price,customer,setSub(value){sub=value;}};
}
test('manual Pro is explicitly distinguished from paid subscription access',async()=>{
 const f=fixture(),service=createBillingService({config:billingConfig(env),stripe:f.stripe,store:f.store});
 const state=await service.status({id:OWNER,plan:'pro'});
 assert.equal(state.accessSource,'included','manual grants need an explicit source to survive paid-period expiry');
 assert.equal(state.hasSubscription,false);assert.equal(state.paidUntil,null);assert.equal(state.plan,'pro');
 assert.equal((await service.status({id:OWNER,plan:'free'})).accessSource,'free');
});
test('live checkout enforces the approved price, account readiness and provider mode; paid lifecycle stays owner-bound',async()=>{
 const f=fixture(),service=createBillingService({config:billingConfig(env),stripe:f.stripe,store:f.store});
 await service.checkout({id:OWNER,email:'fixture@example.invalid'});
 const params=f.calls.find(c=>c[0]==='checkout')[1];assert.equal(params.success_url,'https://covadesk.com/?billing=returned#dashboard');assert.equal(params.subscription_data.metadata.cova_environment,'live');assert.equal(f.calls[0][1].metadata.cova_environment,'live');
 let state=await service.status({id:OWNER});assert.equal(state.amount,2900);assert.equal(state.mode,'live');assert.equal(state.plan,'free');
 const sub={id:'sub_fixture',customer:'cus_fixture',livemode:true,status:'active',items:{data:[{price:{id:'price_fixture'},quantity:1}]},latest_invoice:{id:'in_fixture',livemode:true,customer:'cus_fixture',status:'paid',lines:{has_more:false,data:[{quantity:1,price:'price_fixture',subscription:'sub_fixture',period:{end:Math.floor(Date.now()/1000)+3600}}]}}};
 f.setSub(sub);assert.equal((await service.status({id:OWNER})).plan,'pro');await assert.rejects(()=>service.checkout({id:OWNER}),e=>e.statusCode===409);
 await assert.rejects(()=>service.assertDeletable({id:OWNER}),e=>e.statusCode===409);
 const event={id:'evt_live_fixture',type:'invoice.paid',livemode:true,data:{object:{customer:'cus_fixture'}}};
 sub.status='canceled';await service.webhook(event);assert.equal(f.store.rows.get(OWNER).state.plan,'free');await service.webhook(event);assert.equal(f.store.rows.get(OWNER).state.plan,'free');await assert.rejects(()=>service.webhook({...event,livemode:false}),/live/);
 f.customer.metadata.cova_user_id='22222222-2222-4222-8222-222222222222';await assert.rejects(()=>service.status({id:OWNER}),/ownership/);
 f.account.charges_enabled=false;await assert.rejects(()=>service.status({id:OWNER}),/enabled/);
 for(const bad of [{unit_amount:3000},{livemode:false}]){const badFixture=fixture();Object.assign(badFixture.price,bad);await assert.rejects(()=>createBillingService({config:billingConfig(env),stripe:badFixture.stripe,store:badFixture.store}).checkout({id:OWNER}));}
});
