/** Top bar: brand + connection health for video / detections / metrics. */

import { useStore } from "@/store/useStore";
import { config } from "@/services/config";

function Pill({ label, ok, warn }: { label: string; ok: boolean; warn?: boolean }) {
  const color = ok
    ? "bg-emerald-500/15 text-emerald-300"
    : warn
      ? "bg-amber-500/15 text-amber-300"
      : "bg-red-500/15 text-red-300";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export function StatusBar() {
  const { detectionSocket, metricsSocket, videoState } = useStore();

  return (
    <header className="flex items-center justify-between border-b border-surface-700 px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="h-2.5 w-2.5 rounded-full bg-accent" />
        <h1 className="text-base font-semibold text-white">
          ADAS · Real-Time Detection
        </h1>
        <span className="font-mono text-xs text-gray-500">{config.cameraId}</span>
      </div>
      <div className="flex items-center gap-2">
        <Pill
          label={`Video: ${videoState}`}
          ok={videoState === "connected"}
          warn={videoState === "connecting"}
        />
        <Pill
          label="Detections"
          ok={detectionSocket === "open"}
          warn={detectionSocket === "connecting"}
        />
        <Pill
          label="Metrics"
          ok={metricsSocket === "open"}
          warn={metricsSocket === "connecting"}
        />
      </div>
    </header>
  );
}
