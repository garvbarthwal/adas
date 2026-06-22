/** Rolling log of system alerts (stream loss, reconnects, etc.). */

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import type { Alert } from "@/store/useStore";
import { timeAgo } from "@/services/format";

const palette: Record<Alert["level"], { accent: string; text: string; bg: string }> = {
  info: { accent: "#38bdf8", text: "#7dd3fc", bg: "rgba(56,189,248,0.04)" },
  warning: { accent: "#fbbf24", text: "#fde68a", bg: "rgba(251,191,36,0.04)" },
  error: { accent: "#f87171", text: "#fca5a5", bg: "rgba(248,113,113,0.04)" },
};

export function AlertsPanel() {
  const alerts = useStore((s) => s.alerts);

  // Re-render every 10s so the "Ns ago" labels stay roughly accurate.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-white/5 bg-panel p-3.5 md:max-h-[196px] md:flex-none">
      <header className="mb-3 flex flex-shrink-0 items-center justify-between">
        <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
          System Alerts
        </h2>
        <span className="font-mono text-[10px] text-slate-600">{alerts.length}</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-5 text-[13px] text-slate-700">
            All clear
          </div>
        ) : (
          alerts.map((a) => {
            const p = palette[a.level] ?? palette.info;
            return (
              <div
                key={a.id}
                className="flex animate-fade-slide items-stretch gap-2.5 rounded-md border border-white/[0.04] px-2.5 py-[9px]"
                style={{ background: p.bg }}
              >
                <div
                  className="w-0.5 flex-shrink-0 rounded-[1px]"
                  style={{ background: p.accent, minHeight: "28px" }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[12px] leading-[1.4] [text-wrap:pretty]"
                    style={{ color: p.text }}
                  >
                    {a.message}
                  </div>
                  <div className="mt-[3px] font-mono text-[9px] text-slate-600">
                    {timeAgo(a.ts)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
