import { toPng } from "html-to-image";
import { motion } from "motion/react";
import * as THREE from "three";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Copy,
  Download,
  Eye,
  EyeOff,
  Gauge,
  ListChecks,
  LockKeyhole,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { analyzePracticeReps, practiceSetupOptions, type PracticeRep } from "../lib/backtesting";
import { analyze, formatMoney, formatPercent, type RiskRule } from "../lib/risk";
import { GlassButton } from "./GlassButton";
import { ImageAtmosphere, SectionShell } from "./LayoutShell";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "practice" | "passport";
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
  const firstAction = primaryBreach
    ? primaryBreach.rule.metric === "maxContracts"
      ? "Cap size until the position-size warning clears."
      : primaryBreach.rule.metric === "maxDailyLoss"
        ? "Stop trading after the daily loss warning instead of trying to win it back."
        : primaryBreach.rule.metric === "maxLossStreak"
          ? "End the session after the loss-streak rule hits."
          : "Reduce risk until this rule prints clean again."
    : "Keep current size; do not scale until the next import confirms the pattern.";
  const setupAction = bestSetup
    ? `${bestSetup.name}: keep this as the A+ setup, but do not add size until rule warnings are clean.`
    : "Upload more rows before scaling size or changing the playbook.";
  const sessionAction = brief.status === "locked"
    ? "Do not trade live size until the flagged rule is addressed."
    : brief.status === "ready"
      ? "Trade normal size only if the setup matches the plan."
      : "Trade reduced size and wait for the cleanest setup only.";
  const insights = [
    {
      icon: CircleDot,
      title: "Pre-session risk brief",
      body: analysis.breaches.length ? `${analysis.breaches.length} limit warning${analysis.breaches.length === 1 ? " is" : "s are"} still active. Treat this as the rule to protect before the next trade.` : "No active limit warnings in the imported sample. Keep the same risk limits instead of forcing size.",
      action: firstAction,
      tone: analysis.breaches.length ? "WARN" : "GOOD",
      evidence: primaryBreach?.evidence.slice(0, 2) ?? [`${analysis.trades.length} trades checked`, `${formatPercent(analysis.compliance)} of limits followed`],
    },
    {
      icon: ShieldCheck,
      title: "Setup permission",
      body: bestSetup ? `${bestSetup.name} has the clearest sample right now: ${bestSetup.count} trades, ${bestSetup.avgR.toFixed(2)}R average result.` : "Cova needs more imported trades before it can name a clean setup with confidence.",
      action: setupAction,
      tone: bestSetup && bestSetup.avgR > 0 ? "GOOD" : "CAUTION",
      evidence: bestSetup ? [`${bestSetup.count} trades`, `${bestSetup.avgR.toFixed(2)}R average result`] : ["Upload more rows to learn which setups are working."],
    },
    {
      icon: briefIcon,
      title: brief.headline,
      body: brief.summary,
      action: sessionAction,
      tone: briefTone,
      evidence: brief.evidence.slice(0, 2),
    },
  ];
  const visibleInsights = insights.slice(0, entitlements.insightLimit);
  const lockedInsightCount = Math.max(0, insights.length - visibleInsights.length);
  return (
    <SectionShell
      eyebrow="Insights"
      title="Pre-session risk brief."
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
            <div className="mt-6 border-t border-white/10 pt-4">
              <p className="font-body text-[10px] uppercase tracking-[0.22em] text-[#18c887]">Action</p>
              <p className="mt-2 font-body text-sm font-medium leading-relaxed text-white/82">{insight.action}</p>
            </div>
            <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
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
            <h3 className="mt-5 font-heading text-4xl italic leading-[1] tracking-normal">Unlock deeper risk briefs.</h3>
            <p className="mt-5 font-body font-light leading-relaxed text-white/58">
              Pro keeps full insight history and shows every risk note Cova finds before the next session.
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

type PracticeDraft = {
  date: string;
  market: string;
  setup: string;
  session: string;
  direction: "Long" | "Short";
  plannedEntry: string;
  stop: string;
  target: string;
  resultR: string;
  rulesFollowed: "yes" | "no";
  mistake: string;
  screenshotUrl: string;
  notes: string;
};

const defaultPracticeDraft = (): PracticeDraft => ({
  date: new Date().toISOString().slice(0, 10),
  market: "NQ",
  setup: "ORH rejection",
  session: "New York AM",
  direction: "Short",
  plannedEntry: "",
  stop: "",
  target: "",
  resultR: "",
  rulesFollowed: "yes",
  mistake: "",
  screenshotUrl: "",
  notes: "",
});

export function PracticeLab({ practiceReps, setPracticeReps }: { practiceReps: PracticeRep[]; setPracticeReps: (next: PracticeRep[]) => void }) {
  const [draft, setDraft] = useState<PracticeDraft>(() => defaultPracticeDraft());
  const analysis = useMemo(() => analyzePracticeReps(practiceReps), [practiceReps]);
  const recentReps = useMemo(() => [...practiceReps].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6), [practiceReps]);
  const topSetups = analysis.bySetup.slice(0, 4);
  const readinessClass = analysis.readiness.tone === "ready"
    ? "text-emerald-300"
    : analysis.readiness.tone === "building"
      ? "text-amber-200"
      : analysis.readiness.tone === "empty"
        ? "text-white/42"
        : "text-red-300";

  function updateDraft<K extends keyof PracticeDraft>(key: K, value: PracticeDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function saveRep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rep: PracticeRep = {
      id: `practice-${Date.now()}`,
      date: draft.date,
      market: draft.market.trim() || "NQ",
      setup: draft.setup.trim() || "Untitled setup",
      session: draft.session.trim() || "New York AM",
      direction: draft.direction,
      plannedEntry: toNumber(draft.plannedEntry),
      stop: toNumber(draft.stop),
      target: toNumber(draft.target),
      resultR: toNumber(draft.resultR),
      rulesFollowed: draft.rulesFollowed === "yes",
      mistake: draft.mistake.trim(),
      screenshotUrl: draft.screenshotUrl.trim(),
      notes: draft.notes.trim(),
    };
    setPracticeReps([rep, ...practiceReps]);
    setDraft((current) => ({ ...current, resultR: "", mistake: "", screenshotUrl: "", notes: "" }));
  }

  function removeRep(id: string) {
    setPracticeReps(practiceReps.filter((rep) => rep.id !== id));
  }

  return (
    <SectionShell
      eyebrow="Backtesting Lab"
      title="Practice replay before live size."
      variant="workspace"
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" align="right" opacity="opacity-[0.16]" />}
    >
      <div className="practice-lab-grid grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <aside className="practice-command-panel p-6 md:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="terminal-tab-label inline-flex rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#b9f5df]">Practice replay</span>
            <span className="rounded-full border border-white/10 bg-black/28 px-3 py-1.5 font-body text-xs text-white/48">TradingView sidecar</span>
          </div>
          <Target className="mt-8 h-10 w-10 text-[#18c887]" />
          <h3 className="mt-6 font-body text-3xl font-semibold leading-[0.98] tracking-[-0.05em] md:text-4xl">Train the setup before it touches the account.</h3>
          <p className="mt-5 font-body text-sm leading-relaxed text-white/58">
            Use TradingView replay as the chart workstation, then log the rep here. Cova tracks whether the setup is actually practiced enough for live permission.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="practice-stat-row">
              <span>Total reps</span>
              <strong>{analysis.totalReps}</strong>
            </div>
            <div className="practice-stat-row">
              <span>Avg R</span>
              <strong>{analysis.avgR.toFixed(2)}R</strong>
            </div>
            <div className="practice-stat-row">
              <span>Rule follow</span>
              <strong>{formatPercent(analysis.ruleFollowRate)}</strong>
            </div>
            <div className="practice-stat-row">
              <span>Win rate</span>
              <strong>{formatPercent(analysis.winRate)}</strong>
            </div>
          </div>
        </aside>

        <div className="grid gap-6">
          <section className="practice-readiness-panel p-6 md:p-7">
            <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Live permission</p>
                <h3 className={`mt-3 font-body text-4xl font-semibold tracking-[-0.05em] ${readinessClass}`}>{analysis.readiness.label}</h3>
                <p className="mt-3 max-w-xl font-body text-sm leading-relaxed text-white/58">{analysis.readiness.summary}</p>
              </div>
              <div className="practice-brief-box">
                <p className="font-body text-[10px] uppercase tracking-[0.22em] text-white/38">Next drill</p>
                <p className="mt-2 font-body text-sm font-medium leading-relaxed text-white/82">{analysis.practiceBrief}</p>
              </div>
            </div>
          </section>

          <form className="practice-log-form p-6 md:p-7" onSubmit={saveRep}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Log practice rep</p>
                <h3 className="mt-2 font-body text-2xl font-semibold tracking-[-0.04em]">One replay rep. One decision.</h3>
              </div>
              <GlassButton strong type="submit"><Plus className="h-4 w-4" /> Save rep</GlassButton>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <label className="practice-field">
                <span>Date</span>
                <input type="date" value={draft.date} onChange={(event) => updateDraft("date", event.target.value)} />
              </label>
              <label className="practice-field">
                <span>Market</span>
                <input value={draft.market} onChange={(event) => updateDraft("market", event.target.value.toUpperCase())} placeholder="NQ" />
              </label>
              <label className="practice-field md:col-span-2">
                <span>Setup</span>
                <input list="practice-setup-options" value={draft.setup} onChange={(event) => updateDraft("setup", event.target.value)} placeholder="ORH rejection" />
                <datalist id="practice-setup-options">
                  {practiceSetupOptions.map((setup) => <option key={setup} value={setup} />)}
                </datalist>
              </label>
              <label className="practice-field md:col-span-2">
                <span>Session</span>
                <input value={draft.session} onChange={(event) => updateDraft("session", event.target.value)} placeholder="New York AM" />
              </label>
              <label className="practice-field">
                <span>Direction</span>
                <select value={draft.direction} onChange={(event) => updateDraft("direction", event.target.value as PracticeDraft["direction"])}>
                  <option>Long</option>
                  <option>Short</option>
                </select>
              </label>
              <label className="practice-field">
                <span>Result R</span>
                <input type="number" step="0.1" value={draft.resultR} onChange={(event) => updateDraft("resultR", event.target.value)} placeholder="1.2" />
              </label>
              <label className="practice-field">
                <span>Planned entry</span>
                <input type="number" step="0.25" value={draft.plannedEntry} onChange={(event) => updateDraft("plannedEntry", event.target.value)} placeholder="19000" />
              </label>
              <label className="practice-field">
                <span>Stop</span>
                <input type="number" step="0.25" value={draft.stop} onChange={(event) => updateDraft("stop", event.target.value)} placeholder="19030" />
              </label>
              <label className="practice-field">
                <span>Target</span>
                <input type="number" step="0.25" value={draft.target} onChange={(event) => updateDraft("target", event.target.value)} placeholder="18940" />
              </label>
              <label className="practice-field">
                <span>Rules followed?</span>
                <select value={draft.rulesFollowed} onChange={(event) => updateDraft("rulesFollowed", event.target.value as PracticeDraft["rulesFollowed"])}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className="practice-field md:col-span-2">
                <span>Mistake / leak</span>
                <input value={draft.mistake} onChange={(event) => updateDraft("mistake", event.target.value)} placeholder="Entered before rejection confirmed" />
              </label>
              <label className="practice-field md:col-span-2">
                <span>Screenshot or TradingView link</span>
                <input value={draft.screenshotUrl} onChange={(event) => updateDraft("screenshotUrl", event.target.value)} placeholder="https://..." />
              </label>
              <label className="practice-field md:col-span-4">
                <span>Notes</span>
                <textarea value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} placeholder="What did price do at the level? Did you wait for confirmation?" />
              </label>
            </div>
          </form>

          <div className="practice-review-grid grid gap-6 xl:grid-cols-[1fr_0.9fr]">
            <section className="practice-setups-panel p-6 md:p-7">
              <div className="flex items-center gap-3">
                <ListChecks className="h-5 w-5 text-[#18c887]" />
                <h3 className="font-body text-xl font-semibold tracking-[-0.03em]">Setup scorecard</h3>
              </div>
              <div className="mt-5 grid gap-3">
                {topSetups.map((setup) => (
                  <div className="practice-setup-row" key={setup.setup}>
                    <div>
                      <strong>{setup.setup}</strong>
                      <span>{setup.sampleSize} reps · {formatPercent(setup.ruleFollowRate)} rules followed</span>
                    </div>
                    <div className="text-right">
                      <strong>{setup.avgR.toFixed(2)}R</strong>
                      <span>{setup.leak}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="practice-recent-panel p-6 md:p-7">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-[#18c887]" />
                <h3 className="font-body text-xl font-semibold tracking-[-0.03em]">Recent reps</h3>
              </div>
              <div className="mt-5 grid gap-3">
                {recentReps.map((rep) => (
                  <div className="practice-rep-row" key={rep.id}>
                    <div>
                      <strong>{rep.setup}</strong>
                      <span>{rep.date} · {rep.market} · {rep.direction}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={rep.rulesFollowed ? "text-emerald-300" : "text-red-300"}>{rep.rulesFollowed ? <CheckCircle2 className="h-4 w-4" /> : "Flag"}</span>
                      <strong>{rep.resultR.toFixed(2)}R</strong>
                      <button aria-label={`Remove ${rep.setup} practice rep`} type="button" onClick={() => removeRep(rep.id)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
      badge: "D",
      rank: "Diamond",
      skin: "Elite control",
      headline: "Profit with restraint",
      summary: "Top rank: meaningful profit, strong expectancy, elite rule control, and no reckless leak pattern.",
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
      badge: "P",
      rank: "Platinum",
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
      badge: "G",
      rank: "Gold",
      skin: "Profitable control",
      headline: "Profitable, still tightening",
      summary: "Solid rank: real profit proof is forming, but breaches still cap the flex.",
      className: "passport-tier-b",
      cardClass: "passport-card-skin-b",
    };
  }
  if (profitable) {
    return {
      badge: "S",
      rank: "Silver",
      skin: "Green but unproven",
      headline: "Green P&L, risky control",
      summary: "The account is green, but rule proof, expectancy, or sample quality is not rank-up ready yet.",
      className: "passport-tier-v",
      cardClass: "passport-card-skin-v",
    };
  }
  if (inTheRed) {
    return {
      badge: "BL",
      rank: "Blown",
      skin: "Red account warning",
      headline: "Account is in the red",
      summary: "This Passport is not flex-ready. First job is stopping the leak and rebuilding control.",
      className: "passport-tier-blown",
      cardClass: "passport-card-skin-blown",
    };
  }
  if (tradeCount < 10) {
    return {
      badge: "UR",
      rank: "Unranked",
      skin: "Sample pending",
      headline: "Not enough proof yet",
      summary: "Not enough reviewed trades to assign a real rank. Build the sample before flexing the card.",
      className: "passport-tier-u",
      cardClass: "passport-card-skin-u",
    };
  }
  return {
    badge: "B",
    rank: "Bronze",
    skin: "Starting rank",
    headline: "Build the proof first",
    summary: "Enough trades to rank, but proof quality is still weak. Clean up breaches before the card becomes a flex.",
    className: "passport-tier-r",
    cardClass: "passport-card-skin-r",
  };
}

function getPassportTierPreviewOverride(): PassportTier | null {
  if (typeof window === "undefined") {
    return null;
  }
  const localPreviewHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (!localPreviewHost) {
    return null;
  }
  const previewTier = new URLSearchParams(window.location.search).get("passportPreviewTier")?.toLowerCase();
  if (previewTier !== "diamond") {
    return null;
  }
  return {
    badge: "D",
    rank: "Diamond",
    skin: "Elite control",
    headline: "Profit with restraint",
    summary: "Dev-only visual preview of the Diamond material system. Production rank still comes from trade proof.",
    className: "passport-tier-s",
    cardClass: "passport-card-skin-s",
  };
}

function getPassportMode(id: PassportShareModeId) {
  return passportShareModes.find((mode) => mode.id === id) ?? passportShareModes[0];
}

function createPassportDiamondGeometry() {
  const vertices: number[] = [];
  const indices: number[] = [];
  const ringCount = 8;
  const topY = 0.34;
  const girdleY = -0.02;
  const bottomY = -0.92;
  const topRadiusX = 0.62;
  const topRadiusZ = 0.25;
  const girdleRadiusX = 1.58;
  const girdleRadiusZ = 0.58;

  const pushVertex = (x: number, y: number, z: number) => {
    vertices.push(x, y, z);
    return vertices.length / 3 - 1;
  };

  const top: number[] = [];
  const girdle: number[] = [];
  for (let index = 0; index < ringCount; index += 1) {
    const angle = (index / ringCount) * Math.PI * 2 + Math.PI / 8;
    top.push(pushVertex(Math.cos(angle) * topRadiusX, topY, Math.sin(angle) * topRadiusZ));
    girdle.push(pushVertex(Math.cos(angle) * girdleRadiusX, girdleY, Math.sin(angle) * girdleRadiusZ));
  }
  const topCenter = pushVertex(0, topY + 0.055, 0);
  const bottom = pushVertex(0, bottomY, 0);

  for (let index = 0; index < ringCount; index += 1) {
    const next = (index + 1) % ringCount;
    indices.push(topCenter, top[next], top[index]);
    indices.push(top[index], top[next], girdle[next]);
    indices.push(top[index], girdle[next], girdle[index]);
    indices.push(bottom, girdle[index], girdle[next]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  const facetedGeometry = geometry.toNonIndexed();
  geometry.dispose();
  facetedGeometry.computeVertexNormals();
  return facetedGeometry;
}

function PassportDiamondThree({ active }: { active: boolean }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || typeof window === "undefined") {
      return undefined;
    }

    const mount = mountRef.current;
    if (!mount) {
      return undefined;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
      });
    } catch (error) {
      mount.classList.add("passport-three-webgl-failed");
      console.warn("Cova Passport 3D diamond disabled; WebGL renderer failed", error);
      return () => mount.classList.remove("passport-three-webgl-failed");
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1.92, 0.1, 20);
    camera.position.set(0, 0.04, 5.15);
    camera.lookAt(0, -0.06, 0);

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.domElement.className = "passport-three-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const diamondGeometry = createPassportDiamondGeometry();
    const diamondMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xbdefff,
      emissive: 0x061820,
      emissiveIntensity: 0.045,
      metalness: 0.02,
      roughness: 0.075,
      transmission: 0.32,
      thickness: 0.72,
      ior: 2.22,
      transparent: true,
      opacity: 0.72,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      specularIntensity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      flatShading: true,
    });
    const edgeGeometry = new THREE.EdgesGeometry(diamondGeometry, 13);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xebfdff,
      transparent: true,
      opacity: 0.62,
    });
    const haloGeometry = new THREE.RingGeometry(1.78, 1.795, 96);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0x7de7ff,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const group = new THREE.Group();
    const diamond = new THREE.Mesh(diamondGeometry, diamondMaterial);
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.position.set(0, -0.16, -0.28);
    halo.scale.set(1.02, 0.34, 1);
    group.add(halo, diamond, edges);
    group.scale.set(1.02, 1.02, 1.02);
    group.rotation.set(-0.18, 0.34, -0.025);
    scene.add(group);

    const ambient = new THREE.AmbientLight(0xcff7ff, 1.28);
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.75);
    keyLight.position.set(-2.2, 3.1, 3.8);
    const iceLight = new THREE.PointLight(0x72dcff, 5.4, 8.5);
    iceLight.position.set(2.1, 0.7, 2.6);
    const rimLight = new THREE.PointLight(0xffffff, 3.2, 7);
    rimLight.position.set(-1.8, -0.95, 2.2);
    scene.add(ambient, keyLight, iceLight, rimLight);

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(mount);
    window.addEventListener("resize", resize);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clock = new THREE.Clock();
    const render = () => {
      renderer.render(scene, camera);
    };
    const tick = () => {
      const elapsed = clock.getElapsedTime();
      group.rotation.y = 0.34 + Math.sin(elapsed * 0.52) * 0.16;
      group.rotation.x = -0.18 + Math.sin(elapsed * 0.38) * 0.04;
      group.rotation.z = -0.025 + Math.sin(elapsed * 0.45) * 0.018;
      iceLight.position.x = 2.1 + Math.sin(elapsed * 0.7) * 0.42;
      rimLight.intensity = 2.7 + Math.sin(elapsed * 0.8) * 0.5;
      render();
      frameRef.current = window.requestAnimationFrame(tick);
    };

    resize();
    render();
    mount.classList.add("passport-three-ready");
    if (!reducedMotion) {
      frameRef.current = window.requestAnimationFrame(tick);
    }

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      mount.classList.remove("passport-three-ready", "passport-three-webgl-failed");
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      haloGeometry.dispose();
      haloMaterial.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
      diamondGeometry.dispose();
      diamondMaterial.dispose();
      renderer.dispose();
    };
  }, [active]);

  if (!active) {
    return null;
  }

  return <div className="passport-three-diamond" ref={mountRef} />;
}

function getPrimaryLeak(analysis: ReturnType<typeof analyze>) {
  return analysis.behaviorFlags.find((flag) => flag.severity === "critical" || flag.severity === "warning")?.label
    ?? analysis.breaches[0]?.rule.name
    ?? "No major leak";
}

function getPassportProofLine(tier: PassportTier, analysis: ReturnType<typeof analyze>) {
  if (tier.rank === "Diamond") {
    return "Elite control · verified restraint";
  }
  if (tier.rank === "Platinum") {
    return "Funded-ready control";
  }
  if (tier.rank === "Gold") {
    return "Profitable control";
  }
  if (tier.rank === "Silver") {
    return "Green but inconsistent";
  }
  if (tier.rank === "Bronze") {
    return "Ranked / weak control";
  }
  if (tier.rank === "Unranked") {
    return `${Math.max(0, 10 - analysis.trades.length)} trades until rank unlock`;
  }
  return "Account red / rebuild control first";
}

function getPassportNextTarget(tier: PassportTier, analysis: ReturnType<typeof analyze>) {
  if (tier.rank === "Diamond") {
    return "Top rank · profit made clean · rules held under pressure";
  }
  if (tier.rank === "Platinum") {
    return "To Diamond: 90 score · 90% rules held · zero-breach week";
  }
  if (tier.rank === "Gold") {
    return "To Platinum: 20 trades · 80% rules held · 1.25 PF";
  }
  if (tier.rank === "Silver") {
    return "To Gold: 68 score · 70% rules held · 1.25 PF";
  }
  if (tier.rank === "Bronze") {
    return "To Silver: 60% rules held · PF 1.10 · fewer breaches";
  }
  if (tier.rank === "Unranked") {
    return `Next: ${Math.max(0, 10 - analysis.trades.length)} more reviewed trades to unlock rank`;
  }
  return "Next: 5 clean trades · no daily-loss breaches";
}

function getPassportStats(analysis: ReturnType<typeof analyze>, mode: PassportShareModeId): PassportStat[] {
    if (mode === "discipline") {
      return [
        { label: "Cova score", value: `${analysis.score}`, tone: "positive" },
        { label: "Rules held", value: formatPercent(analysis.compliance), tone: analysis.compliance >= 0.75 ? "positive" : "negative" },
        { label: "Average R", value: `${analysis.avgR.toFixed(2)}R`, tone: analysis.avgR >= 0 ? "positive" : "negative" },
        { label: "Max DD", value: formatMoney(Math.round(analysis.maxDrawdown)), tone: analysis.maxDrawdown > 0 ? "neutral" : "positive" },
        { label: "Verified trades", value: `${analysis.trades.length}`, tone: "neutral" },
        { label: "Breaches", value: `${analysis.breaches.length}`, tone: analysis.breaches.length ? "negative" : "positive" },
      ];
    }
    if (mode === "private") {
      return [
        { label: "Score range", value: analysis.score ? `${Math.floor(analysis.score / 10) * 10}+` : "Hidden", tone: "positive" },
        { label: "Rules held", value: formatPercent(analysis.compliance), tone: analysis.compliance >= 0.75 ? "positive" : "negative" },
        { label: "Sample", value: analysis.evidenceQuality.label, tone: "neutral" },
        { label: "Generated", value: analysis.latestDate, tone: "neutral" },
        { label: "Verified trades", value: `${analysis.trades.length}`, tone: "neutral" },
        { label: "Visibility", value: "Masked", tone: "neutral" },
      ];
    }
    if (mode === "coach") {
      return [
        { label: "Cova score", value: `${analysis.score}`, tone: "neutral" },
        { label: "Flags", value: `${analysis.breaches.length}`, tone: analysis.breaches.length ? "negative" : "positive" },
        { label: "Top leak", value: getPrimaryLeak(analysis), tone: analysis.breaches.length ? "negative" : "positive" },
        { label: "Next", value: analysis.nextSessionBrief.status.toUpperCase(), tone: analysis.nextSessionBrief.status === "ready" ? "positive" : "negative" },
        { label: "Profit factor", value: analysis.profitFactor.toFixed(2), tone: analysis.profitFactor >= 1 ? "positive" : "negative" },
        { label: "Average R", value: `${analysis.avgR.toFixed(2)}R`, tone: analysis.avgR >= 0 ? "positive" : "negative" },
      ];
    }
    return [
      { label: "Net P&L", value: formatMoney(analysis.totalPnl), tone: analysis.totalPnl >= 0 ? "positive" : "negative" },
      { label: "Cova score", value: `${analysis.score}`, tone: "positive" },
      { label: "Rules held", value: formatPercent(analysis.compliance), tone: analysis.compliance >= 0.75 ? "positive" : "negative" },
      { label: "Verified trades", value: `${analysis.trades.length}`, tone: "neutral" },
      { label: "Profit factor", value: analysis.profitFactor.toFixed(2), tone: analysis.profitFactor >= 1 ? "positive" : "negative" },
      { label: "Breaches", value: `${analysis.breaches.length}`, tone: analysis.breaches.length ? "negative" : "positive" },
    ];
    }

function getPassportDiamondPreviewStats(mode: PassportShareModeId): PassportStat[] {
  if (mode === "discipline") {
    return [
      { label: "Cova score", value: "94", tone: "positive" },
      { label: "Rules held", value: "93%", tone: "positive" },
      { label: "Average R", value: "0.42R", tone: "positive" },
      { label: "Max DD", value: "$620", tone: "positive" },
      { label: "Verified trades", value: "72", tone: "neutral" },
      { label: "Breaches", value: "0", tone: "positive" },
    ];
  }
  if (mode === "private") {
    return [
      { label: "Score range", value: "90+", tone: "positive" },
      { label: "Rules held", value: "93%", tone: "positive" },
      { label: "Sample", value: "Elite", tone: "neutral" },
      { label: "Generated", value: "Verified", tone: "neutral" },
      { label: "Verified trades", value: "72", tone: "neutral" },
      { label: "Visibility", value: "Masked", tone: "neutral" },
    ];
  }
  if (mode === "coach") {
    return [
      { label: "Cova score", value: "94", tone: "positive" },
      { label: "Flags", value: "0", tone: "positive" },
      { label: "Top leak", value: "No major leak", tone: "positive" },
      { label: "Next", value: "READY", tone: "positive" },
      { label: "Profit factor", value: "1.86", tone: "positive" },
      { label: "Average R", value: "0.42R", tone: "positive" },
    ];
  }
  return [
    { label: "Net P&L", value: "$18,760", tone: "positive" },
    { label: "Cova score", value: "94", tone: "positive" },
    { label: "Rules held", value: "93%", tone: "positive" },
    { label: "Verified trades", value: "72", tone: "neutral" },
    { label: "Profit factor", value: "1.86", tone: "positive" },
    { label: "Breaches", value: "0", tone: "positive" },
  ];
}

export function Passport({ analysis, entitlements, sharePassport, go, upgradeToPro }: { analysis: ReturnType<typeof analyze>; entitlements: WorkspaceEntitlements; sharePassport: () => void; go: (section: Section) => void; upgradeToPro: () => void }) {
  const [copied, setCopied] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [expiry, setExpiry] = useState("7 days");
  const [shareModeId, setShareModeId] = useState<PassportShareModeId>("flex");
  const cardRef = useRef<HTMLDivElement | null>(null);
  const faceRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const previewTier = getPassportTierPreviewOverride();
  const tier = previewTier ?? getPassportTier(analysis);
  const previewingDiamond = previewTier?.rank === "Diamond";
  const shareMode = getPassportMode(shareModeId);
  const cardStats = previewingDiamond ? getPassportDiamondPreviewStats(shareModeId) : getPassportStats(analysis, shareModeId);
  const proofLine = getPassportProofLine(tier, analysis);
  const nextTarget = getPassportNextTarget(tier, analysis);
  const verifiedRules = analysis.ruleStatuses.length - analysis.breaches.length;
  const displayScore = previewingDiamond ? 94 : analysis.score;
  const displayVerifiedRules = previewingDiamond ? 6 : verifiedRules;
  const displayRuleCount = previewingDiamond ? 6 : analysis.ruleStatuses.length;
  const verificationId = `COVA-${analysis.latestDate.replace(/-/g, "").slice(2)}-${displayScore}${displayVerifiedRules}`;
  const privacyRows = [
    { label: "Net P&L", visible: shareMode.reveals.includes("Net P&L") },
    { label: "Broker", visible: false },
    { label: "Notes", visible: false },
    { label: "Rule proof", visible: true },
    { label: "Trade history", visible: false },
    { label: "Open positions", visible: false },
  ];
  const statByLabel = (label: string) => cardStats.find((stat) => stat.label === label);
  const netPnlStat = statByLabel("Net P&L") ?? cardStats[0];
  const covaScoreStat = statByLabel("Cova score") ?? { label: "Cova score", value: `${displayScore}`, tone: "positive" as const };
  const rulesHeldStat = statByLabel("Rules held") ?? statByLabel("Score range");
  const verifiedTradesStat = statByLabel("Verified trades") ?? statByLabel("Sample");
  const profitFactorStat = statByLabel("Profit factor") ?? statByLabel("Average R");
  const breachesStat = statByLabel("Breaches") ?? statByLabel("Flags") ?? statByLabel("Visibility");
  const blackCardStats = [rulesHeldStat, verifiedTradesStat, profitFactorStat, breachesStat].filter(Boolean) as PassportStat[];
  const ledgerHasFlags = analysis.breaches.length > 0;
  const ledgerStatusCopy = ledgerHasFlags ? "Proof checked · flags found" : "All systems verified";
  const ledgerStatusClass = ledgerHasFlags ? "has-flags" : "is-verified";

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
            <button className="passport-action-button" onClick={entitlements.canExportPassport ? () => void downloadPassportPng(analysis, visibility, expiry, tier, shareMode, faceRef.current) : upgradeToPro} type="button">
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
                  <div className={`passport-card-face passport-credential-card ${tier.cardClass}`} data-passport-tier={tier.rank.toLowerCase()} ref={faceRef}>
                    <div className="passport-card-noise" />
                    <div className="passport-card-shine" />
                    <div className="passport-card-grid" />
                    <div className="passport-security-lines" />
                    <div className="passport-angular-frame" />
                    <div className="passport-credential-inner passport-blackcard-inner">
                      <div className="passport-blackcard-issuer">
                        <div>
                          <span>COVA</span>
                          <strong>Risk Passport</strong>
                        </div>
                        <em>{visibility === "private" ? "Private Link" : "Public Card"}</em>
                      </div>

                      <div className="passport-blackcard-hero">
                        <div className="passport-blackcard-rank">
                          <span>{tier.skin}</span>
                          <h3>{tier.rank}</h3>
                          <p>{tier.headline}</p>
                        </div>
                        <div className="passport-blackcard-chip" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>

                      <div className="passport-blackcard-value-row">
                        <div className={`passport-blackcard-value passport-stat-${netPnlStat.tone ?? "neutral"}`}>
                          <span>{netPnlStat.label}</span>
                          <strong>{netPnlStat.value}</strong>
                          <small>{shareMode.label} mode · verified review</small>
                        </div>
                        <div className={`passport-blackcard-score passport-stat-${covaScoreStat.tone ?? "neutral"}`}>
                          <span>Cova Score</span>
                          <strong>{displayScore}</strong>
                          <em>{displayVerifiedRules}/{displayRuleCount} rules held</em>
                        </div>
                      </div>

                      <div className="passport-blackcard-stat-grid">
                        {blackCardStats.map((stat) => (
                          <div className={`passport-blackcard-stat passport-stat-${stat.tone ?? "neutral"}`} key={stat.label}>
                            <span>{stat.label}</span>
                            <strong>{stat.value}</strong>
                          </div>
                        ))}
                      </div>

                      <div className="passport-blackcard-proof-band">
                        <div>
                          <span>Proof status</span>
                          <strong>{proofLine}</strong>
                        </div>
                        <em>{shareMode.cardSubtitle}</em>
                      </div>

                      <div className="passport-blackcard-footer">
                        <div>
                          <span>Verified ID</span>
                          <code>{verificationId}</code>
                        </div>
                        <p>{nextTarget}</p>
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
            <strong className={ledgerStatusClass}><BadgeCheck className="h-4 w-4" /> {ledgerStatusCopy}</strong>
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

function getPassportExportPalette(tier: PassportTier) {
  if (tier.rank === "Diamond") return { accent: "#9cecff", metal: "#f6fdff", soft: "#55cfff" };
  if (tier.rank === "Platinum") return { accent: "#dfe8f5", metal: "#f6fbff", soft: "#aab8c8" };
  if (tier.rank === "Gold") return { accent: "#d9b76e", metal: "#fff1c9", soft: "#f5c866" };
  if (tier.rank === "Silver") return { accent: "#bfc8d4", metal: "#e5ecf4", soft: "#8d9baa" };
  if (tier.rank === "Bronze") return { accent: "#b9824a", metal: "#f0c28a", soft: "#d38a48" };
  if (tier.rank === "Blown") return { accent: "#ff4d5f", metal: "#ffd2d7", soft: "#ff7180" };
  return { accent: "#8e99a8", metal: "#cbd3de", soft: "#9aa5b3" };
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

async function downloadPassportPng(analysis: ReturnType<typeof analyze>, visibility: string, expiry: string, tier: PassportTier, shareMode: PassportShareMode, cardNode?: HTMLElement | null) {
  const filename = `cova-risk-passport-${tier.rank.toLowerCase()}-${analysis.latestDate}.png`;
  if (cardNode) {
    try {
      const dataUrl = await toPng(cardNode, {
        backgroundColor: "#020304",
        cacheBust: true,
        pixelRatio: 2.4,
        style: {
          transform: "none",
          transformOrigin: "top left",
        },
      });
      downloadDataUrl(dataUrl, filename);
      return;
    } catch (error) {
      console.warn("Falling back to SVG Passport export", error);
    }
  }
  const palette = getPassportExportPalette(tier);
  const isDiamondExport = tier.rank === "Diamond";
  const exportRankSize = isDiamondExport ? 116 : 134;
  const exportRankTracking = isDiamondExport ? 2 : 6;
  const stats = getPassportStats(analysis, shareMode.id).slice(0, 6);
  const proofLine = getPassportProofLine(tier, analysis).toUpperCase();
  const nextTarget = getPassportNextTarget(tier, analysis).toUpperCase();
  const proofFontSize = isDiamondExport ? 22 : 28;
  const proofTracking = isDiamondExport ? 5 : 7;
  const nextTargetMarkup = isDiamondExport
    ? `<text x="92" y="1360" fill="${palette.accent}" font-family="Arial, sans-serif" font-size="20" font-weight="800" letter-spacing="4">TOP RANK · PROFIT MADE CLEAN</text>
      <text x="92" y="1392" fill="${palette.accent}" font-family="Arial, sans-serif" font-size="20" font-weight="800" letter-spacing="4">RULES HELD UNDER PRESSURE</text>`
    : `<text x="92" y="1372" fill="${palette.accent}" font-family="Arial, sans-serif" font-size="23" font-weight="800" letter-spacing="4">${escapeSvgText(nextTarget)}</text>`;
  const exportSkin = tier.skin.toUpperCase();
  const exportHeadline = tier.headline.toUpperCase();
  const verifiedRules = analysis.ruleStatuses.length - analysis.breaches.length;
  const verificationId = `COVA-${analysis.latestDate.replace(/-/g, "").slice(2)}-${analysis.score}${verifiedRules}`;
  const diamondExportFx = isDiamondExport ? `
      <path d="M82 86 H998 L1026 114 V1386 L998 1414 H82 L54 1386 V114 Z" fill="none" stroke="${palette.accent}" stroke-opacity="0.36" stroke-width="1"/>
      <path d="M132 420 L948 420 L976 536 L948 652 L132 652 L104 536 Z" fill="rgba(156,236,255,0.035)" stroke="rgba(210,248,255,0.16)"/>
      <path d="M180 536 H900 M540 420 V652 M292 420 L540 652 M788 420 L540 652" stroke="rgba(210,248,255,0.12)" stroke-width="1"/>
      <circle cx="540" cy="536" r="268" fill="none" stroke="rgba(156,236,255,0.13)" stroke-width="1"/>
      <circle cx="540" cy="536" r="186" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    ` : "";
  const statCells = stats.map((stat, index) => {
    const x = index % 2 === 0 ? 92 : 548;
    const y = 762 + Math.floor(index / 2) * 142;
    const valueColor = stat.tone === "negative" ? "#ff6f7d" : stat.tone === "positive" ? "#74f2c2" : palette.metal;
    return `
      <rect x="${x}" y="${y}" width="430" height="130" fill="rgba(0,0,0,0.28)" stroke="rgba(255,255,255,0.16)" stroke-width="1"/>
      <text x="${x + 28}" y="${y + 43}" fill="rgba(224,236,248,0.62)" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">◆ ${escapeSvgText(stat.label.toUpperCase())}</text>
      <text x="${x + 28}" y="${y + 101}" fill="${valueColor}" font-family="Arial Black, Arial, sans-serif" font-size="48" letter-spacing="-2">${escapeSvgText(stat.value)}</text>
    `;
  }).join("");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1500" viewBox="0 0 1080 1500">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#07090b"/>
          <stop offset="0.52" stop-color="#030506"/>
          <stop offset="1" stop-color="#111820"/>
        </linearGradient>
        <linearGradient id="facet" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#ffffff"/>
          <stop offset="0.22" stop-color="#e8fbff"/>
          <stop offset="0.42" stop-color="${palette.accent}"/>
          <stop offset="0.7" stop-color="#0b1b27"/>
          <stop offset="1" stop-color="${palette.metal}"/>
        </linearGradient>
        <radialGradient id="ice" cx="50%" cy="34%" r="64%">
          <stop stop-color="${palette.accent}" stop-opacity="0.24"/>
          <stop offset="0.42" stop-color="${palette.soft}" stop-opacity="0.09"/>
          <stop offset="1" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
        <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="14" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect width="1080" height="1500" rx="54" fill="url(#bg)"/>
      <rect width="1080" height="1500" rx="54" fill="url(#ice)"/>
      <rect x="38" y="38" width="1004" height="1424" rx="44" fill="rgba(255,255,255,0.025)" stroke="${palette.accent}" stroke-opacity="${isDiamondExport ? "0.78" : "0.62"}" stroke-width="2"/>
      <path d="M88 62 H992 L1018 88 V1412 L992 1438 H88 L62 1412 V88 Z" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
      ${diamondExportFx}
      <text x="126" y="142" fill="${palette.metal}" font-family="Arial, sans-serif" font-size="36" font-weight="700" letter-spacing="13">COVA RISK PASSPORT</text>
      <text x="82" y="304" fill="${palette.metal}" font-family="Arial Black, Arial, sans-serif" font-size="${exportRankSize}" letter-spacing="${exportRankTracking}">${escapeSvgText(tier.rank.toUpperCase())}</text>
      <text x="92" y="352" fill="${palette.accent}" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="6">${escapeSvgText(exportSkin)}</text>
      <text x="92" y="384" fill="${palette.accent}" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="5" opacity="0.88">${escapeSvgText(exportHeadline)}</text>
      <rect x="820" y="132" width="144" height="144" rx="10" fill="rgba(0,0,0,0.28)" stroke="${palette.accent}" stroke-opacity="0.7"/>
      <text x="892" y="188" fill="rgba(224,236,248,0.62)" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="4">RANK</text>
      <text x="892" y="248" fill="${palette.metal}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="62">${escapeSvgText(tier.badge)}</text>
      <path d="M98 464 L386 464 L322 674 L98 674 Z" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.2)"/>
      <path d="M694 464 L982 464 L982 674 L758 674 Z" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.2)"/>
      <path d="M540 420 L760 536 L540 740 L320 536 Z" fill="url(#facet)" stroke="rgba(255,255,255,0.72)" stroke-width="${isDiamondExport ? "3" : "2"}" filter="url(#glow)"/>
      <path d="M540 420 L540 740 M320 536 H760 M430 478 L540 740 M650 478 L540 740" stroke="rgba(255,255,255,0.34)" stroke-width="2"/>
      ${isDiamondExport ? `<path d="M458 496 L622 576 M622 496 L458 576" stroke="rgba(255,255,255,0.42)" stroke-width="3"/>` : ""}
      ${statCells}
      <rect x="92" y="1202" width="896" height="112" rx="12" fill="rgba(0,0,0,0.32)" stroke="${palette.accent}" stroke-opacity="0.45"/>
      <path d="M138 1258 L178 1236 L218 1258 L178 1290 Z" fill="url(#facet)" stroke="rgba(255,255,255,0.45)"/>
      <text x="252" y="1272" fill="${palette.metal}" font-family="Arial, sans-serif" font-size="${proofFontSize}" font-weight="800" letter-spacing="${proofTracking}">${escapeSvgText(proofLine)}</text>
      ${nextTargetMarkup}
      <text x="92" y="1430" fill="rgba(224,236,248,0.5)" font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="3">MODE ${escapeSvgText(shareMode.label.toUpperCase())} · ${escapeSvgText(visibility.toUpperCase())} · ${escapeSvgText(expiry.toUpperCase())} · ${escapeSvgText(verificationId)}</text>
    </svg>
  `;
  const image = new Image();
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1500;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(svgUrl);
      return;
    }
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(svgUrl);
    downloadDataUrl(canvas.toDataURL("image/png"), filename);
  };
  image.src = svgUrl;
}

