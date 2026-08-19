import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profileDir = await mkdtemp(join(tmpdir(), "cova-checkout-profile-"));
const screenshotDir = await mkdtemp(join(tmpdir(), "cova-checkout-proof-"));
const desktopScreenshot = join(screenshotDir, "checkout-desktop.png");
const activeScreenshot = join(screenshotDir, "checkout-pro-active.png");
const mobileScreenshot = join(screenshotDir, "checkout-mobile.png");
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
    VITE_SUPABASE_ANON_KEY: "sb_publishable_checkout_browser_regression",
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

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const accessToken = `${base64UrlJson({ alg: "HS256", typ: "JWT" })}.${base64UrlJson({
  aud: "authenticated",
  exp: 4_102_444_800,
  iat: 1_787_000_000,
  role: "authenticated",
  session_id: "checkout-browser-session",
  sub: "11111111-1111-4111-8111-111111111111",
})}.checkout-browser-signature`;
const storedSession = {
  access_token: accessToken,
  expires_at: 4_102_444_800,
  expires_in: 2_315_444_800,
  refresh_token: "checkout-browser-refresh-token",
  token_type: "bearer",
  user: {
    app_metadata: { plan: "free", provider: "email", providers: ["email"] },
    aud: "authenticated",
    email: "qa-checkout@cova.test",
    id: "11111111-1111-4111-8111-111111111111",
    role: "authenticated",
    user_metadata: {},
  },
};

let cdp;
let desktopState;
let activeState;
let mobileState;
try {
  const fixtureUrl = `http://127.0.0.1:${port}/scripts/fixtures/checkout-browser.html`;
  await waitForHttp(fixtureUrl);
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
  const waitFor = async (expression, timeoutMs = 12_000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
      await sleep(50);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  const waitForEvent = async (method, predicate, startIndex = 0, timeoutMs = 12_000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const event = cdp.events.slice(startIndex).find((candidate) => candidate.method === method && predicate(candidate.params || {}));
      if (event) return event;
      await sleep(40);
    }
    throw new Error(`Timed out waiting for ${method}`);
  };
  const screenshot = async (path) => {
    const result = await send("Page.captureScreenshot", { captureBeyondViewport: true, format: "png", fromSurface: true });
    await writeFile(path, Buffer.from(result.data, "base64"));
  };

  await Promise.all([
    send("Page.enable"),
    send("Runtime.enable"),
    send("Log.enable"),
    send("Network.enable"),
    send("Fetch.enable", {
      patterns: [
        { requestStage: "Request", urlPattern: "https://checkout.stripe.com/*" },
        { requestStage: "Request", urlPattern: "https://billing.stripe.com/*" },
      ],
    }),
  ]);
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    if (!location.hostname.endsWith('127.0.0.1')) return;
    localStorage.setItem('cova-supabase-auth-v1', ${JSON.stringify(JSON.stringify(storedSession))});
    const nativeFetch = window.fetch.bind(window);
    window.__covaCheckoutPlan = new URL(location.href).searchParams.get('checkout') === 'success' ? 'pro' : 'free';
    window.__covaCheckoutRequests = [];
    window.fetch = async (input, init = {}) => {
      const url = String(input?.url || input || '');
      const requestInit = input instanceof Request ? input : null;
      const headers = Object.fromEntries(new Headers(init.headers || requestInit?.headers || {}).entries());
      const method = String(init.method || requestInit?.method || 'GET').toUpperCase();
      if (url.startsWith('/api/billing/')) {
        window.__covaCheckoutRequests.push({ headers, method, url });
      }
      if (url === '/api/billing/status') {
        const pro = window.__covaCheckoutPlan === 'pro';
        return new Response(JSON.stringify({ currentPeriodEnd: pro ? 4102444800 : null, plan: pro ? 'pro' : 'free', subscriptionStatus: pro ? 'active' : 'none' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === '/api/billing/checkout') {
        return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_browser' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === '/api/billing/portal') {
        return new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/session/test_browser' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return nativeFetch(input, init);
    };
  })();` });

  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false, screenWidth: 1280, screenHeight: 800 });
  await send("Page.navigate", { url: fixtureUrl });
  await waitFor("document.readyState === 'complete' && document.querySelector('#checkout-title')?.textContent === 'Review Cova Pro'");
  await waitFor("window.__covaCheckoutRequests?.some((request) => request.url === '/api/billing/status')");

  desktopState = await evaluate(`(() => {
    const checkbox = document.querySelector('.checkout-consent input');
    const pay = document.querySelector('.checkout-pay');
    const order = document.querySelector('.checkout-order-panel');
    const orderRect = order.getBoundingClientRect();
    return {
      bodyText: document.body.innerText,
      checkboxChecked: checkbox?.checked,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      heading: document.querySelector('#checkout-title')?.textContent?.trim(),
      orderContained: orderRect.left >= 0 && orderRect.right <= innerWidth,
      payDisabled: pay?.disabled,
      payText: pay?.textContent?.trim(),
      viewport: { height: innerHeight, width: innerWidth },
    };
  })()`);
  assert.equal(desktopState.heading, "Review Cova Pro");
  assert.match(desktopState.bodyText, /Order summary/i);
  assert.match(desktopState.bodyText, /\$0/);
  assert.match(desktopState.bodyText, /renews automatically at \$0 \/ month until I cancel/i);
  assert.equal(desktopState.checkboxChecked, false);
  assert.equal(desktopState.payDisabled, true);
  assert.equal(desktopState.documentOverflow, 0);
  assert.equal(desktopState.orderContained, true);

  await evaluate(`document.querySelector('.checkout-consent input').click()`);
  await waitFor("document.querySelector('.checkout-pay')?.disabled === false");
  const checkoutEventStart = cdp.events.length;
  await evaluate(`(() => { setTimeout(() => document.querySelector('.checkout-pay').click(), 0); return true; })()`);
  await waitFor("window.__covaCheckoutRequests?.some((request) => request.url === '/api/billing/checkout')");
  const checkoutPaused = await waitForEvent("Fetch.requestPaused", ({ request }) => request?.url?.startsWith("https://checkout.stripe.com/"), checkoutEventStart);
  await send("Fetch.failRequest", { errorReason: "Aborted", requestId: checkoutPaused.params.requestId });
  const checkoutRequest = await evaluate(`window.__covaCheckoutRequests.find((request) => request.url === '/api/billing/checkout')`);
  assert.equal(checkoutRequest.method, "POST");
  assert.equal(checkoutRequest.headers.authorization, `Bearer ${accessToken}`);
  assert.equal(checkoutPaused.params.request.url, "https://checkout.stripe.com/c/pay/cs_test_browser");
  await screenshot(desktopScreenshot);

  await send("Page.navigate", { url: `${fixtureUrl}?checkout=success` });
  await waitFor("document.body.innerText.includes('Cova Pro is active. Your account is ready.') && document.body.innerText.includes('Pro active')");
  activeState = await evaluate(`(() => ({
    bodyText: document.body.innerText,
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    manageDisabled: document.querySelector('.checkout-active-state button')?.disabled,
    queryCleared: !new URL(location.href).searchParams.has('checkout'),
    statusRequests: window.__covaCheckoutRequests.filter((request) => request.url === '/api/billing/status').length,
  }))()`);
  assert.equal(activeState.queryCleared, true);
  assert.equal(activeState.manageDisabled, false);
  assert.equal(activeState.documentOverflow, 0);
  assert.ok(activeState.statusRequests >= 1);
  await screenshot(activeScreenshot);

  const portalEventStart = cdp.events.length;
  await evaluate(`(() => { setTimeout(() => document.querySelector('.checkout-active-state button').click(), 0); return true; })()`);
  await waitFor("window.__covaCheckoutRequests?.some((request) => request.url === '/api/billing/portal')");
  const portalPaused = await waitForEvent("Fetch.requestPaused", ({ request }) => request?.url?.startsWith("https://billing.stripe.com/"), portalEventStart);
  await send("Fetch.failRequest", { errorReason: "Aborted", requestId: portalPaused.params.requestId });
  const portalRequest = await evaluate(`window.__covaCheckoutRequests.find((request) => request.url === '/api/billing/portal')`);
  assert.equal(portalRequest.method, "POST");
  assert.equal(portalRequest.headers.authorization, `Bearer ${accessToken}`);
  assert.equal(portalPaused.params.request.url, "https://billing.stripe.com/p/session/test_browser");

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.navigate", { url: `${fixtureUrl}?mobile=1` });
  await waitFor("document.querySelector('#checkout-title')?.textContent === 'Review Cova Pro' && document.querySelector('.checkout-pay')");
  mobileState = await evaluate(`(() => {
    const pay = document.querySelector('.checkout-pay');
    const consent = document.querySelector('.checkout-consent');
    const order = document.querySelector('.checkout-order-panel');
    const payRect = pay.getBoundingClientRect();
    const consentRect = consent.getBoundingClientRect();
    const orderRect = order.getBoundingClientRect();
    pay.scrollIntoView({ block: 'center' });
    return {
      consentContained: consentRect.left >= 0 && consentRect.right <= innerWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      orderContained: orderRect.left >= 0 && orderRect.right <= innerWidth,
      payContained: payRect.left >= 0 && payRect.right <= innerWidth,
      payHeight: payRect.height,
      viewport: { height: innerHeight, width: innerWidth },
    };
  })()`);
  assert.equal(mobileState.viewport.width, 390);
  assert.equal(mobileState.documentOverflow, 0);
  assert.equal(mobileState.orderContained, true);
  assert.equal(mobileState.consentContained, true);
  assert.equal(mobileState.payContained, true);
  assert.ok(mobileState.payHeight >= 44);
  await screenshot(mobileScreenshot);

  await sleep(150);
  const requestUrls = new Map();
  for (const event of cdp.events) {
    if (event.method === "Network.requestWillBeSent") requestUrls.set(event.params.requestId, event.params.request?.url || "");
  }
  const isExpectedStripeAbort = (event) => {
    const url = requestUrls.get(event.params?.requestId) || "";
    return url.startsWith("https://checkout.stripe.com/") || url.startsWith("https://billing.stripe.com/");
  };
  const badEvents = cdp.events.filter((event) => (
    event.method === "Runtime.exceptionThrown"
    || (event.method === "Log.entryAdded" && event.params?.entry?.level === "error")
    || (event.method === "Network.loadingFailed" && !event.params?.canceled && !isExpectedStripeAbort(event))
    || (event.method === "Network.responseReceived" && event.params?.response?.status >= 400)
  ));
  assert.deepEqual(badEvents, [], "Rendered checkout regression must finish without unexpected runtime, console, HTTP, or network failures.");

  console.log(JSON.stringify({
    active: { manageDisabled: activeState.manageDisabled, queryCleared: activeState.queryCleared, statusRequests: activeState.statusRequests },
    checkout: { authorization: "Bearer [REDACTED]", method: checkoutRequest.method, redirect: checkoutPaused.params.request.url },
    desktop: { checkboxChecked: desktopState.checkboxChecked, overflow: desktopState.documentOverflow, payDisabledBeforeAcceptance: desktopState.payDisabled, viewport: desktopState.viewport },
    mobile: { controlsContained: mobileState.consentContained && mobileState.payContained, overflow: mobileState.documentOverflow, viewport: mobileState.viewport },
    portal: { authorization: "Bearer [REDACTED]", method: portalRequest.method, redirect: portalPaused.params.request.url },
    screenshots: [desktopScreenshot, activeScreenshot, mobileScreenshot],
  }, null, 2));
  console.log("checkout-browser-regression: $0 direct purchase, bearer-bound Stripe redirect, webhook-confirmed Pro state, billing portal, and 390px containment passed");
} finally {
  await terminate(chrome, cdp).catch(() => {});
  cdp?.close();
  await terminate(vite).catch(() => {});
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}
