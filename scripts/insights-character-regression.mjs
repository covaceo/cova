import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url));
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const load=require('./scripts/helpers/load-ts.cjs');
const {InsightsView}=load('src/components/InsightsView.tsx');
const {analyze,sampleTrades,defaultRules}=load('src/lib/risk.ts');
const analysis=analyze(sampleTrades,defaultRules);
test('comparison has a shared signed R axis, selected full-row controls and exact proportional marks',()=>{
 const html=render();
 assert.match(html,/data-r-axis/);
 assert.match(html,/>0R</);
 assert.match(html,/>−[0-9.]+R</);
 assert.match(html,/>\+[0-9.]+R</);
 assert.match(html,/class="ip-setup-choice"[^>]*aria-pressed="true"/);
 const bars=[...html.matchAll(/data-r-bar="([^"]+)" style="width:([^%]+)%;left:([^%]+)%"/g)];
 assert.equal(bars.length,analysis.bySetup.filter(s=>s.riskCount>=3&&Number.isFinite(s.avgR)).length);
 const scales=bars.filter(b=>+b[1]!==0).map(b=>Math.abs(+b[1])/(+b[2]/50));
 assert.ok(scales.every(s=>Math.abs(s-scales[0])<1e-8));
 for(const b of bars)assert.ok(Math.abs(+b[3]-(+b[1]<0?50-(+b[2]):50))<1e-8);
});
const render=(a=analysis,limit=Infinity)=>renderToStaticMarkup(React.createElement(InsightsView,{analysis:a,entitlements:{plan:limit===2?'free':'pro',insightLimit:limit},go(){},upgradeToPro(){}}));
test('risk coverage stays with setups and missing-risk caveats, not a duplicate full-coverage inventory',()=>{
 assert.doesNotMatch(render(),/ip-coverage-value/);
 assert.match(render({...analysis,missingRiskCount:2}),/data-planned-risk-coverage/);
});
test('default comparison renders selected setup actual trades and note alongside, including Free',()=>{
 for(const limit of [Infinity,2]){
 const html=render(analysis,limit);
 const best=[...analysis.bySetup].filter(s=>s.riskCount>=3&&Number.isFinite(s.avgR)).sort((a,b)=>b.avgR-a.avgR)[0];
 const row=analysis.trades.find(t=>t.setup===best.name);
 assert.match(html,/data-insight="setups"/);
 assert.match(html,/data-insight="notes"/,'default must render evidence, not navigate away');
 assert.ok(html.includes(row.notes),'actual first selected setup note present');
 assert.match(html,/aria-controls="ip-setup-evidence"/);
 }
});
