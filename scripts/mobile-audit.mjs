import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const origin = process.env.COVA_URL || "http://127.0.0.1:5173";
const outDir = resolve("sketches/mobile-audit-2026-07-08");
const viewportWidth = Number(process.env.COVA_VIEWPORT_WIDTH || 390);
const viewportHeight = Number(process.env.COVA_VIEWPORT_HEIGHT || 1200);
const routes = [
  { name: "overview", hash: "overview", needsAuth: false, requiredText: ["See the patterns", "behind your risk.", "What Cova caught", "Daily loss breach"] },
  { name: "overview-auth", hash: "overview", needsAuth: true, requiredText: ["Link account", "Daily loss breach"] },
  { name: "pricing", hash: "pricing", needsAuth: false, requiredText: ["MOST CHOSEN BY ACTIVE TRADERS", "Cova Pro"] },
  { name: "import", hash: "import", needsAuth: true, requiredText: ["Upload CSV first", "Beta connector"] },
  { name: "insights", hash: "coach", needsAuth: true, requiredText: ["Current risk review", "Review note"] },
  { name: "practice", hash: "practice", needsAuth: true, requiredText: ["Practice replay", "Replay chart", "Practice account", "Practice readiness"] },
  { name: "passport", hash: "passport", needsAuth: true, requiredText: ["Sample review · demo data", "Feed 4:5", "Review receipt"] },
];
const selectedRouteNames = new Set((process.env.COVA_ROUTES ?? "").split(",").map((name) => name.trim()).filter(Boolean));
const auditRoutes = selectedRouteNames.size ? routes.filter((route) => selectedRouteNames.has(route.name)) : routes;
const unknownRouteNames = [...selectedRouteNames].filter((name) => !routes.some((route) => route.name === name));

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
  if (unknownRouteNames.length) throw new Error(`Unknown audit routes: ${unknownRouteNames.join(", ")}`);
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
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: viewportWidth < 768 ? 2 : 1,
      mobile: viewportWidth < 768,
      screenWidth: viewportWidth,
      screenHeight: viewportHeight,
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: viewportWidth < 768 });

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
    for (const route of auditRoutes) {
      const cacheBuster = `mobileAudit=${Date.now()}-${route.name}`;
      await cdp.send("Runtime.evaluate", {
        expression: route.needsAuth
          ? `localStorage.setItem('cova-auth-session-v1', ${JSON.stringify(JSON.stringify(session))});`
          : `localStorage.removeItem('cova-auth-session-v1');`,
      });
      await cdp.send("Page.navigate", { url: `${origin}/?${cacheBuster}#${route.hash}` });
      await sleep(route.needsAuth ? 1200 : 900);
      if (route.name === "pricing") {
        await cdp.send("Runtime.evaluate", {
          expression: `(() => { const card = document.querySelector('.plan-card-pro'); if (!card) return; const top = card.getBoundingClientRect().top + window.scrollY - 112; window.scrollTo({ top, behavior: 'instant' }); })();`,
        });
        await sleep(300);
      }
      const audit = await cdp.send("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => {
          const body = document.body.innerText;
          const elements = [...document.querySelectorAll('body *')];
          const recommendationTab = document.querySelector('.plan-recommendation-tab');
          const recommendationCard = document.querySelector('.plan-card-pro');
          const recommendationRect = recommendationTab?.getBoundingClientRect();
          const recommendationCardRect = recommendationCard?.getBoundingClientRect();
          const hero = document.querySelector('.market-hero');
          const heroActions = document.querySelector('.market-hero-actions');
          const heroPrimary = document.querySelector('.market-hero .native-start-button');
          const heroSecondary = document.querySelector('.market-hero-action');
          const heroPrimaryRect = heroPrimary?.getBoundingClientRect();
          const heroSecondaryRect = heroSecondary?.getBoundingClientRect();
          const heroActionsRect = heroActions?.getBoundingClientRect();
          const reaction = document.querySelector('.market-reaction-band');
          const reactionRect = reaction?.getBoundingClientRect();
          const worst = elements.reduce((acc, el) => {
            const delta = el.scrollWidth - el.clientWidth;
            return delta > acc.delta ? { delta, tag: el.tagName, className: String(el.className || '').slice(0, 140), text: (el.textContent || '').trim().slice(0, 120) } : acc;
          }, { delta: 0, tag: '', className: '', text: '' });
          return {
            route: location.hash,
            width: innerWidth,
            height: innerHeight,
            visualViewportWidth: visualViewport?.width ?? null,
            documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            worstOverflow: worst,
            required: ${JSON.stringify(route.requiredText)}.map((text) => ({ text, present: body.toLowerCase().includes(text.toLowerCase()) })),
            hasAuthDialog: body.includes('Enter dev preview') || body.includes('Log in to Cova'),
            title: document.querySelector('h1,h2')?.textContent?.trim() ?? '',
            recommendation: recommendationTab && recommendationCard && recommendationRect && recommendationCardRect ? {
              position: getComputedStyle(recommendationTab).position,
              cardOverflow: getComputedStyle(recommendationCard).overflow,
              rightDelta: Math.round(recommendationCardRect.right - recommendationRect.right),
              fullyInViewport: recommendationRect.left >= 0 && recommendationRect.right <= innerWidth,
              verticallyVisible: recommendationRect.top >= 0 && recommendationRect.bottom <= innerHeight,
            } : null,
            hero: hero && heroActions && heroPrimary && heroSecondary && heroPrimaryRect && heroSecondaryRect ? {
              scrollWidth: hero.scrollWidth,
              clientWidth: hero.clientWidth,
              actionDirection: getComputedStyle(heroActions).flexDirection,
              actionsBottom: heroActionsRect?.bottom ?? null,
              reactionTop: reaction && getComputedStyle(reaction).display !== 'none' ? reactionRect?.top ?? null : null,
              primary: { left: heroPrimaryRect.left, right: heroPrimaryRect.right, width: heroPrimaryRect.width },
              secondary: {
                left: heroSecondaryRect.left,
                right: heroSecondaryRect.right,
                width: heroSecondaryRect.width,
                color: getComputedStyle(heroSecondary).color,
                text: heroSecondary.textContent?.trim() ?? '',
              },
            } : null,
          };
        })()`,
      });
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
      const screenshotPath = join(outDir, `${route.name}-${viewportWidth}x${viewportHeight}.png`);
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      let actionOutcome = null;
      if (route.name === "overview" || route.name === "overview-auth") {
        await cdp.send("Runtime.evaluate", { expression: `document.querySelector('.market-hero-action')?.click();` });
        await sleep(900);
        const outcome = await cdp.send("Runtime.evaluate", {
          returnByValue: true,
          expression: `({ hash: location.hash, hasAuthDialog: document.body.innerText.includes('Log in to Cova'), storyTop: document.querySelector('.story-strip-simple')?.getBoundingClientRect().top ?? null })`,
        });
        actionOutcome = outcome.result.value;
      }
      let footer = null;
      let footerScreenshot = null;
      if (route.name === "overview") {
        await cdp.send("Runtime.evaluate", {
          expression: `(() => {
            document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important');
            document.querySelector('.cta-footer-evidence-room')?.scrollIntoView({ block: 'start', behavior: 'instant' });
          })()`,
        });
        await sleep(600);
        const footerResult = await cdp.send("Runtime.evaluate", {
          returnByValue: true,
          expression: `(() => {
            const element = document.querySelector('.cta-footer-evidence-room');
            const title = document.querySelector('.cta-footer-copy h2');
            const dashboard = document.querySelector('.cta-footer-dashboard .hero-dashboard-shell');
            const rect = (target) => target ? (() => {
              const value = target.getBoundingClientRect();
              return { top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height };
            })() : null;
            return element ? {
              title: title?.textContent?.trim() ?? '',
              backgroundImage: getComputedStyle(element).backgroundImage,
              overflow: element.scrollWidth - element.clientWidth,
              rect: rect(element),
              dashboardRect: rect(dashboard),
            } : null;
          })()`,
        });
        footer = footerResult.result.value;
        const footerCapture = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
        footerScreenshot = join(outDir, `${route.name}-footer-${viewportWidth}x${viewportHeight}.png`);
        await writeFile(footerScreenshot, Buffer.from(footerCapture.data, "base64"));
      }
      results.push({ name: route.name, screenshot: screenshotPath, footerScreenshot, actionOutcome, footer, ...audit.result.value });
    }

    cdp.close();
    const failures = results.flatMap((result) => [
      ...(result.documentOverflow > 0 ? [`${result.name}: document overflow ${result.documentOverflow}px`] : []),
      ...(result.hasAuthDialog ? [`${result.name}: unexpected auth dialog`] : []),
      ...(result.name === "pricing" && result.recommendation?.position !== "absolute" ? ["pricing: recommendation tab is not absolutely attached"] : []),
      ...(result.name === "pricing" && result.recommendation?.cardOverflow !== "visible" ? ["pricing: recommendation tab is clipped by the Pro card"] : []),
      ...(result.name === "pricing" && (!result.recommendation?.fullyInViewport || !result.recommendation?.verticallyVisible || Math.abs(result.recommendation.rightDelta - (viewportWidth < 768 ? 14 : 24)) > 6) ? ["pricing: recommendation tab is not visibly aligned inside the Pro card's upper-right edge"] : []),
      ...(result.name === "overview" && result.hero?.secondary.text !== "See how it works" ? ["overview: original secondary CTA label is not visible"] : []),
      ...(result.name === "overview" && (result.hero?.secondary.left < 0 || result.hero?.secondary.right > result.width) ? ["overview: secondary CTA overflows the viewport"] : []),
      ...(result.name === "overview" && (result.actionOutcome?.hasAuthDialog || result.actionOutcome?.hash !== "#overview" || result.actionOutcome?.storyTop > result.height) ? ["overview: signed-out secondary CTA did not scroll to public proof"] : []),
      ...(result.name === "overview-auth" && (result.actionOutcome?.hasAuthDialog || result.actionOutcome?.hash !== "#import") ? ["overview-auth: signed-in secondary CTA did not preserve Import routing"] : []),
      ...(result.name.startsWith("overview") && viewportHeight <= 760 && result.hero?.actionsBottom > viewportHeight ? [`${result.name}: hero actions fall below the short desktop fold`] : []),
      ...(result.name.startsWith("overview") && result.hero?.reactionTop !== null && result.hero?.actionsBottom > result.hero?.reactionTop ? [`${result.name}: hero actions collide with the testimonial rail`] : []),
      ...(result.name === "overview" && !result.footer ? ["overview: footer evidence room missing"] : []),
      ...(result.name === "overview" && result.footer && !result.footer.backgroundImage.includes("239, 184, 141") ? ["overview: footer apricot background missing"] : []),
      ...(result.name === "overview" && result.footer?.title !== "Stop repeating the trade that keeps costing you." ? ["overview: footer headline mismatch"] : []),
      ...(result.name === "overview" && (result.footer?.overflow ?? 0) > 1 ? [`overview: footer overflow ${result.footer.overflow}px`] : []),
      ...(result.name === "overview" && result.footer?.dashboardRect && (result.footer.dashboardRect.left < -1 || result.footer.dashboardRect.right > result.width + 1) ? ["overview: footer dashboard escapes viewport"] : []),
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
