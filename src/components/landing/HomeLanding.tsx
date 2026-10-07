import {useRef,type ReactNode} from "react";
import {LandingStarfield} from "./LandingStarfield";
import {HeroTextHover} from "../spaceHero/HeroTextHover";
import {RiskDeskFeature} from "./RiskDeskFeature";
import {LandingScrollMotion} from "./LandingScrollMotion";
import "../../styles/landingContinuity.css";

export function HomeLanding({children,go}:{children:ReactNode;go:(section:"dashboard"|"import")=>void}) {
 const ownerRef=useRef<HTMLDivElement>(null);
 return <div ref={ownerRef} className="cova-home-landing" data-landing="orbital-continuation">
  <LandingScrollMotion ownerRef={ownerRef}/>
  <LandingStarfield/>
  <HeroTextHover/>
  {children}
  <RiskDeskFeature go={go}/>
 </div>;
}
