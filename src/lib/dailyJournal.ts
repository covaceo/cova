import { validJournalDate } from './manualTrades';
import type { Trade } from './risk';
import { tradeAccountKey } from './tradovateHistory';
export function canAttachJournalTrade(trades: readonly Trade[], account: string, tradeId?: string | null) {
  if (tradeId == null) return true;
  const rows = trades.filter(row => row.id === tradeId);
  return rows.length === 1 && (account === 'all' || tradeAccountKey(rows[0]) === account);
}
export type DailyJournalEntry = { note: string; tradeId: string | null };
const key = (owner: string, account: string) => `cova-daily-journal-v1:${encodeURIComponent(account)}:${encodeURIComponent(owner.trim().toLowerCase())}`;
const empty = (): DailyJournalEntry => ({ note: '', tradeId: null });
function normalize(value: unknown): DailyJournalEntry {
  if (typeof value === 'string') return { note: value.slice(0, 2000), tradeId: null };
  if (!value || typeof value !== 'object') return empty();
  const entry = value as Partial<DailyJournalEntry>;
  return { note: typeof entry.note === 'string' ? entry.note.slice(0, 2000) : '', tradeId: typeof entry.tradeId === 'string' && entry.tradeId.length <= 240 ? entry.tradeId : null };
}
export function readDailyJournalEntry(owner: string, account: string, date: string): DailyJournalEntry {
  if (!owner || !account || !validJournalDate(date)) return empty();
  try { return normalize(JSON.parse(localStorage.getItem(key(owner, account)) || '{}')?.[date]); } catch { return empty(); }
}
export function readDailyJournal(owner: string, account: string, date: string): string {
  return readDailyJournalEntry(owner, account, date).note;
}
export function saveDailyJournal(owner: string, account: string, date: string, note: string, tradeId?: string | null): boolean {
  if (!owner || !account || !validJournalDate(date) || note.length > 2000 || (tradeId != null && (!tradeId.trim() || tradeId.length > 240))) return false;
  try {
    const raw = JSON.parse(localStorage.getItem(key(owner, account)) || '{}');
    const notes = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const linkedId = tradeId === undefined ? normalize(notes[date]).tradeId : tradeId;
    if (note.trim() || linkedId) notes[date] = { note, tradeId: linkedId };
    else delete notes[date];
    localStorage.setItem(key(owner, account), JSON.stringify(notes));
    return true;
  } catch { return false; }
}
