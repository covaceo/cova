import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const parse = (file) => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const descendants = (node, predicate) => {
  const found = [];
  function visit(current) {
    if (predicate(current)) found.push(current);
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
};
const app = parse('src/App.tsx');
const appFunction = app.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'App');
const main = descendants(appFunction, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText(app) === 'main')[0];
assert.ok(main, 'exercise the actual App routing JSX, not a duplicate router');
const compiledMain = ts.transpileModule(`(${main.getText(app)})`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
// Evaluate only the actual presentation seam: auth/network/storage hooks are not replaced or executed.
const evaluateMain = new Function('scope', `with (scope) { return ${compiledMain} }`);
const privateRoutes = ['dashboard', 'import', 'oauth', 'rules', 'coach', 'passport'];
const publicRoutes = ['overview', 'features', 'pricing', 'resources', 'community', 'privacy', 'terms', 'security'];
const routeComponents = ['Dashboard', 'ImportDesk', 'OAuthConnectPage', 'RulesEngine', 'Coach', 'Passport'];
const tokens = new Map();
function token(name) {
  if (!tokens.has(name)) {
    const component = () => null;
    component.displayName = name;
    tokens.set(name, component);
  }
  return tokens.get(name);
}
function routeTree(section, signedIn) {
  const values = {
    React, section, isSignedIn: signedIn,
    isProtectedSection: (value) => privateRoutes.includes(value),
    authSession: signedIn ? { userId: 'account-a', email: 'a@example.test', plan: 'free' } : null,
    brokerStatus: { provider: 'Rithmic', status: 'imported' },
  };
  return evaluateMain(new Proxy(values, {
    has: () => true,
    get: (target, name) => name === Symbol.unscopables ? undefined : name in target ? target[name] : token(name),
  }));
}
function walk(element, ancestors = [], found = []) {
  if (!React.isValidElement(element)) return found;
  const name = typeof element.type === 'string' ? element.type : element.type.displayName || element.type.name;
  const entry = { name, element, ancestors, path: [...ancestors.map((item) => `${item.name}:${item.element.key}`), `${name}:${element.key}`].join('/') };
  found.push(entry);
  React.Children.forEach(element.props.children, (child) => walk(child, [...ancestors, entry], found));
  return found;
}

test('all private sections immediately reconcile one stable shell outside exit retention, with a fail-closed gate', () => {
  const paths = [];
  for (const [index, section] of privateRoutes.entries()) {
    const tree = walk(routeTree(section, true));
    const shells = tree.filter((node) => node.name === 'WorkspaceShell');
    assert.equal(shells.length, 1, `${section}: one shell`);
    const shell = shells[0];
    assert.ok(!shell.ancestors.some((node) => ['AnimatePresence', 'RouteFrame'].includes(node.name)), `${section}: private shell must not be retained/faded by route exit animation`);
    paths.push(shell.path);
    assert.equal(shell.element.key, null, 'route changes must not key/remount the shell');
    assert.equal(shell.element.props.section, section);
    assert.equal(tree.filter((node) => routeComponents.includes(node.name)).length, 1, 'only the latest route is rendered');
    assert.ok(tree.some((node) => node.name === routeComponents[index]));
    const locked = walk(routeTree(section, false));
    assert.equal(locked.filter((node) => node.name === 'AuthGate').length, 1, `${section}: account gate applies`);
    assert.ok(!locked.some((node) => node.name === 'WorkspaceShell' || routeComponents.includes(node.name)), `${section}: logout retains no private JSX`);
  }
  assert.equal(new Set(paths).size, 1, 'rail has the same React type/key ancestry through every section and rapid reversal');
  for (const section of ['dashboard', 'import', 'oauth', 'passport', 'rules', 'coach', 'dashboard']) {
    assert.equal(walk(routeTree(section, true)).find((node) => node.name === 'WorkspaceShell').path, paths[0]);
  }
});

test('marketing retains the original wait-mode RouteFrames', () => {
  for (const section of publicRoutes) {
    const tree = walk(routeTree(section, true));
    assert.equal(tree.find((node) => node.name === 'AnimatePresence').element.props.mode, 'wait');
    const frame = tree.find((node) => node.name === 'RouteFrame');
    assert.equal(frame.element.key, section);
    assert.ok(frame.ancestors.some((node) => node.name === 'AnimatePresence'));
    assert.ok(!tree.some((node) => node.name === 'WorkspaceShell'));
  }
});

test('every original route content prop, identity key, reset and OAuth handler is preserved exactly', () => {
  const expected = {
    Dashboard: 'key={authSession?.userId || authSession?.email} analysis={analysis} rules={rules} go={go} onSaveTradeNote={saveTradeNote} rithmicSyncAvailable={brokerStatus?.provider === "Rithmic" && brokerStatus.status === "imported"}',
    ImportDesk: 'entitlements={entitlements} importCsv={importCsv} prepareImportCsv={prepareImportCsv} openFirmOAuth={openFirmOAuth} status={status} reset={() => { const demoTrades = entitlements.plan === "free" ? sampleTrades.slice(0, entitlements.maxStoredTrades) : sampleTrades; setTrades(demoTrades); setRules(defaultRules); clearBrokerStatus(); window.dispatchEvent(new CustomEvent("cova:broker-status")); setStatus("Demo trades restored."); announce("Demo trades restored.", "success"); }} upgradeToPro={upgradeToPro}',
    OAuthConnectPage: 'firmId={oauthFirmId} onApprove={completeFirmOAuth} onCancel={cancelFirmOAuth}',
    RulesEngine: 'analysis={analysis} entitlements={entitlements} rules={rules} setRules={setRules} go={go} upgradeToPro={upgradeToPro}',
    Coach: 'analysis={analysis} entitlements={entitlements} go={go} upgradeToPro={upgradeToPro}',
    Passport: 'analysis={analysis} entitlements={entitlements} isSampleReview={isSampleReview} go={go} upgradeToPro={upgradeToPro}',
    WorkspaceShell: 'brokerLabel={brokerLabel} deleteAccount={deleteAccount} email={authSession?.email} go={go} riskScore={visibleRiskScore} section={section} signOut={signOut}',
    AuthGate: 'devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={openAuth} onDevPreview={signInAsDevPreview}',
  };
  for (const [name, attributes] of Object.entries(expected)) {
    const elements = descendants(main, (node) => (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(app) === name);
    assert.ok(elements.length, `${name}: still rendered`);
    for (const node of elements) assert.equal(node.attributes.getText(app), attributes, `${name}: exact original props`);
  }
});

function loadMotionComponent(file, reducedMotion, captures) {
  const module = { exports: {} };
  const output = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const motion = new Proxy({}, { get: (_, tag) => function MotionProbe(props) {
    captures.push({ tag, props });
    const { initial, animate, exit, transition, layoutId, children, ...dom } = props;
    return React.createElement(tag, dom, children);
  } });
  new Function('module', 'exports', 'require', output)(module, module.exports, (name) => {
    if (name === 'motion/react') return { motion, useReducedMotion: () => reducedMotion };
    if (name === '../lib/appRoutes') return { isWorkspaceNavActive: (section, id) => section === id || (section === 'oauth' && id === 'import') };
    // This test isolates shell motion; the real shared footer is exercised by vendor SSR/browser regressions.
    if (name === './PlanSections') return { SiteFooter: () => React.createElement('footer', { className: 'cova-site-footer' }) };
    if (name === '../lib/vendorCompliance') return loadMotionComponent('src/lib/vendorCompliance.ts', reducedMotion, captures);
    return require(name);
  });
  return module.exports;
}


test('section content alone enters at 8px over 200ms without opacity or exit; reduced motion is instant', () => {
  const shellSource = parse('src/components/WorkspaceShell.tsx');
  const stage = descendants(shellSource, (node) => ts.isJsxOpeningElement(node) && node.attributes.properties.some((prop) => ts.isJsxAttribute(prop) && prop.name.getText(shellSource) === 'className' && prop.initializer?.getText(shellSource) === '"workspace-content"'))[0];
  assert.ok(stage, 'preserve the existing content stage and layout classes');
  assert.equal(stage.tagName.getText(shellSource), 'motion.div', 'animate only the content stage, never the fixed rail');
  assert.equal(stage.attributes.properties.find((prop) => prop.name?.getText(shellSource) === 'key')?.initializer?.getText(shellSource), '{section}', 'latest section replaces old content immediately; route-local state still resets');
  assert.equal(descendants(shellSource, (node) => ts.isJsxOpeningElement(node) && node.tagName.getText(shellSource) === 'AnimatePresence').length, 0, 'rapid clicks must not wait for or retain old content');
  for (const reduced of [false, true]) {
    const captures = [];
    const { WorkspaceShell } = loadMotionComponent('src/components/WorkspaceShell.tsx', reduced, captures);
    for (const section of privateRoutes) {
      captures.length = 0;
      const html = renderToStaticMarkup(React.createElement(WorkspaceShell, {
        section, brokerLabel: 'User-supplied CSV', email: 'a@example.test', riskScore: 0,
        go: () => {}, signOut: () => {}, deleteAccount: () => {},
      }, React.createElement('p', { 'data-current-content': section }, section)));
      const content = captures.find(({ props }) => props.className === 'workspace-content');
      assert.ok(content, `${section}: transform-only content motion exists`);
      assert.deepEqual(content.props.initial, reduced ? false : { y: 8 });
      assert.deepEqual(content.props.animate, { y: 0 });
      assert.equal(content.props.exit, undefined, 'no outgoing private frame');
      assert.deepEqual(content.props.transition, { duration: reduced ? 0 : 0.2, ease: 'easeOut' });
      assert.equal(captures.filter(({ props }) => props.className === 'workspace-shell operator-workspace oa-dashboard-shell' || props.className === 'workspace-sidebar').length, 0, 'fixed chrome is outside all transforms');
      const highlight = captures.find(({ props }) => props.className === 'oa-workspace-nav-highlight');
      assert.equal(highlight.props.layoutId, 'oa-workspace-nav-highlight');
      assert.deepEqual(highlight.props.transition, reduced ? { duration: 0 } : { type: 'spring', stiffness: 550, damping: 40 });
      assert.equal((html.match(/aria-current="page"/g) || []).length, 1, `${section}: one current nav highlight`);
      assert.match(html, new RegExp(`data-current-content="${section}"`), 'new content is present on the first render');
      assert.equal((html.match(/class="cova-site-footer"/g) || []).length, 1, 'the shared footer slot stays in the current content stage; vendor regressions render its real contents');
      if (section === 'dashboard') assert.doesNotMatch(html, /astra-workspace-page/);
      else assert.match(html, new RegExp(`data-astra-route="${section}"`));
    }
  }
});

test('public RouteFrame stays opaque and respects reduced motion', () => {
  for (const reduced of [false, true]) {
    const captures=[];
    const {RouteFrame}=loadMotionComponent('src/components/LayoutShell.tsx',reduced,captures);
    renderToStaticMarkup(React.createElement(RouteFrame,null,'public content'));
    assert.deepEqual(captures[0].props.initial,reduced?false:{y:8});
    assert.deepEqual(captures[0].props.animate,{y:0});
    assert.equal(captures[0].props.exit,undefined);
    assert.deepEqual(captures[0].props.transition,{duration:reduced?0:.18,ease:[.16,1,.3,1]});
  }
});
