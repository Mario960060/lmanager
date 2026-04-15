// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — visualization/linearMarkers.ts
// Post markers on fences, slope indicators on walls
// ══════════════════════════════════════════════════════════════

import { Point, Shape, distance, toPixels, midpoint, readableTextAngle, C, C_LIGHT } from "../geometry";
import { calcEdgeSlopes, formatSlope, slopeColor } from "../geodesy";

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

const POST_SPACING_M = 1.8;
const POST_RADIUS_PX = 5;

function getPostCountFromResults(calculatorResults: any): number | null {
  if (!calculatorResults?.materials) return null;
  const postMat = calculatorResults.materials.find((m: any) =>
    (m.name || "").toLowerCase().includes("post") && !(m.name || "").toLowerCase().includes("postmix")
  );
  if (!postMat) return null;
  const count = postMat.quantity ?? postMat.amount;
  return typeof count === "number" ? count : parseInt(String(count), 10) || null;
}

function pointAtDistance(pts: Point[], distPx: number): Point | null {
  if (pts.length < 2) return null;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const segLen = distance(pts[i], pts[i + 1]);
    if (acc + segLen >= distPx) {
      const t = (distPx - acc) / segLen;
      return {
        x: pts[i].x + t * (pts[i + 1].x - pts[i].x),
        y: pts[i].y + t * (pts[i + 1].y - pts[i].y),
      };
    }
    acc += segLen;
  }
  return pts[pts.length - 1];
}

/**
 * Draw post markers along fence polyline.
 * Post positions derived from calculatorResults or default 1.8m spacing.
 */
export function drawFencePostMarkers(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  zoom: number
): void {
  const pts = shape.points;
  if (pts.length < 2 || shape.elementType !== "fence") return;

  let totalLenPx = 0;
  for (let i = 0; i < pts.length - 1; i++) totalLenPx += distance(pts[i], pts[i + 1]);
  const postCount = getPostCountFromResults(shape.calculatorResults);
  const spacingPx = postCount != null && postCount > 1
    ? totalLenPx / (postCount - 1)
    : toPixels(POST_SPACING_M);

  const positions: Point[] = [];
  for (let d = 0; d <= totalLenPx + 1; d += spacingPx) {
    const p = pointAtDistance(pts, d);
    if (p) positions.push(p);
  }

  const r = Math.max(3, POST_RADIUS_PX * zoom);
  ctx.fillStyle = C.fence;
  ctx.strokeStyle = C.point;
  ctx.lineWidth = 1.5;
  for (const p of positions) {
    const s = worldToScreen(p.x, p.y);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * Draw slope indicators along wall polyline when height data exists.
 */
export function drawWallSlopeIndicators(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  canvasIsLight?: boolean,
): void {
  if (shape.elementType !== "wall") return;
  const heights = shape.heights || shape.points.map(() => 0);
  const hasHeights = heights.some(h => h != null && Math.abs(h) > 0.0001);
  if (!hasHeights) return;

  const slopes = calcEdgeSlopes(shape);
  for (const sl of slopes) {
    if (sl.slopeCmPerM < 0.01 || sl.direction === "flat") continue;
    const a = shape.points[sl.fromIdx];
    const b = shape.points[sl.toIdx];
    const mid = midpoint(a, b);
    const sm = worldToScreen(mid.x, mid.y);
    const sa = worldToScreen(a.x, a.y);
    const sb = worldToScreen(b.x, b.y);
    const dx = sl.direction === "down" ? sb.x - sa.x : sa.x - sb.x;
    const dy = sl.direction === "down" ? sb.y - sa.y : sa.y - sb.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const arrowLen = 12;
    const ax = sm.x + ux * arrowLen;
    const ay = sm.y + uy * arrowLen;
    ctx.strokeStyle = slopeColor(sl.severity);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sm.x, sm.y);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    const textAngle = readableTextAngle(Math.atan2(sb.y - sa.y, sb.x - sa.x));
    const slopeLabelOffset = 18;
    const stx = sm.x + (sb.y - sa.y) / len * slopeLabelOffset;
    const sty = sm.y - (sb.x - sa.x) / len * slopeLabelOffset;
    ctx.save();
    ctx.translate(stx, sty);
    ctx.rotate(textAngle);
    ctx.font = "bold 20px 'JetBrains Mono',monospace";
    ctx.fillStyle = canvasIsLight ? C_LIGHT.text : slopeColor(sl.severity);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(formatSlope(sl), 0, 0);
    ctx.restore();
  }
}
