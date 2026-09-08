import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X, Eye, EyeOff, Share, Copy, Check } from 'lucide-react';
import type { HoloPassportMode } from '../lib/passportHolo';
import { captureShareSnapshot, composeSharePng, type ShareBackground } from '../lib/passportShare';
import { copyPreparedImage, sharePreparedImage } from '../lib/passportShareActions';
import { createSquareSnapshot, composeSquareSharePng } from '../lib/passportSquare';
import { loadSquareMaterial } from '../lib/passportSquareMaterials';
import '../styles/passportShare.css';

type Preset = { id: string; label: string; width: number; height: number };
type Props = {
  face: RefObject<HTMLDivElement>; mode: HoloPassportMode; onModeChange: (mode: HoloPassportMode) => void;
  rank: string; finish: string; preset: string; onPresetChange: (preset: string) => void;
  presets: Preset[]; modes: [HoloPassportMode, string][]; onClose: () => void;
  sample?: boolean; sourceKey?: string;
};
const background: ShareBackground = 'studio';
type Tile = { blob: Blob; url: string };

export function PassportShareComposer({ face, mode, onModeChange, rank, finish, preset, onPresetChange, presets, modes, onClose, sample = true, sourceKey = '' }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const [hideIdentity, setHideIdentity] = useState(false);
  const [hideMarkets, setHideMarkets] = useState(false);
  const [retry, setRetry] = useState(0);
  const [render, setRender] = useState<{ key: string; tile?: Tile; error?: string } | null>(null);
  const [delivering, setDelivering] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);
  const format = presets.find(p => p.id === preset) ?? presets[0];
  const key = JSON.stringify([rank, finish, mode, format.id, hideIdentity, hideMarkets, retry, sample, sourceKey]);
  // Render-time key gate immediately withholds stale/privacy-invalid images and actions.
  const current = render?.key === key ? render : null;
  const tile = current?.tile;
  const busy = !tile || delivering;
  const filename = `cova-passport-${sample ? 'sample' : 'user-supplied'}-${rank.toLowerCase()}-${finish}-${mode}-${background}${hideIdentity ? '-anonymous' : ''}${hideMarkets ? '-no-markets' : ''}-${format.id}.png`;

  useLayoutEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBody = document.body.style.overflow;
    const previousRoot = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    element.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      document.body.style.overflow = previousBody;
      document.documentElement.style.overflow = previousRoot;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    setNotice(''); setNoticeError(false);
    try {
      if (!face.current || face.current.dataset.passportMode !== mode) throw new Error('Card is not ready.');
      // Capture once, synchronously, before any asynchronous material work.
      const snapshot = captureShareSnapshot(face.current, { hideIdentity: hideIdentity || mode === 'private', hideMarkets: hideMarkets || mode === 'private' });
      const prepare = async () => {
        if (format.id === 'card') return composeSharePng(snapshot, format, background, rank);
        const material = await loadSquareMaterial(rank);
        if (!active) return null;
        if (material.rank !== rank) throw new Error('Square material does not match this card.');
        const square = createSquareSnapshot(snapshot, material.materialUrl);
        return composeSquareSharePng(square, format, background);
      };
      prepare()
        .then(blob => {
          if (!active || !blob) return;
          const url = URL.createObjectURL(blob); urls.push(url);
          setRender({ key, tile: { blob, url } });
        }).catch(() => { if (active) setRender({ key, error: 'The image could not be prepared. Your card is unchanged.' }); });
    } catch {
      setRender({ key, error: 'The card is not ready. Please try again.' });
    }
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [key, face, mode, hideIdentity, hideMarkets, format, rank]);

  async function deliver(action: 'share' | 'copy') {
    if (!tile || delivering) return;
    setDelivering(true); setNotice(''); setNoticeError(false);
    try {
      if (action === 'share') {
        const result = await sharePreparedImage(tile.blob, filename);
        setNotice(result === 'unsupported' ? 'File sharing is unavailable here. Use Save image below.' : result === 'cancelled' ? 'Share cancelled. Nothing was posted by Cova.' : 'Handed to your device’s share sheet.');
      } else {
        const result = await copyPreparedImage(tile.blob, navigator.clipboard, typeof ClipboardItem === 'undefined' ? undefined : ClipboardItem);
        setNotice(result === 'copied' ? 'Image copied.' : 'Image copying is unavailable here. Use Save image below.');
      }
    } catch {
      setNoticeError(true);
      setNotice(`${action === 'share' ? 'Sharing' : 'Copying'} was blocked or failed. You can still save the image.`);
    } finally { setDelivering(false); }
  }
  function save() {
    if (!tile || delivering) return;
    const anchor = document.createElement('a');
    anchor.href = tile.url; anchor.download = filename;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setNoticeError(false); setNotice('Image download requested. PNGs are permanent still images.');
  }

  return createPortal(<dialog ref={dialog} className="passport-share-dialog" aria-labelledby="share-heading" aria-describedby="share-file-note" aria-modal="true" onCancel={event => { event.preventDefault(); close.current(); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(element => element.getClientRects().length > 0);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className="passport-share-shell">
      <header className="passport-share-header"><h2 id="share-heading" className="passport-share-sr">Share your card</h2><button ref={closeButton} type="button" className="passport-share-close" aria-label="Close share composer" onClick={onClose}><X size={23}/></button></header>
      <div className="passport-share-scroll">
        <div className="passport-share-modes" role="group" aria-label="Share card view">
          {modes.map(([id, label]) => <button type="button" key={id} aria-pressed={mode === id} disabled={delivering} onClick={() => onModeChange(id)}>{label}</button>)}
        </div>
        <div className="passport-share-preview" style={{ '--share-ratio': format.width / format.height } as CSSProperties}>
          <div className="passport-share-image" aria-busy={!current}>
            {tile ? <img src={tile.url} alt={`${rank} ${mode === 'private' ? 'Ghost' : modes.find(([id]) => id === mode)?.[1]} card. ${sample ? 'Sample' : 'User-supplied'} data, not account verified.`} draggable={false}/> : <div className="passport-share-loading">{current?.error ? <><p role="alert">{current.error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></> : <span>Preparing your image…</span>}</div>}
          </div>
        </div>
        <div className="passport-share-controls">
          <div className="passport-share-visibility" role="group" aria-label="Image visibility">
            <button type="button" aria-label={hideIdentity || mode === 'private' ? 'Identity hidden' : 'Hide identity'} aria-pressed={hideIdentity || mode === 'private'} disabled={mode === 'private' || delivering} onClick={() => setHideIdentity(value => !value)}>{hideIdentity || mode === 'private' ? <EyeOff size={16}/> : <Eye size={16}/>}<span>Identity</span></button>
            <button type="button" aria-label={hideMarkets || mode === 'private' ? 'Markets hidden' : 'Hide markets'} aria-pressed={hideMarkets || mode === 'private'} disabled={mode === 'private' || delivering} onClick={() => setHideMarkets(value => !value)}>{hideMarkets || mode === 'private' ? <EyeOff size={16}/> : <Eye size={16}/>}<span>Markets</span></button>
          </div>
          <div className="passport-share-format"><label className="passport-share-sr" htmlFor="share-format">Image format</label><select id="share-format" value={format.id} disabled={delivering} onChange={event => onPresetChange(event.target.value)}>{presets.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
        </div>
        <p className="passport-share-sr">{mode === 'private' ? 'Ghost hides identity, markets and sensitive stats.' : 'Choose Ghost to hide sensitive stats.'}</p>
      </div>
      <footer className="passport-share-footer">
        <p className={`passport-share-notice${notice ? ' is-visible' : ''}${noticeError ? ' is-error' : ''}`} role="status" aria-live="polite">{notice || (current?.error ? 'Retry the preview to enable sharing.' : !tile ? 'Preparing a privacy-safe image…' : `${format.width} × ${format.height} · PNG ready`)}</p>
        <div className="passport-share-actions">
          <button type="button" disabled={busy} onClick={() => deliver('share')}><span><Share size={23}/></span>Share</button>
          <button type="button" disabled={busy} onClick={() => deliver('copy')}><span>{notice === 'Image copied.' ? <Check size={23}/> : <Copy size={23}/>}</span>Copy image</button>

        </div>
        <button type="button" className="passport-share-save" disabled={busy} onClick={save}>Save image</button>
        <p id="share-file-note" className="passport-share-sr">{sample ? 'Sample' : 'User-supplied'} data · Not account verified. Still image, no motion.</p>
      </footer>
    </div>
  </dialog>, document.body);
}
