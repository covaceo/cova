import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Trade } from '../lib/risk';
import { brokerCashSummary } from '../lib/brokerCash';
import { moneyText } from '../lib/journalAccuracy';
import { buildCalendarMonth, shiftCalendarMonth } from '../lib/tradingCalendar';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fullMoney = (value: string) => `${BigInt(value) > 0n ? '+' : ''}${moneyText(BigInt(value))}`;
const compactMoney = (value: string) => {
  const amount = Number(value) / 100;
  return new Intl.NumberFormat('en-US', { notation: Math.abs(amount) >= 1000 ? 'compact' : 'standard',
    minimumFractionDigits: Math.abs(amount) >= 1000 ? 0 : 2, maximumFractionDigits: Math.abs(amount) >= 1000 ? 1 : 2,
    signDisplay: 'exceptZero', useGrouping: false }).format(amount);
};

export function TradingCalendar({ trades, initialMonth }: { trades: Trade[]; initialMonth?: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [month, setMonth] = useState(() => initialMonth ?? [...trades].map(t => t.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d).sort().pop()?.slice(0, 7) ?? today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh(n => n + 1);
    window.addEventListener('cova-broker-cash-updated', update);
    window.addEventListener('storage', update);
    window.addEventListener('focus', update);
    return () => { window.removeEventListener('cova-broker-cash-updated', update); window.removeEventListener('storage', update); window.removeEventListener('focus', update); };
  }, []);
  const days = buildCalendarMonth(month, trades, brokerCashSummary(trades, 'all'));
  const selectedDay = days.find(day => day.date === selected && day.inMonth && day.status !== 'idle');
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const move = (value: string) => { setMonth(value); setSelected(null); };
  return <section className="astra-panel trading-calendar" aria-labelledby="trading-calendar-title">
    <div className="astra-panel-heading calendar-heading">
      <h2 id="trading-calendar-title">Trading calendar</h2>
      <div className="calendar-controls">
        <button type="button" className="calendar-today" onClick={() => move(today.slice(0, 7))}>Today</button>
        <button type="button" aria-label="Previous month" onClick={() => move(shiftCalendarMonth(month, -1))}><ChevronLeft aria-hidden="true" /></button>
        <span className="calendar-month" aria-live="polite">{monthLabel}</span>
        <button type="button" aria-label="Next month" onClick={() => move(shiftCalendarMonth(month, 1))}><ChevronRight aria-hidden="true" /></button>
      </div>
    </div>
    <table className="calendar-table" aria-label={`${monthLabel} daily P&L in USD`}>
      <thead><tr>{weekdays.map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
      <tbody>{Array.from({ length: days.length / 7 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map(day => {
        const active = day.inMonth && day.status !== 'idle';
        const content = <><time dateTime={day.date}>{Number(day.date.slice(-2))}</time>{active && <span className="calendar-pnl">
          <span className="calendar-pnl-full">{day.pnlCents === null ? '—' : fullMoney(day.pnlCents)}</span>
          <span className="calendar-pnl-compact" aria-hidden="true">{day.pnlCents === null ? '—' : compactMoney(day.pnlCents)}</span>
        </span>}</>;
        return <td key={day.date} data-calendar-date={day.date} data-calendar-state={day.inMonth ? day.status : 'outside'} className={`calendar-day calendar-day--${day.inMonth ? day.status : 'outside'}`}>
          {active ? <button type="button" className="calendar-day-content" aria-pressed={selected === day.date} aria-current={day.date === today ? 'date' : undefined}
            aria-label={`${day.date}, ${day.pnlCents === null ? 'recorded trades, P&L unavailable' : fullMoney(day.pnlCents)}`} title={day.pnlCents === null ? 'P&L unavailable' : fullMoney(day.pnlCents)} onClick={() => setSelected(selected === day.date ? null : day.date)}>{content}</button>
            : <div className="calendar-day-content" aria-label={`${day.date}, no recorded trades`} aria-current={day.date === today ? 'date' : undefined}>{content}</div>}
        </td>;
      })}</tr>)}</tbody>
    </table>
    {selectedDay && <div className="calendar-selection" aria-live="polite"><time dateTime={selectedDay.date}>{new Date(selectedDay.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</time><strong>{selectedDay.pnlCents === null ? 'P&L unavailable' : fullMoney(selectedDay.pnlCents)}</strong></div>}
  </section>;
}
