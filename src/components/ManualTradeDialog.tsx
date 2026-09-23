import { useEffect,useRef,useState } from 'react';
import { X } from 'lucide-react';
import type { ManualTradeDraft } from '../lib/manualTrades';
export type AddManualTrade=(draft:ManualTradeDraft,account:string)=>string|null;
export function ManualTradeDialog({accounts,selected,onSave,onClose}:{accounts:string[];selected:string;onSave:AddManualTrade;onClose:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null);const save=useRef(onSave);
 const [account,setAccount]=useState(selected==='all'?(accounts.length===1?accounts[0]:''):selected);const [error,setError]=useState('');
 useEffect(()=>{const d=ref.current!;const opener=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;d.showModal();document.body.style.overflow='hidden';return()=>{d.close();document.body.style.overflow=overflow;opener?.isConnected&&opener.focus();};},[]);
 return <dialog ref={ref} className="astra-trade-dialog manual-trade-dialog" aria-labelledby="manual-trade-title" onCancel={e=>{e.preventDefault();onClose();}}>
 <button className="astra-dialog-close" type="button" onClick={onClose} aria-label="Close Add trade"><X aria-hidden="true"/></button><h2 id="manual-trade-title">Add trade</h2><p>Manual record · USD · never sent to your broker.</p>
 <form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);const draft=Object.fromEntries(['date','market','side','contracts','entry','exit','pnl','risk','setup','notes'].map(k=>[k,String(data.get(k)||'')])) as ManualTradeDraft;const message=save.current(draft,account);if(message)setError(message);else onClose();}}>
 <label>Account<select aria-label="Manual trade account" required value={account} onChange={e=>setAccount(e.target.value)}><option value="" disabled>Choose account</option>{accounts.map(a=><option key={a} value={a}>{a==='local'?'Manual / CSV trades':a}</option>)}</select></label>
 <div className="manual-trade-fields">
 <label>Date<input name="date" type="date" required/></label><label>Symbol<input name="market" placeholder="MNQ" maxLength={20} required/></label>
 <label>Side<select name="side"><option>Long</option><option>Short</option></select></label><label>Quantity<input name="contracts" type="number" min="1" max="100000" step="1" required/></label>
 <label>Entry price<input name="entry" type="number" step="any" required/></label><label>Exit price<input name="exit" type="number" step="any" required/></label>
 <label>Gross P&amp;L ($)<input name="pnl" type="number" step="0.01" placeholder="-50.00 or 100.00" required/></label><label>Planned risk ($, optional)<input name="risk" type="number" step="0.01" min="0"/></label>
 </div>
 <details><summary>Setup &amp; note</summary><label>Setup<input name="setup" maxLength={120}/></label><label>Note<textarea name="notes" maxLength={4000} rows={2}/></label></details>
 <p className="manual-trade-disclosure">Included in this account’s reported results. If the broker imports it later, remove the manual copy to avoid counting it twice.</p>
 {error&&<p role="alert">{error}</p>}<button type="submit" className="astra-button astra-save-note">Save trade</button>
 </form></dialog>;
}
