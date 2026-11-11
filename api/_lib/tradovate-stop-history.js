// Read-only acquisition. Never an original-stop selector or ledger enrichment adapter.
const ORIGIN = 'https://demo.tradovateapi.com/v1';
const LIMITS = Object.freeze({ requests: 160, bytes: 2_097_152, responseBytes: 262_144, rows: 4000, orders: 24, contracts: 16, commands: 48, milliseconds: 12000, outputBytes: 524_288 });
const ORDER_STATUS = ['Canceled','Completed','Expired','Filled','PendingCancel','PendingNew','PendingReplace','Rejected','Suspended','Unknown','Working'];
const COMMAND_STATUS = ['AtExecution','ExecutionRejected','ExecutionStopped','ExecutionSuspended','OnHold','Pending','PendingExecution','Replaced','RiskPassed','RiskRejected'];
const ORDER_TYPE = ['Limit','LimitIfTouched','MIT','Market','MarketLimit','MarketStopWithProtection','MarketWithProtection','QTS','Stop','StopLimit','TrailingStop','TrailingStopLimit'];
const EXEC_TYPE = ['Canceled','Completed','DoneForDay','Expired','New','OrderStatus','PendingCancel','PendingNew','PendingReplace','Rejected','Replaced','Stopped','Suspended','Trade','TradeCancel','TradeCorrect'];
class Failure extends Error { constructor(reason) { super(reason); this.reason = reason; } }
const fail = reason => { throw new Failure(reason); };
const object = v => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail('invalid_entity'); return v; };
function id(v) {
  if (typeof v === 'number') { if (!Number.isSafeInteger(v)) fail('invalid_id'); v = String(v); }
  if (typeof v !== 'string' || !/^[1-9]\d{0,18}$/.test(v) || BigInt(v) > 9223372036854775807n) fail('invalid_id');
  return v;
}
function time(v) {
  if (typeof v !== 'string' || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(v) || !Number.isFinite(Date.parse(v))) fail('invalid_timestamp');
  const iso = new Date(v).toISOString();
  if (iso.slice(0,19) !== v.slice(0,19)) fail('invalid_timestamp');
  return `${v.slice(0,19)}.${(v.split(".")[1]?.slice(0,-1)||"").padEnd(9,"0")}Z`;
}
const price = v => { if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e9) fail('invalid_price'); return v; };
const qty = v => { if (!Number.isSafeInteger(v) || v <= 0 || v > 100000) fail('invalid_quantity'); return v; };
const en = (v, list) => list.includes(v) ? v : 'Unknown';
function action(v) { if (!['Buy','Sell'].includes(v)) fail('invalid_action'); return v; }
function edges(row, accountId, orderId, contractId, commandId) {
  for (const [key, expected] of Object.entries({ accountId, orderId, contractId, commandId })) {
    if (row[key] !== undefined && expected !== undefined && id(row[key]) !== expected) fail('foreign_edge');
  }
}
// Tokenize rather than coerce parsed doubles: decimal int64 IDs survive JSON losslessly.
function parseJson(raw) {
  let key, previous, rewritten = '';
  const objects=[];
  const tokens = raw.match(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|\s+|./gs) || [];
  for (const token of tokens) {
    if (/^\s+$/.test(token)) { rewritten += token; continue; }
    if(token==='{')objects.push(new Set());
    if(token==='[')objects.push(null);
    if(token==='}'||token===']')objects.pop();
    if (token === ':') {
      key = previous?.startsWith('"') ? JSON.parse(previous) : undefined;
      const keys=objects[objects.length-1];
      if(keys?.has(key))fail('duplicate_json_key');
      keys?.add(key);
    }
    else if (/^-?\d/.test(token) && typeof key === 'string' && /^(?:id|.*Id)$/.test(key)) { rewritten += JSON.stringify(token); key = undefined; previous = token; continue; }
    else key = undefined;
    rewritten += token; previous = token;
  }
  try { return JSON.parse(rewritten); } catch { fail('invalid_json'); }
}
function selectionFrom(query) {
  const keys = ['diagnostic','connectionId','accountId','tradeId','contractSymbol','openedAt','closedAt','side','quantity','entry','exit'];
  if (keys.filter(k=>k!=='contractSymbol').some(k => typeof query[k] !== 'string') || Object.hasOwn(query,'contractSymbol') && typeof query.contractSymbol !== 'string' || Object.keys(query).some(k => !keys.includes(k)) || query.diagnostic !== 'stop-history') fail('invalid_request');
  const accountId = id(query.accountId);
  const pair = /^tradovate-([1-9]\d{0,18}):([1-9]\d{0,18}):([1-9]\d{0,18})$/.exec(query.tradeId);
  if (!pair || id(pair[1]) !== accountId || id(pair[2]) === id(pair[3])) fail('invalid_trade');
  if (query.contractSymbol !== undefined && !/^[A-Z0-9]{1,12}[FGHJKMNQUVXZ]\d{1,4}$/.test(query.contractSymbol) || !['Long','Short'].includes(query.side)) fail('invalid_trade');
  const openedAt = time(query.openedAt), closedAt = time(query.closedAt);
  if (openedAt >= closedAt || Date.parse(closedAt) > Date.now() || Date.parse(closedAt)-Date.parse(openedAt) > 7*86400000) fail('invalid_trade_window');
  if (!/^[1-9]\d{0,5}$/.test(query.quantity) || ![query.entry,query.exit].every(v => /^-?\d{1,10}(?:\.\d{1,10})?$/.test(v))) fail('invalid_trade');
  return {accountId,tradeId:query.tradeId,contractSymbol:query.contractSymbol,openedAt,closedAt,side:query.side,quantity:qty(Number(query.quantity)),entry:price(Number(query.entry)),exit:price(Number(query.exit)),buyFillId:id(pair[2]),sellFillId:id(pair[3])};
}
export async function collectTradovateStopHistory(token, query, parentSignal) {
  const controller = new AbortController(), signal = controller.signal;
  const abort = () => controller.abort();
  parentSignal.addEventListener('abort', abort, {once:true});
  if (parentSignal.aborted) abort();
  const timer = setTimeout(abort, LIMITS.milliseconds); timer.unref?.();
  let reader, requests = 0, bytes = 0, rows = 0;
  const aborted = new Promise((_, reject) => { signal.addEventListener('abort', () => reject(new Failure('timeout')), {once:true}); if(signal.aborted)reject(new Failure('timeout')); });
  const seen = new Map();
  function list(v, entity) {
    if (!Array.isArray(v)) fail('invalid_collection');
    rows += v.length; if (rows > LIMITS.rows) fail('row_limit');
    const ids = seen.get(entity) || new Set(); seen.set(entity, ids);
    for (const row of v) { object(row); const key=id(row.id); if(ids.has(key))fail('duplicate_id'); ids.add(key); }
    return v;
  }
  async function request(path, optional = false) {
    signal.throwIfAborted(); if (++requests > LIMITS.requests) fail('request_limit');
    const response = await fetch(`${ORIGIN}${path}`, {method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',signal});
    signal.throwIfAborted();
    if(optional && [404,405].includes(response.status)){ void response.body?.cancel?.().catch(()=>{}); return null; }
    if(!response.ok) { void response.body?.cancel?.().catch(()=>{}); fail('upstream_rejected'); }
    if(String(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase() !== 'application/json') fail('unsupported_media');
    const declared=Number(response.headers.get('content-length')||0);
    if(declared>LIMITS.responseBytes || bytes+declared>LIMITS.bytes)fail('byte_limit');
    reader=response.body?.getReader?.(); if(!reader)fail('empty_response');
    const chunks=[];let size=0;
    try { while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.byteLength;bytes+=value.byteLength;if(size>LIMITS.responseBytes||bytes>LIMITS.bytes)fail('byte_limit');chunks.push(Buffer.from(value));} }
    finally { try{void Promise.resolve(reader.cancel()).catch(()=>{});}catch{} reader=undefined; }
    const result=parseJson(Buffer.concat(chunks,size).toString('utf8'));
    if(result && !Array.isArray(result) && ['error','errorText','errorMessage','errorCode','errors'].some(k=>Object.hasOwn(result,k)))fail('provider_error');
    return result;
  }
  async function execute() {
    let base;try{base=new URL(process.env.TRADOVATE_API_BASE_URL||'');}catch{fail('unsupported_environment');}
    if(base.origin!=='https://demo.tradovateapi.com'||!['/v1','/v1/'].includes(base.pathname)||base.username||base.password||base.search||base.hash)fail('unsupported_environment');
    if(typeof token!=='string'||!token||token.length>65536||token!==token.trim()||/[\x00-\x1f\x7f]/.test(token))fail('invalid_credential');
    const selection=selectionFrom(query);
    const accounts=list(await request('/account/list'),'account');
    if(!accounts.some(a=>id(a.id)===selection.accountId))fail('account_not_owned');
    const allOrders=list(await request(`/order/deps?masterid=${selection.accountId}`),'order').map(row=>{
      const order={id:id(row.id),accountId:id(row.accountId),contractId:id(row.contractId),timestamp:time(row.timestamp),action:action(row.action),ordStatus:en(row.ordStatus,ORDER_STATUS)};
      if(order.accountId!==selection.accountId)fail('foreign_edge');
      for(const key of ['parentId','linkedId','ocoId'])if(row[key]!==undefined)order[key]=id(row[key]);
      return order;
    });
    const candidateEnd=`${selection.closedAt.slice(0,19)}.999999999Z`;
    const contractIds=[...new Set(allOrders.filter(o=>o.timestamp<=candidateEnd).map(o=>o.contractId))];
    if(contractIds.length>LIMITS.contracts)fail('contract_limit');
    let contractId;
    const fillCache=new Map();
    // Legacy rows have exact fill IDs, not expiry metadata. Resolve only through
    // those identities in the authorized account's bounded order dependencies.
    if(selection.contractSymbol===undefined){
      const discoveryOrders=allOrders.filter(o=>o.timestamp<=candidateEnd);
      if(discoveryOrders.length>LIMITS.orders)fail('order_limit');
      const matched=[];
      for(const order of discoveryOrders){
        const rows=list(await request(`/fill/deps?masterid=${order.id}`),'fill');fillCache.set(order.id,rows);
        for(const row of rows){
          edges(row,selection.accountId,order.id,order.contractId);
          if(id(row.orderId)!==order.id||id(row.contractId)!==order.contractId)fail('foreign_edge');
          if([selection.buyFillId,selection.sellFillId].includes(id(row.id)))matched.push(row);
        }
      }
      if(matched.length!==2||id(matched[0].contractId)!==id(matched[1].contractId))fail('trade_mismatch');
      contractId=id(matched[0].contractId);
      const metadata=object(await request(`/contract/item?id=${contractId}`));
      if(id(metadata.id)!==contractId)fail('foreign_edge');
      if(typeof metadata.name!=='string'||!/^[A-Z0-9]{1,12}[FGHJKMNQUVXZ]\d{1,4}$/.test(metadata.name))fail('contract_not_found');
      selection.contractSymbol=metadata.name;
    }else for(const cid of contractIds){const metadata=object(await request(`/contract/item?id=${cid}`));if(id(metadata.id)!==cid)fail('foreign_edge');if(metadata.name===selection.contractSymbol){if(contractId)fail('ambiguous_contract');contractId=cid;}}
    if(!contractId)fail('contract_not_found');
    const candidates=allOrders.filter(o=>o.contractId===contractId&&o.timestamp<=candidateEnd);
    if(candidates.length>LIMITS.orders)fail('order_limit');
    for(const order of candidates) for(const key of ['parentId','linkedId']) if(order[key]!==undefined) {
      const linked=allOrders.find(o=>o.id===order[key]);
      if(!linked || linked.id===order.id || linked.accountId!==order.accountId || linked.contractId!==order.contractId)fail('unresolved_order_link');
    }
    const fills=[],commands=[],versions=[],commandReports=[],executionReports=[],unsupportedCommandReports=[];
    for(const order of candidates){
      for(const row of fillCache.get(order.id)||list(await request(`/fill/deps?masterid=${order.id}`),'fill')){
        edges(row,selection.accountId,order.id,contractId);
        if(id(row.orderId)!==order.id||id(row.contractId)!==contractId)fail('foreign_edge');
        const f={id:id(row.id),orderId:order.id,contractId,timestamp:time(row.timestamp),action:action(row.action),qty:qty(row.qty),price:price(row.price),active:row.active};
        if(typeof f.active!=='boolean'||f.action!==order.action||f.timestamp<order.timestamp)fail('invalid_fill');fills.push(f);
      }
      for(const row of list(await request(`/command/deps?masterid=${order.id}`),'command')){
        edges(row,selection.accountId,order.id,contractId);
        if(id(row.orderId)!==order.id)fail('foreign_edge');
        const c={id:id(row.id),orderId:order.id,timestamp:time(row.timestamp),commandType:en(row.commandType,['New','Modify','Cancel']),commandStatus:en(row.commandStatus,COMMAND_STATUS)};
        if(c.timestamp<order.timestamp)fail('invalid_chronology');commands.push(c);
      }
      if(commands.length>LIMITS.commands)fail('command_limit');
      for(const row of list(await request(`/orderVersion/deps?masterid=${order.id}`),'version')){
        edges(row,selection.accountId,order.id,contractId);if(id(row.orderId)!==order.id)fail('foreign_edge');
        const v={id:id(row.id),orderId:order.id,orderType:en(row.orderType,ORDER_TYPE),orderQty:qty(row.orderQty)};
        for(const key of ['price','stopPrice'])if(row[key]!==undefined)v[key]=price(row[key]);versions.push(v);
      }
    }
    for(const version of versions) {
      const command=commands.find(c=>c.id===version.id);
      if(command && command.orderId!==version.orderId)fail('contradictory_version_join');
    }
    const buy=fills.find(f=>f.id===selection.buyFillId),sell=fills.find(f=>f.id===selection.sellFillId);
    const entry=selection.side==='Long'?buy:sell,exit=selection.side==='Long'?sell:buy;
    if(!buy||!sell||buy.action!=='Buy'||sell.action!=='Sell'||!buy.active||!sell.active||entry.timestamp.slice(0,19)!==selection.openedAt.slice(0,19)||exit.timestamp.slice(0,19)!==selection.closedAt.slice(0,19)||entry.timestamp>=exit.timestamp||entry.price!==selection.entry||exit.price!==selection.exit||entry.qty<selection.quantity||exit.qty<selection.quantity)fail('trade_mismatch');
    const lifetime={openedAt:entry.timestamp,closedAt:exit.timestamp};
    for(const command of commands){
      if(command.timestamp>lifetime.closedAt)continue;
      const order=candidates.find(o=>o.id===command.orderId);
      const cr=await request(`/commandReport/deps?masterid=${command.id}`,true);
      if(cr===null)unsupportedCommandReports.push(command.id);
      else for(const row of list(cr,'commandReport')){
        edges(row,selection.accountId,order.id,contractId,command.id);if(id(row.commandId)!==command.id)fail('foreign_edge');
        const report={id:id(row.id),commandId:command.id,timestamp:time(row.timestamp),commandStatus:en(row.commandStatus,COMMAND_STATUS),ordStatus:en(row.ordStatus,ORDER_STATUS)};
        if(report.timestamp<command.timestamp)fail('invalid_chronology');commandReports.push(report);
      }
      for(const row of list(await request(`/executionReport/deps?masterid=${command.id}`),'executionReport')){
        edges(row,selection.accountId,order.id,contractId,command.id);
        if(id(row.commandId)!==command.id||id(row.orderId)!==order.id||id(row.accountId)!==selection.accountId||id(row.contractId)!==contractId)fail('foreign_edge');
        const report={id:id(row.id),commandId:command.id,orderId:order.id,accountId:selection.accountId,contractId,timestamp:time(row.timestamp),action:action(row.action),execType:en(row.execType,EXEC_TYPE),ordStatus:en(row.ordStatus,ORDER_STATUS)};
        if(report.timestamp<command.timestamp||report.action!==order.action)fail('invalid_chronology');executionReports.push(report);
      }
    }
    // Historical terminal reports can exclude unrelated lifetimes, not prove protection.
    // Unknown endpoints remain candidates; never silently assume today's status was true then.
    const scopedOrders=candidates.filter(o=>{
      if(o.timestamp>lifetime.closedAt)return false;
      if([entry.orderId,exit.orderId].includes(o.id))return true;
      const reports=executionReports.filter(r=>r.orderId===o.id&&r.timestamp<=lifetime.closedAt);
      const terminal=reports.filter(r=>['Canceled','Completed','Expired'].includes(r.execType) || r.execType==='Rejected' && r.ordStatus==='Rejected' && commands.some(c=>c.id===r.commandId&&c.commandType==='New')).sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0];
      return !terminal || terminal.timestamp>=lifetime.openedAt || reports.some(r=>r.timestamp>terminal.timestamp) || commands.some(c=>c.orderId===o.id&&c.timestamp>terminal.timestamp&&c.timestamp<=lifetime.closedAt);
    });
    const scopedOrderIds=new Set(scopedOrders.map(o=>o.id));
    const scopedCommands=commands.filter(c=>scopedOrderIds.has(c.orderId)&&c.timestamp<=lifetime.closedAt);
    const scopedCommandIds=new Set(scopedCommands.map(c=>c.id));
    const scopedReports=executionReports.filter(r=>scopedOrderIds.has(r.orderId)&&r.timestamp<=lifetime.closedAt);
    const scopedVersions=versions.filter(v=>scopedCommands.some(c=>c.id===v.id&&c.orderId===v.orderId));
    const timeline=scopedCommands.map(c=>{
      const v=scopedVersions.find(v=>v.id===c.id&&v.orderId===c.orderId);
      const reports=scopedReports.filter(r=>r.commandId===c.id);
      const working=['New','Modify'].includes(c.commandType) && reports.some(r=>r.execType===(c.commandType==='New'?'New':'Replaced')&&r.ordStatus==='Working');
      const rejected=['RiskRejected','ExecutionRejected'].includes(c.commandStatus) || reports.some(r=>r.execType==='Rejected'||r.ordStatus==='Rejected') || commandReports.some(r=>r.commandId===c.id&&r.timestamp<=lifetime.closedAt&&['RiskRejected','ExecutionRejected'].includes(r.commandStatus));
      const fact=working&&rejected?'unknown':rejected?'rejected':!v?'unknown':working?'working_reported':['New','Modify'].includes(c.commandType)?'submitted':'unknown';
      return {commandId:c.id,orderId:c.orderId,submittedAt:c.timestamp,commandType:c.commandType,versionId:v?.id??null,stopPrice:v?.stopPrice??null,fact};
    }).sort((a,b)=>a.submittedAt.localeCompare(b.submittedAt));
    return {diagnostic:'tradovate-stop-history-v1',status:'collected',selection,lifetime,timestampCrosscheck:'fill_ids_plus_report_second',contractId,orders:scopedOrders,fills:fills.filter(f=>scopedOrderIds.has(f.orderId)&&f.timestamp>=lifetime.openedAt&&f.timestamp<=lifetime.closedAt),commands:scopedCommands,versions:scopedVersions,commandReports:commandReports.filter(r=>scopedCommandIds.has(r.commandId)&&r.timestamp<=lifetime.closedAt),executionReports:scopedReports,unsupportedCommandReports:unsupportedCommandReports.filter(cid=>scopedCommandIds.has(cid)),timeline,scope:'candidate_order_lifetimes_not_proven_protection',commandVersionJoin:'observed_native_client',acceptanceSemantics:'unverified',archivalCompleteness:'unverified',protectiveLinkage:'unverified',plannedRisk:'unavailable',reason:'raw_acceptance_and_protective_linkage_unverified',limits:LIMITS,usage:{requests,bytes,rows}};
  }
  try {
    const result=await Promise.race([execute(),aborted]);
    const serialized=JSON.stringify(result);
    if(Buffer.byteLength(serialized)>LIMITS.outputBytes)fail('output_limit');
    if(serialized.includes(token))fail('unsafe_output');
    return result;
  } catch(error) { return {diagnostic:'tradovate-stop-history-v1',status:'unavailable',reason:signal.aborted?'timeout':error instanceof Failure?error.reason:'network_or_redirect',plannedRisk:'unavailable'}; }
  finally {clearTimeout(timer);parentSignal.removeEventListener('abort',abort);controller.abort();try{void Promise.resolve(reader?.cancel()).catch(()=>{});}catch{}}
}
