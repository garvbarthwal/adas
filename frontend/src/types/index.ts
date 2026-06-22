/**
 * Shared types — these mirror the backend wire contract exactly.
 * Keep in sync with `backend/app/schemas`.
 */

/** A single detected + tracked object (coords in source-frame pixels). */
export interface DetectedObject {
  /** Stable ByteTrack tracking id (-1 if untracked). */
  id: number;
  /** Class label, e.g. "person". `class` is reserved in JS so we map it. */
  class: string;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Payload from `/ws/detections`. */
export interface DetectionMessage {
  cameraId: string;
  timestamp: number;
  /** Resolution the detection ran on — used to scale boxes to the video. */
  frameWidth: number;
  frameHeight: number;
  objects: DetectedObject[];
}

export type StreamStatus = "online" | "offline" | "connecting";

/** Payload from `/ws/metrics`. */
export interface CameraMetrics {
  cameraId: string;
  streamStatus: StreamStatus;
  streamFps: number;
  detectionFps: number;
  latencyMs: number;
  trackedObjects: number;
  uptimeSeconds: number;
}

/** `GET /health` response. */
export interface HealthResponse {
  status: "online" | "offline" | "degraded";
  stream: StreamStatus;
  yolo: "online" | "offline" | "degraded";
  fps: number;
  cameras: number;
  uptimeSeconds: number;
}

export type ConnectionState = "connecting" | "open" | "closed";
