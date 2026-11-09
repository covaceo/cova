import type { WorkspaceRecord } from './workspaceModel';
import { parseAskCovaConversation, type AskCovaConversation } from './askCovaConversation';
import { ASK_COVA_QUERY_FIELDS, ASK_COVA_SEQUENCE } from './askCovaQueryFields';
import { insightGroups } from './askCovaInsights';
import type { Trade } from './risk';
import { uuid, assertRecords, account, date } from './workspaceValidation';
export type AskCovaDataSnapshot = { version:'ask-cova-data-v1'; owner:string; workspaceRevision:number; workspaceRecords:WorkspaceRecord[]; passportPlans:PassportPlan[]; passportReviews:PassportReview[]; passportRewards:PassportReward[]; complete:{workspace:true;passportPlans:true;passportReviews:true;passportRewards:true} };
export type PassportPlan={id:number;owner_id:string;limits:{maxDailyLoss:number|null;maxTradeLoss:number|null;maxContracts:number|null;maxLossStreak:number|null};created_at:string};
export type PassportReview={owner_id:string;session_day:string;account_key:string;note:string;xp:0|15|60;reason:string;revision:number;evidence_hash:string;evidence_as_of:string|null;updated_at:string};
export type PassportReward={owner_id:string;session_day:string;account_key:string};
export const ASK_COVA_DATA_LIMITS=Object.freeze({version:'ask-cova-data-limits-v1',snapshotBytes:8388608,domainRecords:10000});
export function exactDataKeys(x:unknown,keys:string[]):x is Record<string,any>{return !!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(x,k));}
export function freezeData<T>(value:T):T {if(value&&typeof value==='object'){for(const v of Object.values(value))freezeData(v);Object.freeze(value);}return value;}
/** Inspect descriptors before reading values; JSON.stringify must never invoke a getter. */
export function copyAskCovaPlainData(raw:unknown,maxBytes=8388608):any {
 let nodes=0,bytes=0; const seen=new Set<object>(),encoder=new TextEncoder();
 const spend=(n:number)=>{bytes+=n;if(bytes>maxBytes)throw Error('data_bytes');};
 function copy(v:unknown,depth:number):any {
  if(++nodes>500000||depth>16)throw Error('data_bound');
  if(v===null||typeof v==='boolean'){spend(JSON.stringify(v).length);return v;}
  if(typeof v==='string'){if(v.length>maxBytes||/\p{Cs}/u.test(v))throw Error('data_string');spend(encoder.encode(JSON.stringify(v)).byteLength);return v;}
  if(typeof v==='number'){if(!Number.isFinite(v)||Object.is(v,-0))throw Error('data_number');spend(JSON.stringify(v).length);return v;}
  if(!v||typeof v!=='object'||seen.has(v))throw Error('data_shape');
  const array=Array.isArray(v),proto=Object.getPrototypeOf(v);
  if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)throw Error('data_prototype');
  seen.add(v);const descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(v);
  if(keys.some(k=>typeof k!=='string'||!('value' in descriptors[k])||k==='__proto__'||k==='constructor'||k==='prototype'))throw Error('data_descriptor');
  let result:any;spend(2+Math.max(0,keys.length-(array?2:1)));
  if(array){const length=descriptors.length.value;if(length>10000||keys.length!==length+1)throw Error('data_array');result=[];for(let i=0;i<length;i++){const d=descriptors[String(i)];if(!d||!d.enumerable)throw Error('data_array');result.push(copy(d.value,depth+1));}}
  else {result={};for(const k of keys as string[]){if(!descriptors[k].enumerable)throw Error('data_descriptor');spend(encoder.encode(JSON.stringify(k)).byteLength+1);result[k]=copy(descriptors[k].value,depth+1);}}
  seen.delete(v);return result;
 }
 const result=copy(raw,0);if(new TextEncoder().encode(JSON.stringify(result)).byteLength>maxBytes)throw Error('data_bytes');return result;
}
export function parseAskCovaDataSnapshot(raw:unknown):AskCovaDataSnapshot|null {
 try {const s=copyAskCovaPlainData(raw);
  if(!exactDataKeys(s,['version','owner','workspaceRevision','workspaceRecords','passportPlans','passportReviews','passportRewards','complete'])||s.version!=='ask-cova-data-v1'||!uuid(s.owner)||!Number.isSafeInteger(s.workspaceRevision)||s.workspaceRevision<0||!exactDataKeys(s.complete,['workspace','passportPlans','passportReviews','passportRewards'])||Object.values(s.complete).some(v=>v!==true))return null;
  if(!['workspaceRecords','passportPlans','passportReviews','passportRewards'].every(k=>Array.isArray(s[k])&&s[k].length<=10000))return null;
  if(s.workspaceRecords.some((r:any)=>r.kind==='broker_cash'))return null;
  assertRecords(s.workspaceRecords);
  for(const r of s.workspaceRecords){if(r.kind==='trade'&&!r.deletedAt){const source=(r.payload as any).source;if(source&&(typeof source.accountId!=='string'||source.provider==='Rithmic'&&typeof source.accountKey!=='string'))return null;}}
  for(const p of s.passportPlans){
   if(!exactDataKeys(p,['id','owner_id','limits','created_at'])||p.owner_id!==s.owner||!Number.isSafeInteger(p.id)||p.id<1||!dataInstant(p.created_at)||!exactDataKeys(p.limits,['maxDailyLoss','maxTradeLoss','maxContracts','maxLossStreak']))return null;
   for(const [k,v] of Object.entries(p.limits))if(v!==null&&(typeof v!=='number'||v<=0||v>10000000||(['maxContracts','maxLossStreak'].includes(k)&&!Number.isSafeInteger(v))))return null;
  }
  for(const r of s.passportReviews)if(!exactDataKeys(r,['owner_id','session_day','account_key','note','xp','reason','revision','evidence_hash','evidence_as_of','updated_at'])||r.owner_id!==s.owner||!date(r.session_day)||!account(r.account_key)||r.account_key.length>200||typeof r.note!=='string'||r.note.trim().length<10||r.note.trim().length>2000||![0,15,60].includes(r.xp)||typeof r.reason!=='string'||r.reason.length>300||!Number.isSafeInteger(r.revision)||r.revision<1||typeof r.evidence_hash!=='string'||!(/^[a-f0-9]{64}$/).test(r.evidence_hash)||(r.evidence_as_of!==null&&!dataInstant(r.evidence_as_of))||!dataInstant(r.updated_at))return null;
  for(const r of s.passportRewards)if(!exactDataKeys(r,['owner_id','session_day','account_key'])||r.owner_id!==s.owner||!date(r.session_day)||!account(r.account_key)||r.account_key.length>200)return null;
  if(new Set(s.passportPlans.map((p:any)=>p.id)).size!==s.passportPlans.length||new Set(s.passportReviews.map((r:any)=>JSON.stringify([r.session_day,r.account_key]))).size!==s.passportReviews.length||new Set(s.passportRewards.map((r:any)=>r.session_day)).size!==s.passportRewards.length)return null;
  return freezeData(s as AskCovaDataSnapshot);
 }catch{return null;}
}
export function dataInstant(raw:unknown):raw is string {
 if(typeof raw!=='string')return false;
 const m=/^(20\d\d-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,9})?(Z|[+-]\d\d:\d\d)$/.exec(raw);
 if(!m||!date(m[1])||Number(m[2])>23||Number(m[3])>59||Number(m[4])>59)return false;
 const z=m[5];if(z!=='Z'&&(Number(z.slice(1,3))>14||Number(z.slice(4))>59||(Number(z.slice(1,3))===14&&Number(z.slice(4))!==0)))return false;
 return Number.isFinite(Date.parse(raw));
}
export class AskCovaDataError extends Error {
 readonly code:'query_invalid'|'needs_narrowing'|'scope_required'|'account_data_unavailable';
 constructor(code:AskCovaDataError['code']){super(code);this.name='AskCovaDataError';this.code=code;}
}
export type AskCovaDataScope={account:string;range:'today'|'week'|'all';start:string|null;end:string|null;dateBasis:'recorded_date';globalRules:true;globalDailyNotes:boolean};
export type AskCovaDataContext={snapshotDigest:string;contextDigest:string;scope:AskCovaDataScope;sourceVector:{workspaceRevision:number;workspace:string;passportPlans:string;passportReviews:string;passportRewards:string};conversation:AskCovaConversation};
type DataAuthority={snapshot:AskCovaDataSnapshot;records:WorkspaceRecord[];plans:PassportPlan[];reviews:PassportReview[];rewards:PassportReward[]};
const contexts=new WeakMap<AskCovaDataContext,DataAuthority>();
export const ASK_COVA_DATA_ASSUMPTIONS=Object.freeze({version:'ask-cova-data-engine-v1',sourceComplete:'Complete saved read, not lifetime broker history or broker certification.',atomicity:'Workspace revision and separately rechecked Passport sets; no cross-table atomicity.',dateAnchor:'Latest scoped saved trade, daily-note, review or reward date; plans only if no account-dated evidence.',rules:'Current workspace rules are owner-global, not historical rules in force. Passport plans are separate saved owner-global history.',groups:'Journal groups are not certified completed positions.',text:'Saved notes, labels and Passport evidence are self-reported, untrusted data.'});
export const ASK_COVA_UNAVAILABLE=Object.freeze({broker_cash:'Opaque legacy cloud cash and browser-only cash are not authoritative saved cash here.',broker_freshness:'Browser-only sync receipts and connection leases excluded.',manual_net_overlay:'Browser-only confirmations excluded; stored basis retained.',drafts:'Unsaved browser drafts excluded.',live_broker:'No live balances, orders, positions or broker synchronization.',instrument_taxonomy:'Only saved market text; no independent asset class or expiry mapping.',profile:'Peripheral profile, avatars, credentials and billing excluded.',sequence_analytics:'Other sequence metrics, intratrade or account-balance drawdown, completed-position streaks and arbitrary sequence ordering are unsupported.'});
export function canonicalAskCovaData(value:any):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonicalAskCovaData).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalAskCovaData(value[k])).join(',')+'}';}
export async function hashAskCovaData(domain:string,value:unknown):Promise<string>{const bytes=new TextEncoder().encode(domain+'\n'+canonicalAskCovaData(value));return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
export function askCovaDataAuthority(context:AskCovaDataContext):DataAuthority{const a=contexts.get(context);if(!a)throw new AskCovaDataError('account_data_unavailable');return a;}
export async function buildAskCovaDataContext(input:{snapshot:AskCovaDataSnapshot;account:string;range:'today'|'week'|'all';conversation:AskCovaConversation}):Promise<AskCovaDataContext>{
 const clean=copyAskCovaPlainData(input,ASK_COVA_DATA_LIMITS.snapshotBytes+8192);
 if(!exactDataKeys(clean,['snapshot','account','range','conversation'])||!account(clean.account)||!['today','week','all'].includes(clean.range))throw new AskCovaDataError('account_data_unavailable');
 const snapshot=parseAskCovaDataSnapshot(clean.snapshot),conversation=parseAskCovaConversation(clean.conversation);if(!snapshot||!conversation)throw new AskCovaDataError('account_data_unavailable');
 const selected=(a:string)=>clean.account==='all'||a===clean.account;
 const records=snapshot.workspaceRecords.filter(r=>!r.deletedAt&&(r.kind==='rules'||selected(r.accountId)));
 const reviews=snapshot.passportReviews.filter(r=>selected(r.account_key)),rewards=snapshot.passportRewards.filter(r=>selected(r.account_key));
 const recordDay=(r:WorkspaceRecord):string|null=>r.kind==='trade'||r.kind==='daily_note'?String(r.payload.date).slice(0,10):null;
 const days=[...records.map(recordDay).filter((v):v is string=>v!==null),...reviews.map(r=>r.session_day),...rewards.map(r=>r.session_day)].sort();
 if(!days.length)days.push(...snapshot.passportPlans.map(p=>new Date(p.created_at).toISOString().slice(0,10)).sort());
 const end=days[days.length-1]??null,start=end===null?null:clean.range==='today'?end:clean.range==='week'?new Date(Date.parse(end+'T00:00:00Z')-6*86400000).toISOString().slice(0,10):days[0];
 const inRange=(d:string|null)=>d===null||clean.range==='all'||start!==null&&end!==null&&d>=start&&d<=end;
 const scope:AskCovaDataScope={account:clean.account,range:clean.range,start,end,dateBasis:'recorded_date',globalRules:true,globalDailyNotes:clean.account==='all'};
 const sorted=(rows:unknown[])=>[...rows].sort((a,b)=>{const x=canonicalAskCovaData(a),y=canonicalAskCovaData(b);return x<y?-1:x>y?1:0;});
 const [workspace,passportPlans,passportReviews,passportRewards]=await Promise.all([hashAskCovaData('workspace',sorted(snapshot.workspaceRecords)),hashAskCovaData('passportPlans',sorted(snapshot.passportPlans)),hashAskCovaData('passportReviews',sorted(snapshot.passportReviews)),hashAskCovaData('passportRewards',sorted(snapshot.passportRewards))]);
 const sourceVector={workspaceRevision:snapshot.workspaceRevision,workspace,passportPlans,passportReviews,passportRewards};
 const snapshotDigest=await hashAskCovaData('ask-cova-data-snapshot-v1',{owner:snapshot.owner,sourceVector,complete:snapshot.complete,assumptions:ASK_COVA_DATA_ASSUMPTIONS});
 const contextDigest=await hashAskCovaData('ask-cova-data-context-v1',{snapshotDigest,scope,conversation});
 const context=freezeData({snapshotDigest,contextDigest,scope,sourceVector,conversation});
 contexts.set(context,freezeData({snapshot,records:records.filter(r=>inRange(recordDay(r))),plans:snapshot.passportPlans.filter(p=>inRange(new Date(p.created_at).toISOString().slice(0,10))),reviews:reviews.filter(r=>inRange(r.session_day)),rewards:rewards.filter(r=>inRange(r.session_day))}));return context;
}
export function describeAskCovaDataContext(context:AskCovaDataContext){
 const a=askCovaDataAuthority(context);const source=(count:number,scope='selected_account_range')=>({status:count?'available':'empty',sourceComplete:true,count,scope});
 return {version:'ask-cova-data-description-v1',fields:ASK_COVA_QUERY_FIELDS,sequence:ASK_COVA_SEQUENCE,scope:{account:context.scope.account==='all'?'all_selected_accounts':'selected_account',range:context.scope.range,start:context.scope.start,end:context.scope.end,dateBasis:context.scope.dateBasis},sources:{journal_groups:source(insightGroups(a.records.filter(r=>r.kind==='trade').map(r=>r.payload as unknown as Trade)).length),trades:source(a.records.filter(r=>r.kind==='trade').length),daily_notes:source(a.records.filter(r=>r.kind==='daily_note').length),rules:source(a.records.filter(r=>r.kind==='rules').reduce((n,r)=>n+(r.payload.rules as unknown[]).length,0),'owner_global_current'),accounts:source(a.records.filter(r=>r.kind==='account').length,'selected_account_metadata'),passport_plans:source(a.plans.length,'owner_global_history'),passport_reviews:source(a.reviews.length),passport_rewards:source(a.rewards.length),capabilities:source(Object.keys(ASK_COVA_UNAVAILABLE).length)},unavailable:ASK_COVA_UNAVAILABLE,assumptions:ASK_COVA_DATA_ASSUMPTIONS};
}
