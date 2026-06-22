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
 * Video source mode:
 *  - "mediamtx" — production: pull WebRTC video from MediaMTX (default).
 *  - "browser"  — development: capture this device's webcam and publish it to
 *    the backend ("Browser Camera Mode"); the preview is the local stream.
 */
export type SourceMode = "mediamtx" | "browser";

interface AppState {
  // --- Connection state (per concern) ---
  detectionSocket: ConnectionState;
  metricsSocket: ConnectionState;
  videoState: RTCPeerConnectionState | "idle";

  // --- Video source ---
  sourceMode: SourceMode;
  /** True while the browser webcam is actively capturing + publishing. */
  browserCameraActive: boolean;

  // --- Live data ---
  detection: DetectionMessage | null;
  metrics: CameraMetrics | null;
  alerts: Alert[];

  // --- Actions ---
  setDetectionSocket: (s: ConnectionState) => void;
  setMetricsSocket: (s: ConnectionState) => void;
  setVideoState: (s: RTCPeerConnectionState | "idle") => void;
  setSourceMode: (m: SourceMode) => void;
  setBrowserCameraActive: (active: boolean) => void;
  setDetection: (d: DetectionMessage) => void;
  setMetrics: (m: CameraMetrics) => void;
  pushAlert: (level: Alert["level"], message: string) => void;
}

const MAX_ALERTS = 50;

export const useStore = create<AppState>((set) => ({
  detectionSocket: "connecting",
  metricsSocket: "connecting",
  videoState: "idle",

  sourceMode: "mediamtx",
  browserCameraActive: false,

  detection: null,
  metrics: null,
  alerts: [],

  setDetectionSocket: (s) => set({ detectionSocket: s }),
  setMetricsSocket: (s) => set({ metricsSocket: s }),
  setVideoState: (s) => set({ videoState: s }),
  setSourceMode: (m) => set({ sourceMode: m }),
  setBrowserCameraActive: (active) => set({ browserCameraActive: active }),
  setDetection: (d) => set({ detection: d }),
  setMetrics: (m) => set({ metrics: m }),
  pushAlert: (level, message) =>
    set((state) => ({
      alerts: [
        { id: crypto.randomUUID(), level, message, ts: Date.now() },
        ...state.alerts,
      ].slice(0, MAX_ALERTS),
    })),
}));
