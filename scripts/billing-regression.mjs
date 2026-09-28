import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
const path = new URL('../api/_lib/billing.js', import.meta.url);
const OWNER = '11111111-1111-4111-8111-111111111111';
const env = { COVA_BILLING_MODE:'sandbox', VERCEL_ENV:'preview', STRIPE_SECRET_KEY:'sk_test_fixture', STRIPE_ACCOUNT_ID:'acct_fixture', STRIPE_PRO_PRICE_ID:'price_fixture', COVA_BILLING_ALLOWED_USERS:OWNER, COVA_BILLING_ORIGIN:'https://billing-preview.example.test', STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture' };
function memoryStore() {
 const rows=new Map(),locks=new Set();
 return { rows, async ownerForCustomer(id){return [...rows].find(([,v])=>v.customerId===id)?.[0]}, async withOwner(owner,fn){ if(locks.has(owner)) throw Object.assign(new Error('Busy'),{statusCode:409}); locks.add(owner); try {const row=structuredClone(rows.get(owner)||{ownerId:owner}); return await fn(row,async()=>rows.set(owner,structuredClone(row)));} finally {locks.delete(owner)} } };
}
function provider() {
 const calls=[]; let sessions=new Map(),subs=[];
 return { calls, setSubs(v){subs=v}, accounts:{retrieve:async()=>({id:'acct_fixture'})}, prices:{retrieve:async()=>({id:'price_fixture',active:true,livemode:false,unit_amount:3000,currency:'usd',recurring:{interval:'month',interval_count:1}})}, customers:{create:async(p,o)=>{calls.push(['customer',p,o]);return{id:'cus_fixture',livemode:false,metadata:p.metadata}},retrieve:async()=>({id:'cus_fixture',livemode:false,metadata:{cova_user_id:OWNER}})}, subscriptions:{list:async()=>({data:subs,has_more:false})}, checkout:{sessions:{create:async(p,o)=>{calls.push(['checkout',p,o]);const v={id:'cs_test_fixture',customer:'cus_fixture',livemode:false,status:'open',url:'https://checkout.stripe.com/c/pay/cs_test_fixture'};sessions.set(v.id,v);return v},retrieve:async id=>sessions.get(id)}}, billingPortal:{sessions:{create:async p=>{calls.push(['portal',p]);return {url:'https://billing.stripe.com/p/session/test_fixture'}}}} };
}
test('checkout is tied to the verified owner and reuses its persisted open session',async()=>{
 const mod=await import(path); assert.equal(typeof mod.createBillingService,'function','billing service must exist');
 const stripe=provider(),store=memoryStore(),service=mod.createBillingService({config:mod.billingConfig(env),stripe,store});
 const first=await service.checkout({id:OWNER,email:'one@example.test'});
 const second=await service.checkout({id:OWNER,email:'changed@example.test'});
 assert.equal(first.url,second.url);
 assert.equal(stripe.calls.filter(v=>v[0]==='checkout').length,1);
 const params=stripe.calls.find(v=>v[0]==='checkout')[1];
 assert.equal(params.ui_mode,'hosted_page');assert.equal(params.branding_settings.background_color,'#0B1017');assert.equal(params.branding_settings.button_color,'#315DCA');
 assert.equal(params.customer,'cus_fixture'); assert.equal(params.client_reference_id,OWNER);
 assert.deepEqual(params.line_items,[{price:'price_fixture',quantity:1}]);
 assert.deepEqual(params.managed_payments,{enabled:false},'ordinary subscriptions must not silently opt into managed payments');assert.equal(params.mode,'subscription'); assert.equal(params.allow_promotion_codes,false);
 assert.equal(params.success_url,'https://billing-preview.example.test/?billing=returned#dashboard');
 await assert.rejects(()=>service.checkout({id:'22222222-2222-4222-8222-222222222222'}),e=>e.statusCode===403);
});

function paidSubscription(status='active',paid=true) {
 const end=Math.floor(Date.now()/1000)+86400;
 return {id:'sub_fixture',customer:'cus_fixture',livemode:false,status,cancel_at_period_end:false,items:{data:[{id:'si_fixture',price:{id:'price_fixture'},quantity:1}]},latest_invoice:{id:'in_fixture',customer:'cus_fixture',livemode:false,status:paid?'paid':'open',lines:{data:[{quantity:1,pricing:{price_details:{price:'price_fixture'}},parent:{subscription_item_details:{subscription:'sub_fixture'}},period:{end}}],has_more:false}}};
}
test('only a paid matching subscription grants Pro; failed renewal and cancellation revoke it',async()=>{
 const {createBillingService,billingConfig}=await import(path); const stripe=provider(),store=memoryStore();
 const service=createBillingService({config:billingConfig(env),stripe,store});
 await service.checkout({id:OWNER,email:'one@example.test'});
 assert.equal(typeof service.status,'function','status must reconcile verified Stripe state');
 stripe.invoices={retrieve:async()=>stripe.invoice};
 const sub=paidSubscription(); stripe.invoice=sub.latest_invoice; stripe.setSubs([sub]);
 assert.equal((await service.status({id:OWNER,plan:'free'})).plan,'pro');
 sub.cancel_at_period_end=true;
 assert.equal((await service.status({id:OWNER,plan:'free'})).cancelAtPeriodEnd,true);
 assert.equal((await service.status({id:OWNER,plan:'free'})).plan,'pro');
 sub.status='past_due'; stripe.invoice.status='open';
 assert.equal((await service.status({id:OWNER,plan:'free'})).plan,'free');
 sub.status='canceled';
 assert.equal((await service.status({id:OWNER,plan:'free'})).plan,'free');
 sub.status='active';stripe.invoice.status='paid';sub.items.data[0].price.id='price_other';
 assert.equal((await service.status({id:OWNER,plan:'free'})).plan,'free');
 sub.items.data[0].price.id='price_fixture';stripe.invoice.lines.data[0].period.end=1;
 assert.equal((await service.status({id:OWNER,plan:'free'})).plan,'free');
 assert.equal((await service.status({id:OWNER,plan:'pro'})).plan,'pro','manual entitlement survives');
});

test('in-page cancellation stops renewal, preserves paid access, and is idempotent',async()=>{
 const {createBillingService,billingConfig}=await import(path),stripe=provider(),store=memoryStore();
 const service=createBillingService({config:billingConfig(env),stripe,store});await service.checkout({id:OWNER,email:'one@example.test'});
 const sub=paidSubscription();stripe.setSubs([sub]);stripe.invoices={retrieve:async()=>sub.latest_invoice};let updates=0;
 stripe.subscriptions.update=async(id,params)=>{assert.equal(id,sub.id);assert.deepEqual(params,{cancel_at_period_end:true});updates++;sub.cancel_at_period_end=true;return sub;};
 assert.equal(typeof service.cancel,'function','Billing page needs server-owned cancellation');
 assert.equal((await service.status({id:OWNER})).canCancel,true);
 const result=await service.cancel({id:OWNER});assert.equal(result.plan,'pro');assert.equal(result.cancelAtPeriodEnd,true);assert.equal(result.canCancel,false);assert.equal(result.ownerId,OWNER);
 await service.cancel({id:OWNER});assert.equal(updates,1);
});


for(const mode of ['sandbox','live'])test(`${mode} cancellation rejects unlinked, wrong-owner, wrong-mode, ambiguous and scheduled-plan targets`,async()=>{
 const {createBillingService,billingConfig}=await import(path),stripe=provider(),store=memoryStore(),live=mode==='live';
 const config={...billingConfig(env),mode,amount:live?2900:3000};stripe.accounts.retrieve=async()=>({id:'acct_fixture',charges_enabled:true});
 stripe.customers.retrieve=async()=>({id:'cus_fixture',livemode:live,metadata:{cova_user_id:OWNER}});
 let updates=0;stripe.subscriptions.update=async(id)=>{updates++;sub.cancel_at_period_end=true;return sub;};
 const service=createBillingService({config,stripe,store});const granted=await service.status({id:OWNER,plan:'pro'});assert.equal(granted.hasSubscription,false);assert.equal(granted.canCancel,false);assert.equal(granted.plan,'pro');
 await assert.rejects(()=>service.cancel({id:OWNER}),e=>e.statusCode===409);assert.equal(updates,0);
 store.rows.set(OWNER,{ownerId:OWNER,customerId:'cus_fixture'});const sub=paidSubscription();sub.livemode=live;sub.latest_invoice.livemode=live;stripe.invoices={retrieve:async()=>sub.latest_invoice};stripe.setSubs([sub]);
 sub.customer='cus_foreign';await assert.rejects(()=>service.cancel({id:OWNER}),/ownership/);assert.equal(updates,0);sub.customer='cus_fixture';
 sub.livemode=!live;await assert.rejects(()=>service.cancel({id:OWNER}),/verified/);assert.equal(updates,0);sub.livemode=live;
 sub.items.data[0].price.id='price_other';await assert.rejects(()=>service.cancel({id:OWNER}),/eligible/);assert.equal(updates,0);sub.items.data[0].price.id='price_fixture';
 sub.schedule='sub_sched_fixture';await assert.rejects(()=>service.cancel({id:OWNER}),/eligible/);assert.equal(updates,0);delete sub.schedule;
 stripe.setSubs([sub,{...sub,id:'sub_duplicate'}]);await assert.rejects(()=>service.cancel({id:OWNER}),/review/);assert.equal(updates,0);stripe.setSubs([sub]);
 const results=await Promise.allSettled([service.cancel({id:OWNER}),service.cancel({id:OWNER})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(updates,1);assert.equal((await service.status({id:OWNER})).cancelAtPeriodEnd,true);
});

test('portal cancel_at schedules show Ending and cannot extend access beyond cancellation',async()=>{
 const {createBillingService,billingConfig}=await import(path),stripe=provider(),store=memoryStore();
 const service=createBillingService({config:billingConfig(env),stripe,store});await service.checkout({id:OWNER,email:'one@example.test'});
 const sub=paidSubscription();stripe.setSubs([sub]);stripe.invoices={retrieve:async()=>sub.latest_invoice};
 sub.cancel_at=sub.latest_invoice.lines.data[0].period.end;sub.cancel_at_period_end=false;
 let state=await service.status({id:OWNER});assert.equal(state.cancelAtPeriodEnd,true);assert.equal(state.plan,'pro');
 sub.cancel_at-=3600;state=await service.status({id:OWNER});assert.equal(Date.parse(state.paidUntil),sub.cancel_at*1000);
 sub.cancel_at=Math.floor(Date.now()/1000)-1;assert.equal((await service.status({id:OWNER})).plan,'free');
 sub.cancel_at=null;state=await service.status({id:OWNER});assert.equal(state.cancelAtPeriodEnd,false);assert.equal(state.plan,'pro');
});
test('webhook payload cannot grant access; duplicate/reversed events reconcile current provider state',async()=>{
 const {createBillingService,billingConfig}=await import(path); const stripe=provider(),store=memoryStore();
 const service=createBillingService({config:billingConfig(env),stripe,store}); await service.checkout({id:OWNER,email:'one@example.test'});
 assert.equal(typeof service.webhook,'function');
 const event={id:'evt_fixture',livemode:false,type:'customer.subscription.updated',data:{object:{id:'sub_fixture',customer:'cus_fixture',status:'active'}}};
 await service.webhook(event); assert.equal(store.rows.get(OWNER).state.plan,'free');
 const sub=paidSubscription(); stripe.setSubs([sub]); stripe.invoices={retrieve:async()=>sub.latest_invoice};
 await service.webhook({...event,id:'evt_new'});assert.equal(store.rows.get(OWNER).state.plan,'pro');
 sub.status='canceled';await service.webhook({...event,id:'evt_old',created:1});assert.equal(store.rows.get(OWNER).state.plan,'free');
 await service.webhook({...event,id:'evt_old'});assert.equal(store.rows.get(OWNER).state.plan,'free');
 await assert.rejects(()=>service.webhook({...event,livemode:true}),/sandbox/);
 await assert.rejects(()=>service.webhook({...event,account:'acct_other'}),/account/);
});
test('portal is server-owned and account deletion is blocked while a subscription exists',async()=>{
 const {createBillingService,billingConfig}=await import(path);const stripe=provider(),store=memoryStore(),service=createBillingService({config:billingConfig(env),stripe,store});
 await service.checkout({id:OWNER,email:'one@example.test'});
 assert.equal(typeof service.portal,'function');assert.equal(typeof service.assertDeletable,'function');
 assert.match((await service.portal({id:OWNER})).url,/^https:\/\/billing.stripe.com/);
 const params=stripe.calls.find(c=>c[0]==='portal')[1];assert.equal(params.customer,'cus_fixture');assert.equal(params.configuration,'bpc_fixture');
 stripe.setSubs([paidSubscription()]);await assert.rejects(()=>service.assertDeletable({id:OWNER}),e=>e.statusCode===409);
});

test('an account marked for deletion cannot begin checkout',async()=>{
 const {createBillingService,billingConfig}=await import(path);const stripe=provider(),store=memoryStore(),service=createBillingService({config:billingConfig(env),stripe,store});
 await service.assertDeletable({id:OWNER});await assert.rejects(()=>service.checkout({id:OWNER,email:'one@example.test'}),e=>e.statusCode===409);assert.equal(stripe.calls.length,0);
});
test('an ambiguous checkout retry uses the same persisted idempotency key',async()=>{
 const {createBillingService,billingConfig}=await import(path);const stripe=provider(),store=memoryStore(),service=createBillingService({config:billingConfig(env),stripe,store});
 const create=stripe.checkout.sessions.create;let attempts=0;const keys=[];stripe.checkout.sessions.create=async(p,o)=>{keys.push(o.idempotencyKey);const result=await create(p,o);if(++attempts===1)throw Error('network timeout after provider success');return result};
 await assert.rejects(()=>service.checkout({id:OWNER,email:'one@example.test'}),/timeout/);await service.checkout({id:OWNER,email:'one@example.test'});assert.equal(keys[0],keys[1]);assert.equal(stripe.calls.filter(c=>c[0]==='customer').length,1);
});
test('concurrent checkout attempts cannot both reach the provider',async()=>{
 const {createBillingService,billingConfig}=await import(path);const stripe=provider(),store=memoryStore(),service=createBillingService({config:billingConfig(env),stripe,store});
 const results=await Promise.allSettled([service.checkout({id:OWNER,email:'one@example.test'}),service.checkout({id:OWNER,email:'one@example.test'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(stripe.calls.filter(c=>c[0]==='checkout').length,1);
});
test('a completed checkout can be replaced only after its subscription is terminal',async()=>{
 const {createBillingService,billingConfig}=await import(path);const stripe=provider(),store=memoryStore(),service=createBillingService({config:billingConfig(env),stripe,store});
 await service.checkout({id:OWNER,email:'one@example.test'});stripe.checkout.sessions.retrieve=async()=>({id:'cs_test_fixture',customer:'cus_fixture',livemode:false,status:'complete',subscription:'sub_fixture'});stripe.setSubs([paidSubscription('canceled')]);
 await service.checkout({id:OWNER,email:'one@example.test'});assert.equal(stripe.calls.filter(c=>c[0]==='checkout').length,2);
});
test('billing is sandbox-only, allowlisted, and impossible on production', async () => {
  assert.ok(existsSync(path), 'sandbox billing module is required');
  const { billingConfig } = await import(path);
  const env = { COVA_BILLING_MODE:'sandbox', VERCEL_ENV:'preview', STRIPE_SECRET_KEY:'sk_test_fixture', STRIPE_ACCOUNT_ID:'acct_fixture', STRIPE_PRO_PRICE_ID:'price_fixture', COVA_BILLING_ALLOWED_USERS:'11111111-1111-4111-8111-111111111111', COVA_BILLING_ORIGIN:'https://billing-preview.example.test', STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture' };
  assert.equal(billingConfig(env).mode, 'sandbox');
  assert.throws(() => billingConfig({...env, VERCEL_ENV:'production'}), /disabled/);
  assert.throws(() => billingConfig({...env, STRIPE_SECRET_KEY:'sk_live_fixture'}), /sandbox/);
  assert.throws(() => billingConfig({...env, COVA_BILLING_ALLOWED_USERS:''}), /allowlist/);
  assert.equal(billingConfig({}), null);
});
