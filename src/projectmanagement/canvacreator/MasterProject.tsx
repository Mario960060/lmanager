import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Point, Shape, CollinearSnapHit, LayerID, ArcPoint, DragInfo, ShapeDragInfo, RotateInfo, ScaleCornerInfo, ScaleEdgeInfo,
  HitResult, EdgeHitResult, OpenEndHit,
  SelectionRect, DimEdit, ContextMenuInfo, LinkedEntry, isArcEntry,
  PIXELS_PER_METER, GRID_SPACING, POINT_RADIUS, EDGE_HIT_THRESHOLD, GRASS_EDGE_HIT_PX,
  SNAP_TO_START_RADIUS, SNAP_TO_LAST_RADIUS, MIN_ZOOM, MAX_ZOOM, SNAP_MAGNET_PX, PATTERN_SNAP_PX,
  distance, toMeters, toPixels, formatLength, midpoint, angleDeg, areaM2, polylineLengthMeters, rotatePointAround,
  projectOntoSegment, bestCollinearVertexSnap, edgeNormalAngle, readableTextAngle, snapTo45, snapTo45Soft, snapShiftSmart, interiorAngleDir, centroid, labelAnchorInsidePolygon,
  snapPatternDirectionToBoundaryAngles,
  constrainLockedEdges,
  snapMagnet, snapMagnetShape, pointInPolygon, pointInOrNearPolygon,
  makeSquare, makeRectangle, makeTriangle, makeTrapezoid, C, C_LIGHT,
  edgeOutwardRadForL1Edge,
  outwardUnitNormalForPolygonEdge,
} from "./geometry";
import {
  drawExteriorAlignedDimension,
  exteriorDimLabelScreenMid,
  boundaryDimL1ExteriorOffsetScreenPx,
  GARDEN_EXTERIOR_DIM_LINE_COLOR,
  GARDEN_EXTERIOR_DIM_TEXT_COLOR,
} from "./boundaryDimensionDraw";
import { calcEdgeSlopes, calcShapeGradient, formatSlope, slopeColor, interpolateHeightAtPoint, fillShapeHeightHeatmap, computeGlobalHeightRange } from "./geodesy";
import { isLinearElement, isGroundworkLinear, isPathElement, isPolygonLinearElement, groundworkLabel, drawLinearElement, drawLinearElementInactive, hitTestLinearElement, hitTestPathElement, computeThickPolyline, computeThickPolylineClosed, getPathPolygon, getLinearElementPath, getPolygonThicknessM, polygonToSegmentLengths, polygonToCenterline, polygonEdgeToSegmentIndex, removeSegmentFromPolygonOutline, computePathPolygonOneSide, computePathOutlineFromSegmentSides, pointSideOfLine } from "./linearElements";
import { drawShapeObjectLabel, drawExcavationLayers, getPathLabel } from "./canvasRenderers";
import { drawDeckPattern } from "./visualization/deckBoards";
import { drawSlabPattern, drawPathSlabPattern, drawPathSlabLabel, drawSlabFrame, computePatternSnap, getPolygonForPatternSnapOutline, computeSlabCuts, computePathSlabCuts } from "./visualization/slabPattern";
import { drawCobblestonePattern, drawMonoblockFrame, computeCobblestoneCuts } from "./visualization/cobblestonePattern";
import { drawFencePostMarkers, drawWallSlopeIndicators } from "./visualization/linearMarkers";
import { drawGeodesyLabels, getGeodesyCardsInfo, hitTestGeodesyCard, findCardForPoint, type GeodesyCardInfo, GEODESY_CARD_PAD, GEODESY_CARD_ROW_H } from "./visualization/geodesyLabels";
import { drawGrassPieces, hitTestGrassPiece, hitTestGrassPieceEdge, hitTestGrassJoinEdge, snapGrassPieceEdge, snapGrassPieceToPolygon, getJoinedGroup, rotateGrassGroup90, validateCoverage, getEffectiveTotalArea, getEffectivePieceDimensionsForInput, type GrassPiece } from "./visualization/grassRolls";
import { computeAutoFill } from "./objectCard/autoFill";
import { ProjectSettings, DEFAULT_PROJECT_SETTINGS } from "./types";
import ObjectCardModal from "./objectCard/ObjectCardModal";
import StairsCreationModal from "./objectCard/StairsCreationModal";
import PathCreationModal, { type PathConfig } from "./objectCard/PathCreationModal";
import ResultsModal from "./objectCard/ResultsModal";
import ProjectSummaryPanel from "./ProjectSummaryPanel";
import ProjectCardModal from "./ProjectCardModal";
import { computePreparation } from "./preparationLogic";
import { computeEmptyAreas, computeOverflowAreas, computeOverlaps, clipShapeToGarden, removeOverlapFromShape, findTouchingElementsForEmptyArea, extendShapeToCoverEmptyArea, extendShapeToGardenEdge, clipSurfaceToOutsideLinear, findSurfacesOverlappingLinear, fitUnionResultToShape } from "./adjustmentLogic";
import { computeGroundworkLinearResults, isManualExcavation, getFoundationDiggingMethodFromExcavator } from "./GroundworkLinearCalculator";
import { drawAlternatingLinkedHalf } from "./linkedEdgeDrawing";
import { drawCurvedEdge, calcEdgeLengthWithArcs, getEffectivePolygon, getEffectivePolygonWithEdgeIndices, drawSmoothPolygonPath, drawSmoothPolygonStroke, projectOntoArcEdge, drawArcHandles, hitTestArcPoint, snapArcPoint, buildArcPointPositionCache, arcPointToWorldOnCurve, worldToArcPoint, worldToArcPointOnCurve, collectShapeBoundaryDirectionAnglesDeg, type ArcPointCacheEntry } from "./arcMath";
import CreatePreviewModal from "./CreatePreviewModal";
import PlanPdfExportModal from "./PlanPdfExportModal";
import { submitProject } from "./projectSubmit";
import jsPDF from "jspdf";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../lib/store";
import { loadPlan, savePlan, linkPlanToEvent, type CanvasPayload } from "../../lib/plansService";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../themes";
import "./toolbar.css";

// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — Phase 1 + 2.0: CAD 2D Editor with Layers
// ══════════════════════════════════════════════════════════════

const DRAFT_STORAGE_KEY = "landscapeManager_canvasDraft";
const DRAFT_DEBOUNCE_MS = 1500;
const PLAN_SAVE_DEBOUNCE_MS = 4000;

type Mode = "select" | "freeDraw" | "scale" | "move" | "drawFence" | "drawWall" | "drawKerb" | "drawFoundation" | "drawPathSlabs" | "drawPathConcreteSlabs" | "drawPathMonoblock" | "drawDrainage" | "drawCanalPipe" | "drawWaterPipe" | "drawCable";
type ActiveLayer = 1 | 2 | 3 | 4 | 5;
type ViewFilter = "all" | "linear" | "surface";

const SURFACE_CALC_TYPES = ["slab", "deck", "grass", "turf", "paving"] as const;
/** View filter applies only to layer 2 elements. Stairs visible only on layer 2 & viewFilter "all". */
function passesViewFilter(shape: Shape, viewFilter: ViewFilter, activeLayer: ActiveLayer): boolean {
  if (shape.layer !== 2) return true;
  // Stairs: visible only on layer 2 and only when "all" is selected
  if (shape.calculatorType === "steps") return activeLayer === 2 && viewFilter === "all";
  if (viewFilter === "all") return true;
  if (viewFilter === "linear") return isLinearElement(shape);
  if (viewFilter === "surface") {
    if (shape.elementType === "pathSlabs" || shape.elementType === "pathConcreteSlabs" || shape.elementType === "pathMonoblock") return true;
    return shape.elementType === "polygon" && SURFACE_CALC_TYPES.includes((shape.calculatorType ?? "") as any);
  }
  return false;
}

const LINE_VERTEX_DRAW_SNAP_PX = 8;
const LINE_EDGE_DRAW_SNAP_PX = 12;

function drawSnapHalfOffsetM(drawingShape: Shape): number {
  if (isPolygonLinearElement(drawingShape)) return getPolygonThicknessM(drawingShape) / 2;
  if (isPathElement(drawingShape)) return (Number(drawingShape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6) / 2;
  return (drawingShape.thickness ?? 0.10) / 2;
}

/** Snap X/Y to vertices of current chain + layer 1 & 2; for polygon/path strip, snap to edges of closed refs with half-width offset outside. */
function snapWorldPointForLinearDrawing(
  ep: Point,
  args: {
    drawingShapeIdx: number;
    shapes: Shape[];
    localPtChain: Point[];
    drawingShape: Shape;
    zoom: number;
    viewFilter: ViewFilter;
    activeLayer: ActiveLayer;
  },
): Point {
  const { drawingShapeIdx, shapes, localPtChain, drawingShape, zoom, viewFilter, activeLayer } = args;
  const vTh = LINE_VERTEX_DRAW_SNAP_PX / zoom;
  let bestDx = vTh, bestDy = vTh;
  let sx: number | null = null, sy: number | null = null;
  for (let i = 0; i < localPtChain.length; i++) {
    const p = localPtChain[i];
    const dx = Math.abs(ep.x - p.x);
    const dy = Math.abs(ep.y - p.y);
    if (dx < bestDx) { bestDx = dx; sx = p.x; }
    if (dy < bestDy) { bestDy = dy; sy = p.y; }
  }
  for (let si = 0; si < shapes.length; si++) {
    if (si === drawingShapeIdx) continue;
    const sh = shapes[si];
    if (sh.layer !== 1 && sh.layer !== 2) continue;
    if (!passesViewFilter(sh, viewFilter, activeLayer)) continue;
    for (const p of sh.points) {
      const dx = Math.abs(ep.x - p.x);
      const dy = Math.abs(ep.y - p.y);
      if (dx < bestDx) { bestDx = dx; sx = p.x; }
      if (dy < bestDy) { bestDy = dy; sy = p.y; }
    }
  }
  const out = { x: sx ?? ep.x, y: sy ?? ep.y };

  const useEdgeOutside =
    isPolygonLinearElement(drawingShape) || isPathElement(drawingShape) || drawingShape.elementType === "fence";
  if (!useEdgeOutside) return out;

  const halfW = drawSnapHalfOffsetM(drawingShape);
  const eTh = LINE_EDGE_DRAW_SNAP_PX / zoom;
  let bestD = eTh;
  let bestQ: Point | null = null;

  const considerClosedPoly = (poly: Point[]) => {
    const n = poly.length;
    if (n < 3) return;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const pr = projectOntoSegment(out, poly[i], poly[j]);
      if (pr.dist >= bestD) continue;
      if (pr.t < 0 || pr.t > 1) continue;
      const nrm = outwardUnitNormalForPolygonEdge(poly[i], poly[j], poly);
      bestD = pr.dist;
      bestQ = { x: pr.proj.x + nrm.x * halfW, y: pr.proj.y + nrm.y * halfW };
    }
  };

  const considerOpenCenterline = (pts: Point[]) => {
    const n = pts.length;
    if (n < 2) return;
    for (let i = 0; i < n - 1; i++) {
      const pr = projectOntoSegment(out, pts[i], pts[i + 1]);
      if (pr.dist >= bestD) continue;
      if (pr.t < 0 || pr.t > 1) continue;
      bestD = pr.dist;
      bestQ = { ...pr.proj };
    }
  };

  for (let si = 0; si < shapes.length; si++) {
    if (si === drawingShapeIdx) continue;
    const sh = shapes[si];
    if (sh.layer !== 1 && sh.layer !== 2) continue;
    if (!passesViewFilter(sh, viewFilter, activeLayer)) continue;

    if (sh.closed && sh.points.length >= 3) {
      if (isPolygonLinearElement(sh)) considerClosedPoly(sh.points);
      else if (isPathElement(sh)) considerClosedPoly(getPathPolygon(sh));
      else if (sh.elementType === "polygon") considerClosedPoly(sh.points);
    }
    if (isLinearElement(sh) && !isPolygonLinearElement(sh) && sh.points.length >= 2) {
      considerOpenCenterline(getLinearElementPath(sh));
    }
  }

  return bestQ ?? out;
}

/** Layer 3: hit-test screen coords on the pattern rotation handle (same 14px box as LMB). Topmost shape wins. */
function hitTestPatternRotationHandle(
  shapes: Shape[],
  screenX: number,
  screenY: number,
  worldToScreen: (wx: number, wy: number) => Point,
  viewFilter: ViewFilter,
  activeLayer: ActiveLayer,
): { shapeIdx: number; patternType: "slab" | "cobblestone" | "grass" } | null {
  if (activeLayer !== 3) return null;
  for (let si = shapes.length - 1; si >= 0; si--) {
    const shape = shapes[si];
    if (shape.layer !== 2 || !shape.closed || shape.points.length < 3) continue;
    if (!passesViewFilter(shape, viewFilter, activeLayer)) continue;
    const pts = shape.points;
    let minY = Infinity;
    for (const p of pts) {
      const sp = worldToScreen(p.x, p.y);
      if (sp.y < minY) minY = sp.y;
    }
    const ctr = centroid(pts);
    const sc = worldToScreen(ctr.x, ctr.y);
    const handleY = minY - 35;
    if (Math.abs(screenX - sc.x) >= 14 || Math.abs(screenY - handleY) >= 14) continue;
    if (shape.calculatorType === "grass" && (shape.calculatorInputs?.vizPieces?.length ?? 0) > 0) {
      return { shapeIdx: si, patternType: "grass" };
    }
    const pavingOk = shape.calculatorType === "paving" && shape.calculatorInputs?.blockLengthCm && shape.calculatorInputs?.blockWidthCm;
    const slabOk =
      (shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && shape.calculatorInputs?.vizSlabWidth;
    if (pavingOk || slabOk) {
      return { shapeIdx: si, patternType: shape.calculatorType === "paving" ? "cobblestone" : "slab" };
    }
  }
  return null;
}

/** Edge-length edit dialog: size estimate (fixed layout) + clearance from the edited segment in screen space. */
const DIM_EDIT_DIALOG_W = 300;
const DIM_EDIT_DIALOG_H = 330;
const OFFSET_ALONG_LINE_DIALOG_W = 300;
/** Min. height for clamping; real content can be taller — modal uses maxHeight + scroll if needed */
const OFFSET_ALONG_LINE_DIALOG_H = 268;
const DIM_EDIT_VERTEX_MARGIN = 42;
const DIM_EDIT_LINE_PAD = 16;

function pointInClosedRect(px: number, py: number, L: number, T: number, R: number, B: number): boolean {
  return px >= L && px <= R && py >= T && py <= B;
}

function distPointToRect(px: number, py: number, L: number, T: number, R: number, B: number): number {
  const dx = px < L ? L - px : px > R ? px - R : 0;
  const dy = py < T ? T - py : py > B ? py - B : 0;
  return Math.hypot(dx, dy);
}

function orient2(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function onSeg(ax: number, ay: number, bx: number, by: number, px: number, py: number, eps: number): boolean {
  return (
    px >= Math.min(ax, bx) - eps &&
    px <= Math.max(ax, bx) + eps &&
    py >= Math.min(ay, by) - eps &&
    py <= Math.max(ay, by) + eps
  );
}

function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const eps = 1e-9;
  const o1 = orient2(ax, ay, bx, by, cx, cy);
  const o2 = orient2(ax, ay, bx, by, dx, dy);
  const o3 = orient2(cx, cy, dx, dy, ax, ay);
  const o4 = orient2(cx, cy, dx, dy, bx, by);
  if (Math.abs(o1) < eps && onSeg(ax, ay, bx, by, cx, cy, eps)) return true;
  if (Math.abs(o2) < eps && onSeg(ax, ay, bx, by, dx, dy, eps)) return true;
  if (Math.abs(o3) < eps && onSeg(cx, cy, dx, dy, ax, ay, eps)) return true;
  if (Math.abs(o4) < eps && onSeg(cx, cy, dx, dy, bx, by, eps)) return true;
  return o1 * o2 < -eps && o3 * o4 < -eps;
}

function segmentIntersectsRect(ax: number, ay: number, bx: number, by: number, L: number, T: number, R: number, B: number): boolean {
  if (pointInClosedRect(ax, ay, L, T, R, B) || pointInClosedRect(bx, by, L, T, R, B)) return true;
  const edges: [number, number, number, number][] = [
    [L, T, R, T],
    [R, T, R, B],
    [R, B, L, B],
    [L, B, L, T],
  ];
  for (const [sx, sy, ex, ey] of edges) {
    if (segmentsIntersect(ax, ay, bx, by, sx, sy, ex, ey)) return true;
  }
  return false;
}

function dimEditDialogObscuresEdge(
  left: number, top: number, w: number, h: number,
  ax: number, ay: number, bx: number, by: number,
): boolean {
  const L = left - DIM_EDIT_LINE_PAD;
  const T = top - DIM_EDIT_LINE_PAD;
  const R = left + w + DIM_EDIT_LINE_PAD;
  const B = top + h + DIM_EDIT_LINE_PAD;
  if (segmentIntersectsRect(ax, ay, bx, by, L, T, R, B)) return true;
  if (distPointToRect(ax, ay, left, top, left + w, top + h) < DIM_EDIT_VERTEX_MARGIN) return true;
  if (distPointToRect(bx, by, left, top, left + w, top + h) < DIM_EDIT_VERTEX_MARGIN) return true;
  return false;
}

function perpDistToLine(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lab = Math.hypot(abx, aby);
  if (lab < 1e-9) return Math.hypot(px - ax, py - ay);
  return Math.abs((px - ax) * aby - (py - ay) * abx) / lab;
}

/** Places the dialog in viewport coords beside the edge (perpendicular offset), avoiding the segment and endpoints. */
function computeDimEditDialogPosition(
  canvasRect: DOMRect,
  sAcanvas: Point,
  sBcanvas: Point,
  fallbackClientX: number,
  fallbackClientY: number,
): { left: number; top: number } {
  const ax = canvasRect.left + sAcanvas.x;
  const ay = canvasRect.top + sAcanvas.y;
  const bx = canvasRect.left + sBcanvas.x;
  const by = canvasRect.top + sBcanvas.y;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  let edx = bx - ax;
  let edy = by - ay;
  const elen = Math.hypot(edx, edy);
  if (elen < 1e-6) {
    edx = 1;
    edy = 0;
  } else {
    edx /= elen;
    edy /= elen;
  }
  const nx = -edy;
  const ny = edx;
  const { left: rL, top: rT, right: rR, bottom: rB } = canvasRect;
  const margin = 12;
  const w = DIM_EDIT_DIALOG_W;
  const h = DIM_EDIT_DIALOG_H;

  const trySide = (sign: 1 | -1): { left: number; top: number } | null => {
    let dist = h * 0.5 + DIM_EDIT_VERTEX_MARGIN + 10;
    for (let i = 0; i < 14; i++) {
      const cx = mx + sign * nx * dist;
      const cy = my + sign * ny * dist;
      let left = cx - w / 2;
      let top = cy - h / 2;
      left = Math.max(rL + margin, Math.min(rR - w - margin, left));
      top = Math.max(rT + margin, Math.min(rB - h - margin, top));
      if (!dimEditDialogObscuresEdge(left, top, w, h, ax, ay, bx, by)) {
        return { left, top };
      }
      dist += 48;
    }
    return null;
  };

  const posA = trySide(1);
  const posB = trySide(-1);
  if (posA && posB) {
    const sA = perpDistToLine(posA.left + w / 2, posA.top + h / 2, ax, ay, bx, by);
    const sB = perpDistToLine(posB.left + w / 2, posB.top + h / 2, ax, ay, bx, by);
    return sA >= sB ? posA : posB;
  }
  if (posA) return posA;
  if (posB) return posB;

  let left = Math.max(rL + margin, Math.min(rR - w - margin, fallbackClientX - w / 2));
  let top = Math.max(rT + margin, Math.min(rB - h - margin, fallbackClientY - h / 2));
  if (dimEditDialogObscuresEdge(left, top, w, h, ax, ay, bx, by)) {
    left = Math.max(rL + margin, rR - w - margin);
    top = Math.max(rT + margin, Math.min(rB - h - margin, rT + margin + 8));
  }
  return { left, top };
}

const EDGE_MATCH_TOL = 5;

/** Maps shape.calculatorType to project.json key suffix (ctx menu / summaries). */
const CALCULATOR_TYPE_I18N_SUFFIX: Record<string, string> = {
  slab: "calculator_type_slab",
  paving: "calculator_type_paving",
  concreteSlabs: "calculator_type_concrete_slabs",
  grass: "calculator_type_grass",
  turf: "calculator_type_turf",
  deck: "calculator_type_deck",
  wall: "calculator_type_wall",
  fence: "calculator_type_fence",
  foundation: "calculator_type_foundation",
  groundwork: "calculator_type_groundwork",
  steps: "calculator_type_steps",
};

function translateCalculatorTypeLabel(calculatorType: string, t: (key: string) => string): string {
  if (!calculatorType) return "";
  const suffix = CALCULATOR_TYPE_I18N_SUFFIX[calculatorType];
  if (suffix) {
    const fullKey = `project:${suffix}`;
    const tr = t(fullKey);
    if (tr && tr !== fullKey) return tr;
  }
  return calculatorType;
}

function labelEditObjectCard(calculatorType: string | undefined, t: (key: string, opts?: Record<string, string>) => string): string {
  if (!calculatorType) return `✏️ ${t("project:ctx_edit_object_card")}`;
  const typeLabel = translateCalculatorTypeLabel(calculatorType, t);
  return `✏️ ${t("project:ctx_edit_object_card_with_type", { type: typeLabel })}`;
}

/** List label for shapes in adjustment / pick dialogs */
function shapeDisplayName(s: Shape | undefined, si: number, t: (key: string, opts?: Record<string, string | number>) => string): string {
  if (!s) return t("project:summary_element_n", { n: si + 1 });
  if (s.label) return s.label;
  if (s.calculatorType) return translateCalculatorTypeLabel(s.calculatorType, t as (key: string) => string);
  if (s.elementType) return s.elementType;
  return t("project:summary_element_n", { n: si + 1 });
}

/** Check if two edges are the same (within tolerance). */
function edgesMatch(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  return (
    (distance(a1, b1) < EDGE_MATCH_TOL && distance(a2, b2) < EDGE_MATCH_TOL) ||
    (distance(a1, b2) < EDGE_MATCH_TOL && distance(a2, b1) < EDGE_MATCH_TOL)
  );
}

/** Apply polygon points from adjustment operations (extend/fill).
 * When shape has arcs, fits union result to preserve arc structure (no extra points).
 * Otherwise preserves edgeArcs only on edges that weren't modified. */
function applyPolygonPointsToShape(shape: Shape, newPts: Point[]): Shape {
  const fitted = fitUnionResultToShape(shape, newPts);
  if (fitted) return fitted;
  const s = { ...shape, points: newPts };
  if (isPathElement(s)) {
    s.calculatorInputs = { ...s.calculatorInputs, pathIsOutline: true };
  }
  if (!shape.edgeArcs || shape.edgeArcs.every(a => !a || a.length === 0)) {
    s.edgeArcs = undefined;
    return s;
  }
  const oldPts = shape.points;
  const n = newPts.length;
  const m = oldPts.length;
  const newEdgeArcs: (typeof shape.edgeArcs)[number][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const newA = newPts[i];
    const newB = newPts[j];
    let matched = false;
    for (let k = 0; k < m; k++) {
      const l = (k + 1) % m;
      if (edgesMatch(newA, newB, oldPts[k], oldPts[l]) && shape.edgeArcs[k]) {
        newEdgeArcs[i] = [...shape.edgeArcs[k]!];
        matched = true;
        break;
      }
    }
    if (!matched) newEdgeArcs[i] = null;
  }
  s.edgeArcs = newEdgeArcs.length > 0 ? newEdgeArcs : undefined;
  return s;
}

/** Compute context menu position so it always fits on screen. Opens in the direction with most space. */
function clampContextMenuPosition(clickX: number, clickY: number, menuWidth: number, menuHeight: number, padding = 8): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Prefer opening in direction with more space (right vs left, down vs up)
  const spaceRight = vw - clickX;
  const spaceLeft = clickX;
  const spaceBelow = vh - clickY;
  const spaceAbove = clickY;
  let x = spaceRight >= spaceLeft ? clickX : clickX - menuWidth;
  let y = spaceBelow >= spaceAbove ? clickY : clickY - menuHeight;
  // Clamp to viewport
  x = Math.max(padding, Math.min(vw - menuWidth - padding, x));
  y = Math.max(padding, Math.min(vh - menuHeight - padding, y));
  return { x, y };
}

/** Centered fixed dialog clamped to the browser viewport (avoids clipping at canvas or screen edge). */
function clampCenteredFixedDialog(clientX: number, clientY: number, dialogW: number, dialogH: number, padding = 12): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = clientX - dialogW / 2;
  let top = clientY - dialogH / 2;
  left = Math.max(padding, Math.min(vw - dialogW - padding, left));
  top = Math.max(padding, Math.min(vh - dialogH - padding, top));
  return { left, top };
}

export default function MasterProject() {
  const navigate = useNavigate();
  const { planId: urlPlanId } = useParams<{ planId?: string }>();
  const { user } = useAuthStore();
  const currentPlanIdRef = useRef<string | null>(urlPlanId ?? null);
  const { t } = useTranslation(["project"]);
  const { currentTheme } = useTheme();
  const CC = currentTheme?.id === "light" ? C_LIGHT : C;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRafRef = useRef<number>(0);

  const [shapes, setShapes] = useState<Shape[]>([]);
  const [history, setHistory] = useState<Shape[][]>([]);
  const historyRef = useRef<Shape[][]>([]);
  const [selectedShapeIdx, setSelectedShapeIdx] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("select");
  const [drawingShapeIdx, setDrawingShapeIdx] = useState<number | null>(null);
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<HitResult | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<EdgeHitResult | null>(null);
  const [hoveredArcPoint, setHoveredArcPoint] = useState<{ shapeIdx: number; edgeIdx: number; arcPoint: ArcPoint } | null>(null);
  const [arcDragInfo, setArcDragInfo] = useState<{
    shapeIdx: number;
    edgeIdx: number;
    arcPoint: ArcPoint;
    startMouse: Point;
    startArcPointWorld: Point;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [selectedPoints, setSelectedPoints] = useState<HitResult[]>([]);
  const [shapeDragInfo, setShapeDragInfo] = useState<ShapeDragInfo | null>(null);
  const [rotateInfo, setRotateInfo] = useState<RotateInfo | null>(null);
  const [scaleCorner, setScaleCorner] = useState<ScaleCornerInfo | null>(null);
  const [scaleEdge, setScaleEdge] = useState<ScaleEdgeInfo | null>(null);
  const [edgeDragInfo, setEdgeDragInfo] = useState<{ shapeIdx: number; edgeIdx: number; startMouse: Point; startP0: Point; startP1: Point } | null>(null);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 600 });
  const [editingDim, setEditingDim] = useState<DimEdit | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingDimMode, setEditingDimMode] = useState<"a" | "b" | "split">("b");
  const [mouseWorld, setMouseWorld] = useState<Point>({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<ContextMenuInfo | null>(null);
  const [contextMenuDisplayPos, setContextMenuDisplayPos] = useState<{ x: number; y: number } | null>(null);
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>(1);
  const [selectedPattern, setSelectedPattern] = useState<{ shapeIdx: number; type: "slab" | "grass" | "cobblestone" } | null>(null);
  const [editingGeodesyCard, setEditingGeodesyCard] = useState<{ cardInfo: GeodesyCardInfo } | null>(null);
  const [heightValues, setHeightValues] = useState<string[]>([]);
  const [hoveredHeightPoint, setHoveredHeightPoint] = useState<{ shapeIdx: number; heightPointIdx: number } | null>(null);
  const [clickedHeightTooltip, setClickedHeightTooltip] = useState<{ world: Point; shapeIdx: number; height: number } | null>(null);
  // Linked points: groups of points that move together across shapes
  // Each group is an array of LinkedEntry that should stay at the same position
  const [linkedGroups, setLinkedGroups] = useState<LinkedEntry[][]>([]);
  const [objectCardShapeIdx, setObjectCardShapeIdx] = useState<number | null>(null);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>(DEFAULT_PROJECT_SETTINGS);
  const [showEquipmentPanel, setShowEquipmentPanel] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const hasShownInitialProjectCardRef = useRef(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draggingGrassPiece, setDraggingGrassPiece] = useState<{ shapeIdx: number; pieceIdx: number; startMouse: Point } | null>(null);
  const [grassNearEdge, setGrassNearEdge] = useState<{ pieceIdx: number; otherPieceIdx: number; edgeIdx: number } | null>(null);
  const [grassTrimModal, setGrassTrimModal] = useState<{ shapeIdx: number; pieceAIdx: number; pieceBIdx: number; edgeIdx: number } | null>(null);
  const [adjustmentFillModal, setAdjustmentFillModal] = useState<{ emptyAreaIdx: number } | null>(null);
  const [adjustmentExtendModal, setAdjustmentExtendModal] = useState<{ emptyAreaIdx: number } | null>(null);
  const [adjustmentSpreadModal, setAdjustmentSpreadModal] = useState<{ shapeIdxA: number; shapeIdxB: number; overlapIdx: number } | null>(null);
  const [grassScaleInfo, setGrassScaleInfo] = useState<{ shapeIdx: number; pieceIdx: number; edge: "length_start" | "length_end"; startMouse: Point; startLength: number; startX: number; startY: number } | null>(null);
  const [grassAlignedPolyEdges, setGrassAlignedPolyEdges] = useState<number[]>([]);
  const [patternDragInfo, setPatternDragInfo] = useState<{ shapeIdx: number; type: "slab" | "cobblestone"; startMouse: Point; startOffset: Point; isPath?: boolean; startPathSegmentIdx?: number; startPathPatternLongOffsetMBySegment?: number[] } | null>(null);
  const [patternDragPreview, setPatternDragPreview] = useState<Point | null>(null);
  const [pathPatternLongOffsetPreview, setPathPatternLongOffsetPreview] = useState<{ segmentIdx: number; value: number } | null>(null);
  const [patternAlignedEdges, setPatternAlignedEdges] = useState<number[]>([]);
  const [patternRotateInfo, setPatternRotateInfo] = useState<{
    shapeIdx: number;
    type: "slab" | "cobblestone" | "grass";
    center: Point;
    startAngle: number;
    startDirectionDeg: number;
    boundaryAnglesDeg: number[];
  } | null>(null);
  const [patternRotatePreview, setPatternRotatePreview] = useState<number | null>(null);
  /** One saveHistory() per "burst" of Shift+wheel pattern rotation (undo as single step). */
  const patternWheelHistorySavedRef = useRef(false);
  const [showRestoredToast, setShowRestoredToast] = useState(false);
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const [layersDropdownOpen, setLayersDropdownOpen] = useState(false);
  const layersDropdownRef = useRef<HTMLDivElement>(null);
  const switchLayerRef = useRef<(layer: ActiveLayer) => void>(() => {});
  const [shapesDropdownOpen, setShapesDropdownOpen] = useState(false);
  const shapesDropdownRef = useRef<HTMLDivElement>(null);
  const [pathDropdownOpen, setPathDropdownOpen] = useState(false);
  const pathDropdownRef = useRef<HTMLDivElement>(null);
  const [linearDropdownOpen, setLinearDropdownOpen] = useState(false);
  const linearDropdownRef = useRef<HTMLDivElement>(null);
  const [groundworkDropdownOpen, setGroundworkDropdownOpen] = useState(false);
  const groundworkDropdownRef = useRef<HTMLDivElement>(null);
  const [stairsDropdownOpen, setStairsDropdownOpen] = useState(false);
  const stairsDropdownRef = useRef<HTMLDivElement>(null);
  const [stairsCreationModal, setStairsCreationModal] = useState<{ subType: "standard" | "l_shape" | "u_shape"; name: string } | null>(null);
  const [pathCreationModal, setPathCreationModal] = useState<{ subType: "slabs" | "concreteSlabs" | "monoblock"; name: string } | null>(null);
  const [pathConfig, setPathConfig] = useState<PathConfig | null>(null);
  /** Path segment side selection: after centerline drawn, user picks side for each segment (all visible at once) */
  const [pathSegmentSideSelection, setPathSegmentSideSelection] = useState<{ shapeIdx: number; segmentSides: ("left" | "right" | null)[] } | null>(null);
  /** Path shapeIdx that was just drawn – triggers auto-calculate when PathCreationModal opens */
  const [pathJustFinishedForAutoCalc, setPathJustFinishedForAutoCalc] = useState<number | null>(null);
  const [shapeCreationModal, setShapeCreationModal] = useState<{ type: "square" | "rectangle" | "triangle" | "trapezoid" } | null>(null);
  const [setAngleModal, setSetAngleModal] = useState<{ shapeIdx: number; pointIdx: number } | null>(null);
  const [setAngleTargetValue, setSetAngleTargetValue] = useState("");
  const [setAngleMode, setSetAngleMode] = useState<"a" | "b" | "split">("split");
  /** PPM on vertex → choose second vertex: move first along line through both, to set distance from anchor */
  const [pointOffsetAlongLinePick, setPointOffsetAlongLinePick] = useState<{ moveShapeIdx: number; movePointIdx: number } | null>(null);
  const [pointOffsetAlongLineModal, setPointOffsetAlongLineModal] = useState<{
    moveShapeIdx: number;
    movePointIdx: number;
    anchorShapeIdx: number;
    anchorPointIdx: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [pointOffsetAlongLineValue, setPointOffsetAlongLineValue] = useState("");
  /** Drives rAF repaint for orange pick highlights */
  const [offsetAlongLinePickPulse, setOffsetAlongLinePickPulse] = useState(0);
  const [measureStart, setMeasureStart] = useState<Point | null>(null);
  const [measureEnd, setMeasureEnd] = useState<Point | null>(null);
  const [resultsModalShapeIdx, setResultsModalShapeIdx] = useState<number | null>(null);
  const [showCreatePreview, setShowCreatePreview] = useState(false);
  const [recalculateTrigger, setRecalculateTrigger] = useState(0);
  const [geodesyEnabled, setGeodesyEnabled] = useState(false);
  const [showAllArcPoints, setShowAllArcPoints] = useState(false);

  const isMobile = useMemo(() => typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0), []);
  const pointRadiusEffective = isMobile ? POINT_RADIUS * 1.8 : POINT_RADIUS;
  const edgeHitThresholdEffective = isMobile ? EDGE_HIT_THRESHOLD * 1.8 : EDGE_HIT_THRESHOLD;
  const grassEdgeHitPxEffective = isMobile ? GRASS_EDGE_HIT_PX * 1.5 : GRASS_EDGE_HIT_PX;
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [namePromptShapeIdx, setNamePromptShapeIdx] = useState<number | null>(null);
  const [projectSummaryContextMenu, setProjectSummaryContextMenu] = useState<{ shapeIdx: number; x: number; y: number } | null>(null);
  const [projectSummaryDisplayPos, setProjectSummaryDisplayPos] = useState<{ x: number; y: number } | null>(null);
  const [shapeInputs, setShapeInputs] = useState({ side: "4", width: "6", height: "4", base: "5", top: "3", bottom: "6", name: "" });

  const screenToWorld = useCallback((sx: number, sy: number): Point => ({ x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom }), [pan, zoom]);
  const worldToScreen = useCallback((wx: number, wy: number): Point => ({ x: wx * zoom + pan.x, y: wy * zoom + pan.y }), [pan, zoom]);

  const transformStartVizPiecesRef = useRef<GrassPiece[] | null>(null);
  const gardenDragChildrenRef = useRef<{ idx: number; startPoints: Point[]; startVizPieces: GrassPiece[] | null }[]>([]);
  const projectSummaryMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const arcSnapLockedTargetRef = useRef<{ si: number; ei: number; arcId: string } | null>(null);
  const arcSnapCacheRef = useRef<ArcPointCacheEntry[] | null>(null);
  const arcDragRafRef = useRef<number | null>(null);
  const arcDragPendingRef = useRef<{ mouseX: number; mouseY: number } | null>(null);

  const isOnActiveLayer = useCallback((si: number): boolean => {
    if (activeLayer === 3) return shapes[si]?.layer === 2; // Layer 3: treat Layer 2 shapes as active (same menu, points visibility)
    if (activeLayer === 4) return false; // Preparation is read-only
    if (activeLayer === 5) return shapes[si]?.layer === 1 || shapes[si]?.layer === 2; // Adjustment: L1 + L2
    return shapes[si]?.layer === activeLayer;
  }, [shapes, activeLayer]);

  /** Cache of arc point positions (on curve) for snap during drag */
  const arcPointPositionCache = useMemo(
    () => buildArcPointPositionCache(shapes, isOnActiveLayer),
    [shapes, isOnActiveLayer]
  );

  /** For right-click scale: Layer 2 shapes when activeLayer=3, else normal active layer */
  const isOnActiveLayerForScale = useCallback((si: number): boolean => {
    if (activeLayer === 3) return shapes[si]?.layer === 2;
    if (activeLayer === 4) return false;
    if (activeLayer === 5) return shapes[si]?.layer === 1 || shapes[si]?.layer === 2;
    return shapes[si]?.layer === activeLayer;
  }, [shapes, activeLayer]);

  useEffect(() => {
    if (!pointOffsetAlongLinePick) return;
    setOffsetAlongLinePickPulse(0);
    let id = 0;
    const loop = () => {
      setOffsetAlongLinePickPulse(n => n + 1);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [pointOffsetAlongLinePick]);

  /** Layer 5 Adjustment: empty areas, overflow, overlaps (computed when shapes change) */
  const adjustmentData = useMemo(() => ({
    emptyAreas: computeEmptyAreas(shapes),
    overflowAreas: computeOverflowAreas(shapes),
    overlaps: computeOverlaps(shapes),
  }), [shapes]);

  // ── Undo History ────────────────────────────────────────
  const saveHistory = useCallback(() => {
    historyRef.current = [...historyRef.current, JSON.parse(JSON.stringify(shapes))];
    setHistory(historyRef.current);
  }, [shapes]);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setHistory(historyRef.current);
    setShapes(prev);
    setSelectedShapeIdx(null);
    setSelectedPoints([]);
    setDrawingShapeIdx(null);
  }, []);

  const onCalculatorInputsChange = useCallback((idx: number, inputs: Record<string, any>) => {
    setShapes(p => {
      const n = [...p];
      const s = n[idx];
      if (!s) return p;
      let merged = { ...(s.calculatorInputs ?? {}), ...inputs };
      if (isPathElement(s)) {
        const pathKeys = ["pathWidthM", "pathCenterline", "pathSegmentSides", "pathIsOutline", "pathCenterlineOriginal", "vizSlabWidth", "vizSlabLength", "pathWidthMode"];
        for (const k of pathKeys) {
          if (s.calculatorInputs?.[k] !== undefined) merged[k] = s.calculatorInputs[k];
        }
        if (merged.pathWidthM == null && s.calculatorInputs?.pathWidthCm != null) {
          merged.pathWidthM = Number(s.calculatorInputs.pathWidthCm) / 100;
        }
      }
      n[idx] = { ...s, calculatorInputs: merged };
      return n;
    });
  }, []);

  const restoredFromDraftRef = useRef(false);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const planSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const planSavePendingRef = useRef(false);
  const isExportingRef = useRef(false);
  const [showPdfExportModal, setShowPdfExportModal] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setCanvasSize({ w: entries[0].contentRect.width, h: entries[0].contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Restore: from plan (DB) if planId in URL, else from localStorage draft
  useEffect(() => {
    const load = async () => {
      if (urlPlanId) {
        try {
          const payload = await loadPlan(supabase, urlPlanId);
          currentPlanIdRef.current = urlPlanId;
          applyPayload(payload as { shapes?: Shape[]; projectSettings?: ProjectSettings; pan?: Point; zoom?: number; activeLayer?: ActiveLayer; linkedGroups?: LinkedEntry[][] });
          restoredFromDraftRef.current = true;
          setShowRestoredToast(true);
          setTimeout(() => setShowRestoredToast(false), 3500);
        } catch (e) {
          console.error("Failed to load plan:", e);
        } finally {
          setInitialLoadDone(true);
        }
        return;
      }
      try {
        const companyId = useAuthStore.getState().getCompanyId();
        const key = companyId ? `${DRAFT_STORAGE_KEY}_${companyId}` : DRAFT_STORAGE_KEY;
        const raw = localStorage.getItem(key);
        if (!raw) {
          setInitialLoadDone(true);
          return;
        }
        const draft = JSON.parse(raw) as { shapes?: Shape[]; projectSettings?: ProjectSettings; pan?: Point; zoom?: number; activeLayer?: ActiveLayer; linkedGroups?: LinkedEntry[][]; savedAt?: string };
        if (!draft?.shapes?.length && !draft?.projectSettings) {
          setInitialLoadDone(true);
          return;
        }
        applyPayload(draft);
        restoredFromDraftRef.current = true;
        setShowRestoredToast(true);
        setTimeout(() => setShowRestoredToast(false), 3500);
      } catch {
        // ignore parse errors
      } finally {
        setInitialLoadDone(true);
      }
    };
    function applyPayload(d: { shapes?: Shape[]; projectSettings?: ProjectSettings; pan?: Point; zoom?: number; activeLayer?: ActiveLayer; linkedGroups?: LinkedEntry[][] }) {
      if (d.shapes?.length) {
        let migrated = d.shapes.map(s => ((s as { layer?: number }).layer === 0 ? { ...s, layer: 1 as LayerID } : s));
        migrated = migrated.map(s => {
          if (!isPolygonLinearElement(s) || s.closed || s.points.length < 2) return s;
          const pathPts = getLinearElementPath(s);
          const thicknessM = getPolygonThicknessM(s);
          const outline = computeThickPolyline(pathPts, toPixels(thicknessM));
          if (outline.length < 3) return s;
          const segLengths = polygonToSegmentLengths(outline);
          const inputs: Record<string, unknown> = { ...s.calculatorInputs, segmentLengths: segLengths };
          if (s.elementType === "wall") {
            const defaultH = parseFloat(String(s.calculatorInputs?.height ?? "1")) || 1;
            inputs.segmentHeights = segLengths.map(() => ({ startH: defaultH, endH: defaultH }));
          }
          return { ...s, points: outline, closed: true, calculatorInputs: inputs };
        });
        setShapes(migrated);
        historyRef.current = [];
        setHistory([]);
      }
      if (d.projectSettings) setProjectSettings({ ...DEFAULT_PROJECT_SETTINGS, ...d.projectSettings });
      if (d.pan) setPan(d.pan);
      if (typeof d.zoom === "number" && d.zoom >= MIN_ZOOM && d.zoom <= MAX_ZOOM) setZoom(d.zoom);
      if (d.activeLayer === 1 || d.activeLayer === 2 || d.activeLayer === 3 || d.activeLayer === 4 || d.activeLayer === 5) setActiveLayer(d.activeLayer);
      else if ((d as { activeLayer?: number }).activeLayer === 0) setActiveLayer(1);
      if (Array.isArray(d.linkedGroups)) setLinkedGroups(d.linkedGroups);
    }
    load();
  }, [urlPlanId]);

  // Auto-open project card on new project (when canvas loads with empty project)
  useEffect(() => {
    if (!initialLoadDone || hasShownInitialProjectCardRef.current) return;
    if (!projectSettings.title?.trim()) {
      hasShownInitialProjectCardRef.current = true;
      setShowEquipmentPanel(true);
    }
  }, [initialLoadDone, projectSettings.title]);

  useEffect(() => {
    if (restoredFromDraftRef.current) return;
    setPan({ x: canvasSize.w / 2, y: canvasSize.h / 2 });
  }, []);

  // Auto-save: to plans (DB) if title set, else to localStorage (untitled draft)
  const doSavePlan = useCallback(async () => {
    const companyId = useAuthStore.getState().getCompanyId();
    if (!companyId || !projectSettings.title?.trim()) return;
    try {
      const payload: CanvasPayload = { shapes, projectSettings, pan, zoom, activeLayer, linkedGroups, savedAt: new Date().toISOString() };
      const id = await savePlan(supabase, {
        planId: currentPlanIdRef.current,
        companyId,
        userId: user?.id,
        title: projectSettings.title.trim(),
        payload,
      });
      currentPlanIdRef.current = id;
      planSavePendingRef.current = false;
      if (urlPlanId !== id) navigate(`/project-management/create-canvas/${id}`, { replace: true });
    } catch (e) {
      console.error("Plan save failed:", e);
      planSavePendingRef.current = false;
    }
  }, [shapes, projectSettings, pan, zoom, activeLayer, linkedGroups, user?.id, urlPlanId, navigate]);

  useEffect(() => {
    const title = projectSettings.title?.trim();
    if (title) {
      if (planSaveTimerRef.current) clearTimeout(planSaveTimerRef.current);
      planSaveTimerRef.current = setTimeout(() => {
        planSaveTimerRef.current = null;
        planSavePendingRef.current = true;
        doSavePlan();
      }, PLAN_SAVE_DEBOUNCE_MS);
      return () => {
        if (planSaveTimerRef.current) clearTimeout(planSaveTimerRef.current);
      };
    } else {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = setTimeout(() => {
        draftSaveTimerRef.current = null;
        try {
          const companyId = useAuthStore.getState().getCompanyId();
          const key = companyId ? `${DRAFT_STORAGE_KEY}_${companyId}` : DRAFT_STORAGE_KEY;
          const payload = { shapes, projectSettings, pan, zoom, activeLayer, linkedGroups, savedAt: new Date().toISOString() };
          localStorage.setItem(key, JSON.stringify(payload));
        } catch {
          // ignore
        }
      }, DRAFT_DEBOUNCE_MS);
      return () => {
        if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
      };
    }
  }, [shapes, projectSettings, pan, zoom, activeLayer, linkedGroups, projectSettings.title, doSavePlan]);

  // beforeunload: warn user if leaving with unsaved plan (debounce may not have fired yet)
  // Disabled in development to avoid HMR triggering the dialog repeatedly
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (projectSettings.title?.trim() && (shapes.length > 0 || planSavePendingRef.current)) {
        e.preventDefault();
        (e as { returnValue?: string }).returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [projectSettings.title, shapes.length]);

  useEffect(() => {
    const d = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftHeld(true); if (e.key === "Control") setCtrlHeld(true); };
    const u = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftHeld(false); if (e.key === "Control") setCtrlHeld(false); };
    window.addEventListener("keydown", d); window.addEventListener("keyup", u);
    return () => { window.removeEventListener("keydown", d); window.removeEventListener("keyup", u); };
  }, []);

  useEffect(() => {
    if (!modeDropdownOpen && !layersDropdownOpen && !shapesDropdownOpen && !pathDropdownOpen && !linearDropdownOpen && !groundworkDropdownOpen && !stairsDropdownOpen) return;
    const getTarget = (e: MouseEvent | TouchEvent): Node | null => {
      if (e instanceof TouchEvent && e.changedTouches?.[0]) {
        const t = e.changedTouches[0];
        return document.elementFromPoint(t.clientX, t.clientY);
      }
      return e.target as Node;
    };
    const onOutside = (e: MouseEvent | TouchEvent) => {
      const target = getTarget(e);
      if (!target) return;
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(target)) setModeDropdownOpen(false);
      if (layersDropdownRef.current && !layersDropdownRef.current.contains(target)) setLayersDropdownOpen(false);
      if (shapesDropdownRef.current && !shapesDropdownRef.current.contains(target)) setShapesDropdownOpen(false);
      if (pathDropdownRef.current && !pathDropdownRef.current.contains(target)) setPathDropdownOpen(false);
      if (linearDropdownRef.current && !linearDropdownRef.current.contains(target)) setLinearDropdownOpen(false);
      if (groundworkDropdownRef.current && !groundworkDropdownRef.current.contains(target)) setGroundworkDropdownOpen(false);
      if (stairsDropdownRef.current && !stairsDropdownRef.current.contains(target)) setStairsDropdownOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchend", onOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchend", onOutside);
    };
  }, [modeDropdownOpen, layersDropdownOpen, shapesDropdownOpen, pathDropdownOpen, linearDropdownOpen, groundworkDropdownOpen, stairsDropdownOpen]);

  useEffect(() => {
    if (projectSummaryContextMenu === null) return;
    const onClose = (e: MouseEvent) => {
      if (projectSummaryMenuRef.current && !projectSummaryMenuRef.current.contains(e.target as Node)) setProjectSummaryContextMenu(null);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onClose), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onClose); };
  }, [projectSummaryContextMenu]);

  // Clear display position when menus close
  useEffect(() => {
    if (!contextMenu) setContextMenuDisplayPos(null);
    if (!projectSummaryContextMenu) setProjectSummaryDisplayPos(null);
  }, [contextMenu, projectSummaryContextMenu]);

  // Adjust context menu position so it always fits on screen (open in available direction)
  useLayoutEffect(() => {
    if (contextMenu && contextMenuRef.current) {
      const rect = contextMenuRef.current.getBoundingClientRect();
      const adjusted = clampContextMenuPosition(contextMenu.x, contextMenu.y, rect.width, rect.height);
      setContextMenuDisplayPos(adjusted);
    }
    if (projectSummaryContextMenu && projectSummaryMenuRef.current) {
      const rect = projectSummaryMenuRef.current.getBoundingClientRect();
      const adjusted = clampContextMenuPosition(projectSummaryContextMenu.x, projectSummaryContextMenu.y, rect.width, rect.height);
      setProjectSummaryDisplayPos(adjusted);
    }
  }, [contextMenu, projectSummaryContextMenu]);

  // Recompute slab/cobblestone docinki when shape geometry changes (scale, move, etc.)
  useEffect(() => {
    let changed = false;
    const arrEqual = (a: string[] | undefined, b: string[]) => Array.isArray(a) && a.length === b.length && (a ?? []).every((v, i) => v === b[i]);
    const next = shapes.map((shape) => {
      // Paths: use outline polygon (converted or computed from center line)
      if (isPathElement(shape)) {
        const outline = getPathPolygon(shape);
        if (outline.length >= 3) {
          const pathShape = { ...shape, points: outline, closed: true } as Shape;
          const inputs = { ...shape.calculatorInputs };
          if ((shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && inputs?.vizSlabWidth) {
            const slabResult = inputs?.pathCenterline ? computePathSlabCuts(pathShape, inputs) : computeSlabCuts(pathShape, inputs);
            const { cutSlabCount, fullSlabCount, wasteSatisfiedPositions, wasteAreaCm2, reusedAreaCm2 } = slabResult;
            const cur = shape.calculatorInputs;
            if (
              !arrEqual(cur?.vizWasteSatisfied as string[] | undefined, wasteSatisfiedPositions ?? []) ||
              cur?.vizFullSlabCount !== fullSlabCount ||
              cur?.vizWasteAreaCm2 !== wasteAreaCm2 ||
              cur?.vizReusedAreaCm2 !== reusedAreaCm2
            ) {
              changed = true;
              return { ...shape, calculatorInputs: { ...shape.calculatorInputs, vizWasteSatisfied: wasteSatisfiedPositions ?? [], vizFullSlabCount: fullSlabCount, vizWasteAreaCm2: wasteAreaCm2, vizReusedAreaCm2: reusedAreaCm2, cutSlabs: String(cutSlabCount) } };
            }
          } else if (shape.calculatorType === "paving" && (inputs?.blockWidthCm || inputs?.blockLengthCm)) {
            const { fullBlockCount, cutBlockCount, wasteSatisfiedPositions, wasteAreaCm2, reusedAreaCm2 } = computeCobblestoneCuts(pathShape, inputs);
            const cur = shape.calculatorInputs;
            if (
              !arrEqual(cur?.vizWasteSatisfied as string[] | undefined, wasteSatisfiedPositions ?? []) ||
              cur?.vizFullBlockCount !== fullBlockCount ||
              cur?.vizWasteAreaCm2 !== wasteAreaCm2 ||
              cur?.vizReusedAreaCm2 !== reusedAreaCm2
            ) {
              changed = true;
              return { ...shape, calculatorInputs: { ...shape.calculatorInputs, vizWasteSatisfied: wasteSatisfiedPositions ?? [], vizFullBlockCount: fullBlockCount, cutBlocks: String(cutBlockCount), vizWasteAreaCm2: wasteAreaCm2, vizReusedAreaCm2: reusedAreaCm2 } };
            }
          }
        }
      }
      if (!isPathElement(shape) && (shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && shape.calculatorInputs?.vizSlabWidth && shape.closed && shape.points.length >= 3) {
        const inputs = { ...shape.calculatorInputs };
        const { cutSlabCount, fullSlabCount, wasteSatisfiedPositions, wasteAreaCm2, reusedAreaCm2 } = computeSlabCuts(shape, inputs);
        const cur = shape.calculatorInputs;
        if (
          !arrEqual(cur?.vizWasteSatisfied as string[] | undefined, wasteSatisfiedPositions ?? []) ||
          cur?.vizFullSlabCount !== fullSlabCount ||
          cur?.vizWasteAreaCm2 !== wasteAreaCm2 ||
          cur?.vizReusedAreaCm2 !== reusedAreaCm2
        ) {
          changed = true;
          return { ...shape, calculatorInputs: { ...shape.calculatorInputs, vizWasteSatisfied: wasteSatisfiedPositions ?? [], vizFullSlabCount: fullSlabCount, vizWasteAreaCm2: wasteAreaCm2, vizReusedAreaCm2: reusedAreaCm2, cutSlabs: String(cutSlabCount) } };
        }
      }
      if (!isPathElement(shape) && shape.calculatorType === "paving" && shape.closed && shape.points.length >= 3 && (shape.calculatorInputs?.blockWidthCm || shape.calculatorInputs?.blockLengthCm)) {
        const inputs = { ...shape.calculatorInputs };
        const { fullBlockCount, cutBlockCount, wasteSatisfiedPositions, wasteAreaCm2, reusedAreaCm2 } = computeCobblestoneCuts(shape, inputs);
        const cur = shape.calculatorInputs;
        if (
          !arrEqual(cur?.vizWasteSatisfied as string[] | undefined, wasteSatisfiedPositions ?? []) ||
          cur?.vizFullBlockCount !== fullBlockCount ||
          cur?.vizWasteAreaCm2 !== wasteAreaCm2 ||
          cur?.vizReusedAreaCm2 !== reusedAreaCm2
        ) {
          changed = true;
          return { ...shape, calculatorInputs: { ...shape.calculatorInputs, vizWasteSatisfied: wasteSatisfiedPositions ?? [], vizFullBlockCount: fullBlockCount, cutBlocks: String(cutBlockCount), vizWasteAreaCm2: wasteAreaCm2, vizReusedAreaCm2: reusedAreaCm2 } };
        }
      }
      return shape;
    });
    if (changed) setShapes(next);
  }, [shapes]);

  // ── Canvas Drawing ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvasSize.w, H = canvasSize.h;
    canvas.width = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    const _polyCache = new Map<number, Point[]>();
    const getCachedPoly = (si: number): Point[] => {
      if (_polyCache.has(si)) return _polyCache.get(si)!;
      const poly = getEffectivePolygon(shapes[si]);
      _polyCache.set(si, poly);
      return poly;
    };

    ctx.fillStyle = CC.bg;
    ctx.fillRect(0, 0, W, H);

    if (pointOffsetAlongLinePick && !isExportingRef.current) {
      ctx.save();
      ctx.font = "600 13px system-ui,sans-serif";
      ctx.fillStyle = "#27ae60";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(t("project:offset_along_line_pick_hint"), W / 2, 10);
      ctx.restore();
    }

    // Grid
    const gridPx = GRID_SPACING * PIXELS_PER_METER * zoom;
    if (gridPx > 8) {
      ctx.lineWidth = 1;
      for (let x = pan.x % gridPx; x < W; x += gridPx) {
        const wx = (x - pan.x) / zoom;
        ctx.strokeStyle = Math.abs(Math.round(wx / PIXELS_PER_METER) * PIXELS_PER_METER - wx) < 1 ? CC.gridMajor : CC.grid;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = pan.y % gridPx; y < H; y += gridPx) {
        const wy = (y - pan.y) / zoom;
        ctx.strokeStyle = Math.abs(Math.round(wy / PIXELS_PER_METER) * PIXELS_PER_METER - wy) < 1 ? CC.gridMajor : CC.grid;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    }

    // Origin (hidden during PDF export)
    if (!isExportingRef.current) {
      const o = worldToScreen(0, 0);
      ctx.strokeStyle = CC.textDim; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(o.x, 0); ctx.lineTo(o.x, H); ctx.moveTo(0, o.y); ctx.lineTo(W, o.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Effective mouse with shift: paths use soft snap (any angle), others use strict 45/90
    const eMouseRaw = (() => {
      if (!shiftHeld || drawingShapeIdx === null || !shapes[drawingShapeIdx]) return mouseWorld;
      const pts = shapes[drawingShapeIdx].points;
      const s = shapes[drawingShapeIdx];
      if (pts.length === 0) return mouseWorld;
      return isPathElement(s) ? snapTo45Soft(pts[pts.length - 1], mouseWorld) : snapTo45(pts[pts.length - 1], mouseWorld);
    })();

    // Smart guides: free polygon = only current chain; fence/wall/kerb/foundation/path = L1+L2 vertices + edge snap (outside) on closed refs
    const SMART_GUIDE_SNAP_PX = 8;
    const smartGuides: { axis: "x" | "y"; worldValue: number; ptIdx: number }[] = [];
    let eMouse = { ...eMouseRaw };
    if (drawingShapeIdx !== null && shapes[drawingShapeIdx]) {
      const drawPts = shapes[drawingShapeIdx].points;
      const ds = shapes[drawingShapeIdx];
      if (drawPts.length > 0) {
        if (isLinearElement(ds) || isPathElement(ds)) {
          eMouse = snapWorldPointForLinearDrawing(eMouseRaw, {
            drawingShapeIdx,
            shapes,
            localPtChain: drawPts,
            drawingShape: ds,
            zoom,
            viewFilter,
            activeLayer,
          });
        } else {
          const sgThreshold = SMART_GUIDE_SNAP_PX / zoom;
          let bestDx = sgThreshold, bestDy = sgThreshold;
          let snapXVal: number | null = null, snapYVal: number | null = null;
          let snapXIdx = -1, snapYIdx = -1;
          for (let i = 0; i < drawPts.length; i++) {
            const dx = Math.abs(eMouseRaw.x - drawPts[i].x);
            const dy = Math.abs(eMouseRaw.y - drawPts[i].y);
            if (dx < bestDx) { bestDx = dx; snapXVal = drawPts[i].x; snapXIdx = i; }
            if (dy < bestDy) { bestDy = dy; snapYVal = drawPts[i].y; snapYIdx = i; }
          }
          if (snapXVal !== null) { eMouse.x = snapXVal; smartGuides.push({ axis: "x", worldValue: snapXVal, ptIdx: snapXIdx }); }
          if (snapYVal !== null) { eMouse.y = snapYVal; smartGuides.push({ axis: "y", worldValue: snapYVal, ptIdx: snapYIdx }); }
        }
        if (isLinearElement(ds) || isPathElement(ds)) {
          const sgThreshold = SMART_GUIDE_SNAP_PX / zoom;
          for (let i = 0; i < drawPts.length; i++) {
            if (Math.abs(eMouse.x - drawPts[i].x) < sgThreshold) smartGuides.push({ axis: "x", worldValue: drawPts[i].x, ptIdx: i });
            if (Math.abs(eMouse.y - drawPts[i].y) < sgThreshold) smartGuides.push({ axis: "y", worldValue: drawPts[i].y, ptIdx: i });
          }
        }
      }
    }

    // Alignment guides for point drag: snap to aligned X/Y of any point on canvas
    const DRAG_GUIDE_SNAP_PX = 10;
    const dragAlignGuides: { axis: "x" | "y"; worldValue: number; shapeIdx: number; ptIdx: number }[] = [];
    if (dragInfo) {
      const draggedPt = shapes[dragInfo.shapeIdx]?.points[dragInfo.pointIdx];
      if (draggedPt) {
        const threshold = DRAG_GUIDE_SNAP_PX / zoom;
        let bestDx = threshold, bestDy = threshold;
        let snapXVal: number | null = null, snapYVal: number | null = null;
        let snapXSi = -1, snapYSi = -1, snapXPi = -1, snapYPi = -1;
        for (let si = 0; si < shapes.length; si++) {
          const pts = shapes[si].points;
          for (let pi = 0; pi < pts.length; pi++) {
            if (si === dragInfo.shapeIdx && pi === dragInfo.pointIdx) continue;
            const pt = pts[pi];
            const dx = Math.abs(draggedPt.x - pt.x);
            const dy = Math.abs(draggedPt.y - pt.y);
            if (dx < bestDx) { bestDx = dx; snapXVal = pt.x; snapXSi = si; snapXPi = pi; }
            if (dy < bestDy) { bestDy = dy; snapYVal = pt.y; snapYSi = si; snapYPi = pi; }
          }
        }
        if (snapXVal !== null) dragAlignGuides.push({ axis: "x", worldValue: snapXVal, shapeIdx: snapXSi, ptIdx: snapXPi });
        if (snapYVal !== null) dragAlignGuides.push({ axis: "y", worldValue: snapYVal, shapeIdx: snapYSi, ptIdx: snapYPi });
      }
    }

    // Collinear (180°) guide: dragged vertex aligns with extension of the line through two neighbors on the boundary
    const dragCollinearGuides: CollinearSnapHit[] = [];
    if (dragInfo) {
      const ds = shapes[dragInfo.shapeIdx];
      const dpts = ds?.points;
      const dpi = dragInfo.pointIdx;
      if (ds && dpts && dpts.length >= 3) {
        const draggedPt = dpts[dpi];
        const colHit = bestCollinearVertexSnap(draggedPt, ds.closed, dpts, dpi, DRAG_GUIDE_SNAP_PX / zoom);
        if (colHit) dragCollinearGuides.push(colHit);
      }
    }

    // ── Draw inactive layer shapes first (dimmed) ─────────
    shapes.forEach((shape, si) => {
      if (activeLayer === 1 || activeLayer === 2) {
        if (shape.layer === activeLayer) return;
      }
      // Foundation visible only in Layer 4; hide in L2 (main loop) and L3 (here)
      if (shape.elementType === "foundation" && (activeLayer === 3 || activeLayer === 4)) return;
      // Groundwork linear visible only on Layer 4; hide on Layer 3
      if (isGroundworkLinear(shape) && activeLayer === 3) return;
      const pts = shape.points;
      if (pts.length < 1) return;

      if (isLinearElement(shape)) {
        drawLinearElementInactive(ctx, shape, worldToScreen, zoom);
        return;
      }

      if (isPathElement(shape) && shape.closed) {
        const outline = getPathPolygon(shape);
        if (outline.length >= 3) {
          ctx.beginPath();
          const s0 = worldToScreen(outline[0].x, outline[0].y);
          ctx.moveTo(s0.x, s0.y);
          for (let i = 1; i < outline.length; i++) {
            const s = worldToScreen(outline[i].x, outline[i].y);
            ctx.lineTo(s.x, s.y);
          }
          ctx.closePath();
          ctx.fillStyle = CC.layer2Dim;
          ctx.fill();
        }
        return;
      }

      if (shape.closed && pts.length >= 3) {
        const hasArcsInactive = !!(shape.edgeArcs?.some(a => a && a.length > 0));
        ctx.beginPath();
        if (hasArcsInactive) {
          drawSmoothPolygonPath(ctx, getCachedPoly(si), (wx, wy) => worldToScreen(wx, wy));
        } else {
          const s0 = worldToScreen(pts[0].x, pts[0].y);
          ctx.moveTo(s0.x, s0.y);
          const ec = pts.length;
          for (let i = 0; i < ec; i++) {
            const j = (i + 1) % pts.length;
            const s = worldToScreen(pts[j].x, pts[j].y);
            ctx.lineTo(s.x, s.y);
          }
        }
        ctx.closePath();
        ctx.fillStyle = shape.layer === 2 ? CC.layer2Dim : CC.inactiveShape;
        ctx.fill();
      }

      const edgeCount = shape.closed ? pts.length : pts.length - 1;
      const hasArcsInactiveStroke = !!(shape.edgeArcs?.some(a => a && a.length > 0));
      if (hasArcsInactiveStroke) {
        ctx.strokeStyle = CC.inactiveEdge;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        drawSmoothPolygonPath(ctx, getCachedPoly(si), (wx, wy) => worldToScreen(wx, wy));
        ctx.stroke();
      } else {
        for (let i = 0; i < edgeCount; i++) {
          const j = (i + 1) % pts.length;
          const sa = worldToScreen(pts[i].x, pts[i].y);
          const sb = worldToScreen(pts[j].x, pts[j].y);
          ctx.strokeStyle = CC.inactiveEdge;
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
        }
      }

      if (activeLayer === 2 && shape.layer === 1 && shape.closed && pts.length >= 3) {
        const edgeLabelOffset = 28;
        for (let i = 0; i < edgeCount; i++) {
          const j = (i + 1) % pts.length;
          const sa = worldToScreen(pts[i].x, pts[i].y);
          const sb = worldToScreen(pts[j].x, pts[j].y);
          const mid = midpoint(sa, sb);
          const norm = edgeNormalAngle(sa, sb);
          const arcs = shape.edgeArcs?.[i];
          const len = calcEdgeLengthWithArcs(pts[i], pts[j], arcs);
          const edgeAngle = Math.atan2(sb.y - sa.y, sb.x - sa.x);
          const textAngle = readableTextAngle(edgeAngle);
          if (!arcs?.length) {
            const out = edgeOutwardRadForL1Edge(shapes, si, i);
            if (out != null) {
              drawExteriorAlignedDimension(
                ctx,
                sa,
                sb,
                out,
                boundaryDimL1ExteriorOffsetScreenPx(zoom),
                formatLength(len),
                GARDEN_EXTERIOR_DIM_LINE_COLOR,
                GARDEN_EXTERIOR_DIM_TEXT_COLOR
              );
              continue;
            }
          }
          const lx = mid.x - Math.cos(norm) * edgeLabelOffset;
          const ly = mid.y - Math.sin(norm) * edgeLabelOffset;
          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(textAngle);
          ctx.font = "12px 'JetBrains Mono','Fira Code',monospace";
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(formatLength(len), 0, 0);
          ctx.restore();
        }
      }

      if (shape.closed && pts.length >= 3) {
        const hasPatternLabel = shape.layer === 2 && (
          ((shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && shape.calculatorInputs?.vizSlabWidth) ||
          (shape.calculatorType === "paving" && shape.calculatorInputs) ||
          (shape.calculatorType === "grass" && (shape.calculatorInputs?.vizPieces?.length ?? 0) > 0)
        );
        if (!hasPatternLabel) {
          const effPts = getCachedPoly(si);
          const area = areaM2(effPts);
          const anchor = labelAnchorInsidePolygon(shape.points);
          const sc = worldToScreen(anchor.x, anchor.y);
          ctx.font = "bold 14px 'JetBrains Mono',monospace";
          ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(area.toFixed(2) + " m²", sc.x, sc.y);
        }
      }
    });

    // ── Layer 3: draw patterns on top of grey Layer 2 shapes (hidden in geodesy mode) ──
    if (activeLayer === 3 && !geodesyEnabled) {
      shapes.forEach((shape, si) => {
        if (!passesViewFilter(shape, viewFilter, activeLayer)) return;
        if (shape.layer !== 2) return;
        if (isPathElement(shape)) {
          if (!shape.closed) return;
          const outline = getPathPolygon(shape);
          if (outline.length < 3) return;
          const pathShape = { ...shape, points: outline, closed: true } as Shape;
          const isSel = si === selectedShapeIdx;
          let pathSlabDrawn = false;
          ctx.beginPath();
          const s0 = worldToScreen(outline[0].x, outline[0].y);
          ctx.moveTo(s0.x, s0.y);
          for (let i = 1; i < outline.length; i++) {
            const s = worldToScreen(outline[i].x, outline[i].y);
            ctx.lineTo(s.x, s.y);
          }
          ctx.closePath();
          ctx.fillStyle = isSel ? "rgba(108,92,231,0.15)" : CC.layer2Dim;
          ctx.fill();
          if ((shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && shape.calculatorInputs?.vizSlabWidth) {
            const pathOffsetBySegOverride = (patternDragInfo?.shapeIdx === si && patternDragInfo?.isPath && pathPatternLongOffsetPreview != null)
              ? { [pathPatternLongOffsetPreview.segmentIdx]: pathPatternLongOffsetPreview.value }
              : undefined;
            pathSlabDrawn = drawPathSlabPattern(ctx, pathShape, worldToScreen, zoom, true, !isSel, pathOffsetBySegOverride);
            if (!pathSlabDrawn) {
              drawSlabPattern(ctx, pathShape, worldToScreen, zoom, true, undefined, undefined, !isSel);
            }
            if (shape.calculatorInputs?.framePieceWidthCm) {
              drawSlabFrame(ctx, pathShape, worldToScreen, zoom);
            }
          } else if (shape.calculatorType === "paving" && shape.calculatorInputs) {
            if (shape.calculatorInputs?.addFrameToMonoblock && shape.calculatorInputs?.framePieceWidthCm) {
              drawMonoblockFrame(ctx, pathShape, worldToScreen, zoom);
            }
            const pathOffsetOverride = (patternDragInfo?.shapeIdx === si && patternDragInfo?.isPath && pathPatternLongOffsetPreview != null && pathPatternLongOffsetPreview.segmentIdx === 0)
              ? pathPatternLongOffsetPreview.value
              : undefined;
            drawCobblestonePattern(ctx, pathShape, worldToScreen, zoom, true, undefined, undefined, !isSel, pathOffsetOverride);
          }
          ctx.strokeStyle = isSel ? "rgba(108,92,231,0.8)" : CC.layer2Edge;
          ctx.lineWidth = isSel ? 2.5 : 1.8;
          ctx.beginPath();
          const s0stroke = worldToScreen(outline[0].x, outline[0].y);
          ctx.moveTo(s0stroke.x, s0stroke.y);
          for (let i = 1; i < outline.length; i++) {
            const s = worldToScreen(outline[i].x, outline[i].y);
            ctx.lineTo(s.x, s.y);
          }
          ctx.closePath();
          ctx.stroke();
          if ((shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && shape.calculatorInputs?.vizSlabWidth && pathSlabDrawn) {
            drawPathSlabLabel(ctx, pathShape, worldToScreen, zoom);
          }
          return;
        }
        if (!shape.closed || shape.points.length < 3) return;
        const isSel = si === selectedShapeIdx;
        const slabOffset = patternDragInfo?.shapeIdx === si && patternDragInfo?.type === "slab" ? (patternDragPreview ?? patternDragInfo.startOffset) : undefined;
        const cobbleOffset = patternDragInfo?.shapeIdx === si && patternDragInfo?.type === "cobblestone" ? (patternDragPreview ?? patternDragInfo.startOffset) : undefined;
        const slabDir = patternRotateInfo?.shapeIdx === si && patternRotateInfo?.type === "slab" ? (patternRotatePreview ?? patternRotateInfo.startDirectionDeg) : undefined;
        const cobbleDir = patternRotateInfo?.shapeIdx === si && patternRotateInfo?.type === "cobblestone" ? (patternRotatePreview ?? patternRotateInfo.startDirectionDeg) : undefined;
        const grassDir = patternRotateInfo?.shapeIdx === si && patternRotateInfo?.type === "grass" ? (patternRotatePreview ?? patternRotateInfo.startDirectionDeg) : undefined;
        if (shape.calculatorType === "deck" && shape.calculatorInputs?.boardLength) {
          drawDeckPattern(ctx, shape, worldToScreen, zoom, !isSel);
        }
        if ((shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && shape.calculatorInputs?.vizSlabWidth) {
          drawSlabPattern(ctx, shape, worldToScreen, zoom, true, slabOffset, slabDir, !isSel);
          if (shape.calculatorInputs?.framePieceWidthCm) {
            drawSlabFrame(ctx, shape, worldToScreen, zoom);
          }
        }
        if (shape.calculatorType === "paving" && shape.closed) {
          if (shape.calculatorInputs?.addFrameToMonoblock && shape.calculatorInputs?.framePieceWidthCm) {
            drawMonoblockFrame(ctx, shape, worldToScreen, zoom);
          }
          drawCobblestonePattern(ctx, shape, worldToScreen, zoom, true, cobbleOffset, cobbleDir, !isSel);
        }
        if (shape.calculatorType === "grass") {
          if (shape.calculatorInputs?.framePieceWidthCm) {
            drawSlabFrame(ctx, shape, worldToScreen, zoom);
          }
          if ((shape.calculatorInputs?.vizPieces?.length ?? 0) > 0) {
            drawGrassPieces(ctx, shape, worldToScreen, zoom, isSel, grassScaleInfo, si, isExportingRef.current, grassDir);
          }
        }
      });
      if (patternDragInfo && patternAlignedEdges.length > 0) {
        const si = patternDragInfo.shapeIdx;
        const shape = shapes[si];
        if (shape?.closed && shape.points.length >= 3) {
          const pts = getPolygonForPatternSnapOutline(shape);
          if (pts && pts.length >= 3) {
          const alignedSet = new Set(patternAlignedEdges);
          ctx.strokeStyle = "#27ae60";
          ctx.lineWidth = 3;
          for (const ei of patternAlignedEdges) {
            if (ei < 0 || ei >= pts.length) continue;
            const j = (ei + 1) % pts.length;
            const pA = pts[ei], pB = pts[j];
            if (!pA || !pB) continue;
            const sa = worldToScreen(pA.x, pA.y);
            const sb = worldToScreen(pB.x, pB.y);
            ctx.beginPath();
            ctx.moveTo(sa.x, sa.y);
            ctx.lineTo(sb.x, sb.y);
            ctx.stroke();
          }
          for (const vi of pts.keys()) {
            const prev = (vi - 1 + pts.length) % pts.length;
            if (alignedSet.has(prev) && alignedSet.has(vi)) {
              const p = pts[vi];
              if (p) {
                const sp = worldToScreen(p.x, p.y);
                ctx.fillStyle = "#27ae60";
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
          }
        }
      }
      if (draggingGrassPiece && grassAlignedPolyEdges.length > 0) {
        const si = draggingGrassPiece.shapeIdx;
        const shape = shapes[si];
        if (shape?.closed && shape.points.length >= 3) {
          const pts = shape.points;
          const alignedSet = new Set(grassAlignedPolyEdges);
          ctx.strokeStyle = "#27ae60";
          ctx.lineWidth = 3;
          for (const ei of grassAlignedPolyEdges) {
            const j = (ei + 1) % pts.length;
            const sa = worldToScreen(pts[ei].x, pts[ei].y);
            const sb = worldToScreen(pts[j].x, pts[j].y);
            ctx.beginPath();
            ctx.moveTo(sa.x, sa.y);
            ctx.lineTo(sb.x, sb.y);
            ctx.stroke();
          }
          for (const vi of pts.keys()) {
            const prev = (vi - 1 + pts.length) % pts.length;
            if (alignedSet.has(prev) && alignedSet.has(vi)) {
              const sp = worldToScreen(pts[vi].x, pts[vi].y);
              ctx.fillStyle = "#27ae60";
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      shapes.forEach((shape, si) => {
        if (!passesViewFilter(shape, viewFilter, activeLayer)) return;
        if (shape.layer !== 2 || !shape.closed || shape.points.length < 3) return;
        if (selectedPattern?.shapeIdx !== si || (selectedPattern?.type !== "slab" && selectedPattern?.type !== "cobblestone" && selectedPattern?.type !== "grass")) return;
        if (selectedPattern?.type === "grass" && (shape.calculatorInputs?.vizPieces?.length ?? 0) === 0) return;
        if (patternDragInfo?.shapeIdx === si || patternRotateInfo?.shapeIdx === si) return;
        const pts = shape.points;
        let minY = Infinity;
        pts.forEach((p: Point) => { const sp = worldToScreen(p.x, p.y); if (sp.y < minY) minY = sp.y; });
        const ctr = centroid(pts);
        const sc = worldToScreen(ctr.x, ctr.y);
        const handleY = minY - 35;
        ctx.strokeStyle = CC.accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(sc.x, minY - 5);
        ctx.lineTo(sc.x, handleY + 8);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(sc.x, handleY, 8, 0, Math.PI * 2);
        ctx.fillStyle = CC.button;
        ctx.fill();
        ctx.strokeStyle = CC.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    // ── Layer 4: Preparation — excavation breakdown on L2 elements ──
    const PREPARATION_CALC_TYPES = ["slab", "paving", "grass", "turf", "foundation"];
    if (activeLayer === 4) {
      shapes.forEach((shape) => {
        if (shape.layer !== 2) return;
        if (!PREPARATION_CALC_TYPES.includes(shape.calculatorType ?? "")) return;
        drawExcavationLayers(ctx, shape, worldToScreen);
      });
      // Groundwork linear elements drawn on top of excavation
      shapes.forEach((shape, si) => {
        if (shape.layer !== 2 || !isGroundworkLinear(shape)) return;
        if (!passesViewFilter(shape, viewFilter, activeLayer)) return;
        const pts = shape.points;
        if (pts.length < 1) return;
        if (pts.length >= 2) {
          drawLinearElement(ctx, shape, worldToScreen, zoom, si === selectedShapeIdx, false, undefined);
        }
        pts.forEach((p, pi) => {
          const sp = worldToScreen(p.x, p.y);
          const isFirstOnly = si === drawingShapeIdx && pts.length === 1 && pi === 0;
          const r = isFirstOnly ? POINT_RADIUS + 2 : POINT_RADIUS * 0.8;
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
          ctx.fillStyle = CC.layer2Edge; ctx.fill();
          ctx.strokeStyle = CC.point; ctx.lineWidth = 2; ctx.stroke();
          if (isFirstOnly) {
            const animT = (Date.now() % 1500) / 1500;
            const pulse = r + 4 + Math.sin(animT * Math.PI * 2) * 3;
            ctx.beginPath(); ctx.arc(sp.x, sp.y, pulse, 0, Math.PI * 2);
            ctx.strokeStyle = CC.open; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
            ctx.font = "10px 'JetBrains Mono',monospace";
            ctx.fillStyle = CC.open; ctx.textAlign = "center";
            ctx.fillText(t("project:canvas_click_second_point"), sp.x, sp.y - 20);
          }
        });
        if (si === drawingShapeIdx && pts.length > 0) {
          const last = pts[pts.length - 1];
          const sl = worldToScreen(last.x, last.y);
          const sm = worldToScreen(eMouse.x, eMouse.y);
          ctx.strokeStyle = CC.open; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(sl.x, sl.y); ctx.lineTo(sm.x, sm.y); ctx.stroke();
          ctx.setLineDash([]);
        }
        if (pts.length >= 2) drawShapeObjectLabel(ctx, shape, worldToScreen, shape.label || groundworkLabel(shape), zoom);
      });
    }

    // ── Draw active layer shapes ──────────────────────────
    const showGeodesy = geodesyEnabled;
    // Geodesy only for layer 1 when viewing layer 1; for layer 2 when viewing 2/3/5
    const geodesyLayerFilter = (s: Shape) => {
      if (s.layer === 1) return activeLayer === 1;
      return activeLayer === 2 || activeLayer === 3 || activeLayer === 5;
    };
    const geodesyGlobalRange = showGeodesy ? computeGlobalHeightRange(shapes, s =>
      geodesyLayerFilter(s) && (!(activeLayer === 3 || activeLayer === 5) ? s.layer === activeLayer : (s.layer === 1 || s.layer === 2))
    ) : undefined;

    shapes.forEach((shape, si) => {
      if (!passesViewFilter(shape, viewFilter, activeLayer)) return;
      if (activeLayer === 5) { if (shape.layer !== 1 && shape.layer !== 2) return; }
      else if (activeLayer === 3) { if (shape.layer !== 2) return; }
      else if (shape.layer !== activeLayer) return;
      // Foundation visible only in Layer 4, hidden in Layer 2
      if (activeLayer === 2 && shape.elementType === "foundation") return;
      const pts = shape.points;
      if (pts.length < 1) return;
      const isSel = si === selectedShapeIdx;
      const isDraw = si === drawingShapeIdx;
      const isOpen = !shape.closed;
      const isL2 = shape.layer === 2;
      const edgeColor = isOpen ? CC.open : isL2 ? CC.layer2Edge : CC.edge;
      const edgeHovColor = isOpen ? CC.openHover : isL2 ? CC.layer2 : CC.edgeHover;

      if (isPathElement(shape)) {
        const pts = (shape.calculatorInputs?.pathIsOutline && shape.calculatorInputs?.pathCenterlineOriginal) ? (shape.calculatorInputs.pathCenterlineOriginal as Point[]) : (shape.calculatorInputs?.pathIsOutline && shape.calculatorInputs?.pathCenterline ? (shape.calculatorInputs.pathCenterline as Point[]) : shape.points);
        const outline = getPathPolygon(shape);
        const pointsToShow = (shape.calculatorInputs?.pathIsOutline && shape.closed && outline.length >= 3) ? outline : pts;
        const inSegmentSideSelection = pathSegmentSideSelection && pathSegmentSideSelection.shapeIdx === si;
        if (inSegmentSideSelection) {
          const pathWidthM = Number(shape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6;
          const fullPx = toPixels(pathWidthM);
          const animT = (Date.now() % 1200) / 1200;
          const dashOffset = animT * 12;
          const selSides = pathSegmentSideSelection!.segmentSides;
          for (let i = 0; i < pts.length - 1; i++) {
            const A = pts[i];
            const B = pts[i + 1];
            const dx = B.x - A.x, dy = B.y - A.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = len > 0.001 ? -dy / len : 0, ny = len > 0.001 ? dx / len : 0;
            const left0 = { x: A.x + nx * fullPx, y: A.y + ny * fullPx }, left1 = { x: B.x + nx * fullPx, y: B.y + ny * fullPx };
            const right0 = { x: A.x - nx * fullPx, y: A.y - ny * fullPx }, right1 = { x: B.x - nx * fullPx, y: B.y - ny * fullPx };
            const sA = worldToScreen(A.x, A.y), sB = worldToScreen(B.x, B.y);
            const sL0 = worldToScreen(left0.x, left0.y), sL1 = worldToScreen(left1.x, left1.y);
            const sR0 = worldToScreen(right0.x, right0.y), sR1 = worldToScreen(right1.x, right1.y);
            const chosen = selSides[i];
            if (chosen !== null) {
              // Segment already chosen: draw filled preview on chosen side
              const isLeft = chosen === "left";
              const fillColor = isLeft ? "rgba(39,174,96,0.35)" : "rgba(230,126,34,0.35)";
              const strokeColor = isLeft ? "#27ae60" : "#e67e22";
              const o0 = isLeft ? sL0 : sR0;
              const o1 = isLeft ? sL1 : sR1;
              ctx.beginPath();
              ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y);
              ctx.lineTo(o1.x, o1.y); ctx.lineTo(o0.x, o0.y);
              ctx.closePath();
              ctx.fillStyle = fillColor;
              ctx.fill();
              ctx.setLineDash([]);
              ctx.strokeStyle = strokeColor; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(o0.x, o0.y); ctx.lineTo(o1.x, o1.y); ctx.stroke();
              // Centerline
              ctx.strokeStyle = CC.open; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke();
            } else {
              // Not yet chosen: show animated green/orange indicator lines
              ctx.setLineDash([8, 6]);
              ctx.lineWidth = 2;
              ctx.strokeStyle = "#27ae60";
              ctx.beginPath(); ctx.moveTo(sL0.x, sL0.y); ctx.lineTo(sL1.x, sL1.y);
              ctx.lineDashOffset = -dashOffset; ctx.stroke();
              ctx.strokeStyle = "#e67e22";
              ctx.beginPath(); ctx.moveTo(sR0.x, sR0.y); ctx.lineTo(sR1.x, sR1.y);
              ctx.lineDashOffset = dashOffset; ctx.stroke();
              ctx.setLineDash([]);
              ctx.strokeStyle = CC.open; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke();
              const midLeft = midpoint(sL0, sL1), midRight = midpoint(sR0, sR1);
              ctx.font = "10px 'JetBrains Mono',monospace";
              const edgeAngle = Math.atan2(B.y - A.y, B.x - A.x);
              const textAngle = readableTextAngle(edgeAngle);
              const drawRotatedLabel = (text: string, cx: number, cy: number, offset: number, color: string) => {
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(textAngle);
                ctx.fillStyle = color;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(text, 0, offset);
                ctx.restore();
              };
              drawRotatedLabel(t("project:path_click_side"), midLeft.x, midLeft.y, -12, "#27ae60");
              drawRotatedLabel(t("project:path_click_side"), midRight.x, midRight.y, 12, "#e67e22");
            }
          }
          ctx.setLineDash([]); ctx.lineDashOffset = 0;
        } else {
          // During drawing: show thin centerline only (not full width). Full outline only when closed.
          if (!shape.closed && pts.length >= 2) {
            ctx.strokeStyle = CC.open;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]);
            for (let i = 0; i < pts.length - 1; i++) {
              const sA = worldToScreen(pts[i].x, pts[i].y);
              const sB = worldToScreen(pts[i + 1].x, pts[i + 1].y);
              ctx.beginPath();
              ctx.moveTo(sA.x, sA.y);
              ctx.lineTo(sB.x, sB.y);
              ctx.stroke();
            }
          } else if (shape.closed && outline.length >= 3) {
            ctx.beginPath();
            const s0 = worldToScreen(outline[0].x, outline[0].y);
            ctx.moveTo(s0.x, s0.y);
            for (let i = 1; i < outline.length; i++) {
              const s = worldToScreen(outline[i].x, outline[i].y);
              ctx.lineTo(s.x, s.y);
            }
            ctx.closePath();
            if (activeLayer !== 3) {
              ctx.fillStyle = isSel ? "rgba(108,92,231,0.15)" : CC.layer2Dim;
              ctx.fill();
            }
            if (activeLayer !== 3) {
              ctx.strokeStyle = isSel ? edgeHovColor : edgeColor;
              ctx.lineWidth = isSel ? 2.5 : 1.8;
              ctx.beginPath();
              const s0path = worldToScreen(outline[0].x, outline[0].y);
              ctx.moveTo(s0path.x, s0path.y);
              for (let i = 1; i < outline.length; i++) {
                const s = worldToScreen(outline[i].x, outline[i].y);
                ctx.lineTo(s.x, s.y);
              }
              ctx.closePath();
              ctx.stroke();
            }
          }
        }
        pointsToShow.forEach((p, pi) => {
          const sp = worldToScreen(p.x, p.y);
          const isH = hoveredPoint && hoveredPoint.shapeIdx === si && hoveredPoint.pointIdx === pi;
          const isD = dragInfo && dragInfo.shapeIdx === si && dragInfo.pointIdx === pi;
          const r = (isH || isD ? POINT_RADIUS + 2 : POINT_RADIUS) * (isSel || isDraw ? 1 : 0.8);
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isH || isD ? CC.layer2 : CC.layer2Edge; ctx.fill();
          ctx.strokeStyle = CC.point; ctx.lineWidth = 2; ctx.stroke();
        });
        if ((isSel || showAllArcPoints || activeLayer === 1 || activeLayer === 2 || activeLayer === 3 || activeLayer === 5) && shape.edgeArcs && pts.length >= 2) {
          const linkedArcIdsForShape = new Set<string>();
          for (const g of linkedGroups) for (const p of g) { if (isArcEntry(p) && p.si === si && g.length >= 2) linkedArcIdsForShape.add(p.arcId); }
          for (let i = 0; i < pts.length - 1; i++) {
            const arcs = shape.edgeArcs[i];
            if (arcs && arcs.length > 0) {
              drawArcHandles(ctx, pts[i], pts[i + 1], arcs, (wx, wy) => worldToScreen(wx, wy), hoveredArcPoint?.arcPoint?.id ?? null, linkedArcIdsForShape);
            }
          }
        }
        if (isDraw && pts.length > 0 && !inSegmentSideSelection) {
          const last = pts[pts.length - 1];
          const sl = worldToScreen(last.x, last.y);
          const sm = worldToScreen(eMouse.x, eMouse.y);
          ctx.strokeStyle = CC.open; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(sl.x, sl.y); ctx.lineTo(sm.x, sm.y); ctx.stroke();
          ctx.setLineDash([]);
        }
        if (isL2 && !inSegmentSideSelection) drawShapeObjectLabel(ctx, shape, worldToScreen, getPathLabel(shape), zoom);
        return;
      }

      if (isLinearElement(shape)) {
        drawLinearElement(ctx, shape, worldToScreen, zoom, isSel, hoveredEdge?.shapeIdx === si, isL2 ? (pi: number) => isPointLinked(si, pi) : undefined);
        if (shape.elementType === "fence" && shape.calculatorResults) {
          drawFencePostMarkers(ctx, shape, worldToScreen, zoom);
        }
        if (showGeodesy && geodesyLayerFilter(shape) && shape.elementType === "wall" && (shape.heights?.some((h: number) => Math.abs(h) > 0.0001))) {
          drawWallSlopeIndicators(ctx, shape, worldToScreen);
        }
        pts.forEach((p, pi) => {
          const sp = worldToScreen(p.x, p.y);
          const isH = hoveredPoint && hoveredPoint.shapeIdx === si && hoveredPoint.pointIdx === pi;
          const isD = dragInfo && dragInfo.shapeIdx === si && dragInfo.pointIdx === pi;
          const r = (isH || isD ? POINT_RADIUS + 2 : POINT_RADIUS) * (isSel || isDraw ? 1 : 0.8);
          const fc = CC.layer2Edge;
          const hc = CC.layer2;
          if (isH || isD) {
            ctx.beginPath(); ctx.arc(sp.x, sp.y, r + 5, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(108,92,231,0.4)"; ctx.fill();
          }
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isH || isD ? hc : fc; ctx.fill();
          ctx.strokeStyle = CC.point; ctx.lineWidth = 2; ctx.stroke();
        });
        if ((isSel || showAllArcPoints || activeLayer === 1 || activeLayer === 2 || activeLayer === 3 || activeLayer === 5) && shape.edgeArcs) {
          const linkedArcIdsForShape = new Set<string>();
          for (const g of linkedGroups) for (const p of g) { if (isArcEntry(p) && p.si === si && g.length >= 2) linkedArcIdsForShape.add(p.arcId); }
          const leEdgeCount = pts.length - 1;
          for (let i = 0; i < leEdgeCount; i++) {
            const arcs = shape.edgeArcs[i];
            if (arcs && arcs.length > 0) {
              drawArcHandles(ctx, pts[i], pts[i + 1], arcs, (wx, wy) => worldToScreen(wx, wy), hoveredArcPoint?.arcPoint?.id ?? null, linkedArcIdsForShape);
            }
          }
        }
        if (isL2) drawShapeObjectLabel(ctx, shape, worldToScreen, shape.label || "Element", zoom);
        if (isDraw && pts.length > 0) {
          const last = pts[pts.length - 1];
          const sl = worldToScreen(last.x, last.y);
          const sm = worldToScreen(eMouse.x, eMouse.y);
          ctx.strokeStyle = CC.open; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(sl.x, sl.y); ctx.lineTo(sm.x, sm.y); ctx.stroke();
          ctx.setLineDash([]);
          for (const guide of smartGuides) {
            const gPt = pts[guide.ptIdx];
            const ext = 5000;
            if (guide.axis === "x") {
              const sA = worldToScreen(guide.worldValue, Math.min(gPt.y, eMouse.y) - ext);
              const sB = worldToScreen(guide.worldValue, Math.max(gPt.y, eMouse.y) + ext);
              ctx.strokeStyle = "#27ae60"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
              ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke(); ctx.setLineDash([]);
            } else {
              const sA = worldToScreen(Math.min(gPt.x, eMouse.x) - ext, guide.worldValue);
              const sB = worldToScreen(Math.max(gPt.x, eMouse.x) + ext, guide.worldValue);
              ctx.strokeStyle = "#27ae60"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
              ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke(); ctx.setLineDash([]);
            }
            const sp = worldToScreen(gPt.x, gPt.y);
            ctx.fillStyle = "#27ae60";
            ctx.beginPath(); ctx.moveTo(sp.x, sp.y - 5); ctx.lineTo(sp.x + 5, sp.y); ctx.lineTo(sp.x, sp.y + 5); ctx.lineTo(sp.x - 5, sp.y); ctx.closePath(); ctx.fill();
            const distM = distance(gPt, eMouse);
            const lm = midpoint(worldToScreen(gPt.x, gPt.y), worldToScreen(eMouse.x, eMouse.y));
            ctx.font = "11px 'JetBrains Mono',monospace";
            ctx.fillStyle = "#27ae60"; ctx.textAlign = "center";
            ctx.fillText(formatLength(distM), lm.x, lm.y - 6);
          }
          const liveLen = distance(last, eMouse);
          const lm = midpoint(sl, sm);
          ctx.font = "12px 'JetBrains Mono',monospace";
          ctx.fillStyle = CC.text; ctx.textAlign = "center";
          ctx.fillText(formatLength(liveLen), lm.x, lm.y - 12);
        }
        return;
      }

      if (shape.closed && pts.length >= 3) {
        const hasArcs = !!(shape.edgeArcs?.some(a => a && a.length > 0));
        ctx.beginPath();
        if (hasArcs) {
          drawSmoothPolygonPath(ctx, getCachedPoly(si), (wx, wy) => worldToScreen(wx, wy));
        } else {
          const s0 = worldToScreen(pts[0].x, pts[0].y);
          ctx.moveTo(s0.x, s0.y);
          const ec = pts.length;
          for (let i = 0; i < ec; i++) {
            const j = (i + 1) % pts.length;
            const s = worldToScreen(pts[j].x, pts[j].y);
            ctx.lineTo(s.x, s.y);
          }
        }
        ctx.closePath();
        if (activeLayer !== 3) {
          if (showGeodesy && geodesyLayerFilter(shape)) {
            fillShapeHeightHeatmap(ctx, shape, worldToScreen, geodesyGlobalRange);
          } else {
            ctx.fillStyle = isSel ? (isL2 ? "rgba(108,92,231,0.15)" : CC.selectedFill) : (isL2 ? CC.layer2Dim : CC.shapeFill);
            ctx.fill();
          }
        }
        // Patterns drawn only in Pattern layer (block at L697); Elements shows shapes without patterns
      }

      const vizAlignedEdges = (shape.calculatorInputs?.vizAlignedEdges as number[] | undefined) ?? [];
      const edgeCount = shape.closed ? pts.length : pts.length - 1;
      const hasArcsForStroke = !!(shape.edgeArcs?.some(a => a && a.length > 0));
      if (activeLayer !== 3) {
      if (hasArcsForStroke) {
        const { points: effPts, edgeIndices } = getEffectivePolygonWithEdgeIndices(shape);
        drawSmoothPolygonStroke(ctx, effPts, edgeIndices, (wx, wy) => worldToScreen(wx, wy), (edgeIdx) => {
          const isHov = hoveredEdge && hoveredEdge.shapeIdx === si && hoveredEdge.edgeIdx === edgeIdx;
          const isLockedEdge = shape.lockedEdges.some(e => e.idx === edgeIdx);
          const isAlignedEdge = isSel && vizAlignedEdges.includes(edgeIdx);
          return {
            strokeStyle: isAlignedEdge ? "#27ae60" : (isLockedEdge ? CC.locked : isHov ? edgeHovColor : edgeColor),
            lineWidth: isAlignedEdge ? 3 : (isSel ? 2.5 : 1.8),
          };
        });
      }
      for (let i = 0; i < edgeCount; i++) {
        const j = (i + 1) % pts.length;
        const sa = worldToScreen(pts[i].x, pts[i].y);
        const sb = worldToScreen(pts[j].x, pts[j].y);
        const sm = midpoint(sa, sb);
        const isHov = hoveredEdge && hoveredEdge.shapeIdx === si && hoveredEdge.edgeIdx === i;
        const isLockedEdge = shape.lockedEdges.some(e => e.idx === i);
        const isAlignedEdge = isSel && vizAlignedEdges.includes(i);

        ctx.strokeStyle = isAlignedEdge ? "#27ae60" : (isLockedEdge ? CC.locked : isHov ? edgeHovColor : edgeColor);
        ctx.lineWidth = isAlignedEdge ? 3 : (isSel ? 2.5 : 1.8);

        const arcs = shape.edgeArcs?.[i];
        if (!hasArcsForStroke && arcs && arcs.length > 0) {
          const prev = pts[(i - 1 + pts.length) % pts.length];
          const next = pts[(j + 1) % pts.length];
          ctx.beginPath();
          ctx.moveTo(sa.x, sa.y);
          drawCurvedEdge(ctx, pts[i], pts[j], arcs, (wx, wy) => worldToScreen(wx, wy), prev, next);
          ctx.stroke();
        } else if (!hasArcsForStroke && isL2 && (isPointLinked(si, i) || isPointLinked(si, j))) {
          if (isPointLinked(si, i)) drawAlternatingLinkedHalf(ctx, sa.x, sa.y, sm.x, sm.y);
          else { ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sm.x, sm.y); ctx.stroke(); }
          if (isPointLinked(si, j)) drawAlternatingLinkedHalf(ctx, sm.x, sm.y, sb.x, sb.y);
          else { ctx.beginPath(); ctx.moveTo(sm.x, sm.y); ctx.lineTo(sb.x, sb.y); ctx.stroke(); }
        } else if (!hasArcsForStroke) {
          ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
        }

        // Lock icon on locked edge
        if (isLockedEdge && isSel) {
          const emid = midpoint(sa, sb);
          ctx.font = "10px 'JetBrains Mono',monospace";
          ctx.fillStyle = CC.locked; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("🔒", emid.x, emid.y - 14);
        }

        const len = calcEdgeLengthWithArcs(pts[i], pts[j], arcs);
        const mid = midpoint(sa, sb);
        const norm = edgeNormalAngle(sa, sb);
        const edgeAngle = Math.atan2(sb.y - sa.y, sb.x - sa.x);
        const textAngle = readableTextAngle(edgeAngle);
        const edgeLabelOffset = 28;
        const slopeLabelOffset = 42;
        const hideDimInAdjustment = activeLayer === 5 && shape.layer === 1;
        const showEdgeLabel = !hideDimInAdjustment && !(editingDim && editingDim.shapeIdx === si && editingDim.edgeIdx === i);
        const isL1StraightGardenDim =
          !isL2 && shape.layer === 1 && shape.closed && !(arcs && arcs.length > 0);
        if (showEdgeLabel && isL1StraightGardenDim) {
          const out = edgeOutwardRadForL1Edge(shapes, si, i);
          if (out != null) {
            const lineC = isLockedEdge ? CC.locked : isHov ? "#ffffff" : GARDEN_EXTERIOR_DIM_LINE_COLOR;
            const textC = isLockedEdge ? CC.locked : isHov ? "#ffffff" : GARDEN_EXTERIOR_DIM_TEXT_COLOR;
            drawExteriorAlignedDimension(ctx, sa, sb, out, boundaryDimL1ExteriorOffsetScreenPx(zoom), formatLength(len), lineC, textC);
          } else {
            const lx = mid.x - Math.cos(norm) * edgeLabelOffset;
            const ly = mid.y - Math.sin(norm) * edgeLabelOffset;
            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(textAngle);
            ctx.font = "12px 'JetBrains Mono','Fira Code',monospace";
            ctx.fillStyle = isLockedEdge ? CC.locked : isHov ? edgeHovColor : CC.text;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(formatLength(len), 0, 0);
            ctx.restore();
          }
        } else if (showEdgeLabel) {
          let lx: number, ly: number;
          if (isL2 && shape.closed) {
            const effPts = hasArcsForStroke ? getEffectivePolygon(shape) : pts;
            const ctr = effPts.length >= 3 ? labelAnchorInsidePolygon(effPts) : midpoint(pts[0], pts[1] ?? pts[0]);
            const edgeMidWorld = midpoint(pts[i], pts[j]);
            const frac = 0.92;
            const labelWorld = { x: ctr.x + frac * (edgeMidWorld.x - ctr.x), y: ctr.y + frac * (edgeMidWorld.y - ctr.y) };
            const sl = worldToScreen(labelWorld.x, labelWorld.y);
            lx = sl.x;
            ly = sl.y;
          } else {
            lx = mid.x - Math.cos(norm) * edgeLabelOffset;
            ly = mid.y - Math.sin(norm) * edgeLabelOffset;
          }
          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(textAngle);
          ctx.font = "12px 'JetBrains Mono','Fira Code',monospace";
          ctx.fillStyle = isL2 ? "#ffffff" : (isLockedEdge ? CC.locked : isHov ? edgeHovColor : CC.text);
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(formatLength(len), 0, 0);
          ctx.restore();
        }

        // Slope label in geodesy mode — arrow along edge, pointing downhill (high → low)
        // Slopes outside element, lengths inside (opposite sides to avoid overlap)
        if (!hideDimInAdjustment && showGeodesy && geodesyLayerFilter(shape) && shape.closed) {
          const slopes = calcEdgeSlopes(shape);
          const sl = slopes.find(s => s.edgeIdx === i);
          if (sl && sl.direction !== "flat") {
            const arrowLen = 12;
            const dx = sl.direction === "down" ? sb.x - sa.x : sa.x - sb.x;
            const dy = sl.direction === "down" ? sb.y - sa.y : sa.y - sb.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const ax = mid.x + ux * arrowLen;
            const ay = mid.y + uy * arrowLen;
            ctx.strokeStyle = slopeColor(sl.severity);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(mid.x, mid.y);
            ctx.lineTo(ax, ay);
            ctx.stroke();
            const headLen = 5;
            ctx.beginPath();
            ctx.moveTo(ax + Math.cos(Math.atan2(uy, ux) + Math.PI * 0.8) * headLen, ay + Math.sin(Math.atan2(uy, ux) + Math.PI * 0.8) * headLen);
            ctx.lineTo(ax, ay);
            ctx.lineTo(ax + Math.cos(Math.atan2(uy, ux) - Math.PI * 0.8) * headLen, ay + Math.sin(Math.atan2(uy, ux) - Math.PI * 0.8) * headLen);
            ctx.stroke();
            const stx = mid.x + Math.cos(norm) * slopeLabelOffset;
            const sty = mid.y + Math.sin(norm) * slopeLabelOffset;
            ctx.save();
            ctx.translate(stx, sty);
            ctx.rotate(textAngle);
            ctx.font = "bold 20px 'JetBrains Mono',monospace";
            ctx.fillStyle = slopeColor(sl.severity);
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(formatSlope(sl), 0, 0);
            ctx.restore();
          } else if (sl) {
            const stx = mid.x + Math.cos(norm) * slopeLabelOffset;
            const sty = mid.y + Math.sin(norm) * slopeLabelOffset;
            ctx.save();
            ctx.translate(stx, sty);
            ctx.rotate(textAngle);
            ctx.font = "bold 20px 'JetBrains Mono',monospace";
            ctx.fillStyle = slopeColor(sl.severity);
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(formatSlope(sl), 0, 0);
            ctx.restore();
          }
        }
      }
      }

      // Arc point handles (when selected, showAllArcPoints, or in L1/L2/L5 — same visibility as square points)
      if ((isSel || showAllArcPoints || activeLayer === 1 || activeLayer === 2 || activeLayer === 3 || activeLayer === 5) && shape.edgeArcs && !showGeodesy) {
        const linkedArcIdsForShape = new Set<string>();
        for (const g of linkedGroups) for (const p of g) { if (isArcEntry(p) && p.si === si && g.length >= 2) linkedArcIdsForShape.add(p.arcId); }
        for (let i = 0; i < edgeCount; i++) {
          const arcs = shape.edgeArcs[i];
          if (arcs && arcs.length > 0) {
            const j = (i + 1) % pts.length;
            drawArcHandles(ctx, pts[i], pts[j], arcs, (wx, wy) => worldToScreen(wx, wy), hoveredArcPoint?.arcPoint?.id ?? null, linkedArcIdsForShape);
          }
        }
      }

      // Angles (interior, labels inside shape) — hidden in geodesy mode
      if (shape.closed && pts.length >= 3 && isSel && !showGeodesy) {
        for (let i = 0; i < pts.length; i++) {
          const prev = pts[(i - 1 + pts.length) % pts.length], curr = pts[i], next = pts[(i + 1) % pts.length];
          const angle = angleDeg(prev, curr, next);
          const sc = worldToScreen(curr.x, curr.y);
          const d1 = Math.atan2(prev.y - curr.y, prev.x - curr.x);
          const d2 = Math.atan2(next.y - curr.y, next.x - curr.x);

          const cross = (prev.x - curr.x) * (next.y - curr.y) - (prev.y - curr.y) * (next.x - curr.x);
          const ccw = cross > 0;

          ctx.beginPath(); ctx.moveTo(sc.x, sc.y); ctx.arc(sc.x, sc.y, 25, d1, d2, !ccw); ctx.closePath();
          ctx.fillStyle = CC.angleFill; ctx.fill();
          ctx.strokeStyle = CC.angleStroke; ctx.lineWidth = 1; ctx.stroke();

          const intDir = interiorAngleDir(pts, i);
          ctx.font = "11px 'JetBrains Mono',monospace";
          ctx.fillStyle = CC.angleText; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(angle.toFixed(1) + "°", sc.x + Math.cos(intDir) * 39, sc.y + Math.sin(intDir) * 39);
        }
      }

      // Points
      pts.forEach((p, pi) => {
        const sp = worldToScreen(p.x, p.y);
        const isH = hoveredPoint && hoveredPoint.shapeIdx === si && hoveredPoint.pointIdx === pi;
        const isD = dragInfo && dragInfo.shapeIdx === si && dragInfo.pointIdx === pi;
        const r = (isH || isD ? POINT_RADIUS + 2 : POINT_RADIUS) * (isSel || isDraw ? 1 : 0.8);
        const fc = isOpen ? CC.open : isL2 ? CC.layer2Edge : CC.pointFill;
        const hc = isOpen ? CC.openHover : isL2 ? CC.layer2 : CC.pointHover;

        if (isH || isD) {
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r + 5, 0, Math.PI * 2);
          ctx.fillStyle = isOpen ? CC.openGlow : isL2 ? "rgba(108,92,231,0.4)" : CC.accentGlow; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isH || isD ? hc : fc; ctx.fill();
        ctx.strokeStyle = CC.point; ctx.lineWidth = 2; ctx.stroke();

        // Linked point indicator
        if (isPointLinked(si, pi)) {
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = CC.accent; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
        }
      });

      // Rotation handle
      if (isSel && shape.closed && pts.length >= 3 && !isDraw) {
        let minY = Infinity;
        pts.forEach(p => { const sp = worldToScreen(p.x, p.y); if (sp.y < minY) minY = sp.y; });
        const ctr = centroid(pts);
        const sc = worldToScreen(ctr.x, ctr.y);
        const handleY = minY - 35;
        const hColor = isL2 ? CC.layer2 : CC.accent;
        ctx.strokeStyle = hColor; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(sc.x, minY - 5); ctx.lineTo(sc.x, handleY + 8); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(sc.x, handleY, 8, 0, Math.PI * 2);
        ctx.fillStyle = rotateInfo ? hColor : CC.button; ctx.fill();
        ctx.strokeStyle = hColor; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(sc.x, handleY, 5, -Math.PI * 0.8, Math.PI * 0.3, false);
        ctx.strokeStyle = hColor; ctx.lineWidth = 1.5; ctx.stroke();
        const ax = sc.x + 5 * Math.cos(Math.PI * 0.3);
        const ay = handleY + 5 * Math.sin(Math.PI * 0.3);
        ctx.beginPath(); ctx.moveTo(ax - 3, ay - 4); ctx.lineTo(ax, ay); ctx.lineTo(ax + 4, ay - 2);
        ctx.strokeStyle = hColor; ctx.lineWidth = 1.5; ctx.stroke();
      }

      // Area
      if (shape.closed && pts.length >= 3) {
        const anchor = labelAnchorInsidePolygon(shape.points);
        const sc = worldToScreen(anchor.x, anchor.y);
        const hasPatternLabel = isL2 && (
          ((shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && shape.calculatorInputs?.vizSlabWidth) ||
          (shape.calculatorType === "paving" && shape.calculatorInputs) ||
          (shape.calculatorType === "grass" && (shape.calculatorInputs?.vizPieces?.length ?? 0) > 0)
        );
        if (!hasPatternLabel) {
          const effPts = getCachedPoly(si);
          const area = areaM2(effPts);
          ctx.font = "bold 16px 'JetBrains Mono',monospace";
          ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(area.toFixed(2) + " m²", sc.x, sc.y);
        }

        if (isL2 && shape.calculatorType === "deck" && shape.calculatorResults?.materials) {
          const boards = shape.calculatorResults.materials.find((m: any) => (m.name || "").toLowerCase().includes("decking board"));
          const joists = shape.calculatorResults.materials.find((m: any) => (m.name || "").toLowerCase().includes("joist"));
          const frame = shape.calculatorResults.materials.find((m: any) => (m.name || "").toLowerCase().includes("frame"));
          const parts: string[] = [];
          if (boards) parts.push(`${boards.quantity ?? boards.amount ?? 0} boards`);
          if (joists) parts.push(`${joists.quantity ?? joists.amount ?? 0} joists`);
          if (frame) parts.push(`${frame.quantity ?? frame.amount ?? 0} frame`);
          if (parts.length > 0) {
            ctx.font = "bold 12px 'JetBrains Mono',monospace";
            ctx.fillStyle = "#ffffff";
            ctx.fillText(parts.join(" · "), sc.x, sc.y + 22);
          }
        }

        // Gradient arrow in geodesy mode — text placed opposite to arrow so it never overlaps
        if (showGeodesy && geodesyLayerFilter(shape)) {
          const grad = calcShapeGradient(shape);
          if (grad && grad.magnitude > 0.05) {
            const gradBaseY = sc.y + 58;
            const arrowLen = Math.min(36, 12 + grad.magnitude * 5);
            const ax = sc.x + Math.cos(grad.angle) * arrowLen;
            const ay = gradBaseY + Math.sin(grad.angle) * arrowLen;
            ctx.strokeStyle = slopeColor(grad.severity);
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(sc.x, gradBaseY); ctx.lineTo(ax, ay); ctx.stroke();
            const headLen = 7;
            const ha1 = grad.angle + Math.PI * 0.8;
            const ha2 = grad.angle - Math.PI * 0.8;
            ctx.beginPath();
            ctx.moveTo(ax + Math.cos(ha1) * headLen, ay + Math.sin(ha1) * headLen);
            ctx.lineTo(ax, ay);
            ctx.lineTo(ax + Math.cos(ha2) * headLen, ay + Math.sin(ha2) * headLen);
            ctx.stroke();
            const textOffset = 22;
            const tx = sc.x - Math.cos(grad.angle) * textOffset;
            const ty = gradBaseY - Math.sin(grad.angle) * textOffset;
            ctx.font = "bold 20px 'JetBrains Mono',monospace";
            ctx.fillStyle = slopeColor(grad.severity);
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(grad.magnitude.toFixed(1) + " cm/m", tx, ty);
          }
        }
      }

      if (isL2) drawShapeObjectLabel(ctx, shape, worldToScreen, shape.label || "Element", zoom);

      // Open shape label
      if (isOpen && pts.length >= 3) {
        const ctr = centroid(pts);
        const sc = worldToScreen(ctr.x, ctr.y);
        ctx.font = "12px 'JetBrains Mono',monospace";
        ctx.fillStyle = CC.open; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(t("project:canvas_unclosed_no_area"), sc.x, sc.y);
      }

      // Height labels (geodesy mode) — drawn via drawGeodesyLabels below (avoids overlap at junctions)
      // Vertex height labels skipped here when showGeodesy

      // Punkty wysokościowe (Layer 1) — widoczne tylko w layer 1
      if (shape.layer === 1 && activeLayer === 1 && (shape.heightPoints?.length ?? 0) > 0) {
        const hpList = shape.heightPoints!;
        const isGeodesy = showGeodesy;
        const r = (POINT_RADIUS * 0.9) * (isGeodesy ? 1 : 0.7);
        hpList.forEach((hp, hpi) => {
          const sp = worldToScreen(hp.x, hp.y);
          const isH = hoveredHeightPoint?.shapeIdx === si && hoveredHeightPoint?.heightPointIdx === hpi;
          const isEdit = editingGeodesyCard?.cardInfo?.group?.some(p => !p.isVertex && p.shapeIdx === si && p.heightPointIdx === hpi);
          ctx.beginPath();
          ctx.rect(sp.x - r, sp.y - r, r * 2, r * 2);
          ctx.fillStyle = isH || isEdit ? CC.geo : (isGeodesy ? CC.geo : CC.textDim);
          ctx.fill();
          ctx.strokeStyle = isH || isEdit ? "#fff" : CC.point;
          ctx.lineWidth = isH || isEdit ? 2 : 1;
          ctx.stroke();
          // Height label drawn via drawGeodesyLabels (avoids overlap at junctions)
        });
      }

      // Rubber band
      if (isDraw && pts.length > 0) {
        const last = pts[pts.length - 1];
        const sl = worldToScreen(last.x, last.y);
        const sm = worldToScreen(eMouse.x, eMouse.y);

        ctx.strokeStyle = CC.open; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(sl.x, sl.y); ctx.lineTo(sm.x, sm.y); ctx.stroke();
        ctx.setLineDash([]);

        // Smart guide lines
        for (const guide of smartGuides) {
          const gPt = pts[guide.ptIdx];
          const ext = 5000;
          if (guide.axis === "x") {
            const sA = worldToScreen(guide.worldValue, Math.min(gPt.y, eMouse.y) - ext);
            const sB = worldToScreen(guide.worldValue, Math.max(gPt.y, eMouse.y) + ext);
            ctx.strokeStyle = "#27ae60"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke();
            ctx.setLineDash([]);
          } else {
            const sA = worldToScreen(Math.min(gPt.x, eMouse.x) - ext, guide.worldValue);
            const sB = worldToScreen(Math.max(gPt.x, eMouse.x) + ext, guide.worldValue);
            ctx.strokeStyle = "#27ae60"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke();
            ctx.setLineDash([]);
          }
          const sp = worldToScreen(gPt.x, gPt.y);
          ctx.fillStyle = "#27ae60";
          ctx.beginPath();
          ctx.moveTo(sp.x, sp.y - 5); ctx.lineTo(sp.x + 5, sp.y);
          ctx.lineTo(sp.x, sp.y + 5); ctx.lineTo(sp.x - 5, sp.y);
          ctx.closePath(); ctx.fill();
          const snapPt = worldToScreen(eMouse.x, eMouse.y);
          ctx.beginPath();
          ctx.moveTo(snapPt.x, snapPt.y - 4); ctx.lineTo(snapPt.x + 4, snapPt.y);
          ctx.lineTo(snapPt.x, snapPt.y + 4); ctx.lineTo(snapPt.x - 4, snapPt.y);
          ctx.closePath(); ctx.fill();
          const distM = distance(gPt, eMouse);
          const lm = midpoint(sp, snapPt);
          ctx.font = "11px 'JetBrains Mono',monospace";
          ctx.fillStyle = "#27ae60"; ctx.textAlign = "center";
          ctx.fillText(formatLength(distM), lm.x, lm.y - 6);
        }

        if (shiftHeld) {
          const snapped = isPathElement(shapes[drawingShapeIdx]) ? snapTo45Soft(last, mouseWorld) : snapTo45(last, mouseWorld);
          const dir = { x: snapped.x - last.x, y: snapped.y - last.y };
          const dLen = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
          if (dLen > 1) {
            const nx = dir.x / dLen, ny = dir.y / dLen, ext = 5000;
            const sA = worldToScreen(last.x - nx * ext, last.y - ny * ext);
            const sB = worldToScreen(last.x + nx * ext, last.y + ny * ext);
            ctx.strokeStyle = CC.snapLine; ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
            ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        const liveLen = distance(last, eMouse);
        const lm = midpoint(sl, sm);
        ctx.font = "12px 'JetBrains Mono',monospace";
        ctx.fillStyle = CC.text; ctx.textAlign = "center";
        ctx.fillText(formatLength(liveLen), lm.x, lm.y - 12);

        if (pts.length >= 2) {
          const prev = pts[pts.length - 2];
          const angle = angleDeg(prev, last, eMouse);
          const sc = worldToScreen(last.x, last.y);
          ctx.font = "11px 'JetBrains Mono',monospace";
          ctx.fillStyle = CC.angleText; ctx.textAlign = "center";
          ctx.fillText(angle.toFixed(1) + "°", sc.x, sc.y - 20);
        }

        if (pts.length >= 3) {
          const ss = worldToScreen(pts[0].x, pts[0].y);
          if (distance(sm, ss) < SNAP_TO_START_RADIUS) {
            ctx.beginPath(); ctx.arc(ss.x, ss.y, 14, 0, Math.PI * 2);
            ctx.strokeStyle = CC.accent; ctx.lineWidth = 2; ctx.stroke();
            ctx.font = "10px 'JetBrains Mono',monospace";
            ctx.fillStyle = CC.accent; ctx.fillText("Close", ss.x, ss.y - 20);
          }
        }
      }
    });

    // Alignment guide lines when dragging a point (dashed line when aligned with another point)
    if (dragInfo && dragAlignGuides.length > 0) {
      const draggedPt = shapes[dragInfo.shapeIdx]?.points[dragInfo.pointIdx];
      if (draggedPt) {
        const ext = 5000;
        for (const guide of dragAlignGuides) {
          const gPt = shapes[guide.shapeIdx]?.points[guide.ptIdx];
          if (!gPt) continue;
          if (guide.axis === "x") {
            const sA = worldToScreen(guide.worldValue, Math.min(gPt.y, draggedPt.y) - ext);
            const sB = worldToScreen(guide.worldValue, Math.max(gPt.y, draggedPt.y) + ext);
            ctx.strokeStyle = "#27ae60"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke();
            ctx.setLineDash([]);
          } else {
            const sA = worldToScreen(Math.min(gPt.x, draggedPt.x) - ext, guide.worldValue);
            const sB = worldToScreen(Math.max(gPt.x, draggedPt.x) + ext, guide.worldValue);
            ctx.strokeStyle = "#27ae60"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke();
            ctx.setLineDash([]);
          }
          const distM = distance(gPt, draggedPt);
          const sg = worldToScreen(gPt.x, gPt.y);
          const sd = worldToScreen(draggedPt.x, draggedPt.y);
          const lm = midpoint(sg, sd);
          ctx.font = "11px 'JetBrains Mono',monospace";
          ctx.fillStyle = "#27ae60"; ctx.textAlign = "center";
          ctx.fillText(formatLength(distM), lm.x, lm.y - 6);
        }
      }
    }

    if (dragInfo && dragCollinearGuides.length > 0) {
      const ext = 5000;
      for (const hit of dragCollinearGuides) {
        const { lineA, lineB } = hit;
        const dx = lineB.x - lineA.x;
        const dy = lineB.y - lineA.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const midx = (lineA.x + lineB.x) * 0.5;
        const midy = (lineA.y + lineB.y) * 0.5;
        const sA = worldToScreen(midx - ux * ext, midy - uy * ext);
        const sB = worldToScreen(midx + ux * ext, midy + uy * ext);
        ctx.strokeStyle = "#27ae60";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(sA.x, sA.y);
        ctx.lineTo(sB.x, sB.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Geodesy labels with leader lines — avoids overlap when multiple points share position
    if (showGeodesy) {
      const geodesyFilter = (s: Shape) => {
        if (!geodesyLayerFilter(s)) return false;
        if (!passesViewFilter(s, viewFilter, activeLayer)) return false;
        if (activeLayer === 5) return s.layer === 1 || s.layer === 2;
        return s.layer === activeLayer;
      };
      drawGeodesyLabels(ctx, shapes, worldToScreen, geodesyFilter, hoveredPoint, hoveredHeightPoint, editingGeodesyCard?.cardInfo.group ?? null);
    }

    // ── Layer 5: Adjustment — empty areas (red), overflow (red), overlaps (orange) ──
    if (activeLayer === 5) {
      const drawPolygon = (pts: Point[]) => {
        if (pts.length < 3) return;
        const s0 = worldToScreen(pts[0].x, pts[0].y);
        ctx.moveTo(s0.x, s0.y);
        for (let i = 1; i < pts.length; i++) {
          const s = worldToScreen(pts[i].x, pts[i].y);
          ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
      };
      // Empty areas — red fill
      adjustmentData.emptyAreas.forEach(poly => {
        ctx.beginPath();
        drawPolygon(poly);
        ctx.fillStyle = CC.adjustmentEmpty;
        ctx.fill();
        ctx.strokeStyle = CC.adjustmentEmptyStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
      // Overflow — red fill + outline
      adjustmentData.overflowAreas.forEach(({ overflowPolygons }) => {
        overflowPolygons.forEach(poly => {
          ctx.beginPath();
          drawPolygon(poly);
          ctx.fillStyle = CC.adjustmentOverflow;
          ctx.fill();
          ctx.strokeStyle = CC.adjustmentOverflowStroke;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      });
      // Overlaps — dark orange
      adjustmentData.overlaps.forEach(({ overlapPolygon }) => {
        ctx.beginPath();
        drawPolygon(overlapPolygon);
        ctx.fillStyle = CC.adjustmentOverlap;
        ctx.fill();
        ctx.strokeStyle = CC.adjustmentOverlapStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

    // Selected points highlight
    selectedPoints.forEach(({ shapeIdx: si, pointIdx: pi }) => {
      if (shapes[si] && shapes[si].points[pi]) {
        const p = shapes[si].points[pi];
        const sp = worldToScreen(p.x, p.y);
        ctx.beginPath(); ctx.arc(sp.x, sp.y, POINT_RADIUS + 4, 0, Math.PI * 2);
        ctx.strokeStyle = CC.danger; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(sp.x, sp.y, POINT_RADIUS + 8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,71,87,0.15)"; ctx.fill();
      }
    });

    // Offset-along-line: anchors — orange halos; moving vertex — same size, full green glow
    if (pointOffsetAlongLinePick && !isExportingRef.current) {
      const pick = pointOffsetAlongLinePick;
      const phase = offsetAlongLinePickPulse * 0.09;
      const pulse = 0.88 + 0.12 * Math.sin(phase);
      const drawPickHalo = (sp: Point, isMove: boolean) => {
        const rCore = (POINT_RADIUS + 2) * pulse;
        const rGlow = rCore + 16;
        if (isMove) {
          const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, rGlow);
          g.addColorStop(0, "rgba(46,204,113,0.55)");
          g.addColorStop(0.4, "rgba(46,204,113,0.28)");
          g.addColorStop(0.75, "rgba(46,204,113,0.08)");
          g.addColorStop(1, "rgba(46,204,113,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, rGlow, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, rCore, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(46,204,113,0.88)";
          ctx.fill();
          ctx.strokeStyle = "rgba(39,174,96,0.95)";
          ctx.lineWidth = 1.35;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, rCore + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, rCore + 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          const nRay = 12;
          const inner = rCore * 0.35;
          const outer = rGlow + 6 + 5 * Math.sin(phase * 1.1);
          ctx.strokeStyle = "rgba(46,204,113,0.35)";
          ctx.lineWidth = 1;
          for (let i = 0; i < nRay; i++) {
            const ang = (i / nRay) * Math.PI * 2 + phase * 0.35;
            ctx.beginPath();
            ctx.moveTo(sp.x + Math.cos(ang) * inner, sp.y + Math.sin(ang) * inner);
            ctx.lineTo(sp.x + Math.cos(ang) * outer, sp.y + Math.sin(ang) * outer);
            ctx.stroke();
          }
          return;
        }
        const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, rGlow);
        g.addColorStop(0, "rgba(230,126,34,0.22)");
        g.addColorStop(0.45, "rgba(230,126,34,0.08)");
        g.addColorStop(1, "rgba(230,126,34,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rGlow, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(230,126,34,0.55)";
        ctx.lineWidth = 1.35;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rCore + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rCore + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        const nRay = 12;
        const inner = rCore * 0.35;
        const outer = rGlow + 6 + 5 * Math.sin(phase * 1.1);
        ctx.strokeStyle = "rgba(230,126,34,0.32)";
        ctx.lineWidth = 1;
        for (let i = 0; i < nRay; i++) {
          const ang = (i / nRay) * Math.PI * 2 + phase * 0.35;
          ctx.beginPath();
          ctx.moveTo(sp.x + Math.cos(ang) * inner, sp.y + Math.sin(ang) * inner);
          ctx.lineTo(sp.x + Math.cos(ang) * outer, sp.y + Math.sin(ang) * outer);
          ctx.stroke();
        }
      };
      for (let si = 0; si < shapes.length; si++) {
        if (!isOnActiveLayer(si) || !passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
        const pts = shapes[si].points;
        for (let pi = 0; pi < pts.length; pi++) {
          if (si === pick.moveShapeIdx && pi === pick.movePointIdx) continue;
          const sp = worldToScreen(pts[pi].x, pts[pi].y);
          drawPickHalo(sp, false);
        }
      }
      const mv = shapes[pick.moveShapeIdx]?.points[pick.movePointIdx];
      if (mv) drawPickHalo(worldToScreen(mv.x, mv.y), true);
    }

    // Selection rectangle
    if (selectionRect) {
      const x = Math.min(selectionRect.startX, selectionRect.endX);
      const y = Math.min(selectionRect.startY, selectionRect.endY);
      const w = Math.abs(selectionRect.endX - selectionRect.startX);
      const h = Math.abs(selectionRect.endY - selectionRect.startY);
      ctx.fillStyle = "rgba(255,71,87,0.08)"; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = CC.danger; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    }

    // HUD
    ctx.font = "11px 'JetBrains Mono',monospace";
    ctx.fillStyle = CC.textDim; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    let hud = `${toMeters(mouseWorld.x).toFixed(2)}, ${toMeters(mouseWorld.y).toFixed(2)} m  |  zoom: ${(zoom * 100).toFixed(0)}%  |  Layer ${activeLayer}`;
    if (shiftHeld) hud += "  |  SNAP 45°";
    if (drawingShapeIdx !== null && mode === "freeDraw") hud += "  |  Drawing (Esc = cancel)";
    if (mode === "drawFence") hud += "  |  FENCE: click to place points, Esc to finish";
    else if (mode === "drawWall") hud += "  |  WALL: click to place points, Esc to finish";
    else if (mode === "drawKerb") hud += "  |  KERB: click to place points, Esc to finish";
    else if (mode === "drawFoundation") hud += "  |  FOUNDATION: click to place points, Esc to finish";
    else if (mode === "drawPathSlabs") hud += pathSegmentSideSelection ? "  |  PATH: click green or orange side for each segment" : "  |  PATH (Slabs): click points (like wall), snap to start to finish, then pick sides";
    else if (mode === "drawPathConcreteSlabs") hud += pathSegmentSideSelection ? "  |  PATH: click green or orange side for each segment" : "  |  PATH (Concrete Slabs): click points (like wall), snap to start to finish, then pick sides";
    else if (mode === "drawPathMonoblock") hud += pathSegmentSideSelection ? "  |  PATH: click green or orange side for each segment" : "  |  PATH (Monoblock): click points (like wall), snap to start to finish, then pick sides";
    if (mode === "scale") hud += "  |  SCALE: corner = proportional, edge = move";
    if (mode === "move") hud += "  |  MOVE: left click anywhere to pan";
    const canStartMeasure = selectedShapeIdx === null && selectedPoints.length === 0 && !selectionRect && !editingDim && !rotateInfo && !patternDragInfo && !patternRotateInfo && !shapeDragInfo && !edgeDragInfo;
    const measureAllowed = activeLayer === 1 || activeLayer === 2 || activeLayer === 3 || activeLayer === 5;
    if (measureStart !== null) hud += "  |  MEASURE: click point 2; click again to clear";
    else if (shiftHeld && canStartMeasure && measureAllowed) hud += "  |  SHIFT + click to start measure";
    if (geodesyEnabled) hud += "  |  GEODESY: click point → set height, click area → show height";
    ctx.fillText(hud, 10, H - 10);

    // Height tooltip (geodesy mode): click on L1 shape interior — only show in layer 1
    if (geodesyEnabled && activeLayer === 1 && clickedHeightTooltip) {
      const sp = worldToScreen(clickedHeightTooltip.world.x, clickedHeightTooltip.world.y);
      const hCm = clickedHeightTooltip.height * 100;
      const text = (hCm >= 0 ? "+" : "") + hCm.toFixed(1) + " cm";
      ctx.font = "bold 14px 'JetBrains Mono',monospace";
      const m = ctx.measureText(text);
      const pad = 8;
      const boxW = m.width + pad * 2;
      const boxH = 22;
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillRect(sp.x - boxW / 2, sp.y - boxH - 12, boxW, boxH);
      ctx.fillStyle = CC.geo;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(text, sp.x, sp.y - 14);
    }

    // Measure (Shift-based): line + distance label
    if (measureStart) {
      const endPt = measureEnd ?? mouseWorld;
      const sA = worldToScreen(measureStart.x, measureStart.y);
      const sB = worldToScreen(endPt.x, endPt.y);
      const lenM = distance(measureStart, endPt);
      ctx.strokeStyle = CC.accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(sA.x, sA.y);
      ctx.lineTo(sB.x, sB.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const mid = midpoint(sA, sB);
      ctx.font = "bold 12px 'JetBrains Mono',monospace";
      ctx.fillStyle = CC.accent;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(toMeters(lenM).toFixed(3) + " m", mid.x, mid.y - 12);
    }

    // Edge hover: distance labels on line (A→cursor, cursor→B)
    if (hoveredEdge) {
      const s = shapes[hoveredEdge.shapeIdx];
      const pts = s?.points;
      if (pts && pts.length >= 2) {
        const i = hoveredEdge.edgeIdx;
        const j = (i + 1) % pts.length;
        const arcs = s.edgeArcs?.[i];
        const totalLen = calcEdgeLengthWithArcs(pts[i], pts[j], arcs);
        const distToA = hoveredEdge.t * totalLen;
        const distToB = (1 - hoveredEdge.t) * totalLen;
        const sA = worldToScreen(pts[i].x, pts[i].y);
        const sProj = worldToScreen(hoveredEdge.pos.x, hoveredEdge.pos.y);
        const sB = worldToScreen(pts[j].x, pts[j].y);
        const mid1 = midpoint(sA, sProj);
        const mid2 = midpoint(sProj, sB);
        const norm = edgeNormalAngle(sA, sB);
        const labelOffset = 18;
        const lx1 = mid1.x - Math.cos(norm) * labelOffset;
        const ly1 = mid1.y - Math.sin(norm) * labelOffset;
        const lx2 = mid2.x - Math.cos(norm) * labelOffset;
        const ly2 = mid2.y - Math.sin(norm) * labelOffset;
        const textAngle = readableTextAngle(Math.atan2(sB.y - sA.y, sB.x - sA.x));
        ctx.font = "bold 11px 'JetBrains Mono','Fira Code',monospace";
        ctx.fillStyle = GARDEN_EXTERIOR_DIM_TEXT_COLOR;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.translate(lx1, ly1);
        ctx.rotate(textAngle);
        ctx.fillText(formatLength(distToA), 0, 0);
        ctx.restore();
        ctx.save();
        ctx.translate(lx2, ly2);
        ctx.rotate(textAngle);
        ctx.fillText(formatLength(distToB), 0, 0);
        ctx.restore();
      }
    }

    // Set angle overlay: dim canvas, show only edited shape with A/B labels and angle arc
    if (setAngleModal) {
      const si = setAngleModal.shapeIdx, pi = setAngleModal.pointIdx;
      const shape = shapes[si];
      if (shape?.closed && shape.points.length >= 3 && pi >= 0 && pi < shape.points.length) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, W, H);
        const pts = shape.points;
        const n = pts.length;
        const prev = (pi - 1 + n) % n, next = (pi + 1) % n;
        const V = pts[pi], prevPt = pts[prev], nextPt = pts[next];
        const sV = worldToScreen(V.x, V.y);
        ctx.strokeStyle = CC.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        const s0 = worldToScreen(pts[0].x, pts[0].y);
        ctx.moveTo(s0.x, s0.y);
        for (let i = 1; i < pts.length; i++) {
          const s = worldToScreen(pts[i].x, pts[i].y);
          ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.stroke();
        const currentAngle = angleDeg(prevPt, V, nextPt);
        const intDir = interiorAngleDir(pts, pi);
        const arcR = 28;
        const startAngle = Math.atan2(prevPt.y - V.y, prevPt.x - V.x);
        const endAngle = Math.atan2(nextPt.y - V.y, nextPt.x - V.x);
        ctx.strokeStyle = CC.angleStroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sV.x, sV.y, arcR, startAngle, endAngle);
        ctx.stroke();
        ctx.font = "bold 12px 'JetBrains Mono',monospace";
        ctx.fillStyle = CC.angleText;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const labelX = sV.x + Math.cos(intDir) * (arcR + 14);
        const labelY = sV.y + Math.sin(intDir) * (arcR + 14);
        ctx.fillText(currentAngle.toFixed(1) + "°", labelX, labelY);
        const midA = midpoint(prevPt, V);
        const midB = midpoint(V, nextPt);
        const sA = worldToScreen(midA.x, midA.y);
        const sB = worldToScreen(midB.x, midB.y);
        const sPrev = worldToScreen(prevPt.x, prevPt.y);
        const sNext = worldToScreen(nextPt.x, nextPt.y);
        const LABEL_OFFSET_PX = 26;
        const perpA = { x: sV.y - sPrev.y, y: sPrev.x - sV.x };
        const lenA = Math.sqrt(perpA.x * perpA.x + perpA.y * perpA.y) || 1;
        const perpB = { x: sNext.y - sV.y, y: sV.x - sNext.x };
        const lenB = Math.sqrt(perpB.x * perpB.x + perpB.y * perpB.y) || 1;
        const offA = { x: sA.x + (perpA.x / lenA) * LABEL_OFFSET_PX, y: sA.y + (perpA.y / lenA) * LABEL_OFFSET_PX };
        const offB = { x: sB.x + (perpB.x / lenB) * LABEL_OFFSET_PX, y: sB.y + (perpB.y / lenB) * LABEL_OFFSET_PX };
        ctx.font = "bold 15px 'JetBrains Mono',monospace";
        ctx.fillStyle = "#fff";
        ctx.fillText(t("project:set_angle_side_a_label"), offA.x, offA.y);
        ctx.fillText(t("project:set_angle_side_b_label"), offB.x, offB.y);
      }
    }

    // Dimension edit overlay: dim canvas, show only the edited edge with Punkt A / Punkt B labels
    if (editingDim) {
      const si = editingDim.shapeIdx, ei = editingDim.edgeIdx;
      const shape = shapes[si];
      if (shape?.points.length >= 2) {
        const pts = shape.points;
        const j = (ei + 1) % pts.length;
        const A = pts[ei], B = pts[j];
        const sA = worldToScreen(A.x, A.y);
        const sB = worldToScreen(B.x, B.y);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = CC.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sA.x, sA.y);
        ctx.lineTo(sB.x, sB.y);
        ctx.stroke();
        const LABEL_OFFSET_PX = 24;
        const perpAx = sB.y - sA.y, perpAy = sA.x - sB.x;
        const lenA = Math.sqrt(perpAx * perpAx + perpAy * perpAy) || 1;
        const perpBx = sA.y - sB.y, perpBy = sB.x - sA.x;
        const lenB = Math.sqrt(perpBx * perpBx + perpBy * perpBy) || 1;
        const offAx = sA.x + (perpAx / lenA) * LABEL_OFFSET_PX, offAy = sA.y + (perpAy / lenA) * LABEL_OFFSET_PX;
        const offBx = sB.x + (perpBx / lenB) * LABEL_OFFSET_PX, offBy = sB.y + (perpBy / lenB) * LABEL_OFFSET_PX;
        ctx.font = "bold 15px 'JetBrains Mono',monospace";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t("project:dim_edit_point_a"), offAx, offAy);
        ctx.fillText(t("project:dim_edit_point_b"), offBx, offBy);
      }
    }
  }, [shapes, selectedShapeIdx, selectedPattern, patternDragInfo, patternDragPreview, pathPatternLongOffsetPreview, patternAlignedEdges, patternRotateInfo, patternRotatePreview, mode, drawingShapeIdx, mouseWorld, pan, zoom, canvasSize, hoveredPoint, hoveredEdge, hoveredHeightPoint, dragInfo, editingDim, editingGeodesyCard, worldToScreen, shiftHeld, selectedPoints, selectionRect, rotateInfo, activeLayer, draggingGrassPiece, grassAlignedPolyEdges, clickedHeightTooltip, geodesyEnabled, showAllArcPoints, linkedGroups, viewFilter, adjustmentData, t, setAngleModal, currentTheme?.id, measureStart, measureEnd, pathSegmentSideSelection, shapeDragInfo, edgeDragInfo, pointOffsetAlongLinePick, offsetAlongLinePickPulse, isOnActiveLayer]);

  // Clear height tooltip when disabling geodesy or switching away from layer 1
  useEffect(() => {
    if (!geodesyEnabled || activeLayer !== 1) setClickedHeightTooltip(null);
  }, [geodesyEnabled, activeLayer]);

  // Pulse animation
  useEffect(() => {
    if (shapes.some(s => !s.closed && s.layer === activeLayer) && drawingShapeIdx === null && mode === "select") {
      const id = setInterval(() => setMouseWorld(m => ({ ...m })), 50);
      return () => clearInterval(id);
    }
  }, [shapes, drawingShapeIdx, mode, activeLayer]);

  // ── Hit Tests (active layer only) ─────────────────────
  const hitTestPoint = useCallback((wp: Point): HitResult | null => {
    const th = pointRadiusEffective / zoom + 4;
    const r = th * (PIXELS_PER_METER / 80);
    if (selectedShapeIdx !== null && isOnActiveLayer(selectedShapeIdx) && passesViewFilter(shapes[selectedShapeIdx], viewFilter, activeLayer)) {
      const s = shapes[selectedShapeIdx];
      for (let pi = s.points.length - 1; pi >= 0; pi--)
        if (distance(wp, s.points[pi]) < r) return { shapeIdx: selectedShapeIdx, pointIdx: pi };
    }
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (!isOnActiveLayer(si) || !passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
      for (let pi = shapes[si].points.length - 1; pi >= 0; pi--)
        if (distance(wp, shapes[si].points[pi]) < r) return { shapeIdx: si, pointIdx: pi };
    }
    return null;
  }, [shapes, zoom, isOnActiveLayer, selectedShapeIdx, viewFilter, pointRadiusEffective]);

  const hitTestHeightPoint = useCallback((wp: Point): { shapeIdx: number; heightPointIdx: number } | null => {
    if (activeLayer !== 1) return null; // Layer 1 height points only hittable in layer 1
    const th = (pointRadiusEffective * 1.2) / zoom + 4;
    const r = th * (PIXELS_PER_METER / 80);
    if (selectedShapeIdx !== null && isOnActiveLayer(selectedShapeIdx)) {
      const shape = shapes[selectedShapeIdx];
      if (shape.layer === 1 && shape.heightPoints?.length) {
        for (let hpi = shape.heightPoints.length - 1; hpi >= 0; hpi--) {
          const hp = shape.heightPoints[hpi];
          if (distance(wp, { x: hp.x, y: hp.y }) < r) return { shapeIdx: selectedShapeIdx, heightPointIdx: hpi };
        }
      }
    }
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (!isOnActiveLayer(si)) continue;
      const shape = shapes[si];
      if (shape.layer !== 1 || !shape.heightPoints?.length) continue;
      for (let hpi = shape.heightPoints.length - 1; hpi >= 0; hpi--) {
        const hp = shape.heightPoints[hpi];
        if (distance(wp, { x: hp.x, y: hp.y }) < r) return { shapeIdx: si, heightPointIdx: hpi };
      }
    }
    return null;
  }, [shapes, zoom, isOnActiveLayer, selectedShapeIdx, pointRadiusEffective, activeLayer]);

  const hitTestEdge = useCallback((wp: Point): EdgeHitResult | null => {
    const th = edgeHitThresholdEffective / zoom + 2;
    const r = th * (PIXELS_PER_METER / 80);
    const testEdge = (si: number, i: number) => {
      const pts = shapes[si].points;
      const j = (i + 1) % pts.length;
      const arcs = shapes[si].edgeArcs?.[i];
      const pr = arcs && arcs.length > 0
        ? projectOntoArcEdge(wp, pts[i], pts[j], arcs, 24)
        : projectOntoSegment(wp, pts[i], pts[j]);
      if (pr.dist < r && pr.t > 0.02 && pr.t < 0.98)
        return { shapeIdx: si, edgeIdx: i, pos: pr.proj, t: pr.t };
      return null;
    };
    if (selectedShapeIdx !== null && isOnActiveLayer(selectedShapeIdx) && passesViewFilter(shapes[selectedShapeIdx], viewFilter, activeLayer)) {
      const ec = shapes[selectedShapeIdx].closed ? shapes[selectedShapeIdx].points.length : shapes[selectedShapeIdx].points.length - 1;
      for (let i = 0; i < ec; i++) {
        const result = testEdge(selectedShapeIdx, i);
        if (result) return result;
      }
    }
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (!isOnActiveLayer(si) || !passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
      const ec = shapes[si].closed ? shapes[si].points.length : shapes[si].points.length - 1;
      for (let i = 0; i < ec; i++) {
        const result = testEdge(si, i);
        if (result) return result;
      }
    }
    return null;
  }, [shapes, zoom, isOnActiveLayer, selectedShapeIdx, viewFilter, edgeHitThresholdEffective]);

  const hitTestPointForScale = useCallback((wp: Point): HitResult | null => {
    const th = pointRadiusEffective / zoom + 4;
    const r = th * (PIXELS_PER_METER / 80);
    if (selectedShapeIdx !== null && isOnActiveLayerForScale(selectedShapeIdx) && passesViewFilter(shapes[selectedShapeIdx], viewFilter, activeLayer)) {
      const s = shapes[selectedShapeIdx];
      if (s.closed && !isLinearElement(s)) {
        for (let pi = s.points.length - 1; pi >= 0; pi--)
          if (distance(wp, s.points[pi]) < r) return { shapeIdx: selectedShapeIdx, pointIdx: pi };
      }
    }
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (!isOnActiveLayerForScale(si) || !passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
      const s = shapes[si];
      if (!s.closed || isLinearElement(s)) continue;
      for (let pi = s.points.length - 1; pi >= 0; pi--)
        if (distance(wp, s.points[pi]) < r) return { shapeIdx: si, pointIdx: pi };
    }
    return null;
  }, [shapes, zoom, isOnActiveLayerForScale, selectedShapeIdx, viewFilter, pointRadiusEffective]);

  const hitTestEdgeForScale = useCallback((wp: Point): EdgeHitResult | null => {
    const th = edgeHitThresholdEffective / zoom + 2;
    const r = th * (PIXELS_PER_METER / 80);
    const testEdge = (si: number, i: number) => {
      const pts = shapes[si].points;
      const j = (i + 1) % pts.length;
      const arcs = shapes[si].edgeArcs?.[i];
      const pr = arcs && arcs.length > 0
        ? projectOntoArcEdge(wp, pts[i], pts[j], arcs, 24)
        : projectOntoSegment(wp, pts[i], pts[j]);
      if (pr.dist < r && pr.t > 0.02 && pr.t < 0.98)
        return { shapeIdx: si, edgeIdx: i, pos: pr.proj, t: pr.t };
      return null;
    };
    if (selectedShapeIdx !== null && isOnActiveLayerForScale(selectedShapeIdx) && passesViewFilter(shapes[selectedShapeIdx], viewFilter, activeLayer)) {
      const s = shapes[selectedShapeIdx];
      if (s.closed && !isLinearElement(s)) {
        for (let i = 0; i < s.points.length; i++) {
          const result = testEdge(selectedShapeIdx, i);
          if (result) return result;
        }
      }
    }
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (!isOnActiveLayerForScale(si) || !passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
      const s = shapes[si];
      if (!s.closed || isLinearElement(s)) continue;
      for (let i = 0; i < s.points.length; i++) {
        const result = testEdge(si, i);
        if (result) return result;
      }
    }
    return null;
  }, [shapes, zoom, isOnActiveLayerForScale, selectedShapeIdx, viewFilter]);

  const hitTestShape = useCallback((wp: Point): number | null => {
    if (selectedShapeIdx !== null && isOnActiveLayer(selectedShapeIdx) && passesViewFilter(shapes[selectedShapeIdx], viewFilter, activeLayer)) {
      const s = shapes[selectedShapeIdx];
      if (isPathElement(s) && hitTestPathElement(wp, s, zoom)) return selectedShapeIdx;
      if (!isLinearElement(s)) {
        const pts = s.points;
        if (s.closed && pts.length >= 3) {
          let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            if ((pts[i].y > wp.y) !== (pts[j].y > wp.y) && wp.x < ((pts[j].x - pts[i].x) * (wp.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x)
              inside = !inside;
          }
          if (inside) return selectedShapeIdx;
        }
      } else if (hitTestLinearElement(wp, s, zoom)) return selectedShapeIdx;
    }
    // Prefer linear elements and paths over polygons when both could match
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (!isOnActiveLayer(si) || !passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
      if (isPathElement(shapes[si]) && hitTestPathElement(wp, shapes[si], zoom)) return si;
      if (isLinearElement(shapes[si]) && hitTestLinearElement(wp, shapes[si], zoom)) return si;
    }
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (!isOnActiveLayer(si) || !passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
      if (isLinearElement(shapes[si]) || isPathElement(shapes[si])) continue;
      const pts = shapes[si].points;
      if (!shapes[si].closed || pts.length < 3) continue;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        if ((pts[i].y > wp.y) !== (pts[j].y > wp.y) && wp.x < ((pts[j].x - pts[i].x) * (wp.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x)
          inside = !inside;
      }
      if (inside) return si;
    }
    return null;
  }, [shapes, zoom, isOnActiveLayer, selectedShapeIdx, viewFilter]);

  const hitTestPattern = useCallback((wp: Point): { shapeIdx: number; type: "slab" | "grass" | "cobblestone"; grassJoinHit?: { pieceAIdx: number; pieceBIdx: number; edgeAIdx: number; isJoined: boolean }; grassPieceIdx?: number } | null => {
    for (let si = shapes.length - 1; si >= 0; si--) {
      const shape = shapes[si];
      if (shape.layer !== 2) continue;
      if (isPathElement(shape)) {
        if (!shape.closed || shape.points.length < 2) continue;
        if (!hitTestPathElement(wp, shape, zoom)) continue;
        if ((shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && shape.calculatorInputs?.vizSlabWidth) return { shapeIdx: si, type: "slab" };
        if (shape.calculatorType === "paving") return { shapeIdx: si, type: "cobblestone" };
        continue;
      }
      if (!shape.closed || shape.points.length < 3) continue;
      if (shape.calculatorType === "grass" && (shape.calculatorInputs?.vizPieces?.length ?? 0) > 0) {
        const joinHit = hitTestGrassJoinEdge(wp, shape, grassEdgeHitPxEffective / zoom);
        if (joinHit) return { shapeIdx: si, type: "grass", grassJoinHit: joinHit };
        const edgeHit = hitTestGrassPieceEdge(wp, shape, grassEdgeHitPxEffective / zoom);
        if (edgeHit) return { shapeIdx: si, type: "grass" };
        const pieceIdx = hitTestGrassPiece(wp, shape);
        if (pieceIdx !== null) return { shapeIdx: si, type: "grass", grassPieceIdx: pieceIdx };
      }
      let inside = false;
      const pts = shape.points;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        if ((pts[i].y > wp.y) !== (pts[j].y > wp.y) && wp.x < ((pts[j].x - pts[i].x) * (wp.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x)
          inside = !inside;
      }
      if (!inside) continue;
      if ((shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && shape.calculatorInputs?.vizSlabWidth) return { shapeIdx: si, type: "slab" };
      if (shape.calculatorType === "paving") return { shapeIdx: si, type: "cobblestone" };
    }
    return null;
  }, [shapes, zoom, viewFilter, grassEdgeHitPxEffective]);

  const hitTestOpenEnd = useCallback((wp: Point): OpenEndHit | null => {
    const th = SNAP_TO_LAST_RADIUS / zoom * (PIXELS_PER_METER / 80);
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (!isOnActiveLayer(si) || !passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
      const s = shapes[si];
      if (s.closed || s.points.length < 1) continue;
      if (distance(wp, s.points[s.points.length - 1]) < th) return { shapeIdx: si, end: "last" };
      if (distance(wp, s.points[0]) < th) return { shapeIdx: si, end: "first" };
    }
    return null;
  }, [shapes, zoom, isOnActiveLayer, viewFilter]);

  const arcHitThreshold = (pointRadiusEffective / zoom + 4) * (PIXELS_PER_METER / 80);
  const hitTestArcPointGlobal = useCallback((wp: Point): { shapeIdx: number; edgeIdx: number; arcPoint: ArcPoint } | null => {
    const testShape = (si: number) => {
      const s = shapes[si];
      if (!isOnActiveLayer(si) || !passesViewFilter(s, viewFilter, activeLayer)) return null;
      const pts = s.points;
      const edgeCount = s.closed ? pts.length : pts.length - 1;
      for (let ei = edgeCount - 1; ei >= 0; ei--) {
        const arcs = s.edgeArcs?.[ei];
        if (!arcs || arcs.length === 0) continue;
        const j = (ei + 1) % pts.length;
        const ap = hitTestArcPoint(wp, pts[ei], pts[j], arcs, arcHitThreshold);
        if (ap) return { shapeIdx: si, edgeIdx: ei, arcPoint: ap };
      }
      return null;
    };
    if (selectedShapeIdx !== null) {
      const hit = testShape(selectedShapeIdx);
      if (hit) return hit;
    }
    // In L1/L2/L5 arcpoints are visible on all shapes — allow hit test on non-selected shapes too
    if (showAllArcPoints || activeLayer === 1 || activeLayer === 2 || activeLayer === 3 || activeLayer === 5) {
      for (let si = shapes.length - 1; si >= 0; si--) {
        if (si === selectedShapeIdx) continue;
        const hit = testShape(si);
        if (hit) return hit;
      }
    }
    return null;
  }, [shapes, selectedShapeIdx, zoom, isOnActiveLayer, viewFilter, showAllArcPoints, activeLayer]);

  const getWorldPos = useCallback((e: React.MouseEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return screenToWorld(e.clientX - r.left, e.clientY - r.top);
  }, [screenToWorld]);

  // ── Mouse Handlers ─────────────────────────────────────
  const skipBlurRef = useRef(false);
  const applyHeightEditRef = useRef<((fromBlur?: boolean) => void) | null>(null);
  const heightInputSelectOnceRef = useRef(false);
  const geodesyCardRef = useRef<HTMLDivElement | null>(null);
  const rightClickScaleTriggeredRef = useRef(false);
  /** Pending right-click scale: activate only on drag (not on single click). Single click = context menu. */
  const RIGHT_CLICK_SCALE_DRAG_THRESHOLD_PX = 5;
  const EDGE_CLICK_DRAG_THRESHOLD_PX = 5;
  /** Pending edge drag (linear + closed/open polygons except paths): click without drag = select only; drag = move that edge (Shift = along edge axis). */
  const pendingEdgeAddRef = useRef<{
    shapeIdx: number;
    edgeIdx: number;
    pos: Point;
    edgeT: number;
    startScreen: Point;
    startWorld: Point;
  } | null>(null);
  const pendingRightClickScaleRef = useRef<{
    type: "corner"; data: ScaleCornerInfo; startScreen: Point;
  } | {
    type: "edge"; data: ScaleEdgeInfo; startScreen: Point;
  } | {
    type: "grass"; data: { shapeIdx: number; pieceIdx: number; edge: "length_start" | "length_end"; startMouse: Point; startLength: number; startX: number; startY: number }; startScreen: Point;
  } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) {
      rightClickScaleTriggeredRef.current = false;
      pendingRightClickScaleRef.current = null;
      const world = getWorldPos(e);
      const r = canvasRef.current!.getBoundingClientRect();
      const startScreen = { x: e.clientX - r.left, y: e.clientY - r.top };
      e.preventDefault();

      if (activeLayer === 3) {
        const patternHit = hitTestPattern(world);
        if (patternHit?.type === "grass") {
          const shape = shapes[patternHit.shapeIdx];
          const edgeHit = hitTestGrassPieceEdge(world, shape, grassEdgeHitPxEffective / zoom);
          if (edgeHit) {
            saveHistory();
            const piece = (shape.calculatorInputs?.vizPieces as GrassPiece[])?.[edgeHit.pieceIdx];
            if (piece) {
              pendingRightClickScaleRef.current = {
                type: "grass",
                data: { shapeIdx: patternHit.shapeIdx, pieceIdx: edgeHit.pieceIdx, edge: edgeHit.edge, startMouse: { ...world }, startLength: piece.lengthM, startX: piece.x, startY: piece.y },
                startScreen,
              };
            }
            return;
          }
        }
      }

      const ptHit = hitTestPointForScale(world);
      if (ptHit && shapes[ptHit.shapeIdx].closed) {
        const si = ptHit.shapeIdx;
        const pts = shapes[si].points;
        saveHistory();
        setSelectedShapeIdx(si);
        let maxD = 0;
        let anchor = centroid(pts);
        for (const p of pts) {
          const d = distance(pts[ptHit.pointIdx], p);
          if (d > maxD) { maxD = d; anchor = { ...p }; }
        }
        const startDist = distance(anchor, world);
        pendingRightClickScaleRef.current = {
          type: "corner",
          data: {
            shapeIdx: si, pointIdx: ptHit.pointIdx, anchor,
            startMouse: { ...world }, startPoints: pts.map(p => ({ ...p })),
            startDist: startDist < 1 ? 1 : startDist,
          },
          startScreen,
        };
        return;
      }
      const edgeHit = hitTestEdgeForScale(world);
      if (edgeHit && shapes[edgeHit.shapeIdx].closed) {
        const si = edgeHit.shapeIdx;
        const pts = shapes[si].points;
        saveHistory();
        setSelectedShapeIdx(si);
        const j = (edgeHit.edgeIdx + 1) % pts.length;
        const eA = pts[edgeHit.edgeIdx], eB = pts[j];
        const dx = eB.x - eA.x, dy = eB.y - eA.y;
        const eLen = Math.sqrt(dx * dx + dy * dy);
        const ctr = centroid(pts);
        let nx = -dy / eLen, ny = dx / eLen;
        const eMid = midpoint(eA, eB);
        const toCenter = { x: ctr.x - eMid.x, y: ctr.y - eMid.y };
        if (nx * toCenter.x + ny * toCenter.y > 0) { nx = -nx; ny = -ny; }
        pendingRightClickScaleRef.current = {
          type: "edge",
          data: {
            shapeIdx: si, edgeIdx: edgeHit.edgeIdx,
            startMouse: { ...world }, startPoints: pts.map(p => ({ ...p })),
            normal: { x: nx, y: ny }, edgeMid: eMid,
          },
          startScreen,
        };
        return;
      }
      return;
    }
    setContextMenu(null); setEditingDim(null); setSelectedPoints([]);
    const world = getWorldPos(e);

    if (e.button === 1) { e.preventDefault(); setIsPanning(true); setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); return; }

    // Move mode: left click always pans (works anywhere)
    if (mode === "move") {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // Shift-measure: Shift + click to start; then click 2, click 3 to clear (when not drawing)
    // Nie włączaj pomiaru gdy coś jest zaznaczone (punkt, linia, kształt) — Shift służy tam do blokady kąta (np. 180°)
    // Działa przy kliknięciu na punkt, linię lub pustą przestrzeń — getPointFromClick() zwraca punkt/rzut na krawędź
    // Działa w Layer 1, 2, 3, 5 (Preparation/Layer 4 jest read-only)
    const canStartMeasure = selectedShapeIdx === null && selectedPoints.length === 0 && !selectionRect && !editingDim && !rotateInfo && !patternDragInfo && !patternRotateInfo && !shapeDragInfo && !edgeDragInfo;
    const measureAllowed = activeLayer === 1 || activeLayer === 2 || activeLayer === 3 || activeLayer === 5;
    if (drawingShapeIdx === null && measureAllowed) {
      const getPointFromClick = (): Point => {
        const pt = hitTestPoint(world);
        if (pt) return shapes[pt.shapeIdx].points[pt.pointIdx];
        const edge = hitTestEdge(world);
        if (edge) return edge.pos;
        return { ...world };
      };
      if (shiftHeld && measureStart === null && canStartMeasure) {
        setMeasureStart(getPointFromClick());
        return;
      }
      if (measureStart !== null) {
        if (measureEnd !== null) {
          setMeasureStart(null);
          setMeasureEnd(null);
          return;
        }
        setMeasureEnd(getPointFromClick());
        return;
      }
    }

    // Path segment side selection: click on green or orange zone for any segment
    if (pathSegmentSideSelection && e.button === 0) {
      const { shapeIdx: si, segmentSides } = pathSegmentSideSelection;
      const shape = shapes[si];
      if (!shape || !isPathElement(shape)) { setPathSegmentSideSelection(null); return; }
      const pts = shape.points;
      const pathWidthM = Number(shape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6;
      const fullPx = toPixels(pathWidthM);
      // Threshold must be >= fullPx so clicks on green/orange sides (at full width from centerline) register
      const th = Math.max(fullPx + 16, (30 / zoom) * (PIXELS_PER_METER / 80));
      let bestSeg = -1;
      let bestD = th;
      for (let i = 0; i < pts.length - 1; i++) {
        const pr = projectOntoSegment(world, pts[i], pts[i + 1]);
        if (pr.dist < bestD) { bestD = pr.dist; bestSeg = i; }
      }
      if (bestSeg >= 0) {
        const side = pointSideOfLine(world, pts[bestSeg], pts[bestSeg + 1]);
        const chosenSide = side === "on" ? "left" : side === "left" ? "right" : "left";
        saveHistory();
        // UNIFORM_SIDE: Apply chosen side to ALL segments at once.
        // To revert to per-segment selection, replace the line below with:
        //   const newSides = [...segmentSides]; newSides[bestSeg] = chosenSide;
        const newSides: ("left" | "right" | null)[] = segmentSides.map(() => chosenSide);
        const allChosen = newSides.every(s => s !== null);
        if (allChosen) {
          const outline = computePathOutlineFromSegmentSides(pts, newSides as ("left" | "right")[], pathWidthM);
          if (outline.length >= 3) {
            setShapes(p => {
              const n = [...p];
              const sh = n[si];
              n[si] = {
                ...sh,
                points: outline,
                closed: true,
                drawingFinished: true,
                calculatorInputs: {
                  ...sh.calculatorInputs,
                  pathIsOutline: true,
                  pathCenterline: pts.map(p => ({ ...p })),
                  pathCenterlineOriginal: pts.map(p => ({ ...p })),
                  pathSegmentSides: [...(newSides as ("left" | "right")[])],
                  pathWidthM: pathWidthM,
                },
              };
              return n;
            });
            setPathConfig(null);
            setPathSegmentSideSelection(null);
            if (!shape.namePromptShown) setNamePromptShapeIdx(si);
            setSelectedShapeIdx(null);
            setPathJustFinishedForAutoCalc(si);
            setObjectCardShapeIdx(si);
            setMode("select");
          }
        } else {
          setPathSegmentSideSelection({ shapeIdx: si, segmentSides: newSides });
        }
      }
      return;
    }

    // Currently drawing
    if (drawingShapeIdx !== null && shapes[drawingShapeIdx]) {
      const pts = shapes[drawingShapeIdx].points;
      const s = shapes[drawingShapeIdx];

      const snapFn = isPathElement(s) ? snapTo45Soft : snapTo45;
      let ep = shiftHeld && pts.length > 0 ? snapFn(pts[pts.length - 1], world) : world;

      if (isLinearElement(s) || isPathElement(s)) {
        ep = snapWorldPointForLinearDrawing(ep, {
          drawingShapeIdx,
          shapes,
          localPtChain: pts,
          drawingShape: s,
          zoom,
          viewFilter,
          activeLayer,
        });
      } else {
        const sgThreshold = 8 / zoom;
        let bestSgDx = sgThreshold, bestSgDy = sgThreshold;
        let sgSnapX: number | null = null, sgSnapY: number | null = null;
        for (let i = 0; i < pts.length; i++) {
          const dx = Math.abs(ep.x - pts[i].x);
          const dy = Math.abs(ep.y - pts[i].y);
          if (dx < bestSgDx) { bestSgDx = dx; sgSnapX = pts[i].x; }
          if (dy < bestSgDy) { bestSgDy = dy; sgSnapY = pts[i].y; }
        }
        if (sgSnapX !== null || sgSnapY !== null) ep = { x: sgSnapX ?? ep.x, y: sgSnapY ?? ep.y };
      }

      if (pts.length >= 3 && !isLinearElement(shapes[drawingShapeIdx])) {
        const ss = worldToScreen(pts[0].x, pts[0].y);
        const ms = worldToScreen(ep.x, ep.y);
        if (distance(ms, ss) < SNAP_TO_START_RADIUS) {
          saveHistory();
          setShapes(p => { const n = [...p]; n[drawingShapeIdx] = { ...n[drawingShapeIdx], closed: true }; return n; });
          setNamePromptShapeIdx(drawingShapeIdx);
          setDrawingShapeIdx(null); setSelectedShapeIdx(drawingShapeIdx); setMode("select"); return;
        }
      }
      if (pts.length >= 2 && (isLinearElement(shapes[drawingShapeIdx]) || isPathElement(shapes[drawingShapeIdx]))) {
        const ss = worldToScreen(pts[0].x, pts[0].y);
        const ms = worldToScreen(ep.x, ep.y);
        if (distance(ms, ss) < SNAP_TO_START_RADIUS) {
          saveHistory();
          const s = shapes[drawingShapeIdx];
          const isGroundwork = isGroundworkLinear(s);
          const isPath = isPathElement(s);
          if (isPath) {
            const pathPts = s.edgeArcs?.some(a => a && a.length > 0) ? getLinearElementPath(s) : s.points;
            const segCount = pathPts.length - 1;
            if (segCount >= 1) {
              setPathSegmentSideSelection({ shapeIdx: drawingShapeIdx, segmentSides: Array(segCount).fill(null) });
              setDrawingShapeIdx(null);
              setSelectedShapeIdx(drawingShapeIdx);
            }
            return;
          }
          if (isGroundwork) {
            const totalLenM = polylineLengthMeters(pts) + distance(pts[pts.length - 1], pts[0]);
            const elementType = s.elementType as "drainage" | "canalPipe" | "waterPipe" | "cable";
            const isManual = isManualExcavation(getFoundationDiggingMethodFromExcavator(projectSettings.selectedExcavator), projectSettings.selectedExcavator);
            const results = computeGroundworkLinearResults({ lengthM: totalLenM, elementType, isManual });
            setShapes(p => {
              const n = [...p];
              const sh = {
                ...n[drawingShapeIdx],
                closed: true,
                calculatorType: "groundwork",
                calculatorSubType: elementType,
                calculatorInputs: { length: totalLenM, excavationMethod: isManual ? "manual" : "machinery" },
                calculatorResults: results,
              };
              n[drawingShapeIdx] = sh;
              return n;
            });
          } else if (isPolygonLinearElement(s)) {
            saveHistory();
            const thicknessM = getPolygonThicknessM(s);
            const outline = computeThickPolylineClosed(pts, toPixels(thicknessM));
            if (outline.length >= 3) {
              const segLengths = polygonToSegmentLengths(outline);
              setShapes(p => {
                const n = [...p];
                const sh = n[drawingShapeIdx];
                const inputs: Record<string, unknown> = { ...sh.calculatorInputs, segmentLengths: segLengths };
                if (sh.elementType === "wall") {
                  const defaultH = parseFloat(String(sh.calculatorInputs?.height ?? "1")) || 1;
                  inputs.segmentHeights = segLengths.map(() => ({ startH: defaultH, endH: defaultH }));
                }
                n[drawingShapeIdx] = { ...sh, points: outline, closed: true, drawingFinished: true, calculatorInputs: inputs };
                return n;
              });
            } else {
              setShapes(p => { const n = [...p]; n[drawingShapeIdx] = { ...n[drawingShapeIdx], closed: true }; return n; });
            }
          } else {
            setShapes(p => { const n = [...p]; n[drawingShapeIdx] = { ...n[drawingShapeIdx], closed: true }; return n; });
          }
          if ((["Wall", "Fence", "Kerb", "Foundation"].includes(s.label || "") || isGroundwork) && !s.namePromptShown) setNamePromptShapeIdx(drawingShapeIdx);
          setDrawingShapeIdx(null); setSelectedShapeIdx(drawingShapeIdx); setMode("select"); return;
        }
      }
      saveHistory();
      setShapes(p => {
        const n = [...p]; const sh = { ...n[drawingShapeIdx] };
        sh.points = [...sh.points, { ...ep }];
        sh.heights = [...(sh.heights || []), 0];
        n[drawingShapeIdx] = sh; return n;
      });
      return;
    }

    // Pick anchor vertex for "offset along line" (must run before geodesy / select so the second click is not swallowed)
    if (
      pointOffsetAlongLinePick &&
      mode === "select" &&
      drawingShapeIdx === null &&
      e.button === 0 &&
      (activeLayer === 1 || activeLayer === 2 || activeLayer === 5)
    ) {
      const ptHit = hitTestPoint(world);
      if (ptHit) {
        const pick = pointOffsetAlongLinePick;
        if (ptHit.shapeIdx === pick.moveShapeIdx && ptHit.pointIdx === pick.movePointIdx) {
          return;
        }
        const moveShape = shapes[pick.moveShapeIdx];
        const move = moveShape?.points[pick.movePointIdx];
        const anchor = shapes[ptHit.shapeIdx]?.points[ptHit.pointIdx];
        if (move && anchor) {
          const distM = toMeters(distance(move, anchor));
          setPointOffsetAlongLineModal({
            moveShapeIdx: pick.moveShapeIdx,
            movePointIdx: pick.movePointIdx,
            anchorShapeIdx: ptHit.shapeIdx,
            anchorPointIdx: ptHit.pointIdx,
            screenX: e.clientX,
            screenY: e.clientY,
          });
          setPointOffsetAlongLineValue(distM.toFixed(3));
          setPointOffsetAlongLinePick(null);
          return;
        }
      } else {
        setPointOffsetAlongLinePick(null);
      }
    }

    // Geodesy (toggle): click card or point → edit heights in card; click L1 interior → show interpolated height.
    if (geodesyEnabled) {
      const geodesyFilter = (s: Shape) => {
        if (s.layer === 1 && activeLayer !== 1) return false; // Layer 1 geodesy only in layer 1
        if (!passesViewFilter(s, viewFilter, activeLayer)) return false;
        if (activeLayer === 5) return s.layer === 1 || s.layer === 2;
        return s.layer === activeLayer;
      };
      const rect = canvasRef.current?.getBoundingClientRect();
      const ctx = canvasRef.current?.getContext("2d");
      if (rect && ctx) {
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const cardsInfo = getGeodesyCardsInfo(ctx, shapes, worldToScreen, geodesyFilter);
        const cardHit = hitTestGeodesyCard(canvasX, canvasY, cardsInfo);
        if (cardHit) {
          setClickedHeightTooltip(null);
          if (editingGeodesyCard) applyHeightEditRef.current?.();
          skipBlurRef.current = true;
          const card = cardsInfo[cardHit.cardIdx];
          setEditingGeodesyCard({ cardInfo: card });
          setHeightValues(card.entries.map(ent => (ent.height * 100).toFixed(1)));
          setSelectedShapeIdx(card.group[0]?.shapeIdx ?? null);
          requestAnimationFrame(() => { skipBlurRef.current = false; });
          return;
        }
      }
      const hpHit = hitTestHeightPoint(world);
      if (hpHit) {
        setClickedHeightTooltip(null);
        if (editingGeodesyCard) applyHeightEditRef.current?.();
        skipBlurRef.current = true;
        if (rect && ctx) {
          const cardsInfo = getGeodesyCardsInfo(ctx, shapes, worldToScreen, geodesyFilter);
          const card = findCardForPoint(cardsInfo, { shapeIdx: hpHit.shapeIdx, heightPointIdx: hpHit.heightPointIdx });
          if (card) {
            setEditingGeodesyCard({ cardInfo: card });
            setHeightValues(card.entries.map(ent => (ent.height * 100).toFixed(1)));
            setSelectedShapeIdx(hpHit.shapeIdx);
          }
        }
        requestAnimationFrame(() => { skipBlurRef.current = false; });
        return;
      }
      const ptHit = hitTestPoint(world);
      if (ptHit) {
        setClickedHeightTooltip(null);
        if (editingGeodesyCard) applyHeightEditRef.current?.();
        skipBlurRef.current = true;
        if (rect && ctx) {
          const cardsInfo = getGeodesyCardsInfo(ctx, shapes, worldToScreen, geodesyFilter);
          const card = findCardForPoint(cardsInfo, { shapeIdx: ptHit.shapeIdx, pointIdx: ptHit.pointIdx });
          if (card) {
            setEditingGeodesyCard({ cardInfo: card });
            setHeightValues(card.entries.map(ent => (ent.height * 100).toFixed(1)));
            setSelectedShapeIdx(ptHit.shapeIdx);
          }
        }
        requestAnimationFrame(() => { skipBlurRef.current = false; });
        return;
      }
      applyHeightEditRef.current?.();
      setEditingGeodesyCard(null);
      setSelectedShapeIdx(null);
      // Click on L1 shape interior (not on vertex) → show interpolated height (only in layer 1)
      if (activeLayer === 1) {
        for (let si = shapes.length - 1; si >= 0; si--) {
          const shape = shapes[si];
          if (!passesViewFilter(shape, viewFilter, activeLayer)) continue;
          if (shape.layer !== 1 || !shape.closed || shape.points.length < 3) continue;
          const polyForHit = shape.edgeArcs?.some(a => a && a.length > 0) ? getEffectivePolygon(shape) : shape.points;
          if (!pointInPolygon(world, polyForHit)) continue;
          const h = interpolateHeightAtPoint(shape, world);
          if (h !== null) {
            setClickedHeightTooltip({ world, shapeIdx: si, height: h });
          }
          return;
        }
      }
      setClickedHeightTooltip(null);
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // Clear height UI when not in geodesy mode (we didn't enter the geodesy block above)
    setEditingGeodesyCard(null);
    setClickedHeightTooltip(null);

    // Select mode
    if (mode === "select") {
      if (activeLayer === 3) {
        // Check rotation handle first (above shape — may not be inside pattern hit area)
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          for (let si = shapes.length - 1; si >= 0; si--) {
            const shape = shapes[si];
            if (shape.layer !== 2 || !shape.closed || shape.points.length < 3) continue;
            if (!passesViewFilter(shape, viewFilter, activeLayer)) continue;
            const pts = shape.points;
            let minY = Infinity;
            pts.forEach((p: Point) => { const sp = worldToScreen(p.x, p.y); if (sp.y < minY) minY = sp.y; });
            const ctr = centroid(pts);
            const sc = worldToScreen(ctr.x, ctr.y);
            const handleY = minY - 35;
            if (Math.abs(screenX - sc.x) < 14 && Math.abs(screenY - handleY) < 14) {
              const angleLocked = !!shape.calculatorInputs?.vizPatternAngleLocked;
              if (shape.calculatorType === "grass" && (shape.calculatorInputs?.vizPieces?.length ?? 0) > 0) {
                if (angleLocked) {
                  saveHistory();
                  setSelectedPattern({ shapeIdx: si, type: "grass" });
                  setSelectedShapeIdx(si);
                  return;
                }
                saveHistory();
                const dirDeg = Number(shape.calculatorInputs?.grassVizDirection ?? shape.calculatorInputs?.vizDirection ?? 0);
                setPatternRotateInfo({
                  shapeIdx: si,
                  type: "grass",
                  center: { ...ctr },
                  startAngle: Math.atan2(world.y - ctr.y, world.x - ctr.x),
                  startDirectionDeg: dirDeg,
                  boundaryAnglesDeg: collectShapeBoundaryDirectionAnglesDeg(shape),
                });
                setPatternRotatePreview(null);
                setSelectedPattern({ shapeIdx: si, type: "grass" });
                setSelectedShapeIdx(si);
                return;
              }
              const pavingOk = shape.calculatorType === "paving" && shape.calculatorInputs?.blockLengthCm && shape.calculatorInputs?.blockWidthCm;
              const slabOk =
                (shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && shape.calculatorInputs?.vizSlabWidth;
              if (pavingOk || slabOk) {
                const patType = shape.calculatorType === "paving" ? "cobblestone" : "slab";
                if (angleLocked) {
                  saveHistory();
                  const inp = shape.calculatorInputs ?? {};
                  if (isPathElement(shape)) {
                    const pathCenterline = inp.pathCenterline as Point[] | undefined;
                    if (pathCenterline && pathCenterline.length >= 2) {
                      const rawBySeg = inp.pathPatternLongOffsetMBySegment as number[] | undefined;
                      const nSeg = pathCenterline.length - 1;
                      const fallbackM = Number(inp.pathPatternLongOffsetM ?? 0) || 0;
                      const startPathPatternLongOffsetMBySegment = Array.isArray(rawBySeg) && rawBySeg.length === nSeg
                        ? rawBySeg.map(v => Number(v ?? 0) || 0)
                        : Array.from({ length: nSeg }, () => fallbackM);
                      let bestSegIdx = 0;
                      let bestDist = Infinity;
                      for (let i = 0; i < nSeg; i++) {
                        const A = pathCenterline[i]!;
                        const B = pathCenterline[i + 1]!;
                        const pr = projectOntoSegment(world, A, B);
                        const d = distance(world, pr.proj);
                        if (d < bestDist) {
                          bestDist = d;
                          bestSegIdx = i;
                        }
                      }
                      setPatternDragInfo({ shapeIdx: si, type: patType, startMouse: { ...world }, startOffset: { x: 0, y: 0 }, isPath: true, startPathSegmentIdx: bestSegIdx, startPathPatternLongOffsetMBySegment });
                      setPathPatternLongOffsetPreview(null);
                      setPatternAlignedEdges([]);
                      setSelectedPattern({ shapeIdx: si, type: patType });
                      setSelectedShapeIdx(si);
                      return;
                    }
                  }
                  const startOffset = {
                    x: Number(inp.vizOriginOffsetX ?? 0),
                    y: Number(inp.vizOriginOffsetY ?? 0),
                  };
                  setPatternDragInfo({ shapeIdx: si, type: patType, startMouse: { ...world }, startOffset });
                  setPatternDragPreview(null);
                  setPatternAlignedEdges([]);
                  setSelectedPattern({ shapeIdx: si, type: patType });
                  setSelectedShapeIdx(si);
                  return;
                }
                saveHistory();
                const dirDeg = Number(shape.calculatorInputs?.vizDirection ?? 0);
                setPatternRotateInfo({
                  shapeIdx: si,
                  type: patType,
                  center: { ...ctr },
                  startAngle: Math.atan2(world.y - ctr.y, world.x - ctr.x),
                  startDirectionDeg: dirDeg,
                  boundaryAnglesDeg: collectShapeBoundaryDirectionAnglesDeg(shape),
                });
                setPatternRotatePreview(null);
                setSelectedPattern({ shapeIdx: si, type: patType });
                setSelectedShapeIdx(si);
                return;
              }
            }
          }
        }
        const patternHit = hitTestPattern(world);
        if (patternHit) {
          setSelectedPattern(patternHit);
          setSelectedShapeIdx(patternHit.shapeIdx);
          if (patternHit.type === "grass") {
            const shape = shapes[patternHit.shapeIdx];
            const edgeHit = hitTestGrassPieceEdge(world, shape, grassEdgeHitPxEffective / zoom);
            if (edgeHit) {
              saveHistory();
              const piece = (shape.calculatorInputs?.vizPieces as GrassPiece[])?.[edgeHit.pieceIdx];
              if (piece) {
                setGrassScaleInfo({ shapeIdx: patternHit.shapeIdx, pieceIdx: edgeHit.pieceIdx, edge: edgeHit.edge, startMouse: { ...world }, startLength: piece.lengthM, startX: piece.x, startY: piece.y });
              }
            } else {
              const pieceIdx = hitTestGrassPiece(world, shape);
              if (pieceIdx !== null) {
                saveHistory();
                setDraggingGrassPiece({ shapeIdx: patternHit.shapeIdx, pieceIdx, startMouse: { ...world } });
                setGrassNearEdge(null);
              }
            }
          } else if (patternHit.type === "slab" || patternHit.type === "cobblestone") {
            const shape = shapes[patternHit.shapeIdx];
            const pts = shape.points;
            if (pts.length >= 3) {
              let minY = Infinity;
              pts.forEach((p: Point) => { const sp = worldToScreen(p.x, p.y); if (sp.y < minY) minY = sp.y; });
              const ctr = centroid(pts);
              const sc = worldToScreen(ctr.x, ctr.y);
              const handleY = minY - 35;
              const rect = canvasRef.current!.getBoundingClientRect();
              const screenX = e.clientX - rect.left;
              const screenY = e.clientY - rect.top;
              if (Math.abs(screenX - sc.x) < 14 && Math.abs(screenY - handleY) < 14) {
                if (!shape.calculatorInputs?.vizPatternAngleLocked) {
                  saveHistory();
                  const dirDeg = Number(shape.calculatorInputs?.vizDirection ?? 0);
                  setPatternRotateInfo({
                    shapeIdx: patternHit.shapeIdx,
                    type: patternHit.type,
                    center: { ...ctr },
                    startAngle: Math.atan2(world.y - ctr.y, world.x - ctr.x),
                    startDirectionDeg: dirDeg,
                    boundaryAnglesDeg: collectShapeBoundaryDirectionAnglesDeg(shape),
                  });
                  setPatternRotatePreview(null);
                  return;
                }
              }
            }
            saveHistory();
            const inp = shape.calculatorInputs ?? {};
            if (isPathElement(shape)) {
              const pathCenterline = inp.pathCenterline as Point[] | undefined;
              if (pathCenterline && pathCenterline.length >= 2) {
                const rawBySeg = inp.pathPatternLongOffsetMBySegment as number[] | undefined;
                const nSeg = pathCenterline.length - 1;
                const fallbackM = Number(inp.pathPatternLongOffsetM ?? 0) || 0;
                const startPathPatternLongOffsetMBySegment = Array.isArray(rawBySeg) && rawBySeg.length === nSeg
                  ? rawBySeg.map(v => Number(v ?? 0) || 0)
                  : Array.from({ length: nSeg }, () => fallbackM);
                let bestSegIdx = 0;
                let bestDist = Infinity;
                for (let i = 0; i < nSeg; i++) {
                  const A = pathCenterline[i]!;
                  const B = pathCenterline[i + 1]!;
                  const pr = projectOntoSegment(world, A, B);
                  const d = distance(world, pr.proj);
                  if (d < bestDist) {
                    bestDist = d;
                    bestSegIdx = i;
                  }
                }
                setPatternDragInfo({ shapeIdx: patternHit.shapeIdx, type: patternHit.type, startMouse: { ...world }, startOffset: { x: 0, y: 0 }, isPath: true, startPathSegmentIdx: bestSegIdx, startPathPatternLongOffsetMBySegment });
                setPathPatternLongOffsetPreview(null);
                setPatternAlignedEdges([]);
                return;
              }
            }
            const startOffset = {
              x: Number(inp.vizOriginOffsetX ?? 0),
              y: Number(inp.vizOriginOffsetY ?? 0),
            };
            setPatternDragInfo({ shapeIdx: patternHit.shapeIdx, type: patternHit.type, startMouse: { ...world }, startOffset });
            setPatternDragPreview(null);
            setPatternAlignedEdges([]);
          }
          return;
        }
        setSelectedPattern(null);
        setSelectedShapeIdx(null);
        if (ctrlHeld) {
          const r = canvasRef.current!.getBoundingClientRect();
          const sx = e.clientX - r.left, sy = e.clientY - r.top;
          setSelectionRect({ startX: sx, startY: sy, endX: sx, endY: sy });
        } else {
          setIsPanning(true); setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
        return;
      }

      // Rotation handle
      if (selectedShapeIdx !== null && shapes[selectedShapeIdx] && shapes[selectedShapeIdx].closed && isOnActiveLayer(selectedShapeIdx)) {
        const shape = shapes[selectedShapeIdx];
        const pts = shape.points;
        if (pts.length >= 3) {
          let minY = Infinity;
          pts.forEach(p => { const sp = worldToScreen(p.x, p.y); if (sp.y < minY) minY = sp.y; });
          const ctr = centroid(pts);
          const sc = worldToScreen(ctr.x, ctr.y);
          const handleY = minY - 35;
          const rect = canvasRef.current!.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          if (Math.abs(screenX - sc.x) < 14 && Math.abs(screenY - handleY) < 14) {
            saveHistory();
            setRotateInfo({ shapeIdx: selectedShapeIdx, center: { ...ctr }, startAngle: Math.atan2(world.y - ctr.y, world.x - ctr.x), startPoints: pts.map(p => ({ ...p })) });
            transformStartVizPiecesRef.current = shape.calculatorInputs?.vizPieces
              ? (shape.calculatorInputs.vizPieces as GrassPiece[]).map(p => ({ ...p })) : null;
            return;
          }
        }
      }

      // Open endpoints
      const openEnd = hitTestOpenEnd(world);
      if (openEnd) {
        const { shapeIdx: si, end } = openEnd;
        const pi = end === "first" ? 0 : shapes[si].points.length - 1;
        setDragInfo({ shapeIdx: si, pointIdx: pi, startMouse: { ...world }, startPoint: { ...shapes[si].points[pi] }, isOpenEnd: true, openEndSide: end });
        setSelectedShapeIdx(si);
        return;
      }

      const arcHit = hitTestArcPointGlobal(world);
      if (arcHit) {
        saveHistory();
        const shape = shapes[arcHit.shapeIdx];
        const A = shape.points[arcHit.edgeIdx];
        const B = shape.points[(arcHit.edgeIdx + 1) % shape.points.length];
        const arcs = shape.edgeArcs?.[arcHit.edgeIdx] ?? [];
        const startArcPointWorld = arcPointToWorldOnCurve(A, B, arcs, arcHit.arcPoint);
        arcSnapLockedTargetRef.current = null;
        arcSnapCacheRef.current = buildArcPointPositionCache(shapes, isOnActiveLayer);
        setArcDragInfo({ shapeIdx: arcHit.shapeIdx, edgeIdx: arcHit.edgeIdx, arcPoint: arcHit.arcPoint, startMouse: { ...world }, startArcPointWorld });
        setSelectedShapeIdx(arcHit.shapeIdx);
        return;
      }

      const ptHit = hitTestPoint(world);
      if (ptHit) {
        saveHistory();
        setDragInfo({ shapeIdx: ptHit.shapeIdx, pointIdx: ptHit.pointIdx, startMouse: { ...world }, startPoint: { ...shapes[ptHit.shapeIdx].points[ptHit.pointIdx] } });
        setSelectedShapeIdx(ptHit.shapeIdx); return;
      }

      const edgeHit = hitTestEdge(world);
      if (edgeHit) {
        const hitShape = shapes[edgeHit.shapeIdx];
        // Paths: don't move outline vertices from edge hit (would corrupt pathIsOutline/pathCenterline).
        if (isPathElement(hitShape)) {
          setSelectedShapeIdx(edgeHit.shapeIdx);
          return;
        }
        const r = canvasRef.current!.getBoundingClientRect();
        const startScreen = { x: e.clientX - r.left, y: e.clientY - r.top };
        pendingEdgeAddRef.current = {
          shapeIdx: edgeHit.shapeIdx,
          edgeIdx: edgeHit.edgeIdx,
          pos: { ...edgeHit.pos },
          edgeT: edgeHit.t,
          startScreen,
          startWorld: { ...world },
        };
        setSelectedShapeIdx(edgeHit.shapeIdx);
        return;
      }

      if (selectedShapeIdx !== null) {
        const shape = shapes[selectedShapeIdx];
        if (shape?.calculatorType === "grass" && shape.calculatorInputs?.vizPieces?.length > 0) {
          const pieceIdx = hitTestGrassPiece(world, shape);
          if (pieceIdx !== null) {
            saveHistory();
            setDraggingGrassPiece({ shapeIdx: selectedShapeIdx, pieceIdx, startMouse: { ...world } });
            return;
          }
        }
      }

      const shapeHit = hitTestShape(world);
      if (shapeHit !== null) {
        setSelectedShapeIdx(shapeHit);
        saveHistory();
        setShapeDragInfo({ shapeIdx: shapeHit, startMouse: { ...world }, startPoints: shapes[shapeHit].points.map(p => ({ ...p })) });
        const hitShape = shapes[shapeHit];
        transformStartVizPiecesRef.current = hitShape.calculatorInputs?.vizPieces
          ? (hitShape.calculatorInputs.vizPieces as GrassPiece[]).map(p => ({ ...p })) : null;
        if (hitShape.layer === 1 && hitShape.closed && hitShape.points.length >= 3) {
          const children: typeof gardenDragChildrenRef.current = [];
          for (let ci = 0; ci < shapes.length; ci++) {
            if (ci === shapeHit || shapes[ci].layer !== 2) continue;
            const c = centroid(shapes[ci].points);
            if (pointInPolygon(c, hitShape.points)) {
              children.push({
                idx: ci,
                startPoints: shapes[ci].points.map(p => ({ ...p })),
                startVizPieces: shapes[ci].calculatorInputs?.vizPieces
                  ? (shapes[ci].calculatorInputs!.vizPieces as GrassPiece[]).map(p => ({ ...p })) : null,
              });
            }
          }
          gardenDragChildrenRef.current = children;
        } else {
          gardenDragChildrenRef.current = [];
        }
        return;
      }

      setSelectedShapeIdx(null);
      if (ctrlHeld) {
        const r = canvasRef.current!.getBoundingClientRect();
        const sx = e.clientX - r.left, sy = e.clientY - r.top;
        setSelectionRect({ startX: sx, startY: sy, endX: sx, endY: sy });
        return;
      }
      setIsPanning(true); setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }

    // Free draw
    if (mode === "freeDraw" && drawingShapeIdx === null) {
      const openEnd = hitTestOpenEnd(world);
      if (openEnd) {
        const { shapeIdx: si, end } = openEnd;
        if (end === "first") {
          setShapes(p => { const n = [...p]; const s = { ...n[si] }; s.points = [...s.points].reverse(); n[si] = s; return n; });
        }
        setDrawingShapeIdx(si); setSelectedShapeIdx(si); return;
      }
      const newIdx = shapes.length;
      setShapes(p => [...p, { points: [{ ...world }], closed: false, label: "Free Draw", layer: (activeLayer === 3 || activeLayer === 4 ? 2 : activeLayer) as LayerID, lockedEdges: [], lockedAngles: [], heights: [0], elementType: "polygon", thickness: 0 }]);
      setDrawingShapeIdx(newIdx); setSelectedShapeIdx(newIdx);
    }

    // Path drawing modes (Slabs, Monoblock) — requires pathConfig from PathCreationModal
    if ((mode === "drawPathSlabs" || mode === "drawPathConcreteSlabs" || mode === "drawPathMonoblock") && pathConfig && drawingShapeIdx === null) {
      const elementType = mode === "drawPathSlabs" ? "pathSlabs" : mode === "drawPathConcreteSlabs" ? "pathConcreteSlabs" : "pathMonoblock";
      const newIdx = shapes.length;
      setShapes(p => [...p, {
        points: [{ ...world }], closed: false,
        label: mode === "drawPathSlabs" ? t("project:results_path_slabs") : mode === "drawPathConcreteSlabs" ? t("project:results_path_concrete_slabs") : t("project:results_path_monoblock"),
        layer: 2 as LayerID,
        lockedEdges: [], lockedAngles: [], heights: [0],
        elementType: elementType as "pathSlabs" | "pathConcreteSlabs" | "pathMonoblock",
        thickness: 0,
        calculatorType: pathConfig.calculatorType,
        calculatorInputs: { ...pathConfig.calculatorInputs },
      }]);
      setDrawingShapeIdx(newIdx); setSelectedShapeIdx(newIdx);
    }

    // Linear drawing modes (Fence, Wall, Kerb, Foundation)
    if ((mode === "drawFence" || mode === "drawWall" || mode === "drawKerb" || mode === "drawFoundation") && drawingShapeIdx === null) {
      const elementType = mode === "drawFence" ? "fence" : mode === "drawWall" ? "wall" : mode === "drawKerb" ? "kerb" : "foundation";
      const openEnd = hitTestOpenEnd(world);
      if (openEnd) {
        const { shapeIdx: si, end } = openEnd;
        if (isLinearElement(shapes[si]) && shapes[si].elementType === elementType) {
          if (end === "first") {
            setShapes(p => { const n = [...p]; const s = { ...n[si] }; s.points = [...s.points].reverse(); n[si] = s; return n; });
          }
          setDrawingShapeIdx(si); setSelectedShapeIdx(si); return;
        }
      }
      const newIdx = shapes.length;
      setShapes(p => [...p, {
        points: [{ ...world }], closed: false,
        label: elementType.charAt(0).toUpperCase() + elementType.slice(1),
        layer: 2 as LayerID,
        lockedEdges: [], lockedAngles: [], heights: [0],
        elementType: elementType as "fence" | "wall" | "kerb" | "foundation",
        thickness: elementType === "foundation" ? 0.30 : 0.10,
        ...(elementType === "wall" ? {
          calculatorType: "wall" as const,
          calculatorSubType: "block4",
          calculatorInputs: { layingMethod: "standing" as const, height: "1" },
        } : {}),
        ...(elementType === "kerb" ? {
          calculatorType: "kerbs" as const,
          calculatorSubType: "kl",
          calculatorInputs: {},
        } : {}),
      }]);
      setDrawingShapeIdx(newIdx); setSelectedShapeIdx(newIdx);
    }

    // Groundwork linear drawing modes (Drainage, Canal pipe, Water pipe, Cable)
    if ((mode === "drawDrainage" || mode === "drawCanalPipe" || mode === "drawWaterPipe" || mode === "drawCable") && drawingShapeIdx === null) {
      const elementType = mode === "drawDrainage" ? "drainage" : mode === "drawCanalPipe" ? "canalPipe" : mode === "drawWaterPipe" ? "waterPipe" : "cable";
      const label = mode === "drawDrainage" ? "Drainage" : mode === "drawCanalPipe" ? "Canal pipe" : mode === "drawWaterPipe" ? "Water pipe" : "Cable";
      const th = SNAP_TO_LAST_RADIUS / zoom * (PIXELS_PER_METER / 80);
      let openEnd: OpenEndHit | null = null;
      for (let si = shapes.length - 1; si >= 0; si--) {
        if (!isGroundworkLinear(shapes[si]) || shapes[si].elementType !== elementType) continue;
        if (!passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
        const s = shapes[si];
        if (s.closed || s.points.length < 1) continue;
        if (distance(world, s.points[s.points.length - 1]) < th) { openEnd = { shapeIdx: si, end: "last" }; break; }
        if (distance(world, s.points[0]) < th) { openEnd = { shapeIdx: si, end: "first" }; break; }
      }
      if (openEnd) {
        const { shapeIdx: si, end } = openEnd;
        if (isGroundworkLinear(shapes[si]) && shapes[si].elementType === elementType) {
          if (end === "first") {
            setShapes(p => { const n = [...p]; const s = { ...n[si] }; s.points = [...s.points].reverse(); n[si] = s; return n; });
          }
          setDrawingShapeIdx(si); setSelectedShapeIdx(si); return;
        }
      }
      const newIdx = shapes.length;
      setShapes(p => [...p, {
        points: [{ ...world }], closed: false,
        label,
        layer: 2 as LayerID,
        lockedEdges: [], lockedAngles: [], heights: [0],
        elementType: elementType as "drainage" | "canalPipe" | "waterPipe" | "cable",
        thickness: 0.10,
      }]);
      setDrawingShapeIdx(newIdx); setSelectedShapeIdx(newIdx);
    }

    // Scale mode
    if (mode === "scale") {
      const ptHit = hitTestPoint(world);
      if (ptHit && shapes[ptHit.shapeIdx].closed) {
        const si = ptHit.shapeIdx;
        const pts = shapes[si].points;
        saveHistory();
        setSelectedShapeIdx(si);
        let maxD = 0;
        let anchor = centroid(pts);
        for (const p of pts) {
          const d = distance(pts[ptHit.pointIdx], p);
          if (d > maxD) { maxD = d; anchor = { ...p }; }
        }
        const startDist = distance(anchor, world);
        setScaleCorner({
          shapeIdx: si, pointIdx: ptHit.pointIdx, anchor,
          startMouse: { ...world }, startPoints: pts.map(p => ({ ...p })),
          startDist: startDist < 1 ? 1 : startDist,
        });
        transformStartVizPiecesRef.current = shapes[si].calculatorInputs?.vizPieces
          ? (shapes[si].calculatorInputs!.vizPieces as GrassPiece[]).map(p => ({ ...p })) : null;
        return;
      }
      const edgeHit = hitTestEdge(world);
      if (edgeHit && shapes[edgeHit.shapeIdx].closed) {
        const si = edgeHit.shapeIdx;
        const pts = shapes[si].points;
        saveHistory();
        setSelectedShapeIdx(si);
        const j = (edgeHit.edgeIdx + 1) % pts.length;
        const eA = pts[edgeHit.edgeIdx], eB = pts[j];
        const dx = eB.x - eA.x, dy = eB.y - eA.y;
        const eLen = Math.sqrt(dx * dx + dy * dy);
        const ctr = centroid(pts);
        let nx = -dy / eLen, ny = dx / eLen;
        const eMid = midpoint(eA, eB);
        const toCenter = { x: ctr.x - eMid.x, y: ctr.y - eMid.y };
        if (nx * toCenter.x + ny * toCenter.y > 0) { nx = -nx; ny = -ny; }
        setScaleEdge({
          shapeIdx: si, edgeIdx: edgeHit.edgeIdx,
          startMouse: { ...world }, startPoints: pts.map(p => ({ ...p })),
          normal: { x: nx, y: ny }, edgeMid: eMid,
        });
        transformStartVizPiecesRef.current = shapes[si].calculatorInputs?.vizPieces
          ? (shapes[si].calculatorInputs!.vizPieces as GrassPiece[]).map(p => ({ ...p })) : null;
        return;
      }
      const shapeHit = hitTestShape(world);
      if (shapeHit !== null) { setSelectedShapeIdx(shapeHit); return; }
      setSelectedShapeIdx(null);
      setIsPanning(true); setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [mode, shapes, drawingShapeIdx, pathSegmentSideSelection, pathConfig, pan, zoom, shiftHeld, ctrlHeld, geodesyEnabled, getWorldPos, hitTestPoint, hitTestHeightPoint, hitTestEdge, hitTestShape, hitTestOpenEnd, hitTestPattern, hitTestPointForScale, hitTestEdgeForScale, hitTestGrassPieceEdge, worldToScreen, saveHistory, selectedShapeIdx, isOnActiveLayer, activeLayer, editingGeodesyCard, measureStart, measureEnd, hoveredPoint, hoveredEdge, selectedPoints, selectionRect, editingDim, rotateInfo, patternDragInfo, patternRotateInfo, shapeDragInfo, edgeDragInfo, t, pointOffsetAlongLinePick, viewFilter]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const world = getWorldPos(e);

    cancelAnimationFrame(mouseRafRef.current);
    mouseRafRef.current = requestAnimationFrame(() => {
      setMouseWorld(world);
    });

    // Activate edge drag from pending edge hit (polygons + linear, not paths): drag = move that edge only
    const pendingEdge = pendingEdgeAddRef.current;
    if (pendingEdge && (e.buttons & 1)) {
      const r = canvasRef.current!.getBoundingClientRect();
      const screenX = e.clientX - r.left, screenY = e.clientY - r.top;
      const dist = Math.sqrt((screenX - pendingEdge.startScreen.x) ** 2 + (screenY - pendingEdge.startScreen.y) ** 2);
      if (dist >= EDGE_CLICK_DRAG_THRESHOLD_PX) {
        const si = pendingEdge.shapeIdx;
        const shape = shapes[si];
        const pts = shape.points;
        const ei = pendingEdge.edgeIdx;
        const endIdx = shape.closed ? (ei + 1) % pts.length : ei + 1;
        const p0 = pts[ei];
        const p1 = pts[endIdx];
        if (p0 && p1) {
          saveHistory();
          setEdgeDragInfo({
            shapeIdx: si,
            edgeIdx: ei,
            startMouse: { ...pendingEdge.startWorld },
            startP0: { ...p0 },
            startP1: { ...p1 },
          });
        }
        pendingEdgeAddRef.current = null;
      }
    }

    // Activate pending right-click scale only when user drags (not on single click)
    const pending = pendingRightClickScaleRef.current;
    if (pending && (e.buttons & 2)) {
      const r = canvasRef.current!.getBoundingClientRect();
      const screenX = e.clientX - r.left, screenY = e.clientY - r.top;
      const dist = Math.sqrt((screenX - pending.startScreen.x) ** 2 + (screenY - pending.startScreen.y) ** 2);
      if (dist >= RIGHT_CLICK_SCALE_DRAG_THRESHOLD_PX) {
        rightClickScaleTriggeredRef.current = true;
        pendingRightClickScaleRef.current = null;
        if (pending.type === "corner" || pending.type === "edge") {
          const si = pending.data.shapeIdx;
          transformStartVizPiecesRef.current = shapes[si]?.calculatorInputs?.vizPieces
            ? (shapes[si].calculatorInputs!.vizPieces as GrassPiece[]).map(p => ({ ...p })) : null;
        }
        if (pending.type === "corner") {
          setScaleCorner(pending.data);
          const sc = pending.data;
          const currentDist = distance(sc.anchor, world);
          const ratio = currentDist / sc.startDist;
          const ax = sc.anchor.x, ay = sc.anchor.y;
          let newPts = sc.startPoints.map(pt => ({ x: ax + (pt.x - ax) * ratio, y: ay + (pt.y - ay) * ratio }));
          const magThreshold = SNAP_MAGNET_PX / zoom;
          const snap = snapMagnetShape(newPts, shapes, sc.shapeIdx, magThreshold);
          if (snap.didSnap) newPts = newPts.map(pt => ({ x: pt.x + snap.offset.x, y: pt.y + snap.offset.y }));
          setShapes(p => {
            const n = [...p]; const s = { ...n[sc.shapeIdx] }; s.points = newPts;
            if (transformStartVizPiecesRef.current && s.calculatorInputs?.vizPieces) {
              const snapOff = snap.didSnap ? snap.offset : { x: 0, y: 0 };
              const inputs = { ...s.calculatorInputs };
              inputs.vizPieces = transformStartVizPiecesRef.current.map(pc => ({
                ...pc,
                x: ax + (pc.x - ax) * ratio + snapOff.x,
                y: ay + (pc.y - ay) * ratio + snapOff.y,
                widthM: pc.widthM * ratio,
                lengthM: pc.lengthM * ratio,
              }));
              s.calculatorInputs = inputs;
            }
            n[sc.shapeIdx] = s; return n;
          });
          return;
        }
        if (pending.type === "edge") {
          setScaleEdge(pending.data);
          const se = pending.data;
          const dx = world.x - se.startMouse.x, dy = world.y - se.startMouse.y;
          const moveDist = dx * se.normal.x + dy * se.normal.y;
          const ei = se.edgeIdx, j = (ei + 1) % se.startPoints.length;
          const nx = se.normal.x, ny = se.normal.y;
          let newPts = se.startPoints.map((pt, idx) =>
            (idx === ei || idx === j) ? { x: pt.x + nx * moveDist, y: pt.y + ny * moveDist } : { ...pt }
          );
          const magThreshold = SNAP_MAGNET_PX / zoom;
          const snap = snapMagnetShape(newPts, shapes, se.shapeIdx, magThreshold);
          if (snap.didSnap) newPts = newPts.map(pt => ({ x: pt.x + snap.offset.x, y: pt.y + snap.offset.y }));
          setShapes(p => {
            const n = [...p]; const s = { ...n[se.shapeIdx] }; s.points = newPts; n[se.shapeIdx] = s;
            if (s.linkedShapeIdx != null && n[s.linkedShapeIdx]) n[s.linkedShapeIdx] = { ...n[s.linkedShapeIdx], points: [...newPts] };
            return n;
          });
          return;
        }
        const gd = pending.data;
        setGrassScaleInfo(gd);
        const piece = (shapes[gd.shapeIdx]?.calculatorInputs?.vizPieces as GrassPiece[])?.[gd.pieceIdx];
        if (piece) {
          const dx = world.x - gd.startMouse.x, dy = world.y - gd.startMouse.y;
          const lengthDir = piece.rotation === 90 ? { x: 0, y: 1 } : { x: 1, y: 0 };
          const moveDelta = dx * lengthDir.x + dy * lengthDir.y;
          const deltaM = toMeters(moveDelta);
          const newLength = Math.max(0.5, gd.edge === "length_end" ? gd.startLength + deltaM : gd.startLength - deltaM);
          setShapes(p => {
            const n = [...p]; const s = { ...n[gd.shapeIdx] };
            const inputs = { ...s.calculatorInputs };
            const newPieces = [...(inputs.vizPieces as GrassPiece[])];
            const updated = { ...newPieces[gd.pieceIdx], lengthM: newLength };
            if (gd.edge === "length_start") {
              updated.x = gd.startX + lengthDir.x * toPixels(deltaM);
              updated.y = gd.startY + lengthDir.y * toPixels(deltaM);
            }
            newPieces[gd.pieceIdx] = updated;
            inputs.vizPieces = newPieces;
            n[gd.shapeIdx] = { ...s, calculatorInputs: inputs };
            return n;
          });
        }
        return;
      }
    }

    if (isPanning && panStart) { setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y }); return; }

    if (selectionRect) {
      const r = canvasRef.current!.getBoundingClientRect();
      setSelectionRect(prev => prev ? { ...prev, endX: e.clientX - r.left, endY: e.clientY - r.top } : null);
      return;
    }

    if (grassScaleInfo) {
      const { shapeIdx, pieceIdx, edge, startMouse, startLength, startX, startY } = grassScaleInfo;
      const piece = (shapes[shapeIdx]?.calculatorInputs?.vizPieces as GrassPiece[])?.[pieceIdx];
      if (piece) {
        const dx = world.x - startMouse.x;
        const dy = world.y - startMouse.y;
        const lengthDir = piece.rotation === 90 ? { x: 0, y: 1 } : { x: 1, y: 0 };
        const moveDelta = dx * lengthDir.x + dy * lengthDir.y;
        const deltaM = toMeters(moveDelta);
        const newLength = Math.max(0.5, edge === "length_end"
          ? startLength + deltaM
          : startLength - deltaM);
        setShapes(p => {
          const n = [...p];
          const s = { ...n[shapeIdx] };
          const inputs = { ...s.calculatorInputs };
          const newPieces = [...(inputs.vizPieces as GrassPiece[])];
          const updated = { ...newPieces[pieceIdx], lengthM: newLength };
          if (edge === "length_start") {
            updated.x = startX + lengthDir.x * toPixels(deltaM);
            updated.y = startY + lengthDir.y * toPixels(deltaM);
          }
          newPieces[pieceIdx] = updated;
          inputs.vizPieces = newPieces;
          n[shapeIdx] = { ...s, calculatorInputs: inputs };
          return n;
        });
      }
      return;
    }

    if (draggingGrassPiece) {
      const { shapeIdx, pieceIdx, startMouse } = draggingGrassPiece;
      const shape = shapes[shapeIdx];
      const pieces = (shape?.calculatorInputs?.vizPieces as GrassPiece[]) ?? [];
      if (pieceIdx < pieces.length) {
        const piece = pieces[pieceIdx];
        const rawDx = world.x - startMouse.x;
        const rawDy = world.y - startMouse.y;
        const dirDeg = Number(shape?.calculatorInputs?.grassVizDirection ?? 0);
        const rad = (-dirDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = rawDx * cos - rawDy * sin;
        const dy = rawDx * sin + rawDy * cos;
        const movedPiece = { ...piece, x: piece.x + dx, y: piece.y + dy };
        const snapThreshold = toPixels(0.015);
        const { snappedPiece: snappedToPieces, nearEdge } = snapGrassPieceEdge(movedPiece, pieces, pieceIdx, snapThreshold);
        const { snappedPiece, alignedPolyEdges } = snapGrassPieceToPolygon(snappedToPieces, shape, snapThreshold);
        const groupIndices = getJoinedGroup(pieces, pieceIdx).length > 1 ? getJoinedGroup(pieces, pieceIdx) : [pieceIdx];
        const groupDx = snappedPiece.x - piece.x;
        const groupDy = snappedPiece.y - piece.y;
        setShapes(p => {
          const n = [...p];
          const s = { ...n[shapeIdx] };
          const inputs = { ...s.calculatorInputs };
          const newPieces = [...(inputs.vizPieces as GrassPiece[])];
          for (const idx of groupIndices) {
            newPieces[idx] = { ...newPieces[idx], x: newPieces[idx].x + groupDx, y: newPieces[idx].y + groupDy };
          }
          inputs.vizPieces = newPieces;
          n[shapeIdx] = { ...s, calculatorInputs: inputs };
          return n;
        });
        setDraggingGrassPiece({ ...draggingGrassPiece, startMouse: { ...world } });
        setGrassNearEdge(nearEdge ? { pieceIdx, otherPieceIdx: nearEdge.otherPieceIdx, edgeIdx: nearEdge.edgeIdx } : null);
        setGrassAlignedPolyEdges(alignedPolyEdges);
      }
      return;
    }

    if (patternDragInfo) {
      const shape = shapes[patternDragInfo.shapeIdx];
      if (patternDragInfo.isPath && shape && isPathElement(shape)) {
        const pathCenterline = (shape.calculatorInputs?.pathCenterline as Point[] | undefined);
        const segIdx = patternDragInfo.startPathSegmentIdx ?? 0;
        const bySeg = patternDragInfo.startPathPatternLongOffsetMBySegment ?? [];
        if (pathCenterline && pathCenterline.length >= 2 && segIdx < pathCenterline.length - 1) {
          const A = pathCenterline[segIdx]!;
          const B = pathCenterline[segIdx + 1]!;
          const segDx = B.x - A.x;
          const segDy = B.y - A.y;
          const len = Math.sqrt(segDx * segDx + segDy * segDy) || 1;
          const dir = { x: segDx / len, y: segDy / len };
          const dx = world.x - patternDragInfo.startMouse.x;
          const dy = world.y - patternDragInfo.startMouse.y;
          const deltaAlongPathPx = dx * dir.x + dy * dir.y;
          const deltaAlongPathM = toMeters(deltaAlongPathPx);
          const newOffsetM = (bySeg[segIdx] ?? 0) + deltaAlongPathM;
          setPathPatternLongOffsetPreview({ segmentIdx: segIdx, value: newOffsetM });
        }
      } else {
        const dx = world.x - patternDragInfo.startMouse.x;
        const dy = world.y - patternDragInfo.startMouse.y;
        const rawOffset = { x: patternDragInfo.startOffset.x + dx, y: patternDragInfo.startOffset.y + dy };
        if (shape) {
          const { snappedOffset, alignedEdges } = computePatternSnap(shape, rawOffset, PATTERN_SNAP_PX / zoom);
          setPatternDragPreview(snappedOffset);
          setPatternAlignedEdges(alignedEdges);
        } else {
          setPatternDragPreview(rawOffset);
          setPatternAlignedEdges([]);
        }
      }
      return;
    }

    if (patternRotateInfo) {
      const currAngle = Math.atan2(world.y - patternRotateInfo.center.y, world.x - patternRotateInfo.center.x);
      let deltaRad = currAngle - patternRotateInfo.startAngle;
      if (deltaRad > Math.PI) deltaRad -= 2 * Math.PI;
      if (deltaRad < -Math.PI) deltaRad += 2 * Math.PI;
      let newDir = patternRotateInfo.startDirectionDeg + (deltaRad * 180) / Math.PI;
      newDir = ((newDir % 360) + 360) % 360;
      newDir = snapPatternDirectionToBoundaryAngles(newDir, patternRotateInfo.boundaryAnglesDeg);
      setPatternRotatePreview(newDir);
      return;
    }

    // Edge drag (linear + polygon outlines): move only the two endpoints of that edge; adjacent edges follow.
    // Shift: slide along the edge axis (same length & direction as at drag start); no perpendicular motion.
    if (edgeDragInfo) {
      let dx = world.x - edgeDragInfo.startMouse.x;
      let dy = world.y - edgeDragInfo.startMouse.y;
      const tx0 = edgeDragInfo.startP1.x - edgeDragInfo.startP0.x;
      const ty0 = edgeDragInfo.startP1.y - edgeDragInfo.startP0.y;
      const len0 = Math.sqrt(tx0 * tx0 + ty0 * ty0);
      if (shiftHeld && len0 > 1e-6) {
        const ux = tx0 / len0;
        const uy = ty0 / len0;
        const dot = dx * ux + dy * uy;
        dx = dot * ux;
        dy = dot * uy;
      }
      const newP0 = { x: edgeDragInfo.startP0.x + dx, y: edgeDragInfo.startP0.y + dy };
      const newP1 = { x: edgeDragInfo.startP1.x + dx, y: edgeDragInfo.startP1.y + dy };
      const magThreshold = SNAP_MAGNET_PX / zoom;
      const edgeMid = midpoint(newP0, newP1);
      const snap = snapMagnet(edgeMid, shapes, edgeDragInfo.shapeIdx, magThreshold);
      let off = snap.didSnap ? { x: snap.snapped.x - edgeMid.x, y: snap.snapped.y - edgeMid.y } : { x: 0, y: 0 };
      if (shiftHeld && len0 > 1e-6) {
        const ux = tx0 / len0;
        const uy = ty0 / len0;
        const offDot = off.x * ux + off.y * uy;
        off = { x: offDot * ux, y: offDot * uy };
      }
      const finalP0 = { x: newP0.x + off.x, y: newP0.y + off.y };
      const finalP1 = { x: newP1.x + off.x, y: newP1.y + off.y };
      setShapes(p => {
        const n = [...p];
        const s = { ...n[edgeDragInfo.shapeIdx] };
        const np = [...s.points];
        const endIdx = s.closed ? (edgeDragInfo.edgeIdx + 1) % np.length : edgeDragInfo.edgeIdx + 1;
        np[edgeDragInfo.edgeIdx] = finalP0;
        np[endIdx] = finalP1;
        s.points = np;
        n[edgeDragInfo.shapeIdx] = s;
        if (s.linkedShapeIdx != null && n[s.linkedShapeIdx]) n[s.linkedShapeIdx] = { ...n[s.linkedShapeIdx], points: [...np] };
        return n;
      });
      return;
    }

    if (shapeDragInfo) {
      const dx = world.x - shapeDragInfo.startMouse.x;
      const dy = world.y - shapeDragInfo.startMouse.y;
      const movedPts = shapeDragInfo.startPoints.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
      const magThreshold = SNAP_MAGNET_PX / zoom;
      const snap = snapMagnetShape(movedPts, shapes, shapeDragInfo.shapeIdx, magThreshold);
      const finalPts = snap.didSnap ? movedPts.map(pt => ({ x: pt.x + snap.offset.x, y: pt.y + snap.offset.y })) : movedPts;
      const totalDx = finalPts[0].x - shapeDragInfo.startPoints[0].x;
      const totalDy = finalPts[0].y - shapeDragInfo.startPoints[0].y;
      setShapes(p => {
        const n = [...p];
        const s = { ...n[shapeDragInfo.shapeIdx] };
        s.points = finalPts;
        // Move vizPieces (grass) with element
        if (transformStartVizPiecesRef.current && s.calculatorInputs?.vizPieces) {
          const inputs = { ...s.calculatorInputs };
          inputs.vizPieces = transformStartVizPiecesRef.current.map(pc => ({ ...pc, x: pc.x + totalDx, y: pc.y + totalDy }));
          s.calculatorInputs = inputs;
        }
        n[shapeDragInfo.shapeIdx] = s;
        if (s.linkedShapeIdx != null && n[s.linkedShapeIdx]) n[s.linkedShapeIdx] = { ...n[s.linkedShapeIdx], points: [...finalPts] };
        // Garden: move children (Layer 2 inside garden)
        for (const child of gardenDragChildrenRef.current) {
          const cs = { ...n[child.idx] };
          cs.points = child.startPoints.map(pt => ({ x: pt.x + totalDx, y: pt.y + totalDy }));
          if (child.startVizPieces && cs.calculatorInputs?.vizPieces) {
            const ci = { ...cs.calculatorInputs };
            ci.vizPieces = child.startVizPieces.map(pc => ({ ...pc, x: pc.x + totalDx, y: pc.y + totalDy }));
            cs.calculatorInputs = ci;
          }
          n[child.idx] = cs;
        }
        return n;
      });
      return;
    }

    if (rotateInfo) {
      const angle = Math.atan2(world.y - rotateInfo.center.y, world.x - rotateInfo.center.x);
      const delta = angle - rotateInfo.startAngle;
      const cos = Math.cos(delta), sin = Math.sin(delta);
      const cx = rotateInfo.center.x, cy = rotateInfo.center.y;
      setShapes(p => {
        const n = [...p]; const s = { ...n[rotateInfo.shapeIdx] };
        s.points = rotateInfo.startPoints.map(pt => ({ x: cx + (pt.x - cx) * cos - (pt.y - cy) * sin, y: cy + (pt.x - cx) * sin + (pt.y - cy) * cos }));
        if (transformStartVizPiecesRef.current && s.calculatorInputs?.vizPieces) {
          const inputs = { ...s.calculatorInputs };
          inputs.vizPieces = transformStartVizPiecesRef.current.map(pc => ({
            ...pc,
            x: cx + (pc.x - cx) * cos - (pc.y - cy) * sin,
            y: cy + (pc.x - cx) * sin + (pc.y - cy) * cos,
          }));
          s.calculatorInputs = inputs;
        }
        n[rotateInfo.shapeIdx] = s; if (s.linkedShapeIdx != null && n[s.linkedShapeIdx]) n[s.linkedShapeIdx] = { ...n[s.linkedShapeIdx], points: [...s.points] }; return n;
      });
      return;
    }

    // Scale corner: proportional scaling from anchor
    if (scaleCorner) {
      const currentDist = distance(scaleCorner.anchor, world);
      const ratio = currentDist / scaleCorner.startDist;
      const ax = scaleCorner.anchor.x, ay = scaleCorner.anchor.y;
      let newPts = scaleCorner.startPoints.map(pt => ({
        x: ax + (pt.x - ax) * ratio,
        y: ay + (pt.y - ay) * ratio,
      }));
      const magThreshold = SNAP_MAGNET_PX / zoom;
      const draggedPt = newPts[scaleCorner.pointIdx];
      const toMouse = { x: world.x - ax, y: world.y - ay };
      const len = Math.sqrt(toMouse.x * toMouse.x + toMouse.y * toMouse.y);
      const snapDir = len > 1 ? { x: toMouse.x / len, y: toMouse.y / len } : undefined;
      const snap = snapMagnet(draggedPt, shapes, scaleCorner.shapeIdx, magThreshold, snapDir);
      const snapOff = snap.didSnap ? { x: snap.snapped.x - draggedPt.x, y: snap.snapped.y - draggedPt.y } : { x: 0, y: 0 };
      if (snap.didSnap) newPts = newPts.map(pt => ({ x: pt.x + snapOff.x, y: pt.y + snapOff.y }));
      setShapes(p => {
        const n = [...p]; const s = { ...n[scaleCorner.shapeIdx] }; s.points = newPts;
        if (transformStartVizPiecesRef.current && s.calculatorInputs?.vizPieces) {
          const inputs = { ...s.calculatorInputs };
          inputs.vizPieces = transformStartVizPiecesRef.current.map(pc => ({
            ...pc,
            x: ax + (pc.x - ax) * ratio + snapOff.x,
            y: ay + (pc.y - ay) * ratio + snapOff.y,
            widthM: pc.widthM * ratio,
            lengthM: pc.lengthM * ratio,
          }));
          s.calculatorInputs = inputs;
        }
        n[scaleCorner.shapeIdx] = s; return n;
      });
      return;
    }

    // Scale edge: push/pull one edge along its normal
    if (scaleEdge) {
      const dx = world.x - scaleEdge.startMouse.x;
      const dy = world.y - scaleEdge.startMouse.y;
      const moveDist = dx * scaleEdge.normal.x + dy * scaleEdge.normal.y;
      const ei = scaleEdge.edgeIdx;
      const pts = scaleEdge.startPoints;
      const j = (ei + 1) % pts.length;
      const nx = scaleEdge.normal.x, ny = scaleEdge.normal.y;
      let newPts = pts.map((pt, idx) => {
        if (idx === ei || idx === j) {
          return { x: pt.x + nx * moveDist, y: pt.y + ny * moveDist };
        }
        return { ...pt };
      });
      const magThreshold = SNAP_MAGNET_PX / zoom;
      const edgeMid = midpoint(newPts[ei], newPts[j]);
      const snapDir = moveDist >= 0 ? { x: nx, y: ny } : { x: -nx, y: -ny };
      const snap = snapMagnet(edgeMid, shapes, scaleEdge.shapeIdx, magThreshold, snapDir);
      if (snap.didSnap) {
        const off = { x: snap.snapped.x - edgeMid.x, y: snap.snapped.y - edgeMid.y };
        newPts = newPts.map(pt => ({ x: pt.x + off.x, y: pt.y + off.y }));
      }
      setShapes(p => { const n = [...p]; const s = { ...n[scaleEdge.shapeIdx] }; s.points = newPts; n[scaleEdge.shapeIdx] = s; if (s.linkedShapeIdx != null && n[s.linkedShapeIdx]) n[s.linkedShapeIdx] = { ...n[s.linkedShapeIdx], points: [...newPts] }; return n; });
      return;
    }

    if (arcDragInfo) {
      const r = canvasRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - r.left;
      const mouseY = e.clientY - r.top;
      arcDragPendingRef.current = { mouseX, mouseY };
      const run = () => {
        arcDragRafRef.current = null;
        const pending = arcDragPendingRef.current;
        if (!pending || !arcDragInfo) return;
        const sw = screenToWorld(pending.mouseX, pending.mouseY);
        const A = shapes[arcDragInfo.shapeIdx].points[arcDragInfo.edgeIdx];
        const B = shapes[arcDragInfo.shapeIdx].points[(arcDragInfo.edgeIdx + 1) % shapes[arcDragInfo.shapeIdx].points.length];
        const arcs = shapes[arcDragInfo.shapeIdx].edgeArcs?.[arcDragInfo.edgeIdx] ?? [];
        const dragOffsetX = arcDragInfo.startMouse.x - arcDragInfo.startArcPointWorld.x;
        const dragOffsetY = arcDragInfo.startMouse.y - arcDragInfo.startArcPointWorld.y;
        const targetWorld = { x: sw.x - dragOffsetX, y: sw.y - dragOffsetY };
        let { t, offset } = worldToArcPointOnCurve(A, B, arcs, arcDragInfo.arcPoint, targetWorld);
        const magThreshold = SNAP_MAGNET_PX / zoom;
        (globalThis as any).__arcSnapCallerEdge = { si: arcDragInfo.shapeIdx, ei: arcDragInfo.edgeIdx };
        const snapCache = arcSnapCacheRef.current ?? arcPointPositionCache;
        const snapped = snapArcPoint(A, B, t, offset, arcs, shapes, arcDragInfo.arcPoint.id, magThreshold, isOnActiveLayer, snapCache, arcSnapLockedTargetRef.current ?? undefined, targetWorld);
        if (snapped.didSnap) {
          t = snapped.t;
          offset = snapped.offset;
          if (snapped.lockedTarget) arcSnapLockedTargetRef.current = snapped.lockedTarget;
          // Note: When snapping across different edges, snapWorldPos may not exactly match bestTarget
          // because the current edge's curve shape may not pass through the target position.
          // The snap still places the arc point as close as possible.
        }
        setShapes(p => {
          const n = [...p];
          const s = { ...n[arcDragInfo.shapeIdx] };
          const edgeArcs = s.edgeArcs ? [...s.edgeArcs] : [];
          if (!edgeArcs[arcDragInfo.edgeIdx]) edgeArcs[arcDragInfo.edgeIdx] = [];
          const arcs = [...(edgeArcs[arcDragInfo.edgeIdx]!)];
          const idx = arcs.findIndex(ap => ap.id === arcDragInfo.arcPoint.id);
          if (idx >= 0) arcs[idx] = { ...arcs[idx], t, offset };
          edgeArcs[arcDragInfo.edgeIdx] = arcs;
          s.edgeArcs = edgeArcs;
          n[arcDragInfo.shapeIdx] = s;
          const dragEntry: LinkedEntry = { si: arcDragInfo.shapeIdx, pi: -1 as const, edgeIdx: arcDragInfo.edgeIdx, arcId: arcDragInfo.arcPoint.id };
          const group = linkedGroups.find(g => g.some(lp => linkedEntriesMatch(lp, dragEntry)));
          if (group) {
            const newWorldPos = arcPointToWorldOnCurve(
              n[arcDragInfo.shapeIdx].points[arcDragInfo.edgeIdx],
              n[arcDragInfo.shapeIdx].points[(arcDragInfo.edgeIdx + 1) % n[arcDragInfo.shapeIdx].points.length],
              n[arcDragInfo.shapeIdx].edgeArcs?.[arcDragInfo.edgeIdx] ?? [],
              { id: arcDragInfo.arcPoint.id, t, offset }
            );
            for (const lp of group) {
              if (linkedEntriesMatch(lp, dragEntry)) continue;
              if (isArcEntry(lp)) {
                const ls = { ...n[lp.si] };
                const lea = ls.edgeArcs ? [...ls.edgeArcs] : [];
                const lArcs = lea[lp.edgeIdx] ? [...lea[lp.edgeIdx]!] : [];
                const li = lArcs.findIndex(a => a.id === lp.arcId);
                if (li >= 0) {
                  const lA = ls.points[lp.edgeIdx];
                  const lB = ls.points[(lp.edgeIdx + 1) % ls.points.length];
                  const { t: lt, offset: lo } = worldToArcPointOnCurve(lA, lB, lArcs, lArcs[li]!, newWorldPos);
                  lArcs[li] = { ...lArcs[li], t: lt, offset: lo };
                  lea[lp.edgeIdx] = lArcs;
                  ls.edgeArcs = lea;
                  n[lp.si] = ls;
                }
              } else {
                const ls = { ...n[lp.si] }; const lpts = [...ls.points];
                lpts[lp.pi] = { ...newWorldPos }; ls.points = lpts; n[lp.si] = ls;
              }
            }
          }
          return n;
        });
      };
      if (arcDragRafRef.current === null) {
        arcDragRafRef.current = requestAnimationFrame(run);
      }
      return;
    }

    if (dragInfo) {
      let target = world;
      const shape = shapes[dragInfo.shapeIdx]; const pts = shape.points; const pi = dragInfo.pointIdx;
      const prevI = (pi - 1 + pts.length) % pts.length, nextI = (pi + 1) % pts.length;

      if (shiftHeld) {
        if (shape.closed || (pi > 0 && pi < pts.length - 1)) {
          target = snapShiftSmart(pts[prevI], pts[pi], pts[nextI], world);
        } else {
          const nb = pi === 0 ? pts[1] : pts[pts.length - 2];
          if (nb) target = snapTo45(nb, world);
        }
      }

      // Locked edge constraints: keep locked edge lengths
      if (shape.closed && shape.lockedEdges.length > 0) {
        // Find which adjacent edges are locked
        const prevEdgeIdx = prevI; // edge from prevI → pi
        const nextEdgeIdx = pi;   // edge from pi → nextI
        const prevEdgeLock = shape.lockedEdges.find(e => e.idx === prevEdgeIdx);
        const nextEdgeLock = shape.lockedEdges.find(e => e.idx === nextEdgeIdx);
        const prevLocked = !!prevEdgeLock;
        const nextLocked = !!nextEdgeLock;
        if (prevLocked || nextLocked) {
          const prevLen = prevLocked ? prevEdgeLock!.len : 0;
          const nextLen = nextLocked ? nextEdgeLock!.len : 0;
          target = constrainLockedEdges(
            target,
            prevLocked ? pts[prevI] : null, prevLen,
            nextLocked ? pts[nextI] : null, nextLen,
          );
        }
      }

      // Collinear snap: 180° with the line through two consecutive neighbors on the same boundary chain
      const ALIGNMENT_SNAP_PX = 10;
      const alignThreshold = ALIGNMENT_SNAP_PX / zoom;
      if (pts.length >= 3) {
        const colHit = bestCollinearVertexSnap(target, shape.closed, pts, pi, alignThreshold);
        if (colHit) target = { ...colHit.proj };
      }

      // Alignment snap: snap X/Y to closest aligned point when within threshold (horizontal/vertical guides)
      let bestDx = alignThreshold, bestDy = alignThreshold;
      let snapXVal: number | null = null, snapYVal: number | null = null;
      for (let si = 0; si < shapes.length; si++) {
        const pts = shapes[si].points;
        for (let pi = 0; pi < pts.length; pi++) {
          if (si === dragInfo.shapeIdx && pi === dragInfo.pointIdx) continue;
          const pt = pts[pi];
          const dx = Math.abs(target.x - pt.x);
          const dy = Math.abs(target.y - pt.y);
          if (dx < bestDx) { bestDx = dx; snapXVal = pt.x; }
          if (dy < bestDy) { bestDy = dy; snapYVal = pt.y; }
        }
      }
      if (snapXVal !== null) target.x = snapXVal;
      if (snapYVal !== null) target.y = snapYVal;

      const magThreshold = SNAP_MAGNET_PX / zoom;
      const snap = snapMagnet(target, shapes, dragInfo.shapeIdx, magThreshold);
      if (snap.didSnap) target = snap.snapped;
      setShapes(p => {
        const n = [...p]; const s = { ...n[dragInfo.shapeIdx] }; const np = [...s.points];
        np[dragInfo.pointIdx] = { x: target.x, y: target.y }; s.points = np; n[dragInfo.shapeIdx] = s;
        // Move linked entries (vertices and arc points) too
        const dragEntry: LinkedEntry = { si: dragInfo.shapeIdx, pi: dragInfo.pointIdx };
        const group = linkedGroups.find(g => g.some(lp => linkedEntriesMatch(lp, dragEntry)));
        if (group) {
          for (const lp of group) {
            if (linkedEntriesMatch(lp, dragEntry)) continue;
            if (isArcEntry(lp)) {
              if (n[lp.si]) {
                const ls = { ...n[lp.si] };
                const lea = ls.edgeArcs ? [...ls.edgeArcs] : [];
                const lArcs = lea[lp.edgeIdx] ? [...lea[lp.edgeIdx]!] : [];
                const li = lArcs.findIndex(a => a.id === lp.arcId);
                if (li >= 0) {
                  const lA = ls.points[lp.edgeIdx];
                  const lB = ls.points[(lp.edgeIdx + 1) % ls.points.length];
                  const { t: lt, offset: lo } = worldToArcPointOnCurve(lA, lB, lArcs, lArcs[li]!, target);
                  lArcs[li] = { ...lArcs[li], t: lt, offset: lo };
                  lea[lp.edgeIdx] = lArcs;
                  ls.edgeArcs = lea;
                  n[lp.si] = ls;
                }
              }
            } else if (n[lp.si]) {
              const ls = { ...n[lp.si] }; const lpts = [...ls.points];
              lpts[lp.pi] = { x: target.x, y: target.y }; ls.points = lpts; n[lp.si] = ls;
            }
          }
        }
        return n;
      });
      return;
    }

    if ((mode === "select" || mode === "scale" || geodesyEnabled) && drawingShapeIdx === null) {
      const hpHit = hitTestHeightPoint(world);
      setHoveredHeightPoint(hpHit);
      const pt = hitTestPoint(world); setHoveredPoint(pt);
      const arcHit = hitTestArcPointGlobal(world);
      setHoveredArcPoint(arcHit);
      setHoveredEdge(pt || arcHit ? null : hitTestEdge(world));
    }
  }, [isPanning, panStart, dragInfo, arcDragInfo, draggingGrassPiece, grassScaleInfo, patternDragInfo, patternRotateInfo, mode, shapes, shiftHeld, drawingShapeIdx, selectionRect, shapeDragInfo, edgeDragInfo, rotateInfo, scaleCorner, scaleEdge, getWorldPos, hitTestPoint, hitTestHeightPoint, hitTestEdge, hitTestArcPointGlobal, zoom, geodesyEnabled, saveHistory, arcPointPositionCache, linkedGroups, isOnActiveLayer]);

  const handleMouseUp = useCallback(() => {
    pendingRightClickScaleRef.current = null; // Clear pending if user released without dragging

    // Pending edge: click without drag = select only; drag = move that edge
    const pendingEdge = pendingEdgeAddRef.current;
    if (pendingEdge) {
      pendingEdgeAddRef.current = null;
      // Shape already selected; no point added — use right-click "Dodaj SquarePoint" to add
      return;
    }

    if (grassScaleInfo) {
      const si = grassScaleInfo.shapeIdx;
      setShapes(p => {
        const n = [...p];
        const s = n[si];
        if (s?.calculatorType === "grass" && s.calculatorInputs?.vizPieces) {
          const pieces = s.calculatorInputs.vizPieces as GrassPiece[];
          const cov = validateCoverage(s, pieces);
          const effectiveAreaM2 = (computeAutoFill(s, n).areaM2 ?? 0);
          const artificialGrassAreaM2 = getEffectiveTotalArea(pieces);
          const vizPiecesWithEffective = pieces.map((p, i) => {
            const { effectiveWidthM, effectiveLengthM } = getEffectivePieceDimensionsForInput(p, pieces, i);
            return { ...p, effectiveWidthM, effectiveLengthM };
          });
          const inputs = { ...s.calculatorInputs, vizPieces: vizPiecesWithEffective, effectiveAreaM2, artificialGrassAreaM2, jointsLength: String(cov.joinLengthM.toFixed(2)), trimLength: String(cov.trimLengthM.toFixed(2)) };
          n[si] = { ...s, calculatorInputs: inputs };
        }
        return n;
      });
      setGrassScaleInfo(null);
      return;
    }
    if (draggingGrassPiece) {
      const si = draggingGrassPiece.shapeIdx;
      setShapes(p => {
        const n = [...p];
        const s = n[si];
        if (s?.calculatorType === "grass" && s.calculatorInputs?.vizPieces) {
          const pieces = s.calculatorInputs.vizPieces as GrassPiece[];
          const cov = validateCoverage(s, pieces);
          const effectiveAreaM2 = (computeAutoFill(s, n).areaM2 ?? 0);
          const artificialGrassAreaM2 = getEffectiveTotalArea(pieces);
          const vizPiecesWithEffective = pieces.map((p, i) => {
            const { effectiveWidthM, effectiveLengthM } = getEffectivePieceDimensionsForInput(p, pieces, i);
            return { ...p, effectiveWidthM, effectiveLengthM };
          });
          const inputs = { ...s.calculatorInputs, vizPieces: vizPiecesWithEffective, effectiveAreaM2, artificialGrassAreaM2, jointsLength: String(cov.joinLengthM.toFixed(2)), trimLength: String(cov.trimLengthM.toFixed(2)) };
          n[si] = { ...s, calculatorInputs: inputs };
        }
        return n;
      });
    }
    setDraggingGrassPiece(null);
    setGrassNearEdge(null);
    setGrassAlignedPolyEdges([]);
    if (patternDragInfo) {
      const si = patternDragInfo.shapeIdx;
      const shape = shapes[si];
      if (patternDragInfo.isPath && shape && isPathElement(shape)) {
        const pathCenterline = shape.calculatorInputs?.pathCenterline as Point[] | undefined;
        const nSeg = pathCenterline ? pathCenterline.length - 1 : 0;
        const baseBySeg = patternDragInfo.startPathPatternLongOffsetMBySegment ?? Array.from({ length: nSeg }, () => 0);
        let finalBySeg = [...baseBySeg];
        if (pathPatternLongOffsetPreview != null && pathPatternLongOffsetPreview.segmentIdx < finalBySeg.length) {
          finalBySeg = [...finalBySeg];
          finalBySeg[pathPatternLongOffsetPreview.segmentIdx] = pathPatternLongOffsetPreview.value;
        }
        setShapes(p => {
          const n = [...p];
          const s = { ...n[si] };
          const inputs = { ...s.calculatorInputs, pathPatternLongOffsetMBySegment: finalBySeg };
          n[si] = { ...s, calculatorInputs: inputs };
          return n;
        });
      } else {
        const finalOffset = patternDragPreview ?? patternDragInfo.startOffset;
        setShapes(p => {
          const n = [...p];
          const s = { ...n[si] };
          const inputs = { ...s.calculatorInputs, vizOriginOffsetX: finalOffset.x, vizOriginOffsetY: finalOffset.y, vizAlignedEdges: patternAlignedEdges ?? [] };
          n[si] = { ...s, calculatorInputs: inputs };
          return n;
        });
      }
      setPatternDragInfo(null);
      setPatternDragPreview(null);
      setPathPatternLongOffsetPreview(null);
      setPatternAlignedEdges([]);
      return;
    }
    if (patternRotateInfo) {
      const si = patternRotateInfo.shapeIdx;
      const finalDir = patternRotatePreview ?? patternRotateInfo.startDirectionDeg;
      setShapes(p => {
        const n = [...p];
        const s = { ...n[si] };
        const inputs = patternRotateInfo.type === "grass"
          ? { ...s.calculatorInputs, grassVizDirection: finalDir }
          : { ...s.calculatorInputs, vizDirection: finalDir };
        n[si] = { ...s, calculatorInputs: inputs };
        return n;
      });
      setPatternRotateInfo(null);
      setPatternRotatePreview(null);
      return;
    }
    if (arcDragInfo) {
      arcSnapLockedTargetRef.current = null;
      arcSnapCacheRef.current = null;
      if (arcDragRafRef.current !== null) {
        cancelAnimationFrame(arcDragRafRef.current);
        arcDragRafRef.current = null;
      }
      setArcDragInfo(null);
      return;
    }
    if (selectionRect) {
      const minX = Math.min(selectionRect.startX, selectionRect.endX);
      const maxX = Math.max(selectionRect.startX, selectionRect.endX);
      const minY = Math.min(selectionRect.startY, selectionRect.endY);
      const maxY = Math.max(selectionRect.startY, selectionRect.endY);
      const selected: HitResult[] = [];
      const layerFilter = activeLayer === 3 ? isOnActiveLayerForScale : isOnActiveLayer;
      shapes.forEach((shape, si) => {
        if (!layerFilter(si) || !passesViewFilter(shape, viewFilter, activeLayer)) return;
        shape.points.forEach((p, pi) => {
          const sp = worldToScreen(p.x, p.y);
          if (sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY) selected.push({ shapeIdx: si, pointIdx: pi });
        });
      });
      setSelectedPoints(selected);
      setSelectionRect(null);
      return;
    }
    if (dragInfo && dragInfo.isOpenEnd) {
      const moved = distance(dragInfo.startMouse, mouseWorld);
      if (moved < 3) {
        const si = dragInfo.shapeIdx;
        if (dragInfo.openEndSide === "first") {
          setShapes(p => { const n = [...p]; const s = { ...n[si] }; s.points = [...s.points].reverse(); n[si] = s; if (s.linkedShapeIdx != null && n[s.linkedShapeIdx]) n[s.linkedShapeIdx] = { ...n[s.linkedShapeIdx], points: [...s.points] }; return n; });
        }
        setDrawingShapeIdx(si); setSelectedShapeIdx(si); setMode("freeDraw");
        setDragInfo(null); return;
      }
    }
    // When shape/rotate/scale ends: unlink coherent points that were separated
    if (shapeDragInfo || rotateInfo || scaleCorner || scaleEdge) {
      const th = SNAP_MAGNET_PX / zoom * (PIXELS_PER_METER / 80);
      setLinkedGroups(prev =>
        prev.filter(g => {
          const positions = g.map(lp => shapes[lp.si]?.points[lp.pi]).filter(Boolean);
          if (positions.length < 2) return false;
          let maxDist = 0;
          for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
              const d = distance(positions[i], positions[j]);
              if (d > maxDist) maxDist = d;
            }
          }
          return maxDist <= th;
        })
      );
    }
    setDragInfo(null); setIsPanning(false); setPanStart(null); setShapeDragInfo(null); setEdgeDragInfo(null); setRotateInfo(null); setScaleCorner(null); setScaleEdge(null);
    transformStartVizPiecesRef.current = null;
    gardenDragChildrenRef.current = [];
  }, [selectionRect, shapes, worldToScreen, dragInfo, mouseWorld, patternDragInfo, patternDragPreview, pathPatternLongOffsetPreview, patternAlignedEdges, patternRotateInfo, patternRotatePreview, shapeDragInfo, rotateInfo, scaleCorner, scaleEdge, isOnActiveLayer, isOnActiveLayerForScale, activeLayer, zoom, draggingGrassPiece, grassNearEdge, grassScaleInfo, viewFilter, arcDragInfo]);

  /** Touch support for mobile: map touch events to mouse handlers + pinch zoom */
  const touchToMouseEvent = useCallback((touch: { clientX: number; clientY: number }, button: number, buttons: number): React.MouseEvent<HTMLCanvasElement> => {
    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
      button,
      buttons,
      preventDefault: () => {},
      stopPropagation: () => {},
      target: canvasRef.current!,
    } as unknown as React.MouseEvent<HTMLCanvasElement>;
  }, []);

  const pinchRef = useRef<{ dist: number; centerX: number; centerY: number; zoom: number; pan: { x: number; y: number } } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const contextMenuHandlerRef = useRef<((e: React.MouseEvent) => void) | null>(null);
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_MOVE_THRESHOLD_PX = 8;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      if (e.cancelable) e.preventDefault();
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const centerX = (t0.clientX + t1.clientX) / 2;
      const centerY = (t0.clientY + t1.clientY) / 2;
      pinchRef.current = { dist, centerX, centerY, zoom, pan: { x: pan.x, y: pan.y } };
      return;
    }
    if (e.touches.length !== 1) return;
    if (e.cancelable) e.preventDefault();
    const t = e.touches[0];
    if (isMobile) {
      longPressStartRef.current = { clientX: t.clientX, clientY: t.clientY };
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        const pos = longPressStartRef.current;
        const onContextMenu = contextMenuHandlerRef.current;
        if (pos && onContextMenu) {
          handleMouseUp();
          const synthetic = touchToMouseEvent(pos, 0, 0);
          onContextMenu(synthetic);
        }
      }, LONG_PRESS_MS);
    }
    handleMouseDown(touchToMouseEvent({ clientX: t.clientX, clientY: t.clientY }, 0, 1));
  }, [touchToMouseEvent, handleMouseDown, handleMouseUp, zoom, pan, isMobile]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      if (e.cancelable) e.preventDefault();
      const pinch = pinchRef.current;
      if (!pinch) return;
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const centerX = (t0.clientX + t1.clientX) / 2;
      const centerY = (t0.clientY + t1.clientY) / 2;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const sx = centerX - r.left, sy = centerY - r.top;
      const ratio = dist / pinch.dist;
      const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinch.zoom * ratio));
      const zoomRatio = nz / pinch.zoom;
      const newPanX = sx - zoomRatio * (sx - pinch.pan.x);
      const newPanY = sy - zoomRatio * (sy - pinch.pan.y);
      setZoom(nz);
      setPan({ x: newPanX, y: newPanY });
      pinchRef.current = { dist, centerX, centerY, zoom: nz, pan: { x: newPanX, y: newPanY } };
      return;
    }
    if (e.touches.length !== 1) return;
    if (e.cancelable) e.preventDefault();
    if (isMobile && longPressTimerRef.current && longPressStartRef.current) {
      const t = e.touches[0];
      const dx = t.clientX - longPressStartRef.current.clientX;
      const dy = t.clientY - longPressStartRef.current.clientY;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_THRESHOLD_PX) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
    const t = e.touches[0];
    handleMouseMove(touchToMouseEvent({ clientX: t.clientX, clientY: t.clientY }, 0, 1));
  }, [touchToMouseEvent, handleMouseMove, isMobile]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      return;
    }
    if (e.touches.length === 1) {
      pinchRef.current = null;
      if (e.cancelable) e.preventDefault();
      const t = e.touches[0];
      handleMouseDown(touchToMouseEvent({ clientX: t.clientX, clientY: t.clientY }, 0, 1));
      return;
    }
    const t = e.changedTouches[0];
    if (!t) return;
    if (e.cancelable) e.preventDefault();
    pinchRef.current = null;
    if (isMobile && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    handleMouseUp();
  }, [handleMouseUp, handleMouseDown, touchToMouseEvent, isMobile]);

  const handleTouchCancel = useCallback((e: React.TouchEvent) => {
    if (!e.changedTouches[0]) return;
    if (e.cancelable) e.preventDefault();
    pinchRef.current = null;
    if (isMobile && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    handleMouseUp();
  }, [handleMouseUp, isMobile]);

  /** React's delegated touch listeners are passive; non-passive listeners allow preventDefault for drawing/pinch. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const opts: AddEventListenerOptions = { passive: false };
    const onStart = (ev: TouchEvent) => { handleTouchStart(ev as unknown as React.TouchEvent); };
    const onMove = (ev: TouchEvent) => { handleTouchMove(ev as unknown as React.TouchEvent); };
    const onEnd = (ev: TouchEvent) => { handleTouchEnd(ev as unknown as React.TouchEvent); };
    const onCancel = (ev: TouchEvent) => { handleTouchCancel(ev as unknown as React.TouchEvent); };
    canvas.addEventListener("touchstart", onStart, opts);
    canvas.addEventListener("touchmove", onMove, opts);
    canvas.addEventListener("touchend", onEnd, opts);
    canvas.addEventListener("touchcancel", onCancel, opts);
    return () => {
      canvas.removeEventListener("touchstart", onStart, opts);
      canvas.removeEventListener("touchmove", onMove, opts);
      canvas.removeEventListener("touchend", onEnd, opts);
      canvas.removeEventListener("touchcancel", onCancel, opts);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]);

  useEffect(() => () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    patternWheelHistorySavedRef.current = false;
  }, [selectedPattern?.shapeIdx, selectedPattern?.type]);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.buttons & 4) return; // Środkowy przycisk wciśnięty – nie zoomuj podczas panowania
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (e.shiftKey && mode === "select" && activeLayer === 3 && selectedPattern) {
      const si = selectedPattern.shapeIdx;
      const shape = shapes[si];
      if (shape && shape.layer === 2 && shape.closed) {
        const step = e.altKey ? 0.5 : 1;
        const deltaDeg = (e.deltaY < 0 ? 1 : -1) * step;
        if (selectedPattern.type === "grass" && shape.calculatorType === "grass" && (shape.calculatorInputs?.vizPieces?.length ?? 0) > 0) {
          if (!shape.calculatorInputs?.vizPatternAngleLocked) {
            e.preventDefault();
            const cur = Number(shape.calculatorInputs?.grassVizDirection ?? shape.calculatorInputs?.vizDirection ?? 0);
            let next = cur + deltaDeg;
            next = ((next % 360) + 360) % 360;
            next = snapPatternDirectionToBoundaryAngles(next, collectShapeBoundaryDirectionAnglesDeg(shape));
            if (!patternWheelHistorySavedRef.current) {
              saveHistory();
              patternWheelHistorySavedRef.current = true;
            }
            setShapes(p => {
              const n = [...p];
              const s = { ...n[si] };
              s.calculatorInputs = { ...s.calculatorInputs, grassVizDirection: next };
              n[si] = s;
              return n;
            });
            return;
          }
        }
        if (
          (selectedPattern.type === "slab" || selectedPattern.type === "cobblestone") &&
          (shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs" || shape.calculatorType === "paving") &&
          (shape.calculatorType === "paving"
            ? shape.calculatorInputs?.blockLengthCm && shape.calculatorInputs?.blockWidthCm
            : shape.calculatorInputs?.vizSlabWidth)
        ) {
          if (!shape.calculatorInputs?.vizPatternAngleLocked) {
            e.preventDefault();
            const cur = Number(shape.calculatorInputs?.vizDirection ?? 0);
            let next = cur + deltaDeg;
            next = ((next % 360) + 360) % 360;
            next = snapPatternDirectionToBoundaryAngles(next, collectShapeBoundaryDirectionAnglesDeg(shape));
            if (!patternWheelHistorySavedRef.current) {
              saveHistory();
              patternWheelHistorySavedRef.current = true;
            }
            setShapes(p => {
              const n = [...p];
              const s = { ...n[si] };
              s.calculatorInputs = { ...s.calculatorInputs, vizDirection: next };
              n[si] = s;
              return n;
            });
            return;
          }
        }
      }
    }

    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const f = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(z => {
      const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * f));
      const ratio = nz / z;
      setPan(p => ({ x: sx - ratio * (sx - p.x), y: sy - ratio * (sy - p.y) }));
      return nz;
    });
  }, [activeLayer, selectedPattern, shapes, mode, saveHistory, setShapes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (rightClickScaleTriggeredRef.current) { rightClickScaleTriggeredRef.current = false; return; }
    pendingRightClickScaleRef.current = null; // Single click = context menu, clear pending scale
    if (pathSegmentSideSelection) {
      setPathSegmentSideSelection(null);
      setSelectedShapeIdx(pathSegmentSideSelection.shapeIdx);
      return;
    }
    if (drawingShapeIdx !== null) {
      const s = shapes[drawingShapeIdx];
      if (s && s.points.length >= 2 && isPathElement(s)) {
        const pathPts = s.edgeArcs?.some(a => a && a.length > 0) ? getLinearElementPath(s) : s.points;
        const segCount = pathPts.length - 1;
        if (segCount >= 1) {
          setPathSegmentSideSelection({ shapeIdx: drawingShapeIdx, segmentSides: Array(segCount).fill(null) });
          setDrawingShapeIdx(null);
          setSelectedShapeIdx(drawingShapeIdx);
        }
        return;
      }
      if (s && s.points.length >= 2 && isLinearElement(s)) {
        const isGroundwork = isGroundworkLinear(s);
        if ((["Wall", "Fence", "Kerb", "Foundation"].includes(s.label || "") || isGroundwork) && !s.namePromptShown) setNamePromptShapeIdx(drawingShapeIdx);
        if (isGroundwork) {
          const totalLenM = polylineLengthMeters(s.points);
          const elementType = s.elementType as "drainage" | "canalPipe" | "waterPipe" | "cable";
          const isManual = isManualExcavation(getFoundationDiggingMethodFromExcavator(projectSettings.selectedExcavator), projectSettings.selectedExcavator);
          const results = computeGroundworkLinearResults({ lengthM: totalLenM, elementType, isManual });
          setShapes(p => {
            const n = [...p];
            const sh = {
              ...n[drawingShapeIdx],
              drawingFinished: true,
              calculatorType: "groundwork",
              calculatorSubType: elementType,
              calculatorInputs: { length: totalLenM, excavationMethod: isManual ? "manual" : "machinery" },
              calculatorResults: results,
            };
            n[drawingShapeIdx] = sh;
            return n;
          });
        } else if (isPolygonLinearElement(s)) {
          saveHistory();
          const pathPts = getLinearElementPath(s);
          const thicknessM = getPolygonThicknessM(s);
          const outline = computeThickPolylineClosed(pathPts, toPixels(thicknessM));
          if (outline.length >= 3) {
            const segLengths = polygonToSegmentLengths(outline);
            setShapes(p => {
              const n = [...p];
              const sh = n[drawingShapeIdx];
              const inputs: Record<string, unknown> = { ...sh.calculatorInputs, segmentLengths: segLengths };
              if (sh.elementType === "wall") {
                const defaultH = parseFloat(String(sh.calculatorInputs?.height ?? "1")) || 1;
                inputs.segmentHeights = segLengths.map(() => ({ startH: defaultH, endH: defaultH }));
              }
              n[drawingShapeIdx] = { ...sh, points: outline, closed: true, drawingFinished: true, calculatorInputs: inputs };
              return n;
            });
          } else {
            setShapes(p => { const n = [...p]; const sh = { ...n[drawingShapeIdx], drawingFinished: true }; n[drawingShapeIdx] = sh; return n; });
          }
        } else {
          setShapes(p => { const n = [...p]; const sh = { ...n[drawingShapeIdx], drawingFinished: true }; n[drawingShapeIdx] = sh; return n; });
        }
      }
      setDrawingShapeIdx(null); setMode("select"); return;
    }
    const w = getWorldPos(e);
    if (activeLayer === 5) {
      // Hit test adjustment areas (empty, overflow, overlap) — widened tolerance for easier clicking
      const adjHitTol = toPixels(0.15);
      for (let i = 0; i < adjustmentData.emptyAreas.length; i++) {
        if (pointInOrNearPolygon(w, adjustmentData.emptyAreas[i], adjHitTol)) {
          setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: -1, pointIdx: -1, edgeIdx: -1, adjustmentEmpty: { emptyAreaIdx: i } });
          return;
        }
      }
      for (const { shapeIdx: si, overflowPolygons } of adjustmentData.overflowAreas) {
        for (let i = 0; i < overflowPolygons.length; i++) {
          if (pointInOrNearPolygon(w, overflowPolygons[i], adjHitTol)) {
            setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: si, pointIdx: -1, edgeIdx: -1, adjustmentOverflow: { shapeIdx: si } });
            return;
          }
        }
      }
      for (let i = 0; i < adjustmentData.overlaps.length; i++) {
        const { shapeIdxA, shapeIdxB, overlapPolygon } = adjustmentData.overlaps[i];
        if (pointInOrNearPolygon(w, overlapPolygon, adjHitTol)) {
          setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: shapeIdxA, pointIdx: -1, edgeIdx: -1, adjustmentOverlap: { shapeIdxA, shapeIdxB, overlapIdx: i } });
          return;
        }
      }
      // Fall through to normal shape/point/edge hit if not on adjustment area
    }
    if (activeLayer === 4) {
      // Larger hit radius for groundwork so PPM on segment reliably gives edge menu (Usuń segment)
      const th = grassEdgeHitPxEffective / zoom + 4;
      const r = th * (PIXELS_PER_METER / 80);
      for (let si = shapes.length - 1; si >= 0; si--) {
        if (shapes[si].layer !== 2 || !isGroundworkLinear(shapes[si])) continue;
        if (!passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
        const pts = shapes[si].points;
        const ec = shapes[si].closed ? pts.length : pts.length - 1;
        for (let i = 0; i < ec; i++) {
          const j = (i + 1) % pts.length;
          const pr = projectOntoSegment(w, pts[i], pts[j]);
          if (pr.dist < r && pr.t > 0.02 && pr.t < 0.98) {
            setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: si, pointIdx: -1, edgeIdx: i, edgePos: pr.proj, edgeT: pr.t });
            return;
          }
        }
        if (hitTestLinearElement(w, shapes[si], zoom)) {
          setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: si, pointIdx: -1, edgeIdx: -1 });
          return;
        }
      }
      return;
    }
    if (activeLayer === 3) {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (canvasRect) {
        const rotHit = hitTestPatternRotationHandle(
          shapes,
          e.clientX - canvasRect.left,
          e.clientY - canvasRect.top,
          worldToScreen,
          viewFilter,
          activeLayer,
        );
        if (rotHit) {
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            shapeIdx: rotHit.shapeIdx,
            pointIdx: -1,
            edgeIdx: -1,
            patternRotationHandle: { patternType: rotHit.patternType },
          });
          return;
        }
      }
      // Same hit order as Layer 2: arc point, point, edge, shape — then linear/pattern
      const arcHit = hitTestArcPointGlobal(w);
      if (arcHit) {
        setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: arcHit.shapeIdx, pointIdx: -1, edgeIdx: arcHit.edgeIdx, arcPoint: arcHit.arcPoint });
        return;
      }
      const pt = hitTestPoint(w);
      if (pt) {
        setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: pt.shapeIdx, pointIdx: pt.pointIdx, edgeIdx: -1 });
        return;
      }
      const edgeForPoly = hitTestEdge(w);
      if (edgeForPoly) {
        const s = shapes[edgeForPoly.shapeIdx];
        let pathCenterlineEdgeIdx: number | undefined;
        let pathContinuationEnd: "first" | "last" | undefined;
        if (isPathElement(s) && s.calculatorInputs?.pathIsOutline && s.calculatorInputs?.pathCenterline) {
          const outline = s.points;
          const pathCenterline = s.calculatorInputs.pathCenterline as Point[];
          const tol = Math.max(4, 8 / zoom) * (PIXELS_PER_METER / 80);
          const n = outline.length;
          const A = outline[edgeForPoly.edgeIdx];
          const B = outline[(edgeForPoly.edgeIdx + 1) % n];
          const c0 = pathCenterline[0];
          const cLast = pathCenterline[pathCenterline.length - 1];
          if (distance(A, c0) < tol || distance(B, c0) < tol) pathContinuationEnd = "first";
          else if (distance(A, cLast) < tol || distance(B, cLast) < tol) pathContinuationEnd = "last";
          if (s.calculatorInputs?.pathCenterlineOriginal) {
            const n2 = outline.length / 2;
            if (edgeForPoly.edgeIdx < n2 - 1) pathCenterlineEdgeIdx = edgeForPoly.edgeIdx;
            else if (edgeForPoly.edgeIdx === n2 - 1) pathCenterlineEdgeIdx = n2 - 2;
            else if (edgeForPoly.edgeIdx >= n2 && edgeForPoly.edgeIdx <= 2 * n2 - 2) pathCenterlineEdgeIdx = 2 * n2 - 2 - edgeForPoly.edgeIdx;
          }
        }
        setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: edgeForPoly.shapeIdx, pointIdx: -1, edgeIdx: edgeForPoly.edgeIdx, edgePos: edgeForPoly.pos, edgeT: edgeForPoly.t, pathCenterlineEdgeIdx, pathContinuationEnd });
        return;
      }
      const patternHitForGrass = hitTestPattern(w);
      if (patternHitForGrass?.type === "grass" && (patternHitForGrass.grassJoinHit || patternHitForGrass.grassPieceIdx != null)) {
        const joinHit = patternHitForGrass.grassJoinHit;
        if (joinHit) {
          setContextMenu({
            x: e.clientX, y: e.clientY, shapeIdx: patternHitForGrass.shapeIdx, pointIdx: -1, edgeIdx: -1,
            ...(joinHit.isJoined
              ? { grassUnjoin: { pieceAIdx: joinHit.pieceAIdx, pieceBIdx: joinHit.pieceBIdx, edgeAIdx: joinHit.edgeAIdx } }
              : { grassJoin: { pieceAIdx: joinHit.pieceAIdx, pieceBIdx: joinHit.pieceBIdx, edgeAIdx: joinHit.edgeAIdx } }),
          });
        } else {
          setContextMenu({
            x: e.clientX, y: e.clientY, shapeIdx: patternHitForGrass.shapeIdx, pointIdx: -1, edgeIdx: -1,
            grassPieceIdx: patternHitForGrass.grassPieceIdx!,
          });
        }
        return;
      }
      const shapeHit = hitTestShape(w);
      if (shapeHit !== null && shapes[shapeHit].layer === 2) {
        setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: shapeHit, pointIdx: -1, edgeIdx: -1 });
        return;
      }
      // Check edge hit — so PPM on linear segment gives edge menu (Usuń segment), not shape menu
      const th = edgeHitThresholdEffective / zoom + 2;
      const r = th * (PIXELS_PER_METER / 80);
      for (let si = shapes.length - 1; si >= 0; si--) {
        if (shapes[si].layer !== 2 || !isLinearElement(shapes[si]) || isGroundworkLinear(shapes[si]) || !passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
        const pts = shapes[si].points;
        const ec = shapes[si].closed ? pts.length : pts.length - 1;
        for (let i = 0; i < ec; i++) {
          const j = (i + 1) % pts.length;
          const pr = projectOntoSegment(w, pts[i], pts[j]);
          if (pr.dist < r && pr.t > 0.02 && pr.t < 0.98) {
            setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: si, pointIdx: -1, edgeIdx: i, edgePos: pr.proj, edgeT: pr.t });
            return;
          }
        }
      }
      const edge = hitTestEdge(w);
      if (edge && isLinearElement(shapes[edge.shapeIdx])) {
        setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: edge.shapeIdx, pointIdx: -1, edgeIdx: edge.edgeIdx, edgePos: edge.pos, edgeT: edge.t });
        return;
      }
      for (let si = shapes.length - 1; si >= 0; si--) {
        const s = shapes[si];
        if (s.layer !== 2 || !isLinearElement(s) || isGroundworkLinear(s)) continue;
        if (hitTestLinearElement(w, s, zoom)) {
          setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: si, pointIdx: -1, edgeIdx: -1 });
          return;
        }
      }
      const patternHit = hitTestPattern(w);
      if (patternHit?.type === "grass") {
        const joinHit = patternHit.grassJoinHit;
        if (joinHit) {
          setContextMenu({
            x: e.clientX, y: e.clientY, shapeIdx: patternHit.shapeIdx, pointIdx: -1, edgeIdx: -1,
            ...(joinHit.isJoined
              ? { grassUnjoin: { pieceAIdx: joinHit.pieceAIdx, pieceBIdx: joinHit.pieceBIdx, edgeAIdx: joinHit.edgeAIdx } }
              : { grassJoin: { pieceAIdx: joinHit.pieceAIdx, pieceBIdx: joinHit.pieceBIdx, edgeAIdx: joinHit.edgeAIdx } }),
          });
        } else if (patternHit.grassPieceIdx != null) {
          setContextMenu({
            x: e.clientX, y: e.clientY, shapeIdx: patternHit.shapeIdx, pointIdx: -1, edgeIdx: -1,
            grassPieceIdx: patternHit.grassPieceIdx,
          });
        } else {
          setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: patternHit.shapeIdx, pointIdx: -1, edgeIdx: -1 });
        }
      } else if (patternHit) {
        setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: patternHit.shapeIdx, pointIdx: -1, edgeIdx: -1 });
      }
      return;
    }
    const hpHit = hitTestHeightPoint(w);
    if (hpHit) {
      setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: hpHit.shapeIdx, pointIdx: -1, edgeIdx: -1, heightPointIdx: hpHit.heightPointIdx });
      return;
    }
    // Arc point hit (selected shape only) — before edge so PPM on arc handle shows arc menu
    const arcHit = hitTestArcPointGlobal(w);
    if (arcHit) {
      setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: arcHit.shapeIdx, pointIdx: -1, edgeIdx: arcHit.edgeIdx, arcPoint: arcHit.arcPoint });
      return;
    }
    // Check point hit before edge — right-click on vertex should give point menu (Link all at point, etc.)
    const pt = hitTestPoint(w);
    if (pt) {
      setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: pt.shapeIdx, pointIdx: pt.pointIdx, edgeIdx: -1 });
      return;
    }
    const edge = hitTestEdge(w);
    if (edge) {
      const s = shapes[edge.shapeIdx];
      let pathCenterlineEdgeIdx: number | undefined;
      let pathContinuationEnd: "first" | "last" | undefined;
      if (isPathElement(s) && s.calculatorInputs?.pathIsOutline && s.calculatorInputs?.pathCenterline) {
        const outline = s.points;
        const pathCenterline = s.calculatorInputs.pathCenterline as Point[];
        const tol = Math.max(4, 8 / zoom) * (PIXELS_PER_METER / 80);
        const n = outline.length;
        const A = outline[edge.edgeIdx];
        const B = outline[(edge.edgeIdx + 1) % n];
        const c0 = pathCenterline[0];
        const cLast = pathCenterline[pathCenterline.length - 1];
        if (distance(A, c0) < tol || distance(B, c0) < tol) pathContinuationEnd = "first";
        else if (distance(A, cLast) < tol || distance(B, cLast) < tol) pathContinuationEnd = "last";
        if (s.calculatorInputs?.pathCenterlineOriginal) {
          const n2 = outline.length / 2;
          if (edge.edgeIdx < n2 - 1) pathCenterlineEdgeIdx = edge.edgeIdx;
          else if (edge.edgeIdx === n2 - 1) pathCenterlineEdgeIdx = n2 - 2;
          else if (edge.edgeIdx >= n2 && edge.edgeIdx <= 2 * n2 - 2) pathCenterlineEdgeIdx = 2 * n2 - 2 - edge.edgeIdx;
        }
      }
      setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: edge.shapeIdx, pointIdx: -1, edgeIdx: edge.edgeIdx, edgePos: edge.pos, edgeT: edge.t, pathCenterlineEdgeIdx, pathContinuationEnd });
      return;
    }
    // Prefer linear elements (fence, wall) over polygon interior when cursor is on them — e.g. fence on ogrodek
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (!isOnActiveLayer(si) || !passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
      if (isLinearElement(shapes[si]) && hitTestLinearElement(w, shapes[si], zoom)) {
        setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: si, pointIdx: -1, edgeIdx: -1 });
        return;
      }
    }
    const shapeHit = hitTestShape(w);
    if (shapeHit !== null) {
      if (shapes[shapeHit].layer === 2) {
        setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: shapeHit, pointIdx: -1, edgeIdx: -1 });
      } else if (shapes[shapeHit].layer === 1 && shapes[shapeHit].closed && shapes[shapeHit].points.length >= 3) {
        setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: shapeHit, pointIdx: -1, edgeIdx: -1, interiorWorldPos: w });
      }
    }
  }, [getWorldPos, hitTestPoint, hitTestHeightPoint, hitTestArcPointGlobal, hitTestEdge, hitTestShape, hitTestPattern, shapes, drawingShapeIdx, activeLayer, zoom, viewFilter, pathSegmentSideSelection, worldToScreen]);

  useEffect(() => { contextMenuHandlerRef.current = handleContextMenu; }, [handleContextMenu]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (activeLayer === 3 && selectedPattern) {
      setObjectCardShapeIdx(selectedPattern.shapeIdx);
      return;
    }
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return;
    const clickX = e.clientX - r.left, clickY = e.clientY - r.top;
    const hitW = 55, hitH = 22; // hit area around label (label text can be ~50px wide)
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (!isOnActiveLayer(si) || !passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
      const shape = shapes[si];
      const pts = shape.points;
      if (isLinearElement(shape) && isPolygonLinearElement(shape) && shape.closed && pts.length >= 4) {
        // Linear elements (Wall, Fence, etc.): labels drawn at centerline midpoint + offset 14 (linearElements.ts)
        const centerlinePts = polygonToCenterline(pts);
        if (centerlinePts.length < 2) continue;
        const segCount = centerlinePts.length - 1;
        for (let i = 0; i < segCount; i++) {
          const mid = midpoint(centerlinePts[i]!, centerlinePts[i + 1]!);
          const sm = worldToScreen(mid.x, mid.y);
          const nextPt = centerlinePts[i + 1]!;
          const dx = nextPt.x - mid.x, dy = nextPt.y - mid.y;
          const norm = Math.atan2(-dx, dy);
          const offset = 14;
          const lx = sm.x + Math.cos(norm) * offset;
          const ly = sm.y + Math.sin(norm) * offset;
          if (Math.abs(clickX - lx) < hitW && Math.abs(clickY - ly) < hitH) {
            const edgeIdx = i + 1; // segment i maps to outline edge i+1 (the "length" edge)
            const j = (edgeIdx + 1) % pts.length;
            setEditingDim({ shapeIdx: si, edgeIdx, x: e.clientX, y: e.clientY });
            setEditValue(toMeters(calcEdgeLengthWithArcs(pts[edgeIdx], pts[j], shape.edgeArcs?.[edgeIdx])).toFixed(3));
            setEditingDimMode("b");
            return;
          }
        }
        continue;
      }
      if (isLinearElement(shape) && !shape.closed && pts.length >= 2) {
        // Polyline linear elements: labels at midpoint + offset 14
        const linearOffset = 14;
        for (let i = 0; i < pts.length - 1; i++) {
          const mid = midpoint(pts[i], pts[i + 1]);
          const sm = worldToScreen(mid.x, mid.y);
          const dx = pts[i + 1].x - mid.x, dy = pts[i + 1].y - mid.y;
          const norm = Math.atan2(-dx, dy);
          const lx = sm.x + Math.cos(norm) * linearOffset;
          const ly = sm.y + Math.sin(norm) * linearOffset;
          if (Math.abs(clickX - lx) < hitW && Math.abs(clickY - ly) < hitH) {
            setEditingDim({ shapeIdx: si, edgeIdx: i, x: e.clientX, y: e.clientY });
            setEditValue(toMeters(calcEdgeLengthWithArcs(pts[i], pts[i + 1], shape.edgeArcs?.[i])).toFixed(3));
            setEditingDimMode("b");
            return;
          }
        }
        continue;
      }
      // Regular shapes: label at mid - norm * 28 (L2 closed: inward toward centroid, same as render ~L1477)
      const edgeLabelOffset = 28;
      const hasArcsForDimHit = !!(shape.edgeArcs?.some(a => a && a.length > 0));
      const ec = shape.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < ec; i++) {
        const j = (i + 1) % pts.length;
        const sa = worldToScreen(pts[i].x, pts[i].y), sb = worldToScreen(pts[j].x, pts[j].y);
        const mid = midpoint(sa, sb), norm = edgeNormalAngle(sa, sb);
        if (shape.layer === 1 && shape.closed && !(shape.edgeArcs?.[i]?.length)) {
          const out = edgeOutwardRadForL1Edge(shapes, si, i);
          if (out != null) {
            const lm = exteriorDimLabelScreenMid(sa, sb, out, boundaryDimL1ExteriorOffsetScreenPx(zoom));
            if (Math.abs(clickX - lm.x) < hitW && Math.abs(clickY - lm.y) < hitH) {
              setEditingDim({ shapeIdx: si, edgeIdx: i, x: e.clientX, y: e.clientY });
              setEditValue(toMeters(calcEdgeLengthWithArcs(pts[i], pts[j], shape.edgeArcs?.[i])).toFixed(3));
              setEditingDimMode("b");
              return;
            }
          }
          continue;
        }
        let lx: number, ly: number;
        if (shape.layer === 2 && shape.closed) {
          const effPts = hasArcsForDimHit ? getEffectivePolygon(shape) : pts;
          const ctr = effPts.length >= 3 ? labelAnchorInsidePolygon(effPts) : midpoint(pts[0], pts[1] ?? pts[0]);
          const edgeMidWorld = midpoint(pts[i], pts[j]);
          const frac = 0.92;
          const labelWorld = { x: ctr.x + frac * (edgeMidWorld.x - ctr.x), y: ctr.y + frac * (edgeMidWorld.y - ctr.y) };
          const sl = worldToScreen(labelWorld.x, labelWorld.y);
          lx = sl.x;
          ly = sl.y;
        } else {
          lx = mid.x - Math.cos(norm) * edgeLabelOffset;
          ly = mid.y - Math.sin(norm) * edgeLabelOffset;
        }
        if (Math.abs(clickX - lx) < hitW && Math.abs(clickY - ly) < hitH) {
          setEditingDim({ shapeIdx: si, edgeIdx: i, x: e.clientX, y: e.clientY });
          setEditValue(toMeters(calcEdgeLengthWithArcs(pts[i], pts[j], shape.edgeArcs?.[i])).toFixed(3));
          setEditingDimMode("b");
          return;
        }
      }
    }
  }, [shapes, worldToScreen, isOnActiveLayer, activeLayer, selectedPattern, viewFilter, zoom]);

  // ── Keyboard ───────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") {
          setEditingDim(null);
          setEditingGeodesyCard(null);
          setPointOffsetAlongLinePick(null);
          setPointOffsetAlongLineModal(null);
        }
        return;
      }
      // Layer shortcuts: 1–5 → switch layer
      if (["1", "2", "3", "4", "5"].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const layer = parseInt(e.key, 10) as ActiveLayer;
        if (layer !== activeLayer) switchLayerRef.current(layer);
        e.preventDefault();
        return;
      }
      // G → toggle geodesy
      if (e.key === "g" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setGeodesyEnabled(v => !v);
        if (geodesyEnabled) setEditingGeodesyCard(null);
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        if (arcDragInfo) {
          arcSnapLockedTargetRef.current = null;
          arcSnapCacheRef.current = null;
          if (arcDragRafRef.current !== null) {
            cancelAnimationFrame(arcDragRafRef.current);
            arcDragRafRef.current = null;
          }
          setArcDragInfo(null);
          return;
        }
        if (pathSegmentSideSelection) {
          setPathSegmentSideSelection(null);
          setSelectedShapeIdx(pathSegmentSideSelection.shapeIdx);
          return;
        }
        if (drawingShapeIdx !== null) {
          const s = shapes[drawingShapeIdx];
          if (s && s.points.length >= 2 && (isLinearElement(s) || isPathElement(s)) && (["Wall", "Fence", "Kerb", "Foundation"].includes(s.label || "") || isPathElement(s)) && !s.namePromptShown) {
            setNamePromptShapeIdx(drawingShapeIdx);
          }
          if (s && isPathElement(s)) setPathConfig(null);
          setDrawingShapeIdx(null); setMode("select"); return;
        }
        setEditingDim(null); setEditingGeodesyCard(null); setContextMenu(null); setProjectSummaryContextMenu(null);
        setPointOffsetAlongLinePick(null); setPointOffsetAlongLineModal(null);
        if (measureStart !== null) { setMeasureStart(null); setMeasureEnd(null); }
      }
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (editingDim || editingGeodesyCard) return; // don't delete while editing
        e.preventDefault();
        if (selectedPoints.length > 0) {
          saveHistory();
          setShapes(prev => {
            const ns = prev.map((s, si) => {
              const toRemove = selectedPoints.filter(sp => sp.shapeIdx === si).map(sp => sp.pointIdx).sort((a, b) => b - a);
              if (toRemove.length === 0) return s;
              const shape = { ...s }; const newPts = [...shape.points];
              toRemove.forEach(pi => newPts.splice(pi, 1));
              shape.points = newPts;
              if (s.closed && newPts.length < 3) shape.closed = false;
              return shape;
            });
            const minPts = (s: Shape) => isLinearElement(s) ? 2 : (s.closed ? 3 : 2);
            return ns.filter(s => s.points.length >= minPts(s));
          });
          setSelectedPoints([]); setSelectedShapeIdx(null); return;
        }
        if (selectedShapeIdx !== null && drawingShapeIdx === null) {
          saveHistory();
          setShapes(p => p.filter((_, i) => i !== selectedShapeIdx)); setSelectedShapeIdx(null);
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [mode, selectedShapeIdx, drawingShapeIdx, selectedPoints, saveHistory, undo, shapes, pathSegmentSideSelection, arcDragInfo, measureStart, activeLayer, geodesyEnabled]);

  // Canvas modals: Escape = close (grassTrim, adjustmentFill, adjustmentExtend, adjustmentSpread)
  useEffect(() => {
    if (!grassTrimModal && !adjustmentFillModal && !adjustmentExtendModal && !adjustmentSpreadModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (grassTrimModal) setGrassTrimModal(null);
        if (adjustmentFillModal) setAdjustmentFillModal(null);
        if (adjustmentExtendModal) setAdjustmentExtendModal(null);
        if (adjustmentSpreadModal) setAdjustmentSpreadModal(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [grassTrimModal, adjustmentFillModal, adjustmentExtendModal, adjustmentSpreadModal]);

  // ── Actions ────────────────────────────────────────────
  const addShape = (factory: (cx: number, cy: number, layer: LayerID) => Shape) => {
    saveHistory();
    const cx = (canvasSize.w / 2 - pan.x) / zoom, cy = (canvasSize.h / 2 - pan.y) / zoom;
    setShapes(p => [...p, factory(cx, cy, (activeLayer === 3 || activeLayer === 4 ? 2 : activeLayer) as LayerID)]);
    setSelectedShapeIdx(shapes.length); setMode("select"); setDrawingShapeIdx(null);
  };

  // Shape creation modal: Enter = confirm, Escape = close
  useEffect(() => {
    if (!shapeCreationModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShapeCreationModal(null);
      if (e.key === "Enter") {
        e.preventDefault();
        const { type } = shapeCreationModal;
        const label = (shapeInputs.name || "").trim() || (type === "square" ? t("project:toolbar_shape_square") : type === "rectangle" ? t("project:toolbar_shape_rectangle") : type === "triangle" ? t("project:toolbar_shape_triangle") : t("project:toolbar_shape_trapezoid"));
        if (type === "square") addShape((cx2, cy2, l) => ({ ...makeSquare(cx2, cy2, l, parseFloat(shapeInputs.side) || 4), label }));
        else if (type === "rectangle") addShape((cx2, cy2, l) => ({ ...makeRectangle(cx2, cy2, l, parseFloat(shapeInputs.width) || 6, parseFloat(shapeInputs.height) || 4), label }));
        else if (type === "triangle") addShape((cx2, cy2, l) => ({ ...makeTriangle(cx2, cy2, l, parseFloat(shapeInputs.base) || 5, parseFloat(shapeInputs.height) || 4), label }));
        else addShape((cx2, cy2, l) => ({ ...makeTrapezoid(cx2, cy2, l, parseFloat(shapeInputs.top) || 3, parseFloat(shapeInputs.bottom) || 6, parseFloat(shapeInputs.height) || 4), label }));
        setShapeCreationModal(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shapeCreationModal, shapeInputs, addShape, t]);

  const removePoint = (si: number, pi: number) => {
    removeEntryAndLinked({ si, pi });
  };

  /** Usuwa cały kształt warstwy 2 — jak Delete przy zaznaczonym elemencie w warstwie 2. */
  const deleteLayer2ElementFromContext = useCallback((si: number) => {
    saveHistory();
    setShapes(p => p.filter((_, i) => i !== si));
    setSelectedShapeIdx(null);
    setSelectedPattern(prev => (prev?.shapeIdx === si ? null : prev));
    setObjectCardShapeIdx(prev => (prev === si ? null : prev));
    setResultsModalShapeIdx(prev => (prev === si ? null : prev));
    setContextMenu(null);
  }, [saveHistory]);

  /** Remove an entry and all its linked entries (vertices + arc points). */
  const removeEntryAndLinked = (entry: LinkedEntry) => {
    const group = linkedGroups.find(g => g.some(lp => linkedEntriesMatch(lp, entry)));
    const toRemove = group ?? [entry];
    saveHistory();
    const removedShapeIndices = new Set<number>();
    setShapes(p => {
      let n = p.map(s => ({ ...s }));
      const byShape = new Map<number, { vertices: number[]; arcs: { edgeIdx: number; arcId: string }[] }>();
      for (const e of toRemove) {
        if (!byShape.has(e.si)) byShape.set(e.si, { vertices: [], arcs: [] });
        const b = byShape.get(e.si)!;
        if (isArcEntry(e)) b.arcs.push({ edgeIdx: e.edgeIdx, arcId: e.arcId });
        else b.vertices.push(e.pi);
      }
      for (const [osi, list] of byShape) {
        list.vertices.sort((a, b) => b - a);
        let s = n[osi];
        for (const pi of list.vertices) {
          const newPts = [...s.points]; newPts.splice(pi, 1);
          const minPts = isLinearElement(s) ? 2 : (s.closed ? 3 : 2);
          if (newPts.length < minPts) {
            removedShapeIndices.add(osi);
            break;
          }
          s = { ...s, points: newPts };
          const nh = [...(s.heights || Array(s.points.length + 1).fill(0))]; nh.splice(pi, 1); s.heights = nh;
          if (s.elementType === "wall" && s.calculatorInputs?.segmentHeights) {
            const inputs = { ...s.calculatorInputs };
            const segHeights = [...(inputs.segmentHeights as Array<{ startH: number; endH: number }>)];
            if (pi < segHeights.length) segHeights.splice(pi, 1);
            inputs.segmentHeights = segHeights;
            s.calculatorInputs = inputs;
          }
          s.lockedEdges = s.lockedEdges.filter(e => e.idx !== pi && e.idx !== (pi - 1 + s.points.length + 1) % (s.points.length + 1)).map(e => e.idx > pi ? { ...e, idx: e.idx - 1 } : e);
          s.lockedAngles = s.lockedAngles.filter(a => a !== pi).map(a => a > pi ? a - 1 : a);
        }
        if (!removedShapeIndices.has(osi)) {
          for (const { edgeIdx, arcId } of list.arcs) {
            const edgeArcs = s.edgeArcs ? [...s.edgeArcs] : [];
            const arcs = (edgeArcs[edgeIdx] ?? []).filter(a => a.id !== arcId);
            edgeArcs[edgeIdx] = arcs.length > 0 ? arcs : null;
            s = { ...s, edgeArcs };
          }
          n[osi] = s;
        }
      }
      return n.filter((_, i) => !removedShapeIndices.has(i));
    });
    setLinkedGroups(prev => {
      const filtered = prev.map(g => g.filter(p => !toRemove.some(r => linkedEntriesMatch(p, r)))).filter(g => g.length >= 2);
      if (removedShapeIndices.size === 0) return filtered;
      const removed = [...removedShapeIndices].sort((a, b) => a - b);
      return filtered.map(g => g.map(p => {
        if (isArcEntry(p)) {
          let newSi = p.si;
          for (const r of removed) if (r < newSi) newSi--;
          return newSi !== p.si ? { ...p, si: newSi } : p;
        }
        let newSi = p.si;
        for (const r of removed) if (r < newSi) newSi--;
        return newSi !== p.si ? { ...p, si: newSi } : p;
      }));
    });
    setContextMenu(null);
    if (removedShapeIndices.size > 0) {
      queueMicrotask(() => {
        setSelectedShapeIdx(prev => (prev !== null && removedShapeIndices.has(prev) ? null : prev !== null ? prev - [...removedShapeIndices].filter(r => r < prev).length : prev));
      });
    }
  };

  const insertPointOnEdge = (si: number, edgeIdx: number, pos: Point, t: number, heightOverride?: number) => {
    saveHistory();
    setShapes(p => {
      const n = [...p]; const s = { ...n[si] };
      const pts = s.points;
      const j = (edgeIdx + 1) % pts.length;
      const insertIdx = edgeIdx + 1;
      s.points = [...pts.slice(0, insertIdx), { ...pos }, ...pts.slice(insertIdx)];
      const heights = s.heights || pts.map(() => 0);
      const hNew = heightOverride !== undefined ? heightOverride : (heights[edgeIdx] ?? 0) * (1 - t) + (heights[j] ?? 0) * t;
      s.heights = [...heights.slice(0, insertIdx), hNew, ...heights.slice(insertIdx)];
      // Split edgeArcs when inserting on a curved edge
      const oldArcs = s.edgeArcs?.[edgeIdx];
      if (oldArcs && oldArcs.length > 0) {
        const first: ArcPoint[] = [];
        const second: ArcPoint[] = [];
        for (const a of oldArcs) {
          if (a.t < t) first.push({ ...a, t: t > 0.01 ? a.t / t : 0.5 });
          else second.push({ ...a, t: t < 0.99 ? (a.t - t) / (1 - t) : 0.5 });
        }
        const prevArcs = (s.edgeArcs || []).slice(0, edgeIdx);
        const restArcs = (s.edgeArcs || []).slice(edgeIdx + 1);
        s.edgeArcs = [...prevArcs, first.length ? first : null, second.length ? second : null, ...restArcs] as Shape["edgeArcs"];
      } else if (s.edgeArcs) {
        const prevArcs = s.edgeArcs.slice(0, edgeIdx + 1);
        const restArcs = s.edgeArcs.slice(edgeIdx + 1);
        s.edgeArcs = [...prevArcs, null, ...restArcs] as Shape["edgeArcs"];
      }
      if (s.elementType === "wall" && s.calculatorInputs?.segmentHeights) {
        const inputs = { ...s.calculatorInputs };
        const segHeights = [...(inputs.segmentHeights as Array<{ startH: number; endH: number }>)];
        if (insertIdx <= segHeights.length) {
          const prev = segHeights[edgeIdx];
          segHeights.splice(insertIdx, 0, prev ? { startH: hNew, endH: prev.endH } : { startH: hNew, endH: hNew });
          if (prev) segHeights[edgeIdx] = { ...prev, endH: hNew };
        }
        inputs.segmentHeights = segHeights;
        s.calculatorInputs = inputs;
      }
      s.lockedEdges = s.lockedEdges.map(e => e.idx >= insertIdx ? { ...e, idx: e.idx + 1 } : e);
      s.lockedAngles = s.lockedAngles.map(a => a >= insertIdx ? a + 1 : a);
      n[si] = s; return n;
    });
    setContextMenu(null);
  };

  const toggleLockEdge = (si: number, ei: number) => {
    setShapes(p => {
      const n = [...p]; const s = { ...n[si] };
      const locked = [...s.lockedEdges];
      const existing = locked.findIndex(e => e.idx === ei);
      if (existing >= 0) {
        locked.splice(existing, 1);
      } else {
        const pts = s.points;
        const j = (ei + 1) % pts.length;
        locked.push({ idx: ei, len: distance(pts[ei], pts[j]) });
      }
      n[si] = { ...s, lockedEdges: locked }; return n;
    });
  };

  /** Remove segment from linear element. If middle segment: split into two shapes. */
  const removeLinearSegment = (si: number, edgeIdx: number) => {
    const s = shapes[si];
    if (!s || !isLinearElement(s)) return;
    const pts = s.points;
    const nPts = pts.length;
    if (nPts < 3) return; // need at least 3 points to have a "middle" or removable segment

    saveHistory();

    // Polygon wall/kerb/foundation: map edge to segment and remove 4 points
    if (isPolygonLinearElement(s) && s.closed && nPts >= 6) {
      const segIdx = polygonEdgeToSegmentIndex(pts, edgeIdx);
      if (segIdx < 0) return;
      const newOutline = removeSegmentFromPolygonOutline(pts, segIdx);
      if (!newOutline || newOutline.length < 4) return;
      const segLengths = polygonToSegmentLengths(newOutline);
      setShapes(p => {
        const n = [...p];
        const sh = { ...n[si] };
        sh.points = newOutline;
        sh.calculatorInputs = { ...sh.calculatorInputs, segmentLengths: segLengths };
        if (sh.elementType === "wall" && sh.calculatorInputs?.segmentHeights) {
          const segH = sh.calculatorInputs.segmentHeights as Array<{ startH: number; endH: number }>;
          sh.calculatorInputs.segmentHeights = segH.filter((_, i) => i !== segIdx);
        }
        sh.calculatorResults = undefined;
        n[si] = sh;
        return n;
      });
      setContextMenu(null);
      return;
    }

    const nEdges = nPts - 1;
    if (edgeIdx < 0 || edgeIdx >= nEdges) return;

    if (edgeIdx === 0) {
      // Remove first segment: remove point 1
      setShapes(p => {
        const n = [...p]; const sh = { ...n[si] };
        const newPts = [...pts.slice(0, 1), ...pts.slice(2)];
        if (newPts.length < 2) return p;
        sh.points = newPts;
        sh.heights = (sh.heights || []).filter((_, i) => i !== 1);
        sh.lockedEdges = sh.lockedEdges.filter(e => e.idx !== 0).map(e => e.idx > 0 ? { ...e, idx: e.idx - 1 } : e);
        sh.lockedAngles = sh.lockedAngles.filter(a => a !== 1).map(a => a > 1 ? a - 1 : a);
        if (sh.elementType === "wall" && sh.calculatorInputs?.segmentHeights) {
          const segH = [...(sh.calculatorInputs.segmentHeights as Array<{ startH: number; endH: number }>)];
          segH.splice(0, 1);
          sh.calculatorInputs = { ...sh.calculatorInputs, segmentHeights: segH };
        }
        if (sh.calculatorInputs?.segmentLengths) {
          const segL = [...(sh.calculatorInputs.segmentLengths as number[])];
          segL.splice(0, 1);
          sh.calculatorInputs = { ...sh.calculatorInputs, segmentLengths: segL };
        }
        n[si] = sh; return n;
      });
    } else if (edgeIdx === nEdges - 1) {
      // Remove last segment: remove last point
      setShapes(p => {
        const n = [...p]; const sh = { ...n[si] };
        const newPts = pts.slice(0, -1);
        if (newPts.length < 2) return p;
        sh.points = newPts;
        sh.heights = (sh.heights || []).slice(0, -1);
        sh.lockedEdges = sh.lockedEdges.filter(e => e.idx !== edgeIdx).map(e => e.idx > edgeIdx ? e : e);
        sh.lockedAngles = sh.lockedAngles.filter(a => a !== nPts - 1);
        if (sh.elementType === "wall" && sh.calculatorInputs?.segmentHeights) {
          const segH = [...(sh.calculatorInputs.segmentHeights as Array<{ startH: number; endH: number }>)];
          segH.pop();
          sh.calculatorInputs = { ...sh.calculatorInputs, segmentHeights: segH };
        }
        if (sh.calculatorInputs?.segmentLengths) {
          const segL = [...(sh.calculatorInputs.segmentLengths as number[])];
          segL.pop();
          sh.calculatorInputs = { ...sh.calculatorInputs, segmentLengths: segL };
        }
        n[si] = sh; return n;
      });
    } else {
      // Middle segment: split into two shapes
      const pts1 = pts.slice(0, edgeIdx + 1);
      const pts2 = pts.slice(edgeIdx + 1);
      const baseLabel = s.label || (s.elementType === "fence" ? "Fence" : s.elementType === "wall" ? "Wall" : s.elementType === "kerb" ? "Kerb" : "Foundation");
      const shape2: Shape = {
        ...s,
        points: pts2,
        label: `${baseLabel} 2`,
        heights: (s.heights || []).slice(edgeIdx + 1),
        lockedEdges: (s.lockedEdges || []).filter(e => e.idx > edgeIdx).map(e => ({ ...e, idx: e.idx - edgeIdx - 1 })),
        lockedAngles: (s.lockedAngles || []).filter(a => a > edgeIdx).map(a => a - edgeIdx - 1),
        calculatorInputs: { ...s.calculatorInputs },
        calculatorResults: undefined,
      };
      if (s.elementType === "wall" && s.calculatorInputs?.segmentHeights) {
        const segH = s.calculatorInputs.segmentHeights as Array<{ startH: number; endH: number }>;
        shape2.calculatorInputs!.segmentHeights = segH.slice(edgeIdx + 1);
      }
      if (s.calculatorInputs?.segmentLengths) {
        const segL = s.calculatorInputs.segmentLengths as number[];
        shape2.calculatorInputs!.segmentLengths = segL.slice(edgeIdx + 1);
      }
      setShapes(p => {
        const n = [...p];
        const sh1 = { ...n[si] };
        sh1.points = pts1;
        sh1.heights = (sh1.heights || []).slice(0, edgeIdx + 1);
        sh1.lockedEdges = (sh1.lockedEdges || []).filter(e => e.idx <= edgeIdx);
        sh1.lockedAngles = (sh1.lockedAngles || []).filter(a => a <= edgeIdx);
        if (sh1.elementType === "wall" && sh1.calculatorInputs?.segmentHeights) {
          const segH = sh1.calculatorInputs.segmentHeights as Array<{ startH: number; endH: number }>;
          sh1.calculatorInputs = { ...sh1.calculatorInputs, segmentHeights: segH.slice(0, edgeIdx) };
        }
        if (sh1.calculatorInputs?.segmentLengths) {
          const segL = sh1.calculatorInputs.segmentLengths as number[];
          sh1.calculatorInputs = { ...sh1.calculatorInputs, segmentLengths: segL.slice(0, edgeIdx) };
        }
        sh1.calculatorResults = undefined;
        n[si] = sh1;
        n.splice(si + 1, 0, shape2);
        return n;
      });
      setSelectedShapeIdx(si + 1);
    }
    setContextMenu(null);
  };

  /** Align linear segment endpoint to nearest wall/kerb/plot so they meet without overlapping. */
  const alignLinearSegmentTo = (si: number, edgeIdx: number, targetType: "wall" | "kerb" | "polygon") => {
    const s = shapes[si];
    if (!s || !isLinearElement(s)) return;
    const pts = s.points;
    if (edgeIdx < 0 || edgeIdx >= pts.length - 1) return;

    const p0 = pts[edgeIdx], p1 = pts[edgeIdx + 1];
    const segMid = midpoint(p0, p1);
    const searchRadius = 2 * (PIXELS_PER_METER / 80); // ~2.5m in world units

    let bestRef: { otherSi: number; anchor: Point; moveOurPoint: number } | null = null;
    let bestDist = Infinity;

    const considerLayer = (idx: number) => {
      const sl = shapes[idx].layer;
      return activeLayer === 1 || activeLayer === 2 ? sl === activeLayer : (sl === 1 || sl === 2);
    };
    for (let osi = 0; osi < shapes.length; osi++) {
      if (osi === si) continue;
      if (!considerLayer(osi) || !passesViewFilter(shapes[osi], viewFilter, activeLayer)) continue;
      const o = shapes[osi];

      if (targetType === "polygon") {
        if (o.elementType !== "polygon" || !o.closed || o.points.length < 3) continue;
        for (let vi = 0; vi < o.points.length; vi++) {
          const v = o.points[vi];
          const d = distance(segMid, v);
          if (d < searchRadius && d < bestDist) {
            bestDist = d;
            const moveOur = distance(p0, v) < distance(p1, v) ? 0 : 1;
            bestRef = { otherSi: osi, anchor: { ...v }, moveOurPoint: moveOur };
          }
        }
      } else {
        const want = targetType === "wall" ? "wall" : "kerb";
        if (o.elementType !== want || !isLinearElement(o)) continue;
        const opts = o.points;
        if (opts.length < 2) continue;
        const endFirst = opts[0], endLast = opts[opts.length - 1];
        for (const anchor of [endFirst, endLast]) {
          const d = distance(segMid, anchor);
          if (d < searchRadius && d < bestDist) {
            bestDist = d;
            const moveOur = distance(p0, anchor) < distance(p1, anchor) ? 0 : 1;
            bestRef = { otherSi: osi, anchor: { ...anchor }, moveOurPoint: moveOur };
          }
        }
      }
    }

    if (!bestRef) return;
    saveHistory();

    setShapes(p => {
      const n = [...p];
      const sh = { ...n[si] };
      const newPts = [...sh.points];
      const ptIdx = bestRef!.moveOurPoint === 0 ? edgeIdx : edgeIdx + 1;
      newPts[ptIdx] = { ...bestRef!.anchor };
      sh.points = newPts;
      sh.calculatorResults = undefined;
      n[si] = sh;

      return n;
    });
    setContextMenu(null);
  };

  // Find ALL nearby points from other shapes to link with
  const findAllNearbyPoints = (si: number, pi: number): { si: number; pi: number }[] => {
    const pt = shapes[si].points[pi];
    const th = SNAP_MAGNET_PX / zoom * (PIXELS_PER_METER / 80);
    const out: { si: number; pi: number }[] = [];
    for (let osi = 0; osi < shapes.length; osi++) {
      if (osi === si) continue;
      if (shapes[osi].layer !== activeLayer) continue;
      for (let opi = 0; opi < shapes[osi].points.length; opi++) {
        if (distance(pt, shapes[osi].points[opi]) < th) out.push({ si: osi, pi: opi });
      }
    }
    return out;
  };

  // Find ALL edges that point touches (for "link point to edge" - insert new vertex on each)
  const findAllEdgesPointTouches = (si: number, pi: number): { si: number; edgeIdx: number; pos: Point; t: number }[] => {
    const pt = shapes[si].points[pi];
    const th = SNAP_MAGNET_PX / zoom * (PIXELS_PER_METER / 80);
    const out: { si: number; edgeIdx: number; pos: Point; t: number }[] = [];
    for (let osi = 0; osi < shapes.length; osi++) {
      if (osi === si) continue;
      if (shapes[osi].layer !== activeLayer) continue;
      const s = shapes[osi];
      const pts = s.points;
      const edgeCount = s.closed ? pts.length : pts.length - 1;
      for (let ei = 0; ei < edgeCount; ei++) {
        const j = (ei + 1) % pts.length;
        const arcs = s.edgeArcs?.[ei];
        const { dist, t, proj } = arcs && arcs.length > 0
          ? projectOntoArcEdge(pt, pts[ei], pts[j], arcs, 24)
          : projectOntoSegment(pt, pts[ei], pts[j]);
        if (dist < th && t > 0.01 && t < 0.99) out.push({ si: osi, edgeIdx: ei, pos: proj, t });
      }
    }
    return out;
  };

  const findNearbyPoint = (si: number, pi: number): { si: number; pi: number } | null => {
    const all = findAllNearbyPoints(si, pi);
    return all.length > 0 ? all[0] : null;
  };

  const findPointOnEdgeOfOtherShape = (si: number, pi: number): { si: number; edgeIdx: number } | null => {
    const all = findAllEdgesPointTouches(si, pi);
    return all.length > 0 ? { si: all[0].si, edgeIdx: all[0].edgeIdx } : null;
  };

  /** Find edges of other shapes that a given world position touches (for arc point link-to-edge). */
  const findAllEdgesPositionTouches = (worldPos: Point, excludeSi: number): { si: number; edgeIdx: number; pos: Point; t: number }[] => {
    const th = SNAP_MAGNET_PX / zoom * (PIXELS_PER_METER / 80);
    const out: { si: number; edgeIdx: number; pos: Point; t: number }[] = [];
    for (let osi = 0; osi < shapes.length; osi++) {
      if (osi === excludeSi) continue;
      if (shapes[osi].layer !== activeLayer) continue;
      const s = shapes[osi];
      const pts = s.points;
      const edgeCount = s.closed ? pts.length : pts.length - 1;
      for (let ei = 0; ei < edgeCount; ei++) {
        const j = (ei + 1) % pts.length;
        const arcs = s.edgeArcs?.[ei];
        const { dist, t, proj } = arcs && arcs.length > 0
          ? projectOntoArcEdge(worldPos, pts[ei], pts[j], arcs, 24)
          : projectOntoSegment(worldPos, pts[ei], pts[j]);
        if (dist < th && t > 0.01 && t < 0.99) out.push({ si: osi, edgeIdx: ei, pos: proj, t });
      }
    }
    return out;
  };

  /** Find all nearby linkable entries (vertices + arc points) for a given world position. Uses curve position for arcpoints to match visible handles. */
  const findNearbyLinkableEntries = (worldPos: Point, excludeArcId?: string): LinkedEntry[] => {
    const th = SNAP_MAGNET_PX / zoom * (PIXELS_PER_METER / 80);
    const out: LinkedEntry[] = [];
    for (let osi = 0; osi < shapes.length; osi++) {
      if (shapes[osi].layer !== activeLayer) continue;
      const s = shapes[osi];
      for (let pi = 0; pi < s.points.length; pi++) {
        if (distance(worldPos, s.points[pi]) < th) out.push({ si: osi, pi });
      }
      if (s.edgeArcs) {
        for (let ei = 0; ei < s.edgeArcs.length; ei++) {
          const arcs = s.edgeArcs[ei];
          if (!arcs) continue;
          const edgeA = s.points[ei];
          const edgeB = s.points[(ei + 1) % s.points.length];
          for (const a of arcs) {
            if (a.id === excludeArcId) continue;
            const apWorld = arcPointToWorldOnCurve(edgeA, edgeB, arcs, a);
            if (distance(worldPos, apWorld) < th) out.push({ si: osi, pi: -1 as const, edgeIdx: ei, arcId: a.id });
          }
        }
      }
    }
    return out;
  };

  /** Link an arc point with nearby entries and edges. For edges: adds arc point only if no arcpoint already there. Moves nearby arcpoints to source position. */
  const linkArcPoint = (si: number, edgeIdx: number, ap: ArcPoint) => {
    const A = shapes[si].points[edgeIdx];
    const B = shapes[si].points[(edgeIdx + 1) % shapes[si].points.length];
    const arcs = shapes[si].edgeArcs?.[edgeIdx] ?? [];
    const sourcePos = arcPointToWorldOnCurve(A, B, arcs, ap);
    const nearby = findNearbyLinkableEntries(sourcePos, ap.id);
    const edges = findAllEdgesPositionTouches(sourcePos, si);
    if (nearby.length === 0 && edges.length === 0) return;
    saveHistory();
    const arcEntry: LinkedEntry = { si, pi: -1 as const, edgeIdx, arcId: ap.id };
    const toLink: LinkedEntry[] = [arcEntry];
    const nearbyArcEdges = new Set(nearby.filter(isArcEntry).map(lp => `${lp.si},${lp.edgeIdx}`));
    const LINK_SAME_POSITION_TOLERANCE_M = 0.002;
    const samePosTh = toPixels(LINK_SAME_POSITION_TOLERANCE_M);
    setShapes(p => {
      let n = p.map(s => ({ ...s }));
      for (const lp of nearby) {
        if (isArcEntry(lp) && n[lp.si]) {
          const s = n[lp.si];
          const lea = s.edgeArcs ? [...s.edgeArcs] : [];
          const lArcs = lea[lp.edgeIdx] ? [...lea[lp.edgeIdx]!] : [];
          const li = lArcs.findIndex(a => a.id === lp.arcId);
          if (li >= 0) {
            const lA = s.points[lp.edgeIdx];
            const lB = s.points[(lp.edgeIdx + 1) % s.points.length];
            const targetPos = arcPointToWorldOnCurve(lA, lB, lArcs, lArcs[li]!);
            if (distance(sourcePos, targetPos) < samePosTh) {
              toLink.push(lp);
              continue;
            }
            const { t, offset } = worldToArcPointOnCurve(lA, lB, lArcs, lArcs[li]!, sourcePos);
            lArcs[li] = { ...lArcs[li]!, t, offset };
            lea[lp.edgeIdx] = lArcs;
            n[lp.si] = { ...s, edgeArcs: lea };
          }
        } else if (!isArcEntry(lp) && n[lp.si]) {
          const s = n[lp.si]; const pts = [...s.points];
          const targetPos = pts[lp.pi];
          if (distance(sourcePos, targetPos) < samePosTh) {
            toLink.push(lp);
            continue;
          }
          pts[lp.pi] = { ...sourcePos }; n[lp.si] = { ...s, points: pts };
        }
        toLink.push(lp);
      }
      for (const e of edges) {
        if (nearbyArcEdges.has(`${e.si},${e.edgeIdx}`)) continue;
        const s = n[e.si];
        if (!s || s.points.length < 2) continue;
        const pts = s.points;
        const edgeA = pts[e.edgeIdx];
        const edgeB = pts[(e.edgeIdx + 1) % pts.length];
        const existingArcs = s.edgeArcs?.[e.edgeIdx] ?? [];
        const placeholder = { id: "__temp__", t: 0.5, offset: 0 };
        const { t, offset } = worldToArcPointOnCurve(edgeA, edgeB, [...existingArcs, placeholder], placeholder, e.pos);
        const newArc: ArcPoint = { id: crypto.randomUUID(), t, offset };
        const edgeArcs = s.edgeArcs ? [...s.edgeArcs] : [];
        if (!edgeArcs[e.edgeIdx]) edgeArcs[e.edgeIdx] = [];
        const arcList = [...(edgeArcs[e.edgeIdx]!), newArc].sort((a, b) => a.t - b.t);
        edgeArcs[e.edgeIdx] = arcList;
        n[e.si] = { ...s, edgeArcs };
        toLink.push({ si: e.si, pi: -1 as const, edgeIdx: e.edgeIdx, arcId: newArc.id });
      }
      return n;
    });
    setLinkedGroups(prev => {
      const key = (p: LinkedEntry) => isArcEntry(p) ? `${p.si},arc,${p.edgeIdx},${p.arcId}` : `${p.si},${p.pi}`;
      const merged = new Map<string, LinkedEntry>();
      for (const lp of toLink) merged.set(key(lp), lp);
      const toRemove: number[] = [];
      for (let gi = 0; gi < prev.length; gi++) {
        for (const p of prev[gi]) {
          if (merged.has(key(p))) {
            for (const q of prev[gi]) merged.set(key(q), q);
            toRemove.push(gi);
            break;
          }
        }
      }
      const rest = prev.filter((_, i) => !toRemove.includes(i));
      const newGroup = Array.from(merged.values());
      return newGroup.length >= 2 ? [...rest, newGroup] : rest;
    });
    setContextMenu(null);
  };

  /** Link the clicked point with ALL nearby points and ALL edges (creates vertices on edges). */
  const linkAllAtPoint = (si1: number, pi1: number) => {
    const nearby = findAllNearbyPoints(si1, pi1);
    const edges = findAllEdgesPointTouches(si1, pi1);
    if (nearby.length === 0 && edges.length === 0) return;
    saveHistory();
    const sourcePos = { ...shapes[si1].points[pi1] };
    const toLink: { si: number; pi: number }[] = [{ si: si1, pi: pi1 }];
    // Track insertions per shape so we can shift linkedGroup indices
    const insertions: { si: number; insertIdx: number }[] = [];
    setShapes(p => {
      let n = p.map(s => ({ ...s }));
      for (const np of nearby) {
        const s = n[np.si];
        if (s) {
          const pts = [...s.points];
          pts[np.pi] = { ...sourcePos };
          n[np.si] = { ...s, points: pts };
        }
        toLink.push(np);
      }
      const byShape = new Map<number, { edgeIdx: number; pos: Point; t: number }[]>();
      for (const e of edges) {
        if (!byShape.has(e.si)) byShape.set(e.si, []);
        byShape.get(e.si)!.push({ edgeIdx: e.edgeIdx, pos: e.pos, t: e.t });
      }
      for (const [osi, list] of byShape) {
        list.sort((a, b) => b.edgeIdx - a.edgeIdx);
        for (const e of list) {
          const s = n[osi];
          if (!s || s.points.length < 2) continue;
          if (!s.closed && s.points.length < 2) continue;
          const pts = s.points;
          const j = s.closed ? (e.edgeIdx + 1) % pts.length : e.edgeIdx + 1;
          const insertIdx = e.edgeIdx + 1;
          const newPts = [...pts.slice(0, insertIdx), { ...e.pos }, ...pts.slice(insertIdx)];
          const heights = s.heights || pts.map(() => 0);
          const hNew = (heights[e.edgeIdx] ?? 0) * (1 - e.t) + (heights[j] ?? 0) * e.t;
          const newHeights = [...heights.slice(0, insertIdx), hNew, ...heights.slice(insertIdx)];
          const updates: Partial<Shape> = { points: newPts, heights: newHeights };
          // Split edgeArcs: arcs on the split edge get distributed between the two new edges
          const oldArcs = s.edgeArcs?.[e.edgeIdx];
          if (oldArcs && oldArcs.length > 0) {
            const first: ArcPoint[] = [];
            const second: ArcPoint[] = [];
            for (const a of oldArcs) {
              if (a.t < e.t) first.push({ ...a, t: e.t > 0.01 ? a.t / e.t : 0.5 });
              else second.push({ ...a, t: e.t < 0.99 ? (a.t - e.t) / (1 - e.t) : 0.5 });
            }
            const prevArcs = (s.edgeArcs || []).slice(0, e.edgeIdx);
            const restArcs = (s.edgeArcs || []).slice(e.edgeIdx + 1);
            updates.edgeArcs = [...prevArcs, first.length ? first : null, second.length ? second : null, ...restArcs] as Shape["edgeArcs"];
          } else if (s.edgeArcs) {
            // No arcs on split edge, but other edges have arcs — insert null for the new edge
            const prevArcs = s.edgeArcs.slice(0, e.edgeIdx + 1);
            const restArcs = s.edgeArcs.slice(e.edgeIdx + 1);
            updates.edgeArcs = [...prevArcs, null, ...restArcs] as Shape["edgeArcs"];
          }
          if (s.elementType === "wall" && s.calculatorInputs?.segmentHeights) {
            const inputs = { ...s.calculatorInputs };
            const segHeights = [...(inputs.segmentHeights as Array<{ startH: number; endH: number }> ?? [])];
            if (insertIdx <= segHeights.length) {
              const prev = segHeights[e.edgeIdx];
              segHeights.splice(insertIdx, 0, prev ? { startH: hNew, endH: prev.endH } : { startH: hNew, endH: hNew });
              if (prev) segHeights[e.edgeIdx] = { ...prev, endH: hNew };
            }
            inputs.segmentHeights = segHeights;
            updates.calculatorInputs = inputs;
          }
          updates.lockedEdges = (s.lockedEdges || []).map(e2 => e2.idx >= insertIdx ? { ...e2, idx: e2.idx + 1 } : e2);
          updates.lockedAngles = (s.lockedAngles || []).map(a => a >= insertIdx ? a + 1 : a);
          n[osi] = { ...s, ...updates };
          toLink.push({ si: osi, pi: insertIdx });
          insertions.push({ si: osi, insertIdx });
        }
      }
      return n;
    });
    setLinkedGroups(prev => {
      // First, shift indices in existing groups to account for inserted points
      let adjusted = prev.map(g => g.map(p => {
        let pi = p.pi;
        for (const ins of insertions) {
          if (p.si === ins.si && pi >= ins.insertIdx) pi++;
        }
        return pi !== p.pi ? { si: p.si, pi } : p;
      }));
      const key = (p: { si: number; pi: number }) => `${p.si},${p.pi}`;
      const merged = new Map<string, { si: number; pi: number }>();
      for (const lp of toLink) merged.set(key(lp), lp);
      const toRemove: number[] = [];
      for (let gi = 0; gi < adjusted.length; gi++) {
        for (const p of adjusted[gi]) {
          if (merged.has(key(p))) {
            for (const q of adjusted[gi]) merged.set(key(q), q);
            toRemove.push(gi);
            break;
          }
        }
      }
      const rest = adjusted.filter((_, i) => !toRemove.includes(i));
      const newGroup = Array.from(merged.values());
      return newGroup.length >= 2 ? [...rest, newGroup] : rest;
    });
    setContextMenu(null);
  };

  const linkPoints = (si1: number, pi1: number, si2: number, pi2: number) => {
    // Snap second point to first point's position
    saveHistory();
    setShapes(p => {
      const n = [...p]; const s2 = { ...n[si2] }; const np = [...s2.points];
      np[pi2] = { ...n[si1].points[pi1] }; s2.points = np; n[si2] = s2; return n;
    });
    setLinkedGroups(prev => {
      const ng = prev.map(g => [...g]);
      const g1 = ng.findIndex(g => g.some(p => p.si === si1 && p.pi === pi1));
      const g2 = ng.findIndex(g => g.some(p => p.si === si2 && p.pi === pi2));
      if (g1 >= 0 && g2 >= 0 && g1 === g2) return prev;
      if (g1 >= 0 && g2 >= 0) {
        ng[g1] = [...ng[g1], ...ng[g2]];
        ng.splice(g2, 1);
        return ng;
      }
      if (g1 >= 0) { ng[g1].push({ si: si2, pi: pi2 }); return ng; }
      if (g2 >= 0) { ng[g2].push({ si: si1, pi: pi1 }); return ng; }
      return [...ng, [{ si: si1, pi: pi1 }, { si: si2, pi: pi2 }]];
    });
    setContextMenu(null);
  };

  const linkPointToEdge = (si1: number, pi1: number, si2: number, edgeIdx: number) => {
    saveHistory();
    const insertPos = { ...shapes[si1].points[pi1] };
    setShapes(p => {
      const n = [...p]; const s = { ...n[si2] }; const np = [...s.points];
      np.splice(edgeIdx + 1, 0, insertPos);
      const nh = [...(s.heights || Array(s.points.length).fill(0))]; nh.splice(edgeIdx + 1, 0, 0);
      s.points = np; s.heights = nh;
      if (s.elementType === "wall" && s.calculatorInputs) {
        const inputs = { ...s.calculatorInputs };
        const segHeights = [...(inputs.segmentHeights as Array<{ startH: number; endH: number }> ?? [])];
        const defH = parseFloat(String(inputs.height ?? "1")) || 1;
        const newSeg = { startH: defH, endH: defH };
        if (segHeights.length === np.length - 2) {
          segHeights.splice(edgeIdx + 1, 0, newSeg);
          inputs.segmentHeights = segHeights;
        } else {
          inputs.segmentHeights = Array.from({ length: np.length - 1 }, () => ({ startH: defH, endH: defH }));
        }
        s.calculatorInputs = inputs;
      }
      s.lockedEdges = s.lockedEdges.filter(e => e.idx !== edgeIdx).map(e => e.idx > edgeIdx ? { ...e, idx: e.idx + 1 } : e);
      s.lockedAngles = s.lockedAngles.map(a => a > edgeIdx ? a + 1 : a);
      n[si2] = s; return n;
    });
    const newPi = edgeIdx + 1;
    setLinkedGroups(prev => {
      const ng = prev.map(g => [...g]);
      const g1 = ng.findIndex(g => g.some(p => p.si === si1 && p.pi === pi1));
      if (g1 >= 0) { ng[g1].push({ si: si2, pi: newPi }); return ng; }
      return [...ng, [{ si: si1, pi: pi1 }, { si: si2, pi: newPi }]];
    });
    setContextMenu(null);
  };

  const unlinkEntry = (entry: LinkedEntry) => {
    setLinkedGroups(prev => {
      return prev.map(g => g.filter(p => !linkedEntriesMatch(p, entry))).filter(g => g.length >= 2);
    });
    setContextMenu(null);
  };
  const unlinkPoint = (si: number, pi: number) => unlinkEntry({ si, pi });

  const linkedEntriesMatch = (a: LinkedEntry, b: LinkedEntry): boolean => {
    if (isArcEntry(a) && isArcEntry(b)) return a.si === b.si && a.edgeIdx === b.edgeIdx && a.arcId === b.arcId;
    if (!isArcEntry(a) && !isArcEntry(b)) return a.si === b.si && a.pi === b.pi;
    return false;
  };

  const isPointLinked = (si: number, pi: number): boolean => {
    return linkedGroups.some(g => g.some(p => p.si === si && p.pi === pi && !isArcEntry(p)));
  };

  const isArcPointLinked = (si: number, edgeIdx: number, arcId: string): boolean => {
    return linkedGroups.some(g => g.some(p => isArcEntry(p) && p.si === si && p.edgeIdx === edgeIdx && p.arcId === arcId));
  };

  const getLinkedEntryWorldPos = (entry: LinkedEntry, shapesArr: Shape[]): Point | null => {
    const s = shapesArr[entry.si];
    if (!s) return null;
    if (isArcEntry(entry)) {
      const pts = s.points;
      const arcs = s.edgeArcs?.[entry.edgeIdx];
      if (!arcs) return null;
      const ap = arcs.find(a => a.id === entry.arcId);
      if (!ap) return null;
      const A = pts[entry.edgeIdx];
      const B = pts[(entry.edgeIdx + 1) % pts.length];
      return arcPointToWorldOnCurve(A, B, arcs, ap);
    }
    return s.points[entry.pi] ?? null;
  };

  const applyDimEdit = () => {
    if (!editingDim) return;
    saveHistory();
    const val = parseFloat(editValue);
    if (isNaN(val) || val <= 0) { setEditingDim(null); return; }
    const { shapeIdx: si, edgeIdx: ei } = editingDim;
    const pts = shapes[si].points;
    const j = (ei + 1) % pts.length;
    const A = pts[ei], B = pts[j];
    const cur = distance(A, B);
    if (cur < 0.001) { setEditingDim(null); return; }
    const targetPx = toPixels(val);
    const ux = (B.x - A.x) / cur, uy = (B.y - A.y) / cur;
    setShapes(p => {
      const ns = [...p]; const s = { ...ns[si] }; const np = [...s.points];
      let newA: Point, newB: Point;
      if (editingDimMode === "a") {
        newA = { x: B.x - ux * targetPx, y: B.y - uy * targetPx };
        newB = { ...B };
      } else if (editingDimMode === "b") {
        newA = { ...A };
        newB = { x: A.x + ux * targetPx, y: A.y + uy * targetPx };
      } else {
        const half = targetPx / 2;
        const M = midpoint(A, B);
        newA = { x: M.x - ux * half, y: M.y - uy * half };
        newB = { x: M.x + ux * half, y: M.y + uy * half };
      }
      np[ei] = newA;
      np[j] = newB;
      const moveLinked = (pi: number, newPos: Point) => {
        const dragEntry: LinkedEntry = { si, pi };
        const group = linkedGroups.find(g => g.some(lp => linkedEntriesMatch(lp, dragEntry)));
        if (group) {
          for (const lp of group) {
            if (linkedEntriesMatch(lp, dragEntry)) continue;
            if (ns[lp.si]) {
              if (lp.si === si && !isArcEntry(lp)) { np[lp.pi] = { ...newPos }; continue; }
              const ls = { ...ns[lp.si] };
              if (isArcEntry(lp)) {
                const lea = ls.edgeArcs ? [...ls.edgeArcs] : [];
                const lArcs = lea[lp.edgeIdx] ? [...lea[lp.edgeIdx]!] : [];
                const li = lArcs.findIndex(a => a.id === lp.arcId);
                if (li >= 0) {
                  const lA = ls.points[lp.edgeIdx];
                  const lB = ls.points[(lp.edgeIdx + 1) % ls.points.length];
                  const { t: lt, offset: lo } = worldToArcPointOnCurve(lA, lB, lArcs, lArcs[li]!, newPos);
                  lArcs[li] = { ...lArcs[li], t: lt, offset: lo };
                  lea[lp.edgeIdx] = lArcs;
                  ls.edgeArcs = lea;
                  ns[lp.si] = ls;
                }
              } else {
                const lpts = [...ls.points];
                lpts[lp.pi] = { ...newPos };
                ls.points = lpts;
                ns[lp.si] = ls;
              }
            }
          }
        }
      };
      if (editingDimMode === "a") moveLinked(ei, newA);
      else if (editingDimMode === "b") moveLinked(j, newB);
      else { moveLinked(ei, newA); moveLinked(j, newB); }
      s.points = np;
      ns[si] = s;
      if (s.linkedShapeIdx != null && ns[s.linkedShapeIdx]) ns[s.linkedShapeIdx] = { ...ns[s.linkedShapeIdx], points: [...np] };
      return ns;
    });
    setEditingDim(null);
  };

  const applyPointOffsetAlongLine = () => {
    const m = pointOffsetAlongLineModal;
    if (!m) return;
    const val = parseFloat(pointOffsetAlongLineValue);
    if (isNaN(val) || val <= 0) {
      setPointOffsetAlongLineModal(null);
      return;
    }
    saveHistory();
    setShapes(p => {
      const n = [...p];
      const si = m.moveShapeIdx;
      const pi = m.movePointIdx;
      const s = { ...n[si] };
      const np = [...s.points];
      const anchor = p[m.anchorShapeIdx]?.points[m.anchorPointIdx];
      const cur = np[pi];
      if (!anchor || !cur) return p;
      const vx = cur.x - anchor.x;
      const vy = cur.y - anchor.y;
      const L = Math.hypot(vx, vy);
      if (L < 1e-9) return p;
      const ux = vx / L;
      const uy = vy / L;
      const newPxLen = toPixels(val);
      const newPos = { x: anchor.x + ux * newPxLen, y: anchor.y + uy * newPxLen };
      np[pi] = newPos;
      const dragEntry: LinkedEntry = { si, pi };
      const group = linkedGroups.find(g => g.some(lp => linkedEntriesMatch(lp, dragEntry)));
      if (group) {
        for (const lp of group) {
          if (linkedEntriesMatch(lp, dragEntry)) continue;
          if (!n[lp.si]) continue;
          if (lp.si === si && !isArcEntry(lp)) {
            np[lp.pi] = { ...newPos };
            continue;
          }
          const ls = { ...n[lp.si] };
          if (isArcEntry(lp)) {
            const lea = ls.edgeArcs ? [...ls.edgeArcs] : [];
            const lArcs = lea[lp.edgeIdx] ? [...lea[lp.edgeIdx]!] : [];
            const li = lArcs.findIndex(a => a.id === lp.arcId);
            if (li >= 0) {
              const lA = ls.points[lp.edgeIdx];
              const lB = ls.points[(lp.edgeIdx + 1) % ls.points.length];
              const { t: lt, offset: lo } = worldToArcPointOnCurve(lA, lB, lArcs, lArcs[li]!, newPos);
              lArcs[li] = { ...lArcs[li], t: lt, offset: lo };
              lea[lp.edgeIdx] = lArcs;
              ls.edgeArcs = lea;
              n[lp.si] = ls;
            }
          } else {
            const lpts = [...ls.points];
            lpts[lp.pi] = { ...newPos };
            ls.points = lpts;
            n[lp.si] = ls;
          }
        }
      }
      s.points = np;
      n[si] = s;
      if (s.linkedShapeIdx != null && n[s.linkedShapeIdx]) {
        n[s.linkedShapeIdx] = { ...n[s.linkedShapeIdx], points: [...np] };
      }
      return n;
    });
    setPointOffsetAlongLineModal(null);
  };

  const applyHeightEdit = (fromBlur = false) => {
    if (fromBlur && skipBlurRef.current) return;
    if (!editingGeodesyCard) return;
    const { cardInfo } = editingGeodesyCard;
    saveHistory();
    setShapes(p => {
      let n = [...p];
      for (let rowIdx = 0; rowIdx < cardInfo.entries.length; rowIdx++) {
        const valCm = parseFloat(heightValues[rowIdx] ?? "");
        if (isNaN(valCm)) continue;
        const val = valCm / 100;
        const entry = cardInfo.entries[rowIdx];
        for (const pt of entry.points) {
          if (pt.isVertex && pt.pointIdx != null) {
            const s = { ...n[pt.shapeIdx] };
            const nh = [...(s.heights || s.points.map(() => 0))];
            while (nh.length < s.points.length) nh.push(0);
            nh[pt.pointIdx] = val;
            s.heights = nh;
            n[pt.shapeIdx] = s;
            const group = linkedGroups.find(g => g.some(lp => lp.si === pt.shapeIdx && lp.pi === pt.pointIdx));
            if (group) {
              for (const lp of group) {
                if (lp.si === pt.shapeIdx && lp.pi === pt.pointIdx) continue;
                if (n[lp.si]?.layer === 1) {
                  const ls = { ...n[lp.si] };
                  const lh = [...(ls.heights || ls.points.map(() => 0))];
                  while (lh.length < ls.points.length) lh.push(0);
                  lh[lp.pi] = val;
                  ls.heights = lh;
                  n[lp.si] = ls;
                }
              }
            }
          } else if (!pt.isVertex && pt.heightPointIdx != null) {
            const s = { ...n[pt.shapeIdx] };
            const hpList = [...(s.heightPoints ?? [])];
            if (pt.heightPointIdx < hpList.length) {
              hpList[pt.heightPointIdx] = { ...hpList[pt.heightPointIdx], height: val };
              s.heightPoints = hpList;
              n[pt.shapeIdx] = s;
            }
          }
        }
      }
      return n;
    });
    setEditingGeodesyCard(null);
  };
  applyHeightEditRef.current = applyHeightEdit;

  const switchLayer = (layer: ActiveLayer) => {
    setActiveLayer(layer);
    setSelectedShapeIdx(null);
    setDrawingShapeIdx(null);
    setClickedHeightTooltip(null);
    setEditingGeodesyCard(null);
    setMeasureStart(null);
    setMeasureEnd(null);
    setDragInfo(null);
    setShapeDragInfo(null);
    setRotateInfo(null);
    setScaleCorner(null);
    setScaleEdge(null);
    setSelectedPoints([]);
    setSelectedPattern(null);
    setPatternDragInfo(null);
    setPatternDragPreview(null);
    setPatternAlignedEdges([]);
    setPatternRotateInfo(null);
    setPatternRotatePreview(null);
    setMode("select");
  };
  switchLayerRef.current = switchLayer;

  const clearDraft = useCallback(() => {
    try {
      const companyId = useAuthStore.getState().getCompanyId();
      const key = companyId ? `${DRAFT_STORAGE_KEY}_${companyId}` : DRAFT_STORAGE_KEY;
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, []);

  const handleCreateProject = async () => {
    const companyId = useAuthStore.getState().getCompanyId();
    if (!companyId) {
      alert("No company assigned. Please log in with a company.");
      return;
    }
    setIsSubmitting(true);
    try {
      const eventId = await submitProject({
        shapes,
        projectSettings,
        supabase,
        companyId,
        userId: user?.id,
      });
      clearDraft();
      const planId = currentPlanIdRef.current;
      if (planId) {
        try {
          await linkPlanToEvent(supabase, planId, eventId, companyId);
        } catch {
          // non-fatal
        }
      }
      navigate(`/events/${eventId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setIsSubmitting(false);
    }
  };

  const LAYER_KEYS: Record<number, string> = { 1: "garden_label", 2: "elements_label", 3: "pattern_label", 4: "preparation_label", 5: "adjustment_label" };

  const handleExportPdf = async (layers: number[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prevLayer = activeLayer;
    isExportingRef.current = true;
    setIsExportingPdf(true);
    const pdf = new jsPDF("l", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const headerH = 12;
    const imgAreaH = pdfHeight - margin * 2 - headerH;
    const imgAreaW = pdfWidth - margin * 2;

    const waitPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    try {
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i] as ActiveLayer;
        setActiveLayer(layer);
        await waitPaint();
        const imgData = canvas.toDataURL("image/png");
        const imgW = canvas.width;
        const imgH = canvas.height;
        const drawH = (imgH * imgAreaW) / imgW;
        const drawHClamped = Math.min(drawH, imgAreaH);
        const drawWClamped = drawH > imgAreaH ? (imgW * imgAreaH) / imgH : imgAreaW;
        const x = margin + (imgAreaW - drawWClamped) / 2;
        const y = margin + headerH + (imgAreaH - drawHClamped) / 2;
        if (i > 0) pdf.addPage();
        pdf.setFontSize(11);
        pdf.text(t(`project:${LAYER_KEYS[layer]}`), margin, margin + 8);
        pdf.addImage(imgData, "PNG", x, y, drawWClamped, drawHClamped);
      }
      const title = projectSettings.title?.trim() || "plan";
      pdf.save(`plan_${title.replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`);
      setShowPdfExportModal(false);
    } finally {
      isExportingRef.current = false;
      setIsExportingPdf(false);
      setActiveLayer(prevLayer);
    }
  };

  let cursor = "default";
  if (mode === "freeDraw" || drawingShapeIdx !== null) cursor = "crosshair";
  const canStartMeasure = selectedShapeIdx === null && selectedPoints.length === 0 && !selectionRect && !editingDim && !rotateInfo && !patternDragInfo && !patternRotateInfo && !shapeDragInfo && !edgeDragInfo;
  const measureAllowed = activeLayer === 1 || activeLayer === 2 || activeLayer === 3 || activeLayer === 5;
  if (((shiftHeld && measureStart === null && canStartMeasure) || (measureStart !== null && drawingShapeIdx === null)) && measureAllowed) cursor = "crosshair";
  else if (mode === "move") cursor = isPanning ? "grabbing" : "grab";
  else if (scaleCorner) {
    const dx = mouseWorld.x - scaleCorner.anchor.x;
    const dy = mouseWorld.y - scaleCorner.anchor.y;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > ay * 2) cursor = "ew-resize";
    else if (ay > ax * 2) cursor = "ns-resize";
    else cursor = dx * dy > 0 ? "nwse-resize" : "nesw-resize";
  }
  else if (scaleEdge) {
    const { normal } = scaleEdge;
    const ax = Math.abs(normal.x), ay = Math.abs(normal.y);
    if (ax > ay * 2) cursor = "ew-resize";
    else if (ay > ax * 2) cursor = "ns-resize";
    else cursor = normal.x * normal.y > 0 ? "nwse-resize" : "nesw-resize";
  }
  else if (mode === "scale") cursor = "grab";
  else if (rotateInfo) cursor = "grabbing";
  else if (edgeDragInfo) cursor = "grabbing";
  else if (shapeDragInfo) cursor = "move";
  else if (dragInfo) cursor = "grabbing";
  else if (hoveredPoint) cursor = "grab";
  else if (hoveredEdge) cursor = "crosshair";
  else if (grassScaleInfo) cursor = "ew-resize";
  else if (activeLayer === 3 && selectedPattern?.type === "grass") {
    const shape = shapes[selectedPattern.shapeIdx];
    if (shape?.calculatorType === "grass" && shape.calculatorInputs?.vizPieces?.length > 0) {
      const edgeHit = hitTestGrassPieceEdge(mouseWorld, shape, grassEdgeHitPxEffective / zoom);
      if (edgeHit) cursor = "ew-resize";
    }
  }
  else if (isPanning) cursor = "grabbing";

  const l1Count = shapes.filter(s => s.layer === 1).length;
  const l2Count = shapes.filter(s => s.layer === 2).length;

  return (
    <div className="project-canvas-root" style={{ width: "100%", height: "100%", minHeight: 0, minWidth: 0, flex: 1, display: "flex", flexDirection: "column", background: CC.bg, fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace", color: CC.text, overflow: "hidden", userSelect: "none" }}>
      {showRestoredToast && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: CC.accent, color: CC.bg, padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
          ✓ {t("project:restored_unsaved_sketch")}
        </div>
      )}
      {/* Toolbar — CAD Dark Professional */}
      <div className="toolbar-cad">
        {/* Row 1: Layers dropdown + Geodesy */}
        <div className="toolbar-row">
          <div className="tool-group">
            <div ref={layersDropdownRef} style={{ position: "relative" }}>
              <button type="button" className={`dropdown-trigger ${layersDropdownOpen ? "active" : ""}`} onClick={() => setLayersDropdownOpen(v => !v)}>
                <span className={`layer-dot ${activeLayer === 1 ? "garden" : activeLayer === 2 ? "elements" : activeLayer === 3 ? "pattern" : activeLayer === 4 ? "preparation" : "adjustment"}`} />
                {t(`project:${LAYER_KEYS[activeLayer] ?? "toolbar_layers"}`)}
                <svg className="dropdown-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {layersDropdownOpen && (
                <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 50, minWidth: 160 }}>
                  {[
                    { layer: 1 as ActiveLayer, key: "garden_label", dotClass: "garden", count: l1Count },
                    { layer: 2 as ActiveLayer, key: "elements_label", dotClass: "elements", count: l2Count },
                    { layer: 3 as ActiveLayer, key: "pattern_label", dotClass: "pattern", count: null },
                    { layer: 4 as ActiveLayer, key: "preparation_label", dotClass: "preparation", count: null },
                    { layer: 5 as ActiveLayer, key: "adjustment_label", dotClass: "adjustment", count: null },
                  ].map(({ layer: L, key, dotClass, count }) => (
                    <button key={key} type="button"
                      onClick={() => { switchLayer(L); setLayersDropdownOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px",
                        border: "none", background: activeLayer === L ? "rgba(108,92,231,0.2)" : "transparent", color: "#dfe6f0",
                        cursor: "pointer", fontSize: 13, fontFamily: "inherit", borderRadius: 4, textAlign: "left",
                      }}
                      onMouseEnter={(e) => { if (activeLayer !== L) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = activeLayer === L ? "rgba(108,92,231,0.2)" : "transparent"; }}
                    >
                      <span className={`layer-dot ${dotClass}`} style={{ flexShrink: 0 }} />
                      {t(`project:${key}`)}
                      {count != null && <span className="layer-count" style={{ marginLeft: "auto" }}>{count}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className={`geodesy-toggle ${geodesyEnabled ? "on" : "off"}`}
              onClick={() => { setGeodesyEnabled(v => !v); if (geodesyEnabled) setEditingGeodesyCard(null); }}
              title={geodesyEnabled ? t("project:toolbar_geodesy_on_tooltip") : t("project:toolbar_geodesy_off_tooltip")}
            >
              <span className="geodesy-indicator" />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3l4 8 5-5 7 11H0z" />
              </svg>
              {t("project:toolbar_geodesy")}
            </button>
          </div>
          <div className="tb-spacer" />
        </div>

        {/* Row 2: Tools + Drawing + View filters + Delete + Counter — scrollable on mobile */}
        <div className={`toolbar-row ${isMobile ? "toolbar-row-scroll" : ""}`}>
          {/* Mode dropdown: Select, Draw, Scale, View */}
          <div className="tool-group">
            <div ref={modeDropdownRef} style={{ position: "relative" }}>
              <button type="button" className={`dropdown-trigger ${modeDropdownOpen || mode === "select" || mode === "freeDraw" || mode === "scale" || mode === "move" ? "active" : ""}`} onClick={() => setModeDropdownOpen(v => !v)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {mode === "freeDraw" && <><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></>}
                  {mode === "scale" && <><path d="M21 3L3 21" /><path d="M21 3h-6" /><path d="M21 3v6" /><path d="M3 21h6" /><path d="M3 21v-6" /></>}
                  {mode === "move" && <><path d="M5 9l-3 3 3 3" /><path d="M9 5l3-3 3 3" /><path d="M15 19l-3 3-3-3" /><path d="M19 9l3 3-3 3" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" /></>}
                  {(mode === "select" || (mode !== "freeDraw" && mode !== "scale" && mode !== "move")) && <><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" /></>}
                </svg>
                {t("project:toolbar_mode")}
                <svg className="dropdown-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {modeDropdownOpen && (
                <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 50, minWidth: 140 }}>
                  {[
                    { mode: "select" as const, key: "toolbar_select" },
                    { mode: "freeDraw" as const, key: "toolbar_draw" },
                    { mode: "scale" as const, key: "toolbar_scale" },
                    { mode: "move" as const, key: "toolbar_view" },
                  ].map(({ mode: m, key }) => (
                    <button key={key} type="button"
                      onClick={() => {
                        if (m === "select") { setDrawingShapeIdx(null); setMode("select"); }
                        else if (m === "freeDraw") { setMode("freeDraw"); setSelectedShapeIdx(null); }
                        else if (m === "scale") { setDrawingShapeIdx(null); setMode("scale"); }
                        else if (m === "move") { setDrawingShapeIdx(null); setMode("move"); setSelectedShapeIdx(null); }
                        setModeDropdownOpen(false);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px",
                        border: "none", background: (mode === m || (m === "select" && mode === "select" && !drawingShapeIdx)) ? "rgba(108,92,231,0.2)" : "transparent", color: "#dfe6f0",
                        cursor: "pointer", fontSize: 13, fontFamily: "inherit", borderRadius: 4, textAlign: "left",
                      }}
                      onMouseEnter={(e) => { if (mode !== m && !(m === "select" && mode === "select")) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = (mode === m || (m === "select" && mode === "select" && !drawingShapeIdx)) ? "rgba(108,92,231,0.2)" : "transparent"; }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, flexShrink: 0 }}>
                        {m === "select" && <><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" /></>}
                        {m === "freeDraw" && <><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></>}
                        {m === "scale" && <><path d="M21 3L3 21" /><path d="M21 3h-6" /><path d="M21 3v6" /><path d="M3 21h6" /><path d="M3 21v-6" /></>}
                        {m === "move" && <><path d="M5 9l-3 3 3 3" /><path d="M9 5l3-3 3 3" /><path d="M15 19l-3 3-3-3" /><path d="M19 9l3 3-3 3" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" /></>}
                      </svg>
                      {t(`project:${key}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="tb-sep" />

          {/* Drawing tools */}
          <div className="tool-group">
            {(activeLayer === 1 || activeLayer === 2) && (
              <div ref={shapesDropdownRef} style={{ position: "relative" }}>
                <button type="button" className={`dropdown-trigger ${shapesDropdownOpen ? "active" : ""}`} onClick={() => setShapesDropdownOpen(v => !v)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                  </svg>
                  {t("project:toolbar_shapes")}
                  <svg className="dropdown-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {shapesDropdownOpen && (
                  <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 50, minWidth: 140 }}>
                    {[
                      { type: "square" as const, icon: "◻", key: "toolbar_shape_square" },
                      { type: "rectangle" as const, icon: "▭", key: "toolbar_shape_rectangle" },
                      { type: "triangle" as const, icon: "△", key: "toolbar_shape_triangle" },
                      { type: "trapezoid" as const, icon: "⏢", key: "toolbar_shape_trapezoid" },
                    ].map(({ type, icon, key }) => (
                      <button key={key} type="button" onClick={() => { setShapeCreationModal({ type }); setShapesDropdownOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", background: "transparent", color: "#dfe6f0", cursor: "pointer", fontSize: 13, fontFamily: "inherit", borderRadius: 4, textAlign: "left" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        <span style={{ fontSize: 14 }}>{icon}</span>
                        {t(`project:${key}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeLayer === 2 && (
              <div ref={pathDropdownRef} style={{ position: "relative" }}>
                <button type="button" className={`dropdown-trigger ${pathDropdownOpen || mode === "drawPathSlabs" || mode === "drawPathConcreteSlabs" || mode === "drawPathMonoblock" ? "active" : ""}`} onClick={() => setPathDropdownOpen(v => !v)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12h16" /><path d="M4 8h16" /><path d="M4 16h16" />
                  </svg>
                  {t("project:toolbar_path")}
                  <svg className="dropdown-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {pathDropdownOpen && (
                  <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 50, minWidth: 140 }}>
                    {[
                      { subType: "slabs" as const, icon: "▦", key: "toolbar_path_slabs", color: CC.layer2Edge },
                      { subType: "concreteSlabs" as const, icon: "▣", key: "toolbar_path_concrete_slabs", color: CC.layer2Edge },
                      { subType: "monoblock" as const, icon: "▤", key: "toolbar_path_monoblock", color: CC.layer2Edge },
                    ].map(({ subType, icon, key, color }) => (
                      <button key={key} type="button"
                        onClick={() => { setPathCreationModal({ subType, name: t(`project:${key}`) }); setPathDropdownOpen(false); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px",
                          border: "none", background: "transparent", color: "#dfe6f0",
                          cursor: "pointer", fontSize: 13, fontFamily: "inherit", borderRadius: 4, textAlign: "left",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <span style={{ fontSize: 14, color }}>{icon}</span>
                        {t(`project:${key}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeLayer === 2 && (
              <div ref={linearDropdownRef} style={{ position: "relative" }}>
                <button type="button" className={`dropdown-trigger ${linearDropdownOpen || mode === "drawFence" || mode === "drawWall" || mode === "drawKerb" || mode === "drawFoundation" ? "active" : ""}`} onClick={() => setLinearDropdownOpen(v => !v)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20L20 4" /><circle cx="4" cy="20" r="2" /><circle cx="20" cy="4" r="2" />
                  </svg>
                  {t("project:toolbar_linear")}
                  <svg className="dropdown-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {linearDropdownOpen && (
                  <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 50, minWidth: 140 }}>
                    {[
                      { mode: "drawFence" as const, icon: "⌇", key: "toolbar_linear_fence", color: CC.fence },
                      { mode: "drawWall" as const, icon: "▥", key: "toolbar_linear_wall", color: CC.wall },
                      { mode: "drawKerb" as const, icon: "╌", key: "toolbar_linear_kerb", color: CC.kerb },
                      { mode: "drawFoundation" as const, icon: "▦", key: "toolbar_linear_foundation", color: CC.foundation },
                    ].map(({ mode: m, icon, key, color }) => (
                      <button key={key} type="button"
                        onClick={() => { setDrawingShapeIdx(null); setMode(m); setSelectedShapeIdx(null); setLinearDropdownOpen(false); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px",
                          border: "none", background: mode === m ? color + "33" : "transparent", color: "#dfe6f0",
                          cursor: "pointer", fontSize: 13, fontFamily: "inherit", borderRadius: 4, textAlign: "left",
                        }}
                        onMouseEnter={(e) => { if (mode !== m) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = mode === m ? color + "33" : "transparent"; }}
                      >
                        <span style={{ fontSize: 14, color }}>{icon}</span>
                        {t(`project:${key}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeLayer === 2 && (
              <div ref={stairsDropdownRef} style={{ position: "relative" }}>
                <button type="button" className={`dropdown-trigger ${stairsDropdownOpen ? "active" : ""}`} onClick={() => setStairsDropdownOpen(v => !v)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h16" /><path d="M4 16h16" /><path d="M4 12h16" /><path d="M4 8h16" />
                  </svg>
                  {t("project:toolbar_stairs")}
                  <svg className="dropdown-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {stairsDropdownOpen && (
                  <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 50, minWidth: 160 }}>
                    {[
                      { subType: "standard" as const, key: "toolbar_stairs_standard" },
                      { subType: "l_shape" as const, key: "toolbar_stairs_l_shape" },
                      { subType: "u_shape" as const, key: "toolbar_stairs_u_shape" },
                    ].map(({ subType, key }) => (
                      <button key={subType} type="button"
                        onClick={() => { setStairsCreationModal({ subType, name: t(`project:${key}`) }); setStairsDropdownOpen(false); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px",
                          border: "none", background: "transparent", color: "#dfe6f0",
                          cursor: "pointer", fontSize: 13, fontFamily: "inherit", borderRadius: 4, textAlign: "left",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        {t(`project:${key}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeLayer === 2 && (
              <div className="view-filters">
                <button type="button" className={`view-btn ${viewFilter === "all" ? "active" : ""}`} data-tooltip={t("project:view_filter_all")} onClick={() => setViewFilter("all")}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                  </svg>
                </button>
                <button type="button" className={`view-btn ${viewFilter === "linear" ? "active" : ""}`} data-tooltip={t("project:view_filter_linear")} onClick={() => setViewFilter("linear")}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="19" x2="19" y2="5" />
                  </svg>
                </button>
                <button type="button" className={`view-btn ${viewFilter === "surface" ? "active" : ""}`} data-tooltip={t("project:view_filter_surface")} onClick={() => setViewFilter("surface")}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="1" fill="currentColor" opacity="0.15" />
                    <rect x="4" y="4" width="16" height="16" rx="1" />
                  </svg>
                </button>
              </div>
            )}
            {activeLayer === 4 && (
              <div ref={groundworkDropdownRef} style={{ position: "relative" }}>
                <button type="button" className={`dropdown-trigger ${groundworkDropdownOpen || mode === "drawDrainage" || mode === "drawCanalPipe" || mode === "drawWaterPipe" || mode === "drawCable" ? "active" : ""}`} onClick={() => setGroundworkDropdownOpen(v => !v)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20L20 4" /><circle cx="4" cy="20" r="2" /><circle cx="20" cy="4" r="2" />
                  </svg>
                  {t("project:toolbar_groundwork")}
                  <svg className="dropdown-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {groundworkDropdownOpen && (
                  <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 50, minWidth: 160 }}>
                    {[
                      { mode: "drawDrainage" as const, icon: "⌇", key: "toolbar_groundwork_drainage", color: CC.drainage },
                      { mode: "drawCanalPipe" as const, icon: "⌇", key: "toolbar_groundwork_canal_pipe", color: CC.canalPipe },
                      { mode: "drawWaterPipe" as const, icon: "⌇", key: "toolbar_groundwork_water_pipe", color: CC.waterPipe },
                      { mode: "drawCable" as const, icon: "⌇", key: "toolbar_groundwork_cable", color: CC.cable },
                    ].map(({ mode: m, icon, key, color }) => (
                      <button key={key} type="button"
                        onClick={() => { setDrawingShapeIdx(null); setMode(m); setSelectedShapeIdx(null); setGroundworkDropdownOpen(false); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px",
                          border: "none", background: mode === m ? color + "33" : "transparent", color: "#dfe6f0",
                          cursor: "pointer", fontSize: 13, fontFamily: "inherit", borderRadius: 4, textAlign: "left",
                        }}
                        onMouseEnter={(e) => { if (mode !== m) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = mode === m ? color + "33" : "transparent"; }}
                      >
                        <span style={{ fontSize: 14, color }}>{icon}</span>
                        {t(`project:${key}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="tb-sep" />

          <button type="button" className="undo-btn" onClick={undo} disabled={history.length === 0} title={t("project:canvas_undo")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" /><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
            </svg>
          </button>

          <div className="tb-sep" />

          <div className="tool-group">
            <button type="button" className="action-btn" onClick={() => setShowEquipmentPanel(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
              </svg>
              {t("project:toolbar_project")}
            </button>
            {(shapes.length > 0 || projectSettings.title) && (
              <button type="button" className="action-btn danger" onClick={() => { if (confirm(t("project:clear_draft_confirm"))) { clearDraft(); setShapes([]); setProjectSettings(DEFAULT_PROJECT_SETTINGS); setHistory([]); historyRef.current = []; setSelectedShapeIdx(null); setLinkedGroups([]); hasShownInitialProjectCardRef.current = false; setShowEquipmentPanel(true); } }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
                {t("project:toolbar_clear")}
              </button>
            )}
          </div>

          <div className="tb-spacer" />

          <div className="tb-sep" />

          {selectedShapeIdx !== null && !drawingShapeIdx && (
            <button type="button" className="delete-btn" onClick={() => { saveHistory(); setShapes(p => p.filter((_, i) => i !== selectedShapeIdx)); setSelectedShapeIdx(null); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              {t("project:toolbar_delete")}
            </button>
          )}
          {selectedShapeIdx !== null && !drawingShapeIdx && <div className="tb-sep" />}

          <div className="shape-counter">
            <span>{activeLayer === 3 || activeLayer === 4 ? shapes.filter(s => s.layer === 1 || s.layer === 2).length : shapes.filter(s => s.layer === activeLayer).length}</span>
            {" "}{t("project:toolbar_shapes_word")}{" · "}
            <span>{shapes.filter(s => !s.closed && ((activeLayer === 3 || activeLayer === 4) ? (s.layer === 1 || s.layer === 2) : s.layer === activeLayer)).length}</span>
            {" "}{t("project:toolbar_open_word")}
          </div>
        </div>
      </div>

      {/* Canvas + Summary */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", overflow: "hidden" }}>
      <div ref={containerRef} style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden" }}>
        <canvas ref={canvasRef} style={{ width: canvasSize.w, height: canvasSize.h, cursor, display: "block", touchAction: "none" }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp} onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} />

        {/* Porada + Skróty */}
        <div style={{ position: "absolute", bottom: 12, right: 12, zIndex: 40, display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={() => { setTipOpen(v => !v); setShortcutsOpen(false); }}
            style={{
              width: 28, height: 28, borderRadius: "50%", border: `1px solid ${CC.panelBorder}`,
              background: CC.button, color: CC.textDim, cursor: "pointer", fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
            title={t("project:canvas_tip_title")}
          >
            💡
          </button>
          <button
            onClick={() => { setShortcutsOpen(v => !v); setTipOpen(false); }}
            style={{
              width: 28, height: 28, borderRadius: "50%", border: `1px solid ${CC.panelBorder}`,
              background: CC.button, color: CC.textDim, cursor: "pointer", fontSize: 14, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
            title={t("project:canvas_shortcuts_title_tooltip")}
          >
            i
          </button>
          {tipOpen && (
            <div
              style={{
                position: "absolute", bottom: "100%", right: 0, marginBottom: 8,
                background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 14,
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)", width: 380, fontSize: 12, lineHeight: 1.6, color: CC.text,
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontWeight: 600, marginBottom: 8, color: CC.accent }}>{t("project:canvas_tip_title")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>{t("project:canvas_tip_overlap")}</div>
                <div>{t("project:canvas_tip_foundation_time")}</div>
                <div>{t("project:canvas_tip_leveling_material")}</div>
              </div>
            </div>
          )}
          {shortcutsOpen && (
            <div
              style={{
                position: "absolute", bottom: "100%", right: 0, marginBottom: 8,
                background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 14,
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)", width: 380, fontSize: 12, lineHeight: 1.7, color: CC.text,
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontWeight: 600, marginBottom: 10, color: CC.accent }}>{t("project:canvas_shortcuts_title")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div>{t("project:canvas_shortcut_layer_1")}</div>
                <div>{t("project:canvas_shortcut_layer_2")}</div>
                <div>{t("project:canvas_shortcut_layer_3")}</div>
                <div>{t("project:canvas_shortcut_layer_4")}</div>
                <div>{t("project:canvas_shortcut_layer_5")}</div>
                <div>{t("project:canvas_shortcut_geodesy")}</div>
                <div>{t("project:canvas_shortcut_left_object")}</div>
                <div>{t("project:canvas_shortcut_left_empty_ctrl")}</div>
                <div>{t("project:canvas_shortcut_left_empty")}</div>
                <div>{t("project:canvas_shortcut_middle")}</div>
                <div>{t("project:canvas_shortcut_right")}</div>
                <div>{t("project:canvas_shortcut_scroll")}</div>
                <div>{t("project:canvas_shortcut_shift")}</div>
                <div>{t("project:canvas_shortcut_ctrlz")}</div>
                <div>{t("project:canvas_shortcut_click_edge")}</div>
                <div>{t("project:canvas_shortcut_right_point")}</div>
                <div>{t("project:canvas_shortcut_double_dim")}</div>
                <div>{t("project:canvas_shortcut_free_right")}</div>
              </div>
            </div>
          )}
        </div>

        {contextMenu && contextMenu.patternRotationHandle && (
          <div ref={contextMenuRef} style={{ position: "fixed", left: (contextMenuDisplayPos ?? { x: contextMenu.x, y: contextMenu.y }).x, top: (contextMenuDisplayPos ?? { x: contextMenu.x, y: contextMenu.y }).y, background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, padding: 4, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,0.5)", minWidth: 160 }}>
            <div style={{ fontSize: 11, color: CC.text, opacity: 0.9, padding: "4px 8px 6px", borderBottom: `1px solid ${CC.panelBorder}`, marginBottom: 4 }}>
              {t("project:pattern_rotation_ctx_title")}
            </div>
            <CtxItem
              label={shapes[contextMenu.shapeIdx]?.calculatorInputs?.vizPatternAngleLocked ? t("project:pattern_angle_unlock") : t("project:pattern_angle_lock")}
              color={CC.accent}
              onClick={() => {
                const si = contextMenu.shapeIdx;
                saveHistory();
                setShapes(p => {
                  const n = [...p];
                  const s = { ...n[si] };
                  const locked = !!s.calculatorInputs?.vizPatternAngleLocked;
                  s.calculatorInputs = { ...s.calculatorInputs, vizPatternAngleLocked: !locked };
                  n[si] = s;
                  return n;
                });
                setContextMenu(null);
              }}
            />
            {shapes[contextMenu.shapeIdx]?.layer === 2 && (
              <>
                <div style={{ height: 1, background: CC.panelBorder, margin: "4px 0" }} />
                <CtxItem label={t("project:ctx_remove_element")} color={CC.danger} onClick={() => deleteLayer2ElementFromContext(contextMenu.shapeIdx)} />
              </>
            )}
          </div>
        )}
        {contextMenu && !contextMenu.patternRotationHandle && (
          <div ref={contextMenuRef} style={{ position: "fixed", left: (contextMenuDisplayPos ?? { x: contextMenu.x, y: contextMenu.y }).x, top: (contextMenuDisplayPos ?? { x: contextMenu.x, y: contextMenu.y }).y, background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, padding: 4, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,0.5)", minWidth: 160 }}>
            <div style={{ fontSize: 11, color: CC.text, opacity: 0.9, padding: "4px 8px 6px", borderBottom: `1px solid ${CC.panelBorder}`, marginBottom: 4 }}>
              {contextMenu.adjustmentEmpty && t("project:adjustment_empty_area")}
              {contextMenu.adjustmentOverflow && (() => {
                const s = shapes[contextMenu.adjustmentOverflow.shapeIdx];
                return s ? `${t("project:adjustment_overflow")}: ${s.label || s.calculatorType || s.elementType}` : t("project:adjustment_overflow");
              })()}
              {contextMenu.adjustmentOverlap && t("project:adjustment_overlap")}
              {!contextMenu.adjustmentEmpty && !contextMenu.adjustmentOverflow && !contextMenu.adjustmentOverlap && (() => {
                const s = shapes[contextMenu.shapeIdx];
                const name = s?.label || s?.calculatorType || s?.elementType || t("project:canvas_object_object");
                return t("project:context_menu_element_point", { name });
              })()}
            </div>
            {/* Layer 5 Adjustment menus */}
            {contextMenu.adjustmentEmpty && (
              <>
                <CtxItem label={t("project:adjustment_fill")} color={CC.accent} onClick={() => {
                  const { emptyAreaIdx } = contextMenu.adjustmentEmpty!;
                  const emptyArea = adjustmentData.emptyAreas[emptyAreaIdx];
                  const touching = findTouchingElementsForEmptyArea(shapes, emptyArea);
                  if (touching.length === 0) {
                    setContextMenu(null);
                    return;
                  }
                if (touching.length === 1) {
                  saveHistory();
                  const newPts = extendShapeToCoverEmptyArea(shapes, touching[0], emptyArea);
                  if (newPts) {
                    setShapes(p => {
                      const n = [...p];
                      n[touching[0]] = applyPolygonPointsToShape(n[touching[0]], newPts);
                      return n;
                    });
                  }
                  setContextMenu(null);
                  return;
                }
                setAdjustmentFillModal({ emptyAreaIdx });
                  setContextMenu(null);
                }} />
                <CtxItem label={t("project:adjustment_extend_to_edge", { defaultValue: "Dosuń do krawędzi" })} color={CC.accent} onClick={() => {
                  const { emptyAreaIdx } = contextMenu.adjustmentEmpty!;
                  const emptyArea = adjustmentData.emptyAreas[emptyAreaIdx];
                  const touching = findTouchingElementsForEmptyArea(shapes, emptyArea);
                  if (touching.length === 0) {
                    setContextMenu(null);
                    return;
                  }
                  if (touching.length === 1) {
                    saveHistory();
                    const newPts = extendShapeToGardenEdge(shapes, touching[0], emptyArea);
                    if (newPts) {
                      setShapes(p => {
                        const n = [...p];
                        const s = applyPolygonPointsToShape(n[touching[0]], newPts);
                        n[touching[0]] = s;
                        return n;
                      });
                    }
                    setContextMenu(null);
                    return;
                  }
                  setAdjustmentExtendModal({ emptyAreaIdx });
                  setContextMenu(null);
                }} />
              </>
            )}
            {contextMenu.adjustmentOverflow && (
              <CtxItem label={t("project:adjustment_hide")} color={CC.accent} onClick={() => {
                const si = contextMenu.adjustmentOverflow!.shapeIdx;
                const newPts = clipShapeToGarden(shapes, si);
                if (newPts) {
                  saveHistory();
                  setShapes(p => {
                    const n = [...p];
                    const s = applyPolygonPointsToShape(n[si], newPts);
                    n[si] = s;
                    return n;
                  });
                }
                setContextMenu(null);
              }} />
            )}
            {contextMenu.adjustmentOverlap && (
              <>
                <CtxItem label={t("project:adjustment_remove_part_a", { name: shapes[contextMenu.adjustmentOverlap.shapeIdxA]?.label || shapes[contextMenu.adjustmentOverlap.shapeIdxA]?.calculatorType || shapes[contextMenu.adjustmentOverlap.shapeIdxA]?.elementType || '' })} color={CC.danger} onClick={() => {
                  const { shapeIdxA, overlapIdx } = contextMenu.adjustmentOverlap!;
                  const overlap = adjustmentData.overlaps[overlapIdx]?.overlapPolygon;
                  if (!overlap) return;
                  const newPts = removeOverlapFromShape(shapes, shapeIdxA, overlap);
                  if (newPts) {
                    saveHistory();
                    setShapes(p => {
                      const n = [...p];
                      const s = applyPolygonPointsToShape(n[shapeIdxA], newPts);
                      n[shapeIdxA] = s;
                      return n;
                    });
                  }
                  setContextMenu(null);
                }} />
                <CtxItem label={t("project:adjustment_remove_part_b", { name: shapes[contextMenu.adjustmentOverlap.shapeIdxB]?.label || shapes[contextMenu.adjustmentOverlap.shapeIdxB]?.calculatorType || shapes[contextMenu.adjustmentOverlap.shapeIdxB]?.elementType || '' })} color={CC.danger} onClick={() => {
                  const { shapeIdxB, overlapIdx } = contextMenu.adjustmentOverlap!;
                  const overlap = adjustmentData.overlaps[overlapIdx]?.overlapPolygon;
                  if (!overlap) return;
                  const newPts = removeOverlapFromShape(shapes, shapeIdxB, overlap);
                  if (newPts) {
                    saveHistory();
                    setShapes(p => {
                      const n = [...p];
                      const s = applyPolygonPointsToShape(n[shapeIdxB], newPts);
                      n[shapeIdxB] = s;
                      return n;
                    });
                  }
                  setContextMenu(null);
                }} />
                <CtxItem label={t("project:adjustment_spread")} color={CC.accent} onClick={() => {
                  setAdjustmentSpreadModal({ ...contextMenu.adjustmentOverlap! });
                  setContextMenu(null);
                }} />
              </>
            )}
            {/* Grass join/unjoin menu */}
            {contextMenu.grassJoin && (
              <CtxItem label="🔗 Złącz roleki" color={CC.accent} onClick={() => {
                const { shapeIdx, grassJoin } = contextMenu;
                if (!grassJoin) return;
                saveHistory();
                setShapes(p => {
                  const n = [...p];
                  const s = { ...n[shapeIdx] };
                  const inputs = { ...s.calculatorInputs };
                  const pieces = [...(inputs.vizPieces as GrassPiece[])];
                  const pa = pieces[grassJoin.pieceAIdx];
                  const pb = pieces[grassJoin.pieceBIdx];
                  if (pa && pb) {
                    pieces[grassJoin.pieceAIdx] = { ...pa, joinedTo: [...(pa.joinedTo ?? []), pb.id] };
                    pieces[grassJoin.pieceBIdx] = { ...pb, joinedTo: [...(pb.joinedTo ?? []), pa.id] };
                    const effectiveAreaM2 = (computeAutoFill(s, n).areaM2 ?? 0);
                    const artificialGrassAreaM2 = getEffectiveTotalArea(pieces);
                    const vizPiecesWithEffective = pieces.map((p, i) => {
                      const { effectiveWidthM, effectiveLengthM } = getEffectivePieceDimensionsForInput(p, pieces, i);
                      return { ...p, effectiveWidthM, effectiveLengthM };
                    });
                    inputs.vizPieces = vizPiecesWithEffective;
                    inputs.effectiveAreaM2 = effectiveAreaM2;
                    inputs.artificialGrassAreaM2 = artificialGrassAreaM2;
                    const cov = validateCoverage(s, vizPiecesWithEffective);
                    inputs.jointsLength = String(cov.joinLengthM.toFixed(2));
                    inputs.trimLength = String(cov.trimLengthM.toFixed(2));
                    n[shapeIdx] = { ...s, calculatorInputs: inputs };
                  }
                  return n;
                });
                setContextMenu(null);
                setGrassTrimModal({ shapeIdx, pieceAIdx: grassJoin.pieceAIdx, pieceBIdx: grassJoin.pieceBIdx, edgeIdx: grassJoin.edgeAIdx });
              }} />
            )}
            {contextMenu.heightPointIdx !== undefined && (
              <CtxItem label="✕ Usuń punkt wysokościowy" color={CC.danger} onClick={() => {
                const si = contextMenu.shapeIdx, hpi = contextMenu.heightPointIdx!;
                saveHistory();
                setShapes(p => {
                  const n = [...p]; const s = { ...n[si] };
                  const hp = [...(s.heightPoints ?? [])];
                  hp.splice(hpi, 1);
                  s.heightPoints = hp.length ? hp : undefined;
                  n[si] = s; return n;
                });
                setContextMenu(null);
              }} />
            )}
            {/* Arc point menu — "Dodaj arc point" nie wyświetla się, bo arc point już tam jest */}
            {contextMenu.arcPoint && (
              <>
                <CtxItem label="〰 Zmiana na square point" color={CC.accent} onClick={() => {
                  saveHistory();
                  const si = contextMenu.shapeIdx, ei = contextMenu.edgeIdx, ap = contextMenu.arcPoint!;
                  const A = shapes[si].points[ei];
                  const B = shapes[si].points[(ei + 1) % shapes[si].points.length];
                  const arcs = shapes[si].edgeArcs?.[ei] ?? [];
                  const worldPos = arcPointToWorldOnCurve(A, B, arcs, ap);
                  const insertIdx = ei + 1;
                  setShapes(p => {
                    const n = [...p]; const s = { ...n[si] };
                    const pts = s.points;
                    const arcs = (s.edgeArcs?.[ei] ?? []).filter(a => a.id !== ap.id);
                    const first: ArcPoint[] = [];
                    const second: ArcPoint[] = [];
                    for (const a of arcs) {
                      if (a.t < ap.t) first.push({ ...a, t: ap.t > 0.01 ? a.t / ap.t : 0.5 });
                      else second.push({ ...a, t: ap.t < 0.99 ? (a.t - ap.t) / (1 - ap.t) : 0.5 });
                    }
                    s.points = [...pts.slice(0, insertIdx), { ...worldPos }, ...pts.slice(insertIdx)];
                    const nh = s.heights || pts.map(() => 0);
                    const hNew = (nh[ei] ?? 0) * (1 - ap.t) + (nh[(ei + 1) % pts.length] ?? 0) * ap.t;
                    s.heights = [...nh.slice(0, insertIdx), hNew, ...nh.slice(insertIdx)];
                    const prevArcs = (s.edgeArcs || []).slice(0, ei);
                    const restArcs = (s.edgeArcs || []).slice(ei + 1);
                    s.edgeArcs = [...prevArcs, first.length ? first : null, second.length ? second : null, ...restArcs];
                    s.lockedEdges = s.lockedEdges.map(e => e.idx >= insertIdx ? { ...e, idx: e.idx + 1 } : e);
                    s.lockedAngles = s.lockedAngles.map(a => a >= insertIdx ? a + 1 : a);
                    n[si] = s; return n;
                  });
                  // Update linked groups: arc {si, ei, ap.id} becomes vertex {si, insertIdx}; shift other entries
                  setLinkedGroups(prev => prev.map(g => g.map(p => {
                    if (isArcEntry(p) && p.si === si && p.edgeIdx === ei && p.arcId === ap.id)
                      return { si, pi: insertIdx };
                    if (p.si === si && !isArcEntry(p) && p.pi >= insertIdx)
                      return { ...p, pi: p.pi + 1 };
                    if (p.si === si && isArcEntry(p) && p.edgeIdx >= insertIdx)
                      return { ...p, edgeIdx: p.edgeIdx + 1 };
                    return p;
                  })).filter(g => g.length >= 2));
                  setContextMenu(null);
                }} />
                <CtxItem label={t("project:ctx_remove_arc_point")} color={CC.danger} onClick={() => {
                  const si = contextMenu.shapeIdx, ei = contextMenu.edgeIdx, ap = contextMenu.arcPoint!;
                  removeEntryAndLinked({ si, pi: -1 as const, edgeIdx: ei, arcId: ap.id });
                }} />
                {(() => {
                  const si = contextMenu.shapeIdx;
                  const ei = contextMenu.edgeIdx;
                  const ap = contextMenu.arcPoint!;
                  const isLinked = isArcPointLinked(si, ei, ap.id);
                  if (isLinked) {
                    return <CtxItem label={t("project:ctx_unlink_arc_point")} color={CC.text} onClick={() => {
                      unlinkEntry({ si, pi: -1 as const, edgeIdx: ei, arcId: ap.id });
                    }} />;
                  }
                  const A = shapes[si].points[ei];
                  const B = shapes[si].points[(ei + 1) % shapes[si].points.length];
                  const arcs = shapes[si].edgeArcs?.[ei] ?? [];
                  const worldPos = arcPointToWorldOnCurve(A, B, arcs, ap);
                  const nearby = findNearbyLinkableEntries(worldPos, ap.id);
                  const edges = findAllEdgesPositionTouches(worldPos, si);
                  if (nearby.length === 0 && edges.length === 0) return null;
                  return <CtxItem label={t("project:ctx_link_arc_point")} color={CC.accent} onClick={() => {
                    linkArcPoint(si, ei, ap);
                  }} />;
                })()}
              </>
            )}
            {contextMenu.grassPieceIdx != null && (
              <CtxItem label={t("project:grass_rotate_element_90")} color={CC.accent} onClick={() => {
                const { shapeIdx, grassPieceIdx: pieceIdx } = contextMenu;
                if (pieceIdx == null) return;
                saveHistory();
                setShapes(p => {
                  const n = [...p];
                  const s = { ...n[shapeIdx] };
                  const inputs = { ...s.calculatorInputs };
                  const pieces = [...(inputs.vizPieces as GrassPiece[])];
                  const groupIndices = getJoinedGroup(pieces, pieceIdx);
                  const rotated = groupIndices.length > 1
                    ? rotateGrassGroup90(pieces, groupIndices)
                    : (() => {
                        const piece = pieces[pieceIdx];
                        if (!piece) return pieces;
                        const np = [...pieces];
                        np[pieceIdx] = { ...piece, rotation: (piece.rotation === 90 ? 0 : 90) as 0 | 90 };
                        return np;
                      })();
                  const effectiveAreaM2 = (computeAutoFill(s, n).areaM2 ?? 0);
                  const artificialGrassAreaM2 = getEffectiveTotalArea(rotated);
                  const vizPiecesWithEffective = rotated.map((pc, i) => {
                    const { effectiveWidthM, effectiveLengthM } = getEffectivePieceDimensionsForInput(pc, rotated, i);
                    return { ...pc, effectiveWidthM, effectiveLengthM };
                  });
                  inputs.vizPieces = vizPiecesWithEffective;
                  inputs.effectiveAreaM2 = effectiveAreaM2;
                  inputs.artificialGrassAreaM2 = artificialGrassAreaM2;
                  const cov = validateCoverage(s, vizPiecesWithEffective);
                  inputs.jointsLength = String(cov.joinLengthM.toFixed(2));
                  inputs.trimLength = String(cov.trimLengthM.toFixed(2));
                  n[shapeIdx] = { ...s, calculatorInputs: inputs };
                  return n;
                });
                setContextMenu(null);
              }} />
            )}
            {contextMenu.grassUnjoin && (
              <CtxItem label="✂ Rozłącz roleki" color={CC.text} onClick={() => {
                const { shapeIdx, grassUnjoin } = contextMenu;
                if (!grassUnjoin) return;
                saveHistory();
                setShapes(p => {
                  const n = [...p];
                  const s = { ...n[shapeIdx] };
                  const inputs = { ...s.calculatorInputs };
                  const pieces = [...(inputs.vizPieces as GrassPiece[])];
                  const pa = pieces[grassUnjoin.pieceAIdx];
                  const pb = pieces[grassUnjoin.pieceBIdx];
                  if (pa && pb) {
                    pieces[grassUnjoin.pieceAIdx] = { ...pa, joinedTo: (pa.joinedTo ?? []).filter(id => id !== pb.id) };
                    pieces[grassUnjoin.pieceBIdx] = { ...pb, joinedTo: (pb.joinedTo ?? []).filter(id => id !== pa.id) };
                    const effectiveAreaM2 = (computeAutoFill(s, n).areaM2 ?? 0);
                    const artificialGrassAreaM2 = getEffectiveTotalArea(pieces);
                    const vizPiecesWithEffective = pieces.map((pc, i) => {
                      const { effectiveWidthM, effectiveLengthM } = getEffectivePieceDimensionsForInput(pc, pieces, i);
                      return { ...pc, effectiveWidthM, effectiveLengthM };
                    });
                    inputs.vizPieces = vizPiecesWithEffective;
                    inputs.effectiveAreaM2 = effectiveAreaM2;
                    inputs.artificialGrassAreaM2 = artificialGrassAreaM2;
                    const cov = validateCoverage(s, vizPiecesWithEffective);
                    inputs.jointsLength = String(cov.joinLengthM.toFixed(2));
                    inputs.trimLength = String(cov.trimLengthM.toFixed(2));
                    n[shapeIdx] = { ...s, calculatorInputs: inputs };
                  }
                  return n;
                });
                setContextMenu(null);
              }} />
            )}
            {/* Point menu */}
            {contextMenu.pointIdx >= 0 && (<>
              {(shapes[contextMenu.shapeIdx]?.layer === 1 || shapes[contextMenu.shapeIdx]?.layer === 2) &&
                (shapes[contextMenu.shapeIdx]?.points.length ?? 0) >= 2 && (
                <CtxItem
                  label={t("project:ctx_offset_along_line")}
                  color={CC.accent}
                  onClick={() => {
                    setPointOffsetAlongLinePick({ moveShapeIdx: contextMenu.shapeIdx, movePointIdx: contextMenu.pointIdx });
                    setSelectedShapeIdx(contextMenu.shapeIdx);
                    setContextMenu(null);
                  }}
                />
              )}
              {shapes[contextMenu.shapeIdx] && (shapes[contextMenu.shapeIdx].layer === 1 || shapes[contextMenu.shapeIdx].layer === 2) && shapes[contextMenu.shapeIdx].points.length > 3 && (
                <CtxItem label="〰 Zmiana na arc point" color={CC.accent} onClick={() => {
                  saveHistory();
                  const si = contextMenu.shapeIdx, pi = contextMenu.pointIdx;
                  const s = shapes[si]; const pts = s.points;
                  const n = pts.length;
                  const prev = (pi - 1 + n) % n, next = (pi + 1) % n;
                  const A = pts[prev], B = pts[next], V = pts[pi];
                  const { t: chordT } = worldToArcPoint(A, B, V);
                  const arcsPrev = (s.edgeArcs?.[prev] ?? []).map(a => ({ ...a, t: a.t * chordT }));
                  const arcsNext = (s.edgeArcs?.[pi] ?? []).map(a => ({ ...a, t: chordT + (1 - chordT) * a.t }));
                  const placeholder = { id: "__temp__", t: 0.5, offset: 0 };
                  const { t, offset } = worldToArcPointOnCurve(A, B, [...arcsPrev, ...arcsNext, placeholder], placeholder, V);
                  const newArc: ArcPoint = { id: crypto.randomUUID(), t, offset };
                  // The merged edge index in the new shape (after removing the vertex)
                  const newEdgeIdx = pi > 0 ? prev : n - 2;
                  setShapes(p => {
                    const n2 = [...p]; const sh = { ...n2[si] };
                    const newPts = pts.filter((_, i) => i !== pi);
                    const arcsPrev = (sh.edgeArcs?.[prev] ?? []).map(a => ({ ...a, t: a.t * t }));
                    const arcsNext = (sh.edgeArcs?.[pi] ?? []).map(a => ({ ...a, t: t + (1 - t) * a.t }));
                    const merged = [...arcsPrev, ...arcsNext, newArc].sort((a, b) => a.t - b.t);
                    const oldArcs = sh.edgeArcs || [];
                    const newEdgeArcs: (ArcPoint[] | null)[] = [];
                    for (let j = 0; j < n - 1; j++) {
                      if (j < prev) newEdgeArcs.push(oldArcs[j] ?? null);
                      else if (j === prev) newEdgeArcs.push(merged.length ? merged : null);
                      else newEdgeArcs.push(oldArcs[j + 1] ?? null);
                    }
                    sh.points = newPts;
                    sh.edgeArcs = newEdgeArcs.some(a => a && a.length > 0) ? newEdgeArcs : undefined;
                    const nh = (sh.heights || pts.map(() => 0)).filter((_, i) => i !== pi);
                    sh.heights = nh;
                    if (sh.elementType === "wall" && sh.calculatorInputs?.segmentHeights) {
                      const inputs = { ...sh.calculatorInputs };
                      const segHeights = [...(inputs.segmentHeights as Array<{ startH: number; endH: number }>)];
                      if (pi < segHeights.length) segHeights.splice(pi, 1);
                      inputs.segmentHeights = segHeights;
                      sh.calculatorInputs = inputs;
                    }
                    sh.lockedEdges = sh.lockedEdges.filter(e => e.idx !== prev && e.idx !== pi).map(e => e.idx > pi ? { ...e, idx: e.idx - 1 } : e);
                    sh.lockedAngles = sh.lockedAngles.filter(a => a !== pi).map(a => a > pi ? a - 1 : a);
                    n2[si] = sh; return n2;
                  });
                  // Update linked groups: vertex {si,pi} becomes arc {si, newEdgeIdx, newArc.id}; shift other pi on same shape
                  const mergedEdgeIdx = prev;
                  setLinkedGroups(lg => lg.map(g => g.map(p => {
                    if (p.si === si && !isArcEntry(p) && p.pi === pi)
                      return { si, pi: -1 as const, edgeIdx: newEdgeIdx, arcId: newArc.id };
                    if (p.si === si && !isArcEntry(p) && p.pi > pi)
                      return { ...p, pi: p.pi - 1 };
                    if (p.si === si && isArcEntry(p) && p.edgeIdx > pi)
                      return { ...p, edgeIdx: p.edgeIdx - 1 };
                    if (p.si === si && isArcEntry(p) && p.edgeIdx === mergedEdgeIdx)
                      return p;
                    return p;
                  })).filter(g => g.length >= 2));
                  setContextMenu(null);
                }} />
              )}
              {shapes[contextMenu.shapeIdx]?.closed && (
                <>
                  <CtxItem
                    label={t("project:set_angle_manually")}
                    color={CC.accent}
                    onClick={() => {
                      const si = contextMenu.shapeIdx, pi = contextMenu.pointIdx;
                      const s = shapes[si];
                      const pts = s.points;
                      if (pts.length < 3) return;
                      const n = pts.length;
                      const prev = (pi - 1 + n) % n, next = (pi + 1) % n;
                      const currentAngle = angleDeg(pts[prev], pts[pi], pts[next]);
                      setSetAngleTargetValue(currentAngle.toFixed(1));
                      setSetAngleMode("split");
                      setSetAngleModal({ shapeIdx: si, pointIdx: pi });
                      setContextMenu(null);
                    }}
                  />
                </>
              )}
              {isPointLinked(contextMenu.shapeIdx, contextMenu.pointIdx) ? (
                <CtxItem label={t("project:ctx_unlink_point")} color={CC.text} onClick={() => unlinkPoint(contextMenu.shapeIdx, contextMenu.pointIdx)} />
              ) : (() => {
                const nearby = findAllNearbyPoints(contextMenu.shapeIdx, contextMenu.pointIdx);
                const edges = findAllEdgesPointTouches(contextMenu.shapeIdx, contextMenu.pointIdx);
                if (nearby.length > 0 || edges.length > 0) {
                  return <CtxItem label={t("project:ctx_link_all_at_point")} color={CC.accent} onClick={() => linkAllAtPoint(contextMenu.shapeIdx, contextMenu.pointIdx)} />;
                }
                return null;
              })()}
              {shapes[contextMenu.shapeIdx]?.layer === 2 && (
                <>
                  <div style={{ height: 1, background: CC.panelBorder, margin: "4px 0" }} />
                  {shapes[contextMenu.shapeIdx]?.calculatorResults && (
                    <CtxItem label={`📊 ${t("project:path_view_results")}`} color="#a29bfe" onClick={() => { setResultsModalShapeIdx(contextMenu.shapeIdx); setContextMenu(null); }} />
                  )}
                  <CtxItem label={labelEditObjectCard(shapes[contextMenu.shapeIdx]?.calculatorType, t)} color={CC.accent} onClick={() => { setObjectCardShapeIdx(contextMenu.shapeIdx); setContextMenu(null); }} />
                </>
              )}
              {(() => {
                const s = shapes[contextMenu.shapeIdx];
                if (!s) return null;
                const n = s.points.length;
                const showRemove =
                  isPolygonLinearElement(s) && s.closed ? n > 3
                  : isLinearElement(s) ? n > 2
                  : n > 3;
                if (!showRemove) return null;
                return <CtxItem label={t("project:ctx_remove_point")} color={CC.danger} onClick={() => { removePoint(contextMenu.shapeIdx, contextMenu.pointIdx); }} />;
              })()}
              {contextMenu.shapeIdx >= 0 &&
                shapes[contextMenu.shapeIdx]?.layer === 2 &&
                !contextMenu.adjustmentEmpty &&
                !contextMenu.adjustmentOverflow &&
                !contextMenu.adjustmentOverlap && (
                <>
                  <div style={{ height: 1, background: CC.panelBorder, margin: "4px 0" }} />
                  <CtxItem label={t("project:ctx_remove_element")} color={CC.danger} onClick={() => deleteLayer2ElementFromContext(contextMenu.shapeIdx)} />
                </>
              )}
            </>)}
            {/* Edge menu */}
            {contextMenu.edgeIdx >= 0 && (<>
              {contextMenu.pathContinuationEnd && (() => {
                const si = contextMenu.shapeIdx;
                const s = shapes[si];
                const inp = s.calculatorInputs ?? {};
                const pathCenterline = (inp.pathCenterline as Point[]) ?? s.points;
                const end = contextMenu.pathContinuationEnd;
                return (
                  <CtxItem
                    label={t("project:path_continue_drawing")}
                    color={CC.accent}
                    onClick={() => {
                      const drawMode: Mode = s.elementType === "pathSlabs" ? "drawPathSlabs" : s.elementType === "pathConcreteSlabs" ? "drawPathConcreteSlabs" : "drawPathMonoblock";
                      const pathType: "slabs" | "concreteSlabs" | "monoblock" = s.elementType === "pathSlabs" ? "slabs" : s.elementType === "pathConcreteSlabs" ? "concreteSlabs" : "monoblock";
                      const builtConfig: PathConfig = {
                        pathType,
                        pathWidthM: Number(inp.pathWidthM ?? 0.6),
                        calculatorType: s.calculatorType as "slab" | "concreteSlabs" | "paving",
                        calculatorInputs: { ...(inp as Record<string, unknown>) },
                      };
                      const orderedPts = end === "first" ? [...pathCenterline].reverse() : pathCenterline.map((p: Point) => ({ ...p }));
                      saveHistory();
                      setShapes(prev => {
                        const n = [...prev];
                        const sh = n[si];
                        n[si] = {
                          ...sh,
                          points: orderedPts,
                          closed: false,
                          calculatorInputs: { ...sh.calculatorInputs, pathIsOutline: undefined, pathCenterline: undefined, pathCenterlineOriginal: undefined },
                        };
                        return n;
                      });
                      setPathConfig(builtConfig);
                      setMode(drawMode);
                      setDrawingShapeIdx(si);
                      setSelectedShapeIdx(si);
                      setContextMenu(null);
                    }}
                  />
                );
              })()}
              {isLinearElement(shapes[contextMenu.shapeIdx]) && (() => {
                const et = shapes[contextMenu.shapeIdx].elementType;
                const target = et === "fence" || et === "foundation" ? "wall" : et === "wall" ? "kerb" : "polygon";
                const label = target === "wall" ? t("project:align_to_wall") : target === "kerb" ? t("project:align_to_kerb") : t("project:align_to_plot");
                return <CtxItem label={label} color={CC.accent} onClick={() => alignLinearSegmentTo(contextMenu.shapeIdx, contextMenu.edgeIdx, target)} />;
              })()}
              <CtxItem
                label={shapes[contextMenu.shapeIdx]?.lockedEdges.some(e => e.idx === contextMenu.edgeIdx) ? t("project:ctx_unlock_length") : t("project:ctx_lock_length")}
                color={shapes[contextMenu.shapeIdx]?.lockedEdges.some(e => e.idx === contextMenu.edgeIdx) ? CC.locked : CC.text}
                onClick={() => { toggleLockEdge(contextMenu.shapeIdx, contextMenu.edgeIdx); setContextMenu(null); }}
              />
              {contextMenu.pathCenterlineEdgeIdx !== undefined && contextMenu.edgePos !== undefined && (
                <CtxItem label={t("project:ctx_arc_point")} color={CC.accent} onClick={() => {
                  saveHistory();
                  const si = contextMenu.shapeIdx;
                  const ei = contextMenu.pathCenterlineEdgeIdx!;
                  const pts = (shapes[si].calculatorInputs?.pathCenterlineOriginal as Point[]) ?? shapes[si].points;
                  if (ei < 0 || ei >= pts.length - 1) return;
                  const A = pts[ei], B = pts[ei + 1];
                  const arcList = shapes[si].edgeArcs?.[ei] ?? [];
                  const placeholder = { id: "__temp__", t: 0.5, offset: 0 };
                  const { t, offset } = worldToArcPointOnCurve(A, B, [...arcList, placeholder], placeholder, contextMenu.edgePos!);
                  setShapes(p => {
                    const n = [...p]; const s = { ...n[si] };
                    const edgeArcs = s.edgeArcs ? [...s.edgeArcs] : [];
                    while (edgeArcs.length <= ei) edgeArcs.push(null);
                    if (!edgeArcs[ei]) edgeArcs[ei] = [];
                    const arcs = [...(edgeArcs[ei]!), { id: crypto.randomUUID(), t, offset }].sort((a, b) => a.t - b.t);
                    edgeArcs[ei] = arcs;
                    s.edgeArcs = edgeArcs;
                    n[si] = s; return n;
                  });
                  setContextMenu(null);
                }} />
              )}
              {contextMenu.edgePos !== undefined && contextMenu.edgeT !== undefined && (
                <CtxItem label="➕ Dodaj SquarePoint" color={CC.geo} onClick={() => {
                  insertPointOnEdge(contextMenu.shapeIdx, contextMenu.edgeIdx, contextMenu.edgePos!, contextMenu.edgeT!);
                }} />
              )}
              {!isLinearElement(shapes[contextMenu.shapeIdx]) && !isPathElement(shapes[contextMenu.shapeIdx]) && shapes[contextMenu.shapeIdx]?.closed && contextMenu.edgePos !== undefined && contextMenu.edgeT !== undefined && (shapes[contextMenu.shapeIdx].layer === 1 || shapes[contextMenu.shapeIdx].layer === 2) && (
                <CtxItem label="〰 Dodaj arc point" color={CC.accent} onClick={() => {
                  saveHistory();
                  const si = contextMenu.shapeIdx, ei = contextMenu.edgeIdx;
                  const pts = shapes[si].points;
                  const A = pts[ei], B = pts[(ei + 1) % pts.length];
                  const arcList = shapes[si].edgeArcs?.[ei] ?? [];
                  const placeholder = { id: "__temp__", t: 0.5, offset: 0 };
                  const { t, offset } = worldToArcPointOnCurve(A, B, [...arcList, placeholder], placeholder, contextMenu.edgePos!);
                  setShapes(p => {
                    const n = [...p]; const s = { ...n[si] };
                    const edgeArcs = s.edgeArcs ? [...s.edgeArcs] : [];
                    if (!edgeArcs[ei]) edgeArcs[ei] = [];
                    const arcs = [...(edgeArcs[ei]!), { id: crypto.randomUUID(), t, offset }].sort((a, b) => a.t - b.t);
                    edgeArcs[ei] = arcs;
                    s.edgeArcs = edgeArcs;
                    n[si] = s; return n;
                  });
                  setContextMenu(null);
                }} />
              )}
              {shapes[contextMenu.shapeIdx]?.layer === 2 && (
                <>
                  <div style={{ height: 1, background: CC.panelBorder, margin: "4px 0" }} />
                  {shapes[contextMenu.shapeIdx]?.calculatorResults && (
                    <CtxItem label={`📊 ${t("project:path_view_results")}`} color="#a29bfe" onClick={() => { setResultsModalShapeIdx(contextMenu.shapeIdx); setContextMenu(null); }} />
                  )}
                  <CtxItem label={labelEditObjectCard(shapes[contextMenu.shapeIdx]?.calculatorType, t)} color={CC.accent} onClick={() => { setObjectCardShapeIdx(contextMenu.shapeIdx); setContextMenu(null); }} />
                </>
              )}
              {((shapes[contextMenu.shapeIdx]?.elementType === "wall" && isLinearElement(shapes[contextMenu.shapeIdx])) ||
                (isLinearElement(shapes[contextMenu.shapeIdx]) && shapes[contextMenu.shapeIdx].points.length >= 3)) && (
                <div style={{ height: 1, background: CC.panelBorder, margin: "4px 0" }} />
              )}
              {isLinearElement(shapes[contextMenu.shapeIdx]) && shapes[contextMenu.shapeIdx].points.length >= 3 && (
                <CtxItem label="✕ Usuń segment" color={CC.danger} onClick={() => { saveHistory(); removeLinearSegment(contextMenu.shapeIdx, contextMenu.edgeIdx); setContextMenu(null); setSelectedShapeIdx(null); }} />
              )}
              {isLinearElement(shapes[contextMenu.shapeIdx]) && shapes[contextMenu.shapeIdx].layer === 2 && (
                <>
                  <div style={{ height: 1, background: CC.panelBorder, margin: "4px 0" }} />
                  <CtxItem label={t("project:ctx_remove_element")} color={CC.danger} onClick={() => deleteLayer2ElementFromContext(contextMenu.shapeIdx)} />
                </>
              )}
            </>)}
            {/* Shape-level menu (Layer 1 Garden) */}
            {contextMenu.pointIdx === -1 && contextMenu.edgeIdx === -1 && shapes[contextMenu.shapeIdx]?.layer === 1 && shapes[contextMenu.shapeIdx]?.closed && (
              <>
                <div style={{ height: 1, background: CC.panelBorder, margin: "4px 0" }} />
                {contextMenu.interiorWorldPos && (
                  <CtxItem
                    label="➕ Dodaj punkt wysokościowy"
                    color={CC.geo}
                    onClick={() => {
                      const si = contextMenu.shapeIdx;
                      const shape = shapes[si];
                      const wp = contextMenu.interiorWorldPos!;
                      const h = interpolateHeightAtPoint(shape, wp) ?? 0;
                      saveHistory();
                      setShapes(p => {
                        const n = [...p]; const s = { ...n[si] };
                        const hp = s.heightPoints ?? [];
                        s.heightPoints = [...hp, { x: wp.x, y: wp.y, height: h }];
                        n[si] = s; return n;
                      });
                      setContextMenu(null);
                    }}
                  />
                )}
              </>
            )}
            {/* Shape-level menu (Layer 2) */}
            {contextMenu.pointIdx === -1 && contextMenu.edgeIdx === -1 && shapes[contextMenu.shapeIdx]?.layer === 2 && (
              <>
                <div style={{ height: 1, background: CC.panelBorder, margin: "4px 0" }} />
                {isPolygonLinearElement(shapes[contextMenu.shapeIdx]) && findSurfacesOverlappingLinear(shapes, contextMenu.shapeIdx).length > 0 && (
                  <CtxItem label={t("project:align_surfaces_to_linear")} color={CC.accent} onClick={() => {
                    const linearIdx = contextMenu.shapeIdx;
                    const overlappers = findSurfacesOverlappingLinear(shapes, linearIdx);
                    saveHistory();
                    setShapes(p => {
                      const n = [...p];
                      for (const si of overlappers) {
                        const newPts = clipSurfaceToOutsideLinear(shapes, si, linearIdx);
                        if (newPts) n[si] = { ...n[si], points: newPts };
                      }
                      return n;
                    });
                    setContextMenu(null);
                  }} />
                )}
                {shapes[contextMenu.shapeIdx]?.calculatorResults && (
                  <CtxItem label={`📊 ${t("project:path_view_results")}`} color="#a29bfe" onClick={() => { setResultsModalShapeIdx(contextMenu.shapeIdx); setContextMenu(null); }} />
                )}
                {isPathElement(shapes[contextMenu.shapeIdx]) && shapes[contextMenu.shapeIdx]?.closed && shapes[contextMenu.shapeIdx]?.calculatorInputs?.pathCenterline && (() => {
                  const si = contextMenu.shapeIdx;
                  const shape = shapes[si];
                  const pathCenterline = (shape.calculatorInputs?.pathCenterlineOriginal as Point[] | undefined) ?? (shape.calculatorInputs?.pathCenterline as Point[]);
                  if (pathCenterline.length < 2) return null;
                  const segCount = pathCenterline.length - 1;
                  return (
                    <CtxItem
                      label={t("project:path_edit_sides")}
                      color={CC.accent}
                      onClick={() => {
                        saveHistory();
                        setShapes(p => {
                          const n = [...p];
                          const sh = n[si];
                          n[si] = {
                            ...sh,
                            points: pathCenterline.map(p => ({ ...p })),
                            closed: false,
                            calculatorInputs: { ...sh.calculatorInputs, pathIsOutline: undefined, pathCenterline: undefined, pathCenterlineOriginal: undefined },
                          };
                          return n;
                        });
                        setPathSegmentSideSelection({ shapeIdx: si, segmentSides: Array(segCount).fill(null) });
                        setPathConfig({
                          pathType: shape.elementType === "pathSlabs" ? "slabs" : shape.elementType === "pathConcreteSlabs" ? "concreteSlabs" : "monoblock",
                          pathWidthM: Number(shape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6,
                          calculatorType: (shape.calculatorType as "slab" | "concreteSlabs" | "paving") ?? "slab",
                          calculatorInputs: { ...(shape.calculatorInputs ?? {}) } as Record<string, unknown>,
                        });
                        setMode(shape.elementType === "pathSlabs" ? "drawPathSlabs" : shape.elementType === "pathConcreteSlabs" ? "drawPathConcreteSlabs" : "drawPathMonoblock");
                        setContextMenu(null);
                        setSelectedShapeIdx(si);
                      }}
                    />
                  );
                })()}
                <CtxItem
                  label={labelEditObjectCard(shapes[contextMenu.shapeIdx]?.calculatorType, t)}
                  color={CC.accent}
                  onClick={() => { setObjectCardShapeIdx(contextMenu.shapeIdx); setContextMenu(null); }}
                />
                {shapes[contextMenu.shapeIdx]?.calculatorType && !isGroundworkLinear(shapes[contextMenu.shapeIdx]) && (
                  <CtxItem label={t("project:remove_calculator")} color={CC.danger} onClick={() => {
                    setShapes(p => {
                      const n = [...p]; const s = { ...n[contextMenu.shapeIdx] };
                      s.calculatorType = undefined; s.calculatorSubType = undefined;
                      s.calculatorInputs = undefined; s.calculatorResults = undefined;
                      n[contextMenu.shapeIdx] = s; return n;
                    });
                    setContextMenu(null);
                  }} />
                )}
              </>
            )}
          </div>
        )}

        {projectSummaryContextMenu !== null && shapes[projectSummaryContextMenu.shapeIdx] && (
          <div ref={projectSummaryMenuRef} style={{ position: "fixed", left: (projectSummaryDisplayPos ?? { x: projectSummaryContextMenu.x, y: projectSummaryContextMenu.y }).x, top: (projectSummaryDisplayPos ?? { x: projectSummaryContextMenu.x, y: projectSummaryContextMenu.y }).y, background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, padding: 4, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,0.5)", minWidth: 160 }}>
            <div style={{ fontSize: 11, color: CC.text, opacity: 0.9, padding: "4px 8px 6px", borderBottom: `1px solid ${CC.panelBorder}`, marginBottom: 4 }}>
              {shapes[projectSummaryContextMenu.shapeIdx].label || translateCalculatorTypeLabel(shapes[projectSummaryContextMenu.shapeIdx].calculatorType ?? "", t) || t("project:summary_fallback_element")}
            </div>
            {shapes[projectSummaryContextMenu.shapeIdx]?.calculatorResults && (
              <CtxItem label={`📊 ${t("project:path_view_results")}`} color="#a29bfe" onClick={() => { setResultsModalShapeIdx(projectSummaryContextMenu.shapeIdx); setProjectSummaryContextMenu(null); }} />
            )}
            <CtxItem label={t("project:ctx_remove_element")} color={CC.danger} onClick={() => {
              saveHistory();
              setShapes(p => p.filter((_, i) => i !== projectSummaryContextMenu.shapeIdx));
              setSelectedShapeIdx(null);
              setProjectSummaryContextMenu(null);
            }} />
            <CtxItem label="✏️ Zmień nazwę" color={CC.accent} onClick={() => {
              setNamePromptShapeIdx(projectSummaryContextMenu.shapeIdx);
              setProjectSummaryContextMenu(null);
            }} />
          </div>
        )}

        {editingDim && (() => {
          const rect = canvasRef.current?.getBoundingClientRect();
          const dimShape = shapes[editingDim.shapeIdx];
          let dialogLeft: number;
          let dialogTop: number;
          if (rect && dimShape && dimShape.points.length >= 2) {
            const ei = editingDim.edgeIdx;
            const j = (ei + 1) % dimShape.points.length;
            const pA = dimShape.points[ei];
            const pB = dimShape.points[j];
            if (pA && pB) {
              const pos = computeDimEditDialogPosition(
                rect,
                worldToScreen(pA.x, pA.y),
                worldToScreen(pB.x, pB.y),
                editingDim.x,
                editingDim.y,
              );
              dialogLeft = pos.left;
              dialogTop = pos.top;
            } else {
              dialogLeft = Math.max(rect.left + 12, Math.min(rect.right - DIM_EDIT_DIALOG_W - 12, editingDim.x - DIM_EDIT_DIALOG_W / 2));
              dialogTop = Math.max(rect.top + 12, Math.min(rect.bottom - DIM_EDIT_DIALOG_H - 12, editingDim.y - DIM_EDIT_DIALOG_H / 2));
            }
          } else if (rect) {
            dialogLeft = Math.max(rect.left + 12, Math.min(rect.right - DIM_EDIT_DIALOG_W - 12, editingDim.x - DIM_EDIT_DIALOG_W / 2));
            dialogTop = Math.max(rect.top + 12, Math.min(rect.bottom - DIM_EDIT_DIALOG_H - 12, editingDim.y - DIM_EDIT_DIALOG_H / 2));
          } else {
            dialogLeft = editingDim.x - DIM_EDIT_DIALOG_W / 2;
            dialogTop = editingDim.y - DIM_EDIT_DIALOG_H / 2;
          }
          return (
            <div style={{ position: "fixed", left: dialogLeft, top: dialogTop, zIndex: 200, background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", width: DIM_EDIT_DIALOG_W, boxSizing: "border-box" }} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Enter") applyDimEdit(); if (e.key === "Escape") setEditingDim(null); }}>
              <div style={{ fontWeight: 600, marginBottom: 16, color: CC.text }}>{t("project:dim_edit_title")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 13, color: CC.text }}>{t("project:dim_edit_length")}:</span>
                <input
                  autoFocus
                  type="number"
                  min={0.001}
                  step={0.01}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") applyDimEdit(); if (e.key === "Escape") setEditingDim(null); }}
                  style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }}
                />
                <span style={{ color: CC.textDim }}>m</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: CC.text }}>
                  <input type="radio" name="dimMode" checked={editingDimMode === "a"} onChange={() => setEditingDimMode("a")} />
                  {t("project:dim_edit_mode_a")}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: CC.text }}>
                  <input type="radio" name="dimMode" checked={editingDimMode === "b"} onChange={() => setEditingDimMode("b")} />
                  {t("project:dim_edit_mode_b")}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: CC.text }}>
                  <input type="radio" name="dimMode" checked={editingDimMode === "split"} onChange={() => setEditingDimMode("split")} />
                  {t("project:dim_edit_mode_split")}
                </label>
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button onClick={() => setEditingDim(null)} style={{ padding: "8px 16px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, cursor: "pointer", fontSize: 13 }}>{t("project:set_angle_cancel")}</button>
                <button onClick={applyDimEdit} style={{ padding: "8px 16px", background: CC.accent, border: "none", borderRadius: 6, color: CC.bg, cursor: "pointer", fontSize: 13 }}>{t("project:set_angle_apply")}</button>
              </div>
            </div>
          );
        })()}

        {pointOffsetAlongLineModal && (() => {
          const m = pointOffsetAlongLineModal;
          const pad = 12;
          const vh = typeof window !== "undefined" ? window.innerHeight : 640;
          const viewportBudget = Math.max(160, vh - pad * 2);
          const placeH = Math.min(OFFSET_ALONG_LINE_DIALOG_H, viewportBudget);
          const { left: dialogLeft, top: dialogTop } = clampCenteredFixedDialog(
            m.screenX,
            m.screenY,
            OFFSET_ALONG_LINE_DIALOG_W,
            placeH,
            pad
          );
          return (
            <div
              style={{
                position: "fixed",
                left: dialogLeft,
                top: dialogTop,
                zIndex: 200,
                background: CC.panel,
                border: `1px solid ${CC.panelBorder}`,
                borderRadius: 8,
                padding: 20,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                width: OFFSET_ALONG_LINE_DIALOG_W,
                maxHeight: viewportBudget,
                overflowY: "auto",
                boxSizing: "border-box",
              }}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === "Enter") applyPointOffsetAlongLine();
                if (e.key === "Escape") setPointOffsetAlongLineModal(null);
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 12, color: CC.text }}>{t("project:offset_along_line_modal_title")}</div>
              <div style={{ fontSize: 12, color: CC.textDim, marginBottom: 12 }}>{t("project:offset_along_line_modal_hint")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 13, color: CC.text }}>{t("project:offset_along_line_distance")}</span>
                <input
                  autoFocus
                  type="number"
                  min={0.001}
                  step={0.001}
                  value={pointOffsetAlongLineValue}
                  onChange={e => setPointOffsetAlongLineValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") applyPointOffsetAlongLine();
                    if (e.key === "Escape") setPointOffsetAlongLineModal(null);
                  }}
                  style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }}
                />
                <span style={{ color: CC.textDim }}>m</span>
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setPointOffsetAlongLineModal(null)} style={{ padding: "8px 16px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, cursor: "pointer", fontSize: 13 }}>{t("project:set_angle_cancel")}</button>
                <button type="button" onClick={applyPointOffsetAlongLine} style={{ padding: "8px 16px", background: CC.accent, border: "none", borderRadius: 6, color: CC.bg, cursor: "pointer", fontSize: 13 }}>{t("project:set_angle_apply")}</button>
              </div>
            </div>
          );
        })()}

        {editingGeodesyCard ? (() => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return null;
          const { cardInfo } = editingGeodesyCard;
          const { left, top } = cardInfo.cardBounds;
          const fixedLeft = rect.left + left;
          const fixedTop = rect.top + top;
          const cardW = cardInfo.cardBounds.right - cardInfo.cardBounds.left;
          const cardH = cardInfo.cardBounds.bottom - cardInfo.cardBounds.top;
          return (
            <div
              style={{
                position: "fixed",
                left: fixedLeft,
                top: fixedTop,
                width: cardW,
                minHeight: cardH,
                zIndex: 100,
                background: "rgba(26,26,46,0.95)",
                border: `1px solid ${CC.geo}`,
                borderRadius: 4,
                padding: GEODESY_CARD_PAD,
                font: "10px 'JetBrains Mono',monospace",
              }}
              ref={geodesyCardRef}
              onBlur={e => {
                if (e.relatedTarget && geodesyCardRef.current?.contains(e.relatedTarget as Node)) return;
                applyHeightEdit(true);
              }}
              onKeyDown={e => { if (e.key === "Escape") { skipBlurRef.current = true; applyHeightEdit(); requestAnimationFrame(() => { skipBlurRef.current = false; }); } }}
            >
              {cardInfo.entries.map((entry, rowIdx) => (
                <div key={rowIdx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: rowIdx < cardInfo.entries.length - 1 ? 4 : 0, height: GEODESY_CARD_ROW_H }}>
                  <span style={{ color: "#fff", minWidth: 80 }}>{entry.label}</span>
                  <input
                    autoFocus={rowIdx === 0}
                    value={heightValues[rowIdx] ?? ""}
                    onChange={e => {
                      const v = [...heightValues];
                      v[rowIdx] = e.target.value;
                      setHeightValues(v);
                    }}
                    onFocus={e => {
                      if (!heightInputSelectOnceRef.current && rowIdx === 0) {
                        heightInputSelectOnceRef.current = true;
                        e.target.select();
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { skipBlurRef.current = true; applyHeightEdit(); requestAnimationFrame(() => { skipBlurRef.current = false; }); }
                    }}
                    style={{ flex: 1, padding: "2px 6px", background: CC.panel, border: `2px solid ${CC.geo}`, borderRadius: 4, color: CC.geo, fontFamily: "inherit", fontSize: 12, outline: "none", textAlign: "right" }}
                    placeholder="cm"
                  />
                  <span style={{ color: CC.geo, fontSize: 11 }}>cm</span>
                </div>
              ))}
            </div>
          );
        })() : null}

        {shapeCreationModal && (
          <div className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setShapeCreationModal(null)}>
            <div className="canvas-modal-content" style={{ background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 320, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 600, marginBottom: 16, color: CC.text }}>
                {shapeCreationModal.type === "square" && t("project:toolbar_shape_square")}
                {shapeCreationModal.type === "rectangle" && t("project:toolbar_shape_rectangle")}
                {shapeCreationModal.type === "triangle" && t("project:toolbar_shape_triangle")}
                {shapeCreationModal.type === "trapezoid" && t("project:toolbar_shape_trapezoid")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 120, fontSize: 13, color: CC.text }}>{t("project:shape_modal_name_label")}</span>
                  <input type="text" value={shapeInputs.name} onChange={e => setShapeInputs(p => ({ ...p, name: e.target.value }))}
                    placeholder={shapeCreationModal.type === "square" ? t("project:name_placeholder_patio") : shapeCreationModal.type === "rectangle" ? t("project:name_placeholder_terrace") : shapeCreationModal.type === "triangle" ? t("project:name_placeholder_flowerbed") : t("project:name_placeholder_border")}
                    style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }} />
                </label>
                {shapeCreationModal.type === "square" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 120, fontSize: 13, color: CC.text }}>{t("project:shape_modal_side_m")}</span>
                    <input type="number" min="0.1" step="0.1" value={shapeInputs.side} onChange={e => setShapeInputs(p => ({ ...p, side: e.target.value }))}
                      style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }} />
                  </label>
                )}
                {shapeCreationModal.type === "rectangle" && (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: CC.text }}>{t("project:shape_modal_width_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.width} onChange={e => setShapeInputs(p => ({ ...p, width: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: CC.text }}>{t("project:shape_modal_height_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.height} onChange={e => setShapeInputs(p => ({ ...p, height: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }} />
                    </label>
                  </>
                )}
                {shapeCreationModal.type === "triangle" && (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: CC.text }}>{t("project:shape_modal_base_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.base} onChange={e => setShapeInputs(p => ({ ...p, base: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: CC.text }}>{t("project:shape_modal_height_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.height} onChange={e => setShapeInputs(p => ({ ...p, height: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }} />
                    </label>
                  </>
                )}
                {shapeCreationModal.type === "trapezoid" && (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: CC.text }}>{t("project:shape_modal_top_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.top} onChange={e => setShapeInputs(p => ({ ...p, top: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: CC.text }}>{t("project:shape_modal_bottom_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.bottom} onChange={e => setShapeInputs(p => ({ ...p, bottom: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: CC.text }}>{t("project:shape_modal_height_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.height} onChange={e => setShapeInputs(p => ({ ...p, height: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }} />
                    </label>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  onClick={() => {
                    const { type } = shapeCreationModal;
                    const label = (shapeInputs.name || "").trim() || (type === "square" ? t("project:toolbar_shape_square") : type === "rectangle" ? t("project:toolbar_shape_rectangle") : type === "triangle" ? t("project:toolbar_shape_triangle") : t("project:toolbar_shape_trapezoid"));
                    if (type === "square") addShape((cx2, cy2, l) => ({ ...makeSquare(cx2, cy2, l, parseFloat(shapeInputs.side) || 4), label }));
                    else if (type === "rectangle") addShape((cx2, cy2, l) => ({ ...makeRectangle(cx2, cy2, l, parseFloat(shapeInputs.width) || 6, parseFloat(shapeInputs.height) || 4), label }));
                    else if (type === "triangle") addShape((cx2, cy2, l) => ({ ...makeTriangle(cx2, cy2, l, parseFloat(shapeInputs.base) || 5, parseFloat(shapeInputs.height) || 4), label }));
                    else addShape((cx2, cy2, l) => ({ ...makeTrapezoid(cx2, cy2, l, parseFloat(shapeInputs.top) || 3, parseFloat(shapeInputs.bottom) || 6, parseFloat(shapeInputs.height) || 4), label }));
                    setShapeCreationModal(null);
                  }}
                  style={{ padding: "8px 16px", background: CC.accent, border: "none", borderRadius: 6, color: CC.bg, cursor: "pointer", fontSize: 13 }}
                >
                  {t("project:shape_modal_create_btn")}
                </button>
              </div>
            </div>
          </div>
        )}

        {stairsCreationModal && (
          <StairsCreationModal
            subType={stairsCreationModal.subType}
            label={stairsCreationModal.name}
            onClose={() => setStairsCreationModal(null)}
            onCreate={(shape) => {
              saveHistory();
              setShapes(p => [...p, shape]);
              setSelectedShapeIdx(shapes.length);
              setMode("select");
              setStairsCreationModal(null);
            }}
            projectSettings={projectSettings}
            onProjectSettingsChange={updates => setProjectSettings(p => ({ ...p, ...updates }))}
            recalculateTrigger={recalculateTrigger}
            centerX={(canvasSize.w / 2 - pan.x) / zoom}
            centerY={(canvasSize.h / 2 - pan.y) / zoom}
            layer={(activeLayer === 3 || activeLayer === 4 ? 2 : activeLayer) as LayerID}
          />
        )}

        {pathCreationModal && (
          <PathCreationModal
            subType={pathCreationModal.subType}
            label={pathCreationModal.name}
            onClose={() => setPathCreationModal(null)}
            onConfirm={(config) => {
              setPathConfig(config);
              setPathCreationModal(null);
              setMode(config.pathType === "slabs" ? "drawPathSlabs" : config.pathType === "concreteSlabs" ? "drawPathConcreteSlabs" : "drawPathMonoblock");
              setDrawingShapeIdx(null);
              setSelectedShapeIdx(null);
            }}
          />
        )}

        {namePromptShapeIdx !== null && shapes[namePromptShapeIdx] && (
          <NamePromptModal
            initialLabel={shapes[namePromptShapeIdx].label ?? ""}
            onConfirm={(val) => {
              saveHistory();
              setShapes(p => {
                const n = [...p];
                n[namePromptShapeIdx] = { ...n[namePromptShapeIdx], label: val || n[namePromptShapeIdx].label, namePromptShown: true };
                return n;
              });
              setNamePromptShapeIdx(null);
            }}
            onCancel={() => {
              setShapes(p => {
                const n = [...p];
                n[namePromptShapeIdx] = { ...n[namePromptShapeIdx], namePromptShown: true };
                return n;
              });
              setNamePromptShapeIdx(null);
            }}
          />
        )}

        {resultsModalShapeIdx !== null && shapes[resultsModalShapeIdx]?.calculatorResults && (
          <ResultsModal
            shape={shapes[resultsModalShapeIdx]}
            onClose={() => setResultsModalShapeIdx(null)}
            onEdit={() => { setObjectCardShapeIdx(resultsModalShapeIdx); setResultsModalShapeIdx(null); }}
            onRename={(newLabel) => {
              saveHistory();
              setShapes(p => { const n = [...p]; n[resultsModalShapeIdx] = { ...n[resultsModalShapeIdx], label: newLabel }; return n; });
            }}
          />
        )}

        {setAngleModal && (() => {
          const si = setAngleModal.shapeIdx, pi = setAngleModal.pointIdx;
          const shape = shapes[si];
          if (!shape?.closed || shape.points.length < 3 || pi < 0 || pi >= shape.points.length) return null;
          const pts = shape.points;
          const n = pts.length;
          const prev = (pi - 1 + n) % n, next = (pi + 1) % n;
          const V = pts[pi], prevPt = pts[prev], nextPt = pts[next];
          const currentAngle = angleDeg(prevPt, V, nextPt);
          const applyAngle = () => {
            const targetVal = parseFloat(setAngleTargetValue);
            if (isNaN(targetVal)) return;
            const targetAngle = Math.max(1, Math.min(359, targetVal));
            let delta = targetAngle - currentAngle;
            const cross = (prevPt.x - V.x) * (nextPt.y - V.y) - (prevPt.y - V.y) * (nextPt.x - V.x);
            const sa = pts.reduce((acc, p, idx) => acc + p.x * pts[(idx + 1) % n].y - pts[(idx + 1) % n].x * p.y, 0) / 2;
            // Flip for convex vertices (cross<0 for CCW); concave vertices work without flip
            const isConvex = (sa > 0 && cross < 0) || (sa < 0 && cross > 0);
            if (isConvex) delta = -delta;
            if (Math.abs(delta) < 0.01) { setSetAngleModal(null); return; }
            saveHistory();
            setShapes(p => {
              const ns = [...p];
              const s = { ...ns[si] };
              const np = [...s.points];
              const nV = np[pi];
              if (setAngleMode === "a") {
                const newPrev = rotatePointAround(nV, np[prev], -delta);
                np[prev] = newPrev;
                const dragEntry: LinkedEntry = { si, pi: prev };
                const group = linkedGroups.find(g => g.some(lp => linkedEntriesMatch(lp, dragEntry)));
                if (group) {
                  for (const lp of group) {
                    if (linkedEntriesMatch(lp, dragEntry)) continue;
                    if (ns[lp.si]) {
                      if (lp.si === si && !isArcEntry(lp)) { np[lp.pi] = { x: newPrev.x, y: newPrev.y }; continue; }
                      const ls = { ...ns[lp.si] };
                      if (isArcEntry(lp)) {
                        const lea = ls.edgeArcs ? [...ls.edgeArcs] : [];
                        const lArcs = lea[lp.edgeIdx] ? [...lea[lp.edgeIdx]!] : [];
                        const li = lArcs.findIndex(a => a.id === lp.arcId);
                        if (li >= 0) {
                          const lA = ls.points[lp.edgeIdx];
                          const lB = ls.points[(lp.edgeIdx + 1) % ls.points.length];
                          const { t: lt, offset: lo } = worldToArcPointOnCurve(lA, lB, lArcs, lArcs[li]!, newPrev);
                          lArcs[li] = { ...lArcs[li], t: lt, offset: lo };
                          lea[lp.edgeIdx] = lArcs;
                          ls.edgeArcs = lea;
                          ns[lp.si] = ls;
                        }
                      } else {
                        const lpts = [...ls.points];
                        lpts[lp.pi] = { x: newPrev.x, y: newPrev.y };
                        ls.points = lpts;
                        ns[lp.si] = ls;
                      }
                    }
                  }
                }
              } else if (setAngleMode === "b") {
                const newNext = rotatePointAround(nV, np[next], delta);
                np[next] = newNext;
                const dragEntry: LinkedEntry = { si, pi: next };
                const group = linkedGroups.find(g => g.some(lp => linkedEntriesMatch(lp, dragEntry)));
                if (group) {
                  for (const lp of group) {
                    if (linkedEntriesMatch(lp, dragEntry)) continue;
                    if (ns[lp.si]) {
                      if (lp.si === si && !isArcEntry(lp)) { np[lp.pi] = { x: newNext.x, y: newNext.y }; continue; }
                      const ls = { ...ns[lp.si] };
                      if (isArcEntry(lp)) {
                        const lea = ls.edgeArcs ? [...ls.edgeArcs] : [];
                        const lArcs = lea[lp.edgeIdx] ? [...lea[lp.edgeIdx]!] : [];
                        const li = lArcs.findIndex(a => a.id === lp.arcId);
                        if (li >= 0) {
                          const lA = ls.points[lp.edgeIdx];
                          const lB = ls.points[(lp.edgeIdx + 1) % ls.points.length];
                          const { t: lt, offset: lo } = worldToArcPointOnCurve(lA, lB, lArcs, lArcs[li]!, newNext);
                          lArcs[li] = { ...lArcs[li], t: lt, offset: lo };
                          lea[lp.edgeIdx] = lArcs;
                          ls.edgeArcs = lea;
                          ns[lp.si] = ls;
                        }
                      } else {
                        const lpts = [...ls.points];
                        lpts[lp.pi] = { x: newNext.x, y: newNext.y };
                        ls.points = lpts;
                        ns[lp.si] = ls;
                      }
                    }
                  }
                }
              } else {
                const newPrev = rotatePointAround(nV, np[prev], -delta / 2);
                const newNext = rotatePointAround(nV, np[next], delta / 2);
                np[prev] = newPrev;
                np[next] = newNext;
                for (const pt of [prev, next]) {
                  const newPos = pt === prev ? newPrev : newNext;
                  const dragEntry: LinkedEntry = { si, pi: pt };
                  const group = linkedGroups.find(g => g.some(lp => linkedEntriesMatch(lp, dragEntry)));
                  if (group) {
                    for (const lp of group) {
                      if (linkedEntriesMatch(lp, dragEntry)) continue;
                      if (ns[lp.si]) {
                        if (lp.si === si && !isArcEntry(lp)) { np[lp.pi] = { x: newPos.x, y: newPos.y }; continue; }
                        const ls = { ...ns[lp.si] };
                        if (isArcEntry(lp)) {
                          const lea = ls.edgeArcs ? [...ls.edgeArcs] : [];
                          const lArcs = lea[lp.edgeIdx] ? [...lea[lp.edgeIdx]!] : [];
                          const li = lArcs.findIndex(a => a.id === lp.arcId);
                          if (li >= 0) {
                            const lA = ls.points[lp.edgeIdx];
                            const lB = ls.points[(lp.edgeIdx + 1) % ls.points.length];
                            const { t: lt, offset: lo } = worldToArcPointOnCurve(lA, lB, lArcs, lArcs[li]!, newPos);
                            lArcs[li] = { ...lArcs[li], t: lt, offset: lo };
                            lea[lp.edgeIdx] = lArcs;
                            ls.edgeArcs = lea;
                            ns[lp.si] = ls;
                          }
                        } else {
                          const lpts = [...ls.points];
                          lpts[lp.pi] = { x: newPos.x, y: newPos.y };
                          ls.points = lpts;
                          ns[lp.si] = ls;
                        }
                      }
                    }
                  }
                }
              }
              s.points = np;
              ns[si] = s;
              return ns;
            });
            setSetAngleModal(null);
          };
          const rect = canvasRef.current?.getBoundingClientRect();
          const dialogLeft = rect ? Math.max(rect.left + 20, Math.min(rect.right - 280, rect.left + rect.width * 0.6)) : 20;
          const dialogTop = rect ? Math.max(rect.top + 20, Math.min(rect.bottom - 320, rect.top + rect.height * 0.4)) : 20;
          return (
            <div style={{ position: "fixed", left: dialogLeft, top: dialogTop, zIndex: 200, background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", minWidth: 260 }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 600, marginBottom: 16, color: CC.text }}>{t("project:set_angle_modal_title")}</div>
              <div style={{ fontSize: 13, color: CC.textDim, marginBottom: 8 }}>{t("project:set_angle_current")}: {currentAngle.toFixed(1)}°</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 13, color: CC.text }}>{t("project:set_angle_new")}:</span>
                <input
                  type="number"
                  min={1}
                  max={359}
                  step={0.1}
                  value={setAngleTargetValue}
                  onChange={e => setSetAngleTargetValue(e.target.value)}
                  style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }}
                />
                <span style={{ color: CC.textDim }}>°</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: CC.text }}>
                  <input type="radio" name="angleMode" checked={setAngleMode === "a"} onChange={() => setSetAngleMode("a")} />
                  {t("project:set_angle_mode_a")}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: CC.text }}>
                  <input type="radio" name="angleMode" checked={setAngleMode === "b"} onChange={() => setSetAngleMode("b")} />
                  {t("project:set_angle_mode_b")}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: CC.text }}>
                  <input type="radio" name="angleMode" checked={setAngleMode === "split"} onChange={() => setSetAngleMode("split")} />
                  {t("project:set_angle_mode_split")}
                </label>
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button onClick={() => setSetAngleModal(null)} style={{ padding: "8px 16px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, cursor: "pointer", fontSize: 13 }}>{t("project:set_angle_cancel")}</button>
                <button onClick={applyAngle} style={{ padding: "8px 16px", background: CC.accent, border: "none", borderRadius: 6, color: CC.bg, cursor: "pointer", fontSize: 13 }}>{t("project:set_angle_apply")}</button>
              </div>
            </div>
          );
        })()}

        {grassTrimModal && (
          <div className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setGrassTrimModal(null)}>
            <div className="canvas-modal-content" style={{ background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 600, marginBottom: 12, color: CC.text }}>Łączenie rolek trawy</div>
              <p style={{ fontSize: 13, color: CC.textDim, marginBottom: 16, lineHeight: 1.5 }}>
                Przy łączeniu rolek, aby uzyskać najlepszy efekt, ucinamy boki które się łączą o 3 cm (3 rzędy trawy).
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  onClick={() => {
                    const { shapeIdx, pieceAIdx, pieceBIdx, edgeIdx } = grassTrimModal;
                    setShapes(p => {
                      const n = [...p];
                      const s = { ...n[shapeIdx] };
                      const inputs = { ...s.calculatorInputs };
                      const pieces = [...(inputs.vizPieces as GrassPiece[])];
                      const pa = pieces[pieceAIdx];
                      const pb = pieces[pieceBIdx];
                      if (pa && pb) {
                        const trimA = [...(pa.trimEdges ?? [])];
                        const trimB = [...(pb.trimEdges ?? [])];
                        const joinEdgeA = edgeIdx;
                        const joinEdgeB = (edgeIdx + 2) % 4;
                        if (!trimA.includes(joinEdgeA)) trimA.push(joinEdgeA);
                        if (!trimB.includes(joinEdgeB)) trimB.push(joinEdgeB);
                        pieces[pieceAIdx] = { ...pa, trimmed: true, trimEdges: trimA };
                        pieces[pieceBIdx] = { ...pb, trimmed: true, trimEdges: trimB };
                        const effectiveAreaM2 = (computeAutoFill(s, n).areaM2 ?? 0);
                        const artificialGrassAreaM2 = getEffectiveTotalArea(pieces);
                        const vizPiecesWithEffective = pieces.map((p, i) => {
                          const { effectiveWidthM, effectiveLengthM } = getEffectivePieceDimensionsForInput(p, pieces, i);
                          return { ...p, effectiveWidthM, effectiveLengthM };
                        });
                        inputs.vizPieces = vizPiecesWithEffective;
                        inputs.effectiveAreaM2 = effectiveAreaM2;
                        inputs.artificialGrassAreaM2 = artificialGrassAreaM2;
                        const cov = validateCoverage(s, vizPiecesWithEffective);
                        inputs.jointsLength = String(cov.joinLengthM.toFixed(2));
                        inputs.trimLength = String(cov.trimLengthM.toFixed(2));
                        n[shapeIdx] = { ...s, calculatorInputs: inputs };
                      }
                      return n;
                    });
                    setGrassTrimModal(null);
                  }}
                  style={{ padding: "8px 16px", background: CC.accent, border: "none", borderRadius: 6, color: CC.bg, cursor: "pointer", fontSize: 13 }}
                >
                  Akceptuj
                </button>
                <button
                  onClick={() => {
                    const { shapeIdx } = grassTrimModal;
                    setShapes(p => {
                      const n = [...p];
                      const s = { ...n[shapeIdx] };
                      const inputs = { ...s.calculatorInputs };
                      const pieces = (inputs.vizPieces as GrassPiece[]) ?? [];
                      const effectiveAreaM2 = (computeAutoFill(s, n).areaM2 ?? 0);
                      const artificialGrassAreaM2 = getEffectiveTotalArea(pieces);
                      const vizPiecesWithEffective = pieces.map((pc, i) => {
                        const { effectiveWidthM, effectiveLengthM } = getEffectivePieceDimensionsForInput(pc, pieces, i);
                        return { ...pc, effectiveWidthM, effectiveLengthM };
                      });
                      inputs.vizPieces = vizPiecesWithEffective;
                      inputs.effectiveAreaM2 = effectiveAreaM2;
                      inputs.artificialGrassAreaM2 = artificialGrassAreaM2;
                      const cov = validateCoverage(s, vizPiecesWithEffective);
                      inputs.jointsLength = String(cov.joinLengthM.toFixed(2));
                      inputs.trimLength = String(cov.trimLengthM.toFixed(2));
                      n[shapeIdx] = { ...s, calculatorInputs: inputs };
                      return n;
                    });
                    setGrassTrimModal(null);
                  }}
                  style={{ padding: "8px 16px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, cursor: "pointer", fontSize: 13 }}
                >
                  {t("project:grass_trim_keep_full_width")}
                </button>
              </div>
            </div>
          </div>
        )}

        {adjustmentFillModal && (
          <div className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setAdjustmentFillModal(null)}>
            <div className="canvas-modal-content" style={{ background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 600, marginBottom: 12, color: CC.text }}>{t("project:adjustment_fill_pick")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {findTouchingElementsForEmptyArea(shapes, adjustmentData.emptyAreas[adjustmentFillModal.emptyAreaIdx] ?? []).map(si => {
                  const s = shapes[si];
                  const name = shapeDisplayName(s, si, t);
                  return (
                    <button
                      key={si}
                      onClick={() => {
                        const emptyArea = adjustmentData.emptyAreas[adjustmentFillModal!.emptyAreaIdx];
                        const newPts = extendShapeToCoverEmptyArea(shapes, si, emptyArea);
                        if (newPts) {
                          saveHistory();
                          setShapes(p => {
                            const n = [...p];
                            n[si] = applyPolygonPointsToShape(n[si], newPts);
                            return n;
                          });
                        }
                        setAdjustmentFillModal(null);
                      }}
                      style={{ padding: "10px 16px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, cursor: "pointer", fontSize: 13, textAlign: "left" }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setAdjustmentFillModal(null)} style={{ padding: "8px 16px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, cursor: "pointer", fontSize: 13 }}>{t("project:cancel_button")}</button>
            </div>
          </div>
        )}

        {adjustmentExtendModal && (
          <div className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setAdjustmentExtendModal(null)}>
            <div className="canvas-modal-content" style={{ background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 600, marginBottom: 12, color: CC.text }}>{t("project:adjustment_extend_pick", { defaultValue: "Wybierz element do dosunięcia" })}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {findTouchingElementsForEmptyArea(shapes, adjustmentData.emptyAreas[adjustmentExtendModal.emptyAreaIdx] ?? []).map(si => {
                  const s = shapes[si];
                  const name = s?.label || s?.calculatorType || s?.elementType || `Element ${si + 1}`;
                  return (
                    <button
                      key={si}
                      onClick={() => {
                        const emptyArea = adjustmentData.emptyAreas[adjustmentExtendModal!.emptyAreaIdx];
                        const newPts = extendShapeToGardenEdge(shapes, si, emptyArea);
                        if (newPts) {
                          saveHistory();
                          setShapes(p => {
                            const n = [...p];
                            n[si] = applyPolygonPointsToShape(n[si], newPts);
                            return n;
                          });
                        }
                        setAdjustmentExtendModal(null);
                      }}
                      style={{ padding: "10px 16px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, cursor: "pointer", fontSize: 13, textAlign: "left" }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setAdjustmentExtendModal(null)} style={{ padding: "8px 16px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, cursor: "pointer", fontSize: 13 }}>{t("project:cancel_button")}</button>
            </div>
          </div>
        )}

        {adjustmentSpreadModal && (
          <div className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setAdjustmentSpreadModal(null)}>
            <div className="canvas-modal-content" style={{ background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 600, marginBottom: 12, color: CC.text }}>{t("project:adjustment_spread_pick")}</div>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                {[adjustmentSpreadModal.shapeIdxA, adjustmentSpreadModal.shapeIdxB].map(si => {
                  const s = shapes[si];
                  const name = s?.label || s?.calculatorType || s?.elementType || `Element ${si + 1}`;
                  return (
                    <button
                      key={si}
                      onClick={() => {
                        const overlap = adjustmentData.overlaps[adjustmentSpreadModal!.overlapIdx]?.overlapPolygon;
                        if (!overlap) return;
                        const cOverlap = centroid(overlap);
                        const sPts = shapes[si].points;
                        const cShape = centroid(sPts);
                        const dx = cShape.x - cOverlap.x;
                        const dy = cShape.y - cOverlap.y;
                        const len = Math.sqrt(dx * dx + dy * dy) || 1;
                        const shift = 0.5;
                        const moveX = (dx / len) * shift;
                        const moveY = (dy / len) * shift;
                        saveHistory();
                        setShapes(p => {
                          const n = [...p];
                          n[si] = { ...n[si], points: n[si].points.map(pt => ({ x: pt.x + moveX, y: pt.y + moveY })) };
                          return n;
                        });
                        setAdjustmentSpreadModal(null);
                      }}
                      style={{ padding: "10px 16px", background: CC.accent, border: "none", borderRadius: 6, color: CC.bg, cursor: "pointer", fontSize: 13 }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setAdjustmentSpreadModal(null)} style={{ padding: "8px 16px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, cursor: "pointer", fontSize: 13 }}>{t("project:cancel_button")}</button>
            </div>
          </div>
        )}

        {objectCardShapeIdx !== null && shapes[objectCardShapeIdx] && isPathElement(shapes[objectCardShapeIdx]) && (
          <PathCreationModal
            mode="edit"
            subType={shapes[objectCardShapeIdx].elementType === "pathSlabs" ? "slabs" : shapes[objectCardShapeIdx].elementType === "pathConcreteSlabs" ? "concreteSlabs" : "monoblock"}
            label={shapes[objectCardShapeIdx].label ?? (shapes[objectCardShapeIdx].elementType === "pathSlabs" ? t("project:results_path_slabs") : shapes[objectCardShapeIdx].elementType === "pathConcreteSlabs" ? t("project:results_path_concrete_slabs") : t("project:results_path_monoblock"))}
            shape={shapes[objectCardShapeIdx]}
            shapeIdx={objectCardShapeIdx}
            shapes={shapes}
            autoCalculateTrigger={objectCardShapeIdx === pathJustFinishedForAutoCalc ? 1 : 0}
            onClose={() => { setObjectCardShapeIdx(null); setPathJustFinishedForAutoCalc(null); }}
            onSave={(idx, updates) => {
              saveHistory();
              setShapes(p => {
                const n = [...p];
                const s = n[idx];
                const u = { ...updates } as Record<string, any>;
                const inputs = { ...(s.calculatorInputs ?? {}), ...(u.calculatorInputs ?? {}) };
                if (isPathElement(s) && inputs.pathIsOutline && Array.isArray(inputs.pathCenterline) && inputs.pathCenterline.length >= 2) {
                  const pathWidthM = Number(inputs.pathWidthM ?? 0.6) || 0.6;
                  const segmentSides = inputs.pathSegmentSides as ("left" | "right")[] | undefined;
                  const outline = (Array.isArray(segmentSides) && segmentSides.length === (inputs.pathCenterline as Point[]).length - 1)
                    ? computePathOutlineFromSegmentSides(inputs.pathCenterline as Point[], segmentSides, pathWidthM)
                    : computeThickPolyline(inputs.pathCenterline as Point[], toPixels(pathWidthM));
                  if (outline.length >= 3) u.points = outline;
                }
                n[idx] = { ...s, ...u };
                return n;
              });
              setObjectCardShapeIdx(null);
              setPathJustFinishedForAutoCalc(null);
            }}
            onCalculatorInputsChange={onCalculatorInputsChange}
            onCalculatorResultsChange={(idx, results) => {
              saveHistory();
              setShapes(p => {
                const n = [...p];
                n[idx] = { ...n[idx], calculatorResults: results };
                return n;
              });
              setPathJustFinishedForAutoCalc(null);
            }}
            onViewResults={(idx) => { setResultsModalShapeIdx(idx); setObjectCardShapeIdx(null); setPathJustFinishedForAutoCalc(null); }}
          />
        )}

        {objectCardShapeIdx !== null && shapes[objectCardShapeIdx] && !isPathElement(shapes[objectCardShapeIdx]) && (
          <ObjectCardModal
            shapes={shapes}
            shape={shapes[objectCardShapeIdx]}
            shapeIdx={objectCardShapeIdx}
            onClose={() => setObjectCardShapeIdx(null)}
            hideMaterialTransportCarrier
            onCalculatorInputsChange={onCalculatorInputsChange}
            onSave={(idx, updates) => {
              setShapes(p => {
                const u = { ...updates } as Record<string, any>;
                const createLinked = u._createLinkedFoundation;
                delete u._createLinkedFoundation;
                const n = [...p];
                n[idx] = { ...n[idx], ...u };
                if (createLinked && n[idx].elementType === "wall" && n[idx].points.length >= 2) {
                  const wall = n[idx];
                  const foundationWidth = parseFloat(String(wall.calculatorInputs?.foundationWidth ?? "0.3")) || 0.3;
                  const foundationShape: Shape = {
                    points: wall.points.map(pt => ({ ...pt })),
                    closed: false,
                    label: (wall.label || "Wall") + " (Foundation)",
                    layer: 2,
                    lockedEdges: [],
                    lockedAngles: [],
                    heights: [],
                    elementType: "foundation",
                    thickness: foundationWidth,
                    calculatorType: "foundation",
                    calculatorSubType: "default",
                    calculatorInputs: {
                      length: wall.calculatorInputs?.length ?? wall.calculatorResults?.amount,
                      width: foundationWidth,
                      depth: wall.calculatorInputs?.foundationDepthCm ?? "30",
                    },
                  };
                  const newIdx = n.length;
                  n.push(foundationShape);
                  n[idx] = { ...n[idx], linkedShapeIdx: newIdx };
                }
                return n;
              });
              setObjectCardShapeIdx(null);
            }}
            projectSettings={projectSettings}
            onProjectSettingsChange={updates => setProjectSettings(p => ({ ...p, ...updates }))}
          />
        )}
      </div>

      {activeLayer === 4 ? (
        <PreparationPanel
          shapes={shapes}
          soilType={(projectSettings.soilType || "clay") as "clay" | "sand" | "rock"}
          levelingMaterial={(projectSettings.levelingMaterial || "tape1") as "tape1" | "soil"}
          onGroundworkClick={(si) => shapes[si]?.calculatorResults && setResultsModalShapeIdx(si)}
        />
      ) : (
        <ProjectSummaryPanel
          shapes={shapes}
          onCreateProject={() => setShowCreatePreview(true)}
          onDownloadPDF={() => setShowPdfExportModal(true)}
          isSubmitting={isSubmitting}
          onShapeClick={(shapeIdx) => {
            if (shapes[shapeIdx]?.calculatorResults) setResultsModalShapeIdx(shapeIdx);
            else setObjectCardShapeIdx(shapeIdx);
          }}
          onShapeContextMenu={(shapeIdx, e) => {
            setProjectSummaryContextMenu({ shapeIdx, x: e.clientX, y: e.clientY });
          }}
        />
      )}
      </div>

      <ProjectCardModal
        isOpen={showEquipmentPanel}
        onClose={() => setShowEquipmentPanel(false)}
        projectSettings={projectSettings}
        onSave={updates => {
          setProjectSettings(p => ({ ...p, ...updates }));
          setRecalculateTrigger(t => t + 1);
        }}
      />

      {showPdfExportModal && (
        <PlanPdfExportModal
          isOpen={showPdfExportModal}
          onClose={() => setShowPdfExportModal(false)}
          onExport={(layers) => handleExportPdf(layers)}
          isExporting={isExportingPdf}
        />
      )}

      {showCreatePreview && (
        <CreatePreviewModal
          shapes={shapes}
          projectSettings={projectSettings}
          onConfirm={async () => {
            setShowCreatePreview(false);
            void handleCreateProject();
          }}
          onCancel={() => setShowCreatePreview(false)}
          onOpenProjectCard={() => {
            setShowCreatePreview(false);
            setShowEquipmentPanel(true);
          }}
        />
      )}
    </div>
  );
}

// ── PreparationPanel (Layer 4) ────────────────────────────────────

function PreparationPanel({
  shapes,
  soilType,
  levelingMaterial,
  onGroundworkClick,
}: {
  shapes: Shape[];
  soilType: "clay" | "sand" | "rock";
  levelingMaterial: "tape1" | "soil";
  onGroundworkClick?: (shapeIdx: number) => void;
}) {
  const { t } = useTranslation(["project"]);
  const { currentTheme } = useTheme();
  const CC = currentTheme?.id === "light" ? C_LIGHT : C;
  const result = computePreparation(shapes, soilType, levelingMaterial);
  const groundworkShapes = shapes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.layer === 2 && isGroundworkLinear(s) && s.points.length >= 2);

  return (
    <div style={{
      width: 280,
      background: CC.panel,
      borderLeft: `1px solid ${CC.panelBorder}`,
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px",
        borderBottom: `1px solid ${CC.panelBorder}`,
        fontSize: 14,
        fontWeight: 600,
        color: CC.foundation,
      }}>
        {t("project:preparation_label")}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {groundworkShapes.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: CC.textDim, marginBottom: 8, textTransform: "uppercase" }}>{t("project:groundwork_linear_label")}</div>
            {groundworkShapes.map(({ s, i }) => {
              const lenM = polylineLengthMeters(s.points);
              return (
                <div
                  key={i}
                  onClick={() => onGroundworkClick?.(i)}
                  style={{
                    padding: "10px 12px",
                    marginBottom: 8,
                    background: CC.bg,
                    borderRadius: 8,
                    border: `1px solid ${CC.panelBorder}`,
                    fontSize: 12,
                    cursor: s.calculatorResults ? "pointer" : "default",
                  }}
                >
                  <div style={{ fontWeight: 600, color: CC.text, marginBottom: 4 }}>{s.label || groundworkLabel(s)}</div>
                  <div style={{ color: CC.textDim, fontSize: 11 }}>{t("project:total_length")}: {lenM.toFixed(2)} m</div>
                  {s.calculatorResults && <div style={{ fontSize: 10, color: CC.accent, marginTop: 4 }}>{t("project:click_view_results")}</div>}
                </div>
              );
            })}
          </div>
        )}
        {!result.validation.ok ? (
          <div style={{ fontSize: 12, color: CC.danger }}>
            {result.validation.elementsWithoutHeights && result.validation.elementsWithoutHeights.length > 0 && (
              <div>{t("project:elements_without_heights")}: {result.validation.elementsWithoutHeights.join(", ")}. {t("project:add_heights_geodesy")}</div>
            )}
          </div>
        ) : result.elements.length === 0 && groundworkShapes.length === 0 ? (
          <div style={{ fontSize: 13, color: CC.textDim, textAlign: "center", padding: 24 }}>
            {t("project:no_preparation_elements")}
          </div>
        ) : result.elements.length > 0 ? (
          <>
            {result.elements.map((el) => (
              <div
                key={el.shapeIdx}
                style={{
                  padding: "10px 12px",
                  marginBottom: 8,
                  background: CC.bg,
                  borderRadius: 8,
                  border: `1px solid ${CC.panelBorder}`,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 600, color: CC.text, marginBottom: 6 }}>{el.label}</div>
                <div style={{ color: CC.textDim, fontSize: 11 }}>
                  {el.areaM2} m² · {t("project:excavation_label")}: {el.excavationM3} m³ ({el.excavationTonnes} t)
                </div>
                <div style={{ color: CC.textDim, fontSize: 11 }}>
                  {t("project:fill_label")}: {el.fillM3} m³ ({el.fillTonnes} t) · {el.pctAreaNeedingFill}% {t("project:area_low")}
                </div>
              </div>
            ))}
            <div style={{
              marginTop: 12,
              padding: "12px",
              background: CC.bg,
              borderRadius: 8,
              border: `1px solid ${CC.panelBorder}`,
              fontSize: 13,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: CC.textDim }}>{t("project:total_excavation")}</span>
                <span style={{ color: CC.text, fontWeight: 600 }}>{result.totalExcavationM3} m³</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: CC.textDim }}>{t("project:total_fill")}</span>
                <span style={{ color: CC.text, fontWeight: 600 }}>{result.totalFillM3} m³</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: CC.textDim }}>{t("project:excavation_tonnes")}</span>
                <span style={{ color: CC.text, fontWeight: 600 }}>{result.totalExcavationTonnes} t</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: CC.textDim }}>{t("project:fill_tonnes")}</span>
                <span style={{ color: CC.text, fontWeight: 600 }}>{result.totalFillTonnes} t</span>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── NamePromptModal ────────────────────────────────────────────

function NamePromptModal({ initialLabel, onConfirm, onCancel }: { initialLabel: string; onConfirm: (val: string) => void; onCancel: () => void }) {
  const { t } = useTranslation(["project", "common"]);
  const { currentTheme } = useTheme();
  const CC = currentTheme?.id === "light" ? C_LIGHT : C;
  const [val, setVal] = useState(initialLabel);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={onCancel}>
      <div className="canvas-modal-content" style={{ background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 600, marginBottom: 12, color: CC.text }}>{t("project:name_prompt_title")}</div>
        <input
          ref={inputRef}
          type="text"
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder={t("project:name_prompt_placeholder")}
          onKeyDown={e => {
            if (e.key === "Enter") { onConfirm(val.trim()); }
            if (e.key === "Escape") onCancel();
          }}
          style={{ width: "100%", padding: "10px 12px", background: CC.bg, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 14 }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onCancel} style={{ padding: "8px 16px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, cursor: "pointer" }}>{t("common:cancel")}</button>
          <button onClick={() => onConfirm(val.trim())} style={{ padding: "8px 16px", background: CC.accent, border: "none", borderRadius: 6, color: CC.bg, cursor: "pointer", fontWeight: 600 }}>OK</button>
        </div>
      </div>
    </div>
  );
}

function CtxItem({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ padding: "8px 16px", cursor: "pointer", borderRadius: 4, fontSize: 13, color, background: h ? "rgba(255,255,255,0.08)" : "transparent" }}>
      {label}
    </div>
  );
}