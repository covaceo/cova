// Real UI, isolated transport. Desktop WebKit is not native iPhone Safari.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium,webkit} from 'playwright';
import {workspaceBrowserOptions} from './workspace-browser-support.mjs';
const out=path.resolve(process.env.MOBILE_FIT_OUT||'artifacts/mobile-focus-fit');mkdirSync(out,{recursive:true});
const styles=[...readFileSync('src/main.tsx','utf8').matchAll(/import "([^"\n]+\.css)"/g)].map(m=>`import '${m[1].startsWith('.')?'/src/'+m[1].slice(2):m[1]}';`).join('\n');
const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import{AuthSheet}from'/src/components/AuthPanels.tsx';import{HomeScreenInstall}from'/src/components/HomeScreenInstall.tsx';${styles}
const forbidden=()=>{throw Error('No real authentication in visual fixture');};
function Fixture(){const[mode,setMode]=React.useState(null);return <main style={{minHeight:'1800px'}}><button id='opener' onClick={()=>setMode('login')}>Open sign in</button><AuthSheet authIntentKey='fit-fixture' mode={mode} setMode={setMode} close={()=>setMode(null)} passwordRecovery={new URLSearchParams(location.search).has('recovery')} pendingPolicyConfirmation={false} onAuthenticated={forbidden} onAuthAttemptAborted={()=>{}} onAuthSessionIsCurrent={forbidden} onAuthAttemptStarted={forbidden} onDiscardAuthSession={forbidden} onDeleteRestrictedAccount={forbidden} onDevPreview={forbidden} onDisconnectProviders={forbidden} onInspectProviders={forbidden} onPasswordRecovered={forbidden} onPolicyAccepted={forbidden} onUpdatePassword={forbidden}/>{location.search.includes('install')&&<HomeScreenInstall owner='fit-owner' eligible={true}/>}</main>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
const fakeClient=`export const getSupabaseClient=()=>({auth:{getSession:async()=>({data:{session:{user:{id:'fit-owner'},access_token:'synthetic-only'}}})}});export const isSupabaseConfigured=()=>false;${['resendSupabaseSignupConfirmation','sendSupabaseLoginLink','sendSupabasePasswordReset','signInWithSupabasePassword','signUpWithSupabasePassword'].map(name=>`export const ${name}=()=>{throw Error('Forbidden auth transport');};`).join('')}`;
const origin='http://127.0.0.1:4405';
const server=await createServer({configFile:false,envDir:out,cacheDir:'node_modules/.vite-mobile-focus-fit',server:{host:'127.0.0.1',port:4405,strictPort:true,hmr:false},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://fit.example.invalid'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('public-test')},plugins:[{name:'mobile-fit-qa',enforce:'pre',load(id){if(id.endsWith('/src/lib/supabaseClient.ts'))return fakeClient;if(id.endsWith('/__fit.tsx'))return fixture;},configureServer(v){v.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/__fit?')){res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/__fit.tsx"></script>');}else next();});}}]});
const records=[],failures=[];
function check(condition,label){if(!condition)failures.push(label);}
try{
 await server.listen();
 const engines=[['chromium',chromium,workspaceBrowserOptions],...(existsSync(webkit.executablePath())?[['webkit',webkit,{}]]:[])];
 for(const [name,engine,options]of engines){const browser=await engine.launch({...options,headless:true});try{
  for(const width of [390,320,1440]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:width<850,hasTouch:width<850,reducedMotion:'reduce',...(width<850?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}:{})});
   await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.request().url().startsWith('https://fit.example.invalid/')?r.fulfill({json:{id:'fit-owner',user_metadata:{}}}):r.abort());
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/__fit?auth');await page.locator('#opener').press('Enter');await page.getByRole('dialog',{name:'Sign in to Cova',exact:true}).waitFor();
   const metrics=async()=>page.evaluate(()=>({inner:innerWidth,root:document.documentElement.clientWidth,overflow:document.documentElement.scrollWidth-innerWidth,scale:visualViewport?.scale,bodyPosition:document.body.style.position,inputs:[...document.querySelectorAll('.auth-sheet input:not([type=checkbox])')].map(e=>({id:e.id,size:parseFloat(getComputedStyle(e).fontSize)}))}));
   const login=await metrics();check(login.inner===width&&login.overflow<=1,name+' login fit '+width);check(login.inputs.length===2,name+' login inputs');for(const i of login.inputs)check(width<850?i.size>=16:i.size===14,name+' '+width+' '+i.id+' input font '+i.size);
   await page.locator('.auth-sheet input[type=email]').click();await page.locator('.auth-sheet input[type=password]').click();await page.screenshot({path:out+'/'+name+'-'+width+'-login.png'});
   await page.locator('.auth-account-tab').filter({hasText:'Sign up'}).click();const signup=await metrics();for(const i of signup.inputs)check(width<850?i.size>=16:i.size===14,name+' signup font '+width);
   await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.auth-overlay').waitFor({state:'detached'});await page.waitForFunction(()=>document.activeElement?.id==='opener',null,{timeout:3000});const after=await metrics();check(after.bodyPosition===''&&after.inner===width&&after.overflow<=1,name+' restored layout '+width);check(await page.locator('#opener').evaluate(e=>document.activeElement===e),name+' return focus');
   await page.goto(origin+'/__fit?recovery');await page.locator('#opener').click();await page.locator('#confirm-password').waitFor();const recovery=await metrics();for(const i of recovery.inputs)check(width<850?i.size>=16:i.size===14,name+' recovery font '+width);
   if(width===390){await page.goto(origin+'/__fit?install');await page.locator('.cova-install-sheet[open]').waitFor({timeout:18000});const heading=await page.locator('#cova-install-title').evaluate(e=>({focused:document.activeElement===e,outline:getComputedStyle(e).outlineStyle,outlineWidth:getComputedStyle(e).outlineWidth}));check(heading.focused,name+' heading retains assistive focus');check(heading.outline==='none'||heading.outlineWidth==='0px',name+' no heading outline '+JSON.stringify(heading));await page.screenshot({path:out+'/'+name+'-install.png'});await page.keyboard.press('Tab');const focus=await page.evaluate(()=>({button:document.activeElement?.tagName,outline:getComputedStyle(document.activeElement).outlineStyle}));check(focus.button==='BUTTON'&&focus.outline!=='none',name+' keyboard button ring preserved');}
   check(errors.length===0,name+' runtime '+errors.join(';'));records.push({engine:name,width,login,signup,recovery,after,errors});await context.close();
  }
 }finally{await browser.close();}}
 writeFileSync(out+'/results.json',JSON.stringify({records,failures,nativeIPhone:false},null,2));console.log(JSON.stringify({engines:[...new Set(records.map(r=>r.engine))],failures},null,2));assert.deepEqual(failures,[]);
}finally{await server.close();}
