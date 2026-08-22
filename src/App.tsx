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
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
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
import { getSupabaseClient, getSupabaseUserPlan, hasSupabasePasswordRecoveryCallbackMarker, isSupabasePasswordRecoveryCallback, lockSupabaseLocally, signOutSupabase, updateSupabasePassword, verifySupabaseRecoveryIdentity } from "./lib/supabaseClient";

import { Hero } from "./components/MarketingHero";
import { CsvExplainer } from "./components/CsvExplainer";
import { StoryStrip } from "./components/StoryStrip";
import { GlassButton } from "./components/GlassButton";
import { CtaFooter, PlanStrip } from "./components/PlanSections";
import { RouteFrame } from "./components/LayoutShell";
import { AuthGate, AuthSheet } from "./components/AuthPanels";
import { CommunityPage, FeaturesPage, PricingPage, ResourcesPage } from "./components/MarketingPages";
import { PrivacyPage, SecurityPage, TermsPage } from "./components/LegalPages";

import { Coach, PASSPORT_PREFERENCES_STORAGE_KEY, Passport, PracticeLab, RulesEngine } from "./components/WorkspaceSections";
import { Dashboard } from "./components/DashboardView";
import { ImportDesk } from "./components/ImportDesk";
import { Navbar } from "./components/Navbar";
import { OAuthConnectPage } from "./components/OAuthConnectPage";
import { Toast } from "./components/Toast";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { getHostedLogoutUrl, isDemoPreviewEnabled } from "./lib/authEnvironment";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "./lib/legal";
import { BROKER_STATUS_KEY, brokerMessageForStatus, clearBrokerStatus, readBrokerStatus, writeBrokerStatus, type BrokerStatus } from "./lib/brokerStatus";
import { PRACTICE_ACCOUNT_STORAGE_KEY, PRACTICE_TRADES_STORAGE_KEY, samplePracticeReps, type PracticeRep } from "./lib/backtesting";
import { buildFirmConnectUrl, canRedirectToFirmProvider, csvExportGuides, getFirmProviderHost, getPropFirm, type PropFirmId } from "./lib/propFirms";
import { isProtectedSection, sections, useHashSection, type Section } from "./lib/appRoutes";
import { clearActiveStorageIdentity, removeScopedStorage, scopedStorageKey, setActiveStorageIdentity } from "./lib/storageScope";
import { getAccountSourceLabel } from "./lib/tradeSourceLabel";

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
  const [oauthFirmId, setOauthFirmId] = useState<PropFirmId>(() => readOAuthFirmId() ?? "tradovate");
  const [toast, setToast] = useState<ToastState>(null);
  const [status, setStatus] = useState("Trade history ready.");
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatus | null>(() => readBrokerStatus());
  const [trades, setTrades] = useState<Trade[]>(() => loadAuthSession() ? loadState()?.trades ?? sampleTrades : []);
  const [rules, setRules] = useState<RiskRule[]>(() => loadAuthSession() ? loadState()?.rules ?? defaultRules : defaultRules);
  const [practiceReps, setPracticeReps] = useState<PracticeRep[]>(() => loadAuthSession() ? loadState()?.practiceReps ?? samplePracticeReps : []);
  const [pendingSupabaseSession, setPendingSupabaseSession] = useState<SupabaseSession | null>(null);
  const [passwordRecoverySession, setPasswordRecoverySession] = useState<SupabaseSession | null>(null);
  const authGenerationRef = useRef(0);
  const identitySwitchGenerationRef = useRef(0);
  const activeProviderUserIdRef = useRef<string | null>(null);
  const pendingPolicyUserIdRef = useRef<string | null>(null);
  const passwordRecoveryUserIdRef = useRef<string | null>(null);
  const providerSessionRef = useRef<SupabaseSession | null>(null);
  const providerSessionsBlockedRef = useRef(false);
  const authCeremonyActiveRef = useRef(false);
  const providerAuthAttemptIdRef = useRef(0);
  const validatedAccessTokenRef = useRef("");
  const isSignedIn = Boolean(authSession);
  const entitlements = planEntitlements[authSession?.plan ?? "free"];
  const proCheckoutAvailable = Boolean(getProCheckoutUrl()) || isDemoPreviewEnabled();
  const analysis = useMemo(() => analyze(trades, rules), [trades, rules]);
  const hasSampleTrades = trades.some((trade) => trade.id.startsWith("demo-"));
  const isSampleReview = hasSampleTrades;
  const brokerLabel = getAccountSourceLabel(trades, brokerStatus);

  useEffect(() => {
    if (isSignedIn) {
      localStorage.setItem(scopedStorageKey(STORAGE_KEY), JSON.stringify({ trades, rules, practiceReps }));
    }
  }, [authSession?.email, authSession?.userId, isSignedIn, trades, rules, practiceReps]);

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
    const initialAuthGeneration = authGenerationRef.current;
    client.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (!mounted || initialAuthGeneration !== authGenerationRef.current || providerSessionsBlockedRef.current) {
        return;
      }
      if (!session?.user?.email) {
        invalidateProviderSession();
        lockWorkspace(false);
        return;
      }
      if (isSupabasePasswordRecoveryCallback(session.access_token)) {
        beginPasswordRecovery(session);
        return;
      }
      startSupabaseValidation(session);
    }).catch(() => {
      if (!mounted || initialAuthGeneration !== authGenerationRef.current || providerSessionsBlockedRef.current) return;
      invalidateProviderSession();
      handleSupabaseAuthFailure();
    });

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!session?.user?.email) {
        if (event === "SIGNED_OUT") {
          providerSessionsBlockedRef.current = true;
          passwordRecoveryUserIdRef.current = null;
          setPasswordRecoverySession(null);
        }
        invalidateProviderSession();
        lockWorkspace(event === "SIGNED_OUT");
        return;
      }
      if (providerSessionsBlockedRef.current) {
        return;
      }
      if (event === "PASSWORD_RECOVERY") {
        beginPasswordRecovery(session);
        return;
      }
      if (passwordRecoveryUserIdRef.current === session.user.id) {
        authGenerationRef.current += 1;
        providerSessionRef.current = session;
        validatedAccessTokenRef.current = "";
        setPasswordRecoverySession(session);
        return;
      }
      const sameKnownUser = activeProviderUserIdRef.current === session.user.id || pendingPolicyUserIdRef.current === session.user.id;
      if ((event === "TOKEN_REFRESHED" || event === "USER_UPDATED" || event === "SIGNED_IN") && sameKnownUser) {
        adoptSupabaseSession(session);
        return;
      }
      prepareSupabaseIdentity(session);
      window.setTimeout(() => {
        if (mounted) {
          startSupabaseValidation(session);
        }
      }, 0);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isDemoPreviewEnabled()) {
      return;
    }
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

    writeBrokerStatus(nextStatus);
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

  const openAuth = useCallback((mode: AuthMode) => {
    setAuthMode(mode);
  }, []);

  function startProviderAuthAttempt() {
    invalidateProviderSession();
    providerSessionsBlockedRef.current = false;
    authCeremonyActiveRef.current = true;
    providerAuthAttemptIdRef.current += 1;
    return providerAuthAttemptIdRef.current;
  }

  function abortProviderAuthAttempt(attemptId: number) {
    if (attemptId !== providerAuthAttemptIdRef.current) return;
    providerAuthAttemptIdRef.current += 1;
    authCeremonyActiveRef.current = false;
    providerSessionsBlockedRef.current = true;
    invalidateProviderSession();
  }

  function isProviderAuthSessionCurrent(session: SupabaseSession, attemptId: number) {
    const accepted = providerSessionRef.current;
    return (
      attemptId === providerAuthAttemptIdRef.current &&
      !providerSessionsBlockedRef.current &&
      (authCeremonyActiveRef.current || accepted?.access_token === session.access_token)
    );
  }

  async function discardResolvedAuthSession(session: SupabaseSession) {
    const client = getSupabaseClient();
    if (!client) {
      lockSupabaseLocally();
      return;
    }

    let matchesLateSession = false;
    try {
      const { data } = await client.auth.getSession();
      if (data.session?.access_token !== session.access_token) return;
      matchesLateSession = true;
      authCeremonyActiveRef.current = false;
      providerSessionsBlockedRef.current = true;
      invalidateProviderSession();
      lockSupabaseLocally();
      await Promise.race([
        client.auth.signOut({ scope: "local" }),
        new Promise((resolve) => window.setTimeout(resolve, 3_000)),
      ]);
    } finally {
      if (matchesLateSession) lockSupabaseLocally();
    }
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
    setActiveStorageIdentity(userId || emailAddress);
    const saved = loadState();
    authCeremonyActiveRef.current = false;
    activeProviderUserIdRef.current = source === "supabase" ? userId || null : null;
    pendingPolicyUserIdRef.current = null;
    passwordRecoveryUserIdRef.current = null;
    setAuthSession(session);
    setPendingSupabaseSession(null);
    setPasswordRecoverySession(null);
    setBrokerStatus(readBrokerStatus());
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

  function invalidateProviderSession() {
    authGenerationRef.current += 1;
    providerSessionRef.current = null;
    validatedAccessTokenRef.current = "";
  }

  function isCurrentSupabaseTask(session: SupabaseSession, generation: number) {
    const current = providerSessionRef.current;
    return (
      authGenerationRef.current === generation &&
      current?.access_token === session.access_token &&
      current?.user.id === session.user.id
    );
  }

  function hasDeletionIdentityContinuity(userId: string, identityGeneration: number) {
    const currentUserId = providerSessionRef.current?.user.id;
    return (
      identitySwitchGenerationRef.current === identityGeneration &&
      (!currentUserId || currentUserId === userId)
    );
  }

  function adoptSupabaseSession(session: SupabaseSession) {
    authGenerationRef.current += 1;
    providerSessionRef.current = session;
    validatedAccessTokenRef.current = session.access_token;
    if (pendingPolicyUserIdRef.current === session.user.id) {
      setPendingSupabaseSession(session);
    }
    if (activeProviderUserIdRef.current === session.user.id && session.user.email) {
      setAuthSession((current) => current?.source === "supabase" && current.userId === session.user.id
        ? { ...current, email: session.user.email || current.email, plan: normalizePlan(getSupabaseUserPlan(session.user)) }
        : current);
    }
  }

  function prepareSupabaseIdentity(session: SupabaseSession) {
    const knownUserId = activeProviderUserIdRef.current || pendingPolicyUserIdRef.current || passwordRecoveryUserIdRef.current;
    const switchingIdentity = Boolean(knownUserId && knownUserId !== session.user.id);
    if (switchingIdentity) {
      identitySwitchGenerationRef.current += 1;
      authGenerationRef.current += 1;
      providerAuthAttemptIdRef.current += 1;
      authCeremonyActiveRef.current = false;
      providerSessionRef.current = null;
      validatedAccessTokenRef.current = "";
      hideWorkspaceForAuthCheck();
      activeProviderUserIdRef.current = null;
      pendingPolicyUserIdRef.current = null;
      passwordRecoveryUserIdRef.current = null;
      setPendingSupabaseSession(null);
      setPasswordRecoverySession(null);
      setAuthMode(null);
    }
  }

  function beginPasswordRecovery(session: SupabaseSession) {
    authCeremonyActiveRef.current = true;
    prepareSupabaseIdentity(session);
    authGenerationRef.current += 1;
    providerSessionRef.current = session;
    validatedAccessTokenRef.current = "";
    activeProviderUserIdRef.current = null;
    pendingPolicyUserIdRef.current = null;
    passwordRecoveryUserIdRef.current = session.user.id;
    setPendingSupabaseSession(null);
    setPasswordRecoverySession(session);
    hideWorkspaceForAuthCheck();
    setAuthMode("login");
  }

  function isCurrentPasswordRecoveryTask(session: SupabaseSession, generation: number, identityGeneration: number) {
    const current = providerSessionRef.current;
    return (
      !providerSessionsBlockedRef.current &&
      authGenerationRef.current === generation &&
      identitySwitchGenerationRef.current === identityGeneration &&
      passwordRecoveryUserIdRef.current === session.user.id &&
      current?.user.id === session.user.id &&
      current.access_token === session.access_token
    );
  }

  async function updatePendingPassword(password: string) {
    const session = providerSessionRef.current;
    if (!session?.access_token || !session.user.email || passwordRecoveryUserIdRef.current !== session.user.id) {
      throw new Error("This password reset session expired. Request a new reset link.");
    }
    const generation = authGenerationRef.current;
    const identityGeneration = identitySwitchGenerationRef.current;
    const verified = await verifySupabaseRecoveryIdentity(session.access_token, session.user.id);
    if (verified.error) throw verified.error;
    if (!isCurrentPasswordRecoveryTask(session, generation, identityGeneration)) {
      throw new Error("This password reset session changed. Request a new reset link.");
    }
    const updated = await updateSupabasePassword(password, session.access_token, session.user.id);
    if (updated.error) throw updated.error;
    if (!isCurrentPasswordRecoveryTask(session, generation, identityGeneration)) {
      throw new Error("This password reset session changed. Sign in with your new password.");
    }
  }

  function finishPasswordRecovery() {
    const session = providerSessionRef.current || passwordRecoverySession;
    if (!session?.user?.email || passwordRecoveryUserIdRef.current !== session.user.id) {
      announce("This password reset session expired. Request a new reset link.", "warning");
      return;
    }
    passwordRecoveryUserIdRef.current = null;
    setPasswordRecoverySession(null);
    window.history.replaceState(null, "", window.location.pathname);
    startSupabaseValidation(session);
  }

  function startSupabaseValidation(session: SupabaseSession) {
    if (providerSessionsBlockedRef.current) {
      return;
    }
    prepareSupabaseIdentity(session);
    const current = providerSessionRef.current;
    if (current?.access_token !== session.access_token || current.user.id !== session.user.id) {
      authGenerationRef.current += 1;
      providerSessionRef.current = session;
      validatedAccessTokenRef.current = "";
    }
    const generation = authGenerationRef.current;
    void completeSupabaseAuth(session, generation).catch(() => {
      if (isCurrentSupabaseTask(session, generation)) {
        validatedAccessTokenRef.current = "";
        handleSupabaseAuthFailure();
      }
    });
  }

  async function completeSupabaseAuth(session: SupabaseSession, generation: number) {
    const accessToken = session.access_token;
    const user = session.user;
    if (!accessToken || !user.email || validatedAccessTokenRef.current === accessToken) {
      return;
    }
    validatedAccessTokenRef.current = accessToken;

    try {
      const consent = await fetchPolicyAcceptance(accessToken, "GET");
      if (!isCurrentSupabaseTask(session, generation)) {
        return;
      }
      if (!consent.accepted) {
        hideWorkspaceForAuthCheck();
        pendingPolicyUserIdRef.current = user.id;
        setPendingSupabaseSession(session);
        setAuthMode("signup");
        announce("Confirm the current Terms and Privacy Policy to finish account setup.", "warning");
        return;
      }

      pendingPolicyUserIdRef.current = null;
      setPendingSupabaseSession(null);
      const authIntent = readAuthIntent();
      completeAuth(user.email, authIntent?.mode ?? "login", "supabase", normalizePlan(getSupabaseUserPlan(user)), user.id);
    } catch (error) {
      if (isCurrentSupabaseTask(session, generation)) {
        validatedAccessTokenRef.current = "";
      }
      throw error;
    }
  }

  async function acceptPendingPolicies() {
    const session = pendingSupabaseSession;
    if (!session?.access_token || !session.user.email) {
      throw new Error("The verified member session expired. Sign in again.");
    }
    const generation = authGenerationRef.current;
    if (!isCurrentSupabaseTask(session, generation)) {
      throw new Error("The verified member session changed. Sign in again.");
    }
    const consent = await fetchPolicyAcceptance(session.access_token, "POST");
    if (!isCurrentSupabaseTask(session, generation) || !consent.accepted) {
      throw new Error("Cova could not record policy acceptance.");
    }
    pendingPolicyUserIdRef.current = null;
    setPendingSupabaseSession(null);
    validatedAccessTokenRef.current = session.access_token;
    const authIntent = readAuthIntent();
    completeAuth(session.user.email, authIntent?.mode ?? "signup", "supabase", normalizePlan(getSupabaseUserPlan(session.user)), session.user.id);
  }

  async function closeAuthSheet() {
    if (pendingSupabaseSession || passwordRecoverySession || authCeremonyActiveRef.current || hasSupabasePasswordRecoveryCallbackMarker()) {
      passwordRecoveryUserIdRef.current = null;
      setPasswordRecoverySession(null);
      lockSupabaseLocally();
      lockWorkspace(false);
      const result = await signOutSupabase();
      if (result.error) {
        announce("Signed out on this device. Server session revocation could not be confirmed.", "warning");
      }
      return;
    }
    setAuthMode(null);
  }

  async function inspectPendingProviders() {
    const session = pendingSupabaseSession;
    if (!session?.access_token) {
      throw new Error("The verified member session expired. Sign in again.");
    }
    const generation = authGenerationRef.current;
    if (!isCurrentSupabaseTask(session, generation)) {
      throw new Error("The verified member session changed. Sign in again.");
    }
    const response = await fetch("/api/connectors/status", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) as { providers?: Array<{ provider?: string }> } : {};
    if (!isCurrentSupabaseTask(session, generation) || !response?.ok || !Array.isArray(payload.providers)) {
      throw new Error("Cova could not inspect saved provider credentials.");
    }
    const connected = [...new Set(payload.providers.map((provider) => String(provider.provider || "").trim()).filter(Boolean))];
    announce(connected.length ? `Saved provider credentials: ${connected.join(", ")}.` : "No saved provider credentials were found.", "info");
  }

  async function disconnectPendingProviders() {
    const session = pendingSupabaseSession;
    if (!session?.access_token) {
      throw new Error("The verified member session expired. Sign in again.");
    }
    const generation = authGenerationRef.current;
    if (!isCurrentSupabaseTask(session, generation)) {
      throw new Error("The verified member session changed. Sign in again.");
    }
    const response = await fetch("/api/connectors/disconnect", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider: "all" }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    if (!isCurrentSupabaseTask(session, generation) || !response?.ok) {
      throw new Error("Cova could not confirm provider credential deletion.");
    }
    announce("Saved provider credentials were disconnected.", "success");
  }

  async function deletePendingAccount() {
    const session = pendingSupabaseSession;
    if (!session?.access_token || !session.user.id) {
      throw new Error("The verified member session expired. Sign in again.");
    }
    const confirmed = window.confirm("Permanently delete this Cova account, stored connector tokens, and this account's Cova data on this device? This cannot be undone.");
    if (!confirmed) {
      return;
    }
    const deletionIdentityGeneration = identitySwitchGenerationRef.current;
    authGenerationRef.current += 1;
    const response = await fetch("/api/account/delete", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) as { deleted?: boolean; error?: string } : {};
    if (!response?.ok || !data.deleted) {
      throw new Error(data.error || "Account deletion could not be completed.");
    }
    if (!hasDeletionIdentityContinuity(session.user.id, deletionIdentityGeneration)) {
      announce("Account deleted. The browser identity changed, so its local data was left untouched.", "warning");
      return;
    }
    setActiveStorageIdentity(session.user.id);
    const deviceCleanupConfirmed = tryPurgeCurrentAccountDeviceData();
    lockSupabaseLocally();
    lockWorkspace(false);
    await settleWithin(signOutSupabase(), 5_000).catch(() => undefined);
    announce(deviceCleanupConfirmed ? "Your Cova account and connector records were deleted." : "Account deleted. Browser storage cleanup could not be fully confirmed.", deviceCleanupConfirmed ? "success" : "warning");
  }

  function handleSupabaseAuthFailure() {
    hideWorkspaceForAuthCheck();
    announce("Account verification is temporarily unavailable. Reload to retry.", "warning");
  }

  function hideWorkspaceForAuthCheck() {
    setAuthSession(null);
    setBrokerStatus(null);
    setMobileOpen(false);
    setTrades([]);
    setRules(defaultRules);
    setPracticeReps([]);
    setStatus("Account verification pending.");
    if (isProtectedSection(section)) {
      setSection("overview");
    }
  }

  function purgeCurrentAccountDeviceData() {
    removeScopedStorage(STORAGE_KEY);
    removeScopedStorage(BROKER_STATUS_KEY);
    removeScopedStorage(PRACTICE_ACCOUNT_STORAGE_KEY);
    removeScopedStorage(PRACTICE_TRADES_STORAGE_KEY);
    removeScopedStorage(PASSPORT_PREFERENCES_STORAGE_KEY);
    localStorage.removeItem("cova-dashboard-focus-v1");
    localStorage.removeItem("cova-dashboard-range-v1");
  }

  function tryPurgeCurrentAccountDeviceData() {
    try {
      purgeCurrentAccountDeviceData();
      return true;
    } catch {
      return false;
    }
  }

  function lockWorkspace(announceChange = true) {
    providerSessionsBlockedRef.current = true;
    authCeremonyActiveRef.current = false;
    providerAuthAttemptIdRef.current += 1;
    invalidateProviderSession();
    activeProviderUserIdRef.current = null;
    pendingPolicyUserIdRef.current = null;
    passwordRecoveryUserIdRef.current = null;
    try {
      localStorage.removeItem(AUTH_SESSION_KEY);
      localStorage.removeItem(AUTH_INTENT_KEY);
      localStorage.removeItem(OAUTH_FIRM_KEY);
      clearActiveStorageIdentity();
    } catch {
      // State is still locked below when browser storage is unavailable.
    }
    setAuthSession(null);
    setPendingSupabaseSession(null);
    setPasswordRecoverySession(null);
    setBrokerStatus(null);
    setAuthMode(null);
    setMobileOpen(false);
    setTrades([]);
    setRules(defaultRules);
    setPracticeReps([]);
    setStatus("Signed out. Account stats are hidden.");
    if (announceChange) {
      announce("Signed out. Account stats are hidden.", "info");
    }
    if (isProtectedSection(section)) {
      setSection("overview");
    }
  }

  async function signOut() {
    const source = authSession?.source;
    const accessToken = providerSessionRef.current?.access_token || pendingSupabaseSession?.access_token || "";
    lockSupabaseLocally();
    lockWorkspace(true);

    let cleanupFailed = false;
    if (source !== "local-preview") {
      if (accessToken) {
        const response = await fetch("/api/connectors/disconnect", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider: "all" }),
          signal: AbortSignal.timeout(5_000),
        }).catch(() => null);
        cleanupFailed ||= !response?.ok;
      } else {
        cleanupFailed = true;
      }
    }

    const signOutResult = await settleWithin(signOutSupabase(), 5_000).catch(() => ({ error: new Error("Sign-out timed out.") }));
    cleanupFailed ||= Boolean(signOutResult.error);
    const logoutUrl = getHostedLogoutUrl();
    if (logoutUrl) {
      const response = await fetch(logoutUrl, {
        method: "POST",
        credentials: "include",
        signal: AbortSignal.timeout(5_000),
      }).catch(() => null);
      cleanupFailed ||= !response?.ok;
    }
    if (cleanupFailed) {
      announce("Signed out locally. Remote session or connector cleanup could not be fully confirmed.", "warning");
    }
  }

  async function deleteAccount() {
    if (!authSession) {
      return;
    }
    const deletingUserId = authSession.userId;
    const deletionSession = providerSessionRef.current;
    const confirmed = window.confirm("Permanently delete your Cova account, stored connector tokens, and this device's Cova data? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    if (authSession.source === "local-preview") {
      const deviceCleanupConfirmed = tryPurgeCurrentAccountDeviceData();
      await signOut();
      announce(deviceCleanupConfirmed ? "Demo account data was removed from this device." : "Demo account closed. Browser storage cleanup could not be fully confirmed.", deviceCleanupConfirmed ? "success" : "warning");
      return;
    }

    if (
      !deletingUserId ||
      !deletionSession?.access_token ||
      deletionSession.user.id !== deletingUserId ||
      validatedAccessTokenRef.current !== deletionSession.access_token
    ) {
      hideWorkspaceForAuthCheck();
      announce("The verified account changed. Reload before trying account deletion again.", "warning");
      return;
    }

    const deletionIdentityGeneration = identitySwitchGenerationRef.current;
    authGenerationRef.current += 1;

    try {
      const response = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${deletionSession.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      const data = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !data.deleted) {
        throw new Error(data.error || "Account deletion could not be completed.");
      }
      if (!hasDeletionIdentityContinuity(deletingUserId, deletionIdentityGeneration)) {
        announce("Account deleted. The browser identity changed, so its local data was left untouched.", "warning");
        return;
      }
      setActiveStorageIdentity(deletingUserId);
      const deviceCleanupConfirmed = tryPurgeCurrentAccountDeviceData();
      lockSupabaseLocally();
      lockWorkspace(false);
      const remoteCleanup = await settleWithin(signOutSupabase(), 5_000).catch(() => ({ error: new Error("Sign-out timed out.") }));
      const cleanupConfirmed = deviceCleanupConfirmed && !remoteCleanup.error;
      announce(cleanupConfirmed ? "Your Cova account and connector records were deleted." : "Account deleted. Browser or remote session cleanup could not be fully confirmed.", cleanupConfirmed ? "success" : "warning");
    } catch (error) {
      announce(error instanceof Error ? error.message : "Account deletion could not be completed.", "warning");
    }
  }

  function signInAsDevPreview() {
    if (!isDemoPreviewEnabled()) {
      openAuth("login");
      return;
    }
    completeAuth(DEV_PREVIEW_EMAIL, "login", "local-preview", "pro");
  }

  function upgradeToPro() {
    const checkoutUrl = getProCheckoutUrl();
    if (!checkoutUrl && !isDemoPreviewEnabled()) {
      announce("Pro checkout is not open yet. Keep using Free while billing is prepared.", "warning");
      return;
    }

    if (!authSession) {
      openAuth("signup");
      announce("Create a free account first, then choose Pro.", "info");
      return;
    }

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
    if (firmId === "topstepx") {
      localStorage.removeItem(OAUTH_FIRM_KEY);
      setStatus("TopstepX is available through CSV import only.");
      announce("TopstepX is CSV-only. Upload an export from Trade History.", "info");
      go("import");
      return;
    }
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
    if (firmId === "topstepx") {
      localStorage.removeItem(OAUTH_FIRM_KEY);
      setStatus("TopstepX is available through CSV import only.");
      announce("TopstepX direct linking is unavailable. Use CSV import.", "warning");
      go("import");
      return;
    }
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
      openAuth("login");
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
    if (mode === "replace" && brokerStatus?.mode === "ephemeral") {
      clearBrokerStatus();
      setBrokerStatus(null);
    }

    const limited = acceptedTrades.length < imported.length;
    setStatus(`${mode === "replace" ? "Replaced trade history with" : "Imported"} ${acceptedTrades.length} trade${acceptedTrades.length === 1 ? "" : "s"}${limited ? " for the free preview" : ""}.`);
    announce(limited ? `Free preview imported ${acceptedTrades.length}/${imported.length} rows.` : `${mode === "replace" ? "Trade history replaced" : "Trades imported"}: ${acceptedTrades.length} row${acceptedTrades.length === 1 ? "" : "s"}.`, limited ? "warning" : "success");
    go("dashboard");
  }

  function openPassport() {
    if (!isSignedIn) {
      go("passport");
      openAuth("login");
      announce("Sign in to open your Risk Passport.", "info");
      return;
    }
    go("passport");
  }

  return (
    <div className={`min-h-screen bg-black text-white ${section === "dashboard" ? "oa-dashboard-app" : ""}`}>
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.055),transparent_30%),linear-gradient(180deg,#000,rgba(1,9,6,0.94))]" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-grid opacity-70" />

      {(section !== "practice" || !authSession) && (
        <Navbar
          section={section}
          go={go}
          openAuth={openAuth}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          authSession={authSession}
          riskScore={analysis.score}
          signOut={signOut}
          deleteAccount={deleteAccount}
        />
      )}
      <AuthSheet
        authIntentKey={AUTH_INTENT_KEY}
        mode={authMode}
        setMode={openAuth}
        close={() => { void closeAuthSheet(); }}
        onAuthenticated={completeAuth}
        onAuthAttemptAborted={abortProviderAuthAttempt}
        onAuthSessionIsCurrent={isProviderAuthSessionCurrent}
        onAuthAttemptStarted={startProviderAuthAttempt}
        onDeleteRestrictedAccount={deletePendingAccount}
        onDevPreview={signInAsDevPreview}
        onDiscardAuthSession={discardResolvedAuthSession}
        onDisconnectProviders={disconnectPendingProviders}
        onInspectProviders={inspectPendingProviders}
        onPasswordRecovered={finishPasswordRecovery}
        onPolicyAccepted={acceptPendingPolicies}
        onUpdatePassword={updatePendingPassword}
        passwordRecovery={Boolean(passwordRecoverySession)}
        pendingPolicyConfirmation={Boolean(pendingSupabaseSession)}
      />
      <Toast toast={toast} />

      <main className="relative z-10">
        <AnimatePresence mode="wait">
          {section === "overview" && (
            <RouteFrame key="overview">
              <Hero go={go} openAuth={openAuth} isSignedIn={isSignedIn} />
              <StoryStrip />
              <PlanStrip currentPlan={authSession?.plan ?? null} go={go} openAuth={openAuth} proCheckoutAvailable={proCheckoutAvailable} upgradeToPro={upgradeToPro} />
              <CtaFooter go={go} isSignedIn={isSignedIn} openAuth={openAuth} openPassport={openPassport} />
            </RouteFrame>
          )}
          {section === "features" && (
            <RouteFrame key="features">
              <FeaturesPage go={go} openAuth={openAuth} />
            </RouteFrame>
          )}
          {section === "pricing" && (
            <RouteFrame key="pricing">
              <PricingPage currentPlan={authSession?.plan ?? null} go={go} openAuth={openAuth} proCheckoutAvailable={proCheckoutAvailable} upgradeToPro={upgradeToPro} />
            </RouteFrame>
          )}
          {section === "resources" && (
            <RouteFrame key="resources">
              <ResourcesPage go={go} openAuth={openAuth} />
            </RouteFrame>
          )}
          {section === "community" && (
            <RouteFrame key="community">
              <CommunityPage go={go} />
            </RouteFrame>
          )}
          {section === "privacy" && (
            <RouteFrame key="privacy">
              <PrivacyPage go={go} />
            </RouteFrame>
          )}
          {section === "terms" && (
            <RouteFrame key="terms">
              <TermsPage go={go} />
            </RouteFrame>
          )}
          {section === "security" && (
            <RouteFrame key="security">
              <SecurityPage go={go} />
            </RouteFrame>
          )}
          {section === "dashboard" && (
            <RouteFrame key="dashboard">
              {isSignedIn ? <WorkspaceShell brokerLabel={brokerLabel} deleteAccount={deleteAccount} email={authSession?.email} go={go} riskScore={analysis.score} section={section} signOut={signOut}><Dashboard analysis={analysis} rules={rules} go={go} /></WorkspaceShell> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={openAuth} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "import" && (
            <RouteFrame key="import">
              {isSignedIn ? <WorkspaceShell brokerLabel={brokerLabel} deleteAccount={deleteAccount} email={authSession?.email} go={go} riskScore={analysis.score} section={section} signOut={signOut}><ImportDesk entitlements={entitlements} importCsv={importCsv} openFirmOAuth={openFirmOAuth} status={status} reset={() => { const demoTrades = entitlements.plan === "free" ? sampleTrades.slice(0, entitlements.maxStoredTrades) : sampleTrades; setTrades(demoTrades); setRules(defaultRules); clearBrokerStatus(); window.dispatchEvent(new CustomEvent("cova:broker-status")); setStatus("Demo trades restored."); announce("Demo trades restored.", "success"); }} upgradeToPro={upgradeToPro} /></WorkspaceShell> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={openAuth} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "oauth" && (
            <RouteFrame key="oauth">
              {isSignedIn ? <WorkspaceShell brokerLabel={brokerLabel} deleteAccount={deleteAccount} email={authSession?.email} go={go} riskScore={analysis.score} section={section} signOut={signOut}><OAuthConnectPage firmId={oauthFirmId} onApprove={completeFirmOAuth} onCancel={cancelFirmOAuth} /></WorkspaceShell> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={openAuth} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "rules" && (
            <RouteFrame key="rules">
              {isSignedIn ? <WorkspaceShell brokerLabel={brokerLabel} deleteAccount={deleteAccount} email={authSession?.email} go={go} riskScore={analysis.score} section={section} signOut={signOut}><RulesEngine analysis={analysis} entitlements={entitlements} rules={rules} setRules={setRules} go={go} upgradeToPro={upgradeToPro} /></WorkspaceShell> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={openAuth} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "coach" && (
            <RouteFrame key="coach">
              {isSignedIn ? <WorkspaceShell brokerLabel={brokerLabel} deleteAccount={deleteAccount} email={authSession?.email} go={go} riskScore={analysis.score} section={section} signOut={signOut}><Coach analysis={analysis} entitlements={entitlements} go={go} upgradeToPro={upgradeToPro} /></WorkspaceShell> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={openAuth} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "practice" && (
            <RouteFrame key="practice">
              {isSignedIn ? <PracticeLab key={authSession?.userId || authSession?.email} go={go} practiceReps={practiceReps} setPracticeReps={(next) => setPracticeReps(next)} /> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={openAuth} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
          {section === "passport" && (
            <RouteFrame key="passport">
              {isSignedIn ? <WorkspaceShell brokerLabel={brokerLabel} deleteAccount={deleteAccount} email={authSession?.email} go={go} riskScore={analysis.score} section={section} signOut={signOut}><Passport analysis={analysis} entitlements={entitlements} isSampleReview={isSampleReview} go={go} upgradeToPro={upgradeToPro} /></WorkspaceShell> : <AuthGate devPreviewEmail={DEV_PREVIEW_EMAIL} openAuth={openAuth} onDevPreview={signInAsDevPreview} />}
            </RouteFrame>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

type PolicyAcceptanceStatus = {
  accepted: boolean;
  privacyVersion: string;
  termsVersion: string;
};

async function fetchPolicyAcceptance(accessToken: string, method: "GET" | "POST"): Promise<PolicyAcceptanceStatus> {
  const response = await fetch("/api/auth/consent", {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "POST" ? JSON.stringify({ termsVersion: CURRENT_TERMS_VERSION, privacyVersion: CURRENT_PRIVACY_VERSION }) : undefined,
    credentials: "include",
  });
  const payload = await response.json().catch(() => ({})) as Partial<PolicyAcceptanceStatus> & { error?: string };
  if (!response.ok || typeof payload.accepted !== "boolean") {
    throw new Error(payload.error || "Cova could not verify policy acceptance.");
  }
  return {
    accepted: payload.accepted,
    privacyVersion: String(payload.privacyVersion || ""),
    termsVersion: String(payload.termsVersion || ""),
  };
}

async function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      window.setTimeout(() => reject(new Error("Operation timed out.")), timeoutMs);
    }),
  ]);
}

function getProCheckoutUrl() {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return env.VITE_STRIPE_PRO_PAYMENT_LINK || env.VITE_STRIPE_CHECKOUT_URL || "";
}

function loadAuthSession(): AuthSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) ?? "null");
    if (typeof parsed?.email === "string" && typeof parsed?.signedInAt === "string") {
      const source = parsed.source === "supabase" ? "supabase" : parsed.source === "hosted" ? "hosted" : "local-preview";
      if (source !== "local-preview" || !isDemoPreviewEnabled()) {
        return null;
      }
      const userId = typeof parsed.userId === "string" ? parsed.userId : undefined;
      setActiveStorageIdentity(userId || parsed.email);
      return {
        email: parsed.email,
        mode: parsed.mode === "signup" ? "signup" : "login",
        plan: normalizePlan(parsed.plan),
        signedInAt: parsed.signedInAt,
        source,
        subscriptionStatus: parsed.subscriptionStatus === "active" || parsed.subscriptionStatus === "preview" ? parsed.subscriptionStatus : "none",
        userId,
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
    return saved === "tradovate" ? "tradovate" : null;
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
    const parsed = JSON.parse(localStorage.getItem(scopedStorageKey(STORAGE_KEY)) ?? "null");
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
