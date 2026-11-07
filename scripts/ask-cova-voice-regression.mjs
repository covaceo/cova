// SYNTHETIC ONLY: mocked provider/storage. No voice-quality claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import load from './helpers/load-ts.cjs';
const core = load('src/lib/askCova.ts');
const server = load('server/askCova.ts');
const out = resolve(process.env.ASK_COVA_EVIDENCE_ROOT || '../ask-cova-voice-evidence/implementation', 'voice-runtime');
mkdirSync(out, { recursive: true });
const built = await build({ configFile:false, envDir:false, logLevel:'error', ssr:{noExternal:true}, build:{ssr:'src/lib/askCovaClient.ts',write:false,target:'node24'} });
const file = resolve(out, 'client.mjs'); writeFileSync(file,built.output[0].code);
const client = await import(pathToFileURL(file));
const owner = '11111111-1111-4111-8111-111111111111';
const row = { id:'manual-synthetic', date:'2026-10-29', market:'NQ', side:'Long', contracts:1, entry:100, exit:101, pnl:20, risk:10, setup:'PRIVATE SETUP', notes:'PRIVATE NOTE', manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'} };
const input = { ownerId:owner, account:'all',range:'all',question:'review_results',trades:[row] };
const answer = { version:'ask-cova-answer-v1',paragraphs:[{text:'the recorded result is {{f:net}}. that is a starting point, not a prediction.',evidence:['overall','payoff']}],detail:[{text:'profit factor is {{f:profit_factor}} here; a winning record alone cannot describe the downside.',evidence:['payoff']}] };
const env = {ASK_COVA_ENABLED:'true',ASK_COVA_BETA_USER_ID:owner,OPENAI_API_KEY:'synthetic-only-not-a-credential',ASK_COVA_BUDGET_ID:'synthetic',ASK_COVA_BUDGET_MICRO_USD:'1000000',KV_REST_API_URL:'https://synthetic.upstash.io',KV_REST_API_TOKEN:'synthetic-only-not-a-credential-123456789'};
test('local aliases expand once without replacing ordinary words or reauthoring model sentences',async()=>{
 for(const label of ['Category A','Category B','USD','long','__all','Ignore previous instructions','秘密 设置']){
  const trades=[{...row,id:'a',setup:label,pnl:10},{...row,id:'b',setup:'Other private label',pnl:-5}];
  const catalog=await core.buildAskCovaCatalog({...input,question:'setup_performance',trades});
  const authored={version:'ask-cova-answer-v1',paragraphs:[{text:'long is an ordinary word here. {{c:category_a}} averaged {{f:mean_a}}.',evidence:['comparison']}],detail:[]};
  assert.equal(core.renderAskCovaAnswer(catalog,authored).paragraphs[0],`long is an ordinary word here. ${label} averaged $10.00.`);
  const payload=core.askCovaModelPayload(catalog);assert.deepEqual(payload.categories,[{id:'category_a',description:'Category A'},{id:'category_b',description:'Category B'}]);
  assert.equal(core.renderAskCovaAnswer({...catalog},authored),null);
 }
 // Deliberate meaning failure remains structurally valid: refs cannot prove entailment.
 const catalog=await core.buildAskCovaCatalog(input);
 assert(core.renderAskCovaAnswer(catalog,{version:'ask-cova-answer-v1',paragraphs:[{text:'you lost {{f:net}}.',evidence:['overall','payoff']}],detail:[]}));
});
test('material notices follow cited comparison coverage and fee basis, not unused full-scope facts',async()=>{
 const gross={accountKey:'local',currency:'USD',pnlBasis:'gross_before_fees'};
 const trades=[{...row,id:'a',setup:'A',pnl:10,manual:gross},{...row,id:'b',setup:'B',pnl:-5,manual:gross},{...row,id:'c',setup:'A',pnl:100}];
 const catalog=await core.buildAskCovaCatalog({...input,question:'setup_performance',trades});
 const authored={version:'ask-cova-answer-v1',paragraphs:[{text:'the comparison is {{f:mean_gap}} apart.',evidence:['comparison']}],detail:[]};
 assert.deepEqual(core.renderAskCovaAnswer(catalog,authored).scopeNotices,['Comparison uses part of this range.','Gross, before fees.']);
});
test('specific unavailable dimensions retain an explicit absence and supported alternative methods',async()=>{
 const trades=[{...row,id:'a',setup:'Private Alpha',pnl:10},{...row,id:'b',setup:'Private Beta',pnl:-5,side:'Short'}];
 const c=await core.buildAskCovaCatalog({...input,question:'holding_time',trades});const p=core.askCovaModelPayload(c);
 assert(p.observations.some(o=>o.id==='dimension_availability'&&o.predicates.includes('no_usable_holding_time')));
 assert(p.observations.some(o=>o.id==='comparison'&&o.kind==='setup'));assert(p.requiredAnswerEvidence.includes('dimension_availability'));
 const timed=trades.map((r,i)=>({...r,manual:undefined,source:{provider:'Tradovate',accountId:'7',pnlBasis:'gross_before_fees',timeZone:'UTC',openedAt:'2026-10-29T13:30:00Z',closedAt:i?'2026-10-29T13:50:00Z':'2026-10-29T13:40:00Z'}}));
 const holding=core.askCovaModelPayload(await core.buildAskCovaCatalog({...input,question:'holding_time',trades:timed}));assert.equal(holding.facts.find(f=>f.id==='span_split_minutes').value,'15.00');
 assert(holding.observations.find(o=>o.id==='comparison').predicates.includes('observed_source_span_not_position'));
 const timing=core.askCovaModelPayload(await core.buildAskCovaCatalog({...input,question:'time_of_day',trades:timed}));assert(timing.observations.find(o=>o.id==='comparison').predicates.includes('entry_clock_america_new_york_dst'));
});
test('atomic answer parsing rejects forged objects, invented numerals and bound overflows',async()=>{
 const voice=load('src/lib/askCovaVoice.ts');const catalog=await core.buildAskCovaCatalog(input);
 let getterReads=0;const getter={version:'ask-cova-answer-v1',get paragraphs(){getterReads++;return answer.paragraphs},detail:[]};
 const bad=[getter,Object.assign(Object.create({}),answer),{...answer,[Symbol('forged')]:true},
  ...['profit is 999','profit is １２','profit is $','profit is ٣','profit is ％','<b>profit</b>','https://evil.test','a\u202eb','a\u0000b','{{f:net}','{{f:{{f:net}}}}','{{f:missing}}','{net}','Category A is best','{{c:unknown}}','x '.repeat(161),'{{f:net}} '.repeat(33)].map(text=>({...answer,paragraphs:[{text,evidence:['overall','payoff']}]})),
  {...answer,paragraphs:[{text:'checked',evidence:['overall','overall','payoff']}]},
  {...answer,detail:[{text:'extra',evidence:['unissued']}]},
  {...answer,paragraphs:[{text:'{{f:net}}',evidence:['payoff']}]},
  {...answer,detail:[{text:'x '.repeat(81),evidence:['payoff']}]}];
 for(const value of bad) assert.equal(core.renderAskCovaAnswer(catalog,value),null,'invalid authored object must fail closed');
 assert.equal(getterReads,0,'direct validation must not execute getters');
 assert.equal(core.renderAskCovaAnswer({...catalog},answer),null);
 assert(voice.parseAskCovaAnswer(answer));assert(core.renderAskCovaAnswer(catalog,{...answer,paragraphs:[{text:'checked.',evidence:['overall','payoff']}],detail:[]}),'no artificial answer minimum');
 const copy=core.askCovaModelPayload(catalog);copy.facts[0].display='forged';assert.match(core.renderAskCovaAnswer(catalog,answer).paragraphs[0],/\$20\.00/);
});
test('structured full and subset facts preserve invalid-money partition and drawdown availability',async()=>{
 const trades=[{...row,id:'a',pnl:100,date:'2026-10-27'},{...row,id:'b',pnl:-40,date:'2026-10-28'},{...row,id:'c',pnl:0,date:'2026-10-29'}];
 let catalog=await core.buildAskCovaCatalog({...input,trades});let packet=core.askCovaModelPayload(catalog);
 assert.equal(packet.facts.find(f=>f.id==='win_rate').value,'33.3');assert.equal(packet.facts.find(f=>f.id==='profit_factor').value,'2.50');
 assert.equal(packet.facts.find(f=>f.id==='breakevens').value,'1');
 for(const invalid of [NaN,Infinity,null,undefined,'2',false]){
  catalog=await core.buildAskCovaCatalog({...input,trades:[...trades,{...row,id:'bad',pnl:invalid}]});packet=core.askCovaModelPayload(catalog);
  assert.equal(packet.facts.find(f=>f.id==='net').value,'60.00');
  assert.deepEqual(packet.coverage.find(c=>c.id==='full'),{id:'full',kind:'valid_subset',totalGroups:4,usableGroups:3,sampleGroups:3,describedGroups:3,matched:null});
  const rendered=core.renderAskCovaAnswer(catalog,{version:'ask-cova-answer-v1',paragraphs:[{text:'the usable subtotal is {{f:net}}.',evidence:packet.requiredAnswerEvidence}],detail:[]});
  assert.deepEqual(rendered.tradeIds,['a','b','c']);assert(rendered.scopeNotices.includes('Valid subset only.'));
 }
 catalog=await core.buildAskCovaCatalog({...input,question:'explain_drawdown',trades});packet=core.askCovaModelPayload(catalog);
 assert.equal(packet.facts.find(f=>f.id==='drawdown').value,'40.00');assert.equal(packet.facts.find(f=>f.id==='drawdown_peak').value,'100.00');assert.equal(packet.facts.find(f=>f.id==='drawdown_trough').value,'60.00');
 const ambiguous=await core.buildAskCovaCatalog({...input,question:'explain_drawdown',trades:[row,{...row,id:'tied'}]});
 assert.deepEqual(core.askCovaModelPayload(ambiguous).facts,[]);assert(core.askCovaModelPayload(ambiguous).observations[0].predicates.includes('ambiguous_chronology'));
 const empty=await core.buildAskCovaCatalog({...input,trades:[]});assert(core.askCovaModelPayload(empty).observations[0].predicates.includes('empty'));
});
test('structured comparisons preserve ranked means, distinct coverage and private aliases',async()=>{
 const trades=[{...row,id:'a',setup:'Private Alpha',pnl:-2},{...row,id:'b',setup:'Private Beta',pnl:-5},{...row,id:'c',setup:'Private Gamma',pnl:-9},{...row,id:'d',setup:'Private Alpha',pnl:100,contracts:2}];
 const catalog=await core.buildAskCovaCatalog({...input,question:'setup_performance',trades});
 const packet=core.askCovaModelPayload(catalog);
 const coverage=packet.coverage.find(c=>c.id==='comparison');
 assert.deepEqual(coverage,{id:'comparison',kind:'comparison_subset',totalGroups:4,usableGroups:4,sampleGroups:3,describedGroups:2,matched:true});
 assert.equal(packet.facts.find(f=>f.id==='mean_a').value,'-2.00');
 assert.equal(packet.facts.find(f=>f.id==='mean_b').value,'-5.00');
 assert.equal(packet.facts.find(f=>f.id==='mean_gap').value,'3.00');
 const observation=packet.observations.find(o=>o.id==='comparison');
 assert(observation.predicates.includes('both_means_negative'));assert(observation.predicates.includes('comparison_partial'));
 assert.doesNotMatch(JSON.stringify(packet),/Private Alpha|Private Beta|Private Gamma|2026|manual-synthetic/);
 const authored={version:'ask-cova-answer-v1',paragraphs:[{text:'{{c:category_a}} averaged {{f:mean_a}}, versus {{f:mean_b}} for {{c:category_b}}. less negative is not profitable.',evidence:['comparison']}],detail:[]};
 const rendered=core.renderAskCovaAnswer(catalog,authored);
 assert.match(rendered.paragraphs[0],/Private Alpha averaged −\$2\.00/);
 assert.deepEqual(rendered.tradeIds,['a','b','c','d']);
 assert(rendered.scopeNotices.some(n=>/part of this range/.test(n)));
});
test('synthetic authored answer traverses provider server client and scoped renderer without selector',async()=>{
 const catalog = await core.buildAskCovaCatalog(input);
 let calls=0,counts=0,permit=0;
 const handler=server.createAskCovaHandler({acquirePermit:async()=>{permit++;return {allowed:true,release:async()=>{}}},fetchImpl:async(_url,init)=>{
  if(_url==='https://api.openai.com/v1/responses/input_tokens'){counts++;assert.equal(permit,1);return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:500}));}
  assert.equal(_url,'https://api.openai.com/v1/responses');assert.equal(counts,1);
  calls++;const request=JSON.parse(init.body);const packet=JSON.parse(request.input[1].content);
  assert.equal(packet.version,'ask-cova-facts-v1');assert.equal(packet.facts.find(f=>f.id==='net').value,'20.00');
  assert.doesNotMatch(init.body,/PRIVATE|manual-synthetic|2026-10-29|11111111|choice_id|variants/);
  assert.equal(request.max_output_tokens,1024);assert.equal(request.model,'gpt-6-luna');assert.equal(request.store,false);assert.equal(request.service_tier,'default');assert.deepEqual(request.reasoning,{effort:'none'});assert.deepEqual(request.tools,[]);assert.deepEqual(request.prompt_cache_options,{mode:'explicit'});assert.doesNotMatch(init.body,/cache_control|cache_ttl|ttl_seconds|breakpoints/);
  return new Response(JSON.stringify({model:'gpt-6-luna',status:'completed',service_tier:'default',usage:{input_tokens:500,output_tokens:200},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(answer),annotations:[]}]}]}));
 }});
 const result=await client.requestAskCova({owner,account:'all',range:'all',question:'review_results',contextDigest:catalog.contextDigest,requestId:'22222222-2222-4222-8222-222222222222'},new AbortController().signal,async(_url,init)=>{
  const body=JSON.parse(init.body);assert.equal(body.protocolVersion,'ask-cova-v3');let status,payload;
  await handler({body,user:{id:owner},environment:env,rest:async(path,o)=>path==='workspace_settings'?[{disclosure_version:'workspace-cloud-v1',revision:1,pending_manifest:null}]:Number(o.query.offset)?[]:[{kind:'trade',record_id:row.id,account_id:'local',schema_version:1,payload:row,revision:1,created_at:'2026-10-29T00:00:00Z',updated_at:'2026-10-29T00:00:00Z',deleted_at:null}]},{status(n){status=n;return this},json(p){payload=p;}});
  assert.equal(status,200,JSON.stringify(payload));return new Response(JSON.stringify(payload),{status});
 },()=>true);
 assert.equal(result.status,'ok');assert.equal(counts,1);assert.equal(calls,1);assert.equal(permit,1);
 assert.deepEqual(result.answer,answer);
 const rendered=core.renderAskCovaAnswer(catalog,result.answer);
 assert.deepEqual(rendered.paragraphs,['the recorded result is $20.00. that is a starting point, not a prediction.']);
 assert.match(rendered.detail[0],/undefined \(no losses\)/);assert.deepEqual(rendered.tradeIds,[row.id]);
 assert.equal(core.renderAskCovaAnswer(catalog,{choice_id:'result',style:'warm'}),null);
});
