# Cova performance score v2

Status: versioned implementation; not empirically calibrated.

## What the number means

A deterministic 0–100 index of the selected account(s)' **recorded realized daily P&L**, not a percentile, predicted probability of profit, account verification, capital return, risk-compliance certificate, or recommendation to trade. Equal observations produce equal scores. Display precision is one decimal, not a promise that differences of 0.1 are statistically meaningful.

Use the full selected history, not the equity chart's temporary date range. Preserve account/owner selection and every source row. No score is persisted or uploaded, and no user identity, subscription, display name, risk annotation, rule toggle, market label, or account size bonus affects the computation.

## Supported evidence

All rows must have distinct nonempty IDs, real ISO close dates, safe cent-precision money and supported USD provenance. Manual records retain their explicit gross or reported-net basis. Tradovate supported USD futures with explicit gross basis stay gross. Rithmic USD records remain reported P&L, not inferred net. Built-in sample records must match the actual sample identities and amounts and remain labeled Sample.

Unknown currency, conflicting manual/provider provenance, duplicate IDs, invalid dates/precision/amounts, and mixed P&L bases yield an unavailable score and a reason. No bad rows are silently dropped. Source data is untouched. Unknown-currency legacy CSV cannot be safely graded by assuming dollars; users need supported provenance. Rithmic and Tradovate do not automatically share a known fee basis.

Aggregate rows by their recorded close date in integer cents. This prevents same-day partial exits, fill fragmentation, zero rows and sorting from manufacturing extra evidence. These are **recorded days**, not certified exchange sessions or independent trials. Day-end drawdown can miss intraday losses. No opening balances, market exposure, unrealized P&L, complete-position boundaries or planned risk are inferred. Existing per-trade and daily-limit warnings remain separate and visible.

The score intentionally does not use cash-backed net headlines, which may cover a different subset of history. No per-trade fee allocation is manufactured. The existing net headline and exact-money calculations are unchanged. The score's recorded basis is shown inside Review details. A net-backed whole-history version requires a separately validated, coverage-complete input contract.

## Reproducible formula

Let d[i] be each nonzero recorded daily result in cents, chronologically ordered. Zero days are retained in the receipt but excluded from the scoring denominator; idle calendar days are never inserted.

- n = count of nonzero days
- P = sum of positive d
- L = absolute sum of negative d
- T = P − L; A = P + L; Q = sum(d²)
- D = maximum peak-to-trough decline in the day-end cumulative series, beginning at zero

Three components, each bounded [0,1]:

1. **P&L balance**, 40%: P / A. Equivalent to bounded daily profit factor, without infinity. At break-even it is 0.5. Not raw trade win rate.
2. **Daily consistency**, 30%: (1 + T / sqrt(n × Q)) / 2. This is a signed mean/RMS measure, not Sharpe, annualized returns, or a hypothesis test. It captures result dispersion rather than paying again for trade count. It is correlated with profitability; its weight is not evidence of an independent predictor.
3. **Drawdown recovery**, 30%: (1 + T / (abs(T) + D)) / 2. Uses recorded day-end drawdown, not live equity drawdown. Histories with identical daily amounts but more concentrated losses get a lower recovery component when that ordering creates a deeper dip.

Raw score R = 100 × (0.4 × balance + 0.3 × consistency + 0.3 × recovery).

### History support, not a hard ceiling

Concentration-adjusted days E = A² / Q, bounded to [1,n]. Equal-sized days give E=n; one outsized day brings E toward 1. This is an inverse-concentration measure, **not statistical effective sample size** and not a confidence percentage.

Support weight W = E / (E + 10).

Final unrounded score S = R − max(0,R−50) × (1−W).

Only favorable evidence is discounted toward the neutral midpoint; loss-making evidence is never upgraded for having less history. This asymmetric policy prevents a catastrophic loss from earning an uplift merely by reducing E. There are no 72/86 ceilings or score jumps at 10/25 trades. Adding identical results on new days increases support continuously; splitting one day's result does not.

Credit each weighted component to two decimal points, sum those credited points for R, and round the history adjustment to two decimal points. The visible point rows therefore sum exactly. Round their final sum S to one decimal for the headline. The receipt carries R, each credited contribution, E, W, the adjustment and pre-headline S, so the final value can be reconstructed. No source monetary result is rounded by this process. A sufficiently large history can round to 100; that is not a claim of perfect or proven future performance.

Empty histories and histories whose recorded daily nets are all zero are unavailable, not a manufactured 0 or 50. A nonzero history with T=0 receives the neutral index value 50; detailed losses and rule warnings still apply.

## Deliberate limitations and policy choices

The weights 40/30/30 and ten-day support prior are transparent **Cova product policy**, not universal finance constants, statistically fitted coefficients or independently validated grades. Confidence labels describe history support, not predictive certainty. This candidate needs owner review and subsequent deidentified empirical calibration before stronger claims or a population ranking.

The number is invariant to uniformly scaling all monetary results. Making one outlier larger need not improve a risk-adjusted score. The model does not know account capital, leverage, hidden/open losses, omitted trades, session independence or completeness. It cannot detect fabricated manual data, selective imports, deliberate date changes, or cross-day loss deferral. Multiple compatible accounts are a pooled recorded-results view, not equal-weighted strategy evaluation.

Rules and editable planned risk cannot inflate the score. Missing planned risk remains missing; it affects separate R metrics, not this realized-performance index. A profitable score does not imply discipline or compliance. Passport's existing independent tier/eligibility controls remain in force; no billing, entitlement, verified-progress, or reward thresholds are changed here.

## Validation

Run `node --test scripts/performance-score-regression.mjs`. Tests cover determinism, trace reconstruction, scale/row-order/risk-edit invariance, partial-row fragmentation, zero-padding and calendar-gap resistance, one-win concentration, clustered drawdown, invalid evidence and exact cents. Synthetic property/scenario tests establish implementation behavior, **not real-world predictive validity**.

UI acceptance: dashboard and Passport use the same nullable value; no `null/100`, synthetic zero or stale score after switching account; controls and money are preserved; Customer surfaces show the score and plain-language feedback, not weighted contributions, model formulas or adjustment tables. Review details retains actionable warnings, next-review actions and the recorded P&L basis. Full calculation receipts and methodology remain internal for reproducibility and testing. Test actual App account switching, rule toggles, manual edits, reload and Chromium/WebKit mobile/desktop layout. No physical-iPhone claim.
