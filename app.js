"use strict";

const STORAGE_KEY = "cova-risk-os-state-v1";
const THEME_KEY = "cova-risk-os-theme";
const PASSPORT_PREFIX = "#passport=";

const metricDefinitions = {
  maxDailyLoss: {
    label: "Max daily loss",
    unit: "$",
    describe: (limit) => `Daily P&L must stay above -${formatMoney(limit)}.`,
  },
  maxTradeLoss: {
    label: "Max trade loss",
    unit: "$",
    describe: (limit) => `No single trade should lose more than ${formatMoney(limit)}.`,
  },
  maxContracts: {
    label: "Max contracts",
    unit: "ct",
    describe: (limit) => `Contracts per trade should not exceed ${limit}.`,
  },
  maxLossStreak: {
    label: "Max loss streak",
    unit: "trades",
    describe: (limit) => `Losing streak should not exceed ${limit} trades.`,
  },
  minProfitFactor: {
    label: "Min profit factor",
    unit: "x",
    describe: (limit) => `Profit factor should remain at or above ${limit}.`,
  },
  minAvgR: {
    label: "Min average R",
    unit: "R",
    describe: (limit) => `Average realized R should remain at or above ${limit}.`,
  },
};

const defaultRules = [
  {
    id: "rule-daily-loss",
    name: "Daily loss cap",
    metric: "maxDailyLoss",
    limit: 1500,
    severity: "critical",
    enabled: true,
  },
  {
    id: "rule-trade-loss",
    name: "Single-trade loss cap",
    metric: "maxTradeLoss",
    limit: 650,
    severity: "critical",
    enabled: true,
  },
  {
    id: "rule-size",
    name: "Size ceiling",
    metric: "maxContracts",
    limit: 5,
    severity: "warning",
    enabled: true,
  },
  {
    id: "rule-streak",
    name: "Loss-streak pause",
    metric: "maxLossStreak",
    limit: 3,
    severity: "warning",
    enabled: true,
  },
  {
    id: "rule-profit-factor",
    name: "Profit factor floor",
    metric: "minProfitFactor",
    limit: 1.25,
    severity: "info",
    enabled: true,
  },
  {
    id: "rule-average-r",
    name: "Average R floor",
    metric: "minAvgR",
    limit: 0.2,
    severity: "info",
    enabled: true,
  },
];

const sampleTrades = [
  {
    id: "demo-1",
    date: "2026-04-17",
    market: "NQ",
    side: "Long",
    contracts: 2,
    entry: 18460.25,
    exit: 18483.75,
    pnl: 940,
    risk: 500,
    setup: "Opening range",
    notes: "Waited for first pullback.",
  },
  {
    id: "demo-2",
    date: "2026-04-17",
    market: "ES",
    side: "Short",
    contracts: 3,
    entry: 5235.5,
    exit: 5229.25,
    pnl: 937.5,
    risk: 540,
    setup: "VWAP rejection",
    notes: "Clean rejection after failed high.",
  },
  {
    id: "demo-3",
    date: "2026-04-18",
    market: "NQ",
    side: "Long",
    contracts: 2,
    entry: 18512,
    exit: 18493,
    pnl: -760,
    risk: 520,
    setup: "Opening range",
    notes: "Late entry after extension.",
  },
  {
    id: "demo-4",
    date: "2026-04-18",
    market: "NQ",
    side: "Long",
    contracts: 4,
    entry: 18498.5,
    exit: 18484.25,
    pnl: -1140,
    risk: 600,
    setup: "Breakout continuation",
    notes: "Added size after first loss.",
  },
  {
    id: "demo-5",
    date: "2026-04-21",
    market: "CL",
    side: "Short",
    contracts: 2,
    entry: 81.24,
    exit: 80.92,
    pnl: 640,
    risk: 460,
    setup: "Level reclaim",
    notes: "Oil inventory fade.",
  },
  {
    id: "demo-6",
    date: "2026-04-21",
    market: "NQ",
    side: "Short",
    contracts: 1,
    entry: 18420.75,
    exit: 18406,
    pnl: 295,
    risk: 350,
    setup: "VWAP rejection",
    notes: "Reduced size into chop.",
  },
  {
    id: "demo-7",
    date: "2026-04-22",
    market: "ES",
    side: "Long",
    contracts: 4,
    entry: 5216.25,
    exit: 5211.75,
    pnl: -900,
    risk: 500,
    setup: "Breakout continuation",
    notes: "Breakout failed under prior high.",
  },
  {
    id: "demo-8",
    date: "2026-04-22",
    market: "ES",
    side: "Long",
    contracts: 6,
    entry: 5214.75,
    exit: 5209.5,
    pnl: -1575,
    risk: 650,
    setup: "Breakout continuation",
    notes: "Size exceeded plan.",
  },
  {
    id: "demo-9",
    date: "2026-04-23",
    market: "GC",
    side: "Long",
    contracts: 1,
    entry: 2398.1,
    exit: 2407.4,
    pnl: 930,
    risk: 420,
    setup: "Level reclaim",
    notes: "Held through retest.",
  },
  {
    id: "demo-10",
    date: "2026-04-24",
    market: "NQ",
    side: "Short",
    contracts: 3,
    entry: 18610.5,
    exit: 18620.75,
    pnl: -615,
    risk: 510,
    setup: "VWAP rejection",
    notes: "Invalidation respected.",
  },
  {
    id: "demo-11",
    date: "2026-04-24",
    market: "NQ",
    side: "Short",
    contracts: 3,
    entry: 18618,
    exit: 18629.25,
    pnl: -675,
    risk: 500,
    setup: "VWAP rejection",
    notes: "Second attempt was lower quality.",
  },
  {
    id: "demo-12",
    date: "2026-04-24",
    market: "NQ",
    side: "Short",
    contracts: 5,
    entry: 18625,
    exit: 18638.5,
    pnl: -1350,
    risk: 650,
    setup: "Opening range",
    notes: "Third attempt after two losses.",
  },
  {
    id: "demo-13",
    date: "2026-04-25",
    market: "ES",
    side: "Short",
    contracts: 2,
    entry: 5254.75,
    exit: 5248.25,
    pnl: 650,
    risk: 420,
    setup: "Opening range",
    notes: "Smaller size after drawdown.",
  },
  {
    id: "demo-14",
    date: "2026-04-28",
    market: "NQ",
    side: "Long",
    contracts: 2,
    entry: 18704.25,
    exit: 18726.75,
    pnl: 900,
    risk: 520,
    setup: "Opening range",
    notes: "Good stop discipline.",
  },
  {
    id: "demo-15",
    date: "2026-04-28",
    market: "NQ",
    side: "Long",
    contracts: 2,
    entry: 18735,
    exit: 18745.25,
    pnl: 410,
    risk: 450,
    setup: "Breakout continuation",
    notes: "Scaled quickly near target.",
  },
  {
    id: "demo-16",
    date: "2026-04-29",
    market: "CL",
    side: "Long",
    contracts: 1,
    entry: 80.44,
    exit: 80.07,
    pnl: -370,
    risk: 360,
    setup: "Level reclaim",
    notes: "No follow-through.",
  },
  {
    id: "demo-17",
    date: "2026-04-30",
    market: "GC",
    side: "Short",
    contracts: 1,
    entry: 2412.5,
    exit: 2402.9,
    pnl: 960,
    risk: 430,
    setup: "VWAP rejection",
    notes: "Best execution of week.",
  },
  {
    id: "demo-18",
    date: "2026-05-01",
    market: "ES",
    side: "Long",
    contracts: 3,
    entry: 5260.25,
    exit: 5256.75,
    pnl: -525,
    risk: 390,
    setup: "Opening range",
    notes: "No second entry taken.",
  },
  {
    id: "demo-19",
    date: "2026-05-01",
    market: "NQ",
    side: "Long",
    contracts: 2,
    entry: 18820.5,
    exit: 18843.75,
    pnl: 930,
    risk: 510,
    setup: "Level reclaim",
    notes: "Followed higher low.",
  },
  {
    id: "demo-20",
    date: "2026-05-04",
    market: "NQ",
    side: "Short",
    contracts: 3,
    entry: 18880,
    exit: 18861.25,
    pnl: 1125,
    risk: 540,
    setup: "VWAP rejection",
    notes: "Let winner reach planned target.",
  },
  {
    id: "demo-21",
    date: "2026-05-04",
    market: "ES",
    side: "Short",
    contracts: 2,
    entry: 5282,
    exit: 5278,
    pnl: 400,
    risk: 340,
    setup: "VWAP rejection",
    notes: "Partial near prior low.",
  },
  {
    id: "demo-22",
    date: "2026-05-05",
    market: "NQ",
    side: "Long",
    contracts: 4,
    entry: 18905.5,
    exit: 18897.75,
    pnl: -620,
    risk: 500,
    setup: "Breakout continuation",
    notes: "Small false break.",
  },
  {
    id: "demo-23",
    date: "2026-05-05",
    market: "NQ",
    side: "Long",
    contracts: 4,
    entry: 18900,
    exit: 18888.25,
    pnl: -940,
    risk: 520,
    setup: "Breakout continuation",
    notes: "Repeated setup without confirmation.",
  },
  {
    id: "demo-24",
    date: "2026-05-06",
    market: "GC",
    side: "Long",
    contracts: 1,
    entry: 2421.7,
    exit: 2430.3,
    pnl: 860,
    risk: 390,
    setup: "Level reclaim",
    notes: "Clean reclaim after London low.",
  },
  {
    id: "demo-25",
    date: "2026-05-06",
    market: "NQ",
    side: "Short",
    contracts: 2,
    entry: 18862.5,
    exit: 18850,
    pnl: 500,
    risk: 440,
    setup: "Opening range",
    notes: "Stopped trading after target window.",
  },
];

let state = loadState();
let sharedPassport = readPassportFromHash();

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  initializeTheme();
  bindEvents();

  if (sharedPassport) {
    routeTo("passport");
  } else {
    routeTo(location.hash.replace("#", "") || "dashboard");
  }

  render();
});

window.addEventListener("hashchange", () => {
  const passport = readPassportFromHash();
  if (passport) {
    sharedPassport = passport;
    routeTo("passport", { skipHash: true });
    render();
    return;
  }

  sharedPassport = null;
  routeTo(location.hash.replace("#", "") || "dashboard", { skipHash: true });
});

function cacheElements() {
  els.navTabs = Array.from(document.querySelectorAll("[data-route]"));
  els.metricGrid = document.querySelector("#metricGrid");
  els.equityCanvas = document.querySelector("#equityCanvas");
  els.flagList = document.querySelector("#flagList");
  els.setupTableBody = document.querySelector("#setupTableBody");
  els.marketMix = document.querySelector("#marketMix");
  els.sampleSizeChip = document.querySelector("#sampleSizeChip");
  els.flagCountChip = document.querySelector("#flagCountChip");
  els.accountPill = document.querySelector("#accountPill");
  els.csvFileInput = document.querySelector("#csvFileInput");
  els.csvTextInput = document.querySelector("#csvTextInput");
  els.importCsvButton = document.querySelector("#importCsvButton");
  els.clearTradesButton = document.querySelector("#clearTradesButton");
  els.loadSampleButton = document.querySelector("#loadSampleButton");
  els.importStatus = document.querySelector("#importStatus");
  els.tradeForm = document.querySelector("#tradeForm");
  els.tradeTableBody = document.querySelector("#tradeTableBody");
  els.tradeCountChip = document.querySelector("#tradeCountChip");
  els.rulesList = document.querySelector("#rulesList");
  els.addRuleButton = document.querySelector("#addRuleButton");
  els.coachGrid = document.querySelector("#coachGrid");
  els.passportCard = document.querySelector("#passportCard");
  els.sharePassportButton = document.querySelector("#sharePassportButton");
  els.shareTopButton = document.querySelector("#shareTopButton");
  els.footerShareButton = document.querySelector("#footerShareButton");
  els.printPassportButton = document.querySelector("#printPassportButton");
  els.resetDemoButton = document.querySelector("#resetDemoButton");
  els.themeToggle = document.querySelector("#themeToggle");
  els.heroScore = document.querySelector("#heroScore");
  els.heroPnl = document.querySelector("#heroPnl");
  els.heroCompliance = document.querySelector("#heroCompliance");
  els.railScore = document.querySelector("#railScore");
  els.topRiskScore = document.querySelector("#topRiskScore");
  els.topAccountLabel = document.querySelector("#topAccountLabel");
}

function bindEvents() {
  els.navTabs.forEach((tab) => {
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      routeTo(tab.dataset.route);
    });
  });

  els.csvFileInput.addEventListener("change", handleCsvFile);
  els.importCsvButton.addEventListener("click", importCsvFromTextarea);
  els.clearTradesButton.addEventListener("click", () => {
    state.trades = [];
    sharedPassport = null;
    saveState();
    setStatus("Trade ledger cleared.");
    render();
  });

  els.loadSampleButton.addEventListener("click", () => {
    state.trades = sampleTrades.map(cloneTrade);
    sharedPassport = null;
    saveState();
    setStatus("Loaded 25 sample trades.");
    render();
  });

  els.tradeForm.addEventListener("submit", handleTradeSubmit);
  els.addRuleButton.addEventListener("click", addRule);
  els.sharePassportButton.addEventListener("click", sharePassport);
  els.shareTopButton.addEventListener("click", sharePassport);
  els.footerShareButton.addEventListener("click", sharePassport);
  els.printPassportButton.addEventListener("click", () => window.print());
  els.resetDemoButton.addEventListener("click", resetDemo);
  els.themeToggle.addEventListener("click", toggleTheme);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.trades) && Array.isArray(saved.rules)) {
      return {
        trades: saved.trades.map(normalizeTrade).filter(Boolean),
        rules: saved.rules.map(normalizeRule).filter(Boolean),
      };
    }
  } catch (error) {
    console.warn("Unable to load Cova state", error);
  }

  return {
    trades: sampleTrades.map(cloneTrade),
    rules: defaultRules.map((rule) => ({ ...rule })),
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetDemo() {
  state = {
    trades: sampleTrades.map(cloneTrade),
    rules: defaultRules.map((rule) => ({ ...rule })),
  };
  sharedPassport = null;
  localStorage.removeItem(STORAGE_KEY);
  history.replaceState(null, "", "#dashboard");
  routeTo("dashboard", { skipHash: true });
  render();
}

function routeTo(route, options = {}) {
  const available = ["dashboard", "import", "rules", "coach", "passport"];
  const nextRoute = available.includes(route) ? route : "dashboard";

  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("is-active", screen.id === `screen-${nextRoute}`);
  });

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.route === nextRoute);
  });

  document.querySelectorAll(".rail-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.route === nextRoute);
  });

  if (!options.skipHash) {
    history.replaceState(null, "", `#${nextRoute}`);
  }

  if (nextRoute === "dashboard") {
    requestAnimationFrame(() => drawEquityChart(analyze(state.trades, state.rules)));
  }
}

function render() {
  const analysis = analyze(state.trades, state.rules);
  renderDashboard(analysis);
  renderTrades(analysis);
  renderRules(analysis);
  renderCoach(analysis);
  renderPassport(analysis);
}

function renderDashboard(analysis) {
  const metrics = [
    {
      label: "Cova Score",
      value: `${analysis.score}`,
      note: scoreLabel(analysis.score),
      mood: analysis.score >= 80 ? "good" : analysis.score >= 62 ? "warn" : "bad",
    },
    {
      label: "Net P&L",
      value: formatMoney(analysis.totalPnl),
      note: `${analysis.trades.length} trades across ${analysis.daily.length} sessions`,
      mood: analysis.totalPnl >= 0 ? "good" : "bad",
    },
    {
      label: "Rule State",
      value: `${analysis.activeRuleBreaches}/${analysis.enabledRules}`,
      note: `${formatPercent(analysis.ruleCompliance)} compliance`,
      mood: analysis.activeRuleBreaches === 0 ? "good" : analysis.activeRuleBreaches <= 2 ? "warn" : "bad",
    },
    {
      label: "Max Drawdown",
      value: formatMoney(-analysis.maxDrawdown),
      note: analysis.maxDrawdown === 0 ? "No closed-trade drawdown" : `Peak-to-trough risk drag`,
      mood: analysis.maxDrawdown <= 1200 ? "good" : analysis.maxDrawdown <= 2800 ? "warn" : "bad",
    },
    {
      label: "Profit Factor",
      value: Number.isFinite(analysis.profitFactor) ? analysis.profitFactor.toFixed(2) : "∞",
      note: `${formatPercent(analysis.winRate)} win rate`,
      mood: analysis.profitFactor >= 1.5 ? "good" : analysis.profitFactor >= 1.1 ? "warn" : "bad",
    },
    {
      label: "Average R",
      value: `${analysis.avgR.toFixed(2)}R`,
      note: `${analysis.currentStreak.label} streak: ${analysis.currentStreak.count}`,
      mood: analysis.avgR >= 0.35 ? "good" : analysis.avgR >= 0 ? "warn" : "bad",
    },
  ];

  els.metricGrid.innerHTML = metrics
    .map(
      (metric) => `
        <article class="metric-card ${metric.mood}">
          <span>${escapeHTML(metric.label)}</span>
          <strong>${escapeHTML(metric.value)}</strong>
          <small>${escapeHTML(metric.note)}</small>
        </article>
      `,
    )
    .join("");

  els.sampleSizeChip.textContent = `${analysis.trades.length} trades`;
  els.flagCountChip.textContent = `${analysis.breaches.length} flags`;
  els.accountPill.textContent = analysis.trades.length ? `${analysis.latestDate || "Latest"} ledger` : "No trades";
  if (els.heroScore) els.heroScore.textContent = analysis.score;
  if (els.railScore) els.railScore.textContent = analysis.score;
  if (els.topRiskScore) els.topRiskScore.textContent = analysis.score;
  if (els.topAccountLabel) els.topAccountLabel.textContent = analysis.trades.length ? "Evaluation Account" : "Awaiting Ledger";
  if (els.heroPnl) els.heroPnl.textContent = formatMoney(analysis.totalPnl);
  if (els.heroCompliance) els.heroCompliance.textContent = formatPercent(analysis.ruleCompliance);

  renderFlags(analysis);
  renderSetupTable(analysis);
  renderMarketMix(analysis);
  drawEquityChart(analysis);
}

function renderFlags(analysis) {
  if (!analysis.breaches.length) {
    els.flagList.innerHTML = `
      <div class="empty-state">
        <h3>All enabled rules are clean</h3>
        <p>${analysis.trades.length ? "Current ledger is inside the configured risk envelope." : "Import trades to activate the risk desk."}</p>
      </div>
    `;
    return;
  }

  els.flagList.innerHTML = analysis.breaches
    .slice(0, 6)
    .map(
      (breach) => `
        <article class="flag">
          <strong>
            ${escapeHTML(breach.ruleName)}
            <span class="severity ${escapeHTML(breach.severity)}">${escapeHTML(breach.severity)}</span>
          </strong>
          <p>${escapeHTML(breach.summary)}</p>
        </article>
      `,
    )
    .join("");
}

function renderSetupTable(analysis) {
  if (!analysis.bySetup.length) {
    els.setupTableBody.innerHTML = `<tr><td colspan="5">No setup data yet.</td></tr>`;
    return;
  }

  els.setupTableBody.innerHTML = analysis.bySetup
    .slice(0, 8)
    .map(
      (setup) => `
        <tr>
          <td>${escapeHTML(setup.name)}</td>
          <td>${setup.count}</td>
          <td>${formatPercent(setup.winRate)}</td>
          <td class="${setup.avgR >= 0 ? "positive" : "negative"}">${setup.avgR.toFixed(2)}R</td>
          <td class="${setup.pnl >= 0 ? "positive" : "negative"}">${formatMoney(setup.pnl)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderMarketMix(analysis) {
  if (!analysis.byMarket.length) {
    els.marketMix.innerHTML = `
      <div class="empty-state">
        <h3>No market exposure</h3>
        <p>Import or add trades to populate the exposure map.</p>
      </div>
    `;
    return;
  }

  const maxCount = Math.max(...analysis.byMarket.map((market) => market.count), 1);
  els.marketMix.innerHTML = analysis.byMarket
    .map(
      (market) => `
        <div class="market-row">
          <strong>${escapeHTML(market.name)}</strong>
          <div class="bar" aria-hidden="true">
            <span style="width: ${Math.max(8, (market.count / maxCount) * 100)}%"></span>
          </div>
          <span class="${market.pnl >= 0 ? "positive" : "negative"}">${formatMoney(market.pnl)}</span>
        </div>
      `,
    )
    .join("");
}

function renderTrades(analysis) {
  els.tradeCountChip.textContent = `${analysis.trades.length} trades`;

  if (!analysis.trades.length) {
    els.tradeTableBody.innerHTML = `<tr><td colspan="10">No trades loaded.</td></tr>`;
    return;
  }

  els.tradeTableBody.innerHTML = analysis.trades
    .slice()
    .reverse()
    .map(
      (trade) => `
        <tr>
          <td>${escapeHTML(trade.date)}</td>
          <td>${escapeHTML(trade.market)}</td>
          <td>${escapeHTML(trade.side)}</td>
          <td>${trade.contracts}</td>
          <td>${formatNumber(trade.entry)}</td>
          <td>${formatNumber(trade.exit)}</td>
          <td class="${trade.pnl >= 0 ? "positive" : "negative"}">${formatMoney(trade.pnl)}</td>
          <td class="${trade.r >= 0 ? "positive" : "negative"}">${trade.r.toFixed(2)}R</td>
          <td>${escapeHTML(trade.setup || "Unlabeled")}</td>
          <td class="cell-actions">
            <button class="delete-button" type="button" aria-label="Delete trade" data-delete-trade="${escapeHTML(trade.id)}">×</button>
          </td>
        </tr>
      `,
    )
    .join("");

  els.tradeTableBody.querySelectorAll("[data-delete-trade]").forEach((button) => {
    button.addEventListener("click", () => {
      state.trades = state.trades.filter((trade) => trade.id !== button.dataset.deleteTrade);
      sharedPassport = null;
      saveState();
      render();
    });
  });
}

function renderRules(analysis) {
  if (!state.rules.length) {
    els.rulesList.innerHTML = `
      <div class="empty-state">
        <h3>No rules configured</h3>
        <p>Add a rule to define the account risk envelope.</p>
      </div>
    `;
    return;
  }

  els.rulesList.innerHTML = state.rules
    .map((rule) => {
      const status = analysis.ruleStatuses.find((item) => item.rule.id === rule.id);
      const breachClass = status && status.breached ? "bad" : "good";
      return `
        <article class="rule-card" data-rule-id="${escapeHTML(rule.id)}">
          <label>
            Active
            <input class="rule-toggle" type="checkbox" data-field="enabled" ${rule.enabled ? "checked" : ""} />
          </label>
          <label>
            Rule
            <input type="text" data-field="name" value="${escapeAttribute(rule.name)}" />
          </label>
          <label>
            Metric
            <select data-field="metric">
              ${Object.entries(metricDefinitions)
                .map(
                  ([value, definition]) =>
                    `<option value="${value}" ${rule.metric === value ? "selected" : ""}>${definition.label}</option>`,
                )
                .join("")}
            </select>
          </label>
          <label>
            Limit
            <input type="number" data-field="limit" value="${Number(rule.limit)}" step="0.01" />
          </label>
          <label>
            Severity
            <select data-field="severity">
              ${["critical", "warning", "info"]
                .map((severity) => `<option value="${severity}" ${rule.severity === severity ? "selected" : ""}>${titleCase(severity)}</option>`)
                .join("")}
            </select>
          </label>
          <button class="delete-button" type="button" aria-label="Delete rule" data-delete-rule="${escapeHTML(rule.id)}">×</button>
          <p class="form-wide">
            <span class="status-dot ${breachClass}"></span>
            ${escapeHTML(status ? status.summary : metricDefinitions[rule.metric].describe(rule.limit))}
          </p>
        </article>
      `;
    })
    .join("");

  els.rulesList.querySelectorAll(".rule-card").forEach((card) => {
    const id = card.dataset.ruleId;
    card.querySelectorAll("[data-field]").forEach((field) => {
      field.addEventListener("change", () => updateRuleFromField(id, field));
      field.addEventListener("input", debounce(() => updateRuleFromField(id, field), 220));
    });
  });

  els.rulesList.querySelectorAll("[data-delete-rule]").forEach((button) => {
    button.addEventListener("click", () => {
      state.rules = state.rules.filter((rule) => rule.id !== button.dataset.deleteRule);
      saveState();
      render();
    });
  });
}

function renderCoach(analysis) {
  const insights = buildCoachInsights(analysis);

  els.coachGrid.innerHTML = insights
    .map(
      (insight) => `
        <article class="coach-card">
          <span class="severity ${escapeHTML(insight.severity)}">${escapeHTML(insight.severity)}</span>
          <h2>${escapeHTML(insight.title)}</h2>
          <p>${escapeHTML(insight.body)}</p>
          <div class="evidence">
            ${insight.evidence.map((item) => `<span>${escapeHTML(item)}</span>`).join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderPassport(analysis) {
  const passport = sharedPassport || buildPassport(analysis);
  const isShared = Boolean(sharedPassport);

  els.passportCard.innerHTML = `
    <header class="passport-header">
      <div class="passport-brand">
        <img src="assets/cova-mark.svg" alt="" />
        <div>
          <strong>Cova Risk Passport</strong>
          <span>${escapeHTML(isShared ? "Shared snapshot" : "Live local ledger")}</span>
        </div>
      </div>
      <div class="passport-score">
        <strong>${passport.score}</strong>
        <span>Cova Score</span>
      </div>
    </header>

    <div class="passport-body">
      <section class="passport-section">
        <div>
          <p class="eyebrow">Account profile</p>
          <h2>${escapeHTML(passport.accountLabel)}</h2>
        </div>
        <div class="passport-stats">
          ${passport.stats
            .map(
              (stat) => `
                <div class="passport-stat">
                  <span>${escapeHTML(stat.label)}</span>
                  <strong>${escapeHTML(stat.value)}</strong>
                </div>
              `,
            )
            .join("")}
        </div>
        <ul class="passport-notes">
          ${passport.notes.map((note) => `<li>${escapeHTML(note)}</li>`).join("")}
        </ul>
      </section>

      <section class="passport-section">
        <div>
          <p class="eyebrow">Risk rules</p>
          <h2>Governance state</h2>
        </div>
        <ul class="rule-status-list">
          ${passport.rules
            .map(
              (rule) => `
                <li>
                  <span>
                    <span class="status-dot ${rule.breached ? "bad" : "good"}"></span>
                    ${escapeHTML(rule.name)}
                  </span>
                  <strong>${escapeHTML(rule.status)}</strong>
                </li>
              `,
            )
            .join("")}
        </ul>
      </section>
    </div>
  `;
}

function handleCsvFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    els.csvTextInput.value = String(reader.result || "");
    importCsvFromTextarea();
  });
  reader.addEventListener("error", () => setStatus("Unable to read CSV file."));
  reader.readAsText(file);
}

function importCsvFromTextarea() {
  const csv = els.csvTextInput.value.trim();
  if (!csv) {
    setStatus("No CSV content found.");
    return;
  }

  const result = parseTradesCsv(csv);
  if (!result.trades.length) {
    setStatus(result.errors[0] || "No valid trade rows found.");
    return;
  }

  const existingIds = new Set(state.trades.map((trade) => trade.id));
  const imported = result.trades.map((trade) => {
    let id = trade.id || createId("trade");
    while (existingIds.has(id)) {
      id = createId("trade");
    }
    existingIds.add(id);
    return { ...trade, id };
  });

  state.trades = [...state.trades, ...imported].sort(compareTrades);
  sharedPassport = null;
  saveState();
  setStatus(`Imported ${imported.length} trade${imported.length === 1 ? "" : "s"}.${result.errors.length ? ` ${result.errors.length} row skipped.` : ""}`);
  render();
}

function handleTradeSubmit(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.tradeForm));
  const trade = normalizeTrade({
    ...data,
    id: createId("trade"),
  });

  if (!trade) {
    setStatus("Trade entry is incomplete.");
    return;
  }

  state.trades = [...state.trades, trade].sort(compareTrades);
  sharedPassport = null;
  saveState();
  els.tradeForm.reset();
  els.tradeForm.elements.date.valueAsDate = new Date();
  els.tradeForm.elements.contracts.value = 1;
  els.tradeForm.elements.risk.value = 500;
  setStatus("Trade added.");
  render();
}

function addRule() {
  state.rules = [
    ...state.rules,
    {
      id: createId("rule"),
      name: "New risk rule",
      metric: "maxDailyLoss",
      limit: 1000,
      severity: "warning",
      enabled: true,
    },
  ];
  saveState();
  render();
}

function updateRuleFromField(id, field) {
  state.rules = state.rules.map((rule) => {
    if (rule.id !== id) return rule;

    const next = { ...rule };
    const key = field.dataset.field;
    if (key === "enabled") {
      next.enabled = field.checked;
    } else if (key === "limit") {
      next.limit = Number(field.value) || 0;
    } else {
      next[key] = field.value;
    }
    return normalizeRule(next);
  });

  saveState();
  render();
}

async function sharePassport() {
  const passport = buildPassport(analyze(state.trades, state.rules));
  const encoded = encodePassport(passport);
  const url = `${location.origin}${location.pathname}${PASSPORT_PREFIX}${encoded}`;
  sharedPassport = null;
  history.replaceState(null, "", `${PASSPORT_PREFIX}${encoded}`);
  routeTo("passport", { skipHash: true });
  render();

  try {
    await navigator.clipboard.writeText(url);
    setStatus("Risk Passport link copied.");
  } catch {
    setStatus("Risk Passport link ready in the address bar.");
  }
}

function parseTradesCsv(csv) {
  const rows = parseCsvRows(csv).filter((row) => row.some((cell) => String(cell).trim() !== ""));
  const errors = [];
  if (!rows.length) return { trades: [], errors: ["CSV is empty."] };

  const rawHeaders = rows[0].map(normalizeHeader);
  const hasHeader = rawHeaders.some((header) =>
    ["date", "market", "symbol", "pnl", "profit", "contracts", "qty", "risk"].includes(header),
  );

  const headers = hasHeader
    ? rawHeaders
    : ["date", "market", "side", "contracts", "entry", "exit", "pnl", "risk", "setup", "notes"];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const trades = [];

  dataRows.forEach((row, index) => {
    const record = {};
    headers.forEach((header, columnIndex) => {
      record[header] = row[columnIndex] || "";
    });
    const trade = normalizeTrade(record);
    if (trade) {
      trades.push(trade);
    } else {
      errors.push(`Row ${index + (hasHeader ? 2 : 1)} skipped.`);
    }
  });

  return { trades, errors };
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"" && insideQuotes && next === "\"") {
      value += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value.trim());
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value.trim());
  rows.push(row);
  return rows;
}

function normalizeTrade(input) {
  const date = pick(input, ["date", "closedate", "entrydate", "time", "datetime"]);
  const market = pick(input, ["market", "symbol", "instrument", "ticker", "contract"]);
  const side = titleCase(pick(input, ["side", "direction", "buy/sell"]) || "Long");
  const contracts = parseNumber(pick(input, ["contracts", "qty", "quantity", "size", "lots"])) || 1;
  const entry = parseNumber(pick(input, ["entry", "entryprice", "avgentry", "entry_price"]));
  const exit = parseNumber(pick(input, ["exit", "exitprice", "avgexit", "exit_price"]));
  const pnl = parseNumber(pick(input, ["pnl", "p&l", "profit", "netpnl", "realizedpnl", "realized"]));
  const providedRisk = parseNumber(pick(input, ["risk", "plannedrisk", "planned_risk", "initialrisk", "maxrisk"]));
  const setup = pick(input, ["setup", "strategy", "playbook", "tag"]) || "Unlabeled";
  const notes = pick(input, ["notes", "note", "comment", "comments"]) || "";

  if (!date || !market || !Number.isFinite(pnl)) {
    return null;
  }

  const parsedDate = normalizeDate(date);
  if (!parsedDate) return null;

  const risk = Math.max(1, Number.isFinite(providedRisk) ? Math.abs(providedRisk) : inferRisk(pnl, entry, exit, contracts));

  return {
    id: input.id || createId("trade"),
    date: parsedDate,
    market: String(market).trim().toUpperCase(),
    side: side === "Short" ? "Short" : "Long",
    contracts: Math.max(1, Math.round(Math.abs(contracts))),
    entry: Number.isFinite(entry) ? entry : 0,
    exit: Number.isFinite(exit) ? exit : 0,
    pnl,
    risk,
    r: pnl / risk,
    setup: String(setup).trim() || "Unlabeled",
    notes: String(notes).trim(),
  };
}

function normalizeRule(rule) {
  if (!rule || !metricDefinitions[rule.metric]) return null;
  return {
    id: rule.id || createId("rule"),
    name: String(rule.name || metricDefinitions[rule.metric].label).trim(),
    metric: rule.metric,
    limit: Math.max(0, Number(rule.limit) || 0),
    severity: ["critical", "warning", "info"].includes(rule.severity) ? rule.severity : "warning",
    enabled: Boolean(rule.enabled),
  };
}

function analyze(trades, rules) {
  const normalizedTrades = trades.map(normalizeTrade).filter(Boolean).sort(compareTrades);
  const enabledRules = rules.filter((rule) => rule.enabled).length;
  const totals = normalizedTrades.reduce(
    (acc, trade) => {
      acc.pnl += trade.pnl;
      if (trade.pnl >= 0) acc.grossProfit += trade.pnl;
      if (trade.pnl < 0) acc.grossLoss += Math.abs(trade.pnl);
      acc.r += trade.r;
      return acc;
    },
    { pnl: 0, grossProfit: 0, grossLoss: 0, r: 0 },
  );

  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let currentLossStreak = 0;
  let currentWinStreak = 0;
  let worstLossStreak = 0;
  let lastStreak = { label: "flat", count: 0 };
  const equityPoints = [{ label: "Start", value: 0 }];

  normalizedTrades.forEach((trade) => {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    equityPoints.push({ label: trade.date, value: equity });

    if (trade.pnl < 0) {
      currentLossStreak += 1;
      currentWinStreak = 0;
      worstLossStreak = Math.max(worstLossStreak, currentLossStreak);
      lastStreak = { label: "loss", count: currentLossStreak };
    } else if (trade.pnl > 0) {
      currentWinStreak += 1;
      currentLossStreak = 0;
      lastStreak = { label: "win", count: currentWinStreak };
    }
  });

  const dailyMap = groupBy(normalizedTrades, (trade) => trade.date);
  const daily = Object.entries(dailyMap)
    .map(([date, rows]) => ({
      date,
      pnl: sum(rows, "pnl"),
      trades: rows.length,
      contracts: sum(rows, "contracts"),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const bySetup = summarizeGroup(normalizedTrades, (trade) => trade.setup || "Unlabeled");
  const byMarket = summarizeGroup(normalizedTrades, (trade) => trade.market || "Unknown");
  const ruleStatuses = rules.map((rule) => evaluateRule(rule, normalizedTrades, daily, {
    avgR: normalizedTrades.length ? totals.r / normalizedTrades.length : 0,
    profitFactor: totals.grossLoss ? totals.grossProfit / totals.grossLoss : totals.grossProfit > 0 ? Infinity : 0,
    worstLossStreak,
  }));
  const breaches = ruleStatuses.filter((status) => status.breached);
  const activeRuleBreaches = breaches.length;
  const ruleCompliance = enabledRules ? Math.max(0, (enabledRules - activeRuleBreaches) / enabledRules) : 1;
  const profitFactor = totals.grossLoss ? totals.grossProfit / totals.grossLoss : totals.grossProfit > 0 ? Infinity : 0;
  const winRate = normalizedTrades.length
    ? normalizedTrades.filter((trade) => trade.pnl > 0).length / normalizedTrades.length
    : 0;
  const avgR = normalizedTrades.length ? totals.r / normalizedTrades.length : 0;
  const score = calculateScore({
    trades: normalizedTrades,
    breaches,
    ruleCompliance,
    profitFactor,
    avgR,
    maxDrawdown,
    worstLossStreak,
  });

  return {
    trades: normalizedTrades,
    rules,
    totalPnl: totals.pnl,
    grossProfit: totals.grossProfit,
    grossLoss: totals.grossLoss,
    profitFactor,
    winRate,
    avgR,
    equityPoints,
    maxDrawdown,
    worstLossStreak,
    currentStreak: lastStreak,
    daily,
    bySetup,
    byMarket,
    ruleStatuses,
    breaches,
    activeRuleBreaches,
    enabledRules,
    ruleCompliance,
    score,
    latestDate: normalizedTrades.length ? normalizedTrades[normalizedTrades.length - 1].date : "",
    worstDay: daily.slice().sort((a, b) => a.pnl - b.pnl)[0] || null,
    bestDay: daily.slice().sort((a, b) => b.pnl - a.pnl)[0] || null,
  };
}

function evaluateRule(rule, trades, daily, metrics) {
  if (!rule.enabled) {
    return {
      rule,
      breached: false,
      severity: rule.severity,
      summary: "Rule is inactive.",
      evidence: [],
    };
  }

  const limit = Number(rule.limit);
  let breached = false;
  let summary = metricDefinitions[rule.metric].describe(limit);
  let evidence = [];

  if (rule.metric === "maxDailyLoss") {
    const offenders = daily.filter((day) => day.pnl <= -limit);
    breached = offenders.length > 0;
    evidence = offenders.map((day) => `${day.date}: ${formatMoney(day.pnl)}`);
    if (breached) summary = `${offenders.length} session${offenders.length === 1 ? "" : "s"} closed beyond -${formatMoney(limit)}.`;
  }

  if (rule.metric === "maxTradeLoss") {
    const offenders = trades.filter((trade) => trade.pnl <= -limit);
    breached = offenders.length > 0;
    evidence = offenders.map((trade) => `${trade.date} ${trade.market}: ${formatMoney(trade.pnl)}`);
    if (breached) summary = `${offenders.length} trade${offenders.length === 1 ? "" : "s"} exceeded ${formatMoney(limit)} loss.`;
  }

  if (rule.metric === "maxContracts") {
    const offenders = trades.filter((trade) => trade.contracts > limit);
    breached = offenders.length > 0;
    evidence = offenders.map((trade) => `${trade.date} ${trade.market}: ${trade.contracts} contracts`);
    if (breached) summary = `${offenders.length} trade${offenders.length === 1 ? "" : "s"} exceeded ${limit} contracts.`;
  }

  if (rule.metric === "maxLossStreak") {
    breached = metrics.worstLossStreak > limit;
    evidence = [`Worst loss streak: ${metrics.worstLossStreak}`];
    if (breached) summary = `Worst losing streak reached ${metrics.worstLossStreak} trades.`;
  }

  if (rule.metric === "minProfitFactor") {
    breached = metrics.profitFactor < limit;
    evidence = [`Profit factor: ${Number.isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : "infinite"}`];
    if (breached) summary = `Profit factor is below ${limit}.`;
  }

  if (rule.metric === "minAvgR") {
    breached = metrics.avgR < limit;
    evidence = [`Average R: ${metrics.avgR.toFixed(2)}R`];
    if (breached) summary = `Average realized R is below ${limit}R.`;
  }

  return {
    rule,
    ruleName: rule.name,
    breached,
    severity: rule.severity,
    summary,
    evidence,
  };
}

function calculateScore({ trades, breaches, ruleCompliance, profitFactor, avgR, maxDrawdown, worstLossStreak }) {
  if (!trades.length) return 0;

  const severityPenalty = breaches.reduce((total, breach) => {
    const weight = breach.severity === "critical" ? 13 : breach.severity === "warning" ? 8 : 4;
    return total + weight;
  }, 0);
  const drawdownPenalty = Math.min(18, maxDrawdown / 220);
  const streakPenalty = Math.max(0, worstLossStreak - 2) * 5;
  const pfBonus = Math.min(12, Math.max(0, (profitFactor - 1) * 12));
  const rBonus = Math.min(10, Math.max(0, avgR * 14));

  const raw = 72 + ruleCompliance * 18 + pfBonus + rBonus - severityPenalty - drawdownPenalty - streakPenalty;
  return clamp(Math.round(raw), 0, 100);
}

function buildCoachInsights(analysis) {
  if (!analysis.trades.length) {
    return [
      {
        severity: "info",
        title: "No trade evidence yet",
        body: "Cova needs a trade ledger before it can score risk behavior.",
        evidence: ["Import CSV or add trades manually.", "Supported fields include P&L, risk, setup, and contracts."],
      },
    ];
  }

  const insights = [];
  const critical = analysis.breaches.find((breach) => breach.severity === "critical");
  if (critical) {
    insights.push({
      severity: "critical",
      title: "Funding-risk breach detected",
      body: `${critical.ruleName} is currently outside the configured envelope. Cova would require a size reduction until the next clean session block is complete.`,
      evidence: critical.evidence.slice(0, 3),
    });
  }

  const escalation = detectSizeEscalation(analysis.trades);
  if (escalation.count > 0) {
    insights.push({
      severity: "warning",
      title: "Post-loss size escalation",
      body: `Contracts increased after a losing trade ${escalation.count} time${escalation.count === 1 ? "" : "s"}. This is the clearest behavioral risk marker in the ledger.`,
      evidence: escalation.evidence.slice(0, 4),
    });
  }

  const worstSetup = analysis.bySetup
    .filter((setup) => setup.count >= 2)
    .sort((a, b) => a.avgR - b.avgR)[0];
  if (worstSetup && worstSetup.avgR < 0) {
    insights.push({
      severity: "warning",
      title: `${worstSetup.name} is dragging expectancy`,
      body: `This setup has negative average R and accounts for ${formatMoney(worstSetup.pnl)} of net P&L. Keep it on review before expanding risk.`,
      evidence: [
        `${worstSetup.count} trades`,
        `${formatPercent(worstSetup.winRate)} win rate`,
        `${worstSetup.avgR.toFixed(2)}R average`,
      ],
    });
  }

  if (analysis.worstDay && analysis.worstDay.pnl < 0) {
    insights.push({
      severity: analysis.worstDay.pnl <= -1200 ? "critical" : "info",
      title: "Worst day defines the risk envelope",
      body: `The deepest session loss was ${formatMoney(analysis.worstDay.pnl)}. Passport quality improves fastest by capping repeat attempts before that level.`,
      evidence: [
        `${analysis.worstDay.date}: ${analysis.worstDay.trades} trades`,
        `Max drawdown: ${formatMoney(-analysis.maxDrawdown)}`,
      ],
    });
  }

  const bestSetup = analysis.bySetup
    .filter((setup) => setup.count >= 2)
    .sort((a, b) => b.avgR - a.avgR)[0];
  if (bestSetup) {
    insights.push({
      severity: "info",
      title: `${bestSetup.name} has the cleanest evidence`,
      body: `This setup is the strongest candidate for normal risk allocation. The coaching note is about consistency, not market direction.`,
      evidence: [
        `${bestSetup.count} trades`,
        `${formatPercent(bestSetup.winRate)} win rate`,
        `${bestSetup.avgR.toFixed(2)}R average`,
      ],
    });
  }

  if (analysis.score >= 80 && !analysis.breaches.length) {
    insights.push({
      severity: "info",
      title: "Passport is institution-ready",
      body: "The current ledger shows clean rules, positive expectancy, and controlled drawdown. Maintain the rule set before increasing contract size.",
      evidence: [
        `Cova Score: ${analysis.score}`,
        `Profit factor: ${Number.isFinite(analysis.profitFactor) ? analysis.profitFactor.toFixed(2) : "infinite"}`,
        `Average R: ${analysis.avgR.toFixed(2)}R`,
      ],
    });
  }

  while (insights.length < 3) {
    insights.push({
      severity: "info",
      title: "More evidence will sharpen coaching",
      body: "Cova coaching becomes more specific as the ledger grows across markets, sessions, and setups.",
      evidence: [
        `${analysis.trades.length} trades loaded`,
        `${analysis.daily.length} sessions loaded`,
        `${analysis.bySetup.length} setup groups`,
      ],
    });
  }

  return insights.slice(0, 6);
}

function buildPassport(analysis) {
  const rules = analysis.ruleStatuses
    .filter((status) => status.rule.enabled)
    .map((status) => ({
      name: status.rule.name,
      breached: status.breached,
      status: status.breached ? "Flagged" : "Clean",
    }));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    accountLabel: "Funded futures trader",
    score: analysis.score,
    stats: [
      { label: "Trades", value: String(analysis.trades.length) },
      { label: "Net P&L", value: formatMoney(analysis.totalPnl) },
      { label: "Win rate", value: formatPercent(analysis.winRate) },
      { label: "Max DD", value: formatMoney(-analysis.maxDrawdown) },
      { label: "Profit factor", value: Number.isFinite(analysis.profitFactor) ? analysis.profitFactor.toFixed(2) : "∞" },
      { label: "Avg R", value: `${analysis.avgR.toFixed(2)}R` },
      { label: "Compliance", value: formatPercent(analysis.ruleCompliance) },
      { label: "Sessions", value: String(analysis.daily.length) },
    ],
    notes: buildPassportNotes(analysis),
    rules,
  };
}

function buildPassportNotes(analysis) {
  const notes = [];
  if (analysis.bestDay) {
    notes.push(`Best session: ${analysis.bestDay.date} at ${formatMoney(analysis.bestDay.pnl)}.`);
  }
  if (analysis.worstDay) {
    notes.push(`Worst session: ${analysis.worstDay.date} at ${formatMoney(analysis.worstDay.pnl)}.`);
  }
  if (analysis.bySetup[0]) {
    notes.push(`Most traded setup: ${analysis.bySetup[0].name} across ${analysis.bySetup[0].count} trades.`);
  }
  notes.push("Passport measures risk behavior and execution quality; it does not publish signals.");
  return notes;
}

function drawEquityChart(analysis) {
  const canvas = els.equityCanvas;
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  context.scale(ratio, ratio);

  const width = rect.width;
  const height = rect.height;
  context.clearRect(0, 0, width, height);

  const styles = getComputedStyle(document.body);
  const line = styles.getPropertyValue("--line").trim();
  const text = styles.getPropertyValue("--muted").trim();
  const brand = styles.getPropertyValue("--brand-2").trim();
  const bad = styles.getPropertyValue("--bad").trim();
  const surface = styles.getPropertyValue("--surface-strong").trim();

  context.fillStyle = surface;
  context.fillRect(0, 0, width, height);

  const padding = { top: 28, right: 24, bottom: 34, left: 58 };
  const points = analysis.equityPoints.length > 1 ? analysis.equityPoints : [{ value: 0 }, { value: 0 }];
  const values = points.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  context.strokeStyle = line;
  context.lineWidth = 1;
  context.fillStyle = text;
  context.font = "12px Inter, system-ui, sans-serif";

  for (let index = 0; index <= 4; index += 1) {
    const y = padding.top + (chartHeight / 4) * index;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();

    const value = max - (range / 4) * index;
    context.fillText(formatCompactMoney(value), 10, y + 4);
  }

  const zeroY = padding.top + ((max - 0) / range) * chartHeight;
  context.strokeStyle = bad;
  context.setLineDash([5, 5]);
  context.beginPath();
  context.moveTo(padding.left, zeroY);
  context.lineTo(width - padding.right, zeroY);
  context.stroke();
  context.setLineDash([]);

  context.strokeStyle = brand;
  context.lineWidth = 3;
  context.beginPath();
  points.forEach((point, index) => {
    const x = padding.left + (chartWidth * index) / (points.length - 1);
    const y = padding.top + ((max - point.value) / range) * chartHeight;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.stroke();

  context.fillStyle = brand;
  points.forEach((point, index) => {
    if (index === 0 || index === points.length - 1 || point.value === max || point.value === min) {
      const x = padding.left + (chartWidth * index) / (points.length - 1);
      const y = padding.top + ((max - point.value) / range) * chartHeight;
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    }
  });

  context.fillStyle = text;
  context.fillText("Start", padding.left, height - 12);
  context.fillText(analysis.latestDate || "Latest", Math.max(padding.left, width - padding.right - 96), height - 12);
}

function summarizeGroup(trades, getName) {
  return Object.entries(groupBy(trades, getName))
    .map(([name, rows]) => {
      const pnl = sum(rows, "pnl");
      const wins = rows.filter((trade) => trade.pnl > 0).length;
      return {
        name,
        count: rows.length,
        pnl,
        winRate: rows.length ? wins / rows.length : 0,
        avgR: rows.length ? sum(rows, "r") / rows.length : 0,
      };
    })
    .sort((a, b) => b.count - a.count || b.pnl - a.pnl);
}

function detectSizeEscalation(trades) {
  const evidence = [];
  let count = 0;

  for (let index = 1; index < trades.length; index += 1) {
    const previous = trades[index - 1];
    const current = trades[index];
    if (previous.date === current.date && previous.pnl < 0 && current.contracts > previous.contracts) {
      count += 1;
      evidence.push(`${current.date}: ${previous.contracts} to ${current.contracts} contracts after ${formatMoney(previous.pnl)}`);
    }
  }

  return { count, evidence };
}

function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function sum(items, key) {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function compareTrades(a, b) {
  return a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id));
}

function pick(input, keys) {
  for (const key of keys) {
    const normalized = normalizeHeader(key);
    if (Object.prototype.hasOwnProperty.call(input, normalized) && input[normalized] !== "") {
      return input[normalized];
    }
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== "") {
      return input[key];
    }
  }
  return "";
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const clean = String(value).replace(/[$,%\s]/g, "").replace(/,/g, "");
  const wrappedNegative = /^\(.+\)$/.test(clean);
  const number = Number(clean.replace(/[()]/g, ""));
  if (!Number.isFinite(number)) return NaN;
  return wrappedNegative ? -number : number;
}

function inferRisk(pnl, entry, exit, contracts) {
  const priceDistance = Number.isFinite(entry) && Number.isFinite(exit) ? Math.abs(entry - exit) * Math.max(1, contracts) : 0;
  if (pnl < 0) return Math.max(Math.abs(pnl), priceDistance, 100);
  return Math.max(priceDistance, Math.abs(pnl) / 1.5, 100);
}

function normalizeDate(value) {
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9&/]+/g, "");
}

function cloneTrade(trade) {
  return normalizeTrade({ ...trade }) || { ...trade };
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function encodePassport(passport) {
  return btoa(JSON.stringify(passport)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePassport(payload) {
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function readPassportFromHash() {
  if (!location.hash.startsWith(PASSPORT_PREFIX)) return null;
  return decodePassport(location.hash.slice(PASSPORT_PREFIX.length));
}

function initializeTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const shouldUseLight = saved === "light";
  document.body.classList.toggle("light", shouldUseLight);
}

function toggleTheme() {
  const next = !document.body.classList.contains("light");
  document.body.classList.toggle("light", next);
  localStorage.setItem(THEME_KEY, next ? "light" : "dark");
  drawEquityChart(analyze(state.trades, state.rules));
}

function setStatus(message) {
  if (els.importStatus) {
    els.importStatus.textContent = message;
  }
}

function formatMoney(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
  })}`;
}

function formatCompactMoney(value) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function scoreLabel(score) {
  if (score >= 85) return "Institutional risk profile";
  if (score >= 72) return "Funded-ready with monitoring";
  if (score >= 55) return "Rules need tightening";
  return "High account-risk profile";
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function debounce(callback, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(...args), wait);
  };
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHTML(value).replace(/`/g, "&#096;");
}
