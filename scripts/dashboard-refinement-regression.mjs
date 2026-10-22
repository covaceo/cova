import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const load = require('./helpers/load-ts.cjs');

test('review period describes the latest imported session, not the wall clock', () => {
  const { reviewPeriod } = load('src/lib/dashboardRangePresentation.ts');
  const trades = [{date:'2026-05-06'}, {date:'2026-04-21'}, {date:'2026-05-01'}];
  assert.deepEqual(reviewPeriod(trades, 'week'), {dates:'Apr 30 – May 6, 2026', anchor:'Ends at latest trade'});
  assert.deepEqual(reviewPeriod(trades, 'today'), {dates:'May 6, 2026', anchor:'Latest trade session'});
  assert.deepEqual(reviewPeriod(trades, 'all'), {dates:'Apr 21 – May 6, 2026', anchor:'All saved trades'});
  assert.deepEqual(reviewPeriod([], 'all'), {dates:'No trade dates', anchor:'All saved trades'});
  assert.deepEqual(reviewPeriod([{date:'2026-01-03'}], 'week'), {dates:'Dec 28, 2025 – Jan 3, 2026', anchor:'Ends at latest trade'});
  assert.deepEqual(trades.map(t=>t.date), ['2026-05-06','2026-04-21','2026-05-01']);
});
