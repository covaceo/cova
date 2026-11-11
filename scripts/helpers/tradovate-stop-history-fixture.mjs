import assert from 'node:assert/strict';
import { encryptSecret } from '../../api/_lib/encryption.js';
import handler from '../../api/tradovate/sync.js';
// Entirely synthetic raw entity fixtures. Not a reproduction of a private trade.
export const at = minute => `2026-01-05T10:${minute}:00.000Z`;
export const selection = { diagnostic:'stop-history', connectionId:'synthetic-connection', accountId:'71', tradeId:'tradovate-71:501:502', contractSymbol:'MESM6', openedAt:at('01'), closedAt:at('09'), side:'Long', quantity:'1', entry:'6000', exit:'6005' };
export const json = (v,status=200) => new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
export function fixtures() {
  const order = (id,action,timestamp) => ({ id,accountId:71,contractId:81,action,timestamp,ordStatus:'Filled',admin:false,clOrdId:'private-provider-string' });
  const command = (id,orderId,commandType,timestamp) => ({id,orderId,commandType,timestamp,commandStatus:'AtExecution',senderId:9999});
  return {
    '/account/list': [{id:71,name:'private-provider-string'}],
    '/order/deps?masterid=71': [order(101,'Buy',at('00')),order(102,'Sell',at('08')),order(103,'Sell',at('02'))],
    '/contract/item?id=81': {id:81,name:'MESM6',productId:901,private:'private-provider-string'},
    '/fill/deps?masterid=101': [{id:501,orderId:101,contractId:81,action:'Buy',timestamp:at('01'),qty:1,price:6000,active:true}],
    '/fill/deps?masterid=102': [{id:502,orderId:102,contractId:81,action:'Sell',timestamp:at('09'),qty:1,price:6005,active:true}],
    '/fill/deps?masterid=103': [],
    '/command/deps?masterid=101': [], '/command/deps?masterid=102': [],
    '/command/deps?masterid=103': [command(301,103,'New',at('02')),command(302,103,'Modify',at('04'))],
    '/orderVersion/deps?masterid=101': [], '/orderVersion/deps?masterid=102': [],
    '/orderVersion/deps?masterid=103': [{id:301,orderId:103,orderType:'Stop',orderQty:1,stopPrice:5990,text:'private-provider-string'},{id:302,orderId:103,orderType:'Stop',orderQty:1,stopPrice:5995}],
    '/commandReport/deps?masterid=301': [{id:401,commandId:301,timestamp:at('02'),commandStatus:'AtExecution',text:'private-provider-string'}],
    '/commandReport/deps?masterid=302': [],
    '/executionReport/deps?masterid=301': [{id:601,commandId:301,orderId:103,accountId:71,contractId:81,timestamp:at('03'),action:'Sell',execType:'New',ordStatus:'Working',name:'private-provider-string'}],
    '/executionReport/deps?masterid=302': [],
  };
}
export async function run(options={}) {
  const originalFetch=globalThis.fetch, originalTimer=globalThis.setTimeout, env={...process.env};
  const data=fixtures(); options.mutate?.(data);
  const calls=[],unexpected=[]; let releases=0;
  Object.assign(process.env,{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',COVA_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:'synthetic-redis-token'.repeat(3),TRADOVATE_API_BASE_URL:options.base||'https://demo.tradovateapi.com/v1'});
  const req={method:'GET',query:{...selection,...options.query},headers:{authorization:'Bearer synthetic-cova-token',cookie:'cova_tradovate_connection=synthetic-connection','x-forwarded-for':'203.0.113.7'}};
  for (const key of options.omitQuery || []) delete req.query[key];
  if(options.anonymous) delete req.headers.authorization;
  const res={statusCode:200,headers:{},status(c){this.statusCode=c;return this},json(b){this.body=b;return this},setHeader(k,v){this.headers[k.toLowerCase()]=v}};
  globalThis.setTimeout=(fn,delay,...args)=>{const t=originalTimer(fn,options.timeout && [25000,12000].includes(delay)?15:delay,...args); if(options.timeout)t.unref=()=>t;return t;};
  globalThis.fetch=async (url,init={})=>{
    const target=String(url);calls.push({target,init});
    if(target.endsWith('/auth/v1/user'))return json({id:'synthetic-owner',app_metadata:{plan:options.plan||'pro'}});
    if(target.includes('/rest/v1/policy_acceptances?'))return json([{id:'synthetic-policy'}]);
    if(target===process.env.KV_REST_API_URL){const body=JSON.parse(init.body); if(body[0]==='EVAL' && String(body[1]).includes("'DEL'")){releases++;return json({result:1})} return json({result:body[0]==='SET'?'OK':[1,1]});}
    if(target.includes('/rest/v1/broker_connections?')){
      assert.equal(new URL(target).searchParams.get('user_id'),'eq.synthetic-owner');
      assert.equal(new URL(target).searchParams.get('id'),'eq.synthetic-connection');
      assert(!init.method||init.method==='GET','No credential cleanup/write');
      return json(options.wrongOwner?[]:[{access_token_encrypted:encryptSecret('synthetic-provider-token'),expires_at:options.expired?'2000-01-01T00:00:00Z':'2099-01-01T00:00:00Z'}]);
    }
    const u=new URL(target), key=u.pathname.replace(/^\/v1/,'')+u.search;
    assert.equal(u.origin,'https://demo.tradovateapi.com');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert(init.signal);assert.equal(init.headers.Authorization,'Bearer synthetic-provider-token');
    if(options.stall===key)return new Promise(()=>{});
    if(options.response?.[key])return options.response[key]();
    if(Object.hasOwn(data,key))return json(data[key]);
    unexpected.push(key);throw Error('Unexpected synthetic request');
  };
  try {await handler(req,res)} finally {globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer; for(const k of Object.keys(process.env))if(!Object.hasOwn(env,k))delete process.env[k];Object.assign(process.env,env)}
  assert.deepEqual(unexpected,[],'No unintended calls or ledger paths');
  for(const call of calls) {
    if(call.target=== 'https://fixture.upstash.io') continue; // Existing rate-limit lease only.
    assert(!call.init.method||call.init.method==='GET','No provider, ledger or credential mutations');
    assert.doesNotMatch(call.target,/workspace|cash|requestreport|placeorder|modifyorder|cancelorder/i);
    if(call.target.includes('tradovateapi.com')) {assert.equal(call.init.method,'GET');assert.equal(call.init.redirect,'error');assert.equal(new URL(call.target).origin,'https://demo.tradovateapi.com');}
  }
  assert.doesNotMatch(JSON.stringify(res.body),/private-provider-string|synthetic-provider-token|synthetic-cova-token|synthetic-connection|senderId|clOrdId/);
  assert.equal(res.body.trades,undefined);assert.equal(res.body.csv,undefined);assert.equal(res.body.risk,undefined);
  assert.equal(res.headers['cache-control'],'private, no-store');
  const provider=calls.filter(c=>c.target.includes('tradovateapi.com'));
  return {res,provider,calls,releases};
}
