import { AskCovaDataError,askCovaDataAuthority,hashAskCovaData,freezeData,canonicalAskCovaData,type AskCovaDataContext } from './askCovaData';
import {ASK_COVA_QUERY_FIELDS as F,ASK_COVA_SEQUENCE_FIELDS as S,type QueryFieldKind,type QueryField} from './askCovaQueryFields';
import {askCovaQueryRows,value,rational,fixed,compareValues,instantValue,type QueryRow,type QueryValue,type AskCovaEvidenceSupport} from './askCovaQueryValues';
import {parseAskCovaQueryPlan,type AskCovaQueryPlan,type AskCovaQuery,type AskCovaQueryMeasure} from './askCovaQuery';
import {askCovaReportedSequence} from './askCova';
import type {Trade} from './risk';
export type {AskCovaEvidenceSupport} from './askCovaQueryValues';
export type AskCovaQueryCell={id:string;field:string;kind:QueryFieldKind;value:string|boolean|null;display:string;unit:string|null;currency:string|null;basis:string|null;coverage:string;unavailableReason:string|null};
export type AskCovaQueryCoverage={id:string;unit:string;sourceComplete:true;scoped:number;matched:number;usable:number;excluded:number;exclusionReasons:{reason:string;count:number}[];returned:number;omitted:number;resultMode:'complete'|'top';groupCount:number|null;returnedGroups:number|null;boundaryTies:number;textCoverage:'none'|'full_selected_text'};
export type AskCovaQueryObservation={id:string;query:string;facts:string[];categories:string[];excerpts:string[];coverage:string[];predicates:string[]};
export type AskCovaQueryTextEvidence={id:string;field:string;startUtf16:number;endUtf16:number;sourceTextDigest:string;excerptDigest:string;sourceComplete:true;trust:'self_reported_untrusted'};
export type AskCovaQueryResult={textEvidence:AskCovaQueryTextEvidence[];version:'ask-cova-query-result-v1';contextDigest:string;planDigest:string;resultDigest:string;cells:AskCovaQueryCell[];coverage:AskCovaQueryCoverage[];observations:AskCovaQueryObservation[];support:{observation:string;rows:AskCovaEvidenceSupport[]}[];scopeNotices:string[]};
type ResultAuthority={untrusted:Set<string>};
const issued=new WeakMap<AskCovaQueryResult,ResultAuthority>();
export function askCovaIssuedQueryResult(result:AskCovaQueryResult):ResultAuthority{const a=issued.get(result);if(!a)throw new AskCovaDataError('query_invalid');return a;}
// Monetary dimensions include their unit cohort, even when the measure is only a count.
function dimensionIdentity(v:QueryValue,field:QueryField):unknown{return field.kind==='money'?[v.value,v.currency,v.basis,v.reason]:v.value;}
function aggregate(m:AskCovaQueryMeasure,rows:QueryRow[],source:string):{v:QueryValue;field:QueryField;usable:number;reasons:{reason:string;count:number}[]}{
 const field=m.field?F[source][m.field]:{kind:'count' as const,type:'decimal' as const,unit:source,untrusted:false};
 const vals=m.field?rows.map(r=>r.values[m.field!]??value(null)):[];
 const money=field.kind==='money'&&m.op!=='count_distinct'&&m.op!=='win_rate';
 const usable=vals.filter(v=>v.value!==null&&(!money||v.currency!==null)),reasons=new Map<string,number>();
 for(const v of vals)if(v.value===null||money&&v.currency===null){const reason=v.reason??'unknown_currency';reasons.set(reason,(reasons.get(reason)??0)+1);}
 const result=(v:QueryValue,kind=field.kind,unit=field.unit)=>({v,field:{...field,kind,type:'decimal' as const,unit,untrusted:false},usable:m.op==='count'?rows.length:usable.length,reasons:[...reasons].map(([reason,count])=>({reason,count}))});
 if(m.op==='count')return result(value(String(rows.length)),'count',source);
 if(m.op==='count_distinct')return result(value(String(new Set(usable.map(v=>canonicalAskCovaData(dimensionIdentity(v,field)))).size)),'count','distinct_values');
 const code=vals[0]?.currency??null,basis=vals[0]?.basis??null;
 if(usable.length!==rows.length)return result(value(null,'incomplete_field',code,basis));
 if(!rows.length)return result(value(m.op==='sum'&&field.kind!=='money'?'0':null,'empty_population',code,basis));
 const numbers=usable.map(v=>v.ratio??rational(String(v.value)));
 const gcd=(a:bigint,b:bigint):bigint=>{while(b){const next=a%b;a=b;b=next;}return a;};
 const scale=numbers.reduce((d,x)=>d/gcd(d,x.d)*x.d,1n);
 const ns=numbers.map(x=>x.n*(scale/x.d)),sum=ns.reduce((s,n)=>s+n,0n);
 let n=sum,d=scale;
 if(m.op==='mean')d*=BigInt(rows.length);
 if(m.op==='min')n=ns.reduce((a,b)=>a<b?a:b);
 if(m.op==='max')n=ns.reduce((a,b)=>a>b?a:b);
 if(m.op==='win_rate'){n=BigInt(ns.filter(v=>v>0n).length)*100n;d=BigInt(ns.length);}
 if(m.op==='profit_factor'){n=ns.filter(v=>v>0n).reduce((s,v)=>s+v,0n);d=-ns.filter(v=>v<0n).reduce((s,v)=>s+v,0n);if(d===0n)return result(value(null,'no_losses',code,basis),'ratio','profit_factor');}
 if(money&&m.op!=='profit_factor'&&(n*100n>BigInt(Number.MAX_SAFE_INTEGER)*d||n*100n< -BigInt(Number.MAX_SAFE_INTEGER)*d))return result(value(null,'numeric_range',code,basis));
 const kind=m.op==='win_rate'?'percent':m.op==='profit_factor'?'ratio':field.kind,digits=kind==='money'?2:kind==='percent'?1:kind==='ratio'?2:9;
 const text=fixed(n,d,digits);const v={...value(digits===9?text.replace(/\.?0+$/,''):text,null,kind==='money'?code:null,basis),ratio:{n,d}};
 return result(v,kind,m.op==='win_rate'?'percent':m.op==='profit_factor'?'profit_factor':field.unit);
}
export function matchesQueryRow(row:QueryRow,q:AskCovaQuery):boolean{
 const where=q.where.length===0||q.where.some(clause=>clause.every(p=>{const v=row.values[p.field]??value(null);
  if(p.op==='is_missing')return v.value===null;if(p.op==='is_present')return v.value!==null;if(v.value===null)return false;
  if(p.op==='contains')return typeof v.value==='string'&&v.value.normalize('NFC').includes(p.value.normalize('NFC'));
  const timestamp=F[q.source][p.field].kind==='timestamp',numeric=timestamp||F[q.source][p.field].type==='decimal';
  if(p.op==='in')return p.values.some(x=>compareValues(v,timestamp?instantValue(x.value):value(x.value),numeric)===0);
  if(!('value' in p))return false;
  const n=compareValues(v,timestamp?instantValue(p.value.value):value(p.value.value),numeric);return p.op==='eq'?n===0:p.op==='ne'?n!==0:p.op==='lt'?n<0:p.op==='lte'?n<=0:p.op==='gt'?n>0:n>=0;
 }));
 return where&&(q.op!=='text_search'||typeof row.values[q.field]?.value==='string'&&(row.values[q.field].value as string).normalize('NFC').includes(q.needle.normalize('NFC')));
}
export function queryCellDisplay(v:QueryValue,kind:QueryFieldKind):string{if(v.value===null)return 'unavailable';if(typeof v.value==='boolean')return v.value?'yes':'no';const text=v.value.replace(/^-/,'−');return kind==='money'?`${text.startsWith('−')?'−':''}${v.currency==='USD'?'$':(v.currency??'unknown currency')+' '}${text.replace(/^−/,'')}`:kind==='percent'?text+'%':text;}
export async function executeAskCovaQuery(context:AskCovaDataContext,raw:AskCovaQueryPlan):Promise<AskCovaQueryResult>{
 askCovaDataAuthority(context);const plan=parseAskCovaQueryPlan(raw);if(!plan)throw new AskCovaDataError('query_invalid');
 if(plan.decision.kind==='scope_required')throw new AskCovaDataError('scope_required');
 if(plan.decision.kind==='unsupported')throw new AskCovaDataError(plan.decision.reason==='needs_narrowing'?'needs_narrowing':'query_invalid');
 const cells:AskCovaQueryCell[]=[],coverage:AskCovaQueryCoverage[]=[],observations:AskCovaQueryObservation[]=[],support:AskCovaQueryResult['support']=[],untrusted=new Set<string>();
 const tables=askCovaQueryRows(context),scopeNotices=[`Saved ${context.scope.range} range: ${context.scope.start??'no dated records'} to ${context.scope.end??'no dated records'}; recorded dates, not live broker history.`, 'Saved source completeness does not certify broker truth or field completeness.'];
 for(const q of plan.decision.kind==='query'?plan.decision.queries:[]){
  if(!tables[q.source])throw new AskCovaDataError('query_invalid');
  if(q.source==='rules')scopeNotices.push('These saved rules are owner-global current configuration, not historical rules in force. Limits have their rule-specific units; no currency is inferred.');
  if(q.source==='passport_plans')scopeNotices.push('Passport plans are separate owner-global saved historical limits, not the current workspace rules or broker-certified compliance.');
  if(q.source==='passport_reviews'||q.source==='passport_rewards')scopeNotices.push('Passport records describe saved reviews and reward allocation, not independently verified broker outcomes.');
  if(q.source==='journal_groups')scopeNotices.push('Journal groups use validated fill links before query filters; not certified completed positions. Groups may be censored by selected dates.');
  const scoped=tables[q.source],rows=scoped.filter(r=>matchesQueryRow(r,q));
  if(q.op==='sequence'){
   const ids=new Set(rows.flatMap(r=>r.support.map(s=>s.recordId)));
   const trades=askCovaDataAuthority(context).records.filter(r=>r.kind==='trade'&&ids.has(r.recordId)).map(r=>r.payload as unknown as Trade);
   const sequence=askCovaReportedSequence(trades),reason=sequence.available?null:sequence.reason;
   const root:AskCovaQueryCoverage={id:'coverage_'+coverage.length,unit:'trade_records',sourceComplete:true,scoped:scoped.length,matched:rows.length,usable:sequence.available?rows.length:0,excluded:sequence.available?0:rows.length,exclusionReasons:reason&&rows.length?[{reason,count:rows.length}]:[],returned:1,omitted:0,resultMode:'complete',groupCount:null,returnedGroups:null,boundaryTies:0,textCoverage:'none'};
   coverage.push(root);
   const obs:AskCovaQueryObservation={id:'observation_'+observations.length,query:q.id,facts:[],categories:[],excerpts:[],coverage:[root.id],predicates:['trade_records_not_positions','initial_zero_not_balance','reported_results_not_intratrade',...(sequence.available?['verified_close',sequence.maximum===0n?'no_decline':'peak_to_trough_decline']:[reason!])]};
   const columns:[string,QueryValue][]=[['record_count',value(String(rows.length))]];
   if(q.metric==='reported_drawdown')for(const [field,amount] of [['reported_drawdown',sequence.available?sequence.maximum:null],['drawdown_peak',sequence.available?sequence.peak:null],['drawdown_trough',sequence.available?sequence.trough:null]] as const)columns.push([field,value(amount===null?null:fixed(amount,100n,2),reason,sequence.available?sequence.code:null,sequence.available?sequence.basis:null)]);
   if(q.metric==='loss_streak') {
    columns.push(['loss_streak',value(sequence.available?String(sequence.lossStreak):null,reason,sequence.available?sequence.code:null,sequence.available?sequence.basis:null)]);
    obs.predicates=obs.predicates.filter(p=>!['initial_zero_not_balance','peak_to_trough_decline','no_decline'].includes(p));
    obs.predicates.push('longest_negative_run','breakeven_resets_streak');
    scopeNotices.push('Loss streak is the longest consecutive run of negative reported trade records; zero and positive results reset the run. It is not a completed-position streak or a prediction.');
   }
   for(const [field,v] of columns){
    const {kind,unit}=S[field];
    const cov=field==='record_count'?{...root,id:'coverage_'+coverage.length,usable:rows.length,excluded:0,exclusionReasons:[]}:root;
    if(cov!==root){coverage.push(cov);obs.coverage.push(cov.id);}
    const id='cell_'+cells.length;cells.push({id,field,kind,value:v.value,display:queryCellDisplay(v,kind),unit,currency:v.currency,basis:v.basis,coverage:cov.id,unavailableReason:v.reason});obs.facts.push(id);
   }
   observations.push(obs);support.push({observation:obs.id,rows:rows.flatMap(r=>r.support)});
   scopeNotices.push('Sequence unit: trade records, not journal groups or completed positions. The sequence uses only matched records after query filters; excluded intervening records do not participate. Recorded dates order different days; same-day records require distinct source closing instants matching their UTC recorded dates. No ID, creation time or storage order breaks ties.', 'Reported drawdown starts at initial zero before the matched range, not your account balance; it excludes price changes while trades were open and is not intratrade drawdown.');
   if(sequence.available)scopeNotices.push(`Reported P&L basis: ${sequence.basis}. This is not reconciled broker cash or allocated account fees.`);
   else scopeNotices.push(`${q.id}: sequence unavailable (${reason}); no partial path or invented ordering is reported.`);
   continue;
  }
  const groupFields=q.op==='aggregate'?[...q.groupBy]:q.op==='distinct'?[q.field]:q.op==='rows'?[...q.fields]:[q.field];
  if(q.op==='aggregate'&&q.measures.some(m=>m.field&&F[q.source][m.field].kind==='money'&&m.op!=='count_distinct'))for(const f of ['currency','pnl_basis'])if(!groupFields.includes(f))groupFields.push(f);
  if(q.op==='aggregate'&&q.source==='rules'&&q.measures.some(m=>m.field==='rule_limit')&&!groupFields.includes('rule_metric'))groupFields.push('rule_metric');
  const groups=new Map<string,QueryRow[]>();for(const [index,row] of rows.entries()){const key=q.op==='aggregate'||q.op==='distinct'?canonicalAskCovaData(groupFields.map(f=>dimensionIdentity(row.values[f]??value(null),F[q.source][f]))):String(index).padStart(8,'0');const bucket=groups.get(key)??[];bucket.push(row);groups.set(key,bucket);}
  if(!rows.length&&q.op==='aggregate'&&!q.groupBy.length)groups.set('[]',[]);
  // Keep the existing value ordering; new equal-value cohorts retain stable source-row order.
  const entries=[...groups].map(([key,members])=>({key:q.op==='aggregate'||q.op==='distinct'?canonicalAskCovaData(groupFields.map(f=>members[0]?.values[f]?.value??null)):key,members,columns:[...groupFields.map(f=>({key:f,v:members[0]?.values[f]??value(null),field:F[q.source][f],usable:members.filter(r=>r.values[f]?.value!=null).length,reasons:members.some(r=>r.values[f]?.value==null)?[{reason:members.find(r=>r.values[f]?.value==null)?.values[f]?.reason??'missing',count:members.filter(r=>r.values[f]?.value==null).length}]:[]})),...(q.op==='aggregate'?q.measures.map(m=>({key:m.id,...aggregate(m,members,q.source)})):[])]}));
  const cmp=(a:typeof entries[number],b:typeof entries[number])=>{for(const order of q.orderBy){const x=a.columns.find(c=>c.key===order.key)!,y=b.columns.find(c=>c.key===order.key)!;const n=compareValues(x.v,y.v,x.field.type==='decimal'||x.field.kind==='timestamp');if(n)return x.v.value===null||y.v.value===null?n:order.direction==='asc'?n:-n;}return 0;};
  for(const o of q.orderBy){const cohorts=new Set(entries.map(e=>e.columns.find(c=>c.key===o.key)!).filter(c=>c.field.kind==='money'&&c.v.value!==null&&c.v.currency!==null).map(c=>canonicalAskCovaData([c.v.currency,c.v.basis])));if(cohorts.size>1)throw new AskCovaDataError('needs_narrowing');}
  entries.sort((a,b)=>cmp(a,b)||(a.key<b.key?-1:a.key>b.key?1:0));
  if(q.mode==='complete'&&entries.length>q.limit)throw new AskCovaDataError('needs_narrowing');
  const shown=entries.slice(0,q.limit),ties=q.orderBy.length&&shown.length?entries.slice(shown.length).filter(e=>cmp(e,shown[shown.length-1])===0).length:0;
  const grouped=q.op==='aggregate'||q.op==='distinct';
  const root:AskCovaQueryCoverage={id:'coverage_'+coverage.length,unit:q.source,sourceComplete:true,scoped:scoped.length,matched:rows.length,usable:rows.length,excluded:0,exclusionReasons:[],returned:shown.length,omitted:entries.length-shown.length,resultMode:q.mode,groupCount:grouped?entries.length:null,returnedGroups:grouped?shown.length:null,boundaryTies:ties,textCoverage:groupFields.some(f=>F[q.source][f].untrusted)?'full_selected_text':'none'};coverage.push(root);
  if(q.op==='aggregate')for(const m of q.measures){const all=aggregate(m,rows,q.source);const cov={...root,id:'coverage_'+coverage.length,usable:all.usable,excluded:rows.length-all.usable,exclusionReasons:all.reasons};coverage.push(cov);if(cov.excluded)scopeNotices.push(`${q.id}.${m.id}: ${cov.usable}/${cov.matched} usable across all matches; incomplete fields (${all.reasons.map(r=>r.reason).join(', ')}) also affect omitted groups.`);}
  if(!shown.length){const id='observation_'+observations.length;observations.push({id,query:q.id,facts:[],categories:[],excerpts:[],coverage:[root.id],predicates:['empty_population']});support.push({observation:id,rows:[]});}
  if(root.omitted)scopeNotices.push(`${q.id}: ${root.returned} of ${entries.length} ${grouped?'groups':'records'} shown after the complete scan; ${ties} omitted boundary ties. This is not a full-text summary of omitted records.`);
  for(const entry of shown){const obs:AskCovaQueryObservation={id:'observation_'+observations.length,query:q.id,facts:[],categories:[],excerpts:[],coverage:[root.id],predicates:[]};
   for(const c of entry.columns){const cov={...root,id:'coverage_'+coverage.length,matched:entry.members.length,usable:c.usable,excluded:entry.members.length-c.usable,exclusionReasons:c.reasons};coverage.push(cov);obs.coverage.push(cov.id);const id='cell_'+cells.length;
    cells.push({id,field:c.key,kind:c.field.kind,value:c.v.value,display:queryCellDisplay(c.v,c.field.kind),unit:c.field.unit,currency:c.v.currency,basis:c.v.basis,coverage:cov.id,unavailableReason:c.v.reason});
    if(c.field.untrusted)untrusted.add(id);(c.field.kind==='text'?obs.excerpts:c.field.kind==='category'?obs.categories:obs.facts).push(id);
    if(cov.excluded)scopeNotices.push(`${q.id}.${c.key}: ${cov.usable}/${cov.matched} usable; incomplete fields are not a complete total.`);
   }
   observations.push(obs);support.push({observation:obs.id,rows:entry.members.flatMap(r=>r.support)});
  }
 }
 if(plan.decision.kind==='converse'){observations.push({id:'observation_0',query:'conversation',facts:[],categories:[],excerpts:[],coverage:[],predicates:['no_data_claim',plan.decision.reason]});support.push({observation:'observation_0',rows:[]});}
 const planDigest=await hashAskCovaData('ask-cova-query-plan-v1',{contextDigest:context.contextDigest,plan});
 const textEvidence:AskCovaQueryTextEvidence[]=await Promise.all(cells.filter(c=>untrusted.has(c.id)&&typeof c.value==='string').map(async c=>{const digest=await hashAskCovaData('ask-cova-text-v1',c.value);return {id:c.id,field:c.field,startUtf16:0,endUtf16:(c.value as string).length,sourceTextDigest:digest,excerptDigest:digest,sourceComplete:true as const,trust:'self_reported_untrusted' as const};}));
 const body={textEvidence,version:'ask-cova-query-result-v1' as const,contextDigest:context.contextDigest,planDigest,cells,coverage,observations,support,scopeNotices:[...new Set(scopeNotices)]};
 const result=freezeData({...body,resultDigest:await hashAskCovaData('ask-cova-query-result-v1',body)});issued.set(result,{untrusted});return result;
}
export function askCovaQueryModelPayload(result:AskCovaQueryResult){
 const a=askCovaIssuedQueryResult(result);
 const untrustedText=result.cells.filter(c=>a.untrusted.has(c.id)&&typeof c.value==='string').map(c=>({id:c.id,field:c.field,text:c.value as string,trust:'self_reported_untrusted' as const}));
 if(untrustedText.length>8||untrustedText.reduce((n,t)=>n+[...t.text].length,0)>8000)throw new AskCovaDataError('needs_narrowing');
 const data={version:result.version,cells:result.cells.map(c=>a.untrusted.has(c.id)?{...c,value:null,display:`{{${c.kind==='text'?'q':'c'}:${c.id}}}`,untrustedTextAvailable:c.value!==null}:{...c}),coverage:result.coverage,observations:result.observations,scopeNotices:result.scopeNotices};
 const payload={data,untrustedText};if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>16384)throw new AskCovaDataError('needs_narrowing');return freezeData(payload);
}
