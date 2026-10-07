import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'vite';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
test('homepage replaces the four-step strip with one centered real Passport showcase',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true}});
 try{const {StoryStrip}=await server.ssrLoadModule('/src/components/StoryStrip.tsx');const html=renderToStaticMarkup(createElement(StoryStrip));
 assert.match(html,/data-passport-feature="interactive-sample"/,'Centered interactive Passport showcase is missing');
 assert.equal((html.match(/data-passport-tier="diamond"/g)||[]).length,1);
 assert.match(html,/story-strip-simple/,'Existing hero scroll action must keep its real destination');
 assert.match(html,/Worth sharing/);assert.match(html,/Choose what you show/);assert.match(html,/Create my Passport/);
 assert.match(html,/Sample data · Not account verified/);assert.match(html,/Diamond rank shown for illustration/);
 assert.equal((html.match(/data-passport-sample-mode=/g)||[]).length,3);
 assert.match(html,/Hide identity/);assert.doesNotMatch(html,/home-story-step|How Cova works|Explore the workflow/);
 assert.match(html,/passport-etched-signature/);assert.match(html,/data-home-story="card-first"/);
 }finally{await server.close();}
});
test('sample modes derive from the existing model and Ghost never exposes identity or money',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true}});
 try{const story=await server.ssrLoadModule('/src/components/StoryStrip.tsx');assert.equal(typeof story.homepagePassportModel,'function','Sample model must have one shared privacy gate');
 const {analyze,sampleTrades,defaultRules}=await server.ssrLoadModule('/src/lib/risk.ts');const {buildHoloPassportModel}=await server.ssrLoadModule('/src/lib/passportHolo.ts');const analysis=analyze(sampleTrades,defaultRules);
 for(const mode of ['flex','discipline','private']){for(const hide of [false,true]){
  const result=story.homepagePassportModel(mode,hide),expected=buildHoloPassportModel(analysis,'Diamond',mode,true);
  for(const key of ['mode','modeLabel','heroValue','heroLabel','marketLine','ruleSummary','provenance','sample'])assert.deepEqual(result[key],expected[key],mode+' '+key);
  assert.equal(result.identity,mode==='private'||hide?'Private profile':'Trader 6714');
  assert.equal(result.rank,'Diamond');assert.equal(result.sample,true);
  if(mode==='private'){assert(!JSON.stringify(result).includes('$'));assert(!JSON.stringify(result).includes('Trader 6714'));assert(!result.marketLine.includes('NQ'));}
 }}
 }finally{await server.close();}
});
