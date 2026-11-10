// Preload with --import. Protect all Hades trees from test-output collisions.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
const allowed=(process.env.WORKSPACE_WRITE_ROOTS||process.env.ASK_COVA_EVIDENCE_ROOT||'').split('|').filter(Boolean).map(p=>path.resolve(p).toLowerCase());
if(!allowed.length)throw Error('Explicit workspace evidence write roots required');
const hades=path.resolve('C:/Hades').toLowerCase();
function guard(value){
 if(typeof value==='number'||value==null)return;
 const p=path.resolve(value instanceof URL?fileURLToPath(value):String(value)).toLowerCase();
 if(p===hades||p.startsWith(hades+path.sep))if(!allowed.some(root=>p===root||p.startsWith(root+path.sep)))throw Error('WRITE BOUNDARY: '+p);
}
for(const object of [fs,fsp])for(const name of ['writeFile','writeFileSync','appendFile','appendFileSync','mkdir','mkdirSync','rm','rmSync','rmdir','rmdirSync','unlink','unlinkSync','truncate','truncateSync','createWriteStream'])if(typeof object[name]==='function'){
 const original=object[name];object[name]=function(file,...args){guard(file);return original.call(this,file,...args);};
}
for(const object of [fs,fsp])for(const name of ['rename','renameSync','copyFile','copyFileSync','cp','cpSync'])if(typeof object[name]==='function'){
 const original=object[name];object[name]=function(from,to,...args){guard(to);if(name.startsWith('rename'))guard(from);return original.call(this,from,to,...args);};
}
syncBuiltinESMExports();
console.log('Workspace evidence guard active:',allowed.join(' | '));
