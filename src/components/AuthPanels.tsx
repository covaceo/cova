import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, LockKeyhole, Mail, SlidersHorizontal, UserRound, X } from "lucide-react";
import { buildHostedAuthUrl, canRedirectToHostedAuth, isLocalPreview } from "../lib/authEnvironment";
import { isSupabaseConfigured, sendSupabaseMagicLink } from "../lib/supabaseClient";
import { GlassButton } from "./GlassButton";
import { ImageAtmosphere } from "./LayoutShell";
import { StartFreeButton } from "./StartFreeButton";

type AuthMode = "login" | "signup";
type PlanTier = "free" | "pro";
type AuthSource = "local-preview" | "hosted" | "supabase";

type AuthGateProps = {
  devPreviewEmail: string;
  openAuth: (mode: AuthMode) => void;
  onDevPreview: () => void;
};

type AuthSheetProps = {
  authIntentKey: string;
  close: () => void;
  mode: AuthMode | null;
  onAuthenticated: (email: string, mode: AuthMode, source?: AuthSource, plan?: PlanTier, userId?: string) => void;
  onDevPreview: () => void;
  setMode: (mode: AuthMode) => void;
};

export function AuthGate({ devPreviewEmail, openAuth, onDevPreview }: AuthGateProps) {
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
              Local only: unlocks the demo workspace as {devPreviewEmail}.
            </p>
          )}
        </motion.div>
      </div>
    </section>
  );
}

export function AuthSheet({ authIntentKey, mode, setMode, close, onAuthenticated, onDevPreview }: AuthSheetProps) {
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode) {
      return;
    }
    setAuthBusy(true);
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash || "#dashboard"}`;

    localStorage.setItem(
      authIntentKey,
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

