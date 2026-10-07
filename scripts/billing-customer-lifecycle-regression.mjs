import assert from 'node:assert/strict';
import test from 'node:test';
import {createBillingService} from '../api/_lib/billing.js';
const OWNER='11111111-1111-4111-8111-111111111111';
function fixture(mode='sandbox'){
 const live=mode==='live',now=Date.UTC(2026,9,7),config={mode,amount:live?2900:3000,allowedUsers:new Set([OWNER]),origin:'https://billing-preview.example.test',accountId:'acct_fixture',priceId:'price_fixture',portalId:'bpc_fixture'};
 const customer={id:'cus_fixture',livemode:live,metadata:{cova_user_id:OWNER}};
 const invoice={id:'in_fixture',livemode:live,customer:customer.id,status:'open',currency:'usd',amount_remaining:config.amount,hosted_invoice_url:'https://invoice.stripe.com/i/fixture',lines:{has_more:false,data:[{quantity:1,pricing:{price_details:{price:config.priceId}},parent:{subscription_item_details:{subscription:'sub_fixture'}},period:{end:now/1000+3600}}]}};
 const sub={id:'sub_fixture',livemode:live,customer:customer.id,status:'incomplete',cancel_at_period_end:false,items:{data:[{price:{id:config.priceId},quantity:1}]},latest_invoice:invoice.id};
 let subs=[sub],row={ownerId:OWNER,customerId:customer.id};const calls=[];
 const stripe={accounts:{retrieve:async()=>({id:config.accountId,charges_enabled:true})},customers:{retrieve:async()=>customer},subscriptions:{list:async()=>({data:subs,has_more:false}),update:async(id,body)=>{calls.push(['subscription.update',id,body]);Object.assign(sub,body);return sub;}},invoices:{retrieve:async id=>{calls.push(['invoice',id]);return invoice;}}};
 const store={withOwner:async(owner,run)=>{assert.equal(owner,OWNER);const working=structuredClone(row);return run(working,async()=>{row=structuredClone(working);});}};
 const service=createBillingService({config,stripe,store,now:()=>now});
 return {service,invoice,sub,customer,config,calls,stripe,setSubs:value=>subs=value,row:()=>row};
}
for(const mode of ['sandbox','live'])test(`${mode} recovery refuses an unexpected invoice identifier`,async()=>{
 const f=fixture(mode);f.invoice.id='in_other';
 assert.equal((await f.service.status({id:OWNER})).canRecoverPayment,false,'the recovered invoice must be the subscription latest invoice');
 await assert.rejects(()=>f.service.recover({id:OWNER}),e=>e.statusCode===409);
});
for(const mode of ['sandbox','live'])test(`${mode} unpaid first invoice has an owner-bound recovery without duplicate checkout`,async()=>{
 const f=fixture(mode),user={id:OWNER,plan:'free'};
 const state=await f.service.status(user);
 assert.equal(state.plan,'free');assert.equal(state.canCheckout,false);
 assert.equal(state.paymentRequired,true,'an incomplete paid subscription must clearly request payment');
 assert.equal(state.canRecoverPayment,true,'a matching unpaid invoice must have a recovery path');
 assert.equal((await f.service.recover(user)).url,f.invoice.hosted_invoice_url);
 assert.deepEqual(f.calls.find(c=>c[0]==='subscription.update'),['subscription.update',f.sub.id,{payment_settings:{save_default_payment_method:'on_subscription'}}],'recovering an invoice must also retain its successful payment method for future subscription bills');
 assert.equal(f.row().state.plan,'free','opening an invoice never grants paid access');
});

for(const mode of ['sandbox','live'])test(`${mode} invoice recovery fails closed on foreign owners, targets and provider mode`,async()=>{
 const foreign='22222222-2222-4222-8222-222222222222';
 for(const change of [f=>f.customer.metadata.cova_user_id=foreign,f=>f.sub.customer='cus_foreign',f=>f.sub.livemode=!f.sub.livemode,f=>f.invoice.livemode=!f.invoice.livemode]){
  const f=fixture(mode);change(f);await assert.rejects(()=>f.service.recover({id:OWNER}));assert.notEqual(f.row().state?.plan,'pro');
 }
 if(mode==='sandbox')await assert.rejects(()=>fixture(mode).service.recover({id:foreign}),e=>e.statusCode===403);
});
for(const mode of ['sandbox','live'])test(`${mode} invoice recovery refuses paid, malformed, unrelated and unsafe invoices`,async()=>{
 const invalid=[f=>f.invoice.customer='cus_foreign',f=>f.invoice.status='paid',f=>f.invoice.status='void',f=>f.invoice.currency='eur',f=>f.invoice.amount_remaining=0,f=>f.invoice.amount_remaining='3000',f=>f.invoice.lines.has_more=true,f=>f.invoice.lines.data[0].quantity=2,f=>f.invoice.lines.data[0].pricing.price_details.price='price_other',f=>f.invoice.lines.data[0].parent.subscription_item_details.subscription='sub_other',f=>f.sub.items.data[0].quantity=2,f=>f.sub.status='canceled'];
 for(const change of invalid){const f=fixture(mode);change(f);assert.equal((await f.service.status({id:OWNER})).canRecoverPayment,false);await assert.rejects(()=>f.service.recover({id:OWNER}),e=>e.statusCode===409);}
 for(const url of ['http://invoice.stripe.com/i/fixture','https://evil.example/i/fixture','https://invoice.stripe.com@evil.example/i/fixture','https://user:synthetic@invoice.stripe.com/i/fixture']){
  const f=fixture(mode);f.invoice.hosted_invoice_url=url;await assert.rejects(()=>f.service.recover({id:OWNER}),e=>e.statusCode===503);
 }
});
for(const mode of ['sandbox','live'])test(`${mode} successful invoice recovery restores only verified paid access and ends at the paid deadline`,async()=>{
 const f=fixture(mode);await f.service.recover({id:OWNER});f.invoice.status='paid';f.invoice.amount_remaining=0;f.sub.status='active';
 let state=await f.service.status({id:OWNER,plan:'free'});assert.equal(state.plan,'pro');assert.equal(state.accessSource,'subscription');assert.equal(state.paymentRequired,false);assert.equal(state.canRecoverPayment,false);await assert.rejects(()=>f.service.recover({id:OWNER}),e=>e.statusCode===409);
 f.invoice.lines.data[0].period.end=Date.UTC(2026,9,7)/1000;state=await f.service.status({id:OWNER});assert.equal(state.plan,'free');assert.equal(state.accessSource,'free');
 state=await f.service.status({id:OWNER,plan:'pro'});assert.equal(state.plan,'pro');assert.equal(state.accessSource,'included','manual access is independent even when subscription history exists');
});

test('sandbox readback is opt-in, exact-branch guarded and never accepts unmarked owners',async()=>{
 const fs=await import('node:fs');const url=new URL('./billing-proof-readback.mjs',import.meta.url);assert(fs.existsSync(url),'a scoped read-only proof helper is required');const{readback}=await import(url.href);let calls=0;const invoke=env=>readback({env,readStore:async()=>{calls++;throw Error('must not access store before guards')},fetchImpl:async()=>{calls++;throw Error('must not access Auth before guards')}});
 assert.deepEqual(await invoke({}),{skipped:true});assert.equal(calls,0);
 for(const env of [{COVA_BILLING_QA_READBACK:'true',COVA_BILLING_MODE:'live',VERCEL_ENV:'production'},{COVA_BILLING_QA_READBACK:'true',COVA_BILLING_MODE:'sandbox',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'main'}])await assert.rejects(()=>invoke(env));assert.equal(calls,0);
 const env={COVA_BILLING_QA_READBACK:'true',COVA_BILLING_MODE:'sandbox',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feat/paid-customer-lifecycle',COVA_BILLING_ALLOWED_USERS:OWNER,SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic',STRIPE_ACCOUNT_ID:'acct_fixture'};
 await assert.rejects(()=>readback({env,fetchImpl:async()=>({ok:true,json:async()=>({id:OWNER,email:'real-person@example.test',app_metadata:{}})}),readStore:async()=>{calls++;throw Error('unmarked owner must not reach store')}}));assert.equal(calls,0);
 const row={ownerId:OWNER,customerId:'cus_fixture',state:{plan:'free',status:'incomplete',paidUntil:null},events:['evt_fixture'],verifiedAt:1,privateSecret:'do-not-export'};const out=await readback({env,fetchImpl:async()=>({ok:true,json:async()=>({id:OWNER,email:`billing-qa-${OWNER}@example.invalid`,app_metadata:{cova_billing_qa:true}})}),readStore:async()=>row});assert.equal(out.receipts[0].ownerId,OWNER);assert.deepEqual(out.receipts[0].events,['evt_fixture']);assert(!JSON.stringify(out).includes('do-not-export'));
});

for(const mode of ['sandbox','live'])test(`${mode} recovery payment preference fails closed and does not repeat a confirmed setting`,async()=>{
 const f=fixture(mode);await f.service.recover({id:OWNER});await f.service.recover({id:OWNER});assert.equal(f.calls.filter(c=>c[0]==='subscription.update').length,1);assert.equal(f.row().state.plan,'free');
 for(const change of [f=>f.sub.id='sub_foreign',f=>f.sub.customer='cus_foreign',f=>f.sub.livemode=!f.sub.livemode,f=>f.sub.payment_settings.save_default_payment_method='off',f=>f.sub.latest_invoice='in_foreign',f=>f.sub.items.data[0].quantity=2]){
  const g=fixture(mode);g.subscriptionsUpdate=change;const original=g.stripe.subscriptions.update;g.stripe.subscriptions.update=async(...args)=>{const updated=await original(...args);change(g);return updated;};await assert.rejects(()=>g.service.recover({id:OWNER}));assert.equal(g.row().state.plan,'free');
 }
});
