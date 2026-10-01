import { resolveManualNetConfirmations } from '../lib/manualNetConfirmation';
import type { ConfirmManualNet } from '../lib/manualTrades';
import { useRecapConnection } from './RecapConnection';
import { recapVerificationCurrent, recapVerificationKey } from '../lib/recapVerification';
import { Download, ImagePlus, Share2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Trade } from '../lib/risk';
import { readBrokerCashEvidence } from '../lib/brokerCash';
import { buildSessionRecaps, recapExportError, recapFeeLine, recapHeadlineCents, recapMoney, type RecapBackground } from '../lib/sessionRecap';
import { prepareRecapPhoto, recapBackgrounds, recapFormats, renderSessionRecap, type RecapFormat } from '../lib/sessionRecapImage';
import { useRecapProfile } from './UserProfile';
import { RecapBackgroundEditor } from './RecapBackgroundEditor';
import { defaultRecapTransform, type RecapTransform } from '../lib/recapBackground';
import type { PreparedRecapGif } from '../lib/recapGif';

export function SessionRecapAction({ trades, selectedAccount = 'local', onConfirmManualNet }: { trades: readonly Trade[]; selectedAccount?: string; onConfirmManualNet?: ConfirmManualNet }) {
  const profile = useRecapProfile();
  const accounts = [...new Set(trades.map(t => t.source?.provider === 'Tradovate' ? `Tradovate:${t.source.accountId}` : t.source?.provider === 'Rithmic' ? `Rithmic:${t.source.accountId}:${t.source.accountKey}` : 'local'))].sort();
  const scope = JSON.stringify([profile.owner, selectedAccount, accounts]);
  const [openScope, setOpenScope] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpenScope(null); }, [scope]);
  return <><button ref={trigger} type="button" className="astra-button recap-open" onClick={() => setOpenScope(scope)}><Share2 aria-hidden="true" />Share recap</button>
    {openScope === scope && <SessionRecapComposer key={scope} trades={trades} selectedAccount={selectedAccount} onConfirmManualNet={onConfirmManualNet} profile={profile} onClose={() => { setOpenScope(null); if (trigger.current?.isConnected) trigger.current.focus(); }} />}</>;
}
function SessionRecapComposer({ trades, selectedAccount, onConfirmManualNet, profile, onClose }: { trades: readonly Trade[]; selectedAccount: string; onConfirmManualNet?: ConfirmManualNet; profile: ReturnType<typeof useRecapProfile>; onClose: () => void }) {
  const { username, avatar } = profile;
  const connection = useRecapConnection(profile.owner, selectedAccount);
  const [cashRevision, setCashRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setCashRevision(value => value + 1);
    window.addEventListener('cova:recap-provenance', refresh); window.addEventListener('storage', refresh); window.addEventListener('cova-broker-cash-updated', refresh); window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('cova:recap-provenance', refresh); window.removeEventListener('storage', refresh); window.removeEventListener('cova-broker-cash-updated', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  const data = useMemo(() => buildSessionRecaps(resolveManualNetConfirmations(trades, profile.owner), readBrokerCashEvidence(trades.filter(t => t.source?.provider === 'Tradovate'), profile.owner), { owner: profile.owner, selectedAccount, connection }), [trades, profile.owner, selectedAccount, connection, cashRevision]);
  const [selection, setSelection] = useState(data.options[0]?.id ?? '');
  const recap = data.options.find(r => r.id === selection);
  const sourceScope = recap?.sourceScope ?? data.options[0]?.sourceScope;
  const sessionOptions = data.options.filter(r => r.sourceScope === sourceScope);
  const grossManualRows = trades.filter(t => recap?.grossManualRowIds?.includes(t.id));
  const feeIssue = recap ? recapExportError(recap) : '';
  const [format, setFormat] = useState<RecapFormat>('wide');
  const [background, setBackground] = useState<RecapBackground>('blue-tower');
  const [photo, setPhoto] = useState('');
  const [customSize, setCustomSize] = useState({ width: 1, height: 1 });
  const [gif, setGif] = useState<(PreparedRecapGif & { url: string }) | null>(null);
  const [transform, setTransform] = useState<RecapTransform>(defaultRecapTransform);
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [foreground, setForeground] = useState<{ key: string; url: string; blob: Blob } | null>(null);
  const [gifProgress, setGifProgress] = useState<number | null>(null);
  const [fileType, setFileType] = useState<'png' | 'gif'>('png');
  const gifExport = useRef<AbortController | null>(null), gifUpload = useRef<AbortController | null>(null);
  const downloadUrls = useRef(new Set<string>());
  const [showPnl, setShowPnl] = useState(true);
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
  const proofRef = useRef(recap?.verification); proofRef.current = recap?.verification;
  const proofKey = recapVerificationKey(recap?.verification);
  const verificationCurrent = () => Boolean(proofKey && recapVerificationKey(proofRef.current) === proofKey && recapVerificationCurrent(proofRef.current));
  const renderRecap = recap ? { ...recap, verification: proofKey } : recap;
  const foregroundKey = JSON.stringify([renderRecap, format, background, photo, Boolean(gif && background === 'custom'), showPnl, showIdentity && username, showIdentity && avatar, uploading, identityPending]);
  const renderKey = JSON.stringify([foregroundKey, transform]);
  const currentKey = useRef(renderKey); currentKey.current = renderKey;
  const ready = (!recap?.verification || recapVerificationCurrent(recap.verification)) && !feeIssue && !identityPending && !uploading && rendered?.key === renderKey && rendered.url === activeUrl.current ? rendered : null;
  const identity = showIdentity ? username : null;
  const previewAlt = recap ? `${identity ? `@${identity}. ` : ''}${recap.sourceScope ? `${recap.sourceScope} records only. ` : ''}${recap.title}, ${recap.dateLabel}. ${recap.markets}. ${!showPnl ? 'P&L hidden' : recapHeadlineCents(recap) !== null ? recapMoney(recapHeadlineCents(recap)!) : 'Result pending fees'}${!showPnl ? '' : (recap.fees || recap.reportedNet) ? ' after fees' : recap.sample ? '' : ', ' + recap.basis}. ${recap.count} ${recap.countLabel}, ${recap.winRate} win rate.${recapVerificationCurrent(recap.verification) ? ' Verified.' : ''}${recap.sample ? ' Sample data.' : ''}` : '';
  const invalidate = () => { currentKey.current = ''; gifExport.current?.abort(); setGifProgress(null); setRendered(null); setError(''); setNotice(''); };
  function changeTransform(value: RecapTransform) { if (value.x === transform.x && value.y === transform.y && value.zoom === transform.zoom) return; invalidate(); setTransform(value); }
  const preset = recapFormats.find(f => f.id === format)!;
  const activeForeground = (!recap?.verification || recapVerificationCurrent(recap.verification)) && !feeIssue && !identityPending && !uploading && foreground?.key === foregroundKey && foreground.url === foregroundUrl.current ? foreground : null;
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
    void renderSessionRecap({ recap, format, background, animatedBackground: Boolean(gif && background === 'custom'), username: identity, avatar: showIdentity ? avatar : null, showPnl, verificationCurrent }, controller.signal, true).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); foregroundUrl.current = url; setForeground({ key: foregroundKey, url, blob });
    }).catch(() => { if (!controller.signal.aborted) setError('The recap could not be prepared. Try another background.'); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); if (foregroundUrl.current === url) foregroundUrl.current = ''; };
  }, [foregroundKey]);
  useEffect(() => {
    const controller = new AbortController(); let url = '';
    if (!recap || feeIssue || uploading || identityPending) return () => controller.abort();
    const timer = setTimeout(() => { void renderSessionRecap({ recap, format, background, animatedBackground: Boolean(gif && background === 'custom'), customPhoto: photo, transform, username: identity, avatar: showIdentity ? avatar : null, showPnl, verificationCurrent }, controller.signal).then(blob => {
      if (controller.signal.aborted || currentKey.current !== renderKey) return;
      url = URL.createObjectURL(blob); activeUrl.current = url;
      const name = `cova-${recap.kind}-${recap.date}-${format}${recap.sample ? '-sample' : ''}.png`;
      setRendered({ key: renderKey, url, file: new File([blob], name, { type: 'image/png' }) });
    }).catch(() => { if (!controller.signal.aborted && currentKey.current === renderKey) setError('The saved photo, background or Cova logo could not be loaded. Try again, hide identity or choose another image.'); }); }, background === 'custom' ? 120 : 0);
    return () => { clearTimeout(timer); controller.abort(); if (url) URL.revokeObjectURL(url); if (activeUrl.current === url) activeUrl.current = ''; };
  }, [renderKey]); // The key includes every pixel input; changing any input hides the old artifact synchronously.
  function chooseBackground(value: RecapBackground) { setFileType('png'); uploadSequence.current++; gifUpload.current?.abort(); setUploading(false); invalidate(); setTransform(defaultRecapTransform); setBackground(value); }
  function close() { dialog.current?.close(); onClose(); }
  async function choosePhoto(file?: File) {
    if (!file) return;
    const sequence = ++uploadSequence.current; setFileType('png'); invalidate(); setUploading(true);
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
    if (recap?.verification && !verificationCurrent()) return;
    if (!ready || ready.key !== currentKey.current || !gif || background !== 'custom' || !activeForeground || gifExport.current && !gifExport.current.signal.aborted) return;
    const key = currentKey.current, controller = new AbortController(); gifExport.current = controller;
    setGifProgress(0); setError(''); setNotice('');
    try {
      const { exportRecapGif } = await import('../lib/recapGif');
      const blob = await exportRecapGif(gif.file, activeForeground.blob, preset.width, preset.height, transform, controller.signal, value => {
        if (alive.current && !controller.signal.aborted && currentKey.current === key) setGifProgress(value);
      });
      if (!alive.current || controller.signal.aborted || currentKey.current !== key || recap?.verification && !verificationCurrent()) return;
      const url = URL.createObjectURL(blob); downloadUrls.current.add(url);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = ready.file.name.replace(/\.png$/, '.gif');
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => { URL.revokeObjectURL(url); downloadUrls.current.delete(url); }, 60000);
    } catch (cause) { if (alive.current && !controller.signal.aborted && currentKey.current === key) setError(cause instanceof Error ? cause.message : 'GIF export failed. Try another file.'); }
    finally { if (gifExport.current === controller) { gifExport.current = null; if (alive.current) setGifProgress(null); } }
  }
  function exportCurrent() {
    return Boolean(ready && ready.key === currentKey.current && ready.url === activeUrl.current && (!recap?.verification || verificationCurrent()));
  }
  function download() {
    if (!exportCurrent() || !ready) return;
    const anchor = document.createElement('a'); anchor.href = ready.url; anchor.download = ready.file.name;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setNotice('Image downloaded.');
  }
  async function shareOnX() {
    if (!exportCurrent() || !ready || shareBusy.current) return;
    const file = ready.file, key = ready.key;
    let canShare = false;
    try { canShare = typeof navigator.share === 'function' && Boolean(navigator.canShare?.({ files: [file] })); } catch { /* Unsupported file type uses the explicit fallback below. */ }
    setError('');
    if (canShare) {
      shareBusy.current = true; setSharing(true); setNotice('Choose X in your device’s share menu to attach this image.');
      try { await navigator.share({ files: [file] }); }
      catch (cause) {
        if (alive.current && currentKey.current === key) {
          setNotice('');
          // Cancelling never downloads, opens X, or retries sharing on its own.
          if (!(cause instanceof Error && cause.name === 'AbortError')) setError('Device sharing is unavailable. Download the image instead and attach it in X.');
        }
      } finally { shareBusy.current = false; if (alive.current) setSharing(false); }
      return;
    }
    // X web intents accept text, not local file attachments. Keep the fallback
    // explicit. Sharing retains the existing PNG-still behavior for GIF backgrounds.
    download();
    window.open('https://x.com/intent/post?text=' + encodeURIComponent(previewAlt + ' covadesk.com'), '_blank', 'noopener,noreferrer');
    setNotice('Image downloaded. Attach it manually in X; the composer contains text only. If X did not open, select and copy the caption below.');
  }
  return <dialog ref={dialog} className="recap-dialog" aria-labelledby="recap-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }}>
    <header className="recap-heading"><div><h2 id="recap-title">Session recap</h2></div><button type="button" aria-label="Close recap" onClick={close}><X aria-hidden="true" /></button></header>
    <div className="recap-body"><div className="recap-stage" data-format={format} aria-busy={!ready && !feeIssue && Boolean(recap)}>
      {background === 'custom' && activeForeground && <RecapBackgroundEditor source={gif && playing ? gif.url : photo} foreground={activeForeground.url} alt={previewAlt} width={preset.width} height={preset.height} sourceWidth={customSize.width} sourceHeight={customSize.height} transform={transform} onChange={changeTransform} />}
      {ready ? <img className={background === 'custom' && activeForeground ? 'recap-still-proof' : undefined} data-recap-preview src={ready.url} alt={previewAlt} width={preset.width} height={preset.height} /> : !(background === 'custom' && activeForeground) && <div className="recap-wait" role="status">{data.error || (!recap ? 'Choose a session from your current history.' : feeIssue || (identityPending ? profile.loading ? 'Loading saved profile…' : 'Saved profile unavailable. Retry or hide identity.' : error || 'Preparing your recap…'))}</div>}
    </div><div className="recap-controls">
      {sourceScope && <label className="recap-field" htmlFor="recap-source">Trade source<select id="recap-source" value={sourceScope} onChange={event => {
        const options = data.options.filter(r => r.sourceScope === event.target.value);
        const next = options.find(r => r.date === recap?.date && r.kind === recap?.kind) ?? options[0];
        setSelection(next?.id ?? ''); invalidate();
      }}><option value="Manual">Manual</option><option value="Tradovate">Tradovate</option></select><span className="recap-output-note">Only {sourceScope.toLowerCase()} records are included. Sources are kept separate because their fee coverage differs.</span></label>}
      <label className="recap-field" htmlFor="recap-session">Session<select id="recap-session" value={recap ? selection : ''} onChange={event => { setSelection(event.target.value); invalidate(); }} disabled={!data.options.length}><option value="" disabled>Choose a session</option>{sessionOptions.map(r => <option key={r.id} value={r.id}>{r.dateLabel} · {r.title}</option>)}</select></label>
      {onConfirmManualNet && selectedAccount !== 'all' && (grossManualRows.length > 0 || recap?.reportedNet) && <div className="recap-field" data-manual-net-confirm>
        {grossManualRows.length > 0 && <span>{grossManualRows.length} manual trade{grossManualRows.length === 1 ? '' : 's'} in this recap {grossManualRows.length === 1 ? 'was' : 'were'} saved using the old gross P&amp;L field. If these amounts already include your firm’s fees, confirm them as net. Amounts will not change.</span>}
        <label className="recap-fee-confirm"><input type="checkbox" checked={Boolean(recap?.reportedNet)} disabled={Boolean(recap?.reportedNet)} onChange={event => {
          if (!event.target.checked) return;
          const message = onConfirmManualNet(grossManualRows, selectedAccount);
          if (message) { setError(message); return; }
          invalidate(); setNotice('Selected manual amounts confirmed as net. Amounts are unchanged.');
        }} />These amounts already include fees</label>
      </div>}
      <fieldset><legend>Format</legend><div className="recap-formats">{recapFormats.map(f => <button key={f.id} type="button" aria-pressed={format === f.id} onClick={() => { invalidate(); setFormat(f.id); }} disabled={format === f.id}>{f.label}</button>)}</div></fieldset>
      <fieldset className="recap-background-field"><legend>Background</legend><label className="recap-pnl-toggle" htmlFor="recap-show-pnl">Show P&amp;L<input id="recap-show-pnl" type="checkbox" role="switch" checked={showPnl} onChange={event => { invalidate(); setShowPnl(event.target.checked); }} /></label><div className="recap-backgrounds">{recapBackgrounds.map(b => <button key={b.id} type="button" aria-pressed={background === b.id} onClick={() => chooseBackground(b.id)} disabled={background === b.id}><span className="recap-swatch">{b.src && <img src={b.src} alt="" loading="lazy" />}</span><span>{b.label}</span></button>)}{photo && <button type="button" aria-pressed={background === 'custom'} onClick={() => chooseBackground('custom')} disabled={background === 'custom'}><span className="recap-swatch"><img src={photo} alt="" /></span><span>{gif ? 'Your GIF' : 'Your photo'}</span></button>}</div>
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
      {gif && background === 'custom' && <label className="recap-field" htmlFor="recap-file-type">Download format<select id="recap-file-type" value={fileType} onChange={event => { setNotice(''); setError(''); gifExport.current?.abort(); setGifProgress(null); setFileType(event.target.value as 'png' | 'gif'); }}><option value="png">PNG · still image</option><option value="gif">GIF · animated image</option></select></label>}
      {fileType === 'gif' && gifProgress !== null && <p role="status" className="recap-output-note">Exporting animated image {gifProgress}%. Choose PNG to cancel.</p>}
      <div className="recap-export">
        <button data-recap-download type="button" onClick={() => { if (fileType === 'gif' && gif && background === 'custom') void downloadGif(); else download(); }} disabled={!ready || sharing || gifProgress !== null || fileType === 'gif' && !activeForeground}><Download aria-hidden="true" />Download image</button>
        <button data-recap-x type="button" onClick={() => void shareOnX()} disabled={!ready || sharing}><svg aria-hidden="true" data-recap-x-logo viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" /></svg>Share on X</button>
      </div>
      <p className="recap-output-note">{preset.width} × {preset.height} {fileType.toUpperCase()} · {format === 'wide' ? '54:29' : format === 'story' ? '9:16' : format === 'feed' ? '4:5' : '1:1'}</p>
      {gif && background === 'custom' && <p className="recap-output-note">Share on X uses the PNG still. Choose GIF to download the animation.</p>}
      <p className="recap-output-note">Choose X in the device share menu. If file sharing isn’t supported, the image downloads for you to attach in X.</p>
      {notice && <p role="status" className="recap-notice">{notice}</p>}{notice.includes('Attach it manually') && <label className="recap-field">Caption<textarea readOnly value={previewAlt + ' covadesk.com'} /></label>}{error && <p role="alert" className="recap-error">{error}</p>}
      {recap && <details className="recap-details"><summary>What’s included</summary><p>{recap.windowLabel}. {recap.details}</p>{showPnl && recap.fees && <p>{recapFeeLine(recap)}. Cash snapshot: {recap.fees.asOf}.</p>}{recap.hotStreak && <p>Verified net-positive trading days through this date: {recap.hotStreak.atLeast ? 'at least ' : ''}{recap.hotStreak.days}. This uses the whole UTC day, including on regional recaps, and remains a sync snapshot.</p>}<p>Win rate uses grouped gross outcomes for Tradovate and reported outcomes for other sources; breakevens count in the denominator. The session selector uses the selected account’s full history and the displayed date/window, independently of the dashboard range.</p><p>{!recap.verification ? 'Verification needs current eligible account and record provenance. Legacy CSV without recorded origin needs a one-time reimport; new CSV provenance is saved for this owner on this browser.' : recap.verification.basis === 'owner-approved' ? 'Badge basis: owner-approved account; manual and CSV records are allowed. This does not establish broker provenance.' : 'Badge basis: a validated Tradovate API sync for the selected account and a recent matching connection check. Cached history needs a new sync to establish provenance.'} The badge is a Cova indicator, not Twitter verification or a guarantee of performance.</p><p>Your background stays in this browser and is not uploaded. Sharing opens your device’s supported destinations; it does not post automatically.</p></details>}
    </div></div>
  </dialog>;
}
