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
  const exited = () => !child || child.exitCode !== null || child.signalCode != null;
  if (exited()) return true;
  const started = Date.now();
  while (!exited() && Date.now() - started < timeoutMs) await sleep(50);
  return exited();
}

async function terminateOwnedProcess(child) {
  if (await waitForExit(child, 0)) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, 2_000)) return;
  if (process.platform === "win32" && child.pid) {
    await new Promise((resolve, reject) => execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], async (error) => {
      if (!error || await waitForExit(child, 1_000)) resolve();
      else reject(error);
    }));
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
  await evaluate(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('cova-auth-session-v1', ${JSON.stringify(JSON.stringify(session))})`);
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
      return node.checkVisibility() && !node.closest('details:not([open]) > :not(summary)') && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const node = ${text === undefined ? "candidates[0]" : `candidates.find((candidate) => candidate.textContent.trim() === ${JSON.stringify(text)})`};
    if (!node) return null;
    node.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    if (!node.contains(document.elementFromPoint(x, y))) throw new Error('Control is obscured: ' + node.textContent.trim());
    return { x, y };
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
      return node.checkVisibility() && !node.closest('details:not([open]) > :not(summary)') && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.01 && rect.width > 1 && rect.height > 1;
    };
    const parseColors = (input) => [...String(input).matchAll(/rgba?\\(([^)]*)\\)|color\\(srgb\\s+([^)]*)\\)/gi)].flatMap((match) => {
      const source = match[1] ?? match[2];
      const parts = source.replace(/,/g, ' ').replace(/\\//g, ' / ').trim().split(/\\s+/);
      const slash = parts.indexOf('/');
      const rawChannels = parts.slice(0, slash === -1 ? 3 : slash).slice(0, 3);
      const channels = rawChannels.map((part) => match[2] ? Math.round(Number(part) * 255) : part.endsWith('%') ? Math.round(Number(part.slice(0, -1)) * 2.55) : Math.round(Number(part)));
      if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) return [];
      const alphaPart = slash === -1 ? undefined : parts[slash + 1];
      const alpha = alphaPart === undefined ? 1 : alphaPart.endsWith('%') ? Number(alphaPart.slice(0, -1)) / 100 : Number(alphaPart);
      return [[...channels, alpha]];
    });
    const forbiddenAccent = ([red, green, blue, alpha]) => {
      if (alpha <= 0.04) return false;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const chroma = max - min;
      if (chroma <= 12) return false;
      let hue;
      if (max === red) hue = ((green - blue) / chroma) % 6;
      else if (max === green) hue = (blue - red) / chroma + 2;
      else hue = (red - green) / chroma + 4;
      hue = (hue * 60 + 360) % 360;
      return !((hue >= 214 && hue <= 232) || hue >= 345 || hue <= 8);
    };
    const forbiddenPalette = [...document.querySelectorAll('.oa-dashboard-app *, .workspace-shell *')].filter(visible).flatMap((node) => {
      const style = getComputedStyle(node);
      const values = [style.color, style.backgroundColor, style.backgroundImage, style.borderColor, style.outlineColor, style.boxShadow, style.fill, style.stroke];
      const forbidden = values.flatMap(parseColors).filter(forbiddenAccent);
      return forbidden.length ? [{ tag: node.tagName, className: node.className?.baseVal || node.className || '', values, forbidden }] : [];
    }).slice(0, 10);
    const forbiddenClassMarkers = [...document.querySelectorAll('.oa-dashboard-app *, .workspace-shell *')].flatMap((node) => {
      const className = String(node.className?.baseVal || node.className || '');
      return /(?:emerald|green|copper|mint)/i.test(className) ? [{ tag: node.tagName, className }] : [];
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
      '.dashboard-workspace-header > div > p', '.dashboard-range-controls button:not(.dashboard-range-active)',
      '.astra-source-label', '.astra-stat-label', '.astra-stat-detail', '.astra-panel-heading p',
      '.astra-chart-note > span', '.astra-score-ring small', '.astra-score-row p', '.astra-scale-ends span',
      '.astra-warning-link > span > span', '.astra-warning-link small', '.astra-evidence-details summary span',
      '.astra-note-date', '.astra-mini-note > p', '.astra-trade-table th', '.astra-review-details > summary span',
      '.astra-dashboard-footer > span',
      ...(innerWidth >= 851 ? ['.workspace-sidebar-group-label', '.workspace-account-copy small', '.astra-rail-account small'] : []),
      // Legacy short-height chrome hides this duplicate; the identical footer disclosure stays required above.
      ...(innerWidth >= 851 && !(innerWidth >= 1024 && innerHeight <= 800) ? ['.workspace-sidebar-watermark span'] : []),
      ...(document.querySelector('.astra-evidence-details')?.open ? ['.astra-evidence-details > p', '.astra-factor-list span', '.oa-card-header > span', '.oa-watch-row'] : []),
      ...(document.querySelector('.astra-review-details')?.open ? ['.dashboard-review-grid span', '.dashboard-review-disclosure'] : []),
    ];
    const contrastChecks = contrastSelectors.flatMap((selector) => {
      const nodes = [...document.querySelectorAll(selector)].filter(visible);
      if (!nodes.length) throw new Error('Required informative text missing or hidden: ' + selector);
      return nodes.map((node) => {
        const fg = parse(getComputedStyle(node).color);
        if (!fg) throw new Error('Unparseable text color: ' + selector);
        // Composite every translucent ancestor surface, including the node's own background.
        const layers = [];
        for (let parent = node; parent; parent = parent.parentElement) {
          const layer = parse(getComputedStyle(parent).backgroundColor);
          if (layer) layers.push(layer);
          if (layer?.a === 1) break;
        }
        const bg = layers.reverse().reduce((background, layer) => composite(layer, background), { r: 255, g: 255, b: 255, a: 1 });
        return { selector, text: node.textContent.trim(), ratio: contrast(composite(fg, bg), bg), color: getComputedStyle(node).color, background: bg };
      });
    });
    const brokenImages = [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src);
    const local = ['.workspace-sidebar', '.astra-stat-strip', '.astra-chart-panel', '.astra-discipline', '.astra-recent-trades', '.astra-journal', '.astra-evidence-details', '.astra-review-details', '.risk-watch-panel', '.dashboard-review-row'].flatMap((selector) => {
      const node = document.querySelector(selector);
      if (!node || !visible(node)) return [];
      return [{ selector, deltaX: node.scrollWidth - node.clientWidth, deltaY: node.scrollHeight - node.clientHeight }];
    });
    return {
      viewport: { innerWidth, innerHeight, visualWidth: visualViewport?.width, clientWidth: document.documentElement.clientWidth },
      rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      brokenImages,
      forbiddenPalette,
      forbiddenClassMarkers,
      light,
      contrastChecks,
      local,
      marker: document.querySelector('.dashboard-workspace')?.dataset.astraDashboard,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      shellBackground: getComputedStyle(document.querySelector('.dashboard-workspace')).backgroundColor,
      chartStroke: getComputedStyle(document.querySelector('.astra-chart-svg .astra-curve')).stroke,
      primaryBackground: getComputedStyle(document.querySelector('.dashboard-summary-primary')).backgroundColor,
      primaryColor: getComputedStyle(document.querySelector('.dashboard-summary-primary')).color,
      positiveColors: [...document.querySelectorAll('.astra-positive, .oa-tone-positive, .dashboard-review-status-ready')].map((node) => getComputedStyle(node).color),
    };
  })()`);
  assert.equal(audit.marker, "integrated", `${label} must render the candidate-specific Astra dashboard marker`);
  assert.equal(audit.rootOverflow, 0, `${label} must not overflow horizontally`);
  assert.deepEqual(audit.brokenImages, [], `${label} must not contain broken images`);
  assert.deepEqual(audit.forbiddenPalette, [], `${label} must not retain copper, green, mint, or gold pixels`);
  assert.deepEqual(audit.forbiddenClassMarkers, [], `${label} dashboard DOM must not emit copper, green, mint, or emerald class markers`);
  assert.deepEqual(audit.light, [], `${label} must not contain light card surfaces`);
  for (const check of audit.contrastChecks) assert.ok(check.ratio >= 4.5, `${label} ${check.selector} contrast ${check.ratio.toFixed(2)} must meet WCAG AA`);
  assert.equal(audit.bodyBackground, "rgb(8, 9, 12)");
  assert.equal(audit.shellBackground, "rgb(8, 9, 12)");
  assert.equal(audit.chartStroke, "rgb(79, 125, 255)");
  assert.equal(audit.primaryBackground, "rgba(0, 0, 0, 0)", "Astra warning action is an integrated review row, not the retired filled summary CTA");
  assert.equal(audit.primaryColor, "rgb(224, 232, 247)");
  assert.ok(audit.positiveColors.length > 0, `${label} must expose at least one positive/healthy state`);
  assert.ok(audit.positiveColors.every((color) => color === "rgb(111, 150, 255)"), `${label} positive/healthy states must use cobalt instead of green: ${audit.positiveColors.join(", ")}`);
  for (const item of audit.local) {
    assert.equal(item.deltaX, 0, `${label} ${item.selector} must not overflow horizontally`);
    assert.ok(item.deltaY <= 1, `${label} ${item.selector} must not clip vertically`);
  }
  return audit;
}

async function openDetails(selector) {
  const state = await evaluate(`(() => {
    const details = document.querySelector(${JSON.stringify(selector)});
    if (!(details instanceof HTMLDetailsElement) || details.firstElementChild?.tagName !== 'SUMMARY') throw new Error('Expected native details/summary: ' + ${JSON.stringify(selector)});
    return details.open;
  })()`);
  if (!state) await clickSelector(`${selector} > summary`);
  await waitFor(`document.querySelector(${JSON.stringify(selector)}).open`);
}

async function detailsContract(label) {
  for (const selector of [".astra-evidence-details", ".astra-review-details"]) {
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)})?.open`), false, `${label} ${selector} must begin collapsed`);
    await evaluate(`document.querySelector(${JSON.stringify(`${selector} > summary`)}).scrollIntoView({block:'center',behavior:'instant'}); document.querySelector(${JSON.stringify(`${selector} > summary`)}).focus(); true`);
    await press("Enter");
    await waitFor(`document.querySelector(${JSON.stringify(selector)}).open`);
    assert.equal(await evaluate("document.activeElement.matches('summary:focus-visible')"), true, "Native summary must retain visible keyboard focus after opening");
  }
  await auditDarkDashboard(`${label} expanded evidence and Next review`);
  for (const selector of [".astra-evidence-details", ".astra-review-details"]) {
    await clickSelector(`${selector} > summary`);
    await waitFor(`!document.querySelector(${JSON.stringify(selector)}).open`);
  }
  await evaluate("window.scrollTo({top:0,behavior:'instant'}); true");
}

async function reviewRanges() {
  const ledger = await evaluate(`(() => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('cova-react-risk-os-v2:'));
    if (keys.length !== 1) throw new Error('Expected exactly one identity-scoped test ledger');
    return JSON.parse(localStorage.getItem(keys[0])).trades;
  })()`);
  assert.ok(ledger.length > 1, "Range probe requires real persisted sample trade history");
  const sorted = [...ledger].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1).date;
  const cutoff = new Date(`${latest}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - 6);
  const rangeCounts = {};
  for (const [range, label] of [["all", "All trades"], ["today", "Latest session"], ["week", "Last 7 days"], ["all", "All trades"]]) {
    const trades = sorted.filter(trade => range === "all" || (range === "today" ? trade.date === latest : new Date(`${trade.date}T00:00:00`) >= cutoff));
    await clickSelector(".dashboard-range-controls button", label);
    await waitFor(`document.querySelector('.dashboard-range-controls [aria-pressed="true"]')?.textContent.trim() === ${JSON.stringify(label)}`);
    const result = await evaluate(`(() => ({
      count: Number(document.querySelector('[data-dashboard-trade-count]').dataset.dashboardTradeCount),
      active: document.querySelectorAll('.dashboard-range-controls [aria-pressed="true"]').length,
      cells: [...document.querySelectorAll('.astra-stat-strip .astra-stat-cell')].map(node => ({ id: node.dataset.astraStat, label: node.querySelector('.astra-stat-label').textContent.trim(), value: node.querySelector('.astra-stat-value').textContent.trim() })),
      curve: document.querySelector('.astra-chart-svg .astra-curve').getAttribute('d'),
      recent: [...document.querySelectorAll('[data-recent-trade]')].map(node => node.dataset.recentTrade),
    }))()`);
    const pnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
    const profit = trades.filter(trade => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
    const loss = -trades.filter(trade => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0);
    let equity = 0, peak = 0, drawdown = 0;
    for (const trade of trades) { equity += trade.pnl; peak = Math.max(peak, equity); drawdown = Math.max(drawdown, peak - equity); }
    const money = value => `${value < 0 ? '−' : value > 0 ? '+' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
    assert.equal(result.active, 1, `${label} must be the only selected range`);
    assert.equal(result.count, trades.length, `${label} must use the actual scoped trade count`);
    assert.deepEqual(result.cells, [
      { id: "pnl", label: "Reported P&L", value: money(pnl) },
      { id: "win-rate", label: "Win rate", value: `${Math.round(trades.filter(trade => trade.pnl > 0).length / trades.length * 100)}%` },
      { id: "profit-factor", label: "Profit factor", value: loss ? (profit / loss).toFixed(2) : profit ? "∞" : "0.00" },
      { id: "drawdown", label: "Max drawdown", value: money(-drawdown) },
    ], `${label} must expose exactly four data-derived financial metrics`);
    assert.equal((result.curve.match(/L/g) || []).length, trades.length, "The curve must retain each real closed-trade point plus the zero origin");
    assert.doesNotMatch(result.curve, /NaN|Infinity/, "Equity geometry must stay finite");
    assert.deepEqual(result.recent, trades.slice(-4).reverse().map(trade => trade.id));
    assert.equal(await evaluate("localStorage.getItem('cova-dashboard-range-v1')"), range);
    rangeCounts[range] = trades.length;
  }
  assert.ok(rangeCounts.today < rangeCounts.week && rangeCounts.week < rangeCounts.all, "Fixtures must discriminate every review range");
  console.log(`Astra range/metric proof: ${JSON.stringify(rangeCounts)}`);
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
  for (const expected of ["Search workspace", "Risk Desk", "Trade History", "Limits", "Insights", "Passport", "Latest session", "Last 7 days", "All trades", "Manage source", "Delete account", "Sign out"]) {
    assert.ok(inventory.includes(expected) || inventory.some((item) => item.startsWith(expected)), `Desktop control inventory must include ${expected}`);
  }

  await reviewRanges();
  await detailsContract("desktop");

  await evaluate("document.querySelector('.workspace-sidebar-search input').focus(); true");
  await cdp.send("Input.insertText", { text: "limits" });
  await waitFor("[...document.querySelectorAll('.workspace-sidebar-link')].filter((node) => getComputedStyle(node).display !== 'none').length === 1");
  await press("Tab");
  assert.equal(await evaluate("document.activeElement?.textContent.trim()"), "Limits", "Tab from filtered search must focus the matching route");
  assert.equal(await evaluate("document.activeElement?.matches(':focus-visible')"), true, "Filtered route must expose keyboard focus");
  assert.match(await evaluate("getComputedStyle(document.activeElement).outline"), /rgb\(111, 150, 255\).*solid.*2px/, "Filtered Astra route must retain its deliberate high-contrast keyboard outline");
  await press("Enter");
  await waitFor("location.hash === '#rules'");
  await goBack("#dashboard");
  await goForward("#rules");
  await goBack("#dashboard");
  await evaluate("document.querySelector('.workspace-sidebar-search input').focus(); document.querySelector('.workspace-sidebar-search input').select(); true");
  await press("Backspace", "Backspace");
  await waitFor("document.querySelectorAll('.workspace-sidebar-link').length === 5");

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

  await clickSelector(".workspace-brand-button");
  assert.equal(await evaluate("location.hash"), "#dashboard");

  await clickSelector(".dashboard-summary-actions button", "Manage source");
  await waitFor("location.hash === '#import'");
  await goBack("#dashboard");

  const primary = await evaluate("document.querySelector('.dashboard-summary-primary small').textContent.trim()");
  const primaryTarget = { "Review warnings": "#rules", "Add trade history": "#import", "Add more trades": "#import", "Open Passport": "#passport" }[primary];
  assert.ok(primaryTarget, `Unexpected dashboard primary action: ${primary}`);
  await clickSelector(".dashboard-summary-primary");
  await waitFor(`location.hash === ${JSON.stringify(primaryTarget)}`);
  await goBack("#dashboard");

  await openDetails(".astra-evidence-details");
  await clickSelector("button[data-dashboard-action=\"review-risk-evidence\"]");
  await waitFor("location.hash === '#rules'");
  await goBack("#dashboard");

  await openDetails(".astra-review-details");
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

async function sourceLifecycle() {
  await openDashboard(1440, 1000, false);
  const snapshot = await evaluate(`(() => {
    const identity = localStorage.getItem('cova-active-storage-identity-v1');
    const key = 'cova-react-risk-os-v2:' + identity;
    if (!identity || !localStorage.getItem(key)) throw new Error('Source probe requires an identity-scoped ledger');
    return { key, brokerKey: 'cova-tradovate-status-v1:' + identity, state: JSON.parse(localStorage.getItem(key)) };
  })()`);
  const base = snapshot.state.trades[0];
  const sample = { ...base, id: 'demo-source-latest', date: '2026-08-20', pnl: 0, notes: '' };
  const olderRithmic = { ...base, id: 'rithmic-source-old', date: '2026-08-01', pnl: -25, source: { provider: 'Rithmic', accountKey: 'qa-disposable', accountId: 'QA-ONLY', currency: 'USD' } };
  const cases = [
    { name: 'Rithmic history outside selected range', trades: [olderRithmic, sample], broker: null, account: 'Sample + Rithmic review', source: 'Sample review', count: 1, attribution: 1 },
    { name: 'Rithmic resync receipt without retained provider rows', trades: [sample], broker: { provider: 'Rithmic', status: 'imported', connected: false, mode: 'ephemeral', message: 'QA-only imported history; login discarded.', updatedAt: new Date().toISOString() }, account: 'Sample review', source: 'Sample review', count: 1, attribution: 1 },
    { name: 'Empty account with Rithmic resync receipt', trades: [], broker: { provider: 'Rithmic', status: 'imported', connected: false, mode: 'ephemeral', message: 'QA-only imported history; login discarded.', updatedAt: new Date().toISOString() }, account: 'No trade history', source: 'No trade history', count: 0, attribution: 0 },
    { name: 'Linked account is distinct from selected source', trades: [olderRithmic, sample], broker: { provider: 'Tradovate', status: 'connected', connected: true, mode: 'linked', message: 'QA-only linked account label.', updatedAt: new Date().toISOString() }, account: 'Tradovate linked', source: 'Sample review', count: 1, attribution: 1 },
  ];
  try {
    for (const scenario of cases) {
      await evaluate(`localStorage.setItem(${JSON.stringify(snapshot.key)}, ${JSON.stringify(JSON.stringify({ trades: scenario.trades, rules: [] }))}); localStorage.setItem('cova-dashboard-range-v1', 'today'); sessionStorage.removeItem('cova-import-provider-v1'); ${scenario.broker ? `localStorage.setItem(${JSON.stringify(snapshot.brokerKey)}, ${JSON.stringify(JSON.stringify(scenario.broker))})` : `localStorage.removeItem(${JSON.stringify(snapshot.brokerKey)})`}; true`);
      await cdp.send('Page.navigate', { url: `${origin}/?sourceLifecycle=${Date.now()}#dashboard` });
      await waitFor("document.querySelector('[data-astra-dashboard=\"integrated\"]') && document.querySelector('.astra-source-label')");
      const state = await evaluate(`(() => ({
        source: document.querySelector('.astra-source-label').getAttribute('aria-label'),
        sourceText: document.querySelector('.astra-source-label').textContent.trim(),
        account: document.querySelector('.workspace-account-copy small').textContent.trim(),
        attribution: document.querySelectorAll('.dashboard-attribution-row [data-rithmic-attribution]').length,
        syncActions: [...document.querySelectorAll('.astra-deskbar-tools button, .dashboard-summary-actions button')].map(node => node.textContent.trim()),
        empty: document.querySelectorAll('[data-dashboard-empty="true"]').length,
      }))()`);
      assert.deepEqual(state, { source: `Review source: ${scenario.source}`, sourceText: `${scenario.source} / ${scenario.count} trades`, account: scenario.account, attribution: scenario.attribution, syncActions: ['Sync new trades', 'Sync new trades'], empty: scenario.count ? 0 : 1 }, scenario.name);
      // Selection is a lifecycle handoff only. Never enter credentials or start a broker sync.
      await clickSelector('.dashboard-summary-actions button', 'Sync new trades');
      await waitFor("location.hash === '#import'");
      await waitFor("document.querySelector('[data-provider-picker] [data-firm-id=\"rithmic\"][aria-pressed=\"true\"]')");
      assert.equal(await evaluate("document.querySelectorAll('[data-provider-picker] [aria-pressed=\"true\"]').length"), 1, `${scenario.name} must hand off to exactly the Rithmic provider`);
      console.log(`Astra source lifecycle: ${scenario.name} passed`);
    }
  } finally {
    await evaluate(`localStorage.setItem(${JSON.stringify(snapshot.key)}, ${JSON.stringify(JSON.stringify(snapshot.state))}); localStorage.removeItem(${JSON.stringify(snapshot.brokerKey)}); localStorage.setItem('cova-dashboard-range-v1','all'); sessionStorage.removeItem('cova-import-provider-v1'); true`);
  }
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
  await detailsContract("mobile");
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

  const failures = [];
  for (const [label, run] of [["desktop interactions", desktopInteractions], ["source lifecycle", sourceLifecycle], ["short laptop", shortLaptop], ["mobile", mobileDashboard]]) {
    try { await run(); console.log(`PASS: ${label}`); }
    catch (error) { failures.push({ label, message: error.message, stack: error.stack }); console.error(`FAIL: ${label}: ${error.stack}`); }
  }
  console.log(`Browser health: ${JSON.stringify({ consoleErrors, runtimeErrors, networkErrors })}`);
  assert.deepEqual(consoleErrors, [], "Dashboard interactions must not emit console errors");
  assert.deepEqual(runtimeErrors, [], "Dashboard interactions must not throw runtime exceptions");
  assert.deepEqual(networkErrors, [], "Dashboard interactions must not fail required network requests");
  assert.deepEqual(failures, [], "All dashboard interaction phases must pass");
  console.log("dashboard-oa-interaction-regression: Astra desktop/short/mobile, four real metrics/all ranges, native details, search/navigation, scoped Rithmic handoffs, account lifecycle and contrast passed");
} finally {
  if (cdp) await Promise.race([cdp.send("Browser.close").catch(() => {}), sleep(500)]);
  cdp?.close();
  try { await waitForExit(chrome, 3_000); await terminateOwnedProcess(chrome); }
  finally {
    try { await terminateOwnedProcess(preview); }
    finally { await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); }
  }
  console.log(`Cleanup: owned Chrome exited ${chrome?.exitCode}; removed ${profileDir}`);
}
