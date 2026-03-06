// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — visualization/slabPattern.ts
// Slab pattern rendering on polygon shapes (grid, brick)
// ══════════════════════════════════════════════════════════════

import { Point, Shape, toPixels, toMeters, labelAnchorInsidePolygon } from "../geometry";
import { getEffectivePolygon } from "../arcMath";

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

  const outline = shape.calculatorInputs?.pathIsOutline ? shape.points : getEffectivePolygon(shape);
  if (outline.length < 3 || !shape.closed) return false;

  const n = outline.length / 2;
  if (pathCenterline.length !== n) return false;

  const slabWidthCm = Number(inputs.vizSlabWidth);
  const slabLengthCm = Number(inputs.vizSlabLength);
  const groutMm = Number(inputs.vizGroutWidthMm ?? (inputs.vizGroutWidth != null ? Number(inputs.vizGroutWidth) * 10 : 5));
  const slabOrientation = (inputs.slabOrientation as "along" | "across") || "along";
  const slabWidthPx = toPixels(slabWidthCm / 100);
  const slabLengthPx = toPixels(slabLengthCm / 100);
  const groutPx = toPixels(groutMm / 1000);

  const alongPx = slabOrientation === "along" ? slabLengthPx : slabWidthPx;
  const acrossPx = slabOrientation === "along" ? slabWidthPx : slabLengthPx;
  const stepLength = alongPx + groutPx;
  const stepWidth = acrossPx + groutPx;

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
        const cx = origin.x + c * stepLength * dir.x + r * stepWidth * perp.x;
        const cy = origin.y + c * stepLength * dir.y + r * stepWidth * perp.y;
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
  if (total > 0) {
    const anchor = labelAnchorInsidePolygon(shape.points);
    const sc = worldToScreen(anchor.x, anchor.y);
    ctx.font = "bold 14px 'JetBrains Mono',monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${fullCount} full, ${cutCount} cut, ~${wastePct}% waste`, sc.x, sc.y + 26);
  }

  ctx.restore();
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

  let pts = getEffectivePolygon(shape);
  if (pts.length < 3 || !shape.closed) return;

  const frameWidthCm = Number(inputs?.framePieceWidthCm ?? 0);
  if (frameWidthCm > 0 && !hasConcaveVertex(pts)) {
    const frameWidthPx = toPixels(frameWidthCm / 100);
    pts = shrinkPolygon(pts, frameWidthPx);
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
  const origin = { x: origPts[startCorner].x + off.x, y: origPts[startCorner].y + off.y };
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
  const extend = Math.max(extendC, extendR, 10);

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
  const polygonForIntersection = hasArcs
    ? (frameWidthCm > 0 && !hasConcaveVertex(origPts) ? shrinkPolygon(origPts, toPixels(frameWidthCm / 100)) : origPts)
    : pts;

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
        // Brick: stagger columns (not rows) so zigzag lines run horizontally
        // Rows: slab next to slab; row below starts at half slab
        let offsetR = r;
        if (pattern === "brick" && c % 2 !== 0) {
          offsetR = r + 0.5;
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
  if (total > 0) {
    const anchor = labelAnchorInsidePolygon(shape.points);
    const sc = worldToScreen(anchor.x, anchor.y);
    ctx.font = "bold 14px 'JetBrains Mono',monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${fullCount} full, ${cutCount} cut, ~${wastePct}% waste`, sc.x, sc.y + 26);
  }

  ctx.restore();
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

  const pts = getEffectivePolygon(shape);
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

  const n = pts.length;
  for (let i = 0; i < n; i++) {
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
  let pts = getEffectivePolygon(shape);
  if (pts.length < 3 || !shape.closed) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };

  const frameWidthCm = Number(inputs?.framePieceWidthCm ?? 0);
  if (frameWidthCm > 0 && !hasConcaveVertex(pts)) {
    const frameWidthPx = toPixels(frameWidthCm / 100);
    pts = shrinkPolygon(pts, frameWidthPx);
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
  const origin = { x: origPts[startCorner].x + offX, y: origPts[startCorner].y + offY };
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
  const extend = Math.max(extendC, extendR, 10);

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
      let offsetR = pattern === "brick" && c % 2 !== 0 ? r + 0.5 : r;
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

      // Collect cut segments for display (kept from original approach)
      for (let e = 0; e < 4; e++) {
        const a = corners[e];
        const b = corners[(e + 1) % 4];
        const ts: number[] = [0, 1];
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const q = pts[(i + 1) % pts.length];
          const t = segmentIntersection(a, b, p, q);
          if (t != null && t > 0.001 && t < 0.999) ts.push(t);
        }
        ts.sort((x, y) => x - y);
        for (let i = 0; i < ts.length - 1; i++) {
          const t0 = ts[i];
          const t1 = ts[i + 1];
          const midT = (t0 + t1) / 2;
          const mid = { x: a.x + midT * (b.x - a.x), y: a.y + midT * (b.y - a.y) };
          const lenCm = toMeters(Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2) * (t1 - t0)) * 100;
          if (!pointInPolygon(mid, pts)) cuts.push({ lengthCm: lenCm });
        }
      }

      const slabOrigin = { x: cx, y: cy };
      const demandPolygon = rectPolygonIntersection(corners, pts);
      if (demandPolygon.length < 3) continue;

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
  const outline = inputs?.pathIsOutline ? shape.points : getEffectivePolygon(shape);
  if (outline.length < 3 || !shape.closed) return { cuts: [], cutSlabCount: 0, fullSlabCount: 0, wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };

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
  const alongPx = slabOrientation === "along" ? slabLengthPx : slabWidthPx;
  const acrossPx = slabOrientation === "along" ? slabWidthPx : slabLengthPx;
  const stepLength = alongPx + groutPx;
  const stepWidth = acrossPx + groutPx;

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
        const cx = origin.x + c * stepLength * dir.x + r * stepWidth * perp.x;
        const cy = origin.y + c * stepLength * dir.y + r * stepWidth * perp.y;
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

        // Collect cut segments for task breakdown (same logic as computeSlabCuts)
        for (let e = 0; e < 4; e++) {
          const a = corners[e];
          const b = corners[(e + 1) % 4];
          const ts: number[] = [0, 1];
          for (let i = 0; i < outline.length; i++) {
            const p = outline[i];
            const q = outline[(i + 1) % outline.length];
            const t = segmentIntersection(a, b, p, q);
            if (t != null && t > 0.001 && t < 0.999) ts.push(t);
          }
          ts.sort((x, y) => x - y);
          for (let i = 0; i < ts.length - 1; i++) {
            const t0 = ts[i];
            const t1 = ts[i + 1];
            const midT = (t0 + t1) / 2;
            const mid = { x: a.x + midT * (b.x - a.x), y: a.y + midT * (b.y - a.y) };
            const lenCm = toMeters(Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2) * (t1 - t0)) * 100;
            if (!pointInPolygon(mid, outline)) pathCuts.push({ lengthCm: lenCm });
          }
        }

        const slabOrigin = { x: cx, y: cy };
        const demandPolygon = clipped;
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
  const pts = shape.points;
  const inputs = shape.calculatorInputs;
  if (!pts.length || !shape.closed || !inputs) {
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
    startCorner = Math.max(0, Math.min(pts.length - 1, Math.floor(Number(inputs?.vizStartCorner ?? 0))));
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
    startCorner = Math.max(0, Math.min(pts.length - 1, Math.floor(Number(inputs?.vizStartCorner ?? 0))));
  }

  const origin = { x: pts[startCorner].x + offset.x, y: pts[startCorner].y + offset.y };
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
