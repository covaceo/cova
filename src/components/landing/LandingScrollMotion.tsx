import {useEffect,type RefObject} from "react";
import {scrollHandoffPose} from "./scrollHandoffModel";
import "../../styles/landingScrollMotion.css";

// Scroll-linked, not a reveal gate. At rest there is no loop and nothing is hidden.
export function LandingScrollMotion({ownerRef}:{ownerRef:RefObject<HTMLDivElement|null>}) {
 useEffect(()=>{
  const owner=ownerRef.current,hero=owner?.querySelector<HTMLElement>('.cova-space-hero'),feature=owner?.querySelector<HTMLElement>('[data-feature="risk-desk"]');
  if(!owner||!hero||!feature)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');let frame=0,disposed=false;
  const properties=['--cova-hero-scroll-y','--cova-hero-scroll-opacity','--cova-feature-scroll-y','--cova-feature-scroll-opacity'];
  const paint=()=>{frame=0;if(disposed)return;const h=hero.getBoundingClientRect(),f=feature.getBoundingClientRect();const pose=scrollHandoffPose({heroTop:h.top,heroHeight:h.height,featureTop:f.top,viewportHeight:innerHeight,reduced:reduced.matches});
   owner.style.setProperty(properties[0],`${pose.heroY.toFixed(3)}px`);owner.style.setProperty(properties[1],String(pose.heroOpacity));owner.style.setProperty(properties[2],`${pose.featureY.toFixed(3)}px`);owner.style.setProperty(properties[3],String(pose.featureOpacity));owner.dataset.scrollMotion=reduced.matches?'static':'linked';
  };
  const stop=()=>{if(frame)cancelAnimationFrame(frame);frame=0;};
  const schedule=()=>{if(!disposed&&!document.hidden&&!frame)frame=requestAnimationFrame(paint);};
  const preference=()=>{stop();paint();};
  const visibility=()=>{stop();if(!document.hidden)schedule();};
  const observer=new ResizeObserver(schedule);observer.observe(hero);observer.observe(feature);
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',preference);paint();
  return()=>{disposed=true;stop();observer.disconnect();window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',preference);properties.forEach(property=>owner.style.removeProperty(property));delete owner.dataset.scrollMotion;};
 },[ownerRef]);
 return null;
}
