import {
  BarChart3,
  CalendarDays,
  ChartCandlestick,
  ClipboardCheck,
  Goal,
  LayoutDashboard,
  Settings2,
  Target,
} from "lucide-react";

const navigation = [
  { icon: LayoutDashboard, label: "Overview", active: true },
  { icon: ChartCandlestick, label: "Trades", active: false },
  { icon: CalendarDays, label: "Calendar", active: false },
  { icon: BarChart3, label: "Insights", active: false },
  { icon: Goal, label: "Goals", active: false },
  { icon: ClipboardCheck, label: "Review", active: false },
] as const;

const metrics = [
  { label: "Net P&L", value: "+$4,820", tone: "positive" },
  { label: "Win rate", value: "61%", tone: "neutral" },
  { label: "Risk score", value: "82", tone: "neutral" },
  { label: "Rules kept", value: "74%", tone: "positive" },
] as const;

const chartValues = [58, 64, 69, 61, 56, 52, 49, 55, 62, 70, 76, 68, 61, 66, 72, 79, 84, 75, 67, 63, 69, 73, 78, 82, 76, 71, 67, 64];

const recentTrades = [
  ["ES", "Long", "+$320"],
  ["NQ", "Short", "-$180"],
  ["GC", "Long", "+$410"],
  ["MES", "Long", "+$95"],
] as const;

export function FooterPerformanceProof() {
  return (
    <div aria-hidden="true" className="footer-performance-proof">
      <aside className="footer-performance-rail">
        <div className="footer-performance-brand">COVA</div>
        <nav>
          {navigation.map(({ active, icon: Icon, label }) => (
            <span className={active ? "is-active" : undefined} key={label}>
              <Icon />
              {label}
            </span>
          ))}
        </nav>
        <div className="footer-performance-rail-bottom">
          <span><Settings2 /> Settings</span>
          <span className="footer-performance-user"><i>AR</i> Alex R.</span>
        </div>
      </aside>

      <div className="footer-performance-workspace">
        <header>
          <div>
            <strong>Performance</strong>
            <span>Sample account</span>
          </div>
          <div className="footer-performance-range" aria-hidden="true">
            <span>1W</span><span className="is-active">1M</span><span>3M</span><span>1Y</span><span>All</span>
          </div>
        </header>

        <div className="footer-performance-metrics">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <span>{metric.label}</span>
              <strong className={metric.tone === "positive" ? "is-positive" : undefined}>{metric.value}</strong>
            </div>
          ))}
        </div>

        <div className="footer-performance-chart">
          <div className="footer-performance-chart-grid" />
          <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 560 180">
            {chartValues.slice(1).map((close, index) => {
              const open = chartValues[index];
              const x = 14 + index * 20;
              const high = Math.max(open, close) + 7 + (index % 3);
              const low = Math.min(open, close) - 7 - (index % 2);
              const up = close >= open;
              const scaleY = (value: number) => 166 - value * 1.55;
              const bodyTop = scaleY(Math.max(open, close));
              const bodyHeight = Math.max(4, Math.abs(scaleY(open) - scaleY(close)));
              return (
                <g className={up ? "is-up" : "is-down"} key={`${x}-${close}`}>
                  <line x1={x} x2={x} y1={scaleY(high)} y2={scaleY(low)} />
                  <rect height={bodyHeight} rx="1" width="9" x={x - 4.5} y={bodyTop} />
                </g>
              );
            })}
          </svg>
        </div>

        <div className="footer-performance-lower">
          <section className="footer-performance-trades">
            <strong>Recent trades</strong>
            {recentTrades.map(([symbol, side, result]) => (
              <div key={`${symbol}-${result}`}>
                <span>{symbol}</span><span>{side}</span><b className={result.startsWith("+") ? "is-positive" : "is-negative"}>{result}</b>
              </div>
            ))}
          </section>

          <section className="footer-performance-journal">
            <strong>Daily journal</strong>
            <span>Execution grade</span>
            <b aria-label="5 out of 5 stars">★★★★★</b>
            <small>Main note<br />Waited for A+ setup.</small>
          </section>

          <section className="footer-performance-risk">
            <strong>Risk breakdown</strong>
            <div>
              <i aria-hidden="true" />
              <span><b className="is-positive">●</b> Win<br /><b className="is-negative">●</b> Loss<br /><b>●</b> Scratch</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
