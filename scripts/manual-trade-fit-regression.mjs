import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
const read=p=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
const approved="/* Keep mobile native controls inside their grid cells, including iOS dates. */\n@media (max-width:850px) {\n  .oa-dashboard-app .manual-trade-dialog :is(input, select) {\n    box-sizing:border-box; width:100%; min-width:0; max-width:100%;\n    height:44px; min-height:44px;\n  }\n  .oa-dashboard-app .manual-trade-dialog select { padding-block:0; }\n  .oa-dashboard-app .manual-trade-dialog input[type=\"date\"] {\n    -webkit-appearance:none; appearance:none; display:block;\n  }\n  .oa-dashboard-app .manual-trade-dialog input[type=\"date\"]::-webkit-date-and-time-value {\n    text-align:left; min-height:1em;\n  }\n}\n@media (max-width:374px) {\n  .oa-dashboard-app .manual-trade-fields { grid-template-columns:minmax(0,1fr); }\n}\n";
test('Only the mobile manual-form sizing changes; all prior CSS remains exact',()=>{
 const css=read('src/styles/deskJournal.css');assert.equal(css.split(approved).length,2);
 assert.equal(hash(css.replace(approved,'')),'feb9ea6b0cb30bddde746d5515f3649698a85f74ceabd63cb8576459538846e7');
 postcss.parse(approved).walkRules(rule=>{assert.equal(rule.parent.name,'media');assert(['(max-width:850px)','(max-width:374px)'].includes(rule.parent.params));assert(rule.selector.startsWith('.oa-dashboard-app .manual-trade-'));});
});
test('Native date semantics, ownership, validation and save logic remain exact',()=>{
 for(const[p,h]of Object.entries({'src/components/ManualTradeDialog.tsx':'b8a069d3aeace05f3f11d0a11755968f8b70daa03b43a958eef3c4ba82465b88','src/lib/manualTrades.ts':'f90a7122f63fd6d8282e45e35f92fe3d3514e4006e0005dd3ef081bbe17b557f'}))assert.equal(hash(read(p)),h,p);
});
