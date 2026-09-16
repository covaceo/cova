import { Info, ArrowUpRight } from 'lucide-react';
import type { RiskRule } from '../lib/risk';
import { disciplineReview, journalSummary, moneyText } from '../lib/journalAccuracy';

type Journal = ReturnType<typeof journalSummary>;
export function JournalHeadlineStats({ journal }: { journal: Journal }) {
  const money = journal.money;
  const cells = [
    { id: 'pnl', label: 'Reported P&L', value: money.status === 'available' ? moneyText(money.totalCents) : 'Unavailable', detail: money.status === 'available' ? `${journal.rowCount} raw rows · Fees unknown; not net P&L` : money.reason },
    { id: 'win-rate', label: 'Completed-trade win rate', value: 'Unavailable', detail: journal.rowCount ? `Matched fills: ${(journal.matchedWins / journal.rowCount * 100).toFixed(2)}% (${journal.matchedWins}/${journal.rowCount}). Completed positions unverified.` : 'No completed positions to review' },
    { id: 'profit-factor', label: 'Raw-row profit factor', value: money.status !== 'available' ? 'Unavailable' : money.lossCents ? (Number(money.profitCents) / Number(money.lossCents)).toFixed(2) : money.profitCents ? '∞' : 'Unavailable', detail: 'Positive row amounts / negative row amounts; not discipline' },
    { id: 'biggest-loss', label: 'Biggest loss', value: 'Unavailable', detail: 'One completed position, including partial exits; boundaries unverified' },
  ];
  return <div data-journal-accuracy="v1"><div className="astra-stat-strip">{cells.map(cell => <div className="astra-stat-cell" data-astra-stat={cell.id} key={cell.id}><div className="astra-stat-label">{cell.label}<Info aria-hidden="true" /></div><div className="astra-stat-value" style={cell.value === 'Unavailable' ? { fontSize: '1.25rem' } : undefined}>{cell.value}</div><div className="astra-stat-detail">{cell.detail}</div></div>)}</div><p className="astra-chart-note">{journal.completed.reason} Fees unknown. Missing planned risk means R is unavailable.</p></div>;
}

export function JournalDisciplineReview({ journal, rules, onRules }: { journal: Journal; rules: RiskRule[]; onRules: () => void }) {
  const review = disciplineReview(rules, journal.completed, journal.rowIds, journal.rows);
  return <section className="astra-panel astra-discipline" aria-labelledby="astra-discipline-title">
    <div className="astra-panel-heading"><div><h2 id="astra-discipline-title">Discipline review</h2><p>{review.basis}</p></div></div>
    <div style={{ padding: '0 24px 24px' }}>
    <h3 data-discipline-status={review.status}>{review.status}</h3>
    <p>No numerical score until the required evidence is available. {journal.rowCount} matched rows checked.</p>
    <button className="astra-text-link" type="button" onClick={onRules}>Review current rules <ArrowUpRight aria-hidden="true" /></button>
    <details className="astra-evidence-details"><summary>Rule evidence and coverage</summary>
      {review.judgments.length ? review.judgments.map(j => <div className="astra-mini-note" key={j.ruleId}>
        <h4>{j.label}: {j.status}</h4><p>{j.reason}</p>
        <p>Observed: {j.observed === null ? 'unavailable' : String(j.observed)} · Current threshold: {j.threshold} · Checked: {j.coverage.checked}/{j.coverage.total} {j.coverage.unit}</p>
        <details><summary>Source rows ({j.rowIds.length})</summary><p style={{ overflowWrap: 'anywhere' }}>{j.rowIds.join(', ') || 'None'}</p></details>
      </div>) : <p>No enabled rules. Configure a limit before requesting a rule review.</p>}
    </details>
    </div>
  </section>;
}
