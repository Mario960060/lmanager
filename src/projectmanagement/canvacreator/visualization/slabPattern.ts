// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — visualization/slabPattern.ts
// Slab pattern rendering on polygon shapes (grid, brick)
// ══════════════════════════════════════════════════════════════

import { Point, Shape, toPixels, toMeters, labelAnchorInsidePolygon, areaM2, polygonCentroidByArea, centroid, pathLongestSegmentLabelPlacement } from "../geometry";
import { scaledFontSize } from "../canvasRenderers";
import { getEffectivePolygon, getEffectivePolygonWithEdgeIndices, sampleArcEdgeForFrame } from "../arcMath";
import { isPathElement, getPathPolygon } from "../linearElements";

/**
 * Same polygon ring as frame UI / cobblestone: for paths use {@link getPathPolygon} (outline),
 * not raw `shape.points` when centerline is stored — indices must match `frameSidesEnabled` and frame linking.
 * (Arc sampling for pattern clip is only in {@link getPathSlabPatternClipOutline}.)
 */
function getPolygonWithEdgeIndicesForSlab(shape: Shape): { points: Point[]; edgeIndices: number[] } {
  if (isPathElement(shape)) {
    const pts = getPathPolygon(shape);
    if (pts.length < 3) {
      return { points: [], edgeIndices: [] };
    }
    if (!shape.closed) {
      const edgeIndices: number[] = [];
      for (let i = 0; i < pts.length; i++) edgeIndices.push(i);
      return { points: [...pts], edgeIndices };
    }
    return {
      points: pts,
      edgeIndices: pts.map((_, i) => i),
    };
  }
  return getEffectivePolygonWithEdgeIndices(shape);
}

function getPolygonPointsForSlabArea(shape: Shape): Point[] {
  if (isPathElement(shape)) {
    const pts = getPathPolygon(shape);
    return pts.length >= 3 ? pts : shape.points;
  }
  return getEffectivePolygon(shape);
}

/** Path slab/cuts: use stored `pathCenterline` (one ribbon edge + pathFullPx to outer) — same as pre–derived-centerline behavior. */
function resolvePathPatternCenterlineAndSides(
  _shape: Shape,
  inputs: Record<string, any> | undefined,
): { pathCenterline: Point[]; pathSegmentSides: ("left" | "right")[] } | null {
  if (!inputs) return null;
  const pathCenterline = inputs.pathCenterline as Point[] | undefined;
  const pathSegmentSides = inputs.pathSegmentSides as ("left" | "right")[] | undefined;
  if (!pathCenterline || pathCenterline.length < 2) return null;
  if (!pathSegmentSides || pathSegmentSides.length !== pathCenterline.length - 1) return null;
  return { pathCenterline, pathSegmentSides };
}

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

/**
 * Maps calculator `vizDirection` (degrees) to the angle used for `dir` / `perp` in the grid.
 * Data uses `vizSlabWidth` × `vizSlabLength` (e.g. 90×60); the shorter side is stepped along `dir`,
 * the longer along `perp`. Subtracting 90° makes UI 0° = longer dimension horizontal, 90° = vertical,
 * and matches „równolegle / prostopadle do boku” from {@link computePatternAlignToStraightEdge}.
 */
export function vizDirectionToPatternAngleRad(vizDirectionDeg: number): number {
  const d = ((Number(vizDirectionDeg) % 360) + 360) % 360;
  return ((d - 90) * Math.PI) / 180;
}

/**
 * Pattern anchor for `vizStartCorner` (logical index into `shape.points`).
 * When the draw/snap outline is the densified effective polygon (arcs) or shrunk frame outline,
 * its vertex indices do not match logical corners — use nearest outline point to the logical vertex.
 */
export function patternOriginOnOutline(logicalPts: Point[], outlinePts: Point[], logicalCornerIdx: number): Point | null {
  const n = logicalPts.length;
  if (n < 1 || outlinePts.length < 1) return null;
  const i = Math.max(0, Math.min(logicalCornerIdx, n - 1));
  if (outlinePts === logicalPts || outlinePts.length === n) {
    const p = outlinePts[i];
    return p ?? null;
  }
  const target = logicalPts[i];
  if (!target) return null;
  let best = outlinePts[0]!;
  let bestD = Infinity;
  for (const p of outlinePts) {
    const d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * Shrink polygon inward by dist pixels.
 * Offsets each edge inward and intersects adjacent offset edges to get new vertices.
 */
export function shrinkPolygon(pts: Point[], dist: number): Point[] {
  const n = pts.length;
  if (n < 3 || dist <= 0) return pts;

  // Signed area: CCW > 0, CW < 0
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  signedArea /= 2;
  const isCCW = signedArea > 0;

  const offset = (a: Point, b: Point): { p: Point; q: Point } => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const sign = isCCW ? 1 : -1;
    const d = dist * sign;
    return {
      p: { x: a.x + nx * d, y: a.y + ny * d },
      q: { x: b.x + nx * d, y: b.y + ny * d },
    };
  };

  const lineIntersection = (a: Point, b: Point, c: Point, d: Point): Point | null => {
    const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (Math.abs(denom) < 1e-10) return null;
    const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom;
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  };

  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const next = (i + 1) % n;
    const segPrev = offset(pts[prev], pts[i]);
    const segNext = offset(pts[i], pts[next]);
    const isect = lineIntersection(segPrev.p, segPrev.q, segNext.p, segNext.q);
    if (isect) result.push(isect);
    else result.push(pts[i]);
  }
  return result;
}

/**
 * Shrink polygon inward only on edges where frame is enabled.
 * On frame-disabled edges the boundary stays at the original edge — pattern extends to element boundary.
 * edgeIndices[i] = logical edge for segment from pts[i] to pts[(i+1)%n].
 * frameSidesEnabled[edgeIdx] = whether that logical edge has frame.
 */
export function shrinkPolygonByEdges(
  pts: Point[],
  dist: number,
  edgeIndices: number[],
  frameSidesEnabled: boolean[]
): Point[] {
  const n = pts.length;
  if (n < 3 || dist <= 0 || edgeIndices.length !== n) return pts;

  const numLogicalEdges = Math.max(...edgeIndices, -1) + 1;
  const anyEnabled = Array.from({ length: numLogicalEdges }, (_, i) => frameSidesEnabled[i] !== false).some(Boolean);
  const allEnabled = Array.from({ length: numLogicalEdges }, (_, i) => frameSidesEnabled[i] !== false).every(Boolean);
  if (!anyEnabled) return pts;
  if (allEnabled) return shrinkPolygon(pts, dist);

  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  signedArea /= 2;
  const isCCW = signedArea > 0;
  const sign = isCCW ? 1 : -1;

  const getOffsetLine = (a: Point, b: Point, doOffset: boolean): { p: Point; q: Point } => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    if (!doOffset) return { p: a, q: b };
    const d = dist * sign;
    return {
      p: { x: a.x + nx * d, y: a.y + ny * d },
      q: { x: b.x + nx * d, y: b.y + ny * d },
    };
  };

  const lineIntersection = (a: Point, b: Point, c: Point, d: Point): Point | null => {
    const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (Math.abs(denom) < 1e-10) return null;
    const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom;
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  };

  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const next = (i + 1) % n;
    const edgePrev = edgeIndices[i];
    const edgeNext = edgeIndices[next];
    const shrinkPrev = frameSidesEnabled[edgePrev] !== false;
    const shrinkNext = frameSidesEnabled[edgeNext] !== false;
    const segPrev = getOffsetLine(pts[prev], pts[i], shrinkPrev);
    const segNext = getOffsetLine(pts[i], pts[next], shrinkNext);
    const isect = lineIntersection(segPrev.p, segPrev.q, segNext.p, segNext.q);
    if (isect) result.push(isect);
    else result.push(pts[i]);
  }
  return result;
}

const SLAB_COLOR = "#5d6d7e";
/** Path monoblock — same hues as cobblestonePattern.ts */
const COBBLE_BLOCK_COLOR = "#9B5C3A";
const COBBLE_BLOCK_CUT_COLOR = "#B8866B";
const COBBLE_BLOCK_SMALL_CUT_COLOR = "#e74c3c";
const COBBLE_BLOCK_WASTE_REUSED_COLOR = "#27ae60";
const COBBLE_JOINT_COLOR = "#4a5568";
const SLAB_CUT_COLOR = "#95a5a6";
const SLAB_SMALL_CUT_COLOR = "#e74c3c";
const SLAB_WASTE_REUSED_COLOR = "#22c55e";
const GROUT_COLOR = "#4a5568";
const FRAME_COLOR = "#4a6fa5";

/**
 * Parse slab dimensions from task template name.
 * Returns null for "mix" or names without parseable dimensions.
 */
export function parseSlabDimensions(slabTypeName: string): { widthCm: number; lengthCm: number } | null {
  if (!slabTypeName || typeof slabTypeName !== "string") return null;
  const name = slabTypeName.toLowerCase();
  if (name.includes("mix")) return null;
  const match = name.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return null;
  const w = parseInt(match[1], 10);
  const l = parseInt(match[2], 10);
  if (isNaN(w) || isNaN(l) || w < 1 || l < 1) return null;
  return { widthCm: w, lengthCm: l };
}

function pointInPolygon(p: Point, pts: Point[]): boolean {
  const n = pts.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Punkt wewnątrz lub na granicy (w małej tolerancji) — liczy rogi dokładnie na krawędzi/wierzchołku. */
function pointInOrOnPolygon(p: Point, pts: Point[], tolerance: number = 1e-9): boolean {
  if (pointInPolygon(p, pts)) return true;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = pts[j], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-20) continue;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    if (t >= -tolerance && t <= 1 + tolerance) {
      const proj = { x: a.x + t * dx, y: a.y + t * dy };
      const distSq = (p.x - proj.x) ** 2 + (p.y - proj.y) ** 2;
      const len = Math.sqrt(lenSq);
      if (distSq <= (tolerance * Math.max(len, 1)) ** 2) return true;
    }
  }
  return false;
}

function segmentIntersects(a: Point, b: Point, p: Point, q: Point): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dpx = q.x - p.x, dpy = q.y - p.y;
  const denom = dx * dpy - dy * dpx;
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((p.x - a.x) * dpy - (p.y - a.y) * dpx) / denom;
  if (t < 0 || t > 1) return false;
  const s = ((a.x - p.x) * dy - (a.y - p.y) * dx) / -denom;
  return s >= 0 && s <= 1;
}

function rectIntersectsPolygon(corners: Point[], polygon: Point[]): boolean {
  for (const c of corners) {
    if (pointInOrOnPolygon(c, polygon)) return true;
  }
  for (let e = 0; e < 4; e++) {
    const a = corners[e];
    const b = corners[(e + 1) % 4];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i];
      const q = polygon[(i + 1) % polygon.length];
      if (segmentIntersects(a, b, p, q)) return true;
    }
  }
  return false;
}

function rectFullyInsidePolygon(corners: Point[], polygon: Point[]): boolean {
  for (const c of corners) {
    if (!pointInPolygon(c, polygon)) return false;
  }
  return true;
}

/** Cross product (b-a) × (p-a): > 0 if p is left of edge a->b. */
function crossEdge(a: Point, b: Point, p: Point): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

function pathCobbleRectCornersSatisfyCornerClips(
  corners: Point[],
  cornerClips: { edgeA: Point; edgeB: Point; keepLeft: boolean }[],
): boolean {
  const eps = 1e-7;
  for (const { edgeA, edgeB, keepLeft } of cornerClips) {
    for (const c of corners) {
      const cr = crossEdge(edgeA, edgeB, c);
      if (keepLeft) {
        if (cr < -eps) return false;
      } else if (cr > eps) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Clip block rect to segment strip + mitre half-planes. Fast path when fully inside region and corner clips.
 */
function pathCobbleClipRectToSegment(
  corners: Point[],
  region: Point[],
  cornerClips: { edgeA: Point; edgeB: Point; keepLeft: boolean }[],
): Point[] | null {
  if (!rectIntersectsPolygon(corners, region)) return null;
  if (rectFullyInsidePolygon(corners, region) && (cornerClips.length === 0 || pathCobbleRectCornersSatisfyCornerClips(corners, cornerClips))) {
    return corners;
  }
  let clipped = rectPolygonIntersection(corners, region);
  if (clipped.length < 3) return null;
  for (const { edgeA, edgeB, keepLeft } of cornerClips) {
    clipped = clipPolygonByEdge(clipped, edgeA, edgeB, keepLeft);
    if (clipped.length < 3) return null;
  }
  return clipped;
}

export function appendWorldPolygonToPath(path: Path2D, pts: Point[], worldToScreen: WorldToScreen): void {
  if (pts.length < 2) return;
  const s0 = worldToScreen(pts[0].x, pts[0].y);
  path.moveTo(s0.x, s0.y);
  for (let i = 1; i < pts.length; i++) {
    const s = worldToScreen(pts[i].x, pts[i].y);
    path.lineTo(s.x, s.y);
  }
  path.closePath();
}

/** Intersection of segment (a,b) with line through (p,q). Returns t in [0,1] or null. */
function lineSegmentIntersection(a: Point, b: Point, p: Point, q: Point): number | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dpx = q.x - p.x, dpy = q.y - p.y;
  const denom = dx * dpy - dy * dpx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((p.x - a.x) * dpy - (p.y - a.y) * dpx) / denom;
  if (t < -1e-9 || t > 1 + 1e-9) return null;
  return Math.max(0, Math.min(1, t));
}

/** Clip polygon by half-plane. For CCW polygon: keep left of edge (cross >= 0). For CW: keep right (use reversed edge). */
function clipPolygonByEdge(subject: Point[], edgeA: Point, edgeB: Point, keepLeft: boolean): Point[] {
  const out: Point[] = [];
  const n = subject.length;
  const [a, b] = keepLeft ? [edgeA, edgeB] : [edgeB, edgeA];
  for (let i = 0; i < n; i++) {
    const curr = subject[i];
    const next = subject[(i + 1) % n];
    const currInside = crossEdge(a, b, curr) >= -1e-12;
    const nextInside = crossEdge(a, b, next) >= -1e-12;
    if (currInside) out.push(curr);
    if (currInside !== nextInside) {
      const t = lineSegmentIntersection(curr, next, edgeA, edgeB);
      if (t != null) out.push({ x: curr.x + t * (next.x - curr.x), y: curr.y + t * (next.y - curr.y) });
    }
  }
  return out;
}

/** Intersection polygon of rectangle (corners) with polygon. Uses Sutherland-Hodgman. Returns [] if empty. */
export function rectPolygonIntersection(corners: Point[], polygon: Point[]): Point[] {
  let result: Point[] = [...corners];
  const n = polygon.length;
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
  }
  signedArea /= 2;
  const keepLeft = signedArea > 0;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    result = clipPolygonByEdge(result, a, b, keepLeft);
    if (result.length < 3) return [];
  }
  return result;
}

/** True if polygon has any concave (reflex) vertex. Works for mixed convex/concave. */
function hasConcaveVertex(pts: Point[]): boolean {
  const n = pts.length;
  if (n < 3) return false;
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  signedArea /= 2;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const cross = (prev.x - curr.x) * (next.y - curr.y) - (prev.y - curr.y) * (next.x - curr.x);
    if ((signedArea > 0 && cross > 1e-9) || (signedArea < 0 && cross < -1e-9)) return true;
  }
  return false;
}

/** One border ring (used internally; N copies share the same piece size from inputs). */
export interface FrameBorderRowResolved {
  widthCm: number;
  lengthCm: number;
  jointType: "butt" | "miter45";
}

const FRAME_ROW_COUNT_MAX = 50;

/**
 * Number of concentric border rows (default 1). Legacy: `frameBorderRows` array length if count not set.
 */
export function getFrameBorderRowCount(inputs: Record<string, any> | undefined): number {
  const explicit = Number(inputs?.frameBorderRowCount);
  if (Number.isFinite(explicit) && explicit >= 1) {
    return Math.min(FRAME_ROW_COUNT_MAX, Math.max(1, Math.floor(explicit)));
  }
  const legacyArr = inputs?.frameBorderRows;
  if (Array.isArray(legacyArr) && legacyArr.length > 0) {
    return Math.min(FRAME_ROW_COUNT_MAX, Math.max(1, legacyArr.length));
  }
  return 1;
}

/**
 * Frame rows for drawing/shrink: `rowCount` identical rings from `framePieceWidthCm` / `framePieceLengthCm` / `frameJointType`.
 */
export function getFrameBorderRowsFromInputs(inputs: Record<string, any> | undefined): FrameBorderRowResolved[] {
  /** Must match SlabCalculator: when unchecked, no frame inset and no frame viz (stale framePieceWidthCm may remain in state). */
  /** Paving paths use `addFrameToMonoblock` only — stale `addFrameBoard: false` from merged inputs must not kill monoblock frame. */
  if (inputs?.addFrameBoard === false && inputs?.addFrameToMonoblock !== true) return [];
  if (inputs?.addFrameToMonoblock === false && inputs?.addFrameBoard !== true) return [];
  const w = Number(inputs?.framePieceWidthCm ?? 0);
  const len = Number(inputs?.framePieceLengthCm ?? 90);
  const jt = (inputs?.frameJointType as string) === "butt" ? "butt" : "miter45";
  if (w <= 0) return [];
  const rowCount = getFrameBorderRowCount(inputs);
  const row: FrameBorderRowResolved = { widthCm: w, lengthCm: len > 0 ? len : 60, jointType: jt };
  return Array.from({ length: rowCount }, () => ({ ...row }));
}

export function getTotalFrameInsetWidthCm(inputs: Record<string, any> | undefined): number {
  return getFrameBorderRowsFromInputs(inputs).reduce((s, r) => s + r.widthCm, 0);
}

/** Canvas: draw frame tiles only when frame rows exist (respects explicit frame-off flags). */
export function shouldDrawSlabFrameViz(inputs: Record<string, any> | undefined): boolean {
  return getFrameBorderRowsFromInputs(inputs).length > 0;
}

/**
 * Shrink polygon inward by each frame row width in order (matches drawSlabPattern / computeSlabCuts).
 */
export function applyFrameInsetShrinkPolygon(
  pts: Point[],
  edgeIndices: number[],
  frameSidesEnabled: boolean[] | undefined,
  rowWidthsCm: number[]
): Point[] {
  let cur = pts;
  for (const wCm of rowWidthsCm) {
    const wPx = toPixels(wCm / 100);
    if (wPx <= 0) continue;
    if (Array.isArray(frameSidesEnabled) && frameSidesEnabled.length > 0) {
      const shrunk = shrinkPolygonByEdges(cur, wPx, edgeIndices, frameSidesEnabled);
      if (shrunk.length >= 3) cur = shrunk;
    } else if (!hasConcaveVertex(cur)) {
      const shrunk = shrinkPolygon(cur, wPx);
      if (shrunk.length >= 3) cur = shrunk;
    }
  }
  return cur;
}

function shrinkOneFrameLayerFromInputs(
  pts: Point[],
  edgeIndices: number[],
  frameSidesEnabled: boolean[] | undefined,
  widthCm: number
): Point[] {
  return applyFrameInsetShrinkPolygon(pts, edgeIndices, frameSidesEnabled, [widthCm]);
}

/**
 * Ring used for path slab/cobble clip + linked-edge expansion: coarse control polygon, or
 * {@link getEffectivePolygonWithEdgeIndices} when `pathIsOutline` has arcs (matches L2 fill stroke).
 */
function getPathSlabClipPolygonWithIndices(shape: Shape): { points: Point[]; edgeIndices: number[] } {
  const hasPathArcs =
    isPathElement(shape) &&
    Boolean(shape.calculatorInputs?.pathIsOutline) &&
    shape.edgeArcs?.some((a) => a && a.length > 0);
  if (hasPathArcs) {
    return getEffectivePolygonWithEdgeIndices(shape);
  }
  return getPolygonWithEdgeIndicesForSlab(shape);
}

/**
 * Clip outline for path slab pattern / cuts — aligned with {@link drawSlabFrame}:
 * {@link getPolygonWithEdgeIndicesForSlab} then {@link shrinkPolygon} or
 * {@link shrinkPolygonByEdges} when `frameSidesEnabled` is set.
 * Path + `pathIsOutline` + arcs: sampled effective ring (same as L2 fill) so clip matches curved boundary.
 */
function getPathSlabPatternClipOutline(shape: Shape, inputs: Record<string, any> | undefined): Point[] | null {
  if (!inputs || !shape.closed) return null;
  const { points: outline, edgeIndices } = getPathSlabClipPolygonWithIndices(shape);
  if (outline.length < 3) return null;
  const rowWidthsCm = getFrameBorderRowsFromInputs(inputs).map((r) => r.widthCm).filter((w) => w > 0);
  if (rowWidthsCm.length === 0) return outline;
  const frameSidesEnabled = inputs.frameSidesEnabled as boolean[] | undefined;
  const shrunk = applyFrameInsetShrinkPolygon(outline, edgeIndices, frameSidesEnabled, rowWidthsCm);
  return shrunk.length >= 3 ? shrunk : outline;
}

/**
 * Push specific edges of a polygon outward (expand) by per-edge amounts.
 * Used to extend the slab clip outline into the adjacent element's frame zone on linked edges.
 */
function expandOutlineOnLinkedEdges(
  pts: Point[],
  edgeIndices: number[],
  linkedEdgeExpansionsPx: Map<number, number>,
): Point[] {
  if (linkedEdgeExpansionsPx.size === 0) return pts;
  const n = pts.length;
  if (n < 3 || edgeIndices.length !== n) return pts;

  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  signedArea /= 2;
  const sign = signedArea > 0 ? 1 : -1;

  const offsetLine = (a: Point, b: Point, expandDist: number): { p: Point; q: Point } => {
    if (expandDist <= 0) return { p: a, q: b };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const d = -expandDist * sign;
    return {
      p: { x: a.x + nx * d, y: a.y + ny * d },
      q: { x: b.x + nx * d, y: b.y + ny * d },
    };
  };

  const lineIsect = (a: Point, b: Point, c: Point, d: Point): Point | null => {
    const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (Math.abs(denom) < 1e-10) return null;
    const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom;
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  };

  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const next = (i + 1) % n;
    const ePrev = linkedEdgeExpansionsPx.get(edgeIndices[i]) ?? 0;
    const eNext = linkedEdgeExpansionsPx.get(edgeIndices[next]) ?? 0;
    if (ePrev === 0 && eNext === 0) {
      result.push(pts[i]);
      continue;
    }
    const segPrev = offsetLine(pts[prev], pts[i], ePrev);
    const segNext = offsetLine(pts[i], pts[next], eNext);
    const isect = lineIsect(segPrev.p, segPrev.q, segNext.p, segNext.q);
    result.push(isect ?? pts[i]);
  }
  return result;
}

/** Ignore sub-pixel dust from clip math at joints (red specks, absurd waste % in labels). */
function pathPatternMinFragmentAreaPx2(blockAreaPx2: number, jointOrGroutPx: number): number {
  return Math.max(jointOrGroutPx * jointOrGroutPx * 4, blockAreaPx2 * 0.0005, 1e-6);
}

function pathPatternIsDustFragment(areaPx2: number, blockAreaPx2: number, jointOrGroutPx: number): boolean {
  return areaPx2 > 0 && areaPx2 < pathPatternMinFragmentAreaPx2(blockAreaPx2, jointOrGroutPx);
}

/**
 * Snap segment direction to axis when nearly horizontal/vertical (floating-point noise on grid-drawn paths).
 * Keeps perp orthogonal and avoids visible slab/cobble drift on long straight arms.
 */
function pathSegmentDirSnapped(dx: number, dy: number, len: number): { x: number; y: number } {
  const eps = 1e-7 * Math.max(len, 1e-9);
  if (Math.abs(dx) < eps) return { x: 0, y: dy >= 0 ? 1 : -1 };
  if (Math.abs(dy) < eps) return { x: dx >= 0 ? 1 : -1, y: 0 };
  return { x: dx / len, y: dy / len };
}

/**
 * Unit direction along the clip line for **miter45**: perpendicular to the angle bisector of two
 * segment tangents (diagonal seam through the corner).
 */
function pathJointClipLineDirFromBisector(d1: Point, d2: Point): Point {
  const bx = d1.x + d2.x;
  const by = d1.y + d2.y;
  const blen = Math.sqrt(bx * bx + by * by) || 1;
  if (blen < 1e-12) {
    return { x: -d1.y, y: d1.x };
  }
  return { x: -by / blen, y: bx / blen };
}

/** Miter45 only: clip plane ⟂ angle bisector. Butt joints use no corner half-planes (see draw/compute). */
function pathJointCornerClipLineDirMiter45(tan1: Point, tan2: Point): Point {
  return pathJointClipLineDirFromBisector(tan1, tan2);
}

/**
 * If dot(incomingDir, outgoingDir) > this, edges at vertex are ~collinear (≈180°) — no real corner;
 * miter + shrinkPolygon inner vertex are wrong → use butt.
 */
const COLLINEAR_FRAME_MITER_DOT_THRESH = 0.999;

/**
 * True if frame may use miter inner corner at pts[vertexIdx] (not a redundant point on a straight edge).
 */
function vertexAllowsFrameMiterCorner(pts: Point[], vertexIdx: number, n: number): boolean {
  if (n < 3) return false;
  const prev = (vertexIdx - 1 + n) % n;
  const next = (vertexIdx + 1) % n;
  const pPrev = pts[prev];
  const pCurr = pts[vertexIdx];
  const pNext = pts[next];
  if (!pPrev || !pCurr || !pNext) return true;
  const ax = pCurr.x - pPrev.x;
  const ay = pCurr.y - pPrev.y;
  const bx = pNext.x - pCurr.x;
  const by = pNext.y - pCurr.y;
  const lenA = Math.sqrt(ax * ax + ay * ay);
  const lenB = Math.sqrt(bx * bx + by * by);
  if (lenA < 1e-12 || lenB < 1e-12) return false;
  const dot = (ax / lenA) * (bx / lenB) + (ay / lenA) * (by / lenB);
  return dot <= COLLINEAR_FRAME_MITER_DOT_THRESH;
}

/**
 * Grid index bounds for path-segment pattern loops. A fixed ±50 cell window only spans a few metres
 * when stepLength is small (cobble), so long straight arms stay empty; derive bounds from the segment region.
 */
function pathSegmentPatternIndexBounds(
  region: Point[],
  origin: Point,
  dir: Point,
  perp: Point,
  stepLength: number,
  stepWidth: number,
  alongPx: number,
  acrossPx: number,
  pattern: string,
): { cMin: number; cMax: number; rMin: number; rMax: number } {
  let minAlong = Infinity, maxAlong = -Infinity;
  let minAcross = Infinity, maxAcross = -Infinity;
  for (const p of region) {
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    const along = dx * dir.x + dy * dir.y;
    const across = dx * perp.x + dy * perp.y;
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
    minAcross = Math.min(minAcross, across);
    maxAcross = Math.max(maxAcross, across);
  }
  const marginAlong = alongPx + stepLength * 2;
  const marginAcross = acrossPx + stepWidth * 2;
  minAlong -= marginAlong;
  maxAlong += marginAlong;
  minAcross -= marginAcross;
  maxAcross += marginAcross;
  const padC = pattern === "brick" || pattern === "onethird" ? 2 : 0;
  const sl = Math.max(stepLength, 1e-12);
  const sw = Math.max(stepWidth, 1e-12);
  const cMin = Math.floor(minAlong / sl) - 2 - padC;
  const cMax = Math.ceil(maxAlong / sl) + 2 + padC;
  const rMin = Math.floor(minAcross / sw) - 2;
  const rMax = Math.ceil(maxAcross / sw) + 2;
  return { cMin, cMax, rMin, rMax };
}

/** 45° herringbone: spacing along pattern dir and between rows (perp). */
export function herringbone45StepPx(L: number, W: number, j: number): { sx: number; sy: number } {
  const base = (L + W) / Math.SQRT2;
  return { sx: base + j, sy: base / 2 + j };
}

/** Rectangle L×W in local axes: lenAlong along dir, lenAcross along perp. */
export function herringboneRectCorners(cx: number, cy: number, lenAlong: number, lenAcross: number, dir: Point, perp: Point): Point[] {
  const blkLenX = lenAlong * dir.x;
  const blkLenY = lenAlong * dir.y;
  const blkWidX = lenAcross * perp.x;
  const blkWidY = lenAcross * perp.y;
  return [
    { x: cx, y: cy },
    { x: cx + blkLenX, y: cy + blkLenY },
    { x: cx + blkLenX + blkWidX, y: cy + blkLenY + blkWidY },
    { x: cx + blkWidX, y: cy + blkWidY },
  ];
}

/** Center (mx,my), long side along unit vector dirL, short along its perpendicular. */
export function herringboneRectCornersFromCenter(mx: number, my: number, L: number, W: number, dirL: Point): Point[] {
  const px = -dirL.y;
  const py = dirL.x;
  const hL = L / 2;
  const hW = W / 2;
  const x0 = mx - hL * dirL.x - hW * px;
  const y0 = my - hL * dirL.y - hW * py;
  return herringboneRectCorners(x0, y0, L, W, dirL, { x: px, y: py });
}

/**
 * Classic 45° herringbone: long axis alternates ±45° from pattern dir; rows stagger by half a step along dir.
 * (dir, perp) is the same orthonormal basis as grid/brick patterns.
 */
export function herringbone45CornersAtCell(
  origin: Point,
  dir: Point,
  perp: Point,
  L: number,
  W: number,
  j: number,
  ii: number,
  jj: number,
): Point[] {
  const phi = Math.atan2(dir.y, dir.x);
  const dirLongA = { x: Math.cos(phi + Math.PI / 4), y: Math.sin(phi + Math.PI / 4) };
  const dirLongB = { x: Math.cos(phi - Math.PI / 4), y: Math.sin(phi - Math.PI / 4) };
  const { sx, sy } = herringbone45StepPx(L, W, j);
  const dirLong = jj % 2 === 0 ? dirLongA : dirLongB;
  const stagger = (jj % 2) * (sx / 2);
  const mx = origin.x + (ii * sx + stagger) * dir.x + jj * sy * perp.x;
  const my = origin.y + (ii * sx + stagger) * dir.y + jj * sy * perp.y;
  return herringboneRectCornersFromCenter(mx, my, L, W, dirLong);
}

/** Index bounds for herringbone (ii,jj) cells from max extent from origin. */
export function herringbonePolygonIjIndexBounds(
  maxAlongDir: number,
  maxAlongPerp: number,
  L: number,
  W: number,
  j: number,
): { iMin: number; iMax: number; jMin: number; jMax: number } {
  const { sx, sy } = herringbone45StepPx(L, W, j);
  const sm = Math.max(Math.min(sx, sy), 1e-12);
  const n = Math.ceil(Math.max(maxAlongDir, maxAlongPerp) / sm) + 6;
  const cap = Math.min(100, Math.max(n, 10));
  return { iMin: -cap, iMax: cap, jMin: -cap, jMax: cap };
}

/** Same for one path segment region (bounding box in dir/perp). */
export function pathSegmentHerringboneIjBounds(
  region: Point[],
  origin: Point,
  dir: Point,
  perp: Point,
  L: number,
  W: number,
  j: number,
): { iMin: number; iMax: number; jMin: number; jMax: number } {
  let minAlong = Infinity, maxAlong = -Infinity;
  let minAcross = Infinity, maxAcross = -Infinity;
  for (const p of region) {
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    const along = dx * dir.x + dy * dir.y;
    const across = dx * perp.x + dy * perp.y;
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
    minAcross = Math.min(minAcross, across);
    maxAcross = Math.max(maxAcross, across);
  }
  const margin = L + W + 2 * j;
  const spanAlong = maxAlong - minAlong + 2 * margin;
  const spanAcross = maxAcross - minAcross + 2 * margin;
  const { sx, sy } = herringbone45StepPx(L, W, j);
  const sm = Math.max(Math.min(sx, sy), 1e-12);
  const n = Math.ceil(Math.max(spanAlong, spanAcross) / sm) + 6;
  const cap = Math.min(100, Math.max(n, 10));
  return { iMin: -cap, iMax: cap, jMin: -cap, jMax: cap };
}

/** Match drawCobblestonePattern: cap iteration budget so path monoblock stays interactive (normal cobble uses EXTEND_CAP 100 → ~40k cells). */
const PATH_COBBLE_MAX_CELLS_PER_SEGMENT = 100_000;

function pathCobbleApplyMaxCellBudget(
  strideC: number,
  strideR: number,
  cMin: number,
  cMax: number,
  rMin: number,
  rMax: number,
): { strideC: number; strideR: number } {
  const spanC = cMax - cMin + 1;
  const spanR = rMax - rMin + 1;
  const estCells = Math.ceil(spanC / strideC) * Math.ceil(spanR / strideR);
  if (estCells > PATH_COBBLE_MAX_CELLS_PER_SEGMENT) {
    const dec = Math.ceil(Math.sqrt(estCells / PATH_COBBLE_MAX_CELLS_PER_SEGMENT));
    return { strideC: strideC * dec, strideR: strideR * dec };
  }
  return { strideC, strideR };
}

/**
 * Screen-space LOD: skip blocks that would render smaller than ~2.5px (same idea as capping work in drawCobblestonePattern).
 * Then applies {@link pathCobbleApplyMaxCellBudget}.
 */
export function pathCobbleGridStride(
  worldToScreen: WorldToScreen,
  refWorld: Point,
  dir: Point,
  perp: Point,
  stepLength: number,
  stepWidth: number,
  cMin: number,
  cMax: number,
  rMin: number,
  rMax: number,
): { strideC: number; strideR: number } {
  const base = worldToScreen(refWorld.x, refWorld.y);
  const pAlong = worldToScreen(refWorld.x + stepLength * dir.x, refWorld.y + stepLength * dir.y);
  const pAcross = worldToScreen(refWorld.x + stepWidth * perp.x, refWorld.y + stepWidth * perp.y);
  const pxAlong = Math.hypot(pAlong.x - base.x, pAlong.y - base.y);
  const pxAcross = Math.hypot(pAcross.x - base.x, pAcross.y - base.y);
  const LOD_PX = 2.5;
  let strideC = pxAlong >= LOD_PX ? 1 : Math.max(1, Math.ceil(LOD_PX / Math.max(pxAlong, 0.05)));
  let strideR = pxAcross >= LOD_PX ? 1 : Math.max(1, Math.ceil(LOD_PX / Math.max(pxAcross, 0.05)));
  return pathCobbleApplyMaxCellBudget(strideC, strideR, cMin, cMax, rMin, rMax);
}

/** Area of rect ∩ polygon using Sutherland-Hodgman. Use only for convex polygons. */
function rectPolygonIntersectionAreaConvex(corners: Point[], polygon: Point[]): number {
  const result = rectPolygonIntersection(corners, polygon);
  if (result.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < result.length; i++) {
    const j = (i + 1) % result.length;
    area += result[i].x * result[j].y - result[j].x * result[i].y;
  }
  return Math.abs(area) / 2;
}

/** Area of rect ∩ polygon. Uses triangulation fallback for concave polygons (Sutherland-Hodgman fails). */
export function rectPolygonIntersectionArea(corners: Point[], polygon: Point[]): number {
  if (polygon.length < 3) return 0;
  if (!hasConcaveVertex(polygon)) return rectPolygonIntersectionAreaConvex(corners, polygon);
  let area = 0;
  for (let i = 1; i < polygon.length - 1; i++) {
    const tri = [polygon[0], polygon[i], polygon[i + 1]];
    area += rectPolygonIntersectionAreaConvex(corners, tri);
  }
  return area;
}

/** Waste polygon = slab minus demand. Clips slab by outside of each demand edge. */
export function computeWastePolygon(slabCorners: Point[], demandPolygon: Point[]): Point[] {
  if (demandPolygon.length < 3) return [];
  let result: Point[] = [...slabCorners];
  const n = demandPolygon.length;
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += demandPolygon[i].x * demandPolygon[j].y - demandPolygon[j].x * demandPolygon[i].y;
  }
  signedArea /= 2;
  const keepLeft = signedArea < 0;
  for (let i = 0; i < n; i++) {
    const a = demandPolygon[i];
    const b = demandPolygon[(i + 1) % n];
    result = clipPolygonByEdge(result, a, b, keepLeft);
    if (result.length < 3) return [];
  }
  return result;
}

/** Polygon area (signed). */
function polygonArea(poly: Point[]): number {
  if (poly.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return area / 2;
}

/** Bounding box of polygon in cm, in local axes (origin, dir, perp). */
export function polygonBboxCm(poly: Point[], origin: Point, dir: Point, perp: Point): { w: number; l: number } {
  if (poly.length < 2) return { w: 0, l: 0 };
  let minD = Infinity, maxD = -Infinity, minP = Infinity, maxP = -Infinity;
  for (const p of poly) {
    const dx = p.x - origin.x, dy = p.y - origin.y;
    const d = dx * dir.x + dy * dir.y;
    const pp = dx * perp.x + dy * perp.y;
    if (d < minD) minD = d;
    if (d > maxD) maxD = d;
    if (pp < minP) minP = pp;
    if (pp > maxP) maxP = pp;
  }
  const l = toMeters(Math.max(0, maxD - minD)) * 100;
  const w = toMeters(Math.max(0, maxP - minP)) * 100;
  return { w, l };
}

/** Rotate polygon around centroid by angle radians. */
function rotatePolygon(poly: Point[], angle: number, center: Point): Point[] {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return poly.map(p => {
    const dx = p.x - center.x, dy = p.y - center.y;
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
  });
}

/** Polygon centroid. */
function polygonCentroid(poly: Point[]): Point {
  let sx = 0, sy = 0;
  for (const p of poly) { sx += p.x; sy += p.y; }
  const n = poly.length;
  return { x: sx / n, y: sy / n };
}

/** Check if polygon A fits inside polygon B (all vertices of A inside B, no crossing). */
function polygonFitsInPolygon(inner: Point[], outer: Point[]): boolean {
  for (const p of inner) {
    if (!pointInPolygon(p, outer)) return false;
  }
  return true;
}

/** Translate polygon by (dx, dy). */
function translatePolygon(poly: Point[], dx: number, dy: number): Point[] {
  return poly.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

/** Check if demand polygon fits in waste polygon with any rotation (0°, 90°, 180°, 270°).
 * Translates demand centroid to waste centroid, then tries rotations. */
export function polygonFitsInPolygonWithRotation(demand: Point[], waste: Point[]): boolean {
  if (demand.length < 3 || waste.length < 3) return false;
  const dc = polygonCentroid(demand);
  const wc = polygonCentroid(waste);
  const translated = translatePolygon(demand, wc.x - dc.x, wc.y - dc.y);
  for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const rotated = rotatePolygon(translated, angle, wc);
    if (polygonFitsInPolygon(rotated, waste)) return true;
  }
  return false;
}

/** Docinka (red) only when the USABLE part inside the element is < 15% of full element. */
const SMALL_CUT_USED_THRESHOLD = 0.15;

export function isSmallCutByWaste(corners: Point[], polygon: Point[], fullArea: number): boolean {
  if (fullArea <= 0) return false;
  const usedArea = rectPolygonIntersectionArea(corners, polygon);
  return usedArea < SMALL_CUT_USED_THRESHOLD * fullArea;
}

/**
 * Draw segment-based slab pattern for paths with pathCenterline.
 * Returns true if drawn; false if caller should fall back to drawSlabPattern.
 */
export function drawPathSlabPattern(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  zoom: number,
  showCuts: boolean = true,
  useNormalColorsForCuts?: boolean,
  pathPatternLongOffsetMBySegmentOverride?: Record<number, number>,
  allShapes?: Shape[]
): boolean {
  const inputs = shape.calculatorInputs;
  const resolved = resolvePathPatternCenterlineAndSides(shape, inputs);
  if (!resolved) return false;
  const { pathCenterline, pathSegmentSides } = resolved;
  if (!inputs?.vizSlabWidth || !inputs?.vizSlabLength) return false;

  let outline = getPathSlabPatternClipOutline(shape, inputs);
  if (!outline) return false;

  let maxLinkedExpansionPx = 0;
  const frameLinkedEdges = inputs?.frameLinkedEdges as { myEdgeIdx: number; otherShapeIdx: number; otherEdgeIdx: number }[] | undefined;
  if (allShapes && Array.isArray(frameLinkedEdges) && frameLinkedEdges.length > 0) {
    const { edgeIndices } = getPathSlabClipPolygonWithIndices(shape);
    const nOrig = edgeIndices.length;
    if (nOrig === outline.length) {
      const linkedExpansions = new Map<number, number>();
      for (const link of frameLinkedEdges) {
        const otherShape = allShapes[link.otherShapeIdx];
        if (!otherShape) continue;
        const otherFwCm = getTotalFrameInsetWidthCm(otherShape.calculatorInputs);
        if (otherFwCm <= 0) continue;
        const otherFwPx = toPixels(otherFwCm / 100);
        const fseIdx = (link.myEdgeIdx + 1) % nOrig;
        linkedExpansions.set(fseIdx, Math.max(linkedExpansions.get(fseIdx) ?? 0, otherFwPx));
        maxLinkedExpansionPx = Math.max(maxLinkedExpansionPx, otherFwPx);
      }
      if (linkedExpansions.size > 0) {
        const expanded = expandOutlineOnLinkedEdges(outline, edgeIndices, linkedExpansions);
        if (expanded.length >= 3) outline = expanded;
      }
    }
  }

  const frameWidthPx = toPixels(getTotalFrameInsetWidthCm(inputs) / 100);
  const pathWidthM = Number(inputs?.pathWidthM ?? 0.6) || 0.6;
  const pathFullPx = toPixels(pathWidthM);
  const nCl = pathCenterline.length;

  const slabWidthCm = Number(inputs.vizSlabWidth);
  const slabLengthCm = Number(inputs.vizSlabLength);
  const groutMm = Number(inputs.vizGroutWidthMm ?? (inputs.vizGroutWidth != null ? Number(inputs.vizGroutWidth) * 10 : 5));
  const slabOrientation = (inputs.slabOrientation as "along" | "across") || "along";
  const slabWidthPx = toPixels(slabWidthCm / 100);
  const slabLengthPx = toPixels(slabLengthCm / 100);
  const groutPx = toPixels(groutMm / 1000);

  const alongPx = slabOrientation === "along" ? slabWidthPx : slabLengthPx;
  const acrossPx = slabOrientation === "along" ? slabLengthPx : slabWidthPx;
  const stepLength = alongPx + groutPx;
  const stepWidth = acrossPx + groutPx;
  const pattern = inputs.vizPattern ?? "grid";
  const isBrickS = pattern === "brick";
  const isOneThirdS = pattern === "onethird";
  const oneThirdOffsetsS = [0, 1 / 3, 2 / 3];
  const rawBySeg = inputs?.pathPatternLongOffsetMBySegment as number[] | undefined;
  const fallbackM = Number(inputs?.pathPatternLongOffsetM ?? 0) || 0;
  const getOffsetMForSegment = (segIdx: number): number =>
    pathPatternLongOffsetMBySegmentOverride?.[segIdx] ?? (Array.isArray(rawBySeg) && rawBySeg[segIdx] != null ? (Number(rawBySeg[segIdx]) || 0) : fallbackM);

  const slabAreaPx2 = slabWidthPx * slabLengthPx;
  const slabCutAreaThreshold = slabAreaPx2 * 0.99;
  const vizWaste = inputs?.vizWasteSatisfied;
  const wasteSatisfiedSet = new Set<string>(
    Array.isArray(vizWaste) ? vizWaste : (typeof vizWaste === "string" && vizWaste ? [vizWaste] : [])
  );

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(worldToScreen(outline[0].x, outline[0].y).x, worldToScreen(outline[0].x, outline[0].y).y);
  for (let i = 1; i < outline.length; i++) {
    const s = worldToScreen(outline[i].x, outline[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.clip();

  let fullCount = 0;
  let cutCount = 0;

  const drawSlabFragment = (corners: Point[], isCut: boolean, r: number, c: number, segIdx: number, tileKey?: string) => {
    if (corners.length < 3) return;
    if (isCut && !showCuts) return;
    isCut ? cutCount++ : fullCount++;
    const key = tileKey ?? `${segIdx},${r},${c}`;
    const isWasteReused = isCut && wasteSatisfiedSet.has(key);
    const usedArea = rectPolygonIntersectionArea(corners, outline);
    const wouldBeSmallByArea = usedArea < SMALL_CUT_USED_THRESHOLD * slabAreaPx2;
    const isSmallCut = isCut && !isWasteReused && wouldBeSmallByArea;
    const s0 = worldToScreen(corners[0].x, corners[0].y);
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < corners.length; i++) {
      const s = worldToScreen(corners[i].x, corners[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    ctx.fillStyle = isCut
      ? (useNormalColorsForCuts ? SLAB_COLOR : (isWasteReused ? SLAB_WASTE_REUSED_COLOR : (isSmallCut ? SLAB_SMALL_CUT_COLOR : SLAB_CUT_COLOR)))
      : SLAB_COLOR;
    ctx.fill();
    ctx.strokeStyle = GROUT_COLOR;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (isCut) {
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const pathCornerType = (inputs?.pathCornerType as "butt" | "miter45") ?? ((inputs?.frameJointType as string) === "butt" ? "butt" : "miter45");
  /** Butt: draw higher segIdx first so lower index is painted last → earlier arm overlaps the next (matches frame junction priority). */
  const nSegSlab = nCl - 1;
  const segDrawOrderSlab: number[] =
    pathCornerType === "butt"
      ? Array.from({ length: nSegSlab }, (_, i) => nSegSlab - 1 - i)
      : Array.from({ length: nSegSlab }, (_, i) => i);

  for (const segIdx of segDrawOrderSlab) {
    const A = pathCenterline[segIdx];
    const B = pathCenterline[segIdx + 1];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const dir = pathSegmentDirSnapped(dx, dy, len);
    const perp = { x: -dir.y, y: dir.x };

    const side = pathSegmentSides[segIdx];
    const sign = side === "left" ? 1 : -1;
    const oA = { x: A.x + sign * perp.x * pathFullPx, y: A.y + sign * perp.y * pathFullPx };
    const oB = { x: B.x + sign * perp.x * pathFullPx, y: B.y + sign * perp.y * pathFullPx };

    const JOINT_EXT = pathFullPx * 3;
    const END_EXT = Math.max(frameWidthPx + groutPx, maxLinkedExpansionPx + groutPx);
    let rA = A, rOA = oA, rB = B, rOB = oB;
    if (segIdx > 0) {
      rA = { x: A.x - dir.x * JOINT_EXT, y: A.y - dir.y * JOINT_EXT };
      rOA = { x: rA.x + sign * perp.x * pathFullPx, y: rA.y + sign * perp.y * pathFullPx };
    } else if (END_EXT > 0) {
      rA = { x: A.x - dir.x * END_EXT, y: A.y - dir.y * END_EXT };
      rOA = { x: rA.x + sign * perp.x * pathFullPx, y: rA.y + sign * perp.y * pathFullPx };
    }
    if (segIdx < nCl - 2) {
      rB = { x: B.x + dir.x * JOINT_EXT, y: B.y + dir.y * JOINT_EXT };
      rOB = { x: rB.x + sign * perp.x * pathFullPx, y: rB.y + sign * perp.y * pathFullPx };
    } else if (END_EXT > 0) {
      rB = { x: B.x + dir.x * END_EXT, y: B.y + dir.y * END_EXT };
      rOB = { x: rB.x + sign * perp.x * pathFullPx, y: rB.y + sign * perp.y * pathFullPx };
    }
    const sideChangeAtB = segIdx < nCl - 2 && pathSegmentSides[segIdx + 1] !== side;
    const sideChangeAtA = segIdx > 0 && pathSegmentSides[segIdx - 1] !== side;
    let rA_base = rA;
    let rB_base = rB;
    if (sideChangeAtA) {
      rA_base = { x: rA.x - sign * perp.x * pathFullPx, y: rA.y - sign * perp.y * pathFullPx };
    }
    if (sideChangeAtB) {
      rB_base = { x: rB.x - sign * perp.x * pathFullPx, y: rB.y - sign * perp.y * pathFullPx };
    }
    const region: Point[] = [rOA, rOB, rB_base, rA_base];

    // For mitre cut: anchor grid at corner so grout lines align. Use corner vertex as origin.
    const cornerVertex = pathCornerType === "miter45" && segIdx < nCl - 2 ? B : A;
    const originBase = { x: cornerVertex.x + sign * perp.x * frameWidthPx, y: cornerVertex.y + sign * perp.y * frameWidthPx };
    const pathPatternLongOffsetPx = toPixels(getOffsetMForSegment(segIdx));
    const origin = { x: originBase.x + dir.x * pathPatternLongOffsetPx, y: originBase.y + dir.y * pathPatternLongOffsetPx };
    const insidePoint = { x: (A.x + B.x) / 2 + sign * perp.x * pathFullPx * 0.5, y: (A.y + B.y) / 2 + sign * perp.y * pathFullPx * 0.5 };

    const cornerClips: { edgeA: Point; edgeB: Point; keepLeft: boolean }[] = [];
    if (pathCornerType === "miter45") {
      if (segIdx > 0) {
        const prev = pathCenterline[segIdx - 1];
        const d1x = A.x - prev.x;
        const d1y = A.y - prev.y;
        const len1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
        const d1 = { x: d1x / len1, y: d1y / len1 };
        const lineDir = pathJointCornerClipLineDirMiter45(d1, dir);
        const edgeA = A;
        const edgeB = { x: A.x + lineDir.x, y: A.y + lineDir.y };
        cornerClips.push({ edgeA, edgeB, keepLeft: crossEdge(edgeA, edgeB, insidePoint) >= 0 });
      }
      if (segIdx < nCl - 2) {
        const next = pathCenterline[segIdx + 2];
        const d1x = B.x - A.x;
        const d1y = B.y - A.y;
        const d2x = next.x - B.x;
        const d2y = next.y - B.y;
        const len1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
        const len2 = Math.sqrt(d2x * d2x + d2y * d2y) || 1;
        const d1 = { x: d1x / len1, y: d1y / len1 };
        const d2 = { x: d2x / len2, y: d2y / len2 };
        const lineDir = pathJointCornerClipLineDirMiter45(d1, d2);
        const edgeA = B;
        const edgeB = { x: B.x + lineDir.x, y: B.y + lineDir.y };
        cornerClips.push({ edgeA, edgeB, keepLeft: crossEdge(edgeA, edgeB, insidePoint) >= 0 });
      }
    }

    const { cMin, cMax, rMin, rMax } = pathSegmentPatternIndexBounds(
      region,
      origin,
      dir,
      perp,
      stepLength,
      stepWidth,
      alongPx,
      acrossPx,
      pattern,
    );

    const sdirStepX = stepLength * dir.x;
    const sdirStepY = stepLength * dir.y;
    const sperpStepX = stepWidth * perp.x;
    const sperpStepY = stepWidth * perp.y;
    const sdirAlongX = alongPx * dir.x;
    const sdirAlongY = alongPx * dir.y;
    const sperpAcrossX = acrossPx * perp.x;
    const sperpAcrossY = acrossPx * perp.y;

    const clipAndDrawSlab = (corners: Point[], r: number, c: number, tileKey?: string) => {
      if (!rectIntersectsPolygon(corners, region)) return;
      let clipped = rectPolygonIntersection(corners, region);
      if (clipped.length < 3) return;
      for (const { edgeA, edgeB, keepLeft } of cornerClips) {
        clipped = clipPolygonByEdge(clipped, edgeA, edgeB, keepLeft);
        if (clipped.length < 3) break;
      }
      if (clipped.length < 3) return;
      const clippedArea = Math.abs(polygonArea(clipped));
      const isCut = slabAreaPx2 < 1e-20 || clippedArea < slabCutAreaThreshold;
      if (isCut && pathPatternIsDustFragment(clippedArea, slabAreaPx2, groutPx)) return;
      drawSlabFragment(clipped, isCut, r, c, segIdx, tileKey);
    };

    if (pattern === "herringbone") {
      const L = alongPx;
      const W = acrossPx;
      const j = groutPx;
      const hb = pathSegmentHerringboneIjBounds(region, origin, dir, perp, L, W, j);
      for (let jj = hb.jMin; jj <= hb.jMax; jj++) {
        for (let ii = hb.iMin; ii <= hb.iMax; ii++) {
          const corners = herringbone45CornersAtCell(origin, dir, perp, L, W, j, ii, jj);
          clipAndDrawSlab(corners, jj, ii);
        }
      }
    } else {
      for (let r = rMin; r <= rMax; r++) {
        let offsetC = 0;
        if (isBrickS && r % 2 !== 0) offsetC = 0.5;
        else if (isOneThirdS) offsetC = oneThirdOffsetsS[((r % 3) + 3) % 3];
        const rowBaseX = origin.x + r * sperpStepX;
        const rowBaseY = origin.y + r * sperpStepY;

        for (let c = cMin; c <= cMax; c++) {
          const cx = rowBaseX + (c + offsetC) * sdirStepX;
          const cy = rowBaseY + (c + offsetC) * sdirStepY;
          const corners: Point[] = [
            { x: cx, y: cy },
            { x: cx + sdirAlongX, y: cy + sdirAlongY },
            { x: cx + sdirAlongX + sperpAcrossX, y: cy + sdirAlongY + sperpAcrossY },
            { x: cx + sperpAcrossX, y: cy + sperpAcrossY },
          ];
          clipAndDrawSlab(corners, r, c);
        }
      }
    }
  }

  ctx.restore();

  return true;
}

/**
 * Path slab label: full/cut counts only — call AFTER path stroke so the label sits on the outline.
 */
export function drawPathSlabLabel(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  zoom: number
): void {
  const inputs = shape.calculatorInputs;
  const resolved = resolvePathPatternCenterlineAndSides(shape, inputs);
  if (!resolved || !inputs?.vizSlabWidth || !inputs?.vizSlabLength) return;
  const { pathCenterline } = resolved;

  const result = computePathSlabCuts(shape, inputs);
  const { cutSlabCount, fullSlabCount, wasteSatisfiedPositions } = result;
  const total = fullSlabCount + cutSlabCount;
  if (total <= 0) return;
  const wasteSatisfiedCount = Array.isArray(wasteSatisfiedPositions) ? wasteSatisfiedPositions.length : 0;
  const slabsForCuts = Math.max(0, cutSlabCount - wasteSatisfiedCount);

  const baseFontSize = 14;
  const scaledFont = scaledFontSize(baseFontSize, zoom);
  ctx.font = `bold ${scaledFont}px 'JetBrains Mono',monospace`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";

  const outline = getPathPolygon(shape);
  const interiorRef = outline.length >= 3 ? centroid(outline) : pathCenterline[0]!;
  const placement = pathLongestSegmentLabelPlacement(pathCenterline, interiorRef);
  if (!placement) return;

  const sc = worldToScreen(placement.point.x, placement.point.y);
  ctx.save();
  ctx.translate(sc.x, sc.y);
  ctx.rotate(placement.textAngleRad);
  const label =
    slabsForCuts > 0
      ? `${fullSlabCount} full, ${cutSlabCount} cut (from ${slabsForCuts} slabs)`
      : `${fullSlabCount} full, ${cutSlabCount} cut`;
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/**
 * Segment-based monoblock (cobble) fill for paths — same geometry as {@link drawPathSlabPattern}.
 * Global grid on {@link getPathPolygon} fails on concave L-paths and explodes iteration count; this matches slab behaviour.
 */
export function drawPathCobblePattern(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  zoom: number,
  showCuts: boolean = true,
  useNormalColorsForCuts?: boolean,
  pathPatternLongOffsetMBySegmentOverride?: Record<number, number>,
  allShapes?: Shape[]
): boolean {
  const inputs = shape.calculatorInputs;
  if (inputs?.monoblockLayoutMode === "mix") return false;

  const resolved = resolvePathPatternCenterlineAndSides(shape, inputs);
  if (!resolved || !inputs) return false;
  const { pathCenterline, pathSegmentSides } = resolved;

  const blockWidthCm = Number(inputs.blockWidthCm ?? 0);
  const blockLengthCm = Number(inputs?.blockLengthCm ?? 0);
  if (!blockWidthCm || !blockLengthCm) return false;

  let outline = getPathSlabPatternClipOutline(shape, inputs);
  if (!outline) return false;

  let maxLinkedExpansionPx = 0;
  const frameLinkedEdges = inputs?.frameLinkedEdges as { myEdgeIdx: number; otherShapeIdx: number; otherEdgeIdx: number }[] | undefined;
  if (allShapes && Array.isArray(frameLinkedEdges) && frameLinkedEdges.length > 0) {
    const { edgeIndices } = getPathSlabClipPolygonWithIndices(shape);
    const nOrig = edgeIndices.length;
    if (nOrig === outline.length) {
      const linkedExpansions = new Map<number, number>();
      for (const link of frameLinkedEdges) {
        const otherShape = allShapes[link.otherShapeIdx];
        if (!otherShape) continue;
        const otherFwCm = getTotalFrameInsetWidthCm(otherShape.calculatorInputs);
        if (otherFwCm <= 0) continue;
        const otherFwPx = toPixels(otherFwCm / 100);
        const fseIdx = (link.myEdgeIdx + 1) % nOrig;
        linkedExpansions.set(fseIdx, Math.max(linkedExpansions.get(fseIdx) ?? 0, otherFwPx));
        maxLinkedExpansionPx = Math.max(maxLinkedExpansionPx, otherFwPx);
      }
      if (linkedExpansions.size > 0) {
        const expanded = expandOutlineOnLinkedEdges(outline, edgeIndices, linkedExpansions);
        if (expanded.length >= 3) outline = expanded;
      }
    }
  }

  const frameWidthPx = toPixels(getTotalFrameInsetWidthCm(inputs) / 100);
  const pathWidthM = Number(inputs?.pathWidthM ?? 0.6) || 0.6;
  const pathFullPx = toPixels(pathWidthM);
  const nCl = pathCenterline.length;

  const jointGapMm = Number(inputs?.jointGapMm ?? 1);
  const jointPx = toPixels(jointGapMm / 1000);
  const slabOrientation = (inputs.slabOrientation as "along" | "across") || "along";
  const blockWidthPx = toPixels(blockWidthCm / 100);
  const blockLengthPx = toPixels(blockLengthCm / 100);
  const alongPx = slabOrientation === "along" ? blockLengthPx : blockWidthPx;
  const acrossPx = slabOrientation === "along" ? blockWidthPx : blockLengthPx;
  const stepLength = alongPx + jointPx;
  const stepWidth = acrossPx + jointPx;
  const pattern = inputs.vizPattern ?? "grid";
  const isBrick = pattern === "brick";
  const isOneThird = pattern === "onethird";
  const isHerringbone = pattern === "herringbone";
  const oneThirdOffsets = [0, 1 / 3, 2 / 3];
  const rawBySeg = inputs?.pathPatternLongOffsetMBySegment as number[] | undefined;
  const fallbackM = Number(inputs?.pathPatternLongOffsetM ?? 0) || 0;
  const getOffsetMForSegment = (segIdx: number): number =>
    pathPatternLongOffsetMBySegmentOverride?.[segIdx] ?? (Array.isArray(rawBySeg) && rawBySeg[segIdx] != null ? (Number(rawBySeg[segIdx]) || 0) : fallbackM);

  const blockAreaPx2 = blockWidthPx * blockLengthPx;
  const cutAreaThreshold = blockAreaPx2 * 0.99;
  const smallCutThreshold = SMALL_CUT_USED_THRESHOLD * blockAreaPx2;
  const vizWaste = inputs?.vizWasteSatisfied;
  const wasteSatisfiedSet = new Set<string>(
    Array.isArray(vizWaste) ? vizWaste : (typeof vizWaste === "string" && vizWaste ? [vizWaste] : [])
  );

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(worldToScreen(outline[0].x, outline[0].y).x, worldToScreen(outline[0].x, outline[0].y).y);
  for (let i = 1; i < outline.length; i++) {
    const s = worldToScreen(outline[i].x, outline[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.clip();

  let fullCount = 0;
  let cutCount = 0;

  const pathFull = new Path2D();
  const pathCutNorm = new Path2D();
  const pathCutReuse = new Path2D();
  const pathCutSmall = new Path2D();
  const pathJoint = new Path2D();
  const pathCutDash = new Path2D();

  const pathCornerType = (inputs?.pathCornerType as "butt" | "miter45") ?? ((inputs?.frameJointType as string) === "butt" ? "butt" : "miter45");
  const nSegCobble = nCl - 1;
  const segDrawOrderCobble: number[] =
    pathCornerType === "butt"
      ? Array.from({ length: nSegCobble }, (_, i) => nSegCobble - 1 - i)
      : Array.from({ length: nSegCobble }, (_, i) => i);

  for (const segIdx of segDrawOrderCobble) {
    const A = pathCenterline[segIdx];
    const B = pathCenterline[segIdx + 1];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const dir = pathSegmentDirSnapped(dx, dy, len);
    const perp = { x: -dir.y, y: dir.x };

    const side = pathSegmentSides[segIdx];
    const sign = side === "left" ? 1 : -1;
    const oA = { x: A.x + sign * perp.x * pathFullPx, y: A.y + sign * perp.y * pathFullPx };
    const oB = { x: B.x + sign * perp.x * pathFullPx, y: B.y + sign * perp.y * pathFullPx };

    const JOINT_EXT = pathFullPx * 3;
    const END_EXT = Math.max(frameWidthPx + jointPx, maxLinkedExpansionPx + jointPx);
    let rA = A, rOA = oA, rB = B, rOB = oB;
    if (segIdx > 0) {
      rA = { x: A.x - dir.x * JOINT_EXT, y: A.y - dir.y * JOINT_EXT };
      rOA = { x: rA.x + sign * perp.x * pathFullPx, y: rA.y + sign * perp.y * pathFullPx };
    } else if (END_EXT > 0) {
      rA = { x: A.x - dir.x * END_EXT, y: A.y - dir.y * END_EXT };
      rOA = { x: rA.x + sign * perp.x * pathFullPx, y: rA.y + sign * perp.y * pathFullPx };
    }
    if (segIdx < nCl - 2) {
      rB = { x: B.x + dir.x * JOINT_EXT, y: B.y + dir.y * JOINT_EXT };
      rOB = { x: rB.x + sign * perp.x * pathFullPx, y: rB.y + sign * perp.y * pathFullPx };
    } else if (END_EXT > 0) {
      rB = { x: B.x + dir.x * END_EXT, y: B.y + dir.y * END_EXT };
      rOB = { x: rB.x + sign * perp.x * pathFullPx, y: rB.y + sign * perp.y * pathFullPx };
    }
    const sideChangeAtB = segIdx < nCl - 2 && pathSegmentSides[segIdx + 1] !== side;
    const sideChangeAtA = segIdx > 0 && pathSegmentSides[segIdx - 1] !== side;
    let rA_base = rA;
    let rB_base = rB;
    if (sideChangeAtA) {
      rA_base = { x: rA.x - sign * perp.x * pathFullPx, y: rA.y - sign * perp.y * pathFullPx };
    }
    if (sideChangeAtB) {
      rB_base = { x: rB.x - sign * perp.x * pathFullPx, y: rB.y - sign * perp.y * pathFullPx };
    }
    const region: Point[] = [rOA, rOB, rB_base, rA_base];

    const cornerVertex = pathCornerType === "miter45" && segIdx < nCl - 2 ? B : A;
    const originBase = { x: cornerVertex.x + sign * perp.x * frameWidthPx, y: cornerVertex.y + sign * perp.y * frameWidthPx };
    const pathPatternLongOffsetPx = toPixels(getOffsetMForSegment(segIdx));
    const origin = { x: originBase.x + dir.x * pathPatternLongOffsetPx, y: originBase.y + dir.y * pathPatternLongOffsetPx };
    const insidePoint = { x: (A.x + B.x) / 2 + sign * perp.x * pathFullPx * 0.5, y: (A.y + B.y) / 2 + sign * perp.y * pathFullPx * 0.5 };

    const cornerClips: { edgeA: Point; edgeB: Point; keepLeft: boolean }[] = [];
    if (pathCornerType === "miter45") {
      if (segIdx > 0) {
        const prev = pathCenterline[segIdx - 1];
        const d1x = A.x - prev.x;
        const d1y = A.y - prev.y;
        const len1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
        const d1 = { x: d1x / len1, y: d1y / len1 };
        const lineDir = pathJointCornerClipLineDirMiter45(d1, dir);
        const edgeA = A;
        const edgeB = { x: A.x + lineDir.x, y: A.y + lineDir.y };
        cornerClips.push({ edgeA, edgeB, keepLeft: crossEdge(edgeA, edgeB, insidePoint) >= 0 });
      }
      if (segIdx < nCl - 2) {
        const next = pathCenterline[segIdx + 2];
        const d1x = B.x - A.x;
        const d1y = B.y - A.y;
        const d2x = next.x - B.x;
        const d2y = next.y - B.y;
        const len1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
        const len2 = Math.sqrt(d2x * d2x + d2y * d2y) || 1;
        const d1 = { x: d1x / len1, y: d1y / len1 };
        const d2 = { x: d2x / len2, y: d2y / len2 };
        const lineDir = pathJointCornerClipLineDirMiter45(d1, d2);
        const edgeA = B;
        const edgeB = { x: B.x + lineDir.x, y: B.y + lineDir.y };
        cornerClips.push({ edgeA, edgeB, keepLeft: crossEdge(edgeA, edgeB, insidePoint) >= 0 });
      }
    }

    const { cMin, cMax, rMin, rMax } = pathSegmentPatternIndexBounds(
      region,
      origin,
      dir,
      perp,
      stepLength,
      stepWidth,
      alongPx,
      acrossPx,
      pattern,
    );

    const dirStepX = stepLength * dir.x;
    const dirStepY = stepLength * dir.y;
    const perpStepX = stepWidth * perp.x;
    const perpStepY = stepWidth * perp.y;
    const dirAlongX = alongPx * dir.x;
    const dirAlongY = alongPx * dir.y;
    const perpAcrossX = acrossPx * perp.x;
    const perpAcrossY = acrossPx * perp.y;

    const drawPathCobbleClipped = (corners: Point[], clipped: Point[] | null, wasteKey: string) => {
      if (!clipped) return;
      let isCut: boolean;
      let clippedArea = 0;
      if (clipped === corners) {
        isCut = false;
      } else {
        clippedArea = Math.abs(polygonArea(clipped));
        isCut = blockAreaPx2 < 1e-20 || clippedArea < cutAreaThreshold;
      }
      if (isCut && pathPatternIsDustFragment(clippedArea, blockAreaPx2, jointPx)) return;
      if (isCut && !showCuts) return;
      if (isCut) cutCount++;
      else fullCount++;

      appendWorldPolygonToPath(pathJoint, clipped, worldToScreen);
      if (!isCut) {
        appendWorldPolygonToPath(pathFull, clipped, worldToScreen);
      } else {
        const isWasteReused = wasteSatisfiedSet.has(wasteKey);
        const isSmallCut = !isWasteReused && clippedArea < smallCutThreshold;
        if (useNormalColorsForCuts) {
          appendWorldPolygonToPath(pathFull, clipped, worldToScreen);
        } else if (isWasteReused) {
          appendWorldPolygonToPath(pathCutReuse, clipped, worldToScreen);
        } else if (isSmallCut) {
          appendWorldPolygonToPath(pathCutSmall, clipped, worldToScreen);
        } else {
          appendWorldPolygonToPath(pathCutNorm, clipped, worldToScreen);
        }
        appendWorldPolygonToPath(pathCutDash, clipped, worldToScreen);
      }
    };

    if (isHerringbone) {
      const L = alongPx;
      const W = acrossPx;
      const j = jointPx;
      const hb = pathSegmentHerringboneIjBounds(region, origin, dir, perp, L, W, j);
      for (let jj = hb.jMin; jj <= hb.jMax; jj++) {
        for (let ii = hb.iMin; ii <= hb.iMax; ii++) {
          const corners = herringbone45CornersAtCell(origin, dir, perp, L, W, j, ii, jj);
          drawPathCobbleClipped(corners, pathCobbleClipRectToSegment(corners, region, cornerClips), `${segIdx},hb,${ii},${jj}`);
        }
      }
    } else {
      const midSeg: Point = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
      const { strideC, strideR } = pathCobbleGridStride(
        worldToScreen,
        midSeg,
        dir,
        perp,
        stepLength,
        stepWidth,
        cMin,
        cMax,
        rMin,
        rMax,
      );

      for (let r = rMin; r <= rMax; r += strideR) {
        let offsetC = 0;
        if (isBrick && r % 2 !== 0) offsetC = 0.5;
        else if (isOneThird) offsetC = oneThirdOffsets[((r % 3) + 3) % 3];
        const rowBaseX = origin.x + r * perpStepX;
        const rowBaseY = origin.y + r * perpStepY;

        for (let c = cMin; c <= cMax; c += strideC) {
          const cx = rowBaseX + (c + offsetC) * dirStepX;
          const cy = rowBaseY + (c + offsetC) * dirStepY;
          const corners: Point[] = [
            { x: cx, y: cy },
            { x: cx + dirAlongX, y: cy + dirAlongY },
            { x: cx + dirAlongX + perpAcrossX, y: cy + dirAlongY + perpAcrossY },
            { x: cx + perpAcrossX, y: cy + perpAcrossY },
          ];
          const clipped = pathCobbleClipRectToSegment(corners, region, cornerClips);
          drawPathCobbleClipped(corners, clipped, `${segIdx},${r},${c}`);
        }
      }
    }
  }

  ctx.fillStyle = COBBLE_BLOCK_COLOR;
  ctx.fill(pathFull);
  if (!useNormalColorsForCuts) {
    ctx.fillStyle = COBBLE_BLOCK_CUT_COLOR;
    ctx.fill(pathCutNorm);
    ctx.fillStyle = COBBLE_BLOCK_WASTE_REUSED_COLOR;
    ctx.fill(pathCutReuse);
    ctx.fillStyle = COBBLE_BLOCK_SMALL_CUT_COLOR;
    ctx.fill(pathCutSmall);
  }
  ctx.strokeStyle = COBBLE_JOINT_COLOR;
  ctx.lineWidth = Math.max(0.5, jointPx);
  ctx.stroke(pathJoint);
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.setLineDash([4, 4]);
  ctx.stroke(pathCutDash);
  ctx.setLineDash([]);

  ctx.restore();

  return true;
}

/** Path monoblock label: full/cut counts only — same placement as {@link drawPathSlabLabel}. */
export function drawPathCobbleLabel(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  zoom: number
): void {
  const inputs = shape.calculatorInputs;
  const resolved = resolvePathPatternCenterlineAndSides(shape, inputs);
  if (!resolved) return;
  const { pathCenterline } = resolved;
  const bw = Number(inputs?.blockWidthCm);
  const bl = Number(inputs?.blockLengthCm);
  if (!bw || !bl) return;

  const cachedFull = Number(inputs?.vizFullBlockCount ?? 0);
  const cachedCutStr = inputs?.cutBlocks;
  const cachedCut = cachedCutStr != null ? Number(cachedCutStr) : 0;
  const cachedWasteSatisfied = inputs?.vizWasteSatisfied;
  const cachedWasteSatisfiedCount = Array.isArray(cachedWasteSatisfied) ? cachedWasteSatisfied.length : 0;

  let fullBlockCount = cachedFull;
  let cutBlockCount = cachedCut;
  let wasteSatisfiedCount = cachedWasteSatisfiedCount;

  if (fullBlockCount === 0 && cutBlockCount === 0) {
    const result = computePathCobbleCuts(shape, inputs!);
    fullBlockCount = result.fullSlabCount;
    cutBlockCount = result.cutSlabCount;
    wasteSatisfiedCount = Array.isArray(result.wasteSatisfiedPositions) ? result.wasteSatisfiedPositions.length : 0;
  }

  const total = fullBlockCount + cutBlockCount;
  if (total <= 0) return;
  const blocksForCuts = Math.max(0, cutBlockCount - wasteSatisfiedCount);

  const baseFontSize = 14;
  const scaledFont = scaledFontSize(baseFontSize, zoom);
  ctx.font = `bold ${scaledFont}px 'JetBrains Mono',monospace`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";

  const outline = getPathPolygon(shape);
  const interiorRef = outline.length >= 3 ? centroid(outline) : pathCenterline[0]!;
  const placement = pathLongestSegmentLabelPlacement(pathCenterline, interiorRef);
  if (!placement) return;

  const sc = worldToScreen(placement.point.x, placement.point.y);
  ctx.save();
  ctx.translate(sc.x, sc.y);
  ctx.rotate(placement.textAngleRad);
  const label =
    blocksForCuts > 0
      ? `${fullBlockCount} full, ${cutBlockCount} cut (from ${blocksForCuts} blocks)`
      : `${fullBlockCount} full, ${cutBlockCount} cut`;
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/**
 * Draw slab pattern on a polygon shape.
 * Called after polygon fill, before edge rendering.
 */
export function drawSlabPattern(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  zoom: number,
  showCuts: boolean = true,
  originOffset?: { x: number; y: number },
  directionDegOverride?: number,
  useNormalColorsForCuts?: boolean
): void {
  const inputs = shape.calculatorInputs;
  if (!inputs?.vizSlabWidth || !inputs?.vizSlabLength) return;

  const { points: ptsRaw, edgeIndices } = getPolygonWithEdgeIndicesForSlab(shape);
  let pts = ptsRaw;
  if (pts.length < 3 || !shape.closed) return;

  const frameSidesEnabled = inputs?.frameSidesEnabled as boolean[] | undefined;
  const frameRowWidthsCm = getFrameBorderRowsFromInputs(inputs).map((r) => r.widthCm).filter((w) => w > 0);
  if (frameRowWidthsCm.length > 0) {
    pts = applyFrameInsetShrinkPolygon(pts, edgeIndices, frameSidesEnabled, frameRowWidthsCm);
  }
  if (pts.length < 3) return;

  const frameWidthCm = getTotalFrameInsetWidthCm(inputs);
  const slabWidthCm = Number(inputs.vizSlabWidth);
  const slabLengthCm = Number(inputs.vizSlabLength);
  const groutMm = Number(inputs.vizGroutWidthMm ?? (inputs.vizGroutWidth != null ? Number(inputs.vizGroutWidth) * 10 : 5));
  const pattern = inputs.vizPattern ?? "grid";
  const directionDeg = directionDegOverride ?? Number(inputs.vizDirection ?? 0);
  const origPts = shape.points;
  const startCorner = Math.max(0, Math.min(origPts.length - 1, Math.floor(Number(inputs.vizStartCorner ?? 0))));

  const slabWidthPx = toPixels(slabWidthCm / 100);
  const slabLengthPx = toPixels(slabLengthCm / 100);
  const groutPx = toPixels(groutMm / 1000);

  const off = originOffset ?? { x: Number(inputs.vizOriginOffsetX ?? 0), y: Number(inputs.vizOriginOffsetY ?? 0) };
  const useInnerOutline = frameWidthCm > 0 && !hasConcaveVertex(origPts);
  const originBase = patternOriginOnOutline(origPts, useInnerOutline ? pts : origPts, startCorner);
  if (!originBase) return;
  const origin = { x: originBase.x + off.x, y: originBase.y + off.y };
  const angle = vizDirectionToPatternAngleRad(directionDeg);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dir = { x: cos, y: sin };
  const perp = { x: -sin, y: cos };

  const stepLength = slabLengthPx + groutPx;
  const stepWidth = slabWidthPx + groutPx;

  let maxAlongDir = 0;
  let maxAlongPerp = 0;
  for (const p of pts) {
    const dDir = Math.abs((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y);
    const dPerp = Math.abs((p.x - origin.x) * perp.x + (p.y - origin.y) * perp.y);
    if (dDir > maxAlongDir) maxAlongDir = dDir;
    if (dPerp > maxAlongPerp) maxAlongPerp = dPerp;
  }
  const extendC = Math.ceil(maxAlongDir / stepLength) + 2;
  const extendR = Math.ceil(maxAlongPerp / stepWidth) + 2;
  const EXTEND_CAP = 100; // Prevent O(extend²) freeze on very large polygons
  const capC = Math.min(Math.max(extendC, 10), EXTEND_CAP);
  const capR = Math.min(Math.max(extendR, 10), EXTEND_CAP);

  const vizWaste = shape.calculatorInputs?.vizWasteSatisfied;
  const wasteSatisfiedSet = new Set<string>(
    Array.isArray(vizWaste) ? vizWaste : (typeof vizWaste === "string" && vizWaste ? [vizWaste] : [])
  );

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(worldToScreen(pts[0].x, pts[0].y).x, worldToScreen(pts[0].x, pts[0].y).y);
  for (let i = 1; i < pts.length; i++) {
    const s = worldToScreen(pts[i].x, pts[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.clip();

  let fullCount = 0;
  let cutCount = 0;
  const slabAreaPx2 = slabWidthPx * slabLengthPx;

  const hasArcs = !!(shape.edgeArcs?.some(a => a && a.length > 0));
  const polygonForIntersection = hasArcs ? pts : pts;

  const countOrigVertsInSlab = (corners: Point[]): number => {
    let n = 0;
    for (const v of origPts) if (pointInOrOnPolygon(v, corners)) n++;
    return n;
  };

  const { strideC, strideR } = pathCobbleGridStride(
    worldToScreen,
    origin,
    dir,
    perp,
    stepLength,
    stepWidth,
    -capC,
    capC,
    -capR,
    capR,
  );

  const pathFull = new Path2D();
  const pathCutNorm = new Path2D();
  const pathCutReuse = new Path2D();
  const pathCutSmall = new Path2D();
  const pathJoint = new Path2D();
  const pathCutDash = new Path2D();

  const dirStepX = stepLength * dir.x;
  const dirStepY = stepLength * dir.y;
  const perpStepX = stepWidth * perp.x;
  const perpStepY = stepWidth * perp.y;
  const blkLenX = slabLengthPx * dir.x;
  const blkLenY = slabLengthPx * dir.y;
  const blkWidX = slabWidthPx * perp.x;
  const blkWidY = slabWidthPx * perp.y;

  const processSlabCorners = (corners: Point[], wasteKey: string) => {
    const fullyInside = rectFullyInsidePolygon(corners, pts);
    if (!fullyInside && !rectIntersectsPolygon(corners, pts)) return;

    if (fullyInside) {
      fullCount++;
      appendWorldPolygonToPath(pathFull, corners, worldToScreen);
      appendWorldPolygonToPath(pathJoint, corners, worldToScreen);
      return;
    }

    if (!showCuts) return;
    cutCount++;
    const isWasteReused = wasteSatisfiedSet.has(wasteKey);
    const vertsInSlab = hasArcs ? countOrigVertsInSlab(corners) : 4;
    const usedAreaOrig = rectPolygonIntersectionArea(corners, polygonForIntersection);
    const usedAreaPts = hasArcs ? rectPolygonIntersectionArea(corners, pts) : usedAreaOrig;
    const usedArea = Math.max(usedAreaOrig, usedAreaPts);
    const wouldBeSmallByArea = usedArea < SMALL_CUT_USED_THRESHOLD * slabAreaPx2;
    const isSmallCut = !isWasteReused && wouldBeSmallByArea && !(hasArcs && vertsInSlab <= 2);

    appendWorldPolygonToPath(pathJoint, corners, worldToScreen);
    if (useNormalColorsForCuts) {
      appendWorldPolygonToPath(pathFull, corners, worldToScreen);
    } else if (isWasteReused) {
      appendWorldPolygonToPath(pathCutReuse, corners, worldToScreen);
    } else if (isSmallCut) {
      appendWorldPolygonToPath(pathCutSmall, corners, worldToScreen);
    } else {
      appendWorldPolygonToPath(pathCutNorm, corners, worldToScreen);
    }
    appendWorldPolygonToPath(pathCutDash, corners, worldToScreen);
  };

  if (pattern === "herringbone") {
    const L = slabLengthPx;
    const W = slabWidthPx;
    const j = groutPx;
    const hb = herringbonePolygonIjIndexBounds(maxAlongDir, maxAlongPerp, L, W, j);
    for (let jj = hb.jMin; jj <= hb.jMax; jj++) {
      for (let ii = hb.iMin; ii <= hb.iMax; ii++) {
        processSlabCorners(herringbone45CornersAtCell(origin, dir, perp, L, W, j, ii, jj), `hb${ii},${jj}`);
      }
    }
  } else {
    for (let r = -capR; r <= capR; r += strideR) {
      for (let c = -capC; c <= capC; c += strideC) {
        let offsetR = r;
        if (pattern === "brick" && c % 2 !== 0) {
          offsetR = r + 0.5;
        } else if (pattern === "onethird") {
          const colOffset = [0, 2 / 3, 1 / 3][((c % 3) + 3) % 3];
          offsetR = r + colOffset;
        }
        const cx = origin.x + c * dirStepX + offsetR * perpStepX;
        const cy = origin.y + c * dirStepY + offsetR * perpStepY;

        const corners: Point[] = [
          { x: cx, y: cy },
          { x: cx + blkLenX, y: cy + blkLenY },
          { x: cx + blkLenX + blkWidX, y: cy + blkLenY + blkWidY },
          { x: cx + blkWidX, y: cy + blkWidY },
        ];
        processSlabCorners(corners, `${r},${c}`);
      }
    }
  }

  ctx.fillStyle = SLAB_COLOR;
  ctx.fill(pathFull);
  if (!useNormalColorsForCuts) {
    ctx.fillStyle = SLAB_CUT_COLOR;
    ctx.fill(pathCutNorm);
    ctx.fillStyle = SLAB_WASTE_REUSED_COLOR;
    ctx.fill(pathCutReuse);
    ctx.fillStyle = SLAB_SMALL_CUT_COLOR;
    ctx.fill(pathCutSmall);
  }
  ctx.strokeStyle = GROUT_COLOR;
  ctx.lineWidth = 1;
  ctx.stroke(pathJoint);
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.setLineDash([4, 4]);
  ctx.stroke(pathCutDash);
  ctx.setLineDash([]);

  const total = fullCount + cutCount;
  const slabAreaCm2 = (inputs?.vizSlabWidth ?? 0) * (inputs?.vizSlabLength ?? 0);
  const totalSlabAreaCm2 = total > 0 && slabAreaCm2 > 0 ? total * slabAreaCm2 : 0;
  const wasteAreaCm2 = Number(inputs?.vizWasteAreaCm2 ?? 0);
  const reusedAreaCm2 = Number(inputs?.vizReusedAreaCm2 ?? 0);
  const actualWasteCm2 = Math.max(0, wasteAreaCm2 - reusedAreaCm2);
  const wastePct = totalSlabAreaCm2 > 0 ? Math.round((actualWasteCm2 / totalSlabAreaCm2) * 100) : (total > 0 ? Math.round((cutCount / total) * 100) : 0);
  const slabsForCuts = Math.max(0, cutCount - wasteSatisfiedSet.size);

  ctx.restore();

  if (total > 0) {
    const areaCtr = polygonCentroidByArea(pts);
    const anchor = pointInPolygon(areaCtr, pts) ? areaCtr : labelAnchorInsidePolygon(pts);
    const sc = worldToScreen(anchor.x, anchor.y);
    const baseFontSize = 14;
    const scaledFont = scaledFontSize(baseFontSize, zoom);
    const lineHeight = scaledFont * 1.2;
    ctx.font = `bold ${scaledFont}px 'JetBrains Mono',monospace`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    if (shape.layer === 2) {
      ctx.fillText(
        slabsForCuts > 0 ? `${fullCount} full, ${cutCount} cut (from ${slabsForCuts} slabs)` : `${fullCount} full, ${cutCount} cut`,
        sc.x,
        sc.y + lineHeight * 0.5,
      );
    } else {
      let line = 0.5;
      const area = areaM2(getPolygonPointsForSlabArea(shape));
      ctx.fillText(area.toFixed(2) + " m²", sc.x, sc.y + lineHeight * line);
      line += 1;
      if (strideC === 1 && strideR === 1) {
        ctx.fillText(slabsForCuts > 0 ? `${fullCount} full, ${cutCount} cut (from ${slabsForCuts} slabs)` : `${fullCount} full, ${cutCount} cut`, sc.x, sc.y + lineHeight * line);
        line += 1;
        ctx.fillText(`~${wastePct}% waste`, sc.x, sc.y + lineHeight * line);
      }
    }
  }
}


/**
 * Draw frame tiles along polygon edges.
 * Frame is fixed to the polygon perimeter; not affected by slab pattern drag/rotate.
 * frameJointType: 'butt' = square ends, 'miter45' = 45° miter cut at corners.
 * Arc edges: blocks placed along curve with tangent orientation — joints widen naturally.
 */
export function drawSlabFrame(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  _zoom: number,
  allShapes?: Shape[]
): void {
  const inputs = shape.calculatorInputs;
  const rows = getFrameBorderRowsFromInputs(inputs);
  if (rows.length === 0) return;

  const { points: outlinePts, edgeIndices } = getPolygonWithEdgeIndicesForSlab(shape);
  if (outlinePts.length < 3 || !shape.closed) return;

  const groutMm = Number(inputs?.vizGroutWidthMm ?? (inputs?.vizGroutWidth != null ? Number(inputs.vizGroutWidth) * 10 : 5));
  const groutPx = toPixels(groutMm / 1000);

  const frameSidesEnabled = inputs?.frameSidesEnabled as boolean[] | undefined;
  const frameLinkedEdges = inputs?.frameLinkedEdges as { myEdgeIdx: number }[] | undefined;
  const linkedNaturalEdges = new Set(Array.isArray(frameLinkedEdges) ? frameLinkedEdges.map(l => l.myEdgeIdx) : []);
  const origPts = shape.points;
  const nOrig = isPathElement(shape) ? getPathPolygon(shape).length : origPts.length;
  const edgeArcs = shape.edgeArcs;
  const isPath = isPathElement(shape);

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(worldToScreen(outlinePts[0].x, outlinePts[0].y).x, worldToScreen(outlinePts[0].x, outlinePts[0].y).y);
  for (let i = 1; i < outlinePts.length; i++) {
    const s = worldToScreen(outlinePts[i].x, outlinePts[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.clip();

  let cumulativePts = outlinePts;
  const rowJunctionStates: { pts: Point[]; innerPts: Point[] | null; miter: boolean; pieceWidthPx: number; n: number }[] = [];

  const frameOnLogicalEdge = (logicalIdx: number): boolean =>
    !Array.isArray(frameSidesEnabled) || frameSidesEnabled[logicalIdx] !== false;
  const frameOrLinked = (logicalIdx: number): boolean =>
    frameOnLogicalEdge(logicalIdx) || linkedNaturalEdges.has((logicalIdx - 1 + nOrig) % nOrig);

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const framePieceWidthCm = row.widthCm;
    const framePieceLengthCm = row.lengthCm;
    const pieceLengthPx = toPixels(framePieceLengthCm / 100);
    const pieceWidthPx = toPixels(framePieceWidthCm / 100);
    if (pieceWidthPx <= 0) continue;
    const stepLengthPx = pieceLengthPx + groutPx;
    const miter = row.jointType === "miter45";

    const pts = cumulativePts;
    const innerPts = miter ? shrinkPolygon(pts, pieceWidthPx) : null;

    const signedArea = pts.reduce((acc, p, idx) => {
      const q = pts[(idx + 1) % pts.length];
      return acc + p.x * q.y - q.x * p.y;
    }, 0) / 2;
    const perpSign = signedArea > 0 ? 1 : -1;

    const n = pts.length;
    const arcEdgeDrawn = new Set<number>();
    const skipArcs = rowIdx > 0;

  // Check if a junction vertex is straight-through (other shape also non-collinear
  // → both frames continue in same direction → no miter needed).
  const isJunctionStraightThrough = (vtxIdx: number): boolean => {
    if (!allShapes || !Array.isArray(frameLinkedEdges)) return false;
    const vtxPos = pts[vtxIdx];
    const typedLinks = frameLinkedEdges as { myEdgeIdx: number; otherShapeIdx: number; otherEdgeIdx: number }[];
    for (const link of typedLinks) {
      const otherShape = allShapes[link.otherShapeIdx];
      if (!otherShape) continue;
      const otherPts = getPolygonWithEdgeIndicesForSlab(otherShape).points;
      if (otherPts.length < 3) continue;
      const TOL_SQ = 1;
      for (let oi = 0; oi < otherPts.length; oi++) {
        const ddx = otherPts[oi].x - vtxPos.x;
        const ddy = otherPts[oi].y - vtxPos.y;
        if (ddx * ddx + ddy * ddy < TOL_SQ) {
          if (vertexAllowsFrameMiterCorner(otherPts, oi, otherPts.length)) {
            return true;
          }
          break;
        }
      }
    }
    return false;
  };

  for (let i = 0; i < n; i++) {
    const edgeIdx = edgeIndices[(i + 1) % n];
    if (Array.isArray(frameSidesEnabled) && frameSidesEnabled[edgeIdx] === false) continue;

    const arcs = !isPath && edgeArcs?.[edgeIdx];
    const hasArc = arcs && arcs.length > 0;

    if (hasArc && !skipArcs && !arcEdgeDrawn.has(edgeIdx) && edgeIdx < nOrig) {
      arcEdgeDrawn.add(edgeIdx);
      const A = origPts[edgeIdx];
      const B = origPts[(edgeIdx + 1) % nOrig];
      if (!A || !B) continue;

      const blocks = sampleArcEdgeForFrame(A, B, arcs, stepLengthPx, pieceLengthPx);
      const halfLen = pieceLengthPx / 2;

      for (const { pos, tangent } of blocks) {
        const perp = { x: perpSign * (-tangent.y), y: perpSign * tangent.x };
        const p0 = { x: pos.x - halfLen * tangent.x, y: pos.y - halfLen * tangent.y };
        const p1 = { x: pos.x + halfLen * tangent.x, y: pos.y + halfLen * tangent.y };
        const corners: Point[] = [
          p0,
          p1,
          { x: p1.x + perp.x * pieceWidthPx, y: p1.y + perp.y * pieceWidthPx },
          { x: p0.x + perp.x * pieceWidthPx, y: p0.y + perp.y * pieceWidthPx },
        ];
        const s0 = worldToScreen(corners[0].x, corners[0].y);
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        for (let c = 1; c < 4; c++) {
          const sc = worldToScreen(corners[c].x, corners[c].y);
          ctx.lineTo(sc.x, sc.y);
        }
        ctx.closePath();
        ctx.fillStyle = FRAME_COLOR;
        ctx.fill();
        ctx.strokeStyle = GROUT_COLOR;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      continue;
    }

    if (hasArc) continue;

    const j = (i + 1) % n;
    const a = pts[i];
    const b = pts[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const inward = perpSign;
    const inx = nx * inward;
    const iny = ny * inward;

    const edgeLenPx = len;
    const numPieces = Math.ceil((edgeLenPx + groutPx) / stepLengthPx);

    const useMiterAtA = !!(
      miter &&
      innerPts &&
      innerPts.length === n &&
      vertexAllowsFrameMiterCorner(pts, i, n) &&
      frameOnLogicalEdge(edgeIndices[i]) &&
      frameOnLogicalEdge(edgeIndices[j])
    );
    const useMiterAtB = !!(
      miter &&
      innerPts &&
      innerPts.length === n &&
      vertexAllowsFrameMiterCorner(pts, j, n) &&
      frameOnLogicalEdge(edgeIndices[j]) &&
      frameOnLogicalEdge(edgeIndices[(j + 1) % n])
    );

    const juncAtA = miter && !frameOnLogicalEdge(edgeIndices[i]) && frameOrLinked(edgeIndices[i])
      && vertexAllowsFrameMiterCorner(pts, i, n) && !isJunctionStraightThrough(i);
    const juncAtB = miter && !frameOnLogicalEdge(edgeIndices[(j + 1) % n]) && frameOrLinked(edgeIndices[(j + 1) % n])
      && vertexAllowsFrameMiterCorner(pts, j, n) && !isJunctionStraightThrough(j);

    if (miter && innerPts && innerPts.length === n) {
      const perpInner = (p: Point) => ({ x: p.x + inx * pieceWidthPx, y: p.y + iny * pieceWidthPx });
      const innerAtA = useMiterAtA ? innerPts[i]! : perpInner(a);
      const innerAtB = useMiterAtB ? innerPts[j]! : perpInner(b);
      for (let k = 0; k < numPieces; k++) {
        const t0 = (k * stepLengthPx) / edgeLenPx;
        const t1 = Math.min(1, (k * stepLengthPx + pieceLengthPx) / edgeLenPx);
        const p0 = { x: a.x + t0 * dx, y: a.y + t0 * dy };
        const p1 = { x: a.x + t1 * dx, y: a.y + t1 * dy };
        let corners: Point[];
        if (numPieces === 1) {
          corners = [a, b, innerAtB, innerAtA];
        } else if (k === 0) {
          corners = [a, p1, perpInner(p1), innerAtA];
        } else if (k === numPieces - 1) {
          corners = [p0, b, innerAtB, perpInner(p0)];
        } else {
          corners = [p0, p1, perpInner(p1), perpInner(p0)];
        }
        const sc = corners.map(c => worldToScreen(c.x, c.y));
        ctx.beginPath();
        ctx.moveTo(sc[0].x, sc[0].y);
        for (let c = 1; c < sc.length; c++) ctx.lineTo(sc[c].x, sc[c].y);
        ctx.closePath();
        ctx.fillStyle = FRAME_COLOR;
        ctx.fill();

        const skipLeft  = (k === 0 || numPieces === 1) && juncAtA;
        const skipRight = (k === numPieces - 1 || numPieces === 1) && juncAtB;
        if (skipLeft || skipRight) {
          ctx.beginPath();
          for (let e = 0; e < 4; e++) {
            if ((e === 3 && skipLeft) || (e === 1 && skipRight)) continue;
            const ne = (e + 1) % 4;
            ctx.moveTo(sc[e].x, sc[e].y);
            ctx.lineTo(sc[ne].x, sc[ne].y);
          }
          ctx.strokeStyle = GROUT_COLOR;
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.strokeStyle = GROUT_COLOR;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    } else {
      for (let k = 0; k < numPieces; k++) {
        const t0 = (k * stepLengthPx) / edgeLenPx;
        const t1 = Math.min(1, (k * stepLengthPx + pieceLengthPx) / edgeLenPx);
        const p0 = { x: a.x + t0 * dx, y: a.y + t0 * dy };
        const p1 = { x: a.x + t1 * dx, y: a.y + t1 * dy };
        const corners: Point[] = [
          p0,
          p1,
          { x: p1.x + inx * pieceWidthPx, y: p1.y + iny * pieceWidthPx },
          { x: p0.x + inx * pieceWidthPx, y: p0.y + iny * pieceWidthPx },
        ];
        const sc = corners.map(c => worldToScreen(c.x, c.y));
        ctx.beginPath();
        ctx.moveTo(sc[0].x, sc[0].y);
        for (let c = 1; c < 4; c++) ctx.lineTo(sc[c].x, sc[c].y);
        ctx.closePath();
        ctx.fillStyle = FRAME_COLOR;
        ctx.fill();

        const skipLeft  = (k === 0 || numPieces === 1) && juncAtA;
        const skipRight = (k === numPieces - 1 || numPieces === 1) && juncAtB;
        if (skipLeft || skipRight) {
          ctx.beginPath();
          for (let e = 0; e < 4; e++) {
            if ((e === 3 && skipLeft) || (e === 1 && skipRight)) continue;
            const ne = (e + 1) % 4;
            ctx.moveTo(sc[e].x, sc[e].y);
            ctx.lineTo(sc[ne].x, sc[ne].y);
          }
          ctx.strokeStyle = GROUT_COLOR;
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.strokeStyle = GROUT_COLOR;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

    rowJunctionStates.push({ pts, innerPts, miter, pieceWidthPx, n });
    cumulativePts = shrinkOneFrameLayerFromInputs(cumulativePts, edgeIndices, frameSidesEnabled, row.widthCm);
  }

  ctx.restore();

  // Junction miter fills — drawn OUTSIDE the clip region (per row)
  for (const st of rowJunctionStates) {
    const pts = st.pts;
    const innerPts = st.innerPts;
    const miter = st.miter;
    const pieceWidthPx = st.pieceWidthPx;
    const n = st.n;
    const signedArea = pts.reduce((acc, p, idx) => {
      const q = pts[(idx + 1) % pts.length];
      return acc + p.x * q.y - q.x * p.y;
    }, 0) / 2;
    const perpSign = signedArea > 0 ? 1 : -1;
    const isJunctionStraightThrough = (vtxIdx: number): boolean => {
      if (!allShapes || !Array.isArray(frameLinkedEdges)) return false;
      const vtxPos = pts[vtxIdx];
      const typedLinks = frameLinkedEdges as { myEdgeIdx: number; otherShapeIdx: number; otherEdgeIdx: number }[];
      for (const link of typedLinks) {
        const otherShape = allShapes[link.otherShapeIdx];
        if (!otherShape) continue;
        const otherPts = getPolygonWithEdgeIndicesForSlab(otherShape).points;
        if (otherPts.length < 3) continue;
        const TOL_SQ = 1;
        for (let oi = 0; oi < otherPts.length; oi++) {
          const ddx = otherPts[oi].x - vtxPos.x;
          const ddy = otherPts[oi].y - vtxPos.y;
          if (ddx * ddx + ddy * ddy < TOL_SQ) {
            if (vertexAllowsFrameMiterCorner(otherPts, oi, otherPts.length)) {
              return true;
            }
            break;
          }
        }
      }
      return false;
    };

    if (!miter || !innerPts || innerPts.length !== n) continue;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const curEdge = edgeIndices[j];
      if (!frameOnLogicalEdge(curEdge)) continue;

      const checkJunction = (vtxIdx: number, adjEdgeLogical: number, frameDir: {dx:number,dy:number}, adjDir: {dx:number,dy:number}) => {
        if (frameOnLogicalEdge(adjEdgeLogical)) return;
        if (!frameOrLinked(adjEdgeLogical)) return;
        if (!vertexAllowsFrameMiterCorner(pts, vtxIdx, n)) {
          const cross = frameDir.dx * adjDir.dy - frameDir.dy * adjDir.dx;
          if (Math.abs(cross) < 1e-6) return;
        }
        if (isJunctionStraightThrough(vtxIdx)) return;

        const v = pts[vtxIdx];
        const fLen = Math.sqrt(frameDir.dx * frameDir.dx + frameDir.dy * frameDir.dy) || 1;
        const fnx = -frameDir.dy / fLen, fny = frameDir.dx / fLen;
        const inFx = fnx * perpSign, inFy = fny * perpSign;

        const dLen = Math.sqrt(adjDir.dx * adjDir.dx + adjDir.dy * adjDir.dy) || 1;
        const dnx = -adjDir.dy / dLen, dny = adjDir.dx / dLen;
        const inDx = dnx * perpSign, inDy = dny * perpSign;

        const p1 = v;
        const p2 = { x: v.x + inFx * pieceWidthPx, y: v.y + inFy * pieceWidthPx };
        const p4 = { x: v.x - inDx * pieceWidthPx, y: v.y - inDy * pieceWidthPx };
        const p3 = { x: v.x + inFx * pieceWidthPx - inDx * pieceWidthPx,
                     y: v.y + inFy * pieceWidthPx - inDy * pieceWidthPx };

        const area = Math.abs((p2.x - p1.x) * (p4.y - p1.y) - (p4.x - p1.x) * (p2.y - p1.y));
        if (area < 1) return;


        const s1 = worldToScreen(p1.x, p1.y);
        const s2 = worldToScreen(p2.x, p2.y);
        const s3 = worldToScreen(p3.x, p3.y);
        const s4 = worldToScreen(p4.x, p4.y);

        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.lineTo(s3.x, s3.y);
        ctx.lineTo(s4.x, s4.y);
        ctx.closePath();
        ctx.fillStyle = FRAME_COLOR;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s3.x, s3.y);
        ctx.strokeStyle = GROUT_COLOR;
        ctx.lineWidth = 1;
        ctx.stroke();
      };

      const a = pts[i], b = pts[j];
      const frameDx = b.x - a.x, frameDy = b.y - a.y;

      const prevIdx = (i - 1 + n) % n;
      const prevEdge = edgeIndices[i];
      const prevPt = pts[prevIdx];
      checkJunction(i, prevEdge, { dx: frameDx, dy: frameDy }, { dx: a.x - prevPt.x, dy: a.y - prevPt.y });

      const nextIdx = (j + 1) % n;
      const nextEdge = edgeIndices[nextIdx];
      const nextPt = pts[nextIdx];
      checkJunction(j, nextEdge, { dx: frameDx, dy: frameDy }, { dx: nextPt.x - b.x, dy: nextPt.y - b.y });
    }
  }
}

export interface CutInfo {
  lengthCm: number;
}

/** Check if point p lies on segment (a,b) within tolerance. */
function pointOnSegment(p: Point, a: Point, b: Point, tol: number = 1e-6): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-20) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2 < tol * tol;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < -tol || t > 1 + tol) return false;
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return (p.x - proj.x) ** 2 + (p.y - proj.y) ** 2 < tol * tol * Math.max(lenSq, 1);
}

/** Check if point p is at a slab corner (within tolerance). */
function pointAtSlabCorner(p: Point, slabCorners: Point[], tol: number = 1e-4): boolean {
  for (const c of slabCorners) {
    if ((p.x - c.x) ** 2 + (p.y - c.y) ** 2 < tol * tol * 2) return true;
  }
  return false;
}

/**
 * Extract cut operations from demand polygon. Each continuous chain of polygon edges
 * (not slab edges) = 1 cut. Diagonal/curved cut = 1 cut; corner cut = 2 cuts.
 * When 2 chains share a boundary vertex that is NOT a block corner, it's a diagonal
 * (one cut split by geometry) — merge to 1.
 */
export function collectCutOperationsFromDemand(
  demandPolygon: Point[],
  slabCorners: Point[],
  _polygon: Point[]
): CutInfo[] {
  if (demandPolygon.length < 3) return [];
  const tol = 1e-4;
  const chains: { lengthCm: number; boundaryVertexIdx: number }[] = [];
  let chainLength = 0;
  const n = demandPolygon.length;

  for (let i = 0; i < n; i++) {
    const a = demandPolygon[i];
    const b = demandPolygon[(i + 1) % n];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    let onSlab = false;
    for (let e = 0; e < 4; e++) {
      const sa = slabCorners[e];
      const sb = slabCorners[(e + 1) % 4];
      if (pointOnSegment(mid, sa, sb, tol)) {
        onSlab = true;
        break;
      }
    }

    if (onSlab) {
      if (chainLength > 0) {
        chains.push({
          lengthCm: toMeters(Math.sqrt(chainLength)) * 100,
          boundaryVertexIdx: i,
        });
        chainLength = 0;
      }
    } else {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      chainLength += Math.sqrt(dx * dx + dy * dy);
      const bIsCorner = pointAtSlabCorner(b, slabCorners, tol);
      if (bIsCorner && chainLength > 0) {
        chains.push({
          lengthCm: toMeters(Math.sqrt(chainLength)) * 100,
          boundaryVertexIdx: (i + 1) % n,
        });
        chainLength = 0;
      }
    }
  }
  if (chainLength > 0) {
    chains.push({
      lengthCm: toMeters(Math.sqrt(chainLength)) * 100,
      boundaryVertexIdx: 0,
    });
  }

  const result: CutInfo[] = [];
  if (chains.length === 2) {
    const boundaryV = demandPolygon[chains[0].boundaryVertexIdx];
    const atBlockCorner = pointAtSlabCorner(boundaryV, slabCorners, tol);
    if (!atBlockCorner) {
      result.push({ lengthCm: chains[0].lengthCm + chains[1].lengthCm });
      return result;
    }
  }
  for (const ch of chains) result.push({ lengthCm: ch.lengthCm });
  return result;
}

/**
 * Line segment (a,b) parametric intersection with (p,q).
 * Returns t in [0,1] for point on (a,b), or null.
 */
function segmentIntersection(a: Point, b: Point, p: Point, q: Point): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dpx = q.x - p.x;
  const dpy = q.y - p.y;
  const denom = dx * dpy - dy * dpx;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((p.x - a.x) * dpy - (p.y - a.y) * dpx) / denom;
  if (t < 0 || t > 1) return null;
  const s = ((a.x - p.x) * dy - (a.y - p.y) * dx) / -denom;
  if (s < 0 || s > 1) return null;
  return t;
}

export interface SlabCutsResult {
  cuts: CutInfo[];
  cutSlabCount: number;
  fullSlabCount: number;
  wasteSatisfiedPositions: string[];
  wasteAreaCm2: number;
  reusedAreaCm2: number;
}

/**
 * Compute cut segments for slabs that intersect the polygon but are not fully inside.
 * Each cut slab can have 1-4 cut edges; corner slabs have 2.
 * Returns cuts (segments by length) and cutSlabCount (number of slabs to cut, for input display).
 */
function fitsWithRotation(waste: { w: number; l: number }, demand: { w: number; l: number }): boolean {
  return (waste.w >= demand.w && waste.l >= demand.l) || (waste.w >= demand.l && waste.l >= demand.w);
}

export function computeSlabCuts(shape: Shape, inputs: Record<string, any>): SlabCutsResult {
  const { points: effectivePts, edgeIndices } = getPolygonWithEdgeIndicesForSlab(shape);
  let pts = effectivePts;
  if (pts.length < 3 || !shape.closed) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };

  const frameSidesEnabled = inputs?.frameSidesEnabled as boolean[] | undefined;
  const frameRowWidthsCm = getFrameBorderRowsFromInputs(inputs).map((r) => r.widthCm).filter((w) => w > 0);
  if (frameRowWidthsCm.length > 0) {
    pts = applyFrameInsetShrinkPolygon(pts, edgeIndices, frameSidesEnabled, frameRowWidthsCm);
  }
  if (pts.length < 3) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };

  const frameWidthCm = getTotalFrameInsetWidthCm(inputs);

  const slabWidthCm = Number(inputs?.vizSlabWidth);
  const slabLengthCm = Number(inputs?.vizSlabLength);
  if (!slabWidthCm || !slabLengthCm) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };

  const groutMm = Number(inputs?.vizGroutWidthMm ?? (inputs?.vizGroutWidth != null ? Number(inputs.vizGroutWidth) * 10 : 5));
  const pattern = inputs?.vizPattern ?? "grid";
  const directionDeg = Number(inputs?.vizDirection ?? 0);
  const origPts = shape.points;
  const startCorner = Math.max(0, Math.min(origPts.length - 1, Math.floor(Number(inputs?.vizStartCorner ?? 0))));

  const slabWidthPx = toPixels(slabWidthCm / 100);
  const slabLengthPx = toPixels(slabLengthCm / 100);
  const groutPx = toPixels(groutMm / 1000);
  const offX = Number(inputs?.vizOriginOffsetX ?? 0);
  const offY = Number(inputs?.vizOriginOffsetY ?? 0);
  // When frame exists, align origin to inner edge (frame boundary)
  const originBase = frameWidthCm > 0 && !hasConcaveVertex(effectivePts) ? pts : shape.points;
  const cornerIdx = Math.max(0, Math.min(startCorner, originBase.length - 1));
  const cornerPt = originBase[cornerIdx];
  if (!cornerPt) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };
  const origin = { x: cornerPt.x + offX, y: cornerPt.y + offY };
  const angle = vizDirectionToPatternAngleRad(directionDeg);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dir = { x: cos, y: sin };
  const perp = { x: -sin, y: cos };
  const stepLength = slabLengthPx + groutPx;
  const stepWidth = slabWidthPx + groutPx;

  let maxAlongDir = 0;
  let maxAlongPerp = 0;
  for (const p of pts) {
    const dDir = Math.abs((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y);
    const dPerp = Math.abs((p.x - origin.x) * perp.x + (p.y - origin.y) * perp.y);
    if (dDir > maxAlongDir) maxAlongDir = dDir;
    if (dPerp > maxAlongPerp) maxAlongPerp = dPerp;
  }
  const extendC = Math.ceil(maxAlongDir / stepLength) + 2;
  const extendR = Math.ceil(maxAlongPerp / stepWidth) + 2;
  const EXTEND_CAP = 100; // Prevent O(extend²) freeze on very large polygons (e.g. after "Dosuń do krawędzi")
  const extend = Math.min(Math.max(extendC, extendR, 10), EXTEND_CAP);

  const cuts: CutInfo[] = [];
  let cutSlabCount = 0;
  let fullSlabCount = 0;
  const cutSlabData: {
    r: number; c: number;
    demandW: number; demandL: number;
    wasteW: number; wasteL: number;
    demandPolygon?: Point[]; wastePolygon?: Point[];
  }[] = [];

  const pushSlabCutFromCorners = (corners: Point[], cx: number, cy: number, keyR: number, keyC: number) => {
    if (rectFullyInsidePolygon(corners, pts)) {
      fullSlabCount++;
      return;
    }
    const intersects = rectIntersectsPolygon(corners, pts);
    if (!intersects) return;
    let cornersInside = 0;
    for (const corner of corners) if (pointInOrOnPolygon(corner, pts)) cornersInside++;
    const hasIntersectionArea = rectPolygonIntersectionArea(corners, pts) > 1e-20;
    if (cornersInside === 0 && !hasIntersectionArea && !intersects) return;

    cutSlabCount++;

    const slabOrigin = { x: cx, y: cy };
    const demandPolygon = rectPolygonIntersection(corners, pts);
    if (demandPolygon.length < 3) return;

    const slabCuts = collectCutOperationsFromDemand(demandPolygon, corners, pts);
    for (const c of slabCuts) cuts.push(c);

    const demandBbox = polygonBboxCm(demandPolygon, slabOrigin, dir, perp);
    const demandWCm = demandBbox.w;
    const demandLCm = demandBbox.l;
    if (demandLCm < 0.5 || demandWCm < 0.5) return;

    const wastePolygon = computeWastePolygon(corners, demandPolygon);
    let wasteW: number, wasteL: number;
    if (wastePolygon.length >= 3) {
      const wasteBbox = polygonBboxCm(wastePolygon, slabOrigin, dir, perp);
      wasteW = Math.min(wasteBbox.w, wasteBbox.l);
      wasteL = Math.max(wasteBbox.w, wasteBbox.l);
    } else {
      const wasteInLengthCm = slabLengthCm - demandLCm;
      const wasteInWidthCm = slabWidthCm - demandWCm;
      if (wasteInLengthCm * slabWidthCm >= wasteInWidthCm * slabLengthCm) {
        wasteW = Math.min(wasteInLengthCm, slabWidthCm);
        wasteL = Math.max(wasteInLengthCm, slabWidthCm);
      } else {
        wasteW = Math.min(slabLengthCm, wasteInWidthCm);
        wasteL = Math.max(slabLengthCm, wasteInWidthCm);
      }
    }

    const useExactPolygon = demandPolygon.length <= 5 && wastePolygon.length >= 3 && wastePolygon.length <= 8;

    cutSlabData.push({
      r: keyR,
      c: keyC,
      demandW: demandWCm,
      demandL: demandLCm,
      wasteW,
      wasteL,
      demandPolygon: useExactPolygon ? demandPolygon : undefined,
      wastePolygon: useExactPolygon ? wastePolygon : undefined,
    });
  };

  if (pattern === "herringbone") {
    const L = slabLengthPx;
    const W = slabWidthPx;
    const j = groutPx;
    const hb = herringbonePolygonIjIndexBounds(maxAlongDir, maxAlongPerp, L, W, j);
    for (let jj = hb.jMin; jj <= hb.jMax; jj++) {
      for (let ii = hb.iMin; ii <= hb.iMax; ii++) {
        const corners = herringbone45CornersAtCell(origin, dir, perp, L, W, j, ii, jj);
        pushSlabCutFromCorners(corners, corners[0].x, corners[0].y, ii, jj);
      }
    }
  } else {
    for (let r = -extend; r <= extend; r++) {
      for (let c = -extend; c <= extend; c++) {
        let offsetR = r;
        if (pattern === "brick" && c % 2 !== 0) offsetR = r + 0.5;
        else if (pattern === "onethird") offsetR = r + [0, 2 / 3, 1 / 3][((c % 3) + 3) % 3];
        const cx = origin.x + c * stepLength * dir.x + offsetR * stepWidth * perp.x;
        const cy = origin.y + c * stepLength * dir.y + offsetR * stepWidth * perp.y;
        const corners: Point[] = [
          { x: cx, y: cy },
          { x: cx + slabLengthPx * dir.x, y: cy + slabLengthPx * dir.y },
          { x: cx + slabLengthPx * dir.x + slabWidthPx * perp.x, y: cy + slabLengthPx * dir.y + slabWidthPx * perp.y },
          { x: cx + slabWidthPx * perp.x, y: cy + slabWidthPx * perp.y },
        ];
        pushSlabCutFromCorners(corners, cx, cy, r, c);
      }
    }
  }

  // Sequential matching: process cut slabs in order (r then c)
  // If a waste piece from pool fits the demand → reuse (green), no new waste generated
  // If no match → cut new slab, add its waste to pool
  const wasteSatisfiedPositions: string[] = [];
  let reusedAreaCm2 = 0;
  let wasteAreaCm2 = 0;
  const wastePool: { w: number; l: number; r: number; c: number; polygon?: Point[] }[] = [];

  const matchLog: { key: string; demandW: number; demandL: number; wasteW: number; wasteL: number; wasteFrom: string }[] = [];

  for (const item of cutSlabData) {
    const { r, c, demandW, demandL, wasteW, wasteL, demandPolygon, wastePolygon } = item;
    const key = `${r},${c}`;

    const matches = (w: { w: number; l: number; polygon?: Point[] }): boolean => {
      if (!fitsWithRotation(w, { w: demandW, l: demandL })) return false;
      if (demandPolygon && wastePolygon && w.polygon) {
        if (polygonFitsInPolygonWithRotation(demandPolygon, w.polygon)) return true;
      }
      return true;
    };

    const idx = wastePool.findIndex(w => matches(w));
    if (idx >= 0) {
      const used = wastePool[idx];
      matchLog.push({ key, demandW, demandL, wasteW: used.w, wasteL: used.l, wasteFrom: `${used.r},${used.c}` });
      wasteSatisfiedPositions.push(key);
      reusedAreaCm2 += demandW * demandL;
      wastePool.splice(idx, 1);
    } else {
      if (wasteW > 0.5 && wasteL > 0.5) {
        wastePool.push({ w: wasteW, l: wasteL, r, c, polygon: wastePolygon });
        wasteAreaCm2 += wasteW * wasteL;
      }
    }
  }

  return { cuts, cutSlabCount, fullSlabCount, wasteSatisfiedPositions, wasteAreaCm2, reusedAreaCm2 };
}

/**
 * Segment-based slab cuts for paths with pathCenterline.
 * Uses same layout as drawPathSlabPattern; waste keys are `${segIdx},${r},${c}`.
 */
export function computePathSlabCuts(shape: Shape, inputs: Record<string, any>): SlabCutsResult {
  const resolved = resolvePathPatternCenterlineAndSides(shape, inputs);
  if (!resolved) {
    return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };
  }
  const { pathCenterline, pathSegmentSides } = resolved;
  const outline = getPathSlabPatternClipOutline(shape, inputs);
  if (!outline) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };

  const frameWidthPx = toPixels(getTotalFrameInsetWidthCm(inputs) / 100);

  const pathWidthM = Number(inputs?.pathWidthM ?? 0.6) || 0.6;
  const pathFullPx = toPixels(pathWidthM);
  const nCl = pathCenterline.length;

  const slabWidthCm = Number(inputs?.vizSlabWidth);
  const slabLengthCm = Number(inputs?.vizSlabLength);
  if (!slabWidthCm || !slabLengthCm) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };

  const groutMm = Number(inputs?.vizGroutWidthMm ?? (inputs?.vizGroutWidth != null ? Number(inputs.vizGroutWidth) * 10 : 5));
  const slabOrientation = (inputs.slabOrientation as "along" | "across") || "along";
  const slabWidthPx = toPixels(slabWidthCm / 100);
  const slabLengthPx = toPixels(slabLengthCm / 100);
  const groutPx = toPixels(groutMm / 1000);
  const alongPx = slabOrientation === "along" ? slabWidthPx : slabLengthPx;
  const acrossPx = slabOrientation === "along" ? slabLengthPx : slabWidthPx;
  const stepLength = alongPx + groutPx;
  const stepWidth = acrossPx + groutPx;
  const pattern = inputs?.vizPattern ?? "grid";
  const rowCenterOffset = 0;
  const rawBySeg = inputs?.pathPatternLongOffsetMBySegment as number[] | undefined;
  const fallbackM = Number(inputs?.pathPatternLongOffsetM ?? 0) || 0;
  const getOffsetMForSegment = (segIdx: number): number =>
    Array.isArray(rawBySeg) && rawBySeg[segIdx] != null ? (Number(rawBySeg[segIdx]) || 0) : fallbackM;

  const slabAreaPx2 = slabWidthPx * slabLengthPx;

  const pathCuts: CutInfo[] = [];
  const cutSlabData: { segIdx: number; r: number; c: number; demandW: number; demandL: number; wasteW: number; wasteL: number; demandPolygon?: Point[]; wastePolygon?: Point[] }[] = [];
  let cutSlabCount = 0;
  let fullSlabCount = 0;
  const pathCornerType = (inputs?.pathCornerType as "butt" | "miter45") ?? ((inputs?.frameJointType as string) === "butt" ? "butt" : "miter45");
  const seenButtTileOrigins = pathCornerType === "butt" ? new Set<string>() : null;

  for (let segIdx = 0; segIdx < nCl - 1; segIdx++) {
    const A = pathCenterline[segIdx];
    const B = pathCenterline[segIdx + 1];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const dir = pathSegmentDirSnapped(dx, dy, len);
    const perp = { x: -dir.y, y: dir.x };
    const side = pathSegmentSides[segIdx];
    const sign = side === "left" ? 1 : -1;
    const oA = { x: A.x + sign * perp.x * pathFullPx, y: A.y + sign * perp.y * pathFullPx };
    const oB = { x: B.x + sign * perp.x * pathFullPx, y: B.y + sign * perp.y * pathFullPx };
    const quad: Point[] = [oA, oB, B, A];

    const JOINT_EXT = pathFullPx * 3;
    const END_EXT = frameWidthPx > 0 ? frameWidthPx + groutPx : 0;
    let rA = A, rOA = oA, rB = B, rOB = oB;
    if (segIdx > 0) {
      rA = { x: A.x - dir.x * JOINT_EXT, y: A.y - dir.y * JOINT_EXT };
      rOA = { x: rA.x + sign * perp.x * pathFullPx, y: rA.y + sign * perp.y * pathFullPx };
    } else if (END_EXT > 0) {
      rA = { x: A.x - dir.x * END_EXT, y: A.y - dir.y * END_EXT };
      rOA = { x: rA.x + sign * perp.x * pathFullPx, y: rA.y + sign * perp.y * pathFullPx };
    }
    if (segIdx < nCl - 2) {
      rB = { x: B.x + dir.x * JOINT_EXT, y: B.y + dir.y * JOINT_EXT };
      rOB = { x: rB.x + sign * perp.x * pathFullPx, y: rB.y + sign * perp.y * pathFullPx };
    } else if (END_EXT > 0) {
      rB = { x: B.x + dir.x * END_EXT, y: B.y + dir.y * END_EXT };
      rOB = { x: rB.x + sign * perp.x * pathFullPx, y: rB.y + sign * perp.y * pathFullPx };
    }
    const sideChangeAtB = segIdx < nCl - 2 && pathSegmentSides[segIdx + 1] !== side;
    const sideChangeAtA = segIdx > 0 && pathSegmentSides[segIdx - 1] !== side;
    let rA_base = rA;
    let rB_base = rB;
    if (sideChangeAtA) {
      rA_base = { x: rA.x - sign * perp.x * pathFullPx, y: rA.y - sign * perp.y * pathFullPx };
    }
    if (sideChangeAtB) {
      rB_base = { x: rB.x - sign * perp.x * pathFullPx, y: rB.y - sign * perp.y * pathFullPx };
    }
    const region: Point[] = [rOA, rOB, rB_base, rA_base];

    // For mitre cut: anchor grid at corner so grout lines align. Use corner vertex as origin.
    const cornerVertex = pathCornerType === "miter45" && segIdx < nCl - 2 ? B : A;
    const originBase = { x: cornerVertex.x + sign * perp.x * frameWidthPx, y: cornerVertex.y + sign * perp.y * frameWidthPx };
    const pathPatternLongOffsetPx = toPixels(getOffsetMForSegment(segIdx));
    const origin = { x: originBase.x + dir.x * pathPatternLongOffsetPx, y: originBase.y + dir.y * pathPatternLongOffsetPx };
    const insidePoint = { x: (A.x + B.x) / 2 + sign * perp.x * pathFullPx * 0.5, y: (A.y + B.y) / 2 + sign * perp.y * pathFullPx * 0.5 };

    const cornerClips: { edgeA: Point; edgeB: Point; keepLeft: boolean }[] = [];
    if (pathCornerType === "miter45") {
      if (segIdx > 0) {
        const prev = pathCenterline[segIdx - 1];
        const d1x = A.x - prev.x;
        const d1y = A.y - prev.y;
        const len1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
        const d1 = { x: d1x / len1, y: d1y / len1 };
        const lineDir = pathJointCornerClipLineDirMiter45(d1, dir);
        const edgeA = A;
        const edgeB = { x: A.x + lineDir.x, y: A.y + lineDir.y };
        cornerClips.push({ edgeA, edgeB, keepLeft: crossEdge(edgeA, edgeB, insidePoint) >= 0 });
      }
      if (segIdx < nCl - 2) {
        const next = pathCenterline[segIdx + 2];
        const d1x = B.x - A.x;
        const d1y = B.y - A.y;
        const d2x = next.x - B.x;
        const d2y = next.y - B.y;
        const len1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
        const len2 = Math.sqrt(d2x * d2x + d2y * d2y) || 1;
        const d1 = { x: d1x / len1, y: d1y / len1 };
        const d2 = { x: d2x / len2, y: d2y / len2 };
        const lineDir = pathJointCornerClipLineDirMiter45(d1, d2);
        const edgeA = B;
        const edgeB = { x: B.x + lineDir.x, y: B.y + lineDir.y };
        cornerClips.push({ edgeA, edgeB, keepLeft: crossEdge(edgeA, edgeB, insidePoint) >= 0 });
      }
    }

    const { cMin, cMax, rMin, rMax } = pathSegmentPatternIndexBounds(
      region,
      origin,
      dir,
      perp,
      stepLength,
      stepWidth,
      alongPx,
      acrossPx,
      pattern,
    );

    const processPathSlabCutTile = (corners: Point[], cx: number, cy: number, keyR: number, keyC: number) => {
      if (!rectIntersectsPolygon(corners, region)) return;
      let clipped = rectPolygonIntersection(corners, region);
      if (clipped.length < 3) return;
      for (const { edgeA, edgeB, keepLeft } of cornerClips) {
        clipped = clipPolygonByEdge(clipped, edgeA, edgeB, keepLeft);
        if (clipped.length < 3) break;
      }
      if (clipped.length < 3) return;
      const fullRectArea = Math.abs(polygonArea(corners));
      const clippedArea = Math.abs(polygonArea(clipped));

      const slabCenter = { x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2 };
      let buttOriginKey: string | undefined;
      if (pathCornerType === "butt") {
        if (!pointInOrOnPolygon(slabCenter, region)) return;
        buttOriginKey = `${Math.round(cx * 1000)}_${Math.round(cy * 1000)}`;
        if (seenButtTileOrigins!.has(buttOriginKey)) return;
      } else {
        if (!pointInOrOnPolygon(slabCenter, quad)) return;
      }

      const isCut = fullRectArea < 1e-20 || clippedArea < fullRectArea * 0.99;
      if (isCut && pathPatternIsDustFragment(clippedArea, slabAreaPx2, groutPx)) return;
      if (pathCornerType === "butt" && buttOriginKey) seenButtTileOrigins!.add(buttOriginKey);
      if (isCut) {
        cutSlabCount++;
      } else {
        fullSlabCount++;
        return;
      }

      const slabOrigin = { x: cx, y: cy };
      const demandPolygon = clipped;

      const slabCuts = collectCutOperationsFromDemand(demandPolygon, corners, outline);
      for (const cutOp of slabCuts) pathCuts.push(cutOp);
      const demandBbox = polygonBboxCm(demandPolygon, slabOrigin, dir, perp);
      const demandWCm = demandBbox.w;
      const demandLCm = demandBbox.l;
      if (demandLCm < 0.2 || demandWCm < 0.2) return;

      const wastePolygon = computeWastePolygon(corners, demandPolygon);
      let wasteW: number, wasteL: number;
      if (wastePolygon.length >= 3) {
        const wasteBbox = polygonBboxCm(wastePolygon, slabOrigin, dir, perp);
        wasteW = Math.min(wasteBbox.w, wasteBbox.l);
        wasteL = Math.max(wasteBbox.w, wasteBbox.l);
      } else {
        wasteW = Math.min(slabWidthCm - demandWCm, slabLengthCm - demandLCm);
        wasteL = Math.max(slabWidthCm - demandWCm, slabLengthCm - demandLCm);
      }
      const useExactPolygon = demandPolygon.length <= 5 && wastePolygon.length >= 3 && wastePolygon.length <= 8;
      cutSlabData.push({
        segIdx,
        r: keyR,
        c: keyC,
        demandW: demandWCm,
        demandL: demandLCm,
        wasteW,
        wasteL,
        demandPolygon: useExactPolygon ? demandPolygon : undefined,
        wastePolygon: useExactPolygon ? wastePolygon : undefined,
      });
    };

    if (pattern === "herringbone") {
      const L = alongPx;
      const W = acrossPx;
      const j = groutPx;
      const hb = pathSegmentHerringboneIjBounds(region, origin, dir, perp, L, W, j);
      for (let jj = hb.jMin; jj <= hb.jMax; jj++) {
        for (let ii = hb.iMin; ii <= hb.iMax; ii++) {
          const corners = herringbone45CornersAtCell(origin, dir, perp, L, W, j, ii, jj);
          processPathSlabCutTile(corners, corners[0].x, corners[0].y, jj, ii);
        }
      }
    } else {
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          const offsetR = r + rowCenterOffset;
          let offsetC = 0;
          if (pattern === "brick" && r % 2 !== 0) offsetC = 0.5;
          else if (pattern === "onethird") offsetC = [0, 1 / 3, 2 / 3][((r % 3) + 3) % 3];
          const cx = origin.x + (c + offsetC) * stepLength * dir.x + offsetR * stepWidth * perp.x;
          const cy = origin.y + (c + offsetC) * stepLength * dir.y + offsetR * stepWidth * perp.y;
          const corners: Point[] = [
            { x: cx, y: cy },
            { x: cx + alongPx * dir.x, y: cy + alongPx * dir.y },
            { x: cx + alongPx * dir.x + acrossPx * perp.x, y: cy + alongPx * dir.y + acrossPx * perp.y },
            { x: cx + acrossPx * perp.x, y: cy + acrossPx * perp.y },
          ];
          processPathSlabCutTile(corners, cx, cy, r, c);
        }
      }
    }
  }

  const wasteSatisfiedPositions: string[] = [];
  let reusedAreaCm2 = 0;
  let wasteAreaCm2 = 0;
  const wastePool: { w: number; l: number; segIdx: number; r: number; c: number; polygon?: Point[] }[] = [];

  // Sort by demand area (smallest first) so waste from any segment can satisfy demand from any other segment
  cutSlabData.sort((a, b) => (a.demandW * a.demandL) - (b.demandW * b.demandL));

  for (const item of cutSlabData) {
    const { segIdx, r, c, demandW, demandL, wasteW, wasteL, demandPolygon, wastePolygon } = item;
    const key = `${segIdx},${r},${c}`;

    const matches = (w: { w: number; l: number; polygon?: Point[] }): boolean => {
      if (!fitsWithRotation(w, { w: demandW, l: demandL })) return false;
      if (demandPolygon && wastePolygon && w.polygon) {
        if (polygonFitsInPolygonWithRotation(demandPolygon, w.polygon)) return true;
      }
      return true;
    };

    const idx = wastePool.findIndex(w => matches(w));
    if (idx >= 0) {
      const used = wastePool[idx];
      wasteSatisfiedPositions.push(key);
      reusedAreaCm2 += demandW * demandL;
      wastePool.splice(idx, 1);
    } else {
      if (wasteW > 0.2 && wasteL > 0.2) {
        wastePool.push({ w: wasteW, l: wasteL, segIdx, r, c, polygon: wastePolygon });
        wasteAreaCm2 += wasteW * wasteL;
      }
    }
  }

  return { cuts: pathCuts, cutSlabCount, fullSlabCount, wasteSatisfiedPositions, wasteAreaCm2, reusedAreaCm2 };
}

const PATH_COBBLE_CUTS_CACHE_MAX_KEYS = 64;
const pathCobbleCutsCache = new Map<string, SlabCutsResult>();

function pathCobbleLodScreenSuffix(
  worldToScreen: WorldToScreen | undefined,
  pathCenterline: Point[],
  stepLength: number,
  stepWidth: number,
): string {
  if (!worldToScreen || pathCenterline.length < 2) return "|nolod";
  const A = pathCenterline[0];
  const B = pathCenterline[1];
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const dir = pathSegmentDirSnapped(dx, dy, len);
  const perp = { x: -dir.y, y: dir.x };
  const ref = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const base = worldToScreen(ref.x, ref.y);
  const pA = worldToScreen(ref.x + dir.x * stepLength, ref.y + dir.y * stepLength);
  const pW = worldToScreen(ref.x + perp.x * stepWidth, ref.y + perp.y * stepWidth);
  const pxA = Math.hypot(pA.x - base.x, pA.y - base.y);
  const pxW = Math.hypot(pW.x - base.x, pW.y - base.y);
  return `|lod:${pxA.toFixed(1)}_${pxW.toFixed(1)}`;
}

function buildPathCobbleCutsCacheKey(
  outline: Point[],
  pathCenterline: Point[],
  inputs: Record<string, any>,
  stepLength: number,
  stepWidth: number,
  worldToScreen?: WorldToScreen,
): string {
  const outlineSig = outline.map(p => `${p.x.toFixed(8)},${p.y.toFixed(8)}`).join(";");
  const pcSig = pathCenterline.map(p => `${p.x.toFixed(8)},${p.y.toFixed(8)}`).join(";");
  return [
    outlineSig,
    pcSig,
    String(inputs.pathSegmentSides ?? ""),
    String(inputs.blockWidthCm),
    String(inputs.blockLengthCm),
    String(inputs.jointGapMm),
    String(inputs.slabOrientation),
    String(inputs.pathWidthM),
    String(inputs.pathCornerType ?? ""),
    String(inputs.frameJointType ?? ""),
    String(getTotalFrameInsetWidthCm(inputs)),
    JSON.stringify(inputs.frameSidesEnabled),
    String(inputs.vizPattern ?? ""),
    String(inputs.pathPatternLongOffsetM ?? ""),
    JSON.stringify(inputs.pathPatternLongOffsetMBySegment),
    pathCobbleLodScreenSuffix(worldToScreen, pathCenterline, stepLength, stepWidth),
  ].join("\0");
}

/**
 * Segment-based monoblock cuts for paths — same layout as {@link drawPathCobblePattern}; keys `${segIdx},${r},${c}`.
 * Pass `worldToScreen` so iteration stride matches drawing (LOD + cell budget); omit for headless / approximate counts.
 */
export function computePathCobbleCuts(
  shape: Shape,
  inputs: Record<string, any>,
  worldToScreen?: WorldToScreen,
): SlabCutsResult {
  if (inputs?.monoblockLayoutMode === "mix") {
    return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };
  }
  const resolved = resolvePathPatternCenterlineAndSides(shape, inputs);
  if (!resolved) {
    return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };
  }
  const { pathCenterline, pathSegmentSides } = resolved;
  const outline = getPathSlabPatternClipOutline(shape, inputs);
  if (!outline) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };

  const blockWidthCm = Number(inputs?.blockWidthCm);
  const blockLengthCm = Number(inputs?.blockLengthCm);
  if (!blockWidthCm || !blockLengthCm) {
    return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };
  }

  const frameWidthPx = toPixels(getTotalFrameInsetWidthCm(inputs) / 100);

  const pathWidthM = Number(inputs?.pathWidthM ?? 0.6) || 0.6;
  const pathFullPx = toPixels(pathWidthM);
  const nCl = pathCenterline.length;

  const jointGapMm = Number(inputs?.jointGapMm ?? 1);
  const slabOrientation = (inputs.slabOrientation as "along" | "across") || "along";
  const blockWidthPx = toPixels(blockWidthCm / 100);
  const blockLengthPx = toPixels(blockLengthCm / 100);
  const jointPx = toPixels(jointGapMm / 1000);
  const alongPx = slabOrientation === "along" ? blockLengthPx : blockWidthPx;
  const acrossPx = slabOrientation === "along" ? blockWidthPx : blockLengthPx;
  const stepLength = alongPx + jointPx;
  const stepWidth = acrossPx + jointPx;
  const pattern = inputs?.vizPattern ?? "grid";
  const rowCenterOffset = 0;
  const rawBySeg = inputs?.pathPatternLongOffsetMBySegment as number[] | undefined;
  const fallbackM = Number(inputs?.pathPatternLongOffsetM ?? 0) || 0;
  const getOffsetMForSegment = (segIdx: number): number =>
    Array.isArray(rawBySeg) && rawBySeg[segIdx] != null ? (Number(rawBySeg[segIdx]) || 0) : fallbackM;

  const cutsCacheKey = buildPathCobbleCutsCacheKey(outline, pathCenterline, inputs, stepLength, stepWidth, worldToScreen);
  const cutsCached = pathCobbleCutsCache.get(cutsCacheKey);
  if (cutsCached) return cutsCached;

  const pathCuts: CutInfo[] = [];
  const cutSlabData: { segIdx: number; r: number; c: number; demandW: number; demandL: number; wasteW: number; wasteL: number; demandPolygon?: Point[]; wastePolygon?: Point[] }[] = [];
  let cutSlabCount = 0;
  let fullSlabCount = 0;
  const pathCornerType = (inputs?.pathCornerType as "butt" | "miter45") ?? ((inputs?.frameJointType as string) === "butt" ? "butt" : "miter45");
  const seenButtTileOrigins = pathCornerType === "butt" ? new Set<string>() : null;

  for (let segIdx = 0; segIdx < nCl - 1; segIdx++) {
    const A = pathCenterline[segIdx];
    const B = pathCenterline[segIdx + 1];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const dir = pathSegmentDirSnapped(dx, dy, len);
    const perp = { x: -dir.y, y: dir.x };
    const side = pathSegmentSides[segIdx];
    const sign = side === "left" ? 1 : -1;
    const oA = { x: A.x + sign * perp.x * pathFullPx, y: A.y + sign * perp.y * pathFullPx };
    const oB = { x: B.x + sign * perp.x * pathFullPx, y: B.y + sign * perp.y * pathFullPx };
    const quad: Point[] = [oA, oB, B, A];

    const JOINT_EXT = pathFullPx * 3;
    const END_EXT = frameWidthPx > 0 ? frameWidthPx + jointPx : 0;
    let rA = A, rOA = oA, rB = B, rOB = oB;
    if (segIdx > 0) {
      rA = { x: A.x - dir.x * JOINT_EXT, y: A.y - dir.y * JOINT_EXT };
      rOA = { x: rA.x + sign * perp.x * pathFullPx, y: rA.y + sign * perp.y * pathFullPx };
    } else if (END_EXT > 0) {
      rA = { x: A.x - dir.x * END_EXT, y: A.y - dir.y * END_EXT };
      rOA = { x: rA.x + sign * perp.x * pathFullPx, y: rA.y + sign * perp.y * pathFullPx };
    }
    if (segIdx < nCl - 2) {
      rB = { x: B.x + dir.x * JOINT_EXT, y: B.y + dir.y * JOINT_EXT };
      rOB = { x: rB.x + sign * perp.x * pathFullPx, y: rB.y + sign * perp.y * pathFullPx };
    } else if (END_EXT > 0) {
      rB = { x: B.x + dir.x * END_EXT, y: B.y + dir.y * END_EXT };
      rOB = { x: rB.x + sign * perp.x * pathFullPx, y: rB.y + sign * perp.y * pathFullPx };
    }
    const sideChangeAtB = segIdx < nCl - 2 && pathSegmentSides[segIdx + 1] !== side;
    const sideChangeAtA = segIdx > 0 && pathSegmentSides[segIdx - 1] !== side;
    let rA_base = rA;
    let rB_base = rB;
    if (sideChangeAtA) {
      rA_base = { x: rA.x - sign * perp.x * pathFullPx, y: rA.y - sign * perp.y * pathFullPx };
    }
    if (sideChangeAtB) {
      rB_base = { x: rB.x - sign * perp.x * pathFullPx, y: rB.y - sign * perp.y * pathFullPx };
    }
    const region: Point[] = [rOA, rOB, rB_base, rA_base];

    const cornerVertex = pathCornerType === "miter45" && segIdx < nCl - 2 ? B : A;
    const originBase = { x: cornerVertex.x + sign * perp.x * frameWidthPx, y: cornerVertex.y + sign * perp.y * frameWidthPx };
    const pathPatternLongOffsetPx = toPixels(getOffsetMForSegment(segIdx));
    const origin = { x: originBase.x + dir.x * pathPatternLongOffsetPx, y: originBase.y + dir.y * pathPatternLongOffsetPx };
    const insidePoint = { x: (A.x + B.x) / 2 + sign * perp.x * pathFullPx * 0.5, y: (A.y + B.y) / 2 + sign * perp.y * pathFullPx * 0.5 };

    const cornerClips: { edgeA: Point; edgeB: Point; keepLeft: boolean }[] = [];
    if (pathCornerType === "miter45") {
      if (segIdx > 0) {
        const prev = pathCenterline[segIdx - 1];
        const d1x = A.x - prev.x;
        const d1y = A.y - prev.y;
        const len1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
        const d1 = { x: d1x / len1, y: d1y / len1 };
        const lineDir = pathJointCornerClipLineDirMiter45(d1, dir);
        const edgeA = A;
        const edgeB = { x: A.x + lineDir.x, y: A.y + lineDir.y };
        cornerClips.push({ edgeA, edgeB, keepLeft: crossEdge(edgeA, edgeB, insidePoint) >= 0 });
      }
      if (segIdx < nCl - 2) {
        const next = pathCenterline[segIdx + 2];
        const d1x = B.x - A.x;
        const d1y = B.y - A.y;
        const d2x = next.x - B.x;
        const d2y = next.y - B.y;
        const len1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
        const len2 = Math.sqrt(d2x * d2x + d2y * d2y) || 1;
        const d1 = { x: d1x / len1, y: d1y / len1 };
        const d2 = { x: d2x / len2, y: d2y / len2 };
        const lineDir = pathJointCornerClipLineDirMiter45(d1, d2);
        const edgeA = B;
        const edgeB = { x: B.x + lineDir.x, y: B.y + lineDir.y };
        cornerClips.push({ edgeA, edgeB, keepLeft: crossEdge(edgeA, edgeB, insidePoint) >= 0 });
      }
    }

    const { cMin, cMax, rMin, rMax } = pathSegmentPatternIndexBounds(
      region,
      origin,
      dir,
      perp,
      stepLength,
      stepWidth,
      alongPx,
      acrossPx,
      pattern,
    );

    const processPathCobbleCutTile = (corners: Point[], cx: number, cy: number, keyR: number, keyC: number) => {
      const clipped = pathCobbleClipRectToSegment(corners, region, cornerClips);
      if (!clipped) return;
      const fullRectArea = Math.abs(polygonArea(corners));
      const clippedArea = Math.abs(polygonArea(clipped));

      const blockCenter = { x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2 };
      let buttOriginKey: string | undefined;
      if (pathCornerType === "butt") {
        if (!pointInOrOnPolygon(blockCenter, region)) return;
        buttOriginKey = `${Math.round(cx * 1000)}_${Math.round(cy * 1000)}`;
        if (seenButtTileOrigins!.has(buttOriginKey)) return;
      } else {
        if (!pointInOrOnPolygon(blockCenter, quad)) return;
      }

      const isCut = fullRectArea < 1e-20 || clippedArea < fullRectArea * 0.99;
      if (isCut && pathPatternIsDustFragment(clippedArea, blockWidthPx * blockLengthPx, jointPx)) return;
      if (pathCornerType === "butt" && buttOriginKey) seenButtTileOrigins!.add(buttOriginKey);
      if (isCut) {
        cutSlabCount++;
      } else {
        fullSlabCount++;
        return;
      }

      const blockOrigin = { x: cx, y: cy };
      const demandPolygon = clipped;

      const blockCuts = collectCutOperationsFromDemand(demandPolygon, corners, outline);
      for (const cc of blockCuts) pathCuts.push(cc);
      const demandBbox = polygonBboxCm(demandPolygon, blockOrigin, dir, perp);
      const demandWCm = demandBbox.w;
      const demandLCm = demandBbox.l;
      if (demandLCm < 0.2 || demandWCm < 0.2) return;

      const wastePolygon = computeWastePolygon(corners, demandPolygon);
      let wasteW: number, wasteL: number;
      if (wastePolygon.length >= 3) {
        const wasteBbox = polygonBboxCm(wastePolygon, blockOrigin, dir, perp);
        wasteW = Math.min(wasteBbox.w, wasteBbox.l);
        wasteL = Math.max(wasteBbox.w, wasteBbox.l);
      } else {
        wasteW = Math.min(blockWidthCm - demandWCm, blockLengthCm - demandLCm);
        wasteL = Math.max(blockWidthCm - demandWCm, blockLengthCm - demandLCm);
      }
      const useExactPolygon = demandPolygon.length <= 5 && wastePolygon.length >= 3 && wastePolygon.length <= 8;
      cutSlabData.push({
        segIdx,
        r: keyR,
        c: keyC,
        demandW: demandWCm,
        demandL: demandLCm,
        wasteW,
        wasteL,
        demandPolygon: useExactPolygon ? demandPolygon : undefined,
        wastePolygon: useExactPolygon ? wastePolygon : undefined,
      });
    };

    if (pattern === "herringbone") {
      const L = alongPx;
      const W = acrossPx;
      const j = jointPx;
      const hb = pathSegmentHerringboneIjBounds(region, origin, dir, perp, L, W, j);
      for (let jj = hb.jMin; jj <= hb.jMax; jj++) {
        for (let ii = hb.iMin; ii <= hb.iMax; ii++) {
          const corners = herringbone45CornersAtCell(origin, dir, perp, L, W, j, ii, jj);
          processPathCobbleCutTile(corners, corners[0].x, corners[0].y, jj, ii);
        }
      }
    } else {
      const midSeg: Point = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
      const { strideC, strideR } = worldToScreen
        ? pathCobbleGridStride(worldToScreen, midSeg, dir, perp, stepLength, stepWidth, cMin, cMax, rMin, rMax)
        : pathCobbleApplyMaxCellBudget(1, 1, cMin, cMax, rMin, rMax);

      for (let r = rMin; r <= rMax; r += strideR) {
        for (let c = cMin; c <= cMax; c += strideC) {
          const offsetR = r + rowCenterOffset;
          let offsetC = 0;
          if (pattern === "brick" && r % 2 !== 0) offsetC = 0.5;
          else if (pattern === "onethird") offsetC = [0, 1 / 3, 2 / 3][((r % 3) + 3) % 3];
          const cx = origin.x + (c + offsetC) * stepLength * dir.x + offsetR * stepWidth * perp.x;
          const cy = origin.y + (c + offsetC) * stepLength * dir.y + offsetR * stepWidth * perp.y;
          const corners: Point[] = [
            { x: cx, y: cy },
            { x: cx + alongPx * dir.x, y: cy + alongPx * dir.y },
            { x: cx + alongPx * dir.x + acrossPx * perp.x, y: cy + alongPx * dir.y + acrossPx * perp.y },
            { x: cx + acrossPx * perp.x, y: cy + acrossPx * perp.y },
          ];
          processPathCobbleCutTile(corners, cx, cy, r, c);
        }
      }
    }
  }

  const wasteSatisfiedPositions: string[] = [];
  let reusedAreaCm2 = 0;
  let wasteAreaCm2 = 0;
  const wastePool: { w: number; l: number; segIdx: number; r: number; c: number; polygon?: Point[] }[] = [];

  cutSlabData.sort((a, b) => (a.demandW * a.demandL) - (b.demandW * b.demandL));

  for (const item of cutSlabData) {
    const { segIdx, r, c, demandW, demandL, wasteW, wasteL, demandPolygon, wastePolygon } = item;
    const key = `${segIdx},${r},${c}`;

    const matches = (w: { w: number; l: number; polygon?: Point[] }): boolean => {
      if (!fitsWithRotation(w, { w: demandW, l: demandL })) return false;
      if (demandPolygon && wastePolygon && w.polygon) {
        if (polygonFitsInPolygonWithRotation(demandPolygon, w.polygon)) return true;
      }
      return true;
    };

    const idx = wastePool.findIndex(w => matches(w));
    if (idx >= 0) {
      wasteSatisfiedPositions.push(key);
      reusedAreaCm2 += demandW * demandL;
      wastePool.splice(idx, 1);
    } else {
      if (wasteW > 0.2 && wasteL > 0.2) {
        wastePool.push({ w: wasteW, l: wasteL, segIdx, r, c, polygon: wastePolygon });
        wasteAreaCm2 += wasteW * wasteL;
      }
    }
  }

  const cutsResult: SlabCutsResult = {
    cuts: pathCuts,
    cutSlabCount,
    fullSlabCount,
    wasteSatisfiedPositions,
    wasteAreaCm2,
    reusedAreaCm2,
  };
  if (pathCobbleCutsCache.size >= PATH_COBBLE_CUTS_CACHE_MAX_KEYS) pathCobbleCutsCache.clear();
  pathCobbleCutsCache.set(cutsCacheKey, cutsResult);
  return cutsResult;
}

/** Logical edge i = segment from vertex i to (i+1) % n. False when edge is curved (arc). */
export function isLogicalEdgeStraight(shape: Shape, edgeIdx: number): boolean {
  const n = shape.points.length;
  if (edgeIdx < 0 || edgeIdx >= n) return false;
  const arcs = shape.edgeArcs?.[edgeIdx];
  return !arcs || arcs.length === 0;
}

export type PatternAlignMaterialKind = "slab" | "paving" | "concreteSlab";

/** Long slab axis along the edge vs across it (+90°). */
export type PatternEdgeAlignMode = "parallel" | "perpendicular";

/**
 * Align slab / paving pattern to a straight boundary edge: long axis parallel or perpendicular to the edge,
 * inward stacking along the perpendicular (same handedness as drawSlabPattern).
 * Sets starting corner to the edge start vertex so the first slab column begins at that corner;
 * brick / one-third column offsets in drawSlabPattern apply from there.
 */
export function computePatternAlignToStraightEdge(
  shape: Shape,
  logicalEdgeIdx: number,
  inputs: Record<string, any>,
  kind: PatternAlignMaterialKind = "slab",
  alignMode: PatternEdgeAlignMode = "parallel"
): { vizDirection: number; vizOriginOffsetX: number; vizOriginOffsetY: number; vizStartCorner: number } | null {
  if (!shape.closed || shape.points.length < 3) return null;
  if (!isLogicalEdgeStraight(shape, logicalEdgeIdx)) return null;

  const origPts = shape.points;
  const n = origPts.length;
  const A = origPts[logicalEdgeIdx];
  const B = origPts[(logicalEdgeIdx + 1) % n];
  if (!A || !B) return null;
  const ex = B.x - A.x;
  const ey = B.y - A.y;
  const elen = Math.hypot(ex, ey);
  if (elen < 1e-9) return null;

  if (kind === "paving") {
    const blockWidthCm = Number(inputs?.blockWidthCm ?? 20);
    const blockLengthCm = Number(inputs?.blockLengthCm ?? 10);
    if (!blockWidthCm || !blockLengthCm) return null;
  } else {
    const slabWidthCm = Number(inputs?.vizSlabWidth);
    const slabLengthCm = Number(inputs?.vizSlabLength);
    if (!slabWidthCm || !slabLengthCm) return null;
  }

  let theta = Math.atan2(ey, ex);
  let perpX = -Math.sin(theta);
  let perpY = Math.cos(theta);

  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const centroid = polygonCentroidByArea(origPts);
  const toIn = { x: centroid.x - mid.x, y: centroid.y - mid.y };
  if (toIn.x * perpX + toIn.y * perpY < 0) {
    theta += Math.PI;
  }

  if (alignMode === "perpendicular") {
    theta += Math.PI / 2;
  }

  let vizDirection = (theta * 180) / Math.PI;
  vizDirection = ((vizDirection % 360) + 360) % 360;

  return {
    vizDirection,
    vizOriginOffsetX: 0,
    vizOriginOffsetY: 0,
    vizStartCorner: logicalEdgeIdx,
  };
}

/**
 * Polygon used for pattern offset snap (and green alignment guides): same inner outline as {@link computePatternSnap},
 * including path outline, effective polygon, and inward offset when a frame (ramka) is enabled.
 */
export function getPolygonForPatternSnapOutline(shape: Shape): Point[] | null {
  const origPts = shape.points;
  const inputs = shape.calculatorInputs;
  if (!origPts.length || !shape.closed || !inputs) return null;

  if (shape.calculatorType !== "paving") {
    const slabWidthCm = Number(inputs?.vizSlabWidth);
    const slabLengthCm = Number(inputs?.vizSlabLength);
    if (!slabWidthCm || !slabLengthCm) return null;
  }

  const effSnap = getPolygonWithEdgeIndicesForSlab(shape);
  let pts = effSnap.points;
  const edgeIndices = effSnap.edgeIndices;
  const frameSidesEnabled = inputs?.frameSidesEnabled as boolean[] | undefined;
  const rowWidthsCm = getFrameBorderRowsFromInputs(inputs).map((r) => r.widthCm).filter((w) => w > 0);
  const hasFrame =
    shape.calculatorType === "paving"
      ? !!(inputs?.addFrameToMonoblock && rowWidthsCm.length > 0)
      : rowWidthsCm.length > 0;
  if (hasFrame && pts.length >= 3) {
    const shrunk = applyFrameInsetShrinkPolygon(pts, edgeIndices, frameSidesEnabled, rowWidthsCm);
    if (shrunk.length >= 3) pts = shrunk;
  }
  if (pts.length < 3) pts = origPts;
  if (pts.length === 0) return null;
  return pts;
}

/**
 * Compute pattern snap: adjust offset so polygon edges align with pattern grid lines.
 * Returns snapped offset and indices of polygon edges that are aligned.
 * Works for both slab and cobblestone patterns (grid params derived from calculatorInputs).
 */
export function computePatternSnap(
  shape: Shape,
  offset: { x: number; y: number },
  threshold: number
): { snappedOffset: { x: number; y: number }; alignedEdges: number[] } {
  const origPts = shape.points;
  const inputs = shape.calculatorInputs;
  if (!origPts.length || !shape.closed || !inputs) {
    return { snappedOffset: offset, alignedEdges: [] };
  }

  let stepLength: number;
  let stepWidth: number;
  let directionDeg: number;
  let startCorner: number;

  if (shape.calculatorType === "paving") {
    const blockWidthCm = Number(inputs?.blockWidthCm ?? 20);
    const blockLengthCm = Number(inputs?.blockLengthCm ?? 10);
    const jointGapMm = Number(inputs?.jointGapMm ?? 1);
    const blockWidthPx = toPixels(blockWidthCm / 100);
    const blockLengthPx = toPixels(blockLengthCm / 100);
    const jointPx = toPixels(jointGapMm / 1000);
    stepLength = blockLengthPx + jointPx;
    stepWidth = blockWidthPx + jointPx;
    directionDeg = Number(inputs?.vizDirection ?? 0);
    startCorner = Math.max(0, Math.min(origPts.length - 1, Math.floor(Number(inputs?.vizStartCorner ?? 0))));
  } else {
    const slabWidthCm = Number(inputs?.vizSlabWidth);
    const slabLengthCm = Number(inputs?.vizSlabLength);
    if (!slabWidthCm || !slabLengthCm) return { snappedOffset: offset, alignedEdges: [] };
    const groutMm = Number(inputs?.vizGroutWidthMm ?? (inputs?.vizGroutWidth != null ? Number(inputs.vizGroutWidth) * 10 : 5));
    const slabWidthPx = toPixels(slabWidthCm / 100);
    const slabLengthPx = toPixels(slabLengthCm / 100);
    const groutPx = toPixels(groutMm / 1000);
    stepLength = slabLengthPx + groutPx;
    stepWidth = slabWidthPx + groutPx;
    directionDeg = Number(inputs?.vizDirection ?? 0);
    startCorner = Math.max(0, Math.min(origPts.length - 1, Math.floor(Number(inputs?.vizStartCorner ?? 0))));
  }

  const ptsMaybe = getPolygonForPatternSnapOutline(shape);
  if (!ptsMaybe?.length) return { snappedOffset: offset, alignedEdges: [] };
  const pts = ptsMaybe;

  const originPt = patternOriginOnOutline(origPts, pts, startCorner);
  if (!originPt) return { snappedOffset: offset, alignedEdges: [] };
  const origin = { x: originPt.x + offset.x, y: originPt.y + offset.y };
  const angle = vizDirectionToPatternAngleRad(directionDeg);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dir = { x: cos, y: sin };
  const perp = { x: -sin, y: cos };

  const modStep = (v: number, step: number) => ((v % step) + step) % step;

  let bestCorrectionDir = 0;
  let bestCorrectionPerp = 0;
  let bestDistDir = Infinity;
  let bestDistPerp = Infinity;

  for (let vi = 0; vi < pts.length; vi++) {
    const v = pts[vi];
    const projDir = (v.x - origin.x) * dir.x + (v.y - origin.y) * dir.y;
    const projPerp = (v.x - origin.x) * perp.x + (v.y - origin.y) * perp.y;

    const remDir = modStep(projDir, stepLength);
    const remPerp = modStep(projPerp, stepWidth);

    const distDir = Math.min(remDir, stepLength - remDir);
    const distPerp = Math.min(remPerp, stepWidth - remPerp);

    if (distDir < threshold && distDir < bestDistDir) {
      const snapDir = remDir < stepLength - remDir ? -remDir : stepLength - remDir;
      bestCorrectionDir = snapDir;
      bestDistDir = distDir;
    }
    if (distPerp < threshold && distPerp < bestDistPerp) {
      const snapPerp = remPerp < stepWidth - remPerp ? -remPerp : stepWidth - remPerp;
      bestCorrectionPerp = snapPerp;
      bestDistPerp = distPerp;
    }
  }

  // Dead zone: avoid micro-corrections that cause jitter when already close
  const DEAD_ZONE_PX = 2;
  if (Math.abs(bestCorrectionDir) < DEAD_ZONE_PX) bestCorrectionDir = 0;
  if (Math.abs(bestCorrectionPerp) < DEAD_ZONE_PX) bestCorrectionPerp = 0;

  const alignedVerticesFinal = new Set<number>();
  for (let vi = 0; vi < pts.length; vi++) {
    const v = pts[vi];
    const projDir = (v.x - origin.x) * dir.x + (v.y - origin.y) * dir.y;
    const projPerp = (v.x - origin.x) * perp.x + (v.y - origin.y) * perp.y;
    const remDir = modStep(projDir - bestCorrectionDir, stepLength);
    const remPerp = modStep(projPerp - bestCorrectionPerp, stepWidth);
    const distDir = Math.min(remDir, stepLength - remDir);
    const distPerp = Math.min(remPerp, stepWidth - remPerp);
    if (distDir < threshold || distPerp < threshold) alignedVerticesFinal.add(vi);
  }

  const snappedOffset = {
    x: offset.x + bestCorrectionDir * dir.x + bestCorrectionPerp * perp.x,
    y: offset.y + bestCorrectionDir * dir.y + bestCorrectionPerp * perp.y,
  };

  const alignedEdges: number[] = [];
  for (const vi of alignedVerticesFinal) {
    const prevEdge = (vi - 1 + pts.length) % pts.length;
    const nextEdge = vi;
    if (!alignedEdges.includes(prevEdge)) alignedEdges.push(prevEdge);
    if (!alignedEdges.includes(nextEdge)) alignedEdges.push(nextEdge);
  }
  alignedEdges.sort((a, b) => a - b);

  return { snappedOffset, alignedEdges };
}

const CUT_BUCKETS = [30, 60, 90, 120];

export function groupCutsByLength(
  cuts: CutInfo[],
  buckets: number[] = CUT_BUCKETS
): { lengthCm: number; count: number }[] {
  const groups: Record<number, number> = {};
  for (const b of buckets) groups[b] = 0;
  for (const c of cuts) {
    let best = buckets[0];
    let bestDiff = Math.abs(c.lengthCm - best);
    for (const b of buckets) {
      const d = Math.abs(c.lengthCm - b);
      if (d < bestDiff) {
        bestDiff = d;
        best = b;
      }
    }
    groups[best] = (groups[best] ?? 0) + 1;
  }
  return buckets.filter(b => (groups[b] ?? 0) > 0).map(b => ({ lengthCm: b, count: groups[b]! }));
}
