import {billingConfig,stripeClient,createBillingService,billingOwnerEnabled,BillingError} from './billing.js';
import {createBillingStore} from './billing-store.js';
export function billingRuntime(options={}) {
 const config=billingConfig(options.env||process.env);if(!config)return null;
 const stripe=stripeClient(config),store=createBillingStore(config,options);
 return {config,stripe,store,service:createBillingService({config,stripe,store})};
}
export async function resolveBillingPlan(user,options={}) {
 const env=options.env||process.env;
 if(user.plan==='pro'||!env.COVA_BILLING_MODE)return user.plan;
 const runtime=billingRuntime(options);
 if(!billingOwnerEnabled(runtime?.config,user.id))return user.plan;
 const cached=await runtime.store.read(user.id);
 if(cached&&cached.ownerId!==user.id)throw new BillingError(409,'Billing ownership mismatch.');
 if(!cached?.customerId)return user.plan;
 if(cached?.state && Date.now()-cached.verifiedAt>=0 && Date.now()-cached.verifiedAt<60000){return cached.state.plan==='pro'&&Date.parse(cached.state.paidUntil)>Date.now()?'pro':'free';}
 return (await runtime.service.status(user)).plan;
}
