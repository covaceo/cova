import assert from 'node:assert/strict';
import handler from '../api/tradovate/sync.js';
import { encryptSecret } from '../api/_lib/encryption.js';
const env = { ...process.env }, nativeFetch = globalThis.fetch, nativeTimer = globalThis.setTimeout;
const header = 'symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration';
const text = `${header}\r\nMNQZ6,-2,0,0.25,101,102,1,20000,20005,$10.00,11/02/2026 00:00:00,11/02/2026 00:00:05,5sec\r\n`;
const definition = { name: 'Performance', params: Object.entries({startDate:'Date',endDate:'Date',startTime:'Time',endTime:'Time',account:'accounts',contract:'contracts'}).map(([name,paramType]) => ({name,paramType,optional:['startTime','endTime','contract'].includes(name)})) };
const json = (body, status=200) => new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json'}});
let cases=0;
async function run(options={}) {
  const calls=[], redis=[[1,1],'OK',1];
  const query={history:'recent',startDate:'2026-11-01',endDate:'2026-11-03',...options.query};
  const req={method:'GET',query,headers:{authorization:'Bearer fixture-user',cookie:'cova_tradovate_connection=fixture-connection','x-forwarded-for':'203.0.113.7'}};
  if(options.anonymous) delete req.headers.authorization;
  const res={statusCode:200,headers:{},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;}};
  process.env.TRADOVATE_API_BASE_URL=options.base || 'https://demo.tradovateapi.com/v1';
  globalThis.setTimeout=(fn,delay,...args)=>{const timer=nativeTimer(fn,options.timeout && delay===25000?20:delay,...args); if(options.timeout) timer.unref=()=>timer;return timer;};
  globalThis.fetch=async(url,init={})=>{
    const target=String(url);calls.push({target,init});
    if(target.endsWith('/auth/v1/user'))return json({id:'fixture-owner',app_metadata:{plan:options.plan || 'pro'}});
    if(target.includes('/policy_acceptances?'))return json([{id:'fixture-consent'}]);
    if(target===process.env.KV_REST_API_URL)return json({result:redis.shift()});
    if(target.includes('/broker_connections?')){
      assert.equal(new URL(target).searchParams.get('user_id'),'eq.fixture-owner');
      assert(!init.method || init.method==='GET');
      return json(options.missing?[]:[{access_token_encrypted:encryptSecret('fixture-provider-token'),expires_at:options.expired?'2000-01-01T00:00:00Z':'2099-01-01T00:00:00Z'}]);
    }
    assert.equal(init.headers.Authorization,'Bearer fixture-provider-token');assert.equal(init.redirect,'error');
    if(options.timeout)return new Promise(()=>{});
    if(target.endsWith('/requestReportDefinitions'))return json({reports:options.cash?[definition,{...definition,name:'Cash History'}]:[definition]});
    if(target.endsWith('/account/list'))return json(options.accounts || [{id:71,name:'Synthetic A',active:true},{id:72,name:'Synthetic B',active:true}]);
    if(target.endsWith('/requestreport')){
      const body=JSON.parse(init.body);assert.equal(init.method,'POST');
      if(body.name==='Cash History') {
        assert.equal(body.template,undefined);assert.equal(body.timezone,0);assert.equal(body.params.find(p=>p.name==='account').value,'Synthetic A');
        return json(options.cashBad?{error:'fixture-private-rejection'}:{data:'Account,Transaction ID,Timestamp,Date,Delta,Amount,Cash Change Type,Currency,Contract\r\nSynthetic A,1,11/02/2026 00:00:00,2026-11-02,-1.21,998.79, Commission,USD,MNQZ6\r\nSynthetic A,2,11/02/2026 00:00:05,2026-11-02,10.00,"1,008.79", Trade Paired,USD,MNQZ6\r\n'});
      }
      assert.equal(body.template,'Flex.html');assert.equal(body.timezone,0);
      assert.equal(body.params.find(p=>p.name==='startDate').value,'11/01/2026');
      const name=body.params.find(p=>p.name==='account').value;assert(['Synthetic A','Synthetic B'].includes(name));
      if(options.reject && name==='Synthetic B')return json({error:'fixture-private-rejection'},403);
      if(options.oversized)return new Response('x',{headers:{'content-type':'application/json','content-length':'9999999'}});
      return json({data:options.bad?text.replace('$10.00','$11.00'):options.empty?`${header}\r\n`:options.hourly?text.replace('00:00:05','01:02:04').replace(',5sec',',1h 2min 3sec'):text});
    }
    throw new Error('Unexpected network path '+target);
  };
  await handler(req,res);
  const provider=calls.filter(c=>c.target.includes('tradovateapi.com'));
  assert(provider.length<=6);
  if(provider.length)assert(provider.every(c=>c.init.signal===provider[0].init.signal && c.init.signal.aborted));
  if(calls.some(c=>c.target.includes('broker_connections')))assert.equal(redis.length,0);
  assert.equal(res.headers['cache-control'],'private, no-store');
  assert.doesNotMatch(JSON.stringify(res.body),/fixture-provider-token|fixture-private-rejection/);
  cases++;return {res,provider};
}
try {
  Object.assign(process.env,{SUPABASE_URL:'https://fixture.supabase.test',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',COVA_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:'fixture-redis-'.repeat(4)});
  const ok=await run();assert.equal(ok.res.body.status,'history_ready',JSON.stringify(ok.res.body));
  assert.deepEqual(ok.res.body.accounts.map(a=>a.status),['ready','ready']);
  assert.notEqual(ok.res.body.accounts[0].trades[0].id,ok.res.body.accounts[1].trades[0].id);
  assert.equal(ok.res.body.accounts[0].trades[0].date,'2026-11-02T00:00:05.000Z');
  const hourly=await run({hourly:true});assert.deepEqual(hourly.res.body.accounts.map(a=>a.status),['ready','ready']);assert(hourly.res.body.accounts.every(a=>a.trades[0].source.closedAt==='2026-11-02T01:02:04.000Z'));
  const empty=await run({empty:true});assert(empty.res.body.accounts.every(a=>a.status==='empty' && a.trades.length===0));
  const partial=await run({reject:true});assert.equal(partial.res.body.accounts[0].status,'ready');assert.equal(partial.res.body.accounts[1].status,'failed');assert.equal(partial.res.body.accounts[1].csv,undefined);
  const bad=await run({bad:true});assert(bad.res.body.accounts.every(a=>a.status==='failed' && !a.csv));
  for(const options of [{anonymous:true},{plan:'free'},{missing:true},{expired:true},{base:'https://live.tradovateapi.com/v1'},{query:{startDate:'bad'}},{query:{startDate:'2026-01-01'}},{query:{accountId:'999'}},{query:{history:['recent']}}]) {const denied=await run(options);assert(!denied.res.body.accounts?.some(a=>a.status==='ready'));}
  for(const options of [{timeout:true},{oversized:true}]) {const result=await run(options);assert(!result.res.body.accounts?.some(a=>a.status==='ready'));}
  const net=await run({cash:true,query:{accountId:'71'}});assert.equal(net.res.body.accounts?.[0]?.cash?.netCents,879);assert.equal(net.res.body.accounts[0].trades[0].pnl,10,'Gross ledger remains intact');
  const missingCash=await run({cash:true,cashBad:true,query:{accountId:'71',cash:'1'}});assert.equal(missingCash.res.body.accounts[0].status,'ready');assert.equal(missingCash.res.body.accounts[0].cash.status,'unavailable');
  console.log(`Tradovate automatic history: ${cases} actual-handler cases passed`);
} finally {globalThis.fetch=nativeFetch;globalThis.setTimeout=nativeTimer;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);}
