import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {restoreMobileRecordingSource} from './helpers/approved-mobile-recording.mjs';
import {restoreCopyConsumerSource,frozenCopyModules} from './helpers/approved-copy-consumer-ssr.mjs';
const source=readFileSync('src/components/WorkspaceSections.tsx','utf8');
test('Empty reviews stay neutral; every populated Rules/Insights render is unchanged',async()=>{
 const files=frozenCopyModules();let v;
 try{
  const path='src/components/WorkspaceSections.tsx',copyRestored=restoreCopyConsumerSource(path,source);
  const frozen=files.write(path,restoreMobileRecordingSource(path,source)),normalized=files.write(path,copyRestored);
  v=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  const current=await v.ssrLoadModule('/'+path),comparison=await v.ssrLoadModule(normalized),before=await v.ssrLoadModule(frozen),{analyze,defaultRules,sampleTrades}=await v.ssrLoadModule('/src/lib/risk.ts');
  for(const plan of ['free','pro']){
   const entitlements={canEditAdvancedLimits:plan==='pro',canExportPassport:plan==='pro',insightLimit:plan==='pro'?3:1,plan};
   for(const trades of [[],sampleTrades,sampleTrades.slice(0,1)])for(const rules of [defaultRules,defaultRules.map(r=>({...r,enabled:false}))]){
    const analysis=analyze(trades,rules),snapshot=JSON.stringify(analysis),props={analysis,entitlements,rules,setRules(){},go(){},upgradeToPro(){},accountControl:createElement('span',{'data-account-proof':true},'Selected account')};
    for(const name of ['Coach','RulesEngine']){
     const html=renderToStaticMarkup(createElement(current[name],props));
     assert.match(html,/Selected account/,'Account control remains present');
     if(trades.length){
      assert.equal(renderToStaticMarkup(createElement(comparison[name],props)),renderToStaticMarkup(createElement(before[name],props)),name+' populated rendering and entitlement gating unchanged after exact approved-copy reversal');
      if(copyRestored!==source.replaceAll('\r\n','\n')){
       if(name==='RulesEngine'){assert.match(html,/Set limits to check against your trades\./);assert.match(html,/How limits work/);if(rules.every(rule=>!rule.enabled))assert.match(html,/Disabled; not checked\./);}
       else if(plan==='free'){assert.match(html,/See all insights/);assert.match(html,/Pro includes setup comparisons and session details\./);}
      }
     }
     else{
      assert.doesNotMatch(html,/data-warning="true"|data-rule-state="breach"|Breach in history|Inside limit|Rules followed:/);
      if(name==='Coach'){assert.match(html,/Import trades to see insights/);assert.doesNotMatch(html,/Review status|limit warning|Unlock Pro/);}
      else{assert.match(html,/No trades to review/);assert.equal((html.match(/role="switch"/g)||[]).length,defaultRules.length);assert.match(html,/Does not block orders/);}
     }
     assert.equal(JSON.stringify(analysis),snapshot,'Presentation never mutates financial analysis');
    }
   }
  }
 }finally{try{await v?.close();}finally{files.close();}}
});
test('Approved display seams reverse to exact pre-review source, protecting all other behavior',()=>{
 const hashes={
  'src/components/WorkspaceSections.tsx':'572520751489507755f8bec5be958f4aa5285df9c1aef6d051393a413e9296ff'
 };
 for(const [p,h]of Object.entries(hashes)){
  const s=restoreMobileRecordingSource(p,readFileSync(p,'utf8'));
  const hashes=[s,s.replaceAll('\n','\r\n')].map(s=>createHash('sha256').update(s).digest('hex'));
  assert(hashes.includes(h));
  for(const [input,anchor,replacement] of [
   [source,'formatPercent(analysis.compliance)','formatPercent(999)'],
   [source,'Import trades to see insights','Invented review'],
   [s,'formatPercent(analysis.compliance)','formatPercent(999)'],
   [s,'title: "Limit warnings"','title: "Invented review"'],
   [s,'go("passport")','go("import")'],
  ]){
   assert(input.includes(anchor),'Mutation anchor exists in its actual source phase: '+anchor);
   const mutated=input.replace(anchor,replacement);assert.notEqual(mutated,input);
   assert.throws(()=>{
    const reversed=restoreMobileRecordingSource(p,mutated);
    assert([reversed,reversed.replaceAll('\n',String.fromCharCode(13,10))].map(s=>createHash('sha256').update(s).digest('hex')).includes(h));
   },assert.AssertionError,'Unapproved calculation/display/handler edits fail either the exact adapter or original hash');
  }
 }
});
