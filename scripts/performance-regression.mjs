import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const read=p=>readFileSync(resolve(root,p),'utf8');

test('retired unreferenced hero/video renderers and their exclusive dependencies are removed',()=>{
 for(const name of ['HeroRiskPassportScene','HlsVideo','MarketHeroField']) assert.equal(existsSync(resolve(root,'src/components',name+'.tsx')),false,name+' is not in the active module graph');
 const {dependencies}=JSON.parse(read('package.json'));
 for(const name of ['@react-three/drei','@react-three/fiber','hls.js']) assert.equal(name in dependencies,false,name+' had no live importer');
 for(const name of ['three','three128','motion']) assert.ok(dependencies[name],name+' still powers approved effects');
});

test('public Passport plates are independent cached assets, not startup JavaScript payload',()=>{
 const html=read('dist/index.html');
 const entry=html.match(/src="([^\"]+\.js)"/)[1];
 const js=read('dist'+entry);
 const plate=readFileSync(resolve(root,'src/assets/passport-diamond-material.webp'));
 assert.equal(js.includes(plate.toString('base64').slice(0,256)),false,'Public diamond bitmap must not block parsing the entry JavaScript');
 const emitted=readdirSync(resolve(root,'dist/assets')).find(p=>/^passport-diamond-material-.*\.webp$/.test(p));
 assert.ok(emitted,'Public card uses a fingerprinted asset');
 assert.deepEqual(readFileSync(resolve(root,'dist/assets',emitted)),plate,'The approved artwork stays byte-identical');
});
test('hero uses a smaller lossless source without removing the approved fallback',()=>{
 const source=read('src/components/MarketingHero.tsx');
 assert.match(source, /<source[^>]+srcSet="\/media\/cova-orbital-hero-v1\.webp"/);
 assert.match(source, /<img[^>]+src="\/media\/cova-orbital-hero-v1\.png"[^>]+fetchpriority: "high"/);
 const optimized=readFileSync(resolve(root,'public/media/cova-orbital-hero-v1.webp'));
 const original=readFileSync(resolve(root,'public/media/cova-orbital-hero-v1.png'));
 assert.ok(optimized.length<original.length*.8,'Preserve a meaningful lossless payload saving');
});
test('protected Passport exports retain self-contained inline materials',()=>{
 assert.match(read('src/lib/passportMaterials.ts'),/passport-diamond-material\.webp\?inline/);
 assert.match(read('src/components/PassportHoloCard.tsx'),/passport-pearl-material\.webp\?inline/);
});
