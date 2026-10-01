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
 for(const bad of [null,{}, {...cash,accountId:'8'},{...cash,currency:'EUR'},{...cash,grossCents:1},{...cash,netCents:1},{...cash,asOf:'2026-09-18T14:05:00.000Z'},{...cash,window:{startDate:'2026-09-17',endDate:'2026-09-18'}}])assert.equal(recaps(trades,bad).options[0].fees,null);
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
test('today can use a reconciled sync before session close or UTC midnight',()=>{
 const trades=[row(10,11,10),row(20,21,-5)],cash=cashFor(trades);cash.asOf='2026-09-18T14:15:00.000Z';
 for(const recap of recaps(trades,cash).options){assert.equal(recap.fees?.netCashCents,'400');assert.equal(recap.fees?.asOf,cash.asOf);}
 cash.asOf='2026-09-18T14:10:00.000Z';assert.equal(recaps(trades,cash).options[0].fees?.netCashCents,'400','snapshot includes postings at its exact timestamp');
 cash.asOf='2026-09-18T14:09:59.999Z';assert.equal(recaps(trades,cash).options[0].fees,null,'a future trade cannot be backed by an earlier sync');
});
test('history outside the synced report window does not disable covered daily fees',()=>{
 const trades=[row(10,11,10)],old=row(30,31,90,'2026-08-01T14:00:00.000Z','2026-08-01T14:10:00.000Z'),cash=cashFor(trades),all=[...trades,old];
 assert.equal(recaps(all,cash).options.find(r=>r.id==='daily:2026-09-18').fees?.netCashCents,'900');
 assert.equal(recaps(all,cash).options.find(r=>r.id==='daily:2026-08-01').fees,null);
 const store=new Map();global.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 try{const {saveBrokerCash,readBrokerCashEvidence}=load('src/lib/brokerCash.ts');store.set('cova-active-storage-identity-v1','owner-a');saveBrokerCash('owner-a','7',cash,trades);
 assert.deepEqual(readBrokerCashEvidence(all,'owner-a'),cash);
 assert.equal(readBrokerCashEvidence([{...trades[0],pnl:20},old],'owner-a'),null);
 assert.equal(readBrokerCashEvidence([trades[0],row(50,51,0),old],'owner-a'),null,'extra in-window row invalidates fingerprint');
 assert.equal(readBrokerCashEvidence([trades[0],{...old,source:{...old.source,accountId:'8'}}],'owner-a'),null);
 assert.equal(readBrokerCashEvidence(all,'owner-b'),null);
 }finally{delete global.localStorage;}
});
test('net headline never silently falls back to gross when Tradovate cash is missing',()=>{
 const m=load('src/lib/sessionRecap.ts'),trades=[row(10,11,10)],r=recaps(trades,cashFor(trades)).options[0];
 assert.equal(m.recapHeadlineCents(r),'900');assert.equal(m.recapExportError(r),'');assert.equal(r.totalCents,'1000');
 const missing={...r,fees:null};assert.equal(m.recapHeadlineCents(missing),null);assert.match(m.recapExportError(missing),/Sync.*fees/i);
 assert.equal(m.recapHeadlineCents({...missing,sample:true}),'1000');
 assert.equal(m.recapHeadlineCents({...missing,basis:'Reported P&L · fees unconfirmed'}),'1000');
 const loss=recaps(trades,cashFor(trades,[{at:trades[0].source.openedAt,deltaCents:-1200,category:'fee',type:'Commission'}])).options[0];
 assert.equal(m.recapHeadlineCents(loss),'-200','fee-driven losses use the net sign, not gross');
});

test('sample and unsupported provider history never acquire a broker net-cash claim',()=>{
 const trades=[row(10,11,10)],cash=cashFor(trades);
 assert.equal(recaps(trades.map(t=>({...t,id:'demo-1'})),cash).options[0].fees,null);
 assert.equal(recaps(trades.map(t=>({...t,source:{provider:'Rithmic',accountId:'7',accountKey:'7',currency:'USD'}})),cash).options[0].fees,null);
});

test('manual entry under selected Tradovate account gets separate accurate recaps and owner-only manual badge',()=>{
 const {appendManualTrade}=load('src/lib/manualTrades.ts'),{tradeAccountKey}=load('src/lib/tradovateHistory.ts');
 const {checkedRecapIdentity}=load('src/lib/recapVerification.ts');
 const {buildSessionRecaps,recapHeadlineCents,recapExportError}=load('src/lib/sessionRecap.ts');
 const broker=[row(10,11,10)],cash=cashFor(broker),principal={identity:'owner-a',authGeneration:1,identityGeneration:1};
 const draft={date:'2026-09-18',market:'MNQ',side:'Long',contracts:'1',entry:'20000',exit:'20010',pnl:'20',risk:'',setup:'',notes:''};
 const added=appendManualTrade(broker,draft,'Tradovate:7',100,principal,principal,true);assert.equal(added.error,null);
 const manual=added.trades.at(-1);assert.equal(manual.source,undefined);assert.equal(tradeAccountKey(manual),'Tradovate:7');
 const before=JSON.stringify(added.trades),previous=global.localStorage;global.localStorage={getItem:k=>k==='cova-active-storage-identity-v1'?'owner-a':null};
 try {
  const connection=checkedRecapIdentity('owner-a',{id:'owner-a',email:'lino@covadesk.com',email_confirmed_at:'2026-01-01T00:00:00Z'});
  const selection={owner:'owner-a',selectedAccount:'Tradovate:7',connection};
  const data=buildSessionRecaps(added.trades,cash,selection);assert.equal(data.error,'');
  const m=data.options.find(r=>r.id==='manual:daily:2026-09-18'),b=data.options.find(r=>r.id==='tradovate:daily:2026-09-18');
  assert.equal(m.title,'Daily recap');assert.equal(b.title,'Daily recap');assert.equal(m.sourceScope,'Manual');assert.equal(b.sourceScope,'Tradovate');assert.equal(m.count,1);assert.equal(b.count,1);
  assert.equal(recapHeadlineCents(m),'2000');assert.equal(m.fees,null);assert.equal(m.basis,'Reported net P&L');assert.equal(m.reportedNet,true);assert.equal(m.verification.basis,'owner-approved');
  assert.equal(recapHeadlineCents(b),'900');assert.equal(b.fees.signedCents,'-100');assert.equal(b.verification,null,'Manual owner approval never fabricates a broker receipt');
  assert.equal(recapExportError(m),'');assert.equal(recapExportError(b),'');assert.match(m.details,/excludes Tradovate records/);
  const missing=buildSessionRecaps(added.trades,null,selection);assert.equal(recapHeadlineCents(missing.options.find(r=>r.id===b.id)),null);assert(recapExportError(missing.options.find(r=>r.id===b.id)));assert.equal(recapHeadlineCents(missing.options[0]),'2000');
  for(const connection of [null,checkedRecapIdentity('owner-a',{id:'owner-a',email:'other@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'}),{...selection.connection,expiresAt:Date.now()-1}])assert.equal(buildSessionRecaps(added.trades,cash,{...selection,connection}).options[0].verification,null);
  assert.equal(buildSessionRecaps(added.trades,cash,{...selection,selectedAccount:'all'}).options[0].verification,null);
  assert(buildSessionRecaps([...broker,{...manual,manual:{...manual.manual,currency:'EUR'}}],cash,selection).error);
  assert(buildSessionRecaps([...broker,{...manual,pnl:Infinity}],cash,selection).error);
  assert.equal(JSON.stringify(added.trades),before,'No ledger mutation or customer-data migration');
 } finally {global.localStorage=previous}
});

test('entered manual net is exact, never fee-adjusted; legacy gross is not silently relabelled',()=>{
 const {buildSessionRecaps,recapHeadlineCents,recapFeeLine}=load('src/lib/sessionRecap.ts');
 const manual=(id,pnl,basis='reported_net')=>({...row(1,2,pnl),id:'manual-'+id,source:undefined,manual:{accountKey:'Tradovate:7',currency:'USD',pnlBasis:basis}});
 const input=[manual('a',500),manual('b',641.58)],before=JSON.stringify(input);
 const result=buildSessionRecaps(input,cashFor([row(1,2,1141.58)]));const r=result.options[0];
 assert.equal(result.error,'');assert.equal(r.reportedNet,true);assert.equal(recapHeadlineCents(r),'114158');assert.equal(r.fees,null);assert.equal(r.count,2);assert.equal(r.winRate,'100%');assert.equal(r.basis,'Reported net P&L');assert.match(recapFeeLine(r),/no additional fee deduction/);assert.equal(JSON.stringify(input),before);
 for(const pnl of [0,-123.45,999999.99])assert.equal(recapHeadlineCents(buildSessionRecaps([manual('amount',pnl)]).options[0]),String(Math.round(pnl*100)));
 const legacy=manual('legacy',20,'gross_before_fees');const old=buildSessionRecaps([legacy]).options[0];assert.equal(old.reportedNet,false);assert.match(old.basis,/gross/);assert.equal(legacy.manual.pnlBasis,'gross_before_fees');
 const mixed=buildSessionRecaps([legacy,manual('net',10)]).options[0];assert.equal(mixed.reportedNet,false);assert.equal(mixed.basis,'Reported P&L · fees unconfirmed');
});

test('manual count wording matches identified broker entries without grouping unrelated manual rows',()=>{
 const {buildSessionRecaps,recapHeadlineCents}=load('src/lib/sessionRecap.ts');
 const manual=(id,pnl)=>({id:'manual-'+id,date:'2026-09-18',market:'MNQ',side:'Long',contracts:1,entry:1,exit:2,pnl,risk:0,manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}});
 const rows=[manual('a',5),manual('b',-2),manual('c',0)];
 const before=JSON.stringify(rows),result=buildSessionRecaps(rows).options[0];
 assert.equal(result.countLabel,'Trade entries');assert.equal(result.count,3);assert.equal(result.winRate,'33.33%');assert.equal(recapHeadlineCents(result),'300');assert.equal(JSON.stringify(rows),before);
});
