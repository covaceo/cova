import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import "./Toast.css";

type ToastTone = "info" | "success" | "warning";
type ToastState = { message: string; tone?: ToastTone } | null;

export function Toast({ toast }: { toast: ToastState }) {
  const reducedMotion = useReducedMotion();
  // Keep this presentation specific to the existing sign-in event.
  const signIn = toast?.tone === "success" && toast.message === "Signed in. Account stats are unlocked.";
  const toneClass = toast?.tone === "warning"
    ? "text-red-200"
    : toast?.tone === "success"
      ? "text-emerald-200"
      : "text-white";

  return (
    <AnimatePresence>
      {toast && (signIn ? (
        <motion.div
          key="sign-in"
          className="cova-sign-in-toast"
          data-toast-kind="sign-in"
          initial={reducedMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
          transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          role="status"
          aria-atomic="true"
        >
          <div className="cova-sign-in-toast-surface">
            <Check size={16} strokeWidth={2} aria-hidden="true" />
            <span>Signed in</span>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="message"
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
      ))}
    </AnimatePresence>
  );
}

