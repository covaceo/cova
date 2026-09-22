import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
const model=()=>load('src/lib/sessionRecap.ts');
const row=(day,pnl,id,hour='14')=>({id:`tradovate-7:${id*2}:${id*2+1}`,date:day,market:'MNQ',side:'Long',contracts:1,entry:20000,exit:20001,pnl,risk:10,setup:'',notes:'',source:{provider:'Tradovate',accountId:'7',pnlBasis:'gross_before_fees',timeZone:'UTC',openedAt:`${day}T${hour}:00:00.000Z`,closedAt:`${day}T${hour}:10:00.000Z`}});
function cashFor(trades,extras=[]){
 let balance=100000;
 const entries=[...trades.map(t=>({at:t.source.closedAt,deltaCents:Math.round(t.pnl*100),category:'trade',type:'Trade Paired'})),...extras].sort((a,b)=>a.at.localeCompare(b.at)).map((e,i)=>({...e,id:String(i+1),balanceCents:balance+=e.deltaCents,currency:'USD',contract:'MNQZ6'}));
 const sum=c=>entries.filter(e=>e.category===c).reduce((n,e)=>n+e.deltaCents,0);
 return {status:'reconciled',version:1,accountId:'7',currency:'USD',window:{startDate:'2026-09-01',endDate:'2026-09-22'},asOf:'2026-09-21T18:00:00.000Z',basis:'cash_movements_no_trade_allocation',entries,grossCents:sum('trade'),feeCents:sum('fee'),netCents:sum('trade')+sum('fee'),nonTradingCents:sum('funding'),openingBalanceCents:100000,closingBalanceCents:balance};
}
const fee=(day,cents)=>({at:day+'T14:00:00.000Z',deltaCents:cents,category:'fee',type:'Commission'});
const at=(rows,cash,day,kind='daily')=>model().buildSessionRecaps(rows,cash).options.find(r=>r.id===`${kind}:${day}`);
test('hot streak counts net-green days, not winning trades or partial exits',()=>{
 const rows=[row('2026-09-14',-10,1),row('2026-09-15',10,2),row('2026-09-15',20,3),row('2026-09-16',30,4)];
 const cash=cashFor(rows),before=structuredClone({rows,cash}),r=at(rows,cash,'2026-09-16');
 assert.deepEqual(r.hotStreak,{days:2,atLeast:false});assert.equal(model().recapHotStreakLine(r),'2 DAY HOT STREAK');assert.deepEqual({rows,cash},before);
});
test('red and after-fee breakeven days reset the streak',()=>{
 for(const middle of [-1,0]){const rows=[row('2026-09-14',8,1),row('2026-09-15',middle,2),row('2026-09-16',9,3)];assert.deepEqual(at(rows,cashFor(rows),'2026-09-16').hotStreak,{days:1,atLeast:false});}
 const rows=[row('2026-09-14',10,1),row('2026-09-15',10,2),row('2026-09-16',10,3)],cash=cashFor(rows,[fee('2026-09-15',-1000)]);
 assert.deepEqual(at(rows,cash,'2026-09-15').hotStreak,{days:0,atLeast:false});assert.equal(model().recapHotStreakLine(at(rows,cash,'2026-09-15')),'');
 assert.deepEqual(at(rows,cash,'2026-09-16').hotStreak,{days:1,atLeast:false});
});
test('weekends, idle days and deposits do not add wins or break a proven streak',()=>{
 const rows=[row('2026-09-10',-10,1),row('2026-09-11',10,2),row('2026-09-14',10,3)],cash=cashFor(rows,[{at:'2026-09-12T12:00:00.000Z',deltaCents:2500000,category:'funding',type:'Fund Transaction'}]);
 assert.deepEqual(at(rows,cash,'2026-09-14').hotStreak,{days:2,atLeast:false});
});
test('regional recap uses the whole UTC day, not an isolated profitable session',()=>{
 const rows=[row('2026-09-14',-10,1),row('2026-09-15',10,2),row('2026-09-15',-20,3,'21')],cash=cashFor(rows);
 const ny=at(rows,cash,'2026-09-15','new-york');assert(BigInt(ny.fees.netCashCents)>0n);assert.deepEqual(ny.hotStreak,{days:0,atLeast:false});
});
test('historical recaps stop on their selected date, not the newest day',()=>{
 const rows=[row('2026-09-14',-10,1),row('2026-09-15',10,2),row('2026-09-16',10,3),row('2026-09-17',-10,4)],cash=cashFor(rows);
 assert.deepEqual(at(rows,cash,'2026-09-16').hotStreak,{days:2,atLeast:false});assert.equal(at(rows,cash,'2026-09-17').hotStreak.days,0);
});
test('limited earlier coverage shows a lower bound, never an invented exact start',()=>{
 const rows=[row('2026-09-15',10,1),row('2026-09-16',10,2)],cash=cashFor(rows),r=at(rows,cash,'2026-09-16');
 assert.deepEqual(r.hotStreak,{days:2,atLeast:true});assert.equal(model().recapHotStreakLine(r),'2+ DAY HOT STREAK');
});
test('unreconciled earlier days are barriers, not skipped losing days',()=>{
 const rows=[row('2026-09-14',-10,1),row('2026-09-15',10,2),row('2026-09-16',10,3)],cash=cashFor(rows);
 cash.entries.find(e=>e.at.startsWith('2026-09-15')).contract='MESZ6';
 assert.equal(at(rows,cash,'2026-09-15').hotStreak,null);
 assert.deepEqual(at(rows,cash,'2026-09-16').hotStreak,{days:1,atLeast:true});
});
test('fee-only activity cannot be silently treated as a verified idle day',()=>{
 const rows=[row('2026-09-14',-10,1),row('2026-09-15',10,2),row('2026-09-17',10,3)],cash=cashFor(rows,[fee('2026-09-16',-100)]);
 assert.deepEqual(at(rows,cash,'2026-09-17').hotStreak,{days:1,atLeast:true});
});
test('missing, sample, foreign and unsupported cash never receive a streak claim',()=>{
 const rows=[row('2026-09-15',10,1)],cash=cashFor(rows);
 for(const c of [null,{...cash,accountId:'8'}])assert.equal(at(rows,c,'2026-09-15').hotStreak,null);
 const sample=rows.map(t=>({...t,id:'demo-1'}));assert.equal(at(sample,cash,'2026-09-15').hotStreak,null);
 const foreign=[...rows,{...row('2026-09-16',10,2),source:{...rows[0].source,accountId:'8'}}];assert.deepEqual(model().buildSessionRecaps(foreign,cash).options,[]);
});
test('same-day streak is a mutable synced result, not a claim the trader stopped trading',()=>{
 const rows=[row('2026-09-14',-10,1),row('2026-09-15',10,2)],cash=cashFor(rows);cash.asOf='2026-09-15T14:15:00.000Z';
 assert.deepEqual(at(rows,cash,'2026-09-15').hotStreak,{days:1,atLeast:false});
 const later=[...rows,row('2026-09-15',-20,3,'15')],laterCash=cashFor(later);laterCash.asOf='2026-09-15T15:15:00.000Z';assert.equal(at(later,laterCash,'2026-09-15').hotStreak.days,0);
});
