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
      if (owner[1]) {
        // The approved utility layout retired this toolbar; its old scoped CSS is inert.
        const retired = owner[1] === 'passport-workspace-toolbar';
        assert.ok(retired || (importSource + workspaceSource).includes(owner[1]), `No actual source subject for ${owner[1]}`);
      }
      else assert.equal(owner[2], 'coach');
    }
  });
  tree.walkDecls(decl => {
    assert.ok(!(decl.prop === 'display' && decl.value === 'none' && !decl.parent.selector.endsWith('summary::-webkit-details-marker')), `Do not conceal content: ${decl.parent.selector}`);
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


test('OA Limits uses two soft grouped plates, pill values, distinct states and preserved disclosures', () => {
  const tree=stylesheet();assertIsolation(tree);
  assert.equal(value(tree,'.oa-review-plate','background'),'var(--oa-surface)');
  assert.equal(value(tree,'.oa-review-plate','border'),'0');
  assert.equal(value(tree,'.oa-review-plate','border-radius'),'26px');
  assert.equal(value(tree,'.oa-limit-value','border-radius'),'999px');
  assert.equal(value(tree,'.oa-limit-switch[aria-checked=true]::before','background'),'#747b87');
  assert.equal(value(tree,'.oa-limit-switch::before','background'),'#383e48');
  assert.equal(value(tree,'.oa-review-page :is(button,input):disabled','cursor'),'not-allowed');
  assert.equal(value(tree,'.oa-review-page :is(button,summary,input,select):focus-visible','outline'),'2px solid #83aaff');
  assert.equal(value(tree,'.oa-limit-row','grid-template-columns','(max-width:620px)'),'minmax(0,1fr) 88px 44px');
  assert.match(workspaceSource,/never blocks orders or changes broker settings/);
  assert.match(workspaceSource,/disabled=\{locked\}/);
  assert.match(workspaceSource,/oa-limit-adjust/);assert.match(workspaceSource,/oa-advanced-limits/);
});

test('OA Insights keeps real warning evidence, quiet secondary rows and narrow-width disclosures', () => {
  const tree=stylesheet();assertIsolation(tree);
  assert.equal(value(tree,'.oa-insight-primary','padding'),'28px');
  assert.equal(value(tree,'.oa-insight-proof','background'),'var(--oa-inset)');
  assert.equal(value(tree,'.oa-review-state[data-warning=true]','color'),'#dfbc7e');
  assert.equal(value(tree,'.oa-insight-secondary>.insight-evidence>summary','grid-column','(max-width:620px)'),'2');
  assert.equal(value(tree,'.oa-insight-secondary .oa-insight-detail-content','grid-column','(max-width:620px)'),'2');
  assert.match(workspaceSource,/oa-insight-locked/);assert.match(workspaceSource,/Checked: \{line\}/);
  assert.match(workspaceSource,/Review active limits/);assert.match(workspaceSource,/insight\.evidence\.map/);
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
  assert.doesNotMatch(workspaceSource, /className="passport-workspace-toolbar"/);
  assert.match(workspaceSource, /className="passport-utility-controls"/);
  assert.match(read('src/styles/workspaceUtility.css'), /@media\(max-width:760px\)\{\.passport-utility-layout\{grid-template-columns:1fr/);
  assert.match(workspaceSource, /Shared PNGs are permanent local still images/);
  assert.match(workspaceSource, /PassportHoloCard key=\{appearance.id\}/);
  assert.match(workspaceSource, /PassportShareComposer face=\{faceRef\}/);
});
