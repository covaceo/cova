import { formatMoney, type JournalEntryGroup, type Trade } from '../lib/risk';
import { rowMoneyText } from '../lib/journalAccuracy';

function closedLabel(trade: Trade) {
  return trade.source?.provider === 'Tradovate' && trade.source.closedAt
    ? trade.source.closedAt.replace('T', ' ').replace('.000Z', ' UTC') : trade.date;
}

/** A presentation group only. Every original source row and annotation stays in the ledger. */
export function JournalEntryRow({ group, journalReview }: { group: JournalEntryGroup; journalReview: boolean }) {
  const rows = [...group.rows].sort((a,b) => closedLabel(a).localeCompare(closedLabel(b)));
  const first = rows[0], last = rows[rows.length-1], partial = rows.length > 1;
  const money = (row: Trade, value: number) => journalReview ? rowMoneyText(row, value) : formatMoney(value);
  return <tr data-history-trade={first.id} data-entry-group={group.id} className="border-b border-white/10">
    <td className="whitespace-nowrap p-3">{closedLabel(last)}</td>
    <td className="p-3">{first.market}</td><td className="p-3">{first.side}</td>
    <td className="p-3">{group.contracts}</td>
    <td className="whitespace-nowrap p-3">{money(first, group.pnl)}</td>
    <td className="whitespace-nowrap p-3">{partial ? 'See exits' : first.risk > 0 ? money(first, first.risk) : 'Not provided'}</td>
    <td className="min-w-40 max-w-80 break-words p-3">{partial ? <details>
      <summary className="cursor-pointer">{rows.length} partial exits</summary>
      <ul className="mt-3 space-y-3">{rows.map(row => <li data-partial-exit={row.id} key={row.id}>
        <p>{closedLabel(row)} · {row.contracts} closed @ {row.exit}</p>
        <p>{money(row, row.pnl)} · Risk: {row.risk > 0 ? money(row, row.risk) : 'Not provided'}</p>
        <p>{row.notes || 'No note'}</p>
      </li>)}</ul>
    </details> : first.notes || 'No note'}</td>
  </tr>;
}
