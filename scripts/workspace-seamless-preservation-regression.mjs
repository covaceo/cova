// Exact presentation seams against deployed PR159. No financial, auth or export rebaseline.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replaceAll('\r\n','\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
function seam(source,from,to){assert.equal(source.split(from).length,2,'Exact authorized presentation seam');return source.replace(from,to);}
function restoreApp(source){
 source=seam(source,'import { WorkspaceShell, WorkspaceMenuButton }','import { WorkspaceShell }');
 return seam(source,'<div className="workspace-page-title"><h1>Passport</h1><WorkspaceMenuButton /></div>\n                  <h2 id="passport-storage-title">Account storage is needed for Passport</h2>','<h1 id="passport-storage-title">Account storage is needed for Passport</h1>');
}
function restorePassport(source){
 source=seam(source,'<SectionShell title="Passport" variant="workspace" action={accountControl}>','<SectionShell title="Passport" variant="workspace">');
 return seam(source,'\n\n          <fieldset><legend>Card view','\n          {accountControl&&<div><label>Account</label>{accountControl}</div>}\n          <fieldset><legend>Card view');
}
test('App changes only the Passport storage heading and existing menu affordance',()=>{
 const source=read('src/App.tsx'),expected='6a31ecce376e6136786c33585a5900a6e82eb2362f950bdb67af6fd86b679967';
 assert.equal(hash(restoreApp(source)),expected);
 const anchor='workspaceSync.canPublishPlan';assert(source.includes(anchor));
 assert.notEqual(hash(restoreApp(source.replace(anchor,'true'))),expected);
});
test('Passport changes only placement of the same accountControl prop',()=>{
 const source=read('src/components/WorkspaceSections.tsx'),expected='3d5447ed7abd3d35ae4e49e76f019e2ff9bf25a8c06a087ab7c1224e5ba574ae';
 assert.equal(hash(restorePassport(source)),expected);
 const anchor='entitlements.canExportPassport';assert(source.includes(anchor));
 assert.notEqual(hash(restorePassport(source.replace(anchor,'true'))),expected);
});
const unchanged={
 'src/components/DashboardView.tsx':'f3729dd89fe75d56817fc37e206a1f17547d9ebb657ed08b7999b1e672b5a0d8',
 'src/components/AskCova.tsx':'61cb4b87fadf77ddd1fde7328e3b25904bfd2958c148de61c8b53c1c053e33fb',
 'src/styles/askCovaPanel.css':'fc1fe9b6c7105d7a6f1a7bcc75db913b8a4450437bef18cbbbae4571536cb5ff',
 'src/lib/risk.ts':'a1a0a24142bbb86436c6005bc1d8bc773787944ae75dc4488ab06a335b452854',
 'src/components/PassportHoloCard.tsx':'1de2a7be7ad761631f29dbd89e64bd77206f09f05d3d3a05b3ba0c19e70a70e0',
 'src/lib/passportHoloExport.ts':'3b2a42ba41b829702e6d2aa83171cfccc4f07441a4f2645b8f28f83795d339da',
 'src/lib/passportShare.ts':'38970562709719e90f52744862dfb8591a54e22cab56bd2d79399ac029533cb9',
 'src/lib/passportSquare.ts':'fc6b0d1fa28e405c27d6248c675790b212b54aabef98897e7c8c65af62cd9478'
};
for(const [file,expected] of Object.entries(unchanged))test('Approved source preserved: '+file,()=>assert.equal(hash(read(file)),expected));
