import assert from 'node:assert/strict';
import { createOpticsHarness } from './helpers/passport-optics-harness.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const cache = new Map();
function load(path) {
  path = resolve(root, path);
  assert.ok(existsSync(path), 'The approved holo Passport needs a real data-bound component');
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} }; cache.set(path, module);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX} }).outputText;
  const localRequire = name => {
    if (!name.startsWith('.')) return require(name);
    if (name.endsWith('.css')) return {};
    if (/\.(webp|woff2|ttf)\?inline$/.test(name)) { const mime=name.includes('.webp')?'image/webp':name.includes('.woff2')?'font/woff2':'font/ttf'; return { default: `data:${mime};base64,`+readFileSync(resolve(dirname(path),name.replace('?inline',''))).toString('base64') }; }
    const candidate = resolve(dirname(path), name);
    return load([candidate, candidate+'.ts', candidate+'.tsx'].find(existsSync));
  };
  new Function('module','exports','require',code)(module,module.exports,localRequire);
  return module.exports;
}

test('Family material profiles enumerate seven ranks and four independent finishes without changing rank data', async () => {
  const { materialRanks, materialFinishes, getMaterialSpec, loadPassportAppearance } = load('src/lib/passportMaterials.ts');
  assert.deepEqual(materialRanks, ['Unranked','Bronze','Silver','Gold','Platinum','Diamond','Market Maker']);
  assert.deepEqual(materialFinishes, ['standard','90','180','365']);
  const ids = new Set();
  for (const rank of materialRanks) for (const finish of materialFinishes) {
    const spec = getMaterialSpec(rank, finish); ids.add(spec.id);
    assert.equal(spec.rank, rank); assert.equal(spec.finish, finish);
    assert.ok(Number.isFinite(spec.film) && Number.isFinite(spec.refraction) && Number.isFinite(spec.gloss));
    const appearance = await loadPassportAppearance(rank, finish);
    assert.match(appearance.materialUrl, /^data:image\/webp;base64,/);
  }
  assert.equal(ids.size, 28);
  const gold = await loadPassportAppearance('Gold','standard');
  const pearl = 'data:image/webp;base64,' + readFileSync(resolve(root,'src/assets/passport-pearl-material.webp')).toString('base64');
  assert.notEqual(gold.materialUrl, pearl, 'Family Gold uses real gold, not the protected pearl plate');
  assert.deepEqual(getMaterialSpec('Gold','standard').tone, [1,0.76,0.34,1]);
  assert.deepEqual(getMaterialSpec('Bronze','standard').tone, [0.84,0.54,0.28,1]);
  assert.deepEqual(getMaterialSpec('Market Maker','365').tone, [1,0.16,0.22,1]);
  assert.equal(getMaterialSpec('Market Maker','standard').ink, '#f8fbff');
  assert.equal(getMaterialSpec('Diamond','standard').tone[3], 0, 'Diamond keeps the original spectral response');
  assert.equal(getMaterialSpec('Gold','365').rank, 'Gold', 'Tenure finish never upgrades rank');
  assert.equal(getMaterialSpec('forged','bad').id, 'Gold-standard');
});

test('Neutral ranks use ceramic, steel and ice profiles instead of spectral pearl', () => {
  const { getMaterialSpec } = load('src/lib/passportMaterials.ts');
  const ceramic = getMaterialSpec('Unranked','standard');
  const steel = getMaterialSpec('Silver','standard');
  const ice = getMaterialSpec('Platinum','standard');
  assert.equal(ceramic.ink, '#f8fbff', 'Slate ceramic needs light live text');
  assert.deepEqual(ceramic.tone, [0.68,0.8,1,1]);
  assert.deepEqual(steel.tone, [1,1,1,1], 'Steel must never acquire rainbow hues');
  assert.deepEqual(ice.tone, [0.68,0.86,1,1]);
  assert.ok(ceramic.light[1] < steel.light[1] && steel.light[1] < ice.light[1], 'Diffuse ceramic, broad steel and sharp platinum have distinct highlight amplitudes');
  assert.ok(ceramic.light[0] < steel.light[0] && steel.light[0] < ice.light[0], 'The reflection tightens from ceramic to mirror');
  assert.ok(ceramic.light[2] < 0.01 && ceramic.refraction < 0.1, 'Matte ceramic cannot show a mirror flash');
  for (const rank of ['Bronze','Gold','Diamond','Market Maker']) assert.deepEqual(getMaterialSpec(rank,'standard').light, [10,0.14,0.14,0.22], rank+' light remains unchanged');
  for (const rank of ['Unranked','Silver','Platinum']) {
    const standard = getMaterialSpec(rank,'standard');
    for (const finish of ['90','180','365']) {
      const spec = getMaterialSpec(rank,finish);
      assert.equal(spec.rank,rank); assert.deepEqual(spec.tone,standard.tone); assert.deepEqual(spec.light,standard.light);
    }
  }
});

test('Neutral material light reaches GPU restoration and preserves privacy in the static fallback', async () => {
  const { mountPassportOptics } = load('src/lib/passportOptics.ts');
  const { loadPassportAppearance } = load('src/lib/passportMaterials.ts');
  const { PassportHoloCard } = load('src/components/PassportHoloCard.tsx');
  const { buildHoloPassportModel } = load('src/lib/passportHolo.ts');
  const { analyze, sampleTrades, defaultRules } = load('src/lib/risk.ts');
  for (const rank of ['Unranked','Silver','Platinum']) {
    const appearance = await loadPassportAppearance(rank,'365');
    const h = createOpticsHarness((face,canvas,url) => mountPassportOptics(face,canvas,url,appearance));
    try {
      h.settle(); assert.deepEqual(h.uniforms.u_light,appearance.light,rank+' must upload its physical light profile');
      h.loseRestore(); h.settle();
      assert.deepEqual(h.uniforms.u_light,appearance.light); assert.deepEqual(h.uniforms.u_tone,appearance.tone);
    } finally { h.close(); }
    for (const mode of ['flex','discipline','private','coach']) {
      const model=buildHoloPassportModel(analyze(sampleTrades,defaultRules),rank,mode,true);
      const html=renderToStaticMarkup(React.createElement(PassportHoloCard,{model,appearance}));
      assert.ok(html.includes(appearance.materialUrl)); assert.ok(html.includes(`fill="${appearance.ink}"`));
      assert.doesNotMatch(html,/data-finish-pattern/); assert.ok(html.includes('SAMPLE'));
      if(mode!=='flex')assert.doesNotMatch(html,/\+\$1,008|Reported P&amp;L/);
      if(mode==='private')assert.doesNotMatch(html,/Trader 6714|NQ \/ ES/);
    }
  }
  const plain=createOpticsHarness(mountPassportOptics);
  try { plain.settle(); assert.deepEqual(plain.uniforms.u_light,[10,0.14,0.14,0.22]); } finally { plain.close(); }
  const shader=readFileSync(resolve(root,'src/lib/passportOpticsShader.ts'),'utf8');
  assert.match(shader,/uniform vec4 u_light/);
  assert.match(shader,/sweep \* u_light\.y \+ specular \* u_light\.z \+ fresnel \* u_light\.w/);
});

test('Subscription finishes leave the stationary SVG and reduced-motion export completely clean', async () => {
  const { PassportHoloCard }=load('src/components/PassportHoloCard.tsx');
  const { materialRanks, loadPassportAppearance }=load('src/lib/passportMaterials.ts');
  const { buildHoloPassportModel }=load('src/lib/passportHolo.ts');
  const { analyze,sampleTrades,defaultRules }=load('src/lib/risk.ts');
  for(const rank of materialRanks) {
    const model=buildHoloPassportModel(analyze(sampleTrades,defaultRules),rank,'private',true);
    const standard=renderToStaticMarkup(React.createElement(PassportHoloCard,{model,appearance:await loadPassportAppearance(rank,'standard')}));
    for(const finish of ['90','180','365']) {
      const html=renderToStaticMarkup(React.createElement(PassportHoloCard,{model,appearance:await loadPassportAppearance(rank,finish)}));
      assert.equal(html.includes('data-finish-pattern'),false,'Subscription graphics cannot remain painted into the idle SVG');
      assert.equal(html.slice(html.indexOf('<svg')),standard.slice(standard.indexOf('<svg')),'Only moving GPU decoration changes by tenure');
      assert.ok(html.includes(`data-appearance="${rank}-${finish}"`),'Keep immutable appearance selection');
      assert.ok(html.includes('SAMPLE'));assert.doesNotMatch(html,/Trader 6714|NQ \/ ES|\+\$1,008/);
    }
  }
});

test('Family material selection retains the clean SVG fallback and immutable appearance ID', async () => {
  const { PassportHoloCard } = load('src/components/PassportHoloCard.tsx');
  const { loadPassportAppearance } = load('src/lib/passportMaterials.ts');
  const { buildHoloPassportModel } = load('src/lib/passportHolo.ts');
  const { analyze, sampleTrades, defaultRules } = load('src/lib/risk.ts');
  const model = buildHoloPassportModel(analyze(sampleTrades, defaultRules), 'Bronze', 'private', true);
  const appearance = await loadPassportAppearance('Bronze', '365');
  const html = renderToStaticMarkup(React.createElement(PassportHoloCard, { model, appearance }));
  assert.ok(html.includes('data-appearance="Bronze-365"'));
  assert.ok(html.includes(appearance.materialUrl));
  assert.ok(html.includes('fill="#f8fbff"'));
  assert.doesNotMatch(html,/data-finish-pattern/);
  assert.doesNotMatch(html, /Trader 6714|NQ \/ ES|\+\$1,008/);
  const plain = renderToStaticMarkup(React.createElement(PassportHoloCard, { model }));
  assert.doesNotMatch(plain, /data-finish-pattern/, 'Original pearl must not gain extra overlays');
});

test('Warm metal and ruby optics carry rank tone through GPU restore and clean SVG fallback', async () => {
  const { mountPassportOptics } = load('src/lib/passportOptics.ts');
  const { loadPassportAppearance } = load('src/lib/passportMaterials.ts');
  const { PassportHoloCard } = load('src/components/PassportHoloCard.tsx');
  const { buildHoloPassportModel } = load('src/lib/passportHolo.ts');
  const { analyze, sampleTrades, defaultRules } = load('src/lib/risk.ts');
  for (const rank of ['Bronze', 'Gold', 'Market Maker']) {
    const appearance = await loadPassportAppearance(rank, '365');
    const h = createOpticsHarness((face,canvas,url) => mountPassportOptics(face,canvas,url,appearance));
    try {
      h.settle();
      assert.deepEqual(h.uniforms.u_tone, appearance.tone, rank + ' must have rank-specific light instead of lilac highlights');
      h.loseRestore(); h.settle();
      assert.deepEqual(h.uniforms.u_tone, appearance.tone);
      assert.equal(h.invalidDeletes(), 0);
    } finally { h.close(); }
    for (const mode of ['flex','discipline','private','coach']) {
      const model = buildHoloPassportModel(analyze(sampleTrades,defaultRules),rank,mode,true);
      const html = renderToStaticMarkup(React.createElement(PassportHoloCard,{model,appearance}));
      assert.doesNotMatch(html,/data-finish-pattern/, 'Static fallback keeps the clean rank material');
      assert.ok(html.includes(rank)); assert.ok(html.includes('SAMPLE'));
      if (mode !== 'flex') assert.doesNotMatch(html,/\+\$1,008|Reported P&amp;L/);
      if (mode === 'private') assert.doesNotMatch(html,/Trader 6714|NQ \/ ES/);
    }
  }
  const plain = createOpticsHarness(mountPassportOptics);
  try { plain.settle(); assert.deepEqual(plain.uniforms.u_tone,[1,1,1,0], 'Protected pearl keeps spectral response'); } finally { plain.close(); }
  assert.match(readFileSync(resolve(root,'src/lib/passportOpticsShader.ts'),'utf8'), /mix\(spectrum, u_tone\.rgb/);
});

test('Family optics uniforms preserve default output and provide material-specific finishes', () => {
  const shader=readFileSync(resolve(root,'src/lib/passportOpticsShader.ts'),'utf8');
  const optics=readFileSync(resolve(root,'src/lib/passportOptics.ts'),'utf8');
  assert.match(shader,/uniform vec4 u_finish/);
  assert.match(optics,/gl\.uniform4f/);
  assert.match(optics,/disposed\) return/,'A late material load after unmount must be ignored');
});

test('Approved pearl holo card is real vector artwork with data-bound identity, result and provenance', () => {
  const { PassportHoloCard } = load('src/components/PassportHoloCard.tsx');
  const { buildHoloPassportModel } = load('src/lib/passportHolo.ts');
  const { analyze, sampleTrades, defaultRules } = load('src/lib/risk.ts');
  const analysis = analyze(sampleTrades, defaultRules);
  const model = buildHoloPassportModel(analysis, 'Gold', 'flex', true);
  const html = renderToStaticMarkup(React.createElement(PassportHoloCard, { model }));
  for (const value of ['passport-holo-art','Risk Passport','Trader 6714','+$1,008','4/6 rules held','1.11 profit factor','2 flags','Sample data','Not account verified']) assert.ok(html.includes(value), value);
  assert.match(html, /viewBox="0 0 1672 941"/);
  assert.doesNotMatch(html, /<img|passport-sample-watermark|passport-rank-progress/,'No pasted UI or rejected certificate layout');
  assert.equal((html.match(/<image /g)||[]).length,1,'One text-free material plate only; all content remains live vector text');
  assert.match(html,/<image [^>]*aria-hidden="true"/,'Decorative material must not duplicate accessible content');
});

test('Non-Flex modes cannot leak P&L and Ghost omits identity and markets even in accessible text', () => {
  const { PassportHoloCard } = load('src/components/PassportHoloCard.tsx');
  const { buildHoloPassportModel } = load('src/lib/passportHolo.ts');
  const { analyze, sampleTrades, defaultRules } = load('src/lib/risk.ts');
  const analysis = analyze(sampleTrades, defaultRules);
  for (const mode of ['discipline','private','coach']) {
    const model = buildHoloPassportModel(analysis,'Gold',mode,true);
    const html = renderToStaticMarkup(React.createElement(PassportHoloCard, {model}));
    assert.doesNotMatch(html,/\+\$1,008|Reported P&amp;L/,mode+' must omit P&L everywhere');
    assert.ok(html.includes('Not account verified'));
    if (mode === 'private') {
      assert.doesNotMatch(html,/Trader 6714|NQ \/ ES/,'Ghost must actually omit identity and markets');
      assert.equal(model.heroValue,'70+');
      const zero = buildHoloPassportModel({...analysis,score:0},'Bronze',mode,false);
      assert.equal(zero.heroValue,'0+');
      assert.equal(buildHoloPassportModel(analyze([],[]),'Unranked','private',false).heroValue,'0+','Preserve the existing empty-review score range behavior');
    }
    if (mode === 'coach') assert.ok(model.support.some(line=>line.includes('Top warning:')),'Coach keeps the warning field');
    if (mode === 'discipline') assert.ok(model.support.some(line=>line.includes('max drawdown')),'Discipline keeps drawdown context');
  }
  const noRules=buildHoloPassportModel(analyze(sampleTrades,[]),'Gold','flex',false);
  assert.ok(noRules.support[0].includes('Rules not checked'));
});

test('Export snapshots the requested privacy mode before asynchronous font loading', async () => {
  const { downloadHoloPassportPng } = load('src/lib/passportHoloExport.ts');
  const keys=['document','Image','XMLSerializer'];
  const originals=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let release, mode='private', serializedMode;
  const ready=new Promise(resolve=>{release=resolve;});
  const artwork={cloneNode:()=>({mode,setAttribute(){}})};
  globalThis.document={fonts:{ready}};
  globalThis.XMLSerializer=class {serializeToString(clone){serializedMode=clone.mode;return '<svg/>';}};
  globalThis.Image=class {set src(value){queueMicrotask(()=>this.onerror());}};
  try {
    const result=downloadHoloPassportPng({querySelector:()=>artwork},{id:'card',width:1672,height:941},'ghost.png','Sample');
    mode='flex'; release();
    await assert.rejects(result,/could not be rendered/);
    assert.equal(serializedMode,'private','Changing the UI while fonts load must not leak Flex data into a Ghost export');
  } finally {for(const key of keys) {if(originals[key])Object.defineProperty(globalThis,key,originals[key]);else delete globalThis[key];}}
});

test('Export freezes the live material frame before fonts or privacy mode can change', async () => {
  const { downloadHoloPassportPng }=load('src/lib/passportHoloExport.ts');
  const keys=['document','Image','XMLSerializer'];
  const originals=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let release, material='data:image/png;base64,FRAME_AT_CLICK', frozenMaterial;
  const ready=new Promise(resolve=>{release=resolve;});
  const layer={setAttribute:(name,value)=>{if(name==='href')frozenMaterial=value;}};
  const artwork={cloneNode:()=>({setAttribute(){},querySelector:()=>layer})};
  const canvas={toDataURL:()=>material};
  const node={dataset:{optics:'ready'},querySelector:selector=>selector.startsWith('svg')?artwork:canvas};
  globalThis.document={fonts:{ready}};
  globalThis.XMLSerializer=class {serializeToString(){return '<svg/>';}};
  globalThis.Image=class {set src(value){queueMicrotask(()=>this.onerror());}};
  try {
    const result=downloadHoloPassportPng(node,{id:'card',width:1672,height:941},'ghost.png','Sample');
    material='data:image/png;base64,LATER_FRAME';release();
    await assert.rejects(result,/could not be rendered/);
    assert.equal(frozenMaterial,'data:image/png;base64,FRAME_AT_CLICK');
  } finally {for(const key of keys){if(originals[key])Object.defineProperty(globalThis,key,originals[key]);else delete globalThis[key];}}
});

test('Long imported text and large monetary results receive explicit fit bounds', () => {
  const { PassportHoloCard }=load('src/components/PassportHoloCard.tsx');
  const html=renderToStaticMarkup(React.createElement(PassportHoloCard,{model:{mode:'flex',modeLabel:'Flex',identity:'Trader 6714',rank:'Gold',marketLine:'MICRO E-MINI NASDAQ-100 SEPTEMBER 2026 / MICRO E-MINI S&P 500 SEPTEMBER 2026 · 25 reviewed trades',heroValue:'+$123,456,789,012',heroLabel:'Reported P&L',support:['Top warning: '+ 'A'.repeat(140)],provenance:'User-supplied data · Not account verified',sample:false}}));
  assert.ok(/class="passport-holo-market"[^>]*textLength="760"/.test(html),"market must fit its allocated width");
  assert.ok(/class="passport-holo-hero-value"[^>]*textLength="390"/.test(html),"hero-value must fit its allocated width");
  assert.ok(/class="passport-holo-support"[^>]*textLength="780"/.test(html),"support must fit its allocated width");
  assert.match(html,/<text[^>]*>[^<]*…<\/text>/,'Long context must visibly truncate rather than collide with the result/disclosure');
});

test('Integrated review detail preserves setup context without adding it to shared artwork', () => {
  const { Passport } = load('src/components/WorkspaceSections.tsx');
  const { analyze, sampleTrades, defaultRules } = load('src/lib/risk.ts');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const mode of ['flex', 'discipline', 'private', 'coach']) {
      globalThis.localStorage = { getItem: key => key.includes('passport') ? JSON.stringify({shareModeId: mode, exportPresetId: 'card'}) : null };
      for (const empty of [false, true]) {
        const analysis = analyze(empty ? [] : sampleTrades.map(trade => ({...trade, setup: 'SETUP-CONTEXT-ONLY'})), defaultRules);
        const html = renderToStaticMarkup(React.createElement(Passport, {analysis, entitlements: {plan: 'pro', canExportPassport: true, canEditAdvancedLimits: true, insightLimit: 99}, isSampleReview: true, go() {}, upgradeToPro() {}}));
        const detail = html.match(/<details class="passport-review-detail[^\"]*">[\s\S]*?<\/details>/)?.[0] ?? '';
        assert.ok(html.includes('passport-workspace-placeholder'), 'An unresolved rank material must not render a stale card');
        assert.ok(detail.includes(mode === 'private' ? 'Markets and setups hidden in Ghost view.' : empty ? 'No setup reviewed' : 'SETUP-CONTEXT-ONLY'), mode + ' must retain setup context outside artwork, with the Ghost privacy boundary');
        const { PassportHoloCard } = load('src/components/PassportHoloCard.tsx');
        const { buildHoloPassportModel } = load('src/lib/passportHolo.ts');
        const artwork = renderToStaticMarkup(React.createElement(PassportHoloCard,{model:buildHoloPassportModel(analysis,'Gold',mode,true),engraved:true}));
        assert.doesNotMatch(artwork, /SETUP-CONTEXT-ONLY|MIXED SETUPS/, 'Setup context remains outside the shared/exported face');
      }
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('Subscription shader excludes the C and complete typography bands from its material-only motif', () => {
  const { opticsFragmentShader,finishProtectedAreas }=load('src/lib/passportOpticsShader.ts');
  assert.ok(Array.isArray(finishProtectedAreas),'Registered material protection areas are required');
  assert.deepEqual(finishProtectedAreas.map(area=>area.name),['engraved C','title','sample and mode','identity rank metrics and provenance']);
  const inside=(x,y)=>finishProtectedAreas.some(({box:[l,t,r,b]})=>x>=l&&x<=r&&y>=t&&y<=b);
  for(const point of [[930,240],[1405,570],[1170,670],[271,160],[710,250],[1400,195],[271,635],[1000,637],[1400,690],[271,802],[1408,800]])assert.ok(inside(...point),`Protected ${point}`);
  assert.equal(inside(600,420),false,'Open material must still receive the moving motif');
  assert.match(opticsFragmentShader,/float zone = finishSurface\(uv\)/);
  assert.match(opticsFragmentShader,/u_finish.w > 0.5 && u_motion > 0.0/);
  assert.match(opticsFragmentShader,/engraving \* zone \* u_motion/);
  for(const {box} of finishProtectedAreas)assert.ok(opticsFragmentShader.includes(`vec4(${box.map(n=>n.toFixed(1)).join(', ')})`),'GPU consumes the same protected geometry');
});

test('Subscription motion fades to zero at a held tilt and restarts safely after suspension', () => {
  const { mountPassportOptics }=load('src/lib/passportOptics.ts');
  const harness=createOpticsHarness((face,canvas,url)=>mountPassportOptics(face,canvas,url,{film:1,refraction:1,gloss:48,finishIndex:1}));
  try {
    assert.equal(harness.uniforms.u_motion,0,'No subscription effect at initial rest');
    harness.settle(); harness.pointer('pointerdown',1,900);harness.step();
    assert.ok(harness.uniforms.u_motion>0.1,'Actual movement reveals the finish');
    harness.settle();assert.equal(harness.uniforms.u_motion,0,'Holding a nonzero angle is not movement');
    assert.deepEqual(harness.uniforms.u_tilt,[0.8,0]);assert.equal(harness.pending(),0,'No idle RAF loop');
    for(const suspend of ['reduced','hidden','offscreen','context']) {
      harness.pointer('pointermove',1,100);harness.step();assert.ok(harness.uniforms.u_motion>0);
      if(suspend==='reduced'){harness.media.matches=true;harness.media.dispatchEvent(new Event('change'));assert.equal(harness.face.dataset.opticsMotion,'0.0000');harness.media.matches=false;harness.media.dispatchEvent(new Event('change'));}
      if(suspend==='hidden'){harness.visibility(true);assert.equal(harness.face.dataset.opticsMotion,'0.0000');harness.visibility(false);}
      if(suspend==='offscreen'){harness.intersect(false);assert.equal(harness.face.dataset.opticsMotion,'0.0000');harness.intersect(true);}
      if(suspend==='context')harness.loseRestore();
      harness.settle();assert.equal(harness.uniforms.u_motion,0);assert.equal(harness.pending(),0);
      harness.pointer('pointerdown',1,900);harness.settle();
    }
  } finally {harness.close();}
});

test('Live optics inputs are bounded and converge without an idle animation loop', () => {
  const { opticsTarget, advanceOptics, opticsTransform } = load('src/lib/passportOptics.ts');
  assert.deepEqual(opticsTarget(8, -6), {x: 1, y: -1});
  assert.deepEqual(opticsTarget(NaN, Infinity), {x: 0, y: 0});
  let pose = {x: 0, y: 0};
  for (let i=0;i<120;i++) pose = advanceOptics(pose, {x: 1, y: -1}, 16);
  assert.deepEqual(pose, {x: 1, y: -1});
  assert.match(opticsTransform(pose), /rotateX\(6deg\) rotateY\(8deg\)/);
  assert.equal(opticsTransform({x:0,y:0}), 'none');
});

test('Live optics keeps a selectable SVG fallback and is decorative only', () => {
  const { PassportHoloCard }=load('src/components/PassportHoloCard.tsx');
  const { buildHoloPassportModel }=load('src/lib/passportHolo.ts');
  const { analyze,sampleTrades,defaultRules }=load('src/lib/risk.ts');
  const html=renderToStaticMarkup(React.createElement(PassportHoloCard,{model:buildHoloPassportModel(analyze(sampleTrades,defaultRules),'Gold','private',true)}));
  assert.match(html, /<canvas[^>]*class="passport-optics-canvas"[^>]*aria-hidden="true"/);
  assert.match(html, /tabindex="0"/,'Keyboard users can manipulate the material');
  assert.doesNotMatch(html, /Trader 6714|NQ \/ ES|\+\$1,008/);
  const source=readFileSync(resolve(root,'src/lib/passportOptics.ts'),'utf8');
  for(const contract of ['prefers-reduced-motion','visibilitychange','pointercancel','webglcontextlost','cancelAnimationFrame','deleteProgram','deleteTexture','ResizeObserver']) assert.ok(source.includes(contract), contract);
});

test('Tilt isolates the physical card from the photographed studio rectangle', () => {
  const { PassportHoloCard }=load('src/components/PassportHoloCard.tsx');
  const { buildHoloPassportModel }=load('src/lib/passportHolo.ts');
  const { analyze,sampleTrades,defaultRules }=load('src/lib/risk.ts');
  const html=renderToStaticMarkup(React.createElement(PassportHoloCard,{model:buildHoloPassportModel(analyze(sampleTrades,defaultRules),'Gold','flex',true)}));
  assert.ok(html.includes('clipPathUnits="objectBoundingBox"'),'The actual silhouette must mask the studio rectangle');
  assert.ok(/<image [^>]*clip-path="url\(#/.test(html),'SVG export must preserve the same physical-card mask');
  assert.ok(/<canvas[^>]*clip-path:url\(#/.test(html),'The live GPU material must use the same mask');
});

test('An offscreen resize never advertises a cleared canvas as export-ready', () => {
  const { mountPassportOptics }=load('src/lib/passportOptics.ts');
  const h=createOpticsHarness(mountPassportOptics);
  try {
    h.settle(); assert.equal(h.face.dataset.optics,'ready'); assert.ok(h.painted());
    h.intersect(false); h.resize(750);
    assert.ok(h.face.dataset.optics!=='ready' || h.painted(),'A cleared hidden canvas must not replace the export fallback');
    h.intersect(true);h.settle();assert.equal(h.face.dataset.optics,'ready');assert.ok(h.painted());
  } finally {h.close();}
});

test('Ending a secondary touch cannot cancel the primary optics drag', () => {
  const { mountPassportOptics }=load('src/lib/passportOptics.ts');
  const h=createOpticsHarness(mountPassportOptics);
  try {
    h.settle();h.pointer('pointerdown',1,800);h.settle();
    h.pointer('pointerdown',2,700,false);h.pointer('pointerup',2,700,false);
    h.pointer('pointermove',1,900);h.settle();assert.equal(h.face.dataset.opticsX,'0.8000');
    h.pointer('pointercancel',1,900);h.settle();assert.equal(h.face.style.transform,'none');
  } finally {h.close();}
});

test('Restoring a lost GPU context never deletes invalid old-generation objects', () => {
  const { mountPassportOptics }=load('src/lib/passportOptics.ts');
  const h=createOpticsHarness(mountPassportOptics);
  try {
    h.settle();h.loseRestore();h.settle();
    assert.equal(h.face.dataset.optics,'ready');
    assert.equal(h.invalidDeletes(),0,'Lost-context objects are invalidated by the browser, not deleted on the restored context');
  } finally {h.close();}
});

test('Real Passport mounts the holo face, preserves review detail and offers an exact landscape export', () => {
  const workspace = readFileSync(resolve(root,'src/components/WorkspaceSections.tsx'),'utf8');
  assert.match(workspace, /<PassportHoloCard/,'Mount the approved real card in the existing protected route');
  assert.match(workspace, /id: "card"[\s\S]*?width: 1672, height: 941/,'Offer the reference-sized scene as an actual export');
  assert.match(workspace, /<PassportShareComposer face=\{faceRef\}/,'Share the actual face through the approved prepared square composer');
  assert.match(workspace, /passport-review-detail/,'Move secondary proof outside the sparse card, do not silently remove it');
});
