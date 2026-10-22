import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {restoreMobileRecordingSource} from './helpers/approved-mobile-recording.mjs';
const source=readFileSync('src/components/WorkspaceSections.tsx','utf8');
test('Empty reviews stay neutral; every populated Rules/Insights render is unchanged',async()=>{
 const frozen='src/components/__mobile-recording-frozen__.tsx';
 writeFileSync(frozen,restoreMobileRecordingSource('src/components/WorkspaceSections.tsx',source));
 const v=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
 try{
  const current=await v.ssrLoadModule('/src/components/WorkspaceSections.tsx'),before=await v.ssrLoadModule('/'+frozen),{analyze,defaultRules,sampleTrades}=await v.ssrLoadModule('/src/lib/risk.ts');
  for(const plan of ['free','pro']){
   const entitlements={canEditAdvancedLimits:plan==='pro',canExportPassport:plan==='pro',insightLimit:plan==='pro'?3:1,plan};
   for(const trades of [[],sampleTrades,sampleTrades.slice(0,1)])for(const rules of [defaultRules,defaultRules.map(r=>({...r,enabled:false}))]){
    const analysis=analyze(trades,rules),snapshot=JSON.stringify(analysis),props={analysis,entitlements,rules,setRules(){},go(){},upgradeToPro(){},accountControl:createElement('span',{'data-account-proof':true},'Selected account')};
    for(const name of ['Coach','RulesEngine']){
     const html=renderToStaticMarkup(createElement(current[name],props));
     assert.match(html,/Selected account/,'Account control remains present');
     if(trades.length){assert.equal(html,renderToStaticMarkup(createElement(before[name],props)),name+' populated rendering and entitlement gating unchanged');}
     else{
      assert.doesNotMatch(html,/data-warning="true"|data-rule-state="breach"|Breach in history|Inside limit|Rules followed:/);
      if(name==='Coach'){assert.match(html,/Import trades to see insights/);assert.doesNotMatch(html,/Review status|limit warning|Unlock Pro/);}
      else{assert.match(html,/No trades to review/);assert.equal((html.match(/role="switch"/g)||[]).length,defaultRules.length);assert.match(html,/Does not block orders/);}
     }
     assert.equal(JSON.stringify(analysis),snapshot,'Presentation never mutates financial analysis');
    }
   }
  }
 }finally{await v.close();unlinkSync(frozen);}
});
test('Approved display seams reverse to exact pre-review source, protecting all other behavior',()=>{
 const hashes={
  'src/components/WorkspaceSections.tsx':'572520751489507755f8bec5be958f4aa5285df9c1aef6d051393a413e9296ff'
 };
 for(const [p,h]of Object.entries(hashes)){
  const s=restoreMobileRecordingSource(p,readFileSync(p,'utf8'));
  const hashes=[s,s.replaceAll('\n','\r\n')].map(s=>createHash('sha256').update(s).digest('hex'));
  assert(hashes.includes(h));
  for(const mutated of [source.replace('formatPercent(analysis.compliance)','formatPercent(999)'),source.replace('Import trades to see insights','Invented review')]){
   const reversed=restoreMobileRecordingSource(p,mutated);
   assert(![reversed,reversed.replaceAll('\n','\r\n')].map(s=>createHash('sha256').update(s).digest('hex')).includes(h),'Unapproved calculation/display edits still fail preservation');
  }
 }
});
