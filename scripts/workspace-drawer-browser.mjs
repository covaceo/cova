// Run through the isolated real-App harness: npm run test:workspace-drawer.
import {readFileSync} from 'node:fs';
import path from 'node:path';
const menu='.workspace-menu-dialog';
const geometry=page=>page.evaluate(()=>Object.fromEntries(['.astra-dashboard','.astra-reference-header','.astra-stats-panel','.astra-chart-panel','.astra-recent-trades','.mini-journal'].map(selector=>{const el=document.querySelector(selector),c=getComputedStyle(el);return [selector,{box:el.getBoundingClientRect().toJSON(),font:c.font,background:c.background,border:c.border,padding:c.padding}];})));
const settled=page=>page.waitForFunction(()=>!document.querySelector('.workspace-menu-dialog').getAnimations().some(a=>a.playState==='running'||a.playState==='pending'),{},{timeout:3000});
async function trace(page,action){
 await page.evaluate(()=>{window.__drawerFrames=[];window.__drawerRecording=true;const start=performance.now();function frame(){const el=document.querySelector('.workspace-menu-dialog'),r=el.getBoundingClientRect(),c=getComputedStyle(el);window.__drawerFrames.push({t:performance.now()-start,x:r.x,y:r.y,width:r.width,height:r.height,transform:c.transform,display:c.display,open:el.open,modal:el.matches(':modal'),animations:el.getAnimations().map(a=>({property:a.transitionProperty,duration:a.effect.getTiming().duration,time:a.currentTime}))});if(window.__drawerRecording)requestAnimationFrame(frame);}requestAnimationFrame(frame);});
 await action();await settled(page);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 return page.evaluate(()=>{window.__drawerRecording=false;return window.__drawerFrames;});
}
export async function runDrawerChecks({open,finish,check,screenshot,report,out}){
 for(const width of [1536,1440,1280,768,390]){
  let s;try{
   // HEAD assets are rebuilt with HEAD shell AND CSS, same auth/data/clock/flags.
   const baseline=await open({variant:'baseline',width,scenario:'drawer'});
   const beforeGeometry=await geometry(baseline.page);const before=await screenshot(baseline,'closed');await finish(baseline);
   s=await open({width,scenario:'drawer'});const p=s.page,trigger=p.getByRole('button',{name:'Open workspace menu',exact:true});
   const after=await screenshot(s,'closed');check(s.id+' closed dashboard byte-identical to HEAD',readFileSync(path.join(out,before.replace('.png','-viewport.png'))).equals(readFileSync(path.join(out,after.replace('.png','-viewport.png')))));
   check(s.id+' closed dashboard geometry and styles identical',JSON.stringify(beforeGeometry)===JSON.stringify(await geometry(p)));
   if(width<851)continue; // Existing mobile navigation is a separate, unchanged surface.
   await p.emulateMedia({reducedMotion:'no-preference'});
   const opening=await trace(p,()=>trigger.click());report.measurements.push({id:s.id,label:'opening-motion',frames:opening});
   const r=await p.locator(menu).boundingBox();
   check(s.id+' drawer flush left top and full viewport height',r.x===0&&r.y===0&&r.height===1000,r);
   check(s.id+' opening travels horizontally from left',opening.some(f=>f.x< -5&&f.width>0&&f.animations.some(a=>a.property==='transform'))&&opening.at(-1).x===0,opening);
   await screenshot(s,'navigation');
   const closing=await trace(p,()=>p.getByRole('button',{name:'Close workspace menu',exact:true}).click());report.measurements.push({id:s.id,label:'closing-motion',frames:closing});
   check(s.id+' closing travels horizontally left before hiding',closing.some(f=>f.x< -5&&f.width>0&&f.animations.some(a=>a.property==='transform'))&&closing.at(-1).display==='none',closing);
   check(s.id+' closed dialog releases native modality focus and hit testing',await p.evaluate(()=>{const d=document.querySelector('.workspace-menu-dialog'),t=document.querySelector('.workspace-menu-trigger'),r=t.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !d.open&&!d.matches(':modal')&&document.activeElement===t&&(hit===t||t.contains(hit))&&getComputedStyle(document.body).overflow!=='hidden';}));
   if(width===1440){
    const close=p.getByRole('button',{name:'Close workspace menu',exact:true});
    // Pause an actual browser transition mid-flight, not an injected CSS/mock animation.
    const armPause=()=>p.evaluate(()=>{window.__drawerPaused=false;const start=performance.now();function frame(){const d=document.querySelector('.workspace-menu-dialog'),a=d.getAnimations().find(a=>a.transitionProperty==='transform');if(a&&a.currentTime>30){d.getAnimations().forEach(a=>a.pause());window.__drawerPaused=true;}else if(performance.now()-start<2000)requestAnimationFrame(frame);}requestAnimationFrame(frame);});
    for(const direction of ['opening','closing']){
     await armPause();await (direction==='opening'?trigger:close).click();
     await p.waitForFunction(()=>window.__drawerPaused,{},{timeout:3000});
     const state=await p.locator(menu).evaluate(d=>({x:d.getBoundingClientRect().x,width:d.getBoundingClientRect().width,inert:d.inert,modal:d.matches(':modal'),pointer:getComputedStyle(d).pointerEvents,animations:d.getAnimations().map(a=>({property:a.transitionProperty,time:a.currentTime,duration:a.effect.getTiming().duration,keyframes:a.effect.getKeyframes()}))}));
     check(direction+' midflight bounds are partially offscreen',state.x<0&&state.x> -state.width,state);
     const name='drawer-'+direction+'-midflight.png';await p.screenshot({path:path.join(out,name),style:'#qa-disclosure{visibility:hidden!important}'});report.screenshots.push(name);
     if(direction==='closing'){
      check('exit is paint-only immediately, not a hidden modal',state.inert&&!state.modal&&state.pointer==='none',state);
      await p.keyboard.press('Tab');check('exit controls are absent from Tab order',await p.evaluate(()=>!document.activeElement.closest('.workspace-menu-dialog')));
     }
     await p.locator(menu).evaluate(d=>d.getAnimations().forEach(a=>a.play()));await settled(p);
    }
    // Reopen before the exit finishes; no timer can close the new modal later.
    await trigger.click();await settled(p);await armPause();await close.click();await p.waitForFunction(()=>window.__drawerPaused);
    await trigger.click();await settled(p);check('rapid close/reopen retains new modal and active controls',await p.locator(menu).evaluate(d=>d.open&&d.matches(':modal')&&!d.inert&&d.getBoundingClientRect().x===0));
    await p.mouse.click(700,300);await settled(p);check('backdrop dismisses and releases page',await p.locator(menu).evaluate(d=>!d.open&&!d.matches(':modal')));
    for(const shortcut of ['Control+k','Meta+k']){
     await armPause();await trigger.click();await p.waitForFunction(()=>window.__drawerPaused);
     await p.keyboard.press(shortcut);await p.locator('.workspace-search-dialog[open]').waitFor();
     check(shortcut+' search handoff during entrance leaves one active modal',await p.locator('dialog:modal').count()===1&&await p.locator('.workspace-search-dialog').evaluate(d=>d.contains(document.activeElement)));
     await p.locator(menu).evaluate(d=>d.getAnimations().forEach(a=>a.play()));await settled(p);await p.keyboard.press('Escape');
     await p.waitForFunction(()=>document.activeElement===document.querySelector('.workspace-menu-trigger'));
    }
    for(const name of ['Settings','Edit profile'])for(const shortcut of ['Control+k','Meta+k']){
     await trigger.click();await settled(p);await p.getByRole('button',{name:'Profile menu',exact:true}).click();await p.getByRole('menuitem',{name,exact:true}).click();
     const child=p.getByRole('dialog',{name,exact:true});await child.waitFor();
     for(const w of [1280,1279,851,850,851,1440]){
      // Start each resize from a known child control; cycling beyond the last
      // native-dialog tab stop legitimately focuses browser chrome (BODY).
      await child.locator('.cova-profile-dialog-head button').focus();
      await p.setViewportSize({width:w,height:1000});await p.keyboard.press(shortcut);await p.keyboard.press('Tab');
      const state=await child.evaluate(d=>{const b=d.querySelector('button'),r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {modalCount:document.querySelectorAll('dialog:modal').length,visible:d.checkVisibility(),focus:d.contains(document.activeElement),active:document.activeElement.outerHTML.slice(0,240),box:r.toJSON(),hit:hit?.outerHTML.slice(0,240),closeHit:hit===b||b.contains(hit),search:!!document.querySelector('.workspace-search-dialog[open]')};});
      check(name+' '+shortcut+' nested ownership at '+w,state.modalCount===2&&state.visible&&state.focus&&state.closeHit&&!state.search,state);
     }
     await p.keyboard.press('Escape');await child.waitFor({state:'detached'});check(name+' Escape retains parent',await p.locator(menu).evaluate(d=>d.open&&d.matches(':modal')));await p.keyboard.press('Escape');await settled(p);
    }
    for(const w of [1280,1279,851]){await trigger.click();await settled(p);await p.setViewportSize({width:w,height:1000});check('drawer remains open above mobile breakpoint '+w,await p.locator(menu).evaluate(d=>d.open));await p.keyboard.press('Escape');await settled(p);}
    await trigger.click();await settled(p);await p.setViewportSize({width:850,height:1000});await settled(p);
    check('850 breakpoint releases modal and focuses mobile trigger',await p.evaluate(()=>!document.querySelector('dialog:modal')&&document.activeElement===document.querySelector('.workspace-top-header .operator-mobile-menu-toggle')&&getComputedStyle(document.body).overflow!=='hidden'));
    await p.setViewportSize({width:1440,height:480});await trigger.click();await settled(p);
    for(const name of ['Accounts','Risk Desk','Insights','Limits','Passport','Profile menu']){
     const b=p.locator(menu).getByRole('button',{name,exact:true});await b.scrollIntoViewIfNeeded();check('480px short drawer '+name+' reachable',await b.evaluate(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&(hit===b||b.contains(hit));}));
    }
    await screenshot(s,'short-navigation');await p.screenshot({path:path.join(out,'drawer-short-480-viewport.png'),style:'#qa-disclosure{visibility:hidden!important}'});report.screenshots.push('drawer-short-480-viewport.png');await p.getByRole('button',{name:'Profile menu',exact:true}).click();
    for(const name of ['Edit profile','Settings']){const item=p.getByRole('menuitem',{name,exact:true});await item.scrollIntoViewIfNeeded();check('short profile '+name+' reachable',await item.evaluate(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&(hit===b||b.contains(hit));}));}
    await p.getByRole('button',{name:'Profile menu',exact:true}).click();await close.click();await settled(p);
    await p.setViewportSize({width:1440,height:1000});await p.emulateMedia({reducedMotion:'reduce'});
    const reducedOpen=await trace(p,()=>trigger.click()),reducedClose=await trace(p,()=>close.click());
    check('reduced motion has no horizontal travel or active transition',[...reducedOpen,...reducedClose].every(f=>!f.animations.length&&(f.width===0||f.x===0)),{opening:reducedOpen,closing:reducedClose});
   }
  }catch(error){check('drawer '+width+' completed',false,String(error));}
  finally{if(s)await finish(s);}
 }
}
