import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

type StartFreeButtonProps = {
  children?: ReactNode;
  className?: string;
  compact?: boolean;
  icon?: boolean;
  onClick?: () => void;
};

export function StartFreeButton({
  children = "Start for free",
  className = "",
  compact = false,
  icon = false,
  onClick,
}: StartFreeButtonProps) {
  return (
    <motion.button
      className={`native-start-button ${compact ? "native-start-button-compact" : ""} ${className}`}
      onClick={onClick}
      type="button"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className="native-start-button-copy">
        {children}
        {icon && <ArrowUpRight className="h-4 w-4" />}
      </span>
    </motion.button>
  );
}
