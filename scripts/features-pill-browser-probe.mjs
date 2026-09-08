import assert from 'node:assert/strict';

// Regression for the selected surface stalling/restarting on every tab handoff.
// Run against the production bundle, not a reconstructed component fixture.
export async function exercisePill({ evaluate, setViewport, navigate, cdp }) {
  const results = [];
  for (const width of [1440, 768, 767, 390]) {
    await setViewport(width, 1000, width < 768);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await navigate(`pill-${width}`);
    const result = await evaluate(`(async () => {
      const rail = document.querySelector('.features-system-rail');
      const tabs = [...rail.querySelectorAll('[role=tab]')];
      const pill = rail.querySelector('.features-system-tab-highlight');
      if (!pill || tabs.length !== 5) throw new Error('Pill probe subjects missing');
      const frame = () => new Promise(requestAnimationFrame);

      const rect = node => {const r=node.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
      const frames=[], events=[];
      const initialScroll=window.scrollY;
      const initial={pill:rect(pill),tab:rect(rail.querySelector('[aria-selected=true]'))};
      for (const [index, duration] of [[0,380],[3,75],[4,380],[0,65],[4,65],[1,65],[3,65],[2,380]]) {
        const before=rect(pill);
        tabs[index].click();
        // Commit the selection before measuring animation time. Shader startup
        // can occupy the first frame; elapsed wall time is not compositor time.
        await frame();
        const start=performance.now();
        do {
          await frame();
          const current=rail.querySelector('.features-system-tab-highlight');
          frames.push({stable:current===pill,opacity:Number(getComputedStyle(current).opacity),count:rail.querySelectorAll('.features-system-tab-highlight').length,selected:rail.querySelectorAll('[aria-selected=true]').length,cssTransition:getComputedStyle(current).transitionProperty,nativeMotion:current.getAnimations().some(a=>a.transitionProperty==='transform'),duration:getComputedStyle(current).transitionDuration,rect:rect(current),elapsed:performance.now()-start});
        } while(performance.now()-start<duration);
        if(duration>=380) {
          await Promise.all(pill.getAnimations().map(a=>a.finished.catch(()=>{})));
          await frame();
        }
        const current=rail.querySelector('.features-system-tab-highlight');
        const target=rect(tabs[index]), actual=rect(current);
        events.push({index,duration,before,actual,target,border:tabs[index].clientLeft,windowScroll:window.scrollY});
      }
      return {width:innerWidth,frames,events,initial,initialScroll,overflow:document.documentElement.scrollWidth-innerWidth};
    })()`);
    assert.ok(result.frames.length > 20, 'Must inspect intermediate painted frames');
    assert.ok(result.initial.pill.w>0 && Math.abs(result.initial.pill.x-result.initial.tab.x)<=1.1 && Math.abs(result.initial.pill.y-result.initial.tab.y)<=1.1, `${width}: first-mount pill must be visible and aligned before any click`);
    assert.ok(result.frames.every(f => f.stable), `${width}: pill must retain its DOM/compositor layer through rapid/reverse clicks, not remount per tab`);
    assert.ok(result.frames.every(f => f.count === 1 && f.selected === 1 && f.opacity === 1), `${width}: one opaque pill and one selected tab in every frame`);
    assert.ok(result.frames.every(f => f.cssTransition.includes('transform')), `${width}: browser owns the pill transform between commits`);
    assert.ok(result.frames.some(f => f.nativeMotion), `${width}: require actual native transform animation, not just a CSS declaration`);
    assert.ok(result.frames.every(f => parseFloat(f.duration)<=0.26), `${width}: no long spring tail`);
    assert.equal(result.overflow, 0);
    for (const e of result.events.filter(e => e.duration >= 380)) {
      assert.ok(Math.abs(e.actual.x-e.target.x-e.border) < 1.1 && Math.abs(e.actual.y-e.target.y-e.border) < 1.1, `${width}: settled pill must align with actual selected tab: ${JSON.stringify(e)}`);
      assert.equal(e.windowScroll,result.initialScroll,`${width}: tab reveal must not scroll the document`);
    }
    results.push({width,frames:result.frames.length,selections:result.events.length});
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const reduced = await evaluate(`(async()=>{const rail=document.querySelector('.features-system-rail'),pill=rail.querySelector('.features-system-tab-highlight');document.getElementById('feature-tab-trade-journal').click();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const p=pill.getBoundingClientRect(),t=document.getElementById('feature-tab-trade-journal').getBoundingClientRect();return {duration:getComputedStyle(pill).transitionDuration,dx:Math.abs(p.x-t.x),dy:Math.abs(p.y-t.y),stable:pill===rail.querySelector('.features-system-tab-highlight')}})()`);
    assert.equal(reduced.duration,'0s',`${width}: reduced-motion pill must move instantly`);
    assert.ok(reduced.stable && reduced.dx<=1.1 && reduced.dy<=1.1, `${width}: reduced ${JSON.stringify(reduced)}`);
  }
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  return results;
}
