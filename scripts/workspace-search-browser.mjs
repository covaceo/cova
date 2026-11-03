// Isolated real-App, canonical CSS, synthetic auth/storage only. No real browser profile.
import assert from 'node:assert/strict';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import path from 'node:path';
import load from './helpers/load-ts.cjs';
const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
const out=path.resolve(process.env.COVA_SEARCH_EVIDENCE || path.join(root,'../workspace-search-evidence/implementation'),`browser-${new Date().toISOString().replace(/[:.]/g,'-')}`);
mkdirSync(out,{recursive:true});
const {defaultRules}=load('src/lib/risk.ts');
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',stamp='2026-10-30T16:00:00.000Z';
const second='Manual:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const names={local:'Morning account',[second]:'Evening account'};
const note='Patient entry 東京; waited for confirmation. '+ 'Full private synthetic note. '.repeat(35)+'END-OF-TRADE-NOTE';
const trades=[{id:'manual-search-one',date:'2026-10-30',market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl:0,risk:0,setup:'Café pullback',notes:note,manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}},{id:'manual-search-two',date:'2026-10-29',market:'ES',side:'Short',contracts:2,entry:120,exit:119,pnl:75,risk:20,setup:'Evening reversal',notes:'Secondary marker',manual:{accountKey:second,currency:'USD',pnlBasis:'reported_net'}}];
const journal='Review patience before the open. '+ 'Complete daily reflection. '.repeat(35)+'END-OF-JOURNAL';
const record=(kind,recordId,accountId,payload)=>({kind,recordId,accountId,schemaVersion:1,payload,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null});
const cloud=[...trades.map(t=>record('trade',t.id,t.manual.accountKey,t)),record('rules','current','all',{rules:defaultRules}),...Object.entries(names).map(([account,name])=>record('account',account,account,{name})),record('daily_note',JSON.stringify(['local','2026-10-29']),'local',{date:'2026-10-29',note:journal,tradeId:'manual-search-one'})];
const report={out,checks:[],failures:[],errors:[],external:[],requests:[],screenshots:[],sourceHashes:{}};
for(const file of ['package.json','scripts/workspace-search-browser.mjs','scripts/workspace-search-regression.mjs','scripts/auth-regression.mjs'])report.sourceHashes[file]=createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex');
const save=()=>writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
const check=(name,ok,detail)=>{(ok?report.checks:report.failures).push({name,detail});save();assert(ok,name)};
function isolation(){return {name:'workspace-search-isolation',enforce:'pre',load(id){
 const clean=id.split('?')[0],rel=path.relative(root,clean).replaceAll('\\','/');
 if((rel.startsWith('src/')||rel==='index.html')&&existsSync(clean))report.sourceHashes[rel]=createHash('sha256').update(readFileSync(clean)).digest('hex');
 if(rel==='src/lib/supabaseClient.ts')return readFileSync(id,'utf8').replace('export function getSupabaseClient() {','function unusedRealSupabaseClient() {').replace('export function getSupabaseAuthSessionId(accessToken: string)','function unusedRealSessionId(accessToken: string)')+`\nexport const getSupabaseAuthSessionId=()=>"search-session";export const getSupabaseClient=()=>({auth:{getSession:async()=>({data:{session:window.__searchSession}}),onAuthStateChange:callback=>{window.__searchAuth=callback;return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({error:null})}});`;
 if(rel==='src/lib/profileRepository.ts')return `export const createProfileRepository=()=>({load:async(user_id)=>({user_id,username:'search_fixture',avatar_data:null,username_changed_at:'2020-01-01T00:00:00Z'}),save:async()=>{throw Error('Read-only fixture')}});`;
}}}
let server,browser;
try {
 await build({root,configFile:false,envDir:false,logLevel:'error',plugins:[isolation(),react()],define:{'import.meta.env.VITE_WORKSPACE_SYNC_ENABLED':'"true"','import.meta.env.VITE_ASK_COVA_ENABLED':'"false"'},build:{outDir:path.join(out,'site'),emptyOutDir:true}});
 server=createServer((req,res)=>{const file=path.resolve(out,'site','.'+new URL(req.url,'http://127.0.0.1').pathname);if(file!==path.resolve(out,'site')&&!file.startsWith(path.resolve(out,'site')+path.sep)){res.writeHead(403);return res.end()};const target=existsSync(file)&&path.extname(file)?file:path.join(out,'site/index.html');res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff'}[path.extname(target)]||'application/octet-stream'});res.end(readFileSync(target));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({channel:process.env.COVA_TEST_BROWSER_CHANNEL || 'chrome',headless:true});
 async function open(width=1440,{local=false,rows=trades,notes=journal,motion='reduce'}={}){
  const context=await browser.newContext({viewport:{width,height:width<768?844:1000},isMobile:width<768,hasTouch:width<768,deviceScaleFactor:1,reducedMotion:motion,locale:'en-US',timezoneId:'UTC'});
  const state={context,width,cloud:[...cloud.filter(r=>r.kind!=='trade'),...rows.map(t=>record('trade',t.id,t.manual?.accountKey || 'local',t))]};
  await context.addInitScript(({owner,stamp,trades,names,defaultRules,local,notes})=>{
   if(location.origin==='null')return;
   window.__searchSession={user:{id:owner,email:'search@example.invalid',app_metadata:{plan:'pro'}},access_token:'synthetic-search-token'};
   localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'search-session',plan:'pro',email:'search@example.invalid',signedInAt:stamp}));
   if(local)localStorage.setItem('cova-workspace-mode-v2:'+owner,'local');
   localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades,rules:defaultRules,tradeAccount:'local'}));
   localStorage.setItem('cova-workspace-aux-v1:'+owner,JSON.stringify({version:1,names,notes:{local:{'2026-10-29':{note:notes,tradeId:'manual-search-one'}}},cash:{}}));
   localStorage.setItem('cova-dashboard-range-v1','all');
  },{owner,stamp,trades:rows,names,defaultRules,local,notes});
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin){report.external.push(url.href);return route.abort();}
   if(url.pathname.startsWith('/api/')){report.requests.push({path:url.pathname,method:req.method(),body:req.postData()});
    if(url.pathname==='/api/workspace'&&req.method()==='GET')return route.fulfill({json:{owner,consent:true,revision:1,pendingWrite:null,chunk:Buffer.from(state.cloud.map(r=>JSON.stringify(r)).join('\n')+'\n').toString('base64'),next:null}});
    if(req.method()!=='GET')return route.fulfill({status:403,json:{error:'Read-only synthetic fixture'}});
    if(url.pathname==='/api/auth/consent')return route.fulfill({json:{accepted:true}});
    return route.fulfill({json:{connected:false,accounts:[],available:false,status:'disconnected'}});
   }
   return route.continue();
  });
  state.page=await context.newPage();state.page.setDefaultTimeout(5000);state.page.on('pageerror',e=>report.errors.push(e.message));
  await state.page.goto(origin+'/#dashboard');try { await state.page.locator('.astra-dashboard').waitFor({timeout:20000}); } catch(error) { writeFileSync(path.join(out,'startup.txt'),await state.page.locator('body').innerText());await state.page.screenshot({path:path.join(out,'startup.png')});throw error; } await state.page.evaluate(()=>document.fonts.ready);
  await state.page.waitForTimeout(800);return state;
 }
 async function shot(s,label){const file=`${s.width}-${label}.png`;await s.page.screenshot({path:path.join(out,file)});report.screenshots.push(file);save();}
 async function scenario(name,run){try{await run();}catch(error){report.failures.push({name,error:String(error)});save();}}
 async function search(s){const p=s.page,trigger=p.getByRole('button',{name:'Search workspace',exact:true}).filter({visible:true});await trigger.waitFor();if(s.width<768)await trigger.tap();else await trigger.click();const d=p.getByRole('dialog',{name:'Search workspace',exact:true});await d.waitFor();return {d,input:d.getByRole('combobox',{name:'Search workspace'}),trigger};}
 for(const width of [1440,768,390,320])await scenario(`workflow-${width}`,async()=>{
  const s=await open(width);const p=s.page;
  try{
   await shot(s,'workspace');const {d,input,trigger}=await search(s);
   check(`${width} search initially focuses input`,await input.evaluate(el=>el===document.activeElement));
   if(width===1440)check('compact Gooey trigger announces expanded dialog',await p.locator('.cova-gooey-search button').getAttribute('aria-haspopup')==='dialog'&&await p.locator('.cova-gooey-search button').getAttribute('aria-expanded')==='true');
   check(`${width} all five actual pages in empty state`,await d.getByRole('option').count()===5);
   await p.keyboard.press('ArrowDown');check(`${width} arrow selects second page`,await input.getAttribute('aria-activedescendant')==='workspace-search-option-1');
   await p.keyboard.press('ArrowUp');check(`${width} arrow up returns first page`,await input.getAttribute('aria-activedescendant')==='workspace-search-option-0');
   await input.fill('  CAFÉ nq 東京  ');check(`${width} normalized multi-token result`,await d.getByRole('option').count()===1);
   await shot(s,'results');await p.keyboard.press('Enter');
   check(`${width} detail focus stays inside dialog`,await p.evaluate(()=>!!document.activeElement?.closest('dialog[open]')));
   check(`${width} exact full trade note`,await d.getByText(note,{exact:true}).count()===1);
   check(`${width} exact zero`,await d.getByText('$0.00',{exact:true}).count()===1);
   check(`${width} no mutation actions`,await d.getByRole('button',{name:/edit|save|delete/i}).count()===0);
   await d.locator('.workspace-search-detail').evaluate(el=>{el.scrollTop=el.scrollHeight});await shot(s,'trade-detail-bottom');
   await d.getByRole('button',{name:'Back to results'}).click();check(`${width} back restores query and input focus`,await input.inputValue()==='  CAFÉ nq 東京  '&&await input.evaluate(el=>el===document.activeElement));
   await input.fill('patience');await d.getByRole('option').click();
   check(`${width} complete journal note`,await d.getByText(journal,{exact:true}).count()===1);await shot(s,'journal-detail');
   const attachment=d.locator('.workspace-search-attachment button');await attachment.click();check(`${width} attachment opens actual complete trade`,await d.getByText(note,{exact:true}).count()===1);
   await p.keyboard.press('Escape');await d.waitFor({state:'detached'});await p.waitForTimeout(60);
   check(`${width} Escape restores visible opener`,await trigger.evaluate(el=>el===document.activeElement));
   await p.keyboard.press('Control+k');await d.waitFor();check(`${width} shortcut clears prior query`,await input.inputValue()==='');
   await input.fill('PRIVATE-QUERY-NOT-STORED');check(`${width} useful empty state`,await d.getByText(/No matches in your loaded workspace/).isVisible());
   await d.getByRole('button',{name:'Clear search'}).click();check(`${width} clear restores pages and focus`,await input.inputValue()===''&&await d.getByRole('option').count()===5&&await input.evaluate(el=>el===document.activeElement));
   await input.fill('secondary');check(`${width} search includes nonselected account`,(await d.getByRole('option').innerText()).includes('Evening account'));
   await input.fill('analytics');await p.keyboard.press('Enter');await d.waitFor({state:'detached'});await p.waitForFunction(()=>location.hash==='#coach');
   check(`${width} alias opens actual Insights route`,new URL(p.url()).hash==='#coach'&&await p.getByRole('heading',{name:/Insights/i}).count()>0);
   await p.keyboard.press('Meta+k');await d.waitFor();await input.fill('risk desk');await p.keyboard.press('Enter');await p.waitForFunction(()=>location.hash==='#dashboard');
   const privacy=await p.evaluate(()=>[...Object.keys(localStorage).map(k=>localStorage.getItem(k)),...Object.keys(sessionStorage).map(k=>sessionStorage.getItem(k))].some(v=>v?.includes('PRIVATE-QUERY-NOT-STORED')));
   check(`${width} query never persisted or put in URL`,!privacy&&!p.url().includes('PRIVATE-QUERY'));
   check(`${width} search creates no API payload`,!JSON.stringify(report.requests).includes('PRIVATE-QUERY-NOT-STORED'));
   const again=await search(s);await again.input.fill('patient');
   const measurements=await p.evaluate(()=>{
    const dialog=document.querySelector('.workspace-search-dialog'),r=dialog.getBoundingClientRect();
    const rgb=c=>(c.match(/[\d.]+/g)||[]).map(Number),lum=c=>rgb(c).slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
    const contrast=(fg,bg)=>{const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    const texts=[...dialog.querySelectorAll('h2,p,small,strong,.workspace-search-meta,.workspace-search-snippet,input')].filter(el=>el.checkVisibility()).map(el=>{let bg=el;while(getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)'&&bg.parentElement)bg=bg.parentElement;const c=getComputedStyle(el),color=c.color,background=getComputedStyle(bg).backgroundColor;return {tag:el.tagName,color,background,ratio:contrast(color,background),font:c.fontFamily};});
    const input=dialog.querySelector('input'),placeholder=getComputedStyle(input,'::placeholder').color;
    return {bounds:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},width:innerWidth,height:innerHeight,overflow:dialog.scrollWidth-dialog.clientWidth,texts,placeholderRatio:contrast(placeholder,'rgb(16, 20, 28)'),motion:[...dialog.querySelectorAll('*')].every(el=>getComputedStyle(el).animationName==='none'&&getComputedStyle(el).transitionDuration==='0s'),moving:[...dialog.querySelectorAll('*')].map(el=>({tag:el.tagName,animation:getComputedStyle(el).animationName,transition:getComputedStyle(el).transitionDuration})).filter(x=>x.animation!=='none'||x.transition!=='0s'),targets:[...dialog.querySelectorAll('button')].filter(el=>el.checkVisibility()).map(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width}))};
   });
   report.measurements??=[];report.measurements.push({width,...measurements});
   check(`${width} modal and contents fit viewport`,measurements.bounds.left>=0&&measurements.bounds.right<=width+1&&measurements.bounds.top>=0&&measurements.bounds.bottom<=measurements.height+1&&measurements.overflow<=1,measurements.bounds);
   check(`${width} text and placeholder contrast >=4.5`,measurements.texts.every(t=>t.ratio>=4.5)&&measurements.placeholderRatio>=4.5,measurements.texts);
   const rowLayout=await again.d.getByRole('option').first().evaluate(el=>{const r=el.getBoundingClientRect(),snippet=el.querySelector('.workspace-search-snippet').getBoundingClientRect();return {height:r.height,display:getComputedStyle(el).display,whiteSpace:getComputedStyle(el).whiteSpace,containsSnippet:snippet.left>=r.left&&snippet.right<=r.right+1&&snippet.bottom<=r.bottom+1}});
   check(`${width} category context and snippet occupy readable multiline result`,rowLayout.height>=64&&rowLayout.display==='block'&&rowLayout.whiteSpace==='normal'&&rowLayout.containsSnippet,rowLayout);
   check(`${width} reduced motion computed`,measurements.motion,measurements.moving);
   check(`${width} minimum 44px touch target heights`,measurements.targets.every(t=>t.height>=44),measurements.targets);
   await again.input.focus();const focus=await again.input.evaluate(el=>{const c=getComputedStyle(el);return {active:el===document.activeElement,width:c.outlineWidth,style:c.outlineStyle}});check(`${width} visible focus ring`,focus.active&&parseFloat(focus.width)>=2&&focus.style==='solid',focus);
   await p.keyboard.press('Tab');await p.keyboard.press('Tab');await p.keyboard.press('Tab');check(`${width} Tab remains trapped`,await p.evaluate(()=>!!document.activeElement?.closest('dialog[open]')));
   await again.d.getByRole('button',{name:'Close search'}).focus();await p.keyboard.press('Shift+Tab');check(`${width} reverse tab wraps to last tabbable control, not result option`,await again.d.getByRole('button',{name:'Clear search'}).evaluate(el=>el===document.activeElement));
   await again.input.focus();await again.input.press('Enter');await p.keyboard.press('Control+k');check(`${width} shortcut from detail returns to focused query`,await again.input.isVisible()&&await again.input.evaluate(el=>el===document.activeElement));
  }finally{await s.context.close();}
 });
 await scenario('pagination',async()=>{
  const rows=Array.from({length:75},(_,i)=>({...trades[0],id:`manual-many-${i}`,notes:`Bulk searchable ${i}`}));
  const s=await open(390,{local:true,rows});try{const {d,input}=await search(s);await input.fill('bulk');check('all 75 results reported',await d.getByRole('status').innerText()==='75 results');check('first page bounded at 30 rows',await d.getByRole('option').count()===30);
   for(let i=0;i<30;i++)await input.press('ArrowDown');check('arrows cross initial cap',await input.getAttribute('aria-activedescendant')==='workspace-search-option-30');await input.press('Enter');check('arrow selection opens row 30',await d.getByText('manual-many-30',{exact:true}).isVisible());await d.getByRole('button',{name:'Back to results'}).click();await d.getByRole('button',{name:'Next',exact:true}).tap();check('last page exposes final 15 rows',await d.getByRole('option').count()===15);await d.getByRole('option').last().tap();check('last result opens exact row',await d.getByText('manual-many-74',{exact:true}).isVisible());await shot(s,'last-result');
  }finally{await s.context.close();}
 });
 await scenario('live-notes',async()=>{
  const s=await open(1440,{local:true});try{const {d,input}=await search(s);await input.fill('patience');await input.press('Enter');
   await s.page.evaluate(owner=>{const key='cova-workspace-aux-v1:'+owner,aux=JSON.parse(localStorage.getItem(key));aux.notes.local['2026-10-29'].note='UPDATED-JOURNAL';localStorage.setItem(key,JSON.stringify(aux));window.dispatchEvent(new Event('cova:workspace-local-change'));},owner);
   check('open detail follows current note without stale copy',await d.getByText('UPDATED-JOURNAL',{exact:true}).isVisible()&&await d.getByText(journal,{exact:true}).count()===0);
   await s.page.evaluate(owner=>{const key='cova-workspace-aux-v1:'+owner,aux=JSON.parse(localStorage.getItem(key));delete aux.notes.local['2026-10-29'];localStorage.setItem(key,JSON.stringify(aux));window.dispatchEvent(new Event('cova:workspace-local-change'));},owner);
   check('deleted note disappears from open detail',await d.getByText(/This result is no longer available/).isVisible()&&await d.getByText('UPDATED-JOURNAL',{exact:true}).count()===0);
   await d.getByRole('button',{name:'Back to results'}).click();check('deleted note disappears from results',await d.getByRole('option').count()===0);
  }finally{await s.context.close();}
 });
 for(const event of ['SIGNED_OUT','TOKEN_REFRESHED','SIGNED_IN'])await scenario(`auth-${event}`,async()=>{
  const s=await open();try{const {d,input}=await search(s);await input.fill('patient');await input.press('Enter');
   const revoked=await s.page.evaluate(event=>{const retained=document.querySelector('.workspace-search-back');const session=event==='SIGNED_OUT'?null:{...window.__searchSession,user:{...window.__searchSession.user,...(event==='SIGNED_IN'?{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',email:'other@example.invalid'}:{})}};window.__searchAuth(event,session);retained?.click();return {dialog:!!document.querySelector('.workspace-search-dialog'),note:document.body.innerText.includes('END-OF-TRADE-NOTE')};},event);
   check(`${event} synchronously removes prior query/detail and rejects retained action`,!revoked.dialog&&!revoked.note,revoked);
  }finally{await s.context.close();}
 });
 await scenario('cross-tab-access-loss',async()=>{const s=await open();try{const {d,input}=await search(s);await input.fill('patient');await input.press('Enter');const gone=await s.page.evaluate(()=>{localStorage.removeItem('cova-auth-session-v1');window.dispatchEvent(new StorageEvent('storage',{key:'cova-auth-session-v1'}));return !document.querySelector('.workspace-search-dialog')});check('cross-tab signout synchronously removes detail',gone);}finally{await s.context.close();}});
 await scenario('hydration-deletion',async()=>{const s=await open();try{const {d,input}=await search(s);await input.fill('patient');await input.press('Enter');s.cloud=s.cloud.filter(r=>r.kind!=='trade');await s.page.evaluate(owner=>window.dispatchEvent(new StorageEvent('storage',{key:'cova-react-risk-os-v2:'+owner})),owner);await d.waitFor({state:'detached'});await s.page.getByRole('button',{name:'Reload account and review'}).click();await s.page.waitForTimeout(900);const next=await search(s);await next.input.fill('patient');check('rehydrated deletion never resurfaces old trade',await next.d.getByRole('option').count()===0);}finally{await s.context.close();}});
 await scenario('responsive-focus-and-motion',async()=>{const s=await open(1440,{motion:'no-preference'});try{const p=s.page;await p.locator('#cova-workspace-sidebar').hover();await p.getByRole('button',{name:'Collapse sidebar'}).click();const {d,input}=await search(s);check('collapsed rail still opens workspace search',await input.evaluate(el=>el===document.activeElement));await input.fill('patient');await shot(s,'normal-motion');await p.setViewportSize({width:390,height:600});await p.keyboard.press('Escape');await d.waitFor({state:'detached'});await p.waitForTimeout(80);check('breakpoint change returns focus to visible search opener',await p.locator('.workspace-mobile-search').evaluate(el=>el===document.activeElement));}finally{await s.context.close();}});
 await scenario('duplicate-read-only-records',async()=>{const s=await open(390,{local:true,rows:[trades[0],{...trades[0]},{...trades[0],notes:'conflicting version'},trades[1]]});try{const {d,input}=await search(s);await input.fill('café');check('duplicates dedupe exact copies and retain conflicting text',await d.getByRole('option').count()===2);await d.getByRole('option').last().tap();check('conflicting record opens its own full text',await d.getByText('conflicting version',{exact:true}).count()===1);await d.getByRole('button',{name:'Back to results'}).click();await d.getByRole('option').first().tap();check('first conflicting record never aliases second',await d.getByText(note,{exact:true}).count()===1);}finally{await s.context.close();}});
 await scenario('narrow-short-viewport-and-long-input',async()=>{const s=await open(320,{local:true});try{const {d,input}=await search(s);await s.page.setViewportSize({width:320,height:360});await input.fill('NQ '.repeat(10000)+'absent');check('long input fully evaluated instead of silent truncation',await d.getByRole('option').count()===0&&(await input.inputValue()).endsWith('absent'));await d.getByRole('button',{name:'Clear search'}).click();await shot(s,'short-viewport');const b=await d.boundingBox();check('short viewport fits dialog',b.y>=0&&b.y+b.height<=361);await input.fill('patient');await input.press('Enter');const region=d.locator('.workspace-search-detail');await region.evaluate(el=>el.scrollTop=el.scrollHeight);check('short viewport complete detail remains scrollable',await region.evaluate(el=>el.scrollTop>0&&el.scrollHeight-el.scrollTop-el.clientHeight<2));}finally{await s.context.close();}});
 check('no page errors',report.errors.length===0,report.errors);
 check('no external requests',report.external.length===0,report.external);
 check('no mutations attempted beyond inherited blocked Passport plan lookup',report.requests.filter(request=>request.method!=='GET').every(request=>request.path==='/api/passport'&&JSON.parse(request.body).action==='plan'));
 report.complete=true;
}catch(error){report.fatal=String(error);process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));save();}
if(report.failures.length||report.fatal)process.exitCode=1;
console.log(JSON.stringify({out,checks:report.checks.length,failures:report.failures,fatal:report.fatal},null,2));
