import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const approved=JSON.parse(readFileSync(new URL('../fixtures/performance-score-approved.json',import.meta.url),'utf8'));
/** Reverse only the explicit score migration, never an entire financial module. */
export function restorePerformanceScoreSource(path, source) {
 if(!approved[path]) return source;
 let value=source.toString().replaceAll('\r\n','\n');
 for(const seam of approved[path].seams.toReversed()) {
  if(value.includes(seam.new)) {
   assert.equal(value.split(seam.new).length,2,'Exact score seam: '+path);
   value=value.replace(seam.new,seam.old);
  } else assert(value.includes(seam.old),'Missing or altered score seam: '+path);
 }
 return value;
}
