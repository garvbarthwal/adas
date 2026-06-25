/**
 * Shared presentation helpers — kept in one place so the canvas overlay, the
 * detections list and the HUD all colour and format detections identically.
 */

/** Per-class accent colour. Falls back to a neutral slate for unknown classes. */
const CLASS_COLORS: Record<string, string> = {
  person: "#fbbf24",
  car: "#38bdf8",
  bicycle: "#34d399",
  truck: "#fb923c",
  bus: "#f97316",
  motorbike: "#e879f9",
  motorcycle: "#e879f9",
};

export function classColor(cls: string): string {
  return CLASS_COLORS[cls.toLowerCase()] ?? "#94a3b8";
}

/** Potholes are drawn in a hazard red regardless of class. */
export const POTHOLE_COLOR = "#ef4444";

/** Lane-line colour by class — broken vs solid get distinct hues. */
export function laneColor(cls: string): string {
  return cls.toLowerCase().includes("broken") ? "#a3e635" : "#22d3ee";
}

/** Colour a confidence percentage: green ≥ 80, amber ≥ 60, red below. */
export function confidenceColor(conf: number): string {
  const pct = conf <= 1 ? conf * 100 : conf;
  if (pct >= 80) return "#34d399";
  if (pct >= 60) return "#fbbf24";
  return "#f87171";
}

/** Human-friendly uptime: "mm:ss" under an hour, "Hh Mm" beyond. */
export function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s >= 3600) {
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Relative "Ns ago" / "Nm ago" / "Nh ago" label for an alert timestamp. */
export function timeAgo(ts: number): string {
  const ago = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (ago < 60) return `${ago}s ago`;
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
  return `${Math.floor(ago / 3600)}h ago`;
}
