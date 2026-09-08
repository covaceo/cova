import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, X } from "lucide-react";
import type { Trade } from "../lib/risk";
import { signedMoney } from "../lib/dashboardPresentation";

type Props = { trade: Trade | null; onClose: () => void; onSave?: (id: string, notes: string) => boolean };
export function trapTradeDialogTab(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),textarea:not([disabled])'));
  const first = controls[0], last = controls[controls.length - 1];
  if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
}

export function DashboardTradeDialog({ trade, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!trade || !dialog.current) return;
    const node = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    setNotes(typeof trade.notes === "string" ? trade.notes : ""); setError("");
    node.showModal(); document.body.style.overflow = "hidden";
    node.querySelector<HTMLButtonElement>(".astra-dialog-close")?.focus({ preventScroll: true });
    return () => { node.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [trade?.id]);
  return <dialog ref={dialog} className="astra-trade-dialog" aria-labelledby="astra-trade-title" aria-modal={trade ? true : undefined} onKeyDown={trapTradeDialogTab} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    {trade && <><button className="astra-dialog-close" onClick={onClose} type="button" aria-label="Close trade note"><X aria-hidden="true" /></button><div className="astra-note-date">{trade.date} / completed trade</div><h2 id="astra-trade-title">{trade.market} · {trade.setup || "Trade review"}</h2><p>{trade.side} · {trade.contracts} {trade.contracts === 1 ? "contract" : "contracts"}</p><div className="astra-detail-metrics"><div><span>Reported P&amp;L</span><strong className={trade.pnl < 0 ? "astra-negative" : "astra-positive"}>{signedMoney(trade.pnl, true)}</strong></div><div><span>Provided risk</span><strong>{trade.risk > 0 && Number.isFinite(trade.risk) ? signedMoney(trade.risk, false, false) : "Not provided"}</strong></div></div><label htmlFor="astra-trade-note">Trade journal note</label><textarea id="astra-trade-note" rows={5} value={notes} onChange={event => setNotes(event.target.value)} readOnly={!onSave} placeholder="Add the context behind this trade…" />{error && <p role="alert">{error}</p>}{onSave && <button className="astra-button astra-save-note" type="button" onClick={() => { if (onSave(trade.id, notes)) onClose(); else setError("This account changed. Reopen the trade before saving."); }}>Save note <Check aria-hidden="true" /></button>}<p className="astra-note-storage">Notes stay with this account’s trade history on this browser. No changes to broker records.</p></>}
  </dialog>;
}
