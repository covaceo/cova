import {useEffect,useRef} from "react";
import {makeStarCatalog,starAlpha,heroCoversViewport,type StarPoint} from "./starfieldModel";

// A cached point-spread sprite, not a particle system. Stars never translate or share a blink phase.
export function LandingStarfield() {
  const hostRef=useRef<HTMLDivElement>(null);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const host=hostRef.current,canvas=canvasRef.current;
    if(!host||!canvas)return;
    const ctx=canvas.getContext("2d");
    if(!ctx){host.dataset.state="fallback";return;}
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
    const sprite=document.createElement("canvas");sprite.width=32;sprite.height=32;
    const paint=sprite.getContext("2d");
    const base=document.createElement("canvas");const baseCtx=base.getContext("2d");
    if(!paint||!baseCtx){host.dataset.state="fallback";return;}
    const gradient=paint.createRadialGradient(16,16,0,16,16,16);
    gradient.addColorStop(0,"rgba(239,245,255,1)");gradient.addColorStop(.22,"rgba(239,245,255,.95)");gradient.addColorStop(.42,"rgba(221,233,255,.3)");gradient.addColorStop(.72,"rgba(221,233,255,.05)");gradient.addColorStop(1,"rgba(221,233,255,0)");
    paint.fillStyle=gradient;paint.fillRect(0,0,32,32);
    let stars:StarPoint[]=[],width=1,height=1,dpr=1,frame=0,timer=0,inView=true,heroCovers=true,disposed=false,count=0;
    const stop=()=>{window.cancelAnimationFrame(frame);window.clearTimeout(timer);frame=0;timer=0;};
    const dot=(context:CanvasRenderingContext2D,s:StarPoint,alpha:number)=>{
      const diameter=s.radius*4.4;context.globalAlpha=alpha;
      context.drawImage(sprite,s.x*width-diameter/2,s.y*height-diameter/2,diameter,diameter);
    };
    const draw=(time:number)=>{
      ctx.clearRect(0,0,width,height);ctx.globalAlpha=1;ctx.drawImage(base,0,0,width,height);
      for(const star of stars)if(star.amplitude>.2)dot(ctx,star,reduced.matches?star.alpha:starAlpha(star,time/1000));
      ctx.globalAlpha=1;host.dataset.frames=String(++count);
    };
    const schedule=()=>{
      if(disposed||frame||timer||document.hidden||!inView||heroCovers||reduced.matches)return;
      // Throttled and compositor-aligned. No full-speed RAF or CSS animation on hundreds of DOM nodes.
      timer=window.setTimeout(()=>{timer=0;frame=window.requestAnimationFrame(time=>{frame=0;
        // Parent route entrances can move a tall hero without triggering a scroll or threshold crossing.
        const bounds=hero?.getBoundingClientRect();if(bounds&&heroCoversViewport(bounds.top,bounds.bottom,window.innerHeight)){heroCovers=true;sync();return;}
        draw(time);schedule();});},80);
    };
    const sync=()=>{stop();host.dataset.state=reduced.matches?"static":document.hidden||!inView||heroCovers?"paused":"running";if(reduced.matches)draw(0);schedule();};
    const resize=()=>{
      width=window.innerWidth;height=window.innerHeight;const bounds=host.parentElement?.querySelector(".cova-space-hero")?.getBoundingClientRect();heroCovers=!!bounds&&heroCoversViewport(bounds.top,bounds.bottom,height);dpr=Math.min(window.devicePixelRatio||1,1.5);
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);base.width=canvas.width;base.height=canvas.height;
      ctx.setTransform(dpr,0,0,dpr,0,0);baseCtx.setTransform(dpr,0,0,dpr,0,0);
      stars=makeStarCatalog(Math.min(420,Math.max(75,Math.round(width*height/3500))));
      baseCtx.clearRect(0,0,width,height);for(const star of stars)if(star.amplitude<=.2)dot(baseCtx,star,star.alpha);
      baseCtx.globalAlpha=1;host.dataset.count=String(stars.length);host.dataset.dpr=String(dpr);draw(performance.now());sync();
    };
    const owner=host.parentElement,hero=owner?.querySelector(".cova-space-hero");
    const onScroll=()=>{const bounds=hero?.getBoundingClientRect();const covered=!!bounds&&heroCoversViewport(bounds.top,bounds.bottom,window.innerHeight);if(covered!==heroCovers){heroCovers=covered;sync();}};
    const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.target===owner)inView=entry.isIntersecting;onScroll();sync();},{threshold:[0,.995,1]});
    if(owner)observer.observe(owner);if(hero)observer.observe(hero);window.addEventListener("scroll",onScroll,{passive:true});onScroll();
    window.addEventListener("resize",resize);document.addEventListener("visibilitychange",sync);reduced.addEventListener("change",sync);resize();
    return()=>{disposed=true;stop();observer.disconnect();window.removeEventListener("scroll",onScroll);window.removeEventListener("resize",resize);document.removeEventListener("visibilitychange",sync);reduced.removeEventListener("change",sync);};
  },[]);
  return <div className="cova-landing-stars" ref={hostRef} aria-hidden="true" data-state="initial" style={{pointerEvents:"none"}}><canvas ref={canvasRef}/><div className="cova-landing-stars-fallback"/></div>;
}
