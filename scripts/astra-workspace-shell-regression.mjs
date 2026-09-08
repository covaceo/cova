import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const root = fileURLToPath(new URL('../',import.meta.url));
const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  file = resolve(root,file);
  if(cache.has(file)) return cache.get(file).exports;
  const module = {exports:{}}; cache.set(file,module);
  const output = ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('module','exports','require',output)(module,module.exports,name => {
    if(!name.startsWith('.')) return require(name);
    const path=resolve(dirname(file),name);
    return load([path,`${path}.ts`,`${path}.tsx`].find(existsSync));
  });
  return module.exports;
}
const props={brokerLabel:'User-supplied CSV',email:'review@example.test',riskScore:0,go:()=>{},signOut:()=>{},deleteAccount:()=>{},children:React.createElement('div',{'data-content':'preserved'},'existing route')};
test('all workspace destinations share the approved rail without wrapping or changing Risk Desk',()=>{
  const {WorkspaceShell}=load('src/components/WorkspaceShell.tsx');
  for(const section of ['dashboard','import','rules','coach','passport','oauth']) {
    const html=renderToStaticMarkup(React.createElement(WorkspaceShell,{...props,section}));
    assert.match(html,/workspace-shell operator-workspace oa-dashboard-shell/,section);
    assert.match(html,/astra-rail-account/,section);
    assert.match(html,/Back to website/,section);
    assert.match(html,/aria-label="Delete account"/,section);
    assert.match(html,/aria-label="Sign out"/,section);
    assert.match(html,/Cova risk score 0/,section);
    assert.equal((html.match(/aria-current="page"/g)||[]).length,1,section);
    assert.match(html,/data-content="preserved"/,section);
    if(section==='dashboard') assert.doesNotMatch(html,/astra-workspace-page/);
    else assert.match(html,new RegExp(`data-astra-route="${section}"`),section);
  }
  const app=readFileSync(resolve(root,'src/App.tsx'),'utf8');
  assert.match(app,/isProtectedSection\(section\) \? "oa-dashboard-app"/,'app styling must follow the protected-route boundary, not one tab');
});
