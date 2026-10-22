// Actual Toast with the production styles. No auth or customer-data transport.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium,webkit} from 'playwright';
import {workspaceBrowserOptions} from './workspace-browser-support.mjs';
const out=path.resolve(process.env.SIGNIN_TOAST_OUT||'artifacts/signin-toast');mkdirSync(out,{recursive:true});
const styles=[...readFileSync('src/main.tsx','utf8').matchAll(/import "([^"\n]+\.css)"/g)].map(m=>`import '${m[1].startsWith('.')?'/src/'+m[1].slice(2):m[1]}';`).join('\n');
const original='Signed in. Account stats are unlocked.';
const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import{Toast}from'/src/components/Toast.tsx';${styles}
function Fixture(){const[t,setT]=React.useState({message:${JSON.stringify(original)},tone:'success'});return <main className='oa-dashboard-app' style={{minHeight:'100vh'}}><div style={{position:'fixed',bottom:24,left:24,display:'flex',gap:16}}><button id='signin' onClick={()=>setT({message:${JSON.stringify(original)},tone:'success'})}>Sign in notice</button><button id='warning' onClick={()=>setT({message:'Changes were not saved. Retry before leaving.',tone:'warning'})}>Warning notice</button><button id='info' onClick={()=>setT({message:'Workspace refreshed.',tone:'info'})}>Info notice</button><button id='dismiss' onClick={()=>setT(null)}>Dismiss</button></div><Toast toast={t}/></main>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
const origin='http://127.0.0.1:4408';
const server=await createServer({configFile:false,envDir:out,cacheDir:'node_modules/.vite-signin-toast',server:{host:'127.0.0.1',port:4408,strictPort:true,hmr:false},plugins:[{name:'toast-qa',enforce:'pre',load(id){if(id.endsWith('/__toast.tsx'))return fixture;},configureServer(v){v.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/__toast?')){res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><div id="root"></div><script type="module" src="/__toast.tsx"></script>');}else next();});}}]});
const records=[],failures=[],errors=[];const check=(condition,label)=>{if(!condition)failures.push(label);};
async function measure(p){return p.getByRole('status').evaluate(e=>{const surface=e.firstElementChild,b=surface.getBoundingClientRect(),s=getComputedStyle(surface);return{innerWidth,visibleWidth:visualViewport.width,left:b.left,right:b.right,width:b.width,height:b.height,centerError:Math.abs((b.left+b.right)/2-innerWidth/2),copy:surface.textContent,fontSize:parseFloat(s.fontSize),background:s.backgroundColor,backdropFilter:s.backdropFilter,overflow:document.documentElement.scrollWidth-innerWidth,transform:getComputedStyle(e).transform,filter:getComputedStyle(e).filter};});}
try{
 await server.listen();
 const engines=[['chromium',chromium,workspaceBrowserOptions],...(existsSync(webkit.executablePath())?[['webkit',webkit,{}]]:[])];
 for(const[name,engine,opts]of engines){const b=await engine.launch({...opts,headless:true});try{
  for(const width of [320,390,430,768,1440]){
   const c=await b.newContext({viewport:{width,height:844},isMobile:width<850,hasTouch:width<850,reducedMotion:'reduce'});await c.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
   await p.goto(origin+'/__toast?show');await p.getByRole('status').waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForFunction(()=>getComputedStyle(document.querySelector('[role=status]')).opacity==='1');
   const m=await measure(p);check(m.centerError<=1,`${name} ${width} horizontally centered: ${m.centerError}`);check(m.width<=220,`${name} ${width} compact notice: ${m.width}`);check(m.copy==='Signed in',`${name} ${width} concise accurate confirmation`);check(m.innerWidth===width&&Math.abs(m.visibleWidth-width)<1&&m.overflow<=1,`${name} ${width} viewport fit`);check(m.left>=15&&m.right<=width-15,`${name} ${width} safe side gutters`);check(m.fontSize>=14,`${name} ${width} readable text`);check(m.backdropFilter==='none',`${name} ${width} matte surface`);check(m.filter==='none'||m.filter==='blur(0px)',`${name} ${width} settled sharp text`);
   await p.screenshot({path:path.join(out,`${name}-${width}.png`)});records.push({engine:name,viewportWidth:width,...m});
   if(width===390){
    for(const[id,copy]of [['warning','Changes were not saved. Retry before leaving.'],['info','Workspace refreshed.']]){await p.locator('#'+id).click();await p.getByRole('status').filter({hasText:copy}).waitFor();await p.waitForFunction(()=>document.querySelectorAll('[role=status]').length===1);assert.equal(await p.getByRole('status').innerText(),copy);assert.equal(await p.getByRole('status').locator('.liquid-glass-strong').count(),1,'Unrelated notices retain their existing design');}
    await p.locator('#signin').focus();await p.locator('#signin').press('Enter');await p.waitForFunction(()=>document.querySelectorAll('[role=status]').length===1&&document.querySelector('[role=status]').textContent.includes('Signed in'));assert.equal(await p.locator('#signin').evaluate(e=>e===document.activeElement),true,'Notice never steals focus');await p.locator('#dismiss').click();await p.getByRole('status').waitFor({state:'detached'});
   }
   if(width===430){await p.emulateMedia({reducedMotion:'no-preference'});await p.locator('#dismiss').click();await p.getByRole('status').waitFor({state:'detached'});await p.locator('#signin').click();await p.getByRole('status').waitFor();const samples=await p.getByRole('status').evaluate(async e=>{const a=[];for(let i=0;i<20;i++){await new Promise(requestAnimationFrame);const r=e.firstElementChild.getBoundingClientRect();a.push(Math.abs((r.left+r.right)/2-innerWidth/2));}return a;});check(samples.every(x=>x<=1),name+' stays centered throughout entrance');}
   await c.close();
  }
 }finally{await b.close();}}
 check(errors.length===0,'No runtime errors: '+errors.join(';'));assert.equal(records.length,engines.length*5);writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:failures.length===0,records,failures,errors,nativeDevice:false},null,2));console.log(JSON.stringify({records:records.length,failures,errors},null,2));assert.deepEqual(failures,[]);
}finally{await server.close();}
