import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync,rmSync} from 'node:fs';
import {posix} from 'node:path';
import {restoreApprovedCopySource} from './approved-copy-cleanup.mjs';

// The shared adapter owns all registered seams. Minimal pricing is not in its
// registry: freeze only the two approved header lines, never rendered HTML.
export function restoreCopyConsumerSource(path,source){
 const restored=restoreApprovedCopySource(path,source);
 if(path!=='src/components/landing/MinimalPlanPricing.tsx')return restored;
 const before='      <header className="minimal-pricing-header">\n        <Heading id="minimal-pricing-title">Try the review flow before you pay.</Heading>\n        <p>Start small enough to prove the workflow. Upgrade when Cova becomes part of every session review.</p>\n      </header>';
 const after='      <header className="minimal-pricing-header">\n        <Heading id="minimal-pricing-title">Try Cova before you pay.</Heading>\n        <p>Start with 25 trades. Upgrade for unlimited imports and Passport exports.</p>\n      </header>';
 const value=restored.toString().replaceAll('\r\n','\n');
 const seam=value.includes(after)?after:before;
 assert.equal(value.split(seam).length,2,'One exact approved minimal-pricing header');
 return value.replace(seam,before);
}

export function frozenCopyModules(){
 const files=[];
 return {
  write(path,source){
   const frozen=posix.join(posix.dirname(path),`__copy-consumer-${process.pid}-${randomUUID()}.tsx`);
   writeFileSync(frozen,source,{flag:'wx'});files.push(frozen);
   return '/'+frozen;
  },
  close(){for(const file of files)rmSync(file,{force:true});},
 };
}
