// Portable full-App workspace acceptance. Synthetic records, canonical CSS, no external authority.
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {workspaceNavigation,workspaceDetails,workspaceLocalEditing,workspacePending} from './workspace-consistency-interactions.mjs';
export const workspaceRoutes=['dashboard','rules','coach','import','oauth','passport'];
const roles=async page=>page.evaluate(()=>{
 const token=el=>{if(!el)return null;const c=getComputedStyle(el),r=el.getBoundingClientRect();return {fontFamily:c.fontFamily,fontSize:c.fontSize,fontWeight:c.fontWeight,lineHeight:c.lineHeight,letterSpacing:c.letterSpacing,color:c.color,background:c.backgroundColor,border:c.border,padding:c.padding,box:r.toJSON()};};
 return {heading:token(document.querySelector('.workspace-content h1')),trigger:token(document.querySelector('.workspace-menu-trigger')),overflow:document.documentElement.scrollWidth-innerWidth};
});
// Shared active semantics; outer coordinates alone are superseded by framing.
export async function workspaceSemanticChecks(p,width,route,reference,check){
 const tokens=await roles(p);
      check(`${width} ${route} no horizontal overflow`,tokens.overflow<=1,tokens.overflow);
      if(width<=850&&route!=='dashboard'){const ref=reference,h=tokens.heading;check(`${width} ${route} exact mobile Risk Desk type`,!!h&&['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing'].every(k=>h[k]===ref[k]),{reference:ref,actual:h});}
      if(width<=850)check(`${width} ${route} title clears mobile navigation`,!!tokens.heading&&tokens.heading.box.y>=64,tokens.heading);
      if(route==='rules')check(`${width} Limits uses full workspace width`,await p.locator('.li-page').evaluate(el=>Math.abs(el.getBoundingClientRect().right-document.querySelector('.astra-workspace-page').getBoundingClientRect().right+parseFloat(getComputedStyle(document.querySelector('.astra-workspace-page')).paddingRight))<2));
      if(route==='coach'&&width>600)check(`${width} desktop has no mobile Back`,!await p.locator('.ip-back-setups').isVisible());
      if(route!=='dashboard'&&width>850){
       const surfaces=await p.locator('.li-panel,.ip-workbench > article,.manual-accounts,.accounts-platform,.passport-utility-controls,.oauth-unavailable').evaluateAll(els=>els.map(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderLeftWidth,shadow:getComputedStyle(el).boxShadow})));
       check(`${width} ${route} continuous content surfaces`,surfaces.every(s=>s.background==='rgba(0, 0, 0, 0)'&&s.border==='0px'&&s.shadow==='none'),surfaces);
       check(`${width} ${route} approved compact navigation`,await p.locator('.workspace-shell').getAttribute('data-compact-navigation')==='true');
       check(`${width} ${route} visible header trigger`,await p.getByRole('button',{name:'Open workspace menu',exact:true}).isVisible());
       const ref=reference,h=tokens.heading;
       check(`${width} ${route} exact Risk Desk heading typography`,!!h&&['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing'].every(k=>h[k]===ref[k]),{reference:ref,actual:h});
       check(`${width} ${route} no duplicate breadcrumb band`,await p.locator('.astra-deskbar').count()===0);
      }
}
export async function workspaceStateChecks(s,scenario,route,check){
 check(`${s.id} ${route} exact state destination`,new URL(s.page.url()).hash==='#'+route&&await s.page.locator(`[data-workspace-section="${route}"]`).count()===1);
 if(scenario==='oauth-unavailable')check(`${s.id} actual unavailable branch`,await s.page.locator('.oauth-unavailable').isVisible());
 if(scenario==='workspace-empty'&&route==='coach')check(`${s.id} empty Insights`,await s.page.locator('[data-insights-empty]').isVisible());
}
export async function runWorkspaceChecks({open,finish,check,screenshot,report,out}){
 // Current outer-frame contract replaces legacy pixel coordinates, not interaction/data gates.
 // --workspace-legacy retains the historical pre-framing geometry suite for baseline diagnosis.
 if(!process.argv.includes('--workspace-details')&&!process.argv.includes('--workspace-legacy')){const {runFramingChecks}=await import('./workspace-framing-browser.mjs');return runFramingChecks({open,finish,check,screenshot,report,out});}
 if(process.argv.includes('--workspace-details')){for(const width of [1440,390])for(const variant of ['baseline','enabled']){const s=await open({width,variant,scenario:'workspace-details'});s.expectedPlanWrites=2;try{for(const route of ['import','passport']){await s.page.evaluate(route=>location.hash='#'+route,route);await s.page.waitForTimeout(500);await workspaceDetails(s,route,{check,screenshot});}}finally{await finish(s);}}return;}
 const quick=process.argv.includes('--workspace-frame');
 const widths=process.env.WORKSPACE_WIDTHS?process.env.WORKSPACE_WIDTHS.split(',').map(Number):quick?[1440]:[1536,1440,1280,851,850,768,390,360];
 report.workspaceInventory={routes:workspaceRoutes,routeCount:workspaceRoutes.length,widths,states:['populated','empty','free','browser-only','storage-pending','navigation','search','settings','profile','route-details'],fixture:'same fixed 2026-10-30 clock; synthetic accounts; no provider calls'};
 for(const width of widths){
  const pairs={};
  for(const variant of ['baseline','enabled']){
   const s=await open({variant,width,scenario:'workspace'});s.expectedPlanWrites=2;const p=s.page;
   try{
    pairs[variant]={};
    for(const route of workspaceRoutes){
     await p.evaluate(route=>location.hash='#'+route,route);await p.waitForTimeout(500);await p.evaluate(()=>document.fonts.ready);
     check(`${variant} ${width} ${route} actual destination`,new URL(p.url()).hash==='#'+route&&await p.locator(`[data-workspace-section="${route}"]`).count()===1);
     const image=await screenshot(s,route,route==='dashboard'?'.astra-dashboard':undefined),tokens=await roles(p);pairs[variant][route]={image,tokens};report.measurements.push({variant,width,route,...tokens});
     if(route==='dashboard'&&[1536,1440,1280,768,390].includes(width)){
      await p.getByRole('button',{name:'Ask Cova',exact:true}).click();pairs[variant].askOpen=await screenshot(s,'dashboard-ask-open','.astra-dashboard');await p.getByRole('button',{name:'Close Ask Cova',exact:true}).click();
     }
     if(variant==='enabled')await workspaceSemanticChecks(p,width,route,pairs.enabled.dashboard.tokens.heading,check);
     if([1440,390].includes(width)&&!quick){
      try{await workspaceDetails(s,route,{check,screenshot});if(variant==='enabled')await workspaceNavigation(s,route,{check,screenshot});}catch(error){check(`${variant} ${width} ${route} interactions complete`,false,String(error));await screenshot(s,route+'-interaction-failure');for(let i=0;i<3;i++)await p.keyboard.press('Escape');}
     }
    }
   }finally{await finish(s);}
  }
  const b=pairs.baseline.dashboard,a=pairs.enabled.dashboard;
  check(`${width} Risk Desk full page pixel preservation`,readFileSync(path.join(out,b.image)).equals(readFileSync(path.join(out,a.image))));
  check(`${width} Risk Desk heading style/geometry preservation`,JSON.stringify(b.tokens)===JSON.stringify(a.tokens));
  if(pairs.baseline.askOpen)check(`${width} Ask-open Risk Desk pixel preservation`,readFileSync(path.join(out,pairs.baseline.askOpen)).equals(readFileSync(path.join(out,pairs.enabled.askOpen))));
  report.comparisons.push({width,pairs});
 }
 if(!quick)for(const width of widths.filter(w=>[1440,390].includes(w))){
  await workspaceLocalEditing(open,finish,{check,screenshot},width);
  for(const variant of ['baseline','enabled'])await workspacePending(open,finish,{check,screenshot},width,variant);
  for(const variant of ['baseline','enabled'])for(const scenario of ['oauth-unavailable','workspace-empty','workspace-free']){
   const s=await open({variant,width,scenario,plan:scenario==='workspace-free'?'free':'pro'});try{
    for(const route of scenario==='oauth-unavailable'?['oauth']:['coach','rules','passport']){
     await s.page.evaluate(route=>location.hash='#'+route,route);await s.page.waitForTimeout(500);
     await workspaceStateChecks(s,scenario,route,check);
     await screenshot(s,route);
     if(scenario==='workspace-free')await workspaceDetails(s,route,{check,screenshot});
    }
    s.expectedPlanWrites=scenario==='oauth-unavailable'?1:2;
   }finally{await finish(s);}
  }
 }
 writeFileSync(path.join(out,'workspace-inventory.json'),JSON.stringify(report.workspaceInventory,null,2));
}
