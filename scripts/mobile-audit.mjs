import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const origin = process.env.COVA_URL || "http://127.0.0.1:5173";
const outDir = resolve("sketches/mobile-audit-2026-07-08");
const routes = [
  { name: "overview", hash: "overview", needsAuth: false, requiredText: ["What Cova caught", "Daily loss breach"] },
  { name: "import", hash: "import", needsAuth: true, requiredText: ["Upload CSV first", "Beta connector"] },
  { name: "insights", hash: "coach", needsAuth: true, requiredText: ["Current risk review", "Review note"] },
  { name: "practice", hash: "practice", needsAuth: true, requiredText: ["Practice replay", "Replay chart", "Practice account", "Practice readiness"] },
  { name: "passport", hash: "passport", needsAuth: true, requiredText: ["Sample review · demo data", "Feed 4:5", "Review receipt"] },
];

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function waitForJson(url, timeoutMs = 10000) {
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
    await sleep(150);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function connectCdp(wsUrl) {
  return new Promise((resolveConnect, rejectConnect) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const callbacks = new Map();
    ws.addEventListener("open", () => {
      const client = {
        send(method, params = {}) {
          const messageId = ++id;
          ws.send(JSON.stringify({ id: messageId, method, params }));
          return new Promise((resolveSend, rejectSend) => {
            callbacks.set(messageId, { resolve: resolveSend, reject: rejectSend, method });
          });
        },
        close() {
          ws.close();
        },
      };
      resolveConnect(client);
    });
    ws.addEventListener("message", (event) => {
      const data = JSON.parse(String(event.data));
      if (!data.id) return;
      const callback = callbacks.get(data.id);
      if (!callback) return;
      callbacks.delete(data.id);
      if (data.error) {
        callback.reject(new Error(`${callback.method}: ${data.error.message}`));
      } else {
        callback.resolve(data.result ?? {});
      }
    });
    ws.addEventListener("error", rejectConnect);
  });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const profileDir = await mkdtemp(join(tmpdir(), "cova-mobile-chrome-"));
  const port = 9300 + Math.floor(Math.random() * 400);
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let stderr = "";
  chrome.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (!pageTarget) throw new Error("No page target available from Chrome CDP.");
    const cdp = await connectCdp(pageTarget.webSocketDebuggerUrl);

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 1200,
      deviceScaleFactor: 2,
      mobile: true,
      screenWidth: 390,
      screenHeight: 1200,
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });

    await cdp.send("Page.navigate", { url: `${origin}/#overview` });
    await sleep(800);
    const session = {
      email: "preview@cova.local",
      mode: "login",
      plan: "free",
      signedInAt: new Date().toISOString(),
      source: "local-preview",
      subscriptionStatus: "preview",
    };
    await cdp.send("Runtime.evaluate", {
      expression: `localStorage.setItem('cova-auth-session-v1', ${JSON.stringify(JSON.stringify(session))});`,
      returnByValue: true,
    });

    const results = [];
    for (const route of routes) {
      const cacheBuster = `mobileAudit=${Date.now()}-${route.name}`;
      await cdp.send("Page.navigate", { url: `${origin}/?${cacheBuster}#${route.hash}` });
      await sleep(route.needsAuth ? 1200 : 900);
      const audit = await cdp.send("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => {
          const body = document.body.innerText;
          const elements = [...document.querySelectorAll('body *')];
          const worst = elements.reduce((acc, el) => {
            const delta = el.scrollWidth - el.clientWidth;
            return delta > acc.delta ? { delta, tag: el.tagName, className: String(el.className || '').slice(0, 140), text: (el.textContent || '').trim().slice(0, 120) } : acc;
          }, { delta: 0, tag: '', className: '', text: '' });
          return {
            route: location.hash,
            width: innerWidth,
            documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            worstOverflow: worst,
            required: ${JSON.stringify(route.requiredText)}.map((text) => ({ text, present: body.toLowerCase().includes(text.toLowerCase()) })),
            hasAuthDialog: body.includes('Enter dev preview'),
            title: document.querySelector('h1,h2')?.textContent?.trim() ?? '',
          };
        })()`,
      });
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
      const screenshotPath = join(outDir, `${route.name}-390.png`);
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      results.push({ name: route.name, screenshot: screenshotPath, ...audit.result.value });
    }

    cdp.close();
    const failures = results.flatMap((result) => [
      ...(result.documentOverflow > 0 ? [`${result.name}: document overflow ${result.documentOverflow}px`] : []),
      ...(result.hasAuthDialog ? [`${result.name}: unexpected auth dialog`] : []),
      ...result.required.filter((check) => !check.present).map((check) => `${result.name}: missing “${check.text}”`),
    ]);
    console.log(JSON.stringify({ outDir, results, failures }, null, 2));
    if (failures.length) {
      throw new Error(`Mobile audit failed:\n${failures.join("\n")}`);
    }
  } finally {
    chrome.kill("SIGTERM");
    await sleep(300);
    await rm(profileDir, { recursive: true, force: true });
    if (stderr && process.env.CDP_DEBUG) {
      console.error(stderr);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
