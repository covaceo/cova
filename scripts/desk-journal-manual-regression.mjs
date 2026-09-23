import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';import{renderToStaticMarkup}from'react-dom/server';
import load from './helpers/load-ts.cjs';
const {Dashboard}=load('src/components/DashboardView.tsx');
const {analyze,sampleTrades,defaultRules}=load('src/lib/risk.ts');
test('Risk Desk offers a compact usable journal, Add trade and only wins/losses under win rate',()=>{
 const trades=[100,-50,0].map((pnl,i)=>({...sampleTrades[0],id:'test-'+i,pnl,notes:''}));
 const html=renderToStaticMarkup(React.createElement(Dashboard,{analysis:analyze(trades,defaultRules),rules:defaultRules,go:()=>{},onAddManualTrade:()=>null}));
 assert.match(html,/>Add trade</);assert.match(html,/aria-label="Journal note"/);assert.match(html,/1 win · 1 loss/);
 assert(!html.includes('No notes yet.'));
 assert.match(html, /Attach trade/);
 assert.match(html, /oa-discipline/);
 assert.doesNotMatch(html, /astra-score-ring|astra-evidence-details|astra-review-details|Manage source/);
 assert.match(html, /Review details/);
 assert.match(html, /class="astra-trade-actions"><button[^>]*astra-add-trade[^>]*>Add trade<\/button><button[^>]*astra-import-action/, 'Add trade directly precedes Import in one nonwrapping action group');
});

test('Tradovate wins and losses omit the standalone before-fees label',()=>{
 const source={provider:'Tradovate',accountId:'71',openedAt:'2026-09-18T12:00:00.000Z',closedAt:'2026-09-18T12:05:00.000Z',timeZone:'UTC',pnlBasis:'gross_before_fees'};
 const trades=[100,-50].map((pnl,i)=>({...sampleTrades[0],id:`tradovate-71:${10+i}:${20+i}`,date:'2026-09-18',pnl,source}));
 const html=renderToStaticMarkup(React.createElement(Dashboard,{analysis:analyze(trades,defaultRules),rules:defaultRules,go:()=>{}}));
 assert.match(html,/1 win · 1 loss/);
 assert.doesNotMatch(html,/astra-stat-basis/);
 assert.match(html,/Individual trade statistics remain gross/, 'Existing review details retain accounting basis');
});

test('attached trade detail reopens one complete saved entry including its partial exits',()=>{
 const {TradeHistoryDialog}=load('src/components/TradeHistoryDialog.tsx');
 const source={provider:'Tradovate',accountId:'71',openedAt:'2026-09-18T12:00:00Z',closedAt:'2026-09-18T12:05:00Z',timeZone:'UTC',pnlBasis:'gross_before_fees'};
 const rows=[{...sampleTrades[0],id:'tradovate-71:1:2',pnl:10,notes:'First partial',source},{...sampleTrades[0],id:'tradovate-71:1:3',pnl:20,notes:'Second partial',source},{...sampleTrades[0],id:'unrelated',notes:'UNRELATED RECORD'}];
 const html=renderToStaticMarkup(React.createElement(TradeHistoryDialog,{trades:rows,attachedTradeId:rows[1].id,journalReview:false,onClose:()=>{}}));
 assert.match(html,/Attached trade/);assert.match(html,/First partial/);assert.match(html,/Second partial/);assert.doesNotMatch(html,/UNRELATED RECORD/);assert.equal((html.match(/data-history-trade=/g)||[]).length,1);
 const missing=renderToStaticMarkup(React.createElement(TradeHistoryDialog,{trades:rows,attachedTradeId:'deleted',journalReview:false,onClose:()=>{}}));assert.match(missing,/no longer available/);assert.doesNotMatch(missing,/First partial/);
});


test('compact Cova score omits the duplicate history-import prompt but keeps review evidence',()=>{
 const {OaDisciplineReview}=load('src/components/OaDisciplineReview.tsx');
 const {getDashboardSummaryAction}=load('src/lib/dashboardReviewState.ts');
 const analysis=analyze([{...sampleTrades[0],id:'thin-history',pnl:100}],[]);
 assert.equal(getDashboardSummaryAction(analysis).target,'import','fixture exercises the retired add-more-trades prompt');
 const html=renderToStaticMarkup(React.createElement(OaDisciplineReview,{analysis,go:()=>{}}));
 assert.match(html,/<h2[^>]*>Cova score<\/h2>/);
 assert.doesNotMatch(html,/Add more trades|Add trade history|Discipline review/);
 assert.equal((html.match(/>Cova score</g)||[]).length,1,'Score label is not duplicated');
 assert.match(html,/Review details/);
 assert.match(html,new RegExp('Cova Score '+analysis.score+' out of 100'));
});
