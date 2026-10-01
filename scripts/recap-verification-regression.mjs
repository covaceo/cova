import test, {after} from 'node:test';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import load from './helpers/load-ts.cjs';
import {recapSyncFixture} from './helpers/recap-verification-fixture.mjs';
const lib=load('src/lib/recapVerification.ts'),{buildSessionRecaps}=load('src/lib/sessionRecap.ts');
const now=Date.now(),owner='synthetic-owner';
const previousStorage=globalThis.localStorage, storage=new Map([['cova-active-storage-identity-v1',owner]]);globalThis.localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};after(()=>{globalThis.localStorage=previousStorage});
const row={id:'tradovate-7:1:2',date:'2026-09-18',market:'MNQ',side:'Long',contracts:1,entry:20000,exit:20010,pnl:20,risk:0,setup:'Imported',notes:'',source:{provider:'Tradovate',accountId:'7',openedAt:'2026-09-18T14:00:00.000Z',closedAt:'2026-09-18T14:10:00.000Z',timeZone:'UTC',pnlBasis:'gross_before_fees'}};
const status={provider:'Tradovate',available:true,linked:true,connected:true,status:'connected',connectionId:'synthetic-connection',expiresAt:new Date(now+60000).toISOString()};
const check=()=>lib.checkedRecapConnection(owner,status,now);
const verify=(rows=[row],who=owner,account='Tradovate:7',connection=check(),at=now)=>lib.verifyRecapTrades(rows,who,account,connection,at);
test('labelled CSV cannot issue a receipt; validated sync is owner, account and connection bound',()=>{
 assert.equal(verify(),null);assert.throws(()=>lib.recordRecapSync(owner,'synthetic-connection',{...recapSyncFixture([row]),status:'invalid'}));assert.equal(verify(),null);
 lib.recordRecapSync(owner,'synthetic-connection',recapSyncFixture([row]));assert.equal(verify().basis,'tradovate');
 for(const account of ['all','local','Tradovate:8','Rithmic:7:7'])assert.equal(verify([row],owner,account),null);
 assert.equal(verify([row],'another-owner'),null);assert.equal(verify([row],owner,'Tradovate:7',{...check(),connectionId:'another'}),null);
 assert.equal(verify([row],owner,'Tradovate:7',null),null);
});
test('economic changes, provider spoofing, manual, mixed and sample rows fail closed',()=>{
 lib.recordRecapSync(owner,'synthetic-connection',recapSyncFixture([row]));
 for(const patch of [{id:'csv-1'},{date:'2026-09-17'},{market:'ES'},{side:'Short'},{contracts:2},{entry:19999},{exit:20011},{pnl:21},{manual:{accountKey:'Tradovate:7',currency:'USD',pnlBasis:'gross_before_fees'}},{source:{...row.source,openedAt:'2026-09-18T13:59:00.000Z'}},{source:{...row.source,accountId:'8'}},{source:{provider:'Rithmic',accountId:'7',accountKey:'key',currency:'USD'}},{id:'demo-1'}])assert.equal(verify([{...row,...patch}]),null,JSON.stringify(patch));
 assert.equal(verify([row,{...row,id:'csv-1'}]),null);
 assert(verify([{...row,notes:'Edited journal',risk:100,setup:'Breakout'}]),'Journal annotations do not destroy genuine sync provenance');
});
test('status failures, expiry and future/oversized leases cannot badge',()=>{
 for(const patch of [{connected:false},{linked:false},{available:false},{status:'reconnect-required'},{provider:'Rithmic'},{connectionId:''},{expiresAt:'bad'},{expiresAt:new Date(now).toISOString()}])assert.equal(lib.checkedRecapConnection(owner,{...status,...patch},now),null);
 assert.equal(verify([row],owner,'Tradovate:7',check(),now+30000),null);
 assert.equal(verify([row],owner,'Tradovate:7',{...check(),checkedAt:now+1}),null);
 assert.equal(verify([row],owner,'Tradovate:7',{...check(),expiresAt:now+30001}),null);
});
const user={id:owner,email:'lino@covadesk.com',email_confirmed_at:'2026-01-01T00:00:00Z'};
test('one exact confirmed server identity gets exception; cached/profile-like and other identities do not',()=>{
 for(const email of ['lino@covadesk.com','LINO@COVADESK.COM',' lino@covadesk.com '])assert.equal(lib.checkedRecapIdentity(owner,{...user,email},now).basis,'owner-approved');
 for(const patch of [{email:'other@covadesk.com'},{email:'x-lino@covadesk.com'},{email:'lino@covadesk.com.evil'},{email:null},{id:'other-owner'},{email_confirmed_at:undefined},{email_confirmed_at:'bad'}])assert.equal(lib.checkedRecapIdentity(owner,{...user,...patch},now),null);
 assert.equal(lib.checkedRecapIdentity('preview',user,now),null);assert.equal(lib.checkedRecapIdentity('',user,now),null);
 const component=readFileSync('src/components/RecapConnection.tsx','utf8');assert.match(component,/client\.auth\.getUser\(\)/);assert.doesNotMatch(component,/auth\.getSession\(|profile\.email|localStorage/);assert.match(component,/cache: 'no-store'/);
});
test('exception permits manual/USD CSV in one selected account, never samples, mixed or all; model carries reason without changing money',()=>{
 const connection=lib.checkedRecapIdentity(owner,user,now);
 const manual={...row,id:'manual-1',source:undefined,manual:{accountKey:'Tradovate:7',currency:'USD',pnlBasis:'gross_before_fees'}};
 const csv={...row,id:'csv-1',source:{provider:'Rithmic',accountKey:'synthetic-account-key',accountId:'7',currency:'USD'}};
 lib.recordRecapIngestion(owner,[csv],'csv');
 for(const [trade,account] of [[manual,'Tradovate:7'],[csv,'Rithmic:synthetic-account-key:7']]){
  const proof=verify([trade],owner,account,connection);assert.equal(proof.basis,'owner-approved');
  const a=buildSessionRecaps([trade],undefined,{owner,selectedAccount:account,connection});assert.equal(a.error,'');assert.equal(a.options[0].verification.basis,'owner-approved');assert.equal(a.options[0].totalCents,'2000');
  assert.equal(verify([trade],owner,'all',connection),null);assert.equal(verify([trade],'other',account,connection),null);assert.equal(verify([trade],owner,account,connection,now+30000),null);
 }
 assert.equal(verify([{...manual,id:'demo-1'}],owner,'Tradovate:7',connection),null);
 assert.equal(verify([manual,csv],owner,'Tradovate:7',connection),null);
 assert(buildSessionRecaps([row,manual]).error,'Manual rows cannot turn a broker net headline into an unchecked gross fallback');
 assert(buildSessionRecaps([{...manual,manual:{...manual.manual,currency:'EUR'}}]).error);
 assert(buildSessionRecaps([{...row,id:'csv-generic',source:undefined}],undefined,{owner,selectedAccount:'local',connection}).error,'Badge is not evidence of currency');
});

test('real CSV parser preserves broker IDs; actual ingestion receipt distinguishes identical CSV from direct Rithmic, including mixtures',()=>{
 const {parseCsvDetailed,mergeTradeLedger}=load('src/lib/risk.ts');
 const csv='date,market,side,contracts,entry,exit,pnl,risk,sourceProvider,sourceAccountId,sourceAccountKey,sourceCurrency,sourceTradeId\n2026-09-18,MNQ,Long,1,20000,20010,20,0,Rithmic,7,abcdefghijklmnopqrst,USD,rithmic-source-123';
 const parsed=parseCsvDetailed(csv);assert.equal(parsed.issues.length,0);const rows=parsed.trades;assert.equal(rows[0].id,'rithmic-source-123');
 const account='Rithmic:abcdefghijklmnopqrst:7', connection=lib.checkedRecapIdentity(owner,user,now);
 const recap=trades=>buildSessionRecaps(trades,undefined,{owner,selectedAccount:account,connection}).options[0];
 lib.recordRecapIngestion(owner,rows,'broker');assert.equal(recap(rows).verification,null);assert.equal(recap(rows).totalCents,'2000');
 const manual={...rows[0],id:'manual-approval-test',source:undefined,manual:{accountKey:account,currency:'USD',pnlBasis:'gross_before_fees'}};
 assert.equal(recap([...rows,manual]).verification,null);assert.equal(recap([...rows,manual]).totalCents,'4000');
 lib.recordRecapIngestion(owner,rows,'csv');const imported=mergeTradeLedger([],rows).trades;assert.equal(recap(imported).verification.basis,'owner-approved');assert.equal(recap([...imported,manual]).verification.basis,'owner-approved');
 assert.equal(lib.verifyRecapTrades(imported,'other-owner',account,{...connection,owner:'other-owner'},now),null);
 assert.equal(recap(imported.map(t=>({...t,source:{...t.source,currency:'EUR'}}))),undefined);
 assert.equal(recap(imported.map(t=>({...t,pnl:21}))).verification,null,'Edited economic row cannot reuse CSV receipt');
 lib.recordRecapIngestion(owner,rows,'broker');assert.equal(recap(rows).verification,null,'Subsequent direct sync invalidates old CSV origin even for identical rows');
 const unknown=[{...rows[0],id:'csv-looking-but-no-receipt'}];assert.equal(recap(unknown).verification,null,'ID prefix is never provenance');
 const app=readFileSync('src/App.tsx','utf8'),desk=readFileSync('src/components/ImportDesk.tsx','utf8');
 assert.match(app,/recordRecapIngestion\(toImportPrincipalIdentity\(authSessionRef.current\), acceptedTrades, origin\)/);
 assert.match(app,/commitBroker:[\s\S]*?if \(!isCurrent\(\)\) return null;[\s\S]*?importCsv\(text, "merge", "broker"\)/);
 assert.match(desk,/preparedImport.commitBroker\(data.csv\)/);assert.doesNotMatch(desk,/preparedImport.commit\(data.csv/);
});

test('renewed proof identity is stable but expiry remains strict and actual eligibility changes are distinct',()=>{
 const a={...check(),accountId:'7'},renewed={...a,checkedAt:now+20000,expiresAt:now+50000};
 assert.equal(lib.recapVerificationKey(a),lib.recapVerificationKey(renewed));
 assert.equal(lib.recapVerificationCurrent(a,now+31000),false);assert.equal(lib.recapVerificationCurrent(renewed,now+31000),true);
 for(const patch of [{owner:'other'},{accountId:'8'},{connectionId:'new'},{basis:'owner-approved'}])assert.notEqual(lib.recapVerificationKey(a),lib.recapVerificationKey({...a,...patch}));
 assert.notEqual(lib.recapVerificationKey(a),lib.recapVerificationKey(null));
});

test('CSV provenance survives fresh module/reload and same-owner sign-in, never another owner or broker replacement',()=>{
 const require=createRequire(import.meta.url),reload=()=>{delete require.cache[require.resolve('./helpers/load-ts.cjs')];return require('./helpers/load-ts.cjs')('src/lib/recapVerification.ts')};
 const csv={...row,id:'persisted-provider-id',source:{provider:'Rithmic',accountKey:'abcdefghijklmnopqrst',accountId:'7',currency:'USD'}},account='Rithmic:abcdefghijklmnopqrst:7';
 const proof=lib.checkedRecapIdentity(owner,user,now),allowed=(module,rows=[csv],who=owner)=>module.verifyRecapTrades(rows,who,account,{...proof,owner:who},now);
 lib.recordRecapIngestion(owner,[csv],'csv');assert(allowed(reload()));
 storage.delete('cova-active-storage-identity-v1');assert.equal(allowed(reload()),null);
 storage.set('cova-active-storage-identity-v1','other-owner');assert.equal(allowed(reload()),null);assert.equal(allowed(reload(),[csv],'other-owner'),null);
 storage.set('cova-active-storage-identity-v1',owner);assert(allowed(reload()),'Same owner signing back in retains provenance');
 assert.equal(allowed(reload(),[{...csv,pnl:21}]),null);assert.equal(allowed(reload(),[{...csv,source:{...csv.source,accountId:'8'}}]),null);
 const manual={...csv,id:'manual-persisted',source:undefined,manual:{accountKey:account,currency:'USD',pnlBasis:'gross_before_fees'}};assert(allowed(reload(),[JSON.parse(JSON.stringify(manual))]));
 reload().recordRecapIngestion(owner,[csv],'broker');assert.equal(allowed(reload()),null,'Direct API revocation survives reload');assert.equal(allowed(reload(),[manual,csv]),null);
 const key='cova-recap-ingestion-v2:'+encodeURIComponent(csv.id)+':'+owner;lib.recordRecapIngestion(owner,[csv],'csv');assert(allowed(lib));storage.delete(key);assert.equal(allowed(lib),null,'Read-through invalidates in-memory cache when another tab removes persisted origin');storage.set(key,'malformed');assert.equal(allowed(reload()),null);
 storage.set(key,JSON.stringify({version:2,owner:'other-owner',id:csv.id,row:'anything'}));assert.equal(allowed(reload()),null);
 lib.recordRecapIngestion(owner,[csv],'csv');const saved=storage.get(key);assert(!saved.includes('lino@'));assert(!saved.includes('connectionId'));assert(!saved.includes('checkedAt'));
 const original=globalThis.localStorage.setItem;globalThis.localStorage.setItem=()=>{throw Error('quota')};lib.recordRecapIngestion(owner,[{...csv,pnl:21}],'csv');globalThis.localStorage.setItem=original;assert.equal(allowed(reload()),null,'Failed write clears stale receipt');
});

test('interleaved unrelated CSV write cannot resurrect a direct-broker revocation across instances/reload',()=>{
 const require=createRequire(import.meta.url),fresh=()=>{delete require.cache[require.resolve('./helpers/load-ts.cjs')];return require('./helpers/load-ts.cjs')('src/lib/recapVerification.ts')};
 const a=fresh(),b=fresh(),csv={...row,id:'race-original',source:{provider:'Rithmic',accountKey:'abcdefghijklmnopqrst',accountId:'7',currency:'USD'}},unrelated={...csv,id:'race-unrelated'},account='Rithmic:abcdefghijklmnopqrst:7';
 const proof=lib.checkedRecapIdentity(owner,user,now),allowed=(instance,rows)=>instance.verifyRecapTrades(rows,owner,account,proof,now);
 a.recordRecapIngestion(owner,[csv],'csv');assert(allowed(a,[csv]));const oldProof=JSON.parse(storage.get('cova-recap-ingestion-v2:'+csv.id+':'+owner)).row;
 // Pause A at its actual persistent write. B revokes before A writes its unrelated row.
 const original=globalThis.localStorage.setItem;let interleaved=false;
 globalThis.localStorage.setItem=(k,v)=>{if(!interleaved&&k.startsWith('cova-recap-ingestion')){interleaved=true;b.recordRecapIngestion(owner,[csv],'broker')}return original(k,v)};
 try {a.recordRecapIngestion(owner,[unrelated],'csv')}finally{globalThis.localStorage.setItem=original}
 assert(interleaved);assert.equal(allowed(a,[csv]),null);assert.equal(allowed(fresh(),[csv]),null,'Revoked direct row stays unbadged after reload');assert(allowed(fresh(),[unrelated]));
 assert.equal(allowed(fresh(),[csv,unrelated]),null,'Mixture cannot regain exception');
 // The old unpublished shared-map format is never a source of authority.
 storage.set('cova-recap-ingestion-v1:'+owner,JSON.stringify({version:1,owner,rows:[[csv.id,oldProof]]}));assert.equal(allowed(fresh(),[csv]),null);
 a.recordRecapIngestion(owner,[csv],'csv');assert(allowed(fresh(),[csv]),'A deliberate later import of this exact row can grant new CSV provenance');
});

test('optional receipts are bounded through repeated replacement imports; ledger wins shared quota',()=>{
 const savedStorage=globalThis.localStorage, data=new Map([['cova-active-storage-identity-v1',owner],['unrelated-settings','keep']]);
 const limit=5*1024*1024, deleted=[];
 const used=()=>[...data].reduce((n,[k,v])=>n+k.length+v.length,0);
 globalThis.localStorage={get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,removeItem:k=>{deleted.push(k);data.delete(k)},setItem:(k,v)=>{v=String(v);if(used()-(data.has(k)?k.length+data.get(k).length:0)+k.length+v.length>limit)throw new DOMException('quota','QuotaExceededError');data.set(k,v)}};
 try {
  const ledgerKey='cova-trades:'+owner;
  for(let batch=0;batch<22;batch++){
   const trades=Array.from({length:batch===21?1500:1000},(_,i)=>({...row,id:`quota-${batch}-${i}`}));
   const serialized=JSON.stringify({trades,rules:[],tradeAccount:'Tradovate:7'});
   assert(lib.persistTradingLedger(ledgerKey,serialized));
   lib.recordRecapIngestion(owner,trades,'csv');
   assert.equal(data.get(ledgerKey),serialized);
   assert([...data].filter(([k])=>k.startsWith('cova-recap-ingestion-v2:')).reduce((n,[k,v])=>n+k.length+v.length,0)<=256*1024);
  }
  // Near quota: trading data fits by itself but needs the space occupied by receipts.
  const previous=data.get(ledgerKey), replacement=previous+' '.repeat(100000);
  const receiptSize=[...data].filter(([k])=>k.startsWith('cova-recap-ingestion-v2:')).reduce((n,[k,v])=>n+k.length+v.length,0);
  assert(receiptSize>100000);
  globalThis.localStorage.setItem('unrelated-large','x'.repeat(limit-used()-'unrelated-large'.length-100));
  assert(lib.persistTradingLedger(ledgerKey,replacement));assert.equal(data.get(ledgerKey),replacement);
  assert.equal(data.get('unrelated-settings'),'keep');assert(data.has('unrelated-large'));
  assert(deleted.every(k=>k.startsWith('cova-recap-ingestion-v2:')));
  assert.equal(lib.persistTradingLedger(ledgerKey,'x'.repeat(limit)),false);assert.equal(data.get(ledgerKey),replacement,'Unsaveable import cannot overwrite existing durable ledger');
  const app=readFileSync('src/App.tsx','utf8'),start=app.indexOf('const nextTrades = mode === "replace"');
  const commit=app.slice(start,app.indexOf('if (mode === "replace" && brokerStatus',start));
  assert(commit.indexOf('persistTradingLedger(')<commit.indexOf('setTrades(nextTrades)'));
  assert(commit.indexOf('persistTradingLedger(')<commit.indexOf('recordRecapIngestion('));assert.match(commit,/return null;/);
 } finally {globalThis.localStorage=savedStorage}
});
