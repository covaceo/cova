import {useEffect, useRef, useState} from 'react';
import {Plus, Share, X, ArrowDownToLine, ChevronRight} from 'lucide-react';
import {createHomeScreenRepository, type HomeScreenPreferences, type HomeScreenRepository} from '../lib/homeScreenRepository';
import {getSupabaseClient} from '../lib/supabaseClient';
import {hasHomeScreenDraft} from '../lib/homeScreenEligibility';
import '../styles/homeScreenInstall.css';

const localKey=(owner:string)=>`cova-home-screen-v1:${encodeURIComponent(owner)}`;
const memory=new Map<string,HomeScreenPreferences>();
function readLocal(owner:string):HomeScreenPreferences {
  try {const value=JSON.parse(localStorage.getItem(localKey(owner))||'{}'),cached=memory.get(owner);return {installed:value.installed===true||cached?.installed===true,dismissed:value.dismissed===true||cached?.dismissed===true};}
  catch {return memory.get(owner)||{installed:false,dismissed:false};}
}
function rememberLocal(owner:string,kind:'installed'|'dismissed') {
  const value={...readLocal(owner),[kind]:true};memory.set(owner,value);
  try {localStorage.setItem(localKey(owner),JSON.stringify(value));}catch {/* Cosmetic only; retain the session fallback. */}
}
function standalone(){return window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator & {standalone?:boolean}).standalone===true;}
function ios(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
function mobile(){return ios()||/Android/.test(navigator.userAgent);}
function hasDraft(owner:string){try{return hasHomeScreenDraft(owner,[localStorage,sessionStorage]);}catch{return true;}}
type InstallEvent=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
let nativeOffer:InstallEvent|null=null;
if(typeof window!=='undefined')window.addEventListener('beforeinstallprompt',event=>{
  if(!mobile())return;
  event.preventDefault();nativeOffer=event as InstallEvent;window.dispatchEvent(new Event('cova:install-available'));
});
function repository():HomeScreenRepository {
  const client=getSupabaseClient();
  const env=(import.meta as unknown as {env:Record<string,string>}).env;
  if(!client||!env.VITE_SUPABASE_URL||!env.VITE_SUPABASE_ANON_KEY)throw Error('Account preferences unavailable.');
  return createHomeScreenRepository({url:env.VITE_SUPABASE_URL,key:env.VITE_SUPABASE_ANON_KEY,getSession:async()=> (await client.auth.getSession()).data.session});
}
export function HomeScreenInstall({owner,eligible}:{owner?:string;eligible:boolean}) {
  return owner?<InstallForOwner key={owner} owner={owner} eligible={eligible}/>:null;
}
function InstallForOwner({owner,eligible}:{owner:string;eligible:boolean}) {
  const [preferences,setPreferences]=useState<HomeScreenPreferences|null>(null);
  const [open,setOpen]=useState(false),[instructions,setInstructions]=useState(false);
  const [available,setAvailable]=useState(!!nativeOffer),[waiting,setWaiting]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const previousFocus=useRef<HTMLElement|null>(null);

  const confirmed=useRef(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{const update=()=>setAvailable(!!nativeOffer);window.addEventListener('cova:install-available',update);return()=>window.removeEventListener('cova:install-available',update);},[]);
  useEffect(()=>{
    if(!mobile()&&!standalone())return;
    const controller=new AbortController();
    let busy=false;
    async function refresh(){
      if(busy||controller.signal.aborted)return;busy=true;
      try {
        if(standalone()||confirmed.current)rememberLocal(owner,'installed');
        const repo=repository(),remote=await repo.load(owner,controller.signal),local=readLocal(owner);
        for(const kind of ['installed','dismissed'] as const)if(local[kind]&&!remote[kind])await repo.remember(owner,kind,controller.signal);
        if(!controller.signal.aborted)setPreferences({installed:remote.installed||local.installed,dismissed:remote.dismissed||local.dismissed});
      }catch {if(!controller.signal.aborted)setPreferences(null);/* Unknown remote state must never produce an install nag. */}
      finally{busy=false;}
    }
    const visible=()=>{if(document.visibilityState==='visible')void refresh();};
    const installed=()=>{nativeOffer=null;confirmed.current=true;rememberLocal(owner,'installed');setOpen(false);setRetry(n=>n+1);};
    void refresh();window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible);window.addEventListener('appinstalled',installed);
    const mode=window.matchMedia('(display-mode: standalone)');mode.addEventListener('change',visible);
    return()=>{controller.abort();window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible);window.removeEventListener('appinstalled',installed);mode.removeEventListener('change',visible);};
  },[owner,retry]);
  const allowed=eligible&&!waiting&&!!preferences&&!preferences.installed&&!preferences.dismissed;
  useEffect(()=>{
    if(!allowed||standalone()||!mobile()||/FBAN|FBAV|Instagram|Line\/|TikTok|Telegram/i.test(navigator.userAgent)){setOpen(false);return;}
    if(open)return;
    let timer:number;
    function schedule(){clearTimeout(timer);timer=window.setTimeout(offer,8000);}
    function offer(){
      const writing=document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
      const overlay=[...document.querySelectorAll('dialog[open],[aria-modal="true"],[role="menu"],[aria-haspopup="menu"][aria-expanded="true"]')].some(element=>{const box=element.getBoundingClientRect();return box.width>0&&box.height>0&&getComputedStyle(element).visibility!=='hidden';});
      if(document.hidden||writing||hasDraft(owner)||overlay){schedule();return;}
      previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setOpen(true);
    }
    schedule();document.addEventListener('pointerdown',schedule);document.addEventListener('keydown',schedule);document.addEventListener('scroll',schedule,true);
    return()=>{clearTimeout(timer);document.removeEventListener('pointerdown',schedule);document.removeEventListener('keydown',schedule);document.removeEventListener('scroll',schedule,true);};
  },[allowed,open]);
  useEffect(()=>{
    if(open){const element=dialog.current;element?.showModal();element?.querySelector<HTMLElement>('h2')?.focus({preventScroll:true});return()=>{element?.close();if(previousFocus.current?.isConnected)previousFocus.current.focus({preventScroll:true});};}
  },[open]);
  function dismiss(){rememberLocal(owner,'dismissed');setOpen(false);setPreferences(p=>p?{...p,dismissed:true}:p);setRetry(n=>n+1);}
  async function install(){
    if(!eligible||hasDraft(owner)){setOpen(false);return;}
    const offer=nativeOffer;
    if(!offer){setInstructions(true);return;}
    nativeOffer=null;setAvailable(false);
    try {await offer.prompt();const choice=await offer.userChoice;if(choice.outcome==='dismissed')dismiss();else{setWaiting(true);setOpen(false);}}
    catch {setInstructions(true);}
  }
  if(!open)return null;
  return <dialog ref={dialog} className="cova-install-sheet" aria-labelledby="cova-install-title" onCancel={event=>{event.preventDefault();dismiss();}} onClick={event=>{if(event.target===event.currentTarget)dismiss();}}>
    <div className="cova-install-inner">
      <button type="button" className="cova-install-close" aria-label="Close install prompt" onClick={dismiss}><X aria-hidden="true"/></button>
      <div className="cova-install-scene" aria-hidden="true"><div className="cova-install-home"><div className="cova-install-neighbor"/><div className="cova-install-app"><img src="/app-icons/cova-192.png" alt=""/><span>Cova</span></div><div className="cova-install-neighbor"/></div></div>
      <h2 id="cova-install-title" tabIndex={-1}>Add Cova to<br/>Home Screen</h2>
      {instructions?<><ol className="cova-install-steps">{ios()?<><li><Share aria-hidden="true"/><span>Open <strong>Share</strong> in your browser.</span></li><li><Plus aria-hidden="true"/><span>Choose <strong>Add to Home Screen.</strong></span></li><li><ArrowDownToLine aria-hidden="true"/><span>Turn on <strong>Open as Web App</strong>, then tap <strong>Add.</strong></span></li></>:<><li><Plus aria-hidden="true"/><span>Open your browser’s <strong>menu.</strong></span></li><li><ArrowDownToLine aria-hidden="true"/><span>Choose <strong>Install app</strong> or <strong>Add to Home screen.</strong></span></li></>}</ol><button className="cova-install-action" type="button" onClick={dismiss}>Got it</button></>:<button className="cova-install-action" type="button" onClick={()=>void install()}>{available?'Install Cova':'Show me how'} {available?<ArrowDownToLine aria-hidden="true"/>:<ChevronRight aria-hidden="true"/>}</button>}
    </div>
  </dialog>;
}
