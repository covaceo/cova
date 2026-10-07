import { motion, useReducedMotion } from "motion/react";
import "../../styles/resourceLogoCloud.css";

type Props = { ninjaTraderHref: string; kinetickHref: string };
const hidden = { opacity: 0, filter: "blur(10px)", y: -10 };
const visible = { opacity: 1, filter: "blur(0px)", y: 0 };

// Independent implementation of the supplied public logo-cloud interaction.
// No Aceternity premium source or demo-brand assets are used.
export function ResourceLogoCloud({ ninjaTraderHref, kinetickHref }: Props) {
  const reduced = useReducedMotion();
  const providers = [
    { name: "NinjaTrader", href: ninjaTraderHref, src: "/media/providers/NinjaTrader_Wordmark_color_RGB.png", width: 2376, height: 300, paid: true },
    { name: "Kinetick", href: kinetickHref, src: "/media/providers/Kinetick_Logo.png", width: 400, height: 100, paid: false },
  ];
  return (
    <section id="platform-resources" className="cova-provider-resources cova-provider-resources-compact" data-resource-logo-cloud="blur-on-scroll" aria-labelledby="provider-resources-title">
      <div className="cova-provider-inner">
        <header><h2 id="provider-resources-title">Platform &amp; market data resources</h2></header>
        <div className="cova-provider-grid">
          {providers.map((provider, index) => (
            <article key={provider.name}>
              <motion.a
                className="cova-provider-logo"
                href={provider.href}
                target="_blank"
                rel={provider.paid ? "sponsored noopener noreferrer" : "noopener noreferrer"}
                aria-label={`Visit ${provider.name} (${provider.paid ? "paid link, " : ""}opens in a new tab)`}
                initial={reduced ? false : hidden}
                whileInView={visible}
                viewport={{ amount: 0.35, once: false }}
                transition={reduced ? { duration: 0 } : { duration: 0.5, delay: index * 0.1, ease: "easeOut" }}
              >
                <img src={provider.src} alt={provider.name} width={provider.width} height={provider.height} />
              </motion.a>
              {provider.paid && <span className="cova-provider-paid">Paid link</span>}
            </article>
          ))}
        </div>
        <a className="cova-provider-details" href="#resources">View platform resources</a>
        <p className="cova-provider-trademark">NinjaTrader® is a registered trademark of NinjaTrader Group, LLC. No NinjaTrader company has any affiliation with the owner, developer, or provider of the products or services described herein, or any interest, ownership or otherwise, in any such product or service, or endorses, recommends or approves any such product or service.</p>
      </div>
    </section>
  );
}
