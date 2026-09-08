import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('operational rows are readable on first paint, without nested fade/blur/stagger entrances', () => {
  const file = ts.createSourceFile('WorkspaceSections.tsx', readFileSync(new URL('../src/components/WorkspaceSections.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rows = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.getText(file) === 'className' && /rules-ledger-row|insight-briefing-row/.test(a.initializer?.getText(file) || ''))) rows.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(rows.length, 3, 'Limits, Insights and locked Insights are all covered');
  for (const row of rows) {
    const attributes = row.attributes.properties.map(a => a.name?.getText(file));
    for (const entry of ['initial', 'whileInView', 'viewport', 'transition']) assert.ok(!attributes.includes(entry), `${row.attributes.getText(file)} must not replay a ${entry} entrance under the shared route motion`);
  }
});
