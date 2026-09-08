import { ArrowRight } from "lucide-react";
import { PassportHoloCard } from "./PassportHoloCard";
import { getMaterialSpec } from "../lib/passportMaterials";
import { publicDiamondExample as example } from "./PublicPassportExampleCard";
import diamondMaterial from "../assets/passport-diamond-material.webp?inline";

// Public visual example only. Never reads an account or changes earned-rank logic.

const appearance = { ...getMaterialSpec("Diamond", "standard"), materialUrl: diamondMaterial };
const steps = [
  ["01", "Import", "Bring in your trades."],
  ["02", "Review", "See what keeps costing you."],
  ["03", "Improve", "Know the next fix."],
  ["04", "Share", "Turn discipline into proof."],
] as const;

export function StoryStrip() {
  return (
    <section className="story-strip-simple home-story" data-home-story="card-first" aria-labelledby="home-story-title">
      <div className="home-story-inner">
        <div className="home-story-layout">
          <div className="home-story-copy">
            <p className="home-story-label">How Cova works</p>
            <h2 id="home-story-title"><span>Import trades.</span><span>Find the leak.</span><span>Build proof.</span></h2>
            <p className="home-story-description">Review your history. Understand your habits.<br />Share the result on your terms.</p>
            <a className="home-story-action" href="#features">Explore the workflow <ArrowRight aria-hidden="true" size={19} /></a>
          </div>
          <figure className="home-story-artifact passport-workspace" aria-label="Example Passport. Diamond rank shown for illustration, not earned account status.">
            <div className="home-story-card">
              <div className="passport-workspace-stage home-story-stage">
                <PassportHoloCard model={example} appearance={appearance} engraved />
              </div>
            </div>
            <figcaption className="home-story-caption">Example card · Not account verified</figcaption>
          </figure>
        </div>
        <ol className="home-story-steps" aria-label="How Cova works in four steps">
          {steps.map(([number, title, description]) => (
            <li className="home-story-step" key={number}>
              <span className="home-story-index" aria-hidden="true">{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
