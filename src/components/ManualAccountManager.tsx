import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { accountDisplayName, type AccountNames } from '../lib/accountNames';
import { isManualAccountKey } from '../lib/manualAccountKeys';
import type { AccountRemovalPreview } from '../lib/accountRemoval';
import '../styles/manualAccounts.css';
type Props = { accounts: string[]; names: AccountNames; onCreate: (name: string) => string | null; onRename: (key: string, name: string) => string | null; onOpen: (key: string) => void; onPrepareRemove: (key: string) => AccountRemovalPreview | null; onRemove: (preview: AccountRemovalPreview) => string | null };
export function ManualAccountManager({ accounts, names, onCreate, onRename, onOpen, onPrepareRemove, onRemove }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ preview: AccountRemovalPreview; name: string } | null>(null);
  const [error, setError] = useState('');
  const remove = (key: string, name: string) => {
    try { const preview = onPrepareRemove(key); if (!preview) { setError('Account storage is busy or your account changed. Try again after saving finishes.'); return; } setError(''); setRemoving({ preview, name }); }
    catch { setError('Saved account data needs review before removal.'); }
  };
  const row = (key: string, manual: boolean) => {
    const name = accountDisplayName(key, names);
    return <article className="manual-account-row" key={key}><div className="manual-account-copy"><h4>{name}</h4><span>{manual ? 'No connection required' : 'Saved trade history'}</span></div><div className="manual-account-actions"><button type="button" className="accounts-button" onClick={() => onOpen(key)}>Open account</button>{manual && <button type="button" className="accounts-button" aria-label={`Rename ${name}`} onClick={() => setEditing(key)}>Rename</button>}<button type="button" className="accounts-button account-remove-button" aria-label={`Remove ${name}`} onClick={() => remove(key, name)}>Remove</button></div></article>;
  };
  const imported = accounts.filter(key => key !== 'local' && !isManualAccountKey(key));
  return <section className="manual-accounts" aria-labelledby="manual-accounts-title">
    <div className="manual-accounts-heading"><h3 id="manual-accounts-title" tabIndex={-1}>Manual accounts</h3><button type="button" className="accounts-button" onClick={() => setEditing('new')}>Add manual account</button></div>
    {error && <p role="alert">{error}</p>}
    <div className="manual-account-list">{accounts.filter(key => key === 'local' || isManualAccountKey(key)).map(key => row(key, true))}</div>
    {imported.length > 0 && <div className="imported-account-history"><h3>Imported accounts</h3><div className="manual-account-list">{imported.map(key => row(key, false))}</div></div>}
    {editing && <AccountNameEditor key={editing} title={editing === 'new' ? 'Add manual account' : 'Rename account'} initial={editing === 'new' ? '' : names[editing] || ''} submitLabel={editing === 'new' ? 'Create account' : 'Save name'} onSave={name => editing === 'new' ? onCreate(name) : onRename(editing, name)} onClose={() => setEditing(null)} />}
    {removing && <AccountRemovalDialog name={removing.name} preview={removing.preview} onRemove={onRemove} onClose={() => setRemoving(null)} />}
  </section>;
}
function AccountRemovalDialog({ name, preview, onRemove, onClose }: { name: string; preview: AccountRemovalPreview; onRemove: (preview: AccountRemovalPreview) => string | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  useEffect(() => { const opener = document.activeElement as HTMLElement | null; const d = dialog.current!; d.showModal(); return () => { d.close(); if (opener?.isConnected) opener.focus(); else document.getElementById('manual-accounts-title')?.focus(); }; }, []);
  return <dialog ref={dialog} className="utility-dialog manual-account-dialog account-removal-dialog" aria-labelledby="account-removal-title" aria-describedby="account-removal-description" onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className="utility-dialog-heading"><h2 id="account-removal-title">Remove account</h2><button type="button" aria-label="Close account removal" onClick={onClose}><X aria-hidden="true" /></button></div>
    <p id="account-removal-description">Remove <strong>{name}</strong> and its {preview.tradeCount} {preview.tradeCount === 1 ? 'trade' : 'trades'} and {preview.noteCount} {preview.noteCount === 1 ? 'journal entry' : 'journal entries'} from Cova?</p>
    <p>Other accounts and your broker account stay unchanged. Notes in All accounts are kept, with links to removed trades cleared. This cannot be undone.</p>
    {error && <p role="alert">{error}</p>}
    <div className="account-removal-actions"><button type="button" className="accounts-button" autoFocus onClick={onClose}>Cancel</button><button type="button" className="accounts-button account-remove-confirm" onClick={() => { const result = onRemove(preview); if (result) setError(result); else onClose(); }}>Remove account</button></div>
  </dialog>;
}
function AccountNameEditor({ title, initial, submitLabel, onSave, onClose }: {title:string; initial:string; submitLabel:string; onSave:(name:string)=>string|null; onClose:()=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initial), [error, setError] = useState('');
  useEffect(() => { const opener = document.activeElement as HTMLElement | null; const d = dialog.current!; d.showModal(); return () => { d.close(); if(opener?.isConnected) opener.focus(); }; }, []);
  return <dialog ref={dialog} className="utility-dialog manual-account-dialog" aria-labelledby="manual-account-editor-title" onCancel={e => { e.preventDefault(); onClose(); }}><div className="utility-dialog-heading"><h2 id="manual-account-editor-title">{title}</h2><button type="button" aria-label="Close account editor" onClick={onClose}><X aria-hidden="true" /></button></div>
    <form onSubmit={e => { e.preventDefault(); const result = onSave(name); if(result) setError(result); else onClose(); }}><label>Account name<input name="accountName" value={name} onChange={e => {setName(e.target.value);setError('');}} maxLength={128} placeholder="My perps account" required autoFocus /></label>{error && <p role="alert">{error}</p>}<button type="submit" className="accounts-button accounts-button-primary">{submitLabel}</button></form>
  </dialog>;
}
