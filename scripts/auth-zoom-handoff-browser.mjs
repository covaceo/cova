// Actual AuthSheet submission in an isolated local-preview fixture, no customer auth.
// CDP supplies real retained page scale; this is not a native iOS autofill emulator.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {workspaceBrowserOptions} from './workspace-browser-support.mjs';
const out=path.resolve(process.env.AUTH_ZOOM_OUT||'artifacts/auth-zoom-handoff');mkdirSync(out,{recursive:true});
const styles=[...readFileSync('src/main.tsx','utf8').matchAll(/import "([^"\n]+\.css)"/g)].map(m=>`import '${m[1].startsWith('.')?'/src/'+m[1].slice(2):m[1]}';`).join('\n');
const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import{AuthSheet}from'/src/components/AuthPanels.tsx';${styles}
const forbidden=()=>{throw Error('No provider access in local-preview fixture');};
function Fixture(){const[mode,setMode]=React.useState(null),[signedIn,setSignedIn]=React.useState(false);return <main style={{minHeight:'1200px'}}><button id='opener' onClick={()=>setMode('login')}>Open sign in</button>{signedIn&&<h1 id='signed-in'>Signed-in fixture workspace</h1>}<AuthSheet authIntentKey='zoom-fixture' mode={mode} setMode={setMode} close={()=>setMode(null)} passwordRecovery={false} pendingPolicyConfirmation={false} onAuthenticated={()=>{setMode(null);setSignedIn(true)}} onAuthAttemptAborted={forbidden} onAuthSessionIsCurrent={forbidden} onAuthAttemptStarted={forbidden} onDiscardAuthSession={forbidden} onDeleteRestrictedAccount={forbidden} onDevPreview={forbidden} onDisconnectProviders={forbidden} onInspectProviders={forbidden} onPasswordRecovered={forbidden} onPolicyAccepted={forbidden} onUpdatePassword={forbidden}/></main>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
const fakeClient=`export const getSupabaseClient=()=>null;export const isSupabaseConfigured=()=>false;${['resendSupabaseSignupConfirmation','sendSupabaseLoginLink','sendSupabasePasswordReset','signInWithSupabasePassword','signUpWithSupabasePassword'].map(n=>`export const ${n}=()=>{throw Error('Forbidden provider transport')};`).join('')}`;
const origin='http://127.0.0.1:4406',meta='width=device-width, initial-scale=1.0';
const server=await createServer({configFile:false,envDir:out,cacheDir:'node_modules/.vite-auth-zoom',server:{host:'127.0.0.1',port:4406,strictPort:true,hmr:false},plugins:[{name:'auth-zoom-qa',enforce:'pre',load(id){if(id.endsWith('/src/lib/supabaseClient.ts'))return fakeClient;if(id.endsWith('/__zoom.tsx'))return fixture;},configureServer(v){v.middlewares.use((req,res,next)=>{if(req.url==='/__zoom'){res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="'+meta+'"><div id="root"></div><script type="module" src="/__zoom.tsx"></script>');}else next();});}}]});
const records=[],failures=[];let browser;
try{await server.listen();browser=await chromium.launch({...workspaceBrowserOptions,headless:true});
 for(const scenario of ['input-zoom','input-zoom-motion','cancel-zoom','normal','preexisting-zoom','manual-pinch','manual-after-focus','android','external-meta','reopen']){
  const context=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,reducedMotion:scenario==='input-zoom-motion'?'no-preference':'reduce',userAgent:scenario==='android'?'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/__zoom');await p.locator('#opener').waitFor();const cdp=await context.newCDPSession(p);
  if(scenario==='preexisting-zoom')await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.4});
  await p.locator('#opener').press('Enter');await p.locator('#auth-email').waitFor();
  await p.evaluate(()=>{window.__metaWrites=[];new MutationObserver(()=>window.__metaWrites.push(document.querySelector('meta[name=viewport]').content)).observe(document.querySelector('meta[name=viewport]'),{attributes:true});});
  await p.locator('#auth-email').fill('synthetic@example.invalid');await p.locator('#auth-password').fill('synthetic-test-only');
  if(scenario!=='normal'&&scenario!=='preexisting-zoom'){
   if(scenario==='manual-pinch'){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:400,id:1},{x:250,y:400,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.16});await p.waitForFunction(()=>visualViewport.scale>1.1);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  }
  if(scenario==='external-meta')await p.evaluate(()=>document.querySelector('meta[name=viewport]').content+=' , viewport-fit=cover');
  if(scenario==='manual-after-focus'){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:400,id:1},{x:250,y:400,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.4});await p.waitForFunction(()=>visualViewport.scale>1.3);}
  if(scenario==='input-zoom'){await p.locator('#auth-password').fill('short');await p.locator('#auth-password').press('Enter');await p.locator('#auth-password:invalid').waitFor();assert.equal(await p.evaluate(()=>window.__metaWrites.length),0);assert(await p.evaluate(()=>visualViewport.scale>1.1));await p.locator('#auth-password').fill('synthetic-test-only');}
  const before=await p.evaluate(()=>({scale:visualViewport.scale,visibleWidth:visualViewport.width}));
  if(scenario==='cancel-zoom')await p.keyboard.press('Escape');else await p.locator('#auth-password').press('Enter');
  await p.locator('.auth-overlay').waitFor({state:'detached'});if(scenario!=='cancel-zoom')await p.locator('#signed-in').waitFor();
  if(scenario==='reopen'){await p.locator('#opener').press('Enter');await p.locator('#auth-email').waitFor();}
  const shouldRestore=['input-zoom','input-zoom-motion','cancel-zoom'].includes(scenario);
  if(shouldRestore){try{await p.waitForFunction(()=>Math.abs(visualViewport.scale-1)<0.002&&document.querySelector('meta[name=viewport]').content==='width=device-width, initial-scale=1.0',null,{timeout:2200});}catch{failures.push(scenario+': retained input zoom was not restored');}}
  else await p.waitForTimeout(800); // Bounded negative observation: no late viewport mutation.
  const after=await p.evaluate(()=>({scale:visualViewport.scale,visibleWidth:visualViewport.width,inner:innerWidth,meta:document.querySelector('meta[name=viewport]').content,writes:window.__metaWrites,bodyPosition:document.body.style.position}));
  if(shouldRestore){if(Math.abs(after.visibleWidth-430)>1)failures.push(scenario+': viewport still clipped');if(after.writes.length!==2)failures.push(scenario+': expected one reversible scale pulse');}
  else if(Math.abs(after.scale-before.scale)>0.002||after.writes.length>(scenario==='external-meta'?1:0))failures.push(scenario+': unrelated/user zoom changed');
  if(after.meta!==(scenario==='external-meta'?meta+' , viewport-fit=cover':meta))failures.push(scenario+': viewport metadata not preserved');
  if(scenario!=='reopen'&&after.bodyPosition!=='')failures.push(scenario+': body lock leaked');
  if(errors.length)failures.push(scenario+': '+errors.join(';'));
  if(scenario==='input-zoom')await p.screenshot({path:out+'/after-sign-in.png'});
  records.push({scenario,before,after,errors});await context.close();
 }
 writeFileSync(out+'/results.json',JSON.stringify({records,failures,nativeIPhone:false},null,2));console.log(JSON.stringify({failures,records},null,2));assert.deepEqual(failures,[]);
}finally{await browser?.close();await server.close();}
