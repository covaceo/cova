// Run via test:ask-cova-panel: real App/canonical CSS, isolated synthetic transport.
import assert from 'node:assert/strict';
export async function runPanelChecks({open,finish,check,screenshot}) {
 const s=await open({width:1440,scenario:'panel'});
 try {
  const p=s.page,launcher=p.getByRole('button',{name:'Ask Cova',exact:true});
  assert.equal(await launcher.count(),1,'Eligible Risk Desk needs a header Ask Cova launcher');
  assert.equal(await launcher.getAttribute('aria-expanded'),'false');
  assert.equal(await p.locator('[data-ask-cova]').isVisible(),false,'Conversation is collapsed by default');
  assert.equal(s.asks.length,0);
  await screenshot(s,'closed');
  await p.getByRole('button',{name:'Review details',exact:true}).click();
  await p.getByRole('dialog',{name:'Review details',exact:true}).waitFor();
  assert(await p.getByRole('heading',{name:'Risk summary',exact:true}).isVisible(),'Detailed score evidence survives the surface change');
  await p.keyboard.press('Escape');await p.locator('[data-discipline-details]').waitFor({state:'detached'});
  await p.getByRole('button',{name:'Previous month',exact:true}).click();await p.getByRole('button',{name:'Next month',exact:true}).click();
  check('Score evidence and calendar controls remain interactive',true);
  await launcher.click();
  await p.locator('[data-ask-cova]').waitFor();
  assert.equal(await launcher.getAttribute('aria-expanded'),'true');
  const boxes=await p.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top};};return {panel:box('[data-ask-cova]'),stats:box('.astra-stats-panel')};});
  assert(boxes.stats.right<=boxes.panel.left,'Dock must reserve space, not cover metrics');
  await screenshot(s,'open');
  const surfaces=await p.locator('.astra-stats-panel,.astra-chart-panel,.astra-recent-trades,.oa-discipline,.mini-journal,[data-ask-cova]').evaluateAll(els=>els.map(el=>{const c=getComputedStyle(el);return {name:el.className,bg:c.backgroundColor,border:c.borderTopWidth,radius:c.borderRadius,shadow:c.boxShadow};}));
  assert(surfaces.every(c=>c.bg==='rgba(0, 0, 0, 0)'&&c.border==='0px'&&c.radius==='0px'&&c.shadow==='none'),'Seamless v2: no enclosing filled/outlined/rounded cards: '+JSON.stringify(surfaces));
  const composition=await p.evaluate(()=>{const b=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,bottom:r.bottom};};return {chart:b('.astra-chart-panel'),trades:b('.astra-recent-trades'),score:b('.oa-discipline'),journal:b('.mini-journal')};});
  assert(Math.abs(composition.chart.width-composition.trades.width)<2&&composition.score.y>=composition.trades.bottom&&Math.abs(composition.score.y-composition.journal.y)<2,'Reference composition: full-width equity, recent trades, then score beside journal');
  check('Seamless canvas and reference composition',true,{surfaces,composition});
  assert(await p.locator('.astra-chart-svg').evaluate(el=>el.getBoundingClientRect().height<=240),'Reference equity plot is full-width and compact, leaving recent trades and lower sections visible');
  assert.equal(await p.locator('.ask-cova-composer button svg').count(),1,'Reference composer uses an accessible icon send control');
  const quiet=await p.locator('.ask-cova-questions button').first().evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.equal(quiet,'rgba(0, 0, 0, 0)','Reference suggestions are text, not pills');
  assert.equal(await p.locator('.astra-recent-trades th').count(),9,'Recent table exposes actual date, market, side, setup, quantity, entry, exit, reported result and validated R');
  check('Header launcher, default collapsed, reserved desktop dock',true,boxes);
  const composer=p.getByRole('textbox',{name:'Message Cova',exact:true});
  await composer.fill('keep my draft');
  const fullWidth=await p.locator('.astra-stats-panel').evaluate(el=>el.getBoundingClientRect().width);
  assert.equal(await p.getByRole('button',{name:'Close Ask Cova',exact:true}).count(),1,'Dock requires a close control');
  // Retained React handlers in the same task must lose dispatch authority immediately.
  await p.evaluate(()=>{const close=document.querySelector('[aria-label="Close Ask Cova"]'),form=document.querySelector('.ask-cova-composer'),preset=document.querySelector('.ask-cova-questions button');close.click();form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));preset.click();});
  await p.waitForTimeout(250);
  assert.equal(s.asks.length,0,'Closing synchronously revokes hidden controls');
  assert.equal(await p.locator('[data-ask-cova]').isVisible(),false);
  assert(await p.locator('.astra-stats-panel').evaluate((el,w)=>el.getBoundingClientRect().width>w,fullWidth));
  assert(await launcher.evaluate(el=>document.activeElement===el),'Close restores launcher focus');
  await launcher.click();
  assert.equal(await composer.inputValue(),'keep my draft');
  assert.match(await p.locator('.ask-cova-scope').innerText(),/Sample review.*All trades/);
  await p.getByRole('button',{name:'Review my results',exact:true}).click();
  await p.locator('[data-cova-answer]').waitFor();
  await composer.fill('another draft');
  await p.getByRole('button',{name:'Close Ask Cova',exact:true}).click();
  await launcher.click();
  assert.equal(await composer.inputValue(),'another draft');
  assert.equal(await p.locator('[data-cova-answer]').count(),1);
  assert.equal(s.asks.length,1);
  await composer.fill('');
  await screenshot(s,'answer');
  const cdp=await p.context().newCDPSession(p);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
  const {root}=await cdp.send('DOM.getDocument');const fonts=[];
  for(const selector of ['.astra-title h1','.ask-cova-heading h2','[data-cova-answer]']){const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});const value=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});assert(value.fonts.some(f=>f.isCustomFont&&/Inter/.test(f.familyName)&&f.glyphCount>0),'Real Inter glyphs for '+selector);fonts.push({selector,...value});}
  check('Functional Inter fonts actually painted',true,fonts);await cdp.detach();
  await p.locator('.ask-cova-privacy summary').click();
  assert(await p.getByText(/Your message, recent Cova chat, and relevant saved account data/).isVisible());
  await screenshot(s,'disclosure');
  check('Close restores width/focus and retains scoped thread/draft without hidden dispatch',true);
 } finally {await finish(s);}
 for(const width of [1536,1280,1279,851,850,768,621,620,390,320]) {
  const s=await open({width,scenario:'responsive-panel'});
  try {
   const p=s.page,launcher=p.getByRole('button',{name:'Ask Cova',exact:true}),panel=p.locator('#ask-cova-panel');
   await screenshot(s,'closed');
   const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert(overflow<=1,'No closed dashboard overflow');
   const rangeFit=await p.locator('.astra-segmented').evaluate(el=>{const r=el.getBoundingClientRect();return [...el.querySelectorAll('button')].every(b=>{const x=b.getBoundingClientRect();return x.left>=r.left-1&&x.right<=r.right+1&&b.scrollWidth<=b.clientWidth+1;});});
   assert(rangeFit,'Complete date-range labels fit without clipped edges at '+width);
   if(width<=850){const actions=await p.locator('.astra-add-trade,.astra-import-action').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));assert(Math.abs(actions[0].y-actions[1].y)<1&&Math.abs(actions[0].width-actions[1].width)<1,'Add/import share an equal-width row at '+width);}
   await launcher.click();await p.locator('[data-ask-cova]').waitFor();
   assert(await p.getByRole('button',{name:'Close Ask Cova',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el===hit||el.contains(hit);}), 'Sheet close must not be obscured by workspace navigation');
   const cells=await p.locator('.astra-stat-cell').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect(),v=el.querySelector('.astra-stat-value').getBoundingClientRect();return {cell:r.toJSON(),value:v.toJSON(),overflow:el.scrollWidth-el.clientWidth};}));
   assert(cells.every(c=>c.overflow<=1),'Metric values fit their own cells: '+JSON.stringify(cells));
   if(width<1280){
    assert.equal(await panel.getAttribute('role'),'dialog','Narrow Ask must be an accessible modal sheet');
    assert.equal(await panel.getAttribute('aria-modal'),'true');
    assert(await p.locator('.dashboard-ask-content').evaluate(el=>el.inert),'Background data is inert');
    assert(await panel.evaluate(el=>el.contains(document.activeElement)),'Opening sheet moves focus inside');
    for(let i=0;i<15;i++){await p.keyboard.press('Tab');assert(await panel.evaluate(el=>el.contains(document.activeElement)),'Sheet traps tab');}
   }
   await p.getByRole('button',{name:'Review my results',exact:true}).click();await p.locator('[data-cova-answer]').waitFor();
   await p.getByRole('button',{name:'Show trades',exact:true}).click();await p.locator('dialog[open]').waitFor();
   await p.keyboard.press('Escape');await p.locator('dialog[open]').waitFor({state:'detached'});
   assert(await panel.isVisible(),'First Escape closes inner evidence only');
   await screenshot(s,'answer');
   await p.keyboard.press('Escape');assert.equal(await panel.isVisible(),false,'Escape closes Ask');
   assert(await launcher.evaluate(el=>el===document.activeElement),'Escape restores launcher');
   assert.equal(await p.locator('.dashboard-ask-content').evaluate(el=>el.inert),false);
   check('Responsive panel '+width,true);
   if(width===1536){
    await launcher.click();const composer=p.getByRole('textbox',{name:'Message Cova',exact:true});
    await composer.fill('resize draft');
    for(const focus of ['inside','outside']){
     if(focus==='outside')await p.getByRole('button',{name:'Add trade',exact:true}).focus();else await composer.focus();
     await p.setViewportSize({width:390,height:844});
     await p.waitForFunction(()=>document.querySelector('#ask-cova-panel')?.getAttribute('aria-modal')==='true');
     assert(await panel.evaluate(el=>el.contains(document.activeElement)),'Resize from '+focus+' transfers/keeps focus in sheet');
     await p.setViewportSize({width:1536,height:1000});
     await p.waitForFunction(()=>!document.querySelector('#ask-cova-panel')?.hasAttribute('aria-modal'));
     assert.equal(await p.locator('.dashboard-ask-content').evaluate(el=>el.inert),false);
     assert.equal(await composer.inputValue(),'resize draft');
    }
    await p.setViewportSize({width:390,height:844});await p.waitForTimeout(100);
    await p.getByRole('button',{name:'Show trades',exact:true}).click();await p.locator('dialog[open]').waitFor();
    await p.setViewportSize({width:1536,height:1000});await p.waitForTimeout(100);
    await p.keyboard.press('Escape');await p.locator('dialog[open]').waitFor({state:'detached'});
    await p.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
    assert.notEqual(await p.evaluate(()=>document.body.style.overflow),'hidden','Resize with nested evidence restores scroll');
    assert.equal(await p.locator('dialog[open]').count(),0);
    await launcher.click();s.holdNextAsk=true;
    await composer.fill('pending close');await p.getByRole('button',{name:'Send message',exact:true}).click();
    await p.waitForFunction(()=>!!document.querySelector('[data-cova-processing]'));
    const until=Date.now()+10000;while(!s.releaseHeld&&Date.now()<until)await p.waitForTimeout(25);assert(s.releaseHeld);
    await p.getByRole('button',{name:'Close Ask Cova',exact:true}).click();s.releaseHeld();await p.waitForTimeout(250);
    assert(await launcher.evaluate(el=>el===document.activeElement),'Async completion must not steal closed focus');
    await launcher.click();s.longReply=true;
    for(let i=0;i<8;i++){const n=await p.locator('[data-cova-answer]').count();await composer.fill('History review '+i);await p.getByRole('button',{name:'Send message',exact:true}).click();await p.waitForFunction(n=>document.querySelectorAll('[data-cova-answer]').length===n+1,n);}
    assert(await p.locator('.ask-cova-scroll').evaluate(el=>el.scrollHeight>el.clientHeight),'Long thread has internal scroll');
    assert(await p.locator('[data-cova-answer]').last().evaluate(el=>{const r=el.getBoundingClientRect(),s=el.closest('.ask-cova-scroll').getBoundingClientRect();return r.bottom>s.top&&r.bottom<=s.bottom+1;}),'Deliberately sending a new question keeps the newest reply in view');
    s.holdNextAsk=true;const beforeRead=await p.locator('[data-cova-answer]').count();
    await composer.fill('Read older evidence while pending');await p.getByRole('button',{name:'Send message',exact:true}).click();
    const readUntil=Date.now()+10000;while(!s.releaseHeld&&Date.now()<readUntil)await p.waitForTimeout(25);assert(s.releaseHeld);
    await p.locator('.ask-cova-scroll').evaluate(el=>{el.scrollTop=0;});await p.waitForTimeout(100);s.releaseHeld();
    await p.waitForFunction(n=>document.querySelectorAll('[data-cova-answer]').length===n+1,beforeRead);
    assert(await p.locator('.ask-cova-scroll').evaluate(el=>el.scrollTop<1),'Late reply respects reading older history');
    await p.setViewportSize({width:320,height:480});await p.waitForTimeout(100);
    await p.locator('.ask-cova-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    const fits=await composer.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;});assert(fits,'Composer fits short/keyboard-sized viewport');
    await screenshot(s,'long-short-sheet');
    await p.getByRole('button',{name:'Close Ask Cova',exact:true}).click();
    check('Resize, inner evidence, pending close, long thread and keyboard-sized viewport',true);
   }
  }finally{await finish(s);}
 }
}
