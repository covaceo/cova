import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

async function clearDownloadedPngs() {
  const files = await readdir(downloadDir);
  await Promise.all(files
    .filter((name) => name.endsWith(".png") || name.endsWith(".crdownload"))
    .map((name) => rm(join(downloadDir, name), { force: true })));
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
    return { className: active.className, focusVisible: active.matches(':focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor, boxShadow: style.boxShadow };
  })()`);
  assert.match(focus.className, /workspace-sidebar-link/, "Tab from workspace search must reach a route control");
  assert.equal(focus.focusVisible, true, "workspace route must match :focus-visible during keyboard navigation");
  assert.equal(focus.outlineStyle, "none");
  assert.match(focus.boxShadow, /rgba\(111, 150, 255, 0\.5\).*3px/, "OA dashboard focus must use the approved cobalt ring");

  const microcopy = await evaluate(`(() => ({
    account: getComputedStyle(document.querySelector('.workspace-account-copy small')).color,
    disclosure: getComputedStyle(document.querySelector('.workspace-sidebar-watermark span')).color,
    range: getComputedStyle(document.querySelector('.dashboard-range-controls button:not(.dashboard-range-active)')).color,
    summary: getComputedStyle(document.querySelector('.dashboard-summary-cell span')).color,
    description: getComputedStyle(document.querySelector('.dashboard-instrument-header p')).color,
    review: getComputedStyle(document.querySelector('.dashboard-review-disclosure')).color,
  }))()`);
  assert.deepEqual(microcopy, {
    account: "rgba(232, 238, 255, 0.68)",
    disclosure: "rgba(232, 238, 255, 0.56)",
    range: "rgba(232, 238, 255, 0.68)",
    summary: "rgba(232, 238, 255, 0.68)",
    description: "rgba(232, 238, 255, 0.68)",
    review: "rgba(232, 238, 255, 0.56)",
  });
  const reviewCopy = await evaluate("document.querySelector('.dashboard-workspace').innerText");
  assert.match(reviewCopy, /Reported P&L/i, "compiled Risk Desk must expose provider-neutral reported P&L");
  assert.doesNotMatch(reviewCopy, /Net P&L|imported trade history/i, "compiled Risk Desk must not misstate gross provider values or sample history");

  const scopedStateKey = await evaluate("Object.keys(localStorage).find((key) => key.startsWith('cova-react-risk-os-v2:'))");
  assert.ok(scopedStateKey, "authenticated preview must have an identity-scoped workspace state key");
  await evaluate(`localStorage.setItem(${JSON.stringify(scopedStateKey)}, JSON.stringify({ trades: [], rules: [] }))`);
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

async function rulesControlsTruth() {
  await openDashboard(1440, 900);
  await evaluate(`(() => {
    const key = "cova-auth-session-v1";
    const session = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify({ ...session, plan: "pro", subscriptionStatus: "active" }));
  })()`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardRules=${Date.now()}#rules` });
  await waitFor("document.querySelector(\".rule-control-card input[type='range']\")", 30_000);

  const expectedSliderNames = [
    "Daily loss limit",
    "Single-trade loss limit",
    "Max contracts",
    "Pause after loss streak",
    "Minimum profit factor",
    "Minimum average R",
  ];
  const sliderControls = await evaluate(`Array.from(document.querySelectorAll(".rule-control-card input[type='range']"), (node) => ({
    name: node.getAttribute("aria-label") ?? "",
    disabled: node.disabled,
  }))`);
  assert.deepEqual(
    sliderControls.map(({ name }) => name).sort(),
    [...expectedSliderNames].sort(),
    "Every visible rule slider must carry its rule name.",
  );
  const axTree = await cdp.send("Accessibility.getFullAXTree");
  const sliderNames = axTree.nodes
    .filter((node) => node.role?.value === "slider")
    .map((node) => node.name?.value ?? "")
    .filter((name) => expectedSliderNames.includes(name));
  assert.deepEqual(
    [...sliderNames].sort(),
    [...expectedSliderNames].sort(),
    "Every rule slider must expose its rule name in the accessibility tree.",
  );

  const originalValue = await evaluate(`document.querySelector(".rule-control-card input[type='number']")?.value`);
  assert.equal(originalValue, "2500", "Expected the Daily loss limit control first.");

  const setFirstNumber = async (value) => {
    await evaluate(`(() => {
      const input = document.querySelector(".rule-control-card input[type='number']");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await sleep(180);
    return evaluate(`document.querySelector(".rule-control-card input[type='number']")?.value`);
  };

  assert.equal(await setFirstNumber(""), originalValue, "Clearing a rule number must preserve the last valid limit.");
  assert.equal(await setFirstNumber("99"), "100", "Rule numbers must clamp to the declared minimum.");
  assert.equal(await setFirstNumber("163"), "150", "Rule numbers must snap to the declared step.");
  assert.equal(await setFirstNumber("10037"), "10000", "Rule numbers must clamp to the declared maximum.");
  assert.equal(await setFirstNumber(originalValue), originalValue, "Rule number restoration failed.");

  const initialSwitchStates = await evaluate(`Array.from(document.querySelectorAll(".rule-control-card [role='switch']"), (node) => node.getAttribute("aria-checked"))`);
  let activeSwitchCount = initialSwitchStates.filter((state) => state === "true").length;
  while (activeSwitchCount > 0) {
    await evaluate(`Array.from(document.querySelectorAll(".rule-control-card [role='switch']")).find((node) => node.getAttribute("aria-checked") === "true")?.click()`);
    activeSwitchCount -= 1;
    await waitFor(`Array.from(document.querySelectorAll(".rule-control-card [role='switch']")).filter((node) => node.getAttribute("aria-checked") === "true").length === ${activeSwitchCount}`);
  }
  const disabledSummary = await evaluate(`document.querySelector(".rules-summary-card")?.textContent ?? ""`);
  assert.match(disabledSummary, /Rules followed\s*Not scored/i, "All-disabled rules must render compliance as unavailable.");
  assert.doesNotMatch(disabledSummary, /Rules followed\s*100%/i, "All-disabled rules must not render perfect compliance.");

  await evaluate(`location.hash = "#dashboard"`);
  await waitFor("document.querySelector('.oa-score-value')", 10_000);
  const disabledDashboardScore = await evaluate(`(() => {
    return {
      cardValue: document.querySelector('.oa-score-value')?.textContent?.trim(),
      caption: document.querySelector('.oa-score-caption')?.textContent?.trim(),
      sidebarValue: document.querySelector('.workspace-risk-status strong')?.textContent?.trim(),
      scoreSupport: Array.from(document.querySelectorAll('.oa-factor-row span')).some((node) => node.textContent?.trim() === 'Score support'),
    };
  })()`);
  assert.equal(disabledDashboardScore.cardValue, "Not scored", "Dashboard score card must not render a numeric Cova Score without active rules.");
  assert.match(disabledDashboardScore.caption, /enable at least one rule/i, "Dashboard score card must explain how to make the score available.");
  assert.equal(disabledDashboardScore.sidebarValue, "--", "Workspace chrome must render risk score as unavailable without active rules.");
  assert.equal(disabledDashboardScore.scoreSupport, false, "Unavailable Dashboard score must not render positive Score support.");

  await evaluate(`location.hash = "#passport"`);
  await waitFor("document.querySelector('.passport-profile-card')", 10_000);
  const disabledPassport = await evaluate(`({
    rank: document.querySelector(".passport-profile-rank h3")?.textContent?.trim(),
    rulesHeld: Array.from(document.querySelectorAll(".passport-profile-stat")).find((node) => node.querySelector("span")?.textContent?.trim() === "Rules held")?.querySelector("strong")?.textContent?.trim(),
    heroProof: document.querySelector(".passport-profile-hero-stat small")?.textContent?.trim(),
  })`);
  assert.equal(disabledPassport.rank, "Unranked", "Passport must not award a rank without active rules.");
  assert.equal(disabledPassport.rulesHeld, "Not scored", "Passport rule compliance must be unavailable without active rules.");
  assert.equal(disabledPassport.heroProof, "No active rules", "Passport hero proof must disclose that no rules are active.");

  await evaluate("[...document.querySelectorAll('.passport-mode-row')].find((button) => button.textContent.includes('Discipline')).click(); true");
  await waitFor("document.querySelector('.passport-profile-hero-stat span')?.textContent.trim() === 'Control score'");
  const disabledDiscipline = await evaluate(`(() => {
    const hero = document.querySelector('.passport-profile-hero-stat');
    return {
      value: hero?.querySelector('strong')?.textContent?.trim(),
      className: hero?.className,
      nextTarget: document.querySelector('.passport-rank-progress strong')?.textContent?.trim(),
    };
  })()`);
  assert.equal(disabledDiscipline.value, "Not scored", "Passport Control score must be unavailable without active rules.");
  assert.match(disabledDiscipline.className, /passport-stat-neutral/, "Unavailable Passport Control score must render neutrally.");
  assert.match(disabledDiscipline.nextTarget, /No active rules/i, "Passport next-rank proof must explicitly say that no rules are active.");

  await evaluate("[...document.querySelectorAll('.passport-export-row')].find((button) => button.textContent.includes('Feed 4:5')).click(); true");
  await waitFor("[...document.querySelectorAll('.passport-export-row')].some((button) => button.textContent.includes('Feed 4:5') && button.getAttribute('aria-pressed') === 'true')");
  await clearDownloadedPngs();
  await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Download PNG')).click(); true");
  const normalNoRulePng = await waitForDownloadedPng();
  assert.deepEqual({ width: normalNoRulePng.width, height: normalNoRulePng.height }, { width: 1080, height: 1350 }, "No-rule normal Passport export must retain Feed dimensions.");
  assert.ok(normalNoRulePng.size > 10_000, "No-rule normal Passport export must contain rendered card pixels.");

  await clearDownloadedPngs();
  await evaluate(`(() => {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalCreateObjectURL = URL.createObjectURL;
    window.__noRuleFallbackInjected = false;
    window.__noRuleFallbackSvg = '';
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      if (!window.__noRuleFallbackInjected && (this.width !== 1080 || this.height !== 1350)) {
        window.__noRuleFallbackInjected = true;
        HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
        throw new Error('Cova QA forced no-rule DOM export fallback');
      }
      return originalToDataURL.apply(this, args);
    };
    URL.createObjectURL = function(blob) {
      if (blob?.type === 'image/svg+xml') blob.text().then((text) => { window.__noRuleFallbackSvg = text; });
      return originalCreateObjectURL.call(this, blob);
    };
    window.__restoreNoRuleFallbackProbe = () => {
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
      URL.createObjectURL = originalCreateObjectURL;
    };
    return true;
  })()`);
  await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Download PNG')).click(); true");
  const fallbackNoRulePng = await waitForDownloadedPng();
  await waitFor("window.__noRuleFallbackInjected === true && window.__noRuleFallbackSvg.includes('USER-CONFIGURED THRESHOLDS · NOT STANDARDIZED')", 30_000);
  const fallbackNoRuleTruth = await evaluate(`(() => {
    const text = window.__noRuleFallbackSvg.toLowerCase();
    return {
      unranked: text.includes('unranked'),
      notScored: text.includes('not scored'),
      noActiveRules: text.includes('no active rules'),
    };
  })()`);
  assert.deepEqual(fallbackNoRuleTruth, { unranked: true, notScored: true, noActiveRules: true }, "No-rule fallback export must preserve rank, score, and active-rule truth.");
  assert.deepEqual({ width: fallbackNoRulePng.width, height: fallbackNoRulePng.height }, { width: 1080, height: 1350 }, "No-rule fallback Passport export must retain Feed dimensions.");
  await evaluate("window.__restoreNoRuleFallbackProbe?.(); true");

  await evaluate(`location.hash = "#rules"`);
  await waitFor("document.querySelector(\".rule-control-card [role='switch']\")", 10_000);
  for (const [index, initialState] of initialSwitchStates.entries()) {
    if (initialState !== "true") continue;
    await evaluate(`document.querySelectorAll(".rule-control-card [role='switch']")[${index}]?.click()`);
    await waitFor(`document.querySelectorAll(".rule-control-card [role='switch']")[${index}]?.getAttribute("aria-checked") === "true"`);
  }
}

async function passportExportTruth() {
  await setViewport(1440, 1000);
  await evaluate(`(() => { const key = 'cova-auth-session-v1'; const session = JSON.parse(localStorage.getItem(key)); localStorage.setItem(key, JSON.stringify({ ...session, plan: 'pro', subscriptionStatus: 'active' })); })()`);
  const scopedStateKey = await evaluate("Object.keys(localStorage).find((key) => key.startsWith('cova-react-risk-os-v2:'))");
  assert.ok(scopedStateKey, "Passport zero-score proof requires the identity-scoped workspace state key");
  await evaluate(`(() => { const key = ${JSON.stringify(scopedStateKey)}; const state = JSON.parse(localStorage.getItem(key)); localStorage.setItem(key, JSON.stringify({ ...state, trades: [] })); })()`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardPassportZero=${Date.now()}#passport` });
  await waitFor("document.querySelector('.passport-card-face') && [...document.querySelectorAll('.passport-mode-row')].some((button) => button.textContent.includes('Ghost'))", 30_000);
  await evaluate("[...document.querySelectorAll('.passport-mode-row')].find((button) => button.textContent.includes('Ghost')).click(); true");
  await waitFor("document.querySelector('.passport-profile-hero-stat span')?.textContent.trim() === 'Score range'");
  const ghostZero = await evaluate(`(() => { const stat = document.querySelector('.passport-profile-hero-stat'); return { label: stat.querySelector('span').textContent.trim(), value: stat.querySelector('strong').textContent.trim() }; })()`);
  assert.deepEqual(ghostZero, { label: "Score range", value: "0+" }, "Passport Ghost mode must preserve a valid score of zero instead of rendering Hidden");
  await evaluate("[...document.querySelectorAll('.passport-mode-row')].find((button) => button.textContent.includes('Flex')).click(); true");
  await waitFor("document.querySelector('.passport-profile-hero-stat span')?.textContent.trim() === 'Reported P&L'");
  const zeroPnlTone = await evaluate("document.querySelector('.passport-profile-hero-stat')?.className");
  assert.match(zeroPnlTone, /passport-stat-neutral/, "Breakeven P&L must render neutral, not positive.");
  await evaluate("[...document.querySelectorAll('.passport-mode-row')].find((button) => button.textContent.includes('Discipline')).click(); true");
  await waitFor("document.querySelector('.passport-profile-hero-stat span')?.textContent.trim() === 'Control score'");
  const zeroAverageRTone = await evaluate(`Array.from(document.querySelectorAll('.passport-profile-stat')).find((node) => node.querySelector('span')?.textContent?.trim() === 'Average R')?.className`);
  assert.match(zeroAverageRTone, /passport-stat-neutral/, "Breakeven average R must render neutral, not positive.");
  await evaluate(`localStorage.removeItem(${JSON.stringify(scopedStateKey)})`);
  await cdp.send("Page.navigate", { url: `${origin}/?dashboardPassport=${Date.now()}#passport` });
  await waitFor("document.querySelector('.passport-card-face') && [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Download PNG'))", 30_000);
  await evaluate("[...document.querySelectorAll('.passport-mode-row')].find((button) => button.textContent.includes('Flex')).click(); true");
  await waitFor("document.querySelector('.passport-profile-hero-stat span')?.textContent.trim() === 'Reported P&L'");
  await sleep(500);
  const copy = await evaluate(`(() => ({ card: document.querySelector('.passport-card-face').innerText, workbench: document.querySelector('.passport-workbench').innerText }))()`);
  assert.match(copy.card, /Reported P&L/i, "live Passport Flex card must use provider-neutral P&L wording");
  assert.match(copy.card, /USER-CONFIGURED THRESHOLDS · NOT STANDARDIZED/, "live Passport and DOM-captured exports must visibly disclose that thresholds are user configured and not standardized");
  assert.doesNotMatch(copy.workbench, /Net P&L/i, "Passport card and privacy controls must not call reported provider P&L net");
  const exportPresets = [
    { label: "Feed 4:5", width: 1080, height: 1350 },
    { label: "Square 1:1", width: 1080, height: 1080 },
    { label: "Story 9:16", width: 1080, height: 1920 },
  ];
  for (const preset of exportPresets) {
    await evaluate(`(() => { const button = [...document.querySelectorAll('.passport-export-row')].find((item) => item.textContent.includes(${JSON.stringify(preset.label)})); button.click(); return true; })()`);
    await waitFor(`[...document.querySelectorAll('.passport-export-row')].some((button) => button.textContent.includes(${JSON.stringify(preset.label)}) && button.getAttribute('aria-pressed') === 'true')`);
    await clearDownloadedPngs();
    await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Download PNG')).click(); true");
    const png = await waitForDownloadedPng();
    assert.deepEqual({ width: png.width, height: png.height }, { width: preset.width, height: preset.height }, `Passport ${preset.label} export must retain exact dimensions`);
    assert.ok(png.size > 10_000, `Passport ${preset.label} export must contain rendered card pixels`);
    if (passportCapturePath) {
      const suffix = preset.label.split(" ")[0].toLowerCase();
      const capturePath = passportCapturePath.toLowerCase().endsWith(".png")
        ? `${passportCapturePath.slice(0, -4)}-${suffix}.png`
        : `${passportCapturePath}-${suffix}.png`;
      await copyFile(png.path, capturePath);
    }
  }

  for (const preset of exportPresets) {
    await evaluate(`(() => { const button = [...document.querySelectorAll('.passport-export-row')].find((item) => item.textContent.includes(${JSON.stringify(preset.label)})); button.click(); return true; })()`);
    await waitFor(`[...document.querySelectorAll('.passport-export-row')].some((button) => button.textContent.includes(${JSON.stringify(preset.label)}) && button.getAttribute('aria-pressed') === 'true')`);
    await clearDownloadedPngs();
    await evaluate(`(() => {
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const originalCreateObjectURL = URL.createObjectURL;
      window.__passportFallbackInjected = false;
      window.__passportFallbackSvg = '';
      HTMLCanvasElement.prototype.toDataURL = function(...args) {
        if (!window.__passportFallbackInjected && (this.width !== ${preset.width} || this.height !== ${preset.height})) {
          window.__passportFallbackInjected = true;
          HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
          throw new Error('Cova QA forced DOM export fallback');
        }
        return originalToDataURL.apply(this, args);
      };
      URL.createObjectURL = function(blob) {
        if (blob?.type === 'image/svg+xml') blob.text().then((text) => { window.__passportFallbackSvg = text; });
        return originalCreateObjectURL.call(this, blob);
      };
      window.__restorePassportFallbackProbe = () => {
        HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
        URL.createObjectURL = originalCreateObjectURL;
      };
      return true;
    })()`);
    await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Download PNG')).click(); true");
    const png = await waitForDownloadedPng();
    await waitFor("window.__passportFallbackInjected === true && window.__passportFallbackSvg.includes('USER-CONFIGURED THRESHOLDS · NOT STANDARDIZED')", 30_000);
    const fallbackTextBounds = await evaluate(`(() => {
      const doc = new DOMParser().parseFromString(window.__passportFallbackSvg, 'image/svg+xml');
      const texts = [...doc.querySelectorAll('text')];
      const band = texts.find((node) => node.textContent.includes('SAMPLE ANALYSIS'));
      const target = texts.find((node) => /trades.*score.*rules/i.test(node.textContent));
      const bounds = (node) => ({
        present: Boolean(node),
        constrained: Boolean(node?.getAttribute('textLength')),
        right: node ? Number(node.getAttribute('x')) + Number(node.getAttribute('textLength')) : Infinity,
      });
      return { band: bounds(band), target: bounds(target) };
    })()`);
    assert.equal(fallbackTextBounds.band.present, true, `Passport ${preset.label} fallback proof band must be present`);
    assert.equal(fallbackTextBounds.band.constrained, true, `Passport ${preset.label} fallback proof band must have a deterministic width constraint`);
    assert.ok(fallbackTextBounds.band.right <= 890, `Passport ${preset.label} fallback proof band must stay inside the card`);
    assert.equal(fallbackTextBounds.target.present, true, `Passport ${preset.label} fallback next-rank copy must be present`);
    assert.equal(fallbackTextBounds.target.constrained, true, `Passport ${preset.label} fallback next-rank copy must have a deterministic width constraint`);
    assert.ok(fallbackTextBounds.target.right <= 972, `Passport ${preset.label} fallback next-rank copy must stay inside the card`);
    assert.deepEqual({ width: png.width, height: png.height }, { width: preset.width, height: preset.height }, `Passport ${preset.label} forced fallback must retain exact dimensions`);
    assert.ok(png.size > 10_000, `Passport ${preset.label} forced fallback must contain rendered card pixels`);
    assert.equal(await evaluate("Boolean(document.querySelector('.passport-export-error'))"), false, `Passport ${preset.label} forced fallback must not expose an export error`);
    if (passportCapturePath) {
      const suffix = `fallback-${preset.label.split(" ")[0].toLowerCase()}`;
      const capturePath = passportCapturePath.toLowerCase().endsWith(".png")
        ? `${passportCapturePath.slice(0, -4)}-${suffix}.png`
        : `${passportCapturePath}-${suffix}.png`;
      await copyFile(png.path, capturePath);
    }
    await evaluate("window.__restorePassportFallbackProbe(); true");
  }
}

async function csvImportInteraction() {
  await openDashboard(1440, 900);
  await evaluate("[...document.querySelectorAll('.workspace-sidebar-link')].find((button) => button.textContent.includes('Trade History')).click(); true");
  await waitFor("location.hash === '#import' && document.querySelector('[data-csv-import] input[type=file]')", 30_000);
  await evaluate("[...document.querySelectorAll('.terminal-tab')].find((button) => button.textContent.includes('Replace')).click(); true");

  const csvPath = join(profileDir, "qa-import.csv");
  await writeFile(csvPath, "Date,Symbol,Qty,Entry,Exit,P&L,Risk,Side\n2026-08-28,NQ,1,19000,19010,200,100,Long\n2026-08-29,ES,2,5300,5295,-250,125,Short\n", "utf8");
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-csv-import] input[type=file]" });
  assert.ok(nodeId, "CSV file input must be reachable through the rendered Import surface");
  await cdp.send("DOM.setFileInputFiles", { files: [csvPath], nodeId });
  await waitFor("[...document.querySelectorAll('.import-ledger-stat')].some((item) => item.textContent.includes('Rows') && item.textContent.includes('2/2'))", 30_000);

  await evaluate("[...document.querySelectorAll('[data-csv-import] button')].find((button) => button.textContent.includes('Review trades')).click(); true");
  await waitFor("location.hash === '#dashboard' && document.querySelector('.dashboard-workspace')", 30_000);
  const imported = await evaluate(`(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('cova-react-risk-os-v2:'));
    const state = key ? JSON.parse(localStorage.getItem(key)) : null;
    return { count: state?.trades?.length ?? 0, markets: state?.trades?.map((trade) => trade.market) ?? [] };
  })()`);
  assert.deepEqual(imported, { count: 2, markets: ["NQ", "ES"] }, "Replace import must persist exactly the reviewed CSV rows before returning to Dashboard");
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
  await csvImportInteraction();
  await rulesControlsTruth();
  for (const [width, height] of [[1023, 900], [800, 900], [390, 844], [390, 640]]) await collapsedWorkspace(width, height);
  await passportExportTruth();
  for (const height of [760, 625, 520, 400]) await shortHeight(height);
  console.log("dashboard-browser-regression: pricing color roles, active hover/focus, AA microcopy, CSV replace import, Limits AX/value normalization, no-rule Dashboard/Passport proof, normal and forced-fallback Passport preset PNGs, collapsed lifecycle semantics, and short-height account controls passed");
} finally {
  await terminateChrome().catch(() => {});
  cdp?.close();
  await removeProfile();
}
