import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const controls=read('src/styles/riskDeskControls.css');
const presentation=read('src/styles/riskDeskPresentation.css');
const entry=read('src/main.tsx');

test('approved desk styles are ordered last and do not depend on preview/auth state',()=>{
  assert(entry.indexOf('riskDeskPresentation.css')>entry.indexOf('dashboardRefinement.css'));
  assert(entry.indexOf('riskDeskControls.css')>entry.indexOf('riskDeskPresentation.css'));
  assert.match(controls,/html:root:has\(\.astra-dashboard\[data-dashboard-visual\]\)/);
  assert.match(presentation,/html:has\(\.astra-dashboard\)/);
  assert.doesNotMatch(controls+presentation,/data-taste-preview|data-button-preview|__qaSession|localStorage|example\.invalid/);
  assert.doesNotMatch(presentation,/Phone-only refinement/,'superseded phone-face experiment is not shipped');
});

test('computed button transitions respect motion preference and dashboard lifetime',async t=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage();
    const baseline={property:'opacity',duration:'0.4s',timing:'linear',delay:'0s',radius:'19px'};
    const normal={property:'background-color, border-color, color',duration:'0.12s, 0.12s, 0.12s',timing:'ease, ease, ease',delay:'0s, 0s, 0s',radius:'6px'};
    const reduced={property:'none',duration:'0s',timing:'ease',delay:'0s',radius:'6px'};
    for (const motion of ['no-preference','reduce']) {
      await page.emulateMedia({reducedMotion:motion});
      for (const marker of ['mounted','attribute removed','dashboard removed']) {
        await t.test(`${motion}: ${marker}`,async()=>{
          await page.setContent(`<!doctype html>
            <style>button { transition:opacity 400ms linear; border-radius:19px; }</style>
            <div class="oa-dashboard-app">
              <section class="astra-dashboard" data-dashboard-visual>
                <button id="dashboard">Dashboard</button>
              </section>
              <button id="app">App</button>
            </div>
            <dialog open><button id="portal">Portal</button></dialog>
            <div role="dialog"><button id="role-portal">Role portal</button></div>
            <div class="cova-account-menu-content"><button id="menu">Menu</button></div>
            <button id="outside">Outside scope</button>`);
          await page.addStyleTag({content:controls});
          await page.evaluate(marker=>{
            const dashboard=document.querySelector('.astra-dashboard');
            if (marker==='attribute removed') dashboard.removeAttribute('data-dashboard-visual');
            // Keep the button so its style can be checked after dashboard unmount.
            if (marker==='dashboard removed') dashboard.replaceWith(...dashboard.childNodes);
          },marker);
          const actual=await page.locator('button').evaluateAll(buttons=>Object.fromEntries(buttons.map(button=>{
            const style=getComputedStyle(button);
            return [button.id,{
              property:style.transitionProperty,duration:style.transitionDuration,
              timing:style.transitionTimingFunction,delay:style.transitionDelay,radius:style.borderRadius,
            }];
          })));
          const active=marker==='mounted' ? (motion==='reduce' ? reduced : normal) : baseline;
          assert.deepEqual(actual,{
            dashboard:active,app:active,portal:active,'role-portal':active,menu:active,outside:baseline,
          });
        });
      }
    }
  } finally {
    await browser.close();
  }
});

test('phone controls retain compact faces, full hit extensions and explicit keyboard focus',()=>{
  assert.match(controls,/min-height:36px !important; height:36px !important/);
  assert.match(controls,/inset:-5px 0/);
  assert.match(controls,/button:focus-visible/);
  assert.match(controls,/outline:2px solid var\(--btn-focus\)/);
  assert.match(controls,/prefers-reduced-motion:reduce/);
});

test('approved phone header has share beside title and two equal edge-aligned actions',()=>{
  const phone=controls.slice(controls.indexOf('@media(max-width:620px)'));
  assert.match(phone,/\.recap-open \{ grid-column:3; grid-row:1/);
  assert.match(phone,/\[data-account-switcher\] \{ grid-column:1\/-1; grid-row:2/);
  assert.match(phone,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(phone,/justify-self:stretch; width:100%/);
  assert.match(phone,/\.astra-trade-actions > button \{ width:100% !important; min-width:0; grid-column:auto !important; grid-row:auto !important/);
  assert.match(controls,/\.astra-header-meta \{ display:none !important; \}/);
});
