import { motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { ArrowUpRight, ChevronDown, CircleDot, ClipboardCheck, FileUp, SlidersHorizontal, Upload } from "lucide-react";
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
type RithmicCredentials = {
  username: string;
  password: CredentialText;
  accountKey?: string;
  lookbackDays: 30 | 90 | 180;
};
type RithmicSyncResult = {
  selectionRequired?: boolean;
  accounts?: { accountKey?: string; accountId?: string; accountName?: string }[];
};

const providerStatus: Record<PropFirmId, string> = {
  topstepx: "CSV",
  apex: "CSV",
  myfundedfutures: "CSV",
  tradeify: "CSV",
  rithmic: "Test",
  tradovate: "API",
  other: "CSV",
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
  disconnectBroker,
  entitlements,
  openFirmOAuth,
  rithmicAvailable,
  rithmicBusy,
  rithmicStatusChecked,
  tradovateAvailable,
  tradovateStatusChecked,
  selectedFirmId,
  setBrokerNotice,
  setSelectedFirmId,
  startTradovateConnect,
  syncBusy,
  syncRithmic,
  syncTradovate,
  upgradeToPro,
}: {
  brokerBusy: boolean;
  brokerNotice: string;
  brokerStatus: BrokerStatus | null;
  canRedirectToTradovate: () => boolean;
  checkTradovateStatus: () => void;
  disconnectBroker: () => Promise<void> | void;
  entitlements: ImportEntitlements;
  openFirmOAuth: (firm: PropFirmId) => void;
  rithmicAvailable: boolean;
  rithmicBusy: boolean;
  rithmicStatusChecked: boolean;
  tradovateAvailable: boolean;
  tradovateStatusChecked: boolean;
  selectedFirmId: PropFirmId;
  setBrokerNotice: (notice: string) => void;
  setSelectedFirmId: (firm: PropFirmId) => void;
  startTradovateConnect: () => void;
  syncBusy: boolean;
  syncRithmic: (credentials: RithmicCredentials) => Promise<RithmicSyncResult | void> | RithmicSyncResult | void;
  syncTradovate: () => void;
  upgradeToPro: () => void;
}) {
  const connected = Boolean(brokerStatus?.connected);
  const selectedFirm = propFirmOptions.find((firm) => firm.id === selectedFirmId) ?? propFirmOptions[0];
  const selectedConnected = connected
    && brokerStatus?.provider === selectedFirm.name
    && (selectedFirm.id !== "tradovate" || tradovateAvailable);
  const tradovateUnavailable = selectedFirm.id === "tradovate"
    && entitlements.canUseDirectSync
    && tradovateStatusChecked && !tradovateAvailable;
  const [rithmicCredentials, setRithmicCredentials] = useState<RithmicCredentials>({ username: "", password: "", lookbackDays: 90 });
  const [rithmicAccounts, setRithmicAccounts] = useState<{ accountKey?: string; accountId?: string; accountName?: string }[]>([]);

  function selectFirm(firm: (typeof propFirmOptions)[number]) {
    setSelectedFirmId(firm.id);
    setBrokerNotice("");
  }

  function startFirmConnect() {
    const firm = selectedFirm;
    setBrokerNotice("");
    if (firm.id === "other") {
      document.querySelector("[data-csv-import]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setBrokerNotice(`${firm.name}: upload your trade export below and Cova will normalize it for review.`);
      return;
    }

    if (firm.status === "guided") {
      document.querySelector("[data-export-guide]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setBrokerNotice(firm.connectNotice);
      return;
    }

    if (!entitlements.canUseDirectSync) {
      setBrokerNotice(`${firm.name}: direct account sync is a Pro feature. Use the CSV export path on Free.`);
      return;
    }

    if (firm.id === "rithmic") {
      document.querySelector("[data-rithmic-connect], [data-rithmic-unavailable]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (rithmicStatusChecked && !rithmicAvailable) {
        setBrokerNotice("Rithmic Test is unavailable here. Use CSV instead.");
      }
      return;
    }

    if (firm.id === "tradovate" && (!tradovateStatusChecked || !tradovateAvailable)) {
      document.querySelector("[data-tradovate-unavailable]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setBrokerNotice(tradovateStatusChecked
        ? "Tradovate direct sync is not configured here. CSV import remains available."
        : "Cova is checking Tradovate connector availability. CSV import remains available.");
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
    setBrokerNotice(`${selectedFirm.name}: upload your trade export below. CSV is the supported path unless Cova explicitly shows an active connector.`);
  }

  function showExportGuide() {
    document.querySelector("[data-export-guide]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setBrokerNotice(`${selectedFirm.name}: use the export guide below to find the cleanest trade file for Cova.`);
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
        setRithmicCredentials((current) => ({ ...current, accountKey: result.accounts?.[0]?.accountKey }));
      }
    } finally {
      setRithmicCredentials((current) => ({ ...current, username: "", password: "" }));
    }
  }

  return (
    <div className="broker-connect-panel source-ledger-panel p-5 md:p-6">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between" data-csv-primary>
        <div>
          <h3 className="font-body text-3xl font-semibold leading-none tracking-[-0.045em] text-white md:text-4xl">Choose a source.</h3>
          <p className="mt-3 font-body text-sm text-white/56">Connect an account or upload a trade file.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-white/10 bg-white/[0.025] px-3 py-1.5 font-body text-xs text-white/52">Read-only · no orders</span>
          <GlassButton onClick={useCsvLane}>Upload CSV first</GlassButton>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4" data-provider-picker>
        {propFirmOptions.map((firm) => {
          const active = firm.id === selectedFirm.id;
          return (
            <motion.button
              aria-pressed={active}
              className={`provider-choice-button flex min-h-20 items-center justify-between border px-4 py-3 text-left transition ${active ? "is-active border-[#18c887]/54 bg-[#18c887]/10" : "border-white/10 bg-black/22 hover:border-white/22 hover:bg-white/[0.035]"}`}
              data-firm-id={firm.id}
              key={firm.id}
              onClick={() => selectFirm(firm)}
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <span>
                <span className="block font-body text-sm font-medium text-white md:text-base">{firm.name}</span>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/44">
                  {firm.id === "tradovate" && tradovateStatusChecked && !tradovateAvailable ? "CSV" : providerStatus[firm.id]}
                </span>
              </span>
              <span className={`ml-3 inline-flex shrink-0 items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] ${active ? "text-[#b9f5df]" : "text-white/34"}`}>
                {active && <CircleDot className="h-3.5 w-3.5" />}
                {active ? "Selected" : "Select"}
              </span>
            </motion.button>
          );
        })}
      </div>

      {selectedFirm.id === "rithmic" && entitlements.canUseDirectSync && (!rithmicStatusChecked || !rithmicAvailable) && (
        <div className="mt-6 rounded-[24px] border border-white/12 bg-white/[0.025] p-5" data-rithmic-unavailable>
          <p className="font-body text-xs uppercase tracking-[0.2em] text-amber-100/80">Private Test connector</p>
          <h4 className="mt-3 font-body text-xl font-semibold text-white">{rithmicStatusChecked ? "Private sync unavailable." : "Checking connector availability..."}</h4>
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
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-amber-200/18 bg-amber-300/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-100">Rithmic Test</span>
              <span className="rounded-full border border-emerald-200/16 bg-emerald-300/8 px-3 py-1.5 font-body text-xs text-[#b9f5df]">Read-only</span>
            </div>
            <h4 className="mt-4 font-body text-2xl font-semibold tracking-[-0.03em] text-white">Import Rithmic history.</h4>
            <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-white/56">
              One-time login. Credentials are discarded by Cova when it finishes. No order access. P&amp;L is gross before commissions.
            </p>
          </div>

          <div className={`mt-5 grid gap-3 md:items-end ${rithmicAccounts.length > 0 ? "md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_180px_auto]" : "md:grid-cols-[1fr_1fr_180px_auto]"}`}>
            <label className="block">
              <span className="font-body text-xs uppercase tracking-[0.18em] text-white/42">Username</span>
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
                  onChange={(event) => setRithmicCredentials((current) => ({ ...current, accountKey: event.target.value }))}
                  value={rithmicCredentials.accountKey || ""}
                >
                  {rithmicAccounts.map((account) => (
                    <option key={account.accountKey} value={account.accountKey}>{account.accountName || account.accountId}</option>
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

      {selectedFirm.id === "tradovate" && entitlements.canUseDirectSync && (!tradovateStatusChecked || !tradovateAvailable) && (
        <div className="mt-6 rounded-[24px] border border-white/12 bg-white/[0.025] p-5" data-tradovate-unavailable>
          <p className="font-body text-xs uppercase tracking-[0.2em] text-amber-100/80">Direct connector</p>
          <h4 className="mt-3 font-body text-xl font-semibold text-white">{tradovateStatusChecked ? "Tradovate sync unavailable." : "Checking connector availability..."}</h4>
          <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-white/58">
            {tradovateStatusChecked ? "Cova does not offer the connection flow until the complete read-only server path is configured. CSV import remains available below." : "Cova is verifying the complete read-only server path before offering the connection flow. CSV import remains available below."}
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 lg:flex-row lg:items-center lg:justify-between" data-broker-lifecycle>
        <div>
          <p className="font-body text-sm font-medium text-white/82">{selectedFirm.name}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/42">
            {selectedConnected ? "Connected" : providerStatus[selectedFirm.id]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <GlassButton strong onClick={tradovateUnavailable ? useCsvLane : startFirmConnect}>
            {tradovateUnavailable ? "Use CSV" : selectedFirm.connectLabel} <ArrowUpRight className="h-4 w-4" />
          </GlassButton>
          {selectedFirm.id !== "other" && <GlassButton onClick={showExportGuide}>Export CSV</GlassButton>}
          {!entitlements.canUseDirectSync && selectedFirm.status !== "guided" && selectedFirm.id !== "other" && <GlassButton onClick={upgradeToPro}>Unlock sync</GlassButton>}
          {entitlements.canUseDirectSync && selectedFirm.id === "tradovate" && tradovateAvailable && (
            <GlassButton onClick={checkTradovateStatus}>{brokerBusy ? "Checking..." : "Check status"}</GlassButton>
          )}
          {entitlements.canUseDirectSync && selectedFirm.id === "tradovate" && selectedConnected && (
            <GlassButton onClick={syncTradovate}>{syncBusy ? "Syncing..." : "Sync trades"}</GlassButton>
          )}
          {selectedConnected && <GlassButton onClick={disconnectBroker}>Disconnect</GlassButton>}
        </div>
      </div>

      {brokerNotice && (
        <p className="mt-5 border-l-2 border-[#18c887]/50 bg-[#18c887]/8 px-4 py-3 font-body text-sm text-white/68" role="status">
          {brokerNotice}
        </p>
      )}
    </div>
  );
}

