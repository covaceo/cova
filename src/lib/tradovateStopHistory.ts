import type { Trade } from "./risk";
import { fetchHistoryJson } from "./tradovateHistory";

export type StopSelection = { accountId: string; tradeId: string; contractSymbol?: string; openedAt: string; closedAt: string; side: "Long" | "Short"; quantity: string; entry: string; exit: string };
type Context = { owner: string; connectionId: string; accountKey: string; selection: StopSelection | null };
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Row = Record<string, string | number | boolean | null>;
type ReportDescriptor = { name: string; label?: string; params: { name: string; paramType: string; optional: boolean }[] };
type HistoricalFailure = "missing_report_contract" | "ambiguous_report_contract" | "unsupported_parameter_type" | "unsupported_required_parameter" | "invalid_report_account" | "request_limit" | "byte_limit" | "upstream_rejected" | "unsupported_media" | "empty_response" | "invalid_json" | "duplicate_json_key" | "provider_error" | "unsupported_report_envelope" | "unsupported_report_content" | "report_text_limit" | "network_or_redirect";
type HistoricalEvidence = { status: "unavailable"; reason: HistoricalFailure } | {
  status: "collected";
  provenance: {
    source: "provider_account_filtered_report"; account: { id: string; name: string };
    tradeId: string; openedAt: string; closedAt: string;
    window: { startDate: string; endDate: string; startTime: "00:00:00"; endTime: "00:00:00"; timeZone: "UTC"; timezoneOffset: 0; endExclusive: true };
    representationType: "csv"; rowIdentity: "unverified"; schema: "unverified"; coverage: "unverified";
  };
  reports: { name: "Orders" | "Fills"; status: "collected" | "empty"; text: string; textBytes: number }[];
};
type Mismatch = {
  stage: "legacy-fill-resolution" | "trade-crosscheck";
  counts: { accountOrders: number; discoveryOrders: number; fills: number; matchedFillIds: number };
  reportDefinitions: { status: "collected"; reports: ReportDescriptor[] } | { status: "unavailable"; reason: string };
  historicalEvidence?: HistoricalEvidence;
};
export type StopEvidence = { diagnostic: "tradovate-stop-history-v1"; status: "collected" | "unavailable"; reason: string; plannedRisk: "unavailable"; mismatch?: Mismatch; selection?: Row; orders?: Row[]; fills?: Row[]; commands?: Row[]; versions?: Row[]; commandReports?: Row[]; executionReports?: Row[]; timeline?: Row[]; unsupportedCommandReports?: string[] };
const id = (v: unknown): v is string => typeof v === "string" && /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n;
const timestamp = (v: unknown): v is string => typeof v === "string" && /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const rawTimestamp = (v: unknown): v is string => typeof v === "string" && /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,19)===v.slice(0,19);
const precise = (v: string) => `${v.slice(0,19)}.${v.slice(20,-1).padEnd(9,"0")}Z`;
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e9;
const quantity = (v: unknown) => number(v) && Number.isSafeInteger(v) && v > 0 && v <= 100000;
const oneOf = (...values: (string | null)[]) => (v: unknown) => values.includes(v as string | null);
const fail = (): never => { throw new Error("Stop-history evidence was inconsistent. Nothing was changed."); };
export function stopHistorySelection(trade: Trade, accountKey: string): StopSelection | null {
  const s = trade.source as (NonNullable<Trade["source"]> & { contractSymbol?: string }) | undefined;
  const pair = /^tradovate-([^:]+):([^:]+):([^:]+)$/.exec(trade.id);
  if (s?.provider !== "Tradovate" || accountKey !== `Tradovate:${s.accountId}` || !pair || !pair.slice(1).every(id) || pair[1] !== s.accountId || pair[2] === pair[3] || (s.contractSymbol !== undefined && !/^[A-Z0-9]{1,12}[FGHJKMNQUVXZ]\d{1,4}$/.test(s.contractSymbol)) || !timestamp(s.openedAt) || !timestamp(s.closedAt) || s.openedAt >= s.closedAt || Date.parse(s.closedAt) > Date.now() || Date.parse(s.closedAt)-Date.parse(s.openedAt) > 7*86400000 || s.timeZone !== "UTC" || s.pnlBasis !== "gross_before_fees" || !quantity(trade.contracts) || !number(trade.entry) || !number(trade.exit) || !["Long","Short"].includes(trade.side)) return null;
  return { accountId:s.accountId, tradeId:trade.id, ...(s.contractSymbol === undefined ? {} : {contractSymbol:s.contractSymbol}), openedAt:s.openedAt, closedAt:s.closedAt, side:trade.side, quantity:String(trade.contracts), entry:String(trade.entry), exit:String(trade.exit) };
}
const reasons = ["raw_acceptance_and_protective_linkage_unverified","invalid_entity","invalid_id","invalid_timestamp","invalid_price","invalid_quantity","invalid_action","foreign_edge","invalid_json","duplicate_json_key","invalid_request","invalid_trade","invalid_trade_window","invalid_collection","row_limit","duplicate_id","request_limit","upstream_rejected","unsupported_media","byte_limit","empty_response","provider_error","unsupported_environment","invalid_credential","account_not_owned","contract_limit","ambiguous_contract","contract_not_found","order_limit","unresolved_order_link","invalid_fill","invalid_chronology","command_limit","contradictory_version_join","trade_mismatch","output_limit","unsafe_output","timeout","network_or_redirect"];
const status = oneOf("Canceled","Completed","Expired","Filled","PendingCancel","PendingNew","PendingReplace","Rejected","Suspended","Unknown","Working");
const commandStatus = oneOf("AtExecution","ExecutionRejected","ExecutionStopped","ExecutionSuspended","OnHold","Pending","PendingExecution","Replaced","RiskPassed","RiskRejected","Unknown");
const commandType = oneOf("New","Modify","Cancel","Unknown");
const orderType = oneOf("Limit","LimitIfTouched","MIT","Market","MarketLimit","MarketStopWithProtection","MarketWithProtection","QTS","Stop","StopLimit","TrailingStop","TrailingStopLimit","Unknown");
const execType = oneOf("Canceled","Completed","DoneForDay","Expired","New","OrderStatus","PendingCancel","PendingNew","PendingReplace","Rejected","Replaced","Stopped","Suspended","Trade","TradeCancel","TradeCorrect","Unknown");
type Predicate = (v: unknown) => boolean;
function record(value: unknown, fields: Record<string, Predicate>, optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).some(k => !Object.prototype.hasOwnProperty.call(fields,k) || !fields[k](obj[k])) || Object.keys(fields).some(k => !optional.includes(k) && !Object.prototype.hasOwnProperty.call(obj,k))) return fail();
  return obj;
}
// Closed schema: neither preview nor download may reflect unreviewed provider fields.
const metadataFailure = oneOf("request_limit","byte_limit","upstream_rejected","unsupported_media","empty_response","invalid_json","duplicate_json_key","provider_error","invalid_reports_envelope","invalid_report_descriptor","invalid_report_params","missing_or_invalid_optional","invalid_report_fields","network_or_redirect");
const boundedCount = (max: number) => (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
const safeLabel = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 128 && v === v.trim() && !/[\x00-\x1f\x7f]/.test(v);
function validateHistorical(value: unknown, selected: StopSelection, descriptors: ReportDescriptor[]) {
  const historical=record(value,{status:oneOf("collected","unavailable"),reason:oneOf("missing_report_contract","ambiguous_report_contract","unsupported_parameter_type","unsupported_required_parameter","invalid_report_account","request_limit","byte_limit","upstream_rejected","unsupported_media","empty_response","invalid_json","duplicate_json_key","provider_error","unsupported_report_envelope","unsupported_report_content","report_text_limit","network_or_redirect"),provenance:()=>true,reports:Array.isArray},["reason","provenance","reports"]);
  if(historical.status==="unavailable"){
    if(Object.keys(historical).length!==2||historical.reason===undefined)fail();return;
  }
  record(historical,{status:oneOf("collected"),provenance:()=>true,reports:v=>Array.isArray(v)&&v.length===2});
  const types:Record<string,string>={startDate:"Date",endDate:"Date",startTime:"Time",endTime:"Time",account:"accounts",contract:"contracts",product:"products",exchange:"exchanges",orderStatus:"OrderStatus"};
  const supplied=["startDate","endDate","startTime","endTime","account"];
  for(const name of ["Orders","Fills"]){
    const matches=descriptors.filter(r=>r.name===name);
    if(matches.length!==1||!supplied.every(key=>matches[0].params.some(p=>p.name===key)))fail();
    for(const p of matches[0].params)if(Object.prototype.hasOwnProperty.call(types,p.name)&&p.paramType!==types[p.name]||!supplied.includes(p.name)&&!p.optional)fail();
  }
  if(!timestamp(selected.openedAt)||!timestamp(selected.closedAt)||selected.openedAt>=selected.closedAt||Date.parse(selected.closedAt)-Date.parse(selected.openedAt)>7*86400000)fail();
  const startDate=selected.openedAt.slice(0,10),endDate=new Date(Date.parse(`${selected.closedAt.slice(0,10)}T00:00:00Z`)+86400000).toISOString().slice(0,10);
  const provenance=record(historical.provenance,{source:oneOf("provider_account_filtered_report"),account:()=>true,tradeId:v=>v===selected.tradeId,openedAt:v=>v===precise(selected.openedAt),closedAt:v=>v===precise(selected.closedAt),window:()=>true,representationType:oneOf("csv"),rowIdentity:oneOf("unverified"),schema:oneOf("unverified"),coverage:oneOf("unverified")});
  // Account name is the server's owned-account binding, not a row-identity claim.
  record(provenance.account,{id:v=>v===selected.accountId,name:safeLabel});
  record(provenance.window,{startDate:v=>v===startDate,endDate:v=>v===endDate,startTime:oneOf("00:00:00"),endTime:oneOf("00:00:00"),timeZone:oneOf("UTC"),timezoneOffset:v=>v===0,endExclusive:v=>v===true});
  for(const [i,value] of (historical.reports as unknown[]).entries()){
    const report=record(value,{name:oneOf(i===0?"Orders":"Fills"),status:oneOf("collected","empty"),text:v=>typeof v==="string"&&v.length<=131072,textBytes:boundedCount(131072)});
    const text=report.text as string;
    if(new TextEncoder().encode(text).byteLength!==report.textBytes||report.status!==(text.trim()?"collected":"empty")||/^\s*(?:<|\{|\[|error\b|unauthorized\b|forbidden\b|access denied\b)/i.test(text)||/<\/?[a-z][\w:-]*(?:\s|\/?>)/i.test(text))fail();
  }
}
function validateMismatch(value: unknown, selected: StopSelection) {
  const mismatch=record(value,{stage:oneOf("legacy-fill-resolution","trade-crosscheck"),counts:()=>true,reportDefinitions:()=>true,historicalEvidence:()=>true},["historicalEvidence"]);
  const counts=record(mismatch.counts,{accountOrders:boundedCount(4000),discoveryOrders:boundedCount(24),fills:boundedCount(4000),matchedFillIds:boundedCount(2)});
  if(Number(counts.discoveryOrders)>Number(counts.accountOrders)||Number(counts.matchedFillIds)>Number(counts.fills))fail();
  const definitions=record(mismatch.reportDefinitions,{status:oneOf("collected","unavailable"),reports:Array.isArray,reason:metadataFailure},["reports","reason"]);
  const hasHistorical=Object.prototype.hasOwnProperty.call(mismatch,"historicalEvidence");
  if(hasHistorical&&(mismatch.stage!=="legacy-fill-resolution"||Object.values(counts).some(v=>v!==0)||definitions.status!=="collected"))fail();
  if(definitions.status==="unavailable"){
    record(definitions,{status:oneOf("unavailable"),reason:metadataFailure});return;
  }
  record(definitions,{status:oneOf("collected"),reports:v=>Array.isArray(v)&&v.length<=256});
  for(const value of definitions.reports as unknown[]){
    const report=record(value,{name:safeLabel,label:safeLabel,params:v=>Array.isArray(v)&&v.length<=32},["label"]);
    const names=new Set();
    for(const value of report.params as unknown[]){
      const param=record(value,{name:safeLabel,paramType:safeLabel,optional:v=>typeof v==="boolean"});
      if(names.has(param.name))fail();names.add(param.name);
    }
  }
  if(hasHistorical)validateHistorical(mismatch.historicalEvidence,selected,definitions.reports as ReportDescriptor[]);
}
export function validateStopEvidence(value: unknown, selected: StopSelection): StopEvidence {
  const root = record(value, {
    diagnostic:oneOf("tradovate-stop-history-v1"),status:oneOf("collected","unavailable"),reason:v=>typeof v==="string"&&reasons.includes(v),plannedRisk:oneOf("unavailable"),mismatch:()=>true,
    selection:()=>true,lifetime:()=>true,timestampCrosscheck:oneOf("fill_ids_plus_report_second"),contractId:id,orders:Array.isArray,fills:Array.isArray,commands:Array.isArray,versions:Array.isArray,commandReports:Array.isArray,executionReports:Array.isArray,unsupportedCommandReports:Array.isArray,timeline:Array.isArray,
    scope:oneOf("candidate_order_lifetimes_not_proven_protection"),commandVersionJoin:oneOf("observed_native_client"),acceptanceSemantics:oneOf("unverified"),archivalCompleteness:oneOf("unverified"),protectiveLinkage:oneOf("unverified"),limits:()=>true,usage:()=>true,
  }, ["mismatch","selection","lifetime","timestampCrosscheck","contractId","orders","fills","commands","versions","commandReports","executionReports","unsupportedCommandReports","timeline","scope","commandVersionJoin","acceptanceSemantics","archivalCompleteness","protectiveLinkage","limits","usage"]);
  if (root.status === "unavailable") {
    const hasMismatch=Object.prototype.hasOwnProperty.call(root,"mismatch");
    if(Object.keys(root).length!==(hasMismatch?5:4))fail();
    if(hasMismatch){if(root.reason!=="trade_mismatch")fail();validateMismatch(root.mismatch,selected);}
    return root as StopEvidence;
  }
  if(Object.prototype.hasOwnProperty.call(root,"mismatch"))fail();
  if(["selection","lifetime","timestampCrosscheck","contractId","orders","fills","commands","versions","commandReports","executionReports","unsupportedCommandReports","timeline","scope","commandVersionJoin","acceptanceSemantics","archivalCompleteness","protectiveLinkage","limits","usage"].some(k=>root[k]===undefined))fail();
  const pair=selected.tradeId.split(":");
  const expected={...selected,openedAt:precise(selected.openedAt),closedAt:precise(selected.closedAt),quantity:Number(selected.quantity),entry:Number(selected.entry),exit:Number(selected.exit),buyFillId:pair[1],sellFillId:pair[2]};
  const selectedRow=record(root.selection,{...Object.fromEntries(Object.entries(expected).map(([k,v])=>[k,(got:unknown)=>got===v])),contractSymbol:v=>typeof v==='string'&&/^[A-Z0-9]{1,12}[FGHJKMNQUVXZ]\d{1,4}$/.test(v)&&(selected.contractSymbol===undefined||v===selected.contractSymbol)});
  const lifetime=record(root.lifetime,{openedAt:rawTimestamp,closedAt:rawTimestamp});
  if(String(lifetime.openedAt).slice(0,19)!==selected.openedAt.slice(0,19)||String(lifetime.closedAt).slice(0,19)!==selected.closedAt.slice(0,19)||String(lifetime.openedAt)>=String(lifetime.closedAt))fail();
  const action=oneOf("Buy","Sell");
  const schemas:Record<string,[Record<string,Predicate>,string[]]>={
    orders:[{id,accountId:v=>v===selected.accountId,contractId:v=>v===root.contractId,timestamp:rawTimestamp,action,ordStatus:status,parentId:id,linkedId:id,ocoId:id},["parentId","linkedId","ocoId"]],
    fills:[{id,orderId:id,contractId:v=>v===root.contractId,timestamp:rawTimestamp,action,qty:quantity,price:number,active:v=>typeof v==="boolean"},[]],
    commands:[{id,orderId:id,timestamp:rawTimestamp,commandType,commandStatus},[]],
    versions:[{id,orderId:id,orderType,orderQty:quantity,price:number,stopPrice:number},["price","stopPrice"]],
    commandReports:[{id,commandId:id,timestamp:rawTimestamp,commandStatus,ordStatus:status},[]],
    executionReports:[{id,commandId:id,orderId:id,accountId:v=>v===selected.accountId,contractId:v=>v===root.contractId,timestamp:rawTimestamp,action,execType,ordStatus:status},[]],
    timeline:[{commandId:id,orderId:id,submittedAt:rawTimestamp,commandType,versionId:v=>v===null||id(v),stopPrice:v=>v===null||number(v),fact:oneOf("submitted","working_reported","rejected","unknown")},[]],
  };
  let rows=0;
  for(const [key,[fields,optional]] of Object.entries(schemas)){
    const values=root[key];if(!Array.isArray(values))fail(); rows+=(values as unknown[]).length;if(rows>8000)fail();
    for(const row of values as unknown[])record(row,fields,optional);
  }
  if(!(root.unsupportedCommandReports as unknown[]).every(id))fail();
  record(root.limits,Object.fromEntries(["requests","bytes","responseBytes","rows","orders","contracts","commands","milliseconds","outputBytes"].map(k=>[k,(v:unknown)=>number(v)&&Number.isSafeInteger(v)&&v>0])));
  record(root.usage,Object.fromEntries(["requests","bytes","rows"].map(k=>[k,(v:unknown)=>number(v)&&Number.isSafeInteger(v)&&v>=0])));
  const orders=root.orders as Row[], commands=root.commands as Row[];
  if(new Set(orders.map(o=>o.id)).size!==orders.length||new Set(commands.map(c=>c.id)).size!==commands.length)fail();
  for(const key of ["fills","commands","versions","executionReports","timeline"])for(const row of root[key] as Row[])if(!orders.some(o=>o.id===row.orderId))fail();
  for(const key of ["commandReports","executionReports","timeline"])for(const row of root[key] as Row[])if(!commands.some(c=>c.id===row.commandId&&(row.orderId===undefined||c.orderId===row.orderId)))fail();
  const fills=root.fills as Row[], buy=fills.find(f=>f.id===pair[1]), sell=fills.find(f=>f.id===pair[2]);
  const entry=selected.side==='Long'?buy:sell, exit=selected.side==='Long'?sell:buy;
  if(!buy||!sell||!entry||!exit)return fail();
  if(buy.action!=='Buy'||sell.action!=='Sell'||!buy.active||!sell.active||entry.timestamp!==lifetime.openedAt||exit.timestamp!==lifetime.closedAt||entry.price!==Number(selected.entry)||exit.price!==Number(selected.exit)||Number(entry.qty)<Number(selected.quantity)||Number(exit.qty)<Number(selected.quantity))fail();
  for(const fill of [buy,sell])if(!orders.some(o=>o.id===fill.orderId&&o.action===fill.action&&String(o.timestamp)<=String(fill.timestamp)))fail();
  if(selectedRow.accountId!==selected.accountId)fail();
  return root as StopEvidence;
}

export class StopHistoryProbe {
  private context: Context | null = null;
  private key = "";
  private controller: AbortController | null = null;
  constructor(private fetcher: Fetcher) {}
  update(context: Context) {
    const key=JSON.stringify(context);
    if(key!==this.key){this.cancel();this.key=key;this.context=context;}
  }
  cancel() { this.controller?.abort(); this.controller=null; }
  async check(isCurrent: () => boolean): Promise<StopEvidence> {
    if(this.controller)throw new Error("A stop-history check is already running.");
    const context=this.context;
    if(!context?.owner||!context.connectionId||!context.selection||context.accountKey!==`Tradovate:${context.selection.accountId}`||!isCurrent())return fail();
    const controller=new AbortController();this.controller=controller;
    const get: Fetcher=(url,init)=>this.fetcher(url,{...init,method:"GET",redirect:"error",cache:"no-store"});
    const requireCurrent=()=>{if(controller.signal.aborted||this.controller!==controller||!isCurrent())throw new DOMException("Stop-history check canceled.","AbortError");};
    try {
      const current=await fetchHistoryJson(get,"/api/tradovate/status",controller.signal,5000,16384) as {available?:boolean;connected?:boolean;connectionId?:string};
      requireCurrent();
      if(current.available!==true||current.connected!==true||current.connectionId!==context.connectionId)throw new Error("Tradovate connection changed. Reconnect before checking.");
      const query=new URLSearchParams({diagnostic:"stop-history",connectionId:context.connectionId,...context.selection});
      const result=await fetchHistoryJson(get,`/api/tradovate/sync?${query}`,controller.signal,15000,524288);
      requireCurrent();
      return validateStopEvidence(result,context.selection);
    } finally {controller.abort();if(this.controller===controller)this.controller=null;}
  }
}
