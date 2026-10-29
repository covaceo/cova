// Portable production-component touch regression. No app server or account access.
// node scripts/chart-touch-regression.mjs [--phase=red|green] [--case=all]
// Cases: toggle, outside, cancel, basis, hover, copy, keyboard, viewport, all.
// CHART_TOUCH_EVIDENCE overrides ../chart-evidence; CHROME_PATH or PW_CHANNEL selects a browser.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (key, fallback) => process.argv.find(v => v.startsWith(`--${key}=`))?.split('=')[1] || fallback;
const phase = arg('phase', 'green'), only = arg('case', 'all');
const output = resolve(process.env.CHART_TOUCH_EVIDENCE || join(root, '../chart-evidence'), `${phase}-${only}`);
await mkdir(output, {recursive:true});
const styles = [...(await readFile(join(root,'src/main.tsx'),'utf8')).matchAll(/import "([^"]+)";/g)].map(m=>m[1]).filter(n=>n.startsWith('@fontsource')||n.endsWith('.css')).map(n=>`import ${JSON.stringify(n.startsWith('./')?join(root,'src',n.slice(2)).replaceAll('\\','/'):n)};`).join('\n');
const points = [{label:'Start',value:0},{label:'2026-10-22',value:-68.83},{label:'2026-10-24',value:-14.83},{label:'2026-10-26',value:37.35},{label:'2026-10-28',value:36.8}];
const entry = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {AstraEquityCurve} from ${JSON.stringify(join(root,'src/components/AstraEquityCurve.tsx').replaceAll('\\','/'))};${styles}
const initial=${JSON.stringify(points)};
function Fixture(){const [points,setPoints]=useState(initial),[basis,setBasis]=useState('trades'),[account,setAccount]=useState(3680),[menu,setMenu]=useState(false);window.chartFixture={basis:()=>setBasis(b=>b==='trades'?'daily-net':'trades'),range:()=>setPoints(initial.slice(0,3)),account:()=>setAccount(null)};return <main className="oa-dashboard-app" style={{padding:16,maxWidth:1000,margin:'auto',minHeight:1600}}><div className="astra-dashboard" data-dashboard-visual="approved"><header style={{display:'flex',justifyContent:'space-between',marginBottom:24}}><h1>Risk Desk</h1><button id="menu" aria-expanded={menu} onClick={()=>setMenu(!menu)}>Menu</button></header>{menu&&<nav id="fixture-menu">Account settings</nav>}<section className="astra-panel astra-chart-panel"><div className="astra-panel-heading"><h2>Equity curve</h2></div><AstraEquityCurve points={points} basis={basis} accountPnlCents={account}/><div className="astra-chart-note">Reported P&L · 4 trades</div></section><p id="outside" style={{padding:24}}>Recent trades</p></div></main>};createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);`;
const bundle=await build({root,configFile:false,envDir:false,plugins:[react(),{name:'chart-touch-fixture',resolveId(id){if(id==='chart-touch-entry')return '\0chart-touch-entry.tsx';},load(id){if(id==='\0chart-touch-entry.tsx')return entry;}}],logLevel:'error',build:{write:false,assetsInlineLimit:10000000,cssCodeSplit:false,minify:true,rollupOptions:{input:'chart-touch-entry',output:{format:'iife',name:'ChartTouchFixture'}}}});
const files=bundle.output;
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${files.filter(f=>f.fileName.endsWith('.css')).map(f=>f.source).join('\n')}</style></head><body><div id="root"></div><script>${files.filter(f=>f.type==='chunk').map(f=>f.code).join('\n').replaceAll('</script','<\\/script')}</script></body></html>`;
await writeFile(join(output,'fixture.html'),html);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:process.env.PW_CHANNEL||'chrome'})});
const receipts=[],errors=[],assertions=[];let checks=0;
function check(actual,expected,label){checks++;assertions.push({label,passed:JSON.stringify(actual)===JSON.stringify(expected)});assert.deepEqual(actual,expected,label);}
try {
for(const width of [1440,768,390,320,430]) {
 const context=await browser.newContext({viewport:{width,height:width===320?568:900},hasTouch:true,isMobile:width<768,deviceScaleFactor:1});
 await context.route('**/*',route=>route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.setContent(html);await page.locator('.astra-chart-svg').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);
 await page.evaluate(()=>{window.events=[];for(const type of ['pointerdown','pointerup','pointermove','pointercancel','pointerleave','mousemove','mousedown','mouseup','click'])document.addEventListener(type,e=>{const c=document.querySelector('.astra-chart-main');window.events.push({type,pointer:e.pointerType,target:e.target.tagName,selected:c.dataset.chartSelected,pinned:c.dataset.chartPinned});},true);});
 const state=()=>page.locator('.astra-chart-main').evaluate(e=>({selected:e.dataset.chartSelected,pinned:e.dataset.chartPinned,tooltip:!!e.querySelector('output')}));
 const dot=async(index)=>page.locator(`[data-observation-index="${index}"]`).evaluate(e=>{const p=new DOMPoint(+e.getAttribute('cx'),+e.getAttribute('cy')).matrixTransform(e.getScreenCTM());return {x:p.x,y:p.y};});
 const tap=async(index)=>{const p=await dot(index);await page.touchscreen.tap(p.x,p.y);await page.waitForTimeout(40);};
 const cleared=async(label)=>check(await state(),{selected:'',pinned:'false',tooltip:false},label);
 const snap=async(name)=>page.screenshot({path:join(output,`${width}-${name}.png`)});
 try {
  await tap(3);check((await state()).selected,'3','tap selects point');check(await page.locator('output strong').textContent(),'+$52.18','cent-exact trade delta');await snap('tap');
  if(only==='toggle'||only==='all') {await tap(3);await snap('second-tap');await cleared('same point touch dismisses entirely');}
  if(only==='outside'||only==='all') {if(!(await state()).tooltip)await tap(3);await page.locator('#outside').tap();await cleared('outside touch dismisses');await tap(2);await page.locator('#menu').tap();await cleared('menu opening dismisses');check(await page.locator('#menu').getAttribute('aria-expanded'),'true','outside action still activates');await page.locator('#menu').tap();}
  if(only==='cancel'||only==='all') {if(!(await state()).tooltip)await tap(2);const cdp=await context.newCDPSession(page),p=await dot(2);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(50);await cleared('touch cancellation clears pin and selection');}
  if(only==='basis'||only==='all') {if(!(await state()).tooltip)await tap(2);await page.evaluate(()=>window.chartFixture.basis());await page.waitForTimeout(40);await cleared('basis replacement clears selection');}
  if(only==='hover'||only==='all') {
   await page.locator('#outside').tap();const cdp=await context.newCDPSession(page),p=await dot(2);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+3,y:p.y+1}]});await page.waitForTimeout(40);
   await cleared('touch move is not mouse hover');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(40);check((await state()).selected,'2','small finger movement still selects on tap completion');
  }
  if(only==='copy'||only==='all') {if(!(await state()).tooltip)await tap(3);check(/Escape|Click to pin/.test(await page.locator('output').innerText()),false,'touch hint does not require keyboard or mouse');check((await page.locator('output').innerText()).includes('Tap again to dismiss'),true,'same-tap dismissal is discoverable');}
  if(only==='viewport'||only==='all') {
   await page.locator('#outside').tap();
   const top=await page.locator('.astra-chart-svg').evaluate(e=>e.getBoundingClientRect().top+scrollY);
   await page.evaluate(y=>scrollTo(0,y+70),top);await page.waitForTimeout(80);await tap(1);
   check(await page.locator('output').evaluate(e=>{const b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight;}),true,'partially scrolled chart tooltip stays in viewport');
   await snap('partial-scroll');await page.locator('.astra-chart-svg').focus();await page.keyboard.press('Escape');await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(80);
  }
  if(only==='keyboard'||only==='all') {
   await page.locator('.astra-chart-svg').focus();
   for(const [key,index] of [['Home','0'],['ArrowRight','1'],['End','4'],['ArrowLeft','3']]) {await page.keyboard.press(key);check((await state()).selected,index,`keyboard ${key}`);check((await state()).pinned,'true','keyboard exploration pins');}
   check((await page.locator('output').innerText()).includes('Pinned · Escape to clear'),true,'keyboard hint replaces touch hint');
   await page.keyboard.press('Enter');check((await state()).pinned,'false','Enter unpins');check((await state()).selected,'3','keyboard unpin preserves inspected point');
   await page.keyboard.press('Enter');check((await state()).pinned,'true','Enter repins');await page.keyboard.press('Space');check((await state()).pinned,'false','Space unpins');await page.keyboard.press('Escape');await cleared('Escape clears');await snap('keyboard-cleared');
  }
  if(only==='all') {
   // Real mouse input after touch: hover and the original click-pin/unpin semantics.
   for(const index of [1,3]) {const p=await dot(index);await page.mouse.move(p.x,p.y);check((await state()).selected,String(index),'mouse hover selects');check((await state()).pinned,'false','hover is unpinned');}
   let p=await dot(3);await page.mouse.click(p.x,p.y);await page.mouse.move(2,2);check((await state()).pinned,'true','mouse pin survives leaving');p=await dot(3);await page.mouse.click(p.x,p.y);check((await state()).pinned,'false','mouse second click unpins');check((await state()).selected,'3','mouse unpin retains hover');await page.mouse.move(2,2);await cleared('mouse leave clears hover');
   // All observations retain cents, signs, identity and phone containment, including start/end.
   const deltas=['$0.00','−$68.83','+$54.00','+$52.18','−$0.55'];
   for(let index=0;index<points.length;index++) {
    await tap(index);check((await state()).selected,String(index),'touch changes points');check(await page.locator('output strong').textContent(),deltas[index],'financial delta preserved');
    check(await page.locator('output').evaluate(e=>getComputedStyle(e).pointerEvents),'none','tooltip cannot intercept taps');
    check(await page.locator('output').evaluate(e=>{const b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight;}),true,'tooltip stays in viewport');
    if(index===0||index===4)await snap(`point-${index}`);
   }
   // Pan-y remains native; a real vertical gesture produces pointercancel and scrolls.
   const cdp=await context.newCDPSession(page);const box=await page.locator('.astra-chart-svg').boundingBox();p={x:box.x+box.width/2,y:box.y+box.height-30};
   const startScroll=await page.evaluate(()=>scrollY);const startEvents=await page.evaluate(()=>window.events.length);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
   for(let step=1;step<=6;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y-step*18}]});await page.waitForTimeout(30);}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);
   check(await page.evaluate(n=>window.events.slice(n).some(e=>e.type==='pointercancel'),startEvents),true,'native scroll cancels pointer');check(await page.evaluate(()=>scrollY)>startScroll,true,'chart allows native vertical scroll');await cleared('scroll cancellation leaves no stuck detail');
   await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(80);await snap('scroll-cleared');
   await tap(3);await page.evaluate(()=>window.chartFixture.range());await page.waitForTimeout(40);await cleared('new range clears');check(await page.locator('.astra-observation').count(),3,'new range retains its observations');check(await page.locator('.astra-chart-main').getAttribute('data-equity-tone'),'loss','range tone follows range not older account profits');
   await tap(1);check(await page.locator('output strong').textContent(),'−$68.83','range delta unchanged');await page.evaluate(()=>window.chartFixture.account());await page.waitForTimeout(40);check(await page.locator('.astra-chart-main').getAttribute('data-equity-tone'),'neutral','unknown account evidence stays neutral');check(await page.locator('.astra-observation').evaluateAll(es=>es.every(e=>e.getAttribute('fill')==='#4f7dff')),true,'unknown account marks remain neutral');
   await page.locator('#outside').tap();await cleared('final outside clear');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
  }
  receipts.push({width,status:'passed'});
 } catch(e) {receipts.push({width,status:'failed',message:e.message});await snap('failure');}
 await writeFile(join(output,`${width}-events.json`),JSON.stringify(await page.evaluate(()=>window.events),null,2));
 await context.close();
}
} finally {await browser.close();}
const report={phase,case:only,checks,passed:receipts.filter(r=>r.status==='passed').length,failed:receipts.filter(r=>r.status==='failed').length,receipts,errors,assertions};await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,assertions:undefined,output},null,2));if(report.failed||errors.length)process.exitCode=1;
