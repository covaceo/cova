import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {workspaceBrowserOptions,workspaceEvidence} from './workspace-browser-support.mjs';
const out=path.resolve(process.env.MANUAL_FIT_OUT||workspaceEvidence('manual-trade-fit')),origin='http://127.0.0.1:4412';
await mkdir(out,{recursive:true});const scratch=path.join(out,'tmp');await mkdir(scratch,{recursive:true});
const child=spawn(process.execPath,['scripts/workspace-browser-fixture.mjs'],{env:{...process.env,COVA_WORKSPACE_FIXTURE_PORT:'4412',TMPDIR:scratch,TEMP:scratch,TMP:scratch},stdio:['ignore','pipe','pipe']});
let log='',browser;child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
const wait=ms=>new Promise(r=>setTimeout(r,ms)),records=[],failures=[],errors=[];
const original={id:'manual-fit-original',date:'2026-10-01',market:'ES',side:'Long',contracts:1,entry:100,exit:101,pnl:25,risk:0,riskStatus:'missing',setup:'',notes:'Original retained note',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}};
async function geometry(p,id){
 const result=await p.locator('.manual-trade-dialog').evaluate(d=>{
  const box=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height}};
  const fields=[...d.querySelectorAll('.manual-trade-fields input,.manual-trade-fields select')].map(e=>({name:e.name,box:box(e),label:box(e.parentElement),font:getComputedStyle(e).fontSize,appearance:getComputedStyle(e).appearance,width:getComputedStyle(e).width,minWidth:getComputedStyle(e).minWidth,maxWidth:getComputedStyle(e).maxWidth,boxSizing:getComputedStyle(e).boxSizing,paddingTop:getComputedStyle(e).paddingTop,tag:e.tagName}));
  return{fields,dialog:box(d),overflow:d.scrollWidth-d.clientWidth,viewport:innerWidth};
 });
 records.push({id,...result});
 for(const f of result.fields){if(f.box.x<f.label.x-.5||f.box.right>f.label.right+.5)failures.push(id+' '+f.name+' escapes field');}
 for(let i=0;i<result.fields.length;i++)for(let j=i+1;j<result.fields.length;j++){
  const a=result.fields[i],b=result.fields[j];if(Math.min(a.box.right,b.box.right)-Math.max(a.box.x,b.box.x)>.5&&Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.y,b.box.y)>.5)failures.push(id+' '+a.name+' overlaps '+b.name);
 }
 if(result.viewport<=850){
  const date=result.fields.find(f=>f.name==='date');
  if(date.appearance!=='none'||date.boxSizing!=='border-box'||date.maxWidth==='none')failures.push(id+' date must opt out of iOS native theme sizing and stay bounded');
  for(let i=0;i<result.fields.length;i+=2){const a=result.fields[i],b=result.fields[i+1];if(result.viewport<375){if(a.box.bottom+12>b.label.y||Math.abs(a.box.width-b.box.width)>.5)failures.push(id+' narrow fields must stack clearly');}else if(Math.abs(a.box.height-b.box.height)>.5||Math.abs(a.box.y-b.box.y)>.5)failures.push(id+' '+a.name+'/'+b.name+' inconsistent row');}
  for(const f of result.fields)if(f.tag==='SELECT'&&parseFloat(f.paddingTop)>0)failures.push(id+' native select text must not be clipped by vertical padding');
  for(const f of result.fields)if(f.box.height<44||parseFloat(f.font)<16)failures.push(id+' '+f.name+' mobile control too small');
 }
 if(result.overflow>1)failures.push(id+' dialog overflow');
}
try{
 for(let n=0;n<400&&!log.includes('LOCAL_WORKSPACE_FIXTURE')&&child.exitCode===null&&child.signalCode===null;n++)await wait(100);assert(log.includes(origin+'/__workspace'),log);
 for(const[name,engine,opts]of [['chromium',chromium,workspaceBrowserOptions],['webkit',webkit,{}]]){
  browser=await engine.launch({...opts,headless:true});
  const sizes=process.env.MANUAL_FIT_QUICK==='1'?[[390,844]]:[[320,568],[375,812],[390,844],[430,932],[768,900],[850,900],[851,900],[1440,900],[390,400]];
  for(const[width,height]of sizes){
   const id=`${name}-${width}x${height}`,owner=crypto.randomUUID(),c=await browser.newContext({viewport:{width,height},isMobile:width<=850,hasTouch:width<=850,reducedMotion:'reduce'});let writes=0;
   await c.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.fallback():r.abort());
   await c.route('**/api/**',r=>r.request().url().includes('/api/workspace')?r.fallback():r.request().url().includes('/api/auth/consent')?r.fulfill({json:{accepted:true}}):r.fulfill({status:404,json:{error:'Isolated fixture'}}));
   await c.addInitScript(({owner,original})=>{if(window.top!==window||location.origin==='null')return;window.__owner=owner;window.__qaSession={user:{id:owner,email:'manual-fit@example.invalid',app_metadata:{plan:'pro'}},access_token:'qa-'+owner};localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'qa-session',email:'manual-fit@example.invalid',signedInAt:new Date().toISOString()}));localStorage.setItem('cova-workspace-mode-v2:'+owner,'local');if(!localStorage.getItem('cova-react-risk-os-v2:'+owner)){localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades:[original],rules:[],tradeAccount:'local'}));localStorage.setItem('cova-workspace-aux-v1:'+owner,JSON.stringify({version:1,names:{local:'QA trading account'},notes:{},cash:{}}));}}, {owner,original});
   const p=await c.newPage();p.on('pageerror',e=>errors.push(id+': '+e.message));p.on('request',r=>{if(r.url().includes('/api/workspace')&&r.method()==='POST')writes++});p.on('response',r=>{if(r.status()>=400&&r.url().startsWith(origin+'/')&&['script','stylesheet'].includes(r.request().resourceType()))errors.push(id+': '+r.status()+' '+r.url());});
   await p.goto(origin+'/#dashboard');await p.locator('.astra-dashboard').waitFor({timeout:25000});await p.locator('[data-toast-kind="sign-in"]').waitFor({state:'hidden',timeout:12000});await p.getByRole('button',{name:'Add trade',exact:true}).click();
   const d=p.getByRole('dialog',{name:'Add trade',exact:true});await d.waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(250);await geometry(p,id+'-empty');await writeFile(path.join(out,id+'-form.html'),await d.evaluate(e=>e.outerHTML));await p.screenshot({path:path.join(out,id+'-empty.png')});
   for(const[k,v]of Object.entries({date:'2026-10-06',market:'MNQ',contracts:'1',entry:'20000',exit:'20005',pnl:'10',risk:'5'}))await d.locator(`[name="${k}"]`).fill(v);
   await geometry(p,id+'-filled');await d.locator('summary').click();await d.locator('[name="setup"]').fill('QA setup');await d.locator('[name="notes"]').fill('Synthetic layout verification');
   await d.getByRole('button',{name:'Save trade',exact:true}).click();await d.waitFor({state:'detached'});await p.reload();await p.locator('.astra-dashboard').waitFor();
   const trades=await p.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)).trades,owner);assert.equal(trades.length,2);assert.deepEqual(trades.find(t=>t.id===original.id),original);const added=trades.find(t=>t.id!==original.id);assert.equal(added.date,'2026-10-06');assert.equal(added.market,'MNQ');assert.equal(added.pnl,10);assert.equal(added.risk,5);assert.equal(added.notes,'Synthetic layout verification');assert.equal(added.manual.accountKey,'local');assert.equal(writes,0,'Browser-only saves never enable cloud');
   await p.getByRole('button',{name:'Add trade',exact:true}).click();await d.waitFor();await d.locator('[name="market"]').fill('CANCEL');await d.getByRole('button',{name:'Close Add trade',exact:true}).click();await d.waitFor({state:'detached'});assert.equal(await p.evaluate(()=>document.body.style.overflow),'');assert.equal(await p.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)).trades.length,owner),2);await c.close();
  }await browser.close();browser=null;
 }
 await writeFile(path.join(out,'results.json'),JSON.stringify({records,failures,errors,nativeDevice:false},null,2));console.log(JSON.stringify({records:records.length,failures,errors},null,2));assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
}finally{await browser?.close();child.kill();for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await wait(50);await writeFile(path.join(out,'fixture.log'),log);}
