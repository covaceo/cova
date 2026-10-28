import { useEffect, useRef, useState, type ComponentProps } from "react";
import { ArrowUpRight, ChevronDown, LockKeyhole } from "lucide-react";
import { formatMoney, formatPercent, formatR, type RiskRule } from "../lib/risk";
import type { Coach } from "./WorkspaceSections";
import "../styles/insightsView.css";

// Preserve the existing Coach contract and model semantics.
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

function SetupComparison({ rows, label, scale, selected, onSelect }: { rows: Setup[]; label: string; scale: number; selected: string | null; onSelect: (name: string, opener: HTMLButtonElement) => void }) {
  return <div className="ip-comparison" role="group" aria-label={label}>
    <div className="ip-r-axis" data-r-axis aria-label={`Average R scale: minus ${scale} to plus ${scale} R`}><span>−{scale}R</span><span>0R</span><span>+{scale}R</span></div>
    {rows.map((setup) => <button key={setup.name} type="button" className="ip-setup-choice" aria-pressed={selected === setup.name} aria-controls="ip-setup-evidence" data-setup-row data-r-eligible={eligible(setup)} data-open-setup={setup.name} onClick={event => onSelect(setup.name, event.currentTarget)}>
      <span className="ip-setup-identity"><strong>{setup.name || "Untagged"}</strong><span className="ip-r-value" data-negative={eligible(setup) && setup.avgR! < 0}>{eligible(setup) ? rValue(setup.avgR) : <span aria-label="Average R unavailable">—</span>}</span></span>
      <span className="ip-r-track" aria-hidden="true">{eligible(setup) && <i data-r-bar={setup.avgR} style={{ width: `${Math.abs(setup.avgR!) / scale * 50}%`, left: `${setup.avgR! < 0 ? 50 - Math.abs(setup.avgR!) / scale * 50 : 50}%` }} />}</span>
      <span className="ip-setup-metrics"><span>{setup.count} rows · {setup.riskCount} with risk{!eligible(setup) && <span className="ip-row-note">{setup.riskCount < 3 ? "Needs 3 rows for R" : "R unavailable"}</span>}</span><span>P&amp;L <b>{money(setup.pnl)}</b></span><span>Win <b>{finite(setup.winRate) ? formatPercent(setup.winRate) : "—"}</b></span></span>
    </button>)}
  </div>;
}

export function InsightsView({ analysis, entitlements, go, upgradeToPro, accountControl }: InsightsViewProps) {
  const [question, setQuestion] = useState("working");
  const [setupChoice, setSelectedSetup] = useState<string | null | undefined>(undefined);
  const [tradeId, setTradeId] = useState<string | null>(null);
  const [reflect, setReflect] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [recordsExpanded, setRecordsExpanded] = useState(false);
  const recordToggle = useRef<HTMLButtonElement>(null);
  const workbench = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const noteHeading = useRef<HTMLHeadingElement>(null);
  const returnTo = useRef<{ opener: HTMLButtonElement; x: number; y: number; parents: { element: HTMLElement; top: number; left: number }[] } | null>(null);
  const navigation = useRef<"detail" | "back" | null>(null);
  useEffect(() => {
    const phone = window.matchMedia("(max-width: 600px)");
    let focusFrame = 0;
    // A breakpoint change must not strand keyboard focus in a now-hidden pane.
    const keepFocusVisible = () => {
      cancelAnimationFrame(focusFrame);
      const active = document.activeElement === document.body ? lastFocus.current : document.activeElement;
      if (!(active instanceof HTMLElement) || !workbench.current?.contains(active)) return;
      if (phone.matches) {
        if (active.closest("#ip-setup-evidence")) setMobileDetail(true);
        else if (active.closest(".ip-setups")) setMobileDetail(false);
        if (active.closest(".ip-trades")) setRecordsExpanded(true);
        focusFrame = requestAnimationFrame(() => {
          if (active.isConnected && active.getClientRects().length && (document.activeElement === document.body || document.activeElement === active)) active.focus({ preventScroll: true });
        });
      } else if (active === recordToggle.current) {
        workbench.current.querySelector<HTMLButtonElement>('.ip-trade[aria-pressed="true"]')?.focus({ preventScroll: true });
      } else if (active.classList.contains("ip-back-setups")) {
        workbench.current.querySelector<HTMLButtonElement>('[data-open-setup][aria-pressed="true"]')?.focus({ preventScroll: true });
      }
    };
    phone.addEventListener("change", keepFocusVisible);
    return () => { phone.removeEventListener("change", keepFocusVisible); cancelAnimationFrame(focusFrame); };
  }, []);
  useEffect(() => {
    const action = navigation.current;
    navigation.current = null;
    if (action === "back" && window.matchMedia("(max-width: 600px)").matches) {
      const saved = returnTo.current;
      const opener = saved?.opener.isConnected ? saved.opener
        : workbench.current?.querySelector<HTMLButtonElement>('[data-open-setup][aria-pressed="true"]')
          ?? workbench.current?.querySelector<HTMLButtonElement>('[data-open-setup]');
      const disclosure = opener?.closest("details");
      if (disclosure) disclosure.open = true;
      const restorePosition = opener === saved?.opener;
      opener?.focus({ preventScroll: restorePosition });
      if (restorePosition && saved) {
        saved.parents.forEach(({ element, top, left }) => element.scrollTo({ top, left, behavior: "instant" }));
        window.scrollTo({ top: saved.y, left: saved.x, behavior: "instant" });
      }
    } else if (action === "detail" && mobileDetail && window.matchMedia("(max-width: 600px)").matches) {
      noteHeading.current?.closest("article")?.scrollIntoView({ block: "start", behavior: "instant" });
      noteHeading.current?.focus({ preventScroll: true });
    } else if (question === "why") noteHeading.current?.focus();
  }, [mobileDetail, question]);
  const ranked = analysis.bySetup.filter(eligible).sort((a, b) => b.avgR! - a.avgR!);
  // Keep explicit All setups; resolve automatic or stale choices against current history.
  const selectedSetup = setupChoice === null ? null
    : setupChoice !== undefined && analysis.bySetup.some(setup => setup.name === setupChoice) ? setupChoice
    : ranked[0]?.name ?? analysis.bySetup[0]?.name ?? null;
  const rows = analysis.trades.filter(trade => selectedSetup === null || trade.setup === selectedSetup);
  const trade = rows.find(row => row.id === tradeId) ?? rows[0];
  const selectSetup = (name: string, opener: HTMLButtonElement) => {
    setSelectedSetup(name); setTradeId(null); setReflect(false); setRecordsExpanded(false);
    if (window.matchMedia("(max-width: 600px)").matches) {
      const parents: { element: HTMLElement; top: number; left: number }[] = [];
      for (let element = opener.parentElement; element; element = element.parentElement) {
        if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) parents.push({ element, top: element.scrollTop, left: element.scrollLeft });
      }
      returnTo.current = { opener, x: window.scrollX, y: window.scrollY, parents };
      navigation.current = "detail";
      setMobileDetail(true);
    }
  };
  const backToSetups = () => { navigation.current = "back"; setMobileDetail(false); };
  const enabled = analysis.ruleStatuses.filter((status) => status.rule.enabled);
  const checked = enabled.filter((status) => status.evaluated);
  // Choose from the model's findings; do not re-evaluate rules or change their semantics.
  const breach = analysis.breaches.find((item) => item.rule.severity === "critical")
    ?? analysis.breaches.find((item) => item.rule.severity === "warning")
    ?? analysis.breaches[0];
  const rScale = Math.ceil(ranked.reduce((max, setup) => Math.max(max, Math.abs(setup.avgR!)), 1) * 2) / 2;
  const setups = [...ranked, ...analysis.bySetup.filter((setup) => !eligible(setup))];
  const best = ranked[0];
  const tied = best ? ranked.filter((setup) => setup.avgR === best.avgR).length > 1 : false;
  const setupFinding = ranked.length > 1 && best
    ? `${best.name || "Untagged"}: ${rValue(best.avgR)}, ${tied ? "joint-highest" : "highest"} average R across ${ranked.length} eligible setups.`
    : best
      ? `${best.name || "Untagged"} is the only setup with 3+ records with planned risk. No cross-setup R comparison yet.`
      : "Each setup needs at least 3 records with planned risk to compare R.";
  const finding = breach?.summary ?? (best ? setupFinding : !enabled.length
    ? "No enabled limits to check."
    : !checked.length ? "Enabled limits could not be evaluated."
    : `${checked.length} enabled limit${checked.length === 1 ? " was" : "s were"} checked; no breaches found.`);
  const findingEvidence = breach?.evidence ?? (best
    ? [`${best.riskCount}/${best.count} rows with planned risk`, `Average result: ${rValue(best.avgR)}`]
    : [`${analysis.tradeCount} trades in the imported history`, `${analysis.riskCount}/${analysis.trades.length} rows with planned risk`]);
  const brief = analysis.nextSessionBrief;
  const statusLabel = !checked.length ? "Limits not checked" : brief.status === "locked" ? "Review needed" : brief.status === "ready" ? "Summary ready" : "Needs attention";
  const visible = ["finding", "setups", "status"].slice(0, entitlements.insightLimit);
  const locked = 3 - visible.length;

  return <section className="li-page insights-preview" aria-labelledby="ip-title">
    <header className="li-header"><div><h1 id="ip-title">Insights</h1></div>{accountControl}</header>
    {analysis.tradeCount === 0 ? <article className="li-panel ip-empty" data-insights-empty>
      <h2>Start with your trades</h2>
      <p className="li-muted">Import trades to compare setups and check your limits.</p>
      <button className="li-button li-button-primary" type="button" onClick={() => go("import")}>Import trades<ArrowUpRight aria-hidden="true" /></button>
    </article> : <>

      <div className="ip-questions" role="group" aria-label="Explore your history">
        {[["working", "What’s working?"], ["tripping", "What’s tripping me up?"], ["why", "Why did I take that?"]].map(([id, label]) => <button key={id} type="button" className="ip-question" aria-pressed={question === id} aria-controls="ip-question-panel" onClick={() => { navigation.current = null; setMobileDetail(false); setQuestion(id); }}>{label}</button>)}
      </div>
      <div id="ip-question-panel" ref={workbench} className="ip-workbench" data-question={question} data-mobile-detail={mobileDetail} onFocusCapture={event => { lastFocus.current = event.target; }} onBlurCapture={event => { if (event.target.getClientRects().length) lastFocus.current = null; }}>
          {question === "working" && visible.includes("setups") && <article className="ip-setups" data-insight="setups">
            <h2>Your setups</h2>
            <p className="ip-setup-finding">{ranked.length > 1 && best ? <><strong>{best.name || "Untagged"}</strong> has the {tied ? "joint-highest" : "highest"} average R.</> : setupFinding}</p>
            {setups.length ? <SetupComparison selected={selectedSetup} rows={setups.slice(0, 4)} label="Setup comparison" scale={rScale} onSelect={selectSetup} /> : <p className="li-muted">No setup summaries are available for this history.</p>}
            {setups.length > 4 && <details className="li-details ip-details" data-more-setups><summary>All remaining setups<span className="li-muted">{setups.length - 4} more</span><ChevronDown aria-hidden="true" /></summary><SetupComparison selected={selectedSetup} rows={setups.slice(4)} label="Remaining setup comparison" scale={rScale} onSelect={selectSetup} /></details>}
            <p className="ip-caption">Avg. R: 3+ risk rows per setup. P&amp;L and win rate: all rows.</p>
            <details className="li-details ip-details" data-setup-method><summary>How R is calculated<ChevronDown aria-hidden="true" /></summary><div className="ip-detail-body"><p>R is P&amp;L divided by planned risk for each record. Setups are sorted by average R, with all bars on the same scale.</p><p>At least three records with planned risk are needed. That is a display minimum, not proof of a reliable pattern. Sample sizes and missing risk can affect the comparison.</p></div></details>
          </article>}
        {(question === "why" || question === "working" && visible.includes("setups")) && <article id="ip-setup-evidence" data-insight="notes">
          {question === "working" && <button className="li-button li-button-quiet ip-back-setups" type="button" onClick={backToSetups}>Back to setups</button>}
          <div className="ip-panel-heading"><h2 ref={noteHeading} tabIndex={-1}>Your trade notes</h2><button className="li-button li-button-quiet" type="button" onClick={() => go("dashboard")}>Open Risk Desk<ArrowUpRight aria-hidden="true" /></button></div>
          <div className="ip-note-filters"><label><span className="ip-filter-label">Setup</span><select value={JSON.stringify(selectedSetup)} onChange={event => { setSelectedSetup(JSON.parse(event.target.value)); setTradeId(null); setReflect(false); setRecordsExpanded(false); }}><option value="null">All setups</option>{analysis.bySetup.map(setup => <option key={setup.name} value={JSON.stringify(setup.name)}>{setup.name || "Untagged"}</option>)}</select></label><span className="li-muted">{rows.length} trade records</span></div>
          <div className="ip-notebook" data-records-expanded={recordsExpanded}>
          {trade && <button ref={recordToggle} className="ip-record-toggle" type="button" aria-expanded={recordsExpanded} aria-controls="ip-records" aria-label={`Choose trade record: ${trade.date}, ${trade.market}, ${trade.side}, ${money(trade.pnl)}`} onClick={() => setRecordsExpanded(!recordsExpanded)}><span>{trade.date}<span className="ip-row-note">{trade.market} · {trade.side}</span></span><span>{money(trade.pnl)}<ChevronDown aria-hidden="true" /></span></button>}
          <div id="ip-records" className="ip-trades" role="group" aria-label="Recorded trades">{rows.map(row => <button className="ip-trade" key={row.id} type="button" aria-pressed={trade?.id === row.id} onClick={() => { setTradeId(row.id); setReflect(false); setRecordsExpanded(false); if (window.matchMedia("(max-width: 600px)").matches) recordToggle.current?.focus({ preventScroll: true }); }}><span>{row.date}<span className="ip-row-note">{row.market} · {row.side}</span></span><span>{money(row.pnl)}</span></button>)}</div>
          {trade ? <div className="ip-note" key={trade.id}>
            <p className="ip-trade-facts">{trade.market} · {trade.side} · {trade.contracts} {trade.contracts === 1 ? "contract" : "contracts"} · {trade.date}</p>
            <blockquote data-trade-note>{trade.notes.trim() ? trade.notes : "No note on this trade."}</blockquote>
            <p className="ip-caption">P&amp;L: {money(trade.pnl)} · Planned risk: {trade.riskStatus !== "missing" && finite(trade.risk) && trade.risk > 0 ? money(trade.risk) : "not provided"}</p>
            <button className="li-button" type="button" aria-expanded={reflect} aria-controls="ip-reflection" onClick={() => setReflect(!reflect)}>{reflect ? "Close reflection" : "Try a reflection"}</button>
            {reflect && <div id="ip-reflection" className="ip-reflection"><p>What did you know before the outcome?</p><p className="li-muted">{trade.notes.trim() ? "Which part of your note explains the entry, rather than the result?" : "What made you enter, and what would have invalidated the setup?"}</p><button className="li-button li-button-quiet" type="button" onClick={() => go("dashboard")}>Open journal<ArrowUpRight aria-hidden="true" /></button></div>}
          </div> : <p>No trade records match this setup.</p>}</div>
        </article>}
          {question === "tripping" && visible.includes("finding") && <article className="li-panel ip-finding" data-insight="finding">
            <div className="ip-finding-top"><div className="ip-finding-copy">

              <p className="ip-finding-statement">{finding}</p>
              <div className="ip-visible-evidence" aria-label="Finding evidence"><Evidence lines={findingEvidence.slice(0, 2)} /></div>
            </div><div className="ip-actions"><button className="li-button li-button-primary" type="button" onClick={() => go(breach || !enabled.length || !checked.length ? "rules" : "dashboard")}>{breach || !enabled.length || !checked.length ? "Review limits" : "Review trades"}<ArrowUpRight aria-hidden="true" /></button></div></div>
            <details className="li-details ip-details" data-limit-evidence><summary>Limit checks<span className="li-muted">{checked.length} of {enabled.length} checked</span><ChevronDown aria-hidden="true" /></summary>
              <div className="ip-detail-body">
                <p className="li-muted">Your past trades are checked against your current limits. Disabled limits are skipped.</p>
                {!enabled.length && <p>Enable a limit to check your trades against it.</p>}
                {enabled.map((status) => <section className="ip-evidence-entry" key={status.rule.id} data-rule-evidence={status.rule.id}>
                  <div className="ip-panel-heading"><h3>{status.rule.name}</h3><span className="li-muted">{!status.evaluated ? "Not evaluated" : status.breached ? "Breached" : "Inside limit"}</span></div>
                  <p>{status.summary}</p><p className="li-muted">Threshold: {threshold(status.rule)}</p><Evidence lines={status.evidence} />
                </section>)}
              </div>
            </details>
          </article>}
        {question === "tripping" && <div className="ip-context">          {visible.includes("status") && <article className="ip-review" data-insight="status">
            <p className="li-muted">{statusLabel}</p>
            <p className="ip-review-headline">{!enabled.length ? "No enabled limits to check." : !checked.length ? "More trade data is needed to check your limits." : brief.headline}</p>
            <Evidence lines={brief.evidence.slice(0, 1)} />
            {!enabled.length && <p className="ip-caption">The summary below uses default thresholds, not enabled limits.</p>}
            <details className="li-details ip-details" data-review-context><summary>More details<ChevronDown aria-hidden="true" /></summary><div className="ip-detail-body">
              <p>{brief.summary}</p><Evidence lines={brief.evidence} />
              {brief.watchlist.length > 0 && <><h3>Watchlist</h3><Evidence lines={brief.watchlist} /></>}
              <h3>Thresholds used</h3><p className="li-muted">The summary can use defaults when a limit is disabled. See Limit checks for your enabled limits.</p><Evidence lines={brief.guardrails} />
              {analysis.behaviorFlags.map((flag) => <section className="ip-evidence-entry" key={flag.id}><h3>{flag.label}</h3><p>{flag.summary}</p><Evidence lines={flag.evidence} /></section>)}
            </div></details>
          </article>}
        {locked > 0 && <div data-insights-locked><p className="li-muted">Get the full breakdown with Pro.</p><button className="li-button" onClick={upgradeToPro} type="button">Unlock Pro<LockKeyhole aria-hidden="true" /></button></div>}</div>}
      </div>
          <div className="ip-coverage">

            {analysis.missingRiskCount > 0 && <p className="ip-caption" data-planned-risk-coverage>{analysis.missingRiskCount} of {analysis.trades.length} rows have no planned risk. R uses only the {analysis.riskCount} usable rows; P&amp;L is unchanged.</p>}
            {analysis.legacyRiskCount > 0 && <p className="ip-caption" data-legacy-risk-caveat>{analysis.legacyRiskCount} older CSV rows have unverified risk values. Check the original planned-risk amounts before relying on R.</p>}
            {!enabled.length ? <p className="ip-caption" data-rules-unchecked>No enabled limits. Your trades have not been checked against limits.</p> : checked.length < enabled.length ? <p className="ip-caption" data-rules-unchecked>{enabled.length - checked.length} enabled limit{enabled.length - checked.length === 1 ? " was" : "s were"} not checked. See Limit checks for details.</p> : null}
          </div>
    </>}
    <footer className="ip-footer">{analysis.tradeCount > 0 && <><button className="li-button li-button-quiet" type="button" onClick={() => go("passport")}>Share Risk Passport<ArrowUpRight aria-hidden="true" /></button><span>Through {analysis.latestDate}</span></>}</footer>
  </section>;
}
