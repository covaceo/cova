import test from 'node:test';
import assert from 'node:assert/strict';
const header='Account,Transaction ID,Timestamp,Date,Delta,Amount,Cash Change Type,Currency,Contract';
const window={startDate:'2026-09-01',endDate:'2026-09-20',timeZone:'UTC',timezoneOffset:0};
const csv=[header,'Synthetic,1,09/04/2026 10:00:00,2026-09-04,"1,000.00","1,000.00", Fund Transaction,USD,','Synthetic,2,09/04/2026 11:00:00,2026-09-04,-1.21,998.79, Commission,USD,MNQU6','Synthetic,3,09/04/2026 12:00:00,2026-09-04,10.00,"1,008.79", Trade Paired,USD,MNQU6'].join('\r\n')+'\r\n';
test('actual cash schema reconciles funding separately and keeps exact signed cents',async()=>{
 const api=await import('../api/_lib/tradovate-cash.js').catch(()=>({}));
 assert.equal(typeof api.parseCashHistory,'function');
 const r=api.parseCashHistory(csv,{id:'71',name:'Synthetic'},window,[{pnl:10}]);
 assert.equal(r.status,'reconciled');assert.equal(r.netCents,879);assert.equal(r.feeCents,-121);assert.equal(r.grossCents,1000);assert.equal(r.nonTradingCents,100000);assert.equal(r.closingBalanceCents,100879);assert.equal(r.openingBalanceCents,0);assert.equal(r.entries.length,3);
});
test('cash reconciliation refuses gaps, duplicate events, unknown charges and nonmatching gross',async()=>{
 const {parseCashHistory:parse}=await import('../api/_lib/tradovate-cash.js');
 for(const bad of [csv.replace('1,008.79','1,009.79'),csv+csv.split('\r\n')[2]+'\r\n',csv.replace(' Commission,',' Mystery Fee,'),csv.replace('Synthetic,2','Other,2'),csv.replace('-1.21','-1.211'),csv.replace(',USD,',',EUR,')]) assert.throws(()=>parse(bad,{id:'71',name:'Synthetic'},window,[{pnl:10}]));
 assert.throws(()=>parse(csv,{id:'71',name:'Synthetic'},window,[{pnl:11}]));
 const r=parse(csv.replace(/\r\n/g,'\r\r\n'),{id:'71',name:'Synthetic'},window,[{pnl:10}]);assert.equal(r.netCents,879);
});
export {csv,window};
