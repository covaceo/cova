// Actual App, isolated synthetic identity and local ledger. No customer/provider requests.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {workspaceBrowserOptions} from './workspace-browser-support.mjs';
const require=createRequire(import.meta.url), load=require('./helpers/load-ts.cjs');
const {sampleTrades,defaultRules}=load('src/lib/risk.ts');
const trades=sampleTrades.map(t=>({...t,manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}}));
const owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const port=process.env.REFINEMENT_PORT||'4297', origin=`http://127.0.0.1:${port}`;
const out=path.resolve(process.env.REFINEMENT_OUT||'artifacts/dashboard-refinement');
await mkdir(out,{recursive:true});
const checks=(process.env.REFINEMENT_CHECK||'scope,history,density,dialogs,score,account').split(',');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=spawn(process.execPath,['scripts/workspace-browser-fixture.mjs'],{env:{...process.env,COVA_WORKSPACE_FIXTURE_PORT:port},stdio:['ignore','pipe','pipe']});
let log='',browser;server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
const records=[];
async function open(width,height,rows=trades,name='Review account') {
  const c=await browser.newContext({viewport:{width,height},isMobile:width<=850,hasTouch:width<=850,reducedMotion:'reduce'});
  await c.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.fallback():r.abort());
  await c.route('**/api/**',r=>r.request().url().includes('/api/workspace')?r.continue():r.request().url().includes('/api/auth/consent')?r.fulfill({json:{accepted:true}}):r.fulfill({status:404,json:{error:'Isolated fixture'}}));
  await c.addInitScript(({owner,trades,rules,name})=>{
    if(window.top!==window||location.origin==='null'||sessionStorage.getItem('refinement-seeded'))return;
    sessionStorage.setItem('refinement-seeded','1');
    window.__owner=owner;window.__qaSession={user:{id:owner,email:'refinement@example.invalid',app_metadata:{plan:'pro'}},access_token:'qa-'+owner};
    localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'qa-session',email:'refinement@example.invalid',signedInAt:new Date().toISOString()}));
    localStorage.setItem('cova-workspace-mode-v2:'+owner,'local');
    localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades,rules,tradeAccount:'local'}));
    localStorage.setItem('cova-workspace-aux-v1:'+owner,JSON.stringify({version:1,names:{local:name},notes:{},cash:{}}));
    localStorage.setItem('cova-dashboard-range-v1','all');
  },{owner,trades:rows,rules:defaultRules,name});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin+'/#dashboard');await p.locator(rows.length?'.astra-stats-panel':'[data-dashboard-empty]').waitFor();
  await p.evaluate(()=>document.fonts.ready);await p.getByText('Signed in. Account stats are unlocked.',{exact:true}).waitFor({state:'hidden',timeout:15000});
  await p.evaluate(()=>document.documentElement.style.setProperty('scroll-behavior','auto','important'));await sleep(100);
  return {c,p,errors};
}
const rect=locator=>locator.evaluate(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom,right:b.right};});
try {
  for(let i=0;i<400&&!log.includes('LOCAL_WORKSPACE_FIXTURE')&&server.exitCode===null;i++)await sleep(100);
  assert(log.includes(origin+'/__workspace'),log);browser=await chromium.launch({...workspaceBrowserOptions,headless:true});
  for(const [width,height] of [[1440,900],[1280,720],[1024,768],[850,900],[768,1024],[620,900],[390,844],[360,740],[320,640]]) {
    if(process.env.REFINEMENT_QUICK&&![1440,390].includes(width))continue;
    const {c,p,errors}=await open(width,height);const record={width,height,checks:{},errors};
    await p.screenshot({path:path.join(out,`${width}-fold.png`)});
    if(checks.includes('scope')) {
      assert.equal(await p.locator('.astra-chart-panel .dashboard-range-controls').count(),0,'range must not look chart-local');
      const range=p.locator('.dashboard-review-range');assert.equal(await range.count(),1,'one global range');
      assert((await rect(range)).bottom<=(await rect(p.locator('.astra-stats-panel'))).y+1,'range before affected metrics');
      for(const [label,count,date]of [['Latest session',2,'May 6, 2026'],['Last 7 days',9,'Apr 30 – May 6, 2026'],['All trades',25,'Apr 17 – May 6, 2026']]) {
        await p.getByRole('button',{name:label,exact:true}).click();
        assert.equal(await p.locator('[data-dashboard-trade-count]').getAttribute('data-dashboard-trade-count'),String(count));
        const period=await p.locator('.dashboard-review-period').innerText();
        assert(period.includes(date));
        assert(!period.includes('All saved trades')&&!period.includes('Latest trade session'),'Selected control is not repeated as supporting copy');
        if(label==='Last 7 days')assert(period.includes('Ends at latest trade'),'Non-calendar anchor stays explicit');
        assert.equal(await range.locator('button[aria-pressed=true]').count(),1);
      }
      record.checks.scope=true;
    }
    if(checks.includes('density')) {
      const sizes=await p.locator('.astra-chart-svg text').evaluateAll(es=>es.map(e=>parseFloat(getComputedStyle(e).fontSize)));
      assert(sizes.length&&sizes.every(s=>s>=12),'readable chart ticks');
      const title=await rect(p.locator('.astra-chart-panel .astra-panel-heading'));
      // Below 375px the preserved 44px import action takes a second row plus its 8px gap.
      const chartLimit=width<=620?780+(width<375?52:0):width>=1280?440:650;
      assert(title.y<chartLimit,`chart arrives earlier: ${title.y}`);
      const n=await p.locator('[data-astra-stat=pnl] .astra-stat-value').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));assert(n<=44,'restrained lead figure');
      record.checks.density={chartTop:title.y,tickSizes:[...new Set(sizes)],leadSize:n};
    }
    if(checks.includes('account')) {
      const selected=p.locator('.astra-header-controls .cova-account-menu-selection');
      assert(await selected.evaluate(e=>{const s=getComputedStyle(e),copy=document.createElement('span');copy.textContent=e.textContent;Object.assign(copy.style,{position:'fixed',visibility:'hidden',width:'max-content',font:s.font,letterSpacing:s.letterSpacing});document.body.append(copy);const natural=copy.getBoundingClientRect().width;copy.remove();return natural<=e.getBoundingClientRect().width+1;}),'account name not prematurely clipped');
      await p.locator('.astra-header-controls .cova-account-menu-trigger').click();await p.getByRole('menu').waitFor();await p.keyboard.press('Escape');record.checks.account=true;
    }
    if(checks.includes('score')) {
      const text=await p.locator('.oa-discipline-reading').innerText();assert(text.includes('25 trades reviewed'));assert(!text.includes('Good sample'));assert(!text.includes('Established history sample'));assert(text.includes('71'));assert((await p.locator('.oa-discipline-state').innerText()).includes('2 warnings'));assert.equal(await p.getByRole('textbox',{name:'Journal note',exact:true}).getAttribute('placeholder'),'Session note');record.checks.score=true;
    }
    if(checks.includes('history')) {
      await p.getByRole('button',{name:'View all',exact:true}).click();const dialog=p.locator('dialog[open]');await dialog.waitFor();
      const row=dialog.locator('[data-entry-group]').first();assert.equal(await row.locator('td').count(),7,'all existing fields retained');
      for(const field of ['closed','market','side','pnl'])assert.equal(await row.locator(`[data-history-field="${field}"] .history-field-label`).count(),0,'No repeated '+field+' label');
      assert((await dialog.locator('.astra-history-meta').innerText()).includes('Gross / reported P&L'),'Shared financial basis remains visible');
      const money=row.locator('td').nth(4);
      if(width<=620){const b=await rect(money);assert(b.x>=0&&b.right<=width,'P&L visible without horizontal scroll');assert(await dialog.locator('.astra-history-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'mobile history reflows');}
      record.checks.history={fields:await row.innerText()};await p.screenshot({path:path.join(out,`${width}-history.png`)});await p.keyboard.press('Escape');
    }
    if(checks.includes('dialogs')) {
      for(const [name,trigger]of [['trade',p.locator('.astra-trade-link').first()],['review',p.getByRole('button',{name:'Review details',exact:true})],['manual',p.getByRole('button',{name:'Add trade',exact:true})],['history',p.getByRole('button',{name:'View all',exact:true})]]) {
        await trigger.click();const d=p.locator('dialog[open]');await d.waitFor();
        const style=await d.evaluate(e=>{const s=getComputedStyle(e);return{bg:s.backgroundColor,radius:s.borderTopLeftRadius,font:s.fontFamily};});
        assert.equal(style.bg,'rgb(22, 22, 22)',`${name} shares workspace raised surface`);assert.equal(style.radius,'16px');
        const b=await rect(d);assert(b.y>=0&&b.bottom<=height+1,`${name} fits viewport`);
        await p.screenshot({path:path.join(out,`${width}-${name}.png`)});await p.keyboard.press('Escape');await d.waitFor({state:'hidden'});
      }record.checks.dialogs=true;
    }
    assert.equal(await p.evaluate(()=>Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)>innerWidth+1),false,'no root overflow');
    assert.deepEqual(errors,[]);records.push(record);await writeFile(path.join(out,'results.json'),JSON.stringify(records,null,2));
    await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(out,`${width}-fold.png`)});await p.screenshot({path:path.join(out,`${width}-full.png`),fullPage:true});await c.close();
  }
  console.log('PASS dashboard refinement',JSON.stringify(records.map(r=>({width:r.width,checks:r.checks})),null,2));
} finally {
  if(browser)await browser.close();server.kill();for(let i=0;i<100&&server.exitCode===null&&server.signalCode===null;i++)await sleep(50);
  assert(server.exitCode!==null||server.signalCode!==null);let closed=false;for(let i=0;i<40;i++){try{await fetch(origin,{signal:AbortSignal.timeout(300)});}catch{closed=true;break;}await sleep(100);}assert(closed,'owned fixture closed');await writeFile(path.join(out,'fixture.log'),log);
}
