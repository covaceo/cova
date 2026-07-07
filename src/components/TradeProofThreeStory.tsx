import { motion, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { memo } from "react";
import type { CSSProperties } from "react";

type TradeProofThreeStoryProps = {
  progress: MotionValue<number>;
};

type ProofRow = {
  market: string;
  note: string;
  pnl: string;
  tone: "gain" | "loss" | "flat";
};

type Candle = {
  close: number;
  high: number;
  low: number;
  open: number;
  x: number;
};

const proofRows: ProofRow[] = [
  { market: "ES", pnl: "+320", note: "Clean entry", tone: "gain" },
  { market: "NQ", pnl: "-180", note: "Late exit", tone: "loss" },
  { market: "GC", pnl: "+140", note: "Limit kept", tone: "gain" },
  { market: "MNQ", pnl: "-90", note: "Size reduced", tone: "flat" },
];

const passportCandles: Candle[] = [
  { x: 6, open: 51, high: 58, low: 47, close: 55 },
  { x: 20, open: 55, high: 63, low: 52, close: 61 },
  { x: 34, open: 61, high: 65, low: 53, close: 56 },
  { x: 48, open: 56, high: 59, low: 49, close: 52 },
  { x: 62, open: 52, high: 57, low: 46, close: 48 },
  { x: 76, open: 48, high: 54, low: 43, close: 45 },
  { x: 90, open: 45, high: 53, low: 41, close: 51 },
  { x: 104, open: 51, high: 62, low: 47, close: 59 },
  { x: 118, open: 59, high: 67, low: 55, close: 65 },
  { x: 132, open: 65, high: 69, low: 57, close: 60 },
  { x: 146, open: 60, high: 64, low: 51, close: 54 },
  { x: 160, open: 54, high: 58, low: 47, close: 49 },
  { x: 174, open: 49, high: 55, low: 44, close: 52 },
  { x: 188, open: 52, high: 61, low: 49, close: 58 },
  { x: 202, open: 58, high: 66, low: 54, close: 63 },
  { x: 216, open: 63, high: 72, low: 60, close: 69 },
  { x: 230, open: 69, high: 74, low: 62, close: 65 },
  { x: 244, open: 65, high: 68, low: 56, close: 59 },
  { x: 258, open: 59, high: 64, low: 53, close: 55 },
  { x: 272, open: 55, high: 61, low: 50, close: 58 },
  { x: 286, open: 58, high: 68, low: 55, close: 66 },
  { x: 300, open: 66, high: 75, low: 62, close: 72 },
  { x: 314, open: 72, high: 79, low: 69, close: 76 },
  { x: 328, open: 76, high: 82, low: 70, close: 73 },
];

const candleValues = passportCandles.flatMap((candle) => [candle.high, candle.low]);
const candleMin = Math.min(...candleValues);
const candleMax = Math.max(...candleValues);

function chartY(value: number) {
  const chartTop = 20;
  const chartHeight = 120;
  return chartTop + (1 - (value - candleMin) / (candleMax - candleMin)) * chartHeight;
}

function TradeProofThreeStory({ progress }: TradeProofThreeStoryProps) {
  const shouldReduceMotion = useReducedMotion() === true;

  const cardX = useTransform(progress, [0, 0.42, 0.78, 1], shouldReduceMotion ? ["0%", "0%", "0%", "0%"] : ["4%", "0%", "-2.5%", "-4%"]);
  const cardY = useTransform(progress, [0, 0.5, 1], shouldReduceMotion ? ["0%", "0%", "0%"] : ["2%", "0%", "-1%"]);
  const cardScale = useTransform(progress, [0, 0.4, 1], shouldReduceMotion ? [1, 1, 1] : [0.985, 1, 1.015]);
  const cardRotateY = useTransform(progress, [0, 1], shouldReduceMotion ? [-11, -11] : [-15, -9]);
  const cardRotateX = useTransform(progress, [0, 1], shouldReduceMotion ? [6, 6] : [7, 4.5]);

  const rowsOpacity = useTransform(progress, [0, 0.1, 0.48, 0.7], [0.2, 1, 0.95, 0.22]);
  const rowsX = useTransform(progress, [0, 0.34, 1], shouldReduceMotion ? ["0%", "0%", "0%"] : ["-18%", "0%", "8%"]);
  const rowsY = useTransform(progress, [0, 0.34, 1], shouldReduceMotion ? ["0%", "0%", "0%"] : ["-5%", "0%", "2%"]);

  const limitOpacity = useTransform(progress, [0.24, 0.42, 0.84], [0, 1, 0.96]);
  const limitX = useTransform(progress, [0.24, 0.52, 1], shouldReduceMotion ? ["0%", "0%", "0%"] : ["16%", "0%", "-4%"]);
  const limitY = useTransform(progress, [0.24, 0.52, 1], shouldReduceMotion ? ["0%", "0%", "0%"] : ["-18%", "0%", "-3%"]);

  const noteOpacity = useTransform(progress, [0.44, 0.62, 1], [0, 1, 0.96]);
  const noteX = useTransform(progress, [0.44, 0.68, 1], shouldReduceMotion ? ["0%", "0%", "0%"] : ["-18%", "0%", "2%"]);
  const noteY = useTransform(progress, [0.44, 0.68, 1], shouldReduceMotion ? ["0%", "0%", "0%"] : ["16%", "0%", "-2%"]);

  const sealOpacity = useTransform(progress, [0.62, 0.82, 1], [0, 1, 1]);
  const sealScale = useTransform(progress, [0.62, 0.82, 1], shouldReduceMotion ? [1, 1, 1] : [0.72, 1, 1.05]);

  return (
    <div className="trade-proof-three-stage proof-native-stage" aria-hidden="true">
      <div className="proof-stage-horizon" />
      <div className="proof-stage-vignette" />
      <motion.div className="proof-data-rail" style={{ opacity: rowsOpacity, x: rowsX, y: rowsY }}>
        <div className="proof-data-line proof-data-line-primary" />
        <div className="proof-data-line proof-data-line-secondary" />
        {proofRows.map((row, index) => (
          <div className={`proof-data-row proof-data-row-${row.tone}`} key={`${row.market}-${index}`} style={{ "--row-width": `${66 + index * 7}%` } as CSSProperties}>
            <span>{row.market}</span>
            <strong>{row.pnl}</strong>
            <em>{row.note}</em>
          </div>
        ))}
        <span className="proof-node proof-node-a" />
        <span className="proof-node proof-node-b" />
        <span className="proof-node proof-node-c" />
      </motion.div>

      <motion.article
        className="proof-passport-card"
        style={{
          rotateX: cardRotateX,
          rotateY: cardRotateY,
          rotateZ: -1.2,
          scale: cardScale,
          x: cardX,
          y: cardY,
        }}
      >
        <div className="proof-passport-sheen" />
        <header className="proof-passport-header">
          <div>
            <span>COVA</span>
            <strong>Risk Passport</strong>
          </div>
          <p>Verified review</p>
        </header>
        <div className="proof-passport-score">
          <strong>78</strong>
          <span>Review score</span>
        </div>
        <div className="proof-card-chart-shell">
          <div className="proof-card-timeframe">
            <span>1W</span>
            <strong>1M</strong>
            <span>3M</span>
            <span>1Y</span>
          </div>
          <svg className="proof-card-chart" viewBox="0 0 340 166" role="img" aria-label="Risk review candlestick chart">
            <g className="proof-chart-grid">
              {[22, 54, 86, 118, 150].map((y) => (
                <line key={`h-${y}`} x1="0" x2="340" y1={y} y2={y} />
              ))}
              {[18, 60, 102, 144, 186, 228, 270, 312].map((x) => (
                <line key={`v-${x}`} x1={x} x2={x} y1="0" y2="166" />
              ))}
            </g>
            {passportCandles.map((candle) => {
              const up = candle.close >= candle.open;
              const openY = chartY(candle.open);
              const closeY = chartY(candle.close);
              const highY = chartY(candle.high);
              const lowY = chartY(candle.low);
              const top = Math.min(openY, closeY);
              const height = Math.max(3.4, Math.abs(closeY - openY));
              return (
                <g className={up ? "proof-candle proof-candle-up" : "proof-candle proof-candle-down"} key={`${candle.x}-${candle.close}`}>
                  <line x1={candle.x} x2={candle.x} y1={highY} y2={lowY} />
                  <rect height={height} rx="1.8" width="6.2" x={candle.x - 3.1} y={top} />
                </g>
              );
            })}
          </svg>
        </div>
        <div className="proof-passport-lines">
          <span />
          <span />
          <span />
        </div>
      </motion.article>

      <motion.div className="proof-limit-panel" style={{ opacity: limitOpacity, x: limitX, y: limitY }}>
        <span>Limits</span>
        <strong>67%</strong>
        <i />
      </motion.div>

      <motion.div className="proof-review-panel" style={{ opacity: noteOpacity, x: noteX, y: noteY }}>
        <span>Review note</span>
        <p>Size up only after two clean sessions.</p>
        <i />
      </motion.div>

      <motion.div className="proof-seal" style={{ opacity: sealOpacity, scale: sealScale }}>
        <span />
        <i />
      </motion.div>

      <div className="trade-proof-three-caption">
        <span>Read-only inputs</span>
        <span>Limits attached</span>
        <span>Passport ready</span>
      </div>
    </div>
  );
}

export default memo(TradeProofThreeStory);
