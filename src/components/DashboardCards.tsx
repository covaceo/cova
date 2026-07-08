import { analyze, formatMoney } from "../lib/risk";

export function MetricDock({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  const metrics = [
    ["Score", `${analysis.score}/100`],
    ["Net P&L", formatMoney(analysis.totalPnl)],
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
    <div className="risk-score-panel p-6">
      <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Cova Score</p>
      <p className="mt-4 font-mono text-7xl text-[#18c887]">{analysis.score}<span className="text-2xl text-white/55">/100</span></p>
      <p className="mt-3 font-body text-sm text-white/55">{analysis.score >= 80 ? "Strong risk discipline" : analysis.score >= 60 ? "Decent, with room to tighten" : "Risk needs attention"}</p>
      <p className="mt-3 w-fit rounded-full border border-white/10 bg-black/24 px-3 py-1.5 font-body text-xs text-white/42">
        {analysis.evidenceQuality.label} | {analysis.trades.length} trades checked
      </p>
      <div className="mt-5 space-y-2">
        {analysis.scoreFactors.slice(0, 3).map((factor) => (
          <div className="rounded-[18px] border border-white/10 bg-black/20 p-3" key={factor.label}>
            <div className="flex items-center justify-between gap-3">
              <p className="font-body text-sm font-medium text-white/78">{factor.label}</p>
              <span className={`font-mono text-[10px] uppercase tracking-[0.16em] ${factor.impact === "positive" ? "text-emerald-300" : factor.impact === "negative" ? "text-red-300" : "text-white/38"}`}>
                {factor.impact}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FlagStack({ analysis }: { analysis: ReturnType<typeof analyze> }) {
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
    <div className="risk-watch-panel p-6">
      <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">What to watch</p>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div className="border-b border-white/10 py-3 last:border-b-0" key={item.id}>
            <div className="flex items-center justify-between gap-4">
              <span className="font-body text-sm text-white/75">{item.label}</span>
              <span className={item.tone}>{item.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
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
    <svg className="mt-8 h-[320px] w-full overflow-visible rounded-[28px] border border-white/10 bg-black/28 p-5" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="curve" x1="0" x2="1" y1="0" y2="0">
          <stop stopColor="#b9f5df" />
          <stop offset="1" stopColor="#075f44" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((line) => <line key={line} x1="0" x2={width} y1={height * line} y2={height * line} stroke="rgba(255,255,255,.10)" strokeDasharray="6 8" />)}
      <path d={path} fill="none" stroke="url(#curve)" strokeWidth="4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

