import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import load from './helpers/load-ts.cjs';
const { MiniJournal } = load('src/components/MiniJournal.tsx');
const { DashboardTradeDialog } = load('src/components/DashboardTradeDialog.tsx');
const trade = { id: 'synthetic-copy-only', date: '2026-10-01', market: 'ES', side: 'Long', contracts: 1, pnl: 50, risk: 25, setup: '', notes: '' };

for (const accountStorage of [undefined, false, true]) {
  test(`journal footers respect account storage mode ${accountStorage}`, () => {
    const daily = renderToStaticMarkup(React.createElement(MiniJournal, {
      initialDate: trade.date, actions: { accountStorage, read: () => '', save: () => true },
    }));
    const dialog = renderToStaticMarkup(React.createElement(DashboardTradeDialog, {
      accountStorage, trade, onClose() {}, journalReview: false,
    }));
    if (accountStorage) {
      assert.match(daily, /Private · check account storage for sync status/);
      assert.doesNotMatch(daily, /Private · saved on this browser/);
      assert.match(dialog, /Check account storage for sync status\. Unsaved drafts stay on this browser\./);
      assert.doesNotMatch(dialog, /Notes stay with this account’s trade history on this browser/);
      assert.doesNotMatch(daily + dialog, /Saved to your account/);
    } else {
      assert.match(daily, /Private · saved on this browser/);
      assert.match(dialog, /Notes stay with this account’s trade history on this browser/);
      assert.doesNotMatch(daily + dialog, /check account storage for sync status/i);
    }
    assert.match(dialog, /No changes to broker records/);
  });
}

test('restored unsaved draft does not imply a completed account save', () => {
  const previous = globalThis.localStorage;
  const previousSession = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: () => null, setItem() {} };
  globalThis.localStorage = { getItem: () => JSON.stringify({ note: 'Synthetic unsaved draft', tradeId: null }) };
  try {
    const markup = renderToStaticMarkup(React.createElement(MiniJournal, {
      initialDate: trade.date, actions: { accountStorage: true,
        draftKey: JSON.stringify(['synthetic-owner', 'local']), read: () => '', save: () => true },
    }));
    assert.match(markup, /Synthetic unsaved draft/);
    assert.match(markup, /Unsaved changes/);
    assert.doesNotMatch(markup, /Saved to your account|Private · saved/);
  } finally { globalThis.localStorage = previous; globalThis.sessionStorage = previousSession; }
});
