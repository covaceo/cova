import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
const {sampleTrades,mergeTradeLedger}=load('src/lib/risk.ts');
const {filterTradeAccount}=load('src/lib/tradovateHistory.ts');
const real={...sampleTrades[0],id:'tradovate-71:101:102',date:'2026-09-18',pnl:25,source:{provider:'Tradovate',accountId:'71',pnlBasis:'gross_before_fees',timeZone:'UTC'}};
test('All accounts excludes saved demo rows after a real import without mutating history',()=>{
 const ledger=mergeTradeLedger(sampleTrades,[real]).trades,before=JSON.stringify(ledger);
 assert.deepEqual(filterTradeAccount(ledger,'all'),[real]);
 assert.deepEqual(filterTradeAccount(ledger,'Tradovate:71'),[real]);
 assert.deepEqual(filterTradeAccount(ledger,'local'),[]);
 assert.equal(JSON.stringify(ledger),before,'Saved rows must remain untouched');
 assert.deepEqual(filterTradeAccount(JSON.parse(before),'all'),[real],'Legacy persisted mixture is isolated on reload');
});

test('standalone samples remain available and real April CSV/manual/broker records are preserved',()=>{
 assert.deepEqual(filterTradeAccount(sampleTrades,'all'),sampleTrades);
 assert.deepEqual(filterTradeAccount([],'all'),[]);
 const csv={...sampleTrades[0],id:'csv-real-april',notes:'Owner annotation'};
 const manual={...real,id:'demo-custom-manual',source:undefined,manual:{accountKey:'Tradovate:71',currency:'USD'}};
 const broker={...real,id:'demo-provider-owned'};
 const ledger=[...sampleTrades,csv,manual,broker];
 assert.deepEqual(filterTradeAccount(ledger,'all'),[csv,manual,broker]);
 assert.deepEqual(filterTradeAccount(ledger,'local'),[csv]);
 assert.deepEqual(filterTradeAccount(ledger,'Tradovate:71'),[manual,broker]);
});
const {accountEquityPnlCents}=load('src/lib/equityCurveState.ts');
const unavailable={status:'unavailable',reason:'reported basis'};
test('combined color gate rejects invalid/unknown money, but accepts known USD across accounts',()=>{
 const second={...real,id:'tradovate-72:103:104',source:{...real.source,accountId:'72'},pnl:-40};
 assert.equal(accountEquityPnlCents([real,second],unavailable),-1500);
 assert.equal(accountEquityPnlCents([real,second],{status:'available',netCents:999999}),-1500,'Never apply one account cash balance to the combined gross curve');
 for(const bad of [{...second,pnl:0.001},{...second,source:undefined},{...second,market:'UNKNOWN'},{...second,source:{provider:'Rithmic',accountKey:'r',accountId:'72',currency:'EUR'}}]) assert.equal(accountEquityPnlCents([real,bad],unavailable),null);
 assert.equal(accountEquityPnlCents([real,real],unavailable),null);
 assert.equal(accountEquityPnlCents(sampleTrades,unavailable),null);
});
