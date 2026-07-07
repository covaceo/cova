import { AnimatePresence, motion } from "motion/react";

type ToastTone = "info" | "success" | "warning";
type ToastState = { message: string; tone?: ToastTone } | null;

export function Toast({ toast }: { toast: ToastState }) {
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

