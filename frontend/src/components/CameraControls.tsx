/**
 * Source controls overlaid on the video.
 *
 * Lets a developer switch between the production MediaMTX WebRTC stream and
 * "Browser Camera Mode" (publish this device's webcam straight to the backend).
 * "Start Camera" is an explicit gesture, which also satisfies the browser's
 * getUserMedia permission requirement.
 */

import { useStore } from "@/store/useStore";

export function CameraControls() {
  const sourceMode = useStore((s) => s.sourceMode);
  const active = useStore((s) => s.browserCameraActive);
  const setSourceMode = useStore((s) => s.setSourceMode);
  const setBrowserCameraActive = useStore((s) => s.setBrowserCameraActive);

  const startBrowserCamera = () => {
    setSourceMode("browser");
    setBrowserCameraActive(true);
  };

  const stopBrowserCamera = () => {
    setBrowserCameraActive(false);
    setSourceMode("mediamtx");
  };

  return (
    <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
      {sourceMode === "browser" && active ? (
        <button
          onClick={stopBrowserCamera}
          className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-red-500"
        >
          ◼ Stop Camera
        </button>
      ) : (
        <button
          onClick={startBrowserCamera}
          className="rounded-lg bg-accent/90 px-3 py-1.5 text-xs font-semibold text-surface-900 shadow hover:bg-accent"
        >
          ● Start Camera
        </button>
      )}
      <span className="rounded-md bg-black/50 px-2 py-1 text-[11px] text-gray-300">
        {sourceMode === "browser" ? "Browser camera (dev)" : "MediaMTX stream"}
      </span>
    </div>
  );
}
