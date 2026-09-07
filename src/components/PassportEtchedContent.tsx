import { engravingLight, engravingShadowOffset, isPaleEngravingInk } from '../lib/passportEngraving';
import type { HoloPassportModel } from '../lib/passportHolo';
import interFont from '../assets/fonts/passport-inter-tight.woff2?inline';
import signatureFont from '../assets/fonts/Allura-Regular.ttf?inline';

const fit = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
const fontCss = `@font-face{font-family:"Cova UI";src:url("${interFont}") format("woff2");font-weight:100 900;font-style:normal;font-display:block;}@font-face{font-family:"Cova Signature";src:url("${signatureFont}") format("truetype");font-weight:400;font-style:normal;font-display:block;}`;

/** The sample's typography is live SVG, including every privacy-dependent field.
 * Fonts are embedded in the same SVG so a PNG has no external font dependency. */
export function PassportEtchedContent({ model, ink, mutedInk, id }: { model: HoloPassportModel; ink: string; mutedInk: string; id: string }) {
  const light = engravingLight({ x: 0, y: 0 });
  const paleInk = isPaleEngravingInk(ink);
  const shadow = engravingShadowOffset({ x: 0, y: 0 });
  const compact = model.mode === 'flex' || model.mode === 'private';
  const proof = compact ? [model.ruleSummary] : model.support;
  return <>
    <style>{fontCss}</style>
    <defs>
      <filter id={`${id}-glyph-etch`} x="230" y="120" width="1220" height="710" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="0.65" result="glyph-depth"/>
        <feSpecularLighting in="glyph-depth" surfaceScale="-2.4" specularConstant="0.75" specularExponent="16" lightingColor="#fff6df" result="cut-light">
          <feDistantLight data-engraving-light="true" azimuth={light.azimuth.toFixed(3)} elevation={light.elevation.toFixed(3)}/>
        </feSpecularLighting>
        <feComposite in="cut-light" in2="SourceAlpha" operator="in" result="cut-rim"/>
        <feComposite in="SourceGraphic" in2="cut-rim" operator="arithmetic" k1="0" k2="1" k3="0.5" k4="0" result={paleInk ? 'cut-ink' : undefined}/>
        {paleInk && <>
          <feOffset in="glyph-depth" dx={shadow.dx.toFixed(3)} dy={shadow.dy.toFixed(3)} data-engraving-shadow="true" result="cut-offset"/>
          <feComposite in="SourceAlpha" in2="cut-offset" operator="out" result="inner-cut"/>
          <feFlood floodColor="#080b10" floodOpacity="0.65" result="cut-shade"/>
          <feComposite in="cut-shade" in2="inner-cut" operator="in" result="cut-shadow"/>
          <feMerge><feMergeNode in="cut-ink"/><feMergeNode in="cut-shadow"/></feMerge>
        </>}
      </filter>
    </defs>
    <g filter={`url(#${id}-glyph-etch)`} fontFamily="Cova UI, Arial, sans-serif" fontWeight="400" fill={ink} style={{ userSelect: 'text' }}>
      <text className="passport-etched-signature" x="270" y="206" fontFamily="Cova Signature, cursive" fontSize="80">Cova</text>
      <text className="passport-etched-rank" x="274" y="251" fontSize="20" fontWeight="450" letterSpacing="3" textLength={model.rank.length > 15 ? 320 : undefined} lengthAdjust="spacingAndGlyphs">{model.rank.toUpperCase()}</text>
      <text className="passport-holo-identity" x="271" y="485" fontSize="36" letterSpacing="-0.5" textLength={model.identity.length > 24 ? 560 : undefined} lengthAdjust="spacingAndGlyphs">{fit(model.identity, 32)}</text>
      <g className="passport-profile-hero-stat passport-holo-result">
        <text className="passport-holo-hero-value" x="267" y="606" fontSize="110" fontWeight="500" letterSpacing="-3" textLength={model.heroValue.length > 10 ? 565 : undefined} lengthAdjust="spacingAndGlyphs">{model.heroValue}</text>
        <text className="passport-holo-hero-label" x="272" y="652" fontSize="27">{model.heroLabel}</text>
      </g>
      <text className="passport-holo-market" x="272" y="698" fontSize="25" textLength={model.marketLine.length > 43 ? 560 : undefined} lengthAdjust="spacingAndGlyphs">{fit(model.marketLine, 54)}</text>
      {proof.map((line, index) => <text key={index} className="passport-holo-support" x="272" y={compact ? 776 : 747 + index * 29} fontSize={compact ? 26 : 22} fontWeight={compact ? '500' : '400'} fill={mutedInk} textLength={line.length > 58 ? 700 : undefined} lengthAdjust="spacingAndGlyphs">{fit(line, 72)}</text>)}
      <text className="passport-etched-website" x="1408" y="798" textAnchor="end" fontSize="31" fontWeight="650" letterSpacing="-0.3">covadesk.com</text>
    </g>
    <text className="passport-holo-disclosure" x="272" y="814" fontFamily="Cova UI, Arial, sans-serif" fontWeight="400" fontSize="19" fill={mutedInk}>{model.provenance}</text>
  </>;
}
