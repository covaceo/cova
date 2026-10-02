import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
assert(process.argv[2], 'Supply the staging directory after vercel build');
const stage = resolve(process.argv[2]);
const output = join(stage, '.vercel/output');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const entries = await readdir(join(output, 'functions'), { recursive: true });
const configs = entries.filter(file => file.endsWith('/.vc-config.json')).sort();
assert.equal(configs.length, 12);
const handlers = new Map();
for (const file of configs) {
  const dir = join(output, 'functions', file.slice(0, -'/.vc-config.json'.length));
  const config = await json(join(dir, '.vc-config.json'));
  assert.equal(config.runtime, 'nodejs24.x');
  const modulePath = join(dir, config.handler);
  const module = await import(pathToFileURL(modulePath));
  assert.equal(typeof module.default, 'function');
  handlers.set(file.split('.func/')[0], { module, config, modulePath });
}
assert.deepEqual([...handlers.keys()], [
  'api/account/delete', 'api/auth/consent', 'api/auth/logout', 'api/billing',
  'api/connectors/[action]', 'api/passport', 'api/rithmic/status', 'api/rithmic/sync',
  'api/tradovate/callback', 'api/tradovate/connect', 'api/tradovate/sync', 'api/workspace',
]);
assert.equal(handlers.get('api/billing').module.config.api.bodyParser, false);
assert.equal(handlers.get('api/rithmic/sync').config.maxDuration, 300);
assert.equal(handlers.get('api/rithmic/status').config.maxDuration, 30);
assert.deepEqual(await json(join(root, 'vercel.json')), await json(join(stage, 'vercel.json')));
const routes = (await json(join(output, 'config.json'))).routes;
const security = (await json(join(root, 'vercel.json'))).headers[0].headers;
for (const { key, value } of security) assert(routes.some(route => route.headers?.[key] === value));
assert(routes.some(route => route.dest === '/api/connectors/status?provider=tradovate'));
assert(routes.some(route => route.dest === '/api/connectors/[action]?action=$1'));

// No external service can be called by these tests, even if the host has credentials.
globalThis.fetch = () => { throw Error('External access forbidden in packaging verification'); };
const invoke = async (handler, req) => {
  const result = { headers: {} };
  await handler(req, { setHeader(k, v) { result.headers[k] = v; },
    status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } });
  return result;
};
const packed = handlers.get('api/connectors/[action]').module.default;
let comparisons = 0;
for (const [action, path] of [['status', '/api/connectors/status'], ['disconnect', '/api/connectors/disconnect'], ['status', '/api/tradovate/status']]) {
  const original = (await import(pathToFileURL(join(root, 'api/connectors', action + '.js')))).default;
  for (const method of ['GET', 'POST', 'PATCH']) {
    const req = { method, url: path + '?action=untrusted', headers: {}, query: { action: 'untrusted', provider: path.includes('tradovate') ? 'tradovate' : '' }, body: {} };
    assert.deepEqual(await invoke(packed, req), await invoke(original, req));
    comparisons++;
  }
}
assert.equal((await invoke(packed, { url: '/api/connectors/unknown', method: 'POST' })).status, 404);
console.log(`PASS 12 emitted native Node runtimes; ${comparisons} connector behavior comparisons; billing raw-body config, security headers, routes and timeouts`);
execFileSync(process.execPath, ['--test', 'scripts/workspace-api-regression.mjs'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, COVA_WORKSPACE_RUNTIME: handlers.get('api/workspace').modulePath },
});
