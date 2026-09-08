import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const path = new URL('../src/lib/passportShareActions.ts', import.meta.url);
function load() {
  assert.ok(existsSync(path), 'Image delivery module must exist');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports, File: class File { constructor(parts,name,options){this.parts=parts;this.name=name;this.type=options.type;} }});
  return exports;
}
test('file share starts immediately with prepared PNG and never invents a public URL', async () => {
 const { sharePreparedImage }=load();const calls=[];
 const nav={canShare: data=>{assert.equal(data.files[0].type,'image/png');return true;}, share:data=>{calls.push(data);return Promise.resolve();}};
 const promise=sharePreparedImage({type:'image/png'},'cova-sample.png',nav);
 assert.equal(calls.length,1,'native call must stay in click activation, no preliminary await');
 assert.deepEqual(Object.keys(calls[0]),['files']);
 assert.equal(await promise,'opened');
});
test('unsupported file share falls back explicitly and cancellation does not download',async()=>{
 const {sharePreparedImage}=load();
 assert.equal(await sharePreparedImage({},'x.png',{}),'unsupported');
 assert.equal(await sharePreparedImage({},'x.png',{canShare:()=>false,share:()=>assert.fail()}),'unsupported');
 assert.equal(await sharePreparedImage({},'x.png',{canShare:()=>true,share:()=>Promise.reject({name:'AbortError'})}),'cancelled');
 await assert.rejects(sharePreparedImage({},'x.png',{canShare:()=>true,share:()=>Promise.reject(new Error('denied'))}),/denied/);
});
test('copy writes the prepared PNG synchronously, exposes unsupported and propagates denial',async()=>{
 const {copyPreparedImage}=load();let called=0;
 class Item{constructor(data){this.data=data;}}
 const pending=copyPreparedImage({type:'image/png'},{write:items=>{called++;assert.equal(items[0].data['image/png'].type,'image/png');return Promise.resolve();}},Item);
 assert.equal(called,1);assert.equal(await pending,'copied');
 assert.equal(await copyPreparedImage({},undefined,undefined),'unsupported');
 await assert.rejects(copyPreparedImage({},{write:()=>Promise.reject(new Error('denied'))},Item),/denied/);
});
