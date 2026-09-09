import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

// Process-owned local production-bundle test, matching the release suite.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = process.env.COVA_VENDOR_EVIDENCE || await mkdtemp(join(tmpdir(), 'cova-vendor-evidence-'));
const profile = await mkdtemp(join(tmpdir(), 'cova-vendor-browser-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const routesSource = await readFile(join(root, 'src/lib/appRoutes.ts'), 'utf8');
const parseRoutes = name => JSON.parse(routesSource.match(new RegExp(`(?:export )?const ${name} = (\\[[^\\]]+\\])`))[1]);
const routes = parseRoutes('sections');
const protectedRoutes = parseRoutes('protectedSections');
assert.equal(routes.length, 15);
assert.equal(protectedRoutes.length, 6);
const cases = [false, true].flatMap(signedIn => routes.map(route => ({ route, signedIn })));
let server, chrome, client, origin;
const errors = [];
let caseName = '';
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url); let id = 0; const calls = new Map();
    ws.addEventListener('error', reject, { once: true });
    ws.addEventListener('open', () => resolve({
      send(method, params = {}) {
        const callId = ++id;
        ws.send(JSON.stringify({ id: callId, method, params }));
        return new Promise((resolve, reject) => { const timer = setTimeout(() => { calls.delete(callId); reject(new Error(`CDP timeout: ${method}`)); }, 15000); calls.set(callId, { resolve, reject, timer }); });
      }, close() { ws.close(); },
    }), { once: true });
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Runtime.exceptionThrown') errors.push({ case: caseName, kind: 'exception', detail: message.params.exceptionDetails.text });
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push({ case: caseName, kind: 'console', detail: message.params.args.map(arg => arg.value || arg.description).join(' ') });
      const call = calls.get(message.id); if (!call) return;
      clearTimeout(call.timer); calls.delete(message.id);
      if (message.error) call.reject(new Error(message.error.message)); else call.resolve(message.result);
    });
  });
}
async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression) {
  const start = Date.now();
  while (Date.now() - start < 15000) { if (await evaluate(`Boolean(${expression})`).catch(() => false)) return; await sleep(50); }
  throw new Error(`Timed out ${caseName}: ${expression}`);
}
async function screenshot(name) {
  const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  await writeFile(join(artifacts, name + '.png'), Buffer.from(shot.data, 'base64'));
}
try {
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'routes.jsonl'), '');
  server = await preview({ root, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const servedHtml = await fetch(origin).then(response => response.text());
  assert.equal(servedHtml, await readFile(join(root, 'dist/index.html'), 'utf8'), 'Runtime must serve this exact build');
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let port; const start = Date.now();
  while (!port && Date.now() - start < 10000) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]); } catch { await sleep(80); } }
  assert.ok(port);
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
  client = await connect(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await client.send('Page.enable'); await client.send('Runtime.enable');
  await client.send('Page.navigate', { url: origin + '/#disclosures' });
  await waitFor('document.querySelector(".cova-disclosures-page")');
  const fixture = { email: 'vendor-review@example.test', mode: 'login', source: 'local-preview', plan: 'pro', subscriptionStatus: 'preview', signedInAt: new Date().toISOString() };
  for (const [width, height] of [[1440, 1000], [1280, 720], [390, 844]]) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: width < 768 });
    for (const item of cases) {
      caseName = `${item.route}-${item.signedIn ? 'member' : 'public'}-${width}`;
      await evaluate(item.signedIn ? `localStorage.setItem('cova-auth-session-v1', ${JSON.stringify(JSON.stringify(fixture))})` : `localStorage.removeItem('cova-auth-session-v1')`);
      await client.send('Page.navigate', { url: `${origin}/?vendor-qa=${caseName}#${item.route}` });
      await waitFor(`document.readyState === 'complete' && document.querySelector('header[data-section="${item.route}"]') && document.querySelector('.cova-risk-footer, .cova-risk-disclosures')`);
      if (item.signedIn && protectedRoutes.includes(item.route)) await waitFor(`document.querySelector('[data-workspace-section="${item.route}"]')`);
      await evaluate('document.fonts.ready'); await sleep(450);
      const locked = !item.signedIn && protectedRoutes.includes(item.route);
      if (!locked) {
        // Real scrolling settles deferred sections before the changed lower surface.
        await evaluate(`(async () => { document.documentElement.style.setProperty('scroll-behavior','auto','important'); for (let y=0;y<document.documentElement.scrollHeight;y+=innerHeight) { window.scrollTo({top:y,behavior:'instant'}); await new Promise(r=>setTimeout(r,35)); } window.scrollTo({top:document.querySelector('.cova-risk-footer, .cova-risk-disclosures').getBoundingClientRect().top+scrollY-100,behavior:'instant'}); })()`);
      }
      const result = await evaluate(`(() => {
        const footer = document.querySelector('.cova-risk-footer, .cova-risk-disclosures');
        const style = getComputedStyle(footer); const rect = footer.getBoundingClientRect();
        const paras = [...footer.querySelectorAll('p')];
        const logoData = [...document.querySelectorAll('.cova-provider-logo')].map(link => { const image=link.querySelector('img'), outer=link.getBoundingClientRect(), inner=image.getBoundingClientRect(); return {src:image.getAttribute('src'),href:link.href,rel:link.rel,background:getComputedStyle(link).backgroundColor,loaded:image.complete && image.naturalWidth>0,clear:[inner.left-outer.left,outer.right-inner.right,inner.top-outer.top,outer.bottom-inner.bottom],filter:getComputedStyle(image).filter,ratio:inner.width/inner.height,naturalRatio:image.naturalWidth/image.naturalHeight}; });
        return {route:location.hash,signedIn:${item.signedIn},locked:${locked},width:innerWidth,height:innerHeight,visualWidth:visualViewport.width,overflow:document.documentElement.scrollWidth-innerWidth,footerCount:document.querySelectorAll('.cova-risk-footer, .cova-risk-disclosures').length,siteFooterCount:document.querySelectorAll('footer.cova-site-footer').length,standaloneRiskFooterCount:document.querySelectorAll('footer.cova-risk-footer').length,siteNavCount:document.querySelectorAll('.cova-site-footer nav[aria-label="Legal and support"]').length,providerHeight:document.querySelector('.cova-provider-resources')?.getBoundingClientRect().height,dockClearance:document.querySelector('.cova-closing-dock') ? document.querySelector('.cova-closing-dock').getBoundingClientRect().top-document.querySelector('.cova-provider-trademark').getBoundingClientRect().bottom : null,providerOrder:!document.querySelector('.cova-closing-section') || (document.querySelector('.pricing-showcase').compareDocumentPosition(document.querySelector('.cova-provider-resources')) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 && (document.querySelector('.cova-provider-resources').compareDocumentPosition(document.querySelector('.cova-closing-section')) & Node.DOCUMENT_POSITION_FOLLOWING) > 0,owner:footer.closest('.workspace-content')?'workspace':'public',size:style.fontSize,color:style.color,background:style.backgroundColor,opacity:style.opacity,display:style.display,rect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},disclosures:paras.map(p=>p.textContent),clipped:paras.filter(p=>p.scrollWidth>p.clientWidth+1).map(p=>p.textContent),brokenImages:[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.getAttribute('src')),logoData,providerAlignment:(() => {const p=document.querySelector('.cova-provider-resources');if(!p)return null;const box=e=>{const r=e.getBoundingClientRect();return {cx:r.left+r.width/2,top:r.top,bottom:r.bottom,width:r.width}};return {center:box(p.querySelector('.cova-provider-inner')).cx,heading:box(p.querySelector('h2')),grid:box(p.querySelector('.cova-provider-grid')),logos:[...p.querySelectorAll('.cova-provider-logo')].map(box),paid:box(p.querySelector('.cova-provider-paid')),cards:[...p.querySelectorAll('article')].map(a=>({center:box(a).cx,children:[...a.children].map(box)}))}})(),providerStatus:document.querySelector('.cova-provider-status')?.textContent ?? null,providerText:document.querySelector('.cova-provider-resources')?.textContent ?? '',paidLabels:[...document.querySelectorAll('.cova-provider-paid')].map(e=>({text:e.textContent,color:getComputedStyle(e).color,fontSize:getComputedStyle(e).fontSize,visible:e.getBoundingClientRect().height>0})),importText:document.querySelector('.import-source-workflow')?.innerText};
      })()`);
      assert.equal(result.width, width, caseName); assert.equal(Math.round(result.visualWidth), width, caseName);
      assert.equal(result.footerCount, 1, caseName); assert.equal(result.owner, item.signedIn && protectedRoutes.includes(item.route) ? 'workspace' : 'public', caseName);
      assert.equal(result.size, item.route === 'disclosures' ? '16px' : '14px', caseName);
      assert.equal(result.color, item.route === 'disclosures' ? 'rgb(196, 204, 220)' : 'rgb(174, 184, 202)', caseName);
      assert.equal(result.background, item.route === 'disclosures' ? 'rgb(13, 15, 20)' : 'rgba(0, 0, 0, 0)', caseName);
      assert.equal(result.siteFooterCount, item.route === 'disclosures' ? 0 : 1, caseName);
      assert.equal(result.standaloneRiskFooterCount, item.route === 'disclosures' ? 1 : 0, caseName);
      assert.equal(result.siteNavCount, item.route === 'disclosures' ? 0 : 1, caseName);
      assert.ok(result.providerOrder, caseName + ': prices > provider strip > closing CTA');
      if (result.dockClearance !== null) assert.ok(result.dockClearance >= 8, caseName + ': CTA tab must clear vendor text');
      if (item.route === 'overview' && width >= 1280) assert.ok(result.providerHeight < 300, caseName + ': genuinely compact homepage strip');
      assert.equal(result.opacity, '1', caseName); assert.notEqual(result.display, 'none');
      assert.ok(result.overflow <= 1, caseName); assert.deepEqual(result.clipped, [], caseName); assert.deepEqual(result.brokenImages, [], caseName);
      assert.match(result.disclosures[0], /lose all or more than the initial investment/); assert.match(result.disclosures[1], /all which can adversely affect trading results\.$/);
      assert.ok(result.rect.left >= 0 && result.rect.right <= width + 1, caseName);
      if (result.logoData.length) {
        assert.equal(result.logoData.length, 2, caseName); assert.equal(result.providerStatus, null);
        const alignment=result.providerAlignment;
        assert.ok(Math.abs(alignment.heading.cx-alignment.center)<=1, caseName+': centered heading');
        assert.ok(alignment.grid.width<=720 && Math.abs(alignment.grid.cx-alignment.center)<=1, caseName+': bounded centered provider pair');
        assert.ok(alignment.paid.top>=alignment.logos[0].bottom && Math.abs(alignment.paid.cx-alignment.logos[0].cx)<=1, caseName+': Paid link centered under NinjaTrader');
        assert.ok(alignment.cards.every(card=>card.children.every(child=>Math.abs(child.cx-card.center)<=1)), caseName+': all provider typography and actions share their logo center');
        if(width>=768 || item.route==='overview') assert.ok(Math.abs(alignment.logos[0].top-alignment.logos[1].top)<=1 && Math.abs((alignment.logos[0].cx+alignment.logos[1].cx)/2-alignment.center)<=1, caseName+': balanced left-middle and right-middle logos');
        assert.doesNotMatch(result.providerText, /not yet available|commission|does not provide a market-data feed|Explore third-party tools|Platform accounts, terms|Exchange fees/i);
        assert.deepEqual(result.paidLabels, [{text:'Paid link',color:'rgb(196, 204, 220)',fontSize:'14px',visible:true}]);
        for (const logo of result.logoData) { assert.ok(logo.loaded, caseName); assert.ok(logo.clear.every(n => n >= 18), JSON.stringify(logo)); assert.equal(logo.filter, 'none'); assert.equal(logo.background, 'rgba(0, 0, 0, 0)', 'No white logo backplates'); assert.ok(Math.abs(logo.ratio-logo.naturalRatio)<.01); }
        assert.equal(result.logoData[0].href, 'https://ninjatraderus.pxf.io/rEqk5d'); assert.equal(result.logoData[1].href, 'https://kinetick.com/NinjaTrader');
      }
      await appendFile(join(artifacts, 'routes.jsonl'), JSON.stringify(result)+'\n');
      if (!locked && ['overview','resources','disclosures','dashboard','import','passport'].includes(item.route)) {
        if (width !== 1280) await screenshot(caseName+'-footer');
        if (result.logoData.length) { await evaluate(`window.scrollTo({top:document.querySelector('.cova-provider-resources').getBoundingClientRect().top+scrollY-100,behavior:'instant'})`); await sleep(150); await screenshot(caseName+'-resources'); }
        if (item.route === 'import' || item.route === 'passport' || item.route === 'overview') { await evaluate(`window.scrollTo({top:0,behavior:'instant'})`); await sleep(150); await screenshot(caseName+'-top'); }
      }
    }
  }
  // Read the durable matrix back: missing/duplicate cases must not pass.
  const rows = (await readFile(join(artifacts,'routes.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  const keys = new Set(rows.map(row=>`${row.route}:${row.signedIn}:${row.width}`));
  assert.equal(rows.length, cases.length*3); assert.equal(keys.size, cases.length*3);
  assert.deepEqual(errors, []);
  // Real keyboard activation of the shared disclosure link.
  await evaluate(`document.querySelector('a[href="#disclosures"]').scrollIntoView({behavior:'instant'}); document.querySelector('a[href="#disclosures"]').focus()`);
  await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await waitFor(`location.hash === '#disclosures' && document.querySelector('.cova-disclosures-page h1')`);
  await writeFile(join(artifacts,'summary.json'),JSON.stringify({result:'PASS',count:rows.length,routeCount:routes.length,viewports:[[1440,1000],[1280,720],[390,844]],errors,disclosureNavigation:'keyboard Enter passed',artifacts},null,2));
  console.log(`PASS: ${rows.length} route/state/viewport cases, full footer content, minimal provider copy, transparent logos, clear space and keyboard navigation. Evidence: ${artifacts}`);
} finally {
  client?.close();
  if (chrome && chrome.exitCode === null) {
    if (process.platform === 'win32') await new Promise((resolve,reject)=>execFile('taskkill.exe',['/PID',String(chrome.pid),'/T','/F'],error=>error?reject(error):resolve()));
    else chrome.kill('SIGTERM');
    const start=Date.now(); while(chrome.exitCode===null && Date.now()-start<5000) await sleep(50);
    assert.notEqual(chrome.exitCode,null,'Owned Chrome exited');
  }
  await server?.close();
  if(origin) await assert.rejects(fetch(origin,{signal:AbortSignal.timeout(500)}),'Owned preview port closed');
  await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});
  console.log('PASS: owned test browser, preview port and temporary profile cleaned up');
}
