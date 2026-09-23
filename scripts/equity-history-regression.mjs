import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import load from './helpers/load-ts.cjs';
const {AstraEquityCurve}=load('src/components/AstraEquityCurve.tsx');
const points=[{label:'Start',value:0},{label:'2026-09-07',value:-100},{label:'2026-09-08',value:-450},{label:'2026-09-11',value:250},{label:'2026-09-18',value:900}];
test('recovered account retains red historical observations and a split line/fill',()=>{
 const html=renderToStaticMarkup(React.createElement(AstraEquityCurve,{points,accountPnlCents:90000}));
 assert.match(html,/data-equity-history="split"/);
 assert.match(html,/class="astra-observation"[^>]*data-observation-index="1"[^>]*fill="#e57c89"/);
 assert.match(html,/class="astra-observation"[^>]*data-observation-index="4"[^>]*fill="#52c79a"/);
 assert.match(html,/data-equity-line-gradient/);
});

test('filtered windows keep the account baseline, not the range zero or last slope',()=>{
 for(const [values,total,history,colors] of [
  [[0,200],-80000,'loss',['#e57c89','#e57c89']],
  [[0,-200],80000,'profit',['#52c79a','#52c79a']],
  [[0,200],10000,'split',['#e57c89','#52c79a']],
  [[0,-200],-10000,'split',['#52c79a','#e57c89']],
  [[0,-100,0],0,'loss',['#4f7dff','#e57c89','#4f7dff']],
  [[0,100,-100],null,'neutral',['#4f7dff','#4f7dff','#4f7dff']],
 ]){
  const html=renderToStaticMarkup(React.createElement(AstraEquityCurve,{points:values.map((value,i)=>({label:i?'2026-09-18':'Start',value})),accountPnlCents:total}));
  assert.equal(html.match(/data-equity-history="([^"]+)"/)?.[1],history);
  assert.deepEqual([...html.matchAll(/class="astra-observation"[^>]*fill="([^"]+)"/g)].map(m=>m[1]),colors);
 }
});
test('dots remain on every observation for trades and daily charts including dense histories',()=>{
 for(const basis of ['trades','daily-net'])for(const count of [1,2,41,180]){
  const points=Array.from({length:count},(_,i)=>({label:'2026-09-18',value:i-10}));
  const html=renderToStaticMarkup(React.createElement(AstraEquityCurve,{points,basis,accountPnlCents:(count-11)*100}));
  assert.equal((html.match(/class="astra-observation"/g)||[]).length,count);
 }
});
