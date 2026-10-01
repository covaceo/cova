import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import load from './helpers/load-ts.cjs';
const risk = load('src/lib/risk.ts');
const { analyze, defaultRules, parseCsvDetailed, mergeTradeLedger, hasPlannedRisk } = risk;
const csv = (values, header = 'risk') => parseCsvDetailed(`date,market,pnl,setup,${header}\n${values.map((r,i)=>`2026-09-30,ES,${i % 2 ? -50 : 100},Retest,${r}`).join('\n')}`).trades;
const summary = trades => analyze(trades, defaultRules);

test('missing CSV planned risk stays unknown across all R summaries without changing money', () => {
  const trades = parseCsvDetailed('date,market,pnl\n2026-09-30,ES,100\n2026-09-30,ES,-50').trades;
  assert.deepEqual(trades.map(t=>[t.risk,t.riskStatus]), [[0,'missing'],[0,'missing']]);
  const a = summary(trades);
  for (const value of [a.avgR,a.recentAvgR,a.firstHalfAvgR,a.secondHalfAvgR,a.avgRTrend,a.bySetup[0].avgR,a.byMarket[0].avgR,a.sessions[0].avgR,a.sessions[0].netR]) assert.equal(value,null);
  assert.equal(a.totalPnl,50); assert.equal(a.winRate,0.5); assert.equal(a.maxDrawdown,50); assert.equal(a.profitFactor,2);
  assert.equal(a.riskCount,0); assert.equal(a.missingRiskCount,2);
  const rule=a.ruleStatuses.find(s=>s.rule.metric==='minAvgR'); assert.equal(rule.evaluated,false); assert.equal(rule.breached,false);
  assert.ok(a.evidenceQuality.caveats.some(s=>s.includes('missing planned risk')));
  assert.ok(a.behaviorFlags.every(f=>!['stable-setup','r-outlier-loss','recent-expectancy'].includes(f.id)));
});

test('genuine risk preserves the known +100/-50 on 25 each result; mixed samples exclude unknowns', () => {
  const a=summary(csv(['25','25'])); assert.equal(a.avgR,1); assert.equal(a.riskCount,2); assert.equal(a.missingRiskCount,0);
  const b=summary(csv(['25',''])); assert.equal(b.avgR,4); assert.equal(b.bySetup[0].avgR,4); assert.equal(b.sessions[0].avgR,4); assert.equal(b.sessions[0].netR,4); assert.equal(b.riskCount,1);
  assert.equal(a.totalPnl,b.totalPnl); assert.equal(a.winRate,b.winRate); assert.equal(a.maxDrawdown,b.maxDrawdown);
  assert.deepEqual(JSON.parse(JSON.stringify(csv(['25','']))).map(hasPlannedRisk),[true,false]);
});

test('blank, zero, invalid, negative and R-multiple inputs never become planned-risk money', () => {
  for (const value of ['', '0', '-25','(25)','25-','NaN','Infinity','oops25','25%','2R','--']) {
    const [row]=csv([value]); assert.equal(row.risk,0,value); assert.equal(row.riskStatus,'missing',value); assert.equal(summary([row]).avgR,null,value);
  }
  for (const [value,expected] of [['25',25],['0.25',0.25],['$25.50',25.5],['"$1,250.50"',1250.5]]) { const [row]=csv([value]); assert.equal(row.risk,expected); assert.equal(row.riskStatus,'provided'); }
  for (const header of ['risk','planned risk','initial risk','max risk','R multiple base','risk amount','planned loss']) assert.equal(csv(['25'],header)[0].risk,25,header);
  assert.equal(csv(['2'],'R')[0].risk,0,'An R multiple is not the monetary risk base');
});

test('broker risk absence is excluded, explicit provider CSV risk is preserved, and resync retains member provenance', () => {
  const create = amount => parseCsvDetailed(`date,market,pnl,risk,source_provider,source_account_id,source_trade_id\n2026-09-30,ES,100,${amount},Tradovate,account-1,tradovate-pair-1`).trades[0];
  for (const value of ['', '0']) assert.equal(summary([create(value)]).avgR,null);
  assert.equal(create('25').risk,25);
  const old={...create('25'),notes:'Keep me'};
  const corrected=mergeTradeLedger([old],[{...create('0'),pnl:50}]).trades[0];
  assert.equal(corrected.risk,25); assert.equal(corrected.riskStatus,'provided'); assert.equal(corrected.notes,'Keep me'); assert.equal(summary([corrected]).avgR,2);
  const unknown={...create('0'),risk:100}; assert.equal(summary([unknown]).avgR,null,'Explicit missing provenance must survive a numeric value');
  const legacy={...old,id:'csv-legacy',risk:100}; delete legacy.riskStatus;
  const before=JSON.stringify(legacy); const a=summary([legacy]); assert.equal(a.avgR,1); assert.equal(a.legacyRiskCount,1); assert.equal(JSON.stringify(legacy),before);
});

test('manual blank/zero risk remains unavailable and positive risk is marked provided', () => {
  const {appendManualTrade}=load('src/lib/manualTrades.ts');
  const principal={identity:'owner',authGeneration:1,identityGeneration:1};
  const draft={date:'2026-09-30',market:'ES',side:'Long',contracts:'1',entry:'100',exit:'102',pnl:'100',setup:'Retest',notes:''};
  for (const value of ['', '0','25']) { const result=appendManualTrade([],{...draft,risk:value},'local',100,principal,principal,true);assert.equal(result.error,null); assert.equal(result.trades[0].riskStatus,value==='25'?'provided':'missing'); assert.equal(summary(result.trades).avgR,value==='25'?4:null); }
  for (const value of ['-25','NaN','oops']) assert.ok(appendManualTrade([],{...draft,risk:value},'local',100,principal,principal,true).error);
});

// Render the real Coach and RulesEngine function bodies with their actual imported risk functions.
const workspaceSource=readFileSync('src/components/WorkspaceSections.tsx','utf8');
const tree=ts.createSourceFile('WorkspaceSections.tsx',workspaceSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function renderWorkspace(name, analysis) {
 const declarations=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&[name,'friendlyRuleMetric'].includes(n.name?.text)).map(n=>n.getText(tree)).join('\n');
 const compiled=ts.transpileModule(declarations,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 const scope=Object.fromEntries(Object.entries({React,...React,...icons,...risk}).filter(([key])=>key!=="default" && /^[A-Za-z_$][\w$]*$/.test(key))); const exports={};new Function('exports',...Object.keys(scope),compiled)(exports,...Object.values(scope));
 return renderToStaticMarkup(React.createElement(exports[name],{analysis,rules:defaultRules,setRules(){},entitlements:{plan:'pro',insightLimit:3,canEditAdvancedLimits:true},go(){},upgradeToPro(){}}));
}
test('Coach and limits render unavailable R without falsely passing the rule or promoting an unknown setup', () => {
 const a=summary(csv(['','',''])); const html=renderWorkspace('Coach',a);
 assert.match(html,/3 of 3 rows have no planned risk/); assert.match(html,/Setup R is unavailable/); assert.doesNotMatch(html,/0\.00R average result|strongest reviewed sample/);
 const rulesHtml=renderWorkspace('RulesEngine',a); assert.match(rulesHtml,/Not evaluated: planned risk not provided/); assert.match(rulesHtml,/data-rule-id="average-r" data-rule-state="off"/);
 const known=renderWorkspace('Coach',summary(csv(['25','25','25']))); assert.match(known,/3\/3 rows with planned risk/); assert.match(known,/2\.00R average result/);
});
test('trade details and Passport visibly withhold absent planned risk, including fee-adjusted analysis', () => {
 const {DashboardTradeDialog}=load('src/components/DashboardTradeDialog.tsx');
 const [trade]=csv(['']); const html=renderToStaticMarkup(React.createElement(DashboardTradeDialog,{trade,onClose(){},journalReview:false}));
 assert.match(html,/Planned risk<\/span><strong>Not provided/); assert.doesNotMatch(html,/Provided risk/);
 const {buildHoloPassportModel}=load('src/lib/passportHolo.ts');
 assert.match(buildHoloPassportModel(summary([trade]),'Gold','coach',false).support.join(' '),/Not available average/);
 const net=summary([{...trade,pnl:trade.pnl-5}]); assert.equal(net.totalPnl,95); assert.equal(net.avgR,null);
 const [provided]=csv(['25']); assert.equal(summary([{...provided,pnl:95}]).avgR,3.8);
 const legacy={...provided,id:'csv-legacy'}; delete legacy.riskStatus; assert.match(buildHoloPassportModel(summary([legacy]),'Gold','coach',false).provenance,/Older CSV risk unverified/);
});

test('finite but overflowing R results are unavailable rather than a synthetic zero', () => {
 const [row]=csv(['25']); const a=summary([{...row,pnl:Number.MAX_VALUE,risk:Number.MIN_VALUE}]);
 assert.equal(a.avgR,null); assert.equal(a.sessions[0].avgR,null); assert.equal(a.sessions[0].netR,null); assert.equal(a.riskCount,0); assert.equal(a.sessions[0].riskCount,0); assert.equal(a.bySetup[0].riskCount,0);
});

test('Rithmic provenance cannot turn missing risk into a fallback', () => {
 for (const amount of ['', '0','25']) {
  const parsed=parseCsvDetailed(`date,market,pnl,risk,source_provider,source_account_key,source_account_id,source_currency,source_trade_id\n2026-09-30,ES,100,${amount},Rithmic,aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,A-1,USD,rithmic-1`);
  assert.equal(parsed.issues.length,0); assert.equal(summary(parsed.trades).avgR,amount==='25'?4:null);
 }
});
