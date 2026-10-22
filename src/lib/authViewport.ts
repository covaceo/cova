// iOS can retain credential-focus magnification after the sheet unmounts.
// Recover only that session's automatic zoom, never a user's chosen pinch zoom.
const viewportSessions = new WeakMap<HTMLMetaElement, () => void>();

export function beginAuthViewportSession(dialog: HTMLElement): () => void {
  const availableViewport = window.visualViewport;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios || !availableViewport || !meta) return () => {};
  const viewport = availableViewport;

  viewportSessions.get(meta)?.();
  const original = meta.content;
  const initial = /(?:^|,)\s*initial-scale\s*=\s*([\d.]+)/i.exec(original);
  const baseline = Number(initial?.[1]);
  // A previously enlarged page is an accessibility/user choice, not ours to reset.
  if (!Number.isFinite(baseline) || baseline <= 0 || Math.abs(viewport.scale - baseline) > 0.02) return () => {};

  let focusAt = -Infinity;
  let inputZoom = false;
  let userZoom = false;
  let closing = false;
  let restoring = false;
  let disposed = false;
  let timer = 0;
  let deadline = 0;
  let frame = 0;
  let written: string | undefined;

  const isCredential = (element: Element | null) => element instanceof HTMLInputElement
    && dialog.contains(element) && ['email', 'password', 'text'].includes(element.type);
  const clearWork = () => {
    window.clearTimeout(timer);
    window.clearTimeout(deadline);
    window.cancelAnimationFrame(frame);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearWork();
    dialog.removeEventListener('focusin', onFocus);
    viewport.removeEventListener('resize', onResize);
    window.removeEventListener('touchstart', onTouch, true);
    window.removeEventListener('gesturestart', onGesture, true);
    window.removeEventListener('wheel', onWheel, true);
    if (written !== undefined && meta.content === written) meta.content = original;
    if (viewportSessions.get(meta) === dispose) viewportSessions.delete(meta);
  };
  const restore = () => {
    if (disposed || restoring) return;
    if (userZoom || !inputZoom || meta.content !== original || viewport.scale <= baseline + 0.02) {
      dispose();
      return;
    }
    restoring = true;
    clearWork();
    // Changing initial-scale makes WebKit recompute the page fit. No min/max
    // scale or user-scalable restriction is introduced, even temporarily.
    written = original.replace(/(initial-scale\s*=\s*)[\d.]+/i, `$1${baseline * 1.0001}`);
    meta.content = written;
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(dispose);
    });
    deadline = window.setTimeout(dispose, 250); // Also clean up in a background tab.
  };
  function onFocus(event: FocusEvent) {
    if (isCredential(event.target as Element)) focusAt = performance.now();
  }
  function onResize() {
    if (disposed || restoring) return;
    if (closing) {
      window.clearTimeout(timer);
      timer = window.setTimeout(restore, 120);
    } else if (!userZoom && isCredential(document.activeElement)
      && performance.now() - focusAt < 1800 && viewport.scale > baseline + 0.02) {
      inputZoom = true;
    }
  }
  function onGesture() {
    userZoom = true;
    if (closing) dispose();
  }
  function onTouch(event: TouchEvent) {
    if (event.touches.length > 1) onGesture();
  }
  function onWheel(event: WheelEvent) {
    if (event.ctrlKey) onGesture();
  }

  dialog.addEventListener('focusin', onFocus);
  viewport.addEventListener('resize', onResize);
  window.addEventListener('touchstart', onTouch, { capture: true, passive: true });
  window.addEventListener('gesturestart', onGesture, { capture: true, passive: true });
  window.addEventListener('wheel', onWheel, { capture: true, passive: true });
  viewportSessions.set(meta, dispose);
  return () => {
    if (disposed || closing) return;
    if (!inputZoom || userZoom || meta.content !== original) {
      dispose();
      return;
    }
    closing = true;
    if (isCredential(document.activeElement)) (document.activeElement as HTMLInputElement).blur();
    // Let keyboard dismissal and the existing body-lock cleanup settle first.
    timer = window.setTimeout(restore, 150);
    deadline = window.setTimeout(restore, 600);
  };
}
