// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — visualization/grassRolls.ts
// Artificial grass piece placement and rendering
// ══════════════════════════════════════════════════════════════

import { Point, Shape, toPixels, toMeters, areaM2, distance, formatLength, midpoint, edgeNormalAngle, labelAnchorInsidePolygon, centroid } from "../geometry";
import { getEffectivePolygon as getEffectivePolygonWithArcs } from "../arcMath";
import { shrinkPolygon } from "./slabPattern";

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

/** Trim amount per edge when grass is cut (cm). Each trimmed edge reduces effective size by this. Matches modal "3 cm". */
const TRIM_CM_PER_EDGE = 3;
const TRIM_M_PER_EDGE = TRIM_CM_PER_EDGE / 100;

export interface GrassPiece {
  id: string;
  widthM: number;
  lengthM: number;
  x: number;
  y: number;
  rotation: 0 | 90;
  joinedTo?: string[];
  trimmed?: boolean;
  trimEdges?: number[];
  /** Effective width after trim (for inputs/display). */
  effectiveWidthM?: number;
  /** Effective length after trim (for inputs/display). */
  effectiveLengthM?: number;
}

export interface CoverageResult {
  covered: boolean;
  coveragePercent: number;
  wastePercent: number;
  joinLengthM: number;
  trimLengthM: number;
}

function getBoundingBox(pts: Point[]): { minX: number; minY: number; width: number; height: number } {
  if (pts.length === 0) return { minX: 0, minY: 0, width: 0, height: 0 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
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

/** Raw corners without trim (for join detection). */
function getRawPieceCorners(piece: GrassPiece): Point[] {
  const wPx = toPixels(piece.widthM);
  const lPx = toPixels(piece.lengthM);
  const [w, l] = piece.rotation === 90 ? [lPx, wPx] : [wPx, lPx];
  return [
    { x: piece.x, y: piece.y },
    { x: piece.x + l, y: piece.y },
    { x: piece.x + l, y: piece.y + w },
    { x: piece.x, y: piece.y + w },
  ];
}

const JOIN_THRESHOLD_PX = toPixels(0.2);

/**
 * Auto-join all adjacent grass pieces. Pieces are adjacent when they have parallel edges
 * within JOIN_THRESHOLD. Also applies default 3cm trim on joined edges.
 */
export function autoJoinAdjacentPieces(pieces: GrassPiece[]): GrassPiece[] {
  if (pieces.length < 2) return pieces;
  const result = pieces.map(p => ({ ...p, joinedTo: [...(p.joinedTo ?? [])], trimEdges: [...(p.trimEdges ?? [])] }));
  for (let i = 0; i < result.length; i++) {
    const c1 = getRawPieceCorners(result[i]);
    for (let j = i + 1; j < result.length; j++) {
      const c2 = getRawPieceCorners(result[j]);
      let foundJoin = false;
      let joinEdgeA = -1;
      for (let e1 = 0; e1 < 4 && !foundJoin; e1++) {
        const a1 = c1[e1];
        const b1 = c1[(e1 + 1) % 4];
        const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
        for (let e2 = 0; e2 < 4; e2++) {
          const a2 = c2[e2];
          const b2 = c2[(e2 + 1) % 4];
          if (!edgesParallel(a1, b1, a2, b2)) continue;
          const perpDist = distancePointToSegment(mid1, a2, b2);
          if (perpDist < JOIN_THRESHOLD_PX) {
            foundJoin = true;
            joinEdgeA = e1;
            break;
          }
        }
      }
      if (foundJoin && joinEdgeA >= 0) {
        const pa = result[i];
        const pb = result[j];
        if (!(pa.joinedTo ?? []).includes(pb.id)) {
          result[i] = { ...result[i], joinedTo: [...(result[i].joinedTo ?? []), pb.id] };
          result[j] = { ...result[j], joinedTo: [...(result[j].joinedTo ?? []), pa.id] };
        }
        const joinEdgeB = (joinEdgeA + 2) % 4;
        const trimA = [...(result[i].trimEdges ?? [])];
        const trimB = [...(result[j].trimEdges ?? [])];
        if (!trimA.includes(joinEdgeA)) trimA.push(joinEdgeA);
        if (!trimB.includes(joinEdgeB)) trimB.push(joinEdgeB);
        result[i] = { ...result[i], trimmed: true, trimEdges: trimA };
        result[j] = { ...result[j], trimmed: true, trimEdges: trimB };
      }
    }
  }
  return result;
}

/** Edge indices of piece at pieceIdx that are joined to another piece (parallel + close). */
function getJoinedEdgeIndices(pieceIdx: number, pieces: GrassPiece[]): Set<number> {
  const joined = new Set<number>();
  const c1 = getRawPieceCorners(pieces[pieceIdx]);
  for (let j = 0; j < pieces.length; j++) {
    if (j === pieceIdx) continue;
    const c2 = getRawPieceCorners(pieces[j]);
    for (let e1 = 0; e1 < 4; e1++) {
      const a1 = c1[e1];
      const b1 = c1[(e1 + 1) % 4];
      const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
      for (let e2 = 0; e2 < 4; e2++) {
        const a2 = c2[e2];
        const b2 = c2[(e2 + 1) % 4];
        if (!edgesParallel(a1, b1, a2, b2)) continue;
        const perpDist = distancePointToSegment(mid1, a2, b2);
        if (perpDist < JOIN_THRESHOLD_PX) joined.add(e1);
      }
    }
  }
  return joined;
}

/** Effective dimensions and origin for canvas rendering.
 *  Overlap model: dimensions stay nominal (4m). The piece whose join edge is on the
 *  "incoming" side (left=3, top=0) shifts 2×TRIM (6cm) toward its partner, creating
 *  a 6cm visual overlap. Dimensions are never reduced. */
function getEffectivePieceDimensions(
  piece: GrassPiece,
  _allPieces?: GrassPiece[],
  _pieceIdx?: number
): { widthM: number; lengthM: number; x: number; y: number } {
  const trimEdges = piece.trimEdges ?? [];
  if (trimEdges.length === 0) {
    return { widthM: piece.widthM, lengthM: piece.lengthM, x: piece.x, y: piece.y };
  }
  const OVERLAP_PX = toPixels(TRIM_M_PER_EDGE * 2);
  const offsetX = trimEdges.includes(3) ? -OVERLAP_PX : 0;
  const offsetY = trimEdges.includes(0) ? -OVERLAP_PX : 0;
  return {
    widthM: piece.widthM,
    lengthM: piece.lengthM,
    x: piece.x + offsetX,
    y: piece.y + offsetY,
  };
}

/** Effective total area (m²) of all pieces after trim. For use in calculator inputs. */
export function getEffectiveTotalArea(pieces: GrassPiece[]): number {
  let sum = 0;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (!p) continue;
    const dim = p.trimEdges && p.trimEdges.length > 0
      ? getEffectivePieceDimensions(p, pieces, i)
      : { widthM: p.widthM, lengthM: p.lengthM };
    sum += dim.widthM * dim.lengthM;
  }
  return sum;
}

/** Effective dimensions for a piece (for storing in inputs). */
export function getEffectivePieceDimensionsForInput(
  piece: GrassPiece,
  allPieces?: GrassPiece[],
  pieceIdx?: number
): { effectiveWidthM: number; effectiveLengthM: number } {
  const dim = piece.trimEdges && piece.trimEdges.length > 0
    ? getEffectivePieceDimensions(piece, allPieces, pieceIdx)
    : { widthM: piece.widthM, lengthM: piece.lengthM };
  return { effectiveWidthM: dim.widthM, effectiveLengthM: dim.lengthM };
}

export function getPieceCorners(piece: GrassPiece, allPieces?: GrassPiece[], pieceIdx?: number): Point[] {
  const dim =
    piece.trimEdges && piece.trimEdges.length > 0
      ? getEffectivePieceDimensions(piece, allPieces, pieceIdx)
      : { widthM: piece.widthM, lengthM: piece.lengthM, x: piece.x, y: piece.y };
  const wPx = toPixels(dim.widthM);
  const lPx = toPixels(dim.lengthM);
  const [w, l] = piece.rotation === 90 ? [lPx, wPx] : [wPx, lPx];
  return [
    { x: dim.x, y: dim.y },
    { x: dim.x + l, y: dim.y },
    { x: dim.x + l, y: dim.y + w },
    { x: dim.x, y: dim.y + w },
  ];
}

function getEffectivePolygon(shape: Shape): Point[] {
  let pts = shape.edgeArcs?.some(a => a && a.length > 0)
    ? getEffectivePolygonWithArcs(shape)
    : shape.points;
  const frameWidthCm = Number(shape.calculatorInputs?.framePieceWidthCm ?? 0);
  if (frameWidthCm > 0 && pts.length >= 3 && shape.closed) {
    const frameWidthPx = toPixels(frameWidthCm / 100);
    pts = shrinkPolygon(pts, frameWidthPx);
  }
  return pts;
}

/**
 * Auto-layout grass pieces within shape bounding box.
 * Places pieces left-to-right (along) or top-to-bottom (across) based on rollsOrientation.
 * Extends the last piece in each row/column to fill the gap so coverage reaches 100%.
 */
export function autoLayoutGrassPieces(shape: Shape, pieces: GrassPiece[]): GrassPiece[] {
  if (pieces.length === 0) return [];
  const pts = getEffectivePolygon(shape);
  const bbox = getBoundingBox(pts);
  if (bbox.width < 1 || bbox.height < 1) return pieces;

  const rollsOrientation = (shape.calculatorInputs?.rollsOrientation as "along" | "across") || "along";
  const result: GrassPiece[] = [];
  let x = bbox.minX;
  let y = bbox.minY;
  let rowMaxH = 0;
  let colMaxW = 0;

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const wPx = toPixels(piece.widthM);
    const lPx = toPixels(piece.lengthM);
    const [w, l] = piece.rotation === 90 ? [lPx, wPx] : [wPx, lPx];

    if (rollsOrientation === "along") {
      // Horizontal: left-to-right, wrap to next row
      if (i > 0 && x + l > bbox.minX + bbox.width + 0.01) {
        x = bbox.minX;
        y += rowMaxH;
        rowMaxH = 0;
      }
      const rightEdge = bbox.minX + bbox.width;
      const remainingPx = rightEdge - x;
      const remainingM = toMeters(remainingPx);
      if (remainingM > 0.01 && remainingM < piece.lengthM - 0.01) {
        result.push({ ...piece, x, y, lengthM: remainingM });
        x = rightEdge;
      } else {
        result.push({ ...piece, x, y });
        x += l;
      }
      if (w > rowMaxH) rowMaxH = w;
    } else {
      // Across: top-to-bottom, wrap to next column
      if (i > 0 && y + w > bbox.minY + bbox.height + 0.01) {
        y = bbox.minY;
        x += colMaxW;
        colMaxW = 0;
      }
      const bottomEdge = bbox.minY + bbox.height;
      const remainingPx = bottomEdge - y;
      const remainingM = toMeters(remainingPx);
      if (remainingM > 0.01 && remainingM < piece.widthM - 0.01) {
        result.push({ ...piece, x, y, widthM: remainingM });
        y = bottomEdge;
      } else {
        result.push({ ...piece, x, y });
        y += w;
      }
      if (l > colMaxW) colMaxW = l;
    }
  }

  return result;
}

function pointInRect(p: Point, corners: Point[]): boolean {
  const minX = Math.min(...corners.map(c => c.x));
  const maxX = Math.max(...corners.map(c => c.x));
  const minY = Math.min(...corners.map(c => c.y));
  const maxY = Math.max(...corners.map(c => c.y));
  return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
}

export function hitTestGrassPiece(world: Point, shape: Shape): number | null {
  const pieces = (shape.calculatorInputs?.vizPieces as GrassPiece[]) ?? [];
  const pts = getEffectivePolygon(shape);
  const dirDeg = Number(shape.calculatorInputs?.grassVizDirection ?? 0);
  const ctr = pts.length >= 3 ? centroid(pts) : { x: 0, y: 0 };
  const worldLocal = Math.abs(dirDeg) >= 0.01 ? rotatePointAround(world, ctr, -dirDeg) : world;
  for (let i = pieces.length - 1; i >= 0; i--) {
    const corners = getPieceCorners(pieces[i], pieces, i);
    if (pointInRect(worldLocal, corners)) return i;
  }
  return null;
}

function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len)));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.sqrt((p.x - proj.x) ** 2 + (p.y - proj.y) ** 2);
}

/** Intersection of segment (a,b) with segment (c,d). Returns t in [0,1] for point on (a,b), or null. */
function segmentSegmentIntersection(a: Point, b: Point, c: Point, d: Point): number | null {
  const dx1 = b.x - a.x, dy1 = b.y - a.y;
  const dx2 = d.x - c.x, dy2 = d.y - c.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((c.x - a.x) * dy2 - (c.y - a.y) * dx2) / denom;
  if (t < 0 || t > 1) return null;
  const u = ((c.x - a.x) * dy1 - (c.y - a.y) * dx1) / denom;
  if (u < 0 || u > 1) return null;
  return t;
}

/**
 * Length of segment (a,b) that lies INSIDE the polygon (in world units).
 */
function clipSegmentToPolygonInside(a: Point, b: Point, pts: Point[]): number {
  const ts: number[] = [0, 1];
  for (let i = 0; i < pts.length; i++) {
    const c = pts[i];
    const d = pts[(i + 1) % pts.length];
    const t = segmentSegmentIntersection(a, b, c, d);
    if (t !== null && t > 1e-9 && t < 1 - 1e-9) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  let insideLen = 0;
  const segLen = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  for (let k = 0; k < ts.length - 1; k++) {
    const tMid = (ts[k] + ts[k + 1]) / 2;
    const pMid = { x: a.x + tMid * (b.x - a.x), y: a.y + tMid * (b.y - a.y) };
    if (pointInPolygon(pMid, pts)) insideLen += (ts[k + 1] - ts[k]) * segLen;
  }
  return insideLen;
}

/**
 * Length of segment (a,b) that lies OUTSIDE the polygon (in world units).
 */
function clipSegmentToPolygonOutside(a: Point, b: Point, pts: Point[]): number {
  const segLen = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  return segLen - clipSegmentToPolygonInside(a, b, pts);
}

function edgesParallel(a1: Point, b1: Point, a2: Point, b2: Point): boolean {
  const v1x = b1.x - a1.x;
  const v1y = b1.y - a1.y;
  const v2x = b2.x - a2.x;
  const v2y = b2.y - a2.y;
  const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
  if (len1 < 1e-10 || len2 < 1e-10) return false;
  const dot = Math.abs((v1x * v2x + v1y * v2y) / (len1 * len2));
  return dot > 0.99;
}

/**
 * Snap a grass piece to nearby parallel edges of other pieces.
 * Returns snapped piece and info about the nearest edge if within threshold.
 */
export function snapGrassPieceEdge(
  piece: GrassPiece,
  allPieces: GrassPiece[],
  pieceIdx: number,
  threshold: number
): { snappedPiece: GrassPiece; nearEdge: { otherPieceIdx: number; edgeIdx: number } | null } {
  const corners = getPieceCorners(piece, allPieces, pieceIdx);
  let bestCorrection = { x: 0, y: 0 };
  let bestDist = Infinity;
  let nearEdge: { otherPieceIdx: number; edgeIdx: number } | null = null;

  for (let e1 = 0; e1 < 4; e1++) {
    const a1 = corners[e1];
    const b1 = corners[(e1 + 1) % 4];
    const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };

    for (let j = 0; j < allPieces.length; j++) {
      if (j === pieceIdx) continue;
      const otherCorners = getPieceCorners(allPieces[j], allPieces, j);
      for (let e2 = 0; e2 < 4; e2++) {
        const a2 = otherCorners[e2];
        const b2 = otherCorners[(e2 + 1) % 4];
        if (!edgesParallel(a1, b1, a2, b2)) continue;

        const dist = distancePointToSegment(mid1, a2, b2);
        if (dist < threshold && dist < bestDist) {
          const dx = b2.x - a2.x;
          const dy = b2.y - a2.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < 1e-10) continue;
          const t = ((mid1.x - a2.x) * dx + (mid1.y - a2.y) * dy) / (len * len);
          const proj = { x: a2.x + t * dx, y: a2.y + t * dy };
          const correction = { x: proj.x - mid1.x, y: proj.y - mid1.y };
          bestDist = dist;
          bestCorrection = correction;
          nearEdge = { otherPieceIdx: j, edgeIdx: e1 };
        }
      }
    }
  }

  const snappedPiece = {
    ...piece,
    x: piece.x + bestCorrection.x,
    y: piece.y + bestCorrection.y,
  };
  return { snappedPiece, nearEdge };
}

/**
 * Hit test for grass piece length edges (for scaling).
 * Returns piece index and which length edge (start or end) was hit.
 */
export function hitTestGrassPieceEdge(
  world: Point,
  shape: Shape,
  threshold: number
): { pieceIdx: number; edge: "length_start" | "length_end" } | null {
  const pieces = (shape.calculatorInputs?.vizPieces as GrassPiece[]) ?? [];
  const pts = getEffectivePolygon(shape);
  const dirDeg = Number(shape.calculatorInputs?.grassVizDirection ?? 0);
  const ctr = pts.length >= 3 ? centroid(pts) : { x: 0, y: 0 };
  const worldLocal = Math.abs(dirDeg) >= 0.01 ? rotatePointAround(world, ctr, -dirDeg) : world;
  for (let i = pieces.length - 1; i >= 0; i--) {
    const piece = pieces[i];
    const corners = getPieceCorners(piece, pieces, i);
    const caps: { e: number; label: "length_start" | "length_end" }[] = piece.rotation === 90
      ? [{ e: 0, label: "length_start" }, { e: 2, label: "length_end" }]
      : [{ e: 3, label: "length_start" }, { e: 1, label: "length_end" }];
    for (const cap of caps) {
      const a = corners[cap.e];
      const b = corners[(cap.e + 1) % 4];
      const d = distancePointToSegment(worldLocal, a, b);
      if (d < threshold) {
        return { pieceIdx: i, edge: cap.label };
      }
    }
  }
  return null;
}

/**
 * Hit test for join edge between two adjacent grass pieces.
 * Returns piece indices and edge index if click is near a join edge.
 * For unjoined: returns grassJoin. For already joined: returns grassUnjoin.
 */
export function hitTestGrassJoinEdge(
  world: Point,
  shape: Shape,
  threshold: number
): { pieceAIdx: number; pieceBIdx: number; edgeAIdx: number; isJoined: boolean } | null {
  const pieces = (shape.calculatorInputs?.vizPieces as GrassPiece[]) ?? [];
  const effPts = getEffectivePolygon(shape);
  const dirDeg = Number(shape.calculatorInputs?.grassVizDirection ?? 0);
  const ctr = effPts.length >= 3 ? centroid(effPts) : { x: 0, y: 0 };
  const worldLocal = Math.abs(dirDeg) >= 0.01 ? rotatePointAround(world, ctr, -dirDeg) : world;
  const pts = shape.points;
  if (!shape.closed || pts.length < 3 || pieces.length < 2) return null;

  let best: { pieceAIdx: number; pieceBIdx: number; edgeAIdx: number; isJoined: boolean; dist: number } | null = null;

  for (let i = 0; i < pieces.length; i++) {
    const c1 = getPieceCorners(pieces[i], pieces, i);
    for (let j = i + 1; j < pieces.length; j++) {
      const c2 = getPieceCorners(pieces[j], pieces, j);
      const pa = pieces[i];
      const pb = pieces[j];
      const isJoined = (pa.joinedTo ?? []).includes(pb.id) || (pb.joinedTo ?? []).includes(pa.id);

      for (let e1 = 0; e1 < 4; e1++) {
        const a1 = c1[e1];
        const b1 = c1[(e1 + 1) % 4];
        const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };

        for (let e2 = 0; e2 < 4; e2++) {
          const a2 = c2[e2];
          const b2 = c2[(e2 + 1) % 4];
          if (!edgesParallel(a1, b1, a2, b2)) continue;

          const perpDist = distancePointToSegment(mid1, a2, b2);
          if (perpDist >= toPixels(0.2)) continue;

          const distToClick = distancePointToSegment(worldLocal, a1, b1);
          if (distToClick < threshold && (!best || distToClick < best.dist)) {
            best = { pieceAIdx: i, pieceBIdx: j, edgeAIdx: e1, isJoined, dist: distToClick };
          }
        }
      }
    }
  }

  return best ? { pieceAIdx: best.pieceAIdx, pieceBIdx: best.pieceBIdx, edgeAIdx: best.edgeAIdx, isJoined: best.isJoined } : null;
}

/**
 * Snap a grass piece to polygon (container) edges.
 * Returns snapped piece and indices of polygon edges that are aligned.
 */
export function snapGrassPieceToPolygon(
  piece: GrassPiece,
  shape: Shape,
  threshold: number
): { snappedPiece: GrassPiece; alignedPolyEdges: number[] } {
  const pts = shape.points;
  if (!shape.closed || pts.length < 3) return { snappedPiece: piece, alignedPolyEdges: [] };

  const corners = getPieceCorners(piece);
  let bestCorrection = { x: 0, y: 0 };
  let bestDist = Infinity;
  const alignedEdges = new Set<number>();

  for (const c of corners) {
    for (let ei = 0; ei < pts.length; ei++) {
      const a = pts[ei];
      const b = pts[(ei + 1) % pts.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-10) continue;
      const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / (len * len)));
      const proj = { x: a.x + t * dx, y: a.y + t * dy };
      const dist = Math.sqrt((c.x - proj.x) ** 2 + (c.y - proj.y) ** 2);
      if (dist < threshold && dist < bestDist) {
        bestDist = dist;
        bestCorrection = { x: proj.x - c.x, y: proj.y - c.y };
        alignedEdges.add(ei);
      }
    }
  }

  const snappedPiece = {
    ...piece,
    x: piece.x + bestCorrection.x,
    y: piece.y + bestCorrection.y,
  };

  const alignedPolyEdgesFinal = new Set<number>();
  const snappedCorners = getPieceCorners(snappedPiece);
  for (const c of snappedCorners) {
    for (let ei = 0; ei < pts.length; ei++) {
      const a = pts[ei];
      const b = pts[(ei + 1) % pts.length];
      const d = distancePointToSegment(c, a, b);
      if (d < threshold) alignedPolyEdgesFinal.add(ei);
    }
  }

  return { snappedPiece, alignedPolyEdges: Array.from(alignedPolyEdgesFinal).sort((a, b) => a - b) };
}

/**
 * Get indices of all pieces that are joined (directly or indirectly) to the given piece.
 */
export function getJoinedGroup(pieces: GrassPiece[], pieceIdx: number): number[] {
  const piece = pieces[pieceIdx];
  if (!piece) return [pieceIdx];
  const joined = new Set<number>();
  const queue = [pieceIdx];

  while (queue.length > 0) {
    const idx = queue.shift()!;
    if (joined.has(idx)) continue;
    joined.add(idx);
    const p = pieces[idx];
    const ids = p?.joinedTo ?? [];
    for (const id of ids) {
      const j = pieces.findIndex(pi => pi.id === id);
      if (j >= 0 && !joined.has(j)) queue.push(j);
    }
  }
  return Array.from(joined);
}

/**
 * Validate coverage of polygon by grass pieces.
 * Coverage = % of ELEMENT covered by pattern. Sample the element, count points inside any piece.
 * Accounts for grassVizDirection (pattern rotation around shape centroid).
 */
export function validateCoverage(shape: Shape, pieces: GrassPiece[]): CoverageResult {
  const pts = getEffectivePolygon(shape);
  const shapeAreaM2 = shape.closed && pts.length >= 3 ? areaM2(pts) : 0;
  const dirDeg = Number(shape.calculatorInputs?.grassVizDirection ?? 0);
  const ctr = pts.length >= 3 ? centroid(pts) : { x: 0, y: 0 };

  const getCornersForCoverage = (pi: number): Point[] => {
    const corners = getPieceCorners(pieces[pi], pieces, pi);
    if (Math.abs(dirDeg) >= 0.01) {
      return corners.map(c => rotatePointAround(c, ctr, dirDeg));
    }
    return corners;
  };

  let totalPieceArea = 0;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const dim = piece.trimEdges && piece.trimEdges.length > 0
      ? getEffectivePieceDimensions(piece, pieces, i)
      : { widthM: piece.widthM, lengthM: piece.lengthM };
    totalPieceArea += dim.widthM * dim.lengthM;
  }

  let coveredCount = 0;
  let totalSamplesInShape = 0;
  const stepPx = toPixels(0.15);
  const bbox = getBoundingBox(pts);
  for (let gx = bbox.minX + stepPx / 2; gx < bbox.minX + bbox.width; gx += stepPx) {
    for (let gy = bbox.minY + stepPx / 2; gy < bbox.minY + bbox.height; gy += stepPx) {
      const p = { x: gx, y: gy };
      if (!pointInPolygon(p, pts)) continue;
      totalSamplesInShape++;
      for (let pi = 0; pi < pieces.length; pi++) {
        if (pointInPolygon(p, getCornersForCoverage(pi))) {
          coveredCount++;
          break;
        }
      }
    }
  }

  const coveredArea = totalSamplesInShape > 0 ? (coveredCount / totalSamplesInShape) * shapeAreaM2 : 0;
  let joinLengthM = 0;

  const joinsLog: { pieceA: number; pieceB: number; e1: number; e2: number; insideLenM: number; perpDistPx: number }[] = [];
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const c1 = getCornersForCoverage(i);
      const c2 = getCornersForCoverage(j);
      for (let e1 = 0; e1 < 4; e1++) {
        const a1 = c1[e1];
        const b1 = c1[(e1 + 1) % 4];
        const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
        for (let e2 = 0; e2 < 4; e2++) {
          const a2 = c2[e2];
          const b2 = c2[(e2 + 1) % 4];
          if (!edgesParallel(a1, b1, a2, b2)) continue;
          const perpDist = distancePointToSegment(mid1, a2, b2);
          if (perpDist >= toPixels(0.2)) continue;
          const insideLen = clipSegmentToPolygonInside(a1, b1, pts);
          const insideLenM = toMeters(insideLen);
          joinLengthM += insideLenM;
          joinsLog.push({ pieceA: i, pieceB: j, e1, e2, insideLenM, perpDistPx: perpDist });
        }
      }
    }
  }

  const wasteArea = totalPieceArea - coveredArea;
  const wastePercent = totalPieceArea > 0 ? (wasteArea / totalPieceArea) * 100 : 0;

  const coveragePercent = shapeAreaM2 > 0 ? Math.min(100, (coveredArea / shapeAreaM2) * 100) : 0;
  const covResult = shapeAreaM2 > 0 && coveragePercent >= 99.99;

  let trimLengthM = 0;
  const trimPerEdge: { edgeIdx: number; edgeLenM: number; segments: { t0: number; t1: number; lenM: number; inside: boolean }[]; contribM: number }[] = [];
  for (let ei = 0; ei < pts.length; ei++) {
    const ea = pts[ei];
    const eb = pts[(ei + 1) % pts.length];
    const ts: number[] = [0, 1];
    for (let pi = 0; pi < pieces.length; pi++) {
      const pc = getCornersForCoverage(pi);
      for (let ci = 0; ci < 4; ci++) {
        const t = segmentSegmentIntersection(ea, eb, pc[ci], pc[(ci + 1) % 4]);
        if (t !== null && t > 1e-9 && t < 1 - 1e-9) ts.push(t);
      }
    }
    ts.sort((x, y) => x - y);
    const edgeLen = Math.sqrt((eb.x - ea.x) ** 2 + (eb.y - ea.y) ** 2);
    const edgeLenM = toMeters(edgeLen);
    const segments: { t0: number; t1: number; lenM: number; inside: boolean }[] = [];
    let edgeContrib = 0;
    for (let k = 0; k < ts.length - 1; k++) {
      const tMid = (ts[k] + ts[k + 1]) / 2;
      const pMid = { x: ea.x + tMid * (eb.x - ea.x), y: ea.y + tMid * (eb.y - ea.y) };
      let inside = false;
      for (let pi = 0; pi < pieces.length; pi++) {
        if (pointInPolygon(pMid, getCornersForCoverage(pi))) {
          trimLengthM += toMeters((ts[k + 1] - ts[k]) * edgeLen);
          edgeContrib += toMeters((ts[k + 1] - ts[k]) * edgeLen);
          inside = true;
          break;
        }
      }
      segments.push({ t0: ts[k], t1: ts[k + 1], lenM: toMeters((ts[k + 1] - ts[k]) * edgeLen), inside });
    }
    trimPerEdge.push({ edgeIdx: ei, edgeLenM, segments, contribM: edgeContrib });
  }

  return {
    covered: shapeAreaM2 > 0 && coveragePercent >= 99.99,
    coveragePercent,
    wastePercent,
    joinLengthM,
    trimLengthM,
  };
}

function rotatePointAround(p: Point, center: Point, deg: number): Point {
  if (Math.abs(deg) < 0.01) return p;
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c };
}

/**
 * Draw grass pieces. Waste visible only when isSelected.
 * When grassScaleInfo is set and matches shapeIdx+pieceIdx, shows current length on the length edges during resize.
 * vizDirectionDeg rotates the entire pattern around shape centroid (0 = no rotation).
 */
export function drawGrassPieces(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  worldToScreen: WorldToScreen,
  zoom: number,
  isSelected: boolean,
  grassScaleInfo?: { shapeIdx: number; pieceIdx: number } | null,
  shapeIdx?: number,
  clipToShape?: boolean,
  vizDirectionDeg?: number
): void {
  const pieces = (shape.calculatorInputs?.vizPieces as GrassPiece[]) ?? [];
  if (pieces.length === 0) return;

  let pts = shape.edgeArcs?.some(a => a && a.length > 0)
    ? getEffectivePolygonWithArcs(shape)
    : shape.points;
  const frameWidthCm = Number(shape.calculatorInputs?.framePieceWidthCm ?? 0);
  if (frameWidthCm > 0 && pts.length >= 3 && shape.closed) {
    const frameWidthPx = toPixels(frameWidthCm / 100);
    pts = shrinkPolygon(pts, frameWidthPx);
    if (pts.length < 3) return;
  }

  const dirDeg = vizDirectionDeg ?? Number(shape.calculatorInputs?.grassVizDirection ?? 0);
  const ctr = pts.length >= 3 ? centroid(pts) : { x: 0, y: 0 };

  /** Draw joint lines between adjacent grass pieces. Always visible (selected or not). */
  const drawJointLines = () => {
    if (pieces.length < 2) return;
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const p1 = pieces[i];
        const p2 = pieces[j];
        const isJoined = (p1.joinedTo ?? []).includes(p2.id) || (p2.joinedTo ?? []).includes(p1.id);
        let c1 = getPieceCorners(p1, pieces, i);
        let c2 = getPieceCorners(p2, pieces, j);
        if (Math.abs(dirDeg) >= 0.01) {
          c1 = c1.map(c => rotatePointAround(c, ctr, dirDeg));
          c2 = c2.map(c => rotatePointAround(c, ctr, dirDeg));
        }
        for (let e1 = 0; e1 < 4; e1++) {
          const a1 = c1[e1];
          const b1 = c1[(e1 + 1) % 4];
          const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
          for (let e2 = 0; e2 < 4; e2++) {
            const a2 = c2[e2];
            const b2 = c2[(e2 + 1) % 4];
            if (!edgesParallel(a1, b1, a2, b2)) continue;
            const perpDist = distancePointToSegment(mid1, a2, b2);
            if (perpDist < toPixels(0.2)) {
              const sa = worldToScreen(a1.x, a1.y);
              const sb = worldToScreen(b1.x, b1.y);
              const smid = worldToScreen(mid1.x, mid1.y);
              if (isJoined) {
                ctx.strokeStyle = "#27ae60";
                ctx.lineWidth = Math.max(2, 3 / zoom);
                ctx.beginPath();
                ctx.moveTo(sa.x, sa.y);
                ctx.lineTo(sb.x, sb.y);
                ctx.stroke();
                ctx.font = "14px sans-serif";
                ctx.fillStyle = "#27ae60";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("🔗", smid.x, smid.y);
              } else {
                ctx.strokeStyle = "rgba(241,196,15,0.8)";
                ctx.setLineDash([6, 4]);
                ctx.lineWidth = Math.max(2, 3 / zoom);
                ctx.beginPath();
                ctx.moveTo(sa.x, sa.y);
                ctx.lineTo(sb.x, sb.y);
                ctx.stroke();
                ctx.setLineDash([]);
              }
              break;
            }
          }
        }
      }
    }
  };

  const doDraw = () => {
  if (!isSelected) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(worldToScreen(pts[0].x, pts[0].y).x, worldToScreen(pts[0].x, pts[0].y).y);
    for (let i = 1; i < pts.length; i++) {
      const s = worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = "rgba(39,174,96,0.4)";
    ctx.fill();
    ctx.restore();
    drawJointLines();
    return;
  }

  const GRID = 8;
  const GREEN = "rgba(39,174,96,0.5)";
  const GRAY = "rgba(127,140,141,0.5)";
  const GRAY_STROKE = "rgba(127,140,141,0.8)";

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    let corners = getPieceCorners(piece, pieces, i);
    if (Math.abs(dirDeg) >= 0.01) {
      corners = corners.map(c => rotatePointAround(c, ctr, dirDeg));
    }
    const c0 = corners[0];
    const c1 = corners[1];
    const c3 = corners[3];
    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    const ex = c3.x - c0.x;
    const ey = c3.y - c0.y;

    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const u0 = gx / GRID;
        const u1 = (gx + 1) / GRID;
        const v0 = gy / GRID;
        const v1 = (gy + 1) / GRID;
        const p00 = { x: c0.x + u0 * dx + v0 * ex, y: c0.y + u0 * dy + v0 * ey };
        const p11 = { x: c0.x + u1 * dx + v1 * ex, y: c0.y + u1 * dy + v1 * ey };
        const sp00 = worldToScreen(p00.x, p00.y);
        const sp11 = worldToScreen(p11.x, p11.y);
        const cellW = sp11.x - sp00.x;
        const cellH = sp11.y - sp00.y;
        ctx.fillStyle = GRAY;
        ctx.fillRect(sp00.x, sp00.y, cellW, cellH);
        ctx.save();
        ctx.beginPath();
        ctx.rect(sp00.x, sp00.y, cellW, cellH);
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(worldToScreen(pts[0].x, pts[0].y).x, worldToScreen(pts[0].x, pts[0].y).y);
        for (let i = 1; i < pts.length; i++) {
          const s = worldToScreen(pts[i].x, pts[i].y);
          ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = GREEN;
        ctx.fillRect(sp00.x, sp00.y, cellW, cellH);
        ctx.restore();
      }
    }

    ctx.strokeStyle = GRAY_STROKE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const s0 = worldToScreen(corners[0].x, corners[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < corners.length; i++) {
      const s = worldToScreen(corners[i].x, corners[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    ctx.stroke();

    // Dimension labels on each edge; split by element boundary (in/out)
    for (let e = 0; e < 4; e++) {
      const a = corners[e];
      const b = corners[(e + 1) % 4];
      const segLen = distance(a, b);
      const ts: number[] = [0, 1];
      for (let ei = 0; ei < pts.length; ei++) {
        const c = pts[ei];
        const d = pts[(ei + 1) % pts.length];
        const t = segmentSegmentIntersection(a, b, c, d);
        if (t !== null && t > 0.005 && t < 1 - 0.005) ts.push(t);
      }
      ts.sort((x, y) => x - y);
      const MIN_LABEL_M = 0.005;
      const nSeg = ts.length - 1;
      for (let k = 0; k < nSeg; k++) {
        const t0 = ts[k];
        const t1 = ts[k + 1];
        const lenM = toMeters((t1 - t0) * segLen);
        const tMid = (t0 + t1) / 2;
        const pMid = { x: a.x + tMid * (b.x - a.x), y: a.y + tMid * (b.y - a.y) };
        const inside = pointInPolygon(pMid, pts);
        const sa = worldToScreen(a.x + t0 * (b.x - a.x), a.y + t0 * (b.y - a.y));
        const sb = worldToScreen(a.x + t1 * (b.x - a.x), a.y + t1 * (b.y - a.y));
        const mid = midpoint(sa, sb);
        const norm = edgeNormalAngle(sa, sb);
        const offset = 18;
        const segOffset = nSeg > 1 ? (k - (nSeg - 1) / 2) * 10 : 0;
        const lx = mid.x + Math.cos(norm) * offset - Math.sin(norm) * segOffset;
        const ly = mid.y + Math.sin(norm) * offset + Math.cos(norm) * segOffset;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (lenM >= MIN_LABEL_M) {
          const label = formatLength(toPixels(lenM));
          ctx.font = "12px 'JetBrains Mono','Fira Code',monospace";
          const w = ctx.measureText(label).width;
          if (inside) {
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(lx - w / 2 - 2, ly - 7, w + 4, 14);
          }
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.fillText(label, lx, ly);
        }
      }
    }

    // During scale: show current length on the length edges (the two long sides)
    const isScalingThisPiece = grassScaleInfo && shapeIdx !== undefined && grassScaleInfo.shapeIdx === shapeIdx && grassScaleInfo.pieceIdx === i;
    if (isScalingThisPiece && piece.lengthM > 0) {
      const lengthEdges = piece.rotation === 90 ? [1, 3] : [0, 2];
      const lengthLabel = piece.lengthM.toFixed(2) + " m";
      for (const e of lengthEdges) {
        const a = corners[e];
        const b = corners[(e + 1) % 4];
        const mid = midpoint(a, b);
        const smid = worldToScreen(mid.x, mid.y);
        const sa = worldToScreen(a.x, a.y);
        const sb = worldToScreen(b.x, b.y);
        const norm = edgeNormalAngle(sa, sb);
        const offset = 22;
        const lx = smid.x + Math.cos(norm) * offset;
        const ly = smid.y + Math.sin(norm) * offset;
        ctx.font = "bold 13px 'JetBrains Mono',monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.lineWidth = 2;
        ctx.strokeText(lengthLabel, lx, ly);
        ctx.fillText(lengthLabel, lx, ly);
      }
    }
  }

  drawJointLines();

  const cov = validateCoverage(shape, pieces);
  const anchor = labelAnchorInsidePolygon(pts);
  const sc = worldToScreen(anchor.x, anchor.y);
  ctx.font = "bold 14px 'JetBrains Mono',monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = cov.coveragePercent < 99.99 ? "#e74c3c" : "#ffffff";
  ctx.fillText(`Coverage: ${cov.coveragePercent.toFixed(1)}%`, sc.x, sc.y + 24);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`Waste: ${cov.wastePercent.toFixed(1)}%`, sc.x, sc.y + 40);
  ctx.fillText(`Joins: ${cov.joinLengthM.toFixed(1)}m`, sc.x, sc.y + 56);
  };

  if (clipToShape) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(worldToScreen(pts[0].x, pts[0].y).x, worldToScreen(pts[0].x, pts[0].y).y);
    for (let i = 1; i < pts.length; i++) {
      const s = worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    ctx.clip();
    doDraw();
    ctx.restore();
  } else {
    doDraw();
  }
}
