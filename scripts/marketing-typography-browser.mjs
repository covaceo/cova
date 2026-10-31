import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const dist=resolve(arg('--dist','dist')),out=resolve(arg('--out','../marketing-typography-browser-evidence'));
const routes={overview:['#cova-space-title','#landing-product-title','#cova-trader-reviews-title','#home-story-title','#minimal-pricing-title','#cova-closing-title'],features:['.features-showcase-intro h1'],pricing:['#minimal-pricing-title'],resources:['.resources-oa-intro h1'],community:['.community-oa-intro h1']};
const widths=[1440,768,390,320],comparisonMode=process.argv.includes('--compare'),baselinePath=arg('--compare',null);
const expectedComparisons=comparisonMode?widths.length*Object.values(routes).reduce((total,selectors)=>total+2*selectors.length+1,0):0;
await mkdir(out,{recursive:true});
const report={dist,routes,mode:comparisonMode?'comparison':'smoke',comparison:{baselinePath:baselinePath??null,expected:expectedComparisons,actual:0},checks:[],views:[],errors:[],external:[],passed:false};
const check=(name,pass,detail)=>report.checks.push({name,pass:Boolean(pass),...(detail===undefined?{}:{detail})});
const preservationCheck=(...args)=>{check(...args);report.comparison.actual++;};
const baselineViews=new Map();
if(comparisonMode){
 try{
  assert.ok(typeof baselinePath==='string'&&baselinePath.length>0&&!baselinePath.startsWith('--'),'--compare requires a baseline JSON path');
  const baseline=JSON.parse(await readFile(baselinePath,'utf8'));
  assert.ok(Array.isArray(baseline?.views),'Baseline views must be an array');
  for(const view of baseline.views){
   assert.ok(view&&Object.hasOwn(routes,view.route)&&widths.includes(view.width),'Unexpected baseline route/width');
   const key=view.route+'/'+view.width;
   assert.ok(!baselineViews.has(key),'Duplicate baseline view: '+key);
   assert.ok(Array.isArray(view.headlines),'Baseline headlines must be an array: '+key);
   const selectors=new Set();
   for(const headline of view.headlines){
    assert.ok(headline&&routes[view.route].includes(headline.selector),'Unexpected baseline headline selector: '+key);
    assert.ok(!selectors.has(headline.selector),'Duplicate baseline headline selector: '+key+'/'+headline.selector);
    selectors.add(headline.selector);
    for(const field of ['text','size','lineHeight','spacing','color'])assert.equal(typeof headline[field],'string','Missing or invalid baseline '+field+': '+key+'/'+headline.selector);
    assert.ok(Number.isInteger(headline.lines)&&headline.lines>0,'Missing or invalid baseline line count: '+key+'/'+headline.selector);
   }
   for(const selector of routes[view.route])assert.ok(selectors.has(selector),'Missing baseline headline selector: '+key+'/'+selector);
   assert.ok(Array.isArray(view.otherText),'Baseline non-display text must be an array: '+key);
   baselineViews.set(key,view);
  }
  for(const width of widths)for(const route of Object.keys(routes))assert.ok(baselineViews.has(route+'/'+width),'Missing baseline view: '+route+'/'+width);
 }catch(e){
  report.errors.push({stage:'baseline-validation',fatal:String(e.stack||e)});
  await writeFile(resolve(out,'results.json'),JSON.stringify(report,null,2));
  throw e;
 }
}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.jpg':'image/jpeg','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path.startsWith('/api/')){res.writeHead(404);res.end();return;}let file=resolve(dist,'.'+path);if(file!==dist&&!file.startsWith(dist+sep)){res.writeHead(403);res.end();return;}try{if(!(await stat(file)).isFile())file=resolve(dist,'index.html');}catch{if(!extname(path))file=resolve(dist,'index.html');}const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of widths){
  for(const [route,selectors] of Object.entries(routes)){
   const context=await browser.newContext({viewport:{width,height:width<768?844:1000},isMobile:width<768,hasTouch:width<768,deviceScaleFactor:1,reducedMotion:'reduce'});
   await context.route('**/*',r=>{const url=r.request().url();if(url.startsWith(base+'/')||url.startsWith('data:'))return r.continue();report.external.push(url);return r.abort();});
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push({route,width,error:e.message}));
   await page.goto(base+'/#'+route,{waitUntil:'networkidle'});await page.locator(selectors[0]).waitFor();await page.evaluate(()=>document.fonts.ready);
   const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
   const view={route,width,headlines:[]};const previous=baselineViews.get(route+'/'+width);
   for(const selector of selectors){
    const el=page.locator(selector);await el.evaluate(n=>n.scrollIntoView({block:'start'}));await page.evaluate(()=>window.scrollBy(0,-120));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const data=await el.evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect(),walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;const rects=[];while(n=walker.nextNode()){if(!n.textContent.trim()||n.parentElement.closest('svg'))continue;const range=document.createRange();range.selectNodeContents(n);for(const t of range.getClientRects())if(t.width>0)rects.push({left:t.left,right:t.right,top:t.top});}return {text:el.textContent.trim(),family:s.fontFamily,weight:s.fontWeight,synthesis:s.fontSynthesis,size:s.fontSize,lineHeight:s.lineHeight,spacing:s.letterSpacing,color:s.color,left:r.left,right:r.right,width:r.width,lines:new Set(rects.map(r=>Math.round(r.top))).size,rects};});
    data.legibility=await el.evaluate(el=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),runs=[],words=[],canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');let node;while(node=walker.nextNode()){if(!node.textContent.trim()||node.parentElement.closest('svg'))continue;const s=getComputedStyle(node.parentElement),size=parseFloat(s.fontSize),spacing=s.letterSpacing==='normal'?0:parseFloat(s.letterSpacing);runs.push({size,spacing,lineHeight:parseFloat(s.lineHeight)});ctx.font=`${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;ctx.letterSpacing=spacing+'px';for(const match of node.textContent.matchAll(/\S+/g)){const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);const rects=[...range.getClientRects()].filter(r=>r.width>0),m=ctx.measureText(match[0]);if(rects.length!==1){words.push({text:match[0],split:true});continue;}const r=rects[0];words.push({text:match[0],left:r.left-m.actualBoundingBoxLeft,right:r.left+m.actualBoundingBoxRight,top:r.top,size});}}const ordered=words.filter(w=>!w.split).sort((a,b)=>a.top-b.top||a.left-b.left),gaps=[];for(let i=1;i<ordered.length;i++){const a=ordered[i-1],b=ordered[i];if(Math.abs(a.top-b.top)<2)gaps.push({a:a.text,b:b.text,gap:b.left-a.right});}return {runs,words,gaps};});
    const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});data.actualFonts=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;data.selector=selector;
    const key=route+'/'+width+'/'+selector;
    check(key+': actual regular Geist Serif',data.actualFonts.length>0&&data.actualFonts.every(f=>f.isCustomFont&&f.familyName==='Geist Serif')&&data.weight==='400'&&data.synthesis==='none',{family:data.family,weight:data.weight,actual:data.actualFonts});
    check(key+': natural spacing and separated words',data.legibility.runs.length>0&&data.legibility.runs.every(r=>r.spacing===0)&&data.legibility.words.every(w=>!w.split)&&data.legibility.gaps.every(g=>g.gap>=1),data.legibility);
    check(key+': legible line flow',data.legibility.runs.every(r=>r.lineHeight>=r.size)&&(selector!=='#cova-space-title'||data.lines===2));
    check(key+': no horizontal clipping',data.rects.every(r=>r.left>=-1&&r.right<=width+1),data.rects);
    if(comparisonMode){const old=previous.headlines.find(h=>h.selector===selector),mobileHero=selector==='#cova-space-title'&&width<768,expectedSize=mobileHero?Math.min(54,Math.max(35,width*.105)):parseFloat(old.size),expectedLineHeight=mobileHero?expectedSize*1.02:parseFloat(old.lineHeight);preservationCheck(key+': copy and approved scale preserved with natural tracking',data.text===old.text&&Math.abs(parseFloat(data.size)-expectedSize)<.01&&Math.abs(parseFloat(data.lineHeight)-expectedLineHeight)<.01&&(data.spacing==='normal'||parseFloat(data.spacing)===0)&&data.color===old.color);preservationCheck(key+': natural wrapping keeps complete separated words',data.lines>0&&data.legibility.words.length>0&&data.legibility.words.every(w=>!w.split)&&data.legibility.gaps.every(g=>g.gap>=1),{before:old.lines,after:data.lines});}
    view.headlines.push(data);
    const slug=selector.replaceAll(/[^a-z0-9]+/gi,'-').replaceAll(/^-|-$/g,'');await page.screenshot({path:resolve(out,`${route}-${width}-${slug}.png`)});
   }
   // Compare all non-display text styles, including sample trading figures and smaller headings.
   await page.evaluate(()=>scrollTo(0,0));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   view.otherText=await page.evaluate(selectors=>{const roots=selectors.map(s=>document.querySelector(s)),props=['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color'];return [...document.querySelectorAll('h1,h2,h3,p,button,a,label,input,textarea,select,summary,strong,small,dt,dd')].filter(el=>!roots.some(r=>r?.contains(el))).map(el=>({tag:el.tagName,text:(el.textContent||'').trim(),href:el.getAttribute('href'),styles:Object.fromEntries(props.map(p=>[p,getComputedStyle(el)[p]]))}));},selectors);
   check(route+'/'+width+': functional text remains non-serif',view.otherText.every(t=>!t.styles.fontFamily.includes('Geist Serif')));
   if(comparisonMode)preservationCheck(route+'/'+width+': all non-display text and typography unchanged',JSON.stringify(view.otherText)===JSON.stringify(previous.otherText));
   check(route+'/'+width+': no page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(route==='overview'){
    const chapter=page.locator('.cova-risk-chapters button[aria-expanded]').nth(1);await chapter.click();check(route+'/'+width+': Risk Desk chapter works',await chapter.getAttribute('aria-expanded')==='true');
   }else if(route==='features'){
    const tab=page.getByRole('tab').nth(1);await tab.click();check(route+'/'+width+': feature selection works',await tab.getAttribute('aria-selected')==='true');
    check(route+'/'+width+': feature detail stays sans-serif',await page.locator('.features-outcome-panel h2').evaluateAll(els=>els.length===5&&els.every(el=>!getComputedStyle(el).fontFamily.includes('Geist Serif'))));
   }else if(route==='pricing'){
    const disclosure=page.locator('.minimal-plan-boundaries').first();await disclosure.locator('summary').click();check(route+'/'+width+': plan disclosure works',await disclosure.getAttribute('open')!==null);
    await page.locator('[data-minimal-plan="free"] .minimal-plan-action').click();check(route+'/'+width+': signup opens',await page.locator('input[type=email]').first().isVisible());
    check(route+'/'+width+': form typography unchanged',!(await page.locator('input[type=email]').first().evaluate(el=>getComputedStyle(el).fontFamily)).includes('Geist Serif'));
   }else if(route==='resources'){
    const toggle=page.locator('.resources-guide-toggle').first();const before=await toggle.getAttribute('aria-expanded');await toggle.click();check(route+'/'+width+': guide disclosure works',await toggle.getAttribute('aria-expanded')!==before);
   }else{
    const links=await page.locator('.community-social-link').evaluateAll(ns=>ns.map(n=>n.getAttribute('href')));check(route+'/'+width+': social destinations preserved',links.length>0&&links.every(h=>h?.startsWith('https://')));
   }
   report.views.push(view);await context.close();
  }
 }
 check('no browser runtime errors',report.errors.length===0,report.errors);check('no external requests',report.external.length===0,report.external);
 if(comparisonMode)assert.equal(report.comparison.actual,expectedComparisons,'Incomplete preservation comparison count');
 report.passed=report.checks.every(c=>c.pass);
} catch(e){report.errors.push({fatal:String(e.stack||e)});throw e;}
finally{await browser?.close();await new Promise(r=>server.close(r));await writeFile(resolve(out,'results.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,mode:report.mode,comparison:report.comparison,views:report.views.length,checks:report.checks.length,failures:report.checks.filter(c=>!c.pass),out},null,2));assert.ok(report.passed,'Marketing typography checks failed; inspect results.json');
