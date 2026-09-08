import { useEffect, useId, useMemo, useRef, useState, type PointerEvent, type MouseEvent, type KeyboardEvent } from "react";
import { buildEquityGeometry, signedMoney } from "../lib/dashboardPresentation";

type Point = { label: string; value: number };
function money(value: number) { return signedMoney(value, false, false); }
function tickMoney(value: number) { return Math.abs(value) >= 1000 ? `${value < 0 ? "−" : ""}$${(Math.abs(value) / 1000).toFixed(1)}k` : money(value); }
function dateLabel(value: string) {
  if (value === "Start") return "Start";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
}

export function AstraEquityCurve({ points }: { points: Point[] }) {
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
  const dateIndices = [...new Set(chart.points.length <= 2 ? [0, chart.points.length - 1] : [1, Math.floor((chart.points.length - 1) / 2), chart.points.length - 1])];

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
  return <div className="astra-chart-main" data-chart-selected={selected ?? ""} data-chart-pinned={pinned}>
    <svg ref={svgRef} className="astra-chart-svg" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" tabIndex={0}
      aria-label={`Cumulative reported P&L equity curve, ending ${money(last.value)}. Arrow keys explore trades, Enter pins a point, Escape clears.`}
      onKeyDown={onKeyDown} onPointerMove={event => { if (!pinned) setSelected(pointIndex(event)); }} onPointerLeave={() => { if (!pinned) setSelected(null); }}
      onClick={event => { const index = pointIndex(event); setSelected(index); setPinned(selected === index ? !pinned : true); }}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f7dff" stopOpacity=".21" /><stop offset="100%" stopColor="#4f7dff" stopOpacity="0" /></linearGradient></defs>
      {chart.ticks.map((tick, index) => <g key={index}><line x1={chart.left} x2={chart.width - chart.right} y1={tick.y} y2={tick.y} className="astra-chart-grid" /><text x={chart.width - chart.right + 12} y={tick.y + 3}>{tickMoney(tick.value)}</text></g>)}
      {[0, .25, .5, .75, 1].map(fraction => <line key={fraction} x1={chart.left + fraction * (chart.width - chart.left - chart.right)} x2={chart.left + fraction * (chart.width - chart.left - chart.right)} y1={chart.top} y2={chart.height - chart.bottom} className="astra-chart-vertical" />)}
      {chart.min < 0 && <line x1={chart.left} x2={chart.width - chart.right} y1={chart.zeroY} y2={chart.zeroY} className="astra-chart-zero" />}
      <path d={chart.area} fill={`url(#${gradient})`} />
      <path className="dashboard-equity-path astra-curve" d={chart.line} fill="none" stroke="#4f7dff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r="4" fill="#b2c8ff" stroke="#263b63" strokeWidth="5" />
      {dateIndices.map((index, position) => <text key={index} x={position === 0 ? chart.left : position === dateIndices.length - 1 ? chart.width - chart.right : chart.points[index].x} y={chart.height - 3} textAnchor={position === 0 ? "start" : position === dateIndices.length - 1 ? "end" : "middle"}>{dateLabel(chart.points[index].label)}</text>)}
      {active && <g aria-hidden="true"><line x1={active.x} x2={active.x} y1={chart.top} y2={chart.height - chart.bottom} className="astra-crosshair" /><circle cx={active.x} cy={active.y} r="4" fill="#e8eeff" /></g>}
    </svg>
    {active && <output className="astra-chart-tooltip" aria-live="polite" style={{ left: `${Math.max(15, Math.min(78, active.x / chart.width * 100))}%`, top: `${Math.max(5, Math.min(65, active.y / chart.height * 100 - 20))}%` }}><span>{active.label === "Start" ? "Starting balance" : `Trade ${selected} · ${active.label}`}</span><strong>{money(active.value)}</strong><small>{pinned ? "Pinned · Escape to clear" : "Click to pin"}</small></output>}
  </div>;
}
