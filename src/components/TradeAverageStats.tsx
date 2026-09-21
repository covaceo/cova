import { useMemo } from 'react';
import type { Trade } from '../lib/risk';
import { moneyText } from '../lib/journalAccuracy';
import { tradeAverages } from '../lib/tradeAverages';

export function TradeAverageStats({ trades, selectedTrades, detailsOnly = false }: { trades: readonly Trade[]; selectedTrades: readonly Trade[]; detailsOnly?: boolean }) {
  const averages = useMemo(() => tradeAverages(trades, selectedTrades), [trades, selectedTrades]);
  const basis = trades.every(row => row.source?.provider === 'Tradovate') ? 'Before fees' : 'Reported P&L; fee attribution unverified';
  const explanation = `${basis}. Known partial exits combined by opening fill; other rows counted separately. Range follows the last observed exit. Breakevens excluded. Rounded to cents. Full flat-to-flat coverage is not certified.`;
  const cells = [
    { id: 'average-winner', label: 'Average winner', amount: averages.winnerCents, count: averages.winners, population: 'winning' },
    { id: 'average-loser', label: 'Average loser', amount: averages.loserCents, count: averages.losers, population: 'losing' },
  ].map(cell => ({ ...cell, value: cell.amount === null ? '—' : `${cell.amount > 0n ? '+' : ''}${moneyText(cell.amount)}`, detail: averages.status === 'unavailable' ? averages.reason : cell.count ? `${cell.count} ${cell.population} ${cell.count === 1 ? 'result' : 'results'}. ${explanation}` : `No ${cell.population} results in this range. ${explanation}` }));
  if (detailsOnly) return <dl className="astra-metric-explanations">{cells.map(cell => <div data-metric={cell.id} key={cell.id}><dt>{cell.label}</dt><dd className="astra-stat-detail">{cell.detail}</dd></div>)}</dl>;
  return <div className="astra-average-strip">{cells.map(cell => <div className="astra-average-cell" data-astra-stat={cell.id} key={cell.id}>
    <div className="astra-stat-label">{cell.label}</div>
    <div className={`astra-stat-value ${cell.amount !== null && cell.amount < 0n ? 'astra-negative' : ''}`} aria-label={cell.amount === null ? cell.detail : undefined} title={cell.detail}>{cell.value}</div>
  </div>)}</div>;
}
