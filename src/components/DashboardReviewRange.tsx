import { reviewPeriod, type ReviewRange } from '../lib/dashboardRangePresentation';
import type { CashSummary } from '../lib/brokerCash';

type Props = { trades: readonly {date: string}[]; range: ReviewRange; onChange: (range: ReviewRange) => void; cash: CashSummary | null };
export function DashboardReviewRange({ trades, range, onChange, cash }: Props) {
  const period = reviewPeriod(trades, range);
  return <div className="dashboard-review-range" aria-label="Dashboard review period">
    <div className="dashboard-range-controls astra-segmented" role="group" aria-label="Dashboard review range">
      {([{id:'today',label:'Latest session'},{id:'week',label:'Last 7 days'},{id:'all',label:'All trades'}] as const).map(option => <button aria-pressed={range === option.id} className={range === option.id ? 'dashboard-range-active' : ''} key={option.id} onClick={() => onChange(option.id)} type="button">{option.label}</button>)}
    </div>
    <div className="dashboard-review-period" aria-live="polite" aria-atomic="true"><span>{period.dates}</span><small>{period.anchor}</small>
      {cash?.status === 'available' && <small className="dashboard-review-cash-period">Cash report: {cash.startDate} to {cash.endDate} · UTC, end exclusive</small>}
    </div>
  </div>;
}
