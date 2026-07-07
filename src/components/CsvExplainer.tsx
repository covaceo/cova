type CsvExplainerProps = {
  body: string;
  compact?: boolean;
  steps: string[];
};

export function CsvExplainer({ body, steps, compact = false }: CsvExplainerProps) {
  return (
    <div className={`${compact ? "mt-4 max-w-3xl" : "mt-6 max-w-4xl"} csv-help-tab mx-auto`}>
      <div className={`${compact ? "px-2.5 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]"} terminal-tab-label inline-flex font-mono uppercase tracking-[0.22em]`}>
        How CSV works
      </div>
      <div className={`${compact ? "mt-2 rounded-[18px] p-3" : "mt-3 rounded-[22px] p-4"} terminal-info-panel`}>
        <p className={`${compact ? "text-xs" : "text-sm"} font-body font-light leading-relaxed text-white/62`}>{body}</p>
        <div className={`${compact ? "mt-2 grid gap-1.5 sm:grid-cols-3" : "mt-3 grid gap-2 sm:grid-cols-3"}`}>
          {steps.map((step, index) => (
            <div className={`${compact ? "flex items-center gap-2 rounded-[12px] px-2.5 py-1.5" : "rounded-[16px] px-3 py-2"} terminal-step`} key={step}>
              <span className="font-mono text-[10px] text-[#b9f5df]/70">0{index + 1}</span>
              <p className={`${compact ? "text-[11px]" : "mt-1 text-xs"} font-body leading-snug text-white/64`}>{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
