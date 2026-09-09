import { FUTURES_RISK_DISCLOSURE, HYPOTHETICAL_PERFORMANCE_DISCLOSURE } from "../lib/vendorCompliance";

// Ordinary pages use plain, expanded text inside the original site footer.
// The dedicated risk page below retains its approved markup and styling.
export function InlineRiskDisclosures() {
  return (
    <section className="cova-risk-disclosures" aria-label="Risk disclosures">
      <p><strong>Futures risk disclosure.</strong> {FUTURES_RISK_DISCLOSURE}</p>
      <p><strong>CFTC hypothetical performance disclosure.</strong> {HYPOTHETICAL_PERFORMANCE_DISCLOSURE}</p>
      <p>Cova’s marketing charts and performance displays are hypothetical, not actual account results. Member reviews depend on the history supplied and are not independently audited. Cova does not execute trades or provide trading signals.</p>
      <p>Testimonials appearing on this website may not be representative of other clients or customers and is not a guarantee of future performance or success.</p>
    </section>
  );
}

export function RiskDisclosureFooter() {
  return (
    <footer className="cova-risk-footer" aria-label="Risk disclosures">
      <div className="cova-risk-inner">
        <div className="cova-risk-grid">
          <section aria-labelledby="futures-risk-title">
            <h2 id="futures-risk-title">Futures risk disclosure</h2>
            <p>{FUTURES_RISK_DISCLOSURE}</p>
          </section>
          <section aria-labelledby="hypothetical-risk-title">
            <h2 id="hypothetical-risk-title">CFTC hypothetical performance disclosure</h2>
            <p>{HYPOTHETICAL_PERFORMANCE_DISCLOSURE}</p>
          </section>
        </div>
        <p className="cova-risk-context">Cova’s marketing charts and performance displays are hypothetical, not actual account results. Member reviews depend on the history supplied and are not independently audited. Cova does not execute trades or provide trading signals.</p>
        <p className="cova-risk-context">Testimonials appearing on this website may not be representative of other clients or customers and is not a guarantee of future performance or success.</p>
        <nav aria-label="Risk, legal and support">
          <a href="#disclosures">Risk disclosures</a>
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
          <a href="#security">Security</a>
          <a href="mailto:support@covadesk.com">Support</a>
        </nav>
      </div>
    </footer>
  );
}

export function RiskDisclosuresPage() {
  return (
    <section className="cova-disclosures-page">
      <h1>Risk disclosures</h1>
      <p>Read these disclosures before relying on trading performance information. Cova is for retrospective review, not a promise of future results.</p>
    </section>
  );
}
