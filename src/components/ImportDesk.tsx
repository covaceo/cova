import { useEffect, useMemo, useRef, useState } from "react";
import { parseCsvDetailed, type TradeMergeResult } from "../lib/risk";
import { type PropFirmId } from "../lib/propFirms";
import { clearBrokerStatus, readBrokerStatus, writeBrokerStatus, type BrokerStatus } from "../lib/brokerStatus";
import { canRedirectToTradovate } from "../lib/tradovateConnect";
import { authorizedFetch } from "../lib/apiClient";
import { ImageAtmosphere, SectionShell } from "./LayoutShell";
import { BrokerConnectPanel, CsvExportGuide, CsvPreview, CsvUploadPanel, ImportNextSteps } from "./ImportPanels";

type ImportMode = "append" | "replace" | "merge";
type ImportCommit = (text: string, mode?: ImportMode) => TradeMergeResult["receipt"] | null;
type PreparedImport = { commit: ImportCommit; isCurrent: () => boolean };
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
  const [text, setText] = useState("date,market,side,contracts,entry,exit,pnl,risk,setup,notes\n2026-05-06,NQ,Long,1,18900,18915,300,250,Opening range,Smoke row");
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
  const parsed = useMemo(() => parseCsvDetailed(text), [text]);

  useEffect(() => () => {
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
    const refreshBrokerStatus = () => setBrokerStatus(readBrokerStatus());
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
    authorizedFetch("/api/tradovate/status")
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as TradovateStatusResponse;
        if (cancelled) return;
        setTradovateCapability({ available: response.ok && data?.available === true, checked: true });
        if (response.ok && data?.connected === true) {
          const nextStatus = brokerStatusFromTradovate(data);
          writeBrokerStatus(nextStatus);
          setBrokerStatus(nextStatus);
        } else if (response.ok && data?.connected === false && readBrokerStatus()?.provider === "Tradovate") {
          clearBrokerStatus();
          setBrokerStatus(null);
        }
      })
      .catch(() => {
        if (!cancelled) setTradovateCapability({ available: false, checked: true });
      });
    return () => { cancelled = true; };
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

  async function syncTradovate() {
    setSyncBusy(true);
    setBrokerNotice("");
    try {
      const response = await authorizedFetch("/api/tradovate/sync");
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("Broker sync is not reachable from this preview.");
      }
      const data = await response.json() as { csv?: string; trades?: unknown[]; counts?: { trades?: number }; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Tradovate sync failed.");
      }
      const tradeCount = data.counts?.trades ?? data.trades?.length ?? 0;
      if (!data.csv || tradeCount <= 0) {
        setBrokerNotice("Tradovate connected, but no closed fill pairs were found yet.");
        return;
      }
      const verified = parseCsvDetailed(data.csv);
      if (verified.issues.length || verified.trades.length !== tradeCount) {
        throw new Error("Tradovate returned an inconsistent trade ledger, so Cova did not import it.");
      }
      setBrokerNotice(`Synced ${tradeCount} Tradovate trade${tradeCount === 1 ? "" : "s"} into Cova.`);
      importCsv(data.csv, "replace");
    } catch (error) {
      setBrokerNotice(`${error instanceof Error ? error.message : "Tradovate sync is unavailable right now."} Upload a CSV export instead and Cova will review the account the same way.`);
    } finally {
      setSyncBusy(false);
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
        account?: { accountKey?: string; accountName?: string };
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
          message: `${credentials.systemName} login verified. No completed fill history was returned, and the login was discarded.`,
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
        if (preparedImport.isCurrent()) setRithmicBusy(false);
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
      eyebrow="Trade history"
      title="Get trades into Cova."
      variant="workspace"
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" align="right" opacity="opacity-[0.22]" />}
    >
      <div className="import-desk-flow import-source-workflow grid gap-6">
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
          syncTradovate={syncTradovate}
          upgradeToPro={upgradeToPro}
        />

        <CsvExportGuide selectedFirmId={selectedFirmId} setSelectedFirmId={setSelectedFirmId} />

        <div className="import-csv-grid grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-6">
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

            <ImportNextSteps entitlements={entitlements} />
            <CsvPreview parsed={parsed} />
          </div>

          <div className="import-raw-editor import-raw-ledger p-3">
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <span className="font-body text-xs uppercase tracking-[0.2em] text-white/38">Raw CSV</span>
              <span className="font-body text-xs text-white/34">Advanced edit</span>
            </div>
            <textarea
              className="min-h-[430px] w-full resize-y rounded-[22px] border border-white/10 bg-black/50 p-5 font-mono text-sm leading-relaxed text-white/75 outline-none transition focus:border-[#18c887]"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

