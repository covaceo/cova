import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const artifactDir = process.env.COVA_THREEUI_ARTIFACT_DIR || "C:/Users/brook/Downloads";
const profileDir = await mkdtemp(join(tmpdir(), "cova-ribbon-profile-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let preview;
let previewOutput = "";
let chrome;
let chromeOutput = "";
let cdp;
let origin;
const consoleErrors = [];
const runtimeErrors = [];
const assetErrors = [];

async function reservePort() {
  return new Promise((resolve, reject) => {
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
      if (response.ok) return response.text();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    if (preview?.exitCode !== null) throw new Error(`Preview exited early (${preview.exitCode}).\n${previewOutput}`);
    await sleep(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function waitForJson(url, timeoutMs = 10_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(80);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function waitForExit(child, timeoutMs = 3_000) {
  if (!child || child.exitCode !== null) return true;
  const started = Date.now();
  while (child.exitCode === null && Date.now() - started < timeoutMs) await sleep(50);
  return child.exitCode !== null;
}

async function terminate(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(child)) return;
  if (process.platform === "win32" && child.pid) {
    await new Promise((resolve, reject) => execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], (error) => error ? reject(error) : resolve()));
  }
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
  const response = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Runtime exception");
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

async function navigate(path) {
  await cdp.send("Page.navigate", { url: `${origin}${path}` });
  await waitFor("document.readyState === 'complete'");
  await evaluate("document.fonts.ready");
}

async function screenshot(name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const path = join(artifactDir, name);
  await writeFile(path, Buffer.from(result.data, "base64"));
  return path;
}

async function measureHero(width, expectedState) {
  await waitFor("getComputedStyle(document.querySelector('.cova-liquid-metal-signup__frame')).opacity === '1'", 3_000);
  const metrics = await evaluate(`(() => {
    const hero = document.querySelector('.market-hero')?.getBoundingClientRect();
    const ribbon = document.querySelector('.cova-ribbon-field');
    const canvas = ribbon?.querySelector('canvas');
    const title = document.querySelector('.market-hero-title')?.getBoundingClientRect();
    const liquid = document.querySelector('.cova-liquid-metal-signup');
    const liquidRect = liquid?.getBoundingClientRect();
    const liquidFrame = liquid?.querySelector('iframe');
    const liquidFallback = liquid?.querySelector('.cova-liquid-metal-signup__fallback');
    const darkGlass = document.querySelector('.dark-glass-secondary');
    const darkGlassRect = darkGlass?.getBoundingClientRect();
    const darkGlassOrb = darkGlass?.querySelector('.dark-glass-secondary__orb');
    const titleStyle = getComputedStyle(document.querySelector('.market-hero-title'));
    const signal = document.querySelector('.market-hero-signal');
    const signalStyle = getComputedStyle(signal);
    const editorialStyle = getComputedStyle(document.querySelector('.market-hero-editorial'));
    const eyebrowStyle = getComputedStyle(document.querySelector('.market-hero-eyebrow'));
    const sublineStyle = getComputedStyle(document.querySelector('.market-hero-subline'));
    return {
      introPresent: Boolean(document.querySelector('.cova-site-intro')),
      hero: hero?.toJSON(),
      title: title?.toJSON(),
      headline: document.querySelector('.market-hero-title')?.textContent.replace(/\\s+/g, ' ').trim(),
      ribbonState: ribbon?.dataset.renderState,
      pointerX: ribbon?.dataset.pointerX,
      pointerY: ribbon?.dataset.pointerY,
      liquidState: liquid?.dataset.state,
      liquidRect: liquidRect?.toJSON(),
      liquidFrameTitle: liquidFrame?.title,
      liquidFrameOpacity: liquidFrame ? getComputedStyle(liquidFrame).opacity : null,
      liquidFallbackOpacity: liquidFallback ? getComputedStyle(liquidFallback).opacity : null,
      liquidHit: liquidRect ? document.elementFromPoint(liquidRect.left + liquidRect.width / 2, liquidRect.top + liquidRect.height / 2)?.tagName : null,
      darkGlassRect: darkGlassRect?.toJSON(),
      darkGlassOrbSize: darkGlassOrb?.getBoundingClientRect().width,
      darkGlassHit: darkGlassRect ? darkGlass.contains(document.elementFromPoint(darkGlassRect.left + darkGlassRect.width / 2, darkGlassRect.top + darkGlassRect.height / 2)) : null,
      darkGlassAuraAnimation: darkGlass ? getComputedStyle(darkGlass.querySelector('.dark-glass-secondary__aura')).animationName : null,
      fonts: { title: titleStyle.fontFamily, editorial: editorialStyle.fontFamily, eyebrow: eyebrowStyle.fontFamily, subline: sublineStyle.fontFamily },
      titleLetterSpacing: titleStyle.letterSpacing,
      signalLetterSpacing: signalStyle.letterSpacing,
      signalRect: signal.getBoundingClientRect().toJSON(),
      webgl: Boolean(canvas?.getContext('webgl')),
      rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);
  assert.equal(metrics.introPresent, false, "Rejected intro must not render");
  assert.equal(metrics.ribbonState, expectedState);
  assert.equal(metrics.webgl, true);
  assert.equal(metrics.liquidState, "ready");
  assert.equal(metrics.liquidFrameOpacity, "1");
  assert.equal(metrics.liquidFallbackOpacity, "0");
  assert.equal(metrics.liquidHit, "IFRAME");
  assert.equal(metrics.darkGlassOrbSize, width <= 767 ? 46 : 52);
  assert.equal(metrics.darkGlassHit, true);
  assert.equal(metrics.darkGlassAuraAnimation, expectedState === "static" ? "none" : "cova-dark-glass-orbit");
  assert.match(metrics.fonts.title, /Bricolage Grotesque Variable/);
  assert.match(metrics.fonts.editorial, /Instrument Serif/);
  assert.match(metrics.fonts.eyebrow, /DM Mono/);
  assert.match(metrics.fonts.subline, /Inter Tight Variable/);
  const titleTracking = Number.parseFloat(metrics.titleLetterSpacing);
  const signalTracking = Number.parseFloat(metrics.signalLetterSpacing);
  assert.ok(signalTracking > titleTracking, "The word patterns must be less compressed than the surrounding display title.");
  assert.ok(Math.abs(signalTracking / titleTracking - 0.5) < 0.03, `Expected patterns tracking to be half the title compression; title=${titleTracking}, signal=${signalTracking}`);
  assert.equal(metrics.rootOverflow, 0);
  assert.match(metrics.headline, /See the patterns\s*behind your risk\./);
  assert.ok(metrics.hero.left >= 0 && metrics.hero.right <= width && metrics.hero.top >= 0);
  assert.ok(metrics.title.left >= 0 && metrics.title.right <= width);
  assert.ok(metrics.signalRect.left >= metrics.title.left && metrics.signalRect.right <= metrics.title.right, "Relaxed patterns tracking must remain inside the title rail.");
  assert.ok(metrics.liquidRect.left >= 0 && metrics.liquidRect.right <= width);
  assert.ok(metrics.darkGlassRect.left >= 0 && metrics.darkGlassRect.right <= width);
  const ctaCenterDelta = Math.abs((metrics.liquidRect.top + metrics.liquidRect.height / 2) - (metrics.darkGlassRect.top + metrics.darkGlassRect.height / 2));
  assert.ok(ctaCenterDelta <= 2, `Liquid Metal and Dark Glass action centers must align; delta=${ctaCenterDelta.toFixed(2)} liquid=${JSON.stringify(metrics.liquidRect)} darkGlass=${JSON.stringify(metrics.darkGlassRect)}`);
  return metrics;
}

async function liquidButtonRect() {
  return evaluate(`(() => { const rect = document.querySelector('.cova-liquid-metal-signup')?.getBoundingClientRect(); return rect?.toJSON(); })()`);
}

async function darkGlassButtonRect() {
  return evaluate(`(() => { const rect = document.querySelector('.dark-glass-secondary')?.getBoundingClientRect(); return rect?.toJSON(); })()`);
}


async function clickRect(rect) {
  const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await sleep(360);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", buttons: 1, clickCount: 1, ...point });
  await sleep(80);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", buttons: 0, clickCount: 1, ...point });
}

try {
  const port = await reservePort();
  origin = `http://127.0.0.1:${port}`;
  preview = spawn(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });
  await waitForHttp(`${origin}/`);

  chrome = spawn(chromePath, ["--headless=new", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--remote-debugging-port=0", `--user-data-dir=${profileDir}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  chrome.stderr.on("data", (chunk) => { chromeOutput += chunk.toString(); });
  const devToolsPath = join(profileDir, "DevToolsActivePort");
  const started = Date.now();
  let devToolsPort;
  while (!devToolsPort && Date.now() - started < 10_000) {
    try {
      const [line] = (await readFile(devToolsPath, "utf8")).split(/\r?\n/);
      if (Number(line) > 0) devToolsPort = Number(line);
    } catch {}
    await sleep(75);
  }
  assert.ok(devToolsPort, `Chrome did not publish a DevTools port.\n${chromeOutput}`);
  const targets = await waitForJson(`http://127.0.0.1:${devToolsPort}/json/list`);
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  assert.ok(page, "A page target is required");
  cdp = await connectCdp(page.webSocketDebuggerUrl);
  cdp.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") consoleErrors.push(event.args.map((arg) => arg.value || arg.description || "").join(" "));
  });
  cdp.on("Runtime.exceptionThrown", (event) => runtimeErrors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || "Runtime exception"));
  cdp.on("Network.responseReceived", (event) => {
    const response = event.response;
    if (response?.status >= 400 && /\.(?:js|css|woff2?|png|jpe?g|svg|webp)(?:\?|$)/i.test(response.url)) assetErrors.push(`${response.status} ${response.url}`);
  });
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const originalCreateBuffer = WebGLRenderingContext.prototype.createBuffer;
    WebGLRenderingContext.prototype.createBuffer = function (...args) {
      if (location.search.includes('ribbonBufferFail=1') && !window.__covaRibbonBufferFailureInjected) {
        window.__covaRibbonBufferFailureInjected = true;
        return null;
      }
      return originalCreateBuffer.apply(this, args);
    };
  })();` });

  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await setViewport(1200, 800, false);
  await navigate(`/?audit=ribbon-desktop-${Date.now()}#overview`);
  await waitFor("document.querySelector('.cova-ribbon-field')?.dataset.renderState === 'running'");
  await waitFor("document.querySelector('.cova-liquid-metal-signup')?.dataset.state === 'ready'", 20_000);
  const desktopMetrics = await measureHero(1200, "running");
  const frameCadence = await evaluate(`new Promise((resolve) => {
    let frames = 0;
    const started = performance.now();
    const tick = (now) => {
      frames += 1;
      if (now - started >= 1_000) resolve({ frames, elapsed: now - started });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })`);
  assert.ok(frameCadence.frames >= 45, `The combined Ribbon + Liquid Metal hero dropped to ${frameCadence.frames} frames over ${frameCadence.elapsed.toFixed(1)} ms.`);
  const signedOutLiquidRect = await liquidButtonRect();
  await clickRect(signedOutLiquidRect);
  await waitFor("document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Sign up to Cova'");
  const signedOutLiquidResult = await evaluate("({ dialog: document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label'), hash: location.hash })");
  assert.deepEqual(signedOutLiquidResult, { dialog: "Sign up to Cova", hash: "#overview" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await waitFor("!document.querySelector('[role=\"dialog\"]')");
  await clickRect(await darkGlassButtonRect());
  await waitFor("document.querySelector('.story-strip-simple')?.getBoundingClientRect().top < innerHeight * 0.5");
  const signedOutDarkGlassResult = await evaluate("({ hash: location.hash, storyTop: document.querySelector('.story-strip-simple')?.getBoundingClientRect().top })");
  assert.equal(signedOutDarkGlassResult.hash, "#overview");
  assert.ok(signedOutDarkGlassResult.storyTop < 400);
  await evaluate("document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important'); window.scrollTo(0, 0); true");
  await waitFor("scrollY === 0");
  const darkGlassRect = await darkGlassButtonRect();
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: darkGlassRect.left + darkGlassRect.width / 2, y: darkGlassRect.top + darkGlassRect.height / 2 });
  await sleep(520);
  const darkGlassHover = await evaluate(`(() => {
    const action = document.querySelector('.dark-glass-secondary');
    return {
      auraOpacity: getComputedStyle(action.querySelector('.dark-glass-secondary__aura')).opacity,
      faceOpacity: getComputedStyle(action.querySelector('.dark-glass-secondary__face'), '::after').opacity,
      labelDecoration: getComputedStyle(action.querySelector('.dark-glass-secondary__label'), '::after').content,
    };
  })()`);
  assert.equal(darkGlassHover.auraOpacity, "0");
  assert.equal(darkGlassHover.faceOpacity, "1");
  assert.equal(darkGlassHover.labelDecoration, "none");
  const dashboardProof = await evaluate(`(() => {
    const screen = document.querySelector('.hero-dashboard-screen');
    const shell = document.querySelector('.hero-dashboard-shell');
    const positiveMetric = [...document.querySelectorAll('.hero-dashboard-metric')].find((node) => node.textContent?.includes('Net P&L'))?.querySelector('strong');
    const upCandle = document.querySelector('.dashboard-candle-body-up');
    const reactionHeading = document.querySelector('.market-reaction-heading');
    const reactionHeadingLabel = reactionHeading?.querySelector('span');
    const reactionStrip = document.querySelector('.market-reaction-strip');
    const screenStyle = getComputedStyle(screen);
    const shellStyle = getComputedStyle(shell);
    return {
      screenBackground: screenStyle.backgroundColor,
      shellBackground: shellStyle.backgroundColor,
      shellBackdrop: shellStyle.backdropFilter || shellStyle.webkitBackdropFilter,
      positiveMetric: getComputedStyle(positiveMetric).color,
      upCandleFill: getComputedStyle(upCandle).fill,
      reactionHeadingJustify: getComputedStyle(reactionHeading).justifyContent,
      reactionHeadingTextAlign: getComputedStyle(reactionHeading).textAlign,
      reactionHeadingBorderBottomColor: getComputedStyle(reactionHeading).borderBottomColor,
      reactionDashDisplay: getComputedStyle(reactionHeadingLabel, '::before').display,
      reactionDashContent: getComputedStyle(reactionHeadingLabel, '::before').content,
      reactionStripBorderTopWidth: getComputedStyle(reactionStrip).borderTopWidth,
      reactionStripBorderBottomColor: getComputedStyle(reactionStrip).borderBottomColor,
      reactionSeparatorColors: [...document.querySelectorAll('.market-reaction-item + .market-reaction-item')].map((item) => getComputedStyle(item).borderLeftColor),
    };
  })()`);
  assert.deepEqual(dashboardProof, {
    screenBackground: "rgb(8, 9, 12)",
    shellBackground: "rgb(8, 9, 12)",
    shellBackdrop: "none",
    positiveMetric: "rgb(111, 150, 255)",
    upCandleFill: "rgb(79, 125, 255)",
    reactionHeadingJustify: "center",
    reactionHeadingTextAlign: "center",
    reactionHeadingBorderBottomColor: "rgba(232, 238, 255, 0.62)",
    reactionDashDisplay: "none",
    reactionDashContent: "none",
    reactionStripBorderTopWidth: "0px",
    reactionStripBorderBottomColor: "rgba(232, 238, 255, 0.24)",
    reactionSeparatorColors: ["rgba(232, 238, 255, 0.2)", "rgba(232, 238, 255, 0.2)"],
  }, "The simulated dashboard must be opaque and fully migrated to Cova cobalt");
  const desktop = await screenshot("cova-threeui-landing-desktop.png");
  const liquidRectForHover = await liquidButtonRect();
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: liquidRectForHover.left + liquidRectForHover.width * 0.62, y: liquidRectForHover.top + liquidRectForHover.height / 2 });
  await sleep(900);
  const liquidHover = await screenshot("cova-threeui-liquid-metal-hover.png");
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1030, y: 360 });
  await sleep(160);
  const pointerProbe = await evaluate("({ x: document.querySelector('.cova-ribbon-field')?.dataset.pointerX, y: document.querySelector('.cova-ribbon-field')?.dataset.pointerY })");
  assert.notEqual(pointerProbe.x, "0.720", "Pointer interaction must update the Ribbon Field target");

  await evaluate(`localStorage.setItem('cova-auth-session-v1', JSON.stringify({ email: 'preview@cova.local', mode: 'login', plan: 'pro', signedInAt: new Date().toISOString(), source: 'local-preview', subscriptionStatus: 'preview' }))`);
  await navigate(`/?audit=liquid-signed-in-${Date.now()}#overview`);
  await waitFor("document.querySelector('.cova-liquid-metal-signup')?.dataset.state === 'ready'", 20_000);
  const signedInFrameTitle = await evaluate("document.querySelector('.cova-liquid-metal-signup iframe')?.title");
  assert.equal(signedInFrameTitle, "Cova Open dashboard button");
  const signedInDarkGlassLabel = await evaluate("document.querySelector('.dark-glass-secondary__label')?.textContent.trim()");
  assert.equal(signedInDarkGlassLabel, "Link account");
  await clickRect(await darkGlassButtonRect());
  await waitFor("location.hash === '#import' && document.querySelector('[data-csv-import]')");
  const signedInDarkGlassResult = await evaluate("({ hash: location.hash, importDesk: Boolean(document.querySelector('[data-csv-import]')) })");
  assert.deepEqual(signedInDarkGlassResult, { hash: "#import", importDesk: true });
  await navigate(`/?audit=dark-glass-signed-in-reset-${Date.now()}#overview`);
  await waitFor("document.querySelector('.cova-liquid-metal-signup')?.dataset.state === 'ready'", 20_000);
  await clickRect(await liquidButtonRect());
  await waitFor("location.hash === '#dashboard' && document.querySelector('.dashboard-workspace')");
  const signedInLiquidResult = await evaluate("({ hash: location.hash, dashboard: Boolean(document.querySelector('.dashboard-workspace')) })");
  assert.deepEqual(signedInLiquidResult, { hash: "#dashboard", dashboard: true });
  await evaluate("localStorage.removeItem('cova-auth-session-v1'); localStorage.removeItem('cova-react-risk-os-v2'); true");
  await navigate(`/?audit=liquid-reset-${Date.now()}#overview`);
  await waitFor("document.querySelector('.cova-liquid-metal-signup')?.dataset.state === 'ready'", 20_000);

  const contextLossSupported = await evaluate(`(() => {
    const gl = document.querySelector('.cova-ribbon-field canvas')?.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    return true;
  })()`);
  assert.equal(contextLossSupported, true);
  await waitFor("document.querySelector('.cova-ribbon-field')?.dataset.renderState === 'fallback'", 2_000);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await sleep(120);
  const contextAfterMotionChange = await evaluate("document.querySelector('.cova-ribbon-field')?.dataset.renderState");
  assert.equal(contextAfterMotionChange, "fallback", "A motion-preference change must not clear fallback while the WebGL context remains lost");

  await navigate(`/?audit=ribbon-reduced-${Date.now()}#overview`);
  await waitFor("document.querySelector('.cova-ribbon-field')?.dataset.renderState === 'static'");
  await waitFor("document.querySelector('.cova-liquid-metal-signup')?.dataset.state === 'ready'", 20_000);
  const reducedMetrics = await measureHero(1200, "static");

  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await setViewport(390, 844, true);
  await navigate(`/?audit=ribbon-mobile-${Date.now()}#overview`);
  await waitFor("document.querySelector('.cova-ribbon-field')?.dataset.renderState === 'running'");
  await waitFor("document.querySelector('.cova-liquid-metal-signup')?.dataset.state === 'ready'", 20_000);
  const mobileMetrics = await measureHero(390, "running");
  const mobileProof = await evaluate(`(() => {
    const copy = document.querySelector('.market-hero-copy');
    const dossier = document.querySelector('.mobile-hero-dossier');
    const copyStyle = getComputedStyle(copy);
    const dossierStyle = getComputedStyle(dossier);
    const rect = dossier.getBoundingClientRect();
    return {
      copyFilter: copyStyle.filter,
      copyOpacity: copyStyle.opacity,
      dossierBackground: dossierStyle.backgroundColor,
      dossierDisplay: dossierStyle.display,
      dossierFilter: dossierStyle.filter,
      dossierOpacity: dossierStyle.opacity,
      dossierInsideViewport: rect.left >= 0 && rect.right <= innerWidth,
      dossierOverflow: dossier.scrollWidth - dossier.clientWidth,
    };
  })()`);
  assert.deepEqual(mobileProof, {
    copyFilter: "none",
    copyOpacity: "1",
    dossierBackground: "rgb(8, 9, 12)",
    dossierDisplay: "block",
    dossierFilter: "none",
    dossierOpacity: "1",
    dossierInsideViewport: true,
    dossierOverflow: 0,
  }, "Phone hero and proof must render settled, opaque, and within the viewport");
  const mobile = await screenshot("cova-threeui-landing-mobile.png");

  await setViewport(1200, 800, false);
  await navigate(`/?audit=liquid-fallback-${Date.now()}#overview`);
  await waitFor("document.querySelector('.cova-liquid-metal-signup')?.dataset.state === 'ready'", 20_000);
  await evaluate(`(() => {
    const frame = document.querySelector('.cova-liquid-metal-signup iframe');
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { liquidMetalButton: { type: 'unavailable', webgl: false } } }));
  })()`);
  await waitFor("document.querySelector('.cova-liquid-metal-signup')?.dataset.state === 'fallback'");
  await sleep(220);
  const fallbackState = await evaluate(`(() => {
    const fallback = document.querySelector('.cova-liquid-metal-signup__fallback');
    const rect = fallback.getBoundingClientRect();
    return { opacity: getComputedStyle(fallback).opacity, tabIndex: fallback.tabIndex, hit: fallback.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) };
  })()`);
  assert.deepEqual(fallbackState, { opacity: "1", tabIndex: 0, hit: true });
  await evaluate("document.querySelector('.cova-liquid-metal-signup__fallback').click()");
  await waitFor("document.querySelector('[role=\"dialog\"]')?.getAttribute('aria-label') === 'Sign up to Cova'");
  await evaluate("document.querySelector('[role=\"dialog\"] button[aria-label=\"Close\"]').click()");
  await waitFor("!document.querySelector('[role=\"dialog\"]')");

  await setViewport(1200, 800, false);
  await navigate(`/?ribbonBufferFail=1&audit=buffer-failure-${Date.now()}#overview`);
  await waitFor("document.querySelector('.cova-ribbon-field')?.dataset.renderState === 'fallback'", 2_000);
  const bufferFailure = await evaluate("({ state: document.querySelector('.cova-ribbon-field')?.dataset.renderState, injected: window.__covaRibbonBufferFailureInjected === true })");
  assert.deepEqual(bufferFailure, { state: "fallback", injected: true });

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(assetErrors, []);
  console.log(JSON.stringify({ bufferFailure, contextAfterMotionChange, darkGlassHover, dashboardProof, desktop, desktopMetrics, fallbackState, frameCadence, liquidHover, mobile, mobileMetrics, mobileProof, pointerProbe, reducedMetrics, signedInDarkGlassResult, signedInLiquidResult, signedOutDarkGlassResult, signedOutLiquidResult }, null, 2));
} finally {
  if (cdp) await Promise.race([cdp.send("Browser.close").catch(() => {}), sleep(500)]);
  cdp?.close();
  await terminate(chrome).catch(() => {});
  await terminate(preview).catch(() => {});
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}
