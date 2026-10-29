// Run after mobile-menu-fit-fixture.mjs. Own ephemeral server/browser, network denied.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.env.MOBILE_MENU_FIT_EVIDENCE||path.join(root,'../menu-evidence'));
const mode=process.argv[2]||'after';
const site=path.resolve(process.env.MOBILE_MENU_FIT_SITE||path.join(out,'site',mode));mkdirSync(path.join(out,mode),{recursive:true});
const results=[],measurements=[],errors=[];
function check(name,pass,detail){results.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});}
const server=createServer((req,res)=>{
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);}catch{res.writeHead(400).end();return;}
 let file=path.join(site,pathname);
 const relative=path.relative(site,file);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)){res.writeHead(403).end();return;}
 if(pathname==='/api/auth/consent'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({accepted:true,termsVersion:'fixture',privacyVersion:'fixture'}));return;}
 if(pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'}).end('{"error":"isolated fixture"}');return;}
 try{
  if(!existsSync(file)||relative==='')file=path.join(site,'index.html');
  const body=readFileSync(file),ext=path.extname(file);
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'})[ext]||'application/octet-stream');res.end(body);
 }catch{res.writeHead(500).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
const geometry=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return{text:el.textContent.trim(),x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right,display:s.display,position:s.position,justify:s.justifyContent,textAlign:s.textAlign,border:s.border,background:s.backgroundColor,padding:s.padding,gap:s.gap,after:getComputedStyle(el,'::after').content};};
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
 for(const[width,height]of [[1440,900],[768,1024],[430,932],[390,844],[320,720],[390,480]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:process.env.MOBILE_MENU_FIT_MOTION||'reduce',hasTouch:width<850});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(origin+'/#dashboard');await page.locator('.astra-dashboard').waitFor().catch(async e=>{writeFileSync(path.join(out,mode,'boot-error.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(out,mode,'boot-error.png')});throw e;});await page.evaluate(()=>document.fonts.ready);await page.locator('.cova-sign-in-toast-surface').waitFor({state:'hidden'});await page.waitForTimeout(150);
  const mobile=width<=850;
  if(mobile){await page.getByRole('button',{name:'Toggle menu',exact:true}).click();await page.waitForTimeout(250);}
  const profile=page.locator('.cova-profile-trigger:visible');await profile.waitFor();
  if(mobile){
   const rows=await page.locator('#operator-mobile-menu > .operator-mobile-menu-link').evaluateAll((els,fn)=>els.map(el=>eval(`(${fn})`)(el)),geometry.toString());
   measurements.push({width,height,state:'navigation',rows});
   check(`${width}x${height} navigation rows >=44px, left aligned, unboxed`,rows.length===4&&rows.every(r=>r.height>=44&&r.justify!=='center'&&(r.border.startsWith('0px')||r.border.includes('rgba(0, 0, 0, 0)'))),rows);
   check(`${width}x${height} menu rows have breathing space`,rows.slice(1).every((r,i)=>r.y-rows[i].bottom>=3));
   await page.screenshot({path:path.join(out,mode,`${width}x${height}-nav.png`)});
  }
  await profile.click();
  const popup=page.locator('.cova-profile-popup:visible');await popup.waitFor();
  const triggerRect=await profile.evaluate(geometry),popupRect=await popup.evaluate(geometry);
  const items=await popup.locator('button').evaluateAll((els,fn)=>els.map(el=>eval(`(${fn})`)(el)),geometry.toString());
  measurements.push({width,height,state:'profile',triggerRect,popupRect,items});
  measurements.push({width,height,state:'inspector-audit',audit:await page.evaluate(()=>({smallLabels:[...document.querySelectorAll('body *')].filter(el=>el.childElementCount===0&&['Workspace','Discipline','Your record','Risk status'].includes(el.textContent.trim())).map(el=>({text:el.textContent,visible:el.checkVisibility(),rect:el.getBoundingClientRect().toJSON(),font:getComputedStyle(el).fontSize,sidebar:!!el.closest('.workspace-sidebar')})),menu:document.querySelector('#operator-mobile-menu')?{position:getComputedStyle(document.querySelector('#operator-mobile-menu')).position,shadow:getComputedStyle(document.querySelector('#operator-mobile-menu')).boxShadow,role:document.querySelector('#operator-mobile-menu').getAttribute('role')}:null}))});
  check(`${width}x${height} profile placement ${mobile?'below':'above'} trigger`,mobile?popupRect.y>=triggerRect.bottom:popupRect.bottom<=triggerRect.y,{triggerRect,popupRect});
  if(mobile)check(`${width}x${height} profile actions have 44px left aligned targets`,items.length===3&&items.every(r=>r.height>=44&&r.justify!=='center'),items);
  await page.screenshot({path:path.join(out,mode,`${width}x${height}-profile.png`)});
  if(mode==='before'&&width===390&&height===844){const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const doc=await cdp.send('DOM.getDocument');const matched={};for(const selector of ['.operator-mobile-menu-link','.cova-profile-mobile .cova-profile-popup','.cova-profile-mobile [role="menuitem"]']){const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector});matched[selector]=await cdp.send('CSS.getMatchedStylesForNode',{nodeId});}writeFileSync(path.join(out,'before-matched-rules.json'),JSON.stringify(matched,null,2));}
  if(mode==='before'){await context.close();continue;}
  // Pointer opening followed by natural Tab must enter the first action.
  await profile.focus();await page.keyboard.press('Tab');
  check(`${width}x${height} natural tab enters Edit profile`,await page.evaluate(()=>document.activeElement?.textContent?.trim()==='Edit profile'));
  check(`${width}x${height} visible keyboard focus`,await page.evaluate(()=>{const s=getComputedStyle(document.activeElement);return s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2;}));
  await page.keyboard.press('Escape');await page.waitForTimeout(100);
  check(`${width}x${height} Escape restores profile focus`,await profile.evaluate(el=>el===document.activeElement&&el.getAttribute('aria-expanded')==='false'));
  await profile.press('ArrowDown');await page.waitForTimeout(100);
  check(`${width}x${height} ArrowDown enters menu`,await page.evaluate(()=>document.activeElement?.textContent?.trim()==='Edit profile'));
  await page.keyboard.press('End');check(`${width}x${height} End focuses Sign out`,await page.evaluate(()=>document.activeElement?.textContent?.trim()==='Sign out'));
  await page.keyboard.press('Home');await page.keyboard.press('Enter');
  const dialog=page.locator('dialog[open]');await dialog.waitFor();
  check(`${width}x${height} actual editable profile opens`,await dialog.locator('#cova-username').isEnabled()&&await dialog.locator('#cova-username').inputValue()==='menu_review');
  const fits=async()=>dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth;});
  check(`${width}x${height} editor fits viewport`,await fits());await page.screenshot({path:path.join(out,mode,`${width}x${height}-editor.png`)});
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  check(`${width}x${height} editor close restores focus`,await profile.evaluate(el=>el===document.activeElement));
  await profile.click();await popup.getByRole('menuitem',{name:'Settings',exact:true}).click();await dialog.waitFor();
  check(`${width}x${height} actual settings fit viewport`,await fits());await page.screenshot({path:path.join(out,mode,`${width}x${height}-settings.png`)});
  await dialog.getByRole('tab',{name:'Account',exact:true}).click();
  check(`${width}x${height} account actions preserved`,await dialog.getByRole('button',{name:'Sign out',exact:true}).count()===1&&await dialog.getByRole('button',{name:'Send reset link',exact:true}).count()===1);
  await dialog.locator('.cova-settings-danger summary').click();
  let confirmed=false;page.once('dialog',async d=>{confirmed=d.type()==='confirm'&&d.message().includes('cannot be undone');await d.dismiss();});
  await dialog.getByRole('button',{name:'Delete account',exact:true}).click();await page.waitForTimeout(150);
  check(`${width}x${height} delete reaches real confirmation (cancelled)`,confirmed);
  await profile.click();await popup.getByRole('menuitem',{name:'Settings',exact:true}).click();await dialog.getByRole('tab',{name:'Connections',exact:true}).click();await dialog.getByRole('button',{name:'Manage connections'}).click();
  await page.waitForURL('**/#import');check(`${width}x${height} connections destination`,await page.locator('.accounts-page').isVisible());
  if(mobile){
   for(const[label,hash,selector]of [['Risk Desk','dashboard','.astra-dashboard'],['Insights','coach','.insights-preview'],['Limits','rules','.limits-preview'],['Passport','passport','.workspace-storage-required']]){
    await page.getByRole('button',{name:'Toggle menu',exact:true}).tap();await page.locator('#operator-mobile-menu').getByRole('button',{name:label,exact:true}).tap();await page.waitForURL(`**/#${hash}`);await page.waitForTimeout(250);
    check(`${width}x${height} ${label} route closes menu`,await page.locator('#operator-mobile-menu').count()===0&&await page.locator('header[data-section="'+hash+'"]').count()===1);
    await page.locator(selector).first().waitFor({timeout:10000}).catch(async()=>writeFileSync(path.join(out,mode,`${width}-${hash}-route-error.txt`),await page.locator('body').innerText()));
    check(`${width}x${height} ${label} destination content`,await page.locator(selector).first().isVisible());
    await page.getByRole('button',{name:'Toggle menu',exact:true}).click();
    const current=page.locator('#operator-mobile-menu > [aria-current="page"]');check(`${width}x${height} ${label} current state`,await current.count()===1&&await current.innerText()===label);
    check(`${width}x${height} ${label} current visual distinction`,await current.evaluate(el=>{const peer=el.parentElement.querySelector('.operator-mobile-menu-link:not([aria-current])');return getComputedStyle(el).backgroundColor!==getComputedStyle(peer).backgroundColor;}));
    await page.getByRole('button',{name:'Toggle menu',exact:true}).click();
   }
   await page.getByRole('button',{name:'Toggle menu',exact:true}).click();await page.locator('#operator-mobile-menu .cova-profile-trigger').click();
   const panel=page.locator('#operator-mobile-menu');
   check(`${width}x${height} both sign-outs and delete preserved`,await panel.getByRole('button',{name:'Sign out',exact:true}).count()===1&&await panel.getByRole('menuitem',{name:'Sign out',exact:true}).count()===1&&await panel.getByRole('button',{name:'Delete account',exact:true}).count()===1);
   const bounds=await panel.evaluate(el=>{const r=el.getBoundingClientRect();return{bottom:r.bottom,height:innerHeight,client:el.clientHeight,scroll:el.scrollHeight,overflow:getComputedStyle(el).overflowY};});
   check(`${width}x${height} expanded menu bounded and scrollable`,bounds.bottom<=height&&['auto','scroll'].includes(bounds.overflow),bounds);
   const link=panel.getByRole('button',{name:'Link account',exact:true});await link.scrollIntoViewIfNeeded();
   check(`${width}x${height} final action reachable`,await link.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===el;}));
   await page.screenshot({path:path.join(out,mode,`${width}x${height}-scrolled.png`)});
   await link.tap();await page.waitForURL('**/#import');
   await page.getByRole('button',{name:'Toggle menu',exact:true}).tap();await profile.tap();await popup.getByRole('menuitem',{name:'Edit profile',exact:true}).tap();await dialog.waitFor();
   check(`${width}x${height} touch opens editable profile`,await dialog.locator('#cova-username').isEnabled());await dialog.getByRole('button',{name:'Cancel',exact:true}).tap();
   await profile.tap();await popup.getByRole('menuitem',{name:'Settings',exact:true}).tap();await dialog.waitFor();check(`${width}x${height} touch opens settings`,await fits());await page.keyboard.press('Escape');
   await profile.tap();let footerConfirmed=false;page.once('dialog',async d=>{footerConfirmed=d.type()==='confirm'&&d.message().includes('cannot be undone');await d.dismiss();});await panel.getByRole('button',{name:'Delete account',exact:true}).tap();await page.waitForTimeout(150);check(`${width}x${height} expanded footer delete confirms (cancelled)`,footerConfirmed);
  }
  check(`${width}x${height} no horizontal document overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await context.close();
 }
}catch(e){check('Runner completed',false,e.stack);}
finally{await browser?.close();await new Promise(r=>server.close(r));}
check('No page errors',errors.length===0,errors);
writeFileSync(path.join(out,`${mode}-measurements.json`),JSON.stringify(measurements,null,2));
const report={mode,motion:process.env.MOBILE_MENU_FIT_MOTION||'reduce',passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results};
writeFileSync(path.join(out,`${mode}-results.json`),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
