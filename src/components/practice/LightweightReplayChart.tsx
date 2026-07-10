import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { PracticePosition, PracticeTrade, ReplayCandle, ReplayTape } from "../../lib/backtesting";

type LightweightReplayChartProps = {
  visibleCandles: ReplayCandle[];
  position: PracticePosition | null;
  tape: ReplayTape;
  trades: PracticeTrade[];
};

type ChartState = {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  vwapSeries: ISeriesApi<"Line">;
  markers: ISeriesMarkersPluginApi<Time>;
  levelLines: IPriceLine[];
  openingRangeVisible: boolean;
  positionLine: IPriceLine | null;
  fitted: boolean;
  lastBarCount: number;
};

const CHART_HEIGHT = 420;

export function LightweightReplayChart({ visibleCandles, position, tape, trades }: LightweightReplayChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartStateRef = useRef<ChartState | null>(null);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setRenderError(false);
    let resizeObserver: ResizeObserver | null = null;
    let chart: IChartApi | null = null;
    let markers: ISeriesMarkersPluginApi<Time> | null = null;

    try {
      const createdChart = createChart(container, {
        autoSize: false,
        width: Math.max(320, container.clientWidth),
        height: CHART_HEIGHT,
        layout: {
          background: { type: ColorType.Solid, color: "#050709" },
          textColor: "rgba(226, 232, 240, 0.62)",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: 11,
          attributionLogo: true,
        },
        grid: {
          vertLines: { color: "rgba(148, 163, 184, 0.055)" },
          horzLines: { color: "rgba(148, 163, 184, 0.07)" },
        },
        crosshair: {
          mode: CrosshairMode.MagnetOHLC,
          vertLine: { color: "rgba(226, 232, 240, 0.2)", labelBackgroundColor: "#24292f" },
          horzLine: { color: "rgba(226, 232, 240, 0.2)", labelBackgroundColor: "#24292f" },
        },
        rightPriceScale: {
          borderColor: "rgba(148, 163, 184, 0.12)",
          scaleMargins: { top: 0.12, bottom: 0.1 },
        },
        timeScale: {
          borderColor: "rgba(148, 163, 184, 0.12)",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 4,
          barSpacing: 9,
          minBarSpacing: 3,
          lockVisibleTimeRangeOnResize: true,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      });

      chart = createdChart;
      const series = createdChart.addSeries(CandlestickSeries, {
        upColor: "#34d399",
        downColor: "#f87171",
        borderUpColor: "#4ade80",
        borderDownColor: "#fb7185",
        wickUpColor: "rgba(74, 222, 128, 0.88)",
        wickDownColor: "rgba(251, 113, 133, 0.88)",
        priceLineColor: "rgba(226, 232, 240, 0.38)",
        priceLineStyle: LineStyle.Dotted,
        lastValueVisible: true,
      });
      const vwapSeries = createdChart.addSeries(LineSeries, {
        color: "rgba(96, 165, 250, 0.78)",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: true,
        title: "VWAP",
      });

      const levelLines = createLevelLines(series, tape, false);
      const createdMarkers = createSeriesMarkers(series, []);
      markers = createdMarkers;
      chartStateRef.current = {
        chart: createdChart,
        series,
        vwapSeries,
        markers: createdMarkers,
        levelLines,
        openingRangeVisible: false,
        positionLine: null,
        fitted: false,
        lastBarCount: 0,
      };

      resizeObserver = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? container.clientWidth;
        if (width > 0) createdChart.applyOptions({ width, height: CHART_HEIGHT });
      });
      resizeObserver.observe(container);
    } catch {
      resizeObserver?.disconnect();
      markers?.detach();
      chart?.remove();
      resizeObserver = null;
      markers = null;
      chart = null;
      chartStateRef.current = null;
      setRenderError(true);
    }

    return () => {
      resizeObserver?.disconnect();
      const state = chartStateRef.current;
      if (state) {
        state.markers.detach();
        state.chart.remove();
      }
      chartStateRef.current = null;
    };
  }, [tape.id, tape.levels.openingRangeHigh, tape.levels.openingRangeLow, tape.levels.overnightResistance]);

  useEffect(() => {
    const state = chartStateRef.current;
    if (!state) return;

    state.series.setData(visibleCandles.map(candleToChartBar));
    state.vwapSeries.setData(visibleCandles
      .filter((candle) => Number.isFinite(candle.vwap))
      .map((candle) => ({ time: candleTimeToTimestamp(candle.time), value: Number(candle.vwap) })));
    state.markers.setMarkers(buildMarkers({ visibleCandles, position, tape, trades }));

    const openingRangeBarCount = 30 / tape.dataSource.resolutionMinutes;
    const openingRangeVisible = visibleCandles.length >= openingRangeBarCount;
    if (state.openingRangeVisible !== openingRangeVisible) {
      state.levelLines.forEach((line) => state.series.removePriceLine(line));
      state.levelLines = createLevelLines(state.series, tape, openingRangeVisible);
      state.openingRangeVisible = openingRangeVisible;
    }

    if (state.positionLine) {
      state.series.removePriceLine(state.positionLine);
      state.positionLine = null;
    }
    if (position && position.entryIndex < visibleCandles.length) {
      state.positionLine = state.series.createPriceLine({
        price: position.entryPrice,
        color: position.direction === "Long" ? "rgba(52, 211, 153, 0.88)" : "rgba(248, 113, 113, 0.88)",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${position.direction} ${position.contracts}`,
      });
    }

    if (!state.fitted && visibleCandles.length) {
      state.chart.timeScale().fitContent();
      state.fitted = true;
    } else if (visibleCandles.length > state.lastBarCount) {
      state.chart.timeScale().scrollToRealTime();
    }
    state.lastBarCount = visibleCandles.length;
  }, [position, tape, trades, visibleCandles]);

  const dataSourceLabel = tape.dataSource.kind === "historical"
    ? `${tape.dataSource.provider} historical data · ${tape.dataSource.contract ?? tape.market} · ${tape.dataSource.resolutionMinutes}-minute source · simulated fills`
    : "Deterministic demo tape · not historical market data · 5-minute bars · simulated fills";

  return (
    <div className="practice-tv-host mt-5" data-tv-status={renderError ? "error" : "lightweight"}>
      <div className="practice-tv-host-meta">
        <span>TradingView Lightweight Charts</span>
        <strong>{dataSourceLabel}</strong>
      </div>
      <div
        aria-label={`${tape.market} Cova replay chart through ${visibleCandles[visibleCandles.length - 1]?.time ?? tape.date}`}
        className="practice-tv-container"
        ref={containerRef}
        role="img"
      />
      {renderError && (
        <p className="practice-chart-error" role="status">
          The replay chart could not start. Your practice account and saved trades are still safe; reload to try again.
        </p>
      )}
    </div>
  );
}

function createLevelLines(series: ISeriesApi<"Candlestick">, tape: ReplayTape, includeOpeningRange: boolean) {
  const levels = [
    ...(Number.isFinite(tape.levels.overnightResistance) ? [
      { title: "ONR", price: Number(tape.levels.overnightResistance), color: "rgba(248, 113, 113, 0.55)" },
    ] : []),
    ...(includeOpeningRange ? [
      { title: "ORH", price: tape.levels.openingRangeHigh, color: "rgba(251, 146, 60, 0.58)" },
      { title: "ORL", price: tape.levels.openingRangeLow, color: "rgba(52, 211, 153, 0.5)" },
    ] : []),
  ];
  return levels.map((level) => series.createPriceLine({
    ...level,
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
  }));
}

function buildMarkers({
  visibleCandles,
  position,
  tape,
  trades,
}: LightweightReplayChartProps): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = trades
    .filter((trade) => trade.tapeId
      ? trade.tapeId === tape.id
      : tape.dataSource.kind === "demo"
        && trade.date === tape.date
        && trade.market === tape.market
        && trade.setup === tape.setup
        && trade.session === tape.session)
    .filter((trade) => trade.exitIndex < visibleCandles.length)
    .slice(0, 24)
    .map((trade) => ({
      time: candleTimeToTimestamp(trade.exitTime),
      position: trade.pnl >= 0 ? "belowBar" : "aboveBar",
      shape: "circle",
      color: trade.pnl >= 0 ? "#34d399" : "#f87171",
      text: `${trade.resultR >= 0 ? "+" : ""}${trade.resultR.toFixed(1)}R`,
      size: 1.2,
    }));

  if (position && position.entryIndex < visibleCandles.length) {
    const entryCandle = tape.candles[position.entryIndex];
    if (entryCandle) {
      markers.push({
        time: candleTimeToTimestamp(entryCandle.time),
        position: position.direction === "Long" ? "belowBar" : "aboveBar",
        shape: position.direction === "Long" ? "arrowUp" : "arrowDown",
        color: position.direction === "Long" ? "#34d399" : "#f87171",
        text: `${position.direction} ${position.contracts}`,
        size: 1.5,
      });
    }
  }

  return markers.sort((left, right) => Number(left.time) - Number(right.time));
}

function candleToChartBar(candle: ReplayCandle) {
  return {
    time: candleTimeToTimestamp(candle.time),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function candleTimeToTimestamp(value: string): UTCTimestamp {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return Math.floor(Date.parse(`${normalized}:00Z`) / 1000) as UTCTimestamp;
}
