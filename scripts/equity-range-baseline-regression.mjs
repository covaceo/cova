import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import load from './helpers/load-ts.cjs';
const {Dashboard}=load('src/components/DashboardView.tsx');
const {analyze,sampleTrades,defaultRules}=load('src/lib/risk.ts');
test('latest session negative dip is red even when older profits keep the whole account positive',()=>{
 const storage=new Map([['cova-dashboard-range-v1','today'],['cova-active-storage-identity-v1','range-owner']]);
 globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const trades=[400,100,-180,330].map((pnl,i)=>({...sampleTrades[0],id:'range-'+i,date:i?'2026-09-18':'2026-09-01',pnl,market:'MNQ',source:{provider:'Tradovate',accountId:'71',pnlBasis:'gross_before_fees',timeZone:'UTC'}}));
 const html=renderToStaticMarkup(React.createElement(Dashboard,{analysis:analyze(trades,defaultRules),rules:defaultRules,go:()=>{}}));
 assert.match(html,/data-equity-history="split"/);
 const dots=[...html.matchAll(/class="astra-observation"[^>]*fill="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(dots,['#4f7dff','#52c79a','#e57c89','#52c79a']);
});
