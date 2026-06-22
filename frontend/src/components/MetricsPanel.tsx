/** Live metrics from the `/ws/metrics` channel. */

import { useStore } from "@/store/useStore";
import { config } from "@/services/config";
import { formatUptime } from "@/services/format";
import type { StreamStatus } from "@/types";

function statusColor(status: StreamStatus | string): string {
  return status === "online" ? "#34d399" : status === "connecting" ? "#fbbf24" : "#f87171";
}

function MetricCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-[7px] border border-white/[0.04] bg-white/[0.025] px-3 py-[11px] transition-colors hover:bg-white/[0.04]">
      <div className="mb-[5px] text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">
        {label}
      </div>
      <div className="flex items-baseline gap-[3px]">
        <span className="font-mono text-[18px] font-medium leading-none text-slate-200">
          {value}
        </span>
        {unit && <span className="text-[10px] text-slate-600">{unit}</span>}
      </div>
    </div>
  );
}

export function MetricsPanel() {
  const metrics = useStore((s) => s.metrics);
  const status = metrics?.streamStatus ?? "offline";
  const color = statusColor(status);

  return (
    <section className="rounded-[10px] border border-white/5 bg-panel p-3.5">
      <header className="mb-3.5 flex items-center justify-between">
        <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
          Metrics
        </h2>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
            style={{
              background: color,
              boxShadow: status === "online" ? "0 0 6px rgba(52,211,153,0.5)" : "none",
            }}
          />
          <span className="text-[11px] capitalize" style={{ color }}>
            {status}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-1.5">
        <MetricCard label="Detection FPS" value={(metrics?.detectionFps ?? 0).toFixed(1)} />
        <MetricCard label="Stream FPS" value={(metrics?.streamFps ?? 0).toFixed(1)} />
        <MetricCard label="Latency" value={`${Math.round(metrics?.latencyMs ?? 0)}`} unit="ms" />
        <MetricCard label="Tracked" value={`${metrics?.trackedObjects ?? 0}`} unit="obj" />
        <MetricCard label="Uptime" value={formatUptime(metrics?.uptimeSeconds ?? 0)} />
        <MetricCard label="Source" value={metrics?.cameraId ?? config.cameraId} />
      </div>
    </section>
  );
}
