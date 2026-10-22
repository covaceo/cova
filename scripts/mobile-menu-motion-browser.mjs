// Actual App, disposable SQL fixture, trusted touch input. No customer transport.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {workspaceBrowserOptions,workspaceEvidence} from './workspace-browser-support.mjs';
const out=path.resolve(process.env.MOBILE_MENU_OUT||workspaceEvidence('mobile-menu-motion'));
await mkdir(out,{recursive:true});
const scratch=path.join(out,'tmp');await mkdir(scratch,{recursive:true});
const origin='http://127.0.0.1:4409';
const child=spawn(process.execPath,['scripts/workspace-browser-fixture.mjs'],{env:{...process.env,COVA_WORKSPACE_FIXTURE_PORT:'4409',TMPDIR:scratch,TEMP:scratch,TMP:scratch},stdio:['ignore','pipe','pipe']});
let log='',browser;child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
const wait=ms=>new Promise(r=>setTimeout(r,ms)),records=[],failures=[],errors=[];
const check=(ok,message)=>{if(!ok)failures.push(message);};
async function setup(width,height,motion){
 const owner=crypto.randomUUID(),c=await browser.newContext({viewport:{width,height},isMobile:width<=850,hasTouch:true,reducedMotion:motion,...(process.env.MENU_VIDEO==='1'&&width===390&&height===844&&motion==='no-preference'?{recordVideo:{dir:path.join(out,'video'),size:{width,height}}}:{})});
 await c.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.fallback():r.abort());
 await c.route('**/api/**',r=>r.request().url().includes('/api/workspace')?r.fallback():r.request().url().includes('/api/auth/consent')?r.fulfill({json:{accepted:true}}):r.fulfill({status:404,json:{error:'Isolated fixture'}}));
 await c.addInitScript(owner=>{if(window.top!==window||location.origin==='null')return;window.__owner=owner;window.__qaSession={user:{id:owner,email:'menu-qa@example.invalid',app_metadata:{plan:'pro'}},access_token:'qa-'+owner};localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'qa-session',email:'menu-qa@example.invalid',signedInAt:new Date().toISOString()}));},owner);
 // Consent is seeded only in the disposable local SQL fixture; empty account mirrors the reported recording.
 assert.equal((await c.request.post(origin+'/api/workspace',{headers:{Authorization:'Bearer qa-'+owner},data:{owner,action:'consent',disclosure:'workspace-cloud-v1'}})).status(),200);
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400&&r.url().startsWith(origin+'/')&&/\.(?:css|js|mjs|png|webp|woff2|svg)(?:\?|$)/.test(r.url()))errors.push('Essential asset '+r.status()+' '+r.url());});
 await p.goto(origin+'/#dashboard',{waitUntil:'domcontentloaded'});await p.locator('.astra-dashboard').waitFor({timeout:25000});await p.locator('[data-toast-kind="sign-in"]').waitFor({state:'hidden',timeout:10000});await p.evaluate(()=>document.fonts.ready);
 await p.waitForFunction(()=>getComputedStyle(document.querySelector('.workspace-top-header')).opacity==='1');
 return {p,c,owner};
}
async function measure(p){return p.evaluate(()=>{const h=document.querySelector('.workspace-top-header'),m=document.querySelector('#operator-mobile-menu'),title=document.querySelector('.astra-title h1'),s=m&&getComputedStyle(m);return {width:innerWidth,visibleWidth:visualViewport.width,overflow:document.documentElement.scrollWidth-innerWidth,header:JSON.parse(JSON.stringify(h.getBoundingClientRect())),titleTop:title?.getBoundingClientRect().top,menu:m?{rect:JSON.parse(JSON.stringify(m.getBoundingClientRect())),opacity:+s.opacity,transition:s.transitionProperty,position:s.position,transform:s.transform,radius:s.borderRadius,background:s.backgroundColor,scrollHeight:m.scrollHeight,clientHeight:m.clientHeight}:null};});}
async function tap(p){const b=await p.getByRole('button',{name:'Toggle menu',exact:true}).boundingBox();await p.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}
async function trace(p,label,action){
 await p.evaluate(()=>{window.__menuFrames=[];window.__menuSampling=true;const sample=()=>{if(!window.__menuSampling)return;const h=document.querySelector('.workspace-top-header'),m=document.querySelector('#operator-mobile-menu'),title=document.querySelector('.astra-title h1');window.__menuFrames.push({time:performance.now(),headerBottom:h.getBoundingClientRect().bottom,titleTop:title?.getBoundingClientRect().top,menu:m?{opacity:+getComputedStyle(m).opacity,transform:getComputedStyle(m).transform,top:m.getBoundingClientRect().top}:null});requestAnimationFrame(sample);};sample();});
 await action();await p.waitForTimeout(350);
 return {label,frames:await p.evaluate(()=>{window.__menuSampling=false;return window.__menuFrames;})};
}
try{
 for(let i=0;i<500&&!log.includes('LOCAL_WORKSPACE_FIXTURE')&&child.exitCode===null;i++)await wait(100);assert(log.includes(origin+'/__workspace'),log);
 for(const[name,engine,opts]of [['chromium',chromium,workspaceBrowserOptions],['webkit',webkit,{}]]){
  browser=await engine.launch({...opts,headless:true});
  const cases=process.env.MENU_QUICK==='1'?[[390,844,'no-preference']]:[[320,568,'no-preference'],[390,844,'no-preference'],[430,932,'no-preference'],[850,650,'no-preference'],[390,400,'no-preference'],[390,844,'reduce'],[851,844,'reduce'],[1440,900,'reduce']];
  for(const[width,height,motion]of cases){
   const {p,c,owner}=await setup(width,height,motion),id=`${name}-${width}-${height}-${motion}`,base=await measure(p),initialTrades=await p.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)||'{}').trades,owner);
   await p.screenshot({path:path.join(out,id+'-closed.png')});
   if(width>850){check(await p.locator('.workspace-top-header').isHidden(),id+' desktop header stays hidden');records.push({id,base,desktop:true});await c.close();continue;}
   check(base.width===width&&Math.abs(base.visibleWidth-width)<1&&base.overflow<=1,id+' true mobile viewport');
   const traces=[];traces.push(await trace(p,'open',()=>tap(p)));const open=await measure(p);
   await p.screenshot({path:path.join(out,id+'-open.png')});
   check(open.menu?.opacity===1,id+' settled open opacity');
   check(open.menu?.transform==='none',id+' motion fully settled without a trailing CSS scale');
   check(open.menu?.rect.left>=15&&open.menu.rect.right<=width-15,id+' side gutters');
   check(open.menu?.rect.top>=base.header.bottom,id+' menu clears header');
   check(open.menu?.rect.bottom<=height-10,id+' short-height menu fits');
   check(!open.menu?.transition.split(',').some(x=>['all','transform','opacity'].includes(x.trim())),id+' Motion has exclusive transform/opacity ownership: '+open.menu?.transition);
   const actions=p.locator('#operator-mobile-menu .operator-mobile-account-actions');await actions.getByRole('button',{name:'Sign out',exact:true}).scrollIntoViewIfNeeded();const signoutBox=await actions.getByRole('button',{name:'Sign out',exact:true}).boundingBox();check(signoutBox&&signoutBox.y>=base.header.bottom&&signoutBox.y+signoutBox.height<=height-10,id+' sign out scrolls fully into view');
   await p.locator('#operator-mobile-menu').evaluate(e=>e.scrollTop=0);
   traces.push(await trace(p,'close',()=>tap(p)));await p.locator('#operator-mobile-menu').waitFor({state:'detached'});
   traces.push(await trace(p,'interrupted',async()=>{await tap(p);await p.waitForTimeout(45);await tap(p);await p.waitForTimeout(45);await tap(p);}));
   check(await p.getByRole('button',{name:'Toggle menu',exact:true}).getAttribute('aria-expanded')==='true',id+' rapid final intent remains open');
   check(await p.locator('#operator-mobile-menu').count()===1,id+' only one menu after reversal');
   for(const t of traces){check(t.frames.every(f=>Math.abs(f.headerBottom-base.header.bottom)<=1),id+' '+t.label+' header must not grow an opaque block behind fading menu');check(t.frames.every(f=>Math.abs(f.titleTop-base.titleTop)<=1),id+' '+t.label+' content stays still');}
   if(motion==='no-preference')check(traces.some(t=>t.frames.some(f=>f.menu&&f.menu.opacity>0&&f.menu.opacity<1)),id+' normal motion actually exercised');
   await p.locator('#operator-mobile-menu').getByRole('button',{name:'Limits',exact:true}).tap();await p.waitForURL('**/#rules');await p.locator('#operator-mobile-menu').waitFor({state:'detached'});check(await p.getByRole('button',{name:'Toggle menu',exact:true}).getAttribute('aria-expanded')==='false',id+' route closes menu');
   await tap(p);await p.locator('#operator-mobile-menu').getByRole('button',{name:'Risk Desk',exact:true}).tap();await p.waitForURL('**/#dashboard');await p.locator('#operator-mobile-menu').waitFor({state:'detached'});await p.locator('.astra-dashboard').waitFor();
   assert.deepEqual(await p.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)||'{}').trades,owner),initialTrades,'Navigation does not mutate account records');
   if(width===390&&height===844){
    await p.evaluate(()=>window.scrollTo({top:200,behavior:'instant'}));await p.waitForTimeout(120);const scrolled=await measure(p);const scrollTrace=await trace(p,'scrolled-open',()=>tap(p));check(scrollTrace.frames.every(f=>Math.abs(f.headerBottom-scrolled.header.bottom)<=1),id+' scrolled header stable');
    await p.locator('#operator-mobile-menu').getByRole('button',{name:'Profile menu',exact:true}).tap();await p.getByRole('menuitem',{name:'Settings',exact:true}).tap();await p.getByRole('dialog',{name:'Settings',exact:true}).waitFor();await p.getByRole('button',{name:'Close settings',exact:true}).click();await p.getByRole('dialog',{name:'Settings',exact:true}).waitFor({state:'hidden'});await tap(p);await p.locator('#operator-mobile-menu').waitFor({state:'detached'});
   }
   records.push({id,base,open,traces,routeNavigation:true,recordsUnchanged:true});await writeFile(path.join(out,id+'.json'),JSON.stringify(records.at(-1),null,2));const video=p.video();await c.close();if(video)await video.saveAs(path.join(out,id+'.webm'));
  }
  await browser.close();browser=null;
 }
 check(errors.length===0,'No runtime or essential asset errors: '+errors.join(';'));await writeFile(path.join(out,'results.json'),JSON.stringify({passed:failures.length===0,records,failures,errors,nativeDevice:false},null,2));console.log(JSON.stringify({records:records.length,failures,errors},null,2));assert.deepEqual(failures,[]);
}finally{await browser?.close();child.kill();for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await wait(50);await writeFile(path.join(out,'fixture.log'),log);}
