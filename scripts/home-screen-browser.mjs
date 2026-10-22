// Isolated real components + synthetic Auth transport. Never contacts customer services.
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {workspaceBrowserOptions} from './workspace-browser-support.mjs';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve(process.env.HOME_SCREEN_OUT||'artifacts/home-screen');mkdirSync(out,{recursive:true});
const styles=[...readFileSync('src/main.tsx','utf8').matchAll(/import "([^"\n]+\.css)"/g)].map(m=>`import '${m[1].startsWith('.')?'/src/'+m[1].slice(2):m[1]}';`).join('\n');
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{HomeScreenInstall}from'/src/components/HomeScreenInstall.tsx';import{Dashboard}from'/src/components/DashboardView.tsx';import{analyze,sampleTrades,defaultRules}from'/src/lib/risk.ts';${styles}
function Fixture(){const[owner,setOwner]=React.useState('owner-a'),[eligible,setEligible]=React.useState(true);window.__setOwner=setOwner;window.__setEligible=setEligible;window.__owner=owner;return <div className='oa-dashboard-app'><button id='background-control'>Background action</button><input id='writing' aria-label='Active draft'/><Dashboard analysis={analyze(sampleTrades,defaultRules)} rules={defaultRules} go={()=>{}}/><HomeScreenInstall key={owner} owner={owner} eligible={eligible}/></div>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:4403,strictPort:true,hmr:false},cacheDir:'node_modules/.vite-home-screen',define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://auth.example.invalid'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('public-test')},plugins:[{name:'home-screen-qa',enforce:'pre',load(id){if(id.endsWith('/src/lib/supabaseClient.ts'))return `export const getSupabaseClient=()=>({auth:{getSession:async()=>({data:{session:{user:{id:window.__owner},access_token:window.__owner}}})}});`;if(id.endsWith('/__install-fixture.tsx'))return entry;},configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url==='/__install'){res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__install-fixture.tsx"></script>');}else next();});}}]});
let browser;const receipts=[];const states=new Map();
const ua='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
async function open({width=390,height=844,standalone=false,platform='ios',error=false}={}){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<851,hasTouch:width<851,userAgent:platform==='ios'?ua:platform==='android'?'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36':undefined,reducedMotion:'reduce'});
 await context.addInitScript(({standalone})=>Object.defineProperty(navigator,'standalone',{get:()=>standalone}),{standalone});
 const calls=[];await context.route('https://auth.example.invalid/**',async route=>{const req=route.request(),owner=req.headers().authorization?.replace('Bearer ','');calls.push({owner,method:req.method()});if(error)return route.fulfill({status:503,body:'Unavailable'});if(req.method()==='PUT')states.set(owner,{...states.get(owner),...req.postDataJSON().data});await route.fulfill({json:{id:owner,user_metadata:states.get(owner)||{}}});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4403/__install');await page.locator('.astra-dashboard').waitFor();return{context,page,calls,errors};
}
try{
 await server.listen();browser=await chromium.launch({...workspaceBrowserOptions,headless:true});
 const a=await open();await a.page.getByRole('dialog',{name:'Add Cova to Home Screen'}).waitFor({timeout:18000});
 assert.equal(await a.page.getByRole('button',{name:'Show me how',exact:true}).locator('svg.lucide-chevron-right').count(),1,'Instructions use a navigation chevron');
 assert.equal(await a.page.getByRole('button',{name:'Show me how',exact:true}).locator('svg.lucide-arrow-down-to-line').count(),0,'Instructions must not imply a download');
 await a.page.screenshot({path:out+'/390-offer.png'});await a.page.getByRole('button',{name:'Show me how',exact:true}).click();await a.page.getByText('Open as Web App',{exact:true}).waitFor();await a.page.screenshot({path:out+'/390-instructions.png'});
 assert(!(states.get('owner-a')||{}).cova_home_screen_seen,'Instruction click does not fabricate installation');
 await a.page.getByRole('button',{name:'Close install prompt'}).click();await a.page.waitForFunction(()=>!document.querySelector('dialog[open]'));await new Promise(r=>setTimeout(r,300));
 assert.equal(states.get('owner-a')?.cova_home_screen_dismissed,true);await a.page.reload();await a.page.waitForTimeout(9000);assert.equal(await a.page.locator('dialog[open]').count(),0);assert.deepEqual(a.errors,[]);await a.context.close();receipts.push('iPhone instructions; dismissal survives reload; no false install');
 states.clear();const installed=await open({standalone:true});await installed.page.waitForTimeout(1000);assert.equal(states.get('owner-a')?.cova_home_screen_seen,true);assert.equal(await installed.page.locator('dialog[open]').count(),0);await installed.context.close();
 const safari=await open();await safari.page.waitForTimeout(9000);assert.equal(await safari.page.locator('dialog[open]').count(),0);await safari.context.close();receipts.push('standalone launch confirmed; fresh Safari context suppressed through account metadata');
 states.clear();const android=await open({platform:'android',width:360,height:740});
 await android.page.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.__promptCalls=(window.__promptCalls||0)+1;};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e);});
 await android.page.getByRole('button',{name:'Install Cova',exact:true}).waitFor({timeout:18000});assert.equal(await android.page.getByRole('button',{name:'Install Cova',exact:true}).locator('svg.lucide-arrow-down-to-line').count(),1,'Native installation keeps its install icon');await android.page.screenshot({path:out+'/360-android.png'});await android.page.getByRole('button',{name:'Install Cova',exact:true}).click();assert.equal(await android.page.evaluate(()=>window.__promptCalls),1);assert.notEqual(states.get('owner-a')?.cova_home_screen_seen,true,'Accepted is not confirmed installed');
 await android.page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));await android.page.waitForTimeout(400);assert.equal(states.get('owner-a')?.cova_home_screen_seen,true);assert.equal(await android.page.locator('dialog[open]').count(),0);await android.context.close();receipts.push('Android native prompt; only appinstalled confirms installation');
 for(const scenario of ['desktop','offline','unsafe-workspace','writing','draft','other-dialog']){
  states.clear();const t=await open(scenario==='desktop'?{width:1440,platform:'desktop'}:scenario==='offline'?{error:true}:{});
  if(scenario==='unsafe-workspace')await t.page.evaluate(()=>window.__setEligible(false));
  if(scenario==='writing')await t.page.getByLabel('Active draft').fill('Still writing');
  if(scenario==='draft')await t.page.evaluate(()=>localStorage.setItem('cova-journal-draft-v1:qa:owner-a','{"note":"keep"}'));
  if(scenario==='other-dialog')await t.page.evaluate(()=>{const d=document.createElement('dialog');d.id='other-dialog';d.innerText='Existing modal';document.body.append(d);d.showModal();});
  await t.page.waitForTimeout(9000);assert.equal(await t.page.locator('.cova-install-sheet[open]').count(),0,scenario);assert.deepEqual(t.errors,[]);await t.context.close();receipts.push('suppressed: '+scenario);
 }
 states.clear();const short=await open({width:320,height:568});await short.page.getByRole('dialog',{name:'Add Cova to Home Screen'}).waitFor({timeout:18000});await short.page.getByRole('button',{name:'Show me how'}).click();
 assert(await short.page.locator('.cova-install-sheet').evaluate(e=>{const b=e.getBoundingClientRect();return b.x>=0&&b.right<=innerWidth&&b.y>=0&&b.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth+1;}));
 await short.page.screenshot({path:out+'/320-instructions.png'});await short.page.keyboard.press('Escape');assert.equal(await short.page.locator('dialog[open]').count(),0);await short.page.evaluate(()=>window.__setOwner('owner-b'));await short.page.getByRole('dialog',{name:'Add Cova to Home Screen'}).waitFor({timeout:18000});assert.equal(states.get('owner-b')?.cova_home_screen_dismissed,undefined);await short.context.close();receipts.push('short phone fit, Escape, owner isolation');
 console.log('PASS',receipts);writeFileSync(out+'/results.json',JSON.stringify(receipts,null,2));
}finally{if(browser)await browser.close();await server.close();}
