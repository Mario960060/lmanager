// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — adjustmentLogic.ts
// Layer 5 Adjustment: empty areas, overflow, overlaps
// ══════════════════════════════════════════════════════════════

import polygonClipping from "polygon-clipping";
import type { Polygon, MultiPolygon } from "polygon-clipping";
import { Point, Shape, centroid, distance, toPixels, shoelaceArea } from "./geometry";
import type { ArcPoint } from "./geometry";
import { getEffectivePolygon, fitQuadraticBezierControlToPoints } from "./arcMath";
import { getPathPolygon, getPolygonLinearOutline } from "./linearElements";

/** Surface elements: polygon or path shapes that cover area. */
const SURFACE_CALC_TYPES = ["slab", "concreteSlabs", "deck", "grass", "turf", "paving"] as const;
/** Linear polygon elements: wall, kerb, foundation (stored as polygon). */
const LINEAR_POLYGON_TYPES = ["wall", "kerb", "foundation"] as const;

function isSurfaceShape(shape: Shape): boolean {
  if (shape.elementType === "pathSlabs" || shape.elementType === "pathConcreteSlabs" || shape.elementType === "pathMonoblock") return true;
  return shape.elementType === "polygon" && SURFACE_CALC_TYPES.includes((shape.calculatorType ?? "") as any);
}

function isLinearPolygonShape(shape: Shape): boolean {
  return LINEAR_POLYGON_TYPES.includes(shape.elementType as any);
}

/** Get polygon for shape. Returns empty array if shape has no valid polygon. */
export function getShapePolygonForAdjustment(shape: Shape): Point[] {
  if (shape.elementType === "wall" || shape.elementType === "kerb" || shape.elementType === "foundation") {
    const outline = getPolygonLinearOutline(shape);
    if (outline.length >= 3) return outline;
  }
  if (shape.elementType === "pathSlabs" || shape.elementType === "pathConcreteSlabs" || shape.elementType === "pathMonoblock") {
    return getPathPolygon(shape);
  }
  const hasArcs = shape.closed && shape.edgeArcs?.some(a => a && a.length > 0);
  const pts = hasArcs ? getEffectivePolygon(shape) : shape.points;
  return pts;
}

/** Convert Point[] to GeoJSON Polygon format for polygon-clipping. */
function toGeoJSONPolygon(pts: Point[]): Polygon | null {
  if (pts.length < 3) return null;
  const ring: [number, number][] = pts.map(p => [p.x, p.y]);
  return [ring];
}

/** Convert GeoJSON MultiPolygon to Point[][] (each polygon as Point[]). */
function fromGeoJSONMulti(multi: MultiPolygon): Point[][] {
  const result: Point[][] = [];
  for (const poly of multi) {
    if (poly.length === 0) continue;
    const ring = poly[0];
    if (ring.length < 3) continue;
    result.push(ring.map(([x, y]) => ({ x, y })));
  }
  return result;
}

/** Areas in Layer 1 (garden) without coverage from Layer 2. */
export function computeEmptyAreas(shapes: Shape[]): Point[][] {
  const layer1 = shapes.filter(s => s.layer === 1 && s.closed && s.points.length >= 3);
  const layer2 = shapes.filter(s => s.layer === 2);
  if (layer1.length === 0) return [];

  const gardenPolys: Polygon[] = [];
  for (const s of layer1) {
    const pts = getShapePolygonForAdjustment(s);
    const poly = toGeoJSONPolygon(pts);
    if (poly) gardenPolys.push(poly);
  }
  if (gardenPolys.length === 0) return [];

  const layer2Polys: Polygon[] = [];
  for (const s of layer2) {
    const pts = getShapePolygonForAdjustment(s);
    if (pts.length < 3) continue;
    const poly = toGeoJSONPolygon(pts);
    if (poly) layer2Polys.push(poly);
  }

  let gardenUnion: MultiPolygon;
  if (gardenPolys.length === 1) {
    gardenUnion = [gardenPolys[0]];
  } else {
    try {
      gardenUnion = polygonClipping.union(gardenPolys[0], ...gardenPolys.slice(1));
    } catch {
      return [];
    }
  }

  if (layer2Polys.length === 0) {
    return fromGeoJSONMulti(gardenUnion);
  }

  let layer2Union: MultiPolygon;
  try {
    layer2Union = layer2Polys.length === 1 ? [layer2Polys[0]] : polygonClipping.union(layer2Polys[0], ...layer2Polys.slice(1));
  } catch {
    return fromGeoJSONMulti(gardenUnion);
  }

  try {
    const empty = polygonClipping.difference(gardenUnion, layer2Union);
    return fromGeoJSONMulti(empty);
  } catch {
    return [];
  }
}

export interface OverflowResult {
  shapeIdx: number;
  overflowPolygons: Point[][];
}

/** Parts of Layer 2 elements (except grass) that extend outside Layer 1. */
export function computeOverflowAreas(shapes: Shape[]): OverflowResult[] {
  const layer1 = shapes.filter(s => s.layer === 1 && s.closed && s.points.length >= 3);
  const layer2Indices = shapes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.layer === 2 && s.calculatorType !== "grass");

  if (layer1.length === 0) return [];

  const gardenPolys: Polygon[] = [];
  for (const s of layer1) {
    const pts = getShapePolygonForAdjustment(s);
    const poly = toGeoJSONPolygon(pts);
    if (poly) gardenPolys.push(poly);
  }
  if (gardenPolys.length === 0) return [];

  let gardenUnion: MultiPolygon;
  try {
    gardenUnion = gardenPolys.length === 1 ? [gardenPolys[0]] : polygonClipping.union(gardenPolys[0], ...gardenPolys.slice(1));
  } catch {
    return [];
  }

  const results: OverflowResult[] = [];
  for (const { s, i } of layer2Indices) {
    const pts = getShapePolygonForAdjustment(s);
    if (pts.length < 3) continue;
    const poly = toGeoJSONPolygon(pts);
    if (!poly) continue;
    try {
      const overflow = polygonClipping.difference([poly], gardenUnion);
      const polys = fromGeoJSONMulti(overflow);
      if (polys.length > 0) {
        results.push({ shapeIdx: i, overflowPolygons: polys });
      }
    } catch {
      // ignore
    }
  }
  return results;
}

export interface OverlapResult {
  shapeIdxA: number;
  shapeIdxB: number;
  overlapPolygon: Point[];
}

/** Overlaps: surface vs surface, and surface vs linear (wall/kerb/foundation). */
export function computeOverlaps(shapes: Shape[]): OverlapResult[] {
  const surfaceShapes: { shape: Shape; idx: number }[] = [];
  const linearShapes: { shape: Shape; idx: number }[] = [];
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    if (s.layer !== 2) continue;
    if (isSurfaceShape(s)) surfaceShapes.push({ shape: s, idx: i });
    if (isLinearPolygonShape(s)) linearShapes.push({ shape: s, idx: i });
  }

  const results: OverlapResult[] = [];

  // Surface vs surface
  for (let a = 0; a < surfaceShapes.length; a++) {
    for (let b = a + 1; b < surfaceShapes.length; b++) {
      const { shape: sa, idx: ia } = surfaceShapes[a];
      const { shape: sb, idx: ib } = surfaceShapes[b];
      const ptsA = getShapePolygonForAdjustment(sa);
      const ptsB = getShapePolygonForAdjustment(sb);
      if (ptsA.length < 3 || ptsB.length < 3) continue;
      const polyA = toGeoJSONPolygon(ptsA);
      const polyB = toGeoJSONPolygon(ptsB);
      if (!polyA || !polyB) continue;
      try {
        const inter = polygonClipping.intersection(polyA, polyB);
        const polys = fromGeoJSONMulti(inter);
        for (const p of polys) {
          if (p.length >= 3) results.push({ shapeIdxA: ia, shapeIdxB: ib, overlapPolygon: p });
        }
      } catch {
        // ignore
      }
    }
  }

  // Surface vs linear
  for (const { shape: sa, idx: ia } of surfaceShapes) {
    for (const { shape: sb, idx: ib } of linearShapes) {
      const ptsA = getShapePolygonForAdjustment(sa);
      const ptsB = getShapePolygonForAdjustment(sb);
      if (ptsA.length < 3 || ptsB.length < 3) continue;
      const polyA = toGeoJSONPolygon(ptsA);
      const polyB = toGeoJSONPolygon(ptsB);
      if (!polyA || !polyB) continue;
      try {
        const inter = polygonClipping.intersection(polyA, polyB);
        const polys = fromGeoJSONMulti(inter);
        for (const p of polys) {
          if (p.length >= 3) results.push({ shapeIdxA: ia, shapeIdxB: ib, overlapPolygon: p });
        }
      } catch {
        // ignore
      }
    }
  }

  return results;
}

/** Clip shape polygon to garden boundary. Returns new points or null. */
export function clipShapeToGarden(shapes: Shape[], shapeIdx: number): Point[] | null {
  const layer1 = shapes.filter(s => s.layer === 1 && s.closed && s.points.length >= 3);
  if (layer1.length === 0) return null;
  const shape = shapes[shapeIdx];
  if (!shape) return null;
  const shapePts = getShapePolygonForAdjustment(shape);
  if (shapePts.length < 3) return null;

  const gardenPolys: Polygon[] = [];
  for (const s of layer1) {
    const pts = getShapePolygonForAdjustment(s);
    const poly = toGeoJSONPolygon(pts);
    if (poly) gardenPolys.push(poly);
  }
  if (gardenPolys.length === 0) return null;

  let gardenUnion: MultiPolygon;
  try {
    gardenUnion = gardenPolys.length === 1 ? [gardenPolys[0]] : polygonClipping.union(gardenPolys[0], ...gardenPolys.slice(1));
  } catch {
    return null;
  }

  const poly = toGeoJSONPolygon(shapePts);
  if (!poly) return null;
  try {
    const clipped = polygonClipping.intersection([poly], gardenUnion);
    const polys = fromGeoJSONMulti(clipped);
    if (polys.length === 0) return null;
    return polys[0];
  } catch {
    return null;
  }
}

/** Remove overlap area from shape. Returns new points (single polygon) or null.
 *  When difference yields multiple polygons, picks the one containing shape centroid or largest area. */
export function removeOverlapFromShape(shapes: Shape[], shapeIdx: number, overlapPolygon: Point[]): Point[] | null {
  const shape = shapes[shapeIdx];
  if (!shape) return null;
  const shapePts = getShapePolygonForAdjustment(shape);
  if (shapePts.length < 3) return null;
  const overlapPoly = toGeoJSONPolygon(overlapPolygon);
  if (!overlapPoly) return null;

  const poly = toGeoJSONPolygon(shapePts);
  if (!poly) return null;
  try {
    const result = polygonClipping.difference([poly], overlapPoly);
    const polys = fromGeoJSONMulti(result);
    if (polys.length === 0) return null;
    if (polys.length === 1) return polys[0];
    const c = centroid(shapePts);
    for (const p of polys) {
      if (pointInPolygon(c, p)) return p;
    }
    let best = polys[0];
    let bestArea = 0;
    for (const p of polys) {
      const a = Math.abs(shoelaceArea(p));
      if (a > bestArea) {
        bestArea = a;
        best = p;
      }
    }
    return best;
  } catch {
    return null;
  }
}

/** Find Layer 2 elements that touch or are near the empty area (for "Wypełnij"). */
export function findTouchingElementsForEmptyArea(shapes: Shape[], emptyAreaPolygon: Point[]): number[] {
  const layer2 = shapes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.layer === 2 && s.calculatorType !== "grass");
  const emptyPoly = toGeoJSONPolygon(emptyAreaPolygon);
  if (!emptyPoly) return [];

  const touching: number[] = [];
  for (const { s, i } of layer2) {
    const pts = getShapePolygonForAdjustment(s);
    if (pts.length < 3) continue;
    const poly = toGeoJSONPolygon(pts);
    if (!poly) continue;
    try {
      const union = polygonClipping.union(poly, emptyPoly);
      if (union.length === 1) touching.push(i);
    } catch {
      // ignore
    }
  }
  return touching;
}

/** Clip surface shape to be outside linear (wall/kerb/foundation). Returns new points or null. */
export function clipSurfaceToOutsideLinear(shapes: Shape[], surfaceIdx: number, linearIdx: number): Point[] | null {
  const surface = shapes[surfaceIdx];
  const linear = shapes[linearIdx];
  if (!surface || !linear) return null;
  const surfacePts = getShapePolygonForAdjustment(surface);
  const linearPts = getShapePolygonForAdjustment(linear);
  if (surfacePts.length < 3 || linearPts.length < 3) return null;

  const surfacePoly = toGeoJSONPolygon(surfacePts);
  const linearPoly = toGeoJSONPolygon(linearPts);
  if (!surfacePoly || !linearPoly) return null;
  try {
    const result = polygonClipping.difference([surfacePoly], linearPoly);
    const polys = fromGeoJSONMulti(result);
    if (polys.length === 0) return null;
    if (polys.length === 1) return polys[0];
    const c = centroid(surfacePts);
    let best = polys[0];
    let bestArea = 0;
    for (const p of polys) {
      if (pointInPolygon(c, p)) return p;
      const a = p.reduce((sum, _, i) => sum + (p[i].x * (p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * p[i].y)), 0) / 2;
      if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); best = p; }
    }
    return best;
  } catch {
    return null;
  }
}

/** Find surface elements that overlap the given linear (wall/kerb/foundation). */
export function findSurfacesOverlappingLinear(shapes: Shape[], linearIdx: number): number[] {
  const linear = shapes[linearIdx];
  if (!linear) return [];
  const linearPts = getShapePolygonForAdjustment(linear);
  if (linearPts.length < 3) return [];
  const linearPoly = toGeoJSONPolygon(linearPts);
  if (!linearPoly) return [];

  const surfaceShapes: { shape: Shape; idx: number }[] = [];
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    if (s.layer !== 2) continue;
    if (isSurfaceShape(s)) surfaceShapes.push({ shape: s, idx: i });
  }

  const overlapping: number[] = [];
  for (const { shape: sa, idx: ia } of surfaceShapes) {
    const ptsA = getShapePolygonForAdjustment(sa);
    if (ptsA.length < 3) continue;
    const polyA = toGeoJSONPolygon(ptsA);
    if (!polyA) continue;
    try {
      const inter = polygonClipping.intersection(polyA, linearPoly);
      const polys = fromGeoJSONMulti(inter);
      if (polys.length > 0) overlapping.push(ia);
    } catch {
      // ignore
    }
  }
  return overlapping;
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

/** Signed area of polygon: positive = CCW, negative = CW. */
function signedAreaPolygon(pts: Point[]): number {
  if (pts.length < 3) return 0;
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area / 2;
}

/** Fit union result back to original shape structure — preserves arcs, avoids adding many points.
 * When shape has edgeArcs, returns a new Shape with same number of points but adjusted arc offsets.
 * Returns null if fitting fails (fall back to raw apply). */
export function fitUnionResultToShape(shape: Shape, unionPoints: Point[]): Shape | null {
  const pts = shape.points;
  const edgeArcs = shape.edgeArcs;
  if (!shape.closed || pts.length < 3) return null;
  if (!edgeArcs || edgeArcs.every(a => !a || a.length === 0)) return null;

  const m = unionPoints.length;
  if (m < pts.length) return null;

  const origPoly = getEffectivePolygon(shape);
  const origSignedArea = signedAreaPolygon(origPoly);
  const resultSignedArea = signedAreaPolygon(unionPoints);
  const sameOrientation = (origSignedArea > 0 && resultSignedArea > 0) || (origSignedArea < 0 && resultSignedArea < 0);

  const n = pts.length;
  const cornerIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let j = 0; j < m; j++) {
      const d = distance(pts[i], unionPoints[j]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = j;
      }
    }
    cornerIndices.push(bestIdx);
  }
  const unique = new Set(cornerIndices);
  if (unique.size !== n) return null;

  const newPts = cornerIndices.map(idx => ({ ...unionPoints[idx] }));
  const newEdgeArcs: (ArcPoint[] | null)[] = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const idxI = cornerIndices[i];
    const idxJ = cornerIndices[j];
    const A = newPts[i];
    const B = newPts[j];

    if (!edgeArcs[i] || edgeArcs[i]!.length === 0) {
      newEdgeArcs[i] = null;
      continue;
    }

    const segmentPts: Point[] = [];
    if (idxI !== idxJ) {
      const fwdLen = idxI < idxJ ? idxJ - idxI - 1 : (m - idxI - 1) + idxJ;
      const bwdLen = idxJ < idxI ? idxI - idxJ - 1 : (m - idxJ - 1) + idxI;
      const baseStep = fwdLen >= bwdLen ? 1 : -1;
      const step = sameOrientation ? baseStep : -baseStep;
      let k = idxI;
      do {
        k = step > 0 ? (k + 1) % m : (k - 1 + m) % m;
        if (k !== idxJ) segmentPts.push(unionPoints[k]);
      } while (k !== idxJ);
    }
    if (segmentPts.length < 1) {
      newEdgeArcs[i] = [...edgeArcs[i]!];
      continue;
    }

    const control = fitQuadraticBezierControlToPoints(A, B, [A, ...segmentPts, B]);
    if (!control) {
      newEdgeArcs[i] = [...edgeArcs[i]!];
      continue;
    }

    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-9) {
      newEdgeArcs[i] = [...edgeArcs[i]!];
      continue;
    }
    const nx = -dy / len;
    const ny = dx / len;
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const offset = (control.x - mid.x) * nx + (control.y - mid.y) * ny;
    const origArc = edgeArcs[i]![0];
    const origOffset = origArc?.offset ?? 0;
    const offsetDiff = Math.abs(offset - origOffset);
    const maxReasonableOffset = len * 0.7;
    if (Math.abs(offset) > maxReasonableOffset) {
      newEdgeArcs[i] = [...edgeArcs[i]!];
    } else if ((offsetDiff < len * 0.05 || offsetDiff < 2) && segmentPts.length > 15) {
      newEdgeArcs[i] = [...edgeArcs[i]!];
    } else {
      const roundedOffset = Math.round(offset * 10000) / 10000;
      const newArc: ArcPoint = { id: crypto.randomUUID(), t: 0.5, offset: roundedOffset };
      newEdgeArcs[i] = [newArc];
    }
  }

  const s: Shape = { ...shape, points: newPts, edgeArcs: newEdgeArcs };
  if (shape.elementType === "pathSlabs" || shape.elementType === "pathConcreteSlabs" || shape.elementType === "pathMonoblock") {
    s.calculatorInputs = { ...s.calculatorInputs, pathIsOutline: true };
  }
  return s;
}

/** Extend shape to cover empty area (union). Returns new points or null. */
export function extendShapeToCoverEmptyArea(shapes: Shape[], shapeIdx: number, emptyAreaPolygon: Point[]): Point[] | null {
  const shape = shapes[shapeIdx];
  if (!shape) return null;
  const shapePts = getShapePolygonForAdjustment(shape);
  if (shapePts.length < 3) return null;
  const emptyPoly = toGeoJSONPolygon(emptyAreaPolygon);
  if (!emptyPoly) return null;

  const poly = toGeoJSONPolygon(shapePts);
  if (!poly) return null;
  try {
    const union = polygonClipping.union(poly, emptyPoly);
    const polys = fromGeoJSONMulti(union);
    if (polys.length === 0) return null;
    const result = polys[0];
    return result;
  } catch {
    return null;
  }
}

/** Extend shape to cover empty area (same as fill).
 *  Always uses union — strip-based logic produced asymmetric results (kostka vs slaby)
 *  and wrong geometry for element-to-element gaps. */
export function extendShapeToGardenEdge(shapes: Shape[], shapeIdx: number, emptyAreaPolygon: Point[]): Point[] | null {
  return extendShapeToCoverEmptyArea(shapes, shapeIdx, emptyAreaPolygon);
}

// ── Fence 10×10 cm cutouts at post positions ─────────────────

const POST_SPACING_M = 1.8;
const FENCE_POST_CUTOUT_HALF_M = 0.05; // 10×10 cm → 5 cm each side

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

/** Get fence post positions along polyline (every 1.8m + at ends). Points in world coords (pixels). */
export function getFencePostPositions(fenceShape: Shape): Point[] {
  const pts = fenceShape.points;
  if (pts.length < 2 || fenceShape.elementType !== "fence") return [];
  let totalLenPx = 0;
  for (let i = 0; i < pts.length - 1; i++) totalLenPx += distance(pts[i], pts[i + 1]);
  const spacingPx = toPixels(POST_SPACING_M);
  const positions: Point[] = [];
  for (let d = 0; d <= totalLenPx + 1; d += spacingPx) {
    const p = pointAtDistance(pts, d);
    if (p) positions.push(p);
  }
  return positions;
}

/** 10×10 cm square polygon centered at pt (world coords). */
function postCutoutSquare(center: Point): Point[] {
  const half = toPixels(FENCE_POST_CUTOUT_HALF_M);
  return [
    { x: center.x - half, y: center.y - half },
    { x: center.x + half, y: center.y - half },
    { x: center.x + half, y: center.y + half },
    { x: center.x - half, y: center.y + half },
  ];
}

/** Surface polygon with 10×10 cm fence post cutouts. Returns array of polygons (may be multiple if cutouts split). */
export function getSurfacePolygonWithFenceCutouts(surfaceShape: Shape, shapes: Shape[]): Point[][] {
  const surfacePts = getShapePolygonForAdjustment(surfaceShape);
  if (surfacePts.length < 3) return [surfacePts];
  if (!isSurfaceShape(surfaceShape)) return [surfacePts];

  const fenceShapes = shapes.filter(s => s.elementType === "fence" && s.points.length >= 2);
  if (fenceShapes.length === 0) return [surfacePts];

  const surfacePoly = toGeoJSONPolygon(surfacePts);
  if (!surfacePoly) return [surfacePts];

  let current: MultiPolygon = [surfacePoly];
  for (const fence of fenceShapes) {
    const posts = getFencePostPositions(fence);
    for (const post of posts) {
      const square = postCutoutSquare(post);
      const squarePoly = toGeoJSONPolygon(square);
      if (!squarePoly) continue;
      try {
        const newPolys: MultiPolygon = [];
        for (const poly of current) {
          const diff = polygonClipping.difference(poly, squarePoly);
          for (const p of diff) newPolys.push(p);
        }
        current = newPolys.length > 0 ? newPolys : current;
      } catch {
        // ignore
      }
    }
  }
  return fromGeoJSONMulti(current);
}
