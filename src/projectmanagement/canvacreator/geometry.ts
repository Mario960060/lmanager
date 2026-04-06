// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — geometry.ts
// Types, constants, math utilities, snap, shape factories, theme
// ══════════════════════════════════════════════════════════════

import { arcPointToWorldOnCurve, projectOntoArcEdge } from "./arcMath";

// ── Types ────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export type LayerID = 1 | 2;

export type ElementType = "polygon" | "fence" | "wall" | "kerb" | "foundation" | "drainage" | "canalPipe" | "waterPipe" | "cable" | "pathSlabs" | "pathConcreteSlabs" | "pathMonoblock";

/** Punkt wysokościowy — nie wpływa na geometrię, tylko przechowuje wysokość. Widoczny zawsze. */
export interface HeightPoint {
  x: number;
  y: number;
  height: number;  // meters
}

/** Arc point on an edge — bends the edge into a smooth curve. */
export interface ArcPoint {
  id: string;
  t: number;      // 0..1 along edge
  offset: number; // perpendicular offset (px), + = left side when looking from A to B
}

export interface Shape {
  points: Point[];
  closed: boolean;
  label: string;
  layer: LayerID;
  lockedEdges: { idx: number; len: number }[];  // edges with locked length (original length stored)
  lockedAngles: number[];  // indices of points with locked angle
  heights: number[];       // height at each point (meters), default 0
  /** Layer 1 only: points for height only — do not affect polygon geometry */
  heightPoints?: HeightPoint[];
  elementType: ElementType;
  thickness: number;
  calculatorType?: string;
  calculatorSubType?: string;
  calculatorInputs?: Record<string, any>;
  calculatorResults?: any;
  /** Stable UUID for layer-2 elements; used to sync folders/tasks with Event Details */
  canvasElementId?: string;
  /** Element removed from project (Event Details or sync); hidden on canvas, kept for history */
  removedFromCanvas?: boolean;
  linkedShapeIdx?: number;  // index of linked shape (e.g. foundation linked to wall)
  /** Open wall/kerb/foundation: points are mitered strip outline from computeThickPolyline (corner handles), not centerline */
  linearOpenStripOutline?: boolean;
  /** Linear elements: user finished editing via PPM — hide "Continue" and pulsing endpoint */
  drawingFinished?: boolean;
  /** Name prompt was already shown (user confirmed or cancelled) — don't ask again when adding segments */
  namePromptShown?: boolean;
  /** Arc points per edge. Index = edge index. null/undefined = straight line. */
  edgeArcs?: (ArcPoint[] | null)[];
}

export interface MultiDragVertexStart {
  shapeIdx: number;
  pointIdx: number;
  x: number;
  y: number;
}

export interface DragInfo {
  shapeIdx: number;
  pointIdx: number;
  startMouse: Point;
  startPoint: Point;
  isOpenEnd?: boolean;
  openEndSide?: "first" | "last";
  /** Rigid group drag: same Δ as primary vertex for every listed vertex (Ctrl/rectangle multi-select). */
  multiDragStartPositions?: MultiDragVertexStart[];
}

export interface MultiShapeDragStart {
  shapeIdx: number;
  startPoints: Point[];
  /** Snapshot of grass viz pieces at drag start (same structure as calculatorInputs.vizPieces). */
  startVizPieces?: unknown[] | null;
  /** Path ribbon: must translate with whole-shape drag (pattern uses pathCenterline). */
  startPathCenterline?: Point[];
  startPathCenterlineOriginal?: Point[];
  linkedPathSnapshot?: { shapeIdx: number; startPathCenterline?: Point[]; startPathCenterlineOriginal?: Point[] };
}

export interface ShapeDragInfo {
  shapeIdx: number;
  startMouse: Point;
  startPoints: Point[];
  /** Same rigid Δ for each shape (Ctrl multi-select). Primary = shapeIdx / startPoints (snap target). */
  multiShapeDragStarts?: MultiShapeDragStart[];
  /** Path ribbon on primary shape at mousedown — translated by same Δ as points. */
  startPathCenterline?: Point[];
  startPathCenterlineOriginal?: Point[];
  /** Linked duplicate shape (e.g. same geometry) — path data snapshot at drag start. */
  linkedPathSnapshot?: { shapeIdx: number; startPathCenterline?: Point[]; startPathCenterlineOriginal?: Point[] };
}

export interface RotateInfo {
  shapeIdx: number;
  center: Point;
  startAngle: number;
  startPoints: Point[];
}

export interface ScaleCornerInfo {
  shapeIdx: number;
  pointIdx: number;
  anchor: Point;
  startMouse: Point;
  startPoints: Point[];
  startDist: number;
  /** Closed path ribbon (pathIsOutline): scale centerline only, rebuild outline at fixed pathWidthM */
  pathRibbonScale?: {
    pathWidthM: number;
    startCenterline: Point[];
    segmentSides: ("left" | "right")[];
  };
}

export interface ScaleEdgeInfo {
  shapeIdx: number;
  edgeIdx: number;
  startMouse: Point;
  startPoints: Point[];
  normal: Point;
  edgeMid: Point;
}

export interface HitResult {
  shapeIdx: number;
  pointIdx: number;
}

export interface EdgeHitResult {
  shapeIdx: number;
  edgeIdx: number;
  pos: Point;
  t: number;
}

export interface OpenEndHit {
  shapeIdx: number;
  end: "first" | "last";
}

export interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface DimEdit {
  shapeIdx: number;
  edgeIdx: number;
  x: number;
  y: number;
}

/** Entry in a linked group — either a vertex or an arc point. */
export type LinkedEntry =
  | { si: number; pi: number; arcId?: undefined }
  | { si: number; pi: -1; edgeIdx: number; arcId: string };

export function isArcEntry(e: LinkedEntry): e is { si: number; pi: -1; edgeIdx: number; arcId: string } {
  return e.pi === -1 && typeof (e as any).arcId === "string";
}

export interface ContextMenuInfo {
  x: number;
  y: number;
  shapeIdx: number;
  pointIdx: number;   // -1 if edge menu
  edgeIdx: number;    // -1 if point menu
  /** When edge menu: position on edge for "Dodaj punkt" */
  edgePos?: Point;
  edgeT?: number;
  /** When L1 shape interior: world pos for "Dodaj punkt" */
  interiorWorldPos?: Point;
  /** When right-click on height point: index in heightPoints */
  heightPointIdx?: number;
  /** Grass: join edge between two pieces (not yet joined) */
  grassJoin?: { pieceAIdx: number; pieceBIdx: number; edgeAIdx: number };
  /** Grass: unjoin edge between two already joined pieces */
  grassUnjoin?: { pieceAIdx: number; pieceBIdx: number; edgeAIdx: number };
  /** Grass: right-click on piece — rotate piece or group */
  grassPieceIdx?: number;
  /** When right-click on arc point handle */
  arcPoint?: ArcPoint;
  /** When path edge hit: centerline segment index for Arc Point (outline edgeIdx -> centerline segment) */
  pathCenterlineEdgeIdx?: number;
  /** When path end-cap edge hit: which end for "Kontynuuj rysowanie ścieżki" */
  pathContinuationEnd?: "first" | "last";
  /** Layer 5: PPM on empty area (no coverage from L2) */
  adjustmentEmpty?: { emptyAreaIdx: number };
  /** Layer 5: PPM on overflow (L2 element outside L1) */
  adjustmentOverflow?: { shapeIdx: number };
  /** Layer 5: PPM on overlap (surface vs surface or surface vs linear) */
  adjustmentOverlap?: { shapeIdxA: number; shapeIdxB: number; overlapIdx: number };
  /** Layer 3: right-click on pattern rotation handle (slab / cobble / grass) */
  patternRotationHandle?: { patternType: "slab" | "cobblestone" | "grass" };
}

export interface SnapResult {
  snapped: Point;
  didSnap: boolean;
  snapType: "point" | "edge" | null;
  snapTarget: Point | null;
}

export interface ShapeSnapResult {
  offset: Point;
  didSnap: boolean;
  snapTarget: Point | null;
}

export interface Projection {
  t: number;
  proj: Point;
  dist: number;
}

// ── Constants ────────────────────────────────────────────────

export const PIXELS_PER_METER = 80;
export const GRID_SPACING = 0.5;
export const POINT_RADIUS = 7;
export const EDGE_HIT_THRESHOLD = 10;
export const GRASS_EDGE_HIT_PX = 24;  // Hit area for grass length resize handles (screen px)
export const SNAP_TO_START_RADIUS = 18;
export const SNAP_TO_LAST_RADIUS = 18;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 5;
export const SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
/** Only snap to 45/90 when angle is within this many degrees of a snap angle. Otherwise allow free angle. */
export const SNAP_ANGLE_THRESHOLD_DEG = 8;
export const SNAP_MAGNET_PX = 12;
export const ARC_SNAP_PX = 15;
export const PATTERN_SNAP_PX = 3;

// ── Math Utilities ───────────────────────────────────────────

export function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function toMeters(px: number): number {
  return px / PIXELS_PER_METER;
}

export function toPixels(m: number): number {
  return m * PIXELS_PER_METER;
}

export function formatLength(px: number): string {
  return Math.abs(toMeters(px)).toFixed(3) + "m";
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function angleDeg(p1: Point, vertex: Point, p2: Point): number {
  const a = { x: p1.x - vertex.x, y: p1.y - vertex.y };
  const b = { x: p2.x - vertex.x, y: p2.y - vertex.y };
  const dot = a.x * b.x + a.y * b.y;
  const magA = Math.sqrt(a.x ** 2 + a.y ** 2);
  const magB = Math.sqrt(b.x ** 2 + b.y ** 2);
  if (magA < 0.001 || magB < 0.001) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magA * magB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Four-point loop (e.g. path centerline corners) with ~90° at each vertex — a rectangle in the plane (any orientation). */
export function isRectangleCenterlineQuad(pts: Point[], tolDeg = 7): boolean {
  if (pts.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = angleDeg(pts[(i + 3) % 4]!, pts[i]!, pts[(i + 1) % 4]!);
    if (Math.abs(a - 90) > tolDeg) return false;
  }
  return true;
}

/** Rotate point around center by angleDeg (positive = counterclockwise). */
export function rotatePointAround(center: Point, point: Point, angleDeg: number): Point {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function shoelaceArea(points: Point[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/** Polygon centroid by signed area — true geometric center, more reliable than vertex average. */
export function polygonCentroidByArea(pts: Point[]): Point {
  if (pts.length < 3) return pts.length ? pts[0] : { x: 0, y: 0 };
  let area = 0, cx = 0, cy = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    area += cross;
    cx += (pts[i].x + pts[j].x) * cross;
    cy += (pts[i].y + pts[j].y) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-20) return centroid(pts);
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function areaM2(points: Point[]): number {
  return shoelaceArea(points) / (PIXELS_PER_METER * PIXELS_PER_METER);
}

export function projectOntoSegment(p: Point, a: Point, b: Point): Projection {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.001) return { t: 0, proj: { ...a }, dist: distance(p, a) };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return { t, proj, dist: distance(p, proj) };
}

/** Closest point on the infinite line through A–B (not clamped to the segment). */
export function projectOntoLine(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-18) return { ...a };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export type CollinearSnapHit = { proj: Point; dist: number; lineA: Point; lineB: Point };

/**
 * When dragging polygon vertex `pi`, snap to collinearity with the two vertices
 * along the boundary on the "prev" chain (…, lineA, lineB, dragged) or "next" chain (…, lineA, lineB, dragged).
 * `threshold` is max perpendicular distance in world units to activate snap.
 */
export function bestCollinearVertexSnap(
  target: Point,
  closed: boolean,
  pts: readonly Point[],
  pi: number,
  threshold: number
): CollinearSnapHit | null {
  const n = pts.length;
  if (n < 3) return null;
  let best: CollinearSnapHit | null = null;

  const tryLine = (a: Point, b: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx * dx + dy * dy < 1e-14) return;
    const proj = projectOntoLine(target, a, b);
    const dist = distance(target, proj);
    if (dist >= threshold) return;
    if (!best || dist < best.dist) best = { proj, dist, lineA: a, lineB: b };
  };

  if (closed) {
    const prevI = (pi - 1 + n) % n;
    const prev2 = (pi - 2 + n) % n;
    tryLine(pts[prev2], pts[prevI]);
    const nextI = (pi + 1) % n;
    const next2 = (pi + 2) % n;
    tryLine(pts[next2], pts[nextI]);
  } else {
    if (pi >= 2) tryLine(pts[pi - 2], pts[pi - 1]);
    if (pi <= n - 3) tryLine(pts[pi + 2], pts[pi + 1]);
  }

  return best;
}

/**
 * Unit perpendicular to edge A→B pointing **outward** from a polygon when `interiorRef` is any point inside that polygon.
 */
export function outwardPerpendicularRad(a: Point, b: Point, interiorRef: Point): number {
  const midx = (a.x + b.x) * 0.5;
  const midy = (a.y + b.y) * 0.5;
  const norm = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
  const vx = interiorRef.x - midx;
  const vy = interiorRef.y - midy;
  const nx = Math.cos(norm);
  const ny = Math.sin(norm);
  return nx * vx + ny * vy > 0 ? norm + Math.PI : norm;
}

export function edgeOutwardRadForL1Edge(shapes: readonly Shape[], l1Si: number, edgeIdx: number): number | null {
  const s = shapes[l1Si];
  if (!s || s.layer !== 1 || !s.closed || s.points.length < 3) return null;
  const pts = s.points;
  const n = pts.length;
  const a = pts[edgeIdx];
  const b = pts[(edgeIdx + 1) % n];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-9) return null;
  const sa = signedArea(pts);
  if (Math.abs(sa) < 1e-20) return null;
  // CCW: interior is to the left of each directed edge → outward = right normal (dy, -dx).
  // CW: flip. Avoids mis-placing both parallel edge dims on one side when labelAnchorInsidePolygon
  // or centroid lies outside a thin/concave region (dot test with interior ref becomes unreliable).
  let rad = Math.atan2(-dx, dy);
  if (sa < 0) rad += Math.PI;
  return rad;
}

export function edgeNormalAngle(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
}

/** Angle for text parallel to edge, flipped so text is never upside down */
export function readableTextAngle(edgeAngle: number): number {
  if (edgeAngle > Math.PI / 2 || edgeAngle < -Math.PI / 2) return edgeAngle + Math.PI;
  return edgeAngle;
}

export function snapTo45(origin: Point, target: Point): Point {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return { ...target };
  const rawAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const snapped = snapAngleTo45(rawAngle);
  const rad = (snapped * Math.PI) / 180;
  return { x: origin.x + Math.cos(rad) * len, y: origin.y + Math.sin(rad) * len };
}

/** Snap to 45/90 only when within SNAP_ANGLE_THRESHOLD_DEG of a snap angle; otherwise keep free angle. */
export function snapTo45Soft(origin: Point, target: Point): Point {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return { ...target };
  const rawAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const snapped = snapAngleTo45(rawAngle);
  let diff = Math.abs(rawAngle - snapped);
  if (diff > 180) diff = 360 - diff;
  const useSnapped = diff <= SNAP_ANGLE_THRESHOLD_DEG;
  const angleDeg = useSnapped ? snapped : rawAngle;
  const rad = (angleDeg * Math.PI) / 180;
  return { x: origin.x + Math.cos(rad) * len, y: origin.y + Math.sin(rad) * len };
}

export function snapAngleTo45(angleDeg: number): number {
  const normAngle = ((angleDeg % 360) + 360) % 360;
  let bestAngle = SNAP_ANGLES[0];
  let bestDiff = 999;
  for (const sa of SNAP_ANGLES) {
    let diff = Math.abs(normAngle - sa);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) { bestDiff = diff; bestAngle = sa; }
  }
  return bestAngle;
}

/** Shortest signed distance between two directions on the circle, degrees in [0, 180]. */
export function smallestAngleDiffDeg(a: number, b: number): number {
  let d = Math.abs((((a - b) % 360) + 360) % 360);
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * Distance between undirected line directions (parallel lines = 0°), degrees in [0, 90].
 * Matches slab vizDirection convention: angle of the long-axis direction in world space (same as atan2 along edge).
 */
export function undirectedLineAngleDistanceDeg(a: number, b: number): number {
  let d = Math.abs((((a - b) % 360) + 360) % 360);
  if (d > 180) d = 360 - d;
  return Math.min(d, 180 - d);
}

/** ~1.5% of full circle — snap pattern rotation to boundary when this close (parallel). */
export const PATTERN_BOUNDARY_SNAP_THRESHOLD_DEG = 360 * 0.015;

/**
 * Snap pattern long-axis direction to boundary geometry: for each straight (or sampled arc) tangent b,
 * considers b, b+90°, b+180°, b+270° as valid axes — so rotation can lock **parallel** or **perpendicular**
 * to every edge. Uses directed angular distance (not undirected line distance), otherwise parallel and
 * perpendicular to the same edge would be indistinguishable at 90° spacing.
 */
export function snapPatternDirectionToBoundaryAngles(
  directionDeg: number,
  boundaryAnglesDeg: readonly number[],
  thresholdDeg: number = PATTERN_BOUNDARY_SNAP_THRESHOLD_DEG
): number {
  if (boundaryAnglesDeg.length === 0) return directionDeg;
  const normDir = ((directionDeg % 360) + 360) % 360;
  let bestDist = thresholdDeg + 1;
  let bestPick = normDir;

  for (const b of boundaryAnglesDeg) {
    const bNorm = ((b % 360) + 360) % 360;
    for (const off of [0, 90, 180, 270]) {
      const cand = (bNorm + off) % 360;
      const dist = smallestAngleDiffDeg(normDir, cand);
      if (dist < bestDist) {
        bestDist = dist;
        bestPick = cand;
      }
    }
  }

  if (bestDist <= thresholdDeg) return ((bestPick % 360) + 360) % 360;
  return directionDeg;
}

export function snapToLine(prev: Point, next: Point, target: Point): Point {
  return projectOntoSegment(target, prev, next).proj;
}

// Smart shift snap: snap to line between neighbors OR to 90° at curr (Thales: circle with diameter prev-next)
export function snapShiftSmart(prev: Point, _curr: Point, next: Point, target: Point): Point {
  const lineSnap = projectOntoSegment(target, prev, next).proj;
  const lineDist = distance(target, lineSnap);
  const candidates: { pt: Point; dist: number }[] = [{ pt: lineSnap, dist: lineDist }];

  const center = midpoint(prev, next);
  const radius = distance(prev, next) / 2;
  if (radius > 0.1) {
    const dx = target.x - center.x, dy = target.y - center.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const pt90: Point = len < 0.001
      ? { x: center.x + radius, y: center.y }
      : { x: center.x + (dx / len) * radius, y: center.y + (dy / len) * radius };
    candidates.push({ pt: pt90, dist: distance(target, pt90) });
  }

  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0].pt;
}

// Calculate interior angle direction for proper label placement inside shape
// Uses winding order (signed area) to determine interior side reliably
export function interiorAngleDir(pts: Point[], idx: number): number {
  const n = pts.length;
  const prev = pts[(idx - 1 + n) % n];
  const curr = pts[idx];
  const next = pts[(idx + 1) % n];

  // Bisector of the two edge vectors (points outward from the angle)
  const bisX = (prev.x - curr.x) + (next.x - curr.x);
  const bisY = (prev.y - curr.y) + (next.y - curr.y);
  const bisLen = Math.sqrt(bisX * bisX + bisY * bisY);

  if (bisLen < 0.001) {
    // Degenerate: edges are collinear, use normal to the edge
    const dx = next.x - prev.x, dy = next.y - prev.y;
    const nLen = Math.sqrt(dx * dx + dy * dy);
    if (nLen < 0.001) return 0;
    // Pick normal direction pointing inward based on winding
    const sa = signedArea(pts);
    const nx = -dy / nLen, ny = dx / nLen;
    return sa > 0 ? Math.atan2(ny, nx) : Math.atan2(-ny, -nx);
  }

  // Cross product tells us if this vertex is convex or reflex relative to winding
  const cross = (prev.x - curr.x) * (next.y - curr.y) - (prev.y - curr.y) * (next.x - curr.x);
  const sa = signedArea(pts); // positive = CCW, negative = CW

  // If shape is CW (sa < 0): interior is to the right of edges
  // Convex vertex (cross < 0 for CW): bisector points outward → flip it
  // Reflex vertex (cross > 0 for CW): bisector points inward → keep it
  const bisectorPointsInward = (sa > 0) ? (cross < 0) : (cross > 0);

  if (bisectorPointsInward) {
    return Math.atan2(bisY, bisX);
  }
  return Math.atan2(-bisY, -bisX);
}

// Signed area: positive = CCW, negative = CW
export function signedArea(pts: Point[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
}

/** Unit normal pointing outside a simple closed polygon (uses winding; same convention as edgeOutwardRadForL1Edge). */
export function outwardUnitNormalForPolygonEdge(a: Point, b: Point, polygonPts: Point[]): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return { x: 0, y: 0 };
  const sa = signedArea(polygonPts);
  let nx = dy / len;
  let ny = -dx / len;
  if (sa < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

export function centroid(points: Point[]): Point {
  let cx = 0, cy = 0;
  points.forEach(p => { cx += p.x; cy += p.y; });
  return { x: cx / points.length, y: cy / points.length };
}

export function pointInPolygon(p: Point, pts: Point[]): boolean {
  const n = pts.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from point to polygon boundary (min distance to any edge). */
export function distanceToPolygon(p: Point, pts: Point[]): number {
  if (pts.length < 2) return Infinity;
  let minDist = Infinity;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const proj = projectOntoSegment(p, pts[j], pts[i]);
    if (proj.dist < minDist) minDist = proj.dist;
  }
  return minDist;
}

/** True if point is inside polygon or within tolerance of its boundary. */
export function pointInOrNearPolygon(p: Point, pts: Point[], tolerance: number): boolean {
  if (pointInPolygon(p, pts)) return true;
  return distanceToPolygon(p, pts) <= tolerance;
}

/** Find edge index to split when inserting interior point p. Ray from p in +x direction, first edge hit. */
export function findEdgeForInteriorPointInsertion(p: Point, pts: Point[]): number | null {
  let bestEdge: number | null = null;
  let bestT = Infinity;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = pts[j], b = pts[i];
    const dy = b.y - a.y;
    let t: number;
    if (Math.abs(dy) < 1e-10) {
      if (Math.abs(p.y - a.y) > 1e-10) continue;
      const xMin = Math.min(a.x, b.x), xMax = Math.max(a.x, b.x);
      if (p.x >= xMax) continue;
      t = p.x < xMin ? xMin - p.x : 0;
    } else {
      const s = (p.y - a.y) / dy;
      if (s < -1e-10 || s > 1 + 1e-10) continue;
      const x = a.x + s * (b.x - a.x);
      if (x <= p.x + 1e-10) continue;
      t = x - p.x;
    }
    if (t < bestT && t > 1e-10) {
      bestT = t;
      bestEdge = j;
    }
  }
  return bestEdge;
}

/** Returns a point inside the polygon for label placement. For L-shapes and other concave polygons, centroid can lie outside; this finds a point that is guaranteed inside and well-centered. */
export function labelAnchorInsidePolygon(pts: Point[]): Point {
  const ctr = centroid(pts);
  if (pointInPolygon(ctr, pts)) return ctr;
  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
  pts.forEach(p => {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  });
  const bboxCtr = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  if (pointInPolygon(bboxCtr, pts)) return bboxCtr;
  for (let t = 0.1; t <= 1; t += 0.1) {
    const p = { x: bboxCtr.x + (ctr.x - bboxCtr.x) * t, y: bboxCtr.y + (ctr.y - bboxCtr.y) * t };
    if (pointInPolygon(p, pts)) return p;
  }
  const inside: Point[] = [];
  const steps = 50;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p = { x: minX + (maxX - minX) * i / steps, y: minY + (maxY - minY) * j / steps };
      if (pointInPolygon(p, pts)) inside.push(p);
    }
  }
  if (inside.length === 0) return bboxCtr;
  return centroid(inside);
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += distance(points[i], points[i + 1]);
  }
  return total;
}

/** Midpoint along polyline (by distance) and angle of segment at that point (radians, for text rotation). */
export function polylineMidpointAndAngle(points: Point[]): { point: Point; angleRad: number } | null {
  if (points.length < 2) return null;
  const total = polylineLength(points);
  if (total < 0.001) return { point: midpoint(points[0], points[1]), angleRad: 0 };
  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segLen = distance(a, b);
    if (acc + segLen >= half) {
      const t = (half - acc) / segLen;
      const pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const angleRad = Math.atan2(dy, dx);
      return { point: pt, angleRad };
    }
    acc += segLen;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  return { point: last, angleRad: Math.atan2(dy, dx) };
}

/**
 * One label on the longest straight centerline segment (short segments skipped as noise),
 * offset perpendicular toward `interiorRef` (e.g. path outline centroid) — same inward rule as ribbon metrics.
 */
export function pathLongestSegmentLabelPlacement(
  pathCenterline: Point[],
  interiorRef: Point,
  options?: { minSegmentLenM?: number; inwardOffsetM?: number }
): { point: Point; textAngleRad: number } | null {
  if (pathCenterline.length < 2) return null;
  const minSegPx = toPixels(options?.minSegmentLenM ?? 0.12);
  const inwardM = options?.inwardOffsetM ?? 0.1;

  let bestI = -1;
  let bestLen = 0;
  for (let i = 0; i < pathCenterline.length - 1; i++) {
    const a = pathCenterline[i]!;
    const b = pathCenterline[i + 1]!;
    const lenPx = distance(a, b);
    if (lenPx >= minSegPx && lenPx > bestLen) {
      bestLen = lenPx;
      bestI = i;
    }
  }
  if (bestI < 0) {
    for (let i = 0; i < pathCenterline.length - 1; i++) {
      const a = pathCenterline[i]!;
      const b = pathCenterline[i + 1]!;
      const lenPx = distance(a, b);
      if (lenPx > bestLen) {
        bestLen = lenPx;
        bestI = i;
      }
    }
  }
  if (bestI < 0 || bestLen < 1e-9) return null;

  const A = pathCenterline[bestI]!;
  const B = pathCenterline[bestI + 1]!;
  const mid = midpoint(A, B);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const segLen = Math.hypot(dx, dy) || 1;
  const cross = dx * (interiorRef.y - mid.y) - dy * (interiorRef.x - mid.x);
  const sign = cross >= 0 ? 1 : -1;
  const nx = (-dy / segLen) * sign;
  const ny = (dx / segLen) * sign;
  const offPx = toPixels(inwardM);
  const point = { x: mid.x + nx * offPx, y: mid.y + ny * offPx };
  const textAngleRad = readableTextAngle(Math.atan2(dy, dx));
  return { point, textAngleRad };
}

export function polylineLengthMeters(points: Point[]): number {
  return toMeters(polylineLength(points));
}

// ── Lock Constraints ─────────────────────────────────────────

// Constrain a dragged point to respect locked edge lengths.
// prevLocked/nextLocked = whether edges prev→pi or pi→next are locked.
// anchor = the OTHER end of the locked edge (fixed point).
// lockedLen = the original length to preserve.
// If one edge locked: project target onto circle around anchor with radius=lockedLen.
// If two edges locked: find intersection of two circles, pick closest to target.
export function constrainLockedEdges(
  target: Point,
  prevPt: Point | null, prevLockedLen: number, // null if prev edge not locked
  nextPt: Point | null, nextLockedLen: number, // null if next edge not locked
): Point {
  if (prevPt && nextPt) {
    // Two locked edges: intersection of two circles
    const pts = circleCircleIntersect(prevPt, prevLockedLen, nextPt, nextLockedLen);
    if (pts.length === 0) {
      // No intersection — find closest point on each circle and average
      return constrainToCircle(target, prevPt, prevLockedLen);
    }
    // Pick intersection closest to target
    let best = pts[0], bestD = distance(target, pts[0]);
    for (let i = 1; i < pts.length; i++) {
      const d = distance(target, pts[i]);
      if (d < bestD) { bestD = d; best = pts[i]; }
    }
    return best;
  }
  if (prevPt) return constrainToCircle(target, prevPt, prevLockedLen);
  if (nextPt) return constrainToCircle(target, nextPt, nextLockedLen);
  return target;
}

function constrainToCircle(target: Point, center: Point, radius: number): Point {
  const dx = target.x - center.x, dy = target.y - center.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return { x: center.x + radius, y: center.y };
  return { x: center.x + (dx / len) * radius, y: center.y + (dy / len) * radius };
}

function circleCircleIntersect(c1: Point, r1: number, c2: Point, r2: number): Point[] {
  const dx = c2.x - c1.x, dy = c2.y - c1.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > r1 + r2 + 0.01 || d < Math.abs(r1 - r2) - 0.01 || d < 0.001) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const h = h2 > 0 ? Math.sqrt(h2) : 0;
  const mx = c1.x + a * dx / d, my = c1.y + a * dy / d;
  if (h < 0.01) return [{ x: mx, y: my }];
  return [
    { x: mx + h * dy / d, y: my - h * dx / d },
    { x: mx - h * dy / d, y: my + h * dx / d },
  ];
}

// ── Snap Magnet ──────────────────────────────────────────────

/** Optional: only snap to targets in this direction (dot product >= 0). Prevents snapping to wrong side. */
export function snapMagnet(
  point: Point,
  shapes: Shape[],
  excludeShapeIdx: number,
  threshold: number,
  preferredDirection?: Point
): SnapResult {
  let bestDist = threshold;
  let result: SnapResult = { snapped: { ...point }, didSnap: false, snapType: null, snapTarget: null };

  const inPreferredDir = (target: Point): boolean => {
    if (!preferredDirection) return true;
    const dx = target.x - point.x;
    const dy = target.y - point.y;
    return dx * preferredDirection.x + dy * preferredDirection.y >= 0;
  };

  for (let si = 0; si < shapes.length; si++) {
    if (si === excludeShapeIdx) continue;
    const sh = shapes[si];
    const pts = sh.points;
    for (const pt of pts) {
      const d = distance(point, pt);
      if (d < bestDist && inPreferredDir(pt)) {
        bestDist = d;
        result = { snapped: { ...pt }, didSnap: true, snapType: "point", snapTarget: { ...pt } };
      }
    }
    const ecArc = sh.closed ? pts.length : pts.length - 1;
    for (let ei = 0; ei < ecArc; ei++) {
      const arcs = sh.edgeArcs?.[ei];
      if (!arcs?.length) continue;
      const A = pts[ei]!;
      const B = pts[(ei + 1) % pts.length]!;
      for (const ap of arcs) {
        const pos = arcPointToWorldOnCurve(A, B, arcs, ap);
        const d = distance(point, pos);
        if (d < bestDist && inPreferredDir(pos)) {
          bestDist = d;
          result = { snapped: { ...pos }, didSnap: true, snapType: "point", snapTarget: { ...pos } };
        }
      }
    }
  }

  if (result.didSnap && bestDist < threshold * 0.6) return result;

  if (!result.didSnap) {
    bestDist = threshold;
    for (let si = 0; si < shapes.length; si++) {
      if (si === excludeShapeIdx) continue;
      const sh = shapes[si];
      const pts = sh.points;
      const ec = sh.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < ec; i++) {
        const j = (i + 1) % pts.length;
        const arcs = sh.edgeArcs?.[i];
        if (arcs && arcs.length > 0) {
          const pr = projectOntoArcEdge(point, pts[i]!, pts[j]!, arcs, 24);
          if (pr.t > 0.02 && pr.t < 0.98 && pr.dist < bestDist && inPreferredDir(pr.proj)) {
            bestDist = pr.dist;
            result = { snapped: { ...pr.proj }, didSnap: true, snapType: "edge", snapTarget: { ...pr.proj } };
          }
        } else {
          const proj = projectOntoSegment(point, pts[i], pts[j]);
          if (proj.t > 0.01 && proj.t < 0.99 && proj.dist < bestDist && inPreferredDir(proj.proj)) {
            bestDist = proj.dist;
            result = { snapped: { ...proj.proj }, didSnap: true, snapType: "edge", snapTarget: { ...proj.proj } };
          }
        }
      }
    }
  }

  return result;
}

/** Snap a rigid shape (point ring) to magnets; ignore vertices/edges of every index in `excludeIndices` (e.g. all shapes being dragged together). */
export function snapMagnetShapeExcluding(
  shapePoints: Point[],
  shapes: Shape[],
  excludeIndices: ReadonlySet<number>,
  threshold: number,
): ShapeSnapResult {
  let bestDist = threshold;
  let bestOffset: Point = { x: 0, y: 0 };
  let didSnap = false;
  let snapTarget: Point | null = null;

  // 1) Point-to-point (vertices + arc handles on curves)
  for (const pt of shapePoints) {
    for (let si = 0; si < shapes.length; si++) {
      if (excludeIndices.has(si)) continue;
      const sh = shapes[si];
      const oPts = sh.points;
      for (const opt of oPts) {
        const d = distance(pt, opt);
        if (d < bestDist) {
          bestDist = d;
          bestOffset = { x: opt.x - pt.x, y: opt.y - pt.y };
          didSnap = true;
          snapTarget = { ...opt };
        }
      }
      const ecArc = sh.closed ? oPts.length : oPts.length - 1;
      for (let ei = 0; ei < ecArc; ei++) {
        const arcs = sh.edgeArcs?.[ei];
        if (!arcs?.length) continue;
        const A = oPts[ei]!;
        const B = oPts[(ei + 1) % oPts.length]!;
        for (const ap of arcs) {
          const pos = arcPointToWorldOnCurve(A, B, arcs, ap);
          const d = distance(pt, pos);
          if (d < bestDist) {
            bestDist = d;
            bestOffset = { x: pos.x - pt.x, y: pos.y - pt.y };
            didSnap = true;
            snapTarget = { ...pos };
          }
        }
      }
    }
  }
  if (didSnap && bestDist < threshold * 0.6) return { offset: bestOffset, didSnap, snapTarget };

  // 2) Point-to-edge (straight segments or projection onto arc)
  bestDist = threshold;
  for (const pt of shapePoints) {
    for (let si = 0; si < shapes.length; si++) {
      if (excludeIndices.has(si)) continue;
      const sh = shapes[si];
      const pts = sh.points;
      const ec = sh.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < ec; i++) {
        const j = (i + 1) % pts.length;
        const arcs = sh.edgeArcs?.[i];
        if (arcs && arcs.length > 0) {
          const pr = projectOntoArcEdge(pt, pts[i]!, pts[j]!, arcs, 24);
          if (pr.t > 0.02 && pr.t < 0.98 && pr.dist < bestDist) {
            bestDist = pr.dist;
            bestOffset = { x: pr.proj.x - pt.x, y: pr.proj.y - pt.y };
            didSnap = true;
            snapTarget = { ...pr.proj };
          }
        } else {
          const proj = projectOntoSegment(pt, pts[i], pts[j]);
          if (proj.t > 0.01 && proj.t < 0.99 && proj.dist < bestDist) {
            bestDist = proj.dist;
            bestOffset = { x: proj.proj.x - pt.x, y: proj.proj.y - pt.y };
            didSnap = true;
            snapTarget = { ...proj.proj };
          }
        }
      }
    }
  }
  if (didSnap) return { offset: bestOffset, didSnap, snapTarget };

  // 3) Edge-to-edge (parallel + overlapping edges)
  bestDist = threshold;
  const mEC = shapePoints.length;
  for (let mi = 0; mi < mEC; mi++) {
    const mj = (mi + 1) % mEC;
    if (mi === mj) continue;
    const mA = shapePoints[mi], mB = shapePoints[mj];
    const mDx = mB.x - mA.x, mDy = mB.y - mA.y;
    const mLen = Math.sqrt(mDx * mDx + mDy * mDy);
    if (mLen < 1) continue;

    for (let si = 0; si < shapes.length; si++) {
      if (excludeIndices.has(si)) continue;
      const oPts = shapes[si].points;
      const oEC = shapes[si].closed ? oPts.length : oPts.length - 1;
      for (let oi = 0; oi < oEC; oi++) {
        const oj = (oi + 1) % oPts.length;
        const oA = oPts[oi], oB = oPts[oj];
        const oDx = oB.x - oA.x, oDy = oB.y - oA.y;
        const oLen = Math.sqrt(oDx * oDx + oDy * oDy);
        if (oLen < 1) continue;

        const dot = (mDx * oDx + mDy * oDy) / (mLen * oLen);
        if (Math.abs(dot) < 0.95) continue;

        const mMid: Point = { x: (mA.x + mB.x) / 2, y: (mA.y + mB.y) / 2 };
        const oNx = -oDy / oLen, oNy = oDx / oLen;
        const signedDist = (mMid.x - oA.x) * oNx + (mMid.y - oA.y) * oNy;
        const absDist = Math.abs(signedDist);

        if (absDist < bestDist) {
          const oDirX = oDx / oLen, oDirY = oDy / oLen;
          const t1 = (mA.x - oA.x) * oDirX + (mA.y - oA.y) * oDirY;
          const t2 = (mB.x - oA.x) * oDirX + (mB.y - oA.y) * oDirY;
          if (Math.max(t1, t2) > 0 && Math.min(t1, t2) < oLen) {
            bestDist = absDist;
            bestOffset = { x: -signedDist * oNx, y: -signedDist * oNy };
            didSnap = true;
            snapTarget = { x: mMid.x + bestOffset.x, y: mMid.y + bestOffset.y };
          }
        }
      }
    }
  }

  return { offset: bestOffset, didSnap, snapTarget };
}

export function snapMagnetShape(shapePoints: Point[], shapes: Shape[], excludeShapeIdx: number, threshold: number): ShapeSnapResult {
  return snapMagnetShapeExcluding(shapePoints, shapes, new Set([excludeShapeIdx]), threshold);
}

// ── Frame Link: shared‑edge detection between two shapes ─────

export interface FrameEdgeLink {
  myEdgeIdx: number;
  otherShapeIdx: number;
  otherEdgeIdx: number;
}

/**
 * Find logical edges of polygon A that overlap with logical edges of polygon B.
 * Two edges overlap if both endpoints of one are within `tol` of the other edge's endpoints
 * (same or reversed direction). Returns pairs { edgeA, edgeB } (indices into each ring).
 */
export function findSharedFrameEdgesFromPoints(
  ptsA: Point[],
  ptsB: Point[],
  closedA: boolean,
  closedB: boolean,
  tol: number = 2,
): { edgeA: number; edgeB: number }[] {
  const nA = ptsA.length;
  const nB = ptsB.length;
  if (nA < 3 || nB < 3 || !closedA || !closedB) return [];
  const tol2 = tol * tol;
  const near = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < tol2;
  const result: { edgeA: number; edgeB: number }[] = [];
  for (let ea = 0; ea < nA; ea++) {
    const a0 = ptsA[ea];
    const a1 = ptsA[(ea + 1) % nA];
    for (let eb = 0; eb < nB; eb++) {
      const b0 = ptsB[eb];
      const b1 = ptsB[(eb + 1) % nB];
      if ((near(a0, b0) && near(a1, b1)) || (near(a0, b1) && near(a1, b0))) {
        result.push({ edgeA: ea, edgeB: eb });
      }
    }
  }
  return result;
}

/**
 * Find logical edges of shapeA that overlap with logical edges of shapeB.
 * Uses `shape.points` as the polygon ring (see {@link findSharedFrameEdgesFromPoints} for custom rings).
 */
export function findSharedFrameEdges(
  shapeA: Shape,
  shapeB: Shape,
  tol: number = 2,
): { edgeA: number; edgeB: number }[] {
  return findSharedFrameEdgesFromPoints(shapeA.points, shapeB.points, shapeA.closed, shapeB.closed, tol);
}

/**
 * Find all shapes that share at least one edge with shape at `shapeIdx`.
 * Returns per‑other‑shape list of shared edge pairs.
 * Edge indices are in `shape.points` space (for `pathIsOutline` paths this equals the outline).
 */
export function findAllSharedFrameEdgePartners(
  shapes: Shape[],
  shapeIdx: number,
  tol?: number,
): { otherIdx: number; edges: { edgeA: number; edgeB: number }[] }[] {
  const shapeA = shapes[shapeIdx];
  if (!shapeA || !shapeA.closed || shapeA.points.length < 3) return [];
  const result: { otherIdx: number; edges: { edgeA: number; edgeB: number }[] }[] = [];
  for (let oi = 0; oi < shapes.length; oi++) {
    if (oi === shapeIdx) continue;
    const sb = shapes[oi];
    if (!sb || !sb.closed || sb.points.length < 3 || sb.layer !== shapeA.layer) continue;
    const edges = findSharedFrameEdges(shapeA, sb, tol);
    if (edges.length > 0) result.push({ otherIdx: oi, edges });
  }
  return result;
}

// ── Shape Factories ──────────────────────────────────────────

export function makeSquare(cx: number, cy: number, layer: LayerID = 1, sideM?: number): Shape {
  const h = toPixels((sideM ?? 4) / 2);
  return { points: [{ x: cx - h, y: cy - h }, { x: cx + h, y: cy - h }, { x: cx + h, y: cy + h }, { x: cx - h, y: cy + h }], closed: true, label: "Square", layer, lockedEdges: [], lockedAngles: [], heights: [0, 0, 0, 0], elementType: "polygon", thickness: 0 };
}

export function makeRectangle(cx: number, cy: number, layer: LayerID = 1, widthM?: number, heightM?: number): Shape {
  const hw = toPixels((widthM ?? 6) / 2), hh = toPixels((heightM ?? 4) / 2);
  return { points: [{ x: cx - hw, y: cy - hh }, { x: cx + hw, y: cy - hh }, { x: cx + hw, y: cy + hh }, { x: cx - hw, y: cy + hh }], closed: true, label: "Rectangle", layer, lockedEdges: [], lockedAngles: [], heights: [0, 0, 0, 0], elementType: "polygon", thickness: 0 };
}

export function makeTriangle(cx: number, cy: number, layer: LayerID = 1, baseM?: number, heightM?: number): Shape {
  const hb = toPixels((baseM ?? 5) / 2), hh = toPixels((heightM ?? 4) / 2);
  return { points: [{ x: cx, y: cy - hh }, { x: cx + hb, y: cy + hh }, { x: cx - hb, y: cy + hh }], closed: true, label: "Triangle", layer, lockedEdges: [], lockedAngles: [], heights: [0, 0, 0], elementType: "polygon", thickness: 0 };
}

export function makeTrapezoid(cx: number, cy: number, layer: LayerID = 1, topM?: number, bottomM?: number, heightM?: number): Shape {
  const topW = toPixels((topM ?? 3) / 2), botW = toPixels((bottomM ?? 6) / 2), hh = toPixels((heightM ?? 4) / 2);
  return { points: [{ x: cx - topW, y: cy - hh }, { x: cx + topW, y: cy - hh }, { x: cx + botW, y: cy + hh }, { x: cx - botW, y: cy + hh }], closed: true, label: "Trapezoid", layer, lockedEdges: [], lockedAngles: [], heights: [0, 0, 0, 0], elementType: "polygon", thickness: 0 };
}

/** Regular polygon with equal sides; `sideM` is one edge length in meters. First vertex at top (−90°). */
export function makeRegularPolygon(cx: number, cy: number, layer: LayerID = 1, nSides: number, sideM?: number): Shape {
  const n = Math.max(3, Math.floor(nSides));
  const s = sideM ?? 4;
  const Rm = s / (2 * Math.sin(Math.PI / n));
  const Rpx = toPixels(Rm);
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    pts.push({ x: cx + Rpx * Math.cos(a), y: cy + Rpx * Math.sin(a) });
  }
  const label = n === 5 ? "Pentagon" : n === 6 ? "Hexagon" : n === 8 ? "Octagon" : `Polygon(${n})`;
  return { points: pts, closed: true, label, layer, lockedEdges: [], lockedAngles: [], heights: Array(n).fill(0), elementType: "polygon", thickness: 0 };
}

/**
 * Logical vertices on the circle; each edge is curved via {@link Shape.edgeArcs}
 * (quadratic Bézier — same as manual arc points elsewhere).
 */
const CIRCLE_VERTEX_COUNT = 8;

/**
 * One arc point per chord A–B so the curve midpoint (u=½) lies on the circle
 * (perpendicular bisector). Matches drawCurvedEdge / sampleArcEdge in arcMath.
 */
function arcPointForCircleChord(A: Point, B: Point, center: Point, radiusPx: number, edgeIdx: number): ArcPoint {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return { id: `circ-${edgeIdx}`, t: 0.5, offset: 0 };
  const nx = -dy / len;
  const ny = dx / len;
  const Mx = (A.x + B.x) / 2;
  const My = (A.y + B.y) / 2;
  const uax = A.x - center.x;
  const uay = A.y - center.y;
  const ubx = B.x - center.x;
  const uby = B.y - center.y;
  const la = Math.hypot(uax, uay);
  const lb = Math.hypot(ubx, uby);
  if (la < 1e-9 || lb < 1e-9) return { id: `circ-${edgeIdx}`, t: 0.5, offset: 0 };
  const bisx = uax / la + ubx / lb;
  const bisy = uay / la + uby / lb;
  const lbis = Math.hypot(bisx, bisy);
  if (lbis < 1e-9) return { id: `circ-${edgeIdx}`, t: 0.5, offset: 0 };
  const Tx = center.x + radiusPx * (bisx / lbis);
  const Ty = center.y + radiusPx * (bisy / lbis);
  const offset = 2 * ((Tx - Mx) * nx + (Ty - My) * ny);
  return { id: `circ-${edgeIdx}`, t: 0.5, offset };
}

/** Circle: few vertices + arc points on each edge. `diameterM` in meters. */
export function makeCircle(cx: number, cy: number, layer: LayerID = 1, diameterM?: number): Shape {
  const d = diameterM ?? 4;
  const Rpx = toPixels(d / 2);
  const n = CIRCLE_VERTEX_COUNT;
  const center = { x: cx, y: cy };
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    pts.push({ x: cx + Rpx * Math.cos(a), y: cy + Rpx * Math.sin(a) });
  }
  const edgeArcs: (ArcPoint[] | null)[] = [];
  for (let i = 0; i < n; i++) {
    const A = pts[i]!;
    const B = pts[(i + 1) % n]!;
    edgeArcs.push([arcPointForCircleChord(A, B, center, Rpx, i)]);
  }
  return {
    points: pts,
    closed: true,
    label: "Circle",
    layer,
    lockedEdges: [],
    lockedAngles: [],
    heights: Array(n).fill(0),
    elementType: "polygon",
    thickness: 0,
    edgeArcs,
    /** UI: only arc handles — no vertex squares (geometry still uses vertices + arcs). */
    calculatorInputs: { circleVertexHandlesHidden: true },
  };
}

/** Circle from tool: edit via arc points only; vertex handles hidden in UI. */
export function isCircleArcHandlesOnlyShape(shape: Shape): boolean {
  if (shape.label !== "Circle" || !shape.closed) return false;
  if (shape.calculatorInputs?.circleVertexHandlesHidden === false) return false;
  const n = shape.points.length;
  if (n < 3 || !shape.edgeArcs || shape.edgeArcs.length !== n) return false;
  return shape.edgeArcs.every(a => a && a.length > 0);
}

/**
 * Legacy: many-point circle (plain polygon, no arcs) → same geometry as {@link makeCircle}.
 * Preserves approximate diameter from average radius to center.
 */
export function migrateLegacyCirclePolygon(shape: Shape): Shape {
  if (!shape.closed || shape.label !== "Circle") return shape;
  if (shape.edgeArcs?.some(a => a && a.length > 0)) return shape;
  const pts = shape.points;
  if (pts.length < 12 || pts.length > 96) return shape;
  const c = centroid(pts);
  let sumR = 0;
  for (const p of pts) sumR += Math.hypot(p.x - c.x, p.y - c.y);
  const Rpx = sumR / pts.length;
  if (Rpx < 1e-6) return shape;
  const diameterM = (Rpx / PIXELS_PER_METER) * 2;
  return makeCircle(c.x, c.y, shape.layer, diameterM);
}

// ── Theme Colors ─────────────────────────────────────────────
// Default (dark) canvas theme

export const C = {
  bg: "#1a1a2e", grid: "#252542", gridMajor: "#2d2d50",
  accent: "#00d4aa", accentGlow: "rgba(0,212,170,0.4)",
  edge: "#00d4aa", edgeHover: "#00ffcc",
  point: "#ffffff", pointFill: "#00d4aa", pointHover: "#00ffcc",
  open: "#ff9f43", openHover: "#ffb066", openGlow: "rgba(255,159,67,0.4)",
  text: "#e0e0e0", textDim: "#888",
  angleFill: "rgba(255,200,50,0.12)", angleStroke: "rgba(255,200,50,0.6)", angleText: "#ffc832",
  panel: "#16162b", panelBorder: "#2a2a4a", button: "#252548", buttonHover: "#303060",
  shapeFill: "rgba(0,212,170,0.06)", selectedFill: "rgba(0,212,170,0.12)",
  danger: "#ff4757", snapLine: "rgba(0,212,170,0.5)",
  layer2: "#6c5ce7", layer2Dim: "rgba(108,92,231,0.15)", layer2Edge: "#a29bfe",
  inactiveShape: "rgba(255,255,255,0.08)", inactiveEdge: "rgba(255,255,255,0.2)",
  locked: "#ff6b6b", lockedGlow: "rgba(255,107,107,0.3)", lockedAngle: "#ff4444",
  geo: "#4ecdc4", geoText: "#45b7aa",
  fence: "#c8a070", fenceDim: "rgba(200,160,112,0.25)",
  wall: "#8e99a4", wallDim: "rgba(142,153,164,0.25)",
  kerb: "#6b7280", kerbDim: "rgba(107,114,128,0.25)",
  foundation: "#d4a76a", foundationDim: "rgba(212,167,106,0.25)",
  drainage: "#4a9c6d", drainageDim: "rgba(74,156,109,0.25)",
  canalPipe: "#3b82c4", canalPipeDim: "rgba(59,130,196,0.25)",
  waterPipe: "#60a5fa", waterPipeDim: "rgba(96,165,250,0.25)",
  cable: "#c084fc", cableDim: "rgba(192,132,252,0.25)",
  badge: "#1a1a2e",
  /** Layer 5 Adjustment overlay colors */
  adjustmentEmpty: "rgba(239,68,68,0.4)",
  adjustmentEmptyStroke: "#ef4444",
  adjustmentOverflow: "rgba(239,68,68,0.35)",
  adjustmentOverflowStroke: "#ef4444",
  adjustmentOverlap: "rgba(200,100,0,0.5)",
  adjustmentOverlapStroke: "#c2410c",
} as const;

/** Light Clean theme: white canvas, dark elements (canvas only) */
export const C_LIGHT: typeof C = {
  ...C,
  bg: "#f8fafc", grid: "#cbd5e1", gridMajor: "#94a3b8",
  accent: "#0d9488", accentGlow: "rgba(13,148,136,0.3)",
  edge: "#0f766e", edgeHover: "#0d9488",
  point: "#1e293b", pointFill: "#0d9488", pointHover: "#14b8a6",
  open: "#ea580c", openHover: "#c2410c", openGlow: "rgba(234,88,12,0.3)",
  text: "#1e293b", textDim: "#64748b",
  angleFill: "rgba(234,179,8,0.15)", angleStroke: "#ca8a04", angleText: "#a16207",
  panel: "#ffffff", panelBorder: "#e2e8f0", button: "#f1f5f9", buttonHover: "#e2e8f0",
  shapeFill: "rgba(13,148,136,0.08)", selectedFill: "rgba(13,148,136,0.15)",
  danger: "#dc2626", snapLine: "rgba(13,148,136,0.5)",
  layer2: "#7c3aed", layer2Dim: "rgba(124,58,237,0.15)", layer2Edge: "#8b5cf6",
  inactiveShape: "rgba(0,0,0,0.06)", inactiveEdge: "rgba(0,0,0,0.2)",
  locked: "#dc2626", lockedGlow: "rgba(220,38,38,0.2)", lockedAngle: "#b91c1c",
  geo: "#0d9488", geoText: "#0f766e",
  fence: "#92400e", fenceDim: "rgba(146,64,14,0.2)",
  wall: "#475569", wallDim: "rgba(71,85,105,0.2)",
  kerb: "#475569", kerbDim: "rgba(71,85,105,0.2)",
  foundation: "#b45309", foundationDim: "rgba(180,83,9,0.2)",
  drainage: "#15803d", drainageDim: "rgba(21,128,61,0.2)",
  canalPipe: "#1d4ed8", canalPipeDim: "rgba(29,78,216,0.2)",
  waterPipe: "#2563eb", waterPipeDim: "rgba(37,99,235,0.2)",
  cable: "#7c3aed", cableDim: "rgba(124,58,237,0.2)",
  badge: "#f1f5f9",
  adjustmentEmpty: "rgba(239,68,68,0.35)",
  adjustmentEmptyStroke: "#dc2626",
  adjustmentOverflow: "rgba(239,68,68,0.3)",
  adjustmentOverflowStroke: "#dc2626",
  adjustmentOverlap: "rgba(180,83,9,0.5)",
  adjustmentOverlapStroke: "#c2410c",
};