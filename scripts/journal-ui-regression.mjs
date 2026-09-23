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
  const source = readFileSync('src/components/TradeHistoryDialog.tsx','utf8');
  assert.match(source, /<JournalHeadlineStats journal=\{journal\}/);
  assert.match(source, /journalSummary\(groups\.flatMap\(group => group\.rows\)\)/);
  assert.match(source, /JournalEntryRow/);
  assert.match(readFileSync('src/components/JournalEntryRow.tsx','utf8'), /rowMoneyText\(row, value\)/);
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

test('partial exits count once by broker entry identity without changing the raw ledger', () => {
  const {analyze,defaultRules} = load('src/lib/risk.ts');
  const source={provider:'Tradovate',accountId:'100',openedAt:'2026-09-10T14:00:00.000Z',closedAt:'2026-09-10T14:05:00.000Z',timeZone:'UTC',pnlBasis:'gross_before_fees'};
  const rows=[tradeFixture({id:'tradovate-100:1001:2001',side:'Long',source,pnl:100}),tradeFixture({id:'tradovate-100:1001:2002',side:'Long',source,pnl:-150}),tradeFixture({id:'tradovate-100:1002:2003',side:'Long',source,pnl:20})];
  const before=JSON.stringify(rows), a=analyze(rows,defaultRules);
  assert.equal(a.tradeCount,2);
  assert.equal(a.winningTradeCount,1);
  assert.equal(a.winRate,0.5);
  assert.equal(a.totalPnl,-30);
  assert.equal(a.entryGroups[0].rows.length,2);
  assert.equal(a.entryGroups[0].pnl,-50);
  assert.equal(a.trades.length,3);
  assert.equal(JSON.stringify(rows),before);
});

test('ordinary dashboard counts grouped entries instead of partial-exit rows', () => {
  const {Dashboard}=load('src/components/DashboardView.tsx');
  const {analyze,defaultRules}=load('src/lib/risk.ts');
  const source={provider:'Tradovate',accountId:'100',openedAt:'2026-09-10T14:00:00.000Z',closedAt:'2026-09-10T14:05:00.000Z',timeZone:'UTC',pnlBasis:'gross_before_fees'};
  const rows=[tradeFixture({id:'tradovate-100:1001:2001',side:'Long',source,pnl:100}),tradeFixture({id:'tradovate-100:1001:2002',side:'Long',source,pnl:-150}),tradeFixture({id:'tradovate-100:1002:2003',side:'Long',source,pnl:20})];
  const html=renderToStaticMarkup(React.createElement(Dashboard,{analysis:analyze(rows,defaultRules),rules:defaultRules,go:()=>{}}));
  assert.match(html,/2 trade entries/);
  assert.match(html,/1 wins \/ 2 entries/);
  assert.doesNotMatch(html,/3 closed trades|2 wins \/ 3 trades/);
});

test('saved history presents one entry with expandable original partial exits and notes', () => {
  assert.equal(existsSync('src/components/JournalEntryRow.tsx'),true);
  const {JournalEntryRow}=load('src/components/JournalEntryRow.tsx');
  const {groupJournalEntries}=load('src/lib/risk.ts');
  const source={provider:'Tradovate',accountId:'100',openedAt:'2026-09-10T14:00:00.000Z',closedAt:'2026-09-10T14:05:00.000Z',timeZone:'UTC',pnlBasis:'gross_before_fees'};
  const rows=[tradeFixture({id:'tradovate-100:1001:2001',side:'Long',source,pnl:100,notes:'First note'}),tradeFixture({id:'tradovate-100:1001:2002',side:'Long',source,pnl:-150,notes:'Second note'})];
  const before=JSON.stringify(rows);
  const html=renderToStaticMarkup(React.createElement(JournalEntryRow,{group:groupJournalEntries(rows)[0],journalReview:true}));
  assert.equal((html.match(/data-history-trade=/g)||[]).length,1);
  assert.match(html,/2 partial exits/);
  assert.match(html,/First note/); assert.match(html,/Second note/);
  assert.match(html,/−\$50.00/);
  assert.equal((html.match(/data-partial-exit=/g)||[]).length,2);
  assert.equal(JSON.stringify(rows),before);
});

test('entry grouping isolates shorts, account IDs, separate entries and contradictory evidence', () => {
  const {groupJournalEntries}=load('src/lib/risk.ts');
  const source={provider:'Tradovate',accountId:'100',openedAt:'2026-09-10T14:00:00.000Z',closedAt:'2026-09-10T14:05:00.000Z',timeZone:'UTC',pnlBasis:'gross_before_fees'};
  const row=overrides=>tradeFixture({id:'tradovate-100:1001:9007199254740993',source,side:'Short',pnl:0.1,...overrides});
  const a=row({}), b=row({id:'tradovate-100:1002:9007199254740993',pnl:0.2});
  assert.equal(groupJournalEntries([a,b]).length,1);
  assert.equal(groupJournalEntries([a,b])[0].pnl,0.3);
  assert.equal(groupJournalEntries([a,row({id:'tradovate-100:1002:9007199254740994'})]).length,2);
  assert.equal(groupJournalEntries([a,row({id:'tradovate-101:1002:9007199254740993',source:{...source,accountId:'101'}})]).length,2);
  for (const other of [row({id:b.id,market:'ES'}),row({id:b.id,entry:a.entry+1}),row({id:b.id,source:{...source,openedAt:'2026-09-10T14:01:00.000Z'}}),row({id:b.id,pnl:0.001}),a]) {
    const groups=groupJournalEntries([a,other]);
    assert.equal(groups.length,2); assert.ok(groups.every(group=>!group.entryIdentified));
  }
  assert.equal(groupJournalEntries([a,{...a,id:'legacy-row'}]).length,2);
});

test('entry groups are ordered by their latest realized exit, not their first partial', () => {
  const {groupJournalEntries}=load('src/lib/risk.ts');
  const source={provider:'Tradovate',accountId:'100',openedAt:'2026-09-10T14:00:00.000Z',timeZone:'UTC',pnlBasis:'gross_before_fees'};
  const row=(id,closedAt)=>tradeFixture({id,side:'Long',source:{...source,closedAt}});
  const rows=[row('tradovate-100:1001:2001','2026-09-10T14:01:00.000Z'),row('tradovate-100:1002:2002','2026-09-10T14:02:00.000Z'),row('tradovate-100:1001:2003','2026-09-10T14:03:00.000Z')];
  assert.deepEqual(groupJournalEntries(rows).map(group=>group.rows.length),[1,2]);
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
  assert.match(html,/Review details/);
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
  assert.match(html, /aria-label="Journal note"/);
  const { DashboardTradeDialog } = load("src/components/DashboardTradeDialog.tsx");
  assert.match(renderToStaticMarkup(React.createElement(DashboardTradeDialog,{trade:trades[0],onClose:()=>{},journalReview:true})),/Trade journal note/,"Existing per-trade notes retain their own detail editor; mounted values are browser-tested");
  assert.doesNotMatch(html, /Max drawdown|Cova Score|Strong risk discipline|Risk needs attention|closed trades|completed trade<|Size increased after/i);
  assert.equal((html.match(/data-recent-trade=/g)||[]).length,2);
});
