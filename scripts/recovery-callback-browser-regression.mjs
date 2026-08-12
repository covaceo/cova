import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createViteServer } from "vite";

process.env.VITE_SUPABASE_URL = "https://synthetic.supabase.test";
process.env.VITE_SUPABASE_ANON_KEY = "synthetic-anon-key";

const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let profileDir = "";
let vite;
let server;
let chrome;
let chromeError;
let stderr = "";
let cdp;

async function waitForDevToolsActivePort(timeoutMs = 10_000) {
  const activePortPath = join(profileDir, "DevToolsActivePort");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (chromeError) throw chromeError;
    if (!chrome) throw new Error("Owned Chrome was not started.");
    if (chrome.exitCode !== null) throw new Error(`Owned Chrome exited before DevTools was ready (${chrome.exitCode}). ${stderr}`);
    try {
      const [portLine] = (await readFile(activePortPath, "utf8")).split(/\r?\n/);
      const port = Number(portLine);
      if (Number.isInteger(port) && port > 0 && port < 65_536) return port;
    } catch {}
    await sleep(75);
  }
  throw new Error("Owned Chrome did not publish DevToolsActivePort.");
}

async function waitForJson(url, timeoutMs = 10_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) { lastError = error; }
    await sleep(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.addEventListener("open", () => resolve({
      events,
      send(method, params = {}) {
        const callId = ++id;
        ws.send(JSON.stringify({ id: callId, method, params }));
        return new Promise((resolveCall, rejectCall) => pending.set(callId, { resolveCall, rejectCall, method }));
      },
      close() { ws.close(); },
    }), { once: true });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) { events.push(message); return; }
      const callback = pending.get(message.id);
      if (!callback) return;
      pending.delete(message.id);
      if (message.error) callback.rejectCall(new Error(`${callback.method}: ${message.error.message}`));
      else callback.resolveCall(message.result || {});
    });
    ws.addEventListener("error", reject, { once: true });
  });
}

async function waitForChromeExit(timeoutMs = 5_000) {
  if (!chrome || chromeError && !chrome.pid) return true;
  const started = Date.now();
  while (chrome.exitCode === null && Date.now() - started < timeoutMs) await sleep(50);
  return chrome.exitCode !== null;
}

async function terminateChrome() {
  if (!chrome || chromeError && !chrome.pid) return;
  if (chrome.exitCode === null && cdp) {
    await Promise.race([cdp.send("Browser.close").catch(() => {}), sleep(500)]);
    if (await waitForChromeExit(3_000)) return;
  }
  if (chrome.exitCode === null && process.platform === "win32" && chrome.pid) {
    await new Promise((resolve, reject) => execFile("taskkill.exe", ["/PID", String(chrome.pid), "/T", "/F"], async (error) => {
      if (!error || await waitForChromeExit(1_000)) resolve();
      else reject(error);
    }));
  }
  if (!await waitForChromeExit()) throw new Error("Owned Chrome did not exit.");
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

try {
  profileDir = await mkdtemp(join(tmpdir(), "cova-recovery-browser-"));
  vite = await createViteServer({
    clearScreen: false,
    server: { middlewareMode: true, hmr: false },
  });
  server = createHttpServer(vite.middlewares);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string" && address.port > 0, "Vite did not publish an owned port.");
  const origin = `http://cova.localhost:${address.port}`;
  chrome = spawn(chromePath, [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  chrome.once("error", (error) => { chromeError = error; });
  chrome.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  const cdpPort = await waitForDevToolsActivePort();
  await waitForJson(`http://127.0.0.1:${cdpPort}/json/version`);
  const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  assert.ok(page, "No Chrome page target.");
  cdp = await connectCdp(page.webSocketDebuggerUrl);
  const send = cdp.send;
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime exception");
    return result.result.value;
  };
  const waitFor = async (expression, timeoutMs = 10_000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(50);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };

  const now = Math.floor(Date.now() / 1_000);
  const accessToken = `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({ aud: "authenticated", email: "recovery@example.com", exp: now + 3_600, iat: now, role: "authenticated", sub: "user-recovery" })}.synthetic`;
  const callbackHash = new URLSearchParams({
    access_token: accessToken,
    expires_in: "3600",
    refresh_token: "synthetic-refresh-token",
    token_type: "bearer",
    type: "recovery",
  }).toString();

  await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Log.enable"), send("Network.enable")]);
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      window.__covaRecoveryRequests = [];
      window.__covaAuthSessionWrites = 0;
      window.__covaWorkspaceEverRendered = false;
      const nativeFetch = window.fetch.bind(window);
      const nativeSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (this === localStorage && key === 'cova-auth-session-v1') window.__covaAuthSessionWrites += 1;
        return nativeSetItem.call(this, key, value);
      };
      const workspaceObserver = new MutationObserver(() => {
        if (document.querySelector('.workspace-sidebar')) window.__covaWorkspaceEverRendered = true;
      });
      workspaceObserver.observe(document, { childList: true, subtree: true });
      const user = {
        id: 'user-recovery', aud: 'authenticated', role: 'authenticated', email: 'recovery@example.com',
        email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {}, identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      window.fetch = async (input, init = {}) => {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(raw, location.href);
        const method = String(init.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
        window.__covaRecoveryRequests.push({ host: url.hostname, path: url.pathname, method });
        if (url.hostname === 'synthetic.supabase.test' && url.pathname === '/auth/v1/user') {
          return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.hostname === 'synthetic.supabase.test' && url.pathname.includes('/auth/v1/token')) {
          return new Response(JSON.stringify({ error: 'unexpected token exchange' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.origin === location.origin && url.pathname === '/api/auth/consent') {
          return new Response(JSON.stringify({ accepted: true, privacyVersion: 'synthetic', termsVersion: 'synthetic' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return nativeFetch(input, init);
      };
    })();`,
  });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false, screenWidth: 1280, screenHeight: 800 });
  await send("Page.navigate", { url: `${origin}/?recoveryBrowser=1#${callbackHash}` });
  await waitFor("document.readyState === 'complete'", 45_000);
  await waitFor("document.querySelector('[role=\"dialog\"] h2')?.textContent?.trim() === 'Set a new password'", 45_000);

  const state = await evaluate(`(() => ({
    dialogLabel: document.querySelector('[role="dialog"]')?.getAttribute('aria-label'),
    heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim(),
    workspaceVisible: Boolean(document.querySelector('.workspace-sidebar')),
    workspaceEverRendered: window.__covaWorkspaceEverRendered,
    appSessionPresent: localStorage.getItem('cova-auth-session-v1') !== null,
    appSessionWrites: window.__covaAuthSessionWrites,
    consentCalls: window.__covaRecoveryRequests.filter((request) => request.path === '/api/auth/consent').length,
    userCalls: window.__covaRecoveryRequests.filter((request) => request.host === 'synthetic.supabase.test' && request.path === '/auth/v1/user').length,
  }))()`);
  assert.deepEqual(state, {
    dialogLabel: "Reset Cova password",
    heading: "Set a new password",
    workspaceVisible: false,
    workspaceEverRendered: false,
    appSessionPresent: false,
    appSessionWrites: 0,
    consentCalls: 0,
    userCalls: 1,
  });
  assert.equal(new URL(await evaluate("location.href")).hostname, "cova.localhost");
  const badEvents = cdp.events.filter((message) => message.method === "Runtime.exceptionThrown" || (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") || (message.method === "Network.loadingFailed" && !message.params?.canceled));
  assert.deepEqual(badEvents, [], "Recovery callback browser probe must finish without runtime, console, or essential network failures.");
  console.log("recovery-callback-browser-regression: token-bearing recovery stayed locked on Set a new password");
} finally {
  const cleanupErrors = [];
  try {
    await terminateChrome();
  } catch (error) {
    cleanupErrors.push(error);
  }
  cdp?.close();
  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await vite?.close();
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Recovery callback browser cleanup failed.");
}
