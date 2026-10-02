// Copy a clean, directly deployable source tree without credentials or project bindings.
// Retains the historical command name for existing verification workflows.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, dirname, relative, sep, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const target = resolve(process.argv[2] || '');
const relativeTarget = relative(root, target);
assert(process.argv[2] && (relativeTarget === '..' || relativeTarget.startsWith('..' + sep) || isAbsolute(relativeTarget)), 'Supply a new staging directory outside this checkout');
execFileSync('git', ['diff', '--exit-code', 'HEAD', '--'], { cwd: root, stdio: 'pipe' });
execFileSync(process.execPath, ['scripts/build-server-runtimes.mjs', '--check'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['--test', 'scripts/production-packaging-regression.mjs'], { cwd: root, stdio: 'inherit' });
await mkdir(target); // Refuse to overwrite an existing tree or its credentials.
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
const hashes = {};
for (const file of files) {
  if (file.startsWith('.env') || file === '.vercel' || file.startsWith('.vercel/') || file.startsWith('supabase/.temp/')) continue;
  const output = resolve(target, file);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(resolve(root, file), output);
  hashes[file] = createHash('sha256').update(await readFile(output)).digest('hex');
}
await writeFile(resolve(target, 'test-source-manifest.json'), JSON.stringify({
  purpose: 'Credential-free source package; bind the intended project explicitly before deployment',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
  sourceTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root }).toString().trim(),
  functions: 12, files: hashes,
}, null, 2) + '\n');
console.log('Prepared clean staging tree: ' + relative(process.cwd(), target));
