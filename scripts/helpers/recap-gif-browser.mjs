import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import gifenc from 'gifenc';
import gifuct from 'gifuct-js';
const { GIFEncoder } = gifenc, { parseGIF, decompressFrames } = gifuct;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function fixture() {
  const gif = GIFEncoder(), w = 320, h = 240;
  for (let frame = 0; frame < 6; frame++) {
    const pixels = new Uint8Array(w * h);
    for (let y=0;y<h;y++)for(let x=0;x<w;x++)pixels[y*w+x] = frame % 2 ? (x<160 ? 2 : 3) : (x<160 ? 0 : 1);
    gif.writeFrame(pixels,w,h,{palette:[[32,72,120],[80,170,195],[115,56,135],[210,115,60]],delay:200,dispose:1});
  }
  gif.finish();return gif.bytes();
}
export async function exerciseRecapGif({send,evaluate,wait,click,ready,capture,url,downloads,output}) {
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url});
  await wait(`Boolean(document.querySelector('.recap-open'))`);
  await click('button','Share recap');await ready();
  assert.match(await evaluate(`document.querySelector('.recap-file').accept`),/image\/gif/,'The actual upload control accepts GIF');
  const source=fixture();await writeFile(join(output,'synthetic-background.gif'),source);
  const upload = async (bytes=source,type='image/gif') => evaluate(`(()=>{const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob(${JSON.stringify(Buffer.from(bytes).toString('base64'))}),c=>c.charCodeAt(0))],'background.gif',{type:${JSON.stringify(type)}}));const input=document.querySelector('.recap-file');input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await upload();await ready();
  await wait(`Boolean(document.querySelector('[data-recap-foreground]')?.complete && document.querySelector('[data-recap-background]')?.naturalWidth===320)`);
  assert.equal(await evaluate(`document.querySelector('.recap-backgrounds [aria-pressed=true]').textContent`),'Your GIF');
  assert.equal(await evaluate(`document.querySelector('[data-recap-gif-download]').disabled`),false);
  const initialForeground=await evaluate(`document.querySelector('[data-recap-foreground]').src`);
  const start=await evaluate(`(()=>{const b=document.querySelector('.recap-editor').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/4}})()`);
  const before=await evaluate(`document.querySelector('[data-recap-background]').style.left`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+60,y:start.y,button:'left',buttons:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x+60,y:start.y,button:'left',clickCount:1});await ready();
  assert.notEqual(await evaluate(`document.querySelector('[data-recap-background]').style.left`),before,'Actual pointer drag moves the crop');
  assert.equal(await evaluate(`document.querySelector('[data-recap-foreground]').src`),initialForeground,'Dragging never redraws or moves the overlay');
  const zoom = async value => { await evaluate(`(()=>{const input=document.querySelector('#recap-zoom');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'${value}');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);await ready(); };
  await zoom(2);assert.equal(await evaluate(`document.querySelector('#recap-zoom').value`),'2');
  await capture('gif-desktop-positioned');
  await click('dialog button','Reset');await ready();await click('dialog button','Reset');await ready();
  assert.equal(await evaluate(`document.querySelector('#recap-zoom').value`),'1','Repeated reset keeps export ready');
  await click('dialog button','Pause');const pausedSource=await evaluate(`document.querySelector('[data-recap-background]').src`);
  assert.equal(pausedSource,await evaluate(`document.querySelector('.recap-swatch img[src^="blob:"]').src`),'Pause uses deterministic first frame');
  await click('dialog button','Play');assert.notEqual(await evaluate(`document.querySelector('[data-recap-background]').src`),pausedSource);
  // The live layered crop must match the still artifact exactly (apart from alpha rounding).
  await click('dialog button','Pause');await zoom(1.7);
  await evaluate(`document.querySelector('.recap-editor').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',windowsVirtualKeyCode:37});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',windowsVirtualKeyCode:37});await ready();
  const cropMatch=await evaluate(`(async()=>{const bg=document.querySelector('[data-recap-background]'),fg=document.querySelector('[data-recap-foreground]'),png=document.querySelector('[data-recap-preview]');await Promise.all([bg.decode(),fg.decode(),png.decode()]);const c=document.createElement('canvas');c.width=1080;c.height=png.naturalHeight;const x=c.getContext('2d');x.fillStyle='#080d12';x.fillRect(0,0,c.width,c.height);const s=bg.style;x.drawImage(bg,parseFloat(s.left)*c.width/100,parseFloat(s.top)*c.height/100,parseFloat(s.width)*c.width/100,parseFloat(s.height)*c.height/100);x.drawImage(fg,0,0);const a=x.getImageData(0,0,c.width,c.height).data;x.clearRect(0,0,c.width,c.height);x.drawImage(png,0,0);const b=x.getImageData(0,0,c.width,c.height).data;let bad=0;for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>3)bad++;return bad/a.length})()`);
  assert(cropMatch<.001,'Preview and PNG use identical crop and stationary overlay');
  await click('dialog button','Play');
  const resultFiles=[];
  for(const [format,height] of [['Story',1920],['Feed',1350],['Square',1080]]) {
    await click('dialog button',format);await ready();
    await click('[data-recap-gif-download]');
    const path=join(downloads,`cova-daily-2026-09-18-${format.toLowerCase()}.gif`);
    let bytes;for(let i=0;i<300;i++){try{bytes=await readFile(path);break;}catch{}await sleep(100);}
    assert(bytes,`${format} GIF actually downloaded`);
    const parsed=parseGIF(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),frames=decompressFrames(parsed,true);
    assert.deepEqual([parsed.lsd.width,parsed.lsd.height,frames.length],[1080,height,6]);
    assert(frames.every(f=>f.delay===200),'Timing retained');
    const pixel = (f,x,y)=>[...f.patch.slice((y*1080+x)*4,(y*1080+x)*4+3)];
    assert.notDeepEqual(pixel(frames[0],540,210),pixel(frames[1],540,210),'Actual exported GIF has moving background frames');
    // Below the fully opaque fade, every frame must keep recap text and branding stationary.
    const bottom=Math.round(height*.88)*1080*4;
    const mismatch=frames[0].patch.slice(bottom).reduce((n,value,i)=>n+(Math.abs(value-frames[1].patch[bottom+i])>20?1:0),0);
    assert(mismatch/frames[0].patch.slice(bottom).length<.01,'No animated text or moving stats');
    const saved=join(output,`verified-${format.toLowerCase()}.gif`);await writeFile(saved,bytes);
    resultFiles.push({format,path:saved,frames:frames.length,width:1080,height,bytes:bytes.length});
    if(format==='Square') await writeFile(join(output,'verified-square.gif'),bytes);
    await ready();
  }
  await click('[data-recap-download]');
  const png=join(downloads,'cova-daily-2026-09-18-square.png');
  for(let i=0;i<100;i++){try{await readFile(png);break;}catch{}await sleep(50);}
  const pngBytes=await readFile(png);assert.deepEqual([pngBytes.readUInt32BE(16),pngBytes.readUInt32BE(20)],[1080,1080]);

  for(const name of await readdir(downloads))if(name.endsWith('.gif'))await rm(join(downloads,name));
  // Transparency and disposal 2/3 must not smear earlier frames over later ones.
  const disposal=GIFEncoder(),palette=[[20,50,120],[220,30,30],[20,200,60],[230,190,40],[0,0,0]];
  for(let n=0;n<4;n++){
    const p=new Uint8Array(320*320);p.fill(n?4:0);
    if(n)for(let y=50;y<90;y++)for(let x=({1:140,2:40,3:240})[n];x<({1:140,2:40,3:240})[n]+40;x++)p[y*320+x]=n;
    disposal.writeFrame(p,320,320,{palette,transparent:n>0,transparentIndex:4,delay:200,dispose:n===1?3:n===2?2:1});
  }
  disposal.finish();await upload(disposal.bytes());await ready();await click('dialog button','Square');await ready();
  const beforeDisposal=new Set(await readdir(downloads));await click('[data-recap-gif-download]');
  let disposalFile;for(let i=0;i<150;i++){disposalFile=(await readdir(downloads)).find(n=>n.endsWith('.gif')&&!beforeDisposal.has(n));if(disposalFile)break;await sleep(100);}
  assert(disposalFile,'Disposal fixture exported');
  const db=await readFile(join(downloads,disposalFile)),df=decompressFrames(parseGIF(db.buffer.slice(db.byteOffset,db.byteOffset+db.byteLength)),true);
  const probe=n=>[...df[n].patch.slice((203*1080+506)*4,(203*1080+506)*4+3)];
  const [blue,red,restored,cleared]=[0,1,2,3].map(probe);
  assert(blue[2]>blue[0]+30 && red[0]>red[2]+80,'Transparent patch composites over the prior background');
  assert(restored.every((v,i)=>Math.abs(v-blue[i])<12),'Disposal 3 restores the previous canvas');
  assert(cleared.every((v,i)=>Math.abs(v-[8,13,18][i])<8),'Disposal 2 clears before the next frame');
  await rm(join(downloads,disposalFile));await upload();await ready();
  // A changed crop cancels the old export, as does explicitly cancelling.
  const filesBefore=(await readdir(downloads)).filter(n=>n.endsWith('.gif')).length;
  await click('[data-recap-gif-download]');await click('dialog button','Cancel export');
  await wait(`!document.querySelector('[data-recap-gif-download]').disabled`);
  await click('[data-recap-gif-download]');await click('dialog button','London');await ready();
  await sleep(500);assert.equal((await readdir(downloads)).filter(n=>n.endsWith('.gif')).length,filesBefore,'Cancelled/stale exports never download');
  assert.equal(await evaluate(`Boolean(document.querySelector('[data-recap-gif-download]'))`),false);
  await click('dialog button','Your GIF');await ready();
  // Mobile touch and keyboard navigation manipulate only background geometry.
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`document.querySelector('.recap-editor').scrollIntoView({block:'center'})`);await sleep(80);
  const phone=await evaluate(`(()=>{const b=document.querySelector('.recap-editor').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/3}})()`);
  const left=await evaluate(`document.querySelector('[data-recap-background]').style.left`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...phone,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:phone.x-45,y:phone.y,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await ready();
  assert.notEqual(await evaluate(`document.querySelector('[data-recap-background]').style.left`),left,'Touch drag works');
  await evaluate(`document.querySelector('.recap-editor').focus()`);
  const keyboardBefore=await evaluate(`document.querySelector('[data-recap-background]').style.left`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',windowsVirtualKeyCode:39});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',windowsVirtualKeyCode:39});await ready();
  assert.notEqual(await evaluate(`document.querySelector('[data-recap-background]').style.left`),keyboardBefore,'Arrow keys work');
  await capture('gif-phone-positioned');
  await evaluate(`document.querySelector('#recap-zoom').scrollIntoView({block:'center'})`);await capture('gif-phone-controls');
  assert.deepEqual(await evaluate('[innerWidth,document.documentElement.clientWidth,Math.round(visualViewport.width)]'),[390,390,390]);
  await upload(new Uint8Array([1,2,3]));await wait(`document.querySelector('[role=alert]')?.textContent.includes('valid GIF')`);await ready();
  assert.equal(await evaluate(`document.querySelector('.recap-backgrounds [aria-pressed=true]').textContent`),'Your GIF','Bad file preserves previous accepted background');
  const tooLarge=new Uint8Array(8*1024*1024+1);await upload(tooLarge);await wait(`document.querySelector('[role=alert]')?.textContent.includes('8 MB')`);await ready();
  // No cross-owner background state or late worker may survive composer unmount.
  await click('[data-recap-gif-download]');await evaluate(`window.__owner('owner-b')`);await wait(`!document.querySelector('dialog[open]')`);await sleep(500);
  assert.equal((await readdir(downloads)).filter(n=>n.endsWith('.gif')).length,filesBefore);
  await click('button','Share recap');assert.equal(await evaluate(`Boolean(document.querySelector('[data-recap-background]'))`),false);
  await click('[aria-label="Close recap"]');
  await writeFile(join(output,'gif-receipt.json'),JSON.stringify({synthetic:true,resultFiles,desktop:true,mobileTouch:true,keyboard:true,cancellation:true},null,2));
}
