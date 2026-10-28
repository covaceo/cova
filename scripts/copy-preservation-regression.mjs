import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import load from './helpers/load-ts.cjs';
import {restoreApprovedCopySource} from './helpers/approved-copy-cleanup.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/approved-copy-cleanup.json',import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
const current=load('src/lib/risk.ts');
const original={exports:{}};
new Function('module','exports',ts.transpileModule(restoreApprovedCopySource('src/lib/risk.ts',readFileSync('src/lib/risk.ts','utf8')),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(original,original.exports);
// Only presentation fields are omitted. Preserve ALL other strings, including
// IDs, notes, sources, dates, status enums, P&L basis, and evidence-quality level.
export function withoutCopy(v) {
 if(Array.isArray(v))return v.map(withoutCopy);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['label','summary','headline','watchlist','guardrails','evidence','caveats','reason'].includes(k)).map(([k,x])=>[k,withoutCopy(x)]));
 return v;
}
for(const scenario of ['sample','empty','missing','zero','negative','disabled','legacy','partial'])test(`approved copy preserves numeric and machine contracts: ${scenario}`,()=>{
 let rows=structuredClone(original.exports.sampleTrades),rules=structuredClone(original.exports.defaultRules);
 if(scenario==='empty')rows=[];
 if(scenario==='missing')rows=rows.map(t=>({...t,risk:0,riskStatus:'missing'}));
 if(scenario==='zero')rows=rows.map(t=>({...t,pnl:0}));
 if(scenario==='negative')rows=rows.map(t=>({...t,pnl:-Math.abs(t.pnl)}));
 if(scenario==='disabled')rules=rules.map(r=>({...r,enabled:false}));
 if(scenario==='legacy')rows=rows.map(t=>({...t,riskStatus:'legacy'}));
 if(scenario==='partial')rows=rows.slice(0,2);
 const held=structuredClone(rows);
 assert.deepEqual(withoutCopy(current.analyze(rows,rules)),withoutCopy(original.exports.analyze(rows,rules)));
 assert.deepEqual(rows,held,'Analysis must not write to actual notes or rows');
});
test('exact approved copy seams preserve all surrounding source and reject formula mutations',()=>{
 for(const [file,record] of Object.entries(fixture.files)){
  const source=readFileSync(file,'utf8');
  assert.equal(sha(restoreApprovedCopySource(file,source)),record.sha256,file);
 }
 const file='src/lib/risk.ts',source=readFileSync(file,'utf8');
 for(const [from,to] of [['sum + trade.pnl','sum + trade.pnl + 1'],['policy.balance','policy.recovery'],['if (existingAccount !== incomingAccount)','if (false)']]){
  assert.ok(source.includes(from),'Mutation target exists');
  assert.throws(()=>assert.equal(sha(restoreApprovedCopySource(file,source.replace(from,to))),fixture.files[file].sha256),'Adapter cannot swallow accounting, identity or formula changes');
 }
});
test('financial library seams are display text only, never IDs, enums, expressions or control flow',()=>{
 const allowedFunctions=new Set(['buildBehaviorFlags','buildNextSessionBrief','evaluateRule','calculatePerformanceScore','buildEvidenceQuality','buildScoreFactors','disciplineReview','buildHoloPassportModel','getTradeSourceLabel']);
 for(const file of Object.keys(fixture.files).filter(f=>f.startsWith('src/lib/'))){
  const text=readFileSync(file,'utf8').replaceAll('\r\n','\n');
  const old=restoreApprovedCopySource(file,text);
  const a=ts.createSourceFile(file,old,ts.ScriptTarget.Latest,true),b=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const edits=[];
  function compare(x,y){
   assert.equal(x.kind,y.kind,file);
   const isText=ts.isStringLiteral(x)||ts.isNoSubstitutionTemplateLiteral(x)||[ts.SyntaxKind.TemplateHead,ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail].includes(x.kind);
   if(isText&&x.getText(a)!==y.getText(b)){
    let parent=x.parent;while(parent&&!ts.isFunctionDeclaration(parent))parent=parent.parent;
    assert.ok(parent&&allowedFunctions.has(parent.name.text)||file.endsWith('/propFirms.ts')&&ts.isPropertyAssignment(x.parent)&&['summary','tip'].includes(x.parent.name.getText(a)),`${file}: unapproved display function`);
    assert.ok(!ts.isLiteralTypeNode(x.parent));
    if(ts.isPropertyAssignment(x.parent))assert.ok(!['id','status','severity','metric','impact','version','level','mode','unit','target'].includes(x.parent.name.getText(a)));
    edits.push({start:x.getStart(a),end:x.end,replacement:y.getText(b)});return;
   }
   const ac=[],bc=[];ts.forEachChild(x,n=>{ac.push(n);});ts.forEachChild(y,n=>{bc.push(n);});
   assert.equal(ac.length,bc.length,file);if(!ac.length)assert.equal(x.getText(a),y.getText(b),file);
   ac.forEach((n,i)=>compare(n,bc[i]));
  }
  compare(a,b);
  let rebuilt=old;for(const e of edits.sort((a,b)=>b.start-a.start))rebuilt=rebuilt.slice(0,e.start)+e.replacement+rebuilt.slice(e.end);
  assert.equal(rebuilt,text,`${file}: whitespace/comments or non-copy source changed`);
 }
});
test('routes, legal/vendor disclosures, storage ownership and actual journal stores are unchanged',()=>{
 const protectedFiles=JSON.parse(readFileSync(new URL('./fixtures/copy-protected-contracts.json',import.meta.url),'utf8'));
 for(const [file,hash] of Object.entries(protectedFiles))assert.equal(sha(readFileSync(file,'utf8')),hash,file);
});
test('copy adapter preserves unknown binary inputs and rejects arbitrary hero/nav changes',()=>{
 const binary=Buffer.from([0,255,13,10,128]);
 assert.equal(restoreApprovedCopySource('material.webp',binary),binary);
 for(const [file,from,to] of [['src/components/MarketingHero.tsx','rating: 5','rating: 4'],['src/components/WorkspaceShell.tsx','go(item.id)','go("passport")'],['src/components/DashboardBriefs.tsx','  }[brief.status];','  }["ready"];'],['src/components/OaDisciplineReview.tsx',"go('coach')","go('rules')"]]){
  const source=readFileSync(file,'utf8');assert.ok(source.includes(from),'Mutation target exists');
  assert.throws(()=>assert.equal(sha(restoreApprovedCopySource(file,source.replace(from,to))),fixture.files[file].sha256));
 }
});
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
test('rejected UI boilerplate stays absent across all source strings and JSX, including generated findings',()=>{
 const banned=/historical review|recorded rows|risk-provided rows|model evidence|nothing is saved or inferred|reviewed sample/i;
 for(const file of files('src').filter(f=>/\.tsx?$/.test(f))){
  const tree=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  function walk(node){
   // Inspect displayed text candidates, not comments, identifiers or regex parsers.
   if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isJsxText(node)||[ts.SyntaxKind.TemplateHead,ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail].includes(node.kind))assert.doesNotMatch(node.text,banned,file);
   ts.forEachChild(node,walk);
  }walk(tree);
 }
 assert.match(readFileSync('src/lib/passportHolo.ts','utf8'),/reviewed trades/,'Keep the intentionally parsed export count label');
});
