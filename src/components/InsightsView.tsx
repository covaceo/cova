import type { ComponentProps } from "react";
import { ArrowUpRight, ChevronDown, LockKeyhole } from "lucide-react";
import { formatMoney, formatPercent, formatR, type RiskRule } from "../lib/risk";
import type { Coach } from "./WorkspaceSections";
import "../styles/insightsView.css";

// Keep this preview substitutable for Coach without a second props contract.
type InsightsViewProps = ComponentProps<typeof Coach>;
type Setup = InsightsViewProps["analysis"]["bySetup"][number];
const finite = (value: number | null): value is number => value !== null && Number.isFinite(value);
const money = (value: number) => finite(value) ? formatMoney(value) : "—";
const rValue = (value: number | null) => finite(value) ? formatR(value) : "—";
const eligible = (setup: Setup) => setup.riskCount >= 3 && finite(setup.avgR);

function threshold(rule: RiskRule) {
  if (!finite(rule.limit)) return "—";
  switch (rule.metric) {
    case "maxDailyLoss":
    case "maxTradeLoss": return money(rule.limit);
    case "maxContracts": return `${rule.limit} contract${rule.limit === 1 ? "" : "s"}`;
    case "maxLossStreak": return `${rule.limit} losses`;
    case "minAvgR": return rValue(rule.limit);
    case "minProfitFactor": return `${rule.limit.toFixed(2)} profit factor`;
  }
}

function Evidence({ lines }: { lines: string[] }) {
  return <ul className="ip-evidence-list">{lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul>;
}

function SetupTable({ rows, label }: { rows: Setup[]; label: string }) {
  return <div className="ip-table-scroll" tabIndex={0} role="region" aria-label={label}>
    <table className="ip-setup-table">
      <caption className="ip-sr-only">{label}. Average R is shown only for setups with at least three risk-provided rows.</caption>
      <thead><tr><th scope="col">Setup</th><th scope="col">Risk rows</th><th scope="col">Avg. R</th><th scope="col">P&amp;L</th><th scope="col">Win rate</th></tr></thead>
      <tbody>{rows.map((setup) => <tr key={setup.name} data-setup-row data-r-eligible={eligible(setup)}>
        <th scope="row">{setup.name || "Untagged"}<span className="ip-row-note">{setup.count} imported row{setup.count === 1 ? "" : "s"}</span></th>
        <td>{setup.riskCount}<span className="li-muted">/{setup.count}</span></td>
        <td className="ip-r-value" data-negative={eligible(setup) && setup.avgR! < 0}>{eligible(setup) ? rValue(setup.avgR) : <><span aria-label="Average R unavailable">—</span><span className="ip-row-note">{setup.riskCount < 3 ? "Needs 3 rows" : "Unavailable"}</span></>}</td>
        <td>{money(setup.pnl)}</td>
        <td>{finite(setup.winRate) ? formatPercent(setup.winRate) : "—"}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export function InsightsView({ analysis, entitlements, go, upgradeToPro, accountControl }: InsightsViewProps) {
  const enabled = analysis.ruleStatuses.filter((status) => status.rule.enabled);
  const checked = enabled.filter((status) => status.evaluated);
  // Choose from the model's findings; do not re-evaluate rules or change their semantics.
  const breach = analysis.breaches.find((item) => item.rule.severity === "critical")
    ?? analysis.breaches.find((item) => item.rule.severity === "warning")
    ?? analysis.breaches[0];
  const ranked = analysis.bySetup.filter(eligible).sort((a, b) => b.avgR! - a.avgR!);
  const setups = [...ranked, ...analysis.bySetup.filter((setup) => !eligible(setup))];
  const best = ranked[0];
  const tied = best ? ranked.filter((setup) => setup.avgR === best.avgR).length > 1 : false;
  const setupFinding = ranked.length > 1 && best
    ? `${best.name || "Untagged"}: ${rValue(best.avgR)}, ${tied ? "joint-highest" : "highest"} average R across ${ranked.length} eligible setups.`
    : best
      ? `${best.name || "Untagged"} is the only setup with 3+ risk-provided rows. No cross-setup R comparison yet.`
      : "No setup has enough usable planned-risk rows for an R comparison.";
  const finding = breach?.summary ?? (best ? setupFinding : !enabled.length
    ? "No enabled limits to check."
    : !checked.length ? "Enabled limits could not be evaluated."
    : `${checked.length} enabled limit${checked.length === 1 ? " was" : "s were"} checked; no breaches found.`);
  const findingEvidence = breach?.evidence ?? (best
    ? [`${best.riskCount}/${best.count} rows with planned risk`, `Average result: ${rValue(best.avgR)}`]
    : [`${analysis.tradeCount} trades in the imported history`, `${analysis.riskCount}/${analysis.trades.length} rows with planned risk`]);
  const brief = analysis.nextSessionBrief;
  const statusLabel = !checked.length ? "Limits not checked" : brief.status === "locked" ? "Needs inspection" : brief.status === "ready" ? "No active blocker" : "Caution";
  const visible = ["finding", "setups", "status"].slice(0, entitlements.insightLimit);
  const locked = 3 - visible.length;

  return <section className="li-page insights-preview" aria-labelledby="ip-title">
    <header className="li-header"><div><h1 id="ip-title">Insights</h1><p className="li-muted">What stands out in your imported history.</p></div>{accountControl}</header>
    {analysis.tradeCount === 0 ? <article className="li-panel ip-empty" data-insights-empty>
      <h2>Your history is the starting point.</h2>
      <p className="li-muted">Import trades to review limits and compare recorded setup results.</p>
      <button className="li-button li-button-primary" type="button" onClick={() => go("import")}>Import trades<ArrowUpRight aria-hidden="true" /></button>
    </article> : <>
      <div className="ip-scope"><span>{analysis.tradeCount} trades · {analysis.trades.length} imported rows</span><span>Through {analysis.latestDate}</span></div>
      <div className="ip-layout">
        <div className="ip-main">
          {visible.includes("finding") && <article className="li-panel ip-finding" data-insight="finding">
            <div className="ip-panel-heading"><h2>First to review</h2><span className="li-status" data-tone={breach ? "warning" : "neutral"}>{breach ? "Historical breach" : best ? "Setup evidence" : "Limit review"}</span></div>
            <p className="ip-finding-statement">{finding}</p>
            <div className="ip-proof">
              {breach && <div className="ip-threshold"><span className="li-muted">{breach.rule.name}</span><strong>{threshold(breach.rule)}</strong><span className="li-muted">Configured threshold</span></div>}
              <div className="ip-visible-evidence" aria-label="Finding evidence"><Evidence lines={findingEvidence.slice(0, 2)} /></div>
            </div>
            <div className="ip-actions"><button className="li-button li-button-primary" type="button" onClick={() => go(breach || !enabled.length || !checked.length ? "rules" : "dashboard")}>{breach ? "Review active limits" : !enabled.length || !checked.length ? "Review limits" : "Review trade history"}<ArrowUpRight aria-hidden="true" /></button></div>
            <details className="li-details ip-details" data-limit-evidence><summary>Limit checks &amp; evidence<span className="li-muted">{checked.length} checked</span><ChevronDown aria-hidden="true" /></summary>
              <div className="ip-detail-body">
                <p className="li-muted">Checks use the current thresholds against imported history. Disabled limits are excluded; changing a limit does not change a recorded trade.</p>
                {!enabled.length && <p>No limits are enabled. This is not a clean risk review.</p>}
                {enabled.map((status) => <section className="ip-evidence-entry" key={status.rule.id} data-rule-evidence={status.rule.id}>
                  <div className="ip-panel-heading"><h3>{status.rule.name}</h3><span className="li-muted">{!status.evaluated ? "Not evaluated" : status.breached ? "Breached" : "Inside limit"}</span></div>
                  <p>{status.summary}</p><p className="li-muted">Threshold: {threshold(status.rule)}</p><Evidence lines={status.evidence} />
                </section>)}
              </div>
            </details>
          </article>}
          {visible.includes("setups") && <article className="li-panel ip-setups" data-insight="setups">
            <div className="ip-panel-heading"><h2>Setup comparison</h2><span className="li-muted">{analysis.bySetup.length} setups</span></div>
            <p className="ip-setup-finding">{setupFinding}</p>
            {setups.length ? <SetupTable rows={setups.slice(0, 4)} label="Setup comparison" /> : <p className="li-muted">No setup summaries are available for this history.</p>}
            {setups.length > 4 && <details className="li-details ip-details" data-more-setups><summary>All remaining setups<span className="li-muted">{setups.length - 4} more</span><ChevronDown aria-hidden="true" /></summary><SetupTable rows={setups.slice(4)} label="Remaining setup comparison" /></details>}
            <p className="ip-caption">R comparison requires 3+ risk-provided rows per setup. P&amp;L and win rate include all rows; R uses only rows with usable planned risk.</p>
            <details className="li-details ip-details" data-setup-method><summary>How to read this comparison<ChevronDown aria-hidden="true" /></summary><div className="ip-detail-body"><p>Average R is the mean of each usable row’s P&amp;L divided by its planned risk. Eligible setups are ordered by average R, not by sample quality.</p><p>Three rows is the display minimum, not statistical confidence. Different sample sizes and missing risk can affect the comparison; recorded results do not predict the next trade.</p></div></details>
          </article>}
        </div>
        <aside className="ip-side" aria-label="Review context">
          {visible.includes("status") && <article className="li-panel ip-review" data-insight="status">
            <div className="ip-panel-heading"><h2>Review status</h2><span className="li-status" data-tone={brief.status === "ready" ? "neutral" : "warning"}>{statusLabel}</span></div>
            <p className="ip-review-headline">{!enabled.length ? "No enabled limits to check against this history." : !checked.length ? "The enabled limits need usable evidence before they can be evaluated." : brief.headline}</p>
            <Evidence lines={brief.evidence.slice(0, 1)} />
            {!enabled.length && <p className="ip-caption">No limits are enabled. Model context may use reference defaults; no configured limits were checked.</p>}
            <details className="li-details ip-details" data-review-context><summary>Review context<ChevronDown aria-hidden="true" /></summary><div className="ip-detail-body">
              <h3>{brief.headline}</h3><p>{brief.summary}</p><h3>Model evidence</h3><Evidence lines={brief.evidence} />
              {brief.watchlist.length > 0 && <><h3>Watchlist</h3><Evidence lines={brief.watchlist} /></>}
              <h3>Reference thresholds</h3><p className="li-muted">These model reference values can fall back to defaults when a rule is disabled. Active checks are listed under Limit checks &amp; evidence.</p><Evidence lines={brief.guardrails} />
              <p className="li-muted">Model state: {brief.status}. This is a historical review state, not broker permission or an order block.</p>
              {analysis.behaviorFlags.map((flag) => <section className="ip-evidence-entry" key={flag.id}><h3>{flag.label}</h3><p>{flag.summary}</p><Evidence lines={flag.evidence} /></section>)}
            </div></details>
          </article>}
          {locked > 0 && <article className="li-panel ip-upgrade" data-insights-locked>
            <div className="ip-panel-heading"><h2>{visible.includes("setups") ? "Deeper review context" : "More of the review"}</h2><LockKeyhole aria-hidden="true" /></div>
            <p className="li-muted">{locked} additional insight{locked === 1 ? "" : "s"} on Pro. {visible.includes("setups") ? "See the model’s review status and supporting evidence." : "Unlock the full three-part historical review."}</p>
            <button className="li-button" type="button" onClick={upgradeToPro}>Unlock Pro<ArrowUpRight aria-hidden="true" /></button>
          </article>}
          <article className="li-panel ip-coverage" aria-labelledby="ip-coverage-heading">
            <h2 id="ip-coverage-heading">Evidence coverage</h2>
            <div className="ip-coverage-value"><strong>{analysis.riskCount}<span>/{analysis.trades.length}</span></strong><span className="li-muted">rows with usable planned risk</span></div>
            {analysis.missingRiskCount > 0 && <p className="ip-caption" data-planned-risk-coverage>{analysis.missingRiskCount} of {analysis.trades.length} rows have no planned risk. R uses only the {analysis.riskCount} usable rows; P&amp;L is unchanged.</p>}
            {analysis.legacyRiskCount > 0 && <p className="ip-caption" data-legacy-risk-caveat>{analysis.legacyRiskCount} older CSV rows have unverified risk values. Check the original planned-risk amounts before relying on R.</p>}
            {!enabled.length ? <p className="ip-caption" data-rules-unchecked>No enabled limits. History has not been checked against configured thresholds.</p> : checked.length < enabled.length ? <p className="ip-caption" data-rules-unchecked>{enabled.length - checked.length} enabled limit{enabled.length - checked.length === 1 ? " was" : "s were"} not evaluated. See limit evidence.</p> : null}
          </article>
        </aside>
      </div>
    </>}
    <footer className="ip-footer"><span>Historical review, not a trade signal.</span>{analysis.tradeCount > 0 && <button className="li-button li-button-quiet" type="button" onClick={() => go("passport")}>Share Risk Passport<ArrowUpRight aria-hidden="true" /></button>}</footer>
  </section>;
}
