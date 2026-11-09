// Narrow authority propagation guard; behavioral checks live in the browser suites.
import test from 'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
test('production App and Dashboard propagate complete saved-state authority, not only trade props',()=>{
 const app=readFileSync('src/App.tsx','utf8'),dashboard=readFileSync('src/components/DashboardView.tsx','utf8'),ui=readFileSync('src/components/AskCova.tsx','utf8');
 assert.match(app,/askCovaAuthorityKey=\{workspaceSync\.askCovaAuthorityKey\}/);
 assert.match(app,/captureAskCovaAuthority=\{workspaceSync\.captureAskCovaAuthority\}/);
 assert.match(dashboard,/authorityKey=\{askCovaAuthorityKey\}/);
 assert.match(dashboard,/captureAuthority=\{captureAskCovaAuthority\}/);
 assert.doesNotMatch(ui,/buildAskCovaCatalog|renderAskCovaAnswer|resolveAskCovaIntent/);
 assert.match(ui,/request = requestAskCovaQuery/);
});
