import { analyze, formatMoney } from "../lib/risk";

export function MetricDock({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  const metrics = [
    ["Score", `${analysis.score}/100`],
    ["Reported P&L", formatMoney(analysis.totalPnl)],
    ["Biggest Dip", formatMoney(-analysis.maxDrawdown)],
    ["Profit Factor", Number.isFinite(analysis.profitFactor) ? analysis.profitFactor.toFixed(2) : "∞"],
    ["Average R", `${analysis.avgR.toFixed(2)}R`],
  ];
  return (
    <div className="mt-5 grid overflow-hidden rounded-[28px] border border-white/10 md:grid-cols-5">
      {metrics.map(([label, value]) => (
        <div className="border-b border-white/10 p-5 md:border-b-0 md:border-r last:border-r-0" key={label}>
          <p className="font-body text-sm text-white/62">{label}</p>
          <p className={`mt-3 font-mono text-3xl ${String(value).startsWith("-") ? "text-red-400" : "text-[#18c887]"}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

export function ScoreCard({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  return (
    <section className="risk-score-panel oa-squircle-card">
      <header className="oa-card-header">
        <h2>Cova Score</h2>
        <span>{analysis.evidenceQuality.label}</span>
      </header>
      <div className="oa-card-inset oa-score-inset">
        <div className="oa-score-reading">
          <p className="oa-score-value">{analysis.score}<span>/100</span></p>
          <p className="oa-score-caption">{analysis.score >= 80 ? "Strong risk discipline" : analysis.score >= 60 ? "Decent, with room to tighten" : "Risk needs attention"}</p>
          <p className="oa-score-sample">{analysis.trades.length} trades checked</p>
        </div>
        <div className="oa-factor-list">
          {analysis.scoreFactors.slice(0, 3).map((factor) => (
            <div className="oa-factor-row" key={factor.label}>
              <span>{factor.label}</span>
              <strong className={`oa-tone-${factor.impact}`}>{factor.impact}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FlagStack({ analysis, onReviewRisk }: { analysis: ReturnType<typeof analyze>; onReviewRisk: () => void }) {
  const fallbackItems = analysis.ruleStatuses.slice(0, 3).map((status) => ({
    id: status.rule.id,
    label: status.rule.name,
    status: status.breached ? "Review" : "Good",
    summary: status.evidence[0] ?? status.summary,
    tone: status.breached ? "text-red-400" : "text-emerald-400",
  }));
  const behaviorItems = analysis.behaviorFlags.map((flag) => ({
    id: flag.id,
    label: flag.label,
    status: flag.severity === "critical" ? "Pause" : flag.severity === "warning" ? "Watch" : flag.severity === "positive" ? "Good" : "Review",
    summary: flag.evidence[0] ?? flag.summary,
    tone: flag.severity === "critical" ? "text-red-300" : flag.severity === "warning" ? "text-amber-200" : flag.severity === "positive" ? "text-emerald-300" : "text-[#b9f5df]",
  }));
  const items = behaviorItems.length ? behaviorItems.slice(0, 3) : fallbackItems;
  return (
    <section className="risk-watch-panel oa-squircle-card">
      <header className="oa-card-header">
        <h2>What to watch</h2>
        <span>{items.length} items</span>
      </header>
      <div className="oa-card-inset oa-watch-inset">
        {items.map((item) => (
          <button
            aria-label={`Review ${item.label} in Limits`}
            className="oa-watch-row"
            data-dashboard-action="review-risk-evidence"
            key={item.id}
            onClick={onReviewRisk}
            type="button"
          >
            <span>{item.label}</span>
            <strong className={item.tone}>{item.status}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

export function SetupQuality({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  return (
    <div className="liquid-glass rounded-[36px] p-7">
      <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Setups</p>
      <div className="mt-5 space-y-4">
        {analysis.bySetup.slice(0, 4).map((setup) => (
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 font-body text-sm" key={setup.name}>
            <span>{setup.name}</span>
            <span className="text-white/50">{setup.count} trades</span>
            <span className={setup.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>{setup.avgR.toFixed(2)}R</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketExposure({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  const max = Math.max(...analysis.byMarket.map((market) => market.count), 1);
  return (
    <div className="liquid-glass rounded-[36px] p-7">
      <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Markets traded</p>
      <div className="mt-6 space-y-5">
        {analysis.byMarket.map((market) => (
          <div className="grid grid-cols-[48px_1fr_80px] items-center gap-4" key={market.name}>
            <span className="font-body text-lg">{market.name}</span>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#18c887]" style={{ width: `${(market.count / max) * 100}%` }} />
            </div>
            <span className={market.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>{formatMoney(market.pnl)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EquityCurve({ points }: { points: number[] }) {
  const width = 900;
  const height = 320;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 1);
  const range = max - min || 1;
  const coords = points.map((value, index) => {
    const x = (index / Math.max(1, points.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return [x, y];
  });
  const path = coords.map(([x, y], index) => `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg className="dashboard-equity-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Cumulative reported P&L equity curve">
      {[0.25, 0.5, 0.75].map((line) => <line key={line} x1="0" x2={width} y1={height * line} y2={height * line} className="dashboard-equity-gridline" />)}
      <path d={path} fill="none" className="dashboard-equity-path" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

