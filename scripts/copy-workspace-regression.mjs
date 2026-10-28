import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import load from './helpers/load-ts.cjs';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const [file,phrases] of Object.entries({
 'DashboardBriefs.tsx':['About your score','Risk summary','Top finding'],
 'DashboardCards.tsx':['Max drawdown','rows with planned risk'],
 'DashboardView.tsx':['Import trades to see your results','Data checks · Beta · Your saved history is unchanged.'],
 'OaDisciplineReview.tsx':['Trade results','Risk summary'],
 'LimitsEditor.tsx':['Set limits to check against your trades.','Changing a limit updates warnings, not your saved trades.'],
 'JournalAccuracyPanels.tsx':['Not enough data to calculate a score.','Rule checks','Requires a complete position with all partial exits; not yet verified'],
 'TradeAverageStats.tsx':['Complete position history is not verified.','Reported P&L; fees unverified'],
 'PassportProgress.tsx':['limits saved before the session','Later syncs can change rewards','Your level does not affect your trading rank'],
 'PassportHoloCard.tsx':['Home resets it. Tilt is disabled with reduced motion.'],
 'PassportShareComposer.tsx':['Applying your privacy settings'],
 'WorkspaceSections.tsx':['Rank details','Cumulative reported P&L','Shared PNGs do not expire and cannot be revoked by Cova.'],
 'WorkspaceShell.tsx':['No matching page.'],
 'ImportDesk.tsx':['Upload a CSV export instead.'],
}))test(`${file}: approved direct copy and limitations`,()=>{
 const source=fs.readFileSync(path.join(root,'src/components',file),'utf8');
 for(const phrase of phrases)assert.ok(source.includes(phrase),`${file}: ${phrase}`);
});

test('rendered dashboard and limits show direct labels with warnings intact', () => {
  const { analyze, sampleTrades, defaultRules } = load(path.join(root, 'src/lib/risk.ts'));
  const analysis = analyze(sampleTrades, defaultRules);
  const render = (file, name, props) => renderToStaticMarkup(React.createElement(load(path.join(root, 'src/components', file))[name], props));
  const brief = render('DashboardBriefs.tsx', 'ScoreExplanationStrip', { analysis });
  assert.ok(brief.includes('About your score'));
  assert.ok(brief.includes('See the factors behind your score below.'));
  assert.ok(!brief.includes('not a signal'));
  const cards = render('DashboardCards.tsx', 'MetricDock', { analysis });
  assert.ok(cards.includes('Max drawdown'));
  assert.ok(cards.includes(`Average R (${analysis.riskCount}/${analysis.trades.length} rows)`));
  const limits = render('LimitsEditor.tsx', 'LimitsEditor', { entitlements: { canEditAdvancedLimits: true }, rules: defaultRules, setRules() {}, upgradeToPro() {} });
  assert.ok(limits.includes('Changing a limit updates warnings, not your saved trades.'));
  assert.ok(limits.includes('does not block orders or change broker settings'));
  assert.ok(limits.includes('Values apply on Enter or when you leave a field.'));
});

test('risk, fee, source and privacy warnings remain explicit', () => {
  for (const [file, phrases] of Object.entries({
    'WorkspaceSections.tsx': ['older CSV rows have unverified risk values', 'rows have no planned risk', 'rows with planned risk; P&amp;L is unchanged.', 'NOT ACCOUNT VERIFIED', 'does not block orders or change broker settings'],
    'JournalAccuracyPanels.tsx': ['Fees unknown', 'matched rows', 'Source rows'],
    'ImportDesk.tsx': ['matched fill pairs, not strategy-level trades', 'Dates use UTC; the end date is not included.', 'P&amp;L is before fees.'],
    'ImportPanels.tsx': ['This replaces all saved trade history.', 'Your imported history and journal stay in Cova.'],
    'ManualTradeDialog.tsx': ['after fees', 'remove the manual copy'],
  })) for (const phrase of phrases) assert.ok(fs.readFileSync(path.join(root, 'src/components', file), 'utf8').includes(phrase), `${file}: ${phrase}`);
});
