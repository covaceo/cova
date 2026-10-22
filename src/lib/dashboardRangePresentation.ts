export type ReviewRange = 'today' | 'week' | 'all';

/** Display only: the dashboard's existing range selection and accounting stay unchanged. */
export function reviewPeriod(trades: readonly { date: string }[], range: ReviewRange) {
  const dates = trades.map(trade => trade.date).sort();
  const end = dates[dates.length - 1];
  const anchor = range === 'week' ? 'Ends at latest trade' : range === 'today' ? 'Latest trade session' : 'All saved trades';
  if (!end) return { dates: 'No trade dates', anchor };
  const endDate = new Date(`${end}T12:00:00Z`);
  const startDate = new Date(`${range === 'all' ? dates[0] : end}T12:00:00Z`);
  if (range === 'week') startDate.setUTCDate(startDate.getUTCDate() - 6);
  if (!Number.isFinite(+startDate) || !Number.isFinite(+endDate)) return { dates: 'Dates unavailable', anchor };
  const format = (date: Date, year = true) => date.toLocaleDateString('en-US', {month:'short', day:'numeric', ...(year ? {year:'numeric' as const} : {}), timeZone:'UTC'});
  return { dates: +startDate === +endDate ? format(endDate) : `${format(startDate, startDate.getUTCFullYear() !== endDate.getUTCFullYear())} – ${format(endDate)}`, anchor };
}
