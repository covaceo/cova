import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useState } from "react";

type EvidenceStop = {
  id: "high-water" | "early-exits" | "off-plan" | "pressure-trade";
  index: string;
  title: string;
  shortLabel: string;
  time: string;
  trade: string;
  behavior: string;
  costDollars: string;
  costR: string;
  recurrence: string;
  whyItMatters: string;
  pathPosition: { x: number; y: number };
};

const EVIDENCE_STOPS: EvidenceStop[] = [
  {
    id: "high-water",
    index: "01",
    title: "High-water mark",
    shortLabel: "Peak",
    time: "09:52 ET",
    trade: "NQ · first sequence closed · +$920 session peak",
    behavior: "Risk stayed unchanged after the account reached its best point.",
    costDollars: "$640 surrendered",
    costR: "−1.2R from peak",
    recurrence: "3 of 5 green sessions gave back more than half",
    whyItMatters: "The account had already done enough. The later sequence converted a strong session into a fragile one.",
    pathPosition: { x: 244, y: 72 },
  },
  {
    id: "early-exits",
    index: "02",
    title: "Repeated early exits",
    shortLabel: "Early exits",
    time: "10:03 ET",
    trade: "NQ · long 2 · planned target 0.9R",
    behavior: "Two planned trades were closed before price reached either the stop or target.",
    costDollars: "$410 left behind",
    costR: "0.8R opportunity cost",
    recurrence: "4 exits before 0.5R across the sample",
    whyItMatters: "Small wins reduced immediate pressure, but they left the session dependent on more decisions later.",
    pathPosition: { x: 430, y: 142 },
  },
  {
    id: "off-plan",
    index: "03",
    title: "Off-plan entry",
    shortLabel: "Off-plan",
    time: "10:17 ET",
    trade: "NQ · short 3 · no setup tag",
    behavior: "The entry followed a loss and did not match either setup used earlier in the session.",
    costDollars: "−$525",
    costR: "−1.0R",
    recurrence: "2 entries without a sample setup tag",
    whyItMatters: "The loss came from a decision the plan did not define, so the account absorbed risk without comparable evidence.",
    pathPosition: { x: 642, y: 238 },
  },
  {
    id: "pressure-trade",
    index: "04",
    title: "Pressure trade",
    shortLabel: "Pressure",
    time: "10:31 ET",
    trade: "NQ · long 5 · largest size of session",
    behavior: "Size increased after the account fell below the opening balance.",
    costDollars: "−$875",
    costR: "−1.7R",
    recurrence: "3 size increases while the sample was below peak",
    whyItMatters: "The largest exposure arrived when decision quality was already under pressure, accelerating the final drawdown.",
    pathPosition: { x: 826, y: 304 },
  },
];

const FINAL_RULE = "After reaching +1.5R, stop for 20 minutes before any new entry.";
const FINAL_STEP = EVIDENCE_STOPS.length + 1;
const REVEAL_BY_STEP = [4, 27, 47, 67, 86, 100];

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

export default function RiskReplayPreview() {
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const reducedMotion = useReducedMotion();
  const activeEvidence = step > 0 && step < FINAL_STEP ? EVIDENCE_STOPS[step - 1] : null;
  const progress = REVEAL_BY_STEP[step];

  const valueText = useMemo(() => {
    if (step === 0) return "Replay ready";
    if (step === FINAL_STEP) return "Replay complete";
    return `Evidence ${step} of ${EVIDENCE_STOPS.length}: ${EVIDENCE_STOPS[step - 1].title}`;
  }, [step]);

  useEffect(() => {
    if (!isPlaying) return;
    if (step >= FINAL_STEP) {
      setIsPlaying(false);
      return;
    }

    const delay = step === 0 ? 620 : 1750;
    const timer = window.setTimeout(() => {
      setStep((current) => Math.min(current + 1, FINAL_STEP));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [isPlaying, step]);

  function selectStep(nextStep: number) {
    setIsPlaying(false);
    setStep(Math.max(0, Math.min(nextStep, FINAL_STEP)));
  }

  function startReplay() {
    setStep(reducedMotion ? 1 : 0);
    setIsPlaying(!reducedMotion);
  }

  function toggleReplay() {
    if (step >= FINAL_STEP) {
      startReplay();
      return;
    }
    setIsPlaying((current) => !current);
  }

  function handleStageKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectStep(step + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectStep(step - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectStep(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectStep(FINAL_STEP);
    } else if (event.key === " ") {
      event.preventDefault();
      toggleReplay();
    }
  }

  return (
    <div className="risk-replay-preview">
      <a className="replay-skip-link" href="#replay-evidence">Skip to replay evidence</a>

      <header className="replay-header">
        <div className="replay-brand" aria-label="Cova Risk Replay">
          <span className="replay-mark" aria-hidden="true">C</span>
          <span>COVA</span>
          <span className="replay-brand-divider" aria-hidden="true" />
          <span className="replay-product-name">RISK REPLAY</span>
        </div>
        <div className="replay-truth-labels" aria-label="Data provenance">
          <span>SAMPLE</span>
          <span>ILLUSTRATIVE DATA</span>
        </div>
      </header>

      <main className="replay-main">
        <section className="replay-intro" aria-labelledby="replay-title">
          <div>
            <p className="replay-context">ACCOUNT PATH · SIM-042 · 18 TRADES</p>
            <h1 id="replay-title">The curve shows where discipline broke.</h1>
          </div>
          <div className="replay-intro-action">
            <p>Step through one fabricated account path and inspect the cost behind each turn.</p>
            <button className="replay-primary-action" type="button" onClick={startReplay}>
              <span>{step === FINAL_STEP ? "Replay again" : "Replay this account"}</span>
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </section>

        <section
          className="replay-workbench"
          aria-label="Interactive sample account replay"
          onKeyDown={handleStageKeyDown}
          tabIndex={0}
        >
          <div className="replay-path-panel">
            <div className="replay-path-meta">
              <div>
                <span>ILLUSTRATIVE EQUITY</span>
                <strong>$49,480</strong>
              </div>
              <div>
                <span>SESSION CHANGE</span>
                <strong>−$520</strong>
              </div>
              <div>
                <span>PEAK TO CLOSE</span>
                <strong>−$1,440</strong>
              </div>
            </div>

            <div
              className="replay-chart"
              style={{ "--path-progress": progress } as CSSProperties}
              data-step={step}
            >
              <div className="replay-axis-label replay-axis-label-top">$50,920</div>
              <div className="replay-axis-label replay-axis-label-base">$50,000</div>
              <div className="replay-axis-label replay-axis-label-bottom">$49,480</div>

              <svg
                aria-label="Illustrative equity path from fifty thousand dollars to forty-nine thousand four hundred eighty dollars"
                className="replay-path-svg"
                preserveAspectRatio="none"
                role="img"
                viewBox="0 0 1000 360"
              >
                <defs>
                  <pattern id="replay-grid" width="100" height="72" patternUnits="userSpaceOnUse">
                    <path d="M 100 0 L 0 0 0 72" fill="none" stroke="currentColor" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect className="replay-grid" width="1000" height="360" fill="url(#replay-grid)" />
                <line className="replay-opening-line" x1="0" x2="1000" y1="186" y2="186" />
                <path
                  className="replay-path-ghost"
                  d="M0 188 C62 180 94 126 142 132 C182 136 202 74 244 72 C288 70 318 112 352 106 C384 100 398 152 430 142 C468 130 494 190 532 180 C570 170 596 222 642 238 C682 252 712 204 748 218 C782 232 798 294 826 304 C862 318 894 276 924 290 C950 300 970 320 1000 326"
                  pathLength="100"
                />
                <path
                  className="replay-path-live"
                  d="M0 188 C62 180 94 126 142 132 C182 136 202 74 244 72 C288 70 318 112 352 106 C384 100 398 152 430 142 C468 130 494 190 532 180 C570 170 596 222 642 238 C682 252 712 204 748 218 C782 232 798 294 826 304 C862 318 894 276 924 290 C950 300 970 320 1000 326"
                  pathLength="100"
                />
                {EVIDENCE_STOPS.map((evidence, index) => {
                  const evidenceStep = index + 1;
                  const state = step === evidenceStep ? "active" : step > evidenceStep ? "seen" : "pending";
                  return (
                    <g className="replay-marker" data-state={state} key={evidence.id}>
                      <circle cx={evidence.pathPosition.x} cy={evidence.pathPosition.y} r="16" />
                      <circle cx={evidence.pathPosition.x} cy={evidence.pathPosition.y} r="4" />
                      <text x={evidence.pathPosition.x} y={evidence.pathPosition.y - 26} textAnchor="middle">
                        {evidence.index}
                      </text>
                    </g>
                  );
                })}
                <g className="replay-end-marker" data-state={step === FINAL_STEP ? "active" : "pending"}>
                  <rect x="986" y="312" width="14" height="28" />
                </g>
              </svg>

              <div className="replay-chart-caption">
                <span>09:30</span>
                <span>10:00</span>
                <span>10:30</span>
                <span>11:00 ET</span>
              </div>
            </div>
          </div>

          <aside className="replay-evidence" id="replay-evidence" aria-live="polite">
            {step === 0 && (
              <div className="replay-entry-state">
                <p className="replay-state-index">00 / READY</p>
                <h2>Read the decisions inside the line.</h2>
                <p className="replay-state-summary">
                  This dossier uses a fabricated session to show how account shape can reveal repeated behavior.
                </p>
                <dl className="replay-entry-ledger">
                  <div><dt>Source</dt><dd>Fabricated sample</dd></div>
                  <div><dt>Opening balance</dt><dd>$50,000</dd></div>
                  <div><dt>Session peak</dt><dd>$50,920</dd></div>
                  <div><dt>Closing balance</dt><dd>$49,480</dd></div>
                </dl>
                <p className="replay-keyboard-hint">Arrow keys step · Space plays · Home resets</p>
              </div>
            )}

            {activeEvidence && (
              <article className="replay-evidence-state" data-evidence-stop={activeEvidence.id} key={activeEvidence.id}>
                <div className="replay-evidence-heading">
                  <p className="replay-state-index">{activeEvidence.index} / EVIDENCE · {activeEvidence.time}</p>
                  <h2>{activeEvidence.title}</h2>
                </div>
                <div className="replay-trade-line">
                  <span>SAMPLE TRADE</span>
                  <strong>{activeEvidence.trade}</strong>
                </div>
                <dl className="replay-evidence-ledger">
                  <div className="replay-ledger-wide">
                    <dt>Behavior</dt>
                    <dd>{activeEvidence.behavior}</dd>
                  </div>
                  <div>
                    <dt>Cost</dt>
                    <dd>{activeEvidence.costDollars}</dd>
                  </div>
                  <div>
                    <dt>Risk</dt>
                    <dd>{activeEvidence.costR}</dd>
                  </div>
                  <div className="replay-ledger-wide">
                    <dt>Recurrence</dt>
                    <dd>{activeEvidence.recurrence}</dd>
                  </div>
                </dl>
                <div className="replay-why">
                  <span>WHY IT MATTERS</span>
                  <p>{activeEvidence.whyItMatters}</p>
                </div>
              </article>
            )}

            {step === FINAL_STEP && (
              <div className="replay-final-state">
                <p className="replay-state-index">05 / REPLAY COMPLETE</p>
                <h2>One rule carries forward.</h2>
                <div className="replay-final-rule" data-final-rule>
                  <span>NEXT SESSION RULE</span>
                  <strong>{FINAL_RULE}</strong>
                </div>
                <div className="replay-passport-impact">
                  <span>SAMPLE PASSPORT IMPACT</span>
                  <div>
                    <p>Discipline signal</p>
                    <strong>58 / 100</strong>
                  </div>
                  <div>
                    <p>High-water protection</p>
                    <strong>−8 points</strong>
                  </div>
                  <small>Illustrative outcome only · not account verification</small>
                </div>
              </div>
            )}
          </aside>
        </section>

        <section className="replay-transport" aria-label="Replay controls">
          <div className="replay-transport-actions">
            <button type="button" onClick={() => selectStep(step - 1)} disabled={step === 0} aria-label="Previous replay state">
              ←
            </button>
            <button className="replay-play-toggle" type="button" onClick={toggleReplay} aria-pressed={isPlaying}>
              {isPlaying ? "Pause replay" : step === FINAL_STEP ? "Replay again" : "Play replay"}
            </button>
            <button type="button" onClick={() => selectStep(step + 1)} disabled={step === FINAL_STEP} aria-label="Next replay state">
              →
            </button>
          </div>

          <div className="replay-scrubber">
            <label htmlFor="replay-position">REPLAY POSITION</label>
            <input
              id="replay-position"
              type="range"
              min="0"
              max={FINAL_STEP}
              step="1"
              value={step}
              aria-valuemin={0}
              aria-valuemax={FINAL_STEP}
              aria-valuenow={step}
              aria-valuetext={valueText}
              onChange={(event) => selectStep(Number(event.target.value))}
              style={{ "--scrub-progress": `${(step / FINAL_STEP) * 100}%` } as CSSProperties}
            />
            <div className="replay-stop-labels" aria-hidden="true">
              <span>Ready</span>
              {EVIDENCE_STOPS.map((evidence) => <span key={evidence.id}>{evidence.shortLabel}</span>)}
              <span>Rule</span>
            </div>
          </div>

          <output className="replay-position-readout" aria-live="polite">
            <span>{String(step).padStart(2, "0")}</span>
            <small>/ {String(FINAL_STEP).padStart(2, "0")}</small>
          </output>
        </section>
      </main>

      <footer className="replay-footer">
        <span>COVA CONCEPT PREVIEW</span>
        <span>All account and trade details are fabricated for illustration.</span>
      </footer>
    </div>
  );
}
