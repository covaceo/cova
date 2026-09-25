import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import load from './helpers/load-ts.cjs';
import * as ReactRuntime from 'react';
import * as ReactServer from 'react-dom/server';
const requireReact=()=>ReactRuntime,requireServer=()=>ReactServer;
const row=(id,date,pnl,account='7')=>({id,date,market:'MNQ',side:'Long',contracts:1,entry:20000,exit:20001,pnl,risk:10,setup:'',notes:'',source:{provider:'Tradovate',accountId:account,pnlBasis:'gross_before_fees',timeZone:'UTC',openedAt:date+'T13:00:00.000Z',closedAt:date+'T14:00:00.000Z'}});
const model=()=>{assert.ok(existsSync('src/lib/tradingCalendar.ts'),'Risk Desk needs an executable trading calendar model');return load('src/lib/tradingCalendar.ts');};
test('calendar aggregates daily cents and distinguishes green, red, breakeven and idle dates',()=>{
 const trades=[row('1','2026-09-01',50.25),row('2','2026-09-01',-10.10),row('3','2026-09-02',-15.75),row('4','2026-09-03',0)];const original=structuredClone(trades);
 const days=model().buildCalendarMonth('2026-09',trades);const day=date=>days.find(d=>d.date===date);
 assert.equal(day('2026-09-01').pnlCents,'4015');assert.equal(day('2026-09-01').status,'profit');
 assert.equal(day('2026-09-02').pnlCents,'-1575');assert.equal(day('2026-09-02').status,'loss');
 assert.equal(day('2026-09-03').pnlCents,'0');assert.equal(day('2026-09-03').status,'breakeven');
 assert.equal(day('2026-09-04').pnlCents,null);assert.equal(day('2026-09-04').status,'idle');
 assert.deepEqual(trades,original);
});
test('reconciled daily cash determines sign without turning funding or fee-only days into trades',()=>{
 const trades=[row('1','2026-09-01',5),row('2','2026-09-02',20)];
 const cash={status:'available',grossCents:2500,feeCents:-900,netCents:1600,startDate:'2026-09-01',endDate:'2026-09-04',asOf:'2026-09-04T00:00:00.000Z',points:[{label:'2026-09-01',value:-2},{label:'2026-09-02',value:18},{label:'2026-09-03',value:16}]};
 const days=model().buildCalendarMonth('2026-09',trades,cash);
 assert.equal(days.find(d=>d.date==='2026-09-01').pnlCents,'-200');
 assert.equal(days.find(d=>d.date==='2026-09-01').status,'loss');
 assert.equal(days.find(d=>d.date==='2026-09-02').pnlCents,'2000');
 assert.equal(days.find(d=>d.date==='2026-09-03').status,'idle');assert.equal(days.find(d=>d.date==='2026-09-03').pnlCents,null);
 const combined=model().buildCalendarMonth('2026-09',[...trades,row('3','2026-09-01',10,'8')],cash);
 assert.equal(combined.find(d=>d.date==='2026-09-01').pnlCents,'1500','All accounts uses reported USD, never one account cash');
});

test('UTC month navigation handles leap years and year boundaries, and refuses malformed dates',()=>{
 const m=model();assert.equal(m.shiftCalendarMonth('2026-12',1),'2027-01');assert.equal(m.shiftCalendarMonth('2026-01',-1),'2025-12');
 const leap=m.buildCalendarMonth('2024-02',[]);assert.equal(leap.filter(d=>d.inMonth).length,29);assert.equal(leap[0].date,'2024-01-28');assert.equal(leap.length,35);assert.equal(m.buildCalendarMonth('2026-02',[]).length,28);
 assert.throws(()=>m.buildCalendarMonth('2026-13',[]));assert.throws(()=>m.buildCalendarMonth('2026-2',[]));
});
test('duplicate IDs across days, invalid money and unknown currencies never acquire a colored dollar result',()=>{
 const cases=[[row('dup','2026-09-01',10),row('dup','2026-09-02',10)],[row('x','2026-09-01',0.001)],[{...row('x','2026-09-01',10),source:{provider:'Rithmic',accountKey:'a',accountId:'7',currency:'EUR'}}]];
 for(const rows of cases){const d=model().buildCalendarMonth('2026-09',rows).find(d=>d.date==='2026-09-01');assert.equal(d.status,'unavailable');assert.equal(d.pnlCents,null);}
});
test('built-in disclosed sample dates render, but lookalike or unsupported imported rows do not become USD',()=>{
 const sample=load('src/lib/risk.ts').sampleTrades;
 const d=model().buildCalendarMonth(sample[0].date.slice(0,7),sample).find(d=>d.date===sample[0].date);assert.notEqual(d.pnlCents,null);
 const altered={...sample[0],pnl:999.99};assert.equal(model().buildCalendarMonth(altered.date.slice(0,7),[altered]).find(d=>d.date===altered.date).pnlCents,null);
});
test('Risk Desk renders a calendar from full selected-account history, with idle cells containing no stats',()=>{
 assert.ok(existsSync('src/components/TradingCalendar.tsx'),'Calendar component exists');
 const React=load('src/components/DashboardView.tsx');
 const {createElement}=requireReact();
 const {renderToStaticMarkup}=requireServer();
 const {TradingCalendar}=load('src/components/TradingCalendar.tsx');
 const html=renderToStaticMarkup(createElement(TradingCalendar,{trades:[row('x','2026-09-01',10)],initialMonth:'2026-09'}));
 assert.match(html,/Trading calendar/);assert.match(html,/September 2026/);assert.match(html,/calendar-day--profit/);assert.match(html,/\+\$10\.00/);
 const idle=html.match(/<td[^>]*data-calendar-date="2026-09-02"[\s\S]*?<\/td>/)?.[0];assert.ok(idle);assert.doesNotMatch(idle,/calendar-pnl|\$|0\.00|No trades<|0 trades/);
 const dash=renderToStaticMarkup(createElement(React.Dashboard,{analysis:load('src/lib/risk.ts').analyze([row('a','2026-09-01',10)],[]),rules:[],go:()=>{}}));assert.match(dash,/Trading calendar/);
});
test('invalid imported dates cannot crash the calendar or create trading days',()=>{
 const {TradingCalendar}=load('src/components/TradingCalendar.tsx');
 assert.doesNotThrow(()=>ReactServer.renderToStaticMarkup(ReactRuntime.createElement(TradingCalendar,{trades:[row('bad','2026-13-45',10)]})));
});
