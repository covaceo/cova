// Owner-approved compact daily journal, manual entries and win/loss counts.
// Manual provenance and owner/account guards have executable unit + compiled browser coverage.
// Broker cash math, sync, rules and all unrelated behaviors remain exact.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const baseline = {
  "files": {
    "src/lib/risk.ts": "330e7feffe6caeadac5d80aca3269440e6a60d2987bb7fece522f5582450ec69",
    "src/lib/brokerCash.ts": "dc7b83e11df191494b9df8fc7f747cc0a325182bb5cdff8411c8b2cadfe9fbf5",
    "src/lib/journalAccuracy.ts": "7a05f8373f469f1944bf9577c51a30237cbfb8bf2ceb7484f085b4988cd179d6",
    "src/lib/storageScope.ts": "7fc8dac806a656d320dd2c658ca45d979207aa66f003b729cfb4a758f27573b4",
    "src/lib/accountNames.ts": "d28ec3a1b73b13a4897bfcfd18d244908ef2217fa4ae1a090bc463b3d78f7d89",
    "src/lib/dashboardPresentation.ts": "7923ce5a87c1eea620fe2956345d03820791ec4d5700ec07f84eb9779b36a4ef",
    "src/lib/dashboardReviewState.ts": "9e1693082021edf780c6c78dc659e9170a627817a81120e1d9997b7f68cd789f",
    "src/components/DashboardTradeDialog.tsx": "43ded14cebab010cac25a816e007e80873cbbd608401c75739c18e125d488fdc",
    "src/components/TradeAccountSelect.tsx": "7db73608c5b0cf31d6af44272fd78f55ef012b786c01f9dd086f2bb8055a21df",
    // Reconnect work changes only the expiry comment in this handler; sync behavior stays exact.
    "api/tradovate/sync.js": "c7452c268a2c4f579c2de7b384c591d98c1e54d49f52139dcca6d5594e2a371f",
    "api/_lib/tradovate-cash.js": "6493e133366096b6c775bac2e5d5d62aeab4f099d25887abfaa3aae86c7535ff"
  },
  "functions": {
    "Dashboard": "b5b67f459925338259632d29aabef163b351f090666d9b5aa25b19a11aa2c986",
    // Only the rejected fee-unavailability heading suffix was removed; cell values are unchanged.
    "DashboardStats": "dc42ace8210d70818d6d2da168246fe68c899e842c1d93d2999419d409e720f5",
    "DisciplineReview": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
};
const read = file => readFileSync(file,'utf8');
const sha = value => createHash('sha256').update(value.replaceAll('\r\n','\n')).digest('hex');
for (const [file, hash] of Object.entries(baseline.files)) assert.equal(sha(read(file)),hash,`${file}: visual work must not change financial/ownership/save semantics`);
const file=ts.createSourceFile('DashboardView.tsx',read('src/components/DashboardView.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
for (const [name, hash] of Object.entries(baseline.functions)) {
  const node=file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  const behavior=node.body.statements.filter(s=>!ts.isReturnStatement(s) && !(name === "Dashboard" && s.getText(file) === "const [historyOpen, setHistoryOpen] = useState(false);")).map(s=>s.getText(file)).join('\n');
  assert.equal(sha(behavior),hash,`${name}: filtering, financial cells, evidence selection, persistence and handlers are unchanged`);
}
// Authorized recap-only coverage/as-of readers are tested in session-recap-fees-regression.
// Keep the original ledger validation and dashboard accounting bodies exact below.
const cashAst=ts.createSourceFile('brokerCash.ts',read('src/lib/brokerCash.ts'),ts.ScriptTarget.Latest,true);
for (const [name,hash] of Object.entries({"checked": "a1098cced8a9a85c31ca0714dfcbaeee11682983227caa5c696f0b469739465d", "validateTrades": "a2e974aff5a93f48c93ed73105f04e24f2342b73cc38f4917e71c8a71182bde2", "brokerCashSummary": "7886c88ca3bd88926ef967d3fb9a509a9e93113bc87ebf70916184f497cc67c5"})) {
 const node=cashAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.equal(sha(node.body.getText(cashAst)),hash,`${name}: original accounting body preserved`);
}
console.log('approved-dashboard-preservation: exact accounting/ownership modules and dashboard non-render logic preserved');
