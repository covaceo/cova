import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
function declaration(css, selector, property, media = null) {
  let value;
  postcss.parse(css).walkRules(rule => {
    if (!postcss.list.comma(rule.selector).includes(selector)) return;
    const enclosing = rule.parent.type === 'atrule' ? rule.parent.params : null;
    if (enclosing !== media) return;
    rule.walkDecls(property, decl => { value = decl.value; });
  });
  assert.notEqual(value, undefined, `Missing ${property} for ${selector}`);
  return value;
}
function assertContainedEntry(source, owner) {
  assert.match(source, new RegExp(`<header className="${owner}-oa-intro">`), 'Page chrome must render instantly');
  assert.deepEqual([...source.matchAll(/<motion\.(\w+)/g)].map(match => match[1]), ['div'], 'One board entry only; no nested item or title reveals');
  assert.match(source, /initial=\{reduceMotion \? false : \{ opacity: 0, y: 8 \}\}/, 'Board starts at most eight pixels away');
  assert.match(source, /transition=\{reduceMotion \? \{ duration: 0 \} : \{ duration: 0\.2, ease: "easeOut" \}\}/, 'Entry completes in 200ms, instantly for reduced motion');
  assert.doesNotMatch(source, /delay:|OA_LAYOUT/, 'No delayed or unbounded spring entrances');
}
function assertPublicType(css, owner, paragraphs) {
  assert.match(declaration(css, `.${owner}-oa-intro h1`, 'font-family'), /^"Bricolage Grotesque Variable"/, 'Preserve established display identity');
  for (const selector of paragraphs) assert.match(declaration(css, selector, 'font-family'), /^"Inter",/, `Body copy uses Inter: ${selector}`);
  assert.equal(declaration(css, `.${owner}-oa-page *`, 'transition-duration', '(prefers-reduced-motion: reduce)'), '0s');
  assert.equal(declaration(css, `.${owner}-oa-page *`, 'animation-duration', '(prefers-reduced-motion: reduce)'), '0s');
  assert.doesNotMatch(css, /transition:\s*all\b/);
}

test('Community keeps one contained entry with consistent body typography', () => {
  const source = read('src/components/CommunityDiscordPage.tsx');
  const css = read('src/styles/communityDiscordPage.css');
  assertContainedEntry(source, 'community');
  assertPublicType(css, 'community', ['.community-oa-intro p', '.community-oa-join-copy > p', '.community-oa-help-flow p', '.community-oa-room p', '.community-oa-boundary p']);
  assert.doesNotMatch(css, /community-oa-status/, 'Remove unused decorative status styling');
});

test('Resources keeps one contained entry with consistent body typography', () => {
  const source = read('src/components/ResourcesQuickStartPage.tsx');
  const css = read('src/styles/resourcesQuickStart.css');
  assertContainedEntry(source, 'resources');
  assertPublicType(css, 'resources', ['.resources-oa-intro p', '.resources-oa-step p', '.resources-oa-notice p', '.resources-oa-utility p']);
});

test('Pricing replaces repeated support advertisements with one plain boundary', () => {
  const source = read('src/components/MarketingPages.tsx');
  assert.doesNotMatch(source, /Start small|Upgrade when it matters|No hidden trading layer|BadgeCheck|liquid-glass/);
  assert.match(source, /<p className="public-pricing-boundary">Cova reviews completed trades\. No signals, order execution, or payout promises\.<\/p>/);
  assert.match(source, /<PlanStrip compact currentPlan=\{currentPlan\} go=\{go\} openAuth=\{openAuth\} proCheckoutAvailable=\{proCheckoutAvailable\} upgradeToPro=\{upgradeToPro\} \/>/, 'Plan rendering and entitlement/action inputs must be untouched');
  assert.match(source, /className="public-pricing-page relative overflow-hidden"/);
  assert.match(source, /import "\.\.\/styles\/publicPolish\.css"/);
  const css = read('src/styles/publicPolish.css');
  assert.match(declaration(css, '.public-pricing-page :is(h1, h2, h3)', 'font-family'), /^"Bricolage Grotesque Variable"/);
  assert.match(declaration(css, '.public-pricing-page .public-pricing-boundary', 'font-family'), /^"Inter",/);
});

function assertScopedPublicCss(css) {
  postcss.parse(css).walkRules(rule => {
    for (const selector of postcss.list.comma(rule.selector)) {
      assert.match(selector, /^(?:\.public-(?:legal|pricing)-page(?:\s|$)|\.pricing-showcase \.[a-z-]+)/, `Unscoped selector: ${selector}`);
    }
  });
  assert.doesNotMatch(css, /transition:\s*all\b|#18c887|#b9f5df|24,\s*200,\s*135/);
}

test('Legal presentation uses scoped cobalt surfaces and readable established typography', () => {
  const source = read('src/components/LegalPages.tsx');
  assert.match(source, /className="public-legal-page /);
  assert.match(source, /import "\.\.\/styles\/publicPolish\.css"/);
  assert.doesNotMatch(source, /eyebrow|#18c887|#b9f5df|24,200,135/);
  assert.match(source, /aria-label="Legal pages"/);
  assert.match(source, /On this page/);
  const css = read('src/styles/publicPolish.css');
  assertScopedPublicCss(css);
  assert.equal(declaration(css, '.public-legal-page', 'background'), '#08090c');
  assert.match(declaration(css, '.public-legal-page :is(h1, h2)', 'font-family'), /^"Bricolage Grotesque Variable"/);
  assert.match(declaration(css, '.public-legal-page .legal-body', 'font-family'), /^"Inter",/);
  assert.equal(declaration(css, '.public-legal-page .legal-body', 'font-size'), '1rem');
  assert.equal(declaration(css, '.public-legal-page .legal-body', 'color'), '#c3cce0');
  assert.match(declaration(css, '.public-legal-page .legal-meta', 'font-family'), /^"DM Mono"/);
  assert.match(declaration(css, '.public-legal-page :is(a, button):focus-visible', 'outline'), /^2px solid /);
});

// Entire SSR text at 189820e, excluding ONLY the three decorative eyebrow labels.
// Includes document title, intro, effective date, TOC, full body, contact and footer.
const expectedLegalHashes = {
  "PrivacyPage": "bd7a3f3dad959a5585f2a83eeb3725280d5e3017ae9afcf1a9fb39ff6469596c",
  "TermsPage": "3f6440ce5ef839f34043934a4fe686f0e7628e31ae87edaddc3e16b4c14d8002",
  "SecurityPage": "14eda1923a6b96674dbfa772eec67a2fcc327f7d0fd13532a2395e0322ef8262"
};
for (const [name, expected] of Object.entries(expectedLegalHashes)) {
  test(`${name} preserves the complete substantive document verbatim`, () => {
    const source = read('src/components/LegalPages.tsx');
    const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const require = createRequire(new URL('../package.json', import.meta.url));
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(id => id.endsWith('.css') ? undefined : require(id), mod, mod.exports);
    const html = renderToStaticMarkup(React.createElement(mod.exports[name], { go() {} }));
    const text = html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/Privacy &amp; control|Terms &amp; boundaries|Security &amp; trust/g, '').replace(/\s+/g, ' ').trim();
    assert.equal(createHash('sha256').update(text).digest('hex'), expected, `${name}: legal content changed, not just presentation`);
  });
}

test('Pricing microtype is readable on both public plan instances without changing commercial data', () => {
  const source = read('src/components/PlanSections.tsx');
  const data = source.match(/const planOptions = \[[\s\S]*?\] as const;/)[0].replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(data).digest('hex'), '3c2b62bfe502d671210f16278e209673b8ed005886d9c5a06174c48839f96571');
  assert.match(source, /const HeadingTag = compact \? "h1" : "h2";/);
  assert.match(source, /<HeadingTag className="pricing-showcase-title">Try the review flow before you pay\.<\/HeadingTag>/);
  assert.doesNotMatch(source, /Trade history · Risk limits · Shareable Passport/);
  const css = read('src/styles/publicPolish.css');
  for (const owner of ['plan-card-badge', 'plan-card-index', 'plan-feature-label', 'plan-price-note', 'plan-recommendation-tab']) {
    assert.equal(declaration(css, `.pricing-showcase .${owner}`, 'font-size'), '0.75rem');
    assert.match(declaration(css, `.pricing-showcase .${owner}`, 'font-family'), /^"DM Mono"/);
  }
  for (const owner of ['pricing-showcase-summary', 'plan-card-description', 'plan-feature-row', 'plan-primary-action', 'plan-secondary-action']) {
    assert.equal(declaration(css, `.pricing-showcase .${owner}`, 'font-size'), '0.875rem');
  }
});
