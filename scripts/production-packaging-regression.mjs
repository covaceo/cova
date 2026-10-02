import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, relative, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
async function apiEntries(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) result.push(...await apiEntries(path));
    else if (/\.(?:js|ts|mjs)$/.test(entry.name)) result.push(relative(root, path).split(sep).join('/'));
  }
  return result.sort();
}

test('the connected source checkout has exactly the twelve deployable API entrypoints', async () => {
  assert.deepEqual(await apiEntries(resolve(root, 'api')), [
    'api/account/delete.js', 'api/auth/consent.js', 'api/auth/logout.js',
    'api/billing.js', 'api/connectors/[action].js', 'api/passport.js',
    'api/rithmic/status.js', 'api/rithmic/sync.js', 'api/tradovate/callback.js',
    'api/tradovate/connect.js', 'api/tradovate/sync.js', 'api/workspace.js',
  ]);
});

test('deployment staging rejects a descendant directory before inspecting or copying source', async () => {
  const target = resolve(root, '.unsafe-deploy-stage-test');
  await assert.rejects(access(target), { code: 'ENOENT' });
  const result = spawnSync(process.execPath, ['scripts/prepare-test-deployment.mjs', target], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Supply a new staging directory outside this checkout/);
  await assert.rejects(access(target), { code: 'ENOENT' });
});
