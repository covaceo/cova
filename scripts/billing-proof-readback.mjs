// Opt-in read-only sandbox build proof. Not an HTTP route or default build step.
import {createBillingStore} from '../api/_lib/billing-store.js';
import {pathToFileURL} from 'node:url';
export async function readback({env=process.env,fetchImpl=fetch,readStore}={}){
 if(env.COVA_BILLING_QA_READBACK!=='true')return {skipped:true};
 if(env.COVA_BILLING_MODE!=='sandbox'||env.VERCEL_ENV!=='preview'||env.VERCEL_TARGET_ENV==='production'||env.VERCEL_GIT_COMMIT_REF!=='feat/paid-customer-lifecycle')throw Error('Readback requires the exact isolated sandbox branch');
 const owners=String(env.COVA_BILLING_ALLOWED_USERS||'').split(',');if(owners.length<1||owners.length>2||new Set(owners).size!==owners.length||owners.some(o=>!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(o)))throw Error('Bounded synthetic owner allowlist required');
 const base=env.SUPABASE_URL||env.VITE_SUPABASE_URL;if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base||'')||!env.SUPABASE_SERVICE_ROLE_KEY||!/^acct_[A-Za-z0-9]+$/.test(env.STRIPE_ACCOUNT_ID||''))throw Error('Readback configuration unavailable');
 const receipts=[];
 for(const owner of owners){
  const response=await fetchImpl(base+'/auth/v1/admin/users/'+owner,{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY},signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Synthetic owner verification failed');const user=await response.json();if(user.id!==owner||user.email!==`billing-qa-${owner}@example.invalid`||user.app_metadata?.cova_billing_qa!==true||user.app_metadata?.plan==='pro')throw Error('Not an ungranted synthetic owner');
  const read=readStore||createBillingStore({mode:'sandbox',accountId:env.STRIPE_ACCOUNT_ID},{env}).read;const row=await read(owner);if(row&&row.ownerId!==owner)throw Error('Owner mismatch');receipts.push({ownerId:owner,customerId:row?.customerId||null,plan:row?.state?.plan||'free',status:row?.state?.status||'none',paidUntil:row?.state?.paidUntil||null,events:row?.events||[],verifiedAt:row?.verifiedAt||null});
 }
 return {receipts,readOnly:true,mode:'sandbox'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log('COVA_PAID_QA_READBACK '+JSON.stringify(await readback()));
