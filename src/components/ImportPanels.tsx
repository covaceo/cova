import { FileUp, ArrowUpRight } from "lucide-react";
import { type CsvParseResult, formatMoney, type TradeMergeResult } from "../lib/risk";
import { type PropFirmId } from "../lib/propFirms";

type ImportMode = "append" | "replace" | "merge";
type ImportEntitlements = { canUseDirectSync: boolean; maxStoredTrades: number; maxTradesPerImport: number; plan: "free" | "pro" };
type BrokerStatus = { provider: string; status: string; connected: boolean; mode?: "linked" | "ephemeral"; connectionId?: string; message: string; updatedAt: string };
type RithmicCredentials = { username: string; password: string; accountKey?: string; lookbackDays: 30 | 90 | 180; systemName: "Rithmic Paper Trading" | "Rithmic 01" | "Rithmic Test" };
type RithmicSyncResult = { selectionRequired?: boolean; accounts?: { accountKey?: string; accountId?: string; accountName?: string }[] };

export function CsvUploadPanel({ dragActive, entitlements, fileName, importCsv, mode, parsed, readFile, reset, setDragActive, setMode, status, text }: {
  dragActive: boolean; entitlements: ImportEntitlements; fileName: string;
  importCsv: (text: string, mode?: ImportMode) => TradeMergeResult["receipt"] | null;
  mode: ImportMode; parsed: CsvParseResult; readFile: (file?: File) => Promise<void>; reset: () => void;
  setDragActive: (active: boolean) => void; setMode: (mode: ImportMode) => void; status: string; text: string; upgradeToPro: () => void;
}) {
  return <section className="accounts-panel accounts-csv" data-csv-import data-csv-primary>
    <div className="accounts-section-heading"><h3>CSV upload</h3>{entitlements.plan === "free" && <span>Up to {entitlements.maxTradesPerImport} trades per file</span>}</div>
    <p>Upload a trade export from your platform.</p>
    <label className={`accounts-dropzone ${dragActive ? "is-dragging" : ""}`}
      onDragEnter={event => { event.preventDefault(); setDragActive(true); }}
      onDragOver={event => { event.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={event => { event.preventDefault(); setDragActive(false); void readFile(event.dataTransfer.files[0]); }}>
      <FileUp aria-hidden="true" /><span>{fileName || "Choose a CSV or drop it here"}<small>CSV files up to 2 MB</small></span>
      <input className="sr-only" aria-label="Choose CSV file" type="file" accept=".csv,text/csv" onChange={event => void readFile(event.target.files?.[0])} />
    </label>
    <div className="accounts-csv-actions">
      <label className="accounts-field">Import as<select aria-label="CSV import mode" value={mode} onChange={event => setMode(event.target.value as ImportMode)}><option value="append">Add trades</option><option value="replace">Replace all trades</option></select></label>
      <button className="accounts-button accounts-button-primary" type="button" disabled={!text.trim() || !parsed.trades.length} onClick={() => importCsv(text, mode)}>Review trades</button>
    </div>
    {mode === "replace" && <p className="accounts-warning">This replaces all saved trade history. Use Add trades to keep your existing trades.</p>}
    {text.trim() && <p className="accounts-file-status">{parsed.trades.length} trades found{parsed.issues.length ? ` · ${parsed.issues.length} issues to check` : ""}</p>}
    {status && <p className="accounts-file-status" role="status">{status}</p>}
    <details className="accounts-help"><summary>Sample data</summary><p>Replace all saved trade history with sample trades.</p><button className="accounts-button" type="button" onClick={reset}>Reset demo</button></details>
  </section>;
}

export function CsvPreview({ parsed }: { parsed: CsvParseResult }) {
  return <section className="accounts-preview" aria-label="CSV preview">
    <h3>File preview</h3>
    {parsed.issues.length > 0 && <div className="accounts-warning" role="status"><p>{parsed.issues.length} issues to check</p>{parsed.issues.slice(0, 3).map(issue => <p key={`${issue.row}-${issue.message}`}>Row {issue.row}: {issue.message}</p>)}</div>}
    <div className="accounts-preview-rows">{parsed.trades.slice(0, 5).map(trade => <div className="accounts-preview-row" key={trade.id}><span>{trade.date.slice(5)}</span><span>{trade.market}</span><span className="accounts-preview-setup">{trade.setup}</span><span>{formatMoney(trade.pnl)}</span></div>)}</div>
    {!parsed.trades.length && <p>No valid trades to preview.</p>}
  </section>;
}

export function CsvExportGuide(_props: { selectedFirmId: PropFirmId; setSelectedFirmId: (firm: PropFirmId) => void }) {
  return <details className="accounts-help" data-export-guide><summary>CSV format</summary><p>Export your trade history as CSV. Include the date, market, buy or sell side, quantity, and P&amp;L. Cova checks the columns before importing.</p><p>If your export is not recognized, use the CSV editor below with these columns:</p><code>date,market,side,contracts,entry,exit,pnl,risk,setup,notes</code></details>;
}

export function BrokerConnectPanel({ brokerBusy, brokerNotice, brokerStatus, canRedirectToTradovate, checkTradovateStatus, disconnectBroker, entitlements, tradovateAvailable, tradovateStatusChecked, setBrokerNotice, startTradovateConnect, syncBusy, syncTradovate, upgradeToPro }: {
  brokerBusy: boolean; brokerNotice: string; brokerStatus: BrokerStatus | null;
  canRedirectToTradovate: () => boolean; checkTradovateStatus: () => void; disconnectBroker: () => Promise<void> | void;
  entitlements: ImportEntitlements; openFirmOAuth: (firm: PropFirmId) => void;
  rithmicAvailable: boolean; rithmicBusy: boolean; rithmicStatusChecked: boolean;
  tradovateAvailable: boolean; tradovateStatusChecked: boolean; selectedFirmId: PropFirmId;
  setBrokerNotice: (notice: string) => void; setSelectedFirmId: (firm: PropFirmId) => void;
  startTradovateConnect: () => void; syncBusy: boolean;
  syncRithmic: (credentials: RithmicCredentials) => Promise<RithmicSyncResult | void> | RithmicSyncResult | void;
  syncTradovate: () => void; upgradeToPro: () => void;
}) {
  const connected = brokerStatus?.provider === "Tradovate" && brokerStatus.connected;
  const ready = tradovateStatusChecked && tradovateAvailable;
  function useCsv() {
    document.querySelector("[data-csv-import]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    (document.querySelector('[aria-label="Choose CSV file"]') as HTMLInputElement | null)?.focus({ preventScroll: true });
  }
  function connect() {
    if (!ready || !entitlements.canUseDirectSync || brokerBusy || syncBusy) return;
    if (!canRedirectToTradovate()) { setBrokerNotice("Connection unavailable. Upload a CSV instead."); return; }
    startTradovateConnect();
  }
  return <section className="accounts-connections" aria-label="Trading platforms">
    <div className="accounts-platforms">
      <article className="accounts-panel accounts-platform" data-platform="tradovate" data-broker-lifecycle>
        <div className="accounts-section-heading"><h3>Tradovate</h3><span className="accounts-connection-status">{!tradovateStatusChecked ? "Checking…" : !tradovateAvailable ? "Sync unavailable" : connected ? "Connected" : "Not connected"}</span></div>
        <p>Read-only trade history. No orders placed.</p>
        <div className="accounts-actions">
          {ready && entitlements.canUseDirectSync && !connected && <button className="accounts-button accounts-button-primary" type="button" disabled={brokerBusy || syncBusy} onClick={connect}>Sign in with Tradovate <ArrowUpRight aria-hidden="true" /></button>}
          {ready && entitlements.canUseDirectSync && connected && <button className="accounts-button accounts-button-primary" type="button" disabled={syncBusy || brokerBusy} onClick={syncTradovate}>{syncBusy ? "Syncing…" : "Sync trades"}</button>}
          {!entitlements.canUseDirectSync && <button className="accounts-button" type="button" onClick={upgradeToPro}>Connect with Pro</button>}
          {tradovateStatusChecked && !tradovateAvailable && <button className="accounts-button" type="button" onClick={useCsv} data-tradovate-unavailable>Use CSV</button>}
          <button className="accounts-text-button" type="button" disabled={brokerBusy || syncBusy} onClick={checkTradovateStatus}>{brokerBusy ? "Checking…" : "Refresh status"}</button>
          {connected && <button className="accounts-text-button" type="button" disabled={brokerBusy || syncBusy} onClick={disconnectBroker}>Disconnect</button>}
        </div>
      </article>
      <article className="accounts-panel accounts-platform" data-platform="ninjatrader">
        <div className="accounts-section-heading"><h3>NinjaTrader</h3><span>CSV import</span></div>
        <p>Export your trades from NinjaTrader, then upload the CSV.</p>
        <div className="accounts-actions"><button className="accounts-button" type="button" onClick={useCsv}>Upload CSV <FileUp aria-hidden="true" /></button></div>
      </article>
    </div>
    {brokerNotice && <p className="accounts-notice" role="status">{brokerNotice}</p>}
  </section>;
}
