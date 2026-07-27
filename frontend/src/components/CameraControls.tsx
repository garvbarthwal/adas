/**
 * Source controls shown as a bar below the video stream.
 *
 * "Start Camera" is an explicit gesture, which satisfies the browser's
 * getUserMedia permission requirement.
 *
 * While Browser Camera Mode is live, a flip control lets the user switch between
 * the front and rear camera — primarily for phones/tablets, where the rear
 * camera is the relevant one for a dashcam-style ADAS view.
 */

import { useStore } from "@/store/useStore";
import { RadarControls } from "./RadarControls";

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
  const active = useStore((s) => s.browserCameraActive);
  const facing = useStore((s) => s.cameraFacing);
  const setBrowserCameraActive = useStore((s) => s.setBrowserCameraActive);
  const toggleCameraFacing = useStore((s) => s.toggleCameraFacing);

  return (
    <div className="flex flex-shrink-0 flex-wrap items-center gap-2 px-1">
      {active ? (
        <button
          onClick={() => setBrowserCameraActive(false)}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-[11px] py-[5px] text-[11px] font-semibold text-black shadow-[0_2px_8px_rgba(0,0,0,0.45)] ring-1 ring-black/20 transition hover:brightness-110"
        >
          ◼ Stop Camera
        </button>
      ) : (
        <button
          onClick={() => setBrowserCameraActive(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-[11px] py-[5px] text-[11px] font-semibold text-black shadow-[0_2px_8px_rgba(0,0,0,0.45)] ring-1 ring-black/20 transition hover:brightness-110"
        >
          ● Start Camera
        </button>
      )}

      {/* Front/back switch — only meaningful while the browser camera runs. */}
      {active && (
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
        Browser camera (dev)
      </span>
      
      <div className="ml-auto">
        <RadarControls />
      </div>
    </div>
  );
}
