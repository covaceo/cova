import assert from 'node:assert/strict';
import test from 'node:test';
import load from './helpers/load-ts.cjs';
const { calculatePerformanceScore } = load('src/lib/risk.ts');
const day = i => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const rows = values => values.map((pnl, i) => ({ id: `score-${i}`, date: day(i), market: 'BTC', side: 'Long', contracts: 1, entry: 100, exit: 101, pnl, risk: 0, riskStatus: 'missing', setup: '', notes: '', manual: { accountKey: 'local', currency: 'USD', pnlBasis: 'reported_net' } }));
const score = values => calculatePerformanceScore(rows(values));
const approx = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

test('unavailable is null, never a fabricated zero or neutral score', () => {
 for (const values of [[],[0],[0,0,0]]) { const result=score(values);assert.equal(result.status,'unavailable');assert.equal(result.score,null); }
});
test('versioned, deterministic and traceable to measured components', () => {
 const r=score([100,-20,80,-30,60]);assert.equal(r.version,'cova-performance-v2');assert.equal(r.status,'available');
 assert.equal(r.components.length,3);approx(r.components.reduce((sum,c)=>sum+c.weight,0),1);
 approx(r.components.reduce((sum,c)=>sum+c.points,0),r.rawScore);
 approx(r.rawScore+r.evidenceAdjustment,r.unroundedScore);
 assert.equal(r.score,Math.round(r.unroundedScore*10)/10);
 assert.deepEqual(r,score([100,-20,80,-30,60]));assert.equal(r.netCents,'19000');assert.equal(r.maxDrawdownCents,'3000');
 assert.ok(r.score>50 && r.score<100);
});
test('one winning day is provisional, not perfect; no 72/86 plateaus', () => {
 const scores=[1,5,9,10,24,25,50].map(n=>score(Array(n).fill(100)).score);
 assert.equal(new Set(scores).size,scores.length);assert.ok(scores.every((s,i)=>!i||s>scores[i-1]));assert.ok(scores[0]<60);
});
test('all losses stay weak and a small sample never upgrades losing evidence', () => {
 for(const values of [[-100],[-10,-1000],Array(50).fill(-100)]) {const r=score(values);assert.ok(r.score<50);assert.equal(r.evidenceAdjustment,0);}
});
test('same profit, greater loss clustering lowers drawdown recovery', () => {
 const a=score([100,-50,100,-50,100,-50,100,-50]);const b=score([100,100,100,100,-50,-50,-50,-50]);
 assert.equal(a.netCents,b.netCents);assert.ok(a.score>b.score);assert.ok(BigInt(a.maxDrawdownCents)<BigInt(b.maxDrawdownCents));
});
test('distributed gains outrank dependence on one windfall with the same profit', () => {
 const a=score(Array(30).fill(100));const b=score([...Array(29).fill(-10),3290]);assert.equal(a.netCents,b.netCents);assert.ok(a.score>b.score);assert.ok(a.supportDays>b.supportDays);
});
test('dollar scale, IDs, input ordering and missing or edited risk do not manufacture points', () => {
 const source=rows([100,-20,80,-30,60]);const a=calculatePerformanceScore(source);
 for(const modified of [source.map(t=>({...t,pnl:t.pnl*10})),source.map((t,i)=>({...t,id:`new-${i}`,risk:100000,riskStatus:'provided',contracts:100,setup:'Changed'})),[...source].reverse()]){
 const b=calculatePerformanceScore(modified);assert.equal(a.score,b.score);approx(a.supportDays,b.supportDays); }
});
test('splitting the same daily result into partial rows earns no evidence', () => {
 const source=rows([100,-20,80]);const split=source.flatMap(t=>Array.from({length:5},(_,i)=>({...t,id:`${t.id}-${i}`,pnl:t.pnl/5})));
 const a=calculatePerformanceScore(source),b=calculatePerformanceScore(split);assert.equal(a.score,b.score);assert.deepEqual(a.days,b.days);assert.equal(a.supportDays,b.supportDays);
});
test('zero-P&L rows or idle calendar gaps cannot inflate the score', () => {
 const source=rows([100,-20,80]);const a=calculatePerformanceScore(source);
 const zero=rows(Array(30).fill(0)).map((t,i)=>({...t,id:`zero-${i}`,date:day(100+i)}));
 assert.equal(a.score,calculatePerformanceScore([...source,...zero]).score);
 assert.equal(a.score,calculatePerformanceScore(source.map((t,i)=>({...t,date:day(i*20)}))).score);
});
test('duplicate, malformed, unsafe, unknown-currency and mixed-basis evidence fails closed', () => {
 const source=rows([100,-20]);
 const bad=[ [source[0],source[0]], source.map(t=>({...t,pnl:NaN})),source.map(t=>({...t,pnl:Infinity})),source.map(t=>({...t,pnl:1.001})),source.map(t=>({...t,pnl:1e15})), source.map(t=>({...t,date:'2026-02-30'})), source.map(t=>({...t,manual:undefined})), source.map(t=>({...t,manual:{...t.manual,currency:'EUR'}})), [source[0],{...source[1],manual:{...source[1].manual,pnlBasis:'gross_before_fees'}}], source.map(t=>({...t,source:{provider:'Tradovate',accountId:'1',pnlBasis:'gross_before_fees'}})) ];
 for(const data of bad){const r=calculatePerformanceScore(data);assert.equal(r.status,'unavailable');assert.equal(r.score,null);assert.ok(r.reason);}
});
test('cent arithmetic survives offsetting amounts and no input is mutated', () => {
 const source=rows([0.1,0.2,-0.3]);source.forEach(t=>t.date=day(0));const before=JSON.stringify(source);assert.equal(calculatePerformanceScore(source).score,null);assert.equal(JSON.stringify(source),before);
 const r=score([0.1,0.2,-0.1]);assert.equal(r.netCents,'20');
});
test('bounds and finite output on deterministic varied histories', () => {
 let seed=91;for(let k=0;k<200;k++){const values=Array.from({length:1+k%61},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed%20001-10000)/100;});const r=score(values);assert.equal(r.status,'available');assert.ok(Number.isFinite(r.score)&&r.score>=0&&r.score<=100);assert.ok(r.supportDays>=1-1e-9&&r.supportDays<=r.nonzeroDays+1e-9);assert.ok(r.evidenceAdjustment<=0);}
});
