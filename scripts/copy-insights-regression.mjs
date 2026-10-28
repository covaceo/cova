import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import load from './helpers/load-ts.cjs';
const {InsightsView}=load('src/components/InsightsView.tsx');
const {analyze,sampleTrades,defaultRules}=load('src/lib/risk.ts');
const render=a=>renderToStaticMarkup(React.createElement(InsightsView,{analysis:a,entitlements:{plan:'pro',insightLimit:Infinity},go(){},upgradeToPro(){}}));
test('Insights removes defensive boilerplate rather than replacing it with slogans',()=>{
 const source=readFileSync('src/components/InsightsView.tsx','utf8');
 assert.doesNotMatch(source,/Historical review|historical review|recorded rows|risk-provided rows|Model evidence|Model state:|nothing is saved or inferred|Leave the motive unknown|No story to invent|There’s more here than the P&L|A note is a clue/);
 assert.doesNotMatch(render(analyze(sampleTrades,defaultRules)),/not a trade signal|historical review/i);
});
test('Insights copy cleanup preserves uncertain R, missing risk and unchecked limit warnings',()=>{
 const a=analyze(sampleTrades.map(t=>({...t,risk:0,riskStatus:'missing'})),defaultRules.map(r=>({...r,enabled:false})));
 const html=render(a);
 assert.match(html,/data-planned-risk-coverage/);assert.match(html,/data-rules-unchecked/);
 assert.doesNotMatch(html,/data-r-bar=/);assert.match(html,/No enabled limits/);
 assert.match(html,/Share Risk Passport/);
});
