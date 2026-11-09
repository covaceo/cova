import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
import {build} from 'vite';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
const D=load('src/lib/askCovaData.ts'),Q=load('src/lib/askCovaQuery.ts'),A=load('src/lib/askCovaQueryAnswer.ts');
const stamp='2026-10-30T10:00:00Z';
const row=(id,pnl)=>({kind:'trade',recordId:'manual-'+id,accountId:'local',schemaVersion:1,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null,payload:{id:'manual-'+id,date:'2026-10-30',market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl,risk:0,setup:'USD$ is a literal saved label',notes:'USD',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}}});
async function nativeCore(){
 assert.ok(process.env.TMPDIR,'Hermes scratch required');const dir=mkdtempSync(join(process.env.TMPDIR,'cova-currency-native-')),entry=join(dir,'entry.ts');
 writeFileSync(entry,['askCovaData','askCovaQuery','askCovaQueryAnswer'].map(name=>'export * from '+JSON.stringify(process.cwd().replaceAll('\\','/')+'/src/lib/'+name+'.ts')+';').join('\n'));
 try{const built=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,target:'es2022',lib:{entry,formats:['es'],fileName:'core'}}});const chunk=(Array.isArray(built)?built:[built]).flatMap(x=>x.output).find(x=>x.type==='chunk');assert.ok(chunk);return import('data:text/javascript;base64,'+Buffer.from(chunk.code).toString('base64'));}finally{rmSync(dir,{recursive:true,force:true});}
}
test('source and native v4 issued USD atoms keep approved leading dollar only including negative zero and large amounts',async t=>{
 const native=await nativeCore();
 for(const [name,api] of [['source',{...D,...Q,...A}],['native',native]])await t.test(name,async()=>{
 for(const [amount,expected] of [[12.34,'$12.34'],[-12.34,'−$12.34'],[0,'$0.00'],[90071992547409.9,'$90071992547409.90']]){
  const snapshot={version:'ask-cova-data-v1',owner:'11111111-1111-4111-8111-111111111111',workspaceRevision:1,workspaceRecords:[row('one',amount)],passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}};
  const c=await api.buildAskCovaDataContext({snapshot,account:'local',range:'all',conversation:{message:'what is my result',history:[]}});
  const result=await api.executeAskCovaQuery(c,{version:'ask-cova-query-plan-v1',decision:{kind:'query',queries:[{id:'money',op:'rows',source:'trades',where:[],fields:['reported_pnl','setup_text'],orderBy:[],mode:'complete',limit:20}]}});
  const money=result.cells.find(c=>c.field==='reported_pnl'),label=result.cells.find(c=>c.field==='setup_text');
  assert.equal(money.display,expected,'approved USD display');assert.equal(money.currency,'USD');assert.equal(money.basis,'self-reported net');
  const raw={version:'ask-cova-answer-v2',paragraphs:[{text:`Reported result: {{f:${money.id}}}`,evidence:[result.observations[0].id]}],detail:[{text:`Saved label: {{q:${label.id}}}`,evidence:[result.observations[0].id]}]};
  const rendered=api.renderAskCovaQueryAnswer(result,raw);assert.equal(rendered.paragraphs[0],'Reported result: '+expected);assert.equal(rendered.detail[0],'Saved label: USD$ is a literal saved label');assert.ok(api.askCovaQueryHistoryText(result,raw).includes(expected));
  assert.equal(api.askCovaQueryModelPayload(result).data.cells.find(c=>c.id===money.id).display,expected);
 }
 });
});
