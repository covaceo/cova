import { motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, useState, useId, type ReactNode } from "react";
import "../../styles/gooeyMotion.css";
// Aceternity GooeyInput's published blur/matrix and spring are applied only to inert surfaces.
export const gooeyTransition = { duration: 0.4, type: "spring" as const, bounce: 0.25 };
type Box = { x: number; y: number; width: number; height: number };
type Trail = Box & { serial: number };
export function GooeyNavSurface({ children, active, className = "" }: { children: ReactNode; active: string; className?: string }) {
 const host = useRef<HTMLDivElement>(null), reduced = useReducedMotion(), id = "cova-goo-nav-" + useId().replace(/:/g, "");
 const [box, setBox] = useState<Box | null>(null), [tail, setTail] = useState<Trail | null>(null);
 const [animatePosition, setAnimatePosition] = useState(false);
 const previous = useRef<Box | null>(null), previousActive = useRef<string | null>(null), serial = useRef(0);
 useLayoutEffect(() => {
  const el = host.current; if (!el) return;
  const measure = () => { const target = [...el.querySelectorAll<HTMLElement>("[data-gooey-key]")].find(e => e.dataset.gooeyKey === active); if (!target) { previous.current = null; previousActive.current = null; setTail(null); setBox(null); return; }
   const r = target.getBoundingClientRect(), h = el.getBoundingClientRect();
   const next = { x: r.x-h.x, y:r.y-h.y, width:r.width, height:r.height };
   const routeChanged = previousActive.current !== null && previousActive.current !== active;
   if (!routeChanged && previous.current && Object.keys(next).every(k=>previous.current![k as keyof Box]===next[k as keyof Box])) return;
   // Layout already animates the rail. Do not restart another spring or spawn a trail on each resize frame.
   const plate = el.querySelector<HTMLElement>(".cova-gooey-plate");
   if (routeChanged && plate) {
    const live = plate.getBoundingClientRect();
    setTail({ x: live.x - h.x, y: live.y - h.y, width: live.width, height: live.height, serial: ++serial.current });
   } else setTail(null);
   setAnimatePosition(routeChanged);
   previous.current=next; previousActive.current=active;
   setBox(old => old && Object.keys(next).every(k=>old[k as keyof Box]===next[k as keyof Box]) ? old : next);
  }; measure(); const observer = new ResizeObserver(measure); observer.observe(el); window.addEventListener("resize", measure);
  return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
 }, [active]);
 return <div ref={host} className={`cova-gooey-nav ${className}`} data-gooey-nav data-reduced-motion={Boolean(reduced)}>
  <svg className="cova-gooey-defs" width="0" height="0" aria-hidden="true"><defs><filter id={id} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/><feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10" result="goo"/><feComposite in="SourceGraphic" in2="goo" operator="atop"/></filter></defs></svg>
  <div className="cova-gooey-plates" aria-hidden="true" style={{ filter: reduced ? "none" : `url(#${id})` }}>
   {box && <motion.div className="cova-gooey-plate" initial={false} style={{width:box.width,height:box.height}} animate={{x:box.x,y:box.y}} transition={reduced || !animatePosition ? {duration:0}:gooeyTransition}/>}
   {!reduced && tail && box && <motion.div key={tail.serial} className="cova-gooey-tail" initial={{x:tail.x,y:tail.y,width:tail.width,height:tail.height,opacity:1,scale:1}} animate={{...box,opacity:0,scale:.72}} transition={{duration:.28,ease:"easeOut"}} onAnimationComplete={()=>setTail(current=>current?.serial===tail.serial?null:current)}/>}
  </div>{children}
 </div>;
}
