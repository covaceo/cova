// Synthetic only: no provider export or private account data.
export function windowFixture(overrides = {}) {
  return {
    version: 1, provider: 'synthetic', account: 'account-a', instrument: 'NQU6', currency: 'USD',
    coverage: 'complete', openingPosition: 0, closingPosition: 0,
    openingBoundaryRef: 'synthetic-flat-start', closingBoundaryRef: 'synthetic-flat-end',
    start: '2026-09-01T00:00:00.000Z', end: '2026-09-02T00:00:00.000Z',
    executions: [
      { id: 'e1', sequence: 1, at: '2026-09-01T12:00:00.000Z', quantity: 2, realizedPnl: '0.00', rowIds: [], session: 's1', decision: 'd1' },
      { id: 'e2', sequence: 2, at: '2026-09-01T12:01:00.000Z', quantity: 3, realizedPnl: '0.00', rowIds: [], session: 's1', decision: 'd2' },
      { id: 'e3', sequence: 3, at: '2026-09-01T12:02:00.000Z', quantity: -2, realizedPnl: '-85.00', rowIds: ['row-a'], session: 's1' },
      { id: 'e4', sequence: 4, at: '2026-09-01T12:03:00.000Z', quantity: -3, realizedPnl: '-129.00', rowIds: ['row-b'], session: 's1' },
    ], ...overrides,
  };
}
export function tradeFixture(overrides = {}) {
  return { id: 'row-a', date: '2026-09-01', market: 'NQ', side: 'Long', contracts: 2,
    entry: 19000.125, exit: 19001.125, pnl: -85, risk: 0, setup: 'Imported', notes: 'Synthetic note',
    source: { provider: 'Tradovate', accountId: 'account-a', openedAt: '2026-09-01T12:00:00.000Z', closedAt: '2026-09-01T12:03:00.000Z', timeZone: 'UTC', pnlBasis: 'gross_before_fees' }, ...overrides };
}
