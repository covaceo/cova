import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, CreditCard, LockKeyhole, ShieldCheck } from "lucide-react";
import type { BillingConfig, BillingStatus } from "../lib/billing";
import { createBillingPortal, createProCheckout, fetchBillingStatus, formatBillingAmount, formatBillingInterval } from "../lib/billing";
import type { Section } from "../lib/appRoutes";

type CheckoutPageProps = {
  billingConfig: BillingConfig;
  currentPlan: "free" | "pro";
  email?: string;
  go: (section: Section) => void;
  onBillingStatus: (status: BillingStatus) => void;
};

const PRO_FEATURES = [
  "Unlimited CSV trade imports",
  "Full retrospective risk review",
  "Unlimited Passport image exports",
  "Direct sync access when configured",
];

function clearCheckoutQuery() {
  const url = new URL(window.location.href);
  url.searchParams.delete("checkout");
  url.searchParams.delete("session_id");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function CheckoutPage({ billingConfig, currentPlan, email, go, onBillingStatus }: CheckoutPageProps) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<"checkout" | "portal" | "status" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const price = billingConfig.price;
  const amount = formatBillingAmount(price);
  const interval = formatBillingInterval(price);
  const recurringLabel = `${amount} / ${interval}`;
  const checkoutOutcome = useMemo(() => new URLSearchParams(window.location.search).get("checkout"), []);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (checkoutOutcome === "cancelled") {
        setNotice("Checkout cancelled. Nothing was charged and your plan did not change.");
        clearCheckoutQuery();
      }
      if (checkoutOutcome === "success") setBusy("status");
      const attempts = checkoutOutcome === "success" ? 12 : 1;
      let confirmedPro = currentPlan === "pro";
      for (let attempt = 0; attempt < attempts && !cancelled; attempt += 1) {
        try {
          const status = await fetchBillingStatus();
          if (cancelled) return;
          onBillingStatus(status);
          if (status.plan === "pro") {
            confirmedPro = true;
            setNotice("Cova Pro is active. Your account is ready.");
            clearCheckoutQuery();
            break;
          }
          if (checkoutOutcome !== "success") break;
        } catch (refreshError) {
          if (checkoutOutcome !== "success" && !cancelled) {
            setError(refreshError instanceof Error ? refreshError.message : "Cova could not refresh billing status.");
          }
        }
        if (attempt < attempts - 1) await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      if (!cancelled) {
        if (checkoutOutcome === "success" && !confirmedPro) {
          setNotice("Stripe completed checkout. Cova is still confirming the account update. Refresh in a moment if this remains here.");
        }
        setBusy(null);
      }
    }
    void refresh();
    return () => { cancelled = true; };
  }, [checkoutOutcome, currentPlan, onBillingStatus]);

  async function continueToPayment() {
    if (!accepted || !billingConfig.enabled) return;
    setBusy("checkout");
    setError("");
    try {
      window.location.assign(await createProCheckout());
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Cova could not open secure checkout.");
      setBusy(null);
    }
  }

  async function manageBilling() {
    setBusy("portal");
    setError("");
    try {
      window.location.assign(await createBillingPortal());
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "Cova could not open billing management.");
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="checkout-title" className="checkout-page">
      <div className="checkout-shell">
        <button className="checkout-back" onClick={() => go("pricing")} type="button">
          <ArrowLeft aria-hidden="true" size={14} /> Back to pricing
        </button>
        <div className="checkout-kicker"><span /> Direct purchase · no cart</div>

        <div className="checkout-grid">
          <div className="checkout-plan-panel">
            <div className="checkout-plan-label">Cova Pro</div>
            <h1 id="checkout-title">Review Cova Pro</h1>
            <p>Turn every imported trading session into a deeper retrospective risk review, without changing how you trade.</p>
            <div className="checkout-price-lockup">
              <strong>{amount}</strong>
              <span>per {interval}</span>
            </div>
            <div className="checkout-feature-list" aria-label="Cova Pro includes">
              {PRO_FEATURES.map((feature) => (
                <div key={feature}><Check aria-hidden="true" size={15} /> <span>{feature}</span></div>
              ))}
            </div>
            <div className="checkout-security-note">
              <ShieldCheck aria-hidden="true" size={18} />
              <span>Cova remains read-only. Upgrading does not authorize trade execution or movement of funds.</span>
            </div>
          </div>

          <aside aria-label="Order summary" className="checkout-order-panel">
            <div className="checkout-order-heading">
              <div><span>Order summary</span><strong>Cova Pro membership</strong></div>
              <CreditCard aria-hidden="true" size={20} />
            </div>
            <dl className="checkout-order-ledger">
              <div><dt>Account</dt><dd>{email || "Signed-in Cova account"}</dd></div>
              <div><dt>Billing</dt><dd>{recurringLabel}</dd></div>
              <div><dt>Due today</dt><dd>{amount}</dd></div>
            </dl>
            <div className="checkout-order-total"><span>Total today</span><strong>{amount}</strong></div>

            {notice && <div aria-live="polite" className="checkout-notice">{notice}</div>}
            {error && <div aria-live="assertive" className="checkout-error">{error}</div>}

            {currentPlan === "pro" ? (
              <div className="checkout-active-state">
                <div><Check aria-hidden="true" size={16} /><span>Pro active</span></div>
                <button disabled={busy !== null} onClick={() => { void manageBilling(); }} type="button">
                  {busy === "portal" ? "Opening billing…" : "Manage billing"}
                </button>
              </div>
            ) : (
              <>
                <label className="checkout-consent">
                  <input checked={accepted} onChange={(event) => setAccepted(event.target.checked)} type="checkbox" />
                  <span>I understand Cova Pro renews automatically at {recurringLabel} until I cancel.</span>
                </label>
                <button className="checkout-pay" disabled={!accepted || !billingConfig.enabled || busy !== null} onClick={() => { void continueToPayment(); }} type="button">
                  <LockKeyhole aria-hidden="true" size={15} />
                  {busy === "checkout" ? "Opening secure payment…" : billingConfig.enabled ? "Continue to secure payment" : "Checkout setup required"}
                </button>
              </>
            )}

            <p className="checkout-processor-copy">Stripe handles payment details. Cova never receives or stores your full card number.</p>
            <p className="checkout-legal-copy">
              By continuing, you agree to Cova's <button onClick={() => go("terms")} type="button">Terms</button> and acknowledge the <button onClick={() => go("privacy")} type="button">Privacy Policy</button>.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
