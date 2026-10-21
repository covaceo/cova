import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
const port = process.env.COVA_MOBILE_PORT || '4284';
assert(/^\d+$/.test(port));
const env = { ...process.env, COVA_WORKSPACE_FIXTURE_PORT: port, COVA_MOBILE_ORIGIN: `http://127.0.0.1:${port}`, COVA_MOBILE_PHASE: 'after' };
const server = spawn(process.execPath, ['scripts/workspace-browser-fixture.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', data => log += data);
server.stderr.on('data', data => log += data);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ready = false;
try {
  for (let i = 0; i < 400 && !log.includes('LOCAL_WORKSPACE_FIXTURE') && server.exitCode === null && server.signalCode === null; i++) await sleep(100);
  assert(log.includes(`LOCAL_WORKSPACE_FIXTURE ${env.COVA_MOBILE_ORIGIN}/__workspace`), log);
  ready = true;
  assert.equal((await fetch(env.COVA_MOBILE_ORIGIN)).status, 200);
  const child = spawn(process.execPath, ['scripts/mobile-readability-browser.mjs'], { env, stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, 'Mobile readability and real interactions');
} finally {
  server.kill();
  for (let i = 0; i < 100 && server.exitCode === null && server.signalCode === null; i++) await sleep(50);
  assert(server.exitCode !== null || server.signalCode !== null, 'Owned fixture exited');
  if (ready) {
    let closed = false;
    for (let i = 0; i < 40; i++) {
      try { await fetch(env.COVA_MOBILE_ORIGIN, { signal: AbortSignal.timeout(500) }); }
      catch { closed = true; break; }
      await sleep(50);
    }
    assert(closed, 'Owned fixture port closed');
  }
}
