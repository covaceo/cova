import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import load from './helpers/load-ts.cjs';
const root = new URL('../', import.meta.url);
const source = file => readFileSync(new URL(file, root), 'utf8');
const core = load('src/lib/askCova.ts');
const server = load('server/askCova.ts');
const owner = '11111111-1111-4111-8111-111111111111';
const ids = ['review_results', 'explain_drawdown', 'what_stands_out', 'holding_time', 'setup_performance', 'time_of_day', 'long_vs_short'];
const env = { ASK_COVA_ENABLED: 'true', ASK_COVA_BETA_USER_ID: owner, OPENAI_API_KEY: 'synthetic-only-credential', ASK_COVA_BUDGET_ID: 'synthetic-only', ASK_COVA_BUDGET_MICRO_USD: '1000000', KV_REST_API_URL: 'https://synthetic.upstash.io', KV_REST_API_TOKEN: 'synthetic-only-not-a-credential-123456789' };
async function invoke(body, rawBody) {
  const events = [];
  let status, payload;
  const handler = server.createAskCovaHandler({ acquirePermit: async () => { events.push('permit'); throw Error('Permit must not run'); }, fetchImpl: async () => { events.push('provider'); throw Error('No network permitted'); } });
  await handler({ body, rawBody, user: { id: owner }, environment: env, rest: async () => { events.push('snapshot'); return []; } }, { status(n) { status = n; return this; }, json(value) { payload = value; } });
  return { status, payload, events };
}
const body = question => ({ action: 'ask_cova', owner, account: 'all', range: 'all', question, contextDigest: 'a'.repeat(64), requestId: '22222222-2222-4222-8222-222222222222', protocolVersion: 'ask-cova-v2' });
test('all seven shared question IDs pass schema before saved-workspace checks, never reserving', async () => {
  assert.deepEqual(core.ASK_COVA_QUESTION_IDS, ids);
  assert.match(source('src/lib/askCovaClient.ts'), /question: AskCovaQuestion/);
  assert.match(source('server/askCova.ts'), /!isAskCovaQuestion\(body.question\)/);
  for (const question of ids) {
    assert.equal(core.isAskCovaQuestion(question), true);
    const result = await invoke(body(question));
    assert.equal(result.status, 409, question);
    assert.deepEqual(result.events, ['snapshot']);
  }
});
test('legacy, duplicate, escaped-duplicate, forged and extra requests fail before storage and budget', async () => {
  const good = body('holding_time');
  const legacy = { ...good, consentVersion: 'ask-cova-v1' }; delete legacy.protocolVersion;
  for (const request of [legacy, { ...good, consentVersion: 'ask-cova-v1' }, { ...good, protocolVersion: 'ask-cova-v1' }, { ...good, protocolVersion: true }, { ...good, protocolVersion: undefined }, { ...good, question: 'setup_performance ' }, { ...good, question: 'constructor' }, { ...good, owner: '33333333-3333-4333-8333-333333333333' }, { ...good, text: 'PRIVATE COMPOSER' }, { ...good, model: 'forged' }]) {
    const result = await invoke(request); assert.equal(result.status, 400); assert.deepEqual(result.events, []);
  }
  for (const key of ['protocolVersion', 'protocol\\u0056ersion', 'question', 'ques\\u0074ion']) {
    const raw = JSON.stringify(good).replace('{', `{"${key}":"forged",`);
    const result = await invoke(good, raw); assert.equal(result.status, 400); assert.deepEqual(result.events, []);
  }
});
test('explicit-event authority replaces consent without weakening account authentication', () => {
  const ui = source('src/components/AskCova.tsx');
  assert.doesNotMatch(ui, /consented|setConsented|function consent|ask-cova-consent|OpenAI|gpt-|Use AI for this review|I accept/);
  assert.doesNotMatch(source('src/styles/askCova.css'), /ask-cova-consent/);
  assert.doesNotMatch(source('src/lib/askCovaClient.ts'), /consentVersion|ASK_COVA_CONSENT|permission to use AI/);
  assert.match(ui, /if \(!currentEpoch\(epoch\) \|\| !checkAuthority\(\)\) return/);
  assert.match(ui, /current\.epoch\+\+/);
  assert.match(ui, /pending\.current = controller/);
  assert.match(ui, /conversation\.current\.selected\?\.id === exchange\.id/);
  assert.match(ui, /void ask\(exchange, epoch\)/);
  assert.match(source('server/workspace.ts'), /requirePolicyAcceptedUser/);
  assert.match(source('server/askCova.ts'), /WORKSPACE_DISCLOSURE/);
  assert.match(source('src/lib/askCovaClient.ts'), /authority === accessAuthority && authority\(owner\) && workspaceOwnerCurrent\(owner\)/);
});
