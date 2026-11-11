import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { getSupabaseClient } from "../lib/supabaseClient";
import { authorizedFetch } from "../lib/apiClient";
import { fetchHistoryJson } from "../lib/tradovateHistory";
import { stopHistorySelection } from "../lib/tradovateStopHistory";
import type { Trade } from "../lib/risk";
import { SectionShell } from "./LayoutShell";
import { TradovateStopHistoryCheck } from "./TradovateStopHistoryCheck";

type Snapshot = { owner: string; connectionId: string; trades: Trade[]; account: string };
// A distinct App entry: no ImportDesk, workspace synchronization, hydration,
// automatic account persistence or publishing components are mounted here.
export function TradovateStopHistoryPage() {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [message,setMessage]=useState("Verifying the current connection…");
  const epoch=useRef(0), live=useRef<Snapshot|null>(null);
  useEffect(()=>{
    const client=getSupabaseClient();
    let mounted=true,controller:AbortController|null=null;
    const revoke=()=>{epoch.current++;live.current=null;controller?.abort();};
    async function refresh() {
      revoke();setSnapshot(null);
      const version=epoch.current;
      if(!client){setMessage("Sign in to Cova before opening this read-only check.");return;}
      controller=new AbortController();const signal=controller.signal;
      const current=()=>mounted&&epoch.current===version&&!signal.aborted&&window.location.hash==="#stop-history";
      try {
        const {data}=await client.auth.getSession();if(!current())return;
        const owner=data.session?.user.id;
        if(!owner)throw Error("Sign in to Cova before opening this read-only check.");
        const status=await fetchHistoryJson(authorizedFetch,"/api/tradovate/status",signal,5000,16384) as {available?:boolean;connected?:boolean;connectionId?:string};
        if(!current())return;
        // Reconfirm the same session after authenticated status, before reading
        // any saved ledger. Auth callbacks revoke this generation synchronously.
        const latest=await client.auth.getSession();if(!current())return;
        if(latest.data.session?.user.id!==owner||latest.data.session?.access_token!==data.session?.access_token)throw Error("Cova account changed. Reopen the read-only check.");
        if(!status.available||!status.connected||typeof status.connectionId!=="string"||!status.connectionId)throw Error("A current Pro Tradovate connection is required. Connect from Accounts, then reopen this read-only check.");
        const raw=JSON.parse(localStorage.getItem("cova-react-risk-os-v2:"+encodeURIComponent(owner))||"null");
        const trades:Trade[]=Array.isArray(raw?.trades)?raw.trades.filter((t:Trade)=>{try{return !!stopHistorySelection(t,`Tradovate:${t.source?.accountId}`);}catch{return false;}}):[];
        const accounts=[...new Set(trades.map(t=>`Tradovate:${t.source?.accountId}`))];
        const next={owner,connectionId:status.connectionId,trades,account:accounts.includes(raw?.tradeAccount)?raw.tradeAccount:accounts[0]||""};
        live.current=next;setSnapshot(next);setMessage("");
      }catch(error){if(current())setMessage(error instanceof Error?error.message:"Evidence unavailable. Saved trades are unchanged.");}
    }
    const changed=(event?: Event | string)=>{
      if(event instanceof Event && ["hashchange","popstate"].includes(event.type) && window.location.hash==="#stop-history")return;
      revoke();
      // This callback is an external authority boundary, not a React effect.
      // Revoke actions first, then remove previously visible evidence now.
      flushSync(()=>{setSnapshot(null);setMessage("Connection or account changed. Reopen the read-only check to verify it again.");});
      // Auth-ready/token/owner notifications may refresh read-only status, never
      // history. Leave the SDK callback before requesting its current session.
      if(typeof event==="string")queueMicrotask(()=>{if(mounted)void refresh();});
    };
    const {data:subscription}=client?.auth.onAuthStateChange(changed)||{data:null};
    for(const event of ["cova:broker-status","storage","hashchange","popstate"])window.addEventListener(event,changed);
    void refresh();
    return()=>{mounted=false;revoke();subscription?.subscription.unsubscribe();for(const event of ["cova:broker-status","storage","hashchange","popstate"])window.removeEventListener(event,changed);};
  },[]);
  const accounts=[...new Set(snapshot?.trades.map(t=>`Tradovate:${t.source?.accountId}`)||[])];
  return <main className="oa-dashboard-app"><SectionShell eyebrow="Accounts" title="Read-only stop-history" variant="workspace">
    <div className="accounts-page">
      <p><a href="#dashboard">Return to Dashboard</a> · <a href="#import">Open Accounts (normal import)</a></p>
      {message&&<p role="status">{message}</p>}
      {snapshot&&<TradovateStopHistoryCheck owner={snapshot.owner} connectionId={snapshot.connectionId} enabled={true} selectedAccount={snapshot.account} trades={snapshot.trades}
        captureCurrent={()=>{const version=epoch.current,captured=live.current;return()=>version===epoch.current&&captured===live.current&&window.location.hash==="#stop-history";}}
        accountControl={<label className="grid min-w-0 max-w-full gap-1 text-sm">Account<select aria-label="Stop-history account" value={snapshot.account} onChange={event=>{
          if(!accounts.includes(event.target.value)||!live.current)return;
          epoch.current++;window.dispatchEvent(new Event("cova:history-selection"));
          const next={...live.current,account:event.target.value};live.current=next;setSnapshot(next);
        }}>{accounts.map(account=><option key={account} value={account}>{account}</option>)}</select></label>}/>}
    </div>
  </SectionShell></main>;
}
