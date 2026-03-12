// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — linearElements.ts
// Thick polyline rendering for fence, wall, kerb, foundation
// ══════════════════════════════════════════════════════════════

import {
  Point,
  Shape,
  ElementType,
  distance,
  toPixels,
  toMeters,
  formatLength,
  midpoint,
  angleDeg,
  centroid,
  polylineLengthMeters,
  C,
} from "./geometry";
import { drawAlternatingLinkedHalf } from "./linkedEdgeDrawing";
import { sampleArcEdge, calcEdgeLengthWithArcs } from "./arcMath";

// ── Helpers ───────────────────────────────────────────────────

export function isLinearElement(shape: Shape): boolean {
  return shape.elementType !== "polygon" && shape.elementType !== "pathSlabs" && shape.elementType !== "pathConcreteSlabs" && shape.elementType !== "pathMonoblock";
}

export function isPathElement(shape: Shape): boolean {
  return shape.elementType === "pathSlabs" || shape.elementType === "pathConcreteSlabs" || shape.elementType === "pathMonoblock";
}

export const GROUNDWORK_LINEAR_TYPES = ["drainage", "canalPipe", "waterPipe", "cable"] as const;
export type GroundworkLinearType = typeof GROUNDWORK_LINEAR_TYPES[number];
export function isGroundworkLinear(shape: Shape): boolean {
  return GROUNDWORK_LINEAR_TYPES.includes(shape.elementType as GroundworkLinearType);
}

const GROUNDWORK_LABELS: Record<GroundworkLinearType, string> = {
  drainage: "Drainage",
  canalPipe: "Canal Pipe",
  waterPipe: "Water Pipe",
  cable: "Cable",
};

export function groundworkLabel(shape: Shape): string {
  return isGroundworkLinear(shape) ? (GROUNDWORK_LABELS[shape.elementType as GroundworkLinearType] ?? "Groundwork") : "Groundwork";
}

/** Wall, kerb, foundation — stored as polygon outline. Fence and groundwork stay polyline. */
export function isPolygonLinearElement(shape: Shape): boolean {
  return shape.elementType === "wall" || shape.elementType === "kerb" || shape.elementType === "foundation";
}

export function linearElementColor(elementType: ElementType): string {
  switch (elementType) {
    case "fence": return C.fence;
    case "wall": return C.wall;
    case "kerb": return C.kerb;
    case "foundation": return C.foundation;
    case "drainage": return C.drainage;
    case "canalPipe": return C.canalPipe;
    case "waterPipe": return C.waterPipe;
    case "cable": return C.cable;
    default: return C.layer2Edge;
  }
}

function linearElementDimColor(elementType: ElementType): string {
  switch (elementType) {
    case "fence": return C.fenceDim;
    case "wall": return C.wallDim;
    case "kerb": return C.kerbDim;
    case "foundation": return C.foundationDim;
    case "drainage": return C.drainageDim;
    case "canalPipe": return C.canalPipeDim;
    case "waterPipe": return C.waterPipeDim;
    case "cable": return C.cableDim;
    default: return C.inactiveShape;
  }
}

// ── Thick Polyline ────────────────────────────────────────────

// 2D cross product: a.x*b.y - a.y*b.x
function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Compute polygon outline for a thick polyline.
 * Offset each segment by +/- thickness/2 along normals, with proper miter joins at corners.
 */
/**
 * Get polygon for a path element. Path can be stored as:
 * - Center line (during drawing): compute outline from polyline + width
 * - Outline polygon (after conversion): points are already the polygon
 */
export function getPathPolygon(shape: Shape): Point[] {
  const pts = shape.points;
  if (pts.length < 2) return [];
  if (shape.calculatorInputs?.pathIsOutline) {
    return pts; // Already converted to polygon outline
  }
  const pathWidthM = Number(shape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6;
  const thicknessPx = toPixels(pathWidthM);
  return computeThickPolyline(pts, thicknessPx);
}

export function computeThickPolyline(points: Point[], thicknessPx: number): Point[] {
  if (points.length < 2) return [];
  const half = thicknessPx / 2;
  const MITER_LIMIT = half * 4; // fall back to bevel if miter would spike

  const leftPts: Point[] = [];
  const rightPts: Point[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) continue;
    const nx = -dy / len;
    const ny = dx / len;
    leftPts.push({ x: a.x + nx * half, y: a.y + ny * half });
    rightPts.push({ x: a.x - nx * half, y: a.y - ny * half });
  }
  const last = points[points.length - 1];
  const prevLast = points[points.length - 2];
  const dx = last.x - prevLast.x;
  const dy = last.y - prevLast.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = len > 0.001 ? -dy / len : 0;
  const ny = len > 0.001 ? dx / len : 0;
  leftPts.push({ x: last.x + nx * half, y: last.y + ny * half });
  rightPts.push({ x: last.x - nx * half, y: last.y - ny * half });

  // Replace interior left/right points with miter intersections
  const outLeft: Point[] = [];
  const outRight: Point[] = [];
  outLeft.push(leftPts[0]);
  outRight.push(rightPts[0]);

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const l1 = Math.sqrt(d1x * d1x + d1y * d1y);
    const l2 = Math.sqrt(d2x * d2x + d2y * d2y);
    if (l1 < 0.001 || l2 < 0.001) {
      outLeft.push(leftPts[i]);
      outRight.push(rightPts[i]);
      continue;
    }
    const n1x = -d1y / l1;
    const n1y = d1x / l1;
    const n2x = -d2y / l2;
    const n2y = d2x / l2;
    const p1 = { x: prev.x + n1x * half, y: prev.y + n1y * half };
    const p2 = { x: curr.x + n2x * half, y: curr.y + n2y * half };
    const dir1 = { x: d1x / l1, y: d1y / l1 };
    const dir2 = { x: d2x / l2, y: d2y / l2 };
    const denom = cross(dir1, dir2);
    if (Math.abs(denom) < 0.0001) {
      outLeft.push(leftPts[i]);
      outRight.push(rightPts[i]);
      continue;
    }
    const diff = { x: p2.x - p1.x, y: p2.y - p1.y };
    const t = cross(diff, dir2) / denom;
    const miterLeft = { x: p1.x + t * dir1.x, y: p1.y + t * dir1.y };
    const distLeft = Math.sqrt((miterLeft.x - curr.x) ** 2 + (miterLeft.y - curr.y) ** 2);
    if (distLeft > MITER_LIMIT) {
      outLeft.push(leftPts[i]);
    } else {
      outLeft.push(miterLeft);
    }
    const r1 = { x: prev.x - n1x * half, y: prev.y - n1y * half };
    const r2 = { x: curr.x - n2x * half, y: curr.y - n2y * half };
    const rdiff = { x: r2.x - r1.x, y: r2.y - r1.y };
    const tr = cross(rdiff, dir2) / denom;
    const miterRight = { x: r1.x + tr * dir1.x, y: r1.y + tr * dir1.y };
    const distRight = Math.sqrt((miterRight.x - curr.x) ** 2 + (miterRight.y - curr.y) ** 2);
    if (distRight > MITER_LIMIT) {
      outRight.push(rightPts[i]);
    } else {
      outRight.push(miterRight);
    }
  }

  outLeft.push(leftPts[leftPts.length - 1]);
  outRight.push(rightPts[rightPts.length - 1]);

  const result: Point[] = [...outLeft];
  for (let i = outRight.length - 1; i >= 0; i--) {
    result.push(outRight[i]);
  }
  return result;
}

/**
 * Compute path polygon on one side of line A-B only.
 * side: "left" = path on left when going A→B, "right" = path on right.
 * Returns 4-point quadrilateral [A, B, offset1, offset0].
 */
export function computePathPolygonOneSide(A: Point, B: Point, pathWidthM: number, side: "left" | "right"): Point[] {
  const half = toPixels(pathWidthM) / 2;
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return [];
  const nx = -dy / len;
  const ny = dx / len;
  const sign = side === "left" ? 1 : -1;
  const offset0 = { x: A.x + sign * nx * half, y: A.y + sign * ny * half };
  const offset1 = { x: B.x + sign * nx * half, y: B.y + sign * ny * half };
  return [A, B, offset1, offset0];
}

/**
 * Which side of line A→B is point P on? Cross product (P-A) × (B-A).
 * > 0 = left, < 0 = right, ≈ 0 = on line.
 */
export function pointSideOfLine(P: Point, A: Point, B: Point): "left" | "right" | "on" {
  const cross = (P.x - A.x) * (B.y - A.y) - (P.y - A.y) * (B.x - A.x);
  if (Math.abs(cross) < 0.0001) return "on";
  return cross > 0 ? "left" : "right";
}

/**
 * Get polygon outline for wall/kerb/foundation. If stored as polygon (closed), return points.
 * If stored as polyline, compute from centerline + thickness.
 */
export function getPolygonLinearOutline(shape: Shape): Point[] {
  if (isPolygonLinearElement(shape) && shape.closed && shape.points.length >= 3) {
    return shape.points;
  }
  if (isPolygonLinearElement(shape) && shape.points.length >= 2) {
    const pathPts = getLinearElementPath(shape);
    const thicknessM = getPolygonThicknessM(shape);
    return computeThickPolyline(pathPts, toPixels(thicknessM));
  }
  return [];
}

/**
 * Extract segment lengths from wall/kerb/foundation polygon outline.
 * Outline has 2n+2 points for n segments: [left0..left_n, right_n..right0].
 * Length = distance along centerline (between cap centers).
 */
export function polygonToSegmentLengths(outline: Point[]): number[] {
  const n = outline.length;
  if (n < 4 || n % 2 !== 0) return [];
  const segCount = (n - 2) / 2;
  const lengths: number[] = [];

  if (segCount === 1) {
    // Single segment: centerline would give same point twice. Use cap centers directly.
    // centerStart = midpoint(left0, right0), centerEnd = midpoint(left1, right1)
    const centerStart = midpoint(outline[0], outline[n - 1]);
    const centerEnd = midpoint(outline[1], outline[2]);
    lengths.push(toMeters(distance(centerStart, centerEnd)));
    return lengths;
  }

  const centerline = polygonToCenterline(outline);
  if (centerline.length < 2) return [];
  for (let i = 0; i < centerline.length - 1; i++) {
    lengths.push(toMeters(distance(centerline[i], centerline[i + 1])));
  }
  return lengths;
}

/**
 * Map polygon outline edge index to segment index. Returns -1 for cap edges.
 * Outline: [left0..left_n, right_n..right0], edges 0..n-1 left, n cap, n+1..2n right, 2n+1 cap.
 */
export function polygonEdgeToSegmentIndex(outline: Point[], edgeIdx: number): number {
  const n = outline.length;
  if (n < 4 || n % 2 !== 0) return -1;
  const segCount = (n - 2) / 2;
  if (edgeIdx < segCount) return edgeIdx;
  if (edgeIdx > segCount && edgeIdx <= 2 * segCount) return edgeIdx - segCount - 1;
  return -1;
}

/**
 * Remove segment at index segIdx from polygon outline. Returns new outline or null if invalid.
 * Outline: [left0..left_n, right_n..right0]. Segment i uses left[i]-left[i+1] and right[n-i-1]-right[n-i].
 */
export function removeSegmentFromPolygonOutline(outline: Point[], segIdx: number): Point[] | null {
  const n = outline.length;
  if (n < 6 || n % 2 !== 0) return null; // need at least 2 segments
  const segCount = (n - 2) / 2;
  if (segIdx < 0 || segIdx >= segCount) return null;
  const left = outline.slice(0, segCount + 1);
  const right = outline.slice(segCount + 1); // [right_n, right_{n-1}, ..., right_0]
  left.splice(segIdx, 2); // remove left[segIdx] and left[segIdx+1]
  const rightIdx = segCount - 1 - segIdx; // right edge of segment segIdx: right[rightIdx] to right[rightIdx+1]
  right.splice(rightIdx, 2);
  if (left.length < 2 || right.length < 2) return null;
  return [...left, ...right];
}

/**
 * Extract centerline from wall/kerb/foundation polygon outline for labels.
 * Returns n+1 points for n segments.
 */
export function polygonToCenterline(outline: Point[]): Point[] {
  const n = outline.length;
  if (n < 4 || n % 2 !== 0) return [];
  const segCount = (n - 2) / 2;
  const centerline: Point[] = [];
  for (let i = 0; i <= segCount; i++) {
    let leftMid: Point;
    let rightMid: Point;
    if (i === 0) {
      leftMid = midpoint(outline[0], outline[1]);
      rightMid = midpoint(outline[n - 1], outline[n - 2]);
    } else if (i === segCount) {
      leftMid = midpoint(outline[segCount - 1], outline[segCount]);
      rightMid = midpoint(outline[segCount + 1], outline[segCount + 2]);
    } else {
      leftMid = midpoint(outline[i], outline[i + 1]);
      const rightIdx = n - 1 - i;
      rightMid = midpoint(outline[rightIdx], outline[rightIdx - 1]);
    }
    centerline.push(midpoint(leftMid, rightMid));
  }
  return centerline;
}

/**
 * Build path points for a linear element, using curve samples for segments with arcs.
 * Exported for path outline computation (arcs) and segment-based slab layout.
 */
export function getLinearElementPath(shape: Shape): Point[] {
  const pts = shape.points;
  if (pts.length < 2) return [];
  const path: Point[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i];
    const B = pts[i + 1];
    const arcs = shape.edgeArcs?.[i];
    if (arcs && arcs.length > 0) {
      const samples = sampleArcEdge(A, B, arcs, 48);
      for (let s = 1; s < samples.length - 1; s++) {
        path.push(samples[s]);
      }
    }
    path.push(B);
  }
  return path;
}

// Point-in-polygon (ray casting)
function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Minimum hit area in screen pixels — ensures fence/wall/kerb are easy to click */
const LINEAR_HIT_MIN_SCREEN_PX = 24;

function getLinearElementThicknessM(shape: Shape): number {
  let thicknessM: number;
  if (shape.elementType === "wall") {
    const layingMethod = shape.calculatorInputs?.layingMethod as "flat" | "standing" | undefined;
    const subType = shape.calculatorSubType as string | undefined;
    if (layingMethod === "flat") {
      thicknessM = 0.215;
    } else {
      thicknessM = subType === "block7" ? 0.14 : 0.10;
    }
  } else {
    thicknessM = shape.thickness ?? 0.10;
  }
  if (shape.elementType === "wall" && shape.calculatorInputs?.includeTileInstallation) {
    const slabCm = parseFloat(String(shape.calculatorInputs?.wallTileSlabThicknessCm ?? 2)) || 2;
    const adhesiveCm = parseFloat(String(shape.calculatorInputs?.wallTileAdhesiveThicknessCm ?? 0.5)) || 0.5;
    thicknessM += (2 * slabCm + 2 * adhesiveCm) / 100;
  }
  return thicknessM;
}

/** Thickness for wall/kerb/foundation WITHOUT mortar — for polygon conversion and adjustment layer. */
export function getPolygonThicknessM(shape: Shape): number {
  if (shape.elementType === "wall") {
    const layingMethod = shape.calculatorInputs?.layingMethod as "flat" | "standing" | undefined;
    const subType = shape.calculatorSubType as string | undefined;
    let thicknessM: number;
    if (layingMethod === "flat") {
      thicknessM = 0.215;
    } else {
      thicknessM = subType === "block7" ? 0.14 : 0.10;
    }
    if (shape.calculatorInputs?.includeTileInstallation) {
      const slabCm = parseFloat(String(shape.calculatorInputs?.wallTileSlabThicknessCm ?? 2)) || 2;
      const adhesiveCm = parseFloat(String(shape.calculatorInputs?.wallTileAdhesiveThicknessCm ?? 0.5)) || 0.5;
      thicknessM += (2 * slabCm + 2 * adhesiveCm) / 100;
    }
    return thicknessM;
  }
  if (shape.elementType === "kerb") {
    const kerbType = shape.calculatorSubType as "kl" | "rumbled" | "flat" | "sets" | undefined;
    const inputs = shape.calculatorInputs ?? {};
    if (kerbType === "kl") return 0.10;
    if (kerbType === "flat") {
      const idx = Number(inputs.selectedFlatDimensionsIndex ?? 0);
      const opts = [{ length: 100, height: 15, width: 5 }, { length: 100, height: 20, width: 5 }];
      return ((opts[idx] ?? opts[0]).width / 100) as number;
    }
    if (kerbType === "rumbled") {
      const standing = Boolean(inputs.isRumbledStanding);
      return standing ? 0.08 : 0.08;
    }
    if (kerbType === "sets") {
      const lengthwise = Boolean(inputs.setsLengthwise);
      return lengthwise ? 0.10 : 0.10;
    }
    return 0.10;
  }
  if (shape.elementType === "foundation") {
    return shape.thickness ?? 0.30;
  }
  return 0.10;
}

export function hitTestLinearElement(wp: Point, shape: Shape, zoom: number): boolean {
  const pts = shape.points;
  if (pts.length < 2) return false;
  if (isPolygonLinearElement(shape) && shape.closed && pts.length >= 3) {
    return pointInPolygon(wp, pts);
  }
  const pathPts = getLinearElementPath(shape);
  const thicknessM = getLinearElementThicknessM(shape);
  const thicknessPx = toPixels(thicknessM);
  const minHitPx = LINEAR_HIT_MIN_SCREEN_PX / zoom;
  const hitWidthPx = Math.max(thicknessPx, minHitPx, 12);
  const outline = computeThickPolyline(pathPts, hitWidthPx);
  return pointInPolygon(wp, outline);
}

export function hitTestPathElement(wp: Point, shape: Shape, zoom: number): boolean {
  if (!shape.closed) return false;
  if (shape.calculatorInputs?.pathIsOutline) {
    return pointInPolygon(wp, shape.points);
  }
  const pts = shape.points;
  if (pts.length < 2) return false;
  const pathWidthM = Number(shape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6;
  const thicknessPx = toPixels(pathWidthM);
  const minHitPx = LINEAR_HIT_MIN_SCREEN_PX / zoom;
  const hitWidthPx = Math.max(thicknessPx, minHitPx, 12);
  const outline = computeThickPolyline(pts, hitWidthPx);
  return pointInPolygon(wp, outline);
}

type WorldToScreen = (wx: number, wy: number) => Point;

// ── Drawing ───────────────────────────────────────────────────

export function drawLinearElement(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  zoom: number,
  isSelected: boolean,
  isHovered: boolean,
  isPointLinked?: (pointIdx: number) => boolean
): void {
  const pts = shape.points;
  if (pts.length < 2) return;

  const isPolygon = isPolygonLinearElement(shape) && shape.closed && pts.length >= 3;
  let outline: Point[];
  let centerlinePts: Point[];
  let segmentLengthsM: number[];

  if (isPolygon) {
    outline = pts;
    centerlinePts = polygonToCenterline(pts);
    segmentLengthsM = polygonToSegmentLengths(pts);
  } else {
    const pathPts = getLinearElementPath(shape);
    const thicknessM = getLinearElementThicknessM(shape);
    const thicknessPx = Math.max(4, toPixels(thicknessM) * zoom);
    outline = computeThickPolyline(pathPts, thicknessPx);
    centerlinePts = pathPts;
    segmentLengthsM = [];
  }

  const fillColor = linearElementColor(shape.elementType);
  const strokeColor = isSelected ? C.accent : isHovered ? C.edgeHover : fillColor;

  ctx.beginPath();
  const s0 = worldToScreen(outline[0].x, outline[0].y);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < outline.length; i++) {
    const s = worldToScreen(outline[i].x, outline[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = isSelected ? 2.5 : 1.5;
  if (shape.elementType === "kerb") {
    ctx.setLineDash([12, 6]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (isPointLinked && !isPolygon) {
    ctx.lineWidth = isSelected ? 2 : 1.2;
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i];
      const B = pts[i + 1];
      const sa = worldToScreen(A.x, A.y);
      const sb = worldToScreen(B.x, B.y);
      const sm = midpoint(sa, sb);
      if (isPointLinked(i)) drawAlternatingLinkedHalf(ctx, sa.x, sa.y, sm.x, sm.y);
      else { ctx.strokeStyle = strokeColor; ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sm.x, sm.y); ctx.stroke(); }
      if (isPointLinked(i + 1)) drawAlternatingLinkedHalf(ctx, sm.x, sm.y, sb.x, sb.y);
      else { ctx.strokeStyle = strokeColor; ctx.beginPath(); ctx.moveTo(sm.x, sm.y); ctx.lineTo(sb.x, sb.y); ctx.stroke(); }
    }
  }

  // Segment length labels
  const segCount = isPolygon ? segmentLengthsM.length : pts.length - 1;
  for (let i = 0; i < segCount; i++) {
    const len = isPolygon ? toPixels(segmentLengthsM[i]!) : calcEdgeLengthWithArcs(pts[i], pts[i + 1], shape.edgeArcs?.[i]);
    const mid = isPolygon ? centerlinePts[i]! : midpoint(pts[i], pts[i + 1]);
    const sm = worldToScreen(mid.x, mid.y);
    const nextPt = isPolygon ? centerlinePts[i + 1]! : pts[i + 1];
    const dx = nextPt.x - mid.x;
    const dy = nextPt.y - mid.y;
    const norm = Math.atan2(-dx, dy);
    const offset = 14;
    const lx = sm.x + Math.cos(norm) * offset;
    const ly = sm.y + Math.sin(norm) * offset;
    ctx.font = "11px 'JetBrains Mono',monospace";
    ctx.fillStyle = C.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(formatLength(len), lx, ly);
    if (shape.elementType === "wall") {
      const segHeights = shape.calculatorInputs?.segmentHeights as Array<{ startH: number; endH: number }> | undefined;
      const defaultH = parseFloat(String(shape.calculatorInputs?.height ?? "0")) || 0;
      const seg = segHeights?.[i];
      const hStart = seg?.startH ?? defaultH;
      const hEnd = seg?.endH ?? defaultH;
      const hLabel = Math.abs(hStart - hEnd) < 0.001
        ? `h=${hStart.toFixed(2)}m`
        : `h=${hStart.toFixed(2)}↘${hEnd.toFixed(2)}m`;
      ctx.font = "10px 'JetBrains Mono',monospace";
      ctx.fillStyle = C.accent;
      ctx.fillText(hLabel, lx, ly + 14);
    }
  }

  // Corner angle labels (for interior corners)
  if (!isPolygon) {
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const next = pts[i + 1];
      const angle = angleDeg(prev, curr, next);
      const sc = worldToScreen(curr.x, curr.y);
      ctx.font = "10px 'JetBrains Mono',monospace";
      ctx.fillStyle = C.angleText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(angle.toFixed(1) + "°", sc.x, sc.y - 12);
    }
  } else if (centerlinePts.length >= 3) {
    for (let i = 1; i < centerlinePts.length - 1; i++) {
      const prev = centerlinePts[i - 1];
      const curr = centerlinePts[i];
      const next = centerlinePts[i + 1];
      const angle = angleDeg(prev, curr, next);
      const sc = worldToScreen(curr.x, curr.y);
      ctx.font = "10px 'JetBrains Mono',monospace";
      ctx.fillStyle = C.angleText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(angle.toFixed(1) + "°", sc.x, sc.y - 12);
    }
  }

  // Total length label
  const totalLenM = isPolygon ? segmentLengthsM.reduce((a, b) => a + b, 0) : polylineLengthMeters(pts);
  const ctr = centroid(outline);
  const sc = worldToScreen(ctr.x, ctr.y);
  ctx.font = "bold 12px 'JetBrains Mono',monospace";
  ctx.fillStyle = C.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(totalLenM.toFixed(3) + " m", sc.x, sc.y);

  // Type badge (F/W/K/Fd or groundwork: Dr/Ca/Wa/Cb)
  const badgeText = shape.elementType === "fence" ? "F" : shape.elementType === "wall" ? "W" : shape.elementType === "kerb" ? "K" : shape.elementType === "foundation" ? "Fd" : shape.elementType === "drainage" ? "Dr" : shape.elementType === "canalPipe" ? "Ca" : shape.elementType === "waterPipe" ? "Wa" : shape.elementType === "cable" ? "Cb" : "?";
  ctx.font = "bold 10px 'JetBrains Mono',monospace";
  ctx.fillStyle = C.badge;
  ctx.fillRect(sc.x - 14, sc.y - 22, 28, 14);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(sc.x - 14, sc.y - 22, 28, 14);
  ctx.fillStyle = strokeColor;
  ctx.fillText(badgeText, sc.x, sc.y - 15);
}

export function drawLinearElementInactive(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  zoom: number
): void {
  const pts = shape.points;
  if (pts.length < 2) return;

  const isPolygon = isPolygonLinearElement(shape) && shape.closed && pts.length >= 3;
  let outline: Point[];
  let totalLenM: number;

  if (isPolygon) {
    outline = pts;
    totalLenM = polygonToSegmentLengths(pts).reduce((a, b) => a + b, 0);
  } else {
    const pathPts = getLinearElementPath(shape);
    const thicknessM = getLinearElementThicknessM(shape);
    const thicknessPx = Math.max(4, toPixels(thicknessM) * zoom);
    outline = computeThickPolyline(pathPts, thicknessPx);
    totalLenM = polylineLengthMeters(pts);
  }

  const fillColor = linearElementDimColor(shape.elementType);

  ctx.beginPath();
  const s0 = worldToScreen(outline[0].x, outline[0].y);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < outline.length; i++) {
    const s = worldToScreen(outline[i].x, outline[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = C.inactiveEdge;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const ctr = centroid(outline);
  const sc = worldToScreen(ctr.x, ctr.y);
  ctx.font = "11px 'JetBrains Mono',monospace";
  ctx.fillStyle = C.inactiveEdge;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(totalLenM.toFixed(3) + " m", sc.x, sc.y);
}
