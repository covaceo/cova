import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preview as startPreview } from "vite";
import { exercisePill } from "./features-pill-browser-probe.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profileDir = await mkdtemp(join(tmpdir(), "cova-features-browser-"));
const screenshotDir = process.env.COVA_FEATURES_SCREENSHOT_DIR || "";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let previewServer;
let previewPort;
let chrome;
let cdp;
let origin;
const consoleErrors = [];
const runtimeErrors = [];
const networkErrors = [];

async function portIsOpen(port) {
  return new Promise(resolve => {
    const socket = connect({ host: "127.0.0.1", port });
    const finish = value => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

async function waitForPortClosed(port, timeoutMs = 5_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!(await portIsOpen(port))) return true;
    await sleep(50);
  }
  return false;
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
    ws.addEventListener("message", event => {
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
  const response = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

async function waitFor(expression, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function setViewport(width, height, mobile = false) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
  await cdp.send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
}

async function navigate(label) {
  await cdp.send("Page.navigate", { url: `${origin}/?features-browser=${label}#features` });
  await waitFor("document.readyState === 'complete'");
  await evaluate("document.fonts.ready");
  await waitFor("document.querySelector('[data-features-showcase]')");
  await waitFor("document.querySelectorAll('[role=tab]').length === 5");
  await sleep(420);
}

async function captureScreenshot(name) {
  if (!screenshotDir) return null;
  await mkdir(screenshotDir, { recursive: true });
  const screenshot = await cdp.send("Page.captureScreenshot", { captureBeyondViewport: false, format: "png", fromSurface: true });
  const path = join(screenshotDir, name);
  await writeFile(path, Buffer.from(screenshot.data, "base64"));
  return path;
}

const contrastExpression = `(() => {
  function parseColor(value) {
    const match = value.match(/rgba?\\(([^)]+)\\)/);
    if (!match) return [0, 0, 0, 1];
    const parts = match[1].split(',').map(part => Number.parseFloat(part.trim()));
    return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
  }
  function composite(foreground, background) {
    const alpha = foreground[3] + background[3] * (1 - foreground[3]);
    return [
      (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
      (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
      (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
      alpha,
    ];
  }
  function opaqueBackground(element) {
    let result = [8, 9, 12, 1];
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const color = parseColor(getComputedStyle(node).backgroundColor);
      if (color[3] > 0) layers.push(color);
    }
    for (let index = layers.length - 1; index >= 0; index--) result = composite(layers[index], result);
    return result;
  }
  function luminance(rgb) {
    const values = rgb.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  }
  function contrastRatio(element) {
    const background = opaqueBackground(element);
    const foreground = composite(parseColor(getComputedStyle(element).color), background);
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  }
  const subjects = [
    document.querySelector('.features-instrument-slot[data-active="true"] .features-instrument-footer span:last-child'),
    document.querySelector('.features-outcome-panel[data-active="true"] small'),
    document.querySelector('.features-showcase-trust span:first-child'),
  ];
  return subjects.map(element => ({ text: element.textContent.trim(), ratio: contrastRatio(element), fontSize: getComputedStyle(element).fontSize }));
})()`;

async function contrastMetrics() {
  const metrics = await evaluate(contrastExpression);
  for (const item of metrics) assert.ok(item.ratio >= 4.5, `Expected AA contrast for “${item.text}”; ratio=${item.ratio.toFixed(2)} font=${item.fontSize}`);
  return metrics;
}

async function oaMetrics() {
  return evaluate(`(() => {
    const frame = document.querySelector('.features-showcase-frame');
    const layout = document.querySelector('.features-showcase-layout');
    const action = document.querySelector('.features-outcome-panel[data-active="true"] .features-outcome-action');
    const highlight = document.querySelector('.features-system-tab-highlight');
    const weights = [...document.querySelectorAll('.features-showcase-page h1, .features-showcase-page h2, .features-showcase-page h3, .features-showcase-page strong, .features-showcase-page button')]
      .map((node) => Number.parseInt(getComputedStyle(node).fontWeight, 10))
      .filter(Number.isFinite);
    const rect = highlight?.getBoundingClientRect();
    return {
      actionRadius: Number.parseFloat(getComputedStyle(action).borderRadius),
      frameRadius: Number.parseFloat(getComputedStyle(frame).borderRadius),
      highlightCount: document.querySelectorAll('.features-system-tab-highlight').length,
      highlightRect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
      layoutColumnGap: Number.parseFloat(getComputedStyle(layout).columnGap),
      maxWeight: Math.max(...weights),
    };
  })()`);
}

async function exerciseTransitionContinuity(label, rapid = false) {
  // Sample painted frames, not only the settled tab. Retained exit panels can
  // ghost through a translucent incoming panel even when both end states pass.
  const samples = await evaluate(`(async () => {
    const shell = document.querySelector('[role=tabpanel]');
    if (!shell) throw new Error('Feature panel missing before continuity probe');
    const frames = [];
    const sequence = [0, 1, 2, 3, 4, 3, 2, 1, 0, 4];
    for (const index of sequence) {
      document.querySelectorAll('[role=tab]')[index].click();
      const started = performance.now();
      do {
        await new Promise(requestAnimationFrame);
        const panels = [...shell.querySelectorAll('.features-instrument-slot[data-active="true"] .features-instrument-transition')];
        frames.push({
          target: index,
          stableShell: document.querySelector('[role=tabpanel]') === shell,
          frameHeight: document.querySelector('.features-showcase-layout').getBoundingClientRect().height,
          hiddenSafe: [...document.querySelectorAll('[data-active="false"]')].every(node=>node.inert && node.getAttribute('aria-hidden') === 'true' && getComputedStyle(node).visibility === 'hidden'),
          count: panels.length,
          opacity: panels.map(node => Number(getComputedStyle(node).opacity)),
          selected: document.querySelectorAll('[role=tab][aria-selected="true"]').length,
          instrument: shell.dataset.featureInstrument,
          headers: panels.map(node => node.querySelector('header')?.textContent),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        });
      } while (performance.now() - started < ${rapid ? 45 : 360});
    }
    return frames;
  })()`);
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    await writeFile(join(screenshotDir, `continuity-${label}.json`), JSON.stringify(samples, null, 2));
  }
  assert.ok(samples.length >= 20, `${label}: active animation frames must be sampled.`);
  for (const frame of samples) {
    assert.equal(frame.count, 1, `${label}: outgoing feature must not linger over the new instrument: ${JSON.stringify(frame)}`);
    assert.deepEqual(frame.opacity, [1], `${label}: product proof must stay opaque during the switch.`);
    assert.equal(frame.stableShell, true);
    assert.equal(frame.selected, 1);
    assert.equal(frame.overflow, 0);
    assert.equal(frame.instrument, ['trade-journal', 'risk-review', 'limits', 'insights', 'passport'][frame.target]);
  }
  assert.ok(samples.every(frame=>frame.hiddenSafe), `${label}: hidden reservations must be inert and excluded from accessibility`);
  assert.ok(Math.max(...samples.map(frame=>frame.frameHeight))-Math.min(...samples.map(frame=>frame.frameHeight)) <= 1, `${label}: frame stays stationary throughout normal, rapid and reversed motion`);
  return { label, frames: samples.length, switches: 10, maxPanels: Math.max(...samples.map(frame => frame.count)), minOpacity: Math.min(...samples.flatMap(frame => frame.opacity)) };
}

async function exerciseFeatureLayout() {
  const cases = [];
  for (const [width, height] of [[1920, 1080], [1440, 1000], [1366, 768], [1280, 625], [1101, 900], [1100, 900], [1024, 768], [900, 900], [768, 900], [767, 900], [390, 844], [320, 740]]) {
    await setViewport(width, height, width < 768);
    await navigate(`layout-${width}-${height}`);
    for (const id of ['trade-journal', 'risk-review', 'limits', 'insights', 'passport']) {
      await evaluate(`document.getElementById('feature-tab-${id}').click()`);
      await sleep(400);
      const metrics = await evaluate(`(() => {
        const q = selector => document.querySelector(selector);
        const rect = node => node.getBoundingClientRect().toJSON();
        const panel = q('.features-outcome-panel[data-active="true"]');
        const action = q('.features-outcome-panel[data-active="true"] .features-outcome-action');
        const list = q('.features-outcome-panel[data-active="true"] ul');
        if (!panel || !action || !list) throw new Error('Missing required Features layout owners');
        const a = rect(action), l = rect(list), p = rect(panel);
        const horizontalOverlap = Math.min(a.right, l.right) - Math.max(a.left, l.left);
        const labels = [...document.querySelectorAll('.features-system-tab strong')].map(node => ({ text: node.textContent, width: node.clientWidth, scrollWidth: node.scrollWidth }));
        const heading = q('.features-outcome-panel[data-active="true"] h2');
        const railHeading = q('.features-system-rail-heading');
        const railGap = !railHeading || getComputedStyle(railHeading).display === 'none' ? null : rect(q('.features-system-tab')).top - rect(railHeading).bottom;
        const nav = q('.marketing-header:not(.product-header)');
        const headerGroups = nav && getComputedStyle(nav).display !== 'none' ? [...nav.children].map(rect) : [];
        const headerControls = headerGroups.length ? [...nav.querySelectorAll('button')].map(node => ({ text: node.textContent || node.getAttribute('aria-label'), ...rect(node) })).sort((a, b) => a.left - b.left) : [];
        return { width: innerWidth, height: innerHeight, id: q('[data-feature-instrument]').dataset.featureInstrument,
          frameHeight: rect(q('.features-showcase-layout')).height, shellHeight: rect(q('.features-instrument-shell')).height, outcomeHeight: rect(q('.features-outcome-reservation')).height, action: a, panel: p, actionLineGap: horizontalOverlap > 0 ? a.top - l.bottom : a.left - l.right,
          actionOverflow: action.scrollWidth - action.clientWidth,
          labels, railGap, headingWidth: heading.clientWidth, headingScrollWidth: heading.scrollWidth,
          headerGroups, headerControls, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      })()`);
      cases.push(metrics);
    }
  }
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    await writeFile(join(screenshotDir, 'layout-matrix.json'), JSON.stringify(cases, null, 2));
  }
  assert.equal(cases.length, 60, 'All five feature systems must be checked at every layout width.');
  const compositionFailures = [];
  for (const width of new Set(cases.map(x=>x.width))) {
    const states=cases.filter(x=>x.width===width);
    for (const metric of ['frameHeight','shellHeight','outcomeHeight']) assert.ok(Math.max(...states.map(x=>x[metric]))-Math.min(...states.map(x=>x[metric])) <= 1, `${width}: ${metric} must not jump between tabs`);
  }
  for (const state of cases) {
    const label = `${state.width}x${state.height}/${state.id}`;
    assert.ok(state.actionLineGap >= 16, `${label}: button needs at least 16px clearance from the evidence divider; got ${state.actionLineGap}px`);
    assert.equal(state.actionOverflow, 0, `${label}: action contents must fit their button.`);
    assert.equal(state.overflow, 0, `${label}: no horizontal page overflow.`);
    if (state.labels.some(item => item.scrollWidth > item.width + 1)) compositionFailures.push(`${label}: tab label clipped`);
    if (state.headingScrollWidth > state.headingWidth + 1) compositionFailures.push(`${label}: outcome heading crosses its column`);
    if (state.railGap !== null && state.railGap < 10) compositionFailures.push(`${label}: first tab touches the rail divider (${state.railGap}px)`);
    for (let i = 1; i < state.headerControls.length; i++) {
      const previous = state.headerControls[i - 1], next = state.headerControls[i];
      if (next.left - previous.right < 8) compositionFailures.push(`${label}: header controls collide: ${previous.text}/${next.text}`);
    }
  }
  assert.deepEqual(compositionFailures, [], 'Every Features control and text column must have usable clearance.');
  return { cases: cases.length, tabs: [...new Set(cases.map(state => state.id))], minActionLineGap: Math.min(...cases.map(state => state.actionLineGap)) };
}

async function exerciseFeatureSystems() {
  const expected = [
    ["trade-journal", "Upload trades"],
    ["risk-review", "Review account"],
    ["limits", "Set limits"],
    ["insights", "See insights"],
    ["passport", "Open Passport"],
  ];
  const states = [];
  for (let index = 0; index < expected.length; index += 1) {
    const [instrument, action] = expected[index];
    await evaluate(`document.querySelectorAll('[role=tab]')[${index}].click(); true`);
    await waitFor(`document.querySelector('[data-feature-instrument]')?.dataset.featureInstrument === '${instrument}'`);
    await sleep(260);
    const state = await evaluate(`(() => ({
      action: document.querySelector('.features-outcome-panel[data-active="true"] .features-outcome-action')?.textContent.trim(),
      highlightCount: document.querySelectorAll('.features-system-tab-highlight').length,
      instrument: document.querySelector('[data-feature-instrument]')?.dataset.featureInstrument,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      selected: document.querySelectorAll('[role=tab][aria-selected="true"]').length,
    }))()`);
    assert.equal(state.instrument, instrument);
    assert.equal(state.action, action);
    assert.equal(state.highlightCount, 1);
    assert.equal(state.selected, 1);
    assert.equal(state.overflow, 0);
    states.push(state);
  }
  return states;
}

try {
  previewServer = await startPreview({
    root,
    logLevel: "silent",
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  const previewAddress = previewServer.httpServer.address();
  assert.ok(previewAddress && typeof previewAddress === "object", "Owned Vite preview must expose its bound address.");
  previewPort = previewAddress.port;
  origin = `http://127.0.0.1:${previewPort}`;
  const ownedResponse = await fetch(`${origin}/`);
  assert.ok(ownedResponse.ok, `Owned Vite preview returned ${ownedResponse.status}.`);

  chrome = spawn(chromePath, ["--headless=new", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--remote-debugging-port=0", `--user-data-dir=${profileDir}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const devToolsPath = join(profileDir, "DevToolsActivePort");
  let devToolsPort;
  const started = Date.now();
  while (!devToolsPort && Date.now() - started < 10_000) {
    try { devToolsPort = Number((await readFile(devToolsPath, "utf8")).split(/\r?\n/)[0]); }
    catch { await sleep(80); }
  }
  assert.ok(devToolsPort);
  const targets = await fetch(`http://127.0.0.1:${devToolsPort}/json/list`).then(response => response.json());
  cdp = await connectCdp(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  cdp.on("Runtime.consoleAPICalled", ({ type, args }) => { if (type === "error") consoleErrors.push(args.map(arg => arg.value ?? arg.description).join(" ")); });
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text));
  cdp.on("Network.loadingFailed", ({ canceled, errorText, type }) => { if (!canceled && type !== "Other") networkErrors.push(`${type}: ${errorText}`); });
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);

  console.log(JSON.stringify({ pill: await exercisePill({ evaluate, setViewport, navigate, cdp }) }));
  if (!process.argv.includes('--pill-only')) {
  await setViewport(1440, 900, false);
  await navigate("desktop");
  const desktop = await evaluate(`(() => ({
    orientation: document.querySelector('[role=tablist]').getAttribute('aria-orientation'),
    selected: document.querySelectorAll('[role=tab][aria-selected="true"]').length,
    rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))()`);
  assert.equal(desktop.orientation, "vertical");
  assert.equal(desktop.selected, 1);
  assert.equal(desktop.rootOverflow, 0);
  const headerFit=await evaluate(`(()=>{const e=document.querySelector('.features-showcase-intro h1 em');return {height:e.getBoundingClientRect().height,line:parseFloat(getComputedStyle(e).lineHeight)}})()`);
  assert.ok(headerFit.height<=headerFit.line+1,'Desktop Features heading retains its two-line composition after font matching');
  const desktopOaBefore = await oaMetrics();
  assert.equal(desktopOaBefore.highlightCount, 1, "Desktop must render one shared OA active surface.");
  assert.ok(desktopOaBefore.frameRadius >= 18, "Desktop frame must expose the OA squircle radius.");
  assert.ok(desktopOaBefore.actionRadius >= 20, "Desktop primary action must render as a pill.");
  assert.equal(desktopOaBefore.layoutColumnGap, 4, "Desktop OA plates must be separated by the four-pixel stage gap.");
  assert.ok(desktopOaBefore.maxWeight <= 500, `OA dashboard type must stop at weight 500; got ${desktopOaBefore.maxWeight}`);
  await evaluate("document.querySelectorAll('[role=tab]')[3].click(); true");
  await waitFor("document.querySelector('[data-feature-instrument]')?.dataset.featureInstrument === 'insights'");
  await waitFor("Math.abs(document.querySelector('.features-system-tab-highlight').getBoundingClientRect().top - document.getElementById('feature-tab-insights').getBoundingClientRect().top) < 1");
  const desktopOaAfter = await oaMetrics();
  assert.notEqual(desktopOaAfter.highlightRect.top, desktopOaBefore.highlightRect.top, "The shared OA active surface must travel between desktop rows.");
  await evaluate("document.querySelectorAll('[role=tab]')[1].click(); true");
  await waitFor("document.querySelector('[data-feature-instrument]')?.dataset.featureInstrument === 'risk-review'");
  await sleep(320);
  const desktopContrast = await contrastMetrics();
  const desktopScreenshot = await captureScreenshot("cova-features-oa-desktop.png");
  const desktopStates = await exerciseFeatureSystems();
  const continuity = [await exerciseTransitionContinuity('desktop'), await exerciseTransitionContinuity('desktop-rapid', true)];

  await setViewport(1920, 900, false);
  await navigate("wide-desktop");
  const wide = await evaluate(`(() => ({
    frameWidth: document.querySelector('.features-showcase-frame').getBoundingClientRect().width,
    highlightCount: document.querySelectorAll('.features-system-tab-highlight').length,
    innerWidth,
    rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))()`);
  assert.equal(wide.rootOverflow, 0);
  assert.equal(wide.highlightCount, 1);
  assert.ok(wide.frameWidth >= 1300 && wide.frameWidth <= 1380, `Wide Features frame should stay aligned to the 86rem site rail; got ${wide.frameWidth}px.`);

  await setViewport(1280, 625, false);
  await navigate("short-laptop");
  const shortLaptop = await evaluate(`(() => {
    const action = document.querySelector('.features-showcase-intro .native-start-button').getBoundingClientRect();
    const frame = document.querySelector('.features-showcase-frame').getBoundingClientRect();
    const heading = document.querySelector('.features-showcase-intro h1').getBoundingClientRect();
    return { actionBottom: action.bottom, frameTop: frame.top, headingTop: heading.top, innerHeight, rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  })()`);
  assert.equal(shortLaptop.rootOverflow, 0);
  assert.ok(shortLaptop.headingTop >= 70, `Short-laptop heading collided with fixed chrome at ${shortLaptop.headingTop}px.`);
  assert.ok(shortLaptop.actionBottom <= shortLaptop.innerHeight, `Short-laptop primary action fell below the fold at ${shortLaptop.actionBottom}px.`);
  assert.ok(shortLaptop.frameTop < shortLaptop.innerHeight, "Short-laptop dashboard instrument must begin inside the first fold.");

  await setViewport(768, 900, false);
  await navigate("breakpoint-edge");
  const breakpointEdge = await evaluate(`(() => ({
    orientation: document.querySelector('[role=tablist]').getAttribute('aria-orientation'),
    rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))()`);
  assert.equal(breakpointEdge.orientation, "vertical");
  assert.equal(breakpointEdge.rootOverflow, 0);

  await setViewport(390, 844, true);
  await navigate("mobile");
  const mobile = await evaluate(`(() => ({
    orientation: document.querySelector('[role=tablist]').getAttribute('aria-orientation'),
    selected: document.querySelectorAll('[role=tab][aria-selected="true"]').length,
    rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))()`);
  assert.equal(mobile.orientation, "horizontal");
  assert.equal(mobile.selected, 1);
  assert.equal(mobile.rootOverflow, 0);
  const mobileOa = await oaMetrics();
  assert.equal(mobileOa.highlightCount, 1, "Mobile must retain one shared OA active surface.");
  assert.ok(mobileOa.actionRadius >= 20, "Mobile primary action must remain a pill.");
  assert.ok(mobileOa.maxWeight <= 500, `Mobile OA dashboard type must stop at weight 500; got ${mobileOa.maxWeight}`);
  const mobileContrast = await contrastMetrics();
  const mobileScreenshot = await captureScreenshot("cova-features-oa-mobile.png");

  await evaluate("document.querySelectorAll('[role=tab]')[0].click(); true");
  await waitFor("document.querySelector('[data-feature-instrument]')?.dataset.featureInstrument === 'trade-journal'");
  await waitFor("document.querySelector('[data-journal-scroll]')");
  const journalBefore = await evaluate(`(() => {
    const scroll = document.querySelector('[data-journal-scroll]');
    const review = scroll.querySelector('[role=row]:not(.features-journal-row-head) [role=cell]:last-child');
    return { scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth, scrollLeft: scroll.scrollLeft, review: review.getBoundingClientRect().toJSON(), shell: scroll.getBoundingClientRect().toJSON() };
  })()`);
  await evaluate("document.querySelector('[data-journal-scroll]').scrollLeft = document.querySelector('[data-journal-scroll]').scrollWidth; true");
  await waitFor("document.querySelector('[data-journal-scroll]').scrollLeft > 0");
  await sleep(320);
  const journalAfter = await evaluate(`(() => {
    const scroll = document.querySelector('[data-journal-scroll]');
    const review = scroll.querySelector('[role=row]:not(.features-journal-row-head) [role=cell]:last-child');
    return { scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth, scrollLeft: scroll.scrollLeft, review: review.getBoundingClientRect().toJSON(), shell: scroll.getBoundingClientRect().toJSON() };
  })()`);
  const journal = { before: journalBefore, after: journalAfter };
  assert.ok(journal.before.scrollWidth > journal.before.clientWidth, "Mobile Trade Journal must own horizontal overflow.");
  assert.ok(journal.after.scrollLeft > journal.before.scrollLeft, "Mobile Trade Journal scrollLeft must move.");
  assert.ok(journal.after.review.left >= journal.after.shell.left - 1 && journal.after.review.right <= journal.after.shell.right + 1, "Review column must be reachable inside the scroll owner.");

  continuity.push(await exerciseTransitionContinuity('mobile'), await exerciseTransitionContinuity('mobile-rapid', true));
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await sleep(100);
  continuity.push(await exerciseTransitionContinuity('mobile-reduced', true));
  await setViewport(1440, 900, false);
  continuity.push(await exerciseTransitionContinuity('desktop-reduced', true));
  console.log(JSON.stringify({ continuity }));
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  console.log(JSON.stringify({ layout: await exerciseFeatureLayout() }));

  console.log(JSON.stringify({ origin, desktop, desktopOaBefore, desktopOaAfter, desktopContrast, desktopScreenshot, desktopStates, wide, shortLaptop, breakpointEdge, mobile, mobileOa, mobileContrast, mobileScreenshot, journal }, null, 2));
  }
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(networkErrors, []);
  console.log(JSON.stringify({ origin, consoleErrors, runtimeErrors, networkErrors }, null, 2));
} finally {
  cdp?.close();
  if (chrome && chrome.exitCode === null) {
    if (process.platform === "win32" && chrome.pid) await new Promise(resolve => execFile("taskkill.exe", ["/PID", String(chrome.pid), "/T", "/F"], () => resolve()));
    else chrome.kill("SIGTERM");
  }
  if (previewServer) {
    await previewServer.close();
    if (previewPort) assert.ok(await waitForPortClosed(previewPort), `Owned Vite preview port ${previewPort} remained open after teardown.`);
  }
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}
