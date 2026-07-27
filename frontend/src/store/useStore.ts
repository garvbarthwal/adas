/**
 * Global UI state (Zustand).
 *
 * Holds connection state, the latest detection frame, latest metrics and a
 * small alert log. Detection data is kept here so the canvas overlay can read
 * the latest frame on every animation tick without re-rendering React.
 */

import { create } from "zustand";
import type {
  CameraMetrics,
  ConnectionState,
  DetectionMessage,
} from "@/types";

export interface Alert {
  id: string;
  level: "info" | "warning" | "error";
  message: string;
  ts: number;
}

/**
 * Which physical camera Browser Camera Mode captures from. Maps directly to the
 * getUserMedia `facingMode` constraint: "user" = front (selfie) camera,
 * "environment" = rear camera. Mainly useful on phones/tablets.
 */
export type CameraFacing = "user" | "environment";

interface AppState {
  // --- Connection state (per concern) ---
  detectionSocket: ConnectionState;
  metricsSocket: ConnectionState;
  videoState: RTCPeerConnectionState | "idle";

  // --- Video source ---
  /** True while the browser webcam is actively capturing + publishing. */
  browserCameraActive: boolean;
  /** Front vs rear camera for Browser Camera Mode. */
  cameraFacing: CameraFacing;

  // --- Live data ---
  detections: Record<string, DetectionMessage>;
  metrics: Record<string, CameraMetrics>;
  alerts: Alert[];

  // --- Actions ---
  setDetectionSocket: (s: ConnectionState) => void;
  setMetricsSocket: (s: ConnectionState) => void;
  setVideoState: (s: RTCPeerConnectionState | "idle") => void;
  setBrowserCameraActive: (active: boolean) => void;
  setCameraFacing: (f: CameraFacing) => void;
  /** Flip between the front and rear camera. */
  toggleCameraFacing: () => void;
  setDetection: (cameraId: string, d: DetectionMessage) => void;
  setMetrics: (cameraId: string, m: CameraMetrics) => void;
  pushAlert: (level: Alert["level"], message: string) => void;
}

const MAX_ALERTS = 50;

export const useStore = create<AppState>((set) => ({
  detectionSocket: "connecting",
  metricsSocket: "connecting",
  videoState: "idle",

  browserCameraActive: false, // Wait, since there's no MediaMTX, we might want this true by default or user explicitly clicks "Start". Leaving false to match UX.
  cameraFacing: "environment",

  detections: {},
  metrics: {},
  alerts: [],

  setDetectionSocket: (s) => set({ detectionSocket: s }),
  setMetricsSocket: (s) => set({ metricsSocket: s }),
  setVideoState: (s) => set({ videoState: s }),
  setBrowserCameraActive: (active) => set({ browserCameraActive: active }),
  setCameraFacing: (f) => set({ cameraFacing: f }),
  toggleCameraFacing: () =>
    set((state) => ({
      cameraFacing: state.cameraFacing === "user" ? "environment" : "user",
    })),
  setDetection: (cameraId, d) => set((state) => ({ detections: { ...state.detections, [cameraId]: d } })),
  setMetrics: (cameraId, m) => set((state) => ({ metrics: { ...state.metrics, [cameraId]: m } })),
  pushAlert: (level, message) =>
    set((state) => ({
      alerts: [
        { id: crypto.randomUUID(), level, message, ts: Date.now() },
        ...state.alerts,
      ].slice(0, MAX_ALERTS),
    })),
}));
