import {useMemo, useRef, useState} from "react";
import {ArrowUpRight, EyeOff} from "lucide-react";
import {motion, useReducedMotion, useScroll, useTransform} from "motion/react";
import {PassportHoloCard} from "./PassportHoloCard";
import {getMaterialSpec} from "../lib/passportMaterials";
import {publicDiamondExample} from "./PublicPassportExampleCard";
import {buildHoloPassportModel, type HoloPassportMode, type HoloPassportModel} from "../lib/passportHolo";
import {analyze, sampleTrades, defaultRules} from "../lib/risk";
import diamondMaterial from "../assets/passport-diamond-material.webp?inline";
import "../styles/landingPassport.css";

// Public synthetic fixture only. Diamond is illustrative, never an earned account rank.
const appearance = {...getMaterialSpec("Diamond", "standard"), materialUrl:diamondMaterial};
const sampleAnalysis = analyze(sampleTrades, defaultRules);
const modes = [{id:"flex",label:"Flex"},{id:"discipline",label:"Discipline"},{id:"private",label:"Ghost"}] as const;
export function homepagePassportModel(mode:HoloPassportMode, hideIdentity:boolean):HoloPassportModel {
 const model=buildHoloPassportModel(sampleAnalysis, "Diamond", mode, true);
 return {...model,identity:mode==="private"||hideIdentity?"Private profile":publicDiamondExample.identity};
}
export function StoryStrip({openPassport}:{openPassport?:()=>void}) {
 const [mode,setMode]=useState<HoloPassportMode>("flex");
 const [hideIdentity,setHideIdentity]=useState(false);
 const model=useMemo(()=>homepagePassportModel(mode,hideIdentity),[mode,hideIdentity]);
 const scene=useRef<HTMLDivElement>(null),reduced=useReducedMotion();
 const {scrollYProgress}=useScroll({target:scene,offset:["start end","center center"]});
 const arrivalTilt=useTransform(scrollYProgress,[0,1],[9,0]);
 const arrivalY=useTransform(scrollYProgress,[0,1],[28,0]);
 const arrivalScale=useTransform(scrollYProgress,[0,1],[.96,1]);
 return <section className="story-strip-simple home-story cova-passport-feature" data-home-story="card-first" data-passport-feature="interactive-sample" aria-labelledby="home-story-title">
  <div className="cova-passport-heading">
   <h2 id="home-story-title"><span>Your trading.</span><span>Worth sharing.</span></h2>
   <p>Your shareable trading card. Choose what you show.</p>
  </div>
  <div ref={scene} className="cova-passport-scene">
   <img className="cova-passport-sky" src="/media/cova-risk-desk-orbit.webp" width={1536} height={1024} alt="" aria-hidden="true" loading="lazy" decoding="async"/>
   <figure className="home-story-artifact passport-workspace cova-passport-artifact" aria-label="Example Passport. Diamond rank shown for illustration, not earned account status.">
    <motion.div className="home-story-card cova-passport-card" style={reduced?{transform:"none"}:{rotateX:arrivalTilt,y:arrivalY,scale:arrivalScale}}>
     <div className="passport-workspace-stage home-story-stage"><PassportHoloCard model={model} appearance={appearance} engraved/></div>
    </motion.div>
    <figcaption className="home-story-caption">Sample card · Not account verified</figcaption>
   </figure>
  </div>
  <div className="cova-passport-controls">
   <div className="cova-passport-modes" role="group" aria-label="Passport sample modes">{modes.map(item=><button type="button" key={item.id} data-passport-sample-mode={item.id} aria-pressed={mode===item.id} onClick={()=>setMode(item.id)}>{item.label}</button>)}</div>
   <button className="cova-passport-privacy" type="button" role="switch" aria-label="Hide identity" aria-checked={mode==="private"||hideIdentity} disabled={mode==="private"} onClick={()=>setHideIdentity(v=>!v)}><EyeOff size={16} aria-hidden="true"/>Hide identity<span className="cova-passport-switch" aria-hidden="true"/></button>
  </div>
  <a className="home-story-action cova-passport-action" href="#passport" onClick={event=>{if(openPassport){event.preventDefault();openPassport();}}}>Create my Passport<ArrowUpRight size={18} aria-hidden="true"/></a>
 </section>;
}
