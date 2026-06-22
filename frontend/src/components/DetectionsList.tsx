/** Live list of currently detected objects from `/ws/detections`. */

import { useStore } from "@/store/useStore";

export function DetectionsList() {
  const detection = useStore((s) => s.detection);
  const objects = detection?.objects ?? [];

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl bg-surface-800 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-200">Detections</h2>
        <span className="rounded-full bg-surface-700 px-2 py-0.5 font-mono text-xs text-accent">
          {objects.length}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {objects.length === 0 && (
          <p className="text-sm text-gray-500">No objects detected.</p>
        )}
        {objects.map((o) => (
          <div
            key={`${o.id}-${o.class}`}
            className="flex items-center justify-between rounded-lg bg-surface-700/60 px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{o.class}</span>
              {o.id >= 0 && (
                <span className="font-mono text-xs text-gray-400">#{o.id}</span>
              )}
            </div>
            <span className="font-mono text-xs text-accent">
              {Math.round(o.confidence * 100)}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
