// Opt-in deployment QA utility. Not part of the default build or any HTTP route.
export async function provision({env=process.env,fetchImpl=fetch}={}) {
 if(!env.COVA_BILLING_QA_FIXTURE)return {skipped:true};
 if(env.COVA_BILLING_MODE!=='sandbox'||env.VERCEL_ENV!=='preview'||env.VERCEL_TARGET_ENV==='production'||env.VERCEL_GIT_COMMIT_REF!=='feat/stripe-sandbox-billing')throw Error('QA provisioning requires the isolated sandbox preview branch.');
 const fixtures=JSON.parse(env.COVA_BILLING_QA_FIXTURE);
 if(!Array.isArray(fixtures)||fixtures.length<1||fixtures.length>2)throw Error('Invalid QA fixture count.');
 for(const f of fixtures)if(!/^[0-9a-f-]{36}$/.test(f.id)||f.email!==`billing-qa-${f.id}@example.invalid`||typeof f.password!=='string'||f.password.length<32)throw Error('Invalid synthetic QA identity.');
 const supabase=env.SUPABASE_URL||env.VITE_SUPABASE_URL;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabase||'')||!env.SUPABASE_SERVICE_ROLE_KEY||!/^https:\/\/[a-z0-9-]+\.upstash\.io$/.test(env.KV_REST_API_URL||'')||!env.KV_REST_API_TOKEN)throw Error('QA provider configuration is unavailable.');
 const ping=await fetchImpl(env.KV_REST_API_URL,{method:'POST',headers:{Authorization:`Bearer ${env.KV_REST_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(['PING']),signal:AbortSignal.timeout(10000)});
 if(!ping.ok||(await ping.json()).result!=='PONG')throw Error('QA durable store verification failed.');
 const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'};
 const verifiedOwners=[];
 for(const f of fixtures){
  const url=`${supabase}/auth/v1/admin/users/${f.id}`;
  let result=await fetchImpl(url,{headers,signal:AbortSignal.timeout(10000)});
  if(result.status===404){
   const created=await fetchImpl(`${supabase}/auth/v1/admin/users`,{method:'POST',headers,body:JSON.stringify({...f,email_confirm:true,app_metadata:{cova_billing_qa:true}}),signal:AbortSignal.timeout(10000)});
   if(!created.ok)throw Error(`Synthetic identity creation failed (${created.status}).`);
   const user=await created.json();if(user.id!==f.id)throw Error('Synthetic identity ID mismatch.');
   result=await fetchImpl(url,{headers,signal:AbortSignal.timeout(10000)});
  }
  if(!result.ok)throw Error(`Synthetic identity verification failed (${result.status}).`);
  const user=await result.json();
  if(user.id!==f.id||user.email!==f.email||user.app_metadata?.cova_billing_qa!==true||user.app_metadata?.plan)throw Error('Synthetic identity mismatch.');
  verifiedOwners.push(user.id);
 }
 return {verifiedOwners,redis:'PONG'};
}
