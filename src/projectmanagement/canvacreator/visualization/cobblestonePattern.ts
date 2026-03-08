// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — visualization/cobblestonePattern.ts
// Cobblestone (monoblock) pattern rendering — 20×10 cm blocks, 1mm joint
// ══════════════════════════════════════════════════════════════

import { Point, Shape, toPixels, toMeters, labelAnchorInsidePolygon, areaM2 } from "../geometry";
import { getEffectivePolygon } from "../arcMath";
import {
  shrinkPolygon,
  rectPolygonIntersectionArea,
  rectPolygonIntersection,
  computeWastePolygon,
  polygonBboxCm,
  polygonFitsInPolygonWithRotation,
} from "./slabPattern";

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

const BLOCK_COLOR = "#5d6d7e";
const FRAME_COLOR = "#4a6fa5";
const BLOCK_CUT_COLOR = "#95a5a6";
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

/**
 * Draw cobblestone (monoblock) pattern on a polygon shape.
 * Blocks 20×10 cm, joint 1mm (thin line in render).
 */
export function drawCobblestonePattern(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  _zoom: number,
  showCuts: boolean = true,
  originOffset?: { x: number; y: number },
  directionDegOverride?: number,
  useNormalColorsForCuts?: boolean
): void {
  const inputs = shape.calculatorInputs;
  const blockWidthCm = Number(inputs?.blockWidthCm ?? 20);
  const blockLengthCm = Number(inputs?.blockLengthCm ?? 10);
  const jointGapMm = Number(inputs?.jointGapMm ?? 1);

  let pts = getEffectivePolygon(shape);
  if (pts.length < 3 || !shape.closed) return;

  const addFrameToMonoblock = !!(inputs?.addFrameToMonoblock);
  const framePieceWidthCm = Number(inputs?.framePieceWidthCm ?? 0);
  const frameWidthCm = framePieceWidthCm;
  if (addFrameToMonoblock && frameWidthCm > 0) {
    const frameWidthPx = toPixels(frameWidthCm / 100);
    pts = shrinkPolygon(pts, frameWidthPx);
    if (pts.length < 3) return;
  }

  const blockWidthPx = toPixels(blockWidthCm / 100);
  const blockLengthPx = toPixels(blockLengthCm / 100);
  const jointPx = toPixels(jointGapMm / 1000);

  const directionDeg = directionDegOverride ?? Number(inputs?.vizDirection ?? 0);
  const origPts = shape.points;
  const startCorner = Math.max(0, Math.min(origPts.length - 1, Math.floor(Number(inputs?.vizStartCorner ?? 0))));
  const off = originOffset ?? { x: Number(inputs?.vizOriginOffsetX ?? 0), y: Number(inputs?.vizOriginOffsetY ?? 0) };
  const origin = { x: origPts[startCorner].x + off.x, y: origPts[startCorner].y + off.y };

  const angle = (directionDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dir = { x: cos, y: sin };
  const perp = { x: -sin, y: cos };

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
  const extend = Math.min(Math.max(extendC, extendR, 10), EXTEND_CAP);

  const pattern = inputs?.vizPattern ?? "grid";
  const blockAreaPx2 = blockLengthPx * blockWidthPx;
  const hasArcs = !!(shape.edgeArcs?.some(a => a && a.length > 0));
  const polygonForIntersection = hasArcs
    ? (addFrameToMonoblock && frameWidthCm > 0 ? shrinkPolygon(origPts, toPixels(frameWidthCm / 100)) : origPts)
    : pts;

  const cornersInsideCount = (corners: Point[], polygon: Point[]): number => {
    let n = 0;
    for (const c of corners) if (pointInOrOnPolygon(c, polygon)) n++;
    return n;
  };
  const countOrigVertsInSlab = (corners: Point[]): number => {
    let n = 0;
    for (const v of origPts) if (pointInOrOnPolygon(v, corners)) n++;
    return n;
  };

  let fullCount = 0;
  let cutCount = 0;
  const drawBlock = (corners: Point[], isCut: boolean, r: number, c: number) => {
    if (!rectIntersectsPolygon(corners, pts)) return;
    if (isCut && !showCuts) return;
    isCut ? cutCount++ : fullCount++;

    const isWasteReused = isCut && wasteSatisfiedSet.has(`${r},${c}`);
    const vertsInSlab = hasArcs ? countOrigVertsInSlab(corners) : 4;
    const usedAreaOrig = rectPolygonIntersectionArea(corners, polygonForIntersection);
    const usedAreaPts = hasArcs ? rectPolygonIntersectionArea(corners, pts) : usedAreaOrig;
    const usedArea = Math.max(usedAreaOrig, usedAreaPts);
    const isSmallCut = isCut && !isWasteReused && usedArea < 0.15 * blockAreaPx2 && !(hasArcs && vertsInSlab <= 2);

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

  for (let r = -extend; r <= extend; r++) {
    for (let c = -extend; c <= extend; c++) {
      let offsetR = r;
      if (pattern === "brick" && c % 2 !== 0) offsetR = r + 0.5;
      const cx = origin.x + c * stepLength * dir.x + offsetR * stepWidth * perp.x;
      const cy = origin.y + c * stepLength * dir.y + offsetR * stepWidth * perp.y;

      const corners: Point[] = [
        { x: cx, y: cy },
        { x: cx + blockLengthPx * dir.x, y: cy + blockLengthPx * dir.y },
        { x: cx + blockLengthPx * dir.x + blockWidthPx * perp.x, y: cy + blockLengthPx * dir.y + blockWidthPx * perp.y },
        { x: cx + blockWidthPx * perp.x, y: cy + blockWidthPx * perp.y },
      ];
      const fullyInside = rectFullyInsidePolygon(corners, pts);
      const intersects = rectIntersectsPolygon(corners, pts);
      if (!fullyInside && !intersects) continue;
      const cornersInside = cornersInsideCount(corners, pts);
      const hasIntersectionArea = rectPolygonIntersectionArea(corners, pts) > 1e-20;
      if (!fullyInside && cornersInside === 0 && !hasIntersectionArea && !intersects) continue;
      drawBlock(corners, !fullyInside, r, c);
    }
  }

  ctx.restore();

  const total = fullCount + cutCount;
  const blockAreaCm2 = blockWidthCm * blockLengthCm;
  const totalBlockAreaCm2 = total > 0 && blockAreaCm2 > 0 ? total * blockAreaCm2 : 0;
  const wasteSatisfiedCount = wasteSatisfiedSet.size;
  const wastePct = totalBlockAreaCm2 > 0
    ? Math.round(Math.max(0, (cutCount - wasteSatisfiedCount) / total) * 100)
    : (total > 0 ? Math.round((cutCount / total) * 100) : 0);
  if (total > 0) {
    const anchor = labelAnchorInsidePolygon(pts);
    const sc = worldToScreen(anchor.x, anchor.y);
    const area = areaM2(getEffectivePolygon(shape));
    ctx.font = "bold 14px 'JetBrains Mono',monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(area.toFixed(2) + " m²", sc.x, sc.y + 8);
    ctx.fillText(`${fullCount} full, ${cutCount} cut`, sc.x, sc.y + 24);
    ctx.fillText(`~${wastePct}% waste`, sc.x, sc.y + 40);
  }
}

/**
 * Compute cut block count for monoblocks that intersect the polygon but are not fully inside.
 * Returns cutBlockCount (number of blocks to cut, for input display) and wasteSatisfiedPositions.
 */
export function computeCobblestoneCuts(shape: Shape, inputs: Record<string, any>): { cutBlockCount: number; wasteSatisfiedPositions: string[] } {
  let pts = getEffectivePolygon(shape);
  if (pts.length < 3 || !shape.closed) return { cutBlockCount: 0, wasteSatisfiedPositions: [] };

  const blockWidthCm = Number(inputs?.blockWidthCm ?? 20);
  const blockLengthCm = Number(inputs?.blockLengthCm ?? 10);
  const jointGapMm = Number(inputs?.jointGapMm ?? 1);

  const addFrameToMonoblock = !!(inputs?.addFrameToMonoblock);
  const framePieceWidthCm = Number(inputs?.framePieceWidthCm ?? 0);
  if (addFrameToMonoblock && framePieceWidthCm > 0) {
    const frameWidthPx = toPixels(framePieceWidthCm / 100);
    pts = shrinkPolygon(pts, frameWidthPx);
    if (pts.length < 3) return { cutBlockCount: 0, wasteSatisfiedPositions: [] };
  }

  const blockWidthPx = toPixels(blockWidthCm / 100);
  const blockLengthPx = toPixels(blockLengthCm / 100);
  const jointPx = toPixels(jointGapMm / 1000);

  const directionDeg = Number(inputs?.vizDirection ?? 0);
  const origPts = shape.points;
  const startCorner = Math.max(0, Math.min(origPts.length - 1, Math.floor(Number(inputs?.vizStartCorner ?? 0))));
  const offX = Number(inputs?.vizOriginOffsetX ?? 0);
  const offY = Number(inputs?.vizOriginOffsetY ?? 0);
  const origin = { x: origPts[startCorner].x + offX, y: origPts[startCorner].y + offY };

  const angle = (directionDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dir = { x: cos, y: sin };
  const perp = { x: -sin, y: cos };
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

  let cutBlockCount = 0;
  const cutBlockData: {
    r: number; c: number;
    demandW: number; demandL: number;
    wasteW: number; wasteL: number;
    demandPolygon?: Point[]; wastePolygon?: Point[];
  }[] = [];

  for (let r = -extend; r <= extend; r++) {
    for (let c = -extend; c <= extend; c++) {
      let offsetR = r;
      if (pattern === "brick" && c % 2 !== 0) offsetR = r + 0.5;
      const cx = origin.x + c * stepLength * dir.x + offsetR * stepWidth * perp.x;
      const cy = origin.y + c * stepLength * dir.y + offsetR * stepWidth * perp.y;

      const corners: Point[] = [
        { x: cx, y: cy },
        { x: cx + blockLengthPx * dir.x, y: cy + blockLengthPx * dir.y },
        { x: cx + blockLengthPx * dir.x + blockWidthPx * perp.x, y: cy + blockLengthPx * dir.y + blockWidthPx * perp.y },
        { x: cx + blockWidthPx * perp.x, y: cy + blockWidthPx * perp.y },
      ];
      if (rectFullyInsidePolygon(corners, pts)) continue;
      const intersects = rectIntersectsPolygon(corners, pts);
      if (!intersects) continue;
      let cornersInside = 0;
      for (const corner of corners) if (pointInOrOnPolygon(corner, pts)) cornersInside++;
      const hasIntersectionArea = rectPolygonIntersectionArea(corners, pts) > 1e-20;
      if (cornersInside === 0 && !hasIntersectionArea && !intersects) continue;

      cutBlockCount++;

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

  // Sequential matching: one demand + one waste per block
  const wasteSatisfiedPositions: string[] = [];
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
      wastePool.splice(idx, 1);
    } else {
      if (wasteW > 0.5 && wasteL > 0.5) {
        wastePool.push({ w: wasteW, l: wasteL, r, c, polygon: wastePolygon });
      }
    }
  }

  return { cutBlockCount, wasteSatisfiedPositions };
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
  const pts = getEffectivePolygon(shape);
  if (pts.length < 3 || !shape.closed) return { totalFrameBlocks: 0, totalFrameAreaM2: 0, frameAngleCuts: 0, sides: [] };

  const addFrameToMonoblock = !!(inputs?.addFrameToMonoblock);
  const framePieceLengthCm = Number(inputs?.framePieceLengthCm ?? 60);
  const framePieceWidthCm = Number(inputs?.framePieceWidthCm ?? 10);
  const frameJointType = (inputs?.frameJointType as 'butt' | 'miter45') || 'butt';
  if (!addFrameToMonoblock || framePieceWidthCm <= 0) return { totalFrameBlocks: 0, totalFrameAreaM2: 0, frameAngleCuts: 0, sides: [] };

  const pieceLengthPx = toPixels(framePieceLengthCm / 100);
  const pieceWidthM = framePieceWidthCm / 100;
  const jointGapMm = Number(inputs?.jointGapMm ?? 1);
  const jointPx = toPixels(jointGapMm / 1000);
  const stepLengthPx = pieceLengthPx + jointPx;

  let totalFrameBlocks = 0;
  const sides: Array<{ length: number; blocks: number }> = [];
  const n = pts.length;
  const frameAngleCuts = frameJointType === 'miter45' ? n : 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = pts[i];
    const b = pts[j];
    const edgeLenPx = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2) || 1;
    const blocksPerEdge = Math.ceil((edgeLenPx + jointPx) / stepLengthPx);
    const sideLengthM = toMeters(edgeLenPx);

    sides.push({ length: sideLengthM, blocks: blocksPerEdge });
    totalFrameBlocks += blocksPerEdge;
  }

  const totalFrameAreaM2 = sides.reduce((sum, s) => sum + s.length * pieceWidthM, 0);

  return { totalFrameBlocks, totalFrameAreaM2, frameAngleCuts, sides };
}

/**
 * Draw monoblock frame along polygon edges.
 * Uses framePieceLengthCm and framePieceWidthCm (user-defined, like slabs).
 * frameJointType: 'butt' = square ends, 'miter45' = 45° miter cut at corners.
 */
export function drawMonoblockFrame(
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

  const pieceLengthPx = toPixels(framePieceLengthCm / 100);
  const pieceWidthPx = toPixels(framePieceWidthCm / 100);
  const jointGapMm = Number(inputs?.jointGapMm ?? 1);
  const jointPx = toPixels(jointGapMm / 1000);
  const stepLengthPx = pieceLengthPx + jointPx;
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

  ctx.restore();
}
