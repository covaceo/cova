// Outer-frame acceptance against immutable HEAD, with canonical real-App CSS.
import {workspaceRoutes,workspaceSemanticChecks,workspaceStateChecks} from './workspace-consistency-browser.mjs';
import {workspaceNavigation,workspaceDetails,workspaceLocalEditing,workspacePending} from './workspace-consistency-interactions.mjs';
const widths=[2560,1920,1536,1440,1280,851,850,768,390,360];
const gutter=w=>w>=1920?64:w>=1400?48:w>850?40:w>620?24:20;
export async function frame(page){return page.evaluate(()=>{
 const box=el=>el?.getBoundingClientRect().toJSON(),root=document.querySelector('.workspace-content'),canvas=document.querySelector('.astra-dashboard,.astra-workspace-page'),c=getComputedStyle(canvas),heading=document.querySelector('.workspace-content h1');
 const style=el=>{const s=getComputedStyle(el);return [s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight,s.letterSpacing,s.color];};
 return {workspace:box(root),canvas:box(canvas),left:canvas.getBoundingClientRect().left+parseFloat(c.paddingLeft),right:innerWidth-canvas.getBoundingClientRect().right+parseFloat(c.paddingRight),top:canvas.getBoundingClientRect().top+parseFloat(c.paddingTop),heading:box(heading),headingStyle:style(heading),rootFont:getComputedStyle(document.documentElement).fontSize,overflow:document.documentElement.scrollWidth-innerWidth,zoom:getComputedStyle(root).zoom,sync:box(document.querySelector('.workspace-sync-compact summary')),trigger:box(document.querySelector('.workspace-content .workspace-menu-trigger')),controls:[...canvas.querySelectorAll('button,input,select,textarea')].map(e=>({tag:e.tagName,label:e.getAttribute('aria-label')||e.textContent.trim(),type:e.type})),text:canvas.innerText.replace(canvas.querySelector('.trading-calendar')?.innerText||'','').replace(/\s+/g,' ').trim(),calendar:canvas.querySelector('.trading-calendar')?.textContent.replace(/\s+/g,' ').trim()};
 });}
export async function runFramingChecks({open,finish,check,screenshot,report,out}){
 if(process.argv.includes('--framing-stress-only')){const {framingStress}=await import('./workspace-framing-stress.mjs');return framingStress({open,finish,check,screenshot,report,out});}
 const quick=process.argv.includes('--framing-red'),activeWidths=quick?[2560]:widths,pairs={};let count=0;
 report.framingInventory={routes:workspaceRoutes,widths:activeWidths,expected:activeWidths.length*workspaceRoutes.length*2,actual:0};
 for(const width of activeWidths){pairs[width]={};for(const variant of ['baseline','enabled']){
  const s=await open({width,variant,scenario:'framing'}),p=s.page;s.expectedPlanWrites=2;pairs[width][variant]={};
  try{for(const route of workspaceRoutes){
   await p.evaluate(r=>location.hash='#'+r,route);await p.waitForTimeout(350);await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>scrollTo(0,0));
   check(`${variant} ${width} ${route} exact destination`,new URL(p.url()).hash==='#'+route&&await p.locator(`[data-workspace-section="${route}"]`).count()===1);
   const m=await frame(p);pairs[width][variant][route]=m;report.measurements.push({variant,width,route,...m});count++;
   if([2560,1440,390].includes(width))await screenshot(s,route);
   if(variant==='enabled'){
    const headingKeys=['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing'];
    await workspaceSemanticChecks(p,width,route,Object.fromEntries(headingKeys.map((k,i)=>[k,pairs[width].enabled.dashboard.headingStyle[i]])),check);
    const side=(width-Math.min(width,2240))/2+gutter(width);
    check(`${width} ${route} exact symmetric outer gutters`,Math.abs(m.left-side)<1&&Math.abs(m.right-side)<1,{expected:side,actual:m});
    check(`${width} ${route} centered bounded workspace`,Math.abs(m.workspace.width-Math.min(width,2240))<1&&Math.abs(m.workspace.x-(width-m.workspace.width)/2)<1,m.workspace);
    check(`${width} ${route} meaningful top gap and nav clearance`,width>850?Math.abs(m.top-32)<1:m.heading.y>=80,m);
    check(`${width} ${route} no page overflow or zoom`,m.overflow<=1&&m.zoom==='1'&&m.rootFont==='16px',m);
    if(width>850&&m.sync)check(`${width} ${route} sync follows title inside frame`,m.sync.x>=m.trigger.right+12&&Math.abs(m.sync.y-42)<1&&m.sync.right<=width-side,m);
    const b=pairs[width].baseline[route];check(`${width} ${route} approved typography and controls preserved`,JSON.stringify(m.headingStyle)===JSON.stringify(b.headingStyle)&&JSON.stringify(m.controls)===JSON.stringify(b.controls),{before:b.headingStyle,after:m.headingStyle});
    check(`${width} ${route} complete visible content preserved`,m.text===b.text&&m.calendar===b.calendar);
   }
   if(route==='dashboard'&&[2560,1440,1280,850,390,360].includes(width)){
    await p.getByRole('button',{name:'Ask Cova',exact:true}).click();
    if([2560,1440,390].includes(width))await screenshot(s,'dashboard-ask-open');
    const bounds=await p.locator('#ask-cova-panel').evaluate(el=>({box:el.getBoundingClientRect().toJSON(),modal:el.getAttribute('aria-modal'),composer:el.querySelector('.ask-cova-composer').getBoundingClientRect().toJSON()}));
    if(variant==='enabled'){check(`${width} Ask remains inside frame or full viewport modal`,width>=1280?Math.abs(bounds.box.right-(width-m.right))<1:bounds.box.x===0&&bounds.box.width===width,bounds);check(`${width} composer reachable`,bounds.composer.right<=width&&bounds.composer.width>=240,bounds);}
    await p.getByRole('button',{name:'Close Ask Cova',exact:true}).click();
   }
   if(!quick&&[1440,390].includes(width)){
    await workspaceDetails(s,route,{check,screenshot});if(variant==='enabled')await workspaceNavigation(s,route,{check,screenshot});
   }
  }}finally{await finish(s);}
 }}
 if(!quick){const {framingStress}=await import('./workspace-framing-stress.mjs');await framingStress({open,finish,check,screenshot,report,out});}
 report.framingInventory.actual=count;check('Complete fail-closed route/viewport inventory',count===report.framingInventory.expected&&Object.keys(pairs).length===activeWidths.length,report.framingInventory);
 if(!quick)for(const width of [1440,390]){
  await workspaceLocalEditing(open,finish,{check,screenshot},width);
  for(const variant of ['baseline','enabled'])await workspacePending(open,finish,{check,screenshot},width,variant);
  for(const variant of ['baseline','enabled'])for(const scenario of ['workspace-empty','workspace-free','oauth-unavailable']){
   const s=await open({variant,width,scenario,plan:scenario==='workspace-free'?'free':'pro'});s.expectedPlanWrites=scenario==='oauth-unavailable'?1:2;
   try{for(const route of scenario==='oauth-unavailable'?['oauth']:['coach','rules','passport']){
    await s.page.evaluate(r=>location.hash='#'+r,route);await s.page.waitForTimeout(350);await s.page.evaluate(()=>scrollTo(0,0));
    await workspaceStateChecks(s,scenario,route,check);
    const m=await frame(s.page);if(variant==='enabled')check(`${width} ${scenario} ${route} retains frame`,Math.abs(m.left-gutter(width))<1&&Math.abs(m.right-gutter(width))<1&&m.overflow<=1,m);
    await screenshot(s,route);if(scenario==='workspace-free')await workspaceDetails(s,route,{check,screenshot});
   }}finally{await finish(s);}
  }
 }
}
