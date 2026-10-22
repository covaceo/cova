import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import load from './helpers/load-ts.cjs';
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
const {analyze,sampleTrades,defaultRules}=load('src/lib/risk.ts');
const {Dashboard}=load('src/components/DashboardView.tsx');
const {DashboardReviewRange}=load('src/components/DashboardReviewRange.tsx');
const {TradeHistoryDialog}=load('src/components/TradeHistoryDialog.tsx');

test('History uses row placement instead of repeating obvious field labels while keeping every field accessible',()=>{
 const html=render(TradeHistoryDialog,{trades:sampleTrades,journalReview:false,onClose(){}});
 for(const field of ['closed','market','side','pnl']){
  const cells=[...html.matchAll(new RegExp('<td[^>]*data-history-field="'+field+'"[^>]*>(.*?)</td>','g'))];
  assert.equal(cells.length,sampleTrades.length);
  assert(cells.every(cell=>!cell[1].includes('history-field-label')),'Remove repeated '+field+' label');
 }
 assert.equal((html.match(/role="columnheader"/g)||[]).length,7);
 assert.equal((html.match(/role="cell"/g)||[]).length,sampleTrades.length*7);
 for(const label of ['Gross / reported P&amp;L','Planned risk','Contracts','Notes / partial exits','Data details'])assert(html.includes(label));
 assert(html.includes('Tradovate times are UTC')&&html.includes('Older saved history stays here'));
});

test('Risk Desk removes redundant supporting copy without losing scope, controls or storage truth',()=>{
 const html=render(Dashboard,{analysis:analyze(sampleTrades,defaultRules),rules:defaultRules,go(){}});
 for(const text of ['Established history sample','All saved trades','What worked? What will you change next time?'])assert(!html.includes(text),'Remove redundant copy: '+text);
 for(const text of ['25 trades reviewed','Review details','Data details','View all','Attach trade','Save note','Private · saved on this browser','Retrospective review only. No live brokerage execution.'])assert(html.includes(text),'Preserve functional/data meaning: '+text);
 assert(html.includes('placeholder="Session note"'));
 for(const range of ['all','today','week']){
  const scoped=render(DashboardReviewRange,{trades:sampleTrades,range,onChange(){},cash:null});
  assert.equal((scoped.match(/aria-pressed="true"/g)||[]).length,1);
  assert(scoped.includes('2026'));
  assert(!scoped.includes('All saved trades')&&!scoped.includes('Latest trade session'));
  if(range==='week')assert(scoped.includes('Ends at latest trade'),'Preserve the non-calendar seven-day anchor');
 }
 const empty=render(Dashboard,{analysis:analyze([],defaultRules),rules:defaultRules,go(){}});
 assert(!empty.includes('Cova keeps a new account blank until you add your own trade data.'));
 assert(empty.includes('data-dashboard-empty="true"')&&empty.includes('Import trade history'));
});
