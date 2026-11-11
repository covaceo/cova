import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Trade } from "../lib/risk";
import { authorizedFetch } from "../lib/apiClient";
import { StopHistoryProbe, stopHistorySelection, type StopEvidence } from "../lib/tradovateStopHistory";

type Props = {
  owner: string;
  connectionId: string;
  enabled: boolean;
  selectedAccount: string;
  trades: readonly Trade[];
  captureCurrent: () => (() => boolean) | null;
  accountControl?: ReactNode;
};
export function TradovateStopHistoryCheck({owner,connectionId,enabled,selectedAccount,trades,captureCurrent,accountControl}: Props) {
  const [selectedId,setSelectedId]=useState("");
  const [view,setView]=useState<{key:string;evidence?:StopEvidence;message?:string;current:()=>boolean}|null>(null);
  const [pending,setPending]=useState("");
  const probe=useRef(new StopHistoryProbe(authorizedFetch));
  const generation=useRef(0), running=useRef(false);
  const preview=useRef<HTMLDivElement|null>(null);
  function revoke() {
    generation.current++;running.current=false;probe.current.cancel();
    // Revoke the painted preview before React schedules state/effects. The
    // attached native button still has to pass the captured authority check.
    if(preview.current)preview.current.hidden=true;
    setView(null);setPending("");
  }
  const options=trades.flatMap(trade=>{const selection=stopHistorySelection(trade,selectedAccount);return selection?[selection]:[];});
  const selection=options.find(item=>item.tradeId===selectedId)||null;
  const context={owner,connectionId:enabled?connectionId:"",accountKey:selectedAccount,selection};
  const key=JSON.stringify(context), latestKey=useRef(key);
  // Synchronous invalidation prevents same-task A→B→A and retained-handler races.
  if(latestKey.current!==key){generation.current++;running.current=false;latestKey.current=key;}
  probe.current.update(context);
  useEffect(()=>{
    const cancel=revoke;
    for(const event of ["cova:history-selection","cova:broker-status","storage"])window.addEventListener(event,cancel);
    return()=>{for(const event of ["cova:history-selection","cova:broker-status","storage"])window.removeEventListener(event,cancel);generation.current++;probe.current.cancel();};
  },[]);
  const visible=view?.key===key&&view.current()?view:null;
  async function check() {
    if(running.current||!enabled||!selection||!owner||!connectionId)return;
    const current=captureCurrent();if(!current?.())return;
    const version=++generation.current;running.current=true;setPending(key);setView(null);
    const stillCurrent=()=>generation.current===version&&latestKey.current===key&&current();
    try {
      const evidence=await probe.current.check(stillCurrent);
      if(stillCurrent())setView({key,evidence,current:stillCurrent});
    } catch(error) {
      if(stillCurrent()&&!(error instanceof DOMException&&error.name==="AbortError"))setView({key,current:stillCurrent,message:"Evidence unavailable. Check the connection and retry. Saved trades are unchanged."});
    } finally {if(generation.current===version){running.current=false;setPending("");}}
  }
  function download() {
    if(!visible?.evidence||!visible.current()||latestKey.current!==key||!enabled)return;
    const blob=new Blob([JSON.stringify(visible.evidence,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),anchor=document.createElement("a");
    anchor.href=url;anchor.download="cova-tradovate-stop-evidence.json";anchor.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="accounts-panel accounts-history" aria-label="Read-only Tradovate stop-history check">
    <h3>Stop-history check</h3>
    <p>Read-only, Simulation only. Select one existing closed trade from the selected account. This does not import, sync, or change planned risk.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      {accountControl}
      <label className="grid min-w-0 max-w-full gap-1 text-sm">Closed Tradovate trade
        <select aria-label="Closed Tradovate trade" className="min-w-0 w-full max-w-full rounded-lg border border-white/15 bg-[#171a21] p-2" value={selection?.tradeId||""} onChange={event=>{revoke();setSelectedId(event.target.value);}}>
          <option value="">Select a closed trade</option>
          {options.map(item=><option key={item.tradeId} value={item.tradeId}>{item.contractSymbol || "Resolve contract from fills"} · {item.closedAt.replace("T"," ")} · {item.side} · {item.quantity}</option>)}
        </select>
      </label>
      <button type="button" className="rounded-lg bg-[#4f7dff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!enabled||!owner||!connectionId||!selection||pending===key} onClick={()=>void check()}>{pending===key?"Checking evidence…":"Check selected trade"}</button>
    </div>
    {!options.length&&<p>Choose a Tradovate account with saved closed history, exact fill IDs and UTC times.</p>}
    {!enabled&&<p>A current Pro Tradovate connection is required. The server permits this check only in Simulation.</p>}
    {visible&&<div ref={preview} role="status" className="mt-4">
      <p>{visible.message||(visible.evidence?.status==="collected"?"Evidence collected. Planned risk remains unavailable.":`Evidence unavailable: ${visible.evidence?.reason}. Saved trades are unchanged.`)}</p>
      {visible.evidence?.status==="collected"&&<>
        <p>{visible.evidence.orders?.length} candidate orders · {visible.evidence.timeline?.length} command/version facts. Historical coverage and protective linkage are unverified.</p>
        <p>Submitted, working-reported, rejected and unknown facts are separate. Raw New/Replaced with Working is not verified acceptance; AtExecution and RiskPassed are not acceptance.</p>
      </>}
      {visible.evidence&&<>
        <button type="button" className="mt-3 rounded-lg border border-white/15 px-4 py-2 text-sm" onClick={download}>Download projected evidence</button>
        <details className="accounts-help"><summary>Projected evidence</summary><pre className="max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(visible.evidence,null,2)}</pre></details>
      </>}
    </div>}
  </section>;
}
