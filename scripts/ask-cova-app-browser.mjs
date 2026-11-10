// V4 transport fixture uses a deliberately fixed synthetic aggregate plan.
// It tests UI/accounting/proof wiring, NOT interpretation of the user's question.
// Isolated full-App QA. Synthetic auth/cloud/provider authored answer only; no external calls.
// Run with native node.exe scripts/ask-cova-app-browser.mjs from this checkout.
import assert from 'node:assert/strict';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import load from './helpers/load-ts.cjs';
import {chooseAccount as chooseAccountOriginal,accountValue} from './helpers/account-picker.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const drawerMode=process.argv.includes('--drawer');
const workspaceMode=process.argv.includes('--workspace');
const workspaceBaseline=path.resolve(process.env.WORKSPACE_BASELINE_ROOT || root);
const baselineSource=rel=>workspaceBaseline===root?execFileSync('git',['show',`HEAD:${rel}`],{cwd:root,encoding:'utf8'}):readFileSync(path.join(workspaceBaseline,rel),'utf8');
const out=path.resolve(process.env.ASK_COVA_EVIDENCE_ROOT || path.resolve(root,workspaceMode?'../workspace-consistency-evidence/runs':drawerMode?'../left-sidebar-drawer-evidence/runs':'../ask-cova-panel-evidence/runs',new Date().toISOString().replaceAll(':','-')),'app'); // Each verification run preserves prior evidence.
mkdirSync(out,{recursive:true});
const {defaultRules}=load('src/lib/risk.ts');
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other='Manual:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const names={local:'Sample review',[other]:'Sample second account'};
const row=(pnl,index,account='local')=>({id:`manual-app-${account==='local'?'a':'b'}-${index}`,date:['2026-10-20','2026-10-24','2026-10-28','2026-10-30'][index],market:account==='local'?'NQ':'ES',side:'Long',contracts:1,entry:100,exit:101,pnl,risk:100,riskStatus:'provided',setup:'Sample pullback',notes:`Synthetic private note ${account==='local'?'A':'B'}${index}; never sent to authored answer.`,manual:{accountKey:account,currency:'USD',pnlBasis:'reported_net'}});
const trades=[...[825,-275,450,350].map((v,i)=>row(v,i)),...[-900,75].map((v,i)=>row(v,i,other))];
const euroAccount='Rithmic:synthetic_eur_account_key:EUR-SAMPLE';
const euroTrade={id:'rithmic-app-eur-0',date:'2026-10-30',market:'FDAX',side:'Long',contracts:1,entry:100,exit:101,pnl:12.5,risk:25,riskStatus:'provided',setup:'Synthetic EUR review',notes:'Synthetic EUR private note',source:{provider:'Rithmic',accountKey:'synthetic_eur_account_key',accountId:'EUR-SAMPLE',currency:'EUR'}};
const stamp='2026-10-30T16:00:00.000Z';
const record=(kind,recordId,accountId,payload)=>({kind,recordId,accountId,schemaVersion:1,payload,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null});
const cloud=[...trades.map(t=>record('trade',t.id,t.manual.accountKey,t)),record('rules','current','all',{rules:defaultRules}),...Object.entries(names).map(([account,name])=>record('account',account,account,{name}))];
const report={disclosure:'LOCAL FULL-APP PRODUCTION-MODE FIXTURE: synthetic manual USD records; mocked auth, saved-cloud snapshot, profile and provider AUTHORED ANSWER. Real App, canonical entry/CSS, workspace sync, client transport and shared deterministic core. No provider/backend execution, paid calls, customer records, credentials or deployment.',base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),samples:[...trades,euroTrade],sourceHashes:{},builds:[],checks:[],failures:[],errors:[],externalBlocked:[],requests:[],screenshots:[],measurements:[],comparisons:[]};
const hashFile=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
for(const f of ['src/App.tsx','src/components/DashboardView.tsx','src/components/AskCova.tsx','src/components/TradeHistoryDialog.tsx','src/lib/askCova.ts','src/lib/askCovaClient.ts','src/lib/askCovaIntent.ts','src/styles/askCova.css','src/main.tsx','scripts/ask-cova-app-browser.mjs',...(drawerMode?['scripts/workspace-drawer-browser.mjs']:[]),...(workspaceMode?['scripts/workspace-consistency-browser.mjs','scripts/workspace-consistency-interactions.mjs','scripts/helpers/workspace-evidence-guard.mjs']:[]),'scripts/helpers/load-ts.cjs','scripts/helpers/account-picker.mjs'])report.sourceHashes[f]=hashFile(path.join(root,f));
report.buildSourceHashes={};report.baselineSourceHashes={};
const save=()=>writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
function check(name,condition,detail){(condition?report.checks:report.failures).push({name,...(detail===undefined?{}:{detail})});save();return condition;}
function hasVisibleFocus(focus){
 // This site's computed focus ring is opaque RGB and solid; fail closed otherwise.
 const color=/^rgb\((\d+), (\d+), (\d+)\)$/.exec(focus.outlineColor);
 const width=/^(\d+(?:\.\d+)?)px$/.exec(focus.outlineWidth);
 return Boolean(focus.active===true&&focus.visible===true&&focus.outlineStyle==='solid'&&width&&Number.isFinite(Number(width[1]))&&Number(width[1])>=1&&color&&color.slice(1).every(channel=>Number(channel)<=255));
}
const baselineFiles=['src/App.tsx','src/components/DashboardView.tsx','src/components/TradeHistoryDialog.tsx','src/components/WorkspaceShell.tsx','src/components/MiniJournal.tsx'];
const fixtureLabel='LOCAL QA · Synthetic trades · Mock auth/cloud/AI authored answer · No paid calls';
function isolation(variant){return {name:'ask-cova-full-app-isolation',enforce:'pre',load(id){
 const rel=path.relative(root,id).replaceAll('\\','/');
 // Record every local module/asset actually loaded, including transitive canonical CSS.
 const clean=id.split('?')[0],file=path.relative(root,clean).replaceAll('\\','/');
 if((file.startsWith('src/')||file==='index.html')&&existsSync(clean)){
  const hash=hashFile(clean);report.sourceHashes[file]??=hash;
  (report.buildSourceHashes[variant]??={})[file]=hash;
 }
 if(rel==='src/lib/supabaseClient.ts')return readFileSync(id,'utf8').replace('export function getSupabaseClient() {','function unusedRealSupabaseClient() {').replace('export function getSupabaseAuthSessionId(accessToken: string)','function unusedRealSessionId(accessToken: string)')+'\nexport const getSupabaseAuthSessionId=()=>"qa-session";export const getSupabaseClient=()=>({auth:{getSession:async()=>({data:{session:window.__qaSession}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})}});';
 if(rel==='src/lib/profileRepository.ts')return `export const createProfileRepository=()=>({load:async(user_id)=>({user_id,username:'sample_review',avatar_data:null,username_changed_at:'2020-01-01T00:00:00Z'}),save:async()=>{throw Error('Read-only isolated fixture')}});`;
 if(variant==='baseline'&&((workspaceMode&&rel.startsWith('src/')&&/\.(tsx?|css|json)$/.test(rel))||baselineFiles.includes(rel)||(drawerMode&&rel==='src/styles/askCovaPanel.css'))){const source=baselineSource(rel);report.baselineSourceHashes[rel]=createHash('sha256').update(source).digest('hex');report.buildSourceHashes[variant][rel]=report.baselineSourceHashes[rel];return source;}
 },transform(code,id){if(workspaceMode&&id.replaceAll('\\','/').endsWith('/src/components/OAuthConnectPage.tsx'))return code.replace('const devProviderPreview = isLocalPreview() && firm.id !== "other";', 'const devProviderPreview = !window.__workspaceUnavailable && isLocalPreview() && firm.id !== "other";');},transformIndexHtml(){return [{tag:'div',attrs:{id:'qa-disclosure',style:'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;pointer-events:none;padding:5px 12px;background:#202020;color:#eee;font:12px/1.5 sans-serif;text-align:center;overflow-wrap:anywhere'},children:fixtureLabel,injectTo:'body-prepend'}];}};}
let browser,server,core;
try{
 for(const variant of ((drawerMode||workspaceMode) ? ['enabled','baseline'] : (process.argv.includes('--panel') || process.argv.includes('--visual')) ? ['enabled'] : ['enabled','disabled','baseline'])){
  await build({root,base:'/',configFile:false,envDir:false,logLevel:'error',plugins:[isolation(variant),react()],define:{'import.meta.env.VITE_WORKSPACE_SYNC_ENABLED':'"true"','import.meta.env.VITE_ASK_COVA_ENABLED':JSON.stringify((variant==='enabled'||drawerMode||workspaceMode)?'true':'false')},build:{outDir:path.join(out,'site',variant),emptyOutDir:true}});
  report.builds.push({variant,mode:'production',entry:'index.html -> src/main.tsx -> actual App',canonicalCSS:true,envFiles:false});save();
 }
 const coreEntry=path.join(root,'__query_app_core__.ts');await build({root,configFile:false,envDir:false,logLevel:'error',plugins:[{name:'query-core-fixture',resolveId(id){if(id.endsWith('__query_app_core__.ts'))return coreEntry;},load(id){if(id===coreEntry)return ['askCovaData','askCovaQuery','askCovaQueryAnswer'].map(name=>`export * from '${path.join(root,'src/lib',name+'.ts').replaceAll('\\','/')}';`).join('\n');}}],build:{ssr:coreEntry,outDir:path.join(out,'core'),emptyOutDir:true,rollupOptions:{output:{entryFileNames:'ask-core.mjs'}}}});
 core=await import(pathToFileURL(path.join(out,'core','ask-core.mjs')).href);
 // Static server serves built artifacts only, never forwards API requests.
 server=createServer((req,res)=>{const parts=new URL(req.url,'http://127.0.0.1').pathname.split('/').filter(Boolean);const variant=parts.shift();if(!['enabled','disabled','baseline'].includes(variant)){res.writeHead(404);return res.end();}let rel=parts.join('/')||'index.html';const file=path.resolve(out,'site',variant,rel);if(!file.startsWith(path.resolve(out,'site',variant)+path.sep)){res.writeHead(403);return res.end();}if(!existsSync(file)){res.writeHead(404);return res.end();}const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'none'; object-src 'none'"});res.end(readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});
 async function open({variant='enabled',width=1440,plan='pro',local=false,euro=false,scenario=''}={}){
  const id=`${variant}-${plan}-${local?'browser':'saved'}-${width}${euro?'-eur':''}${scenario?'-'+scenario:''}`;
  const scenarioTrades=scenario==='workspace-empty'?[]:euro?[...trades,euroTrade]:trades;
  const scenarioCloud=scenario==='workspace-empty'?cloud.filter(r=>r.kind!=='trade'):euro?[...cloud,record('trade',euroTrade.id,euroAccount,euroTrade)]:scenario==='visual-match-populated'?[...cloud,record('daily_note',JSON.stringify(['local','2026-10-30']),'local',{date:'2026-10-30',note:'Reviewed the saved pullback trades. Kept size at one contract and noted the losing session for review.',tradeId:null})]:cloud;
  const context=await browser.newContext({viewport:{width,height:width<768?844:1000},deviceScaleFactor:1,isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce',timezoneId:'UTC',locale:'en-US',// No app service-worker registration exists; routing blocks all external requests.
   acceptDownloads:false});
  const state={id,asks:[],capabilities:[],writes:[],api:[],context,variant,width,plan,local};
  await context.addInitScript(({owner,plan,local,trades,defaultRules,names,stamp,scenario})=>{
   if(location.origin==='null')return;
   window.__workspaceUnavailable=scenario==='oauth-unavailable';
   window.__qaSession={user:{id:owner,email:'ask-fixture@example.invalid',app_metadata:{plan}},access_token:'synthetic-qa-token'};
   if(sessionStorage.getItem('ask-fixture-seeded'))return;
   sessionStorage.setItem('ask-fixture-seeded','true');
   localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'qa-session',plan,email:'ask-fixture@example.invalid',signedInAt:stamp}));
   if(local)localStorage.setItem('cova-workspace-mode-v2:'+owner,'local');
   localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades,rules:defaultRules,tradeAccount:'local'}));
   localStorage.setItem('cova-workspace-aux-v1:'+owner,JSON.stringify({version:1,names,notes:{},cash:{}}));
   localStorage.setItem('cova-dashboard-range-v1','all');
  },{owner,plan,local,trades:scenarioTrades,defaultRules,names,stamp,scenario});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin){report.externalBlocked.push({id,url:url.href});return route.abort();}
   if(url.pathname.startsWith('/api/')){
    state.api.push({url:url.pathname,method:req.method()});
    if(url.pathname==='/api/workspace'&&req.method()==='GET')return route.fulfill({json:{owner,consent:true,revision:1,pendingWrite:null,chunk:Buffer.from(scenarioCloud.map(r=>JSON.stringify(r)).join('\n')+'\n').toString('base64'),next:null}});
    if(url.pathname==='/api/workspace'&&req.method()==='POST'){
     const body=req.postDataJSON();
     if(body.action==='ask_cova_access'){
      assert.deepEqual(body,{action:'ask_cova_access',owner});
      assert.equal(req.headers().authorization,'Bearer synthetic-qa-token');
      state.capabilities.push(body);
      return route.fulfill({json:{owner,enabled:true}});
     }
     if(body.action==='ask_cova_context'){assert.deepEqual(body,{action:'ask_cova_context',owner,account:body.account,range:body.range});assert.equal(req.headers().authorization,'Bearer synthetic-qa-token');return route.fulfill({json:{version:'ask-cova-data-v1',owner,workspaceRevision:1,workspaceRecords:scenarioCloud,passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}},headers:{'Cache-Control':'private, no-store'}});}
     if(body.action!=='ask_cova'){state.writes.push(body);return route.fulfill({status:403,json:{error:'Read-only QA; unintended write blocked'}});}
     try{
      assert.equal(body.owner,owner);assert.equal(body.protocolVersion,'ask-cova-v4');
      assert.equal(req.headers().authorization,'Bearer synthetic-qa-token');
      assert.deepEqual(Object.keys(body).sort(),['action','owner','account','range','snapshotDigest','contextDigest','requestId','protocolVersion','conversation'].sort());
      const snapshot={version:'ask-cova-data-v1',owner,workspaceRevision:1,workspaceRecords:scenarioCloud,passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}};
      const catalog=await core.buildAskCovaDataContext({snapshot,account:body.account,range:body.range,conversation:body.conversation});
      assert.equal(body.contextDigest,catalog.contextDigest,'Shared core recomputes digest from complete synthetic cloud snapshot');assert.equal(body.snapshotDigest,catalog.snapshotDigest);
      const plan={version:'ask-cova-query-plan-v1',decision:{kind:'query',queries:[{id:'summary',op:'aggregate',source:'trades',where:[],groupBy:[],measures:[{id:'net',op:'sum',field:'reported_pnl'},{id:'count',op:'count',field:null}],orderBy:[],mode:'complete',limit:32}]}};
      const result=await core.executeAskCovaQuery(catalog,plan),net=result.cells.find(c=>c.field==='net'),count=result.cells.find(c=>c.field==='count'),observation=result.observations[0],first=body.conversation.history.length===0;
      const answer={version:'ask-cova-answer-v2',paragraphs:[{text:(first?'Your saved net result is ':'For this saved view, the net result is ')+'{{f:'+net.id+'}} across {{f:'+count.id+'}} records.'+(state.longReply?' Review the saved trades and notes for context.'.repeat(14):''),evidence:[observation.id]}],detail:[{text:first?'These are saved reported results, not live broker balances.':'This is a descriptive saved-data summary, not a forecast.',evidence:[observation.id]}]};
      const rendered=core.renderAskCovaQueryAnswer(result,answer);assert(rendered);const reply={...rendered,answer:rendered.paragraphs.join(' '),detail:rendered.detail.join(' ')};
      state.asks.push({body,answer,reply});
      if(state.holdNextAsk){state.holdNextAsk=false;state.requestHeld=true;await new Promise(resolve=>{state.releaseHeld=resolve;});state.requestHeld=false;state.releaseHeld=null;}
      return route.fulfill({json:{status:'ok',aiResponseUsed:true,protocolVersion:'ask-cova-v4',requestId:body.requestId,snapshotDigest:catalog.snapshotDigest,contextDigest:catalog.contextDigest,plan,planDigest:result.planDigest,resultDigest:result.resultDigest,answer},headers:{'X-Cova-QA':'mock-provider-authored-answer-no-paid-call'}});
     }catch(error){report.failures.push({name:id+' mock boundary validation',detail:String(error)});return route.fulfill({status:409,json:{error:'Fixture shared-core validation failed'}});}
    }
    if(req.method()!=='GET'){state.writes.push({url:url.pathname,body:req.postData()});return route.fulfill({status:403,json:{error:'Read-only fixture'}});}
    if(url.pathname==='/api/auth/consent')return route.fulfill({json:{accepted:true}});
    return route.fulfill({status:200,json:{connected:false,accounts:[],available:false,status:'disconnected'}});
   }
   const routed=url.pathname.startsWith('/'+variant+'/')?url.pathname:`/${variant}${url.pathname}`;
   return route.continue({url:origin+routed+url.search});
  });
  const page=await context.newPage();state.page=page;
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>report.errors.push({id,error:e.message}));
  await page.clock.setFixedTime(new Date(stamp));
  await page.goto(origin+`/${variant}/#dashboard`);
  await page.locator('.astra-dashboard').waitFor({timeout:20000});
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('[data-toast-kind="sign-in"]').waitFor({state:'hidden',timeout:12000});
  if(!local)await page.waitForFunction(()=>document.body.innerText.includes('Saved to your account'),{},{timeout:10000}).catch(()=>{});
  await page.waitForTimeout(300);
  check(id+' actual Risk Desk route',new URL(page.url()).hash==='#dashboard'&&await page.getByRole('heading',{name:'Risk Desk',exact:true}).isVisible());
  check(id+' actual auth plan retained',await page.evaluate(()=>JSON.parse(localStorage.getItem('cova-auth-session-v1')).plan)===plan);
  // Approved relocation: full legacy workflows deliberately open the eligible launcher.
  if(variant==='enabled'&&!drawerMode&&!workspaceMode&&!process.argv.includes('--panel')&&!process.argv.includes('--visual'))await page.getByRole('button',{name:'Ask Cova',exact:true}).click();
  return state;
 }
 async function withWorkspace(page,action){
  const launcher=page.getByRole('button',{name:'Ask Cova',exact:true});
  const reopen=await launcher.count()>0&&await launcher.getAttribute('aria-expanded')==='true';
  if(await page.locator('#ask-cova-panel[aria-modal=true]').count())await page.getByRole('button',{name:'Close Ask Cova',exact:true}).click();
  await action();
  if(reopen&&await launcher.getAttribute('aria-expanded')!=='true')await launcher.click();
 }
 async function chooseAccount(page,account){await withWorkspace(page,()=>chooseAccountOriginal(page,account));}
 async function changeRange(page,label){await withWorkspace(page,()=>page.getByRole('button',{name:label,exact:true}).click());}
 async function finish(s){
  s.releaseHeld?.();
  const known=s.writes.filter(w=>w.url==='/api/passport'&&w.body===JSON.stringify({action:'plan',limits:{maxDailyLoss:2500,maxTradeLoss:1600,maxContracts:5,maxLossStreak:3},owner}));
  check(s.id+' no new writes beyond HEAD plan-sync attempt',s.writes.length===known.length&&known.length===(s.expectedPlanWrites ?? (s.local?0:1)),s.writes);
  check(s.id+' exact discovery count',s.capabilities.length===((s.variant==='enabled'||drawerMode||workspaceMode)?1:0),s.capabilities);
  report.requests.push({id:s.id,api:s.api,capabilities:s.capabilities,asks:s.asks,blockedBaselinePlanWrites:known});await s.context.close();save();
 }
 async function screenshot(s,label,selector){await s.page.mouse.move(0,0);await s.page.waitForTimeout(200);
 // Logo assets can finish after the route/font gate under concurrent browser load.
 // Require decoded visible images before strict byte parity; never relax that parity.
 await s.page.waitForFunction(()=>[...document.images].filter(i=>{const r=i.getBoundingClientRect();return i.checkVisibility()&&r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0;}).every(i=>i.complete&&i.naturalWidth>0));
 await s.page.evaluate(async()=>{await Promise.all([...document.images].filter(i=>i.complete&&i.naturalWidth>0).map(i=>i.decode()));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
 // A route may commit before the inert nav plate's motion frame; assert settled geometry before byte parity.
 await s.page.waitForFunction(()=>{const nav=document.querySelector('.cova-gooey-sidebar');if(!nav||!nav.checkVisibility())return true;const active=nav.querySelector('[aria-current="page"]'),plate=nav.querySelector('.cova-gooey-plate');if(!active)return !plate;if(!plate)return false;const a=active.getBoundingClientRect(),b=plate.getBoundingClientRect();return Math.abs(a.x-b.x)<1&&Math.abs(a.y-b.y)<1&&Math.abs(a.width-b.width)<1&&Math.abs(a.height-b.height)<1;},{},{timeout:10000});
 const name=s.id+'-'+label+'.png';if(selector)await s.page.locator(selector).screenshot({path:path.join(out,name),style:'#qa-disclosure{visibility:hidden!important}'});else {await s.page.evaluate(()=>scrollTo(0,0));await s.page.screenshot({path:path.join(out,name),fullPage:true,style:'#qa-disclosure{visibility:hidden!important}'});if(['default','answer','closed','populated','navigation'].includes(label)){const view=s.id+'-'+label+'-viewport.png';await s.page.screenshot({path:path.join(out,view),style:'#qa-disclosure{visibility:hidden!important}'});report.screenshots.push(view);}}report.screenshots.push(name);save();return name;}
 async function measure(s,label){
  const row=s.page.locator('.ask-cova-questions');
  if(await row.count() && !await s.page.locator('dialog[open]').count()){
   const prior=await row.evaluate(el=>({left:el.scrollLeft,y:scrollY})),reach=[];
   for(const button of await row.locator('button').all()){
    await button.scrollIntoViewIfNeeded();
    reach.push(await button.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {label:el.textContent,fits:r.left>=p.left-1&&r.right<=p.right+1&&el.scrollWidth<=el.clientWidth+1,hit:hit===el||el.contains(hit)};}));
   }
   check(s.id+' '+label+' every suggestion reachable by its scroll region',reach.every(x=>x.fits&&x.hit),reach);
   await row.evaluate((el,prior)=>{el.scrollLeft=prior.left;scrollTo(0,prior.y);},prior);
  }
  const value=await s.page.evaluate(()=>{
  const visible=el=>el.checkVisibility()&&el.getBoundingClientRect().width>0;
  const box=el=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el),p=getComputedStyle(el,'::after'),row=el.closest('.ask-cova-questions');const scrollRegion=row&&row.scrollWidth>row.clientWidth?row.getBoundingClientRect().toJSON():null;const icon=el.querySelector('svg')?.getBoundingClientRect();const sendHitExtension=el.getAttribute('aria-label')==='Send message'&&!el.textContent.trim()&&icon&&icon.left>=r.left&&icon.right<=r.right&&icon.top>=r.top&&icon.bottom<=r.bottom&&p.left==='-5px'&&p.right==='-5px';return {text:el.textContent.trim(),sendHitExtension:Boolean(sendHitExtension),left:r.left,right:r.right,width:r.width,height:r.height,scrollRegion,scrollOverflow:el.scrollWidth-el.clientWidth,font:c.fontSize,color:c.color,background:c.backgroundColor,border:c.borderColor,radius:c.borderRadius,shadow:c.boxShadow,outline:c.outline,after:{content:p.content,top:p.top,bottom:p.bottom,height:p.height}};};
  return {width:innerWidth,stats:[...document.querySelectorAll('dialog[open] .astra-stat-cell')].map(el=>{const v=el.querySelector('.astra-stat-value')?.getBoundingClientRect(),d=el.querySelector('.astra-stat-detail')?.getBoundingClientRect();return {text:el.textContent.trim(),detailWidth:d?.width,detailHeight:d?.height,overlap:!!v&&!!d&&Math.min(v.bottom,d.bottom)>Math.max(v.top,d.top)+1&&Math.min(v.right,d.right)>Math.max(v.left,d.left)+1};}),documentOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,buttons:[...document.querySelectorAll('[data-ask-cova] button,dialog[open] button,.astra-add-trade,.astra-import-action')].filter(visible).map(box),panel:[...document.querySelectorAll('[data-ask-cova],.ask-cova-reply,.ask-cova-consent,dialog[open]')].filter(visible).map(box),brokenImages:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src)};
 });report.measurements.push({id:s.id,label,...value});if(value.stats.length)check(s.id+' '+label+' summary text readable without overlap',value.stats.every(cell=>cell.detailWidth>=80&&!cell.overlap),value.stats);check(s.id+' '+label+' no document overflow',value.documentOverflow<=1,value.documentOverflow);check(s.id+' '+label+' panel content fits',value.panel.every(b=>b.scrollOverflow<=1),value.panel);check(s.id+' '+label+' buttons fit',value.buttons.every(b=>(b.scrollOverflow<=1||(b.sendHitExtension&&b.scrollOverflow===5))&&(b.scrollRegion ? b.width<=b.scrollRegion.width+1&&b.scrollRegion.left>=-1&&b.scrollRegion.right<=s.width+1 : b.left>=-1&&b.right<=s.width+1)));return value;}
 async function hitTargets(s,label){
  const controls=s.page.locator('[data-ask-cova] button');const metrics=[];
  for(let i=0;i<await controls.count();i++){
   const el=controls.nth(i);if(!await el.isVisible())continue;
   // Visibility of the 36px face alone does not put its 44px hit extension in the viewport.
   // Center before probing; keep both real elementFromPoint checks strict (no clipping/overlap exemption).
   await el.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
   const metric=await el.evaluate(el=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el),pseudo=getComputedStyle(el,'::after');const h=pseudo.content!=='none'?Math.max(r.height,parseFloat(pseudo.height)||0):r.height;const center=r.left+r.width/2;const hit=y=>{const t=document.elementFromPoint(center,y);return !!t&&(t===el||el.contains(t));};return {text:el.textContent.trim(),paintedHeight:r.height,effectiveHeight:h,topHit:hit(r.top-3),bottomHit:hit(r.bottom+3),font:c.fontSize};});metrics.push(metric);
  }
  report.measurements.push({id:s.id,label:label+'-hit-targets',metrics});
  if(s.width<=768)check(s.id+' '+label+' actual 44px touch surfaces',metrics.every(m=>m.effectiveHeight>=44&&(m.paintedHeight>=44||(m.topHit&&m.bottomHit))),metrics);
  const primary=metrics.filter(m=>['Review my results','Explain my drawdown','What stands out?','Show trades'].includes(m.text));check(s.id+' '+label+' compact 36px Risk Desk button faces',primary.every(m=>m.paintedHeight===36),primary);
 }
 async function ask(s,name='Review my results'){
  const p=s.page,before=s.asks.length,beforeAnswers=await p.locator('[data-cova-answer]').count();
  await p.getByRole('button',{name,exact:true}).click();
  check(s.id+' deliberate action has no extra consent prompt',await p.getByRole('button',{name:'Use AI for this review',exact:true}).count()===0);
  await p.waitForFunction(count=>document.querySelectorAll('[data-cova-answer]').length===count,beforeAnswers+1,{timeout:10000});
  const reply=s.asks.at(-1)?.reply;
  check(s.id+' answer matches checked shared core',s.asks.length===before+1&&reply&&await p.locator('[data-cova-answer]').nth(beforeAnswers).innerText()===reply.answer);
  return reply;
 }
 async function evidence(s,reply,label,{opener=s.page.getByRole('button',{name:'Show trades',exact:true}),alreadyOpen=false}={}){const p=s.page;const show=opener;if(!alreadyOpen)await show.click();const dialog=p.getByRole('dialog',{name:'Trades behind this answer'});await dialog.waitFor();
  const ids=await dialog.locator('[data-history-trade]').evaluateAll(rows=>rows.map(r=>r.dataset.historyTrade).sort());
  check(s.id+' '+label+' exact evidence IDs',JSON.stringify(ids)===JSON.stringify([...reply.tradeIds].sort()),{expected:reply.tradeIds,actual:ids});
  check(s.id+' evidence no broad-scope label',!(await dialog.innerText()).includes('All dates'));
  check(s.id+' '+label+' no unrelated summary metrics',await dialog.locator('.astra-stat-cell').count()===0);
  await p.keyboard.press('Tab');const close=dialog.getByRole('button',{name:'Close trade history'});await close.focus();
  const focus=await close.evaluate(el=>{const style=getComputedStyle(el);return {active:document.activeElement===el,visible:el.matches(':focus-visible'),outline:style.outline,shadow:style.boxShadow,outlineStyle:style.outlineStyle,outlineWidth:style.outlineWidth,outlineColor:style.outlineColor};});
  check(s.id+' dialog keyboard focus visible',hasVisibleFocus(focus),focus);
  await p.keyboard.press('Shift+Tab');check(s.id+' dialog traps reverse Tab',await p.evaluate(()=>!!document.activeElement.closest('dialog[open]')));
  await measure(s,label+'-dialog');await screenshot(s,label+'-trades','dialog[open]');
  if(s.width<768){const region=dialog.getByRole('region',{name:'Trade history records'});await region.evaluate(el=>{el.scrollTop=el.scrollHeight;});const last=dialog.locator('[data-history-trade]').last();const reachable=await last.evaluate(el=>{const r=el.getBoundingClientRect(),parent=el.closest('.astra-history-scroll').getBoundingClientRect();return r.bottom<=parent.bottom+1&&r.bottom>parent.top;});check(s.id+' '+label+' mobile final record reachable by scroll',reachable);await screenshot(s,label+'-trades-bottom','dialog[open]');}
  await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});await p.waitForTimeout(50);
  check(s.id+' close restores '+(alreadyOpen?'composer':'Show trades')+' focus',await show.evaluate(el=>document.activeElement===el));
 }
 if(workspaceMode) {
  const {runWorkspaceChecks}=await import('./workspace-consistency-browser.mjs');
  await runWorkspaceChecks({open,finish,check,screenshot,report,out});
 } else if(drawerMode) {
  const {runDrawerChecks}=await import('./workspace-drawer-browser.mjs');
  await runDrawerChecks({open,finish,check,screenshot,report,out});
 } else if(process.argv.includes('--visual')) {
  const {runVisualChecks}=await import('./ask-cova-visual-browser.mjs');
  await runVisualChecks({open,finish,check,screenshot,measure,ask,report,out});
 } else if(process.argv.includes('--panel')) {
  const {runPanelChecks}=await import('./ask-cova-panel-browser.mjs');
  await runPanelChecks({open,finish,check,screenshot,measure,ask,report,out});
 } else {
 for(const width of [1440,768,390,320]){
  let s;try{
   s=await open({width});const p=s.page;
   const preset=p.getByRole('button',{name:'Review my results',exact:true});
   await p.waitForFunction(()=>!document.querySelector('.ask-cova-questions button')?.disabled,{},{timeout:15000});
   check(s.id+' saved cloud readiness via actual hook',await preset.isEnabled()&&s.api.some(r=>r.url==='/api/workspace'&&r.method==='GET'));
   await measure(s,'default');await hitTargets(s,'default');await screenshot(s,'default');
   if(width<=768){await preset.scrollIntoViewIfNeeded();const b=await preset.boundingBox();if(width<768)await p.touchscreen.tap(b.x+b.width/2,b.y-3);else await p.mouse.click(b.x+b.width/2,b.y-3);await p.locator('[data-cova-answer]').waitFor();check(s.id+' outside painted face dispatches exactly once',s.asks.length===1);await p.getByRole('button',{name:'Clear conversation',exact:true}).click();check(s.id+' clear makes no request',s.asks.length===1);}
   await p.keyboard.press('Tab');await preset.focus();
   const focus=await preset.evaluate(el=>{const style=getComputedStyle(el);return {active:document.activeElement===el,visible:el.matches(':focus-visible'),shadow:style.boxShadow,outline:style.outline,outlineStyle:style.outlineStyle,outlineWidth:style.outlineWidth,outlineColor:style.outlineColor};});check(s.id+' preset keyboard indicator',hasVisibleFocus(focus),focus);
   await screenshot(s,'focus','[data-ask-cova]');
   const beforeKeyboard=s.asks.length;await preset.press('Enter');await p.locator('[data-cova-answer]').waitFor({timeout:10000});
   check(s.id+' keyboard starter dispatches exactly once without consent',s.asks.length===beforeKeyboard+1&&await p.getByRole('button',{name:'Use AI for this review',exact:true}).count()===0);
   await screenshot(s,'direct-action','[data-ask-cova]');
   const reply=s.asks.at(-1).reply;check(s.id+' initial result is exact',await p.locator('[data-cova-answer]').innerText()===reply.answer,reply);
   await measure(s,'answer');await hitTargets(s,'answer');await screenshot(s,'answer');
   const calls=s.asks.length;await p.getByRole('button',{name:'Tell me more',exact:true}).click();check(s.id+' precomputed authored detail no second request',await p.locator('[data-cova-detail]').innerText()===reply.detail&&s.asks.length===calls);
   await screenshot(s,'expanded','[data-ask-cova]');await evidence(s,reply,'all');
   await changeRange(p,'Latest session');check(s.id+' date invalidates answer and detail',await p.locator('[data-cova-answer],[data-cova-detail]').count()===0);
   const latest=await ask(s);check(s.id+' latest scope one exact trade',JSON.stringify(latest.tradeIds)===JSON.stringify(['manual-app-a-3']));await evidence(s,latest,'latest');
   await changeRange(p,'Last 7 days');check(s.id+' week invalidates answer',await p.locator('[data-cova-answer]').count()===0);const week=await ask(s,'Explain my drawdown');check(s.id+' week uses inclusive seven-calendar-day window',week.tradeIds.length===3);await screenshot(s,'drawdown','[data-ask-cova]');
   await chooseAccount(p,other);check(s.id+' account invalidates answer',await accountValue(p)===other&&await p.locator('[data-cova-answer]').count()===0);
   const second=await ask(s,'What stands out?');check(s.id+' second account excludes first account',second.tradeIds.length>0&&second.tradeIds.every(id=>id.startsWith('manual-app-b-')));await evidence(s,second,'second-account');
   await p.getByRole('button',{name:'Clear conversation',exact:true}).click();check(s.id+' clear removes answer and detail',await p.locator('[data-cova-answer],[data-cova-detail]').count()===0);
   const saved=await p.evaluate(owner=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)),owner);check(s.id+' all original trades unchanged',JSON.stringify(saved.trades)===JSON.stringify(trades));
  }catch(error){check(`enabled-${width} completed workflow`,false,String(error));if(s){writeFileSync(path.join(out,s.id+'-failure.txt'),await s.page.locator('body').innerText());await screenshot(s,'failure');}}
  finally{if(s)await finish(s);}
 }
 // Independent typed-thread scenarios: failures here never skip the legacy scope/currency/parity cases.
 async function sendTyped(s,text,{touch=false,enter=false}={}){
  const composer=s.page.getByRole('textbox',{name:/^Message Cova$/i}),send=s.page.getByRole('button',{name:/^Send message$/i});
  await composer.fill('');
  if(touch){await composer.scrollIntoViewIfNeeded();const b=await composer.boundingBox();await s.page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);check(s.id+' trusted touch focuses composer',await composer.evaluate(el=>document.activeElement===el));await s.page.keyboard.type(text);}
  else await composer.fill(text);
  if(enter)await composer.press('Enter');
  else if(touch){await send.scrollIntoViewIfNeeded();const b=await send.boundingBox();const hit=await send.evaluate(el=>{const r=el.getBoundingClientRect(),pseudo=getComputedStyle(el,'::after');const effectiveHeight=pseudo.content!=='none'?Math.max(r.height,parseFloat(pseudo.height)||0):r.height;const hits=y=>{const target=document.elementFromPoint(r.left+r.width/2,y);return !!target&&(target===el||el.contains(target));};return {width:r.width,paintedHeight:r.height,effectiveHeight,topHit:hits(r.top-3),bottomHit:hits(r.bottom+3)};});check(s.id+' send actual 44px touch surface',hit.width>=44&&hit.effectiveHeight>=44&&(hit.paintedHeight>=44||(hit.topHit&&hit.bottomHit)),hit);await s.page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}
  else await send.click();
 }
 for(const width of [1440,768,390,320]){let s;try{
  s=await open({width,scenario:'thread'});const p=s.page,panel=p.locator('[data-ask-cova]');
  const composer=p.getByRole('textbox',{name:/^Message Cova$/i}),send=p.getByRole('button',{name:/^Send message$/i});
  if(!check(s.id+' named composer and send control exist',await composer.count()===1&&await send.count()===1))throw Error('Threaded/composer UI contract not yet present in built source');
  await p.waitForFunction(()=>{const el=document.querySelector('[data-ask-cova] textarea');return el&&!el.disabled;},{},{timeout:15000});
  check(s.id+' composer 500-character limit',await composer.getAttribute('maxlength')==='500');
  check(s.id+' three presets and one Cova heading',await panel.locator('.ask-cova-questions button').count()===3&&await panel.getByRole('heading',{name:/^(Ask )?Cova$/i}).count()===1);
  check(s.id+' empty composer cannot send',await send.isDisabled());
  check(s.id+' composer follows presets in DOM',await composer.evaluate(el=>Boolean(document.querySelector('.ask-cova-questions').compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)));
  await p.keyboard.press('Tab');await composer.focus();
  const focus=await composer.evaluate(el=>{const c=getComputedStyle(el);return {active:document.activeElement===el,visible:el.matches(':focus-visible'),outline:c.outline,outlineStyle:c.outlineStyle,outlineWidth:c.outlineWidth,outlineColor:c.outlineColor};});
  check(s.id+' composer visible keyboard focus',hasVisibleFocus(focus),focus);
  await screenshot(s,'composer-focus','[data-ask-cova]');await screenshot(s,'default');
  check(s.id+' mount focus and typing do not dispatch',s.asks.length===0);
  s.holdNextAsk=true;await sendTyped(s,'how did i do?',{touch:width<768});
  const consent=p.getByRole('button',{name:'Use AI for this review',exact:true});
  check(s.id+' deliberate Send has no extra consent prompt',await consent.count()===0);
  const deadline=Date.now()+10000;while(!s.requestHeld&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
  assert(s.requestHeld,'Mock response is genuinely held for typing-state evidence');
  check(s.id+' held request has visible checking status',await panel.getByRole('status').filter({hasText:/checking/i}).isVisible());
  check(s.id+' pending response not fabricated',await p.locator('[data-cova-answer]').count()===0);
  check(s.id+' pending composer cannot duplicate send',await send.isDisabled());
  await screenshot(s,'typing','[data-ask-cova]');s.releaseHeld();
  await p.locator('[data-cova-answer]').waitFor();const first=s.asks[0].reply;
  check(s.id+' typed result exact and actual message forwarded',s.asks.length===1&&!Object.hasOwn(s.asks[0].body,'question')&&await p.locator('[data-cova-answer]').innerText()===first.answer&&s.asks[0].body.conversation.message==='how did i do?'&&s.asks[0].body.conversation.history.length===0);
  check(s.id+' sent composer cleared',await composer.inputValue()==='');
  await screenshot(s,'answer');
  await sendTyped(s,'explain my drawdown');
  await p.waitForFunction(()=>document.querySelectorAll('[data-cova-answer]').length===2,{},{timeout:10000});const second=s.asks[1].reply;
  const replies=p.locator('[data-cova-reply]');
  check(s.id+' exactly two preserved replies for two requests',s.asks.length===2&&await replies.count()===2&&!Object.hasOwn(s.asks[1].body,'question')&&JSON.stringify(await p.locator('[data-cova-answer]').allInnerTexts())===JSON.stringify([first.answer,second.answer]));
  check(s.id+' distinct per-answer content prevents latest-reply aliasing',first.answer!==second.answer&&first.detail!==second.detail,{first,second});
  check(s.id+' consent remains absent in same scope',await consent.count()===0);
  check(s.id+' persistent reply buttons are individually present',await replies.nth(0).getByRole('button',{name:'Show trades',exact:true}).count()===1&&await replies.nth(1).getByRole('button',{name:'Show trades',exact:true}).count()===1);
  check(s.id+' composer remains after thread in DOM',await composer.evaluate(el=>Boolean(document.querySelector('[data-cova-reply]').compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)));
  await measure(s,'thread');await hitTargets(s,'thread');await screenshot(s,'thread');await screenshot(s,'thread-panel','[data-ask-cova]');
  let calls=s.asks.length;
  await sendTyped(s,'which trades?',{enter:true});await evidence(s,second,'typed-current',{opener:composer,alreadyOpen:true});
  check(s.id+' typed evidence adds no AI call or answer',s.asks.length===calls&&await replies.count()===2);
  await evidence(s,first,'earlier-reply',{opener:replies.nth(0).getByRole('button',{name:'Show trades',exact:true})});
  check(s.id+' earlier evidence adds no AI request',s.asks.length===calls);
  // Follow-ups are appended exchanges, not nested inside their originating reply.
  // Check exact cardinality and ordered deterministic content, never hide duplicates with last().
  await replies.nth(0).getByRole('button',{name:'Tell me more',exact:true}).click();
  await p.locator('[data-cova-detail]').waitFor();
  check(s.id+' earlier reply detail belongs to earlier answer',JSON.stringify(await p.locator('[data-cova-detail]').allInnerTexts())===JSON.stringify([first.detail])&&s.asks.length===calls);
  await sendTyped(s,'tell me more');await p.waitForFunction(()=>document.querySelectorAll('[data-cova-answer]').length===3,{},{timeout:10000});
  check(s.id+' typed detail forwards actual message with latest successful context',s.asks.length===calls+1&&s.asks.at(-1).body.conversation.message==='tell me more'&&!Object.hasOwn(s.asks.at(-1).body,'question')&&s.asks.at(-1).body.conversation.history.length===4);
  await replies.nth(2).getByRole('button',{name:'Tell me more',exact:true}).click();
  check(s.id+' bound current detail remains local and exact',JSON.stringify(await p.locator('[data-cova-detail]').allInnerTexts())===JSON.stringify([first.detail,second.detail])&&s.asks.length===calls+1);
  for(const text of ['unknown question PRIVATE-LOCAL-MARKER','should I buy NQ?']){
   const before=s.asks.length;
   await sendTyped(s,text);
   await p.waitForFunction(count=>document.querySelectorAll('[data-cova-answer]').length===count,before+1,{timeout:10000});
   check(s.id+' arbitrary actual message reaches synthetic transport: '+text,s.asks.length===before+1&&s.asks.at(-1).body.conversation.message===text);
   check(s.id+' arbitrary message is not blocked by canned local rejection: '+text,await panel.locator('[data-cova-local]').count()===1&&await replies.count()===before+1);
  }
  calls=s.asks.length;
  check(s.id+' authorized typed chat forwarded but raw journal notes and local evidence action excluded',!JSON.stringify(s.asks.map(a=>a.body)).includes('Synthetic private note')&&!s.asks.some(a=>a.body.conversation.history.some(m=>m.content==='which trades?')));
  await screenshot(s,'thread-context','[data-ask-cova]');
  await composer.fill('unsent local draft');await changeRange(p,'Latest session');
  check(s.id+' date clears whole thread draft detail and local help',await p.locator('[data-cova-reply],[data-cova-detail],[data-cova-local]').count()===0&&await composer.inputValue()==='');
  check(s.id+' changing date alone never asks',s.asks.length===calls);
  await sendTyped(s,'how did i do?');await p.locator('[data-cova-answer]').waitFor();check(s.id+' deliberate date-scoped Send asks once',s.asks.length===calls+1);
  await chooseAccount(p,other);check(s.id+' changing account clears without asking',s.asks.length===calls+1&&await p.locator('[data-cova-answer]').count()===0);await sendTyped(s,'what stands out?');
  await p.locator('[data-cova-answer]').waitFor();const scoped=s.asks.at(-1).reply;
  check(s.id+' new account reply never reuses prior thread',await p.locator('[data-cova-answer]').count()===1&&scoped.tradeIds.length>0&&scoped.tradeIds.every(id=>id.startsWith('manual-app-b-')));
  await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
  check(s.id+' clear removes entire conversation and draft',await p.locator('[data-cova-answer],[data-cova-detail],[data-cova-local]').count()===0&&await composer.inputValue()==='');
  check(s.id+' clear never auto-asks',s.asks.length===calls+2);
  await sendTyped(s,'how did i do?');await p.locator('[data-cova-answer]').waitFor();check(s.id+' deliberate Send after clear asks once',s.asks.length===calls+3);await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 }catch(error){check(`thread-${width} completed workflow`,false,String(error));if(s){s.releaseHeld?.();writeFileSync(path.join(out,s.id+'-failure.txt'),await s.page.locator('body').innerText());await screenshot(s,'failure');}}
 finally{if(s)await finish(s);}}
 // Additional synthetic foreign-currency evidence case, never broker connected.
 for(const width of [1440,390]){let s;try{s=await open({width,euro:true});await chooseAccount(s.page,euroAccount);await s.page.waitForFunction(()=>!document.querySelector('.ask-cova-questions button')?.disabled,{},{timeout:15000});const reply=await ask(s);check(s.id+' EUR brief retains source currency',reply.answer.includes('EUR 12.50'));await s.page.getByRole('button',{name:'Show trades',exact:true}).click();const dialog=s.page.getByRole('dialog',{name:'Trades behind this answer'});await dialog.waitFor();const pnl=await dialog.locator('[data-history-field="pnl"]').innerText(),risk=await dialog.locator('[data-history-field="risk"]').innerText();check(s.id+' EUR evidence never relabeled USD',pnl.includes('EUR')&&!pnl.includes('$')&&risk.includes('EUR')&&!risk.includes('$'),{pnl,risk});await measure(s,'eur-evidence');await screenshot(s,'eur-evidence','dialog[open]');await s.page.keyboard.press('Escape');}catch(error){check(`EUR-${width} completed`,false,String(error));}finally{if(s)await finish(s);}}
 // Storage gate is actual local mode; no fake ready prop or mock Dashboard.
 for(const plan of ['free','pro']){const s=await open({plan,local:true,width:390});try{check(s.id+' browser-only gate disables all presets',await s.page.locator('.ask-cova-questions button:disabled').count()===3);const composer=s.page.getByRole('textbox',{name:/^Message Cova$/i}),send=s.page.getByRole('button',{name:/^Send message$/i});check(s.id+' browser-only gate disables composer and send',await composer.count()===1&&await send.count()===1&&await composer.isDisabled()&&await send.isDisabled());check(s.id+' browser-only explanation',await s.page.getByText('Save your account workspace before asking Cova.',{exact:true}).isVisible());await screenshot(s,'gate');check(s.id+' browser gate never asks',s.asks.length===0);}finally{await finish(s);}}
 // Fresh documents, same clock/fonts/sample data. HEAD reference loads real old components.
 for(const plan of ['free','pro'])for(const width of [1440,768,390,320]){
  let baseline,disabled,enabled;
  try{
   baseline=await open({variant:'baseline',plan,width});disabled=await open({variant:'disabled',plan,width});
   check(disabled.id+' disabled build has no Ask Cova',await disabled.page.locator('[data-ask-cova]').count()===0);
   const a=await screenshot(baseline,'default'),b=await screenshot(disabled,'default');
   const equal=readFileSync(path.join(out,a)).equals(readFileSync(path.join(out,b)));
   // v2 intentionally changes Risk Desk even with Ask disabled. Preserve data and navigation, not the rejected boxed pixels.
   const selectors=['.oa-discipline','.trading-calendar'];
   for(const selector of selectors)check(disabled.id+' preserved content '+selector,await baseline.page.locator(selector).innerText()===await disabled.page.locator(selector).innerText());
   for(const selector of ['.astra-stats-panel .astra-stat-value','.astra-stats-panel .astra-stat-label'])check(disabled.id+' all headline/average metric fields preserved '+selector,JSON.stringify(await baseline.page.locator(selector).allTextContents())===JSON.stringify(await disabled.page.locator(selector).allTextContents()));
   check(disabled.id+' journal note retained',await baseline.page.getByRole('textbox',{name:'Journal note',exact:true}).inputValue()===await disabled.page.getByRole('textbox',{name:'Journal note',exact:true}).inputValue());
   for(const name of ['Attach trade','Save note'])check(disabled.id+' journal action retained '+name,await baseline.page.getByRole('button',{name,exact:true}).isEnabled()===await disabled.page.getByRole('button',{name,exact:true}).isEnabled());
   const beforeRows=await baseline.page.locator('[data-recent-trade]').evaluateAll(els=>els.map(el=>el.dataset.recentTrade));
   check(disabled.id+' retained recent trade identities',JSON.stringify(beforeRows)===JSON.stringify(await disabled.page.locator('[data-recent-trade]').evaluateAll(els=>els.map(el=>el.dataset.recentTrade))));
   if(width>=851){await disabled.page.getByRole('button',{name:'Open workspace menu',exact:true}).click();check(disabled.id+' navigation content retained behind approved compact menu',await baseline.page.locator('.workspace-sidebar').innerText()===await disabled.page.locator('.workspace-sidebar').innerText());await screenshot(disabled,'workspace-menu','.workspace-menu-dialog');await disabled.page.keyboard.press('Escape');}
   report.comparisons.push({plan,width,baseline:a,disabled:b,byteIdentical:equal,approvedDifference:'Seamless v3 measured Risk Desk frame, collapsed navigation, actual recent table fields, metric disclosure and journal preview; all financial fields and navigation preserved separately'});
   // Existing plan-specific Rules and Insights UI remain exactly as HEAD; do not trigger paid upgrades.
   if(width===1440||width===390){
    enabled=await open({variant:'enabled',plan,width});
    await enabled.page.waitForFunction(()=>!document.querySelector('.ask-cova-questions button')?.disabled,{},{timeout:15000});
    const reply=await ask(enabled);check(enabled.id+' Ask works for existing '+plan+' plan',!!reply);
    for(const route of ['rules','coach','import']){
     for(const s of [baseline,enabled]){await s.page.evaluate(route=>{location.hash='#'+route;},route);await s.page.waitForTimeout(600);await s.page.evaluate(()=>document.fonts.ready);}
     const beforeText=await baseline.page.locator('#root').innerText(),afterText=await enabled.page.locator('#root').innerText();
     check(enabled.id+' '+route+' final destination',new URL(enabled.page.url()).hash==='#'+route);
     check(enabled.id+' existing '+plan+' '+route+' text unchanged',beforeText===afterText,{baseline:beforeText,candidate:afterText});
     const a=await screenshot(baseline,route),b=await screenshot(enabled,route);check(enabled.id+' '+route+' screenshot identical to HEAD',readFileSync(path.join(out,a)).equals(readFileSync(path.join(out,b))),{baseline:a,candidate:b});
    }
   }
  }catch(error){check(`${plan}-${width} parity/gates completed`,false,String(error));}
  finally{for(const s of [baseline,disabled,enabled])if(s)await finish(s);}
 }
 }
 check('No browser page errors',report.errors.length===0,report.errors);
 check('No external network attempts',report.externalBlocked.length===0,report.externalBlocked);
 report.completed=true;
 report.notes=['HEAD and candidate both automatically attempt one Passport plan-sync POST after cloud readiness. Every attempt was blocked with HTTP 403; no real plan was written. This is existing App behavior, not an Ask Cova write.','Original approved-integration evidence remains in ../ask-cova-evidence/app and is never written by this harness. Composer/thread scenarios are additive, not replacements for existing scope, currency, storage, touch and pixel-parity gates.','Typing screenshots are captured only while the real client awaits a deliberately held local mock response. No typing preview is fabricated.','Result and drawdown answers intentionally use the same four scoped IDs; distinct checked details additionally prove earlier-reply actions do not alias the latest answer.','sourceHashes and buildSourceHashes include transitive local canonical CSS/modules. Baseline source overrides remain only the original HEAD App/Dashboard/TradeHistory seams; no App or ownerCurrent replacement is introduced. Browser Enter/Shift+Enter/IME edge cases beyond this real-App flow belong to the separately owned component suite.'];
}catch(error){report.fatal=String(error);console.error(error);process.exitCode=1;}
finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));report.endSourceHashes={};for(const [file,hash] of Object.entries(report.sourceHashes)){const current=existsSync(path.join(root,file))?hashFile(path.join(root,file)):null;report.endSourceHashes[file]=current;const buildHashes=Object.fromEntries(Object.entries(report.buildSourceHashes).filter(([,files])=>file in files).map(([variant,files])=>[variant,files[file]]));check('Candidate stayed fixed: '+file,current===hash&&Object.entries(buildHashes).every(([variant,value])=>value===(variant==='baseline'?(report.baselineSourceHashes[file]??hash):hash)),{start:hash,end:current,builds:buildHashes});}save();}
writeFileSync(path.join(out,'README.md'),`# Ask Cova full-App QA\n\n${report.disclosure}\n\nSource base: ${report.base}. Source hashes and exhaustive assertions: results.json.\n\nSample account A: four manual self-reported net USD trades (825, -275, 450, 350), October 20/24/28/30 2026. Sample account B: -900 and 75 USD, October 20/24 2026. Synthetic private notes retained locally and never included in Ask request.\n\nViewports: desktop 1440, tablet 768, phone 390, narrow 320. Screenshots use real src/main.tsx and canonical CSS from a production-mode Vite fixture with envDir:false. Disabled comparison references HEAD App/Dashboard/TradeHistory source with identical isolation. No production code changed by this script.\n\nChecks: ${report.checks.length} passed; ${report.failures.length} failed. ${report.fatal||''}\n\nNo live backend, provider quality, actual billing, or release deployment is claimed. Fixture servers and browser are shut down after execution.\n`);
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const previews=[...new Set(report.screenshots)].filter(f=>f.startsWith('enabled-pro-saved-')).sort((a,b)=>{const width=f=>Number(f.match(/saved-(\d+)/)?.[1]);return width(b)-width(a)||a.localeCompare(b);});
writeFileSync(path.join(out,'preview.html'),`<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ask Cova — local mock QA previews</title><style>body{margin:24px;background:#111;color:#eee;font:16px/1.5 system-ui}h1{font-size:28px}p{max-width:1000px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:24px}figure{margin:0;background:#1b1b1b;padding:12px}img{display:block;max-width:100%;max-height:650px;margin:auto;object-fit:contain}figcaption{font-size:13px;overflow-wrap:anywhere}a{color:#b9caff}</style><h1>Ask Cova local QA previews</h1><p>${esc(report.disclosure)}</p><p>${report.checks.length} checks passed; ${report.failures.length} failed. Synthetic manual self-reported net USD: account A 825, −275, 450, 350; account B −900, 75. October 2026 dates. <a href="results.json">Detailed results</a></p><p>${esc((report.notes||[]).join(' '))}</p><main>${previews.map(f=>`<figure><a href="${esc(f)}"><img loading="lazy" src="${esc(f)}" alt="${esc(f)}"></a><figcaption>${esc(f)}</figcaption></figure>`).join('')}</main></html>`);
console.log(JSON.stringify({out,checks:report.checks.length,failures:report.failures,fatal:report.fatal,screenshots:report.screenshots.length},null,2));
if(report.failures.length||report.fatal)process.exitCode=1;
