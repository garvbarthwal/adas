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

type Pt = [number, number];

/**
 * Collapse a lane-marking mask polygon down to its centerline, following the
 * marking even when it curves.
 *
 * The model returns the closed *outline* of each marking — a thin ribbon whose
 * contour is two long edges joined by short end caps. Drawing that outline
 * directly produces a hollow blob. Instead we:
 *   1. find the ribbon's long axis via PCA (works at any orientation),
 *   2. split the contour at its two far tips into the two long edges,
 *   3. resample both edges by arc length and average them point-for-point.
 * Averaging the two edges — rather than slicing the bbox and taking a midpoint —
 * keeps the line glued to the painted marking through bends.
 */
function laneCenterline(points: Pt[]): Pt[] {
  const n = points.length;
  if (n < 3) return points;

  // 1. Principal axis = dominant eigenvector of the 2x2 covariance matrix.
  let mx = 0;
  let my = 0;
  for (const [x, y] of points) {
    mx += x;
    my += y;
  }
  mx /= n;
  my /= n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    const dx = x - mx;
    const dy = y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  let dirX: number;
  let dirY: number;
  if (Math.abs(sxy) > 1e-6) {
    const lambda = (sxx + syy) / 2 + Math.hypot((sxx - syy) / 2, sxy);
    dirX = lambda - syy;
    dirY = sxy;
  } else {
    [dirX, dirY] = sxx >= syy ? [1, 0] : [0, 1];
  }
  const dlen = Math.hypot(dirX, dirY) || 1;
  dirX /= dlen;
  dirY /= dlen;

  // 2. Tips = the contour vertices with the extreme projections onto that axis.
  let iMin = 0;
  let iMax = 0;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const t = (points[i][0] - mx) * dirX + (points[i][1] - my) * dirY;
    if (t < tMin) {
      tMin = t;
      iMin = i;
    }
    if (t > tMax) {
      tMax = t;
      iMax = i;
    }
  }
  if (iMin === iMax) return points;

  // The two ways around the closed loop between the tips are the two edges.
  const edgeA = contourArc(points, iMin, iMax);
  const edgeB = contourArc(points, iMax, iMin).reverse();
  if (edgeA.length < 2 || edgeB.length < 2) return points;

  // 3. Resample both to a shared length and average them.
  const k = Math.max(2, Math.min(48, Math.round((tMax - tMin) / 8)));
  const ra = resampleByLength(edgeA, k);
  const rb = resampleByLength(edgeB, k);
  const line: Pt[] = [];
  for (let i = 0; i < k; i++) {
    line.push([(ra[i][0] + rb[i][0]) / 2, (ra[i][1] + rb[i][1]) / 2]);
  }
  return line;
}

/** Vertices walked forward (wrapping) from index `from` to index `to`. */
function contourArc(points: Pt[], from: number, to: number): Pt[] {
  const n = points.length;
  const out: Pt[] = [];
  let i = from;
  for (;;) {
    out.push(points[i]);
    if (i === to) break;
    i = (i + 1) % n;
  }
  return out;
}

/** Resample a polyline to `k` points spaced evenly by arc length. */
function resampleByLength(line: Pt[], k: number): Pt[] {
  const cum = [0];
  for (let i = 1; i < line.length; i++) {
    cum.push(
      cum[i - 1] +
        Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]),
    );
  }
  const total = cum[cum.length - 1];
  if (total === 0) return Array.from({ length: k }, () => line[0]);

  const out: Pt[] = [];
  let seg = 0;
  for (let j = 0; j < k; j++) {
    const target = (j / (k - 1)) * total;
    while (seg < cum.length - 2 && cum[seg + 1] < target) seg++;
    const segLen = cum[seg + 1] - cum[seg] || 1;
    const f = (target - cum[seg]) / segLen;
    out.push([
      line[seg][0] + f * (line[seg + 1][0] - line[seg][0]),
      line[seg][1] + f * (line[seg + 1][1] - line[seg][1]),
    ]);
  }
  return out;
}

/** Draw a lane as a single bold ribbon line (dashed for broken lanes). */
function drawLane(
  ctx: CanvasRenderingContext2D,
  lane: LaneSegment,
  rect: RenderRect,
): void {
  if (!lane.points || lane.points.length < 2) return;

  const centerline = laneCenterline(lane.points as Pt[]);
  if (centerline.length < 2) return;

  const color = laneColor(lane.class);
  const broken = lane.class.toLowerCase().includes("broken");

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < centerline.length; i++) {
    const [px, py] = centerline[i];
    const x = rect.offsetX + px * rect.scaleX;
    const y = rect.offsetY + py * rect.scaleY;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  // A single bold ribbon: rounded caps/joins so it reads as one smooth stroke.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  if (broken) ctx.setLineDash([24, 16]);
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
