import React, { useCallback, useState } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import { CheckoutPage } from "../../src/components/CheckoutPage";
import type { BillingStatus } from "../../src/lib/billing";
import "../../src/index.css";
import "../../src/styles/riskDeskVisualSystem.css";
import "../../src/styles/cobaltMarket.css";
import "../../src/styles/checkout.css";

const PRICE = {
  currency: "usd",
  interval: "month" as const,
  intervalCount: 1,
  unitAmount: 0,
};

function Harness() {
  const [status, setStatus] = useState<BillingStatus>({
    currentPeriodEnd: null,
    plan: "free",
    subscriptionStatus: "none",
  });
  const onBillingStatus = useCallback((next: BillingStatus) => setStatus(next), []);

  return (
    <CheckoutPage
      billingConfig={{ enabled: true, price: PRICE }}
      currentPlan={status.plan}
      email="qa-checkout@cova.test"
      go={(section) => { window.__covaCheckoutGo = section; }}
      onBillingStatus={onBillingStatus}
    />
  );
}

declare global {
  interface Window {
    __covaCheckoutGo?: string;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
);
