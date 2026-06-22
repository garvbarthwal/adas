/**
 * Video stage: layered HUD chrome + WebRTC <video> + canvas overlay.
 *
 *   decorations  ← scene gradient, road, scanlines, moving scan line (behind)
 *   <video>      ← WebRTC stream (object-contain, aspect-preserved)
 *   <canvas>     ← absolutely positioned ON TOP, draws boxes/labels
 *   HUD readouts ← LIVE / FPS / uptime / timestamp / camera id, corner brackets
 *
 * A requestAnimationFrame loop reads the latest detection from the store on
 * every frame and redraws the canvas. Decoupling the draw loop from WebSocket
 * message arrival keeps rendering smooth and ready for future trajectory
 * interpolation.
 */

import { useEffect, useRef } from "react";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useBrowserCamera } from "@/hooks/useBrowserCamera";
import { useClock } from "@/hooks/useClock";
import { drawDetections } from "@/services/overlay";
import { formatUptime } from "@/services/format";
import { config } from "@/services/config";
import { useStore } from "@/store/useStore";
import { VideoStatusOverlay } from "./VideoStatusOverlay";
import { CameraControls } from "./CameraControls";

/** One L-shaped HUD corner bracket. `pos` picks which corner. */
function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const base = "pointer-events-none absolute z-20 h-[18px] w-[18px] border-accent/45";
  const map = {
    tl: "top-3.5 left-3.5 border-t-2 border-l-2",
    tr: "top-3.5 right-3.5 border-t-2 border-r-2",
    bl: "bottom-3.5 left-3.5 border-b-2 border-l-2",
    br: "bottom-3.5 right-3.5 border-b-2 border-r-2",
  } as const;
  return <div className={`${base} ${map[pos]}`} />;
}

export function VideoCanvas() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Both hooks are always mounted but each is gated by the active source mode:
  // MediaMTX pull (production) vs. local webcam publish (dev). Only one drives
  // the <video> element at a time.
  useWebRTC(videoRef);
  useBrowserCamera(videoRef);

  const metrics = useStore((s) => s.metrics);
  const timestamp = useClock();

  const fps = metrics ? metrics.streamFps.toFixed(1) : "—";
  const uptimeStr = formatUptime(metrics?.uptimeSeconds ?? 0);
  const cameraId = metrics?.cameraId ?? config.cameraId;

  useEffect(() => {
    let raf = 0;
    const render = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video) {
        // Read latest detection straight from the store (no React re-render).
        drawDetections(canvas, video, useStore.getState().detection);
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-video">
      {/* Camera scene background (visible in letterbox bars). */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 150% 90% at 50% 75%, #0b1929 0%, #060e1c 40%, #040810 75%, #020508 100%)",
        }}
      />

      {/* Subtle road suggestion. */}
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        <div
          className="absolute left-[10%] right-[10%] top-[52%] h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0.05) 70%, transparent)",
          }}
        />
        <div
          className="absolute bottom-0 top-[54%] w-0.5 origin-top"
          style={{
            left: "calc(50% - 1px)",
            background:
              "repeating-linear-gradient(to bottom, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 14px, transparent 14px, transparent 30px)",
            transform: "perspective(400px) rotateX(35deg)",
          }}
        />
      </div>

      {/* Scanline texture. */}
      <div
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)",
        }}
      />

      {/* Moving scan line. */}
      <div
        className="pointer-events-none absolute left-0 right-0 z-[3] h-px animate-scan-v"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(56,189,248,0.22) 50%, transparent)",
        }}
      />

      {/* WebRTC video + detection overlay. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 z-[4] h-full w-full object-contain"
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      />

      {/* HUD corner brackets. */}
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />

      {/* HUD: LIVE + uptime (top-left). */}
      <div className="absolute left-10 top-[18px] z-20 flex items-center gap-[7px]">
        <div className="relative h-2 w-2 flex-shrink-0">
          <div className="absolute inset-0 animate-live-dot rounded-full bg-red-500" />
          <div className="absolute inset-0 animate-live-ring rounded-full bg-red-500" />
        </div>
        <span className="text-[10px] font-bold tracking-[0.1em] text-red-500">LIVE</span>
        <span className="font-mono text-[10px] text-white/30">{uptimeStr}</span>
      </div>

      {/* HUD: FPS (top-right). */}
      <div className="absolute right-10 top-[18px] z-20 flex items-baseline gap-[3px]">
        <span className="font-mono text-[13px] leading-none text-white/50">{fps}</span>
        <span className="text-[9px] tracking-[0.06em] text-white/20">FPS</span>
      </div>

      {/* HUD: timestamp (bottom-left). */}
      <div className="absolute bottom-[18px] left-10 z-20">
        <span className="font-mono text-[10px] text-white/[0.28]">{timestamp}</span>
      </div>

      {/* HUD: camera id + resolution (bottom-right). */}
      <div className="absolute bottom-[18px] right-10 z-20 flex items-center gap-2">
        <span className="font-mono text-[10px] text-accent/50">{cameraId}</span>
        <span className="font-mono text-[9px] text-white/20">1920×1080</span>
      </div>

      {/* Camera source + front/back controls. */}
      <CameraControls />

      <VideoStatusOverlay />
    </div>
  );
}
