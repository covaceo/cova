import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const evidenceDir = process.env.WORKSPACE_EVIDENCE || join(root, "node_modules/.cache/journal-accuracy");
await mkdir(evidenceDir, { recursive: true });
const profileDir = await mkdtemp(join(evidenceDir, "chrome-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let preview;
let previewOutput = "";
let origin = "";
let chrome;
let cdp;
let chromeStderr = "";
const consoleErrors = [];
const runtimeErrors = [];
const networkErrors = [];

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForHttp(url, timeoutMs = 20_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.text();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    if (preview && preview.exitCode !== null) throw new Error(`Owned preview exited (${preview.exitCode}).\n${previewOutput}`);
    await sleep(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function startPreview() {
  if (origin) return;
  const port = await reservePort();
  origin = `http://127.0.0.1:${port}`;
  preview = spawn(process.execPath, [
    join(root, "node_modules", "vite", "bin", "vite.js"),
    "preview",
    "--host", "127.0.0.1",
    "--port", String(port),
    "--strictPort",
  ], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });
  for (let i=0; !previewOutput.replace(/\x1b\[[0-9;]*m/g, '').includes(origin) && i<200; i++) { if (preview.exitCode !== null) throw new Error(previewOutput); await sleep(50); }
  assert.ok(previewOutput.replace(/\x1b\[[0-9;]*m/g, '').includes(origin), "Strict-port owned listener is ready");
  const servedHtml = await waitForHttp(`${origin}/`);
  const builtHtml = await readFile(join(root, "dist", "index.html"), "utf8");
  const assets = (html) => [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(assets(servedHtml), assets(builtHtml), "Owned strict-port preview must serve the current dist asset graph");
}

async function waitForExit(child, timeoutMs = 5_000) {
  const exited = () => !child || child.exitCode !== null || child.signalCode != null;
  if (exited()) return true;
  const started = Date.now();
  while (!exited() && Date.now() - started < timeoutMs) await sleep(50);
  return exited();
}

async function terminateOwnedProcess(child) {
  if (await waitForExit(child, 0)) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, 2_000)) return;
  if (process.platform === "win32" && child.pid) {
    await new Promise((resolve, reject) => execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], async (error) => {
      if (!error || await waitForExit(child, 1_000)) resolve();
      else reject(error);
    }));
  }
  if (!await waitForExit(child)) throw new Error(`Owned process ${child.pid} did not exit`);
}

async function waitForDevToolsPort(timeoutMs = 10_000) {
  const path = join(profileDir, "DevToolsActivePort");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited before CDP was ready (${chrome.exitCode}).\n${chromeStderr}`);
    try {
      const [line] = (await readFile(path, "utf8")).split(/\r?\n/);
      const port = Number(line);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {}
    await sleep(75);
  }
  throw new Error("Chrome did not publish DevToolsActivePort");
}

async function waitForJson(url, timeoutMs = 10_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function connectCdp(wsUrl) {
  return new Promise((resolveConnect, rejectConnect) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = new Map();
    ws.addEventListener("open", () => resolveConnect({
      send(method, params = {}) {
        const callId = ++id;
        ws.send(JSON.stringify({ id: callId, method, params }));
        return new Promise((resolve, reject) => { const timeout = setTimeout(() => { pending.delete(callId); reject(new Error(`CDP timeout: ${method}`)); }, 10000); pending.set(callId, {method, resolve: value => {clearTimeout(timeout); resolve(value);}, reject: error => {clearTimeout(timeout); reject(error);}}); });
      },
      on(method, listener) {
        const bucket = listeners.get(method) || [];
        bucket.push(listener);
        listeners.set(method, bucket);
      },
      close() { ws.close(); },
    }), { once: true });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) {
        for (const listener of listeners.get(message.method) || []) listener(message.params || {});
        return;
      }
      const callback = pending.get(message.id);
      if (!callback) return;
      pending.delete(message.id);
      if (message.error) callback.reject(new Error(`${callback.method}: ${message.error.message}`));
      else callback.resolve(message.result || {});
    });
    ws.addEventListener("error", rejectConnect, { once: true });
  });
}

async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime exception");
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await sleep(75);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function setViewport(width, height, mobile = false) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
  await cdp.send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
}

async function openDashboard(width, height, mobile = false) {
  await setViewport(width, height, mobile);
  const session = {
    email: "preview@cova.local",
    mode: "login",
    plan: "pro",
    signedInAt: new Date().toISOString(),
    source: "local-preview",
    subscriptionStatus: "preview",
  };
  const target = `${origin}/?oaDashboard=${width}x${height}-${Date.now()}#dashboard`;
  const seed = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `if (location.origin === ${JSON.stringify(origin)}) { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('cova-auth-session-v1', ${JSON.stringify(JSON.stringify(session))}); }` });
  const before = await evaluate('performance.timeOrigin');
  await cdp.send('Page.navigate', { url: target });
  await waitFor(`location.href === ${JSON.stringify(target)} && performance.timeOrigin !== ${before} && document.querySelector('.dashboard-workspace') && document.querySelector('.workspace-shell[data-workspace-section="dashboard"]')`, 30_000);
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seed.identifier });
  try { await waitFor("document.fonts.status === 'loaded'", 30_000); }
  catch (error) { console.log('FONT_DIAGNOSTIC', await evaluate("JSON.stringify({status:document.fonts.status,fonts:[...document.fonts].filter(f=>f.status==='loading').map(f=>({family:f.family,status:f.status})),resources:performance.getEntriesByType('resource').filter(r=>/woff/.test(r.name)).map(r=>({name:r.name,duration:r.duration})),bodyFont:getComputedStyle(document.body).fontFamily})")); throw error; }
  await sleep(700);
}

async function press(key, code = key, modifiers = 0) {
  if (key === "Backspace") {
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, modifiers, windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers, windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
    await sleep(100);
    return;
  }
  if (key === "Enter") {
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, modifiers, windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await cdp.send("Input.dispatchKeyEvent", { type: "char", key, code, text: "\r", unmodifiedText: "\r", modifiers, windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers, windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await sleep(100);
    return;
  }
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, modifiers, windowsVirtualKeyCode: key === "Escape" ? 27 : undefined });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers, windowsVirtualKeyCode: key === "Escape" ? 27 : undefined });
  await sleep(100);
}

async function clickSelector(selector, text) {
  const point = await evaluate(`(() => {
    const candidates = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return node.checkVisibility() && !node.closest('details:not([open]) > :not(summary)') && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const node = ${text === undefined ? "candidates[0]" : `candidates.find((candidate) => candidate.textContent.trim() === ${JSON.stringify(text)})`};
    if (!node) return null;
    node.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    if (!node.contains(document.elementFromPoint(x, y))) throw new Error('Control is obscured: ' + node.textContent.trim());
    return { x, y };
  })()`);
  assert.ok(point, `Expected visible ${selector}${text === undefined ? "" : ` with text ${text}`}`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await sleep(120);
}

async function goBack(expectedHash) {
  await evaluate("history.back(); true");
  await waitFor(`location.hash === ${JSON.stringify(expectedHash)}`);
  await waitFor("document.querySelector('.dashboard-workspace')", 20_000);
}

async function goForward(expectedHash) {
  await evaluate("history.forward(); true");
  await waitFor(`location.hash === ${JSON.stringify(expectedHash)}`);
}

async function capture(path) {
  if (!path) return;
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await writeFile(path, Buffer.from(shot.data, "base64"));
}


// Synthetic fixture and an isolated profile; no real authentication or provider traffic.
const { tradeFixture } = await import('./fixtures/journal-synthetic.mjs');
try {
  await startPreview(); console.log("Owned preview ready", origin);
  chrome = spawn(chromePath, ['--headless=new','--hide-scrollbars','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profileDir}`,'about:blank'], {stdio:['ignore','pipe','pipe']});
  chrome.stderr.on('data', chunk => {chromeStderr += chunk.toString();});
  const port = await waitForDevToolsPort();
  const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
  cdp = await connectCdp(targets.find(t=>t.type==='page').webSocketDebuggerUrl); console.log('CDP connected');
  cdp.on('Runtime.consoleAPICalled', e => {if(e.type==='error') consoleErrors.push(e.args.map(a=>a.value||a.description).join(' '));});
  cdp.on('Runtime.exceptionThrown', e => runtimeErrors.push(e.exceptionDetails.text));
  cdp.on('Fetch.requestPaused', e => {
    const url = new URL(e.request.url);
    if (url.origin !== origin || url.pathname.startsWith('/api/')) {
      // Local synthetic capability response only; never contact a provider or external host.
      void cdp.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(JSON.stringify({available:false,connected:false})).toString('base64')});
    } else void cdp.send('Fetch.continueRequest',{requestId:e.requestId});
  });
  await Promise.all([cdp.send('Page.enable'),cdp.send('Runtime.enable'),cdp.send('Network.enable'),cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]})]);
  for (const [width,height,mobile] of [[1440,1000,false],[1280,720,false],[850,900,true],[851,900,false],[390,844,true],[360,800,true]]) {
    console.log('Opening dashboard',width); await openDashboard(width,height,mobile); console.log('Dashboard mounted',width);
    const key = await evaluate("'cova-react-risk-os-v2:' + localStorage.getItem('cova-active-storage-identity-v1')");
    const rows = [tradeFixture(),tradeFixture({id:'row-b',pnl:-129,date:'2026-09-02'})];
    const rules = [{id:'size',name:'Max contracts',metric:'maxContracts',limit:3,enabled:true,severity:'warning'}];
    await evaluate(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify({trades:rows,rules}))}); localStorage.setItem('cova-dashboard-range-v1','all')`);
    await cdp.send('Page.navigate',{url:`${origin}/?journalReview=1&journal=${width}#dashboard`});
    await waitFor("document.querySelector('[data-journal-accuracy]') && document.querySelector('.astra-source-label')?.textContent.includes('2 matched rows')");
    await evaluate('document.fonts.ready');
    assert.equal(await evaluate("document.querySelector('[data-astra-stat=\"biggest-loss\"] .astra-stat-value').textContent"),'Unavailable');
    assert.equal(await evaluate("document.querySelector('[data-discipline-status]').textContent"),'insufficient evidence');
    await capture(join(evidenceDir,`dashboard-${width}.png`));
    await clickSelector('.dashboard-range-controls button','Latest session');
    await waitFor("document.querySelector('.astra-source-label')?.textContent.includes('1 matched rows')");
    await clickSelector('.dashboard-range-controls button','All trades');
    await waitFor("document.querySelector('.astra-source-label')?.textContent.includes('2 matched rows')");
    await clickSelector('.astra-trade-link');
    await waitFor("document.querySelector('dialog[open]')");
    assert.match(await evaluate("document.querySelector('dialog[open]').textContent"), /matched fill row/);
    await clickSelector('.astra-dialog-close');
    await clickSelector('.astra-recent-trades .astra-text-link','View all');
    await waitFor("document.querySelector('[aria-label=\"Saved trade history\"] [data-journal-accuracy]')");
    assert.equal(await evaluate("document.querySelectorAll('[data-history-trade]').length"),2);
    await evaluate("document.querySelector('[aria-label=\"Saved trade history\"]').scrollIntoView({behavior:'instant'}); window.scrollBy({top:-100,behavior:'instant'})");
    await capture(join(evidenceDir,`history-${width}.png`));
    const geometry=await evaluate('({width:innerWidth,client:document.documentElement.clientWidth,visual:visualViewport.width,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,broken:[...document.images].filter(i=>i.complete&&!i.naturalWidth).length})');
    assert.equal(geometry.width,width); assert.ok(geometry.overflow<=1,JSON.stringify(geometry)); assert.equal(geometry.broken,0);
    const stored=await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).trades`);
    assert.deepEqual(stored,rows,'Read-only review never mutates ledger');
    const source={provider:'Tradovate',accountId:'100',openedAt:'2026-09-10T14:00:00.000Z',closedAt:'2026-09-10T14:05:00.000Z',timeZone:'UTC',pnlBasis:'gross_before_fees'};
    const partials=[tradeFixture({id:'tradovate-100:1001:2001',side:'Long',date:'2026-09-10',source,pnl:100,notes:'First exit note'}),tradeFixture({id:'tradovate-100:1001:2002',side:'Long',date:'2026-09-10',source,pnl:-150,notes:'Second exit note'}),tradeFixture({id:'tradovate-100:1002:2003',side:'Long',date:'2026-09-10',source,pnl:20})];
    await evaluate(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify({trades:partials,rules}))})`);
    const before=await evaluate('performance.timeOrigin');
    await cdp.send('Page.navigate',{url:`${origin}/?partialExits=${width}#dashboard`});
    await waitFor(`performance.timeOrigin !== ${before} && document.querySelector('[data-metric="pnl"] .astra-stat-detail')?.textContent.includes('2 trade entries')`);
    assert.equal(await evaluate('document.querySelector("[data-astra-stat=win-rate] .astra-stat-value").textContent'),'50.00%');
    assert.equal(await evaluate('document.querySelector("[data-dashboard-trade-count]").getAttribute("data-dashboard-trade-count")'),'2');
    await capture(join(evidenceDir,`partial-dashboard-${width}.png`));
    await clickSelector('.astra-recent-trades .astra-text-link','View all');
    await waitFor('document.querySelectorAll("[data-history-trade]").length === 2');
    await clickSelector('[data-history-trade] summary','2 partial exits');
    assert.equal(await evaluate('[...document.querySelectorAll("[data-partial-exit]")].filter(n=>n.checkVisibility()).length'),2);
    assert.match(await evaluate('document.querySelector("[data-history-trade] details[open]").textContent'),/First exit note[\s\S]*Second exit note/);
    await capture(join(evidenceDir,`partial-history-${width}.png`));
    assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).trades`),partials);
    const partialOverflow=await evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth');
    assert.ok(partialOverflow<=1);
    console.log('PARTIALS PASS',JSON.stringify({width,groupedTrades:2,rawRows:3,expandableExits:2,ledgerUnchanged:true,overflow:partialOverflow}));
    await clickSelector('[aria-label="Close trade history"]');
    const longRows=Array.from({length:53},(_,i)=>tradeFixture({id:'history-pagination-'+i,notes:'Saved note '+i,date:'2026-09-10'}));
    await evaluate(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify({trades:longRows,rules}))})`);
    const paginationDocument=await evaluate('performance.timeOrigin');
    await cdp.send('Page.navigate',{url:`${origin}/?historyPagination=${width}#dashboard`});
    await waitFor(`performance.timeOrigin !== ${paginationDocument} && document.querySelector('.astra-trade-link')`);
    await clickSelector('.dashboard-range-controls button','Latest session');
    await clickSelector('.astra-recent-trades .astra-text-link','View all');
    await waitFor(`document.querySelector('[data-full-trade-history][open]') && document.querySelectorAll('[data-history-trade]').length===50`);
    assert.match(await evaluate(`document.querySelector('.astra-history-header').innerText`),/53 trade entries.*All dates/s);
    assert.equal(await evaluate(`document.querySelector('.astra-history-pagination button').disabled`),true);
    await clickSelector('.astra-history-pagination button','Next');
    await waitFor(`document.querySelectorAll('[data-history-trade]').length===3`);
    assert.match(await evaluate(`document.querySelector('.astra-history-table').innerText`),/Saved note 0/,'Oldest stored note remains reachable');
    assert.equal(await evaluate(`document.querySelector('.astra-history-pagination button:last-child').disabled`),true);
    await clickSelector('.astra-history-pagination button','Previous');
    await waitFor(`document.querySelectorAll('[data-history-trade]').length===50`);
    await evaluate(`document.querySelector('[aria-label="Close trade history"]').focus()`);
    await press('Tab','Tab',8);
    assert.equal(await evaluate(`document.activeElement.textContent`),'Next','Shift-Tab wraps within the modal');
    await press('Tab','Tab');
    assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'Close trade history');
    await press('Escape','Escape');
    await waitFor(`!document.querySelector('[data-full-trade-history][open]')`);
    assert.equal(await evaluate('location.hash'),'#dashboard','Full history never enters the linking route');
    assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).trades`),longRows,'Pagination never rewrites saved rows');
    const referenceStyle=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.astra-dashboard'));return {background:s.backgroundColor,font:s.getPropertyValue('--astra-display').trim()};})()`);
    for(const route of ['rules','coach','passport','import']) {
      await evaluate(`location.hash=${JSON.stringify(route)}`);
      await waitFor(`document.querySelector('[data-astra-route="${route}"] :is(.section-shell-title-workspace,.oa-review-header h1)') && document.fonts.status==='loaded'`);
      await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
      const routeStyle=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.astra-workspace-page'));return {background:s.backgroundColor,font:s.getPropertyValue('--astra-display').trim()};})()`);
      assert.deepEqual(routeStyle,referenceStyle,route+' must share the approved Risk Desk material and typography');
      assert.equal(await evaluate(`document.querySelectorAll('.workspace-sidebar-link').length`),4);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,route+' root overflow');
      assert.equal(await evaluate(`(()=>{const n=document.querySelector('.workspace-top-header'),b=document.querySelector('.oa-review-header [data-account-switcher]')||document.querySelector('.astra-deskbar .astra-button');return !n || !n.checkVisibility() || b.getBoundingClientRect().top>=n.getBoundingClientRect().bottom;})()`),true,route+' top actions clear mobile navigation');
      assert.equal(await evaluate(`[...document.images].filter(i=>i.complete&&!i.naturalWidth).length`),0,route+' assets');
      if(route==='coach') {
        assert.ok(await evaluate(`document.querySelectorAll('.insight-evidence').length>0`),'Evidence must be available on demand');
        assert.equal(await evaluate(`document.querySelector('.insight-evidence').open`),false,'Evidence collapsed initially');
        await clickSelector('.insight-evidence summary');
        assert.ok(await evaluate(`document.querySelector('.insight-evidence p').checkVisibility()`),'Evidence reads when opened');
        await clickSelector('.insight-evidence summary');
      }
      if(route==='import') {
        assert.equal(await evaluate(`document.querySelector('.section-shell-title-workspace').textContent`),'Accounts');
        assert.equal(await evaluate(`document.querySelector('[aria-label="Saved trade history"]')`),null,'No ledger on connection page');
        assert.ok(await evaluate(`document.querySelector('input[type="file"]') !== null`),'CSV upload preserved');
      }
      await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
      await waitFor('scrollY===0');
      await capture(join(evidenceDir,`${route}-${width}.png`));
      console.log('WORKSPACE PASS',JSON.stringify({route,width,style:routeStyle,overflow:false}));
    }
    console.log('PASS',JSON.stringify({width,height,mobile,geometry,ranges:true,noteDialog:true,history:true,ledgerUnchanged:true}));
  }
  assert.deepEqual(consoleErrors,[]); assert.deepEqual(runtimeErrors,[]);
  console.log('journal-browser: desktop/mobile passed, zero console/runtime errors; provider traffic intercepted');
} finally {
  if(cdp) await Promise.race([cdp.send('Browser.close').catch(()=>{}),sleep(500)]);
  cdp?.close();
  await terminateOwnedProcess(chrome); await terminateOwnedProcess(preview);
  await rm(profileDir,{recursive:true,force:true,maxRetries:5,retryDelay:150});
  if (origin) await assert.rejects(fetch(origin),'Owned preview port must be closed');
}
