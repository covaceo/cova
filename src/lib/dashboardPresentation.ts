type EquityPoint = { label: string; value: number };

export function signedMoney(value: number, cents = false, positiveSign = true) {
  return `${value < 0 ? "−" : value > 0 && positiveSign ? "+" : ""}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: cents || !Number.isInteger(value) ? 2 : 0, maximumFractionDigits: 2 })}`;
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
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(" ");
  const area = `${line} L${points[points.length - 1].x},${y(0)} L${left},${y(0)} Z`;
  const ticks = [max, (max + min) / 2, min].map(value => ({ value, y: y(value) }));
  return { width, height, left, right, top, bottom, min, max, points, line, area, ticks, zeroY: y(0) };
}
