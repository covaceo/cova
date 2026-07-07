import { motion } from "motion/react";
import type { ReactNode } from "react";

type GlassButtonProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  strong?: boolean;
  type?: "button" | "submit" | "reset";
};

export function GlassButton({
  children,
  className = "",
  disabled = false,
  onClick,
  strong = false,
  type = "button",
}: GlassButtonProps) {
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
