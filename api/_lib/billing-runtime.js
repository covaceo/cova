import {billingConfig,stripeClient,createBillingService} from './billing.js';
import {createBillingStore} from './billing-store.js';
export function billingRuntime(options={}) {
 const config=billingConfig(options.env||process.env);if(!config)return null;
 const stripe=stripeClient(config),store=createBillingStore(config,options);
 return {config,stripe,store,service:createBillingService({config,stripe,store})};
}
export async function resolveSandboxBillingPlan(user,options={}) {
 const env=options.env||process.env;
 if(user.plan==='pro'||env.COVA_BILLING_MODE!=='sandbox'||env.VERCEL_ENV==='production'||env.VERCEL_TARGET_ENV==='production')return user.plan;
 const runtime=billingRuntime(options);
 if(!runtime?.config.allowedUsers.has(user.id))return user.plan;
 const cached=await runtime.store.read(user.id);
 if(cached?.state && Date.now()-cached.verifiedAt>=0 && Date.now()-cached.verifiedAt<60000){return cached.state.plan==='pro'&&Date.parse(cached.state.paidUntil)>Date.now()?'pro':'free';}
 return (await runtime.service.status(user)).plan;
}
