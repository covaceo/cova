import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

// An isolated headless Chrome only. Never attach to a user's visible browser.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const profile = await mkdtemp(join(tmpdir(), 'cova-public-polish-'));
const artifacts = process.env.COVA_PUBLIC_POLISH_ARTIFACTS || await mkdtemp(join(tmpdir(), 'cova-public-evidence-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let server, chrome, client;
const errors = [];
const results = [];
function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    let id = 0;
    ws.addEventListener('error', reject, { once: true });
    ws.addEventListener('open', () => resolve({
      send(method, params = {}) {
        const callId = ++id;
        ws.send(JSON.stringify({ id: callId, method, params }));
        return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
      },
      close() { ws.close(); },
    }), { once: true });
    ws.addEventListener('message', event => {
      const data = JSON.parse(String(event.data));
      if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails);
      if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') errors.push(data.params.args);
      if (!data.id) return;
      const handler = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) handler.reject(new Error(data.error.message));
      else handler.resolve(data.result);
    });
  });
}
async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await sleep(40);
  }
  throw new Error(`Timed out: ${expression}`);
}
const routes = [
  ['resources', '.resources-oa-page'], ['community', '.community-oa-page'],
  ['pricing', '.public-pricing-page'], ['privacy', '.public-legal-page'],
  ['terms', '.public-legal-page'], ['security', '.public-legal-page'],
];
const legalTitles = { privacy: 'Privacy Policy', terms: 'Terms of Service', security: 'Security & Data Handling' };
const legalSectionCounts = { privacy: 12, terms: 18, security: 10 };
try {
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'routes.jsonl'), '');
  server = await preview({ root, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  assert.ok((await fetch(origin)).ok);
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let port;
  const start = Date.now();
  while (!port && Date.now() - start < 10000) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]); }
    catch { await sleep(80); }
  }
  assert.ok(port, 'Owned headless Chrome must expose CDP');
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
  client = await connectCdp(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await Promise.all([client.send('Page.enable'), client.send('Runtime.enable')]);
  for (const width of [1440, 390]) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height: width === 390 ? 844 : 1000, deviceScaleFactor: 1, mobile: width === 390 });
    for (const [route, owner] of routes) {
      await client.send('Page.navigate', { url: `${origin}/?public-polish=${route}-${width}#${route}` });
      await waitFor(`document.readyState === 'complete' && document.querySelector('${owner}')`);
      if (legalTitles[route]) await waitFor(`document.querySelector('${owner} h1')?.textContent === ${JSON.stringify(legalTitles[route])}`);
      await evaluate('document.fonts.ready');
      if (route === 'resources' || route === 'community') {
        await waitFor(`getComputedStyle(document.querySelector('${owner} [class$="-oa-stage"]')).opacity === '1'`);
      }
      await sleep(300);
      const result = await evaluate(`(() => {
        const page = document.querySelector('${owner}');
        const style = el => ({ font: getComputedStyle(el).fontFamily, size: getComputedStyle(el).fontSize, color: getComputedStyle(el).color, text: el.textContent.trim() });
        return {
          route: '${route}', width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth,
          headings: [...page.querySelectorAll('h1,h2,h3')].map(style),
          paragraphs: [...page.querySelectorAll('p')].map(style),
          buttons: [...page.querySelectorAll('button')].map(el => el.textContent.trim()),
          background: getComputedStyle(page).backgroundColor,
          text: page.innerText,
          toc: [...page.querySelectorAll('.legal-toc a')].map(el => ({ href: el.getAttribute('href'), exists: !!document.getElementById(el.hash.slice(1)) })),
          meta: page.querySelector('.legal-meta') ? style(page.querySelector('.legal-meta')) : null,
          body: page.querySelector('.legal-body') ? style(page.querySelector('.legal-body')) : null,
          boundary: page.querySelector('.public-pricing-boundary') ? style(page.querySelector('.public-pricing-boundary')) : null,
          h1Count: page.querySelectorAll('h1').length,
          pricingMeta: [...page.querySelectorAll('.plan-price-note,.plan-card-badge,.plan-card-index,.plan-feature-label,.plan-recommendation-tab')].map(style),
          pricingBody: [...page.querySelectorAll('.pricing-showcase-summary,.plan-card-description,.plan-feature-row,.plan-primary-action,.plan-secondary-action')].map(style),
          headerOwnOpacity: page.querySelector('header')?.style.opacity || '',
          stageOpacity: page.querySelector('[class$="-oa-stage"]') ? getComputedStyle(page.querySelector('[class$="-oa-stage"]')).opacity : null,
          clippedText: [...page.querySelectorAll('h1,h2,h3,p')].filter(el => { const rect = el.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1; }).map(el => el.textContent.trim()),
        };
      })()`);
      assert.equal(result.overflow, 0, `${route}@${width}: horizontal page overflow`);
      assert.deepEqual(result.clippedText, [], `${route}@${width}: text overflow`);
      for (const heading of result.headings) assert.match(heading.font, /^"Bricolage Grotesque Variable"/, `${route}: ${heading.text}`);
      if (route === 'resources' || route === 'community') {
        for (const p of result.paragraphs) assert.match(p.font, /^Inter,/, `${route}: body font`);
        assert.equal(result.headerOwnOpacity, '');
        assert.equal(result.stageOpacity, '1');
      }
      if (route === 'resources') {
        assert.deepEqual(result.headings.slice(1).map(h => h.text), ['Export your trades', 'Upload and check the file', 'Review the account', 'Set your limits', 'Share your Passport']);
        assert.match(result.text, /NEEDS REVIEW[\s\S]*trades\.csv[\s\S]*2 warnings[\s\S]*Nothing imports until the member confirms the file\./);
        assert.deepEqual(result.buttons, ['Upload CSV', 'Open import paths', 'Upload CSV', 'Review account', 'Open limits', 'Open Passport', 'Open CSV import', 'View account sources', 'Open Community']);
      } else if (route === 'community') {
        assert.deepEqual(result.headings.map(h => h.text), ['Find us.', 'Instagram', 'Discord', 'X']);
        assert.doesNotMatch(result.text, /A REAL COVA COMMUNITY|REAL ROOMS|Bring the screenshot/);
        const links = await evaluate(`[...document.querySelectorAll('.community-social-link')].map(a => ({ href: a.href, target: a.target, rel: a.rel }))`);
        assert.deepEqual(links, ['https://www.instagram.com/covadesk/', 'https://discord.gg/B83Czu3pAf', 'https://x.com/covadesk'].map(href => ({ href, target: '_blank', rel: 'noopener noreferrer' })));
      } else if (route === 'pricing') {
        assert.equal(result.h1Count, 1);
        for (const item of result.pricingMeta) assert.ok(parseFloat(item.size) >= 12, `Pricing metadata too small: ${item.text}`);
        for (const item of result.pricingBody) assert.ok(parseFloat(item.size) >= 14, `Pricing readable copy too small: ${item.text}`);
        assert.match(result.boundary.font, /^Inter,/);
        assert.equal(result.boundary.text, 'Cova reviews completed trades. No signals, order execution, or payout promises.');
        assert.doesNotMatch(result.text, /Start small\n|Upgrade when it matters|No hidden trading layer/);
      } else {
        assert.equal(result.headings[0].text, legalTitles[route]);
        assert.equal(result.toc.length, legalSectionCounts[route]);
        assert.equal(result.headings.length, legalSectionCounts[route] + 1);
        assert.equal(result.background, 'rgb(8, 9, 12)');
        assert.match(result.body.font, /^Inter,/);
        assert.equal(result.body.size, '16px');
        assert.equal(result.body.color, 'rgb(195, 204, 224)');
        assert.match(result.meta.font, /^"DM Mono"/);
        assert.ok(result.toc.length > 0 && result.toc.every(link => link.exists));
        assert.match(result.text, /EFFECTIVE JULY 22, 2026/);
      }
      const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
      await writeFile(join(artifacts, `${route}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      await appendFile(join(artifacts, 'routes.jsonl'), JSON.stringify(result) + '\n');
      results.push({ route, width, overflow: result.overflow, headings: result.headings.length });
    }
  }
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const [route, owner] of routes.slice(0, 2)) {
    await client.send('Page.navigate', { url: `${origin}/#${route}` });
    await waitFor(`document.querySelector('${owner}')`);
    const state = await evaluate(`(() => { const page = document.querySelector('${owner}'); const stage = page.querySelector('[class$="-oa-stage"]'); return { opacity: getComputedStyle(stage).opacity, transform: stage.style.transform, transition: getComputedStyle(page.querySelector('button')).transitionDuration }; })()`);
    assert.equal(state.opacity, '1');
    assert.ok(!state.transform || state.transform === 'none');
    assert.match(state.transition, /^0s(?:, 0s)*$/);
  }
  assert.equal(results.length, routes.length * 2);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', cases: results, reducedMotion: ['resources', 'community'], errors, artifacts }, null, 2));
} finally {
  client?.close();
  if (chrome && chrome.exitCode === null) {
    if (process.platform === 'win32' && chrome.pid) await new Promise(resolve => execFile('taskkill.exe', ['/PID', String(chrome.pid), '/T', '/F'], () => resolve()));
    else chrome.kill('SIGTERM');
  }
  await server?.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
