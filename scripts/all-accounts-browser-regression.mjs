import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const evidenceDir = process.env.WORKSPACE_EVIDENCE || join(root, "node_modules/.cache/all-accounts");
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


const {default:load}=await import('./helpers/load-ts.cjs');
const {sampleTrades,defaultRules}=load('src/lib/risk.ts');
const make=(id,date,pnl,account)=>({...sampleTrades[0],id,date,pnl,market:'MNQ',source:{provider:'Tradovate',accountId:account,openedAt:date+'T12:00:00.000Z',closedAt:date+'T12:02:00.000Z',timeZone:'UTC',pnlBasis:'gross_before_fees'}});
const real=[make('tradovate-71:101:102','2026-09-18',-100,'71'),make('tradovate-72:103:104','2026-09-23',300,'72'),make('tradovate-71:105:106','2026-09-24',-50,'71')];
const rows=[...sampleTrades,...real],receipts=[];
for(const [width,height,mobile] of [[1440,1000,false],[1280,720,false],[390,844,true]]){
 await openDashboard(width,height,mobile);
 const key=await evaluate("'cova-react-risk-os-v2:' + localStorage.getItem('cova-active-storage-identity-v1')");
 await evaluate(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify({trades:rows,rules:defaultRules,tradeAccount:'all'}))});localStorage.setItem('cova-dashboard-range-v1','all')`);
 const reload=async()=>{const before=await evaluate('performance.timeOrigin');await cdp.send('Page.reload',{ignoreCache:true});await waitFor(`performance.timeOrigin!==${before} && document.querySelector('[data-dashboard-trade-count]')?.dataset.dashboardTradeCount==='3' && document.fonts.status==='loaded'`)};
 await reload();
 const choose=async value=>{await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Trade account"]');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await waitFor(`document.querySelector('select[aria-label="Trade account"]').value===${JSON.stringify(value)}`)};
 for(const [account,count,amount,history] of [['all','3','+$150.00','split'],['Tradovate:71','2','−$150.00','loss'],['Tradovate:72','1','+$300.00','profit'],['all','3','+$150.00','split']]){
  await choose(account);await waitFor(`document.querySelector('[data-dashboard-trade-count]')?.dataset.dashboardTradeCount==='${count}' && document.querySelector('.astra-chart-main')?.dataset.equityHistory==='${history}'`);
  assert.equal(await evaluate("document.querySelector('[data-astra-stat=pnl] .astra-stat-value').textContent"),amount);
  assert.equal(await evaluate("document.querySelector('[data-astra-stat=pnl] .astra-stat-label').textContent"),'Gross P&L');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('select[aria-label=\"Trade account\"] option')].map(n=>n.value)"),['all','Tradovate:71','Tradovate:72']);
  assert.doesNotMatch(await evaluate("document.querySelector('.astra-chart-svg').textContent"),/Apr|May/);
 }
 for(const [label,colors] of [['Latest session',['#4f7dff','#e57c89']],['Last 7 days',['#4f7dff','#e57c89','#52c79a','#52c79a']],['All trades',['#4f7dff','#e57c89','#52c79a','#52c79a']]]){
  await clickSelector('.astra-segmented button',label);
  await waitFor(`document.querySelector('.astra-segmented [aria-pressed=true]').textContent===${JSON.stringify(label)}`);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.astra-observation')].map(n=>n.getAttribute('fill'))"),colors);
 }
 await evaluate("document.querySelector('.astra-chart-svg').scrollIntoView({block:'center',behavior:'instant'});document.querySelector('.astra-chart-svg').focus()");
 await press('Home');await press('ArrowRight');await waitFor("document.querySelector('.astra-chart-tooltip')?.textContent.includes('2026-09-18')");
 assert.equal(await evaluate("document.querySelector('.astra-chart-tooltip strong').textContent"),'−$100.00');
 assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).trades`),rows,'Neither real nor demo saved rows are deleted or rewritten');
 assert.deepEqual(await evaluate('[innerWidth,document.documentElement.clientWidth]'),[width,width]);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
 await capture(join(evidenceDir,`all-accounts-${width}.png`));
 await reload();assert.equal(await evaluate("document.querySelector('.astra-chart-main').dataset.equityHistory"),'split');
 receipts.push({width,height,mobile,allABAll:true,reload:true,demoExcluded:true,storedLedgerPreserved:true,rangeColors:true,tooltip:true});
}
assert.deepEqual(consoleErrors,[]);assert.deepEqual(runtimeErrors,[]);
await writeFile(join(evidenceDir,'receipt.json'),JSON.stringify({receipts,consoleErrors,runtimeErrors},null,2));
console.log('PASS All accounts compiled app',JSON.stringify({evidenceDir,receipts}));
} finally {
  if(cdp) await Promise.race([cdp.send('Browser.close').catch(()=>{}),sleep(500)]);
  cdp?.close();
  await terminateOwnedProcess(chrome); await terminateOwnedProcess(preview);
  await rm(profileDir,{recursive:true,force:true,maxRetries:5,retryDelay:150});
  if (origin) await assert.rejects(fetch(origin),'Owned preview port must be closed');
}
