import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, RotateCw, SlidersHorizontal, X } from "lucide-react";
import { buildHostedAuthUrl, canRedirectToHostedAuth, isDemoPreviewEnabled, isLocalPreview } from "../lib/authEnvironment";
import {
  isSupabaseConfigured,
  resendSupabaseSignupConfirmation,
  sendSupabaseLoginLink,
  sendSupabasePasswordReset,
  signInWithSupabasePassword,
  signUpWithSupabasePassword,
} from "../lib/supabaseClient";
import { GlassButton } from "./GlassButton";
import { ImageAtmosphere } from "./LayoutShell";
import { StartFreeButton } from "./StartFreeButton";

type AuthMode = "login" | "signup";
type PlanTier = "free" | "pro";
type AuthSource = "local-preview" | "hosted" | "supabase";
type AuthView = "credentials" | "email-sent" | "forgot-password";
type EmailAction = "login-link" | "reset" | "signup";

function buildSupabaseRedirectUrl() {
  const redirectUrl = new URL(window.location.href);
  redirectUrl.search = "";
  redirectUrl.hash = "";
  return redirectUrl.toString();
}

function customerAuthError(error: unknown, fallback: string) {
  const raw = typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : "";
  const message = raw.toLowerCase();
  if (message.includes("invalid login credentials")) return "Incorrect email or password.";
  if (message.includes("email not confirmed")) return "Verify your email before signing in.";
  if (message.includes("user already registered")) return "An account already exists for this email. Sign in instead.";
  if (message.includes("password") && (message.includes("weak") || message.includes("least"))) return "Use a password with at least 8 characters.";
  if (message.includes("rate") || message.includes("too many")) return "Too many attempts. Wait a moment and try again.";
  return fallback;
}

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
  onAuthAttemptAborted: (attemptId: number) => void;
  onAuthSessionIsCurrent: (session: SupabaseSession, attemptId: number) => boolean;
  onAuthAttemptStarted: () => number;
  onDiscardAuthSession: (session: SupabaseSession) => Promise<void>;
  onDeleteRestrictedAccount: () => Promise<void>;
  onDevPreview: () => void;
  onDisconnectProviders: () => Promise<void>;
  onInspectProviders: () => Promise<void>;
  onPasswordRecovered: () => void;
  onPolicyAccepted: () => Promise<void>;
  onUpdatePassword: (password: string) => Promise<void>;
  passwordRecovery: boolean;
  pendingPolicyConfirmation: boolean;
  setMode: (mode: AuthMode) => void;
};

export function AuthGate({ devPreviewEmail, openAuth, onDevPreview }: AuthGateProps) {
  const showDevPreview = isDemoPreviewEnabled();

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
            Cova hides uploads, risk scores, limit warnings, insights, and Passport details until you sign in.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <GlassButton strong onClick={() => openAuth("login")}>Sign in</GlassButton>
            <StartFreeButton compact onClick={() => openAuth("signup")} />
            {showDevPreview && <GlassButton onClick={onDevPreview}>Dev preview</GlassButton>}
          </div>
          {showDevPreview && (
            <p className="mx-auto mt-5 max-w-md font-body text-xs leading-relaxed text-white/55">
              Demo preview: unlocks the sample workspace as {devPreviewEmail}. No live broker connection or real trade execution.
            </p>
          )}
        </motion.div>
      </div>
    </section>
  );
}

export function AuthSheet({
  authIntentKey,
  mode,
  setMode,
  close,
  onAuthenticated,
  onAuthAttemptAborted,
  onAuthSessionIsCurrent,
  onAuthAttemptStarted,
  onDeleteRestrictedAccount,
  onDevPreview,
  onDiscardAuthSession,
  onDisconnectProviders,
  onInspectProviders,
  onPasswordRecovered,
  onPolicyAccepted,
  onUpdatePassword,
  passwordRecovery,
  pendingPolicyConfirmation,
}: AuthSheetProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [view, setView] = useState<AuthView>("credentials");
  const [emailAction, setEmailAction] = useState<EmailAction>("signup");
  const isSignup = mode === "signup";
  const canRedirect = mode ? canRedirectToHostedAuth(mode) : false;
  const supabaseReady = isSupabaseConfigured();
  const showDevPreview = isDemoPreviewEnabled();
  const authOpen = Boolean(mode);
  const [modalIsolationActive, setModalIsolationActive] = useState(authOpen);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const credentialRequestInFlightRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(close);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  closeRef.current = close;

  useEffect(() => {
    setNotice("");
    setPolicyAccepted(false);
    setPassword("");
    setPasswordConfirmation("");
    setShowPassword(false);
    setView("credentials");
  }, [mode, passwordRecovery, pendingPolicyConfirmation]);

  useLayoutEffect(() => {
    if (!authOpen) return;
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>("[data-auth-initial-focus]")?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [authOpen, view, pendingPolicyConfirmation, passwordRecovery]);

  useLayoutEffect(() => {
    if (authOpen) setModalIsolationActive(true);
  }, [authOpen]);

  useLayoutEffect(() => {
    if (!modalIsolationActive) return;

    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    if (!overlay || !dialog) return;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const previousBodyStyle = {
      left: document.body.style.left,
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      right: document.body.style.right,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    const previousRootOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = `-${scrollX}px`;
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = Array.from(overlay.parentElement?.children ?? [])
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlay)
      .map((node) => ({ node, inert: node.inert, ariaHidden: node.getAttribute("aria-hidden") }));
    background.forEach(({ node }) => {
      node.inert = true;
      node.setAttribute("aria-hidden", "true");
    });

    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
    )).filter((element) => element.offsetParent !== null);
    const focusFrame = window.requestAnimationFrame(() => {
      const mobileInitialFocus = window.matchMedia("(max-width: 767px)").matches
        ? dialog.querySelector<HTMLElement>("[data-auth-mobile-initial-focus]")
        : null;
      (mobileInitialFocus || dialog.querySelector<HTMLElement>("[data-auth-initial-focus]") || focusable()[0] || dialog).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      background.forEach(({ node, inert, ariaHidden }) => {
        node.inert = inert;
        if (ariaHidden === null) node.removeAttribute("aria-hidden");
        else node.setAttribute("aria-hidden", ariaHidden);
      });
      document.documentElement.style.overflow = previousRootOverflow;
      Object.assign(document.body.style, previousBodyStyle);
      window.scrollTo(scrollX, scrollY);
      const opener = openerRef.current;
      openerRef.current = null;
      window.requestAnimationFrame(() => opener?.focus());
    };
  }, [modalIsolationActive]);

  function saveAuthIntent(authMode: AuthMode) {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash || "#dashboard"}`;
    localStorage.setItem(authIntentKey, JSON.stringify({
      email: email.trim(),
      mode: authMode,
      returnTo,
      savedAt: new Date().toISOString(),
    }));
  }

  function switchMode(nextMode: AuthMode) {
    setView("credentials");
    setNotice("");
    setMode(nextMode);
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode || pendingPolicyConfirmation || passwordRecovery) return;
    if (password.length < 8) {
      setNotice("Use a password with at least 8 characters.");
      return;
    }

    if (credentialRequestInFlightRef.current) return;
    credentialRequestInFlightRef.current = true;
    let providerAttemptId: number | null = null;
    let providerAttemptStarted = false;
    const abortProviderAttempt = () => {
      if (!providerAttemptStarted || providerAttemptId === null) return;
      providerAttemptStarted = false;
      onAuthAttemptAborted(providerAttemptId);
    };
    setAuthBusy(true);
    setNotice("");
    saveAuthIntent(mode);

    try {
      if (isDemoPreviewEnabled()) {
        onAuthenticated(email, mode, "local-preview", "free");
        return;
      }

      if (supabaseReady) {
        providerAttemptId = onAuthAttemptStarted();
        providerAttemptStarted = true;
        if (isSignup) {
          const { data, error } = await signUpWithSupabasePassword(email.trim(), password, buildSupabaseRedirectUrl());
          if (error) {
            abortProviderAttempt();
            setNotice(customerAuthError(error, "Could not create your account. Try again."));
            return;
          }
          if (data.session && !onAuthSessionIsCurrent(data.session, providerAttemptId)) {
            providerAttemptStarted = false;
            await onDiscardAuthSession(data.session);
            return;
          }
          if (data.session) {
            setNotice("Account created. Finishing setup...");
            return;
          }
          abortProviderAttempt();
          setEmailAction("signup");
          setView("email-sent");
          return;
        }

        const { data, error } = await signInWithSupabasePassword(email.trim(), password);
        if (error) {
          abortProviderAttempt();
          setNotice(customerAuthError(error, "Could not sign in. Try again."));
          return;
        }
        if (!data.session) {
          abortProviderAttempt();
          setNotice("Could not sign in. Try again.");
          return;
        }
        if (!onAuthSessionIsCurrent(data.session, providerAttemptId)) {
          providerAttemptStarted = false;
          await onDiscardAuthSession(data.session);
          return;
        }
        setNotice("Signing you in...");
        return;
      }

      if (!canRedirectToHostedAuth(mode)) {
        if (!isLocalPreview()) {
          setNotice("Account access is temporarily unavailable. Try again later.");
          return;
        }
        onAuthenticated(email, mode, "local-preview", "free");
        return;
      }

      window.location.assign(buildHostedAuthUrl(mode));
    } catch (error) {
      abortProviderAttempt();
      setNotice(customerAuthError(error, isSignup ? "Could not create your account. Try again." : "Could not sign in. Try again."));
    } finally {
      credentialRequestInFlightRef.current = false;
      setAuthBusy(false);
    }
  }

  async function submitForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveAuthIntent("login");
    setAuthBusy(true);
    setNotice("");
    try {
      if (!supabaseReady) {
        setNotice("Password recovery is temporarily unavailable. Try again later.");
        return;
      }
      const { error } = await sendSupabasePasswordReset(email.trim(), buildSupabaseRedirectUrl());
      if (error) {
        setNotice(customerAuthError(error, "Could not send the reset link. Try again."));
        return;
      }
      setEmailAction("reset");
      setView("email-sent");
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setNotice("Use a password with at least 8 characters.");
      return;
    }
    if (password !== passwordConfirmation) {
      setNotice("Passwords do not match.");
      return;
    }
    setAuthBusy(true);
    setNotice("");
    try {
      await onUpdatePassword(password);
      setNotice("Password updated. Signing you in...");
      onPasswordRecovered();
    } catch (error) {
      setNotice(customerAuthError(error, "Could not update your password. Request a new reset link."));
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policyAccepted) {
      setNotice("Agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }
    setAuthBusy(true);
    setNotice("");
    try {
      await onPolicyAccepted();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not record your agreement. Try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function emailLoginLink() {
    if (!email.trim()) {
      setNotice("Enter your email first.");
      emailInputRef.current?.focus();
      return;
    }
    setAuthBusy(true);
    setNotice("");
    saveAuthIntent("login");
    try {
      const { error } = await sendSupabaseLoginLink(email.trim(), buildSupabaseRedirectUrl());
      if (error) {
        setNotice(customerAuthError(error, "Could not send the sign-in link. Try again."));
        return;
      }
      setEmailAction("login-link");
      setView("email-sent");
    } finally {
      setAuthBusy(false);
    }
  }

  async function resendEmail() {
    setAuthBusy(true);
    setNotice("");
    try {
      const redirectTo = buildSupabaseRedirectUrl();
      const result = emailAction === "signup"
        ? await resendSupabaseSignupConfirmation(email.trim(), redirectTo)
        : emailAction === "reset"
          ? await sendSupabasePasswordReset(email.trim(), redirectTo)
          : await sendSupabaseLoginLink(email.trim(), redirectTo);
      if (result.error) {
        setNotice(customerAuthError(result.error, "Could not resend the email. Try again."));
        return;
      }
      setNotice("Email sent again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function runRestrictedAction(action: () => Promise<void>) {
    setAuthBusy(true);
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Account management could not be completed.");
    } finally {
      setAuthBusy(false);
    }
  }

  const dialogLabel = passwordRecovery
    ? "Reset Cova password"
    : pendingPolicyConfirmation
      ? "Accept Cova terms"
      : view === "forgot-password"
        ? "Reset Cova password"
        : view === "email-sent"
          ? "Check your email"
          : isSignup
            ? "Sign up to Cova"
            : "Sign in to Cova";

  return (
    <AnimatePresence onExitComplete={() => setModalIsolationActive(false)}>
      {mode && (
        <motion.div
          ref={overlayRef}
          className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto overscroll-y-contain p-3 pt-16 md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button className="absolute inset-0 cursor-default bg-black/72 backdrop-blur-md" onClick={close} tabIndex={-1} type="button" aria-label="Close auth panel" />
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            className="liquid-glass-strong relative my-auto w-full max-w-[520px] shrink-0 overflow-hidden rounded-[32px] border border-white/10 p-1.5"
            initial={{ opacity: 0, y: 24, scale: 0.98, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 16, scale: 0.98, filter: "blur(8px)" }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={dialogLabel}
          >
            <div className="relative rounded-[26px] border border-white/[0.07] bg-black/78 p-6 md:p-8">
              <button data-auth-mobile-initial-focus className="absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.045] text-white/70 transition hover:border-white/20 hover:text-white" onClick={close} type="button" aria-label="Close">
                <X className="h-4 w-4" />
              </button>

              {!pendingPolicyConfirmation && !passwordRecovery && view === "credentials" && (
                <div className="terminal-tab-bar mb-8 inline-grid grid-cols-2" aria-label="Account access">
                  {(["login", "signup"] as const).map((item) => {
                    const active = mode === item;
                    return (
                      <button
                        className={`auth-account-tab terminal-tab px-5 py-2 font-body text-sm font-medium ${active ? "terminal-tab-active" : ""}`}
                        key={item}
                        onClick={() => switchMode(item)}
                        type="button"
                      >
                        {active && <motion.span className="terminal-tab-motion" layoutId="auth-tab-active" transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} />}
                        <span className="terminal-tab-copy">{item === "login" ? "Sign in" : "Sign up"}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {pendingPolicyConfirmation ? (
                <form onSubmit={submitPolicy}>
                  <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-[#18c887]">One last step</p>
                  <h2 className="mt-3 pr-10 font-body text-3xl font-semibold tracking-[-0.035em] text-white">Review and accept</h2>
                  <p className="mt-3 font-body text-sm font-light leading-6 text-white/58">Your email is verified. Accept Cova’s current terms to finish setting up your account.</p>

                  <label className="mt-7 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 font-body text-sm leading-6 text-white/68" aria-label="I agree to the Terms of Service and Privacy Policy">
                    <input data-auth-initial-focus className="mt-1 h-4 w-4 shrink-0 accent-[#18c887]" checked={policyAccepted} onChange={(event) => setPolicyAccepted(event.target.checked)} required type="checkbox" />
                    <span>
                      I agree to the{" "}
                      <a className="text-[#b9f5df] underline underline-offset-4" href="#terms" rel="noopener noreferrer" target="_blank">Terms of Service</a>
                      {" "}and{" "}
                      <a className="text-[#b9f5df] underline underline-offset-4" href="#privacy" rel="noopener noreferrer" target="_blank">Privacy Policy</a>.
                    </span>
                  </label>

                  <button className="cova-button cova-button-primary mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-body text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60" disabled={authBusy || !policyAccepted} type="submit">
                    {authBusy ? "Saving..." : "Accept and continue"}<ArrowRight className="h-4 w-4" />
                  </button>

                  <div className="mt-5 grid gap-2 border-t border-white/10 pt-5">
                    <p className="font-body text-xs leading-5 text-white/60">You can still review or remove saved account data without accepting updated terms.</p>
                    <button className="cova-button cova-button-secondary inline-flex w-full items-center justify-center rounded-xl px-6 py-3 font-body text-sm font-medium disabled:opacity-60" disabled={authBusy} onClick={() => { void runRestrictedAction(onInspectProviders); }} type="button">Check saved providers</button>
                    <button className="cova-button cova-button-secondary inline-flex w-full items-center justify-center rounded-xl px-6 py-3 font-body text-sm font-medium disabled:opacity-60" disabled={authBusy} onClick={() => { void runRestrictedAction(onDisconnectProviders); }} type="button">Disconnect saved providers</button>
                    <button className="inline-flex w-full items-center justify-center rounded-xl border border-red-300/24 px-6 py-3 font-body text-sm font-medium text-red-100 transition hover:border-red-200/45 disabled:opacity-60" disabled={authBusy} onClick={() => { void runRestrictedAction(onDeleteRestrictedAccount); }} type="button">Delete account</button>
                    <button className="px-4 py-2 font-body text-xs text-white/52 underline underline-offset-4 hover:text-white" disabled={authBusy} onClick={close} type="button">Sign out</button>
                  </div>
                </form>
              ) : passwordRecovery ? (
                <form onSubmit={submitNewPassword}>
                  <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-[#18c887]">Password reset</p>
                  <h2 className="mt-3 pr-10 font-body text-3xl font-semibold tracking-[-0.035em] text-white">Set a new password</h2>
                  <p className="mt-3 font-body text-sm font-light leading-6 text-white/58">Choose a new password for your Cova account.</p>

                  <PasswordField autoComplete="new-password" id="new-password" label="New password" password={password} setPassword={setPassword} showPassword={showPassword} setShowPassword={setShowPassword} />
                  <label className="mt-5 block font-body text-sm font-medium text-white/72" htmlFor="confirm-password">Confirm new password</label>
                  <input id="confirm-password" className="mt-2 w-full rounded-xl border border-white/12 bg-white/[0.035] px-4 py-3.5 font-body text-sm text-white outline-none transition placeholder:text-white/55 focus:border-[#18c887]/60" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} type="password" autoComplete="new-password" minLength={8} required />

                  <button className="cova-button cova-button-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-body text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60" disabled={authBusy} type="submit">
                    {authBusy ? "Updating..." : "Update password"}<ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              ) : view === "email-sent" ? (
                <div className="text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#18c887]/24 bg-[#18c887]/10 text-[#18c887]"><Mail className="h-5 w-5" /></span>
                  <p className="mt-6 font-body text-xs font-semibold uppercase tracking-[0.2em] text-[#18c887]">Email sent</p>
                  <h2 data-auth-initial-focus tabIndex={-1} className="mt-3 font-body text-3xl font-semibold tracking-[-0.035em] text-white">Check your email</h2>
                  <p className="mx-auto mt-3 max-w-sm font-body text-sm font-light leading-6 text-white/58">
                    {emailAction === "signup"
                      ? <>We sent a verification link to <strong className="font-medium text-white/78">{email}</strong>. Open it to finish creating your account.</>
                      : emailAction === "reset"
                        ? <>If an account exists for <strong className="font-medium text-white/78">{email}</strong>, you’ll receive a password reset link.</>
                        : <>If an account exists for <strong className="font-medium text-white/78">{email}</strong>, you’ll receive a sign-in link.</>}
                  </p>
                  <button className="cova-button cova-button-secondary mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 font-body text-sm font-medium disabled:opacity-60" disabled={authBusy} onClick={() => { void resendEmail(); }} type="button">
                    <RotateCw className="h-4 w-4" />
                    {authBusy ? "Sending..." : emailAction === "signup" ? "Resend verification email" : emailAction === "reset" ? "Resend reset link" : "Resend sign-in link"}
                  </button>
                  <button
                    className="mt-4 font-body text-sm text-[#b9f5df] underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={authBusy}
                    onClick={() => {
                      setNotice("");
                      if (emailAction === "signup") setView("credentials");
                      else switchMode("login");
                    }}
                    type="button"
                  >
                    {emailAction === "signup" ? "Use another email" : "Back to sign in"}
                  </button>
                </div>
              ) : view === "forgot-password" ? (
                <form onSubmit={submitForgotPassword}>
                  <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-[#18c887]">Password recovery</p>
                  <h2 className="mt-3 pr-10 font-body text-3xl font-semibold tracking-[-0.035em] text-white">Reset your password</h2>
                  <p className="mt-3 font-body text-sm font-light leading-6 text-white/58">Enter your account email and we’ll send you a reset link.</p>
                  <EmailField email={email} setEmail={setEmail} inputRef={emailInputRef} />
                  <button className="cova-button cova-button-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-body text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60" disabled={authBusy} type="submit">
                    {authBusy ? "Sending..." : "Send reset link"}<ArrowRight className="h-4 w-4" />
                  </button>
                  <button className="mt-4 w-full font-body text-sm text-[#b9f5df] underline underline-offset-4" onClick={() => setView("credentials")} type="button">Back to sign in</button>
                </form>
              ) : (
                <form onSubmit={submitCredentials}>
                  <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-[#18c887]">{isSignup ? "New account" : "Welcome back"}</p>
                  <h2 className="mt-3 pr-10 font-body text-3xl font-semibold tracking-[-0.035em] text-white">{isSignup ? "Create your account" : "Sign in to Cova"}</h2>
                  <p className="mt-3 font-body text-sm font-light leading-6 text-white/58">{isSignup ? "Create a free account to save imports, limits, review notes, and Practice history. No payment required." : "Enter your email and password to continue."}</p>

                  <EmailField email={email} setEmail={setEmail} inputRef={emailInputRef} />
                  <PasswordField autoComplete={isSignup ? "new-password" : "current-password"} id="auth-password" label="Password" password={password} setPassword={setPassword} showPassword={showPassword} setShowPassword={setShowPassword} />

                  {!isSignup && (
                    <button className="mt-3 block font-body text-xs text-[#b9f5df] underline underline-offset-4" onClick={() => { setNotice(""); setView("forgot-password"); }} type="button">Forgot password?</button>
                  )}

                  <button className="cova-button cova-button-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-body text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60" disabled={authBusy} type="submit">
                    {authBusy ? (isSignup ? "Creating account..." : "Signing in...") : isSignup ? "Create account" : "Sign in"}<ArrowRight className="h-4 w-4" />
                  </button>

                  {isSignup ? (
                    <p className="mt-4 text-center font-body text-xs leading-5 text-white/60">After verifying your email, you’ll review Cova’s <a className="text-[#b9f5df] underline underline-offset-4" href="#terms" rel="noopener noreferrer" target="_blank">Terms of Service</a> and <a className="text-[#b9f5df] underline underline-offset-4" href="#privacy" rel="noopener noreferrer" target="_blank">Privacy Policy</a>.</p>
                  ) : supabaseReady ? (
                    <button className="mt-4 w-full font-body text-xs text-white/52 underline underline-offset-4 transition hover:text-white" disabled={authBusy} onClick={() => { void emailLoginLink(); }} type="button">Email me a sign-in link</button>
                  ) : null}

                  <p className="mt-6 text-center font-body text-sm text-white/52">
                    {isSignup ? "Already have an account?" : "New to Cova?"}{" "}
                    <button className="font-medium text-[#b9f5df] underline underline-offset-4" onClick={() => switchMode(isSignup ? "login" : "signup")} type="button">{isSignup ? "Sign in" : "Sign up"}</button>
                  </p>

                  {showDevPreview && (
                    <button className="cova-button cova-button-secondary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 font-body text-sm font-medium" onClick={onDevPreview} type="button">
                      <SlidersHorizontal className="h-4 w-4" />Enter dev preview
                    </button>
                  )}
                </form>
              )}

              <p className="mt-4 min-h-5 font-body text-xs leading-relaxed text-amber-100/72" aria-live="polite" role="status">{notice}</p>
              {!pendingPolicyConfirmation && !passwordRecovery && view === "credentials" && (
                <p className="mt-1 flex items-center justify-center gap-2 font-body text-[11px] text-white/60"><LockKeyhole className="h-3 w-3" />Secure account access</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EmailField({ email, setEmail, inputRef }: { email: string; setEmail: (email: string) => void; inputRef: RefObject<HTMLInputElement> }) {
  return (
    <>
      <label className="mt-7 block font-body text-sm font-medium text-white/72" htmlFor="auth-email">Email</label>
      <div className="relative mt-2">
        <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
        <input ref={inputRef} id="auth-email" data-auth-initial-focus className="w-full rounded-xl border border-white/12 bg-white/[0.035] py-3.5 pl-11 pr-4 font-body text-sm text-white outline-none transition placeholder:text-white/55 focus:border-[#18c887]/60" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" autoComplete="email" inputMode="email" required />
      </div>
    </>
  );
}

function PasswordField({ autoComplete, id, label, password, setPassword, showPassword, setShowPassword }: {
  autoComplete: "current-password" | "new-password";
  id: string;
  label: string;
  password: string;
  setPassword: (password: string) => void;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
}) {
  return (
    <>
      <label className="mt-5 block font-body text-sm font-medium text-white/72" htmlFor={id}>{label}</label>
      <div className="relative mt-2">
        <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
        <input id={id} data-auth-initial-focus={id === "new-password" ? "" : undefined} className="w-full rounded-xl border border-white/12 bg-white/[0.035] py-3.5 pl-11 pr-12 font-body text-sm text-white outline-none transition placeholder:text-white/55 focus:border-[#18c887]/60" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete={autoComplete} minLength={8} required />
        <button className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-white/65 transition hover:bg-white/[0.06] hover:text-white" onClick={() => setShowPassword(!showPassword)} type="button" aria-label={showPassword ? "Hide password" : "Show password"}>
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {autoComplete === "new-password" && <p className="mt-2 font-body text-[11px] text-white/60">Use at least 8 characters.</p>}
    </>
  );
}
