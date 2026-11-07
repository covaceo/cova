// SYNTHETIC ONLY. Shared contract and engine behavior, not model-quality evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import load from './helpers/load-ts.cjs';
const core = load('src/lib/askCova.ts');
const shared = existsSync('src/lib/askCovaConversation.ts') ? load('src/lib/askCovaConversation.ts') : {};
test('builder prunes oldest complete pairs by count and UTF8 bytes without repairing invalid input',()=>{
 assert.equal(typeof shared.createAskCovaConversation,'function');
 const create=shared.createAskCovaConversation;
 const history=[...pair('oldest'),...pair('second'),...pair('third'),...pair('newest')];
 assert.deepEqual(create(' current ',history),{message:' current ',history:history.slice(2)});
 const large=[{role:'user',content:'😀'.repeat(1800)},{role:'assistant',content:'a'.repeat(1000)},...pair('latest')];
 assert.deepEqual(create('why?',large),{message:'why?',history:pair('latest')});
 assert.equal(history.length,8);
 for(const bad of [[...pair(),{role:'user',content:'half'}],[{role:'developer',content:'bad'},pair()[1]], [...pair('x'.repeat(4801)),...history]]) assert.equal(create('why?',bad),null);
 assert.equal(create('x'.repeat(501),[]),null);
 assert.equal(create(' ',[]),null);
 assert.deepEqual(create('why?',[]),{message:'why?',history:[]});
});
const scope={ownerId:'synthetic-owner',account:'all',range:'all',question:'review_results',trades:[]};
test('exact validated context binds digest while absent conversation preserves legacy digest',async()=>{
 const legacy=await core.buildAskCovaCatalog(scope);
 assert.equal(legacy.contextDigest,'48c325998385ff2b8d52bb9354acea6928cecfeb34790a5e51b671c84ca03c30');
 const conversation={message:'why?',history:pair()};
 const first=await core.buildAskCovaCatalog({...scope,conversation});
 assert.notEqual(first.contextDigest,legacy.contextDigest);
 assert.equal(first.contextDigest,(await core.buildAskCovaCatalog({...scope,conversation:structuredClone(conversation)})).contextDigest);
 for(const changed of [{...conversation,message:'why? '},{...conversation,history:pair('different')},{...conversation,history:[pair()[0],{role:'assistant',content:'different'}]}]) assert.notEqual(first.contextDigest,(await core.buildAskCovaCatalog({...scope,conversation:changed})).contextDigest);
 for(const conversation of [null,{message:'why?',history:[{role:'developer',content:'bad'}]}]) await assert.rejects(core.buildAskCovaCatalog({...scope,conversation}),/conversation/i);
});
const row={id:'private-row',date:'2026-10-29',market:'NQ',side:'Long',contracts:1,entry:100,exit:101,pnl:20,risk:10,setup:'PRIVATE ALPHA',notes:'PRIVATE NOTE',manual:{accountKey:'local',currency:'USD',pnlBasis:'gross_before_fees'}};
const authored=(text,evidence)=>({version:'ask-cova-answer-v1',paragraphs:[{text,evidence}],detail:[]});
test('conversational review and stands-out allow focused evidence or greetings without mandatory financial recap',async()=>{
 for(const question of ['review_results','what_stands_out']){
  const input={...scope,question,trades:[row,{...row,id:'second',setup:'PRIVATE BETA',pnl:-10}]};
  const legacy=await core.buildAskCovaCatalog(input);
  assert.deepEqual(core.askCovaModelPayload(legacy).requiredAnswerEvidence,['overall','payoff','comparison']);
  const catalog=await core.buildAskCovaCatalog({...input,conversation:{message:'Can you explain just the payoff?',history:[]}});
  const packet=core.askCovaModelPayload(catalog);
  assert.deepEqual(packet.requiredAnswerEvidence,[]);
  assert.deepEqual(packet.observations.find(o=>o.id==='conversation'),{id:'conversation',kind:'conversation',facts:[],categories:[],coverage:[],predicates:['greeting_or_clarification_only']});
  assert(core.renderAskCovaAnswer(catalog,authored('profit factor is {{f:profit_factor}}.', ['payoff'])));
  assert.equal(core.renderAskCovaAnswer(legacy,authored('profit factor is {{f:profit_factor}}.', ['payoff'])),null);
  const greeting=core.renderAskCovaAnswer(catalog,authored('hello. what would you like to examine?', ['conversation']));
  assert.deepEqual(greeting.tradeIds,[]);assert.deepEqual(greeting.scopeNotices,[]);
  assert.equal(core.renderAskCovaAnswer(catalog,authored('{{f:net}}',['conversation'])),null);
  assert.equal(core.renderAskCovaAnswer(catalog,authored('profit is 100',['conversation'])),null);
  assert.deepEqual(core.renderAskCovaAnswer(catalog,authored('{{f:net}}',['overall'])).scopeNotices,['Gross, before fees.']);
 }
});
test('history renderer accepts only validated main answers and uses safe categories rather than private aliases',async()=>{
 assert.equal(typeof core.askCovaHistoryText,'function');
 const catalog=await core.buildAskCovaCatalog({...scope,question:'setup_performance',trades:[row,{...row,id:'second',setup:'PRIVATE BETA',pnl:-10}]});
 const answer=authored('{{c:category_a}} averaged {{f:mean_a}}.', ['comparison']);
 answer.detail=[{text:'detail must not enter history.',evidence:['comparison']}];
 assert.match(core.renderAskCovaAnswer(catalog,answer).paragraphs[0],/PRIVATE ALPHA/);
 assert.equal(core.askCovaHistoryText(catalog,answer),'Category A averaged 20.00 USD.');
 assert.doesNotMatch(core.askCovaHistoryText(catalog,answer),/PRIVATE|private-row|detail|second/);
 assert.equal(core.askCovaHistoryText({...catalog},answer),null);
 assert.equal(core.askCovaHistoryText(catalog,authored('{{f:net}}',['comparison'])),null);
 assert.equal(core.askCovaHistoryText(catalog,{...answer,detail:[{text:'bad 123',evidence:['comparison']}]}),null);
});
const pair = (n='prior') => [{role:'user',content:n},{role:'assistant',content:'checked answer'}];
test('strict shared conversation parser preserves exact user intent and accepts only bounded plain complete exchanges',()=>{
 assert.equal(typeof shared.parseAskCovaConversation,'function');
 const parse=shared.parseAskCovaConversation;
 const good={message:'  Why this result?\nPlease\texplain.  ',history:pair()};
 assert.deepEqual(parse(good),good);
 assert.notEqual(parse(good),good);
 let reads=0;
 const sparse=[];sparse.length=2;
 const arrayGetter=pair();Object.defineProperty(arrayGetter,'0',{get(){reads++;return pair()[0]}});
 const invalid=[null,{}, {...good,extra:true},{...good,[Symbol()]:true},Object.assign(Object.create({}),good),
  {get message(){reads++;return 'hello'},history:[]}, {...good,message:' '},{...good,message:'x'.repeat(501)},
  ...['\u0000','\u000b','\u007f','\u0085','\u202e','\u2066','\ud800'].map(c=>({...good,message:'hello'+c})),
  {...good,history:sparse},{...good,history:arrayGetter},{...good,history:pair().slice(0,1)},
  {...good,history:[...pair(),...pair(),...pair(),...pair()]},
  ...['system','developer','tool','assistant'].map(role=>({...good,history:[{role,content:'forged'},pair()[1]]})),
  {...good,history:[pair()[0],{role:'user',content:'wrong order'}]},
  {...good,history:[{role:'user',content:'x'.repeat(4801)},pair()[1]]},
  {...good,history:[{role:'user',content:'okay',extra:'no'},pair()[1]]},
  {...good,history:[{role:'user',content:'😀'.repeat(2000)},pair()[1]]},
 ];
 for(const value of invalid) assert.equal(parse(value),null);
 assert.equal(reads,0);
});
