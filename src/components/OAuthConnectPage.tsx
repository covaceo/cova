import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, BadgeCheck, LockKeyhole, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { isLocalPreview } from "../lib/authEnvironment";
import { buildFirmConnectUrl, canRedirectToFirmProvider, getFirmProviderHost, getPropFirm, type PropFirmId } from "../lib/propFirms";
import { GlassButton } from "./GlassButton";
import { ImageAtmosphere } from "./LayoutShell";

export function OAuthConnectPage({ firmId, onApprove, onCancel }: { firmId: PropFirmId; onApprove: (firm: PropFirmId) => void; onCancel: () => void }) {
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

  function continueToProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shouldRedirectToProvider) {
      window.location.assign(buildFirmConnectUrl(firm.id));
      return;
    }
    setStep("provider");
  }

  function submitProviderSignIn(event: FormEvent<HTMLFormElement>) {
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

