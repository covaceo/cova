import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
const image = { ...load('src/lib/sessionRecapImage.ts'), ...load('src/lib/recapGifData.ts') };
test('background crop can zoom and pan without moving the recap overlay or revealing empty edges', () => {
  assert.equal(typeof image.recapBackgroundRect, 'function', 'A shared preview/export crop transform is available');
  const center = image.recapBackgroundRect(640, 480, 1080, 1920, { zoom: 1, x: 0, y: 0 });
  assert.deepEqual(center, { x: -740, y: 0, width: 2560, height: 1920 });
  assert.deepEqual(image.recapBackgroundRect(640, 480, 1080, 1920, { zoom: 2, x: 1, y: -1 }), { x: 0, y: -1920, width: 5120, height: 3840 });
  for (const [w,h] of [[1080,1920],[1080,1350],[1080,1080]]) {
    const r = image.recapBackgroundRect(640, 480, w, h, { zoom: 99, x: 99, y: -99 });
    assert(r.x <= 0 && r.y <= 0 && r.x + r.width >= w && r.y + r.height >= h);
    assert(r.width <= Math.max(w/640,h/480)*640*3);
  }
});

import gifenc from 'gifenc';
const { GIFEncoder } = gifenc;
function tinyGif() { const gif=GIFEncoder(); for(let i=0;i<2;i++)gif.writeFrame(new Uint8Array([i,0,0,i]),2,2,{palette:[[8,13,18],[100,150,200]],delay:200});gif.finish();return gif.bytes().buffer; }
test('GIF inspection accepts animation and rejects invalid or unsafe input before pixel allocation', () => {
  assert.equal(typeof image.inspectRecapGif, 'function', 'GIF validation is available');
  const valid=tinyGif(), result=image.inspectRecapGif(valid);
  assert.deepEqual([result.width,result.height,result.frames.length,result.duration],[2,2,2,400]);
  assert.throws(()=>image.inspectRecapGif(new Uint8Array([1,2,3]).buffer),/valid GIF/);
  const huge=valid.slice(0);new DataView(huge).setUint16(6,65535,true);new DataView(huge).setUint16(8,65535,true);
  assert.throws(()=>image.inspectRecapGif(huge),/smaller/);
  const truncated=valid.slice(0,25);assert.throws(()=>image.inspectRecapGif(truncated),/valid GIF/);
});

test('GIF workload bounds and delay normalization are enforced', () => {
  const make=(count,delay)=>{const g=GIFEncoder();for(let i=0;i<count;i++)g.writeFrame(new Uint8Array([0]),1,1,{palette:[[0,0,0],[255,255,255]],delay});g.finish();return g.bytes().buffer;};
  assert.equal(image.inspectRecapGif(make(2,0)).duration,200);
  assert.throws(()=>image.inspectRecapGif(make(181,20)),/shorter/);
  assert.throws(()=>image.inspectRecapGif(make(2,10000)),/15 seconds/);
  assert.deepEqual(image.recapBackgroundRect(100,100,100,100,{zoom:NaN,x:Infinity,y:-Infinity}),{x:0,y:0,width:100,height:100});
});
