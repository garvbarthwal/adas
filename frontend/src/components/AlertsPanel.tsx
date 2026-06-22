/** Rolling log of system alerts (stream loss, reconnects, etc.). */

import { useStore } from "@/store/useStore";
import type { Alert } from "@/store/useStore";

const levelStyles: Record<Alert["level"], string> = {
  info: "border-l-sky-400 text-sky-200",
  warning: "border-l-amber-400 text-amber-200",
  error: "border-l-red-500 text-red-200",
};

export function AlertsPanel() {
  const alerts = useStore((s) => s.alerts);

  return (
    <section className="flex max-h-48 min-h-0 flex-col rounded-xl bg-surface-800 p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-200">Alerts</h2>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {alerts.length === 0 && (
          <p className="text-sm text-gray-500">No alerts.</p>
        )}
        {alerts.map((a) => (
          <div
            key={a.id}
            className={`border-l-2 bg-surface-700/40 px-3 py-1.5 text-xs ${levelStyles[a.level]}`}
          >
            <span className="text-gray-500">
              {new Date(a.ts).toLocaleTimeString()}{" "}
            </span>
            {a.message}
          </div>
        ))}
      </div>
    </section>
  );
}
