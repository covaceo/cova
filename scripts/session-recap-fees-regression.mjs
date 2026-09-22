import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
const row=(open,close,pnl,openedAt='2026-09-18T14:00:00.000Z',closedAt='2026-09-18T14:10:00.000Z')=>({id:`tradovate-7:${open}:${close}`,date:closedAt.slice(0,10),market:'MNQ',side:'Long',contracts:1,entry:20000,exit:20001,pnl,risk:10,setup:'',notes:'',source:{provider:'Tradovate',accountId:'7',pnlBasis:'gross_before_fees',timeZone:'UTC',openedAt,closedAt}});
function cashFor(trades,extras=[{at:'2026-09-18T14:00:00.000Z',deltaCents:-100,category:'fee',type:'Commission'}]){
 let balance=100000;const entries=[...trades.map(t=>({at:t.source.closedAt,deltaCents:Math.round(t.pnl*100),category:'trade',type:'Trade Paired'})),...extras].sort((a,b)=>a.at.localeCompare(b.at)).map((e,i)=>({...e,id:String(i+1),balanceCents:balance+=e.deltaCents,currency:'USD',contract:'MNQZ6'}));
 const sum=category=>entries.filter(e=>e.category===category).reduce((n,e)=>n+e.deltaCents,0);
 return {status:'reconciled',version:1,accountId:'7',currency:'USD',window:{startDate:'2026-09-17',endDate:'2026-09-21'},asOf:'2026-09-21T10:00:00.000Z',basis:'cash_movements_no_trade_allocation',entries,grossCents:sum('trade'),feeCents:sum('fee'),netCents:sum('trade')+sum('fee'),nonTradingCents:sum('funding'),openingBalanceCents:100000,closingBalanceCents:balance};
}
const recaps=(trades,cash)=>load('src/lib/sessionRecap.ts').buildSessionRecaps(trades,cash);
test('recap shows signed posted broker fees and net cash separately from immutable gross trade performance',()=>{
 const trades=[row(10,11,10),row(20,21,-5)],cash=cashFor(trades),before=structuredClone({trades,cash});
 const recap=recaps(trades,cash).options.find(r=>r.kind==='new-york');
 assert.deepEqual(recap.fees,{signedCents:'-100',netCashCents:'400',asOf:cash.asOf});
 assert.equal(recap.totalCents,'500');assert.equal(recap.basis,'Gross P&L · before fees');assert.equal(recap.winRate,'50%');assert.deepEqual({trades,cash},before);
});

test('recap cash reader binds both active owner and the exact saved full-history fingerprint',()=>{
 const store=new Map();global.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const {saveBrokerCash,readBrokerCashEvidence}=load('src/lib/brokerCash.ts');
 const trades=[row(10,11,10)],cash=cashFor(trades);store.set('cova-active-storage-identity-v1','owner-a');saveBrokerCash('owner-a','7',cash,trades);
 assert.deepEqual(readBrokerCashEvidence(trades,'owner-a'),cash);
 assert.equal(readBrokerCashEvidence(trades,'owner-b'),null);
 assert.equal(readBrokerCashEvidence([{...trades[0],id:'tradovate-7:90:91'}],'owner-a'),null);
 store.set('cova-active-storage-identity-v1','owner-b');assert.equal(readBrokerCashEvidence(trades,'owner-a'),null);
 delete global.localStorage;
});

test('unavailable evidence is not represented as zero fees; a covered zero-fee ledger is',()=>{
 const trades=[row(10,11,10)];assert.equal(recaps(trades).options[0].fees,null);
 const cash=cashFor(trades,[]);assert.equal(recaps(trades,cash).options[0].fees.signedCents,'0');
 for(const bad of [null,{}, {...cash,accountId:'8'},{...cash,currency:'EUR'},{...cash,grossCents:1},{...cash,netCents:1},{...cash,asOf:'2026-09-18T14:15:00.000Z'},{...cash,window:{startDate:'2026-09-17',endDate:'2026-09-18'}}])assert.equal(recaps(trades,bad).options[0].fees,null);
});
test('equal aggregate totals do not establish timestamp, market or multiplicity correspondence',()=>{
 const trades=[row(10,11,10)];
 for(const mutate of [c=>{c.entries.find(e=>e.category==='trade').at='2026-09-18T14:09:00.000Z'},c=>{c.entries.find(e=>e.category==='trade').contract='MESZ6'},c=>{delete c.entries.find(e=>e.category==='trade').contract},c=>{c.entries.find(e=>e.category==='trade').contract=42}]){const cash=cashFor(trades);mutate(cash);assert.equal(recaps(trades,cash).options[0].fees,null);}
 const extraZero=cashFor([...trades,row(20,21,0)]);assert.equal(recaps(trades,extraZero).options[0].fees,null);
 const duplicate=cashFor(trades);duplicate.entries[1].id=duplicate.entries[0].id;assert.equal(recaps(trades,duplicate).options[0].fees,null);
});
test('signed fee credits remain credits and funding never becomes net cash profit',()=>{
 const trades=[row(10,11,10)],cash=cashFor(trades,[{at:'2026-09-18T14:00:00.000Z',deltaCents:150,category:'fee',type:'Commission'},{at:'2026-09-18T15:00:00.000Z',deltaCents:2500000,category:'funding',type:'Fund Transaction'}]);
 const r=recaps(trades,cash).options[0];assert.equal(r.fees.signedCents,'150');assert.equal(r.fees.netCashCents,String(1000+150));assert.match(load('src/lib/sessionRecap.ts').recapFeeLine(r),/^Fee credits/);
});
test('fees use the same half-open regional window, while daily uses the whole UTC day',()=>{
 const trades=[row(10,11,10)];const cash=cashFor(trades,[{at:'2026-09-18T13:30:00.000Z',deltaCents:-100,category:'fee',type:'Commission'},{at:'2026-09-18T20:00:00.000Z',deltaCents:-250,category:'fee',type:'Commission'}]);
 const result=recaps(trades,cash).options;assert.equal(result.find(r=>r.kind==='new-york').fees.signedCents,'-100');assert.equal(result.find(r=>r.kind==='daily').fees.signedCents,String(-100-250));
});
test('whole partial-exit groups crossing days prevent a misleading cash comparison on either affected day',()=>{
 const trades=[row(10,11,10),row(10,12,5,'2026-09-18T14:00:00.000Z','2026-09-19T14:00:00.000Z'),row(20,21,2)];
 const result=recaps(trades,cashFor(trades));assert.equal(result.error,'');assert(result.options.every(r=>r.fees===null));
});
test('the same DST-aware local window applies to both trade membership and fee postings',()=>{
 for(const [date,start]of [['2026-03-06','14:30'],['2026-03-09','13:30']]){
 const at=date+'T'+start+':00.000Z',trades=[row(10,11,10,at,at)];const cash=cashFor(trades,[{at,deltaCents:-55,category:'fee',type:'Commission'}]);cash.window={startDate:'2026-03-01',endDate:'2026-03-15'};cash.asOf='2026-03-15T00:00:00.000Z';assert.equal(recaps(trades,cash).options.find(r=>r.kind==='new-york').fees.signedCents,'-55');
 }
});
test('sample and unsupported provider history never acquire a broker net-cash claim',()=>{
 const trades=[row(10,11,10)],cash=cashFor(trades);
 assert.equal(recaps(trades.map(t=>({...t,id:'demo-1'})),cash).options[0].fees,null);
 assert.equal(recaps(trades.map(t=>({...t,source:{provider:'Rithmic',accountId:'7',accountKey:'7',currency:'USD'}})),cash).options[0].fees,null);
});
