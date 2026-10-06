import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:4179';
try { await fetch(origin, {signal:AbortSignal.timeout(500)}); throw Error('Workspace fixture port is already occupied.'); } catch (e) { if(e.message==='Workspace fixture port is already occupied.') throw e; }
const fixture = spawn(process.execPath, ['scripts/workspace-browser-fixture.mjs'], {stdio:['ignore','pipe','pipe']});
let output=''; fixture.stdout.on('data',b=>output+=b); fixture.stderr.on('data',b=>output+=b);
const wait = ms => new Promise(r=>setTimeout(r,ms));
try {
 const start=Date.now(); while(!output.includes('LOCAL_WORKSPACE_FIXTURE '+origin+'/__workspace')) { if(fixture.exitCode!==null || Date.now()-start>30000) throw Error('Fixture did not become ready: '+output); await wait(100); }
 assert.equal((await fetch(origin)).status,200);
 for (const script of (process.env.COVA_REMOVAL_ONLY ? ['scripts/account-removal-browser.mjs'] : ['scripts/manual-accounts-browser.mjs','scripts/account-removal-browser.mjs'])) await new Promise((resolve,reject)=>{ const child=spawn(process.execPath,[script],{stdio:'inherit'}); child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(script+' failed: '+code))); });
} finally {
 fixture.kill('SIGTERM'); const start=Date.now(); while(fixture.exitCode===null && fixture.signalCode===null && Date.now()-start<5000) await wait(50);
 assert(fixture.exitCode!==null || fixture.signalCode!==null,'Owned fixture stopped');
 let closed=false; for(let i=0;i<40;i++){ try{await fetch(origin,{signal:AbortSignal.timeout(200)})}catch{closed=true;break} await wait(50); } assert(closed,'Owned fixture port closed');
}
