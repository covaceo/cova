import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('sample journal discloses ephemeral notes rather than account or browser persistence',async()=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true}});
 try{
  const {MiniJournal}=await server.ssrLoadModule('/src/components/MiniJournal.tsx');
  const html=renderToStaticMarkup(createElement(MiniJournal,{initialDate:'2026-05-06',actions:{ephemeral:true,read:()=>'',save:()=>true}}));
  assert.match(html,/Sample note · resets on reload/);
  assert.doesNotMatch(html,/Private · saved on this browser/);
 }finally{await server.close();}
});

test('sample simplifies visible supporting copy without hiding financial basis',async()=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true}});
 try{
  const {RiskDeskFeature}=await server.ssrLoadModule('/src/components/landing/RiskDeskFeature.tsx');
  const html=renderToStaticMarkup(createElement(RiskDeskFeature,{go:()=>{}}));
  assert.match(html,/<details class="cova-demo-data-details"><summary>Data details<\/summary>/,'Supporting detail should be available on demand');
  assert.match(html,/USD · gross before fees/);
  assert.match(html,/data-sample-count/);
  assert.doesNotMatch(html,/cova-demo-chart-basis|cova-demo-footer|cova-demo-history/,'No repeated captions, instructions or sample footers');
  assert.doesNotMatch(html,/Hover or tap to inspect|Live product components|A little context makes/);
  const chapter=html.match(/class="cova-risk-chapter-body"[^>]*><p>(.*?)<\/p>/);
  assert(chapter && chapter[1].split(/\s+/).length<=12,'Each open chapter should be one short sentence');
 }finally{await server.close();}
});

test('preview uses the approved dashboard material and type, not a separate blue mini-app',()=>{
 const css=readFileSync('src/styles/landingRiskDesk.css','utf8');
 assert.match(css,/--cova-demo-canvas:\s*#0f0f0f/,'Same neutral workspace canvas');
 assert.match(css,/--cova-demo-rail:\s*#161616/,'Same neutral navigation material');
 assert.match(css,/font-family:\s*Inter,\s*Arial,\s*sans-serif/,'Same dashboard numerical typography');
 assert.match(css,/mini-journal \.astra-panel-heading\{[^}]*padding:0!important/,'Compact sample journal does not inherit the full dashboard heading padding');
});

test('first section renders an interactive product instrument rather than a dashboard screenshot',async()=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true}});
 try {
  const {HomeLanding}=await server.ssrLoadModule('/src/components/landing/HomeLanding.tsx');
  const html=renderToStaticMarkup(createElement(HomeLanding,{go:()=>{}}));
  assert.match(html,/data-risk-desk-preview/,'Live Risk Desk preview is missing');
  assert.match(html,/Know the story/);
  assert.match(html,/Review my trades/);
  assert.match(html,/Explore sample/);
  assert.match(html,/Sample trades/);
  assert.match(html,/astra-chart-svg/,'Must render the actual product chart');
  assert.doesNotMatch(html,/cova-risk-desk-(desktop|mobile)-sample\.webp/,'Not another screenshot');
  assert.equal((html.match(/data-feature-chapter=/g)||[]).length,3);
 } finally {await server.close();}
});
