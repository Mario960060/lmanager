// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — adjustmentLogic.ts
// Layer 5 Adjustment: empty areas, overflow, overlaps
// ══════════════════════════════════════════════════════════════

import polygonClipping from "polygon-clipping";
import type { Polygon, MultiPolygon } from "polygon-clipping";
import { Point, Shape, centroid, distance, toPixels, shoelaceArea } from "./geometry";
import { getEffectivePolygon } from "./arcMath";
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
  return shape.closed && shape.edgeArcs?.some(a => a && a.length > 0)
    ? getEffectivePolygon(shape)
    : shape.points;
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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:computeEmptyAreas:entry',message:'computeEmptyAreas start',data:{shapesLen:shapes.length},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
  // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:computeEmptyAreas:preLayer2Union',message:'before layer2 union',data:{layer2PolysLen:layer2Polys.length},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
    // #endregion
    layer2Union = layer2Polys.length === 1 ? [layer2Polys[0]] : polygonClipping.union(layer2Polys[0], ...layer2Polys.slice(1));
  } catch {
    return fromGeoJSONMulti(gardenUnion);
  }

  try {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:computeEmptyAreas:preDiff',message:'before difference',data:{},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
    // #endregion
    const empty = polygonClipping.difference(gardenUnion, layer2Union);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:computeEmptyAreas:exit',message:'computeEmptyAreas done',data:{emptyLen:empty?.length},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
    // #endregion
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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:computeOverflowAreas:entry',message:'computeOverflowAreas start',data:{},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
  // #endregion
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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:computeOverflowAreas:exit',message:'computeOverflowAreas done',data:{},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
  // #endregion
  return results;
}

export interface OverlapResult {
  shapeIdxA: number;
  shapeIdxB: number;
  overlapPolygon: Point[];
}

/** Overlaps: surface vs surface, and surface vs linear (wall/kerb/foundation). */
export function computeOverlaps(shapes: Shape[]): OverlapResult[] {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:computeOverlaps:entry',message:'computeOverlaps start',data:{},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
  // #endregion
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

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:computeOverlaps:exit',message:'computeOverlaps done',data:{},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
  // #endregion
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

/** Remove overlap area from shape. Returns new points (may be multiple polygons) or null. */
export function removeOverlapFromShape(shapes: Shape[], shapeIdx: number, overlapPolygon: Point[]): Point[][] | null {
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
    return polys.length > 0 ? polys : null;
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
    return polys[0];
  } catch {
    return null;
  }
}

/** Get garden polygon (union of Layer 1 shapes). Returns first polygon or null. */
function getGardenPolygon(shapes: Shape[]): Polygon | null {
  const layer1 = shapes.filter(s => s.layer === 1 && s.closed && s.points.length >= 3);
  if (layer1.length === 0) return null;
  const polys: Polygon[] = [];
  for (const s of layer1) {
    const pts = getShapePolygonForAdjustment(s);
    const p = toGeoJSONPolygon(pts);
    if (p) polys.push(p);
  }
  if (polys.length === 0) return null;
  try {
    const unionResult = polys.length === 1 ? [polys[0]] : polygonClipping.union(polys[0], ...polys.slice(1));
    const firstPoly = unionResult[0];
    return firstPoly && firstPoly[0] ? firstPoly : null;
  } catch {
    return null;
  }
}

/** Axis-aligned rectangle as polygon (ring format for GeoJSON). */
function rectToPolygon(x1: number, y1: number, x2: number, y2: number): Polygon {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]];
}

/** Extend shape to garden edge in one direction only (one-sided scale).
 *  Restricts empty area to the element's extent along the boundary.
 *  Falls back to extendShapeToCoverEmptyArea when no Layer 1 (garden) or strip misses the gap (element-to-element). */
export function extendShapeToGardenEdge(shapes: Shape[], shapeIdx: number, emptyAreaPolygon: Point[]): Point[] | null {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:extendShapeToGardenEdge:entry',message:'extendShapeToGardenEdge called',data:{shapeIdx,emptyAreaLen:emptyAreaPolygon.length,shapesCount:shapes.length},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  const shape = shapes[shapeIdx];
  if (!shape) return null;
  const shapePts = getShapePolygonForAdjustment(shape);
  if (shapePts.length < 3) return null;
  const emptyPoly = toGeoJSONPolygon(emptyAreaPolygon);
  if (!emptyPoly) return null;
  const gardenPoly = getGardenPolygon(shapes);
  if (!gardenPoly) {
    // No Layer 1 (garden) – fallback to fill for element-to-element gaps
    return extendShapeToCoverEmptyArea(shapes, shapeIdx, emptyAreaPolygon);
  }

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:extendShapeToGardenEdge:preIntersection',message:'before intersection',data:{shapePtsLen:shapePts.length},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
  // #endregion

  const elemMinX = Math.min(...shapePts.map(p => p.x));
  const elemMaxX = Math.max(...shapePts.map(p => p.x));
  const elemMinY = Math.min(...shapePts.map(p => p.y));
  const elemMaxY = Math.max(...shapePts.map(p => p.y));

  const gardenPts = gardenPoly[0].map(([x, y]) => ({ x, y }));
  const gardenMinX = Math.min(...gardenPts.map(p => p.x));
  const gardenMaxX = Math.max(...gardenPts.map(p => p.x));
  const gardenMinY = Math.min(...gardenPts.map(p => p.y));
  const gardenMaxY = Math.max(...gardenPts.map(p => p.y));

  const emptyCentroid = centroid(emptyAreaPolygon);
  const shapeCentroid = centroid(shapePts);

  const dx = emptyCentroid.x - shapeCentroid.x;
  const dy = emptyCentroid.y - shapeCentroid.y;
  const eps = 1e-6;

  let stripPoly: Polygon;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx < 0) {
      stripPoly = rectToPolygon(gardenMinX - eps, elemMinY - eps, elemMinX + eps, elemMaxY + eps);
    } else {
      stripPoly = rectToPolygon(elemMaxX - eps, elemMinY - eps, gardenMaxX + eps, elemMaxY + eps);
    }
  } else {
    if (dy < 0) {
      stripPoly = rectToPolygon(elemMinX - eps, gardenMinY - eps, elemMaxX + eps, elemMinY + eps);
    } else {
      stripPoly = rectToPolygon(elemMinX - eps, elemMaxY - eps, elemMaxX + eps, gardenMaxY + eps);
    }
  }

  try {
    const restricted = polygonClipping.intersection(emptyPoly, stripPoly);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:extendShapeToGardenEdge:postIntersection',message:'after intersection',data:{restrictedLen:restricted?.length},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    const restrictedPolys = fromGeoJSONMulti(restricted);
    if (restrictedPolys.length === 0) {
      // Strip missed the gap (e.g. element-to-element, no garden edge in that direction) – fallback to fill
      return extendShapeToCoverEmptyArea(shapes, shapeIdx, emptyAreaPolygon);
    }

    const shapeGeo = toGeoJSONPolygon(shapePts);
    if (!shapeGeo) return null;

    let resultPoly: Point[] | null = null;
    let bestArea = 0;
    let iterCount = 0;
    for (const rp of restrictedPolys) {
      if (rp.length < 3) continue;
      const rpGeo = toGeoJSONPolygon(rp);
      if (!rpGeo) continue;
      iterCount++;
      const union = polygonClipping.union(shapeGeo, rpGeo);
      // #region agent log
      if (iterCount <= 2) fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:extendShapeToGardenEdge:postUnion',message:'after union',data:{iterCount,polysLen:union?.length},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      const polys = fromGeoJSONMulti(union);
      for (const p of polys) {
        if (p.length < 3) continue;
        const area = shoelaceArea(p);
        if (area < 1) continue;
        if (pointInPolygon(shapeCentroid, p) || area > bestArea) {
          resultPoly = p;
          bestArea = area;
          if (pointInPolygon(shapeCentroid, p)) break;
        }
      }
      if (resultPoly && pointInPolygon(shapeCentroid, resultPoly)) break;
    }
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:extendShapeToGardenEdge:exit',message:'extendShapeToGardenEdge returning',data:{hasResult:!!resultPoly,iterCount},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    return resultPoly;
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2b18dd34-f9ef-41d3-ae49-e6d33f2c277f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adjustmentLogic.ts:extendShapeToGardenEdge:catch',message:'extendShapeToGardenEdge threw',data:{err:String(err)},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    return null;
  }
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
