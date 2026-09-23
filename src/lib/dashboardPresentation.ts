type EquityPoint = { label: string; value: number };

export function signedMoney(value: number, _cents = false, positiveSign = true) {
  return `${value < 0 ? "−" : value > 0 && positiveSign ? "+" : ""}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The same closed-trade ledger as risk.analyze, drawn without inventing values. */
export function buildEquityGeometry(input: EquityPoint[], measuredWidth = 680) {
  const width = Number.isFinite(measuredWidth) && measuredWidth >= 240 ? measuredWidth : 680;
  const height = width < 440 ? 210 : 290, left = 8, right = 65, top = 22, bottom = 30;
  const values = input.length ? input : [{ label: "Start", value: 0 }];
  let lowest = 0, highest = 1;
  for (const point of values) {
    lowest = Math.min(lowest, point.value);
    highest = Math.max(highest, point.value);
  }
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(Math.abs(lowest), highest)));
  const min = Math.floor(lowest / magnitude) * magnitude;
  const max = Math.ceil(highest / magnitude) * magnitude;
  const span = max - min;
  const y = (value: number) => top + (max - value) / span * (height - top - bottom);
  const points = values.map((point, index) => ({
    ...point,
    x: left + index / Math.max(1, values.length - 1) * (width - left - right),
    y: y(point.value),
  }));
  // Shape-preserving cubic interpolation. Flat tangents at reversals prevent
  // invented peaks; harmonic-mean slopes keep each interval within its endpoints.
  let line = `M${points[0].x},${points[0].y}`;
  if (points.length === 2) line += ` L${points[1].x},${points[1].y}`;
  else if (points.length > 2) {
    const slopes = points.slice(1).map((point, i) => (point.y - points[i].y) / (point.x - points[i].x));
    const tangents = points.map((_, i) => {
      if (i === 0) return slopes[0];
      if (i === points.length - 1) return slopes[i - 1];
      const before = slopes[i - 1], after = slopes[i];
      return before === 0 || after === 0 || Math.sign(before) !== Math.sign(after) ? 0 : 2 / (1 / before + 1 / after);
    });
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], handle = (b.x - a.x) / 3;
      line += ` C${a.x + handle},${a.y + tangents[i - 1] * handle} ${b.x - handle},${b.y - tangents[i] * handle} ${b.x},${b.y}`;
    }
  }
  const area = `${line} L${points[points.length - 1].x},${y(0)} L${left},${y(0)} Z`;
  const ticks = [max, (max + min) / 2, min].map(value => ({ value, y: y(value) }));
  return { width, height, left, right, top, bottom, min, max, points, line, area, ticks, zeroY: y(0) };
}
