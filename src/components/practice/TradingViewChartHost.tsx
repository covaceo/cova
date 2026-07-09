import { useEffect, useMemo, useRef, useState } from "react";
import {
  TRADINGVIEW_CUSTOM_CSS_PATH,
  TRADINGVIEW_LIBRARY_PATH,
  createChartLayoutAdapter,
  createCovaReplayDatafeed,
  createSettingsAdapter,
} from "../../lib/practiceTradingView";
import type { PracticePosition, PracticeTrade, ReplayCandle, ReplayTape } from "../../lib/backtesting";

type TradingViewWidgetInstance = {
  remove?: () => void;
  onChartReady?: (callback: () => void) => void;
};

declare global {
  interface Window {
    TradingView?: {
      widget: new (options: Record<string, unknown>) => TradingViewWidgetInstance;
    };
  }
}

type TradingViewChartHostProps = {
  currentIndex: number;
  candles: ReplayCandle[];
  position: PracticePosition | null;
  tape: ReplayTape;
  trades: PracticeTrade[];
};

type HostStatus = "checking" | "hosted" | "fallback";

export function TradingViewChartHost({ currentIndex, candles, position, tape, trades }: TradingViewChartHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const currentIndexRef = useRef(currentIndex);
  const tradesRef = useRef(trades);
  const [status, setStatus] = useState<HostStatus>("checking");

  currentIndexRef.current = currentIndex;
  tradesRef.current = trades;

  const datafeed = useMemo(() => createCovaReplayDatafeed({
    tape,
    getCurrentIndex: () => currentIndexRef.current,
    getTrades: () => tradesRef.current,
  }), [tape]);

  useEffect(() => {
    let destroyed = false;
    let widget: TradingViewWidgetInstance | null = null;
    let readinessTimer: number | null = null;
    let chartSettled = false;

    const fallBack = () => {
      if (destroyed || chartSettled) return;
      chartSettled = true;
      if (readinessTimer !== null) window.clearTimeout(readinessTimer);
      widget?.remove?.();
      widget = null;
      if (containerRef.current) containerRef.current.innerHTML = "";
      setStatus("fallback");
    };

    async function mountTradingView() {
      setStatus("checking");
      try {
        const ready = await ensureTradingViewWidget();
        if (destroyed || !containerRef.current) return;
        if (!ready || !window.TradingView?.widget) {
          fallBack();
          return;
        }

        containerRef.current.innerHTML = "";
        widget = new window.TradingView.widget({
          autosize: true,
          container: containerRef.current,
          custom_css_url: TRADINGVIEW_CUSTOM_CSS_PATH,
          datafeed,
          disabled_features: [
            "header_compare",
            "header_symbol_search",
            "use_localstorage_for_settings",
          ],
          enabled_features: [
            "study_templates",
            "side_toolbar_in_fullscreen_mode",
          ],
          interval: "5",
          library_path: TRADINGVIEW_LIBRARY_PATH,
          locale: "en",
          overrides: {
            "mainSeriesProperties.sessionId": "regular",
            "paneProperties.background": "#050709",
            "paneProperties.backgroundType": "solid",
            "scalesProperties.textColor": "rgba(255,255,255,0.58)",
          },
          save_load_adapter: createChartLayoutAdapter({ storageKey: `cova-tv-layouts-${tape.market}` }),
          settings_adapter: createSettingsAdapter(`cova-tv-settings-${tape.market}`),
          symbol: tape.market,
          theme: "dark",
          timezone: "Etc/UTC",
        });
        if (!widget.onChartReady) {
          fallBack();
          return;
        }
        readinessTimer = window.setTimeout(fallBack, 5000);
        widget.onChartReady(() => {
          if (destroyed || chartSettled) return;
          chartSettled = true;
          if (readinessTimer !== null) window.clearTimeout(readinessTimer);
          setStatus("hosted");
        });
      } catch {
        fallBack();
      }
    }

    void mountTradingView();

    return () => {
      destroyed = true;
      if (readinessTimer !== null) window.clearTimeout(readinessTimer);
      widget?.remove?.();
      widget = null;
      datafeed.destroy();
    };
  }, [datafeed, tape.market]);

  return (
    <div className="practice-tv-host mt-5" data-tv-status={status}>
      <div className="practice-tv-host-meta">
        <span>{status === "hosted" ? "TradingView hosted" : status === "checking" ? "Preparing replay chart" : "Basic replay chart"}</span>
        <strong>{status === "checking" ? "Checking chart availability · fallback remains active" : "Deterministic demo tape · not historical market data · 5-minute bars · simulated fills"}</strong>
      </div>
      <div className="practice-tv-container" ref={containerRef} aria-label="TradingView practice chart" />
      {status !== "hosted" && (
        <FallbackReplayChart candles={candles} position={position} tape={tape} trades={trades} />
      )}
    </div>
  );
}

async function ensureTradingViewWidget() {
  if (window.TradingView?.widget) return true;

  const scriptUrl = `${TRADINGVIEW_LIBRARY_PATH}charting_library.js`;
  const hasAsset = await hasJavaScriptAsset(scriptUrl);
  if (!hasAsset) return false;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(ready);
    };
    const timeout = window.setTimeout(() => finish(Boolean(window.TradingView?.widget)), 5000);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
    if (existing) {
      if (window.TradingView?.widget) {
        finish(true);
        return;
      }
      existing.addEventListener("load", () => finish(Boolean(window.TradingView?.widget)), { once: true });
      existing.addEventListener("error", () => finish(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => finish(Boolean(window.TradingView?.widget));
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });
}

async function hasJavaScriptAsset(scriptUrl: string) {
  try {
    const response = await fetch(scriptUrl, { method: "HEAD", cache: "no-store" });
    const contentType = response.headers.get("content-type") ?? "";
    return response.ok && /javascript|ecmascript|text\/plain/i.test(contentType);
  } catch {
    return false;
  }
}

function FallbackReplayChart({ candles, position, tape, trades }: { candles: ReplayCandle[]; position: PracticePosition | null; tape: ReplayTape; trades: PracticeTrade[] }) {
  const width = 920;
  const height = 360;
  const plotLeft = 48;
  const plotRight = 18;
  const plotTop = 24;
  const plotBottom = 34;
  const plotWidth = width - plotLeft - plotRight;
  const plotHeight = height - plotTop - plotBottom;
  const levelValues = [tape.levels.openingRangeHigh, tape.levels.openingRangeLow, tape.levels.vwap, tape.levels.overnightResistance];
  const lows = candles.map((candle) => candle.low).concat(levelValues);
  const highs = candles.map((candle) => candle.high).concat(levelValues);
  const min = Math.min(...lows) - 8;
  const max = Math.max(...highs) + 8;
  const range = Math.max(1, max - min);
  const xFor = (index: number) => plotLeft + (candles.length <= 1 ? 0 : (index / Math.max(1, candles.length - 1)) * plotWidth);
  const yFor = (price: number) => plotTop + ((max - price) / range) * plotHeight;
  const candleWidth = Math.max(3, Math.min(11, plotWidth / Math.max(12, candles.length) * 0.58));
  const last = candles[candles.length - 1];
  const visibleTradeMarkers = trades.filter((trade) => trade.date === tape.date && trade.market === tape.market && trade.setup === tape.setup && trade.exitIndex < candles.length).slice(0, 24);
  const levelRows = [
    { label: "ONR", value: tape.levels.overnightResistance, className: "level-resistance" },
    { label: "ORH", value: tape.levels.openingRangeHigh, className: "level-orh" },
    { label: "VWAP", value: tape.levels.vwap, className: "level-vwap" },
    { label: "ORL", value: tape.levels.openingRangeLow, className: "level-orl" },
  ];

  return (
    <div className="practice-chart-shell practice-tv-fallback" aria-label="Replay chart fallback">
      <div className="practice-tv-fallback-note">
        <span>Basic replay chart active</span>
        <strong>Deterministic demo tape · not historical market data · simulated fills only.</strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <defs>
          <linearGradient id="practiceChartGlow" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#18c887" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#0b0d10" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={width} height={height} rx="18" fill="#07090b" />
        <rect x={plotLeft} y={plotTop} width={plotWidth} height={plotHeight} fill="url(#practiceChartGlow)" />
        {[0.25, 0.5, 0.75].map((row) => (
          <line key={row} x1={plotLeft} x2={width - plotRight} y1={plotTop + row * plotHeight} y2={plotTop + row * plotHeight} stroke="rgba(255,255,255,0.06)" />
        ))}
        {levelRows.map((level) => {
          const y = yFor(level.value);
          return (
            <g key={level.label} className={level.className}>
              <line x1={plotLeft} x2={width - plotRight} y1={y} y2={y} strokeDasharray="5 7" />
              <text x={plotLeft + 8} y={y - 5}>{level.label} {level.value.toFixed(2)}</text>
            </g>
          );
        })}
        {candles.map((candle, localIndex) => {
          const x = xFor(localIndex);
          const green = candle.close >= candle.open;
          const bodyY = yFor(Math.max(candle.open, candle.close));
          const bodyHeight = Math.max(2, Math.abs(yFor(candle.open) - yFor(candle.close)));
          return (
            <g key={`${candle.time}-${localIndex}`} className={green ? "candle up" : "candle down"}>
              <line x1={x} x2={x} y1={yFor(candle.high)} y2={yFor(candle.low)} />
              <rect x={x - candleWidth / 2} y={bodyY} width={candleWidth} height={bodyHeight} rx="1.5" />
            </g>
          );
        })}
        {position && position.entryIndex < candles.length && (
          <g className="position-line">
            <line x1={plotLeft} x2={width - plotRight} y1={yFor(position.entryPrice)} y2={yFor(position.entryPrice)} />
            <circle cx={xFor(position.entryIndex)} cy={yFor(position.entryPrice)} r="5" />
            <text x={width - 176} y={yFor(position.entryPrice) - 7}>{position.direction} @ {position.entryPrice.toFixed(2)}</text>
          </g>
        )}
        {visibleTradeMarkers.map((trade) => (
          <g className={trade.pnl >= 0 ? "trade-marker win" : "trade-marker loss"} key={trade.id}>
            <circle cx={xFor(trade.exitIndex)} cy={yFor(trade.exitPrice)} r="4" />
            <text x={xFor(trade.exitIndex) + 6} y={yFor(trade.exitPrice) - 6}>{trade.resultR.toFixed(1)}R</text>
          </g>
        ))}
        {last && (
          <g className="current-price-pin">
            <line x1={plotLeft} x2={width - plotRight} y1={yFor(last.close)} y2={yFor(last.close)} />
            <rect x={width - 112} y={yFor(last.close) - 12} width="92" height="24" rx="12" />
            <text x={width - 66} y={yFor(last.close) + 4} textAnchor="middle">{last.close.toFixed(2)}</text>
          </g>
        )}
        <text className="chart-time-label" x={plotLeft} y={height - 12}>{candles[0]?.time ?? tape.date}</text>
        <text className="chart-time-label" x={width - plotRight} y={height - 12} textAnchor="end">{last?.time ?? tape.date}</text>
      </svg>
    </div>
  );
}
