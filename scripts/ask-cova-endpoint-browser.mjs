// Real compact/default chart and canonical CSS; synthetic figures, no account/server access.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.env.ASK_COVA_EVIDENCE_ROOT||path.join(root,'../ask-cova-panel-evidence/runs',new Date().toISOString().replaceAll(':','-')),'endpoint');
mkdirSync(out,{recursive:true});
const styles=[...readFileSync(path.join(root,'src/main.tsx'),'utf8').matchAll(/import "([^"]+)";/g)].map(m=>m[1]).filter(n=>n.startsWith('@fontsource')||n.endsWith('.css')).map(n=>`import ${JSON.stringify(n.startsWith('./')?path.join(root,'src',n.slice(2)).replaceAll('\\','/'):n)};`).join('\n');
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {AstraEquityCurve} from ${JSON.stringify(path.join(root,'src/components/AstraEquityCurve.tsx').replaceAll('\\','/'))};${styles}
function Fixture(){const [value,setValue]=useState(60),[compact,setCompact]=useState(true);window.endpointFixture={setValue,setCompact};return <main className="oa-dashboard-app"><div className="astra-dashboard" data-dashboard-visual="approved" style={{padding:16}}><section className="astra-chart-panel" style={{maxWidth:1044}}><AstraEquityCurve points={[{label:'Start',value:0},{label:'2026-10-30',value}]} accountPnlCents={Math.round(value*100)} compact={compact}/></section></div></main>}createRoot(document.getElementById('root')).render(<Fixture/>);`;
const sourceHashes={};
const built=await build({root,configFile:false,envDir:false,logLevel:'error',plugins:[react(),{name:'endpoint-regression',resolveId(id){if(id==='endpoint-entry')return '\0endpoint-entry.tsx';},load(id){if(id==='\0endpoint-entry.tsx')return entry;const rel=path.relative(root,id).replaceAll('\\','/');if(rel.startsWith('src/')&&!id.includes('?'))sourceHashes[rel]=createHash('sha256').update(readFileSync(id)).digest('hex');}}],build:{write:false,assetsInlineLimit:10000000,cssCodeSplit:false,rollupOptions:{input:'endpoint-entry',output:{format:'iife',name:'EndpointFixture'}}}});
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${built.output.filter(f=>f.fileName.endsWith('.css')).map(f=>f.source).join('\n')}</style></head><body><div id="root"></div><script>${built.output.filter(f=>f.type==='chunk').map(f=>f.code).join('\n').replaceAll('</script','<\\/script')}</script></body></html>`;
writeFileSync(path.join(out,'fixture.html'),html);
const report={sourceHashes,checks:[],failures:[],errors:[],externalBlocked:[],measurements:[]};
const check=(name,condition,detail)=>{(condition?report.checks:report.failures).push({name,detail});};
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const width of [1536,390]){
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1});
  await context.route('**/*',route=>{report.externalBlocked.push(route.request().url());return route.abort();});
  const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  try{
   await p.setContent(html);await p.locator('.astra-chart-svg').waitFor();await p.evaluate(()=>document.fonts.ready);
   for(const value of [60,-80,0,90071992547409.9,-90071992547409.9]){
    await p.evaluate(value=>window.endpointFixture.setValue(value),value);
    await p.waitForFunction(value=>document.querySelector('.astra-chart-endpoint')?.textContent.includes(Math.abs(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})),value);
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const metric=await p.locator('.astra-chart-svg').evaluate(svg=>{const t=svg.querySelector('.astra-chart-endpoint'),b=svg.querySelector('.astra-chart-endpoint-badge'),axis=svg.querySelector('.astra-chart-axis');if(!b)return {present:false};const text=t.getBoundingClientRect(),badge=b.getBoundingClientRect(),plot=axis.getBoundingClientRect(),end=svg.querySelectorAll('.astra-observation')[1].getBoundingClientRect();return {present:true,text:text.toJSON(),badge:badge.toJSON(),plot:plot.toJSON(),fitsText:badge.left<=text.left-4&&badge.right>=text.right+4&&badge.top<=text.top-2&&badge.bottom>=text.bottom+2,insidePlot:badge.left>=plot.left-1&&badge.right<=end.right+1&&badge.top>=plot.top-1&&badge.bottom<=plot.bottom+1,fill:getComputedStyle(b).fill,stroke:getComputedStyle(b).stroke,rx:b.getAttribute('rx')};});
    report.measurements.push({width,value,...metric});
    check(width+' fitted compact badge '+value,metric.present&&metric.fitsText&&metric.insidePlot,metric);
    if(value===60||value< -1e12)await p.locator('.astra-chart-panel').screenshot({path:path.join(out,`${width}-${value===60?'reference':'wide-negative'}.png`)});
   }
   const svg=p.locator('.astra-chart-svg');await svg.focus();
   for(const [key,selected] of [['Home','0'],['End','1'],['Escape','']]){await p.keyboard.press(key);check(width+' chart keyboard '+key,await p.locator('.astra-chart-main').getAttribute('data-chart-selected')===selected);}
   await p.evaluate(()=>window.endpointFixture.setCompact(false));await p.waitForFunction(()=>!document.querySelector('.astra-chart-endpoint'));
   check(width+' default consumer has no badge',await p.locator('.astra-chart-endpoint-badge').count()===0);
  }finally{await context.close();}
 }
}catch(error){report.failures.push({name:'endpoint workflow completed',detail:String(error)});}
finally{await browser.close();}
for(const [file,hash] of Object.entries(sourceHashes))assert.equal(createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex'),hash,'Source stable: '+file);
check('No runtime errors',report.errors.length===0,report.errors);check('No external requests',report.externalBlocked.length===0,report.externalBlocked);
writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({out,checks:report.checks.length,failures:report.failures},null,2));
if(report.failures.length)process.exitCode=1;
