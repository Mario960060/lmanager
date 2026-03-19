// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — arcMath.ts
// Arc/curve math for edge arcs (Catmull-Rom, Bézier, sampling)
// ══════════════════════════════════════════════════════════════

import type { ArcPoint, Point, Shape } from "./geometry";
import { distance, projectOntoSegment, undirectedLineAngleDistanceDeg } from "./geometry";

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
 * Fit quadratic Bézier control point to a set of points between A and B.
 * Curve: B(s) = (1-s)²A + 2(1-s)s*C + s²B. Returns C (control point).
 * Uses arc-length parameterization for s. Returns null if pts too few.
 */
export function fitQuadraticBezierControlToPoints(A: Point, B: Point, pts: Point[]): Point | null {
  if (pts.length < 2) return null;
  const n = pts.length;
  let totalLen = 0;
  const segLens: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const d = distance(pts[i], pts[i + 1]);
    segLens.push(d);
    totalLen += d;
  }
  if (totalLen < 1e-9) return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };

  let cxSum = 0, cySum = 0, weightSum = 0;
  let accLen = 0;
  for (let k = 1; k < n - 1; k++) {
    accLen += segLens[k - 1];
    const s = accLen / totalLen;
    if (s <= 0.001 || s >= 0.999) continue;
    const w = 2 * (1 - s) * s;
    if (w < 1e-9) continue;
    const P = pts[k];
    const rhsX = P.x - (1 - s) * (1 - s) * A.x - s * s * B.x;
    const rhsY = P.y - (1 - s) * (1 - s) * A.y - s * s * B.y;
    cxSum += rhsX / w;
    cySum += rhsY / w;
    weightSum += 1;
  }
  if (weightSum < 0.5) return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  return { x: cxSum / weightSum, y: cySum / weightSum };
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

/**
 * Convert ArcPoint to world coordinate ON THE ACTUAL ARC CURVE.
 * Uses the same quadratic Bézier as drawCurvedEdge: control = centroid of arc points.
 * Parameter ap.t maps to curve parameter s, so the handle follows the curve.
 */
export function arcPointToWorldOnCurve(
  A: Point,
  B: Point,
  arcPoints: ArcPoint[],
  arcPoint: ArcPoint
): Point {
  const sorted = [...arcPoints].sort((a, b) => a.t - b.t);
  let cx = 0, cy = 0;
  for (const ap of sorted) {
    const p = arcPointToWorld(A, B, ap);
    cx += p.x;
    cy += p.y;
  }
  cx /= sorted.length;
  cy /= sorted.length;

  const s = Math.max(0.01, Math.min(0.99, arcPoint.t));
  const u = 1 - s;
  return {
    x: u * u * A.x + 2 * u * s * cx + s * s * B.x,
    y: u * u * A.y + 2 * u * s * cy + s * s * B.y,
  };
}

// ── Inverse helpers (iterative search, not chord projection) ───

/**
 * For given curve param t, compute offset so curve passes through targetWorld.
 * Uses: centroid = (target - u²A - t²B)/(2ut), ourChordPos = n*centroid - others, offset = (ourChordPos - base)·normal.
 */
function solveOffsetForTarget(
  A: Point,
  B: Point,
  t: number,
  othersX: number,
  othersY: number,
  n: number,
  targetWorld: Point
): number {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return 0;
  const denom = 2 * (1 - t) * t;
  if (Math.abs(denom) < 1e-9) return 0;
  const u = 1 - t;
  const centroidX = (targetWorld.x - u * u * A.x - t * t * B.x) / denom;
  const centroidY = (targetWorld.y - u * u * A.y - t * t * B.y) / denom;
  const Cx = n * centroidX - othersX;
  const Cy = n * centroidY - othersY;
  const len = Math.sqrt(lenSq);
  const nx = -dy / len;
  const ny = dx / len;
  const baseX = A.x + t * dx;
  const baseY = A.y + t * dy;
  return (Cx - baseX) * nx + (Cy - baseY) * ny;
}

/**
 * Evaluate curve at (t, offset) with given others. Same formula as arcPointToWorldOnCurve.
 * Use to validate: evalCurveAtT(A, B, ap.t, ap.offset, othersX, othersY, n) === arcPointToWorldOnCurve(A, B, arcs, ap).
 */
function evalCurveAtT(
  A: Point,
  B: Point,
  t: number,
  offset: number,
  othersX: number,
  othersY: number,
  n: number
): Point {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return { x: A.x, y: A.y };
  const nx = -dy / len;
  const ny = dx / len;
  const baseX = A.x + t * dx;
  const baseY = A.y + t * dy;
  const ourChordX = baseX + offset * nx;
  const ourChordY = baseY + offset * ny;
  const cx = (othersX + ourChordX) / n;
  const cy = (othersY + ourChordY) / n;
  const u = 1 - t;
  return {
    x: u * u * A.x + 2 * u * t * cx + t * t * B.x,
    y: u * u * A.y + 2 * u * t * cy + t * t * B.y,
  };
}

/**
 * Inverse of arcPointToWorldOnCurve: given target world position, compute { t, offset } for the arcpoint.
 * Uses iterative search along the curve (not chord projection) — for strongly curved arcs, chord projection
 * gives wrong t, causing snap/link jumps. Search minimizes distance B(t) to targetWorld.
 */
export function worldToArcPointOnCurve(
  A: Point,
  B: Point,
  arcPoints: ArcPoint[],
  arcPoint: ArcPoint,
  targetWorld: Point
): { t: number; offset: number } {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return { t: 0.5, offset: 0 };

  let othersX = 0;
  let othersY = 0;
  for (const ap of arcPoints) {
    if (ap.id === arcPoint.id) continue;
    const p = arcPointToWorld(A, B, ap);
    othersX += p.x;
    othersY += p.y;
  }
  const n = arcPoints.length;

  let bestT = 0.5;
  let bestDist = Infinity;

  // Coarse sampling t ∈ [0.01, 0.99]
  for (let i = 1; i <= 99; i++) {
    const t = i / 100;
    const offset = solveOffsetForTarget(A, B, t, othersX, othersY, n, targetWorld);
    const pos = evalCurveAtT(A, B, t, offset, othersX, othersY, n);
    const d = (pos.x - targetWorld.x) ** 2 + (pos.y - targetWorld.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }

  // Refine around bestT
  for (let i = -10; i <= 10; i++) {
    const t = Math.max(0.01, Math.min(0.99, bestT + i / 1000));
    const offset = solveOffsetForTarget(A, B, t, othersX, othersY, n, targetWorld);
    const pos = evalCurveAtT(A, B, t, offset, othersX, othersY, n);
    const d = (pos.x - targetWorld.x) ** 2 + (pos.y - targetWorld.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }

  const finalOffset = solveOffsetForTarget(A, B, bestT, othersX, othersY, n, targetWorld);
  return { t: bestT, offset: finalOffset };
}

/**
 * Validate forward/inverse consistency: arcPointToWorldOnCurve → worldToArcPointOnCurve → arcPointToWorldOnCurve
 * should return the same point within 0.01px. Call in dev to verify evalCurveAtT matches arcPointToWorldOnCurve.
 */
export function validateArcPointRoundtrip(
  A: Point,
  B: Point,
  arcPoints: ArcPoint[],
  arcPoint: ArcPoint,
  tolerance = 0.01
): { ok: boolean; error: number } {
  const world = arcPointToWorldOnCurve(A, B, arcPoints, arcPoint);
  const { t, offset } = worldToArcPointOnCurve(A, B, arcPoints, arcPoint, world);
  const back = arcPointToWorldOnCurve(A, B, arcPoints, { ...arcPoint, t, offset });
  const err = distance(world, back);
  return { ok: err < tolerance, error: err };
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
 * Draw a curved edge using quadratic Bézier — same as single-point case.
 * One segment A→B with control = centroid of arc points. Ends exactly at vertices.
 */
export function drawCurvedEdge(
  ctx: CanvasRenderingContext2D,
  A: Point,
  B: Point,
  arcPoints: ArcPoint[],
  worldToScreen: (x: number, y: number) => Point,
  _prev?: Point,
  _next?: Point
): void {
  const sorted = [...arcPoints].sort((a, b) => a.t - b.t);

  let cx = 0, cy = 0;
  for (const ap of sorted) {
    const p = arcPointToWorld(A, B, ap);
    cx += p.x;
    cy += p.y;
  }
  cx /= sorted.length;
  cy /= sorted.length;

  const sControl = worldToScreen(cx, cy);
  const sB = worldToScreen(B.x, B.y);
  ctx.quadraticCurveTo(sControl.x, sControl.y, sB.x, sB.y);
}

// ── Sampling ─────────────────────────────────────────────────

/**
 * Sample an arc edge into N points. Uses quadratic Bézier (same as drawCurvedEdge).
 */
export function sampleArcEdge(
  A: Point,
  B: Point,
  arcPoints: ArcPoint[],
  numSamples = 32,
  _prev?: Point,
  _next?: Point
): Point[] {
  const sorted = [...arcPoints].sort((a, b) => a.t - b.t);

  let cx = 0, cy = 0;
  for (const ap of sorted) {
    const p = arcPointToWorld(A, B, ap);
    cx += p.x;
    cy += p.y;
  }
  cx /= sorted.length;
  cy /= sorted.length;

  const result: Point[] = [A];
  for (let k = 1; k < numSamples; k++) {
    const t = k / numSamples;
    const u = 1 - t;
    result.push({
      x: u * u * A.x + 2 * u * t * cx + t * t * B.x,
      y: u * u * A.y + 2 * u * t * cy + t * t * B.y,
    });
  }
  result.push(B);
  return result;
}

/**
 * Tangent directions (degrees, [0,360)) along the shape outline: straight edges use chord bearing;
 * curved edges add a few tangent samples so snap matches the visible boundary, not the chord.
 * Computed once per pattern-rotate gesture — O(edges × samples) with small constants.
 */
export function collectShapeBoundaryDirectionAnglesDeg(shape: Shape): number[] {
  const pts = shape.points;
  const n = pts.length;
  if (n < 3 || !shape.closed) return [];
  const edgeArcs = shape.edgeArcs;
  const out: number[] = [];
  const pushLine = (deg: number) => {
    const d = ((deg % 360) + 360) % 360;
    for (const x of out) {
      if (undirectedLineAngleDistanceDeg(x, d) < 0.45) return;
    }
    out.push(d);
  };

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const A = pts[i]!;
    const B = pts[j]!;
    const arcs = edgeArcs?.[i];
    if (!arcs || arcs.length === 0) {
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      if (dx * dx + dy * dy < 1e-12) continue;
      pushLine((Math.atan2(dy, dx) * 180) / Math.PI);
    } else {
      const prev = pts[(i - 1 + n) % n]!;
      const next = pts[(j + 1) % n]!;
      const sampled = sampleArcEdge(A, B, arcs, 16, prev, next);
      if (sampled.length < 2) continue;
      const last = sampled.length - 2;
      const idxs = [0, Math.floor(last / 2), last];
      for (const k of idxs) {
        const p0 = sampled[k]!;
        const p1 = sampled[k + 1]!;
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        if (dx * dx + dy * dy < 1e-12) continue;
        pushLine((Math.atan2(dy, dx) * 180) / Math.PI);
      }
    }
  }
  return out;
}

/**
 * Sample arc for frame placement: positions along arc spaced by stepPx, with tangent at each.
 * Returns array of { pos, tangent } for placing blocks along the curve (joints widen naturally).
 */
export function sampleArcEdgeForFrame(
  A: Point,
  B: Point,
  arcPoints: ArcPoint[],
  stepPx: number,
  pieceLengthPx: number
): { pos: Point; tangent: Point }[] {
  const sorted = [...arcPoints].sort((a, b) => a.t - b.t);
  let cx = 0, cy = 0;
  for (const ap of sorted) {
    const p = arcPointToWorld(A, B, ap);
    cx += p.x;
    cy += p.y;
  }
  cx /= sorted.length;
  cy /= sorted.length;

  const numSamples = 100;
  const pts: Point[] = [];
  const tangents: Point[] = [];
  const lengths: number[] = [0];
  for (let k = 0; k <= numSamples; k++) {
    const t = k / numSamples;
    const u = 1 - t;
    pts.push({
      x: u * u * A.x + 2 * u * t * cx + t * t * B.x,
      y: u * u * A.y + 2 * u * t * cy + t * t * B.y,
    });
    const tx = 2 * (u * (cx - A.x) + t * (B.x - cx));
    const ty = 2 * (u * (cy - A.y) + t * (B.y - cy));
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    tangents.push({ x: tx / tl, y: ty / tl });
    if (k > 0) {
      lengths.push(lengths[lengths.length - 1] + distance(pts[k - 1], pts[k]));
    }
  }
  const totalLen = lengths[lengths.length - 1];
  if (totalLen < 1e-9) return [];

  const result: { pos: Point; tangent: Point }[] = [];
  let dist = pieceLengthPx / 2;
  while (dist < totalLen - pieceLengthPx / 2 - 1e-6) {
    let i = 0;
    while (i < lengths.length - 1 && lengths[i + 1] < dist) i++;
    const t0 = lengths[i];
    const t1 = lengths[i + 1];
    const frac = t1 > t0 ? (dist - t0) / (t1 - t0) : 0;
    const pos = {
      x: pts[i].x + frac * (pts[i + 1].x - pts[i].x),
      y: pts[i].y + frac * (pts[i + 1].y - pts[i].y),
    };
    const tangent = {
      x: tangents[i].x + frac * (tangents[i + 1].x - tangents[i].x),
      y: tangents[i].y + frac * (tangents[i + 1].y - tangents[i].y),
    };
    const tl = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y) || 1;
    result.push({ pos, tangent: { x: tangent.x / tl, y: tangent.y / tl } });
    dist += stepPx;
  }
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
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(j + 1) % n];
      const sampled = sampleArcEdge(pts[i], pts[j], arcs, 48, prev, next);
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
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(j + 1) % n];
      const sampled = sampleArcEdge(pts[i], pts[j], arcs, 48, prev, next);
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

export interface ArcPointCacheEntry {
  si: number;
  ei: number;
  ap: ArcPoint;
  pos: Point;
}

/**
 * Build cache of arc point positions (on curve) for fast snap lookup.
 * Rebuild when shapes change.
 */
export function buildArcPointPositionCache(
  shapes: Shape[],
  isOnActiveLayer?: (si: number) => boolean
): ArcPointCacheEntry[] {
  const out: ArcPointCacheEntry[] = [];
  for (let si = 0; si < shapes.length; si++) {
    if (isOnActiveLayer && !isOnActiveLayer(si)) continue;
    const shape = shapes[si];
    const pts = shape.points;
    const edgeCount = shape.closed ? pts.length : pts.length - 1;

    for (let ei = 0; ei < edgeCount; ei++) {
      const arcs = shape.edgeArcs?.[ei];
      if (!arcs || arcs.length === 0) continue;

      const edgeA = pts[ei];
      const edgeB = pts[(ei + 1) % pts.length];

      for (const ap of arcs) {
        const pos = arcPointToWorldOnCurve(edgeA, edgeB, arcs, ap);
        out.push({ si, ei, ap, pos });
      }
    }
  }
  return out;
}

/**
 * Snap arc point to nearby arc points when dragging (any edge, any shape).
 * Element A edge → element B edge: magnet aligns arcpoints at same world position on curve.
 * @param targetWorld - where user wants to drag (cursor); used for unlock check so snap releases when cursor moves away
 * @param cache - optional precomputed positions; when provided, uses cache instead of iterating shapes
 */
export function snapArcPoint(
  A: Point,
  B: Point,
  currentT: number,
  currentOffset: number,
  currentArcs: ArcPoint[],
  shapes: Shape[],
  excludeArcId: string,
  threshold: number,
  isOnActiveLayer?: (si: number) => boolean,
  cache?: ArcPointCacheEntry[],
  lockedTarget?: { si: number; ei: number; arcId: string } | null,
  targetWorld?: Point
): { t: number; offset: number; didSnap: boolean; bestTarget?: Point; lockedTarget?: { si: number; ei: number; arcId: string } } {
  const callerEdge = (globalThis as any).__arcSnapCallerEdge as { si: number; ei: number } | undefined;
  const currentAp = { id: excludeArcId, t: currentT, offset: currentOffset };
  const currentWorld = arcPointToWorldOnCurve(A, B, currentArcs, currentAp);
  let bestDist = threshold;
  let bestTarget: Point | null = null;
  let bestTargetAp: ArcPoint | null = null;
  let bestTargetSi = -1;
  let bestTargetEi = -1;

  const entries = cache ?? buildArcPointPositionCache(shapes, isOnActiveLayer);
  const unlockThreshold = threshold;

  if (lockedTarget) {
    const lockedEntry = entries.find((e) => e.si === lockedTarget.si && e.ei === lockedTarget.ei && e.ap.id === lockedTarget.arcId);
    if (lockedEntry) {
      const d = (targetWorld ? distance(targetWorld, lockedEntry.pos) : distance(currentWorld, lockedEntry.pos));
      if (d <= unlockThreshold) {
        bestTarget = lockedEntry.pos;
        bestTargetAp = lockedEntry.ap;
        bestTargetSi = lockedEntry.si;
        bestTargetEi = lockedEntry.ei;
        bestDist = d;
      }
    }
  }

  if (!bestTarget || !bestTargetAp) {
    for (const { si, ei, ap, pos } of entries) {
      if (ap.id === excludeArcId) continue;
      const d = distance(currentWorld, pos);
      if (d < bestDist) {
        bestDist = d;
        bestTarget = pos;
        bestTargetAp = ap;
        bestTargetSi = si;
        bestTargetEi = ei;
      }
    }
  }

  if (bestTarget && bestTargetAp) {
    const sameEdge = callerEdge && bestTargetSi === callerEdge.si && bestTargetEi === callerEdge.ei;
    const res = sameEdge
      ? { t: bestTargetAp.t, offset: bestTargetAp.offset }
      : worldToArcPointOnCurve(A, B, currentArcs, currentAp, bestTarget);
    return { t: res.t, offset: res.offset, didSnap: true, bestTarget, lockedTarget: { si: bestTargetSi, ei: bestTargetEi, arcId: bestTargetAp.id } };
  }
  return { t: currentT, offset: currentOffset, didSnap: false };
}

// ── Arc Handles Drawing ──────────────────────────────────────

type WorldToScreen = (wx: number, wy: number) => Point;

/**
 * Hit test arc point: returns the arc point if mouse (world coords) is within threshold of its handle.
 * Uses position on curve so hit test matches the visible handle.
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
    const world = arcPointToWorldOnCurve(A, B, arcPoints, ap);
    const d = distance(wp, world);
    if (d <= threshold) return ap;
  }
  return null;
}

/**
 * Draw arc point handles when shape is selected.
 * Dashed line from base (on straight edge) to arc point on curve, small circle at arc point.
 * Handle is drawn ON the arc curve so it follows the line when the shape moves.
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
    const world = arcPointToWorldOnCurve(A, B, arcPoints, ap);
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
