import { saveBrokerCash } from '../lib/brokerCash';
import { useEffect, useMemo, useRef, useState } from "react";
import { rememberAccountNames } from "../lib/accountNames";
import { parseCsvDetailed, type Trade, type TradeMergeResult } from "../lib/risk";
import { type PropFirmId } from "../lib/propFirms";
import { clearBrokerStatus, readBrokerStatus, writeBrokerStatus, type BrokerStatus } from "../lib/brokerStatus";
import { canRedirectToTradovate } from "../lib/tradovateConnect";
import { authorizedFetch } from "../lib/apiClient";
import { fetchHistoryJson, HistoryRunGuard, readHistorySummary, saveHistorySummary, recentHistoryWindow, validateTradovateHistory, type HistoryAccount } from "../lib/tradovateHistory";
import { SectionShell } from "./LayoutShell";
import { BrokerConnectPanel, CsvExportGuide, CsvPreview, CsvUploadPanel } from "./ImportPanels";



type ImportMode = "append" | "replace" | "merge";
type ImportCommit = (text: string, mode?: ImportMode) => TradeMergeResult["receipt"] | null;
type PreparedImport = { commit: ImportCommit; isCurrent: () => boolean; scopeKey: string; commitHistory: (text: string, accountId: string, coverage: string) => TradeMergeResult["receipt"] | null };
type PrepareImportCsv = () => PreparedImport | null;
type ImportEntitlements = {
  canUseDirectSync: boolean;
  maxStoredTrades: number;
  maxTradesPerImport: number;
  plan: "free" | "pro";
};
type RithmicCredentials = {
  username: string;
  password: string;
  accountKey?: string;
  lookbackDays: 30 | 90 | 180;
  systemName: "Rithmic Paper Trading" | "Rithmic 01" | "Rithmic Test";
};

const MAX_CSV_FILE_BYTES = 2 * 1024 * 1024;
const IMPORT_PROVIDER_HINT_KEY = "cova-import-provider-v1";


function readImportProviderHint(): PropFirmId {
  try {
    const hint = sessionStorage.getItem(IMPORT_PROVIDER_HINT_KEY);
    if (hint === "rithmic") return hint;
  } catch {
    // A blocked session store should not block the import route.
  }
  return "topstepx";
}

type TradovateStatusResponse = {
  available?: boolean;
  connected?: boolean;
  connectionId?: string;
  message?: string;
  provider?: string;
  status?: string;
};

function brokerStatusFromTradovate(data: TradovateStatusResponse): BrokerStatus {
  const connected = data.connected === true;
  const available = data.available === true;
  return {
    provider: "Tradovate",
    status: available ? (connected ? "connected" : "not-connected") : "api-unavailable",
    connected,
    mode: "linked",
    connectionId: data.connectionId,
    message: data.message || (connected
      ? available
        ? "Tradovate connection found."
        : "Tradovate connection retained. Direct sync is unavailable here, but you can disconnect it below or use CSV."
      : available
        ? "No Tradovate connection found yet."
        : "Tradovate direct sync is not configured here. Use CSV import instead."),
    updatedAt: new Date().toISOString(),
  };
}

export function ImportDesk({ entitlements, importCsv, prepareImportCsv, openFirmOAuth, status, reset, upgradeToPro }: { entitlements: ImportEntitlements; importCsv: ImportCommit; prepareImportCsv: PrepareImportCsv; openFirmOAuth: (firm: PropFirmId) => void; status: string; reset: () => void; upgradeToPro: () => void }) {

  const [text, setText] = useState("");
  const [mode, setMode] = useState<ImportMode>("append");
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState("");
  const [brokerBusy, setBrokerBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [rithmicBusy, setRithmicBusy] = useState(false);
  const [rithmicCapability, setRithmicCapability] = useState({ available: false, checked: false });
  const [tradovateCapability, setTradovateCapability] = useState({ available: false, checked: false });
  const [brokerNotice, setBrokerNotice] = useState("");
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatus | null>(() => readBrokerStatus());
  const [selectedFirmId, setSelectedFirmId] = useState<PropFirmId>(readImportProviderHint);
  const rithmicRequestRef = useRef<AbortController | null>(null);
  const rithmicRequestGenerationRef = useRef(0);
  const historyGuard = useRef(new HistoryRunGuard());
  const verifiedConnection = useRef("");
  const [historyWindow, setHistoryWindow] = useState(recentHistoryWindow);
  const [historyAccounts, setHistoryAccounts] = useState<HistoryAccount[]>([]);
  const [historyAccount, setHistoryAccount] = useState("");
  const parsed = useMemo(() => parseCsvDetailed(text), [text]);

  useEffect(() => {
    const cancel = () => { historyGuard.current.cancel(); setSyncBusy(false); };
    window.addEventListener("cova:history-selection", cancel);
    return () => window.removeEventListener("cova:history-selection", cancel);
  }, []);

  useEffect(() => () => {
    historyGuard.current.cancel();
    rithmicRequestGenerationRef.current += 1;
    rithmicRequestRef.current?.abort();
    rithmicRequestRef.current = null;
  }, []);

  useEffect(() => {
    try {
      sessionStorage.removeItem(IMPORT_PROVIDER_HINT_KEY);
    } catch {
      // Provider selection remains in memory for this route.
    }
  }, []);

  useEffect(() => {
    const selectRequestedProvider = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== "rithmic") return;
      setSelectedFirmId("rithmic");
      window.setTimeout(() => {
        try {
          if (sessionStorage.getItem(IMPORT_PROVIDER_HINT_KEY) === "rithmic") {
            sessionStorage.removeItem(IMPORT_PROVIDER_HINT_KEY);
          }
        } catch {
          // The in-memory selection is already applied.
        }
      }, 1_000);
    };
    window.addEventListener("cova:import-provider", selectRequestedProvider);
    return () => window.removeEventListener("cova:import-provider", selectRequestedProvider);
  }, []);

  useEffect(() => {
    const refreshBrokerStatus = () => {
      const next = readBrokerStatus();
      if (verifiedConnection.current && (!next?.connected || next.connectionId !== verifiedConnection.current)) {
        historyGuard.current.cancel();
        setSyncBusy(false);
        setBrokerNotice("Tradovate connection changed. Load history to retry with the current connection.");
        verifiedConnection.current = "";
      }
      setBrokerStatus(next);
    };
    window.addEventListener("cova:broker-status", refreshBrokerStatus);
    window.addEventListener("storage", refreshBrokerStatus);
    refreshBrokerStatus();
    return () => {
      window.removeEventListener("cova:broker-status", refreshBrokerStatus);
      window.removeEventListener("storage", refreshBrokerStatus);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    authorizedFetch("/api/rithmic/status")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!cancelled) setRithmicCapability({ available: response.ok && data?.available === true, checked: true });
      })
      .catch(() => {
        if (!cancelled) setRithmicCapability({ available: false, checked: true });
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const prepared = prepareImportCsv();
    const controller = new AbortController();
    fetchHistoryJson(authorizedFetch, "/api/tradovate/status", controller.signal, 5000, 16384)
      .then(value => {
        const data = value as TradovateStatusResponse;
        if (cancelled || !prepared?.isCurrent()) return;
        setTradovateCapability({ available: data?.available === true, checked: true });
        if (data?.connected === true) {
          const nextStatus = brokerStatusFromTradovate(data);
          verifiedConnection.current = data.connectionId || "";
          writeBrokerStatus(nextStatus);
          setBrokerStatus(nextStatus);
          if (data.available === true && data.connectionId && entitlements.canUseDirectSync) void syncTradovate(data.connectionId, true);
        } else if (data?.connected === false && readBrokerStatus()?.provider === "Tradovate") {
          clearBrokerStatus();
          setBrokerStatus(null);
        }
      })
      .catch(() => {
        if (!cancelled) setTradovateCapability({ available: false, checked: true });
      });
    return () => { cancelled = true; controller.abort(); };
  }, []);

  async function readFile(file?: File) {
    if (!file) {
      return;
    }
    if (file.size > MAX_CSV_FILE_BYTES) {
      setFileName(`${file.name} exceeds the 2 MB CSV limit.`);
      setText("");
      return;
    }
    setFileName(file.name);
    setText(await file.text());
  }

  async function syncTradovate(connectionHint?: string, automatic = false) {
    const preparedImport = prepareImportCsv();
    if (!preparedImport || !entitlements.canUseDirectSync) return;
    const run = historyGuard.current.start();
    const requireCurrent = () => {
      if (!run.isCurrent() || !preparedImport.isCurrent()) throw new DOMException("History import canceled.", "AbortError");
    };
    setSyncBusy(true);
    setBrokerNotice("");
    let attemptedConnection = "";
    try {
      const current = await fetchHistoryJson(authorizedFetch, "/api/tradovate/status", run.signal, 5000, 16384) as TradovateStatusResponse;
      requireCurrent();
      if (current.connected !== true || current.available !== true || typeof current.connectionId !== "string" || !current.connectionId) {
        verifiedConnection.current = "";
        if (current.connected === false) { clearBrokerStatus(); setBrokerStatus(null); }
        throw new Error("Tradovate history is unavailable. Check the connection or reconnect.");
      }
      if (connectionHint && connectionHint !== current.connectionId) throw new Error("Tradovate connection changed. Retry with the current connection.");
      verifiedConnection.current = current.connectionId;
      const key = JSON.stringify([historyAccount, historyWindow.startDate, historyWindow.endDate]);
      const cached = readHistorySummary(preparedImport.scopeKey, current.connectionId);
      if (cached) { setHistoryAccounts(cached.accounts); setBrokerNotice(cached.outcome === "running" ? "Previous history load was interrupted. Load history to retry." : cached.notice); }
      if (automatic && cached?.attempted.includes(key)) return;
      attemptedConnection = current.connectionId;
      saveHistorySummary(preparedImport.scopeKey, current.connectionId, { accounts: cached?.accounts || [], notice: "Loading history", outcome: "running", attempted: [...new Set([...(cached?.attempted || []), key])] });
      const query = new URLSearchParams({ history: "recent", connectionId: current.connectionId, ...historyWindow, ...(historyAccount ? { accountId: historyAccount } : {}) });
      const data = await fetchHistoryJson(authorizedFetch, `/api/tradovate/sync?${query}`, run.signal);
      requireCurrent();
      const verified = validateTradovateHistory(data, historyAccount);
      if (verified.window.startDate !== historyWindow.startDate || verified.window.endDate !== historyWindow.endDate) throw new Error("Tradovate returned a different history window. Nothing was imported.");
      requireCurrent();
      if (verifiedConnection.current !== current.connectionId) throw new Error("Tradovate connection changed before import.");
      setHistoryAccounts(verified.accounts);
      const details = verified.accounts.map(item => `${item.account.name}: ${item.status}${item.counts ? ` (${item.counts.trades} matched pairs)` : ""}`).join(" · ");
      const coverage = `${historyWindow.startDate} through ${historyWindow.endDate} exclusive, UTC. Gross P&L before fees; matched fill pairs, not strategy-level trades. ${details}`;
      const summary = readHistorySummary(preparedImport.scopeKey, current.connectionId)!;
      const outcome = verified.accounts.every(item => item.status === "failed" || item.status === "deferred") ? "failed" : verified.accounts.some(item => item.status === "failed" || item.status === "deferred") ? "partial" : "complete";
      let notice = `No trades imported. Saved history is unchanged. ${coverage}`;
      if (verified.count > 0) {
        const receipt = preparedImport.commitHistory(verified.csv, verified.accountId, coverage);
        if (!receipt) throw new Error("The active Cova account changed. Nothing was imported.");
        notice = `${receipt.added} new, ${receipt.corrected} corrected, ${receipt.unchanged} unchanged. ${coverage}`;
      }
      for (const item of verified.accounts) {
        if (item.status === 'deferred') continue;
        const cash = item.cash as {window?:{startDate?:string;endDate?:string}} | undefined;
        const matchingWindow = cash?.window?.startDate === verified.window.startDate && cash.window.endDate === verified.window.endDate;
        saveBrokerCash(preparedImport.scopeKey, item.account.id, matchingWindow ? cash : null, verified.trades.filter(t => t.source?.accountId === item.account.id));
      }
      saveHistorySummary(preparedImport.scopeKey, current.connectionId, { ...summary, accounts: verified.accounts, notice, outcome });
      rememberAccountNames(preparedImport.scopeKey, Object.fromEntries(verified.accounts.map(item => [`Tradovate:${item.account.id}`, item.account.name])));
      setBrokerNotice(notice);
    } catch (error) {
      if (run.isCurrent() && preparedImport.isCurrent()) {
        const notice = error instanceof Error ? error.message : "Tradovate history failed. Retry or use CSV.";
        setBrokerNotice(notice);
        const summary = attemptedConnection && readHistorySummary(preparedImport.scopeKey, attemptedConnection);
        if (summary) saveHistorySummary(preparedImport.scopeKey, attemptedConnection, { ...summary, notice, outcome: "failed" });
      }
    } finally {
      if (run.isCurrent()) setSyncBusy(false);
    }
  }

  async function syncRithmic(credentials: RithmicCredentials) {
    const preparedImport = prepareImportCsv();
    if (!preparedImport) {
      setBrokerNotice("Sign in again before syncing Rithmic history.");
      return;
    }

    rithmicRequestRef.current?.abort();
    const controller = new AbortController();
    const requestGeneration = rithmicRequestGenerationRef.current + 1;
    rithmicRequestGenerationRef.current = requestGeneration;
    rithmicRequestRef.current = controller;
    const requireCurrentRequest = () => {
      if (controller.signal.aborted || requestGeneration !== rithmicRequestGenerationRef.current || !preparedImport.isCurrent()) {
        throw new DOMException("Rithmic sync was canceled.", "AbortError");
      }
    };

    setRithmicBusy(true);
    setBrokerNotice("");
    try {
      const response = await authorizedFetch("/api/rithmic/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        signal: controller.signal,
      });
      requireCurrentRequest();
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("Rithmic sync is not reachable from this preview.");
      }
      const data = await response.json() as {
        account?: { accountKey?: string; accountId?: string; accountName?: string };
        accounts?: { accountKey?: string; accountId?: string; accountName?: string }[];
        csv?: string;
        counts?: { trades?: number; rawFills?: number };
        credentialsStored?: boolean;
        selectionRequired?: boolean;
        error?: string;
      };
      requireCurrentRequest();
      if (!response.ok) {
        throw new Error(data.error || "Rithmic sync failed.");
      }
      const namedAccounts = [...(Array.isArray(data.accounts) ? data.accounts : []), ...(data.account ? [data.account] : [])];
      rememberAccountNames(preparedImport.scopeKey, Object.fromEntries(namedAccounts.filter(account => typeof account.accountName === "string").map(account => [`Rithmic:${account.accountKey}:${account.accountId}`, account.accountName!])));
      if (data.selectionRequired && data.accounts && data.accounts.length > 1) {
        setBrokerNotice(`Rithmic returned ${data.accounts.length} accounts. Choose one below, re-enter your login, and sync again.`);
        return data;
      }
      const tradeCount = data.counts?.trades ?? 0;
      if (!data.csv || tradeCount <= 0) {
        const nextStatus: BrokerStatus = {
          provider: "Rithmic",
          status: "imported",
          connected: false,
          mode: "ephemeral",
          message: `Already up to date. ${credentials.systemName} login verified. No completed fill history was returned for this window, and the login was discarded.`,
          updatedAt: new Date().toISOString(),
        };
        writeBrokerStatus(nextStatus);
        setBrokerStatus(nextStatus);
        setBrokerNotice(nextStatus.message);
        return data;
      }
      const verified = parseCsvDetailed(data.csv);
      if (verified.issues.length || verified.trades.length !== tradeCount) {
        throw new Error("Rithmic returned an inconsistent trade ledger, so Cova did not import it.");
      }
      requireCurrentRequest();
      const mergeReceipt = preparedImport.commit(data.csv, "merge");
      if (!mergeReceipt) {
        throw new Error("Rithmic history passed validation but the active Cova account changed before it could be merged.");
      }
      const receiptMessage = mergeReceipt.added === 0 && mergeReceipt.corrected === 0
        ? `Already up to date. ${mergeReceipt.unchanged} Rithmic trade${mergeReceipt.unchanged === 1 ? "" : "s"} checked.`
        : `Synced ${mergeReceipt.added} new, ${mergeReceipt.corrected} corrected, and ${mergeReceipt.unchanged} unchanged Rithmic trade${tradeCount === 1 ? "" : "s"}.`;
      const nextStatus: BrokerStatus = {
        provider: "Rithmic",
        status: "imported",
        connected: false,
        mode: "ephemeral",
        message: `${receiptMessage} Source: ${credentials.systemName}. The login was discarded after sync. P&L is gross before commissions.`,
        updatedAt: new Date().toISOString(),
      };
      writeBrokerStatus(nextStatus);
      setBrokerStatus(nextStatus);
      setBrokerNotice(nextStatus.message);
      return data;
    } catch (error) {
      if (controller.signal.aborted || requestGeneration !== rithmicRequestGenerationRef.current || !preparedImport.isCurrent()) return;
      setBrokerNotice(`${error instanceof Error ? error.message : "Rithmic sync is unavailable right now."} The login was not stored. Use the Rithmic export guide if needed.`);
      return;
    } finally {
      if (requestGeneration === rithmicRequestGenerationRef.current) {
        rithmicRequestRef.current = null;
        setRithmicBusy(false);
      }
    }
  }

  async function startTradovateConnect() {
    if (!canRedirectToTradovate()) {
      setBrokerNotice("Tradovate secure sync is not available in this preview. Upload a Tradovate export below to review the account today.");
      return;
    }

    try {
      const response = await authorizedFetch("/api/tradovate/connect", { method: "POST" });
      const data = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !data.authorizationUrl) {
        throw new Error(data.error || "Tradovate authorization could not start.");
      }
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      setBrokerNotice(`${error instanceof Error ? error.message : "Tradovate authorization is unavailable."} Use CSV import while direct access is unavailable.`);
    }
  }

  async function disconnectBroker() {
    historyGuard.current.cancel();
    verifiedConnection.current = "";
    if (!brokerStatus?.connected) {
      return;
    }
    const provider = brokerStatus?.provider === "Tradovate" ? "tradovate" : "all";
    setBrokerBusy(true);
    setBrokerNotice("");
    try {
      const response = await authorizedFetch("/api/connectors/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await response.json() as { error?: string; provider?: string };
      if (!response.ok) {
        throw new Error(data.error || "The connection could not be removed.");
      }
      clearBrokerStatus();
      setBrokerStatus(null);
      setBrokerNotice(`${data.provider || brokerStatus.provider} disconnected and its stored token was deleted.`);
    } catch (error) {
      setBrokerNotice(error instanceof Error ? error.message : "The connection could not be removed securely.");
    } finally {
      setBrokerBusy(false);
    }
  }

  async function checkTradovateStatus() {
    setBrokerBusy(true);
    setBrokerNotice("");
    try {
      const response = await authorizedFetch("/api/tradovate/status");
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("Broker status is not reachable from this preview.");
      }
      const data = await response.json() as TradovateStatusResponse;
      if (!response.ok) {
        throw new Error(data.message || "Tradovate status check failed.");
      }
      setTradovateCapability({ available: data.available === true, checked: true });
      const nextStatus = brokerStatusFromTradovate(data);
      if (data.connected === true) {
        writeBrokerStatus(nextStatus);
        setBrokerStatus(nextStatus);
      } else {
        clearBrokerStatus();
        setBrokerStatus(null);
      }
      setBrokerNotice(nextStatus.message);
    } catch (error) {
      setTradovateCapability({ available: false, checked: true });
      const retainedStatus = readBrokerStatus();
      if (retainedStatus?.provider === "Tradovate" && retainedStatus.connected) {
        setBrokerStatus(retainedStatus);
        setBrokerNotice(`${error instanceof Error ? error.message : "Tradovate status check is unavailable."} The saved connection remains available to disconnect below; use CSV while sync is unavailable.`);
      } else {
        const nextStatus: BrokerStatus = {
          provider: "Tradovate",
          status: "api-unavailable",
          connected: false,
          message: error instanceof Error ? error.message : "Tradovate status check is unavailable in this preview.",
          updatedAt: new Date().toISOString(),
        };
        setBrokerStatus(nextStatus);
        setBrokerNotice(`${nextStatus.message} Upload a CSV export instead and Cova will review the account the same way.`);
      }
    } finally {
      setBrokerBusy(false);
    }
  }

  return (
    <SectionShell
      eyebrow="Accounts"
      title="Accounts"
      variant="workspace"

    >
      <div className="accounts-page">
        <BrokerConnectPanel
          brokerBusy={brokerBusy}
          brokerNotice={brokerNotice}
          canRedirectToTradovate={canRedirectToTradovate}
          brokerStatus={brokerStatus}
          checkTradovateStatus={checkTradovateStatus}
          disconnectBroker={disconnectBroker}
          entitlements={entitlements}
          openFirmOAuth={openFirmOAuth}
          rithmicAvailable={rithmicCapability.available}
          rithmicBusy={rithmicBusy}
          rithmicStatusChecked={rithmicCapability.checked}
          tradovateAvailable={tradovateCapability.available}
          tradovateStatusChecked={tradovateCapability.checked}
          selectedFirmId={selectedFirmId}
          setBrokerNotice={setBrokerNotice}
          setSelectedFirmId={setSelectedFirmId}
          startTradovateConnect={startTradovateConnect}
          syncBusy={syncBusy}
          syncRithmic={syncRithmic}
          syncTradovate={() => syncTradovate()}
          upgradeToPro={upgradeToPro}
        />

        {tradovateCapability.available && brokerStatus?.provider === "Tradovate" && brokerStatus.connected && (
          <section className="accounts-panel accounts-history" aria-label="Tradovate recent history">
            <h3>Trade history</h3>
            <details className="accounts-help"><summary>History details</summary><p>Starts with the last 30 days. Choose up to 90 days per load. Dates use UTC; the end date is not included. P&amp;L is before fees. Up to 4 accounts load at once. Select an account to retry missing history.</p></details>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm">Account<select aria-label="History account" className="max-w-full rounded-lg border border-white/15 bg-[#171a21] p-2" value={historyAccount} onChange={event => { historyGuard.current.cancel(); setSyncBusy(false); setHistoryAccount(event.target.value); }}><option value="">Active accounts (up to 4)</option>{historyAccounts.map(item => <option key={item.account.id} value={item.account.id}>{item.account.name} · {item.status}</option>)}</select></label>
              <label className="grid gap-1 text-sm">From<input aria-label="History start date" type="date" className="rounded-lg border border-white/15 bg-[#171a21] p-2" value={historyWindow.startDate} onChange={event => { historyGuard.current.cancel(); setSyncBusy(false); setHistoryWindow(current => ({ ...current, startDate: event.target.value })); }} /></label>
              <label className="grid gap-1 text-sm">Before<input aria-label="History end date" type="date" className="rounded-lg border border-white/15 bg-[#171a21] p-2" value={historyWindow.endDate} onChange={event => { historyGuard.current.cancel(); setSyncBusy(false); setHistoryWindow(current => ({ ...current, endDate: event.target.value })); }} /></label>
              <button className="rounded-lg bg-[#4f7dff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={syncBusy || !entitlements.canUseDirectSync} onClick={() => void syncTradovate()}>{syncBusy ? "Loading history…" : "Load history"}</button>
            </div>

          </section>
        )}



        <div className="accounts-csv-grid">
          <div className="accounts-csv-main">
            <CsvUploadPanel
              dragActive={dragActive}
              entitlements={entitlements}
              fileName={fileName}
              importCsv={importCsv}
              mode={mode}
              parsed={parsed}
              readFile={readFile}
              reset={reset}
              setDragActive={setDragActive}
              setMode={setMode}
              status={status}
              text={text}
              upgradeToPro={upgradeToPro}
            />

            {text.trim() && <CsvPreview parsed={parsed} />}
          </div>

          <div className="accounts-csv-help">
            <CsvExportGuide selectedFirmId={selectedFirmId} setSelectedFirmId={setSelectedFirmId} />
            <details className="accounts-help accounts-csv-editor"><summary>Paste or edit CSV</summary>
            <textarea
              aria-label="CSV text" className="accounts-csv-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
            />
            </details>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

