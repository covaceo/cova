import { motion } from "motion/react";
import { ArrowUpRight, CircleDot, Gauge, LockKeyhole, ShieldCheck } from "lucide-react";
import { analyze } from "../lib/risk";
import { GlassButton } from "./GlassButton";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "practice" | "passport";

export function ScoreExplanationStrip({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  const factors = analysis.scoreFactors.slice(0, 4);
  const topFlag = analysis.behaviorFlags.find((flag) => flag.severity === "critical" || flag.severity === "warning") ?? analysis.behaviorFlags[0];
  const toneForImpact = {
    positive: {
      label: "Helping",
      className: "border-emerald-300/20 bg-emerald-400/10 text-emerald-200",
      dot: "bg-emerald-300",
    },
    negative: {
      label: "Hurting",
      className: "border-red-300/18 bg-red-500/8 text-red-200",
      dot: "bg-red-300",
    },
    neutral: {
      label: "Context",
      className: "border-white/10 bg-white/[0.028] text-white/58",
      dot: "bg-white/34",
    },
  } satisfies Record<"positive" | "negative" | "neutral", { className: string; dot: string; label: string }>;

  return (
    <motion.section
      className="liquid-glass mb-6 rounded-[34px] p-4 md:p-5"
      initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="grid gap-5 xl:grid-cols-[0.74fr_1.26fr] xl:items-stretch">
        <div className="rounded-[28px] border border-white/10 bg-black/24 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#18c887]/20 bg-[#18c887]/10 px-3 py-1.5 font-body text-xs text-[#b9f5df]">
              <CircleDot className="h-3.5 w-3.5" />
              Score logic
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-white/36">
              {analysis.evidenceQuality.label}
            </span>
          </div>
          <h3 className="mt-4 font-body text-3xl font-semibold leading-[1.02] tracking-[-0.04em] text-white">
            Why Cova scored this {analysis.score}/100.
          </h3>
          <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/56">
            Cova weighs limit discipline, recent R, drawdown, and sample quality. It is a review system, not a signal.
          </p>
          {topFlag && (
            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.025] p-4">
              <p className="font-body text-xs uppercase tracking-[0.18em] text-white/34">Most useful note</p>
              <p className="mt-2 font-body text-sm font-medium text-white/80">{topFlag.label}</p>
              <p className="mt-1 font-body text-xs leading-relaxed text-white/46">{topFlag.summary}</p>
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {factors.map((factor, index) => {
            const tone = toneForImpact[factor.impact];
            return (
              <motion.div
                className={`rounded-[26px] border p-4 ${tone.className}`}
                key={`${factor.label}-${index}`}
                initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ delay: index * 0.045, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-body text-xs uppercase tracking-[0.18em] opacity-75">{tone.label}</span>
                  <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                </div>
                <p className="mt-4 font-body text-base font-semibold text-white">{factor.label}</p>
                <p className="mt-2 font-body text-sm leading-relaxed text-white/58">{factor.summary}</p>
                <p className="mt-4 border-t border-white/10 pt-3 font-mono text-[11px] leading-relaxed text-white/38">{factor.evidence}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}

export function NextSessionBriefCard({ analysis, go }: { analysis: ReturnType<typeof analyze>; go: (section: Section) => void }) {
  const brief = analysis.nextSessionBrief;
  const config = {
    locked: {
      icon: LockKeyhole,
      label: "Pause",
      tone: "border-red-300/22 bg-red-500/8 text-red-200",
      dot: "bg-red-300",
    },
    caution: {
      icon: Gauge,
      label: "Caution",
      tone: "border-amber-200/20 bg-amber-300/8 text-amber-100",
      dot: "bg-amber-200",
    },
    ready: {
      icon: ShieldCheck,
      label: "Ready",
      tone: "border-emerald-300/22 bg-emerald-400/10 text-emerald-200",
      dot: "bg-emerald-300",
    },
  }[brief.status];
  const Icon = config.icon;

  return (
    <motion.article
      className="next-session-brief-card risk-next-panel motion-surface mb-6 p-6"
      initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-body text-xs ${config.tone}`}>
              <span className={`h-2 w-2 rounded-full ${config.dot}`} />
              {config.label}
            </span>
            <span className="font-body text-xs uppercase tracking-[0.22em] text-[#b9f5df]">Next session brief</span>
          </div>
          <h3 className="mt-5 max-w-2xl font-heading text-4xl italic leading-[1.02] tracking-normal md:text-5xl">
            {brief.headline}
          </h3>
          <div className="mt-6 flex flex-wrap gap-3">
            <GlassButton strong onClick={() => go("coach")}>Insights <ArrowUpRight className="h-4 w-4" /></GlassButton>
            <GlassButton onClick={() => go("rules")}>Limits</GlassButton>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-[28px] border border-white/10 bg-black/24 p-4">
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-[#18c887]" />
              <p className="font-body text-xs uppercase tracking-[0.22em] text-white/42">Watch first</p>
            </div>
            <div className="mt-4 space-y-2">
              {brief.watchlist.slice(0, 3).map((item) => (
                <p className="rounded-[18px] border border-white/8 bg-white/[0.025] px-3 py-2 font-body text-sm text-white/68" key={item}>{item}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

