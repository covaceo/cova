// Test-only transport: approved sandbox CLI OAuth, never deployed or used by the app.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export function stripeCliClient(){
 if(!process.env.COVA_STRIPE_CLI||!process.env.COVA_STRIPE_CLI_CONFIG)throw Error('Set sandbox Stripe CLI executable and config paths.');
 function flatten(value,prefix='',out=[]){for(const [k,v]of Object.entries(value||{})){const key=prefix?`${prefix}[${k}]`:k;if(v&&typeof v==='object')flatten(v,key,out);else if(v!==undefined&&v!==null)out.push(`${key}=${v}`);}return out;}
 async function call(method,path,params={},options={}){
  const args=['--config',process.env.COVA_STRIPE_CLI_CONFIG,'--project-name','cova',method,path,'--stripe-version','2026-08-26.dahlia'];
  if(method!=='get')args.push('--confirm');for(const pair of flatten(params))args.push('-d',pair);
  if(options.idempotencyKey)args.push('--idempotency',options.idempotencyKey);
  const r=await exec(process.env.COVA_STRIPE_CLI,args,{timeout:40000,maxBuffer:4*1024*1024});
  const data=JSON.parse(r.stdout);if(data.error)throw Error(`Stripe ${data.error.type}: ${data.error.message}`);return data;
 }
 return {call,accounts:{retrieve:()=>call('get','/v1/account')},prices:{retrieve:id=>call('get',`/v1/prices/${id}`)},customers:{create:(p,o)=>call('post','/v1/customers',p,o),retrieve:id=>call('get',`/v1/customers/${id}`)},subscriptions:{list:p=>call('get','/v1/subscriptions',p)},invoices:{retrieve:id=>call('get',`/v1/invoices/${id}`)},checkout:{sessions:{create:(p,o)=>call('post','/v1/checkout/sessions',p,o),retrieve:id=>call('get',`/v1/checkout/sessions/${id}`)}},billingPortal:{sessions:{create:p=>call('post','/v1/billing_portal/sessions',p)}}};
}
