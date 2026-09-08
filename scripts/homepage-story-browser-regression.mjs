import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preview as startPreview } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profileDir = await mkdtemp(join(tmpdir(), "cova-home-story-browser-"));
const screenshotDir = process.env.COVA_HOME_STORY_SCREENSHOT_DIR || "";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let previewServer;
let previewPort;
let chrome;
let cdp;
let origin;
const consoleErrors = [];
const runtimeErrors = [];
const networkErrors = [];
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });

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
  await cdp.send('Page.navigate', {url: `${origin}/?home-story=${label}#overview`});
  await waitFor("document.readyState === 'complete' && document.querySelector('[data-home-story]')");
  await evaluate('document.fonts.ready');
  await evaluate("document.documentElement.style.scrollBehavior='auto'; document.querySelector('[data-home-story]').scrollIntoView({block:'start',behavior:'instant'}); true");
  await waitFor("['ready','reduced-motion','fallback'].includes(document.querySelector('.home-story .passport-holo-face')?.dataset.optics)");
  await waitFor("(()=>{for(let p=document.querySelector('[data-home-story]');p;p=p.parentElement){if(Number(getComputedStyle(p).opacity)<.999)return false;}return true;})()");
  await sleep(400);
}

async function captureScreenshot(name) {
  if (!screenshotDir) return null;
  await mkdir(screenshotDir, { recursive: true });
  const screenshot = await cdp.send("Page.captureScreenshot", { captureBeyondViewport: false, format: "png", fromSurface: true });
  const path = join(screenshotDir, name);
  await writeFile(path, Buffer.from(screenshot.data, "base64"));
  return path;
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

  const widths = [[1920,1080],[1672,941],[1440,1000],[1280,720],[1101,900],[1100,900],[1024,768],[768,900],[761,900],[760,900],[390,844],[320,740]];
  const cases = [];
  for (const [width,height] of widths) {
    await setViewport(width,height,width<=760);
    await navigate(`${width}x${height}`);
    const m = await evaluate(`(() => {
      const story=document.querySelector('[data-home-story]');
      const rect=e=>e.getBoundingClientRect().toJSON();
      const q=s=>story.querySelector(s);
      const steps=[...story.querySelectorAll('.home-story-step')];
      const face=q('.passport-holo-face'), canvas=q('canvas');
      const card=rect(q('.home-story-card')), copy=rect(q('.home-story-copy'));
      return {width:innerWidth, height:innerHeight, visualWidth:visualViewport.width,rootOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
       card,copy, action:rect(q('.home-story-action')), steps:steps.map(e=>({rect:rect(e),overflow:e.scrollWidth-e.clientWidth,title:rect(e.querySelector('h3')),body:rect(e.querySelector('p'))})),
       stepColumns:getComputedStyle(q('.home-story-steps')).gridTemplateColumns.split(' ').length,
       rank:face.dataset.passportTier,appearance:face.dataset.appearance,optics:face.dataset.optics,stage:rect(q('.home-story-stage')), face:rect(face),raster:[canvas.width,canvas.height],
       headingFont:getComputedStyle(q('h2')).fontFamily, headingStyle:getComputedStyle(q('h2')).fontStyle, sectionBackground:getComputedStyle(story).backgroundImage, faceBackground:getComputedStyle(face).backgroundImage, faceBorder:getComputedStyle(face).borderTopWidth, faceBefore:getComputedStyle(face,'::before').display, faceAfter:getComputedStyle(face,'::after').display, shareColor:getComputedStyle(steps[3].querySelector('h3')).color,headline: q('h2').textContent,auth:document.querySelectorAll('[role=dialog][aria-modal=true]').length,
       brokenImages:[...document.images].filter(i=>i.complete&&!i.naturalWidth).length, disclosure:q('.passport-holo-disclosure').textContent};
    })()`);
    assert.equal(m.width,width);assert.equal(m.visualWidth,width);assert.equal(m.rootOverflow,0);assert.equal(m.auth,0);assert.equal(m.brokenImages,0);
    assert.equal(m.rank,'diamond');assert.equal(m.appearance,'Diamond-standard');assert.match(m.disclosure,/Sample data/);
    assert.match(m.headingFont,/Inter Tight/,'Legacy editorial face must not replace the approved sans headline.');assert.equal(m.headingStyle,'normal');
    assert.equal(m.sectionBackground,'none');assert.equal(m.faceBackground,'none');assert.equal(m.faceBorder,'0px');assert.equal(m.faceBefore,'none');assert.equal(m.faceAfter,'none');assert.equal(m.shareColor,'rgb(143, 175, 255)');
    assert.equal(m.steps.length,4);assert.equal(m.stepColumns,width<=760?2:4);
    assert.ok(m.card.x>=20 && m.card.right<=width-20,JSON.stringify(m));
    assert.ok(width<=760 ? m.card.top>=m.copy.bottom+30 : m.card.left>=m.copy.right+25,`copy/card collision at ${width}`);
    assert.ok(m.action.height>=44);
    for(const step of m.steps){assert.ok(step.overflow<=1);assert.ok(step.title.right<=step.rect.right+1);assert.ok(step.body.right<=step.rect.right+1);}
    cases.push(m);
    if(screenshotDir) await writeFile(join(screenshotDir,'layout-cases.json'),JSON.stringify(cases,null,2));
    if([1672,1280,768,390,320].includes(width)) await captureScreenshot(`home-${width}.png`);
  }
  assert.equal(new Set(cases.map(x=>`${x.width}x${x.height}`)).size,widths.length);
  await setViewport(1440,1000,false);await navigate('inputs');
  await waitFor("document.querySelector('.home-story .passport-holo-face').dataset.optics==='ready'");
  const center=await evaluate("(()=>{const r=document.querySelector('.home-story-card').getBoundingClientRect();return {x:r.x+r.width*.72,y:r.y+r.height*.5}})()");
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...center});
  await waitFor("Math.abs(Number(document.querySelector('.home-story .passport-holo-face').dataset.opticsX))>.1");
  await captureScreenshot('home-pointer-tilt.png');
  await evaluate("document.querySelector('.home-story .passport-holo-face').focus();true");
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home'});
  await waitFor("Number(document.querySelector('.home-story .passport-holo-face').dataset.opticsX)===0");
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});
  await waitFor("Number(document.querySelector('.home-story .passport-holo-face').dataset.opticsX)===.25");
  const focus = await evaluate("(()=>{const f=document.querySelector('.home-story .passport-holo-face'),c=document.querySelector('.home-story-card'),r=c.getBoundingClientRect();return {visible:f.matches(':focus-visible'),faceOutline:getComputedStyle(f).outlineStyle,cardOutline:getComputedStyle(c).outlineStyle,cardColor:getComputedStyle(c).outlineColor,left:r.left-8,right:r.right+8,width:innerWidth}})()");
  assert.equal(focus.visible,true);assert.equal(focus.faceOutline,'none');assert.equal(focus.cardOutline,'solid');assert.equal(focus.cardColor,'rgb(157, 183, 255)');assert.ok(focus.left>=0&&focus.right<=focus.width,'The complete card focus outline must remain inside the viewport.');
  await captureScreenshot('home-keyboard-focus.png');
  await sleep(320);
  assert.equal(await evaluate("document.querySelector('.home-story .passport-holo-face').dataset.opticsMotion"),'0.0000');
  // The same retained vector content is complete if the material context is lost.
  await evaluate("window.__homeGl=document.querySelector('.home-story canvas').getContext('webgl').getExtension('WEBGL_lose_context');window.__homeGl.loseContext();true");
  await waitFor("document.querySelector('.home-story .passport-holo-face').dataset.optics==='context-lost'");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.home-story svg.passport-holo-art > image')).opacity"),'1');
  await captureScreenshot('home-context-fallback.png');
  await evaluate('window.__homeGl.restoreContext();true');
  await waitFor("document.querySelector('.home-story .passport-holo-face').dataset.optics==='ready'");
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await waitFor("document.querySelector('.home-story .passport-holo-face').dataset.optics==='reduced-motion'");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.home-story .passport-holo-face')).transform"),'none');
  await captureScreenshot('home-reduced-motion.png');
  await cdp.send('Emulation.setEmulatedMedia',{features:[]});
  await setViewport(390,844,true);await navigate('touch');
  await evaluate("document.querySelector('.home-story-card').scrollIntoView({block:'center',behavior:'instant'});true");
  await waitFor("document.querySelector('.home-story .passport-holo-face').dataset.optics==='ready'");
  const point=await evaluate("(()=>{const r=document.querySelector('.home-story-card').getBoundingClientRect();return {x:r.x+r.width*.75,y:r.y+r.height*.45}})()");
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});
  await waitFor("Math.abs(Number(document.querySelector('.home-story .passport-holo-face').dataset.opticsX))>.1");
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await waitFor("Number(document.querySelector('.home-story .passport-holo-face').dataset.opticsX)===0");
  // A public exploratory action never opens auth. Real pointer activation verifies hash routing.
  await evaluate("document.querySelector('.home-story-action').scrollIntoView({block:'center',behavior:'instant'});true");
  const action=await evaluate("(()=>{const r=document.querySelector('.home-story-action').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...action});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...action});
  await waitFor("location.hash==='#features' && document.querySelector('[data-features-showcase]') && !document.querySelector('[data-home-story]')");
  assert.equal(await evaluate("document.querySelectorAll('[role=dialog][aria-modal=true]').length"),0);
  assert.equal(await evaluate("document.querySelectorAll('[role=tab]').length"),5);
  assert.deepEqual(consoleErrors,[]);assert.deepEqual(runtimeErrors,[]);assert.deepEqual(networkErrors,[]);
  console.log(JSON.stringify({passed:true,cases:cases.length,pointer:true,keyboard:true,heldMotifStopped:true,touch:true,reducedMotion:true,contextRestored:true,publicCta:true,consoleErrors,runtimeErrors,networkErrors}));
} finally {
  if (chrome && chrome.exitCode === null) {
    if (cdp) await Promise.race([cdp.send('Browser.close').catch(() => {}), sleep(500)]);
    let started = Date.now();
    while (chrome.exitCode === null && Date.now() - started < 3000) await sleep(50);
    if (chrome.exitCode === null) {
      if (process.platform === "win32" && chrome.pid) await new Promise(resolve => execFile("taskkill.exe", ["/PID", String(chrome.pid), "/T", "/F"], () => resolve()));
      else chrome.kill("SIGTERM");
    }
    started = Date.now();
    while (chrome.exitCode === null && Date.now() - started < 5000) await sleep(50);
    assert.notEqual(chrome.exitCode, null, 'Owned homepage QA Chrome must exit.');
  }
  cdp?.close();
  if (previewServer) {
    await previewServer.close();
    if (previewPort) assert.ok(await waitForPortClosed(previewPort), `Owned Vite preview port ${previewPort} remained open after teardown.`);
  }
  await rm(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
