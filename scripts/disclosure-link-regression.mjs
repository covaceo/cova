import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const redirects = config.redirects ?? [];
const expectations = new Map([
  ['/disclosures', '/#disclosures'],
  ['/%23disclosures', '/disclosures'],
]);
for (const [source, destination] of expectations) {
  const rules = redirects.filter(rule => rule.source === source);
  assert.equal(rules.length, 1, `Missing unique public disclosure redirect: ${source}`);
  assert.equal(rules[0].destination, destination);
  assert.equal(rules[0].permanent, false, 'Use reversible 307 redirects, not permanently cached mistakes');
  assert.equal(rules[0].has, undefined, 'Public disclosures must not require cookies or authentication');
  assert.equal(rules[0].missing, undefined);
}
assert.equal(redirects.length, expectations.size, 'The fix must not introduce broad redirects');

// Preserve the actual Instagram destination literally. Decoding it before matching
// would hide the broken %23 pathname and incorrectly treat it as a working hash.
const instagram = new URL('https://l.instagram.com/?u=https%3A%2F%2Fcovadesk.com%2F%2523disclosures');
let target = new URL(instagram.searchParams.get('u'));
assert.equal(target.pathname, '/%23disclosures');
assert.equal(target.hash, '');
let hops = 0;
while (redirects.some(rule => rule.source === target.pathname)) {
  assert.ok(hops++ < 3, 'Disclosure redirect loop');
  target = new URL(redirects.find(rule => rule.source === target.pathname).destination, target);
}
assert.equal(target.href, 'https://covadesk.com/#disclosures');
assert.equal(hops, 2);
for (const path of ['/', '/api/tradovate/status', '/api/tradovate/callback', '/api/rithmic/sync', '/assets/index.js', '/other']) {
  assert.equal(redirects.some(rule => rule.source === path), false, `Unrelated route intercepted: ${path}`);
}
console.log('PASS: clean public disclosure link, exact Instagram encoded-path recovery, bounded redirects, and unrelated-route isolation');
