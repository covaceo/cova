import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import load from './helpers/load-ts.cjs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const path='src/lib/tradeAverages.ts';
const average=(...args)=>{assert.ok(existsSync(path),'Trade averages must be implemented');return load(path).tradeAverages(...args);};
const row=(opening,closing,pnl,extra={})=>({id:`tradovate-7:${opening}:${closing}`,date:'2026-09-18',market:'MNQ',side:'Long',contracts:1,entry:20000,exit:20001,pnl,risk:10,setup:'',notes:'',source:{provider:'Tradovate',accountId:'7',pnlBasis:'gross_before_fees',timeZone:'UTC',openedAt:'2026-09-18T14:00:00.000Z',closedAt:'2026-09-18T14:05:00.000Z'},...extra});
test('average results classify combined partial exits, exclude breakevens and round half cents away from zero',()=>{
 const rows=[row(10,11,10.01),row(10,12,-5),row(20,21,10),row(30,31,-4.01),row(40,41,-8),row(50,51,0)];
 const before=structuredClone(rows);
 const result=average(rows);
 assert.equal(result.status,'available');
 assert.equal(result.winnerCents,751n);
 assert.equal(result.loserCents,-601n);
 assert.equal(result.winners,2);assert.equal(result.losers,2);
 assert.deepEqual(rows,before);
});
test('dashboard exposes average winner and loser to the cent with no added default explanation clutter',()=>{
 const {Dashboard}=load('src/components/DashboardView.tsx');
 const {analyze}=load('src/lib/risk.ts');
 const html=renderToStaticMarkup(React.createElement(Dashboard,{analysis:analyze([row(10,11,10.01),row(20,21,-4.01)],[]),rules:[],go:()=>{},journalReview:false}));
 assert.match(html,/data-astra-stat="average-winner"/);
 assert.match(html,/data-astra-stat="average-loser"/);
 assert.match(html,/Average winner/);assert.match(html,/Average loser/);
 assert.match(html,/\+\$10\.01/);assert.match(html,/−\$4\.01/);
 assert.match(html,/data-metric="average-winner"/);assert.match(html,/data-metric="average-loser"/);
 assert.equal((html.match(/data-astra-stat=/g)||[]).length,6);
});
test('missing populations are null, never zero or NaN',()=>{
 for(const rows of [[],[row(1,2,0)]]) {const r=average(rows);assert.equal(r.winnerCents,null);assert.equal(r.loserCents,null);}
 assert.equal(average([row(1,2,1)]).loserCents,null);
 assert.equal(average([row(1,2,-1)]).winnerCents,null);
});
test('range selection uses the final observed exit and never splits known partial exits',()=>{
 const first=row(10,11,10);
 const last=row(10,12,-3,{date:'2026-09-19',source:{...first.source,closedAt:'2026-09-19T14:05:00.000Z'}});
 assert.equal(average([first,last],[last]).winnerCents,700n);
 assert.equal(average([first,last],[first]).winnerCents,null);
 assert.equal(average([first,last],[]).winnerCents,null);
});
test('accounts never combine matching opening-fill numbers; short partials use their opening sell fill',()=>{
 const a=row(10,11,10);
 const b=row(10,12,-30,{id:'tradovate-8:10:12',source:{...a.source,accountId:'8'}});
 assert.equal(average([a,b]).winnerCents,1000n);assert.equal(average([a,b]).loserCents,-3000n);
 const short=[row(11,10,10,{side:'Short'}),row(12,10,-15,{side:'Short'})];
 assert.equal(average(short).winnerCents,null);assert.equal(average(short).loserCents,-500n);assert.equal(average(short).losers,1);
});
test('unavailable currency renders no invented dollar average',()=>{
 const {TradeAverageStats}=load('src/components/TradeAverageStats.tsx');
 for(const source of [undefined,{provider:'Rithmic',accountId:'x',accountKey:'x',currency:'EUR'}]) {
  const trades=[row(1,2,10,{source})];
  const html=renderToStaticMarkup(React.createElement(TradeAverageStats,{trades,selectedTrades:trades}));
  assert.ok(!html.includes('$'));assert.match(html,/USD currency evidence required/);
 }
});
test('invalid money, duplicate identity and unsupported currency fail closed',()=>{
 const r=row(1,2,1);
 for(const rows of [[r,r],[{...r,pnl:0.001}],[{...r,pnl:NaN}],[{...r,source:undefined}],[{...r,market:'UNKNOWN'}],[r,{...row(3,4,1),source:{provider:'Rithmic',accountId:'x',accountKey:'x',currency:'EUR'}}]]) {
  const result=average(rows);assert.equal(result.status,'unavailable');assert.ok(result.reason);assert.equal(result.winnerCents,null);assert.equal(result.loserCents,null);
 }
});
