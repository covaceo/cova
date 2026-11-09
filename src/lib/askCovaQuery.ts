export { executeAskCovaQuery, askCovaQueryModelPayload } from './askCovaQueryEngine';
export type { AskCovaQueryResult, AskCovaEvidenceSupport } from './askCovaQueryEngine';
import { copyAskCovaPlainData, exactDataKeys, freezeData, dataInstant } from './askCovaData';
import { date } from './workspaceValidation';
import { ASK_COVA_QUERY_FIELDS as F, ASK_COVA_QUERY_FIELD_NAMES, ASK_COVA_QUERY_SOURCES, queryRef, queryDecimal } from './askCovaQueryFields';
export type AskCovaQueryLiteral={type:'text'|'decimal'|'date'|'ref';value:string}|{type:'boolean';value:boolean};
export type AskCovaQueryPredicate={field:string;op:'eq'|'ne'|'lt'|'lte'|'gt'|'gte';value:AskCovaQueryLiteral}|{field:string;op:'in';values:AskCovaQueryLiteral[]}|{field:string;op:'contains';value:string;match:'nfc_exact'}|{field:string;op:'is_missing'|'is_present'};
export type AskCovaQueryMeasure={id:string;op:'count'|'count_distinct'|'sum'|'mean'|'min'|'max'|'win_rate'|'profit_factor';field:string|null};
type Common={id:string;source:string;where:AskCovaQueryPredicate[][];orderBy:{key:string;direction:'asc'|'desc'}[];mode:'complete'|'top';limit:number};
export type AskCovaQuery=Common&({op:'aggregate';groupBy:string[];measures:AskCovaQueryMeasure[]}|{op:'rows';fields:string[]}|{op:'distinct';field:string}|{op:'text_search';field:string;needle:string;match:'nfc_exact'})|{id:string;op:'sequence';source:'trades';where:AskCovaQueryPredicate[][];metric:'reported_drawdown'|'loss_streak';order:'verified_close';mode:'complete';limit:1};
export type AskCovaQueryPlan={version:'ask-cova-query-plan-v1';decision:{kind:'query';queries:AskCovaQuery[]}|{kind:'converse';reason:'greeting'|'clarification'}|{kind:'scope_required';requestedRange:{kind:'saved_history'}|{kind:'explicit_dates';start:string;end:string}}|{kind:'unsupported';reason:'missing_source'|'unsupported_operation'|'needs_narrowing'}};
const obj=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const str=(values?:readonly string[])=>values?{type:'string',enum:values}:{type:'string'};
const arr=(items:unknown,maxItems:number,minItems=0)=>({type:'array',items,minItems,maxItems});
const field={$ref:'#/$defs/field'},id={type:'string',pattern:'^[a-z][a-z0-9_]{0,31}$'},literal={$ref:'#/$defs/literal'},literalDefinition={anyOf:[...['text','decimal','date','ref'].map(type=>obj({type:str([type]),value:str()})),obj({type:str(['boolean']),value:{type:'boolean'}})]};
const predicate={$ref:'#/$defs/predicate'},predicateDefinition={anyOf:[obj({field,op:str(['eq','ne','lt','lte','gt','gte']),value:literal}),obj({field,op:str(['in']),values:arr(literal,8,1)}),obj({field,op:str(['contains']),value:str(),match:str(['nfc_exact'])}),obj({field,op:str(['is_missing','is_present'])})]};
const common={id,source:str(ASK_COVA_QUERY_SOURCES),where:arr(arr(predicate,4,1),2),orderBy:arr(obj({key:str(),direction:str(['asc','desc'])}),2),mode:str(['complete','top']),limit:{type:'integer',minimum:1,maximum:32}};
const query={anyOf:[obj({...common,op:str(['aggregate']),groupBy:arr(field,2),measures:arr(obj({id,op:str(['count','count_distinct','sum','mean','min','max','win_rate','profit_factor']),field:{anyOf:[field,{type:'null'}]}}),4,1)}),obj({...common,op:str(['rows']),fields:arr(field,12,1)}),obj({...common,op:str(['distinct']),field}),obj({...common,op:str(['text_search']),field,needle:str(),match:str(['nfc_exact'])}),obj({id,op:str(['sequence']),source:str(['trades']),where:common.where,metric:str(['reported_drawdown','loss_streak']),order:str(['verified_close']),mode:str(['complete']),limit:{type:'integer',enum:[1]}})]};
export const ASK_COVA_QUERY_PLAN_SCHEMA=freezeData({...obj({version:str(['ask-cova-query-plan-v1']),decision:{anyOf:[obj({kind:str(['query']),queries:arr(query,2,1)}),obj({kind:str(['converse']),reason:str(['greeting','clarification'])}),obj({kind:str(['scope_required']),requestedRange:{anyOf:[obj({kind:str(['saved_history'])}),obj({kind:str(['explicit_dates']),start:str(),end:str()})]}}),obj({kind:str(['unsupported']),reason:str(['missing_source','unsupported_operation','needs_narrowing'])})]}}),$defs:{field:str(ASK_COVA_QUERY_FIELD_NAMES),literal:literalDefinition,predicate:predicateDefinition}});
function validLiteral(v:any,type:string):boolean{return exactDataKeys(v,['type','value'])&&v.type===type&&(type==='boolean'?typeof v.value==='boolean':typeof v.value==='string'&&v.value.length<=2000&&(type==='decimal'?queryDecimal(v.value):type==='date'?date(v.value):type==='ref'?queryRef(v.value):true));}
function validQuery(q:any):boolean{
 if(!q||typeof q.source!=='string'||!ASK_COVA_QUERY_SOURCES.includes(q.source)||!queryRef(q.id)||!['aggregate','rows','distinct','text_search','sequence'].includes(q.op)||!['complete','top'].includes(q.mode)||!Number.isSafeInteger(q.limit)||q.limit<1||q.limit>(q.op==='aggregate'||q.op==='distinct'?32:20))return false;
 const extra=q.op==='sequence'?['metric','order']:q.op==='aggregate'?['orderBy','groupBy','measures']:q.op==='rows'?['orderBy','fields']:q.op==='distinct'?['orderBy','field']:['orderBy','field','needle','match'];
 if(!exactDataKeys(q,['id','op','source','where','mode','limit',...extra]))return false;
 if(q.op==='sequence'&&(q.source!=='trades'||!['reported_drawdown','loss_streak'].includes(q.metric)||q.order!=='verified_close'||q.mode!=='complete'||q.limit!==1))return false;
 const fields=F[q.source],has=(f:any)=>typeof f==='string'&&Object.prototype.hasOwnProperty.call(fields,f);
 if(!Array.isArray(q.where)||q.where.length>2||q.where.some((clause:any)=>!Array.isArray(clause)||!clause.length||clause.length>4||clause.some((p:any)=>{
  if(!p||!has(p.field))return true;const type=fields[p.field].type;
  if(fields[p.field].kind==='timestamp'&&!['is_missing','is_present'].includes(p.op)){if(p.op==='in'){if(!Array.isArray(p.values)||p.values.some((v:any)=>!dataInstant(v?.value)))return true;}else if(!dataInstant(p.value?.value))return true;}
  if(['is_missing','is_present'].includes(p.op))return !exactDataKeys(p,['field','op']);
  if(p.op==='contains')return !exactDataKeys(p,['field','op','value','match'])||type!=='text'||typeof p.value!=='string'||!p.value.length||p.value.length>200||p.match!=='nfc_exact';
  if(p.op==='in')return !exactDataKeys(p,['field','op','values'])||!Array.isArray(p.values)||!p.values.length||p.values.length>8||p.values.some((v:any)=>!validLiteral(v,type));
  return !exactDataKeys(p,['field','op','value'])||!['eq','ne','lt','lte','gt','gte'].includes(p.op)||!validLiteral(p.value,type)||(['lt','lte','gt','gte'].includes(p.op)&&!['decimal','date'].includes(type)&&fields[p.field].kind!=='timestamp');
 })))return false;
 if(q.op==='sequence')return true;
 let projected:string[]=[];
 if(q.op==='aggregate'){
  if(!Array.isArray(q.groupBy)||q.groupBy.length>2||q.groupBy.some((f:any)=>!has(f))||new Set(q.groupBy).size!==q.groupBy.length||!Array.isArray(q.measures)||!q.measures.length||q.measures.length>4)return false;
  for(const m of q.measures){if(!exactDataKeys(m,['id','op','field'])||!queryRef(m.id)||has(m.id)||q.groupBy.includes(m.id)||!['count','count_distinct','sum','mean','min','max','win_rate','profit_factor'].includes(m.op))return false;if(m.op==='count'){if(m.field!==null)return false;}else{if(!has(m.field))return false;if(m.op!=='count_distinct'&&fields[m.field].type!=='decimal')return false;if(['win_rate','profit_factor'].includes(m.op)&&m.field!=='reported_pnl')return false;}}
  if(new Set(q.measures.map((m:any)=>m.id)).size!==q.measures.length)return false;projected=[...q.groupBy,...q.measures.map((m:any)=>m.id)];
 }else if(q.op==='rows'){if(!Array.isArray(q.fields)||!q.fields.length||q.fields.length>12||q.fields.some((f:any)=>!has(f))||new Set(q.fields).size!==q.fields.length)return false;projected=q.fields;}
 else{if(!has(q.field))return false;projected=[q.field];if(q.op==='text_search'&&(fields[q.field].type!=='text'||!fields[q.field].untrusted||typeof q.needle!=='string'||!q.needle.length||q.needle.length>200||q.match!=='nfc_exact'))return false;}
 return Array.isArray(q.orderBy)&&q.orderBy.length<=2&&new Set(q.orderBy.map((o:any)=>o.key)).size===q.orderBy.length&&q.orderBy.every((o:any)=>exactDataKeys(o,['key','direction'])&&projected.includes(o.key)&&['asc','desc'].includes(o.direction));
}
export function parseAskCovaQueryPlan(raw:unknown):AskCovaQueryPlan|null{
 try{const p=copyAskCovaPlainData(raw,4096);if(!exactDataKeys(p,['version','decision'])||p.version!=='ask-cova-query-plan-v1'||!p.decision)return null;const d=p.decision;
 if(d.kind==='query'){if(!exactDataKeys(d,['kind','queries'])||!Array.isArray(d.queries)||!d.queries.length||d.queries.length>2||!d.queries.every(validQuery)||new Set(d.queries.map((q:any)=>q.id)).size!==d.queries.length)return null;}
 else if(d.kind==='converse'){if(!exactDataKeys(d,['kind','reason'])||!['greeting','clarification'].includes(d.reason))return null;}
 else if(d.kind==='unsupported'){if(!exactDataKeys(d,['kind','reason'])||!['missing_source','unsupported_operation','needs_narrowing'].includes(d.reason))return null;}
 else if(d.kind==='scope_required'){if(!exactDataKeys(d,['kind','requestedRange']))return null;const r=d.requestedRange;if(r?.kind==='saved_history'){if(!exactDataKeys(r,['kind']))return null;}else if(!exactDataKeys(r,['kind','start','end'])||r.kind!=='explicit_dates'||!date(r.start)||!date(r.end)||r.start>r.end)return null;}
 else return null;return freezeData(p as AskCovaQueryPlan);
 }catch{return null;}
}
