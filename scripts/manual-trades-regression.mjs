import test from 'node:test';import assert from 'node:assert/strict';import load from './helpers/load-ts.cjs';
const {appendManualTrade,removeManualTrade}=load('src/lib/manualTrades.ts');
const {sampleTrades}=load('src/lib/risk.ts');const {tradeAccountKey}=load('src/lib/tradovateHistory.ts');
const owner={identity:'owner-a',authGeneration:1,identityGeneration:1};
const draft={date:'2026-09-18',market:'MNQ',side:'Long',contracts:'2',entry:'20000.25',exit:'20010.25',pnl:'40.01',risk:'',setup:'Retest',notes:'Missed by import'};
const broker={...sampleTrades[0],id:'broker-original',source:{provider:'Tradovate',accountId:'71',pnlBasis:'gross_before_fees',timeZone:'UTC'}};
test('manual entry belongs to selected account without impersonating a broker record',()=>{
 const before=JSON.stringify(broker);const r=appendManualTrade([broker],draft,'Tradovate:71',100,owner,owner,true);assert.equal(r.error,null);assert.equal(r.trades.length,2);const m=r.trades[1];assert.equal(m.source,undefined);assert.equal(m.manual.currency,'USD');assert.equal(tradeAccountKey(m),'Tradovate:71');assert.equal(m.pnl,40.01);assert.equal(JSON.stringify(broker),before);
 assert(removeManualTrade(r.trades,m.id,owner,owner,true));assert.equal(removeManualTrade(r.trades,broker.id,owner,owner,true),null);
});
test('manual writes reject stale identities, account changes, invalid amounts, capacity and duplicates',()=>{
 for(const [d,a,max,who,current]of [[draft,'Tradovate:71',100,null,true],[draft,'Tradovate:71',100,{...owner,identity:'other'},true],[draft,'Tradovate:71',100,owner,false],[draft,'Tradovate:99',100,owner,true],[draft,'Tradovate:71',1,owner,true],[{...draft,pnl:'1.001'},'Tradovate:71',100,owner,true],[{...draft,date:'2026-02-30'},'Tradovate:71',100,owner,true],[{...draft,contracts:'1.5'},'Tradovate:71',100,owner,true],[{...draft,entry:''},'Tradovate:71',100,owner,true]])assert(appendManualTrade([broker],d,a,max,owner,who,current).error);
 const first=appendManualTrade([broker],draft,'Tradovate:71',100,owner,owner,true);assert(appendManualTrade(first.trades,draft,'Tradovate:71',100,owner,owner,true).error);
});
