import type { Trade } from './risk';
import type { Section } from './appRoutes';
import { tradeAccountKey } from './tradovateHistory';
import { rowMoneyText } from './journalAccuracy';
import { readWorkspaceAux } from './workspaceAux';
import { validJournalDate } from './manualTrades';

/** Read existing owner-scoped stores; search never writes a parallel note store. */
export function readWorkspaceSearchJournals(owner: string, accounts: readonly string[]): SearchJournal[] {
  if (!owner.trim()) return [];
  const result: SearchJournal[] = [];
  try {
    const aux = readWorkspaceAux(owner);
    const scopes = new Set(['all', ...accounts, ...Object.keys(aux?.notes || {})]);
    const prefix = 'cova-daily-journal-v1:', suffix = ':' + encodeURIComponent(owner.trim().toLowerCase());
    if (!aux) for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix) && key.endsWith(suffix)) {
        try { scopes.add(decodeURIComponent(key.slice(prefix.length, -suffix.length))); } catch { /* Invalid legacy key is not a scope. */ }
      }
    }
    for (const account of scopes) {
      let notes;
      try { notes = aux ? aux.notes[account] : JSON.parse(localStorage.getItem(prefix + encodeURIComponent(account) + suffix) || '{}'); } catch { continue; }
      if (!notes || typeof notes !== 'object' || Array.isArray(notes)) continue;
      for (const [date, raw] of Object.entries(notes)) {
        if (!validJournalDate(date)) continue;
        const entry = typeof raw === 'string' ? {note: raw, tradeId: null} : raw as {note?: unknown; tradeId?: unknown} | null;
        const note = typeof entry?.note === 'string' ? entry.note.slice(0, 2000) : '';
        const tradeId = typeof entry?.tradeId === 'string' && entry.tradeId.length <= 240 ? entry.tradeId : null;
        if (note.trim() || tradeId) result.push({account, date, note, tradeId});
      }
    }
  } catch { /* Unavailable browser storage contributes no notes. */ }
  return result;
}

export type SearchJournal = { account: string; date: string; note: string; tradeId: string | null };
export type SearchSnapshot = { owner: string; trades: readonly Trade[]; names: Record<string, string>; journals: readonly SearchJournal[] };
type SearchBase = { key: string; title: string; context: string; text: string; searchText: string };
export type WorkspaceSearchResult = SearchBase & (
  { kind: 'Page'; section: Section } | { kind: 'Trade'; trade: Trade; account: string } | { kind: 'Journal note'; journal: SearchJournal }
);
const pages: {section: Section; title: string; aliases: string}[] = [
  { section: 'dashboard', title: 'Risk Desk', aliases: 'dashboard overview results performance trades history journal calendar daily notes equity drawdown' },
  { section: 'import', title: 'Accounts', aliases: 'import link connect broker csv upload tradovate ninjatrader rithmic manual accounts' },
  { section: 'coach', title: 'Insights', aliases: 'analytics analysis coach setups discipline patterns' },
  { section: 'rules', title: 'Limits', aliases: 'rules risk thresholds settings loss contracts' },
  { section: 'passport', title: 'Passport', aliases: 'proof record share export progress' },
];
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
const accountLabel = (account: string, names: Record<string, string>) => names[account] || (account === 'all' ? 'All accounts' : account === 'local' ? 'Manual account' : account);

/** Identical copies collapse; conflicting records get content-bound keys, never arbitrary resolution. */
function uniqueItems<T>(items: readonly T[], key: (item: T) => string): {item: T; key: string}[] {
  const values = new Map<string, Map<string, T>>();
  for (const item of items) {
    const id = key(item), variants = values.get(id) || new Map<string, T>();
    variants.set(JSON.stringify(item), item); values.set(id, variants);
  }
  return [...values].flatMap(([id, variants]) => [...variants].map(([content, item]) => ({item, key: variants.size === 1 ? id : JSON.stringify([id,content])})));
}
export function buildWorkspaceSearchIndex(snapshot: SearchSnapshot, owner: string): WorkspaceSearchResult[] {
  if (!owner.trim() || snapshot.owner !== owner) return [];
  const result: WorkspaceSearchResult[] = pages.map(page => ({kind:'Page',key:`page:${page.section}`,title:page.title,section:page.section,context:'Workspace page',text:page.aliases,searchText:normalize(`${page.title} ${page.aliases}`)}));
  for (const {item: trade, key} of uniqueItems(snapshot.trades, row => JSON.stringify([tradeAccountKey(row), row.id]))) {
    const account = tradeAccountKey(trade), title = `${trade.market} · ${trade.setup || 'No setup'}`;
    const context = `${accountLabel(account, snapshot.names)} · ${trade.date}`;
    const timestamps = trade.source?.provider === 'Tradovate' ? `${trade.source.openedAt || ''} ${trade.source.closedAt || ''}` : '';
    result.push({kind:'Trade',key:'trade:'+key,title,context,text:trade.notes,trade,account,searchText:normalize(`${title} ${context} ${trade.side} ${account} ${timestamps} ${trade.notes}`)});
  }
  for (const {item: journal, key} of uniqueItems(snapshot.journals, note => JSON.stringify([note.account, note.date]))) {
    const title = `Journal · ${journal.date}`, context = accountLabel(journal.account, snapshot.names);
    result.push({kind:'Journal note',key:'journal:'+key,title,context,text:journal.note,journal,searchText:normalize(`${title} ${context} ${journal.account} ${journal.note}`)});
  }
  return result;
}
export function searchWorkspace(index: readonly WorkspaceSearchResult[], query: string): WorkspaceSearchResult[] {
  const text = normalize(query);
  if (!text) return index.filter(item => item.kind === 'Page');
  const tokens = [...new Set(text.split(' '))];
  const score = (item: WorkspaceSearchResult) => (normalize(item.title) === text ? 100 : 0) + (item.kind === 'Page' ? 30 : 0) + (tokens.every(token => normalize(item.title).includes(token)) ? 10 : 0);
  return index.filter(item => tokens.every(token => item.searchText.includes(token)))
    .map(item => ({item, score: score(item)})).sort((a,b) => b.score - a.score || (a.item.kind !== 'Page' && b.item.kind !== 'Page' ? (b.item.kind === 'Trade' ? b.item.trade.date : b.item.journal.date).localeCompare(a.item.kind === 'Trade' ? a.item.trade.date : a.item.journal.date) : 0))
    .map(({item}) => item);
}

/** Complete read-only fields, without adding currencies or aggregating unlike amounts. */
export function tradeSearchFields(trade: Trade): [string, string][] {
  const number = (value: number) => typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
  const money = (value: number) => typeof value === 'number' && Number.isFinite(value) ? rowMoneyText(trade, value) : '—';
  const source = trade.source;
  return [
    ['Trade ID', trade.id], ['Date', trade.date], ['Market', trade.market], ['Side', trade.side],
    ['Contracts', number(trade.contracts)], ['Entry', number(trade.entry)], ['Exit', number(trade.exit)],
    ['Gross / reported P&L', money(trade.pnl)], ['Planned risk', trade.riskStatus !== 'missing' && trade.risk > 0 ? money(trade.risk) : '—'],
    ['P&L basis', trade.manual?.pnlBasis === 'reported_net' ? 'Reported net' : trade.manual?.pnlBasis === 'gross_before_fees' || (source?.provider === 'Tradovate' && source.pnlBasis === 'gross_before_fees') ? 'Gross before fees' : 'Reported; fee basis unknown'],
    ['Source', source?.provider || (trade.manual ? 'Manual' : 'Imported')], ['Account key', tradeAccountKey(trade)],
    ...(source?.provider === 'Tradovate' ? [['Opened', source.openedAt || '—'], ['Closed', source.closedAt || '—'], ['Time zone', source.timeZone || '—']] as [string,string][] : []),
    ['Setup', trade.setup || '—'], ['Notes', trade.notes || '—'],
  ];
}
