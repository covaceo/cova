import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preview as startPreview } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profileDir = await mkdtemp(join(tmpdir(), "cova-features-browser-"));
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let previewServer;
let previewPort;
let chrome;
let cdp;
let origin;
const consoleErrors = [];
const runtimeErrors = [];
const networkErrors = [];

async function portIsOpen(port) {
  return new Promise(resolve => {
    const socket = connect({ host: "127.0.0.1", port });
    const finish = value => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

async function waitForPortClosed(port, timeoutMs = 5_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!(await portIsOpen(port))) return true;
    await sleep(50);
  }
  return false;
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
        return new Promise((resolve, reject) => pending.set(callId, { method, resolve, reject }));
      },
      on(method, listener) {
        const bucket = listeners.get(method) || [];
        bucket.push(listener);
        listeners.set(method, bucket);
      },
      close() { ws.close(); },
    }), { once: true });
    ws.addEventListener("message", event => {
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
  const response = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

async function waitFor(expression, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function setViewport(width, height, mobile = false) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
  await cdp.send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
}

async function navigate(label) {
  await cdp.send("Page.navigate", { url: `${origin}/?features-browser=${label}#features` });
  await waitFor("document.readyState === 'complete'");
  await evaluate("document.fonts.ready");
  await waitFor("document.querySelector('[data-features-showcase]')");
  await waitFor("document.querySelectorAll('[role=tab]').length === 6");
  await sleep(420);
}

const contrastExpression = `(() => {
  function parseColor(value) {
    const match = value.match(/rgba?\\(([^)]+)\\)/);
    if (!match) return [0, 0, 0, 1];
    const parts = match[1].split(',').map(part => Number.parseFloat(part.trim()));
    return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
  }
  function composite(foreground, background) {
    const alpha = foreground[3] + background[3] * (1 - foreground[3]);
    return [
      (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
      (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
      (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
      alpha,
    ];
  }
  function opaqueBackground(element) {
    let result = [8, 9, 12, 1];
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const color = parseColor(getComputedStyle(node).backgroundColor);
      if (color[3] > 0) layers.push(color);
    }
    for (let index = layers.length - 1; index >= 0; index--) result = composite(layers[index], result);
    return result;
  }
  function luminance(rgb) {
    const values = rgb.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  }
  function contrastRatio(element) {
    const background = opaqueBackground(element);
    const foreground = composite(parseColor(getComputedStyle(element).color), background);
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  }
  const subjects = [
    document.querySelector('.features-instrument-footer span:last-child'),
    document.querySelector('.features-outcome-panel small'),
    document.querySelector('.features-showcase-trust span:first-child'),
  ];
  return subjects.map(element => ({ text: element.textContent.trim(), ratio: contrastRatio(element), fontSize: getComputedStyle(element).fontSize }));
})()`;

async function contrastMetrics() {
  const metrics = await evaluate(contrastExpression);
  for (const item of metrics) assert.ok(item.ratio >= 4.5, `Expected AA contrast for “${item.text}”; ratio=${item.ratio.toFixed(2)} font=${item.fontSize}`);
  return metrics;
}

try {
  previewServer = await startPreview({
    root,
    logLevel: "silent",
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  const previewAddress = previewServer.httpServer.address();
  assert.ok(previewAddress && typeof previewAddress === "object", "Owned Vite preview must expose its bound address.");
  previewPort = previewAddress.port;
  origin = `http://127.0.0.1:${previewPort}`;
  const ownedResponse = await fetch(`${origin}/`);
  assert.ok(ownedResponse.ok, `Owned Vite preview returned ${ownedResponse.status}.`);

  chrome = spawn(chromePath, ["--headless=new", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--remote-debugging-port=0", `--user-data-dir=${profileDir}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const devToolsPath = join(profileDir, "DevToolsActivePort");
  let devToolsPort;
  const started = Date.now();
  while (!devToolsPort && Date.now() - started < 10_000) {
    try { devToolsPort = Number((await readFile(devToolsPath, "utf8")).split(/\r?\n/)[0]); }
    catch { await sleep(80); }
  }
  assert.ok(devToolsPort);
  const targets = await fetch(`http://127.0.0.1:${devToolsPort}/json/list`).then(response => response.json());
  cdp = await connectCdp(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  cdp.on("Runtime.consoleAPICalled", ({ type, args }) => { if (type === "error") consoleErrors.push(args.map(arg => arg.value ?? arg.description).join(" ")); });
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text));
  cdp.on("Network.loadingFailed", ({ canceled, errorText, type }) => { if (!canceled && type !== "Other") networkErrors.push(`${type}: ${errorText}`); });
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);

  await setViewport(1440, 900, false);
  await navigate("desktop");
  const desktop = await evaluate(`(() => ({
    orientation: document.querySelector('[role=tablist]').getAttribute('aria-orientation'),
    selected: document.querySelectorAll('[role=tab][aria-selected="true"]').length,
    rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))()`);
  assert.equal(desktop.orientation, "vertical");
  assert.equal(desktop.selected, 1);
  assert.equal(desktop.rootOverflow, 0);
  const desktopContrast = await contrastMetrics();

  await setViewport(390, 844, true);
  await navigate("mobile");
  const mobile = await evaluate(`(() => ({
    orientation: document.querySelector('[role=tablist]').getAttribute('aria-orientation'),
    selected: document.querySelectorAll('[role=tab][aria-selected="true"]').length,
    rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))()`);
  assert.equal(mobile.orientation, "horizontal");
  assert.equal(mobile.selected, 1);
  assert.equal(mobile.rootOverflow, 0);
  const mobileContrast = await contrastMetrics();

  await evaluate("document.querySelectorAll('[role=tab]')[0].click(); true");
  await waitFor("document.querySelector('[data-feature-instrument]')?.dataset.featureInstrument === 'trade-journal'");
  await waitFor("document.querySelector('[data-journal-scroll]')");
  const journalBefore = await evaluate(`(() => {
    const scroll = document.querySelector('[data-journal-scroll]');
    const review = scroll.querySelector('[role=row]:not(.features-journal-row-head) [role=cell]:last-child');
    return { scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth, scrollLeft: scroll.scrollLeft, review: review.getBoundingClientRect().toJSON(), shell: scroll.getBoundingClientRect().toJSON() };
  })()`);
  await evaluate("document.querySelector('[data-journal-scroll]').scrollLeft = document.querySelector('[data-journal-scroll]').scrollWidth; true");
  await waitFor("document.querySelector('[data-journal-scroll]').scrollLeft > 0");
  await sleep(320);
  const journalAfter = await evaluate(`(() => {
    const scroll = document.querySelector('[data-journal-scroll]');
    const review = scroll.querySelector('[role=row]:not(.features-journal-row-head) [role=cell]:last-child');
    return { scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth, scrollLeft: scroll.scrollLeft, review: review.getBoundingClientRect().toJSON(), shell: scroll.getBoundingClientRect().toJSON() };
  })()`);
  const journal = { before: journalBefore, after: journalAfter };
  assert.ok(journal.before.scrollWidth > journal.before.clientWidth, "Mobile Trade Journal must own horizontal overflow.");
  assert.ok(journal.after.scrollLeft > journal.before.scrollLeft, "Mobile Trade Journal scrollLeft must move.");
  assert.ok(journal.after.review.left >= journal.after.shell.left - 1 && journal.after.review.right <= journal.after.shell.right + 1, "Review column must be reachable inside the scroll owner.");

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(networkErrors, []);
  console.log(JSON.stringify({ origin, desktop, desktopContrast, mobile, mobileContrast, journal, consoleErrors, runtimeErrors, networkErrors }, null, 2));
} finally {
  cdp?.close();
  if (chrome && chrome.exitCode === null) {
    if (process.platform === "win32" && chrome.pid) await new Promise(resolve => execFile("taskkill.exe", ["/PID", String(chrome.pid), "/T", "/F"], () => resolve()));
    else chrome.kill("SIGTERM");
  }
  if (previewServer) {
    await previewServer.close();
    if (previewPort) assert.ok(await waitForPortClosed(previewPort), `Owned Vite preview port ${previewPort} remained open after teardown.`);
  }
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}
