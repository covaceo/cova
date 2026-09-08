import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import postcss from 'postcss';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const cssUrl = new URL('src/styles/astraWorkspaceContent.css', root);
const importSource = read('src/components/ImportDesk.tsx') + read('src/components/ImportPanels.tsx');
const workspaceSource = read('src/components/WorkspaceSections.tsx');
const approved = read('src/styles/astraDashboard.css');

function stylesheet() {
  assert.ok(existsSync(cssUrl), 'Missing scoped workspace content CSS');
  return postcss.parse(readFileSync(cssUrl, 'utf8'), { from: fileURLToPath(cssUrl) });
}
function declaration(tree, selector, prop, media = null) {
  let value;
  tree.walkRules(rule => {
    if (!postcss.list.comma(rule.selector).includes(selector)) return;
    const enclosing = rule.parent.type === 'atrule' ? rule.parent.params : null;
    if (enclosing !== media) return;
    rule.walkDecls(prop, decl => { value = decl.value; });
  });
  assert.notEqual(value, undefined, `Missing ${prop} for ${selector}${media ? ` at ${media}` : ''}`);
  return value;
}
const scope = '.astra-workspace-page ';
const value = (tree, selector, prop, media) => declaration(tree, scope + selector, prop, media);

function assertIsolation(tree) {
  tree.walkAtRules(rule => assert.equal(rule.name, 'media', `Unexpected global @${rule.name}`));
  tree.walkRules(rule => {
    for (const selector of postcss.list.comma(rule.selector)) {
      assert.ok(selector.startsWith(scope), `Unscoped rule: ${selector}`);
      assert.doesNotMatch(selector, /passport-(?:holo|share|etched|workbench|workspace-stage)|\.astra-deskbar|\.workspace-sidebar|\.section-shell-heading|\.astra-dashboard/, `Protected owner: ${selector}`);
      assert.doesNotMatch(selector, /^\.astra-workspace-page\s+(?:button|svg|\*|:is\(button)/, `Blanket descendant rule: ${selector}`);
      const owner = selector.slice(scope.length).match(/^\.([\w-]+)|^\[data-astra-route="(\w+)"\]/);
      assert.ok(owner, `Missing explicit content owner: ${selector}`);
      if (owner[1]) assert.ok((importSource + workspaceSource).includes(owner[1]), `No actual source subject for ${owner[1]}`);
      else assert.equal(owner[2], 'coach');
    }
  });
  tree.walkDecls(decl => {
    assert.ok(!(decl.prop === 'display' && decl.value === 'none'), `Do not conceal content: ${decl.parent.selector}`);
    assert.ok(!(decl.prop === 'visibility' && decl.value === 'hidden'), `Do not conceal content: ${decl.parent.selector}`);
  });
}

test('Import uses the approved panel system and keeps source/input states legible', () => {
  const tree = stylesheet();
  assertIsolation(tree);
  for (const [name, token] of Object.entries({ panel: '#0c0f15', ink: '#e8eeff', quiet: '#9198a8', blue: '#6f96ff', red: '#ff8191' })) {
    assert.ok(approved.includes(`--astra-${name}:${token}`), `Approved ${name} token changed; review the content contract`);
  }
  for (const owner of ['source-ledger-panel', 'csv-export-ledger', 'import-workflow-panel', 'import-next-ledger', 'import-raw-ledger']) {
    assert.ok(importSource.includes(owner));
    assert.equal(value(tree, `.${owner}`, 'background'), 'var(--astra-panel)');
    assert.equal(value(tree, `.${owner}`, 'border'), '1px solid #2c3340');
    assert.equal(value(tree, `.${owner}`, 'border-radius'), '7px');
    assert.equal(value(tree, `.${owner}`, 'box-shadow'), 'none');
  }
  assert.equal(value(tree, '.source-ledger-panel [data-provider-picker]', 'grid-template-columns'), 'repeat(4, minmax(0, 1fr))');
  assert.equal(value(tree, '.source-ledger-panel .provider-choice-button', 'min-height'), '76px');
  assert.equal(value(tree, '.source-ledger-panel .provider-choice-button[aria-pressed="true"]', 'border-color'), 'var(--astra-blue)');
  assert.equal(value(tree, '.source-ledger-panel [data-provider-picker]', 'grid-template-columns', '(max-width: 1050px)'), 'repeat(2, minmax(0, 1fr))');
  assert.equal(value(tree, '.source-ledger-panel [data-rithmic-connect] > .grid', 'grid-template-columns'), 'repeat(2, minmax(0, 1fr))');
  assert.equal(value(tree, '.source-ledger-panel [data-rithmic-connect] > .grid', 'grid-template-columns', '(max-width: 620px)'), 'minmax(0, 1fr)');
  assert.equal(value(tree, '.import-raw-ledger textarea', 'resize'), 'vertical');
  assert.equal(value(tree, '.import-raw-ledger textarea', 'font-family'), 'var(--astra-mono)');
  assert.equal(value(tree, '.import-workflow-panel .terminal-tab-active', 'background'), '#26324a');
  assert.equal(value(tree, '.import-source-workflow .terminal-tab-label', 'background'), '#101620');
  assert.equal(value(tree, '.import-source-workflow .terminal-tab-label', 'border-color'), 'var(--astra-line)');
  assert.equal(value(tree, '.import-workflow-panel label.liquid-glass:focus-within', 'outline'), '2px solid var(--astra-blue)');
  assert.equal(value(tree, '.source-ledger-panel input:disabled', 'cursor'), 'not-allowed');
  assert.equal(value(tree, '.import-source-workflow .cova-button:focus-visible', 'outline'), '2px solid var(--astra-blue)');
  assert.match(importSource, /type="file"/);
  assert.match(importSource, /data-broker-lifecycle/);
  assert.match(importSource, /Read-only/);
});


test('Limits retains review controls with distinct checked, focus and disabled styles', () => {
  const tree = stylesheet();
  assertIsolation(tree);
  for (const owner of ['rules-ledger-summary', 'rules-ledger-row']) {
    assert.ok(workspaceSource.includes(owner));
    assert.equal(value(tree, `.${owner}`, 'background'), 'var(--astra-panel)');
    assert.equal(value(tree, `.${owner}`, 'border'), '1px solid #2c3340');
    assert.equal(value(tree, `.${owner}`, 'border-radius'), '7px');
  }
  assert.equal(value(tree, '.rules-ledger-row button[role="switch"][aria-checked="true"]', 'background'), '#26324a');
  assert.equal(value(tree, '.rules-ledger-row button[role="switch"][aria-checked="false"]', 'background'), '#101620');
  assert.equal(value(tree, '.rules-ledger-row input[type="number"]', 'color'), 'var(--astra-ink)');
  assert.equal(value(tree, '.rules-ledger-row .cova-range::-webkit-slider-thumb', 'background'), 'var(--astra-blue)');
  assert.equal(value(tree, '.rules-ledger-row .cova-range::-moz-range-thumb', 'background'), 'var(--astra-blue)');
  assert.equal(value(tree, '.rules-ledger-row input:disabled', 'cursor'), 'not-allowed');
  assert.equal(value(tree, '.rules-ledger-row input:focus-visible', 'outline'), '2px solid var(--astra-blue)');
  assert.equal(value(tree, '.rules-ledger-grid', 'grid-template-columns', '(max-width: 1050px)'), 'minmax(0, 1fr)');
  assert.match(workspaceSource, /never blocks orders or changes broker settings/);
  assert.match(workspaceSource, /disabled=\{locked\}/);
});


test('Insights preserves readable severity, review notes and evidence at narrow widths', () => {
  const tree = stylesheet();
  assertIsolation(tree);
  assert.equal(value(tree, '.insight-briefing-row', 'background'), 'var(--astra-panel)');
  assert.equal(value(tree, '.insight-briefing-row h3', 'font'), '500 20px/1.25 var(--astra-display)');
  for (const tone of ['warn', 'pause', 'caution']) {
    assert.equal(value(tree, `.insight-briefing-row[data-tone="${tone}"] > span`, 'color'), 'var(--astra-red)');
  }
  for (const tone of ['good', 'ready']) {
    assert.equal(value(tree, `.insight-briefing-row[data-tone="${tone}"] > span`, 'color'), 'var(--astra-blue)');
  }
  assert.equal(value(tree, '.insight-briefing-row > div:last-child p', 'font-family'), 'var(--astra-mono)');
  assert.equal(value(tree, '.insight-briefing-row > p', 'grid-row', '(max-width: 620px)'), '3');
  assert.equal(value(tree, '.insight-briefing-row > div:last-child', 'grid-row', '(max-width: 620px)'), '5');
  assert.equal(value(tree, '.insight-briefing-row button:focus-visible', 'outline'), '2px solid var(--astra-blue)');
  assert.match(workspaceSource, /insight-briefing-locked/);
  assert.match(workspaceSource, /Checked: \{line\}/);
  assert.match(workspaceSource, /Review active limits/);
});


test('Passport changes only named external chrome, never the card or composer', () => {
  const tree = stylesheet();
  assertIsolation(tree);
  const allowed = new Set(['passport-workspace-toolbar', 'passport-workspace-actions', 'passport-workspace-modes', 'passport-workspace-mode-note', 'passport-workspace-file-note', 'passport-workspace-detail', 'passport-workspace-detail-body', 'passport-workspace-stats', 'passport-workspace-context', 'passport-workspace-reference', 'passport-ledger-panel', 'passport-ledger-heading', 'passport-ledger-row']);
  tree.walkRules(rule => {
    for (const selector of postcss.list.comma(rule.selector)) {
      if (!selector.includes('.passport-')) continue;
      const owner = selector.slice(scope.length).match(/^\.([\w-]+)/)?.[1];
      assert.ok(allowed.has(owner), `Passport owner could reach artifact: ${selector}`);
      assert.doesNotMatch(selector, /\b(?:svg|polyline|path|canvas|dialog)\b/, `Passport artwork selector: ${selector}`);
    }
  });
  assert.equal(value(tree, '.passport-workspace-actions > button', 'background'), '#141a24');
  assert.equal(value(tree, '.passport-workspace-actions > .passport-workspace-share', 'border-color'), 'var(--astra-blue)');
  assert.equal(value(tree, '.passport-workspace-modes > button[aria-pressed="true"]', 'background'), '#26324a');
  assert.equal(value(tree, '.passport-workspace-actions > button:disabled', 'cursor'), 'not-allowed');
  assert.equal(value(tree, '.passport-workspace-actions > button:focus-visible', 'outline'), '2px solid var(--astra-blue)');
  assert.equal(value(tree, '.passport-workspace-detail > summary:focus-visible', 'outline'), '2px solid var(--astra-blue)');
  assert.equal(value(tree, '.passport-workspace-toolbar', 'flex-direction', '(max-width: 620px)'), 'column');
  assert.match(workspaceSource, /Shared PNGs are permanent local still images/);
  assert.match(workspaceSource, /PassportHoloCard key=\{appearance.id\}/);
  assert.match(workspaceSource, /PassportShareComposer face=\{faceRef\}/);
});
