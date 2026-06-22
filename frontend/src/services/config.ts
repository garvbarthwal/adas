/** Centralized, type-safe access to build-time environment configuration. */

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000",
  webrtcUrl: import.meta.env.VITE_WEBRTC_URL ?? "http://localhost:8889/carcam/whep",
  cameraId: import.meta.env.VITE_CAMERA_ID ?? "carcam",
} as const;

/** Build a WebSocket URL for a channel, optionally scoped to one camera. */
export function wsUrl(channel: "detections" | "metrics", cameraId?: string): string {
  const base = `${config.wsBaseUrl}/ws/${channel}`;
  return cameraId ? `${base}?cameraId=${encodeURIComponent(cameraId)}` : base;
}

/** Backend WHIP ingest URL for Browser Camera Mode (publishes webcam → backend). */
export function ingestUrl(cameraId: string): string {
  return `${config.apiBaseUrl}/webrtc/ingest/${encodeURIComponent(cameraId)}`;
}
