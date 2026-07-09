# TradingView Advanced Charts application packet for Cova

Created: 2026-07-09

## Goal

Request official access to TradingView **Advanced Charts / Charting Library** for Cova Practice, so Cova can legally self-host TradingView chart assets under:

```txt
/public/trading_platform/
```

Cova already has the integration scaffold in code:

```txt
src/lib/practiceTradingView.ts
src/components/practice/TradingViewChartHost.tsx
public/trading_platform/README.md
public/trading_view/cova-practice.css
scripts/practice-architecture-regression.mjs
```

The Practice route currently falls back to the internal Cova SVG replay chart until licensed TradingView assets are added.

## Official target

Use the TradingView Advanced Charts page:

```txt
https://www.tradingview.com/advanced-charts/
```

Click:

```txt
Contact us / Get the library
```

## Form fields seen on TradingView

Known required fields from the official form:

1. Full name
2. Company email
3. Company name
4. Website URL for the integration
5. Link to GitHub profile
6. Is your website live?
7. Job / role
8. Use-case description
9. Optional file upload
10. License Agreement checkbox

## Fill values

Use these unless Raf wants different official company info.

| Field | Value |
|---|---|
| Full name | `[RAF FULL NAME]` |
| Company email | `[COVA COMPANY EMAIL]` |
| Company name | `Cova` |
| Website URL for the integration | `[COVA APP URL OR LANDING URL]` |
| Link to GitHub profile | `[RAF/COVA GITHUB PROFILE]` |
| Is your website live? | `Yes` if Cova landing/app is publicly reachable; otherwise `No / not yet` |
| Job / role | `Founder` |

## Use-case description to paste

```txt
Cova is a trading journal and risk operating system for active traders, with a Practice/Backtesting workspace for replaying historical market sessions before risking live capital.

We want to integrate TradingView Advanced Charts as the charting surface inside Cova Practice. Cova will provide its own datafeed adapter for historical candles, symbol metadata, replay state, execution marks, and chart layout/settings persistence. The integration is not intended to route live orders, connect to brokerage accounts, or move customer funds.

The product flow is:
1. A trader configures a paper practice account: account size, risk per trade, max daily loss, max drawdown, market, contracts, year/date, and setup.
2. Cova loads a TradingView-grade chart inside the Cova web app.
3. Cova serves historical OHLCV bars through the TradingView Datafeed API.
4. Cova controls the replay clock and lets the trader step/play through the session.
5. Cova records simulated Buy/Sell/Close executions in a practice ledger.
6. Cova calculates P&L, R-multiple, drawdown, rule-follow rate, setup scorecards, and live-trading permission status.

We need Advanced Charts because the free public widget does not expose the level of control required for an in-app replay simulator, custom datafeed, execution marks, saved chart layouts, and a premium trading-workstation user experience.

The integration will be hosted in Cova's authenticated web app. Depending on the user's plan, the Practice module may be available behind a subscription/paywall. Cova will follow TradingView's license requirements and will not redistribute the library outside the Cova application.

Technical implementation already prepared:
- Self-hosted library path: /trading_platform/
- Custom CSS path: /trading_view/cova-practice.css
- Custom Datafeed API methods: onReady, resolveSymbol, searchSymbols, getBars, subscribeBars, unsubscribeBars, getServerTime, getMarks, getTimescaleMarks
- Cova-owned replay clock and paper execution engine
- Chart layout/settings adapter seams

We are requesting official access to the Advanced Charts / Charting Library package so we can complete the licensed implementation properly.
```

## Shorter description if the form has a tight character limit

```txt
Cova is a trading journal/risk OS with an in-app Practice workspace. We want TradingView Advanced Charts as the charting surface for historical replay/backtesting. Cova will provide its own Datafeed API for candles, symbols, replay time, marks, and saved layouts, while Cova owns the simulated Buy/Sell/Close paper execution, practice ledger, P&L/R calculations, drawdown, rule-follow stats, and live-permission scoring. This is not broker execution and will not route live orders or move funds. The module will be hosted in Cova's authenticated web app and may be behind a subscription/paywall. We have already prepared the self-hosted integration path `/trading_platform/`, custom CSS path `/trading_view/cova-practice.css`, datafeed adapter, replay clock, and practice execution engine; we need official licensed access to complete it correctly.
```

## Optional attachment content

If TradingView allows a file upload, attach a short one-page integration brief/PDF containing:

- Cova product summary
- Screenshot of Practice route if available
- Architecture diagram:

```txt
Cova Practice UI
  -> TradingView Advanced Charts hosted from /trading_platform/
  -> Cova Datafeed API
  -> Historical market data provider/cache
  -> Cova replay clock
  -> Cova simulated execution ledger
  -> Cova risk/readiness analytics
```

- Explicit statement: `No live order routing; no brokerage execution; no movement of customer funds.`

## What TradingView access unlocks

Once approved and assets are available:

1. Place official package files under:

```txt
public/trading_platform/
```

2. Confirm this file exists:

```txt
public/trading_platform/charting_library.js
```

3. Run:

```bash
npm test
npm run build
npm run dev
```

4. Open Practice route.
5. Confirm the chart host switches from:

```txt
TRADINGVIEW FALLBACK
```

to:

```txt
TradingView hosted
```

6. Verify Cova Datafeed methods are hit and replay controls still update bars/marks.

## Raf needs to provide before submit

- `[RAF FULL NAME]`
- `[COVA COMPANY EMAIL]`
- `[COVA APP URL OR LANDING URL]`
- `[RAF/COVA GITHUB PROFILE]`
- whether Cova is live/public right now

After those are known, submit the form directly from:

```txt
https://www.tradingview.com/advanced-charts/
```
