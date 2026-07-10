# Cova Practice chart and replay architecture

Updated: 2026-07-10

## Shipping decision

Cova Practice uses **TradingView Lightweight Charts** as the chart renderer and keeps replay, simulated execution, account state, and analytics inside Cova.

```txt
Licensed historical futures data (future external gate)
  -> authenticated Cova history API/cache
  -> validated ReplayTape domain model
  -> TradingView Lightweight Charts
  -> Cova replay clock
  -> Cova simulated Buy / Sell / Close execution
  -> Cova practice ledger, P&L, drawdown, rule and readiness analytics
```

Active implementation:

```txt
src/lib/backtesting.ts
src/lib/practiceTradingView.ts
src/components/practice/LightweightReplayChart.tsx
scripts/practice-history-regression.mjs
scripts/practice-datafeed-regression.mjs
scripts/practice-architecture-regression.mjs
```

## Why Cova is not waiting for Advanced Charts

TradingView's current official documentation states:

1. Advanced Charts and Trading Platform do not include market data; the integrator must provide it.
2. Advanced Charts and Trading Platform do not support TradingView's built-in Bar Replay tool.
3. Free Advanced Charts usage requires attribution and a public implementation, not a private or paywalled workspace.
4. Lightweight Charts is Apache-2.0 licensed and may be used commercially when its attribution requirements are met.

Official references:

- https://www.tradingview.com/charting-library-docs/latest/getting_started/FAQ/
- https://www.tradingview.com/charting-library-docs/latest/getting_started/product-comparison/
- https://github.com/tradingview/lightweight-charts

Cova Practice is authenticated and may be paywalled. More importantly, Cova must own replay behavior regardless of renderer. Lightweight Charts therefore removes an unnecessary license/application dependency while preserving the TradingView-grade charting surface.

## Product-truth boundary

The current tape is a deterministic generated demonstration. The UI must continue to display:

```txt
Deterministic demo tape · not historical market data · 5-minute bars · simulated fills
```

Do not describe current Practice as historical replay until a licensed data source is connected and production-verified.

The domain model now records data provenance:

- `kind`: `demo` or `historical`
- `provider`
- `resolutionMinutes`
- optional actual futures `contract`

Historical bars fail closed unless:

- timestamps match the selected session date;
- timestamps are strictly chronological and unique;
- OHLCV values are finite;
- volume is non-negative;
- high/low relationships are valid.

VWAP is cumulative and rendered only from bars already revealed by the replay clock. Future bars are never passed to the chart.

## Remaining external market-data gate

Before enabling real replay, Cova needs a historical CME futures provider and contract terms that permit the intended end-user display. At minimum:

- NQ, MNQ, ES, and MES;
- one-minute OHLCV or finer for deterministic intrabar simulation;
- actual contract identifiers and rollover mapping;
- clear display/redistribution rights;
- server-side credentials and authenticated delivery;
- cache/storage terms compatible with Cova.

Cova should not expose provider credentials or unrestricted raw historical data from a public endpoint.

## Advanced Charts remains optional

After Cova has a custom domain, company email, legal/security pages, and a live product, it may still ask TradingView for commercial terms compatible with an authenticated/paywalled app. This would be an optional renderer upgrade for richer drawings/layout persistence—not a prerequisite for replay and not a source of market data.

Do not submit the old Advanced Charts application packet or add proprietary files under `/public/trading_platform/` unless TradingView grants Cova an explicit compatible license.

## Verification gates

```bash
npm run test:practice-history
npm run test:practice-datafeed
npm run test:practice-architecture
npm test
npm run build
```

Browser QA must verify:

- visible candles and running VWAP render;
- Step/Play reveals bars progressively;
- Buy/Sell/Close updates execution marks and account statistics;
- reset and rewind rules remain enforced;
- desktop and mobile widths stay contained;
- no browser console errors;
- the deterministic-demo disclosure remains visible until real licensed data is active.
