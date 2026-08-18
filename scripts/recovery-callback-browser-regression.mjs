import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createViteServer } from "vite";

process.env.VITE_SUPABASE_URL = "https://synthetic.supabase.test";
process.env.VITE_SUPABASE_ANON_KEY = "synthetic-anon-key";
process.env.VITE_ENABLE_DEMO_PREVIEW = "false";

const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withDeadline = async (label, operation, timeoutMs = 5_000) => {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
let profileDir = "";
let vite;
let server;
let serverPort = 0;
let chrome;
let chromeError;
let stderr = "";
let cdp;
let primaryError;

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
      close() {
        if (ws.readyState === WebSocket.CLOSED) return Promise.resolve();
        return new Promise((resolveClose, rejectClose) => {
          ws.addEventListener("close", resolveClose, { once: true });
          ws.addEventListener("error", rejectClose, { once: true });
          ws.close();
        });
      },
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

async function confirmPortClosed(port) {
  if (!port) return;
  const probe = createHttpServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", resolve);
    });
  } finally {
    if (probe.listening) {
      await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
    }
  }
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const mismatchedRecovery = process.argv.includes("--mismatched") || process.env.COVA_QA_MISMATCHED_RECOVERY === "true";
const reloadRecovery = process.argv.includes("--reload");
const reloadMismatchedRecovery = process.argv.includes("--reload-mismatched");
const reloadMalformedRecovery = process.argv.includes("--reload-malformed");
const reloadMissingRecovery = process.argv.includes("--reload-missing");
const ordinaryReload = process.argv.includes("--ordinary-reload");
const recoveryMarkerWriteFailure = process.argv.includes("--marker-write-failure");
const recoveryMarkerClearFailure = process.argv.includes("--marker-clear-failure");
const now = Math.floor(Date.now() / 1_000);
const accessToken = `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({ amr: [{ method: "otp", timestamp: now }], aud: "authenticated", email: "recovery@example.com", exp: now + 3_600, iat: now, role: "authenticated", session_id: "session-recovery", sub: "user-recovery" })}.synthetic-recovery`;
const mismatchedAccessToken = `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({ amr: [{ method: "otp", timestamp: now }], aud: "authenticated", email: "other@example.com", exp: now + 3_600, iat: now, role: "authenticated", session_id: "session-other", sub: "user-other" })}.synthetic-other`;
const ordinaryAccessToken = `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({ amr: [{ method: "password", timestamp: now }], aud: "authenticated", email: "recovery@example.com", exp: now + 3_600, iat: now, role: "authenticated", session_id: "session-ordinary", sub: "user-recovery" })}.synthetic-ordinary`;
const buildCallbackHash = (token, refreshToken) => new URLSearchParams({
  access_token: token,
  expires_in: "3600",
  refresh_token: refreshToken,
  token_type: "bearer",
  type: "recovery",
}).toString();
const callbackHash = buildCallbackHash(accessToken, "synthetic-refresh-token");
const mismatchedCallbackHash = buildCallbackHash(mismatchedAccessToken, "synthetic-other-refresh-token");

try {
  profileDir = await mkdtemp(join(tmpdir(), "cova-recovery-browser-"));
  vite = await createViteServer({
    clearScreen: false,
    plugins: [{
      name: "cova-recovery-mismatch-entry",
      resolveId(id) {
        if (id === "/@cova/recovery-mismatch-entry") return "\0cova-recovery-mismatch-entry";
        if (id === "/@cova/ordinary-reload-entry") return "\0cova-ordinary-reload-entry";
        return null;
      },
      load(id) {
        if (id === "\0cova-ordinary-reload-entry") {
          return `
            import React from 'react';
            import ReactDom from 'react-dom/client';
            const user = {
              id: 'user-recovery', aud: 'authenticated', role: 'authenticated', email: 'recovery@example.com',
              email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] },
              user_metadata: {}, identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            };
            localStorage.setItem('cova-supabase-auth-v1', JSON.stringify({
              access_token: ${JSON.stringify(ordinaryAccessToken)}, expires_at: ${now + 3_600}, expires_in: 3600,
              refresh_token: 'synthetic-ordinary-refresh-token', token_type: 'bearer', user,
            }));
            localStorage.setItem('cova-auth-session-v1', JSON.stringify({
              email: user.email, mode: 'login', plan: 'free', providerSessionId: 'session-ordinary',
              signedInAt: new Date().toISOString(), source: 'supabase', subscriptionStatus: 'none', userId: user.id,
            }));
            const { default: App } = await import('/src/App.tsx');
            ReactDom.createRoot(document.getElementById('root')).render(React.createElement(App));
          `;
        }
        if (id !== "\0cova-recovery-mismatch-entry") return null;
        return `
          import React from 'react';
          import ReactDom from 'react-dom/client';
          import App from '/src/App.tsx';
          history.replaceState(null, '', location.pathname + '#${mismatchedCallbackHash}');
          ReactDom.createRoot(document.getElementById('root')).render(React.createElement(App));
        `;
      },
    }],
    server: { middlewareMode: true, hmr: false },
  });
  server = createHttpServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/__cova_recovery_mismatch__.html") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/@cova/recovery-mismatch-entry"></script></body></html>');
      return;
    }
    if (requestUrl.pathname === "/__cova_ordinary_reload__.html") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/@cova/ordinary-reload-entry"></script></body></html>');
      return;
    }
    if (requestUrl.pathname === "/__cova_qa_http_error__") {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "QA_INJECTED_HTTP_ERROR" }));
      return;
    }
    vite.middlewares(request, response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string" && address.port > 0, "Vite did not publish an owned port.");
  serverPort = address.port;
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


  await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Log.enable"), send("Network.enable")]);
  const injectConsoleError = process.env.COVA_QA_INJECT_CONSOLE_ERROR === "true";
  const injectRuntimeException = process.env.COVA_QA_INJECT_RUNTIME_EXCEPTION === "true";
  const forceRequestMethod = process.env.COVA_QA_FORCE_REQUEST_METHOD === "PUT" ? "PUT" : "";
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      window.__covaRecoveryRequests = [];
      window.__covaAuthSessionWrites = 0;
      window.__covaWorkspaceEverRendered = false;
      window.__covaRecoveryEverRendered = false;
      const nativeFetch = window.fetch.bind(window);
      const nativeSetItem = Storage.prototype.setItem;
      const nativeRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.setItem = function(key, value) {
        if (this === localStorage && key === 'cova-auth-session-v1') window.__covaAuthSessionWrites += 1;
        if (this === localStorage && key === 'cova-supabase-recovery-v1' && ${recoveryMarkerWriteFailure}) throw new DOMException('QA recovery marker write denied', 'QuotaExceededError');
        return nativeSetItem.call(this, key, value);
      };
      Storage.prototype.removeItem = function(key) {
        if (this === localStorage && key === 'cova-supabase-recovery-v1' && ${recoveryMarkerClearFailure} && window.__covaPasswordMutationSeen) {
          throw new DOMException('QA recovery marker clear denied', 'SecurityError');
        }
        return nativeRemoveItem.call(this, key);
      };
      const workspaceObserver = new MutationObserver(() => {
        if (document.querySelector('.workspace-sidebar')) window.__covaWorkspaceEverRendered = true;
        if (document.querySelector('[role="dialog"] h2')?.textContent?.trim() === 'Set a new password') window.__covaRecoveryEverRendered = true;
      });
      workspaceObserver.observe(document, { childList: true, subtree: true });
      ${injectConsoleError ? "console.error('QA_INJECTED_CONSOLE_ERROR');" : ""}
      ${injectRuntimeException ? "setTimeout(() => { throw new Error('QA_INJECTED_RUNTIME_EXCEPTION'); }, 0);" : ""}
      const user = {
        id: 'user-recovery', aud: 'authenticated', role: 'authenticated', email: 'recovery@example.com',
        email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {}, identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      const otherUser = { ...user, id: 'user-other', email: 'other@example.com' };
      window.fetch = async (input, init = {}) => {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(raw, location.href);
        const actualMethod = String(init.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
        const method = ${JSON.stringify(forceRequestMethod)} || actualMethod;
        window.__covaRecoveryRequests.push({ host: url.hostname, path: url.pathname, method });
        if (url.hostname === 'synthetic.supabase.test' && url.pathname === '/auth/v1/user' && actualMethod === 'GET') {
          const authorization = new Headers(init.headers || (typeof input === 'object' ? input.headers : undefined)).get('Authorization') || '';
          return new Response(JSON.stringify(authorization.endsWith(${JSON.stringify(mismatchedAccessToken)}) ? otherUser : user), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.hostname === 'synthetic.supabase.test' && url.pathname === '/auth/v1/user' && actualMethod === 'PUT' && ${recoveryMarkerClearFailure}) {
          window.__covaPasswordMutationSeen = true;
          return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.hostname === 'synthetic.supabase.test' && url.pathname === '/auth/v1/user') {
          return new Response(JSON.stringify({ error: 'unexpected user mutation' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
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
  const pathname = ordinaryReload ? "/__cova_ordinary_reload__.html" : mismatchedRecovery ? "/__cova_recovery_mismatch__.html" : "/";
  const navigationUrl = ordinaryReload ? `${origin}${pathname}#dashboard` : `${origin}${pathname}?recoveryBrowser=1#${callbackHash}`;
  await send("Page.navigate", { url: navigationUrl });
  await waitFor("document.readyState === 'complete'", 45_000);
  if (ordinaryReload) {
    await waitFor("Boolean(document.querySelector('.workspace-sidebar'))", 45_000);
  } else if (mismatchedRecovery || recoveryMarkerWriteFailure) {
    await waitFor("document.querySelector('#root')?.childElementCount > 0 && (window.__covaRecoveryEverRendered || (location.hash === '' && localStorage.getItem('cova-supabase-auth-v1') === null))", 45_000);
  } else {
    await waitFor("document.querySelector('[role=\"dialog\"] h2')?.textContent?.trim() === 'Set a new password'", 45_000);
  }

  const readState = () => evaluate(`(() => ({
    appMounted: Boolean(document.querySelector('#root')?.childElementCount),
    dialogLabel: document.querySelector('[role="dialog"]')?.getAttribute('aria-label') ?? null,
    heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
    urlHash: location.hash,
    urlPathname: location.pathname,
    workspaceVisible: Boolean(document.querySelector('.workspace-sidebar')),
    workspaceEverRendered: window.__covaWorkspaceEverRendered,
    recoveryEverRendered: window.__covaRecoveryEverRendered,
    appSessionPresent: localStorage.getItem('cova-auth-session-v1') !== null,
    appSessionWrites: window.__covaAuthSessionWrites,
    providerSessionPresent: localStorage.getItem('cova-supabase-auth-v1') !== null,
    recoveryMarkerPresent: localStorage.getItem('cova-supabase-recovery-v1') !== null,
    requests: window.__covaRecoveryRequests,
  }))()`);
  const expectedState = mismatchedRecovery || recoveryMarkerWriteFailure ? {
    appMounted: true,
    dialogLabel: null,
    heading: null,
    urlHash: "",
    urlPathname: mismatchedRecovery ? "/__cova_recovery_mismatch__.html" : "/",
    workspaceVisible: false,
    workspaceEverRendered: false,
    recoveryEverRendered: false,
    appSessionPresent: false,
    appSessionWrites: 0,
    providerSessionPresent: false,
    recoveryMarkerPresent: false,
    requests: [{ host: "synthetic.supabase.test", path: "/auth/v1/user", method: "GET" }],
  } : {
    appMounted: true,
    dialogLabel: "Reset Cova password",
    heading: "Set a new password",
    urlHash: "",
    urlPathname: "/",
    workspaceVisible: false,
    workspaceEverRendered: false,
    recoveryEverRendered: true,
    appSessionPresent: false,
    appSessionWrites: 0,
    providerSessionPresent: true,
    recoveryMarkerPresent: true,
    requests: [{ host: "synthetic.supabase.test", path: "/auth/v1/user", method: "GET" }],
  };
  if (ordinaryReload) {
    const ordinaryState = {
      appMounted: true,
      dialogLabel: null,
      heading: null,
      urlHash: "#dashboard",
      urlPathname: "/__cova_ordinary_reload__.html",
      workspaceVisible: true,
      workspaceEverRendered: true,
      recoveryEverRendered: false,
      appSessionPresent: true,
      appSessionWrites: 2,
      providerSessionPresent: true,
      recoveryMarkerPresent: false,
      requests: [{ host: "cova.localhost", path: "/api/auth/consent", method: "GET" }],
    };
    assert.deepEqual(await readState(), ordinaryState, "A matching validated Cova/Supabase session must survive ordinary reload validation.");
    await sleep(750);
    assert.deepEqual(await readState(), ordinaryState, "Ordinary validated reload must remain stable after auth events settle.");
  } else {
    assert.deepEqual(await readState(), expectedState);
    await sleep(750);
    assert.deepEqual(await readState(), expectedState, mismatchedRecovery ? "A mismatched recovery bearer must remain locally rejected." : "Recovery must remain locked after auth events settle.");
  if (reloadRecovery || reloadMismatchedRecovery || reloadMalformedRecovery || reloadMissingRecovery) {
    if (reloadMismatchedRecovery) {
      await evaluate(`(() => {
        const key = 'cova-supabase-auth-v1';
        const persisted = JSON.parse(localStorage.getItem(key));
        localStorage.setItem(key, JSON.stringify({
          ...persisted,
          access_token: ${JSON.stringify(mismatchedAccessToken)},
          refresh_token: 'synthetic-other-refresh-token',
          user: { ...persisted.user, id: 'user-other', email: 'other@example.com' },
        }));
      })()`);
    }
    if (reloadMalformedRecovery) {
      await evaluate("localStorage.setItem('cova-supabase-recovery-v1', '{malformed')");
    }
    if (reloadMissingRecovery) {
      await evaluate("localStorage.removeItem('cova-supabase-recovery-v1')");
    }
    await send("Page.reload", { ignoreCache: true });
    await waitFor("document.readyState === 'complete'", 45_000);
    await waitFor(reloadMismatchedRecovery || reloadMalformedRecovery || reloadMissingRecovery
      ? "document.querySelector('#root')?.childElementCount > 0 && localStorage.getItem('cova-supabase-auth-v1') === null"
      : "document.querySelector('[role=\"dialog\"] h2')?.textContent?.trim() === 'Set a new password' || localStorage.getItem('cova-auth-session-v1') !== null || Boolean(document.querySelector('.workspace-sidebar'))", 45_000);
    const expectedReloadState = reloadMismatchedRecovery || reloadMalformedRecovery || reloadMissingRecovery ? {
      appMounted: true,
      dialogLabel: null,
      heading: null,
      urlHash: "",
      urlPathname: "/",
      workspaceVisible: false,
      workspaceEverRendered: false,
      recoveryEverRendered: false,
      appSessionPresent: false,
      appSessionWrites: 0,
      providerSessionPresent: false,
      recoveryMarkerPresent: false,
      requests: [],
    } : { ...expectedState, requests: [] };
    assert.deepEqual(await readState(), expectedReloadState, reloadMismatchedRecovery || reloadMalformedRecovery || reloadMissingRecovery
      ? "Reload with invalid persisted recovery state must purge both recovery and provider state."
      : "Reload before password mutation must preserve the recovery lock.");
    await sleep(750);
    assert.deepEqual(await readState(), expectedReloadState, reloadMismatchedRecovery || reloadMalformedRecovery || reloadMissingRecovery
      ? "Invalid reloaded recovery must remain locked after auth events settle."
      : "Reloaded recovery must remain locked after auth events settle.");
  }
  if (recoveryMarkerClearFailure) {
    await evaluate(`(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const id of ['new-password', 'confirm-password']) {
        const input = document.getElementById(id);
        setter.call(input, 'synthetic-password-only');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('Update password'))?.click();
    })()`);
    await waitFor("localStorage.getItem('cova-supabase-auth-v1') === null && document.querySelector('[role=\"dialog\"]') === null", 45_000);
    const clearFailureState = {
      appMounted: true,
      dialogLabel: null,
      heading: null,
      urlHash: "",
      urlPathname: "/",
      workspaceVisible: false,
      workspaceEverRendered: false,
      recoveryEverRendered: true,
      appSessionPresent: false,
      appSessionWrites: 0,
      providerSessionPresent: false,
      recoveryMarkerPresent: true,
      requests: [
        { host: "synthetic.supabase.test", path: "/auth/v1/user", method: "GET" },
        { host: "synthetic.supabase.test", path: "/auth/v1/user", method: "GET" },
        { host: "synthetic.supabase.test", path: "/auth/v1/user", method: "PUT" },
      ],
    };
    assert.deepEqual(await readState(), clearFailureState, "Marker-clear failure after password mutation must purge provider state before ordinary validation.");
    await sleep(750);
    assert.deepEqual(await readState(), clearFailureState, "Marker-clear failure must remain locked after auth events settle.");
  }
  }
  assert.equal(await evaluate("import('/src/lib/authEnvironment.ts').then((module) => module.isDemoPreviewEnabled())"), false, "Recovery browser regression must execute production auth mode.");
  assert.equal(new URL(await evaluate("location.href")).hostname, "cova.localhost");
  if (process.env.COVA_QA_INJECT_HTTP_ERROR === "true") {
    await evaluate("fetch('/__cova_qa_http_error__').then((response) => response.status)");
  }
  if (process.env.COVA_QA_INJECT_NETWORK_FAILURE === "true") {
    await evaluate("fetch('http://127.0.0.1:1/__cova_qa_network_failure__').catch(() => null)");
  }
  await sleep(100);
  const badEvents = cdp.events.filter((message) => (
    message.method === "Runtime.exceptionThrown"
    || (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error")
    || (message.method === "Log.entryAdded" && message.params?.entry?.level === "error")
    || (message.method === "Network.loadingFailed" && !message.params?.canceled)
    || (message.method === "Network.responseReceived" && message.params?.response?.status >= 400)
  ));
  assert.deepEqual(badEvents, [], "Recovery callback browser probe must finish without runtime, console, or HTTP/network failures.");
  console.log(recoveryMarkerWriteFailure
    ? "recovery-callback-browser-regression: recovery marker write failure stayed locked out"
    : recoveryMarkerClearFailure
    ? "recovery-callback-browser-regression: recovery marker clear failure stayed locked out"
    : ordinaryReload
    ? "recovery-callback-browser-regression: ordinary validated reload stayed authenticated"
    : mismatchedRecovery
    ? "recovery-callback-browser-regression: mismatched recovery bearer stayed locked out"
    : reloadMissingRecovery
      ? "recovery-callback-browser-regression: missing persisted recovery stayed locked out after reload"
      : reloadMalformedRecovery
      ? "recovery-callback-browser-regression: malformed persisted recovery stayed locked out after reload"
      : reloadMismatchedRecovery
      ? "recovery-callback-browser-regression: mismatched persisted recovery stayed locked out after reload"
      : reloadRecovery
      ? "recovery-callback-browser-regression: recovery lock survived a token-free reload"
      : "recovery-callback-browser-regression: token-bearing recovery stayed locked on Set a new password");
} catch (error) {
  primaryError = error;
} finally {
  const cleanupErrors = [];
  const cleanup = async (label, operation, timeoutMs = 5_000) => {
    try {
      await withDeadline(label, operation, timeoutMs);
    } catch (error) {
      cleanupErrors.push(error);
    }
  };
  await cleanup("Owned Chrome cleanup", terminateChrome, 10_000);
  await cleanup("CDP websocket close", () => cdp?.close(), 2_000);
  await cleanup("HTTP server close", async () => {
    if (server?.listening) {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    if (process.env.COVA_QA_HANG_SERVER_CLOSE === "true") await new Promise(() => {});
  });
  await cleanup("Vite close", () => vite?.close(), 5_000);
  await cleanup("HTTP port closure", () => confirmPortClosed(serverPort), 2_000);
  await cleanup("Chrome profile removal", async () => {
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    }
  }, 5_000);
  if (process.env.COVA_QA_INJECT_CLEANUP_ERROR === "true") cleanupErrors.push(new Error("QA_INJECTED_CLEANUP_ERROR"));
  const errors = [...(primaryError ? [primaryError] : []), ...cleanupErrors];
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Recovery callback browser probe failed.");
}
