// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — visualization/cobblestonePattern.ts
// Cobblestone (monoblock) pattern rendering — 20×10 cm blocks, 1mm joint
// ══════════════════════════════════════════════════════════════

import polygonClipping from "polygon-clipping";
import type { Polygon } from "polygon-clipping";
import { Point, Shape, toPixels, toMeters, labelAnchorInsidePolygon, areaM2 } from "../geometry";
import { scaledFontSize } from "../canvasRenderers";
import { getEffectivePolygon, getEffectivePolygonWithEdgeIndices, sampleArcEdgeForFrame } from "../arcMath";
import { isPathElement, getPathPolygon } from "../linearElements";
import {
  shrinkPolygon,
  rectPolygonIntersectionArea,
  rectPolygonIntersection,
  computeWastePolygon,
  polygonBboxCm,
  polygonFitsInPolygonWithRotation,
  collectCutOperationsFromDemand,
  vizDirectionToPatternAngleRad,
  patternOriginOnOutline,
  applyFrameInsetShrinkPolygon,
  getFrameBorderRowsFromInputs,
  appendWorldPolygonToPath,
  pathCobbleGridStride,
  herringbone45CornersAtCell,
  herringbonePolygonIjIndexBounds,
  type CutInfo,
} from "./slabPattern";
import {
  getMonoblockMixById,
  defaultMonoblockMixEnabled,
  type MonoblockMixDefinition,
  type MonoblockMixPieceKey,
} from "./monoblockMix";

/** Kostka-only: rect∩polygon with polygon-clipping fallback when Sutherland-Hodgman returns [] (concave/curved shapes). */
function rectPolygonIntersectionKostka(corners: Point[], polygon: Point[]): Point[] {
  const result = rectPolygonIntersection(corners, polygon);
  if (result.length >= 3) return result;
  if (polygon.length < 3) return [];
  try {
    const rectPoly: Polygon = [corners.map(p => [p.x, p.y])];
    const shapePoly: Polygon = [polygon.map(p => [p.x, p.y])];
    const inter = polygonClipping.intersection(rectPoly, shapePoly);
    for (const poly of inter) {
      if (poly.length > 0 && poly[0].length >= 3) {
        return poly[0].map(([x, y]) => ({ x, y }));
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

const BLOCK_COLOR = "#9B5C3A";   // rudawobrąz (cobblestone) — odróżnienie od szarych płyt
const FRAME_COLOR = "#4a6fa5";
const BLOCK_CUT_COLOR = "#B8866B";   // jaśniejsza ruda dla cięć
const BLOCK_SMALL_CUT_COLOR = "#e74c3c";
const BLOCK_WASTE_REUSED_COLOR = "#27ae60";
const JOINT_COLOR = "#4a5568";

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
  for (const corner of corners) {
    if (!pointInPolygon(corner, polygon)) return false;
  }
  return true;
}

function segmentIntersection(a: Point, b: Point, p: Point, q: Point): number | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dpx = q.x - p.x, dpy = q.y - p.y;
  const denom = dx * dpy - dy * dpx;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((p.x - a.x) * dpy - (p.y - a.y) * dpx) / denom;
  if (t < 0 || t > 1) return null;
  const s = ((a.x - p.x) * dy - (a.y - p.y) * dx) / -denom;
  if (s < 0 || s > 1) return null;
  return t;
}

function fitsWithRotation(waste: { w: number; l: number }, demand: { w: number; l: number }): boolean {
  return (waste.w >= demand.w && waste.l >= demand.l) || (waste.w >= demand.l && waste.l >= demand.w);
}

const MIN_MIX_STEP_CM = 5;

function getMixEnabledLengthsCm(
  mix: MonoblockMixDefinition,
  enabledMap: Partial<Record<MonoblockMixPieceKey, boolean>> | undefined
): number[] {
  const def = defaultMonoblockMixEnabled();
  const merged = { ...def, ...enabledMap };
  const lengths = mix.pieces.filter((p) => merged[p.key] !== false).map((p) => p.lengthCm);
  return [...new Set(lengths)].sort((a, b) => b - a);
}

function buildMixBlockCorners(
  cx: number,
  cy: number,
  lengthPx: number,
  rowWidthPx: number,
  dir: Point,
  perp: Point
): Point[] {
  return [
    { x: cx, y: cy },
    { x: cx + lengthPx * dir.x, y: cy + lengthPx * dir.y },
    { x: cx + lengthPx * dir.x + rowWidthPx * perp.x, y: cy + lengthPx * dir.y + rowWidthPx * perp.y },
    { x: cx + rowWidthPx * perp.x, y: cy + rowWidthPx * perp.y },
  ];
}

/**
 * Mixed monoblock sizes (same row width), staggered every other row so joints do not align.
 */
function drawMonoblockMixPattern(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  pts: Point[],
  origin: Point,
  dir: Point,
  perp: Point,
  jointPx: number,
  mix: MonoblockMixDefinition,
  enabledLengthsCm: number[],
  worldToScreen: WorldToScreen,
  zoom: number,
  showCuts: boolean,
  inputs: Record<string, any>,
  polygonForIntersection: Point[],
  hasArcs: boolean,
  useNormalColorsForCuts?: boolean
): void {
  if (enabledLengthsCm.length === 0) return;

  const rowWidthPx = toPixels(mix.rowWidthCm / 100);
  const staggerPx = toPixels(mix.staggerAlongCm / 100);
  const minStepPx = toPixels(MIN_MIX_STEP_CM / 100);
  const stepWidth = rowWidthPx + jointPx;
  const origPts = shape.points;

  let maxAlongDir = 0;
  let maxAlongPerp = 0;
  for (const p of pts) {
    const dDir = Math.abs((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y);
    const dPerp = Math.abs((p.x - origin.x) * perp.x + (p.y - origin.y) * perp.y);
    if (dDir > maxAlongDir) maxAlongDir = dDir;
    if (dPerp > maxAlongPerp) maxAlongPerp = dPerp;
  }
  const extendR = Math.ceil(maxAlongPerp / stepWidth) + 2;
  const extendAlong = Math.ceil(maxAlongDir / minStepPx) + 20;
  const EXTEND_CAP = 100;
  const extendRClamped = Math.min(Math.max(extendR, 10), EXTEND_CAP);

  const vizWaste = shape.calculatorInputs?.vizWasteSatisfied;
  const wasteSatisfiedSet = new Set<string>(
    Array.isArray(vizWaste) ? vizWaste : (typeof vizWaste === "string" && vizWaste ? [vizWaste] : [])
  );

  const countOrigVertsInSlab = (corners: Point[]): number => {
    let n = 0;
    for (const v of origPts) if (pointInOrOnPolygon(v, corners)) n++;
    return n;
  };

  const cornersInsideCount = (corners: Point[], polygon: Point[]): number => {
    let n = 0;
    for (const c of corners) if (pointInOrOnPolygon(c, polygon)) n++;
    return n;
  };

  let fullCount = 0;
  let cutCount = 0;
  let segCounter = 0;

  const drawBlock = (corners: Point[], isCut: boolean, rowKey: number, segKey: number, pieceAreaPx2: number) => {
    if (!rectIntersectsPolygon(corners, pts)) return;
    if (isCut && !showCuts) return;
    if (isCut) cutCount++;
    else fullCount++;

    const key = `m${rowKey},${segKey}`;
    const isWasteReused = isCut && wasteSatisfiedSet.has(key);
    const vertsInSlab = hasArcs ? countOrigVertsInSlab(corners) : 4;
    const usedAreaOrig = rectPolygonIntersectionArea(corners, polygonForIntersection);
    const usedAreaPts = hasArcs ? rectPolygonIntersectionArea(corners, pts) : usedAreaOrig;
    const usedArea = Math.max(usedAreaOrig, usedAreaPts);
    const isSmallCut = isCut && !isWasteReused && usedArea < 0.15 * pieceAreaPx2 && !(hasArcs && vertsInSlab <= 2);

    const s0 = worldToScreen(corners[0].x, corners[0].y);
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < corners.length; i++) {
      const s = worldToScreen(corners[i].x, corners[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    ctx.fillStyle = isCut
      ? (useNormalColorsForCuts ? BLOCK_COLOR : (isWasteReused ? BLOCK_WASTE_REUSED_COLOR : (isSmallCut ? BLOCK_SMALL_CUT_COLOR : BLOCK_CUT_COLOR)))
      : BLOCK_COLOR;
    ctx.fill();
    ctx.strokeStyle = JOINT_COLOR;
    ctx.lineWidth = Math.max(0.5, jointPx);
    ctx.stroke();

    if (isCut) {
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  for (let r = -extendRClamped; r <= extendRClamped; r++) {
    const rowStagger = (r % 2 !== 0 ? 1 : 0) * staggerPx;
    let posAlong = -maxAlongDir - extendAlong + rowStagger;
    const endAlong = maxAlongDir + extendAlong;

    while (posAlong < endAlong) {
      const cx = origin.x + posAlong * dir.x + r * stepWidth * perp.x;
      const cy = origin.y + posAlong * dir.y + r * stepWidth * perp.y;

      let placed = false;
      for (const Lcm of enabledLengthsCm) {
        const lenPx = toPixels(Lcm / 100);
        const corners = buildMixBlockCorners(cx, cy, lenPx, rowWidthPx, dir, perp);
        const fullyInside = rectFullyInsidePolygon(corners, pts);
        const intersects = rectIntersectsPolygon(corners, pts);
        if (!fullyInside && !intersects) continue;
        const cornersInside = cornersInsideCount(corners, pts);
        const hasIntersectionArea = rectPolygonIntersectionArea(corners, pts) > 1e-20;
        if (!fullyInside && cornersInside === 0 && !hasIntersectionArea && !intersects) continue;

        const pieceAreaPx2 = lenPx * rowWidthPx;
        drawBlock(corners, !fullyInside, r, segCounter, pieceAreaPx2);
        posAlong += lenPx + jointPx;
        placed = true;
        segCounter++;
        break;
      }
      if (!placed) posAlong += minStepPx;
    }
  }

  const total = fullCount + cutCount;
  const wasteAreaCm2 = Number(inputs?.vizWasteAreaCm2 ?? 0);
  const reusedAreaCm2 = Number(inputs?.vizReusedAreaCm2 ?? 0);
  const actualWasteCm2 = Math.max(0, wasteAreaCm2 - reusedAreaCm2);
  const avgPieceCm2 = mix.pieces.reduce((s, p) => s + p.lengthCm * p.widthCm, 0) / Math.max(1, mix.pieces.length);
  const wastePct = total > 0 && avgPieceCm2 > 0
    ? Math.round((actualWasteCm2 / (total * avgPieceCm2)) * 100)
    : (total > 0 ? Math.round((cutCount / total) * 100) : 0);
  const blocksForCuts = Math.max(0, cutCount - wasteSatisfiedSet.size);
  if (total > 0) {
    const anchor = labelAnchorInsidePolygon(pts);
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
        blocksForCuts > 0 ? `${fullCount} full, ${cutCount} cut (from ${blocksForCuts} blocks)` : `${fullCount} full, ${cutCount} cut`,
        sc.x,
        sc.y + lineHeight * 0.5,
      );
    } else {
      let line = 0.5;
      const area = areaM2(getEffectivePolygon(shape));
      ctx.fillText(area.toFixed(2) + " m²", sc.x, sc.y + lineHeight * line);
      line += 1;
      ctx.fillText(blocksForCuts > 0 ? `${fullCount} full, ${cutCount} cut (from ${blocksForCuts} blocks)` : `${fullCount} full, ${cutCount} cut`, sc.x, sc.y + lineHeight * line);
      line += 1;
      ctx.fillText(`~${wastePct}% waste`, sc.x, sc.y + lineHeight * line);
    }
  }
}

/**
 * Draw cobblestone (monoblock) pattern on a polygon shape.
 * Blocks 20×10 cm, joint 1mm (thin line in render).
 */
export function drawCobblestonePattern(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  zoom: number,
  showCuts: boolean = true,
  originOffset?: { x: number; y: number },
  directionDegOverride?: number,
  useNormalColorsForCuts?: boolean,
  pathPatternLongOffsetMOverride?: number
): void {
  const inputs = shape.calculatorInputs;
  const blockWidthCm = Number(inputs?.blockWidthCm ?? 20);
  const blockLengthCm = Number(inputs?.blockLengthCm ?? 10);
  const jointGapMm = Number(inputs?.jointGapMm ?? 1);

  const { points: ptsRaw, edgeIndices } = getEffectivePolygonWithEdgeIndices(shape);
  let pts = ptsRaw;
  if (pts.length < 3 || !shape.closed) return;

  const origPts = shape.points;

  const addFrameToMonoblock = !!(inputs?.addFrameToMonoblock);
  const framePieceWidthCm = Number(inputs?.framePieceWidthCm ?? 0);
  const frameSidesEnabled = inputs?.frameSidesEnabled as boolean[] | undefined;
  const frameRowWidthsCm = getFrameBorderRowsFromInputs(inputs).map((r) => r.widthCm).filter((w) => w > 0);
  if (addFrameToMonoblock && frameRowWidthsCm.length > 0) {
    const shrunk = applyFrameInsetShrinkPolygon(pts, edgeIndices, frameSidesEnabled, frameRowWidthsCm);
    if (shrunk.length >= 3) pts = shrunk;
    else return;
  }

  const blockWidthPx = toPixels(blockWidthCm / 100);
  const blockLengthPx = toPixels(blockLengthCm / 100);
  const jointPx = toPixels(jointGapMm / 1000);

  const directionDeg = directionDegOverride ?? Number(inputs?.vizDirection ?? 0);
  const startCorner = Math.max(0, Math.min(origPts.length - 1, Math.floor(Number(inputs?.vizStartCorner ?? 0))));
  const off = originOffset ?? { x: Number(inputs?.vizOriginOffsetX ?? 0), y: Number(inputs?.vizOriginOffsetY ?? 0) };
  const useInnerOutline = addFrameToMonoblock && framePieceWidthCm > 0 && frameRowWidthsCm.length > 0;
  const cornerPt = patternOriginOnOutline(origPts, useInnerOutline ? pts : origPts, startCorner);
  if (!cornerPt) return;
  let origin = { x: cornerPt.x + off.x, y: cornerPt.y + off.y };
  const pathCenterline = inputs?.pathCenterline as { x: number; y: number }[] | undefined;
  const rawBySeg = inputs?.pathPatternLongOffsetMBySegment as number[] | undefined;
  const pathPatternLongOffsetRaw = inputs?.pathPatternLongOffsetM;
  const pathPatternLongOffsetM = pathPatternLongOffsetMOverride ?? (Array.isArray(rawBySeg) && rawBySeg[0] != null
    ? (Number(rawBySeg[0]) || 0)
    : Array.isArray(pathPatternLongOffsetRaw)
      ? (Number(pathPatternLongOffsetRaw[0] ?? 0) || 0)
      : (Number(pathPatternLongOffsetRaw ?? 0) || 0));
  if (pathCenterline && pathCenterline.length >= 2 && pathPatternLongOffsetM !== 0) {
    const p0 = pathCenterline[0];
    const p1 = pathCenterline[1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const pathDir = { x: dx / len, y: dy / len };
    const pathLongOffsetPx = toPixels(pathPatternLongOffsetM);
    origin = { x: origin.x + pathDir.x * pathLongOffsetPx, y: origin.y + pathDir.y * pathLongOffsetPx };
  }

  const angle = (directionDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dir = { x: cos, y: sin };
  const perp = { x: -sin, y: cos };

  const hasArcsEarly = !!(shape.edgeArcs?.some((a) => a && a.length > 0));
  const polygonForIntersectionEarly = hasArcsEarly ? pts : pts;

  if (inputs?.monoblockLayoutMode === "mix") {
    const mix = getMonoblockMixById(String(inputs?.monoblockMixId ?? ""));
    const enabledMap = inputs?.monoblockMixEnabledSizes as Partial<Record<MonoblockMixPieceKey, boolean>> | undefined;
    const enabledLengths = getMixEnabledLengthsCm(mix, enabledMap);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(worldToScreen(pts[0].x, pts[0].y).x, worldToScreen(pts[0].x, pts[0].y).y);
    for (let i = 1; i < pts.length; i++) {
      const s = worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    ctx.clip();
    drawMonoblockMixPattern(
      ctx,
      shape,
      pts,
      origin,
      dir,
      perp,
      jointPx,
      mix,
      enabledLengths,
      worldToScreen,
      zoom,
      showCuts,
      inputs,
      polygonForIntersectionEarly,
      hasArcsEarly,
      useNormalColorsForCuts
    );
    ctx.restore();
    return;
  }

  const vizWaste = shape.calculatorInputs?.vizWasteSatisfied;
  const wasteSatisfiedSet = new Set<string>(
    Array.isArray(vizWaste) ? vizWaste : (typeof vizWaste === "string" && vizWaste ? [vizWaste] : [])
  );

  const stepLength = blockLengthPx + jointPx;
  const stepWidth = blockWidthPx + jointPx;

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(worldToScreen(pts[0].x, pts[0].y).x, worldToScreen(pts[0].x, pts[0].y).y);
  for (let i = 1; i < pts.length; i++) {
    const s = worldToScreen(pts[i].x, pts[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.clip();

  // Dynamic extend: cover polygon based on distance from origin to farthest point
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

  const pattern = inputs?.vizPattern ?? "grid";
  const blockAreaPx2 = blockLengthPx * blockWidthPx;
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
  const blkLenX = blockLengthPx * dir.x;
  const blkLenY = blockLengthPx * dir.y;
  const blkWidX = blockWidthPx * perp.x;
  const blkWidY = blockWidthPx * perp.y;

  let fullCount = 0;
  let cutCount = 0;

  const processCobbleCorners = (corners: Point[], wasteKey: string) => {
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
    const isSmallCut = !isWasteReused && usedArea < 0.15 * blockAreaPx2 && !(hasArcs && vertsInSlab <= 2);

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
    const L = blockLengthPx;
    const W = blockWidthPx;
    const j = jointPx;
    const hb = herringbonePolygonIjIndexBounds(maxAlongDir, maxAlongPerp, L, W, j);
    for (let jj = hb.jMin; jj <= hb.jMax; jj++) {
      for (let ii = hb.iMin; ii <= hb.iMax; ii++) {
        processCobbleCorners(herringbone45CornersAtCell(origin, dir, perp, L, W, j, ii, jj), `hb${ii},${jj}`);
      }
    }
  } else {
    for (let r = -capR; r <= capR; r += strideR) {
      for (let c = -capC; c <= capC; c += strideC) {
        let offsetR = r;
        if (pattern === "brick" && c % 2 !== 0) offsetR = r + 0.5;
        else if (pattern === "onethird") offsetR = r + [0, 2 / 3, 1 / 3][((c % 3) + 3) % 3];
        const cx = origin.x + c * dirStepX + offsetR * perpStepX;
        const cy = origin.y + c * dirStepY + offsetR * perpStepY;

        const corners: Point[] = [
          { x: cx, y: cy },
          { x: cx + blkLenX, y: cy + blkLenY },
          { x: cx + blkLenX + blkWidX, y: cy + blkLenY + blkWidY },
          { x: cx + blkWidX, y: cy + blkWidY },
        ];
        processCobbleCorners(corners, `${r},${c}`);
      }
    }
  }

  ctx.fillStyle = BLOCK_COLOR;
  ctx.fill(pathFull);
  if (!useNormalColorsForCuts) {
    ctx.fillStyle = BLOCK_CUT_COLOR;
    ctx.fill(pathCutNorm);
    ctx.fillStyle = BLOCK_WASTE_REUSED_COLOR;
    ctx.fill(pathCutReuse);
    ctx.fillStyle = BLOCK_SMALL_CUT_COLOR;
    ctx.fill(pathCutSmall);
  }
  ctx.strokeStyle = JOINT_COLOR;
  ctx.lineWidth = Math.max(0.5, jointPx);
  ctx.stroke(pathJoint);
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.setLineDash([4, 4]);
  ctx.stroke(pathCutDash);
  ctx.setLineDash([]);

  ctx.restore();

  const total = fullCount + cutCount;
  const blockAreaCm2 = blockWidthCm * blockLengthCm;
  const totalBlockAreaCm2 = total > 0 && blockAreaCm2 > 0 ? total * blockAreaCm2 : 0;
  const wasteAreaCm2 = Number(inputs?.vizWasteAreaCm2 ?? 0);
  const reusedAreaCm2 = Number(inputs?.vizReusedAreaCm2 ?? 0);
  const actualWasteCm2 = Math.max(0, wasteAreaCm2 - reusedAreaCm2);
  const wastePct = totalBlockAreaCm2 > 0 ? Math.round((actualWasteCm2 / totalBlockAreaCm2) * 100) : (total > 0 ? Math.round((cutCount / total) * 100) : 0);
  const blocksForCuts = Math.max(0, cutCount - wasteSatisfiedSet.size);
  if (total > 0) {
    const anchor = labelAnchorInsidePolygon(pts);
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
        blocksForCuts > 0 ? `${fullCount} full, ${cutCount} cut (from ${blocksForCuts} blocks)` : `${fullCount} full, ${cutCount} cut`,
        sc.x,
        sc.y + lineHeight * 0.5,
      );
    } else {
      let line = 0.5;
      const area = areaM2(getEffectivePolygon(shape));
      ctx.fillText(area.toFixed(2) + " m²", sc.x, sc.y + lineHeight * line);
      line += 1;
      if (strideC === 1 && strideR === 1) {
        ctx.fillText(blocksForCuts > 0 ? `${fullCount} full, ${cutCount} cut (from ${blocksForCuts} blocks)` : `${fullCount} full, ${cutCount} cut`, sc.x, sc.y + lineHeight * line);
        line += 1;
        ctx.fillText(`~${wastePct}% waste`, sc.x, sc.y + lineHeight * line);
      }
    }
  }
}

function computeMonoblockMixCuts(
  shape: Shape,
  inputs: Record<string, any>,
  pts: Point[],
  origin: Point,
  dir: Point,
  perp: Point,
  jointPx: number
): { fullBlockCount: number; cutBlockCount: number; cuts: CutInfo[]; wasteSatisfiedPositions: string[]; wasteAreaCm2: number; reusedAreaCm2: number } {
  const mix = getMonoblockMixById(String(inputs?.monoblockMixId ?? ""));
  const enabledMap = inputs?.monoblockMixEnabledSizes as Partial<Record<MonoblockMixPieceKey, boolean>> | undefined;
  const enabledLengths = getMixEnabledLengthsCm(mix, enabledMap);
  if (enabledLengths.length === 0) {
    return { fullBlockCount: 0, cutBlockCount: 0, cuts: [], wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };
  }

  const rowWidthPx = toPixels(mix.rowWidthCm / 100);
  const staggerPx = toPixels(mix.staggerAlongCm / 100);
  const minStepPx = toPixels(MIN_MIX_STEP_CM / 100);
  const stepWidth = rowWidthPx + jointPx;

  let maxAlongDir = 0;
  let maxAlongPerp = 0;
  for (const p of pts) {
    const dDir = Math.abs((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y);
    const dPerp = Math.abs((p.x - origin.x) * perp.x + (p.y - origin.y) * perp.y);
    if (dDir > maxAlongDir) maxAlongDir = dDir;
    if (dPerp > maxAlongPerp) maxAlongPerp = dPerp;
  }
  const extendR = Math.ceil(maxAlongPerp / stepWidth) + 2;
  const extendAlong = Math.ceil(maxAlongDir / minStepPx) + 20;
  const EXTEND_CAP = 100;
  const extendRClamped = Math.min(Math.max(extendR, 10), EXTEND_CAP);

  let fullBlockCount = 0;
  let cutBlockCount = 0;
  const cuts: CutInfo[] = [];
  const cutBlockData: {
    r: number;
    c: number;
    demandW: number;
    demandL: number;
    wasteW: number;
    wasteL: number;
    demandPolygon?: Point[];
    wastePolygon?: Point[];
  }[] = [];

  let segCounter = 0;

  for (let r = -extendRClamped; r <= extendRClamped; r++) {
    const rowStagger = (r % 2 !== 0 ? 1 : 0) * staggerPx;
    let posAlong = -maxAlongDir - extendAlong + rowStagger;
    const endAlong = maxAlongDir + extendAlong;

    while (posAlong < endAlong) {
      const cx = origin.x + posAlong * dir.x + r * stepWidth * perp.x;
      const cy = origin.y + posAlong * dir.y + r * stepWidth * perp.y;

      let placed = false;
      for (const Lcm of enabledLengths) {
        const lenPx = toPixels(Lcm / 100);
        const corners = buildMixBlockCorners(cx, cy, lenPx, rowWidthPx, dir, perp);
        if (rectFullyInsidePolygon(corners, pts)) {
          fullBlockCount++;
          posAlong += lenPx + jointPx;
          placed = true;
          segCounter++;
          break;
        }
        const intersects = rectIntersectsPolygon(corners, pts);
        if (!intersects) continue;
        let cornersInside = 0;
        for (const corner of corners) if (pointInOrOnPolygon(corner, pts)) cornersInside++;
        const hasIntersectionArea = rectPolygonIntersectionArea(corners, pts) > 1e-20;
        if (cornersInside === 0 && !hasIntersectionArea && !intersects) continue;

        cutBlockCount++;
        const slabOrigin = { x: cx, y: cy };
        const demandPolygon = rectPolygonIntersectionKostka(corners, pts);
        if (demandPolygon.length < 3) {
          posAlong += lenPx + jointPx;
          placed = true;
          segCounter++;
          break;
        }

        const slabCuts = collectCutOperationsFromDemand(demandPolygon, corners, pts);
        for (const sc of slabCuts) cuts.push(sc);

        const demandBbox = polygonBboxCm(demandPolygon, slabOrigin, dir, perp);
        const demandWCm = demandBbox.w;
        const demandLCm = demandBbox.l;
        if (demandLCm < 0.5 || demandWCm < 0.5) {
          posAlong += lenPx + jointPx;
          placed = true;
          segCounter++;
          break;
        }

        const wastePolygon = computeWastePolygon(corners, demandPolygon);
        let wasteW: number, wasteL: number;
        if (wastePolygon.length >= 3) {
          const wasteBbox = polygonBboxCm(wastePolygon, slabOrigin, dir, perp);
          wasteW = Math.min(wasteBbox.w, wasteBbox.l);
          wasteL = Math.max(wasteBbox.w, wasteBbox.l);
        } else {
          const wasteInLengthCm = Lcm - demandLCm;
          const wasteInWidthCm = mix.rowWidthCm - demandWCm;
          if (wasteInLengthCm * mix.rowWidthCm >= wasteInWidthCm * Lcm) {
            wasteW = Math.min(wasteInLengthCm, mix.rowWidthCm);
            wasteL = Math.max(wasteInLengthCm, mix.rowWidthCm);
          } else {
            wasteW = Math.min(Lcm, wasteInWidthCm);
            wasteL = Math.max(Lcm, wasteInWidthCm);
          }
        }

        const useExactPolygon = demandPolygon.length <= 5 && wastePolygon.length >= 3 && wastePolygon.length <= 8;

        cutBlockData.push({
          r: segCounter,
          c: r,
          demandW: demandWCm,
          demandL: demandLCm,
          wasteW,
          wasteL,
          demandPolygon: useExactPolygon ? demandPolygon : undefined,
          wastePolygon: useExactPolygon ? wastePolygon : undefined,
        });

        posAlong += lenPx + jointPx;
        placed = true;
        segCounter++;
        break;
      }
      if (!placed) posAlong += minStepPx;
    }
  }

  const wasteSatisfiedPositions: string[] = [];
  let reusedAreaCm2 = 0;
  let wasteAreaCm2 = 0;
  const wastePool: { w: number; l: number; r: number; c: number; polygon?: Point[] }[] = [];

  for (const item of cutBlockData) {
    const { r, c, demandW, demandL, wasteW, wasteL, demandPolygon, wastePolygon } = item;
    const key = `m${c},${r}`;

    const matches = (w: { w: number; l: number; polygon?: Point[] }): boolean => {
      if (!fitsWithRotation(w, { w: demandW, l: demandL })) return false;
      if (demandPolygon && wastePolygon && w.polygon) {
        return polygonFitsInPolygonWithRotation(demandPolygon, w.polygon);
      }
      return true;
    };

    const idx = wastePool.findIndex((w) => matches(w));
    if (idx >= 0) {
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

  return { fullBlockCount, cutBlockCount, cuts, wasteSatisfiedPositions, wasteAreaCm2, reusedAreaCm2 };
}

/**
 * Compute cut block count for monoblocks that intersect the polygon but are not fully inside.
 * Returns cutBlockCount (number of blocks to cut), cuts (cut operations: 1 per diagonal/curved, 2 per corner),
 * wasteSatisfiedPositions, wasteAreaCm2, and reusedAreaCm2 (same as slabs for area-based waste %).
 */
export function computeCobblestoneCuts(shape: Shape, inputs: Record<string, any>): { fullBlockCount: number; cutBlockCount: number; cuts: CutInfo[]; wasteSatisfiedPositions: string[]; wasteAreaCm2: number; reusedAreaCm2: number } {
  const { points: ptsRaw, edgeIndices } = getEffectivePolygonWithEdgeIndices(shape);
  let pts = ptsRaw;
  if (pts.length < 3 || !shape.closed) return { fullBlockCount: 0, cutBlockCount: 0, cuts: [], wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };

  const blockWidthCm = Number(inputs?.blockWidthCm ?? 20);
  const blockLengthCm = Number(inputs?.blockLengthCm ?? 10);
  const jointGapMm = Number(inputs?.jointGapMm ?? 1);

  const addFrameToMonoblock = !!(inputs?.addFrameToMonoblock);
  const framePieceWidthCm = Number(inputs?.framePieceWidthCm ?? 0);
  const frameSidesEnabled = inputs?.frameSidesEnabled as boolean[] | undefined;
  const frameRowWidthsCm = getFrameBorderRowsFromInputs(inputs).map((r) => r.widthCm).filter((w) => w > 0);
  if (addFrameToMonoblock && frameRowWidthsCm.length > 0) {
    const shrunk = applyFrameInsetShrinkPolygon(pts, edgeIndices, frameSidesEnabled, frameRowWidthsCm);
    if (shrunk.length >= 3) pts = shrunk;
    else return { fullBlockCount: 0, cutBlockCount: 0, cuts: [], wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };
  }

  const blockWidthPx = toPixels(blockWidthCm / 100);
  const blockLengthPx = toPixels(blockLengthCm / 100);
  const jointPx = toPixels(jointGapMm / 1000);

  const directionDeg = Number(inputs?.vizDirection ?? 0);
  const origPts = shape.points;
  const startCorner = Math.max(0, Math.min(origPts.length - 1, Math.floor(Number(inputs?.vizStartCorner ?? 0))));
  const offX = Number(inputs?.vizOriginOffsetX ?? 0);
  const offY = Number(inputs?.vizOriginOffsetY ?? 0);
  const useInnerOutline = addFrameToMonoblock && framePieceWidthCm > 0 && frameRowWidthsCm.length > 0;
  const cornerPt = patternOriginOnOutline(origPts, useInnerOutline ? pts : origPts, startCorner);
  if (!cornerPt) return { fullBlockCount: 0, cutBlockCount: 0, cuts: [], wasteSatisfiedPositions: [], wasteAreaCm2: 0, reusedAreaCm2: 0 };
  let origin = { x: cornerPt.x + offX, y: cornerPt.y + offY };
  const pathCenterline = inputs?.pathCenterline as { x: number; y: number }[] | undefined;
  const rawBySeg = inputs?.pathPatternLongOffsetMBySegment as number[] | undefined;
  const pathPatternLongOffsetM = Array.isArray(rawBySeg) && rawBySeg[0] != null ? (Number(rawBySeg[0]) || 0) : (Number(inputs?.pathPatternLongOffsetM ?? 0) || 0);
  if (pathCenterline && pathCenterline.length >= 2 && pathPatternLongOffsetM !== 0) {
    const p0 = pathCenterline[0];
    const p1 = pathCenterline[1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const pathDir = { x: dx / len, y: dy / len };
    const pathLongOffsetPx = toPixels(pathPatternLongOffsetM);
    origin = { x: origin.x + pathDir.x * pathLongOffsetPx, y: origin.y + pathDir.y * pathLongOffsetPx };
  }

  const angle = vizDirectionToPatternAngleRad(directionDeg);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dir = { x: cos, y: sin };
  const perp = { x: -sin, y: cos };

  if (inputs?.monoblockLayoutMode === "mix") {
    return computeMonoblockMixCuts(shape, inputs, pts, origin, dir, perp, jointPx);
  }

  const stepLength = blockLengthPx + jointPx;
  const stepWidth = blockWidthPx + jointPx;

  const pattern = inputs?.vizPattern ?? "grid";

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

  let fullBlockCount = 0;
  let cutBlockCount = 0;
  const cuts: CutInfo[] = [];
  const cutBlockData: {
    r: number; c: number;
    demandW: number; demandL: number;
    wasteW: number; wasteL: number;
    demandPolygon?: Point[]; wastePolygon?: Point[];
  }[] = [];

  const pushCobbleCutFromCorners = (corners: Point[], cx: number, cy: number, keyR: number, keyC: number) => {
    if (rectFullyInsidePolygon(corners, pts)) {
      fullBlockCount++;
      return;
    }
    const intersects = rectIntersectsPolygon(corners, pts);
    if (!intersects) return;
    let cornersInside = 0;
    for (const corner of corners) if (pointInOrOnPolygon(corner, pts)) cornersInside++;
    const hasIntersectionArea = rectPolygonIntersectionArea(corners, pts) > 1e-20;
    if (cornersInside === 0 && !hasIntersectionArea && !intersects) return;

    cutBlockCount++;

    const slabOrigin = { x: cx, y: cy };
    const demandPolygon = rectPolygonIntersectionKostka(corners, pts);
    if (demandPolygon.length < 3) return;

    const slabCuts = collectCutOperationsFromDemand(demandPolygon, corners, pts);
    for (const sc of slabCuts) cuts.push(sc);

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
      const wasteInLengthCm = blockLengthCm - demandLCm;
      const wasteInWidthCm = blockWidthCm - demandWCm;
      if (wasteInLengthCm * blockWidthCm >= wasteInWidthCm * blockLengthCm) {
        wasteW = Math.min(wasteInLengthCm, blockWidthCm);
        wasteL = Math.max(wasteInLengthCm, blockWidthCm);
      } else {
        wasteW = Math.min(blockLengthCm, wasteInWidthCm);
        wasteL = Math.max(blockLengthCm, wasteInWidthCm);
      }
    }

    const useExactPolygon = demandPolygon.length <= 5 && wastePolygon.length >= 3 && wastePolygon.length <= 8;

    cutBlockData.push({
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
    const L = blockLengthPx;
    const W = blockWidthPx;
    const j = jointPx;
    const hb = herringbonePolygonIjIndexBounds(maxAlongDir, maxAlongPerp, L, W, j);
    for (let jj = hb.jMin; jj <= hb.jMax; jj++) {
      for (let ii = hb.iMin; ii <= hb.iMax; ii++) {
        const corners = herringbone45CornersAtCell(origin, dir, perp, L, W, j, ii, jj);
        pushCobbleCutFromCorners(corners, corners[0].x, corners[0].y, ii, jj);
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
          { x: cx + blockLengthPx * dir.x, y: cy + blockLengthPx * dir.y },
          { x: cx + blockLengthPx * dir.x + blockWidthPx * perp.x, y: cy + blockLengthPx * dir.y + blockWidthPx * perp.y },
          { x: cx + blockWidthPx * perp.x, y: cy + blockWidthPx * perp.y },
        ];
        pushCobbleCutFromCorners(corners, cx, cy, r, c);
      }
    }
  }

  // Sequential matching: one demand + one waste per block (same as slabs)
  const wasteSatisfiedPositions: string[] = [];
  let reusedAreaCm2 = 0;
  let wasteAreaCm2 = 0;
  const wastePool: { w: number; l: number; r: number; c: number; polygon?: Point[] }[] = [];

  for (const item of cutBlockData) {
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

  return { fullBlockCount, cutBlockCount, cuts, wasteSatisfiedPositions, wasteAreaCm2, reusedAreaCm2 };
}

/**
 * Compute frame block count and area for monoblocks.
 * Uses framePieceLengthCm and framePieceWidthCm (user-defined, like slabs).
 * frameAngleCuts: when miter45, each corner block counts as requiring a 45° cut.
 */
export function computeMonoblockFrameBlocks(
  shape: Shape,
  inputs: Record<string, any>
): { totalFrameBlocks: number; totalFrameAreaM2: number; frameAngleCuts: number; sides: Array<{ length: number; blocks: number }> } {
  let outlinePts: Point[];
  let edgeIndices: number[];
  if (isPathElement(shape)) {
    const pathPts = getPathPolygon(shape);
    if (!pathPts || pathPts.length < 3) return { totalFrameBlocks: 0, totalFrameAreaM2: 0, frameAngleCuts: 0, sides: [] };
    outlinePts = pathPts;
    edgeIndices = outlinePts.map((_, i) => i);
  } else {
    const eff = getEffectivePolygonWithEdgeIndices(shape);
    outlinePts = eff.points;
    edgeIndices = eff.edgeIndices;
  }
  if (outlinePts.length < 3 || !shape.closed) return { totalFrameBlocks: 0, totalFrameAreaM2: 0, frameAngleCuts: 0, sides: [] };

  const addFrameToMonoblock = !!(inputs?.addFrameToMonoblock);
  const framePieceWidthCm = Number(inputs?.framePieceWidthCm ?? 10);
  const frameJointType = (inputs?.frameJointType as "butt" | "miter45") || "butt";
  if (!addFrameToMonoblock || framePieceWidthCm <= 0) return { totalFrameBlocks: 0, totalFrameAreaM2: 0, frameAngleCuts: 0, sides: [] };

  const rows = getFrameBorderRowsFromInputs(inputs);
  if (rows.length === 0) return { totalFrameBlocks: 0, totalFrameAreaM2: 0, frameAngleCuts: 0, sides: [] };

  const jointGapMm = Number(inputs?.jointGapMm ?? 1);
  const jointPx = toPixels(jointGapMm / 1000);
  const frameSidesEnabled = inputs?.frameSidesEnabled as boolean[] | undefined;
  const numLogicalEdges = Math.max(...edgeIndices, -1) + 1;
  let enabledEdgeCount = 0;
  for (let e = 0; e < numLogicalEdges; e++) {
    if (Array.isArray(frameSidesEnabled) && frameSidesEnabled[e] === false) continue;
    enabledEdgeCount++;
  }
  const frameAngleCuts = frameJointType === "miter45" ? enabledEdgeCount * rows.length : 0;

  let totalFrameBlocks = 0;
  let totalFrameAreaM2 = 0;
  let cumulativePts = outlinePts;
  const sides: Array<{ length: number; blocks: number }> = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const framePieceLengthCm = row.lengthCm;
    const framePieceWidthCmRow = row.widthCm;
    const pieceLengthPx = toPixels(framePieceLengthCm / 100);
    const pieceWidthM = framePieceWidthCmRow / 100;
    const stepLengthPx = pieceLengthPx + jointPx;

    const pts = cumulativePts;
    const n = pts.length;
    const edgeLengthsPx: number[] = Array(numLogicalEdges).fill(0);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const edgeIdx = edgeIndices[j];
      const segLen = Math.sqrt((pts[j].x - pts[i].x) ** 2 + (pts[j].y - pts[i].y) ** 2) || 1;
      edgeLengthsPx[edgeIdx] += segLen;
    }

    for (let e = 0; e < numLogicalEdges; e++) {
      if (Array.isArray(frameSidesEnabled) && frameSidesEnabled[e] === false) continue;
      const edgeLenPx = edgeLengthsPx[e];
      const blocksPerEdge = Math.ceil((edgeLenPx + jointPx) / stepLengthPx);
      const sideLengthM = toMeters(edgeLenPx);
      totalFrameBlocks += blocksPerEdge;
      totalFrameAreaM2 += sideLengthM * pieceWidthM;
      if (rowIdx === 0) {
        sides.push({ length: sideLengthM, blocks: blocksPerEdge });
      }
    }

    cumulativePts = applyFrameInsetShrinkPolygon(cumulativePts, edgeIndices, frameSidesEnabled, [row.widthCm]);
    if (cumulativePts.length < 3) break;
  }

  return { totalFrameBlocks, totalFrameAreaM2, frameAngleCuts, sides };
}

/**
 * Draw monoblock frame along polygon edges.
 * Uses framePieceLengthCm and framePieceWidthCm (user-defined, like slabs).
 * frameJointType: 'butt' = square ends, 'miter45' = 45° miter cut at corners.
 * Arc edges: blocks placed along curve with tangent orientation — joints widen naturally.
 */
export function drawMonoblockFrame(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  _zoom: number
): void {
  const inputs = shape.calculatorInputs;
  const rows = getFrameBorderRowsFromInputs(inputs);
  if (rows.length === 0) return;

  let outlinePts: Point[];
  let edgeIndices: number[];
  if (isPathElement(shape)) {
    const pathPts = getPathPolygon(shape);
    if (!pathPts || pathPts.length < 3) return;
    outlinePts = pathPts;
    edgeIndices = outlinePts.map((_, i) => i);
  } else {
    const eff = getEffectivePolygonWithEdgeIndices(shape);
    outlinePts = eff.points;
    edgeIndices = eff.edgeIndices;
  }
  if (outlinePts.length < 3 || !shape.closed) return;

  const jointGapMm = Number(inputs?.jointGapMm ?? 1);
  const jointPx = toPixels(jointGapMm / 1000);
  const frameSidesEnabled = inputs?.frameSidesEnabled as boolean[] | undefined;
  const origPts = shape.points;
  const nOrig = origPts.length;
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

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const pieceLengthPx = toPixels(row.lengthCm / 100);
    const pieceWidthPx = toPixels(row.widthCm / 100);
    if (pieceWidthPx <= 0) continue;
    const stepLengthPx = pieceLengthPx + jointPx;
    const miter = row.jointType === "miter45";
    const skipArcs = rowIdx > 0;

    const pts = cumulativePts;
    const innerPts = miter ? shrinkPolygon(pts, pieceWidthPx) : null;

    const signedArea = pts.reduce((acc, p, idx) => {
      const q = pts[(idx + 1) % pts.length];
      return acc + p.x * q.y - q.x * p.y;
    }, 0) / 2;
    const perpSign = signedArea > 0 ? 1 : -1;

    const n = pts.length;
    const arcEdgeDrawn = new Set<number>();

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
        ctx.strokeStyle = JOINT_COLOR;
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
    const numPieces = Math.ceil((edgeLenPx + jointPx) / stepLengthPx);

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
        ctx.strokeStyle = JOINT_COLOR;
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
        ctx.strokeStyle = JOINT_COLOR;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

    cumulativePts = applyFrameInsetShrinkPolygon(cumulativePts, edgeIndices, frameSidesEnabled, [row.widthCm]);
    if (cumulativePts.length < 3) break;
  }

  ctx.restore();
}
