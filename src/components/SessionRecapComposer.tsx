import { Download, ImagePlus, Share2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Trade } from '../lib/risk';
import { readBrokerCashEvidence } from '../lib/brokerCash';
import { buildSessionRecaps, recapExportError, recapFeeLine, recapHeadlineCents, recapHotStreakLine, recapMoney, type RecapBackground } from '../lib/sessionRecap';
import { prepareRecapPhoto, recapBackgrounds, recapFormats, renderSessionRecap, type RecapFormat } from '../lib/sessionRecapImage';
import { useRecapProfile } from './UserProfile';
import { RecapBackgroundEditor } from './RecapBackgroundEditor';
import { defaultRecapTransform, type RecapTransform } from '../lib/recapBackground';
import type { PreparedRecapGif } from '../lib/recapGif';

export function SessionRecapAction({ trades }: { trades: readonly Trade[] }) {
  const profile = useRecapProfile();
  const accounts = [...new Set(trades.map(t => t.source?.provider === 'Tradovate' ? `Tradovate:${t.source.accountId}` : t.source?.provider === 'Rithmic' ? `Rithmic:${t.source.accountId}:${t.source.accountKey}` : 'local'))].sort();
  const scope = JSON.stringify([profile.owner, accounts]);
  const [openScope, setOpenScope] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpenScope(null); }, [scope]);
  return <><button ref={trigger} type="button" className="astra-button recap-open" onClick={() => setOpenScope(scope)}><Share2 aria-hidden="true" />Share recap</button>
    {openScope === scope && <SessionRecapComposer key={scope} trades={trades} profile={profile} onClose={() => { setOpenScope(null); if (trigger.current?.isConnected) trigger.current.focus(); }} />}</>;
}
function SessionRecapComposer({ trades, profile, onClose }: { trades: readonly Trade[]; profile: ReturnType<typeof useRecapProfile>; onClose: () => void }) {
  const { username, avatar } = profile;
  const [cashRevision, setCashRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setCashRevision(value => value + 1);
    window.addEventListener('storage', refresh); window.addEventListener('cova-broker-cash-updated', refresh); window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('cova-broker-cash-updated', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  const data = useMemo(() => buildSessionRecaps(trades, readBrokerCashEvidence(trades, profile.owner)), [trades, profile.owner, cashRevision]);
  const [selection, setSelection] = useState(data.options[0]?.id ?? '');
  const recap = data.options.find(r => r.id === selection);
  const feeIssue = recap ? recapExportError(recap) : '';
  const [format, setFormat] = useState<RecapFormat>('story');
  const [background, setBackground] = useState<RecapBackground>(recap?.theme ?? 'new-york');
  const [photo, setPhoto] = useState('');
  const [customSize, setCustomSize] = useState({ width: 1, height: 1 });
  const [gif, setGif] = useState<(PreparedRecapGif & { url: string }) | null>(null);
  const [transform, setTransform] = useState<RecapTransform>(defaultRecapTransform);
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [foreground, setForeground] = useState<{ key: string; url: string; blob: Blob } | null>(null);
  const [gifProgress, setGifProgress] = useState<number | null>(null);
  const gifExport = useRef<AbortController | null>(null), gifUpload = useRef<AbortController | null>(null);
  const downloadUrls = useRef(new Set<string>());
  const [showIdentity, setShowIdentity] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [rendered, setRendered] = useState<{ key: string; url: string; file: File } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), upload = useRef<HTMLInputElement>(null);
  const activeUrl = useRef(''), foregroundUrl = useRef('');
  const alive = useRef(true), uploadSequence = useRef(0), shareBusy = useRef(false);
  const identityPending = showIdentity && (profile.loading || Boolean(profile.error));
  const foregroundKey = JSON.stringify([recap, format, background, photo, showIdentity && username, showIdentity && avatar, uploading, identityPending]);
  const renderKey = JSON.stringify([foregroundKey, transform]);
  const currentKey = useRef(renderKey); currentKey.current = renderKey;
  const ready = !feeIssue && !identityPending && !uploading && rendered?.key === renderKey && rendered.url === activeUrl.current ? rendered : null;
  const identity = showIdentity ? username : null;
  const previewAlt = recap ? `${identity ? `@${identity}. ` : ''}${recap.title}, ${recap.dateLabel}. ${recapHeadlineCents(recap) !== null ? recapMoney(recapHeadlineCents(recap)!) : 'Result pending fees'}${recap.fees ? ' after fees' : recap.sample ? '' : ', ' + recap.basis}. ${recap.count} ${recap.countLabel}, ${recap.winRate} win rate.${recapHotStreakLine(recap) ? ' ' + recapHotStreakLine(recap) + '.' : ''}${recap.sample ? ' Sample data.' : ''}` : '';
  const invalidate = () => { currentKey.current = ''; gifExport.current?.abort(); setGifProgress(null); setRendered(null); setError(''); setNotice(''); };
  function changeTransform(value: RecapTransform) { if (value.x === transform.x && value.y === transform.y && value.zoom === transform.zoom) return; invalidate(); setTransform(value); }
  const preset = recapFormats.find(f => f.id === format)!;
  const activeForeground = !feeIssue && !identityPending && !uploading && foreground?.key === foregroundKey && foreground.url === foregroundUrl.current ? foreground : null;
  useEffect(() => {
    alive.current = true; const element = dialog.current!;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    element.showModal();
    return () => { alive.current = false; uploadSequence.current++; currentKey.current = ''; gifExport.current?.abort(); gifUpload.current?.abort(); downloadUrls.current.forEach(url => URL.revokeObjectURL(url)); element.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => () => { if (gif) { URL.revokeObjectURL(gif.url); URL.revokeObjectURL(gif.poster); } }, [gif]);
  useEffect(() => { gifExport.current?.abort(); setGifProgress(null); }, [renderKey]);
  useEffect(() => {
    const controller = new AbortController(); let url = '';
    if (!recap || feeIssue || uploading || identityPending || background !== 'custom') return () => controller.abort();
    void renderSessionRecap({ recap, format, background, username: identity, avatar: showIdentity ? avatar : null }, controller.signal, true).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); foregroundUrl.current = url; setForeground({ key: foregroundKey, url, blob });
    }).catch(() => { if (!controller.signal.aborted) setError('The recap could not be prepared. Try another background.'); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); if (foregroundUrl.current === url) foregroundUrl.current = ''; };
  }, [foregroundKey]);
  useEffect(() => {
    const controller = new AbortController(); let url = '';
    if (!recap || feeIssue || uploading || identityPending) return () => controller.abort();
    const timer = setTimeout(() => { void renderSessionRecap({ recap, format, background, customPhoto: photo, transform, username: identity, avatar: showIdentity ? avatar : null }, controller.signal).then(blob => {
      if (controller.signal.aborted || currentKey.current !== renderKey) return;
      url = URL.createObjectURL(blob); activeUrl.current = url;
      const name = `cova-${recap.kind}-${recap.date}-${format}${recap.sample ? '-sample' : ''}.png`;
      setRendered({ key: renderKey, url, file: new File([blob], name, { type: 'image/png' }) });
    }).catch(() => { if (!controller.signal.aborted && currentKey.current === renderKey) setError('The saved photo, background or Cova logo could not be loaded. Try again, hide identity or choose another image.'); }); }, background === 'custom' ? 120 : 0);
    return () => { clearTimeout(timer); controller.abort(); if (url) URL.revokeObjectURL(url); if (activeUrl.current === url) activeUrl.current = ''; };
  }, [renderKey]); // The key includes every pixel input; changing any input hides the old artifact synchronously.
  function chooseBackground(value: RecapBackground) { uploadSequence.current++; gifUpload.current?.abort(); setUploading(false); invalidate(); setTransform(defaultRecapTransform); setBackground(value); }
  function close() { dialog.current?.close(); onClose(); }
  async function choosePhoto(file?: File) {
    if (!file) return;
    const sequence = ++uploadSequence.current; invalidate(); setUploading(true);
    gifUpload.current?.abort(); const controller = new AbortController(); gifUpload.current = controller;
    try {
      if (file.type === 'image/gif') {
        const { prepareRecapGif } = await import('../lib/recapGif');
        const result = await prepareRecapGif(file, controller.signal);
        if (!alive.current || sequence !== uploadSequence.current) { URL.revokeObjectURL(result.poster); return; }
        setGif({ ...result, url: URL.createObjectURL(file) }); setPhoto(result.poster);
        setCustomSize({ width: result.width, height: result.height });
      } else {
        const result = await prepareRecapPhoto(file);
        const img = new Image(); img.src = result; await img.decode();
        if (!alive.current || sequence !== uploadSequence.current) return;
        setGif(null); setPhoto(result); setCustomSize({ width: img.naturalWidth, height: img.naturalHeight });
      }
      if (!alive.current || sequence !== uploadSequence.current) return;
      setTransform(defaultRecapTransform); setBackground('custom');
    } catch (cause) { if (alive.current && sequence === uploadSequence.current) setError(cause instanceof Error ? cause.message : 'Choose another photo.'); }
    finally { if (alive.current && sequence === uploadSequence.current) setUploading(false); }
  }
  async function downloadGif() {
    if (!ready || ready.key !== currentKey.current || !gif || background !== 'custom' || !activeForeground || gifExport.current && !gifExport.current.signal.aborted) return;
    const key = currentKey.current, controller = new AbortController(); gifExport.current = controller;
    setGifProgress(0); setError(''); setNotice('');
    try {
      const { exportRecapGif } = await import('../lib/recapGif');
      const blob = await exportRecapGif(gif.file, activeForeground.blob, preset.width, preset.height, transform, controller.signal, value => {
        if (alive.current && !controller.signal.aborted && currentKey.current === key) setGifProgress(value);
      });
      if (!alive.current || controller.signal.aborted || currentKey.current !== key) return;
      const url = URL.createObjectURL(blob); downloadUrls.current.add(url);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = ready.file.name.replace(/\.png$/, '.gif');
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => { URL.revokeObjectURL(url); downloadUrls.current.delete(url); }, 60000);
    } catch (cause) { if (alive.current && !controller.signal.aborted && currentKey.current === key) setError(cause instanceof Error ? cause.message : 'GIF export failed. Try another file.'); }
    finally { if (gifExport.current === controller) { gifExport.current = null; if (alive.current) setGifProgress(null); } }
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
    <div className="recap-body"><div className="recap-stage" data-format={format} aria-busy={!ready && !feeIssue && Boolean(recap)}>
      {background === 'custom' && activeForeground && <RecapBackgroundEditor source={gif && playing ? gif.url : photo} foreground={activeForeground.url} alt={previewAlt} width={preset.width} height={preset.height} sourceWidth={customSize.width} sourceHeight={customSize.height} transform={transform} onChange={changeTransform} />}
      {ready ? <img className={background === 'custom' && activeForeground ? 'recap-still-proof' : undefined} data-recap-preview src={ready.url} alt={previewAlt} width="1080" height={recapFormats.find(f => f.id === format)!.height} /> : !(background === 'custom' && activeForeground) && <div className="recap-wait" role="status">{data.error || (!recap ? 'Choose a session from your current history.' : feeIssue || (identityPending ? profile.loading ? 'Loading saved profile…' : 'Saved profile unavailable. Retry or hide identity.' : error || 'Preparing your recap…'))}</div>}
    </div><div className="recap-controls">
      <label className="recap-field" htmlFor="recap-session">Session<select id="recap-session" value={recap ? selection : ''} onChange={event => { setSelection(event.target.value); chooseBackground(data.options.find(r => r.id === event.target.value)?.theme ?? 'new-york'); }} disabled={!data.options.length}><option value="" disabled>Choose a session</option>{data.options.map(r => <option key={r.id} value={r.id}>{r.dateLabel} · {r.title}</option>)}</select></label>
      <fieldset><legend>Format</legend><div className="recap-formats">{recapFormats.map(f => <button key={f.id} type="button" aria-pressed={format === f.id} onClick={() => { invalidate(); setFormat(f.id); }} disabled={format === f.id}>{f.label}</button>)}</div></fieldset>
      <fieldset><legend>Background</legend><div className="recap-backgrounds">{recapBackgrounds.map(b => <button key={b.id} type="button" aria-pressed={background === b.id} onClick={() => chooseBackground(b.id)} disabled={background === b.id}><span className="recap-swatch">{b.src && <img src={b.src} alt="" loading="lazy" />}</span><span>{b.label}</span></button>)}{photo && <button type="button" aria-pressed={background === 'custom'} onClick={() => chooseBackground('custom')} disabled={background === 'custom'}><span className="recap-swatch"><img src={photo} alt="" /></span><span>{gif ? 'Your GIF' : 'Your photo'}</span></button>}</div>
        <button type="button" className="recap-upload" onClick={() => upload.current?.click()} disabled={uploading}><ImagePlus aria-hidden="true" />{uploading ? 'Preparing background…' : 'Upload photo or GIF'}</button><input ref={upload} className="recap-file" aria-label="Upload background photo or GIF" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void choosePhoto(file); }} />
      </fieldset>
      {background === 'custom' && photo && <fieldset className="recap-transform"><legend>Position background</legend>
        <label htmlFor="recap-zoom">Zoom <output>{transform.zoom.toFixed(1)}×</output></label>
        <input id="recap-zoom" type="range" min="1" max="3" step="0.05" value={transform.zoom} onChange={event => changeTransform({ ...transform, zoom: Number(event.target.value) })} />
        <div className="recap-transform-actions"><span>Drag to move</span><button type="button" onClick={() => changeTransform(defaultRecapTransform)}>Reset</button>{gif && <button type="button" aria-pressed={!playing} onClick={() => setPlaying(value => !value)}>{playing ? 'Pause' : 'Play'}</button>}</div>
      </fieldset>}
      {(username || profile.owner !== 'preview') && <label className="recap-identity" htmlFor="recap-show-identity"><input id="recap-show-identity" type="checkbox" checked={showIdentity} onChange={event => { invalidate(); setShowIdentity(event.target.checked); }} />Show username and photo</label>}
      {showIdentity && profile.error && <button type="button" className="recap-upload" onClick={profile.retry}>Retry saved profile</button>}
      {showIdentity && username && !avatar && !identityPending && <p role="status" className="recap-output-note">No saved profile photo. Add one in Settings → Profile.</p>}
      <div className="recap-export">{gif && background === 'custom' && <><button data-recap-gif-download type="button" onClick={() => void downloadGif()} disabled={!ready || !activeForeground || sharing || gifProgress !== null}><Download aria-hidden="true" />{gifProgress === null ? 'Download GIF' : `Exporting ${gifProgress}%`}</button>{gifProgress !== null && <button type="button" onClick={() => { gifExport.current?.abort(); setGifProgress(null); }}>Cancel export</button>}</>}<button data-recap-download type="button" onClick={download} disabled={!ready || sharing}><Download aria-hidden="true" />{gif && background === 'custom' ? 'Download PNG' : 'Download image'}</button>{canShare && <button type="button" onClick={() => void share()} disabled={sharing}><Share2 aria-hidden="true" />{sharing ? 'Sharing…' : 'Share image'}</button>}</div>
      <p className="recap-output-note">{recapFormats.find(f => f.id === format)!.width} × {recapFormats.find(f => f.id === format)!.height} {gif && background === 'custom' ? 'GIF / PNG' : 'PNG'} · {format === 'story' ? '9:16' : format === 'feed' ? '4:5' : '1:1'}</p>
      {notice && <p role="status" className="recap-notice">{notice}</p>}{error && <p role="alert" className="recap-error">{error}</p>}
      {recap && <details className="recap-details"><summary>What’s included</summary><p>{recap.windowLabel}. {recap.details}</p>{recap.fees && <p>{recapFeeLine(recap)}. Cash snapshot: {recap.fees.asOf}.</p>}<p>Your background stays in this browser and is not uploaded. Sharing opens your device’s supported destinations; it does not post automatically.</p></details>}
    </div></div>
  </dialog>;
}
