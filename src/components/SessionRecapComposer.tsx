import { Download, ImagePlus, Share2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Trade } from '../lib/risk';
import { buildSessionRecaps, recapMoney, type RecapBackground } from '../lib/sessionRecap';
import { prepareRecapPhoto, recapBackgrounds, recapFormats, renderSessionRecap, type RecapFormat } from '../lib/sessionRecapImage';
import { useRecapProfile } from './UserProfile';

export function SessionRecapAction({ trades }: { trades: readonly Trade[] }) {
  const profile = useRecapProfile();
  const accounts = [...new Set(trades.map(t => t.source?.provider === 'Tradovate' ? `Tradovate:${t.source.accountId}` : t.source?.provider === 'Rithmic' ? `Rithmic:${t.source.accountId}:${t.source.accountKey}` : 'local'))].sort();
  const scope = JSON.stringify([profile.owner, accounts]);
  const [openScope, setOpenScope] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpenScope(null); }, [scope]);
  return <><button ref={trigger} type="button" className="astra-button recap-open" onClick={() => setOpenScope(scope)}><Share2 aria-hidden="true" />Share recap</button>
    {openScope === scope && <SessionRecapComposer key={scope} trades={trades} username={profile.username} avatar={profile.avatar} onClose={() => { setOpenScope(null); if (trigger.current?.isConnected) trigger.current.focus(); }} />}</>;
}
function SessionRecapComposer({ trades, username, avatar, onClose }: { trades: readonly Trade[]; username: string | null; avatar: string | null; onClose: () => void }) {
  const data = useMemo(() => buildSessionRecaps(trades), [trades]);
  const [selection, setSelection] = useState(data.options[0]?.id ?? '');
  const recap = data.options.find(r => r.id === selection);
  const [format, setFormat] = useState<RecapFormat>('story');
  const [background, setBackground] = useState<RecapBackground>(recap?.theme ?? 'new-york');
  const [photo, setPhoto] = useState('');
  const [showIdentity, setShowIdentity] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [rendered, setRendered] = useState<{ key: string; url: string; file: File } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), upload = useRef<HTMLInputElement>(null);
  const activeUrl = useRef('');
  const alive = useRef(true), uploadSequence = useRef(0), shareBusy = useRef(false);
  const renderKey = JSON.stringify([recap, format, background, photo, showIdentity && username, showIdentity && avatar, uploading]);
  const currentKey = useRef(renderKey); currentKey.current = renderKey;
  const ready = !uploading && rendered?.key === renderKey && rendered.url === activeUrl.current ? rendered : null;
  const identity = showIdentity ? username : null;
  const previewAlt = recap ? `${identity ? `@${identity}. ` : ''}${recap.title}, ${recap.dateLabel}. ${recapMoney(recap.totalCents)}, ${recap.basis}. ${recap.count} ${recap.countLabel}, ${recap.winRate} entry win rate. ${recap.sample ? 'Sample data.' : recap.windowLabel}` : '';
  const invalidate = () => { currentKey.current = ''; setRendered(null); setError(''); setNotice(''); };
  useEffect(() => {
    alive.current = true; const element = dialog.current!;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    element.showModal();
    return () => { alive.current = false; uploadSequence.current++; currentKey.current = ''; element.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let url = '';
    if (!recap || uploading) return () => controller.abort();
    void renderSessionRecap({ recap, format, background, customPhoto: photo, username: identity, avatar: showIdentity ? avatar : null }, controller.signal).then(blob => {
      if (controller.signal.aborted || currentKey.current !== renderKey) return;
      url = URL.createObjectURL(blob); activeUrl.current = url;
      const name = `cova-${recap.kind}-${recap.date}-${format}${recap.sample ? '-sample' : ''}.png`;
      setRendered({ key: renderKey, url, file: new File([blob], name, { type: 'image/png' }) });
    }).catch(() => { if (!controller.signal.aborted && currentKey.current === renderKey) setError('The image could not be prepared. Choose another background or Plain.'); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); if (activeUrl.current === url) activeUrl.current = ''; };
  }, [renderKey]); // The key includes every pixel input; changing any input hides the old artifact synchronously.
  function chooseBackground(value: RecapBackground) { uploadSequence.current++; setUploading(false); invalidate(); setBackground(value); }
  function close() { dialog.current?.close(); onClose(); }
  async function choosePhoto(file?: File) {
    if (!file) return;
    const sequence = ++uploadSequence.current; invalidate(); setUploading(true);
    try {
      const result = await prepareRecapPhoto(file);
      if (!alive.current || sequence !== uploadSequence.current) return;
      setPhoto(result); setBackground('custom');
    } catch (cause) { if (alive.current && sequence === uploadSequence.current) setError(cause instanceof Error ? cause.message : 'Choose another photo.'); }
    finally { if (alive.current && sequence === uploadSequence.current) setUploading(false); }
  }
  const canShare = (() => { try { return Boolean(ready && typeof navigator.share === 'function' && navigator.canShare?.({ files: [ready.file] })); } catch { return false; } })();
  function download() {
    if (!ready || (ready.key !== currentKey.current || ready.url !== activeUrl.current)) return;
    const anchor = document.createElement('a'); anchor.href = ready.url; anchor.download = ready.file.name;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setNotice('Image downloaded. Choose it from your social app.');
  }
  async function share() {
    if (!ready || (ready.key !== currentKey.current || ready.url !== activeUrl.current) || !canShare || shareBusy.current) return;
    shareBusy.current = true; setSharing(true); setNotice(''); setError('');
    const key = ready.key;
    try { await navigator.share({ files: [ready.file] }); }
    catch (cause) { if (alive.current && currentKey.current === key && !(cause instanceof Error && cause.name === 'AbortError')) setError('Device sharing is unavailable. Download the image instead.'); }
    finally { shareBusy.current = false; if (alive.current) setSharing(false); }
  }
  return <dialog ref={dialog} className="recap-dialog" aria-labelledby="recap-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }}>
    <header className="recap-heading"><div><h2 id="recap-title">Share your session</h2></div><button type="button" aria-label="Close recap" onClick={close}><X aria-hidden="true" /></button></header>
    <div className="recap-body"><div className="recap-stage" data-format={format} aria-busy={!ready && Boolean(recap)}>
      {ready ? <img data-recap-preview src={ready.url} alt={previewAlt} width="1080" height={recapFormats.find(f => f.id === format)!.height} /> : <div className="recap-wait" role="status">{data.error || (!recap ? 'Choose a session from your current history.' : error || 'Preparing your recap…')}</div>}
    </div><div className="recap-controls">
      <label className="recap-field" htmlFor="recap-session">Session<select id="recap-session" value={recap ? selection : ''} onChange={event => { setSelection(event.target.value); chooseBackground(data.options.find(r => r.id === event.target.value)?.theme ?? 'new-york'); }} disabled={!data.options.length}><option value="" disabled>Choose a session</option>{data.options.map(r => <option key={r.id} value={r.id}>{r.dateLabel} · {r.title}</option>)}</select></label>
      <fieldset><legend>Format</legend><div className="recap-formats">{recapFormats.map(f => <button key={f.id} type="button" aria-pressed={format === f.id} onClick={() => { invalidate(); setFormat(f.id); }} disabled={format === f.id}>{f.label}</button>)}</div></fieldset>
      <fieldset><legend>Background</legend><div className="recap-backgrounds">{recapBackgrounds.map(b => <button key={b.id} type="button" aria-pressed={background === b.id} onClick={() => chooseBackground(b.id)} disabled={background === b.id}><span className="recap-swatch">{b.src && <img src={b.src} alt="" loading="lazy" />}</span><span>{b.label}</span></button>)}{photo && <button type="button" aria-pressed={background === 'custom'} onClick={() => chooseBackground('custom')} disabled={background === 'custom'}><span className="recap-swatch"><img src={photo} alt="" /></span><span>Your photo</span></button>}</div>
        <button type="button" className="recap-upload" onClick={() => upload.current?.click()} disabled={uploading}><ImagePlus aria-hidden="true" />{uploading ? 'Preparing photo…' : 'Use your own photo'}</button><input ref={upload} className="recap-file" aria-label="Upload background photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void choosePhoto(file); }} />
      </fieldset>
      {username && <label className="recap-identity" htmlFor="recap-show-identity"><input id="recap-show-identity" type="checkbox" checked={showIdentity} onChange={event => { invalidate(); setShowIdentity(event.target.checked); }} />Show username and photo</label>}
      <div className="recap-export"><button data-recap-download type="button" onClick={download} disabled={!ready || sharing}><Download aria-hidden="true" />Download image</button>{canShare && <button type="button" onClick={() => void share()} disabled={sharing}><Share2 aria-hidden="true" />{sharing ? 'Sharing…' : 'Share image'}</button>}</div>
      <p className="recap-output-note">{recapFormats.find(f => f.id === format)!.width} × {recapFormats.find(f => f.id === format)!.height} PNG · {format === 'story' ? '9:16' : format === 'feed' ? '4:5' : '1:1'}</p>
      {notice && <p role="status" className="recap-notice">{notice}</p>}{error && <p role="alert" className="recap-error">{error}</p>}
      {recap && <details className="recap-details"><summary>What’s included</summary><p>{recap.windowLabel}. {recap.details}</p><p>Your photo stays in this browser and is not uploaded. Sharing opens your device’s supported destinations; it does not post automatically.</p></details>}
    </div></div>
  </dialog>;
}
