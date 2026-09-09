const NINJATRADER_LINK = "https://ninjatraderus.pxf.io/rEqk5d";
const KINETICK_LINK = "https://kinetick.com/NinjaTrader";

export function ProviderResources({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`cova-provider-resources${compact ? " cova-provider-resources-compact" : ""}`} aria-labelledby="provider-resources-title">
      <div className="cova-provider-inner">
        <header>
          <h2 id="provider-resources-title">Platform &amp; market data resources</h2>
        </header>
        <div className="cova-provider-grid">
          <article>
            <a className="cova-provider-logo" href={NINJATRADER_LINK} target="_blank" rel="sponsored noopener noreferrer" aria-label="Visit NinjaTrader (paid link, opens in a new tab)">
              <img src="/media/providers/NinjaTrader_Wordmark_color_RGB.png" alt="NinjaTrader" width="2376" height="300" />
            </a>
            <span className="cova-provider-paid">Paid link</span>
            {!compact && <p>Charting, simulation and trading tools on the NinjaTrader platform.</p>}
            {!compact && <a className="cova-provider-action" href={NINJATRADER_LINK} target="_blank" rel="sponsored noopener noreferrer">Explore NinjaTrader <span aria-hidden="true">↗</span></a>}
          </article>
          <article>
            <a className="cova-provider-logo" href={KINETICK_LINK} target="_blank" rel="noopener noreferrer" aria-label="Visit Kinetick (opens in a new tab)">
              <img src="/media/providers/Kinetick_Logo.png" alt="Kinetick" width="400" height="100" />
            </a>
            {!compact && <p>Market data for use with the NinjaTrader platform.</p>}
            {!compact && <a className="cova-provider-action" href={KINETICK_LINK} target="_blank" rel="noopener noreferrer">Explore Kinetick <span aria-hidden="true">↗</span></a>}
          </article>
        </div>
        {compact && <a className="cova-provider-details" href="#resources">View platform resources</a>}
        <p className="cova-provider-trademark">NinjaTrader® is a registered trademark of NinjaTrader Group, LLC. No NinjaTrader company has any affiliation with the owner, developer, or provider of the products or services described herein, or any interest, ownership or otherwise, in any such product or service, or endorses, recommends or approves any such product or service.</p>
      </div>
    </section>
  );
}
