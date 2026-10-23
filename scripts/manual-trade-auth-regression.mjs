import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {withoutManualTradeAuth} from './helpers/approved-manual-trade-auth.mjs';
const {ManualTradeAuth}=load('src/lib/manualTradeAuth.ts');
const {isImportPrincipalCurrent}=load('src/lib/importGuard.ts');
const a={identity:'owner-a',authGeneration:1,identityGeneration:1};
const next={...a,authGeneration:2};
test('open manual trade follows verified refreshes in the same provider session only',()=>{
 const guard=new ManualTradeAuth(),opened=guard.capture(a);
 guard.refresh(a,next,'session-a','session-a');
 assert.equal(isImportPrincipalCurrent(opened.current,next),true);
 assert.equal(guard.capture(next),opened);
 const third={...next,authGeneration:3};guard.refresh(next,third,'session-a','session-a');
 assert.equal(isImportPrincipalCurrent(opened.current,third),true);
 assert.equal(a.authGeneration,1,'Do not mutate other action principals');
});
test('manual scope does not renew across owner/session changes, logout gaps, or ABA generations',()=>{
 for(const [prior,current,oldSession,newSession]of [
  [a,{...next,identity:'owner-b'},'session-a','session-a'],
  [a,{...next,identityGeneration:3},'session-a','session-a'],
  [a,next,'session-a','session-b'],[a,next,'',''],[a,next,null,'session-a'],
  [next,{...next,authGeneration:3},'session-a','session-a'],
  [a,{...next,authGeneration:4},'session-a','session-a'],
 ]){
  const guard=new ManualTradeAuth(),opened=guard.capture(a);guard.refresh(prior,current,oldSession,newSession);
  assert.deepEqual(opened.current,a);assert.equal(isImportPrincipalCurrent(opened.current,current),false);
 }
});
test('rendering a new principal cannot promote an older open scope',()=>{
 const guard=new ManualTradeAuth(),opened=guard.capture(a),newScope=guard.capture(next);
 assert.notEqual(opened,newScope);guard.refresh(next,{...next,authGeneration:3},'session-a','session-a');
 assert.deepEqual(opened.current,a);assert.equal(newScope.current.authGeneration,3);
 assert.equal(guard.capture(null).current,null);
});

test('authorized App exception cannot mask changed selection or monetary validation',()=>{
 const app=readFileSync('src/App.tsx','utf8');
 assert.equal(createHash('sha256').update(withoutManualTradeAuth(app)).digest('hex'),'b8f439d0a547077d0c37b8360d6695e9a04d0d90de003ec3cdf2b40e1389b8bf');
 for(const [before,after] of [['dashboardSelectionCurrent(),tradeAccounts','true,tradeAccounts'],['getCurrentImportPrincipal(),dashboardSelectionCurrent()','manualTradePrincipal.current,dashboardSelectionCurrent()']]){
  assert(app.includes(before));assert.throws(()=>withoutManualTradeAuth(app.replace(before,after)));
 }
 const {appendManualTrade}=load('src/lib/manualTrades.ts'),{HistorySelectionEpoch}=load('src/lib/tradovateHistory.ts');
 const guard=new ManualTradeAuth(),opened=guard.capture(a),selection=new HistorySelectionEpoch(),selected=selection.capture();
 const draft={date:'2026-10-06',market:'BTC',side:'Long',contracts:'1',entry:'60000',exit:'60100',pnl:'60',risk:'',setup:'',notes:''};
 guard.refresh(a,next,'s','s');selection.change();selection.change();
 assert.equal(appendManualTrade([],draft,'local',100,opened.current,next,selected()).error,'Account changed. Reopen Add trade.');
 assert.equal(appendManualTrade([],draft,'local',100,opened.current,null,true).error,'Account changed. Reopen Add trade.');
});
