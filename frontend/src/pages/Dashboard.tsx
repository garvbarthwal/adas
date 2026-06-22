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
 */

import { config } from "@/services/config";
import { useDetectionSocket } from "@/hooks/useDetectionSocket";
import { useMetricsSocket } from "@/hooks/useMetricsSocket";
import { StatusBar } from "@/components/StatusBar";
import { BackendBanner } from "@/components/BackendBanner";
import { VideoCanvas } from "@/components/VideoCanvas";
import { MetricsPanel } from "@/components/MetricsPanel";
import { DetectionsList } from "@/components/DetectionsList";
import { AlertsPanel } from "@/components/AlertsPanel";

export function Dashboard() {
  // Subscribe to the two channels independently, scoped to the active camera.
  useDetectionSocket(config.cameraId);
  useMetricsSocket(config.cameraId);

  return (
    <div className="flex h-screen flex-col bg-surface-900 text-gray-100">
      <StatusBar />
      <BackendBanner />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_22rem]">
        {/* Video + overlay */}
        <div className="min-h-0">
          <VideoCanvas />
        </div>

        {/* Side panel */}
        <aside className="flex min-h-0 flex-col gap-4">
          <DetectionsList />
          <MetricsPanel />
          <AlertsPanel />
        </aside>
      </main>
    </div>
  );
}
