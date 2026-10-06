import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { accountDisplayName, type AccountNames } from '../lib/accountNames';
import { isManualAccountKey } from '../lib/manualAccountKeys';
import '../styles/manualAccounts.css';
type Props = { accounts: string[]; names: AccountNames; onCreate: (name: string) => string | null; onRename: (key: string, name: string) => string | null; onOpen: (key: string) => void };
export function ManualAccountManager({ accounts, names, onCreate, onRename, onOpen }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  return <section className="manual-accounts" aria-labelledby="manual-accounts-title">
    <div className="manual-accounts-heading"><h3 id="manual-accounts-title">Manual accounts</h3><button type="button" className="accounts-button" onClick={() => setEditing('new')}>Add manual account</button></div>
    <div className="manual-account-list">{accounts.filter(key => key === 'local' || isManualAccountKey(key)).map(key => {
      const name = accountDisplayName(key, names);
      return <article className="manual-account-row" key={key}><div className="manual-account-copy"><h4>{name}</h4><span>No connection required</span></div><div className="manual-account-actions"><button type="button" className="accounts-button" onClick={() => onOpen(key)}>Open account</button><button type="button" className="accounts-button" aria-label={`Rename ${name}`} onClick={() => setEditing(key)}>Rename</button></div></article>;
    })}</div>
    {editing && <AccountNameEditor key={editing} title={editing === 'new' ? 'Add manual account' : 'Rename account'} initial={editing === 'new' ? '' : names[editing] || ''} submitLabel={editing === 'new' ? 'Create account' : 'Save name'} onSave={name => editing === 'new' ? onCreate(name) : onRename(editing, name)} onClose={() => setEditing(null)} />}
  </section>;
}
function AccountNameEditor({ title, initial, submitLabel, onSave, onClose }: {title:string; initial:string; submitLabel:string; onSave:(name:string)=>string|null; onClose:()=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initial), [error, setError] = useState('');
  useEffect(() => { const opener = document.activeElement as HTMLElement | null; const d = dialog.current!; d.showModal(); return () => { d.close(); if(opener?.isConnected) opener.focus(); }; }, []);
  return <dialog ref={dialog} className="utility-dialog manual-account-dialog" aria-labelledby="manual-account-editor-title" onCancel={e => { e.preventDefault(); onClose(); }}><div className="utility-dialog-heading"><h2 id="manual-account-editor-title">{title}</h2><button type="button" aria-label="Close account editor" onClick={onClose}><X aria-hidden="true" /></button></div>
    <form onSubmit={e => { e.preventDefault(); const result = onSave(name); if(result) setError(result); else onClose(); }}><label>Account name<input name="accountName" value={name} onChange={e => {setName(e.target.value);setError('');}} maxLength={128} placeholder="My perps account" required autoFocus /></label>{error && <p role="alert">{error}</p>}<button type="submit" className="accounts-button accounts-button-primary">{submitLabel}</button></form>
  </dialog>;
}
