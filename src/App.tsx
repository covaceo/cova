import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  Download,
  FileUp,
  Fingerprint,
  Gauge,
  LockKeyhole,
  Mail,
  Upload,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  analyze,
  defaultRules,
  formatMoney,
  formatPercent,
  parseCsv,
  RiskRule,
  sampleTrades,
  Trade,
} from "./lib/risk";
import { getSupabaseClient, getSupabaseUserPlan } from "./lib/supabaseClient";
import { Hero } from "./components/MarketingHero";
import { CsvExplainer } from "./components/CsvExplainer";
import { StoryStrip } from "./components/StoryStrip";
import { GlassButton } from "./components/GlassButton";
import { CtaFooter, PlanStrip } from "./components/PlanSections";
import { RouteFrame } from "./components/LayoutShell";
import { AuthGate, AuthSheet } from "./components/AuthPanels";
import { CommunityPage, FeaturesPage, PricingPage, ResourcesPage } from "./components/MarketingPages";
import { Coach, Passport, PracticeLab, RulesEngine } from "./components/WorkspaceSections";
import { Dashboard } from "./components/DashboardView";
import { ImportDesk } from "./components/ImportDesk";
import { Navbar } from "./components/Navbar";
import { OAuthConnectPage } from "./components/OAuthConnectPage";
import { Toast } from "./components/Toast";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { getHostedLogoutUrl, isDemoPreviewEnabled } from "./lib/authEnvironment";
import { BROKER_STATUS_KEY, brokerMessageForStatus, readBrokerStatus, writeBrokerStatus, type BrokerStatus } from "./lib/brokerStatus";
import { PRACTICE_ACCOUNT_STORAGE_KEY, PRACTICE_TRADES_STORAGE_KEY, samplePracticeReps, type PracticeRep } from "./lib/backtesting";
import { buildFirmConnectUrl, canRedirectToFirmProvider, csvExportGuides, getFirmProviderHost, getPropFirm, propFirmOptions, type PropFirmId } from "./lib/propFirms";
import { isProtectedSection, sections, useHashSection, type Section } from "./lib/appRoutes";

const STORAGE_KEY = "cova-react-risk-os-v2";
const AUTH_SESSION_KEY = "cova-auth-session-v1";
const AUTH_INTENT_KEY = "cova-auth-intent-v1";
const OAUTH_FIRM_KEY = "cova-oauth-firm-v1";
const DEV_PREVIEW_EMAIL = "dev@cova.local";
type AuthMode = "login" | "signup";
type ImportMode = "append" | "replace";
type ToastTone = "info" | "success" | "warning";
type ToastState = { message: string; tone?: ToastTone } | null;

type PlanTier = "free" | "pro";
type Entitlements = {
  canEditAdvancedLimits: boolean;
  canExportPassport: boolean;
  canUseDirectSync: boolean;
  insightLimit: number;
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

const planEntitlements: Record<PlanTier, Entitlements> = {
  free: {
    canEditAdvancedLimits: false,
    canExportPassport: false,
    canUseDirectSync: false,
    insightLimit: 2,
    maxStoredTrades: 25,
    maxTradesPerImport: 25,
    plan: "free",
  },
  pro: {
    canEditAdvancedLimits: true,
    canExportPassport: true,
    canUseDirectSync: true,
    insightLimit: Number.POSITIVE_INFINITY,
    maxStoredTrades: Number.POSITIVE_INFINITY,
    maxTradesPerImport: Number.POSITIVE_INFINITY,
    plan: "pro",
  },
};

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
  const [practiceReps, setPracticeReps] = useState<PracticeRep[]>(() => loadAuthSession() ? loadState()?.practiceReps ?? samplePracticeReps : []);
  const isSignedIn = Boolean(authSession);
  const entitlements = planEntitlements[authSession?.plan ?? "free"];
  const analysis = useMemo(() => analyze(trades, rules), [trades, rules]);
  const hasSampleTrades = trades.some((trade) => trade.id.startsWith("demo-"));
  const hasReviewedTrades = trades.some((trade) => !trade.id.startsWith("demo-"));
  const isSampleReview = hasSampleTrades;
  const brokerLabel = brokerStatus?.connected
    ? `${brokerStatus.provider} linked`
    : hasSampleTrades
      ? hasReviewedTrades ? "Sample + CSV review" : "Sample funded review"
      : trades.length
        ? "CSV trade review"
        : "No trade history";

  useEffect(() => {
    if (isSignedIn) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ trades, rules, practiceReps }));
    }
  }, [isSignedIn, trades, rules, practiceReps]);

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
    setPracticeReps(saved?.practiceReps?.length ? saved.practiceReps : samplePracticeReps);
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
    localStorage.removeItem(PRACTICE_ACCOUNT_STORAGE_KEY);
    localStorage.removeItem(PRACTICE_TRADES_STORAGE_KEY);
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
    setPracticeReps([]);
    setStatus("Signed out. Account stats are hidden.");
    announce("Signed out. Account stats are hidden.", "info");
    if (isProtectedSection(section)) {
      setSection("overview");
    }
  }

  function signInAsDevPreview() {
    if (!isDemoPreviewEnabled()) {
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

    if (isDemoPreviewEnabled()) {
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
    if (!entitlements.canUseDirectSync) {
      setStatus("Direct account sync is a Pro feature. CSV import remains available on Free.");
      announce("Direct account sync is a Pro feature. Use CSV import or review Pro.", "warning");
      go("pricing");
      return;
    }
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
      <AuthSheet authIntentKey={AUTH_INTENT_KEY} mode={authMode} setMode={setAuthMode} close={() => setAuthMode(null)} onAuthenticated={completeAuth} onDevPreview={signInAsDevPreview} />
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
              {isSignedIn ? <WorkspaceShell brokerLabel={brokerLabel} email={authSession?.email} go={go} riskScore={analysis.score} section={section} signOut={signOut}><Dashboard analysis={analysis} brokerStatus={brokerStatus} rules={rules} go={go} /></WorkspaceShell> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={setAuthMode} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "import" && (
            <RouteFrame key="import">
              {isSignedIn ? <WorkspaceShell brokerLabel={brokerLabel} email={authSession?.email} go={go} riskScore={analysis.score} section={section} signOut={signOut}><ImportDesk entitlements={entitlements} importCsv={importCsv} openFirmOAuth={openFirmOAuth} status={status} reset={() => { const demoTrades = entitlements.plan === "free" ? sampleTrades.slice(0, entitlements.maxStoredTrades) : sampleTrades; setTrades(demoTrades); setRules(defaultRules); setStatus("Demo trades restored."); announce("Demo trades restored.", "success"); }} upgradeToPro={upgradeToPro} /></WorkspaceShell> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={setAuthMode} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "oauth" && (
            <RouteFrame key="oauth">
              {isSignedIn ? <WorkspaceShell brokerLabel={brokerLabel} email={authSession?.email} go={go} riskScore={analysis.score} section={section} signOut={signOut}><OAuthConnectPage firmId={oauthFirmId} onApprove={completeFirmOAuth} onCancel={cancelFirmOAuth} /></WorkspaceShell> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={setAuthMode} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "rules" && (
            <RouteFrame key="rules">
              {isSignedIn ? <WorkspaceShell brokerLabel={brokerLabel} email={authSession?.email} go={go} riskScore={analysis.score} section={section} signOut={signOut}><RulesEngine analysis={analysis} entitlements={entitlements} rules={rules} setRules={setRules} go={go} upgradeToPro={upgradeToPro} /></WorkspaceShell> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={setAuthMode} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "coach" && (
            <RouteFrame key="coach">
              {isSignedIn ? <WorkspaceShell brokerLabel={brokerLabel} email={authSession?.email} go={go} riskScore={analysis.score} section={section} signOut={signOut}><Coach analysis={analysis} entitlements={entitlements} go={go} upgradeToPro={upgradeToPro} /></WorkspaceShell> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={setAuthMode} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "practice" && (
            <RouteFrame key="practice">
              {isSignedIn ? <WorkspaceShell brokerLabel={brokerLabel} email={authSession?.email} go={go} riskScore={analysis.score} section={section} signOut={signOut}><PracticeLab practiceReps={practiceReps} setPracticeReps={(next) => setPracticeReps(next)} /></WorkspaceShell> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={setAuthMode} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "passport" && (
            <RouteFrame key="passport">
              {isSignedIn ? <WorkspaceShell brokerLabel={brokerLabel} email={authSession?.email} go={go} riskScore={analysis.score} section={section} signOut={signOut}><Passport analysis={analysis} entitlements={entitlements} isSampleReview={isSampleReview} sharePassport={sharePassport} go={go} upgradeToPro={upgradeToPro} /></WorkspaceShell> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={setAuthMode} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function getProCheckoutUrl() {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return env.VITE_STRIPE_PRO_PAYMENT_LINK || env.VITE_STRIPE_CHECKOUT_URL || "";
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

function loadState(): { trades: Trade[]; rules: RiskRule[]; practiceReps: PracticeRep[] } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (parsed?.trades && parsed?.rules) {
      return {
        trades: parsed.trades,
        rules: normalizeSavedRules(parsed.rules),
        practiceReps: normalizeSavedPracticeReps(parsed.practiceReps),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeSavedPracticeReps(value: unknown): PracticeRep[] {
  if (!Array.isArray(value)) {
    return samplePracticeReps;
  }
  return value.filter((rep): rep is PracticeRep => (
    typeof rep?.id === "string" &&
    typeof rep?.date === "string" &&
    typeof rep?.market === "string" &&
    typeof rep?.setup === "string" &&
    typeof rep?.session === "string" &&
    (rep?.direction === "Long" || rep?.direction === "Short") &&
    Number.isFinite(rep?.resultR)
  ));
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
