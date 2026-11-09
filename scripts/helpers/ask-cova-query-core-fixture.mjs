// SYNTHETIC ONLY: fixed test plans, not language interpretation or model quality.
// Every accepted response is computed by the real snapshot/query/answer core and
// replayed again by the real v4 client. Never returns a pre-rendered fake reply.
import {buildAskCovaDataContext} from '../../src/lib/askCovaData.ts';
import {executeAskCovaQuery} from '../../src/lib/askCovaQuery.ts';
import {renderAskCovaQueryAnswer,askCovaQueryHistoryText} from '../../src/lib/askCovaQueryAnswer.ts';
import {tradeAccountKey} from '../../src/lib/tradovateHistory.ts';
export function syntheticSnapshot(owner,trades,workspaceRecords){
 const stamp='2026-10-30T16:00:00.000Z';
 return {version:'ask-cova-data-v1',owner,workspaceRevision:1,workspaceRecords:workspaceRecords||trades.map(t=>({kind:'trade',recordId:t.id,accountId:tradeAccountKey(t),schemaVersion:1,payload:t,revision:1,createdAt:stamp,updatedAt:stamp,deletedAt:null})),passportPlans:[],passportReviews:[],passportRewards:[],complete:{workspace:true,passportPlans:true,passportReviews:true,passportRewards:true}};
}
const aggregate=(id,where=[],groupBy=[],measures=[{id:'net',op:'sum',field:'reported_pnl'},{id:'n',op:'count',field:null},{id:'wins',op:'win_rate',field:'reported_pnl'},{id:'pf',op:'profit_factor',field:'reported_pnl'}])=>({id,op:'aggregate',source:'trades',where,groupBy,measures,orderBy:[],mode:'complete',limit:32});
const predicate=(field,op,type,value)=>({field,op,value:{type,value}});
export async function syntheticQueryWire(input,snapshot,options={}){
 const context=await buildAskCovaDataContext({snapshot,account:input.account,range:input.range,conversation:input.conversation});
 const message=input.conversation.message;
 const comparison=/holding time|setup works|trade best|shorting or longing/i.test(message);
 const drawdown=options.choice==='drawdown'||/drawdown/i.test(message);
 let queries=[aggregate('summary')];
 if(drawdown)queries=[{id:'decline',op:'sequence',source:'trades',where:[],metric:'reported_drawdown',order:'verified_close',mode:'complete',limit:1}];
 if(comparison){
  const field=/holding time/i.test(message)?'source_span_minutes':/trade best/i.test(message)?'entry_clock_ny':/setup works/i.test(message)?'analytic_setup':'side';
  const type=['source_span_minutes','entry_clock_ny'].includes(field)?'decimal':'text';
  const threshold=field==='source_span_minutes'?'10':field==='entry_clock_ny'?'720':field==='side'?'Long':'PRIVATE SETUP A';
  const measures=[{id:'mean',op:'mean',field:'reported_pnl'},{id:'n',op:'count',field:null}];
  queries=[aggregate('a',[[predicate(field,type==='decimal'?'lte':'eq',type,threshold)]],[],measures),aggregate('b',[[predicate(field,type==='decimal'?'gt':'ne',type,threshold)]],[],measures)];
 }
 const plan={version:'ask-cova-query-plan-v1',decision:{kind:'query',queries}};
 const result=await executeAskCovaQuery(context,plan);
 const observation=result.observations[0];
 const cell=(field,obs=observation)=>result.cells.find(c=>c.field===field&&obs.facts.includes(c.id));
 const token=(field,obs=observation)=>{const c=cell(field,obs);if(c.value!==null)return '{{f:'+c.id+'}}';if(c.unavailableReason==='no_losses')return 'undefined (no losses)';return 'unavailable in these saved records';};
 let text,detail;
 if(comparison){const a=result.observations.find(o=>o.query==='a'),b=result.observations.find(o=>o.query==='b');text='mean a: '+token('mean',a)+'; mean b: '+token('mean',b)+'; count a: '+token('n',a)+'; count b: '+token('n',b)+'.';detail='These are descriptive saved-record comparisons, not a forecast.';}
 else if(drawdown){text='The checked reported drawdown is '+token('reported_drawdown')+'.';detail='the supporting value is '+token('reported_drawdown')+'.';}
 else if(!snapshot.workspaceRecords.some(r=>r.kind==='trade'&&!r.deletedAt)){text='Log or import a completed trade to review saved results.';detail='There are no saved trades in this view.';}
 else {text='Your saved result is '+token('net')+'; win rate: '+token('wins')+'; profit factor: '+token('pf')+'.';detail='the supporting value is '+token('net')+'.';}
 const evidence=comparison?result.observations.map(o=>o.id):[observation.id];
 let answer={version:'ask-cova-answer-v2',paragraphs:[{text,evidence}],detail:options.detail===false?[]:[{text:detail,evidence}]};
 if(options.voice)answer={version:'ask-cova-answer-v2',paragraphs:[{text:'a modest result: '+token('net')+'.',evidence},{text:'the downside is still an open question here.',evidence}],detail:options.detail===false?[]:[{text:'without losing groups, profit factor is '+token('pf')+'.',evidence}]};
 if(options.longAnswer)answer.paragraphs[0].text+=' '+'漢'.repeat(1400);
 if(options.utf8)answer.paragraphs[0].text+=' '+'漢'.repeat(1400);
 if(options.choice==='invented_choice')answer.paragraphs[0].evidence=['unknown'];
 return {wire:{status:'ok',aiResponseUsed:true,protocolVersion:'ask-cova-v4',requestId:input.requestId,snapshotDigest:context.snapshotDigest,contextDigest:context.contextDigest,plan,planDigest:result.planDigest,resultDigest:result.resultDigest,answer},result,rendered:renderAskCovaQueryAnswer(result,answer),historyText:askCovaQueryHistoryText(result,answer)};
}
