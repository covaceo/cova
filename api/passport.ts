import { createHash } from 'node:crypto';
import { ApiError, requirePolicyAcceptedUser, sendApiError } from './_lib/auth.js';
import { supabaseServiceHeaders } from './_lib/supabase.js';
import { readProgressEvidence, evaluatePassportProgress } from './_lib/passport-runtime.mjs';
import type { ProgressPlan } from '../src/lib/passportProgress';

type RestOptions={body?:any;query?:Record<string,string>;authorization?:string};
async function progressRest(path:string,{body,query,authorization}:RestOptions={}){
 const base=String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw new ApiError(503,'Progress storage is unavailable.');
 const url=new URL(base+'/rest/v1/'+path);for(const [k,v] of Object.entries(query||{}))url.searchParams.set(k,v);
 const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:supabaseServiceHeaders(key,{...(body===undefined?{}:{'Content-Type':'application/json'}),...(authorization?{Authorization:authorization}:{})}),body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 const data=await response.json();
 if(!response.ok){if(['revision_conflict','stale_evidence'].includes(data?.message))throw new ApiError(409,'The saved session changed. Sync or reload progress before saving again.');throw new ApiError(503,'Progress could not be saved. Please retry.');}
 return data;
}
export function createPassportHandler({auth=requirePolicyAcceptedUser,rest=progressRest,now=()=>Date.now()}:any={}){
 return async function handler(req:any,res:any){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
  try{
   const user=await auth(req),url=new URL(req.url||'/api/passport','https://cova.invalid');
   let body=req.body;if(typeof body==='string'){if(body.length>2097152)throw new ApiError(413,'This history is too large for one review.');try{body=JSON.parse(body)}catch{throw new ApiError(400,'Invalid review request.');}}
   if(body&&JSON.stringify(body).length>2097152)throw new ApiError(413,'This history is too large for one review.');
   const expected=req.method==='GET'?url.searchParams.get('owner'):body?.owner;
   if(expected!==user.id)throw new ApiError(409,'Your session changed. Sign in again.');
   const snapshot=()=>rest('rpc/passport_progress_snapshot',{body:{p_owner:user.id}});
   if(req.method==='GET')return res.status(200).json(await snapshot());
   if(body.action==='plan'){
    if(!body.limits||typeof body.limits!=='object')throw new ApiError(400,'Set valid session limits.');
    const plan=await rest('rpc/passport_save_plan',{body:{p_owner:user.id,p_limits:body.limits},authorization:req.headers.authorization});return res.status(200).json({plan});
   }
   if(!['inspect','review'].includes(body.action))throw new ApiError(400,'Invalid review action.');
   let evidence;try{evidence=readProgressEvidence(body,now())}catch(e){throw new ApiError(400,e instanceof Error?e.message:'Invalid review evidence.');}
   const [plans,saved,bound]=await Promise.all([
    rest('passport_rule_plans',{query:{owner_id:'eq.'+user.id,created_at:'lte.'+evidence.firstEntry,order:'created_at.desc,id.desc',limit:'1'}}),
    rest('passport_session_reviews',{query:{owner_id:'eq.'+user.id,session_day:'eq.'+evidence.day,account_key:'eq.'+evidence.account,limit:'1'}}),
    rest('passport_reward_days',{query:{owner_id:'eq.'+user.id,session_day:'eq.'+evidence.day,limit:'1'}})
   ]);
   const plan:ProgressPlan|null=plans[0]||null;
   let quote=evaluatePassportProgress(evidence,plan),receipt=saved[0]||null;
   if(bound[0]&&bound[0].account_key!==evidence.account)quote={...quote,xp:0,reason:'A session reward is already assigned to another account for this day.'};
   // The server replays full cash-window validation. The client never supplies XP.
   const hash=createHash('sha256').update(JSON.stringify({version:1,evidence,planId:plan?.id??null})).digest('hex');
   const commit=(note:string,revision:number)=>rest('rpc/passport_commit_review',{body:{p_owner:user.id,p_day:evidence.day,p_account:evidence.account,p_note:note,p_xp:quote.xp,p_reason:quote.reason,p_hash:hash,p_as_of:evidence.asOf,p_revision:revision}});
   if(body.action==='review'){
    if(typeof body.note!=='string'||body.note.trim().length<10||body.note.trim().length>2000||!Number.isSafeInteger(body.revision)||body.revision<0)throw new ApiError(400,'Write a short takeaway and reload the current session before saving.');
    receipt=await commit(body.note,body.revision);
   }else if(receipt&&receipt.evidence_hash!==hash&&evidence.asOf&&(!receipt.evidence_as_of||Date.parse(evidence.asOf)>Date.parse(receipt.evidence_as_of))){
    // A later complete snapshot can revise earlier XP down as well as up.
    receipt=await commit(receipt.note,receipt.revision);
   }
   return res.status(200).json({state:await snapshot(),quote,receipt,evidenceHash:hash,asOf:evidence.asOf});
  }catch(error){return sendApiError(res,error,'Passport progress is temporarily unavailable. Your saved trades are unchanged.');}
 };
}
export default createPassportHandler();
