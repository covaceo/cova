import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('integrated preview removes review chrome without touching isolated bootstrap or app provenance', async () => {
  const root = await mkdtemp(join(tmpdir(),'cova-preview-export-'));
  try {
    await mkdir(join(root,'scripts'));
    await mkdir(join(root,'dist-astra-preview'));
    await cp(new URL('./export-astra-dashboard-preview.mjs',import.meta.url),join(root,'scripts/export-astra-dashboard-preview.mjs'));
    await writeFile(join(root,'dist-astra-preview/index.html'),'<html><head></head><body><div id="root"></div></body></html>');
    await writeFile(join(root,'vercel.json'),JSON.stringify({headers:[]}));
    execFileSync(process.execPath,[join(root,'scripts/export-astra-dashboard-preview.mjs'),join(root,'site')]);
    const html=await readFile(join(root,'site/index.html'),'utf8');
    const bootstrap=await readFile(join(root,'site/review-entry.js'),'utf8');
    assert.doesNotMatch(html,/Original study|ASTRA \/ INTEGRATED|cova-astra-study|<a\b/,'one integrated app, no links to standalone design studies');
    assert.doesNotMatch(html,/Sample workspace|cova-review-banner|review-banner.css/,'owner requested the review-only top strip removed');
    assert.match(html,/noindex,nofollow/);
    assert.ok(!(await readdir(join(root,'site'))).includes('review-banner.css'),'no retired banner offsets');
    assert.match(bootstrap,/if \(!localStorage.getItem\('cova-auth-session-v1'\)\)/,'existing sessions must not be replaced');
    assert.match(bootstrap,/'#dashboard'/);
    assert.doesNotMatch(bootstrap,/fetch\(|XMLHttpRequest|supabase/,'preview bootstrap must remain local and isolated');
  } finally { await rm(root,{recursive:true,force:true}); }
});
