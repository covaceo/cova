import assert from 'node:assert/strict';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceBrowserOptions, workspaceEvidence } from './workspace-browser-support.mjs';
const chosen = (process.env.COVA_LAYOUT_CASES || 'features,nav,hero,resources,scroll').split(',');
const widths = (process.env.COVA_LAYOUT_WIDTHS || '1440,1100,1024,851,850,820,768,767,390,360,320').split(',').map(Number);
const out = join(workspaceEvidence('layout-collisions'), process.env.COVA_LAYOUT_PHASE || 'verified');
await mkdir(out, { recursive: true });
const server = process.env.COVA_LAYOUT_ORIGIN ? null : await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
const origin = process.env.COVA_LAYOUT_ORIGIN || 'http://127.0.0.1:' + server.httpServer.address().port;
const browser = await chromium.launch({ ...workspaceBrowserOptions, headless: true });
const results = [], errors = [];
async function open(page, route) {
  await page.goto(origin + '/#' + route);
  await page.locator('main h1').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important'));
  await page.waitForTimeout(900);
}
async function featureCheck(page, width) {
  await open(page, 'features');
  const tabs = await page.locator('[role="tab"]').evaluateAll(es => es.map(e => e.id));
  assert.equal(tabs.length, 5, 'Exercise all five actual feature tabs');
  for (const tab of tabs) {
    await page.locator('#' + tab).click();
    await page.locator('#' + tab).evaluate(e => { if(e.getAttribute('aria-selected') !== 'true') throw Error('Tab did not activate'); });
    await page.waitForTimeout(450);
    const panel = page.locator('.features-outcome-panel[data-active="true"]');
    await panel.scrollIntoViewIfNeeded();
    const geometry = await panel.evaluate(e => {
      const box = n => { const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}; };
      const parts = [...e.querySelectorAll('h2,p,ul,button')].map(n=>({tag:n.tagName,...box(n)}));
      return {panel:box(e),parts};
    });
    await page.screenshot({ path: join(out, 'features-' + tab + '-' + width + '.png') });
    assert.ok(geometry.parts.length >= 4, 'Nonvacuous outcome content');
    for (let a=0;a<geometry.parts.length;a++) for(let b=a+1;b<geometry.parts.length;b++) {
      const x=geometry.parts[a],y=geometry.parts[b];
      const overlapX=Math.min(x.right,y.right)-Math.max(x.x,y.x),overlapY=Math.min(x.bottom,y.bottom)-Math.max(x.y,y.y);
      assert.ok(overlapX<=1 || overlapY<=1, `${width} ${tab}: ${x.tag}/${y.tag} overlap ${overlapX}x${overlapY}`);
    }
    const description=geometry.parts.find(x=>x.tag==='P');
    assert.ok(description.w >= Math.min(280,geometry.panel.w*.75), 'Outcome description retains readable column width');
    results.push({case:'features',width,tab,geometry});
  }
}
async function navCheck(page, width) {
  await open(page, 'overview');
  const desktop=page.locator('.header-orbit.marketing-header');
  if(await desktop.isVisible()) {
    const buttons=await desktop.locator('button').evaluateAll(es=>es.filter(e=>e.checkVisibility()).map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent.trim()||e.getAttribute('aria-label'),x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
    assert.ok(buttons.length>=8,'Complete desktop navigation');
    for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++) {
      const a=buttons[i],b=buttons[j];const dx=Math.min(a.right,b.right)-Math.max(a.x,b.x),dy=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);
      assert.ok(dx<=1||dy<=1,`${width}: navbar ${a.text}/${b.text} overlap ${dx}x${dy}`);
    }
    results.push({case:'nav-desktop',width,buttons});
  } else {
    const toggle=page.getByRole('button',{name:'Toggle menu',exact:true});
    assert.ok(await toggle.isVisible(),'Hidden desktop navigation must have visible replacement');
    await toggle.click();const menu=page.getByRole('navigation',{name:'Site navigation',exact:true});await menu.waitFor();
    await page.waitForFunction(()=>{const menu=document.querySelector('#operator-mobile-menu'),shell=document.querySelector('.cova-public-nav-shell');return menu&&shell&&Number(getComputedStyle(menu).opacity)>.99&&parseFloat(getComputedStyle(shell).borderTopLeftRadius)<=28;});
    await page.waitForTimeout(250);
    const menuSurface=await page.locator('.cova-public-nav-shell').evaluate(e=>getComputedStyle(e).backgroundColor);
    const menuChannels=menuSurface.match(/[\d.]+/g).map(Number);
    assert.ok((menuChannels.length===4?menuChannels[3]:1)>=.98,'Expanded menu has a readable backing');
    for(const label of ['Home','Features','Pricing','Resources','Community','Sign in'])assert.ok(await menu.getByRole('button',{name:label,exact:true}).isVisible(),label);
    await page.screenshot({path:join(out,'menu-'+width+'.png')});
    await menu.getByRole('button',{name:'Features',exact:true}).click();
    await page.locator('.features-showcase-page').waitFor();await menu.waitFor({state:'hidden'});
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    results.push({case:'nav-compact',width,destination:'features'});
  }
  await page.screenshot({path:join(out,'nav-'+width+'.png')});
}
async function heroCheck(page,width) {
  await open(page,'overview');await page.locator('.cova-space-image img').evaluate(e=>e.decode());
  const boxes=await page.locator('.cova-space-actions').evaluate(e=>[...e.querySelectorAll('.cova-space-primary,.dark-glass-secondary')].map(n=>{const r=n.getBoundingClientRect();return {className:n.className,x:r.x,right:r.right,y:r.y,bottom:r.bottom};}));
  assert.equal(boxes.length,2);
  await page.screenshot({path:join(out,'hero-'+width+'.png')});
  for(const box of boxes)assert.ok(box.x>=0&&box.right<=width,`${width}: hero action outside screen ${JSON.stringify(box)}`);
  await page.getByRole('button',{name:'See how it works',exact:true}).click();
  await page.waitForFunction(()=>scrollY>100);
  results.push({case:'hero',width,boxes});
}
async function resourcesCheck(page,width) {
  await open(page,'resources');const stats=page.locator('.resources-oa-file-stats');await stats.scrollIntoViewIfNeeded();await page.waitForTimeout(350);
  const cells=await stats.evaluate(e=>[...e.children].map(cell=>{const b=cell.getBoundingClientRect();return {left:b.left,right:b.right,text:cell.textContent,lines:[...cell.querySelectorAll('dt,dd')].flatMap(n=>{const r=document.createRange();r.selectNodeContents(n);return [...r.getClientRects()].map(x=>({left:x.left,right:x.right,top:x.top,bottom:x.bottom}));})};}));
  assert.equal(cells.length,3);assert.ok(cells.some(x=>x.text.includes('2 warnings')));
  await page.screenshot({path:join(out,'resources-'+width+'.png')});
  for(const cell of cells)for(const line of cell.lines)assert.ok(line.left>=cell.left-1&&line.right<=cell.right+1,`${width}: resource value escapes its own cell ${JSON.stringify(cell)}`);
  results.push({case:'resources',width,cells});
}
async function scrollCheck(page,width) {
  await open(page,'features');
  const surface=page.locator('.cova-public-nav-shell');
  const top=await surface.evaluate(e=>getComputedStyle(e).backgroundColor);
  assert.equal(await page.locator('.cova-site-header').getAttribute('data-nav-scrolled'),'false');
  assert.ok(top==='transparent'||top.endsWith(', 0)'), 'Top-of-page header remains transparent');
  await page.mouse.move(width/2,500);await page.mouse.wheel(0,500);
  await page.waitForFunction(()=>document.querySelector('.cova-site-header')?.dataset.navScrolled==='true');
  await page.waitForTimeout(350);
  const scrolled=await surface.evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {background:s.backgroundColor,radius:s.borderRadius,width:r.width,height:r.height};});
  const channels=scrolled.background.match(/[\d.]+/g).map(Number);const alpha=channels.length===4?channels[3]:1;
  await page.screenshot({path:join(out,'scrolled-'+width+'.png')});
  assert.ok(alpha>=.98,`${width}: scrolled navigation has no readable backing: ${scrolled.background}`);
  assert.ok(scrolled.width>0&&scrolled.height>=48);
  await page.mouse.wheel(0,-1500);await page.waitForFunction(()=>scrollY===0);
  await page.waitForFunction(()=>document.querySelector('.cova-site-header')?.dataset.navScrolled==='false');
  results.push({case:'scroll',width,top,scrolled});
}
try {
  for (const width of widths) {
    const context=await browser.newContext({viewport:{width,height:width<768?740:900},isMobile:width<768});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400&&['image','script','stylesheet','font'].includes(r.request().resourceType()))errors.push(r.status()+' '+r.url());});
    if(chosen.includes('features')) await featureCheck(page,width);
    if(chosen.includes('nav')) await navCheck(page,width);
    if(chosen.includes('hero')) await heroCheck(page,width);
    if(chosen.includes('resources')) await resourcesCheck(page,width);
    if(chosen.includes('scroll')) await scrollCheck(page,width);
    const viewport=await page.evaluate(()=>({width:innerWidth,client:document.documentElement.clientWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
    assert.equal(viewport.width,width);assert.ok(viewport.overflow<=1);
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(join(out,'result.json'),JSON.stringify({origin,results,errors},null,2));
  console.log('PASS layout collision regressions',results.length);
} finally { await browser.close(); if(server) await new Promise(resolve=>server.httpServer.close(resolve)); }
