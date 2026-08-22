import { Fingerprint, Play } from "lucide-react";

type DarkGlassSecondaryActionProps = {
  icon: "fingerprint" | "play";
  label: string;
  onClick: () => void;
};

export function CovaDarkGlassSecondaryAction({ icon, label, onClick }: DarkGlassSecondaryActionProps) {
  return (
    <button aria-label={label} className="dark-glass-secondary" onClick={onClick} type="button">
      <span aria-hidden="true" className="dark-glass-secondary__orb">
        <span className="dark-glass-secondary__aura" />
        <span className="dark-glass-secondary__rim" />
        <span className="dark-glass-secondary__face" />
        <span className="dark-glass-secondary__icon">
          {icon === "fingerprint"
            ? <Fingerprint strokeWidth={1.85} />
            : <Play fill="currentColor" strokeWidth={1.85} />}
        </span>
      </span>
      <span className="dark-glass-secondary__label">{label}</span>
    </button>
  );
}
