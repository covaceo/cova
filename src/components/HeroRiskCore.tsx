import { motion, useReducedMotion } from "motion/react";
import "../styles/heroRiskCore.css";

const coreLayers = Array.from({ length: 8 }, (_, index) => index);
const signalTicks = Array.from({ length: 28 }, (_, index) => index);

const tradeEvents = [
  { x: 294, y: 404, tone: "kept", label: "09:34" },
  { x: 342, y: 347, tone: "kept", label: "09:51" },
  { x: 406, y: 309, tone: "loss", label: "10:02" },
  { x: 493, y: 294, tone: "breach", label: "10:07" },
  { x: 565, y: 337, tone: "loss", label: "10:18" },
  { x: 574, y: 421, tone: "kept", label: "10:43" },
] as const;

export function HeroRiskCore() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.figure
      className="hero-risk-core-stage"
      initial={shouldReduceMotion ? false : { opacity: 0, x: 46, scale: 0.975 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.05, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Animated sample Cova risk core"
    >
      <div className="risk-core-atmosphere" aria-hidden="true" />
      <div className="risk-core-ground" aria-hidden="true" />

      <div className="risk-core-geometry">
        <div className="risk-core-motion">
          <svg
            className="risk-core-vector"
            viewBox="0 0 900 700"
            role="presentation"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="riskCorePlate" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#171411" />
                <stop offset="0.48" stopColor="#090a09" />
                <stop offset="1" stopColor="#040504" />
              </linearGradient>
              <linearGradient id="riskCoreCopper" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#704c36" />
                <stop offset="0.42" stopColor="#d3a47c" />
                <stop offset="0.67" stopColor="#f0dfcc" />
                <stop offset="1" stopColor="#8e6042" />
              </linearGradient>
              <linearGradient id="riskCoreScan" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#18c887" stopOpacity="0" />
                <stop offset="0.42" stopColor="#18c887" stopOpacity="0.08" />
                <stop offset="0.5" stopColor="#dff9ed" stopOpacity="0.64" />
                <stop offset="0.58" stopColor="#18c887" stopOpacity="0.08" />
                <stop offset="1" stopColor="#18c887" stopOpacity="0" />
              </linearGradient>
              <radialGradient id="riskCoreAperture" cx="50%" cy="42%" r="62%">
                <stop offset="0" stopColor="#f0dfcc" stopOpacity="0.18" />
                <stop offset="0.23" stopColor="#bf8964" stopOpacity="0.13" />
                <stop offset="0.56" stopColor="#11110f" stopOpacity="0.96" />
                <stop offset="1" stopColor="#050505" />
              </radialGradient>
              <linearGradient id="riskCoreFault" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ff9b93" />
                <stop offset="0.42" stopColor="#ff5f68" />
                <stop offset="1" stopColor="#7d242b" />
              </linearGradient>
              <filter id="riskCoreShadow" x="-60%" y="-60%" width="220%" height="240%">
                <feGaussianBlur stdDeviation="18" />
              </filter>
              <filter id="riskCoreCopperGlow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="riskCoreFaultGlow" x="-120%" y="-120%" width="340%" height="340%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <clipPath id="riskCoreClip">
                <polygon points="432,86 594,134 692,257 682,414 593,548 437,605 292,552 219,426 232,270 316,145" />
              </clipPath>
            </defs>

            <ellipse className="risk-core-shadow" cx="450" cy="575" rx="286" ry="76" fill="#000" filter="url(#riskCoreShadow)" />

            <g className="risk-core-orbit-field">
              <ellipse cx="454" cy="351" rx="346" ry="256" />
              <ellipse cx="454" cy="351" rx="300" ry="219" />
              <ellipse cx="454" cy="351" rx="252" ry="184" />
              <path d="M108 351H800" />
              <path d="M454 72V632" />
            </g>

            <g className="risk-core-signal-ticks">
              {signalTicks.map((tick) => {
                const angle = (tick / signalTicks.length) * Math.PI * 2;
                const x1 = 454 + Math.cos(angle) * 318;
                const y1 = 351 + Math.sin(angle) * 234;
                const x2 = 454 + Math.cos(angle) * (tick % 4 === 0 ? 333 : 326);
                const y2 = 351 + Math.sin(angle) * (tick % 4 === 0 ? 246 : 240);
                return <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2} />;
              })}
            </g>

            <g className="risk-core-layer-stack">
              {coreLayers.map((layer) => (
                <polygon
                  className="risk-core-plate-layer"
                  key={layer}
                  points="432,86 594,134 692,257 682,414 593,548 437,605 292,552 219,426 232,270 316,145"
                  transform={`translate(0 ${20 - layer * 3.1})`}
                  style={{ opacity: 0.18 + layer * 0.075 }}
                />
              ))}
            </g>

            <g className="risk-core-side-faces">
              <polygon points="692,257 682,414 593,548 593,574 682,440 692,283" />
              <polygon points="593,548 437,605 292,552 292,578 437,631 593,574" />
              <polygon points="292,552 219,426 219,452 292,578" />
            </g>

            <polygon
              className="risk-core-top-plate"
              points="432,86 594,134 692,257 682,414 593,548 437,605 292,552 219,426 232,270 316,145"
              fill="url(#riskCorePlate)"
            />

            <g className="risk-core-grid" clipPath="url(#riskCoreClip)">
              {Array.from({ length: 12 }, (_, index) => (
                <line key={`h-${index}`} x1="190" y1={128 + index * 42} x2="720" y2={128 + index * 42} />
              ))}
              {Array.from({ length: 12 }, (_, index) => (
                <line key={`v-${index}`} x1={206 + index * 46} y1="76" x2={206 + index * 46} y2="628" />
              ))}
            </g>

            <g className="risk-core-contours">
              <polygon points="438,136 566,171 638,273 628,402 556,506 435,553 326,510 272,408 281,285 345,184" />
              <polygon points="442,190 535,216 592,291 585,387 530,465 440,500 359,467 317,389 326,301 375,227" />
              <polygon points="446,244 505,260 548,310 543,373 504,424 444,447 391,425 360,373 367,313 401,273" />
            </g>

            <g className="risk-core-aperture">
              <g className="risk-core-aperture-depth">
                <path d="M447 295L494 348L447 401L400 348Z" transform="translate(0 15)" />
                <path d="M447 295L494 348L447 401L400 348Z" transform="translate(0 10)" />
                <path d="M447 295L494 348L447 401L400 348Z" transform="translate(0 5)" />
              </g>
              <ellipse cx="447" cy="348" rx="114" ry="90" fill="url(#riskCoreAperture)" />
              <ellipse cx="447" cy="348" rx="88" ry="68" />
              <ellipse cx="447" cy="348" rx="62" ry="47" />
              <path d="M447 295L494 348L447 401L400 348Z" />
              <path d="M447 317L474 348L447 379L420 348Z" />
              <circle cx="447" cy="348" r="5" />
            </g>

            <g className="risk-core-event-path">
              <path d="M294 404C330 354 363 331 406 309C445 289 468 287 493 294C527 302 552 318 565 337C582 362 585 393 574 421" />
              {tradeEvents.map((event) => (
                <g className={`risk-core-event risk-core-event-${event.tone}`} key={event.label} transform={`translate(${event.x} ${event.y})`}>
                  <circle r={event.tone === "breach" ? 13 : 8} />
                  <circle className="risk-core-event-core" r={event.tone === "breach" ? 4.5 : 3} />
                </g>
              ))}
            </g>

            <g className="risk-core-fracture" filter="url(#riskCoreFaultGlow)">
              <path d="M493 294L515 316L506 338L535 365L519 390L549 421" />
              <path d="M493 294L478 318L487 342L471 367" />
            </g>

            <g className="risk-core-callout-line">
              <path d="M504 288L650 218L777 218" />
              <circle cx="504" cy="288" r="5" />
              <circle cx="777" cy="218" r="3" />
            </g>

            <g className="risk-core-scan" clipPath="url(#riskCoreClip)">
              <rect x="170" y="174" width="590" height="58" fill="url(#riskCoreScan)" />
              <line x1="205" y1="204" x2="708" y2="204" />
            </g>

            <g className="risk-core-edge-signals" filter="url(#riskCoreCopperGlow)">
              <path d="M316 145L432 86L511 109" />
              <path d="M593 548L437 605L365 579" />
              <path d="M682 414L692 257" />
            </g>
          </svg>

          <div className="risk-core-index">
            <span>COVA / BEHAVIORAL SCAN</span>
            <strong>RISK CORE</strong>
            <small>Sample review · 34 trade events</small>
          </div>

          <div className="risk-core-finding">
            <div className="risk-core-finding-code">
              <span>Finding</span>
              <strong>02</strong>
            </div>
            <div className="risk-core-finding-copy">
              <span>Behavioral fracture isolated</span>
              <strong>Size increased after loss</strong>
              <div className="risk-core-impact">
                <b>-$3,840</b>
                <small>sample payout impact</small>
              </div>
              <p>3 occurrences · last 7 sessions</p>
            </div>
          </div>

          <div className="risk-core-telemetry">
            <span><i className="is-kept" />Rules kept <strong>74%</strong></span>
            <span><i className="is-fault" />Pressure event <strong>10:07</strong></span>
            <span><i className="is-scan" />Review confidence <strong>High</strong></span>
          </div>

          <div className="risk-core-next-action">
            <span>Next review action</span>
            <strong>Cap size after the first full-risk loss.</strong>
          </div>

          <div className="risk-core-axis risk-core-axis-x"><span>X / SESSION ORDER</span></div>
          <div className="risk-core-axis risk-core-axis-y"><span>Y / RISK PRESSURE</span></div>
          <span className="risk-core-corner risk-core-corner-tl" />
          <span className="risk-core-corner risk-core-corner-br" />
        </div>
      </div>

      <figcaption className="sr-only">
        Sample review. Cova highlights a size increase after a loss, three occurrences across seven sessions, with a sample payout impact of -$3,840.
      </figcaption>
    </motion.figure>
  );
}
