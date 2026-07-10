import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.COVA_URL || "http://127.0.0.1:4173";
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = await mkdtemp(join(tmpdir(), "cova-risk-core-audit-"));
const token = `cova-risk-core-audit-${randomUUID()}`;
const port = await allocateFreePort();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `data:text/html,${token}`,
], { stdio: "ignore" });

function allocateFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return server.close(() => reject(new Error("Could not allocate CDP port")));
      server.close((error) => error ? reject(error) : resolve(address.port));
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

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let id = 0;
    socket.onopen = () => resolve({
      send(method, params = {}) {
        const requestId = ++id;
        socket.send(JSON.stringify({ id: requestId, method, params }));
        return new Promise((resolveRequest, rejectRequest) => {
          const timeoutId = setTimeout(() => {
            pending.delete(requestId);
            rejectRequest(new Error(`CDP request timed out: ${method}`));
          }, 12_000);
          pending.set(requestId, { resolveRequest, rejectRequest, timeoutId });
        });
      },
      close() { socket.close(); },
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
    socket.onerror = reject;
    socket.onclose = () => {
      for (const request of pending.values()) {
        clearTimeout(request.timeoutId);
        request.rejectRequest(new Error("CDP connection closed before request completed"));
      }
      pending.clear();
    };
  });
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result.result.value;
}

async function waitForSettledHero(client, width) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const settled = await evaluate(client, `(() => {
      const core = document.querySelector('.hero-risk-core-stage');
      const reaction = document.querySelector('.market-reaction-band');
      const coreReady = core && Number(getComputedStyle(core).opacity) >= 0.99;
      const reactionReady = ${width} < 1280 || (reaction && Number(getComputedStyle(reaction).opacity) >= 0.99);
      return document.readyState === 'complete' && document.fonts.status === 'loaded' && coreReady && reactionReady;
    })()`);
    if (settled) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for the ${width}px hero to settle`);
}

async function setViewport(client, width, height, reducedMotion = false) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
    screenWidth: width,
    screenHeight: height,
  });
  await client.send("Emulation.setEmulatedMedia", {
    media: "",
    features: reducedMotion ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [],
  });
  await client.send("Page.navigate", { url: `${baseUrl}/?riskCoreAudit=${width}x${height}${reducedMotion ? "-reduce" : ""}` });
  await waitForSettledHero(client, width);
}

async function snapshot(client) {
  return evaluate(client, `(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height, display: style.display, opacity: Number(style.opacity), pointerEvents: style.pointerEvents, fontSize: Number.parseFloat(style.fontSize), animationName: style.animationName };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hero: rect('.market-hero'),
      copy: rect('.market-hero-copy'),
      core: rect('.hero-risk-core-stage'),
      geometry: rect('.risk-core-geometry'),
      finding: rect('.risk-core-finding'),
      findingTitle: rect('.risk-core-finding-copy > strong'),
      impact: rect('.risk-core-impact b'),
      motion: rect('.risk-core-motion'),
      scan: rect('.risk-core-scan'),
      reaction: rect('.market-reaction-band'),
      mobileDossier: rect('.mobile-hero-dossier'),
    };
  })()`);
}

let client;
try {
  await getJson(`http://127.0.0.1:${port}/json/version`);
  assert.equal(chrome.exitCode, null, "Spawned Chrome must own the audit session");
  const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
  const page = targets.find((target) => target.type === "page" && target.url.includes(token));
  assert.ok(page, "Audit target must belong to this Chrome instance");
  client = await connect(page.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  const desktopCases = [[1440, 900], [1440, 720], [1280, 720], [1024, 768]];
  for (const [width, height] of desktopCases) {
    await setViewport(client, width, height);
    const state = await snapshot(client);
    console.error(`[risk-core-audit] ${width}x${height}`, JSON.stringify(state));
    assert.equal(state.overflow, 0, `${width}x${height} must not overflow horizontally`);
    assert.notEqual(state.core?.display, "none", `${width}x${height} must render the Risk Core`);
    assert.equal(state.core?.pointerEvents, "none", "Risk Core must not intercept hero actions");
    assert.equal(state.mobileDossier?.display, "none", `${width}x${height} must not render the phone dossier`);
    assert.ok(state.copy.right <= state.geometry.left + 1, `${width}x${height} Risk Core must not overlap hero copy`);
    assert.ok(state.finding.right <= width - 8, `${width}x${height} finding card must clear the viewport edge`);
    assert.ok(state.finding.top >= 90, `${width}x${height} finding card must clear the header`);
    assert.ok(state.findingTitle.fontSize >= 12, `${width}x${height} finding title must remain readable`);
    assert.ok(state.impact.fontSize >= 16, `${width}x${height} impact value must remain readable`);
    assert.ok(state.geometry.bottom <= state.hero.bottom, `${width}x${height} Risk Core must remain inside the hero`);
    if (width >= 1280) {
      assert.notEqual(state.reaction?.display, "none", `${width}x${height} should retain the follower review rail`);
      assert.ok(state.reaction.bottom <= state.hero.bottom, `${width}x${height} review rail must stay inside the hero`);
      if (height <= 800) assert.ok(state.geometry.bottom <= state.reaction.top - 12, `${width}x${height} Risk Core must clear the short-height review rail by at least 12px`);
    }
  }

  await setViewport(client, 1440, 900, true);
  const reduced = await snapshot(client);
  assert.equal(reduced.motion.animationName, "none", "Reduced motion must disable Core floating");
  assert.equal(reduced.scan.animationName, "none", "Reduced motion must disable the scanning pass");

  await setViewport(client, 390, 844);
  const mobile = await snapshot(client);
  console.error("[risk-core-audit] 390x844", JSON.stringify(mobile));
  assert.equal(mobile.overflow, 0, "Phone hero must not overflow horizontally");
  assert.equal(mobile.core?.display, "none", "Phone hero must hide the desktop Risk Core");
  assert.notEqual(mobile.mobileDossier?.display, "none", "Phone hero must retain the dedicated dossier");

  console.log("hero-risk-core-browser-audit: all checks passed");
} finally {
  client?.close();
  chrome.kill("SIGTERM");
  await sleep(350);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true });
      break;
    } catch (error) {
      if (error?.code !== "EBUSY" || attempt === 4) console.error(`[risk-core-audit] profile cleanup warning: ${error.message}`);
      await sleep(250 * (attempt + 1));
    }
  }
}
