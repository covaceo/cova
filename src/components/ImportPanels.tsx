import { motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { ArrowUpRight, BadgeCheck, ChevronDown, CircleDot, ClipboardCheck, FileUp, Gauge, LockKeyhole, SlidersHorizontal, Upload } from "lucide-react";
import { type CsvParseResult, formatMoney } from "../lib/risk";
import { buildFirmConnectUrl, canRedirectToFirmProvider, csvExportGuides, propFirmOptions, type PropFirmId } from "../lib/propFirms";
import { GlassButton } from "./GlassButton";
import { RithmicAttribution } from "./RithmicAttribution";

type ImportMode = "append" | "replace";
type ImportEntitlements = {
  canUseDirectSync: boolean;
  maxStoredTrades: number;
  maxTradesPerImport: number;
  plan: "free" | "pro";
};
type BrokerStatus = {
  provider: string;
  status: string;
  connected: boolean;
  mode?: "linked" | "ephemeral";
  connectionId?: string;
  message: string;
  updatedAt: string;
};
type CredentialText = `${string}`;
type ProjectXCredentials = {
  userName: string;
  apiKey: CredentialText;
};
type RithmicCredentials = {
  username: string;
  password: CredentialText;
  accountId?: string;
  lookbackDays: 30 | 90 | 180 | 365;
};
type RithmicSyncResult = {
  selectionRequired?: boolean;
  accounts?: { accountId?: string; accountName?: string }[];
};

export function CsvUploadPanel({
  dragActive,
  entitlements,
  fileName,
  importCsv,
  mode,
  parsed,
  readFile,
  reset,
  setDragActive,
  setMode,
  status,
  text,
  upgradeToPro,
}: {
  dragActive: boolean;
  entitlements: ImportEntitlements;
  fileName: string;
  importCsv: (text: string, mode?: ImportMode) => void;
  mode: ImportMode;
  parsed: CsvParseResult;
  readFile: (file?: File) => Promise<void>;
  reset: () => void;
  setDragActive: (active: boolean) => void;
  setMode: (mode: ImportMode) => void;
  status: string;
  text: string;
  upgradeToPro: () => void;
}) {
  return (
    <div
      className={`import-upload-panel import-workflow-panel p-6 transition md:p-7 ${dragActive ? "scale-[1.01] border-[#18c887]/60" : ""}`}
      data-csv-import
      onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
      onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => { event.preventDefault(); setDragActive(false); void readFile(event.dataTransfer.files[0]); }}
    >
      <Upload className="h-10 w-10 text-[#18c887]" />
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <h3 className="font-body text-3xl font-semibold leading-[1] tracking-[-0.045em] md:text-4xl">Upload CSV.</h3>
        <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 font-body text-xs text-white/52">
          {entitlements.plan === "free" ? `${entitlements.maxTradesPerImport} trade free limit` : "Unlimited imports"}
        </span>
      </div>
      <p className="mt-5 max-w-md font-body font-light leading-relaxed text-white/60">
        If the direct connector is not ready, upload the export your prop firm already gives you. Cova checks the file, then updates the risk desk.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <label className="liquid-glass inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-3 font-body text-sm font-medium text-white transition hover:text-white">
          <FileUp className="h-4 w-4" />
          Choose file
          <input
            className="sr-only"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
        </label>
        <div className="terminal-tab-bar inline-grid grid-cols-2">
          {(["append", "replace"] as const).map((item) => {
            const active = mode === item;
            return (
              <button
        className={`terminal-tab px-4 py-2 font-body text-sm ${active ? "terminal-tab-active" : ""}`}
        key={item}
        onClick={() => setMode(item)}
        type="button"
              >
        {active && (
          <motion.span
            className="terminal-tab-motion"
            layoutId="import-mode-tab-active"
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
        <span className="terminal-tab-copy">{item === "append" ? "Append" : "Replace"}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <ImportStat label="Rows" value={`${parsed.trades.length}/${parsed.rowCount}`} tone={parsed.trades.length ? "text-emerald-300" : "text-white/50"} />
        <ImportStat label="Issues" value={String(parsed.issues.length)} tone={parsed.issues.length ? "text-red-300" : "text-emerald-300"} />
        <ImportStat label="Mode" value={mode} tone="text-[#18c887]" />
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <GlassButton strong onClick={() => importCsv(text, mode)}>Review trades</GlassButton>
        <GlassButton onClick={reset}>Reset demo</GlassButton>
        {entitlements.plan === "free" && <GlassButton onClick={upgradeToPro}>Unlock Pro</GlassButton>}
      </div>
      <p className="mt-6 font-body text-sm text-white/50">{fileName || status}</p>
    </div>
  );
}

export function ImportStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="import-ledger-stat p-4">
      <p className="font-body text-xs uppercase tracking-[0.2em] text-white/36">{label}</p>
      <p className={`mt-2 font-mono text-xl capitalize ${tone}`}>{value}</p>
    </div>
  );
}

export function ImportNextSteps({ entitlements }: { entitlements: ImportEntitlements }) {
  const steps = [
    ["Export", "Download trade history from your prop firm or platform."],
    ["Check", "Cova flags missing rows before anything hits your review."],
    ["Review", "Your dashboard updates with score, drawdown, limits, and notes."],
  ];

  return (
    <div className="import-next-ledger p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-body text-xs uppercase tracking-[0.22em] text-[#b9f5df]">What happens next</p>
          <p className="mt-1 font-body text-sm text-white/52">
            {entitlements.plan === "free"
              ? `Free accounts review up to ${entitlements.maxStoredTrades} trades. Enough to test the workflow without committing.`
              : "Pro accounts can review larger imports and use direct sync when a supported connector is configured."}
          </p>
        </div>
        <span className="w-fit rounded-full border border-white/10 bg-black/24 px-3 py-1.5 font-body text-xs text-white/46">
          Read-only. No orders.
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {steps.map(([label, body], index) => (
          <div className="import-step-row p-4" key={label}>
            <span className="font-mono text-xs text-[#18c887]">0{index + 1}</span>
            <p className="mt-2 font-body text-sm font-medium text-white/82">{label}</p>
            <p className="mt-1 font-body text-xs leading-relaxed text-white/44">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CsvPreview({ parsed }: { parsed: CsvParseResult }) {
  return (
    <div className="import-next-ledger p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Quick check</p>
          <p className="mt-1 font-body text-sm text-white/50">{parsed.headers.length ? parsed.headers.join(" / ") : "Waiting for CSV columns"}</p>
        </div>
        <ChevronDown className="h-4 w-4 text-white/40" />
      </div>
      {parsed.issues.length > 0 && (
        <div className="mt-4 rounded-[22px] border border-red-300/20 bg-red-500/8 p-4">
          <p className="font-body text-sm text-red-200">{parsed.issues.length} row issue{parsed.issues.length === 1 ? "" : "s"} found</p>
          {parsed.issues.slice(0, 3).map((issue) => (
            <p className="mt-2 font-mono text-xs text-red-200/70" key={`${issue.row}-${issue.message}`}>Row {issue.row}: {issue.message}</p>
          ))}
        </div>
      )}
      <div className="mt-4 overflow-hidden border border-white/10">
        {parsed.trades.slice(0, 5).map((trade) => (
          <div className="grid grid-cols-[70px_48px_1fr_auto] gap-3 border-b border-white/10 px-4 py-3 font-body text-sm last:border-b-0" key={trade.id}>
            <span className="text-white/45">{trade.date.slice(5)}</span>
            <span>{trade.market}</span>
            <span className="truncate text-white/55">{trade.setup}</span>
            <span className={trade.pnl >= 0 ? "text-emerald-300" : "text-red-300"}>{formatMoney(trade.pnl)}</span>
          </div>
        ))}
        {!parsed.trades.length && <p className="p-4 font-body text-sm text-white/45">No valid rows to preview yet.</p>}
      </div>
    </div>
  );
}

export function CsvExportGuide({ selectedFirmId, setSelectedFirmId }: { selectedFirmId: PropFirmId; setSelectedFirmId: (firm: PropFirmId) => void }) {
  const guide = csvExportGuides.find((item) => item.id === selectedFirmId) ?? csvExportGuides[0];

  return (
    <div className="csv-export-ledger p-5 md:p-6" data-export-guide>
      <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="terminal-tab-label inline-flex rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#b9f5df]">CSV guide</span>
            <span className="rounded-full border border-white/10 bg-black/28 px-3 py-1.5 font-body text-xs text-white/48">
              Exact labels vary by platform
            </span>
          </div>
          <h3 className="mt-6 font-body text-3xl font-semibold leading-[1.02] tracking-[-0.035em] text-white md:text-4xl">
            Get the right trade file without guessing.
          </h3>
          <p className="mt-4 max-w-xl font-body text-sm font-light leading-relaxed text-white/58">
            If direct sync is not available yet, export the trade history file your prop firm already provides. Cova checks it before importing.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {propFirmOptions.map((firm) => {
              const active = firm.id === selectedFirmId;
              return (
                <button
                  className={`rounded-full border px-3 py-1.5 font-body text-xs transition ${active ? "border-[#18c887]/44 bg-[#18c887]/12 text-[#b9f5df]" : "border-white/10 bg-white/[0.025] text-white/46 hover:border-white/20 hover:text-white/72"}`}
                  key={firm.id}
                  onClick={() => setSelectedFirmId(firm.id)}
                  type="button"
                >
                  {firm.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="csv-export-detail p-4 md:p-5">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-body text-xs uppercase tracking-[0.2em] text-[#18c887]">{guide.source}</p>
              <h4 className="mt-2 font-body text-2xl font-semibold text-white">{guide.title}</h4>
            </div>
            <span className="w-fit rounded-full border border-white/10 bg-white/[0.025] px-3 py-1.5 font-body text-xs text-white/44">
              No password sharing
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {guide.steps.map((step, index) => (
              <div className="csv-export-step p-4" key={step}>
                <span className="font-mono text-xs text-[#18c887]">0{index + 1}</span>
                <p className="mt-2 font-body text-sm leading-relaxed text-white/72">{step}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-3 border-l-2 border-[#18c887]/50 bg-[#18c887]/8 p-4">
            <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#b9f5df]" />
            <p className="font-body text-sm leading-relaxed text-white/58">{guide.tip}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrokerConnectPanel({
  brokerBusy,
  brokerNotice,
  brokerStatus,
  canRedirectToTradovate,
  checkTradovateStatus,
  connectProjectX,
  disconnectBroker,
  entitlements,
  openFirmOAuth,
  projectXBusy,
  projectXSyncBusy,
  rithmicAvailable,
  rithmicBusy,
  rithmicStatusChecked,
  selectedFirmId,
  setBrokerNotice,
  setSelectedFirmId,
  startTradovateConnect,
  syncBusy,
  syncProjectX,
  syncRithmic,
  syncTradovate,
  upgradeToPro,
}: {
  brokerBusy: boolean;
  brokerNotice: string;
  brokerStatus: BrokerStatus | null;
  canRedirectToTradovate: () => boolean;
  checkTradovateStatus: () => void;
  connectProjectX: (credentials: ProjectXCredentials) => Promise<void> | void;
  disconnectBroker: () => Promise<void> | void;
  entitlements: ImportEntitlements;
  openFirmOAuth: (firm: PropFirmId) => void;
  projectXBusy: boolean;
  projectXSyncBusy: boolean;
  rithmicAvailable: boolean;
  rithmicBusy: boolean;
  rithmicStatusChecked: boolean;
  selectedFirmId: PropFirmId;
  setBrokerNotice: (notice: string) => void;
  setSelectedFirmId: (firm: PropFirmId) => void;
  startTradovateConnect: () => void;
  syncBusy: boolean;
  syncProjectX: () => Promise<void> | void;
  syncRithmic: (credentials: RithmicCredentials) => Promise<RithmicSyncResult | void> | RithmicSyncResult | void;
  syncTradovate: () => void;
  upgradeToPro: () => void;
}) {
  const connected = Boolean(brokerStatus?.connected);
  const updated = brokerStatus?.updatedAt ? new Date(brokerStatus.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "not checked";
  const selectedFirm = propFirmOptions.find((firm) => firm.id === selectedFirmId) ?? propFirmOptions[0];
  const isTopstepX = selectedFirm.id === "topstepx";
  const selectedProviderName = isTopstepX ? "TopstepX" : selectedFirm.name;
  const selectedConnected = connected && brokerStatus?.provider === selectedProviderName;
  const selectedImported = brokerStatus?.mode === "ephemeral" && brokerStatus.provider === selectedProviderName;
  const selectedDirectSyncAvailable = entitlements.canUseDirectSync && (selectedFirm.id !== "rithmic" || rithmicAvailable);
  const [projectXCredentials, setProjectXCredentials] = useState<ProjectXCredentials>({ userName: "", apiKey: "" });
  const [rithmicCredentials, setRithmicCredentials] = useState<RithmicCredentials>({ username: "", password: "", lookbackDays: 90 });
  const [rithmicAccounts, setRithmicAccounts] = useState<{ accountId?: string; accountName?: string }[]>([]);

  function selectFirm(firm: (typeof propFirmOptions)[number]) {
    setSelectedFirmId(firm.id);
    setBrokerNotice(`${firm.name}: ${firm.fit}`);
  }

  function selectAndConnectFirm(firm: (typeof propFirmOptions)[number]) {
    setSelectedFirmId(firm.id);
    if (firm.id === "other") {
      document.querySelector("[data-csv-import]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setBrokerNotice(`${firm.name}: upload your trade export below and Cova will normalize it for review.`);
      return;
    }

    if (!entitlements.canUseDirectSync) {
      setBrokerNotice(`${firm.name}: direct account sync is a Pro feature. Use the CSV export path on Free.`);
      return;
    }

    if (firm.id === "topstepx") {
      setBrokerNotice("TopstepX beta connector: paste your username/API key below, or upload CSV first if you just want the review flow.");
      return;
    }

    if (firm.id === "rithmic") {
      setBrokerNotice(!rithmicStatusChecked
        ? "Checking the private Rithmic Test connector."
        : rithmicAvailable
          ? "Rithmic Test connector: enter the Test login below. Cova uses it for one read-only sync, logs out, and discards it."
          : "Rithmic Test connector is not active in this environment yet. Use CSV export until the private service passes release checks.");
      return;
    }

    if (firm.id === "tradovate" && canRedirectToTradovate()) {
      startTradovateConnect();
      return;
    }

    if (canRedirectToFirmProvider(firm.id)) {
      window.location.assign(buildFirmConnectUrl(firm.id));
      return;
    }

    document.querySelector("[data-export-guide]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setBrokerNotice(firm.connectNotice);
  }

  function useCsvLane() {
    document.querySelector("[data-csv-import]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setBrokerNotice(`${selectedFirm.name}: upload your trade export below. CSV is the default path while direct sync stays beta or unavailable.`);
  }

  function showExportGuide() {
    document.querySelector("[data-export-guide]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setBrokerNotice(`${selectedFirm.name}: use the export guide below to find the cleanest trade file for Cova.`);
  }

  function startFirmConnect() {
    const canUseConfiguredProvider = canRedirectToFirmProvider(selectedFirm.id);

    if (!entitlements.canUseDirectSync && selectedFirm.id !== "other") {
      setBrokerNotice(`${selectedFirm.name}: direct firm sync is a Pro feature. Use CSV export on Free, or unlock Pro when sync is live.`);
      return;
    }

    if (isTopstepX) {
      setBrokerNotice("TopstepX beta connector is available here. CSV upload is still the fastest review path if you do not want to test API access yet.");
      return;
    }

    if (selectedFirm.id === "rithmic") {
      setBrokerNotice(!rithmicStatusChecked
        ? "Checking the private Rithmic Test connector."
        : rithmicAvailable
          ? "Rithmic Test connector is ready below. The login stays in memory only for the request and is discarded when it finishes."
          : "Rithmic Test connector is not active in this environment yet. Use CSV export until the private service passes release checks.");
      return;
    }

    if (selectedFirm.id === "tradovate") {
      if (canRedirectToTradovate()) {
        startTradovateConnect();
        return;
      }
      setBrokerNotice("Tradovate direct API access is gated. Upload a Tradovate export below unless your account has API approval.");
      return;
    }

    if (selectedFirm.id === "other") {
      useCsvLane();
      return;
    }

    if (selectedFirm.id !== "topstepx" && !canUseConfiguredProvider) {
      showExportGuide();
      return;
    }

    if (canUseConfiguredProvider) {
      window.location.assign(buildFirmConnectUrl(selectedFirm.id));
      return;
    }

    setBrokerNotice(selectedFirm.connectNotice);
  }

  function submitProjectX(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entitlements.canUseDirectSync) {
      setBrokerNotice("TopstepX direct sync is a Pro feature. Use CSV import on Free.");
      return;
    }
    const credentials = { ...projectXCredentials };
    setProjectXCredentials((current) => ({ ...current, apiKey: "" }));
    void connectProjectX(credentials);
  }

  async function submitRithmic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entitlements.canUseDirectSync) {
      setBrokerNotice("Rithmic direct sync is a Pro feature. Use CSV import on Free.");
      return;
    }
    const credentials = { ...rithmicCredentials };
    try {
      const result = await syncRithmic(credentials);
      if (result?.selectionRequired && result.accounts?.length) {
        setRithmicAccounts(result.accounts);
        setRithmicCredentials((current) => ({ ...current, accountId: result.accounts?.[0]?.accountId }));
      }
    } finally {
      setRithmicCredentials((current) => ({ ...current, username: "", password: "" }));
    }
  }

  return (
    <div className="broker-connect-panel source-ledger-panel p-5 md:p-6">
      <div className="source-primary-choice" data-csv-primary>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="terminal-tab-label inline-flex rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#b9f5df]">Upload CSV first</span>
            <span className="rounded-full border border-amber-200/18 bg-amber-300/8 px-3 py-1.5 font-body text-xs text-amber-100">Beta connector optional</span>
          </div>
          <h3 className="mt-5 font-body text-3xl font-semibold leading-[0.98] tracking-[-0.05em] md:text-4xl">Start with the trade file you already trust.</h3>
          <p className="mt-4 max-w-2xl font-body text-sm leading-relaxed text-white/58">
            CSV is the live review path today. Connector access can follow, but the first decision should be simple: upload the export, check the rows, then let Cova build the risk desk.
          </p>
        </div>
        <div className="source-primary-actions">
          <GlassButton strong onClick={useCsvLane}>Upload CSV first</GlassButton>
          <GlassButton onClick={startFirmConnect}>Try beta connector <ArrowUpRight className="h-4 w-4" /></GlassButton>
        </div>
      </div>

      <div className="source-header-grid grid gap-7 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="terminal-tab-label inline-flex rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#b9f5df]">Secure link</span>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-body text-xs ${selectedConnected ? "border-emerald-300/24 bg-emerald-400/10 text-emerald-200" : "border-white/12 bg-white/[0.035] text-white/52"}`}>
              <span className={`h-2 w-2 rounded-full ${selectedConnected ? "bg-emerald-300" : "bg-white/30"}`} />
              {selectedConnected ? `${selectedProviderName} connected` : selectedImported ? `${selectedProviderName} imported` : "CSV ready today"}
            </span>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-body text-xs ${selectedDirectSyncAvailable ? "border-[#18c887]/24 bg-[#18c887]/10 text-[#b9f5df]" : "border-white/12 bg-white/[0.035] text-white/48"}`}>
              {!entitlements.canUseDirectSync
                ? "Pro sync locked · CSV available"
                : isTopstepX
                  ? "Pro beta connector"
                  : rithmicAvailable
                    ? "Pro sync enabled"
                    : "Private sync unavailable"}
            </span>
          </div>
          <h3 className="mt-6 font-body text-3xl font-semibold leading-[0.98] tracking-[-0.05em] md:text-5xl">Pick the source.</h3>
          <p className="mt-5 max-w-2xl font-body font-light leading-relaxed text-white/62">
            Choose where the trades come from. Cova only reviews history — no live orders, no money movement.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <GlassButton strong onClick={startFirmConnect}>
              {selectedFirm.connectLabel} <ArrowUpRight className="h-4 w-4" />
            </GlassButton>
            <GlassButton onClick={showExportGuide}>Show export steps</GlassButton>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          <ImportStat label="Firm" value={selectedFirm.name} tone="text-[#18c887]" />
          <ImportStat label="Method" value={selectedFirm.route} tone={selectedFirm.status === "direct" ? "text-emerald-300" : selectedFirm.status === "advanced" ? "text-amber-200" : "text-white/70"} />
          <ImportStat label="Trading" value="Off" tone="text-white/58" />
        </div>
      </div>

      <div className="firm-card-grid mt-6 grid gap-3 border-t border-white/10 pt-5 md:grid-cols-2 xl:grid-cols-4">
        {propFirmOptions.map((firm) => {
          const active = firm.id === selectedFirm.id;
          const tone = firm.status === "direct" ? "text-emerald-300" : firm.status === "advanced" ? "text-amber-200" : "text-[#b9f5df]";
          return (
            <motion.button
              className={`firm-connect-card source-ledger-row border p-4 text-left transition ${active ? "is-active border-[#18c887]/54 bg-[#18c887]/10" : "border-white/10 bg-black/22 hover:border-white/22 hover:bg-white/[0.035]"}`}
              data-firm-id={firm.id}
              key={firm.id}
              onClick={() => selectAndConnectFirm(firm)}
              type="button"
              aria-label={firm.id === "other" ? `Use ${firm.name} export` : firm.connectLabel}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-body text-base font-medium text-white">{firm.name}</p>
                  <p className={`mt-1 font-mono text-[10px] uppercase tracking-[0.18em] ${tone}`}>{firm.badge}</p>
                </div>
                {active && <CircleDot className="h-5 w-5 text-[#18c887]" />}
              </div>
              <p className="mt-4 font-body text-xs uppercase tracking-[0.16em] text-white/34">{firm.platforms}</p>
              <p className="mt-3 font-body text-sm leading-relaxed text-white/54">{firm.summary}</p>
              {active && firm.id !== "other" && (
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[#b9f5df]/80">
                  {firm.id === "topstepx" ? "Beta connector below" : firm.id === "rithmic" ? "Test connector below" : "Use export guide today"}
                </p>
              )}
            </motion.button>
          );
        })}
      </div>

      {isTopstepX && entitlements.canUseDirectSync && (
        <form
          className="projectx-ledger mt-6 border border-emerald-200/14 bg-[linear-gradient(135deg,rgba(24,200,135,0.11),rgba(0,0,0,0.22)_44%,rgba(59,130,246,0.08))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          data-projectx-connect
          onSubmit={submitProjectX}
        >
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-emerald-200/16 bg-emerald-300/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#b9f5df]">Beta connector</span>
                <span className="rounded-full border border-white/10 bg-black/28 px-3 py-1.5 font-body text-xs text-white/48">No password required</span>
              </div>
              <h4 className="mt-4 font-body text-2xl font-semibold tracking-[-0.03em] text-white">Test TopstepX through ProjectX.</h4>
              <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-white/56">
                CSV upload is the default path today. If you test the beta connector, Cova validates the API key on the backend, discards the raw key after authentication, and only calls account and trade-history endpoints.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              {selectedConnected && (
                <GlassButton onClick={syncProjectX}>{projectXSyncBusy ? "Syncing..." : "Sync TopstepX"}</GlassButton>
              )}
              <GlassButton onClick={showExportGuide}>Need export steps?</GlassButton>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <label className="block">
              <span className="font-body text-xs uppercase tracking-[0.18em] text-white/42">TopstepX username</span>
              <input
                autoComplete="username"
                className="mt-2 h-12 w-full rounded-[16px] border border-white/10 bg-black/34 px-4 font-body text-sm text-white outline-none transition placeholder:text-white/24 focus:border-emerald-200/32 focus:bg-black/44"
                onChange={(event) => setProjectXCredentials((current) => ({ ...current, userName: event.target.value }))}
                placeholder="your@email.com"
                type="text"
                value={projectXCredentials.userName}
              />
            </label>
            <label className="block">
              <span className="font-body text-xs uppercase tracking-[0.18em] text-white/42">API key</span>
              <input
                autoComplete="off"
                className="mt-2 h-12 w-full rounded-[16px] border border-white/10 bg-black/34 px-4 font-body text-sm text-white outline-none transition placeholder:text-white/24 focus:border-emerald-200/32 focus:bg-black/44"
                onChange={(event) => setProjectXCredentials((current) => ({ ...current, apiKey: event.target.value }))}
                placeholder="Paste API key"
                type="password"
                value={projectXCredentials.apiKey}
              />
            </label>
            <GlassButton strong type="submit">
              {projectXBusy ? "Connecting..." : "Connect"} <ArrowUpRight className="h-4 w-4" />
            </GlassButton>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              { icon: LockKeyhole, label: "No order calls", text: "Cova's endpoint allowlist excludes order placement, changes, and cancellation." },
              { icon: BadgeCheck, label: "Encrypted", text: "The session token is encrypted before it is stored." },
              { icon: Gauge, label: "Provider scope", text: "The provider token may carry broader permissions. Revoke it at the provider when finished." },
            ].map(({ icon: Icon, label, text }) => (
              <div className="source-security-row p-3" key={label}>
                <Icon className="h-4 w-4 text-[#18c887]" />
                <p className="mt-2 font-body text-xs font-medium text-white/78">{label}</p>
                <p className="mt-1 font-body text-[11px] leading-relaxed text-white/42">{text}</p>
              </div>
            ))}
          </div>
        </form>
      )}

      {selectedFirm.id === "rithmic" && entitlements.canUseDirectSync && (!rithmicStatusChecked || !rithmicAvailable) && (
        <div className="mt-6 rounded-[24px] border border-white/12 bg-white/[0.025] p-5" data-rithmic-unavailable>
          <p className="font-body text-xs uppercase tracking-[0.2em] text-amber-100/80">Private Test connector</p>
          <h4 className="mt-3 font-body text-xl font-semibold text-white">{rithmicStatusChecked ? "Not active in this environment." : "Checking connector availability..."}</h4>
          <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-white/58">
            {rithmicStatusChecked ? "Cova keeps the credential form disabled until the signed private service and atomic nonce store are reachable. CSV import remains available below." : "Cova is verifying the signed private service before showing any credential fields."}
          </p>
        </div>
      )}

      {selectedFirm.id === "rithmic" && entitlements.canUseDirectSync && rithmicStatusChecked && rithmicAvailable && (
        <form
          className="mt-6 rounded-[24px] border border-white/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(0,0,0,0.22)_52%,rgba(24,200,135,0.055))] p-5"
          data-rithmic-connect
          onSubmit={submitRithmic}
        >
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-amber-200/18 bg-amber-300/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-100">Rithmic Test</span>
                <span className="rounded-full border border-emerald-200/16 bg-emerald-300/8 px-3 py-1.5 font-body text-xs text-[#b9f5df]">Read-only · on demand</span>
              </div>
              <h4 className="mt-4 font-body text-2xl font-semibold tracking-[-0.03em] text-white">Import completed Rithmic fills.</h4>
              <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-white/56">
                Rithmic Test only. Your username and password are used only for this request and discarded by Cova when it finishes. Cova requests accounts, completed fills, and contract values, then logs out. It never sends order requests. Imported P&amp;L is gross before commissions.
              </p>
            </div>
            <GlassButton onClick={showExportGuide}>Need export steps?</GlassButton>
          </div>

          <div className={`mt-5 grid gap-3 md:items-end ${rithmicAccounts.length > 0 ? "md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_180px_auto]" : "md:grid-cols-[1fr_1fr_180px_auto]"}`}>
            <label className="block">
              <span className="font-body text-xs uppercase tracking-[0.18em] text-white/42">Rithmic Test username</span>
              <input
                autoComplete="username"
                className="mt-2 h-12 w-full rounded-[16px] border border-white/10 bg-black/34 px-4 font-body text-sm text-white outline-none transition placeholder:text-white/24 focus:border-emerald-200/32 focus:bg-black/44"
                onChange={(event) => setRithmicCredentials((current) => ({ ...current, username: event.target.value }))}
                placeholder="Test username"
                required
                type="text"
                value={rithmicCredentials.username}
              />
            </label>
            <label className="block">
              <span className="font-body text-xs uppercase tracking-[0.18em] text-white/42">Password</span>
              <input
                autoComplete="current-password"
                className="mt-2 h-12 w-full rounded-[16px] border border-white/10 bg-black/34 px-4 font-body text-sm text-white outline-none transition placeholder:text-white/24 focus:border-emerald-200/32 focus:bg-black/44"
                onChange={(event) => setRithmicCredentials((current) => ({ ...current, password: event.target.value }))}
                placeholder="Test password"
                required
                type="password"
                value={rithmicCredentials.password}
              />
            </label>
            {rithmicAccounts.length > 0 && (
              <label className="block">
                <span className="font-body text-xs uppercase tracking-[0.18em] text-white/42">Account</span>
                <select
                  className="mt-2 h-12 w-full rounded-[16px] border border-white/10 bg-[#111] px-4 font-body text-sm text-white outline-none transition focus:border-emerald-200/32"
                  onChange={(event) => setRithmicCredentials((current) => ({ ...current, accountId: event.target.value }))}
                  value={rithmicCredentials.accountId || ""}
                >
                  {rithmicAccounts.map((account) => (
                    <option key={account.accountId} value={account.accountId}>{account.accountName || account.accountId}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="font-body text-xs uppercase tracking-[0.18em] text-white/42">History range</span>
              <select
                className="mt-2 h-12 w-full rounded-[16px] border border-white/10 bg-[#111] px-4 font-body text-sm text-white outline-none transition focus:border-emerald-200/32"
                onChange={(event) => setRithmicCredentials((current) => ({ ...current, lookbackDays: Number(event.target.value) as RithmicCredentials["lookbackDays"] }))}
                value={rithmicCredentials.lookbackDays}
              >
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>365 days</option>
              </select>
            </label>
            <GlassButton disabled={rithmicBusy} strong type="submit">
              {rithmicBusy ? "Syncing..." : "Sync history"} <ArrowUpRight className="h-4 w-4" />
            </GlassButton>
          </div>

          <div className="mt-5">
            <RithmicAttribution />
          </div>
        </form>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="source-route-ledger p-5">
          <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
            <span className={`grid h-12 w-12 place-items-center rounded-full border ${selectedFirm.status === "direct" ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200" : selectedFirm.status === "advanced" ? "border-amber-200/18 bg-amber-300/8 text-amber-100" : "border-[#18c887]/22 bg-[#18c887]/10 text-[#b9f5df]"}`}>
              {selectedFirm.status === "direct" ? <BadgeCheck className="h-5 w-5" /> : selectedFirm.status === "advanced" ? <SlidersHorizontal className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}
            </span>
            <div>
              <p className="font-body text-sm font-medium text-white/86">{selectedFirm.route}</p>
              <p className="mt-2 font-body text-sm leading-relaxed text-white/54">{selectedFirm.fit}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  { icon: LockKeyhole, label: "Account link", text: selectedFirm.id === "topstepx" ? "ProjectX validates your TopstepX API key." : "Use official firm access when it exists." },
                  { icon: BadgeCheck, label: "Read-only", text: "Cova imports history, not orders." },
                  { icon: Gauge, label: "CSV fallback", text: "Export trades when sync is not ready." },
                ].map(({ icon: Icon, label, text }) => (
                  <div className="source-security-row p-3" key={label}>
                    <Icon className="h-4 w-4 text-[#18c887]" />
                    <p className="mt-2 font-body text-xs font-medium text-white/78">{label}</p>
                    <p className="mt-1 font-body text-[11px] leading-relaxed text-white/42">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 lg:max-w-[440px] lg:justify-end">
          <GlassButton strong onClick={startFirmConnect}>
            {selectedFirm.connectLabel} <ArrowUpRight className="h-4 w-4" />
          </GlassButton>
          <GlassButton onClick={showExportGuide}>Export guide</GlassButton>
          {selectedFirm.id !== "other" && <GlassButton onClick={useCsvLane}>Use CSV export</GlassButton>}
          {!entitlements.canUseDirectSync && selectedFirm.id !== "other" && <GlassButton onClick={upgradeToPro}>Unlock sync</GlassButton>}
          {entitlements.canUseDirectSync && selectedFirm.id === "topstepx" && selectedConnected && <GlassButton onClick={syncProjectX}>{projectXSyncBusy ? "Syncing..." : "Sync trades"}</GlassButton>}
          {entitlements.canUseDirectSync && selectedFirm.id === "tradovate" && <GlassButton onClick={checkTradovateStatus}>{brokerBusy ? "Checking..." : "Check status"}</GlassButton>}
          {entitlements.canUseDirectSync && selectedFirm.id === "tradovate" && connected && <GlassButton onClick={syncTradovate}>{syncBusy ? "Syncing..." : "Sync trades"}</GlassButton>}
          {selectedConnected && connected && <GlassButton onClick={disconnectBroker}>Disconnect</GlassButton>}
        </div>
      </div>

      <p className="mt-5 font-body text-xs leading-relaxed text-white/45">
        {brokerNotice || brokerStatus?.message || `Last checked: ${updated}. Pick a firm above. If direct sync is not live yet, upload the same trade export you would send to a journal.`}
      </p>
    </div>
  );
}

