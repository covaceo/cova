// Run against a local frontend build with VITE_COVA_BILLING_ENABLED=true.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { workspaceBrowserOptions } from './workspace-browser-support.mjs';

const server = await preview({ build: { outDir: resolve(process.argv[2] || 'dist') }, preview: { host: '127.0.0.1', port: 0 } });
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const ordinaryCopy = 'Create a free account to save imports, limits, review notes, and Passport preferences. No payment required.';
const proCopy = 'Create a free account first. After you verify your email and sign in, return to Pricing and choose Upgrade to Pro.';
let browser;
try {
  browser = await chromium.launch({ ...workspaceBrowserOptions, headless: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    try {
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.origin === origin && route.request().method() === 'GET' && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      await page.goto(`${origin}/#pricing`);
      const signup = page.getByRole('dialog', { name: 'Sign up to Cova', exact: true });
      const free = page.getByRole('article', { name: 'Free', exact: true }).getByRole('button', { name: 'Sign up', exact: true });
      const upgrade = page.getByRole('article', { name: 'Cova Pro', exact: true }).getByRole('button', { name: 'Upgrade to Pro', exact: true });
      // Both entrypoints are on Pricing: route alone cannot determine the copy.
      for (const [button, expected, absent] of [[free, ordinaryCopy, proCopy], [upgrade, proCopy, ordinaryCopy], [free, ordinaryCopy, proCopy]]) {
        await button.click();
        await signup.getByRole('heading', { name: 'Create your account' }).waitFor();
        assert.equal(await signup.getByText(expected, { exact: true }).isVisible(), true, `Expected ${expected}\nActual: ${await signup.innerText()}`);
        assert.equal(await signup.getByText(absent, { exact: true }).count(), 0);
        assert.ok(await signup.getByRole('button', { name: 'Create account', exact: true }).isVisible());
        await signup.getByRole('button', { name: 'Close', exact: true }).click();
        await signup.waitFor({ state: 'hidden' });
      }
      console.log(`PASS Pricing: Free signup → Pro handoff → ordinary signup at ${width}px`);
    } finally { await context.close(); }
  }
} finally { await browser?.close(); await server.close(); }
