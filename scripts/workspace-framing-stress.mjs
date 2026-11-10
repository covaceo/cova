// Targeted interactions affected by a bounded outer canvas. No real network/write authority.
import path from 'node:path';
import {readFileSync} from 'node:fs';
// Readiness only: three identical frame samples, bounded by a real deadline.
// Collision/modality assertions run once afterwards; their thresholds are unchanged.
export async function waitForStableLayout(page,width,selectors=['.workspace-content','.workspace-sync-compact summary','.astra-header-controls']){
 return page.evaluate(({width,selectors})=>new Promise((resolve,reject)=>{
  let previous,stable=0,frameId;const started=performance.now();
  const timer=setTimeout(()=>{cancelAnimationFrame(frameId);reject(Error('Post-resize layout did not stabilize at '+width));},5000);
  const sample=()=>{
   const rects=selectors.map(selector=>{const el=document.querySelector(selector);return el?el.getBoundingClientRect().toJSON():null;});
   const current=JSON.stringify({width:innerWidth,rects});
   stable=innerWidth===width&&rects.every(Boolean)&&current===previous?stable+1:0;previous=current;
   if(stable>=2){clearTimeout(timer);resolve({width,rects,stableFrames:stable+1,elapsed:performance.now()-started});}
   else frameId=requestAnimationFrame(sample);
  };frameId=requestAnimationFrame(sample);
 }),{width,selectors});
}
export async function framingStress({open,finish,check,screenshot,report,out}){
 const s=await open({width:2560,scenario:'framing-stress'}),p=s.page;
 try{
  for(const width of [2560,1440,1280,851,850,768,390,360]){
   await p.setViewportSize({width,height:800});await p.evaluate(()=>scrollTo(0,0));
   report.measurements.push({readiness:'header',...await waitForStableLayout(p,width)});
   const trigger=p.getByRole('button',{name:'Trade account',exact:true});
   if(width>850){const bounds=await p.evaluate(()=>{const a=document.querySelector('.workspace-sync-compact summary').getBoundingClientRect(),b=document.querySelector('.astra-header-controls').getBoundingClientRect();return {width:innerWidth,sync:a.toJSON(),controls:b.toJSON(),overlap:Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)};});report.measurements.push(bounds);check(`${width} sync avoids header actions`,!bounds.overlap,bounds);await screenshot(s,'header-'+width);}
   await trigger.click();
   const menu=p.getByRole('menu');await menu.waitFor();
   check(`${width} account menu bounded and reachable`,await menu.evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight;}));
   await p.keyboard.press('Escape');await menu.waitFor({state:'hidden'});await p.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Trade account');check(`${width} account dropdown restores focus`,await trigger.evaluate(el=>el===document.activeElement));
  }
  await p.setViewportSize({width:1440,height:500});await p.getByRole('button',{name:'Ask Cova',exact:true}).click();
  const composer=p.getByRole('textbox',{name:'Message Cova',exact:true});await composer.scrollIntoViewIfNeeded();await composer.fill('Draft retained while the canvas resizes');
  check('Short desktop composer and send stay reachable',await composer.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+20,r.y+10);return r.y>=0&&r.bottom<=innerHeight&&(hit===el||el.contains(hit));}));await screenshot(s,'short-desktop-ask');
  for(const width of [1279,390,1280,2560,850,1440]){
   await composer.focus();await p.setViewportSize({width,height:800});
   report.measurements.push({readiness:'ask',...await waitForStableLayout(p,width,['#ask-cova-panel','.ask-cova-composer'])});
   check(`${width} Ask breakpoint draft and modality retained`,await composer.inputValue()==='Draft retained while the canvas resizes'&&await p.locator('#ask-cova-panel').getAttribute('aria-modal')===(width<1280?'true':null));
   const modal=await p.locator('#ask-cova-panel').evaluate(el=>({box:el.getBoundingClientRect().toJSON(),focus:el.contains(document.activeElement)}));
   check(`${width} Ask breakpoint remains bounded`,width<1280?modal.box.x===0&&modal.box.width===width&&modal.focus:modal.box.right<=width,modal);
  }
  await p.getByRole('button',{name:'Close Ask Cova',exact:true}).click();check('Resize/close leaves no blocking modal or scroll lock',await p.evaluate(()=>!document.querySelector('dialog:modal')&&getComputedStyle(document.documentElement).overflow!=='hidden'&&getComputedStyle(document.body).overflow!=='hidden'));
  for(const width of [1440,390]){
   await p.setViewportSize({width,height:900});await p.evaluate(()=>location.hash='#dashboard');await p.locator('.astra-dashboard').waitFor();await p.evaluate(()=>location.hash='#coach');await p.locator('[data-setup-row]').first().click();
   const note=p.locator('.ip-note blockquote');await note.waitFor();check(`${width} long synthetic note stays complete and wrapped`,(await note.innerText()).includes('Synthetic long review note')&&await note.evaluate(el=>el.scrollWidth<=el.clientWidth+1&&el.getBoundingClientRect().right<=innerWidth));await screenshot(s,`long-note-${width}`);
  }
  // Public rendering uses a separate signed-out context, not a redirected member screenshot.
  for(const width of [1440,390]){
   const images=[];
   for(const variant of ['baseline','enabled']){
    const context=await s.context.browser().newContext({viewport:{width,height:900},reducedMotion:'reduce',timezoneId:'UTC',locale:'en-US'});
    await context.addInitScript(()=>{window.__qaSession=null;});
    const origin=new URL(p.url()).origin;
    const id=`public-${variant}-${width}`;
    await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin){report.externalBlocked.push({id,url:url.href});return route.abort();}if(url.pathname.startsWith('/api/'))return route.fulfill({json:{accepted:false}});return route.continue({url:origin+(url.pathname.startsWith('/'+variant+'/')?url.pathname:'/'+variant+url.pathname)+url.search});});
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push({id,error:e.message}));
    await page.clock.install({time:new Date('2026-10-30T16:00:00.000Z')});await page.clock.pauseAt(new Date('2026-10-30T16:00:00.000Z'));await page.goto(origin+'/'+variant+'/#privacy');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500);
    check(`${variant} ${width} actual signed-out public privacy`,new URL(page.url()).hash==='#privacy'&&await page.locator('.workspace-content').count()===0&&/privacy/i.test(await page.locator('h1').innerText()));
    const file=`public-${variant}-${width}.png`;await page.screenshot({path:path.join(out,file),fullPage:true,style:'#qa-disclosure{visibility:hidden!important}'});report.screenshots.push(file);images.push(file);await context.close();
   }
   check(`${width} public privacy pixel identity`,readFileSync(path.join(out,images[0])).equals(readFileSync(path.join(out,images[1]))));
  }
 }finally{await finish(s);}
}
