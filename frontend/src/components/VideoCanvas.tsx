/**
 * Video layer + canvas overlay.
 *
 *   <video>   ← WebRTC stream (object-contain, responsive, aspect-preserved)
 *   <canvas>  ← absolutely positioned ON TOP, draws boxes/labels
 *
 * A requestAnimationFrame loop reads the latest detection from the store on
 * every frame and redraws the canvas. Decoupling the draw loop from WebSocket
 * message arrival keeps rendering smooth and ready for future trajectory
 * interpolation.
 */

import { useEffect, useRef } from "react";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useBrowserCamera } from "@/hooks/useBrowserCamera";
import { drawDetections } from "@/services/overlay";
import { useStore } from "@/store/useStore";
import { VideoStatusOverlay } from "./VideoStatusOverlay";
import { CameraControls } from "./CameraControls";

export function VideoCanvas() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Both hooks are always mounted but each is gated by the active source mode:
  // MediaMTX pull (production) vs. local webcam publish (dev). Only one drives
  // the <video> element at a time.
  useWebRTC(videoRef);
  useBrowserCamera(videoRef);

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
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-contain"
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      <CameraControls />
      <VideoStatusOverlay />
    </div>
  );
}
