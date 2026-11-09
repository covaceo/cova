import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import load from './helpers/load-ts.cjs';
const D=load('src/lib/askCovaData.ts'),Q=load('src/lib/askCovaQuery.ts'),A=load('src/lib/askCovaQueryAnswer.ts');
const owner='11111111-1111-4111-8111-111111111111',stamp='2026-10-30T15:00:00Z';
const record=(id,pnl,market,date)=>({kind:'trade',recordId:'manual-'+id,accountId:'local',schemaVersion:1,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null,payload:{id:'manual-'+id,date,market,side:'Long',contracts:1,entry:100,exit:101,pnl,risk:0,setup:'synthetic setup',notes:'synthetic note',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}}});
const snapshot={version:'ask-cova-data-v1',owner,workspaceRevision:1,workspaceRecords:[record('a',10,'NQ','2026-10-29'),record('b',-5,'NQ','2026-10-30'),record('c',40,'ES','2026-10-30')],passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}};
const aggregate=(groupBy,measures,orderBy=[],where=[])=>({version:'ask-cova-query-plan-v1',decision:{kind:'query',queries:[{id:'answer',op:'aggregate',source:'trades',where,groupBy,measures,orderBy,mode:'complete',limit:20}]}});
test('actual screenshot messages bind contexts; synthetic generic plans have native browser-target ESM replay parity',async()=>{
 const code=['askCovaData','askCovaQuery','askCovaQueryAnswer'].map(name=>'export * from '+JSON.stringify(process.cwd().split(String.fromCharCode(92)).join('/')+'/src/lib/'+name+'.ts')+';').join('');
 assert.ok(process.env.TMPDIR,'Hermes scratch TMPDIR required');const directory=mkdtempSync(join(process.env.TMPDIR,'cova-core-')),entry=join(directory,'entry.ts');writeFileSync(entry,code);
 let output;try{output=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,target:'es2022',lib:{entry,formats:['es'],fileName:'core'}}});}finally{rmSync(directory,{recursive:true,force:true});}
 const chunk=(Array.isArray(output)?output:[output]).flatMap(x=>x.output).find(x=>x.type==='chunk');assert.ok(chunk);
 const esm=await import('data:text/javascript;base64,'+Buffer.from(chunk.code).toString('base64'));
 const cases=[['how many trades have i won',aggregate([],[{id:'wins',op:'count',field:null}],[],[[{field:'outcome',op:'eq',value:{type:'text',value:'win'}}]])],['whats my win rate bro lol',aggregate([],[{id:'rate',op:'win_rate',field:'reported_pnl'}])],['what days am i most profitable',aggregate(['recorded_weekday'],[{id:'profit',op:'sum',field:'reported_pnl'}],[{key:'profit',direction:'desc'}])],...['whats my most traded asset','whats my most traded symbol'].map(message=>[message,aggregate(['market'],[{id:'frequency',op:'count',field:null}],[{key:'frequency',direction:'desc'}])])];
 const digests=[];for(const [message,plan] of cases){const input={snapshot,account:'local',range:'all',conversation:{message,history:[]}};const source=await D.buildAskCovaDataContext(input),browser=await esm.buildAskCovaDataContext(input);assert.equal(source.contextDigest,browser.contextDigest);digests.push(source.contextDigest);const r=await Q.executeAskCovaQuery(source,plan),replay=await esm.executeAskCovaQuery(browser,plan);assert.deepEqual(r,replay);const fact=r.observations[0].facts[0],answer={version:'ask-cova-answer-v2',paragraphs:[{text:`saved result: {{f:${fact}}}`,evidence:[r.observations[0].id]}],detail:[]};assert.deepEqual(A.renderAskCovaQueryAnswer(r,answer),esm.renderAskCovaQueryAnswer(replay,answer));}
 assert.equal(new Set(digests).size,cases.length);
 console.log(JSON.stringify({synthetic:true,actualProviderRequests:0,messages:cases.map(c=>c[0]),browserTargetBundleExecutedIn:'Node ESM, not DOM',cases:cases.length}));
});
