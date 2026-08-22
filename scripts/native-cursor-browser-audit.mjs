import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.COVA_URL || "http://127.0.0.1:4173";
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = await mkdtemp(join(tmpdir(), "cova-native-cursor-audit-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let chrome;
let chromeOutput = "";
let client;
const consoleErrors = [];
const runtimeErrors = [];
const assetErrors = [];

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
        return new Promise((resolveRequest, rejectRequest) => {
          const timeout = setTimeout(() => {
            pending.delete(id);
            rejectRequest(new Error(`CDP request timed out: ${method}`));
          }, 12000);
          pending.set(id, { method, rejectRequest, resolveRequest, timeout });
        });
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
      clearTimeout(call.timeout);
      if (message.error) call.rejectRequest(new Error(`${call.method}: ${message.error.message}`));
      else call.resolveRequest(message.result ?? {});
    });
    socket.addEventListener("error", reject, { once: true });
    socket.addEventListener("close", () => {
      for (const call of pending.values()) {
        clearTimeout(call.timeout);
        call.rejectRequest(new Error("CDP connection closed before completion"));
      }
      pending.clear();
    });
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

async function setViewport(width, height, mobile) {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
  await client.send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
}

async function navigate(label) {
  await client.send("Page.navigate", { url: `${baseUrl}/?nativeCursorAudit=${label}-${Date.now()}#overview` });
  await waitFor("document.readyState === 'complete'");
  await evaluate("document.fonts.ready");
  await waitFor("document.querySelector('.dark-glass-secondary')");
  await sleep(240);
}

async function snapshot() {
  return evaluate(`(() => {
    const html = document.documentElement;
    const body = document.body;
    const action = document.querySelector('.dark-glass-secondary');
    const hero = document.querySelector('.market-hero');
    return {
      customRoot: Boolean(document.querySelector('.cova-cursor')),
      activeClass: html.classList.contains('cova-custom-cursor-active'),
      htmlCursor: getComputedStyle(html).cursor,
      bodyCursor: getComputedStyle(body).cursor,
      actionCursor: action ? getComputedStyle(action).cursor : null,
      heroCursor: hero ? getComputedStyle(hero).cursor : null,
      overflow: html.scrollWidth - html.clientWidth,
    };
  })()`);
}

async function waitForChromeExit(timeout = 5000) {
  if (!chrome || chrome.exitCode !== null) return true;
  const started = Date.now();
  while (chrome.exitCode === null && Date.now() - started < timeout) await sleep(50);
  return chrome.exitCode !== null;
}

async function terminateChrome() {
  if (!chrome || chrome.exitCode !== null) return;
  if (client) await Promise.race([client.send("Browser.close").catch(() => {}), sleep(500)]);
  if (await waitForChromeExit(3000)) return;
  if (process.platform === "win32" && chrome.pid) {
    await new Promise((resolve, reject) => execFile("taskkill.exe", ["/PID", String(chrome.pid), "/T", "/F"], async (error) => {
      if (!error || await waitForChromeExit(1000)) resolve();
      else reject(error);
    }));
  } else if (!chrome.kill("SIGKILL")) {
    throw new Error("Owned Chrome process refused termination");
  }
  if (!await waitForChromeExit()) throw new Error("Owned Chrome process did not exit");
}

async function removeProfile() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!error || !["EBUSY", "EPERM", "ENOTEMPTY"].includes(error.code) || attempt === 7) throw error;
      await sleep(150 * (attempt + 1));
    }
  }
}

try {
  chrome = spawn(chromePath, [
    "--headless=new",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  chrome.stderr.on("data", (chunk) => { chromeOutput += chunk.toString(); });
  const portFile = join(profile, "DevToolsActivePort");
  let devToolsPort;
  for (let attempt = 0; attempt < 150 && !devToolsPort; attempt += 1) {
    if (chrome.exitCode !== null) throw new Error(chromeOutput);
    try {
      const [line] = (await readFile(portFile, "utf8")).split(/\r?\n/);
      if (Number(line) > 0) devToolsPort = Number(line);
    } catch {}
    await sleep(75);
  }
  assert.ok(devToolsPort, `Chrome did not publish DevToolsActivePort.\n${chromeOutput}`);
  const targets = await (await fetch(`http://127.0.0.1:${devToolsPort}/json/list`)).json();
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  assert.ok(page, "A Chrome page target is required");
  client = await connect(page.webSocketDebuggerUrl);
  client.on("Runtime.consoleAPICalled", (event) => { if (event.type === "error") consoleErrors.push(event.args.map((arg) => arg.value || arg.description || "").join(" ")); });
  client.on("Runtime.exceptionThrown", (event) => runtimeErrors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || "Runtime exception"));
  client.on("Network.responseReceived", (event) => {
    if (event.response?.status >= 400 && /\.(?:js|css|woff2?)(?:\?|$)/i.test(event.response.url)) assetErrors.push(`${event.response.status} ${event.response.url}`);
  });
  await Promise.all([client.send("Page.enable"), client.send("Runtime.enable"), client.send("Network.enable")]);

  await setViewport(1200, 800, false);
  await navigate("desktop");
  const actionRect = await evaluate("document.querySelector('.dark-glass-secondary').getBoundingClientRect().toJSON()");
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: actionRect.left + actionRect.width / 2, y: actionRect.top + actionRect.height / 2 });
  await sleep(320);
  const desktop = await snapshot();
  assert.deepEqual({ customRoot: desktop.customRoot, activeClass: desktop.activeClass }, { customRoot: false, activeClass: false });
  assert.notEqual(desktop.htmlCursor, "none");
  assert.notEqual(desktop.bodyCursor, "none");
  assert.notEqual(desktop.actionCursor, "none");
  assert.notEqual(desktop.heroCursor, "none");
  assert.equal(desktop.overflow, 0);

  await setViewport(390, 844, true);
  await navigate("mobile");
  const mobile = await snapshot();
  assert.deepEqual({ customRoot: mobile.customRoot, activeClass: mobile.activeClass }, { customRoot: false, activeClass: false });
  assert.notEqual(mobile.htmlCursor, "none");
  assert.notEqual(mobile.bodyCursor, "none");
  assert.equal(mobile.overflow, 0);

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(assetErrors, []);
  console.log(JSON.stringify({ assetErrors, consoleErrors, desktop, mobile, runtimeErrors }, null, 2));
} finally {
  await terminateChrome().catch(() => {});
  client?.close();
  await removeProfile();
}
