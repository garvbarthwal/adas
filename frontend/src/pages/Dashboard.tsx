/**
 * Main dashboard.
 *
 *   ┌──────────────────────────────┬─────────────────┐
 *   │                              │  Detections     │
 *   │      Live Video + Overlay    │  Metrics        │
 *   │                              │  Alerts         │
 *   └──────────────────────────────┴─────────────────┘
 *
 * Opens the video (WebRTC) and both WebSocket channels independently.
 *
 * On mobile the side panels collapse into a single tabbed view (Detections /
 * Metrics / Alerts) stacked under a 16:9 video. The camera source controls
 * (start/stop, front/back switch) sit in a bar directly below the video on all
 * sizes (see CameraControls).
 */

import { useState } from "react";
import { config } from "@/services/config";
import { useDetectionSocket } from "@/hooks/useDetectionSocket";
import { useMetricsSocket } from "@/hooks/useMetricsSocket";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useStore } from "@/store/useStore";
import { StatusBar } from "@/components/StatusBar";
import { BackendBanner } from "@/components/BackendBanner";
import { VideoCanvas } from "@/components/VideoCanvas";
import { CameraControls } from "@/components/CameraControls";
import { MetricsPanel } from "@/components/MetricsPanel";
import { DetectionsList } from "@/components/DetectionsList";
import { AlertsPanel } from "@/components/AlertsPanel";

type Tab = "detections" | "metrics" | "alerts";

function TabBar({
  active,
  onChange,
  objectCount,
  alertCount,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  objectCount: number;
  alertCount: number;
}) {
  const tab = (id: Tab) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-[7px] text-[12px] font-medium transition ${
      active === id
        ? "bg-surface-700 text-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
        : "bg-transparent text-slate-600"
    }`;
  const badge = (on: boolean) =>
    `inline-flex h-[15px] min-w-[16px] items-center justify-center rounded-lg px-[5px] font-mono text-[9px] font-semibold ${
      on ? "bg-accent text-black" : "bg-white/[0.08] text-slate-600"
    }`;

  return (
    <div className="flex flex-shrink-0 gap-0.5 rounded-[9px] bg-white/[0.04] p-[3px]">
      <button className={tab("detections")} onClick={() => onChange("detections")}>
        Detections
        <span className={badge(active === "detections")}>{objectCount}</span>
      </button>
      <button className={tab("metrics")} onClick={() => onChange("metrics")}>
        Metrics
      </button>
      <button className={tab("alerts")} onClick={() => onChange("alerts")}>
        Alerts
        <span className={badge(active === "alerts")}>{alertCount}</span>
      </button>
    </div>
  );
}

export function Dashboard() {
  // Subscribe to the two channels independently, scoped to the active camera.
  useDetectionSocket(config.cameraId);
  useMetricsSocket(config.cameraId);

  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>("detections");

  const objectCount = useStore((s) => s.detection?.objects.length ?? 0);
  const alertCount = useStore((s) => s.alerts.length);

  // On desktop every panel is visible; on mobile only the active tab.
  const showDet = !isMobile || tab === "detections";
  const showMet = !isMobile || tab === "metrics";
  const showAlt = !isMobile || tab === "alerts";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink text-slate-200">
      <StatusBar />
      <BackendBanner />

      <main
        className={
          isMobile
            ? "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
            : "grid min-h-0 flex-1 grid-cols-[1fr_340px] gap-4 overflow-hidden p-4"
        }
      >
        {/* Video + overlay, with source controls below the stream. */}
        <div
          className={
            isMobile
              ? "flex w-full flex-shrink-0 flex-col gap-2"
              : "flex min-h-0 min-w-0 flex-col gap-2"
          }
        >
          <div className={isMobile ? "aspect-video w-full" : "min-h-0 flex-1"}>
            <VideoCanvas />
          </div>
          <CameraControls />
        </div>

        {/* Side panels */}
        <aside
          className={
            isMobile
              ? "flex min-h-0 flex-1 flex-col gap-2.5 pb-1"
              : "flex min-h-0 flex-col gap-3 overflow-hidden"
          }
        >
          {isMobile && (
            <TabBar
              active={tab}
              onChange={setTab}
              objectCount={objectCount}
              alertCount={alertCount}
            />
          )}
          {showDet && <DetectionsList />}
          {showMet && <MetricsPanel />}
          {showAlt && <AlertsPanel />}
        </aside>
      </main>
    </div>
  );
}
