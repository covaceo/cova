import { readWorkspaceAux } from './workspaceAux';
import { readDailyJournalEntry } from './dailyJournal';
import { validJournalDate } from './manualTrades';

/** Read-only index of the existing owner/account journal, never a second store. */
export function listDailyJournalEntries(owner: string, account: string) {
  if (!owner.trim() || !account) return [];
  try {
    const aux = readWorkspaceAux(owner);
    const notes = aux ? aux.notes[account] : JSON.parse(localStorage.getItem(`cova-daily-journal-v1:${encodeURIComponent(account)}:${encodeURIComponent(owner.trim().toLowerCase())}`) || '{}');
    if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return [];
    return Object.keys(notes).filter(validJournalDate).sort().reverse()
      .map(date => ({ date, ...readDailyJournalEntry(owner, account, date) }))
      .filter(entry => entry.note.trim() || entry.tradeId);
  } catch { return []; }
}

const selectionKey = (scope: string) => `cova-journal-date-v1:${scope}`;
export function readJournalEditorDate(scope: string | undefined, fallback: string) {
  try {
    const date = scope ? sessionStorage.getItem(selectionKey(scope)) : null;
    return date && validJournalDate(date) ? date : fallback;
  } catch { return fallback; }
}
export function rememberJournalEditorDate(scope: string | undefined, date: string) {
  if (scope && validJournalDate(date)) {
    try { sessionStorage.setItem(selectionKey(scope), date); } catch { /* Note persistence is independent. */ }
  }
}
