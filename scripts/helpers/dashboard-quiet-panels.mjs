import assert from 'node:assert/strict';

export async function checkQuietDashboardPanels(evaluate, name) {
  const state = await evaluate(`(() => {
    const alpha = color => {const values=color.match(/[\\d.]+/g)||[];return values.length===4?Number(values[3]):1;};
    const surfaces=[...document.querySelectorAll('.astra-stats-panel,.astra-panel,.astra-journal .astra-mini-note')].map(e=>{const s=getComputedStyle(e);return {class:e.className,fill:alpha(s.backgroundColor),border:alpha(s.borderTopColor),opacity:s.opacity,shadow:s.boxShadow};});
    const dividers=[...document.querySelectorAll('.astra-stat-cell,.astra-average-strip,.astra-average-cell,.astra-trade-table th,.astra-trade-table td')].flatMap(e=>{const s=getComputedStyle(e);return ['Top','Right','Bottom','Left'].filter(side=>parseFloat(s['border'+side+'Width'])>0&&s['border'+side+'Style']!=='none').map(side=>({class:e.className,alpha:alpha(s['border'+side+'Color'])}));});
    const fadedContent=[...document.querySelectorAll('.astra-stat-value,.astra-stat-label,.astra-panel-heading h2,.astra-chart-svg')].filter(e=>{for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(Number(s.opacity)!==1||s.filter!=='none')return true;}return false;}).map(e=>e.className?.baseVal??e.className);
    return {surfaces,dividers,fadedContent,labelColor:getComputedStyle(document.querySelector('.astra-stat-label')).color,curveColor:getComputedStyle(document.querySelector('.astra-curve')).stroke,stripFill:alpha(getComputedStyle(document.querySelector('.astra-stats-panel .astra-stat-strip')).backgroundColor)};
  })()`);
  assert.ok(state.surfaces.length>=5,name+' all statistics/chart/content boxes are checked');
  for(const surface of state.surfaces){assert.ok(surface.fill<=0.35,name+' panel fill must recede: '+JSON.stringify(surface));assert.ok(surface.border<=0.15,name+' panel outline must recede: '+JSON.stringify(surface));assert.equal(surface.opacity,'1');assert.equal(surface.shadow,'none');}
  assert.equal(state.stripFill,0,'Do not stack another opaque fill inside the stats box');
  for(const divider of state.dividers)assert.ok(divider.alpha<=0.1,name+' divider must recede: '+JSON.stringify(divider));
  assert.deepEqual(state.fadedContent,[],'Do not fade text, graph or their ancestors');
  assert.equal(state.labelColor,'rgb(224, 232, 245)');
  assert.equal(state.curveColor,'rgb(79, 125, 255)');
  console.log(JSON.stringify({quietPanels:name,...state}));
}
