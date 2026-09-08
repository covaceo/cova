
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
  children = "Sign up",
  className = "",
  compact = false,
  icon = false,
  onClick,
}: StartFreeButtonProps) {
  return (
    <button
      className={`native-start-button ${compact ? "native-start-button-compact" : ""} ${className}`}
      onClick={onClick}
      type="button"

    >
      <span className="native-start-button-copy">
        {children}
        {icon && <ArrowUpRight className="h-4 w-4" />}
      </span>
    </button>
  );
}
