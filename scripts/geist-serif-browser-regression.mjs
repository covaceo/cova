import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';

const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const dist=resolve(option('--dist','dist'));
const out=resolve(option('--out','../geist-serif-browser-evidence'));
await mkdir(out,{recursive:true});
const report={dist,checks:[],errors:[],external:[],views:[],passed:false};
const check=(name,pass,detail)=>report.checks.push({name,pass:Boolean(pass),...(detail===undefined?{}:{detail})});
const signUp=async page=>{
 const host=page.locator('.cova-space-primary .cova-liquid-metal-signup');
 if(await host.getAttribute('data-state')==='ready')await host.frameLocator('iframe').getByRole('button',{name:'Sign up',exact:true}).click();
 else await host.getByRole('button',{name:'Sign up',exact:true}).click();
};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.avif':'image/avif','.jpg':'image/jpeg','.mp4':'video/mp4'};
const server=createServer(async(req,res)=>{
 try{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path.startsWith('/api/')){res.writeHead(404);res.end();return;}
  let file=resolve(dist,'.'+path);if(file!==dist&&!file.startsWith(dist+sep)){res.writeHead(403);res.end();return;}
  try{if(!(await stat(file)).isFile())file=resolve(dist,'index.html');}catch{file=extname(path)?file:resolve(dist,'index.html');}
  const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const [width,height] of [[1440,900],[768,1024],[390,844],[320,844]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce',deviceScaleFactor:1,serviceWorkers:'allow'});
  await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base+'/')||url.startsWith('data:'))return route.continue();report.external.push(url);return route.abort();});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push({width,message:e.message}));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('#cova-space-title').waitFor();await page.evaluate(()=>document.fonts.ready);
  const view=await page.evaluate(()=>{
   const title=document.querySelector('#cova-space-title'),sub=document.querySelector('.cova-space-subline');
   const props=['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','borderRadius','padding','margin'];
   const styles=el=>Object.fromEntries(props.map(p=>[p,getComputedStyle(el)[p]]));
   const lines=[...title.querySelectorAll(':scope > span')].map(el=>{const range=document.createRange();range.selectNodeContents(el);const r=el.getBoundingClientRect(),t=range.getBoundingClientRect();return {text:el.textContent,left:t.left,right:t.right,width:t.width,available:r.width,height:r.height,rects:[...range.getClientRects()].length};});
   return {width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,title:styles(title),lines,sub:{text:sub.textContent,styles:styles(sub)},buttons:[...document.querySelectorAll('.cova-space-actions button')].map(el=>({text:el.textContent,styles:styles(el),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),hover:document.querySelector('.cova-hero-hover')!==null};
  });
  const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
  const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#cova-space-title > span'});
  view.actualFonts=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;
  check(`${width}: actual headline glyphs use self-hosted Geist Serif`,view.actualFonts.length>0&&view.actualFonts.every(f=>f.isCustomFont&&f.familyName==='Geist Serif'),view.actualFonts);
  check(`${width}: approved regular weight without synthesis`,view.title.fontWeight==='400'&&await page.locator('#cova-space-title').evaluate(el=>getComputedStyle(el).fontSynthesis==='none'));
  check(`${width}: original two complete headline lines`,JSON.stringify(view.lines.map(l=>l.text))===JSON.stringify(['See the patterns','behind your risk.'])&&view.lines.every(l=>l.rects===1));
  check(`${width}: headline fits without clipping or overflow`,view.overflow===0&&view.lines.every(l=>l.left>=0&&l.right<=width&&l.width<=l.available+1),view.lines);
  check(`${width}: body and actions remain sans-serif`,!view.sub.styles.fontFamily.includes('Geist Serif')&&view.buttons.length>=2&&view.buttons.every(b=>!b.styles.fontFamily.includes('Geist Serif')));
  check(`${width}: reduced motion keeps hover ornament disabled`,!view.hover);
  await page.screenshot({path:resolve(out,`landing-${width}.png`)});
  if(width===1440||width===390){await page.locator('.cova-space-hero').screenshot({path:resolve(out,`hero-${width}.png`)});}
  await signUp(page);
  check(`${width}: original signup action opens email form`,await page.locator('input[type=email]').first().isVisible());
  await page.goto(base,{waitUntil:'networkidle'});await page.locator('.cova-space-actions').getByRole('button',{name:'See how it works',exact:true}).click();
  await page.waitForFunction(()=>window.scrollY>100);check(`${width}: original product-proof action still scrolls`,await page.evaluate(()=>window.scrollY>100));
  report.views.push(view);await context.close();
 }
 // Font failure remains readable and keeps the original controls usable.
 let blockedFonts=0;
 const fallback=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'allow'});
 await fallback.route('**/*',route=>{const url=route.request().url();if(/GeistSerif.*\.woff2/i.test(url)){blockedFonts++;return route.abort();}if(url.startsWith(base+'/')||url.startsWith('data:'))return route.continue();report.external.push(url);return route.abort();});
 const page=await fallback.newPage();page.on('pageerror',e=>report.errors.push({fallback:true,message:e.message}));await page.goto(base,{waitUntil:'networkidle'});await page.locator('#cova-space-title').waitFor();await page.evaluate(()=>document.fonts.ready);
 check('font failure: full headline remains visible',await page.locator('#cova-space-title').isVisible()&&(await page.locator('#cova-space-title > span').allTextContents()).join(' ')==='See the patterns behind your risk.');
 check('font failure: actual self-hosted request was blocked',blockedFonts===1,blockedFonts);
 check('font failure: headline font is not marked loaded',await page.evaluate(()=>[...document.fonts].filter(f=>f.family.replaceAll('"','')==='Geist Serif').every(f=>f.status!=='loaded')));
 await signUp(page);check('font failure: signup still works',await page.locator('input[type=email]').first().isVisible());await fallback.close();
 const motion=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
 await motion.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base+'/')||url.startsWith('data:'))return route.continue();report.external.push(url);return route.abort();});
 const moving=await motion.newPage();moving.on('pageerror',e=>report.errors.push({motion:true,message:e.message}));await moving.goto(base,{waitUntil:'networkidle'});await moving.evaluate(()=>document.fonts.ready);
 await moving.locator('#cova-space-title .cova-hero-hover').waitFor();await moving.locator('#cova-space-title').hover();
 await moving.waitForFunction(()=>document.querySelector('.cova-hero-hover')?.getAttribute('data-active')==='true');
 const overlay=await moving.locator('.cova-hero-hover text').evaluateAll(nodes=>nodes.map(n=>({family:getComputedStyle(n).fontFamily,weight:getComputedStyle(n).fontWeight,text:n.textContent})));
 check('normal motion: hover overlay uses the same regular headline font',overlay.length===2&&overlay.every(n=>n.family.includes('Geist Serif')&&n.weight==='400'),overlay);
 await moving.screenshot({path:resolve(out,'landing-hover-1440.png')});await moving.mouse.move(0,0);
 await moving.keyboard.press('Tab');
 const host=moving.locator('.cova-space-primary .cova-liquid-metal-signup');const control=await host.getAttribute('data-state')==='ready'?host.frameLocator('iframe').getByRole('button',{name:'Sign up',exact:true}):host.getByRole('button',{name:'Sign up',exact:true});
 await control.focus();await control.press('Enter');check('keyboard: original signup opens its form',await moving.locator('input[type=email]').first().isVisible());await motion.close();
 check('no browser runtime errors',report.errors.length===0,report.errors);check('no external requests',report.external.length===0,report.external);
 const baseline=option('--compare',null);
 if(baseline){const before=JSON.parse(await readFile(baseline,'utf8'));for(const view of report.views){const prior=before.views.find(v=>v.width===view.width);check(`${view.width}: subline and actions are unchanged`,JSON.stringify({sub:view.sub,buttons:view.buttons})===JSON.stringify({sub:prior.sub,buttons:prior.buttons}));}}
 report.passed=report.checks.every(c=>c.pass);
} catch(e){report.errors.push({fatal:String(e.stack||e)});throw e;}
finally{await browser?.close();await new Promise(r=>server.close(r));await writeFile(resolve(out,'results.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failures:report.checks.filter(c=>!c.pass),out},null,2));
assert.ok(report.passed,'Geist Serif browser regression failed; see results.json');
