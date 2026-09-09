import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
assert.ok(existsSync(new URL('src/components/RiskDisclosureFooter.tsx', root)), 'Every route needs a shared, expanded risk disclosure footer');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { RiskDisclosureFooter } = await server.ssrLoadModule('/src/components/RiskDisclosureFooter.tsx');
  const { FUTURES_RISK_DISCLOSURE, HYPOTHETICAL_PERFORMANCE_DISCLOSURE } = await server.ssrLoadModule('/src/lib/vendorCompliance.ts');
  const html = renderToStaticMarkup(createElement(RiskDisclosureFooter));
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'");
  assert.match(html, /<footer[^>]*aria-label="Risk disclosures"/);
  assert.ok(text.includes(FUTURES_RISK_DISCLOSURE));
  assert.ok(text.includes(HYPOTHETICAL_PERFORMANCE_DISCLOSURE));
  assert.match(text, /lose all or more than the initial investment/);
  assert.match(text, /ability to withstand losses/);
  assert.match(text, /all which can adversely affect trading results/);
  assert.match(text, /Testimonials appearing on this website may not be representative of other clients or customers/);
  assert.doesNotMatch(html, /<details|hidden|aria-hidden|<summary/);
  for (const route of ['privacy', 'terms', 'security', 'disclosures']) assert.ok(html.includes(`href="#${route}"`));
  const app = read('src/App.tsx');
  assert.match(app, /section === "disclosures" \? <RiskDisclosureFooter \/> : <SiteFooter go=\{go\} \/>/, 'Only the protected disclosures page keeps the full-page treatment; every other public/locked route uses the original site footer');
  const plans = read('src/components/PlanSections.tsx');
  const ctaOnly = plans.slice(plans.indexOf('export function CtaFooter'), plans.indexOf('export function SiteFooter'));
  assert.doesNotMatch(ctaOnly, /<footer/, 'The closing CTA must not own a duplicate site footer');
  const { SiteFooter } = await server.ssrLoadModule('/src/components/PlanSections.tsx');
  const site = renderToStaticMarkup(createElement(SiteFooter, { go: () => {} }));
  assert.equal((site.match(/<footer\b/g) || []).length, 1, 'Exactly one original site footer, never a nested second footer');
  assert.match(site, /class="cova-site-footer"/);
  assert.ok(site.includes(FUTURES_RISK_DISCLOSURE));
  assert.ok(site.includes(HYPOTHETICAL_PERFORMANCE_DISCLOSURE));
  assert.equal((site.match(/aria-label="Legal and support"/g) || []).length, 1);
  assert.match(site, /href="#disclosures"/);
  assert.doesNotMatch(site, /<details|<summary|class="cova-risk-footer"/);
  const shell = read('src/components/WorkspaceShell.tsx');
  assert.match(shell, /<SiteFooter go=\{go\} \/>\s*<\/motion\.div>/, 'Member routes use the same single footer inside the real content column');
  const routes = read('src/lib/appRoutes.ts');
  assert.match(routes, /"disclosures"/);
  assert.match(app, /section === "disclosures"/);
  console.log('PASS: complete disclosure text, non-collapsed output, public/auth-gate/member ownership and direct disclosure route');
  assert.ok(existsSync(new URL('src/components/ProviderResources.tsx', root)), 'Approved provider logos need a discoverable homepage and Resources placement');
  const { ProviderResources } = await server.ssrLoadModule('/src/components/ProviderResources.tsx');
  const trademark = 'NinjaTrader® is a registered trademark of NinjaTrader Group, LLC. No NinjaTrader company has any affiliation with the owner, developer, or provider of the products or services described herein, or any interest, ownership or otherwise, in any such product or service, or endorses, recommends or approves any such product or service.';
  for (const compact of [true, false]) {
    const resources = renderToStaticMarkup(createElement(ProviderResources, { compact }));
    assert.ok(resources.includes(trademark));
    assert.match(resources, /href="https:\/\/ninjatraderus\.pxf\.io\/rEqk5d"/);
    assert.match(resources, /href="https:\/\/kinetick\.com\/NinjaTrader"/);
    assert.match(resources, /rel="sponsored noopener noreferrer"/);
    assert.match(resources, /\(paid link, opens in a new tab\)/, 'The paid logo link has an explicit accessible name');
    assert.equal((resources.match(/class="cova-provider-paid">Paid link<\/span>/g) || []).length, 1, 'One short visible paid-link disclosure replaces commission prose');
    assert.match(resources, /alt="NinjaTrader"[^>]*\/><\/a><span class="cova-provider-paid">Paid link<\/span>/, 'Paid link belongs directly under the NinjaTrader logo, not beside its CTA');
    assert.doesNotMatch(resources, /not yet available|not connect a brokerage|commission|does not provide a market-data feed|Explore third-party tools|Platform accounts, terms|Exchange fees/i, 'Only required provider copy, without launch-status or explanatory boilerplate');
    for (const name of ['NinjaTrader_Wordmark_color_RGB.png', 'Kinetick_Logo.png']) {
      assert.ok(resources.includes(`/media/providers/${name}`));
      assert.ok(existsSync(new URL(`public/media/providers/${name}`, root)));
    }
    assert.doesNotMatch(resources, /certified partner|approved partner|premium partner|#1|1\.9 million|500,000|FREE access/i);
  }
  assert.match(app, /<PlanStrip[^>]+\/>\s*<ProviderResources compact \/>\s*<CtaFooter/, 'Homepage providers sit directly between prices and the closing CTA');
  assert.match(app, /<ResourcesPage[^>]+\/>\s*<ProviderResources \/>/);
  const css = read('src/styles/vendorCompliance.css');
  assert.match(css, /\.cova-provider-inner > header\s*\{[^}]*justify-content: center;/, 'The section heading is centered');
  assert.match(css, /\.cova-provider-grid\s*\{[^}]*max-width: 720px;[^}]*margin: 12px auto 0;/, 'A bounded centered pair replaces the edge-to-edge layout');
  assert.match(css, /\.cova-provider-grid article\s*\{[^}]*justify-items: center;[^}]*text-align: center;/, 'Each provider is a centered vertical stack');
  assert.match(css, /\.cova-provider-logo\s*\{[^}]*padding: 20px;/);
  assert.match(css, /\.cova-provider-logo\s*\{[^}]*background: transparent;/, 'Official transparent assets must not sit on white backplates');
  assert.doesNotMatch(css, /filter:|mix-blend-mode:/);
  console.log('PASS: original transparent artwork, referral links, clear space, exact trademark, concise paid-link disclosure, no launch-status boilerplate');
  assert.match(css, /\.cova-provider-resources h2\s*\{[^}]*font: 550 16px\/1\.4/, 'Provider label is utility-sized, not a section headline');
  assert.match(css, /\.cova-provider-logo\s*\{[^}]*width: 132px;[^}]*min-height: 64px;/, 'Official logos use genuinely small backplates without shrinking clear space');
  assert.match(css, /\.cova-provider-grid article\s*\{[^}]*background: transparent;[^}]*border: 0;/, 'Providers are quiet rows rather than promotional cards');
  assert.match(css, /\.cova-risk-disclosures\s*\{[^}]*font: 400 14px\/1\.55/, 'All ordinary tabs use readable integrated disclosure text');
  assert.doesNotMatch(css, /main:has\(\.cova-provider-resources\)/, 'Do not limit the footer correction to two routes');
  assert.match(css, /\.cova-risk-footer\s*\{[^}]*padding: 40px 24px;[^}]*font: 400 16px\/1\.7/, 'Dedicated disclosures page retains its approved base presentation');
  assert.match(css, /\.cova-disclosures-page h1\s*\{[^}]*clamp\(40px, 6vw, 80px\)/, 'Approved disclosure-page heading is unchanged');
  console.log('PASS: compact provider hierarchy and backplates, readable body text, route-scoped footer, protected disclosure-page style');
} finally {
  await server.close();
}
