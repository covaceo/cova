import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
const {buildEquityGeometry}=load('src/lib/dashboardPresentation.ts');
const input=[{label:'Start',value:0},{label:'2026-10-20',value:825},{label:'2026-10-24',value:550},{label:'2026-10-28',value:1000},{label:'2026-10-30',value:1350}];
test('reference presentation reserves left scale and compact plot without changing ledger or domain',()=>{
 const normal=buildEquityGeometry(input,1044),compact=buildEquityGeometry(input,1044,true);
 assert.deepEqual(compact.points.map(({label,value})=>({label,value})),input);
 assert.deepEqual([compact.min,compact.max],[normal.min,normal.max]);
 assert.equal(compact.left,64); assert.equal(compact.right,12);assert.equal(compact.top,5);
 assert.equal(compact.height,203);assert.equal(compact.bottom,32);assert.equal(compact.ticks.length,5);
 assert.equal(normal.left,8);assert.equal(normal.right,65);assert.equal(normal.height,290);assert.equal(normal.ticks.length,3);
});
