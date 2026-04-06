// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — linearElements.ts
// Thick polyline rendering for fence, wall, kerb, foundation
// ══════════════════════════════════════════════════════════════

import {
  Point,
  ArcPoint,
  Shape,
  ElementType,
  distance,
  toPixels,
  toMeters,
  formatLength,
  midpoint,
  angleDeg,
  centroid,
  polylineLengthMeters,
  readableTextAngle,
  C,
} from "./geometry";
import { drawAlternatingLinkedHalf } from "./linkedEdgeDrawing";
import {
  sampleArcEdge,
  calcEdgeLengthWithArcs,
  sampleArcEdgeLeftToCenterline,
  mirrorArcPointsToOppositeChord,
  mirrorArcPointsParallelStripChord,
} from "./arcMath";

// ── Helpers ───────────────────────────────────────────────────

export function isLinearElement(shape: Shape): boolean {
  return shape.elementType !== "polygon" && shape.elementType !== "pathSlabs" && shape.elementType !== "pathConcreteSlabs" && shape.elementType !== "pathMonoblock";
}

export function isPathElement(shape: Shape): boolean {
  return shape.elementType === "pathSlabs" || shape.elementType === "pathConcreteSlabs" || shape.elementType === "pathMonoblock";
}

export const GROUNDWORK_LINEAR_TYPES = ["drainage", "canalPipe", "waterPipe", "cable"] as const;
export type GroundworkLinearType = typeof GROUNDWORK_LINEAR_TYPES[number];
export function isGroundworkLinear(shape: Shape): boolean {
  return GROUNDWORK_LINEAR_TYPES.includes(shape.elementType as GroundworkLinearType);
}

const GROUNDWORK_LABELS: Record<GroundworkLinearType, string> = {
  drainage: "Drainage",
  canalPipe: "Canal Pipe",
  waterPipe: "Water Pipe",
  cable: "Cable",
};

export function groundworkLabel(shape: Shape): string {
  return isGroundworkLinear(shape) ? (GROUNDWORK_LABELS[shape.elementType as GroundworkLinearType] ?? "Groundwork") : "Groundwork";
}

/** Wall, kerb, foundation — stored as polygon outline. Fence and groundwork stay polyline. */
export function isPolygonLinearElement(shape: Shape): boolean {
  return shape.elementType === "wall" || shape.elementType === "kerb" || shape.elementType === "foundation";
}

export function linearElementColor(elementType: ElementType): string {
  switch (elementType) {
    case "fence": return C.fence;
    case "wall": return C.wall;
    case "kerb": return C.kerb;
    case "foundation": return C.foundation;
    case "drainage": return C.drainage;
    case "canalPipe": return C.canalPipe;
    case "waterPipe": return C.waterPipe;
    case "cable": return C.cable;
    default: return C.layer2Edge;
  }
}

function linearElementDimColor(elementType: ElementType): string {
  switch (elementType) {
    case "fence": return C.fenceDim;
    case "wall": return C.wallDim;
    case "kerb": return C.kerbDim;
    case "foundation": return C.foundationDim;
    case "drainage": return C.drainageDim;
    case "canalPipe": return C.canalPipeDim;
    case "waterPipe": return C.waterPipeDim;
    case "cable": return C.cableDim;
    default: return C.inactiveShape;
  }
}

// ── Thick Polyline ────────────────────────────────────────────

// 2D cross product: a.x*b.y - a.y*b.x
function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Max distance from centerline vertex to miter corner, as a multiple of half stroke width (px).
 * Lower values shorten long miter spikes at very sharp path angles (walls/paths). 14 allowed spikes
 * ~7× full width from the vertex; 5 keeps corners tight with negligible gaps at typical wall bends.
 * Beyond limit we still use {@link miterClipRadial} instead of a square bevel so the ribbon stays closed.
 */
const THICK_POLYLINE_MITER_LIMIT_MULT = 5;

/** If miter lies farther than `limit` from `curr`, move it along curr→miter to distance `limit` (SVG-style miter limit). */
function miterClipRadial(curr: Point, miter: Point, limit: number): Point {
  const ddx = miter.x - curr.x;
  const ddy = miter.y - curr.y;
  const dist = Math.sqrt(ddx * ddx + ddy * ddy);
  if (dist <= limit || dist < 1e-14) return { x: miter.x, y: miter.y };
  const s = limit / dist;
  return { x: curr.x + ddx * s, y: curr.y + ddy * s };
}

/** Miter join at corner curr with incoming prev→curr and outgoing curr→next (same math as interior of computeThickPolyline). */
function miterOffsetsAtCorner(prev: Point, curr: Point, next: Point, half: number, miterLimit: number): { left: Point; right: Point } {
  const d1x = curr.x - prev.x;
  const d1y = curr.y - prev.y;
  const d2x = next.x - curr.x;
  const d2y = next.y - curr.y;
  const l1 = Math.sqrt(d1x * d1x + d1y * d1y);
  const l2 = Math.sqrt(d2x * d2x + d2y * d2y);
  if (l1 < 0.001 || l2 < 0.001) {
    const nx = l1 > 0.001 ? -d1y / l1 : 0;
    const ny = l1 > 0.001 ? d1x / l1 : 0;
    return {
      left: { x: curr.x + nx * half, y: curr.y + ny * half },
      right: { x: curr.x - nx * half, y: curr.y - ny * half },
    };
  }
  const n1x = -d1y / l1;
  const n1y = d1x / l1;
  const n2x = -d2y / l2;
  const n2y = d2x / l2;
  const p1 = { x: prev.x + n1x * half, y: prev.y + n1y * half };
  const p2 = { x: curr.x + n2x * half, y: curr.y + n2y * half };
  const dir1 = { x: d1x / l1, y: d1y / l1 };
  const dir2 = { x: d2x / l2, y: d2y / l2 };
  const denom = cross(dir1, dir2);
  if (Math.abs(denom) < 0.0001) {
    return {
      left: { x: curr.x + n1x * half, y: curr.y + n1y * half },
      right: { x: curr.x - n1x * half, y: curr.y - n1y * half },
    };
  }
  const diff = { x: p2.x - p1.x, y: p2.y - p1.y };
  const t = cross(diff, dir2) / denom;
  let miterLeft = { x: p1.x + t * dir1.x, y: p1.y + t * dir1.y };
  const distLeft = Math.sqrt((miterLeft.x - curr.x) ** 2 + (miterLeft.y - curr.y) ** 2);
  if (distLeft > miterLimit) {
    miterLeft = miterClipRadial(curr, miterLeft, miterLimit);
  }
  const r1 = { x: prev.x - n1x * half, y: prev.y - n1y * half };
  const r2 = { x: curr.x - n2x * half, y: curr.y - n2y * half };
  const rdiff = { x: r2.x - r1.x, y: r2.y - r1.y };
  const tr = cross(rdiff, dir2) / denom;
  let miterRight = { x: r1.x + tr * dir1.x, y: r1.y + tr * dir1.y };
  const distRight = Math.sqrt((miterRight.x - curr.x) ** 2 + (miterRight.y - curr.y) ** 2);
  if (distRight > miterLimit) {
    miterRight = miterClipRadial(curr, miterRight, miterLimit);
  }
  return { left: miterLeft, right: miterRight };
}

/**
 * Compute polygon outline for a thick polyline.
 * Offset each segment by +/- thickness/2 along normals, with proper miter joins at corners.
 */
/**
 * Path ribbon footprint: same polygon used for canvas fill, Layer 5 booleans, slab pattern clip, and labels.
 * - `pathIsOutline`: `shape.points` is the stored outline (e.g. from {@link computePathOutlineFromSegmentSides}).
 * - Otherwise: centerline in `shape.points`; closed loops use {@link computeThickPolylineClosed} so the seam
 *   matches the drawn band (open polylines still use {@link computeThickPolyline}).
 */
export function computePathFillOutline(shape: Shape): Point[] {
  const pts = shape.points;
  if (pts.length < 2) return [];
  if (shape.calculatorInputs?.pathIsOutline) {
    return pts;
  }
  const pathWidthM = Number(shape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6;
  const thicknessPx = toPixels(pathWidthM);
  return computePathRibbonOutlineFromCenterline(pts, !!shape.closed, thicknessPx);
}

/** @see {@link computePathFillOutline} */
export function getPathPolygon(shape: Shape): Point[] {
  return computePathFillOutline(shape);
}

/**
 * For `pathIsOutline` closed paths, ribbon centerline = midpoints of outline (same ring as {@link getPathPolygon}).
 * Prefer this over `pathCenterline` / `pathCenterlineOriginal` in inputs when those can lag behind `shape.points`.
 */
export function getPathRibbonDerivedCenterline(shape: Shape): Point[] | null {
  if (!shape.calculatorInputs?.pathIsOutline || !shape.closed) return null;
  const outline = getPathPolygon(shape);
  if (outline.length < 3) return null;
  const cl = extractPathRibbonCenterlineFromOutline(outline);
  return cl.length >= 2 ? cl : null;
}

/** Pad/trim `pathSegmentSides` to `nSeg` segments (pad with last side, else `"left"`). */
export function ensurePathSegmentSidesForSegments(
  nSeg: number,
  sides: ("left" | "right")[] | undefined,
): ("left" | "right")[] {
  if (nSeg < 1) return [];
  if (!Array.isArray(sides) || sides.length === 0) {
    return Array.from({ length: nSeg }, () => "left" as const);
  }
  if (sides.length === nSeg) return [...sides];
  if (sides.length > nSeg) return sides.slice(0, nSeg);
  const pad = sides[sides.length - 1] ?? "left";
  return [...sides, ...Array.from({ length: nSeg - sides.length }, () => pad)];
}

/**
 * Closed centerline loop (no repeated first vertex): one miter per corner, same outline format as open thick polyline
 * [left0..left_n, right_n..right0] with n = vertex count (duplicate of left0/right0 at end for indexing).
 */
export function computeThickPolylineClosed(points: Point[], thicknessPx: number): Point[] {
  const V = points.length;
  if (V < 3) return [];
  const half = thicknessPx / 2;
  const MITER_LIMIT = half * THICK_POLYLINE_MITER_LIMIT_MULT;
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < V; i++) {
    const prev = points[(i - 1 + V) % V];
    const curr = points[i];
    const next = points[(i + 1) % V];
    const { left: L, right: R } = miterOffsetsAtCorner(prev, curr, next, half, MITER_LIMIT);
    left.push(L);
    right.push(R);
  }
  left.push({ ...left[0] });
  right.push({ ...right[0] });
  const result: Point[] = [...left];
  for (let i = right.length - 1; i >= 0; i--) {
    result.push(right[i]);
  }
  return result;
}

/**
 * Centerline + width → ribbon outline. Closed paths (≥3 vertices) use the same closed-strip miters as walls;
 * open paths use the open thick polyline.
 */
function computePathRibbonOutlineFromCenterline(points: Point[], closed: boolean, thicknessPx: number): Point[] {
  if (points.length < 2) return [];
  if (closed && points.length >= 3) {
    return computeThickPolylineClosed(points, thicknessPx);
  }
  return computeThickPolyline(points, thicknessPx);
}

// ── Closed strip outline ↔ centerline (inverse / snap solver) ─────────────
//
// computeThickPolylineClosed produces outline length 2V+2:
//   left[0..V] + right[V]..right[0], with left[V]≡left[0], right[V]≡right[0].
// Any outline vertex is a miter point (left or right) for corner k∈{0..V-1}.

const STRIP_SOLVER_TOL = 1e-5;
const STRIP_SOLVER_MAX_ITER = 28;
const STRIP_SOLVER_EPS = 1e-7;

function miterPointForSide(
  prev: Point,
  curr: Point,
  next: Point,
  half: number,
  miterLimit: number,
  side: "left" | "right",
): Point {
  const { left, right } = miterOffsetsAtCorner(prev, curr, next, half, miterLimit);
  return side === "left" ? left : right;
}

/** @returns det, or null if singular */
function solve2x2(a: number, b: number, c: number, d: number, ex: number, ey: number): { x: number; y: number } | null {
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-14) return null;
  return {
    x: (d * ex - b * ey) / det,
    y: (-c * ex + a * ey) / det,
  };
}

/**
 * Move centerline vertex `curr` so that the chosen miter (left/right) at that corner hits `target`.
 * Newton + line search; falls back to best iterate if Jacobian is ill-conditioned.
 */
export function solveCenterVertexForMiterTarget(
  prev: Point,
  curr: Point,
  next: Point,
  target: Point,
  side: "left" | "right",
  half: number,
  miterLimit: number,
): Point {
  let c = { x: curr.x, y: curr.y };
  let best = { ...c };
  let bestErr = Infinity;

  for (let iter = 0; iter < STRIP_SOLVER_MAX_ITER; iter++) {
    const p = miterPointForSide(prev, c, next, half, miterLimit, side);
    const rx = p.x - target.x;
    const ry = p.y - target.y;
    const err = rx * rx + ry * ry;
    if (err < bestErr) {
      bestErr = err;
      best = { ...c };
    }
    if (err < STRIP_SOLVER_TOL * STRIP_SOLVER_TOL) return c;

    const eps = STRIP_SOLVER_EPS;
    const J00 = (miterPointForSide(prev, { x: c.x + eps, y: c.y }, next, half, miterLimit, side).x - p.x) / eps;
    const J01 = (miterPointForSide(prev, { x: c.x, y: c.y + eps }, next, half, miterLimit, side).x - p.x) / eps;
    const J10 = (miterPointForSide(prev, { x: c.x + eps, y: c.y }, next, half, miterLimit, side).y - p.y) / eps;
    const J11 = (miterPointForSide(prev, { x: c.x, y: c.y + eps }, next, half, miterLimit, side).y - p.y) / eps;

    const step = solve2x2(J00, J01, J10, J11, -rx, -ry);
    let sx: number;
    let sy: number;
    if (step) {
      sx = step.x;
      sy = step.y;
    } else {
      const alphaGd = 0.25;
      sx = alphaGd * (J00 * rx + J10 * ry);
      sy = alphaGd * (J01 * rx + J11 * ry);
    }

    let accepted = false;
    for (let ls = 0, damp = 1; ls < 12; ls++, damp *= 0.5) {
      const trial = { x: c.x + damp * sx, y: c.y + damp * sy };
      const pT = miterPointForSide(prev, trial, next, half, miterLimit, side);
      const e = (pT.x - target.x) ** 2 + (pT.y - target.y) ** 2;
      if (e < err) {
        c = trial;
        accepted = true;
        break;
      }
    }
    if (!accepted) {
      c = { x: c.x + 0.05 * sx, y: c.y + 0.05 * sy };
    }
  }
  return best;
}

/** Outline length n = 2V+2 for V≥2. Maps vertex index to logical corner and left/right chain. */
export function closedStripOutlineVertexToCorner(n: number, vertexIdx: number): { corner: number; side: "left" | "right" } | null {
  if (n < 6 || n % 2 !== 0 || vertexIdx < 0 || vertexIdx >= n) return null;
  const V = (n - 2) / 2;
  if (vertexIdx <= V) {
    const corner = vertexIdx < V ? vertexIdx : 0;
    return { corner, side: "left" };
  }
  const j = vertexIdx - (V + 1);
  const corner = ((V - j) % V + V) % V;
  return { corner, side: "right" };
}

/** Midpoint pairing for a valid closed strip (same indexing as computeThickPolylineClosed output). */
export function extractCenterlineFromClosedStripOutline(outline: Point[]): Point[] | null {
  const n = outline.length;
  if (n < 6 || n % 2 !== 0) return null;
  const V = (n - 2) / 2;
  const center: Point[] = [];
  for (let k = 0; k < V; k++) {
    const L = outline[k];
    const R = outline[2 * V + 1 - k];
    center.push(midpoint(L, R));
  }
  return center;
}

/**
 * Path slab pattern uses pathCenterline + pathSegmentSides — vertex count must match outline layout.
 * Wall strip (2V+2 duplicate seam) vs flat path ribbon (2V): wrong extractor gives wrong V (e.g. 8 pts → 3 vs 4 centers).
 */
export function extractPathRibbonCenterlineFromOutline(outline: Point[]): Point[] {
  if (isClosedStripPolygonOutline(outline)) {
    return extractCenterlineFromClosedStripOutline(outline) ?? [];
  }
  return extractCenterlineFromOpenStripOutline(outline);
}

/** Path closed outline layout 2V: [L0..L_{V-1}, R_{V-1}..R0] → centerline corner index (0..V-1). */
export function pathRibbonOutlineVertexToCenterCorner(vertexIdx: number, V: number): number | null {
  if (V < 2 || vertexIdx < 0 || vertexIdx >= 2 * V) return null;
  if (vertexIdx < V) return vertexIdx;
  return V - 1 - (vertexIdx - V);
}

/** Outer corners of computePathOutlineFromSegmentSides for V=4 (not mid-edge offset points 1,2,5,6). */
export const PATH_CLOSED_RIBBON_RECT_CORNER_OUTLINE_INDICES: readonly number[] = [0, 3, 4, 7];

/**
 * Map a dragged vertex of a legacy 4-point closed path ribbon quad to the correct 8-point outline index.
 * Uses a full permutation over the four geometric corners so we never snap to mid-edge outline vertices.
 */
export function mapPairFourToRectRibbonOutlineVertex(quadPts: Point[], o8: Point[], draggedPi: number): number | null {
  if (quadPts.length !== 4 || o8.length !== 8 || draggedPi < 0 || draggedPi > 3) return null;
  const ci = PATH_CLOSED_RIBBON_RECT_CORNER_OUTLINE_INDICES;
  const corners: Point[] = ci.map(i => o8[i]!);
  let bestCost = Infinity;
  let bestPerm: number[] | null = null;
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      if (b === a) continue;
      for (let c = 0; c < 4; c++) {
        if (c === a || c === b) continue;
        for (let d = 0; d < 4; d++) {
          if (d === a || d === b || d === c) continue;
          const perm = [a, b, c, d];
          let cost = 0;
          for (let i = 0; i < 4; i++) cost += distance(quadPts[i]!, corners[perm[i]!]!);
          if (cost < bestCost) {
            bestCost = cost;
            bestPerm = perm;
          }
        }
      }
    }
  }
  if (!bestPerm) return null;
  const span = Math.max(
    distance(quadPts[0]!, quadPts[1]!),
    distance(quadPts[1]!, quadPts[2]!),
    distance(quadPts[2]!, quadPts[3]!),
    distance(quadPts[3]!, quadPts[0]!),
  );
  if (!(span > 1e-9) || bestCost > span * 2.25) return null;
  return ci[bestPerm[draggedPi]!]!;
}

function lineIntersectOpen(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): Point | null {
  const rdx = bx - ax, rdy = by - ay;
  const sdx = dx - cx, sdy = dy - cy;
  const denom = rdx * sdy - rdy * sdx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((cx - ax) * sdy - (cy - ay) * sdx) / denom;
  return { x: ax + t * rdx, y: ay + t * rdy };
}

function inwardNormalForEdge(A: Point, B: Point, interior: Point): { nx: number; ny: number } {
  const ex = B.x - A.x;
  const ey = B.y - A.y;
  const len = Math.hypot(ex, ey);
  if (len < 1e-9) return { nx: 0, ny: 0 };
  let nx = -ey / len;
  let ny = ex / len;
  const mx = (A.x + B.x) / 2;
  const my = (A.y + B.y) / 2;
  if (nx * (interior.x - mx) + ny * (interior.y - my) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

/** True iff four vertices form a simple strictly convex loop in stored order (no bow-tie). */
function isConvexQuadInOrder(quad: Point[]): boolean {
  if (quad.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    const c = quad[(i + 2) % 4]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const el = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
    if (el < 1e-18 || Math.abs(cross) < 1e-12 * el) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

function quadMinEdgeLen(quad: Point[]): number {
  let m = Infinity;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % quad.length]!;
    m = Math.min(m, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return m;
}

/** Inset one cyclic order of a 4-point ribbon outline; no convex requirement on input (pair4 order may be L0,L1,R1,R0). */
function recoverInnerCenterlineFromQuadOrder(quad: Point[], halfWidthPx: number): Point[] | null {
  if (quad.length !== 4 || halfWidthPx <= 1e-6) return null;
  const span = Math.max(
    distance(quad[0]!, quad[1]!),
    distance(quad[1]!, quad[2]!),
    distance(quad[2]!, quad[3]!),
    distance(quad[3]!, quad[0]!),
  );
  if (!(span > 1e-6)) return null;
  const c = centroid(quad);
  const inner: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const prev = quad[(i + 3) % 4]!;
    const curr = quad[i]!;
    const next = quad[(i + 1) % 4]!;
    const nPrev = inwardNormalForEdge(prev, curr, c);
    const nNext = inwardNormalForEdge(curr, next, c);
    const dPrevX = curr.x - prev.x;
    const dPrevY = curr.y - prev.y;
    const dNextX = next.x - curr.x;
    const dNextY = next.y - curr.y;
    const p1 = { x: curr.x + nPrev.nx * halfWidthPx, y: curr.y + nPrev.ny * halfWidthPx };
    const p2 = { x: p1.x + dPrevX, y: p1.y + dPrevY };
    const q1 = { x: curr.x + nNext.nx * halfWidthPx, y: curr.y + nNext.ny * halfWidthPx };
    const q2 = { x: q1.x + dNextX, y: q1.y + dNextY };
    const isect = lineIntersectOpen(p1.x, p1.y, p2.x, p2.y, q1.x, q1.y, q2.x, q2.y);
    if (!isect) return null;
    inner.push(isect);
  }
  if (!isConvexQuadInOrder(inner)) return null;
  if (quadMinEdgeLen(inner) < span * 1e-4) return null;
  return inner;
}

function rotateQuadIndices(quad: Point[], start: number): Point[] {
  return [0, 1, 2, 3].map(j => quad[(start + j) % 4]!);
}

/**
 * When pathIsOutline was corrupted to 2-point "centerline" (pair4 extract), rebuild 4 centerline
 * corners by insetting the 4-vertex ribbon quad by half path width (px). Enables rect ribbon solver.
 * Tries cyclic shifts and reversed winding — stored vertex order is not always convex CCW.
 */
export function recoverCenterlineQuadFromPairFourRibbonOutline(quad: Point[], halfWidthPx: number): Point[] | null {
  if (quad.length !== 4 || halfWidthPx <= 1e-6) return null;
  const variants: Point[][] = [];
  for (let s = 0; s < 4; s++) variants.push(rotateQuadIndices(quad, s));
  const rev = [quad[0]!, quad[3]!, quad[2]!, quad[1]!];
  for (let s = 0; s < 4; s++) variants.push(rotateQuadIndices(rev, s));
  for (const q of variants) {
    const inner = recoverInnerCenterlineFromQuadOrder(q, halfWidthPx);
    if (inner) return inner;
  }
  return null;
}

/**
 * Rebuild a closed thick-strip polygon so outline[vertexIdx] lies on `target` (after snap),
 * holding other centerline vertices fixed and preserving material thickness (miter join).
 * Returns null if outline is not a closed strip or solver cannot improve geometry.
 */
export function rebuildClosedStripOutlineFromVertexTarget(
  outline: Point[],
  vertexIdx: number,
  target: Point,
  thicknessPx: number,
): Point[] | null {
  const n = outline.length;
  const meta = closedStripOutlineVertexToCorner(n, vertexIdx);
  if (!meta) {
    return null;
  }
  const center = extractCenterlineFromClosedStripOutline(outline);
  if (!center || center.length < 3) {
    return null;
  }
  const V = center.length;
  const k = meta.corner;
  if (k < 0 || k >= V) return null;

  const half = thicknessPx / 2;
  const miterLimit = half * THICK_POLYLINE_MITER_LIMIT_MULT;
  const prev = center[(k - 1 + V) % V];
  const next = center[(k + 1) % V];
  const curr0 = center[k];

  const solved = solveCenterVertexForMiterTarget(prev, curr0, next, target, meta.side, half, miterLimit);
  const nextCenter = [...center];
  nextCenter[k] = solved;
  const rebuilt = computeThickPolylineClosed(nextCenter, thicknessPx);
  if (rebuilt.length !== n) {
    return null;
  }
  return rebuilt;
}

/**
 * Edge-drag on a closed strip wall/kerb outline: moving two consecutive perimeter vertices along only one
 * chain (e.g. left) desynchronizes the opposite chain — grips drift from the gray fill. This translates
 * the corresponding centerline segment by the same delta as the edge endpoints, then rebuilds the strip.
 * Caps ({@link polygonEdgeToSegmentIndex} returns -1) fall through to raw vertex moves in the caller.
 */
export function rebuildClosedStripOutlineAfterEdgeTranslate(
  outline: Point[],
  edgeIdx: number,
  delta: Point,
  thicknessPx: number,
): Point[] | null {
  if (!isClosedStripPolygonOutline(outline)) {
    return null;
  }
  const seg = polygonEdgeToSegmentIndex(outline, edgeIdx);
  if (seg < 0) {
    return null;
  }
  const center = extractCenterlineFromClosedStripOutline(outline);
  if (!center || center.length < 3) return null;
  const V = center.length;
  const next = center.map(p => ({ ...p }));
  const a = seg;
  const b = (seg + 1) % V;
  next[a] = { x: next[a].x + delta.x, y: next[a].y + delta.y };
  next[b] = { x: next[b].x + delta.x, y: next[b].y + delta.y };
  const rebuilt = computeThickPolylineClosed(next, thicknessPx);
  if (rebuilt.length !== outline.length) {
    return null;
  }
  return rebuilt;
}

/** Open-strip counterpart of {@link rebuildClosedStripOutlineAfterEdgeTranslate}. */
export function rebuildOpenStripOutlineAfterEdgeTranslate(
  outline: Point[],
  edgeIdx: number,
  delta: Point,
  thicknessPx: number,
): Point[] | null {
  if (!isOpenStripPolygonOutline(outline)) return null;
  const seg = openStripEdgeToCenterSegment(outline, edgeIdx);
  if (seg === null) return null;
  const center = extractCenterlineFromOpenStripOutline(outline);
  if (center.length < 2) return null;
  if (seg < 0 || seg >= center.length - 1) return null;
  const next = center.map(p => ({ ...p }));
  next[seg] = { x: next[seg].x + delta.x, y: next[seg].y + delta.y };
  next[seg + 1] = { x: next[seg + 1].x + delta.x, y: next[seg + 1].y + delta.y };
  const rebuilt = computeThickPolyline(next, thicknessPx);
  return rebuilt.length === outline.length ? rebuilt : null;
}

export function computeThickPolyline(points: Point[], thicknessPx: number): Point[] {
  if (points.length < 2) return [];
  const half = thicknessPx / 2;
  const MITER_LIMIT = half * THICK_POLYLINE_MITER_LIMIT_MULT;

  const leftPts: Point[] = [];
  const rightPts: Point[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) continue;
    const nx = -dy / len;
    const ny = dx / len;
    leftPts.push({ x: a.x + nx * half, y: a.y + ny * half });
    rightPts.push({ x: a.x - nx * half, y: a.y - ny * half });
  }
  const last = points[points.length - 1];
  const prevLast = points[points.length - 2];
  const dx = last.x - prevLast.x;
  const dy = last.y - prevLast.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = len > 0.001 ? -dy / len : 0;
  const ny = len > 0.001 ? dx / len : 0;
  leftPts.push({ x: last.x + nx * half, y: last.y + ny * half });
  rightPts.push({ x: last.x - nx * half, y: last.y - ny * half });

  // Replace interior left/right points with miter intersections
  const outLeft: Point[] = [];
  const outRight: Point[] = [];
  outLeft.push(leftPts[0]);
  outRight.push(rightPts[0]);

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const l1 = Math.sqrt(d1x * d1x + d1y * d1y);
    const l2 = Math.sqrt(d2x * d2x + d2y * d2y);
    if (l1 < 0.001 || l2 < 0.001) {
      outLeft.push(leftPts[i]);
      outRight.push(rightPts[i]);
      continue;
    }
    const n1x = -d1y / l1;
    const n1y = d1x / l1;
    const n2x = -d2y / l2;
    const n2y = d2x / l2;
    const p1 = { x: prev.x + n1x * half, y: prev.y + n1y * half };
    const p2 = { x: curr.x + n2x * half, y: curr.y + n2y * half };
    const dir1 = { x: d1x / l1, y: d1y / l1 };
    const dir2 = { x: d2x / l2, y: d2y / l2 };
    const denom = cross(dir1, dir2);
    if (Math.abs(denom) < 0.0001) {
      outLeft.push(leftPts[i]);
      outRight.push(rightPts[i]);
      continue;
    }
    const diff = { x: p2.x - p1.x, y: p2.y - p1.y };
    const t = cross(diff, dir2) / denom;
    const miterLeft = { x: p1.x + t * dir1.x, y: p1.y + t * dir1.y };
    const distLeft = Math.sqrt((miterLeft.x - curr.x) ** 2 + (miterLeft.y - curr.y) ** 2);
    outLeft.push(distLeft > MITER_LIMIT ? miterClipRadial(curr, miterLeft, MITER_LIMIT) : miterLeft);
    const r1 = { x: prev.x - n1x * half, y: prev.y - n1y * half };
    const r2 = { x: curr.x - n2x * half, y: curr.y - n2y * half };
    const rdiff = { x: r2.x - r1.x, y: r2.y - r1.y };
    const tr = cross(rdiff, dir2) / denom;
    const miterRight = { x: r1.x + tr * dir1.x, y: r1.y + tr * dir1.y };
    const distRight = Math.sqrt((miterRight.x - curr.x) ** 2 + (miterRight.y - curr.y) ** 2);
    outRight.push(distRight > MITER_LIMIT ? miterClipRadial(curr, miterRight, MITER_LIMIT) : miterRight);
  }

  outLeft.push(leftPts[leftPts.length - 1]);
  outRight.push(rightPts[rightPts.length - 1]);

  const result: Point[] = [...outLeft];
  for (let i = outRight.length - 1; i >= 0; i--) {
    result.push(outRight[i]);
  }
  return result;
}

/**
 * Convert an open polyline drawn on one face of a thick strip to the centerline used by {@link computeThickPolyline}.
 * `face`: "left" = baseline is the +normal side of the center path (same as computeThickPolyline's left chain);
 * "right" = baseline is the opposite face.
 * `halfWidth` must match computeThickPolyline's half (e.g. toPixels(thicknessM) / 2 in world units).
 *
 * When `closedLoop` is true, the baseline is treated as a closed polygon (last edge connects back to the first
 * vertex). Use this when finalizing a closed wall so the seam corner matches {@link computeThickPolylineClosed}.
 * The open path uses endpoint offsets only at the first/last vertex — wrong for a closed loop and caused
 * huge spurious triangles when closing a baseline-drawn wall.
 */
export function baselineFacePolylineToCenterline(
  baseline: Point[],
  halfWidth: number,
  face: "left" | "right",
  closedLoop = false,
): Point[] {
  const V = baseline.length;
  if (V < 2) return baseline.map(p => ({ ...p }));
  const offsetMul = face === "left" ? -1 : 1;

  const segDir = (i: number, j: number): { dx: number; dy: number; len: number } => {
    const dx = baseline[j].x - baseline[i].x;
    const dy = baseline[j].y - baseline[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    return { dx, dy, len };
  };

  const leftNormal = (dx: number, dy: number, len: number): { nx: number; ny: number } => {
    if (len < 1e-9) return { nx: 0, ny: 0 };
    return { nx: -dy / len, ny: dx / len };
  };

  const lineIntersect = (P: Point, U: Point, Q: Point, Vv: Point): Point | null => {
    const det = U.x * Vv.y - U.y * Vv.x;
    if (Math.abs(det) < 1e-10) return null;
    const wx = Q.x - P.x;
    const wy = Q.y - P.y;
    const s = (wx * Vv.y - wy * Vv.x) / det;
    return { x: P.x + s * U.x, y: P.y + s * U.y };
  };

  /** One offset corner: intersection of lines parallel to two edges through offset baseline points. */
  const cornerFromAdjacentEdges = (i: number, prev: number, next: number): Point => {
    const d1 = segDir(prev, i);
    const d2 = segDir(i, next);
    if (d1.len < 1e-9 || d2.len < 1e-9) {
      const d = d1.len >= 1e-9 ? d1 : d2;
      const { nx, ny } = leftNormal(d.dx, d.dy, d.len);
      return {
        x: baseline[i].x + offsetMul * nx * halfWidth,
        y: baseline[i].y + offsetMul * ny * halfWidth,
      };
    }
    const u1x = d1.dx / d1.len;
    const u1y = d1.dy / d1.len;
    const u2x = d2.dx / d2.len;
    const u2y = d2.dy / d2.len;
    const n1 = leftNormal(d1.dx, d1.dy, d1.len);
    const n2 = leftNormal(d2.dx, d2.dy, d2.len);
    const P = {
      x: baseline[prev].x + offsetMul * n1.nx * halfWidth,
      y: baseline[prev].y + offsetMul * n1.ny * halfWidth,
    };
    const Q = {
      x: baseline[i].x + offsetMul * n2.nx * halfWidth,
      y: baseline[i].y + offsetMul * n2.ny * halfWidth,
    };
    const hit = lineIntersect(P, { x: u1x, y: u1y }, Q, { x: u2x, y: u2y });
    if (hit) {
      return hit;
    }
    return {
      x: baseline[i].x + offsetMul * n2.nx * halfWidth,
      y: baseline[i].y + offsetMul * n2.ny * halfWidth,
    };
  };

  if (closedLoop) {
    if (V < 3) return [];
    const out: Point[] = [];
    for (let i = 0; i < V; i++) {
      const prev = (i - 1 + V) % V;
      const next = (i + 1) % V;
      out.push(cornerFromAdjacentEdges(i, prev, next));
    }
    return out;
  }

  const out: Point[] = [];
  for (let i = 0; i < V; i++) {
    if (i === 0) {
      const { dx, dy, len } = segDir(0, 1);
      const { nx, ny } = leftNormal(dx, dy, len);
      if (len < 1e-9) {
        out.push({ ...baseline[0] });
        continue;
      }
      out.push({
        x: baseline[0].x + offsetMul * nx * halfWidth,
        y: baseline[0].y + offsetMul * ny * halfWidth,
      });
      continue;
    }
    if (i === V - 1) {
      const { dx, dy, len } = segDir(V - 2, V - 1);
      const { nx, ny } = leftNormal(dx, dy, len);
      if (len < 1e-9) {
        out.push({ ...baseline[V - 1] });
        continue;
      }
      out.push({
        x: baseline[V - 1].x + offsetMul * nx * halfWidth,
        y: baseline[V - 1].y + offsetMul * ny * halfWidth,
      });
      continue;
    }
    out.push(cornerFromAdjacentEdges(i, i - 1, i + 1));
  }
  return out;
}

const STRIP_LOOP_EPS = 1e-4;

/** True if outline matches computeThickPolylineClosed layout (duplicate closure vertices on left/right chains). */
export function isClosedStripPolygonOutline(outline: Point[]): boolean {
  const n = outline.length;
  // Closed strip from computeThickPolylineClosed has n = 2V+2 with V ≥ 3 → n ≥ 8. (n = 6 is always open strip.)
  if (n < 8 || n % 2 !== 0) return false;
  const h = n / 2;
  const d = distance(outline[0]!, outline[h - 1]!);
  // Exact duplicate seam (computeThickPolylineClosed copies left[0] to left[V]).
  if (d < STRIP_LOOP_EPS) return true;
  // World coords are meters: 1e-4 m is 0.1 mm — too tight after transforms / minor edits; FP + small seam drift.
  // Relative check: seam gap vs typical left-chain edge length (same corner should stay "closed" visually).
  let maxLeftEdge = 0;
  for (let i = 0; i < h - 1; i++) {
    maxLeftEdge = Math.max(maxLeftEdge, distance(outline[i]!, outline[i + 1]!));
  }
  if (maxLeftEdge < 1e-9) return false;
  return d < Math.max(1e-3, maxLeftEdge * 1e-5);
}

/** True if outline matches computeThickPolyline (open ribbon) layout: n = 2V, V ≥ 2. */
export function isOpenStripPolygonOutline(outline: Point[]): boolean {
  const n = outline.length;
  if (n < 4 || n % 2 !== 0) return false;
  return !isClosedStripPolygonOutline(outline);
}

export function extractCenterlineFromOpenStripOutline(outline: Point[]): Point[] {
  if (!isOpenStripPolygonOutline(outline)) return [];
  const n = outline.length;
  const V = n / 2;
  const out: Point[] = [];
  for (let i = 0; i < V; i++) {
    out.push(midpoint(outline[i], outline[n - 1 - i]));
  }
  return out;
}

/**
 * Closed path outline from computePathOutlineFromSegmentSides: 2V points (no duplicate seam vertex),
 * [left0..left_{V-1}, rightRev_0..rightRev_{V-1}]. Convert to wall strip layout [left0..left_{V-1}, left0, R_V..R_0]
 * used by computeThickPolylineClosed / rebuildClosedStripOutlineFromVertexTarget.
 */
export function pathClosedOutlineToWallStripOutline(pathOutline: Point[]): Point[] | null {
  const n = pathOutline.length;
  if (n < 6 || n % 2 !== 0) return null;
  const V = n / 2;
  const leftPart = pathOutline.slice(0, V);
  const rt = pathOutline.slice(V);
  if (rt.length !== V) return null;
  const seq: Point[] = [rt[V - 1]];
  for (let i = 0; i < V; i++) seq.push(rt[i]);
  return [...leftPart, leftPart[0]!, ...seq];
}

/** Inverse of pathClosedOutlineToWallStripOutline. */
export function wallStripOutlineToPathClosedOutline(wallOutline: Point[]): Point[] | null {
  const n = wallOutline.length;
  if (n < 8 || n % 2 !== 0) return null;
  const V = (n - 2) / 2;
  const left = wallOutline.slice(0, V + 1);
  const tail = wallOutline.slice(V + 1);
  if (tail.length !== V + 1) return null;
  let maxLeftEdge = 0;
  for (let i = 0; i < V; i++) {
    maxLeftEdge = Math.max(maxLeftEdge, distance(left[i]!, left[i + 1]!));
  }
  const seamD = distance(left[0]!, left[V]!);
  if (seamD > STRIP_LOOP_EPS && seamD > Math.max(1e-3, maxLeftEdge * 1e-5)) return null;
  const pathRight = tail.slice(1);
  return [...left.slice(0, V), ...pathRight];
}

/**
 * Map path closed outline vertex index (2V layout) to wall strip vertex index (2V+2 layout).
 */
export function pathClosedOutlineVertexIdxToWallStrip(vertexIdx: number, V: number): number | null {
  if (vertexIdx < 0 || vertexIdx >= 2 * V) return null;
  if (vertexIdx < V) return vertexIdx;
  return V + 2 + (vertexIdx - V);
}

/**
 * Rebuild closed path ribbon (2V points, pathIsOutline) so vertex `vertexIdx` hits `target`, preserving width.
 */
export function rebuildClosedPathOutlineFromVertexTarget(
  pathOutline: Point[],
  vertexIdx: number,
  target: Point,
  thicknessPx: number,
): Point[] | null {
  const n = pathOutline.length;
  if (n < 6 || n % 2 !== 0) {
    return null;
  }
  const V = n / 2;
  const wallIdx = pathClosedOutlineVertexIdxToWallStrip(vertexIdx, V);
  if (wallIdx == null) {
    return null;
  }
  const wall = pathClosedOutlineToWallStripOutline(pathOutline);
  if (!wall) {
    return null;
  }
  const rebuiltWall = rebuildClosedStripOutlineFromVertexTarget(wall, wallIdx, target, thicknessPx);
  if (!rebuiltWall) {
    return null;
  }
  const pathBack = wallStripOutlineToPathClosedOutline(rebuiltWall);
  if (!pathBack) {
    return null;
  }
  return pathBack;
}

/**
 * Flat path ribbon with 2V=4 (two center stations): paired corners across width.
 * Same translation on opposite index keeps the short edge parallel (constant width).
 */
export function rebuildPathRibbonPairTranslateHalf(outline: Point[], vertexIdx: number, target: Point): Point[] | null {
  const n = outline.length;
  if (n !== 4 || vertexIdx < 0 || vertexIdx >= 4) return null;
  const opp = n - 1 - vertexIdx;
  const old = outline[vertexIdx];
  const dx = target.x - old.x;
  const dy = target.y - old.y;
  const out = outline.map(p => ({ ...p }));
  out[vertexIdx] = { ...target };
  out[opp] = { x: out[opp].x + dx, y: out[opp].y + dy };
  return out;
}

/** Closed path/canvas ribbon: wall layout (2V+2), flat path (2V≥6), or minimal flat quad (2V=4). */
export function rebuildPathClosedRibbonFromVertexTarget(
  outline: Point[],
  vertexIdx: number,
  target: Point,
  thicknessPx: number,
): Point[] | null {
  const n = outline.length;
  if (n < 4 || n % 2 !== 0) return null;
  const branch = isClosedStripPolygonOutline(outline) ? "wall" : n === 4 ? "pair4" : "path2V";
  if (branch === "wall") {
    return rebuildClosedStripOutlineFromVertexTarget(outline, vertexIdx, target, thicknessPx);
  }
  if (branch === "pair4") {
    return rebuildPathRibbonPairTranslateHalf(outline, vertexIdx, target);
  }
  return rebuildClosedPathOutlineFromVertexTarget(outline, vertexIdx, target, thicknessPx);
}

/** Wall/kerb/foundation drawn/stored as polygon outline points (closed loop or open strip), not as centerline polyline. */
export function isPolygonLinearOutlineStored(shape: Shape): boolean {
  if (!isPolygonLinearElement(shape)) return false;
  if (shape.closed && shape.points.length >= 3) return true;
  return Boolean(shape.linearOpenStripOutline && !shape.closed && shape.points.length >= 4 && shape.points.length % 2 === 0);
}

/** Closed or open strip with paired left/right chains (mitered thickness). */
export function isPolygonLinearStripOutline(shape: Shape): boolean {
  if (!isPolygonLinearElement(shape)) return false;
  const pts = shape.points;
  if (shape.linearOpenStripOutline && !shape.closed && isOpenStripPolygonOutline(pts)) return true;
  if (shape.closed && pts.length >= 6 && pts.length % 2 === 0 && isClosedStripPolygonOutline(pts)) return true;
  return false;
}

/**
 * Rebuild an open thick-strip polygon (computeThickPolyline layout) so outline[vertexIdx] hits `target`.
 */
export function rebuildOpenStripOutlineFromVertexTarget(
  outline: Point[],
  vertexIdx: number,
  target: Point,
  thicknessPx: number,
): Point[] | null {
  const n = outline.length;
  if (!isOpenStripPolygonOutline(outline) || vertexIdx < 0 || vertexIdx >= n) return null;
  const V = n / 2;
  const C = extractCenterlineFromOpenStripOutline(outline);
  if (C.length !== V) return null;
  const nextC = [...C];
  const half = thicknessPx / 2;
  const miterLimit = half * THICK_POLYLINE_MITER_LIMIT_MULT;

  const normalStart = (): { nx: number; ny: number } | null => {
    const A0 = nextC[0];
    const B = nextC[1];
    if (!A0 || !B) return null;
    const dx = B.x - A0.x;
    const dy = B.y - A0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return null;
    return { nx: -dy / len, ny: dx / len };
  };

  const normalEnd = (): { nx: number; ny: number } | null => {
    const A = nextC[V - 2];
    const B = nextC[V - 1];
    if (!A || !B) return null;
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return null;
    return { nx: -dy / len, ny: dx / len };
  };

  if (vertexIdx < V) {
    const k = vertexIdx;
    if (k > 0 && k < V - 1) {
      nextC[k] = solveCenterVertexForMiterTarget(nextC[k - 1]!, nextC[k]!, nextC[k + 1]!, target, "left", half, miterLimit);
    } else if (k === 0) {
      const nm = normalStart();
      if (!nm) return null;
      nextC[0] = { x: target.x - nm.nx * half, y: target.y - nm.ny * half };
    } else {
      const nm = normalEnd();
      if (!nm) return null;
      nextC[V - 1] = { x: target.x - nm.nx * half, y: target.y - nm.ny * half };
    }
  } else {
    const k = (n - 1) - vertexIdx;
    if (k > 0 && k < V - 1) {
      nextC[k] = solveCenterVertexForMiterTarget(nextC[k - 1]!, nextC[k]!, nextC[k + 1]!, target, "right", half, miterLimit);
    } else if (k === 0) {
      const nm = normalStart();
      if (!nm) return null;
      nextC[0] = { x: target.x + nm.nx * half, y: target.y + nm.ny * half };
    } else {
      const nm = normalEnd();
      if (!nm) return null;
      nextC[V - 1] = { x: target.x + nm.nx * half, y: target.y + nm.ny * half };
    }
  }

  return computeThickPolyline(nextC, thicknessPx);
}

/**
 * Build path outline from centerline + per-segment side choices.
 * segmentSides[i] = side for segment i (pts[i] → pts[i+1]).
 *
 * Two chains: leftChain (left of centerline, +normal) and rightChain (right, -normal).
 * For each segment, the chain on the path side carries the offset line; the opposite chain carries the centerline.
 * At every vertex each chain gets exactly ONE point:
 *   - Same side: miter intersection of the two offset lines (or two centerlines = vertex itself).
 *   - Side change: intersection of the offset line (from the segment on that side) with the centerline (from the other segment).
 */
export function computePathOutlineFromSegmentSides(
  centerline: Point[],
  segmentSides: ("left" | "right")[],
  pathWidthM: number
): Point[] {
  if (centerline.length < 2 || segmentSides.length !== centerline.length - 1) return [];
  const full = toPixels(pathWidthM);
  const MITER_LIMIT = (full / 2) * THICK_POLYLINE_MITER_LIMIT_MULT;
  const n = centerline.length;

  const normals: { x: number; y: number }[] = [];
  const dirs: { x: number; y: number }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = centerline[i];
    const b = centerline[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) { normals.push({ x: 0, y: 0 }); dirs.push({ x: 0, y: 0 }); continue; }
    normals.push({ x: -dy / len, y: dx / len });
    dirs.push({ x: dx / len, y: dy / len });
  }

  function cross2d(ax: number, ay: number, bx: number, by: number): number {
    return ax * by - ay * bx;
  }

  function offsetPt(vi: number, si: number, side: "left" | "right"): Point {
    const sign = side === "left" ? 1 : -1;
    const pt = centerline[vi];
    const nm = normals[si];
    return { x: pt.x + sign * nm.x * full, y: pt.y + sign * nm.y * full };
  }

  /** Intersect two lines: (px,py)+t*(dx,dy) and (qx,qy)+s*(ex,ey). Returns intersection or null. */
  function lineIsect(
    px: number, py: number, dx: number, dy: number,
    qx: number, qy: number, ex: number, ey: number
  ): Point | null {
    const denom = cross2d(dx, dy, ex, ey);
    if (Math.abs(denom) < 0.0001) return null;
    const t = cross2d(qx - px, qy - py, ex, ey) / denom;
    return { x: px + t * dx, y: py + t * dy };
  }

  /** Miter join of two offset lines (same side, same offset sign) at interior vertex i. */
  function miterJoin(i: number, side: "left" | "right"): Point {
    const p = offsetPt(i, i - 1, side);
    const q = offsetPt(i, i, side);
    const d1 = dirs[i - 1], d2 = dirs[i];
    if ((d1.x === 0 && d1.y === 0) || (d2.x === 0 && d2.y === 0)) return p;
    const pt = lineIsect(p.x, p.y, d1.x, d1.y, q.x, q.y, d2.x, d2.y);
    if (!pt) return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const cx = centerline[i].x, cy = centerline[i].y;
    const ddx = pt.x - cx, ddy = pt.y - cy;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dist > MITER_LIMIT) {
      return { x: cx + (ddx / dist) * MITER_LIMIT, y: cy + (ddy / dist) * MITER_LIMIT };
    }
    return pt;
  }

  /**
   * Side-change intersection for one chain at interior vertex i.
   * offsetSeg = index of the segment that IS on this chain's side (carries offset line).
   * centerSeg = index of the other segment (carries centerline).
   */
  function sideChangePoint(i: number, offsetSeg: number, centerSeg: number, side: "left" | "right"): Point {
    const d1 = dirs[offsetSeg], d2 = dirs[centerSeg];
    if ((d1.x === 0 && d1.y === 0) || (d2.x === 0 && d2.y === 0)) return offsetPt(i, offsetSeg, side);
    const op = offsetPt(i, offsetSeg, side);
    const cp = centerline[i];
    const pt = lineIsect(op.x, op.y, d1.x, d1.y, cp.x, cp.y, d2.x, d2.y);
    if (!pt) return op;
    const dist = Math.sqrt((pt.x - centerline[i].x) ** 2 + (pt.y - centerline[i].y) ** 2);
    return dist > MITER_LIMIT ? op : pt;
  }

  function leftPoint(i: number): Point {
    const prevSide = segmentSides[i - 1];
    const nextSide = segmentSides[i];
    if (prevSide === "left" && nextSide === "left") return miterJoin(i, "left");
    if (prevSide === "right" && nextSide === "right") return { ...centerline[i] };
    if (prevSide === "left") return sideChangePoint(i, i - 1, i, "left");
    return sideChangePoint(i, i, i - 1, "left");
  }

  function rightPoint(i: number): Point {
    const prevSide = segmentSides[i - 1];
    const nextSide = segmentSides[i];
    if (prevSide === "right" && nextSide === "right") return miterJoin(i, "right");
    if (prevSide === "left" && nextSide === "left") return { ...centerline[i] };
    if (prevSide === "right") return sideChangePoint(i, i - 1, i, "right");
    return sideChangePoint(i, i, i - 1, "right");
  }

  const leftChain: Point[] = [];
  const rightChain: Point[] = [];

  leftChain.push(segmentSides[0] === "left" ? offsetPt(0, 0, "left") : { ...centerline[0] });
  rightChain.push(segmentSides[0] === "right" ? offsetPt(0, 0, "right") : { ...centerline[0] });

  for (let i = 1; i < n - 1; i++) {
    leftChain.push(leftPoint(i));
    rightChain.push(rightPoint(i));
  }

  leftChain.push(segmentSides[n - 2] === "left" ? offsetPt(n - 1, n - 2, "left") : { ...centerline[n - 1] });
  rightChain.push(segmentSides[n - 2] === "right" ? offsetPt(n - 1, n - 2, "right") : { ...centerline[n - 1] });

  const rightReversed: Point[] = [];
  for (let i = rightChain.length - 1; i >= 0; i--) rightReversed.push(rightChain[i]);

  return [...leftChain, ...rightReversed];
}

/**
 * Drag a handle on a closed rectangular path ribbon (4 centerline corners, 8 outline vertices).
 * Keeps the next centerline corner after the dragged one fixed (anchor), rebuilds the other three
 * corners as a rectangle, then regenerates outline via computePathOutlineFromSegmentSides (same as drawing).
 */
export function rebuildRectangularPathRibbonFromOutlineDrag(
  centerline: Point[],
  segmentSides: ("left" | "right")[],
  pathWidthM: number,
  vertexIdx: number,
  target: Point,
  maxIter = 40,
): { outline: Point[]; centerline: Point[] } | null {
  const V = centerline.length;
  if (V !== 4 || segmentSides.length !== 3) return null;
  const kc = pathRibbonOutlineVertexToCenterCorner(vertexIdx, V);
  if (kc == null) return null;
  const a = (kc + 1) % V;
  const F = { ...centerline[a] };
  const Dref = { ...centerline[(a + 1) % V] };
  const Aidx = (kc - 1 + V) % V;
  const Didx = (a + 1) % V;

  let Lbf = distance(centerline[kc], F);
  let Led = distance(F, centerline[Didx]);
  let theta = Math.atan2(centerline[kc].y - F.y, centerline[kc].x - F.x);
  Lbf = Math.max(Lbf, 1e-6);
  Led = Math.max(Led, 1e-6);

  const build = (lb: number, ld: number, th: number): Point[] => {
    const B = { x: F.x + lb * Math.cos(th), y: F.y + lb * Math.sin(th) };
    const len = Math.hypot(B.x - F.x, B.y - F.y) || 1e-9;
    const uux = (B.x - F.x) / len;
    const uuy = (B.y - F.y) / len;
    let nx = -uuy;
    let ny = uux;
    if (nx * (Dref.x - F.x) + ny * (Dref.y - F.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const D = { x: F.x + ld * nx, y: F.y + ld * ny };
    const A = { x: B.x + D.x - F.x, y: B.y + D.y - F.y };
    const cl: Point[] = centerline.map(p => ({ ...p }));
    cl[Aidx] = A;
    cl[kc] = B;
    cl[a] = { ...F };
    cl[Didx] = D;
    return cl;
  };

  let bestOutline: Point[] | null = null;
  let bestCl: Point[] | null = null;
  let bestErr2 = Infinity;
  const lam = 1e-8;

  for (let iter = 0; iter < maxIter; iter++) {
    const clTry = build(Lbf, Led, theta);
    const out = computePathOutlineFromSegmentSides(clTry, segmentSides, pathWidthM);
    if (out.length !== 2 * V) {
      continue;
    }
    const ox = out[vertexIdx].x;
    const oy = out[vertexIdx].y;
    const rx = ox - target.x;
    const ry = oy - target.y;
    const err2 = rx * rx + ry * ry;
    if (err2 < bestErr2) {
      bestErr2 = err2;
      bestOutline = out.map(p => ({ ...p }));
      bestCl = clTry.map(p => ({ ...p }));
    }
    if (err2 < 1e-8) {
      return { outline: out.map(p => ({ ...p })), centerline: clTry.map(p => ({ ...p })) };
    }

    const hL = Math.max(1e-4, Lbf * 1e-4);
    const hLd = Math.max(1e-4, Led * 1e-4);
    const hT = 1e-5;

    const sample = (lb: number, ld: number, th: number) => {
      const o = computePathOutlineFromSegmentSides(build(lb, ld, th), segmentSides, pathWidthM);
      if (o.length !== 2 * V) return { x: 1e9, y: 1e9 };
      return { x: o[vertexIdx].x - target.x, y: o[vertexIdx].y - target.y };
    };

    const r0x = rx;
    const r0y = ry;
    const sL = sample(Lbf + hL, Led, theta);
    const sLd = sample(Lbf, Led + hLd, theta);
    const sT = sample(Lbf, Led, theta + hT);
    const j11 = (sL.x - r0x) / hL;
    const j12 = (sLd.x - r0x) / hLd;
    const j13 = (sT.x - r0x) / hT;
    const j21 = (sL.y - r0y) / hL;
    const j22 = (sLd.y - r0y) / hLd;
    const j23 = (sT.y - r0y) / hT;

    const m11 = j11 * j11 + j12 * j12 + j13 * j13 + lam;
    const m12 = j11 * j21 + j12 * j22 + j13 * j23;
    const m22 = j21 * j21 + j22 * j22 + j23 * j23 + lam;
    const bx = -r0x;
    const by = -r0y;
    const det = m11 * m22 - m12 * m12;
    if (Math.abs(det) < 1e-18) break;
    const inv11 = m22 / det;
    const inv12 = -m12 / det;
    const inv21 = -m12 / det;
    const inv22 = m11 / det;
    const w0 = inv11 * bx + inv12 * by;
    const w1 = inv21 * bx + inv22 * by;
    let dLbf = j11 * w0 + j21 * w1;
    let dLed = j12 * w0 + j22 * w1;
    let dTh = j13 * w0 + j23 * w1;

    const stepCap = 8;
    const nm = Math.hypot(dLbf, dLed, dTh * (Lbf + Led));
    if (nm > stepCap) {
      const s = stepCap / nm;
      dLbf *= s;
      dLed *= s;
      dTh *= s;
    }

    const damp = 0.65;
    Lbf = Math.max(1e-6, Lbf + dLbf * damp);
    Led = Math.max(1e-6, Led + dLed * damp);
    theta += dTh * damp;
  }

  const tolSnap2 = Math.max(4, (toPixels(pathWidthM) * 0.06) ** 2);
  if (bestOutline && bestCl && bestErr2 <= tolSnap2) {
    return { outline: bestOutline, centerline: bestCl };
  }
  return null;
}

/**
 * Drag on a **single-segment** closed path ribbon (V=2 CL corners → 4 outline points).
 * Moves one CL corner so that outline[vertexIdx] hits target; the other CL corner is the anchor.
 */
export function rebuildPathRibbonSingleSegmentDrag(
  centerline: Point[],
  segmentSides: ("left" | "right")[],
  pathWidthM: number,
  vertexIdx: number,
  target: Point,
): { outline: Point[]; centerline: Point[] } | null {
  if (centerline.length !== 2 || segmentSides.length !== 1) return null;
  if (vertexIdx < 0 || vertexIdx > 3) return null;
  const kc = pathRibbonOutlineVertexToCenterCorner(vertexIdx, 2);
  if (kc == null) return null;
  const anchor = 1 - kc;
  let cx = centerline[kc]!.x;
  let cy = centerline[kc]!.y;
  const ax = centerline[anchor]!.x;
  const ay = centerline[anchor]!.y;

  for (let iter = 0; iter < 30; iter++) {
    const cl: Point[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    cl[kc] = { x: cx, y: cy };
    cl[anchor] = { x: ax, y: ay };
    const out = computePathOutlineFromSegmentSides(cl, segmentSides, pathWidthM);
    if (out.length !== 4) return null;
    const rx = out[vertexIdx]!.x - target.x;
    const ry = out[vertexIdx]!.y - target.y;
    if (rx * rx + ry * ry < 1e-8) {
      return { outline: out.map(p => ({ ...p })), centerline: cl.map(p => ({ ...p })) };
    }
    const h = 1e-4;
    const clDx: Point[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    clDx[kc] = { x: cx + h, y: cy };
    clDx[anchor] = { x: ax, y: ay };
    const oDx = computePathOutlineFromSegmentSides(clDx, segmentSides, pathWidthM);
    const clDy: Point[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    clDy[kc] = { x: cx, y: cy + h };
    clDy[anchor] = { x: ax, y: ay };
    const oDy = computePathOutlineFromSegmentSides(clDy, segmentSides, pathWidthM);
    if (oDx.length !== 4 || oDy.length !== 4) return null;
    const j11 = (oDx[vertexIdx]!.x - out[vertexIdx]!.x) / h;
    const j12 = (oDy[vertexIdx]!.x - out[vertexIdx]!.x) / h;
    const j21 = (oDx[vertexIdx]!.y - out[vertexIdx]!.y) / h;
    const j22 = (oDy[vertexIdx]!.y - out[vertexIdx]!.y) / h;
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-18) break;
    cx -= (j22 * rx - j12 * ry) / det;
    cy -= (-j21 * rx + j11 * ry) / det;
  }
  const clFinal: Point[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  clFinal[kc] = { x: cx, y: cy };
  clFinal[anchor] = { x: ax, y: ay };
  const outFinal = computePathOutlineFromSegmentSides(clFinal, segmentSides, pathWidthM);
  if (outFinal.length !== 4) return null;
  const rx = outFinal[vertexIdx]!.x - target.x;
  const ry = outFinal[vertexIdx]!.y - target.y;
  if (rx * rx + ry * ry > Math.max(9, (toPixels(pathWidthM) * 0.12) ** 2)) return null;
  return { outline: outFinal.map(p => ({ ...p })), centerline: clFinal.map(p => ({ ...p })) };
}

/**
 * General drag on a closed path ribbon of any segment count.
 * Moves the CL corner for the dragged vertex; all other CL corners stay fixed.
 */
export function rebuildPathRibbonGeneralDrag(
  centerline: Point[],
  segmentSides: ("left" | "right")[],
  pathWidthM: number,
  vertexIdx: number,
  target: Point,
): { outline: Point[]; centerline: Point[] } | null {
  const V = centerline.length;
  if (V < 2 || segmentSides.length !== V - 1) return null;
  if (vertexIdx < 0 || vertexIdx >= 2 * V) return null;
  const kc = pathRibbonOutlineVertexToCenterCorner(vertexIdx, V);
  if (kc == null) return null;
  let cx = centerline[kc]!.x;
  let cy = centerline[kc]!.y;

  for (let iter = 0; iter < 30; iter++) {
    const cl = centerline.map(p => ({ ...p }));
    cl[kc] = { x: cx, y: cy };
    const out = computePathOutlineFromSegmentSides(cl, segmentSides, pathWidthM);
    if (out.length !== 2 * V) return null;
    const rx = out[vertexIdx]!.x - target.x;
    const ry = out[vertexIdx]!.y - target.y;
    if (rx * rx + ry * ry < 1e-8) {
      return { outline: out.map(p => ({ ...p })), centerline: cl.map(p => ({ ...p })) };
    }
    const h = 1e-4;
    const clDx = centerline.map(p => ({ ...p }));
    clDx[kc] = { x: cx + h, y: cy };
    const oDx = computePathOutlineFromSegmentSides(clDx, segmentSides, pathWidthM);
    const clDy = centerline.map(p => ({ ...p }));
    clDy[kc] = { x: cx, y: cy + h };
    const oDy = computePathOutlineFromSegmentSides(clDy, segmentSides, pathWidthM);
    if (oDx.length !== 2 * V || oDy.length !== 2 * V) return null;
    const j11 = (oDx[vertexIdx]!.x - out[vertexIdx]!.x) / h;
    const j12 = (oDy[vertexIdx]!.x - out[vertexIdx]!.x) / h;
    const j21 = (oDx[vertexIdx]!.y - out[vertexIdx]!.y) / h;
    const j22 = (oDy[vertexIdx]!.y - out[vertexIdx]!.y) / h;
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-18) break;
    cx -= (j22 * rx - j12 * ry) / det;
    cy -= (-j21 * rx + j11 * ry) / det;
  }
  const clFinal = centerline.map(p => ({ ...p }));
  clFinal[kc] = { x: cx, y: cy };
  const outFinal = computePathOutlineFromSegmentSides(clFinal, segmentSides, pathWidthM);
  if (outFinal.length !== 2 * V) return null;
  const rx = outFinal[vertexIdx]!.x - target.x;
  const ry = outFinal[vertexIdx]!.y - target.y;
  if (rx * rx + ry * ry > Math.max(9, (toPixels(pathWidthM) * 0.12) ** 2)) return null;
  return { outline: outFinal.map(p => ({ ...p })), centerline: clFinal.map(p => ({ ...p })) };
}

/** Resolve 4 centerline corners for a closed rectangular path ribbon (same rules as drag). */
export function resolvePathRibbonRectCenterline4(
  outlinePts: Point[],
  pathWidthM: number,
  pathCenterline: Point[] | undefined,
  pathCenterlineOriginal: Point[] | undefined,
): Point[] {
  let cl: Point[] =
    pathCenterline && pathCenterline.length === 4
      ? pathCenterline.map(p => ({ ...p }))
      : pathCenterlineOriginal && pathCenterlineOriginal.length === 4
        ? pathCenterlineOriginal.map(p => ({ ...p }))
        : (() => {
            const ex = extractPathRibbonCenterlineFromOutline(outlinePts);
            return ex.length === 4 ? ex.map(p => ({ ...p })) : [];
          })();
  if (cl.length !== 4 && outlinePts.length === 4) {
    const halfPx = toPixels(pathWidthM) / 2;
    const rec = recoverCenterlineQuadFromPairFourRibbonOutline(outlinePts, halfPx);
    if (rec && rec.length === 4) cl = rec.map(p => ({ ...p }));
  }
  return cl;
}

/** Classify each closed ribbon outline edge as along path length vs width (4 long / 4 short for 8-pt rect). */
export function classifyRibbonOutlineEdgeTypes(outlinePts: Point[]): ("length" | "width")[] | null {
  const n = outlinePts.length;
  if (n !== 4 && n !== 8) return null;
  const lens: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    lens.push(distance(outlinePts[i]!, outlinePts[j]!));
  }
  if (n === 8) {
    const sorted = [...lens].sort((a, b) => a - b);
    const cut = (sorted[3]! + sorted[4]!) / 2;
    return lens.map(L => (L >= cut ? "length" : "width"));
  }
  const sorted4 = [...lens].sort((a, b) => a - b);
  const med = (sorted4[1]! + sorted4[2]!) / 2;
  return lens.map(L => (L >= med - 1e-9 ? "length" : "width"));
}

/**
 * Neighbor vertex indices reached from `vertexIdx` along **length** edges only (not width).
 * At a mitre corner both incident length edges → two anchors.
 */
export function lengthAnchorNeighborVertexIndices(vertexIdx: number, outlinePts: Point[]): number[] | null {
  const n = outlinePts.length;
  if (n !== 4 && n !== 8) return null;
  const kinds = classifyRibbonOutlineEdgeTypes(outlinePts);
  if (!kinds) return null;
  const ePrev = (vertexIdx - 1 + n) % n;
  const out: number[] = [];
  if (kinds[ePrev] === "length") out.push((vertexIdx - 1 + n) % n);
  if (kinds[vertexIdx] === "length") out.push((vertexIdx + 1) % n);
  return [...new Set(out)];
}

/** Map length-neighbor indices on snap (4 or 8) to 8-outline indices + frozen world positions. */
export function pathRibbonLengthAnchorPairsFromOutlineSnap(
  outlineSnap: Point[],
  draggedVertexIdxOnSnap: number,
  clRect4: Point[],
  segmentSides: ("left" | "right")[],
  pathWidthM: number,
): { outlineIdx: number; world: Point }[] | null {
  const nei = lengthAnchorNeighborVertexIndices(draggedVertexIdxOnSnap, outlineSnap);
  if (!nei || nei.length === 0) return null;
  const o8 = computePathOutlineFromSegmentSides(clRect4, segmentSides, pathWidthM);
  if (o8.length !== 8) return null;
  const n = outlineSnap.length;
  const pairs: { outlineIdx: number; world: Point }[] = [];
  const usedJ = new Set<number>();
  for (const ni of nei) {
    let j: number;
    if (n === 8) {
      j = ni;
    } else {
      const mapped = mapPairFourToRectRibbonOutlineVertex(outlineSnap, o8, ni);
      if (mapped != null) j = mapped;
      else {
        let bd = Infinity;
        j = 0;
        for (let k = 0; k < 8; k++) {
          const d = distance(outlineSnap[ni]!, o8[k]!);
          if (d < bd) {
            bd = d;
            j = k;
          }
        }
      }
    }
    if (usedJ.has(j)) continue;
    usedJ.add(j);
    pairs.push({ outlineIdx: j, world: { ...outlineSnap[ni]! } });
  }
  return pairs.length > 0 ? pairs : null;
}

function solve3x3Sym(
  a11: number,
  a12: number,
  a13: number,
  a22: number,
  a23: number,
  a33: number,
  b1: number,
  b2: number,
  b3: number,
): { x: number; y: number; z: number } | null {
  const m = [
    [a11, a12, a13, b1],
    [a12, a22, a23, b2],
    [a13, a23, a33, b3],
  ];
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    }
    if (Math.abs(m[piv]![col]!) < 1e-18) return null;
    if (piv !== col) [m[col], m[piv]] = [m[piv]!, m[col]!];
    const div = m[col]![col]!;
    for (let c = col; c < 4; c++) m[col]![c]! /= div;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r]![col]!;
      for (let c = col; c < 4; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return { x: m[0]![3]!, y: m[1]![3]!, z: m[2]![3]! };
}

/**
 * Rectangular path ribbon drag: dragged outline vertex → target, while pinning **length-adjacent**
 * outline points (neighbors along long edges at mousedown), not the whole opposite side.
 */
export function rebuildRectangularPathRibbonLengthAnchorsFixed(
  centerline: Point[],
  segmentSides: ("left" | "right")[],
  pathWidthM: number,
  vertexIdx: number,
  target: Point,
  anchorPairs: { outlineIdx: number; world: Point }[],
  maxIter = 48,
  anchorWeight = 85,
): { outline: Point[]; centerline: Point[] } | null {
  const V = 4;
  if (centerline.length !== V || segmentSides.length !== 3 || anchorPairs.length === 0) return null;
  const kc = pathRibbonOutlineVertexToCenterCorner(vertexIdx, V);
  if (kc == null) return null;
  const a = (kc + 1) % V;
  const F = { ...centerline[a] };
  const Dref = { ...centerline[(a + 1) % V] };
  const Aidx = (kc - 1 + V) % V;
  const Didx = (a + 1) % V;

  let Lbf = distance(centerline[kc], F);
  let Led = distance(F, centerline[Didx]);
  let theta = Math.atan2(centerline[kc].y - F.y, centerline[kc].x - F.x);
  Lbf = Math.max(Lbf, 1e-6);
  Led = Math.max(Led, 1e-6);

  const build = (lb: number, ld: number, th: number): Point[] => {
    const B = { x: F.x + lb * Math.cos(th), y: F.y + lb * Math.sin(th) };
    const len = Math.hypot(B.x - F.x, B.y - F.y) || 1e-9;
    const uux = (B.x - F.x) / len;
    const uuy = (B.y - F.y) / len;
    let nx = -uuy;
    let ny = uux;
    if (nx * (Dref.x - F.x) + ny * (Dref.y - F.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const D = { x: F.x + ld * nx, y: F.y + ld * ny };
    const A = { x: B.x + D.x - F.x, y: B.y + D.y - F.y };
    const cl: Point[] = centerline.map(p => ({ ...p }));
    cl[Aidx] = A;
    cl[kc] = B;
    cl[a] = { ...F };
    cl[Didx] = D;
    return cl;
  };

  const sqrtW = Math.sqrt(anchorWeight);
  const tolSnap2 = Math.max(4, (toPixels(pathWidthM) * 0.06) ** 2);
  const tolAnchor2 = Math.max(9, (toPixels(pathWidthM) * 0.08) ** 2);

  const residualVec = (lb: number, ld: number, th: number): number[] | null => {
    const clTry = build(lb, ld, th);
    const out = computePathOutlineFromSegmentSides(clTry, segmentSides, pathWidthM);
    if (out.length !== 2 * V) return null;
    const ox = out[vertexIdx]!.x - target.x;
    const oy = out[vertexIdx]!.y - target.y;
    const r = [ox, oy];
    for (const ap of anchorPairs) {
      const p = out[ap.outlineIdx];
      if (!p) return null;
      r.push(sqrtW * (p.x - ap.world.x));
      r.push(sqrtW * (p.y - ap.world.y));
    }
    return r;
  };

  let bestOutline: Point[] | null = null;
  let bestCl: Point[] | null = null;
  let bestDrag2 = Infinity;
  let bestMaxAnc2 = Infinity;

  const lam = 1e-8;
  const m = 2 + anchorPairs.length * 2;

  for (let iter = 0; iter < maxIter; iter++) {
    const r0 = residualVec(Lbf, Led, theta);
    if (!r0) continue;
    let drag2 = r0[0]! * r0[0]! + r0[1]! * r0[1]!;
    let maxAnc2 = 0;
    for (let i = 2; i < r0.length; i += 2) {
      const ax = r0[i]! / sqrtW;
      const ay = r0[i + 1]! / sqrtW;
      maxAnc2 = Math.max(maxAnc2, ax * ax + ay * ay);
    }
    if (drag2 < bestDrag2 - 1e-12 || (Math.abs(drag2 - bestDrag2) < 1e-9 && maxAnc2 < bestMaxAnc2 - 1e-12)) {
      bestDrag2 = drag2;
      bestMaxAnc2 = maxAnc2;
      const clB = build(Lbf, Led, theta);
      const outB = computePathOutlineFromSegmentSides(clB, segmentSides, pathWidthM);
      if (outB.length === 8) {
        bestOutline = outB.map(p => ({ ...p }));
        bestCl = clB.map(p => ({ ...p }));
      }
    }
    if (drag2 < 1e-8 && maxAnc2 < tolAnchor2 * 0.25) {
      const clTry = build(Lbf, Led, theta);
      const out = computePathOutlineFromSegmentSides(clTry, segmentSides, pathWidthM);
      if (out.length === 8) {
        return { outline: out.map(p => ({ ...p })), centerline: clTry.map(p => ({ ...p })) };
      }
    }

    const hL = Math.max(1e-4, Lbf * 1e-4);
    const hLd = Math.max(1e-4, Led * 1e-4);
    const hT = 1e-5;

    const col = (lb: number, ld: number, th: number): number[] | null => {
      const rr = residualVec(lb, ld, th);
      return rr;
    };

    const c0 = col(Lbf, Led, theta);
    if (!c0) continue;
    const cL = col(Lbf + hL, Led, theta);
    const cLd = col(Lbf, Led + hLd, theta);
    const cT = col(Lbf, Led, theta + hT);
    if (!cL || !cLd || !cT) continue;

    const jL = cL.map((v, i) => (v - c0[i]!) / hL);
    const jLd = cLd.map((v, i) => (v - c0[i]!) / hLd);
    const jT = cT.map((v, i) => (v - c0[i]!) / hT);

    let jtj11 = lam,
      jtj12 = 0,
      jtj13 = 0,
      jtj22 = lam,
      jtj23 = 0,
      jtj33 = lam;
    let jtb1 = 0,
      jtb2 = 0,
      jtb3 = 0;
    for (let i = 0; i < m; i++) {
      const jl = jL[i]!,
        jd = jLd[i]!,
        jt = jT[i]!;
      const ri = c0[i]!;
      jtj11 += jl * jl;
      jtj12 += jl * jd;
      jtj13 += jl * jt;
      jtj22 += jd * jd;
      jtj23 += jd * jt;
      jtj33 += jt * jt;
      jtb1 += jl * ri;
      jtb2 += jd * ri;
      jtb3 += jt * ri;
    }

    const sol = solve3x3Sym(jtj11, jtj12, jtj13, jtj22, jtj23, jtj33, -jtb1, -jtb2, -jtb3);
    if (!sol) break;

    let dLbf = sol.x,
      dLed = sol.y,
      dTh = sol.z;
    const stepCap = 10;
    const nm = Math.hypot(dLbf, dLed, dTh * (Lbf + Led));
    if (nm > stepCap) {
      const s = stepCap / nm;
      dLbf *= s;
      dLed *= s;
      dTh *= s;
    }
    const damp = 0.55;
    Lbf = Math.max(1e-6, Lbf + dLbf * damp);
    Led = Math.max(1e-6, Led + dLed * damp);
    theta += dTh * damp;
  }

  if (bestOutline && bestCl && bestDrag2 <= tolSnap2 * 2.2 && bestMaxAnc2 <= tolAnchor2) {
    return { outline: bestOutline, centerline: bestCl };
  }
  return null;
}

/**
 * Compute path polygon on one side of line A-B only.
 * side: "left" = path on left when going A→B, "right" = path on right.
 * Returns 4-point quadrilateral [A, B, offset1, offset0].
 */
export function computePathPolygonOneSide(A: Point, B: Point, pathWidthM: number, side: "left" | "right"): Point[] {
  const half = toPixels(pathWidthM) / 2;
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return [];
  const nx = -dy / len;
  const ny = dx / len;
  const sign = side === "left" ? 1 : -1;
  const offset0 = { x: A.x + sign * nx * half, y: A.y + sign * ny * half };
  const offset1 = { x: B.x + sign * nx * half, y: B.y + sign * ny * half };
  return [A, B, offset1, offset0];
}

/**
 * Which side of line A→B is point P on? Cross product (P-A) × (B-A).
 * > 0 = left, < 0 = right, ≈ 0 = on line.
 */
export function pointSideOfLine(P: Point, A: Point, B: Point): "left" | "right" | "on" {
  const cross = (P.x - A.x) * (B.y - A.y) - (P.y - A.y) * (B.x - A.x);
  if (Math.abs(cross) < 0.0001) return "on";
  return cross > 0 ? "left" : "right";
}

/**
 * Get polygon outline for wall/kerb/foundation — same footprint as drawLinearElement fill (see computeLinearElementFillOutline).
 */
export function getPolygonLinearOutline(shape: Shape): Point[] {
  if (!isPolygonLinearElement(shape)) return [];
  return computeLinearElementFillOutline(shape);
}

/**
 * Extract segment lengths from wall/kerb/foundation polygon outline.
 * Outline has 2n+2 points for n segments: [left0..left_n, right_n..right0].
 * Length = distance along centerline (between cap centers).
 */
export function polygonToSegmentLengths(outline: Point[]): number[] {
  const n = outline.length;
  if (n < 4 || n % 2 !== 0) return [];
  const segCount = (n - 2) / 2;
  const lengths: number[] = [];

  if (segCount === 1) {
    // Single segment: centerline would give same point twice. Use cap centers directly.
    // centerStart = midpoint(left0, right0), centerEnd = midpoint(left1, right1)
    const centerStart = midpoint(outline[0], outline[n - 1]);
    const centerEnd = midpoint(outline[1], outline[2]);
    lengths.push(toMeters(distance(centerStart, centerEnd)));
    return lengths;
  }

  const centerline = polygonToCenterline(outline);
  if (centerline.length < 2) return [];
  for (let i = 0; i < centerline.length - 1; i++) {
    lengths.push(toMeters(distance(centerline[i], centerline[i + 1])));
  }
  return lengths;
}

/**
 * Map polygon outline edge index to segment index. Returns -1 for cap edges.
 * Outline: [left0..left_n, right_n..right0], edges 0..n-1 left, n cap, n+1..2n right, 2n+1 cap.
 */
export function polygonEdgeToSegmentIndex(outline: Point[], edgeIdx: number): number {
  const n = outline.length;
  if (n < 4 || n % 2 !== 0) return -1;
  const segCount = (n - 2) / 2;
  if (edgeIdx < segCount) return edgeIdx;
  if (edgeIdx > segCount && edgeIdx <= 2 * segCount) return edgeIdx - segCount - 1;
  return -1;
}

/**
 * Parallel edges of closed strip segment i: left chain i→i+1 and matching right-chain edge.
 * Outline layout matches computeThickPolylineClosed: [left0..left_V, right_V..right_0].
 */
/**
 * Opposite vertex across strip width (same cross-section): closed strip pairs (k, 2V+1−k), open strip (k, n−1−k).
 */
export function stripOppositeVertexIndex(outline: Point[], vertexIdx: number): number | null {
  const n = outline.length;
  if (vertexIdx < 0 || vertexIdx >= n) return null;
  if (isClosedStripPolygonOutline(outline)) {
    const V = (n - 2) / 2;
    const opp = 2 * V + 1 - vertexIdx;
    if (opp < 0 || opp >= n || opp === vertexIdx) return null;
    return opp;
  }
  if (isOpenStripPolygonOutline(outline)) {
    const opp = n - 1 - vertexIdx;
    if (opp < 0 || opp >= n || opp === vertexIdx) return null;
    return opp;
  }
  return null;
}

export function stripOutlineParallelEdges(
  outline: Point[],
  i: number,
): { leftA: Point; leftB: Point; rightA: Point; rightB: Point } | null {
  const n = outline.length;
  if (n < 4 || n % 2 !== 0) return null;
  if (isClosedStripPolygonOutline(outline)) {
    const segCount = (n - 2) / 2;
    if (i < 0 || i >= segCount) return null;
    return {
      leftA: outline[i],
      leftB: outline[i + 1],
      rightA: outline[2 * segCount + 1 - i],
      rightB: outline[2 * segCount - i],
    };
  }
  if (isOpenStripPolygonOutline(outline)) {
    const V = n / 2;
    const segCount = V - 1;
    if (segCount < 1 || i < 0 || i >= segCount) return null;
    return {
      leftA: outline[i],
      leftB: outline[i + 1],
      rightA: outline[n - 1 - i],
      rightB: outline[n - 2 - i],
    };
  }
  return null;
}

function stripOutlinePointsMatch(a: Point, b: Point, tol = 1e-8): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < tol;
}

/** Map polygon edge index to a centerline segment index, or null for end-cap edges. */
export function stripPolygonEdgeToSegmentIndex(outline: Point[], edgeIdx: number): number | null {
  if (isClosedStripPolygonOutline(outline)) {
    const s = polygonEdgeToSegmentIndex(outline, edgeIdx);
    return s >= 0 ? s : null;
  }
  if (isOpenStripPolygonOutline(outline)) {
    return openStripEdgeToCenterSegment(outline, edgeIdx);
  }
  return null;
}

function stripOutlineEdgeEndIndex(outline: Point[], edgeIdx: number): number {
  return isClosedStripPolygonOutline(outline) ? (edgeIdx + 1) % outline.length : edgeIdx + 1;
}

/** Opposite parallel edge index for the same strip segment (or null if cap / not a strip pair). */
export function stripOppositePolygonEdgeIndex(outline: Point[], edgeIdx: number): number | null {
  const n = outline.length;
  if (n < 4 || n % 2 !== 0) return null;
  const seg = stripPolygonEdgeToSegmentIndex(outline, edgeIdx);
  if (seg === null) return null;
  const par = stripOutlineParallelEdges(outline, seg);
  if (!par) return null;
  const j = stripOutlineEdgeEndIndex(outline, edgeIdx);
  if (j < 0 || j >= n) return null;
  const A = outline[edgeIdx];
  const B = outline[j];
  const onLeft =
    (stripOutlinePointsMatch(A, par.leftA) && stripOutlinePointsMatch(B, par.leftB)) ||
    (stripOutlinePointsMatch(A, par.leftB) && stripOutlinePointsMatch(B, par.leftA));
  const onRight =
    (stripOutlinePointsMatch(A, par.rightA) && stripOutlinePointsMatch(B, par.rightB)) ||
    (stripOutlinePointsMatch(A, par.rightB) && stripOutlinePointsMatch(B, par.rightA));
  if (!onLeft && !onRight) return null;
  const targetA = onLeft ? par.rightA : par.leftA;
  const targetB = onLeft ? par.rightB : par.leftB;
  const maxEi = isClosedStripPolygonOutline(outline) ? n - 1 : n - 2;
  for (let ei = 0; ei <= maxEi; ei++) {
    const j2 = stripOutlineEdgeEndIndex(outline, ei);
    const eA = outline[ei];
    const eB = outline[j2];
    if (
      (stripOutlinePointsMatch(eA, targetA) && stripOutlinePointsMatch(eB, targetB)) ||
      (stripOutlinePointsMatch(eA, targetB) && stripOutlinePointsMatch(eB, targetA))
    ) {
      return ei;
    }
  }
  return null;
}

/**
 * Keeps arc points on both parallel strip edges aligned (same ids, mirrored t/offset on opposite chord).
 * Canonical arc data for segment i is stored on the left-chain edge index `i` (same as stripOutlineParallelEdges).
 */
export function applyStripParallelEdgeArcSync(shape: Shape): Shape {
  const pts0 = shape.points;
  const pathRibbonArcSync =
    isPathElement(shape) &&
    Boolean(shape.calculatorInputs?.pathIsOutline) &&
    (isOpenStripPolygonOutline(pts0) || isClosedStripPolygonOutline(pts0));
  if (!isPolygonLinearStripOutline(shape) && !pathRibbonArcSync) return shape;
  const pts = shape.points;
  const n = pts.length;
  const segCount = isClosedStripPolygonOutline(pts)
    ? (n - 2) / 2
    : isOpenStripPolygonOutline(pts)
      ? n / 2 - 1
      : 0;
  if (segCount < 1) return shape;
  let edgeArcs = shape.edgeArcs ? [...shape.edgeArcs] : [];
  while (edgeArcs.length < n) edgeArcs.push(null);
  for (let seg = 0; seg < segCount; seg++) {
    const par = stripOutlineParallelEdges(pts, seg);
    if (!par) continue;
    const leftEi = seg;
    const rightEi = stripOppositePolygonEdgeIndex(pts, leftEi);
    if (rightEi == null) continue;
    const arcsLeft = edgeArcs[leftEi];
    const arcsRight = edgeArcs[rightEi];
    let canonical: ArcPoint[] | null = null;
    if (arcsLeft && arcsLeft.length > 0) {
      canonical = arcsLeft;
    } else if (arcsRight && arcsRight.length > 0) {
      canonical = pathRibbonArcSync
        ? mirrorArcPointsParallelStripChord(par.rightA, par.rightB, par.leftA, par.leftB, arcsRight)
        : mirrorArcPointsToOppositeChord(par.rightA, par.rightB, par.leftA, par.leftB, arcsRight);
      edgeArcs[leftEi] = canonical;
    }
    if (!canonical || canonical.length === 0) {
      edgeArcs[leftEi] = null;
      edgeArcs[rightEi] = null;
    } else {
      const mirrored = pathRibbonArcSync
        ? mirrorArcPointsParallelStripChord(par.leftA, par.leftB, par.rightA, par.rightB, canonical)
        : mirrorArcPointsToOppositeChord(par.leftA, par.leftB, par.rightA, par.rightB, canonical);
      edgeArcs[rightEi] = mirrored.length ? mirrored : null;
    }
  }
  const hasAny = edgeArcs.some(a => a && a.length > 0);
  return { ...shape, edgeArcs: hasAny ? edgeArcs : undefined };
}

/** Mean length in meters for strip segment i (average of left and right parallel edges). */
export function stripOutlineSegmentLengthMeanM(
  outline: Point[],
  i: number,
  arcForSegment?: ArcPoint[] | null
): number | null {
  const e = stripOutlineParallelEdges(outline, i);
  if (!e) return null;
  if (arcForSegment && arcForSegment.length > 0) {
    return toMeters(calcEdgeLengthWithArcs(e.leftA, e.leftB, arcForSegment));
  }
  return toMeters((distance(e.leftA, e.leftB) + distance(e.rightA, e.rightB)) / 2);
}

/**
 * Remove segment at index segIdx from polygon outline. Returns new outline or null if invalid.
 * Outline: [left0..left_n, right_n..right0]. Segment i uses left[i]-left[i+1] and right[n-i-1]-right[n-i].
 */
export function removeSegmentFromPolygonOutline(outline: Point[], segIdx: number): Point[] | null {
  const n = outline.length;
  if (n < 6 || n % 2 !== 0) return null; // need at least 2 segments
  const segCount = (n - 2) / 2;
  if (segIdx < 0 || segIdx >= segCount) return null;
  const left = outline.slice(0, segCount + 1);
  const right = outline.slice(segCount + 1); // [right_n, right_{n-1}, ..., right_0]
  left.splice(segIdx, 2); // remove left[segIdx] and left[segIdx+1]
  const rightIdx = segCount - 1 - segIdx; // right edge of segment segIdx: right[rightIdx] to right[rightIdx+1]
  right.splice(rightIdx, 2);
  if (left.length < 2 || right.length < 2) return null;
  return [...left, ...right];
}

/** Map perimeter edge index → center segment index, or null for end-cap edges. */
export function openStripEdgeToCenterSegment(outline: Point[], edgeIdx: number): number | null {
  const n = outline.length;
  if (!isOpenStripPolygonOutline(outline)) return null;
  const V = n / 2;
  if (edgeIdx < 0 || edgeIdx >= n) return null;
  if (edgeIdx <= V - 2) return edgeIdx;
  if (edgeIdx === V - 1 || edgeIdx === n - 1) return null;
  if (edgeIdx >= V && edgeIdx <= n - 2) return n - 2 - edgeIdx;
  return null;
}

/** Remove one run segment from open strip by merging centerline and rebuilding thickness. */
export function removeOpenStripSegmentAndRebuild(outline: Point[], centerSegIdx: number, thicknessPx: number): Point[] | null {
  const c = extractCenterlineFromOpenStripOutline(outline);
  if (c.length < 3 || centerSegIdx < 0 || centerSegIdx >= c.length - 1) return null;
  const merged = [...c.slice(0, centerSegIdx + 1), ...c.slice(centerSegIdx + 2)];
  if (merged.length < 2) return null;
  const rebuilt = computeThickPolyline(merged, thicknessPx);
  return rebuilt.length >= 4 ? rebuilt : null;
}

/**
 * Extract centerline from wall/kerb/foundation polygon outline for labels.
 * Returns n+1 points for n segments.
 */
export function polygonToCenterline(outline: Point[]): Point[] {
  if (isOpenStripPolygonOutline(outline)) {
    return extractCenterlineFromOpenStripOutline(outline);
  }
  const n = outline.length;
  if (n < 4 || n % 2 !== 0) return [];
  const segCount = (n - 2) / 2;
  const centerline: Point[] = [];
  for (let i = 0; i <= segCount; i++) {
    let leftMid: Point;
    let rightMid: Point;
    if (i === 0) {
      leftMid = midpoint(outline[0], outline[1]);
      rightMid = midpoint(outline[n - 1], outline[n - 2]);
    } else if (i === segCount) {
      leftMid = midpoint(outline[segCount - 1], outline[segCount]);
      rightMid = midpoint(outline[segCount + 1], outline[segCount + 2]);
    } else {
      leftMid = midpoint(outline[i], outline[i + 1]);
      const rightIdx = n - 1 - i;
      rightMid = midpoint(outline[rightIdx], outline[rightIdx - 1]);
    }
    centerline.push(midpoint(leftMid, rightMid));
  }
  const EPS = 1e-8;
  while (centerline.length >= 2) {
    const a = centerline[centerline.length - 1];
    const b = centerline[centerline.length - 2];
    if (distance(a, b) < EPS) {
      centerline.pop();
    } else {
      break;
    }
  }
  // One-segment outline (n===4): collapsing duplicates can leave a single point while
  // polygonToSegmentLengths still reports one edge — same cap midpoints as that function.
  if (centerline.length < 2 && segCount === 1) {
    const centerStart = midpoint(outline[0], outline[n - 1]);
    const centerEnd = midpoint(outline[1], outline[2]);
    return [centerStart, centerEnd];
  }
  if (centerline.length === segCount && segCount >= 2) {
    centerline.push({ ...centerline[0] });
  }
  return centerline;
}

/**
 * Build path points for a linear element, using curve samples for segments with arcs.
 * Exported for path outline computation (arcs) and segment-based slab layout.
 */
export function getLinearElementPath(shape: Shape): Point[] {
  const pts = shape.points;
  if (pts.length < 2) return [];
  /** Strip wall/kerb/foundation: always use centerline polyline — never fall through to perimeter edge loop below (that mixes chord indices with strip topology and duplicates straight + curved). */
  if (isPolygonLinearStripOutline(shape) && isPolygonLinearElement(shape)) {
    const withArcs = buildStripCenterlinePolylineWithArcs(shape);
    if (withArcs.length >= 2) return withArcs;
    const baseOnly = getPolygonLinearStripCenterlinePoints(shape);
    if (baseOnly.length >= 2) return baseOnly;
    return [];
  }
  if (
    shape.elementType === "wall" &&
    shape.calculatorInputs?.wallDrawBaseline === true &&
    isPolygonLinearElement(shape) &&
    !shape.linearOpenStripOutline
  ) {
    const half = toPixels(getPolygonThicknessM(shape)) / 2;
    const face = shape.calculatorInputs.wallDrawFace === "right" ? "right" : "left";
    const centerPts = baselineFacePolylineToCenterline(pts, half, face);
    if (centerPts.length < 2) return [];
    const path: Point[] = [centerPts[0]];
    for (let i = 0; i < centerPts.length - 1; i++) {
      const A = centerPts[i];
      const B = centerPts[i + 1];
      const arcs = shape.edgeArcs?.[i];
      if (arcs && arcs.length > 0) {
        const samples = sampleArcEdge(A, B, arcs, 48);
        for (let s = 1; s < samples.length - 1; s++) {
          path.push(samples[s]);
        }
      }
      path.push(B);
    }
    return path;
  }
  const path: Point[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i];
    const B = pts[i + 1];
    const arcs = shape.edgeArcs?.[i];
    if (arcs && arcs.length > 0) {
      const samples = sampleArcEdge(A, B, arcs, 48);
      for (let s = 1; s < samples.length - 1; s++) {
        path.push(samples[s]);
      }
    }
    path.push(B);
  }
  return path;
}

// Point-in-polygon (ray casting)
function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Minimum hit area in screen pixels — ensures fence/wall/kerb are easy to click */
const LINEAR_HIT_MIN_SCREEN_PX = 24;

const CAVITY_GAP_M = 0.01; // 1 cm between outer brick leaf and inner leaf

/** Outer leaf thickness (m) — matches WallCalculator. */
function getOuterLeafThicknessM(
  outerType: "brick" | "block4" | "block7",
  brickBond: "stretcher" | "header" | undefined,
  laying: "flat" | "standing" | undefined
): number {
  if (outerType === "brick") {
    return brickBond === "header" ? 0.215 : 0.10;
  }
  if (outerType === "block4") {
    return laying === "flat" ? 0.215 : 0.10;
  }
  if (outerType === "block7") {
    return laying === "flat" ? 0.215 : 0.14;
  }
  return 0.10;
}

/** Inner leaf thickness (m) — matches WallCalculator. */
function getInnerLeafThicknessM(
  innerType: "brick" | "block4" | "block7" | undefined,
  innerLaying: "flat" | "standing" | undefined,
  innerBrickBond: "stretcher" | "header" | undefined
): number {
  if (innerType === "brick") {
    return innerBrickBond === "header" ? 0.215 : 0.10;
  }
  if (innerType === "block4") {
    return innerLaying === "flat" ? 0.215 : 0.10;
  }
  if (innerType === "block7") {
    return innerLaying === "flat" ? 0.215 : 0.14;
  }
  return 0.10;
}

/** Base wall thickness (m) from calculator inputs — brick bond vs block laying. Excludes tile cladding. */
function getWallThicknessMFromCalculatorInputs(shape: Shape): number {
  const layingMethod = shape.calculatorInputs?.layingMethod as "flat" | "standing" | undefined;
  const subType = shape.calculatorSubType as string | undefined;
  const inputs = shape.calculatorInputs ?? {};

  if (subType === "double_wall") {
    const outerType = (inputs.outerWallType as "brick" | "block4" | "block7") ?? "brick";
    const innerType = (inputs.innerWallType as "brick" | "block4" | "block7") ?? "block4";
    const outerBond = (inputs.outerBrickBond ?? inputs.brickBond) as "stretcher" | "header" | undefined;
    const innerBond = (inputs.innerBrickBond ?? inputs.brickBond) as "stretcher" | "header" | undefined;
    const outerLm = (inputs.outerLayingMethod as "flat" | "standing" | undefined) ?? layingMethod ?? "standing";
    const innerLm = (inputs.innerLayingMethod as "flat" | "standing" | undefined) ?? "standing";
    const tOuter = getOuterLeafThicknessM(outerType, outerBond, outerLm);
    const tInner = getInnerLeafThicknessM(innerType, innerLm, innerBond);
    return tOuter + CAVITY_GAP_M + tInner;
  }

  if (subType === "brick") {
    const bond = inputs.brickBond as "stretcher" | "header" | undefined;
    const tOuter = bond === "header" ? 0.215 : 0.10;
    if (inputs.cavityWall) {
      const innerType = inputs.innerWallType as "brick" | "block4" | "block7" | undefined;
      const innerLm = inputs.innerLayingMethod as "flat" | "standing" | undefined;
      const tInner = getInnerLeafThicknessM(innerType, innerLm, bond);
      return tOuter + CAVITY_GAP_M + tInner;
    }
    return tOuter;
  }
  if (layingMethod === "flat") {
    return 0.215;
  }
  return subType === "block7" ? 0.14 : 0.10;
}

/** One segment row: shared start/end plus optional per-leaf heights (m) for double wall; 0 = leaf off on that segment. */
export type WallSegmentHeightRow = {
  startH: number;
  endH: number;
  outerStartH?: number;
  outerEndH?: number;
  innerStartH?: number;
  innerEndH?: number;
};

/** Edges along centerline polyline (not strip outline). Closed loop has one edge per vertex. */
export function getWallPolylineEdgeCount(shape: Shape): number {
  if (shape.linearOpenStripOutline) return 0;
  const pts = shape.points;
  const n = pts.length;
  if (n < 2) return 0;
  /** Strip outline from computeThickPolyline: centerline segment count, not perimeter vertex count. */
  if (shape.closed && n >= 6 && n % 2 === 0 && isClosedStripPolygonOutline(pts)) {
    return (n - 2) / 2;
  }
  if (!shape.closed && n >= 4 && n % 2 === 0 && isOpenStripPolygonOutline(pts)) {
    return n / 2 - 1;
  }
  if (shape.closed && n >= 3) return n;
  return n - 1;
}

/**
 * Wall centerline in world units — from strip polygon outline, or empty when not a wall strip.
 */
export function getWallCenterlinePoints(shape: Shape): Point[] {
  if (shape.elementType !== "wall" || !isPolygonLinearStripOutline(shape)) {
    return [];
  }
  const pts = shape.points;
  if (shape.closed && pts.length >= 6 && pts.length % 2 === 0 && isClosedStripPolygonOutline(pts)) {
    return polygonToCenterline(pts);
  }
  if (!shape.closed && shape.linearOpenStripOutline && isOpenStripPolygonOutline(pts)) {
    return extractCenterlineFromOpenStripOutline(pts);
  }
  return [];
}

/**
 * Centerline polyline for wall/kerb/foundation strip (open or closed), same as strip outline extraction.
 */
export function getPolygonLinearStripCenterlinePoints(shape: Shape): Point[] {
  if (!isPolygonLinearStripOutline(shape)) return [];
  if (shape.elementType === "wall") {
    const w = getWallCenterlinePoints(shape);
    if (w.length >= 2) return w;
  }
  const pts = shape.points;
  if (shape.linearOpenStripOutline && isOpenStripPolygonOutline(pts)) {
    return extractCenterlineFromOpenStripOutline(pts);
  }
  if (shape.closed && isClosedStripPolygonOutline(pts)) {
    return polygonToCenterline(pts);
  }
  return [];
}

/**
 * Dense centerline polyline for a strip with arc points on left-chain edges (same chords as canvas arc UI).
 * Used for outline fill and arc-length labels.
 */
export function buildStripCenterlinePolylineWithArcs(shape: Shape): Point[] {
  const outline = shape.points;
  if (!isPolygonLinearStripOutline(shape)) return [];
  const base = getPolygonLinearStripCenterlinePoints(shape);
  if (base.length < 2) return base;
  const edgeArcs = shape.edgeArcs;
  if (!edgeArcs?.some((a) => a && a.length > 0)) return base;

  const interiorRef = centroid(outline);
  const thicknessPx = Math.max(4, toPixels(getLinearElementThicknessM(shape)));
  const halfW = thicknessPx / 2;

  const nSeg = base.length - 1;

  const path: Point[] = [{ ...base[0]! }];
  for (let i = 0; i < nSeg; i++) {
    const arcs = edgeArcs[i];
    const par = stripOutlineParallelEdges(outline, i);
    if (!par) break;
    if (arcs && arcs.length > 0) {
      const centers = sampleArcEdgeLeftToCenterline(par.leftA, par.leftB, arcs, halfW, interiorRef, 48);
      for (let k = 1; k < centers.length; k++) {
        path.push(centers[k]!);
      }
    } else {
      path.push({ ...base[i + 1]! });
    }
  }
  return path;
}

function wallTileExtraThicknessM(shape: Shape): number {
  if (shape.elementType !== "wall" || !shape.calculatorInputs?.includeTileInstallation) return 0;
  const slabCm = parseFloat(String(shape.calculatorInputs?.wallTileSlabThicknessCm ?? 2)) || 2;
  const adhesiveCm = parseFloat(String(shape.calculatorInputs?.wallTileAdhesiveThicknessCm ?? 0.5)) || 0.5;
  return (2 * slabCm + 2 * adhesiveCm) / 100;
}

export function getSegmentOuterLeafAvgM(
  row: WallSegmentHeightRow | undefined,
  fallbackStart: number,
  fallbackEnd: number
): number {
  const s = row?.outerStartH ?? row?.startH ?? fallbackStart;
  const e = row?.outerEndH ?? row?.endH ?? fallbackEnd;
  return Math.max(0, (Number(s) + Number(e)) / 2);
}

export function getSegmentInnerLeafAvgM(
  row: WallSegmentHeightRow | undefined,
  fallbackStart: number,
  fallbackEnd: number
): number {
  const s = row?.innerStartH ?? row?.startH ?? fallbackStart;
  const e = row?.innerEndH ?? row?.endH ?? fallbackEnd;
  return Math.max(0, (Number(s) + Number(e)) / 2);
}

/**
 * Structural thickness (m) for one wall edge — double wall when segmentHeights align with edges.
 * 0 = both leaves off (no fill on that edge).
 */
export function getDoubleWallSegmentThicknessM(shape: Shape, edgeIdx: number): number {
  const inputs = shape.calculatorInputs ?? {};
  const structuralFallback = getWallThicknessMFromCalculatorInputs(shape);
  if (shape.calculatorSubType !== "double_wall") return structuralFallback;
  const rows = inputs.segmentHeights as WallSegmentHeightRow[] | undefined;
  const nEdge = getWallPolylineEdgeCount(shape);
  if (!rows || rows.length !== nEdge || nEdge === 0) return structuralFallback;
  const row = rows[edgeIdx];
  const defaultH = parseFloat(String(inputs.height ?? "0")) || 0;
  const oAvg = getSegmentOuterLeafAvgM(row, defaultH, defaultH);
  const iAvg = getSegmentInnerLeafAvgM(row, defaultH, defaultH);
  const outerType = (inputs.outerWallType as "brick" | "block4" | "block7") ?? "brick";
  const innerType = (inputs.innerWallType as "brick" | "block4" | "block7") ?? "block4";
  const layingMethod = inputs.layingMethod as "flat" | "standing" | undefined;
  const outerBond = (inputs.outerBrickBond ?? inputs.brickBond) as "stretcher" | "header" | undefined;
  const innerBond = (inputs.innerBrickBond ?? inputs.brickBond) as "stretcher" | "header" | undefined;
  const outerLm = (inputs.outerLayingMethod as "flat" | "standing" | undefined) ?? layingMethod ?? "standing";
  const innerLm = (inputs.innerLayingMethod as "flat" | "standing" | undefined) ?? "standing";
  const tOuter = getOuterLeafThicknessM(outerType, outerBond, outerLm);
  const tInner = getInnerLeafThicknessM(innerType, innerLm, innerBond);
  if (oAvg <= 0 && iAvg <= 0) return 0;
  if (oAvg <= 0) return tInner;
  if (iAvg <= 0) return tOuter;
  return tOuter + CAVITY_GAP_M + tInner;
}

export function shouldUseDoubleWallPerEdgeThickness(shape: Shape): boolean {
  if (shape.elementType !== "wall") return false;
  if (shape.calculatorSubType !== "double_wall") return false;
  if (shape.linearOpenStripOutline) return false;
  if (shape.calculatorInputs?.wallDrawBaseline) return false;
  /** Arbitrary closed polygon (not strip) — no reliable centerline edges for per-leaf draw. */
  if (isPolygonLinearOutlineStored(shape) && !isPolygonLinearStripOutline(shape)) return false;
  const ec = getWallPolylineEdgeCount(shape);
  if (ec === 0) return false;
  const rows = shape.calculatorInputs?.segmentHeights as WallSegmentHeightRow[] | undefined;
  return Array.isArray(rows) && rows.length === ec;
}

/** Strip closure duplicate from a closed polyline: [A,B,C,D,A] → [A,B,C,D]. computeThickPolylineClosed adds its own wrap-around so the duplicate must be removed to avoid a degenerate corner. */
function stripClosureDup(path: Point[]): Point[] {
  if (path.length >= 4 && distance(path[0], path[path.length - 1]) < 1e-6) {
    return path.slice(0, -1);
  }
  return path;
}

/**
 * Expand a closed strip outline (shape.points) by inserting arc samples on edges that have edgeArcs.
 * Avoids lossy centerline extraction — works directly on the authoritative outline vertices.
 */
function expandClosedStripOutlineWithArcs(shape: Shape): Point[] {
  const outline = shape.points;
  const edgeArcs = shape.edgeArcs;
  const n = outline.length;
  if (!edgeArcs || n < 8 || n % 2 !== 0) return outline;
  if (!isClosedStripPolygonOutline(outline)) return outline;

  const segCount = (n - 2) / 2;
  const result: Point[] = [];

  for (let ei = 0; ei < n; ei++) {
    result.push(outline[ei]);

    let seg: number | null = null;
    let isRight = false;

    if (ei < segCount) {
      seg = ei;
      isRight = false;
    } else if (ei > segCount && ei <= 2 * segCount) {
      seg = 2 * segCount - ei;
      isRight = true;
    }

    if (seg === null || seg < 0 || seg >= segCount) continue;
    const arcs = edgeArcs[seg];
    if (!arcs || arcs.length === 0) continue;
    const par = stripOutlineParallelEdges(outline, seg);
    if (!par) continue;

    if (!isRight) {
      const sampled = sampleArcEdge(par.leftA, par.leftB, arcs, 48);
      for (let k = 1; k < sampled.length - 1; k++) result.push(sampled[k]);
    } else {
      const sampled = sampleArcEdge(par.rightA, par.rightB, arcs, 48);
      for (let k = sampled.length - 2; k >= 1; k--) result.push(sampled[k]);
    }
  }
  return result;
}

/**
 * Same closed polygon as drawLinearElement uses for fill/stroke (single-band path from centerline + thickness).
 * Matches curved strip walls (getLinearElementPath + computeThickPolyline*) — use for Layer 5 adjustment booleans.
 */
export function computeLinearElementFillOutline(shape: Shape): Point[] {
  const pts = shape.points;
  if (pts.length < 2) return [];

  const outlineStored = isPolygonLinearOutlineStored(shape);
  const usePolygonStripLiveThickness =
    isPolygonLinearStripOutline(shape) &&
    (shape.elementType === "wall" || shape.elementType === "kerb" || shape.elementType === "foundation");
  const usePerEdgeDoubleWall =
    shape.elementType === "wall" && shouldUseDoubleWallPerEdgeThickness(shape);

  if (outlineStored && !usePolygonStripLiveThickness) {
    return pts;
  }
  if (outlineStored && usePolygonStripLiveThickness) {
    const hasActiveArcs = shape.edgeArcs?.some((a) => a && a.length > 0);
    if (hasActiveArcs) {
      if (shape.closed) {
        return expandClosedStripOutlineWithArcs(shape);
      }
      const pathPts = getLinearElementPath(shape);
      if (pathPts.length >= 2) {
        const thicknessM = getLinearElementThicknessM(shape);
        const thicknessPx = Math.max(4, toPixels(thicknessM));
        return computeThickPolyline(pathPts, thicknessPx);
      }
    }
    if (usePerEdgeDoubleWall && shape.closed) {
      const pathPts = getLinearElementPath(shape);
      const thinPx = Math.max(4, toPixels(0.05));
      if (pathPts.length >= 2) {
        const cl = stripClosureDup(pathPts);
        return computeThickPolylineClosed(cl, thinPx);
      }
    }
    return pts;
  }
  if (usePerEdgeDoubleWall) {
    const pathPts = getLinearElementPath(shape);
    const thinPx = Math.max(4, toPixels(0.05));
    if (pathPts.length >= 2) {
      return computeThickPolyline(pathPts, thinPx);
    }
    if (pathPts.length === 1) {
      return [pathPts[0], { x: pathPts[0].x + 1e-6, y: pathPts[0].y }];
    }
    return pts;
  }
  const pathPts = getLinearElementPath(shape);
  const thicknessM = getLinearElementThicknessM(shape);
  const thicknessPx = Math.max(4, toPixels(thicknessM));
  return computeThickPolyline(pathPts, thicknessPx);
}

/**
 * For open strip walls with arc densification on the centerline, maps logical centerline vertex k (0..V-1)
 * to an index in getLinearElementPath(shape) (length L). Must stay in sync with buildStripCenterlinePolylineWithArcs.
 */
function logicalVertexToDensePathIndex(shape: Shape): number[] | null {
  const outline = shape.points;
  if (!isPolygonLinearStripOutline(shape) || !shape.linearOpenStripOutline) return null;
  if (!isOpenStripPolygonOutline(outline)) return null;
  const base = getPolygonLinearStripCenterlinePoints(shape);
  if (base.length < 2) return null;
  const V = base.length;
  const edgeArcs = shape.edgeArcs;
  if (!edgeArcs?.some((a) => a && a.length > 0)) {
    return Array.from({ length: V }, (_, k) => k);
  }

  const interiorRef = centroid(outline);
  const thicknessPx = Math.max(4, toPixels(getLinearElementThicknessM(shape)));
  const halfW = thicknessPx / 2;
  const nSeg = base.length - 1;

  const map: number[] = new Array(V);
  const path: Point[] = [{ ...base[0]! }];
  map[0] = 0;
  for (let i = 0; i < nSeg; i++) {
    const arcs = edgeArcs[i];
    const par = stripOutlineParallelEdges(outline, i);
    if (!par) return null;
    if (arcs && arcs.length > 0) {
      const centers = sampleArcEdgeLeftToCenterline(par.leftA, par.leftB, arcs, halfW, interiorRef, 48);
      for (let k = 1; k < centers.length; k++) {
        path.push(centers[k]!);
      }
    } else {
      path.push({ ...base[i + 1]! });
    }
    map[i + 1] = path.length - 1;
  }
  return map;
}

/**
 * World position for vertex grips on open strip linear elements: true miter corners of the filled outline
 * (inner–inner / outer–outer intersections from computeThickPolyline), not stale shape.points when arcs bend the outline.
 * Pass `denseOutline` when calling in a loop (same as computeLinearElementFillOutline(shape)) to avoid recomputing.
 */
export function getLinearElementVertexGripWorld(shape: Shape, pointIdx: number, denseOutline?: Point[]): Point {
  const pts = shape.points;
  if (pointIdx < 0 || pointIdx >= pts.length) return pts[Math.max(0, Math.min(pointIdx, pts.length - 1))] ?? { x: 0, y: 0 };
  if (!isPolygonLinearElement(shape) || !isPolygonLinearStripOutline(shape) || !shape.linearOpenStripOutline) {
    return pts[pointIdx];
  }
  if (!isOpenStripPolygonOutline(pts)) return pts[pointIdx];

  const n = pts.length;
  if (n < 4 || n % 2 !== 0) return pts[pointIdx];

  const pathPts = getLinearElementPath(shape);
  const L = pathPts.length;
  if (L < 2) return pts[pointIdx];

  const dense = denseOutline ?? computeLinearElementFillOutline(shape);
  if (dense.length !== 2 * L) return pts[pointIdx];

  const V = n / 2;
  const map = logicalVertexToDensePathIndex(shape);
  if (!map || map.length !== V) return pts[pointIdx];
  if (map[V - 1] !== L - 1) return pts[pointIdx];

  const mirror = n - 1 - pointIdx;
  if (pointIdx <= mirror) {
    return { ...dense[map[pointIdx]]! };
  }
  const k = mirror;
  return { ...dense[2 * L - 1 - map[k]!]! };
}

/** Full thickness for one edge (structural + optional tile cladding). */
export function getWallThicknessMForEdge(shape: Shape, edgeIdx: number): number {
  if (shape.elementType !== "wall") {
    return getPolygonThicknessM(shape);
  }
  const tile = wallTileExtraThicknessM(shape);
  if (shouldUseDoubleWallPerEdgeThickness(shape)) {
    return getDoubleWallSegmentThicknessM(shape, edgeIdx) + tile;
  }
  return getLinearElementThicknessM(shape);
}

function getWallEdgePathPoints(shape: Shape, edgeIdx: number): Point[] {
  const pts = shape.points;
  const n = pts.length;
  if (n < 2) return [];

  if (shape.elementType === "wall" && isPolygonLinearStripOutline(shape)) {
    const ec = getWallPolylineEdgeCount(shape);
    if (edgeIdx < 0 || edgeIdx >= ec) return [];
    const par = stripOutlineParallelEdges(pts, edgeIdx);
    if (!par) return [];
    const arcs = shape.edgeArcs?.[edgeIdx];
    if (arcs && arcs.length > 0) {
      return sampleArcEdge(par.leftA, par.leftB, arcs, 48);
    }
    return [par.leftA, par.leftB];
  }

  const edgeCount = shape.closed && n >= 3 ? n : n - 1;
  if (edgeIdx < 0 || edgeIdx >= edgeCount) return [];
  let A: Point;
  let B: Point;
  if (shape.closed && n >= 3) {
    A = pts[edgeIdx];
    B = pts[(edgeIdx + 1) % n];
  } else {
    A = pts[edgeIdx];
    B = pts[edgeIdx + 1];
  }
  const arcs = shape.edgeArcs?.[edgeIdx];
  if (arcs && arcs.length > 0) {
    return sampleArcEdge(A, B, arcs, 48);
  }
  return [A, B];
}

function offsetPointWorld(p: Point, nx: number, ny: number, distM: number): Point {
  const d = toPixels(distM);
  return { x: p.x + nx * d, y: p.y + ny * d };
}

function drawWallDoubleWallPerEdge(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  fillColor: string,
  strokeColor: string,
  isSelected: boolean
): void {
  const edgeCount = getWallPolylineEdgeCount(shape);
  const lineW = isSelected ? 2.5 : 1.5;
  const cl = getWallCenterlinePoints(shape);
  const pathForCtr = cl.length >= 2 ? cl : getLinearElementPath(shape);
  const ctrPoly = centroid(pathForCtr);
  const tile = wallTileExtraThicknessM(shape);
  const inputs = shape.calculatorInputs ?? {};
  const defaultH = parseFloat(String(inputs.height ?? "0")) || 0;
  const outerType = (inputs.outerWallType as "brick" | "block4" | "block7") ?? "brick";
  const innerType = (inputs.innerWallType as "brick" | "block4" | "block7") ?? "block4";
  const layingMethod = inputs.layingMethod as "flat" | "standing" | undefined;
  const outerBond = (inputs.outerBrickBond ?? inputs.brickBond) as "stretcher" | "header" | undefined;
  const innerBond = (inputs.innerBrickBond ?? inputs.brickBond) as "stretcher" | "header" | undefined;
  const outerLm = (inputs.outerLayingMethod as "flat" | "standing" | undefined) ?? layingMethod ?? "standing";
  const innerLm = (inputs.innerLayingMethod as "flat" | "standing" | undefined) ?? "standing";
  const tOuterLeaf = getOuterLeafThicknessM(outerType, outerBond, outerLm);
  const tInnerLeaf = getInnerLeafThicknessM(innerType, innerLm, innerBond);

  const drawFilledOutline = (outlineSeg: Point[]) => {
    if (outlineSeg.length < 2) return;
    ctx.beginPath();
    const p0 = worldToScreen(outlineSeg[0].x, outlineSeg[0].y);
    ctx.moveTo(p0.x, p0.y);
    for (let k = 1; k < outlineSeg.length; k++) {
      const p = worldToScreen(outlineSeg[k].x, outlineSeg[k].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineW;
    ctx.stroke();
  };

  for (let i = 0; i < edgeCount; i++) {
    const thicknessM = getWallThicknessMForEdge(shape, i);
    if (thicknessM <= 1e-12) continue;
    const thicknessPx = Math.max(4, toPixels(thicknessM));
    const segPath = getWallEdgePathPoints(shape, i);
    const row = (inputs.segmentHeights as WallSegmentHeightRow[] | undefined)?.[i];
    const oAvg = getSegmentOuterLeafAvgM(row, defaultH, defaultH);
    const iAvg = getSegmentInnerLeafAvgM(row, defaultH, defaultH);
    const outerOn = oAvg > 0;
    const innerOn = iAvg > 0;

    for (let j = 0; j < segPath.length - 1; j++) {
      const A = segPath[j];
      const B = segPath[j + 1];
      const nW = worldOutwardUnitFromCentroid(A, B, ctrPoly);

      if (outerOn && innerOn) {
        const outerCenterOffM = (tInnerLeaf + CAVITY_GAP_M) / 2;
        const innerCenterOffM = (tOuterLeaf + CAVITY_GAP_M) / 2;
        const tileBand = tile > 0 ? tile / 2 : 0;
        const outerPx = Math.max(4, toPixels(tOuterLeaf + tileBand));
        const innerPx = Math.max(4, toPixels(tInnerLeaf + tileBand));
        const pAo = offsetPointWorld(A, nW.nx, nW.ny, outerCenterOffM);
        const pBo = offsetPointWorld(B, nW.nx, nW.ny, outerCenterOffM);
        drawFilledOutline(computeThickPolyline([pAo, pBo], outerPx));
        const pAi = offsetPointWorld(A, -nW.nx, -nW.ny, innerCenterOffM);
        const pBi = offsetPointWorld(B, -nW.nx, -nW.ny, innerCenterOffM);
        drawFilledOutline(computeThickPolyline([pAi, pBi], innerPx));
      } else {
        const outlineSeg = computeThickPolyline([segPath[j], segPath[j + 1]], thicknessPx);
        drawFilledOutline(outlineSeg);
      }
    }
  }
}

export function getLinearElementThicknessM(shape: Shape): number {
  let thicknessM: number;
  if (shape.elementType === "wall") {
    thicknessM = getWallThicknessMFromCalculatorInputs(shape);
  } else {
    thicknessM = shape.thickness ?? 0.10;
  }
  if (shape.elementType === "wall" && shape.calculatorInputs?.includeTileInstallation) {
    const slabCm = parseFloat(String(shape.calculatorInputs?.wallTileSlabThicknessCm ?? 2)) || 2;
    const adhesiveCm = parseFloat(String(shape.calculatorInputs?.wallTileAdhesiveThicknessCm ?? 0.5)) || 0.5;
    thicknessM += (2 * slabCm + 2 * adhesiveCm) / 100;
  }
  return thicknessM;
}

/** Thickness for wall/kerb/foundation WITHOUT mortar — for polygon conversion and adjustment layer. */
export function getPolygonThicknessM(shape: Shape): number {
  if (shape.elementType === "wall") {
    let thicknessM = getWallThicknessMFromCalculatorInputs(shape);
    if (shape.calculatorInputs?.includeTileInstallation) {
      const slabCm = parseFloat(String(shape.calculatorInputs?.wallTileSlabThicknessCm ?? 2)) || 2;
      const adhesiveCm = parseFloat(String(shape.calculatorInputs?.wallTileAdhesiveThicknessCm ?? 0.5)) || 0.5;
      thicknessM += (2 * slabCm + 2 * adhesiveCm) / 100;
    }
    return thicknessM;
  }
  if (shape.elementType === "kerb") {
    const kerbType = shape.calculatorSubType as "kl" | "rumbled" | "flat" | "sets" | undefined;
    const inputs = shape.calculatorInputs ?? {};
    if (kerbType === "kl") return 0.10;
    if (kerbType === "flat") {
      const idx = Number(inputs.selectedFlatDimensionsIndex ?? 0);
      const opts = [{ length: 100, height: 15, width: 5 }, { length: 100, height: 20, width: 5 }];
      return ((opts[idx] ?? opts[0]).width / 100) as number;
    }
    if (kerbType === "rumbled") {
      const standing = Boolean(inputs.isRumbledStanding);
      return standing ? 0.08 : 0.08;
    }
    if (kerbType === "sets") {
      const lengthwise = Boolean(inputs.setsLengthwise);
      return lengthwise ? 0.10 : 0.10;
    }
    return 0.10;
  }
  if (shape.elementType === "foundation") {
    return shape.thickness ?? 0.30;
  }
  return 0.10;
}

export function hitTestLinearElement(wp: Point, shape: Shape, zoom: number): boolean {
  const pts = shape.points;
  if (pts.length < 2) return false;
  if (isPolygonLinearElement(shape) && shape.closed && pts.length >= 3) {
    return pointInPolygon(wp, pts);
  }
  if (isPolygonLinearElement(shape) && shape.linearOpenStripOutline && isOpenStripPolygonOutline(pts)) {
    return pointInPolygon(wp, pts);
  }
  if (
    shape.elementType === "wall" &&
    shouldUseDoubleWallPerEdgeThickness(shape)
  ) {
    const edgeCount = getWallPolylineEdgeCount(shape);
    const minHitPx = LINEAR_HIT_MIN_SCREEN_PX / zoom;
    for (let i = 0; i < edgeCount; i++) {
      const thicknessM = getWallThicknessMForEdge(shape, i);
      if (thicknessM <= 1e-12) continue;
      const segPath = getWallEdgePathPoints(shape, i);
      const thicknessPx = toPixels(thicknessM);
      const hitWidthPx = Math.max(thicknessPx, minHitPx, 12);
      for (let j = 0; j < segPath.length - 1; j++) {
        const outline = computeThickPolyline([segPath[j], segPath[j + 1]], hitWidthPx);
        if (pointInPolygon(wp, outline)) return true;
      }
    }
    return false;
  }
  const pathPts = getLinearElementPath(shape);
  const thicknessM = getLinearElementThicknessM(shape);
  const thicknessPx = toPixels(thicknessM);
  const minHitPx = LINEAR_HIT_MIN_SCREEN_PX / zoom;
  const hitWidthPx = Math.max(thicknessPx, minHitPx, 12);
  const outline = computeThickPolyline(pathPts, hitWidthPx);
  return pointInPolygon(wp, outline);
}

export function hitTestPathElement(wp: Point, shape: Shape, zoom: number): boolean {
  if (!shape.closed) return false;
  if (shape.calculatorInputs?.pathIsOutline) {
    return pointInPolygon(wp, shape.points);
  }
  const pts = shape.points;
  if (pts.length < 2) return false;
  const pathWidthM = Number(shape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6;
  const thicknessPx = toPixels(pathWidthM);
  const minHitPx = LINEAR_HIT_MIN_SCREEN_PX / zoom;
  const hitWidthPx = Math.max(thicknessPx, minHitPx, 12);
  const outline = computePathRibbonOutlineFromCenterline(pts, !!shape.closed, hitWidthPx);
  return pointInPolygon(wp, outline);
}

type WorldToScreen = (wx: number, wy: number) => Point;

/** Unit normal in world coords, perpendicular to A→B, pointing from edge midpoint away from centroid (outside strip). */
function worldOutwardUnitFromCentroid(A: Point, B: Point, centroid: Point): { nx: number; ny: number } {
  const mx = (A.x + B.x) / 2;
  const my = (A.y + B.y) / 2;
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { nx: 0, ny: -1 };
  let nx = -dy / len;
  let ny = dx / len;
  const vx = centroid.x - mx;
  const vy = centroid.y - my;
  if (nx * vx + ny * vy > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

/** For parallel strip edges, right-chain label uses opposite side of band from left-chain (world normals). */
function stripEdgeOutwardNormals(
  leftA: Point,
  leftB: Point,
  rightA: Point,
  rightB: Point,
  ctr: Point,
): { nLeft: { nx: number; ny: number }; nRight: { nx: number; ny: number } } {
  const nLeft = worldOutwardUnitFromCentroid(leftA, leftB, ctr);
  const tLx = leftB.x - leftA.x;
  const tLy = leftB.y - leftA.y;
  const tRx = rightB.x - rightA.x;
  const tRy = rightB.y - rightA.y;
  const tLlen = Math.hypot(tLx, tLy);
  const tRlen = Math.hypot(tRx, tRy);
  if (tLlen < 1e-9 || tRlen < 1e-9) {
    return {
      nLeft,
      nRight: worldOutwardUnitFromCentroid(rightA, rightB, ctr),
    };
  }
  const parallel = Math.abs((tLx * tRx + tLy * tRy) / (tLlen * tRlen)) > 0.995;
  const nRight = parallel
    ? { nx: -nLeft.nx, ny: -nLeft.ny }
    : worldOutwardUnitFromCentroid(rightA, rightB, ctr);
  return { nLeft, nRight };
}

/** Screen anchor `offsetPx` along projection of world normal; text rotated parallel to edge. */
function drawWorldEdgeDimensionLabel(
  ctx: CanvasRenderingContext2D,
  worldToScreen: WorldToScreen,
  A: Point,
  B: Point,
  midW: Point,
  nWorld: { nx: number; ny: number },
  offsetPx: number,
  lenStr: string,
  wallHLabel: string | null,
): void {
  const sa = worldToScreen(A.x, A.y);
  const sb = worldToScreen(B.x, B.y);
  const sm = worldToScreen(midW.x, midW.y);
  const δ = 0.1;
  const sp = worldToScreen(midW.x + nWorld.nx * δ, midW.y + nWorld.ny * δ);
  let vx = sp.x - sm.x;
  let vy = sp.y - sm.y;
  const vlen = Math.hypot(vx, vy) || 1;
  vx = (vx / vlen) * offsetPx;
  vy = (vy / vlen) * offsetPx;
  const lx = sm.x + vx;
  const ly = sm.y + vy;
  const rot = readableTextAngle(Math.atan2(sb.y - sa.y, sb.x - sa.x));
  const edgeLenPx = Math.hypot(sb.x - sa.x, sb.y - sa.y);

  ctx.save();
  ctx.translate(lx, ly);
  ctx.rotate(rot);
  ctx.textBaseline = "middle";

  if (wallHLabel) {
    ctx.font = "11px 'JetBrains Mono',monospace";
    const wLen = ctx.measureText(lenStr).width;
    const midGap = ctx.measureText("  ").width;
    ctx.font = "10px 'JetBrains Mono',monospace";
    const wH = ctx.measureText(wallHLabel).width;
    const total = wLen + midGap + wH;
    if (total < Math.max(40, edgeLenPx * 0.82)) {
      ctx.textAlign = "left";
      const x0 = -total / 2;
      ctx.font = "11px 'JetBrains Mono',monospace";
      ctx.fillStyle = C.text;
      ctx.fillText(lenStr, x0, 0);
      ctx.font = "10px 'JetBrains Mono',monospace";
      ctx.fillStyle = C.accent;
      ctx.fillText("  " + wallHLabel, x0 + wLen, 0);
    } else {
      ctx.textAlign = "center";
      ctx.font = "11px 'JetBrains Mono',monospace";
      ctx.fillStyle = C.text;
      ctx.fillText(lenStr, 0, -6);
      ctx.font = "10px 'JetBrains Mono',monospace";
      ctx.fillStyle = C.accent;
      ctx.fillText(wallHLabel, 0, 7);
    }
  } else {
    ctx.textAlign = "center";
    ctx.font = "11px 'JetBrains Mono',monospace";
    ctx.fillStyle = C.text;
    ctx.fillText(lenStr, 0, 0);
  }
  ctx.restore();
}

// ── Drawing ───────────────────────────────────────────────────

function wallSegmentHeightLabel(shape: Shape, segIdx: number): string | null {
  if (shape.elementType !== "wall") return null;
  const defaultH = parseFloat(String(shape.calculatorInputs?.height ?? "0")) || 0;
  const segHeights = shape.calculatorInputs?.segmentHeights as WallSegmentHeightRow[] | undefined;
  const seg = segHeights?.[segIdx];
  if (shape.calculatorSubType === "double_wall" && seg) {
    const o = getSegmentOuterLeafAvgM(seg, defaultH, defaultH);
    const inn = getSegmentInnerLeafAvgM(seg, defaultH, defaultH);
    return `o=${o.toFixed(2)} i=${inn.toFixed(2)}m`;
  }
  const hStart = seg?.startH ?? defaultH;
  const hEnd = seg?.endH ?? defaultH;
  return Math.abs(hStart - hEnd) < 0.001
    ? `h=${hStart.toFixed(2)}m`
    : `h=${hStart.toFixed(2)}↘${hEnd.toFixed(2)}m`;
}

/**
 * Strip ribbon fill path: sample arcs on left/right chords when edgeArcs[seg] is set.
 * Without this, fill uses straight chords while arc overlays follow the curve — double-line look.
 *
 * Critical: right-chain edges run in REVERSE direction (R1→R0) vs par's canonical (R0→R1).
 * Samples must be iterated backwards when the polygon edge is reversed relative to par.
 */
function stripOutlineFillPathWithArcs(
  ctx: CanvasRenderingContext2D,
  outline: Point[],
  edgeArcs: (ArcPoint[] | null | undefined)[] | undefined,
  worldToScreen: WorldToScreen,
  shape: Shape,
): void {
  const n = outline.length;
  if (n < 2) return;
  const hasArcs = edgeArcs?.some((a) => a && a.length > 0);
  if (!hasArcs || !isPolygonLinearStripOutline(shape)) {
    const s0 = worldToScreen(outline[0].x, outline[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < n; i++) {
      const s = worldToScreen(outline[i].x, outline[i].y);
      ctx.lineTo(s.x, s.y);
    }
    return;
  }

  const tol = 1e-8;
  const ptMatch = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < tol;

  const s0 = worldToScreen(outline[0].x, outline[0].y);
  ctx.moveTo(s0.x, s0.y);

  for (let edgeIdx = 0; edgeIdx < n; edgeIdx++) {
    const j = (edgeIdx + 1) % n;
    const seg = stripPolygonEdgeToSegmentIndex(outline, edgeIdx);
    if (seg === null) {
      const s = worldToScreen(outline[j].x, outline[j].y);
      ctx.lineTo(s.x, s.y);
      continue;
    }
    const par = stripOutlineParallelEdges(outline, seg);
    if (!par) {
      const s = worldToScreen(outline[j].x, outline[j].y);
      ctx.lineTo(s.x, s.y);
      continue;
    }
    const A = outline[edgeIdx];
    const B = outline[j];
    const arcs = edgeArcs?.[seg];
    if (!arcs || arcs.length === 0) {
      const s = worldToScreen(outline[j].x, outline[j].y);
      ctx.lineTo(s.x, s.y);
      continue;
    }

    const leftFwd = ptMatch(A, par.leftA) && ptMatch(B, par.leftB);
    const leftRev = ptMatch(A, par.leftB) && ptMatch(B, par.leftA);
    const rightFwd = ptMatch(A, par.rightA) && ptMatch(B, par.rightB);
    const rightRev = ptMatch(A, par.rightB) && ptMatch(B, par.rightA);

    if (leftFwd || leftRev) {
      const sampled = sampleArcEdge(par.leftA, par.leftB, arcs, 48);
      if (leftFwd) {
        for (let k = 1; k < sampled.length; k++) {
          const p = worldToScreen(sampled[k].x, sampled[k].y);
          ctx.lineTo(p.x, p.y);
        }
      } else {
        for (let k = sampled.length - 2; k >= 0; k--) {
          const p = worldToScreen(sampled[k].x, sampled[k].y);
          ctx.lineTo(p.x, p.y);
        }
      }
    } else if (rightFwd || rightRev) {
      const rightArcs = mirrorArcPointsParallelStripChord(
        par.leftA, par.leftB, par.rightA, par.rightB, arcs,
      );
      const sampled = sampleArcEdge(par.rightA, par.rightB, rightArcs, 48);
      if (rightFwd) {
        for (let k = 1; k < sampled.length; k++) {
          const p = worldToScreen(sampled[k].x, sampled[k].y);
          ctx.lineTo(p.x, p.y);
        }
      } else {
        for (let k = sampled.length - 2; k >= 0; k--) {
          const p = worldToScreen(sampled[k].x, sampled[k].y);
          ctx.lineTo(p.x, p.y);
        }
      }
    } else {
      const s = worldToScreen(outline[j].x, outline[j].y);
      ctx.lineTo(s.x, s.y);
    }
  }
}

export function drawLinearElement(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  _zoom: number,
  isSelected: boolean,
  isHovered: boolean,
  isPointLinked?: (pointIdx: number) => boolean
): void {
  const pts = shape.points;
  if (pts.length < 2) return;

  const outlineStored = isPolygonLinearOutlineStored(shape);
  const usePerEdgeDoubleWall =
    shape.elementType === "wall" && shouldUseDoubleWallPerEdgeThickness(shape);

  const outline = computeLinearElementFillOutline(shape);

  const fillColor = linearElementColor(shape.elementType);
  const strokeColor = isSelected ? C.accent : isHovered ? C.edgeHover : fillColor;

  if (!usePerEdgeDoubleWall) {
    ctx.beginPath();
    { const _s0 = worldToScreen(outline[0].x, outline[0].y); ctx.moveTo(_s0.x, _s0.y); for (let _i = 1; _i < outline.length; _i++) { const _s = worldToScreen(outline[_i].x, outline[_i].y); ctx.lineTo(_s.x, _s.y); } }
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    if (shape.elementType === "kerb") {
      ctx.setLineDash([12, 6]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    drawWallDoubleWallPerEdge(ctx, shape, worldToScreen, fillColor, strokeColor, isSelected);
  }

  if (isPointLinked && !outlineStored) {
    ctx.lineWidth = isSelected ? 2 : 1.2;
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i];
      const B = pts[i + 1];
      const sa = worldToScreen(A.x, A.y);
      const sb = worldToScreen(B.x, B.y);
      const sm = midpoint(sa, sb);
      if (isPointLinked(i)) drawAlternatingLinkedHalf(ctx, sa.x, sa.y, sm.x, sm.y);
      else { ctx.strokeStyle = strokeColor; ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sm.x, sm.y); ctx.stroke(); }
      if (isPointLinked(i + 1)) drawAlternatingLinkedHalf(ctx, sm.x, sm.y, sb.x, sb.y);
      else { ctx.strokeStyle = strokeColor; ctx.beginPath(); ctx.moveTo(sm.x, sm.y); ctx.lineTo(sb.x, sb.y); ctx.stroke(); }
    }
  }

  const pathForCtr = usePerEdgeDoubleWall ? getLinearElementPath(shape) : outline;
  const ctrPoly = centroid(pathForCtr);
  const centroidSc = worldToScreen(ctrPoly.x, ctrPoly.y);

  // Segment length labels (strip: parallel edges; else centerline segments)
  if (isPolygonLinearStripOutline(shape)) {
    for (let i = 0; ; i++) {
      const e = stripOutlineParallelEdges(pts, i);
      if (!e) break;
      const { nLeft, nRight } = stripEdgeOutwardNormals(
        e.leftA,
        e.leftB,
        e.rightA,
        e.rightB,
        ctrPoly,
      );
      const midL = midpoint(e.leftA, e.leftB);
      const midR = midpoint(e.rightA, e.rightB);
      const arcSeg = shape.edgeArcs?.[i];
      const lenL = formatLength(
        arcSeg && arcSeg.length > 0 ? calcEdgeLengthWithArcs(e.leftA, e.leftB, arcSeg) : distance(e.leftA, e.leftB)
      );
      const lenR = formatLength(
        arcSeg && arcSeg.length > 0 ? calcEdgeLengthWithArcs(e.leftA, e.leftB, arcSeg) : distance(e.rightA, e.rightB)
      );
      const hWall = shape.elementType === "wall" ? wallSegmentHeightLabel(shape, i) : null;
      drawWorldEdgeDimensionLabel(ctx, worldToScreen, e.leftA, e.leftB, midL, nLeft, 16, lenL, hWall);
      drawWorldEdgeDimensionLabel(ctx, worldToScreen, e.rightA, e.rightB, midR, nRight, 16, lenR, hWall);
    }
  } else if (!outlineStored) {
    const nEdge = shape.closed && pts.length >= 3 ? pts.length : pts.length - 1;
    for (let i = 0; i < nEdge; i++) {
      const A = pts[i];
      const B = shape.closed && pts.length >= 3 ? pts[(i + 1) % pts.length] : pts[i + 1];
      const len = calcEdgeLengthWithArcs(A, B, shape.edgeArcs?.[i]);
      const nW = worldOutwardUnitFromCentroid(A, B, ctrPoly);
      const midW = midpoint(A, B);
      const hWall = shape.elementType === "wall" ? wallSegmentHeightLabel(shape, i) : null;
      drawWorldEdgeDimensionLabel(ctx, worldToScreen, A, B, midW, nW, 16, formatLength(len), hWall);
    }
  }

  // Corner angle labels
  if (!outlineStored) {
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const next = pts[i + 1];
      const angle = angleDeg(prev, curr, next);
      const sc = worldToScreen(curr.x, curr.y);
      ctx.font = "10px 'JetBrains Mono',monospace";
      ctx.fillStyle = C.angleText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(angle.toFixed(1) + "°", sc.x, sc.y - 12);
    }
  } else if (isClosedStripPolygonOutline(pts)) {
    const segCount = (pts.length - 2) / 2;
    for (let i = 0; i < segCount; i++) {
      const prev = pts[(i - 1 + segCount) % segCount];
      const curr = pts[i];
      const next = pts[i + 1];
      const angle = angleDeg(prev, curr, next);
      const rc = pts[2 * segCount + 1 - i];
      const cornerMid = midpoint(curr, rc);
      const sMid = worldToScreen(cornerMid.x, cornerMid.y);
      let ox = sMid.x - centroidSc.x;
      let oy = sMid.y - centroidSc.y;
      const olen = Math.hypot(ox, oy) || 1;
      ox /= olen;
      oy /= olen;
      ctx.font = "10px 'JetBrains Mono',monospace";
      ctx.fillStyle = C.angleText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(angle.toFixed(1) + "°", sMid.x + ox * 20, sMid.y + oy * 20);
    }
  } else if (isOpenStripPolygonOutline(pts)) {
    const V = pts.length / 2;
    for (let i = 1; i <= V - 2; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const next = pts[i + 1];
      const angle = angleDeg(prev, curr, next);
      const rc = pts[pts.length - 1 - i];
      const cornerMid = midpoint(curr, rc);
      const sMid = worldToScreen(cornerMid.x, cornerMid.y);
      let ox = sMid.x - centroidSc.x;
      let oy = sMid.y - centroidSc.y;
      const olen = Math.hypot(ox, oy) || 1;
      ox /= olen;
      oy /= olen;
      ctx.font = "10px 'JetBrains Mono',monospace";
      ctx.fillStyle = C.angleText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(angle.toFixed(1) + "°", sMid.x + ox * 20, sMid.y + oy * 20);
    }
  }

  // Total length label (strip: sum of mean(left,right) per segment; matches run length)
  let totalLenM = 0;
  if (isPolygonLinearStripOutline(shape)) {
    for (let i = 0; ; i++) {
      const m = stripOutlineSegmentLengthMeanM(pts, i, shape.edgeArcs?.[i]);
      if (m == null) break;
      totalLenM += m;
    }
  } else if (outlineStored) {
    totalLenM = polygonToSegmentLengths(pts).reduce((a, b) => a + b, 0);
  } else {
    totalLenM = polylineLengthMeters(pts);
  }
  const sc = worldToScreen(ctrPoly.x, ctrPoly.y);
  ctx.font = "bold 12px 'JetBrains Mono',monospace";
  ctx.fillStyle = C.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(totalLenM.toFixed(3) + " m", sc.x, sc.y);

  // Type badge (F/W/K/Fd or groundwork: Dr/Ca/Wa/Cb)
  const badgeText = shape.elementType === "fence" ? "F" : shape.elementType === "wall" ? "W" : shape.elementType === "kerb" ? "K" : shape.elementType === "foundation" ? "Fd" : shape.elementType === "drainage" ? "Dr" : shape.elementType === "canalPipe" ? "Ca" : shape.elementType === "waterPipe" ? "Wa" : shape.elementType === "cable" ? "Cb" : "?";
  ctx.font = "bold 10px 'JetBrains Mono',monospace";
  ctx.fillStyle = C.badge;
  ctx.fillRect(sc.x - 14, sc.y - 22, 28, 14);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(sc.x - 14, sc.y - 22, 28, 14);
  ctx.fillStyle = strokeColor;
  ctx.fillText(badgeText, sc.x, sc.y - 15);
}

export function drawLinearElementInactive(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  _zoom: number
): void {
  const pts = shape.points;
  if (pts.length < 2) return;

  const outlineStored = isPolygonLinearOutlineStored(shape);
  const usePerEdgeDoubleWall =
    shape.elementType === "wall" && shouldUseDoubleWallPerEdgeThickness(shape);

  let totalLenM: number;
  if (isPolygonLinearStripOutline(shape)) {
    totalLenM = 0;
    for (let i = 0; ; i++) {
      const m = stripOutlineSegmentLengthMeanM(pts, i, shape.edgeArcs?.[i]);
      if (m == null) break;
      totalLenM += m;
    }
  } else if (outlineStored) {
    totalLenM = polygonToSegmentLengths(pts).reduce((a, b) => a + b, 0);
  } else {
    totalLenM = polylineLengthMeters(pts);
  }

  const outline = computeLinearElementFillOutline(shape);

  const fillColor = linearElementDimColor(shape.elementType);

  if (usePerEdgeDoubleWall) {
    drawWallDoubleWallPerEdge(ctx, shape, worldToScreen, fillColor, C.inactiveEdge, false);
  } else {
    ctx.beginPath();
    { const _s0 = worldToScreen(outline[0].x, outline[0].y); ctx.moveTo(_s0.x, _s0.y); for (let _i = 1; _i < outline.length; _i++) { const _s = worldToScreen(outline[_i].x, outline[_i].y); ctx.lineTo(_s.x, _s.y); } }
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = C.inactiveEdge;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  const ctr = usePerEdgeDoubleWall ? centroid(getLinearElementPath(shape)) : centroid(outline);
  const sc = worldToScreen(ctr.x, ctr.y);
  ctx.font = "11px 'JetBrains Mono',monospace";
  ctx.fillStyle = C.inactiveEdge;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(totalLenM.toFixed(3) + " m", sc.x, sc.y);
}
