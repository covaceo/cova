import {useEffect,type RefObject} from "react";
import {scrollHandoffPose} from "./scrollHandoffModel";
import "../../styles/landingScrollMotion.css";

// Scroll-linked, not a reveal gate. At rest there is no loop and nothing is hidden.
export function LandingScrollMotion({ownerRef}:{ownerRef:RefObject<HTMLDivElement|null>}) {
 useEffect(()=>{
  const owner=ownerRef.current,hero=owner?.querySelector<HTMLElement>('.cova-space-hero'),feature=owner?.querySelector<HTMLElement>('[data-feature="risk-desk"]');
  if(!owner||!hero||!feature)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');let frame=0,disposed=false;
  const heroCopy=hero.querySelector<HTMLElement>('.cova-space-copy');
  const featureParts=[...feature.querySelectorAll<HTMLElement>('.cova-risk-copy,.cova-risk-stage')];
  const targets=[...(heroCopy?[heroCopy]:[]),...featureParts];
  const original=targets.map(node=>({node,translate:node.style.translate,opacity:node.style.opacity}));
  const apply=(node:HTMLElement,y:number,opacity:number)=>{
   const translate=`0px ${y.toFixed(3)}px`,alpha=String(opacity);
   // Transform/opacity do not inherit. Avoid restyling the entire homepage on every scroll tick.
   if(node.style.translate!==translate)node.style.translate=translate;
   if(node.style.opacity!==alpha)node.style.opacity=alpha;
  };
  const paint=()=>{frame=0;if(disposed)return;const h=hero.getBoundingClientRect(),f=feature.getBoundingClientRect();const pose=scrollHandoffPose({heroTop:h.top,heroHeight:h.height,featureTop:f.top,viewportHeight:innerHeight,reduced:reduced.matches});
   if(heroCopy)apply(heroCopy,pose.heroY,pose.heroOpacity);
   featureParts.forEach(node=>apply(node,pose.featureY,pose.featureOpacity));
   const mode=reduced.matches?'static':'linked';if(owner.dataset.scrollMotion!==mode)owner.dataset.scrollMotion=mode;
  };
  const stop=()=>{if(frame)cancelAnimationFrame(frame);frame=0;};
  const schedule=()=>{if(!disposed&&!document.hidden&&!frame)frame=requestAnimationFrame(paint);};
  const preference=()=>{stop();paint();};
  const visibility=()=>{stop();if(!document.hidden)schedule();};
  const observer=new ResizeObserver(schedule);observer.observe(hero);observer.observe(feature);
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',preference);paint();
  return()=>{disposed=true;stop();observer.disconnect();window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',preference);original.forEach(({node,translate,opacity})=>{node.style.translate=translate;node.style.opacity=opacity;});delete owner.dataset.scrollMotion;};
 },[ownerRef]);
 return null;
}
