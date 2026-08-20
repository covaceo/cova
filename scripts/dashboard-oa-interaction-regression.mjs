import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profileDir = await mkdtemp(join(tmpdir(), "cova-dashboard-oa-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let preview;
let previewOutput = "";
let origin = process.env.COVA_URL || "";
let chrome;
let cdp;
let chromeStderr = "";
const consoleErrors = [];
const runtimeErrors = [];
const networkErrors = [];

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForHttp(url, timeoutMs = 20_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.text();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    if (preview && preview.exitCode !== null) throw new Error(`Owned preview exited (${preview.exitCode}).\n${previewOutput}`);
    await sleep(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function startPreview() {
  if (origin) return;
  const port = await reservePort();
  origin = `http://127.0.0.1:${port}`;
  preview = spawn(process.execPath, [
    join(root, "node_modules", "vite", "bin", "vite.js"),
    "preview",
    "--host", "127.0.0.1",
    "--port", String(port),
    "--strictPort",
  ], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });
  const servedHtml = await waitForHttp(`${origin}/`);
  const builtHtml = await readFile(join(root, "dist", "index.html"), "utf8");
  const assets = (html) => [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(assets(servedHtml), assets(builtHtml), "Owned strict-port preview must serve the current dist asset graph");
}

async function waitForExit(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null) return true;
  const started = Date.now();
  while (child.exitCode === null && Date.now() - started < timeoutMs) await sleep(50);
  return child.exitCode !== null;
}

async function terminateOwnedProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, 2_000)) return;
  if (process.platform === "win32" && child.pid) {
    await new Promise((resolve, reject) => execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], (error) => error ? reject(error) : resolve()));
  }
  if (!await waitForExit(child)) throw new Error(`Owned process ${child.pid} did not exit`);
}

async function waitForDevToolsPort(timeoutMs = 10_000) {
  const path = join(profileDir, "DevToolsActivePort");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited before CDP was ready (${chrome.exitCode}).\n${chromeStderr}`);
    try {
      const [line] = (await readFile(path, "utf8")).split(/\r?\n/);
      const port = Number(line);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {}
    await sleep(75);
  }
  throw new Error("Chrome did not publish DevToolsActivePort");
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
    ws.addEventListener("message", (event) => {
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
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime exception");
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await sleep(75);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function setViewport(width, height, mobile = false) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
  await cdp.send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
}

async function openDashboard(width, height, mobile = false) {
  await setViewport(width, height, mobile);
  const session = {
    email: "preview@cova.local",
    mode: "login",
    plan: "pro",
    signedInAt: new Date().toISOString(),
    source: "local-preview",
    subscriptionStatus: "preview",
  };
  await cdp.send("Page.navigate", { url: `${origin}/?oaDashboardSeed=${width}x${height}-${Date.now()}#overview` });
  await waitFor("document.readyState === 'complete'");
  await evaluate(`localStorage.setItem('cova-auth-session-v1', ${JSON.stringify(JSON.stringify(session))})`);
  await cdp.send("Page.navigate", { url: `${origin}/?oaDashboard=${width}x${height}-${Date.now()}#dashboard` });
  await waitFor("document.querySelector('.dashboard-workspace') && document.querySelector('.workspace-shell[data-workspace-section=\"dashboard\"]')", 30_000);
  await evaluate("document.fonts.ready");
  await sleep(700);
}

async function press(key, code = key, modifiers = 0) {
  if (key === "Backspace") {
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, modifiers, windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers, windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
    await sleep(100);
    return;
  }
  if (key === "Enter") {
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, modifiers, windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await cdp.send("Input.dispatchKeyEvent", { type: "char", key, code, text: "\r", unmodifiedText: "\r", modifiers, windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers, windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await sleep(100);
    return;
  }
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, modifiers });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers });
  await sleep(100);
}

async function clickSelector(selector, text) {
  const point = await evaluate(`(() => {
    const candidates = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const node = ${text === undefined ? "candidates[0]" : `candidates.find((candidate) => candidate.textContent.trim() === ${JSON.stringify(text)})`};
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  assert.ok(point, `Expected visible ${selector}${text === undefined ? "" : ` with text ${text}`}`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await sleep(120);
}

async function goBack(expectedHash) {
  await evaluate("history.back(); true");
  await waitFor(`location.hash === ${JSON.stringify(expectedHash)}`);
  await waitFor("document.querySelector('.dashboard-workspace')", 20_000);
}

async function goForward(expectedHash) {
  await evaluate("history.forward(); true");
  await waitFor(`location.hash === ${JSON.stringify(expectedHash)}`);
}

async function capture(path) {
  if (!path) return;
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await writeFile(path, Buffer.from(shot.data, "base64"));
}

async function auditDarkDashboard(label) {
  const audit = await evaluate(`(() => {
    const shell = document.querySelector('.workspace-shell');
    const parse = (value) => {
      const match = value.match(/rgba?\\(([^)]+)\\)/);
      if (!match) return null;
      const parts = match[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: Number.isFinite(parts[3]) ? parts[3] : 1 };
    };
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.01 && rect.width > 1 && rect.height > 1;
    };
    const bluePattern = /(?:79,\\s*125,\\s*255|111,\\s*150,\\s*255|48,\\s*93,\\s*222|41,\\s*111,\\s*240|59,\\s*166,\\s*241)/;
    const blue = [...document.querySelectorAll('.oa-dashboard-app *, .workspace-shell *')].filter(visible).flatMap((node) => {
      const style = getComputedStyle(node);
      const values = [style.color, style.backgroundColor, style.backgroundImage, style.borderColor, style.outlineColor, style.boxShadow, style.fill, style.stroke];
      return values.some((value) => bluePattern.test(value)) ? [{ tag: node.tagName, className: node.className?.baseVal || node.className || '', values }] : [];
    }).slice(0, 10);
    const light = [...shell.querySelectorAll('*')].filter(visible).flatMap((node) => {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (!color || color.a < 0.05 || Math.min(color.r, color.g, color.b) < 190) return [];
      return [{ tag: node.tagName, className: node.className?.baseVal || node.className || '', background: getComputedStyle(node).backgroundColor }];
    }).slice(0, 10);
    const composite = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const luminance = (color) => {
      const channel = (value) => { const n = value / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    };
    const contrast = (a, b) => { const la = luminance(a); const lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
    const contrastSelectors = [
      '.workspace-sidebar-group-label', '.workspace-account-copy small', '.workspace-sidebar-watermark span',
      '.dashboard-workspace-header > div > p', '.dashboard-range-controls button:not(.dashboard-range-active)',
      '.dashboard-summary-cell span', '.dashboard-instrument-header p', '.oa-card-header > span',
      '.oa-score-sample', '.dashboard-review-grid span', '.dashboard-review-disclosure'
    ];
    const contrastChecks = contrastSelectors.flatMap((selector) => {
      const node = document.querySelector(selector);
      if (!node || !visible(node)) return [];
      const fg = parse(getComputedStyle(node).color);
      if (!fg) return [];
      let parent = node.parentElement;
      let bg = null;
      while (parent && !bg) {
        const candidate = parse(getComputedStyle(parent).backgroundColor);
        if (candidate && candidate.a >= 0.98) bg = candidate;
        parent = parent.parentElement;
      }
      bg ||= { r: 5, g: 5, b: 5, a: 1 };
      return [{ selector, ratio: contrast(composite(fg, bg), bg), color: getComputedStyle(node).color, background: bg }];
    });
    const brokenImages = [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src);
    const local = ['.workspace-sidebar', '.dashboard-summary-strip', '.dashboard-equity-instrument', '.risk-score-panel', '.risk-watch-panel', '.dashboard-review-row'].flatMap((selector) => {
      const node = document.querySelector(selector);
      if (!node || !visible(node)) return [];
      return [{ selector, deltaX: node.scrollWidth - node.clientWidth, deltaY: node.scrollHeight - node.clientHeight }];
    });
    return {
      viewport: { innerWidth, innerHeight, visualWidth: visualViewport?.width, clientWidth: document.documentElement.clientWidth },
      rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      brokenImages,
      blue,
      light,
      contrastChecks,
      local,
      marker: document.querySelector('.dashboard-workspace')?.dataset.oaDashboard,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      shellBackground: getComputedStyle(document.querySelector('.dashboard-workspace')).backgroundColor,
      chartStroke: getComputedStyle(document.querySelector('.dashboard-equity-path')).stroke,
    };
  })()`);
  assert.equal(audit.marker, "dark", `${label} must render the candidate-specific OA dashboard marker`);
  assert.equal(audit.rootOverflow, 0, `${label} must not overflow horizontally`);
  assert.deepEqual(audit.brokenImages, [], `${label} must not contain broken images`);
  assert.deepEqual(audit.blue, [], `${label} must not retain OA or cobalt blue`);
  assert.deepEqual(audit.light, [], `${label} must not contain light card surfaces`);
  for (const check of audit.contrastChecks) assert.ok(check.ratio >= 4.5, `${label} ${check.selector} contrast ${check.ratio.toFixed(2)} must meet WCAG AA`);
  assert.equal(audit.bodyBackground, "rgb(5, 5, 5)");
  assert.equal(audit.shellBackground, "rgb(5, 5, 5)");
  assert.equal(audit.chartStroke, "rgb(191, 137, 100)");
  for (const item of audit.local) {
    assert.equal(item.deltaX, 0, `${label} ${item.selector} must not overflow horizontally`);
    assert.ok(item.deltaY <= 1, `${label} ${item.selector} must not clip vertically`);
  }
  return audit;
}

async function desktopInteractions() {
  await openDashboard(1440, 1000, false);

  const evidenceActions = await evaluate("document.querySelectorAll('button[data-dashboard-action=\"review-risk-evidence\"]').length");
  assert.ok(evidenceActions > 0, "Risk evidence rows must be functional Limits buttons");
  await auditDarkDashboard("desktop");

  const inventory = await evaluate(`(() => [...document.querySelectorAll('button, input')].filter((node) => {
    const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }).map((node) => node.tagName === 'INPUT' ? node.getAttribute('aria-label') : node.textContent.trim()))()`);
  for (const expected of ["Search workspace", "Risk Desk", "Trade History", "Limits", "Insights", "Practice", "Passport", "Latest session", "Last 7 days", "All trades", "Manage source", "Open insights", "Delete account", "Sign out"]) {
    assert.ok(inventory.includes(expected) || inventory.some((item) => item.startsWith(expected)), `Desktop control inventory must include ${expected}`);
  }

  const allCount = Number((await evaluate("document.querySelector('.dashboard-instrument-header > span').textContent")).match(/\d+/)?.[0]);
  await clickSelector(".dashboard-range-controls button", "Latest session");
  await waitFor("document.querySelector('.dashboard-range-controls [aria-pressed=\"true\"]')?.textContent.trim() === 'Latest session'");
  const latestCount = Number((await evaluate("document.querySelector('.dashboard-instrument-header > span').textContent")).match(/\d+/)?.[0]);
  assert.ok(latestCount < allCount, "Latest session must change the actual scoped trade count");
  assert.equal(await evaluate("localStorage.getItem('cova-dashboard-range-v1')"), "today");
  await clickSelector(".dashboard-range-controls button", "All trades");
  await waitFor(`Number(document.querySelector('.dashboard-instrument-header > span').textContent.match(/\\d+/)?.[0]) === ${allCount}`);

  await evaluate("document.querySelector('.workspace-sidebar-search input').focus(); true");
  await cdp.send("Input.insertText", { text: "limits" });
  await waitFor("[...document.querySelectorAll('.workspace-sidebar-link')].filter((node) => getComputedStyle(node).display !== 'none').length === 1");
  await press("Tab");
  assert.equal(await evaluate("document.activeElement?.textContent.trim()"), "Limits", "Tab from filtered search must focus the matching route");
  assert.equal(await evaluate("document.activeElement?.matches(':focus-visible')"), true, "Filtered route must expose keyboard focus");
  await press("Enter");
  await waitFor("location.hash === '#rules'");
  await goBack("#dashboard");
  await goForward("#rules");
  await goBack("#dashboard");
  await evaluate("document.querySelector('.workspace-sidebar-search input').focus(); document.querySelector('.workspace-sidebar-search input').select(); true");
  await press("Backspace", "Backspace");
  await waitFor("document.querySelectorAll('.workspace-sidebar-link').length === 6");

  const navTargets = [
    ["Trade History", "#import"],
    ["Limits", "#rules"],
    ["Insights", "#coach"],
    ["Passport", "#passport"],
  ];
  for (const [text, hash] of navTargets) {
    await clickSelector(".workspace-sidebar-link", text);
    await waitFor(`location.hash === ${JSON.stringify(hash)}`);
    await goBack("#dashboard");
  }
  await clickSelector(".workspace-sidebar-link", "Practice");
  await waitFor("location.hash === '#practice'");
  await evaluate("history.back(); true");
  await waitFor("location.hash === '#dashboard' && document.querySelector('.dashboard-workspace')");

  await clickSelector(".workspace-brand-button");
  assert.equal(await evaluate("location.hash"), "#dashboard");

  await clickSelector(".dashboard-summary-actions button", "Manage source");
  await waitFor("location.hash === '#import'");
  await goBack("#dashboard");

  const primary = await evaluate("document.querySelector('.dashboard-summary-primary').textContent.trim()");
  const primaryTarget = { "Review warnings": "#rules", "Add trade history": "#import", "Add more trades": "#import", "Open Passport": "#passport" }[primary];
  assert.ok(primaryTarget, `Unexpected dashboard primary action: ${primary}`);
  await clickSelector(".dashboard-summary-primary");
  await waitFor(`location.hash === ${JSON.stringify(primaryTarget)}`);
  await goBack("#dashboard");

  await clickSelector("button[data-dashboard-action=\"review-risk-evidence\"]");
  await waitFor("location.hash === '#rules'");
  await goBack("#dashboard");

  await clickSelector(".dashboard-review-row > header button", "Open insights");
  await waitFor("location.hash === '#coach'");
  await goBack("#dashboard");

  await evaluate("document.fonts.ready");
  await sleep(800);
  await capture(process.env.COVA_DASHBOARD_DESKTOP_SCREENSHOT);

  await evaluate("window.__covaConfirmMessage = ''; window.confirm = (message) => { window.__covaConfirmMessage = message; return false; }; true");
  await clickSelector(".workspace-account-actions button", "Delete account");
  assert.match(await evaluate("window.__covaConfirmMessage"), /Permanently delete your Cova account/, "Delete account must reach the destructive confirmation boundary");
  assert.ok(await evaluate("localStorage.getItem('cova-auth-session-v1')"), "Cancelled deletion must preserve the session");

  await clickSelector(".workspace-account-actions button", "Sign out");
  await waitFor("location.hash === '#overview' && !localStorage.getItem('cova-auth-session-v1')");
}

async function shortLaptop() {
  await openDashboard(1440, 760, false);
  await auditDarkDashboard("short laptop");
  const account = await evaluate(`(() => {
    const rail = document.querySelector('.workspace-sidebar');
    const card = document.querySelector('.workspace-account-menu');
    const buttons = [...document.querySelectorAll('.workspace-account-actions button')].map((button) => {
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button');
      return { text: button.textContent.trim(), top: rect.top, bottom: rect.bottom, height: rect.height, hit: hit === button };
    });
    return { railBottom: rail.getBoundingClientRect().bottom, cardBottom: card.getBoundingClientRect().bottom, buttons };
  })()`);
  assert.ok(account.cardBottom <= 760, "Short-laptop account card must stay inside the rail");
  for (const button of account.buttons) {
    assert.ok(button.top >= 0 && button.bottom <= 760 && button.height >= 24, `${button.text} must remain fully visible at 760px height`);
    assert.equal(button.hit, true, `${button.text} must receive pointer hit testing at 760px height`);
  }
  await capture(process.env.COVA_DASHBOARD_SHORT_SCREENSHOT);
}

async function mobileDashboard() {
  await openDashboard(390, 844, true);
  const audit = await auditDarkDashboard("mobile");
  assert.deepEqual(audit.viewport, { innerWidth: 390, innerHeight: 844, visualWidth: 390, clientWidth: 390 }, "Mobile audit must use true CDP viewport metrics");
  const chromeState = await evaluate(`(() => {
    const visible = (selector) => { const node = document.querySelector(selector); if (!node) return false; const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.display !== 'none' && rect.width > 0 && rect.height > 0; };
    return { rail: visible('.workspace-sidebar'), toggle: visible('.operator-mobile-menu-toggle') };
  })()`);
  assert.deepEqual(chromeState, { rail: false, toggle: true });
  await capture(process.env.COVA_DASHBOARD_MOBILE_SCREENSHOT);

  await clickSelector(".operator-mobile-menu-toggle");
  await waitFor("document.querySelector('.operator-mobile-menu-toggle').getAttribute('aria-expanded') === 'true' && document.querySelector('#operator-mobile-menu')");
  const menu = await evaluate(`(() => {
    const panel = document.querySelector('#operator-mobile-menu');
    const current = [...panel.querySelectorAll('[aria-current=\"page\"]')];
    const del = panel.querySelector('.operator-mobile-delete-account');
    const signOut = [...panel.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Sign out');
    const hit = (node) => { const rect = node.getBoundingClientRect(); return { rect: rect.toJSON(), hit: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button') === node }; };
    return { expanded: document.querySelector('.operator-mobile-menu-toggle').getAttribute('aria-expanded'), current: current.map((node) => node.textContent.trim()), del: hit(del), signOut: hit(signOut) };
  })()`);
  assert.equal(menu.expanded, "true");
  assert.deepEqual(menu.current, ["Dashboard"]);
  for (const action of [menu.del, menu.signOut]) {
    assert.ok(action.rect.top >= 0 && action.rect.bottom <= 844 && action.rect.height >= 24, "Mobile account actions must remain fully visible");
    assert.equal(action.hit, true, "Mobile account actions must receive pointer hit testing");
  }
  await clickSelector("#operator-mobile-menu .operator-mobile-menu-link", "Link account");
  await waitFor("location.hash === '#import'");
  await evaluate("history.back(); true");
  await waitFor("location.hash === '#dashboard' && document.querySelector('.dashboard-workspace')");
}

try {
  await startPreview();
  chrome = spawn(chromePath, [
    "--headless=new",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  chrome.stderr.on("data", (chunk) => { chromeStderr += chunk.toString(); });
  const port = await waitForDevToolsPort();
  const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  assert.ok(page, "No page target available");
  cdp = await connectCdp(page.webSocketDebuggerUrl);
  cdp.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") consoleErrors.push(event.args.map((arg) => arg.value || arg.description || "").join(" "));
  });
  cdp.on("Runtime.exceptionThrown", (event) => runtimeErrors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || "Runtime exception"));
  cdp.on("Log.entryAdded", (event) => {
    if (event.entry?.level === "error") consoleErrors.push(event.entry.text);
  });
  cdp.on("Network.loadingFailed", (event) => {
    if (!event.canceled) networkErrors.push(event.errorText);
  });
  cdp.on("Network.responseReceived", (event) => {
    if (event.response?.status >= 400) networkErrors.push(`${event.response.status} ${event.response.url}`);
  });
  cdp.on("Fetch.requestPaused", (event) => {
    const url = new URL(event.request.url);
    if (url.origin === origin && url.pathname === "/api/auth/logout" && event.request.method === "POST") {
      void cdp.send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: 204, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: origin }] });
      return;
    }
    void cdp.send("Fetch.continueRequest", { requestId: event.requestId });
  });
  await Promise.all([
    cdp.send("Page.enable"),
    cdp.send("Runtime.enable"),
    cdp.send("Log.enable"),
    cdp.send("Network.enable"),
    cdp.send("Fetch.enable", { patterns: [{ urlPattern: `${origin}/api/auth/logout`, requestStage: "Request" }] }),
  ]);

  await desktopInteractions();
  await shortLaptop();
  await mobileDashboard();

  assert.deepEqual(consoleErrors, [], "Dashboard interactions must not emit console errors");
  assert.deepEqual(runtimeErrors, [], "Dashboard interactions must not throw runtime exceptions");
  assert.deepEqual(networkErrors, [], "Dashboard interactions must not fail required network requests");
  console.log("dashboard-oa-interaction-regression: desktop, short-laptop, mobile, navigation, search, ranges, evidence actions, account controls, visual tokens, and cleanup passed");
} finally {
  if (cdp) await Promise.race([cdp.send("Browser.close").catch(() => {}), sleep(500)]);
  cdp?.close();
  await terminateOwnedProcess(chrome).catch(() => {});
  await terminateOwnedProcess(preview).catch(() => {});
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}
