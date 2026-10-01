// Actual App/Dashboard/MiniJournal with synthetic auth and local workspace API.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const out='/workspace/cova-source-recovery/fullapp-evidence';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
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
const page=await context.newPage();const dismissFixtureAuthPanel=async()=>{
 // Synthetic authority can finish while the pre-auth route panel is animating.
 // Settle that fixture-only panel before querying accessibility roles behind it.
 await page.waitForTimeout(500);
 for(let i=0;i<20;i++){
  const close=page.getByRole('button',{name:'Close auth panel',exact:true});
  if(await close.count()) await close.evaluate(button=>button.click());
  if(await page.getByRole('combobox',{name:'Trade account',exact:true}).count())return;
  await page.waitForTimeout(100);
 }
};const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
try{
 await page.goto('http://127.0.0.1:4179/#dashboard',{waitUntil:'domcontentloaded'});
 await page.getByText('Saved to your account',{exact:true}).waitFor({timeout:15000});await dismissFixtureAuthPanel();
 if(await page.getByRole('combobox',{name:'Trade account',exact:true}).inputValue()!=='local') await page.getByRole('combobox',{name:'Trade account',exact:true}).selectOption('local');
 await page.getByLabel('Journal note',{exact:true}).fill('Trigger an in-flight daily save');
 await page.getByRole('button',{name:'Review ES trade from 2026-10-01'}).click();
 let release, began;
 const started=new Promise(r=>began=r);const gate=new Promise(r=>release=r);
 await page.route('**/api/workspace',async route=>{
  if(route.request().method()==='POST' && route.request().postDataJSON()?.action==='apply'){began();await gate;}
  await route.continue();
 });
 await page.locator('.mini-journal-footer button').evaluate(b=>b.click());
 await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error("No apply started")),10000))]);
 await page.getByLabel('Trade journal note',{exact:true}).fill('Draft entered during in-flight save');
 await page.locator('.astra-save-note').click();
 assert(await page.locator('.astra-trade-dialog').evaluate(d=>d.open));
 assert.match(await page.locator('.astra-trade-dialog').innerText(),/Not saved/);
 assert.equal(await page.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)).trades[0].notes,owner),'Original trade note');
 release();await page.getByText('Saved to your account',{exact:true}).waitFor({timeout:15000});await dismissFixtureAuthPanel();
 await page.reload({waitUntil:"domcontentloaded"});await page.getByText('Saved to your account',{exact:true}).waitFor({timeout:15000});await dismissFixtureAuthPanel();
 await page.getByRole('button',{name:'Review ES trade from 2026-10-01'}).click();
 assert.equal(await page.getByLabel('Trade journal note',{exact:true}).inputValue(),'Draft entered during in-flight save');
 await page.locator('.astra-save-note').click();
 assert.equal(await page.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)).trades[0].notes,owner),'Draft entered during in-flight save');
 await page.waitForTimeout(800);await page.getByText('Saved to your account',{exact:true}).waitFor({timeout:15000});await dismissFixtureAuthPanel();
 if(await page.getByRole('combobox',{name:'Trade account',exact:true}).inputValue()!=='local') await page.getByRole('combobox',{name:'Trade account',exact:true}).selectOption('local');
 await page.getByRole('button',{name:'Review ES trade from 2026-10-01'}).click();
 await page.getByLabel('Trade journal note',{exact:true}).fill('Quota-protected trade draft');
 await page.evaluate(()=>{window.__realStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('cova-react-risk-os-v2:'))throw new DOMException('Synthetic quota','QuotaExceededError');return window.__realStorageSet.call(this,k,v);};});
 await page.locator('.astra-save-note').click();
 assert(await page.locator('.astra-trade-dialog').evaluate(d=>d.open));
 assert.equal(await page.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)).trades[0].notes,owner),'Draft entered during in-flight save');
 await page.evaluate(()=>{Storage.prototype.setItem=window.__realStorageSet;});
 await page.locator('.astra-save-note').click();
 assert.equal(await page.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)).trades[0].notes,owner),'Quota-protected trade draft');
 await page.waitForTimeout(800);await page.getByText('Saved to your account',{exact:true}).waitFor();
 await page.getByLabel('Journal note',{exact:true}).fill('Unsaved daily draft survives same-owner invalidation');
 await page.evaluate(owner=>window.dispatchEvent(new StorageEvent('storage',{key:'cova-workspace-cache-v2:'+owner,newValue:'synthetic-notification'})),owner);
 await page.getByText('Account storage needs attention',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Journal note',{exact:true}).inputValue(),'Unsaved daily draft survives same-owner invalidation');
 await page.reload({waitUntil:"domcontentloaded"});await page.getByText('Saved to your account',{exact:true}).waitFor({timeout:15000});await dismissFixtureAuthPanel();
 if(await page.getByRole('combobox',{name:'Trade account',exact:true}).inputValue()!=='local') await page.getByRole('combobox',{name:'Trade account',exact:true}).selectOption('local');
 assert.equal(await page.getByLabel('Journal note',{exact:true}).inputValue(),'Unsaved daily draft survives same-owner invalidation');
 page.removeAllListeners('dialog');page.on('dialog',d=>d.dismiss());
 await page.getByRole('combobox',{name:'Trade account',exact:true}).selectOption('all');
 assert.equal(await page.getByRole('combobox',{name:'Trade account',exact:true}).inputValue(),'local');
 await page.getByRole('button',{name:'Limits',exact:true}).click();
 assert.equal(await page.getByLabel('Journal note',{exact:true}).inputValue(),'Unsaved daily draft survives same-owner invalidation');
 assert.match(page.url(),/#dashboard/);
 const otherOwner=crypto.randomUUID();
 await page.evaluate(o=>localStorage.setItem('qa-owner-override',o),otherOwner);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByText('Review account storage',{exact:true}).waitFor();
 await dismissFixtureAuthPanel();
 assert.equal(await page.getByLabel('Journal note',{exact:true}).count(),0); // no pre-consent owner workspace exposed
 await page.getByRole('button',{name:'Back up and copy browser changes'}).click();
 await page.getByText('Saved to your account',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Journal note',{exact:true}).inputValue(),'');
 assert.equal(await page.getByRole('button',{name:'Review ES trade from 2026-10-01'}).count(),0);
 await page.evaluate(()=>localStorage.removeItem('qa-owner-override'));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByText('Saved to your account',{exact:true}).waitFor();
 await dismissFixtureAuthPanel();
 if(await page.getByRole('combobox',{name:'Trade account',exact:true}).inputValue()!=='local') await page.getByRole('combobox',{name:'Trade account',exact:true}).selectOption('local');
 assert.equal(await page.getByLabel('Journal note',{exact:true}).inputValue(),'Unsaved daily draft survives same-owner invalidation');
 await page.screenshot({path:out+'/draft-restored.png'});
 assert.deepEqual(errors,[]);
 const receipts=['Actual App rejects native-dialog save during delayed sync without announcing success','Trade-note draft survives refresh and commits durably after sync','Same-owner storage invalidation retains mounted daily draft and blocks writes','Daily draft restores after full App refresh','Quota-rejected trade save keeps draft and retries durably','Cancelled account selection and navigation preserve dirty draft','Same-browser A to B to A hides A data and restores only A draft on return'];
 await writeFile(out+'/receipt.json',JSON.stringify({passed:true,receipts,errors},null,2));console.log(JSON.stringify({passed:true,receipts},null,2));
}catch(e){console.log(await page.locator("body").innerText());console.log(await page.locator("[data-recent-trade] button").evaluateAll(bs=>bs.map(b=>({label:b.getAttribute("aria-label"),outer:b.outerHTML}))));console.log(errors);throw e;}finally{await browser.close();}
