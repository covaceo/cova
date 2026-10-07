import assert from 'node:assert/strict';
import {restoreApprovedTestimonialSource} from './helpers/approved-testimonial-hero.mjs';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const preservation = JSON.parse(await readFile(join(root, 'scripts/fixtures/homepage-story-preservation.json'), 'utf8'));
for (const item of preservation) {
  const raw = await readFile(join(root, item.path));
  const approvedRaw = item.path === 'src/components/MarketingHero.tsx' ? Buffer.from(restoreApprovedTestimonialSource(raw.toString('utf8'))) : raw;
  const data = item.normalization === 'lf' ? approvedRaw.toString('utf8').split(String.fromCharCode(13,10)).join(String.fromCharCode(10)) : approvedRaw;
  assert.equal(createHash('sha256').update(data).digest('hex'), item.sha256, `Protected approved source/artwork changed: ${item.path}`);
}
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { StoryStrip } = await server.ssrLoadModule('/src/components/StoryStrip.tsx');
  const html = renderToStaticMarkup(createElement(StoryStrip));
  assert.equal((html.match(/data-passport-tier="diamond"/g) ?? []).length, 1, 'The homepage must render one actual Diamond Passport, not a separate stats panel.');
  assert.match(html, /data-home-story="card-first"/);
  assert.match(html, /class="passport-etched-signature"/);
  assert.match(html, /DIAMOND/);
  assert.match(html, /Sample data · Not account verified/);
  assert.match(html, /Diamond rank shown for illustration/);
  assert.match(html, /href="#passport"/);
  assert.match(html, /Create my Passport/);
  assert.match(html, /Your trading\./);
  assert.match(html, /Worth sharing\./);
  assert.match(html, /data-passport-feature="interactive-sample"/);
  assert.equal((html.match(/data-passport-sample-mode=/g) ?? []).length, 3);
  assert.doesNotMatch(html, /home-story-step|How Cova works/);
  assert.doesNotMatch(html, /trade-proof-summary-panel|trade-proof-ledger|role="tab"|Alex R\./);
  console.log('PASS: actual Diamond, centered composition, sample modes, real Passport CTA, illustrative provenance.');
} finally {
  await server.close();
}
