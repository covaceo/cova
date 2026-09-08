import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const cache = new Map();
function loadSource(path) {
  path = resolve(root, path);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} }; cache.set(path, module);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const localRequire = name => {
    if (!name.startsWith('.')) return require(name);
    const candidate = resolve(dirname(path), name);
    return loadSource([candidate,`${candidate}.ts`,`${candidate}.tsx`].find(existsSync));
  };
  new Function('module','exports','require',code)(module,module.exports,localRequire);
  return module.exports;
}
const root = fileURLToPath(new URL('../', import.meta.url));
const file = `${root}/src/lib/dashboardPresentation.ts`;
async function presentation() {
  assert.ok(existsSync(file), 'The production dashboard needs a data-derived equity geometry, not the prototype fixture');
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

test('Owned browser harness cleanup recognizes signal-terminated children', async () => {
  const source = readFileSync(`${root}/scripts/dashboard-oa-interaction-regression.mjs`,'utf8').match(/async function waitForExit\([\s\S]+?\n\}/)?.[0];
  assert.ok(source);
  const waitForExit = new Function('sleep', `return (${source})`)(() => Promise.resolve());
  assert.equal(await waitForExit({exitCode:null,signalCode:'SIGTERM'},0),true);
  assert.equal(await waitForExit({exitCode:0,signalCode:null},0),true);
  assert.equal(await waitForExit({exitCode:null,signalCode:null},0),false);
});

test('Astra styles load after the legacy dashboard cascade', () => {
  const main = readFileSync(`${root}/src/main.tsx`,'utf8');
  const imports = [...main.matchAll(/import \"([^\"]+\.css)\"/g)].map(match=>match[1]);
  const astra = imports.indexOf('./styles/astraDashboard.css');
  assert.ok(astra > imports.indexOf('./styles/dashboardOaDark.css'), 'Astra follows the legacy dashboard cascade');
  assert.deepEqual(imports.slice(astra + 1), ['./styles/homeStory.css', './styles/publicPassportExample.css', './styles/siteInteractionPolish.css'], 'Only scoped public/card/interaction styles follow Astra');
});

test('Financial labels preserve cents without a half-formatted dollar amount', () => {
  const { signedMoney } = loadSource('src/components/DashboardView.tsx');
  assert.equal(signedMoney(1007.5),'+$1,007.50');
  assert.equal(signedMoney(-940,true),'−$940.00');
  assert.equal(signedMoney(0),'$0');
});

test('Saving a journal note only changes that trade and rejects a stale account principal', () => {
  const path = `${root}/src/lib/dashboardTradeNotes.ts`;
  assert.ok(existsSync(path),'Dashboard journal notes need an identity-guarded real ledger update');
  const { saveDashboardTradeNote } = loadSource(path);
  const { sampleTrades } = loadSource('src/lib/risk.ts');
  const principal = {identity:'member-a',authGeneration:3,identityGeneration:2};
  const changed = saveDashboardTradeNote(sampleTrades,sampleTrades[0].id,'My actual review.',principal,principal);
  assert.equal(changed[0].notes,'My actual review.');
  assert.equal(sampleTrades[0].notes,'Waited for first pullback.');
  assert.deepEqual(changed[0],{...sampleTrades[0],notes:'My actual review.'});
  assert.equal(changed[1],sampleTrades[1]);
  assert.equal(saveDashboardTradeNote(sampleTrades,sampleTrades[0].id,'cross-account write',principal,{...principal,identity:'member-b'}),null);
  assert.equal(saveDashboardTradeNote(sampleTrades,sampleTrades[0].id,'stale auth',principal,{...principal,authGeneration:4}),null);
  assert.equal(saveDashboardTradeNote(sampleTrades,sampleTrades[0].id,'signed out',principal,null),null);
  assert.equal(saveDashboardTradeNote(sampleTrades,'missing','wrong record',principal,principal),null);
});

test('Approved dashboard composition uses real analytics, recent trades, and an actual journal note', () => {
  const { analyze, sampleTrades, defaultRules } = loadSource('src/lib/risk.ts');
  const { Dashboard } = loadSource('src/components/DashboardView.tsx');
  const analysis = analyze(sampleTrades, defaultRules);
  const html = renderToStaticMarkup(React.createElement(Dashboard, {analysis,rules:defaultRules,go:()=>{}}));
  assert.ok(html.includes('Your trading, in perspective.'), 'Use the approved Astra heading, not the previous dashboard layout');
  for (const label of ['Reported P&amp;L','Win rate','Profit factor','Max drawdown','Discipline review','Recent trades','From the journal']) assert.ok(html.includes(label),label);
  assert.equal((html.match(/data-astra-stat=/g)||[]).length,4,'One four-cell financial strip');
  assert.equal((html.match(/data-recent-trade=/g)||[]).length,4,'Latest four actual ledger records');
  assert.ok(html.includes(String(analysis.score)), 'Score must come from risk.analyze');
  assert.ok(html.includes(sampleTrades.at(-1).notes), 'Journal copy comes from the ledger, not the design study');
  assert.ok(!html.includes('Patience was')&&!html.includes('A solid baseline.'),'Do not ship invented editorial claims');
});

test('Trade-note keyboard focus wraps at both modal boundaries', () => {
  const { trapTradeDialogTab } = loadSource('src/components/DashboardTradeDialog.tsx');
  assert.equal(typeof trapTradeDialogTab,'function','The modal must keep Shift+Tab from leaving for browser chrome');
  let focused = '', prevented = 0;
  const close = {focus:()=>focused='close'}, note = {focus:()=>focused='note'}, save = {focus:()=>focused='save'};
  const base = {key:'Tab',currentTarget:{querySelectorAll:()=>[close,note,save]},preventDefault:()=>prevented++};
  trapTradeDialogTab({...base,target:close,shiftKey:true});
  assert.equal(focused,'save');
  trapTradeDialogTab({...base,target:save,shiftKey:false});
  assert.equal(focused,'close');
  assert.equal(prevented,2);
});

test('Trade detail never calls an absent risk value zero risk and preserves P&L cents', () => {
  const { sampleTrades } = loadSource('src/lib/risk.ts');
  const { DashboardTradeDialog } = loadSource('src/components/DashboardTradeDialog.tsx');
  const html = renderToStaticMarkup(React.createElement(DashboardTradeDialog,{trade:{...sampleTrades[0],risk:0,pnl:250.5},onClose:()=>{}}));
  assert.ok(html.includes('Not provided'),'Zero is the ledger sentinel for missing planned risk, not reported zero risk');
  assert.ok(html.includes('+$250.50'),'The detail view preserves the same cents as the summary and ledger');
});

test('An account without trades stays blank and older rows without notes remain reviewable', () => {
  const { analyze, sampleTrades, defaultRules } = loadSource('src/lib/risk.ts');
  const { Dashboard } = loadSource('src/components/DashboardView.tsx');
  const empty = renderToStaticMarkup(React.createElement(Dashboard,{analysis:analyze([],defaultRules),rules:defaultRules,go:()=>{}}));
  assert.ok(empty.includes('data-dashboard-empty="true"'));
  assert.ok(!empty.includes('data-astra-stat=')&&!empty.includes('astra-score-ring'));
  const html = renderToStaticMarkup(React.createElement(Dashboard,{analysis:analyze([{...sampleTrades[0],notes:undefined}],defaultRules),rules:defaultRules,go:()=>{}}));
  assert.ok(html.includes('No journal notes in this range.'));
});

test('The equity viewport follows its actual container so phone labels stay legible', async () => {
  const { buildEquityGeometry } = await presentation();
  const chart = buildEquityGeometry([{label:'Start',value:0},{label:'2026-05-06',value:500}],324);
  assert.equal(chart.width,324,'Do not scale a fixed 680px SVG down to unreadable 4px labels');
  assert.ok(chart.height<=225,'Phone chart remains a compact readable instrument');
  assert.equal(chart.points.at(-1).x,324-chart.right);
});

test('A single-trade range keeps Start before the ending session on the time axis', () => {
  const { AstraEquityCurve } = loadSource('src/components/AstraEquityCurve.tsx');
  const html = renderToStaticMarkup(React.createElement(AstraEquityCurve,{points:[{label:'Start',value:0},{label:'2026-05-06',value:500}]}));
  assert.ok(html.indexOf('>Start</text>')<html.indexOf('>May 06</text>'),'A one-trade review must not label its final point Start');
});

test('Astra equity preserves every closed-trade value, including losses and the zero origin', async () => {
  const { buildEquityGeometry } = await presentation();
  const input = [{label:'Start',value:0},{label:'2026-08-01',value:240},{label:'2026-08-01',value:60},{label:'2026-08-02',value:-200},{label:'2026-08-03',value:1640}];
  const chart = buildEquityGeometry(input);
  assert.deepEqual(chart.points.map(p=>p.value), input.map(p=>p.value));
  assert.equal(chart.points.length, input.length);
  assert.equal(chart.points[0].x,chart.left);
  assert.equal(chart.points.at(-1).x,chart.width-chart.right);
  assert.ok(chart.min<=-200 && chart.max>=1640);
  assert.ok(chart.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.y>=chart.top&&p.y<=chart.height-chart.bottom));
  assert.equal((chart.line.match(/L/g)||[]).length,input.length-1,'No point decimation or fabricated smoothing');
  assert.ok(!/NaN|Infinity/.test(chart.line+chart.area));
});
