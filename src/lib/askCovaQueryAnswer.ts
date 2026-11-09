import {copyAskCovaPlainData,exactDataKeys,freezeData,canonicalAskCovaData} from './askCovaData';
import {askCovaIssuedQueryResult,type AskCovaQueryResult,type AskCovaEvidenceSupport} from './askCovaQueryEngine';
import {queryRef} from './askCovaQueryFields';
export type AskCovaQueryAnswer={version:'ask-cova-answer-v2';paragraphs:{text:string;evidence:string[]}[];detail:{text:string;evidence:string[]}[]};
const paragraph={type:'object',additionalProperties:false,properties:{text:{type:'string'},evidence:{type:'array',items:{type:'string'},minItems:1,maxItems:4}},required:['text','evidence']};
export const ASK_COVA_QUERY_ANSWER_SCHEMA=freezeData({type:'object',additionalProperties:false,properties:{version:{type:'string',enum:['ask-cova-answer-v2']},paragraphs:{type:'array',items:paragraph,minItems:1,maxItems:2},detail:{type:'array',items:paragraph,maxItems:1}},required:['version','paragraphs','detail']});
type Node={kind:'text';text:string}|{kind:'f'|'c'|'q';id:string};
function tokenize(text:string):Node[]|null{
 const out:Node[]=[];for(let cursor=0;cursor<text.length;){if(text.startsWith('{{',cursor)){const m=/^\{\{([fcq]):([a-z][a-z0-9_]{0,31})\}\}/.exec(text.slice(cursor));if(!m)return null;out.push({kind:m[1] as 'f'|'c'|'q',id:m[2]});cursor+=m[0].length;}
 else{let end=cursor;while(end<text.length&&text[end]!=='{'&&text[end]!=='}')end++;if(end===cursor)return null;out.push({kind:'text',text:text.slice(cursor,end)});cursor=end;}}
 return out;
}
export function parseAskCovaQueryAnswer(raw:unknown):AskCovaQueryAnswer|null{
 try{const a=copyAskCovaPlainData(raw,16384);if(!exactDataKeys(a,['version','paragraphs','detail'])||a.version!=='ask-cova-answer-v2'||!Array.isArray(a.paragraphs)||!a.paragraphs.length||a.paragraphs.length>2||!Array.isArray(a.detail)||a.detail.length>1)return null;
 let characters=0,slots=0;for(const p of [...a.paragraphs,...a.detail]){if(!exactDataKeys(p,['text','evidence'])||typeof p.text!=='string'||!p.text.trim()||p.text.length>2200||!Array.isArray(p.evidence)||!p.evidence.length||p.evidence.length>4||!p.evidence.every(queryRef)||new Set(p.evidence).size!==p.evidence.length)return null;characters+=p.text.length;const nodes=tokenize(p.text);if(!nodes)return null;for(const n of nodes){if(n.kind!=='text'){slots++;continue;}if(/[\p{Nd}\p{Sc}%％‰‱<>`\\\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(n.text)||/(?:https?:|www\.|\]\()/i.test(n.text))return null;}}
 if(characters>3600||slots>32)return null;return freezeData(a as AskCovaQueryAnswer);
 }catch{return null;}
}
export type AskCovaRenderedQueryAnswer={paragraphs:string[];detail:string[];scopeNotices:string[];tradeIds:string[];supports:AskCovaEvidenceSupport[]};
/** Plain strings for text children. Never pass these to innerHTML/Markdown. */
export function renderAskCovaQueryAnswer(result:AskCovaQueryResult,raw:unknown):AskCovaRenderedQueryAnswer|null{
 try{askCovaIssuedQueryResult(result);const answer=parseAskCovaQueryAnswer(raw);if(!answer)return null;const cited=new Set<string>(),used=new Set<string>();
 const render=(p:AskCovaQueryAnswer['paragraphs'][number])=>{
  const observations=p.evidence.map(id=>{const o=result.observations.find(o=>o.id===id);if(!o)throw Error('evidence');cited.add(id);return o;});
  return tokenize(p.text)!.map(n=>{if(n.kind==='text')return n.text;const cell=result.cells.find(c=>c.id===n.id);if(!cell||cell.value===null)throw Error('atom');const slot=n.kind==='f'?'facts':n.kind==='c'?'categories':'excerpts';if(!observations.some(o=>o[slot].includes(n.id)))throw Error('membership');used.add(n.id);return cell.display;}).join('');
 };
 const paragraphs=answer.paragraphs.map(render);
 if(answer.detail.some(p=>p.evidence.some(id=>!cited.has(id))))return null;
 const detail=answer.detail.map(render),supports=[...new Map(result.support.filter(s=>cited.has(s.observation)).flatMap(s=>s.rows).map(s=>[canonicalAskCovaData(s),{...s}])).values()];
 const words=(items:string[])=>items.join(' ').trim().split(/\s+/).filter(Boolean).length;
 if(words(paragraphs)>160||words(detail)>80)return null;
 const notices=[...result.scopeNotices];for(const cell of result.cells.filter(c=>used.has(c.id))){if(cell.basis)notices.push(`${cell.field}: ${cell.basis}.`);if(cell.kind==='text')notices.push('Quoted saved text is self-reported, not verified financial evidence.');}
 if([...paragraphs,...detail].join('\n').length>4800)return null;
 return freezeData({paragraphs,detail,scopeNotices:[...new Set(notices)],tradeIds:[...new Set(supports.filter(s=>s.kind==='trade').map(s=>s.recordId))],supports});
 }catch{return null;}
}
export function askCovaQueryHistoryText(result:AskCovaQueryResult,raw:unknown):string|null{const rendered=renderAskCovaQueryAnswer(result,raw);if(!rendered)return null;const text=[...rendered.paragraphs,...rendered.scopeNotices].join('\n');return text.length<=4800?text:null;}
