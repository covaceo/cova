import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
const cssPath='src/styles/workspaceDashboardShell.css';
const readCss=()=>existsSync(cssPath)?readFileSync(cssPath,'utf8'):'';
const declarations=(selector)=>{const found={};postcss.parse(readCss()).walkRules(rule=>{if(rule.selector===selector)rule.walkDecls(d=>found[d.prop]=d.value);});return found;};
const route='.oa-dashboard-app .oa-dashboard-shell[data-sidebar-state]';
test('Risk Desk shares one neutral canvas instead of painting a separate outer panel',()=>{
 assert.equal(declarations('.oa-dashboard-app:has(.oa-dashboard-shell[data-sidebar-state])').background,'#0f0f0f');
 assert.equal(declarations(route).background,'#0f0f0f');
 for(const selector of [route+' .workspace-content',route+' .astra-dashboard[data-dashboard-visual="reference"]']){
  const d=declarations(selector);assert.equal(d.background,'transparent');assert.equal(d.border,'0');assert.equal(d['border-radius'],'0');assert.equal(d['box-shadow'],'none');
 }
 const entry=readFileSync('src/main.tsx','utf8');assert.ok(entry.includes('import "./styles/workspaceDashboardShell.css";'));
 assert.ok(entry.indexOf('workspaceDashboardShell.css')<entry.indexOf('workspaceSidebarMotion.css'),'Owner-approved sidebar remains the last presentation layer');
});
test('shell polish preserves sidebar, dashboard cards and current identity byte-for-byte',()=>{
 const frozen={"src/styles/workspaceSidebarMotion.css": "ce86b58438c52fa461e1f7ebc577c4071b2574f7f3a15c8701862790dc9526c6", "src/components/WorkspaceShell.tsx": "4bd5877bdb19f25f502e44f6338641f7e42e4f4cbddd9750296a99759074dd56", "src/components/DashboardView.tsx": "d1691b645f6e2925405471a4f6ea706a9337ec60e898347416f2bb02ca827d92", "src/styles/approvedDashboard.css": "7a3497aff68e23cfb7fe1daed298ad1cdb1c7cba499ddd7e4945c4fe9ae903e7", "src/styles/astraDashboard.css": "43ad6ebafdf5d6e8d49213daf01ffb9f142d7f02ef9a63e1c9cba9c947447350", "public/cova-logo-minimal-white.svg": "3cab047eb026b8c3160fdab46218c0aa82978681ec9d60ec2e0116317178cbab", "public/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png": "69c2fc7bf59abdc8f6b2eb6d5a62e15b8e0ada6cd6bfe6e360f87dbbf88accec"};
 for(const [path,hash] of Object.entries(frozen)){const bytes=path.endsWith('.png')?readFileSync(path):readFileSync(path,'utf8').replaceAll('\r\n','\n');assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,path+' is outside the authorized shell scope');}
 postcss.parse(readCss()).walkRules(rule=>{assert(!/workspace-sidebar|astra-panel|astra-stat|astra-chart|button|input|select|canvas|svg/.test(rule.selector),'No sidebar/card/control/graph restyling: '+rule.selector);assert(rule.selector.includes('.oa-dashboard-shell[data-sidebar-state]'),'Only the protected shared workspace shell is selected');});
});
test('desktop content aligns to the 12px inset without changing phone header clearance',()=>{
 const desktop={};postcss.parse(readCss()).walkAtRules('media',media=>{assert.equal(media.params,'(min-width: 851px)','Inset must remain desktop-only');media.walkRules(rule=>{desktop[rule.selector]={};rule.walkDecls(d=>desktop[rule.selector][d.prop]=d.value);});});
 const content=desktop[route+' .workspace-content']||{};assert.equal(content['padding-top'],'12px');assert.equal(content['padding-bottom'],'12px');
 assert.equal(desktop[route+' .astra-dashboard[data-dashboard-visual="reference"]']?.['min-height'],'calc(100dvh - 24px)');
});
test('all protected tabs share the approved dashboard canvas and desktop inset',()=>{
 const shared='.oa-dashboard-app .oa-dashboard-shell[data-sidebar-state]';
 assert.equal(declarations('.oa-dashboard-app:has(.oa-dashboard-shell[data-sidebar-state])').background,'#0f0f0f','App canvas must not revert when changing tabs');
 assert.equal(declarations(shared).background,'#0f0f0f');
 const page=declarations(shared+' .astra-workspace-page');assert.equal(page.background,'transparent');assert.equal(page.border,'0');assert.equal(page['border-radius'],'0');assert.equal(page['box-shadow'],'none');
 const desktop={};postcss.parse(readCss()).walkAtRules('media',media=>media.walkRules(rule=>{desktop[rule.selector]={};rule.walkDecls(d=>desktop[rule.selector][d.prop]=d.value);}));
 assert.equal(desktop[shared+' .workspace-content']?.['padding-top'],'12px');
 assert.equal(desktop[shared+' .astra-workspace-page']?.['min-height'],'calc(100dvh - 24px)');
 for(const label of ['rules','coach','passport','import'])assert.ok(readFileSync('src/components/WorkspaceShell.tsx','utf8').includes(label),'The real named route remains supported');
});
