import { useEffect, useRef, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { RithmicLogin, type RithmicCredentials, type RithmicSyncResult } from "./RithmicLogin";

export function RithmicLoginDialog({ busy, sync, notice, message, onClose }: {
  busy: boolean;
  sync: (credentials: RithmicCredentials) => Promise<RithmicSyncResult | void> | RithmicSyncResult | void;
  notice: (message: string) => void;
  message: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    node.showModal();
    document.body.style.overflow = "hidden";
    node.querySelector<HTMLInputElement>('[aria-label="Rithmic username"]')?.focus({ preventScroll: true });
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function trapTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')).filter(node => node.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); event.currentTarget.focus(); }
    else if (event.shiftKey && (event.target === first || event.target === event.currentTarget)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (event.target === last || event.target === event.currentTarget)) { event.preventDefault(); first.focus(); }
  }

  return <dialog ref={dialog} id="rithmic-login-dialog" className="accounts-rithmic-dialog" aria-labelledby="rithmic-login-title" aria-modal="true" tabIndex={-1} onKeyDown={trapTab} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => {
    if (busy || event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <button className="accounts-dialog-close" type="button" aria-label="Close Rithmic login" disabled={busy} onClick={onClose}><X aria-hidden="true" /></button>
    <RithmicLogin busy={busy} sync={sync} notice={notice} />
    {message && <p className="accounts-notice" role="status">{message}</p>}
  </dialog>;
}
