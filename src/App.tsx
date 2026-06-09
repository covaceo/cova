import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  Check,
  ChevronDown,
  CircleDot,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Fingerprint,
  Gauge,
  LockKeyhole,
  Mail,
  Menu,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

const STORAGE_KEY = "cova-react-risk-os-v2";
const AUTH_INTENT_KEY = "cova-wix-auth-intent";
const BROKER_STATUS_KEY = "cova-tradovate-status-v1";
const sections = ["overview", "dashboard", "import", "rules", "coach", "passport"] as const;
type Section = (typeof sections)[number];
type AuthMode = "login" | "signup";
type ImportMode = "append" | "replace";
type TimeRange = "today" | "week" | "all";
type ToastTone = "info" | "success" | "warning";
type ToastState = { message: string; tone?: ToastTone } | null;
type BrokerStatus = {
  provider: "Tradovate";
  status: "connected" | "token-received-needs-storage" | "needs-storage" | "missing-env" | "token-error" | "state-mismatch" | "error" | "not-connected" | "api-unavailable";
  connected: boolean;
  connectionId?: string;
  message: string;
  updatedAt: string;
};

const nav = [
  { id: "overview", label: "Home" },
  { id: "import", label: "Upload" },
  { id: "dashboard", label: "Review" },
  { id: "rules", label: "Limits" },
  { id: "coach", label: "Insights" },
  { id: "passport", label: "Passport" },
] satisfies { id: Section; label: string }[];

const storyFrameImages = [
  "/media/cova-story-frame-01.png",
  "/media/cova-story-frame-02.png",
  "/media/cova-story-frame-03.png",
  "/media/cova-story-frame-04.png",
] as const;

const planOptions = [
  {
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
      "No Wix member sync",
    ],
  },
  {
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
      "Export tools and Wix member access",
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

export default function App() {
  const [section, setSection] = useHashSection();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [status, setStatus] = useState("Trade history ready.");
  const [trades, setTrades] = useState<Trade[]>(() => loadState()?.trades ?? sampleTrades);
  const [rules, setRules] = useState<RiskRule[]>(() => loadState()?.rules ?? defaultRules);
  const analysis = useMemo(() => analyze(trades, rules), [trades, rules]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ trades, rules }));
  }, [trades, rules]);

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
    let pendingGlassPointer: { clientX: number; clientY: number; target: EventTarget | null } | null = null;
    let glassFrame: number | null = null;

    function applyGlassLight() {
      glassFrame = null;
      if (!pendingGlassPointer || !(pendingGlassPointer.target instanceof Element)) {
        return;
      }
      const surface = pendingGlassPointer.target.closest<HTMLElement>(selector);
      if (!surface) {
        return;
      }
      const rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      const x = clamp(((pendingGlassPointer.clientX - rect.left) / rect.width) * 100);
      const y = clamp(((pendingGlassPointer.clientY - rect.top) / rect.height) * 100);
      surface.style.setProperty("--glass-x", `${x.toFixed(1)}%`);
      surface.style.setProperty("--glass-y", `${y.toFixed(1)}%`);
    }

    function updateGlassLight(event: PointerEvent) {
      pendingGlassPointer = { clientX: event.clientX, clientY: event.clientY, target: event.target };
      if (glassFrame === null) {
        glassFrame = window.requestAnimationFrame(applyGlassLight);
      }
    }

    function clearGlassLight(event: PointerEvent) {
      if (!(event.target instanceof Element)) {
        return;
      }
      const surface = event.target.closest<HTMLElement>(selector);
      if (!surface || (event.relatedTarget instanceof Node && surface.contains(event.relatedTarget))) {
        return;
      }
      surface.style.removeProperty("--glass-x");
      surface.style.removeProperty("--glass-y");
    }

    window.addEventListener("pointermove", updateGlassLight, { passive: true });
    window.addEventListener("pointerout", clearGlassLight, { passive: true });
    return () => {
      if (glassFrame !== null) {
        window.cancelAnimationFrame(glassFrame);
      }
      window.removeEventListener("pointermove", updateGlassLight);
      window.removeEventListener("pointerout", clearGlassLight);
    };
  }, []);

  function go(next: Section) {
    setMobileOpen(false);
    setSection(next);
  }

  function announce(message: string, tone: ToastTone = "info") {
    setToast({ message, tone });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 2800);
  }

  function importCsv(text: string, mode: ImportMode = "append") {
    const imported = parseCsv(text);
    if (!imported.length) {
      setStatus("No valid trade rows found.");
      announce("No valid trade rows found.", "warning");
      return;
    }
    setTrades((current) => mode === "replace" ? imported : [...current, ...imported]);
    setStatus(`${mode === "replace" ? "Replaced trade history with" : "Imported"} ${imported.length} trade${imported.length === 1 ? "" : "s"}.`);
    announce(`${mode === "replace" ? "Trade history replaced" : "Trades imported"}: ${imported.length} row${imported.length === 1 ? "" : "s"}.`, "success");
    go("dashboard");
  }

  function sharePassport() {
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
    <div className="min-h-screen overflow-x-clip bg-black text-white">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.055),transparent_30%),linear-gradient(180deg,#000,rgba(1,4,10,0.94))]" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-grid opacity-70" />

      <Navbar
        section={section}
        go={go}
        openAuth={setAuthMode}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        score={analysis.score}
      />
      <AuthSheet mode={authMode} setMode={setAuthMode} close={() => setAuthMode(null)} />
      <Toast toast={toast} />

      <main className="relative z-10">
        <AnimatePresence mode="wait">
          {section === "overview" && (
            <RouteFrame key="overview">
              <Hero go={go} />
              <StoryStrip />
              <PlanStrip go={go} openAuth={setAuthMode} />
              <CtaFooter openAuth={setAuthMode} sharePassport={sharePassport} />
            </RouteFrame>
          )}
          {section === "dashboard" && (
            <RouteFrame key="dashboard">
              <Dashboard analysis={analysis} rules={rules} go={go} />
            </RouteFrame>
          )}
          {section === "import" && (
            <RouteFrame key="import">
              <ImportDesk importCsv={importCsv} status={status} reset={() => { setTrades(sampleTrades); setRules(defaultRules); setStatus("Demo trades restored."); announce("Demo trades restored.", "success"); }} />
            </RouteFrame>
          )}
          {section === "rules" && (
            <RouteFrame key="rules">
              <RulesEngine rules={rules} setRules={setRules} analysis={analysis} />
            </RouteFrame>
          )}
          {section === "coach" && (
            <RouteFrame key="coach">
              <Coach analysis={analysis} go={go} />
            </RouteFrame>
          )}
          {section === "passport" && (
            <RouteFrame key="passport">
              <Passport analysis={analysis} sharePassport={sharePassport} go={go} />
            </RouteFrame>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function Navbar({ section, go, openAuth, mobileOpen, setMobileOpen, score }: {
  section: Section;
  go: (section: Section) => void;
  openAuth: (mode: AuthMode) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  score: number;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 28);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <motion.header
      className="fixed left-0 right-0 top-0 z-50 px-4 pb-4 pt-5 md:px-8"
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 transition duration-500 ${
          scrolled ? "header-scroll-veil opacity-100" : "opacity-0"
        }`}
      />
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between md:justify-center">
        <div className="header-orbit hidden items-center md:flex">
          <button className="brand-lockup group flex min-w-0 shrink-0 items-center" onClick={() => go("overview")} type="button" aria-label="Go to Cova home">
            <img
              src="/cova-logo-minimal-white.svg"
              alt="Cova"
              className="header-brand-mark h-9 w-9 object-contain opacity-95 transition duration-500 group-hover:opacity-100"
            />
          </button>

          <span className="header-divider" />

          <LayoutGroup id="cova-main-nav">
            <nav className="header-nav-group" aria-label="Primary navigation">
              {nav.map((item) => {
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    className={`nav-tab rounded-full font-body text-[14px] font-medium transition duration-300 ${
                      active
                        ? "nav-tab-active text-[#9aa1ff]"
                        : "text-white/43 hover:text-white/78"
                    }`}
                    onClick={() => go(item.id)}
                    type="button"
                    aria-current={active ? "page" : undefined}
                  >
                    {active && (
                      <motion.span
                        className="nav-tab-motion"
                        layoutId="main-nav-active"
                        transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
                      />
                    )}
                    <span className="nav-tab-label">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </LayoutGroup>

          <span className="header-divider" />

          <div className="header-actions">
            <button
              className="header-link-button rounded-full font-body text-[13px] font-medium"
              onClick={() => openAuth("login")}
              type="button"
            >
              Login
            </button>
            <button
              className="header-start-button rounded-full font-body text-[13px] font-semibold"
              onClick={() => openAuth("signup")}
              type="button"
            >
              Start for free
            </button>
            <button className="header-risk-button rounded-full font-body text-[13px]" onClick={() => go("dashboard")} type="button">
              <span className="header-risk-dot" />
              <span>Risk</span>
              <strong className="font-mono text-[#3e7cff]">{score}</strong>
            </button>
          </div>
        </div>

        <button className="brand-lockup flex min-w-0 shrink-0 items-center md:hidden" onClick={() => go("overview")} type="button" aria-label="Go to Cova home">
          <img src="/cova-logo-minimal-white.svg" alt="Cova" className="header-brand-mark h-10 w-10 object-contain opacity-95" />
        </button>

        <button className="liquid-glass shrink-0 rounded-full p-3 text-white md:hidden" onClick={() => setMobileOpen(!mobileOpen)} type="button" aria-label="Toggle menu">
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
            {nav.map((item) => (
              <button
                key={item.id}
                className={`block w-full rounded-full px-4 py-3 text-left font-body text-sm ${
                  section === item.id ? "bg-white text-black" : "text-white/78"
                }`}
                onClick={() => go(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
              <button className="cova-button cova-button-secondary rounded-full px-4 py-3 font-body text-sm" onClick={() => { setMobileOpen(false); openAuth("login"); }} type="button">
                Login
              </button>
              <button className="cova-button cova-button-primary rounded-full px-4 py-3 font-body text-sm font-semibold" onClick={() => { setMobileOpen(false); openAuth("signup"); }} type="button">
                Start for free
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

function AuthSheet({ mode, setMode, close }: { mode: AuthMode | null; setMode: (mode: AuthMode) => void; close: () => void }) {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const isSignup = mode === "signup";
  const canRedirect = mode ? canRedirectToWix(mode) : false;

  useEffect(() => {
    setNotice("");
  }, [mode]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode) {
      return;
    }

    localStorage.setItem(
      AUTH_INTENT_KEY,
      JSON.stringify({
        email,
        mode,
        returnTo: `${window.location.pathname}${window.location.search}${window.location.hash || "#dashboard"}`,
        savedAt: new Date().toISOString(),
      }),
    );

    if (!canRedirectToWix(mode)) {
      setNotice("Wix handoff staged. Add VITE_WIX_LOGIN_URL / VITE_WIX_SIGNUP_URL when the Wix site is ready.");
      return;
    }

    window.location.assign(buildWixAuthUrl(mode));
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
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(62,124,255,0.18),transparent_36%),linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0)_48%)]" />
              <div className="absolute -right-16 bottom-6 h-52 w-52 rounded-full border border-white/10 bg-[radial-gradient(circle,rgba(255,255,255,0.12),transparent_62%)]" />
              <div className="relative z-10 flex h-full flex-col justify-between">
                <div>
                  <span className="liquid-glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-body text-xs uppercase tracking-[0.18em] text-[#3e7cff]">
                    <LockKeyhole className="h-3.5 w-3.5" />
                    Member access
                  </span>
                  <h2 className="mt-10 max-w-sm font-heading text-6xl italic leading-[1.02] tracking-[0.012em] [word-spacing:0.1em] text-white">
                    Risk desk identity.
                  </h2>
                </div>
                <div className="grid gap-3">
                  {["Wix Members handoff", "No local password storage", "Return to active desk"].map((item) => (
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

              <p className="font-body text-xs uppercase tracking-[0.24em] text-[#3e7cff]">{isSignup ? "Create account" : "Existing account"}</p>
              <h3 className="mt-3 font-body text-3xl font-medium text-white">
                {isSignup ? "Create your Cova workspace." : "Return to your Cova workspace."}
              </h3>
              <p className="mt-4 max-w-md font-body text-sm font-light leading-relaxed text-white/56">
                {isSignup
                  ? "Save uploads, limits, insight notes, and Passport history under a Wix member identity."
                  : "Use the same Wix member session that will protect the production Cova workspace."}
              </p>

              <label className="mt-8 block font-body text-xs uppercase tracking-[0.2em] text-white/40" htmlFor="auth-email">
                Email
              </label>
              <div className="liquid-glass mt-3 flex items-center gap-3 rounded-full px-5 py-3">
                <Mail className="h-4 w-4 text-[#3e7cff]" />
                <input
                  id="auth-email"
                  className="w-full bg-transparent font-body text-sm text-white outline-none placeholder:text-white/30"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@domain.com"
                  type="email"
                  autoComplete="email"
                />
              </div>

              <button className="cova-button cova-button-primary mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 font-body text-sm font-semibold" type="submit">
                <UserRound className="h-4 w-4" />
                {canRedirect ? "Continue with Wix" : "Stage Wix handoff"}
                <ArrowUpRight className="h-4 w-4" />
              </button>

              <p className="mt-4 min-h-10 font-body text-xs leading-relaxed text-white/45">
                {notice || "Production auth will redirect through Wix. This MVP keeps the visual flow ready without storing passwords locally."}
              </p>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Hero({ go }: { go: (section: Section) => void }) {
  function scrollHowItWorks() {
    document.querySelector(".scroll-story")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section
      className="market-hero relative flex min-h-screen items-center overflow-hidden px-5 pt-32 md:px-12 lg:px-20"
    >
      <motion.img
        src="/media/cova-market-hero-v1.png"
        alt=""
        className="market-hero-bg absolute inset-0 z-0 h-full w-full object-cover opacity-[0.95]"
        loading="eager"
        initial={{ opacity: 0, scale: 1.035 }}
        animate={{ opacity: 0.95, scale: 1 }}
        transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(90deg,#000_0%,rgba(0,0,0,0.84)_28%,rgba(0,0,0,0.22)_62%,rgba(0,0,0,0.72)_100%)]" />
      <div className="absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_68%_38%,rgba(62,124,255,0.12),transparent_34%),radial-gradient(ellipse_at_82%_62%,rgba(47,215,169,0.06),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-[-1px] z-[5] h-72 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.64)_44%,#000_88%,#000_100%)]" />
      <MarketHeroField />

      <div className="relative z-10 mx-auto flex w-full min-w-0 max-w-7xl items-end pb-16 md:min-h-[calc(100vh-8rem)] md:items-center md:pb-0">
        <div className="market-hero-copy w-full max-w-[44rem]">
          <h1 className="market-hero-title market-hero-wordmark" aria-label="Cova">
            <img
              src="/media/wordmark-options/cova-wordmark-option-3-sleek.png"
              alt=""
              aria-hidden="true"
              className="block h-auto w-full select-none"
              draggable={false}
            />
          </h1>

          <p
            className="mt-7 max-w-full font-body text-xl font-light leading-relaxed text-white/76 md:max-w-lg md:text-2xl"
          >
            Review risk before the next trade.
          </p>

          <div
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <GlassButton onClick={() => go("import")} strong>
              Upload trades <ArrowUpRight className="h-4 w-4" />
            </GlassButton>
            <button className="market-hero-action flex items-center gap-3 rounded-full px-2 py-3 font-body text-sm font-light text-white" onClick={scrollHowItWorks} type="button">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-black">
                <Fingerprint className="h-4 w-4" />
              </span>
              See how it works
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

type MarketCandleTone = "up" | "down" | "neutral" | "risk";

type MarketCandle = {
  close: number;
  high: number;
  low: number;
  open: number;
  tone: MarketCandleTone;
  width: number;
};

const MARKET_CANDLE_COUNT = 340;
const MARKET_CANDLE_GAP = 18.5;
const MARKET_CANDLE_FPS = 30;

function MarketHeroField() {
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
    const candles = buildMarketCandles(MARKET_CANDLE_COUNT);
    const minPrice = Math.min(...candles.map((candle) => candle.low)) - 10;
    const maxPrice = Math.max(...candles.map((candle) => candle.high)) + 10;
    const trackWidth = candles.length * MARKET_CANDLE_GAP;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationFrame = 0;
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
      dpr = Math.min(window.devicePixelRatio || 1, width < 760 ? 1 : 1.45);
      heroCanvas.width = Math.round(width * dpr);
      heroCanvas.height = Math.round(height * dpr);
      drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      stripCanvas = renderMarketStrip(candles, trackWidth, height, dpr, minPrice, maxPrice);
    }

    function draw(timestamp: number) {
      if (!startTime) {
        startTime = timestamp;
      }
      if (!stripCanvas || !isInView || document.hidden) {
        animationFrame = window.requestAnimationFrame(draw);
        return;
      }
      if (!reduceMotion && timestamp - lastFrameTime < 1000 / MARKET_CANDLE_FPS) {
        animationFrame = window.requestAnimationFrame(draw);
        return;
      }
      lastFrameTime = timestamp;

      const elapsed = reduceMotion ? 92_000 : timestamp - startTime;
      const speed = width < 700 ? 8 : 12;
      const offset = (elapsed / 1000 * speed) % trackWidth;

      drawingContext.clearRect(0, 0, width, height);
      drawingContext.save();
      drawingContext.globalAlpha = 0.98;

      for (let copy = -1; copy <= Math.ceil(width / trackWidth) + 1; copy += 1) {
        drawingContext.drawImage(stripCanvas, copy * trackWidth - offset, 0, trackWidth, height);
      }

      drawingContext.restore();

      if (!reduceMotion) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(heroCanvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isInView = entry ? entry.isIntersecting : true;
    }, { rootMargin: "240px" });
    intersectionObserver.observe(heroCanvas);
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, []);

  return (
    <div className="market-candle-stage pointer-events-none absolute inset-0 z-[4]" aria-hidden="true">
      <div className="market-candle-viewport">
        <canvas ref={canvasRef} className="market-candle-canvas" />
      </div>
    </div>
  );
}

function renderMarketStrip(candles: MarketCandle[], trackWidth: number, height: number, dpr: number, minPrice: number, maxPrice: number) {
  const strip = document.createElement("canvas");
  strip.width = Math.max(1, Math.round(trackWidth * dpr));
  strip.height = Math.max(1, Math.round(height * dpr));

  const context = strip.getContext("2d", { alpha: true });
  if (!context) {
    return strip;
  }

  const chartTop = height * 0.18;
  const chartBottom = height * 0.8;
  const chartHeight = chartBottom - chartTop;
  const fullRange = Math.max(1, maxPrice - minPrice);
  const priceWindow = fullRange * 0.72;
  const centerPrice = (minPrice + maxPrice) / 2;
  const visualMin = centerPrice - priceWindow / 2;
  const visualMax = centerPrice + priceWindow / 2;
  const priceToY = (value: number) => clampNumber(chartTop + (1 - (value - visualMin) / Math.max(1, visualMax - visualMin)) * chartHeight, height * 0.08, height * 0.9);

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, trackWidth, height);
  context.lineCap = "round";
  context.lineJoin = "round";

  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = strip.width;
  glowCanvas.height = strip.height;
  const glowContext = glowCanvas.getContext("2d", { alpha: true });
  glowContext?.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (glowContext) {
    glowContext.clearRect(0, 0, trackWidth, height);
    glowContext.lineCap = "round";
    glowContext.lineJoin = "round";
  }

  const plottedCandles = candles.map((candle, index) => {
    const x = (index + 0.5) * MARKET_CANDLE_GAP;
    const openY = priceToY(candle.open);
    const closeY = priceToY(candle.close);
    const highY = priceToY(candle.high);
    const lowY = priceToY(candle.low);
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(candle.tone === "neutral" ? 2.2 : 10.5, Math.abs(closeY - openY) * 1.28);
    const color = candleColor(candle.tone);
    const glow = candleGlow(candle.tone);
    const glowScale = candle.tone === "neutral" ? 0.9 : candle.tone === "down" ? 1.08 : 1.24;
    const glowWidth = candle.width * glowScale;
    return { bodyHeight, bodyTop, candle, closeY, color, glow, glowWidth, highY, lowY, openY, x };
  });

  if (glowContext) {
    plottedCandles.forEach(({ bodyHeight, bodyTop, candle, closeY, glow, glowWidth, highY, lowY, openY, x }) => {
      const isFullBody = Math.abs(closeY - openY) > bodyHeight * 0.42;
      glowContext.globalAlpha = candle.tone === "neutral" ? 0.06 : candle.tone === "risk" ? 0.2 : isFullBody ? 0.17 : 0.1;
      glowContext.strokeStyle = glow;
      glowContext.fillStyle = glow;
      glowContext.lineWidth = candle.tone === "risk" ? 2 : 1.5;
      glowContext.beginPath();
      glowContext.moveTo(x, highY);
      glowContext.lineTo(x, lowY);
      glowContext.stroke();
      glowContext.fillRect(x - glowWidth / 2, bodyTop - bodyHeight * 0.06, glowWidth, bodyHeight * 1.12);
    });

    context.save();
    context.globalAlpha = 0.68;
    context.filter = "blur(12px)";
    context.drawImage(glowCanvas, 0, 0, trackWidth, height);
    context.restore();

    context.save();
    context.globalAlpha = 0.22;
    context.filter = "blur(30px)";
    context.drawImage(glowCanvas, 0, 0, trackWidth, height);
    context.restore();
  }

  plottedCandles.forEach(({ bodyHeight, bodyTop, candle, color, glow, highY, lowY, x }) => {
    context.globalAlpha = candle.tone === "neutral" ? 0.54 : candle.tone === "risk" ? 0.94 : 0.84;
    context.strokeStyle = color;
    context.lineWidth = candle.tone === "risk" ? 2 : 1.36;
    context.shadowColor = glow;
    context.shadowBlur = 0;
    context.beginPath();
    context.moveTo(x, highY);
    context.lineTo(x, lowY);
    context.stroke();

    context.globalAlpha = candle.tone === "neutral" ? 0.5 : 0.92;
    context.fillStyle = color;
    context.strokeStyle = color;
    context.lineWidth = 0.75;
    const halfWidth = candle.width / 2;
    const crispX = Math.round(x - halfWidth) + 0.5;
    const crispY = Math.round(bodyTop) + 0.5;
    const crispWidth = Math.max(1, Math.round(candle.width));
    const crispHeight = Math.max(1, Math.round(bodyHeight));
    if (candle.tone === "neutral") {
      const neutralHeight = Math.max(2, crispHeight);
      context.fillRect(crispX, crispY, crispWidth, neutralHeight);
      context.strokeRect(crispX, crispY, crispWidth, neutralHeight);
    } else {
      context.fillRect(crispX, crispY, crispWidth, crispHeight);
      context.strokeRect(crispX, crispY, crispWidth, crispHeight);
    }
  });

  return strip;
}

function buildMarketCandles(count: number): MarketCandle[] {
  const random = seededRandom(9137);
  const candles: MarketCandle[] = [];
  const initialPrice = 268;
  let previousClose = initialPrice;
  let previousMove = 0;
  const anchors = [
    { at: 0, price: initialPrice, volatility: 3.2 },
    { at: 0.08, price: 304, volatility: 5.8 },
    { at: 0.16, price: 286, volatility: 4.2 },
    { at: 0.27, price: 326, volatility: 6.4 },
    { at: 0.36, price: 296, volatility: 5.1 },
    { at: 0.48, price: 338, volatility: 6.8 },
    { at: 0.61, price: 238, volatility: 9.6 },
    { at: 0.71, price: 282, volatility: 7.8 },
    { at: 0.8, price: 226, volatility: 8.8 },
    { at: 0.92, price: 318, volatility: 8.2 },
    { at: 0.98, price: 286, volatility: 5.6 },
    { at: 1, price: initialPrice, volatility: 4.8 },
  ];

  for (let index = 0; index < count; index += 1) {
    const progress = index / Math.max(1, count - 1);
    const segmentIndex = Math.max(0, anchors.findIndex((anchor) => progress <= anchor.at));
    const start = anchors[Math.max(0, segmentIndex - 1)];
    const end = anchors[segmentIndex] ?? anchors[anchors.length - 1];
    const startIndex = Math.round(start.at * (count - 1));
    const endIndex = Math.max(startIndex + 1, Math.round(end.at * (count - 1)));
    const remainingCandles = Math.max(1, endIndex - index);
    const localProgress = clampNumber((index - startIndex) / Math.max(1, endIndex - startIndex), 0, 1);
    const open = previousClose;
    const segmentDirection = Math.sign(end.price - start.price || previousMove || 1);
    const target = start.price + (end.price - start.price) * localProgress;
    const segmentSlope = (end.price - start.price) / Math.max(1, endIndex - startIndex);
    const isEdgeCandle = index < 12 || index > count - 13;
    const isDoji = index % 131 === 42;
    const isImpulse = !isEdgeCandle && (index % 6 === 2 || index % 11 === 7 || index % 29 === 15);
    const isCounterMove = !isImpulse && (index % 9 === 4 || index % 17 === 6);
    const direction = Math.sign(end.price - open || segmentSlope || previousMove || segmentDirection);
    const clusteredNoise = (random() + random() + random() - 1.5) * end.volatility;
    const impulseMove = isImpulse ? segmentDirection * (3.8 + random() * 8.6) : 0;
    const counterMove = isCounterMove ? -segmentDirection * (1.6 + random() * 4.8) : 0;
    const minimumBody = !isDoji && Math.abs(target - open) < 3.4
      ? direction * (1.8 + random() * 2.8)
      : 0;
    let move = isDoji
      ? (random() - 0.5) * 0.7
      : (end.price - open) / remainingCandles * 1.4 +
        (target - open) * 0.34 +
        segmentSlope * 1.35 +
        clusteredNoise +
        previousMove * 0.09 +
        impulseMove +
        counterMove +
        minimumBody;

    if (index > count - 24) {
      const endProgress = (index - (count - 24)) / 24;
      move += (initialPrice - open) * (0.18 + endProgress * 0.36);
    }

    let close = clampNumber(open + move, 196, 360);
    if (index === count - 1) {
      close = initialPrice + (random() - 0.5) * 0.35;
    }

    const body = Math.abs(close - open);
    const isFullBody = !isDoji && (isImpulse || body > 2.4 || index % 3 !== 0);
    const wickBase = isFullBody ? 0.22 : isDoji ? 1.2 : 0.55;
    const wickRange = isFullBody ? 1.45 : isImpulse ? 3.2 : 4.4;
    const upperWick = wickBase + random() * wickRange + (!isFullBody && index % 29 === 8 ? 3.2 * random() : 0);
    const lowerWick = wickBase + random() * wickRange + (!isFullBody && index % 31 === 19 ? 3.6 * random() : 0);
    const high = Math.max(open, close) + upperWick;
    const low = Math.min(open, close) - lowerWick;
    const down = close < open;
    const tone: MarketCandleTone = isDoji ? "neutral" : !down && isImpulse ? "risk" : down ? "down" : "up";
    const width = isImpulse ? 13 : body > 7 ? 12.4 : isFullBody ? 11 : isDoji ? 4 : 8.8;

    candles.push({ close, high, low, open, tone, width });
    previousMove = close - open;
    previousClose = close;
  }

  return candles;
}

function candleColor(tone: MarketCandleTone) {
  if (tone === "up") {
    return "rgba(74, 137, 255, 0.92)";
  }
  if (tone === "risk") {
    return "rgba(116, 185, 255, 0.95)";
  }
  if (tone === "neutral") {
    return "rgba(210, 222, 236, 0.58)";
  }
  return "rgba(142, 160, 181, 0.68)";
}

function candleGlow(tone: MarketCandleTone) {
  if (tone === "up") {
    return "rgba(45, 116, 255, 0.54)";
  }
  if (tone === "risk") {
    return "rgba(88, 172, 255, 0.6)";
  }
  return "rgba(180, 205, 235, 0.24)";
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

function Dashboard({ analysis, rules, go }: { analysis: ReturnType<typeof analyze>; rules: RiskRule[]; go: (section: Section) => void }) {
  const [range, setRange] = useState<TimeRange>("all");
  const scopedTrades = useMemo(() => filterTradesByRange(analysis.trades, range), [analysis.trades, range]);
  const scopedAnalysis = useMemo(() => analyze(scopedTrades, rules), [scopedTrades, rules]);
  const rangeLabel = range === "today" ? `Latest session · ${analysis.latestDate}` : range === "week" ? "Last 7 calendar days" : "All trades";
  const reviewQuestions = [
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
      question: "What can I show as proof?",
      answer: `${scopedAnalysis.score}/100`,
      detail: "Current Cova risk score",
      tone: "text-[#3e7cff]",
    },
  ];

  return (
    <SectionShell
      eyebrow="Review"
      title="See what is helping or hurting your account."
      action={<GlassButton onClick={() => go("rules")}>Adjust Limits <ArrowUpRight className="h-4 w-4" /></GlassButton>}
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" />}
    >
      <DashboardRangeDock range={range} setRange={setRange} analysis={scopedAnalysis} label={rangeLabel} />
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
              <p className="font-body text-xs uppercase tracking-[0.26em] text-[#3e7cff]">Account path</p>
              <h3 className="mt-2 font-body text-2xl font-medium">How your P&L moved</h3>
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
    </SectionShell>
  );
}

function DashboardRangeDock({ range, setRange, analysis, label }: { range: TimeRange; setRange: (range: TimeRange) => void; analysis: ReturnType<typeof analyze>; label: string }) {
  const ranges: { id: TimeRange; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "week", label: "Week" },
    { id: "all", label: "All" },
  ];
  const quickMetrics = [
    ["P&L", formatMoney(analysis.totalPnl), analysis.totalPnl >= 0 ? "text-emerald-300" : "text-red-300"],
    ["Biggest dip", formatMoney(-analysis.maxDrawdown), analysis.maxDrawdown > 0 ? "text-red-300" : "text-white"],
    ["Warnings", String(analysis.breaches.length), analysis.breaches.length ? "text-red-300" : "text-emerald-300"],
  ];

  return (
    <div className="liquid-glass mb-6 rounded-[32px] p-4 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-body text-xs uppercase tracking-[0.22em] text-[#3e7cff]">Time period</p>
          <p className="mt-1 font-body text-sm text-white/55">{label}</p>
        </div>
        <div className="terminal-tab-bar inline-grid w-full grid-cols-3 md:w-auto">
          {ranges.map((item) => {
            const active = range === item.id;
            return (
              <button
                className={`terminal-tab px-4 py-2 font-body text-sm ${active ? "terminal-tab-active" : ""}`}
                key={item.id}
                onClick={() => setRange(item.id)}
                type="button"
              >
                {active && (
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
      </div>
      <div className="mt-4 grid gap-3 md:hidden">
        {quickMetrics.map(([metric, value, tone]) => (
          <div className="flex items-center justify-between rounded-[22px] border border-white/10 bg-black/24 px-4 py-3" key={metric}>
            <span className="font-body text-sm text-white/55">{metric}</span>
            <strong className={`font-mono text-xl ${tone}`}>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportDesk({ importCsv, status, reset }: { importCsv: (text: string, mode?: ImportMode) => void; status: string; reset: () => void }) {
  const [text, setText] = useState("date,market,side,contracts,entry,exit,pnl,risk,setup,notes\n2026-05-06,NQ,Long,1,18900,18915,300,250,Opening range,Smoke row");
  const [mode, setMode] = useState<ImportMode>("append");
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState("");
  const [brokerBusy, setBrokerBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [brokerNotice, setBrokerNotice] = useState("");
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatus | null>(() => readBrokerStatus());
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
        throw new Error("Vercel API route is not reachable from the Vite dev server.");
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
      setBrokerNotice(`${error instanceof Error ? error.message : "Tradovate sync is unavailable in this preview."} Use Vercel dev or the deployed Vercel URL for broker sync testing.`);
    } finally {
      setSyncBusy(false);
    }
  }

  function startTradovateConnect() {
    if (!canRedirectToTradovate()) {
      setBrokerNotice("Tradovate connect is scaffolded. Run the app with Vercel dev or set VITE_TRADOVATE_CONNECT_URL after adding OAuth credentials.");
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
        throw new Error("Vercel API route is not reachable from the Vite dev server.");
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
      setBrokerNotice(`${nextStatus.message} Use Vercel dev or the deployed Vercel URL for broker auth testing.`);
    } finally {
      setBrokerBusy(false);
    }
  }

  return (
    <SectionShell eyebrow="Upload" title="Connect Tradovate or upload a CSV.">
      <div className="grid gap-6">
        <BrokerConnectPanel
          brokerBusy={brokerBusy}
          brokerNotice={brokerNotice}
          brokerStatus={brokerStatus}
          checkTradovateStatus={checkTradovateStatus}
          startTradovateConnect={startTradovateConnect}
          syncBusy={syncBusy}
          syncTradovate={syncTradovate}
        />

        <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="space-y-6">
            <div
              className={`liquid-glass-strong rounded-[36px] p-8 transition ${dragActive ? "scale-[1.01] border-[#3e7cff]/60" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => { event.preventDefault(); setDragActive(false); void readFile(event.dataTransfer.files[0]); }}
            >
              <Upload className="h-10 w-10 text-[#3e7cff]" />
              <h3 className="mt-8 font-heading text-5xl italic leading-[1.02] tracking-normal">CSV fallback.</h3>
              <p className="mt-5 max-w-md font-body font-light leading-relaxed text-white/60">
                Use this when a broker is not connected yet. Paste a prop-firm export and Cova checks
                the rows before turning them into a risk review.
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
                <ImportStat label="Mode" value={mode} tone="text-[#3e7cff]" />
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <GlassButton strong onClick={() => importCsv(text, mode)}>Upload Trades</GlassButton>
                <GlassButton onClick={reset}>Reset Demo</GlassButton>
              </div>
              <p className="mt-6 font-body text-sm text-white/50">{fileName || status}</p>
            </div>

            <CsvPreview parsed={parsed} />
          </div>

          <div className="liquid-glass rounded-[36px] p-3">
            <textarea
              className="min-h-[520px] w-full resize-y rounded-[28px] border border-white/10 bg-black/50 p-6 font-mono text-sm leading-relaxed text-white/75 outline-none transition focus:border-[#3e7cff]"
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

function BrokerConnectPanel({
  brokerBusy,
  brokerNotice,
  brokerStatus,
  checkTradovateStatus,
  startTradovateConnect,
  syncBusy,
  syncTradovate,
}: {
  brokerBusy: boolean;
  brokerNotice: string;
  brokerStatus: BrokerStatus | null;
  checkTradovateStatus: () => void;
  startTradovateConnect: () => void;
  syncBusy: boolean;
  syncTradovate: () => void;
}) {
  const connected = Boolean(brokerStatus?.connected);
  const updated = brokerStatus?.updatedAt ? new Date(brokerStatus.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "not checked";

  return (
    <div className="liquid-glass-strong rounded-[40px] p-6 md:p-8">
      <div className="grid gap-7 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="terminal-tab-label inline-flex rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#67ddff]">Broker connect beta</span>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-body text-xs ${connected ? "border-emerald-300/24 bg-emerald-400/10 text-emerald-200" : "border-white/12 bg-white/[0.035] text-white/52"}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-300" : "bg-white/30"}`} />
              {connected ? "Tradovate connected" : "Not connected"}
            </span>
          </div>
          <h3 className="mt-7 font-heading text-5xl italic leading-[1.02] tracking-normal md:text-6xl">Skip the CSV work.</h3>
          <p className="mt-5 max-w-2xl font-body font-light leading-relaxed text-white/62">
            Link Tradovate so Cova can read trade history directly and turn fills into your dashboard,
            limits, insights, and Risk Passport. This is read-only; Cova cannot place trades.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          <ImportStat label="Access" value="Read-only" tone="text-emerald-300" />
          <ImportStat label="Orders" value="Blocked" tone="text-white/58" />
          <ImportStat label="Status" value={connected ? "Live" : "Ready"} tone={connected ? "text-emerald-300" : "text-[#3e7cff]"} />
        </div>
      </div>

      <div className="mt-7 grid gap-4 border-t border-white/10 pt-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { icon: LockKeyhole, label: "OAuth handoff", text: "No passwords saved in Cova." },
            { icon: BadgeCheck, label: "Server-side tokens", text: "Stored encrypted in Supabase." },
            { icon: Gauge, label: "Risk review only", text: "No signals or order execution." },
          ].map(({ icon: Icon, label, text }) => (
            <div className="rounded-[24px] border border-white/10 bg-black/22 p-4" key={label}>
              <Icon className="h-5 w-5 text-[#3e7cff]" />
              <p className="mt-3 font-body text-sm font-medium text-white/82">{label}</p>
              <p className="mt-1 font-body text-xs leading-relaxed text-white/45">{text}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 lg:justify-end">
          <GlassButton strong onClick={startTradovateConnect}>Connect Tradovate <ArrowUpRight className="h-4 w-4" /></GlassButton>
          <GlassButton onClick={checkTradovateStatus}>{brokerBusy ? "Checking..." : "Check status"}</GlassButton>
          {connected && <GlassButton onClick={syncTradovate}>{syncBusy ? "Syncing..." : "Sync trades"}</GlassButton>}
        </div>
      </div>

      <p className="mt-5 font-body text-xs leading-relaxed text-white/45">
        {brokerNotice || brokerStatus?.message || `Last checked: ${updated}. CSV import stays available for prop dashboards and brokers outside Tradovate.`}
      </p>
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

function CsvPreview({ parsed }: { parsed: ReturnType<typeof parseCsvDetailed> }) {
  return (
    <div className="liquid-glass rounded-[32px] p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-body text-xs uppercase tracking-[0.22em] text-[#3e7cff]">Quick check</p>
          <p className="mt-1 font-body text-sm text-white/50">{parsed.headers.length ? parsed.headers.join(" · ") : "Waiting for CSV columns"}</p>
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

function RulesEngine({ rules, setRules, analysis }: { rules: RiskRule[]; setRules: (rules: RiskRule[]) => void; analysis: ReturnType<typeof analyze> }) {
  return (
    <SectionShell eyebrow="Limits" title="Set the risk lines you do not want to cross.">
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="liquid-glass-strong rounded-[36px] p-8">
          <SlidersHorizontal className="h-10 w-10 text-[#3e7cff]" />
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
            return (
              <motion.article
                key={rule.id}
                className="liquid-glass rounded-[32px] p-5 md:p-6"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.045, duration: 0.55 }}
              >
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-body text-xs uppercase tracking-[0.22em] text-[#3e7cff]">{friendlyRuleMetric(rule.metric)}</p>
                    <h3 className="mt-2 font-body text-xl font-medium">{rule.name}</h3>
                    <p className="mt-1 font-body text-sm font-light text-white/50">{status?.summary}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 font-body text-xs ${status?.breached ? "bg-red-500/15 text-red-300" : "bg-emerald-400/15 text-emerald-300"}`}>
                      {status?.breached ? "Needs review" : "Looks good"}
                    </span>
                    <button
                      className={`h-8 w-14 rounded-full border p-1 transition ${rule.enabled ? "border-emerald-300/50 bg-emerald-400/20" : "border-white/15 bg-white/5"}`}
                      onClick={() => setRules(rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))}
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
                    className="cova-range"
                  />
                  <label className="grid gap-1">
                    <span className="font-body text-[10px] uppercase tracking-[0.18em] text-white/35">Limit</span>
                    <input
                      className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-right font-mono text-lg text-[#3e7cff] outline-none transition focus:border-[#3e7cff]"
                      min={rangeMin}
                      max={rangeMax}
                      step={rangeStep}
                      type="number"
                      value={rule.limit}
                      onChange={(event) => setRules(rules.map((item) => item.id === rule.id ? { ...item, limit: Number(event.target.value) } : item))}
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

function Coach({ analysis, go }: { analysis: ReturnType<typeof analyze>; go: (section: Section) => void }) {
  const primaryBreach = analysis.breaches[0];
  const bestSetup = analysis.bySetup[0];
  const repeatRisk = analysis.breaches.find((status) => status.rule.metric === "maxLossStreak" || status.rule.metric === "maxContracts");
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
      icon: BookOpen,
      title: "What to work on next",
      body: "After two losses, slow down and keep size flat until you see a cleaner setup.",
      tone: "NEXT",
      evidence: repeatRisk?.evidence.slice(0, 2) ?? analysis.trades.slice(-2).map((trade) => `${trade.date} ${trade.market}: ${formatMoney(trade.pnl)}`),
    },
  ];
  return (
    <SectionShell eyebrow="Insights" title="Plain-English notes from your trade history.">
      <div className="grid gap-6 lg:grid-cols-3">
        {insights.map((insight, index) => (
          <motion.article
            key={insight.title}
            className="liquid-glass min-h-[320px] rounded-[36px] p-8"
            initial={{ opacity: 0, y: 34, filter: "blur(14px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.09, duration: 0.65 }}
          >
            <insight.icon className="h-10 w-10 text-[#3e7cff]" />
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
      </div>
      <div className="mt-8">
        <GlassButton strong onClick={() => go("passport")}>Share Risk Passport <ArrowUpRight className="h-4 w-4" /></GlassButton>
      </div>
    </SectionShell>
  );
}

function Passport({ analysis, sharePassport, go }: { analysis: ReturnType<typeof analyze>; sharePassport: () => void; go: (section: Section) => void }) {
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
      title="Share proof without sharing signals."
      backdrop={<ImageAtmosphere src="/media/cova-passport-product.jpg" align="right" opacity="opacity-[0.35]" />}
    >
      <div className="liquid-glass mb-7 grid gap-4 rounded-[32px] p-5 md:grid-cols-[0.8fr_1.2fr] md:items-center">
        <p className="font-body text-xs uppercase tracking-[0.22em] text-[#3e7cff]">What is this?</p>
        <p className="font-body text-sm font-light leading-relaxed text-white/62">
          A Risk Passport is a shareable summary of your discipline, limits, and trade behavior.
          It helps someone see how you manage risk without turning Cova into a signal report.
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
              <span className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-[#3e7cff]">
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
            <GlassButton onClick={() => downloadPassportPng(analysis, visibility, expiry)}>Export PNG <Download className="h-4 w-4" /></GlassButton>
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

function StoryStrip() {
  const storyRef = useRef<HTMLElement | null>(null);
  const [activeFrame, setActiveFrame] = useState(0);
  const [storyProgress, setStoryProgress] = useState(0);
  const frames: {
    num: string;
    eyebrow: string;
    title: string;
    body: string;
    image: string;
    Icon: LucideIcon;
    metric: string;
    csvHelp?: { body: string; steps: string[] };
  }[] = [
    {
      num: "01",
      eyebrow: "Start with proof",
      title: "Make the account visible.",
      body: "Cova starts with the thing you already have: your trade history. No predictions, no calls, just the behavior that actually happened.",
      image: storyFrameImages[0],
      Icon: ShieldCheck,
      metric: "Process first",
    },
    {
      num: "02",
      eyebrow: "Upload",
      title: "Turn the CSV into evidence.",
      body: "Drop in trades from your prop dashboard and Cova cleans them into a reviewable ledger you can understand quickly.",
      image: storyFrameImages[1],
      Icon: FileUp,
      metric: "CSV reviewed",
      csvHelp: {
        body: "A CSV is the spreadsheet-style file most prop dashboards export for your trades.",
        steps: ["Export trade history", "Upload the file", "Cova turns rows into risk notes"],
      },
    },
    {
      num: "03",
      eyebrow: "Review",
      title: "See what is helping or hurting.",
      body: "Drawdown, sizing, daily loss, and limit warnings become visible in plain language before the next session starts.",
      image: storyFrameImages[2],
      Icon: Gauge,
      metric: "Risk surfaced",
    },
    {
      num: "04",
      eyebrow: "Share",
      title: "Send a clean Risk Passport.",
      body: "When someone asks if you are disciplined, share a simple risk summary instead of trying to explain your whole trade log.",
      image: storyFrameImages[3],
      Icon: Fingerprint,
      metric: "Proof ready",
    },
  ];
  const active = frames[activeFrame] ?? frames[0];

  useEffect(() => {
    storyFrameImages.forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);

  useEffect(() => {
    const update = () => {
      const node = storyRef.current;
      if (!node) {
        return;
      }
      const rect = node.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      const progress = Math.max(0, Math.min(1, -rect.top / travel));
      const nextFrame = Math.min(frames.length - 1, Math.floor(progress * frames.length));
      setStoryProgress(progress);
      setActiveFrame(nextFrame);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [frames.length]);

  const hasCsvHelp = Boolean(active.csvHelp);
  const desktopShellClass = "story-desktop-shell story-desktop-shell-sticky";

  return (
    <section ref={storyRef} className="scroll-story relative overflow-visible bg-black md:min-h-[380vh]">
      <div className="story-desktop-track hidden md:block">
        <div className={desktopShellClass}>
          <div className="absolute inset-0 bg-black">
            <motion.img
              key={active.image}
              src={active.image}
              alt=""
              className="story-frame-media absolute inset-0 h-full w-full object-cover"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.01 }}
              loading="eager"
            />
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.55)_52%,rgba(0,0,0,0.94)_100%),linear-gradient(90deg,#000_0%,rgba(0,0,0,0.62)_25%,rgba(0,0,0,0.48)_55%,#000_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,#000_0%,rgba(0,0,0,0.82)_36%,rgba(0,0,0,0)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-80 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.72)_64%,#000_100%)]" />
          <div className="story-grain absolute inset-0" style={{ opacity: 0.13 + storyProgress * 0.07 }} />

          <div className="relative z-10 mx-auto grid h-full max-w-6xl place-items-center px-5 text-center md:px-12 lg:px-20">
            <div className="story-frame-center mx-auto">
              <p className="font-body text-xs uppercase tracking-[0.18em] text-[#67ddff]/80">How Cova works</p>
              <motion.div
                className="story-copy-panel story-copy-panel-centered"
                key={active.num}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="mt-8 flex items-center justify-center gap-4">
                  <span className="font-heading text-7xl italic leading-none text-white/30">{active.num}</span>
                  <span className="rounded-full border border-white/12 bg-white/[0.035] px-4 py-2 font-body text-xs uppercase tracking-[0.14em] text-white/58">
                    {active.eyebrow}
                  </span>
                </div>
                <h2 className={`${hasCsvHelp ? "mt-5 text-5xl lg:text-7xl" : "mt-6 text-6xl lg:text-8xl"} mx-auto max-w-5xl font-heading italic leading-[0.94] tracking-normal text-white [text-shadow:0_12px_38px_rgba(0,0,0,0.95)] [word-spacing:0.035em]`}>
                  {active.title}
                </h2>
                <p className={`${hasCsvHelp ? "mt-5 text-base" : "mt-7 text-lg"} mx-auto max-w-2xl font-body font-light leading-relaxed text-white/72`}>
                  {active.body}
                </p>
                {active.csvHelp && <CsvExplainer body={active.csvHelp.body} steps={active.csvHelp.steps} compact />}
                <div className={`${hasCsvHelp ? "mt-5" : "mt-8"} flex flex-wrap items-center justify-center gap-3`}>
                  <div className={`${hasCsvHelp ? "px-3 py-2" : "px-4 py-3"} liquid-glass inline-flex items-center gap-3 rounded-full`}>
                    <active.Icon className="h-4 w-4 text-[#3e7cff]" />
                    <span className="font-body text-sm text-white/74">{active.metric}</span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative px-5 py-24 md:hidden">
        <p className="font-body text-xs uppercase tracking-[0.16em] text-[#67ddff]/80">How Cova works</p>
        <h2 className="mt-5 font-heading text-5xl italic leading-[1.02] tracking-normal">A simple review flow after every session.</h2>
        <div className="mt-10 grid gap-7">
          {frames.map(({ num, eyebrow, title, body, image, Icon }) => (
            <motion.article
              className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.025]"
              key={num}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="relative aspect-[1.8] overflow-hidden">
                <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_20%,rgba(0,0,0,0.78)_100%)]" />
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-heading text-4xl italic text-white/26">{num}</span>
                  <Icon className="h-5 w-5 text-[#3e7cff]" />
                </div>
                <p className="mt-5 font-body text-[11px] uppercase tracking-[0.22em] text-[#67ddff]/70">{eyebrow}</p>
                <h3 className="mt-2 font-body text-xl font-medium">{title}</h3>
                <p className="mt-2 font-body text-sm font-light leading-relaxed text-white/58">{body}</p>
                {num === "02" && (
                  <CsvExplainer
                    body="A CSV is the spreadsheet-style file most prop dashboards export for your trades."
                    steps={["Export trade history", "Upload the file", "Cova turns rows into risk notes"]}
                    compact
                  />
                )}
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
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
              <span className="font-mono text-[10px] text-[#67ddff]/70">0{index + 1}</span>
              <p className={`${compact ? "text-[11px]" : "mt-1 text-xs"} font-body leading-snug text-white/64`}>{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanStrip({ go, openAuth }: { go: (section: Section) => void; openAuth: (mode: AuthMode) => void }) {
  return (
    <section className="relative overflow-hidden px-5 py-28 md:px-12 lg:px-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-64 bg-[linear-gradient(180deg,#000_0%,rgba(0,0,0,0.8)_34%,rgba(0,0,0,0)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-72 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.74)_64%,#000_100%)]" />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-10 max-w-4xl">
          <span className="liquid-glass mb-5 inline-flex rounded-full px-4 py-2 font-body text-xs uppercase tracking-[0.22em] text-[#3e7cff]">Plans</span>
          <h2 className="font-heading text-6xl italic leading-[1.05] tracking-[0.012em] [word-spacing:0.14em] md:text-8xl">Try the review flow before you pay.</h2>
          <p className="mt-6 max-w-2xl font-body font-light leading-relaxed text-white/58">
            The free account is intentionally small: enough to see whether Cova helps you review risk.
            Upgrade when you want saved history, more Passport exports, and ongoing insight notes.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {planOptions.map((plan) => {
            const isPro = plan.name === "Cova Pro";
            return (
              <motion.article
                className={`${isPro ? "liquid-glass-strong" : "liquid-glass"} rounded-[40px] p-7 md:p-8`}
                key={plan.name}
                initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true }}
                transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div>
                    <span className={`rounded-full px-3 py-1 font-body text-xs uppercase tracking-[0.2em] ${isPro ? "bg-[#3e7cff]/18 text-[#67ddff]" : "bg-white/8 text-white/50"}`}>
                      {plan.badge}
                    </span>
                    <h3 className="mt-6 font-body text-3xl font-medium text-white">{plan.name}</h3>
                    <p className="mt-3 max-w-md font-body text-sm font-light leading-relaxed text-white/55">{plan.description}</p>
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
                    <p className="mb-3 font-body text-xs uppercase tracking-[0.22em] text-[#3e7cff]">Comes with</p>
                    <div className="grid gap-3">
                      {plan.included.map((feature) => (
                        <div className="flex items-center gap-3 font-body text-sm text-white/72" key={feature}>
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${isPro ? "border-[#3e7cff]/35 bg-[#3e7cff]/10 text-[#67ddff]" : "border-white/12 bg-white/5 text-white/58"}`}>
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
                    <GlassButton strong onClick={() => openAuth("signup")}>Join Pro Waitlist <ArrowUpRight className="h-4 w-4" /></GlassButton>
                  ) : (
                    <GlassButton strong onClick={() => go("import")}>Upload Sample Trades <ArrowUpRight className="h-4 w-4" /></GlassButton>
                  )}
                  <GlassButton onClick={() => go(isPro ? "passport" : "dashboard")}>{isPro ? "See Passport" : "Review Demo"}</GlassButton>
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
    <section className="relative overflow-hidden px-5 py-32 md:px-12 lg:px-20">
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
          <GlassButton strong onClick={() => openAuth("signup")}>Start for free</GlassButton>
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

function SectionShell({ eyebrow, title, action, backdrop, children }: { eyebrow: string; title: string; action?: React.ReactNode; backdrop?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="relative min-h-screen overflow-hidden px-5 pb-24 pt-36 md:px-12 lg:px-20">
      {backdrop}
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="liquid-glass mb-5 inline-block rounded-full px-4 py-2 font-body text-xs uppercase tracking-[0.22em] text-[#3e7cff]">{eyebrow}</span>
            <h2 className="font-heading text-6xl italic leading-[1.05] tracking-[0.01em] [word-spacing:0.12em] md:text-8xl">{title}</h2>
          </div>
          {action && <div className="self-start md:self-auto">{action}</div>}
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
      initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -14, filter: "blur(8px)" }}
      transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

function GlassButton({ children, onClick, strong = false }: { children: React.ReactNode; onClick?: () => void; strong?: boolean }) {
  return (
    <motion.button
      className={`cova-button ${strong ? "cova-button-primary" : "cova-button-secondary"} inline-flex items-center gap-2 rounded-full px-6 py-3 font-body text-sm font-medium`}
      onClick={onClick}
      type="button"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
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
          className="fixed bottom-5 left-1/2 z-[90] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 md:bottom-8"
          initial={{ opacity: 0, y: 18, scale: 0.96, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 10, scale: 0.98, filter: "blur(8px)" }}
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
          <p className={`mt-3 font-mono text-3xl ${String(value).startsWith("-") ? "text-red-400" : "text-[#3e7cff]"}`}>{value}</p>
          <p className="mt-2 font-body text-sm text-white/45">{note}</p>
        </div>
      ))}
    </div>
  );
}

function ScoreCard({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  return (
    <div className="liquid-glass rounded-[36px] p-7">
      <p className="font-body text-xs uppercase tracking-[0.22em] text-[#3e7cff]">Cova Score</p>
      <p className="mt-4 font-mono text-7xl text-[#3e7cff]">{analysis.score}<span className="text-2xl text-white/55">/100</span></p>
      <p className="mt-3 font-body text-sm text-white/55">{analysis.score >= 80 ? "Strong risk discipline" : analysis.score >= 60 ? "Decent, with room to tighten" : "Risk needs attention"}</p>
    </div>
  );
}

function FlagStack({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  return (
    <div className="liquid-glass rounded-[36px] p-7">
      <p className="font-body text-xs uppercase tracking-[0.22em] text-[#3e7cff]">What to watch</p>
      <div className="mt-5 space-y-3">
        {(analysis.breaches.length ? analysis.breaches : analysis.ruleStatuses.slice(0, 3)).map((status) => (
          <div className="flex items-center justify-between border-b border-white/10 py-3" key={status.rule.id}>
            <span className="font-body text-sm text-white/75">{status.rule.name}</span>
            <span className={status.breached ? "text-red-400" : "text-emerald-400"}>{status.breached ? "Review" : "Good"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SetupQuality({ analysis }: { analysis: ReturnType<typeof analyze> }) {
  return (
    <div className="liquid-glass rounded-[36px] p-7">
      <p className="font-body text-xs uppercase tracking-[0.22em] text-[#3e7cff]">Setups</p>
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
      <p className="font-body text-xs uppercase tracking-[0.22em] text-[#3e7cff]">Markets traded</p>
      <div className="mt-6 space-y-5">
        {analysis.byMarket.map((market) => (
          <div className="grid grid-cols-[48px_1fr_80px] items-center gap-4" key={market.name}>
            <span className="font-body text-lg">{market.name}</span>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#3e7cff]" style={{ width: `${(market.count / max) * 100}%` }} />
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
          <stop stopColor="#67ddff" />
          <stop offset="1" stopColor="#001391" />
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
          <stop stop-color="#67ddff"/>
          <stop offset="1" stop-color="#3e7cff"/>
        </linearGradient>
      </defs>
      <rect width="1400" height="900" rx="54" fill="url(#bg)"/>
      <rect x="58" y="58" width="1284" height="784" rx="42" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.24)" stroke-width="2"/>
      <text x="104" y="150" fill="#f8fbff" font-family="Georgia,serif" font-size="68" font-style="italic">Cova</text>
      <text x="104" y="252" fill="#f8fbff" font-family="Courier New,monospace" font-size="72" letter-spacing="14">RISK PASSPORT</text>
      <text x="104" y="312" fill="#7890b8" font-family="Courier New,monospace" font-size="24" letter-spacing="8">VERIFIED RISK CREDENTIAL</text>
      <rect x="104" y="390" width="1192" height="2" fill="rgba(255,255,255,0.16)"/>
      <text x="104" y="500" fill="#3e7cff" font-family="Courier New,monospace" font-size="124">${analysis.score}</text>
      <text x="292" y="500" fill="#9ba5b8" font-family="Courier New,monospace" font-size="44">/100 COVA SCORE</text>
      <text x="104" y="600" fill="#36e2a0" font-family="Courier New,monospace" font-size="54">${formatPercent(analysis.compliance)} COMPLIANCE</text>
      <text x="104" y="680" fill="#f8fbff" font-family="Courier New,monospace" font-size="32">Trades: ${analysis.trades.length} · Generated: ${analysis.latestDate}</text>
      <text x="104" y="740" fill="#9ba5b8" font-family="Courier New,monospace" font-size="26">Visibility: ${visibility.toUpperCase()} · Expiry: ${expiry.toUpperCase()}</text>
      <path d="M850 630 C920 560 960 690 1020 620 S1130 540 1230 590" fill="none" stroke="url(#line)" stroke-width="8"/>
      <rect x="1082" y="128" width="156" height="156" rx="28" fill="rgba(62,124,255,0.08)" stroke="rgba(62,124,255,0.5)"/>
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
    if (parsed?.provider === "Tradovate" && typeof parsed.message === "string") {
      return {
        provider: "Tradovate",
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

function getWixAuthEnv(mode: AuthMode) {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return mode === "signup"
    ? env.VITE_WIX_SIGNUP_URL || env.VITE_WIX_LOGIN_URL
    : env.VITE_WIX_LOGIN_URL;
}

function buildWixAuthUrl(mode: AuthMode) {
  const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash || "#dashboard"}`;
  const target = new URL(getWixAuthEnv(mode) || "/api/auth/login", window.location.origin);
  target.searchParams.set("returnUrl", returnUrl);
  target.searchParams.set("covaAuth", mode);
  return target.toString();
}

function canRedirectToWix(mode: AuthMode) {
  const configuredUrl = getWixAuthEnv(mode);
  if (!isLocalPreview()) {
    return true;
  }
  return Boolean(configuredUrl && /^https?:\/\//.test(configuredUrl));
}

function isLocalPreview() {
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
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
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const setSection = (next: Section) => {
    window.history.pushState(null, "", `#${next}`);
    setSectionState(next);
    scrollToTop();
  };
  return [section, setSection];
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
