import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/');
const evidence=(process.env.ASK_COVA_EVIDENCE_ROOT || root+'../ask-cova-insights-evidence/interaction')+'/chat';
mkdirSync(evidence,{recursive:true});
assert.ok(existsSync(root+'src/components/AskCova.tsx'),'Risk Desk Ask Cova component exists');
const id=root+'__ask_cova_ui_test__.tsx';
const canonicalCSS=[...readFileSync(root+'src/main.tsx','utf8').matchAll(/import "([^"]+\.css)"/g)].map(([,path])=>`import '${path.startsWith('.')?root+'src/'+path.slice(2):path}';`).join('');
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{AskCova}from'${root}src/components/AskCova.tsx';import{bindAskCovaAccessAuthority,askCovaAccessCurrent,createAskCovaTransport,requestAskCova}from'${root}src/lib/askCovaClient.ts';
import{buildAskCovaCatalog,askCovaModelPayload}from'${root}src/lib/askCova.ts';import{syntheticAnswer}from'${root}scripts/helpers/ask-cova-authored-fixture.mjs';
const root=createRoot(document.getElementById('root'));
window.answerFor=async(input)=>{const catalog=await buildAskCovaCatalog({ownerId:input.owner,account:input.account,range:input.range,question:input.question,trades:window.fixtureRows||trades});const answer=syntheticAnswer(askCovaModelPayload(catalog),'warm');if(window.choice==='invented_choice')answer.paragraphs[0].evidence=['unknown'];return answer;};
const trades=[100,-30,20].map((pnl,i)=>({id:'manual-'+i,date:'2026-10-2'+(i+1),market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl,risk:50,riskStatus:i===1?'missing':'provided',setup:'',notes:'Private journal note',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}}));
window.calls=[];window.mode='ok';window.current=true;window.trades=trades;
// Synthetic capability lifecycle through the same public binding API used by useAskCovaAccess.
// No auth/server discovery is simulated as real; default component authority stays intact.
window.betaCurrent=askCovaAccessCurrent;
window.setBetaGrant=allowed=>{window.removeBetaGrant?.();window.removeBetaGrant=bindAskCovaAccessAuthority(owner=>allowed===true&&owner==='11111111-1111-4111-8111-111111111111'&&window.current);};
window.request=async(input,signal)=>{window.lastSignal=signal;window.calls.push(input);if(window.mode==='stream'){
 const body=JSON.stringify({status:'ok',aiResponseUsed:true,contextDigest:input.contextDigest,answer:await window.answerFor(input)});
 window.streamReads=0;window.streamCanceled=false;
 const bytes=new TextEncoder().encode(window.streamCase==='exact'?body.padEnd(8192):window.streamCase==='utf8'?JSON.stringify({...JSON.parse(body),padding:'€'.repeat(1400)}):body);
 let offset=0;
 const stream=new ReadableStream({pull(controller){window.streamReads++;if(window.streamCase==='stalled'){if(window.streamReads===1)controller.enqueue(new TextEncoder().encode('{'));return;}if(window.streamCase==='oversized'){controller.enqueue(new Uint8Array(4096).fill(120));return;}if(window.streamCase==='invalid'){controller.enqueue(new Uint8Array([255]));return;}if(offset===bytes.length){controller.close();return;}controller.enqueue(bytes.slice(offset,offset+4096));offset+=4096;if(offset>=bytes.length)controller.close();},cancel(){window.streamCanceled=true;}},{highWaterMark:0});
 window.stream=stream;
 const transport=createAskCovaTransport(input.owner,{current:()=>window.current,session:async()=>({user:{id:input.owner},access_token:'MOCK-TOKEN'}),fetch:async(url,init)=>{window.sentBody=JSON.parse(init.body);return new Response(stream,{headers:window.streamCase==='header'?{'Content-Length':'1048576'}:{}});}});
 return requestAskCova(input,signal,transport);
 }if(window.mode==='body'){const transport=createAskCovaTransport(input.owner,{current:()=>window.current,session:async()=>({user:{id:input.owner},access_token:'MOCK-TOKEN'}),fetch:async()=>new Response(new ReadableStream({start(controller){window.bodyController=controller;window.bodyInput=input;}}))});return requestAskCova(input,signal,transport);}if(window.mode==='slow')await new Promise(r=>window.finish=r);if(window.mode==='throw')throw Error('Synthetic rejected request');if(window.mode==='error')return {status:'unavailable',message:'Answer unavailable. Try again.'};return {status:'ok',aiResponseUsed:true,contextDigest:input.contextDigest,answer:await window.answerFor(input)};};
window.showAsk=(ready=true,account='local',range='all',rows=trades,injectedAuthority=true,ownerId='11111111-1111-4111-8111-111111111111')=>root.render(<main className="oa-dashboard-app"><section className="astra-dashboard" data-dashboard-visual="reference" style={{display:'block',maxWidth:1040,margin:'24px auto',padding:'0 16px'}}><AskCova ownerId={ownerId} account={account} range={range} trades={rows} ready={ready} request={window.request} ownerCurrent={injectedAuthority ? owner=>owner==='11111111-1111-4111-8111-111111111111'&&window.current : undefined}/></section></main>);const show=window.showAsk;window.showAsk=(...args)=>{window.fixtureRows=args[3]||trades;return show(...args)};window.showAsk();${canonicalCSS}`;
const result=await build({root,configFile:false,envDir:false,logLevel:'error',plugins:[{name:'ask-cova-ui',resolveId(v){if(v.endsWith('__ask_cova_ui_test__.tsx'))return id;},load(v){if(v===id)return entry;}},react()],define:{'process.env.NODE_ENV':'"production"'},build:{write:false,copyPublicDir:false,lib:{entry:id,formats:['es'],fileName:'probe',cssFileName:'probe'}}});
const files=new Map((Array.isArray(result)?result.flatMap(r=>r.output):result.output).map(o=>['/'+o.fileName,o.type==='chunk'?o.code:o.source]));
const html=`<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>${[...files.keys()].filter(x=>x.endsWith('.css')).map(x=>`<link rel='stylesheet' href='${x}'>`).join('')}</head><body style='background:#101318'><div id='root'></div><script type='module' src='/probe.js'></script></body></html>`;
const browser=await chromium.launch({channel:'chrome',headless:true});const report={checks:[],errors:[],requests:[]};
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.route('**/*',r=>{const u=new URL(r.request().url());const body=u.origin==='https://ask.test'?(u.pathname==='/'?html:files.get(u.pathname)):undefined;if(body===undefined){report.requests.push(u.href);return r.abort();}return r.fulfill({body,contentType:u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'text/html'});});
 const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto('https://ask.test');

 await p.getByRole('heading',{name:'Ask Cova'}).waitFor();
 const composer=p.getByRole('textbox',{name:'Message Cova',exact:true});
 const send=p.getByRole('button',{name:'Send message',exact:true});
 assert.equal(await composer.count(),1,'a named bottom composer is mounted');
 assert.ok(await composer.isEnabled());
 assert.equal(await p.evaluate(()=>window.calls.length),0,'mount never asks');
 await composer.focus();await composer.fill('How did I do?');
 assert.equal(await p.evaluate(()=>window.calls.length),0,'focus and typing never ask');
 await composer.press('Enter');
 assert.equal(await p.getByRole('button',{name:'Use AI for this review',exact:true}).count(),0);
 assert.doesNotMatch(await p.locator('[data-ask-cova]').innerText(),/OpenAI|gpt-|I accept|Use AI/i);
 await p.waitForFunction(()=>window.calls.length===1);
 await p.locator('[data-cova-answer]').waitFor();
 assert.match(await p.locator('[data-cova-answer]').innerText(),/90\.00/);
 const call=await p.evaluate(()=>window.calls[0]);
 assert.equal(call.question,'review_results');
 assert.deepEqual(Object.keys(call).sort(),['account','contextDigest','conversation','owner','question','range','requestId']);
 assert.deepEqual(call.conversation,{message:'How did I do?',history:[]});
 assert.equal(await composer.inputValue(),'');
 report.checks.push('typed question uses checked catalog after deliberate send; actual text explicitly forwarded');
 await composer.fill('Buy NQ tomorrow PRIVATE-MARKER');await send.click();
 await p.waitForFunction(()=>document.querySelectorAll('[data-cova-answer]').length===2);
 assert.equal(await p.locator('[data-cova-local]').count(),0);
 assert.equal(await p.evaluate(()=>window.calls.length),2);
 assert.equal(await p.evaluate(()=>window.calls.at(-1).conversation.message),'Buy NQ tomorrow PRIVATE-MARKER');
 report.checks.push('previously unsupported typed input reaches synthetic transport; server/model owns advice boundary');
 // Missing risk no longer replaces a review. Use a distinct valid drawdown reply to test exact retained context.
 await p.evaluate(()=>window.choice='drawdown');
 await composer.fill('Explain my drawdown');await send.click();
 await p.waitForFunction(()=>document.querySelectorAll('[data-cova-answer]').length===3);
 await composer.fill('Tell me more');await send.click();
 await p.waitForFunction(()=>document.querySelectorAll('[data-cova-answer]').length===4);
 assert.equal(await p.evaluate(()=>window.calls.at(-1).conversation.message),'Tell me more');
 await p.locator('[data-cova-reply]').last().getByRole('button',{name:'Tell me more',exact:true}).click();
 assert.equal(await p.locator('[data-cova-detail]').count(),1,'typed follow-up resolves the latest checked reply');
 assert.match(await p.locator('[data-cova-detail]').last().innerText(),/supporting value is \$30\.00/);
 await composer.fill('Which trades?');await send.click();await p.locator('dialog').waitFor();
 assert.deepEqual(await p.locator('[data-history-trade]').evaluateAll(rows=>rows.map(row=>row.dataset.historyTrade).sort()),['manual-0','manual-1','manual-2']);
 await p.getByRole('button',{name:'Close trade history'}).click();
 const first=p.locator('[data-cova-reply]').first();
 await first.getByRole('button',{name:'Show trades',exact:true}).click();await p.locator('dialog').waitFor();
 assert.deepEqual(await p.locator('[data-history-trade]').evaluateAll(rows=>rows.map(row=>row.dataset.historyTrade)).then(x=>x.sort()),['manual-0','manual-1','manual-2']);
 await p.getByRole('button',{name:'Close trade history'}).click();
 await first.getByRole('button',{name:'Tell me more',exact:true}).click();
 assert.equal(await p.locator('[data-cova-detail]').count(),2);
 assert.match(await p.locator('[data-cova-detail]').last().innerText(),/supporting value is \$90\.00/);
 assert.match(await p.locator('.ask-cova-exchange').last().innerText(),/supporting value is \$90\.00/,'old reply detail is appended chronologically, not inserted before newer messages');
 assert.equal(await p.evaluate(()=>window.calls.length),4,'typed details dispatch; bound detail/evidence buttons remain local');
 report.checks.push('typed followups use latest success; older reply actions retain their own exact evidence/detail and append in order');
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 await composer.fill('Tell me more');await send.click();
 await p.locator('[data-cova-answer]').waitFor();
 assert.deepEqual(await p.evaluate(()=>window.calls.at(-1).conversation),{message:'Tell me more',history:[]});
 assert.equal(await p.evaluate(()=>window.calls.length),5);
 for(let i=1;i<20;i++){await composer.fill('unsupported '+i);await send.click();await p.waitForFunction(()=>!document.querySelector('[data-cova-processing]'));}
 assert.equal(await p.locator('.ask-cova-exchange').count(),20);
 assert.equal(await composer.isDisabled(),true,'thread stops at 20 exchanges rather than dropping history');
 await p.getByText('This conversation has reached 20 messages. Clear it to start another review.',{exact:true}).waitFor();
 assert.equal(await p.locator('.ask-cova-exchange').count(),20);
 assert.equal(await p.evaluate(()=>window.calls.length),24);
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 assert.equal(await p.locator('.ask-cova-exchange').count(),0);assert.ok(await composer.isEnabled());
 report.checks.push('contextless followups dispatch with empty history; explicit 20-exchange limit keeps the thread and clear resets it');
 await p.clock.install();
 await p.evaluate(()=>{window.choice=undefined;window.mode='slow';window.finish=undefined;});
 await composer.fill('Review my results');await send.click();
 assert.equal(await p.getByText('Checking your results…',{exact:true}).count(),1,'processing begins only after deliberate send');
 await p.waitForFunction(()=>!!window.finish);
 assert.ok(await composer.isDisabled());assert.ok(await send.isDisabled());
 assert.ok(await p.getByText('Checking your results…',{exact:true}).isVisible());
 const beforeTimeout=await p.evaluate(()=>window.calls.length);
 await p.clock.runFor(25001);
 assert.ok(await p.evaluate(()=>window.lastSignal.aborted),'25-second deadline aborts real signal');
 assert.equal(await composer.isDisabled(),false,'deadline releases the UI even when an injected request ignores abort');
 await p.getByText('That took too long. You can try again when you’re ready.',{exact:true}).waitFor();
 assert.equal(await p.getByText('Checking your results…',{exact:true}).count(),0);
 assert.equal(await p.evaluate(()=>window.calls.length),beforeTimeout,'timeout never retries automatically');
 await p.evaluate(()=>window.finish());await p.clock.runFor(10);
 assert.equal(await p.locator('[data-cova-answer]').count(),0,'late timed-out answer cannot render');
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 await p.evaluate(()=>window.finish=undefined);
 await composer.fill('Review my results');await send.click();
 await p.waitForFunction(()=>!!window.finish);
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 assert.ok(await p.evaluate(()=>window.lastSignal.aborted));assert.ok(await composer.isEnabled());
 await p.evaluate(()=>window.finish());await p.clock.runFor(25001);
 assert.equal(await p.locator('[role="log"]').count(),0);assert.equal(await p.locator('.ask-cova-error').count(),0);
 report.checks.push('pending-only indicator, one request, 25s abort, no automatic retry, clear abort and late completion rejection');
 await p.evaluate(()=>{window.mode='ok';window.choice=undefined;});
 await composer.fill('How did I do?');await send.click();await p.locator('[data-cova-answer]').waitFor();
 await composer.fill('Explain my drawdown');await send.click();await p.waitForFunction(()=>document.querySelectorAll('[data-cova-answer]').length===2);
 await p.locator('[data-cova-reply]').last().getByRole('button',{name:'Tell me more',exact:true}).click();
 await p.evaluate(()=>document.fonts.ready);
 for(const width of [1440,768,390,320]){
  await p.setViewportSize({width,height:1000});
  const metrics=await p.locator('[data-ask-cova]').evaluate(el=>{
   const q=el.querySelector('.ask-cova-question'),a=el.querySelector('.ask-cova-reply'),c=el.querySelector('.ask-cova-composer'),log=el.querySelector('[role="log"]');
   const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
   return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,question:rect(q),reply:rect(a),composer:rect(c),log:rect(log),questionRadius:parseFloat(getComputedStyle(q).borderTopLeftRadius),replyRadius:parseFloat(getComputedStyle(a).borderTopLeftRadius),composerRadius:parseFloat(getComputedStyle(c).borderRadius),buttons:[...el.querySelectorAll('button')].map(n=>({text:n.textContent,...rect(n)})),questionBackground:getComputedStyle(q).backgroundColor,replyBackground:getComputedStyle(a).backgroundColor,font:getComputedStyle(a).fontFamily};
  });
  assert.ok(metrics.questionRadius>=20&&metrics.replyRadius>=20&&metrics.composerRadius>=20,'comfortable rounded conversation surfaces');
  assert.ok(metrics.question.left>metrics.reply.left,'outgoing right, incoming left');
  assert.ok(metrics.question.width<metrics.log.width,'short bubbles fit content');
  assert.ok(metrics.composer.top>=metrics.log.bottom,'composer stays below persistent messages');
  assert.equal(metrics.overflow,false);assert.ok(metrics.buttons.every(b=>b.height===36&&b.width>=44),'compact 36px faces retain Cova control language');
  for(const button of await p.locator('[data-ask-cova] button:enabled').all()){
   await button.evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));
   const hitCheck=await button.evaluate(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n,'::after');const points=[r.top-3,r.bottom+3].map(y=>document.elementFromPoint(r.left+r.width/2,y));return {ok:points.every(e=>e?.closest('button')===n),points:points.map(e=>e?.outerHTML.slice(0,160)),pseudo:{top:s.top,bottom:s.bottom,height:s.height,content:s.content,display:s.display},ancestors:[n,n.parentElement,n.parentElement.parentElement].map(e=>({class:e.className,overflow:getComputedStyle(e).overflow,zIndex:getComputedStyle(e).zIndex}))};});
   assert.ok(hitCheck.ok, 'actual upper and lower hit coverage outside compact face: '+await button.innerText()+' '+JSON.stringify(hitCheck));
  }
  const evidenceButton=p.locator('[data-cova-reply]').first().getByRole('button',{name:'Show trades',exact:true});
  await evidenceButton.scrollIntoViewIfNeeded();const hit=await evidenceButton.boundingBox();await p.mouse.click(hit.x+hit.width/2,hit.y-3);
  await p.locator('dialog').waitFor();await p.getByRole('button',{name:'Close trade history'}).click();
  assert.equal(metrics.questionBackground,'rgb(40, 100, 218)');assert.equal(metrics.replyBackground,'rgb(36, 40, 48)');assert.match(metrics.font,/Inter/);
  assert.equal(await p.locator('.ask-cova-question').first().evaluate(n=>getComputedStyle(n).color),'rgb(255, 255, 255)','outgoing text has full contrast');
  assert.equal(await p.locator('[data-cova-answer]').first().evaluate(n=>getComputedStyle(n).color),'rgb(229, 234, 242)','reply body uses primary ink');
  assert.equal(await composer.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)','composer is one unified surface, not a nested black field');
  assert.notEqual(await send.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(40, 100, 218)','empty composer send is visibly inactive');
  await p.mouse.move(0,0);
  report.measurements??=[];report.measurements.push(metrics);
  await p.screenshot({path:`${evidence}/component-chat-${width}.png`,fullPage:true});
 }
 await p.setViewportSize({width:390,height:1000});
 report.checks.push('canonical CSS desktop/tablet/phone: rounded charcoal/cobalt text-sized bubbles, bottom composer, compact controls with actual 44px hit coverage/outside-face click and no horizontal overflow');
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 await composer.fill('Review my results');await composer.press('Shift+Enter');
 assert.equal(await composer.inputValue(),'Review my results\n');
 assert.equal(await p.locator('.ask-cova-exchange').count(),0);
 await composer.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,keyCode:229});
 assert.equal(await p.locator('.ask-cova-exchange').count(),0,'IME Enter cannot dispatch');
 await composer.fill('x'.repeat(501));assert.equal((await composer.inputValue()).length,500);
 await composer.fill('Review my results');await composer.press('Enter');
 await p.locator('[data-cova-answer]').waitFor();
 await p.evaluate(()=>{window.mode='error';});
 await composer.fill('Explain my drawdown');await send.click();await p.getByText('Answer unavailable. Try again.',{exact:true}).waitFor();
 assert.equal(await p.locator('[data-cova-answer]').count(),1,'good messages survive a later failure');
 await composer.fill('Tell me more');await send.click();
 await p.waitForFunction(()=>!document.querySelector('[data-cova-processing]'));
 assert.equal(await p.evaluate(()=>window.calls.at(-1).question),'review_results','failed question never becomes facts hint');
 assert.equal(await p.evaluate(()=>window.calls.at(-1).conversation.history.some(item=>item.content==='Explain my drawdown')),false);
 await p.locator('[data-cova-reply]').first().getByRole('button',{name:'Tell me more',exact:true}).click();
 assert.match(await p.locator('[data-cova-detail]').last().innerText(),/supporting value is \$90\.00/,'failed questions never become followup context');
 report.checks.push('Enter/Shift+Enter/IME and 500-character browser bound; latest successful context survives later error');
 await p.evaluate(()=>{window.current=false;});
 await composer.fill('Tell me more');await send.click();
 assert.equal(await p.locator('[data-cova-answer]').count(),0);assert.equal(await p.locator('[data-cova-detail]').count(),0);
 await p.getByText('Your session changed. Sign in again to ask Cova.',{exact:true}).waitFor();
 report.checks.push('typed retained followup rechecks authority and clears the entire thread');
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 await p.evaluate(()=>{window.current=true;window.mode='ok';});
 await composer.fill('Review my results');await send.click();await p.locator('[data-cova-answer]').waitFor();
 await p.evaluate(()=>{window.mode='slow';window.finish=undefined;});
 await composer.fill('Explain my drawdown');await send.click();await p.waitForFunction(()=>!!window.finish);
 await p.evaluate(()=>{window.current=false;window.mode='throw';window.finish();});
 await p.clock.runFor(10);
 assert.equal(await p.locator('[data-cova-answer]').count(),0,'stale authority also clears prior replies when request rejects');
 await p.getByText('Your session changed. Sign in again to ask Cova.',{exact:true}).waitFor();
 report.checks.push('rejected pending request rechecks live owner, rather than leaving old evidence actionable');
 await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
 await p.evaluate(()=>{window.current=true;window.mode='slow';window.finish=undefined;});
 await composer.fill('How did I do?');await composer.press('Enter');
 await p.waitForFunction(()=>!!window.finish);
 assert.equal(await p.locator('[data-cova-processing]').count(),1,'processing feedback is mounted only for an actual pending request');
 await p.emulateMedia({reducedMotion:'no-preference'});
 assert.notEqual(await p.locator('.ask-cova-dots i').first().evaluate(n=>getComputedStyle(n).animationName),'none');
 await p.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await p.locator('.ask-cova-dots i').first().evaluate(n=>getComputedStyle(n).animationName),'none');
 assert.equal(await send.evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
 await p.screenshot({path:evidence+'/component-processing-reduced-390.png',fullPage:true});
 await p.evaluate(()=>window.finish());await p.locator('[data-cova-answer]').waitFor();
 assert.equal(await p.locator('[data-cova-processing]').count(),0);
 assert.equal(await composer.evaluate(n=>document.activeElement===n),true,'keyboard continuation returns to the composer after the reply');
 assert.equal(await composer.evaluate(n=>getComputedStyle(n).outlineStyle),'solid');
 assert.ok(await composer.evaluate(n=>parseFloat(getComputedStyle(n).outlineWidth)>=2),'composer focus ring is explicitly visible, not a 1px UA outline');
 await p.locator('[data-cova-reply]').last().getByRole('button',{name:'Show trades',exact:true}).click();await p.locator('dialog').waitFor();
 assert.ok(await p.locator('dialog').evaluate(n=>parseFloat(getComputedStyle(n).borderRadius)>=20),'evidence sheet is softened only inside Ask Cova');
 assert.equal(await p.locator('dialog [data-journal-accuracy]').count(),0);
 await p.screenshot({path:evidence+'/component-evidence-390.png',fullPage:true});
 await p.getByRole('button',{name:'Close trade history'}).click();
 report.checks.push('real pending-only dot feedback, computed reduced motion, composer keyboard continuation and scoped rounded evidence sheet');
 for(const sample of ['exact','oversized','header','utf8','invalid','stalled']){
  await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
  await p.evaluate(sample=>{window.mode='stream';window.streamCase=sample;window.current=true;},sample);
  const callsBefore=await p.evaluate(()=>window.calls.length);
  await composer.fill('How did I do?');await send.click();
  if(sample==='exact')await p.locator('[data-cova-answer]').waitFor();
  else if(sample==='stalled'){
   await p.waitForFunction(()=>window.streamReads===2);await p.getByRole('button',{name:'Clear conversation',exact:true}).click();
   await p.waitForFunction(()=>window.streamCanceled);
  }else await p.locator('.ask-cova-error').waitFor();
  assert.equal(await p.evaluate(()=>window.calls.length),callsBefore+1);
  const result=await p.evaluate(()=>({reads:window.streamReads,canceled:window.streamCanceled,locked:window.stream.locked,body:window.sentBody}));
  assert.deepEqual(Object.keys(result.body).sort(),['account','action','contextDigest','conversation','owner','protocolVersion','question','range','requestId']);
  assert.equal(result.body.action,'ask_cova');assert.equal(result.body.protocolVersion,'ask-cova-v3');
  assert.deepEqual(result.body.conversation,{message:'How did I do?',history:[]});assert.ok(!JSON.stringify(result.body).includes('Private journal note'));
  assert.equal(result.locked,false);
  if(sample==='exact')assert.match(await p.locator('[data-cova-answer]').innerText(),/90\.00/);
  else assert.equal(await p.locator('[data-cova-answer]').count(),0);
  if(['oversized','header','invalid','stalled'].includes(sample))assert.equal(result.canceled,true);
  if(sample==='header')assert.equal(result.reads,0);
  if(sample==='oversized')assert.ok(result.reads<=3);
  report.checks.push('real browser transport/body guard: '+sample);
 }
 await p.evaluate(()=>{window.mode='ok';window.current=true;});
 await p.getByRole('button',{name:'Review my results',exact:true}).click();await p.locator('[data-cova-answer]').waitFor();
 assert.equal(await composer.evaluate(n=>document.activeElement===n),false,'preset initiation does not force keyboard focus into the composer');
 await p.evaluate(()=>{window.mode='slow';window.finish=undefined;});
 await composer.fill('Explain my drawdown');await composer.press('Enter');await p.waitForFunction(()=>!!window.finish);
 await p.locator('[data-cova-reply]').first().getByRole('button',{name:'Show trades',exact:true}).click();await p.locator('dialog').waitFor();
 await p.evaluate(()=>window.finish());await p.waitForFunction(()=>document.querySelectorAll('[data-cova-answer]').length===2);
 assert.equal(await composer.evaluate(n=>document.activeElement===n),false,'response cannot steal focus from open evidence');
 assert.ok(await p.locator('dialog').evaluate(n=>n.contains(document.activeElement)));
 await p.getByRole('button',{name:'Close trade history'}).click();
 // Finish the existing dialog's requestAnimationFrame focus restoration before typing.
 await p.clock.runFor(32);
 await p.evaluate(()=>window.mode='ok');
 await composer.fill('Review my results');await composer.press('Enter');await p.waitForFunction(()=>document.querySelectorAll('[data-cova-answer]').length===3);
 assert.ok(await composer.evaluate(n=>document.activeElement===n),'continuous composer focus: '+await p.evaluate(()=>document.activeElement.outerHTML));
 await p.keyboard.type('Tell me more');await p.keyboard.press('Enter');
 await p.waitForFunction(()=>document.querySelectorAll('[data-cova-answer]').length===4);
 assert.equal(await p.evaluate(()=>window.calls.at(-1).conversation.message),'Tell me more');
 await p.locator('[data-cova-reply]').last().getByRole('button',{name:'Tell me more',exact:true}).click();
 await p.locator('[data-cova-detail]').waitFor();
 assert.match(await p.locator('[data-cova-detail]').innerText(),/supporting value is \$90\.00/);
 report.checks.push('continuous composer keyboard typing resumes after reply; preset/evidence focus is never stolen');
 const staleBefore=await p.evaluate(()=>{window.current=false;return window.calls.length;});
 await composer.fill('Explain my drawdown');await send.click();
 assert.equal(await p.locator('.ask-cova-exchange').count(),0);assert.equal(await p.evaluate(()=>window.calls.length),staleBefore);
 await p.getByText('Your session changed. Sign in again to ask Cova.',{exact:true}).waitFor();
 report.checks.push('new question after live-owner invalidation clears all prior messages before any dispatch');
 // Same-task events deliberately run before React commits: DOM disabled state is not authority.
 const racePage=await context.newPage();racePage.setDefaultTimeout(5000);
 racePage.on('pageerror',e=>report.errors.push(e.message));
 const button=name=>racePage.getByRole('button',{name,exact:true});
 const input=racePage.getByRole('textbox',{name:'Message Cova',exact:true});
 const state=()=>racePage.evaluate(()=>({count:document.querySelectorAll('.ask-cova-exchange').length,answers:document.querySelectorAll('[data-cova-answer]').length,details:document.querySelectorAll('[data-cova-detail]').length,dialog:!!document.querySelector('dialog[open]'),consent:!!document.querySelector('.ask-cova-consent'),calls:window.calls}));
 const settle=()=>racePage.waitForTimeout(100);
 async function success(){await button('Review my results').click();await racePage.locator('[data-cova-answer]').waitFor();}
 async function race(name,fn){
  await racePage.goto('https://ask.test');await racePage.getByRole('heading',{name:'Ask Cova',exact:true}).waitFor();
  try{await fn();(report.races??=[]).push({name,passed:true});}
  catch(error){(report.races??=[]).push({name,passed:false,error:String(error),state:await state()});}
 }
 await race('CHAT-S01 Clear synchronously revokes real-client event epoch with default authority',async()=>{
  await racePage.evaluate(()=>{localStorage.setItem('cova-active-storage-identity-v1','11111111-1111-4111-8111-111111111111');window.mode='stream';window.streamCase='exact';window.showAsk(true,'local','all',undefined,false);});
  await racePage.evaluate(()=>window.setBetaGrant(false));
  assert.equal(await racePage.evaluate(()=>window.betaCurrent('11111111-1111-4111-8111-111111111111')),false);
  await button('Review my results').click();
  await racePage.getByText('Your session changed. Sign in again to ask Cova.',{exact:true}).waitFor();
  assert.equal((await state()).calls.length,0);assert.equal((await state()).answers,0);
  await button('Clear conversation').click();await racePage.evaluate(()=>window.setBetaGrant(true));
  assert.equal(await racePage.evaluate(()=>window.betaCurrent('11111111-1111-4111-8111-111111111111')),true);
  await success();assert.equal(await racePage.evaluate(()=>window.sentBody.protocolVersion),'ask-cova-v3');
  await racePage.evaluate(()=>{[...document.querySelectorAll('button')].find(n=>n.textContent==='Clear conversation').click();document.querySelector('.ask-cova-questions button').click();});await settle();
  const s=await state();assert.equal(s.calls.length,1);assert.equal(s.answers,0);assert.equal(s.consent,false);
  await button('Review my results').click();
  await racePage.locator('[data-cova-answer]').waitFor();assert.equal((await state()).calls.length,2);
  await racePage.evaluate(()=>{window.removeBetaGrant();[...document.querySelectorAll('button')].find(n=>n.textContent==='Show trades').click();});await settle();
  assert.equal(await racePage.evaluate(()=>window.betaCurrent('11111111-1111-4111-8111-111111111111')),false);
  const removed=await state();assert.equal(removed.calls.length,2);assert.equal(removed.answers,0);assert.equal(removed.details,0);assert.equal(removed.dialog,false);
  await button('Clear conversation').click();await button('Review my results').click();
  await racePage.getByText('Your session changed. Sign in again to ask Cova.',{exact:true}).waitFor();
  assert.equal((await state()).calls.length,2);assert.equal((await state()).answers,0);
  await racePage.evaluate(()=>localStorage.removeItem('cova-active-storage-identity-v1'));
  report.checks.push('default-authority real-client explicit-action race requires beta grant; denied and removed grants block dispatch and retained evidence');
 });
 await race('CHAT-S01 retained starter cannot dispatch in a cleared epoch',async()=>{
  await success();
  await racePage.evaluate(()=>{const starter=document.querySelector('.ask-cova-questions button');[...document.querySelectorAll('button')].find(n=>n.textContent==='Clear conversation').click();starter.click();});await settle();
  assert.equal((await state()).calls.length,1);assert.equal((await state()).count,0);
  await button('Review my results').click();await racePage.locator('[data-cova-answer]').waitFor();assert.equal((await state()).consent,false);assert.equal((await state()).calls.length,2);
 });
 await race('CHAT-L01 first activation synchronously reserves exactly one request',async()=>{
  await racePage.evaluate(()=>{const b=document.querySelectorAll('.ask-cova-questions button');b[0].click();b[1].click();});await settle();assert.equal((await state()).count,1);assert.equal((await state()).calls.length,1);
 });
 await race('CHAT-L01 blocked choice cannot replace failed retry target',async()=>{
  await success();await racePage.evaluate(()=>{window.mode='slow';window.finish=undefined;const b=document.querySelectorAll('.ask-cova-questions button');b[1].click();b[2].click();});await racePage.waitForFunction(()=>!!window.finish);
  const pendingState=await state();await racePage.evaluate(()=>{window.mode='error';window.finish();});await button('Try again').waitFor();await racePage.evaluate(()=>window.mode='ok');await button('Try again').click();await racePage.waitForFunction(()=>window.calls.length===3);await settle();
  assert.equal((await state()).calls[2].question,'explain_drawdown');assert.equal(pendingState.count,2);assert.equal(pendingState.calls.length,2);assert.equal((await state()).answers,2);
 });
 await race('CHAT-L01 a failed question allows a new question; retained retry cannot supersede it',async()=>{
  await success();await racePage.evaluate(()=>window.mode='error');await button('Explain my drawdown').click();await button('Try again').waitFor();
  await racePage.evaluate(()=>{window.mode='slow';window.finish=undefined;const retry=[...document.querySelectorAll('button')].find(n=>n.textContent==='Try again');document.querySelectorAll('.ask-cova-questions button')[2].click();retry.click();});await racePage.waitForFunction(()=>!!window.finish);
  assert.equal((await state()).calls.length,3);assert.equal((await state()).calls[2].question,'what_stands_out');assert.equal((await state()).count,3);
  await racePage.evaluate(()=>{window.mode='error';window.finish();});await button('Try again').waitFor();await racePage.evaluate(()=>window.mode='ok');await button('Try again').click();await racePage.waitForFunction(()=>window.calls.length===4);assert.equal((await state()).calls[3].question,'what_stands_out');
 });
 for(const action of ['Tell me more','Show trades'])await race('CHAT-L03 Clear invalidates retained '+action,async()=>{
  await success();await racePage.evaluate(action=>{const old=[...document.querySelectorAll('button')].find(n=>n.textContent===action);[...document.querySelectorAll('button')].find(n=>n.textContent==='Clear conversation').click();old.click();},action);await settle();
  const s=await state();assert.equal(s.count,0);assert.equal(s.details,0);assert.equal(s.dialog,false);assert.equal(s.calls.length,1);
 });
 await race('CHAT-S01 Clear invalidates retained retry',async()=>{
  await racePage.evaluate(()=>window.mode='error');await button('Review my results').click();await button('Try again').waitFor();
  await racePage.evaluate(()=>{const retry=[...document.querySelectorAll('button')].find(n=>n.textContent==='Try again');[...document.querySelectorAll('button')].find(n=>n.textContent==='Clear conversation').click();retry.click();});await settle();assert.equal((await state()).calls.length,1);assert.equal((await state()).count,0);
 });
 for(const text of ['unsupported PRIVATE-MARKER','Tell me more','Which trades?','Explain my drawdown'])await race('CHAT-L02 consumes a draft once: '+text,async()=>{
  await success();await input.fill(text);await racePage.evaluate(()=>{const form=document.querySelector('.ask-cova-composer');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await settle();
  assert.equal((await state()).count,2);assert.equal(await input.inputValue(),'');assert.equal((await state()).calls.length,text==='Which trades?'?1:2);
 });
 for(const kind of ['reply','unsupported','detail','trades','question'])await race('CHAT-L02 atomically reserves twentieth slot: '+kind,async()=>{
  await success();for(let i=0;i<18;i++){await input.fill('unsupported '+i);await button('Send message').click();await racePage.waitForFunction(()=>!document.querySelector('[data-cova-processing]'));}assert.equal((await state()).count,19);
  if(kind==='reply')await racePage.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(n=>n.textContent==='Tell me more');b.click();b.click();});
  else {await input.fill({unsupported:'unsupported final',detail:'Tell me more',trades:'Which trades?',question:'Explain my drawdown'}[kind]);await racePage.evaluate(()=>{const f=document.querySelector('.ask-cova-composer');f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));document.querySelectorAll('.ask-cova-questions button')[1].click();});}
  await settle();assert.equal((await state()).count,20);assert.equal(await input.isDisabled(),true);
 });
 await racePage.close();
 await p.goto('https://ask.test');
 await p.getByRole('heading',{name:'Ask Cova'}).waitFor();
 await p.evaluate(()=>window.showAsk(true,'all','all',[100,-30,20,-10].map((pnl,i)=>({id:'tradovate-7:rich-'+i,date:'2026-10-2'+(i+1),market:'NQ',side:i%2?'Short':'Long',contracts:1,entry:100,exit:101,pnl,risk:0,riskStatus:'missing',setup:i%2?'PRIVATE SETUP B':'PRIVATE SETUP A',notes:'PRIVATE RICH NOTE',source:{provider:'Tradovate',accountId:'7',pnlBasis:'gross_before_fees',timeZone:'UTC',openedAt:'2026-10-2'+(i+1)+'T'+(i<2?'14':'18')+':00:00Z',closedAt:'2026-10-2'+(i+1)+'T'+(i<2?'14':'18')+':'+[5,20,10,30][i].toString().padStart(2,'0')+':00Z'}}))));
 await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await p.getByRole('button',{name:'Review my results',exact:true}).click();
 await p.locator('[data-cova-answer]').waitFor();
 const reviewAnswer=await p.locator('[data-cova-answer]').innerText();
 assert.match(reviewAnswer,/\$80\.00/);assert.match(reviewAnswer,/win rate: 50\.0%/i);assert.match(reviewAnswer,/profit factor: 3\.00/i);
 const richQuestions=[['How does holding time affect my results?','holding_time'],['What setup works best?','setup_performance'],['When do I trade best?','time_of_day'],['Am I better at shorting or longing?','long_vs_short']];
 for(const [text,question] of richQuestions){
  const before=await p.evaluate(()=>window.calls.length);
  await composer.fill(text);assert.equal(await p.evaluate(()=>window.calls.length),before);
  await send.click();await p.waitForFunction(count=>window.calls.length===count,before+1);
  await p.waitForFunction(count=>document.querySelectorAll('[data-cova-answer]').length===count,before+1);
  const call=await p.evaluate(()=>window.calls.at(-1));assert.equal(call.question,question);
  assert.deepEqual(Object.keys(call).sort(),['account','contextDigest','conversation','owner','question','range','requestId']);
  assert.equal(call.conversation.message,text);assert.doesNotMatch(JSON.stringify(call),/PRIVATE/);
  const answer=await p.locator('[data-cova-answer]').last().innerText();
  // Specific questions lead with their actual comparison, not repeated review metrics.
  const expected=question==='time_of_day'?['mean a: $35.00','mean b: $5.00','mean gap: $30.00','count a: 2','count b: 2']:['mean a: $60.00','mean b: −$20.00','mean gap: $80.00','count a: 2','count b: 2'];
  for(const fact of expected)assert.ok(answer.includes(fact),`${question}: missing checked comparison ${fact}`);
  assert.match(answer,/compared count: 4/);assert.match(answer,/comparison total: 4/);
  assert.doesNotMatch(answer,/risk.*(?:required|before|can't)/i);
 }
 for(const width of [1440,390,320]){
  await p.setViewportSize({width,height:1000});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.ok(await p.locator('.ask-cova-reply').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1&&parseFloat(getComputedStyle(n.querySelector('p')).lineHeight)>=20)));
  await p.screenshot({path:`${evidence}/rich-analyses-${width}.png`,fullPage:true});
 }
 report.richQuestions=richQuestions.map(([,id])=>id);

 assert.deepEqual(report.races.filter(test=>!test.passed),[],'same-task race regressions');
 assert.equal(report.races.length,17,'all original same-task race cases completed');
 assert.equal(report.checks.length,19,'complete existing chat coverage plus beta lifecycle check');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
}finally{await browser.close();writeFileSync(evidence+'/chat-ui.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
