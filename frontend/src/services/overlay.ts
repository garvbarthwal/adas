/**
 * Canvas overlay renderer.
 *
 * Draws bounding boxes, labels, confidence and tracking ids onto a 2D canvas
 * layered above the WebRTC <video>. Rendering happens on the canvas (not React
 * DOM) so hundreds of boxes across multiple cameras stay smooth.
 *
 * Coordinate scaling: detections arrive in source-frame pixels
 * (`frameWidth`×`frameHeight`). The video is shown with `object-contain`, so it
 * is letterboxed inside its element. We compute the rendered video rectangle and
 * map source coords into it, keeping boxes glued to objects at any display size.
 *
 * Extension points (intentionally left as hooks for future ADAS features):
 *   - trajectories: draw a polyline from a per-id position history
 *   - distance: render a distance annotation under each box
 */

import type { DetectedObject, DetectionMessage } from "@/types";

/** Deterministic, readable color per tracking id / class. */
function colorFor(key: number | string): string {
  const n = typeof key === "number" ? key : hashString(key);
  const hue = (n * 47) % 360;
  return `hsl(${hue}, 85%, 58%)`;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The rectangle the video actually occupies inside its element (contain). */
interface RenderRect {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

function computeRenderRect(
  video: HTMLVideoElement,
  frameWidth: number,
  frameHeight: number,
  displayW: number,
  displayH: number,
): RenderRect {
  // Use the video's intrinsic size if available, else the detection frame size.
  const srcW = video.videoWidth || frameWidth;
  const srcH = video.videoHeight || frameHeight;
  if (!srcW || !srcH) {
    return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };
  }

  // object-contain: scale to fit, preserving aspect ratio (letterbox).
  const scale = Math.min(displayW / srcW, displayH / srcH);
  const renderedW = srcW * scale;
  const renderedH = srcH * scale;
  const offsetX = (displayW - renderedW) / 2;
  const offsetY = (displayH - renderedH) / 2;

  // Map detection coords (in frameWidth space) → rendered video space.
  return {
    offsetX,
    offsetY,
    scaleX: (renderedW / frameWidth) || scale,
    scaleY: (renderedH / frameHeight) || scale,
  };
}

export interface DrawOptions {
  showConfidence?: boolean;
  showTrackId?: boolean;
}

/**
 * Render one detection frame. Sizes the canvas backing store to the element
 * (accounting for devicePixelRatio) for crisp lines on HiDPI displays.
 */
export function drawDetections(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  detection: DetectionMessage | null,
  opts: DrawOptions = { showConfidence: true, showTrackId: true },
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const displayW = canvas.clientWidth;
  const displayH = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  // Resize backing store only when needed.
  if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, displayW, displayH);

  if (!detection || detection.objects.length === 0) return;

  const rect = computeRenderRect(
    video,
    detection.frameWidth,
    detection.frameHeight,
    displayW,
    displayH,
  );

  for (const obj of detection.objects) {
    drawBox(ctx, obj, rect, opts);
  }
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  obj: DetectedObject,
  rect: RenderRect,
  opts: DrawOptions,
): void {
  const x = rect.offsetX + obj.x1 * rect.scaleX;
  const y = rect.offsetY + obj.y1 * rect.scaleY;
  const w = (obj.x2 - obj.x1) * rect.scaleX;
  const h = (obj.y2 - obj.y1) * rect.scaleY;

  const color = colorFor(obj.id >= 0 ? obj.id : obj.class);

  // Box.
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.strokeRect(x, y, w, h);

  // Label text.
  const parts = [obj.class];
  if (opts.showTrackId && obj.id >= 0) parts.push(`#${obj.id}`);
  if (opts.showConfidence) parts.push(`${Math.round(obj.confidence * 100)}%`);
  const label = parts.join(" ");

  ctx.font = "600 12px ui-monospace, monospace";
  const padding = 4;
  const textW = ctx.measureText(label).width;
  const labelH = 16;
  const labelY = y - labelH >= 0 ? y - labelH : y;

  // Label background.
  ctx.fillStyle = color;
  ctx.fillRect(x, labelY, textW + padding * 2, labelH);

  // Label text.
  ctx.fillStyle = "#0b0f17";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padding, labelY + labelH / 2);
}
