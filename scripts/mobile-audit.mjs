import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  { name: "import", hash: "import", needsAuth: true, requiredText: ["Upload CSV first", "TopstepX export", "CSV guide"] },
  { name: "insights", hash: "coach", needsAuth: true, requiredText: ["Current risk review", "Review note"] },
  {
    name: "practice",
    hash: "practice",
    needsAuth: true,
    requiredText: viewportWidth < 1024
      ? ["Practice is built for desktop", "Back to risk desk"]
      : ["Build the replay account first.", "Set practice account", "Enter replay simulator"],
  },
  { name: "passport", hash: "passport", needsAuth: true, requiredText: ["Sample review · demo data", "Feed 4:5", "Review receipt"] },
];
const selectedRouteNames = new Set((process.env.COVA_ROUTES ?? "").split(",").map((name) => name.trim()).filter(Boolean));
const auditRoutes = selectedRouteNames.size ? routes.filter((route) => selectedRouteNames.has(route.name)) : routes;
const unknownRouteNames = [...selectedRouteNames].filter((name) => !routes.some((route) => route.name === name));

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function waitForChromeExit(chrome, timeoutMs = 5_000) {
  const started = Date.now();
  while (chrome.exitCode === null && Date.now() - started < timeoutMs) await sleep(50);
  return chrome.exitCode !== null;
}

async function terminateChromeTree(chrome, cdp) {
  if (chrome.exitCode === null && cdp) {
    await Promise.race([cdp.send("Browser.close").catch(() => {}), sleep(500)]);
    if (await waitForChromeExit(chrome, 3_000)) return;
  }
  if (chrome.exitCode === null) {
    if (process.platform === "win32" && chrome.pid) {
      await new Promise((resolveTerminate, rejectTerminate) => {
        execFile("taskkill.exe", ["/PID", String(chrome.pid), "/T", "/F"], (error) => error ? rejectTerminate(error) : resolveTerminate());
      });
    } else if (!chrome.kill("SIGTERM")) {
      throw new Error("Owned Chrome process refused SIGTERM.");
    }
  }
  if (!await waitForChromeExit(chrome)) throw new Error("Owned Chrome process did not exit after termination.");
}

async function removeProfileDirectory(profileDir) {
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

async function waitForDevToolsActivePort(profileDir, chrome, timeoutMs = 10_000) {
  const activePortPath = join(profileDir, "DevToolsActivePort");
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    if (chrome.exitCode !== null) throw new Error(`Owned Chrome exited before publishing DevToolsActivePort (${chrome.exitCode}).`);
    try {
      const [portLine] = (await readFile(activePortPath, "utf8")).split(/\r?\n/);
      const port = Number(portLine);
      if (Number.isInteger(port) && port > 0 && port < 65_536) return port;
      lastError = new Error(`Invalid DevToolsActivePort value: ${portLine}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(75);
  }
  throw lastError ?? new Error("Owned Chrome did not publish DevToolsActivePort.");
}

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
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let stderr = "";
  let cdp;
  chrome.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  try {
    const port = await waitForDevToolsActivePort(profileDir, chrome);
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (!pageTarget) throw new Error("No page target available from Chrome CDP.");
    cdp = await connectCdp(pageTarget.webSocketDebuggerUrl);

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
          const pricingActions = [...document.querySelectorAll('.plan-primary-action, .plan-secondary-action')].map((element) => {
            const rect = element.getBoundingClientRect();
            return { label: element.textContent?.trim() ?? '', height: rect.height };
          });
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
            hasAuthDialog: body.includes('Enter dev preview') || body.includes('Sign in to Cova'),
            title: document.querySelector('h1,h2')?.textContent?.trim() ?? '',
            pricingActions,
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
          expression: `({ hash: location.hash, hasAuthDialog: document.body.innerText.includes('Sign in to Cova'), storyTop: document.querySelector('.story-strip-simple')?.getBoundingClientRect().top ?? null })`,
        });
        actionOutcome = outcome.result.value;
      }
      let practiceOutcome = null;
      let practiceScreenshot = null;
      if (route.name === "practice") {
        if (viewportWidth >= 1024) {
          await cdp.send("Runtime.evaluate", { expression: `document.querySelector('.practice-setup-card')?.requestSubmit();` });
          await sleep(1200);
        }
        const practiceResult = await cdp.send("Runtime.evaluate", {
          returnByValue: true,
          expression: `(() => {
            const command = document.querySelector('.backtesting-command-strip');
            const root = document.documentElement;
            const terminal = document.querySelector('.backtesting-terminal');
            const chart = document.querySelector('.backtesting-chart-viewport');
            const orderRail = document.querySelector('.backtesting-order-rail');
            const availabilityGate = document.querySelector('.practice-availability-gate');
            const inspectVisibility = (element) => {
              if (!element) return { present: false, rendered: false, inViewport: false, rect: null };
              const style = getComputedStyle(element);
              const value = element.getBoundingClientRect();
              const rendered = style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && Number.parseFloat(style.opacity || '1') > 0 && value.width > 0 && value.height > 0;
              const inViewport = rendered && value.bottom > 0 && value.top < innerHeight && value.right > 0 && value.left < innerWidth;
              return {
                present: true,
                rendered,
                inViewport,
                rect: { top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height },
              };
            };
            const terminalState = inspectVisibility(terminal);
            const chartState = inspectVisibility(chart);
            const orderRailState = inspectVisibility(orderRail);
            return {
              setupOpen: Boolean(document.querySelector('.practice-setup-modal')),
              terminalVisible: terminalState.inViewport,
              chartVisible: chartState.inViewport,
              orderRailVisible: orderRailState.inViewport,
              terminalState,
              chartState,
              orderRailState,
              orderTicketPresent: orderRail?.innerText.toLowerCase().includes('order ticket') ?? false,
              practiceLimitsPresent: orderRail?.innerText.toLowerCase().includes('within practice limits') ?? false,
              availabilityGateVisible: inspectVisibility(availabilityGate).inViewport,
              documentOverflow: root.scrollWidth - root.clientWidth,
              commandOverflow: command ? command.scrollWidth - command.clientWidth : null,
              commandOverflowX: command ? getComputedStyle(command).overflowX : null,
            };
          })()`,
        });
        practiceOutcome = practiceResult.result.value;
        if (viewportWidth < 1024) {
          await cdp.send("Emulation.setDeviceMetricsOverride", {
            width: 1440,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false,
            screenWidth: 1440,
            screenHeight: 900,
          });
          await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
          await sleep(500);
          const desktopBoundary = await cdp.send("Runtime.evaluate", {
            returnByValue: true,
            expression: `({ gate: Boolean(document.querySelector('.practice-availability-gate')), terminal: Boolean(document.querySelector('.backtesting-terminal')), setupOpen: Boolean(document.querySelector('.practice-setup-modal')) })`,
          });
          await cdp.send("Runtime.evaluate", {
            expression: `(() => { const button = [...document.querySelectorAll('.backtesting-bottom-desk nav button')].find((item) => item.textContent?.trim() === 'Trades'); button?.click(); })()`,
          });
          await sleep(100);
          const selectedDeskBeforeGate = await cdp.send("Runtime.evaluate", {
            returnByValue: true,
            expression: `document.querySelector('.backtesting-bottom-desk nav button[aria-selected="true"]')?.textContent?.trim() ?? null`,
          });
          await cdp.send("Emulation.setDeviceMetricsOverride", {
            width: viewportWidth,
            height: viewportHeight,
            deviceScaleFactor: 2,
            mobile: true,
            screenWidth: viewportWidth,
            screenHeight: viewportHeight,
          });
          await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
          await sleep(500);
          const mobileBoundary = await cdp.send("Runtime.evaluate", {
            returnByValue: true,
            expression: `({ gate: Boolean(document.querySelector('.practice-availability-gate')), terminal: Boolean(document.querySelector('.backtesting-terminal')), setupOpen: Boolean(document.querySelector('.practice-setup-modal')) })`,
          });
          await cdp.send("Emulation.setDeviceMetricsOverride", {
            width: 1440,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false,
            screenWidth: 1440,
            screenHeight: 900,
          });
          await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
          await sleep(500);
          const restoredDesk = await cdp.send("Runtime.evaluate", {
            returnByValue: true,
            expression: `({ gate: Boolean(document.querySelector('.practice-availability-gate')), terminal: Boolean(document.querySelector('.backtesting-terminal')), selectedDesk: document.querySelector('.backtesting-bottom-desk nav button[aria-selected="true"]')?.textContent?.trim() ?? null })`,
          });
          await cdp.send("Emulation.setDeviceMetricsOverride", {
            width: viewportWidth,
            height: viewportHeight,
            deviceScaleFactor: 2,
            mobile: true,
            screenWidth: viewportWidth,
            screenHeight: viewportHeight,
          });
          await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
          await sleep(500);
          practiceOutcome.boundaryTransition = {
            desktop: desktopBoundary.result.value,
            selectedDeskBeforeGate: selectedDeskBeforeGate.result.value,
            mobile: mobileBoundary.result.value,
            desktopRestored: restoredDesk.result.value,
          };
        }
        const practiceCapture = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
        practiceScreenshot = join(outDir, `${route.name}-terminal-${viewportWidth}x${viewportHeight}.png`);
        await writeFile(practiceScreenshot, Buffer.from(practiceCapture.data, "base64"));
      }
      let footer = null;
      let footerScreenshot = null;
      let footerPrimaryOutcome = null;
      let footerSecondaryOutcome = null;
      if (route.name === "overview" || route.name === "overview-auth") {
        const footerUrl = `${origin}/?mobileAudit=${Date.now()}-${route.name}-footer#overview`;
        await cdp.send("Page.navigate", { url: footerUrl });
        await sleep(route.needsAuth ? 1200 : 900);
        await cdp.send("Runtime.evaluate", {
          expression: `(() => {
            document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important');
            document.querySelector('.cova-closing-section')?.scrollIntoView({ block: 'center', behavior: 'instant' });
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
          })()`,
        });
        await sleep(600);
        const footerResult = await cdp.send("Runtime.evaluate", {
          returnByValue: true,
          expression: `(() => {
            const element = document.querySelector('.cova-closing-section');
            const siteFooter = document.querySelector('.cova-site-footer');
            const title = document.querySelector('.cova-closing-title');
            const primary = document.querySelector('.cova-closing-primary');
            const secondary = document.querySelector('.cova-closing-secondary');
            const rect = (target) => target ? (() => {
              const value = target.getBoundingClientRect();
              return { top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height };
            })() : null;
            return element ? {
              title: title?.textContent?.trim() ?? '',
              backgroundColor: getComputedStyle(element).backgroundColor,
              overflow: element.scrollWidth - element.clientWidth,
              rect: rect(element),
              footerRect: rect(siteFooter),
              footerSeparate: Boolean(siteFooter) && !element.contains(siteFooter) && (siteFooter?.getBoundingClientRect().top ?? 0) >= element.getBoundingClientRect().bottom - 1,
              dashboardInside: Boolean(element.querySelector('.footer-performance-proof, .cta-footer-dashboard, img')),
              reviewsInside: /what people are saying|marcus r\.|daniel c\.|jasmine b\./i.test(element.innerText),
              legalLabels: [...(siteFooter?.querySelectorAll('nav[aria-label="Legal and support"] button, nav[aria-label="Legal and support"] a') ?? [])].map((item) => item.textContent?.trim() ?? ''),
              primaryText: primary?.textContent?.trim() ?? '',
              secondaryText: secondary?.textContent?.trim() ?? '',
            } : null;
          })()`,
        });
        footer = footerResult.result.value;
        const footerCapture = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
        footerScreenshot = join(outDir, `${route.name}-footer-${viewportWidth}x${viewportHeight}.png`);
        await writeFile(footerScreenshot, Buffer.from(footerCapture.data, "base64"));

        await cdp.send("Runtime.evaluate", { expression: `document.querySelector('.cova-closing-primary')?.click();` });
        await sleep(700);
        const primaryOutcome = await cdp.send("Runtime.evaluate", {
          returnByValue: true,
          expression: `(() => {
            const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
            return { hash: location.hash, hasAuthDialog: Boolean(dialog), dialogLabel: dialog?.getAttribute('aria-label') ?? null };
          })()`,
        });
        footerPrimaryOutcome = primaryOutcome.result.value;

        await cdp.send("Page.navigate", { url: `${origin}/?mobileAudit=${Date.now()}-${route.name}-secondary#overview` });
        await sleep(route.needsAuth ? 1200 : 900);
        await cdp.send("Runtime.evaluate", {
          expression: `(() => {
            document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important');
            document.querySelector('.cova-closing-section')?.scrollIntoView({ block: 'center', behavior: 'instant' });
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
            document.querySelector('.cova-closing-secondary')?.click();
          })()`,
        });
        await sleep(900);
        const secondaryOutcome = await cdp.send("Runtime.evaluate", {
          returnByValue: true,
          expression: `(() => {
            const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
            return { hash: location.hash, hasAuthDialog: Boolean(dialog), dialogLabel: dialog?.getAttribute('aria-label') ?? null };
          })()`,
        });
        footerSecondaryOutcome = secondaryOutcome.result.value;
      }
      results.push({ name: route.name, screenshot: screenshotPath, practiceScreenshot, footerScreenshot, actionOutcome, practiceOutcome, footer, footerPrimaryOutcome, footerSecondaryOutcome, ...audit.result.value });
    }

    const failures = results.flatMap((result) => [
      ...(result.documentOverflow > 0 ? [`${result.name}: document overflow ${result.documentOverflow}px`] : []),
      ...(result.hasAuthDialog ? [`${result.name}: unexpected auth dialog`] : []),
      ...(result.name === "pricing" && result.recommendation?.position !== "absolute" ? ["pricing: recommendation tab is not absolutely attached"] : []),
      ...(result.name === "pricing" && result.recommendation?.cardOverflow !== "visible" ? ["pricing: recommendation tab is clipped by the Pro card"] : []),
      ...(result.name === "pricing" && (!result.recommendation?.fullyInViewport || !result.recommendation?.verticallyVisible || Math.abs(result.recommendation.rightDelta - (viewportWidth < 768 ? 14 : 24)) > 6) ? ["pricing: recommendation tab is not visibly aligned inside the Pro card's upper-right edge"] : []),
      ...(result.name === "pricing" && viewportWidth < 768 ? result.pricingActions.filter((action) => action.height < 44).map((action) => `pricing: “${action.label}” touch target is ${action.height.toFixed(2)}px tall`) : []),
      ...(result.name === "overview" && result.hero?.secondary.text !== "See how it works" ? ["overview: original secondary CTA label is not visible"] : []),
      ...(result.name === "overview" && (result.hero?.secondary.left < 0 || result.hero?.secondary.right > result.width) ? ["overview: secondary CTA overflows the viewport"] : []),
      ...(result.name === "overview" && (result.actionOutcome?.hasAuthDialog || result.actionOutcome?.hash !== "#overview" || result.actionOutcome?.storyTop > result.height) ? ["overview: signed-out secondary CTA did not scroll to public proof"] : []),
      ...(result.name === "overview-auth" && (result.actionOutcome?.hasAuthDialog || result.actionOutcome?.hash !== "#import") ? ["overview-auth: signed-in secondary CTA did not preserve Import routing"] : []),
      ...(result.name.startsWith("overview") && viewportHeight <= 760 && result.hero?.actionsBottom > viewportHeight ? [`${result.name}: hero actions fall below the short desktop fold`] : []),
      ...(result.name.startsWith("overview") && result.hero?.reactionTop !== null && result.hero?.actionsBottom > result.hero?.reactionTop ? [`${result.name}: hero actions collide with the testimonial rail`] : []),
      ...(result.name === "overview" && !result.footer ? ["overview: approved closing CTA missing"] : []),
      ...(result.name === "overview" && result.footer && result.footer.backgroundColor !== "rgb(240, 187, 145)" ? ["overview: approved peach background missing"] : []),
      ...(result.name === "overview" && result.footer?.title !== "Stop repeating the trade that keeps costing you." ? ["overview: footer headline mismatch"] : []),
      ...(result.name === "overview" && (result.footer?.overflow ?? 0) > 1 ? [`overview: footer overflow ${result.footer.overflow}px`] : []),
      ...(result.name === "overview" && result.footer?.dashboardInside ? ["overview: dashboard duplicated inside closing CTA"] : []),
      ...(result.name === "overview" && result.footer?.reviewsInside ? ["overview: reviews duplicated inside closing CTA"] : []),
      ...(result.name === "overview" && !result.footer?.footerSeparate ? ["overview: normal footer is not separate from closing CTA"] : []),
      ...(result.name === "overview" && result.footer?.legalLabels?.join('|') !== "Privacy|Terms|Security|Support" ? ["overview: public legal or support footer links are missing"] : []),
      ...(result.name === "overview" && result.footer?.primaryText !== "Sign up" ? ["overview: signed-out footer primary label mismatch"] : []),
      ...(result.name === "overview" && (!result.footerPrimaryOutcome?.hasAuthDialog || result.footerPrimaryOutcome?.dialogLabel !== "Sign up to Cova") ? ["overview: signed-out footer primary did not open the signup dialog"] : []),
      ...(result.name === "overview" && result.footer?.secondaryText !== "Explore Risk Passport" ? ["overview: signed-out footer Passport label mismatch"] : []),
      ...(result.name === "overview" && (!result.footerSecondaryOutcome?.hasAuthDialog || result.footerSecondaryOutcome?.dialogLabel !== "Sign in to Cova" || result.footerSecondaryOutcome?.hash !== "#passport") ? ["overview: signed-out footer Passport action did not open login with the Passport destination"] : []),
      ...(result.name === "overview-auth" && result.footer?.primaryText !== "Open dashboard" ? ["overview-auth: signed-in footer primary label mismatch"] : []),
      ...(result.name === "overview-auth" && (result.footerPrimaryOutcome?.hasAuthDialog || result.footerPrimaryOutcome?.hash !== "#dashboard") ? ["overview-auth: signed-in footer primary did not open dashboard"] : []),
      ...(result.name === "overview-auth" && result.footer?.secondaryText !== "Open Risk Passport" ? ["overview-auth: signed-in footer Passport label mismatch"] : []),
      ...(result.name === "overview-auth" && (result.footerSecondaryOutcome?.hasAuthDialog || result.footerSecondaryOutcome?.hash !== "#passport") ? ["overview-auth: signed-in footer Passport action did not open Passport"] : []),
      ...(result.name === "practice" && viewportWidth >= 1024 && (!result.practiceOutcome || result.practiceOutcome.setupOpen || !result.practiceOutcome.terminalVisible || !result.practiceOutcome.chartVisible || !result.practiceOutcome.orderRailVisible || !result.practiceOutcome.orderTicketPresent || !result.practiceOutcome.practiceLimitsPresent) ? ["practice: desktop simulator terminal did not open completely after setup"] : []),
      ...(result.name === "practice" && viewportWidth < 1024 && (!result.practiceOutcome?.availabilityGateVisible || result.practiceOutcome.terminalState?.present || result.practiceOutcome.chartState?.present || result.practiceOutcome.orderRailState?.present || result.practiceOutcome.setupOpen) ? ["practice: unsupported device did not receive the exclusive availability gate"] : []),
      ...(result.name === "practice" && viewportWidth < 1024 && (
        result.practiceOutcome?.boundaryTransition?.desktop?.gate !== false ||
        result.practiceOutcome?.boundaryTransition?.desktop?.terminal !== true ||
        result.practiceOutcome?.boundaryTransition?.desktop?.setupOpen !== true ||
        result.practiceOutcome?.boundaryTransition?.mobile?.gate !== true ||
        result.practiceOutcome?.boundaryTransition?.mobile?.terminal !== false ||
        result.practiceOutcome?.boundaryTransition?.mobile?.setupOpen !== false ||
        result.practiceOutcome?.boundaryTransition?.selectedDeskBeforeGate !== "Trades" ||
        result.practiceOutcome?.boundaryTransition?.desktopRestored?.gate !== false ||
        result.practiceOutcome?.boundaryTransition?.desktopRestored?.terminal !== true ||
        result.practiceOutcome?.boundaryTransition?.desktopRestored?.selectedDesk !== "Trades"
      ) ? ["practice: capability round trip did not preserve setup and evidence-desk state while exclusively mounting the correct surface"] : []),
      ...(result.name === "practice" && (result.practiceOutcome?.documentOverflow ?? 0) > 1 ? [`practice: terminal introduced document overflow ${result.practiceOutcome.documentOverflow}px`] : []),
      ...(result.name === "practice" && viewportWidth < 768 && (result.practiceOutcome?.commandOverflow ?? 0) > 0 && result.practiceOutcome?.commandOverflowX !== "auto" ? ["practice: mobile command strip overflows without an intentional horizontal scroll owner"] : []),
      ...result.required.filter((check) => !check.present).map((check) => `${result.name}: missing “${check.text}”`),
    ]);
    console.log(JSON.stringify({ outDir, results, failures }, null, 2));
    if (failures.length) {
      throw new Error(`Mobile audit failed:\n${failures.join("\n")}`);
    }
  } finally {
    await terminateChromeTree(chrome, cdp);
    cdp?.close();
    await removeProfileDirectory(profileDir);
    if (stderr && process.env.CDP_DEBUG) {
      console.error(stderr);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
