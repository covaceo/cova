import { verifyBrokerCash } from './brokerCash';
import { buildHotStreaks, type HotStreak } from './recapHotStreak';
import { recapCashFees, type RecapFees } from './sessionRecapFees';
import { groupJournalEntries, type Trade, type JournalEntryGroup } from './risk';

export type RecapKind = 'daily' | 'new-york' | 'london' | 'asia';
export type RecapBackground = 'new-york' | 'london' | 'asia' | 'plain' | 'custom';
export type SessionRecap = {
  id: string; kind: RecapKind; date: string; title: string; dateLabel: string; windowLabel: string;
  hotStreak: HotStreak | null; fees: RecapFees | null; totalCents: string; count: number; wins: number; winRate: string; countLabel: string;
  markets: string; basis: string; sample: boolean; theme: RecapBackground; details: string;
};
const titles: Record<RecapKind, string> = { daily: 'Daily recap', 'new-york': 'New York session', london: 'London session', asia: 'Asia session' };
const clocks = new Map<string, Intl.DateTimeFormat>();
const boundaryCache = new Map<string, number>();
function localParts(time: number, zone: string) {
  let clock = clocks.get(zone);
  if (!clock) { clock = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); clocks.set(zone, clock); }
  return Object.fromEntries(clock.formatToParts(time).map(p => [p.type, p.value]));
}
function localDate(time: number, zone: string) { const p = localParts(time, zone); return `${p.year}-${p.month}-${p.day}`; }
function instant(date: string, hour: number, minute: number, zone: string) {
  const key = `${date}:${hour}:${minute}:${zone}`, cached = boundaryCache.get(key);
  if (cached !== undefined) return cached;
  const desired = Date.parse(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);
  let guess = desired;
  for (let i = 0; i < 3; i++) {
    const p = localParts(guess, zone);
    guess += desired - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.000Z`);
  }
  if (boundaryCache.size >= 2048) boundaryCache.clear();
  boundaryCache.set(key, guess); return guess;
}
/** Half-open product review windows, not exchange calendars or market-open claims. */
export function recapSessionAt(at: string): { kind: Exclude<RecapKind, 'daily'>; date: string } | null {
  const time = Date.parse(at); if (!Number.isFinite(time)) return null;
  const ny = localDate(time, 'America/New_York'), london = localDate(time, 'Europe/London'), asia = localDate(time, 'Asia/Tokyo');
  const windows = [
    { kind: 'new-york' as const, date: ny, start: instant(ny, 9, 30, 'America/New_York'), end: instant(ny, 16, 0, 'America/New_York') },
    { kind: 'london' as const, date: london, start: instant(london, 8, 0, 'Europe/London'), end: instant(london, 9, 30, 'America/New_York') },
    { kind: 'asia' as const, date: asia, start: instant(asia, 9, 0, 'Asia/Tokyo'), end: instant(asia, 8, 0, 'Europe/London') },
  ];
  for (const window of windows) if (time >= window.start && time < window.end) return { kind: window.kind, date: window.date };
  return null;
}
function cents(value: number) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error('Invalid money');
  return (match[1] ? -1n : 1n) * (BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0')));
}
function timing(group: JournalEntryGroup) {
  const times = group.rows.map(row => row.source?.provider === 'Tradovate' ? { open: row.source.openedAt, close: row.source.closedAt } : null);
  if (!times.every(t => t?.open && t.close)) return { day: group.rows[0].date, region: null, timed: false };
  const closes = times.map(t => t!.close!).sort();
  const latest = closes[closes.length - 1];
  const regions = times.flatMap(t => [recapSessionAt(t!.open!), recapSessionAt(t!.close!)]);
  const first = regions[0];
  return { day: latest.slice(0, 10), region: first && regions.every(r => r?.kind === first.kind && r.date === first.date) ? first : null, timed: true };
}
export function buildSessionRecaps(trades: readonly Trade[], cashEvidence?: unknown): { error: string; options: SessionRecap[] } {
  if (!trades.length) return { error: 'Import trades to create a session recap.', options: [] };
  const unavailable = (error: string) => ({ error, options: [] as SessionRecap[] });
  const sample = trades.every(t => t.id.startsWith('demo-'));
  if (!sample && trades.some(t => t.id.startsWith('demo-'))) return unavailable('Sample and imported trades cannot share one recap.');
  if (new Set(trades.map(t => t.id)).size !== trades.length) return unavailable('Resolve duplicate trade records before sharing.');
  const accounts = new Set(trades.map(t => t.source?.provider === 'Tradovate' ? `Tradovate:${t.source.accountId}` : t.source?.provider === 'Rithmic' ? `Rithmic:${t.source.accountId}:${t.source.accountKey}` : 'unverified'));
  if (accounts.size !== 1) return unavailable('Select one account before sharing a recap.');
  if (!sample && trades.some(t => !(t.source?.provider === 'Tradovate' && t.source.accountId && t.source.pnlBasis === 'gross_before_fees') && !(t.source?.provider === 'Rithmic' && t.source.accountId && t.source.currency === 'USD'))) return unavailable('This history needs verified USD amounts before it can be shared.');
  try {
    let total = 0n;
    for (const row of trades) {
      const amount = cents(row.pnl); total += amount;
      if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < -BigInt(Number.MAX_SAFE_INTEGER) || total > BigInt(Number.MAX_SAFE_INTEGER) || total < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Money out of range');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0, 10) !== row.date) throw new Error('Invalid date');
      if (typeof row.market !== 'string' || !row.market.trim()) throw new Error('Missing market');
      if (row.source?.provider === 'Tradovate' && (row.source.openedAt || row.source.closedAt)) {
        const { openedAt, closedAt, timeZone } = row.source;
        const exact = (at: string | undefined) => Boolean(at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) && Number.isFinite(Date.parse(at)) && new Date(at).toISOString() === at);
        if (timeZone !== 'UTC' || !exact(openedAt) || !exact(closedAt) || openedAt! > closedAt! || closedAt!.slice(0, 10) !== row.date) throw new Error('Incomplete timestamp evidence');
      }
    }
  } catch { return unavailable('Check the dates and exact amounts in this history before sharing.'); }
  const cash = sample ? null : verifyBrokerCash(cashEvidence, trades);
  const groups = groupJournalEntries(trades);
  const timings = new Map(groups.map(group => [group, timing(group)]));
  const buckets = new Map<string, { kind: RecapKind; date: string; groups: JournalEntryGroup[] }>();
  for (const group of groups) {
    const time = timings.get(group)!;
    const keys: { kind: RecapKind; date: string }[] = [{ kind: 'daily', date: time.day }];
    if (time.region) keys.push(time.region);
    for (const key of keys) {
      const id = `${key.kind}:${key.date}`;
      if (!buckets.has(id)) buckets.set(id, { ...key, groups: [] });
      buckets.get(id)!.groups.push(group);
    }
  }
  const options = [...buckets.entries()].map(([id, bucket]): SessionRecap => {
    const { kind, date, groups: selected } = bucket;
    const amounts = selected.map(group => group.rows.reduce((sum, row) => sum + cents(row.pnl), 0n));
    const rows = selected.flatMap(g => g.rows), wins = amounts.filter(value => value > 0n).length;
    const percentage = Math.round(wins / selected.length * 10000) / 100;
    const winRate = wins === 0 ? '0%' : wins === selected.length ? '100%' : percentage === 0 ? '<0.01%' : percentage === 100 ? '>99.99%' : `${percentage}%`;
    const grouped = selected.every(g => g.entryIdentified);
    const gross = rows.every(r => r.source?.provider === 'Tradovate' && r.source.pnlBasis === 'gross_before_fees');
    const timed = selected.every(g => timings.get(g)!.timed);
    const regional = selected.map(g => timings.get(g)!.region?.kind);
    const theme = kind !== 'daily' ? kind : regional.every(k => k === 'london') ? 'london' : regional.every(k => k === 'asia') ? 'asia' : 'new-york';
    const window = kind === 'daily' ? { start: Date.parse(date), end: Date.parse(date) + 86400000 }
      : kind === 'new-york' ? { start: instant(date, 9, 30, 'America/New_York'), end: instant(date, 16, 0, 'America/New_York') }
      : kind === 'london' ? { start: instant(date, 8, 0, 'Europe/London'), end: instant(date, 9, 30, 'America/New_York') }
      : { start: instant(date, 9, 0, 'Asia/Tokyo'), end: instant(date, 8, 0, 'Europe/London') };
    return {
      hotStreak: null, fees: gross ? recapCashFees(cash, rows, window) : null,
      id, kind, date, title: titles[kind], dateLabel: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)),
      windowLabel: kind === 'daily' ? timed ? 'UTC close date' : 'Reported date' : kind === 'new-york' ? '09:30–16:00 New York' : kind === 'london' ? '08:00 London–09:30 New York' : '09:00 Tokyo–08:00 London',
      totalCents: amounts.reduce((sum, value) => sum + value, 0n).toString(), count: selected.length, wins,
      winRate, countLabel: grouped ? 'Trade entries' : 'Reported trades',
      markets: [...new Set(rows.map(r => r.market))].join(' · '), basis: gross ? 'Gross P&L · before fees' : 'Reported P&L · fees unconfirmed',
      sample: rows.every(r => r.id.startsWith('demo-')), theme,
      details: 'Known same-opening-fill partial exits are combined, not certified flat-to-flat positions. Unmatched rows remain separate. Breakeven entries are included in the win-rate denominator. Whole groups belong to their final observed exit date. Regional recaps require every entry and exit timestamp within the same dated review window. Daily recaps can span regions. Review windows follow local daylight-saving time and are not exchange calendars. The Tradovate headline uses reconciled trade cash plus signed posted fees, excluding funding, through the latest sync. It does not wait for the session or UTC day to end. The complete synced report-window fingerprint must match, and selected-window trade postings must match the recap at supported timestamp, cents and market-root granularity. Win rate uses grouped gross trade outcomes, not invented per-trade net allocation. Fees can relate to carried or open positions. The source gross ledger stays unchanged. Snapshot time and fee breakdown are available here, not printed on the card; later postings or adjustments can change the result. Missing or mismatched Tradovate fee evidence blocks sharing instead of silently substituting gross or zero fees. Hot streak counts consecutive net-positive UTC trading days for this account through the selected date, using the whole day even on regional cards. Red or breakeven days reset it; verified idle days and deposits do not count. Missing fee evidence or unexplained cash-only activity stops the count rather than bridging a gap. A plus means at least that many consecutive green days are verified, with earlier coverage uncertain. Today remains a snapshot, not a declaration that trading has ended; later trades or fee postings can change the streak. Backgrounds are illustrative, not a record of market conditions.',
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || (a.kind === 'daily' ? -1 : b.kind === 'daily' ? 1 : a.kind.localeCompare(b.kind)));
  const streaks = buildHotStreaks(options, cash);
  return { error: '', options: options.map(recap => ({ ...recap, hotStreak: streaks.get(recap.date) ?? null })) };
}
export function recapHotStreakLine(recap: SessionRecap): string {
  const streak = recap.hotStreak;
  return streak && streak.days > 0 ? `${streak.days}${streak.atLeast ? '+' : ''} DAY HOT STREAK` : '';
}
/** No gross fallback masquerading as an after-fee Tradovate result. */
export function recapHeadlineCents(recap: SessionRecap): string | null {
  return recap.fees?.netCashCents ?? (recap.sample || !recap.basis.startsWith('Gross') ? recap.totalCents : null);
}
export function recapExportError(recap: SessionRecap): string {
  return recapHeadlineCents(recap) === null ? 'Sync this account’s Tradovate history to reconcile fees before sharing.' : '';
}
export function recapFeeLine(recap: SessionRecap) {
  return recap.fees ? `${BigInt(recap.fees.signedCents) > 0n ? 'Fee credits' : 'Posted fees'} ${recapMoney(recap.fees.signedCents)} · Net cash ${recapMoney(recap.fees.netCashCents)}` : 'Fees unavailable · net cash not shown';
}
export function recapMoney(amount: string) {
  const value = BigInt(amount), abs = value < 0n ? -value : value;
  return `${value < 0n ? '−' : value > 0n ? '+' : ''}$${(abs / 100n).toLocaleString('en-US')}.${String(abs % 100n).padStart(2, '0')}`;
}
