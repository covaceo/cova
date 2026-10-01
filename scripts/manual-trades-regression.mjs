import {createRequire} from 'node:module';const loadTypeScript=()=>createRequire(import.meta.url)('typescript');
import test from 'node:test';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';import load from './helpers/load-ts.cjs';
const {appendManualTrade,removeManualTrade}=load('src/lib/manualTrades.ts');
const {sampleTrades}=load('src/lib/risk.ts');const {tradeAccountKey}=load('src/lib/tradovateHistory.ts');
const owner={identity:'owner-a',authGeneration:1,identityGeneration:1};
const draft={date:'2026-09-18',market:'MNQ',side:'Long',contracts:'2',entry:'20000.25',exit:'20010.25',pnl:'40.01',risk:'',setup:'Retest',notes:'Missed by import'};
const broker={...sampleTrades[0],id:'broker-original',source:{provider:'Tradovate',accountId:'71',pnlBasis:'gross_before_fees',timeZone:'UTC'}};
test('manual entry belongs to selected account without impersonating a broker record',()=>{
 const before=JSON.stringify(broker);const r=appendManualTrade([broker],draft,'Tradovate:71',100,owner,owner,true);assert.equal(r.error,null);assert.equal(r.trades.length,2);const m=r.trades[1];assert.equal(m.source,undefined);assert.equal(m.manual.currency,'USD');assert.equal(m.manual.pnlBasis,'reported_net');assert.equal(tradeAccountKey(m),'Tradovate:71');assert.equal(m.pnl,40.01);assert.equal(JSON.stringify(broker),before);
 assert(removeManualTrade(r.trades,m.id,owner,owner,true));assert.equal(removeManualTrade(r.trades,broker.id,owner,owner,true),null);
});
test('manual writes reject stale identities, account changes, invalid amounts, capacity and duplicates',()=>{
 for(const [d,a,max,who,current]of [[draft,'Tradovate:71',100,null,true],[draft,'Tradovate:71',100,{...owner,identity:'other'},true],[draft,'Tradovate:71',100,owner,false],[draft,'Tradovate:99',100,owner,true],[draft,'Tradovate:71',1,owner,true],[{...draft,pnl:'1.001'},'Tradovate:71',100,owner,true],[{...draft,date:'2026-02-30'},'Tradovate:71',100,owner,true],[{...draft,contracts:'1.5'},'Tradovate:71',100,owner,true],[{...draft,entry:''},'Tradovate:71',100,owner,true]])assert(appendManualTrade([broker],d,a,max,owner,who,current).error);
 const first=appendManualTrade([broker],draft,'Tradovate:71',100,owner,owner,true);assert(appendManualTrade(first.trades,draft,'Tradovate:71',100,owner,owner,true).error);
});

test('confirm existing manual net changes only exact selected rows and rejects stale scope or evidence',()=>{
 const {confirmManualNet}=load('src/lib/manualTrades.ts');
 const a={...appendManualTrade([broker],draft,'Tradovate:71',100,owner,owner,true).trades.at(-1),id:'manual-confirm-a'};a.manual={...a.manual,pnlBasis:'gross_before_fees'};
 const b={...a,id:'manual-confirm-b',pnl:1101.57},otherDay={...a,id:'manual-other-date',date:'2026-09-17'},otherAccount={...a,id:'manual-other-account',manual:{...a.manual,accountKey:'local'}},alreadyNet={...a,id:'manual-already-net',manual:{...a.manual,pnlBasis:'reported_net'}};
 const csv={...a,id:'csv-import',manual:undefined,source:{provider:'Rithmic',accountId:'71',accountKey:'fixture',currency:'USD'}};
 const rows=[broker,a,b,otherDay,otherAccount,alreadyNet,csv],before=JSON.stringify(rows),expected=[structuredClone(a),structuredClone(b)];
 const result=confirmManualNet(rows,expected,'Tradovate:71',owner,owner,true);assert.equal(result.error,null);assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(result.trades,rows.map(r=>r===a||r===b?{...r,manual:{...r.manual,pnlBasis:'reported_net'}}:r));assert.equal(result.trades[1].pnl+result.trades[2].pnl,1141.58);
 for(const [history,snapshot,account,current,selection] of [[rows,expected,'all',owner,true],[rows,expected,'local',owner,true],[rows,expected,'Tradovate:71',{...owner,identity:'other'},true],[rows,expected,'Tradovate:71',owner,false],[rows,[a,a],'Tradovate:71',owner,true],[rows,[broker],'Tradovate:71',owner,true],[rows,[csv],'Tradovate:71',owner,true],[rows,expected,'Tradovate:71',{...owner,authGeneration:2},true],[rows,[alreadyNet],'Tradovate:71',owner,true],[rows,[otherAccount],'Tradovate:71',owner,true],[rows.map(r=>r===a?{...r,pnl:99}:r),expected,'Tradovate:71',owner,true],[rows.filter(r=>r!==a),expected,'Tradovate:71',owner,true]]){
  const rejected=confirmManualNet(history,snapshot,account,owner,current,selection);assert(rejected.error);assert.equal(rejected.trades,history);
 }
});

test('actual App confirmation cannot overwrite a concurrent ledger edit',()=>{
 const {persistManualNetConfirmation,resolveManualNetConfirmations}=load('src/lib/manualNetConfirmation.ts');
 const {confirmManualNet}=load('src/lib/manualTrades.ts');
 const {default:ts}= {default:loadTypeScript()};
 const app=readFileSync('src/App.tsx','utf8'),block=app.slice(app.indexOf('function confirmManualNetRows'),app.indexOf('function deleteManualTrade'));
 const code=ts.transpileModule(block,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const a={...appendManualTrade([broker],draft,'Tradovate:71',100,owner,owner,true).trades.at(-1),id:'manual-a',pnl:500};a.manual={...a.manual,pnlBasis:'gross_before_fees'};
 const b={...a,id:'manual-b',pnl:641.58},c={...a,id:'manual-c',date:'2026-09-17',pnl:77};
 for(const scenario of ['unrelated','target','partial-failure','success']){
  const rows=[a,b,c],key='ledger:owner-a',map=new Map([['cova-active-storage-identity-v1','owner-a'],[key,JSON.stringify({trades:rows,rules:[],tradeAccount:'Tradovate:71'})]]);
  let writes=0,ledgerWrites=0;
  global.localStorage={get length(){return map.size},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,removeItem:k=>map.delete(k),setItem:(k,v)=>{
   if(k===key)ledgerWrites++;
   if(k.startsWith('cova-manual-net-v1:')){
    writes++;
    if(writes===1&&['target','unrelated'].includes(scenario))map.set(key,JSON.stringify({trades:rows.map(t=>t.id===(scenario==='target'?a.id:c.id)?{...t,pnl:88}:t),rules:[],tradeAccount:'Tradovate:71'}));
    if(writes===2&&scenario==='partial-failure')throw Error('quota');
   }
   map.set(k,v);
  }};
  const invoke=new Function('tradeAccount','tradesRef','dashboardPrincipal','getCurrentImportPrincipal','dashboardSelectionCurrent','confirmManualNet','persistManualNetConfirmation','scopedStorageKey','STORAGE_KEY','announce',code+';return confirmManualNetRows;')('Tradovate:71',{current:rows},owner,()=>owner,()=>true,confirmManualNet,persistManualNetConfirmation,()=>key,key,()=>{});
  const error=invoke(structuredClone([a,b]),'Tradovate:71');
  assert.equal(ledgerWrites,0);assert.equal(rows[2].pnl,77);
  const saved=JSON.parse(map.get(key)).trades,effective=resolveManualNetConfirmations(saved,'owner-a');
  if(scenario==='unrelated'){assert.equal(error,null);assert.equal(saved[2].pnl,88);assert.equal(effective[0].manual.pnlBasis,'reported_net');}
  if(scenario==='target'){assert(error);assert.equal(saved[0].pnl,88);assert.equal(effective[0].manual.pnlBasis,'gross_before_fees');assert.equal(resolveManualNetConfirmations(rows,'owner-a')[0].manual.pnlBasis,'gross_before_fees');}
  if(scenario==='partial-failure'){assert(error);assert(effective.every(t=>t.manual.pnlBasis==='gross_before_fees'));}
  if(scenario==='success'){
   assert.equal(error,null);assert.deepEqual(saved,rows);assert.equal(effective[1].manual.pnlBasis,'reported_net');
   map.set(key,JSON.stringify({trades:rows.map(t=>t.id===a.id?{...t,notes:'concurrent note'}:t)}));
   assert.equal(resolveManualNetConfirmations(rows,'owner-a')[0].manual.pnlBasis,'gross_before_fees');
   map.set('cova-active-storage-identity-v1','other');assert.deepEqual(resolveManualNetConfirmations(rows,'owner-a'),rows);
  }
 }
 delete global.localStorage;
});

test('confirmation metadata is optional: quota reclamation preserves ledger and invalidates confirmation',()=>{
 const {persistTradingLedger}=load('src/lib/recapVerification.ts');
 const {persistManualNetConfirmation,resolveManualNetConfirmations}=load('src/lib/manualNetConfirmation.ts');
 const a={...appendManualTrade([broker],draft,'Tradovate:71',100,owner,owner,true).trades.at(-1),id:'manual-quota'};a.manual={...a.manual,pnlBasis:'gross_before_fees'};
 const key='ledger:owner-a',map=new Map([['cova-active-storage-identity-v1','owner-a'],[key,JSON.stringify({trades:[a]})]]);
 global.localStorage={get length(){return map.size},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,removeItem:k=>map.delete(k),setItem:(k,v)=>{if(k===key&&[...map.keys()].some(n=>n.startsWith('cova-manual-net-v1:')))throw Error('quota');map.set(k,v)}};
 assert.equal(persistManualNetConfirmation('owner-a','Tradovate:71',[a],key),null);
 assert.equal(resolveManualNetConfirmations([a],'owner-a')[0].manual.pnlBasis,'reported_net');
 assert.equal(persistTradingLedger(key,JSON.stringify({trades:[{...a,pnl:88}]})),true);
 assert.equal(JSON.parse(map.get(key)).trades[0].pnl,88);
 assert.equal(resolveManualNetConfirmations([a],'owner-a')[0].manual.pnlBasis,'gross_before_fees');
 assert(persistManualNetConfirmation('owner-a','Tradovate:71',[a],key));
 delete global.localStorage;
});
