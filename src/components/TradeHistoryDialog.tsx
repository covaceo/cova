import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { groupJournalEntries, type Trade } from "../lib/risk";
import { journalSummary } from "../lib/journalAccuracy";
import { JournalHeadlineStats } from "./JournalAccuracyPanels";
import { JournalEntryRow } from "./JournalEntryRow";

/** Read-only view of the same owner/account-scoped ledger. Never writes or merges rows. */
export function TradeHistoryDialog({ trades, journalReview, onClose }: {
  trades: Trade[]; journalReview: boolean; onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const groups = useMemo(() => groupJournalEntries(trades), [trades]);
  const journal = useMemo(() => journalSummary(trades), [trades]);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(groups.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  useEffect(() => setPage(0), [trades]);
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => {
        if (opener?.isConnected && !document.querySelector('dialog[open]')) opener.focus();
      });
    };
  }, []);
  return <dialog ref={dialogRef} className="astra-trade-dialog astra-history-dialog" data-full-trade-history aria-labelledby="trade-history-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),summary,[tabindex="0"]')).filter(control => control.checkVisibility());
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <header className="astra-history-header">
      <div><h2 id="trade-history-title">Trade history</h2><p>{groups.length} trade entries · All dates</p></div>
      <button className="astra-dialog-close" type="button" onClick={onClose} aria-label="Close trade history"><X aria-hidden="true" /></button>
    </header>
    <section aria-label="Saved trade history" className="astra-history-body">
      <div className="astra-history-meta"><span>Gross / reported P&amp;L</span><details><summary>Data details</summary>
        <p>{groups.length} trade entries from {trades.length} saved rows. Partial exits with the same broker entry ID appear together. Tradovate times are UTC and P&amp;L is gross before fees. Older saved history stays here after an empty or failed sync.</p>
      </details></div>
      {journalReview && <JournalHeadlineStats journal={journal} />}
      <div className="astra-history-scroll" tabIndex={0} role="region" aria-label="Trade history table, scroll for more columns">
        <table className="astra-history-table"><thead><tr>{['Closed','Market','Side','Contracts','Gross / reported P&L','Provided risk','Notes / partial exits'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{[...groups].reverse().slice(currentPage * 50, (currentPage + 1) * 50).map(group => <JournalEntryRow key={group.id} group={group} journalReview={journalReview} />)}</tbody>
        </table>
      </div>
      {!trades.length && <p>No saved trades for this selection.</p>}
      {groups.length > 50 && <nav className="astra-history-pagination" aria-label="Trade history pages">
        <button className="astra-button" type="button" disabled={currentPage === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>Previous</button>
        <span aria-live="polite">Page {currentPage + 1} / {pageCount}</span>
        <button className="astra-button" type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(value => value + 1)}>Next</button>
      </nav>}
    </section>
  </dialog>;
}
