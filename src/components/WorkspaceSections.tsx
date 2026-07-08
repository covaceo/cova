import { motion } from "motion/react";
import {
  ArrowUpRight,
  BadgeCheck,
  CircleDot,
  Copy,
  Download,
  Eye,
  EyeOff,
  Gauge,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { analyze, formatMoney, formatPercent, type RiskRule } from "../lib/risk";
import { GlassButton } from "./GlassButton";
import { ImageAtmosphere, SectionShell } from "./LayoutShell";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "passport";
type WorkspaceEntitlements = {
  canEditAdvancedLimits: boolean;
  canExportPassport: boolean;
  insightLimit: number;
  plan: "free" | "pro";
};

export function RulesEngine({ analysis, entitlements, rules, setRules, upgradeToPro }: { analysis: ReturnType<typeof analyze>; entitlements: WorkspaceEntitlements; rules: RiskRule[]; setRules: (rules: RiskRule[]) => void; upgradeToPro: () => void }) {
  return (
    <SectionShell
      eyebrow="Guardrails"
      title="Rules that protect the payout."
      variant="workspace"
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" align="right" opacity="opacity-[0.18]" />}
    >
      <div className="rules-desk-grid rules-ledger-grid grid gap-6 lg:grid-cols-[0.64fr_1.36fr]">
        <div className="rules-summary-card rules-ledger-summary p-6 md:p-7">
          <SlidersHorizontal className="h-10 w-10 text-[#18c887]" />
          <h3 className="mt-7 font-body text-3xl font-semibold leading-[0.98] tracking-[-0.05em] md:text-4xl">Do not give the account back.</h3>
          <p className="mt-5 font-body font-light leading-relaxed text-white/60">
            Set the limits that stop the bad day from becoming a blown account. Cova checks every trade against these rules in plain English.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="rules-ledger-stat p-5">
              <p className="font-body text-xs uppercase tracking-[0.22em] text-white/40">Active warnings</p>
              <p className="mt-2 font-body text-4xl text-red-400">{analysis.breaches.length}</p>
            </div>
            <div className="rules-ledger-stat p-5">
              <p className="font-body text-xs uppercase tracking-[0.22em] text-white/40">Rules followed</p>
              <p className="mt-2 font-body text-4xl text-emerald-400">{formatPercent(analysis.compliance)}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          {rules.map((rule, index) => {
            const status = analysis.ruleStatuses.find((item) => item.rule.id === rule.id);
            const isMinimumRule = rule.metric.includes("min");
            const isCountRule = rule.metric === "maxContracts" || rule.metric === "maxLossStreak";
            const rangeMax = rule.metric === "maxContracts" ? 10 : rule.metric === "maxLossStreak" ? 8 : isMinimumRule ? 3 : 10000;
            const rangeMin = isCountRule ? 1 : isMinimumRule ? 0 : 100;
            const rangeStep = isCountRule ? 1 : isMinimumRule ? 0.05 : 50;
            const formattedLimit = isCountRule ? rule.limit : isMinimumRule ? rule.limit.toFixed(2) : formatMoney(rule.limit);
            const locked = isMinimumRule && !entitlements.canEditAdvancedLimits;
            return (
              <motion.article
                key={rule.id}
                className={`rule-control-card rules-ledger-row p-4 md:p-5 ${locked ? "opacity-70" : ""}`}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.045, duration: 0.55 }}
              >
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">{friendlyRuleMetric(rule.metric)}</p>
                    <h3 className="mt-2 font-body text-xl font-medium">{rule.name}</h3>
                    <p className="mt-1 font-body text-sm font-light text-white/50">{status?.summary}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {locked && (
                      <button className="rounded-full border border-[#18c887]/24 bg-[#18c887]/10 px-3 py-1 font-body text-xs text-[#b9f5df]" onClick={upgradeToPro} type="button">
                        Pro
                      </button>
                    )}
                    <span className={`rounded-full px-3 py-1 font-body text-xs ${status?.breached ? "bg-red-500/15 text-red-300" : "bg-emerald-400/15 text-emerald-300"}`}>
                      {status?.breached ? "Fix before trade" : "Clean"}
                    </span>
                    <button
                      className={`h-8 w-14 rounded-full border p-1 transition ${rule.enabled ? "border-emerald-300/50 bg-emerald-400/20" : "border-white/15 bg-white/5"}`}
                      onClick={() => setRules(rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))}
                      disabled={locked}
                      type="button"
                      aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                    >
                      <span className={`block h-6 w-6 rounded-full bg-white transition ${rule.enabled ? "translate-x-6" : ""}`} />
                    </button>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 md:grid-cols-[1fr_150px] md:items-center">
                  <input
                    type="range"
                    min={rangeMin}
                    max={rangeMax}
                    step={rangeStep}
                    value={rule.limit}
                    onChange={(event) => setRules(rules.map((item) => item.id === rule.id ? { ...item, limit: Number(event.target.value) } : item))}
                    disabled={locked}
                    className="cova-range"
                  />
                  <label className="grid gap-1">
                    <span className="font-body text-[10px] uppercase tracking-[0.18em] text-white/35">Limit</span>
                    <input
                      className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-right font-mono text-lg text-[#18c887] outline-none transition focus:border-[#18c887]"
                      min={rangeMin}
                      max={rangeMax}
                      step={rangeStep}
                      type="number"
                      value={rule.limit}
                      onChange={(event) => setRules(rules.map((item) => item.id === rule.id ? { ...item, limit: Number(event.target.value) } : item))}
                      disabled={locked}
                      aria-label={`${rule.name} limit`}
                    />
                    <span className="text-right font-body text-[11px] text-white/35">{formattedLimit}</span>
                  </label>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </SectionShell>
  );
}

export function Coach({ analysis, entitlements, go, upgradeToPro }: { analysis: ReturnType<typeof analyze>; entitlements: WorkspaceEntitlements; go: (section: Section) => void; upgradeToPro: () => void }) {
  const primaryBreach = analysis.breaches[0];
  const bestSetup = analysis.bySetup[0];
  const brief = analysis.nextSessionBrief;
  const briefIcon = brief.status === "locked" ? LockKeyhole : brief.status === "ready" ? ShieldCheck : Gauge;
  const briefTone = brief.status === "locked" ? "PAUSE" : brief.status === "ready" ? "READY" : "CAUTION";
  const insights = [
    {
      icon: CircleDot,
      title: analysis.breaches.length ? "A few habits need attention" : "Your risk looks steady",
      body: analysis.breaches.length ? `${analysis.breaches.length} limit warning${analysis.breaches.length === 1 ? " is" : "s are"} pulling down your Risk Passport.` : "Your imported trades are staying inside the limits you set.",
      tone: analysis.breaches.length ? "WARN" : "GOOD",
      evidence: primaryBreach?.evidence.slice(0, 2) ?? [`${analysis.trades.length} trades checked`, `${formatPercent(analysis.compliance)} of limits followed`],
    },
    {
      icon: ShieldCheck,
      title: "Your clearest setup",
      body: `${bestSetup?.name ?? "Setup"} has the most trade history so far, with ${bestSetup?.count ?? 0} trades to review.`,
      tone: "GOOD",
      evidence: bestSetup ? [`${bestSetup.count} trades`, `${bestSetup.avgR.toFixed(2)}R average result`] : ["Upload more rows to learn which setups are working."],
    },
    {
      icon: briefIcon,
      title: brief.headline,
      body: brief.summary,
      tone: briefTone,
      evidence: brief.evidence.slice(0, 2),
    },
  ];
  const visibleInsights = insights.slice(0, entitlements.insightLimit);
  const lockedInsightCount = Math.max(0, insights.length - visibleInsights.length);
  return (
    <SectionShell
      eyebrow="Insights"
      title="Review plain-English insights."
      variant="workspace"
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" align="right" opacity="opacity-[0.2]" />}
    >
      <div className="insights-briefing-feed grid gap-0">
        {visibleInsights.map((insight, index) => (
          <motion.article
            key={insight.title}
            className="insight-briefing-row p-6 md:p-7"
            initial={{ opacity: 0, y: 34, filter: "blur(14px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.09, duration: 0.65 }}
          >
            <insight.icon className="h-10 w-10 text-[#18c887]" />
            <span className="mt-10 inline-block rounded-full bg-white/5 px-3 py-1 font-body text-xs text-white/50">{insight.tone}</span>
            <h3 className="mt-5 font-heading text-4xl italic leading-[1] tracking-normal">{insight.title}</h3>
            <p className="mt-5 font-body font-light leading-relaxed text-white/58">{insight.body}</p>
            <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
              {insight.evidence.map((line) => (
                <p className="font-mono text-xs text-white/42" key={line}>Checked: {line}</p>
              ))}
            </div>
          </motion.article>
        ))}
        {lockedInsightCount > 0 && (
          <motion.article
            className="insight-briefing-row insight-briefing-locked p-6 md:p-7"
            initial={{ opacity: 0, y: 34, filter: "blur(14px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true }}
            transition={{ delay: visibleInsights.length * 0.09, duration: 0.65 }}
          >
            <LockKeyhole className="h-10 w-10 text-[#18c887]" />
            <span className="mt-10 inline-block rounded-full bg-[#18c887]/10 px-3 py-1 font-body text-xs text-[#b9f5df]">PRO</span>
            <h3 className="mt-5 font-heading text-4xl italic leading-[1] tracking-normal">Unlock deeper review notes.</h3>
            <p className="mt-5 font-body font-light leading-relaxed text-white/58">
              Pro keeps full insight history and shows every coaching note Cova finds in your trade data.
            </p>
            <div className="mt-6">
              <GlassButton strong onClick={upgradeToPro}>Unlock Pro <ArrowUpRight className="h-4 w-4" /></GlassButton>
            </div>
          </motion.article>
        )}
      </div>
      <div className="mt-8">
        <GlassButton strong onClick={() => go("passport")}>Share Risk Passport <ArrowUpRight className="h-4 w-4" /></GlassButton>
      </div>
    </SectionShell>
  );
}

type PassportTier = {
  badge: string;
  cardClass: string;
  className: string;
  headline: string;
  rank: string;
  skin: string;
  summary: string;
};

type PassportShareModeId = "flex" | "discipline" | "private" | "coach";

type PassportShareMode = {
  cardSubtitle: string;
  hidden: string[];
  id: PassportShareModeId;
  label: string;
  reveals: string[];
  tagline: string;
};

type PassportStat = {
  label: string;
  tone?: "positive" | "negative" | "neutral";
  value: string;
};

const passportShareModes: PassportShareMode[] = [
  {
    id: "flex",
    label: "Flex",
    tagline: "Gains visible, risk proof intact.",
    cardSubtitle: "Gains + discipline proof",
    reveals: ["Net P&L", "Cova rank", "Risk score", "Rules kept"],
    hidden: ["Full trade list", "Broker details", "Private notes"],
  },
  {
    id: "discipline",
    label: "Discipline",
    tagline: "Show control without flashing P&L.",
    cardSubtitle: "Discipline proof, P&L hidden",
    reveals: ["Cova rank", "Rules kept", "Average R", "Drawdown control"],
    hidden: ["Net P&L", "Individual trades", "Account size"],
  },
  {
    id: "private",
    label: "Ghost",
    tagline: "Clean proof with sensitive stats masked.",
    cardSubtitle: "Private proof layer",
    reveals: ["Verification date", "Sample quality", "Risk score range", "Rules kept"],
    hidden: ["Net P&L", "Win rate", "Trader identity"],
  },
  {
    id: "coach",
    label: "Coach",
    tagline: "Expose leaks for accountability.",
    cardSubtitle: "Coach review mode",
    reveals: ["Top leak", "Rule breaches", "Next fix", "Risk score"],
    hidden: ["Shareable flex stats", "Public P&L", "Broker details"],
  },
];

function getPassportTier(analysis: ReturnType<typeof analyze>): PassportTier {
  const breachCount = analysis.breaches.length;
  const score = analysis.score;
  const tradeCount = analysis.trades.length;
  const profitable = analysis.totalPnl > 0;
  const inTheRed = analysis.totalPnl < 0;
  const positiveExpectancy = analysis.avgR > 0 && analysis.profitFactor >= 1.05;

  if (
    profitable &&
    positiveExpectancy &&
    tradeCount >= 30 &&
    score >= 90 &&
    analysis.compliance >= 0.9 &&
    breachCount <= 1 &&
    analysis.avgR >= 0.3 &&
    analysis.profitFactor >= 1.5
  ) {
    return {
      badge: "BD",
      rank: "Black Diamond",
      skin: "Rare discipline cut",
      headline: "Elite risk control",
      summary: "Rare flex: profitable sample, clean rules, strong expectancy, and almost no risk leaks.",
      className: "passport-tier-s",
      cardClass: "passport-card-skin-s",
    };
  }
  if (
    profitable &&
    positiveExpectancy &&
    tradeCount >= 20 &&
    score >= 82 &&
    analysis.compliance >= 0.8 &&
    breachCount <= 2 &&
    analysis.avgR >= 0.15 &&
    analysis.profitFactor >= 1.25
  ) {
    return {
      badge: "EE",
      rank: "Emerald Edge",
      skin: "Funded-ready control",
      headline: "Disciplined trader profile",
      summary: "Profitable, controlled, and clean enough to show without hiding the risk receipt.",
      className: "passport-tier-a",
      cardClass: "passport-card-skin-a",
    };
  }
  if (
    profitable &&
    positiveExpectancy &&
    tradeCount >= 10 &&
    score >= 68 &&
    analysis.compliance >= 0.6
  ) {
    return {
      badge: "SG",
      rank: "Sapphire Grind",
      skin: "Controlled climber",
      headline: "Profitable, still tightening",
      summary: "Real proof is forming, but rule breaches still cap the flex. Clean those and the card gets dangerous.",
      className: "passport-tier-b",
      cardClass: "passport-card-skin-b",
    };
  }
  if (profitable) {
    return {
      badge: "RH",
      rank: "Ruby Heat",
      skin: "Profit with risk",
      headline: "Green P&L, risky control",
      summary: "The account is green, but rule proof, expectancy, or sample quality is not flex-ready yet.",
      className: "passport-tier-v",
      cardClass: "passport-card-skin-v",
    };
  }
  if (inTheRed) {
    return {
      badge: "BN",
      rank: "Blown",
      skin: "Red account warning",
      headline: "Account is in the red",
      summary: "This Passport is not flex-ready. First job is stopping the leak and rebuilding control.",
      className: "passport-tier-blown",
      cardClass: "passport-card-skin-blown",
    };
  }
  return {
    badge: "RS",
    rank: "Raw Stone",
    skin: "Build the receipt",
    headline: "Build the proof first",
    summary: "Not enough profitable, controlled proof yet. Import more trades and keep the rules clean.",
    className: "passport-tier-r",
    cardClass: "passport-card-skin-r",
  };
}

function getPassportMode(id: PassportShareModeId) {
  return passportShareModes.find((mode) => mode.id === id) ?? passportShareModes[0];
}

function getPrimaryLeak(analysis: ReturnType<typeof analyze>) {
  return analysis.behaviorFlags.find((flag) => flag.severity === "critical" || flag.severity === "warning")?.label
    ?? analysis.breaches[0]?.rule.name
    ?? "No major leak";
}

function getPassportStats(analysis: ReturnType<typeof analyze>, mode: PassportShareModeId): PassportStat[] {
  if (mode === "discipline") {
    return [
      { label: "Risk score", value: `${analysis.score}/100`, tone: "positive" },
      { label: "Rules kept", value: formatPercent(analysis.compliance), tone: analysis.compliance >= 0.75 ? "positive" : "negative" },
      { label: "Average R", value: `${analysis.avgR.toFixed(2)}R`, tone: analysis.avgR >= 0 ? "positive" : "negative" },
      { label: "Max DD", value: formatMoney(Math.round(analysis.maxDrawdown)), tone: analysis.maxDrawdown > 0 ? "neutral" : "positive" },
    ];
  }
  if (mode === "private") {
    return [
      { label: "Risk score", value: analysis.score ? `${Math.floor(analysis.score / 10) * 10}+` : "Hidden", tone: "positive" },
      { label: "Rules kept", value: formatPercent(analysis.compliance), tone: analysis.compliance >= 0.75 ? "positive" : "negative" },
      { label: "Sample", value: analysis.evidenceQuality.label, tone: "neutral" },
      { label: "Generated", value: analysis.latestDate, tone: "neutral" },
    ];
  }
  if (mode === "coach") {
    return [
      { label: "Risk score", value: `${analysis.score}/100`, tone: "neutral" },
      { label: "Flags", value: `${analysis.breaches.length}`, tone: analysis.breaches.length ? "negative" : "positive" },
      { label: "Top leak", value: getPrimaryLeak(analysis), tone: analysis.breaches.length ? "negative" : "positive" },
      { label: "Next", value: analysis.nextSessionBrief.status.toUpperCase(), tone: analysis.nextSessionBrief.status === "ready" ? "positive" : "negative" },
    ];
  }
  return [
    { label: "Net P&L", value: formatMoney(analysis.totalPnl), tone: analysis.totalPnl >= 0 ? "positive" : "negative" },
    { label: "Risk score", value: `${analysis.score}/100`, tone: "positive" },
    { label: "Rules kept", value: formatPercent(analysis.compliance), tone: analysis.compliance >= 0.75 ? "positive" : "negative" },
    { label: "Win rate", value: formatPercent(analysis.winRate), tone: "neutral" },
  ];
}

export function Passport({ analysis, entitlements, sharePassport, go, upgradeToPro }: { analysis: ReturnType<typeof analyze>; entitlements: WorkspaceEntitlements; sharePassport: () => void; go: (section: Section) => void; upgradeToPro: () => void }) {
  const [copied, setCopied] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [expiry, setExpiry] = useState("7 days");
  const [shareModeId, setShareModeId] = useState<PassportShareModeId>("flex");
  const cardRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const tier = getPassportTier(analysis);
  const shareMode = getPassportMode(shareModeId);
  const cardStats = getPassportStats(analysis, shareModeId);
  const verifiedRules = analysis.ruleStatuses.length - analysis.breaches.length;
  const verificationId = `COVA-${analysis.latestDate.replace(/-/g, "").slice(2)}-${analysis.score}${verifiedRules}`;
  const privacyRows = [
    { label: "Net P&L", visible: shareMode.reveals.includes("Net P&L") },
    { label: "Broker", visible: false },
    { label: "Notes", visible: false },
    { label: "Rule proof", visible: true },
    { label: "Trade history", visible: false },
    { label: "Open positions", visible: false },
  ];

  useEffect(() => () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
  }, []);

  function copyPassport() {
    sharePassport();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  function movePassportCard(event: React.PointerEvent<HTMLDivElement>) {
    const card = cardRef.current;
    const shadow = shadowRef.current;
    if (!card) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const rotateY = (x - 0.5) * 4.5;
    const rotateX = (0.5 - y) * 3.5;
    const lightX = x * 100;
    const lightY = y * 100;
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = window.requestAnimationFrame(() => {
      card.style.setProperty("--passport-rotate-x", `${rotateX.toFixed(2)}deg`);
      card.style.setProperty("--passport-rotate-y", `${rotateY.toFixed(2)}deg`);
      card.style.setProperty("--passport-light-x", `${lightX.toFixed(1)}%`);
      card.style.setProperty("--passport-light-y", `${lightY.toFixed(1)}%`);
      card.style.setProperty("--passport-lift", "-3px");
      if (shadow) {
        shadow.style.setProperty("--passport-shadow-x", `${((x - 0.5) * -8).toFixed(1)}px`);
        shadow.style.setProperty("--passport-shadow-y", `${(3 + Math.abs(y - 0.5) * 5).toFixed(1)}px`);
        shadow.style.setProperty("--passport-shadow-scale", `${(1.01 + Math.abs(x - 0.5) * 0.025).toFixed(3)}`);
        shadow.style.setProperty("--passport-shadow-opacity", "0.7");
      }
      frameRef.current = null;
    });
  }

  function resetPassportCard() {
    const card = cardRef.current;
    const shadow = shadowRef.current;
    if (!card) {
      return;
    }
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    card.style.setProperty("--passport-rotate-x", "0deg");
    card.style.setProperty("--passport-rotate-y", "0deg");
    card.style.setProperty("--passport-light-x", "52%");
    card.style.setProperty("--passport-light-y", "18%");
    card.style.setProperty("--passport-lift", "0px");
    if (shadow) {
      shadow.style.setProperty("--passport-shadow-x", "0px");
      shadow.style.setProperty("--passport-shadow-y", "0px");
      shadow.style.setProperty("--passport-shadow-scale", "1");
      shadow.style.setProperty("--passport-shadow-opacity", "0.58");
    }
  }

  return (
    <SectionShell
      eyebrow="Verified credential"
      title="Risk Passport"
      variant="workspace"
      backdrop={<ImageAtmosphere src="/media/cova-passport-product.jpg" align="right" opacity="opacity-[0.18]" />}
    >
      <div className="passport-workbench">
        <div className="passport-topbar">
          <div>
            <p className="passport-kicker">{entitlements.plan === "free" ? "Free preview" : "Verified credential"}</p>
            <p className="passport-topbar-copy">
              A shareable black-card view of gains, discipline, and rule proof. Switch the mode before sending it.
            </p>
          </div>
          <div className="passport-topbar-actions">
            <button className="passport-action-button" onClick={() => go("dashboard")} type="button">Back to review</button>
            <button className="passport-action-button" onClick={entitlements.canExportPassport ? () => downloadPassportPng(analysis, visibility, expiry, tier, shareMode) : upgradeToPro} type="button">
              <Download className="h-4 w-4" /> {entitlements.canExportPassport ? "Download card" : "Unlock export"}
            </button>
            <button className="passport-action-button passport-action-primary" onClick={copyPassport} type="button">
              <Copy className="h-4 w-4" /> {copied ? "Copied" : "Share"}
            </button>
          </div>
        </div>

        <div className="passport-console-shell">
          <motion.div
            className="passport-credential-zone"
            initial={{ opacity: 0, scale: 0.98, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="passport-card-scene passport-credential-scene">
              <div className="passport-ground" ref={shadowRef} />
              <div
                className="passport-card-hitbox passport-credential-hitbox"
                onPointerMove={movePassportCard}
                onPointerLeave={resetPassportCard}
              >
                <div className="passport-card-3d" ref={cardRef}>
                  <div className="passport-card-depth passport-credential-depth" />
                  <div className={`passport-card-face passport-credential-card ${tier.cardClass}`}>
                    <div className="passport-card-noise" />
                    <div className="passport-card-shine" />
                    <div className="passport-card-grid" />
                    <div className="passport-security-lines" />
                    <div className="passport-credential-inner">
                      <div className="passport-card-headerline">
                        <div>
                          <p className="passport-brand-mark">Cova / Risk Passport</p>
                          <h3>{tier.rank}</h3>
                          <p>{tier.skin} · {tier.headline}</p>
                        </div>
                        <div className="passport-rank-plaque">
                          <span>Edition</span>
                          <strong>{tier.badge}</strong>
                          <em>{analysis.score}/100 Cova Score</em>
                        </div>
                      </div>

                      <div className="passport-card-mainrow">
                        <div className="passport-score-vault">
                          <span>Cova Score</span>
                          <strong>{analysis.score}<small>/100</small></strong>
                          <em>{analysis.evidenceQuality.label} · {analysis.trades.length} trades</em>
                        </div>

                        <div className="passport-stat-vault">
                          {cardStats.slice(0, 4).map((stat) => (
                            <div className={`passport-stat-cell passport-stat-${stat.tone ?? "neutral"}`} key={stat.label}>
                              <span>{stat.label}</span>
                              <strong>{stat.value}</strong>
                            </div>
                          ))}
                        </div>

                        <div className="passport-flex-stack">
                          <div className="passport-edition-card">
                            <span>Mode</span>
                            <strong>{shareMode.label}</strong>
                            <em>{shareMode.cardSubtitle}</em>
                          </div>
                          <div className="passport-pass-id">
                            <span>Verified ID</span>
                            <code>{verificationId}</code>
                            <small>{verifiedRules}/{analysis.ruleStatuses.length} rules held · {visibility === "private" ? "Private link" : "Public card"}</small>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <aside className="passport-share-rail">
            <div className="passport-rail-section">
              <div className="passport-rail-heading">
                <span>Share mode</span>
                <button
                  className="passport-visibility-toggle"
                  onClick={() => setVisibility(visibility === "private" ? "public" : "private")}
                  type="button"
                >
                  {visibility === "private" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {visibility === "private" ? "Private" : "Public"}
                </button>
              </div>
              <div className="passport-mode-list">
                {passportShareModes.map((mode) => (
                  <button
                    className={`passport-mode-row ${shareModeId === mode.id ? "is-active" : ""}`}
                    key={mode.id}
                    onClick={() => setShareModeId(mode.id)}
                    type="button"
                  >
                    <span>{mode.label}</span>
                    <small>{mode.tagline}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="passport-rail-section">
              <div className="passport-rail-heading"><span>Privacy & reveal</span></div>
              <div className="passport-privacy-list">
                {privacyRows.map((row) => (
                  <div className="passport-privacy-row" key={row.label}>
                    <span>{row.label}</span>
                    <strong className={row.visible ? "is-visible" : "is-hidden"}>
                      {row.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {row.visible ? "Visible" : "Hidden"}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            <label className="passport-expiry-field">
              <span>Expiry</span>
              <select value={expiry} onChange={(event) => setExpiry(event.target.value)}>
                <option>24 hours</option>
                <option>7 days</option>
                <option>30 days</option>
                <option>No expiry</option>
              </select>
            </label>
          </aside>
        </div>

        <div className="passport-ledger-panel">
          <div className="passport-ledger-heading">
            <div>
              <p>Proof ledger</p>
              <span>Recent rule verifications and system checks.</span>
            </div>
            <strong><BadgeCheck className="h-4 w-4" /> All systems verified</strong>
          </div>
          <div className="passport-ledger-table">
            {analysis.ruleStatuses.slice(0, 3).map((status, index) => (
              <div className="passport-ledger-row" key={status.rule.id}>
                <span className="passport-ledger-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{status.rule.name}</strong>
                  <small>{status.summary}</small>
                </div>
                <span className={status.breached ? "is-failed" : "is-passed"}>{status.breached ? "Flagged" : "Passed"}</span>
                <code>{status.rule.id}_{analysis.latestDate}.json</code>
                <time>{analysis.latestDate}</time>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

function friendlyRuleMetric(metric: RiskRule["metric"]) {
  const labels: Record<RiskRule["metric"], string> = {
    maxDailyLoss: "Daily loss",
    maxTradeLoss: "Single trade loss",
    maxContracts: "Position size",
    maxLossStreak: "Loss streak",
    minProfitFactor: "Profit factor",
    minAvgR: "Average R",
  };
  return labels[metric];
}

function downloadPassportPng(analysis: ReturnType<typeof analyze>, visibility: string, expiry: string, tier: PassportTier, shareMode: PassportShareMode) {
  const displayPnl = shareMode.id === "flex" ? formatMoney(analysis.totalPnl) : "P&L HIDDEN";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#020306"/>
          <stop offset="0.48" stop-color="#11100a"/>
          <stop offset="1" stop-color="#071225"/>
        </linearGradient>
        <linearGradient id="line" x1="0" x2="1">
          <stop stop-color="#f7c96c"/>
          <stop offset="1" stop-color="#18c887"/>
        </linearGradient>
      </defs>
      <rect width="1400" height="900" rx="54" fill="url(#bg)"/>
      <rect x="58" y="58" width="1284" height="784" rx="42" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.24)" stroke-width="2"/>
      <text x="104" y="142" fill="#f8fbff" font-family="Georgia,serif" font-size="68" font-style="italic">Cova</text>
      <text x="104" y="236" fill="#f8fbff" font-family="Courier New,monospace" font-size="68" letter-spacing="14">RISK PASSPORT</text>
      <text x="104" y="296" fill="#f7c96c" font-family="Courier New,monospace" font-size="30" letter-spacing="8">${tier.rank} · ${tier.skin.toUpperCase()}</text>
      <rect x="104" y="360" width="1192" height="2" fill="rgba(255,255,255,0.16)"/>
      <text x="104" y="486" fill="#18c887" font-family="Courier New,monospace" font-size="124">${analysis.score}</text>
      <text x="292" y="486" fill="#a6b8b0" font-family="Courier New,monospace" font-size="44">/100 COVA SCORE</text>
      <text x="104" y="586" fill="#f8fbff" font-family="Courier New,monospace" font-size="48">${displayPnl}</text>
      <text x="104" y="656" fill="#36e2a0" font-family="Courier New,monospace" font-size="44">${formatPercent(analysis.compliance)} RULES KEPT</text>
      <text x="104" y="728" fill="#a6b8b0" font-family="Courier New,monospace" font-size="26">Mode: ${shareMode.label.toUpperCase()} · Visibility: ${visibility.toUpperCase()} · Expiry: ${expiry.toUpperCase()}</text>
      <path d="M850 630 C920 560 960 690 1020 620 S1130 540 1230 590" fill="none" stroke="url(#line)" stroke-width="8"/>
      <rect x="1074" y="116" width="172" height="172" rx="30" fill="rgba(247,201,108,0.1)" stroke="rgba(247,201,108,0.55)"/>
      <text x="1122" y="222" fill="#f8fbff" font-family="Courier New,monospace" font-size="78">${tier.badge}</text>
    </svg>
  `;
  const image = new Image();
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(svgUrl);
      return;
    }
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(svgUrl);
    const link = document.createElement("a");
    link.download = `cova-risk-passport-${analysis.latestDate}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  image.src = svgUrl;
}

