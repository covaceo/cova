import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import load from './helpers/load-ts.cjs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
test('Risk Desk exposes a separate session recap action without replacing Passport',()=>{
 const {Dashboard}=load('src/components/DashboardView.tsx');const {analyze}=load('src/lib/risk.ts');
 const html=renderToStaticMarkup(React.createElement(Dashboard,{analysis:analyze([row(10,11,10)],[]),rules:[],go:()=>{},journalReview:false}));assert.match(html,/Share recap/);
});
const model=()=>{assert.ok(existsSync('src/lib/sessionRecap.ts'),'Session recap model must exist');return load('src/lib/sessionRecap.ts')};
const row=(open,close,pnl,openedAt='2026-09-18T14:00:00.000Z',closedAt='2026-09-18T14:10:00.000Z')=>({id:`tradovate-7:${open}:${close}`,date:closedAt.slice(0,10),market:'MNQ',side:'Long',contracts:1,entry:20000,exit:20001,pnl,risk:10,setup:'',notes:'',source:{provider:'Tradovate',accountId:'7',pnlBasis:'gross_before_fees',timeZone:'UTC',openedAt,closedAt}});
test('recap combines partial exits before deriving session results and never invents net fees',()=>{
 const trades=[row(10,11,250),row(10,12,-50),row(20,21,-80),row(30,31,160),row(40,41,360)];const original=structuredClone(trades);
 const result=model().buildSessionRecaps(trades);assert.equal(result.error,'');
 const recap=result.options.find(r=>r.kind==='new-york');assert(recap);assert.equal(recap.totalCents,'64000');assert.equal(recap.count,4);assert.equal(recap.wins,3);assert.equal(recap.winRate,'75%');assert.equal(recap.basis,'Gross P&L · before fees');assert.equal(recap.countLabel,'Trade entries');assert.deepEqual(trades,original);
});
test('recaps fail closed on unsupported money, account mixing, duplicate IDs and sample contamination',()=>{
 const real=row(10,11,10);
 const bad=[[{...real,pnl:0.001}],[real,real],[{...real,source:undefined}],[real,{...row(20,21,20),source:{...real.source,accountId:'8'}}],[real,{...real,id:'demo-1'}],[{...real,source:{provider:'Rithmic',accountId:'7',accountKey:'7',currency:'EUR'}}]];
 for(const trades of bad){const result=model().buildSessionRecaps(trades);assert.equal(result.options.length,0);assert.ok(result.error);}
});
test('invalid or incomplete timestamp evidence cannot become a session or invented midnight',()=>{
 const base=row(10,11,10);
 for(const source of [{...base.source,openedAt:undefined},{...base.source,closedAt:'garbage'},{...base.source,timeZone:undefined},{...base.source,openedAt:base.source.closedAt,closedAt:base.source.openedAt}]){
  const result=model().buildSessionRecaps([{...base,source}]);assert.equal(result.options.length,0);assert.ok(result.error);
 }
});

test('dated regional windows respect US/UK DST changes and half-open boundaries',()=>{
 const session=model().recapSessionAt;
 for(const[at,kind]of [['2026-03-06T14:29:59.999Z','london'],['2026-03-06T14:30:00.000Z','new-york'],['2026-03-09T13:30:00.000Z','new-york'],['2026-03-27T07:30:00.000Z','asia'],['2026-03-30T07:30:00.000Z','london'],['2026-09-18T00:00:00.000Z','asia'],['2026-09-18T07:00:00.000Z','london'],['2026-09-18T13:30:00.000Z','new-york']])assert.equal(session(at)?.kind,kind,at);
 assert.equal(session('2026-09-18T20:00:00.000Z'),null);assert.equal(session('bad'),null);
 assert.notEqual(session('2026-09-17T14:00:00.000Z').date,session('2026-09-18T14:00:00.000Z').date);
});
test('whole partial-exit groups crossing windows/days appear only in the final-date daily recap',()=>{
 const trades=[row(10,11,100,'2026-09-18T12:00:00.000Z','2026-09-18T13:00:00.000Z'),row(10,12,-20,'2026-09-18T12:00:00.000Z','2026-09-19T14:00:00.000Z')];
 const result=model().buildSessionRecaps(trades);assert.equal(result.error,'');assert.equal(result.options.length,1);const recap=result.options[0];assert.equal(recap.kind,'daily');assert.equal(recap.date,'2026-09-19');assert.equal(recap.totalCents,'8000');assert.equal(recap.count,1);
});
test('date-only USD imports stay daily and disclose reported money; unknown currencies block sharing',()=>{
 const base=row(10,11,0);const result=model().buildSessionRecaps([{...base,source:{provider:'Rithmic',accountId:'7',accountKey:'7',currency:'USD'}}]);assert.equal(result.options.length,1);assert.equal(result.options[0].kind,'daily');assert.equal(result.options[0].windowLabel,'Reported date');assert.equal(result.options[0].basis,'Reported P&L · fees unconfirmed');assert.equal(result.options[0].winRate,'0%');assert.equal(result.options[0].countLabel,'Reported trades');
 assert.equal(model().buildSessionRecaps([{...base,source:{provider:'Rithmic',accountId:'7'}}]).options.length,0);
});
test('a nearly perfect entry win rate never rounds a losing record to 100%',()=>{
 const rows=Array.from({length:1000},(_,i)=>({...row(i*2+1,i*2+2,i===0?-1:1),id:'demo-'+i,source:undefined}));assert.equal(model().buildSessionRecaps(rows).options[0].winRate,'99.9%');
});
test('pure sample provenance survives the model and large/loss/zero money is exact',()=>{
 const result=model().buildSessionRecaps([{...row(10,11,-0.01),id:'demo-1',source:undefined}]);assert.equal(result.options[0].sample,true);assert.equal(model().recapMoney('-1'),'−$0.01');assert.equal(model().recapMoney('0'),'$0.00');assert.equal(model().recapMoney('1234567890123'),'+$12,345,678,901.23');assert.equal(model().buildSessionRecaps([]).options.length,0);
});
