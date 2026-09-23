import type { Trade } from './risk';
import { tradeAccountKey } from './tradovateHistory';
import { isImportPrincipalCurrent, type ImportPrincipal } from './importGuard';
export type ManualTradeDraft = { date: string; market: string; side: string; contracts: string; entry: string; exit: string; pnl: string; risk: string; setup: string; notes: string };
export function validJournalDate(value: string) { return /^20\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value; }
export function appendManualTrade(trades: Trade[], draft: ManualTradeDraft, account: string, max: number, opened: ImportPrincipal | null, current: ImportPrincipal | null, selectionCurrent: boolean): { trades: Trade[]; error: string | null } {
  const fail = (error: string) => ({ trades, error });
  if (!selectionCurrent || !isImportPrincipalCurrent(opened,current)) return fail('Account changed. Reopen Add trade.');
  if (account !== 'local' && !trades.some(t=>tradeAccountKey(t)===account)) return fail('Choose an existing account.');
  if (trades.length >= max) return fail('Your plan’s stored-trade limit is reached.');
  if (trades.some(t=>tradeAccountKey(t)===account && t.source?.provider==='Rithmic' && t.source.currency!=='USD')) return fail('Manual entry currently supports USD accounts only.');
  if (!validJournalDate(draft.date)) return fail('Enter a valid trade date.');
  const market=draft.market.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9./-]{0,19}$/.test(market) || !['Long','Short'].includes(draft.side)) return fail('Enter a symbol and side.');
  const contracts=Number(draft.contracts), entry=Number(draft.entry), exit=Number(draft.exit);
  if (!/^\d+$/.test(draft.contracts) || !Number.isSafeInteger(contracts) || contracts<1 || contracts>100000) return fail('Quantity must be a positive whole number.');
  const price=(v:string,n:number)=>/^-?\d+(\.\d{1,8})?$/.test(v) && Number.isFinite(n) && Math.abs(n)<=1e9;
  if (!price(draft.entry,entry)||!price(draft.exit,exit)) return fail('Enter valid entry and exit prices.');
  const money=(v:string)=>/^[+-]?\d+(\.\d{1,2})?$/.test(v) && Number.isSafeInteger(Math.round(Number(v)*100));
  if (!money(draft.pnl) || (draft.risk && (!money(draft.risk)||Number(draft.risk)<0))) return fail('P&L and optional risk must be valid USD amounts, at most two decimals.');
  if (draft.setup.length>120 || draft.notes.length>4000) return fail('Keep setup under 120 characters and notes under 4,000.');
  const pnl=Number(draft.pnl);
  if (trades.some(t=>tradeAccountKey(t)===account && t.date===draft.date && t.market===market && t.side===draft.side && t.contracts===contracts && t.entry===entry && t.exit===exit && Math.round(t.pnl*100)===Math.round(pnl*100))) return fail('A matching trade is already saved in this account.');
  const row:Trade={id:'manual-'+crypto.randomUUID(),date:draft.date,market,side:draft.side as Trade['side'],contracts,entry,exit,pnl,risk:draft.risk?Number(draft.risk):0,setup:draft.setup.trim(),notes:draft.notes.trim(),manual:{accountKey:account,currency:'USD',pnlBasis:'gross_before_fees'}};
  return {trades:[...trades,row],error:null};
}
export function removeManualTrade(trades: Trade[], id: string, opened: ImportPrincipal | null, current: ImportPrincipal | null, selectionCurrent: boolean): Trade[] | null {
  if (!selectionCurrent || !isImportPrincipalCurrent(opened,current) || !trades.some(t=>t.id===id && t.manual && !t.source)) return null;
  return trades.filter(t=>t.id!==id);
}
