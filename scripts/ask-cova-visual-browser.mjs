// Measured approved reference at 1536 x 1024. No invented financial data.
// Run through the isolated real-App fixture using --visual.
import path from 'node:path';
import {chooseAccount} from './helpers/account-picker.mjs';
export async function runVisualChecks({open,finish,check,screenshot,ask,report,out}) {
 for(const width of (process.env.COVA_VISUAL_QUICK ? [1536] : [1536,1440,768,390])) {
  const s=await open({width,scenario:'visual-match'}),p=s.page;
  try {
   await p.setViewportSize({width,height:width>=1280?1024:width===768?1024:844});
   const launcher=p.getByRole('button',{name:'Ask Cova',exact:true});
   check(width+' Ask initially closed',await launcher.getAttribute('aria-expanded')==='false');
   await screenshot(s,'closed');
   await launcher.click(); await p.locator('[data-ask-cova]').waitFor();
   await ask(s);await p.mouse.move(0,0);await p.evaluate(()=>document.activeElement?.blur());
   await p.waitForTimeout(200);
   await screenshot(s,'answer');
   const boxes=await p.evaluate(()=>{
    const selectors={title:'.astra-title h1',range:'.dashboard-review-range',metrics:'.astra-stat-strip',label:'.astra-stat-label',value:'.astra-stat-value',chartTitle:'#astra-equity-title',chart:'.astra-chart-svg',plot:'.astra-chart-axis',tradesTitle:'#astra-recent-title',table:'.astra-trade-table',tableHead:'.astra-trade-table thead',firstRow:'.astra-trade-table tbody tr',scoreTitle:'#astra-discipline-title',score:'.oa-discipline-score',journalTitle:'#astra-journal-title',panel:'#ask-cova-panel',chatTitle:'.ask-cova-heading h2',reply:'[data-cova-answer]',composer:'.ask-cova-composer',privacy:'.ask-cova-privacy'};
    return Object.fromEntries(Object.entries(selectors).map(([key,selector])=>{const el=document.querySelector(selector);if(!el)return [key,null];const r=el.getBoundingClientRect(),c=getComputedStyle(el);return [key,{x:r.x,y:r.y,width:r.width,height:r.height,font:c.fontSize,family:c.fontFamily,weight:c.fontWeight,lineHeight:c.lineHeight}];}));
   });
   report.measurements.push({id:s.id,reference:'seamless-concept-v2.png',boxes});
   const endpoint=await p.locator('.astra-chart-svg').evaluate(svg=>{const text=svg.querySelector('.astra-chart-endpoint'),badge=svg.querySelector('.astra-chart-endpoint-badge');if(!text||!badge)return {present:false};const t=text.getBoundingClientRect(),b=badge.getBoundingClientRect(),c=getComputedStyle(badge);return {present:true,contains:b.left<=t.left-4&&b.right>=t.right+4&&b.top<=t.top-2&&b.bottom>=t.bottom+2,rounded:Number(badge.getAttribute('rx'))>=5,stroke:c.stroke,strokeWidth:c.strokeWidth,fill:c.fill};});
   check(width+' endpoint uses a fitted outlined rounded badge',endpoint.present&&endpoint.contains&&endpoint.rounded&&endpoint.stroke!=='none'&&endpoint.strokeWidth==='1px'&&endpoint.fill==='rgb(15, 16, 17)',endpoint);
   if(width>=1280)await screenshot(s,'endpoint','.astra-chart-panel');
   if(width===1536){
    const near=(actual,target,tolerance=8)=>Math.abs(actual-target)<=tolerance;
    for(const [key,axis,target,tolerance] of [['title','x',36,8],['title','y',8,8],['chartTitle','y',244,12],['tradesTitle','y',523,12],['scoreTitle','y',800,16],['journalTitle','x',595,20],['panel','x',1116,8],['panel','y',72,8],['composer','x',1142,8],['composer','y',853,12],['composer','width',373,8]])check('Reference anchor '+key+'.'+axis,near(boxes[key][axis],target,tolerance),{actual:boxes[key][axis],target,tolerance});
    check('Title size follows reference',boxes.title.font==='38px');
    check('Table exposes saved fields',await p.locator('.astra-trade-table th').count()===9);
    check('Compact workspace menu available',await p.getByRole('button',{name:'Open workspace menu',exact:true}).isVisible());
    check('Reference plot top',Math.abs(boxes.plot.y-294)<1,{actual:boxes.plot.y,target:294});
    check('Reference plot bottom',Math.abs(boxes.plot.y+boxes.plot.height-460)<1,{actual:boxes.plot.y+boxes.plot.height,target:460});
    const composer=p.getByRole('textbox',{name:'Message Cova',exact:true});await composer.fill('Unsent hit-area check');
    const hit=await p.getByRole('button',{name:'Send message',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect(),pseudo=getComputedStyle(el,'::after');const at=(x,y)=>{const t=document.elementFromPoint(x,y);return t===el||el.contains(t);};return {face:{width:r.width,height:r.height},target:{width:pseudo.width,height:pseudo.height},edges:[at(r.left-3,r.y+r.height/2),at(r.right+3,r.y+r.height/2),at(r.x+r.width/2,r.top-3),at(r.x+r.width/2,r.bottom+3)]};});
    check('Circular Send has real 44px hit surface, not clipped SVG content',hit.target.width==='44px'&&hit.target.height==='44px'&&hit.edges.every(Boolean),hit);await composer.fill('');
    await p.locator('.astra-metric-details summary').click();
    check('Metric details retain actual averages',await p.locator('.astra-metric-details .astra-average-cell').count()===2&&await p.locator('.astra-metric-details .astra-average-cell').first().isVisible());
    check('Metric details retain wins and losses',(await p.locator('.astra-metric-details').innerText()).includes('3 wins · 1 loss'));
    await p.locator('.astra-metric-details summary').click();
   }
   check(width+' no document overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(width>=1280 && await p.getByRole('button',{name:'Open workspace menu',exact:true}).count()){
    await p.getByRole('button',{name:'Close Ask Cova',exact:true}).click();
    const trigger=p.getByRole('button',{name:'Open workspace menu',exact:true});await trigger.click();
    const nav=p.getByRole('dialog',{name:'Workspace menu',exact:true});await nav.waitFor();
    for(const name of ['Accounts','Risk Desk','Insights','Limits','Passport'])check('Menu destination '+name+' '+width,await nav.getByRole('button',{name,exact:true}).isVisible());
    check('Menu retains search '+width,await nav.getByRole('button',{name:/Search/}).isVisible());
    check('Menu contains profile '+width,await nav.locator('.cova-profile-trigger').isVisible());
    await screenshot(s,'navigation');
    await nav.getByRole('button',{name:/Search/}).click();await p.waitForTimeout(100);
    check('Menu search opens actual search dialog '+width,await p.locator('.workspace-search-dialog[open]').isVisible());
    if(await p.locator('.workspace-search-dialog[open]').count())await p.keyboard.press('Escape');
    if(!await nav.isVisible())await trigger.click();
    await nav.getByRole('button',{name:'Profile menu',exact:true}).click();
    await nav.getByRole('menuitem',{name:'Settings',exact:true}).click();
    await p.getByRole('dialog',{name:'Settings',exact:true}).waitFor();
    await p.keyboard.press('Escape');await p.waitForTimeout(100);
    check('Nested settings Escape retains workspace menu '+width,await nav.isVisible());
    if(!await nav.isVisible())await trigger.click();
    await p.keyboard.press('Escape');await nav.waitFor({state:'hidden'});
    check('Menu Escape restores focus '+width,await trigger.evaluate(el=>el===document.activeElement));
    check('Menu close restores scroll '+width,await p.evaluate(()=>getComputedStyle(document.body).overflow!=='hidden'));
    // Every destination is exercised through the retained navigation, not a hash-only smoke.
    if(width===1536){
     for(const [name,route] of [['Accounts','import'],['Insights','coach'],['Limits','rules'],['Passport','passport']]){
      await trigger.click();await nav.getByRole('button',{name,exact:true}).click();
      await p.waitForFunction(route=>location.hash==='#'+route,route);
      check('Compact menu navigates to '+route,await p.locator('[data-astra-route="'+route+'"]').isVisible());
      if(route==='passport')s.expectedPlanWrites=2; // Existing Passport view also attempts the same denied plan synchronization.
      check('Navigation releases modal scroll '+route,await p.evaluate(()=>!document.querySelector('.workspace-menu-dialog[open]')&&getComputedStyle(document.body).overflow!=='hidden'));
      await p.getByRole('button',{name:'Open workspace menu',exact:true}).click();await p.locator('.workspace-menu-dialog[open]').getByRole('button',{name:'Risk Desk',exact:true}).click();await p.locator('.astra-dashboard').waitFor();
     }
     await trigger.click();await p.setViewportSize({width:1536,height:480});
     await nav.getByRole('button',{name:'Passport',exact:true}).scrollIntoViewIfNeeded();
     check('Short menu last destination reachable',await nav.getByRole('button',{name:'Passport',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
     await nav.getByRole('button',{name:'Close workspace menu',exact:true}).click();await p.setViewportSize({width:1536,height:1024});
     await trigger.click();await p.keyboard.press('Control+k');await p.locator('.workspace-search-dialog[open]').waitFor();
     check('Menu keyboard search handoff',true);await p.keyboard.press('Escape');
     await p.waitForFunction(()=>document.activeElement===document.querySelector('.workspace-menu-trigger'));
     check('Search restores visible menu trigger',await trigger.evaluate(el=>el===document.activeElement));
     await trigger.click();await p.keyboard.press('Meta+k');await p.locator('.workspace-search-dialog[open]').waitFor();
     check('Menu Meta keyboard search handoff',true);await p.keyboard.press('Escape');
     await p.waitForFunction(()=>document.activeElement===document.querySelector('.workspace-menu-trigger'));
     for(const name of ['Settings','Edit profile'])for(const shortcut of ['Control+k','Meta+k']){
      const label=name+' '+shortcut;
      await trigger.click();await nav.getByRole('button',{name:'Profile menu',exact:true}).click();
      await nav.getByRole('menuitem',{name,exact:true}).click();
      const child=p.getByRole('dialog',{name,exact:true});await child.waitFor();
      await p.keyboard.press(shortcut);await p.keyboard.press('Tab');
      const state=await p.evaluate(()=>{const child=document.querySelector('.cova-profile-dialog'),close=child?.querySelector('.cova-profile-dialog-head button'),r=close?.getBoundingClientRect(),hit=r&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>({visible:d.checkVisibility(),modal:d.matches(':modal')})),menuExpanded:document.querySelector('.workspace-menu-trigger').getAttribute('aria-expanded'),focusInChild:!!child?.contains(document.activeElement)&&document.activeElement.checkVisibility(),closeHit:!!hit&&(hit===close||close.contains(hit)),searchOpen:!!document.querySelector('.workspace-search-dialog[open]')};});
      report.measurements.push({id:s.id,label,...state});
      const owned=state.dialogs.length===2&&state.dialogs.every(d=>d.visible&&d.modal)&&state.menuExpanded==='true'&&state.focusInChild&&state.closeHit&&!state.searchOpen;
      check(label+' retains visible nested modal ownership and live hit target',owned,state);
      if(!owned){await p.keyboard.press('Escape');continue;}
      await p.setViewportSize({width:390,height:844});
      await p.keyboard.press(shortcut);await p.keyboard.press('Tab');
      check(label+' resize keeps nested stack visible',await p.locator('dialog[open]').evaluateAll(els=>els.length===2&&els.every(el=>el.checkVisibility()&&el.matches(':modal'))));
      check(label+' phone shortcut retains child focus',await child.evaluate(el=>el.contains(document.activeElement)&&document.activeElement.checkVisibility()));
      const close=child.getByRole('button',{name:name==='Settings'?'Close settings':'Close profile editor',exact:true});
      await close.scrollIntoViewIfNeeded();
      check(label+' phone close target is interactive',await close.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit);}));
      await screenshot(s,'nested-'+name.replaceAll(' ','-')+'-'+shortcut.replace('+','-'),'.cova-profile-dialog');
      await p.keyboard.press('Escape');await child.waitFor({state:'detached'});
      await p.waitForFunction(()=>document.activeElement===document.querySelector('.workspace-menu-dialog .cova-profile-trigger'));
      check(label+' Escape closes child only and restores profile focus',await nav.isVisible()&&await p.locator('dialog:modal').count()===1);
      await p.keyboard.press('Escape');await nav.waitFor({state:'hidden'});
      check(label+' final Escape releases page and phone focus',await p.evaluate(()=>!document.querySelector('dialog:modal')&&getComputedStyle(document.body).overflow!=='hidden'&&document.activeElement===document.querySelector('.workspace-top-header .operator-mobile-menu-toggle')&&document.activeElement.checkVisibility()));
      await p.setViewportSize({width:1536,height:1024});
      await launcher.scrollIntoViewIfNeeded();
      check(label+' dashboard hit testing restored',await launcher.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit);}));
     }
     await trigger.click();await nav.getByRole('button',{name:'Profile menu',exact:true}).click();await nav.getByRole('menuitem',{name:'Settings',exact:true}).click();await p.getByRole('dialog',{name:'Settings',exact:true}).waitFor();
     await p.setViewportSize({width:390,height:844});await p.waitForTimeout(100);
     check('Menu breakpoint leaves no hidden native dialogs',await p.locator('dialog[open]').evaluateAll(els=>els.every(el=>el.checkVisibility())));
     await p.keyboard.press('Escape');await p.waitForTimeout(100);
     check('Breakpoint nested Escape closes settings first',await nav.isVisible()&&!await p.getByRole('dialog',{name:'Settings',exact:true}).count());
     await p.keyboard.press('Escape');await p.waitForTimeout(100);
     check('Menu breakpoint restores page scrolling after child closes',await p.evaluate(()=>!document.querySelector('dialog[open]')&&getComputedStyle(document.body).overflow!=='hidden'));
     check('Breakpoint close restores visible phone navigation focus',await p.locator('.workspace-top-header .operator-mobile-menu-toggle').evaluate(el=>el===document.activeElement&&el.checkVisibility()));
     await p.setViewportSize({width:1536,height:1024});
    }
   }
  }finally{await finish(s);}
 }
 if(!process.env.COVA_VISUAL_QUICK){
  const s=await open({width:1536,scenario:'visual-match-populated'}),p=s.page;
  try {
   await p.setViewportSize({width:1536,height:1024});
   const note='Reviewed the saved pullback trades. Kept size at one contract and noted the losing session for review.';
   await p.waitForTimeout(200);
   check('Saved note is readable text preview',await p.locator('.journal-note-preview').isVisible());
   check('Saved note desktop history reachable',await p.getByRole('button',{name:'View journal',exact:true}).isVisible());
   await p.getByRole('button',{name:'Ask Cova',exact:true}).click();await ask(s);await screenshot(s,'populated');
   await p.getByRole('button',{name:'Close Ask Cova',exact:true}).click();
   for(const width of [1536,390]){
    await p.setViewportSize({width,height:width===1536?1024:844});
    await p.getByRole('button',{name:'Edit note',exact:true}).click();
    check(width+' Edit preview preserves exact saved note',await p.getByRole('textbox',{name:'Journal note',exact:true}).inputValue()===note);
    check(width+' Edit preview retains attach action',await p.getByRole('button',{name:'Attach trade',exact:true}).isVisible());
    check(width+' Edit preview retains save action',await p.getByRole('button',{name:'Save note',exact:true}).isVisible());
    await p.locator('input[aria-label="Journal date"]:visible').fill('2026-10-28');
    const history=p.getByRole('button',{name:width===1536?'View journal':'Saved notes',exact:true});
    await history.click();
    const state=await p.locator('#journal-saved-notes').evaluate(el=>({visible:el.checkVisibility(),display:getComputedStyle(el).display,rows:el.querySelectorAll('[data-journal-saved-date]').length}));
    check(width+' opened saved history is visible and populated',state.visible&&state.rows===1,state);
    if(state.visible){
     await screenshot(s,'history-open-'+width,'.mini-journal');
     await p.locator('[data-journal-saved-date="2026-10-30"]').click();
     check(width+' history selection preserves exact saved note/date',await p.locator('.journal-preview-text').innerText()===note&&await p.locator('.journal-preview-date time').getAttribute('datetime')==='2026-10-30');
     check(width+' history closes after selection',await p.locator('#journal-saved-notes').count()===0);
     const focus=await p.getByRole('button',{name:'Edit note',exact:true}).evaluate(el=>({active:el===document.activeElement,visible:el.checkVisibility()}));
     check(width+' history selection restores visible preview focus',focus.active&&focus.visible,focus);
     await screenshot(s,'history-selected-'+width,'.mini-journal');
     // Selecting the current date must restore focus too, not only a changed date.
     await history.click();await p.locator('[data-journal-saved-date="2026-10-30"]').click();
     check(width+' same-date history selection restores visible focus',await p.getByRole('button',{name:'Edit note',exact:true}).evaluate(el=>el===document.activeElement&&el.checkVisibility()));
    } else {
     // Retain the desktop failure and recover only to exercise the mobile positive control.
     await history.click();await p.locator('input[aria-label="Journal date"]:visible').fill('2026-10-30');
    }
   }
   await p.setViewportSize({width:1536,height:1024});
   await chooseAccount(p,'Manual:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
   await p.waitForFunction(()=>!document.querySelector('.journal-note-preview')&&document.querySelector('textarea[aria-label="Journal note"]')?.value==='');
   check('History selection does not leak note across accounts',await p.locator('.journal-note-preview').count()===0&&await p.getByRole('textbox',{name:'Journal note',exact:true}).inputValue()==='');
  }finally{await finish(s);}
 }
}
