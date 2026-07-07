import { useEffect, useMemo, useState } from "react";
import { parseCsvDetailed } from "../lib/risk";
import { type PropFirmId } from "../lib/propFirms";
import { BROKER_STATUS_KEY, readBrokerStatus, writeBrokerStatus, type BrokerStatus } from "../lib/brokerStatus";
import { buildTradovateConnectUrl, canRedirectToTradovate } from "../lib/tradovateConnect";
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
      const response = await fetch("/api/tradovate/sync", { credentials: "include" });
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
      const response = await fetch("/api/projectx/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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
        message: data.message || (data.connected ? "TopstepX connected read-only." : "TopstepX verified the key, but secure storage is not configured yet."),
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
      const response = await fetch("/api/projectx/sync", { credentials: "include" });
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

  function startTradovateConnect() {
    if (!canRedirectToTradovate()) {
      setBrokerNotice("Tradovate secure sync is not available in this preview. Upload a Tradovate export below to review the account today.");
      return;
    }

    window.location.assign(buildTradovateConnectUrl());
  }

  async function checkTradovateStatus() {
    setBrokerBusy(true);
    setBrokerNotice("");
    try {
      const response = await fetch("/api/tradovate/status", { credentials: "include" });
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
      eyebrow="Upload"
      title="Connect trade history."
      variant="workspace"
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" align="right" opacity="opacity-[0.22]" />}
    >
      <div className="grid gap-6">
        <BrokerConnectPanel
          brokerBusy={brokerBusy}
          brokerNotice={brokerNotice}
          canRedirectToTradovate={canRedirectToTradovate}
          brokerStatus={brokerStatus}
          checkTradovateStatus={checkTradovateStatus}
          connectProjectX={connectProjectX}
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

        <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
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

          <div className="liquid-glass rounded-[36px] p-3">
            <textarea
              className="min-h-[520px] w-full resize-y rounded-[28px] border border-white/10 bg-black/50 p-6 font-mono text-sm leading-relaxed text-white/75 outline-none transition focus:border-[#18c887]"
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

