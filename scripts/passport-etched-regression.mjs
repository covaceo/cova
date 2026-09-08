import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createOpticsHarness } from './helpers/passport-optics-harness.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),cache=new Map();
function load(path){
 path=resolve(root,path);if(cache.has(path))return cache.get(path).exports;
 const module={exports:{}};cache.set(path,module);
 const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const local=name=>{
  if(!name.startsWith('.'))return require(name);
  if(/\.(webp|woff2|ttf)\?inline$/.test(name)){const type=name.includes('.webp')?'image/webp':name.includes('.woff2')?'font/woff2':'font/ttf';return {default:`data:${type};base64,`+readFileSync(resolve(dirname(path),name.replace('?inline',''))).toString('base64')};}
  const p=resolve(dirname(path),name);return load([p,p+'.ts',p+'.tsx'].find(existsSync));
 };
 new Function('module','exports','require',code)(module,module.exports,local);return module.exports;
}
function render(mode='flex',rank='Gold',engraved=true){
 const {PassportHoloCard}=load('src/components/PassportHoloCard.tsx');
 const {buildHoloPassportModel}=load('src/lib/passportHolo.ts');
 const {analyze,sampleTrades,defaultRules}=load('src/lib/risk.ts');
 const {getMaterialSpec}=load('src/lib/passportMaterials.ts');
 const model=buildHoloPassportModel(analyze(sampleTrades,defaultRules),rank,mode,true);
 return {model,html:renderToStaticMarkup(React.createElement(PassportHoloCard,{model,engraved,appearance:{...getMaterialSpec(rank,'standard'),materialUrl:'sample.webp'}}))};
}
test('Etched preview opts into small script, grouped rank, left result and approved website without replacing the original',()=>{
 const {html}=render();
 assert.match(html,/class="passport-etched-website"[^>]*>covadesk\.com</,'Selected website must be real text');
 assert.match(html,/class="passport-etched-signature"[^>]*>Cova</);
 assert.match(html,/class="passport-etched-rank"[^>]*>GOLD</);
 const visible=html.replace(/<desc[\s\S]*?<\/desc>/g,'').replace(/<title[\s\S]*?<\/title>/g,'');
 assert.ok(visible.includes('+$1,008'));assert.ok(visible.includes('4/6 rules held'));
 assert.ok(visible.includes('Sample data'));assert.ok(visible.includes('Not account verified'));
 assert.doesNotMatch(visible,/Risk Passport|1\.11 profit factor|2 flags/);
 assert.match(html,/font-family:.*Cova Signature/);
 assert.match(html,/data:font\/woff2;base64/);assert.match(html,/data:font\/ttf;base64/);
 const original=render('flex','Gold',false).html;
 assert.ok(original.includes('Risk Passport'));assert.doesNotMatch(original,/passport-etched-website/);
});

test('Etched glyphs use recessed alpha lighting and react to actual tilt without an idle loop',()=>{
 const {html}=render();
 assert.match(html,/<feSpecularLighting[^>]*surfaceScale="-2\.4"/,'Real recessed glyph lighting is missing');
 assert.match(html,/in="glyph-depth"/);assert.match(html,/data-engraving-light="true"/);
 const {engravingLight}=load('src/lib/passportEngraving.ts');
 for(const point of [{x:0,y:0},{x:1,y:-1},{x:-1,y:1},{x:NaN,y:Infinity}]){
  const light=engravingLight(point);assert.ok(Number.isFinite(light.azimuth)&&Number.isFinite(light.elevation));
  assert.ok(light.elevation>0&&light.elevation<=90);
 }
 assert.notDeepEqual(engravingLight({x:1,y:0}),engravingLight({x:-1,y:0}));
 const {mountPassportOptics}=load('src/lib/passportOptics.ts');let last;
 const h=createOpticsHarness((face,canvas,url)=>mountPassportOptics(face,canvas,url,{film:1,refraction:1,gloss:48,finishIndex:1,engraved:true,onPose:pose=>{last={...pose};}}));
 try{
  h.settle();h.pointer('pointerdown',1,900);h.settle();
  assert.deepEqual(last,{x:.8,y:0});assert.equal(h.pending(),0);assert.equal(h.uniforms.u_motion,0);
  assert.equal(h.uniforms.u_engraved,1,'Only opt-in text geometry extends the tenure exclusion mask');
  h.loseRestore();h.settle();assert.deepEqual(last,{x:0,y:0});assert.equal(h.uniforms.u_engraved,1);
  h.pointer('pointerdown',1,900);h.settle();h.media.matches=true;h.media.dispatchEvent(new Event('change'));
  assert.deepEqual(last,{x:0,y:0},'Reduced motion resets glyph lighting');
 }finally{h.close();}
});

test('Every etched rank and mode retains data truth, fitted fields and privacy in vector/export content',()=>{
 const seen=new Set();
 for(const rank of ['Unranked','Bronze','Silver','Gold','Platinum','Diamond','Market Maker']) for(const mode of ['flex','discipline','private','coach']){
  const {html,model}=render(mode,rank);seen.add(rank+':'+mode);
  assert.ok(html.includes(rank.toUpperCase()));assert.ok(html.includes('Not account verified'));
  if(mode!=='flex')assert.doesNotMatch(html,/\+\$1,008|Reported P&amp;L/);
  if(mode==='private')assert.doesNotMatch(html,/Trader 6714|NQ \/ ES/);
  if(mode==='coach')assert.ok(html.includes('Top warning:'));
  if(mode==='discipline')assert.ok(html.includes('max drawdown'));
  const {finishProtectedAreas,engravedProtectedBox}=load('src/lib/passportOpticsShader.ts');
  const protectedPoint=(x,y)=>[...finishProtectedAreas.map(a=>a.box),engravedProtectedBox].some(([l,t,r,b])=>x>=l&&x<=r&&y>=t&&y<=b);
  for(const [x,y] of [[270,180],[440,251],[272,480],[830,606],[832,698],[970,774],[1408,798],[780,814]])assert.ok(protectedPoint(x,y));
  assert.ok(model.ruleSummary,'Typed proof, not string parsing');
 }
 assert.equal(seen.size,28);
 const {buildHoloPassportModel}=load('src/lib/passportHolo.ts');
 const {analyze,sampleTrades}=load('src/lib/risk.ts');
 assert.equal(buildHoloPassportModel(analyze(sampleTrades,[]),'Unranked','flex',true).ruleSummary,'Rules not checked');
});

test('Pale lettering gets a clipped inward cut shadow while dark-ink ranks keep their original filter',()=>{
 for(const rank of ['Unranked','Bronze','Market Maker']){
  const {html}=render('flex',rank);
  assert.match(html,/<feOffset[^>]*data-engraving-shadow="true"/,'Pale glyphs lack a directional inward cut shadow');
  assert.match(html,/in="SourceAlpha" in2="cut-offset" operator="out"/,'The shadow must stay inside the glyph');
  assert.match(html,/<feFlood[^>]*flood-color="#080b10"[^>]*flood-opacity="0\.65"/);
 }
 for(const rank of ['Gold','Silver','Platinum','Diamond'])assert.doesNotMatch(render('flex',rank).html,/cut-offset|engraving-shadow|feFlood/);
 const {engravingShadowOffset,paintEngravingLight,isPaleEngravingInk}=load('src/lib/passportEngraving.ts');
 assert.equal(isPaleEngravingInk('#f8fbff'),true);assert.equal(isPaleEngravingInk('#fff'),true);
 assert.equal(isPaleEngravingInk('#1b160c'),false);assert.equal(isPaleEngravingInk('bad'),false);
 const shadow={},light={};const node=o=>({setAttribute:(k,v)=>o[k]=v});
 const face={querySelectorAll:s=>s.includes('shadow')?[node(shadow)]:[node(light)]};
 for(const pose of [{x:0,y:0},{x:1,y:1},{x:-1,y:-1},{x:NaN,y:Infinity}]){
  const offset=engravingShadowOffset(pose);assert.ok(Number.isFinite(offset.dx)&&Number.isFinite(offset.dy));
  assert.ok(Math.hypot(offset.dx,offset.dy)<=2.4);
  paintEngravingLight(face,pose);assert.equal(shadow.dx,offset.dx.toFixed(3));assert.equal(shadow.dy,offset.dy.toFixed(3));
 }
 assert.ok(engravingShadowOffset({x:0,y:0}).dx>0,'Upper-left incident light shadows the inner upper-left wall');
 assert.ok(engravingShadowOffset({x:1,y:1}).dx<0,'Inner shadow reverses with the light');
});

test('Moving glyph-light attributes are frozen with privacy before export awaits fonts',async()=>{
 const {downloadHoloPassportPng}=load('src/lib/passportHoloExport.ts');
 const names=['document','Image','XMLSerializer'];const original=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 let current={mode:'private',azimuth:'125.000'},frozen,release;
 globalThis.document={fonts:{ready:new Promise(r=>{release=r;})}};
 globalThis.Image=class{set src(value){queueMicrotask(()=>this.onerror());}};
 globalThis.XMLSerializer=class{serializeToString(clone){frozen={...clone.state};return '<svg/>';}};
 try{
  const artwork={cloneNode:()=>({state:{...current},setAttribute(){}})};
  const promise=downloadHoloPassportPng({querySelector:()=>artwork},{id:'card',width:1672,height:941},'sample.png','Sample');
  current={mode:'flex',azimuth:'250.000'};release();await assert.rejects(promise,/could not be rendered/);
  assert.deepEqual(frozen,{mode:'private',azimuth:'125.000'});
 }finally{for(const n of names){if(original[n])Object.defineProperty(globalThis,n,original[n]);else delete globalThis[n];}}
});
