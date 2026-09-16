import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import load from './helpers/load-ts.cjs';
import { existsSync, readFileSync } from 'node:fs';

test('history and note detail disclose row evidence and preserve cent-precise source amounts', () => {
  const { DashboardTradeDialog } = load('src/components/DashboardTradeDialog.tsx');
  const html = renderToStaticMarkup(React.createElement(DashboardTradeDialog,{trade:tradeFixture(),onClose:()=>{},journalReview:true}));
  assert.doesNotMatch(html, /completed trade/);
  assert.match(html, /matched fill row/);
  const source = readFileSync('src/components/ImportDesk.tsx','utf8');
  assert.match(source, /<JournalHeadlineStats journal=\{historyJournal\}/);
  assert.match(source, /journalSummary\(historyTrades\)/);
  assert.match(source, /rowMoneyText\(trade, trade.pnl\)/);
  const { rowMoneyText } = load('src/lib/journalAccuracy.ts');
  assert.equal(rowMoneyText(tradeFixture(), -85), '−$85.00');
  assert.equal(rowMoneyText(tradeFixture(), 0.001), 'Unavailable (invalid money)');
  assert.equal(rowMoneyText(tradeFixture({source:{provider:'Rithmic',currency:'USD'}}), -85), '−$85.00');
});

test('accuracy dialog risk respects source currency while default formatting stays unchanged', () => {
  const { DashboardTradeDialog } = load('src/components/DashboardTradeDialog.tsx');
  const trade = tradeFixture({pnl:100,risk:50,source:undefined});
  const renderRisk = journalReview => renderToStaticMarkup(React.createElement(DashboardTradeDialog,{trade,onClose:()=>{},journalReview})).match(/Provided risk<\/span><strong>([^<]*)<\/strong>/)?.[1];
  assert.equal(renderRisk(true), '50.00 (currency unknown)');
  assert.equal(renderRisk(false), '$50.00');
});

import { tradeFixture } from './fixtures/journal-synthetic.mjs';

test('accuracy chart footer withholds money rejected by the currency and minor-unit gates', () => {
  const { Dashboard } = load('src/components/DashboardView.tsx');
  const { analyze, defaultRules } = load('src/lib/risk.ts');
  const cases = [
    [tradeFixture({pnl:100}), tradeFixture({id:'eur-row',pnl:200,source:{provider:'Rithmic',currency:'EUR'}})],
    [tradeFixture({pnl:100,source:undefined})],
    [tradeFixture({pnl:0.001})],
  ];
  for (const trades of cases) {
    const html = renderToStaticMarkup(React.createElement(Dashboard,{analysis:analyze(trades,defaultRules),rules:defaultRules,go:()=>{},journalReview:true}));
    const footer = html.match(/data-dashboard-trade-count="\d+">([^<]*)<\/span>/)?.[1];
    assert.equal(footer, `${trades.length} matched rows · Unavailable`);
  }
});

test('ordinary dashboard remains available while the owner tests the accuracy review explicitly', () => {
  const { Dashboard } = load('src/components/DashboardView.tsx');
  const { analyze, defaultRules } = load('src/lib/risk.ts');
  const html = renderToStaticMarkup(React.createElement(Dashboard,{analysis:analyze([tradeFixture()],defaultRules),rules:defaultRules,go:()=>{}}));
  assert.match(html,/Max drawdown/);
  assert.match(html,/Next review/);
  assert.doesNotMatch(html,/data-journal-accuracy/);
});

test('actual dashboard uses unavailable completed metrics and nonnumeric discipline, keeping raw rows and notes', () => {
  const { Dashboard } = load('src/components/DashboardView.tsx');
  const { analyze, defaultRules } = load('src/lib/risk.ts');
  const trades = [tradeFixture(), tradeFixture({id:'row-b',pnl:-129,contracts:3})];
  const html = renderToStaticMarkup(React.createElement(Dashboard,{analysis:analyze(trades,defaultRules),rules:defaultRules,go:()=>{},journalReview:true}));
  assert.match(html, /Biggest loss/);
  assert.match(html, /Completed-trade win rate/);
  assert.match(html, /Unavailable/);
  assert.match(html, /insufficient evidence/i);
  assert.match(html, /2 (raw|matched) rows/);
  assert.match(html, /Fees unknown/);
  assert.match(html, /Synthetic note/);
  assert.doesNotMatch(html, /Max drawdown|Cova Score|Strong risk discipline|Risk needs attention|closed trades|completed trade<|Size increased after/i);
  assert.equal((html.match(/data-recent-trade=/g)||[]).length,2);
});
