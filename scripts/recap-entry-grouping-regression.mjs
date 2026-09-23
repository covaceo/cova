import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
const api=()=>load('src/lib/sessionRecap.ts');
// Deidentified shape of a saved report: scale-in, shared trim, remaining exit.
const row=(buy,sell,open,close,entry,exit,qty,side='Short')=>({id:`tradovate-7:${buy}:${sell}`,date:'2026-09-15',market:'MNQ',side,contracts:qty,entry,exit,pnl:Math.round((exit-entry)*(side==='Long'?1:-1)*qty*200)/100,risk:0,setup:'',notes:'',source:{provider:'Tradovate',accountId:'7',pnlBasis:'gross_before_fees',timeZone:'UTC',openedAt:`2026-09-15T${open}.000Z`,closedAt:`2026-09-15T${close}.000Z`}});
const scaled=()=>[
 row(101,201,'14:18:07','14:22:04',20020,20000,1),
 row(101,202,'14:17:39','14:22:04',20010,20000,3),
 row(102,201,'14:18:07','14:22:11',20020,19995,2),
];
const daily=rows=>api().buildSessionRecaps(rows).options.find(r=>r.kind==='daily');
test('one broker-linked trade with scale-in and partial exits counts once, never once per opening fill',()=>{
 const rows=scaled(),before=structuredClone(rows),recap=daily(rows);
 assert.equal(recap.count,1);
 assert.equal(recap.winRate,'100%');
 assert.equal(recap.totalCents,'20000');
 assert.deepEqual(rows,before);
});
test('long-side trims and split opening fills also produce one recap entry',()=>{
 const rows=scaled().map(t=>({...t,id:`tradovate-7:${t.id.split(':')[2]}:${t.id.split(':')[1]}`,side:'Long',entry:40000-t.entry,exit:40000-t.exit}));
 assert.equal(daily(rows).count,1);
});
test('a flat re-entry stays separate even with identical prices, quantities and timestamps',()=>{
 const rows=[...scaled(),row(301,401,'14:18:07','14:22:04',20020,20000,1)];
 assert.equal(daily(rows).count,2,'Time and price are not an identity');
 const later=row(302,402,'14:23:00','14:24:00',20020,20000,1);
 assert.equal(daily([...scaled(),later]).count,2);
});
test('transitive broker fill links are order-independent and preserve all money',()=>{
 const rows=[...scaled(),row(102,203,'14:19:00','14:22:11',20010,19995,1)];
 const expected=String(rows.reduce((sum,t)=>sum+Math.round(t.pnl*100),0));
 for(const order of [rows,[...rows].reverse(),[rows[2],rows[0],rows[3],rows[1]]]){
  const r=daily(order);assert.equal(r.count,1);assert.equal(r.totalCents,expected);
 }
});
test('win rate classifies the whole linked entry, not each winning or losing piece',()=>{
 const rows=[row(101,201,'14:00:00','14:10:00',19990,20000,1),row(101,202,'14:01:00','14:10:00',20020,20000,1),row(102,203,'14:20:00','14:25:00',19980,20000,1)];
 const r=daily(rows);assert.equal(r.count,2);assert.equal(r.wins,1);assert.equal(r.winRate,'50%');
});
test('contradictory closing fill evidence never joins independent entries',()=>{
 for(const change of [t=>({...t,exit:t.exit+1}),t=>({...t,market:'NQ'}),t=>({...t,source:{...t.source,closedAt:'2026-09-15T14:22:05.000Z'}})]){
  const rows=scaled();rows[1]=change(rows[1]);assert.equal(daily(rows).count,2);
 }
});
test('account and opening/closing roles cannot bridge groups',()=>{
 const group=load('src/lib/recapEntryGroups.ts').groupRecapEntries;
 const rows=scaled(),other=rows.map(t=>({...t,id:t.id.replace('tradovate-7:','tradovate-8:'),source:{...t.source,accountId:'8'}}));
 assert.equal(group([...rows,...other]).length,2);
 const reversal=row(101,500,'14:22:04','14:25:00',20000,20010,1,'Long');
 assert.equal(group([...rows,reversal]).length,2,'Closing a short and opening a long with one fill is not one entry');
});
test('cross-day trims stay together and use final observed exit date',()=>{
 const rows=scaled();rows[2]={...rows[2],date:'2026-09-16',source:{...rows[2].source,closedAt:'2026-09-16T01:00:00.000Z'}};
 const options=api().buildSessionRecaps(rows).options.filter(r=>r.kind==='daily');
 assert.equal(options.length,1);assert.equal(options[0].date,'2026-09-16');assert.equal(options[0].count,1);
});
test('ordinary single-opening-fill trims remain one and duplicate rows remain blocked',()=>{
 const rows=[scaled()[0],scaled()[2]];assert.equal(daily(rows).count,1);
 assert.deepEqual(api().buildSessionRecaps([...rows,rows[0]]).options,[]);
});
