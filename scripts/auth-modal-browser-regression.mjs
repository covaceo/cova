import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const origin = process.env.COVA_URL || "http://127.0.0.1:4173";
const profileDir = await mkdtemp(join(tmpdir(), "cova-auth-browser-"));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-port=0",
  `--user-data-dir=${profileDir}`,
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let stderr = "";
chrome.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

async function waitForDevToolsActivePort(timeoutMs = 10_000) {
  const activePortPath = join(profileDir, "DevToolsActivePort");
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    if (chrome.exitCode !== null) throw new Error(`Owned Chrome exited before publishing DevToolsActivePort (${chrome.exitCode}). ${stderr}`);
    try {
      const [portLine] = (await readFile(activePortPath, "utf8")).split(/\r?\n/);
      const port = Number(portLine);
      if (Number.isInteger(port) && port > 0 && port < 65_536) return port;
      lastError = new Error(`Invalid DevToolsActivePort value: ${portLine}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(75);
  }
  throw lastError || new Error("Owned Chrome did not publish DevToolsActivePort.");
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
    ws.addEventListener("open", () => {
      resolve({
        events,
        send(method, params = {}) {
          const callId = ++id;
          ws.send(JSON.stringify({ id: callId, method, params }));
          return new Promise((resolveCall, rejectCall) => pending.set(callId, { resolveCall, rejectCall, method }));
        },
        close() { ws.close(); },
      });
    }, { once: true });
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

async function waitForChromeExit(timeoutMs = 5_000) {
  const started = Date.now();
  while (chrome.exitCode === null && Date.now() - started < timeoutMs) await sleep(50);
  return chrome.exitCode !== null;
}

async function terminateChrome(cdpClient) {
  if (chrome.exitCode === null && cdpClient) {
    await Promise.race([cdpClient.send("Browser.close").catch(() => {}), sleep(500)]);
    if (await waitForChromeExit(3_000)) return;
  }
  if (chrome.exitCode === null) {
    if (process.platform === "win32" && chrome.pid) {
      await new Promise((resolve, reject) => execFile("taskkill.exe", ["/PID", String(chrome.pid), "/T", "/F"], async (error) => {
        if (!error || await waitForChromeExit(1_000)) resolve();
        else reject(error);
      }));
    } else if (!chrome.kill("SIGTERM")) {
      throw new Error("Owned Chrome process refused SIGTERM.");
    }
  }
  if (!await waitForChromeExit()) throw new Error("Owned Chrome process did not exit after termination.");
}

let cdp;
try {
  const cdpPort = await waitForDevToolsActivePort();
  await waitForJson(`http://127.0.0.1:${cdpPort}/json/version`);
  const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  assert.ok(page, `No Chrome page target. ${stderr}`);
  cdp = await connectCdp(page.webSocketDebuggerUrl);
  const send = cdp.send;
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime exception");
    return result.result.value;
  };
  const waitFor = async (expression, timeoutMs = 7_000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(25);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };

  await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Log.enable"), send("Network.enable")]);
  const viewport = { width: 390, height: 640 };
  await send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 2, mobile: true, screenWidth: viewport.width, screenHeight: viewport.height });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.navigate", { url: `${origin}/?authBrowser=clear#overview` });
  await waitFor("document.readyState === 'complete'");
  await evaluate("localStorage.removeItem('cova-auth-session-v1'); true");
  await send("Page.navigate", { url: `${origin}/?authBrowser=open#overview` });
  await waitFor("document.readyState === 'complete'");
  await evaluate("document.fonts.ready.then(() => true)");
  await waitFor("Array.from(document.querySelectorAll('button')).some((button) => button.offsetParent && button.textContent.trim().toUpperCase() === 'SIGN UP')");
  await sleep(500);

  const opener = await evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('button')).filter((button) => button.offsetParent && button.textContent.trim().toUpperCase() === 'SIGN UP');
    const button = buttons.find((candidate) => { const rect = candidate.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; }) || buttons[0];
    button.dataset.authBrowserOpener = 'true';
    button.focus();
    const rect = button.getBoundingClientRect();
    button.click();
    return { top: rect.top, bottom: rect.bottom, scrollY };
  })()`);
  assert.ok(opener.top >= 0 && opener.bottom <= viewport.height, "Auth opener must begin inside the short-phone viewport.");
  await waitFor("document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]')");
  await sleep(550);

  const open = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    const overlay = dialog.parentElement;
    const close = dialog.querySelector('button[aria-label="Close"]');
    const active = document.activeElement;
    const rect = (node) => { const value = node.getBoundingClientRect(); return { top:value.top,bottom:value.bottom,left:value.left,right:value.right }; };
    const background = Array.from(overlay.parentElement.children).filter((node) => node instanceof HTMLElement && node !== overlay);
    return {
      overlay: { ...rect(overlay), scrollTop: overlay.scrollTop, maxScroll: overlay.scrollHeight - overlay.clientHeight, overscroll: getComputedStyle(overlay).overscrollBehaviorY },
      close: rect(close),
      active: { ariaLabel: active?.getAttribute?.('aria-label') || '', inside: dialog.contains(active), rect: active ? rect(active) : null },
      lock: { rootOverflow: document.documentElement.style.overflow, bodyPosition: document.body.style.position, bodyOverflow: document.body.style.overflow },
      background: { count: background.length, allInert: background.every((node) => node.inert), allHidden: background.every((node) => node.getAttribute('aria-hidden') === 'true') },
      pageScrollY: scrollY,
    };
  })()`);
  assert.equal(open.overlay.scrollTop, 0, "Auth overlay must not auto-scroll away from its close control.");
  assert.equal(open.overlay.overscroll, "contain");
  assert.ok(open.close.top >= 0 && open.close.bottom <= viewport.height && open.close.left >= 0 && open.close.right <= viewport.width, "Auth close control must be visible on a 390x640 viewport.");
  assert.equal(open.active.inside, true);
  assert.equal(open.active.ariaLabel, "Close", "Short-phone initial focus must remain on the visible close control.");
  assert.ok(open.active.rect.top >= 0 && open.active.rect.bottom <= viewport.height);
  assert.deepEqual(open.lock, { rootOverflow: "hidden", bodyPosition: "fixed", bodyOverflow: "hidden" });
  assert.ok(open.background.count > 0 && open.background.allInert && open.background.allHidden, "Auth modal background must remain inert and hidden.");

  const signupControls = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    const email = dialog.querySelector('#auth-email');
    const password = dialog.querySelector('#auth-password');
    const labels = Array.from(dialog.querySelectorAll('button')).map((button) => button.textContent.trim());
    const legal = Array.from(dialog.querySelectorAll('a')).map((link) => ({ text: link.textContent.trim(), target: link.target }));
    const inactiveTab = Array.from(dialog.querySelectorAll('[aria-label="Account access"] button')).find((button) => button.textContent.trim() === 'Sign in');
    return {
      dialogLabel: dialog.getAttribute('aria-label'),
      inactiveTabColor: getComputedStyle(inactiveTab).color,
      email: { type: email?.type, autocomplete: email?.autocomplete },
      password: { type: password?.type, autocomplete: password?.autocomplete, minLength: password?.minLength },
      createAccount: labels.includes('Create account'),
      legal,
    };
  })()`);
  assert.deepEqual(signupControls, {
    dialogLabel: "Sign up to Cova",
    inactiveTabColor: "rgba(255, 255, 255, 0.65)",
    email: { type: "email", autocomplete: "email" },
    password: { type: "password", autocomplete: "new-password", minLength: 8 },
    createAccount: true,
    legal: [{ text: "Terms of Service", target: "_blank" }, { text: "Privacy Policy", target: "_blank" }],
  }, "Signup must expose conventional email, password, account creation, and legal controls.");

  await evaluate(`(() => {
    const tabs = document.querySelector('[aria-label="Account access"]');
    const login = Array.from(tabs.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Sign in');
    login.click();
    return true;
  })()`);
  await waitFor("document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Sign in to Cova'");
  const loginControls = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const password = dialog.querySelector('#auth-password');
    const labels = Array.from(dialog.querySelectorAll('button')).map((button) => button.textContent.trim());
    return { autocomplete: password?.autocomplete, forgot: labels.includes('Forgot password?'), login: labels.includes('Sign in') };
  })()`);
  assert.deepEqual(loginControls, { autocomplete: "current-password", forgot: true, login: true }, "Login must use a current-password field and a normal recovery action.");

  await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Forgot password?').click();
    return true;
  })()`);
  await waitFor("document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Reset Cova password' && document.activeElement?.id === 'auth-email'");
  const recoveryControls = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const labels = Array.from(dialog.querySelectorAll('button')).map((button) => button.textContent.trim());
    return { activeId: document.activeElement?.id, emailType: dialog.querySelector('#auth-email')?.type, send: labels.includes('Send reset link'), back: labels.includes('Back to sign in') };
  })()`);
  assert.deepEqual(recoveryControls, { activeId: "auth-email", emailType: "email", send: true, back: true }, "Forgot-password view must focus its email field and expose a standard reset-link form.");

  await evaluate("document.querySelector('[role=\"dialog\"]').parentElement.scrollTop = document.querySelector('[role=\"dialog\"]').parentElement.scrollHeight");
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 195, y: 610, deltaX: 0, deltaY: 600 });
  await sleep(120);
  assert.equal(await evaluate("scrollY"), open.pageScrollY, "Wheel input at the modal boundary must not scroll the page behind it.");

  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await sleep(100);
  const duringExit = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dialog) return { exists: false };
    const overlay = dialog.parentElement;
    const background = Array.from(overlay.parentElement.children).filter((node) => node instanceof HTMLElement && node !== overlay);
    return { exists: true, activeInside: dialog.contains(document.activeElement), allInert: background.every((node) => node.inert), allHidden: background.every((node) => node.getAttribute('aria-hidden') === 'true') };
  })()`);
  assert.deepEqual(duringExit, { exists: true, activeInside: true, allInert: true, allHidden: true }, "Modal isolation must survive the exit animation.");
  await waitFor("!document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]')", 2_500);
  await sleep(100);
  const closed = await evaluate(`(() => {
    const opener = document.querySelector('[data-auth-browser-opener="true"]');
    return { focused: document.activeElement === opener, rootOverflow: document.documentElement.style.overflow, bodyPosition: document.body.style.position, bodyOverflow: document.body.style.overflow, pageScrollY: scrollY };
  })()`);
  assert.deepEqual(closed, { focused: true, rootOverflow: "", bodyPosition: "", bodyOverflow: "", pageScrollY: opener.scrollY });

  const shortDesktopViewport = { width: 1280, height: 633 };
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 633,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1280,
    screenHeight: 633,
  });

  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await send("Page.navigate", { url: `${origin}/?authBrowser=short-desktop#overview` });
  await waitFor("document.readyState === 'complete'");

  await waitFor("Array.from(document.querySelectorAll('button')).some((button) => button.offsetParent && button.textContent.trim().toUpperCase() === 'SIGN UP')");
  await evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.offsetParent && button.textContent.trim().toUpperCase() === 'SIGN UP').click(); true");
  await waitFor("document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]')");
  await sleep(550);

  const shortDesktop = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const tabs = dialog.querySelector('[aria-label="Account access"]');
    return { dialogTop: dialog.getBoundingClientRect().top, tabsTop: tabs.getBoundingClientRect().top, tabsBottom: tabs.getBoundingClientRect().bottom };
  })()`);

  assert.ok(shortDesktop.dialogTop >= 0, "Short desktop must not center a tall auth card above the viewport.");
  assert.ok(shortDesktop.tabsTop >= 0 && shortDesktop.tabsBottom <= shortDesktopViewport.height, "Short desktop auth tabs must remain visible.");

  if (process.env.AUTH_SCREENSHOT) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1440,
      screenHeight: 900,
    });
    await sleep(300);
    const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(process.env.AUTH_SCREENSHOT, Buffer.from(screenshot.data, "base64"));
  }

  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await waitFor("!document.querySelector('[role=\"dialog\"]')", 2_500);

  await send("Page.navigate", { url: `${origin}/?authBrowser=protected-route#passport` });
  await waitFor("document.readyState === 'complete'");
  await waitFor("document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Sign in to Cova'");
  await evaluate(`(() => {
    const tabs = document.querySelector('[role="dialog"] [aria-label="Account access"]');
    Array.from(tabs.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Sign up').click();
    return true;
  })()`);
  await waitFor("document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Sign up to Cova'");
  await sleep(180);
  const protectedRouteSignup = await evaluate(`(() => ({
    dialogLabel: document.querySelector('[role="dialog"]')?.getAttribute('aria-label'),
    heading: document.querySelector('[role="dialog"] h2')?.textContent.trim(),
  }))()`);
  assert.deepEqual(protectedRouteSignup, { dialogLabel: "Sign up to Cova", heading: "Create your account" }, "Protected-route AuthGate must not reset a user-selected Sign up form back to Sign in after rerender.");

  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await waitFor("!document.querySelector('[role=\"dialog\"]')", 2_500);

  const badEvents = cdp.events.filter((message) => message.method === "Runtime.exceptionThrown" || (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") || (message.method === "Network.loadingFailed" && !message.params?.canceled));
  assert.deepEqual(badEvents, [], "Auth browser regression must finish without runtime, console, or essential network failures.");
  console.log("auth-modal-browser-regression: 390x640 mobile and 1280x633 desktop visibility, classic auth controls, focus, isolation, and restoration passed");
} finally {
  await terminateChrome(cdp);
  cdp?.close();
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}
