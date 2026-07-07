import { AnimatePresence, motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { Glass, type GlassOptics } from "@samasante/liquid-glass";
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileUp,
  FileText,
  Fingerprint,
  Gauge,
  LockKeyhole,
  Mail,
  Menu,
  Play,
  Repeat2,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { lazy, Suspense, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  analyze,
  defaultRules,
  formatMoney,
  formatPercent,
  parseCsv,
  parseCsvDetailed,
  RiskRule,
  sampleTrades,
  Trade,
} from "./lib/risk";
import { getSupabaseClient, getSupabaseUserPlan, isSupabaseConfigured, sendSupabaseMagicLink } from "./lib/supabaseClient";

const STORAGE_KEY = "cova-react-risk-os-v2";
const AUTH_SESSION_KEY = "cova-auth-session-v1";
const AUTH_INTENT_KEY = "cova-auth-intent-v1";
const BROKER_STATUS_KEY = "cova-tradovate-status-v1";
const OAUTH_FIRM_KEY = "cova-oauth-firm-v1";
const DASHBOARD_FOCUS_KEY = "cova-dashboard-focus-v1";
const DASHBOARD_RANGE_KEY = "cova-dashboard-range-v1";
const DEV_PREVIEW_EMAIL = "dev@cova.local";
const sections = ["overview", "features", "pricing", "resources", "community", "dashboard", "import", "oauth", "rules", "coach", "passport"] as const;
const protectedSections = ["dashboard", "import", "oauth", "rules", "coach", "passport"] as const satisfies readonly Section[];
type Section = (typeof sections)[number];
type AuthMode = "login" | "signup";
type DashboardFocus = "health" | "risk" | "performance" | "proof";
type ImportMode = "append" | "replace";
type TimeRange = "today" | "week" | "all";
type ToastTone = "info" | "success" | "warning";
type ToastState = { message: string; tone?: ToastTone } | null;
type PropFirmId = "topstepx" | "apex" | "myfundedfutures" | "tradeify" | "rithmic" | "tradovate" | "other";
type PlanTier = "free" | "pro";
type Entitlements = {
  canEditAdvancedLimits: boolean;
  canExportPassport: boolean;
  canUseDirectSync: boolean;
  insightLimit: number;
  maxActivePassports: number;
  maxStoredTrades: number;
  maxTradesPerImport: number;
  plan: PlanTier;
};
type AuthSession = {
  email: string;
  mode: AuthMode;
  plan: PlanTier;
  signedInAt: string;
  source: "local-preview" | "hosted" | "supabase";
  subscriptionStatus?: "active" | "preview" | "none";
  userId?: string;
};
type BrokerStatus = {
  provider: string;
  status: "connected" | "token-received-needs-storage" | "needs-storage" | "missing-env" | "token-error" | "state-mismatch" | "error" | "not-connected" | "api-unavailable";
  connected: boolean;
  connectionId?: string;
  message: string;
  updatedAt: string;
};
type ProjectXCredentials = {
  userName: string;
  apiKey: string;
};

const appNav = [
  { id: "dashboard", label: "Dashboard" },
  { id: "import", label: "Link account" },
  { id: "rules", label: "Limits" },
  { id: "coach", label: "Insights" },
  { id: "passport", label: "Passport" },
] satisfies { id: Section; label: string }[];

const marketingNav = [
  { label: "Product", action: "overview" },
  { label: "Features", action: "features" },
  { label: "Pricing", action: "pricing" },
  { label: "Resources", action: "resources" },
  { label: "Community", action: "community", hasChevron: true },
] satisfies { action: Section; hasChevron?: boolean; label: string }[];

const START_CTA_OPTICS: Partial<GlassOptics> = {
  mapSize: 256,
  clipToShape: true,
  softEdge: true,
  strength: 0.12,
  depth: 0.2,
  curvature: 0.55,
  bend: 0.25,
  bendWidth: 0.08,
  dispersion: 0.1,
  specular: 1,
  sheenAngle: 50,
  glow: 0.1,
  glowSpread: 1,
  glowFalloff: 1.5,
  sheen: 0.95,
  sheenWidth: 2,
  sheenFalloff: 1.5,
  frost: 3,
  brightness: 0,
};

const TradeProofThreeStory = lazy(() => import("./components/TradeProofThreeStory"));

const planOptions = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceNote: "limited account",
    badge: "Limited",
    description: "For trying Cova with a small sample before you commit to a real review workflow.",
    included: [
      "1 limited workspace",
      "Up to 25 trades per import",
      "1 active Risk Passport",
      "Basic dashboard view",
      "Starter risk limits only",
    ],
    notIncluded: [
      "No saved import history",
      "No unlimited Passport links",
      "No export library",
      "No saved insight history",
      "No saved member sync",
    ],
  },
  {
    id: "pro",
    name: "Cova Pro",
    price: "$29/mo",
    priceNote: "founding price",
    badge: "Active trader",
    description: "For funded traders who want history, cleaner reviews, and stronger proof of discipline.",
    included: [
      "Unlimited trade imports",
      "Saved CSV and review history",
      "Unlimited Risk Passports",
      "Full editable risk limits",
      "Plain-English insight notes",
      "Export tools and member access",
    ],
    notIncluded: [
      "No trade signals",
      "No auto-trading",
      "No brokerage order execution",
      "No payout guarantee",
      "No financial advice",
    ],
  },
] as const;

const planEntitlements: Record<PlanTier, Entitlements> = {
  free: {
    canEditAdvancedLimits: false,
    canExportPassport: false,
    canUseDirectSync: false,
    insightLimit: 2,
    maxActivePassports: 1,
    maxStoredTrades: 25,
    maxTradesPerImport: 25,
    plan: "free",
  },
  pro: {
    canEditAdvancedLimits: true,
    canExportPassport: true,
    canUseDirectSync: true,
    insightLimit: Number.POSITIVE_INFINITY,
    maxActivePassports: Number.POSITIVE_INFINITY,
    maxStoredTrades: Number.POSITIVE_INFINITY,
    maxTradesPerImport: Number.POSITIVE_INFINITY,
    plan: "pro",
  },
};

const propFirmOptions: {
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
    badge: "Real connector",
    route: "API key link",
    platforms: "TopstepX account",
    status: "direct",
    summary: "Connect with the API key from your TopstepX settings. Cova validates it with ProjectX and imports trade history read-only.",
    fit: "Best first connector. No broker password, no order access. Cova pulls history into your dashboard, limit checks, insights, and Risk Passport.",
    connectLabel: "Connect TopstepX",
    connectNotice: "Enter your TopstepX username and API key below. Cova validates it through ProjectX and stores only an encrypted read-only session token.",
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

const csvExportGuides: {
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

export default function App() {
  const [section, setSection] = useHashSection();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => loadAuthSession());
  const [oauthFirmId, setOauthFirmId] = useState<PropFirmId>(() => readOAuthFirmId() ?? "topstepx");
  const [toast, setToast] = useState<ToastState>(null);
  const [status, setStatus] = useState("Trade history ready.");
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatus | null>(() => readBrokerStatus());
  const [trades, setTrades] = useState<Trade[]>(() => loadAuthSession() ? loadState()?.trades ?? sampleTrades : []);
  const [rules, setRules] = useState<RiskRule[]>(() => loadAuthSession() ? loadState()?.rules ?? defaultRules : defaultRules);
  const isSignedIn = Boolean(authSession);
  const entitlements = planEntitlements[authSession?.plan ?? "free"];
  const analysis = useMemo(() => analyze(trades, rules), [trades, rules]);

  useEffect(() => {
    if (isSignedIn) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ trades, rules }));
    }
  }, [isSignedIn, trades, rules]);

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
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    let mounted = true;
    client.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!mounted || !user?.email) {
        return;
      }
      completeAuth(user.email, "login", "supabase", normalizePlan(getSupabaseUserPlan(user)), user.id);
    }).catch(() => undefined);

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (!user?.email) {
        return;
      }
      completeAuth(user.email, "login", "supabase", normalizePlan(getSupabaseUserPlan(user)), user.id);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get("covaAuthStatus") || params.get("authStatus");
    if (authStatus !== "authenticated" && authStatus !== "signed-in") {
      return;
    }

    const intent = readAuthIntent();
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash || "#dashboard"}`);
    completeAuth(intent?.email ?? "", intent?.mode ?? "login", "hosted", "free");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const broker = params.get("broker");
    const brokerStatus = params.get("brokerStatus");

    if (broker !== "tradovate" || !brokerStatus) {
      return;
    }

    const connected = brokerStatus === "connected";
    const nextStatus: BrokerStatus = {
      provider: "Tradovate",
      status: brokerStatus as BrokerStatus["status"],
      connected,
      connectionId: params.get("connectionId") ?? undefined,
      message: connected
        ? "Tradovate connected. Trade syncing can now run from the secure backend."
        : brokerMessageForStatus(brokerStatus),
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(BROKER_STATUS_KEY, JSON.stringify(nextStatus));
    window.dispatchEvent(new CustomEvent("cova:broker-status"));
    setStatus(nextStatus.message);
    announce(nextStatus.message, connected ? "success" : "warning");
    window.history.replaceState(null, "", `${window.location.pathname}#import`);
    setSection("import");
  }, []);

  useEffect(() => {
    const selector = ".liquid-glass, .liquid-glass-strong";
    const clamp = (value: number) => Math.max(0, Math.min(100, value));
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (coarsePointer) {
      return;
    }

    let activeGlassSurface: HTMLElement | null = null;
    let pendingGlassPointer: { clientX: number; clientY: number; surface: HTMLElement } | null = null;
    let glassFrame: number | null = null;
    let lastGlassUpdate = 0;

    function applyGlassLight() {
      glassFrame = null;
      if (!pendingGlassPointer) {
        return;
      }
      const surface = pendingGlassPointer.surface;
      const rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      const x = clamp(((pendingGlassPointer.clientX - rect.left) / rect.width) * 100);
      const y = clamp(((pendingGlassPointer.clientY - rect.top) / rect.height) * 100);
      surface.style.setProperty("--glass-x", `${x.toFixed(1)}%`);
      surface.style.setProperty("--glass-y", `${y.toFixed(1)}%`);
    }

    function findGlassSurface(target: EventTarget | null) {
      return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
    }

    function trackGlassSurface(event: PointerEvent) {
      activeGlassSurface = findGlassSurface(event.target);
    }

    function updateGlassLight(event: PointerEvent) {
      if (!activeGlassSurface) {
        return;
      }
      if (event.timeStamp - lastGlassUpdate < 34) {
        return;
      }
      lastGlassUpdate = event.timeStamp;
      pendingGlassPointer = { clientX: event.clientX, clientY: event.clientY, surface: activeGlassSurface };
      if (glassFrame === null) {
        glassFrame = window.requestAnimationFrame(applyGlassLight);
      }
    }

    function clearGlassLight(event: PointerEvent) {
      if (!activeGlassSurface) {
        return;
      }
      if (event.relatedTarget instanceof Node && activeGlassSurface.contains(event.relatedTarget)) {
        return;
      }
      activeGlassSurface.style.removeProperty("--glass-x");
      activeGlassSurface.style.removeProperty("--glass-y");
      activeGlassSurface = null;
      pendingGlassPointer = null;
    }

    window.addEventListener("pointerover", trackGlassSurface, { passive: true });
    window.addEventListener("pointermove", updateGlassLight, { passive: true });
    window.addEventListener("pointerout", clearGlassLight, { passive: true });
    return () => {
      if (glassFrame !== null) {
        window.cancelAnimationFrame(glassFrame);
      }
      window.removeEventListener("pointerover", trackGlassSurface);
      window.removeEventListener("pointermove", updateGlassLight);
      window.removeEventListener("pointerout", clearGlassLight);
    };
  }, []);

  function go(next: Section) {
    setMobileOpen(false);
    setSection(next);
  }

  function completeAuth(email: string, mode: AuthMode, source: AuthSession["source"] = "local-preview", planOverride?: PlanTier, userId?: string) {
    const savedSession = loadAuthSession();
    const authIntent = readAuthIntent();
    const emailAddress = email.trim() || "preview@cova.local";
    const plan = planOverride ?? savedSession?.plan ?? "free";
    const session: AuthSession = {
      email: emailAddress,
      mode,
      plan,
      source,
      signedInAt: new Date().toISOString(),
      subscriptionStatus: plan === "pro" ? "active" : "none",
      userId,
    };
    const saved = loadState();
    setAuthSession(session);
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    localStorage.removeItem(AUTH_INTENT_KEY);
    setTrades(saved?.trades?.length ? saved.trades : sampleTrades);
    setRules(saved?.rules ?? defaultRules);
    setStatus("Signed in. Account stats are unlocked.");
    setAuthMode(null);
    announce("Signed in. Account stats are unlocked.", "success");
    const returnSection = authIntent?.returnSection;
    if (returnSection && isProtectedSection(returnSection)) {
      setSection(returnSection);
    } else if (isProtectedSection(section)) {
      setSection(section);
    } else {
      setSection("dashboard");
    }
  }

  function signOut() {
    const client = getSupabaseClient();
    void client?.auth.signOut().catch(() => undefined);
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(BROKER_STATUS_KEY);
    localStorage.removeItem(OAUTH_FIRM_KEY);
    const logoutUrl = getHostedLogoutUrl();
    if (logoutUrl) {
      void fetch(logoutUrl, { method: "POST", credentials: "include" }).catch(() => undefined);
    }
    setAuthSession(null);
    setBrokerStatus(null);
    setAuthMode(null);
    setMobileOpen(false);
    setTrades([]);
    setRules(defaultRules);
    setStatus("Signed out. Account stats are hidden.");
    announce("Signed out. Account stats are hidden.", "info");
    if (isProtectedSection(section)) {
      setSection("overview");
    }
  }

  function signInAsDevPreview() {
    if (!isLocalPreview()) {
      setAuthMode("login");
      return;
    }
    completeAuth(DEV_PREVIEW_EMAIL, "login", "local-preview", "pro");
  }

  function upgradeToPro() {
    if (!authSession) {
      setAuthMode("signup");
      announce("Create a free account first, then choose Pro.", "info");
      return;
    }

    const checkoutUrl = getProCheckoutUrl();
    if (checkoutUrl) {
      window.location.assign(checkoutUrl);
      return;
    }

    if (isLocalPreview()) {
      const nextSession: AuthSession = {
        ...authSession,
        plan: "pro",
        subscriptionStatus: "preview",
      };
      setAuthSession(nextSession);
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(nextSession));
      announce("Pro preview unlocked locally.", "success");
      return;
    }

    announce("Pro checkout is not configured yet. Keep using the free preview for now.", "warning");
  }

  function openFirmOAuth(firmId: PropFirmId) {
    const firm = getPropFirm(firmId);
    setOauthFirmId(firm.id);
    localStorage.setItem(OAUTH_FIRM_KEY, firm.id);
    setStatus(`Opening ${firm.name} read-only sign-in.`);
    announce(`Opening ${firm.name} read-only sign-in.`, "info");
    go("oauth");
  }

  function completeFirmOAuth(firmId: PropFirmId) {
    const firm = getPropFirm(firmId);
    const nextStatus: BrokerStatus = {
      provider: firm.name,
      status: "connected",
      connected: true,
      connectionId: `dev-${firm.id}-${Date.now()}`,
      message: `${firm.name} linked in read-only preview. Dashboard is now showing the account source Cova will review.`,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(BROKER_STATUS_KEY, JSON.stringify(nextStatus));
    setBrokerStatus(nextStatus);
    window.dispatchEvent(new CustomEvent("cova:broker-status"));
    setStatus(nextStatus.message);
    announce(`${firm.name} connected read-only.`, "success");
    go("dashboard");
  }

  function cancelFirmOAuth() {
    announce("Connection cancelled. You can still upload a trade export.", "info");
    go("import");
  }

  function announce(message: string, tone: ToastTone = "info") {
    setToast({ message, tone });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 2800);
  }

  function importCsv(text: string, mode: ImportMode = "append") {
    if (!isSignedIn) {
      setAuthMode("login");
      announce("Sign in before importing trades.", "warning");
      return;
    }
    const imported = parseCsv(text);
    if (!imported.length) {
      setStatus("No valid trade rows found.");
      announce("No valid trade rows found.", "warning");
      return;
    }
    const existingCount = mode === "append" ? trades.length : 0;
    const slots = Number.isFinite(entitlements.maxStoredTrades) ? Math.max(0, entitlements.maxStoredTrades - existingCount) : imported.length;
    const importLimit = Number.isFinite(entitlements.maxTradesPerImport) ? entitlements.maxTradesPerImport : imported.length;
    const allowedCount = Math.min(imported.length, slots, importLimit);

    if (allowedCount <= 0) {
      announce(`Free accounts hold ${entitlements.maxStoredTrades} trades. Upgrade to keep adding history.`, "warning");
      setStatus("Free trade limit reached.");
      return;
    }

    const acceptedTrades = imported.slice(0, allowedCount);
    setTrades((current) => mode === "replace" ? acceptedTrades : [...current, ...acceptedTrades]);

    const limited = acceptedTrades.length < imported.length;
    setStatus(`${mode === "replace" ? "Replaced trade history with" : "Imported"} ${acceptedTrades.length} trade${acceptedTrades.length === 1 ? "" : "s"}${limited ? " for the free preview" : ""}.`);
    announce(limited ? `Free preview imported ${acceptedTrades.length}/${imported.length} rows.` : `${mode === "replace" ? "Trade history replaced" : "Trades imported"}: ${acceptedTrades.length} row${acceptedTrades.length === 1 ? "" : "s"}.`, limited ? "warning" : "success");
    go("dashboard");
  }

  function sharePassport() {
    if (!isSignedIn) {
      setAuthMode("login");
      announce("Sign in before viewing or sharing a Risk Passport.", "warning");
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}#passport`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setStatus("Risk Passport link copied.");
        announce("Risk Passport link copied.", "success");
      },
      () => {
        setStatus("Risk Passport link ready in the address bar.");
        announce("Risk Passport link ready in the address bar.", "info");
      },
    );
    go("passport");
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.055),transparent_30%),linear-gradient(180deg,#000,rgba(1,9,6,0.94))]" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-grid opacity-70" />

      <Navbar
        section={section}
        go={go}
        openAuth={setAuthMode}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        authSession={authSession}
        riskScore={analysis.score}
        signOut={signOut}
      />
      <AuthSheet mode={authMode} setMode={setAuthMode} close={() => setAuthMode(null)} onAuthenticated={completeAuth} onDevPreview={signInAsDevPreview} />
      <Toast toast={toast} />

      <main className="relative z-10">
        <AnimatePresence mode="wait">
          {section === "overview" && (
            <RouteFrame key="overview">
              <Hero go={go} openAuth={setAuthMode} isSignedIn={isSignedIn} />
              <StoryStrip />
              <PlanStrip currentPlan={authSession?.plan ?? null} go={go} openAuth={setAuthMode} upgradeToPro={upgradeToPro} />
              <CtaFooter openAuth={setAuthMode} sharePassport={sharePassport} />
            </RouteFrame>
          )}
          {section === "features" && (
            <RouteFrame key="features">
              <FeaturesPage go={go} openAuth={setAuthMode} />
            </RouteFrame>
          )}
          {section === "pricing" && (
            <RouteFrame key="pricing">
              <PricingPage currentPlan={authSession?.plan ?? null} go={go} openAuth={setAuthMode} upgradeToPro={upgradeToPro} />
            </RouteFrame>
          )}
          {section === "resources" && (
            <RouteFrame key="resources">
              <ResourcesPage go={go} openAuth={setAuthMode} />
            </RouteFrame>
          )}
          {section === "community" && (
            <RouteFrame key="community">
              <CommunityPage go={go} openAuth={setAuthMode} />
            </RouteFrame>
          )}
          {section === "dashboard" && (
            <RouteFrame key="dashboard">
              {isSignedIn ? <Dashboard analysis={analysis} brokerStatus={brokerStatus} rules={rules} go={go} /> : <AuthGate openAuth={setAuthMode} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "import" && (
            <RouteFrame key="import">
              {isSignedIn ? <ImportDesk entitlements={entitlements} importCsv={importCsv} openFirmOAuth={openFirmOAuth} status={status} reset={() => { const demoTrades = entitlements.plan === "free" ? sampleTrades.slice(0, entitlements.maxStoredTrades) : sampleTrades; setTrades(demoTrades); setRules(defaultRules); setStatus("Demo trades restored."); announce("Demo trades restored.", "success"); }} upgradeToPro={upgradeToPro} /> : <AuthGate openAuth={setAuthMode} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "oauth" && (
            <RouteFrame key="oauth">
              {isSignedIn ? <OAuthConnectPage firmId={oauthFirmId} onApprove={completeFirmOAuth} onCancel={cancelFirmOAuth} /> : <AuthGate openAuth={setAuthMode} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "rules" && (
            <RouteFrame key="rules">
              {isSignedIn ? <RulesEngine analysis={analysis} entitlements={entitlements} rules={rules} setRules={setRules} upgradeToPro={upgradeToPro} /> : <AuthGate openAuth={setAuthMode} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "coach" && (
            <RouteFrame key="coach">
              {isSignedIn ? <Coach analysis={analysis} entitlements={entitlements} go={go} upgradeToPro={upgradeToPro} /> : <AuthGate openAuth={setAuthMode} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "passport" && (
            <RouteFrame key="passport">
              {isSignedIn ? <Passport analysis={analysis} entitlements={entitlements} sharePassport={sharePassport} go={go} upgradeToPro={upgradeToPro} /> : <AuthGate openAuth={setAuthMode} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function Navbar({ section, go, openAuth, mobileOpen, setMobileOpen, authSession, riskScore, signOut }: {
  section: Section;
  go: (section: Section) => void;
  openAuth: (mode: AuthMode) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  authSession: AuthSession | null;
  riskScore: number;
  signOut: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const isAppMode = Boolean(authSession) || isProtectedSection(section);
  const activeMarketingLabel = marketingNav.find((item) => item.action === section)?.label ?? "Product";
  const activeAppLabel = appNav.find((item) => item.id === section)?.label ?? "";

  useEffect(() => {
    const marker = document.createElement("span");
    marker.setAttribute("aria-hidden", "true");
    marker.style.cssText = "position:absolute;top:28px;left:0;width:1px;height:1px;pointer-events:none;opacity:0;";
    document.body.prepend(marker);

    const observer = new IntersectionObserver(([entry]) => {
      setScrolled(entry ? !entry.isIntersecting : false);
    });
    observer.observe(marker);

    return () => {
      observer.disconnect();
      marker.remove();
    };
  }, []);

  function handleMarketingNav(action: (typeof marketingNav)[number]["action"]) {
    setMobileOpen(false);
    go(action);
  }

  return (
    <motion.header
      className="fixed left-0 right-0 top-0 z-50 px-4 pb-3 pt-6 md:px-8"
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className={`pointer-events-none absolute left-1/2 top-[1.16rem] -z-10 h-[4.1rem] w-[calc(100%-2rem)] max-w-[1370px] -translate-x-1/2 transition duration-500 ${
          scrolled ? "header-scroll-veil opacity-90" : "header-scroll-veil opacity-60"
        }`}
      />
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between md:justify-center">
        <div className={`header-orbit marketing-header hidden items-center md:flex ${isAppMode ? "product-header" : ""}`}>
          <button className="brand-lockup group flex min-w-0 shrink-0 items-center" onClick={() => go(authSession ? "dashboard" : "overview")} type="button" aria-label="Go to Cova home">
            <img
              src="/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png"
              alt="Cova"
              className="header-wordmark-img object-contain opacity-95 transition duration-500 group-hover:opacity-100"
            />
          </button>

          <nav className={`header-nav-group marketing-nav-group ${isAppMode ? "product-nav-group" : ""}`} aria-label="Primary navigation">
            {isAppMode ? (
              appNav.map((item) => (
                <button
                  key={item.id}
                  className={`marketing-nav-link font-body text-[14px] font-medium ${section === item.id ? "marketing-nav-link-active" : ""}`}
                  onClick={() => { setMobileOpen(false); go(item.id); }}
                  type="button"
                  aria-current={section === item.id ? "page" : undefined}
                >
                  {item.label}
                </button>
              ))
            ) : (
              marketingNav.map((item) => (
                <button
                  key={item.label}
                  className={`marketing-nav-link font-body text-[14px] font-medium ${section === item.action ? "marketing-nav-link-active" : ""}`}
                  onClick={() => handleMarketingNav(item.action)}
                  type="button"
                  aria-current={section === item.action ? "page" : undefined}
                >
                  {item.label}
                  {item.hasChevron && <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              ))
            )}
          </nav>

          <div className={`header-actions ${isAppMode ? "product-actions" : ""}`}>
            {authSession ? (
              <>
                <button
                  className="header-workspace-button font-body text-[14px] font-medium"
                  onClick={() => go("dashboard")}
                  type="button"
                >
                  Dashboard
                </button>
                <button
                  className="header-workspace-button header-workspace-button-primary font-body text-[14px] font-medium"
                  onClick={() => go("import")}
                  type="button"
                >
                  Link account
                </button>
                <button
                  className="header-link-button marketing-login font-body text-[14px] font-medium"
                  onClick={signOut}
                  type="button"
                >
                  Sign out
                </button>
                <button
                  className="header-risk-button font-body text-[14px] font-medium"
                  onClick={() => go("dashboard")}
                  type="button"
                  aria-label="View dashboard risk score"
                >
                  <span className="header-risk-dot" />
                  <span>Risk</span>
                  <strong>{riskScore || "--"}</strong>
                </button>
              </>
            ) : (
              <>
                <button
                  className="header-link-button marketing-login font-body text-[14px] font-medium"
                  onClick={() => openAuth("login")}
                  type="button"
                >
                  Login
                </button>
                <StartFreeButton compact onClick={() => openAuth("signup")} />
              </>
            )}
          </div>
        </div>

        <button className="brand-lockup flex min-w-0 shrink-0 items-center md:hidden" onClick={() => go(authSession ? "dashboard" : "overview")} type="button" aria-label="Go to Cova home">
          <img src="/cova-logo-minimal-white.svg" alt="Cova" className="header-brand-mark h-10 w-10 object-contain opacity-95" />
        </button>

        <button className="liquid-glass mobile-menu-toggle shrink-0 rounded-full p-3 text-white md:hidden" onClick={() => setMobileOpen(!mobileOpen)} type="button" aria-label="Toggle menu">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="liquid-glass-strong mx-auto mt-3 max-w-7xl rounded-[28px] p-3 md:hidden"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
          >
            {isAppMode ? appNav.map((item) => (
              <button
                key={item.id}
                className={`flex w-full items-center justify-between rounded-full px-4 py-3 text-left font-body text-sm ${activeAppLabel === item.label ? "bg-white/8 text-white" : "text-white/68"}`}
                onClick={() => { setMobileOpen(false); go(item.id); }}
                type="button"
              >
                {item.label}
              </button>
            )) : marketingNav.map((item) => (
                <button
                  key={item.label}
                  className={`flex w-full items-center justify-between rounded-full px-4 py-3 text-left font-body text-sm ${activeMarketingLabel === item.label ? "bg-white/8 text-white" : "text-white/68"}`}
                  onClick={() => handleMarketingNav(item.action)}
                  type="button"
                >
                {item.label}
                {item.hasChevron && <ChevronDown className="h-4 w-4" />}
              </button>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
              <button className="cova-button cova-button-secondary rounded-full px-4 py-3 font-body text-sm" onClick={() => { setMobileOpen(false); authSession ? signOut() : openAuth("login"); }} type="button">
                {authSession ? "Sign out" : "Login"}
              </button>
              {!authSession ? (
                <StartFreeButton compact className="w-full" onClick={() => { setMobileOpen(false); openAuth("signup"); }} />
              ) : (
                <button className="cova-button cova-button-primary rounded-full px-4 py-3 font-body text-sm font-semibold" onClick={() => { setMobileOpen(false); go("import"); }} type="button">
                  Link account
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

function AuthGate({ openAuth, onDevPreview }: { openAuth: (mode: AuthMode) => void; onDevPreview: () => void }) {
  const showDevPreview = isLocalPreview();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => openAuth("login"));
    return () => window.cancelAnimationFrame(frame);
  }, [openAuth]);

  return (
    <section className="relative min-h-screen overflow-hidden px-5 pb-24 pt-36 md:px-12 lg:px-20">
      <ImageAtmosphere src="/media/cova-dashboard-plate.jpg" opacity="opacity-[0.22]" />
      <div className="relative z-10 mx-auto grid min-h-[68vh] max-w-7xl place-items-center">
        <motion.div
          className="liquid-glass-strong max-w-3xl rounded-[44px] p-7 text-center md:p-10"
          initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-white/12 bg-white/[0.045] text-[#18c887]">
            <LockKeyhole className="h-6 w-6" />
          </span>
          <p className="mt-7 font-body text-xs uppercase tracking-[0.24em] text-[#b9f5df]">Private workspace</p>
          <h2 className="mt-4 font-heading text-5xl italic leading-[1.02] tracking-normal md:text-7xl">Sign in to view account stats.</h2>
          <p className="mx-auto mt-5 max-w-xl font-body font-light leading-relaxed text-white/58">
            Cova hides uploads, risk scores, limit warnings, insights, and Passport details until a member session is active.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <GlassButton strong onClick={() => openAuth("login")}>Login</GlassButton>
            <StartFreeButton compact onClick={() => openAuth("signup")} />
            {showDevPreview && <GlassButton onClick={onDevPreview}>Dev preview</GlassButton>}
          </div>
          {showDevPreview && (
            <p className="mx-auto mt-5 max-w-md font-body text-xs leading-relaxed text-white/38">
              Local only: unlocks the demo workspace as {DEV_PREVIEW_EMAIL}.
            </p>
          )}
        </motion.div>
      </div>
    </section>
  );
}

function AuthSheet({ mode, setMode, close, onAuthenticated, onDevPreview }: { mode: AuthMode | null; setMode: (mode: AuthMode) => void; close: () => void; onAuthenticated: (email: string, mode: AuthMode, source?: AuthSession["source"], plan?: PlanTier, userId?: string) => void; onDevPreview: () => void }) {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const isSignup = mode === "signup";
  const canRedirect = mode ? canRedirectToHostedAuth(mode) : false;
  const supabaseReady = isSupabaseConfigured();
  const showDevPreview = isLocalPreview();

  useEffect(() => {
    setNotice("");
  }, [mode]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode) {
      return;
    }
    setAuthBusy(true);
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash || "#dashboard"}`;

    localStorage.setItem(
      AUTH_INTENT_KEY,
      JSON.stringify({
        email,
        mode,
        returnTo,
        savedAt: new Date().toISOString(),
      }),
    );

    if (isLocalPreview()) {
      onAuthenticated(email, mode, "local-preview", "free");
      setAuthBusy(false);
      return;
    }

    if (supabaseReady) {
      const redirectTo = `${window.location.origin}${returnTo}`;
      const { error } = await sendSupabaseMagicLink(email, redirectTo);
      if (error) {
        setNotice(error.message || "Could not send the sign-in link. Try again in a moment.");
        setAuthBusy(false);
        return;
      }
      setNotice("Check your email for a secure Cova sign-in link.");
      setAuthBusy(false);
      return;
    }

    if (!canRedirectToHostedAuth(mode)) {
      if (!isLocalPreview()) {
        setNotice("Production auth is not configured yet. Add Supabase or hosted auth environment variables before launch.");
        setAuthBusy(false);
        return;
      }
      onAuthenticated(email, mode, "local-preview", "free");
      setAuthBusy(false);
      return;
    }

    window.location.assign(buildHostedAuthUrl(mode));
  }

  return (
    <AnimatePresence>
      {mode && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button className="absolute inset-0 cursor-default bg-black/62 backdrop-blur-md" onClick={close} type="button" aria-label="Close auth panel" />
          <motion.div
            className="liquid-glass-strong relative grid w-full max-w-5xl overflow-hidden rounded-[44px] p-4 md:grid-cols-[0.95fr_1.05fr]"
            initial={{ opacity: 0, y: 34, scale: 0.96, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 20, scale: 0.98, filter: "blur(10px)" }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={isSignup ? "Create Cova account" : "Log in to Cova"}
          >
            <button className="liquid-glass absolute right-5 top-5 z-20 grid h-10 w-10 place-items-center rounded-full text-white" onClick={close} type="button" aria-label="Close">
              <X className="h-4 w-4" />
            </button>

            <div className="relative min-h-[420px] overflow-hidden rounded-[34px] border border-white/10 bg-black/42 p-8">
              <img src="/media/cova-passport-product.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.38] [mask-image:linear-gradient(90deg,#000_0%,rgba(0,0,0,0.72)_54%,rgba(0,0,0,0)_100%)]" loading="lazy" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(24,200,135,0.18),transparent_36%),linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0)_48%)]" />
              <div className="absolute -right-16 bottom-6 h-52 w-52 rounded-full border border-white/10 bg-[radial-gradient(circle,rgba(255,255,255,0.12),transparent_62%)]" />
              <div className="relative z-10 flex h-full flex-col justify-between">
                <div>
                  <span className="liquid-glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-body text-xs uppercase tracking-[0.18em] text-[#18c887]">
                    <LockKeyhole className="h-3.5 w-3.5" />
                    Member access
                  </span>
                  <h2 className="mt-10 max-w-sm font-heading text-6xl italic leading-[1.02] tracking-[0.012em] [word-spacing:0.1em] text-white">
                    Risk desk identity.
                  </h2>
                </div>
                <div className="grid gap-3">
                  {["Hosted member handoff", "No local password storage", "Return to active desk"].map((item) => (
                    <div className="flex items-center gap-3 font-body text-sm text-white/68" key={item}>
                      <span className="grid h-7 w-7 place-items-center rounded-full border border-white/12 bg-white/5 text-emerald-300">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <form className="p-6 md:p-8" onSubmit={submit}>
              <div className="terminal-tab-bar mb-8 inline-grid grid-cols-2">
                {(["login", "signup"] as const).map((item) => {
                  const active = mode === item;
                  return (
                    <button
                      className={`terminal-tab px-5 py-2 font-body text-sm font-medium ${active ? "terminal-tab-active" : ""}`}
                      key={item}
                      onClick={() => setMode(item)}
                      type="button"
                    >
                      {active && (
                        <motion.span
                          className="terminal-tab-motion"
                          layoutId="auth-tab-active"
                          transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                        />
                      )}
                      <span className="terminal-tab-copy">{item === "login" ? "Login" : "Start for free"}</span>
                    </button>
                  );
                })}
              </div>

              <p className="font-body text-xs uppercase tracking-[0.24em] text-[#18c887]">{isSignup ? "Create account" : "Existing account"}</p>
              <h3 className="mt-3 font-body text-3xl font-medium text-white">
                {isSignup ? "Create your Cova workspace." : "Return to your Cova workspace."}
              </h3>
              <p className="mt-4 max-w-md font-body text-sm font-light leading-relaxed text-white/56">
                {isSignup
                  ? "Save uploads, limits, insight notes, and Passport history under your member identity."
                  : "Use your member session to protect the production Cova workspace."}
              </p>

              <label className="mt-8 block font-body text-xs uppercase tracking-[0.2em] text-white/40" htmlFor="auth-email">
                Email
              </label>
              <div className="liquid-glass mt-3 flex items-center gap-3 rounded-full px-5 py-3">
                <Mail className="h-4 w-4 text-[#18c887]" />
                <input
                  id="auth-email"
                  className="w-full bg-transparent font-body text-sm text-white outline-none placeholder:text-white/30"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@domain.com"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>

              <button className="cova-button cova-button-primary mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 font-body text-sm font-semibold disabled:cursor-wait disabled:opacity-60" disabled={authBusy} type="submit">
                <UserRound className="h-4 w-4" />
                {authBusy ? "Working..." : isLocalPreview() ? "Start local session" : supabaseReady ? "Send secure link" : canRedirect ? "Continue securely" : "Start local session"}
                <ArrowUpRight className="h-4 w-4" />
              </button>

              {showDevPreview && (
                <button
                  className="cova-button cova-button-secondary mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 font-body text-sm font-medium"
                  onClick={onDevPreview}
                  type="button"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Enter dev preview
                </button>
              )}

              <p className="mt-4 min-h-10 font-body text-xs leading-relaxed text-white/45">
                {notice || (isLocalPreview() ? "Local preview creates a temporary Cova session immediately so you can test dashboard and account linking." : supabaseReady ? "Cova uses Supabase magic links when configured, so the app never stores your password." : "Production auth will redirect through your hosted auth provider. This MVP keeps the visual flow ready without storing passwords locally.")}
              </p>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Hero({ go, openAuth, isSignedIn }: { go: (section: Section) => void; isSignedIn: boolean; openAuth: (mode: AuthMode) => void }) {
  const journalFeatures = [
    { title: "Log every detail", body: "Capture trades and notes.", Icon: BookOpen },
    { title: "Analyze performance", body: "See what is working.", Icon: Gauge },
    { title: "Manage risk", body: "Track size and drawdown.", Icon: ShieldCheck },
    { title: "Improve every day", body: "Review, learn, improve.", Icon: ArrowUpRight },
  ];

  function scrollHowItWorks() {
    document.querySelector(".scroll-story")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section
      className="market-hero relative flex min-h-[100dvh] overflow-hidden px-5 md:px-10 lg:px-[3.1rem]"
    >
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_75%_38%,rgba(24,200,135,0.13),transparent_38%),radial-gradient(ellipse_at_23%_58%,rgba(185,245,223,0.06),transparent_32%),linear-gradient(180deg,#020403_0%,#07110d_54%,#000_100%)]" />
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(90deg,rgba(0,0,0,0.98)_0%,rgba(0,0,0,0.72)_34%,rgba(0,0,0,0.2)_72%,rgba(0,0,0,0.46)_100%)]" />
      <div className="market-hero-grid absolute inset-0 z-[2]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-[-1px] z-[5] h-64 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.72)_62%,#000_100%)]" />

      <div className="market-hero-layout relative z-10 grid gap-10 md:grid-cols-[0.76fr_1.24fr]">
        <motion.div
          className="market-hero-copy"
          initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.82, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="market-hero-eyebrow font-body text-xs font-medium uppercase tracking-[0.28em] text-[#18c887] md:text-sm">
            The modern trading journal
          </p>

          <h1 className="market-hero-title mt-5 font-body text-[4.35rem] font-semibold leading-[0.98] tracking-[-0.055em] text-white md:text-[4.95rem] lg:text-[5.45rem]">
            Review <span>risk</span><br />
            before the<br />
            next trade.
          </h1>

          <p className="market-hero-subline mt-7 font-body text-lg font-light leading-relaxed text-white/72 md:text-xl">
            Cova helps you log, analyze, and learn from every trade so you can build consistency and grow with confidence.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-5">
            <span className="hero-primary-cta-wrap">
              {isSignedIn ? (
                <StartFreeButton icon onClick={() => go("dashboard")}>Open dashboard</StartFreeButton>
              ) : (
                <StartFreeButton icon onClick={() => openAuth("signup")} />
              )}
            </span>
            <button className="market-hero-action flex items-center gap-5 rounded-full font-body text-base font-light text-white" onClick={isSignedIn ? () => go("import") : scrollHowItWorks} type="button">
              <span className="market-play-dot grid place-items-center rounded-full">
                {isSignedIn ? <Fingerprint className="h-4 w-4 text-[#18c887]" /> : <Play className="h-4 w-4 fill-[#18c887] text-[#18c887]" />}
              </span>
              <span className="market-hero-action-label">{isSignedIn ? "Link account" : "See how it works"}</span>
            </button>
          </div>
          <p className="market-hero-proof mt-5 font-body text-sm text-white/48">
            <span /> {isSignedIn ? "Dashboard and account linking are ready" : "No credit card required"}
          </p>

        </motion.div>

        <HeroDashboardMockup revealStats={isSignedIn} />

        <motion.div
          className="market-feature-band hidden xl:block"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.74, delay: 0.38, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="market-feature-kicker">Built for traders who want more</p>
          <div className="market-feature-strip market-feature-strip-wide">
            {journalFeatures.map(({ title, body, Icon }) => (
              <div className="market-feature-item" key={title}>
                <span className="market-feature-icon"><Icon className="h-5 w-5" /></span>
                <div>
                  <h3 className="font-body text-sm font-semibold text-white md:text-[0.95rem]">{title}</h3>
                  <p className="mt-1 font-body text-xs leading-relaxed text-white/52">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function HeroDashboardMockup({ revealStats }: { revealStats: boolean }) {
  const heroDashboardNav = [
    { label: "Overview", Icon: FileText },
    { label: "Trades", Icon: Repeat2 },
    { label: "Calendar", Icon: CalendarDays },
    { label: "Insights", Icon: ChartNoAxesColumnIncreasing },
    { label: "Goals", Icon: Target },
    { label: "Review", Icon: ClipboardCheck },
  ] satisfies { Icon: LucideIcon; label: string }[];
  const heroDashboardTrades = revealStats ? [
    ["ES", "Long", "+$320"],
    ["NQ", "Short", "-$180"],
    ["BTCUSD", "Long", "+$410"],
    ["AAPL", "Long", "+$210"],
  ] : [
    ["Journal", "Private", "Locked"],
    ["Trades", "Private", "Locked"],
    ["Review", "Private", "Locked"],
    ["Passport", "Private", "Locked"],
  ];
  const heroMetrics = revealStats ? [
    ["Total P&L", "+$12,540"],
    ["Win Rate", "63.2%"],
    ["Profit Factor", "2.14"],
    ["Total Trades", "128"],
  ] : [
    ["Private review", "Locked"],
    ["Trade log", "Sign in"],
    ["Risk notes", "Hidden"],
    ["Passport", "Private"],
  ];

  return (
    <motion.div
      className="hero-dashboard-stage"
      initial={{ opacity: 0, x: 52, rotate: -1.5 }}
      animate={{ opacity: 1, x: 0, rotate: 0 }}
      transition={{ duration: 0.98, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
      aria-hidden="true"
    >
      <div className="hero-dashboard-glow" />
      <div className="hero-dashboard-shell">
        <div className="hero-dashboard-screen">
          <aside className="hero-dashboard-sidebar">
            <img src="/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png" alt="" className="hero-dashboard-wordmark" draggable={false} />
            <div className="hero-dashboard-nav-stack">
              {heroDashboardNav.map(({ label, Icon }, index) => (
                <span className={`hero-dashboard-nav ${index === 0 ? "hero-dashboard-nav-active" : ""}`} key={label}>
                  <Icon className="hero-dashboard-nav-icon" strokeWidth={1.85} />
                  {label}
                </span>
              ))}
            </div>
            <div className="hero-dashboard-sidebar-footer">
              <span className="hero-dashboard-settings">
                <Settings className="hero-dashboard-settings-icon" strokeWidth={1.8} />
                Settings
              </span>
              <div className="hero-dashboard-user">
                <img src="/media/cova-avatar-alex-r.png" alt="" className="hero-dashboard-avatar" draggable={false} />
                <span>Alex R.</span>
                <ChevronDown className="hero-dashboard-user-chevron" strokeWidth={1.8} />
              </div>
            </div>
          </aside>

          <main className="hero-dashboard-main">
            <div className="hero-dashboard-panel-title">Performance</div>
            <div className="hero-dashboard-metrics">
              {heroMetrics.map(([label, value]) => (
                <div className="hero-dashboard-metric" key={label}>
                  <span>{label}</span>
                  <strong className={revealStats && label === "Total P&L" ? "text-[#39e3a6]" : "text-white"}>{value}</strong>
                </div>
              ))}
            </div>

            <div className="hero-dashboard-chart">
              <div className="hero-chart-toolbar">
                <span>{revealStats ? "Performance" : "Private review"}</span>
                <div>
                  {["1W", "1M", "3M", "1Y", "All"].map((range) => (
                    <span className={range === "1M" ? "active" : ""} key={range}>{range}</span>
                  ))}
                </div>
              </div>
              <DashboardCandlestickChart />
            </div>

            <div className="hero-dashboard-cards">
              <div className="hero-dashboard-card hero-trades-card">
                <h4>{revealStats ? "Recent Trades" : "Private Workspace"}</h4>
                <div className="hero-trade-row hero-trade-row-head">
                  <span>{revealStats ? "Symbol" : "Area"}</span>
                  <span>Status</span>
                  <strong>Access</strong>
                </div>
                {heroDashboardTrades.map(([market, side, pnl]) => (
                  <div className="hero-trade-row" key={`${market}-${pnl}`}>
                    <span>{market}</span>
                    <span className={revealStats && side === "Long" ? "text-[#39e3a6]" : revealStats && side === "Short" ? "text-[#ff5f7b]" : "text-white/54"}>{side}</span>
                    <strong className={revealStats && pnl.startsWith("+") ? "text-[#39e3a6]" : revealStats && pnl.startsWith("-") ? "text-[#ff5f7b]" : "text-white/48"}>{pnl}</strong>
                  </div>
                ))}
              </div>

              <div className="hero-dashboard-card hero-journal-card">
                <h4>Daily Journal</h4>
                {revealStats ? (
                  <>
                    <p>How was your execution?</p>
                    <div className="hero-stars" aria-hidden="true">
                      {Array.from({ length: 5 }).map((_, index) => <span key={index}>★</span>)}
                    </div>
                    <p>What did you learn?</p>
                    <strong>Patient entries worked.</strong>
                  </>
                ) : (
                  <>
                    <p>Sign in to save journal notes.</p>
                    <div className="hero-stars hero-stars-muted" aria-hidden="true">
                      {Array.from({ length: 5 }).map((_, index) => <span key={index}>•</span>)}
                    </div>
                    <p>Your account evidence stays hidden.</p>
                    <strong>Member-only</strong>
                  </>
                )}
              </div>

              <div className="hero-dashboard-card hero-risk-card">
                <h4>{revealStats ? "Risk Breakdown" : "Risk Review"}</h4>
                {revealStats ? (
                  <>
                    <div className="hero-risk-donut">
                      <span>2.3%</span>
                      <small>Avg Risk</small>
                    </div>
                    <div className="hero-risk-legend">
                      <span><i className="win" /> Win</span>
                      <span><i className="loss" /> Loss</span>
                      <span><i /> Breakeven</span>
                    </div>
                  </>
                ) : (
                  <div className="hero-locked-risk">
                    <LockKeyhole className="h-5 w-5" />
                    <span>Stats hidden</span>
                    <small>Sign in to unlock</small>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </motion.div>
  );
}

function DashboardCandlestickChart() {
  const candles = useMemo(() => buildDashboardVectorCandles(34), []);
  const prefersReducedMotion = usePrefersReducedMotion();
  const chartRef = useRef<SVGSVGElement | null>(null);
  const loopRef = useRef<SVGGElement | null>(null);
  const width = 760;
  const height = 218;
  const chartTop = 20;
  const chartBottom = 204;
  const minPrice = Math.min(...candles.map((candle) => candle.low)) - 4;
  const maxPrice = Math.max(...candles.map((candle) => candle.high)) + 4;
  const priceRange = Math.max(1, maxPrice - minPrice);
  const priceToY = (value: number) => chartTop + (1 - (value - minPrice) / priceRange) * (chartBottom - chartTop);
  const trackWidth = width;
  const candleStep = trackWidth / candles.length;
  const loopDistance = trackWidth - candleStep;

  useEffect(() => {
    const loop = loopRef.current;
    const chart = chartRef.current;
    if (!loop) {
      return;
    }

    if (prefersReducedMotion) {
      loop.setAttribute("transform", "translate(0 0)");
      return;
    }

    let frame = 0;
    let frameTimeout = 0;
    let startTime = 0;
    let isInView = true;
    const duration = 42000;
    const frameInterval = 1000 / 20;

    const clearScheduledFrame = () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(frameTimeout);
      frame = 0;
      frameTimeout = 0;
    };

    const scheduleFrame = () => {
      if (frame || frameTimeout || !isInView || document.hidden) {
        return;
      }

      frameTimeout = window.setTimeout(() => {
        frameTimeout = 0;
        frame = window.requestAnimationFrame(animate);
      }, frameInterval);
    };

    const animate = (time: number) => {
      frame = 0;
      if (!startTime) {
        startTime = time;
      }
      const progress = ((time - startTime) % duration) / duration;
      loop.setAttribute("transform", `translate(${-progress * loopDistance} 0)`);
      scheduleFrame();
    };

    const observer = chart ? new IntersectionObserver(([entry]) => {
      isInView = entry ? entry.isIntersecting : true;
      if (isInView) {
        scheduleFrame();
      } else {
        clearScheduledFrame();
      }
    }, { rootMargin: "80px" }) : null;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearScheduledFrame();
      } else {
        scheduleFrame();
      }
    };

    if (chart && observer) {
      observer.observe(chart);
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleFrame();

    return () => {
      clearScheduledFrame();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [prefersReducedMotion, loopDistance]);

  const renderCandleTrack = (offset: number, copyIndex: number) => candles.map((candle, index) => {
    const x = offset + index * candleStep + candleStep * 0.3;
    const openY = priceToY(candle.open);
    const closeY = priceToY(candle.close);
    const highY = priceToY(candle.high);
    const lowY = priceToY(candle.low);
    const isUp = candle.close >= candle.open;
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(8.4, Math.abs(closeY - openY));
    const bodyWidth = candle.width;
    const bodyX = x - bodyWidth / 2;
    const wickClass = isUp ? "dashboard-candle-wick-up" : "dashboard-candle-wick-down";
    const bodyClass = isUp ? "dashboard-candle-body-up" : "dashboard-candle-body-down";

    return (
      <g className="dashboard-candle" key={`${copyIndex}-${index}-${candle.open.toFixed(2)}`}>
        <line className={`dashboard-candle-wick ${wickClass}`} x1={x} x2={x} y1={highY} y2={lowY} />
        <rect
          className={`dashboard-candle-body ${bodyClass}`}
          x={bodyX}
          y={bodyTop}
          width={bodyWidth}
          height={bodyHeight}
          rx="1.2"
        />
      </g>
    );
  });

  return (
    <svg
      ref={chartRef}
      className="hero-dashboard-vector-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Sample trading performance candlestick chart"
    >
      <defs>
        <clipPath id="dashboard-candlestick-clip">
          <rect x="0" y="0" width={width} height={height} rx="18" />
        </clipPath>
      </defs>
      <g className="hero-dashboard-vector-grid" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <line key={`h-${index}`} x1="0" x2={width} y1={32 + index * 31} y2={32 + index * 31} />
        ))}
        {Array.from({ length: 11 }).map((_, index) => (
          <line key={`v-${index}`} x1={index * 76} x2={index * 76} y1="0" y2={height} />
        ))}
      </g>
      <g clipPath="url(#dashboard-candlestick-clip)">
        <g className="dashboard-candle-loop" ref={loopRef}>
          {renderCandleTrack(-loopDistance, -1)}
          {renderCandleTrack(0, 0)}
          {renderCandleTrack(loopDistance, 1)}
          {renderCandleTrack(loopDistance * 2, 2)}
        </g>
      </g>
    </svg>
  );
}

function FeaturesPage({ go, openAuth }: { go: (section: Section) => void; openAuth: (mode: AuthMode) => void }) {
  const featureGroups = [
    {
      title: "Trade journal",
      body: "Import trades, add notes, and keep one clean record of what actually happened.",
      Icon: BookOpen,
      action: "Upload trades",
      onClick: () => go("import"),
    },
    {
      title: "Performance review",
      body: "See P&L, win rate, drawdown, profit factor, and setup quality in one view.",
      Icon: Gauge,
      action: "Review account",
      onClick: () => go("dashboard"),
    },
    {
      title: "Risk limits",
      body: "Set daily loss, single trade loss, size, streak, and consistency limits.",
      Icon: SlidersHorizontal,
      action: "Set limits",
      onClick: () => go("rules"),
    },
    {
      title: "Plain-English insights",
      body: "Get coaching notes tied to your own trade history, not guesses or signals.",
      Icon: ClipboardCheck,
      action: "See insights",
      onClick: () => go("coach"),
    },
    {
      title: "Prop firm import paths",
      body: "Start with CSV exports today and prepare for read-only account connections.",
      Icon: FileUp,
      action: "View resources",
      onClick: () => go("resources"),
    },
    {
      title: "Risk Passport",
      body: "Share proof of discipline without sending your full journal or trade calls.",
      Icon: Fingerprint,
      action: "Open passport",
      onClick: () => go("passport"),
    },
  ];

  return (
    <SectionShell
      eyebrow="Features"
      title="Everything a trader needs after the trade closes."
      action={<StartFreeButton icon onClick={() => openAuth("signup")} />}
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" opacity="opacity-[0.26]" />}
    >
      <div className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr]">
        <div className="liquid-glass-strong rounded-[40px] p-7 md:p-9">
          <p className="font-body text-sm uppercase tracking-[0.22em] text-[#b9f5df]">Built for review</p>
          <h3 className="mt-5 max-w-[13ch] font-body text-3xl font-semibold leading-[1.04] tracking-[-0.035em] text-white md:max-w-3xl md:text-6xl md:leading-[1.02]">
            Cova is a trading journal, risk desk, and proof layer in one workspace.
          </h3>
          <p className="mt-6 max-w-[31ch] font-body text-base font-light leading-relaxed text-white/62 md:max-w-2xl">
            The workflow stays simple: upload or connect history, review the account, tighten limits, then share a clean Passport when needed.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ["No signals", "Cova reviews behavior only."],
              ["Read-only", "Connections cannot place trades."],
              ["Prop focused", "Built around funded-account rules."],
            ].map(([label, body]) => (
              <div className="rounded-[24px] border border-white/10 bg-black/24 p-4" key={label}>
                <p className="font-body text-sm font-medium text-white">{label}</p>
                <p className="mt-2 font-body text-xs leading-relaxed text-white/45">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          {featureGroups.slice(0, 2).map(({ title, body, Icon, action, onClick }) => (
            <FeatureActionCard key={title} title={title} body={body} Icon={Icon} action={action} onClick={onClick} strong />
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {featureGroups.slice(2).map(({ title, body, Icon, action, onClick }) => (
          <FeatureActionCard key={title} title={title} body={body} Icon={Icon} action={action} onClick={onClick} />
        ))}
      </div>
    </SectionShell>
  );
}

function FeatureActionCard({ title, body, Icon, action, onClick, strong = false }: {
  title: string;
  body: string;
  Icon: LucideIcon;
  action: string;
  onClick: () => void;
  strong?: boolean;
}) {
  return (
    <motion.article
      className={`${strong ? "liquid-glass-strong" : "liquid-glass"} motion-surface flex min-h-[220px] flex-col rounded-[34px] p-6`}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.992 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className="grid h-11 w-11 place-items-center rounded-full border border-[#18c887]/24 bg-[#18c887]/10 text-[#b9f5df]">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-6 font-body text-xl font-semibold text-white">{title}</h3>
      <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/54">{body}</p>
      <button className="mt-auto inline-flex w-fit items-center gap-2 pt-6 font-body text-sm font-medium text-[#b9f5df]" onClick={onClick} type="button">
        {action}
        <ArrowUpRight className="h-4 w-4" />
      </button>
    </motion.article>
  );
}

function PricingPage({ currentPlan, go, openAuth, upgradeToPro }: { currentPlan: PlanTier | null; go: (section: Section) => void; openAuth: (mode: AuthMode) => void; upgradeToPro: () => void }) {
  return (
    <div className="relative overflow-hidden">
      <PlanStrip compact currentPlan={currentPlan} go={go} openAuth={openAuth} upgradeToPro={upgradeToPro} />
      <section className="relative px-5 pb-28 pt-2 md:px-12 lg:px-20">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-3">
          {[
            ["Start small", "Free is intentionally limited so new traders can test the workflow without turning Cova into another cluttered dashboard."],
            ["Upgrade when it matters", "Pro is for traders who want stored history, more Passport control, and a fuller review trail."],
            ["No hidden trading layer", "Cova does not sell signals, place trades, or promise payouts. It reviews behavior after execution."],
          ].map(([title, body]) => (
            <div className="liquid-glass rounded-[32px] p-6" key={title}>
              <BadgeCheck className="h-7 w-7 text-[#18c887]" />
              <h3 className="mt-5 font-body text-xl font-semibold text-white">{title}</h3>
              <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/54">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ResourcesPage({ go, openAuth }: { go: (section: Section) => void; openAuth: (mode: AuthMode) => void }) {
  const resourceCards = [
    {
      title: "How CSV works",
      body: "A CSV is the file most prop dashboards export. Cova reads the rows, checks for issues, and turns them into review notes.",
      Icon: FileText,
    },
    {
      title: "Prop firm exports",
      body: "TopstepX, Apex, Tradeify, MFFU, Rithmic, and Tradovate all need slightly different paths. Cova keeps the intake simple.",
      Icon: FileUp,
    },
    {
      title: "OAuth sign-in",
      body: "OAuth means you log in on the firm or broker site. Cova gets a read-only token, not your password.",
      Icon: LockKeyhole,
    },
    {
      title: "Risk Passport basics",
      body: "The Passport is a shareable discipline summary. It is proof of process, not a trading signal.",
      Icon: Fingerprint,
    },
  ];

  return (
    <SectionShell
      eyebrow="Resources"
      title="Learn the cleanest way to get trades into Cova."
      action={<StartFreeButton icon onClick={() => openAuth("signup")} />}
      backdrop={<ImageAtmosphere src="/media/cova-story-frame-02.png" opacity="opacity-[0.28]" />}
    >
      <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="liquid-glass-strong rounded-[40px] p-7 md:p-8">
          <FileUp className="h-10 w-10 text-[#18c887]" />
          <h3 className="mt-8 font-body text-4xl font-semibold leading-[1.02] tracking-[-0.035em] text-white">Start with the export you already have.</h3>
          <p className="mt-5 font-body font-light leading-relaxed text-white/58">
            Most traders do not need a live broker API on day one. Upload the account export first, then connect directly when the secure path is ready.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <GlassButton strong onClick={() => go("import")}>Upload export <ArrowUpRight className="h-4 w-4" /></GlassButton>
            <GlassButton onClick={() => go("features")}>View features</GlassButton>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {resourceCards.map(({ title, body, Icon }) => (
            <div className="liquid-glass rounded-[32px] p-6" key={title}>
              <Icon className="h-7 w-7 text-[#b9f5df]" />
              <h3 className="mt-5 font-body text-xl font-semibold text-white">{title}</h3>
              <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/54">{body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-7 liquid-glass rounded-[34px] p-6 md:p-7">
        <CsvExplainer
          body="A CSV is a spreadsheet-style trade export. You do not need to understand the file. Cova checks the columns and warns you before importing rows."
          steps={["Find trades or fills", "Download the CSV", "Upload and review"]}
        />
      </div>
    </SectionShell>
  );
}

function CommunityPage({ go, openAuth }: { go: (section: Section) => void; openAuth: (mode: AuthMode) => void }) {
  const communityItems = [
    ["Review room", "Weekly prompts for checking size, drawdown, and execution quality."],
    ["Playbooks", "Simple risk-review templates for funded account routines."],
    ["Connector requests", "Vote on which prop firm or platform should be supported next."],
    ["Member examples", "Share anonymized Risk Passport patterns without posting trade calls."],
  ];

  return (
    <SectionShell
      eyebrow="Community"
      title="A place for traders who review before they react."
      action={<GlassButton strong onClick={() => openAuth("signup")}>Join the preview <ArrowUpRight className="h-4 w-4" /></GlassButton>}
      backdrop={<ImageAtmosphere src="/media/cova-story-frame-04.png" align="right" opacity="opacity-[0.28]" />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_0.78fr]">
        <div className="liquid-glass-strong rounded-[42px] p-7 md:p-10">
          <p className="font-body text-sm uppercase tracking-[0.22em] text-[#b9f5df]">No hype room</p>
          <h3 className="mt-5 max-w-[13ch] font-body text-3xl font-semibold leading-[1.04] tracking-[-0.035em] text-white md:max-w-3xl md:text-6xl md:leading-[1.02]">
            Cova community is built around process, not calls.
          </h3>
          <p className="mt-6 max-w-[31ch] font-body text-base font-light leading-relaxed text-white/62 md:max-w-2xl">
            Traders should be able to compare routines, risk rules, and review habits without turning the space into a signal feed.
          </p>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {communityItems.map(([title, body]) => (
              <div className="rounded-[24px] border border-white/10 bg-black/24 p-4" key={title}>
                <p className="font-body text-sm font-semibold text-white">{title}</p>
                <p className="mt-2 font-body text-xs leading-relaxed text-white/46">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5">
          <div className="liquid-glass rounded-[36px] p-7">
            <Target className="h-9 w-9 text-[#18c887]" />
            <h3 className="mt-6 font-body text-2xl font-semibold text-white">What members share</h3>
            <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/54">
              Risk rules, review routines, cleaned trade summaries, and lessons from losing days.
            </p>
          </div>
          <div className="liquid-glass rounded-[36px] p-7">
            <ShieldCheck className="h-9 w-9 text-emerald-300" />
            <h3 className="mt-6 font-body text-2xl font-semibold text-white">What stays out</h3>
            <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/54">
              No trade alerts, no pump rooms, no payout promises, and no account access requests.
            </p>
          </div>
          <GlassButton onClick={() => go("resources")}>Read resources <ArrowUpRight className="h-4 w-4" /></GlassButton>
        </div>
      </div>
    </SectionShell>
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

type MarketCandleTone = "up" | "down";

type MarketCandle = {
  close: number;
  high: number;
  low: number;
  open: number;
  tone: MarketCandleTone;
  width: number;
};

const MARKET_CANDLE_COUNT = 220;
const MARKET_CANDLE_GAP = 22;
const MARKET_CANDLE_FPS = 16;

function buildDashboardVectorCandles(count: number): MarketCandle[] {
  const random = seededRandom(982451);
  const candles: MarketCandle[] = [];
  const marketMoves = [
    8, 10, 7, -6, 11, 13, 8, -9, -12, -14,
    -11, -8, 7, 10, 14, 19, -8, 12, 16, 11,
    -10, -15, -14, -10, -8, 9, 13, 17, 12, -16,
    -18, -15, -13, -8,
  ];
  let previousClose = 300;
  const rawMoves = marketMoves.slice(0, count).map((baseMove) => {
    const bodyNoise = (random() - 0.5) * (Math.abs(baseMove) > 15 ? 3.4 : 2.1);
    return baseMove + bodyNoise;
  });
  const loopCorrection = rawMoves.reduce((sum, move) => sum + move, 0) / Math.max(1, rawMoves.length);

  for (let index = 0; index < count; index += 1) {
    const open = previousClose;
    const move = rawMoves[index] - loopCorrection;
    const close = clampNumber(open + move, 230, 420);
    const body = Math.abs(close - open);
    const breakout = body > 16;
    const reversalProbe = index === 19 || index === 22 || index === 29;
    const upperWick = 2.2 + random() * (breakout ? 5.2 : 8.2) + (reversalProbe && close < open ? 5.5 : 0);
    const lowerWick = 2.2 + random() * (breakout ? 5.2 : 8.2) + (reversalProbe && close >= open ? 5.5 : 0);
    const width = body > 18 ? 17.2 : body > 11 ? 15.2 : 12.8;

    candles.push({
      close,
      high: Math.max(open, close) + upperWick,
      low: Math.min(open, close) - lowerWick,
      open,
      tone: close >= open ? "up" : "down",
      width,
    });
    previousClose = close;
  }

  return candles;
}

function MarketHeroField({ className = "", variant = "hero" }: { className?: string; variant?: "dashboard" | "hero" }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      return;
    }

    const heroCanvas = canvas;
    const drawingContext = context;
    const isDashboardChart = variant === "dashboard";
    const candleGap = isDashboardChart ? 22 : MARKET_CANDLE_GAP;
    const candles = isDashboardChart ? buildDashboardCandles(108) : buildMarketCandles(MARKET_CANDLE_COUNT);
    const minPrice = Math.min(...candles.map((candle) => candle.low)) - 10;
    const maxPrice = Math.max(...candles.map((candle) => candle.high)) + 10;
    const trackWidth = candles.length * candleGap;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animateChart = !reduceMotion;
    let animationFrame = 0;
    let frameTimeout = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let startTime = 0;
    let lastFrameTime = 0;
    let isInView = true;
    let stripCanvas: HTMLCanvasElement | null = null;

    function resize() {
      const rect = heroCanvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, width < 760 ? 1 : 1.35);
      heroCanvas.width = Math.round(width * dpr);
      heroCanvas.height = Math.round(height * dpr);
      drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      stripCanvas = renderMarketStrip(candles, trackWidth, height, dpr, minPrice, maxPrice, candleGap, variant);
      if (!animateChart) {
        draw(92_000);
        animationFrame = window.requestAnimationFrame(() => draw(92_000));
      } else {
        requestDraw();
      }
    }

    function requestDraw(delay = 0) {
      if (animationFrame || frameTimeout || !animateChart || !isInView || document.hidden) {
        return;
      }
      frameTimeout = window.setTimeout(() => {
        frameTimeout = 0;
        animationFrame = window.requestAnimationFrame(draw);
      }, delay);
    }

    function draw(timestamp: number) {
      animationFrame = 0;
      if (!startTime) {
        startTime = timestamp;
      }
      if (!stripCanvas || (animateChart && (!isInView || document.hidden))) {
        return;
      }
      const frameInterval = 1000 / MARKET_CANDLE_FPS;
      if (animateChart && !reduceMotion && timestamp - lastFrameTime < frameInterval) {
        requestDraw(frameInterval - (timestamp - lastFrameTime));
        return;
      }
      lastFrameTime = timestamp;

      const elapsed = animateChart ? timestamp - startTime : 92_000;
      const speed = isDashboardChart ? (width < 700 ? 8 : 9.5) : (width < 700 ? 5.5 : 7);
      const offset = (elapsed / 1000 * speed) % trackWidth;

      drawingContext.clearRect(0, 0, width, height);
      drawingContext.save();
      drawingContext.globalAlpha = 0.98;

      for (let copy = -1; copy <= Math.ceil(width / trackWidth) + 1; copy += 1) {
        drawingContext.drawImage(stripCanvas, copy * trackWidth - offset, 0, trackWidth, height);
      }

      drawingContext.restore();

      if (animateChart) {
        requestDraw(frameInterval);
      }
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(heroCanvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isInView = entry ? entry.isIntersecting : true;
      if (isInView) {
        if (!animateChart) {
          draw(92_000);
        } else {
          requestDraw();
        }
      } else {
        window.cancelAnimationFrame(animationFrame);
        window.clearTimeout(frameTimeout);
        animationFrame = 0;
        frameTimeout = 0;
      }
    }, { rootMargin: "80px" });
    intersectionObserver.observe(heroCanvas);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (!animateChart) {
          draw(92_000);
        } else {
          requestDraw();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!animateChart) {
      draw(92_000);
    } else {
      requestDraw();
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(frameTimeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [variant]);

  return (
    <div className={`market-candle-stage pointer-events-none absolute inset-0 z-[4] ${className}`} aria-hidden="true">
      <div className="market-candle-viewport">
        <canvas ref={canvasRef} className="market-candle-canvas" />
      </div>
    </div>
  );
}

function renderMarketStrip(candles: MarketCandle[], trackWidth: number, height: number, dpr: number, minPrice: number, maxPrice: number, candleGap: number, variant: "dashboard" | "hero") {
  const strip = document.createElement("canvas");
  strip.width = Math.max(1, Math.round(trackWidth * dpr));
  strip.height = Math.max(1, Math.round(height * dpr));

  const context = strip.getContext("2d", { alpha: true });
  if (!context) {
    return strip;
  }

  const isDashboardChart = variant === "dashboard";
  const chartTop = height * (isDashboardChart ? 0.18 : 0.08);
  const chartBottom = height * (isDashboardChart ? 0.88 : 0.76);
  const chartHeight = chartBottom - chartTop;
  const fullRange = Math.max(1, maxPrice - minPrice);
  const visualPadding = fullRange * (isDashboardChart ? 0.065 : 0.035);
  const visualMin = minPrice - visualPadding;
  const visualMax = maxPrice + visualPadding;
  const visualRange = Math.max(1, visualMax - visualMin);
  const priceToY = (value: number) => chartTop + (1 - (value - visualMin) / visualRange) * chartHeight;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, trackWidth, height);
  context.lineCap = "butt";
  context.lineJoin = "miter";

  const plottedCandles = candles.map((candle, index) => {
    const x = (index + 0.5) * candleGap;
    const openY = priceToY(candle.open);
    const closeY = priceToY(candle.close);
    const highY = priceToY(candle.high);
    const lowY = priceToY(candle.low);
    const rawBodyTop = Math.min(openY, closeY);
    const rawBodyHeight = Math.abs(closeY - openY);
    const minBody = isDashboardChart ? 5.6 : 4.2;
    const bodyHeight = Math.max(minBody, rawBodyHeight);
    const bodyTop = rawBodyHeight < minBody ? (openY + closeY) / 2 - bodyHeight / 2 : rawBodyTop;
    const color = candleColor(candle.tone);
    return { bodyHeight, bodyTop, candle, closeY, color, highY, lowY, openY, x };
  });

  plottedCandles.forEach(({ bodyHeight, bodyTop, candle, color, highY, lowY, x }) => {
    const crispXCenter = Math.round(x) + 0.5;
    const wickTop = Math.round(highY) + 0.5;
    const wickBottom = Math.round(lowY) + 0.5;

    context.globalAlpha = candle.tone === "up" ? 0.98 : 0.86;
    context.strokeStyle = candleWickColor(candle.tone);
    context.lineWidth = isDashboardChart ? 1.05 : 1.2;
    context.shadowBlur = 0;
    context.beginPath();
    context.moveTo(crispXCenter, wickTop);
    context.lineTo(crispXCenter, wickBottom);
    context.stroke();

    context.globalAlpha = 0.98;
    context.strokeStyle = candleEdgeColor(candle.tone);
    context.lineWidth = isDashboardChart ? 0.7 : 0.8;
    const halfWidth = candle.width / 2;
    const crispX = Math.round(x - halfWidth) + 0.5;
    const crispY = Math.round(bodyTop) + 0.5;
    const crispWidth = Math.max(2, Math.round(candle.width));
    const crispHeight = Math.max(isDashboardChart ? 4 : 3, Math.round(bodyHeight));
    context.fillStyle = candleBodyFill(context, candle.tone, crispX, crispY, crispHeight);
    context.shadowBlur = 0;
    roundRect(context, crispX, crispY, crispWidth, crispHeight, Math.min(isDashboardChart ? 1.4 : 1.7, crispWidth / 2));
    context.fill();
    context.stroke();

    context.globalAlpha = candle.tone === "up" ? 0.22 : 0.12;
    context.strokeStyle = candle.tone === "up" ? "rgba(185, 245, 223, 0.78)" : "rgba(244, 248, 252, 0.58)";
    context.lineWidth = 0.55;
    context.beginPath();
    context.moveTo(crispX + 1, crispY + 1);
    context.lineTo(crispX + crispWidth - 1, crispY + 1);
    context.stroke();
  });

  return strip;
}

function buildDashboardCandles(count: number): MarketCandle[] {
  const random = seededRandom(76123);
  const candles: MarketCandle[] = [];
  const anchors = [
    { at: 0, price: 262 },
    { at: 0.1, price: 286 },
    { at: 0.2, price: 326 },
    { at: 0.3, price: 319 },
    { at: 0.4, price: 360 },
    { at: 0.5, price: 332 },
    { at: 0.59, price: 286 },
    { at: 0.7, price: 307 },
    { at: 0.8, price: 300 },
    { at: 0.9, price: 346 },
    { at: 1, price: 262 },
  ];
  let previousClose = anchors[0].price;
  let previousMove = 0;

  for (let index = 0; index < count; index += 1) {
    const progress = index / Math.max(1, count - 1);
    const nextAnchorIndex = Math.max(1, anchors.findIndex((anchor) => progress <= anchor.at));
    const start = anchors[nextAnchorIndex - 1] ?? anchors[0];
    const end = anchors[nextAnchorIndex] ?? anchors[anchors.length - 1];
    const startIndex = Math.round(start.at * (count - 1));
    const endIndex = Math.max(startIndex + 1, Math.round(end.at * (count - 1)));
    const localProgress = clampNumber((index - startIndex) / Math.max(1, endIndex - startIndex), 0, 1);
    const target = start.price + (end.price - start.price) * localProgress;
    const open = previousClose;
    const slope = (end.price - start.price) / Math.max(1, endIndex - startIndex);
    const direction = Math.sign(slope || previousMove || 1);
    const bodyNoise = (random() + random() + random() - 1.5) * 6.8;
    const rhythm = Math.sin(progress * 42) * 3.4 + Math.sin(progress * 113) * 2.1;
    const impulse =
      index % 17 === 7 ? direction * (10 + random() * 12) :
      index % 24 === 11 ? -direction * (8 + random() * 11) :
      index % 39 === 22 ? direction * (14 + random() * 14) :
      0;
    const isSmallPause = index % 37 === 13;
    let move = isSmallPause
      ? (random() - 0.5) * 2.2
      : (target - open) * 0.28 + slope * 2.1 + previousMove * 0.1 + bodyNoise + rhythm + impulse;

    if (Math.abs(move) < 4.8 && !isSmallPause) {
      move = direction * (5.8 + random() * 7.6);
    }

    const close = index === count - 1 ? anchors[0].price : clampNumber(open + move, 238, 382);
    const body = Math.abs(close - open);
    const fullBody = body > 8;
    const wickBase = fullBody ? 3.2 : 4.8;
    const upperWick = wickBase + random() * (fullBody ? 12 : 16);
    const lowerWick = wickBase + random() * (fullBody ? 12 : 16);
    const tone: MarketCandleTone = close >= open ? "up" : "down";
    const width = body > 15 ? 10.4 : body > 8 ? 8.6 : isSmallPause ? 5.8 : 7.2;

    candles.push({
      close,
      high: Math.max(open, close) + upperWick,
      low: Math.min(open, close) - lowerWick,
      open,
      tone,
      width,
    });
    previousMove = close - open;
    previousClose = close;
  }

  return candles;
}

function buildMarketCandles(count: number): MarketCandle[] {
  const random = seededRandom(314159);
  const candles: MarketCandle[] = [];
  const initialPrice = 306;
  let previousClose = initialPrice;
  let previousMove = 0;
  const regimes = [
    { share: 0.08, drift: 1.6, volatility: 3.8, carry: 0.16 },
    { share: 0.1, drift: 3.2, volatility: 6.4, carry: 0.18 },
    { share: 0.09, drift: -2.6, volatility: 7.6, carry: 0.12 },
    { share: 0.08, drift: 0.9, volatility: 5.2, carry: 0.08 },
    { share: 0.1, drift: 4.5, volatility: 9.4, carry: 0.2 },
    { share: 0.12, drift: -5.2, volatility: 10.6, carry: 0.18 },
    { share: 0.09, drift: 2.3, volatility: 7.2, carry: 0.12 },
    { share: 0.1, drift: 5.4, volatility: 12.4, carry: 0.2 },
    { share: 0.1, drift: -3.8, volatility: 9.6, carry: 0.16 },
    { share: 0.08, drift: -5.8, volatility: 11.4, carry: 0.18 },
    { share: 0.06, drift: 4.1, volatility: 9.2, carry: 0.14 },
  ];
  const regimeStops = regimes.reduce<Array<{ end: number } & typeof regimes[number]>>((stops, regime, index) => {
    const previousEnd = stops[index - 1]?.end ?? 0;
    const isLast = index === regimes.length - 1;
    const end = isLast ? count : Math.max(previousEnd + 8, Math.round(previousEnd + count * regime.share));
    stops.push({ ...regime, end });
    return stops;
  }, []);

  for (let index = 0; index < count; index += 1) {
    const progress = index / Math.max(1, count - 1);
    const regime = regimeStops.find((stop) => index < stop.end) ?? regimeStops[regimeStops.length - 1];
    const remainingCandles = Math.max(1, count - index - 1);
    const open = previousClose;
    const direction = Math.sign(regime.drift || previousMove || 1);
    const noise = (random() + random() + random() + random() - 2) * regime.volatility;
    const wave = Math.sin(progress * 38) * regime.volatility * 0.46 + Math.sin(progress * 91) * regime.volatility * 0.26;
    const impulse =
      index % 21 === 6 ? direction * (8 + random() * 18) :
      index % 34 === 17 ? -direction * (7 + random() * 16) :
      index % 55 === 28 ? direction * (15 + random() * 23) :
      0;
    const isDoji = index % 61 === 19 || index % 89 === 41;
    let move = isDoji
      ? (random() - 0.5) * 1.1
      : regime.drift + noise + wave + previousMove * regime.carry + impulse;

    if (index > count - 42) {
      const loopPressure = (initialPrice - open) / remainingCandles;
      const taper = clampNumber(remainingCandles / 42, 0, 1);
      move = loopPressure * (1.12 - taper * 0.18) + noise * 0.42 * taper + Math.sin(index * 0.94) * 2.4 * taper;
    }

    if (open + move > 398) {
      move = -Math.abs(move) * 0.62 - 6 - random() * 9;
    } else if (open + move < 248) {
      move = Math.abs(move) * 0.62 + 6 + random() * 9;
    }

    let close = clampNumber(open + move, 240, 408);
    if (!isDoji && index < count - 10 && Math.abs(close - open) < 3.4) {
      close = clampNumber(open + direction * (3.8 + random() * 7.8), 240, 408);
    }
    if (index === count - 1) {
      close = initialPrice;
    }

    const body = Math.abs(close - open);
    const isFullBody = !isDoji && body > 5.2;
    const wickBase = isFullBody ? 0.7 : isDoji ? 2.2 : 1.2;
    const wickRange = isFullBody ? 3.8 : 6.5;
    const upperWick = wickBase + random() * wickRange + (index % 27 === 8 ? 3.8 * random() : 0);
    const lowerWick = wickBase + random() * wickRange + (index % 31 === 19 ? 4.3 * random() : 0);
    const high = Math.max(open, close) + upperWick;
    const low = Math.min(open, close) - lowerWick;
    const down = close < open;
    const strongPrint = body > 13.5 && (index % 3 !== 0 || Math.abs(impulse) > 0);
    const tone: MarketCandleTone = down ? "down" : "up";
    const width = strongPrint ? 11.2 : isFullBody ? 9.4 : isDoji ? 5.2 : 7.1;

    candles.push({ close, high, low, open, tone, width });
    previousMove = close - open;
    previousClose = close;
  }

  return candles;
}

function candleColor(tone: MarketCandleTone) {
  if (tone === "up") {
    return "rgba(24, 200, 135, 0.96)";
  }
  return "rgba(174, 186, 199, 0.82)";
}

function candleWickColor(tone: MarketCandleTone) {
  if (tone === "up") {
    return "rgba(24, 200, 135, 0.88)";
  }
  return "rgba(160, 174, 190, 0.72)";
}

function candleEdgeColor(tone: MarketCandleTone) {
  if (tone === "up") {
    return "rgba(185, 245, 223, 0.58)";
  }
  return "rgba(222, 231, 241, 0.34)";
}

function candleBodyFill(context: CanvasRenderingContext2D, tone: MarketCandleTone, x: number, y: number, height: number) {
  const gradient = context.createLinearGradient(x, y, x, y + Math.max(1, height));
  if (tone === "up") {
    gradient.addColorStop(0, "rgba(185, 245, 223, 0.98)");
    gradient.addColorStop(0.18, "rgba(24, 200, 135, 0.98)");
    gradient.addColorStop(1, "rgba(11, 122, 82, 0.94)");
    return gradient;
  }
  gradient.addColorStop(0, "rgba(230, 237, 246, 0.88)");
  gradient.addColorStop(0.22, "rgba(178, 191, 207, 0.84)");
  gradient.addColorStop(1, "rgba(112, 127, 146, 0.76)");
  return gradient;
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function Dashboard({ analysis, brokerStatus, rules, go }: { analysis: ReturnType<typeof analyze>; brokerStatus: BrokerStatus | null; rules: RiskRule[]; go: (section: Section) => void }) {
  const [range, setRange] = useState<TimeRange>(() => readDashboardRange());
  const [focus, setFocus] = useState<DashboardFocus>(() => readDashboardFocus());
  const scopedTrades = useMemo(() => filterTradesByRange(analysis.trades, range), [analysis.trades, range]);
  const scopedAnalysis = useMemo(() => analyze(scopedTrades, rules), [scopedTrades, rules]);
  const rangeLabel = range === "today" ? `Latest session, ${analysis.latestDate}` : range === "week" ? "Last 7 calendar days" : "All trades";
  const focusLabel = {
    health: "Account health",
    risk: "Risk controls",
    performance: "Performance",
    proof: "Shareable proof",
  }[focus];
  const reviewQuestions = focus === "performance" ? [
    {
      question: "Is the account growing?",
      answer: formatMoney(scopedAnalysis.totalPnl),
      detail: `${scopedAnalysis.trades.length} trade${scopedAnalysis.trades.length === 1 ? "" : "s"} in this view`,
      tone: scopedAnalysis.totalPnl >= 0 ? "text-emerald-300" : "text-red-300",
    },
    {
      question: "Are wins covering losses?",
      answer: Number.isFinite(scopedAnalysis.profitFactor) ? scopedAnalysis.profitFactor.toFixed(2) : "∞",
      detail: "Profit factor for the selected range",
      tone: scopedAnalysis.profitFactor >= 1.2 ? "text-emerald-300" : "text-amber-200",
    },
    {
      question: "What is my expectancy?",
      answer: `${scopedAnalysis.avgR.toFixed(2)}R`,
      detail: "Average realized R per trade",
      tone: scopedAnalysis.avgR >= 0 ? "text-[#18c887]" : "text-red-300",
    },
  ] : focus === "proof" ? [
    {
      question: "What can I share?",
      answer: `${scopedAnalysis.score}/100`,
      detail: scopedAnalysis.evidenceQuality.summary,
      tone: "text-[#18c887]",
    },
    {
      question: "How much evidence exists?",
      answer: scopedAnalysis.evidenceQuality.label,
      detail: `${scopedAnalysis.trades.length} trades checked`,
      tone: scopedAnalysis.evidenceQuality.level === "high" ? "text-emerald-300" : "text-amber-200",
    },
    {
      question: "Any warnings visible?",
      answer: String(scopedAnalysis.breaches.length),
      detail: scopedAnalysis.breaches.length ? "Warnings appear on the Passport" : "No active limit warnings",
      tone: scopedAnalysis.breaches.length ? "text-red-300" : "text-emerald-300",
    },
  ] : focus === "risk" ? [
    {
      question: "Am I following my limits?",
      answer: `${formatPercent(scopedAnalysis.compliance)} followed`,
      detail: scopedAnalysis.breaches.length ? `${scopedAnalysis.breaches.length} warning${scopedAnalysis.breaches.length === 1 ? "" : "s"} to review` : "No active limit warnings",
      tone: scopedAnalysis.breaches.length ? "text-red-300" : "text-emerald-300",
    },
    {
      question: "What is costing me money?",
      answer: formatMoney(-scopedAnalysis.maxDrawdown),
      detail: "Largest drawdown in this view",
      tone: scopedAnalysis.maxDrawdown > 0 ? "text-red-300" : "text-white",
    },
    {
      question: "How often am I warned?",
      answer: String(scopedAnalysis.breaches.length),
      detail: scopedAnalysis.breaches.length ? "Active rule warnings in this view" : "No active limit warnings",
      tone: scopedAnalysis.breaches.length ? "text-red-300" : "text-emerald-300",
    },
  ] : [
    {
      question: "Am I following my limits?",
      answer: `${formatPercent(scopedAnalysis.compliance)} followed`,
      detail: scopedAnalysis.breaches.length ? `${scopedAnalysis.breaches.length} warning${scopedAnalysis.breaches.length === 1 ? "" : "s"} to review` : "No active limit warnings",
      tone: scopedAnalysis.breaches.length ? "text-red-300" : "text-emerald-300",
    },
    {
      question: "What can I show as proof?",
      answer: `${scopedAnalysis.score}/100`,
      detail: "Current Cova risk score",
      tone: "text-[#18c887]",
    },
    {
      question: "Is the account growing?",
      answer: formatMoney(scopedAnalysis.totalPnl),
      detail: `${scopedAnalysis.trades.length} trade${scopedAnalysis.trades.length === 1 ? "" : "s"} in this view`,
      tone: scopedAnalysis.totalPnl >= 0 ? "text-emerald-300" : "text-red-300",
    },
  ];

  useEffect(() => {
    try {
      localStorage.setItem(DASHBOARD_RANGE_KEY, range);
    } catch {
      // Ignore storage failures; the dashboard still works for the current session.
    }
  }, [range]);

  useEffect(() => {
    try {
      localStorage.setItem(DASHBOARD_FOCUS_KEY, focus);
    } catch {
      // Ignore storage failures; the dashboard still works for the current session.
    }
  }, [focus]);

  return (
    <SectionShell
      eyebrow="Review"
      title="Review account risk."
      variant="workspace"
      action={<GlassButton onClick={() => go("rules")}>Adjust Limits <ArrowUpRight className="h-4 w-4" /></GlassButton>}
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" />}
    >
      <DashboardCommandCenter
        analysis={scopedAnalysis}
        brokerStatus={brokerStatus}
        focus={focus}
        go={go}
        range={range}
        rangeLabel={rangeLabel}
        setFocus={setFocus}
        setRange={setRange}
      />
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {reviewQuestions.map((item, index) => (
          <motion.div
            className="liquid-glass motion-surface rounded-[30px] p-5"
            key={item.question}
            initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, margin: "-80px" }}
            whileHover={{ y: -3 }}
            transition={{ delay: index * 0.05, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="font-body text-sm text-white/52">{item.question}</p>
            <p className={`mt-3 font-mono text-3xl ${item.tone}`}>{item.answer}</p>
            <p className="mt-2 font-body text-sm text-white/42">{item.detail}</p>
          </motion.div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.55fr_0.85fr]">
        <motion.div
          className="liquid-glass-strong motion-surface rounded-[36px] p-5 md:p-8"
          initial={{ opacity: 0, y: 22, filter: "blur(8px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-80px" }}
          whileHover={{ y: -2 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center justify-between gap-5">
            <div>
              <p className="font-body text-xs uppercase tracking-[0.26em] text-[#18c887]">Account path</p>
              <h3 className="mt-2 font-body text-2xl font-medium">{focusLabel}</h3>
            </div>
            <span className="liquid-glass rounded-full px-4 py-2 font-body text-sm text-white/70">{scopedAnalysis.trades.length} trades</span>
          </div>
          <EquityCurve points={scopedAnalysis.equityPoints.map((point) => point.value)} />
          <MetricDock analysis={scopedAnalysis} />
        </motion.div>

        <div className="grid gap-6">
          <ScoreCard analysis={scopedAnalysis} />
          <FlagStack analysis={scopedAnalysis} />
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SetupQuality analysis={scopedAnalysis} />
        <MarketExposure analysis={scopedAnalysis} />
      </div>
      <NextSessionBriefCard analysis={scopedAnalysis} go={go} />
      <ScoreExplanationStrip analysis={scopedAnalysis} />
    </SectionShell>
  );
}

function DashboardCommandCenter({
  analysis,
  brokerStatus,
  focus,
  go,
  range,
  rangeLabel,
  setFocus,
  setRange,
}: {
  analysis: ReturnType<typeof analyze>;
  brokerStatus: BrokerStatus | null;
  focus: DashboardFocus;
  go: (section: Section) => void;
  range: TimeRange;
  rangeLabel: string;
  setFocus: (focus: DashboardFocus) => void;
  setRange: (range: TimeRange) => void;
}) {
  const connected = Boolean(brokerStatus?.connected);
  const provider = brokerStatus?.provider || "Trade history";
  const updated = brokerStatus?.updatedAt
    ? new Date(brokerStatus.updatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Not connected";
  const sourceLabel = connected ? `${provider} linked` : analysis.trades.length ? "CSV/demo review" : "No trade history";
  const sourceDetail = connected
    ? "Read-only history is connected. Cova can review behavior, but cannot place trades or move money."
    : analysis.trades.length
      ? "These stats come from uploaded or demo trades. Link an account when you want cleaner source tracking."
      : "Link a prop account or upload a CSV before trusting any score.";
  const ranges: { id: TimeRange; label: string }[] = [
    { id: "today", label: "Latest" },
    { id: "week", label: "Week" },
    { id: "all", label: "All" },
  ];
  const options: {
    id: DashboardFocus;
    label: string;
    metric: string;
    summary: string;
    target: Section;
  }[] = [
    {
      id: "health",
      label: "Health",
      metric: `${analysis.score}/100`,
      summary: "Fast read on whether the account is clean enough to keep trading.",
      target: "dashboard",
    },
    {
      id: "risk",
      label: "Risk",
      metric: `${analysis.breaches.length} warnings`,
      summary: "Daily loss, drawdown, sizing, and rule pressure before the next session.",
      target: "rules",
    },
    {
      id: "performance",
      label: "Performance",
      metric: Number.isFinite(analysis.profitFactor) ? `${analysis.profitFactor.toFixed(2)} PF` : "∞ PF",
      summary: "P&L movement, profit factor, average R, and recent improvement.",
      target: "dashboard",
    },
    {
      id: "proof",
      label: "Proof",
      metric: analysis.evidenceQuality.label,
      summary: "What a coach, prop firm, or accountability partner can understand quickly.",
      target: "passport",
    },
  ];
  const active = options.find((option) => option.id === focus) ?? options[0];
  const quickMetrics = [
    ["P&L", formatMoney(analysis.totalPnl), analysis.totalPnl >= 0 ? "text-emerald-300" : "text-red-300"],
    ["Biggest dip", formatMoney(-analysis.maxDrawdown), analysis.maxDrawdown > 0 ? "text-red-300" : "text-white"],
    ["Warnings", String(analysis.breaches.length), analysis.breaches.length ? "text-red-300" : "text-emerald-300"],
  ];
  const sourceReady = connected || analysis.trades.length > 0;
  const limitsClean = analysis.ruleStatuses.length > 0 && analysis.breaches.length === 0;
  const reviewReady = analysis.trades.length > 0;
  const passportReady = reviewReady && analysis.evidenceQuality.level === "high" && analysis.breaches.length === 0;
  const nextAction = !sourceReady
    ? {
      label: "Link trade history",
      helper: "Start with a prop account sign-in or a CSV export.",
      target: "import" as Section,
    }
    : analysis.breaches.length
      ? {
        label: "Fix active warnings",
        helper: `${analysis.breaches.length} limit warning${analysis.breaches.length === 1 ? "" : "s"} should be reviewed before the next session.`,
        target: "rules" as Section,
      }
      : analysis.evidenceQuality.level !== "high"
        ? {
          label: "Add more trades",
          helper: `${analysis.evidenceQuality.label}: Cova can review this, but more history makes the proof stronger.`,
          target: "import" as Section,
        }
        : {
          label: "Open Risk Passport",
          helper: "The account has enough clean evidence to show someone else.",
          target: "passport" as Section,
        };
  const setupSteps = [
    {
      label: "Source",
      status: sourceReady ? sourceLabel : "Missing",
      detail: sourceReady ? "Trade history is available for review." : "Link an account or upload a CSV.",
      action: sourceReady ? "Manage" : "Link",
      target: "import" as Section,
      ready: sourceReady,
    },
    {
      label: "Limits",
      status: analysis.ruleStatuses.length ? `${formatPercent(analysis.compliance)} followed` : "Not set",
      detail: analysis.breaches.length ? `${analysis.breaches.length} active warning${analysis.breaches.length === 1 ? "" : "s"}.` : "Daily loss, size, and streak checks are active.",
      action: "Adjust",
      target: "rules" as Section,
      ready: limitsClean,
    },
    {
      label: "Review",
      status: reviewReady ? analysis.nextSessionBrief.status : "Waiting",
      detail: reviewReady ? analysis.nextSessionBrief.headline : "Cova needs trades before it can coach.",
      action: "Insights",
      target: "coach" as Section,
      ready: reviewReady && analysis.nextSessionBrief.status === "ready",
    },
    {
      label: "Passport",
      status: passportReady ? "Ready" : analysis.evidenceQuality.label,
      detail: passportReady ? "Shareable proof is clean." : analysis.evidenceQuality.summary,
      action: "View",
      target: "passport" as Section,
      ready: passportReady,
    },
  ];

  return (
    <motion.section
      className="liquid-glass-strong mb-6 overflow-hidden rounded-[38px] p-4 md:p-5"
      initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="grid gap-4 xl:grid-cols-[0.84fr_1.2fr_0.96fr] xl:items-stretch">
        <div className="rounded-[30px] border border-white/10 bg-black/24 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-body text-xs ${connected ? "border-emerald-300/24 bg-emerald-400/10 text-emerald-200" : "border-white/12 bg-white/[0.035] text-white/52"}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-300" : "bg-white/30"}`} />
              {connected ? "Connected" : "Not linked"}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-white/34">{updated}</span>
          </div>
          <h3 className="mt-4 font-body text-2xl font-semibold leading-[1.02] tracking-[-0.035em] text-white md:text-3xl">
            {sourceLabel}
          </h3>
          <p className="mt-3 max-w-xl font-body text-sm font-light leading-relaxed text-white/56">{sourceDetail}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <GlassButton strong onClick={() => go("import")}>
              {connected ? "Manage link" : "Link account"} <ArrowUpRight className="h-4 w-4" />
            </GlassButton>
            <GlassButton onClick={() => go("passport")}>Passport</GlassButton>
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-black/18 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <p className="font-body text-xs uppercase tracking-[0.18em] text-[#18c887]">Review mode</p>
              <p className="mt-1 font-body text-sm text-white/46">{active.summary}</p>
            </div>
            <button
              className="inline-flex items-center gap-2 font-body text-sm font-medium text-[#b9f5df] transition hover:text-white"
              onClick={() => go(active.target)}
              type="button"
            >
              Open <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {options.map((option) => {
              const selected = option.id === focus;
              return (
                <button
                  className={`rounded-[22px] border px-4 py-3 text-left transition ${selected ? "border-[#18c887]/38 bg-[#18c887]/10 shadow-[0_18px_60px_rgba(24,200,135,0.08)]" : "border-white/10 bg-black/18 hover:border-white/20 hover:bg-white/[0.035]"}`}
                  key={option.id}
                  onClick={() => setFocus(option.id)}
                  type="button"
                >
                  <span className={`font-body text-sm font-medium ${selected ? "text-white" : "text-white/62"}`}>{option.label}</span>
                  <span className={`mt-2 block font-mono text-xs ${selected ? "text-[#b9f5df]" : "text-white/36"}`}>{option.metric}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-black/24 p-5">
          <p className="font-body text-xs uppercase tracking-[0.18em] text-[#18c887]">Time period</p>
          <p className="mt-1 font-body text-sm text-white/55">{rangeLabel}</p>
          <div className="terminal-tab-bar mt-4 inline-grid w-full grid-cols-3">
            {ranges.map((item) => {
              const activeRange = range === item.id;
              return (
                <button
                  className={`terminal-tab px-4 py-2 font-body text-sm ${activeRange ? "terminal-tab-active" : ""}`}
                  key={item.id}
                  onClick={() => setRange(item.id)}
                  type="button"
                >
                  {activeRange && (
                    <motion.span
                      className="terminal-tab-motion"
                      layoutId="range-tab-active"
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                  <span className="terminal-tab-copy">{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid gap-2">
            {quickMetrics.map(([metric, value, tone]) => (
              <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.025] px-4 py-3" key={metric}>
                <span className="font-body text-sm text-white/52">{metric}</span>
                <strong className={`font-mono text-lg ${tone}`}>{value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[0.64fr_1.36fr]">
        <button
          className="group rounded-[28px] border border-[#18c887]/18 bg-[#18c887]/[0.055] p-5 text-left transition hover:border-[#b9f5df]/34 hover:bg-[#18c887]/[0.075]"
          onClick={() => go(nextAction.target)}
          type="button"
        >
          <p className="font-body text-xs uppercase tracking-[0.18em] text-[#b9f5df]/78">Next best action</p>
          <div className="mt-3 flex items-center justify-between gap-4">
            <h3 className="font-body text-xl font-semibold tracking-[-0.025em] text-white">{nextAction.label}</h3>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-[#b9f5df] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          <p className="mt-2 font-body text-sm font-light leading-relaxed text-white/52">{nextAction.helper}</p>
        </button>

        <div className="grid gap-2 md:grid-cols-4">
          {setupSteps.map((step) => (
            <button
              className={`rounded-[24px] border p-4 text-left transition ${step.ready ? "border-emerald-300/18 bg-emerald-400/[0.045] hover:border-emerald-200/28" : "border-white/10 bg-black/20 hover:border-white/18 hover:bg-white/[0.028]"}`}
              key={step.label}
              onClick={() => go(step.target)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-body text-xs uppercase tracking-[0.18em] text-white/34">{step.label}</span>
                <span className={`grid h-6 w-6 place-items-center rounded-full border ${step.ready ? "border-emerald-300/28 bg-emerald-300/10 text-emerald-200" : "border-white/10 bg-white/[0.025] text-white/34"}`}>
                  {step.ready ? <Check className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}
                </span>
              </div>
              <p className="mt-3 truncate font-body text-sm font-semibold text-white">{step.status}</p>
              <p className="mt-1 line-clamp-2 min-h-9 font-body text-xs leading-relaxed text-white/42">{step.detail}</p>
              <span className="mt-3 inline-flex font-body text-xs font-medium text-[#b9f5df]/82">{step.action}</span>
            </button>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

function ScoreExplanationStrip({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  const factors = analysis.scoreFactors.slice(0, 4);
  const topFlag = analysis.behaviorFlags.find((flag) => flag.severity === "critical" || flag.severity === "warning") ?? analysis.behaviorFlags[0];
  const toneForImpact = {
    positive: {
      label: "Helping",
      className: "border-emerald-300/20 bg-emerald-400/10 text-emerald-200",
      dot: "bg-emerald-300",
    },
    negative: {
      label: "Hurting",
      className: "border-red-300/18 bg-red-500/8 text-red-200",
      dot: "bg-red-300",
    },
    neutral: {
      label: "Context",
      className: "border-white/10 bg-white/[0.028] text-white/58",
      dot: "bg-white/34",
    },
  } satisfies Record<"positive" | "negative" | "neutral", { className: string; dot: string; label: string }>;

  return (
    <motion.section
      className="liquid-glass mb-6 rounded-[34px] p-4 md:p-5"
      initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="grid gap-5 xl:grid-cols-[0.74fr_1.26fr] xl:items-stretch">
        <div className="rounded-[28px] border border-white/10 bg-black/24 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#18c887]/20 bg-[#18c887]/10 px-3 py-1.5 font-body text-xs text-[#b9f5df]">
              <CircleDot className="h-3.5 w-3.5" />
              Score logic
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-white/36">
              {analysis.evidenceQuality.label}
            </span>
          </div>
          <h3 className="mt-4 font-body text-3xl font-semibold leading-[1.02] tracking-[-0.04em] text-white">
            Why Cova scored this {analysis.score}/100.
          </h3>
          <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/56">
            Cova weighs limit discipline, recent R, drawdown, and sample quality. It is a review system, not a signal.
          </p>
          {topFlag && (
            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.025] p-4">
              <p className="font-body text-xs uppercase tracking-[0.18em] text-white/34">Most useful note</p>
              <p className="mt-2 font-body text-sm font-medium text-white/80">{topFlag.label}</p>
              <p className="mt-1 font-body text-xs leading-relaxed text-white/46">{topFlag.summary}</p>
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {factors.map((factor, index) => {
            const tone = toneForImpact[factor.impact];
            return (
              <motion.div
                className={`rounded-[26px] border p-4 ${tone.className}`}
                key={`${factor.label}-${index}`}
                initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ delay: index * 0.045, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-body text-xs uppercase tracking-[0.18em] opacity-75">{tone.label}</span>
                  <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                </div>
                <p className="mt-4 font-body text-base font-semibold text-white">{factor.label}</p>
                <p className="mt-2 font-body text-sm leading-relaxed text-white/58">{factor.summary}</p>
                <p className="mt-4 border-t border-white/10 pt-3 font-mono text-[11px] leading-relaxed text-white/38">{factor.evidence}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}

function NextSessionBriefCard({ analysis, go }: { analysis: ReturnType<typeof analyze>; go: (section: Section) => void }) {
  const brief = analysis.nextSessionBrief;
  const config = {
    locked: {
      icon: LockKeyhole,
      label: "Pause",
      tone: "border-red-300/22 bg-red-500/8 text-red-200",
      dot: "bg-red-300",
    },
    caution: {
      icon: Gauge,
      label: "Caution",
      tone: "border-amber-200/20 bg-amber-300/8 text-amber-100",
      dot: "bg-amber-200",
    },
    ready: {
      icon: ShieldCheck,
      label: "Ready",
      tone: "border-emerald-300/22 bg-emerald-400/10 text-emerald-200",
      dot: "bg-emerald-300",
    },
  }[brief.status];
  const Icon = config.icon;

  return (
    <motion.article
      className="liquid-glass-strong motion-surface mb-6 rounded-[36px] p-5 md:p-7"
      initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-body text-xs ${config.tone}`}>
              <span className={`h-2 w-2 rounded-full ${config.dot}`} />
              {config.label}
            </span>
            <span className="font-body text-xs uppercase tracking-[0.22em] text-[#b9f5df]">Next session brief</span>
          </div>
          <h3 className="mt-5 max-w-2xl font-heading text-4xl italic leading-[1.02] tracking-normal md:text-5xl">
            {brief.headline}
          </h3>
          <p className="mt-4 max-w-2xl font-body font-light leading-relaxed text-white/62">
            {brief.summary}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <GlassButton strong onClick={() => go("coach")}>Open insights <ArrowUpRight className="h-4 w-4" /></GlassButton>
            <GlassButton onClick={() => go("rules")}>Review limits</GlassButton>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-[28px] border border-white/10 bg-black/24 p-4">
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-[#18c887]" />
              <p className="font-body text-xs uppercase tracking-[0.22em] text-white/42">Watch first</p>
            </div>
            <div className="mt-4 space-y-2">
              {brief.watchlist.slice(0, 3).map((item) => (
                <p className="rounded-[18px] border border-white/8 bg-white/[0.025] px-3 py-2 font-body text-sm text-white/68" key={item}>{item}</p>
              ))}
            </div>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-black/24 p-4">
            <p className="font-body text-xs uppercase tracking-[0.22em] text-white/42">Evidence</p>
            <div className="mt-4 space-y-2">
              {brief.evidence.slice(0, 3).map((item) => (
                <p className="font-mono text-xs leading-relaxed text-white/48" key={item}>{item}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function ImportDesk({ entitlements, importCsv, openFirmOAuth, status, reset, upgradeToPro }: { entitlements: Entitlements; importCsv: (text: string, mode?: ImportMode) => void; openFirmOAuth: (firm: PropFirmId) => void; status: string; reset: () => void; upgradeToPro: () => void }) {
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
            <div
              className={`liquid-glass-strong rounded-[36px] p-8 transition ${dragActive ? "scale-[1.01] border-[#18c887]/60" : ""}`}
              data-csv-import
              onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => { event.preventDefault(); setDragActive(false); void readFile(event.dataTransfer.files[0]); }}
            >
              <Upload className="h-10 w-10 text-[#18c887]" />
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <h3 className="font-heading text-5xl italic leading-[1.02] tracking-normal">Upload a trade export.</h3>
                <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 font-body text-xs text-white/52">
                  {entitlements.plan === "free" ? `${entitlements.maxTradesPerImport} trade free limit` : "Unlimited imports"}
                </span>
              </div>
              <p className="mt-5 max-w-md font-body font-light leading-relaxed text-white/60">
                Use this when direct sign-in is not available yet. Drop in the file your prop dashboard
                already exports and Cova turns it into a clean risk review.
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
                <GlassButton strong onClick={() => importCsv(text, mode)}>Upload Trades</GlassButton>
                <GlassButton onClick={reset}>Reset Demo</GlassButton>
                {entitlements.plan === "free" && <GlassButton onClick={upgradeToPro}>Unlock Pro</GlassButton>}
              </div>
              <p className="mt-6 font-body text-sm text-white/50">{fileName || status}</p>
            </div>

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

function OAuthConnectPage({ firmId, onApprove, onCancel }: { firmId: PropFirmId; onApprove: (firm: PropFirmId) => void; onCancel: () => void }) {
  const firm = getPropFirm(firmId);
  type OAuthStep = "handoff" | "provider" | "consent";
  const devProviderPreview = isLocalPreview() && firm.id !== "other";
  const hasConfiguredProvider = canRedirectToFirmProvider(firm.id);
  const shouldRedirectToProvider = hasConfiguredProvider && !devProviderPreview;
  const [step, setStep] = useState<OAuthStep>(() => devProviderPreview ? "provider" : "handoff");
  const [accountEmail, setAccountEmail] = useState("trader@cova.local");
  const maskedAccount = accountEmail.trim() || "your trading account";
  const providerHost = getFirmProviderHost(firm.id);
  const stepCopy: Record<OAuthStep, { body: string; eyebrow: string; title: string }> = {
    handoff: {
      eyebrow: shouldRedirectToProvider ? "OAuth redirect ready" : "Local provider preview",
      title: `Connect ${firm.name}.`,
      body: shouldRedirectToProvider
        ? `Cova will send you to ${providerHost} for read-only approval. You return here once the provider confirms access.`
        : `This dev server opens a safe ${firm.name} sign-in simulation before consent. Cova never asks for real broker passwords.`,
    },
    provider: {
      eyebrow: `${firm.name} sign-in`,
      title: `Sign in at ${firm.name}.`,
      body: `This is the provider side of the handoff. In production this screen lives at ${providerHost}, not inside Cova.`,
    },
    consent: {
      eyebrow: "Read-only approval",
      title: "Approve account history.",
      body: `Cova is requesting permission to read trade history from ${maskedAccount}. It cannot place trades or change the account.`,
    },
  };
  const stepItems: { id: OAuthStep; label: string }[] = [
    { id: "handoff", label: "Handoff" },
    { id: "provider", label: "Sign in" },
    { id: "consent", label: "Approve" },
  ];

  function continueToProvider(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shouldRedirectToProvider) {
      window.location.assign(buildFirmConnectUrl(firm.id));
      return;
    }
    setStep("provider");
  }

  function submitProviderSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStep("consent");
  }

  return (
    <section className="relative min-h-screen overflow-hidden px-5 pb-24 pt-36 md:px-12 lg:px-20">
      <ImageAtmosphere src="/media/cova-dashboard-plate.jpg" align="right" opacity="opacity-[0.28]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_28%,rgba(24,200,135,0.14),transparent_32%),linear-gradient(180deg,rgba(0,0,0,0.18),#000_92%)]" />
      <div className="relative z-10 mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.86fr_1.14fr] lg:items-stretch">
        <motion.div
          className="liquid-glass-strong overflow-hidden rounded-[42px] p-5 md:p-6"
          initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="relative min-h-[560px] overflow-hidden rounded-[34px] border border-white/10 bg-black/54 p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_26%_12%,rgba(24,200,135,0.16),transparent_34%),radial-gradient(circle_at_82%_74%,rgba(255,255,255,0.08),transparent_34%)]" />
            <div className="absolute inset-x-8 top-8 h-px bg-gradient-to-r from-transparent via-[#b9f5df]/40 to-transparent" />
            <div className="relative z-10 flex min-h-[506px] flex-col justify-between">
              <div>
                <span className="inline-flex rounded-full border border-[#18c887]/24 bg-[#18c887]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#b9f5df]">
                  {stepCopy[step].eyebrow}
                </span>
                <h2 className="mt-8 font-body text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-white md:text-6xl">
                  {stepCopy[step].title}
                </h2>
                <p className="mt-5 max-w-md font-body text-base font-light leading-relaxed text-white/58">
                  {stepCopy[step].body}
                </p>
              </div>

              <div className="grid gap-3">
                <div className="rounded-[26px] border border-white/10 bg-black/36 p-4">
                  <p className="font-body text-xs uppercase tracking-[0.18em] text-white/36">Provider</p>
                  <p className="mt-2 font-body text-lg font-medium text-white">{firm.name}</p>
                  <p className="mt-1 font-body text-sm text-white/46">{firm.platforms}</p>
                </div>
                <div className="rounded-[26px] border border-[#18c887]/16 bg-[#18c887]/[0.055] p-4">
                  <p className="font-body text-xs uppercase tracking-[0.18em] text-[#b9f5df]/70">Access level</p>
                  <p className="mt-2 font-body text-lg font-medium text-white">Read-only trade history</p>
                  <p className="mt-1 font-body text-sm text-white/46">No orders, no withdrawals, no password storage.</p>
                </div>
                <div className="rounded-[26px] border border-white/10 bg-black/28 p-4">
                  <p className="font-body text-xs uppercase tracking-[0.18em] text-white/36">Step</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {stepItems.map(({ id, label }) => (
                      <span
                        className={`rounded-full border px-3 py-2 text-center font-body text-xs ${step === id ? "border-[#18c887]/30 bg-[#18c887]/12 text-[#b9f5df]" : "border-white/10 bg-white/[0.02] text-white/36"}`}
                        key={id}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="liquid-glass rounded-[42px] p-6 md:p-8"
          initial={{ opacity: 0, x: 28, filter: "blur(10px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.58, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
        >
          <AnimatePresence mode="wait">
            {step === "handoff" ? (
              <motion.div
                key="oauth-handoff"
                initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -12, filter: "blur(8px)" }}
                transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="font-body text-xs uppercase tracking-[0.24em] text-[#18c887]">{firm.name} secure handoff</p>
                <h3 className="mt-3 max-w-xl font-body text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-white md:text-5xl">
                  Leave Cova, sign in there, return approved.
                </h3>
                <p className="mt-5 max-w-2xl font-body text-sm font-light leading-relaxed text-white/56">
                  This preview mirrors the secure account-link flow Cova will use with supported firms. The production version redirects to the provider, then returns with a read-only history approval.
                </p>

                <form className="mt-8 grid gap-4" onSubmit={continueToProvider}>
                  <label className="grid gap-2">
                    <span className="font-body text-xs uppercase tracking-[0.16em] text-white/44">Account email or label for this preview</span>
                    <input
                      className="rounded-[22px] border border-white/10 bg-black/34 px-5 py-4 font-body text-sm text-white outline-none transition placeholder:text-white/26 focus:border-[#18c887]/48"
                      value={accountEmail}
                      onChange={(event) => setAccountEmail(event.target.value)}
                      placeholder="trader@example.com"
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      ["1", "Leave Cova", `Open ${providerHost}.`],
                      ["2", "Sign in there", "Use the firm login screen."],
                      ["3", "Return approved", "Cova receives read-only history access."],
                    ].map(([number, label, body]) => (
                      <div className="rounded-[22px] border border-white/10 bg-white/[0.025] p-4" key={label}>
                        <span className="font-mono text-xs text-[#18c887]">0{number}</span>
                        <p className="mt-2 font-body text-sm font-medium text-white/82">{label}</p>
                        <p className="mt-1 font-body text-xs leading-relaxed text-white/44">{body}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-[24px] border border-[#18c887]/16 bg-[#18c887]/[0.055] p-5">
                    <div className="flex items-start gap-3">
                      <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#b9f5df]" />
                      <p className="font-body text-sm font-medium leading-relaxed text-white/78">
                        Cova should never ask for your broker or prop-firm password. {shouldRedirectToProvider ? "This button will use the configured connector URL." : "This local preview opens a provider sign-in simulation before approval."}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <motion.button
                      className="cova-button cova-button-primary inline-flex items-center gap-2 whitespace-nowrap rounded-full px-6 py-3 font-body text-sm font-medium"
                      type="submit"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.985 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    >
                      Continue to provider <ArrowUpRight className="h-4 w-4" />
                    </motion.button>
                    <GlassButton onClick={onCancel}>Back to Link account</GlassButton>
                  </div>
                </form>
              </motion.div>
            ) : step === "provider" ? (
              <motion.div
                key="oauth-provider"
                initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -12, filter: "blur(8px)" }}
                transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="relative overflow-hidden rounded-[34px] border border-white/10 bg-black/42 p-5 md:p-7">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_76%_16%,rgba(24,200,135,0.12),transparent_28%),radial-gradient(circle_at_20%_86%,rgba(255,255,255,0.07),transparent_26%)]" />
                  <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
                    <div>
                      <p className="font-body text-xs uppercase tracking-[0.24em] text-[#18c887]">Provider sign-in simulation</p>
                      <h3 className="mt-3 font-body text-3xl font-semibold tracking-[-0.035em] text-white md:text-4xl">{firm.name}</h3>
                    </div>
                    <span className="rounded-full border border-[#18c887]/20 bg-[#18c887]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#b9f5df]">
                      Read-only request
                    </span>
                  </div>

                  <div className="relative mt-7 grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                    <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-body text-xs uppercase tracking-[0.18em] text-white/38">You are signing into</p>
                          <p className="mt-2 font-body text-2xl font-semibold tracking-[-0.03em] text-white">{firm.name}</p>
                        </div>
                        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#18c887]/20 bg-[#18c887]/10">
                          <LockKeyhole className="h-5 w-5 text-[#b9f5df]" />
                        </div>
                      </div>
                      <div className="mt-6 space-y-3">
                        {[
                          ["Domain", providerHost],
                          ["Permission", "Read trade history"],
                          ["Trading access", "Blocked"],
                          ["Return", "Cova dashboard"],
                        ].map(([label, body]) => (
                          <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-3" key={label}>
                            <span className="font-body text-xs uppercase tracking-[0.16em] text-white/34">{label}</span>
                            <span className="text-right font-body text-sm text-white/72">{body}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <form className="grid gap-4" onSubmit={submitProviderSignIn}>
                      <label className="grid gap-2">
                        <span className="font-body text-xs uppercase tracking-[0.16em] text-white/44">Provider account</span>
                        <input
                          className="rounded-[22px] border border-white/10 bg-white/[0.035] px-5 py-4 font-body text-sm text-white outline-none transition placeholder:text-white/26 focus:border-[#18c887]/48"
                          value={accountEmail}
                          onChange={(event) => setAccountEmail(event.target.value)}
                          placeholder="trader@example.com"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="font-body text-xs uppercase tracking-[0.16em] text-white/44">Authentication</span>
                        <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.035] px-5 py-4 font-body text-sm text-white/62">
                          <UserRound className="h-4 w-4 text-[#18c887]" />
                          Handled by the provider in production
                        </div>
                      </label>

                      <div className="rounded-[24px] border border-amber-200/14 bg-amber-300/[0.055] p-5">
                        <div className="flex items-start gap-3">
                          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-100" />
                          <p className="font-body text-sm font-medium leading-relaxed text-white/76">
                            Do not enter real firm credentials in this preview. Real OAuth happens on the provider domain and returns a read-only approval to Cova.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3 pt-2">
                        <motion.button
                          className="cova-button cova-button-primary inline-flex items-center gap-2 whitespace-nowrap rounded-full px-6 py-3 font-body text-sm font-medium"
                          type="submit"
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.985 }}
                          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        >
                          Sign in and continue <ArrowUpRight className="h-4 w-4" />
                        </motion.button>
                        <GlassButton onClick={() => setStep("handoff")}>Back to Cova handoff</GlassButton>
                        <GlassButton onClick={onCancel}>Cancel</GlassButton>
                      </div>
                    </form>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="oauth-consent"
                initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -12, filter: "blur(8px)" }}
                transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="font-body text-xs uppercase tracking-[0.24em] text-[#18c887]">Cova is requesting access</p>
                <h3 className="mt-3 max-w-xl font-body text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-white md:text-5xl">
                  Approve account history for risk review.
                </h3>
                <p className="mt-5 max-w-2xl font-body text-sm font-light leading-relaxed text-white/56">
                  Review the exact permissions before linking the account. Approval unlocks connected-account stats for this workspace.
                </p>

                <div className="mt-8 grid gap-3">
                  {[
                    ["Account identity", "Labels which funded account the history belongs to."],
                    ["Trades, fills, and statements", "Builds your review dashboard, journal stats, and Risk Passport."],
                    ["Performance summary", "Calculates risk score, drawdown, profit factor, and limits followed."],
                    ["Revocation path", "In production, the trader can revoke access from the provider account."],
                  ].map(([label, body]) => (
                    <div className="flex gap-3 rounded-[22px] border border-white/10 bg-white/[0.025] p-4" key={label}>
                      <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#18c887]" />
                      <div>
                        <p className="font-body text-sm font-medium text-white/82">{label}</p>
                        <p className="mt-1 font-body text-xs leading-relaxed text-white/44">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-[24px] border border-white/10 bg-black/28 p-5">
                  <div className="flex items-start gap-3">
                    <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-white/58" />
                    <p className="font-body text-sm font-medium leading-relaxed text-white/78">
                      Cova cannot place trades, change settings, withdraw funds, or view your broker password.
                    </p>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  <GlassButton strong onClick={() => onApprove(firm.id)}>
                    Approve read-only access <ArrowUpRight className="h-4 w-4" />
                  </GlassButton>
                  <GlassButton onClick={() => setStep("provider")}>Back to sign in</GlassButton>
                  <GlassButton onClick={onCancel}>Back to Link account</GlassButton>
                </div>
                <p className="mt-5 font-body text-xs leading-relaxed text-white/38">
                  Preview note: live OAuth still requires provider approval, redirect URLs, client credentials, secure token storage, and a backend sync job.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}

function BrokerConnectPanel({
  brokerBusy,
  brokerNotice,
  brokerStatus,
  checkTradovateStatus,
  connectProjectX,
  entitlements,
  openFirmOAuth,
  projectXBusy,
  projectXSyncBusy,
  selectedFirmId,
  setBrokerNotice,
  setSelectedFirmId,
  startTradovateConnect,
  syncBusy,
  syncProjectX,
  syncTradovate,
  upgradeToPro,
}: {
  brokerBusy: boolean;
  brokerNotice: string;
  brokerStatus: BrokerStatus | null;
  checkTradovateStatus: () => void;
  connectProjectX: (credentials: ProjectXCredentials) => Promise<void> | void;
  entitlements: Entitlements;
  openFirmOAuth: (firm: PropFirmId) => void;
  projectXBusy: boolean;
  projectXSyncBusy: boolean;
  selectedFirmId: PropFirmId;
  setBrokerNotice: (notice: string) => void;
  setSelectedFirmId: (firm: PropFirmId) => void;
  startTradovateConnect: () => void;
  syncBusy: boolean;
  syncProjectX: () => Promise<void> | void;
  syncTradovate: () => void;
  upgradeToPro: () => void;
}) {
  const connected = Boolean(brokerStatus?.connected);
  const updated = brokerStatus?.updatedAt ? new Date(brokerStatus.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "not checked";
  const selectedFirm = propFirmOptions.find((firm) => firm.id === selectedFirmId) ?? propFirmOptions[0];
  const isTopstepX = selectedFirm.id === "topstepx";
  const selectedProviderName = isTopstepX ? "TopstepX" : selectedFirm.name;
  const selectedConnected = connected && brokerStatus?.provider === selectedProviderName;
  const [projectXCredentials, setProjectXCredentials] = useState<ProjectXCredentials>({ userName: "", apiKey: "" });

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

    if (firm.id === "topstepx") {
      setBrokerNotice("Enter your TopstepX username and API key below. Cova validates it through ProjectX before saving anything.");
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
    setBrokerNotice(`${selectedFirm.name}: upload your trade export below while direct sync is being prepared.`);
  }

  function showExportGuide() {
    document.querySelector("[data-export-guide]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setBrokerNotice(`${selectedFirm.name}: use the export guide below to find the cleanest trade file for Cova.`);
  }

  function startFirmConnect() {
    const canUseConfiguredProvider = canRedirectToFirmProvider(selectedFirm.id);

    if (!entitlements.canUseDirectSync && canUseConfiguredProvider) {
      setBrokerNotice(`${selectedFirm.name}: direct firm sync is a Pro feature. Use CSV export on Free, or unlock Pro when sync is live.`);
      return;
    }

    if (isTopstepX) {
      setBrokerNotice("TopstepX is ready to connect here. Paste the API key generated from your TopstepX settings.");
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
    void connectProjectX(projectXCredentials);
  }

  return (
    <div className="liquid-glass-strong rounded-[40px] p-6 md:p-8">
      <div className="grid gap-7 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="terminal-tab-label inline-flex rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#b9f5df]">Secure link</span>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-body text-xs ${selectedConnected ? "border-emerald-300/24 bg-emerald-400/10 text-emerald-200" : "border-white/12 bg-white/[0.035] text-white/52"}`}>
              <span className={`h-2 w-2 rounded-full ${selectedConnected ? "bg-emerald-300" : "bg-white/30"}`} />
              {selectedConnected ? `${selectedProviderName} connected` : "CSV ready today"}
            </span>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-body text-xs ${entitlements.canUseDirectSync || isTopstepX ? "border-[#18c887]/24 bg-[#18c887]/10 text-[#b9f5df]" : "border-white/12 bg-white/[0.035] text-white/48"}`}>
              {isTopstepX ? "TopstepX beta connector" : entitlements.canUseDirectSync ? "Pro sync enabled" : "Export guide available"}
            </span>
          </div>
          <h3 className="mt-7 font-heading text-5xl italic leading-[1.02] tracking-normal md:text-6xl">Connect your trade history.</h3>
          <p className="mt-5 max-w-2xl font-body font-light leading-relaxed text-white/62">
            Pick your prop firm. TopstepX can connect through a ProjectX API key; the rest use guided exports until an official read-only connector exists.
            Cova reads trade history only and cannot place orders.
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

      <div className="mt-7 grid gap-3 border-t border-white/10 pt-6 md:grid-cols-2 xl:grid-cols-4">
        {propFirmOptions.map((firm) => {
          const active = firm.id === selectedFirm.id;
          const tone = firm.status === "direct" ? "text-emerald-300" : firm.status === "advanced" ? "text-amber-200" : "text-[#b9f5df]";
          return (
            <motion.button
              className={`firm-connect-card rounded-[26px] border p-4 text-left transition ${active ? "border-[#18c887]/54 bg-[#18c887]/10" : "border-white/10 bg-black/22 hover:border-white/22 hover:bg-white/[0.035]"}`}
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
                  {firm.id === "topstepx" ? "Use API key form below" : "Use export guide today"}
                </p>
              )}
            </motion.button>
          );
        })}
      </div>

      {isTopstepX && (
        <form
          className="mt-6 rounded-[30px] border border-emerald-200/14 bg-[linear-gradient(135deg,rgba(24,200,135,0.11),rgba(0,0,0,0.22)_44%,rgba(59,130,246,0.08))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          data-projectx-connect
          onSubmit={submitProjectX}
        >
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-emerald-200/16 bg-emerald-300/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#b9f5df]">Live connector</span>
                <span className="rounded-full border border-white/10 bg-black/28 px-3 py-1.5 font-body text-xs text-white/48">No password required</span>
              </div>
              <h4 className="mt-4 font-body text-2xl font-semibold tracking-[-0.03em] text-white">Connect TopstepX with ProjectX.</h4>
              <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-white/56">
                Generate an API key in TopstepX settings, paste it here, and Cova validates it on the backend. We encrypt the read-only session token and never expose it in the browser.
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
              { icon: LockKeyhole, label: "Read-only", text: "Cova imports account history and cannot submit orders." },
              { icon: BadgeCheck, label: "Encrypted", text: "The session token is encrypted before it is stored." },
              { icon: Gauge, label: "Review-ready", text: "Synced trades feed the dashboard, limits, insights, and Passport." },
            ].map(({ icon: Icon, label, text }) => (
              <div className="rounded-[18px] border border-white/10 bg-black/20 p-3" key={label}>
                <Icon className="h-4 w-4 text-[#18c887]" />
                <p className="mt-2 font-body text-xs font-medium text-white/78">{label}</p>
                <p className="mt-1 font-body text-[11px] leading-relaxed text-white/42">{text}</p>
              </div>
            ))}
          </div>
        </form>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="rounded-[28px] border border-white/10 bg-black/24 p-5">
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
                  <div className="rounded-[18px] border border-white/10 bg-white/[0.025] p-3" key={label}>
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
          {selectedFirm.id === "topstepx" && selectedConnected && <GlassButton onClick={syncProjectX}>{projectXSyncBusy ? "Syncing..." : "Sync trades"}</GlassButton>}
          {selectedFirm.id === "tradovate" && <GlassButton onClick={checkTradovateStatus}>{brokerBusy ? "Checking..." : "Check status"}</GlassButton>}
          {selectedFirm.id === "tradovate" && connected && <GlassButton onClick={syncTradovate}>{syncBusy ? "Syncing..." : "Sync trades"}</GlassButton>}
        </div>
      </div>

      <p className="mt-5 font-body text-xs leading-relaxed text-white/45">
        {brokerNotice || brokerStatus?.message || `Last checked: ${updated}. Pick a firm above. If direct sync is not live yet, upload the same trade export you would send to a journal.`}
      </p>
    </div>
  );
}

function CsvExportGuide({ selectedFirmId, setSelectedFirmId }: { selectedFirmId: PropFirmId; setSelectedFirmId: (firm: PropFirmId) => void }) {
  const guide = csvExportGuides.find((item) => item.id === selectedFirmId) ?? csvExportGuides[0];

  return (
    <div className="liquid-glass rounded-[34px] p-5 md:p-6" data-export-guide>
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

        <div className="rounded-[28px] border border-white/10 bg-black/24 p-4 md:p-5">
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
              <div className="rounded-[20px] border border-white/10 bg-white/[0.025] p-4" key={step}>
                <span className="font-mono text-xs text-[#18c887]">0{index + 1}</span>
                <p className="mt-2 font-body text-sm leading-relaxed text-white/72">{step}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-3 rounded-[22px] border border-[#18c887]/16 bg-[#18c887]/8 p-4">
            <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#b9f5df]" />
            <p className="font-body text-sm leading-relaxed text-white/58">{guide.tip}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
      <p className="font-body text-xs uppercase tracking-[0.2em] text-white/36">{label}</p>
      <p className={`mt-2 font-mono text-xl capitalize ${tone}`}>{value}</p>
    </div>
  );
}

function ImportNextSteps({ entitlements }: { entitlements: Entitlements }) {
  const steps = [
    ["Export", "Download trade history from your prop firm or platform."],
    ["Check", "Cova flags missing rows before anything hits your review."],
    ["Review", "Your dashboard updates with score, drawdown, limits, and notes."],
  ];

  return (
    <div className="liquid-glass rounded-[32px] p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-body text-xs uppercase tracking-[0.22em] text-[#b9f5df]">What happens next</p>
          <p className="mt-1 font-body text-sm text-white/52">
            {entitlements.plan === "free"
              ? `Free accounts review up to ${entitlements.maxStoredTrades} trades. Enough to test the workflow without committing.`
              : "Pro accounts keep the full review history and can use direct sync when connectors are live."}
          </p>
        </div>
        <span className="w-fit rounded-full border border-white/10 bg-black/24 px-3 py-1.5 font-body text-xs text-white/46">
          Read-only. No orders.
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {steps.map(([label, body], index) => (
          <div className="rounded-[22px] border border-white/10 bg-white/[0.025] p-4" key={label}>
            <span className="font-mono text-xs text-[#18c887]">0{index + 1}</span>
            <p className="mt-2 font-body text-sm font-medium text-white/82">{label}</p>
            <p className="mt-1 font-body text-xs leading-relaxed text-white/44">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CsvPreview({ parsed }: { parsed: ReturnType<typeof parseCsvDetailed> }) {
  return (
    <div className="liquid-glass rounded-[32px] p-5">
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
      <div className="mt-4 overflow-hidden rounded-[22px] border border-white/10">
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

function RulesEngine({ analysis, entitlements, rules, setRules, upgradeToPro }: { analysis: ReturnType<typeof analyze>; entitlements: Entitlements; rules: RiskRule[]; setRules: (rules: RiskRule[]) => void; upgradeToPro: () => void }) {
  return (
    <SectionShell
      eyebrow="Limits"
      title="Set account limits."
      variant="workspace"
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" align="right" opacity="opacity-[0.18]" />}
    >
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="liquid-glass-strong rounded-[36px] p-8">
          <SlidersHorizontal className="h-10 w-10 text-[#18c887]" />
          <h3 className="mt-8 font-heading text-5xl italic leading-[0.98] tracking-normal">Your account rules.</h3>
          <p className="mt-5 font-body font-light leading-relaxed text-white/60">
            Tell Cova what disciplined trading looks like for you. Every uploaded trade gets checked
            against these limits so warnings are easy to understand.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="liquid-glass rounded-[28px] p-5">
              <p className="font-body text-xs uppercase tracking-[0.22em] text-white/40">Warnings</p>
              <p className="mt-2 font-body text-4xl text-red-400">{analysis.breaches.length}</p>
            </div>
            <div className="liquid-glass rounded-[28px] p-5">
              <p className="font-body text-xs uppercase tracking-[0.22em] text-white/40">Compliance</p>
              <p className="mt-2 font-body text-4xl text-emerald-400">{formatPercent(analysis.compliance)}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          {rules.map((rule, index) => {
            const status = analysis.ruleStatuses.find((item) => item.rule.id === rule.id);
            const isMinimumRule = rule.metric.includes("min");
            const isCountRule = rule.metric === "maxContracts" || rule.metric === "maxLossStreak";
            const rangeMax = rule.metric === "maxContracts" ? 10 : rule.metric === "maxLossStreak" ? 8 : isMinimumRule ? 3 : 10000;
            const rangeMin = isCountRule ? 1 : isMinimumRule ? 0 : 100;
            const rangeStep = isCountRule ? 1 : isMinimumRule ? 0.05 : 50;
            const formattedLimit = isCountRule ? rule.limit : isMinimumRule ? rule.limit.toFixed(2) : formatMoney(rule.limit);
            const locked = isMinimumRule && !entitlements.canEditAdvancedLimits;
            return (
              <motion.article
                key={rule.id}
                className={`liquid-glass rounded-[32px] p-5 md:p-6 ${locked ? "opacity-70" : ""}`}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.045, duration: 0.55 }}
              >
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">{friendlyRuleMetric(rule.metric)}</p>
                    <h3 className="mt-2 font-body text-xl font-medium">{rule.name}</h3>
                    <p className="mt-1 font-body text-sm font-light text-white/50">{status?.summary}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {locked && (
                      <button className="rounded-full border border-[#18c887]/24 bg-[#18c887]/10 px-3 py-1 font-body text-xs text-[#b9f5df]" onClick={upgradeToPro} type="button">
                        Pro
                      </button>
                    )}
                    <span className={`rounded-full px-3 py-1 font-body text-xs ${status?.breached ? "bg-red-500/15 text-red-300" : "bg-emerald-400/15 text-emerald-300"}`}>
                      {status?.breached ? "Needs review" : "Looks good"}
                    </span>
                    <button
                      className={`h-8 w-14 rounded-full border p-1 transition ${rule.enabled ? "border-emerald-300/50 bg-emerald-400/20" : "border-white/15 bg-white/5"}`}
                      onClick={() => setRules(rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))}
                      disabled={locked}
                      type="button"
                      aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                    >
                      <span className={`block h-6 w-6 rounded-full bg-white transition ${rule.enabled ? "translate-x-6" : ""}`} />
                    </button>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 md:grid-cols-[1fr_150px] md:items-center">
                  <input
                    type="range"
                    min={rangeMin}
                    max={rangeMax}
                    step={rangeStep}
                    value={rule.limit}
                    onChange={(event) => setRules(rules.map((item) => item.id === rule.id ? { ...item, limit: Number(event.target.value) } : item))}
                    disabled={locked}
                    className="cova-range"
                  />
                  <label className="grid gap-1">
                    <span className="font-body text-[10px] uppercase tracking-[0.18em] text-white/35">Limit</span>
                    <input
                      className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-right font-mono text-lg text-[#18c887] outline-none transition focus:border-[#18c887]"
                      min={rangeMin}
                      max={rangeMax}
                      step={rangeStep}
                      type="number"
                      value={rule.limit}
                      onChange={(event) => setRules(rules.map((item) => item.id === rule.id ? { ...item, limit: Number(event.target.value) } : item))}
                      disabled={locked}
                      aria-label={`${rule.name} limit`}
                    />
                    <span className="text-right font-body text-[11px] text-white/35">{formattedLimit}</span>
                  </label>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </SectionShell>
  );
}

function Coach({ analysis, entitlements, go, upgradeToPro }: { analysis: ReturnType<typeof analyze>; entitlements: Entitlements; go: (section: Section) => void; upgradeToPro: () => void }) {
  const primaryBreach = analysis.breaches[0];
  const bestSetup = analysis.bySetup[0];
  const brief = analysis.nextSessionBrief;
  const briefIcon = brief.status === "locked" ? LockKeyhole : brief.status === "ready" ? ShieldCheck : Gauge;
  const briefTone = brief.status === "locked" ? "PAUSE" : brief.status === "ready" ? "READY" : "CAUTION";
  const insights = [
    {
      icon: CircleDot,
      title: analysis.breaches.length ? "A few habits need attention" : "Your risk looks steady",
      body: analysis.breaches.length ? `${analysis.breaches.length} limit warning${analysis.breaches.length === 1 ? " is" : "s are"} pulling down your Risk Passport.` : "Your imported trades are staying inside the limits you set.",
      tone: analysis.breaches.length ? "WARN" : "GOOD",
      evidence: primaryBreach?.evidence.slice(0, 2) ?? [`${analysis.trades.length} trades checked`, `${formatPercent(analysis.compliance)} of limits followed`],
    },
    {
      icon: ShieldCheck,
      title: "Your clearest setup",
      body: `${bestSetup?.name ?? "Setup"} has the most trade history so far, with ${bestSetup?.count ?? 0} trades to review.`,
      tone: "GOOD",
      evidence: bestSetup ? [`${bestSetup.count} trades`, `${bestSetup.avgR.toFixed(2)}R average result`] : ["Upload more rows to learn which setups are working."],
    },
    {
      icon: briefIcon,
      title: brief.headline,
      body: brief.summary,
      tone: briefTone,
      evidence: brief.evidence.slice(0, 2),
    },
  ];
  const visibleInsights = insights.slice(0, entitlements.insightLimit);
  const lockedInsightCount = Math.max(0, insights.length - visibleInsights.length);
  return (
    <SectionShell
      eyebrow="Insights"
      title="Review plain-English insights."
      variant="workspace"
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" align="right" opacity="opacity-[0.2]" />}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {visibleInsights.map((insight, index) => (
          <motion.article
            key={insight.title}
            className="liquid-glass min-h-[320px] rounded-[36px] p-8"
            initial={{ opacity: 0, y: 34, filter: "blur(14px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.09, duration: 0.65 }}
          >
            <insight.icon className="h-10 w-10 text-[#18c887]" />
            <span className="mt-10 inline-block rounded-full bg-white/5 px-3 py-1 font-body text-xs text-white/50">{insight.tone}</span>
            <h3 className="mt-5 font-heading text-4xl italic leading-[1] tracking-normal">{insight.title}</h3>
            <p className="mt-5 font-body font-light leading-relaxed text-white/58">{insight.body}</p>
            <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
              {insight.evidence.map((line) => (
                <p className="font-mono text-xs text-white/42" key={line}>Checked: {line}</p>
              ))}
            </div>
          </motion.article>
        ))}
        {lockedInsightCount > 0 && (
          <motion.article
            className="liquid-glass-strong min-h-[320px] rounded-[36px] p-8"
            initial={{ opacity: 0, y: 34, filter: "blur(14px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true }}
            transition={{ delay: visibleInsights.length * 0.09, duration: 0.65 }}
          >
            <LockKeyhole className="h-10 w-10 text-[#18c887]" />
            <span className="mt-10 inline-block rounded-full bg-[#18c887]/10 px-3 py-1 font-body text-xs text-[#b9f5df]">PRO</span>
            <h3 className="mt-5 font-heading text-4xl italic leading-[1] tracking-normal">Unlock deeper review notes.</h3>
            <p className="mt-5 font-body font-light leading-relaxed text-white/58">
              Pro keeps full insight history and shows every coaching note Cova finds in your trade data.
            </p>
            <div className="mt-6">
              <GlassButton strong onClick={upgradeToPro}>Unlock Pro <ArrowUpRight className="h-4 w-4" /></GlassButton>
            </div>
          </motion.article>
        )}
      </div>
      <div className="mt-8">
        <GlassButton strong onClick={() => go("passport")}>Share Risk Passport <ArrowUpRight className="h-4 w-4" /></GlassButton>
      </div>
    </SectionShell>
  );
}

function Passport({ analysis, entitlements, sharePassport, go, upgradeToPro }: { analysis: ReturnType<typeof analyze>; entitlements: Entitlements; sharePassport: () => void; go: (section: Section) => void; upgradeToPro: () => void }) {
  const [copied, setCopied] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [expiry, setExpiry] = useState("7 days");
  const cardRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
  }, []);

  function copyPassport() {
    sharePassport();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  function movePassportCard(event: React.PointerEvent<HTMLDivElement>) {
    const card = cardRef.current;
    const shadow = shadowRef.current;
    if (!card) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const rotateY = (x - 0.5) * 10;
    const rotateX = (0.5 - y) * 7;
    const lightX = x * 100;
    const lightY = y * 100;
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = window.requestAnimationFrame(() => {
      card.style.setProperty("--passport-rotate-x", `${rotateX.toFixed(2)}deg`);
      card.style.setProperty("--passport-rotate-y", `${rotateY.toFixed(2)}deg`);
      card.style.setProperty("--passport-light-x", `${lightX.toFixed(1)}%`);
      card.style.setProperty("--passport-light-y", `${lightY.toFixed(1)}%`);
      card.style.setProperty("--passport-lift", "-6px");
      if (shadow) {
        shadow.style.setProperty("--passport-shadow-x", `${((x - 0.5) * -14).toFixed(1)}px`);
        shadow.style.setProperty("--passport-shadow-y", `${(5 + Math.abs(y - 0.5) * 9).toFixed(1)}px`);
        shadow.style.setProperty("--passport-shadow-scale", `${(1.02 + Math.abs(x - 0.5) * 0.045).toFixed(3)}`);
        shadow.style.setProperty("--passport-shadow-opacity", "0.82");
      }
      frameRef.current = null;
    });
  }

  function resetPassportCard() {
    const card = cardRef.current;
    const shadow = shadowRef.current;
    if (!card) {
      return;
    }
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    card.style.setProperty("--passport-rotate-x", "0deg");
    card.style.setProperty("--passport-rotate-y", "0deg");
    card.style.setProperty("--passport-light-x", "52%");
    card.style.setProperty("--passport-light-y", "18%");
    card.style.setProperty("--passport-lift", "0px");
    if (shadow) {
      shadow.style.setProperty("--passport-shadow-x", "0px");
      shadow.style.setProperty("--passport-shadow-y", "0px");
      shadow.style.setProperty("--passport-shadow-scale", "1");
      shadow.style.setProperty("--passport-shadow-opacity", "0.72");
    }
  }

  return (
    <SectionShell
      eyebrow="Risk Passport"
      title="Share a Risk Passport."
      variant="workspace"
      backdrop={<ImageAtmosphere src="/media/cova-passport-product.jpg" align="right" opacity="opacity-[0.35]" />}
    >
      <div className="liquid-glass mb-7 grid gap-4 rounded-[32px] p-5 md:grid-cols-[0.8fr_1.2fr] md:items-center">
        <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">{entitlements.plan === "free" ? "Free preview" : "What is this?"}</p>
        <p className="font-body text-sm font-light leading-relaxed text-white/62">
          A Risk Passport is a shareable summary of your discipline, limits, and trade behavior.
          It helps someone see how you manage risk without turning Cova into a signal report.
          {entitlements.plan === "free" ? " Free accounts can preview one Passport; Pro unlocks export and full sharing controls." : ""}
        </p>
      </div>
      <div className="grid gap-7 lg:grid-cols-[0.75fr_1.1fr_0.75fr]">
        <div className="space-y-5">
          <ScoreCard analysis={analysis} />
          <div className="liquid-glass rounded-[36px] p-7">
            <p className="font-body text-xs uppercase tracking-[0.22em] text-white/40">Limits followed</p>
            <p className="mt-3 font-body text-5xl text-emerald-400">{analysis.ruleStatuses.length - analysis.breaches.length}/{analysis.ruleStatuses.length}</p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${analysis.compliance * 100}%` }} />
            </div>
            <p className="mt-4 font-body text-sm text-white/50">{formatPercent(analysis.compliance)} compliance</p>
          </div>
        </div>

        <motion.div
          className="passport-stage relative"
          initial={{ opacity: 0, scale: 0.96, y: 26 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="passport-card-scene">
            <div className="passport-ground" ref={shadowRef} />
            <div
              className="passport-card-hitbox"
              onPointerMove={movePassportCard}
              onPointerLeave={resetPassportCard}
            >
              <div className="passport-card-3d" ref={cardRef}>
                <div className="passport-card-depth" />
                <div className="passport-card-face">
                  <div className="passport-card-noise" />
                  <div className="passport-card-shine" />
                  <div className="passport-card-grid" />
                  <div className="relative z-10 flex h-full flex-col">
                    <div className="flex items-start justify-between gap-8">
                      <div>
                        <p className="font-heading text-4xl italic tracking-normal text-white/76">COVA</p>
                        <h3 className="mt-5 font-mono text-2xl uppercase tracking-[0.14em] text-white/86 md:text-4xl md:tracking-[0.2em]">Risk Passport</h3>
                        <p className="mt-3 font-mono text-xs uppercase tracking-[0.22em] text-white/44 md:text-sm">Shareable risk summary</p>
                      </div>
                      <div className="passport-chip" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>

                    <div className="mt-6 h-px bg-white/14" />

                    <div className="mt-auto grid grid-cols-2 gap-x-5 gap-y-3 pt-5 md:grid-cols-4">
                      {[
                        ["Passport ID", "7CVA-2505-741"],
                        ["Generated", analysis.latestDate],
                        ["Risk score", `${analysis.score}/100`],
                        ["Limits followed", formatPercent(analysis.compliance)],
                      ].map(([label, value]) => (
                        <div className="border-t border-white/10 pt-3 font-mono" key={label}>
                          <span className="block text-[0.62rem] uppercase tracking-[0.16em] text-white/34 md:text-[0.68rem]">{label}</span>
                          <span className="mt-1 block text-xs text-white/86 md:text-sm">{value}</span>
                        </div>
                      ))}
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="liquid-glass mt-8 grid gap-3 rounded-[28px] p-4 md:grid-cols-[1fr_auto] md:items-center">
            <button
              className="flex items-center gap-3 rounded-full text-left font-body text-sm text-white"
              onClick={() => setVisibility(visibility === "private" ? "public" : "private")}
              type="button"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-[#18c887]">
                {visibility === "private" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </span>
              <span>
                <span className="block text-white/80">{visibility === "private" ? "Private draft" : "Public share link"}</span>
                <span className="block text-xs text-white/42">Toggle share visibility</span>
              </span>
            </button>
            <label className="font-body text-xs uppercase tracking-[0.18em] text-white/38">
              Expiry
              <select
                className="mt-2 block rounded-full border border-white/10 bg-black/50 px-4 py-2 font-body text-sm normal-case tracking-normal text-white outline-none"
                value={expiry}
                onChange={(event) => setExpiry(event.target.value)}
              >
                <option>24 hours</option>
                <option>7 days</option>
                <option>30 days</option>
                <option>No expiry</option>
              </select>
            </label>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <GlassButton strong onClick={copyPassport}>{copied ? "Copied" : "Copy Link"} <Copy className="h-4 w-4" /></GlassButton>
            <GlassButton onClick={entitlements.canExportPassport ? () => downloadPassportPng(analysis, visibility, expiry) : upgradeToPro}>
              {entitlements.canExportPassport ? "Export PNG" : "Unlock Export"} <Download className="h-4 w-4" />
            </GlassButton>
            <GlassButton onClick={() => go("dashboard")}>Back to Review</GlassButton>
          </div>
        </motion.div>

        <div className="grid gap-5">
          {analysis.ruleStatuses.slice(0, 3).map((status) => (
            <div className="liquid-glass rounded-[32px] p-6" key={status.rule.id}>
              <BadgeCheck className={`h-9 w-9 ${status.breached ? "text-red-400" : "text-emerald-400"}`} />
              <h3 className="mt-5 font-body text-xl font-medium">{status.rule.name}</h3>
              <p className="mt-2 font-body text-sm font-light leading-relaxed text-white/56">{status.summary}</p>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

type StoryFrame = {
  body: string;
  csvHelp?: { body: string; steps: string[] };
  eyebrow: string;
  Icon: LucideIcon;
  metric: string;
  num: string;
  title: string;
};

const proofStoryFrames: StoryFrame[] = [
  {
    num: "01",
    eyebrow: "Start with proof",
    title: "Trade history becomes proof.",
    body: "Cova starts with what already happened: entries, exits, size, drawdown, and session behavior. No calls, no guesses.",
    Icon: ShieldCheck,
    metric: "History captured",
  },
  {
    num: "02",
    eyebrow: "Clean the file",
    title: "Rows become evidence.",
    body: "Upload a CSV or connect an account. Cova cleans the mess into a ledger that is easy to review.",
    Icon: FileUp,
    metric: "CSV normalized",
    csvHelp: {
      body: "A CSV is the spreadsheet-style file most prop dashboards export for your trades.",
      steps: ["Export trade history", "Upload the file", "Cova turns rows into risk notes"],
    },
  },
  {
    num: "03",
    eyebrow: "Attach limits",
    title: "Limits show what matters.",
    body: "Daily loss, sizing, drawdown, and repeat mistakes become plain warnings before the next session starts.",
    Icon: Gauge,
    metric: "Limits attached",
  },
  {
    num: "04",
    eyebrow: "Share the proof",
    title: "A Risk Passport is ready.",
    body: "Cova packages the review into a clean summary you can share when someone asks how disciplined you are.",
    Icon: Fingerprint,
    metric: "Passport assembled",
  },
];

function StoryStrip() {
  const storyRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: storyRef,
    offset: ["start start", "end end"],
  });

  return (
    <section ref={storyRef} className="scroll-story trade-proof-story relative bg-black">
      <div className="trade-proof-sticky">
        <div className="story-grain absolute inset-0" />
        <div className="trade-proof-ambient absolute inset-0" />
        <div className="trade-proof-layout relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-5 md:px-10 lg:grid-cols-[0.82fr_1.18fr] lg:px-14">
          <div className="trade-proof-copy">
            <p className="font-body text-xs font-medium uppercase tracking-[0.28em] text-[#b9f5df]/80">How Cova works</p>
            <div className="trade-proof-copy-stack">
              {proofStoryFrames.map((frame, index) => (
                <StoryCopyFrame frame={frame} index={index} key={frame.num} progress={scrollYProgress} total={proofStoryFrames.length} />
              ))}
            </div>
            <div className="trade-proof-timeline" aria-hidden="true">
              <motion.div className="trade-proof-timeline-fill" style={{ scaleX: scrollYProgress }} />
            </div>
          </div>

          <div className="trade-proof-scene-wrap" aria-label="Animated trade review and Risk Passport assembly">
            <Suspense fallback={<TradeProofFallback />}>
              <TradeProofThreeStory progress={scrollYProgress} />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="trade-proof-mobile relative px-5 py-24 md:hidden">
        <p className="font-body text-xs uppercase tracking-[0.16em] text-[#b9f5df]/80">How Cova works</p>
        <h2 className="mt-5 font-heading text-5xl italic leading-[1.02] tracking-normal">From trade history to proof.</h2>
        <div className="mt-9">
          <TradeProofFallback compact />
        </div>
        <div className="mt-10 grid gap-5">
          {proofStoryFrames.map((frame) => (
            <motion.article
              className="trade-proof-mobile-card"
              key={frame.num}
              initial={{ opacity: 0, y: 28 }}
              transition={{ duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
              viewport={{ once: true, margin: "-80px" }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="font-heading text-4xl italic leading-none text-white/24">{frame.num}</span>
                <frame.Icon className="h-5 w-5 text-[#18c887]" />
              </div>
              <p className="mt-5 font-body text-[11px] uppercase tracking-[0.22em] text-[#b9f5df]/70">{frame.eyebrow}</p>
              <h3 className="mt-2 font-body text-xl font-medium">{frame.title}</h3>
              <p className="mt-2 font-body text-sm font-light leading-relaxed text-white/58">{frame.body}</p>
              {frame.csvHelp && <CsvExplainer body={frame.csvHelp.body} steps={frame.csvHelp.steps} compact />}
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function StoryCopyFrame({ frame, index, progress, total }: { frame: StoryFrame; index: number; progress: MotionValue<number>; total: number }) {
  const opacity = useTransform(progress, (latest) => {
    const distance = Math.abs(latest * (total - 1) - index);
    const raw = clampNumber(1 - distance * 1.25, 0, 1);
    return raw * raw * (3 - 2 * raw);
  });
  const y = useTransform(progress, (latest) => (index - latest * (total - 1)) * 24);
  const scale = useTransform(progress, (latest) => {
    const distance = Math.abs(latest * (total - 1) - index);
    return 0.985 + clampNumber(1 - distance, 0, 1) * 0.015;
  });

  return (
    <motion.article
      className="trade-proof-copy-frame"
      style={{ opacity, y, scale }}
    >
      <div className="flex items-center gap-4">
        <span className="font-heading text-7xl italic leading-none text-white/24">{frame.num}</span>
        <span className="story-step-button rounded-full border-white/16 bg-white/[0.025] px-4 py-2 font-body text-xs uppercase tracking-[0.16em] text-white/58">
          {frame.eyebrow}
        </span>
      </div>
      <h2 className="mt-6 max-w-3xl font-heading text-6xl italic leading-[0.94] tracking-normal text-white md:text-7xl xl:text-8xl">
        {frame.title}
      </h2>
      <p className="mt-6 max-w-xl font-body text-lg font-light leading-relaxed text-white/68">
        {frame.body}
      </p>
      {frame.csvHelp && <CsvExplainer body={frame.csvHelp.body} steps={frame.csvHelp.steps} compact />}
      <div className="mt-7 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.025] px-4 py-3">
        <frame.Icon className="h-4 w-4 text-[#18c887]" />
        <span className="font-body text-sm text-white/72">{frame.metric}</span>
      </div>
    </motion.article>
  );
}

function TradeProofFallback({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "trade-proof-fallback trade-proof-fallback-compact" : "trade-proof-fallback"}>
      <div className="trade-proof-fallback-row trade-proof-fallback-row-left" />
      <div className="trade-proof-fallback-passport">
        <span>COVA</span>
        <strong>Risk Passport</strong>
        <em>Trade history · Limits · Review notes</em>
      </div>
      <div className="trade-proof-fallback-layer trade-proof-fallback-layer-one" />
      <div className="trade-proof-fallback-layer trade-proof-fallback-layer-two" />
    </div>
  );
}

function CsvExplainer({ body, steps, compact = false }: { body: string; steps: string[]; compact?: boolean }) {
  return (
    <div className={`${compact ? "mt-4 max-w-3xl" : "mt-6 max-w-4xl"} csv-help-tab mx-auto`}>
      <div className={`${compact ? "px-2.5 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]"} terminal-tab-label inline-flex font-mono uppercase tracking-[0.22em]`}>
        How CSV works
      </div>
      <div className={`${compact ? "mt-2 rounded-[18px] p-3" : "mt-3 rounded-[22px] p-4"} terminal-info-panel`}>
        <p className={`${compact ? "text-xs" : "text-sm"} font-body font-light leading-relaxed text-white/62`}>{body}</p>
        <div className={`${compact ? "mt-2 grid gap-1.5 sm:grid-cols-3" : "mt-3 grid gap-2 sm:grid-cols-3"}`}>
          {steps.map((step, index) => (
            <div className={`${compact ? "flex items-center gap-2 rounded-[12px] px-2.5 py-1.5" : "rounded-[16px] px-3 py-2"} terminal-step`} key={step}>
              <span className="font-mono text-[10px] text-[#b9f5df]/70">0{index + 1}</span>
              <p className={`${compact ? "text-[11px]" : "mt-1 text-xs"} font-body leading-snug text-white/64`}>{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanStrip({ compact = false, currentPlan, go, openAuth, upgradeToPro }: { compact?: boolean; currentPlan: PlanTier | null; go: (section: Section) => void; openAuth: (mode: AuthMode) => void; upgradeToPro: () => void }) {
  return (
    <section className={`deferred-paint-section plans-section relative overflow-hidden px-5 md:px-12 lg:px-20 ${compact ? "pb-10 pt-32 md:pt-36" : "py-28"}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-64 bg-[linear-gradient(180deg,#000_0%,rgba(0,0,0,0.8)_34%,rgba(0,0,0,0)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-72 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.74)_64%,#000_100%)]" />
      <div className="relative z-10 mx-auto w-full max-w-[calc(100vw-2.5rem)] md:max-w-7xl">
        <div className={`${compact ? "mb-7 max-w-3xl" : "mb-10 max-w-4xl"}`}>
          <span className="liquid-glass mb-5 inline-flex rounded-full px-4 py-2 font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Plans</span>
          <h2 className={`max-w-[10ch] break-words font-heading italic leading-[1.05] tracking-[0.012em] [word-spacing:0.04em] md:max-w-none md:[word-spacing:0.14em] ${compact ? "text-[42px] md:text-7xl" : "text-[48px] md:text-8xl"}`}>Try the review flow before you pay.</h2>
          <p className="mt-6 max-w-[31ch] font-body font-light leading-relaxed text-white/58 md:max-w-2xl">
            The free account is intentionally small: enough to see whether Cova helps you review risk.
            Upgrade when you want saved history, more Passport exports, and ongoing insight notes.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {planOptions.map((plan) => {
            const isPro = plan.id === "pro";
            const isCurrentPlan = currentPlan === plan.id;
            return (
              <motion.article
                className={`${isPro ? "liquid-glass-strong" : "liquid-glass"} rounded-[40px] p-5 md:p-8`}
                key={plan.name}
                initial={compact ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 30, filter: "blur(10px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true }}
                transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div>
                    <span className={`rounded-full px-3 py-1 font-body text-xs uppercase tracking-[0.2em] ${isPro ? "bg-[#18c887]/18 text-[#b9f5df]" : "bg-white/8 text-white/50"}`}>
                      {isCurrentPlan ? "Current plan" : plan.badge}
                    </span>
                    <h3 className="mt-6 font-body text-3xl font-medium text-white">{plan.name}</h3>
                    <p className="mt-3 max-w-[28ch] font-body text-sm font-light leading-relaxed text-white/55 md:max-w-md">{plan.description}</p>
                  </div>
                  <div className="shrink-0 text-left md:text-right">
                    <p className="font-mono text-4xl leading-none text-white md:text-5xl">{plan.price}</p>
                    <p className="mt-2 max-w-[120px] font-body text-xs uppercase tracking-[0.18em] text-white/38 md:ml-auto">
                      {plan.priceNote}
                    </p>
                  </div>
                </div>

                <div className="my-7 h-px bg-white/10" />

                <div className="grid gap-6 xl:grid-cols-2">
                  <div>
                    <p className="mb-3 font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Comes with</p>
                    <div className="grid gap-3">
                      {plan.included.map((feature) => (
                        <div className="flex items-center gap-3 font-body text-sm text-white/72" key={feature}>
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${isPro ? "border-[#18c887]/35 bg-[#18c887]/10 text-[#b9f5df]" : "border-white/12 bg-white/5 text-white/58"}`}>
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 font-body text-xs uppercase tracking-[0.22em] text-white/34">Doesn't include</p>
                    <div className="grid gap-3">
                      {plan.notIncluded.map((feature) => (
                        <div className="flex items-center gap-3 font-body text-sm text-white/46" key={feature}>
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-black/20 text-white/34">
                            <X className="h-3.5 w-3.5" />
                          </span>
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  {isPro ? (
                    <GlassButton strong onClick={upgradeToPro}>{currentPlan === "pro" ? "Pro active" : "Upgrade to Pro"} <ArrowUpRight className="h-4 w-4" /></GlassButton>
                  ) : currentPlan ? (
                    <GlassButton strong onClick={() => go("import")}>Upload Sample Trades <ArrowUpRight className="h-4 w-4" /></GlassButton>
                  ) : (
                    <StartFreeButton icon onClick={() => openAuth("signup")}>Start free</StartFreeButton>
                  )}
                  <GlassButton onClick={() => go(isPro ? "passport" : "dashboard")}>{isPro ? "See Passport" : "Review Account"}</GlassButton>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CtaFooter({ openAuth, sharePassport }: { openAuth: (mode: AuthMode) => void; sharePassport: () => void }) {
  return (
    <section className="deferred-paint-section relative overflow-hidden px-5 py-32 md:px-12 lg:px-20">
      <img src="/media/cova-dashboard-plate.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.18] grayscale" loading="lazy" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#000_0%,rgba(0,0,0,0.86)_52%,#000_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-96 bg-[linear-gradient(180deg,#000_0%,rgba(0,0,0,0.88)_28%,rgba(0,0,0,0)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-64 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,#000_100%)]" />
      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-12 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="max-w-5xl font-heading text-6xl italic leading-[1.08] tracking-[0.012em] [word-spacing:0.16em] md:text-7xl lg:text-8xl">Review the risk before the next trade.</h2>
          <p className="mt-6 max-w-lg font-body font-light leading-relaxed text-white/58">Cova helps funded futures traders understand their habits, tighten limits, and share proof of discipline without pretending to predict the market.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <StartFreeButton onClick={() => openAuth("signup")} />
          <GlassButton onClick={sharePassport}>Share Risk Passport</GlassButton>
        </div>
      </div>
      <footer className="relative mx-auto mt-28 flex max-w-7xl flex-col gap-5 border-t border-white/10 pt-7 font-body text-xs text-white/38 md:flex-row md:items-center md:justify-between">
        <span>© 2026 Cova. Built for risk review, not trade signals.</span>
        <span>Trade history · Risk limits · Shareable Passport</span>
      </footer>
    </section>
  );
}

function SectionShell({
  eyebrow,
  title,
  action,
  backdrop,
  children,
  variant = "editorial",
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  backdrop?: React.ReactNode;
  children: React.ReactNode;
  variant?: "editorial" | "workspace";
}) {
  const isWorkspace = variant === "workspace";
  return (
    <section className={`deferred-paint-section relative min-h-screen overflow-hidden px-5 md:px-12 lg:px-20 ${isWorkspace ? "pb-16 pt-28 md:pt-28" : "pb-24 pt-36"}`}>
      {backdrop}
      <div className="relative z-10 mx-auto w-full max-w-[calc(100vw-2.5rem)] md:max-w-7xl">
        <div className={`grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end ${isWorkspace ? "mb-6" : "mb-12"}`}>
          <div className="min-w-0">
            <span
              className={isWorkspace
                ? "mb-3 inline-flex font-body text-[11px] font-medium uppercase tracking-[0.3em] text-[#18c887]/82"
                : "liquid-glass mb-5 inline-block rounded-full px-4 py-2 font-body text-xs uppercase tracking-[0.22em] text-[#18c887]"}
            >
              {eyebrow}
            </span>
            <h2
              className={isWorkspace
                ? "max-w-3xl break-words font-body text-4xl font-semibold leading-[0.96] tracking-[-0.055em] text-white md:text-5xl lg:text-6xl"
                : "max-w-[9.5ch] break-words font-heading text-[42px] italic leading-[1.05] tracking-[0.01em] [word-spacing:0.04em] md:max-w-none md:text-8xl md:[word-spacing:0.12em]"}
            >
              {title}
            </h2>
          </div>
          {action && <div className="justify-self-start md:justify-self-end">{action}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

function ImageAtmosphere({ src, align = "center", opacity = "opacity-[0.42]" }: { src: string; align?: "center" | "right"; opacity?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 top-12 z-0 h-[620px] ${opacity}`}>
      <img
        src={src}
        alt=""
        className={`h-full w-full object-cover ${align === "right" ? "object-right" : "object-center"} [mask-image:linear-gradient(180deg,rgba(0,0,0,0)_0%,#000_18%,#000_62%,rgba(0,0,0,0)_100%)]`}
        loading="lazy"
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(0,0,0,0)_0%,rgba(0,0,0,0.62)_68%,#000_100%)]" />
    </div>
  );
}

function RouteFrame({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

function StartFreeButton({
  children = "Start for free",
  className = "",
  compact = false,
  icon = false,
  onClick,
}: {
  children?: React.ReactNode;
  className?: string;
  compact?: boolean;
  icon?: boolean;
  onClick?: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [glassInView, setGlassInView] = useState(false);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      setGlassInView(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setGlassInView(entry ? entry.isIntersecting : true);
    }, { rootMargin: "220px" });

    observer.observe(button);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.button
      ref={buttonRef}
      className={`native-start-button ${compact ? "native-start-button-compact" : ""} ${className}`}
      onClick={onClick}
      type="button"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      {glassInView && (
        <Glass
          aria-hidden="true"
          className="native-start-button-optics"
          behind="#030711"
          filterResolution={1}
          maxDpr={1.25}
          optics={START_CTA_OPTICS}
          radius={999}
          refract={<span className="native-start-refract-source" />}
        />
      )}
      <span className="native-start-button-bloom" />
      <span className="native-start-button-copy">
        {children}
        {icon && <ArrowUpRight className="h-4 w-4" />}
      </span>
    </motion.button>
  );
}

function GlassButton({
  children,
  className = "",
  disabled = false,
  onClick,
  strong = false,
  type = "button",
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  strong?: boolean;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <motion.button
      className={`cova-button ${strong ? "cova-button-primary" : "cova-button-secondary"} ${className} inline-flex items-center gap-2 whitespace-nowrap rounded-full px-6 py-3 font-body text-sm font-medium`}
      disabled={disabled}
      onClick={onClick}
      type={type}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <span aria-hidden="true" className="cova-button-optics" />
      <span className="relative z-[2] inline-flex items-center gap-2">{children}</span>
    </motion.button>
  );
}

function Toast({ toast }: { toast: ToastState }) {
  const toneClass = toast?.tone === "warning"
    ? "text-red-200"
    : toast?.tone === "success"
      ? "text-emerald-200"
      : "text-white";

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          className="fixed right-4 top-24 z-[90] w-[calc(100%-2rem)] max-w-sm md:right-8"
          initial={{ opacity: 0, y: -8, scale: 0.96, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -6, scale: 0.98, filter: "blur(8px)" }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          role="status"
        >
          <div className={`liquid-glass-strong rounded-full px-5 py-3 text-center font-body text-sm shadow-[0_20px_70px_rgba(0,0,0,0.38)] ${toneClass}`}>
            {toast.message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MetricDock({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  const metrics = [
    ["Cova Score", `${analysis.score}/100`, "Overall risk health"],
    ["Net P&L", formatMoney(analysis.totalPnl), `${analysis.trades.length} trades`],
    ["Biggest Dip", formatMoney(-analysis.maxDrawdown), "Largest pullback"],
    ["Profit Factor", Number.isFinite(analysis.profitFactor) ? analysis.profitFactor.toFixed(2) : "∞", `${formatPercent(analysis.winRate)} win rate`],
    ["Average R", `${analysis.avgR.toFixed(2)}R`, "Realized expectancy"],
  ];
  return (
    <div className="mt-5 grid overflow-hidden rounded-[28px] border border-white/10 md:grid-cols-5">
      {metrics.map(([label, value, note]) => (
        <div className="border-b border-white/10 p-5 md:border-b-0 md:border-r last:border-r-0" key={label}>
          <p className="font-body text-sm text-white/62">{label}</p>
          <p className={`mt-3 font-mono text-3xl ${String(value).startsWith("-") ? "text-red-400" : "text-[#18c887]"}`}>{value}</p>
          <p className="mt-2 font-body text-sm text-white/45">{note}</p>
        </div>
      ))}
    </div>
  );
}

function ScoreCard({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  return (
    <div className="liquid-glass rounded-[36px] p-7">
      <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Cova Score</p>
      <p className="mt-4 font-mono text-7xl text-[#18c887]">{analysis.score}<span className="text-2xl text-white/55">/100</span></p>
      <p className="mt-3 font-body text-sm text-white/55">{analysis.score >= 80 ? "Strong risk discipline" : analysis.score >= 60 ? "Decent, with room to tighten" : "Risk needs attention"}</p>
      <p className="mt-3 w-fit rounded-full border border-white/10 bg-black/24 px-3 py-1.5 font-body text-xs text-white/42">
        {analysis.evidenceQuality.label} | {analysis.trades.length} trades checked
      </p>
      <p className="mt-4 font-body text-sm leading-relaxed text-white/48">{analysis.evidenceQuality.summary}</p>
      <div className="mt-5 space-y-2">
        {analysis.scoreFactors.slice(0, 3).map((factor) => (
          <div className="rounded-[18px] border border-white/10 bg-black/20 p-3" key={factor.label}>
            <div className="flex items-center justify-between gap-3">
              <p className="font-body text-sm font-medium text-white/78">{factor.label}</p>
              <span className={`font-mono text-[10px] uppercase tracking-[0.16em] ${factor.impact === "positive" ? "text-emerald-300" : factor.impact === "negative" ? "text-red-300" : "text-white/38"}`}>
                {factor.impact}
              </span>
            </div>
            <p className="mt-1 font-body text-xs leading-relaxed text-white/42">{factor.evidence}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlagStack({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  const fallbackItems = analysis.ruleStatuses.slice(0, 3).map((status) => ({
    id: status.rule.id,
    label: status.rule.name,
    status: status.breached ? "Review" : "Good",
    summary: status.evidence[0] ?? status.summary,
    tone: status.breached ? "text-red-400" : "text-emerald-400",
  }));
  const behaviorItems = analysis.behaviorFlags.map((flag) => ({
    id: flag.id,
    label: flag.label,
    status: flag.severity === "critical" ? "Pause" : flag.severity === "warning" ? "Watch" : flag.severity === "positive" ? "Good" : "Review",
    summary: flag.evidence[0] ?? flag.summary,
    tone: flag.severity === "critical" ? "text-red-300" : flag.severity === "warning" ? "text-amber-200" : flag.severity === "positive" ? "text-emerald-300" : "text-[#b9f5df]",
  }));
  const items = behaviorItems.length ? behaviorItems.slice(0, 3) : fallbackItems;
  return (
    <div className="liquid-glass rounded-[36px] p-7">
      <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">What to watch</p>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div className="border-b border-white/10 py-3 last:border-b-0" key={item.id}>
            <div className="flex items-center justify-between gap-4">
              <span className="font-body text-sm text-white/75">{item.label}</span>
              <span className={item.tone}>{item.status}</span>
            </div>
            <p className="mt-1 font-body text-xs leading-relaxed text-white/42">{item.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SetupQuality({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  return (
    <div className="liquid-glass rounded-[36px] p-7">
      <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Setups</p>
      <div className="mt-5 space-y-4">
        {analysis.bySetup.slice(0, 4).map((setup) => (
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 font-body text-sm" key={setup.name}>
            <span>{setup.name}</span>
            <span className="text-white/50">{setup.count} trades</span>
            <span className={setup.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>{setup.avgR.toFixed(2)}R</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketExposure({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  const max = Math.max(...analysis.byMarket.map((market) => market.count), 1);
  return (
    <div className="liquid-glass rounded-[36px] p-7">
      <p className="font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Markets traded</p>
      <div className="mt-6 space-y-5">
        {analysis.byMarket.map((market) => (
          <div className="grid grid-cols-[48px_1fr_80px] items-center gap-4" key={market.name}>
            <span className="font-body text-lg">{market.name}</span>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#18c887]" style={{ width: `${(market.count / max) * 100}%` }} />
            </div>
            <span className={market.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>{formatMoney(market.pnl)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EquityCurve({ points }: { points: number[] }) {
  const width = 900;
  const height = 320;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 1);
  const range = max - min || 1;
  const coords = points.map((value, index) => {
    const x = (index / Math.max(1, points.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return [x, y];
  });
  const path = coords.map(([x, y], index) => `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg className="mt-8 h-[320px] w-full overflow-visible rounded-[28px] border border-white/10 bg-black/28 p-5" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="curve" x1="0" x2="1" y1="0" y2="0">
          <stop stopColor="#b9f5df" />
          <stop offset="1" stopColor="#075f44" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((line) => <line key={line} x1="0" x2={width} y1={height * line} y2={height * line} stroke="rgba(255,255,255,.10)" strokeDasharray="6 8" />)}
      <path d={path} fill="none" stroke="url(#curve)" strokeWidth="4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function filterTradesByRange(trades: Trade[], range: TimeRange) {
  if (range === "all" || trades.length <= 1) {
    return trades;
  }

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = sorted[sorted.length - 1]?.date;
  if (!latestDate) {
    return sorted;
  }

  if (range === "today") {
    return sorted.filter((trade) => trade.date === latestDate);
  }

  const end = new Date(`${latestDate}T00:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);

  return sorted.filter((trade) => {
    const date = new Date(`${trade.date}T00:00:00`);
    return date >= start && date <= end;
  });
}

function friendlyRuleMetric(metric: RiskRule["metric"]) {
  const labels: Record<RiskRule["metric"], string> = {
    maxDailyLoss: "Daily loss",
    maxTradeLoss: "Single trade loss",
    maxContracts: "Position size",
    maxLossStreak: "Loss streak",
    minProfitFactor: "Profit factor",
    minAvgR: "Average R",
  };
  return labels[metric];
}

function downloadPassportPng(analysis: ReturnType<typeof analyze>, visibility: string, expiry: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#020306"/>
          <stop offset="1" stop-color="#071225"/>
        </linearGradient>
        <linearGradient id="line" x1="0" x2="1">
          <stop stop-color="#b9f5df"/>
          <stop offset="1" stop-color="#18c887"/>
        </linearGradient>
      </defs>
      <rect width="1400" height="900" rx="54" fill="url(#bg)"/>
      <rect x="58" y="58" width="1284" height="784" rx="42" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.24)" stroke-width="2"/>
      <text x="104" y="150" fill="#f8fbff" font-family="Georgia,serif" font-size="68" font-style="italic">Cova</text>
      <text x="104" y="252" fill="#f8fbff" font-family="Courier New,monospace" font-size="72" letter-spacing="14">RISK PASSPORT</text>
      <text x="104" y="312" fill="#8fb7a6" font-family="Courier New,monospace" font-size="24" letter-spacing="8">VERIFIED RISK CREDENTIAL</text>
      <rect x="104" y="390" width="1192" height="2" fill="rgba(255,255,255,0.16)"/>
      <text x="104" y="500" fill="#18c887" font-family="Courier New,monospace" font-size="124">${analysis.score}</text>
      <text x="292" y="500" fill="#a6b8b0" font-family="Courier New,monospace" font-size="44">/100 COVA SCORE</text>
      <text x="104" y="600" fill="#36e2a0" font-family="Courier New,monospace" font-size="54">${formatPercent(analysis.compliance)} COMPLIANCE</text>
      <text x="104" y="680" fill="#f8fbff" font-family="Courier New,monospace" font-size="32">Trades: ${analysis.trades.length} · Generated: ${analysis.latestDate}</text>
      <text x="104" y="740" fill="#a6b8b0" font-family="Courier New,monospace" font-size="26">Visibility: ${visibility.toUpperCase()} · Expiry: ${expiry.toUpperCase()}</text>
      <path d="M850 630 C920 560 960 690 1020 620 S1130 540 1230 590" fill="none" stroke="url(#line)" stroke-width="8"/>
      <rect x="1082" y="128" width="156" height="156" rx="28" fill="rgba(24,200,135,0.08)" stroke="rgba(24,200,135,0.5)"/>
      <text x="1118" y="216" fill="#f8fbff" font-family="Courier New,monospace" font-size="24">COVA</text>
    </svg>
  `;
  const image = new Image();
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(svgUrl);
      return;
    }
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(svgUrl);
    const link = document.createElement("a");
    link.download = `cova-risk-passport-${analysis.latestDate}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  image.src = svgUrl;
}

function readBrokerStatus(): BrokerStatus | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(BROKER_STATUS_KEY) ?? "null");
    if (typeof parsed?.provider === "string" && typeof parsed.message === "string") {
      return {
        provider: parsed.provider,
        status: parsed.status ?? "not-connected",
        connected: Boolean(parsed.connected),
        connectionId: parsed.connectionId,
        message: parsed.message,
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function writeBrokerStatus(status: BrokerStatus) {
  localStorage.setItem(BROKER_STATUS_KEY, JSON.stringify(status));
  window.dispatchEvent(new CustomEvent("cova:broker-status"));
}

function readDashboardFocus(): DashboardFocus {
  try {
    const value = localStorage.getItem(DASHBOARD_FOCUS_KEY);
    if (value === "health" || value === "risk" || value === "performance" || value === "proof") {
      return value;
    }
  } catch {
    return "health";
  }
  return "health";
}

function readDashboardRange(): TimeRange {
  try {
    const value = localStorage.getItem(DASHBOARD_RANGE_KEY);
    if (value === "today" || value === "week" || value === "all") {
      return value;
    }
  } catch {
    return "all";
  }
  return "all";
}

function brokerMessageForStatus(status: string) {
  const messages: Record<string, string> = {
    connected: "Tradovate connected. Trade syncing can now run from the secure backend.",
    "token-received-needs-storage": "Tradovate approved the connection, but Supabase token storage is not configured yet.",
    "needs-storage": "Tradovate approved the connection, but secure Supabase storage needs env vars before we save tokens.",
    "missing-env": "Tradovate OAuth env vars are missing.",
    "token-error": "Tradovate returned a token exchange error.",
    "state-mismatch": "Tradovate OAuth state did not match. Try connecting again.",
    error: "Tradovate returned an authorization error.",
    "not-connected": "No Tradovate connection found yet.",
    "api-unavailable": "Tradovate status check is unavailable in this preview.",
  };
  return messages[status] ?? `Tradovate connector returned: ${status}.`;
}

function getFirmConnectEnv(firmId: PropFirmId) {
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

function getFirmProviderHost(firmId: PropFirmId) {
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

function buildFirmConnectUrl(firmId: PropFirmId) {
  const configuredUrl = getFirmConnectEnv(firmId);
  const target = new URL(configuredUrl || "/api/connectors/start", window.location.origin);
  target.searchParams.set("firm", firmId);
  target.searchParams.set("returnUrl", `${window.location.pathname}${window.location.search}#import`);
  return target.toString();
}

function canRedirectToFirmProvider(firmId: PropFirmId) {
  if (firmId === "other") {
    return false;
  }
  const configuredUrl = getFirmConnectEnv(firmId);
  return Boolean(configuredUrl && (/^https?:\/\//.test(configuredUrl) || configuredUrl.startsWith("/")));
}

function getTradovateConnectEnv() {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return env.VITE_TRADOVATE_CONNECT_URL;
}

function buildTradovateConnectUrl() {
  const returnUrl = `${window.location.pathname}${window.location.search}#import`;
  const configuredUrl = getTradovateConnectEnv();
  const target = new URL(configuredUrl || "/api/tradovate/connect", window.location.origin);
  target.searchParams.set("returnUrl", returnUrl);
  return target.toString();
}

function canRedirectToTradovate() {
  const configuredUrl = getTradovateConnectEnv();
  if (configuredUrl && /^https?:\/\//.test(configuredUrl)) {
    return true;
  }
  if (!isLocalPreview()) {
    return true;
  }
  return window.location.port !== "5173";
}

function getHostedAuthEnv(mode: AuthMode) {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return mode === "signup"
    ? env.VITE_AUTH_SIGNUP_URL || env.VITE_AUTH_LOGIN_URL
    : env.VITE_AUTH_LOGIN_URL;
}

function getHostedLogoutUrl() {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return env.VITE_AUTH_LOGOUT_URL || "";
}

function buildHostedAuthUrl(mode: AuthMode) {
  const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash || "#dashboard"}`;
  const target = new URL(getHostedAuthEnv(mode) || "/api/auth/login", window.location.origin);
  target.searchParams.set("returnUrl", returnUrl);
  target.searchParams.set("covaAuth", mode);
  return target.toString();
}

function canRedirectToHostedAuth(mode: AuthMode) {
  if (isSupabaseConfigured()) {
    return false;
  }
  const configuredUrl = getHostedAuthEnv(mode);
  return Boolean(configuredUrl && /^https?:\/\//.test(configuredUrl));
}

function getProCheckoutUrl() {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return env.VITE_STRIPE_PRO_PAYMENT_LINK || env.VITE_STRIPE_CHECKOUT_URL || "";
}

function isLocalPreview() {
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
}

function isProtectedSection(section: Section) {
  return protectedSections.includes(section as (typeof protectedSections)[number]);
}

function getPropFirm(firmId: PropFirmId | null | undefined) {
  return propFirmOptions.find((item) => item.id === firmId) ?? propFirmOptions[0];
}

function useHashSection(): [Section, (section: Section) => void] {
  const read = () => {
    const raw = window.location.hash.replace("#", "");
    return sections.includes(raw as Section) ? raw as Section : "overview";
  };
  const [section, setSectionState] = useState<Section>(read);
  const scrollToTop = () => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };
  useEffect(() => {
    const onHash = () => {
      setSectionState(read());
      scrollToTop();
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);
  const setSection = (next: Section) => {
    if (read() === next) {
      scrollToTop();
      return;
    }
    window.history.pushState(null, "", `#${next}`);
    setSectionState(next);
    scrollToTop();
  };
  return [section, setSection];
}

function loadAuthSession(): AuthSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) ?? "null");
    if (typeof parsed?.email === "string" && typeof parsed?.signedInAt === "string") {
      return {
        email: parsed.email,
        mode: parsed.mode === "signup" ? "signup" : "login",
        plan: normalizePlan(parsed.plan),
        signedInAt: parsed.signedInAt,
        source: parsed.source === "supabase" ? "supabase" : parsed.source === "hosted" ? "hosted" : "local-preview",
        subscriptionStatus: parsed.subscriptionStatus === "active" || parsed.subscriptionStatus === "preview" ? parsed.subscriptionStatus : "none",
        userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function readOAuthFirmId(): PropFirmId | null {
  try {
    const saved = localStorage.getItem(OAUTH_FIRM_KEY);
    return propFirmOptions.some((firm) => firm.id === saved) ? saved as PropFirmId : null;
  } catch {
    return null;
  }
}

function normalizePlan(value: unknown): PlanTier {
  return value === "pro" ? "pro" : "free";
}

function readAuthIntent(): { email?: string; mode?: AuthMode; returnSection?: Section } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_INTENT_KEY) ?? "null");
    const savedAt = typeof parsed?.savedAt === "string" ? Date.parse(parsed.savedAt) : 0;
    if (savedAt && Date.now() - savedAt > 1000 * 60 * 30) {
      localStorage.removeItem(AUTH_INTENT_KEY);
      return null;
    }
    const returnTo = typeof parsed?.returnTo === "string" ? parsed.returnTo : "";
    const returnHash = returnTo.includes("#") ? returnTo.slice(returnTo.lastIndexOf("#") + 1) : "";
    const returnSection = sections.includes(returnHash as Section) ? returnHash as Section : undefined;
    return {
      email: typeof parsed?.email === "string" ? parsed.email : "",
      mode: parsed?.mode === "signup" ? "signup" : "login",
      returnSection,
    };
  } catch {
    return null;
  }
}

function loadState(): { trades: Trade[]; rules: RiskRule[] } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (parsed?.trades && parsed?.rules) {
      return { trades: parsed.trades, rules: normalizeSavedRules(parsed.rules) };
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeSavedRules(rules: RiskRule[]) {
  const legacyDefaultLimits = new Map([
    ["daily-loss", 1500],
    ["trade-loss", 650],
    ["size", 5],
    ["streak", 3],
    ["profit-factor", 1.25],
    ["average-r", 0.2],
  ]);
  const isLegacyDefault = rules.every((rule) => legacyDefaultLimits.get(rule.id) === rule.limit);
  if (isLegacyDefault) {
    return defaultRules;
  }
  const currentRules = new Map(defaultRules.map((rule) => [rule.id, rule]));
  return rules.map((rule) => {
    const current = currentRules.get(rule.id);
    return current ? { ...current, limit: rule.limit, enabled: rule.enabled } : rule;
  });
}
