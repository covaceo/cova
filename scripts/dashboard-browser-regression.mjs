import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = process.env.COVA_URL;
assert.ok(origin, "COVA_URL is required.");
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const passportCapturePath = process.env.COVA_PASSPORT_CAPTURE || "";
const emptyDashboardCapturePath = process.env.COVA_EMPTY_DASHBOARD_CAPTURE || "";
const emptyDashboardMobileCapturePath = process.env.COVA_EMPTY_DASHBOARD_MOBILE_CAPTURE || "";
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

async function activeLedgerSnapshot() {
  return evaluate(`(() => {
    const identity = localStorage.getItem('cova-active-storage-identity-v1');
    if (!identity || identity === 'signed-out') throw new Error('Missing active account identity');
    const key = 'cova-react-risk-os-v2:' + identity;
    const state = localStorage.getItem(key);
    if (!state) throw new Error('Missing active account ledger');
    return { key, state: JSON.parse(state) };
  })()`);
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
  await evaluate(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('cova-auth-session-v1', ${JSON.stringify(JSON.stringify(session))})`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardBrowser=${width}x${height}-${Date.now()}#dashboard` });
  await waitFor("document.querySelector('.dashboard-workspace') && document.querySelector('.workspace-shell')", 30_000);
  await evaluate("document.fonts.ready");
  await sleep(700);
  assert.equal(await evaluate("document.querySelector('.dashboard-workspace').dataset.astraDashboard"), "integrated", "Must test the compiled Astra candidate");
  assert.equal(await evaluate("innerWidth"), width, "CDP must use the requested CSS viewport");
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
  if (key === "Enter") {
    const event = { key, code, windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
    await cdp.send("Input.dispatchKeyEvent", { ...event, type: "rawKeyDown" });
    await cdp.send("Input.dispatchKeyEvent", { ...event, type: "char", text: String.fromCharCode(13), unmodifiedText: String.fromCharCode(13) });
    await cdp.send("Input.dispatchKeyEvent", { ...event, type: "keyUp" });
  } else {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
  }
  await sleep(80);
}

async function auditMicrocopy() {
  // Native review disclosure is part of the readable contract, not a hidden-node pass.
  await evaluate("document.querySelector('.astra-review-details > summary').scrollIntoView({block:'center',behavior:'instant'}); document.querySelector('.astra-review-details > summary').focus(); true");
  await press("Enter");
  await waitFor("document.querySelector('.astra-review-details').open");
  const checks = await evaluate(`(() => {
    const parse = color => { const parts = color.match(/[\\d.]+/g)?.map(Number); if (!parts || parts.length < 3) throw new Error('Unparseable CSS color: ' + color); return [...parts.slice(0, 3), parts[3] ?? 1]; };
    const composite = (fg, bg) => fg.slice(0, 3).map((value, i) => value * fg[3] + bg[i] * (1 - fg[3]));
    const luminance = color => color.slice(0, 3).map(value => { const n = value / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
    return ['.workspace-account-copy small', '.workspace-sidebar-watermark span', '.dashboard-range-controls button:not(.dashboard-range-active)', '.astra-stat-label', '.astra-stat-detail', '.astra-panel-heading p', '.astra-source-label', '.astra-review-details > summary span', '.dashboard-review-disclosure'].flatMap(selector => {
      const nodes = [...document.querySelectorAll(selector)];
      if (!nodes.length) throw new Error('Required microcopy missing: ' + selector);
      return nodes.map(node => {
        if (!node.checkVisibility() || node.closest('details:not([open]) > :not(summary)')) throw new Error('Required microcopy hidden: ' + selector);
        const layers = [];
        for (let parent = node; parent; parent = parent.parentElement) { const layer = parse(getComputedStyle(parent).backgroundColor); layers.push(layer); if (layer[3] === 1) break; }
        const bg = layers.reverse().reduce((background, layer) => composite(layer, background), [255,255,255]);
        const foreground = composite(parse(getComputedStyle(node).color), bg);
        const a = luminance(foreground), b = luminance(bg);
        return { selector, color: getComputedStyle(node).color, ratio: (Math.max(a,b) + .05) / (Math.min(a,b) + .05) };
      });
    });
  })()`);
  for (const check of checks) assert.ok(check.ratio >= 4.5, `${check.selector} composited contrast ${check.ratio.toFixed(2)} must meet WCAG AA`);
  await evaluate("document.querySelector('.astra-review-details > summary').focus(); true");
  await press("Enter");
  await waitFor("!document.querySelector('.astra-review-details').open");
  await evaluate("window.scrollTo({top:0,behavior:'instant'}); true");
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
  assert.equal(base.background, "rgb(23, 33, 56)", "Astra selected rail must use the approved filled dark-blue surface");
    assert.equal(hovered.background, base.background, "Astra selected fill must survive active+hovered");

  await evaluate("document.querySelector('.workspace-sidebar-search input').focus()");
  await press("Tab");
  const focus = await evaluate(`(() => {
    const active = document.activeElement;
    const style = getComputedStyle(active);
    return { className: active.className, focusVisible: active.matches(':focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor, boxShadow: style.boxShadow };
  })()`);
  assert.match(focus.className, /workspace-sidebar-link/, "Tab from workspace search must reach a route control");
  assert.equal(focus.focusVisible, true, "workspace route must match :focus-visible during keyboard navigation");
  assert.equal(focus.outlineStyle, "solid");
  assert.equal(focus.outlineWidth, "2px");
  assert.equal(focus.outlineColor, "rgb(111, 150, 255)", "Astra rail focus must retain the approved cobalt outline");
  assert.equal(await evaluate("getComputedStyle(document.activeElement).backgroundColor"), "rgb(23, 33, 56)", "Keyboard focus must preserve the selected dark-blue fill");

  await auditMicrocopy();
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const reduced = await evaluate(`(() => { const node = document.querySelector('.workspace-sidebar-link-active'); const style = getComputedStyle(node); return { background: style.backgroundColor, animation: style.animationName, transition: style.transitionDuration }; })()`);
  assert.deepEqual(reduced, { background: "rgb(23, 33, 56)", animation: "none", transition: "0s" }, "Reduced motion must preserve Astra selected state without animation");
  await cdp.send("Emulation.setEmulatedMedia", { features: [] });
  const reviewCopy = await evaluate("document.querySelector('.dashboard-workspace').innerText");
  assert.match(reviewCopy, /Reported P&L/i, "compiled Risk Desk must expose provider-neutral reported P&L");
  assert.doesNotMatch(reviewCopy, /Net P&L|imported trade history/i, "compiled Risk Desk must not misstate gross provider values or sample history");

  const { key: scopedStateKey } = await activeLedgerSnapshot();
  assert.ok(scopedStateKey, "authenticated preview must have an identity-scoped workspace state key");
  await evaluate(`localStorage.setItem(${JSON.stringify(scopedStateKey)}, JSON.stringify({ trades: [], rules: [] }))`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardEmpty=${Date.now()}#dashboard` });
  await waitFor("document.querySelector('[data-dashboard-empty=\"true\"]')");
  const emptyReview = await evaluate(`(() => ({
    action: document.querySelector('.dashboard-empty-action')?.textContent.trim(),
    heading: document.querySelector('#dashboard-empty-title')?.textContent.trim(),
    riskStatus: document.querySelector('.workspace-risk-status strong')?.textContent.trim(),
    statPanels: document.querySelectorAll('.astra-stat-strip, .astra-desk-grid, .astra-desk-bottom, .astra-review-details, .astra-score-ring, .dashboard-review-row').length,
  }))()`);
  assert.deepEqual(emptyReview, {
    action: "Import trade history",
    heading: "Import trade history to start your review",
    riskStatus: "--",
    statPanels: 0,
  }, "compiled empty history must show one import-first state and no derived account statistics");
  if (emptyDashboardCapturePath) {
    const capture = await cdp.send("Page.captureScreenshot", { captureBeyondViewport: false, format: "png" });
    await writeFile(emptyDashboardCapturePath, Buffer.from(capture.data, "base64"));
  }
  await evaluate(`localStorage.removeItem(${JSON.stringify(scopedStateKey)})`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardRestore=${Date.now()}#dashboard` });
  await waitFor("document.querySelector('[data-astra-dashboard=\"integrated\"]') && Number(document.querySelector('[data-dashboard-trade-count]')?.dataset.dashboardTradeCount) > 0");

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
  await sleep(220);
  const toggleFocus = await evaluate(`(() => { const node = document.activeElement; const style = getComputedStyle(node); return { toggle: node.matches('.operator-mobile-menu-toggle'), focusVisible: node.matches(':focus-visible'), outline: style.outline, boxShadow: style.boxShadow, expanded: node.getAttribute('aria-expanded'), controls: node.getAttribute('aria-controls') }; })()`);
  assert.equal(toggleFocus.toggle, true, `${width}px keyboard order must reach the menu toggle`);
  assert.equal(toggleFocus.focusVisible, true);
  assert.match(toggleFocus.boxShadow, /rgba\(111, 150, 255, 0\.5\).*3px/);
  assert.equal(toggleFocus.expanded, "false");
  assert.equal(toggleFocus.controls, "operator-mobile-menu");
  const toggleRect = await evaluate(`(() => { const rect = document.querySelector('.operator-mobile-menu-toggle').getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: toggleRect.x, y: toggleRect.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: toggleRect.x, y: toggleRect.y, button: "left", clickCount: 1 });
  await waitFor("document.querySelector('.operator-mobile-menu-toggle').getAttribute('aria-expanded') === 'true' && document.querySelector('#operator-mobile-menu')");
  await press("Tab");
  await sleep(220);
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
      focusedCurrent: document.activeElement === active, focusVisible: document.activeElement.matches(':focus-visible'), focusOutline: focusStyle.outline, focusShadow: focusStyle.boxShadow,
      deleteVisible: rect.top >= 0 && rect.bottom <= innerHeight && rect.height >= 24, deleteHit: hit === del,
    };
  })()`);
  assert.equal(menu.panelRole, "navigation");
  assert.equal(menu.panelLabel, "Workspace navigation");
  assert.equal(menu.currentCount, 1);
  assert.equal(menu.currentText, "Dashboard");
  assert.ok(Number(menu.activeWeight) > Number(menu.inactiveWeight));
  assert.equal(menu.activeShadow, "none");
  assert.equal(menu.activeBackground, "rgb(23, 26, 33)", "collapsed OA state must use the traveling neutral pill");
  assert.equal(menu.focusedCurrent, true);
  assert.equal(menu.focusVisible, true);
  assert.match(menu.focusShadow, /rgba\(111, 150, 255, 0\.5\).*3px/);
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
  await openDashboard(1440, 1000);
  await evaluate(`(() => { const key = 'cova-auth-session-v1'; const session = JSON.parse(localStorage.getItem(key)); localStorage.setItem(key, JSON.stringify({ ...session, plan: 'pro', subscriptionStatus: 'active' })); })()`);
  const scopedStateKey = await evaluate("'cova-react-risk-os-v2:' + localStorage.getItem('cova-active-storage-identity-v1')");
  assert.ok(scopedStateKey, "Passport zero-score proof requires the identity-scoped workspace state key");
  await evaluate(`localStorage.setItem(${JSON.stringify(scopedStateKey)}, JSON.stringify({ trades: [], rules: [] }))`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardPassportZero=${Date.now()}#passport` });
  await waitFor("document.querySelector('.passport-holo-face') && document.querySelector('.passport-workspace-modes')", 30_000);
  await evaluate("[...document.querySelectorAll('.passport-workspace-modes button')].find(button => button.textContent === 'Ghost').click(); true");
  await waitFor("document.querySelector('.passport-holo-hero-label')?.textContent.trim() === 'Score range'");
  const ghostZero = await evaluate(`(() => ({ label: document.querySelector('.passport-holo-hero-label').textContent.trim(), value: document.querySelector('.passport-holo-hero-value').textContent.trim() }))()`);
  assert.deepEqual(ghostZero, { label: "Score range", value: "0+" }, "Passport Ghost mode must preserve a valid score of zero");
  await evaluate(`localStorage.removeItem(${JSON.stringify(scopedStateKey)})`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardPassport=${Date.now()}#passport` });
  await waitFor("document.querySelector('.passport-holo-face') && !document.querySelector('.passport-workspace-share').disabled", 30_000);
  await evaluate("[...document.querySelectorAll('.passport-workspace-modes button')].find(button => button.textContent === 'Flex').click(); true");
  await waitFor("document.querySelector('.passport-holo-hero-label')?.textContent.trim() === 'Reported P&L'");
  const copy = await evaluate(`(() => ({ card: document.querySelector('.passport-holo-face').textContent, workbench: document.querySelector('.passport-workbench').innerText }))()`);
  assert.match(copy.card, /Reported P&L/i);
  assert.doesNotMatch(copy.workbench, /Net P&L/i);
  await evaluate("document.querySelector('.passport-workspace-share').click(); true");
  await waitFor("document.querySelector('dialog[open] img') && !document.querySelector('.passport-share-save').disabled", 30_000);
  assert.equal(await evaluate("document.querySelector('#share-format').value"), 'square', 'Share defaults to square');
  assert.equal(await evaluate("document.querySelectorAll('dialog img').length"),1,'Only full-bleed foil, no border choices');
  await evaluate("document.querySelector('#share-format').value='feed';document.querySelector('#share-format').dispatchEvent(new Event('change',{bubbles:true}));true");
  await waitFor("document.querySelector('#share-format').value === 'feed' && document.querySelector('dialog img')?.naturalHeight === 1350 && !document.querySelector('.passport-share-save').disabled");
  await evaluate("document.querySelector('.passport-share-save').click(); true");
  const png = await waitForDownloadedPng();
  assert.deepEqual({ width: png.width, height: png.height }, { width: 1080, height: 1350 }, "Passport feed export must retain exact 4:5 dimensions");
  assert.ok(png.size > 10_000, "Passport PNG export must contain rendered card pixels");
  if (passportCapturePath) await copyFile(png.path, passportCapturePath);
}

async function mobileEmptyState() {
  await openDashboard(390, 844);
  const { key: scopedStateKey } = await activeLedgerSnapshot();
  assert.ok(scopedStateKey, "mobile empty-state proof requires the identity-scoped workspace state key");
  const previousState = await evaluate(`localStorage.getItem(${JSON.stringify(scopedStateKey)})`);
  await evaluate(`localStorage.setItem(${JSON.stringify(scopedStateKey)}, JSON.stringify({ trades: [], rules: [] }))`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardMobileEmpty=${Date.now()}#dashboard` });
  await waitFor("document.querySelector('[data-dashboard-empty=\"true\"]')", 30_000);
  const layout = await evaluate(`(() => {
    const empty = document.querySelector('[data-dashboard-empty="true"]');
    const action = document.querySelector('.dashboard-empty-action');
    const rect = empty.getBoundingClientRect();
    const actionRect = action.getBoundingClientRect();
    return {
      actionHeight: Math.round(actionRect.height),
      emptyWidth: Math.round(rect.width),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      visibleRiskStatuses: [...document.querySelectorAll('.header-risk-button, .workspace-risk-status')]
        .filter((node) => { const style = getComputedStyle(node); const box = node.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0; })
        .map((node) => node.querySelector('strong')?.textContent.trim()),
      statPanels: document.querySelectorAll('.astra-stat-strip, .astra-desk-grid, .astra-desk-bottom, .astra-review-details, .astra-score-ring, .dashboard-review-row').length,
    };
  })()`);
  assert.ok(layout.actionHeight >= 42, "Empty-account import action must retain its usable target height");
  assert.equal(layout.emptyWidth, 350, "Astra empty-account panel must fit the approved 20px phone gutters");
  assert.equal(layout.overflow, 0);
  assert.deepEqual(layout.visibleRiskStatuses, []);
  assert.equal(layout.statPanels, 0);
  if (emptyDashboardMobileCapturePath) {
    const capture = await cdp.send("Page.captureScreenshot", { captureBeyondViewport: false, format: "png" });
    await writeFile(emptyDashboardMobileCapturePath, Buffer.from(capture.data, "base64"));
  }
  await evaluate(`localStorage.setItem(${JSON.stringify(scopedStateKey)}, ${JSON.stringify(previousState)})`);
}

async function numericZeroStates() {
  for (const width of [1440, 851, 850, 390]) {
    await openDashboard(width, 900);
    // Retain a competing signed-out ledger so prefix-first selection cannot pass by luck.
    await evaluate("localStorage.setItem('cova-react-risk-os-v2:signed-out', JSON.stringify({trades:[],rules:[]})); true");
    const snapshot = await activeLedgerSnapshot();
    const base = snapshot.state.trades[0];
    for (const [name, pnl] of [["zero metrics", 0], ["valid zero score", -100000]]) {
      const trade = { ...base, id: 'qa-zero-state', date: '2026-08-20', pnl, risk: 1, notes: '' };
      await evaluate(`document.documentElement.dataset.numericZeroDocument = 'previous'; localStorage.setItem(${JSON.stringify(snapshot.key)}, ${JSON.stringify(JSON.stringify({ trades: [trade], rules: [] }))}); localStorage.setItem('cova-dashboard-range-v1','all'); true`);
      await cdp.send('Page.navigate', { url: `${origin}/?numericZero=${width}-${Date.now()}#dashboard` });
      await waitFor("document.documentElement.dataset.numericZeroDocument !== 'previous' && document.readyState === 'complete' && document.querySelector('[data-astra-dashboard=\"integrated\"]') && document.querySelector('.astra-score-ring')");
      const state = await evaluate(`(() => ({
        count: Number(document.querySelector('[data-dashboard-trade-count]').dataset.dashboardTradeCount),
        metrics: [...document.querySelectorAll('.astra-stat-cell')].map(node => ({id:node.dataset.astraStat,value:node.querySelector('.astra-stat-value').textContent.trim()})),
        score: document.querySelector('.astra-score-ring strong').textContent.trim(),
        scoreLabel: document.querySelector('.astra-score-ring').getAttribute('aria-label'),
        railScore: document.querySelector('.workspace-risk-status strong').textContent.trim(),
        railLabel: document.querySelector('.workspace-risk-status').getAttribute('aria-label'),
        empty: document.querySelectorAll('[data-dashboard-empty="true"]').length,
        curve: document.querySelector('.astra-curve').getAttribute('d'),
      }))()`);
      assert.equal(state.count, 1);
      assert.equal(state.empty, 0, `${width}px ${name} is retained history, not an empty account`);
      assert.deepEqual(state.metrics.map(item => item.id), ['pnl','win-rate','profit-factor','drawdown']);
      assert.doesNotMatch(state.curve, /NaN|Infinity/);
      if (pnl === 0) assert.deepEqual(state.metrics.map(item => item.value), ['$0','0%','0.00','$0'], `${width}px valid financial zeros must not become -- or Infinity`);
      else {
        assert.equal(state.score, '0', `${width}px valid Cova score zero must be visible`);
        assert.equal(state.scoreLabel, 'Cova Score 0 out of 100');
        assert.equal(state.railScore, '0');
        assert.equal(state.railLabel, 'Cova risk score 0', 'Account zero is distinct from unavailable proof');
      }
    }
  }
}

async function shortHeight(width, height) {
  await openDashboard(width, height);
  const state = await evaluate(`(() => {
    const rail = document.querySelector('.workspace-sidebar');
    const account = document.querySelector('.workspace-account-menu');
    const nav = document.querySelector('.workspace-sidebar-nav');
    const railRect = rail.getBoundingClientRect();
    const accountRect = account.getBoundingClientRect();
    const clipping = (button) => {
      const rect = button.getBoundingClientRect();
      let top = Math.max(rect.top, 0), bottom = Math.min(rect.bottom, innerHeight);
      let left = Math.max(rect.left, 0), right = Math.min(rect.right, innerWidth);
      for (let parent = button.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
        if (/hidden|clip|auto|scroll/.test(style.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
        if (/hidden|clip|auto|scroll/.test(style.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
      }
      return { label: button.textContent.trim(), rect: { top: rect.top, bottom: rect.bottom, height: rect.height }, visibleHeight: Math.max(0, bottom - top), visibleWidth: Math.max(0, right - left), hit: button.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2)) };
    };
    const buttons = [...document.querySelectorAll('.workspace-account-actions button')].map(clipping);
    const header = document.querySelector('.workspace-top-header');
    const content = document.querySelector('[data-astra-dashboard="integrated"]').getBoundingClientRect();
    return { rail: { top: railRect.top, bottom: railRect.bottom }, railVisible: rail.checkVisibility(), headerVisible: header.checkVisibility(), contentClearsRail: content.left >= railRect.right, account: { top: accountRect.top, bottom: accountRect.bottom, shrink: getComputedStyle(account).flexShrink }, nav: { scrollHeight: nav.scrollHeight, clientHeight: nav.clientHeight }, buttons };
  })()`);
  if (height === 400) console.log(`Short-height geometry ${width}x${height}: ${JSON.stringify(state)}`);
  assert.equal(state.railVisible, true, `${width}px must use the desktop rail at and above 851px`);
  assert.equal(state.headerVisible, false, `${width}px must not overlap a collapsed header with the rail`);
  assert.equal(state.contentClearsRail, true, `${width}px dashboard content must clear the fixed rail`);
  assert.deepEqual(state.buttons.map(button => button.label), ["Delete account", "Sign out"], "Both account escape paths are required");
  assert.deepEqual(state.rail, { top: 0, bottom: height });
  assert.equal(state.account.shrink, "0");
  assert.ok(state.account.bottom <= height + 0.5, `${height}px account menu must stay inside the rail`);
  for (const button of state.buttons) {
    assert.ok(button.visibleHeight >= 24 && button.visibleWidth >= 24, `${width}x${height} ${button.label} must retain a 24px usable visible hit box: ${JSON.stringify(button)}`);
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

  const failures = [];
  const phases = [
    ...[[1440, 900], [390, 844]].map(([width, height]) => [`pricing ${width}x${height}`, () => pricingColorState(width, height)]),
    ['desktop visual, focus, disclosure, empty account', desktopVisualState],
    ...[[850, 900], [849, 900], [800, 900], [768, 900], [767, 900], [390, 844], [390, 640]].map(([width, height]) => [`collapsed ${width}x${height}`, () => collapsedWorkspace(width, height)]),
    ['mobile empty account', mobileEmptyState],
    ['financial zero and valid score zero', numericZeroStates],
    ['Passport zero score and actual PNG export', passportExportTruth],
    ...[1440, 1250, 1050, 1023, 851].flatMap(width => [760, 625, 520, 400].map(height => [`desktop rail ${width}x${height}`, () => shortHeight(width, height)])),
  ];
  for (const [label, run] of phases) {
    try { await run(); console.log(`PASS: ${label}`); }
    catch (error) { failures.push({ label, message: error.message, stack: error.stack }); console.error(`FAIL: ${label}: ${error.stack}`); }
  }
  console.log(`dashboard-browser-regression: ${phases.length - failures.length}/${phases.length} phases passed`);
  assert.deepEqual(failures, [], 'Every pricing, Astra, accessibility, lifecycle, numeric, export and short-height phase must pass');
} finally {
  try { await terminateChrome(); } finally { cdp?.close(); await removeProfile(); }
  console.log(`Cleanup: owned Chrome exited ${chrome.exitCode}; removed ${profileDir}`);
}
