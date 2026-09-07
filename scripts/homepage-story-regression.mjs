import assert from 'node:assert/strict';
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
  const data = item.normalization === 'lf' ? raw.toString('utf8').replace(/\r\n/g, '\n') : raw;
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
  assert.match(html, /href="#features"/);
  assert.match(html, /Explore the workflow/);
  assert.match(html, /Import trades\./);
  assert.match(html, /Find the leak\./);
  assert.match(html, /Build proof\./);
  assert.equal((html.match(/class="home-story-step"/g) ?? []).length, 4);
  for (const text of ['Bring in your trades.', 'See what keeps costing you.', 'Know the next fix.', 'Turn discipline into proof.']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /trade-proof-summary-panel|trade-proof-ledger|role="tab"|Alex R\./);
  console.log('PASS: actual Diamond, card-first composition, four steps, public CTA, illustrative provenance.');
} finally {
  await server.close();
}
