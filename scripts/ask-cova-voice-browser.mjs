// SYNTHETIC isolated headless fixture. No provider calls or voice-quality claim.
import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/');
const out=resolve(process.env.ASK_COVA_EVIDENCE_ROOT || '../ask-cova-voice-evidence/implementation','authored-browser');mkdirSync(out,{recursive:true});
const id=root+'__voice_browser__.tsx';
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{AskCova}from'${root}src/components/AskCova.tsx';
const trades=[{id:'manual-one',date:'2026-10-29',market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl:20,risk:10,setup:'',notes:'PRIVATE',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}}];
window.calls=0;window.current=true;window.detail=true;window.show=()=>createRoot(document.getElementById('root')).render(<AskCova ownerId="synthetic-owner" account="all" range="all" trades={trades} ready={true} ownerCurrent={()=>window.current} request={async input=>{window.calls++;return {status:'ok',aiResponseUsed:true,contextDigest:input.contextDigest,answer:{version:'ask-cova-answer-v1',paragraphs:[{text:'a modest result: {{f:net}}.',evidence:['overall']},{text:'the downside is still an open question here.',evidence:['payoff']}],detail:window.detail?[{text:'without losing groups, profit factor is {{f:profit_factor}}.',evidence:['payoff']}]:[]}}}}/>);window.show();`;
const built=await build({root,configFile:false,envDir:false,logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'voice-test',resolveId(v){if(v.endsWith('__voice_browser__.tsx'))return id},load(v){if(v===id)return entry}},react()],build:{write:false,copyPublicDir:false,lib:{entry:id,formats:['es'],fileName:'voice',cssFileName:'voice'}}});
const files=new Map((Array.isArray(built)?built.flatMap(r=>r.output):built.output).map(o=>['/'+o.fileName,o.type==='chunk'?o.code:o.source]));
const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/voice.css"><div id="root"></div><script type="module" src="/voice.js"></script>`;
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='https://voice.test')return route.abort();const body=u.pathname==='/'?html:files.get(u.pathname);return body===undefined?route.abort():route.fulfill({body,contentType:u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'text/html'});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://voice.test');
 await page.getByRole('button',{name:'Review my results',exact:true}).click();await page.locator('[data-cova-answer]').first().waitFor({timeout:3000});
 assert.deepEqual(await page.locator('[data-cova-answer]').allTextContents(),['a modest result: $20.00.','the downside is still an open question here.']);
 await page.getByRole('button',{name:'Tell me more',exact:true}).click();assert.equal(await page.locator('[data-cova-detail]').innerText(),'without losing groups, profit factor is undefined (no losses).');assert.equal(await page.evaluate(()=>window.calls),1);
 await page.getByRole('button',{name:'Show trades',exact:true}).click();assert.deepEqual(await page.locator('[data-history-trade]').evaluateAll(rows=>rows.map(r=>r.dataset.historyTrade)),['manual-one']);await page.getByRole('button',{name:'Close trade history'}).click();
 await page.evaluate(()=>{const old=[...document.querySelectorAll('button')].find(b=>b.textContent==='Tell me more');[...document.querySelectorAll('button')].find(b=>b.textContent==='Clear conversation').click();old.click();});assert.equal(await page.locator('[data-cova-detail]').count(),0);
 await page.evaluate(()=>window.detail=false);await page.getByRole('button',{name:'Review my results',exact:true}).click();await page.locator('[data-cova-answer]').first().waitFor();assert.equal(await page.getByRole('button',{name:'Tell me more',exact:true}).count(),0);
 await page.screenshot({path:resolve(out,'synthetic-authored-phone.png'),fullPage:true});
 await page.evaluate(()=>{window.current=false;[...document.querySelectorAll('button')].find(b=>b.textContent==='Show trades').click();});assert.equal(await page.locator('dialog').count(),0);assert.equal(await page.locator('[data-cova-answer]').count(),0);assert.deepEqual(errors,[]);
 writeFileSync(resolve(out,'result.json'),JSON.stringify({synthetic:true,passed:true,providerCalls:0,checks:['authored paragraphs','bound detail without call','exact support','same-task clear','empty-detail hidden','revoked actions'],errors},null,2));
}finally{await browser.close();}
