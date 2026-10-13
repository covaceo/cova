import assert from 'node:assert/strict';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceBrowserOptions, workspaceEvidence } from './workspace-browser-support.mjs';
const out=workspaceEvidence('performance-preservation');await mkdir(out,{recursive:true});
const server=await preview({preview:{host:'127.0.0.1',port:0,strictPort:true}});
const origin='http://127.0.0.1:'+server.httpServer.address().port;
const browser=await chromium.launch({...workspaceBrowserOptions,headless:true});
const evidence=[];
try {
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:960},isMobile:width===390});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('response',r=>{if(r.status()>=400&&['image','script','stylesheet','font'].includes(r.request().resourceType()))errors.push('Asset '+r.status()+': '+new URL(r.url()).pathname)});
  await page.goto(origin+'/#overview',{waitUntil:'domcontentloaded'});
  await page.locator('.cova-space-hero h1').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.locator('.cova-space-image img').evaluate(img=>img.decode());
  const hero=await page.locator('.cova-space-image img').evaluate(img=>({src:img.currentSrc,w:img.naturalWidth,h:img.naturalHeight,priority:img.fetchPriority}));
  assert.ok(hero.src.endsWith('.webp'));assert.deepEqual([hero.w,hero.h],[1672,941]);assert.equal(hero.priority,'high');
  const pixelProof=await page.evaluate(async()=>{
   const decode=async src=>{const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);return ctx.getImageData(0,0,c.width,c.height).data};
   const [a,b]=await Promise.all([decode('/media/cova-orbital-hero-v1.png'),decode('/media/cova-orbital-hero-v1.webp')]);
   let differences=0;for(let n=0;n<a.length;n++)if(a[n]!==b[n])differences++;
   return {channels:a.length,differences};
  });assert.equal(pixelProof.differences,0,'Lossless delivery must preserve browser-decoded artwork');
  await page.waitForTimeout(1900);await page.screenshot({path:join(out,'hero-'+width+'.png')});
  await page.evaluate(()=>document.documentElement.style.setProperty('scroll-behavior','auto','important'));
  // Real incremental scrolling settles deferred geometry before entering the card.
  for(let n=0;n<35;n++){
   const done=await page.evaluate(()=>{scrollBy(0,innerHeight*.65);return scrollY>=document.documentElement.scrollHeight-innerHeight-2});
   await page.waitForTimeout(100);if(done)break;
  }
  const card=page.locator('.home-story .passport-holo-face');await card.scrollIntoViewIfNeeded();await page.waitForTimeout(700);
  await page.waitForFunction(()=>document.querySelector('.home-story .passport-holo-face')?.dataset.optics==='ready');
  const plate=await card.locator('svg image').getAttribute('href');assert.match(plate,/\/assets\/passport-diamond-material-.*\.webp$/);
  const response=await page.request.get(origin+plate);assert.equal(response.status(),200);
  await card.focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>Math.abs(Number(document.querySelector('.home-story .passport-holo-face')?.dataset.opticsX))>0.01);
  const tilted=await card.evaluate(x=>({x:x.dataset.opticsX,transform:x.style.transform}));assert.notEqual(tilted.transform,'none');
  await page.keyboard.press('Home');await page.waitForFunction(()=>{const d=document.querySelector('.home-story .passport-holo-face')?.dataset;return d?.opticsX==='0.0000'&&d?.opticsY==='0.0000'});
  await page.locator('[data-passport-sample-mode="private"]').click();
  await page.waitForFunction(()=>document.querySelector('.home-story .passport-holo-face')?.dataset.passportMode==='private');
  assert.doesNotMatch(await card.textContent(),/Trader 6714|\+\$1,007\.50/);
  await page.locator('[data-passport-sample-mode="flex"]').click();
  await page.waitForFunction(()=>document.querySelector('.home-story .passport-holo-face')?.dataset.passportMode==='flex');
  await page.waitForTimeout(500);await page.screenshot({path:join(out,'passport-'+width+'.png')});
  const stars=page.locator('.cova-landing-stars');await page.waitForFunction(()=>document.querySelector('.cova-landing-stars')?.dataset.state==='running');
  const frame=await stars.getAttribute('data-frames');await page.waitForFunction(f=>document.querySelector('.cova-landing-stars')?.dataset.frames!==f,frame);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('.cova-landing-stars')?.dataset.state==='static');
  await page.waitForTimeout(200);const staticFrame=await stars.getAttribute('data-frames');await page.waitForTimeout(250);assert.equal(await stars.getAttribute('data-frames'),staticFrame);
  await card.focus();await page.keyboard.press('ArrowRight');assert.equal(await card.evaluate(x=>x.style.transform),'none','Reduced motion retains static card');
  const layout=await page.evaluate(()=>({width:innerWidth,client:document.documentElement.clientWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,broken:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src)}));
  assert.equal(layout.width,width);assert.ok(layout.overflow<=1);assert.deepEqual(layout.broken,[]);assert.deepEqual(errors,[]);
  evidence.push({width,hero,pixelProof,tilted,layout,errors});await context.close();
 }
 await writeFile(join(out,'result.json'),JSON.stringify(evidence,null,2));console.log('PASS lossless browser pixels, public plate, live tilt/reset, privacy modes, moving stars and live reduced-motion on desktop/phone');
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
