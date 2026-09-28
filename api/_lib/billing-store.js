import {randomUUID} from 'node:crypto';
import {BillingError} from './billing.js';
// Separate namespace, no expiry on money/ownership records, never touches broker keys.
export function createBillingStore(config,{env=process.env,fetchImpl=fetch,command:override}={}) {
 const prefix=`cova:billing:v1:${config.mode||'sandbox'}:${config.accountId}:`;
 async function command(args){
  if(override)return override(args);
  const url=new URL(env.KV_REST_API_URL||'https://unconfigured.invalid');
  if(url.protocol!=='https:'||!url.hostname.endsWith('.upstash.io')||url.username||url.password||!env.KV_REST_API_TOKEN)throw new BillingError(503,'Billing storage is not configured.');
  const response=await fetchImpl(url,{method:'POST',headers:{Authorization:`Bearer ${env.KV_REST_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new BillingError(503,'Billing storage is unavailable.');
  const result=await response.json();if(result.error||!Object.hasOwn(result,'result'))throw new BillingError(503,'Billing storage rejected the update.');return result.result;
 }
 const ownerKey=owner=>`${prefix}owner:${owner}`;
 return {
  async read(owner){const raw=await command(['GET',ownerKey(owner)]);return raw?JSON.parse(raw):null},
  async ownerForCustomer(customer){return command(['GET',`${prefix}customer:${customer}`])},
  async withOwner(owner,run){
   const key=ownerKey(owner),lock=key+':lock',token=randomUUID();
   const attemptKey=key+':attempts';const attempts=await command(['INCR',attemptKey]);if(attempts===1)await command(['EXPIRE',attemptKey,60]);if(attempts>60)throw new BillingError(429,'Billing is busy. Try again in a minute.');
   if(await command(['SET',lock,token,'NX','EX',120])!=='OK')throw new BillingError(409,'Billing is updating. Try again in a moment.');
   try {
    const raw=await command(['GET',key]);const row=raw?JSON.parse(raw):{ownerId:owner};
    if(row.ownerId!==owner)throw new BillingError(409,'Billing ownership mismatch.');
    const originalCustomer=row.customerId;
    const save=async()=>{
     if(row.ownerId!==owner||(originalCustomer&&row.customerId!==originalCustomer))throw new BillingError(409,'Billing ownership mismatch.');
     const mapping=row.customerId?`${prefix}customer:${row.customerId}`:key;
     const code=await command(['EVAL',"if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end; if KEYS[3]~=KEYS[2] then local owner=redis.call('GET',KEYS[3]); if owner and owner~=ARGV[3] then return -1 end; redis.call('SET',KEYS[3],ARGV[3]); end; redis.call('SET',KEYS[2],ARGV[2]); return 1",3,lock,key,mapping,token,JSON.stringify(row),owner]);
     if(code!==1)throw new BillingError(409,code===-1?'Billing customer ownership mismatch.':'Billing update expired. Retry to verify current state.');
    };
    return await run(row,save);
   } finally {await command(['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,lock,token]).catch(()=>{});}
  },
 };
}
