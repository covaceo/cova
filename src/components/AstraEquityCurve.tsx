import { useEffect, useId, useMemo, useRef, useState, type PointerEvent, type MouseEvent, type KeyboardEvent, type CSSProperties } from "react";
import { buildEquityGeometry, signedMoney } from "../lib/dashboardPresentation";

type Point = { label: string; value: number };
function money(value: number) { return signedMoney(value, false, false); }
function tickMoney(value: number) { return Math.abs(value) >= 1000 ? `${value < 0 ? "−" : ""}$${(Math.abs(value) / 1000).toFixed(1)}k` : money(value); }
function dateLabel(value: string) {
  if (value === "Start") return "Start";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
}

export function AstraEquityCurve({ points, basis = "trades", accountPnlCents = null }: { points: Point[]; basis?: "trades" | "daily-net"; accountPnlCents?: number | null }) {
  const dailyNet = basis === "daily-net";
  const result = Number.isSafeInteger(accountPnlCents) ? Math.round((points[points.length - 1]?.value ?? 0) * 100) : null;
  const tone = result === null || result === 0 ? "neutral" : result < 0 ? "loss" : "profit";

  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(680);
  const chart = useMemo(() => buildEquityGeometry(points, width), [points, width]);
  useEffect(() => {
    if (!svgRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width;
      if (next && next >= 240) setWidth(next);
    });
    observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, []);
  const gradient = `astra-equity-${useId().replace(/:/g, "")}`;
  const [selected, setSelected] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => { setSelected(null); setPinned(false); }, [points]);
  const active = selected === null ? null : chart.points[Math.min(selected, chart.points.length - 1)];
  const last = chart.points[chart.points.length - 1];
  // Color and axis share the selected range's displayed $0 P&L baseline.
  // Account evidence gates availability only; older profits cannot recolor this range.
  const historicalCents = (value: number) => result === null ? null : Math.round(value * 100);
  const pointAccent = (value: number) => {
    const cents = historicalCents(value);
    return cents === null || cents === 0 ? "#4f7dff" : cents < 0 ? "#e57c89" : "#52c79a";
  };
  const hasLoss = chart.points.some(point => (historicalCents(point.value) ?? 0) < 0);
  const hasProfit = chart.points.some(point => (historicalCents(point.value) ?? 0) > 0);
  const historyTone = hasLoss && hasProfit ? "split" : hasLoss ? "loss" : hasProfit ? "profit" : "neutral";
  const boundary = Math.max(0, Math.min(1, chart.max / (chart.max - chart.min)));
  const historicalAccent = historyTone === "loss" ? "#e57c89" : historyTone === "profit" ? "#52c79a" : "#4f7dff";
  const linePaint = historyTone === "split" ? `url(#${gradient}-line)` : historicalAccent;
  const selectedDelta = active ? (Math.round(active.value * 100) - Math.round((chart.points[(selected ?? 0) - 1]?.value ?? 0) * 100)) / 100 : 0;
  const showObservationLabels = dailyNet && chart.points.length > 1 && (chart.width - chart.left - chart.right) / (chart.points.length - 1) >= 85;
  const dateIndices = showObservationLabels ? chart.points.map((_, index) => index) : [...new Set(chart.points.length <= 2 ? [0, chart.points.length - 1] : [dailyNet ? 0 : 1, Math.floor((chart.points.length - 1) / 2), chart.points.length - 1])];

  function pointIndex(event: PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>) {
    const svg = event.currentTarget;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    const x = matrix ? point.matrixTransform(matrix.inverse()).x : chart.left;
    return Math.max(0, Math.min(chart.points.length - 1, Math.round((x - chart.left) / (chart.width - chart.left - chart.right) * (chart.points.length - 1))));
  }
  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Escape") { setSelected(null); setPinned(false); return; }
    if (event.key === "Enter" || event.key === " ") { setSelected(selected ?? chart.points.length - 1); setPinned(!pinned); return; }
    setPinned(true);
    setSelected(event.key === "Home" ? 0 : event.key === "End" ? chart.points.length - 1 : Math.max(0, Math.min(chart.points.length - 1, (selected ?? 0) + (event.key === "ArrowRight" ? 1 : -1))));
  }
  return <div className="astra-chart-main" data-equity-tone={tone} data-equity-history={historyTone} style={{ "--astra-equity-accent": linePaint } as CSSProperties} data-chart-selected={selected ?? ""} data-chart-pinned={pinned}>
    <svg ref={svgRef} className="astra-chart-svg" style={{ touchAction: "pan-y" }} viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" tabIndex={0}
      aria-label={`${dailyNet ? "Daily cumulative net P&L" : "Cumulative reported P&L equity curve"}, ending ${money(last.value)}. Curve interpolated between recorded results. ${result === null ? "Account color unavailable." : "Red below the displayed zero P&L baseline for the selected range; green above. Dots mark recorded results."} Arrow keys explore ${dailyNet ? "days" : "trades"}, Enter pins a point, Escape clears.`}
      onKeyDown={onKeyDown} onPointerMove={event => { if (!pinned) setSelected(pointIndex(event)); }} onPointerLeave={() => { if (!pinned) setSelected(null); }}
      onClick={event => { const index = pointIndex(event); setSelected(index); setPinned(selected === index ? !pinned : true); }}>
      <defs>
        <linearGradient id={`${gradient}-line`} data-equity-line-gradient="true" gradientUnits="userSpaceOnUse" x1="0" y1={chart.top} x2="0" y2={chart.height - chart.bottom}>
          <stop offset={boundary} stopColor="#52c79a" /><stop offset={boundary} stopColor="#e57c89" />
        </linearGradient>
        <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" y1={chart.top} x2="0" y2={chart.height - chart.bottom}>
          {historyTone === "split" ? <><stop offset="0" stopColor="#52c79a" stopOpacity=".21" /><stop offset={boundary} stopColor="#52c79a" stopOpacity=".025" /><stop offset={boundary} stopColor="#e57c89" stopOpacity=".025" /><stop offset="1" stopColor="#e57c89" stopOpacity=".21" /></> : <><stop offset="0" stopColor={historicalAccent} stopOpacity={historyTone === "loss" ? ".025" : ".21"} /><stop offset="1" stopColor={historicalAccent} stopOpacity={historyTone === "loss" ? ".21" : "0"} /></>}
        </linearGradient>
      </defs>
      {chart.ticks.map((tick, index) => <g key={index}><line x1={chart.left} x2={chart.width - chart.right} y1={tick.y} y2={tick.y} className="astra-chart-grid" /><text x={chart.width - chart.right + 12} y={tick.y + 3}>{tickMoney(tick.value)}</text></g>)}
      {[0, .25, .5, .75, 1].map(fraction => <line key={fraction} x1={chart.left + fraction * (chart.width - chart.left - chart.right)} x2={chart.left + fraction * (chart.width - chart.left - chart.right)} y1={chart.top} y2={chart.height - chart.bottom} className="astra-chart-vertical" />)}
      {chart.min < 0 && <line x1={chart.left} x2={chart.width - chart.right} y1={chart.zeroY} y2={chart.zeroY} className="astra-chart-zero" />}
      <path d={chart.area} fill={`url(#${gradient})`} />
      <path className="dashboard-equity-path astra-curve" d={chart.line} fill="none" stroke={linePaint} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {chart.points.map((point, index) => <circle className="astra-observation" data-observation-index={index} key={index} cx={point.x} cy={point.y} r="2.5" fill={pointAccent(point.value)} stroke="#0c1118" strokeWidth="1" />)}
      <circle cx={last.x} cy={last.y} r="4" fill={pointAccent(last.value)} stroke={pointAccent(last.value)} strokeOpacity=".25" strokeWidth="5" />
      {dateIndices.map((index, position) => <text key={index} x={position === 0 ? chart.left : position === dateIndices.length - 1 ? chart.width - chart.right : chart.points[index].x} y={chart.height - 3} textAnchor={position === 0 ? "start" : position === dateIndices.length - 1 ? "end" : "middle"}>{dateLabel(chart.points[index].label)}</text>)}

      {active && <g aria-hidden="true"><line x1={active.x} x2={active.x} y1={chart.top} y2={chart.height - chart.bottom} className="astra-crosshair" /><circle cx={active.x} cy={active.y} r="4" fill="#e8eeff" /></g>}
    </svg>
    {active && <output className="astra-chart-tooltip" aria-live="polite" style={{ left: `clamp(95px, ${active.x / chart.width * 100}%, calc(100% - 95px))`, top: `${Math.max(5, Math.min(25, active.y / chart.height * 100 - 20))}%` }}>
      <span>{active.label === "Start" ? "Range start · $0 P&L" : dailyNet ? `${dateLabel(active.label)} · UTC` : `Trade ${selected} · ${active.label}`}</span>
      <strong>{active.label === "Start" ? money(0) : signedMoney(selectedDelta)}</strong>
      {active.label !== "Start" && <small>{dailyNet ? "Day net" : "Trade P&L"}</small>}
      <small>{dailyNet ? "Cumulative net" : "Cumulative P&L"} {signedMoney(active.value)}</small>
      <small>{pinned ? "Pinned · Escape to clear" : "Click to pin"}</small>
    </output>}
  </div>;
}
