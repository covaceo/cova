import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const approved=JSON.parse(readFileSync(new URL('../fixtures/approved-copy-cleanup.json',import.meta.url),'utf8')).files;
/** Reverse only audited copy/nav seams so older protected-source hashes still
 * guard accounting, storage, identity, markup and handlers. No new hash waiver. */
export function restoreApprovedCopySource(path, source) {
 if(!approved[path]) return source;
 let value=source.toString().replaceAll('\r\n','\n');
 for(const seam of (approved[path]?.seams??[]).toReversed()){
  if(value.includes(seam.after)){
   assert.equal(value.split(seam.after).length,2,`Unique approved copy seam: ${path}`);
   value=value.replace(seam.after,seam.before);
  }else assert.ok(value.includes(seam.before),`Missing or altered approved copy seam: ${path}`);
 }
 return value;
}
