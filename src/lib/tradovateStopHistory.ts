import type { Trade } from "./risk";
import { fetchHistoryJson } from "./tradovateHistory";

export type StopSelection = { accountId: string; tradeId: string; contractSymbol?: string; openedAt: string; closedAt: string; side: "Long" | "Short"; quantity: string; entry: string; exit: string };
type Context = { owner: string; connectionId: string; accountKey: string; selection: StopSelection | null };
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Row = Record<string, string | number | boolean | null>;
export type StopEvidence = { diagnostic: "tradovate-stop-history-v1"; status: "collected" | "unavailable"; reason: string; plannedRisk: "unavailable"; selection?: Row; orders?: Row[]; fills?: Row[]; commands?: Row[]; versions?: Row[]; commandReports?: Row[]; executionReports?: Row[]; timeline?: Row[]; unsupportedCommandReports?: string[] };
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
export function validateStopEvidence(value: unknown, selected: StopSelection): StopEvidence {
  const root = record(value, {
    diagnostic:oneOf("tradovate-stop-history-v1"),status:oneOf("collected","unavailable"),reason:v=>typeof v==="string"&&reasons.includes(v),plannedRisk:oneOf("unavailable"),
    selection:()=>true,lifetime:()=>true,timestampCrosscheck:oneOf("fill_ids_plus_report_second"),contractId:id,orders:Array.isArray,fills:Array.isArray,commands:Array.isArray,versions:Array.isArray,commandReports:Array.isArray,executionReports:Array.isArray,unsupportedCommandReports:Array.isArray,timeline:Array.isArray,
    scope:oneOf("candidate_order_lifetimes_not_proven_protection"),commandVersionJoin:oneOf("observed_native_client"),acceptanceSemantics:oneOf("unverified"),archivalCompleteness:oneOf("unverified"),protectiveLinkage:oneOf("unverified"),limits:()=>true,usage:()=>true,
  }, ["selection","lifetime","timestampCrosscheck","contractId","orders","fills","commands","versions","commandReports","executionReports","unsupportedCommandReports","timeline","scope","commandVersionJoin","acceptanceSemantics","archivalCompleteness","protectiveLinkage","limits","usage"]);
  if (root.status === "unavailable") { if(Object.keys(root).length!==4)fail(); return root as StopEvidence; }
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
