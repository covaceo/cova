import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from "react";
import { paintEngravingLight } from "../lib/passportEngraving";
import { PassportEtchedContent } from "./PassportEtchedContent";
import { mountPassportOptics } from "../lib/passportOptics";
import type { HoloPassportModel } from "../lib/passportHolo";
import type { PassportAppearance } from "../lib/passportMaterials";
import pearlMaterial from "../assets/passport-pearl-material.webp?inline";

// One self-contained SVG owns live, selectable text and PNG export.
// The inpainted plate is decorative material only, with every content label
// removed. No stat, identity, rank or provenance is baked into that asset.
// Inline WebP keeps the exact material in exports without external SVG loads.
const shortLabel = (text: string, limit: number) => text.length > limit ? `${text.slice(0, limit - 1)}…` : text;

export const PassportHoloCard = forwardRef<HTMLDivElement, { model: HoloPassportModel; appearance?: PassportAppearance; engraved?: boolean }>(function PassportHoloCard({ model, appearance, engraved = false }, ref) {
  const id = `holo-${useId().replace(/:/g, "")}`;
  const materialUrl = appearance?.materialUrl ?? pearlMaterial;
  const ink = appearance?.ink ?? "#27313c";
  const mutedInk = appearance?.mutedInk ?? "#414b5b";
  const face = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => face.current!);
  useEffect(() => {
    if (face.current && canvas.current) return mountPassportOptics(face.current, canvas.current, materialUrl, engraved ? { ...(appearance ?? { film: 1, refraction: 1, gloss: 48, finishIndex: 0 }), engraved: true, onPose: pose => { if (face.current) paintEngravingLight(face.current, pose); } } : appearance);
  }, [materialUrl, appearance, engraved]);
  return <div ref={face} className="passport-card-face passport-holo-face" data-appearance={appearance?.id} data-passport-tier={model.rank.toLowerCase()} data-passport-mode={model.mode} tabIndex={0} role="group" aria-label="Interactive Passport. Move your pointer or drag to tilt. Arrow keys tilt; Home resets. Reduced motion keeps the clean base material.">
    <canvas ref={canvas} className="passport-optics-canvas" aria-hidden="true" style={{ clipPath: `url(#${id}-material-mask)` }}/>
    <svg className="passport-holo-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1672 941" width="1672" height="941" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{`Cova Risk Passport · ${model.modeLabel}`}</title>
      <desc id={`${id}-description`}>{model.identity}, {model.rank}. {model.marketLine}. {model.heroLabel}: {model.heroValue}. {model.support.join(". ")}. {model.provenance}.</desc>
      <defs><clipPath id={`${id}-material-mask`} clipPathUnits="objectBoundingBox"><path d="M .167 .100 L .838 .091 Q .873 .086 .875 .148 L .882 .819 Q .882 .887 .844 .893 L .153 .889 Q .114 .886 .115 .827 L .121 .157 Q .124 .104 .167 .100 Z"/></clipPath></defs>
      <image href={materialUrl} x="0" y="0" width="1672" height="941" preserveAspectRatio="none" aria-hidden="true" clipPath={`url(#${id}-material-mask)`}/>
      {engraved ? <PassportEtchedContent model={model} ink={ink} mutedInk={mutedInk} id={id}/> : <g fontFamily="Arial, sans-serif" fontWeight="400" fill={ink} style={{ userSelect: "text" }}>
        <text x="271" y="182" fontSize="38" letterSpacing="1.2">COVA</text>
        <text x="270" y="258" fontSize="62" letterSpacing="-1.8">Risk Passport</text>
        <text x="1407" y="164" textAnchor="end" fontSize="24">{model.sample ? "SAMPLE" : "USER-SUPPLIED"}</text>
        {model.mode !== "flex" && <text x="1407" y="202" textAnchor="end" fontSize="22">{model.modeLabel}</text>}
        <text className="passport-holo-identity" x="270" y="639" fontSize="74" letterSpacing="-2">{model.identity}</text>
        <text className="passport-holo-rank" x={model.mode === "private" ? 816 : 688} y="637" fontSize="26">{model.rank}</text>
        <text className="passport-holo-market" x="271" y="698" fontSize="28" textLength={model.marketLine.length > 48 ? 760 : undefined} lengthAdjust="spacingAndGlyphs">{shortLabel(model.marketLine, 64)}</text>
        <g className="passport-profile-hero-stat passport-holo-result">
          <text className="passport-holo-hero-value" x="1408" y="688" fontSize="66" letterSpacing="-1.3" textAnchor="end" textLength={model.heroValue.length > 10 ? 390 : undefined} lengthAdjust="spacingAndGlyphs">{model.heroValue}</text>
          <text className="passport-holo-hero-label" x="1408" y="731" fontSize="28" textAnchor="end">{model.heroLabel}</text>
        </g>
        {model.support.map((line, i) => <text key={i} className="passport-holo-support" x="271" y={770 + i * 32} fontSize="23" fill={mutedInk} textLength={line.length > 60 ? 780 : undefined} lengthAdjust="spacingAndGlyphs">{shortLabel(line, 76)}</text>)}
        <text className="passport-holo-disclosure" x="1408" y="800" fontSize="19" textAnchor="end" fill={mutedInk}>{model.provenance}</text>
      </g>}
    </svg>
  </div>;
});
