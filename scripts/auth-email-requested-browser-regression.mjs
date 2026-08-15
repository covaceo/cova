import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profileDir = await mkdtemp(join(tmpdir(), "cova-auth-email-requested-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

const port = await reservePort();
const viteCli = join(root, "node_modules", "vite", "bin", "vite.js");
const vite = spawn(process.execPath, [viteCli, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  env: {
    ...process.env,
    VITE_ENABLE_DEMO_PREVIEW: "false",
    VITE_SUPABASE_URL: "https://auth.test.invalid",
    VITE_SUPABASE_ANON_KEY: "sb_publishable_browser_regression",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-port=0",
  `--user-data-dir=${profileDir}`,
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
let viteOutput = "";
let chromeOutput = "";
vite.stdout.on("data", (chunk) => { viteOutput += chunk.toString(); });
vite.stderr.on("data", (chunk) => { viteOutput += chunk.toString(); });
chrome.stderr.on("data", (chunk) => { chromeOutput += chunk.toString(); });

async function waitForHttp(url, timeoutMs = 20_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    if (vite.exitCode !== null) throw new Error(`Vite exited early (${vite.exitCode}). ${viteOutput}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function waitForDevToolsActivePort(timeoutMs = 10_000) {
  const path = join(profileDir, "DevToolsActivePort");
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited early (${chrome.exitCode}). ${chromeOutput}`);
    try {
      const [portLine] = (await readFile(path, "utf8")).split(/\r?\n/);
      const value = Number(portLine);
      if (Number.isInteger(value) && value > 0) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(75);
  }
  throw lastError || new Error("Chrome did not publish DevToolsActivePort.");
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
        return new Promise((resolveCall, rejectCall) => pending.set(callId, { method, resolveCall, rejectCall }));
      },
      close() { ws.close(); },
    }), { once: true });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) {
        events.push(message);
        return;
      }
      const callback = pending.get(message.id);
      if (!callback) return;
      pending.delete(message.id);
      if (message.error) callback.rejectCall(new Error(`${callback.method}: ${message.error.message}`));
      else callback.resolveCall(message.result || {});
    });
    ws.addEventListener("error", reject, { once: true });
  });
}

async function terminate(processHandle, client) {
  if (client && processHandle === chrome && processHandle.exitCode === null) {
    await Promise.race([client.send("Browser.close").catch(() => {}), sleep(500)]);
    await sleep(300);
  }
  if (processHandle.exitCode !== null) return;
  if (process.platform === "win32" && processHandle.pid) {
    await new Promise((resolve) => execFile("taskkill.exe", ["/PID", String(processHandle.pid), "/T", "/F"], () => resolve()));
  } else {
    processHandle.kill("SIGTERM");
  }
}

let cdp;
try {
  await waitForHttp(`http://127.0.0.1:${port}/scripts/fixtures/auth-email-requested.html`);
  const cdpPort = await waitForDevToolsActivePort();
  const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  assert.ok(page, `No Chrome page target. ${chromeOutput}`);
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
      if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
      await sleep(40);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };

  await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Log.enable"), send("Network.enable")]);
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__covaAuthMockRequests = [];
    window.fetch = async (input, init) => {
      const url = String(input?.url || input || '');
      if (url.startsWith('https://auth.test.invalid/auth/v1/signup')) {
        window.__covaAuthMockRequests.push({ path: '/auth/v1/signup', method: init?.method || input?.method || 'POST' });
        return new Response(JSON.stringify({
          id: 'obfuscated-existing-user',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'qa@example.com',
          phone: '',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          identities: [],
          created_at: '2026-08-15T00:00:00.000Z',
          updated_at: '2026-08-15T00:00:00.000Z',
          confirmation_sent_at: '2026-08-15T00:00:00.000Z'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === 'https://auth.test.invalid/auth/v1/resend') {
        window.__covaAuthMockRequests.push({ path: '/auth/v1/resend', method: init?.method || input?.method || 'POST' });
        return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return nativeFetch(input, init);
    };
  })();` });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 640, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 640 });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.navigate", { url: `http://cova.localhost:${port}/scripts/fixtures/auth-email-requested.html` });
  await waitFor("document.readyState === 'complete' && document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Sign up to Cova'", 20_000);

  const email = "qa-existing@cova.test";
  const submitSignup = async () => {
    await evaluate(`(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const emailInput = dialog.querySelector('#auth-email');
      const passwordInput = dialog.querySelector('#auth-password');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(emailInput, '${email}');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(passwordInput, 'BrowserRegression!23456789');
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => emailInput.closest('form').requestSubmit(), 25);
      return true;
    })()`);
    await waitFor("document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Check your email'");
    await sleep(120);
  };

  await submitSignup();
  const requested = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const overlay = dialog.parentElement;
    const rect = dialog.getBoundingClientRect();
    const closeRect = dialog.querySelector('button[aria-label="Close"]').getBoundingClientRect();
    const labels = [...dialog.querySelectorAll('button')].map((button) => button.textContent.trim());
    return {
      eyebrow: dialog.querySelector('p')?.textContent.trim(),
      text: dialog.innerText,
      labels,
      requests: window.__covaAuthMockRequests,
      focusedHeading: document.activeElement === dialog.querySelector('h2'),
      widthContained: rect.left >= 0 && rect.right <= innerWidth,
      closeVisible: closeRect.top >= 0 && closeRect.bottom <= innerHeight && closeRect.left >= 0 && closeRect.right <= innerWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      overlayOverflow: overlay.scrollWidth - overlay.clientWidth,
    };
  })()`);
  assert.equal(requested.eyebrow, "Email requested");
  assert.match(requested.text, /If this email can receive a verification link/);
  assert.match(requested.text, /If nothing arrives, sign in or reset your password instead/);
  assert.ok(requested.labels.includes("Sign in instead") && requested.labels.includes("Reset password") && requested.labels.includes("Use another email"));
  assert.deepEqual(requested.requests, [{ path: "/auth/v1/signup", method: "POST" }]);
  assert.equal(requested.focusedHeading, true, "Email-request heading must receive focus after the async state transition");
  assert.equal(requested.widthContained, true);
  assert.equal(requested.closeVisible, true);
  assert.equal(requested.documentOverflow, 0);
  assert.equal(requested.overlayOverflow, 0);

  await evaluate(`(() => { [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === 'Sign in instead').click(); return true; })()`);
  await waitFor("document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Sign in to Cova' && document.activeElement?.id === 'auth-email'");
  const signIn = await evaluate(`(() => ({ email: document.querySelector('#auth-email')?.value, activeId: document.activeElement?.id }))()`);
  assert.deepEqual(signIn, { email, activeId: "auth-email" }, "Sign-in recovery must preserve the email and focus its field");

  await evaluate(`(() => { [...document.querySelectorAll('[aria-label="Account access"] button')].find((button) => button.textContent.trim() === 'Sign up').click(); return true; })()`);
  await waitFor("document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Sign up to Cova'");
  await submitSignup();
  await evaluate(`(() => { [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === 'Reset password').click(); return true; })()`);
  await waitFor("document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Reset Cova password' && document.activeElement?.id === 'auth-email'");
  const reset = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const rect = dialog.getBoundingClientRect();
    return {
      email: dialog.querySelector('#auth-email')?.value,
      activeId: document.activeElement?.id,
      heading: dialog.querySelector('h2')?.textContent.trim(),
      widthContained: rect.left >= 0 && rect.right <= innerWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);
  assert.deepEqual(reset, { email, activeId: "auth-email", heading: "Reset your password", widthContained: true, overflow: 0 }, "Reset recovery must preserve email, focus, dialog name, and phone containment");

  if (process.env.AUTH_EMAIL_REQUESTED_SCREENSHOT) {
    await evaluate(`(() => { [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === 'Back to sign in').click(); return true; })()`);
    await waitFor("document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Sign in to Cova'");
    await evaluate(`(() => { [...document.querySelectorAll('[aria-label="Account access"] button')].find((button) => button.textContent.trim() === 'Sign up').click(); return true; })()`);
    await waitFor("document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Sign up to Cova'");
    await submitSignup();
    const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(process.env.AUTH_EMAIL_REQUESTED_SCREENSHOT, Buffer.from(screenshot.data, "base64"));
  }

  const badEvents = cdp.events.filter((message) => message.method === "Runtime.exceptionThrown" || (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") || (message.method === "Network.loadingFailed" && !message.params?.canceled));
  assert.deepEqual(badEvents, [], "Rendered auth email-request regression must finish without runtime, console, or network failures");
  console.log("auth-email-requested-browser-regression: obfuscated signup, truthful copy, sign-in/reset recovery, focus, and 390x640 containment passed");
} finally {
  await terminate(chrome, cdp).catch(() => {});
  cdp?.close();
  await terminate(vite).catch(() => {});
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}
