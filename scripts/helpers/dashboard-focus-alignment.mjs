import assert from 'node:assert/strict';

// Trusted pointer + keyboard events against the real workspace, not CSS source snapshots.
export async function checkDashboardFocusAlignment({ evaluate, send, capture, name, mobile }) {
  const key = async (key, code, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: code, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code, modifiers });
    await new Promise(resolve => setTimeout(resolve, 60));
  };
  const click = async selector => {
    const point = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block:'nearest',behavior:'instant'}); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; })()`);
    if (mobile) {
      await send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[point]});
      await send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    } else {
      await send('Input.dispatchMouseEvent', {type:'mousePressed', ...point, button:'left', clickCount:1});
      await send('Input.dispatchMouseEvent', {type:'mouseReleased', ...point, button:'left', clickCount:1});
    }
    await new Promise(resolve => setTimeout(resolve, 80));
  };
  const style = selector => evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(e); return {outline:s.outlineStyle,shadow:s.boxShadow,focused:document.activeElement===e}; })()`);
  const report = {name, pointer:[], keyboard:[], alignment:null};
  const issues = [];
  const quiet = async selector => {
    const state=await style(selector);report.pointer.push({selector,...state});
    if(state.outline!=='none'||state.shadow!=='none')issues.push('Pointer focus adds a ring: '+selector);
  };
  const accountBefore=await evaluate(`document.querySelector('[data-account-switcher] select').value`);
  await click('[data-account-switcher] select');
  await key('Escape',27);
  assert.equal(await evaluate(`document.querySelector('[data-account-switcher] select').value`),accountBefore,'Opening/dismissing the account picker preserves selection');
  await quiet('[data-account-switcher] select');
  assert.equal((await style('[data-account-switcher] select')).focused,true);
  await capture(name+'-account-click');
  await key('Tab',9);
  const keyboardButton=await evaluate(`(() => {const e=document.activeElement,s=getComputedStyle(e);return {button:e.matches('button'),visible:e.matches(':focus-visible'),outline:s.outlineStyle,shadow:s.boxShadow};})()`);
  report.keyboard.push(keyboardButton);
  if(!keyboardButton.button||!keyboardButton.visible||(keyboardButton.outline==='none'&&keyboardButton.shadow==='none'))issues.push('Tab must restore a visible keyboard indicator');
  await click('.dashboard-range-controls button:last-child');
  await quiet('.dashboard-range-controls button:last-child');
  if(!mobile){
    await click('.workspace-sidebar-search input');
    await send('Input.insertText',{text:'risk'});
    await quiet('.workspace-sidebar-search input');
    await quiet('.workspace-sidebar-search');
    await capture(name+'-search-click');
    await key('a',65,2);await key('Backspace',8);
    await key('Tab',9);
    const keyboardRail=await evaluate(`(() => {const e=document.activeElement,s=getComputedStyle(e);return {route:e.matches('.workspace-sidebar-link, .astra-rail-account'),visible:e.matches(':focus-visible'),outline:s.outlineStyle,shadow:s.boxShadow};})()`);
    report.keyboard.push(keyboardRail);
    if(!keyboardRail.route||!keyboardRail.visible||(keyboardRail.outline==='none'&&keyboardRail.shadow==='none'))issues.push('Keyboard navigation in the rail must stay visible');
    report.alignment=await evaluate(`(() => {
      const strip=document.querySelector('.astra-stat-strip').getBoundingClientRect();
      const baseline=e=>{const p=document.createElement('span');p.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline';e.append(p);const y=p.getBoundingClientRect().top;p.remove();return y;};
      const cells=[...document.querySelectorAll('.astra-stat-cell')].map(e=>{const l=e.querySelector('.astra-stat-label'),v=e.querySelector('.astra-stat-value'),support=e.querySelector('[data-win-loss]');return{id:e.dataset.astraStat,labelY:l.getBoundingClientRect().top,valueBaseline:baseline(v),top:l.getBoundingClientRect().top,valueBottom:v.getBoundingClientRect().bottom,supportTop:support?.getBoundingClientRect().top??null,bottom:Math.max(v.getBoundingClientRect().bottom,support?.getBoundingClientRect().bottom??0)};});
      return {cells,top:strip.top,bottom:strip.bottom};
    })()`);
    const a=report.alignment;
    if(a.cells.some(c=>c.supportTop!==null&&c.supportTop<c.valueBottom+2))issues.push('Win/loss support overlaps its value');
    if(Math.max(...a.cells.map(c=>c.labelY))-Math.min(...a.cells.map(c=>c.labelY))>1)issues.push('Metric labels are not aligned');
    if(Math.max(...a.cells.map(c=>c.valueBaseline))-Math.min(...a.cells.map(c=>c.valueBaseline))>1)issues.push('Metric number baselines are not aligned');

    const topGap=Math.min(...a.cells.map(c=>c.top))-a.top;
    const bottomGap=a.bottom-Math.max(...a.cells.map(c=>c.bottom));
    if(Math.abs(topGap-bottomGap)>8)issues.push('Stats strip has unbalanced vertical breathing room');
  }
  await evaluate(`document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'})`);
  if (!mobile) {
    await click('.workspace-sidebar-search input');
    await evaluate(`(() => {const b=document.createElement('button');b.id='qa-outside-workspace';b.textContent='QA tab origin';document.body.prepend(b);b.focus();})()`);
    await key('Tab',9);
    assert.equal(await evaluate(`document.querySelector('.oa-dashboard-shell').dataset.focusSource`),'keyboard','Tab from outside the workspace restores keyboard mode');
    assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`),'solid');
    await evaluate(`document.querySelector('#qa-outside-workspace').remove()`);
    await click('.workspace-sidebar-search input');
    await send('Emulation.setEmulatedMedia',{features:[{name:'forced-colors',value:'active'}]});
    assert.equal((await style('.workspace-sidebar-search input')).outline,'solid','Forced-colors accessibility retains a focus boundary');
    await send('Emulation.setEmulatedMedia',{features:[]});
    await evaluate(`document.activeElement?.blur()`);
  }
  console.log(JSON.stringify({focusAndAlignment:report,issues}));
  assert.deepEqual(issues,[],name+' focus/alignment regressions');
  return report;
}
