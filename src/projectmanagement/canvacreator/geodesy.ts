// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — geodesy.ts
// Slope calculations, validation, gradient arrows
// ══════════════════════════════════════════════════════════════

import { Shape, Point, distance, toMeters, pointInPolygon } from "./geometry";
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

/** Intensity 0..1 from position in range. Positive = green, negative = blue. Zero = faded. */
function heightToColor(h: number, intensity: number): string {
  const alpha = 0.15 + Math.min(1, intensity) * 0.85;
  if (h < -0.001) {
    const b = Math.round(80 + intensity * 175);
    return `rgba(33, 150, ${b}, ${alpha})`;
  }
  if (h > 0.001) {
    const g = Math.round(100 + intensity * 155);
    return `rgba(76, ${g}, 80, ${alpha})`;
  }
  return "rgba(128, 128, 128, 0.2)";
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

/** Fill shape with height-based heatmap (geodesy mode). Uses interpolated height at each point — color reflects actual height. globalRange = unified scale across all elements. */
export function fillShapeHeightHeatmap(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  globalRange?: { hMin: number; hMax: number }
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

  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const CELLS = 60;
  const dx = (maxX - minX) / CELLS || 0.01;
  const dy = (maxY - minY) / CELLS || 0.01;
  const nnSamples = buildNNSamples(shape);
  const delaunay = buildDelaunay(nnSamples);
  const idwSamples = buildIDWSamples(shape);
  const walkCtx = { lastTriangle: 0 };
  for (let i = 0; i < CELLS; i++) {
    for (let j = 0; j < CELLS; j++) {
      const cx = minX + (maxX - minX) * (i + 0.5) / CELLS;
      const cy = minY + (maxY - minY) * (j + 0.5) / CELLS;
      if (!pointInPolygon({ x: cx, y: cy }, pts)) continue;
      const h = interpolateNN(cx, cy, delaunay, { walkCtx, idwSamples });
      if (h === null) continue;
      const x0 = minX + (maxX - minX) * i / CELLS;
      const y0 = minY + (maxY - minY) * j / CELLS;
      const s0 = worldToScreen(x0, y0);
      const s1 = worldToScreen(x0 + dx, y0 + dy);
      const cw = Math.max(2, s1.x - s0.x + 1);
      const ch = Math.max(2, s1.y - s0.y + 1);
      ctx.fillStyle = heightToColor(h, intensityAt(h));
      ctx.fillRect(s0.x, s0.y, cw, ch);
    }
  }
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