import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const downloads = "C:/Users/brook/Downloads";
const profile = await mkdtemp(join(tmpdir(), "cova-lower-landing-audit-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const consoleErrors = [];
const runtimeErrors = [];
const assetErrors = [];
let preview;
let previewOutput = "";
let chrome;
let chromeOutput = "";
let client;

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForHttp(url) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    if (preview?.exitCode !== null) throw new Error(previewOutput);
    await sleep(100);
  }
  throw new Error(`Preview did not become ready: ${url}`);
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    const listeners = new Map();
    let nextId = 0;
    socket.addEventListener("open", () => resolve({
      send(method, params = {}) {
        const id = ++nextId;
        socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolveRequest, rejectRequest) => pending.set(id, { method, rejectRequest, resolveRequest }));
      },
      on(method, listener) {
        const current = listeners.get(method) ?? [];
        current.push(listener);
        listeners.set(method, current);
      },
      close() { socket.close(); },
    }), { once: true });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) {
        for (const listener of listeners.get(message.method) ?? []) listener(message.params ?? {});
        return;
      }
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id);
      if (message.error) call.rejectRequest(new Error(`${call.method}: ${message.error.message}`));
      else call.resolveRequest(message.result ?? {});
    });
    socket.addEventListener("error", reject, { once: true });
  });
}

async function evaluate(expression) {
  const response = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Runtime evaluation failed");
  return response.result.value;
}

async function waitFor(expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await sleep(60);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function setViewport(width, height, mobile, dpr = 1) {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile, screenWidth: width, screenHeight: height });
  await client.send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
}

async function navigate(origin, label) {
  await client.send("Page.navigate", { url: `${origin}/?lowerLanding=${label}-${Date.now()}#overview` });
  await waitFor("document.readyState === 'complete'");
  await evaluate("document.fonts.ready");
  await waitFor("document.querySelector('.story-strip-simple') && document.querySelector('.cova-closing-section')");
  await sleep(300);
}

async function scrollTo(selector, block = "start") {
  await evaluate(`document.documentElement.style.setProperty('scroll-behavior','auto','important'); document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:${JSON.stringify(block)}}); true`);
  await sleep(350);
}

async function screenshot(name) {
  const result = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const path = join(downloads, name);
  await writeFile(path, Buffer.from(result.data, "base64"));
  return path;
}

async function storyMetrics() {
  return evaluate(`(() => {
    const section = document.querySelector('.story-strip-simple');
    const panel = document.querySelector('.trade-proof-summary-panel');
    const kicker = document.querySelector('.story-section-kicker');
    const metrics = [...panel.querySelectorAll('[class~="sm:grid-cols-3"] > div')];
    const pnl = metrics.find((node) => node.textContent.includes('Net P&L'))?.querySelector('strong');
    const rules = metrics.find((node) => node.textContent.includes('Rules kept'))?.querySelector('strong');
    const ledger = document.querySelector('.trade-proof-ledger');
    const firstStep = document.querySelector('.trade-proof-step-row');
    return {
      backgroundColor: getComputedStyle(section).backgroundColor,
      backgroundImage: getComputedStyle(section).backgroundImage,
      borderTopColor: getComputedStyle(section).borderTopColor,
      kickerColor: getComputedStyle(kicker).color,
      kickerLine: getComputedStyle(kicker, '::before').backgroundColor,
      pnlColor: getComputedStyle(pnl).color,
      rulesColor: getComputedStyle(rules).color,
      panelTop: getComputedStyle(panel).borderTopColor,
      ledgerTop: getComputedStyle(ledger).borderTopColor,
      firstStepBorder: getComputedStyle(firstStep).borderTopColor,
      overflow: section.scrollWidth - section.clientWidth,
      rect: section.getBoundingClientRect().toJSON(),
    };
  })()`);
}

async function closingMetrics() {
  return evaluate(`(() => {
    const section = document.querySelector('.cova-closing-section');
    const flow = document.querySelector('.cova-closing-structure-flow');
    const canvas = flow?.querySelector('canvas');
    const title = document.querySelector('.cova-closing-title');
    const summary = document.querySelector('.cova-closing-summary');
    const primary = document.querySelector('.cova-closing-primary');
    const secondary = document.querySelector('.cova-closing-secondary');
    const rect = section.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect();
    return {
      renderState: flow?.dataset.renderState,
      backgroundColor: getComputedStyle(section).backgroundColor,
      gridDisplay: getComputedStyle(document.querySelector('.cova-closing-grid')).display,
      beforeDisplay: getComputedStyle(section, '::before').display,
      afterDisplay: getComputedStyle(section, '::after').display,
      titleColor: getComputedStyle(title).color,
      summaryColor: getComputedStyle(summary).color,
      primaryBackground: getComputedStyle(primary).backgroundColor,
      primaryColor: getComputedStyle(primary).color,
      secondaryColor: getComputedStyle(secondary).color,
      canvasPresent: Boolean(canvas),
      canvasWebgl: Boolean(canvas?.getContext('webgl2') || canvas?.getContext('webgl')),
      canvasInside: canvasRect ? canvasRect.left >= rect.left && canvasRect.right <= rect.right && canvasRect.top >= rect.top && canvasRect.bottom <= rect.bottom : false,
      lazyChunkLoaded: performance.getEntriesByType('resource').some((entry) => entry.name.includes('StructureFlowBackground')),
      overflow: section.scrollWidth - section.clientWidth,
      rect: rect.toJSON(),
      title: title?.textContent.replace(/\\s+/g, ' ').trim(),
      summary: summary?.textContent.trim(),
    };
  })()`);
}

async function waitForExit(child, timeout = 5000) {
  if (!child || child.exitCode !== null) return true;
  const started = Date.now();
  while (child.exitCode === null && Date.now() - started < timeout) await sleep(50);
  return child.exitCode !== null;
}

async function terminate(child, browserClient) {
  if (!child || child.exitCode !== null) return;
  if (browserClient) await Promise.race([browserClient.send("Browser.close").catch(() => {}), sleep(500)]);
  else child.kill("SIGTERM");
  if (await waitForExit(child, 3000)) return;
  if (process.platform === "win32" && child.pid) {
    await new Promise((resolve, reject) => execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], async (error) => {
      if (!error || await waitForExit(child, 1000)) resolve();
      else reject(error);
    }));
  } else child.kill("SIGKILL");
}

try {
  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  preview = spawn(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });
  await waitForHttp(origin);

  chrome = spawn(chromePath, ["--headless=new", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  chrome.stderr.on("data", (chunk) => { chromeOutput += chunk.toString(); });
  const portFile = join(profile, "DevToolsActivePort");
  let devToolsPort;
  for (let attempt = 0; attempt < 150 && !devToolsPort; attempt += 1) {
    try {
      const [line] = (await readFile(portFile, "utf8")).split(/\r?\n/);
      if (Number(line) > 0) devToolsPort = Number(line);
    } catch {}
    await sleep(75);
  }
  assert.ok(devToolsPort, `Chrome did not publish DevToolsActivePort.\n${chromeOutput}`);
  const targets = await (await fetch(`http://127.0.0.1:${devToolsPort}/json/list`)).json();
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  assert.ok(page);
  client = await connect(page.webSocketDebuggerUrl);
  client.on("Runtime.consoleAPICalled", (event) => { if (event.type === "error") consoleErrors.push(event.args.map((arg) => arg.value || arg.description || "").join(" ")); });
  client.on("Runtime.exceptionThrown", (event) => runtimeErrors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || "Runtime exception"));
  client.on("Network.responseReceived", (event) => { if (event.response?.status >= 400 && /\.(?:js|css|woff2?)(?:\?|$)/i.test(event.response.url)) assetErrors.push(`${event.response.status} ${event.response.url}`); });
  await Promise.all([client.send("Page.enable"), client.send("Runtime.enable"), client.send("Network.enable")]);

  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await setViewport(1440, 1000, false);
  await navigate(origin, "desktop");
  const chunkBeforeScroll = await evaluate("performance.getEntriesByType('resource').some((entry) => entry.name.includes('StructureFlowBackground'))");
  assert.equal(chunkBeforeScroll, false, "Structure Flow must remain unloaded while the closing section is far away.");

  await scrollTo(".story-strip-simple", "start");
  const desktopStory = await storyMetrics();
  assert.equal(desktopStory.backgroundColor, "rgb(8, 9, 12)");
  assert.match(desktopStory.backgroundImage, /rgba\(79, 125, 255/);
  assert.equal(desktopStory.kickerColor, "rgb(111, 150, 255)");
  assert.equal(desktopStory.kickerLine, "rgb(79, 125, 255)");
  assert.equal(desktopStory.pnlColor, "rgb(111, 150, 255)");
  assert.equal(desktopStory.rulesColor, "rgb(111, 150, 255)");
  assert.equal(desktopStory.panelTop, "rgba(79, 125, 255, 0.58)");
  assert.equal(desktopStory.ledgerTop, "rgba(79, 125, 255, 0.58)");
  assert.equal(desktopStory.overflow, 0);
  const storyDesktopImage = await screenshot("cova-how-cova-works-cobalt-desktop.png");

  await scrollTo(".cova-closing-section", "center");
  await waitFor("['running','static'].includes(document.querySelector('.cova-closing-structure-flow')?.dataset.renderState)", 20000);
  const desktopClosing = await closingMetrics();
  assert.equal(desktopClosing.renderState, "running");
  assert.equal(desktopClosing.backgroundColor, "rgb(5, 6, 7)");
  assert.equal(desktopClosing.gridDisplay, "none");
  assert.equal(desktopClosing.beforeDisplay, "none");
  assert.equal(desktopClosing.afterDisplay, "none");
  assert.equal(desktopClosing.titleColor, "rgb(232, 238, 255)");
  assert.equal(desktopClosing.primaryBackground, "rgb(232, 238, 255)");
  assert.deepEqual({ canvasPresent: desktopClosing.canvasPresent, canvasWebgl: desktopClosing.canvasWebgl, canvasInside: desktopClosing.canvasInside, lazyChunkLoaded: desktopClosing.lazyChunkLoaded, overflow: desktopClosing.overflow }, { canvasPresent: true, canvasWebgl: true, canvasInside: true, lazyChunkLoaded: true, overflow: 0 });
  assert.equal(desktopClosing.title, "Stop repeating the trade that keeps costing you.");
  assert.equal(desktopClosing.summary, "Review behavior. Tighten limits. Build proof of discipline.");
  const closingDesktopImage = await screenshot("cova-structure-flow-closing-desktop.png");

  await evaluate("document.querySelector('.cova-closing-primary').click()");
  await waitFor("document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Sign up to Cova'");
  await evaluate("document.querySelector('[role=\"dialog\"] button[aria-label=\"Close\"]').click()");
  await waitFor("!document.querySelector('[role=\"dialog\"]')");

  const contextLossSupported = await evaluate(`(() => { const canvas = document.querySelector('.cova-closing-structure-flow canvas'); const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl'); const extension = gl?.getExtension('WEBGL_lose_context'); if (!extension) return false; extension.loseContext(); return true; })()`);
  assert.equal(contextLossSupported, true);
  await waitFor("document.querySelector('.cova-closing-structure-flow')?.dataset.renderState === 'fallback'", 3000);

  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate(origin, "reduced");
  await scrollTo(".cova-closing-section", "center");
  await waitFor("document.querySelector('.cova-closing-structure-flow')?.dataset.renderState === 'static'", 20000);
  const reducedClosing = await closingMetrics();
  assert.equal(reducedClosing.renderState, "static");

  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await setViewport(390, 844, true, 2);
  await navigate(origin, "mobile");
  await scrollTo(".story-strip-simple", "start");
  const mobileStory = await storyMetrics();
  assert.equal(mobileStory.overflow, 0);
  assert.ok(mobileStory.rect.left >= 0 && mobileStory.rect.right <= 390);
  const storyMobileImage = await screenshot("cova-how-cova-works-cobalt-mobile.png");

  await scrollTo(".cova-closing-section", "center");
  await waitFor("document.querySelector('.cova-closing-structure-flow')?.dataset.renderState === 'running'", 20000);
  const mobileClosing = await closingMetrics();
  assert.equal(mobileClosing.overflow, 0);
  assert.ok(mobileClosing.rect.left >= 0 && mobileClosing.rect.right <= 390);
  assert.equal(mobileClosing.canvasInside, true);
  const closingMobileImage = await screenshot("cova-structure-flow-closing-mobile.png");

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(assetErrors, []);
  console.log(JSON.stringify({ assetErrors, chunkBeforeScroll, closingDesktopImage, closingMobileImage, consoleErrors, desktopClosing, desktopStory, mobileClosing, mobileStory, reducedClosing, runtimeErrors, storyDesktopImage, storyMobileImage }, null, 2));
} finally {
  await terminate(chrome, client).catch(() => {});
  client?.close();
  await terminate(preview).catch(() => {});
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}
