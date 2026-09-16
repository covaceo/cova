import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
import { existsSync } from 'node:fs';
import { windowFixture, tradeFixture } from './fixtures/journal-synthetic.mjs';

test('verified flat-to-flat executions combine scale-ins and partial exits as one completed loss', () => {
  const api = accuracy();
  assert.equal(typeof api.certifyEpisodes, 'function', 'Versioned execution evidence API exists');
  const input = windowFixture();
  const original = structuredClone(input);
  const result = api.certifyEpisodes(input);
  assert.equal(result.status, 'complete');
  assert.equal(result.version, 1);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].pnlCents, -21400n);
  assert.equal(result.groups[0].maxPosition, 5);
  assert.deepEqual(result.groups[0].rowIds, ['row-a', 'row-b']);
  assert.deepEqual(result.groups[0].executionIds, ['e1', 'e2', 'e3', 'e4']);
  assert.deepEqual(input, original, 'No mutation of evidence');
});
test('uncertified boundaries or ambiguous executions invalidate the whole window, never a subset', () => {
  const { certifyEpisodes } = accuracy();
  const base = windowFixture();
  const bad = [
    { coverage: 'partial' }, { version: 2 }, { openingPosition: 1 }, { closingPosition: 1 },
    { openingBoundaryRef: '' }, { closingBoundaryRef: '' }, { instrument: '' }, { currency: 'EUR' },
    { executions: base.executions.slice(0, -1) },
    { executions: [...base.executions, base.executions[0]] },
    { executions: [base.executions[1], base.executions[0], ...base.executions.slice(2)] },
    { executions: base.executions.map(e => ({ ...e, sequence: 1 })) },
    { executions: base.executions.map((e,i) => i === 2 ? {...e, quantity: -6} : e) },
    { executions: base.executions.map((e,i) => i === 2 ? {...e, realizedPnl: '1.001'} : e) },
    { executions: base.executions.map((e,i) => i === 3 ? {...e, rowIds: ['row-a']} : e) },
    { executions: base.executions.map((e,i) => i === 0 ? {...e, quantity: 0.5} : e) },
    { executions: base.executions.map(e => ({...e, at: 'invalid'})) },
    { start: '2026-09-01T12:01:00.000Z' },
  ];
  for (const change of bad) {
    const result = certifyEpisodes(windowFixture(change));
    assert.equal(result.status, 'unavailable', JSON.stringify(change));
    assert.deepEqual(result.groups, [], 'Do not silently omit bad groups');
    assert.ok(result.reason);
  }
  const tied = windowFixture({executions: base.executions.map(e => ({...e, at: base.executions[0].at}))});
  assert.equal(certifyEpisodes(tied).status, 'complete', 'Source sequence proves equal-time order');
  assert.equal(certifyEpisodes({...tied, executions: tied.executions.map(e => ({...e, sequence: undefined}))}).status, 'unavailable');
});

test('completed headlines reconcile every scoped row and include breakevens in the denominator', () => {
  const api = accuracy();
  assert.equal(typeof api.completedMetrics, 'function');
  const losing = windowFixture();
  const winning = windowFixture({account: 'account-b', executions: losing.executions.map(e => ({...e, id: e.id+'b', rowIds: e.rowIds.map(id => id+'b'), realizedPnl: e.realizedPnl.replace('-', '')}))});
  const flat = windowFixture({instrument: 'NQZ6', executions: losing.executions.map(e => ({...e, id: e.id+'c', rowIds: e.rowIds.map(id => id+'c'), realizedPnl: '0.00'}))});
  const rows = [losing, winning, flat].flatMap(w => w.executions.flatMap(e => e.rowIds.map(id => ({id, pnl: e.realizedPnl, provider: w.provider, account: w.account, instrument: w.instrument, currency: w.currency}))));
  const result = api.completedMetrics([losing, winning, flat], rows);
  assert.equal(result.status, 'available');
  assert.equal(result.wins, 1);
  assert.equal(result.total, 3);
  assert.equal(result.winRateText, '33.33%');
  assert.equal(result.biggestLossCents, -21400n);
  assert.equal(api.completedMetrics([winning], rows.slice(2,4)).biggestLossCents, 0n);
  assert.equal(api.completedMetrics([], []).status, 'unavailable');
  for (const badRows of [rows.slice(1), [...rows, rows[0]], rows.map((r,i) => i ? r : {...r, pnl: '-84.00'}), rows.map((r,i) => i ? r : {...r, account: 'wrong'}), rows.map((r,i) => i ? r : {...r, currency: 'EUR'})]) {
    assert.equal(api.completedMetrics([losing, winning, flat], badRows).status, 'unavailable');
  }
  assert.equal(api.completedMetrics([losing, winning, {...flat, coverage:'partial'}], rows).status, 'unavailable');
  assert.equal(api.completedMetrics([losing, losing], rows.slice(0,2)).status, 'unavailable');
});

test('supported Tradovate USD futures retain exact money and chart rather than losing working account data', () => {
  const api = accuracy();
  const rows = [tradeFixture({pnl:675.5,market:'MNQ',source:{provider:'Tradovate',accountId:'fixture',pnlBasis:'gross_before_fees'}})];
  const result = api.journalSummary(rows);
  assert.equal(result.money.status, 'available');
  assert.equal(result.money.totalCents, 67550n);
  assert.equal(api.rowMoneyText(rows[0],675.5),'$675.50');
  assert.equal(result.money.equityPoints.at(-1).value,675.5);
});

test('raw ledger reconciliation is exact without upgrading matched pairs to completed trades', () => {
  const api = accuracy();
  assert.equal(typeof api.journalSummary, 'function');
  const source = {provider:'Rithmic', accountKey:'synthetic-key', accountId:'account-a', currency:'USD'};
  const rows = [0.1, 0.2, -0.3].map((pnl,i) => tradeFixture({id:`r${i}`, pnl, source}));
  const snapshot = structuredClone(rows);
  const result = api.journalSummary(rows);
  assert.equal(result.money.status, 'available');
  assert.equal(result.money.totalCents, 0n);
  assert.equal(result.money.equityPoints.at(-1).value, 0);
  assert.equal(result.completed.status, 'unavailable');
  assert.match(result.completed.reason, /flat|boundar/i);
  assert.equal(result.fees, null);
  assert.equal(result.avgR, null);
  assert.equal(result.rowCount, 3);
  assert.deepEqual(result.setupNames, []);
  assert.deepEqual(rows, snapshot);
  for (const bad of [[...rows, rows[0]], [rows[0], {...rows[1], pnl: 0.001}], [rows[0], {...rows[1], source:{...source,currency:'EUR'}}]]) {
    assert.equal(api.journalSummary(bad).money.status, 'unavailable');
  }
  const matched = api.journalSummary([tradeFixture({source:undefined}),tradeFixture({id:'row-b',pnl:-129,source:undefined})]);
  assert.equal(matched.reconciledCents, -21400n, 'Even unsupported currency has independent raw decimal reconciliation');
  assert.equal(matched.money.status, 'unavailable', 'No guessed source currency');
  assert.match(matched.money.reason, /currency/i);
});

test('discipline withholds numeric verdicts when rules or completion evidence are missing', () => {
  const api = accuracy();
  assert.equal(typeof api.disciplineReview, 'function');
  const unavailable = {status:'unavailable',reason:'Flat boundaries unavailable'};
  assert.equal(api.disciplineReview([], unavailable, ['row-a']).status, 'unconfigured');
  const rule = {id:'size',name:'Max contracts',metric:'maxContracts',limit:3,enabled:true,severity:'warning'};
  const result = api.disciplineReview([rule], unavailable, ['row-a','row-b']);
  assert.equal(result.status, 'insufficient evidence');
  assert.equal(result.score, null);
  assert.equal(result.judgments[0].observed, null);
  assert.equal(result.judgments[0].threshold, 3);
  assert.deepEqual(result.judgments[0].rowIds, ['row-a','row-b']);
  assert.deepEqual(result.judgments[0].coverage, {checked:0,total:2,unit:'rows'});
  assert.match(result.judgments[0].reason, /boundar/i);
  assert.match(result.basis, /retrospective.*not.*plan/i);
});

test('a single matched quantity above the limit proves a size breach without inventing trade grouping', () => {
  const api = accuracy();
  const row = tradeFixture({contracts:6});
  const rule = {id:'size',name:'Max contracts',metric:'maxContracts',limit:5,enabled:true,severity:'warning'};
  const incomplete = {status:'unavailable',reason:'Full grouping unavailable'};
  const result = api.disciplineReview([rule],incomplete,[row.id],[row]);
  assert.equal(result.status,'breach detected');
  assert.equal(result.judgments[0].observed,6);
  assert.equal(result.score,null);
  assert.equal(api.disciplineReview([rule],incomplete,[row.id],[{...row,contracts:2}]).status,'insufficient evidence');
});

test('independent current-limit outcomes separate breaches, positive checks and profitability', () => {
  const { disciplineReview, completedMetrics } = accuracy();
  const window = windowFixture();
  const rows = window.executions.flatMap(e => e.rowIds.map(id => ({id,pnl:e.realizedPnl,provider:window.provider,account:window.account,instrument:window.instrument,currency:window.currency})));
  const completed = completedMetrics([window], rows);
  const rules = [{id:'size',name:'Size',metric:'maxContracts',limit:3,enabled:true}, {id:'loss',name:'Loss',metric:'maxTradeLoss',limit:300,enabled:true}, {id:'pf',name:'Profit factor',metric:'minProfitFactor',limit:1,enabled:true}, {id:'r',name:'Average R',metric:'minAvgR',limit:1,enabled:true}];
  const result = disciplineReview(rules, completed, rows.map(r=>r.id));
  assert.equal(result.status, 'breach detected');
  assert.deepEqual(result.judgments.map(j=>j.status), ['breach detected','within configured limits','not applicable','insufficient evidence']);
  assert.equal(result.judgments[0].observed, 5);
  assert.equal(result.judgments[1].observed, 21400n);
  assert.deepEqual(result.judgments[0].coverage, {checked:1,total:1,unit:'groups'});
  assert.deepEqual(result.judgments[0].rowIds, ['row-a','row-b']);
  assert.equal(disciplineReview([rules[1]],completed,[]).status, 'within configured limits');
  assert.equal(disciplineReview([rules[2]],completed,[]).status, 'not applicable');
  assert.equal(result.score, null);
});

function accuracy() {
  assert.ok(existsSync('src/lib/journalAccuracy.ts'), 'Exact, non-destructive journal analytics module exists');
  return load('src/lib/journalAccuracy.ts');
}

test('canonical money reconciles decimal inputs exactly and refuses fractional cents or unsafe amounts', () => {
  const { cents, sumCents, moneyText } = accuracy();
  assert.equal(sumCents(['0.10', 0.20, '-0.30']), 0n);
  assert.equal(cents('-214.00'), -21400n);
  assert.equal(moneyText(-21400n), '−$214.00');
  assert.equal(moneyText(0n), '$0.00');
  for (const invalid of [NaN, Infinity, '1.001', '1e3', '', ' 1 ', '90071992547409.92', 0.1 + 0.2]) {
    assert.throws(() => cents(invalid), /money/i, String(invalid));
  }
  assert.throws(() => sumCents(['90071992547409.91', '.01']), /money/i);
});

test('operational money preserves two decimals, including integer and zero amounts', () => {
  const { formatMoney } = load('src/lib/risk.ts');
  const { signedMoney } = load('src/lib/dashboardPresentation.ts');
  assert.equal(formatMoney(675.5), '$675.50');
  assert.equal(formatMoney(-675), '-$675.00');
  assert.equal(formatMoney(0), '$0.00');
  assert.equal(signedMoney(675), '+$675.00');
  assert.equal(signedMoney(0), '$0.00');
});
