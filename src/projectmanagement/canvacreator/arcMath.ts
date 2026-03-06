// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — arcMath.ts
// Arc/curve math for edge arcs (Catmull-Rom, Bézier, sampling)
// ══════════════════════════════════════════════════════════════

import type { Point } from "./geometry";
import { distance, projectOntoSegment } from "./geometry";
import type { ArcPoint, Shape } from "./geometry";

// ── ArcPoint ↔ World ────────────────────────────────────────

/**
 * Convert ArcPoint to world coordinate.
 * @param A - edge start point
 * @param B - edge end point
 * @param arcPoint - { t, offset }
 * @returns world position of the arc point
 */
export function arcPointToWorld(A: Point, B: Point, arcPoint: ArcPoint): Point {
  const mx = A.x + arcPoint.t * (B.x - A.x);
  const my = A.y + arcPoint.t * (B.y - A.y);

  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return { x: mx, y: my };

  const nx = -dy / len;
  const ny = dx / len;

  return {
    x: mx + arcPoint.offset * nx,
    y: my + arcPoint.offset * ny,
  };
}

/**
 * Inverse: given world position, compute { t, offset } for edge A→B.
 */
export function worldToArcPoint(A: Point, B: Point, world: Point): { t: number; offset: number } {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return { t: 0.5, offset: 0 };

  let t = ((world.x - A.x) * dx + (world.y - A.y) * dy) / lenSq;
  t = Math.max(0.01, Math.min(0.99, t));

  const len = Math.sqrt(lenSq);
  const nx = -dy / len;
  const ny = dx / len;

  const bx = A.x + t * dx;
  const by = A.y + t * dy;
  const offset = (world.x - bx) * nx + (world.y - by) * ny;

  return { t, offset };
}

// ── Catmull-Rom → Bézier ────────────────────────────────────

/**
 * Convert Catmull-Rom segment (P0, P1, P2, P3) to cubic Bézier control points.
 * Centripetal parameterization (alpha = 0.5) for stability.
 */
export function catmullRomToBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  alpha = 0.5
): { cp1: Point; cp2: Point } {
  const t = alpha;
  return {
    cp1: {
      x: p1.x + (p2.x - p0.x) / (6 * t),
      y: p1.y + (p2.y - p0.y) / (6 * t),
    },
    cp2: {
      x: p2.x - (p3.x - p1.x) / (6 * t),
      y: p2.y - (p3.y - p1.y) / (6 * t),
    },
  };
}

// ── Curve Drawing ───────────────────────────────────────────

/**
 * Draw a curved edge using Catmull-Rom spline via cubic Bézier segments.
 * ctx should already have moveTo(A) called before this.
 * For a single arc point: uses quadratic Bézier so the curve bulges outward smoothly
 * without "turning back" at endpoints (no S-curve).
 */
export function drawCurvedEdge(
  ctx: CanvasRenderingContext2D,
  A: Point,
  B: Point,
  arcPoints: ArcPoint[],
  worldToScreen: (x: number, y: number) => Point
): void {
  const sorted = [...arcPoints].sort((a, b) => a.t - b.t);

  const pts: Point[] = [A];
  for (const ap of sorted) {
    pts.push(arcPointToWorld(A, B, ap));
  }
  pts.push(B);

  const pBefore: Point = {
    x: 2 * pts[0].x - pts[1].x,
    y: 2 * pts[0].y - pts[1].y,
  };
  const pAfter: Point = {
    x: 2 * pts[pts.length - 1].x - pts[pts.length - 2].x,
    y: 2 * pts[pts.length - 1].y - pts[pts.length - 2].y,
  };
  const padded = [pBefore, ...pts, pAfter];

  for (let s = 1; s < padded.length - 2; s++) {
    const p0 = padded[s - 1];
    const p1 = padded[s];
    const p2 = padded[s + 1];
    const p3 = padded[s + 2];
    const { cp1, cp2 } = catmullRomToBezier(p0, p1, p2, p3);
    const end = p2;
    const scp1 = worldToScreen(cp1.x, cp1.y);
    const scp2 = worldToScreen(cp2.x, cp2.y);
    const send = worldToScreen(end.x, end.y);
    ctx.bezierCurveTo(scp1.x, scp1.y, scp2.x, scp2.y, send.x, send.y);
  }
}

// ── Sampling ─────────────────────────────────────────────────

/**
 * Sample an arc edge into N points for geometry calculations.
 * Returns array of Points along the curve, including A (first) and B (last).
 */
export function sampleArcEdge(
  A: Point,
  B: Point,
  arcPoints: ArcPoint[],
  numSamples = 32
): Point[] {
  const sorted = [...arcPoints].sort((a, b) => a.t - b.t);

  const pts: Point[] = [A];
  for (const ap of sorted) {
    pts.push(arcPointToWorld(A, B, ap));
  }
  pts.push(B);

  const pBefore: Point = {
    x: 2 * pts[0].x - pts[1].x,
    y: 2 * pts[0].y - pts[1].y,
  };
  const pAfter: Point = {
    x: 2 * pts[pts.length - 1].x - pts[pts.length - 2].x,
    y: 2 * pts[pts.length - 1].y - pts[pts.length - 2].y,
  };
  const padded = [pBefore, ...pts, pAfter];

  const result: Point[] = [];
  const segCount = padded.length - 3;

  for (let seg = 0; seg < segCount; seg++) {
    const p0 = padded[seg];
    const p1 = padded[seg + 1];
    const p2 = padded[seg + 2];
    const p3 = padded[seg + 3];

    const samplesThisSeg = seg === 0 ? Math.ceil(numSamples / segCount) + 1 : Math.ceil(numSamples / segCount);
    const step = 1 / samplesThisSeg;

    for (let k = 0; k < samplesThisSeg; k++) {
      const u = k * step;
      const t = u;
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      result.push({ x, y });
    }
  }
  result.push(B);
  return result;
}

/**
 * Project a point onto an arc edge. Returns { t, proj, dist } for the closest point on the curve.
 * Use for hit-testing arc edges — the straight chord is wrong, the curve is the actual geometry.
 */
export function projectOntoArcEdge(
  wp: Point,
  A: Point,
  B: Point,
  arcPoints: ArcPoint[],
  numSamples = 32
): { t: number; proj: Point; dist: number } {
  const samples = sampleArcEdge(A, B, arcPoints, numSamples);
  let bestDist = Infinity;
  let bestT = 0.5;
  let bestProj: Point = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const n = samples.length - 1;
  for (let i = 0; i < n; i++) {
    const pr = projectOntoSegment(wp, samples[i], samples[i + 1]);
    if (pr.dist < bestDist) {
      bestDist = pr.dist;
      bestT = (i + pr.t) / n;
      bestProj = pr.proj;
    }
  }
  return { t: bestT, proj: bestProj, dist: bestDist };
}

/**
 * Build effective polygon from shape: straight edges as-is, curved edges sampled.
 * Use for area calculation, pattern clipping, point-in-polygon tests.
 */
export function getEffectivePolygon(shape: Shape): Point[] {
  const pts = shape.points;
  if (pts.length < 3 || !shape.closed) return pts;
  const edgeArcs = shape.edgeArcs;
  if (!edgeArcs || edgeArcs.every(a => !a || a.length === 0)) return pts;

  const result: Point[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const arcs = edgeArcs[i];
    if (!arcs || arcs.length === 0) {
      result.push(pts[j]);
    } else {
      const sampled = sampleArcEdge(pts[i], pts[j], arcs, 48);
      for (let k = 1; k < sampled.length; k++) {
        result.push(sampled[k]);
      }
    }
  }
  return result;
}

/**
 * Effective polygon with edge index per segment.
 * edgeIndices[i] = original edge index for segment from polygon[i] to polygon[(i+1)%n].
 */
export function getEffectivePolygonWithEdgeIndices(shape: Shape): { points: Point[]; edgeIndices: number[] } {
  const pts = shape.points;
  const n = pts.length;
  if (n < 3 || !shape.closed) {
    const edgeIndices: number[] = [];
    for (let i = 0; i < pts.length; i++) edgeIndices.push(i);
    return { points: [...pts], edgeIndices };
  }
  const edgeArcs = shape.edgeArcs;
  if (!edgeArcs || edgeArcs.every(a => !a || a.length === 0)) {
    const edgeIndices: number[] = [];
    for (let i = 0; i < n; i++) edgeIndices.push(i);
    return { points: [...pts], edgeIndices };
  }

  const points: Point[] = [];
  const edgeIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const arcs = edgeArcs[i];
    if (!arcs || arcs.length === 0) {
      points.push(pts[j]);
      edgeIndices.push(i);
    } else {
      const sampled = sampleArcEdge(pts[i], pts[j], arcs, 48);
      for (let k = 1; k < sampled.length; k++) {
        points.push(sampled[k]);
        edgeIndices.push(i);
      }
    }
  }
  return { points, edgeIndices };
}

/**
 * Draw a closed path through polygon points with straight line segments.
 * Uses the EXACT same geometry as getEffectivePolygon — outline matches slab pattern boundary.
 * No Bézier interpolation — 48 samples per arc give a smooth appearance.
 */
export function drawSmoothPolygonPath(
  ctx: CanvasRenderingContext2D,
  polygon: Point[],
  worldToScreen: (x: number, y: number) => Point
): void {
  const n = polygon.length;
  if (n < 2) return;
  const s0 = worldToScreen(polygon[0].x, polygon[0].y);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < n; i++) {
    const s = worldToScreen(polygon[i].x, polygon[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
}

/**
 * Stroke a polygon with straight segments and per-edge styling.
 * edgeIndices[i] = original edge index for segment from polygon[i] to polygon[(i+1)%n].
 * Same geometry as getEffectivePolygon — outline matches slab pattern boundary.
 */
export function drawSmoothPolygonStroke(
  ctx: CanvasRenderingContext2D,
  polygon: Point[],
  edgeIndices: number[],
  worldToScreen: (x: number, y: number) => Point,
  getStyleForEdge: (edgeIdx: number) => { strokeStyle: string; lineWidth: number }
): void {
  const n = polygon.length;
  if (n < 2 || edgeIndices.length !== n) return;
  for (let i = 0; i < n; i++) {
    const pCurr = polygon[i];
    const pNext = polygon[(i + 1) % n];
    const style = getStyleForEdge(edgeIndices[(i + 1) % n]);
    ctx.strokeStyle = style.strokeStyle;
    ctx.lineWidth = style.lineWidth;
    ctx.beginPath();
    const sCurr = worldToScreen(pCurr.x, pCurr.y);
    const sNext = worldToScreen(pNext.x, pNext.y);
    ctx.moveTo(sCurr.x, sCurr.y);
    ctx.lineTo(sNext.x, sNext.y);
    ctx.stroke();
  }
}

/**
 * Edge length: arc length if arcs exist, else straight distance.
 */
export function calcEdgeLengthWithArcs(
  A: Point,
  B: Point,
  arcs: ArcPoint[] | null | undefined
): number {
  if (!arcs || arcs.length === 0) return distance(A, B);
  return arcEdgeLength(A, B, arcs);
}

/**
 * Arc edge length via sampling.
 */
export function arcEdgeLength(A: Point, B: Point, arcPoints: ArcPoint[]): number {
  const samples = sampleArcEdge(A, B, arcPoints, 64);
  let len = 0;
  for (let i = 1; i < samples.length; i++) {
    len += distance(samples[i - 1], samples[i]);
  }
  return len;
}

// ── Drag Arc Point ───────────────────────────────────────────

/**
 * Compute { t, offset } from mouse position when dragging an arc point.
 * Constrained movement: t along edge, offset perpendicular.
 */
export function dragArcPoint(
  A: Point,
  B: Point,
  mouseX: number,
  mouseY: number
): { t: number; offset: number } {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return { t: 0.5, offset: 0 };

  const mx = mouseX - A.x;
  const my = mouseY - A.y;
  let t = (mx * dx + my * dy) / lenSq;
  t = Math.max(0.01, Math.min(0.99, t));

  const len = Math.sqrt(lenSq);
  const nx = -dy / len;
  const ny = dx / len;

  const bx = A.x + t * dx;
  const by = A.y + t * dy;
  const offset = (mouseX - bx) * nx + (mouseY - by) * ny;

  return { t, offset };
}

// ── Arc Snap Magnet ────────────────────────────────────────

/**
 * Snap arc point to nearby arc points from other edges when dragging.
 * When current arc point's world position is within threshold of another arc point,
 * snap to align them (same world position = similar curve bend).
 */
export function snapArcPoint(
  A: Point,
  B: Point,
  currentT: number,
  currentOffset: number,
  shapes: Shape[],
  excludeShapeIdx: number,
  excludeEdge: { shapeIdx: number; edgeIdx: number },
  threshold: number
): { t: number; offset: number; didSnap: boolean } {
  const currentWorld = arcPointToWorld(A, B, { id: "", t: currentT, offset: currentOffset });
  let bestDist = threshold;
  let bestTarget: Point | null = null;

  for (let si = 0; si < shapes.length; si++) {
    if (si === excludeShapeIdx) continue;
    const shape = shapes[si];
    const pts = shape.points;
    const edgeCount = shape.closed ? pts.length : pts.length - 1;

    for (let ei = 0; ei < edgeCount; ei++) {
      if (si === excludeEdge.shapeIdx && ei === excludeEdge.edgeIdx) continue;
      const arcs = shape.edgeArcs?.[ei];
      if (!arcs || arcs.length === 0) continue;

      const edgeA = pts[ei];
      const edgeB = pts[(ei + 1) % pts.length];

      for (const ap of arcs) {
        const world = arcPointToWorld(edgeA, edgeB, ap);
        const d = distance(currentWorld, world);
        if (d < bestDist) {
          bestDist = d;
          bestTarget = world;
        }
      }
    }
  }

  if (bestTarget) {
    const { t, offset } = worldToArcPoint(A, B, bestTarget);
    return { t, offset, didSnap: true };
  }
  return { t: currentT, offset: currentOffset, didSnap: false };
}

// ── Arc Handles Drawing ──────────────────────────────────────

type WorldToScreen = (wx: number, wy: number) => Point;

/**
 * Hit test arc point: returns the arc point if mouse (world coords) is within threshold of its handle.
 * threshold: world units (pixels in world space)
 */
export function hitTestArcPoint(
  wp: Point,
  A: Point,
  B: Point,
  arcPoints: ArcPoint[],
  threshold: number
): ArcPoint | null {
  for (const ap of arcPoints) {
    const world = arcPointToWorld(A, B, ap);
    const d = distance(wp, world);
    if (d <= threshold) return ap;
  }
  return null;
}

/**
 * Draw arc point handles when shape is selected.
 * Dashed line from base (on straight edge) to arc point, small circle at arc point.
 */
export function drawArcHandles(
  ctx: CanvasRenderingContext2D,
  A: Point,
  B: Point,
  arcPoints: ArcPoint[],
  worldToScreen: WorldToScreen,
  hoveredArcId: string | null = null,
  linkedArcIds?: Set<string>
): void {
  for (const ap of arcPoints) {
    const world = arcPointToWorld(A, B, ap);
    const base = { x: A.x + ap.t * (B.x - A.x), y: A.y + ap.t * (B.y - A.y) };
    const sBase = worldToScreen(base.x, base.y);
    const sWorld = worldToScreen(world.x, world.y);

    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
    ctx.moveTo(sBase.x, sBase.y);
    ctx.lineTo(sWorld.x, sWorld.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const isHovered = hoveredArcId === ap.id;
    const r = isHovered ? 6 : 5;
    ctx.beginPath();
    ctx.arc(sWorld.x, sWorld.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#3b82f6";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (linkedArcIds?.has(ap.id)) {
      ctx.beginPath();
      ctx.arc(sWorld.x, sWorld.y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "#6c5ce7";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
