import type { Trade } from './risk';
type Entry = { contract?: string; id: string; at: string; deltaCents: number; balanceCents: number; category: 'fee' | 'trade' | 'funding'; type: string; currency: 'USD' };
export type Cash = { status: 'reconciled'; version: 1; accountId: string; currency: 'USD'; window: { startDate: string; endDate: string }; asOf: string; basis: string; grossCents: number; feeCents: number; netCents: number; nonTradingCents: number; openingBalanceCents: number | null; closingBalanceCents: number | null; entries: Entry[] };
export type CashSummary = { status: 'unavailable'; reason: string } | { status: 'available'; netCents: number; feeCents: number; grossCents: number; asOf: string; startDate: string; endDate: string; points: { label: string; value: number }[] };
const active = () => localStorage.getItem('cova-active-storage-identity-v1') || '';
const key = (owner: string, account: string) => `cova-broker-cash-v1:${account}:${owner}`;
const normalized = (owner: string) => encodeURIComponent(owner.trim().toLowerCase());
const fingerprint = (trades: readonly Trade[]) => JSON.stringify(trades.map(t => [t.id,t.date.slice(0,10),t.pnl,t.source?.provider==='Tradovate'?t.source.openedAt:null,t.source?.provider==='Tradovate'?t.source.closedAt:null]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
function checked(value: unknown, account: string): Cash {
  const c=value as Cash;
  if(!c || c.status!=='reconciled' || c.version!==1 || c.accountId!==account || c.currency!=='USD' || c.basis!=='cash_movements_no_trade_allocation' || !Array.isArray(c.entries) || c.entries.length>5000) throw Error('Cash evidence unavailable');
  const iso=(s: unknown): s is string => typeof s==='string' && /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString()===s;
  if(!iso(c.asOf) || !c.window || !iso(c.window.startDate+'T00:00:00.000Z') || !iso(c.window.endDate+'T00:00:00.000Z') || c.window.endDate<=c.window.startDate || Date.parse(c.window.endDate)-Date.parse(c.window.startDate)>90*86400000) throw Error('Invalid cash window');
  const seen=new Set<string>();let previous:Entry|undefined;let gross=0,fees=0,funding=0;
  const feeTypes=['Exchange Fee','Clearing Fee','Nfa Fee','Commission','Brokerage Fee','IP Fee','Order Routing Fee'];
  for(const e of c.entries){
    if(!e || !/^[1-9]\d{0,19}$/.test(e.id) || seen.has(e.id) || !iso(e.at) || e.at.slice(0,10)<c.window.startDate || e.at.slice(0,10)>=c.window.endDate || e.currency!=='USD' || !Number.isSafeInteger(e.deltaCents) || !Number.isSafeInteger(e.balanceCents) || Math.abs(e.deltaCents)>1e14 || Math.abs(e.balanceCents)>1e14)throw Error('Invalid cash movement');
    const category=e.type==='Trade Paired'?'trade':e.type==='Fund Transaction'?'funding':feeTypes.includes(e.type)?'fee':null;
    if(!category || e.category!==category || previous && (e.at<previous.at || previous.balanceCents+e.deltaCents!==e.balanceCents))throw Error('Cash movement gap');
    if(category==='trade')gross+=e.deltaCents;else if(category==='fee')fees+=e.deltaCents;else funding+=e.deltaCents;
    seen.add(e.id);previous=e;
  }
  if(![gross,fees,funding,gross+fees].every(Number.isSafeInteger) || gross!==c.grossCents || fees!==c.feeCents || funding!==c.nonTradingCents || gross+fees!==c.netCents || c.openingBalanceCents!==(c.entries.length?c.entries[0].balanceCents-c.entries[0].deltaCents:null) || c.closingBalanceCents!==(previous?.balanceCents??null))throw Error('Cash total mismatch');
  return c;
}
function validateTrades(cash:Cash,trades:readonly Trade[]) {
  let gross=0;
  for(const t of trades){if(t.source?.provider!=='Tradovate' || t.source.accountId!==cash.accountId || t.source.pnlBasis!=='gross_before_fees' || t.date.slice(0,10)<cash.window.startDate || t.date.slice(0,10)>=cash.window.endDate || !Number.isFinite(t.pnl) || Math.abs(t.pnl*100-Math.round(t.pnl*100))>1e-6)throw Error('Trade coverage mismatch');gross+=Math.round(t.pnl*100);}
  if(!Number.isSafeInteger(gross) || gross!==cash.grossCents)throw Error('Trade gross mismatch');
}
/** Validate the whole account ledger before a narrower cash-window disclosure. */
export function verifyBrokerCash(value: unknown, trades: readonly Trade[]): Cash | null {
  try {
    if (!trades.length || trades[0].source?.provider !== 'Tradovate') return null;
    const cash = checked(value, trades[0].source.accountId);
    validateTrades(cash, trades);
    return cash;
  } catch { return null; }
}
/** Never read another active identity's cached cash, even during an owner transition. */
export function readBrokerCashEvidence(trades: readonly Trade[], owner: string): Cash | null {
  try {
    if (!owner || active() !== normalized(owner) || trades[0]?.source?.provider !== 'Tradovate') return null;
    const raw = localStorage.getItem(key(normalized(owner), trades[0].source.accountId));
    if (!raw || raw.length > 2097152) return null;
    const saved = JSON.parse(raw);
    return saved.fingerprint === fingerprint(trades) ? verifyBrokerCash(saved.cash, trades) : null;
  } catch { return null; }
}
export function saveBrokerCash(owner: string, account: string, value: unknown, trades: Trade[]) {
  const scope=normalized(owner); if(!scope || active()!==scope || !/^[1-9]\d{0,15}$/.test(account)) return;
  try { const cash=checked(value,account);validateTrades(cash,trades);localStorage.setItem(key(scope,account),JSON.stringify({cash,fingerprint:fingerprint(trades)})); }
  catch { try { localStorage.removeItem(key(scope,account)); } catch { /* No net claim without readable, validated evidence. */ } }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('cova-broker-cash-updated'));
}
export function brokerCashSummary(trades: Trade[], range: 'all'|'today'|'week'): CashSummary {
  const unavailable: CashSummary={status:'unavailable',reason:'Load history to reconcile broker fees. Individual trade statistics remain gross.'};
  if(!trades.length || trades.some(t=>t.source?.provider!=='Tradovate'))return unavailable;
  const account=trades[0].source!.accountId;
  if(trades.some(t=>t.source?.accountId!==account))return {...unavailable,reason:'Select one account to view reconciled net profit.'};
  try {
    const raw=localStorage.getItem(key(active(),account));if(!raw || raw.length>2097152)return unavailable;
    const saved=JSON.parse(raw),cash=checked(saved.cash,account);
    validateTrades(cash,trades);
    if(saved.fingerprint!==fingerprint(trades))return unavailable;
    const latest=[...trades].map(t=>t.date.slice(0,10)).sort().pop()!;
    const start=range==='all'?cash.window.startDate:range==='today'?latest:new Date(Date.parse(latest+'T00:00:00Z')-6*86400000).toISOString().slice(0,10);
    const end=range==='all'?cash.window.endDate:new Date(Date.parse(latest+'T00:00:00Z')+86400000).toISOString().slice(0,10);
    if(start<cash.window.startDate || end>cash.window.endDate)return unavailable;
    const entries=cash.entries.filter(e=>e.at.slice(0,10)>=start && e.at.slice(0,10)<end && e.category!=='funding');
    const grossCents=entries.filter(e=>e.category==='trade').reduce((a,e)=>a+e.deltaCents,0),feeCents=entries.filter(e=>e.category==='fee').reduce((a,e)=>a+e.deltaCents,0);
    // Cash rows are accounting movements, not trades. Collapse to observed UTC
    // days without allocating fees to fills or inventing funding/idle-day points.
    const dailyCents = new Map<string, number>();
    for (const entry of entries) {
      const day = entry.at.slice(0, 10);
      dailyCents.set(day, (dailyCents.get(day) ?? 0) + entry.deltaCents);
    }
    let equityCents = 0;
    const points = [...dailyCents].map(([label, deltaCents]) => ({ label, value: (equityCents += deltaCents) / 100 }));
    return {status:'available',grossCents,feeCents,netCents:grossCents+feeCents,asOf:cash.asOf,startDate:start,endDate:end,points};
  } catch {return unavailable;}
}
