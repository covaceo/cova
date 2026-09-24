import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { clampRecapTransform, recapBackgroundRect, type RecapTransform } from '../lib/recapBackground';

type Props = { source: string; foreground: string; alt: string; width: number; height: number; sourceWidth: number; sourceHeight: number; transform: RecapTransform; onChange: (value: RecapTransform) => void };
export function RecapBackgroundEditor({ source, foreground, alt, width, height, sourceWidth, sourceHeight, transform, onChange }: Props) {
  const drag = useRef<{ pointer: number; x: number; y: number; width: number; height: number; start: RecapTransform } | null>(null);
  const rect = recapBackgroundRect(sourceWidth, sourceHeight, width, height, transform);
  function start(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, width: box.width, height: box.height, start: transform };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d || d.pointer !== event.pointerId) return;
    const r = recapBackgroundRect(sourceWidth, sourceHeight, width, height, d.start);
    const overflowX = (r.width - width) * d.width / width, overflowY = (r.height - height) * d.height / height;
    onChange(clampRecapTransform({ ...d.start, x: overflowX > .1 ? d.start.x + 2 * (event.clientX - d.x) / overflowX : 0, y: overflowY > .1 ? d.start.y + 2 * (event.clientY - d.y) / overflowY : 0 }));
  }
  return <div className="recap-editor" role="group" aria-label="Move background" aria-description="Drag to move the background, or use the arrow keys. Use Zoom to change its size." tabIndex={0}
    style={{ '--recap-ratio': width / height } as CSSProperties} onPointerDown={start} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={event => {
      const step = event.shiftKey ? .2 : .05;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      if (delta) { event.preventDefault(); onChange(clampRecapTransform({ ...transform, x: transform.x + delta[0], y: transform.y + delta[1] })); }
      if (event.key === 'Home') { event.preventDefault(); onChange({ zoom: 1, x: 0, y: 0 }); }
    }}>
    <img data-recap-background src={source} alt="" draggable={false} style={{ left: `${rect.x / width * 100}%`, top: `${rect.y / height * 100}%`, width: `${rect.width / width * 100}%`, height: `${rect.height / height * 100}%` }} />
    <img data-recap-foreground src={foreground} alt={alt} draggable={false} style={{ inset: 0, width: '100%', height: '100%' }} />
  </div>;
}
