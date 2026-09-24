import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('approved search precedes the flat Accounts route while navigation remains functional',()=>{
 const source=read('src/components/WorkspaceShell.tsx');
 assert.ok(source.indexOf('<label className="workspace-sidebar-search"')<source.indexOf('<button className="astra-rail-account'),'Search must precede Accounts');
 assert.match(source,/workspace-sidebar-link-active/);assert.match(source,/go\("import"\)/);
});
test('approved Passport keeps the actual card visible before progression',()=>{
 const source=read('src/components/WorkspaceSections.tsx');
 const passport=source.slice(source.indexOf('export function Passport('));
 assert.ok(passport.indexOf('<PassportHoloCard')<passport.indexOf('<PassportProgress'),'Card must remain the primary artifact');
 assert.match(passport,/passport-utility-controls/);assert.match(passport,/PassportShareComposer/);
});
test('broker branding identifies both available routes without hardcoded demo accounts',()=>{
 const source=read('src/components/ImportPanels.tsx');
 assert.match(source,/BrokerBrand/);assert.match(source,/data-platform="rithmic"/);assert.match(source,/data-platform="tradovate"/);assert.doesNotMatch(source,/Demo account 01/);
});
