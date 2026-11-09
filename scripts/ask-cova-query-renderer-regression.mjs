// SYNTHETIC renderer-preservation tests; no provider or customer data.
import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
const D=load('src/lib/askCovaData.ts'),Q=load('src/lib/askCovaQuery.ts'),A=load('src/lib/askCovaQueryAnswer.ts');
async function result(two=false){
 const owner='11111111-1111-4111-8111-111111111111';
 const snapshot={version:'ask-cova-data-v1',owner,workspaceRevision:0,workspaceRecords:[],passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}};
 const context=await D.buildAskCovaDataContext({snapshot,account:'local',range:'all',conversation:{message:'hello',history:[]}});
 const query=id=>({id,op:'aggregate',source:'trades',where:[],groupBy:[],measures:[{id:'count',op:'count',field:null}],orderBy:[],mode:'complete',limit:1});
 return Q.executeAskCovaQuery(context,{version:'ask-cova-query-plan-v1',decision:two?{kind:'query',queries:[query('first'),query('second')]}:{kind:'converse',reason:'greeting'}});
}
const answer=(text,evidence,detail=[])=>({version:'ask-cova-answer-v2',paragraphs:[{text,evidence}],detail});
test('v4 retains inclusive 160-word main ceiling across both paragraphs',async()=>{
 const r=await result(),e=[r.observations[0].id];
 assert(A.renderAskCovaQueryAnswer(r,answer(Array(160).fill('word').join(' '),e)));
 assert.equal(A.renderAskCovaQueryAnswer(r,answer(Array(161).fill('word').join(' '),e)),null);
 const split=answer(Array(80).fill('word').join(' '),e);split.paragraphs.push({text:Array(81).fill('word').join(' '),evidence:e});
 assert.equal(A.renderAskCovaQueryAnswer(r,split),null);
});
test('v4 retains inclusive 80-word detail ceiling',async()=>{
 const r=await result(),e=[r.observations[0].id];
 assert(A.renderAskCovaQueryAnswer(r,answer('hello.',e,[{text:Array(80).fill('word').join(' '),evidence:e}])));
 assert.equal(A.renderAskCovaQueryAnswer(r,answer('hello.',e,[{text:Array(81).fill('word').join(' '),evidence:e}])),null);
});
test('v4 detail can elaborate main evidence but cannot introduce another observation',async()=>{
 const r=await result(true);assert.equal(r.observations.length,2);
 const first=[r.observations[0].id],second=[r.observations[1].id];
 assert(A.renderAskCovaQueryAnswer(r,answer('checked.',first,[{text:'more context.',evidence:first}])));
 assert.equal(A.renderAskCovaQueryAnswer(r,answer('checked.',first,[{text:'another result.',evidence:second}])),null);
});
