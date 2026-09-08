// Focused, inert component proof. No app session, provider requests, or credentials.
// --capture-only records the unmodified baseline; --source runs only motion contracts.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const captureOnly = process.argv.includes('--capture-only');
const output = process.env.AUTH_CONNECTION_EVIDENCE || join(tmpdir(), 'cova-auth-connection-evidence');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const read = (name) => readFile(join(root, name), 'utf8');

if (!captureOnly) {
  for (const name of ['AuthPanels', 'OAuthConnectPage']) {
    const selected = process.argv.find(arg => arg.startsWith('--component='))?.split('=')[1];
    if (selected && selected !== name) continue;
    const text = await read(`src/components/${name}.tsx`);
    assert.ok(/useReducedMotion\(\)/.test(text), `${name}: respect OS motion preference`);
    assert.ok(/authConnectionPolish\.css/.test(text), `${name}: load scoped visual system`);
    assert.doesNotMatch(text, /blur\(\d+px\)|#18c887|#b9f5df|24,200,135/, `${name}: retire blur entrances and green identity at their owner`);
    const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let checked = 0;
    function visit(node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source).startsWith('motion.')) {
        const attrs = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map((attr) => [attr.name.getText(source), attr.initializer]));
        assert.ok(attrs.transition, `${name}: every owned motion has an explicit bounded transition`);
        for (const reduceMotion of [false, true]) {
          const value = (key) => attrs[key]?.expression && new Function('reduceMotion', `return (${attrs[key].expression.getText(source)})`)(reduceMotion);
          const transition = value('transition');
          assert.ok(transition.duration >= 0 && transition.duration <= 0.22, `${name}: <=220ms motion`);
          assert.equal(transition.delay || 0, 0, `${name}: no entrance delay`);
          if (reduceMotion) {
            assert.equal(transition.duration, 0, `${name}: instant reduced motion`);
            if (attrs.initial) assert.equal(value('initial'), false, `${name}: no hidden/translated initial state under reduced motion`);
            for (const key of ['whileHover', 'whileTap']) if (attrs[key]) assert.equal(value(key), undefined, `${name}: no reduced-motion button transform`);
          }
        }
        checked++;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(checked > 0);
    console.log(`${name}: ${checked} actual motion nodes passed normal/reduced timing contracts`);
  }
  if (process.argv.includes('--source')) process.exit(0);
}

await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'cova-auth-connection-'));
// Do not consume this machine's Vite/provider configuration. Only a deliberately
// invalid provider URL enables the production handoff presentation; never submit it.
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
process.env.VITE_ENABLE_DEMO_PREVIEW = 'false';
process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_ANON_KEY = '';
process.env.VITE_TRADOVATE_CONNECT_URL = 'https://provider.test.invalid/authorize';
const styles = [...(await read('src/main.tsx')).matchAll(/import "([^"]+)";/g)]
  .map((match) => match[1]).filter((name) => name.startsWith('@fontsource') || name.endsWith('.css'))
  .map((name) => `import ${JSON.stringify(name.startsWith('./') ? `/src/${name.slice(2)}` : name)};`).join('\n');
const fixture = `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AuthSheet, AuthGate} from '/src/components/AuthPanels.tsx';
import {OAuthConnectPage} from '/src/components/OAuthConnectPage.tsx';
${styles}
const params = new URLSearchParams(location.search);
const surface = params.get('surface');
const forbidden = () => { throw new Error('Visual fixture must not invoke auth or approve a provider'); };
function Fixture() {
  const [mode, setMode] = useState(null);
  const [cancelled, setCancelled] = useState(false);
  return <main>
    {surface === 'oauth' ? <OAuthConnectPage firmId={params.get('firm') || 'tradovate'} onCancel={() => setCancelled(true)} onApprove={forbidden}/> :
     surface === 'gate' ? <AuthGate devPreviewEmail="visual@example.test" openAuth={() => {}} onDevPreview={forbidden}/> : <>
      <button id="opener" onClick={() => setMode('login')}>Open auth fixture</button>
      <AuthSheet authIntentKey="visual-only-unused" mode={mode} setMode={setMode} close={() => setMode(null)}
        passwordRecovery={params.has('recovery')} pendingPolicyConfirmation={params.has('policy')}
        onAuthenticated={forbidden} onAuthAttemptAborted={forbidden} onAuthSessionIsCurrent={forbidden}
        onAuthAttemptStarted={forbidden} onDiscardAuthSession={forbidden} onDeleteRestrictedAccount={forbidden}
        onDevPreview={forbidden} onDisconnectProviders={forbidden} onInspectProviders={forbidden}
        onPasswordRecovered={forbidden} onPolicyAccepted={forbidden} onUpdatePassword={forbidden}/>
     </>}
    <output id="cancelled" hidden>{String(cancelled)}</output>
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
let server, chrome, client;
const records = [];
try {
  server = await createServer({ root, envDir: profile, server: { host: '127.0.0.1', port: 0 }, plugins: [{
    name: 'auth-connection-visual-fixture',
    resolveId(id) { if (id === '/__auth-polish-entry.tsx') return id; },
    load(id) { if (id === '/__auth-polish-entry.tsx') return fixture; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__auth-polish.html')) return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/__auth-polish-entry.tsx"></script></body></html>'));
      });
    },
  }] });
  await server.listen();
  const port = server.httpServer.address().port;
  assert.equal((await fetch(`http://127.0.0.1:${port}/__auth-polish.html`)).status, 200);
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  const until = async (fn, message) => {
    const start = Date.now();
    while (Date.now() - start < 20000) { const result = await fn().catch(() => false); if (result) return result; await sleep(40); }
    throw new Error(message);
  };
  const debugPort = await until(async () => Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]), 'Owned Chrome port');
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const ws = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  const warnings = [];
  ws.onmessage = ({ data }) => {
    const event = JSON.parse(String(data));
    if (event.id) {
      const call = pending.get(event.id); pending.delete(event.id);
      event.error ? call?.reject(new Error(event.error.message)) : call?.resolve(event.result);
    } else if (event.method === 'Fetch.requestPaused') {
      const url = new URL(event.params.request.url);
      const local = ['127.0.0.1', 'cova.localhost'].includes(url.hostname) && url.port === String(port) && !url.pathname.startsWith('/api/');
      if (!local) errors.push(`Blocked request: ${url.origin}${url.pathname}`);
      void send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: event.params.requestId, ...(local ? {} : { errorReason: 'BlockedByClient' }) });
    } else if (event.method === 'Runtime.exceptionThrown') {
      const detail = event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text;
      errors.push(detail); console.error(detail);
    }
    else if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') errors.push(event.params.entry.text);
    else if (event.method === 'Runtime.consoleAPICalled' && ['warning', 'error'].includes(event.params.type)) {
      const message = event.params.args.map(arg => arg.value ?? arg.description ?? '').join(' ');
      // Reproduced on the untouched baseline with React 18 + Motion's PopChild.
      if ((message.includes('`ref` is not a prop') && message.includes('PopChild')) || message.includes('You have Reduced Motion enabled')) warnings.push(message);
      else errors.push(message);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  client = { send, ws };
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = (expression) => until(() => evaluate(`Boolean(${expression})`), expression);
  await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'].map((method) => send(method)));
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__visualMotion = []; function record() {
    for (const animation of document.getAnimations()) {
      const target = animation.effect?.target;
      if (target?.closest('main')) {
        const timing = animation.effect.getTiming();
        const entry = {duration:timing.duration, delay:timing.delay, className:target.className, frames:animation.effect.getKeyframes()};
        const signature = JSON.stringify(entry); if (!window.__visualMotion.some(item => JSON.stringify(item) === signature)) window.__visualMotion.push(entry);
      }
    }
    requestAnimationFrame(record);
  } requestAnimationFrame(record);` });
  const open = async (surface, width, reduced, extra = '', production = false) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height: width === 390 ? 844 : 1000, deviceScaleFactor: 1, mobile: width === 390 });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
    await send('Page.navigate', { url: `http://${production ? 'cova.localhost' : '127.0.0.1'}:${port}/__auth-polish.html?surface=${surface}${extra}` });
    await wait("document.querySelector('main h2') || document.querySelector('#opener')");
    await evaluate('document.fonts.ready.then(() => true)');
    if (surface === 'auth') {
      await evaluate("document.querySelector('#opener').focus(); document.querySelector('#opener').click(); true");
      await wait("document.querySelector('[role=dialog]')");
    }
    await sleep(700);
  };
  const capture = async (label, surface, width, reduced) => {
    const row = await evaluate(`(() => {
      const scope = document.querySelector('[role=dialog]') || document.querySelector('main section');
      const font = selector => { const node = scope.querySelector(selector); return node ? getComputedStyle(node).fontFamily : null; };
      return {heading: font('h2'), body: font('p:not(.uppercase)'), button: font('button'), mono: font('.uppercase'),
        scope: scope.className, text: scope.textContent,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        localOverflow: scope.scrollWidth - scope.clientWidth,
        background: getComputedStyle(scope).backgroundColor,
        motion: window.__visualMotion,
        fields: [...scope.querySelectorAll('input')].map(node => ({type:node.type,required:node.required,autocomplete:node.autocomplete})),
        focusInside: scope.contains(document.activeElement),
        controlTransitions: [...scope.querySelectorAll('button, input, .terminal-tab-motion')].map(node => getComputedStyle(node).transitionDuration),
        green: [...scope.querySelectorAll('*')].filter(node => ['color','backgroundColor','backgroundImage','borderColor'].some(key => /24, 200, 135|185, 245, 223/.test(getComputedStyle(node)[key]))).map(node => node.tagName)
      };
    })()`);
    records.push({ label, width, reduced, ...row });
    await writeFile(join(output, 'rendered.json'), JSON.stringify(records, null, 2));
    const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(join(output, `${label}.png`), Buffer.from(image.data, 'base64'));
    if (captureOnly) return;
    assert.match(row.heading, /Bricolage Grotesque/, `${label}: workspace heading family`);
    assert.match(row.body, /^Inter,/, `${label}: Inter body`);
    assert.match(row.button, /^Inter,/, `${label}: Inter controls`);
    assert.match(row.mono, /DM Mono/, `${label}: metadata family`);
    assert.equal(row.overflow, 0, `${label}: viewport containment`);
    assert.equal(row.localOverflow, 0, `${label}: panel containment`);
    assert.deepEqual(row.green, [], `${label}: no retired green pixels`);
    if (reduced) assert.ok(row.controlTransitions.every(value => value.split(',').every(part => parseFloat(part) === 0)), `${label}: reduced-motion controls have no CSS transition`);
    for (const motion of row.motion) {
      if (String(motion.className).includes('cova-button')) continue; // shared component motion is not owned here
      assert.ok(Number(motion.duration) <= (reduced ? 0 : 220), `${label}: rendered motion duration ${motion.duration}`);
      assert.ok(motion.frames.every(frame => !frame.filter || frame.filter === 'none'), `${label}: no blur animation`);
    }
    if (surface === 'auth') assert.equal(row.focusInside, true, `${label}: modal focus remains inside`);
  };
  const clickText = async (text) => {
    await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === ${JSON.stringify(text)}); if (!button) throw new Error('Missing button'); button.click(); return true; })()`);
    await sleep(450);
  };
  for (const width of [1440, 390]) for (const reduced of [false, true]) {
    const suffix = `${width}-${reduced ? 'reduced' : 'normal'}`;
    await open('auth', width, reduced);
    await capture(`auth-login-${suffix}`, 'auth', width, reduced);
    assert.equal(await evaluate("document.body.style.position === 'fixed' && document.querySelector('#opener').inert"), true, 'Body lock and background inert');
    await clickText('Sign up');
    await capture(`auth-signup-${suffix}`, 'auth', width, reduced);
    assert.equal(await evaluate("document.querySelector('#auth-password').autocomplete"), 'new-password');
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog] a[target=_blank]').length"), 2, 'Preserve terms and privacy links');
    await clickText('Sign in');
    await clickText('Forgot password?');
    await wait("document.activeElement.id === 'auth-email'");
    await capture(`auth-forgot-${suffix}`, 'auth', width, reduced);
    // Real keyboard wrap and Escape exercise the unchanged isolation lifecycle.
    await evaluate("[...document.querySelectorAll('[role=dialog] button')].at(-1).focus(); true");
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    assert.equal(await evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"), true);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await wait("!document.querySelector('[role=dialog]') && document.activeElement.id === 'opener'");
    assert.equal(await evaluate("document.body.style.position === '' && !document.querySelector('#opener').inert"), true, 'Exit restores body, background and opener');
    await open('oauth', width, reduced);
    await capture(`oauth-provider-${suffix}`, 'oauth', width, reduced);
    assert.match(records.at(-1).text, /Do not enter real firm credentials/);
    assert.deepEqual(records.at(-1).fields.map(field => field.type), ['text']);
    await clickText('Sign in and continue');
    await capture(`oauth-consent-${suffix}`, 'oauth', width, reduced);
    assert.match(records.at(-1).text, /Revocation path/);
    assert.match(records.at(-1).text, /live OAuth still requires provider approval/);
    await clickText('Back to sign in');
    await clickText('Back to Cova handoff');
    await capture(`oauth-handoff-${suffix}`, 'oauth', width, reduced);
    await clickText('Continue to provider'); // Only the explicit local simulation branch.
    assert.equal(await evaluate("Boolean([...document.querySelectorAll('h3')].find(node => node.textContent === 'Tradovate'))"), true);
  }
  for (const [surface, extra, production] of [['auth', '&policy', false], ['auth', '&recovery', false], ['gate', '', false], ['oauth', '&firm=other', true], ['oauth', '', true]]) {
    await open(surface, 390, true, extra, production);
    const label = `${surface}-${extra || 'default'}-${production ? 'production-condition' : 'local'}`.replaceAll('&', '');
    await capture(label, surface, 390, true);
    if (extra === '&policy') {
      assert.equal(await evaluate("document.querySelector('input[type=checkbox]').checked"), false);
      assert.equal(await evaluate("document.querySelector('[role=dialog] button[type=submit]').disabled"), true);
      assert.match(records.at(-1).text, /Disconnect saved providers/);
      assert.match(records.at(-1).text, /Delete account/);
    }
    if (extra === '&firm=other') assert.match(records.at(-1).text, /will not simulate a provider sign-in in production/);
    if (surface === 'oauth' && production && !extra) assert.match(records.at(-1).text, /OAuth redirect ready/);
  }
  await writeFile(join(output, 'browser-diagnostics.json'), JSON.stringify({ errors, knownDevelopmentWarnings: warnings }, null, 2));
  assert.deepEqual(errors, [], 'No runtime, unexpected console, or external/API request errors');
  assert.equal(records.length, 29);
  console.log(`${captureOnly ? 'BASELINE' : 'PASS'}: ${records.length} rendered states; 1440/390; normal/reduced; focus, inert, body-lock, disclosures, local/production conditions; zero external/API requests. Evidence: ${output}`);
} finally {
  if (chrome && chrome.exitCode === null) {
    if (client) await Promise.race([client.send('Browser.close').catch(() => {}), sleep(500)]);
    for (let i = 0; i < 30 && chrome.exitCode === null; i++) await sleep(50);
    if (chrome.exitCode === null) {
      if (process.platform === 'win32') await new Promise(resolve => execFile('taskkill.exe', ['/PID', String(chrome.pid), '/T', '/F'], resolve));
      else chrome.kill('SIGTERM');
    }
    for (let i = 0; i < 60 && chrome.exitCode === null; i++) await sleep(50);
    assert.notEqual(chrome.exitCode, null, 'Owned Chrome exited');
  }
  client?.ws.close();
  await server?.close();
  assert.ok(!server?.httpServer?.listening, 'Owned Vite server stopped');
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  console.log(`TEARDOWN: owned Chrome pid ${chrome?.pid || 'not started'} exited; Vite closed; isolated profile removed`);
}
