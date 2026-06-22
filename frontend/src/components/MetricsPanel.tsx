/** Live metrics from the `/ws/metrics` channel. */

import { useStore } from "@/store/useStore";
import type { StreamStatus } from "@/types";

function StatusDot({ status }: { status: StreamStatus | string }) {
  const color =
    status === "online"
      ? "bg-emerald-400"
      : status === "connecting"
        ? "bg-amber-400"
        : "bg-red-500";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-700/60 p-3">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 font-mono text-lg text-white">{value}</div>
    </div>
  );
}

export function MetricsPanel() {
  const metrics = useStore((s) => s.metrics);

  return (
    <section className="rounded-xl bg-surface-800 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-200">Metrics</h2>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <StatusDot status={metrics?.streamStatus ?? "offline"} />
          {metrics?.streamStatus ?? "offline"}
        </div>
      </header>

      {metrics ? (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Detection FPS" value={metrics.detectionFps.toFixed(1)} />
          <Stat label="Stream FPS" value={metrics.streamFps.toFixed(1)} />
          <Stat label="Latency" value={`${metrics.latencyMs.toFixed(0)} ms`} />
          <Stat label="Tracked" value={String(metrics.trackedObjects)} />
          <Stat
            label="Uptime"
            value={`${Math.floor(metrics.uptimeSeconds / 60)}m`}
          />
          <Stat label="Camera" value={metrics.cameraId} />
        </div>
      ) : (
        <p className="text-sm text-gray-500">Waiting for metrics…</p>
      )}
    </section>
  );
}
