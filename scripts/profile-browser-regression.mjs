// Executed real-component UI tests. Synthetic repository fixture, not production verification.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
const output=process.env.PROFILE_EVIDENCE||join(tmpdir(),'cova-profile-browser');await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'cova-profile-'));
const styles=[...(await readFile('src/main.tsx','utf8')).matchAll(/import "([^"]+)";/g)].map(m=>m[1]).filter(n=>n.startsWith('@fontsource')||n.endsWith('.css')).map(n=>`import '${n.startsWith('./')?'/src/'+n.slice(2):n}';`).join('\n');
const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{UserProfileProvider}from'/src/components/UserProfile.tsx';import{WorkspaceShell}from'/src/components/WorkspaceShell.tsx';import{Navbar}from'/src/components/Navbar.tsx';import{Dashboard}from'/src/components/DashboardView.tsx';import{Passport}from'/src/components/WorkspaceSections.tsx';import{analyze,defaultRules,sampleTrades}from'/src/lib/risk.ts';${styles}
const repository=async()=>({load:async(owner)=>{await new Promise(r=>setTimeout(r,60));if(window.__failLoad)throw Error('network');return JSON.parse(localStorage.getItem('profile-fixture-'+owner)||'null')},save:async(owner,name,avatar)=>{await new Promise(r=>setTimeout(r,60));if(name.trim().toLowerCase().replace(/^@/,'')==='taken')throw Error('That username is already taken. Try another.');if(window.__failSave)throw Error('Your profile could not be saved. Please try again.');const old=JSON.parse(localStorage.getItem('profile-fixture-'+owner)||'null');const username=name.trim().toLowerCase().replace(/^@/,'');if(old&&old.username!==username&&Date.now()<Date.parse(old.username_changed_at)+14*86400000)throw Error('You can change your username once every 14 days.');const row={user_id:owner,username,avatar_data:avatar,username_changed_at:old?.username===username?old.username_changed_at:new Date().toISOString()};localStorage.setItem('profile-fixture-'+owner,JSON.stringify(row));return row;}});
function Fixture(){const [owner,setOwner]=useState('fixture-a');window.__switchOwner=setOwner;const[mobileOpen,setMobileOpen]=useState(false);const[passport,setPassport]=useState(false);window.__showPassport=()=>{setPassport(true);setMobileOpen(false)};const a=analyze(sampleTrades,defaultRules);const go=route=>window.__settingsRoute=route;const signOut=()=>window.__signedOut=true;const del=()=>window.__deleted=true;return <UserProfileProvider userId={owner} email="qa@example.test" repository={repository} requestPasswordReset={async email=>{window.__resetEmail=email;window.__resetCalls=(window.__resetCalls||0)+1;if(window.__failReset)throw Error('offline');if(window.__pauseReset)await new Promise(resolve=>window.__resolveReset=resolve);}}><div className="oa-dashboard-app"><Navbar section="dashboard" go={go} openAuth={()=>{}} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} authSession={{email:'qa@example.test'}} riskScore={a.score} signOut={signOut} deleteAccount={del}/><WorkspaceShell brokerLabel="Imported history" email="qa@example.test" section="dashboard" riskScore={a.score} go={go} signOut={signOut} deleteAccount={del}><>{passport?<Passport analysis={a} entitlements={{canExportPassport:true}} isSampleReview={true} go={go} upgradeToPro={()=>{}}/>:<Dashboard analysis={a} rules={defaultRules} go={go}/>}</></WorkspaceShell></div></UserProfileProvider>};createRoot(document.getElementById('root')).render(<Fixture/>);window.__documentId=crypto.randomUUID();`;
let server,chrome,ws;const errors=[],receipts=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 server=await createServer({envDir:profile,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'profile-fixture',resolveId(id){if(id==='/__profile.tsx')return id;},load(id){if(id==='/__profile.tsx')return entry;},configureServer(v){v.middlewares.use(async(req,res,next)=>{if(req.url!=='/__profile.html')return next();res.setHeader('Content-Type','text/html');res.end(await v.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/__profile.tsx"></script></body></html>'));});}}]});await server.listen();const port=server.httpServer.address().port;
 assert.equal((await fetch(`http://127.0.0.1:${port}/__profile.html`)).status,200);
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
 let debug;for(let i=0;i<100;i++){try{debug=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{}await sleep(100);}assert(debug);
 const tabs=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let seq=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const cb=pending.get(m.id);pending.delete(m.id);m.error?cb.reject(Error(m.error.message)):cb.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown'||m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
 const wait=async exp=>{for(let i=0;i<160;i++){if(await evaluate(exp))return;await sleep(75);}throw Error('Timeout '+exp);};
 const click=async(selector,text)=>{const p=await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.checkVisibility()&&(!${JSON.stringify(text||'')}||e.textContent.trim()===${JSON.stringify(text||'')}));if(!el)throw Error('Missing visible '+${JSON.stringify(selector+' '+(text||''))});el.scrollIntoView({block:'nearest',behavior:'instant'});const b=el.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await sleep(80);};
 const key=async(key,code)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:code});};
 const input=async value=>evaluate(`(()=>{const e=document.querySelector('#cova-username');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const capture=async name=>{
  assert.equal(await evaluate(`(()=>{const d=document.querySelector('dialog[open]');if(!d)return true;const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&d.scrollWidth<=d.clientWidth;})()`),true,name+' modal fits viewport without horizontal clipping');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,name+' root fits');
  await writeFile(join(output,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 };
 await send('Runtime.enable');await send('Page.enable');
 for(const[name,width,height,mobile]of[['desktop',1672,941,false],['laptop',1280,720,false],['mobile',390,844,true],['small-phone',360,800,true],['short-phone',390,640,true]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__profile.html`});await wait(`document.querySelector('.cova-profile-trigger') && document.fonts.status==='loaded' && !document.body.innerText.includes('Loading profile')`);
  if(mobile)await click('[aria-label="Toggle menu"]');
  await click('.cova-profile-trigger');await click('[role="menuitem"]','Edit profile');await wait(`Boolean(document.querySelector('dialog[open] #cova-username:not(:disabled)'))`);
  assert.deepEqual(await evaluate('[innerWidth,document.documentElement.clientWidth,Math.round(visualViewport.width)]'),[width,width,width]);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  assert.equal(await evaluate(`(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()`),true);
  await input('ab');await click('dialog button[type="submit"]');await wait(`document.querySelector('dialog [role="alert"]')?.textContent.includes('3–24')`);
  await input('TAKEN');await click('dialog button[type="submit"]');await wait(`document.querySelector('dialog [role="alert"]')?.textContent.includes('already taken')`);
  await input('Profile_QA');
  await evaluate(`(()=>{const c=document.createElement('canvas');c.width=500;c.height=400;const x=c.getContext('2d');x.fillStyle='#597da7';x.fillRect(0,0,500,400);x.fillStyle='#d4e2ed';x.beginPath();x.moveTo(0,400);x.lineTo(270,80);x.lineTo(500,400);x.fill();return new Promise(r=>c.toBlob(b=>{const d=new DataTransfer();d.items.add(new File([b],'profile-test.png',{type:'image/png'}));const e=document.querySelector('input[type="file"]');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));r(true);},'image/png'));})()`);
  await wait(`document.querySelector('dialog .cova-profile-avatar img')?.complete && !document.querySelector('dialog button[type="submit"]').disabled`);
  await capture(name+'-editor');await click('dialog button[type="submit"]');await wait(`!document.querySelector('dialog[open]') && [...document.querySelectorAll('.cova-profile-trigger')].some(e=>e.textContent.includes('@profile_qa'))`);
  const saved=await evaluate(`JSON.parse(localStorage.getItem('profile-fixture-fixture-a'))`);assert.equal(saved.username,'profile_qa');assert.match(saved.avatar_data,/^data:image\/jpeg;base64,/);assert.ok(saved.avatar_data.length<100000);
  await click('.cova-profile-trigger');await capture(name+'-menu');await click('[role="menuitem"]','Edit profile');
  assert.equal(await evaluate(`document.querySelector('#cova-username').readOnly`),true,'Username locks after save');
  assert.ok(await evaluate(`document.querySelector('#cova-username-help').textContent.includes('Next change')`));
  await click('#cova-username');await send('Input.insertText',{text:'blocked'});assert.equal(await evaluate(`document.querySelector('#cova-username').value`),'profile_qa');
  await capture(name+'-cooldown');await click('dialog button','Cancel');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('profile-fixture-fixture-a')).username`),'profile_qa');
  const doc=await evaluate('window.__documentId');await send('Page.reload');await wait(`window.__documentId!==${JSON.stringify(doc)} && document.querySelector('.cova-profile-trigger')?.textContent.includes('@profile_qa')`);
  if(mobile)await click('[aria-label="Toggle menu"]');
  assert.ok(await evaluate(`[...document.querySelectorAll('.cova-profile-avatar img')].some(e=>e.complete)`),'Saved photo survives reload');
  await click('.cova-profile-trigger');await click('[role="menuitem"]','Edit profile');await click('.cova-profile-remove-photo');await click('dialog button[type="submit"]');await wait(`!document.querySelector('dialog[open]')`);
  const photoOnly=await evaluate(`JSON.parse(localStorage.getItem('profile-fixture-fixture-a'))`);assert.equal(photoOnly.avatar_data,null);assert.equal(photoOnly.username_changed_at,saved.username_changed_at,'Photo changes do not reset cooldown');
  await click('.cova-profile-trigger');await click('[role="menuitem"]','Settings');await wait(`document.querySelector('dialog[open] [role=tablist]')!==null`);assert.equal(await evaluate(`document.querySelectorAll('dialog[open] [role=tab]').length`),3);await capture(name+'-settings-profile');
  await click('dialog [role=tab]','Profile');await key('ArrowRight',39);await wait(`document.querySelector('#cova-settings-tab-account').getAttribute('aria-selected')==='true'`);
  await wait(`document.querySelector('dialog[open]')?.innerText.includes('qa@example.test')`);
  await evaluate('window.__failReset=true');await click('dialog button','Send reset link');await wait(`document.querySelector('.cova-settings-sections [role=alert]')?.textContent.includes('Could not send')`);
  await evaluate('window.__failReset=false');await click('dialog button','Send reset link');await wait(`document.querySelector('.cova-settings-sections [role=status]')?.textContent.includes('Check your email')`);
  assert.equal(await evaluate('window.__resetEmail'),'qa@example.test');assert.equal(await evaluate('window.__resetCalls'),2);
  assert.equal(await evaluate(`document.querySelector('[data-reset-password]').disabled`),true,'No duplicate requests after success');
  await capture(name+'-settings-account');
  await click('dialog [role=tab]','Connections');await capture(name+'-settings-connections');await click('dialog button','Manage connections');await wait(`!document.querySelector('dialog[open]')`);assert.equal(await evaluate('window.__settingsRoute'),'import');
  if(mobile)await click('[aria-label="Toggle menu"]');
  await click('.cova-profile-trigger');await click('[role="menuitem"]','Settings');await click('dialog [role=tab]','Account');await click('dialog button','Sign out');await wait(`!document.querySelector('dialog[open]')`);assert.equal(await evaluate('window.__signedOut'),true);
  await click('.cova-profile-trigger');await click('[role="menuitem"]','Settings');await click('dialog [role=tab]','Account');await click('dialog .cova-settings-danger summary');await click('dialog [aria-label="Delete account"]');assert.equal(await evaluate('window.__deleted'),true);
  await click('.cova-profile-trigger');await click('[role="menuitem"]','Sign out');assert.equal(await evaluate('window.__signedOut'),true);
  await click('.cova-profile-trigger');await click('[role="menuitem"]','Edit profile');
  await evaluate(`window.__switchOwner('fixture-b')`);await wait(`!document.querySelector('dialog[open]') && !document.body.innerText.includes('@profile_qa') && !document.body.innerText.includes('Loading profile')`);
  assert.equal(await evaluate(`[...document.querySelectorAll('.cova-profile-avatar img')].length`),0,'owner switch clears prior photo');
  await click('.cova-profile-trigger');await click('[role="menuitem"]','Settings');await click('dialog [role=tab]','Account');
  await evaluate('window.__pauseReset=true');await click('dialog button','Send reset link');await wait(`typeof window.__resolveReset==='function'`);
  await evaluate(`window.__switchOwner('fixture-c')`);await wait(`!document.querySelector('dialog[open]')`);await evaluate('window.__resolveReset();window.__pauseReset=false');await wait(`!document.body.innerText.includes('Loading profile')`);
  assert.equal(await evaluate(`document.body.innerText.includes('Check your email')`),false,'Late reset completion cannot show on another identity');
  await evaluate(`window.__switchOwner('fixture-a');window.__showPassport()`);
  await wait(`document.querySelector('.passport-holo-identity')?.textContent==='@profile_qa'`);
  for(const mode of ['Flex','Discipline','Coach','Ghost']){
    await click('.passport-workspace-modes button',mode);
    assert.equal(await evaluate(`document.querySelector('.passport-holo-identity').textContent`),mode==='Ghost'?'Private profile':'@profile_qa');
  }
  await click('.passport-workspace-modes button','Flex');await capture(name+'-passport-username');
  if(name==='desktop'){
    const exports=join(output,'exports');await rm(exports,{recursive:true,force:true});await mkdir(exports,{recursive:true});
    await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:exports});
    await click('.passport-workspace-share');await wait(`document.querySelector('.passport-share-preview img')?.complete && !document.querySelector('.passport-share-save').disabled`);
    const options=await evaluate(`[...document.querySelector('#share-format').options].map(o=>o.value)`);assert.deepEqual(options,['card','feed','square','story']);
    for(const[id,width,height]of[['card',1672,941],['feed',1080,1350],['square',1080,1080],['story',1080,1920]]){
      await evaluate(`(()=>{const el=document.querySelector('#share-format');el.value=${JSON.stringify(id)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await wait(`document.querySelector('.passport-share-preview img')?.complete && !document.querySelector('.passport-share-save').disabled && document.querySelector('.passport-share-notice').textContent.includes('${width} × ${height}')`);
      await click('.passport-share-save');let file;
      for(let i=0;i<100;i++){file=(await readdir(exports)).find(n=>n.endsWith('-'+id+'.png'));if(file)break;await sleep(75);}assert(file,'Real PNG download '+id);
      const png=await readFile(join(exports,file));assert.equal(png.subarray(1,4).toString(),'PNG');assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[width,height]);
    }
    await click('[aria-label="Hide identity"]');await wait(`document.querySelector('.passport-share-preview img')?.complete && !document.querySelector('.passport-share-save').disabled`);
    const hidden=await evaluate(`(async()=>{const {captureShareSnapshot}=await import('/src/lib/passportShare.ts');return captureShareSnapshot(document.querySelector('.passport-card-face'),{hideIdentity:true,hideMarkets:false}).svg})()`);
    assert(!hidden.includes('profile_qa'),'Anonymous export removes username from all serialized SVG metadata');
    await capture('desktop-passport-anonymous-share');await click('.passport-share-save');
    let anonymous;for(let i=0;i<100;i++){anonymous=(await readdir(exports)).find(n=>n.includes('-anonymous-')&&n.endsWith('.png'));if(anonymous)break;await sleep(75);}assert(anonymous);
    await click('[aria-label="Close share composer"]');
  }
  await evaluate(`window.__switchOwner('fixture-b')`);await wait(`document.querySelector('.passport-holo-identity')?.textContent==='Username not set'`);
  assert.equal(await evaluate(`document.querySelector('.passport-holo-art').textContent.includes('@profile_qa')`),false,'Previous owner cannot remain in visible or accessible Passport');
  await evaluate(`localStorage.removeItem('profile-fixture-fixture-a');localStorage.removeItem('profile-fixture-fixture-b')`);
  receipts.push({passportUsername:true,passportGhostPrivacy:true,passportOwnerBound:true,settingsTabs:true,resetErrorRetry:true,resetOwnerBound:true,lateResetSuppressed:true,connectionsRoute:true,settingsSignOut:true,usernameCooldown:true,viewport:name,width,height,uniqueConflict:true,normalizedSave:true,photoReencoded:true,cancelPreserves:true,reloadPersistence:true,settingsDelete:true,signOut:true,ownerSwitch:true});
 }
 assert.deepEqual(errors,[]);await writeFile(join(output,'browser.json'),JSON.stringify({status:'passed',fixture:'synthetic repository; database checked separately',receipts,errors},null,2));console.log(JSON.stringify({status:'passed',receipts,output}));
}finally{ws?.close();if(chrome?.pid)try{execFileSync('taskkill.exe',['/PID',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});}
