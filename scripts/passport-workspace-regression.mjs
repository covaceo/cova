import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const read = path => readFileSync(resolve(root, path), 'utf8');
test('desktop share dialog explicitly survives the app preflight margin reset', () => {
  assert.match(read('src/styles/passportWorkspace.css'), /@media \(min-width: 621px\)\s*\{\s*\.passport-share-dialog\s*\{\s*margin: auto;/);
});
function loader(overrides = {}) {
  const cache = new Map();
  function load(path) {
    path = resolve(root, path);
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    const localRequire = name => {
      const override = overrides[path]?.[name];
      if (override) return override;
      if (!name.startsWith('.')) return require(name);
      if (name.endsWith('.css')) return {};
      if (/\.(webp|woff2|ttf)\?inline$/.test(name)) {
        const mime = name.includes('.webp') ? 'image/webp' : name.includes('.woff2') ? 'font/woff2' : 'font/ttf';
        return { default: `data:${mime};base64,${readFileSync(resolve(dirname(path), name.replace('?inline', ''))).toString('base64')}` };
      }
      const candidate = resolve(dirname(path), name);
      return load([candidate, `${candidate}.ts`, `${candidate}.tsx`].find(existsSync));
    };
    new Function('module', 'exports', 'require', code)(module, module.exports, localRequire);
    return module.exports;
  }
  return load;
}
const load = loader();
const { analyze, sampleTrades, defaultRules } = load('src/lib/risk.ts');
const entitlements = { canEditAdvancedLimits: true, canExportPassport: true, insightLimit: 3, plan: 'pro' };
const props = (analysis = analyze(sampleTrades, defaultRules), sample = true) => ({ analysis, entitlements, isSampleReview: sample, go() {}, upgradeToPro() {} });

// Execute the actual parent and its effects without a browser; descendants use real React SSR.
// Only the hook scheduler is doubled, not the data model, material loader, card or composer.
function routeHarness(initialProps) {
  const states = [], effects = [], pending = [];
  let cursor = 0, effectCursor = 0, currentProps = initialProps;
  const hooks = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initial) { return hooks.useState(() => ({ current: initial }))[0]; },
    useMemo(fn) { return fn(); },
    useEffect(fn, deps) {
      const index = effectCursor++, previous = effects[index];
      if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        pending.push(() => { previous?.cleanup?.(); effects[index] = { deps, cleanup: fn() }; });
      }
    },
  };
  const workspace = 'src/components/WorkspaceSections.tsx';
  const local = loader({ [resolve(root, workspace)]: { react: hooks } });
  const { Passport } = local(workspace);
  return {
    load: local,
    render(next = currentProps) { currentProps = next; cursor = 0; effectCursor = 0; return Passport(currentProps); },
    async flush() { pending.splice(0).forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); },
    close() { effects.forEach(effect => effect.cleanup?.()); },
  };
}
function nodes(tree, predicate) {
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(child => nodes(child, predicate))];
}
const byType = (tree, type) => nodes(tree, node => node.type === type);
const text = tree => renderToStaticMarkup(tree);

function composerHarness(initialProps) {
  const states = [];
  let cursor = 0, renderIndex, renderKey, currentProps = initialProps;
  const hooks = { ...React,
    useRef(initial) { return { current: initial }; },
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) { states[index] = initial; if (initial === null) renderIndex = index; }
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useLayoutEffect() {},
    useEffect(_fn, deps) { renderKey = deps[0]; },
  };
  const file = 'src/components/PassportShareComposer.tsx';
  const local = loader({ [resolve(root, file)]: { react: hooks, 'react-dom': { createPortal: children => children } } });
  const { PassportShareComposer } = local(file);
  return {
    render(next = currentProps) { currentProps = next; cursor = 0; return PassportShareComposer(currentProps); },
    ready() { states[renderIndex] = { key: renderKey, tile: { blob: new Blob(['test-only prepared image']), url: 'blob:test-ready' } }; },
  };
}

test('Composer immediately withholds a ready PNG when current source or sample provenance changes', () => {
  const previousDocument = globalThis.document;
  const saved = [];
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ click() { saved.push(this.download); }, remove() {} }) };
  const base = { face: { current: null }, mode: 'flex', onModeChange() {}, rank: 'Gold', finish: 'standard', preset: 'square', onPresetChange() {},
    presets: [{ id: 'square', label: 'Square', width: 1080, height: 1080 }], modes: [['flex', 'Flex']], onClose() {}, sourceKey: 'review-A' };
  try {
    const h = composerHarness(base);
    h.render(); h.ready();
    let tree = h.render();
    assert.equal(byType(tree, 'img').length, 1);
    byType(tree, 'button').find(button => button.props.children === 'Save image').props.onClick();
    assert.match(saved[0], /^cova-passport-sample-/);
    tree = h.render({ ...base, sourceKey: 'review-B' });
    assert.equal(byType(tree, 'img').length, 0, 'A different analysis must synchronously invalidate the ready PNG before any effect');
    assert.ok(byType(tree, 'button').filter(button => ['Share', 'Copy image', 'Save image'].some(label => text(button).includes(label))).every(button => button.props.disabled));
    h.ready(); tree = h.render();
    assert.match(byType(tree, 'img')[0].props.alt, /Sample data, not account verified/);
    tree = h.render({ ...base, sourceKey: 'review-B', sample: false });
    assert.equal(byType(tree, 'img').length, 0, 'Provenance itself belongs in the image validity key');
    h.ready(); tree = h.render();
    assert.match(byType(tree, 'img')[0].props.alt, /User-supplied data, not account verified/);
    assert.doesNotMatch(text(tree), /Sample data/);
    assert.match(text(tree), /User-supplied data · Not account verified/);
    byType(tree, 'button').find(button => button.props.children === 'Save image').props.onClick();
    assert.match(saved[1], /^cova-passport-user-supplied-/);
    assert.doesNotMatch(saved[1], /sample/);
    const defaults = composerHarness({ ...base, sourceKey: undefined });
    defaults.render(); defaults.ready();
    assert.match(byType(defaults.render(), 'img')[0].props.alt, /Sample data/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});

test('Review changes withhold mismatched materials immediately and entitlement gates every composer mount', async () => {
  const original = props();
  const h = routeHarness(original);
  try {
    h.render(); await h.flush();
    let tree = h.render();
    const { PassportHoloCard } = h.load('src/components/PassportHoloCard.tsx');
    const { PassportShareComposer } = h.load('src/components/PassportShareComposer.tsx');
    byType(tree, PassportHoloCard)[0].ref.current = { dataset: { passportMode: 'flex' } };
    byType(tree, 'button').find(button => button.props['aria-haspopup'] === 'dialog').props.onClick();
    tree = h.render();
    const source = byType(tree, PassportShareComposer)[0].props.sourceKey;
    const changed = { ...original, analysis: { ...original.analysis, totalPnl: original.analysis.totalPnl + 10 }, isSampleReview: false };
    tree = h.render(changed);
    const updated = byType(tree, PassportShareComposer)[0].props;
    assert.notEqual(updated.sourceKey, source);
    assert.equal(updated.sample, false);
    assert.equal(updated.sourceKey, JSON.stringify(byType(tree, PassportHoloCard)[0].props.model));
    let upgrades = 0;
    const free = { ...changed, entitlements: { ...entitlements, canExportPassport: false, plan: 'free' }, upgradeToPro() { upgrades++; } };
    tree = h.render(free);
    assert.equal(byType(tree, PassportShareComposer).length, 0);
    byType(tree, 'button').find(button => button.props.children === 'Unlock export').props.onClick();
    assert.equal(upgrades, 1);
    assert.equal(byType(h.render(), PassportShareComposer).length, 0);
    tree = h.render(props(analyze([], []), false));
    assert.equal(byType(tree, PassportHoloCard).length, 0, 'The new rank cannot appear on the old material, even before cleanup');
    assert.equal(byType(tree, PassportShareComposer).length, 0);
    await h.flush(); tree = h.render();
    const emptyCard = byType(tree, PassportHoloCard)[0];
    assert.equal(emptyCard.props.appearance.id, 'Unranked-standard');
    assert.equal(emptyCard.props.model.heroValue, '$0');
    assert.equal(emptyCard.props.model.ruleSummary, 'Rules not checked');
  } finally { h.close(); }
});

for (const invalidation of ['rank/material', 'entitlement']) {
  test(`Open sharing fails closed after ${invalidation} invalidation and requires explicit reopening`, async () => {
    const original = props();
    const h = routeHarness(original);
    const previousDocument = globalThis.document;
    globalThis.document = { body: {} };
    try {
      h.render(); await h.flush();
      let tree = h.render(); await h.flush();
      const { PassportHoloCard } = h.load('src/components/PassportHoloCard.tsx');
      const { PassportShareComposer } = h.load('src/components/PassportShareComposer.tsx');
      const open = () => {
        const card = byType(tree, PassportHoloCard)[0];
        assert.ok(card, 'A resolved current-rank card must exist before sharing');
        card.ref.current = { dataset: { passportMode: card.props.model.mode } };
        const button = byType(tree, 'button').find(node => node.props['aria-haspopup'] === 'dialog');
        assert.equal(button.props.disabled, false);
        button.props.onClick();
      };
      open(); tree = h.render(); await h.flush();
      const composer = byType(tree, PassportShareComposer)[0];
      assert.ok(composer);
      assert.equal(composer.props.mode, 'flex', 'Exercise explicit privacy, not forced Ghost masking');
      const child = composerHarness(composer.props);
      let dialog = child.render();
      for (const label of ['Hide identity', 'Hide markets']) {
        byType(dialog, 'button').find(button => button.props['aria-label'] === label).props.onClick();
        dialog = child.render();
      }
      for (const label of ['Identity hidden', 'Markets hidden']) {
        assert.equal(byType(dialog, 'button').find(button => button.props['aria-label'] === label).props['aria-pressed'], true);
      }
      // Commit the invalid state: the parent unmounts this privacy-configured child.
      const invalid = invalidation === 'rank/material'
        ? props(analyze([], []), false)
        : { ...original, entitlements: { ...entitlements, canExportPassport: false, plan: 'free' } };
      tree = h.render(invalid);
      assert.equal(byType(tree, PassportShareComposer).length, 0, 'Invalidation must synchronously withhold the composer');
      if (invalidation === 'rank/material') assert.equal(byType(tree, PassportHoloCard).length, 0);
      await h.flush(); // Resolve the actual material promise and commit invalidation effects.
      tree = h.render(); await h.flush();
      if (invalidation === 'entitlement') {
        tree = h.render(original); await h.flush();
        tree = h.render(); await h.flush();
      }
      assert.equal(byType(tree, PassportHoloCard)[0].props.appearance.id,
        invalidation === 'rank/material' ? 'Unranked-standard' : 'Gold-standard');
      assert.equal(byType(tree, PassportShareComposer).length, 0,
        `${invalidation} recovery must not remount a composer with privacy selections reset`);
      tree = h.render(); await h.flush();
      assert.equal(byType(tree, PassportShareComposer).length, 0, 'Later renders must remain closed');
      open(); tree = h.render(); await h.flush();
      const reopened = byType(tree, PassportShareComposer)[0];
      assert.ok(reopened, 'An explicit Share click may start a fresh session');
      assert.equal(reopened.props.preset, 'square');
      assert.equal(reopened.props.sample, invalidation === 'entitlement');
      assert.equal(reopened.props.sourceKey, JSON.stringify(byType(tree, PassportHoloCard)[0].props.model));
      reopened.props.onClose(); tree = h.render(); await h.flush();
      assert.equal(byType(tree, PassportShareComposer).length, 0);
    } finally {
      h.close();
      if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    }
  });
}

test('Real review modes preserve zero, empty, negative and scoped preference data without a preview fixture', async () => {
  const previousStorage = globalThis.localStorage;
  const storage = new Map([
    ['cova-active-storage-identity-v1', 'member-a'],
    ['cova-passport-preferences-v1:member-a', JSON.stringify({ shareModeId: 'private', exportPresetId: 'story' })],
    ['cova-passport-preferences-v1:member-b', JSON.stringify({ shareModeId: 'coach', exportPresetId: 'feed' })],
  ]);
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const h = routeHarness(props());
  try {
    h.render(); await h.flush();
    let tree = h.render();
    const { PassportHoloCard } = h.load('src/components/PassportHoloCard.tsx');
    let card = byType(tree, PassportHoloCard)[0];
    assert.equal(card.props.model.mode, 'private');
    assert.doesNotMatch(text(card), /Trader 6714|NQ \/ ES|\+\$1,008/);
    assert.equal(byType(tree, 'svg').length, 0, 'Ghost cannot expose cumulative P&L in review detail');
    for (const mode of ['flex', 'discipline', 'private', 'coach']) {
      const label = { flex: 'Flex', discipline: 'Discipline', private: 'Ghost', coach: 'Coach' }[mode];
      byType(tree, 'button').find(button => button.props.children === label).props.onClick();
      tree = h.render(); await h.flush();
      assert.equal(byType(tree, PassportHoloCard)[0].props.model.mode, mode);
      assert.equal(JSON.parse(storage.get('cova-passport-preferences-v1:member-a')).shareModeId, mode);
    }
    assert.deepEqual(JSON.parse(storage.get('cova-passport-preferences-v1:member-b')), { shareModeId: 'coach', exportPresetId: 'feed' });
    assert.equal(storage.has('cova-passport-preferences-v1'), false);
    for (const analysis of [analyze([], []), analyze(sampleTrades, []), analyze([{ ...sampleTrades[0], pnl: -900 }], defaultRules)]) {
      tree = h.render(props(analysis, false)); await h.flush(); tree = h.render();
      card = byType(tree, PassportHoloCard)[0];
      assert.equal(card.props.model.sample, false);
      assert.match(card.props.model.provenance, /^User-supplied/);
      if (!analysis.ruleStatuses.length) {
        assert.equal(card.props.model.heroValue, '—', 'Coach cannot invent a checked control score');
        assert.match(text(tree), /Rules not checked/);
      }
      if (analysis.totalPnl < 0) {
        assert.equal(card.props.model.rank, 'Bronze');
        assert.match(text(tree), /Negative result/);
      }
      const receipt = nodes(tree, node => node.props.className === 'passport-ledger-table')[0];
      for (const status of analysis.ruleStatuses.slice(0, 3)) {
        assert.ok(text(receipt).includes(status.rule.name));
        assert.ok(text(receipt).includes(status.summary.replaceAll('&', '&amp;')));
      }
    }
  } finally {
    h.close();
    if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
  }
});

test('Integration retains synchronous snapshot, privacy, prepared action and lifecycle source contracts', () => {
  const workspace = read('src/components/WorkspaceSections.tsx');
  const route = workspace.slice(workspace.indexOf('export function Passport({'), workspace.indexOf('function friendlyRuleMetric'));
  assert.match(route, /const tier = getPassportTier\(analysis\)/);
  assert.match(route, /loadPassportAppearance\(tier\.rank, "standard"\)/);
  assert.doesNotMatch(route, /getPassportTierPreviewOverride|getPassportDiamondPreviewStats|sampleTrades|downloadPassportPng|selectedRank|selectedFinish/);
  assert.match(route, /next\.rank !== tier\.rank \|\| next\.finish !== "standard"/);
  assert.match(route, /return \(\) => \{ active = false; \}/);
  const composer = read('src/components/PassportShareComposer.tsx');
  assert.match(composer, /sample\?: boolean; sourceKey\?: string/);
  assert.match(composer, /sample = true, sourceKey = ''/);
  assert.ok(composer.indexOf('captureShareSnapshot(face.current') < composer.indexOf('await loadSquareMaterial(rank)'));
  assert.match(composer, /face\.current\.dataset\.passportMode !== mode/);
  assert.match(composer, /hideIdentity: hideIdentity \|\| mode === 'private', hideMarkets: hideMarkets \|\| mode === 'private'/);
  assert.match(composer, /render\?\.key === key \? render : null/);
  assert.match(composer, /if \(!tile \|\| delivering\) return/);
  assert.match(composer, /sharePreparedImage\(tile\.blob, filename\)/);
  assert.match(composer, /copyPreparedImage\(tile\.blob/);
  assert.match(composer, /if \(!active \|\| !blob\) return/);
  assert.match(composer, /URL\.revokeObjectURL\(url\)/);
  assert.match(composer, /element\.showModal\(\)/);
  assert.match(composer, /element\.close\(\)/);
  assert.match(composer, /opener\?\.isConnected/);
});

// Tracer bullet: the real route uses dashboard analysis and the approved card/share path.
test('Passport-only styling loads before the final dashboard cascade and keeps compact honest context', () => {
  const imports = [...read('src/main.tsx').matchAll(/import "([^"]+\.css)"/g)].map(match => match[1]);
  assert.ok(imports.includes('./styles/passportHolo.css'), 'The real route must load the approved horizontal card styles');
  assert.ok(imports.includes('./styles/passportWorkspace.css'), 'Passport layout styles must be imported');
  assert.ok(imports.indexOf('./styles/astraDashboard.css') > imports.indexOf('./styles/passportWorkspace.css'));
  const css = require('postcss').parse(read('src/styles/passportWorkspace.css'));
  css.walkRules(rule => {
    for (const selector of rule.selectors) assert.ok(selector.startsWith('.passport-workspace') || selector === '.passport-share-dialog', `Unscoped Passport component selector: ${selector}`);
  });
  assert.match(read('src/styles/passportWorkspace.css'), /max-width:\s*\d+px/);
  assert.match(read('src/styles/passportWorkspace.css'), /@media/);
  const { Passport } = load('src/components/WorkspaceSections.tsx');
  const html = text(React.createElement(Passport, props()));
  assert.match(html, /passport-workspace-toolbar[\s\S]*?Sample review · demo data/);
  assert.match(html, /class="passport-review-detail passport-workspace-detail"/);
});
test('Passport workspace binds one Standard engraved card to the current review and opens square sharing', async () => {
  const h = routeHarness(props());
  try {
    let tree = h.render();
    const initial = text(tree);
    assert.ok(initial.includes('class="passport-workspace"'), 'The route needs its own scoped compact workspace wrapper');
    assert.ok(initial.includes('Risk Passport'));
    assert.ok(initial.includes('Back to review'));
    assert.doesNotMatch(initial, /passport-credential-card|passport-share-rail|passport-export-list|passport-privacy-list/);
    await h.flush(); tree = h.render();
    const { PassportHoloCard } = h.load('src/components/PassportHoloCard.tsx');
    const cards = byType(tree, PassportHoloCard);
    assert.equal(cards.length, 1, 'Only one live horizontal card');
    const card = cards[0];
    assert.equal(card.props.engraved, true);
    assert.equal(card.props.appearance.id, 'Gold-standard');
    const { buildHoloPassportModel } = h.load('src/lib/passportHolo.ts');
    assert.deepEqual(card.props.model, buildHoloPassportModel(props().analysis, 'Gold', 'flex', true));
    const html = text(tree);
    assert.ok(html.indexOf('passport-holo-art') < html.indexOf('aria-label="Card view"'), 'Modes sit below the card');
    assert.match(html, /<details[^>]*>[\s\S]*Review detail/);
    assert.doesNotMatch(html, /<details[^>]*\sopen(?:=|>)/);
    for (const label of ['Flex', 'Discipline', 'Ghost', 'Coach', 'Review receipt', 'Cumulative reviewed trade result', 'Next up', 'Risk review', 'Setup context', 'Not account verified']) assert.ok(html.includes(label), label);
    assert.doesNotMatch(html, /Rank visual samples|Cosmetic finish|Market Maker|90d|180d|365d/);
    let destination;
    tree = h.render({ ...props(), go: section => { destination = section; } });
    byType(tree, 'button').find(button => button.props.children === 'Back to review').props.onClick();
    assert.equal(destination, 'dashboard');
    card.ref.current = { dataset: { passportMode: 'flex' } };
    const share = byType(tree, 'button').find(button => button.props['aria-haspopup'] === 'dialog');
    assert.ok(share && !share.props.disabled, 'The entitled ready card offers Share');
    share.props.onClick(); tree = h.render();
    const { PassportShareComposer } = h.load('src/components/PassportShareComposer.tsx');
    const composer = byType(tree, PassportShareComposer)[0];
    assert.ok(composer, 'Share must open the existing composer, not the legacy PNG path');
    assert.equal(composer.props.preset, 'square');
    assert.equal(composer.props.finish, 'standard');
    assert.equal(composer.props.sample, true);
    assert.equal(composer.props.sourceKey, JSON.stringify(card.props.model));
    assert.deepEqual(composer.props.modes.map(([id]) => id), ['flex', 'discipline', 'private', 'coach']);
    assert.deepEqual(composer.props.presets.map(preset => preset.id), ['card', 'feed', 'square', 'story']);
    assert.deepEqual(composer.props.presets.find(preset => preset.id === 'card'), { id: 'card', label: 'Card', note: 'Original horizontal card', width: 1672, height: 941 });
  } finally { h.close(); }
});
