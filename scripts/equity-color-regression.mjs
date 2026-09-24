import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import load from './helpers/load-ts.cjs';
const {AstraEquityCurve}=load('src/components/AstraEquityCurve.tsx');
test('positive selected range uses green regardless of earlier account losses',()=>{
 const points=[{label:'Start',value:0},{label:'2026-09-18',value:125}];
 const html=renderToStaticMarkup(React.createElement(AstraEquityCurve,{points,accountPnlCents:-1}));
 assert.equal(html.match(/data-equity-tone="([^"]+)"/)?.[1],"profit");
 assert.match(html,/stop-color="#52c79a"/);
 assert.match(html,/stroke="#52c79a"/);
});

const {Dashboard}=load('src/components/DashboardView.tsx');
const {analyze,sampleTrades,defaultRules}=load('src/lib/risk.ts');
function tradesFor(values){return values.map((pnl,i)=>({...sampleTrades[0],id:`fixture-${i}`,date:i?'2026-09-18':'2026-09-01',pnl,market:'MNQ',source:{provider:'Tradovate',accountId:'71',pnlBasis:'gross_before_fees',timeZone:'UTC'}}));}
function storage(range='all'){const map=new Map([['cova-dashboard-range-v1',range],['cova-active-storage-identity-v1','owner-a']]);globalThis.localStorage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};return map;}
function dashboard(trades){return renderToStaticMarkup(React.createElement(Dashboard,{analysis:analyze(trades,defaultRules),rules:defaultRules,go:()=>{}}));}
test('positive latest session is green on its own displayed baseline',()=>{
 storage('today');const trades=tradesFor([-1000,200]);const before=JSON.stringify(trades);const html=dashboard(trades);
 assert.equal(html.match(/data-equity-tone="([^"]+)"/)?.[1],"profit");assert.match(html,/ending \$200\.00/);assert.equal(JSON.stringify(trades),before);
});

test('selected-range ending tone follows the plotted result, not prior gains',()=>{
 for(const range of ['today','week','all']){storage(range);const html=dashboard(tradesFor([1000,-200]));assert.equal(html.match(/data-equity-tone="([^"]+)"/)?.[1],range==='all'?'profit':'loss');assert.match(html,/stop-color="#e57c89"/);}
});
test('breakeven, unavailable and invalid cents remain neutral; one cent changes state',()=>{
 for(const [accountPnlCents,tone] of [[0,'neutral'],[null,'neutral'],[NaN,'neutral'],[Infinity,'neutral'],[.1,'neutral'],[1,'profit'],[-1,'loss']]){
  const html=renderToStaticMarkup(React.createElement(AstraEquityCurve,{points:[{label:'2026-09-18',value:Number.isSafeInteger(accountPnlCents)?accountPnlCents/100:0}],accountPnlCents}));assert.equal(html.match(/data-equity-tone="([^"]+)"/)?.[1],tone);
 }
 storage();assert.equal(dashboard(tradesFor([.1,-.1])).match(/data-equity-tone="([^"]+)"/)?.[1],'neutral');
});
test('net broker fees can turn gross profit red and funding never turns it green',()=>{
 storage();const trades=tradesFor([10]);const {saveBrokerCash}=load('src/lib/brokerCash.ts');
 const cash={status:'reconciled',version:1,accountId:'71',currency:'USD',window:{startDate:'2026-09-01',endDate:'2026-09-20'},asOf:'2026-09-19T12:00:00.000Z',basis:'cash_movements_no_trade_allocation',grossCents:1000,feeCents:-1100,netCents:-100,nonTradingCents:1000000,openingBalanceCents:0,closingBalanceCents:999900,entries:[
  {id:'1',at:'2026-09-01T08:00:00.000Z',deltaCents:1000000,balanceCents:1000000,category:'funding',type:'Fund Transaction',currency:'USD'},
  {id:'2',at:'2026-09-01T09:00:00.000Z',deltaCents:-1100,balanceCents:998900,category:'fee',type:'Commission',currency:'USD'},
  {id:'3',at:'2026-09-01T10:00:00.000Z',deltaCents:1000,balanceCents:999900,category:'trade',type:'Trade Paired',currency:'USD'}]};
 saveBrokerCash('owner-a','71',cash,trades);const html=dashboard(trades);assert.match(html,/Net P&amp;L curve/);assert.equal(html.match(/data-equity-tone="([^"]+)"/)?.[1],'loss');
 const grossHtml=renderToStaticMarkup(React.createElement(Dashboard,{analysis:analyze(trades,defaultRules),rules:defaultRules,go:()=>{},journalReview:true}));assert.equal(grossHtml.match(/data-equity-tone="([^"]+)"/)?.[1],'profit','Gross/reported plot must not subtract cash fees from historical baseline');
});
test('All accounts colors known-USD reported results on the displayed zero baseline',()=>{
 storage();const trades=tradesFor([-100,200]);trades[1].source.accountId='72';const before=JSON.stringify(trades);const html=dashboard(trades);
 assert.equal(html.match(/data-equity-tone="([^"]+)"/)?.[1],'profit');
 assert.match(html,/data-equity-history="split"/);assert.match(html,/Gross P&amp;L/);assert.doesNotMatch(html,/Net P&amp;L curve/);assert.equal(JSON.stringify(trades),before);
});
