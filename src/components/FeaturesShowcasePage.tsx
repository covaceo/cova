import { motion, useReducedMotion } from "motion/react";
import { PublicPassportExampleCard } from "./PublicPassportExampleCard";
import { FeaturesTabHighlight } from "./FeaturesTabHighlight";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  ClipboardCheck,
  Fingerprint,
  Gauge,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { StartFreeButton } from "./StartFreeButton";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "passport";
type AuthMode = "login" | "signup";
type FeatureId = "trade-journal" | "risk-review" | "limits" | "insights" | "passport";
type FeatureIcon = typeof Gauge;

const OA_LAYOUT_SPRING = { type: "spring", stiffness: 550, damping: 40 } as const;
const OA_PANEL_VARIANTS = {
  enter: (direction: number) => ({ x: direction * 12 }),
  center: { x: 0 },
};

type FeatureSystem = {
  id: FeatureId;
  label: string;
  route: Section;
  action: string;
  outcome: string;
  summary: string;
  evidence: [string, string];
  trust: string;
  Icon: FeatureIcon;
};

const featureSystems = [
  {
    id: "trade-journal",
    label: "Trade Journal",
    route: "import",
    action: "Upload trades",
    outcome: "Keep one clean record of what actually happened.",
    summary: "Bring completed trades into one review trail with source, execution, notes, and setup context intact.",
    evidence: ["CSV-first import with a review step", "Trade rows stay tied to their source"],
    trust: "Cova reviews imported history. It does not place orders or move money.",
    Icon: BookOpen,
  },
  {
    id: "risk-review",
    label: "Risk Review",
    route: "dashboard",
    action: "Review account",
    outcome: "See the habit costing the account.",
    summary: "Turn imported history into a focused account review with performance, drawdown, and rule evidence in one place.",
    evidence: ["Reported P&L and drawdown context", "Rule warnings linked to reviewed history"],
    trust: "Sample review shown. Actual results come only from the member's imported history.",
    Icon: Gauge,
  },
  {
    id: "limits",
    label: "Limits",
    route: "rules",
    action: "Set limits",
    outcome: "Turn repeated mistakes into visible guardrails.",
    summary: "Set review thresholds for daily loss, trade loss, size, streaks, and consistency, then re-check the history against them.",
    evidence: ["Editable retrospective thresholds", "Historical warnings remain visible"],
    trust: "Limits review history. They do not block orders or alter broker settings.",
    Icon: SlidersHorizontal,
  },
  {
    id: "insights",
    label: "Insights",
    route: "coach",
    action: "See insights",
    outcome: "Know what deserves review before the next session.",
    summary: "Read one direct briefing that names the active problem, shows the evidence, and points back to the relevant guardrail.",
    evidence: ["Evidence-linked review notes", "No signals or live-trading permission"],
    trust: "Insights summarize reviewed history. They are not financial advice or trade calls.",
    Icon: ClipboardCheck,
  },

  {
    id: "passport",
    label: "Passport",
    route: "passport",
    action: "Open Passport",
    outcome: "Build proof of discipline worth sharing.",
    summary: "Turn one reviewed account into a privacy-aware credential that balances reported gains with rule and discipline evidence.",
    evidence: ["Editable privacy and share modes", "Exportable sample or member review proof"],
    trust: "Sample preview shown. A member Passport reflects only that member's reviewed data and settings.",
    Icon: Fingerprint,
  },
] satisfies FeatureSystem[];

function InstrumentHeader({ label, meta }: { label: string; meta: string }) {
  return (
    <header className="features-instrument-header">
      <div>
        <span className="features-instrument-status-dot" />
        <strong>{label}</strong>
      </div>
      <span>{meta}</span>
    </header>
  );
}

function TradeJournalInstrument() {
  const rows = [
    ["AUG 18", "NQ", "LONG", "2", "+$420", "Reviewed"],
    ["AUG 18", "MNQ", "SHORT", "4", "-$180", "Flagged"],
    ["AUG 19", "ES", "LONG", "1", "+$260", "Reviewed"],
    ["AUG 20", "NQ", "LONG", "2", "+$110", "Needs note"],
  ];
  return (
    <div className="features-instrument features-journal-instrument">
      <InstrumentHeader label="SAMPLE IMPORT" meta="CSV · 4 ROWS" />
      <div className="features-journal-source">
        <div>
          <span>Import source</span>
          <strong>Completed trades</strong>
        </div>
        <div>
          <span>Review state</span>
          <strong>3 of 4 ready</strong>
        </div>
      </div>
      <div className="features-journal-table" data-journal-scroll role="table" aria-label="Scrollable sample imported trade rows" tabIndex={0}>
        <div className="features-journal-row features-journal-row-head" role="row">
          {['Date', 'Market', 'Side', 'Qty', 'Reported P&L', 'Review'].map((cell) => <span role="columnheader" key={cell}>{cell}</span>)}
        </div>
        {rows.map((row) => (
          <div className="features-journal-row" role="row" key={`${row[0]}-${row[1]}-${row[4]}`}>
            {row.map((cell, index) => <span role="cell" data-negative={cell.startsWith('-') || undefined} key={`${cell}-${index}`}>{cell}</span>)}
          </div>
        ))}
      </div>
      <footer className="features-instrument-footer">
        <span>IMPORTED HISTORY</span>
        <span>Notes and setup context stay attached to each row.</span>
      </footer>
    </div>
  );
}

function RiskReviewInstrument() {
  return (
    <div className="features-instrument features-risk-instrument">
      <InstrumentHeader label="SAMPLE REVIEW" meta="LAST 20 TRADES" />
      <div className="features-risk-metrics">
        <div><span>Reported P&L</span><strong>+$1,640</strong><small>sample value</small></div>
        <div><span>Profit factor</span><strong>1.48</strong><small>review range</small></div>
        <div><span>Max drawdown</span><strong data-negative="true">-$620</strong><small>sample value</small></div>
      </div>
      <div className="features-risk-canvas">
        <div className="features-risk-chart">
          <div className="features-chart-labels"><span>$1.8k</span><span>$900</span><span>$0</span></div>
          <svg aria-hidden="true" viewBox="0 0 560 220" preserveAspectRatio="none">
            <defs>
              <linearGradient id="features-risk-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f7dff" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#4f7dff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="features-risk-area" d="M0,194 L38,180 L74,186 L112,156 L150,146 L188,164 L226,124 L264,134 L302,96 L340,110 L378,72 L416,86 L454,52 L492,64 L530,34 L560,42 L560,220 L0,220 Z" />
            <path className="features-risk-line" d="M0,194 L38,180 L74,186 L112,156 L150,146 L188,164 L226,124 L264,134 L302,96 L340,110 L378,72 L416,86 L454,52 L492,64 L530,34 L560,42" />
            <line className="features-drawdown-line" x1="0" x2="560" y1="164" y2="164" />
          </svg>
          <span className="features-chart-event" style={{ left: '31%', top: '57%' }}>SIZE DRIFT</span>
          <span className="features-chart-event" style={{ left: '67%', top: '33%' }}>RECOVERY</span>
        </div>
        <div className="features-risk-ledger">
          <div className="features-ledger-title"><span>Rule warnings</span><strong>02</strong></div>
          <div className="features-warning-row"><AlertTriangle aria-hidden="true" /><div><strong>Daily loss warning</strong><span>1 reviewed session</span></div></div>
          <div className="features-warning-row"><AlertTriangle aria-hidden="true" /><div><strong>Size drift</strong><span>3 reviewed trades</span></div></div>
          <div className="features-review-state"><span>Review state</span><strong>Needs attention</strong></div>
        </div>
      </div>
      <footer className="features-instrument-footer">
        <span>IMPORTED HISTORY</span>
        <span>Metrics and warnings are illustrative until a member imports data.</span>
      </footer>
    </div>
  );
}

function LimitsInstrument() {
  const rows = [
    ["Daily loss", "$500", "1 warning in history"],
    ["Single trade loss", "$220", "Not breached"],
    ["Maximum size", "2 contracts", "3 warnings in history"],
    ["Loss streak", "3 trades", "Not breached"],
  ];
  return (
    <div className="features-instrument features-limits-instrument">
      <InstrumentHeader label="SAMPLE LIMIT SET" meta="RETROSPECTIVE REVIEW" />
      <div className="features-limits-summary">
        <div><span>Active thresholds</span><strong>04</strong></div>
        <div><span>Warnings found</span><strong>04</strong></div>
        <p>Changing a threshold re-checks imported history. It does not rewrite a trade.</p>
      </div>
      <div className="features-limits-ledger">
        <div className="features-limits-row features-limits-row-head"><span>Guardrail</span><span>Threshold</span><span>History check</span></div>
        {rows.map(([name, value, state]) => (
          <div className="features-limits-row" key={name}>
            <span>{name}</span><strong>{value}</strong><span data-warning={state.includes('warning') || undefined}>{state}</span>
          </div>
        ))}
      </div>
      <footer className="features-instrument-footer"><span>REVIEW THRESHOLDS</span><span>No broker or order enforcement.</span></footer>
    </div>
  );
}

function InsightsInstrument() {
  return (
    <div className="features-instrument features-insights-instrument">
      <InstrumentHeader label="SAMPLE REVIEW NOTE" meta="EVIDENCE-LINKED" />
      <div className="features-insight-priority">
        <span>Current risk review</span>
        <h3>Size increased after the first losing trade.</h3>
        <p>The largest reviewed loss came after quantity moved above the session baseline.</p>
      </div>
      <div className="features-insight-grid">
        <div><span>Evidence</span><strong>3 imported trades</strong><p>Quantity moved from 1 to 2 contracts after the first loss.</p></div>
        <div><span>Review next</span><strong>Maximum size threshold</strong><p>Compare the warning against the active Limits review.</p></div>
      </div>
      <div className="features-insight-action"><span>Review note</span><strong>Check size drift before the next session review.</strong></div>
      <footer className="features-instrument-footer"><span>IMPORTED HISTORY</span><span>No signals, trade permission, or financial advice.</span></footer>
    </div>
  );
}


function PassportInstrument({ active }: { active: boolean }) {
  return (
    <div className="features-instrument features-passport-instrument">
      <InstrumentHeader label="SAMPLE / NOT VERIFIED" meta="RISK PASSPORT" />
      <div className="features-passport-preview"><PublicPassportExampleCard active={active} /></div>
      <footer className="features-instrument-footer"><span>SAMPLE REVIEW</span><span>Member exports use that member's reviewed data and privacy settings.</span></footer>
    </div>
  );
}

function FeatureInstrument({ featureId, active }: { featureId: FeatureId; active: boolean }) {
  if (featureId === "trade-journal") return <TradeJournalInstrument />;
  if (featureId === "limits") return <LimitsInstrument />;
  if (featureId === "insights") return <InsightsInstrument />;
  if (featureId === "passport") return <PassportInstrument active={active} />;
  return <RiskReviewInstrument />;
}

export function FeaturesPage({ go, openAuth, isSignedIn = false }: { go: (section: Section) => void; openAuth: (mode: AuthMode) => void; isSignedIn?: boolean }) {
  const [activeId, setActiveId] = useState<FeatureId>("risk-review");
  const [compactTabs, setCompactTabs] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  const reduceMotion = useReducedMotion();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeFeature = featureSystems.find((feature) => feature.id === activeId) ?? featureSystems[1];
  const activeIndex = featureSystems.indexOf(activeFeature);
  const previousIndexRef = useRef(activeIndex);
  const direction = activeIndex >= previousIndexRef.current ? 1 : -1;
  const layoutTransition = reduceMotion ? { duration: 0 } : OA_LAYOUT_SPRING;

  useEffect(() => {
    previousIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const syncOrientation = () => setCompactTabs(query.matches);
    query.addEventListener("change", syncOrientation);
    syncOrientation();
    return () => query.removeEventListener("change", syncOrientation);
  }, []);

  function selectFeature(id: FeatureId, index?: number) {
    setActiveId(id);
    const tab = tabRefs.current[index ?? featureSystems.findIndex((feature) => feature.id === id)];
    if (typeof index === "number") tab?.focus({ preventScroll: true });
    const rail = tab?.parentElement;
    if (compactTabs && tab && rail) {
      const target = tab.getBoundingClientRect(), bounds = rail.getBoundingClientRect();
      const delta = target.left < bounds.left ? target.left - bounds.left : target.right > bounds.right ? target.right - bounds.right : 0;
      if (delta) rail.scrollBy({ left: delta, behavior: "instant" });
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = (index + 1) % featureSystems.length;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = (index - 1 + featureSystems.length) % featureSystems.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = featureSystems.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectFeature(featureSystems[nextIndex].id, nextIndex);
  }

  return (
    <section className="features-showcase-page" data-features-showcase>
      <span aria-hidden="true" className="features-showcase-atmosphere" />
      <div className="features-showcase-inner">
        <header className="features-showcase-intro">
          <div>
            <h1><span>One account.</span> <em>One review system.</em></h1>
            <p>Cova turns trade history into risk review, guardrails, insights, and proof.</p>
          </div>
          <StartFreeButton icon onClick={() => isSignedIn ? go("dashboard") : openAuth("signup")}>
            {isSignedIn ? "Open dashboard" : "Sign up"}
          </StartFreeButton>
        </header>

        <div className="features-showcase-frame">
          <div className="features-showcase-layout">
            <nav className="features-system-rail" aria-label="Cova product systems" role="tablist" aria-orientation={compactTabs ? "horizontal" : "vertical"}>
              <FeaturesTabHighlight activeId={activeId} />
              {featureSystems.map((feature, index) => {
                const isActive = activeFeature.id === feature.id;
                const Icon = feature.Icon;
                return (
                  <button
                    aria-controls={`feature-panel-${feature.id}`}
                    aria-selected={isActive}
                    className="features-system-tab"
                    id={`feature-tab-${feature.id}`}
                    key={feature.id}
                    onClick={() => selectFeature(feature.id)}
                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                    ref={(node) => { tabRefs.current[index] = node; }}
                    role="tab"
                    tabIndex={isActive ? 0 : -1}
                    type="button"
                  >
                    <span className="features-system-tab-index">{String(index + 1).padStart(2, "0")}</span>
                    <Icon aria-hidden="true" />
                    <strong>{feature.label}</strong>
                  </button>
                );
              })}
            </nav>

            <div
              aria-labelledby={`feature-tab-${activeFeature.id}`}
              aria-live="polite"
              className="features-instrument-shell"
              data-feature-instrument={activeFeature.id}
              id={`feature-panel-${activeFeature.id}`}
              role="tabpanel"
              tabIndex={0}
            >
              {/* Intrinsic grid reservations keep the frame stable at every width.
                  Inactive slots cannot paint, receive focus or expose stale proof. */}
              {featureSystems.map((feature) => {
                const isActive = feature.id === activeFeature.id;
                return <div className="features-instrument-slot" data-active={isActive} aria-hidden={!isActive} key={feature.id} ref={(node) => { node?.toggleAttribute("inert", !isActive); }}>
                  <motion.div
                    animate="center"
                    className="features-instrument-transition"
                    custom={direction}
                    initial={reduceMotion || !isActive ? false : "enter"}
                    key={`${feature.id}-${isActive}`}
                    transition={layoutTransition}
                    variants={OA_PANEL_VARIANTS}
                  >
                    <FeatureInstrument featureId={feature.id} active={isActive} />
                  </motion.div>
                </div>;
              })}
            </div>

            <aside className="features-outcome-reservation" aria-live="polite">
              {featureSystems.map((feature) => {
                const isActive = feature.id === activeFeature.id;
                return <div className="features-outcome-panel features-outcome-content" data-active={isActive} aria-hidden={!isActive} key={feature.id} ref={(node) => { node?.toggleAttribute("inert", !isActive); }}>
                  <h2>{feature.outcome}</h2>
                  <p>{feature.summary}</p>
                  <ul>{feature.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
                  <button className="features-outcome-action" onClick={() => go(feature.route)} type="button">
                    {feature.action}<ArrowUpRight aria-hidden="true" />
                  </button>
                  <small>{feature.trust}</small>
                </div>;
              })}
            </aside>
          </div>
        </div>

        <footer className="features-showcase-trust">
          <span>Cova reviews history only. No orders. No money movement.</span>
          <span>Sample instruments · actual member results require imported history</span>
        </footer>
      </div>
    </section>
  );
}
