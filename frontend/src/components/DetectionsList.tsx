/** Live list of currently detected objects from `/ws/detections`. */

import { useStore } from "@/store/useStore";
import { classColor, confidenceColor } from "@/services/format";

export function DetectionsList() {
  const detection = useStore((s) => s.detection);
  const objects = detection?.objects ?? [];

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-white/5 bg-panel p-3.5">
      <header className="mb-3.5 flex flex-shrink-0 items-center justify-between">
        <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
          Detections
        </h2>
        <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-[10px] bg-accent/10 px-[7px] font-mono text-[11px] font-semibold text-accent">
          {objects.length}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {objects.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6 text-[13px] text-slate-700">
            No objects detected
          </div>
        ) : (
          objects.map((o) => {
            const color = classColor(o.class);
            const pct = Math.round(o.confidence * 100);
            return (
              <div
                key={`${o.id}-${o.class}`}
                className="flex animate-fade-slide items-center justify-between gap-2.5 rounded-[7px] border border-white/[0.04] bg-white/[0.025] px-[11px] py-[9px] transition-colors hover:border-white/[0.08] hover:bg-white/[0.045]"
              >
                <div className="flex min-w-0 items-center gap-[9px]">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-sm"
                    style={{ background: color, boxShadow: `0 0 6px ${color}50` }}
                  />
                  <span className="whitespace-nowrap text-[13px] font-medium capitalize text-slate-200">
                    {o.class}
                  </span>
                  {o.id >= 0 && (
                    <span className="font-mono text-[11px] text-slate-600">#{o.id}</span>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <div className="h-[3px] w-11 flex-shrink-0 overflow-hidden rounded-sm bg-white/[0.07]">
                    <div
                      className="h-full rounded-sm transition-[width] duration-300"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <span
                    className="min-w-[34px] text-right font-mono text-[11px]"
                    style={{ color: confidenceColor(o.confidence) }}
                  >
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
