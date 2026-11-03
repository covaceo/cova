import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowLeft, Search, X } from 'lucide-react';
import type { Section } from '../lib/appRoutes';
import type { Trade } from '../lib/risk';
import { tradeAccountKey } from '../lib/tradovateHistory';
import { buildWorkspaceSearchIndex, readWorkspaceSearchJournals, searchWorkspace, tradeSearchFields, type WorkspaceSearchResult } from '../lib/workspaceSearch';
import '../styles/workspaceSearch.css';

export type WorkspaceSearchSource = {
  owner: string;
  scopeKey: string;
  trades: readonly Trade[];
  names: Record<string, string>;
  isCurrent: () => boolean;
};
export type WorkspaceSearchHandle = { open: () => void; revoke: () => void };
const PAGE_SIZE = 30;

/** No query history, URLs, persistence, transport, or copied selected record. */
export const WorkspaceSearch = forwardRef<WorkspaceSearchHandle, { source?: WorkspaceSearchSource; go: (section: Section) => void; onOpenChange?: (open: boolean) => void }>(function WorkspaceSearch({source, go, onOpenChange}, ref) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [revision, refresh] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const authority = useRef<string | null>(null);
  const current = useRef({source, go}); current.current = {source, go};
  const ready = Boolean(source?.isCurrent());
  const namesKey = JSON.stringify(source?.names || {});
  const index = useMemo(() => {
    if (!open || !ready || !source) return [];
    return buildWorkspaceSearchIndex({owner: source.owner, trades: source.trades, names: source.names,
      journals: readWorkspaceSearchJournals(source.owner, [...new Set([...source.trades.map(tradeAccountKey), ...Object.keys(source.names)])])}, source.owner);
  }, [open, ready, source?.owner, source?.scopeKey, source?.trades, namesKey, revision]);
  const results = useMemo(() => searchWorkspace(index, query), [index, query]);
  const selected = selectedKey ? index.find(item => item.key === selectedKey) : undefined;
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));
  const page = Math.floor(activeIndex / PAGE_SIZE);
  const visible = results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const valid = () => !!current.current.source?.isCurrent() && authority.current === current.current.source.scopeKey;
  function close() {
    authority.current = null;
    setOpen(false); setQuery(''); setSelectedKey(null); setActive(0);
  }
  function reveal() {
    const live = current.current.source;
    if (!live?.isCurrent() || document.querySelector('dialog[open]')) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    authority.current = live.scopeKey;
    refresh(value => value + 1); setOpen(true);
  }
  useImperativeHandle(ref, () => ({open: reveal, revoke: () => {
    // Auth callbacks revoke the visible surface before returning, not in a later effect.
    authority.current = null;
    dialogRef.current?.close();
    flushSync(() => close());
  }}));
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey && !event.isComposing) {
        event.preventDefault();
        if (dialogRef.current?.open) { setSelectedKey(null); inputRef.current?.focus(); }
        else reveal();
      }
    };
    const request = () => reveal();
    const update = () => flushSync(() => refresh(value => value + 1));
    window.addEventListener('keydown', keyboard);
    window.addEventListener('cova:open-workspace-search', request);
    for (const name of ['storage','cova:workspace-local-change','cova:account-names']) window.addEventListener(name, update);
    return () => {
      window.removeEventListener('keydown', keyboard); window.removeEventListener('cova:open-workspace-search', request);
      for (const name of ['storage','cova:workspace-local-change','cova:account-names']) window.removeEventListener(name, update);
    };
  }, []);
  useLayoutEffect(() => { if (open && (!ready || authority.current !== source?.scopeKey)) close(); }, [open, ready, source?.scopeKey]);
  useLayoutEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  useLayoutEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current, previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; dialog?.showModal(); inputRef.current?.focus();
    return () => {
      dialog?.close(); document.body.style.overflow = previous;
      requestAnimationFrame(() => {
        const original = opener.current;
        const target = original?.isConnected && original.checkVisibility() ? original
          : [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Search workspace"]')].find(button => button.checkVisibility());
        if (target && !document.querySelector('dialog[open]')) target.focus();
      });
    };
  }, [open]);
  useLayoutEffect(() => {
    if (selectedKey) dialogRef.current?.querySelector<HTMLButtonElement>('.workspace-search-back')?.focus();
    else if (open) inputRef.current?.focus();
  }, [selectedKey]);
  useLayoutEffect(() => { dialogRef.current?.querySelector(`#workspace-search-option-${activeIndex}`)?.scrollIntoView({block:'nearest'}); }, [activeIndex, page, selectedKey, query]);
  function activate(item: WorkspaceSearchResult) {
    if (!valid()) { close(); return; }
    // Resolve by identity in the current index, never a captured record object.
    const live = index.find(row => row.key === item.key);
    if (!live) return;
    if (live.kind === 'Page') { close(); current.current.go(live.section); }
    else setSelectedKey(live.key);
  }
  function back() { setSelectedKey(null); requestAnimationFrame(() => inputRef.current?.focus()); }
  const snippet = (text: string) => {
    const token = query.trim().split(/\s+/u).find(word => text.toLocaleLowerCase().includes(word.toLocaleLowerCase()));
    const start = token ? Math.max(0, text.toLocaleLowerCase().indexOf(token.toLocaleLowerCase()) - 45) : 0;
    return (start ? '…' : '') + text.slice(start, start + 180) + (text.length > start + 180 ? '…' : '');
  };
  if (!open || !ready || authority.current !== source?.scopeKey) return null;
  return <dialog id="cova-workspace-search" ref={dialogRef} className="workspace-search-dialog" aria-labelledby="workspace-search-title" aria-describedby="workspace-search-scope"
    onCancel={event => {event.preventDefault();close();}}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input,[tabindex="0"]')].filter(el => el.tabIndex >= 0 && el.checkVisibility());
      const first = controls[0], last = controls[controls.length-1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
    }}>
    <header className="workspace-search-header"><div><h2 id="workspace-search-title">Search workspace</h2><p id="workspace-search-scope">Pages, trades & notes · All loaded accounts</p></div><button type="button" onClick={close} aria-label="Close search"><X aria-hidden="true" /></button></header>
    {selectedKey ? <section className="workspace-search-detail" aria-label="Search result details" tabIndex={0}>
      <button type="button" className="workspace-search-back" onClick={back}><ArrowLeft aria-hidden="true" />Back to results</button>
      {selected ? <><p className="workspace-search-meta">{selected.kind} · Read only</p><h3>{selected.title}</h3><p className="workspace-search-meta">{selected.context}</p>
        {selected.kind === 'Trade' && <dl>{tradeSearchFields(selected.trade).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        {selected.kind === 'Journal note' && <><p className="workspace-search-note">{selected.journal.note || 'No note text.'}</p>{selected.journal.tradeId && <div className="workspace-search-attachment"><p>Attached trade</p>{(() => {
          const matches = index.filter(item => item.kind === 'Trade' && item.trade.id === selected.journal.tradeId && (selected.journal.account === 'all' || item.account === selected.journal.account));
          return matches.length === 1 ? <button type="button" onClick={() => activate(matches[0])}>{matches[0].title} · {matches[0].context}</button> : <p>Attached trade is no longer available or its identity is ambiguous.</p>;
        })()}</div>}</>}
      </> : <p role="status">This result is no longer available. Search again for current records.</p>}
    </section> : <>
      <div className="workspace-search-field"><Search aria-hidden="true" /><input ref={inputRef} type="text" role="combobox" aria-label="Search workspace" aria-autocomplete="list" aria-expanded="true" aria-controls="workspace-search-results" aria-activedescendant={results.length ? `workspace-search-option-${activeIndex}` : undefined} autoComplete="off" spellCheck={false} placeholder="Search pages, markets, setups, notes…" value={query}
        onChange={event => {setQuery(event.target.value);setActive(0);}}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault();setActive(Math.max(0,Math.min(results.length-1,activeIndex+(event.key==='ArrowDown'?1:-1))));}
          if (event.key === 'Enter') {event.preventDefault();if(results[activeIndex])activate(results[activeIndex]);}
        }} />{query && <button type="button" aria-label="Clear search" onClick={() => {setQuery('');setActive(0);inputRef.current?.focus();}}><X aria-hidden="true" /></button>}</div>
      <p className="workspace-search-count" role="status">{query.trim() ? `${results.length} ${results.length===1?'result':'results'}` : 'Find a page, trade or journal note'}</p>
      <div id="workspace-search-results" className="workspace-search-results" role="listbox" aria-label="Workspace results">
        {visible.map((item,i) => <button type="button" role="option" tabIndex={-1} id={`workspace-search-option-${page*PAGE_SIZE+i}`} key={item.key} aria-selected={activeIndex===page*PAGE_SIZE+i} onMouseMove={() => setActive(page*PAGE_SIZE+i)} onClick={() => activate(item)}>
          <span className="workspace-search-result-heading"><strong>{item.title}</strong><small>{item.kind}</small></span><span className="workspace-search-meta">{item.context}</span>{item.kind !== 'Page' && item.text && <span className="workspace-search-snippet">{snippet(item.text)}</span>}
        </button>)}
      </div>
      {!results.length && <p className="workspace-search-empty">No matches in your loaded workspace. Try a market, setup, date or words from a note.</p>}
      {results.length > PAGE_SIZE && <nav className="workspace-search-pagination" aria-label="Search result pages"><button type="button" disabled={page===0} onClick={() => setActive((page-1)*PAGE_SIZE)}>Previous</button><span>{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,results.length)} of {results.length}</span><button type="button" disabled={(page+1)*PAGE_SIZE>=results.length} onClick={() => setActive((page+1)*PAGE_SIZE)}>Next</button></nav>}
      <p className="workspace-search-help">↑ ↓ to select · Enter to open · Esc to close</p>
    </>}
  </dialog>;
});
