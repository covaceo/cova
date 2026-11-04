/** Shared browser/server authored-answer contract. No private evidence or transport. */
export const ASK_COVA_OUTPUT_TOKENS = 1024;
export type AskCovaParagraph = { text: string; evidence: string[] };
export type AskCovaAuthoredAnswer = { version: 'ask-cova-answer-v1'; paragraphs: AskCovaParagraph[]; detail: AskCovaParagraph[] };
export type AskCovaInlineNode = { kind: 'text'; text: string } | { kind: 'fact' | 'category'; id: string };
export type AskCovaFact = { id: string; kind: 'money' | 'percent' | 'ratio' | 'count' | 'duration'; value: string | null; display: string; currency: string | null; basis: string | null; coverage: string };
export type AskCovaCoverage = { id: string; kind: 'full_scope' | 'valid_subset' | 'comparison_subset'; totalGroups: number; usableGroups: number; sampleGroups: number; describedGroups: number; matched: boolean | null };
export type AskCovaObservation = { id: string; kind: string; facts: string[]; categories: string[]; coverage: string[]; predicates: string[] };
export type AskCovaFactPacket = { version: 'ask-cova-facts-v1'; question: string; scope: 'selected_range'; facts: AskCovaFact[]; categories: { id: string; description: string }[]; coverage: AskCovaCoverage[]; observations: AskCovaObservation[]; requiredAnswerEvidence: string[] };
const paragraphSchema = { type: 'object', additionalProperties: false, properties: { text: {type:'string'}, evidence: {type:'array',items:{type:'string'}} }, required:['text','evidence'] };
export const ASK_COVA_ANSWER_SCHEMA = { type:'object', additionalProperties:false, properties:{ version:{type:'string',enum:['ask-cova-answer-v1']}, paragraphs:{type:'array',items:paragraphSchema}, detail:{type:'array',items:paragraphSchema} },required:['version','paragraphs','detail'] };
export function tokenizeAskCovaParagraph(text: string): readonly AskCovaInlineNode[] | null {
  const nodes: AskCovaInlineNode[] = [];
  for (let cursor = 0; cursor < text.length;) {
    if (text.startsWith('{{', cursor)) {
      const token = /^\{\{([fc]):([a-z][a-z0-9_]{0,31})\}\}/.exec(text.slice(cursor));
      if (!token) return null;
      nodes.push({kind:token[1] === 'f' ? 'fact' : 'category', id:token[2]}); cursor += token[0].length;
    } else {
      let end = cursor; while (end < text.length && text[end] !== '{' && text[end] !== '}') end++;
      if (end === cursor) return null;
      nodes.push({kind:'text',text:text.slice(cursor,end)}); cursor = end;
    }
  }
  return nodes;
}
function dataRecord(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value)) return false;
  const proto=Object.getPrototypeOf(value);
  if (proto!==Object.prototype && proto!==null) return false;
  const own=Reflect.ownKeys(value);
  return own.length===keys.length && own.every(key=>typeof key==='string' && keys.includes(key) && 'value' in Object.getOwnPropertyDescriptor(value,key)!);
}
function dataArray(value: unknown, max: number): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype || value.length>max) return false;
  const keys=Reflect.ownKeys(value);
  return keys.length===value.length+1 && keys.every(key=>key==='length' || typeof key==='string' && /^(0|[1-9][0-9]*)$/.test(key) && Number(key)<value.length && 'value' in Object.getOwnPropertyDescriptor(value,key)!);
}
export function parseAskCovaAnswer(value: unknown): AskCovaAuthoredAnswer | null {
  try {
    if (!dataRecord(value,['version','paragraphs','detail']) || value.version!=='ask-cova-answer-v1' || !dataArray(value.paragraphs,2) || !value.paragraphs.length || !dataArray(value.detail,1)) return null;
    let characters=0, slots=0;
    const parse = (items: unknown[]): AskCovaParagraph[] => items.map(p=>{
      if (!dataRecord(p,['text','evidence']) || typeof p.text!=='string' || !p.text.trim() || p.text.length>2200 || !dataArray(p.evidence,4) || !p.evidence.length || p.evidence.some(id=>typeof id!=='string' || !/^[a-z][a-z0-9_]{0,31}$/.test(id)) || new Set(p.evidence).size!==p.evidence.length) throw Error('Invalid paragraph');
      characters+=p.text.length;
      const nodes=tokenizeAskCovaParagraph(p.text); if(!nodes) throw Error('Invalid atoms');
      for(const node of nodes) {
        if(node.kind!=='text') {slots++;continue;}
        if(/[\p{Nd}\p{Sc}%％‰‱<>`\\\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(node.text) || /(?:https?:|www\.|\]\(|category\s+[ab]\b)/i.test(node.text)) throw Error('Unsafe text');
      }
      return {text:p.text,evidence:p.evidence as string[]};
    });
    const paragraphs=parse(value.paragraphs),detail=parse(value.detail);
    if(characters>3600 || slots>32) return null;
    return {version:'ask-cova-answer-v1',paragraphs,detail};
  } catch { return null; }
}
