import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', key='Manual:33333333-3333-4333-8333-333333333333';
const storage=()=>{const m=new Map();return{get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
const trade=(id,account)=>({id,date:'2026-10-01',market:'ES',side:'Long',contracts:1,entry:100,exit:101,pnl:25,risk:0,riskStatus:'missing',setup:'',notes:'Preserve other trade notes',manual:{accountKey:account,currency:'USD',pnlBasis:'reported_net'}});
function setup(){globalThis.localStorage=storage();globalThis.sessionStorage=storage();globalThis.window=new EventTarget();localStorage.setItem('cova-active-storage-identity-v1',owner);const trades=[trade('remove-me',key),trade('keep-me','local')],rules=[];localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades,rules,tradeAccount:key}));localStorage.setItem('cova-workspace-aux-v1:'+owner,JSON.stringify({version:1,names:{[key]:'Perps',local:'Keep account'},cash:{},notes:{[key]:{'2026-10-01':{note:'Delete account journal',tradeId:'remove-me'}},local:{'2026-10-01':{note:'Keep other journal',tradeId:'keep-me'}},all:{'2026-10-01':{note:'Keep shared note text',tradeId:'remove-me'}}}}));localStorage.setItem('cova-react-risk-os-v2:'+other,'other owner untouched');return {trades,rules};}
test('explicit account removal clears only that account and detaches shared notes',()=>{
 const {trades,rules}=setup();const m=load('src/lib/accountRemoval.ts');assert.equal(typeof m.prepareAccountRemoval,'function','Removal preview is implemented');const p=m.prepareAccountRemoval(owner,key,trades,[key,'local']);assert.equal(p.tradeCount,1);assert.equal(p.noteCount,1);const result=m.commitAccountRemoval(owner,p,trades,rules,key);assert.equal(result.error,null);assert.deepEqual(result.trades,[trades[1]]);assert.equal(result.selection,'all');const aux=JSON.parse(localStorage.getItem('cova-workspace-aux-v1:'+owner));assert.equal(aux.names[key],undefined);assert.equal(aux.notes[key],undefined);assert.deepEqual(aux.notes.local,{'2026-10-01':{note:'Keep other journal',tradeId:'keep-me'}});assert.deepEqual(aux.notes.all,{'2026-10-01':{note:'Keep shared note text',tradeId:null}});assert.equal(localStorage.getItem('cova-react-risk-os-v2:'+other),'other owner untouched');assert(m.accountWasRemoved(owner,key));assert(!m.accountWasRemoved(other,key));
});

test('stale confirmation, owner switch and unavailable storage never remove history',()=>{
 for(const mode of ['stale','owner','failure']){const {trades,rules}=setup(),m=load('src/lib/accountRemoval.ts'),p=m.prepareAccountRemoval(owner,key,trades,[key,'local']),before=localStorage.getItem('cova-react-risk-os-v2:'+owner);
 if(mode==='stale'){const aux=JSON.parse(localStorage.getItem('cova-workspace-aux-v1:'+owner));aux.notes[key]['2026-10-02']={note:'newer edit',tradeId:null};localStorage.setItem('cova-workspace-aux-v1:'+owner,JSON.stringify(aux));}
 if(mode==='owner')localStorage.setItem('cova-active-storage-identity-v1',other);
 if(mode==='failure'){const set=localStorage.setItem;let failed=false;localStorage.setItem=(k,v)=>{if(!failed&&k==='cova-workspace-aux-v1:'+owner){failed=true;throw Error('quota');}return set(k,v)};}
 assert(m.commitAccountRemoval(owner,p,trades,rules,key).error);assert.equal(localStorage.getItem('cova-react-risk-os-v2:'+owner),before);assert.equal(JSON.parse(localStorage.getItem('cova-workspace-aux-v1:'+owner)).names[key],'Perps');assert(!m.accountWasRemoved(owner,key));
 }
});
test('old Tradovate account removal clears legacy names, journal and fee cache but keeps another account',()=>{
 const {rules}=setup(),m=load('src/lib/accountRemoval.ts'),target='Tradovate:7',keep='Tradovate:8';localStorage.removeItem('cova-workspace-aux-v1:'+owner);
 const broker=(id,accountId)=>({...trade(id,'local'),manual:undefined,source:{provider:'Tradovate',accountId,tradeId:id,pnlBasis:'gross_before_fees'}});const trades=[broker('old','7'),broker('active','8')];
 localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades,rules,tradeAccount:target}));localStorage.setItem('cova-account-names-v1:'+owner,JSON.stringify({[target]:'FFF old',[keep]:'Keep FFF'}));localStorage.setItem('cova-daily-journal-v1:'+encodeURIComponent(target)+':'+owner,JSON.stringify({'2026-10-01':{note:'old',tradeId:'old'}}));localStorage.setItem('cova-broker-cash-v1:7:'+owner,'legacy fee evidence');localStorage.setItem('cova-broker-cash-v1:8:'+owner,'keep fee evidence');
 const preview=m.prepareAccountRemoval(owner,target,trades,[target,keep]);assert.equal(preview.noteCount,1);const result=m.commitAccountRemoval(owner,preview,trades,rules,target);assert.equal(result.error,null);assert.deepEqual(result.trades,[trades[1]]);assert.equal(localStorage.getItem('cova-broker-cash-v1:7:'+owner),null);assert.equal(localStorage.getItem('cova-broker-cash-v1:8:'+owner),'keep fee evidence');assert.deepEqual(JSON.parse(localStorage.getItem('cova-account-names-v1:'+owner)),{[keep]:'Keep FFF'});assert.equal(m.prepareAccountRemoval(owner,'all',trades,['all']),null);assert.equal(m.prepareAccountRemoval(owner,'bogus',trades,['bogus']),null);
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
test('Accounts exposes distinct removal controls for manual and retained broker history',async()=>{
 delete globalThis.window;const v=await createServer({cacheDir:'node_modules/.vite-removal-ssr',server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
 try{const {ManualAccountManager}=await v.ssrLoadModule('/src/components/ManualAccountManager.tsx');const html=renderToStaticMarkup(React.createElement(ManualAccountManager,{accounts:[key,'Tradovate:7'],names:{[key]:'Perps','Tradovate:7':'FFF old'},onCreate:()=>null,onRename:()=>null,onOpen:()=>{},onPrepareRemove:()=>null,onRemove:()=>null}));assert.match(html,/Remove Perps/);assert.match(html,/Remove FFF old/);assert.match(html,/Imported accounts/);}finally{await v.close()}
});
test('sidebar collapse uses only a hover/focus revealed arrow at its top right',()=>{
 const src=readFileSync('src/components/WorkspaceShell.tsx','utf8'),css=readFileSync('src/styles/workspaceSidebarMotion.css','utf8');assert.match(src,/collapsed \? <ArrowRight/);assert.match(src,/: <ArrowLeft/);assert(!src.includes('PanelLeftClose'));assert.match(css,/workspace-sidebar-toggle[^}]*position: absolute/s);assert.match(css,/workspace-sidebar-toggle[^}]*opacity: 0/s);assert.match(css,/workspace-sidebar-motion:hover \.workspace-sidebar-toggle/);assert.match(css,/workspace-sidebar-toggle:focus-visible/);
});

test('interrupted removal restores verified originals on reload and refuses cross-owner recovery',()=>{
 const {trades,rules}=setup(),m=load('src/lib/accountRemoval.ts'),preview=m.prepareAccountRemoval(owner,key,trades,[key]);const before=localStorage.getItem('cova-react-risk-os-v2:'+owner),auxBefore=localStorage.getItem('cova-workspace-aux-v1:'+owner),set=localStorage.setItem;
 let fail=false;localStorage.setItem=(k,v)=>{if(k==='cova-workspace-aux-v1:'+owner)fail=true;if(fail&&k==='cova-workspace-aux-v1:'+owner||fail&&k==='cova-react-risk-os-v2:'+owner)throw Error('quota persists');set(k,v)};
 assert(m.commitAccountRemoval(owner,preview,trades,rules,key).error);assert(localStorage.getItem('cova-account-removal-recovery-v1:'+owner));localStorage.setItem=set;m.recoverAccountRemoval(owner);assert.equal(localStorage.getItem('cova-react-risk-os-v2:'+owner),before);assert.equal(localStorage.getItem('cova-workspace-aux-v1:'+owner),auxBefore);assert.equal(localStorage.getItem('cova-account-removal-recovery-v1:'+owner),null);
 localStorage.setItem('cova-account-removal-recovery-v1:'+owner,JSON.stringify({owner,entries:[{key:'cova-react-risk-os-v2:'+other,before:'overwrite',after:null}]}));assert.throws(()=>m.recoverAccountRemoval(owner),/Invalid/);assert.equal(localStorage.getItem('cova-react-risk-os-v2:'+other),'other owner untouched');
});
test('removed Tradovate names do not return from disconnected history summary cache',()=>{
 const {rules}=setup(),m=load('src/lib/accountRemoval.ts'),names=load('src/lib/accountNames.ts');localStorage.removeItem('cova-workspace-aux-v1:'+owner);const trades=[];localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades,rules,tradeAccount:'all'}));sessionStorage.setItem('cova-history-summary:'+JSON.stringify([owner,'old-connection']),JSON.stringify({accounts:[{account:{id:'7',name:'FFF old'}}]}));assert.equal(names.readAccountNames(owner)['Tradovate:7'],'FFF old');const preview=m.prepareAccountRemoval(owner,'Tradovate:7',trades,['Tradovate:7']);assert.equal(m.commitAccountRemoval(owner,preview,trades,rules,'all').error,null);assert.equal(names.readAccountNames(owner)['Tradovate:7'],undefined);
});
test('cleared original CSV bucket keeps reusable metadata identity while deleting its history',()=>{
 const {trades,rules}=setup(),m=load('src/lib/accountRemoval.ts'),names=load('src/lib/accountNames.ts');const preview=m.prepareAccountRemoval(owner,'local',trades,['local',key]);const result=m.commitAccountRemoval(owner,preview,trades,rules,'local');assert.equal(result.error,null);assert.deepEqual(result.trades,[trades[0]]);assert.equal(names.readAccountNames(owner).local,'Manual account');assert(names.saveManualAccountName(owner,'local','New CSV account'));assert.equal(names.readAccountNames(owner).local,'New CSV account');
});
