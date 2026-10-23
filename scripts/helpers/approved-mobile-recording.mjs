import assert from 'node:assert/strict';
import {restorePerformanceScoreSource} from './approved-performance-score.mjs';
import {readFileSync} from 'node:fs';
const changes=JSON.parse(readFileSync(new URL('../fixtures/mobile-recording-approved-copy.json',import.meta.url),'utf8'));
export function restoreMobileRecordingSource(path,source){
 source=restorePerformanceScoreSource(path,source);
 if(!changes[path])return source.toString();
 let s=source.toString().replaceAll('\r\n','\n');
 for(const d of (changes[path]||[]).toReversed()){
  if(!s.includes(d.new))continue;
  assert.equal(s.split(d.new).length,2,'Exact mobile-review presentation seam: '+path);
  s=s.replace(d.new,d.old);
 }
 return s;
}
