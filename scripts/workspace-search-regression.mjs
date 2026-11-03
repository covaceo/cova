import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import load from './helpers/load-ts.cjs';
const source = fileURLToPath(new URL('../src/lib/workspaceSearch.ts', import.meta.url));
const api = existsSync(source) ? load(source) : {};
const row = (overrides={}) => ({id:'one',date:'2026-10-30',market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl:0,risk:0,setup:'Café pullback',notes:'Patient entry 東京; waited for confirmation.',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'},...overrides});
const snapshot = (overrides={}) => ({owner:'owner-a',trades:[row()],names:{local:'Morning account'},journals:[{account:'local',date:'2026-10-29',note:'Review patience before the open.',tradeId:null}],...overrides});
test('searches real pages, trade notes and daily notes across loaded accounts', () => {
  assert.equal(typeof api.buildWorkspaceSearchIndex,'function','Workspace search index must exist, not just navigation filtering');
  const index=api.buildWorkspaceSearchIndex(snapshot(),'owner-a');
  assert.equal(api.searchWorkspace(index,'patient')[0].trade.id,'one');
  assert.equal(api.searchWorkspace(index,'patience')[0].journal.date,'2026-10-29');
  assert.equal(api.searchWorkspace(index,'analytics')[0].section,'coach');
  assert.equal(api.searchWorkspace(index,'risk desk')[0].section,'dashboard');
});
test('owner mismatch and absent owner fail closed, including pages', () => {
  assert.deepEqual(api.buildWorkspaceSearchIndex(snapshot(),'owner-b'),[]);
  assert.deepEqual(api.buildWorkspaceSearchIndex(snapshot({owner:''}),''),[]);
  assert.deepEqual(api.buildWorkspaceSearchIndex(snapshot({owner:'  '}),'  '),[]);
});
test('Unicode normalization, case, whitespace and AND tokens match without truncating the query', () => {
  const index=api.buildWorkspaceSearchIndex(snapshot(),'owner-a');
  for(const query of ['  CAFÉ  NQ\n東京 ', 'cafe\u0301 nq', 'ＣＡＦÉ NQ', 'confirmation patient']) assert.equal(api.searchWorkspace(index,query)[0]?.trade?.id,'one',query);
  assert.equal(api.searchWorkspace(index,'NQ absent').length,0);
  assert.equal(api.searchWorkspace(index,'NQ '.repeat(10000)+'absent').length,0);
  assert(api.searchWorkspace(index,'  ').every(item=>item.kind==='Page'));
});
test('exact page names rank above notes and aliases lead to actual routes', () => {
  const index=api.buildWorkspaceSearchIndex(snapshot({trades:[row({notes:'Limits Insights Risk Desk'})]}),'owner-a');
  for(const [query,route] of [['limits','rules'],['insights','coach'],['csv','import'],['journal','dashboard'],['proof','passport']]) assert.equal(api.searchWorkspace(index,query)[0]?.section,route);
});
test('identical duplicate IDs dedupe; conflicting same-account rows remain individually inspectable', () => {
  const a=row(), b=row({manual:{...a.manual,accountKey:'Manual:second'}});
  const index=api.buildWorkspaceSearchIndex(snapshot({trades:[a,{...a},b]}),'owner-a');
  assert.equal(api.searchWorkspace(index,'patient').length,2);
  assert.equal(new Set(index.map(x=>x.key)).size,index.length);
  const conflict=api.buildWorkspaceSearchIndex(snapshot({trades:[a,row({notes:'different'})]}),'owner-a').filter(x=>x.kind==='Trade');
  assert.equal(conflict.length,2,'Read-only search must not silently hide conflicting rows');
  assert.equal(new Set(conflict.map(x=>x.key)).size,2);
  assert.deepEqual(conflict.map(x=>x.trade.notes),[a.notes,'different']);
});
test('search returns every matching row beyond the initial UI page and rebuild reflects mutations', () => {
  const trades=Array.from({length:125},(_,i)=>row({id:`r${i}`}));
  const index=api.buildWorkspaceSearchIndex(snapshot({trades}),'owner-a');
  assert.equal(api.searchWorkspace(index,'patient').length,125);
  const updated=api.buildWorkspaceSearchIndex(snapshot({trades:[row({notes:'revised'})],journals:[]}),'owner-a');
  assert.equal(api.searchWorkspace(updated,'patient').length,0);
  assert.equal(api.searchWorkspace(updated,'revised').length,1);
  assert.equal(api.searchWorkspace(updated,'patience').length,0);
});
test('detail money preserves zero, missing risk, EUR and unknown currency without aggregates', () => {
  assert.equal(typeof api.tradeSearchFields,'function');
  const fields=Object.fromEntries(api.tradeSearchFields(row()));
  assert.equal(fields['Gross / reported P&L'],'$0.00');
  assert.equal(fields['Planned risk'],'—');
  assert.equal(fields['Entry'],'100');
  assert.equal(fields['Notes'],row().notes);
  const eur=Object.fromEntries(api.tradeSearchFields(row({manual:undefined,source:{provider:'Rithmic',accountKey:'eur',accountId:'1',currency:'EUR'},pnl:12.5,risk:10})));
  assert.match(eur['Gross / reported P&L'],/12.50.*EUR/);
  assert.match(eur['Planned risk'],/10.00.*EUR/);
  const unknown=Object.fromEntries(api.tradeSearchFields(row({manual:undefined,pnl:0,entry:NaN})));
  assert.match(unknown['Gross / reported P&L'],/0.00.*currency unknown/);
  assert.equal(unknown.Entry,'—');
});
test('50k loaded trades remain fully searchable within a conservative local performance budget', () => {
  const start=performance.now();
  const index=api.buildWorkspaceSearchIndex(snapshot({trades:Array.from({length:50000},(_,i)=>row({id:`perf-${i}`}))}),'owner-a');
  const built=performance.now();
  assert.equal(api.searchWorkspace(index,'patient nq').length,50000);
  const end=performance.now();
  console.log(JSON.stringify({performance:{rows:50000,indexMs:built-start,queryMs:end-built}}));
  assert(built-start<5000,'index <5s');assert(end-built<1500,'query <1.5s');
});
test('journal discovery includes note-only accounts and all-account notes but never another owner', () => {
  assert.equal(typeof api.readWorkspaceSearchJournals,'function');
  const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,key:i=>[...values.keys()][i]??null,get length(){return values.size}};
  values.set('cova-workspace-aux-v1:owner-a',JSON.stringify({version:1,names:{},cash:{},notes:{'Manual:notes-only':{'2026-10-30':{note:'orphan note',tradeId:null}},all:{'2026-10-29':{note:'all notes',tradeId:null}}}}));
  values.set('cova-workspace-aux-v1:owner-b',JSON.stringify({version:1,names:{},cash:{},notes:{local:{'2026-10-30':{note:'foreign secret',tradeId:null}}}}));
  assert.deepEqual(api.readWorkspaceSearchJournals('owner-a',[]).map(x=>x.note).sort(),['all notes','orphan note']);
  values.delete('cova-workspace-aux-v1:owner-a');
  values.set('cova-daily-journal-v1:legacy:owner-a',JSON.stringify({'2026-10-28':'old note'}));
  values.set('cova-daily-journal-v1:legacy:owner-b',JSON.stringify({'2026-10-28':'foreign secret'}));
  assert.deepEqual(api.readWorkspaceSearchJournals('owner-a',[]).map(x=>x.note),['old note']);
  delete globalThis.localStorage;
});
export {row,snapshot};
