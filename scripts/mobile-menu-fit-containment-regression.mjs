// Exercise the actual local-only fixture handler without starting a browser/server.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const source=readFileSync(new URL('./mobile-menu-fit-browser.mjs',import.meta.url),'utf8');
const start=source.indexOf('const server=createServer(');
const end=source.indexOf('await new Promise(r=>server.listen',start);
assert(start>=0&&end>start,'fixture handler extraction anchors exist');
const handlerSource=source.slice(start,end);
function harness(paths,code=handlerSource){
 const site=paths===path.win32?'C:\\fixture\\after':'/fixture/after';
 const files=new Map([[paths.join(site,'index.html'),'fixture'],[paths.join(site,'asset.js'),'asset'],[paths.join(site,'../after-private/secret.txt'),'PRIVATE']]);
 let handler;
 vm.runInNewContext(code,{site,path:paths,URL,decodeURIComponent,JSON,createServer:fn=>(handler=fn,{}),existsSync:f=>files.has(f)||f.endsWith('broken.js'),readFileSync:f=>{if(f.endsWith('broken.js'))throw Error('simulated read failure');if(!files.has(f))throw Error('missing');return files.get(f);}});
 assert.equal(typeof handler,'function');
 return url=>{const res={status:200,body:null,writeHead(n){this.status=n;return this;},setHeader(){},end(b){this.body=b;return this;}};handler({url},res);return res;};
}
for(const [name,paths]of [['Windows',path.win32],['POSIX',path.posix]]){
 test(`${name}: encoded traversal, malformed URLs and I/O fail closed; server survives`,()=>{
  const request=harness(paths);
  const cases=[['/',200,'fixture'],['/asset.js',200,'asset'],['/nested/route',200,'fixture'],['/%2e%2e%2fafter-private%2fsecret.txt',403],['/%2e%2e%2felsewhere%2fsecret.txt',403],['/%2e%2e%2f',403],['/%zz',400],['http://[',400],['/broken.js',500],['/api/auth/consent',200],['/api/other',503],['/',200,'fixture']];
  if(name==='Windows')cases.push(['/%2e%2e%5cafter-private%5csecret.txt',403]);
  for(const[url,status,body]of cases){const response=request(url);assert.equal(response.status,status,url);if(body!==undefined)assert.equal(response.body,body,url);assert.notEqual(response.body,'PRIVATE',url);}
 });
 test(`${name}: regression rejects the old sibling-prefix containment bug`,()=>{
  const guard="if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))";
  assert(handlerSource.includes(guard),'production containment guard anchor exists');
  const mutant=handlerSource.replace(guard,'if(!file.startsWith(site))');
  assert.notEqual(mutant,handlerSource);
  const response=harness(paths,mutant)('/%2e%2e%2fafter-private%2fsecret.txt');
  assert.equal(response.status,200,'old prefix bug is demonstrably reachable');
  assert.equal(response.body,'PRIVATE','mutant leaks sibling content; real handler rejects it');
 });
}
