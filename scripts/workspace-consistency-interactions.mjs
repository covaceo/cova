// User paths on the real workspace; all accounts and API responses are isolated fixtures.
const dialogReferences=new Map();
const dialogRoles=dialog=>dialog.evaluate(d=>[d,...d.querySelectorAll('h2,h3,button,input')].map(el=>{const c=getComputedStyle(el);return {tag:el.tagName,label:el.getAttribute('aria-label')||el.textContent.trim(),background:c.backgroundColor,color:c.color,border:c.border,radius:c.borderRadius,font:c.font,padding:c.padding};}));
export async function workspaceNavigation(s,route,{check,screenshot}){
 const p=s.page,label=`${s.width} ${route}`;
 if(s.width>850){
  const trigger=p.getByRole('button',{name:'Open workspace menu',exact:true});
  await trigger.click();
  check(label+' native shared drawer',await p.locator('.workspace-menu-dialog').evaluate(d=>{const r=d.getBoundingClientRect();return d.open&&d.matches(':modal')&&!d.inert&&r.x===0&&r.width===280&&r.height===innerHeight;}));
  await screenshot(s,route+'-navigation');
  for(const key of ['Control+k','Meta+k']){
   await p.keyboard.press(key);await p.locator('.workspace-search-dialog[open]').waitFor();
   check(label+' '+key+' one search modal',await p.locator('dialog:modal').count()===1);
   await p.keyboard.press('Escape');await trigger.click();
  }
  for(const name of ['Settings','Edit profile']){
   await p.getByRole('button',{name:'Profile menu',exact:true}).click();await p.getByRole('menuitem',{name,exact:true}).click();
   const child=p.getByRole('dialog',{name,exact:true});await child.waitFor();
   await p.waitForTimeout(150);const tokens=await dialogRoles(child),key=`${s.width}-${name}`;
   if(route==='dashboard')dialogReferences.set(key,tokens);else check(label+' '+name+' exact Risk Desk roles',JSON.stringify(tokens)===JSON.stringify(dialogReferences.get(key)),{reference:dialogReferences.get(key),actual:tokens});
   for(const key of ['Control+k','Meta+k']){await p.keyboard.press(key);check(label+' nested '+name+' retains authority for '+key,await child.isVisible()&&await p.locator('dialog:modal').count()===2&&!await p.locator('.workspace-search-dialog[open]').count());}
   for(const w of [851,850,s.width]){await child.locator('.cova-profile-dialog-head button').focus();await p.setViewportSize({width:w,height:1000});await p.keyboard.press('Control+k');check(label+' '+name+' resize '+w+' retains child modality',await child.evaluate(d=>d.matches(':modal')&&d.checkVisibility()&&d.contains(document.activeElement))&&await p.locator('dialog:modal').count()===2);}
   await screenshot(s,route+'-'+name.replaceAll(' ','-'));await p.keyboard.press('Escape');await child.waitFor({state:'detached'});
  }
  await p.keyboard.press('Escape');
  check(label+' close restores trigger and scroll',await trigger.evaluate(t=>document.activeElement===t&&!document.querySelector('dialog:modal')&&getComputedStyle(document.body).overflow!=='hidden'));
 }else{
  const menu=p.locator('.workspace-top-header .operator-mobile-menu-toggle');await menu.click();
  check(label+' mobile navigation reachable',await p.locator('.operator-mobile-menu-panel').isVisible());
  await screenshot(s,route+'-mobile-navigation');await menu.click();
 }
}
export async function workspaceDetails(s,route,{check,screenshot}){
 const p=s.page,label=`${s.variant} ${s.width} ${route}`;
 if(route==='rules'){
  await p.locator('.limits-advanced > summary').click();await p.locator('.limits-rule-details > summary').first().click();
  check(label+' all six values retained',await p.locator('.limits-value input').count()===6);
  check(label+' advanced plan gate retained',await p.locator('.limits-advanced input[type=number]:disabled').count()===(s.plan==='free'?2:0));
  await screenshot(s,'rules-expanded');await p.locator('.limits-rule-details > summary').first().click();await p.locator('.limits-advanced > summary').click();
 }
 if(route==='coach'&&await p.locator('[data-setup-row]').count()){
  await p.locator('[data-setup-row]').first().click();
  if(s.width<=600){check(label+' mobile drilldown excludes comparison',!await p.locator('.ip-setups').isVisible()&&await p.locator('#ip-setup-evidence').isVisible());await p.locator('.ip-record-toggle').click();check(label+' picker exposes all records',await p.locator('.ip-trade').count()===4&&await p.locator('.ip-trades').isVisible());}
  await p.locator('.ip-trade').last().click();await p.locator('[data-trade-details] > summary').click();
  check(label+' full financial details reachable',(await p.locator('[data-trade-details]').innerText()).includes('Planned risk'));
  await p.getByRole('button',{name:'Try a reflection',exact:true}).click();
  if(s.width<=600)check(label+' reflection retains 44px touch surface',await p.getByRole('button',{name:'Close reflection',exact:true}).evaluate(el=>el.getBoundingClientRect().height>=44));
  await screenshot(s,'coach-trade-detail');
  if(s.width<=600){await p.getByRole('button',{name:'Back to setups',exact:true}).click();check(label+' Back restores comparison',await p.locator('.ip-setups').isVisible()&&!await p.locator('#ip-setup-evidence').isVisible());}
  await p.getByRole('button',{name:'What’s tripping me up?',exact:true}).click();await p.locator('[data-limit-evidence] > summary').click();await screenshot(s,'coach-limit-details');
  await p.getByRole('button',{name:'Why did I take that?',exact:true}).click();await screenshot(s,'coach-why');
  await p.getByRole('button',{name:'What’s working?',exact:true}).click();
 }
 if(route==='import'){
  await p.getByRole('button',{name:'Add manual account',exact:true}).click();await screenshot(s,'account-create');await p.keyboard.press('Escape');
  await p.getByRole('button',{name:'Rename Sample review',exact:true}).click();await screenshot(s,'account-rename');await p.keyboard.press('Escape');
  await p.getByRole('button',{name:'Remove Sample review',exact:true}).click();await p.getByRole('dialog',{name:'Remove account',exact:true}).waitFor();await screenshot(s,'account-remove-confirmation');await p.getByRole('button',{name:'Cancel',exact:true}).click();
  check(label+' removal cancel retains exact account rows',await p.locator('.manual-account-row').count()===2);
  await p.getByRole('button',{name:'Connect platform',exact:true}).click();await screenshot(s,'account-platforms');await p.keyboard.press('Escape');
  await p.getByRole('button',{name:'Import CSV',exact:true}).click();await p.locator('[data-export-guide] > summary').click();await p.locator('.accounts-csv-editor > summary').click();
  if(s.variant==='enabled')check(label+' CSV modal is centered and bounded',await p.locator('.accounts-csv-dialog').evaluate(d=>{const r=d.getBoundingClientRect();return Math.abs(r.x-(innerWidth-r.width)/2)<2&&r.y>=0&&r.bottom<=innerHeight;}));
  check(label+' CSV source and editor retained',await p.getByRole('textbox',{name:'CSV text',exact:true}).isVisible());await screenshot(s,'account-csv-expanded');await p.keyboard.press('Escape');
 }
 if(route==='passport'&&await p.locator('.passport-workspace-modes').count()){
  for(const name of ['Discipline','Ghost','Coach','Flex']){await p.locator('.passport-workspace-modes').getByRole('button',{name,exact:true}).click();check(label+' '+name+' selected',await p.locator('.passport-workspace-modes').getByRole('button',{name,exact:true}).getAttribute('aria-pressed')==='true');}
  await p.locator('.passport-workspace-detail > summary').click();
  if(s.variant==='enabled')check(label+' expanded Passport metrics remain on the canvas',await p.locator('.passport-workspace-stats > div').evaluateAll(els=>els.every(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(el).borderLeftWidth==='0px')));
  await screenshot(s,'passport-expanded');await p.locator('.passport-workspace-detail > summary').click();
 }
}
export async function workspacePending(open,finish,{check,screenshot},width,variant){
 const s=await open({variant,width,scenario:'workspace-pending'}),p=s.page;let release;
 try{
  await p.evaluate(()=>location.hash='#rules');await p.locator('.workspace-sync-compact summary').click();
  const held=new Promise(resolve=>{release=resolve;});let requested=false;
  await s.context.route('**/api/workspace**',async route=>{if(route.request().method()==='GET'){requested=true;await held;}await route.fallback();});
  await p.getByRole('button',{name:'Reload account and review',exact:true}).click();
  const end=Date.now()+5000;while(!requested&&Date.now()<end)await p.waitForTimeout(25);
  check(`${s.id} reload request genuinely pending`,requested);
  check(`${s.id} loading is visible`,await p.locator('[data-storage-phase="loading"]').isVisible());
  await screenshot(s,'rules-storage-pending');release();await p.locator('[data-storage-phase="saved"]').waitFor();s.expectedPlanWrites=1;
 }finally{release?.();await finish(s);}
}
export async function workspaceLocalEditing(open,finish,{check,screenshot},width){
 const s=await open({width,local:true,scenario:'workspace-edit'}),p=s.page;
 try{
  await p.evaluate(()=>location.hash='#rules');await p.locator('.limits-value input').first().waitFor();
  const input=p.locator('.limits-value input').first(),before=await input.inputValue();await input.fill('2600');await input.press('Enter');
  check(`${width} Limits commits exact numeric value`,await input.inputValue()==='2600');await input.fill('0');await input.press('Enter');check(`${width} invalid limit leaves validation visible`,await p.locator('.limits-input-error').isVisible());await input.fill(before);await input.press('Enter');
  const toggle=p.getByRole('switch').first(),initial=await toggle.getAttribute('aria-checked');await toggle.click();check(`${width} limit switch toggles`,await toggle.getAttribute('aria-checked')!==initial);await toggle.click();
  check(`${width} unified number surface`,await input.evaluate(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(el).borderWidth==='0px'));
  await screenshot(s,'rules-edited');
  await p.evaluate(()=>location.hash='#passport');await p.locator('.workspace-storage-required').waitFor();await screenshot(s,'passport-storage-gate');
  check(`${width} Passport storage gate retains navigation`,width>850?await p.getByRole('button',{name:'Open workspace menu',exact:true}).isVisible():await p.locator('.operator-mobile-menu-toggle').isVisible());
 }finally{await finish(s);}
}
