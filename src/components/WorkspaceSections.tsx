import { toPng } from "html-to-image";
import { motion } from "motion/react";
import * as THREE from "three";
import {
  ArrowLeft,
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
import { createPortal } from "react-dom";
import {
  analyzePracticeReps,
  buildReplayTape,
  calculatePracticeAccountStats,
  createDefaultPracticeAccount,
  createPracticeTrade,
  evaluatePracticeAccountLimits,
  getOpeningRangeEndIndex,
  hasPracticeAccountConfigurationChanged,
  PRACTICE_ACCOUNT_STORAGE_KEY,
  PRACTICE_TRADES_STORAGE_KEY,
  practiceSetupOptions,
  type PracticeAccount,
  type PracticeDirection,
  type PracticeMarket,
  type PracticePosition,
  type PracticeRep,
  type PracticeTrade,
} from "../lib/backtesting";
import { removeScopedStorage, scopedStorageKey } from "../lib/storageScope";
import { analyze, formatMoney, formatPercent, type RiskRule } from "../lib/risk";
import { LightweightReplayChart } from "./practice/LightweightReplayChart";
import { BacktestingTerminal } from "./practice/BacktestingTerminal";
import { GlassButton } from "./GlassButton";
import { ImageAtmosphere, SectionShell } from "./LayoutShell";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "practice" | "passport";
type WorkspaceEntitlements = {
  canEditAdvancedLimits: boolean;
  canExportPassport: boolean;
  insightLimit: number;
  plan: "free" | "pro";
};

type ReplayRuntime = {
  tapeId: string;
  playIndex: number;
  playing: boolean;
  position: PracticePosition | null;
};

export function RulesEngine({ analysis, entitlements, rules, setRules, go, upgradeToPro }: { analysis: ReturnType<typeof analyze>; entitlements: WorkspaceEntitlements; rules: RiskRule[]; setRules: (rules: RiskRule[]) => void; go: (section: Section) => void; upgradeToPro: () => void }) {
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
          <h3 className="mt-7 font-body text-3xl font-semibold leading-[0.98] tracking-[-0.05em] md:text-4xl">Review the limits behind the warnings.</h3>
          <p className="mt-5 font-body font-light leading-relaxed text-white/60">
            Set review thresholds for imported history. Cova flags trades that cross them; it never blocks orders or changes broker settings.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="rules-ledger-stat p-5">
              <p className="font-body text-xs uppercase tracking-[0.22em] text-white/40">Breaches in history</p>
              <p className="mt-2 font-body text-4xl text-red-400">{analysis.breaches.length}</p>
            </div>
            <div className="rules-ledger-stat p-5">
              <p className="font-body text-xs uppercase tracking-[0.22em] text-white/40">Rules followed</p>
              <p className="mt-2 font-body text-4xl text-emerald-400">{formatPercent(analysis.compliance)}</p>
            </div>
          </div>
          <div className={`mt-4 border p-4 ${analysis.breaches.length ? "border-red-400/20 bg-red-400/[0.045]" : "border-emerald-300/16 bg-emerald-300/[0.035]"}`}>
            <p className={`font-body text-sm font-semibold ${analysis.breaches.length ? "text-red-200" : "text-emerald-200"}`}>
              {analysis.breaches.length ? `${analysis.breaches.length} warning${analysis.breaches.length === 1 ? " needs" : "s need"} a decision.` : "The imported history is inside your active limits."}
            </p>
            <p className="mt-2 font-body text-xs leading-relaxed text-white/48">Changing a threshold can change which warnings appear. It re-checks the same imported history; it does not rewrite a trade.</p>
            {analysis.breaches.length > 0 && (
              <button className="mt-4 inline-flex items-center gap-2 font-body text-sm font-medium text-[#b9f5df]" onClick={() => go("coach")} type="button">
                Review warnings <ArrowUpRight className="h-4 w-4" />
              </button>
            )}
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
            const ruleState = !rule.enabled ? "off" : status?.breached ? "breach" : "inside";
            const ruleStateLabel = ruleState === "off" ? "Not checked" : ruleState === "breach" ? "Breach in history" : "Inside limit";
            const ruleStateClass = ruleState === "off" ? "bg-white/7 text-white/45" : ruleState === "breach" ? "bg-red-500/15 text-red-300" : "bg-emerald-400/15 text-emerald-300";
            return (
              <motion.article
                key={rule.id}
                className="rule-control-card rules-ledger-row p-4 md:p-5"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.045, duration: 0.55 }}
              >
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">{friendlyRuleMetric(rule.metric)}</p>
                    <h3 className="mt-2 font-body text-xl font-medium">{rule.name}</h3>
                    <p className="mt-1 font-body text-sm font-light text-white/50">{rule.enabled ? status?.summary : "Disabled — excluded from the current review."}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {locked && (
                      <button className="border border-[#18c887]/24 bg-[#18c887]/10 px-3 py-1 font-body text-xs text-[#b9f5df]" onClick={upgradeToPro} type="button">
                        View-only on Free · Pro to edit
                      </button>
                    )}
                    <span className={`rounded-full px-3 py-1 font-body text-xs ${ruleStateClass}`}>
                      {ruleStateLabel}
                    </span>
                    <span className="font-body text-[10px] uppercase tracking-[0.16em] text-white/38">{rule.enabled ? "On" : "Off"}</span>
                    <button
                      className={`h-8 w-14 rounded-full border p-1 transition ${rule.enabled ? "border-emerald-300/50 bg-emerald-400/20" : "border-white/15 bg-white/5"}`}
                      onClick={() => setRules(rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))}
                      disabled={locked}
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
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
      ? "Review the oversized rows against the configured position-size threshold."
      : primaryBreach.rule.metric === "maxDailyLoss"
        ? "Review what happened after the daily-loss threshold was crossed."
        : primaryBreach.rule.metric === "maxLossStreak"
          ? "Review the rows that followed the configured loss-streak threshold."
          : "Compare the flagged rows with the active review threshold."
    : "No threshold breach appears in the current imported history.";
  const setupAction = bestSetup
    ? `${bestSetup.name} is the strongest reviewed sample; compare future imports before changing the playbook.`
    : "Upload more rows before drawing a conclusion about setup quality.";
  const sessionAction = brief.status === "locked"
    ? "Current review status: a flagged rule still needs inspection."
    : brief.status === "ready"
      ? "Current review status: no active blocker appears in the imported history."
      : "Current review status: the imported history still carries caution flags.";
  const insights = [
    {
      icon: CircleDot,
      title: "Limit warnings",
      body: analysis.breaches.length ? `${analysis.breaches.length} historical limit warning${analysis.breaches.length === 1 ? " needs" : "s need"} review before the next session.` : "No active limit warnings in the imported sample. Keep the same review thresholds instead of forcing size.",
      action: firstAction,
      tone: analysis.breaches.length ? "WARN" : "GOOD",
      evidence: primaryBreach?.evidence.slice(0, 2) ?? [`${analysis.trades.length} trades checked`, `${formatPercent(analysis.compliance)} of limits followed`],
    },
    {
      icon: ShieldCheck,
      title: "Setup review",
      body: bestSetup ? `${bestSetup.name} has the clearest sample right now: ${bestSetup.count} trades, ${bestSetup.avgR.toFixed(2)}R average result.` : "Cova needs more imported trades before it can name a clean setup with confidence.",
      action: setupAction,
      tone: analysis.breaches.length ? "CAUTION" : bestSetup && bestSetup.avgR > 0 ? "GOOD" : "CAUTION",
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
      title="Current risk review."
      variant="workspace"
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" align="right" opacity="opacity-[0.2]" />}
    >
      <div className="insights-briefing-feed grid gap-0">
        {visibleInsights.map((insight, index) => {
          const isWarningTone = insight.tone !== "GOOD" && insight.tone !== "READY";
          return (
            <motion.article
              key={insight.title}
              className="insight-briefing-row p-6 md:p-7"
              data-tone={insight.tone.toLowerCase()}
              initial={{ opacity: 0, y: 34, filter: "blur(14px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.09, duration: 0.65 }}
            >
              <insight.icon className={`h-10 w-10 ${isWarningTone ? "text-amber-300" : "text-[#18c887]"}`} />
              <span className="mt-10 inline-block rounded-full bg-white/5 px-3 py-1 font-body text-xs text-white/50">{insight.tone}</span>
              <h3 className="mt-5 font-heading text-4xl italic leading-[1] tracking-normal">{insight.title}</h3>
              <p className="mt-5 font-body font-light leading-relaxed text-white/58">{insight.body}</p>
              <div className="mt-6 border-t border-white/10 pt-4">
                <p className="font-body text-[10px] uppercase tracking-[0.22em] text-[#18c887]">Review note</p>
                <p className="mt-2 font-body text-sm font-medium leading-relaxed text-white/82">{insight.action}</p>
                {index === 0 && analysis.breaches.length > 0 && (
                  <button className="mt-4 inline-flex items-center gap-2 font-body text-sm font-medium text-amber-200" onClick={() => go("rules")} type="button">
                    Review active limits <ArrowUpRight className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
                {insight.evidence.map((line) => (
                  <p className="font-mono text-xs text-white/42" key={line}>Checked: {line}</p>
                ))}
              </div>
            </motion.article>
          );
        })}
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
              Pro shows the full three-part brief for the current imported history.
            </p>
            <div className="mt-6">
              <GlassButton strong onClick={upgradeToPro}>Unlock Pro <ArrowUpRight className="h-4 w-4" /></GlassButton>
            </div>
          </motion.article>
        )}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <GlassButton onClick={() => go("passport")}>Share Risk Passport <ArrowUpRight className="h-4 w-4" /></GlassButton>
      </div>
    </SectionShell>
  );
}

type PracticeAccountDraft = {
  accountSize: string;
  riskPerTrade: string;
  maxDailyLoss: string;
  maxDrawdown: string;
  market: PracticeMarket;
  contracts: string;
  year: string;
  date: string;
  setup: string;
};

const defaultPracticeDate = "2025-03-14";

const defaultPracticeAccountDraft = (): PracticeAccountDraft => ({
  accountSize: "50000",
  riskPerTrade: "500",
  maxDailyLoss: "1500",
  maxDrawdown: "2500",
  market: "NQ",
  contracts: "1",
  year: "2025",
  date: defaultPracticeDate,
  setup: "ORH rejection",
});

export function PracticeLab({ go, practiceReps, setPracticeReps }: { go: (section: Section) => void; practiceReps: PracticeRep[]; setPracticeReps: (next: PracticeRep[]) => void }) {
  const [account, setAccount] = useState<PracticeAccount | null>(() => readPracticeAccount());
  const [simTrades, setSimTrades] = useState<PracticeTrade[]>(() => readPracticeTrades());
  const [setupOpen, setSetupOpen] = useState(() => !readPracticeAccount());
  const [accountDraft, setAccountDraft] = useState<PracticeAccountDraft>(() => {
    const saved = readPracticeAccount();
    return saved
      ? {
          accountSize: String(saved.accountSize),
          riskPerTrade: String(saved.riskPerTrade),
          maxDailyLoss: String(saved.maxDailyLoss),
          maxDrawdown: String(saved.maxDrawdown),
          market: saved.market,
          contracts: String(saved.contracts),
          year: "2025",
          date: defaultPracticeDate,
          setup: "ORH rejection",
        }
      : defaultPracticeAccountDraft();
  });
  const [replayDate, setReplayDate] = useState(accountDraft.date);
  const [replayYear, setReplayYear] = useState(Number(accountDraft.year));
  const [activeSetup, setActiveSetup] = useState(accountDraft.setup);
  const [rulesFollowed, setRulesFollowed] = useState<"yes" | "no">("yes");
  const [mistake, setMistake] = useState("");
  const [orderQuantity, setOrderQuantity] = useState(() => readPracticeAccount()?.contracts ?? 1);

  const previewAccount = useMemo(() => createDefaultPracticeAccount({
    accountSize: toDraftNumber(accountDraft.accountSize, 50000),
    riskPerTrade: toDraftNumber(accountDraft.riskPerTrade, 500),
    maxDailyLoss: toDraftNumber(accountDraft.maxDailyLoss, 1500),
    maxDrawdown: toDraftNumber(accountDraft.maxDrawdown, 2500),
    market: accountDraft.market,
    contracts: toDraftNumber(accountDraft.contracts, 1),
  }), [accountDraft]);
  const activeAccount = account ?? previewAccount;
  const replayTape = useMemo(() => buildReplayTape({
    date: replayDate,
    year: replayYear,
    market: activeAccount.market,
    setup: activeSetup,
    session: "New York AM",
  }), [activeAccount.market, activeSetup, replayDate, replayYear]);
  const replayStartIndex = getOpeningRangeEndIndex(replayTape);
  const [replayRuntime, setReplayRuntime] = useState<ReplayRuntime>(() => ({
    tapeId: replayTape.id,
    playIndex: replayStartIndex,
    playing: false,
    position: null,
  }));
  const activeReplayRuntime = replayRuntime.tapeId === replayTape.id
    ? replayRuntime
    : { tapeId: replayTape.id, playIndex: replayStartIndex, playing: false, position: null };
  const { playIndex, playing, position } = activeReplayRuntime;
  const currentCandle = replayTape.candles[Math.min(playIndex, replayTape.candles.length - 1)] ?? replayTape.candles[0];
  const visibleCandles = replayTape.candles.slice(0, Math.min(playIndex + 1, replayTape.candles.length));
  const openingRangeBarCount = 30 / replayTape.dataSource.resolutionMinutes;
  const openingRangeComplete = visibleCandles.length >= openingRangeBarCount;
  const analysis = useMemo(() => analyzePracticeReps(simTrades), [simTrades]);
  const accountStats = useMemo(() => calculatePracticeAccountStats(activeAccount, simTrades), [activeAccount, simTrades]);
  const limitStatus = useMemo(() => evaluatePracticeAccountLimits(activeAccount, simTrades, replayTape.date), [activeAccount, replayTape.date, simTrades]);
  const recentTrades = simTrades.slice(0, 5);
  const topSetups = analysis.bySetup.slice(0, 4);
  const readinessClass = analysis.readiness.tone === "ready"
    ? "text-emerald-300"
    : analysis.readiness.tone === "building"
      ? "text-amber-200"
      : analysis.readiness.tone === "empty"
        ? "text-white/42"
        : "text-red-300";

  function currentReplayRuntime(runtime: ReplayRuntime): ReplayRuntime {
    return runtime.tapeId === replayTape.id
      ? runtime
      : { tapeId: replayTape.id, playIndex: replayStartIndex, playing: false, position: null };
  }

  function setPlayIndex(next: number | ((current: number) => number)) {
    setReplayRuntime((runtime) => {
      const current = currentReplayRuntime(runtime);
      const playIndex = typeof next === "function" ? next(current.playIndex) : next;
      return { ...current, playIndex };
    });
  }

  function setPlaying(next: boolean | ((current: boolean) => boolean)) {
    setReplayRuntime((runtime) => {
      const current = currentReplayRuntime(runtime);
      const playing = typeof next === "function" ? next(current.playing) : next;
      return { ...current, playing };
    });
  }

  function setPosition(position: PracticePosition | null) {
    setReplayRuntime((runtime) => ({ ...currentReplayRuntime(runtime), position }));
  }

  function resetReplayRuntime() {
    setReplayRuntime({ tapeId: replayTape.id, playIndex: replayStartIndex, playing: false, position: null });
  }

  useEffect(() => {
    if (account) {
      localStorage.setItem(scopedStorageKey(PRACTICE_ACCOUNT_STORAGE_KEY), JSON.stringify(account));
    }
  }, [account]);

  useEffect(() => {
    localStorage.setItem(scopedStorageKey(PRACTICE_TRADES_STORAGE_KEY), JSON.stringify(simTrades));
  }, [simTrades]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setPlayIndex((current) => {
        if (current >= replayTape.candles.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 460);
    return () => window.clearInterval(timer);
  }, [playing, replayTape.candles.length, replayTape.id]);

  useEffect(() => {
    setReplayRuntime((runtime) => runtime.tapeId === replayTape.id
      ? runtime
      : { tapeId: replayTape.id, playIndex: replayStartIndex, playing: false, position: null });
  }, [replayStartIndex, replayTape.id]);

  function updateAccountDraft<K extends keyof PracticeAccountDraft>(key: K, value: PracticeAccountDraft[K]) {
    setAccountDraft((current) => ({ ...current, [key]: value }));
  }

  function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextAccount = createDefaultPracticeAccount({
      accountSize: toDraftNumber(accountDraft.accountSize, 50000),
      riskPerTrade: toDraftNumber(accountDraft.riskPerTrade, 500),
      maxDailyLoss: toDraftNumber(accountDraft.maxDailyLoss, 1500),
      maxDrawdown: toDraftNumber(accountDraft.maxDrawdown, 2500),
      market: accountDraft.market,
      contracts: toDraftNumber(accountDraft.contracts, 1),
    });
    const accountChanged = account ? hasPracticeAccountConfigurationChanged(account, nextAccount) : true;
    if (accountChanged) {
      const simulatedIds = new Set(simTrades.map((trade) => trade.id));
      setSimTrades([]);
      setPracticeReps(practiceReps.filter((rep) => !simulatedIds.has(rep.id)));
    }
    setAccount(account && !accountChanged ? account : nextAccount);
    setReplayDate(accountDraft.date);
    setReplayYear(toDraftNumber(accountDraft.year, 2025));
    setActiveSetup(accountDraft.setup || "ORH rejection");
    setOrderQuantity(nextAccount.contracts);
    resetReplayRuntime();
    setPosition(null);
    setPlaying(false);
    setSetupOpen(false);
  }

  function resetAccount() {
    const confirmed = window.confirm("Reset the practice account and clear simulated trades?");
    if (!confirmed) return;
    const simulatedIds = new Set(simTrades.map((trade) => trade.id));
    removeScopedStorage(PRACTICE_ACCOUNT_STORAGE_KEY);
    removeScopedStorage(PRACTICE_TRADES_STORAGE_KEY);
    setAccount(null);
    setSimTrades([]);
    setPracticeReps(practiceReps.filter((rep) => !simulatedIds.has(rep.id)));
    setPosition(null);
    setSetupOpen(true);
  }

  function loadReplayFromControls() {
    setReplayDate(accountDraft.date);
    setReplayYear(toDraftNumber(accountDraft.year, 2025));
    setActiveSetup(accountDraft.setup || "ORH rejection");
    resetReplayRuntime();
    setPlaying(false);
    setPosition(null);
  }

  function openPracticePosition(direction: PracticeDirection) {
    if (!account || position || !currentCandle || !limitStatus.canOpenNewPosition) return;
    setPosition({
      id: `practice-position-${Date.now()}`,
      direction,
      entryIndex: playIndex,
      entryPrice: currentCandle.close,
      contracts: orderQuantity,
    });
  }

  function closePracticePosition() {
    if (!account || !position || !currentCandle) return;
    const trade = createPracticeTrade({
      account,
      tape: replayTape,
      direction: position.direction,
      entryIndex: position.entryIndex,
      entryPrice: position.entryPrice,
      exitIndex: playIndex,
      exitPrice: currentCandle.close,
      contracts: position.contracts,
      rulesFollowed: rulesFollowed === "yes",
      mistake: mistake.trim(),
      notes: `Replay close from ${replayTape.date} ${replayTape.setup}`,
    });
    setSimTrades((current) => [trade, ...current]);
    setPracticeReps([trade, ...practiceReps.filter((rep) => rep.id !== trade.id)]);
    setPosition(null);
    setMistake("");
    setRulesFollowed("yes");
  }

  function stepReplay(amount: number) {
    const earliestIndex = position ? position.entryIndex : replayStartIndex;
    setPlayIndex((current) => Math.max(earliestIndex, Math.min(replayTape.candles.length - 1, current + amount)));
  }

  return (
    <div className="backtesting-lab-shell">
      <header className="backtesting-lab-topbar">
        <button aria-label="Back to Cova risk desk" className="backtesting-lab-back" onClick={() => go("dashboard")} type="button">
          <ArrowLeft className="h-4 w-4" />
          <img src="/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png" alt="Cova" />
        </button>
        <div className="backtesting-lab-title">
          <span>Practice environment</span>
          <strong>Backtesting Lab</strong>
        </div>
      </header>
      <div className="backtesting-lab-stage">
        <BacktestingTerminal
          account={account}
          accountStats={accountStats}
          activeSetup={activeSetup}
          analysis={analysis}
          chart={<LightweightReplayChart key={replayTape.id} visibleCandles={visibleCandles} position={position} tape={replayTape} trades={simTrades} />}
          currentCandle={currentCandle}
          limitStatus={limitStatus}
          mistake={mistake}
          onBackHour={() => stepReplay(-(60 / replayTape.dataSource.resolutionMinutes))}
          onBuy={() => openPracticePosition("Long")}
          onChangeAccount={() => setSetupOpen(true)}
          onClosePosition={closePracticePosition}
          onMistakeChange={setMistake}
          onPlayToggle={() => setPlaying((current) => !current)}
          onQuantityChange={setOrderQuantity}
          onReset={() => { setPlaying(false); resetReplayRuntime(); setPosition(null); }}
          onRulesFollowedChange={setRulesFollowed}
          onSell={() => openPracticePosition("Short")}
          onStep={() => stepReplay(1)}
          openingRangeBarCount={openingRangeBarCount}
          openingRangeComplete={openingRangeComplete}
          orderQuantity={orderQuantity}
          playing={playing}
          position={position}
          recentTrades={recentTrades}
          replayTape={replayTape}
          rulesFollowed={rulesFollowed}
          visibleCandles={visibleCandles}
        />
      {setupOpen && createPortal(
        <div className="practice-setup-modal" role="dialog" aria-modal="true" aria-label="Set practice account">
          <form className="practice-setup-card" onSubmit={createAccount}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-body text-xs uppercase tracking-[0.24em] text-[#18c887]">Set practice account</p>
                <h3 className="mt-3 font-body text-3xl font-semibold tracking-[-0.05em]">Build the replay account first.</h3>
                <p className="mt-3 max-w-xl font-body text-sm leading-relaxed text-white/58">
                  Pick the paper account size, drawdown limits, market, year, and starting date. Then the full Practice section opens as a simulator.
                </p>
              </div>
              {account && <button className="practice-modal-close" type="button" onClick={() => setSetupOpen(false)}>Close</button>}
            </div>

            <div className="mt-7 grid gap-4 md:grid-cols-4">
              <label className="practice-field">
                <span>Account size</span>
                <input type="number" min="1000" required step="1000" value={accountDraft.accountSize} onChange={(event) => updateAccountDraft("accountSize", event.target.value)} />
              </label>
              <label className="practice-field">
                <span>Risk / trade</span>
                <input type="number" min="50" required step="50" value={accountDraft.riskPerTrade} onChange={(event) => updateAccountDraft("riskPerTrade", event.target.value)} />
              </label>
              <label className="practice-field">
                <span>Max daily loss</span>
                <input type="number" min="50" required step="50" value={accountDraft.maxDailyLoss} onChange={(event) => updateAccountDraft("maxDailyLoss", event.target.value)} />
              </label>
              <label className="practice-field">
                <span>Max drawdown</span>
                <input type="number" min="50" required step="50" value={accountDraft.maxDrawdown} onChange={(event) => updateAccountDraft("maxDrawdown", event.target.value)} />
              </label>
              <label className="practice-field">
                <span>Market</span>
                <select value={accountDraft.market} onChange={(event) => updateAccountDraft("market", event.target.value as PracticeMarket)}>
                  <option value="NQ">NQ</option>
                  <option value="MNQ">MNQ</option>
                  <option value="ES">ES</option>
                  <option value="MES">MES</option>
                </select>
              </label>
              <label className="practice-field">
                <span>Contracts</span>
                <input type="number" min="1" max="20" required step="1" value={accountDraft.contracts} onChange={(event) => updateAccountDraft("contracts", event.target.value)} />
              </label>
              <label className="practice-field">
                <span>Year</span>
                <input type="number" min="2018" max="2026" required value={accountDraft.year} onChange={(event) => updateAccountDraft("year", event.target.value)} />
              </label>
              <label className="practice-field">
                <span>Choose date</span>
                <input type="date" required value={accountDraft.date} onChange={(event) => updateAccountDraft("date", event.target.value)} />
              </label>
              <label className="practice-field md:col-span-2">
                <span>Setup to drill</span>
                <input list="practice-setup-options" required value={accountDraft.setup} onChange={(event) => updateAccountDraft("setup", event.target.value)} />
                <datalist id="practice-setup-options">
                  {practiceSetupOptions.map((setup) => <option key={setup} value={setup} />)}
                </datalist>
              </label>
              <div className="practice-account-preview md:col-span-2">
                <span>Preview</span>
                <strong>{formatMoney(previewAccount.accountSize)} · {previewAccount.contracts} {previewAccount.market}</strong>
                <p>Risk {formatMoney(previewAccount.riskPerTrade)} / trade · daily stop {formatMoney(previewAccount.maxDailyLoss)}</p>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
              <button className="practice-danger-link" type="button" onClick={resetAccount}>Reset account</button>
              <GlassButton strong type="submit">Enter replay simulator <ArrowUpRight className="h-4 w-4" /></GlassButton>
            </div>
          </form>
        </div>,
        document.body,
      )}
      </div>
    </div>
  );
}

function readPracticeAccount(): PracticeAccount | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedStorageKey(PRACTICE_ACCOUNT_STORAGE_KEY)) ?? "null");
    if (parsed?.accountSize && parsed?.market) {
      return parsed as PracticeAccount;
    }
  } catch {
    return null;
  }
  return null;
}

function readPracticeTrades(): PracticeTrade[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedStorageKey(PRACTICE_TRADES_STORAGE_KEY)) ?? "[]");
    if (Array.isArray(parsed)) {
      return parsed.filter((trade): trade is PracticeTrade => (
        typeof trade?.id === "string" &&
        typeof trade?.date === "string" &&
        typeof trade?.market === "string" &&
        typeof trade?.entryPrice === "number" &&
        typeof trade?.exitPrice === "number" &&
        typeof trade?.pnl === "number"
      ));
    }
  } catch {
    return [];
  }
  return [];
}

function toDraftNumber(value: string, fallback: number) {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
type PassportExportPresetId = "feed" | "square" | "story";

type PassportExportPreset = {
  height: number;
  id: PassportExportPresetId;
  label: string;
  note: string;
  width: number;
};

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
    tagline: "Local export with sensitive stats omitted.",
    cardSubtitle: "Masked export view",
    reveals: ["Review date", "Sample quality", "Risk score range", "Rules kept"],
    hidden: ["Net P&L", "Win rate", "Trader identity"],
  },
  {
    id: "coach",
    label: "Coach",
    tagline: "Include detected warnings for review.",
    cardSubtitle: "Coach review mode",
    reveals: ["Top warning", "Rule breaches", "Review note", "Risk score"],
    hidden: ["Shareable flex stats", "Public P&L", "Broker details"],
  },
];

const passportExportPresets: PassportExportPreset[] = [
  { id: "feed", label: "Feed 4:5", note: "Best all-around post", width: 1080, height: 1350 },
  { id: "square", label: "Square 1:1", note: "Profile and chat share", width: 1080, height: 1080 },
  { id: "story", label: "Story 9:16", note: "Full-screen vertical", width: 1080, height: 1920 },
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
      skin: "High-control sample",
      headline: "Profit with restraint",
      summary: "Top Cova rank for this reviewed sample based on positive results, expectancy, and configured-rule adherence.",
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
      skin: "Strong-control sample",
      headline: "Disciplined trader profile",
      summary: "The imported sample is profitable and mostly within the configured limits.",
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
      skin: "Positive reviewed sample",
      headline: "Profitable, still tightening",
      summary: "The imported sample is positive, while rule warnings and sample size still affect the Cova rank.",
      className: "passport-tier-b",
      cardClass: "passport-card-skin-b",
    };
  }
  if (profitable) {
    return {
      badge: "S",
      rank: "Silver",
      skin: "Positive, limited sample",
      headline: "Positive P&L with limited control evidence",
      summary: "The reviewed sample is positive, but rule adherence, expectancy, or sample size is still limited.",
      className: "passport-tier-v",
      cardClass: "passport-card-skin-v",
    };
  }
  if (inTheRed) {
    return {
      badge: "B",
      rank: "Bronze",
      skin: "Negative reviewed sample",
      headline: "Negative P&L in the reviewed sample",
      summary: "The imported history is negative and contains patterns that lower the Cova rank.",
      className: "passport-tier-rebuild",
      cardClass: "passport-card-skin-rebuild",
    };
  }
  if (tradeCount < 10) {
    return {
      badge: "UR",
      rank: "Unranked",
      skin: "Sample pending",
      headline: "Not enough proof yet",
      summary: "Not enough reviewed trades to calculate a meaningful Cova rank.",
      className: "passport-tier-u",
      cardClass: "passport-card-skin-u",
    };
  }
  return {
    badge: "B",
    rank: "Bronze",
    skin: "Starting rank",
    headline: "Build the proof first",
    summary: "There are enough trades to rank, but the reviewed sample still contains significant rule warnings.",
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
  if (analysis.totalPnl < 0) {
    return "Red sample · rebuild control";
  }
  if (tier.rank === "Diamond") {
    return "Elite control · high-confidence review";
  }
  if (tier.rank === "Platinum") {
    return "Profitable · pressure tested";
  }
  if (tier.rank === "Gold") {
    return "Profitable · leaks still visible";
  }
  if (tier.rank === "Silver") {
    return "Green · still inconsistent";
  }
  if (tier.rank === "Bronze") {
    return "Ranked · control needs work";
  }
  return `${Math.max(0, 10 - analysis.trades.length)} trades until rank unlock`;
}

function getPassportNextTarget(tier: PassportTier, analysis: ReturnType<typeof analyze>) {
  if (analysis.totalPnl < 0) {
    return "Reset: 5 clean trades · zero daily-loss breaches";
  }
  if (tier.rank === "Diamond") {
    return "Top rank · keep the process boring";
  }
  if (tier.rank === "Platinum") {
    return "Diamond: 90 score · 90% rules held · zero-breach week";
  }
  if (tier.rank === "Gold") {
    return "Platinum: 20 trades · 80% rules held · 1.25 PF";
  }
  if (tier.rank === "Silver") {
    return "Gold: 68 score · 70% rules held · 1.25 PF";
  }
  if (tier.rank === "Bronze") {
    return "Silver: 60% rules held · PF 1.10 · fewer breaches";
  }
  return `${Math.max(0, 10 - analysis.trades.length)} more reviewed trades to unlock rank`;
}

function getPassportMoodLine(tier: PassportTier, analysis: ReturnType<typeof analyze>) {
  const leakCount = analysis.breaches.length;
  const leaks = `${leakCount} leak${leakCount === 1 ? "" : "s"}`;
  if (analysis.totalPnl < 0) return "Red. Reset before the next click.";
  if (tier.rank === "Diamond") return "Locked in. No chaos required.";
  if (tier.rank === "Platinum") return leakCount ? `Sharp. ${leaks} left.` : "Clean money. Clean process.";
  if (tier.rank === "Gold") return leakCount ? `Green. ${leaks} left.` : "Green. Now keep it boring.";
  if (tier.rank === "Silver") return "Green, but the rules need work.";
  if (tier.rank === "Bronze") return "The proof is early. Keep stacking reps.";
  return `${Math.max(0, 10 - analysis.trades.length)} more trades and this gets interesting.`;
}

function getPassportSparkline(analysis: ReturnType<typeof analyze>) {
  const trades = analysis.trades.slice(-18);
  const values = trades.reduce<number[]>((running, trade) => {
    running.push(running[running.length - 1] + trade.pnl);
    return running;
  }, [0]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(1, maximum - minimum);
  return values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = 92 - ((value - minimum) / spread) * 84;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function getPassportMarketLine(analysis: ReturnType<typeof analyze>) {
  const markets = [...new Set(analysis.trades.map((trade) => trade.market).filter(Boolean))].slice(0, 2);
  return markets.length ? markets.join(" / ") : "MULTI-MARKET";
}

function getPassportStats(analysis: ReturnType<typeof analyze>, mode: PassportShareModeId): PassportStat[] {
    if (mode === "discipline") {
      return [
        { label: "Control score", value: `${analysis.score}`, tone: "positive" },
        { label: "Rules held", value: formatPercent(analysis.compliance), tone: analysis.compliance >= 0.75 ? "positive" : "negative" },
        { label: "Average R", value: `${analysis.avgR.toFixed(2)}R`, tone: analysis.avgR >= 0 ? "positive" : "negative" },
        { label: "Max DD", value: formatMoney(Math.round(analysis.maxDrawdown)), tone: analysis.maxDrawdown > 0 ? "neutral" : "positive" },
        { label: "Trades reviewed", value: `${analysis.trades.length}`, tone: "neutral" },
        { label: "Breaches", value: `${analysis.breaches.length}`, tone: analysis.breaches.length ? "negative" : "positive" },
      ];
    }
    if (mode === "private") {
      return [
        { label: "Score range", value: analysis.score ? `${Math.floor(analysis.score / 10) * 10}+` : "Hidden", tone: "positive" },
        { label: "Rules held", value: formatPercent(analysis.compliance), tone: analysis.compliance >= 0.75 ? "positive" : "negative" },
        { label: "Sample", value: analysis.evidenceQuality.label, tone: "neutral" },
        { label: "Generated", value: analysis.latestDate, tone: "neutral" },
        { label: "Trades reviewed", value: `${analysis.trades.length}`, tone: "neutral" },
        { label: "Visibility", value: "Masked", tone: "neutral" },
      ];
    }
    if (mode === "coach") {
      return [
        { label: "Control score", value: `${analysis.score}`, tone: "neutral" },
        { label: "Flags", value: `${analysis.breaches.length}`, tone: analysis.breaches.length ? "negative" : "positive" },
        { label: "Top leak", value: getPrimaryLeak(analysis), tone: analysis.breaches.length ? "negative" : "positive" },
        { label: "Next", value: analysis.nextSessionBrief.status.toUpperCase(), tone: analysis.nextSessionBrief.status === "ready" ? "positive" : "negative" },
        { label: "Profit factor", value: analysis.profitFactor.toFixed(2), tone: analysis.profitFactor >= 1 ? "positive" : "negative" },
        { label: "Average R", value: `${analysis.avgR.toFixed(2)}R`, tone: analysis.avgR >= 0 ? "positive" : "negative" },
      ];
    }
    return [
      { label: "Net P&L", value: formatMoney(analysis.totalPnl), tone: analysis.totalPnl >= 0 ? "positive" : "negative" },
      { label: "Control score", value: `${analysis.score}`, tone: "positive" },
      { label: "Rules held", value: formatPercent(analysis.compliance), tone: analysis.compliance >= 0.75 ? "positive" : "negative" },
      { label: "Trades reviewed", value: `${analysis.trades.length}`, tone: "neutral" },
      { label: "Profit factor", value: analysis.profitFactor.toFixed(2), tone: analysis.profitFactor >= 1 ? "positive" : "negative" },
      { label: "Breaches", value: `${analysis.breaches.length}`, tone: analysis.breaches.length ? "negative" : "positive" },
    ];
    }

function getPassportDiamondPreviewStats(mode: PassportShareModeId): PassportStat[] {
  if (mode === "discipline") {
    return [
      { label: "Control score", value: "94", tone: "positive" },
      { label: "Rules held", value: "93%", tone: "positive" },
      { label: "Average R", value: "0.42R", tone: "positive" },
      { label: "Max DD", value: "$620", tone: "positive" },
      { label: "Trades reviewed", value: "72", tone: "neutral" },
      { label: "Breaches", value: "0", tone: "positive" },
    ];
  }
  if (mode === "private") {
    return [
      { label: "Score range", value: "90+", tone: "positive" },
      { label: "Rules held", value: "93%", tone: "positive" },
      { label: "Sample", value: "Elite", tone: "neutral" },
      { label: "Review date", value: "2026-05-06", tone: "neutral" },
      { label: "Trades reviewed", value: "72", tone: "neutral" },
      { label: "Visibility", value: "Masked", tone: "neutral" },
    ];
  }
  if (mode === "coach") {
    return [
      { label: "Control score", value: "94", tone: "positive" },
      { label: "Flags", value: "0", tone: "positive" },
      { label: "Top leak", value: "No major leak", tone: "positive" },
      { label: "Next", value: "READY", tone: "positive" },
      { label: "Profit factor", value: "1.86", tone: "positive" },
      { label: "Average R", value: "0.42R", tone: "positive" },
    ];
  }
  return [
    { label: "Net P&L", value: "$18,760", tone: "positive" },
    { label: "Control score", value: "94", tone: "positive" },
    { label: "Rules held", value: "93%", tone: "positive" },
    { label: "Trades reviewed", value: "72", tone: "neutral" },
    { label: "Profit factor", value: "1.86", tone: "positive" },
    { label: "Breaches", value: "0", tone: "positive" },
  ];
}

export function Passport({ analysis, entitlements, isSampleReview, go, upgradeToPro }: { analysis: ReturnType<typeof analyze>; entitlements: WorkspaceEntitlements; isSampleReview: boolean; go: (section: Section) => void; upgradeToPro: () => void }) {
  const [shareModeId, setShareModeId] = useState<PassportShareModeId>("flex");
  const [exportPresetId, setExportPresetId] = useState<PassportExportPresetId>("feed");
  const cardRef = useRef<HTMLDivElement | null>(null);
  const faceRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const previewTier = getPassportTierPreviewOverride();
  const tier = previewTier ?? getPassportTier(analysis);
  const previewingDiamond = previewTier?.rank === "Diamond";
  const shareMode = getPassportMode(shareModeId);
  const exportPreset = passportExportPresets.find((preset) => preset.id === exportPresetId) ?? passportExportPresets[0];
  const cardStats = previewingDiamond ? getPassportDiamondPreviewStats(shareModeId) : getPassportStats(analysis, shareModeId);
  const proofLine = getPassportProofLine(tier, analysis);
  const displayProofLine = isSampleReview ? "Sample analysis · not account verification" : proofLine;
  const nextTarget = getPassportNextTarget(tier, analysis);
  const verifiedRules = analysis.ruleStatuses.length - analysis.breaches.length;
  const displayScore = previewingDiamond ? 94 : analysis.score;
  const displayVerifiedRules = previewingDiamond ? 6 : verifiedRules;
  const displayRuleCount = previewingDiamond ? 6 : analysis.ruleStatuses.length;
  const reviewId = `COVA-${analysis.latestDate.replace(/-/g, "").slice(2)}-${displayScore}${displayVerifiedRules}`;
  const traderNumber = reviewId.replace(/\D/g, "").slice(-4).padStart(4, "0");
  const marketLine = previewingDiamond ? "NQ / OPENING RANGE" : getPassportMarketLine(analysis);
  const setupLine = previewingDiamond ? "OPENING RANGE" : analysis.bySetup[0]?.name ?? "MIXED SETUPS";
  const moodLine = getPassportMoodLine(tier, analysis);
  const sparklinePoints = getPassportSparkline(analysis);
  const heroStat = cardStats[0];
  const profileStats = (shareModeId === "flex" ? [cardStats[2], cardStats[3], cardStats[4], cardStats[5]] : cardStats.slice(1, 5)).filter(Boolean) as PassportStat[];
  const privacyRows = [
    { label: "Net P&L", visible: shareMode.reveals.includes("Net P&L") },
    { label: "Broker", visible: false },
    { label: "Notes", visible: false },
    { label: "Rule proof", visible: true },
    { label: "Trade history", visible: false },
    { label: "Open positions", visible: false },
  ];
  const ledgerHasFlags = analysis.breaches.length > 0;
  const ledgerStatusCopy = isSampleReview ? "Sample review · demo data" : ledgerHasFlags ? "Rules calculated · flags found" : "Rules calculated · no flags found";
  const ledgerStatusClass = ledgerHasFlags || isSampleReview ? "has-flags" : "is-verified";

  useEffect(() => () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
  }, []);


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
      eyebrow={isSampleReview ? "Sample trader profile" : "Trader profile"}
      title="Risk Passport"
      variant="workspace"
      backdrop={<ImageAtmosphere src="/media/cova-passport-product.jpg" align="right" opacity="opacity-[0.18]" />}
    >
      <div className="passport-workbench">
        <div className="passport-topbar">
          <div>
            <p className="passport-kicker">{isSampleReview ? "Sample review · demo data" : entitlements.plan === "free" ? "Free preview" : "Reviewed profile"}</p>
            <p className="passport-topbar-copy">
              Choose which calculated fields appear, then download a local PNG. Cova does not host, revoke, or expire the file after you share it.
            </p>
          </div>
          <div className="passport-topbar-actions">
            <button className="passport-action-button" onClick={() => go("dashboard")} type="button">Back to review</button>
            <button className="passport-action-button passport-action-primary" onClick={entitlements.canExportPassport ? () => void downloadPassportPng(analysis, tier, shareMode, exportPreset, isSampleReview, faceRef.current) : upgradeToPro} type="button">
              <Download className="h-4 w-4" /> {entitlements.canExportPassport ? "Download PNG" : "Unlock export"}
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
                    {isSampleReview && (
                      <div className="passport-sample-watermark" aria-label="Sample review demo data">
                        <span>SAMPLE REVIEW · DEMO DATA</span>
                        <strong>SAMPLE / NOT VERIFIED</strong>
                      </div>
                    )}
                    <div className="passport-credential-inner passport-profile-card">
                      <header className="passport-profile-header">
                        <div className="passport-profile-brand">
                          <span>COVA</span>
                          <strong>Risk Passport</strong>
                        </div>
                        <div className="passport-profile-pills">
                          <span>{shareMode.label}</span>
                          <span>{isSampleReview ? "Demo" : "Local PNG"}</span>
                        </div>
                      </header>

                      <div className="passport-profile-identity">
                        <div className="passport-profile-avatar" aria-hidden="true">{tier.badge}</div>
                        <div>
                          <span>TRADER {traderNumber}</span>
                          <strong>{marketLine} · {setupLine}</strong>
                          <small>{isSampleReview ? "Anonymous sample profile" : "Anonymous reviewed profile"}</small>
                        </div>
                      </div>

                      <div className="passport-profile-status">
                        <div className="passport-profile-rank">
                          <span>{tier.skin}</span>
                          <h3>{tier.rank}</h3>
                          <p>{moodLine}</p>
                        </div>
                        <div className={`passport-profile-hero-stat passport-stat-${heroStat.tone ?? "neutral"}`}>
                          <span>{heroStat.label}</span>
                          <strong>{heroStat.value}</strong>
                          <small>{displayVerifiedRules}/{displayRuleCount} rules held</small>
                        </div>
                      </div>

                      <div className="passport-profile-sparkline">
                        <div>
                          <span>Account path</span>
                          <em>{analysis.trades.length} trades reviewed</em>
                        </div>
                        <svg aria-label="Cumulative reviewed trade result" preserveAspectRatio="none" role="img" viewBox="0 0 100 100">
                          <line x1="0" x2="100" y1="92" y2="92" />
                          <polyline points={sparklinePoints} />
                        </svg>
                      </div>

                      <div className="passport-profile-stat-grid">
                        {profileStats.map((stat) => (
                          <div className={`passport-profile-stat passport-stat-${stat.tone ?? "neutral"}`} key={stat.label}>
                            <span>{stat.label}</span>
                            <strong>{stat.value}</strong>
                          </div>
                        ))}
                      </div>

                      <div className="passport-profile-proof">
                        <div>
                          <span>{isSampleReview ? "Demo review" : "Review status"}</span>
                          <strong>{displayProofLine}</strong>
                        </div>
                        <em>{shareMode.cardSubtitle}</em>
                      </div>

                      <div className="passport-rank-progress">
                        <span>Next up</span>
                        <strong>{nextTarget}</strong>
                      </div>

                      <footer className="passport-profile-footer">
                        <div>
                          <span>{isSampleReview ? "Demo ref" : "Review ref"}</span>
                          <code>{reviewId}</code>
                        </div>
                        <p>{analysis.latestDate} · local export · user controlled</p>
                      </footer>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <aside className="passport-share-rail">
            <div className="passport-rail-section">
              <div className="passport-rail-heading">
                <span>Export view</span>
              </div>
              <div className="passport-mode-list">
                {passportShareModes.map((mode) => (
                  <button
                    aria-pressed={shareModeId === mode.id}
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
              <div className="passport-rail-heading"><span>Export format</span><small>{exportPreset.width} × {exportPreset.height}</small></div>
              <div className="passport-export-list">
                {passportExportPresets.map((preset) => (
                  <button
                    aria-pressed={exportPresetId === preset.id}
                    className={`passport-export-row ${exportPresetId === preset.id ? "is-active" : ""}`}
                    key={preset.id}
                    onClick={() => setExportPresetId(preset.id)}
                    type="button"
                  >
                    <span>{preset.label}</span>
                    <small>{preset.note}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="passport-rail-section">
              <div className="passport-rail-heading"><span>Included in PNG</span></div>
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

          </aside>
        </div>

        <div className="passport-ledger-panel">
          <div className="passport-ledger-heading">
            <div>
              <p>Review receipt</p>
              <span>What held, what did not, and when Cova checked it.</span>
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
                <code>{friendlyRuleMetric(status.rule.metric)}</code>
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

function loadPassportImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Passport image could not be composed."));
    image.src = dataUrl;
  });
}

async function composePassportExport(sourceDataUrl: string, preset: PassportExportPreset, tier: PassportTier, isSampleReview: boolean) {
  const source = await loadPassportImage(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = preset.width;
  canvas.height = preset.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Passport export canvas is unavailable.");
  }

  const palette = getPassportExportPalette(tier);
  const background = context.createLinearGradient(0, 0, preset.width, preset.height);
  background.addColorStop(0, "#080907");
  background.addColorStop(0.52, "#020302");
  background.addColorStop(1, "#10100c");
  context.fillStyle = background;
  context.fillRect(0, 0, preset.width, preset.height);

  context.strokeStyle = "rgba(255,255,255,0.035)";
  context.lineWidth = 1;
  for (let x = 0; x <= preset.width; x += 90) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, preset.height);
    context.stroke();
  }
  for (let y = 0; y <= preset.height; y += 90) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(preset.width, y);
    context.stroke();
  }

  const headerSpace = preset.id === "feed" ? 24 : preset.id === "square" ? 118 : 270;
  const footerSpace = preset.id === "feed" ? 24 : preset.id === "square" ? 82 : 230;
  const sidePadding = preset.id === "feed" ? 28 : preset.id === "square" ? 62 : 80;
  const availableWidth = preset.width - sidePadding * 2;
  const availableHeight = preset.height - headerSpace - footerSpace;
  const scale = Math.min(availableWidth / source.naturalWidth, availableHeight / source.naturalHeight);
  const drawWidth = source.naturalWidth * scale;
  const drawHeight = source.naturalHeight * scale;
  const drawX = (preset.width - drawWidth) / 2;
  const drawY = headerSpace + (availableHeight - drawHeight) / 2;

  context.save();
  context.shadowColor = "rgba(0,0,0,0.72)";
  context.shadowBlur = 52;
  context.shadowOffsetY = 28;
  context.drawImage(source, drawX, drawY, drawWidth, drawHeight);
  context.restore();

  if (preset.id !== "feed") {
    const titleY = preset.id === "story" ? 124 : 58;
    context.fillStyle = palette.accent;
    context.font = "700 24px Arial, sans-serif";
    context.fillText("COVA  /  RISK PASSPORT", 64, titleY);
    context.fillStyle = "rgba(255,255,255,0.72)";
    context.font = preset.id === "story" ? "800 54px Arial, sans-serif" : "800 36px Arial, sans-serif";
    context.fillText(`${tier.rank.toUpperCase()} TRADER PROFILE`, 64, titleY + (preset.id === "story" ? 72 : 48));
  }

  context.fillStyle = isSampleReview ? palette.accent : "rgba(255,255,255,0.48)";
  context.font = "700 20px Arial, sans-serif";
  const footerCopy = isSampleReview ? "DEMO DATA · NOT ACCOUNT VERIFIED" : "REVIEWED IMPORT · LOCAL PNG · USER CONTROLLED";
  context.fillText(footerCopy, 64, preset.height - 48);
  return canvas.toDataURL("image/png");
}

async function downloadPassportPng(analysis: ReturnType<typeof analyze>, tier: PassportTier, shareMode: PassportShareMode, exportPreset: PassportExportPreset, isSampleReview: boolean, cardNode?: HTMLElement | null) {
  const sampleSlug = isSampleReview ? "sample-" : "";
  const filename = `cova-risk-passport-${sampleSlug}${tier.rank.toLowerCase()}-${exportPreset.id}-${analysis.latestDate}.png`;
  if (cardNode) {
    try {
      await document.fonts.ready;
      const dataUrl = await toPng(cardNode, {
        backgroundColor: "#020304",
        cacheBust: true,
        pixelRatio: 2.4,
        skipFonts: true,
        style: {
          transform: "none",
          transformOrigin: "top left",
        },
      });
      const composedDataUrl = await composePassportExport(dataUrl, exportPreset, tier, isSampleReview);
      downloadDataUrl(composedDataUrl, filename);
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
  const proofLine = (isSampleReview ? "Sample analysis · not account verification" : getPassportProofLine(tier, analysis)).toUpperCase();
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
  const reviewId = `COVA-${analysis.latestDate.replace(/-/g, "").slice(2)}-${analysis.score}${verifiedRules}`;
  const diamondExportFx = isDiamondExport ? `
      <path d="M82 86 H998 L1026 114 V1386 L998 1414 H82 L54 1386 V114 Z" fill="none" stroke="${palette.accent}" stroke-opacity="0.36" stroke-width="1"/>
      <path d="M132 420 L948 420 L976 536 L948 652 L132 652 L104 536 Z" fill="rgba(156,236,255,0.035)" stroke="rgba(210,248,255,0.16)"/>
      <path d="M180 536 H900 M540 420 V652 M292 420 L540 652 M788 420 L540 652" stroke="rgba(210,248,255,0.12)" stroke-width="1"/>
      <circle cx="540" cy="536" r="268" fill="none" stroke="rgba(156,236,255,0.13)" stroke-width="1"/>
      <circle cx="540" cy="536" r="186" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    ` : "";
  const sampleExportWatermark = isSampleReview ? `
      <g transform="rotate(-16 540 750)" opacity="0.28">
        <text x="540" y="738" text-anchor="middle" fill="${palette.accent}" font-family="Arial Black, Arial, sans-serif" font-size="58" font-weight="900" letter-spacing="8">SAMPLE / NOT VERIFIED</text>
        <text x="540" y="802" text-anchor="middle" fill="${palette.metal}" font-family="Arial, sans-serif" font-size="28" font-weight="800" letter-spacing="7">SAMPLE REVIEW · DEMO DATA</text>
      </g>
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
      ${sampleExportWatermark}
      <text x="92" y="1430" fill="rgba(224,236,248,0.5)" font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="3">${isSampleReview ? "DEMO · NOT ACCOUNT VERIFIED · " : ""}MODE ${escapeSvgText(shareMode.label.toUpperCase())} · LOCAL PNG · USER CONTROLLED · ${escapeSvgText(reviewId)}</text>
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
    const fallbackDataUrl = canvas.toDataURL("image/png");
    void composePassportExport(fallbackDataUrl, exportPreset, tier, isSampleReview)
      .then((composedDataUrl) => downloadDataUrl(composedDataUrl, filename))
      .catch(() => downloadDataUrl(fallbackDataUrl, filename));
  };
  image.src = svgUrl;
}

