import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
const read=p=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
// Reverse only the approved dialog header/scroll treatment. All original locks still apply.
const presentationSeams = {
  "src/styles/deskJournal.css": [
    [
      ".astra-trade-dialog.manual-trade-dialog { width:min(520px,calc(100vw - 28px)); max-height:calc(100dvh - 32px); overflow:auto; padding:22px; color-scheme:dark; }\n.manual-trade-heading { display:contents; }\n.manual-trade-dialog h2 { margin-right:35px; }\n.manual-trade-dialog form { display:grid; gap:14px; margin-top:18px; }\n",
      ".astra-trade-dialog.manual-trade-dialog { width:min(520px,calc(100vw - 28px)); max-height:calc(100dvh - 32px); overflow:auto; padding:22px; color-scheme:dark; }\n.manual-trade-dialog h2 { margin-right:35px; }\n.manual-trade-dialog form { display:grid; gap:14px; margin-top:18px; }\n"
    ],
    [
      "@media(max-width:600px) { .astra-trade-dialog.manual-trade-dialog { padding:18px; } .manual-trade-fields { gap:12px; } .mini-journal-footer span { max-width:65%; } }\n@media(max-width:850px), (max-height:720px) {\n  .astra-trade-dialog.manual-trade-dialog { --manual-inset:22px; padding:0 0 var(--manual-inset); }\n  .manual-trade-dialog > :is(p,form) { margin-inline:var(--manual-inset); }\n  .manual-trade-dialog .manual-trade-heading {\n    display:flex; align-items:center; justify-content:space-between; gap:8px;\n    position:sticky; top:0; z-index:1; padding:10px var(--manual-inset);\n    background:inherit; border-bottom:1px solid rgb(255 255 255 / 8%);\n  }\n  .manual-trade-heading .astra-dialog-close { order:1; position:static; flex:none; margin:0; }\n  .manual-trade-dialog .manual-trade-heading h2 { margin-right:0; }\n  .manual-trade-dialog { scroll-padding-block-start:72px; }\n}\n@media(max-width:600px) { .astra-trade-dialog.manual-trade-dialog { --manual-inset:18px; } }\n\n",
      "@media(max-width:600px) { .astra-trade-dialog.manual-trade-dialog { padding:18px; } .manual-trade-fields { gap:12px; } .mini-journal-footer span { max-width:65%; } }\n\n"
    ]
  ],
  "src/components/ManualTradeDialog.tsx": [
    [
      " <div className=\"manual-trade-heading\"><button className=\"astra-dialog-close\" type=\"button\" onClick={onClose} aria-label=\"Close Add trade\"><X aria-hidden=\"true\"/></button><h2 id=\"manual-trade-title\">Add trade</h2></div><p>Manual record · USD · never sent to your broker.</p>\n",
      " <button className=\"astra-dialog-close\" type=\"button\" onClick={onClose} aria-label=\"Close Add trade\"><X aria-hidden=\"true\"/></button><h2 id=\"manual-trade-title\">Add trade</h2><p>Manual record · USD · never sent to your broker.</p>\n"
    ]
  ]
};
function beforeStickyHeader(file, content) {
 if (file === 'src/components/ManualTradeDialog.tsx' && !content.includes('className="manual-trade-heading"') || file === 'src/styles/deskJournal.css' && !content.includes('--manual-inset:')) return content;
 for (const [candidate, prior] of presentationSeams[file] ?? []) {
  assert.equal(content.split(candidate).length, 2, `exact dialog presentation seam in ${file}`);
  content=content.replace(candidate,prior);
 }
 return content;
}

const approved="/* Keep mobile native controls inside their grid cells, including iOS dates. */\n@media (max-width:850px) {\n  .oa-dashboard-app .manual-trade-dialog :is(input, select) {\n    box-sizing:border-box; width:100%; min-width:0; max-width:100%;\n    height:44px; min-height:44px;\n  }\n  .oa-dashboard-app .manual-trade-dialog select { padding-block:0; }\n  .oa-dashboard-app .manual-trade-dialog input[type=\"date\"] {\n    -webkit-appearance:none; appearance:none; display:block;\n  }\n  .oa-dashboard-app .manual-trade-dialog input[type=\"date\"]::-webkit-date-and-time-value {\n    text-align:left; min-height:1em;\n  }\n}\n@media (max-width:374px) {\n  .oa-dashboard-app .manual-trade-fields { grid-template-columns:minmax(0,1fr); }\n}\n";
test('Only the mobile manual-form sizing changes; all prior CSS remains exact',()=>{
 const css=read('src/styles/deskJournal.css');assert.equal(css.split(approved).length,2);
 assert.equal(hash(beforeStickyHeader('src/styles/deskJournal.css',css).replace(approved,'')),'feb9ea6b0cb30bddde746d5515f3649698a85f74ceabd63cb8576459538846e7');
 postcss.parse(approved).walkRules(rule=>{assert.equal(rule.parent.name,'media');assert(['(max-width:850px)','(max-width:374px)'].includes(rule.parent.params));assert(rule.selector.startsWith('.oa-dashboard-app .manual-trade-'));});
});
test('Native date semantics, ownership, validation and save logic remain exact',()=>{
 for(const[p,h]of Object.entries({'src/components/ManualTradeDialog.tsx':'b8a069d3aeace05f3f11d0a11755968f8b70daa03b43a958eef3c4ba82465b88','src/lib/manualTrades.ts':'f90a7122f63fd6d8282e45e35f92fe3d3514e4006e0005dd3ef081bbe17b557f'}))assert.equal(hash(beforeStickyHeader(p,read(p))),h,p);
});

test('Presentation exception does not mask a changed save account',()=>{
 const p='src/components/ManualTradeDialog.tsx', source=read(p);
 const changed=source.replace('save.current(draft,account)','save.current(draft,selected)');
 assert.notEqual(changed,source);
 const trusted = hash(beforeStickyHeader(p,source));
 assert.throws(()=>assert.equal(hash(beforeStickyHeader(p,changed)),trusted),assert.AssertionError);
});
