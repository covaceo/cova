import { useEffect, useId, useState, type ComponentProps } from "react";
import { ArrowUpRight, ChevronDown, LockKeyhole } from "lucide-react";
import { type RiskRule } from "../lib/risk";
import type { RulesEngine } from "./WorkspaceSections";
import "../styles/limitsEditor.css";

type LimitsEditorProps = ComponentProps<typeof RulesEngine>;

const ruleLabels: Record<RiskRule["metric"], string> = {
  maxDailyLoss: "Daily loss",
  maxTradeLoss: "Single-trade loss",
  maxContracts: "Position size",
  maxLossStreak: "Loss streak",
  minProfitFactor: "Profit factor",
  minAvgR: "Average R",
};

function ruleBounds(rule: RiskRule) {
  const count = rule.metric === "maxContracts" || rule.metric === "maxLossStreak";
  const minimum = rule.metric.includes("min");
  return {
    count,
    minimum,
    min: count ? 1 : minimum ? 0 : 100,
    max: rule.metric === "maxContracts" ? 10 : rule.metric === "maxLossStreak" ? 8 : minimum ? 3 : 10000,
    step: count ? 1 : minimum ? 0.05 : 50,
    unit: rule.metric === "maxContracts" ? "contracts" : rule.metric === "maxLossStreak" ? "losses" : rule.metric === "minAvgR" ? "R" : rule.metric === "minProfitFactor" ? "ratio" : "USD",
  };
}

function LimitRule({ rule, locked, update, upgradeToPro }: {
  rule: RiskRule;
  locked: boolean;
  update: (patch: Partial<Pick<RiskRule, "limit" | "enabled">>) => void;
  upgradeToPro: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(rule.limit));
  const [error, setError] = useState("");
  const bounds = ruleBounds(rule);
  useEffect(() => {
    setDraft(String(rule.limit));
    setError("");
  }, [rule.id, rule.limit]);

  const state = rule.enabled ? "enabled" : "off";
  const stateLabel = rule.enabled ? "Enabled" : "Off";

  const commit = () => {
    if (locked) return;
    const value = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(value) || value < bounds.min || value > bounds.max || (bounds.count && !Number.isInteger(value))) {
      setError(`Enter ${bounds.count ? "a whole number" : "a value"} from ${bounds.min} to ${bounds.max}. Current limit unchanged.`);
      return;
    }
    setError("");
    setDraft(String(value));
    if (value !== rule.limit) update({ limit: value });
  };

  return (
    <article className="limits-rule" data-rule-id={rule.id} data-rule-metric={rule.metric} data-rule-state={state}>
      <div className="limits-rule-top">
        <div className="limits-rule-copy">
          <h3 id={`${id}-title`}>{ruleLabels[rule.metric]}</h3>
          <span className="limits-rule-status" data-state={state}>{stateLabel}</span>
        </div>
        <div className="limits-rule-controls">
          <label className="limits-value">
            <span className="limits-sr-only">{rule.name} limit</span>
            <input
              type="number"
              inputMode={bounds.count ? "numeric" : "decimal"}
              min={bounds.min}
              max={bounds.max}
              step={bounds.count ? 1 : "any"}
              value={draft}
              disabled={locked}
              aria-label={`${rule.name} limit`}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-unit${error ? ` ${id}-error` : ""}${locked ? ` ${id}-lock` : ""}`}
              onChange={(event) => { setDraft(event.target.value); setError(""); }}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                if (event.key === "Escape") { event.preventDefault(); setDraft(String(rule.limit)); setError(""); }
              }}
            />
            <span id={`${id}-unit`} className="limits-unit">{bounds.unit}</span>
          </label>
          <button
            className="limits-toggle"
            type="button"
            role="switch"
            aria-checked={rule.enabled}
            aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
            aria-describedby={locked ? `${id}-lock` : undefined}
            disabled={locked}
            onClick={() => update({ enabled: !rule.enabled })}
          ><span className="limits-toggle-track" aria-hidden="true"><span /></span></button>
        </div>
      </div>
      {error && <p className="limits-input-error" id={`${id}-error`} role="alert">{error}</p>}
      <details className="li-details limits-rule-details">
        <summary aria-label={`Adjust range for ${ruleLabels[rule.metric]}`}><span>Adjust range</span><ChevronDown aria-hidden="true" /></summary>
        <div className="limits-rule-evidence">
          <label className="limits-slider">
            <span>{bounds.minimum ? "Minimum" : "Maximum"} · {rule.limit} {bounds.unit}</span>
            <input
              type="range" min={bounds.min} max={bounds.max} step={bounds.step}
              value={rule.limit} disabled={locked}
              aria-label={`${rule.name} slider`}
              aria-describedby={locked ? `${id}-lock` : undefined}
              onChange={(event) => { const limit = Number(event.target.value); setDraft(String(limit)); setError(""); update({ limit }); }}
            />
            <span className="limits-slider-range" aria-hidden="true"><span>{bounds.min}</span><span>{bounds.max}</span></span>
          </label>
        </div>
      </details>
      {locked && <p className="limits-rule-lock" id={`${id}-lock`}><LockKeyhole aria-hidden="true" /><span>View-only on Free.</span><button className="li-button li-button-quiet" onClick={upgradeToPro} type="button">Pro to edit<ArrowUpRight aria-hidden="true" /></button></p>}
    </article>
  );
}

export function LimitsEditor({ entitlements, rules, setRules, upgradeToPro, accountControl }: LimitsEditorProps) {
  const id = useId();
  const core = rules.filter((rule) => !rule.metric.includes("min"));
  const advanced = rules.filter((rule) => rule.metric.includes("min"));

  const renderRule = (rule: RiskRule) => <LimitRule
    key={rule.id} rule={rule}

    locked={rule.metric.includes("min") && !entitlements.canEditAdvancedLimits}
    update={(patch) => setRules(rules.map((item) => item.id === rule.id ? { ...item, ...patch } : item))}
    upgradeToPro={upgradeToPro}
  />;

  return (
    <section className="li-page limits-preview" aria-labelledby={`${id}-title`}>
      <header className="li-header"><div className="li-header-copy"><h1 id={`${id}-title`}>Limits</h1><p>Set the thresholds that fit your trading.</p></div>{accountControl}</header>
      <div className="limits-layout">
        <div className="limits-main">
          <section className="li-panel limits-core" aria-labelledby={`${id}-core`}>
            <div className="limits-panel-heading"><h2 id={`${id}-core`}>Core limits</h2><span className="li-muted">{core.filter((rule) => rule.enabled).length} of {core.length} enabled</span></div>
            <p className="li-muted limits-edit-note">Values apply on Enter or when you leave a field.</p>
            <div className="limits-rules">{core.map(renderRule)}</div>
          </section>
          <details className="li-panel li-details limits-advanced">
            <summary><span><strong>Advanced limits</strong><small className="li-muted">Profit factor · Average R</small></span><span className="limits-advanced-tail">{!entitlements.canEditAdvancedLimits && <span className="li-muted">View-only</span>}<ChevronDown aria-hidden="true" /></span></summary>
            <div className="limits-rules">{advanced.map(renderRule)}</div>
          </details>
        </div>
          <details className="li-details limits-about">
            <summary><span>How limits work</span><ChevronDown aria-hidden="true" /></summary>
            <p className="li-muted">Changing a threshold re-checks the same imported history. It does not rewrite a trade.</p>
            <p className="li-muted">Cova flags limits crossed in history. It does not block orders or change broker settings.</p>
          </details>
      </div>
    </section>
  );
}
