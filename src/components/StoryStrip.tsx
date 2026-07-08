import { motion } from "motion/react";
import { ArrowRight, FileUp, Fingerprint, Gauge, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CsvExplainer } from "./CsvExplainer";

type StoryFrame = {
  body: string;
  csvHelp?: { body: string; steps: string[] };
  eyebrow: string;
  Icon: LucideIcon;
  metric: string;
  num: string;
  title: string;
};

const proofStoryFrames: StoryFrame[] = [
  {
    num: "01",
    eyebrow: "Import",
    title: "Bring in your trades.",
    body: "Upload a CSV or connect an account. Cova turns your history into something you can actually review.",
    Icon: FileUp,
    metric: "Trades loaded",
    csvHelp: {
      body: "A CSV is the file most broker or prop dashboards export for your trades.",
      steps: ["Export trade history", "Upload it", "Cova reads the rows"],
    },
  },
  {
    num: "02",
    eyebrow: "Review",
    title: "See what keeps costing you.",
    body: "Cova checks drawdown, sizing, daily loss, revenge trades, and rule breaks in plain language.",
    Icon: Gauge,
    metric: "Risk checked",
  },
  {
    num: "03",
    eyebrow: "Improve",
    title: "Know the next fix.",
    body: "Instead of staring at a journal, you get the one or two habits to tighten before the next session.",
    Icon: ShieldCheck,
    metric: "Next action clear",
  },
  {
    num: "04",
    eyebrow: "Share",
    title: "Turn discipline into proof.",
    body: "Risk Passport packages the clean version: gains, rule-following, and consistency without exposing every trade.",
    Icon: Fingerprint,
    metric: "Passport ready",
  },
];

export function StoryStrip() {
  return (
    <section className="story-strip-simple relative overflow-hidden bg-black px-5 py-24 md:px-10 lg:px-14">
      <div className="story-grain absolute inset-0" />
      <div className="trade-proof-ambient absolute inset-0" />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
          <div>
            <p className="font-body text-xs font-medium uppercase tracking-[0.28em] text-[#b9f5df]/80">How Cova works</p>
            <h2 className="mt-5 max-w-2xl font-body text-4xl font-semibold leading-[0.98] tracking-[-0.055em] text-white md:text-6xl">
              Import trades. Find the leak. Build proof.
            </h2>
            <p className="mt-6 max-w-xl font-body text-base font-light leading-relaxed text-white/58">
              Inspired by the clarity traders expect from modern journals, but focused on the thing that decides payouts: behavior under risk.
            </p>
          </div>
          <div className="trade-proof-summary-panel">
            <div>
              <p className="font-body text-xs uppercase tracking-[0.2em] text-[#18c887]">Sample Risk Passport</p>
              <h3 className="mt-3 font-body text-2xl font-semibold tracking-[-0.035em] text-white">Alex R. · Funded account review</h3>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[["Net P&L", "+$4,820", "text-emerald-300"], ["Rules kept", "74%", "text-emerald-300"], ["Risk score", "82", "text-white"]].map(([label, value, tone]) => (
                <div className="rounded-[22px] border border-white/10 bg-black/26 p-4" key={label}>
                  <span className="font-body text-xs uppercase tracking-[0.16em] text-white/38">{label}</span>
                  <strong className={`mt-2 block font-mono text-2xl ${tone}`}>{value}</strong>
                </div>
              ))}
            </div>
            <p className="mt-5 font-body text-sm leading-relaxed text-white/52">
              This is the WOW layer: a clean shareable proof card traders can be proud to post without leaking private trade details.
            </p>
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {proofStoryFrames.map((frame, index) => (
            <StoryStepCard frame={frame} index={index} key={frame.num} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StoryStepCard({ frame, index }: { frame: StoryFrame; index: number }) {
  return (
    <motion.article
      className="trade-proof-step-card"
      initial={{ opacity: 0, y: 22 }}
      transition={{ delay: index * 0.05, duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
      viewport={{ once: true, margin: "-80px" }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-white/36">{frame.num}</span>
        <span className="grid h-10 w-10 place-items-center rounded-2xl border border-[#18c887]/18 bg-[#18c887]/10 text-[#b9f5df]">
          <frame.Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-7 font-body text-xs uppercase tracking-[0.2em] text-[#b9f5df]/70">{frame.eyebrow}</p>
      <h3 className="mt-3 font-body text-2xl font-semibold tracking-[-0.035em] text-white">{frame.title}</h3>
      <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/56">{frame.body}</p>
      {frame.csvHelp && <CsvExplainer body={frame.csvHelp.body} steps={frame.csvHelp.steps} compact />}
      <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
        <span className="font-body text-sm text-white/58">{frame.metric}</span>
        <ArrowRight className="h-4 w-4 text-[#18c887]" />
      </div>
    </motion.article>
  );
}
