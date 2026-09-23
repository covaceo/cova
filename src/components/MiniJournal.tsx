import { useMemo, useRef, useState } from 'react';
import { BookOpen, Paperclip, Search, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { groupJournalEntries, type Trade, type JournalEntryGroup } from '../lib/risk';
import { journalSummary, moneyText } from '../lib/journalAccuracy';
import type { DailyJournalEntry } from '../lib/dailyJournal';
export type JournalActions = {
  read: (date: string) => string;
  readEntry?: (date: string) => DailyJournalEntry;
  save: (date: string, note: string, tradeId?: string | null) => boolean;
};
function resultText(group: JournalEntryGroup) {
  const money = journalSummary(group.rows).money;
  return money.status === 'available' ? `${money.totalCents > 0n ? '+' : ''}${moneyText(money.totalCents)}` : '—';
}
export function MiniJournal({ initialDate, actions, trades = [], onOpenTrade }: {
  initialDate: string; actions?: JournalActions; trades?: Trade[]; onOpenTrade?: (id: string) => void;
}) {
  const read = (date: string) => actions?.readEntry?.(date) ?? { note: actions?.read(date) || '', tradeId: null };
  const [date, setDate] = useState(initialDate);
  const [entry, setEntry] = useState(() => read(initialDate));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(8);
  const attachButton = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const groups = useMemo(() => groupJournalEntries(trades).reverse(), [trades]);
  const linked = groups.find(group => group.rows.some(row => row.id === entry.tradeId));
  const matches = groups.filter(group => group.rows.some(row => `${row.date} ${row.market} ${row.side}`.toLowerCase().includes(query.trim().toLowerCase())));
  const closePicker = () => { setChoosing(false); attachButton.current?.focus(); };
  return <section className="astra-panel astra-journal mini-journal" aria-labelledby="astra-journal-title">
    <div className="astra-panel-heading"><h2 id="astra-journal-title"><BookOpen aria-hidden="true" />Journal</h2><input aria-label="Journal date" type="date" value={date} onChange={event => {
      if (dirty && !window.confirm('Discard the unsaved journal note?')) return;
      const next = event.target.value; setDate(next); setEntry(read(next)); setDirty(false); setStatus(''); setChoosing(false);
    }} /></div>
    <textarea aria-label="Journal note" rows={3} maxLength={2000} placeholder="What worked? What will you change next time?" value={entry.note} readOnly={!actions} onChange={event => { setEntry({ ...entry, note: event.target.value }); setDirty(true); setStatus(''); }} />
    <div className="journal-attachment-area">
      {entry.tradeId && <div className="journal-attached" data-journal-attachment>
        <button type="button" data-journal-linked-trade disabled={!linked || !onOpenTrade} onClick={() => linked && onOpenTrade?.(entry.tradeId!)}>
          <Paperclip aria-hidden="true" /><span>{linked ? <>{linked.rows[0].market} · {linked.rows[0].side}<small>{linked.rows[linked.rows.length - 1]?.date}{linked.rows.length > 1 ? ` · ${linked.rows.length} partial exits` : ''}</small></> : 'Attached trade is no longer available'}</span>
          {linked && <span className={linked.pnl < 0 ? 'astra-negative' : ''}>{resultText(linked)}</span>}
        </button>
        <button type="button" aria-label="Remove attached trade" onClick={() => { setEntry({ ...entry, tradeId: null }); setDirty(true); setStatus(''); }}><X aria-hidden="true" /></button>
      </div>}
      <button ref={attachButton} className="journal-attach-button" type="button" disabled={!actions || !trades.length} aria-expanded={choosing} aria-controls="journal-trade-picker" onClick={() => { setChoosing(!choosing); setQuery(''); setShown(8); }}><Paperclip aria-hidden="true" />{entry.tradeId ? 'Change trade' : 'Attach trade'}</button>
      {choosing && <motion.div id="journal-trade-picker" className="journal-trade-picker" role="region" aria-label="Choose a trade" initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 550, damping: 38 }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePicker(); } }}>
        <label><Search aria-hidden="true" /><input autoFocus type="search" aria-label="Search saved trades" placeholder="Search symbol, side or date" value={query} onChange={event => { setQuery(event.target.value); setShown(8); }} /></label>
        <div className="journal-trade-options">{matches.slice(0, shown).map(group => <button type="button" key={group.id} data-journal-trade-option={group.rows[0].id} onClick={() => { setEntry({ ...entry, tradeId: group.rows[0].id }); setDirty(true); setStatus(''); closePicker(); }}>
          <span>{group.rows[0].market} · {group.rows[0].side}<small>{group.rows[group.rows.length - 1]?.date}{group.rows.length > 1 ? ` · ${group.rows.length} partial exits` : ''}</small></span><span className={group.pnl < 0 ? 'astra-negative' : ''}>{resultText(group)}</span>
        </button>)}</div>
        {!matches.length && <p role="status">No matching saved trades.</p>}
        {matches.length > shown && <button className="journal-attach-button" type="button" onClick={() => setShown(value => value + 20)}>Show more trades</button>}
      </motion.div>}
    </div>
    <div className="mini-journal-footer"><span role="status">{status || (dirty ? 'Unsaved changes' : 'Private · saved on this browser')}</span><button className="astra-button" type="button" disabled={!actions || !dirty} onClick={() => {
      if (entry.tradeId && !linked) { setStatus('Remove the unavailable trade before saving.'); return; }
      if (actions?.save(date, entry.note, entry.tradeId)) { setDirty(false); setStatus('Saved'); }
      else setStatus('Not saved. Reopen this account and try again.');
    }}>Save note</button></div>
  </section>;
}
