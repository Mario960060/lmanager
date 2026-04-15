// ══════════════════════════════════════════════════════════════
// Heatmap for excavation / preparation (Natural Neighbor + clip)
// ══════════════════════════════════════════════════════════════

import { Shape, Point, pointInPolygon } from "./geometry";
import { getEffectivePolygon } from "./arcMath";
import { buildDelaunay } from "./delaunay";
import { interpolateNN } from "./naturalNeighbor";
import {
  getPathPolygon,
  isPathElement,
  getPolygonLinearOutline,
  isPolygonLinearElement,
} from "./linearElements";
import {
  getExcavationCmAtVertex,
  getPreparationCmAtVertex,
} from "./excavation";
import { excavationDepthToRgbaBytes, preparationToRgbaBytes } from "./excavationColors";

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

const EDGE_SAMPLES = 10;
const MIN_RANGE = 0.01;
/** Low-res raster; scaled with smoothing — no visible cell grid, one draw per shape. */
const SAMPLE_MIN = 24;
const SAMPLE_MAX = 56;

let scratchCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
let scratchSize = 0;

function getScratchCanvas(sample: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D } {
  if (!scratchCanvas || scratchSize !== sample) {
    if (typeof OffscreenCanvas !== "undefined") {
      scratchCanvas = new OffscreenCanvas(sample, sample);
    } else {
      const c = document.createElement("canvas");
      c.width = sample;
      c.height = sample;
      scratchCanvas = c;
    }
    scratchSize = sample;
  }
  const ctx = scratchCanvas.getContext("2d");
  if (!ctx) throw new Error("heatmap scratch canvas");
  return { canvas: scratchCanvas, ctx };
}

function getOutlinePolygon(shape: Shape): Point[] {
  if (isPolygonLinearElement(shape)) {
    const o = getPolygonLinearOutline(shape);
    if (o.length >= 3) return o;
  }
  if (isPathElement(shape) && shape.closed) {
    const p = getPathPolygon(shape);
    if (p.length >= 3) return p;
  }
  return shape.points;
}

function buildCmSamples(shape: Shape, mode: "excavation" | "preparation"): { x: number; y: number; h: number }[] {
  const pts = shape.points;
  const samples: { x: number; y: number; h: number }[] = [];
  const getV = mode === "excavation" ? getExcavationCmAtVertex : getPreparationCmAtVertex;
  for (let i = 0; i < pts.length; i++) {
    const v = getV(shape, i);
    if (v == null) continue;
    samples.push({ x: pts[i].x, y: pts[i].y, h: v });
  }
  return samples;
}

function buildIdwCmSamples(shape: Shape, mode: "excavation" | "preparation"): { x: number; y: number; h: number }[] {
  const pts = shape.points;
  const getV = mode === "excavation" ? getExcavationCmAtVertex : getPreparationCmAtVertex;
  const samples: { x: number; y: number; h: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const v = getV(shape, i);
    if (v == null) continue;
    samples.push({ x: pts[i].x, y: pts[i].y, h: v });
  }
  const edgeCount = shape.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    const j = (i + 1) % pts.length;
    const hA = getV(shape, i);
    const hB = getV(shape, j);
    if (hA == null || hB == null) continue;
    for (let s = 1; s < EDGE_SAMPLES; s++) {
      const t = s / EDGE_SAMPLES;
      samples.push({
        x: pts[i].x + t * (pts[j].x - pts[i].x),
        y: pts[i].y + t * (pts[j].y - pts[i].y),
        h: hA + t * (hB - hA),
      });
    }
  }
  return samples;
}

export function shapeHasExcavationOrPrepData(shape: Shape, mode: "excavation" | "preparation"): boolean {
  const n = shape.points.length;
  const getV = mode === "excavation" ? getExcavationCmAtVertex : getPreparationCmAtVertex;
  for (let i = 0; i < n; i++) {
    if (getV(shape, i) != null) return true;
  }
  return false;
}

export function fillShapeExcavationPrepHeatmap(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  mode: "excavation" | "preparation",
  globalRange: { min: number; max: number },
): void {
  const pts = shape.points;
  if (!shape.closed || pts.length < 3) return;

  const nnSamples = buildCmSamples(shape, mode);
  if (nnSamples.length < 2) return;

  const idwSamples = buildIdwCmSamples(shape, mode);
  if (idwSamples.length < 2) return;

  const delaunay = buildDelaunay(nnSamples);
  const walkCtx = { lastTriangle: 0 };

  const minVal = globalRange.min;
  const maxVal = globalRange.max;
  const rgbaAt = (val: number) =>
    mode === "excavation"
      ? excavationDepthToRgbaBytes(val, minVal, maxVal)
      : preparationToRgbaBytes(val, minVal, maxVal);

  ctx.save();
  ctx.clip();

  const polygonForTest = shape.edgeArcs?.some(a => a && a.length > 0)
    ? getEffectivePolygon(shape)
    : getOutlinePolygon(shape);

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
  const sample = Math.min(
    SAMPLE_MAX,
    Math.max(SAMPLE_MIN, Math.ceil(Math.max(destW, destH) / 6)),
  );

  const { canvas, ctx: tctx } = getScratchCanvas(sample);
  const img = tctx.createImageData(sample, sample);
  const data = img.data;

  for (let j = 0; j < sample; j++) {
    for (let i = 0; i < sample; i++) {
      const sx = minSx + ((i + 0.5) / sample) * (maxSx - minSx);
      const sy = minSy + ((j + 0.5) / sample) * (maxSy - minSy);
      const wx = (sx - sOrigin.x) / invScaleX;
      const wy = (sy - sOrigin.y) / invScaleY;
      const o = (j * sample + i) * 4;
      if (!pointInPolygon({ x: wx, y: wy }, polygonForTest)) {
        data[o] = 0;
        data[o + 1] = 0;
        data[o + 2] = 0;
        data[o + 3] = 0;
        continue;
      }
      const h = interpolateNN(wx, wy, delaunay, { walkCtx, idwSamples });
      if (h === null) {
        data[o] = 0;
        data[o + 1] = 0;
        data[o + 2] = 0;
        data[o + 3] = 0;
        continue;
      }
      const [r, g, b, a] = rgbaAt(h);
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    }
  }

  tctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas as CanvasImageSource, 0, 0, sample, sample, minSx, minSy, destW, destH);
  ctx.restore();
}
