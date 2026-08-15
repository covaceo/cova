import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = process.env.COVA_URL;
assert.ok(origin, "COVA_URL is required.");
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const passportCapturePath = process.env.COVA_PASSPORT_CAPTURE || "";
const profileDir = await mkdtemp(join(tmpdir(), "cova-dashboard-browser-"));
const downloadDir = join(profileDir, "downloads");
await mkdir(downloadDir, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-port=0",
  `--user-data-dir=${profileDir}`,
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
let cdp;
let stderr = "";
chrome.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

async function waitForChromeExit(timeoutMs = 5_000) {
  const started = Date.now();
  while (chrome.exitCode === null && Date.now() - started < timeoutMs) await sleep(50);
  return chrome.exitCode !== null;
}

async function terminateChrome() {
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

async function removeProfile() {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
      return;
    } catch (error) {
      lastError = error;
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastError;
}

async function waitForDevToolsActivePort(timeoutMs = 10_000) {
  const path = join(profileDir, "DevToolsActivePort");
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    if (chrome.exitCode !== null) throw new Error(`Owned Chrome exited before DevTools was ready (${chrome.exitCode}).\n${stderr}`);
    try {
      const [portLine] = (await readFile(path, "utf8")).split(/\r?\n/);
      const port = Number(portLine);
      if (Number.isInteger(port) && port > 0) return port;
    } catch (error) {
      lastError = error;
    }
    await sleep(75);
  }
  throw lastError || new Error("DevToolsActivePort was not published.");
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
    ws.addEventListener("open", () => resolveConnect({
      send(method, params = {}) {
        const callId = ++id;
        ws.send(JSON.stringify({ id: callId, method, params }));
        return new Promise((resolve, reject) => pending.set(callId, { method, resolve, reject }));
      },
      close() { ws.close(); },
    }), { once: true });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
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

async function waitFor(expression, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await sleep(75);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function waitForDownloadedPng(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const files = (await readdir(downloadDir)).filter((name) => name.endsWith(".png") && !name.endsWith(".crdownload"));
    if (files.length) {
      const path = join(downloadDir, files[0]);
      const bytes = await readFile(path);
      if (bytes.length > 24 && bytes.subarray(1, 4).toString("ascii") === "PNG") {
        return { path, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), size: bytes.length };
      }
    }
    await sleep(100);
  }
  throw new Error("Passport PNG download did not complete.");
}

async function setViewport(width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: width < 768 ? 2 : 1,
    mobile: width < 768,
    screenWidth: width,
    screenHeight: height,
  });
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: width < 768 });
}

async function openDashboard(width, height) {
  await setViewport(width, height);
  const session = {
    email: "preview@cova.local",
    mode: "login",
    plan: "free",
    signedInAt: new Date().toISOString(),
    source: "local-preview",
    subscriptionStatus: "preview",
  };
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardBrowser=${width}x${height}-${Date.now()}#overview` });
  await waitFor("document.readyState === 'complete'");
  await evaluate(`localStorage.setItem('cova-auth-session-v1', ${JSON.stringify(JSON.stringify(session))})`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardBrowser=${width}x${height}-${Date.now()}#dashboard` });
  await waitFor("document.querySelector('.dashboard-workspace') && document.querySelector('.workspace-shell')", 30_000);
  await sleep(250);
  assert.equal(await evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth"), 0, `${width}x${height} must not overflow horizontally`);
}

async function pricingColorState(width, height) {
  await setViewport(width, height);
  await cdp.send("Page.navigate", { url: `${origin}/?pricingColor=${width}x${height}-${Date.now()}#pricing` });
  await waitFor("document.querySelector('.plan-card-pro') && document.querySelector('.plan-card-pro .plan-primary-action')", 30_000);
  await sleep(250);
  assert.equal(await evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth"), 0, `${width}x${height} pricing must not overflow horizontally`);

  const state = await evaluate(`(() => {
    const read = (selector) => {
      const node = document.querySelector(selector);
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, backgroundImage: style.backgroundImage, border: style.borderColor, color: style.color };
    };
    return {
      card: read('.plan-card-pro'),
      action: read('.plan-card-pro .plan-primary-action'),
      badge: read('.plan-card-pro .plan-card-badge'),
      freeBadge: read('.plan-card-free .plan-card-badge'),
      recommendation: read('.plan-card-pro .plan-recommendation-tab'),
      feature: read('.plan-card-pro .plan-feature-icon-pro'),
    };
  })()`);

  assert.equal(state.card.border, "rgba(79, 125, 255, 0.3)", `${width}px Pro card must use the Cobalt Market border`);
  assert.match(state.card.backgroundImage, /rgba\(79, 125, 255, 0\.14\)/, `${width}px Pro card must use a restrained cobalt material glow`);
  assert.doesNotMatch(JSON.stringify(state), /(?:168, 239, 211|185, 245, 223|172, 109, 65|239, 184, 141)/, `${width}px pricing must not retain mint or copper chrome`);
  assert.deepEqual(state.action, {
    background: "rgb(79, 125, 255)",
    backgroundImage: "none",
    border: "rgba(111, 150, 255, 0.72)",
    color: "rgb(7, 10, 18)",
  });
  assert.deepEqual(state.recommendation, {
    background: "rgb(79, 125, 255)",
    backgroundImage: "none",
    border: "rgba(111, 150, 255, 0.7)",
    color: "rgb(7, 10, 18)",
  });
  assert.equal(state.badge.color, "rgb(111, 150, 255)");
  assert.equal(state.freeBadge.color, "rgb(170, 180, 189)");
  assert.deepEqual(state.feature, {
    background: "rgba(79, 125, 255, 0.08)",
    backgroundImage: "none",
    border: "rgba(79, 125, 255, 0.34)",
    color: "rgb(111, 150, 255)",
  });

  await evaluate("document.activeElement?.blur()");
  let actionFocused = false;
  for (let step = 0; step < 20; step += 1) {
    await press("Tab");
    actionFocused = await evaluate("document.activeElement?.matches('.plan-card-pro .plan-primary-action')");
    if (actionFocused) break;
  }
  assert.equal(actionFocused, true, `${width}px keyboard order must reach the pricing action`);
  const focus = await evaluate(`(() => { const style = getComputedStyle(document.activeElement); return style.outline; })()`);
  assert.match(focus, /rgb\(79, 125, 255\).*2px/, `${width}px pricing action focus must use cobalt`);
}

async function press(key, code = key) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
  await sleep(80);
}

async function desktopVisualState() {
  await openDashboard(1440, 900);
  const base = await evaluate(`(() => {
    const active = document.querySelector('.workspace-sidebar-link-active');
    const rect = active.getBoundingClientRect();
    const style = getComputedStyle(active);
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, background: style.backgroundColor, border: style.borderColor };
  })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: base.x, y: base.y });
  await sleep(220);
  const hovered = await evaluate(`(() => {
    const active = document.querySelector('.workspace-sidebar-link-active');
    const style = getComputedStyle(active);
    return { background: style.backgroundColor, border: style.borderColor };
  })()`);
  assert.equal(hovered.background, "rgba(0, 0, 0, 0)", "Option A must remain transparent while active+hovered");
  assert.equal(hovered.border, "rgba(0, 0, 0, 0)", "Option A must remain outline-free while active+hovered");

  await evaluate("document.querySelector('.workspace-sidebar-search input').focus()");
  await press("Tab");
  const focus = await evaluate(`(() => {
    const active = document.activeElement;
    const style = getComputedStyle(active);
    return { className: active.className, focusVisible: active.matches(':focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor };
  })()`);
  assert.match(focus.className, /workspace-sidebar-link/, "Tab from workspace search must reach a route control");
  assert.equal(focus.focusVisible, true, "workspace route must match :focus-visible during keyboard navigation");
  assert.deepEqual({ style: focus.outlineStyle, width: focus.outlineWidth, color: focus.outlineColor }, { style: "solid", width: "2px", color: "rgb(79, 125, 255)" });

  const microcopy = await evaluate(`(() => ({
    account: getComputedStyle(document.querySelector('.workspace-account-copy small')).color,
    disclosure: getComputedStyle(document.querySelector('.workspace-sidebar-watermark span')).color,
    range: getComputedStyle(document.querySelector('.dashboard-range-controls button:not(.dashboard-range-active)')).color,
    summary: getComputedStyle(document.querySelector('.dashboard-summary-cell span')).color,
    description: getComputedStyle(document.querySelector('.dashboard-instrument-header p')).color,
    review: getComputedStyle(document.querySelector('.dashboard-review-disclosure')).color,
  }))()`);
  for (const [label, color] of Object.entries(microcopy)) {
    assert.ok(color.endsWith(", 0.5)"), `${label} microcopy must use the independently verified AA alpha, received ${color}`);
  }
  const reviewCopy = await evaluate("document.querySelector('.dashboard-workspace').innerText");
  assert.match(reviewCopy, /Reported P&L/i, "compiled Risk Desk must expose provider-neutral reported P&L");
  assert.doesNotMatch(reviewCopy, /Net P&L|imported trade history/i, "compiled Risk Desk must not misstate gross provider values or sample history");

  const scopedStateKey = await evaluate("Object.keys(localStorage).find((key) => key.startsWith('cova-react-risk-os-v2:'))");
  assert.ok(scopedStateKey, "authenticated preview must have an identity-scoped workspace state key");
  await evaluate(`localStorage.setItem(${JSON.stringify(scopedStateKey)}, JSON.stringify({ trades: [], rules: [], practiceReps: [] }))`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardEmpty=${Date.now()}#dashboard` });
  await waitFor("document.querySelector('.dashboard-workspace') && document.querySelector('.dashboard-summary-strip')");
  const emptyReview = await evaluate(`(() => {
    const cells = Object.fromEntries([...document.querySelectorAll('.dashboard-summary-cell')].map((cell) => [cell.querySelector('span').textContent.trim(), cell.querySelector('strong').textContent.trim()]));
    return { warnings: cells.Warnings, action: document.querySelector('.dashboard-summary-primary').textContent.trim() };
  })()`);
  assert.deepEqual(emptyReview, { warnings: "0", action: "Add trade history" }, "compiled empty history must show zero warnings and the truthful import action");
  await evaluate(`localStorage.removeItem(${JSON.stringify(scopedStateKey)})`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardRestore=${Date.now()}#dashboard` });
  await waitFor("document.querySelector('.dashboard-workspace') && document.querySelectorAll('.dashboard-summary-cell')[3]?.querySelector('strong')?.textContent.trim() !== '0'");

  await cdp.send("Page.navigate", { url: `${origin}/?dashboardDesktopOauth=${Date.now()}#oauth` });
  await waitFor("location.hash === '#oauth' && document.querySelector('.workspace-sidebar')");
  const desktopOauth = await evaluate(`(() => { const current = [...document.querySelectorAll('.workspace-sidebar [aria-current="page"]')]; return { count: current.length, text: current[0]?.textContent.trim() }; })()`);
  assert.deepEqual(desktopOauth, { count: 1, text: "Trade History" }, "desktop OAuth must retain Trade History current-route state");
}

async function collapsedWorkspace(width, height) {
  await openDashboard(width, height);
  const chrome = await evaluate(`(() => {
    const visible = (selector) => { const node = document.querySelector(selector); if (!node) return false; const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.display !== 'none' && rect.width > 0 && rect.height > 0; };
    return { rail: visible('.workspace-sidebar'), desktop: visible('.workspace-top-header .marketing-header'), brand: visible('.workspace-top-header .header-mobile-brand'), toggle: visible('.workspace-top-header .operator-mobile-menu-toggle') };
  })()`);
  assert.deepEqual(chrome, { rail: false, desktop: false, brand: true, toggle: true }, `${width}px must use only collapsed workspace chrome`);

  await evaluate("document.activeElement?.blur()");
  await press("Tab");
  await press("Tab");
  const toggleFocus = await evaluate(`(() => { const node = document.activeElement; const style = getComputedStyle(node); return { toggle: node.matches('.operator-mobile-menu-toggle'), focusVisible: node.matches(':focus-visible'), outline: style.outline, expanded: node.getAttribute('aria-expanded'), controls: node.getAttribute('aria-controls') }; })()`);
  assert.equal(toggleFocus.toggle, true, `${width}px keyboard order must reach the menu toggle`);
  assert.equal(toggleFocus.focusVisible, true);
  assert.match(toggleFocus.outline, /rgb\(79, 125, 255\).*2px/);
  assert.equal(toggleFocus.expanded, "false");
  assert.equal(toggleFocus.controls, "operator-mobile-menu");
  const toggleRect = await evaluate(`(() => { const rect = document.querySelector('.operator-mobile-menu-toggle').getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: toggleRect.x, y: toggleRect.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: toggleRect.x, y: toggleRect.y, button: "left", clickCount: 1 });
  await waitFor("document.querySelector('.operator-mobile-menu-toggle').getAttribute('aria-expanded') === 'true' && document.querySelector('#operator-mobile-menu')");
  await press("Tab");
  const menu = await evaluate(`(() => {
    const panel = document.querySelector('#operator-mobile-menu');
    const current = [...panel.querySelectorAll('[aria-current="page"]')];
    const inactive = panel.querySelector('.operator-mobile-menu-link-inactive');
    const active = current[0];
    const activeStyle = getComputedStyle(active);
    const inactiveStyle = getComputedStyle(inactive);
    const del = panel.querySelector('.operator-mobile-delete-account');
    const rect = del.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button');
    const focusStyle = getComputedStyle(document.activeElement);
    return {
      panelRole: panel.getAttribute('role'), panelLabel: panel.getAttribute('aria-label'), currentCount: current.length, currentText: active?.textContent.trim(),
      activeWeight: activeStyle.fontWeight, activeShadow: activeStyle.textShadow, activeBackground: activeStyle.backgroundColor, inactiveWeight: inactiveStyle.fontWeight,
      focusedCurrent: document.activeElement === active, focusVisible: document.activeElement.matches(':focus-visible'), focusOutline: focusStyle.outline,
      deleteVisible: rect.top >= 0 && rect.bottom <= innerHeight && rect.height >= 24, deleteHit: hit === del,
    };
  })()`);
  assert.equal(menu.panelRole, "navigation");
  assert.equal(menu.panelLabel, "Workspace navigation");
  assert.equal(menu.currentCount, 1);
  assert.equal(menu.currentText, "Dashboard");
  assert.ok(Number(menu.activeWeight) > Number(menu.inactiveWeight));
  assert.notEqual(menu.activeShadow, "none");
  assert.equal(menu.activeBackground, "rgba(0, 0, 0, 0)", "collapsed Option A state must remain containerless");
  assert.equal(menu.focusedCurrent, true);
  assert.equal(menu.focusVisible, true);
  assert.match(menu.focusOutline, /rgb\(79, 125, 255\).*2px/);
  assert.equal(menu.deleteVisible, true, `${width}px Delete account must remain visible`);
  assert.equal(menu.deleteHit, true, `${width}px Delete account must receive pointer hit testing`);

  await cdp.send("Page.navigate", { url: `${origin}/?dashboardOauth=${width}x${height}-${Date.now()}#oauth` });
  await waitFor("location.hash === '#oauth' && document.querySelector('.workspace-shell')", 30_000);
  await evaluate("document.querySelector('.operator-mobile-menu-toggle').click(); true");
  await waitFor("document.querySelector('.operator-mobile-menu-toggle').getAttribute('aria-expanded') === 'true' && document.querySelector('#operator-mobile-menu')");
  const oauthCurrent = await evaluate(`(() => { const current = [...document.querySelectorAll('#operator-mobile-menu [aria-current="page"]')]; return { count: current.length, text: current[0]?.textContent.trim(), active: current[0]?.classList.contains('operator-mobile-menu-link-active') }; })()`);
  assert.deepEqual(oauthCurrent, { count: 1, text: "Link account", active: true }, `${width}x${height} OAuth must retain Link account current-route state`);
}

async function passportExportTruth() {
  await setViewport(1440, 1000);
  await evaluate(`(() => { const key = 'cova-auth-session-v1'; const session = JSON.parse(localStorage.getItem(key)); localStorage.setItem(key, JSON.stringify({ ...session, plan: 'pro', subscriptionStatus: 'active' })); })()`);
  const scopedStateKey = await evaluate("Object.keys(localStorage).find((key) => key.startsWith('cova-react-risk-os-v2:'))");
  assert.ok(scopedStateKey, "Passport zero-score proof requires the identity-scoped workspace state key");
  await evaluate(`localStorage.setItem(${JSON.stringify(scopedStateKey)}, JSON.stringify({ trades: [], rules: [], practiceReps: [] }))`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardPassportZero=${Date.now()}#passport` });
  await waitFor("document.querySelector('.passport-card-face') && [...document.querySelectorAll('.passport-mode-row')].some((button) => button.textContent.includes('Ghost'))", 30_000);
  await evaluate("[...document.querySelectorAll('.passport-mode-row')].find((button) => button.textContent.includes('Ghost')).click(); true");
  await waitFor("document.querySelector('.passport-profile-hero-stat span')?.textContent.trim() === 'Score range'");
  const ghostZero = await evaluate(`(() => { const stat = document.querySelector('.passport-profile-hero-stat'); return { label: stat.querySelector('span').textContent.trim(), value: stat.querySelector('strong').textContent.trim() }; })()`);
  assert.deepEqual(ghostZero, { label: "Score range", value: "0+" }, "Passport Ghost mode must preserve a valid score of zero instead of rendering Hidden");
  await evaluate(`localStorage.removeItem(${JSON.stringify(scopedStateKey)})`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardPassport=${Date.now()}#passport` });
  await waitFor("document.querySelector('.passport-card-face') && [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Download PNG'))", 30_000);
  await evaluate("[...document.querySelectorAll('.passport-mode-row')].find((button) => button.textContent.includes('Flex')).click(); true");
  await waitFor("document.querySelector('.passport-profile-hero-stat span')?.textContent.trim() === 'Reported P&L'");
  await sleep(500);
  const copy = await evaluate(`(() => ({ card: document.querySelector('.passport-card-face').innerText, workbench: document.querySelector('.passport-workbench').innerText }))()`);
  assert.match(copy.card, /Reported P&L/i, "live Passport Flex card must use provider-neutral P&L wording");
  assert.doesNotMatch(copy.workbench, /Net P&L/i, "Passport card and privacy controls must not call reported provider P&L net");
  await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Download PNG')).click(); true");
  const png = await waitForDownloadedPng();
  assert.deepEqual({ width: png.width, height: png.height }, { width: 1080, height: 1350 }, "Passport feed export must retain exact 4:5 dimensions");
  assert.ok(png.size > 10_000, "Passport PNG export must contain rendered card pixels");
  if (passportCapturePath) await copyFile(png.path, passportCapturePath);
}

async function shortHeight(height) {
  await openDashboard(1440, height);
  const state = await evaluate(`(() => {
    const rail = document.querySelector('.workspace-sidebar');
    const account = document.querySelector('.workspace-account-menu');
    const nav = document.querySelector('.workspace-sidebar-nav');
    const railRect = rail.getBoundingClientRect();
    const accountRect = account.getBoundingClientRect();
    const buttons = [...document.querySelectorAll('.workspace-account-actions button')].map((button) => {
      const rect = button.getBoundingClientRect();
      const top = Math.max(rect.top, railRect.top, accountRect.top, 0);
      const bottom = Math.min(rect.bottom, railRect.bottom, accountRect.bottom, innerHeight);
      const visibleHeight = Math.max(0, bottom - top);
      const x = rect.left + rect.width / 2;
      const y = top + visibleHeight / 2;
      return { label: button.textContent.trim(), rect: { top: rect.top, bottom: rect.bottom, height: rect.height }, visibleHeight, hit: document.elementFromPoint(x, y)?.closest('button') === button };
    });
    return { rail: { top: railRect.top, bottom: railRect.bottom }, account: { top: accountRect.top, bottom: accountRect.bottom, shrink: getComputedStyle(account).flexShrink }, nav: { scrollHeight: nav.scrollHeight, clientHeight: nav.clientHeight }, buttons };
  })()`);
  assert.deepEqual(state.rail, { top: 0, bottom: height });
  assert.equal(state.account.shrink, "0");
  assert.ok(state.account.bottom <= height + 0.5, `${height}px account menu must stay inside the rail`);
  for (const button of state.buttons) {
    assert.ok(button.visibleHeight >= 24, `${height}px ${button.label} must retain at least 24px visible height`);
    assert.equal(button.hit, true, `${height}px ${button.label} must pass center hit testing`);
  }
}

try {
  const port = await waitForDevToolsActivePort();
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  assert.ok(page, "No page target available.");
  cdp = await connectCdp(page.webSocketDebuggerUrl);
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable")]);
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });

  for (const [width, height] of [[1440, 900], [390, 844]]) await pricingColorState(width, height);
  await desktopVisualState();
  for (const [width, height] of [[1023, 900], [800, 900], [390, 844], [390, 640]]) await collapsedWorkspace(width, height);
  await passportExportTruth();
  for (const height of [760, 625, 520, 400]) await shortHeight(height);
  console.log("dashboard-browser-regression: pricing color roles, active hover/focus, AA microcopy, collapsed lifecycle semantics, and short-height account controls passed");
} finally {
  await terminateChrome().catch(() => {});
  cdp?.close();
  await removeProfile();
}
