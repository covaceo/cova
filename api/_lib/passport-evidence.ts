import type { Trade } from '../../src/lib/risk';
import type { ProgressEvidence } from '../../src/lib/passportProgress';
import { buildSessionRecaps } from '../../src/lib/sessionRecap';
import { groupRecapEntries } from '../../src/lib/recapEntryGroups';
import { verifyBrokerCash } from '../../src/lib/brokerCash';
import { progressAccount } from '../../src/lib/passportProgress';
export function readProgressEvidence(payload:any,now=Date.now()):ProgressEvidence {
 const fail=()=>{throw Error('Check the account, dates and complete imported history before reviewing.');};
 if(!payload||typeof payload.account!=='string'||payload.account.length>200||typeof payload.day!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(payload.day)||!Number.isFinite(Date.parse(payload.day))||new Date(payload.day).toISOString().slice(0,10)!==payload.day||payload.day>new Date(now).toISOString().slice(0,10)||!Array.isArray(payload.trades)||!payload.trades.length||payload.trades.length>5000)fail();
 const trades=payload.trades as Trade[],ids=new Set<string>();
 const exact=(s:unknown):s is string=>typeof s==='string'&&/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
 for(const t of trades){
  if(!t||typeof t.id!=='string'||!t.id||t.id.length>512||t.id.startsWith('demo-')||ids.has(t.id)||progressAccount(t)!==payload.account||!Number.isFinite(t.pnl)||!Number.isSafeInteger(Math.round(t.pnl*100))||Math.abs(t.pnl*100-Math.round(t.pnl*100))>1e-6||!Number.isSafeInteger(t.contracts)||t.contracts<=0||t.contracts>1000000||typeof t.market!=='string'||!t.market.trim()||!/^20\d{2}-\d{2}-\d{2}$/.test(t.date)||!Number.isFinite(Date.parse(t.date))||new Date(t.date).toISOString().slice(0,10)!==t.date||t.date>new Date(now).toISOString().slice(0,10))fail();
  if(t.source?.provider==='Tradovate'){const s=t.source;if(s.timeZone!=='UTC'||!exact(s.openedAt)||!exact(s.closedAt)||s.openedAt>s.closedAt||s.closedAt.slice(0,10)!==t.date||Date.parse(s.closedAt)>now+5000)fail();}
  ids.add(t.id);
 }
 const selected=groupRecapEntries(trades).filter(group=>[...group.rows].map(t=>t.date).sort().at(-1)===payload.day);
 if(!selected.length)fail();
 const entries=selected.map(group=>({pnlCents:group.rows.reduce((n,t)=>n+Math.round(t.pnl*100),0),contracts:group.rows.reduce((n,t)=>n+t.contracts,0),openedAt:group.rows.map(t=>t.source?.provider==='Tradovate'?t.source.openedAt!:t.date+'T00:00:00.000Z').sort()[0],closedAt:group.rows.map(t=>t.source?.provider==='Tradovate'?t.source.closedAt!:t.date+'T23:59:59.999Z').sort().at(-1)!}));
 entries.sort((a,b)=>a.closedAt.localeCompare(b.closedAt)||a.openedAt.localeCompare(b.openedAt)||a.contracts-b.contracts||a.pnlCents-b.pnlCents);
 const cash=verifyBrokerCash(payload.cash,trades);
 if(cash&&Date.parse(cash.asOf)>now+5000)fail();
 const recap=buildSessionRecaps(trades,cash).options.find(r=>r.kind==='daily'&&r.date===payload.day);
 const net=recap?.fees?.netCashCents;
 return {day:payload.day,account:payload.account,firstEntry:entries.map(e=>e.openedAt).sort()[0],entries,netCents:net!==undefined&&Number.isSafeInteger(Number(net))?Number(net):null,asOf:cash?.asOf??null};
}
