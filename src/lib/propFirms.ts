export type PropFirmId = "topstepx" | "apex" | "myfundedfutures" | "tradeify" | "rithmic" | "tradovate" | "other";

export const propFirmOptions: {
  id: PropFirmId;
  name: string;
  badge: string;
  route: string;
  platforms: string;
  status: "direct" | "guided" | "advanced";
  summary: string;
  fit: string;
  connectLabel: string;
  connectNotice: string;
}[] = [
  {
    id: "topstepx",
    name: "TopstepX",
    badge: "CSV-first beta",
    route: "Beta connector + CSV",
    platforms: "TopstepX account",
    status: "direct",
    summary: "Start with a CSV export today. If you want to test the ProjectX path, paste the API key from TopstepX settings and Cova validates trade-history access read-only.",
    fit: "CSV is the safest default while the TopstepX connector stays beta. No broker password, no order access — imported history feeds the dashboard, limits, insights, and Risk Passport.",
    connectLabel: "Try TopstepX beta",
    connectNotice: "TopstepX beta connector: paste your username and API key below, or use CSV first if you just want the review flow.",
  },
  {
    id: "apex",
    name: "Apex",
    badge: "Firm account",
    route: "Guided import",
    platforms: "Apex dashboard / trading platform",
    status: "guided",
    summary: "Choose Apex if that is where your challenge or funded account lives. Cova helps turn that history into plain risk notes.",
    fit: "Direct account sign-in will connect when an official path is available; CSV exports work today.",
    connectLabel: "Show Apex export steps",
    connectNotice: "Apex direct sync is not live yet. Use the Apex export guide below and Cova will review the account today.",
  },
  {
    id: "myfundedfutures",
    name: "MFFU",
    badge: "Firm account",
    route: "Guided import",
    platforms: "MyFundedFutures dashboard",
    status: "guided",
    summary: "Use this when your account is with MyFundedFutures. Cova turns the account history into a simple review you can act on.",
    fit: "Connect your account when firm sign-in is available; use a platform export in the meantime.",
    connectLabel: "Show MFFU export steps",
    connectNotice: "MyFundedFutures direct sync is not live yet. Upload your account export below and Cova will clean it up.",
  },
  {
    id: "tradeify",
    name: "Tradeify",
    badge: "Firm account",
    route: "Guided import",
    platforms: "Tradeify dashboard",
    status: "guided",
    summary: "Use this if Tradeify is where you track your challenge or funded account. Cova focuses on the behavior behind the trades.",
    fit: "Direct sign-in is planned; CSV or platform exports work while we build it.",
    connectLabel: "Show Tradeify export steps",
    connectNotice: "Tradeify direct sync is not live yet. Upload a Tradeify or platform export below to review the account.",
  },
  {
    id: "rithmic",
    name: "Rithmic",
    badge: "Platform account",
    route: "Connect platform",
    platforms: "Rithmic / R|Trader",
    status: "advanced",
    summary: "Choose Rithmic if your prop firm routes trades through Rithmic or R|Trader Pro.",
    fit: "Cova will support platform-level import so multiple prop firms can use the same review workflow.",
    connectLabel: "Show Rithmic export steps",
    connectNotice: "Rithmic direct sync is planned. Upload a Rithmic export below for now and Cova will still build your review.",
  },
  {
    id: "tradovate",
    name: "Tradovate",
    badge: "API gated",
    route: "Connect platform",
    platforms: "Tradovate account",
    status: "advanced",
    summary: "Choose Tradovate if your firm account trades through Tradovate and you already have API access.",
    fit: "Tradovate direct sync can work for eligible accounts; otherwise use a CSV export.",
    connectLabel: "Sign in with Tradovate",
    connectNotice: "Tradovate connect is ready for eligible API accounts. If your account is not approved for API access, upload an export below.",
  },
  {
    id: "other",
    name: "Other firm",
    badge: "Any prop firm",
    route: "Upload export",
    platforms: "Any futures prop dashboard",
    status: "guided",
    summary: "If your firm is not listed, upload the trade export and Cova will still build the review.",
    fit: "The file does not have to be perfect. Cova checks the rows before adding them to your risk dashboard.",
    connectLabel: "Upload firm export",
    connectNotice: "Choose your prop-firm export below and Cova will normalize the trade history.",
  },
];

export const csvExportGuides: {
  id: PropFirmId;
  title: string;
  source: string;
  steps: string[];
  tip: string;
}[] = [
  {
    id: "topstepx",
    title: "TopstepX export",
    source: "TopstepX dashboard",
    steps: [
      "Open your TopstepX dashboard.",
      "Look for performance, trades, orders, or account history.",
      "Download the trade file as CSV when that option appears.",
      "Upload it here. Cova checks the rows before saving them.",
    ],
    tip: "If the exact label is different, choose the export that includes fills, closed trades, P&L, and timestamps.",
  },
  {
    id: "apex",
    title: "Apex export",
    source: "Apex dashboard or linked platform",
    steps: [
      "Open your Apex account area.",
      "Find the platform tied to the account, usually Rithmic, Tradovate, or WealthCharts.",
      "Export filled orders, trade history, or performance as CSV.",
      "Upload the file and Cova will map the columns for review.",
    ],
    tip: "Apex accounts can sit on different trading rails, so the cleanest export may come from the platform you selected at purchase.",
  },
  {
    id: "myfundedfutures",
    title: "MFFU export",
    source: "MyFundedFutures dashboard",
    steps: [
      "Open your MyFundedFutures dashboard.",
      "Go to the account, performance, or trading history area.",
      "Download trades, fills, or statements as CSV.",
      "Upload the export. Cova turns it into a readable risk review.",
    ],
    tip: "Start with the file that shows closed trades and realized P&L. That gives Cova the strongest review signal.",
  },
  {
    id: "tradeify",
    title: "Tradeify export",
    source: "Tradeify dashboard",
    steps: [
      "Open your Tradeify account dashboard.",
      "Find trade history, account history, or platform reports.",
      "Export filled orders or closed trades as CSV.",
      "Upload the file and check the quick preview before importing.",
    ],
    tip: "If you trade through Rithmic or Tradovate, the platform export may be cleaner than the firm dashboard export.",
  },
  {
    id: "rithmic",
    title: "Rithmic export",
    source: "R|Trader Pro or Rithmic reports",
    steps: [
      "Open your Rithmic report area.",
      "Choose fills, order history, or trade performance.",
      "Save the report as CSV.",
      "Upload it here. Cova will flag missing fields before import.",
    ],
    tip: "Rithmic files can be detailed. If the first file does not parse cleanly, export fills or closed trades instead of account summary.",
  },
  {
    id: "tradovate",
    title: "Tradovate export",
    source: "Tradovate reports",
    steps: [
      "Open Tradovate and go to reports or account performance.",
      "Choose fills, orders, or closed trade history.",
      "Export the report as CSV.",
      "Upload it here if direct API access is not available.",
    ],
    tip: "Tradovate API access can be gated. CSV keeps the review workflow usable while secure sync is unavailable.",
  },
  {
    id: "other",
    title: "Any prop firm export",
    source: "Your firm dashboard",
    steps: [
      "Open the dashboard where your funded account is tracked.",
      "Search for trades, orders, fills, statements, or performance.",
      "Download the most detailed CSV available.",
      "Upload it here and Cova will tell you what is missing.",
    ],
    tip: "The best file includes date, market, side, quantity, entry, exit, P&L, and account name if available.",
  },
];

export function getFirmConnectEnv(firmId: PropFirmId) {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  const urls: Partial<Record<PropFirmId, string | undefined>> = {
    topstepx: env.VITE_TOPSTEPX_CONNECT_URL,
    apex: env.VITE_APEX_CONNECT_URL,
    myfundedfutures: env.VITE_MFFU_CONNECT_URL,
    tradeify: env.VITE_TRADEIFY_CONNECT_URL,
    rithmic: env.VITE_RITHMIC_CONNECT_URL,
    tradovate: env.VITE_TRADOVATE_CONNECT_URL,
  };
  return urls[firmId];
}

export function getFirmProviderHost(firmId: PropFirmId) {
  const configuredUrl = getFirmConnectEnv(firmId);
  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl, window.location.origin);
      return url.hostname.replace(/^www\./, "");
    } catch {
      // Fall back to the plain provider label below.
    }
  }

  const providerHosts: Record<PropFirmId, string> = {
    topstepx: "TopstepX",
    apex: "Apex",
    myfundedfutures: "MyFundedFutures",
    tradeify: "Tradeify",
    rithmic: "Rithmic",
    tradovate: "Tradovate",
    other: "your provider",
  };

  return providerHosts[firmId];
}

export function buildFirmConnectUrl(firmId: PropFirmId) {
  const configuredUrl = getFirmConnectEnv(firmId);
  const target = new URL(configuredUrl || "/api/connectors/start", window.location.origin);
  target.searchParams.set("firm", firmId);
  target.searchParams.set("returnUrl", `${window.location.pathname}${window.location.search}#import`);
  return target.toString();
}

export function canRedirectToFirmProvider(firmId: PropFirmId) {
  if (firmId === "other") {
    return false;
  }
  const configuredUrl = getFirmConnectEnv(firmId);
  return Boolean(configuredUrl && (/^https?:\/\//.test(configuredUrl) || configuredUrl.startsWith("/")));
}

export function getPropFirm(firmId: PropFirmId | null | undefined) {
  return propFirmOptions.find((item) => item.id === firmId) ?? propFirmOptions[0];
}

