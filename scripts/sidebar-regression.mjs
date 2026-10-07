import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import loadSource from './helpers/load-ts.cjs';

const {WorkspaceShell}=loadSource('src/components/WorkspaceShell.tsx');
const preference='cova-workspace-sidebar-collapsed-v1';
const props={section:'dashboard',brokerLabel:'Sample history',email:'sidebar@example.test',riskScore:0,go:()=>{},signOut:()=>{},deleteAccount:()=>{},children:React.createElement('p',null,'Preserved content')};
const render=()=>renderToStaticMarkup(React.createElement(WorkspaceShell,props));
test('existing users get an expanded rail with one named toggle controlling the sidebar',()=>{
  const html=render();
  assert.match(html,/data-sidebar-state="expanded"/);
  assert.match(html,/aria-label="Collapse sidebar"[^>]*aria-expanded="true"[^>]*aria-controls="cova-workspace-sidebar"/);
  assert.equal((html.match(/class="workspace-sidebar-toggle"/g)||[]).length,1);
  assert.match(html,/id="cova-workspace-sidebar"/);
  assert.match(html,/cova-wordmark-option-3-sleek-cropped\.png/);
});
test('compact preference retains named navigation, active route, risk score, and profile',()=>{
  globalThis.window={addEventListener:()=>{},removeEventListener:()=>{},localStorage:{getItem:key=>key===preference?'true':null}};
  try {
    const html=render();
    assert.match(html,/data-sidebar-state="collapsed"/);
    assert.match(html,/aria-label="Expand sidebar"[^>]*aria-expanded="false"/);
    assert.match(html,/aria-label="Search workspace"[^>]*aria-expanded="false"/);
    assert.doesNotMatch(html,/<input[^>]*aria-label="Search workspace"/,'compact search cannot leave an invisible focusable input');
    for(const label of ['Risk Desk','Limits','Insights','Passport','Accounts']) assert.ok(html.includes(`aria-label="${label}"`),label);
    assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
    assert.match(html,/Cova risk score 0/);
    assert.match(html,/aria-label="Profile menu"/);
    assert.match(html,/Preserved content/);
    assert.match(html,/cova-logo-minimal-white\.svg/);
  } finally {delete globalThis.window;}
});
test('denied or corrupt preference storage safely defaults to expanded',()=>{
  for(const storage of [()=>{throw Error('denied');},()=>({getItem:()=>{throw Error('denied');}}),()=>({getItem:()=>'{corrupt'})]) {
    globalThis.window={addEventListener:()=>{},removeEventListener:()=>{},get localStorage(){return storage();}};
    try {assert.match(render(),/data-sidebar-state="expanded"/);} finally {delete globalThis.window;}
  }
});
