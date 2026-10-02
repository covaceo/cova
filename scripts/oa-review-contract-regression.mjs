import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const read=f=>readFileSync(f,'utf8').replaceAll('\r\n','\n');
// Risk/Coach baselines include the approved missing-planned-risk correction; missing-risk-regression verifies its behavior.
// Sidebar baseline includes the separately approved icon/copy/Settings entry update.
const hashes={"src/components/WorkspaceShell.tsx": "be3056fd874d6f624421a17d177b1f0ee71c52d2213632c86410c1ec44d15758", "src/components/TradeAccountSelect.tsx": "a2bb1e76714dbf41633c145b5d61d6f5468d2b11166097bbdf9633d9d8cc8678", "src/lib/risk.ts": "330e7feffe6caeadac5d80aca3269440e6a60d2987bb7fece522f5582450ec69", "src/lib/journalAccuracy.ts": "7a05f8373f469f1944bf9577c51a30237cbfb8bf2ceb7484f085b4988cd179d6", "src/lib/storageScope.ts": "7fc8dac806a656d320dd2c658ca45d979207aa66f003b729cfb4a758f27573b4", "src/styles/astraWorkspace.css": "e7abada755af571165c7ed70e50791327a9e0de243835ba1cb7fa3495a5ecb44", "src/styles/approvedDashboard.css": "7a3497aff68e23cfb7fe1daed298ad1cdb1c7cba499ddd7e4945c4fe9ae903e7"};
for(const [f,h] of Object.entries(hashes))assert.equal(createHash('sha256').update(read(f)).digest('hex'),h,f+' must remain untouched');
const source=read('src/components/WorkspaceSections.tsx');
assert.match(source,/oa-review-page oa-limits/,'Approved OA Limits surface');
assert.match(source,/oa-review-page oa-insights/,'Approved OA Insights surface');
assert.match(source,/oa-limit-group/);assert.match(source,/Advanced limits/);
assert.match(source,/oa-insight-primary/);assert.match(source,/oa-insight-secondary/);
assert.doesNotMatch(source.slice(0,source.indexOf('type PassportTier')),/rules-ledger-grid|rules-ledger-summary|insight-briefing-row/,'Retire boxy main-content structures');
const css=read('src/styles/astraWorkspaceContent.css');
assert.doesNotMatch(css,/workspace-sidebar|astra-rail|workspace-nav/,'Never restyle the left side');
const tree=ts.createSourceFile('WorkspaceSections.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const coach=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='Coach');
const nonRender=coach.body.statements.filter(n=>!ts.isReturnStatement(n)).map(n=>n.getText(tree)).join('\n');
assert.equal(createHash('sha256').update(nonRender).digest('hex'),'cc0a4abc785be793bc099d03446d3f92210083037677d10e85ac3fb569d6f236','Insight derivations, prioritization and entitlements preserved');
console.log('oa-review-contract: sidebar, financial modules and insight logic preserved; approved OA structure present');
