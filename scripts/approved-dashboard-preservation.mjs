// Owner-approved compact daily journal, manual entries and win/loss counts.
// Manual provenance and owner/account guards have executable unit + compiled browser coverage.
// Broker cash math, sync, rules and all unrelated behaviors remain exact.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const baseline = {
  "files": {
    "src/lib/risk.ts": "56dc6981baa1a5bbacb10acc487cca6881443388087ebca124363966517fc2b7",
    "src/lib/brokerCash.ts": "c594ec3b82be49a6b1e68629792ad6e8cfbd5bde168b4c50bf6fe5659b8b9fa6",
    "src/lib/journalAccuracy.ts": "7a05f8373f469f1944bf9577c51a30237cbfb8bf2ceb7484f085b4988cd179d6",
    "src/lib/storageScope.ts": "3cd9c57c38bb10e9f7b61776f00422ab9590bdebd1d0e458eba5a33cc676e183",
    "src/lib/accountNames.ts": "e056578556c6ac10faeee8ed5a47b08a2b91b9327be0dd3216906db0cdc30501",
    "src/lib/dashboardPresentation.ts": "7923ce5a87c1eea620fe2956345d03820791ec4d5700ec07f84eb9779b36a4ef",
    "src/lib/dashboardReviewState.ts": "9e1693082021edf780c6c78dc659e9170a627817a81120e1d9997b7f68cd789f",
    "src/components/DashboardTradeDialog.tsx": "5425bcaaabce7c99ee925b577d3c2324c4c41cd9bcb9b1c849871a712c7ec730",
    "src/components/TradeAccountSelect.tsx": "a2bb1e76714dbf41633c145b5d61d6f5468d2b11166097bbdf9633d9d8cc8678",
    // Reconnect work changes only the expiry comment in this handler; sync behavior stays exact.
    "api/tradovate/sync.js": "c7452c268a2c4f579c2de7b384c591d98c1e54d49f52139dcca6d5594e2a371f",
    "api/_lib/tradovate-cash.js": "6493e133366096b6c775bac2e5d5d62aeab4f099d25887abfaa3aae86c7535ff"
  },
  "functions": {
    "Dashboard": "b5b67f459925338259632d29aabef163b351f090666d9b5aa25b19a11aa2c986",
    "DashboardStats": "5de31d7b60adc1f2d8f999d1a216e8dd4c608fd0f7b9a871eeb3c7f2620e5795",
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
