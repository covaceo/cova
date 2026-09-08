import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createOpticsHarness } from './helpers/passport-optics-harness.mjs';

function load(name) {
  const source = readFileSync(new URL('../src/lib/' + name + '.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', code)(module, module.exports, value => load(value.replace('./', '')));
  return module.exports;
}
const { mountPassportOptics } = load('passportOptics');

test('workspace rasterizes the whole tilted face at native density, not just its canvas', () => {
  const h = createOpticsHarness((face, canvas, url) => {
    window.devicePixelRatio = 3;
    face.clientWidth = 350;
    face.parentElement.clientWidth = 350;
    face.parentElement.matches = selector => selector === '.passport-workspace-stage';
    face.parentElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 350, height: 350 * 941 / 1672 });
    return mountPassportOptics(face, canvas, url, { film: 1, refraction: 1, gloss: 48, finishIndex: 0, engraved: true });
  });
  try {
    h.settle();
    assert.equal(h.face.style.width, '1050px');
    assert.equal(h.canvas.width, 1050, 'do not allocate density twice');
    assert.equal(h.face.style.transformOrigin, '0 0');
    assert.equal(h.face.style.transform, 'scale(0.3333333333333333)');
    h.pointer('pointerdown', 1, 280); h.settle();
    assert.match(h.face.style.transform, /scale\(0\.3333333333333333\) perspective\(5400px\)/);
    assert.match(h.face.style.transform, /translate\(-50%, -50%\)$/);
    assert.equal(Number(h.face.dataset.opticsX), 0.6, 'input uses displayed stage, not enlarged face');
    h.visibility(true);
    assert.equal(h.face.style.transform, 'scale(0.3333333333333333)', 'hidden reset must not enlarge the card');
    h.visibility(false); h.settle();
    h.media.matches = true; h.media.dispatchEvent(new Event('change'));
    assert.equal(h.face.style.width, '');
    assert.equal(h.face.style.transform, 'none');
    h.resize(350); // Resetting the inline width itself triggers ResizeObserver.
    assert.equal(h.face.style.width, '', 'reduced-motion fallback must stay at display size');
    h.media.matches = false; h.media.dispatchEvent(new Event('change')); h.settle();
    assert.equal(h.face.style.width, '1050px');
    window.devicePixelRatio = 2; window.dispatchEvent(new Event('resize')); h.settle();
    assert.equal(h.face.style.width, '700px');
    assert.equal(h.canvas.width, 700);
    h.loseRestore(); h.settle();
    assert.equal(h.face.style.width, '700px');
    assert.equal(h.face.style.transform, 'scale(0.5)');
  } finally { h.close(); }
  assert.equal(h.face.style.width, '', 'cleanup restores the unscaled SVG fallback');
});

test('etched artwork keeps registered texture coordinates throughout tilt and context restoration', () => {
  const settings = { film: 0.55, refraction: 0.8, gloss: 64, finishIndex: 0, engraved: true };
  const h = createOpticsHarness((face, canvas, url) => mountPassportOptics(face, canvas, url, settings));
  try {
    h.settle();
    assert.deepEqual(h.uniforms.u_finish, [0.55, 0, 64, 0], 'Opaque engraving must not undergo glass refraction');
    h.pointer('pointerdown', 1, 900);
    h.step();
    assert.notDeepEqual(h.uniforms.u_tilt, [0, 0], 'The actual tilt/light response remains enabled');
    assert.equal(h.uniforms.u_finish[1], 0);
    h.settle(); assert.equal(h.pending(), 0);
    h.loseRestore(); h.settle();
    assert.deepEqual(h.uniforms.u_finish, [0.55, 0, 64, 0]);
    assert.equal(h.invalidDeletes(), 0);
  } finally { h.close(); }
});

test('workspace shadow is applied after tilt, never filtering the rotating text layer', () => {
  const css = readFileSync(new URL('../src/styles/passportHolo.css', import.meta.url), 'utf8');
  assert.match(css, /\.passport-workspace-stage:has\(> \.passport-holo-face\)\s*\{[^}]*filter:drop-shadow\(0 15px 12px rgba\(39,49,60,\.22\)\);[^}]*\}/);
  assert.match(css, /\.passport-workspace \.passport-workspace-stage > \.passport-card-face\.passport-holo-face\s*\{[^}]*position:absolute;[^}]*filter:none;[^}]*\}/);
});

test('legacy glass refraction and earned finish lighting remain unchanged', () => {
  for (const engraved of [false, true]) {
    const h = createOpticsHarness((face, canvas, url) => mountPassportOptics(face, canvas, url,
      { film: 0.7, refraction: 0.8, gloss: 48, finishIndex: 3, engraved }));
    try {
      h.settle();
      assert.deepEqual(h.uniforms.u_finish, [0.7, engraved ? 0 : 0.8, 48, 3]);
      h.pointer('pointerdown', 1, 900); h.step();
      assert.ok(h.uniforms.u_motion > 0, 'Earned motion-only finishing remains active');
      h.settle(); assert.equal(h.uniforms.u_motion, 0); assert.equal(h.pending(), 0);
    } finally { h.close(); }
  }
});

test('display-density changes resize an existing card without a layout-width change', () => {
  const h = createOpticsHarness(mountPassportOptics);
  try {
    h.settle();
    window.devicePixelRatio = 2;
    window.dispatchEvent(new Event('resize'));
    assert.equal(h.canvas.width, 2000, 'Browser zoom/display changes cannot leave a stale low-density buffer');
    h.settle();
    assert.equal(h.pending(), 0);
    h.loseRestore(); h.settle();
    assert.equal(h.canvas.width, 2000);
    assert.equal(h.invalidDeletes(), 0);
  } finally { h.close(); }
});

for (const [cssWidth, dpr, gpuLimit, expected] of [[390,3,4096,1170],[840,2,1024,1024],[1440,4,8192,3344],[840,1,4096,840]]) {
  test(`material allocation is bounded at ${cssWidth}px, DPR${dpr}, GPU${gpuLimit}`, () => {
    const h = createOpticsHarness((face, canvas, url) => {
      face.clientWidth = cssWidth; window.devicePixelRatio = dpr;
      canvas.getContext().getParameter = () => gpuLimit;
      return mountPassportOptics(face, canvas, url);
    });
    try {
      h.settle(); assert.equal(h.canvas.width, expected);
      assert.equal(h.canvas.height, Math.round(expected * 941 / 1672));
      h.media.matches = true; h.media.dispatchEvent(new Event('change'));
      assert.equal(h.face.dataset.optics, 'reduced-motion'); assert.equal(h.pending(), 0);
      h.media.matches = false; h.media.dispatchEvent(new Event('change')); h.settle();
      assert.equal(h.face.dataset.optics, 'ready'); assert.equal(h.canvas.width, expected);
    } finally { h.close(); }
  });
}

test('retina Passport material is not downsampled below its displayed pixel dimensions', () => {
  const h = createOpticsHarness((face, canvas, url) => {
    face.clientWidth = 840;
    window.devicePixelRatio = 2;
    return mountPassportOptics(face, canvas, url);
  });
  try {
    h.settle();
    assert.equal(h.canvas.width, 1680, '840 CSS pixels at DPR2 need a 1680px backing buffer, not the old 1260px');
    assert.equal(h.canvas.height, Math.round(1680 * 941 / 1672));
    assert.equal(h.face.dataset.optics, 'ready');
    assert.equal(h.pending(), 0, 'Sharper material does not create an idle GPU loop');
  } finally { h.close(); }
});
