import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import load from './helpers/load-ts.cjs';
const {recapBackgrounds,recapFormats}=load('src/lib/sessionRecapImage.ts');
const approved=[
 {id:'blue-tower',label:'Blue Tower',sha256:'a4e83b283b8b2d176de470d88d4e29ed3793a4d1aa5303faa524ce18c206046c'},
 {id:'cloud-towers',label:'Cloud Towers',sha256:'cf90454395ed7138b98e5ad562bec7408fde9824a2a744014d3c56bbf40b4c60'},
];
test('city backgrounds retain the exact approved PNG bytes and source dimensions',()=>{
 for(const asset of approved){
  const entry=recapBackgrounds.find(b=>b.id===asset.id);assert.equal(entry?.label,asset.label);assert.equal(entry?.src,`/recaps/${asset.id}.png`);
  const bytes=readFileSync('public'+entry.src);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[941,1672]);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,'Do not resize or lossily recompress approved assets');
 }
});
test('two extra city options preserve every existing preset and export size',()=>{
 assert.equal(new Set(recapBackgrounds.map(b=>b.id)).size,recapBackgrounds.length);
 assert.deepEqual(recapBackgrounds.filter(b=>!approved.some(a=>a.id===b.id)),[
  {id:'new-york',label:'New York',src:'/recaps/new-york.webp'},
  {id:'london',label:'London',src:'/recaps/london.webp'},
  {id:'asia',label:'Asia',src:'/recaps/asia.webp'},
  {id:'plain',label:'Plain',src:''},
 ]);
 assert.deepEqual(recapFormats.map(({id,width,height})=>({id,width,height})),[{id:'wide',width:2160,height:1160},{id:'story',width:1080,height:1920},{id:'feed',width:1080,height:1350},{id:'square',width:1080,height:1080}]);
});
