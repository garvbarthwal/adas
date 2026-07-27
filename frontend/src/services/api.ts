/** REST client for the backend. Used via React Query for health/streams. */

import { config } from "./config";
import type { CameraMetrics, HealthResponse, DetectionMessage } from "@/types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${config.apiBaseUrl}${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => get<HealthResponse>("/health"),
  metrics: () => get<CameraMetrics[]>("/metrics"),
  streams: () => get<unknown[]>("/streams"),
  latestDetections: () => get<DetectionMessage[]>("/latest-detections"),
  radarPorts: () => get<{device: string, description: string}[]>("/radar/ports"),
  setRadarPort: (port: string) => post<{status: string, port: string}>("/radar/port", { port }),
  setGateSensitivity: (gate: number, motion: number, staticSens: number) => 
    post<{status: string}>("/radar/sensitivity", { gate, motion, static: staticSens }),
};
