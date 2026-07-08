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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { analyze, formatMoney, formatPercent, type RiskRule } from "../lib/risk";
import { GlassButton } from "./GlassButton";
import { ImageAtmosphere, SectionShell } from "./LayoutShell";
import { ScoreCard } from "./DashboardCards";

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

export function Passport({ analysis, entitlements, sharePassport, go, upgradeToPro }: { analysis: ReturnType<typeof analyze>; entitlements: WorkspaceEntitlements; sharePassport: () => void; go: (section: Section) => void; upgradeToPro: () => void }) {
  const [copied, setCopied] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [expiry, setExpiry] = useState("7 days");
  const cardRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

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
    const rotateY = (x - 0.5) * 10;
    const rotateX = (0.5 - y) * 7;
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
      card.style.setProperty("--passport-lift", "-6px");
      if (shadow) {
        shadow.style.setProperty("--passport-shadow-x", `${((x - 0.5) * -14).toFixed(1)}px`);
        shadow.style.setProperty("--passport-shadow-y", `${(5 + Math.abs(y - 0.5) * 9).toFixed(1)}px`);
        shadow.style.setProperty("--passport-shadow-scale", `${(1.02 + Math.abs(x - 0.5) * 0.045).toFixed(3)}`);
        shadow.style.setProperty("--passport-shadow-opacity", "0.82");
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
      shadow.style.setProperty("--passport-shadow-opacity", "0.72");
    }
  }

  return (
    <SectionShell
      eyebrow="Risk Passport"
      title="Share a Risk Passport."
      variant="workspace"
      backdrop={<ImageAtmosphere src="/media/cova-passport-product.jpg" align="right" opacity="opacity-[0.35]" />}
    >
      <div className="passport-intro-strip mb-7 grid gap-4 p-5 md:grid-cols-[0.8fr_1.2fr] md:items-center">
        <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">{entitlements.plan === "free" ? "Free preview" : "What is this?"}</p>
        <p className="font-body text-sm font-light leading-relaxed text-white/62">
          A Risk Passport is a shareable summary of your discipline, limits, and trade behavior.
          It helps someone see how you manage risk without turning Cova into a signal report.
          {entitlements.plan === "free" ? " Free accounts can preview one Passport; Pro unlocks export and full sharing controls." : ""}
        </p>
      </div>
      <div className="grid gap-7 lg:grid-cols-[0.75fr_1.1fr_0.75fr]">
        <div className="space-y-5">
          <ScoreCard analysis={analysis} />
          <div className="passport-proof-panel p-7">
            <p className="font-body text-xs uppercase tracking-[0.22em] text-white/40">Limits followed</p>
            <p className="mt-3 font-body text-5xl text-emerald-400">{analysis.ruleStatuses.length - analysis.breaches.length}/{analysis.ruleStatuses.length}</p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${analysis.compliance * 100}%` }} />
            </div>
            <p className="mt-4 font-body text-sm text-white/50">{formatPercent(analysis.compliance)} compliance</p>
          </div>
        </div>

        <motion.div
          className="passport-stage relative"
          initial={{ opacity: 0, scale: 0.96, y: 26 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="passport-card-scene">
            <div className="passport-ground" ref={shadowRef} />
            <div
              className="passport-card-hitbox"
              onPointerMove={movePassportCard}
              onPointerLeave={resetPassportCard}
            >
              <div className="passport-card-3d" ref={cardRef}>
                <div className="passport-card-depth" />
                <div className="passport-card-face">
                  <div className="passport-card-noise" />
                  <div className="passport-card-shine" />
                  <div className="passport-card-grid" />
                  <div className="relative z-10 flex h-full flex-col">
                    <div className="flex items-start justify-between gap-8">
                      <div>
                        <p className="font-heading text-4xl italic tracking-normal text-white/76">COVA</p>
                        <h3 className="mt-5 font-mono text-2xl uppercase tracking-[0.14em] text-white/86 md:text-4xl md:tracking-[0.2em]">Risk Passport</h3>
                        <p className="mt-3 font-mono text-xs uppercase tracking-[0.22em] text-white/44 md:text-sm">Shareable risk summary</p>
                      </div>
                      <div className="passport-chip" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>

                    <div className="mt-6 h-px bg-white/14" />

                    <div className="mt-auto grid grid-cols-2 gap-x-5 gap-y-3 pt-5 md:grid-cols-4">
                      {[
                        ["Passport ID", "7CVA-2505-741"],
                        ["Generated", analysis.latestDate],
                        ["Risk score", `${analysis.score}/100`],
                        ["Limits followed", formatPercent(analysis.compliance)],
                      ].map(([label, value]) => (
                        <div className="border-t border-white/10 pt-3 font-mono" key={label}>
                          <span className="block text-[0.62rem] uppercase tracking-[0.16em] text-white/34 md:text-[0.68rem]">{label}</span>
                          <span className="mt-1 block text-xs text-white/86 md:text-sm">{value}</span>
                        </div>
                      ))}
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="passport-share-console mt-8 grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
            <button
              className="flex items-center gap-3 rounded-full text-left font-body text-sm text-white"
              onClick={() => setVisibility(visibility === "private" ? "public" : "private")}
              type="button"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-[#18c887]">
                {visibility === "private" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </span>
              <span>
                <span className="block text-white/80">{visibility === "private" ? "Private draft" : "Public share link"}</span>
                <span className="block text-xs text-white/42">Toggle share visibility</span>
              </span>
            </button>
            <label className="font-body text-xs uppercase tracking-[0.18em] text-white/38">
              Expiry
              <select
                className="mt-2 block rounded-full border border-white/10 bg-black/50 px-4 py-2 font-body text-sm normal-case tracking-normal text-white outline-none"
                value={expiry}
                onChange={(event) => setExpiry(event.target.value)}
              >
                <option>24 hours</option>
                <option>7 days</option>
                <option>30 days</option>
                <option>No expiry</option>
              </select>
            </label>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <GlassButton strong onClick={copyPassport}>{copied ? "Copied" : "Copy Link"} <Copy className="h-4 w-4" /></GlassButton>
            <GlassButton onClick={entitlements.canExportPassport ? () => downloadPassportPng(analysis, visibility, expiry) : upgradeToPro}>
              {entitlements.canExportPassport ? "Export PNG" : "Unlock Export"} <Download className="h-4 w-4" />
            </GlassButton>
            <GlassButton onClick={() => go("dashboard")}>Back to Review</GlassButton>
          </div>
        </motion.div>

        <div className="grid gap-5">
          {analysis.ruleStatuses.slice(0, 3).map((status) => (
            <div className="passport-rule-proof p-6" key={status.rule.id}>
              <BadgeCheck className={`h-9 w-9 ${status.breached ? "text-red-400" : "text-emerald-400"}`} />
              <h3 className="mt-5 font-body text-xl font-medium">{status.rule.name}</h3>
              <p className="mt-2 font-body text-sm font-light leading-relaxed text-white/56">{status.summary}</p>
            </div>
          ))}
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

function downloadPassportPng(analysis: ReturnType<typeof analyze>, visibility: string, expiry: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#020306"/>
          <stop offset="1" stop-color="#071225"/>
        </linearGradient>
        <linearGradient id="line" x1="0" x2="1">
          <stop stop-color="#b9f5df"/>
          <stop offset="1" stop-color="#18c887"/>
        </linearGradient>
      </defs>
      <rect width="1400" height="900" rx="54" fill="url(#bg)"/>
      <rect x="58" y="58" width="1284" height="784" rx="42" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.24)" stroke-width="2"/>
      <text x="104" y="150" fill="#f8fbff" font-family="Georgia,serif" font-size="68" font-style="italic">Cova</text>
      <text x="104" y="252" fill="#f8fbff" font-family="Courier New,monospace" font-size="72" letter-spacing="14">RISK PASSPORT</text>
      <text x="104" y="312" fill="#8fb7a6" font-family="Courier New,monospace" font-size="24" letter-spacing="8">VERIFIED RISK CREDENTIAL</text>
      <rect x="104" y="390" width="1192" height="2" fill="rgba(255,255,255,0.16)"/>
      <text x="104" y="500" fill="#18c887" font-family="Courier New,monospace" font-size="124">${analysis.score}</text>
      <text x="292" y="500" fill="#a6b8b0" font-family="Courier New,monospace" font-size="44">/100 COVA SCORE</text>
      <text x="104" y="600" fill="#36e2a0" font-family="Courier New,monospace" font-size="54">${formatPercent(analysis.compliance)} COMPLIANCE</text>
      <text x="104" y="680" fill="#f8fbff" font-family="Courier New,monospace" font-size="32">Trades: ${analysis.trades.length} · Generated: ${analysis.latestDate}</text>
      <text x="104" y="740" fill="#a6b8b0" font-family="Courier New,monospace" font-size="26">Visibility: ${visibility.toUpperCase()} · Expiry: ${expiry.toUpperCase()}</text>
      <path d="M850 630 C920 560 960 690 1020 620 S1130 540 1230 590" fill="none" stroke="url(#line)" stroke-width="8"/>
      <rect x="1082" y="128" width="156" height="156" rx="28" fill="rgba(24,200,135,0.08)" stroke="rgba(24,200,135,0.5)"/>
      <text x="1118" y="216" fill="#f8fbff" font-family="Courier New,monospace" font-size="24">COVA</text>
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

