import { lazy, Suspense, useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { FileUp, Fingerprint, Gauge, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CsvExplainer } from "./CsvExplainer";

const TradeProofThreeStory = lazy(() => import("./TradeProofThreeStory"));

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

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
    eyebrow: "Start with reality",
    title: "Your history tells on you.",
    body: "Cova starts with what already happened: entries, exits, size, drawdown, and the moments you pressed anyway. No signals, no guesses.",
    Icon: ShieldCheck,
    metric: "History captured",
  },
  {
    num: "02",
    eyebrow: "Clean the mess",
    title: "Rows become evidence.",
    body: "Upload a CSV or connect an account. Cova turns the export into a ledger you can review without pretending the bad trades did not happen.",
    Icon: FileUp,
    metric: "CSV normalized",
    csvHelp: {
      body: "A CSV is the spreadsheet-style file most prop dashboards export for your trades.",
      steps: ["Export trade history", "Upload the file", "Cova turns rows into risk notes"],
    },
  },
  {
    num: "03",
    eyebrow: "Attach limits",
    title: "Pressure gets visible.",
    body: "Daily loss, sizing, drawdown, revenge trades, and repeat mistakes become plain warnings before the next session starts.",
    Icon: Gauge,
    metric: "Limits attached",
  },
  {
    num: "04",
    eyebrow: "Share the proof",
    title: "Discipline becomes portable.",
    body: "Cova packages the review into a clean Risk Passport you can share with a coach, partner, or community without exposing the full journal.",
    Icon: Fingerprint,
    metric: "Passport assembled",
  },
];

export function StoryStrip() {
  const storyRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: storyRef,
    offset: ["start start", "end end"],
  });

  return (
    <section ref={storyRef} className="scroll-story trade-proof-story relative bg-black">
      <div className="trade-proof-sticky">
        <div className="story-grain absolute inset-0" />
        <div className="trade-proof-ambient absolute inset-0" />
        <div className="trade-proof-layout relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-5 md:px-10 lg:grid-cols-[0.82fr_1.18fr] lg:px-14">
          <div className="trade-proof-copy">
            <p className="font-body text-xs font-medium uppercase tracking-[0.28em] text-[#b9f5df]/80">How Cova works</p>
            <div className="trade-proof-copy-stack">
              {proofStoryFrames.map((frame, index) => (
                <StoryCopyFrame frame={frame} index={index} key={frame.num} progress={scrollYProgress} total={proofStoryFrames.length} />
              ))}
            </div>
            <div className="trade-proof-timeline" aria-hidden="true">
              <motion.div className="trade-proof-timeline-fill" style={{ scaleX: scrollYProgress }} />
            </div>
          </div>

          <div className="trade-proof-scene-wrap" aria-label="Animated trade review and Risk Passport assembly">
            <Suspense fallback={<TradeProofFallback />}>
              <TradeProofThreeStory progress={scrollYProgress} />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="trade-proof-mobile relative px-5 py-24 md:hidden">
        <p className="font-body text-xs uppercase tracking-[0.16em] text-[#b9f5df]/80">How Cova works</p>
        <h2 className="mt-5 font-heading text-5xl italic leading-[1.02] tracking-normal">From trade history to proof.</h2>
        <div className="mt-9">
          <TradeProofFallback compact />
        </div>
        <div className="mt-10 grid gap-5">
          {proofStoryFrames.map((frame) => (
            <motion.article
              className="trade-proof-mobile-card"
              key={frame.num}
              initial={{ opacity: 0, y: 28 }}
              transition={{ duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
              viewport={{ once: true, margin: "-80px" }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="font-heading text-4xl italic leading-none text-white/24">{frame.num}</span>
                <frame.Icon className="h-5 w-5 text-[#18c887]" />
              </div>
              <p className="mt-5 font-body text-[11px] uppercase tracking-[0.22em] text-[#b9f5df]/70">{frame.eyebrow}</p>
              <h3 className="mt-2 font-body text-xl font-medium">{frame.title}</h3>
              <p className="mt-2 font-body text-sm font-light leading-relaxed text-white/58">{frame.body}</p>
              {frame.csvHelp && <CsvExplainer body={frame.csvHelp.body} steps={frame.csvHelp.steps} compact />}
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function StoryCopyFrame({ frame, index, progress, total }: { frame: StoryFrame; index: number; progress: MotionValue<number>; total: number }) {
  const opacity = useTransform(progress, (latest) => {
    const distance = Math.abs(latest * (total - 1) - index);
    const raw = clampNumber(1 - distance * 1.25, 0, 1);
    return raw * raw * (3 - 2 * raw);
  });
  const y = useTransform(progress, (latest) => (index - latest * (total - 1)) * 24);
  const scale = useTransform(progress, (latest) => {
    const distance = Math.abs(latest * (total - 1) - index);
    return 0.985 + clampNumber(1 - distance, 0, 1) * 0.015;
  });

  return (
    <motion.article
      className="trade-proof-copy-frame"
      style={{ opacity, y, scale }}
    >
      <div className="flex items-center gap-4">
        <span className="font-heading text-7xl italic leading-none text-white/24">{frame.num}</span>
        <span className="story-step-button rounded-full border-white/16 bg-white/[0.025] px-4 py-2 font-body text-xs uppercase tracking-[0.16em] text-white/58">
          {frame.eyebrow}
        </span>
      </div>
      <h2 className="mt-6 max-w-3xl font-heading text-6xl italic leading-[0.94] tracking-normal text-white md:text-7xl xl:text-8xl">
        {frame.title}
      </h2>
      <p className="mt-6 max-w-xl font-body text-lg font-light leading-relaxed text-white/68">
        {frame.body}
      </p>
      {frame.csvHelp && <CsvExplainer body={frame.csvHelp.body} steps={frame.csvHelp.steps} compact />}
      <div className="mt-7 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.025] px-4 py-3">
        <frame.Icon className="h-4 w-4 text-[#18c887]" />
        <span className="font-body text-sm text-white/72">{frame.metric}</span>
      </div>
    </motion.article>
  );
}

function TradeProofFallback({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "trade-proof-fallback trade-proof-fallback-compact" : "trade-proof-fallback"}>
      <div className="trade-proof-fallback-row trade-proof-fallback-row-left" />
      <div className="trade-proof-fallback-passport">
        <span>COVA</span>
        <strong>Risk Passport</strong>
        <em>Trade history · Limits · Review notes</em>
      </div>
      <div className="trade-proof-fallback-layer trade-proof-fallback-layer-one" />
      <div className="trade-proof-fallback-layer trade-proof-fallback-layer-two" />
    </div>
  );
}
