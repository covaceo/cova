import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import load from './helpers/load-ts.cjs';
const { readAccountNames, rememberAccountNames, accountDisplayName } = load('src/lib/accountNames.ts');
function storage() { const data=new Map(); return {get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),clear:()=>data.clear()}; }
function reset() {globalThis.localStorage=storage();globalThis.sessionStorage=storage();globalThis.window=new EventTarget();}

test('Rithmic completion retains the actual account name under its composite identity', async()=>{
  reset();
  const text=readFileSync('src/components/ImportDesk.tsx','utf8');
  const source=text.slice(text.indexOf('  async function syncRithmic('),text.indexOf('  async function startTradovateConnect('));
  const data={account:{accountKey:'a'.repeat(32),accountId:'A-1',accountName:'Funded Alpha'},counts:{trades:0}};
  let current=true;
  const dependencies={prepareImportCsv:()=>({scopeKey:'owner-a',isCurrent:()=>current}),rithmicRequestRef:{current:null},rithmicRequestGenerationRef:{current:0},setRithmicBusy:()=>{},setBrokerNotice:()=>{},authorizedFetch:async()=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}}),writeBrokerStatus:()=>{},setBrokerStatus:()=>{},rememberAccountNames};
  const run=new Function(...Object.keys(dependencies),ts.transpile(source,{target:ts.ScriptTarget.ES2022})+';return syncRithmic;')(...Object.values(dependencies));
  await run({systemName:'Rithmic Paper Trading'});
  assert.equal(accountDisplayName('Rithmic:'+'a'.repeat(32)+':A-1',readAccountNames('owner-a')),'Funded Alpha');
  assert.deepEqual(readAccountNames('owner-b'),{});
  localStorage.clear();current=false;await run({systemName:'Rithmic Paper Trading'});
  assert.deepEqual(readAccountNames('owner-a'),{},'A stale completion cannot write names');
});

test('broker names recover from owner-bound history and persist independently of the session',()=>{
  reset();
  const seed=(owner,id,name)=>sessionStorage.setItem('cova-history-summary:'+JSON.stringify([owner,'connection']),JSON.stringify({accounts:[{account:{id,name}}]}));
  seed('owner-a','71','FFF100071');seed('owner-b','71','Another owner');
  assert.equal(readAccountNames('owner-a')['Tradovate:71'],'FFF100071');
  rememberAccountNames('owner-a',{});sessionStorage.clear();
  assert.equal(accountDisplayName('Tradovate:71',readAccountNames('owner-a')),'FFF100071');
  assert.deepEqual(readAccountNames('owner-b'),{});
  rememberAccountNames('owner-a',{'Tradovate:72':'Any broker name','Tradovate:71':'Renamed account'});
  assert.equal(readAccountNames('owner-a')['Tradovate:71'],'Renamed account');
  assert.equal(readAccountNames('owner-a')['Tradovate:72'],'Any broker name');
});

test('names never replace stable selection keys and invalid/missing metadata stays truthful',()=>{
  reset();rememberAccountNames('owner-a',{'Tradovate:71':'','Tradovate:72':'bad\nname','bogus':'FFF invented'});
  assert.deepEqual(readAccountNames('owner-a'),{});
  assert.equal(accountDisplayName('Tradovate:71',{}),'Account 71');
  assert.equal(accountDisplayName('Rithmic:'+'a'.repeat(32)+':A-1',{}),'A-1');
  assert.equal(accountDisplayName('all',{}),'All accounts');
  assert.equal(accountDisplayName('local',{}),'CSV / local history');
});
