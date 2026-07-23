import { ArrowUpRight, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { Section } from "../lib/appRoutes";

const EFFECTIVE_DATE = "July 22, 2026";
const SUPPORT_EMAIL = "support@covadesk.com";

type LegalRoute = "privacy" | "terms" | "security";
type LegalSection = {
  title: string;
  body: ReactNode;
};

type LegalPageProps = {
  go: (section: Section) => void;
};

function ContactLink() {
  return <a className="text-[#b9f5df] underline decoration-[#18c887]/40 underline-offset-4 hover:text-white" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
}

function LegalList({ children }: { children: ReactNode }) {
  return <ul className="mt-4 grid gap-3 pl-5 font-body text-sm font-light leading-7 text-white/62 marker:text-[#18c887]">{children}</ul>;
}

function LegalDocument({
  active,
  eyebrow,
  icon,
  intro,
  sections,
  title,
  go,
}: {
  active: LegalRoute;
  eyebrow: string;
  icon: ReactNode;
  intro: ReactNode;
  sections: LegalSection[];
  title: string;
  go: (section: Section) => void;
}) {
  const links: { id: LegalRoute; label: string }[] = [
    { id: "privacy", label: "Privacy" },
    { id: "terms", label: "Terms" },
    { id: "security", label: "Security" },
  ];

  return (
    <section className="relative min-h-screen overflow-hidden px-5 pb-20 pt-32 md:px-12 md:pb-28 md:pt-40 lg:px-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_72%_18%,rgba(24,200,135,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_75%)]" />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-7 border-b border-white/10 pb-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-6 flex items-center gap-3 text-[#b9f5df]">
              <span className="grid h-11 w-11 place-items-center border border-[#18c887]/24 bg-[#18c887]/10">{icon}</span>
              <span className="font-body text-xs font-semibold uppercase tracking-[0.22em]">{eyebrow}</span>
            </div>
            <h1 className="max-w-4xl font-body text-5xl font-semibold leading-[0.96] tracking-[-0.055em] text-white md:text-7xl lg:text-8xl">{title}</h1>
            <div className="mt-6 max-w-3xl font-body text-base font-light leading-8 text-white/62">{intro}</div>
            <p className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-white/36">Effective {EFFECTIVE_DATE}</p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Legal pages">
            {links.map((link) => (
              <button
                className={`min-h-11 border px-4 font-body text-sm transition ${active === link.id ? "border-[#18c887]/42 bg-[#18c887]/12 text-[#b9f5df]" : "border-white/10 bg-white/[0.025] text-white/55 hover:border-white/24 hover:text-white"}`}
                key={link.id}
                onClick={() => go(link.id)}
                type="button"
                aria-current={active === link.id ? "page" : undefined}
              >
                {link.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
          <aside className="border border-white/10 bg-white/[0.018] p-5 lg:sticky lg:top-28">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-white/38">On this page</p>
            <ol className="mt-5 grid gap-3">
              {sections.map((section, index) => (
                <li key={section.title}>
                  <a className="flex gap-3 font-body text-sm leading-5 text-white/48 transition hover:text-[#b9f5df]" href={`#legal-${active}-${index + 1}`}>
                    <span className="font-mono text-[10px] text-[#18c887]">{String(index + 1).padStart(2, "0")}</span>
                    <span>{section.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </aside>

          <article className="min-w-0 border border-white/10 bg-black/38 px-5 py-2 md:px-9">
            {sections.map((section, index) => (
              <section className="scroll-mt-32 border-b border-white/10 py-8 last:border-b-0 md:py-10" id={`legal-${active}-${index + 1}`} key={section.title}>
                <div className="grid gap-5 md:grid-cols-[48px_minmax(0,1fr)]">
                  <span className="font-mono text-xs text-[#18c887]">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h2 className="font-body text-2xl font-semibold tracking-[-0.025em] text-white md:text-3xl">{section.title}</h2>
                    <div className="mt-4 font-body text-sm font-light leading-7 text-white/62">{section.body}</div>
                  </div>
                </div>
              </section>
            ))}
          </article>
        </div>

        <footer className="mt-12 flex flex-col gap-5 border-t border-white/10 pt-7 font-body text-xs text-white/40 md:flex-row md:items-center md:justify-between">
          <span>© 2026 Cova. Questions: <ContactLink /></span>
          <button className="inline-flex w-fit items-center gap-2 text-[#b9f5df] hover:text-white" onClick={() => go("overview")} type="button">
            Return to Cova <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </footer>
      </div>
    </section>
  );
}

export function PrivacyPage({ go }: LegalPageProps) {
  const sections: LegalSection[] = [
    {
      title: "Scope and operator",
      body: <><p>This Privacy Policy explains how the Cova service, website, applications, and support channels collect, use, disclose, and protect personal information. Cova is operated by Rafael Lino, Founder and CEO of Cova, as an unincorporated product based in Manhattan, New York, USA. This Policy applies when you visit covadesk.com, import trade history, use Practice or Risk Passport features, contact support, or use an account or supported provider feature when one is available.</p><p className="mt-4">Cova is intended for adults and is not directed to anyone under 18.</p></>,
    },
    {
      title: "Information we collect",
      body: <><p>The information Cova processes depends on the features you use:</p><LegalList>
        <li><strong className="font-medium text-white/82">Account and contact data:</strong> email address, authentication identifier, account plan, signup and policy-acceptance records, support messages, and account preferences.</li>
        <li><strong className="font-medium text-white/82">Trading and journal data:</strong> CSV contents, trade dates, instruments, direction, quantity, entry and exit values, profit and loss, risk values, setup labels, notes, limits, review results, Passport settings, and simulated Practice activity.</li>
        <li><strong className="font-medium text-white/82">Connected-account data, when a provider connection is enabled:</strong> provider username or account label, provider account identifiers, balances, fills, trades, statements, session tokens, provider-granted scope, and expiration information. Cova does not ask for broker passwords. Direct provider synchronization is not currently active in production; provider approval, production Supabase setup, and connector verification remain pending.</li>
        <li><strong className="font-medium text-white/82">Technical data:</strong> IP address, request time, browser and device information, security events, cookie identifiers, and server logs generated when the service is requested.</li>
        <li><strong className="font-medium text-white/82">Billing data:</strong> plan and subscription status. When checkout is enabled, payment-card and billing details are collected by Stripe, not stored by Cova.</li>
      </LegalList></>,
    },
    {
      title: "How information is collected",
      body: <p>Cova receives information directly from you, from files you choose to import, from service providers needed to deliver requested features, and automatically from the browser and hosting infrastructure needed to deliver and secure the service. If a direct provider connection is enabled after approval and production verification, Cova will also receive the account and completed trade-history data you authorize. Cova currently does not use advertising trackers or behavioral advertising analytics.</p>,
    },
    {
      title: "How we use information",
      body: <><p>Cova uses information to import and normalize trade history, calculate review metrics, display limits and retrospective insights, operate Practice and Passport features, provide support, prevent abuse, debug failures, secure the service, comply with law, and improve reliability. Authentication, direct provider synchronization, and paid checkout are used only when those features are configured and available.</p><p className="mt-4">Cova does not use connected-account access to place, modify, or cancel trades, withdraw funds, or manage brokerage settings.</p></>,
    },
    {
      title: "How we share information",
      body: <><p>Cova shares information only as needed to operate requested features, secure the service, or comply with law. Current service providers include Vercel for hosting and request delivery and Google Workspace for support email. Stripe may process checkout if paid billing is enabled. Supabase is planned for authentication and encrypted connector records, but Supabase production setup is pending and direct provider synchronization is not active. Discord and any trading provider you separately choose to use process information under their own terms.</p><p className="mt-4">Cova does not sell personal information and does not share personal information for cross-context behavioral advertising. Cova may disclose information if required by law, to protect users or the service, or as part of a business transfer subject to appropriate safeguards and notice.</p></>,
    },
    {
      title: "Browser storage, cookies, and similar technology",
      body: <><p>Cova uses first-party browser storage to preserve imported trades, rules, Practice activity, and display preferences on the device you use. When authenticated account or connector features are enabled, essential authentication storage and Secure, HttpOnly, SameSite connector cookies may also be used. These technologies support requested features, not advertising.</p><p className="mt-4">You can clear local browser data through Cova’s controls or your browser. Clearing storage may permanently remove locally stored journal and Practice information that has not been exported.</p></>,
    },
    {
      title: "Data retention",
      body: <><p>Locally stored trade, rule, Passport, and Practice data remains on the device until you remove it or clear browser storage. Account, authentication, and connector records will be retained only when those production features are enabled and for the periods needed to provide the feature, maintain security, satisfy legal obligations, or complete a verified deletion request.</p><p className="mt-4">Operational logs are retained according to configured security needs and the controls of Cova’s infrastructure providers. Cova keeps information only as long as reasonably necessary for the purposes described here.</p></>,
    },
    {
      title: "Security",
      body: <p>Cova currently uses HTTPS, restricted server-side configuration, first-party browser storage, and operational safeguards designed to protect information. The reviewed connector candidate adds encrypted token storage, owner-bound records, secure cookies, and an endpoint allowlist after production Supabase setup and provider approval. No online service can guarantee absolute security. Report suspected unauthorized access immediately to <ContactLink />. More detail is available on the Security & Data Handling page.</p>,
    },
    {
      title: "Your privacy rights",
      body: <><p>Depending on where you live, you may have rights to request access, correction, deletion, restriction, objection, portability, or withdrawal of consent. California residents may also request the categories and specific pieces of personal information collected, correction or deletion, and information about disclosure, without discriminatory treatment. Cova does not sell or share personal information for behavioral advertising, so there is no sale or advertising-share opt-out required for current practices.</p><p className="mt-4">Send a request to <ContactLink /> from the email associated with your account. Cova may verify your identity and may retain information when required for security, legal obligations, dispute resolution, or other lawful exceptions. Authorized agents may submit requests where applicable, subject to verification.</p></>,
    },
    {
      title: "International processing",
      body: <p>Cova and its service providers may process information in the United States and other countries. Where applicable, Cova relies on contractual, consent-based, or other lawful transfer mechanisms and requires service providers to protect information consistent with their agreements and applicable law.</p>,
    },
    {
      title: "Third-party services",
      body: <p>Trading providers, Stripe, Discord, and other third-party destinations operate under their own terms and privacy policies. Cova is not responsible for their independent practices. Connecting a provider instructs Cova to request and process account and trade-history data for retrospective review. Provider-issued authorization may be broader than Cova’s own endpoint allowlist.</p>,
    },
    {
      title: "Changes and contact",
      body: <><p>Cova may update this Policy as the service, vendors, or law changes. Material changes will be presented through the service or by another reasonable notice. The effective date above identifies the current version.</p><p className="mt-4">For privacy requests, deletion, complaints, or questions, contact <ContactLink />.</p></>,
    },
  ];

  return <LegalDocument active="privacy" eyebrow="Privacy & control" icon={<LockKeyhole className="h-5 w-5" />} intro={<>What Cova processes, why it is needed, where it stays, and how to exercise control over it.</>} sections={sections} title="Privacy Policy" go={go} />;
}

export function TermsPage({ go }: LegalPageProps) {
  const sections: LegalSection[] = [
    {
      title: "Agreement and operator",
      body: <p>These Terms of Service form a binding agreement between you and Rafael Lino, Founder and CEO of Cova, who currently operates Cova as an unincorporated product based in Manhattan, New York, USA. By creating an account, checking the acceptance box, purchasing a plan, connecting an account, or using Cova, you agree to these Terms and the Privacy Policy. If you do not agree, do not use the service.</p>,
    },
    {
      title: "Eligibility and accounts",
      body: <><p>You must be at least 18 years of age and legally able to enter a contract. You must provide accurate account information, protect access to your email and devices, and promptly report suspected unauthorized use. You are responsible for activity performed through your account and for confirming that you are authorized to upload or connect the trading data you provide.</p><p className="mt-4">Cova may refuse, suspend, or close accounts used unlawfully, deceptively, or in a manner that risks users, providers, or the service.</p></>,
    },
    {
      title: "The Cova service",
      body: <p>Cova provides tools for importing or synchronizing trade history, reviewing historical behavior, configuring personal review limits, practicing on simulated or demo data, generating retrospective insights, and creating Risk Passport images. Features, limits, beta services, and integrations may change, pause, or be discontinued. Cova does not promise continuous availability of any provider connection.</p>,
    },
    {
      title: "Not financial advice",
      body: <><p>Cova is an educational, journaling, review, and simulation tool. It does not provide investment, financial, legal, tax, brokerage, or fiduciary advice. Cova does not recommend whether, when, or how you should trade, and no score, limit, insight, Passport, simulation result, or community discussion is a trade signal or permission to use live capital.</p><p className="mt-4">Futures and leveraged trading involve substantial risk, including loss beyond expectations. You remain solely responsible for trading decisions, account rules, taxes, regulatory obligations, and verification of all calculations.</p></>,
    },
    {
      title: "No execution or brokerage relationship",
      body: <p>Cova is not a broker, dealer, futures commission merchant, introducing broker, exchange, prop firm, or account manager. Cova does not place, modify, or cancel orders, hold customer funds, withdraw funds, or control brokerage settings. Cova’s connector code calls account and trade-history endpoints only. A provider-issued token may carry broader provider permissions, which users should separately revoke when no longer needed.</p>,
    },
    {
      title: "User data and permission to process it",
      body: <><p>You retain ownership of the data and content you submit. You grant Cova a limited, non-exclusive license to host, process, transform, display, and transmit that content only as needed to provide, secure, support, and improve the service. You represent that you have the rights and permissions needed to provide the content.</p><p className="mt-4">You are responsible for reviewing which calculated fields are included before downloading or sharing a Passport PNG. Cova does not host, revoke, or expire downloaded images and cannot control copies after you disclose them.</p></>,
    },
    {
      title: "Acceptable use",
      body: <><p>You may not use Cova to break law or provider rules, access another person’s account, submit stolen credentials, probe or bypass security, interfere with service operation, scrape or reverse engineer protected systems, upload malware, infringe rights, misrepresent results, harass others, solicit account access, promote copy trading or paid signals through Cova community spaces, or use the service to automate trading.</p><p className="mt-4">You may not represent a Cova score or Passport as broker verification, investment performance certification, or a guarantee of future results.</p></>,
    },
    {
      title: "Provider connections and third parties",
      body: <p>Third-party providers control their own accounts, APIs, availability, scopes, pricing, and approval rules. Your use of those services remains subject to their terms. Cova may suspend a connector when approval, security, licensing, or technical requirements are unresolved. Cova is not responsible for third-party downtime, policy changes, data errors, account action, or loss caused by a third-party service.</p>,
    },
    {
      title: "Practice, beta, and generated outputs",
      body: <p>Practice features may use deterministic demo or simulated data and are not historical-market replay unless explicitly labeled otherwise. Beta connectors and previews may be incomplete or unavailable. Calculations, normalized trades, risk metrics, and generated text can contain errors. You must verify important information against original account records before relying on it.</p>,
    },
    {
      title: "Subscriptions and billing",
      body: <><p>When paid checkout is enabled, paid plans are billed at the price and interval shown on the external checkout page. Stripe may process payment and provide its own checkout terms. Unless checkout says otherwise, subscriptions renew automatically until canceled. You authorize only the charge presented at checkout.</p><p className="mt-4">You may cancel future renewal through any billing control provided with the subscription or by contacting <ContactLink />. Cancellation takes effect at the end of the paid period unless stated otherwise. Fees already charged are non-refundable except where required by law or where Cova expressly agrees. Price or plan changes will be disclosed before they apply to a future billing period.</p></>,
    },
    {
      title: "Intellectual property",
      body: <p>Cova and its software, interface, design, branding, documentation, and service content are owned by the Cova operator or its licensors and are protected by applicable intellectual-property laws. These Terms grant only a limited, personal, revocable, non-transferable right to use the service. Feedback may be used without restriction or compensation, provided it does not identify you contrary to the Privacy Policy.</p>,
    },
    {
      title: "Community",
      body: <p>The Cova Discord and other community spaces are optional third-party services. Follow posted community rules and Discord’s terms. Community content comes from participants, not Cova, and must not be treated as financial advice. Cova may moderate or remove access to protect the community, but cannot guarantee that every message is accurate or appropriate.</p>,
    },
    {
      title: "Termination and deletion",
      body: <p>You may stop using Cova at any time and may request account deletion through Cova’s account controls or <ContactLink />. Cova may suspend or terminate access for material breach, security risk, provider requirement, nonpayment, or legal obligation. Terms that by their nature should survive, including ownership, disclaimers, liability limits, and dispute provisions, continue after termination.</p>,
    },
    {
      title: "Warranty disclaimer",
      body: <p>To the maximum extent permitted by law, Cova is provided “as is” and “as available.” Cova disclaims implied warranties of merchantability, fitness for a particular purpose, title, non-infringement, accuracy, and uninterrupted or error-free operation. Cova does not warrant provider data, calculations, availability, security against every threat, trading outcomes, payouts, funding, or future performance. Rights that cannot legally be disclaimed remain unaffected.</p>,
    },
    {
      title: "Limitation of liability",
      body: <p>To the maximum extent permitted by law, Cova’s operator and service providers will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages; trading losses; lost profits; loss of data; account action; provider downtime; or reliance on generated outputs. Cova’s aggregate liability for claims relating to the service will not exceed the greater of the amount you paid Cova during the 12 months before the claim or US $100. This limitation does not apply where prohibited by law.</p>,
    },
    {
      title: "Indemnity",
      body: <p>To the extent permitted by law, you agree to defend and indemnify Cova’s operator from third-party claims, losses, and reasonable costs arising from your unlawful use of the service, violation of these Terms, infringement of another person’s rights, or submission of data you were not authorized to provide. This provision does not require indemnity for Cova’s own unlawful conduct.</p>,
    },
    {
      title: "Disputes and governing law",
      body: <p>These Terms are governed by the laws applicable where Cova’s operator is established, without regard to conflict-of-law principles, except that mandatory consumer protections in your location remain available. Before filing a claim, contact <ContactLink /> and allow 30 days for a good-faith attempt to resolve it. A dispute may be brought in a court with lawful jurisdiction over the parties and subject matter. Nothing here limits rights that cannot be waived under applicable law.</p>,
    },
    {
      title: "Changes and contact",
      body: <><p>Cova may update these Terms as the service or law changes. Material changes will be presented through reasonable notice, and continued use after the effective date means you accept the revised Terms. If a change requires renewed consent, Cova will request it.</p><p className="mt-4">Questions about these Terms may be sent to <ContactLink />.</p></>,
    },
  ];

  return <LegalDocument active="terms" eyebrow="Terms & boundaries" icon={<Scale className="h-5 w-5" />} intro={<>The rules for using Cova, the limits of the service, and the responsibilities that stay with the trader.</>} sections={sections} title="Terms of Service" go={go} />;
}

export function SecurityPage({ go }: LegalPageProps) {
  const sections: LegalSection[] = [
    {
      title: "Security approach",
      body: <p>Cova uses layered technical and operational safeguards appropriate to an early-stage read-only trading journal. Security is an ongoing process, not a guarantee. Cova limits stored information, keeps trade execution outside the product, and reviews connector behavior before describing it as production ready.</p>,
    },
    {
      title: "Authentication and transport",
      body: <p>Network traffic to Cova and configured service providers is protected with HTTPS/TLS. The current public product does not have production Supabase authentication configured. The reviewed release candidate uses Supabase passwordless magic links and provider-managed authentication tokens after owner setup, migration, and deployment verification. Cova does not store member passwords.</p>,
    },
    {
      title: "Broker connections",
      body: <><p>Direct broker and platform synchronization is not currently active in production. Provider approval, production Supabase setup, migrations, and end-to-end connector verification remain pending. The reviewed connector code is limited to account identity and trade-history endpoints and contains no order-placement, withdrawal, or account-management calls. Some provider-issued tokens, including ProjectX tokens, may nevertheless carry broader provider permissions.</p><p className="mt-4">The reviewed release candidate is designed to encrypt provider tokens with AES-256-GCM, bind connection records to the authenticated owner, and give the browser only an opaque Secure, HttpOnly, SameSite connection cookie. Those controls are not described as active production safeguards until the database and deployment are configured and verified.</p></>,
    },
    {
      title: "Local journal storage",
      body: <p>Imported CSV trades, review limits, Passport preferences, and Practice activity are currently stored primarily in first-party browser storage on the user’s device. This reduces server-side collection, but means users should protect device access and export anything they need before clearing browser data. Cova account controls clear the local Cova data associated with the session.</p>,
    },
    {
      title: "Infrastructure and access",
      body: <p>Cova currently uses Vercel for application hosting and request delivery. Supabase production setup is pending. The reviewed release candidate is designed to keep connector secrets in server-side configuration, enforce owner-bound records with database row-level security and server authorization checks, and keep administrative credentials out of browser code. Those database controls require migration and production verification before activation.</p>,
    },
    {
      title: "Payments and third parties",
      body: <p>When paid checkout is enabled, Stripe handles payment-card information on its systems. Cova does not store full payment-card numbers. Trading providers, Discord, Stripe, Vercel, planned Supabase services, and email providers maintain separate security programs and terms.</p>,
    },
    {
      title: "Data lifecycle",
      body: <p>Cova minimizes current data collection and stores imported journal information primarily in first-party browser storage. If direct connections are activated after approval and production verification, the reviewed lifecycle retains provider tokens only for a requested connection and includes disconnect and account-deletion controls. Security and legal records may be retained for limited periods when required to investigate abuse, satisfy law, or protect users.</p>,
    },
    {
      title: "Your security responsibilities",
      body: <p>Protect access to your email, devices, provider accounts, and API keys. Use provider-generated keys only when authorized, choose read-only or minimum scopes where offered, revoke keys you no longer use, never paste a broker password into Cova, and report unexpected connection activity immediately.</p>,
    },
    {
      title: "Incident reporting",
      body: <><p>Report suspected unauthorized access, exposed credentials, or security vulnerabilities to <ContactLink /> with the affected feature and enough detail to reproduce the issue. Do not access other users’ data, disrupt service, or publicly disclose sensitive details before Cova has a reasonable opportunity to investigate.</p><p className="mt-4">Cova will investigate credible reports, contain confirmed incidents, notify affected users and authorities when legally required, and document corrective action.</p></>,
    },
    {
      title: "Limitations and updates",
      body: <p>No system is immune from every threat. This page describes current safeguards and is not a certification, penetration-test report, SOC 2 claim, or warranty. Cova will update this page when material architecture or vendor practices change.</p>,
    },
  ];

  return <LegalDocument active="security" eyebrow="Security & trust" icon={<ShieldCheck className="h-5 w-5" />} intro={<>How Cova handles local journal data, authentication, provider tokens, infrastructure, deletion, and incident reports.</>} sections={sections} title="Security & Data Handling" go={go} />;
}
