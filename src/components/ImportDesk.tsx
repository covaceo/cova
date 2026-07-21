import { useEffect, useMemo, useState } from "react";
import { parseCsvDetailed } from "../lib/risk";
import { type PropFirmId } from "../lib/propFirms";
import { BROKER_STATUS_KEY, clearBrokerStatus, readBrokerStatus, writeBrokerStatus, type BrokerStatus } from "../lib/brokerStatus";
import { canRedirectToTradovate } from "../lib/tradovateConnect";
import { authorizedFetch } from "../lib/apiClient";
import { ImageAtmosphere, SectionShell } from "./LayoutShell";
import { BrokerConnectPanel, CsvExportGuide, CsvPreview, CsvUploadPanel, ImportNextSteps } from "./ImportPanels";

type ImportMode = "append" | "replace";
type ImportEntitlements = {
  canUseDirectSync: boolean;
  maxStoredTrades: number;
  maxTradesPerImport: number;
  plan: "free" | "pro";
};
type ProjectXCredentials = {
  userName: string;
  apiKey: string;
};

export function ImportDesk({ entitlements, importCsv, openFirmOAuth, status, reset, upgradeToPro }: { entitlements: ImportEntitlements; importCsv: (text: string, mode?: ImportMode) => void; openFirmOAuth: (firm: PropFirmId) => void; status: string; reset: () => void; upgradeToPro: () => void }) {
  const [text, setText] = useState("date,market,side,contracts,entry,exit,pnl,risk,setup,notes\n2026-05-06,NQ,Long,1,18900,18915,300,250,Opening range,Smoke row");
  const [mode, setMode] = useState<ImportMode>("append");
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState("");
  const [brokerBusy, setBrokerBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [projectXBusy, setProjectXBusy] = useState(false);
  const [projectXSyncBusy, setProjectXSyncBusy] = useState(false);
  const [brokerNotice, setBrokerNotice] = useState("");
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatus | null>(() => readBrokerStatus());
  const [selectedFirmId, setSelectedFirmId] = useState<PropFirmId>("topstepx");
  const parsed = useMemo(() => parseCsvDetailed(text), [text]);

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

  async function readFile(file?: File) {
    if (!file) {
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
      setBrokerNotice(`Synced ${tradeCount} Tradovate trade${tradeCount === 1 ? "" : "s"} into Cova.`);
      importCsv(data.csv, "replace");
    } catch (error) {
      setBrokerNotice(`${error instanceof Error ? error.message : "Tradovate sync is unavailable right now."} Upload a CSV export instead and Cova will review the account the same way.`);
    } finally {
      setSyncBusy(false);
    }
  }

  async function connectProjectX(credentials: ProjectXCredentials) {
    setProjectXBusy(true);
    setBrokerNotice("");
    try {
      const response = await authorizedFetch("/api/projectx/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("TopstepX connector backend is not running. Use Vercel dev or deploy Cova before testing the real connector.");
      }
      const data = await response.json() as Partial<BrokerStatus> & { error?: string; verified?: boolean; accounts?: unknown[] };
      if (!response.ok) {
        throw new Error(data.error || "TopstepX could not validate those credentials.");
      }

      const nextStatus: BrokerStatus = {
        provider: "TopstepX",
        status: data.connected ? "connected" : (data.status as BrokerStatus["status"] || "needs-storage"),
        connected: Boolean(data.connected),
        connectionId: data.connectionId,
        message: data.message || (data.connected ? "TopstepX connected. Cova will only request account and trade-history endpoints." : "TopstepX validated the key, but secure storage is not configured yet."),
        updatedAt: new Date().toISOString(),
      };
      writeBrokerStatus(nextStatus);
      setBrokerStatus(nextStatus);
      setBrokerNotice(nextStatus.message);
      if (nextStatus.connected) {
        void syncProjectX();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "TopstepX connect is unavailable right now.";
      const nextStatus: BrokerStatus = {
        provider: "TopstepX",
        status: "api-unavailable",
        connected: false,
        message,
        updatedAt: new Date().toISOString(),
      };
      setBrokerStatus(nextStatus);
      setBrokerNotice(`${message} You can still use the TopstepX export guide below today.`);
    } finally {
      setProjectXBusy(false);
    }
  }

  async function syncProjectX() {
    setProjectXSyncBusy(true);
    setBrokerNotice("");
    try {
      const response = await authorizedFetch("/api/projectx/sync");
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("TopstepX sync backend is not reachable from this preview.");
      }
      const data = await response.json() as { csv?: string; trades?: unknown[]; counts?: { trades?: number; rawTrades?: number }; error?: string; account?: { name?: string } };
      if (!response.ok) {
        throw new Error(data.error || "TopstepX sync failed.");
      }
      const tradeCount = data.counts?.trades ?? data.trades?.length ?? 0;
      if (!data.csv || tradeCount <= 0) {
        setBrokerNotice("TopstepX connected, but no trade history came back for the selected account yet.");
        return;
      }
      setBrokerNotice(`Synced ${tradeCount} TopstepX trade${tradeCount === 1 ? "" : "s"}${data.account?.name ? ` from ${data.account.name}` : ""}.`);
      importCsv(data.csv, "replace");
    } catch (error) {
      setBrokerNotice(`${error instanceof Error ? error.message : "TopstepX sync is unavailable right now."} Use the export guide below if you need to import today.`);
    } finally {
      setProjectXSyncBusy(false);
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
    const provider = brokerStatus.provider === "Tradovate" ? "tradovate" : "projectx";
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
      const data = await response.json() as Partial<BrokerStatus> & { provider?: string };
      const nextStatus: BrokerStatus = {
        provider: "Tradovate",
        status: data.connected ? "connected" : "not-connected",
        connected: Boolean(data.connected),
        connectionId: data.connectionId,
        message: data.message || (data.connected ? "Tradovate connection found." : "No Tradovate connection found yet."),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(BROKER_STATUS_KEY, JSON.stringify(nextStatus));
      setBrokerStatus(nextStatus);
      setBrokerNotice(nextStatus.message);
    } catch (error) {
      const nextStatus: BrokerStatus = {
        provider: "Tradovate",
        status: "api-unavailable",
        connected: false,
        message: error instanceof Error ? error.message : "Tradovate status check is unavailable in this preview.",
        updatedAt: new Date().toISOString(),
      };
      setBrokerStatus(nextStatus);
      setBrokerNotice(`${nextStatus.message} Upload a CSV export instead and Cova will review the account the same way.`);
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
          connectProjectX={connectProjectX}
          disconnectBroker={disconnectBroker}
          entitlements={entitlements}
          openFirmOAuth={openFirmOAuth}
          projectXBusy={projectXBusy}
          projectXSyncBusy={projectXSyncBusy}
          selectedFirmId={selectedFirmId}
          setBrokerNotice={setBrokerNotice}
          setSelectedFirmId={setSelectedFirmId}
          startTradovateConnect={startTradovateConnect}
          syncBusy={syncBusy}
          syncProjectX={syncProjectX}
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

