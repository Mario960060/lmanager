// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — geodesy.ts
// Slope calculations, validation, gradient arrows
// ══════════════════════════════════════════════════════════════

import { Shape, Point, DesignSlopePoint, distance, toMeters, pointInPolygon } from "./geometry";
import { getEffectivePolygon } from "./arcMath";
import { buildDelaunay, DelaunayResult } from "./delaunay";
import { interpolateNN } from "./naturalNeighbor";

// ── Types ────────────────────────────────────────────────────

export interface EdgeSlope {
  edgeIdx: number;
  fromIdx: number;       // point index at start
  toIdx: number;         // point index at end
  heightDiff: number;    // meters (positive = going up, negative = going down)
  lengthM: number;       // edge length in meters
  slopeCmPerM: number;   // cm per meter (absolute value)
  direction: "down" | "up" | "flat";
  severity: "ok" | "warn" | "danger"; // ok = <1.5, warn = 1.5-3, danger = >3
}

export interface ShapeGradient {
  angle: number;         // direction of steepest descent in radians
  magnitude: number;     // cm per meter of steepest descent
  severity: "ok" | "warn" | "danger";
}

export interface SlopeWarning {
  type: "steep" | "mismatch" | "missing";
  shapeIdx: number;
  edgeIdx?: number;
  pointIdx?: number;
  message: string;
  severity: "warn" | "danger";
}

// ── Slope Severity Thresholds ────────────────────────────────

const SLOPE_OK_MAX = 1.5;      // cm/m — white/normal
const SLOPE_WARN_MAX = 3.0;    // cm/m — yellow warning
// above SLOPE_WARN_MAX = red danger

export function slopeSeverity(cmPerM: number): "ok" | "warn" | "danger" {
  const abs = Math.abs(cmPerM);
  if (abs <= SLOPE_OK_MAX) return "ok";
  if (abs <= SLOPE_WARN_MAX) return "warn";
  return "danger";
}

// ── Edge Slope Calculation ───────────────────────────────────

export function calcEdgeSlopes(shape: Shape): EdgeSlope[] {
  const pts = shape.points;
  const heights = shape.heights || pts.map(() => 0);
  const edgeCount = shape.closed ? pts.length : pts.length - 1;
  const slopes: EdgeSlope[] = [];

  for (let i = 0; i < edgeCount; i++) {
    const j = (i + 1) % pts.length;
    const hA = heights[i] ?? 0;
    const hB = heights[j] ?? 0;
    const lengthM = toMeters(distance(pts[i], pts[j]));
    const heightDiff = hB - hA; // in meters
    const slopeCmPerM = lengthM > 0.001 ? Math.abs(heightDiff * 100) / lengthM : 0;
    const direction: "down" | "up" | "flat" = heightDiff < -0.0001 ? "down" : heightDiff > 0.0001 ? "up" : "flat";

    slopes.push({
      edgeIdx: i,
      fromIdx: i,
      toIdx: j,
      heightDiff,
      lengthM,
      slopeCmPerM,
      direction,
      severity: slopeSeverity(slopeCmPerM),
    });
  }

  return slopes;
}

// ── Shape Gradient (overall slope direction) ─────────────────

export function calcShapeGradient(shape: Shape): ShapeGradient | null {
  const pts = shape.points;
  if (!shape.closed || pts.length < 3) return null;
  const heights = shape.heights || pts.map(() => 0);

  // Least-squares plane fit: z = gradX*x + gradY*y + c
  // Solve 2x2 normal equations for (gradX, gradY)
  const n = pts.length;
  let sumX = 0, sumY = 0, sumH = 0, sumXX = 0, sumYY = 0, sumXY = 0, sumXH = 0, sumYH = 0;
  for (let i = 0; i < n; i++) {
    const x = pts[i].x, y = pts[i].y, h = heights[i] ?? 0;
    sumX += x; sumY += y; sumH += h;
    sumXX += x * x; sumYY += y * y; sumXY += x * y;
    sumXH += x * h; sumYH += y * h;
  }
  const Sxx = sumXX - sumX * sumX / n;
  const Syy = sumYY - sumY * sumY / n;
  const Sxy = sumXY - sumX * sumY / n;
  const Sxh = sumXH - sumX * sumH / n;
  const Syh = sumYH - sumY * sumH / n;
  const det = Sxx * Syy - Sxy * Sxy;
  if (Math.abs(det) < 1e-20) return null;
  const gradX = (Syy * Sxh - Sxy * Syh) / det; // dh/dx in meters per pixel
  const gradY = (Sxx * Syh - Sxy * Sxh) / det; // dh/dy in meters per pixel

  // Convert to meters per meter (multiply by PIXELS_PER_METER to get m/m)
  const gradXm = gradX * 80; // PIXELS_PER_METER = 80
  const gradYm = gradY * 80;
  const gradMag = Math.sqrt(gradXm * gradXm + gradYm * gradYm); // m/m (steepest ascent)
  const magnitude = gradMag * 100; // cm/m

  // Steepest descent direction: negate the gradient (ascent → descent)
  const angle = Math.atan2(-gradYm, -gradXm);

  return {
    angle,
    magnitude,
    severity: slopeSeverity(magnitude),
  };
}

// ── Interpolate height at point from shape plane ───────────────


/** Min range 1 cm so small differences still show; intensity scales with shape's actual range. */
const MIN_RANGE_M = 0.01;

/** Niski raster NN — potem bilinear na wysokościach i dopiero h→RGBA (gładsze niż skalowanie gotowych kolorów). */
const GEO_HEATMAP_SAMPLE_MIN = 24;
const GEO_HEATMAP_SAMPLE_MAX = 56;
/** Współczynnik zagęszczenia przed mapowaniem na kolor. */
const GEO_HEATMAP_UPSCALE = 4;
/** Limit wymiaru rastra wyjściowego (px), żeby ogromne bboxy nie rosły bez końca. */
const GEO_HEATMAP_HI_MAX = 256;
const GEO_HEATMAP_BILINEAR_EPS = 1e-9;

let geoHeatmapScratch: HTMLCanvasElement | OffscreenCanvas | null = null;
let geoHeatmapScratchSize = 0;

function getGeoHeatmapScratchCanvas(sample: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D } {
  if (!geoHeatmapScratch || geoHeatmapScratchSize !== sample) {
    if (typeof OffscreenCanvas !== "undefined") {
      geoHeatmapScratch = new OffscreenCanvas(sample, sample);
    } else {
      const c = document.createElement("canvas");
      c.width = sample;
      c.height = sample;
      geoHeatmapScratch = c;
    }
    geoHeatmapScratchSize = sample;
  }
  const ctx = geoHeatmapScratch.getContext("2d");
  if (!ctx) throw new Error("geodesy heatmap scratch");
  return { canvas: geoHeatmapScratch, ctx };
}

/** Intensity 0..1 from position in range. Positive = green, negative = blue. Zero = faded. */
function heightToRgbaBytes(h: number, intensity: number): [number, number, number, number] {
  const alphaF = 0.15 + Math.min(1, intensity) * 0.85;
  const a = Math.round(255 * alphaF);
  if (h < -0.001) {
    const b = Math.round(80 + intensity * 175);
    return [33, 150, b, a];
  }
  if (h > 0.001) {
    const g = Math.round(100 + intensity * 155);
    return [76, g, 80, a];
  }
  return [128, 128, 128, Math.round(255 * 0.2)];
}

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

/** Compute global min/max height across shapes (for unified color scale). */
export function computeGlobalHeightRange(shapes: Shape[], layerFilter: (s: Shape) => boolean): { hMin: number; hMax: number } {
  let hMin = Infinity, hMax = -Infinity;
  for (const shape of shapes) {
    if (!layerFilter(shape) || !shape.closed || shape.points.length < 3) continue;
    const heights = shape.heights || shape.points.map(() => 0);
    for (let i = 0; i < shape.points.length; i++) {
      const h = heights[i] ?? 0;
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
    for (const hp of shape.heightPoints ?? []) {
      if (hp.height < hMin) hMin = hp.height;
      if (hp.height > hMax) hMax = hp.height;
    }
  }
  if (hMin === Infinity) hMin = 0;
  if (hMax === -Infinity) hMax = 0;
  return { hMin, hMax };
}

export interface FillShapeHeightHeatmapOptions {
  /**
   * Interior polygon for bbox + point-in-polygon (e.g. path ribbon outline).
   * Height samples still come from `shape.points` / heightPoints.
   */
  interiorPolygon?: Point[];
}

/** Fill shape with height-based heatmap (geodesy mode). Uses interpolated height at each point — color reflects actual height. globalRange = unified scale across all elements. */
export function fillShapeHeightHeatmap(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  globalRange?: { hMin: number; hMax: number },
  opts?: FillShapeHeightHeatmapOptions,
): void {
  const pts = shape.points;
  if (!shape.closed || pts.length < 3) return;

  let hMin: number, hMax: number;
  if (globalRange) {
    hMin = globalRange.hMin;
    hMax = globalRange.hMax;
  } else {
    hMin = Infinity; hMax = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const h = (shape.heights?.[i] ?? 0);
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
    for (const hp of shape.heightPoints ?? []) {
      if (hp.height < hMin) hMin = hp.height;
      if (hp.height > hMax) hMax = hp.height;
    }
    if (hMin === Infinity) hMin = 0;
    if (hMax === -Infinity) hMax = 0;
  }
  const range = Math.max(hMax - hMin, MIN_RANGE_M);
  const intensityAt = (h: number) => Math.min(1, Math.abs(h - hMin) / range);

  ctx.save();
  ctx.clip();

  // Use effective polygon (with arc sampling) for shapes with curved edges — otherwise pointInPolygon
  // would use the chord and exclude the area between chord and arc (black field).
  // Path ribbons: pass outline as interiorPolygon — centerline stays in `shape` for heights / NN.
  const interior = opts?.interiorPolygon;
  const polygonForTest =
    interior && interior.length >= 3
      ? interior
      : shape.edgeArcs?.some(a => a && a.length > 0)
        ? getEffectivePolygon(shape)
        : pts;

  if (polygonForTest.length < 3) {
    ctx.restore();
    return;
  }

  const sOrigin = worldToScreen(0, 0);
  const sUnitX = worldToScreen(1, 0);
  const sUnitY = worldToScreen(0, 1);
  const scaleX = sUnitX.x - sOrigin.x;
  const scaleY = sUnitY.y - sOrigin.y;
  const invScaleX = Math.abs(scaleX) < 1e-12 ? 1e-12 : scaleX;
  const invScaleY = Math.abs(scaleY) < 1e-12 ? 1e-12 : scaleY;

  let minSx = Infinity;
  let maxSx = -Infinity;
  let minSy = Infinity;
  let maxSy = -Infinity;
  for (const p of polygonForTest) {
    const s = worldToScreen(p.x, p.y);
    minSx = Math.min(minSx, s.x);
    maxSx = Math.max(maxSx, s.x);
    minSy = Math.min(minSy, s.y);
    maxSy = Math.max(maxSy, s.y);
  }
  const destW = Math.max(1, maxSx - minSx);
  const destH = Math.max(1, maxSy - minSy);
  const loRes = Math.min(
    GEO_HEATMAP_SAMPLE_MAX,
    Math.max(GEO_HEATMAP_SAMPLE_MIN, Math.ceil(Math.max(destW, destH) / 6)),
  );
  const hiDim = Math.min(GEO_HEATMAP_HI_MAX, loRes * GEO_HEATMAP_UPSCALE);

  const nnSamples = buildNNSamples(shape);
  const delaunay = buildDelaunay(nnSamples);
  const idwSamples = buildIDWSamples(shape);
  const walkCtx = { lastTriangle: 0 };

  const heightGrid = new Float32Array(loRes * loRes);
  const maskGrid = new Uint8Array(loRes * loRes);

  for (let j = 0; j < loRes; j++) {
    for (let i = 0; i < loRes; i++) {
      const sx = minSx + ((i + 0.5) / loRes) * (maxSx - minSx);
      const sy = minSy + ((j + 0.5) / loRes) * (maxSy - minSy);
      const wx = (sx - sOrigin.x) / invScaleX;
      const wy = (sy - sOrigin.y) / invScaleY;
      const cell = j * loRes + i;
      if (!pointInPolygon({ x: wx, y: wy }, polygonForTest)) continue;

      const h = interpolateNN(wx, wy, delaunay, { walkCtx, idwSamples });
      if (h === null) continue;

      heightGrid[cell] = h;
      maskGrid[cell] = 1;
    }
  }

  const { canvas, ctx: tctx } = getGeoHeatmapScratchCanvas(hiDim);
  const img = tctx.createImageData(hiDim, hiDim);
  const pix = img.data;

  const at = (row: number, col: number) => row * loRes + col;

  for (let jj = 0; jj < hiDim; jj++) {
    for (let ii = 0; ii < hiDim; ii++) {
      const o = (jj * hiDim + ii) * 4;
      const gx = Math.min(Math.max(((ii + 0.5) / hiDim) * loRes - 0.5, 0), loRes - 1);
      const gy = Math.min(Math.max(((jj + 0.5) / hiDim) * loRes - 0.5, 0), loRes - 1);
      const i0 = Math.floor(gx);
      const i1 = Math.min(i0 + 1, loRes - 1);
      const j0 = Math.floor(gy);
      const j1 = Math.min(j0 + 1, loRes - 1);
      const fx = gx - i0;
      const fy = gy - j0;

      const m00 = maskGrid[at(j0, i0)];
      const m10 = maskGrid[at(j0, i1)];
      const m01 = maskGrid[at(j1, i0)];
      const m11 = maskGrid[at(j1, i1)];

      const w00 = (1 - fx) * (1 - fy) * m00;
      const w10 = fx * (1 - fy) * m10;
      const w01 = (1 - fx) * fy * m01;
      const w11 = fx * fy * m11;
      const wsum = w00 + w10 + w01 + w11;

      if (wsum < GEO_HEATMAP_BILINEAR_EPS) {
        pix[o] = 0;
        pix[o + 1] = 0;
        pix[o + 2] = 0;
        pix[o + 3] = 0;
        continue;
      }

      const h00 = heightGrid[at(j0, i0)];
      const h10 = heightGrid[at(j0, i1)];
      const h01 = heightGrid[at(j1, i0)];
      const h11 = heightGrid[at(j1, i1)];
      const hBlend = (w00 * h00 + w10 * h10 + w01 * h01 + w11 * h11) / wsum;
      const [r, g, b, a] = heightToRgbaBytes(hBlend, intensityAt(hBlend));
      pix[o] = r;
      pix[o + 1] = g;
      pix[o + 2] = b;
      pix[o + 3] = a;
    }
  }

  tctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas as CanvasImageSource, 0, 0, hiDim, hiDim, minSx, minSy, destW, destH);
  ctx.restore();
}

const EDGE_SAMPLES = 10;

/** NN samples: vertices + heightPoints only (no edge samples — avoids collinearity in Delaunay). */
function buildNNSamples(shape: Shape): { x: number; y: number; h: number }[] {
  const pts = shape.points;
  const heights = shape.heights || pts.map(() => 0);
  const samples: { x: number; y: number; h: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    samples.push({ x: pts[i].x, y: pts[i].y, h: heights[i] ?? 0 });
  }
  for (const hp of shape.heightPoints ?? []) {
    samples.push({ x: hp.x, y: hp.y, h: hp.height });
  }
  return samples;
}

function buildIDWSamples(shape: Shape): { x: number; y: number; h: number }[] {
  const pts = shape.points;
  const heights = shape.heights || pts.map(() => 0);
  const samples: { x: number; y: number; h: number }[] = [];
  // Vertex samples
  for (let i = 0; i < pts.length; i++) {
    samples.push({ x: pts[i].x, y: pts[i].y, h: heights[i] ?? 0 });
  }
  // Edge samples: linearly interpolated between endpoints
  const edgeCount = shape.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    const j = (i + 1) % pts.length;
    const hA = heights[i] ?? 0, hB = heights[j] ?? 0;
    for (let s = 1; s < EDGE_SAMPLES; s++) {
      const t = s / EDGE_SAMPLES;
      samples.push({
        x: pts[i].x + t * (pts[j].x - pts[i].x),
        y: pts[i].y + t * (pts[j].y - pts[i].y),
        h: hA + t * (hB - hA),
      });
    }
  }
  // HeightPoints
  for (const hp of shape.heightPoints ?? []) {
    samples.push({ x: hp.x, y: hp.y, h: hp.height });
  }
  return samples;
}

/** Interpolate height at (x,y) using Natural Neighbor (Sibson). Fallback to IDW when P is outside hull. */
// TODO: cache Delaunay per shape (invalidate on heights/points change) — istotne przy sync L1→L2 wielu punktów
export function interpolateHeightAtPoint(shape: Shape, pt: Point): number | null {
  const pts = shape.points;
  if (!shape.closed || pts.length < 3) return null;
  const nnSamples = buildNNSamples(shape);
  const delaunay = buildDelaunay(nnSamples);
  const idwSamples = buildIDWSamples(shape);
  return interpolateNN(pt.x, pt.y, delaunay, { idwSamples });
}

/** Cached height interpolation for Garden — build once, reuse for many points. */
export interface HeightInterpolationCache {
  delaunay: DelaunayResult;
  idwSamples: { x: number; y: number; h: number }[];
}

export function buildHeightInterpolationCache(shape: Shape): HeightInterpolationCache | null {
  if (!shape.closed || shape.points.length < 3) return null;
  const nnSamples = buildNNSamples(shape);
  const delaunay = buildDelaunay(nnSamples);
  const idwSamples = buildIDWSamples(shape);
  return { delaunay, idwSamples };
}

export function interpolateHeightCached(cache: HeightInterpolationCache, pt: Point): number | null {
  return interpolateNN(pt.x, pt.y, cache.delaunay, { idwSamples: cache.idwSamples });
}

// ── Design slope points (Layer 2 target grades, anchored to Layer 1 outline) ──

/** World position of a design slope control — follows L1 vertex or edge as the garden outline edits. */
export function resolveDesignSlopeWorldPosition(p: DesignSlopePoint, shapes: Shape[]): Point {
  const sh = shapes[p.sourceShapeIdx];
  if (!sh || sh.layer !== 1) return { x: p.x, y: p.y };
  if (p.pointIdx != null && p.pointIdx >= 0 && p.pointIdx < sh.points.length) {
    const pt = sh.points[p.pointIdx]!;
    return { x: pt.x, y: pt.y };
  }
  if (p.edgeIdx != null) {
    const pts = sh.points;
    const ec = sh.closed ? pts.length : Math.max(0, pts.length - 1);
    if (ec < 1 || pts.length < 2) return { x: p.x, y: p.y };
    const ei = ((p.edgeIdx % ec) + ec) % ec;
    const j = (ei + 1) % pts.length;
    const A = pts[ei]!;
    const B = pts[j]!;
    const t = Math.max(0, Math.min(1, p.edgeT ?? 0));
    return { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) };
  }
  return { x: p.x, y: p.y };
}

function samplesFromDesignSlopePoints(
  designSlopePoints: DesignSlopePoint[],
  shapes: Shape[],
): { x: number; y: number; h: number }[] {
  return designSlopePoints.map(d => {
    const w = resolveDesignSlopeWorldPosition(d, shapes);
    return { x: w.x, y: w.y, h: d.height };
  });
}

/** Interpolation from project design slope controls only (natural neighbor + IDW fallback). */
export function buildHeightInterpolationCacheFromDesignSlopes(
  designSlopePoints: DesignSlopePoint[],
  shapes: Shape[],
): HeightInterpolationCache | null {
  if (designSlopePoints.length === 0) return null;
  const nnSamples = samplesFromDesignSlopePoints(designSlopePoints, shapes);
  const delaunay = buildDelaunay(nnSamples);
  const idwSamples = nnSamples.map(sObject => ({ x: sObject.x, y: sObject.y, h: sObject.h }));
  return { delaunay, idwSamples };
}

export interface PropagateDesignSlopesResult {
  /** New `shapes` when any L2 height changed; otherwise `null` (keep previous reference). */
  nextShapes: Shape[] | null;
  /** When L1 outline moved anchors — snap stored `x,y` on design points; `null` if unchanged. */
  nextDesignSlopePoints: DesignSlopePoint[] | null;
}

/**
 * Apply interpolated heights to all Layer 2 vertices that are not marked `heightManualOverride`.
 * When `designSlopePoints` is empty, non-overridden L2 heights are reset to 0.
 */
export function propagateDesignSlopesToLayer2(
  shapes: Shape[],
  designSlopePoints: DesignSlopePoint[],
): PropagateDesignSlopesResult {
  const updatedDsp = designSlopePoints.map(d => {
    const w = resolveDesignSlopeWorldPosition(d, shapes);
    if (Math.abs(w.x - d.x) < 1e-9 && Math.abs(w.y - d.y) < 1e-9) return d;
    return { ...d, x: w.x, y: w.y };
  });
  const dspMoved = updatedDsp.some(
    (d, i) =>
      d.x !== designSlopePoints[i]?.x ||
      d.y !== designSlopePoints[i]?.y,
  );

  if (updatedDsp.length === 0) {
    let heightsChanged = false;
    const next = shapes.map(s => {
      if (s.layer !== 2 || s.removedFromCanvas) return s;
      const ov = s.heightManualOverride;
      const pts = s.points;
      const base = s.heights ?? pts.map(() => 0);
      const nh = base.map((h, i) => (ov?.[i] ? h : 0));
      if (nh.every((h, i) => Math.abs(h - (base[i] ?? 0)) < 1e-12)) return s;
      heightsChanged = true;
      return { ...s, heights: nh };
    });
    return {
      nextShapes: heightsChanged ? next : null,
      nextDesignSlopePoints: null,
    };
  }

  const cache = buildHeightInterpolationCacheFromDesignSlopes(updatedDsp, shapes);

  let heightsChanged = false;
  const next = shapes.map(shape => {
    if (shape.layer !== 2 || shape.removedFromCanvas) return shape;
    if (!cache) return shape;
    const override = shape.heightManualOverride;
    const pts = shape.points;
    const baseHeights = shape.heights ?? pts.map(() => 0);
    const nh = [...baseHeights];
    while (nh.length < pts.length) nh.push(0);
    let shapeChanged = false;
    for (let i = 0; i < pts.length; i++) {
      if (override?.[i]) continue;
      const h = interpolateHeightCached(cache, pts[i]!);
      if (h == null) continue;
      if (Math.abs((nh[i] ?? 0) - h) > 1e-9) {
        nh[i] = h;
        shapeChanged = true;
      }
    }
    if (!shapeChanged) return shape;
    heightsChanged = true;
    return { ...shape, heights: nh };
  });

  return {
    nextShapes: heightsChanged ? next : null,
    nextDesignSlopePoints: dspMoved ? updatedDsp : null,
  };
}

// ── Validation / Warnings ────────────────────────────────────

export function validateSlopes(shapes: Shape[]): SlopeWarning[] {
  const warnings: SlopeWarning[] = [];

  for (let si = 0; si < shapes.length; si++) {
    const shape = shapes[si];
    if (!shape.closed || shape.points.length < 3) continue;
    const slopes = calcEdgeSlopes(shape);

    // Check steep slopes
    for (const slope of slopes) {
      if (slope.severity === "danger") {
        warnings.push({
          type: "steep",
          shapeIdx: si,
          edgeIdx: slope.edgeIdx,
          message: `Spadek ${slope.slopeCmPerM.toFixed(1)} cm/m — bardzo stromy!`,
          severity: "danger",
        });
      } else if (slope.severity === "warn") {
        warnings.push({
          type: "steep",
          shapeIdx: si,
          edgeIdx: slope.edgeIdx,
          message: `Spadek ${slope.slopeCmPerM.toFixed(1)} cm/m — uwaga`,
          severity: "warn",
        });
      }
    }

    // Check for height mismatches at shared points between shapes
    // (points at the same location but different heights)
    for (let sj = si + 1; sj < shapes.length; sj++) {
      const other = shapes[sj];
      if (!other.closed || other.points.length < 3) continue;
      const hA = shape.heights || shape.points.map(() => 0);
      const hB = other.heights || other.points.map(() => 0);

      for (let pi = 0; pi < shape.points.length; pi++) {
        for (let pj = 0; pj < other.points.length; pj++) {
          const d = distance(shape.points[pi], other.points[pj]);
          if (d < 1) { // same point (within 1px)
            const diff = Math.abs((hA[pi] ?? 0) - (hB[pj] ?? 0));
            if (diff > 0.001) {
              warnings.push({
                type: "mismatch",
                shapeIdx: si,
                pointIdx: pi,
                message: `Height difference ${(diff * 100).toFixed(1)}cm with adjacent shape`,
                severity: diff > 0.03 ? "danger" : "warn", // >3cm = danger
              });
            }
          }
        }
      }
    }
  }

  return warnings;
}

// ── Slope Color ──────────────────────────────────────────────

export function slopeColor(severity: "ok" | "warn" | "danger"): string {
  switch (severity) {
    case "ok": return "#e0e0e0";      // white/light
    case "warn": return "#ffc832";    // yellow
    case "danger": return "#ff4444";  // red
  }
}

// ── Slope Label Formatter ────────────────────────────────────

export function formatSlope(slope: EdgeSlope, includeArrowSymbol = false): string {
  if (slope.direction === "flat") return "0 cm/m";
  const arrow = includeArrowSymbol ? (slope.direction === "down" ? "↘ " : "↗ ") : "";
  return `${arrow}${slope.slopeCmPerM.toFixed(1)} cm/m`;
}

// ── Reference Point (zero level marker) ──────────────────────

export interface RefPoint {
  shapeIdx: number;
  pointIdx: number;
  description: string;
}