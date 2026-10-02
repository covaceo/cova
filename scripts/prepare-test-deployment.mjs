// Produce an isolated source staging tree. Never modifies the normal deployment config.
import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const target = resolve(process.argv[2] || '');
assert(process.argv[2] && target !== root && !target.startsWith(root + '/'), 'Supply a new staging directory outside this checkout');
execFileSync('git', ['diff', '--exit-code', 'HEAD', '--'], { cwd: root, stdio: 'pipe' });
await mkdir(target); // Refuse to overwrite an existing tree or its credentials.
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
const hashes = {};
for (const file of files) {
  if (file.startsWith('.env') || file.startsWith('.vercel/')) continue;
  const output = resolve(target, file);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(resolve(root, file), output);
  hashes[file] = createHash('sha256').update(await readFile(output)).digest('hex');
}
for (const [entry, output] of [
  ['api/passport.ts', 'api/passport.js'],
  ['api/workspace.ts', 'api/workspace.js'],
  ['scripts/test-connectors-entry.mjs', 'api/connectors/[action].js'],
]) {
  const result = await build({ root, configFile: false, logLevel: 'error',
    build: { ssr: resolve(root, entry), target: 'node24', write: false, minify: false,
      rollupOptions: { output: { format: 'es', inlineDynamicImports: true } } } });
  assert.equal(result.output.length, 1, 'Expected one server runtime per entry');
  const code = '// Generated TEST runtime from ' + entry + '; edit the original source.\n' + result.output[0].code;
  await writeFile(resolve(target, output), code);
  hashes[output] = createHash('sha256').update(code).digest('hex');
}
for (const file of ['api/passport.ts', 'api/workspace.ts', 'api/connectors/status.js', 'api/connectors/disconnect.js']) {
  await rm(resolve(target, file));
  delete hashes[file];
}
await writeFile(resolve(target, 'test-source-manifest.json'), JSON.stringify({
  purpose: 'Isolated TEST source packaging; not a production release',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
  sourceTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root }).toString().trim(),
  functions: 12, files: hashes,
}, null, 2) + '\n');
console.log('Prepared TEST staging tree: ' + relative(process.cwd(), target));
