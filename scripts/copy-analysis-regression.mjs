import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import load from './helpers/load-ts.cjs';

const risk = load('src/lib/risk.ts');
import {restoreApprovedCopySource} from './helpers/approved-copy-cleanup.mjs';
const original = { exports: {} };
new Function('module', 'exports', ts.transpileModule(restoreApprovedCopySource('src/lib/risk.ts', readFileSync('src/lib/risk.ts', 'utf8')), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(original, original.exports);
const rows = values => values.map((pnl, index) => ({
  id: `copy-${index}`, date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
  market: 'NQ', side: 'Long', contracts: 1, entry: 100, exit: 101, pnl,
  risk: 100, riskStatus: 'provided', setup: 'Opening range', notes: '',
  manual: { accountKey: 'local', currency: 'USD', pnlBasis: 'reported_net' },
}));
const withoutCopy = value => {
  if (Array.isArray(value)) return value.map(withoutCopy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['label', 'summary', 'headline', 'watchlist', 'guardrails', 'evidence', 'caveats', 'reason'].includes(key))
    .map(([key, item]) => [key, withoutCopy(item)]));
  return value;
};

test('session summaries state observed findings without review jargon or repeated advice disclaimers', () => {
  const cases = [[], risk.sampleTrades, rows([100, 120, 90]), rows([-100, -150, -100]), rows([-3000]),
    rows([100, 120, 90]).map(row => ({ ...row, risk: 0, riskStatus: 'missing' }))];
  for (const data of cases) {
    const brief = risk.analyze(data, risk.defaultRules).nextSessionBrief;
    assert.doesNotMatch(JSON.stringify(brief), /historical review|reviewed (?:sample|history)|retrospective analysis|not a recommendation|appropriate|recurring risk pattern|same warning across/i);
  }
  assert.match(risk.analyze([], []).nextSessionBrief.headline, /add trade history/i);
});

test('behavior findings describe rows and measured R without inferring edge or advice', () => {
  const analysis = risk.analyze(risk.sampleTrades, risk.defaultRules);
  assert.doesNotMatch(JSON.stringify(analysis.behaviorFlags), /kind of pattern to stop|needs a tighter|enough imported history|strongest current sample|edge faded|taking up most|Too much risk in one setup/i);
  const red = rows(Array(9).fill(-20)).map(row => ({ ...row, date: '2026-01-01' }));
  const flags = risk.analyze(red, []).behaviorFlags;
  const busy = flags.find(flag => flag.id === 'overtrading-session');
  assert.match(busy.evidence.join(' '), /9 rows/);
  assert.match(busy.evidence.join(' '), /planned risk/);
  const best = risk.analyze(rows([100, 120, 90]), []).behaviorFlags.find(flag => flag.id === 'stable-setup');
  assert.match(best.summary, /at least three rows with planned risk/i);
  assert.match(best.evidence.join(' '), /3\/3 rows with planned risk/);
});

test('rule summaries reflect inclusive thresholds and row-based checks', () => {
  const analysis = risk.analyze(rows([-1600]), risk.defaultRules);
  assert.match(analysis.ruleStatuses.find(status => status.rule.metric === 'maxTradeLoss').summary, /1 row.*at least/);
  const atThreshold = risk.analyze(rows([100, -100]), [{ id: 'pf', name: 'PF', enabled: true, metric: 'minProfitFactor', limit: 1, severity: 'info' }]);
  assert.match(atThreshold.ruleStatuses[0].summary, /at or above/);
});

test('performance explanations use plain language and retain score limitations', () => {
  const analysis = risk.analyze(rows([100, -20, 80]), []);
  const text = JSON.stringify([analysis.scoreFactors, analysis.evidenceQuality]);
  assert.doesNotMatch(text, /root-mean-square|signed average|model weights|concentration-adjusted|uplift|externally validated ratings/i);
  assert.match(text, /day-end/i);
  assert.match(text, /intraday/i);
  assert.match(text, /fees/i);
  assert.match(text, /not a forecast/i);
  assert.match(text, /not a calendar-day count/i);
  assert.equal(risk.calculatePerformanceScore(rows([0, 0])).reason, 'Every recorded day has zero P&L');
  assert.equal(risk.calculatePerformanceScore(rows([1]).map(row => ({ ...row, manual: undefined }))).reason, 'USD currency and P&L source are not confirmed');
});

test('source labels and supporting analytical text are direct without changing export count contracts', () => {
  const { getTradeSourceLabel } = load('src/lib/tradeSourceLabel.ts');
  assert.equal(getTradeSourceLabel(risk.sampleTrades), 'Sample data');
  assert.equal(getTradeSourceLabel(rows([100])), 'Manual trades');
  assert.equal(getTradeSourceLabel(rows([100]).map(row => ({ ...row, manual: undefined }))), 'CSV import');
  const { buildHoloPassportModel } = load('src/lib/passportHolo.ts');
  const analysis = risk.analyze(rows([100, 120, 90]), []);
  const card = buildHoloPassportModel(analysis, 'Unranked', 'private', false);
  assert.equal(card.marketLine, '3 reviewed trades', 'Export privacy parsers depend on this text; preserve it');
  assert.doesNotMatch(card.support.join(' '), /history sample|Reviewed/);
  const coach = buildHoloPassportModel(analysis, 'Unranked', 'coach', false);
  assert.match(coach.support.join(' '), /No major warning/);
  const { disciplineReview } = load('src/lib/journalAccuracy.ts');
  const completed = { status: 'available', groups: [], biggestLossCents: 0n };
  const review = disciplineReview(risk.defaultRules, completed, []);
  assert.doesNotMatch(JSON.stringify(review, (_, value) => typeof value === 'bigint' ? String(value) : value), /manufactured|implemented in v1|retrospective checks/);
  assert.match(review.basis, /limits saved before entry/);
});

test('provider import descriptions avoid review jargon without changing connection claims', () => {
  const source = readFileSync('src/lib/propFirms.ts', 'utf8');
  assert.doesNotMatch(source, /retrospective review|strongest review signal/);
  assert.match(source, /Cova does not connect directly to TopstepX/);
});

test('all calculations, IDs, statuses and data stay equal to the original engine', () => {
  let seed = 173;
  const histories = [[], risk.sampleTrades];
  for (let size = 1; size <= 100; size++) histories.push(rows(Array.from({ length: size }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed % 200001 - 100000) / 100;
  })).map((row, index) => ({ ...row, contracts: index % 7 + 1,
    risk: index % 4 ? 100 : 0, riskStatus: index % 4 ? 'provided' : 'missing' })));
  for (const history of histories) for (const rules of [risk.defaultRules, []]) {
    const held = structuredClone(history);
    assert.deepEqual(withoutCopy(risk.analyze(history, rules)), withoutCopy(original.exports.analyze(history, rules)));
    assert.deepEqual(history, held);
  }
});

test('grouped entries remain distinct from raw rows and every numerical output is preserved', () => {
  const history = [11, 12].map((closing, index) => ({ ...rows([100])[0], id: `tradovate-7:10:${closing}`,
    date: '2026-01-01', pnl: 50, manual: undefined,
    source: { provider: 'Tradovate', accountId: '7', pnlBasis: 'gross_before_fees', timeZone: 'UTC',
      openedAt: '2026-01-01T14:00:00.000Z', closedAt: `2026-01-01T14:0${index + 1}:00.000Z` } }));
  const current = risk.analyze(history, []);
  assert.equal(current.tradeCount, 1);
  assert.equal(current.trades.length, 2);
  assert.match(current.nextSessionBrief.evidence[0], /2 rows/);
  assert.deepEqual(withoutCopy(current), withoutCopy(original.exports.analyze(history, [])));
});
