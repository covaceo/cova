// Owner requested presentation only. Keep the prior accounting and interaction logic exact.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const baseline = {
  "files": {
    "src/lib/risk.ts": "78991b6b2f932c3d91ddf7d5cb29fc6953a1732cda2be8cbc953d55b6b400ef9",
    "src/lib/brokerCash.ts": "c0196f5c6c08580b24daa2c57196ed115faa8118f84f3732f21870c530e93498",
    "src/lib/journalAccuracy.ts": "c688e6ef2228dfa272da1a075c7c2c0f740984f83df81de575490760261d827b",
    "src/lib/storageScope.ts": "3cd9c57c38bb10e9f7b61776f00422ab9590bdebd1d0e458eba5a33cc676e183",
    "src/lib/accountNames.ts": "e056578556c6ac10faeee8ed5a47b08a2b91b9327be0dd3216906db0cdc30501",
    "src/lib/dashboardPresentation.ts": "b97eafd5bda2d9130f807d61c1d8268dffc8c52e5a845376102488da397e454d",
    "src/lib/dashboardReviewState.ts": "9e1693082021edf780c6c78dc659e9170a627817a81120e1d9997b7f68cd789f",
    "src/components/DashboardTradeDialog.tsx": "302d1c3851169baadf76180225e607254f09e340b447384f52e2322ac3d8752a",
    "src/components/TradeAccountSelect.tsx": "a2bb1e76714dbf41633c145b5d61d6f5468d2b11166097bbdf9633d9d8cc8678",
    "api/tradovate/sync.js": "10bf3fad88e4f267abf064aa789856a028328a1e14f7e520f1757c705c4116b4",
    "api/_lib/tradovate-cash.js": "6493e133366096b6c775bac2e5d5d62aeab4f099d25887abfaa3aae86c7535ff"
  },
  "functions": {
    "Dashboard": "87819324e89670e5460172567d22823ddab376ec3c98b9377425c5cb2ba5c447",
    "DashboardStats": "16502055eb66daa8d4899ef5a32208bb895b504336217e1b95d4c9d666dec401",
    "DisciplineReview": "6ebd9a4cf58a991c70f8bf84ce0b12a696fffdaafbcd0d6b319171995f8ff8d5"
  }
};
const read = file => readFileSync(file,'utf8');
const sha = value => createHash('sha256').update(value.replaceAll('\r\n','\n')).digest('hex');
for (const [file, hash] of Object.entries(baseline.files)) assert.equal(sha(read(file)),hash,`${file}: visual work must not change financial/ownership/save semantics`);
const file=ts.createSourceFile('DashboardView.tsx',read('src/components/DashboardView.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
for (const [name, hash] of Object.entries(baseline.functions)) {
  const node=file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  const behavior=node.body.statements.filter(s=>!ts.isReturnStatement(s)).map(s=>s.getText(file)).join('\n');
  assert.equal(sha(behavior),hash,`${name}: filtering, financial cells, evidence selection, persistence and handlers are unchanged`);
}
console.log('approved-dashboard-preservation: exact accounting/ownership modules and dashboard non-render logic preserved');
