declare const process: { env: Record<string, string | undefined> };

const LOCK_PATH = "/_cova/unlock";
const LOCK_COOKIE = "__Host-cova_site_lock";
const COOKIE_MESSAGE = "cova-site-lock:v1";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 3;
const CLOCK_SKEW_SECONDS = 60;
const PASSWORD_MIN_LENGTH = 16;
const PASSWORD_MAX_LENGTH = 512;

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

async function signValue(value: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return encodeBase64Url(signature);
}

function encodeBase64Url(value: Uint8Array) {
  const encoded = btoa(String.fromCharCode(...value));
  return encoded.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function createPasswordEpoch(password: string, secret: string) {
  return (await signValue(`${COOKIE_MESSAGE}:password:${password}`, secret)).slice(0, 22);
}

async function createUnlockToken(password: string, secret: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + COOKIE_MAX_AGE_SECONDS;
  const randomBytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(randomBytes);
  const nonce = encodeBase64Url(randomBytes);
  const passwordEpoch = await createPasswordEpoch(password, secret);
  const payload = `v1.${issuedAt}.${expiresAt}.${nonce}.${passwordEpoch}`;
  return `${payload}.${await signValue(`${COOKIE_MESSAGE}:${payload}`, secret)}`;
}

async function verifyUnlockToken(token: string, password: string, secret: string) {
  const [version, issuedValue, expiresValue, nonce, presentedEpoch, presentedSignature, ...extra] = token.split(".");
  if (
    version !== "v1"
    || extra.length > 0
    || !/^\d+$/u.test(issuedValue ?? "")
    || !/^\d+$/u.test(expiresValue ?? "")
    || !/^[A-Za-z0-9_-]{22}$/u.test(nonce ?? "")
    || !/^[A-Za-z0-9_-]{22}$/u.test(presentedEpoch ?? "")
    || !/^[A-Za-z0-9_-]{43}$/u.test(presentedSignature ?? "")
  ) {
    return false;
  }

  const issuedAt = Number(issuedValue);
  const expiresAt = Number(expiresValue);
  const now = Math.floor(Date.now() / 1000);
  const validLifetime = Number.isSafeInteger(issuedAt)
    && Number.isSafeInteger(expiresAt)
    && expiresAt - issuedAt === COOKIE_MAX_AGE_SECONDS
    && issuedAt <= now + CLOCK_SKEW_SECONDS
    && expiresAt > now;
  const payload = `${version}.${issuedValue}.${expiresValue}.${nonce}.${presentedEpoch}`;
  const [expectedEpoch, expectedSignature] = await Promise.all([
    createPasswordEpoch(password, secret),
    signValue(`${COOKIE_MESSAGE}:${payload}`, secret),
  ]);

  return validLifetime
    && constantTimeEqual(presentedEpoch, expectedEpoch)
    && constantTimeEqual(presentedSignature, expectedSignature);
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return "";
}

function sanitizeReturnTo(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }

  try {
    const trustedOrigin = "https://cova.invalid";
    const target = new URL(value, trustedOrigin);
    if (
      target.origin !== trustedOrigin
      || target.pathname.startsWith("//")
      || target.pathname.includes("\\")
      || target.pathname.startsWith(LOCK_PATH)
    ) {
      return "/";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderLockPage(errorMessage = "", returnTo = "/") {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <title>Cova · Private build</title>
  <style>
    :root { color-scheme: dark; --ink: #050505; --paper: #f3eee8; --muted: #8d8985; --copper: #d7976e; --mint: #53ddb1; --line: rgba(255,255,255,.12); }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { min-width: 320px; min-height: 100%; }
    body {
      min-height: 100vh;
      overflow-x: hidden;
      background:
        radial-gradient(circle at 68% 42%, rgba(215,151,110,.10), transparent 0 24%, transparent 48%),
        linear-gradient(rgba(255,255,255,.022) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.022) 1px, transparent 1px),
        #000;
      background-size: auto, 72px 72px, 72px 72px, auto;
      color: var(--paper);
      font-family: Arial, Helvetica, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    body::before {
      position: fixed;
      inset: 0;
      content: "";
      pointer-events: none;
      background: linear-gradient(90deg, transparent 0 49.95%, rgba(255,255,255,.04) 50%, transparent 50.05%);
      opacity: .7;
    }
    .shell { display: grid; min-height: 100vh; grid-template-rows: auto 1fr auto; }
    header, footer { position: relative; z-index: 1; }
    header {
      display: flex;
      width: calc(100% - 48px);
      max-width: 1400px;
      margin: 20px auto 0;
      align-items: center;
      justify-content: space-between;
      padding: 13px 16px;
      border: 1px solid rgba(255,255,255,.09);
      border-radius: 9px;
      background: rgba(0,0,0,.72);
    }
    .brand { display: flex; align-items: center; gap: 11px; color: #fff; font-size: 22px; font-weight: 600; letter-spacing: -.08em; }
    .brand svg { width: 31px; height: 31px; }
    .status { display: flex; align-items: center; gap: 8px; color: #a39e99; font: 700 10px/1 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .17em; text-transform: uppercase; }
    .status::before { width: 6px; height: 6px; border-radius: 50%; background: var(--mint); box-shadow: 0 0 18px rgba(83,221,177,.6); content: ""; }
    main { position: relative; z-index: 1; display: grid; width: min(1180px, calc(100% - 48px)); margin: auto; grid-template-columns: minmax(0, 1.05fr) minmax(360px, .78fr); align-items: center; gap: clamp(56px, 8vw, 126px); padding: 72px 0; }
    .eyebrow { margin-bottom: 18px; color: var(--copper); font: 700 11px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .28em; text-transform: uppercase; }
    h1 { max-width: 670px; font-size: clamp(58px, 7.1vw, 106px); font-weight: 700; line-height: .88; letter-spacing: -.072em; }
    h1 span { display: block; color: var(--copper); }
    .lede { max-width: 560px; margin-top: 28px; color: #aaa6a2; font-size: 17px; line-height: 1.58; }
    .proof { display: flex; align-items: center; gap: 10px; margin-top: 34px; color: #7f7b78; font: 700 10px/1.3 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .13em; text-transform: uppercase; }
    .proof::before { width: 4px; height: 4px; background: var(--mint); content: ""; }
    .panel-wrap { position: relative; }
    .panel-wrap::before { position: absolute; inset: -22px 26px 22px -26px; border: 1px solid rgba(215,151,110,.32); border-radius: 12px; content: ""; transform: rotate(-2deg); }
    .panel {
      position: relative;
      padding: clamp(30px, 4vw, 46px);
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 10px;
      background: linear-gradient(145deg, rgba(255,255,255,.045), rgba(255,255,255,.012) 45%, rgba(215,151,110,.035)), rgba(4,4,4,.96);
      box-shadow: 0 38px 120px rgba(0,0,0,.62), inset 0 1px rgba(255,255,255,.12);
    }
    .panel-index { display: flex; align-items: center; justify-content: space-between; padding-bottom: 26px; border-bottom: 1px solid var(--line); color: #74706d; font: 700 10px/1 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .16em; text-transform: uppercase; }
    .panel-index strong { color: var(--mint); font-weight: 700; }
    h2 { margin-top: 30px; font-size: clamp(28px, 3vw, 42px); letter-spacing: -.045em; }
    .panel-copy { margin-top: 10px; color: #918d89; font-size: 14px; line-height: 1.55; }
    form { margin-top: 30px; }
    label { display: block; margin-bottom: 9px; color: #a39f9a; font: 700 10px/1 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .15em; text-transform: uppercase; }
    .field { display: grid; grid-template-columns: 1fr auto; border: 1px solid rgba(255,255,255,.18); border-radius: 6px; background: rgba(255,255,255,.025); transition: border-color .2s, box-shadow .2s; }
    .field:focus-within { border-color: rgba(215,151,110,.76); box-shadow: 0 0 0 3px rgba(215,151,110,.10); }
    input { width: 100%; min-width: 0; border: 0; outline: 0; padding: 17px 16px; background: transparent; color: #fff; font: 500 16px/1 Arial, Helvetica, sans-serif; }
    input::placeholder { color: #615e5b; }
    button { min-width: 118px; margin: 4px; border: 1px solid rgba(242,199,168,.4); border-radius: 4px; background: #d8a07b; color: #111; cursor: pointer; font: 800 11px/1 Arial, Helvetica, sans-serif; letter-spacing: .1em; text-transform: uppercase; transition: background .2s, transform .2s; }
    button:hover { background: #e8b38f; transform: translateY(-1px); }
    button:focus-visible { outline: 2px solid var(--paper); outline-offset: 3px; }
    .privacy { margin-top: 17px; color: #696561; font: 600 10px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .08em; text-transform: uppercase; }
    .error { margin-top: 14px; padding: 11px 12px; border-left: 2px solid #d7976e; background: rgba(215,151,110,.08); color: #e5b797; font-size: 13px; line-height: 1.45; }
    footer { display: flex; width: calc(100% - 48px); max-width: 1400px; margin: 0 auto; justify-content: space-between; padding: 20px 0 24px; border-top: 1px solid rgba(255,255,255,.08); color: #65615e; font: 600 10px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .1em; text-transform: uppercase; }
    @media (max-width: 840px) {
      header { width: calc(100% - 28px); margin-top: 14px; }
      main { width: min(620px, calc(100% - 32px)); grid-template-columns: 1fr; gap: 56px; padding: 72px 0 64px; }
      .panel-wrap { order: -1; }
      h1 { font-size: clamp(54px, 16vw, 88px); }
      .lede { font-size: 16px; }
      .panel-wrap::before { inset: -14px 18px 14px -18px; }
      footer { width: calc(100% - 32px); gap: 16px; }
    }
    @media (max-width: 520px) {
      body { background-size: auto, 44px 44px, 44px 44px, auto; }
      header { padding: 10px 12px; }
      .brand span { display: none; }
      main { padding-top: 54px; }
      h1 { font-size: clamp(48px, 17vw, 70px); }
      .panel { padding: 26px 20px; }
      .field { grid-template-columns: 1fr; }
      button { min-height: 48px; }
      footer { align-items: flex-start; flex-direction: column; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; } }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="brand" aria-label="Cova">
        <svg viewBox="0 0 96 96" aria-hidden="true"><path d="M70 23.5A35 35 0 1 0 70 72.5" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/><path d="M35 39v23M48 30v36M61 36v25" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><rect x="30.75" y="45.5" width="8.5" height="11.5" rx="1.5" fill="currentColor"/><rect x="43.75" y="39" width="8.5" height="18" rx="1.5" fill="currentColor"/><rect x="56.75" y="43" width="8.5" height="12.5" rx="1.5" fill="currentColor"/></svg>
        <span>cova</span>
      </div>
      <div class="status">Private build</div>
    </header>
    <main>
      <section>
        <p class="eyebrow">Review what comes next</p>
        <h1>The desk is <span>under review.</span></h1>
        <p class="lede">Cova is temporarily locked while the next build is being reviewed. Enter the access password to continue.</p>
        <p class="proof">Risk review, not trade signals</p>
      </section>
      <div class="panel-wrap">
        <section class="panel" aria-labelledby="unlock-title">
          <div class="panel-index"><span>Access control · 01</span><strong>Locked</strong></div>
          <h2 id="unlock-title">Enter Cova.</h2>
          <p class="panel-copy">Use the temporary build password to open this deployment.</p>
          <form action="${LOCK_PATH}" method="post">
            <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
            <label for="password">Build password</label>
            <div class="field">
              <input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter password" required autofocus>
              <button type="submit">Unlock ↗</button>
            </div>
          </form>
          ${errorMessage ? `<p class="error" role="alert">${errorMessage}</p>` : ""}
          <p class="privacy">The password is checked server-side and is never included in this page.</p>
        </section>
      </div>
    </main>
    <footer><span>© 2026 Cova</span><span>Temporary private review</span></footer>
  </div>
</body>
</html>`;
}

function lockedHtmlResponse(body: string, status: number) {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; style-src 'unsafe-inline'",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export default async function middleware(request: Request) {
  const lockState = process.env.COVA_SITE_LOCK_ENABLED;
  if (lockState === "false") {
    return;
  }

  const configurationUnavailable = () => {
    const unavailablePage = renderLockPage()
      .replace("Enter Cova.", "Private build unavailable.")
      .replace("Use the temporary build password to open this deployment.", "The temporary access gate is not configured. Please try again later.");
    return lockedHtmlResponse(unavailablePage, 503);
  };
  if (lockState !== "true") {
    return configurationUnavailable();
  }

  const password = process.env.COVA_SITE_PASSWORD;
  const secret = process.env.COVA_SITE_LOCK_SECRET;
  if (
    !password
    || password.length < PASSWORD_MIN_LENGTH
    || password.length > PASSWORD_MAX_LENGTH
    || !secret
    || secret.length < 32
  ) {
    return configurationUnavailable();
  }

  const presentedToken = readCookie(request, LOCK_COOKIE);
  if (presentedToken && await verifyUnlockToken(presentedToken, password, secret)) {
    return;
  }

  const url = new URL(request.url);
  if (url.pathname === LOCK_PATH && request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin !== url.origin) {
      return lockedHtmlResponse(renderLockPage("This unlock request wasn’t accepted. Reload the page and try again."), 403);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return lockedHtmlResponse(renderLockPage(), 401);
    }

    const submittedPassword = form.get("password");
    const submittedValue = typeof submittedPassword === "string" && submittedPassword.length <= 512
      ? submittedPassword
      : "";
    const [submittedDigest, expectedDigest] = await Promise.all([
      signValue(submittedValue, secret),
      signValue(password, secret),
    ]);

    if (constantTimeEqual(submittedDigest, expectedDigest)) {
      const unlockToken = await createUnlockToken(password, secret);
      const headers = new Headers({
        "Cache-Control": "private, no-store, max-age=0",
        Location: sanitizeReturnTo(form.get("returnTo")),
      });
      headers.append(
        "Set-Cookie",
        `${LOCK_COOKIE}=${unlockToken}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
      );
      return new Response(null, { status: 303, headers });
    }

    return lockedHtmlResponse(
      renderLockPage("Password didn’t match. Check it and try again.", sanitizeReturnTo(form.get("returnTo"))),
      401,
    );
  }

  return lockedHtmlResponse(renderLockPage("", `${url.pathname}${url.search}`), 401);
}
