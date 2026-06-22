/** Top bar: radar brand mark + connection health for video / detections / metrics. */

import { useStore } from "@/store/useStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { config } from "@/services/config";

/** Animated radar disc used as the product mark. */
function RadarMark() {
  return (
    <div className="relative h-[26px] w-[26px] flex-shrink-0">
      <div className="absolute inset-0 rounded-full border-[1.5px] border-accent/25" />
      <div className="absolute inset-[5px] rounded-full border-[1.5px] border-accent/55" />
      <div className="absolute inset-0 animate-radar-sweep overflow-hidden rounded-full">
        <div className="absolute left-1/2 top-1/2 h-px w-1/2 origin-left bg-gradient-to-r from-accent/80 to-transparent" />
      </div>
      <div className="absolute inset-[10px] rounded-full bg-accent shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
    </div>
  );
}

type PillState = "ok" | "warn" | "off";

function Pill({ label, state }: { label: string; state: PillState }) {
  const styles: Record<PillState, string> = {
    ok: "bg-emerald-400/[0.08] text-emerald-400",
    warn: "bg-amber-400/[0.08] text-amber-400",
    off: "bg-red-400/[0.08] text-red-400",
  };
  const dot: Record<PillState, string> = {
    ok: "bg-emerald-400",
    warn: "bg-amber-400",
    off: "bg-red-400",
  };
  return (
    <span
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11px] font-medium ${styles[state]}`}
    >
      <span className={`inline-block h-[5px] w-[5px] flex-shrink-0 rounded-full ${dot[state]}`} />
      {label}
    </span>
  );
}

function toState(value: string, ok: string, warn: string): PillState {
  if (value === ok) return "ok";
  if (value === warn) return "warn";
  return "off";
}

export function StatusBar() {
  const { detectionSocket, metricsSocket, videoState } = useStore();
  const isMobile = useIsMobile();

  const vState = toState(videoState, "connected", "connecting");
  const videoLabel =
    vState === "ok" ? "Video" : vState === "warn" ? "Connecting" : "Offline";

  return (
    <header className="flex h-[54px] flex-shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-ink px-5">
      {/* Brand */}
      <div className="flex min-w-0 flex-shrink-0 items-center gap-[11px]">
        <RadarMark />
        <div className="min-w-0">
          <div className="text-sm font-bold leading-[1.1] tracking-[-0.02em] text-slate-100">
            ADAS Monitor
          </div>
          <div className="font-mono text-[10px] leading-[1.3] tracking-[0.02em] text-slate-600">
            cam · {config.cameraId}
          </div>
        </div>
      </div>

      {/* Connection pills */}
      <div className="flex flex-nowrap items-center justify-end gap-[5px]">
        <Pill label={videoLabel} state={vState} />
        {!isMobile && (
          <>
            <Pill
              label="Detections"
              state={toState(detectionSocket, "open", "connecting")}
            />
            <Pill
              label="Metrics"
              state={toState(metricsSocket, "open", "connecting")}
            />
          </>
        )}
      </div>
    </header>
  );
}
