import { workspaceBrowserOptions, workspaceEvidence } from "./workspace-browser-support.mjs";
// Actual App/Dashboard/MiniJournal with synthetic auth and local workspace API.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const out=workspaceEvidence('same-profile-draft');await mkdir(out,{recursive:true});
const browser=await chromium.launch(workspaceBrowserOptions);
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const owner=crypto.randomUUID();
await context.addInitScript(owner=>{
 if(window.top!==window)return;
 owner=localStorage.getItem("qa-owner-override")||owner;
 window.__owner=owner;
 window.__qaSession={user:{id:owner,email:'synthetic@example.invalid',app_metadata:{plan:'pro'}},access_token:'qa-'+owner};
 localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'qa-session',email:'synthetic@example.invalid',signedInAt:'2026-10-01'}));

},owner);
await context.route('**/*', route=>route.request().url().startsWith('http://127.0.0.1:4179/') ? route.fallback() : route.abort());
await context.route('**/api/**',async route=>{
 if(route.request().url().includes('/api/workspace'))return route.continue();
 if(route.request().url().includes('/api/auth/consent'))return route.fulfill({json:{accepted:true}});
 return route.fulfill({status:404,json:{error:'Synthetic local fixture: not available'}});
});
const trade={id:'manual-full-app',date:'2026-10-01',market:'ES',side:'Long',contracts:1,entry:100,exit:101,pnl:25,risk:0,riskStatus:'missing',setup:'',notes:'Original trade note',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}};
const headers={Authorization:'Bearer qa-'+owner};
assert.equal((await context.request.post('http://127.0.0.1:4179/api/workspace',{headers,data:{owner,action:'consent',disclosure:'workspace-cloud-v1'}})).status(),200);
assert.equal((await context.request.post('http://127.0.0.1:4179/api/workspace',{headers,data:{owner,action:'apply',operationId:crypto.randomUUID(),records:[{kind:'trade',recordId:trade.id,accountId:'local',schemaVersion:1,payload:trade,expectedRevision:0,deleted:false}]}})).status(),200);

const writer=await context.newPage(), stale=await context.newPage();
async function ready(page) {
 if(page.url().startsWith('http://127.0.0.1:4179/'))await page.reload({waitUntil:'domcontentloaded'});
 else await page.goto('http://127.0.0.1:4179/#dashboard',{waitUntil:'domcontentloaded'});
 await page.getByText('Saved to your account',{exact:true}).waitFor({timeout:15000});
 await page.waitForTimeout(500);
 const close=page.getByRole('button',{name:'Close auth panel',exact:true});
 if(await close.count()) await close.evaluate(b=>b.click());
 const select=page.getByRole('combobox',{name:'Trade account',exact:true});
 await select.waitFor(); if(await select.inputValue()!=='local')await select.selectOption('local');
}
try {
 await ready(writer);
 await writer.getByLabel('Journal note',{exact:true}).fill('Synthetic B conflict baseline — TEST only');
 await writer.locator('.mini-journal-footer button').click();
 await writer.waitForTimeout(1200);await writer.getByText('Saved to your account',{exact:true}).waitFor();
 await ready(stale);
 await stale.getByLabel('Journal note',{exact:true}).fill('Synthetic B stale draft — TEST only');
 await ready(writer);
 await writer.getByLabel('Journal note',{exact:true}).fill('Synthetic A newer saved note — TEST only');
 await writer.locator('.mini-journal-footer button').click();
 await writer.waitForTimeout(800);
 await writer.getByText('Saved to your account',{exact:true}).waitFor();
 await stale.getByText('Account storage needs attention',{exact:true}).waitFor();
 assert.equal(await stale.getByLabel('Journal note',{exact:true}).inputValue(),'Synthetic B stale draft — TEST only');
 let cancelled=false;
 stale.on('dialog',async dialog=>{assert.match(dialog.message(),/Discard the unsaved journal note/);cancelled=true;await dialog.dismiss();});
 await stale.getByRole('button',{name:'Reload account and review',exact:true}).click();
 assert(cancelled);
 await ready(stale);
 const actual=await stale.getByLabel('Journal note',{exact:true}).inputValue();
 await stale.screenshot({path:out+'/after-refresh.png'});
 const receipt={expected:'Synthetic B stale draft — TEST only',actual,cancelled,passed:actual==='Synthetic B stale draft — TEST only'};
 await writeFile(out+'/receipt.json',JSON.stringify(receipt,null,2));console.log(receipt);
 assert.equal(actual,receipt.expected);
 assert.equal(await stale.locator('.mini-journal-footer [role="status"]').innerText(),'Unsaved changes');
 // The recovered draft is not automatically written over the newer saved note.
 assert.equal(await stale.evaluate(async owner=>(await import('/src/lib/dailyJournal.ts')).readDailyJournal(owner,'local','2026-10-01'),owner),'Synthetic A newer saved note — TEST only');
 await stale.getByRole('button',{name:'Review ES trade from 2026-10-01'}).click();
 await stale.getByLabel('Trade journal note',{exact:true}).fill('Synthetic stale trade draft — TEST only');
 await ready(writer);
 await writer.getByRole('button',{name:'Review ES trade from 2026-10-01'}).click();
 await writer.getByLabel('Trade journal note',{exact:true}).fill('Synthetic newer saved trade note — TEST only');
 await writer.locator('.astra-save-note').click();await writer.waitForTimeout(1000);
 await writer.getByText('Saved to your account',{exact:true}).waitFor();
 await ready(stale);
 await stale.getByRole('button',{name:'Review ES trade from 2026-10-01'}).click();
 assert.equal(await stale.getByLabel('Trade journal note',{exact:true}).inputValue(),'Synthetic stale trade draft — TEST only');
 assert.equal(await stale.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)).trades[0].notes,owner),'Synthetic newer saved trade note — TEST only');
 await stale.getByRole('button',{name:'Close trade note',exact:true}).click();
 assert.equal(await stale.getByLabel('Journal note',{exact:true}).inputValue(),receipt.expected);
 receipt.tradeDraftPassed=true;receipt.newerSavedNotesUnchanged=true;
 await writeFile(out+'/receipt.json',JSON.stringify(receipt,null,2));console.log(receipt);
}catch(error){console.log('WRITER',await writer.locator('body').innerText());console.log('STALE',await stale.locator('body').innerText());throw error;}finally {await browser.close();}
