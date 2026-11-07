// SYNTHETIC ONLY: real issued catalogs/atoms; no provider, credentials or ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import load from './helpers/load-ts.cjs';

const source = load('src/lib/askCova.ts');
const generated = { exports: {} };
const runtimeURL = new URL('../api/workspace.js', import.meta.url);
const runtime = readFileSync(runtimeURL, 'utf8') + '\nexport {buildAskCovaCatalog,askCovaModelPayload,renderAskCovaAnswer};';
new Function('module', 'exports', 'require', ts.transpileModule(runtime, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(generated, generated.exports, createRequire(runtimeURL));

const row = (pnl, extra = {}) => ({ id:'currency-synthetic', date:'2026-10-21', market:'NQ', side:'Long', contracts:1,
  entry:100, exit:101, pnl, risk:10, setup:'', notes:'PRIVATE SYNTHETIC NOTE',
  manual:{ accountKey:'local', currency:'USD', pnlBasis:'reported_net' }, ...extra });
const input = trades => ({ ownerId:'synthetic-currency-owner', account:'all', range:'all', question:'review_results', trades });
const authored = (text, evidence, detail = text) => ({ version:'ask-cova-answer-v1',
  paragraphs:[{text,evidence}], detail:[{text:detail,evidence}] });

for (const [kind, core] of [['source', source], ['generated', generated.exports]]) {
  for (const [name, pnl, value, display, expected] of [
    ['positive', 17.23, '17.23', '17.23 USD', '$17.23'],
    ['negative', -17.23, '-17.23', '−17.23 USD', '−$17.23'],
    ['zero', 0, '0.00', '0.00 USD', '$0.00'],
    ['large', 90071992547409.9, '90071992547409.90', '90071992547409.90 USD', '$90071992547409.90'],
  ]) test(`${kind} issued USD ${name} money uses a leading symbol in main and detail without changing facts`, async () => {
    const catalog = await core.buildAskCovaCatalog(input([row(pnl)]));
    const packet = core.askCovaModelPayload(catalog);
    const before = JSON.stringify({catalog,packet});
    assert.deepEqual(packet.facts.find(f => f.id === 'net'), {
      id:'net',kind:'money',value,display,currency:'USD',basis:'self-reported net',coverage:'full',
    });
    const answer = authored('USD is the currency; the result is {{f:net}}.', packet.requiredAnswerEvidence,
      'The same recorded amount is {{f:net}}.');
    const rendered = core.renderAskCovaAnswer(catalog, answer);
    assert.ok(rendered);
    assert.deepEqual(rendered.paragraphs, [`USD is the currency; the result is ${expected}.`]);
    assert.deepEqual(rendered.detail, [`The same recorded amount is ${expected}.`]);
    assert.equal(JSON.stringify({catalog,packet:core.askCovaModelPayload(catalog)}), before);
    assert.deepEqual(rendered.tradeIds, ['currency-synthetic']);
    assert.equal(rendered.contextDigest, catalog.contextDigest);
    assert.deepEqual(rendered.scopeNotices, []);
    assert.ok(catalog.candidates[0].detail.includes(display), 'legacy financial oracle stays in its original currency format');
  });

  for (const label of ['USD', 'Private USD desk', 'EUR', 'Category A', 'Category B', '17.23 USD']) {
    test(`${kind} comparison money changes only issued atoms beside private label ${label}`, async () => {
      const catalog = await core.buildAskCovaCatalog({...input([
        row(17.23, {id:'a',setup:label}), row(-4.56, {id:'b',setup:'Other USD label'}),
      ]), question:'setup_performance'});
      const packet = core.askCovaModelPayload(catalog);
      const before = JSON.stringify({catalog,packet});
      const answer = authored('USD is ordinary prose; {{c:category_a}} averaged {{f:mean_a}}, versus {{f:mean_b}} for {{c:category_b}}.',
        ['comparison'], '{{c:category_a}} had {{f:count_a}} groups; the mean gap was {{f:mean_gap}}.');
      const rendered = core.renderAskCovaAnswer(catalog, answer);
      assert.ok(rendered);
      assert.deepEqual(rendered.paragraphs, [`USD is ordinary prose; ${label} averaged $17.23, versus −$4.56 for Other USD label.`]);
      assert.deepEqual(rendered.detail, [`${label} had 1 groups; the mean gap was $21.79.`]);
      assert.deepEqual(packet.categories, [{id:'category_a',description:'Category A'},{id:'category_b',description:'Category B'}]);
      assert.deepEqual(packet.facts.filter(f => f.kind === 'money').map(f => [f.id,f.value,f.display]), [
        ['net','12.67','12.67 USD'],['mean_win','17.23','17.23 USD'],['mean_loss','4.56','4.56 USD'],
        ['mean_a','17.23','17.23 USD'],['mean_b','-4.56','−4.56 USD'],['mean_gap','21.79','21.79 USD'],
      ]);
      assert.equal(JSON.stringify({catalog,packet:core.askCovaModelPayload(catalog)}), before);
      assert.deepEqual(rendered.tradeIds, ['a','b']);
      assert.equal(rendered.contextDigest, catalog.contextDigest);
      assert.deepEqual(rendered.scopeNotices, []);
    });
  }

  for (const currency of ['EUR','GBP','CAD','AUD','CHF','NZD','SGD','HKD','JPY']) {
    test(`${kind} non-USD ${currency} retains its identity and precision in main and detail`, async () => {
      const catalog = await core.buildAskCovaCatalog(input([row(-17.23, {manual:undefined,
        source:{provider:'Rithmic',accountKey:'synthetic',accountId:'synthetic-account',currency}})]));
      const packet = core.askCovaModelPayload(catalog);
      const answer = authored('USD is prose; the result is {{f:net}}.',packet.requiredAnswerEvidence);
      const rendered = core.renderAskCovaAnswer(catalog, answer);
      assert.ok(rendered);
      assert.deepEqual(rendered.paragraphs, [`USD is prose; the result is −17.23 ${currency}.`]);
      assert.deepEqual(rendered.detail, rendered.paragraphs);
      assert.equal(packet.facts.find(f => f.id === 'net').currency, currency);
      assert.equal(packet.facts.find(f => f.id === 'net').value, '-17.23');
      assert.equal(packet.facts.find(f => f.id === 'net').display, `−17.23 ${currency}`);
      assert.deepEqual(core.askCovaModelPayload(catalog), packet);
      assert.deepEqual(rendered.scopeNotices, ['Fees not reconciled.']);
    });
  }

  test(`${kind} drawdown issued money atoms retain peak and negative trough in main and detail`, async () => {
    const catalog = await core.buildAskCovaCatalog({...input([
      row(17.23,{id:'peak',date:'2026-10-20'}), row(-21.79,{id:'trough'}),
    ]),question:'explain_drawdown'});
    const rendered = core.renderAskCovaAnswer(catalog, authored('The decline was {{f:drawdown}}.', ['drawdown'],
      'The path went from {{f:drawdown_peak}} to {{f:drawdown_trough}}.'));
    assert.ok(rendered);
    assert.deepEqual(rendered.paragraphs, ['The decline was $21.79.']);
    assert.deepEqual(rendered.detail, ['The path went from $17.23 to −$4.56.']);
    assert.deepEqual(core.askCovaModelPayload(catalog).facts.map(f => [f.value,f.display]),
      [['21.79','21.79 USD'],['17.23','17.23 USD'],['-4.56','−4.56 USD']]);
  });

  test(`${kind} trusted symbols do not relax authored-text or issued-fact validation`, async () => {
    const catalog = await core.buildAskCovaCatalog(input([row(17.23)]));
    const packet = core.askCovaModelPayload(catalog);
    const good = authored('Result {{f:net}}; win rate {{f:win_rate}}; groups {{f:group_count}}; profit factor {{f:profit_factor}}.',packet.requiredAnswerEvidence);
    const expected = 'Result $17.23; win rate 100.0%; groups 1; profit factor undefined (no losses).';
    assert.deepEqual(core.renderAskCovaAnswer(catalog,good).paragraphs, [expected]);
    assert.deepEqual(core.renderAskCovaAnswer(catalog,good).detail, [expected]);
    for (const text of ['Result $17.23.', 'Result $.', 'Result {{f:unissued}}.', 'Result {{c:unissued}}.']) {
      assert.equal(core.renderAskCovaAnswer(catalog, authored(text,packet.requiredAnswerEvidence)), null);
    }
    assert.equal(core.renderAskCovaAnswer({...catalog},good), null);
    assert.equal(core.renderAskCovaAnswer(catalog, authored('{{f:net}}',['payoff'])), null);
    packet.facts.find(f => f.id === 'net').display = '999.00 USD';
    assert.deepEqual(core.renderAskCovaAnswer(catalog,good).paragraphs, [expected]);
  });
}
