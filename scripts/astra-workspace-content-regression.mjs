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

test('Accounts uses quiet dashboard materials and preserves basic import controls', () => {
  const css=read('src/styles/approvedWorkspace.css');
  assert.match(css,/accounts-panel[^}]*background:rgba\(12,18,27,\.34\)/);
  assert.match(css,/accounts-platforms[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(importSource,/data-csv-import/);assert.match(importSource,/data-broker-lifecycle/);assert.match(importSource,/Read-only/);
  assert.doesNotMatch(importSource,/data-provider-picker|atomic nonce store/);
});


test('Limits retains review controls with distinct checked, focus and disabled styles', () => {
  const tree = stylesheet();
  assertIsolation(tree);
  for (const owner of ['rules-ledger-summary', 'rules-ledger-row']) {
    assert.ok(workspaceSource.includes(owner));
    assert.equal(value(tree, `.${owner}`, 'background'), 'var(--review-fill)');
    assert.equal(value(tree, `.${owner}`, 'border'), '1px solid var(--review-edge)');
    assert.equal(value(tree, `.${owner}`, 'border-radius'), '5px');
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
  assert.equal(value(tree, '.insight-briefing-row', 'background'), 'var(--review-fill)');
  assert.equal(value(tree, '.insight-briefing-row h3', 'font'), '600 19px/1.3 var(--astra-display)');
  for (const tone of ['warn', 'pause', 'caution']) {
    assert.equal(value(tree, `.insight-briefing-row[data-tone="${tone}"] > span`, 'color'), 'var(--astra-red)');
  }
  for (const tone of ['good', 'ready']) {
    assert.equal(value(tree, `.insight-briefing-row[data-tone="${tone}"] > span`, 'color'), 'var(--astra-blue)');
  }
  assert.equal(value(tree, '.insight-evidence p', 'margin'), '10px 0 0');
  assert.equal(value(tree, '.insight-briefing-row > p', 'grid-row', '(max-width: 620px)'), '3');
  assert.equal(value(tree, '.insight-briefing-row > div:last-child', 'grid-row', '(max-width: 620px)'), '4');
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
