import {useEffect,useId,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {motion,useMotionValue,useSpring} from "motion/react";

// Aceternity Text Hover Effect's cursor-masked gradient interaction, independently adapted
// to Cova's existing semantic HTML headline, font, palette, two lines and safe input lifecycle.
type Line={text:string;y:number;size:number;family:string;weight:string;spacing:string};
export function HeroTextHover() {
 const [target,setTarget]=useState<HTMLElement|null>(null),[geometry,setGeometry]=useState<{width:number;height:number;lines:Line[]}|null>(null),[active,setActive]=useState(false);
 const id="cova-hover-"+useId().replace(/:/g,"");const x=useMotionValue(0),y=useMotionValue(0);const sx=useSpring(x,{stiffness:360,damping:40,mass:.4}),sy=useSpring(y,{stiffness:360,damping:40,mass:.4});
 const pending=useRef(0);
 useEffect(()=>{
  const heading=document.getElementById("cova-space-title");if(!heading)return;
  const fine=window.matchMedia("(hover: hover) and (pointer: fine)"),reduced=window.matchMedia("(prefers-reduced-motion: reduce)");let disposed=false;
  const measure=()=>{
   if(disposed)return;const allowed=fine.matches&&!reduced.matches;heading.dataset.textHover=allowed?"ready":"disabled";
   if(!allowed){setTarget(null);setActive(false);return;}
   const bounds=heading.getBoundingClientRect(),canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");if(!ctx)return;
   const lines=[...heading.querySelectorAll(":scope > span")].map(span=>{const s=getComputedStyle(span),r=span.getBoundingClientRect(),size=parseFloat(s.fontSize);ctx.font=`${s.fontWeight} ${size}px ${s.fontFamily}`;const metrics=ctx.measureText(span.textContent||"");const ascent=metrics.fontBoundingBoxAscent||size*.82,descent=metrics.fontBoundingBoxDescent||size*.22;return {text:span.textContent||"",y:r.top-bounds.top+(r.height-ascent-descent)/2+ascent,size,family:s.fontFamily,weight:s.fontWeight,spacing:s.letterSpacing};});
   setGeometry({width:bounds.width,height:bounds.height,lines});setTarget(heading);
  };
  const move=(e:PointerEvent)=>{if(e.pointerType!=="mouse"||!fine.matches||reduced.matches)return;const b=heading.getBoundingClientRect(),cx=e.clientX-b.left,cy=e.clientY-b.top;cancelAnimationFrame(pending.current);pending.current=requestAnimationFrame(()=>{x.set(cx);y.set(cy);});};
  const enter=(e:PointerEvent)=>{if(e.pointerType!=="mouse"||!fine.matches||reduced.matches)return;const b=heading.getBoundingClientRect();sx.jump(e.clientX-b.left);sy.jump(e.clientY-b.top);x.set(e.clientX-b.left);y.set(e.clientY-b.top);setActive(true);};
  const leave=()=>{cancelAnimationFrame(pending.current);setActive(false);};
  const observer=new ResizeObserver(measure);observer.observe(heading);fine.addEventListener("change",measure);reduced.addEventListener("change",measure);heading.addEventListener("pointerenter",enter);heading.addEventListener("pointermove",move);heading.addEventListener("pointerleave",leave);measure();void document.fonts.ready.then(measure);
  return()=>{disposed=true;leave();observer.disconnect();fine.removeEventListener("change",measure);reduced.removeEventListener("change",measure);heading.removeEventListener("pointerenter",enter);heading.removeEventListener("pointermove",move);heading.removeEventListener("pointerleave",leave);delete heading.dataset.textHover;};
 },[x,y,sx,sy]);
 if(!target||!geometry)return null;
 return createPortal(<svg className="cova-hero-hover" data-active={active} aria-hidden="true" focusable="false" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none">
  <defs><linearGradient id={id+"-color"} x1="0" y1="0" x2={geometry.width} y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#739bff"/><stop offset=".4" stopColor="#75beff"/><stop offset=".62" stopColor="#9ce9ff"/><stop offset="1" stopColor="#597cff"/></linearGradient>
   <motion.radialGradient id={id+"-light"} cx={sx} cy={sy} r={Math.min(190,geometry.width*.24)} gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="white"/><stop offset=".35" stopColor="white" stopOpacity=".8"/><stop offset="1" stopColor="black"/></motion.radialGradient>
   <mask id={id+"-mask"} maskUnits="userSpaceOnUse" x="0" y="0" width={geometry.width} height={geometry.height}><rect width={geometry.width} height={geometry.height} fill={`url(#${id}-light)`}/></mask></defs>
  <g mask={`url(#${id}-mask)`}>{geometry.lines.map((line,index)=><text key={index} x={geometry.width/2} y={line.y} textAnchor="middle" fill={`url(#${id}-color)`} fillOpacity=".75" stroke={`url(#${id}-color)`} strokeWidth="1.1" style={{fontFamily:line.family,fontWeight:line.weight,fontSize:line.size,letterSpacing:line.spacing}}>{line.text}</text>)}</g>
 </svg>,target);
}
