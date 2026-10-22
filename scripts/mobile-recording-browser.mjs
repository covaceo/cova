// Actual App, isolated synthetic account. No customer network or credentials.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {workspaceBrowserOptions,workspaceEvidence} from './workspace-browser-support.mjs';
const out=path.resolve(process.env.RECORDING_OUT||workspaceEvidence('mobile-recording'));
await mkdir(out,{recursive:true});const scratch=path.join(out,'tmp');await mkdir(scratch,{recursive:true});
const origin='http://127.0.0.1:4410';
const child=spawn(process.execPath,['scripts/workspace-browser-fixture.mjs'],{env:{...process.env,COVA_WORKSPACE_FIXTURE_PORT:'4410',TMPDIR:scratch,TEMP:scratch,TMP:scratch},stdio:['ignore','pipe','pipe']});
let log='',browser;child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
const wait=ms=>new Promise(r=>setTimeout(r,ms)),records=[],failures=[],errors=[];
const check=(ok,message)=>{if(!ok)failures.push(message);};
async function shot(p,id){await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(400);await p.screenshot({path:path.join(out,id+'.png'),fullPage:true});}
try{
 for(let i=0;i<500&&!log.includes('LOCAL_WORKSPACE_FIXTURE')&&child.exitCode===null;i++)await wait(100);assert(log.includes(origin+'/__workspace'),log);
 for(const[name,engine,opts]of [['chromium',chromium,workspaceBrowserOptions],['webkit',webkit,{}]]){
  if(process.env.RECORDING_QUICK==='1'&&name!=='chromium')continue;
  browser=await engine.launch({...opts,headless:true});
  for(const width of process.env.RECORDING_QUICK==='1'?[390]:[320,390,430,767,850,851,1440]){
   const owner=crypto.randomUUID(),id=`${name}-${width}`,c=await browser.newContext({viewport:{width,height:844},isMobile:width<=850,hasTouch:true,reducedMotion:'reduce'});
   await c.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.fallback():r.abort());
   await c.route('**/api/**',r=>r.request().url().includes('/api/workspace')?r.fallback():r.request().url().includes('/api/auth/consent')?r.fulfill({json:{accepted:true}}):r.fulfill({status:404,json:{error:'Isolated fixture'}}));
   await c.addInitScript(owner=>{if(window.top!==window||location.origin==='null')return;window.__owner=owner;window.__qaSession={user:{id:owner,email:'review-qa@example.invalid',app_metadata:{plan:'pro'}},access_token:'qa-'+owner};localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'qa-session',email:'review-qa@example.invalid',signedInAt:new Date().toISOString()}));},owner);
   assert.equal((await c.request.post(origin+'/api/workspace',{headers:{Authorization:'Bearer qa-'+owner},data:{owner,action:'consent',disclosure:'workspace-cloud-v1'}})).status(),200);
   const p=await c.newPage();p.on('pageerror',e=>errors.push(id+': '+e.message));
   await p.goto(origin+'/#dashboard');await p.locator('.astra-dashboard').waitFor({timeout:25000});await p.locator('[data-toast-kind="sign-in"]').waitFor({state:'hidden',timeout:10000});
   const initial=await p.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)||'{}').trades,owner);
   for(const [route,selector]of [['coach','.oa-insights'],['rules','.oa-limits']]){
    await p.evaluate(route=>location.hash=route,route);await p.locator(selector).waitFor();await shot(p,id+'-'+route);
    const state=await p.locator(selector).evaluate(e=>({text:e.innerText,warnings:e.querySelectorAll('[data-warning="true"],[data-rule-state="breach"]').length,overflow:document.documentElement.scrollWidth-innerWidth,width:innerWidth}));
    check(state.width===width&&state.overflow<=1,id+' '+route+' viewport');
    check(state.warnings===0,id+' '+route+' empty account must not claim a breach');
    check(!/warning in your history|warnings in your history|Current review status:|Breach in history|Inside limit/.test(state.text),id+' '+route+' no fabricated historical review');
    if(route==='coach'&&width<=850){const style=await p.locator('.oa-review-primary').evaluate(e=>{const s=getComputedStyle(e);return {radius:s.borderRadius,font:s.fontSize,height:e.getBoundingClientRect().height};});check(style.radius==='12px'&&parseFloat(style.font)>=14&&style.height>=44,id+' matched mobile action');}
    records.push({id,route,...state});
   }
   {
    await p.evaluate(()=>location.hash='coach');await p.locator('.oa-insight-empty').waitFor();await p.getByRole('button',{name:'Import trades',exact:true}).click();await p.waitForURL('**/#import');
    check(await p.locator('.oa-insight-empty').count()===0,id+' empty action navigates to import');
   }
   assert.deepEqual(await p.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)||'{}').trades,owner),initial,'UI review preserves records');
   if(process.env.RECORDING_PUBLIC!=='0'){
    await p.evaluate(()=>location.hash='features');await p.locator('.features-system-tab').first().waitFor();await shot(p,id+'-features');
    const tabs=await p.locator('.features-system-tab strong').evaluateAll(es=>es.map(e=>({label:e.textContent,width:e.clientWidth,scroll:e.scrollWidth,font:parseFloat(getComputedStyle(e).fontSize)})));
    if(width<=767)check(tabs.every(t=>t.scroll<=t.width+1&&t.font>=14),id+' full readable feature labels '+JSON.stringify(tabs));
    for(let n=0;n<tabs.length;n++){const tab=p.locator('.features-system-tab').nth(n);await tab.click();check(await tab.getAttribute('aria-selected')==='true',id+' tab '+n+' selects');}
    await p.locator('.features-system-tab').first().focus();await p.keyboard.press('End');check(await p.locator('.features-system-tab').last().getAttribute('aria-selected')==='true',id+' keyboard tab End');
    await p.evaluate(()=>location.hash='resources');await p.locator('.resources-oa-utility').waitFor();await shot(p,id+'-resources');
    const utility=await p.locator('.resources-oa-utility>div>span').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return {font:s.fontFamily,transform:s.textTransform};}));
    if(width<=767)check(utility.every(s=>!/mono/i.test(s.font)&&s.transform==='none'),id+' resources normal readable type');
    for(let n=0;n<5;n++){const toggle=p.locator('.resources-guide-toggle').nth(n);if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();check(await toggle.getAttribute('aria-expanded')==='true',id+' resource step '+n);}
    records.push({id,route:'public',tabs,utility});
   }
   await c.close();
  }
  await browser.close();browser=null;
 }
 check(!errors.length,'No runtime errors: '+errors.join(';'));await writeFile(path.join(out,'results.json'),JSON.stringify({passed:!failures.length,records,failures,errors,nativeDevice:false},null,2));console.log(JSON.stringify({records:records.length,failures,errors},null,2));assert.deepEqual(failures,[]);
}finally{await browser?.close();child.kill();for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await wait(50);await writeFile(path.join(out,'fixture.log'),log);}
