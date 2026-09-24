import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {build} from 'vite';import {pathToFileURL} from 'node:url';import {join} from 'node:path';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';
assert.ok(existsSync('api/passport.ts'),'Authenticated progression endpoint is required');
const dir=await mkdtemp(join(tmpdir(),'cova-progress-api-'));
try{await build({configFile:false,logLevel:'error',build:{ssr:'api/passport.ts',outDir:dir,emptyOutDir:false,target:'node22',rollupOptions:{output:{entryFileNames:'api.mjs'}}}});const {createPassportHandler}=await import(pathToFileURL(join(dir,'api.mjs')).href);let calls=0;
 const handle=createPassportHandler({auth:async()=>({id:'owner-a'}),rest:async()=>{calls++;return {total_xp:0,receipts:[]}}});
 const invoke=async(method,body,url='/api/passport')=>{let code,value;const res={setHeader(){},status(c){code=c;return this},json(v){value=v;return this}};await handle({method,body,url,headers:{}},res);return {code,value}};
 assert.equal((await invoke('GET',undefined,'/api/passport?owner=owner-b')).code,409);assert.equal(calls,0);
 assert.equal((await invoke('POST',{owner:'owner-b',action:'review',xp:999999})).code,409);assert.equal(calls,0);
 assert.equal((await invoke('PATCH',{})).code,405);assert.equal(calls,0);
 assert.equal((await invoke('POST',{owner:'owner-a',action:'review',day:'2026-09-18',account:'x',trades:[],xp:99999})).code,400);assert.equal(calls,0);
 assert.equal((await invoke('GET',undefined,'/api/passport?owner=owner-a')).code,200);assert.equal(calls,1);
 const denied=createPassportHandler({auth:async()=>{throw Object.assign(Error('Sign in'),{statusCode:401})},rest:async()=>{throw Error('No database access allowed')}});let status;await denied({method:'GET',url:'/api/passport?owner=owner-a',headers:{}},{setHeader(){},status(s){status=s;return this},json(){}});assert.equal(status,401);
 const {payload}=await import('./helpers/passport-progress-fixture.mjs');let committed;const requests=[];
 const positive=createPassportHandler({auth:async()=>({id:'owner-a'}),now:()=>Date.parse('2026-09-19T00:00:00Z'),rest:async(path,options)=>{requests.push({path,options});if(path==='passport_rule_plans')return [{id:1,created_at:'2026-09-17T22:00:00Z',limits:{maxDailyLoss:500,maxTradeLoss:200,maxContracts:2,maxLossStreak:3}}];if(path==='passport_session_reviews'||path==='passport_reward_days')return [];if(path==='rpc/passport_commit_review'){committed=options.body;return {revision:1,xp:committed.p_xp,note:committed.p_note}}if(path==='rpc/passport_progress_snapshot')return {total_xp:committed?.p_xp||0,receipts:[]};throw Error('Unexpected database path '+path)}});
 let positiveStatus,positiveResult;await positive({method:'POST',url:'/api/passport',headers:{},body:{...payload,owner:'owner-a',action:'review',revision:0,note:'Synthetic API test review only.',xp:999999,reconciled:true}},{setHeader(){},status(s){positiveStatus=s;return this},json(v){positiveResult=v;return this}});
 assert.equal(positiveStatus,200,JSON.stringify(positiveResult));assert.equal(committed.p_xp,60);assert.equal(committed.p_owner,'owner-a');assert.equal(positiveResult.state.total_xp,60);assert.match(committed.p_hash,/^[a-f0-9]{64}$/);for(const x of requests.filter(x=>x.options.query))assert.equal(x.options.query.owner_id,'eq.owner-a');
 console.log('PASS positive compiled API: cash replay, pre-session plan, server-only 60 XP, owner-filtered reads, receipt and snapshot');
 console.log('PASS compiled API: verified identity, auth switching, unsupported methods, malformed evidence and no arbitrary client XP writes');
}finally{await rm(dir,{recursive:true,force:true})}
