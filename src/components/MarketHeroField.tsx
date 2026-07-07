import { useEffect, useRef } from "react";

type MarketCandleTone = "up" | "down";

type MarketCandle = {
  close: number;
  high: number;
  low: number;
  open: number;
  tone: MarketCandleTone;
  width: number;
};

const MARKET_CANDLE_COUNT = 220;
const MARKET_CANDLE_GAP = 22;
const MARKET_CANDLE_FPS = 16;

export function MarketHeroField({ className = "", variant = "hero" }: { className?: string; variant?: "dashboard" | "hero" }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      return;
    }

    const heroCanvas = canvas;
    const drawingContext = context;
    const isDashboardChart = variant === "dashboard";
    const candleGap = isDashboardChart ? 22 : MARKET_CANDLE_GAP;
    const candles = isDashboardChart ? buildDashboardCandles(108) : buildMarketCandles(MARKET_CANDLE_COUNT);
    const minPrice = Math.min(...candles.map((candle) => candle.low)) - 10;
    const maxPrice = Math.max(...candles.map((candle) => candle.high)) + 10;
    const trackWidth = candles.length * candleGap;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animateChart = !reduceMotion;
    let animationFrame = 0;
    let frameTimeout = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let startTime = 0;
    let lastFrameTime = 0;
    let isInView = true;
    let stripCanvas: HTMLCanvasElement | null = null;

    function resize() {
      const rect = heroCanvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, width < 760 ? 1 : 1.35);
      heroCanvas.width = Math.round(width * dpr);
      heroCanvas.height = Math.round(height * dpr);
      drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      stripCanvas = renderMarketStrip(candles, trackWidth, height, dpr, minPrice, maxPrice, candleGap, variant);
      if (!animateChart) {
        draw(92_000);
        animationFrame = window.requestAnimationFrame(() => draw(92_000));
      } else {
        requestDraw();
      }
    }

    function requestDraw(delay = 0) {
      if (animationFrame || frameTimeout || !animateChart || !isInView || document.hidden) {
        return;
      }
      frameTimeout = window.setTimeout(() => {
        frameTimeout = 0;
        animationFrame = window.requestAnimationFrame(draw);
      }, delay);
    }

    function draw(timestamp: number) {
      animationFrame = 0;
      if (!startTime) {
        startTime = timestamp;
      }
      if (!stripCanvas || (animateChart && (!isInView || document.hidden))) {
        return;
      }
      const frameInterval = 1000 / MARKET_CANDLE_FPS;
      if (animateChart && !reduceMotion && timestamp - lastFrameTime < frameInterval) {
        requestDraw(frameInterval - (timestamp - lastFrameTime));
        return;
      }
      lastFrameTime = timestamp;

      const elapsed = animateChart ? timestamp - startTime : 92_000;
      const speed = isDashboardChart ? (width < 700 ? 8 : 9.5) : (width < 700 ? 5.5 : 7);
      const offset = (elapsed / 1000 * speed) % trackWidth;

      drawingContext.clearRect(0, 0, width, height);
      drawingContext.save();
      drawingContext.globalAlpha = 0.98;

      for (let copy = -1; copy <= Math.ceil(width / trackWidth) + 1; copy += 1) {
        drawingContext.drawImage(stripCanvas, copy * trackWidth - offset, 0, trackWidth, height);
      }

      drawingContext.restore();

      if (animateChart) {
        requestDraw(frameInterval);
      }
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(heroCanvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isInView = entry ? entry.isIntersecting : true;
      if (isInView) {
        if (!animateChart) {
          draw(92_000);
        } else {
          requestDraw();
        }
      } else {
        window.cancelAnimationFrame(animationFrame);
        window.clearTimeout(frameTimeout);
        animationFrame = 0;
        frameTimeout = 0;
      }
    }, { rootMargin: "80px" });
    intersectionObserver.observe(heroCanvas);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (!animateChart) {
          draw(92_000);
        } else {
          requestDraw();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!animateChart) {
      draw(92_000);
    } else {
      requestDraw();
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(frameTimeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [variant]);

  return (
    <div className={`market-candle-stage pointer-events-none absolute inset-0 z-[4] ${className}`} aria-hidden="true">
      <div className="market-candle-viewport">
        <canvas ref={canvasRef} className="market-candle-canvas" />
      </div>
    </div>
  );
}

function renderMarketStrip(candles: MarketCandle[], trackWidth: number, height: number, dpr: number, minPrice: number, maxPrice: number, candleGap: number, variant: "dashboard" | "hero") {
  const strip = document.createElement("canvas");
  strip.width = Math.max(1, Math.round(trackWidth * dpr));
  strip.height = Math.max(1, Math.round(height * dpr));

  const context = strip.getContext("2d", { alpha: true });
  if (!context) {
    return strip;
  }

  const isDashboardChart = variant === "dashboard";
  const chartTop = height * (isDashboardChart ? 0.18 : 0.08);
  const chartBottom = height * (isDashboardChart ? 0.88 : 0.76);
  const chartHeight = chartBottom - chartTop;
  const fullRange = Math.max(1, maxPrice - minPrice);
  const visualPadding = fullRange * (isDashboardChart ? 0.065 : 0.035);
  const visualMin = minPrice - visualPadding;
  const visualMax = maxPrice + visualPadding;
  const visualRange = Math.max(1, visualMax - visualMin);
  const priceToY = (value: number) => chartTop + (1 - (value - visualMin) / visualRange) * chartHeight;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, trackWidth, height);
  context.lineCap = "butt";
  context.lineJoin = "miter";

  const plottedCandles = candles.map((candle, index) => {
    const x = (index + 0.5) * candleGap;
    const openY = priceToY(candle.open);
    const closeY = priceToY(candle.close);
    const highY = priceToY(candle.high);
    const lowY = priceToY(candle.low);
    const rawBodyTop = Math.min(openY, closeY);
    const rawBodyHeight = Math.abs(closeY - openY);
    const minBody = isDashboardChart ? 5.6 : 4.2;
    const bodyHeight = Math.max(minBody, rawBodyHeight);
    const bodyTop = rawBodyHeight < minBody ? (openY + closeY) / 2 - bodyHeight / 2 : rawBodyTop;
    const color = candleColor(candle.tone);
    return { bodyHeight, bodyTop, candle, closeY, color, highY, lowY, openY, x };
  });

  plottedCandles.forEach(({ bodyHeight, bodyTop, candle, color, highY, lowY, x }) => {
    const crispXCenter = Math.round(x) + 0.5;
    const wickTop = Math.round(highY) + 0.5;
    const wickBottom = Math.round(lowY) + 0.5;

    context.globalAlpha = candle.tone === "up" ? 0.98 : 0.86;
    context.strokeStyle = candleWickColor(candle.tone);
    context.lineWidth = isDashboardChart ? 1.05 : 1.2;
    context.shadowBlur = 0;
    context.beginPath();
    context.moveTo(crispXCenter, wickTop);
    context.lineTo(crispXCenter, wickBottom);
    context.stroke();

    context.globalAlpha = 0.98;
    context.strokeStyle = candleEdgeColor(candle.tone);
    context.lineWidth = isDashboardChart ? 0.7 : 0.8;
    const halfWidth = candle.width / 2;
    const crispX = Math.round(x - halfWidth) + 0.5;
    const crispY = Math.round(bodyTop) + 0.5;
    const crispWidth = Math.max(2, Math.round(candle.width));
    const crispHeight = Math.max(isDashboardChart ? 4 : 3, Math.round(bodyHeight));
    context.fillStyle = candleBodyFill(context, candle.tone, crispX, crispY, crispHeight);
    context.shadowBlur = 0;
    roundRect(context, crispX, crispY, crispWidth, crispHeight, Math.min(isDashboardChart ? 1.4 : 1.7, crispWidth / 2));
    context.fill();
    context.stroke();

    context.globalAlpha = candle.tone === "up" ? 0.22 : 0.12;
    context.strokeStyle = candle.tone === "up" ? "rgba(185, 245, 223, 0.78)" : "rgba(244, 248, 252, 0.58)";
    context.lineWidth = 0.55;
    context.beginPath();
    context.moveTo(crispX + 1, crispY + 1);
    context.lineTo(crispX + crispWidth - 1, crispY + 1);
    context.stroke();
  });

  return strip;
}

function buildDashboardCandles(count: number): MarketCandle[] {
  const random = seededRandom(76123);
  const candles: MarketCandle[] = [];
  const anchors = [
    { at: 0, price: 262 },
    { at: 0.1, price: 286 },
    { at: 0.2, price: 326 },
    { at: 0.3, price: 319 },
    { at: 0.4, price: 360 },
    { at: 0.5, price: 332 },
    { at: 0.59, price: 286 },
    { at: 0.7, price: 307 },
    { at: 0.8, price: 300 },
    { at: 0.9, price: 346 },
    { at: 1, price: 262 },
  ];
  let previousClose = anchors[0].price;
  let previousMove = 0;

  for (let index = 0; index < count; index += 1) {
    const progress = index / Math.max(1, count - 1);
    const nextAnchorIndex = Math.max(1, anchors.findIndex((anchor) => progress <= anchor.at));
    const start = anchors[nextAnchorIndex - 1] ?? anchors[0];
    const end = anchors[nextAnchorIndex] ?? anchors[anchors.length - 1];
    const startIndex = Math.round(start.at * (count - 1));
    const endIndex = Math.max(startIndex + 1, Math.round(end.at * (count - 1)));
    const localProgress = clampNumber((index - startIndex) / Math.max(1, endIndex - startIndex), 0, 1);
    const target = start.price + (end.price - start.price) * localProgress;
    const open = previousClose;
    const slope = (end.price - start.price) / Math.max(1, endIndex - startIndex);
    const direction = Math.sign(slope || previousMove || 1);
    const bodyNoise = (random() + random() + random() - 1.5) * 6.8;
    const rhythm = Math.sin(progress * 42) * 3.4 + Math.sin(progress * 113) * 2.1;
    const impulse =
      index % 17 === 7 ? direction * (10 + random() * 12) :
      index % 24 === 11 ? -direction * (8 + random() * 11) :
      index % 39 === 22 ? direction * (14 + random() * 14) :
      0;
    const isSmallPause = index % 37 === 13;
    let move = isSmallPause
      ? (random() - 0.5) * 2.2
      : (target - open) * 0.28 + slope * 2.1 + previousMove * 0.1 + bodyNoise + rhythm + impulse;

    if (Math.abs(move) < 4.8 && !isSmallPause) {
      move = direction * (5.8 + random() * 7.6);
    }

    const close = index === count - 1 ? anchors[0].price : clampNumber(open + move, 238, 382);
    const body = Math.abs(close - open);
    const fullBody = body > 8;
    const wickBase = fullBody ? 3.2 : 4.8;
    const upperWick = wickBase + random() * (fullBody ? 12 : 16);
    const lowerWick = wickBase + random() * (fullBody ? 12 : 16);
    const tone: MarketCandleTone = close >= open ? "up" : "down";
    const width = body > 15 ? 10.4 : body > 8 ? 8.6 : isSmallPause ? 5.8 : 7.2;

    candles.push({
      close,
      high: Math.max(open, close) + upperWick,
      low: Math.min(open, close) - lowerWick,
      open,
      tone,
      width,
    });
    previousMove = close - open;
    previousClose = close;
  }

  return candles;
}

function buildMarketCandles(count: number): MarketCandle[] {
  const random = seededRandom(314159);
  const candles: MarketCandle[] = [];
  const initialPrice = 306;
  let previousClose = initialPrice;
  let previousMove = 0;
  const regimes = [
    { share: 0.08, drift: 1.6, volatility: 3.8, carry: 0.16 },
    { share: 0.1, drift: 3.2, volatility: 6.4, carry: 0.18 },
    { share: 0.09, drift: -2.6, volatility: 7.6, carry: 0.12 },
    { share: 0.08, drift: 0.9, volatility: 5.2, carry: 0.08 },
    { share: 0.1, drift: 4.5, volatility: 9.4, carry: 0.2 },
    { share: 0.12, drift: -5.2, volatility: 10.6, carry: 0.18 },
    { share: 0.09, drift: 2.3, volatility: 7.2, carry: 0.12 },
    { share: 0.1, drift: 5.4, volatility: 12.4, carry: 0.2 },
    { share: 0.1, drift: -3.8, volatility: 9.6, carry: 0.16 },
    { share: 0.08, drift: -5.8, volatility: 11.4, carry: 0.18 },
    { share: 0.06, drift: 4.1, volatility: 9.2, carry: 0.14 },
  ];
  const regimeStops = regimes.reduce<Array<{ end: number } & typeof regimes[number]>>((stops, regime, index) => {
    const previousEnd = stops[index - 1]?.end ?? 0;
    const isLast = index === regimes.length - 1;
    const end = isLast ? count : Math.max(previousEnd + 8, Math.round(previousEnd + count * regime.share));
    stops.push({ ...regime, end });
    return stops;
  }, []);

  for (let index = 0; index < count; index += 1) {
    const progress = index / Math.max(1, count - 1);
    const regime = regimeStops.find((stop) => index < stop.end) ?? regimeStops[regimeStops.length - 1];
    const remainingCandles = Math.max(1, count - index - 1);
    const open = previousClose;
    const direction = Math.sign(regime.drift || previousMove || 1);
    const noise = (random() + random() + random() + random() - 2) * regime.volatility;
    const wave = Math.sin(progress * 38) * regime.volatility * 0.46 + Math.sin(progress * 91) * regime.volatility * 0.26;
    const impulse =
      index % 21 === 6 ? direction * (8 + random() * 18) :
      index % 34 === 17 ? -direction * (7 + random() * 16) :
      index % 55 === 28 ? direction * (15 + random() * 23) :
      0;
    const isDoji = index % 61 === 19 || index % 89 === 41;
    let move = isDoji
      ? (random() - 0.5) * 1.1
      : regime.drift + noise + wave + previousMove * regime.carry + impulse;

    if (index > count - 42) {
      const loopPressure = (initialPrice - open) / remainingCandles;
      const taper = clampNumber(remainingCandles / 42, 0, 1);
      move = loopPressure * (1.12 - taper * 0.18) + noise * 0.42 * taper + Math.sin(index * 0.94) * 2.4 * taper;
    }

    if (open + move > 398) {
      move = -Math.abs(move) * 0.62 - 6 - random() * 9;
    } else if (open + move < 248) {
      move = Math.abs(move) * 0.62 + 6 + random() * 9;
    }

    let close = clampNumber(open + move, 240, 408);
    if (!isDoji && index < count - 10 && Math.abs(close - open) < 3.4) {
      close = clampNumber(open + direction * (3.8 + random() * 7.8), 240, 408);
    }
    if (index === count - 1) {
      close = initialPrice;
    }

    const body = Math.abs(close - open);
    const isFullBody = !isDoji && body > 5.2;
    const wickBase = isFullBody ? 0.7 : isDoji ? 2.2 : 1.2;
    const wickRange = isFullBody ? 3.8 : 6.5;
    const upperWick = wickBase + random() * wickRange + (index % 27 === 8 ? 3.8 * random() : 0);
    const lowerWick = wickBase + random() * wickRange + (index % 31 === 19 ? 4.3 * random() : 0);
    const high = Math.max(open, close) + upperWick;
    const low = Math.min(open, close) - lowerWick;
    const down = close < open;
    const strongPrint = body > 13.5 && (index % 3 !== 0 || Math.abs(impulse) > 0);
    const tone: MarketCandleTone = down ? "down" : "up";
    const width = strongPrint ? 11.2 : isFullBody ? 9.4 : isDoji ? 5.2 : 7.1;

    candles.push({ close, high, low, open, tone, width });
    previousMove = close - open;
    previousClose = close;
  }

  return candles;
}

function candleColor(tone: MarketCandleTone) {
  if (tone === "up") {
    return "rgba(24, 200, 135, 0.96)";
  }
  return "rgba(174, 186, 199, 0.82)";
}

function candleWickColor(tone: MarketCandleTone) {
  if (tone === "up") {
    return "rgba(24, 200, 135, 0.88)";
  }
  return "rgba(160, 174, 190, 0.72)";
}

function candleEdgeColor(tone: MarketCandleTone) {
  if (tone === "up") {
    return "rgba(185, 245, 223, 0.58)";
  }
  return "rgba(222, 231, 241, 0.34)";
}

function candleBodyFill(context: CanvasRenderingContext2D, tone: MarketCandleTone, x: number, y: number, height: number) {
  const gradient = context.createLinearGradient(x, y, x, y + Math.max(1, height));
  if (tone === "up") {
    gradient.addColorStop(0, "rgba(185, 245, 223, 0.98)");
    gradient.addColorStop(0.18, "rgba(24, 200, 135, 0.98)");
    gradient.addColorStop(1, "rgba(11, 122, 82, 0.94)");
    return gradient;
  }
  gradient.addColorStop(0, "rgba(230, 237, 246, 0.88)");
  gradient.addColorStop(0.22, "rgba(178, 191, 207, 0.84)");
  gradient.addColorStop(1, "rgba(112, 127, 146, 0.76)");
  return gradient;
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

