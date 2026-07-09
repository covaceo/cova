import {
  createPracticeTrade,
  type PracticeAccount,
  type PracticeDirection,
  type PracticePosition,
  type PracticeTrade,
  type ReplayCandle,
  type ReplayTape,
} from "./backtesting";

export const TRADINGVIEW_LIBRARY_PATH = "/trading_platform/";
export const TRADINGVIEW_CUSTOM_CSS_PATH = "/trading_view/cova-practice.css";

export type TradingViewBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type TradingViewSymbolInfo = {
  name: string;
  ticker: string;
  description: string;
  type: string;
  session: string;
  timezone: string;
  exchange: string;
  minmov: number;
  pricescale: number;
  has_intraday: boolean;
  has_no_volume: boolean;
  supported_resolutions: string[];
  volume_precision: number;
  data_status: string;
};

type PeriodParams = {
  from: number;
  to: number;
  firstDataRequest?: boolean;
  countBack?: number;
};

type DatafeedMark = {
  id: string;
  time: number;
  color: string;
  text: string;
  label: string;
  labelFontColor: string;
  minSize: number;
};

type DatafeedTimescaleMark = {
  id: string;
  time: number;
  color: string;
  label: string;
  tooltip: string[];
};

export type CovaReplayDatafeed = {
  onReady(callback: (configuration: { supported_resolutions: string[]; supports_marks: boolean; supports_time: boolean }) => void): void;
  resolveSymbol(symbolName: string, onResolve: (symbolInfo: TradingViewSymbolInfo) => void, onError?: (reason: string) => void): void;
  searchSymbols(userInput: string, exchange: string, symbolType: string, onResult: (symbols: Array<{ symbol: string; ticker: string; description: string; type: string; exchange: string }>) => void): void;
  getBars(symbolInfo: TradingViewSymbolInfo, resolution: string, periodParams: PeriodParams, onHistory: (bars: TradingViewBar[], meta: { noData: boolean }) => void, onError?: (reason: string) => void): void;
  subscribeBars(symbolInfo: TradingViewSymbolInfo, resolution: string, onRealtime: (bar: TradingViewBar) => void, subscriberUID: string, onResetCacheNeededCallback?: () => void): void;
  unsubscribeBars(subscriberUID: string): void;
  getServerTime(callback: (serverTime: number) => void): void;
  getMarks(symbolInfo: TradingViewSymbolInfo, from: number, to: number, onData: (marks: DatafeedMark[]) => void): void;
  getTimescaleMarks(symbolInfo: TradingViewSymbolInfo, from: number, to: number, onData: (marks: DatafeedTimescaleMark[]) => void): void;
  getStats(): { data_provider: string; api_symbol: string; request_count: number; request_avg_time: number };
  resetStats(): void;
  destroy(): void;
};

export type ReplayClockState = {
  currentIndex: number;
  isPlaying: boolean;
  speedMs: number;
};

export type ReplayClock = {
  getState(): ReplayClockState;
  subscribe(listener: (state: ReplayClockState) => void): () => void;
  play(): void;
  pause(): void;
  toggle(): void;
  reset(index?: number): void;
  step(amount?: number): void;
  setIndex(index: number): void;
  setSpeed(speedMs: number): void;
  dispose(): void;
};

export type PracticeExecutionEngine = {
  buy(): PracticePosition | null;
  sell(): PracticePosition | null;
  open(direction: PracticeDirection): PracticePosition | null;
  close(options?: { rulesFollowed?: boolean; mistake?: string; notes?: string }): PracticeTrade | null;
  reset(): void;
  getPosition(): PracticePosition | null;
};

export function createCovaReplayDatafeed({
  tape,
  getCurrentIndex,
  getTrades = () => [],
}: {
  tape: ReplayTape;
  getCurrentIndex: () => number;
  getTrades?: () => PracticeTrade[];
}): CovaReplayDatafeed {
  let requestCount = 0;
  let requestTotalMs = 0;
  const subscribers = new Map<string, ReturnType<typeof setInterval>>();

  const symbolInfo = buildSymbolInfo(tape);
  const allBars = tape.candles.map(candleToTradingViewBar);

  return {
    onReady(callback) {
      queueMicrotask(() => callback({
        supported_resolutions: ["5"],
        supports_marks: true,
        supports_time: true,
      }));
    },

    resolveSymbol(_symbolName, onResolve, onError) {
      queueMicrotask(() => {
        if (!tape.candles.length) {
          onError?.("No replay candles are loaded for this Cova practice session.");
          return;
        }
        onResolve(symbolInfo);
      });
    },

    searchSymbols(userInput, _exchange, _symbolType, onResult) {
      const query = userInput.trim().toUpperCase();
      const symbol = tape.market;
      queueMicrotask(() => onResult(query && !symbol.includes(query) ? [] : [{
        symbol,
        ticker: symbol,
        description: `${symbol} Cova replay tape`,
        type: "futures",
        exchange: "COVA",
      }]));
    },

    getBars(_symbolInfo, _resolution, periodParams, onHistory, onError) {
      const start = performanceNow();
      try {
        requestCount += 1;
        const visibleBars = allBars.slice(0, clampIndex(getCurrentIndex(), allBars.length) + 1);
        const fromMs = periodParams.from * 1000;
        const toMs = periodParams.to * 1000;
        let bars = visibleBars.filter((bar) => bar.time >= fromMs && bar.time <= toMs);
        if (periodParams.firstDataRequest && bars.length === 0) {
          bars = visibleBars.slice(0, Math.max(32, periodParams.countBack ?? 64));
        }
        if (periodParams.countBack && bars.length > periodParams.countBack) {
          bars = bars.slice(-periodParams.countBack);
        }
        requestTotalMs += performanceNow() - start;
        onHistory(bars, { noData: bars.length === 0 });
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Unable to load replay bars.");
      }
    },

    subscribeBars(_symbolInfo, _resolution, onRealtime, subscriberUID, onResetCacheNeededCallback) {
      subscribers.get(subscriberUID) && clearInterval(subscribers.get(subscriberUID));
      let lastIndex = -1;
      const timer = setInterval(() => {
        const currentIndex = clampIndex(getCurrentIndex(), tape.candles.length);
        if (currentIndex === lastIndex) return;
        if (lastIndex >= 0 && currentIndex < lastIndex) {
          lastIndex = currentIndex;
          onResetCacheNeededCallback?.();
          return;
        }
        lastIndex = currentIndex;
        const candle = tape.candles[currentIndex];
        if (candle) {
          onRealtime(candleToTradingViewBar(candle));
        } else {
          onResetCacheNeededCallback?.();
        }
      }, 250);
      subscribers.set(subscriberUID, timer);
    },

    unsubscribeBars(subscriberUID) {
      const timer = subscribers.get(subscriberUID);
      if (timer) {
        clearInterval(timer);
      }
      subscribers.delete(subscriberUID);
    },

    getServerTime(callback) {
      const candle = tape.candles[clampIndex(getCurrentIndex(), tape.candles.length)] ?? tape.candles[0];
      callback(Math.floor(candleTimeToEpochMs(candle?.time ?? `${tape.date} 09:30`) / 1000));
    },

    getMarks(_symbolInfo, from, to, onData) {
      const marks = getTrades()
        .filter((trade) => trade.date === tape.date && trade.market === tape.market && trade.setup === tape.setup)
        .map(tradeToMark)
        .filter((mark) => mark.time >= from && mark.time <= to);
      onData(marks);
    },

    getTimescaleMarks(_symbolInfo, from, to, onData) {
      const currentCandle = tape.candles[clampIndex(getCurrentIndex(), tape.candles.length)];
      const visibleThrough = Math.floor(candleTimeToEpochMs(currentCandle?.time ?? tape.date) / 1000);
      const marks = [
        timescaleMark("ORH", tape.candles[5]?.time ?? tape.date, "rgba(248,113,113,0.9)", "OR", [`Opening range locked: ${tape.levels.openingRangeHigh.toFixed(2)} / ${tape.levels.openingRangeLow.toFixed(2)}`]),
        timescaleMark("VWAP", tape.candles[32]?.time ?? tape.date, "rgba(96,165,250,0.95)", "VW", [`VWAP reference: ${tape.levels.vwap.toFixed(2)}`]),
      ].filter((mark) => mark.time <= visibleThrough && mark.time >= from && mark.time <= to);
      onData(marks);
    },

    getStats() {
      return {
        data_provider: "cova-replay",
        api_symbol: tape.market,
        request_count: requestCount,
        request_avg_time: requestCount ? Math.round(requestTotalMs / requestCount) : 0,
      };
    },

    resetStats() {
      requestCount = 0;
      requestTotalMs = 0;
    },

    destroy() {
      subscribers.forEach((timer) => clearInterval(timer));
      subscribers.clear();
    },
  };
}

export function createReplayClock({
  length,
  initialIndex = 32,
  minIndex = 6,
  speedMs = 460,
}: {
  length: number;
  initialIndex?: number;
  minIndex?: number;
  speedMs?: number;
}): ReplayClock {
  const listeners = new Set<(state: ReplayClockState) => void>();
  let state: ReplayClockState = {
    currentIndex: clamp(initialIndex, minIndex, Math.max(minIndex, length - 1)),
    isPlaying: false,
    speedMs,
  };
  let timer: ReturnType<typeof setInterval> | null = null;

  const emit = () => listeners.forEach((listener) => listener({ ...state }));
  const stopTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
  const setState = (next: Partial<ReplayClockState>) => {
    state = { ...state, ...next };
    emit();
  };
  const tick = () => {
    if (state.currentIndex >= length - 1) {
      stopTimer();
      setState({ isPlaying: false });
      return;
    }
    setState({ currentIndex: clamp(state.currentIndex + 1, minIndex, Math.max(minIndex, length - 1)) });
  };
  const startTimer = () => {
    stopTimer();
    timer = setInterval(tick, state.speedMs);
  };

  return {
    getState: () => ({ ...state }),
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...state });
      return () => listeners.delete(listener);
    },
    play() {
      if (state.isPlaying || length <= 1) return;
      setState({ isPlaying: true });
      startTimer();
    },
    pause() {
      stopTimer();
      setState({ isPlaying: false });
    },
    toggle() {
      state.isPlaying ? this.pause() : this.play();
    },
    reset(index = initialIndex) {
      stopTimer();
      setState({ currentIndex: clamp(index, minIndex, Math.max(minIndex, length - 1)), isPlaying: false });
    },
    step(amount = 1) {
      setState({ currentIndex: clamp(state.currentIndex + amount, minIndex, Math.max(minIndex, length - 1)) });
    },
    setIndex(index) {
      setState({ currentIndex: clamp(index, minIndex, Math.max(minIndex, length - 1)) });
    },
    setSpeed(nextSpeedMs) {
      setState({ speedMs: clamp(nextSpeedMs, 80, 5000) });
      if (state.isPlaying) startTimer();
    },
    dispose() {
      stopTimer();
      listeners.clear();
    },
  };
}

export function createPracticeExecutionEngine({
  account,
  tape,
  getCurrentIndex,
  getCurrentCandle,
  onTradeClosed,
}: {
  account: PracticeAccount;
  tape: ReplayTape;
  getCurrentIndex: () => number;
  getCurrentCandle: () => ReplayCandle | undefined;
  onTradeClosed?: (trade: PracticeTrade) => void;
}): PracticeExecutionEngine {
  let position: PracticePosition | null = null;

  const open = (direction: PracticeDirection) => {
    if (position) return position;
    const candle = getCurrentCandle();
    if (!candle) return null;
    position = {
      id: `practice-position-${Date.now()}`,
      direction,
      entryIndex: getCurrentIndex(),
      entryPrice: candle.close,
      contracts: account.contracts,
    };
    return position;
  };

  return {
    buy: () => open("Long"),
    sell: () => open("Short"),
    open,
    close(options = {}) {
      const candle = getCurrentCandle();
      if (!position || !candle) return null;
      const trade = createPracticeTrade({
        account,
        tape,
        direction: position.direction,
        entryIndex: position.entryIndex,
        entryPrice: position.entryPrice,
        exitIndex: getCurrentIndex(),
        exitPrice: candle.close,
        contracts: position.contracts,
        rulesFollowed: options.rulesFollowed ?? true,
        mistake: options.mistake?.trim() ?? "",
        notes: options.notes ?? `Replay close from ${tape.date} ${tape.setup}`,
      });
      position = null;
      onTradeClosed?.(trade);
      return trade;
    },
    reset() {
      position = null;
    },
    getPosition: () => position,
  };
}

export function createChartLayoutAdapter({ storageKey = "cova-tv-chart-layouts" } = {}) {
  return {
    async getAllCharts() {
      return readStorageArray(storageKey);
    },
    async getChartContent(id: string) {
      const chart = readStorageArray(storageKey).find((item) => item.id === id);
      return chart?.content;
    },
    async saveChart(chart: { id?: string; name?: string; content: string }) {
      const charts = readStorageArray(storageKey);
      const id = chart.id ?? `cova-layout-${Date.now()}`;
      const next = { id, name: chart.name ?? "Autosaved", content: chart.content, timestamp: Date.now() };
      writeStorageArray(storageKey, [next, ...charts.filter((item) => item.id !== id)]);
      return id;
    },
    async removeChart(id: string) {
      writeStorageArray(storageKey, readStorageArray(storageKey).filter((item) => item.id !== id));
    },
  };
}

export function createSettingsAdapter(storageKey = "cova-tv-settings") {
  return {
    initialSettings: readStorageRecord(storageKey),
    setValue(key: string, value: unknown) {
      writeStorageRecord(storageKey, { ...readStorageRecord(storageKey), [key]: value });
    },
    removeValue(key: string) {
      const next = readStorageRecord(storageKey);
      delete next[key];
      writeStorageRecord(storageKey, next);
    },
  };
}

function buildSymbolInfo(tape: ReplayTape): TradingViewSymbolInfo {
  return {
    name: tape.market,
    ticker: tape.market,
    description: `${tape.market} Cova replay`,
    type: "futures",
    session: "0930-1600",
    timezone: "Etc/UTC",
    exchange: "COVA",
    minmov: 1,
    pricescale: tape.market.includes("NQ") ? 4 : 4,
    has_intraday: true,
    has_no_volume: false,
    supported_resolutions: ["5"],
    volume_precision: 2,
    data_status: "streaming",
  };
}

function candleToTradingViewBar(candle: ReplayCandle): TradingViewBar {
  return {
    time: candleTimeToEpochMs(candle.time),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

function tradeToMark(trade: PracticeTrade): DatafeedMark {
  return {
    id: trade.id,
    time: Math.floor(candleTimeToEpochMs(trade.exitTime) / 1000),
    color: trade.pnl >= 0 ? "rgba(52,211,153,0.95)" : "rgba(248,113,113,0.95)",
    text: `${trade.direction} ${trade.market} ${trade.resultR.toFixed(2)}R · ${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(0)}`,
    label: trade.pnl >= 0 ? "W" : "L",
    labelFontColor: "#050709",
    minSize: 18,
  };
}

function timescaleMark(id: string, candleTime: string, color: string, label: string, tooltip: string[]): DatafeedTimescaleMark {
  return {
    id,
    time: Math.floor(candleTimeToEpochMs(candleTime) / 1000),
    color,
    label,
    tooltip,
  };
}

function candleTimeToEpochMs(value: string) {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
    return Date.parse(`${value.replace(" ", "T")}:00Z`);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function clampIndex(index: number, length: number) {
  return clamp(index, 0, Math.max(0, length - 1));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function performanceNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

type StoredChart = { id: string; name?: string; content: string; timestamp?: number };

function readStorageArray(storageKey: string): StoredChart[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is StoredChart => typeof item?.id === "string" && typeof item?.content === "string") : [];
  } catch {
    return [];
  }
}

function writeStorageArray(storageKey: string, value: StoredChart[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify(value));
}

function readStorageRecord(storageKey: string): Record<string, unknown> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorageRecord(storageKey: string, value: Record<string, unknown>) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify(value));
}
