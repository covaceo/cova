import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const [file,start,end]of[['WorkspaceShell.tsx','const workspaceNavGroups =','satisfies'],['Navbar.tsx','const appNav =','satisfies']]){
 test(`${file}: Insights precedes Limits without changing route identities`,()=>{
  const source=readFileSync(new URL('../src/components/'+file,import.meta.url),'utf8');const block=source.slice(source.indexOf(start));const nav=block.slice(0,block.indexOf(end));
  const insights=nav.indexOf('id: "coach", label: "Insights"'),limits=nav.indexOf('id: "rules", label: "Limits"');
  assert(insights>=0&&limits>=0,'Keep the established ids and names');assert(insights<limits,'Insights must appear above Limits');
 });
}
