// Full real App/canonical CSS. Synthetic auth/capability/cloud only; outbound traffic blocked.
import assert from 'node:assert/strict';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import load from './helpers/load-ts.cjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const out=path.resolve(process.env.ASK_COVA_TEST_OUT || path.resolve(root,'../ask-cova-beta-evidence/client/browser'));mkdirSync(out,{recursive:true});
const phase=process.env.ASK_COVA_TEST_PHASE==='red'?'red':'green';
const rates=process.env.ASK_COVA_TEST_CPU ? [Number(process.env.ASK_COVA_TEST_CPU)] : [1,6];
assert(rates.every(rate=>rate===1||rate===6),'only ordinary/6x CPU scheduling');
const {defaultRules}=load('src/lib/risk.ts');
const syntheticTrades=[{id:'manual-beta-synthetic',date:'2026-10-30',market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl:125,risk:100,riskStatus:'provided',setup:'Synthetic review',notes:'Synthetic only',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}}];
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const report={fixture:'Synthetic full App, canonical CSS, production Vite build; no customer/provider/backend calls',checks:[],failures:[],external:[],errors:[],requests:[],hashes:{},screenshots:[],observations:[]};
const save=()=>writeFileSync(path.join(out,phase+'-results.json'),JSON.stringify(report,null,2));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
report.harnessHash=hash(fileURLToPath(import.meta.url));report.cpuRates=rates;
const plugin={name:'beta-auth-isolation',enforce:'pre',load(id){
 const clean=id.split('?')[0],rel=path.relative(root,clean).replaceAll('\\','/');
 if(rel.startsWith('src/')&&existsSync(clean))report.hashes[rel]=hash(clean);
 if(rel==='src/lib/supabaseClient.ts')return readFileSync(clean,'utf8').replace('export function getSupabaseClient() {','function unusedRealSupabaseClient() {').replace('export function getSupabaseAuthSessionId(accessToken: string)','function unusedRealSessionId(accessToken: string)')+`
 export const getSupabaseAuthSessionId=(token)=>token;
 export const getSupabaseClient=()=>({auth:{getSession:async()=>({data:{session:window.__qaSession}}),onAuthStateChange:(callback)=>{window.__qaListeners.add(callback);return {data:{subscription:{unsubscribe(){window.__qaListeners.delete(callback)}}}}},signOut:async()=>({error:null})}});`;
 if(rel==='src/lib/profileRepository.ts')return `export const createProfileRepository=()=>({load:async(user_id)=>({user_id,username:'sample_review',avatar_data:null,username_changed_at:'2020-01-01T00:00:00Z'}),save:async()=>{throw Error('No writes')}});`;
}};
let server,browser,core;
try{
 await build({root,configFile:false,envDir:false,logLevel:'error',build:{ssr:'src/lib/askCova.ts',outDir:path.join(out,'core'),emptyOutDir:true,rollupOptions:{output:{entryFileNames:'ask-core.mjs'}}}});
 core=await import(pathToFileURL(path.join(out,'core','ask-core.mjs')).href);
 for(const flag of ['enabled','disabled'])await build({root,configFile:false,envDir:false,logLevel:'error',plugins:[plugin,react()],define:{'import.meta.env.VITE_WORKSPACE_SYNC_ENABLED':'"true"','import.meta.env.VITE_ASK_COVA_ENABLED':JSON.stringify(flag==='enabled'?'true':'false')},build:{outDir:path.join(out,'site',flag),emptyOutDir:true}});
 server=createServer((req,res)=>{const file=path.resolve(out,'site',new URL(req.url,'http://localhost').pathname.slice(1));if(!file.startsWith(path.resolve(out,'site')+path.sep)||!existsSync(file)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});
 async function open(mode,{width=1440,flag='enabled',live=true,answered=false}={}){
  const context=await browser.newContext({viewport:{width,height:width<768?844:1000},isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce'});
  const state={mode,context,caps:[],asks:[],held:[],current:owner,answered};
  await context.addInitScript(({owner,live,answered,syntheticTrades,defaultRules})=>{
   if(location.origin==='null')return;
   window.__qaListeners=new Set();window.__qaSession=live?{user:{id:owner,email:'synthetic@example.invalid',app_metadata:{plan:'pro'}},access_token:'synthetic-initial'}:null;
   window.__qaChange=(id,token,event)=>{window.__qaSession=id?{user:{id,email:'synthetic@example.invalid',app_metadata:{plan:'pro'}},access_token:token}:null;
    if(id)localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:id,providerSessionId:token,plan:'pro',email:'synthetic@example.invalid',signedInAt:'2026-10-30T16:00:00Z'}));
    for(const callback of window.__qaListeners)callback(event||(id?'SIGNED_IN':'SIGNED_OUT'),window.__qaSession);
   };
   localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'synthetic-initial',plan:'pro',email:'synthetic@example.invalid',signedInAt:'2026-10-30T16:00:00Z'}));
   if(answered){localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades:syntheticTrades,rules:defaultRules,tradeAccount:'local'}));localStorage.setItem('cova-dashboard-range-v1','all');}
   window.__qaFlashes=0;window.__qaPaintFlashes=0;window.__qaWatch=true;window.__qaFrameDetails=[];
   // These are DOM/rAF observations, NOT compositor captures.
   const frame=()=>{if(window.__qaWatch&&document.querySelector('[data-ask-cova]')){window.__qaPaintFlashes++;const el=document.querySelector('[data-ask-cova]'),r=el.getBoundingClientRect();window.__qaFrameDetails.push({token:window.__qaSession?.access_token,owner:window.__qaSession?.user.id,visible:el.checkVisibility(),rect:{x:r.x,y:r.y,width:r.width,height:r.height},text:el.innerText});}requestAnimationFrame(frame);};requestAnimationFrame(frame);
   new MutationObserver(()=>{if(window.__qaWatch&&document.querySelector('[data-ask-cova]'))window.__qaFlashes++;}).observe(document,{subtree:true,childList:true});
  },{owner,live,answered,syntheticTrades,defaultRules});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin){report.external.push(url.href);return route.abort();}
   if(url.pathname.startsWith('/api/')){
    if(url.pathname==='/api/workspace'&&req.method()==='POST'){
     const body=req.postDataJSON();
     if(body.action==='ask_cova_access'){
      assert.deepEqual(Object.keys(body).sort(),['action','owner']);assert.match(req.headers().authorization,/^Bearer synthetic-/);
      state.caps.push({body,authorization:req.headers().authorization});
      const mode=state.mode;
      if(mode==='pending')return new Promise(resolve=>state.held.push(async()=>{await route.fulfill({json:{owner:body.owner,enabled:true}}).catch(()=>{});resolve();}));
      if(mode==='failed')return route.abort('failed');
      if(mode==='malformed')return route.fulfill({json:{owner:body.owner,enabled:'true'}});
      if(mode==='oversized')return route.fulfill({body:JSON.stringify({owner:body.owner,enabled:true}).padEnd(5000)});
      if(mode==='wrong-owner')return route.fulfill({json:{owner:other,enabled:true}});
      if(mode==='allowed')await state.page.evaluate(()=>{window.__qaWatch=false;});
      return route.fulfill({json:{owner:body.owner,enabled:mode==='allowed'}});
     }
     if(body.action==='ask_cova'){
      state.asks.push(body);
      if(!answered)return route.fulfill({status:403,json:{error:'No provider calls in capability tests'}});
      assert.equal(state.mode,'allowed','answer dispatch must precede revocation');assert.equal(body.owner,state.current);
      const catalog=await core.buildAskCovaCatalog({ownerId:body.owner,account:body.account,range:body.range,question:body.question,trades:syntheticTrades});
      assert.equal(body.contextDigest,catalog.contextDigest);const choice=catalog.candidates.find(c=>c.id==='result')||catalog.candidates[0];assert(choice);
      const selection={choice_id:choice.id,style:'warm'};state.reply=core.renderAskCovaSelection(catalog,selection);assert(state.reply);
      return route.fulfill({json:{status:'ok',aiResponseUsed:true,contextDigest:catalog.contextDigest,selection}});
     }
     return route.fulfill({status:403,json:{error:'Read-only fixture'}});
    }
    if(url.pathname==='/api/workspace'&&req.method()==='GET'){
     const stamp='2026-10-30T16:00:00Z',record=(kind,recordId,accountId,payload)=>({kind,recordId,accountId,payload,schemaVersion:1,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null});
     const cloud=answered?[...syntheticTrades.map(t=>record('trade',t.id,'local',t)),record('rules','current','all',{rules:defaultRules})]:[];
     return route.fulfill({json:{owner:url.searchParams.get('owner'),consent:true,revision:answered?1:0,pendingWrite:null,chunk:answered?Buffer.from(cloud.map(r=>JSON.stringify(r)).join('\n')+'\n').toString('base64'):'',next:null}});
    }
    if(url.pathname==='/api/auth/consent')return route.fulfill({json:{accepted:true}});
    return route.fulfill({status:req.method()==='GET'?200:403,json:{connected:false,accounts:[],available:false,status:'disconnected'}});
   }
   return route.continue({url:origin+(url.pathname.startsWith('/'+flag+'/')?url.pathname:`/${flag}${url.pathname}`)+url.search});
  });
  state.page=await context.newPage();state.page.on('pageerror',e=>report.errors.push(e.message));
  await state.page.goto(origin+`/${flag}/index.html#dashboard`);await state.page.waitForTimeout(1000);return state;
 }
 async function absent(s,label,{sameTask=false}={}){assert.equal(await s.page.locator('[data-ask-cova]').count(),0,label);assert.equal(s.asks.length,0,'denied state cannot ask');const flash=await s.page.evaluate(()=>({mutations:window.__qaFlashes,paintFrames:window.__qaPaintFlashes}));report.observations.push({label,...flash});assert.equal(flash.paintFrames,0,'no unauthorized panel at any animation frame');if(!sameTask)assert.equal(flash.mutations,0,'no transient permission flash');}
 async function change(s,id,token){s.current=id;await s.page.evaluate(({id,token})=>{window.__qaWatch=true;window.__qaChange(id,token);},{id,token});await s.page.waitForTimeout(150);}
 async function run(name,fn){let s;try{await fn(async(...args)=>(s=await open(...args)));report.checks.push(name);}catch(e){report.failures.push({name,error:String(e)});}finally{if(s){for(const release of s.held)await release();report.requests.push({name,caps:s.caps,asks:s.asks});await s.context.close();}save();}}
 for(const mode of ['denied','pending','failed','malformed','oversized','wrong-owner'])await run(mode,async open=>{const s=await open(mode);await absent(s,mode+' remains unmounted');assert.equal(s.caps.length,1,'exactly one discovery, no retry');});
 await run('disabled flag',async open=>{const s=await open('allowed',{flag:'disabled'});await absent(s,'flag disabled');assert.equal(s.caps.length,0);});
 await run('cached local auth is not live authentication',async open=>{const s=await open('allowed',{live:false});await absent(s,'no live session');assert.equal(s.caps.length,0);});
 for(const width of [1440,390])await run('allowed member and inline Beta '+width,async open=>{
  const s=await open('allowed',{width});await s.page.locator('[data-ask-cova]').waitFor();assert.equal(s.caps.length,1);assert.equal(s.caps[0].body.owner,owner);
  const label=s.page.locator('.ask-cova-beta');assert.equal(await label.innerText(),'Beta');assert(await label.isVisible());
  const metrics=await label.evaluate(el=>{const b=el.getBoundingClientRect(),h=document.querySelector('#ask-cova-title').getBoundingClientRect();return {sameLine:Math.abs(b.top+b.height/2-h.top-h.height/2)<8,gap:b.left-h.right,overflow:document.documentElement.scrollWidth-innerWidth};});assert(metrics.sameLine);assert(metrics.gap>=0&&metrics.gap<=16);assert(metrics.overflow<=1);
  const shot=`${phase}-beta-${width}.png`;await s.page.locator('[data-ask-cova]').screenshot({path:path.join(out,shot)});report.screenshots.push(shot);
 });
 await run('same-owner new authenticated session loses prior permission before response',async open=>{
  const s=await open('allowed');await s.page.locator('[data-ask-cova]').waitFor();s.mode='pending';await change(s,owner,'synthetic-new-session');await absent(s,'same owner pending new generation');
  assert.equal(s.caps.length,2);assert.equal(s.caps[1].authorization,'Bearer synthetic-new-session');
  await s.page.evaluate(()=>{window.__qaWatch=true;});await s.page.waitForTimeout(100);assert.equal(await s.page.evaluate(()=>window.__qaFlashes),0);
 });
 await run('switch revokes allowed owner and denied successor cannot ask',async open=>{
  const s=await open('allowed');await s.page.locator('[data-ask-cova]').waitFor();s.mode='denied';await change(s,other,'synthetic-other');await absent(s,'switched owner denied');
  assert(s.caps.some(c=>c.body.owner===other));
 });
 await run('logout revokes allowed owner',async open=>{const s=await open('allowed');await s.page.locator('[data-ask-cova]').waitFor();await change(s,null,'');await absent(s,'logout');assert.equal(s.caps.length,1);});
 await run('late prior-owner allow cannot authorize successor',async open=>{
  const s=await open('pending');await absent(s,'first owner pending');assert.equal(s.held.length,1);s.mode='denied';await change(s,other,'synthetic-other');await absent(s,'second owner denied');
  await s.page.evaluate(()=>{window.__qaWatch=true;});await s.held[0]();await s.page.waitForTimeout(300);await absent(s,'late old allow ignored');assert.equal(await s.page.evaluate(()=>window.__qaFlashes),0);
 });
 await run('late old-session allow cannot authorize same owner new session',async open=>{
  const s=await open('pending');await absent(s,'old session pending');s.mode='denied';await change(s,owner,'synthetic-new-session');await s.held[0]();await s.page.waitForTimeout(150);await absent(s,'old session grant ignored');assert.equal(s.caps.length,2);
 });
 await run('late allow after logout cannot remount',async open=>{
  const s=await open('pending');await absent(s,'before logout');await change(s,null,'');await s.held[0]();await s.page.waitForTimeout(150);await absent(s,'late logout allow');
 });
 await run('same-task stale consent cannot ask after session replacement',async open=>{
  const s=await open('allowed');await s.page.locator('[data-ask-cova]').waitFor();
  await s.page.getByRole('button',{name:'Review my results',exact:true}).click();await s.page.getByRole('button',{name:'Use AI for this review',exact:true}).waitFor();
  s.mode='denied';await s.page.evaluate(owner=>{
   const consent=[...document.querySelectorAll('[data-ask-cova] button')].find(el=>el.textContent==='Use AI for this review');
   window.__qaWatch=true;window.__qaChange(owner,'synthetic-replaced');consent.click();
  },owner);
  // Retain the old DOM and click in the SAME task. Revocation must have committed
  // before returning, without relying on the later DOM/rAF samples as compositor proof.
  await s.page.waitForTimeout(200);await absent(s,'retained same-task consent loses authority',{sameTask:true});assert.equal(s.caps.length,2);
 });
 // Fresh contexts keep the strict watcher throughout revocation, without counter resets.
 for(const rate of rates)for(let repeat=0;repeat<3;repeat++)for(const transition of ['same-owner','owner-switch','logout','invalid-callback','token-refresh','user-update'])await run(`synchronous revocation ${rate}x ${repeat} ${transition}`,async open=>{
  const answered=repeat===2,s=await open('allowed',{answered});await s.page.locator('[data-ask-cova]').waitFor();
  if(answered){await s.page.getByRole('button',{name:'Review my results',exact:true}).click();await s.page.getByRole('button',{name:'Use AI for this review',exact:true}).click();await s.page.locator('[data-cova-answer]').waitFor();assert.equal(await s.page.locator('[data-cova-answer]').innerText(),s.reply.answer);assert.equal(s.asks.length,1);}
  else {await s.page.getByRole('button',{name:'Review my results',exact:true}).click();await s.page.getByRole('button',{name:'Use AI for this review',exact:true}).waitFor();}
  const before=s.asks.length,cdp=await s.context.newCDPSession(s.page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});
  const id=['logout','invalid-callback'].includes(transition)?null:transition==='owner-switch'?other:owner;
  const event=transition==='invalid-callback'?'TOKEN_REFRESHED':transition==='token-refresh'?'TOKEN_REFRESHED':transition==='user-update'?'USER_UPDATED':undefined;
  s.mode='pending';s.current=id;
  const boundary=await s.page.evaluate(({id,token,event})=>{
   const panel=document.querySelector('[data-ask-cova]'),buttons=[...panel.querySelectorAll('button')],form=panel.querySelector('form');
   window.__qaWatch=true;window.__qaChange(id,token,event);
   const snapshot={mounted:!!document.querySelector('[data-ask-cova]'),connected:panel.isConnected,visible:panel.checkVisibility(),answer:document.querySelector('[data-cova-answer]')?.textContent||null};
   for(const button of buttons)button.click();if(form)form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
   return snapshot;
  },{id,token:`synthetic-${rate}-${repeat}-${transition}`,event});
  await s.page.waitForTimeout(200);await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();
  const flash=await s.page.evaluate(()=>({mutations:window.__qaFlashes,paintFrames:window.__qaPaintFlashes,frameDetails:window.__qaFrameDetails}));
  report.observations.push({rate,repeat,transition,answered,boundary,...flash,authorizedAsks:before,asksAfter:s.asks.length});
  assert.equal(s.asks.length,before,'retained controls/forms cannot dispatch after revocation');assert.equal(await s.page.locator('[data-ask-cova]').count(),0);assert.equal(await s.page.locator('dialog[open]').count(),0,'retained evidence controls cannot open a dialog');
  assert.equal(flash.paintFrames,0,'no unauthorized panel at any animation frame');assert.equal(flash.mutations,0,'no transient permission flash');
  assert.equal(boundary.mounted,false,'prior grant removed before auth callback returns');assert.equal(boundary.connected,false);assert.equal(boundary.visible,false);assert.equal(boundary.answer,null);
 });
 assert.equal(report.checks.length+report.failures.length,17+rates.length*18,'complete original and repeated transition matrix');
 assert.equal(report.external.length,0);assert.equal(report.errors.length,0);
 for(const [file,value] of Object.entries(report.hashes))assert.equal(hash(path.join(root,file)),value,'source stayed fixed '+file);
}catch(e){report.failures.push({name:'harness',error:String(e)});}
finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));save();}
console.log(JSON.stringify({out,phase,passed:report.checks.length,failures:report.failures},null,2));if(report.failures.length)process.exitCode=1;
