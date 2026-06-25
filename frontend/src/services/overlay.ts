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

import type {
  DetectedObject,
  DetectionMessage,
  LaneSegment,
  PotholeObject,
} from "@/types";
import { classColor, laneColor, POTHOLE_COLOR } from "@/services/format";

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

  if (!detection) return;

  const rect = computeRenderRect(
    video,
    detection.frameWidth,
    detection.frameHeight,
    displayW,
    displayH,
  );

  // Draw order: lanes (road surface) → potholes (hazards) → objects (on top).
  for (const lane of detection.lanes ?? []) {
    drawLane(ctx, lane, rect);
  }
  for (const pothole of detection.potholes ?? []) {
    drawPothole(ctx, pothole, rect, opts);
  }
  for (const obj of detection.objects) {
    drawBox(ctx, obj, rect, opts);
  }
}

/** Draw a lane-line polygon as a polyline (dashed for broken lanes). */
function drawLane(
  ctx: CanvasRenderingContext2D,
  lane: LaneSegment,
  rect: RenderRect,
): void {
  if (!lane.points || lane.points.length < 2) return;

  const color = laneColor(lane.class);
  const broken = lane.class.toLowerCase().includes("broken");

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < lane.points.length; i++) {
    const [px, py] = lane.points[i];
    const x = rect.offsetX + px * rect.scaleX;
    const y = rect.offsetY + py * rect.scaleY;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  // Translucent fill so the lane region reads as a band, plus a crisp outline.
  ctx.fillStyle = color + "22"; // ~13% alpha
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  if (broken) ctx.setLineDash([12, 8]);
  ctx.stroke();
  ctx.restore();
}

/** Draw a pothole as a hazard-red box with a POTHOLE label. */
function drawPothole(
  ctx: CanvasRenderingContext2D,
  pothole: PotholeObject,
  rect: RenderRect,
  opts: DrawOptions,
): void {
  const x = rect.offsetX + pothole.x1 * rect.scaleX;
  const y = rect.offsetY + pothole.y1 * rect.scaleY;
  const w = (pothole.x2 - pothole.x1) * rect.scaleX;
  const h = (pothole.y2 - pothole.y1) * rect.scaleY;

  ctx.lineWidth = 3;
  ctx.strokeStyle = POTHOLE_COLOR;
  ctx.strokeRect(x, y, w, h);

  const label = opts.showConfidence
    ? `POTHOLE ${Math.round(pothole.confidence * 100)}%`
    : "POTHOLE";

  ctx.font = "700 12px ui-monospace, monospace";
  const padding = 4;
  const textW = ctx.measureText(label).width;
  const labelH = 16;
  const labelY = y - labelH >= 0 ? y - labelH : y;

  ctx.fillStyle = POTHOLE_COLOR;
  ctx.fillRect(x, labelY, textW + padding * 2, labelH);

  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padding, labelY + labelH / 2);
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

  const color = classColor(obj.class);

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
  ctx.fillStyle = "#000";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padding, labelY + labelH / 2);
}
