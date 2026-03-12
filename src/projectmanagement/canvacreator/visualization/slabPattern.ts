// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — visualization/slabPattern.ts
// Slab pattern rendering on polygon shapes (grid, brick)
// ══════════════════════════════════════════════════════════════

import { Point, Shape, toPixels, toMeters, labelAnchorInsidePolygon, areaM2, polygonCentroidByArea, pointInPolygon, polylineMidpointAndAngle } from "../geometry";
import { scaledFontSize } from "../canvasRenderers";
import { getEffectivePolygon, getEffectivePolygonWithEdgeIndices } from "../arcMath";
import { isPathElement, getPathPolygon } from "../linearElements";

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

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
const SLAB_CUT_COLOR = "#95a5a6";
const SLAB_SMALL_CUT_COLOR = "#e74c3c";
const SLAB_WASTE_REUSED_COLOR = "#27ae60";
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
  useNormalColorsForCuts?: boolean
): boolean {
  const inputs = shape.calculatorInputs;
  const pathCenterline = inputs?.pathCenterline as Point[] | undefined;
  if (!pathCenterline || !Array.isArray(pathCenterline) || pathCenterline.length < 2) return false;
  if (!inputs?.vizSlabWidth || !inputs?.vizSlabLength) return false;

  let outline = shape.calculatorInputs?.pathIsOutline ? shape.points : getEffectivePolygon(shape);
  if (outline.length < 3 || !shape.closed) return false;

  const frameWidthCm = Number(inputs?.framePieceWidthCm ?? 0);
  if (frameWidthCm > 0 && !hasConcaveVertex(outline)) {
    const frameWidthPx = toPixels(frameWidthCm / 100);
    outline = shrinkPolygon(outline, frameWidthPx);
    if (outline.length < 3) return false;
  }

  const n = outline.length / 2;
  if (pathCenterline.length !== n) return false;

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
  const pathWidthMode = inputs.pathWidthMode as string | undefined;
  const rowCenterOffset = (pathWidthMode === "slab1" || pathWidthMode === "slab1_5") ? -0.5 : 0;

  const slabAreaPx2 = slabWidthPx * slabLengthPx;
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

  const drawSlabFragment = (corners: Point[], isCut: boolean, r: number, c: number, segIdx: number) => {
    if (corners.length < 3) return;
    if (isCut && !showCuts) return;
    isCut ? cutCount++ : fullCount++;
    const key = `${segIdx},${r},${c}`;
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

  const EXTEND = 50;

  for (let segIdx = 0; segIdx < n - 1; segIdx++) {
    const A = pathCenterline[segIdx];
    const B = pathCenterline[segIdx + 1];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const dir = { x: dx / len, y: dy / len };
    const perp = { x: -dy / len, y: dx / len };

    const quad: Point[] = [
      outline[segIdx],
      outline[segIdx + 1],
      outline[2 * n - 2 - segIdx],
      outline[2 * n - 1 - segIdx],
    ];
    const region = rectPolygonIntersection(quad, outline);
    if (region.length < 3) continue;

    const origin = { x: A.x, y: A.y };

    for (let r = -EXTEND; r <= EXTEND; r++) {
      for (let c = -EXTEND; c <= EXTEND; c++) {
        let offsetR = r + rowCenterOffset;
        if (pattern === "brick" && c % 2 !== 0) offsetR += 0.5;
        else if (pattern === "onethird") offsetR += [0, 2 / 3, 1 / 3][((c % 3) + 3) % 3];
        const cx = origin.x + c * stepLength * dir.x + offsetR * stepWidth * perp.x;
        const cy = origin.y + c * stepLength * dir.y + offsetR * stepWidth * perp.y;
        const corners: Point[] = [
          { x: cx, y: cy },
          { x: cx + alongPx * dir.x, y: cy + alongPx * dir.y },
          { x: cx + alongPx * dir.x + acrossPx * perp.x, y: cy + alongPx * dir.y + acrossPx * perp.y },
          { x: cx + acrossPx * perp.x, y: cy + acrossPx * perp.y },
        ];
        if (!rectIntersectsPolygon(corners, region)) continue;
        const clipped = rectPolygonIntersection(corners, region);
        if (clipped.length < 3) continue;
        const fullyInside = rectFullyInsidePolygon(corners, region);
        drawSlabFragment(clipped, !fullyInside, r, c, segIdx);
      }
    }
  }

  const total = fullCount + cutCount;
  const slabAreaCm2 = slabWidthCm * slabLengthCm;
  const totalSlabAreaCm2 = total > 0 && slabAreaCm2 > 0 ? total * slabAreaCm2 : 0;
  const wasteAreaCm2 = Number(inputs?.vizWasteAreaCm2 ?? 0);
  const reusedAreaCm2 = Number(inputs?.vizReusedAreaCm2 ?? 0);
  const actualWasteCm2 = Math.max(0, wasteAreaCm2 - reusedAreaCm2);
  const wastePct = totalSlabAreaCm2 > 0 ? Math.round((actualWasteCm2 / totalSlabAreaCm2) * 100) : (total > 0 ? Math.round((cutCount / total) * 100) : 0);

  ctx.restore();

  if (total > 0) {
    const poly = outline.length >= 3 ? outline : shape.points;
    const area = areaM2(poly);
    const baseFontSize = 14;
    const scaledFont = scaledFontSize(baseFontSize, zoom);
    const lineHeight = scaledFont * 1.2;
    ctx.font = `bold ${scaledFont}px 'JetBrains Mono',monospace`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const pathCenterline = inputs?.pathCenterline as Point[] | undefined;
    const ma = pathCenterline && pathCenterline.length >= 2 ? polylineMidpointAndAngle(pathCenterline) : null;
    if (ma) {
      const sc = worldToScreen(ma.point.x, ma.point.y);
      ctx.save();
      ctx.translate(sc.x, sc.y);
      ctx.rotate(ma.angleRad);
      ctx.fillText(area.toFixed(2) + " m²", 0, lineHeight * 0.5);
      ctx.fillText(`${fullCount} full, ${cutCount} cut`, 0, lineHeight * 1.5);
      ctx.fillText(`~${wastePct}% waste`, 0, lineHeight * 2.5);
      ctx.restore();
    } else {
      const anchor = labelAnchorInsidePolygon(poly);
      const sc = worldToScreen(anchor.x, anchor.y);
      ctx.fillText(area.toFixed(2) + " m²", sc.x, sc.y + lineHeight * 0.5);
      ctx.fillText(`${fullCount} full, ${cutCount} cut`, sc.x, sc.y + lineHeight * 1.5);
      ctx.fillText(`~${wastePct}% waste`, sc.x, sc.y + lineHeight * 2.5);
    }
  }
  return true;
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

  const { points: ptsRaw, edgeIndices } = getEffectivePolygonWithEdgeIndices(shape);
  let pts = ptsRaw;
  if (pts.length < 3 || !shape.closed) return;

  const frameWidthCm = Number(inputs?.framePieceWidthCm ?? 0);
  const frameSidesEnabled = inputs?.frameSidesEnabled as boolean[] | undefined;
  if (frameWidthCm > 0 && !hasConcaveVertex(pts)) {
    const frameWidthPx = toPixels(frameWidthCm / 100);
    if (Array.isArray(frameSidesEnabled) && frameSidesEnabled.length > 0) {
      pts = shrinkPolygonByEdges(pts, frameWidthPx, edgeIndices, frameSidesEnabled);
    } else {
      pts = shrinkPolygon(pts, frameWidthPx);
    }
  }
  if (pts.length < 3) return;

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
  // When frame exists, align origin to inner edge (frame boundary), not outer corner
  const originBase = frameWidthCm > 0 && !hasConcaveVertex(origPts) ? pts[Math.min(startCorner, pts.length - 1)] : origPts[startCorner];
  if (!originBase) return;
  const origin = { x: originBase.x + off.x, y: originBase.y + off.y };
  // Same as kostka: 0° = along +X, 90° = along +Y
  const angle = (directionDeg * Math.PI) / 180;
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
  const extend = Math.min(Math.max(extendC, extendR, 10), EXTEND_CAP);

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

  const cornersInsideCount = (corners: Point[], polygon: Point[]): number => {
    let n = 0;
    for (const c of corners) if (pointInOrOnPolygon(c, polygon)) n++;
    return n;
  };

  const hasArcs = !!(shape.edgeArcs?.some(a => a && a.length > 0));
  const polygonForIntersection = hasArcs ? pts : pts;

  const countOrigVertsInSlab = (corners: Point[]): number => {
    let n = 0;
    for (const v of origPts) if (pointInOrOnPolygon(v, corners)) n++;
    return n;
  };
  const drawSlab = (corners: Point[], isCut: boolean, r: number, c: number) => {
    if (!rectIntersectsPolygon(corners, pts)) return;
    if (isCut && !showCuts) return;
    isCut ? cutCount++ : fullCount++;

    const isWasteReused = isCut && wasteSatisfiedSet.has(`${r},${c}`);
    const vertsInSlab = hasArcs ? countOrigVertsInSlab(corners) : 4;
    const usedAreaOrig = rectPolygonIntersectionArea(corners, polygonForIntersection);
    const usedAreaPts = hasArcs ? rectPolygonIntersectionArea(corners, pts) : usedAreaOrig;
    const usedArea = Math.max(usedAreaOrig, usedAreaPts);
    const wouldBeSmallByArea = usedArea < SMALL_CUT_USED_THRESHOLD * slabAreaPx2;
    const isSmallCut = isCut && !isWasteReused && wouldBeSmallByArea && !(hasArcs && vertsInSlab <= 2);

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

  for (let r = -extend; r <= extend; r++) {
    for (let c = -extend; c <= extend; c++) {
        // Brick: stagger columns — odd columns shift by 1/2
        // OneThird: like Brick but column 0=0, column 1=2/3, column 2=1/3 (repeat)
        let offsetR = r;
        if (pattern === "brick" && c % 2 !== 0) {
          offsetR = r + 0.5;
        } else if (pattern === "onethird") {
          const colOffset = [0, 2 / 3, 1 / 3][((c % 3) + 3) % 3];
          offsetR = r + colOffset;
        }
        const cx = origin.x + c * stepLength * dir.x + offsetR * stepWidth * perp.x;
        const cy = origin.y + c * stepLength * dir.y + offsetR * stepWidth * perp.y;

        const corners: Point[] = [
          { x: cx, y: cy },
          { x: cx + slabLengthPx * dir.x, y: cy + slabLengthPx * dir.y },
          { x: cx + slabLengthPx * dir.x + slabWidthPx * perp.x, y: cy + slabLengthPx * dir.y + slabWidthPx * perp.y },
          { x: cx + slabWidthPx * perp.x, y: cy + slabWidthPx * perp.y },
        ];
        const fullyInside = rectFullyInsidePolygon(corners, pts);
        const intersects = rectIntersectsPolygon(corners, pts);
        if (!fullyInside && !intersects) continue;
        const cornersInside = cornersInsideCount(corners, pts);
        const hasIntersectionArea = rectPolygonIntersectionArea(corners, pts) > 1e-20;
        if (!fullyInside && cornersInside === 0 && !hasIntersectionArea && !intersects) continue;
        drawSlab(corners, !fullyInside, r, c);
    }
  }

  const total = fullCount + cutCount;
  const slabAreaCm2 = (inputs?.vizSlabWidth ?? 0) * (inputs?.vizSlabLength ?? 0);
  const totalSlabAreaCm2 = total > 0 && slabAreaCm2 > 0 ? total * slabAreaCm2 : 0;
  const wasteAreaCm2 = Number(inputs?.vizWasteAreaCm2 ?? 0);
  const reusedAreaCm2 = Number(inputs?.vizReusedAreaCm2 ?? 0);
  const actualWasteCm2 = Math.max(0, wasteAreaCm2 - reusedAreaCm2);
  const wastePct = totalSlabAreaCm2 > 0 ? Math.round((actualWasteCm2 / totalSlabAreaCm2) * 100) : (total > 0 ? Math.round((cutCount / total) * 100) : 0);

  ctx.restore();

  if (total > 0) {
    const areaCtr = polygonCentroidByArea(pts);
    const anchor = pointInPolygon(areaCtr, pts) ? areaCtr : labelAnchorInsidePolygon(pts);
    const sc = worldToScreen(anchor.x, anchor.y);
    const area = areaM2(getEffectivePolygon(shape));
    const baseFontSize = 14;
    const scaledFont = scaledFontSize(baseFontSize, zoom);
    const lineHeight = scaledFont * 1.2;
    ctx.font = `bold ${scaledFont}px 'JetBrains Mono',monospace`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(area.toFixed(2) + " m²", sc.x, sc.y + lineHeight * 0.5);
    ctx.fillText(`${fullCount} full, ${cutCount} cut`, sc.x, sc.y + lineHeight * 1.5);
    ctx.fillText(`~${wastePct}% waste`, sc.x, sc.y + lineHeight * 2.5);
  }
}

/**
 * Draw frame tiles along polygon edges.
 * Frame is fixed to the polygon perimeter; not affected by slab pattern drag/rotate.
 * frameJointType: 'butt' = square ends, 'miter45' = 45° miter cut at corners.
 */
export function drawSlabFrame(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  _zoom: number
): void {
  const inputs = shape.calculatorInputs;
  const framePieceWidthCm = Number(inputs?.framePieceWidthCm ?? 0);
  const framePieceLengthCm = Number(inputs?.framePieceLengthCm ?? 60);
  if (framePieceWidthCm <= 0) return;

  const { points: pts, edgeIndices } = getEffectivePolygonWithEdgeIndices(shape);
  if (pts.length < 3 || !shape.closed) return;

  const pieceLengthM = framePieceLengthCm / 100;
  const pieceWidthM = framePieceWidthCm / 100;
  const pieceLengthPx = toPixels(pieceLengthM);
  const pieceWidthPx = toPixels(pieceWidthM);
  const groutMm = Number(inputs?.vizGroutWidthMm ?? (inputs?.vizGroutWidth != null ? Number(inputs.vizGroutWidth) * 10 : 5));
  const groutPx = toPixels(groutMm / 1000);
  const stepLengthPx = pieceLengthPx + groutPx;
  const frameJointType = (inputs?.frameJointType as 'butt' | 'miter45') || 'butt';
  const miter = frameJointType === 'miter45';

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(worldToScreen(pts[0].x, pts[0].y).x, worldToScreen(pts[0].x, pts[0].y).y);
  for (let i = 1; i < pts.length; i++) {
    const s = worldToScreen(pts[i].x, pts[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.clip();

  const innerPts = miter ? shrinkPolygon(pts, pieceWidthPx) : null;

  const frameSidesEnabled = inputs?.frameSidesEnabled as boolean[] | undefined;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const edgeIdx = edgeIndices[(i + 1) % n];
    if (Array.isArray(frameSidesEnabled) && frameSidesEnabled[edgeIdx] === false) continue;
    const j = (i + 1) % n;
    const a = pts[i];
    const b = pts[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const signedArea = pts.reduce((acc, p, idx) => {
      const q = pts[(idx + 1) % n];
      return acc + p.x * q.y - q.x * p.y;
    }, 0) / 2;
    const inward = signedArea > 0 ? 1 : -1;
    const inx = nx * inward;
    const iny = ny * inward;

    const edgeLenPx = len;
    const numPieces = Math.ceil((edgeLenPx + groutPx) / stepLengthPx);

    if (miter && innerPts && innerPts.length === n) {
      const innerStart = innerPts[i];
      const innerEnd = innerPts[j];
      const perpInner = (p: Point) => ({ x: p.x + inx * pieceWidthPx, y: p.y + iny * pieceWidthPx });
      for (let k = 0; k < numPieces; k++) {
        const t0 = (k * stepLengthPx) / edgeLenPx;
        const t1 = Math.min(1, (k * stepLengthPx + pieceLengthPx) / edgeLenPx);
        const p0 = { x: a.x + t0 * dx, y: a.y + t0 * dy };
        const p1 = { x: a.x + t1 * dx, y: a.y + t1 * dy };
        let corners: Point[];
        if (k === 0) {
          corners = [a, p1, perpInner(p1), innerStart];
        } else if (k === numPieces - 1) {
          corners = [p0, b, innerEnd, perpInner(p0)];
        } else {
          corners = [p0, p1, perpInner(p1), perpInner(p0)];
        }
        const s0 = worldToScreen(corners[0].x, corners[0].y);
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        for (let c = 1; c < corners.length; c++) {
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
    }
  }

  ctx.restore();
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
  const { points: effectivePts, edgeIndices } = getEffectivePolygonWithEdgeIndices(shape);
  let pts = effectivePts;
  if (pts.length < 3 || !shape.closed) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };

  const frameWidthCm = Number(inputs?.framePieceWidthCm ?? 0);
  const frameSidesEnabled = inputs?.frameSidesEnabled as boolean[] | undefined;
  if (frameWidthCm > 0 && !hasConcaveVertex(effectivePts)) {
    const frameWidthPx = toPixels(frameWidthCm / 100);
    if (Array.isArray(frameSidesEnabled) && frameSidesEnabled.length > 0) {
      pts = shrinkPolygonByEdges(pts, frameWidthPx, edgeIndices, frameSidesEnabled);
    } else {
      pts = shrinkPolygon(pts, frameWidthPx);
    }
  }
  if (pts.length < 3) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };

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
  const angle = (directionDeg * Math.PI) / 180;
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
      if (rectFullyInsidePolygon(corners, pts)) { fullSlabCount++; continue; }
      const intersects = rectIntersectsPolygon(corners, pts);
      if (!intersects) continue;
      let cornersInside = 0;
      for (const corner of corners) if (pointInOrOnPolygon(corner, pts)) cornersInside++;
      const hasIntersectionArea = rectPolygonIntersectionArea(corners, pts) > 1e-20;
      if (cornersInside === 0 && !hasIntersectionArea && !intersects) continue;

      cutSlabCount++;

      const slabOrigin = { x: cx, y: cy };
      const demandPolygon = rectPolygonIntersection(corners, pts);
      if (demandPolygon.length < 3) continue;

      // Collect cut operations: one continuous chain of polygon edges = 1 cut (diagonal/curved = 1, corner = 2)
      const slabCuts = collectCutOperationsFromDemand(demandPolygon, corners, pts);
      for (const c of slabCuts) cuts.push(c);

      const demandBbox = polygonBboxCm(demandPolygon, slabOrigin, dir, perp);
      const demandWCm = demandBbox.w;
      const demandLCm = demandBbox.l;
      if (demandLCm < 0.5 || demandWCm < 0.5) continue;

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
        r, c,
        demandW: demandWCm,
        demandL: demandLCm,
        wasteW,
        wasteL,
        demandPolygon: useExactPolygon ? demandPolygon : undefined,
        wastePolygon: useExactPolygon ? wastePolygon : undefined,
      });
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
        return polygonFitsInPolygonWithRotation(demandPolygon, w.polygon);
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
  const pathCenterline = inputs?.pathCenterline as Point[] | undefined;
  if (!pathCenterline || !Array.isArray(pathCenterline) || pathCenterline.length < 2) {
    return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };
  }
  let outline = inputs?.pathIsOutline ? shape.points : getEffectivePolygon(shape);
  if (outline.length < 3 || !shape.closed) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };

  const frameWidthCm = Number(inputs?.framePieceWidthCm ?? 0);
  if (frameWidthCm > 0 && !hasConcaveVertex(outline)) {
    const frameWidthPx = toPixels(frameWidthCm / 100);
    outline = shrinkPolygon(outline, frameWidthPx);
    if (outline.length < 3) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };
  }

  const n = outline.length / 2;
  if (pathCenterline.length !== n) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };

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
  const pathWidthMode = inputs?.pathWidthMode as string | undefined;
  const rowCenterOffset = (pathWidthMode === "slab1" || pathWidthMode === "slab1_5") ? -0.5 : 0;

  const pathCuts: CutInfo[] = [];
  const cutSlabData: { segIdx: number; r: number; c: number; demandW: number; demandL: number; wasteW: number; wasteL: number; demandPolygon?: Point[]; wastePolygon?: Point[] }[] = [];
  let cutSlabCount = 0;
  let fullSlabCount = 0;
  const EXTEND = 50;

  for (let segIdx = 0; segIdx < n - 1; segIdx++) {
    const A = pathCenterline[segIdx];
    const B = pathCenterline[segIdx + 1];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const dir = { x: dx / len, y: dy / len };
    const perp = { x: -dy / len, y: dx / len };
    const quad: Point[] = [
      outline[segIdx],
      outline[segIdx + 1],
      outline[2 * n - 2 - segIdx],
      outline[2 * n - 1 - segIdx],
    ];
    const region = rectPolygonIntersection(quad, outline);
    if (region.length < 3) continue;
    const origin = { x: A.x, y: A.y };

    for (let r = -EXTEND; r <= EXTEND; r++) {
      for (let c = -EXTEND; c <= EXTEND; c++) {
        let offsetR = r + rowCenterOffset;
        if (pattern === "brick" && c % 2 !== 0) offsetR += 0.5;
        else if (pattern === "onethird") offsetR += [0, 2 / 3, 1 / 3][((c % 3) + 3) % 3];
        const cx = origin.x + c * stepLength * dir.x + offsetR * stepWidth * perp.x;
        const cy = origin.y + c * stepLength * dir.y + offsetR * stepWidth * perp.y;
        const corners: Point[] = [
          { x: cx, y: cy },
          { x: cx + alongPx * dir.x, y: cy + alongPx * dir.y },
          { x: cx + alongPx * dir.x + acrossPx * perp.x, y: cy + alongPx * dir.y + acrossPx * perp.y },
          { x: cx + acrossPx * perp.x, y: cy + acrossPx * perp.y },
        ];
        if (rectFullyInsidePolygon(corners, region)) { fullSlabCount++; continue; }
        if (!rectIntersectsPolygon(corners, region)) continue;
        const clipped = rectPolygonIntersection(corners, region);
        if (clipped.length < 3) continue;
        cutSlabCount++;

        const slabOrigin = { x: cx, y: cy };
        const demandPolygon = clipped;

        // Collect cut operations: one continuous chain = 1 cut (diagonal/curved = 1, corner = 2)
        const slabCuts = collectCutOperationsFromDemand(demandPolygon, corners, outline);
        for (const c of slabCuts) pathCuts.push(c);
        const demandBbox = polygonBboxCm(demandPolygon, slabOrigin, dir, perp);
        const demandWCm = demandBbox.w;
        const demandLCm = demandBbox.l;
        if (demandLCm < 0.5 || demandWCm < 0.5) continue;

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
          segIdx, r, c,
          demandW: demandWCm,
          demandL: demandLCm,
          wasteW,
          wasteL,
          demandPolygon: useExactPolygon ? demandPolygon : undefined,
          wastePolygon: useExactPolygon ? wastePolygon : undefined,
        });
      }
    }
  }

  const wasteSatisfiedPositions: string[] = [];
  let reusedAreaCm2 = 0;
  let wasteAreaCm2 = 0;
  const wastePool: { w: number; l: number; segIdx: number; r: number; c: number; polygon?: Point[] }[] = [];

  for (const item of cutSlabData) {
    const { segIdx, r, c, demandW, demandL, wasteW, wasteL, demandPolygon, wastePolygon } = item;
    const key = `${segIdx},${r},${c}`;

    const matches = (w: { w: number; l: number; polygon?: Point[] }): boolean => {
      if (!fitsWithRotation(w, { w: demandW, l: demandL })) return false;
      if (demandPolygon && wastePolygon && w.polygon) {
        return polygonFitsInPolygonWithRotation(demandPolygon, w.polygon);
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
      if (wasteW > 0.5 && wasteL > 0.5) {
        wastePool.push({ w: wasteW, l: wasteL, segIdx, r, c, polygon: wastePolygon });
        wasteAreaCm2 += wasteW * wasteL;
      }
    }
  }

  return { cuts: pathCuts, cutSlabCount, fullSlabCount, wasteSatisfiedPositions, wasteAreaCm2, reusedAreaCm2 };
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
  let frameWidthCm = 0;

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
    frameWidthCm = inputs?.addFrameToMonoblock ? Number(inputs?.framePieceWidthCm ?? 0) : 0;
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
    frameWidthCm = Number(inputs?.framePieceWidthCm ?? 0);
  }

  // Use same polygon as drawing: path outline for paths, effective polygon for polygons
  let pts: Point[];
  let edgeIndices: number[];
  if (isPathElement(shape)) {
    pts = getPathPolygon(shape);
    edgeIndices = pts.map((_, i) => i);
  } else {
    const eff = getEffectivePolygonWithEdgeIndices(shape);
    pts = eff.points;
    edgeIndices = eff.edgeIndices;
  }
  const frameSidesEnabled = inputs?.frameSidesEnabled as boolean[] | undefined;
  if (frameWidthCm > 0 && pts.length >= 3 && !hasConcaveVertex(pts)) {
    const frameWidthPx = toPixels(frameWidthCm / 100);
    if (Array.isArray(frameSidesEnabled) && frameSidesEnabled.length > 0) {
      pts = shrinkPolygonByEdges(pts, frameWidthPx, edgeIndices, frameSidesEnabled);
    } else {
      pts = shrinkPolygon(pts, frameWidthPx);
    }
  }
  if (pts.length < 3) pts = origPts;
  if (pts.length === 0) return { snappedOffset: offset, alignedEdges: [] };
  startCorner = Math.max(0, Math.min(startCorner, pts.length - 1));

  const originPt = pts[startCorner];
  if (!originPt) return { snappedOffset: offset, alignedEdges: [] };
  const origin = { x: originPt.x + offset.x, y: originPt.y + offset.y };
  const angle = (directionDeg * Math.PI) / 180;
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
