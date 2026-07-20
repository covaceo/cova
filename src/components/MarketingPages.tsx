import { motion } from "motion/react";
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  ClipboardCheck,
  FileUp,
  Fingerprint,
  Gauge,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CsvExplainer } from "./CsvExplainer";
import { GlassButton } from "./GlassButton";
import { ImageAtmosphere, SectionShell } from "./LayoutShell";
import { PlanStrip } from "./PlanSections";
import { StartFreeButton } from "./StartFreeButton";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "practice" | "passport";
type AuthMode = "login" | "signup";
type PlanTier = "free" | "pro";
const COVA_DISCORD_INVITE_URL = "https://discord.gg/B83Czu3pAf";

export function FeaturesPage({ go, openAuth }: { go: (section: Section) => void; openAuth: (mode: AuthMode) => void }) {
  const featureGroups = [
    {
      title: "Trade journal",
      body: "Import trades, add notes, and keep one clean record of what actually happened.",
      Icon: BookOpen,
      action: "Upload trades",
      onClick: () => go("import"),
    },
    {
      title: "Performance review",
      body: "See P&L, win rate, drawdown, profit factor, and setup quality in one view.",
      Icon: Gauge,
      action: "Review account",
      onClick: () => go("dashboard"),
    },
    {
      title: "Risk limits",
      body: "Set daily loss, single trade loss, size, streak, and consistency limits.",
      Icon: SlidersHorizontal,
      action: "Set limits",
      onClick: () => go("rules"),
    },
    {
      title: "Plain-English insights",
      body: "Get coaching notes tied to your own trade history, not guesses or signals.",
      Icon: ClipboardCheck,
      action: "See insights",
      onClick: () => go("coach"),
    },
    {
      title: "Prop firm import paths",
      body: "Start with CSV exports today and prepare for read-only account connections.",
      Icon: FileUp,
      action: "View resources",
      onClick: () => go("resources"),
    },
    {
      title: "Backtesting lab",
      body: "Cova's in-app replay simulator reveals a deterministic demo tape step by step, records simulated executions, and turns practice into setup stats. It is not historical market data.",
      Icon: Target,
      action: "Open Practice",
      onClick: () => go("practice"),
    },
    {
      title: "Risk Passport",
      body: "Share proof of discipline without sending your full journal or trade calls.",
      Icon: Fingerprint,
      action: "Open passport",
      onClick: () => go("passport"),
    },
  ];

  return (
    <SectionShell
      eyebrow="Features"
      title="Everything a trader needs after the trade closes."
      action={<StartFreeButton icon onClick={() => openAuth("signup")} />}
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" opacity="opacity-[0.26]" />}
    >
      <div className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr]">
        <div className="liquid-glass-strong rounded-[40px] p-7 md:p-9">
          <p className="font-body text-sm uppercase tracking-[0.22em] text-[#b9f5df]">Built for review</p>
          <h3 className="mt-5 max-w-[13ch] font-body text-3xl font-semibold leading-[1.04] tracking-[-0.035em] text-white md:max-w-3xl md:text-6xl md:leading-[1.02]">
            Cova is a trading journal, risk desk, and proof layer in one workspace.
          </h3>
          <p className="mt-6 max-w-[31ch] font-body text-base font-light leading-relaxed text-white/62 md:max-w-2xl">
            The workflow stays simple: upload or connect history, review the account, tighten limits, then share a clean Passport when needed.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ["No signals", "Cova reviews behavior only."],
              ["Read-only", "Connections cannot place trades."],
              ["Prop focused", "Built around funded-account rules."],
            ].map(([label, body]) => (
              <div className="rounded-[24px] border border-white/10 bg-black/24 p-4" key={label}>
                <p className="font-body text-sm font-medium text-white">{label}</p>
                <p className="mt-2 font-body text-xs leading-relaxed text-white/45">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          {featureGroups.slice(0, 2).map(({ title, body, Icon, action, onClick }) => (
            <FeatureActionCard key={title} title={title} body={body} Icon={Icon} action={action} onClick={onClick} strong />
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {featureGroups.slice(2).map(({ title, body, Icon, action, onClick }) => (
          <FeatureActionCard key={title} title={title} body={body} Icon={Icon} action={action} onClick={onClick} />
        ))}
      </div>
    </SectionShell>
  );
}

function FeatureActionCard({ title, body, Icon, action, onClick, strong = false }: {
  title: string;
  body: string;
  Icon: LucideIcon;
  action: string;
  onClick: () => void;
  strong?: boolean;
}) {
  return (
    <motion.article
      className={`${strong ? "liquid-glass-strong" : "liquid-glass"} motion-surface flex min-h-[220px] flex-col rounded-[34px] p-6`}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.992 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className="grid h-11 w-11 place-items-center rounded-full border border-[#18c887]/24 bg-[#18c887]/10 text-[#b9f5df]">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-6 font-body text-xl font-semibold text-white">{title}</h3>
      <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/54">{body}</p>
      <button className="mt-auto inline-flex w-fit items-center gap-2 pt-6 font-body text-sm font-medium text-[#b9f5df]" onClick={onClick} type="button">
        {action}
        <ArrowUpRight className="h-4 w-4" />
      </button>
    </motion.article>
  );
}

export function PricingPage({ currentPlan, go, openAuth, upgradeToPro }: { currentPlan: PlanTier | null; go: (section: Section) => void; openAuth: (mode: AuthMode) => void; upgradeToPro: () => void }) {
  return (
    <div className="relative overflow-hidden">
      <PlanStrip compact currentPlan={currentPlan} go={go} openAuth={openAuth} upgradeToPro={upgradeToPro} />
      <section className="relative px-5 pb-28 pt-2 md:px-12 lg:px-20">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-3">
          {[
            ["Start small", "Free is intentionally limited so new traders can test the workflow without turning Cova into another cluttered dashboard."],
            ["Upgrade when it matters", "Pro is for traders who want stored history, more Passport control, and a fuller review trail."],
            ["No hidden trading layer", "Cova does not sell signals, place trades, or promise payouts. It reviews behavior after execution."],
          ].map(([title, body]) => (
            <div className="liquid-glass rounded-[32px] p-6" key={title}>
              <BadgeCheck className="h-7 w-7 text-[#18c887]" />
              <h3 className="mt-5 font-body text-xl font-semibold text-white">{title}</h3>
              <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/54">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ResourcesPage({ go, openAuth }: { go: (section: Section) => void; openAuth: (mode: AuthMode) => void }) {
  const resourceCards = [
    {
      title: "Prop firm exports",
      body: "TopstepX, Apex, Tradeify, MFFU, Rithmic, and Tradovate all need slightly different paths. Cova keeps the intake simple.",
      Icon: FileUp,
      action: "See import paths",
      route: "import" as const,
    },
    {
      title: "Connection workspace",
      body: "CSV works today. Pro connector access appears only when a supported provider is configured; Cova never requests order access.",
      Icon: LockKeyhole,
      action: "Open connections workspace",
      route: "import" as const,
    },
    {
      title: "Risk Passport basics",
      body: "The Passport is a shareable discipline summary. It is proof of process, not a trading signal.",
      Icon: Fingerprint,
      action: "Open Passport workspace",
      route: "passport" as const,
    },
    {
      title: "Backtesting scope",
      body: "Open Cova's in-app replay simulator to drill a setup on a deterministic demo tape and record simulated executions automatically. This preview is not historical market data.",
      Icon: Target,
      action: "Open Practice workspace",
      route: "practice" as const,
    },
  ];

  return (
    <SectionShell
      eyebrow="Resources"
      title="Learn the cleanest way to get trades into Cova."
      action={<StartFreeButton icon onClick={() => openAuth("signup")} />}
      backdrop={<ImageAtmosphere src="/media/cova-story-frame-02.png" opacity="opacity-[0.28]" />}
    >
      <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="liquid-glass-strong rounded-[32px] p-5 md:rounded-[40px] md:p-8">
          <FileUp className="h-10 w-10 text-[#18c887]" />
          <h3 className="mt-8 font-body text-4xl font-semibold leading-[1.02] tracking-[-0.035em] text-white">Start with the export you already have.</h3>
          <p className="mt-5 font-body font-light leading-relaxed text-white/58">Export trades or fills, download the CSV, then upload it for a column and row check before import.</p>
          <div className="mt-7 border-t border-white/10 pt-6">
            <CsvExplainer body="You do not need to understand the file. Cova checks the columns and warns you before importing rows." steps={["Find trades or fills", "Download the CSV", "Upload and review"]} />
          </div>
          <div className="mt-8">
            <GlassButton strong onClick={() => go("import")}>Open CSV import <ArrowUpRight className="h-4 w-4" /></GlassButton>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {resourceCards.map(({ title, body, Icon, action, route }) => (
            <button className="resource-action-card liquid-glass motion-surface group rounded-[28px] p-5 text-left md:rounded-[32px] md:p-6" key={title} onClick={() => go(route)} type="button">
              <Icon className="h-7 w-7 text-[#b9f5df]" />
              <h3 className="mt-5 font-body text-xl font-semibold text-white">{title}</h3>
              <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/54">{body}</p>
              <span className="mt-6 inline-flex items-center gap-2 font-body text-sm font-medium text-[#b9f5df]">{action} <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span>
            </button>
          ))}
        </div>
      </div>

    </SectionShell>
  );
}

export function CommunityPage({ go }: { go: (section: Section) => void }) {
  const communityItems = [
    ["#trade-review", "Completed trades, screenshots, context, execution notes, and what you would change."],
    ["#risk-discipline", "Sizing, drawdown decisions, rule breaks, and the habits behind consistent risk."],
    ["#passport-showcase", "Privacy-checked Cova Passports and progress worth documenting."],
    ["#product-feedback", "Show what is not working, the outcome you expected, and the evidence behind it."],
  ];

  const openDiscord = () => {
    const discordWindow = window.open(COVA_DISCORD_INVITE_URL, "_blank", "noopener,noreferrer");
    if (discordWindow) {
      discordWindow.opener = null;
    }
  };

  return (
    <SectionShell
      title="Review the decision behind the trade."
      action={<GlassButton strong onClick={openDiscord}>Join Cova on Discord <ArrowUpRight className="h-4 w-4" /></GlassButton>}
      backdrop={<ImageAtmosphere src="/media/cova-story-frame-04.png" align="right" opacity="opacity-[0.28]" />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_0.78fr]">
        <div className="liquid-glass-strong rounded-[32px] p-5 md:rounded-[42px] md:p-10">
          <h3 className="max-w-[16ch] font-body text-3xl font-semibold leading-[1.04] tracking-[-0.035em] text-white md:max-w-3xl md:text-6xl md:leading-[1.02]">
            Bring the screenshot. Explain what you saw and what you did.
          </h3>
          <p className="mt-6 max-w-[31ch] font-body text-base font-light leading-relaxed text-white/62 md:max-w-2xl">
            Good trade, bad trade, clean execution, rule break. The point is to understand the decision and leave with something useful for the next session.
          </p>
          <div className="mt-8 divide-y divide-white/10 border-y border-white/10 md:grid md:grid-cols-2 md:divide-x md:divide-y-0">
            {communityItems.map(([title, body]) => (
              <div className="py-4 md:px-4" key={title}>
                <p className="font-body text-sm font-semibold text-white">{title}</p>
                <p className="mt-2 font-body text-xs leading-relaxed text-white/46">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5">
          <div className="liquid-glass rounded-[30px] p-5 md:rounded-[36px] md:p-7">
            <Target className="h-9 w-9 text-[#18c887]" />
            <h3 className="mt-6 font-body text-2xl font-semibold text-white">What belongs here</h3>
            <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/54">
              Completed trades, rule breaks, sizing work, Cova questions, and product feedback backed by evidence.
            </p>
          </div>
          <div className="liquid-glass rounded-[30px] p-5 md:rounded-[36px] md:p-7">
            <ShieldCheck className="h-9 w-9 text-emerald-300" />
            <h3 className="mt-6 font-body text-2xl font-semibold text-white">The boundaries</h3>
            <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/54">
              No live entry calls, paid signals, copy trading, account management, broker solicitation, or requests for private account information.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <GlassButton strong onClick={openDiscord}>Open Discord <ArrowUpRight className="h-4 w-4" /></GlassButton>
            <GlassButton onClick={() => go("resources")}>Read resources <ArrowUpRight className="h-4 w-4" /></GlassButton>
          </div>
          <p className="font-body text-xs leading-relaxed text-white/42">
            The invite opens #start-here with the channel map and posting boundaries.
          </p>
        </div>
      </div>
    </SectionShell>
  );
}

