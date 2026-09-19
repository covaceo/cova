// Real component/browser proof. Default data is synthetic; optional private points stay outside git.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
const output=process.env.NET_CURVE_EVIDENCE||join(tmpdir(),'cova-net-curve-browser');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'cova-net-curve-'));
const points=process.env.NET_CURVE_FIXTURE?JSON.parse(await readFile(process.env.NET_CURVE_FIXTURE,'utf8')).points:[{label:'2026-09-01',value:-21.37},{label:'2026-09-02',value:-45.13},{label:'2026-09-03',value:28.56},{label:'2026-09-06',value:19.81},{label:'2026-09-08',value:106.71}];
const styles=[...(await readFile('src/main.tsx','utf8')).matchAll(/import "([^"]+)";/g)].map(m=>m[1]).filter(n=>n.startsWith('@fontsource')||n.endsWith('.css')).map(n=>`import '${n.startsWith('./')?'/src/'+n.slice(2):n}';`).join('\n');
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {AstraEquityCurve} from '/src/components/AstraEquityCurve.tsx';${styles}
const data=${JSON.stringify(points)};
function Preview(){const [points,setPoints]=useState(data);return <main className="oa-dashboard-app" style={{padding:'24px',maxWidth:1000,margin:'auto'}}><section className="astra-dashboard"><section className="astra-panel astra-chart-panel"><div className="astra-panel-heading"><div><h2>Equity curve</h2><p>Daily cumulative net P&L · UTC cash dates · Fees included, funding excluded.</p></div></div><AstraEquityCurve points={points} basis="daily-net"/><div className="astra-chart-note">Net cash P&L</div></section><button id="range" onClick={()=>setPoints(data.slice(-1))}>One day</button></section></main>};createRoot(document.getElementById('root')).render(<Preview/>);`;
let server,chrome,ws;const errors=[],receipts=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 server=await createServer({envDir:profile,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'net-curve-fixture',resolveId(id){if(id==='/__curve.tsx')return id;},load(id){if(id==='/__curve.tsx')return entry;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url!=='/__curve.html')return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/__curve.tsx"></script></body></html>'));});}}]});
 await server.listen();const port=server.httpServer.address().port;
 assert.equal((await fetch(`http://127.0.0.1:${port}/__curve.html`)).status,200);
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
 let debugPort;for(let i=0;i<100;i++){try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{}await sleep(100);}assert(debugPort);
 const tabs=await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 let sequence=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id){const cb=pending.get(m.id);pending.delete(m.id);if(m.error)cb.reject(Error(m.error.message));else cb.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown'||m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value;};
 const wait=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(50);}throw Error('Timeout: '+expression);};
 const key=async(key,code)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});};
 const capture=async(name)=>{await writeFile(join(output,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));};
 const contained=async()=>assert.equal(await evaluate(`(()=>{const t=document.querySelector('.astra-chart-tooltip').getBoundingClientRect(),p=document.querySelector('.astra-chart-main').getBoundingClientRect();return t.left>=p.left && t.right<=p.right && t.top>=p.top && t.bottom<=p.bottom;})()`),true,'Tooltip contained');
 await send('Runtime.enable');await send('Page.enable');
 for(const [name,width,height,mobile] of [['desktop',1440,900,false],['laptop',1280,720,false],['mobile',390,844,true]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:mobile?5:1});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__curve.html`});
  await wait(`document.querySelector('.astra-chart-svg')?.getAttribute('aria-label').includes('Daily cumulative net P&L') && document.fonts.status==='loaded'`);
  await sleep(100);
  assert.deepEqual(await evaluate('[innerWidth,document.documentElement.clientWidth,Math.round(visualViewport.width)]'),[width,width,width]);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  await capture(name+'-curve');
  await evaluate(`document.querySelector('.astra-chart-svg').focus()`);
  for(const [k,c,index] of [['Home',36,0],['End',35,points.length-1],['ArrowLeft',37,points.length-2]]){
   await key(k,c);await wait(`document.querySelector('.astra-chart-main').dataset.chartSelected==='${index}'`);await contained();
   const text=await evaluate(`document.querySelector('.astra-chart-tooltip').innerText`);assert.ok(!text.includes('Trade '));assert.ok(text.includes('Cumulative net'));
   const delta=Math.round(points[index].value*100)-Math.round((points[index-1]?.value||0)*100);
   assert.ok(text.includes('Day net '+(delta<0?'−':delta>0?'+':'')+'$'+(Math.abs(delta)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})),text);
  }
  await key('End',35);await capture(name+'-tooltip');await key('Escape',27);await wait(`!document.querySelector('.astra-chart-tooltip')`);
  const box=await evaluate(`(()=>{const r=document.querySelector('.astra-chart-svg').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
  const x=box.x+box.w-70,y=box.y+box.h/2;
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await wait(`Boolean(document.querySelector('.astra-chart-tooltip'))`);await contained();
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  await wait(`document.querySelector('.astra-chart-main').dataset.chartPinned==='true'`);await key('Escape',27);
  if(mobile){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+12,y}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});await wait(`Boolean(document.querySelector('.astra-chart-tooltip'))`);await contained();await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  await evaluate(`document.querySelector('#range').click()`);await wait(`document.querySelector('.astra-chart-main').dataset.chartSelected===''`);
  receipts.push({name,width,height,points:points.length,keyboard:true,pointer:true,touch:mobile,tooltipContained:true,rangeReset:true});
 }
 assert.deepEqual(errors,[]);await writeFile(join(output,'browser.json'),JSON.stringify({status:'passed',receipts,errors},null,2));console.log(JSON.stringify({status:'passed',receipts,output}));
} finally {if(ws)ws.close();if(chrome?.pid)try{execFileSync('taskkill.exe',['/PID',String(chrome.pid),'/T','/F'],{stdio:'ignore'});}catch{}await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});}
