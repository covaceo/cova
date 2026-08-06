export function RithmicAttribution({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      aria-label="Rithmic and OMNE attribution"
      className={`rounded-[20px] border border-white/10 bg-black/20 ${compact ? "p-3" : "p-4"}`}
      data-rithmic-attribution
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <img
          alt="Trading Platform by Rithmic"
          className={compact ? "h-auto w-[210px] max-w-full opacity-90" : "h-auto w-[260px] max-w-full opacity-90"}
          src="/media/rithmic/trading-platform-by-rithmic.png"
        />
        <img
          alt="Powered by OMNE"
          className={compact ? "h-auto w-[128px] opacity-90" : "h-auto w-[150px] opacity-90"}
          src="/media/rithmic/powered-by-omne.png"
        />
      </div>
      <div className={`font-body leading-relaxed text-[rgba(255,255,255,0.68)] ${compact ? "mt-3 text-xs" : "mt-4 text-xs"}`}>
        <p>The R | Protocol API™ software is Copyright © 2026 by Rithmic, LLC. All rights reserved.</p>
        <p>Trading Platform by Rithmic™ is a trademark of Rithmic, LLC. All rights reserved.</p>
        <p>The OMNE™ software is Copyright © 2026 by Omnesys, LLC and Omnesys Technologies, Inc. All Rights Reserved.</p>
        <p>The Powered by OMNE artwork is a trademark of Omnesys, LLC and Omnesys Technologies, Inc. All Rights Reserved.</p>
      </div>
    </aside>
  );
}
