import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {ArrowUpRight,CreditCard,RefreshCw,X} from "lucide-react";


export type BillingState={ownerId:string;plan:"free"|"pro";mode:"sandbox";status:string;paidUntil:string|null;cancelAtPeriodEnd:boolean;canManage:boolean;canCheckout:boolean;amount:number;currency:string;interval:string};
type Request=(action?:"checkout"|"portal",signal?:AbortSignal)=>Promise<BillingState|{url:string}>;

export function openBilling(){window.dispatchEvent(new Event("cova:billing-open"));}
async function requestBilling(action?:"checkout"|"portal",signal?:AbortSignal){
 const {authorizedFetch}=await import("../lib/apiClient");
 const response=await authorizedFetch("/api/billing",{method:action?"POST":"GET",headers:action?{"Content-Type":"application/json"}:undefined,body:action?JSON.stringify({action}):undefined,signal});
 const data=await response.json();if(!response.ok)throw new Error(data.error||"Billing is unavailable. Try again.");return data;
}
type Context={enabled:boolean;state:BillingState|null;loading:boolean;busy:boolean;error:string;refresh:()=>Promise<void>;act:(action:"checkout"|"portal")=>Promise<void>};
const BillingContext=createContext<Context|null>(null);
export const useBilling=()=>useContext(BillingContext);
export function BillingProvider({ownerId,children,onPlan,enabled=false,request=requestBilling,navigate=(url:string)=>window.location.assign(url)}:{ownerId?:string;children:ReactNode;onPlan:(owner:string,plan:"free"|"pro")=>void;enabled?:boolean;request?:Request;navigate?:(url:string)=>void}){
 const[state,setState]=useState<BillingState|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[open,setOpen]=useState(false);
 const active=useRef<AbortController|null>(null),generation=useRef(0),acting=useRef(false),onPlanRef=useRef(onPlan),requestRef=useRef(request);onPlanRef.current=onPlan;requestRef.current=request;
 const refresh=useCallback(async()=>{
  if(!enabled||!ownerId)return;active.current?.abort();const controller=new AbortController();active.current=controller;const epoch=generation.current;setLoading(true);setError("");
  try{const data=await requestRef.current(undefined,controller.signal);if(controller.signal.aborted||epoch!==generation.current)return;
   if(!("ownerId" in data)||data.ownerId!==ownerId||!["free","pro"].includes(data.plan)||data.mode!=="sandbox")throw Error("Your billing account could not be verified.");
   setState(data);onPlanRef.current(ownerId,data.plan);
  }catch(caught){if(!controller.signal.aborted&&epoch===generation.current)setError(caught instanceof Error?caught.message:"Billing is unavailable. Try again.");}
  finally{if(!controller.signal.aborted&&epoch===generation.current)setLoading(false);}
 },[enabled,ownerId]);
 useEffect(()=>{generation.current++;setState(null);setError("");setOpen(false);acting.current=false;setBusy(false);void refresh();return()=>{generation.current++;active.current?.abort();};},[refresh]);
 useEffect(()=>{
  if(!enabled||!ownerId)return;
  const show=()=>{setOpen(true);void refresh();};window.addEventListener("cova:billing-open",show);
  const url=new URL(window.location.href),returned=url.searchParams.get("billing");let timer:ReturnType<typeof setInterval>|undefined;
  if(returned){url.searchParams.delete("billing");history.replaceState(null,"",url);setOpen(true);let checks=0;timer=setInterval(()=>{void refresh();if(++checks>=6)clearInterval(timer);},2000);}
  const focus=()=>void refresh();window.addEventListener("focus",focus);
  return()=>{window.removeEventListener("cova:billing-open",show);window.removeEventListener("focus",focus);clearInterval(timer);};
 },[enabled,ownerId,refresh]);
 async function act(action:"checkout"|"portal"){
  if(acting.current||!ownerId)return;acting.current=true;setBusy(true);setError("");const epoch=generation.current;
  try{const data=await requestRef.current(action);if(epoch!==generation.current)return;
   if(!("url"in data))throw Error("Stripe did not return a link.");const url=new URL(data.url),host=action==="checkout"?"checkout.stripe.com":"billing.stripe.com";
   if(url.protocol!=="https:"||url.hostname!==host||url.username||url.password)throw Error("Stripe did not return a secure link.");navigate(url.href);
  }catch(caught){if(epoch===generation.current)setError(caught instanceof Error?caught.message:"Billing is unavailable. Try again.");}
  finally{if(epoch===generation.current){acting.current=false;setBusy(false);}}
 }
 const value={enabled:enabled&&Boolean(ownerId),state,loading,busy,error,refresh,act};
 return <BillingContext.Provider value={value}>{children}{open&&value.enabled&&<BillingDialog close={()=>setOpen(false)}/>}</BillingContext.Provider>;
}
function BillingDialog({close}:{close:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef(document.activeElement as HTMLElement|null);
 useEffect(()=>{dialog.current?.showModal();return()=>trigger.current?.focus();},[]);
 return <dialog ref={dialog} className="cova-profile-dialog cova-billing-dialog" aria-labelledby="billing-dialog-title" onCancel={event=>{event.preventDefault();close();}}><div className="cova-profile-dialog-head"><h2 id="billing-dialog-title">Billing</h2><button type="button" aria-label="Close billing" onClick={close}><X aria-hidden="true"/></button></div><div className="cova-billing-dialog-body"><BillingPanel/></div></dialog>;
}
export function BillingPanel(){
 const billing=useBilling();if(!billing?.enabled)return null;const{state,loading,busy,error}=billing;
 const renewal=state?.paidUntil?new Date(state.paidUntil).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}):null;
 const label=state?.status==="past_due"?"Payment needed":state?.cancelAtPeriodEnd?"Ending":state?.plan==="pro"?"Active":state?.status==="canceled"?"Canceled":"Free";
 return <section className="cova-billing" aria-label="Subscription" aria-busy={loading||busy}>
  <div className="cova-billing-heading"><h3>Your plan</h3><span className="cova-billing-sandbox">Sandbox</span></div>
  <div className="cova-billing-plate">
   <div className="cova-billing-plan"><span>Cova Pro</span><CreditCard aria-hidden="true"/></div>
   <div className="cova-billing-price"><span>$30</span><span>USD / month</span></div>
   <dl className="cova-billing-facts"><div><dt>Current plan</dt><dd>{state?state.plan==="pro"?"Pro":"Free":loading?"Loading…":"Unavailable"}</dd></div>{state&&<div><dt>Status</dt><dd>{label}</dd></div>}{renewal&&<div><dt>{state?.cancelAtPeriodEnd?"Access until":"Paid through"}</dt><dd>{renewal}</dd></div>}</dl>
   <div className="cova-billing-actions">
    {state?.canCheckout&&state.plan!=="pro"&&<button className="cova-settings-button cova-settings-primary" type="button" disabled={busy||loading} onClick={()=>void billing.act("checkout")}>{busy?"Opening Stripe…":"Continue to checkout"}<ArrowUpRight aria-hidden="true"/></button>}
    {state?.canManage&&<button className="cova-settings-button" type="button" disabled={busy||loading} onClick={()=>void billing.act("portal")}>{busy?"Opening Stripe…":"Manage billing"}<ArrowUpRight aria-hidden="true"/></button>}
   </div>
  </div>
  <div className="cova-billing-foot"><p>No real charges in this preview.</p><button type="button" aria-label="Refresh billing" disabled={busy||loading} onClick={()=>void billing.refresh()}><RefreshCw aria-hidden="true"/>Refresh</button></div>
  {error&&<p className="cova-profile-error" role="alert">{error}</p>}
  <span className="cova-billing-sr" role="status">{loading?"Checking subscription…":state?`Current plan: ${state.plan}`:""}</span>
 </section>;
}
