import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const artifactDirectory = process.env.COVA_SITE_LOCK_ARTIFACT_DIR
  || "C:/Users/brook/AppData/Local/hermes/profiles/ares/cache/cova-previews/site-lock";
const profileDirectory = await mkdtemp(join(tmpdir(), "cova-site-lock-browser-"));
const compileDirectory = await mkdtemp(join(tmpdir(), "cova-site-lock-compile-"));
const cdpPort = await allocateFreePort();
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
let browserClient;
let httpServer;
let chrome;

function allocateFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer();
    server.unref();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => rejectPort(new Error("Could not allocate a free port")));
        return;
      }
      server.close((error) => error ? rejectPort(error) : resolvePort(address.port));
    });
  });
}

async function getJson(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function connectCdp(url) {
  return new Promise((resolveConnection, rejectConnection) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let requestId = 0;

    socket.onopen = () => resolveConnection({
      send(method, params = {}) {
        requestId += 1;
        const id = requestId;
        socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolveRequest, rejectRequest) => {
          const timeoutId = setTimeout(() => {
            pending.delete(id);
            rejectRequest(new Error(`CDP request timed out: ${method}`));
          }, 12_000);
          pending.set(id, { resolveRequest, rejectRequest, timeoutId });
        });
      },
      close() {
        socket.close();
      },
    });

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timeoutId);
      if (message.error) request.rejectRequest(new Error(message.error.message));
      else request.resolveRequest(message.result ?? {});
    };
    socket.onerror = rejectConnection;
    socket.onclose = () => {
      for (const request of pending.values()) {
        clearTimeout(request.timeoutId);
        request.rejectRequest(new Error("CDP connection closed before completion"));
      }
      pending.clear();
    };
  });
}

async function evaluate(expression) {
  const result = await browserClient.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result.result.value;
}

async function navigate(url) {
  await browserClient.send("Page.navigate", { url });
  await sleep(700);
  await browserClient.send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
}

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectListen(new Error("Local lock server did not bind a TCP port"));
        return;
      }
      resolveListen(address.port);
    });
  });
}

async function capture(path) {
  const screenshot = await browserClient.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(screenshot.data, "base64"));
}

async function snapshot() {
  return evaluate(`(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      };
    };
    const parseColor = (value) => {
      const match = value.match(/rgba?\\(\\s*([\\d.]+)[, ]+\\s*([\\d.]+)[, ]+\\s*([\\d.]+)/i);
      return match ? match.slice(1, 4).map(Number) : null;
    };
    const luminance = (color) => {
      const channels = color.map((value) => {
        const channel = value / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const contrast = (selector, backgroundSelector, pseudo = null) => {
      const element = document.querySelector(selector);
      const background = document.querySelector(backgroundSelector);
      if (!element || !background) return null;
      const foregroundColor = parseColor(getComputedStyle(element, pseudo).color);
      const backgroundColor = parseColor(getComputedStyle(background).backgroundColor);
      if (!foregroundColor || !backgroundColor) return null;
      const foregroundLuminance = luminance(foregroundColor);
      const backgroundLuminance = luminance(backgroundColor);
      return (Math.max(foregroundLuminance, backgroundLuminance) + .05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + .05);
    };
    return {
      innerWidth,
      innerHeight,
      visualViewportWidth: visualViewport?.width ?? null,
      clientWidth: document.documentElement.clientWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      hero: rect('main > section'),
      panel: rect('.panel-wrap'),
      password: rect('#password'),
      button: rect('button[type="submit"]'),
      heading: document.querySelector('h1')?.textContent?.trim() ?? null,
      unlockHeading: document.querySelector('#unlock-title')?.textContent?.trim() ?? null,
      contrast: {
        privacy: contrast('.privacy', '.panel'),
        panelIndex: contrast('.panel-index', '.panel'),
        footer: contrast('footer', 'body'),
        placeholder: contrast('#password', '.panel', '::placeholder'),
      },
    };
  })()`);
}

try {
  const middlewareSource = await readFile(resolve("middleware.ts"), "utf8");
  const compiled = ts.transpileModule(middlewareSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const compiledPath = join(compileDirectory, "middleware.mjs");
  await writeFile(compiledPath, compiled.outputText);

  const originalEnvironment = {
    enabled: process.env.COVA_SITE_LOCK_ENABLED,
    password: process.env.COVA_SITE_PASSWORD,
    secret: process.env.COVA_SITE_LOCK_SECRET,
  };
  process.env.COVA_SITE_LOCK_ENABLED = "true";
  process.env.COVA_SITE_PASSWORD = "browser-audit-password";
  process.env.COVA_SITE_LOCK_SECRET = "browser-audit-signing-secret-long-enough";
  const { default: middleware } = await import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`);
  const response = await middleware(new Request("https://covadesk.com/?siteLockAudit=1"));
  assert.ok(response instanceof Response, "Enabled middleware must render the gate");
  const gateCsp = response.headers.get("Content-Security-Policy");
  assert.ok(gateCsp, "Enabled middleware must return its gate CSP");
  const gateReferrerPolicy = response.headers.get("Referrer-Policy");
  assert.ok(gateReferrerPolicy, "Enabled middleware must return its gate referrer policy");
  const gateHtml = await response.text();

  if (originalEnvironment.enabled === undefined) delete process.env.COVA_SITE_LOCK_ENABLED;
  else process.env.COVA_SITE_LOCK_ENABLED = originalEnvironment.enabled;
  if (originalEnvironment.password === undefined) delete process.env.COVA_SITE_PASSWORD;
  else process.env.COVA_SITE_PASSWORD = originalEnvironment.password;
  if (originalEnvironment.secret === undefined) delete process.env.COVA_SITE_LOCK_SECRET;
  else process.env.COVA_SITE_LOCK_SECRET = originalEnvironment.secret;

  let unlockRequestOrigin = null;
  httpServer = createHttpServer((request, serverResponse) => {
    if (request.method === "POST" && request.url?.startsWith("/_cova/unlock")) {
      unlockRequestOrigin = request.headers.origin ?? null;
      request.resume();
      request.once("end", () => {
        serverResponse.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": "text/html; charset=utf-8",
        });
        serverResponse.end("<!doctype html><title>Unlocked</title><h1 id=unlocked>Unlocked</h1>");
      });
      return;
    }
    serverResponse.writeHead(401, {
      "Cache-Control": "no-store",
      "Content-Security-Policy": gateCsp,
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": gateReferrerPolicy,
    });
    serverResponse.end(gateHtml);
  });
  const httpPort = await listen(httpServer);
  const baseUrl = `http://127.0.0.1:${httpPort}`;

  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ], { stdio: "ignore" });

  await getJson(`http://127.0.0.1:${cdpPort}/json/version`);
  const targets = await getJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const page = targets.find((target) => target.type === "page");
  assert.ok(page, "Chrome must expose a page target");
  browserClient = await connectCdp(page.webSocketDebuggerUrl);
  await browserClient.send("Page.enable");
  await browserClient.send("Runtime.enable");
  await mkdir(artifactDirectory, { recursive: true });

  await browserClient.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await browserClient.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await navigate(`${baseUrl}/?viewport=mobile`);
  const mobile = await snapshot();
  const mobileScreenshot = join(artifactDirectory, "site-lock-mobile-390x844.png");
  await capture(mobileScreenshot);

  assert.equal(mobile.innerWidth, 390, "Mobile audit must use a true 390px layout viewport");
  assert.equal(mobile.visualViewportWidth, 390);
  assert.equal(mobile.clientWidth, 390);
  assert.equal(mobile.overflow, 0, "Mobile gate must not overflow horizontally");
  assert.ok(mobile.panel && mobile.hero && mobile.password && mobile.button, "Mobile gate controls and content must render");
  assert.ok(mobile.panel.top < mobile.hero.top, "Mobile must prioritize the unlock panel before the review hero");
  assert.ok(mobile.password.bottom <= mobile.innerHeight, "Password field must be fully visible above the mobile fold");
  assert.ok(mobile.button.bottom <= mobile.innerHeight, "Unlock action must be fully visible above the mobile fold");
  assert.ok(mobile.button.height >= 44, "Mobile unlock action must preserve a strong touch target");

  await browserClient.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await browserClient.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1440,
    screenHeight: 900,
  });
  await navigate(`${baseUrl}/?viewport=desktop`);
  const desktop = await snapshot();
  const desktopScreenshot = join(artifactDirectory, "site-lock-desktop-1440x900.png");
  await capture(desktopScreenshot);

  assert.equal(desktop.overflow, 0, "Desktop gate must not overflow horizontally");
  assert.ok(desktop.panel && desktop.hero && desktop.password && desktop.button, "Desktop gate must retain both-column content");
  assert.ok(desktop.hero.left < desktop.panel.left, "Desktop must preserve the approved hero-left, access-right composition");
  assert.ok(desktop.password.bottom <= desktop.innerHeight && desktop.button.bottom <= desktop.innerHeight, "Desktop controls must remain above fold");
  for (const [label, ratio] of Object.entries(desktop.contrast)) {
    assert.ok(ratio >= 4.5, `${label} text must meet WCAG AA contrast; measured ${ratio}`);
  }

  const submitted = await evaluate(`(() => {
    const input = document.querySelector('#password');
    const form = document.querySelector('form');
    if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return false;
    input.value = 'browser-audit-password';
    form.requestSubmit();
    return true;
  })()`);
  assert.equal(submitted, true, "Browser audit must submit the real unlock form");
  await sleep(500);
  assert.equal(unlockRequestOrigin, baseUrl, "Native browser unlock POST must retain the exact same origin");

  console.log(JSON.stringify({
    status: "site lock browser regression passed",
    baseUrl,
    mobile,
    desktop,
    screenshots: {
      mobile: mobileScreenshot,
      desktop: desktopScreenshot,
    },
  }, null, 2));
} finally {
  browserClient?.close();
  chrome?.kill("SIGTERM");
  if (httpServer) await new Promise((resolveClose) => httpServer.close(resolveClose));
  await sleep(200);
  await rm(profileDirectory, { recursive: true, force: true });
  await rm(compileDirectory, { recursive: true, force: true });
}
