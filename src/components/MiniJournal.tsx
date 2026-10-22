import { readJournalDraft, saveJournalDraft, clearJournalDraft } from "../lib/journalDrafts";
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Paperclip, Search, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { groupJournalEntries, type Trade, type JournalEntryGroup } from '../lib/risk';
import { journalSummary, moneyText } from '../lib/journalAccuracy';
import type { DailyJournalEntry } from '../lib/dailyJournal';
import { readJournalEditorDate, rememberJournalEditorDate } from '../lib/journalNavigation';
import { validJournalDate } from '../lib/manualTrades';
const isMobileJournal = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 850px)').matches;
export type JournalActions = {
  /** Public sample: in-memory only, no owner drafts or account navigation guards. */
  ephemeral?: boolean;
  accountStorage?: boolean;
  draftKey?: string;
  read: (date: string) => string;
  readEntry?: (date: string) => DailyJournalEntry;
  list?: () => (DailyJournalEntry & { date: string })[];
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
  const [date, setDate] = useState(() => isMobileJournal() && !actions?.ephemeral ? readJournalEditorDate(actions?.draftKey, initialDate) : initialDate);
  const draftScope = (d: string) => !actions?.ephemeral && actions?.draftKey ? JSON.stringify(["daily",actions.draftKey,d]) : undefined;
  const restored = (d: string) => {
    const v = readJournalDraft<DailyJournalEntry>(draftScope(d));
    return v && typeof v.note === "string" && (v.tradeId === null || typeof v.tradeId === "string") ? v : null;
  };
  const [entry, setEntry] = useState(() => restored(date) ?? read(date));
  const [dirty, setDirty] = useState(() => !!restored(date));
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (actions?.ephemeral) return;
    const guard = (event: Event) => { if (dirty) { if (!window.confirm('Discard the unsaved journal note?')) event.preventDefault(); else { clearJournalDraft(draftScope(date)); setDirty(false); } } };
    window.addEventListener('cova:before-account-change', guard);
    return () => window.removeEventListener('cova:before-account-change', guard);
  }, [dirty, actions?.draftKey, actions?.ephemeral, date]);
  // Owner refs are committed in the parent's layout effect. Hydrate afterward,
  // but never replace a draft when the parent refreshes its guarded actions.
  useEffect(() => {
    if (dirty) return;
    const saved = actions?.readEntry?.(date) ?? { note: actions?.read(date) || '', tradeId: null };
    setEntry(current => current.note === saved.note && current.tradeId === saved.tradeId ? current : saved);
  }, [actions, date, dirty]);
  const edit = (next: DailyJournalEntry) => {
    setEntry(next); setDirty(true);
    setStatus(actions?.ephemeral ? "Unsaved sample note" : saveJournalDraft(draftScope(date), next) ? "Unsaved changes · draft kept on this browser" : "Draft is not backed up. Keep this page open.");
  };
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(8);
  const attachButton = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const groups = useMemo(() => groupJournalEntries(trades).reverse(), [trades]);
  const linked = groups.find(group => group.rows.some(row => row.id === entry.tradeId));
  const matches = groups.filter(group => group.rows.some(row => `${row.date} ${row.market} ${row.side}`.toLowerCase().includes(query.trim().toLowerCase())));
  const closePicker = () => { setChoosing(false); attachButton.current?.focus(); };
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyShown, setHistoryShown] = useState(8);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const history = historyOpen ? actions?.list?.() ?? [] : [];
  const changeDate = (next: string) => {
    if (!validJournalDate(next) || next === date) return;
    if (dirty) {
      if (isMobileJournal() && !actions?.ephemeral) {
        if (!saveJournalDraft(draftScope(date), entry)) { setStatus('Draft is not backed up. Save this note before changing dates.'); return; }
      } else {
        if (!window.confirm('Discard the unsaved journal note?')) return;
        clearJournalDraft(draftScope(date));
      }
    }
    if (!actions?.ephemeral) rememberJournalEditorDate(actions?.draftKey, next);
    const draft = restored(next);
    setDate(next); setEntry(draft ?? read(next)); setDirty(!!draft); setStatus(''); setChoosing(false); setHistoryOpen(false);
  };
  return <section className="astra-panel astra-journal mini-journal" aria-labelledby="astra-journal-title">
    <div className="astra-panel-heading"><h2 id="astra-journal-title"><BookOpen aria-hidden="true" />Journal</h2><input className="journal-desktop-date" aria-label="Journal date" type="date" value={date} onChange={event => changeDate(event.target.value)} /></div>
    <div className="journal-mobile-tools">
      <label className="journal-mobile-date"><span>Date</span><input aria-label="Journal date" type="date" value={date} onChange={event => changeDate(event.target.value)} /></label>
      <button type="button" onClick={() => changeDate(new Date().toLocaleDateString('en-CA'))}>Today</button>
      {actions?.list && <button type="button" aria-expanded={historyOpen} aria-controls="journal-saved-notes" onClick={() => { setHistoryOpen(!historyOpen); setHistoryShown(8); }}>Saved notes</button>}
    </div>
    {historyOpen && <div className="journal-saved-notes" id="journal-saved-notes" role="region" aria-label="Saved journal notes">
      {history.slice(0, historyShown).map(saved => <button type="button" key={saved.date} data-journal-saved-date={saved.date} onClick={() => { changeDate(saved.date); setHistoryOpen(false); noteInput.current?.focus(); }}><time dateTime={saved.date}>{new Date(saved.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</time><span>{saved.note.trim() || 'Attached trade'}</span></button>)}
      {!history.length && <p>No saved notes yet.</p>}
      {history.length > historyShown && <button type="button" onClick={() => setHistoryShown(n => n + 8)}>Show more notes</button>}
    </div>}
    <textarea ref={noteInput} aria-label="Journal note" rows={3} maxLength={2000} placeholder={actions?.ephemeral ? 'What worked? What will you change next time?' : 'Session note'} value={entry.note} readOnly={!actions} onChange={event => { edit({ ...entry, note: event.target.value }); }} />
    <div className="journal-attachment-area">
      {entry.tradeId && <div className="journal-attached" data-journal-attachment>
        <button type="button" data-journal-linked-trade disabled={!linked || !onOpenTrade} onClick={() => linked && onOpenTrade?.(entry.tradeId!)}>
          <Paperclip aria-hidden="true" /><span>{linked ? <>{linked.rows[0].market} · {linked.rows[0].side}<small>{linked.rows[linked.rows.length - 1]?.date}{linked.rows.length > 1 ? ` · ${linked.rows.length} partial exits` : ''}</small></> : 'Attached trade is no longer available'}</span>
          {linked && <span className={linked.pnl < 0 ? 'astra-negative' : ''}>{resultText(linked)}</span>}
        </button>
        <button type="button" aria-label="Remove attached trade" onClick={() => { edit({ ...entry, tradeId: null }); }}><X aria-hidden="true" /></button>
      </div>}
      <button ref={attachButton} className="journal-attach-button" type="button" disabled={!actions || !trades.length} aria-expanded={choosing} aria-controls="journal-trade-picker" onClick={() => { setChoosing(!choosing); setQuery(''); setShown(8); }}><Paperclip aria-hidden="true" />{entry.tradeId ? 'Change trade' : 'Attach trade'}</button>
      {choosing && <motion.div id="journal-trade-picker" className="journal-trade-picker" role="region" aria-label="Choose a trade" initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 550, damping: 38 }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePicker(); } }}>
        <label><Search aria-hidden="true" /><input autoFocus type="search" aria-label="Search saved trades" placeholder="Search symbol, side or date" value={query} onChange={event => { setQuery(event.target.value); setShown(8); }} /></label>
        <div className="journal-trade-options">{matches.slice(0, shown).map(group => <button type="button" key={group.id} data-journal-trade-option={group.rows[0].id} onClick={() => { edit({ ...entry, tradeId: group.rows[0].id }); closePicker(); }}>
          <span>{group.rows[0].market} · {group.rows[0].side}<small>{group.rows[group.rows.length - 1]?.date}{group.rows.length > 1 ? ` · ${group.rows.length} partial exits` : ''}</small></span><span className={group.pnl < 0 ? 'astra-negative' : ''}>{resultText(group)}</span>
        </button>)}</div>
        {!matches.length && <p role="status">No matching saved trades.</p>}
        {matches.length > shown && <button className="journal-attach-button" type="button" onClick={() => setShown(value => value + 20)}>Show more trades</button>}
      </motion.div>}
    </div>
    <div className="mini-journal-footer"><span role="status">{status || (dirty ? 'Unsaved changes' : actions?.ephemeral ? 'Sample note · resets on reload' : actions?.accountStorage ? 'Private · check account storage for sync status' : 'Private · saved on this browser')}</span><button className="astra-button" type="button" disabled={!actions || !dirty} onClick={() => {
      if (entry.tradeId && !linked) { setStatus('Remove the unavailable trade before saving.'); return; }
      if (actions?.save(date, entry.note, entry.tradeId)) { clearJournalDraft(draftScope(date)); setDirty(false); setStatus(actions?.ephemeral ? 'Saved to this sample · resets on reload' : 'Saved'); }
      else setStatus('Not saved. Reopen this account and try again.');
    }}>Save note</button></div>
  </section>;
}
