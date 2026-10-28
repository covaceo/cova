import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chromium} from 'playwright';
import load from './helpers/load-ts.cjs';
const {LimitsEditor}=load('src/components/LimitsEditor.tsx');
const {InsightsView}=load('src/components/InsightsView.tsx');
const {analyze,sampleTrades,defaultRules}=load('src/lib/risk.ts');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const entitlements={plan:'pro',canEditAdvancedLimits:true,canExportPassport:true,insightLimit:Infinity};
const props=(trades=sampleTrades,rules=defaultRules,plan=entitlements)=>({analysis:analyze(trades,rules),rules,entitlements:plan,setRules(){},go(){},upgradeToPro(){}});
const html=(Component,p=props())=>renderToStaticMarkup(React.createElement(Component,p));

test('production routes mount the approved real components, not the old views',()=>{
 const app=read('src/App.tsx');assert.match(app,/LimitsEditor as RulesEngine/);assert.match(app,/InsightsView as Coach/);
 for(const name of ['limitsInsightsShared','limitsEditor','insightsView','workspaceStatusRefinement'])assert.ok(read('src/main.tsx').includes(`styles/${name}.css`));
 for(const file of ['src/components/LimitsEditor.tsx','src/components/InsightsView.tsx','src/styles/limitsInsightsShared.css','src/styles/workspaceStatusRefinement.css'])assert.doesNotMatch(read(file),/__qaSession|cova-preview-fixture|example\.invalid|localStorage\.setItem|access_token/);
});
test('Limits is editing only, with six rules and optional advanced settings',()=>{
 const s=html(LimitsEditor);assert.equal((s.match(/data-rule-id=/g)||[]).length,6);assert.match(s,/Core limits/);assert.match(s,/Advanced limits/);assert.match(s,/Adjust range/);assert.doesNotMatch(s,/Historical review|Breach in history|Trades reviewed|Review warnings/);assert.match(s,/does not block orders/);assert.doesNotMatch(s,/<details[^>]+open/);
});
test('Free keeps core editable and both advanced rules locked',()=>{
 const s=html(LimitsEditor,props(sampleTrades,defaultRules,{...entitlements,plan:'free',canEditAdvancedLimits:false,insightLimit:2}));assert.equal((s.match(/disabled=""/g)||[]).length,6);assert.equal((s.match(/View-only on Free/g)||[]).length,2);
});
test('Limits remains editable with no history or disabled rules',()=>{
 for(const p of[props([]),props(sampleTrades,defaultRules.map(r=>({...r,enabled:false})))]){const s=html(LimitsEditor,p);assert.equal((s.match(/type="number"/g)||[]).length,6);assert.doesNotMatch(s,/No trades to review|No warnings in history/);}
});
test('Insights defaults to a real setup comparison with numerical evidence and local R limitations',()=>{
 const p=props(),s=html(InsightsView,p);
 assert.match(s,/data-question="working"/);
 assert.equal((s.match(/data-setup-row=/g)||[]).length,p.analysis.bySetup.length);
 for(const setup of p.analysis.bySetup.filter(row=>row.riskCount>=3&&Number.isFinite(row.avgR))){
  assert.ok(s.includes(`data-open-setup="${setup.name}"`));
  assert.ok(s.includes(`data-r-bar="${setup.avgR}"`),'Use the model result, not a copied headline number');
 }
 assert.match(s,/data-insight="notes"/);
 assert.match(s,/display minimum, not proof of a reliable pattern/);
 assert.match(s,/Sample sizes and missing risk can affect the comparison/);
 assert.doesNotMatch(s,/Historical review, not a trade signal/);
});
test('Free keeps setup comparison and actual notes; the status summary remains entitlement-gated',()=>{
 const s=html(InsightsView,props(sampleTrades,defaultRules,{...entitlements,plan:'free',insightLimit:2}));
 assert.match(s,/data-insight="setups"/);assert.match(s,/data-insight="notes"/);assert.doesNotMatch(s,/data-insight="status"/);
 const source=read('src/components/InsightsView.tsx');
 assert.match(source,/\["finding", "setups", "status"\]\.slice\(0, entitlements\.insightLimit\)/);
 assert.match(source,/visible\.includes\("status"\)[\s\S]*data-insight="status"/);
 assert.match(source,/locked > 0[\s\S]*data-insights-locked[\s\S]*onClick=\{upgradeToPro\}/);
});
test('empty, missing-risk and disabled-rule states remain honest',()=>{
 assert.match(html(InsightsView,props([])),/data-insights-empty/);
 const s=html(InsightsView,props(sampleTrades.map(t=>({...t,risk:0,riskStatus:'missing'}))));assert.match(s,/data-planned-risk-coverage/);assert.doesNotMatch(s,/data-r-eligible="true"/);
 assert.match(html(InsightsView,props(sampleTrades,defaultRules.map(r=>({...r,enabled:false})))),/No enabled limits/);
});
test('browser CSS removes nested number fills and keeps native disclosure usable',async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true});try{const p=await b.newPage();const css=['workspaceStorage','mobileWorkspace','limitsInsightsShared','limitsEditor','workspaceStatusRefinement'].map(n=>read(`src/styles/${n}.css`)).join('\n');
 for(const width of[1440,768,390]){await p.setViewportSize({width,height:900});await p.setContent(`<style>.oa-dashboard-app input{background:rgba(5,8,13,.72)}${css}</style><main class="oa-dashboard-app"><section class="workspace-sync-panel workspace-sync-compact"><details><summary><span class="workspace-storage-desktop-label">Saved on this browser only</span><span class="workspace-storage-mobile-label">Data storage</span></summary><p>Not backed up</p></details></section><section class="workspace-sync-panel" data-storage-phase="error"><summary>Storage error</summary></section>${html(LimitsEditor)}</main>`);
 const summary=p.locator('.workspace-sync-compact summary');assert.equal(await summary.innerText(),'Saved on this browser only');assert.equal(await summary.evaluate(e=>getComputedStyle(e).color),'rgb(133, 139, 149)');assert.equal(await summary.evaluate(e=>getComputedStyle(e,'::marker').content),'""');await summary.focus();await summary.press('Enter');assert.equal(await p.locator('.workspace-sync-compact details>p').isVisible(),true);assert.notEqual(await p.locator('[data-storage-phase="error"] summary').evaluate(e=>getComputedStyle(e).color),'rgb(133, 139, 149)');assert.equal(await p.locator('.limits-value input').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
 }
 }finally{await b.close();}
});
