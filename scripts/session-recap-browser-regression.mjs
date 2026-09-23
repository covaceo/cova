// Real React, Canvas PNGs and browser input; synthetic account boundaries only.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {createServer,build,preview} from 'vite';
const output=process.env.RECAP_EVIDENCE||join(tmpdir(),'cova-recap-browser');await mkdir(output,{recursive:true});const downloads=await mkdtemp(join(output,'exports-'));
const profile=await mkdtemp(join(tmpdir(),'cova-recap-'));
const styles=[...(await readFile('src/main.tsx','utf8')).matchAll(/import "([^"]+)";/g)].map(m=>m[1]).filter(n=>n.startsWith('@fontsource')||n.endsWith('.css')).map(n=>`import '${n.startsWith('./')?'/src/'+n.slice(2):n}';`).join('\n');
const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{UserProfileProvider}from'/src/components/UserProfile.tsx';import{Dashboard}from'/src/components/DashboardView.tsx';import{analyze}from'/src/lib/risk.ts';import{saveBrokerCash}from'/src/lib/brokerCash.ts';${styles}
const row=(open,close,pnl)=>({id:'tradovate-7:'+open+':'+close,date:'2026-09-18',market:'MNQ',side:'Long',contracts:1,entry:20000,exit:20001,pnl,risk:10,setup:'',notes:'',source:{provider:'Tradovate',accountId:'7',pnlBasis:'gross_before_fees',timeZone:'UTC',openedAt:'2026-09-18T14:00:00.000Z',closedAt:'2026-09-18T14:10:00.000Z'}});
const historical=(day,pnl,id)=>{const t=row(id,id+1,pnl),date='2026-09-'+day;return {...t,date,source:{...t.source,openedAt:date+'T14:00:00.000Z',closedAt:date+'T14:10:00.000Z'}}};
const rows=[row(10,11,250),row(10,12,-50),row(20,21,-80),row(30,31,160),row(40,41,360),historical('15',-20,60),historical('16',100,70),historical('17',80,80)];
const avatar=owner=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.fillStyle=owner==='owner-a'?'#497bad':'#bb4d4d';x.fillRect(0,0,64,64);return c.toDataURL('image/jpeg',1)};
const repo=async()=>({load:async owner=>{if(location.search.includes('delayed'))await new Promise((resolve,reject)=>{window.__releaseProfile=resolve;window.__rejectProfile=()=>reject(Error('Profile unavailable'))});return {user_id:owner,username:owner==='owner-a'?'recap_qa':'other_qa',avatar_data:avatar(owner),username_changed_at:'2026-09-18T00:00:00.000Z'}},save:async()=>{throw Error('No writes')}});
localStorage.setItem('cova-active-storage-identity-v1','owner-a');
window.__writeFees=(fee,owner='owner-a',accountRows=rows)=>{let balance=100000;const entries=[{at:'2026-09-18T14:00:00.000Z',deltaCents:fee,category:'fee',type:'Commission'},...['15','16','17'].map(day=>({at:'2026-09-'+day+'T14:00:00.000Z',deltaCents:-100,category:'fee',type:'Commission'})),...accountRows.map(t=>({at:t.source.closedAt,deltaCents:Math.round(t.pnl*100),category:'trade',type:'Trade Paired'}))].sort((a,b)=>a.at.localeCompare(b.at)).map((e,i)=>({...e,id:String(i+1),balanceCents:balance+=e.deltaCents,currency:'USD',contract:'MNQZ6'}));const sum=category=>entries.filter(e=>e.category===category).reduce((n,e)=>n+e.deltaCents,0);const cash={status:'reconciled',version:1,accountId:'7',currency:'USD',window:{startDate:'2026-09-14',endDate:'2026-09-20'},asOf:'2026-09-18T14:15:00.000Z',basis:'cash_movements_no_trade_allocation',entries,grossCents:sum('trade'),feeCents:sum('fee'),netCents:sum('trade')+sum('fee'),nonTradingCents:0,openingBalanceCents:100000,closingBalanceCents:balance};saveBrokerCash(owner,'7',cash,accountRows)};window.__writeFees(-1234);
function Fixture(){const[owner,setOwner]=useState('owner-a');const[trades,setTrades]=useState(rows);window.__owner=setOwner;window.__trades=setTrades;window.__rows=rows;return <UserProfileProvider userId={owner} repository={repo}><div className="oa-dashboard-app"><Dashboard key={owner} analysis={analyze(trades,[])} rules={[]} go={()=>{}} journalReview={false}/></div></UserProfileProvider>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
let server,chrome,ws,fixtureDir,compiledRoute;const errors=[],receipts=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const config={envDir:profile,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'recap-fixture',resolveId(id){if(id==='/__recap.tsx')return id;},load(id){if(id==='/__recap.tsx')return entry;},configureServer(v){v.middlewares.use(async(req,res,next)=>{if(req.url.split('?')[0]!=='/__recap.html')return next();res.setHeader('Content-Type','text/html');res.end(await v.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/__recap.tsx"></script></body></html>'));});}}]};
 if(process.env.RECAP_COMPILED==='1'){
  await mkdir('tmp',{recursive:true});fixtureDir=await mkdtemp(join(process.cwd(),'tmp','recap-qa-'));const html=join(fixtureDir,'recap.html');compiledRoute='/'+relative(process.cwd(),html).replaceAll('\\','/');await writeFile(html,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/__recap.tsx"></script></body></html>');
  const outDir=join(profile,'compiled');await build({...config,build:{outDir,emptyOutDir:true,rollupOptions:{input:html}}});
  const headers=Object.fromEntries(JSON.parse(await readFile('vercel.json','utf8')).headers[0].headers.map(h=>[h.key,h.value]));
  server=await preview({envDir:profile,logLevel:'error',build:{outDir},preview:{host:'127.0.0.1',port:0,headers}});
 }else{server=await createServer(config);await server.listen();}
 const port=server.httpServer.address().port;const pagePath=process.env.RECAP_COMPILED==='1'?compiledRoute:'/__recap.html';
 assert.equal((await fetch(`http://127.0.0.1:${port}${pagePath}`)).status,200);
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
 let debug;for(let i=0;i<100;i++){try{debug=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{}await sleep(100);}assert(debug);
 const tabs=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let seq=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const cb=pending.get(m.id);pending.delete(m.id);if(cb)m.error?cb.reject(Error(m.error.message)):cb.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown'||m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method+' '+String(params.expression||'').slice(0,160)))},15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
 const wait=async exp=>{for(let i=0;i<140;i++){if(await evaluate(exp))return;await sleep(75);}throw Error('Timeout '+exp);};
 const click=async(selector,text)=>{const p=await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.checkVisibility()&&(!${JSON.stringify(text||'')}||e.textContent.trim()===${JSON.stringify(text||'')}));if(!el)throw Error('Missing visible '+${JSON.stringify(selector+' '+(text||''))});el.scrollIntoView({block:'nearest',behavior:'instant'});const b=el.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await sleep(60);};
 const key=async(key,code)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:code});};
 const capture=async name=>{assert.equal(await evaluate(`(()=>{const d=document.querySelector('dialog[open]'),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&d.scrollWidth<=d.clientWidth+1;})()`),true,name+' modal fits');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,name+' root fits');await writeFile(join(output,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));};
 const ready=()=>wait(`Boolean(document.querySelector('[data-recap-preview]')?.complete&&document.querySelector('[data-recap-preview]')?.naturalWidth===1080&&!document.querySelector('[data-recap-download]')?.disabled)`);
 await send('Runtime.enable');await send('Page.enable');await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
 // A deliberately delayed saved profile must never enable a photo-less identity export.
 await send('Page.navigate',{url:`http://127.0.0.1:${port}${pagePath}?delayed=1`});await wait(`Boolean(window.__releaseProfile)`);await click('button','Share recap');
 assert.match(await evaluate(`document.querySelector('.recap-wait')?.textContent||''`),/Loading saved profile/);
 assert.equal(await evaluate(`document.querySelector('[data-recap-download]').disabled`),true);
 await evaluate(`window.__releaseProfile()`);await ready();assert.match(await evaluate(`document.querySelector('[data-recap-preview]').alt`),/@recap_qa/);
 const avatarPixel=async(y)=>evaluate(`(()=>{const img=document.querySelector('[data-recap-preview]'),c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);return [...x.getImageData(104,${y},1,1).data].slice(0,3)})()`);
 const assertAvatar=async(y,rgb=[73,123,173])=>{const actual=await avatarPixel(y);assert(actual.every((n,i)=>Math.abs(n-rgb[i])<=3),'Saved owner avatar pixels '+JSON.stringify(actual));};
 const assertLogo=async footer=>{
  const matches=await evaluate(`(async()=>{const img=document.querySelector('[data-recap-preview]'),logo=new Image();logo.src='/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png';await logo.decode();const actual=document.createElement('canvas'),expected=document.createElement('canvas');actual.width=expected.width=1080;actual.height=expected.height=img.naturalHeight;const a=actual.getContext('2d'),e=expected.getContext('2d');a.drawImage(img,0,0);e.fillStyle='#080d12';e.fillRect(0,0,1080,img.naturalHeight);const width=220,height=width*logo.height/logo.width,top=${footer}-height+6;e.drawImage(logo,(1080-width)/2,top,width,height);const aa=a.getImageData(430,Math.floor(top),220,Math.ceil(height)+1).data,ee=e.getImageData(430,Math.floor(top),220,Math.ceil(height)+1).data;return aa.every((n,i)=>Math.abs(n-ee[i])<=1)})()`);
  assert(matches,'Exact current workspace COVA wordmark pixels replace the C icon and typed wordmark');
 };
 await assertAvatar(150);await assertLogo(1688);
 assert.match(await evaluate(`document.querySelector('[data-recap-preview]').alt`),/\+\$627\.66 after fees/);
 // A failed profile stays blocked until retry resolves the same owner.
 await send('Page.navigate',{url:`http://127.0.0.1:${port}${pagePath}?delayed=1`});await wait(`Boolean(window.__rejectProfile)`);await click('button','Share recap');await evaluate(`window.__rejectProfile()`);
 await wait(`[...document.querySelectorAll('dialog button')].some(b=>b.textContent==='Retry saved profile')`);assert.equal(await evaluate(`document.querySelector('[data-recap-download]').disabled`),true);
 await evaluate(`delete window.__releaseProfile`);await click('dialog button','Retry saved profile');await wait(`Boolean(window.__releaseProfile)`);await evaluate(`window.__releaseProfile()`);await ready();await assertAvatar(150);
 for(const[name,width,height,mobile]of[['desktop',1440,960,false],['laptop',1280,720,false],['phone',390,844,true],['short-phone',360,640,true]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await send('Page.navigate',{url:`http://127.0.0.1:${port}${pagePath}`});await wait(`Boolean(document.querySelector('.astra-dashboard')&&document.fonts.status==='loaded')`);
  assert.deepEqual(await evaluate('[innerWidth,document.documentElement.clientWidth,Math.round(visualViewport.width)]'),[width,width,width]);
  await click('button','Share recap');await ready();assert.match(await evaluate(`document.querySelector('[data-recap-preview]').alt`),/\+\$627\.66 after fees/);await capture(name+'-story');await assertAvatar(150);await assertLogo(1688);
  await click('dialog button','Feed');await ready();assert.equal(await evaluate(`document.querySelector('[data-recap-preview]').naturalHeight`),1350);await capture(name+'-feed');await assertAvatar(76);await assertLogo(1212);
  await click('dialog button','Square');await ready();assert.equal(await evaluate(`document.querySelector('[data-recap-preview]').naturalHeight`),1080);await capture(name+'-square');await assertAvatar(68);await assertLogo(948);
  // Linked scale-ins plus trims must produce one entry in the real exported Canvas.
 await evaluate(`window.__entryInk=[];window.__entryOriginal=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.__entryInk.push({text:String(text),x:args[0]});return window.__entryOriginal.call(this,text,...args)};
 const make=(buy,sell,entry,exit,qty,open,close)=>({...window.__rows[0],id:'tradovate-7:'+buy+':'+sell,side:'Short',entry,exit,contracts:qty,pnl:(entry-exit)*qty*2,source:{...window.__rows[0].source,openedAt:'2026-09-18T'+open+'.000Z',closedAt:'2026-09-18T'+close+'.000Z'}});
 window.__linked=[make(101,201,20020,20000,1,'14:01:00','14:10:00'),make(101,202,20010,20000,3,'14:00:00','14:10:00'),make(102,201,20020,19995,2,'14:01:00','14:11:00'),...window.__rows.filter(t=>t.date<'2026-09-18')];window.__writeFees(-1234,'owner-a',window.__linked);window.__trades(window.__linked);`);
 await wait(`document.querySelector('[data-recap-preview]')?.alt.includes('1 Trade entries')`);await ready();
 for(const format of ['Story','Feed','Square']) {
  await evaluate('window.__entryInk=[]');await click('dialog button',format);await ready();
  assert.match(await evaluate(`document.querySelector('[data-recap-preview]').alt`),/1 Trade entries, 100% win rate/);
  assert((await evaluate('window.__entryInk')).some(t=>t.x===308&&t.text==='1'),'Export pixels use one real linked entry');
  assert((await evaluate('window.__entryInk')).some(t=>t.text==='+'+'$'+((20000-1234)/100).toFixed(2)),'All trim P&L and fees preserved');
  await capture(name+'-linked-'+format.toLowerCase());
 }
 await evaluate(`CanvasRenderingContext2D.prototype.fillText=window.__entryOriginal;window.__writeFees(-1234);window.__trades(window.__rows)`);
 await wait(`document.querySelector('[data-recap-preview]')?.alt.includes('+$627.66 after fees')`);await ready();
 await key('Escape',27);await wait(`!document.querySelector('dialog[open]')`);assert.equal(await evaluate(`document.activeElement.textContent.trim()`),'Share recap');
  receipts.push({name,width,height,mobile,overflow:false});
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await click('button','Share recap');await ready();
 for(const[format,h]of[['Story',1920],['Feed',1350],['Square',1080]]){await click('dialog button',format);await ready();await click('[data-recap-download]');const filename=`cova-daily-2026-09-18-${format.toLowerCase()}.png`;let bytes;for(let i=0;i<100;i++){try{bytes=await readFile(join(downloads,filename));break;}catch{}await sleep(50);}assert(bytes,filename);assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),h);}
 // Lost cash cannot expose the prior export or silently substitute gross.
 await evaluate(`localStorage.removeItem('cova-broker-cash-v1:7:owner-a');window.dispatchEvent(new Event('cova-broker-cash-updated'))`);
 await wait(`!document.querySelector('[data-recap-preview]')&&document.querySelector('[data-recap-download]').disabled`);
 assert.match(await evaluate(`document.querySelector('.recap-wait').textContent`),/Sync.*fees/);
 await evaluate(`window.__writeFees(0)`);await ready();assert.match(await evaluate(`document.querySelector('[data-recap-preview]').alt`),/\+\$640\.00 after fees/);
 // Cash-only refreshes must update the artifact without mutating a single trade.
 await evaluate(`window.__writeFees(-2234)`);await wait(`document.querySelector('[data-recap-preview]')?.alt.includes('+$'+((64000-2234)/100).toFixed(2))`);await ready();
 await evaluate(`window.__writeFees(-1234)`);await wait(`document.querySelector('[data-recap-preview]')?.alt.includes('+$'+((64000-1234)/100).toFixed(2))`);await ready();
 await click('dialog button','London');await ready();await capture('london-square');await click('dialog button','Asia');await ready();await capture('asia-square');await click('dialog button','Plain');await ready();await capture('plain-square');
 await click('#recap-show-identity');await ready();assert.doesNotMatch(await evaluate(`document.querySelector('[data-recap-preview]').alt`),/@recap_qa/);
 assert.deepEqual(await avatarPixel(68),[8,13,18],'Hidden identity removes avatar pixels too');
 // Inspect actual rendered text, not only accessible descriptions.
 await evaluate(`window.__drawn=[];window.__inks=[];window.__fillText=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.__drawn.push(String(text));window.__inks.push({text:String(text),color:this.fillStyle,x:args[0],y:args[1],align:this.textAlign,font:this.font,width:this.measureText(String(text)).width});return window.__fillText.call(this,text,...args)}`);
 const exportPreview=async name=>{const data=await evaluate(`(()=>{const img=document.querySelector('[data-recap-preview]');const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);return c.toDataURL('image/png').split(',')[1];})()`);const bytes=Buffer.from(data,'base64');assert.equal(bytes.readUInt32BE(16),1080);await writeFile(join(output,name+'.png'),bytes);};
 for(const bg of ['New York','London','Asia','Plain'])for(const format of ['Story','Feed','Square']){await click('dialog button',bg);await click('dialog button',format);await ready();await exportPreview(`anonymous-${bg.toLowerCase().replace(' ','-')}-${format.toLowerCase()}`);}
 assert.equal((await evaluate('window.__drawn')).some(t=>t.includes('recap_qa')),false,'Identity absent from actual Canvas text');
 const drawn=await evaluate('window.__drawn');
 const money=(await evaluate('window.__inks')).filter(r=>r.text==='+$627.66');assert(money.length>=12,'Every export contains the complete exact amount');
 assert(money.every(r=>r.font.includes('Cova Recap Space Grotesk')&&/^(?:700|bold) /.test(r.font)&&r.align==='center'&&r.x===540&&r.width<=928),'Approved cohesive, centered display amount fits all formats');
 assert(await evaluate(`[...document.fonts].some(f=>f.family.replaceAll(String.fromCharCode(34),'').replaceAll(String.fromCharCode(39),'')==='Cova Recap Space Grotesk'&&f.status==='loaded')`),'Self-hosted recap-only font actually loaded');
 assert((await evaluate('window.__inks')).filter(r=>r.text==='MNQ').every(r=>r.color==='#4f7dff'),'Market label uses Cova cobalt');
 assert(drawn.includes('DAILY RECAP'));assert(drawn.includes('Win rate'));assert(drawn.includes('Trade entries'));assert(drawn.includes('3 DAY HOT STREAK'),'Streak is derived from three net-green days after an observed reset');
 const ink=await evaluate('window.__inks');
 assert(ink.filter(r=>r.text==='3 DAY HOT STREAK').every(r=>r.color==='#9fb2ff'&&r.font.includes('44px')&&r.align==='center'&&r.x===540),'Approved prominent blue number-first streak');
 assert(ink.filter(t=>t.text==='covadesk.com').every(t=>t.x===540&&t.align==='center'&&[1732, 1256, 992].includes(t.y)),'Website centered beneath the COVA wordmark');
 for(const text of ['DAILY RECAP','MNQ','+$627.66'])assert(ink.filter(t=>t.text===text).every(t=>t.x===540&&t.align==='center'),'Centered result block: '+text);
 assert(ink.filter(t=>t.text==='Trade entries').every(t=>t.x===308));assert(ink.filter(t=>t.text==='Win rate').every(t=>t.x===772),'Symmetric stat columns');
 assert(!drawn.some(t=>/Gross|Fees unavailable|Net cash|Posted fees|Cash snapshot|UTC close date|09:30|16:00/.test(t)),'Removed copy and footer clock are absent from actual PNG rendering');
 // Net, not gross, controls the money sign and loss color in actual Canvas output.
 await evaluate(`window.__drawn=[];window.__writeFees(-65000)`);await wait(`document.querySelector('[data-recap-preview]')?.alt.includes('−$10.00 after fees')`);await ready();
 assert((await evaluate('window.__inks')).some(r=>r.text==='−$10.00'&&r.color==='#ffb7b7'));assert(!(await evaluate('window.__drawn')).some(t=>t.includes('HOT STREAK')),'Red day clears the actual streak pixels');await exportPreview('fee-driven-loss');
 await evaluate(`window.__writeFees(-64000)`);await wait(`document.querySelector('[data-recap-preview]')?.alt.includes('. $0.00 after fees')`);await ready();
 await evaluate(`window.__writeFees(-1234)`);await wait(`document.querySelector('[data-recap-preview]')?.alt.includes('+$627.66 after fees')`);await ready();
 // Local upload uses real decoding/re-encoding, with no remote upload.
 const uploadPhoto=async(type='image/png')=>evaluate(`new Promise(resolve=>{const c=document.createElement('canvas');c.width=640;c.height=480;const x=c.getContext('2d');x.fillStyle='#6285a5';x.fillRect(0,0,640,480);c.toBlob(blob=>{const d=new DataTransfer();d.items.add(new File([blob],'private-original.png',{type:${JSON.stringify(type)}}));const input=document.querySelector('input[type=file]');input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));resolve(true);},'image/png');})`);
 await uploadPhoto('image/svg+xml');await wait(`document.querySelector('[role=alert]')?.textContent.includes('under 8 MB')`);
 await uploadPhoto();await ready();await wait(`Boolean(document.querySelector('.recap-backgrounds [aria-pressed=true] img')?.src.startsWith('data:image/jpeg;base64,'))`);await exportPreview('custom-square');
 await evaluate(`window.__bitmap=createImageBitmap;window.createImageBitmap=async file=>{await new Promise(r=>window.__releasePhoto=r);return window.__bitmap(file)}`);await uploadPhoto();await wait(`Boolean(window.__releasePhoto)`);await click('dialog button','London');await evaluate(`window.__releasePhoto();window.createImageBitmap=window.__bitmap`);await ready();await sleep(100);assert.equal(await evaluate(`document.querySelector('.recap-backgrounds [aria-pressed=true]').textContent.trim()`),'London','Late upload must not override a newer background choice');
 // Sharing tests stub only the device transport, never the real PNG renderer.
 await evaluate(`Object.defineProperty(navigator,'canShare',{configurable:true,value:d=>d.files?.[0]?.type==='image/png'});Object.defineProperty(navigator,'share',{configurable:true,value:async d=>{window.__shareReceipt={name:d.files[0].name,size:d.files[0].size,type:d.files[0].type,active:navigator.userActivation.isActive};if(window.__shareFailure)throw new DOMException('unavailable','NotAllowedError');}})`);
 await click('dialog button','Feed');await ready();await click('dialog button','Share image');const shared=await evaluate('window.__shareReceipt');assert.equal(shared.type,'image/png');assert(shared.size>10000);assert.equal(shared.active,true);assert.doesNotMatch(shared.name,/recap_qa|private-original|owner/);
 await evaluate('window.__shareFailure=true');await click('dialog button','Share image');await wait(`document.querySelector('[role=alert]')?.textContent.includes('Download the image instead')`);await evaluate('window.__shareFailure=false');
 await evaluate(`window.__owner('owner-b')`);await wait(`!document.querySelector('dialog[open]')`);await click('button','Share recap');
 await wait(`document.querySelector('[data-recap-download]')?.disabled&&!document.querySelector('[data-recap-preview]')`);
 assert.match(await evaluate(`document.querySelector('.recap-wait').textContent`),/Sync.*fees/,'Owner B cannot inherit owner A cash');
 await evaluate(`localStorage.setItem('cova-active-storage-identity-v1','owner-b');window.__writeFees(-4321,'owner-b')`);await ready();
 assert.match(await evaluate(`document.querySelector('[data-recap-preview]').alt`),/@other_qa/);await assertAvatar(150,[187,77,77]);
 await evaluate(`window.__trades(window.__rows.map(r=>({...r,pnl:0.001})))`);await wait(`!document.querySelector('[data-recap-preview]')&&document.querySelector('[data-recap-download]').disabled`);
 await evaluate(`window.__fontLoad=document.fonts.load.bind(document.fonts);document.fonts.load=(...args)=>new Promise(resolve=>window.__releaseFont=()=>window.__fontLoad(...args).then(resolve));window.__trades(window.__rows)`);await wait(`Boolean(window.__releaseFont)`);assert.equal(await evaluate(`Boolean(document.querySelector('[data-recap-preview]'))`),false,'Restoring a model must not revive its revoked export');assert.equal(await evaluate(`document.querySelector('[data-recap-download]').disabled`),true);await evaluate(`window.__releaseFont();document.fonts.load=window.__fontLoad`);await ready();
 await evaluate(`window.__trades(window.__rows.map(r=>({...r,source:{...r.source,accountId:'8'}})))`);await wait(`!document.querySelector('dialog[open]')`);
 await evaluate(`window.__trades(window.__rows)`);await sleep(150);assert.equal(await evaluate(`Boolean(document.querySelector('dialog[open]'))`),false,'Returning to an account must not reopen its old composer');
 await evaluate(`window.__trades([200,-80,160,360].map((pnl,i)=>({...window.__rows[i],id:'demo-recap-'+i,pnl,source:undefined})));window.__drawn=[]`);await click('button','Share recap');await ready();
 for(const format of ['Story','Feed','Square']){await click('dialog button',format);await ready();assert.match(await evaluate(`document.querySelector('[data-recap-preview]').alt`),/Sample data/);await exportPreview('sample-'+format.toLowerCase());assert.doesNotMatch(await evaluate(`document.querySelector('[data-recap-preview]').alt`),/HOT STREAK/);}assert((await evaluate('window.__drawn')).some(t=>t==='Sample data · Not a live account'));
 await click('[aria-label="Close recap"]');
 assert.deepEqual(errors,[],'No runtime or console errors');await writeFile(join(output,'receipt.json'),JSON.stringify({receipts,downloads,files:await readdir(downloads),errors},null,2));console.log('Session recap browser PASS',JSON.stringify({output,downloads,viewports:receipts.length}));
}finally{if(errors.length)console.error(JSON.stringify(errors));ws?.close();if(chrome?.pid){try{process.platform==='win32'?execFileSync('taskkill',['/PID',String(chrome.pid),'/T','/F'],{stdio:'ignore'}):chrome.kill('SIGKILL');}catch{}}if(server?.close)await server.close();else if(server?.httpServer)await new Promise(r=>server.httpServer.close(r));await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});if(fixtureDir)await rm(fixtureDir,{recursive:true,force:true});}
