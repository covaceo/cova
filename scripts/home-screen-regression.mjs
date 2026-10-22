import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
import {readFileSync} from 'node:fs';
import {withoutHomeScreenInstall} from './helpers/approved-home-screen.mjs';

test('preservation allowance rejects weakened installation safety gates',()=>{
 const source=readFileSync('src/App.tsx','utf8');assert(!withoutHomeScreenInstall(source).includes('HomeScreenInstall'));
 assert.throws(()=>withoutHomeScreenInstall(source.replace("workspaceSync.phase === 'saved'",'true')));
 assert.throws(()=>withoutHomeScreenInstall(source.replace("authSession?.source === 'supabase' ? authSession.userId : undefined} eligible",'authSession?.userId} eligible')));
});

test('preference transport rejects wrong-owner responses, aborted calls and unverified writes',async()=>{
 const {createHomeScreenRepository}=load('src/lib/homeScreenRepository.ts');
 const base={getSession:async()=>({user:{id:'a'},access_token:'token-a'}),url:'https://auth.example.invalid',key:'public-test'};
 await assert.rejects(()=>createHomeScreenRepository({...base,fetcher:async()=>new Response(JSON.stringify({id:'b'}))}).load('a'),/session/i);
 let calls=0;const controller=new AbortController();controller.abort();await assert.rejects(()=>createHomeScreenRepository({...base,fetcher:async()=>{calls++;return new Response('{}');}}).load('a',controller.signal));assert.equal(calls,0);
 await assert.rejects(()=>createHomeScreenRepository({...base,fetcher:async()=>new Response(JSON.stringify({id:'a',user_metadata:{}}))}).remember('a','installed'),/not saved/i);
});

test('an owner switch cannot retarget an in-flight preference write',async()=>{
 const {createHomeScreenRepository}=load('src/lib/homeScreenRepository.ts');let owner='a';let bearer;
 const repo=createHomeScreenRepository({getSession:async()=>({user:{id:owner},access_token:'token-'+owner}),url:'https://auth.example.invalid',key:'public-test',fetcher:async(_url,options)=>{bearer=options.headers.Authorization;owner='b';return new Response(JSON.stringify({id:'a',user_metadata:{cova_home_screen_seen:true}}));}});
 await assert.rejects(()=>repo.remember('a','installed'),/session/i);assert.equal(bearer,'Bearer token-a');
});

test('App only offers installation after account-backed data is saved and auth/setup are settled',()=>{
 const source=readFileSync('src/App.tsx','utf8');
 assert(source.includes('<HomeScreenInstall'));
 assert(source.includes("workspaceSync.phase === 'saved' && workspaceSync.hasWorkspace && workspaceSync.allowEdit"));
 assert(source.includes("section === 'dashboard' && !mobileOpen && !authMode && !passwordRecoverySession && !pendingSupabaseSession && !toast"));
 const html=readFileSync('index.html','utf8');assert(html.includes('rel="manifest"'));assert(html.includes('rel="apple-touch-icon"'));
 const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));assert.equal(manifest.start_url,'/#dashboard');assert.equal(manifest.display,'standalone');assert.equal(manifest.id,'/');
 for(const icon of manifest.icons){const png=readFileSync('public'+icon.src),size=Number(icon.sizes.split('x')[0]);assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
});

test('unsaved owner drafts block an install offer without crossing account boundaries',()=>{
 const {hasHomeScreenDraft}=load('src/lib/homeScreenEligibility.ts');
 const entries=[['cova-journal-draft-v1:daily:owner-a','{"note":"unsaved"}'],['other-key','x']];
 const storage={length:entries.length,key:i=>entries[i]?.[0]||null,getItem:key=>entries.find(e=>e[0]===key)?.[1]||null};
 assert.equal(hasHomeScreenDraft('owner-a',[storage]),true);
 assert.equal(hasHomeScreenDraft('owner-b',[storage]),false);
 entries[0][1]='null';assert.equal(hasHomeScreenDraft('owner-a',[storage]),false);
 assert.equal(hasHomeScreenDraft('owner-a',[{get length(){throw Error('blocked');}}]),true,'Fail closed when draft safety cannot be checked');
});

test('Home Screen confirmation persists only a UI preference for the authenticated owner and reads it back',async()=>{
 const {createHomeScreenRepository}=load('src/lib/homeScreenRepository.ts');
 let metadata={name:'Existing profile',unrelated:true};const calls=[];
 const session={user:{id:'owner-a'},access_token:'synthetic-a'};
 const repo=createHomeScreenRepository({getSession:async()=>session,url:'https://auth.example.invalid',key:'public-test',fetcher:async(url,options)=>{
  calls.push({url,...options});assert.equal(options.headers.Authorization,'Bearer synthetic-a');
  if(options.method==='PUT'){assert.deepEqual(JSON.parse(options.body),{data:{cova_home_screen_seen:true}});metadata={...metadata,...JSON.parse(options.body).data};}
  return new Response(JSON.stringify({id:'owner-a',user_metadata:metadata}),{status:200});
 }});
 assert.deepEqual(await repo.load('owner-a'),{installed:false,dismissed:false});
 await repo.remember('owner-a','installed');
 assert.deepEqual(await repo.load('owner-a'),{installed:true,dismissed:false});
 assert.equal(metadata.name,'Existing profile');assert.equal(metadata.unrelated,true);
 assert.equal(calls.filter(c=>c.method==='PUT').length,1);
 await assert.rejects(()=>repo.remember('owner-b','installed'),/session/i);
 assert.equal(calls.filter(c=>c.method==='PUT').length,1,'No write for another owner');
});
