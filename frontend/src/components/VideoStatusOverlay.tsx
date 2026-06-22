/** User-friendly overlay shown over the video for non-connected states. */

import { useStore } from "@/store/useStore";

export function VideoStatusOverlay() {
  const videoState = useStore((s) => s.videoState);
  if (videoState === "connected") return null;

  const message =
    videoState === "connecting" || videoState === "new"
      ? "Connecting to camera stream…"
      : videoState === "idle"
        ? "Initializing video…"
        : "Stream unavailable — retrying…";

  const spinning = videoState === "connecting" || videoState === "new" || videoState === "idle";

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 text-center">
      {spinning && (
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-600 border-t-accent" />
      )}
      <p className="text-sm text-gray-300">{message}</p>
    </div>
  );
}
