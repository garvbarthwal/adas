/**
 * Source controls overlaid on the video.
 *
 * Lets a developer switch between the production MediaMTX WebRTC stream and
 * "Browser Camera Mode" (publish this device's webcam straight to the backend).
 * "Start Camera" is an explicit gesture, which also satisfies the browser's
 * getUserMedia permission requirement.
 *
 * While Browser Camera Mode is live, a flip control lets the user switch between
 * the front and rear camera — primarily for phones/tablets, where the rear
 * camera is the relevant one for a dashcam-style ADAS view.
 */

import { useStore } from "@/store/useStore";

/** Camera-flip glyph. */
function FlipIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5l1.5-2h3L15 5h5a2 2 0 0 1 2 2v6" />
      <path d="m18 22 3-3-3-3" />
      <path d="M16 19h5" />
      <circle cx="9.5" cy="11.5" r="2.5" />
    </svg>
  );
}

export function CameraControls() {
  const sourceMode = useStore((s) => s.sourceMode);
  const active = useStore((s) => s.browserCameraActive);
  const facing = useStore((s) => s.cameraFacing);
  const setSourceMode = useStore((s) => s.setSourceMode);
  const setBrowserCameraActive = useStore((s) => s.setBrowserCameraActive);
  const toggleCameraFacing = useStore((s) => s.toggleCameraFacing);

  const browserLive = sourceMode === "browser" && active;

  const startBrowserCamera = () => {
    setSourceMode("browser");
    setBrowserCameraActive(true);
  };

  const stopBrowserCamera = () => {
    setBrowserCameraActive(false);
    setSourceMode("mediamtx");
  };

  return (
    <div className="absolute bottom-[42px] left-10 z-30 flex flex-wrap items-center gap-2">
      {browserLive ? (
        <button
          onClick={stopBrowserCamera}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-500/90 px-[11px] py-[5px] text-[11px] font-semibold text-black shadow-[0_2px_8px_rgba(0,0,0,0.3)] transition hover:brightness-110"
        >
          ◼ Stop Camera
        </button>
      ) : (
        <button
          onClick={startBrowserCamera}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent/90 px-[11px] py-[5px] text-[11px] font-semibold text-black shadow-[0_2px_8px_rgba(0,0,0,0.3)] transition hover:brightness-110"
        >
          ● Start Camera
        </button>
      )}

      {/* Front/back switch — only meaningful while the browser camera runs. */}
      {browserLive && (
        <button
          onClick={toggleCameraFacing}
          aria-label={`Switch to ${facing === "environment" ? "front" : "rear"} camera`}
          title={`Switch to ${facing === "environment" ? "front" : "rear"} camera`}
          className="inline-flex items-center gap-1.5 rounded-md bg-black/55 px-[11px] py-[5px] text-[11px] font-semibold text-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.3)] backdrop-blur-sm transition hover:bg-black/70"
        >
          <FlipIcon />
          {facing === "environment" ? "Rear" : "Front"}
        </button>
      )}

      <span className="rounded bg-black/45 px-2 py-[3px] font-mono text-[9px] text-white/[0.32]">
        {sourceMode === "browser" ? "Browser camera (dev)" : "MediaMTX stream"}
      </span>
    </div>
  );
}
