// Sandbox and explicitly activated production billing remain isolated.
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';

export class BillingError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}
export function billingConfig(env = process.env) {
  if (!env.COVA_BILLING_MODE) return null;
  const mode=env.COVA_BILLING_MODE,live=mode==='live';
  if(live){
    if(env.COVA_BILLING_LIVE_ENABLED!=='true'||env.VERCEL_ENV!=='production'||(env.VERCEL_TARGET_ENV&&env.VERCEL_TARGET_ENV!=='production'))throw new BillingError(503,'Live billing is disabled in this environment.');
    if(!/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY||''))throw new BillingError(503,'A live Stripe key is required.');
    if(!/^whsec_/.test(env.STRIPE_WEBHOOK_SECRET||''))throw new BillingError(503,'Live billing webhook is not configured.');
  }else{
    if(mode!=='sandbox'||env.VERCEL_ENV==='production'||env.VERCEL_TARGET_ENV==='production')throw new BillingError(503,'Billing is disabled in this environment.');
    if(!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY||''))throw new BillingError(503,'A sandbox Stripe key is required.');
  }
  const allowedUsers=new Set(String(env.COVA_BILLING_ALLOWED_USERS||'').split(',').map(v=>v.trim()).filter(v=>/^[0-9a-f-]{36}$/i.test(v)));
  if(!live&&!allowedUsers.size)throw new BillingError(503,'A sandbox owner allowlist is required.');
  let origin;try{origin=new URL(env.COVA_BILLING_ORIGIN);}catch{throw new BillingError(503,'Billing origin is not configured.');}
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||(live?origin.origin!=='https://covadesk.com':['covadesk.com','www.covadesk.com'].includes(origin.hostname)))throw new BillingError(503,live?'Use the canonical live billing origin.':'Use an isolated HTTPS billing preview.');
  if(!/^acct_[a-zA-Z0-9]+$/.test(env.STRIPE_ACCOUNT_ID||'')||!/^price_[a-zA-Z0-9]+$/.test(env.STRIPE_PRO_PRICE_ID||'')||!/^bpc_[a-zA-Z0-9]+$/.test(env.STRIPE_PORTAL_CONFIGURATION_ID||''))throw new BillingError(503,'Billing is not configured.');
  return {mode,amount:live?2900:3000,allowedUsers,origin:origin.origin,accountId:env.STRIPE_ACCOUNT_ID,priceId:env.STRIPE_PRO_PRICE_ID,portalId:env.STRIPE_PORTAL_CONFIGURATION_ID,key:env.STRIPE_SECRET_KEY,webhookSecret:env.STRIPE_WEBHOOK_SECRET||''};
}
export function stripeClient(config) { return new Stripe(config.key, { apiVersion:'2026-08-26.dahlia', maxNetworkRetries:1, timeout:10000 }); }
export function billingOwnerEnabled(config,owner){return Boolean(config && /^[0-9a-f-]{36}$/i.test(owner||'') && (config.mode==='live'||config.allowedUsers.has(owner)));}
export function assertBillingOwner(config, owner) {
  if (!billingOwnerEnabled(config,owner)) throw new BillingError(403, 'Billing is restricted to authorized accounts.');
}
const idOf = value => typeof value === 'string' ? value : value?.id;
function safeStripeUrl(raw, host) {
  let url; try { url = new URL(raw); } catch { throw new BillingError(503, 'Stripe did not return a valid link.'); }
  if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password) throw new BillingError(503, 'Stripe did not return a valid link.');
  return url.href;
}
export function createBillingService({ config, stripe, store, now = Date.now }) {
  const providerObject=object=>{if(!object||object.livemode!==(config.mode==='live'))throw new BillingError(503,`Stripe ${config.mode} could not be verified.`);return object;};
  const back = `${config.origin}/?billing=returned#dashboard`;
  async function verifyAccount() {
    const account=await stripe.accounts.retrieve();
    if(account.id!==config.accountId)throw new BillingError(503,'Stripe account does not match billing configuration.');
    if(config.mode==='live'&&account.charges_enabled!==true)throw new BillingError(503,'Stripe payments are not enabled.');
  }
  async function subscriptions(customer) {
    const all = []; let cursor;
    do {
      const page = await stripe.subscriptions.list({customer,status:'all',limit:100,...(cursor?{starting_after:cursor}:{})});
      for (const sub of page.data) { providerObject(sub); if(idOf(sub.customer)!==customer) throw new BillingError(503,'Subscription ownership could not be verified.'); all.push(sub); }
      cursor = page.has_more ? page.data.at(-1)?.id : null;
      if (page.has_more && (!cursor || all.length >= 1000)) throw new BillingError(503,'Subscription history needs review.');
    } while(cursor);
    return all;
  }
  async function ensureCustomer(row, save, user) {
    if (!row.customerId) {
      row.customerAttempt ||= {id:randomUUID(),started:now()}; await save();
      if (now()-row.customerAttempt.started > 23*60*60*1000) throw new BillingError(409,'An earlier billing setup needs review. Contact support.');
      const customer = providerObject(await stripe.customers.create({email:user.email,metadata:{cova_user_id:user.id,cova_environment:config.mode}}, {idempotencyKey:`cova:${row.customerAttempt.id}`}));
      row.customerId = customer.id; await save();
    }
    const customer = providerObject(await stripe.customers.retrieve(row.customerId));
    if (customer.deleted || customer.metadata?.cova_user_id !== user.id) throw new BillingError(409,'Billing ownership could not be verified.');
  }
  const matchingSubscriptions=all=>all.filter(s=>s.items?.data?.length===1 && idOf(s.items.data[0].price)===config.priceId && s.items.data[0].quantity===1);
  const cancellableSubscriptions=all=>matchingSubscriptions(all).filter(s=>['active','trialing','past_due','unpaid'].includes(s.status)&&!s.schedule);
  const scheduled=sub=>Boolean(sub.cancel_at_period_end)||sub.cancel_at!=null;
  const response=(state,user)=>({...state,plan:user.plan==='pro'?'pro':state.plan,ownerId:user.id,mode:config.mode,amount:config.amount,currency:'usd',interval:'month'});
  async function reconcile(row, save) {
    const state={plan:'free',status:'none',paidUntil:null,cancelAtPeriodEnd:false,hasSubscription:false,canCancel:false,canManage:Boolean(row.customerId),canCheckout:true};
    if(row.customerId){
      const customer=providerObject(await stripe.customers.retrieve(row.customerId));
      if(customer.deleted || customer.metadata?.cova_user_id!==row.ownerId) throw new BillingError(409,'Billing ownership could not be verified.');
      const all=await subscriptions(row.customerId);
      state.canCheckout=!all.some(s=>!['canceled','incomplete_expired'].includes(s.status));
      const matching=matchingSubscriptions(all);
      state.hasSubscription=matching.some(s=>!['canceled','incomplete_expired'].includes(s.status));
      const cancellable=cancellableSubscriptions(all);state.canCancel=cancellable.length===1&&!scheduled(cancellable[0]);
      state.cancelAtPeriodEnd=cancellable.length===1&&scheduled(cancellable[0]);
      matching.sort((a,b)=>(b.created||0)-(a.created||0));
      state.status=matching[0]?.status || 'none';
      for(const sub of matching){
        if(sub.status!=='active' || !idOf(sub.latest_invoice)) continue;
        const invoice=providerObject(await stripe.invoices.retrieve(idOf(sub.latest_invoice)));
        if(invoice.status!=='paid' || idOf(invoice.customer)!==row.customerId) continue;
        if(invoice.lines?.has_more) throw new BillingError(503,'Invoice details need review.');
        const line=invoice.lines?.data?.find(l=>l.quantity===1 && idOf(l.pricing?.price_details?.price || l.price)===config.priceId && idOf(l.parent?.subscription_item_details?.subscription || l.subscription)===sub.id);
        const paidEnd=Number(line?.period?.end)*1000;
        const cancelAt=sub.cancel_at==null?null:Number(sub.cancel_at)*1000;
        if(cancelAt!==null&&(!Number.isSafeInteger(cancelAt)||cancelAt<=0))throw new BillingError(503,'Subscription cancellation needs review.');
        const until=cancelAt===null?paidEnd:Math.min(paidEnd,cancelAt);
        if(!Number.isSafeInteger(until) || until<=now()) continue;
        if(!state.paidUntil || until>Date.parse(state.paidUntil)) Object.assign(state,{plan:'pro',status:'active',paidUntil:new Date(until).toISOString(),cancelAtPeriodEnd:Boolean(sub.cancel_at_period_end)||cancelAt!==null});
      }
    }
    row.state=state;row.verifiedAt=now();await save();return state;
  }
  return {
    async status(user) {
      assertBillingOwner(config,user.id); await verifyAccount();
      return store.withOwner(user.id,async(row,save)=>{
        const state=await reconcile(row,save);
        return response(state,user);
      });
    },
    async cancel(user) {
      assertBillingOwner(config,user.id);await verifyAccount();
      return store.withOwner(user.id,async(row,save)=>{
        if(!row.customerId)throw new BillingError(409,'No paid subscription to cancel.');
        await reconcile(row,save);
        const candidates=cancellableSubscriptions(await subscriptions(row.customerId));
        if(candidates.length!==1)throw new BillingError(409,candidates.length?'Use Manage billing to review your subscriptions.':'No eligible subscription to cancel.');
        const sub=candidates[0];
        if(!scheduled(sub)){
          const updated=providerObject(await stripe.subscriptions.update(sub.id,{cancel_at_period_end:true}));
          if(updated.id!==sub.id||idOf(updated.customer)!==row.customerId||!scheduled(updated))throw new BillingError(503,'Cancellation could not be verified. Refresh billing.');
        }
        const state=await reconcile(row,save);
        if(!state.cancelAtPeriodEnd)throw new BillingError(503,'Cancellation could not be verified. Refresh billing.');
        return response(state,user);
      });
    },
    async portal(user) {
      assertBillingOwner(config,user.id);await verifyAccount();
      return store.withOwner(user.id,async(row,save)=>{
        if(!row.customerId) throw new BillingError(409,'No billing account exists yet.');
        await reconcile(row,save);
        const result=await stripe.billingPortal.sessions.create({customer:row.customerId,configuration:config.portalId,return_url:back});
        return {url:safeStripeUrl(result.url,'billing.stripe.com')};
      });
    },
    async assertDeletable(user) {
      assertBillingOwner(config,user.id);await verifyAccount();
      return store.withOwner(user.id,async(row,save)=>{
        // Block the durable link before making provider calls: an API outage must
        // never make an account eligible for deletion.
        if(row.customerId || row.customerAttempt) throw new BillingError(409,'Close billing with support before deleting this account.');
        row.deleting=true;await save();
      });
    },
    async webhook(event) {
      providerObject(event);
      if(event.account && event.account!==config.accountId) throw new BillingError(400,'Wrong Stripe account.');
      if(!/^(customer\.subscription\.(created|updated|deleted)|invoice\.(paid|payment_failed|payment_action_required)|checkout\.session\.(completed|async_payment_succeeded|async_payment_failed))$/.test(event.type||'')) return {received:true};
      await verifyAccount();
      const customer=idOf(event.data?.object?.customer);
      if(!customer) return {received:true};
      const owner=await store.ownerForCustomer(customer);
      if(!owner) return {received:true};
      assertBillingOwner(config,owner);
      return store.withOwner(owner,async(row,save)=>{
        if(row.customerId!==customer) throw new BillingError(409,'Billing ownership could not be verified.');
        if(row.events?.includes(event.id)) return {received:true};
        // Provider truth wins over event delivery order. Receipt and state commit together.
        const pendingSave=async()=>{};
        await reconcile(row,pendingSave);
        row.events=[...(row.events||[]).slice(-255),event.id];await save();return {received:true};
      });
    },
    async checkout(user) {
      assertBillingOwner(config,user.id); await verifyAccount();
      return store.withOwner(user.id,async(row,save)=>{
        if(row.deleting) throw new BillingError(409,'Account deletion is in progress.');
        await ensureCustomer(row,save,user);
        const existing = await subscriptions(row.customerId);
        if (existing.some(s=>!['canceled','incomplete_expired'].includes(s.status))) throw new BillingError(409,'A subscription already exists. Use Manage billing.');
        if (row.checkoutAttempt?.sessionId) {
          const previous = providerObject(await stripe.checkout.sessions.retrieve(row.checkoutAttempt.sessionId));
          if (idOf(previous.customer)!==row.customerId) throw new BillingError(409,'Checkout ownership could not be verified.');
          if (previous.status==='open') return {url:safeStripeUrl(previous.url,'checkout.stripe.com')};
          if(previous.status==='complete'){
            const linked=existing.find(s=>s.id===idOf(previous.subscription));
            if(!linked||!['canceled','incomplete_expired'].includes(linked.status)) throw new BillingError(409,'Your checkout is being confirmed. Refresh billing.');
          }else if(previous.status!=='expired') throw new BillingError(409,'The previous checkout needs review.');
          row.checkoutAttempt=null; await save();
        }
        const price=providerObject(await stripe.prices.retrieve(config.priceId));
        if(!price.active || price.unit_amount!==config.amount || price.currency!=='usd' || price.recurring?.interval!=='month' || price.recurring?.interval_count!==1) throw new BillingError(503,'The monthly price could not be verified.');
        row.checkoutAttempt ||= {id:randomUUID(),started:now()}; await save();
        if(now()-row.checkoutAttempt.started>23*60*60*1000) throw new BillingError(409,'An earlier checkout needs review. Contact support.');
        const session=providerObject(await stripe.checkout.sessions.create({
          mode:'subscription',ui_mode:'hosted_page',branding_settings:{background_color:'#0B1017',button_color:'#315DCA',border_style:'rounded',font_family:'default',display_name:'Cova',logo:{type:'url',url:'https://covadesk.com/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png'}},managed_payments:{enabled:false},customer:row.customerId,client_reference_id:user.id,
          line_items:[{price:config.priceId,quantity:1}],subscription_data:{metadata:{cova_user_id:user.id,cova_environment:config.mode}},
          success_url:back,cancel_url:`${config.origin}/?billing=canceled#dashboard`,allow_promotion_codes:false,
          automatic_tax:{enabled:false},payment_method_types:['card'],phone_number_collection:{enabled:false},
        },{idempotencyKey:`cova:${row.checkoutAttempt.id}`}));
        row.checkoutAttempt.sessionId=session.id; await save();
        return {url:safeStripeUrl(session.url,'checkout.stripe.com')};
      });
    },
  };
}
