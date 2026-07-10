import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.COVA_URL || "http://127.0.0.1:4173";
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const screenshotDir = process.env.COVA_CURSOR_SCREENSHOT_DIR || "sketches/operator-dossier";
const profile = await mkdtemp(join(tmpdir(), "cova-cursor-audit-"));
const auditTargetToken = `cova-cursor-audit-${randomUUID()}`;
const port = await allocateFreePort();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `data:text/html,${auditTargetToken}`,
], { stdio: "ignore" });
const stage = (name) => console.error(`[cursor-audit] ${name}`);

function allocateFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a free CDP port")));
        return;
      }
      const freePort = address.port;
      server.close((error) => error ? reject(error) : resolve(freePort));
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
        request.rejectRequest(new Error("CDP connection closed before the request completed"));
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

async function navigate(client, url) {
  await client.send("Page.navigate", { url });
  await sleep(1700);
  await client.send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
}

async function moveMouse(client, x, y) {
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, pointerType: "mouse" });
  await sleep(320);
}

async function cursorSnapshot(client) {
  return evaluate(client, `(() => {
    const root = document.querySelector('.cova-cursor');
    const point = document.querySelector('.cova-cursor-point');
    const frame = document.querySelector('.cova-cursor-frame');
    const geometry = document.querySelector('.cova-cursor-frame-geometry');
    const pr = point?.getBoundingClientRect();
    const fr = frame?.getBoundingClientRect();
    return {
      activeClass: document.documentElement.classList.contains('cova-custom-cursor-active'),
      visible: root?.classList.contains('is-visible') ?? false,
      state: root?.dataset.cursorState ?? null,
      rootPointerEvents: root ? getComputedStyle(root).pointerEvents : null,
      rootDisplay: root ? getComputedStyle(root).display : null,
      bodyCursor: getComputedStyle(document.body).cursor,
      point: pr ? { x: pr.left + pr.width / 2, y: pr.top + pr.height / 2, width: pr.width, height: pr.height } : null,
      frame: fr ? { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2, width: fr.width, height: fr.height } : null,
      frameRotate: geometry ? getComputedStyle(geometry).rotate : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);
}

try {
  await getJson(`http://127.0.0.1:${port}/json/version`);
  assert.equal(chrome.exitCode, null, "Spawned Chrome must still own the audit session");
  const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
  const page = targets.find((target) => target.type === "page" && target.url.includes(auditTargetToken));
  assert.ok(page, "Chrome page target must belong to this audit instance");
  const client = await connect(page.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900 });
  await client.send("Emulation.setEmulatedMedia", { media: "", features: [] });
  stage("desktop default");
  await navigate(client, `${baseUrl}/?cursorAudit=desktop#overview`);

  await moveMouse(client, 350, 420);
  const defaultState = await cursorSnapshot(client);
  assert.equal(defaultState.activeClass, true, "Desktop mouse movement should activate custom cursor mode");
  assert.equal(defaultState.visible, true, "Desktop cursor should become visible after first mouse coordinate");
  assert.equal(defaultState.state, "default", "Non-interactive hero copy should use default state");
  assert.equal(defaultState.bodyCursor, "none", "Native cursor should be hidden after custom cursor activation");
  assert.equal(defaultState.rootPointerEvents, "none", "Cursor layer must not intercept input");
  assert.equal(defaultState.frameRotate, "45deg", "Default reticle should render as a 45-degree diamond");
  assert.ok(Math.abs(defaultState.point.x - 350) <= 1 && Math.abs(defaultState.point.y - 420) <= 1, "Exact point should match the real pointer coordinate");
  assert.ok(Math.abs(defaultState.frame.x - 350) <= 1 && Math.abs(defaultState.frame.y - 420) <= 1, "Frame should converge to the pointer coordinate");
  assert.equal(defaultState.overflow, 0, "Cursor must not create layout overflow");

  const diamondShot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: 300, y: 370, width: 100, height: 100, scale: 2 },
  });
  const diamondPath = `${screenshotDir}/cursor-reticle-diamond-closeup.png`;
  await writeFile(diamondPath, Buffer.from(diamondShot.data, "base64"));

  const safetyTargets = await evaluate(client, `(() => {
    const hidden = document.createElement('div');
    hidden.dataset.cursor = 'hidden';
    hidden.style.cssText = 'position:fixed;left:12px;top:180px;width:96px;height:72px;z-index:2147483000;';
    document.body.appendChild(hidden);
    const disabled = document.createElement('button');
    disabled.setAttribute('aria-disabled', 'true');
    disabled.dataset.cursor = 'action';
    disabled.style.cssText = 'position:fixed;left:12px;top:280px;width:120px;height:56px;z-index:2147483000;';
    document.body.appendChild(disabled);
    const hiddenRect = hidden.getBoundingClientRect();
    const disabledRect = disabled.getBoundingClientRect();
    return {
      hidden: { x: hiddenRect.left + hiddenRect.width / 2, y: hiddenRect.top + hiddenRect.height / 2 },
      disabled: { x: disabledRect.left + disabledRect.width / 2, y: disabledRect.top + disabledRect.height / 2 },
    };
  })()`);

  await moveMouse(client, safetyTargets.hidden.x, safetyTargets.hidden.y);
  const hiddenState = await cursorSnapshot(client);
  assert.equal(hiddenState.activeClass, false, "Hidden/media targets should restore the native cursor instead of making both cursors invisible");
  assert.notEqual(hiddenState.bodyCursor, "none", "Hidden/media targets must not retain global cursor:none");

  await moveMouse(client, 350, 420);
  await evaluate(client, "window.dispatchEvent(new Event('blur'))");
  const blurredState = await cursorSnapshot(client);
  assert.equal(blurredState.activeClass, false, "Window blur should restore the native cursor");
  assert.notEqual(blurredState.bodyCursor, "none", "Window blur must not leave both cursors invisible");

  await moveMouse(client, 350, 420);
  await evaluate(client, `window.dispatchEvent(new PointerEvent('pointerover', { pointerType: 'touch', bubbles: true }))`);
  const hybridTouchState = await cursorSnapshot(client);
  assert.equal(hybridTouchState.activeClass, false, "Touch/pen pointerover should immediately deactivate mouse cursor mode on hybrid devices");

  await moveMouse(client, safetyTargets.disabled.x, safetyTargets.disabled.y);
  const disabledState = await cursorSnapshot(client);
  assert.equal(disabledState.state, "disabled", "aria-disabled must take precedence over explicit action cursor overrides");
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: safetyTargets.disabled.x, y: safetyTargets.disabled.y, button: "left", clickCount: 1, pointerType: "mouse" });
  await sleep(120);
  const disabledPressedState = await cursorSnapshot(client);
  assert.equal(disabledPressedState.state, "disabled", "Pressing an aria-disabled control must preserve disabled semantics");
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: safetyTargets.disabled.x, y: safetyTargets.disabled.y, button: "left", clickCount: 1, pointerType: "mouse" });

  await moveMouse(client, 350, 420);
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 350, y: 420, button: "left", clickCount: 1, pointerType: "mouse" });
  await evaluate(client, "document.documentElement.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))");
  const leftViewportState = await cursorSnapshot(client);
  assert.equal(leftViewportState.activeClass, false, "Leaving the viewport while pressed should restore native cursor mode");
  assert.equal(leftViewportState.state, "default", "Leaving the viewport should clear a stuck pressed state");
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 350, y: 420, button: "left", clickCount: 1, pointerType: "mouse" });

  const cta = await evaluate(client, `(() => {
    const element = [...document.querySelectorAll('button,a')].find((node) => /start for free/i.test(node.textContent || ''));
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  })()`);
  assert.ok(cta, "Hero/header Start for free control should exist");
  await moveMouse(client, cta.x, cta.y);
  const actionState = await cursorSnapshot(client);
  assert.equal(actionState.state, "action", "Interactive control should expand to action state");
  assert.ok(actionState.frame.width >= 31 && actionState.frame.width <= 33, "Action frame should be approximately 32px");
  assert.ok(Math.abs(actionState.frame.x - actionState.point.x) <= 3 && Math.abs(actionState.frame.y - actionState.point.y) <= 3, "Action frame should settle within 3px of the exact point");
  assert.equal(actionState.frameRotate, "0deg", "Interactive hover should settle the reticle into a square");

  const fullShot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const fullPath = `${screenshotDir}/cursor-reticle-action-preview.png`;
  await writeFile(fullPath, Buffer.from(fullShot.data, "base64"));
  const closeShot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    clip: {
      x: Math.max(0, cta.left - 90),
      y: Math.max(0, cta.top - 55),
      width: Math.min(360, 1440 - Math.max(0, cta.left - 90)),
      height: Math.min(180, 900 - Math.max(0, cta.top - 55)),
      scale: 2,
    },
  });
  const closePath = `${screenshotDir}/cursor-reticle-action-closeup.png`;
  await writeFile(closePath, Buffer.from(closeShot.data, "base64"));

  await moveMouse(client, 350, 420);
  const offActionState = await cursorSnapshot(client);
  assert.equal(offActionState.state, "default", "Leaving an interactive target should restore default state");
  assert.equal(offActionState.frameRotate, "45deg", "Leaving an interactive target should ease the reticle back to a diamond");
  await moveMouse(client, cta.x, cta.y);

  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cta.x, y: cta.y, button: "left", clickCount: 1, pointerType: "mouse" });
  await sleep(180);
  const pressedState = await cursorSnapshot(client);
  assert.equal(pressedState.state, "pressed", "Pointer down should compress to pressed state");
  assert.ok(pressedState.frame.width <= 17, "Pressed frame should compress to approximately 16px");
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cta.x, y: cta.y, button: "left", clickCount: 1, pointerType: "mouse" });
  await sleep(420);

  const input = await evaluate(client, `(() => {
    const element = document.querySelector('input:not([type]), input[type="email"], input[type="text"]');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  assert.ok(input, "Clicking Start for free should expose an auth text field");
  await moveMouse(client, input.x, input.y);
  const textState = await cursorSnapshot(client);
  assert.equal(textState.state, "text", "Text field should use the custom I-beam state");
  assert.ok(textState.frame.width <= 3 && textState.frame.height >= 21, "Text state should render a narrow vertical I-beam");
  assert.ok(Math.abs(textState.frame.x - input.x) <= 3 && Math.abs(textState.frame.y - input.y) <= 3, "Text I-beam should remain on the exact selection coordinate without decorative lag");

  await evaluate(client, `(() => {
    localStorage.setItem('cova-auth-session-v1', JSON.stringify({
      email: 'cursor-audit@cova.local',
      mode: 'login',
      plan: 'free',
      source: 'local-preview',
      signedInAt: new Date().toISOString()
    }));
    return true;
  })()`);
  stage("passport grab");
  await navigate(client, `${baseUrl}/?cursorAudit=passport#passport`);
  const grabTarget = await evaluate(client, `(() => {
    const element = document.querySelector('.passport-card-hitbox');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + Math.min(180, rect.height / 3) };
  })()`);
  assert.ok(grabTarget, "Signed-in Passport should expose the draggable credential surface");
  await moveMouse(client, grabTarget.x, grabTarget.y);
  const grabState = await cursorSnapshot(client);
  assert.equal(grabState.state, "grab", "Passport credential should use the custom grab state");
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: grabTarget.x, y: grabTarget.y, button: "left", clickCount: 1, pointerType: "mouse" });
  await sleep(180);
  const grabbingState = await cursorSnapshot(client);
  assert.equal(grabbingState.state, "grabbing", "Pressed Passport credential should use the custom grabbing state");
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: grabTarget.x, y: grabTarget.y, button: "left", clickCount: 1, pointerType: "mouse" });

  stage("touch fallback");
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
  await client.send("Emulation.setEmulatedMedia", { media: "", features: [] });
  await navigate(client, `${baseUrl}/?cursorAudit=touch#overview`);
  await moveMouse(client, 180, 260);
  const touchState = await cursorSnapshot(client);
  assert.equal(touchState.activeClass, false, "Touch/mobile mode should preserve the native cursor");
  assert.notEqual(touchState.bodyCursor, "none", "Touch/mobile mode must not apply global cursor:none");
  assert.equal(touchState.rootDisplay, "none", "Custom layer should be removed from mobile layout geometry");

  stage("reduced motion fallback");
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900 });
  await client.send("Emulation.setEmulatedMedia", { media: "", features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate(client, `${baseUrl}/?cursorAudit=reduced#overview`);
  await moveMouse(client, 350, 420);
  const reducedState = await cursorSnapshot(client);
  assert.equal(reducedState.activeClass, false, "Reduced-motion mode should preserve the native cursor");
  assert.notEqual(reducedState.bodyCursor, "none", "Reduced-motion mode must not hide the native cursor");
  assert.equal(reducedState.rootDisplay, "none", "Reduced-motion CSS fallback should suppress the custom layer");

  stage("forced colors fallback");
  await client.send("Emulation.setEmulatedMedia", { media: "", features: [{ name: "forced-colors", value: "active" }] });
  await navigate(client, `${baseUrl}/?cursorAudit=forced-colors#overview`);
  await moveMouse(client, 350, 420);
  const forcedColorsState = await cursorSnapshot(client);
  assert.equal(forcedColorsState.activeClass, false, "Forced-colors mode should preserve the native cursor");
  assert.notEqual(forcedColorsState.bodyCursor, "none", "Forced-colors mode must not hide the native cursor");
  assert.equal(forcedColorsState.rootDisplay, "none", "Forced-colors CSS fallback should suppress the custom layer");

  stage("short desktop");
  await client.send("Emulation.setEmulatedMedia", { media: "", features: [] });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false, screenWidth: 1280, screenHeight: 720 });
  await navigate(client, `${baseUrl}/?cursorAudit=short-desktop#overview`);
  await moveMouse(client, 320, 360);
  const shortDesktopState = await cursorSnapshot(client);
  assert.equal(shortDesktopState.activeClass, true, "Short desktop viewport should retain the custom cursor");
  assert.equal(shortDesktopState.overflow, 0, "Custom cursor should not create overflow at 1280x720");

  stage("complete");
  console.log(JSON.stringify({
    baseUrl,
    screenshots: { diamond: diamondPath, full: fullPath, closeup: closePath },
    defaultState,
    hiddenState,
    blurredState,
    hybridTouchState,
    disabledState,
    disabledPressedState,
    leftViewportState,
    actionState,
    offActionState,
    pressedState,
    textState,
    grabState,
    grabbingState,
    shortDesktopState,
    touchFallback: { activeClass: touchState.activeClass, bodyCursor: touchState.bodyCursor },
    reducedMotionFallback: { activeClass: reducedState.activeClass, bodyCursor: reducedState.bodyCursor },
    forcedColorsFallback: { activeClass: forcedColorsState.activeClass, bodyCursor: forcedColorsState.bodyCursor },
  }, null, 2));
  client.close();
} finally {
  chrome.kill("SIGTERM");
  await sleep(250);
  await rm(profile, { recursive: true, force: true });
}
