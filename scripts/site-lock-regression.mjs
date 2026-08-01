import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const middlewarePath = resolve("middleware.ts");
assert.ok(existsSync(middlewarePath), "middleware.ts must exist at the project root");

const tempDirectory = mkdtempSync(join(tmpdir(), "cova-site-lock-"));
const compiledPath = join(tempDirectory, "middleware.mjs");
const source = readFileSync(middlewarePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
writeFileSync(compiledPath, compiled.outputText);

const originalEnvironment = {
  enabled: process.env.COVA_SITE_LOCK_ENABLED,
  password: process.env.COVA_SITE_PASSWORD,
  secret: process.env.COVA_SITE_LOCK_SECRET,
};
const originalDateNow = Date.now;

try {
  const { default: middleware } = await import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`);
  process.env.COVA_SITE_LOCK_ENABLED = "true";
  process.env.COVA_SITE_PASSWORD = "correct-horse-battery-staple";
  process.env.COVA_SITE_LOCK_SECRET = "test-signing-secret-that-is-long-enough";

  const response = await middleware(new Request("https://covadesk.com/"));
  assert.ok(response instanceof Response, "locked requests must receive a response");
  assert.equal(response.status, 401, "locked requests must be unauthorized");
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/);
  assert.equal(response.headers.get("referrer-policy"), "strict-origin", "gate policy must preserve an exact Origin on native same-origin form posts");

  const body = await response.text();
  assert.match(body, /Cova/i, "gate must identify Cova");
  assert.match(body, /type="password"/, "gate must contain a password field");
  assert.doesNotMatch(body, /correct-horse-battery-staple/, "gate must never render the configured password");

  for (const protectedPath of ["/api/projectx/status", "/assets/index.js", "/robots.txt", "/sitemap.xml", "/.well-known/security.txt"]) {
    const protectedResponse = await middleware(new Request(`https://covadesk.com${protectedPath}`));
    assert.ok(protectedResponse instanceof Response, `${protectedPath} must be covered by the whole-site lock`);
    assert.equal(protectedResponse.status, 401);
  }

  const routedResponse = await middleware(new Request("https://covadesk.com/?qa=1&mode=x"));
  assert.ok(routedResponse instanceof Response);
  assert.match(
    await routedResponse.text(),
    /<input type="hidden" name="returnTo" value="\/\?qa=1&amp;mode=x">/,
    "gate must preserve the requested same-origin path without injecting raw markup",
  );

  process.env.COVA_SITE_LOCK_ENABLED = "false";
  const unlockedResponse = await middleware(new Request("https://covadesk.com/"));
  assert.equal(unlockedResponse, undefined, "disabled lock must let the request continue");

  delete process.env.COVA_SITE_LOCK_ENABLED;
  const missingEnablementResponse = await middleware(new Request("https://covadesk.com/"));
  assert.ok(missingEnablementResponse instanceof Response, "missing enablement must fail closed while middleware is deployed");
  assert.equal(missingEnablementResponse.status, 503);

  process.env.COVA_SITE_LOCK_ENABLED = "TRUE";
  const malformedEnablementResponse = await middleware(new Request("https://covadesk.com/"));
  assert.ok(malformedEnablementResponse instanceof Response, "malformed enablement must fail closed");
  assert.equal(malformedEnablementResponse.status, 503);

  process.env.COVA_SITE_LOCK_ENABLED = "true";
  delete process.env.COVA_SITE_PASSWORD;
  const misconfiguredResponse = await middleware(new Request("https://covadesk.com/"));
  assert.ok(misconfiguredResponse instanceof Response, "enabled lock must fail closed when configuration is missing");
  assert.equal(misconfiguredResponse.status, 503, "missing lock configuration must not expose the site");

  process.env.COVA_SITE_PASSWORD = "short";
  process.env.COVA_SITE_LOCK_SECRET = "also-short";
  const weakConfigurationResponse = await middleware(new Request("https://covadesk.com/"));
  assert.ok(weakConfigurationResponse instanceof Response);
  assert.equal(weakConfigurationResponse.status, 503, "weak lock configuration must fail closed");

  process.env.COVA_SITE_PASSWORD = "x".repeat(513);
  process.env.COVA_SITE_LOCK_SECRET = "test-signing-secret-that-is-long-enough";
  const oversizedConfigurationResponse = await middleware(new Request("https://covadesk.com/"));
  assert.ok(oversizedConfigurationResponse instanceof Response);
  assert.equal(oversizedConfigurationResponse.status, 503, "oversized configured passwords must fail closed");

  process.env.COVA_SITE_PASSWORD = "correct-horse-battery-staple";
  process.env.COVA_SITE_LOCK_SECRET = "test-signing-secret-that-is-long-enough";
  const oversizedUnlockResponse = await middleware(new Request("https://covadesk.com/_cova/unlock", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://covadesk.com",
    },
    body: new URLSearchParams({ password: "x".repeat(20_000), returnTo: "/" }),
  }));
  assert.ok(oversizedUnlockResponse instanceof Response);
  assert.equal(oversizedUnlockResponse.status, 413, "unlock request bodies above the bounded limit must be rejected before password verification");

  let now = 1_800_000_000_000;
  Date.now = () => now;
  const unlockResponse = await middleware(new Request("https://covadesk.com/_cova/unlock", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://covadesk.com",
    },
    body: new URLSearchParams({
      password: "correct-horse-battery-staple",
      returnTo: "/?qa=1",
    }),
  }));
  assert.ok(unlockResponse instanceof Response, "correct password must return an unlock response");
  assert.equal(unlockResponse.status, 303, "successful unlock must redirect with POST/Redirect/GET");
  assert.equal(unlockResponse.headers.get("location"), "/?qa=1");
  const cookie = unlockResponse.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^__Host-cova_site_lock=v1\.\d+\.\d+\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43};/, "unlock must set an expiring opaque signed cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.doesNotMatch(cookie, /correct-horse-battery-staple/, "unlock cookie must not contain the password");

  const secondUnlockResponse = await middleware(new Request("https://covadesk.com/_cova/unlock", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://covadesk.com",
    },
    body: new URLSearchParams({ password: "correct-horse-battery-staple", returnTo: "/" }),
  }));
  const secondCookie = secondUnlockResponse?.headers.get("set-cookie") ?? "";
  assert.notEqual(secondCookie.split(";")[0], cookie.split(";")[0], "each unlock must issue a unique signed token");

  now += (60 * 60 * 24 * 3 + 1) * 1000;
  const expiredCookieResponse = await middleware(new Request("https://covadesk.com/", {
    headers: { Cookie: cookie.split(";")[0] },
  }));
  assert.ok(expiredCookieResponse instanceof Response, "expired signed cookies must fail closed server-side");
  assert.equal(expiredCookieResponse.status, 401);
  now = 1_800_000_000_000;

  const unsafeRedirectResponse = await middleware(new Request("https://covadesk.com/_cova/unlock", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://covadesk.com",
    },
    body: new URLSearchParams({
      password: "correct-horse-battery-staple",
      returnTo: "/\\evil.example/private",
    }),
  }));
  assert.ok(unsafeRedirectResponse instanceof Response);
  assert.equal(unsafeRedirectResponse.headers.get("location"), "/", "unlock must reject cross-origin redirect tricks");

  const canonicalRedirectResponse = await middleware(new Request("https://covadesk.com/_cova/unlock", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://covadesk.com",
    },
    body: new URLSearchParams({
      password: "correct-horse-battery-staple",
      returnTo: "/%2e%2e//evil.example/private",
    }),
  }));
  assert.ok(canonicalRedirectResponse instanceof Response);
  assert.equal(canonicalRedirectResponse.headers.get("location"), "/", "canonicalized protocol-relative redirects must be rejected");

  const crossOriginResponse = await middleware(new Request("https://covadesk.com/_cova/unlock", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://evil.example",
    },
    body: new URLSearchParams({ password: "correct-horse-battery-staple" }),
  }));
  assert.ok(crossOriginResponse instanceof Response);
  assert.equal(crossOriginResponse.status, 403, "cross-origin unlock submissions must be rejected");
  assert.equal(crossOriginResponse.headers.get("set-cookie"), null);

  const missingOriginResponse = await middleware(new Request("https://covadesk.com/_cova/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: "correct-horse-battery-staple" }),
  }));
  assert.ok(missingOriginResponse instanceof Response);
  assert.equal(missingOriginResponse.status, 403, "unlock submissions without a same-origin Origin header must be rejected");
  assert.equal(missingOriginResponse.headers.get("set-cookie"), null);

  const authorizedResponse = await middleware(new Request("https://covadesk.com/", {
    headers: { Cookie: cookie.split(";")[0] },
  }));
  assert.equal(authorizedResponse, undefined, "valid signed cookie must let the request continue");

  const cookiePair = cookie.split(";")[0];
  const tamperedCookie = `${cookiePair.slice(0, -1)}${cookiePair.endsWith("A") ? "B" : "A"}`;
  const tamperedCookieResponse = await middleware(new Request("https://covadesk.com/", {
    headers: { Cookie: tamperedCookie },
  }));
  assert.ok(tamperedCookieResponse instanceof Response, "tampered cookies must fail closed");
  assert.equal(tamperedCookieResponse.status, 401);

  process.env.COVA_SITE_PASSWORD = "rotated-correct-horse-battery-staple";
  const rotatedPasswordResponse = await middleware(new Request("https://covadesk.com/", {
    headers: { Cookie: cookie.split(";")[0] },
  }));
  assert.ok(rotatedPasswordResponse instanceof Response, "password rotation must revoke previously issued cookies");
  assert.equal(rotatedPasswordResponse.status, 401);
  process.env.COVA_SITE_PASSWORD = "correct-horse-battery-staple";

  const rejectedResponse = await middleware(new Request("https://covadesk.com/_cova/unlock", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://covadesk.com",
    },
    body: new URLSearchParams({ password: "wrong-password", returnTo: "/#dashboard" }),
  }));
  assert.ok(rejectedResponse instanceof Response);
  assert.equal(rejectedResponse.status, 401, "wrong password must remain locked");
  assert.equal(rejectedResponse.headers.get("set-cookie"), null, "wrong password must not issue a cookie");
  assert.match(await rejectedResponse.text(), /Password didn.t match/i, "wrong password must show bounded feedback");

  console.log("site lock regression passed");
} finally {
  if (originalEnvironment.enabled === undefined) delete process.env.COVA_SITE_LOCK_ENABLED;
  else process.env.COVA_SITE_LOCK_ENABLED = originalEnvironment.enabled;
  if (originalEnvironment.password === undefined) delete process.env.COVA_SITE_PASSWORD;
  else process.env.COVA_SITE_PASSWORD = originalEnvironment.password;
  if (originalEnvironment.secret === undefined) delete process.env.COVA_SITE_LOCK_SECRET;
  else process.env.COVA_SITE_LOCK_SECRET = originalEnvironment.secret;
  Date.now = originalDateNow;
  rmSync(tempDirectory, { force: true, recursive: true });
}
