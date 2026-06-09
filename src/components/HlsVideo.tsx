import Hls from "hls.js";
import { CSSProperties, useEffect, useRef } from "react";

type HlsVideoProps = {
  src: string;
  className?: string;
  style?: CSSProperties;
};

export function HlsVideo({ src, className, style }: HlsVideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      return () => hls.destroy();
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    }

    return undefined;
  }, [src]);

  return (
    <video
      ref={ref}
      autoPlay
      loop
      muted
      playsInline
      className={className}
      style={style}
    />
  );
}
