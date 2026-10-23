import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import load from './helpers/load-ts.cjs';
import {restorePerformanceScoreSource as restore} from './helpers/approved-performance-score.mjs';
const approved=JSON.parse(readFileSync(new URL('./fixtures/performance-score-approved.json',import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
const current=load('src/lib/risk.ts');
const source=readFileSync('src/lib/risk.ts','utf8');
const before={exports:{}};
new Function('module','exports',ts.transpileModule(restore('src/lib/risk.ts',source),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(before,before.exports);

test('only declared score seams change; original monetary/rule/owner calculations stay exact',()=>{
 for(const[file,record]of Object.entries(approved)) assert.equal(sha(restore(file,readFileSync(file,'utf8'))),record.sha256,file);
 for(const[from,to]of [['sum + trade.pnl','sum + trade.pnl + 1'],['if (existingAccount !== incomingAccount)','if (false)'],['policy.balance','policy.recovery']]){
  assert(source.includes(from),'mutation target exists');const altered=source.replace(from,to);
  assert.throws(()=>assert.equal(sha(restore('src/lib/risk.ts',altered)),approved['src/lib/risk.ts'].sha256),'Unrelated accounting, account or formula changes cannot hide in the adapter');
 }
});
test('all non-score analytics and limits equal the pre-change engine across deterministic histories',()=>{
 const omit=new Set(['score','performanceScore','scoreFactors','evidenceQuality','nextSessionBrief']);
 const project=a=>Object.fromEntries(Object.entries(a).filter(([k])=>!omit.has(k)));
 let seed=173;
 for(let k=0;k<100;k++){
  const rows=Array.from({length:k%37},(_,i)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return {...current.sampleTrades[i%current.sampleTrades.length],id:`manual-qa-${i}`,date:new Date(Date.UTC(2026,0,1+Math.floor(i/3))).toISOString().slice(0,10),pnl:(seed%200001-100000)/100,manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}};});
  for(const rules of [current.defaultRules,[]]){
   const held=structuredClone(rows);const a=current.analyze(rows,rules),b=before.exports.analyze(rows,rules);
   assert.deepEqual(project(a),project(b));assert.deepEqual(rows,held);
   assert.equal(a.score,current.calculatePerformanceScore(rows).score);
   if(b.nextSessionBrief.status==='locked')assert.equal(a.nextSessionBrief.status,'locked','Critical warnings must survive');
  }
 }
});
test('the same score is shared by analysis and Passport, and null stays unavailable',()=>{
 const {buildHoloPassportModel}=load('src/lib/passportHolo.ts');
 for(const rows of [[],current.sampleTrades,current.sampleTrades.map(t=>({...t,id:'untyped-'+t.id}))]){
  const a=current.analyze(rows,[]);
  for(const mode of ['discipline','coach'])assert.equal(buildHoloPassportModel(a,'Unranked',mode,false).heroValue,a.score===null?'—':String(a.score));
 }
});
