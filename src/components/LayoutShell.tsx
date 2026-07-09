import { motion } from "motion/react";
import type { ReactNode } from "react";

type SectionShellProps = {
  action?: ReactNode;
  backdrop?: ReactNode;
  children: ReactNode;
  eyebrow: string;
  title: string;
  variant?: "editorial" | "workspace";
};

export function SectionShell({
  eyebrow,
  title,
  action,
  backdrop,
  children,
  variant = "editorial",
}: SectionShellProps) {
  const isWorkspace = variant === "workspace";
  return (
    <section className={`deferred-paint-section relative min-h-screen overflow-hidden px-5 md:px-12 lg:px-20 ${isWorkspace ? "pb-16 pt-28 md:pt-28" : "pb-16 pt-28 md:pb-24 md:pt-36"}`}>
      {backdrop}
      <div className="relative z-10 mx-auto w-full max-w-[calc(100vw-2.5rem)] md:max-w-7xl">
        <div className={`grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end ${isWorkspace ? "mb-6" : "mb-8 md:mb-12"}`}>
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

type ImageAtmosphereProps = {
  align?: "center" | "right";
  opacity?: string;
  src: string;
};

export function ImageAtmosphere({ src, align = "center", opacity = "opacity-[0.42]" }: ImageAtmosphereProps) {
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

export function RouteFrame({ children }: { children: ReactNode }) {
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
