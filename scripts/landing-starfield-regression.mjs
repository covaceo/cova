import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);const load=require('./helpers/load-ts.cjs');
test('star coordinates are stable, sparse and have photographic point sizes',()=>{
 const {makeStarCatalog}=load('src/components/landing/starfieldModel.ts');const stars=makeStarCatalog(220,7181);
 assert.deepEqual(stars,makeStarCatalog(220,7181));assert.notDeepEqual(stars,makeStarCatalog(220,7182));assert.equal(stars.length,220);
 for(const s of stars){assert(s.x>=0&&s.x<=1);assert(s.y>=0&&s.y<=1);assert(s.radius>=.45&&s.radius<=1.3);assert(s.alpha>=.3&&s.alpha<=.78);}
 assert(stars.filter(s=>s.radius>.9).length<50,'Only a few brighter/larger stars');assert(stars.filter(s=>s.amplitude>.2).length<90,'Most stars remain quiet');
});
test('independent slow twinkle never hard-flashes or moves a point',()=>{
 const {makeStarCatalog,starAlpha}=load('src/components/landing/starfieldModel.ts');const stars=makeStarCatalog(220,7181);
 for(const s of stars){let previous=starAlpha(s,0);for(let t=.1;t<20;t+=.1){const next=starAlpha(s,t);assert(next>=.02&&next<=.78);assert(Math.abs(next-previous)<.025,'No abrupt on/off flashing');previous=next;}}
 assert.notEqual(starAlpha(stars[0],2),starAlpha(stars[0],12));assert.notEqual(starAlpha(stars[0],2),starAlpha(stars[1],2));
});
test('a tall mobile hero still suppresses invisible star animation',()=>{
 const {heroCoversViewport}=load('src/components/landing/starfieldModel.ts');assert.equal(heroCoversViewport(0,860,568),true);assert.equal(heroCoversViewport(-200,660,568),true);assert.equal(heroCoversViewport(-400,460,568),false);assert.equal(heroCoversViewport(0,941,941),true);
});
test('canvas lifecycle includes every required motion and visibility boundary',()=>{
 const s=readFileSync('src/components/landing/LandingStarfield.tsx','utf8');for(const term of ['prefers-reduced-motion: reduce','visibilitychange','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame','clearTimeout','resize','pointerEvents'])assert(s.includes(term),term);
 assert(!s.includes('Math.random('));assert(!s.includes('setInterval('));assert(!s.includes('THREE'));
});
