import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import {
  Point, Shape, DesignSlopePoint, CollinearSnapHit, LayerID, ArcPoint, DragInfo, MultiDragVertexStart, MultiShapeDragStart, ShapeDragInfo, RotateInfo, ScaleCornerInfo, ScaleEdgeInfo,
  HitResult, EdgeHitResult, OpenEndHit,
  SelectionRect, DimEdit, ContextMenuInfo, LinkedEntry, isArcEntry,
  PIXELS_PER_METER, GRID_SPACING, POINT_RADIUS, GEODESY_CANVAS_VERTEX_DOT_R, GEODESY_CANVAS_HEIGHT_DOT_R, EDGE_HIT_THRESHOLD, GRASS_EDGE_HIT_PX,
  SNAP_TO_START_RADIUS, SNAP_TO_LAST_RADIUS, MIN_ZOOM, MAX_ZOOM, SNAP_MAGNET_PX, PATTERN_SNAP_PX,
  distance, toMeters, toPixels, formatDimensionCm, formatDimensionCmFromPx, midpoint, angleDeg, areaM2, polylineLengthMeters, rotatePointAround,
  projectOntoSegment, bestCollinearVertexSnap, edgeNormalAngle, readableTextAngle, snapTo45, snapShiftSmart, interiorAngleDir, centroid, labelAnchorInsidePolygon, shoelaceArea,
  snapPatternDirectionToBoundaryAngles,
  constrainLockedEdges,
  snapMagnet, snapMagnetShape, snapMagnetShapeExcluding, pointInPolygon, pointInOrNearPolygon,
  findAllSharedFrameEdgePartners,
  makeSquare, makeRectangle, makeTriangle, makeTrapezoid, makeRegularPolygon, makeCircle, migrateLegacyCirclePolygon, isCircleArcHandlesOnlyShape, C, C_LIGHT,
  edgeOutwardRadForL1Edge,
  edgeOutwardRadForClosedPoly,
  outwardUnitNormalForPolygonEdge,
  EDGE_LENGTH_LABEL_PERP_OFFSET_M,
  EDGE_LENGTH_LABEL_FONT_STACK,
  EDGE_LENGTH_LABEL_FONT_PX,
} from "./geometry";
import {
  drawExteriorAlignedDimension,
  exteriorDimLabelScreenMid,
  boundaryDimL1ExteriorOffsetScreenPx,
  GARDEN_EXTERIOR_DIM_LINE_COLOR,
  GARDEN_EXTERIOR_DIM_TEXT_COLOR,
} from "./boundaryDimensionDraw";
import { calcEdgeSlopes, calcShapeGradient, formatSlope, slopeColor, interpolateHeightAtPoint, fillShapeHeightHeatmap, computeGlobalHeightRange, propagateDesignSlopesToLayer2, resolveDesignSlopeWorldPosition } from "./geodesy";
import { computeGlobalCmRange, getExcavationCmAtVertex, getPreparationCmAtVertex } from "./excavation";
import { fillShapeExcavationPrepHeatmap, shapeHasExcavationOrPrepData } from "./excavationRenderer";
import { isLinearElement, isGroundworkLinear, isPathElement, isPolygonLinearElement, groundworkLabel, drawLinearElement, drawLinearElementInactive, hitTestLinearElement, hitTestPathElement, computeThickPolyline, computeThickPolylineClosed, getPathPolygon, getPathRibbonDerivedCenterline, getLinearElementPath, getPolygonThicknessM, polygonToSegmentLengths, polygonToCenterline, polygonEdgeToSegmentIndex, removeSegmentFromPolygonOutline, removeOpenStripSegmentAndRebuild, openStripEdgeToCenterSegment, extractCenterlineFromOpenStripOutline, extractPathRibbonCenterlineFromOutline, recoverCenterlineQuadFromPairFourRibbonOutline, rebuildRectangularPathRibbonFromOutlineDrag, rebuildRectangularPathRibbonLengthAnchorsFixed, pathRibbonLengthAnchorPairsFromOutlineSnap, resolvePathRibbonRectCenterline4, mapPairFourToRectRibbonOutlineVertex, computePathOutlineFromSegmentSides, PATH_CLOSED_RIBBON_RECT_CORNER_OUTLINE_INDICES, pointSideOfLine, rebuildClosedStripOutlineFromVertexTarget, rebuildClosedStripOutlineAfterEdgeTranslate, rebuildOpenStripOutlineAfterEdgeTranslate, rebuildPathClosedRibbonFromVertexTarget, rebuildOpenStripOutlineFromVertexTarget, isOpenStripPolygonOutline, isClosedStripPolygonOutline, isPolygonLinearStripOutline, rebuildPathRibbonSingleSegmentDrag, rebuildPathRibbonGeneralDrag, baselineFacePolylineToCenterline, stripOutlineParallelEdges, stripPolygonEdgeToSegmentIndex, stripOppositePolygonEdgeIndex, applyStripParallelEdgeArcSync, stripOppositeVertexIndex, computeLinearElementFillOutline, getLinearElementVertexGripWorld } from "./linearElements";
import { computePdfImagePlacement } from "./pdfImagePlacement";
import {
  getMmPerLogicalPxForDimensions,
} from "./visualization/hybridEdgeDimensions";
import { drawShapeObjectLabel, getPathLabel } from "./canvasRenderers";
import { drawDeckPattern } from "./visualization/deckBoards";
import { drawSlabPattern, drawPathSlabPattern, drawPathSlabLabel, drawPathCobblePattern, drawPathCobbleLabel, drawSlabFrame, computePatternSnap, getPolygonForPatternSnapOutline, computeSlabCuts, computePathSlabCuts, computePathCobbleCuts, getTotalFrameInsetWidthCm, shouldDrawSlabFrameViz } from "./visualization/slabPattern";
import { drawCobblestonePattern, drawMonoblockFrame, computeCobblestoneCuts } from "./visualization/cobblestonePattern";
import { drawFencePostMarkers, drawWallSlopeIndicators } from "./visualization/linearMarkers";
import {
  hitTestGeodesyCard,
  hitTestGeodesyCardEntryAtScreen,
  findCardForPoint,
  findGeodesyVertexPointFromHit,
  findGeodesyHeightPointFromHit,
  hitTestNearestGeodesyPointAtScreen,
  geoEntryKey,
  formatGeodesyHeightEditCm,
  type GeodesyCardEntry,
  type GeodesyCardInfo,
} from "./visualization/geodesyLabels";
import { SmartGeodesyLabels } from "./visualization/smartGeodesyLabels";
import { drawExcavationPrepCmLabels, drawGroundworkBurialLabels } from "./visualization/excavationPrepLabels";
import { drawGrassPieces, hitTestGrassPiece, hitTestGrassPieceEdge, hitTestGrassJoinEdge, snapGrassPieceEdge, snapGrassPieceToPolygon, getJoinedGroup, rotateGrassGroup90, validateCoverage, getEffectiveTotalArea, getEffectivePieceDimensionsForInput, type GrassPiece } from "./visualization/grassRolls";
import { drawGravelPattern } from "./visualization/gravelPattern";
import { computeAutoFill } from "./objectCard/autoFill";
import { ProjectSettings, DEFAULT_PROJECT_SETTINGS } from "./types";
import ObjectCardModal from "./objectCard/ObjectCardModal";
import StairsCreationModal from "./objectCard/StairsCreationModal";
import PathCreationModal, { type PathConfig } from "./objectCard/PathCreationModal";
import ResultsModal from "./objectCard/ResultsModal";
import ProjectSummaryPanel, { PreparationSidebarContent } from "./ProjectSummaryPanel";
import ProjectCardModal from "./ProjectCardModal";
import { computeEmptyAreas, computeOverflowAreas, computeOverlaps, clipShapeToGarden, removeOverlapFromShape, findTouchingElementsForEmptyArea, extendShapeToCoverEmptyArea, extendShapeToGardenEdge, clipSurfaceToOutsideLinear, findSurfacesOverlappingLinear, fitUnionResultToShape } from "./adjustmentLogic";
import { computeGroundworkLinearResults, isManualExcavation, getFoundationDiggingMethodFromExcavator } from "./GroundworkLinearCalculator";
import { drawAlternatingLinkedHalf } from "./linkedEdgeDrawing";
import { drawCurvedEdge, calcEdgeLengthWithArcs, getEffectivePolygon, getEffectivePolygonWithEdgeIndices, drawSmoothPolygonPath, drawSmoothPolygonStroke, projectOntoArcEdge, drawArcHandles, hitTestArcPoint, snapArcPoint, buildArcPointPositionCache, arcPointToWorldOnCurve, worldToArcPoint, worldToArcPointOnCurve, mirrorArcPointsToOppositeChord, collectShapeBoundaryDirectionAnglesDeg, type ArcPointCacheEntry } from "./arcMath";
import CreatePreviewModal from "./CreatePreviewModal";
import PlanPdfExportModal from "./PlanPdfExportModal";
import GeodesyPrintPreviewModal from "./GeodesyPrintPreviewModal";
import { GeodesyHeightsBulkModal, GeodesyPointModal, roundCmToOneMm } from "./GeodesyPointModal";
import { submitProject } from "./projectSubmit";
import { ensureCanvasElementIds } from "./canvasElementIds";
import { syncCanvasToEvent } from "./projectSync";
import { useBackdropPointerDismiss } from "../../hooks/useBackdropPointerDismiss";
import jsPDF from "jspdf";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../lib/store";
import { loadPlan, savePlan, linkPlanToEvent, getPlanRow, type CanvasPayload } from "../../lib/plansService";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../themes";
import { colors, shadows } from "../../themes/designTokens";
import "./toolbar.css";

// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — Phase 1 + 2.0: CAD 2D Editor with Layers
// ══════════════════════════════════════════════════════════════

const DRAFT_STORAGE_KEY = "landscapeManager_canvasDraft";
const DRAFT_DEBOUNCE_MS = 1500;
const PLAN_SAVE_DEBOUNCE_MS = 4000;

function geodesyEntryPointDisplayId(entry: GeodesyCardEntry): number {
  const p = entry.points[0];
  if (!p) return 1;
  if (p.isVertex && p.pointIdx != null) return p.pointIdx + 1;
  if (p.heightPointIdx != null) return p.heightPointIdx + 1;
  return 1;
}

/** Wheel delta → ~pixels for pan (respects line/page deltaMode). */
function wheelDeltaToPixels(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * 120;
  return delta;
}

const WHEEL_PAN_SENSITIVITY = 1;
const ARROW_PAN_STEP_PX = 48;

/** Match drawn path/outline vertex world position to shape.points index (geodesy keys use shape.points). */
const GEO_EXPORT_HIDE_VERTEX_EPS_M = 1e-4;

function isVertexHiddenForGeodesyExportPreview(
  wx: number,
  wy: number,
  shapeIdx: number,
  shapePoints: Point[],
  hiddenKeys: ReadonlySet<string> | null | undefined,
): boolean {
  if (!hiddenKeys || hiddenKeys.size === 0) return false;
  for (let pj = 0; pj < shapePoints.length; pj++) {
    if (distance({ x: wx, y: wy }, shapePoints[pj]) < GEO_EXPORT_HIDE_VERTEX_EPS_M && hiddenKeys.has(`v|${shapeIdx}|${pj}`)) {
      return true;
    }
  }
  return false;
}

/** Etykieta nazwy na L2: ścieżki — tylko war. 3 (wzory); mury itp. — war. 2/3; patio/powierzchnie — bez nazwy na canvasie. */
function shouldDrawL2ShapeObjectName(shape: Shape, layerForRender: number): boolean {
  if (shape.layer !== 2) return false;
  if (isGroundworkLinear(shape)) return layerForRender === 4 || layerForRender === 5;
  if (isPathElement(shape)) return layerForRender === 3;
  if (isLinearElement(shape)) return layerForRender === 2 || layerForRender === 3;
  return false;
}

type Mode = "select" | "freeDraw" | "scale" | "move" | "drawFence" | "drawWall" | "drawKerb" | "drawFoundation" | "drawPathSlabs" | "drawPathConcreteSlabs" | "drawPathMonoblock" | "drawDrainage" | "drawCanalPipe" | "drawWaterPipe" | "drawCable";
type PrimaryToolbarMode = "select" | "scale" | "move";

function toolbarModeLabelKey(mode: Mode): "toolbar_select" | "toolbar_draw" | "toolbar_scale" | "toolbar_view" | "toolbar_mode" {
  if (mode === "select") return "toolbar_select";
  if (mode === "scale") return "toolbar_scale";
  if (mode === "move") return "toolbar_view";
  if (mode === "freeDraw") return "toolbar_mode";
  return "toolbar_draw";
}

type ShapeCreationKind =
  | "square"
  | "rectangle"
  | "triangle"
  | "trapezoid"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "circle";

function projectShapeToolbarLabelKey(type: ShapeCreationKind): string {
  switch (type) {
    case "square": return "toolbar_shape_square";
    case "rectangle": return "toolbar_shape_rectangle";
    case "triangle": return "toolbar_shape_triangle";
    case "trapezoid": return "toolbar_shape_trapezoid";
    case "pentagon": return "toolbar_shape_pentagon";
    case "hexagon": return "toolbar_shape_hexagon";
    case "octagon": return "toolbar_shape_octagon";
    case "circle": return "toolbar_shape_circle";
  }
}

function shapeNamePlaceholderKey(type: ShapeCreationKind): string {
  switch (type) {
    case "square": return "name_placeholder_patio";
    case "rectangle": return "name_placeholder_terrace";
    case "triangle": return "name_placeholder_flowerbed";
    case "trapezoid": return "name_placeholder_border";
    case "pentagon":
    case "hexagon":
    case "octagon":
    case "circle": return "name_placeholder_border";
  }
}

/** Outline-only icons for shapes menu (matches stroke style of rect / circle in toolbar). */
function ShapeDropdownItemIcon({ type }: { type: ShapeCreationKind }): ReactNode {
  const svgStyle = { width: 16, height: 16, flexShrink: 0, display: "block" as const };
  switch (type) {
    case "pentagon":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" style={svgStyle} aria-hidden>
          <path d="M12 4 L19.61 9.53 L16.73 18.47 L7.27 18.47 L4.39 9.53 Z" />
        </svg>
      );
    case "hexagon":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" style={svgStyle} aria-hidden>
          <path d="M12 4 L18.93 8 L18.93 16 L12 20 L5.07 16 L5.07 8 Z" />
        </svg>
      );
    case "octagon":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" style={svgStyle} aria-hidden>
          <path d="M12 4 L17.66 6.34 L20 12 L17.66 17.66 L12 20 L6.34 17.66 L4 12 L6.34 6.34 Z" />
        </svg>
      );
    case "square":
      return <span style={{ fontSize: 14 }}>◻</span>;
    case "rectangle":
      return <span style={{ fontSize: 14 }}>▭</span>;
    case "triangle":
      return <span style={{ fontSize: 14 }}>△</span>;
    case "trapezoid":
      return <span style={{ fontSize: 14 }}>⏢</span>;
    case "circle":
      return <span style={{ fontSize: 14 }}>◯</span>;
  }
}

function isPrimaryToolbarModeActive(mode: Mode, primary: PrimaryToolbarMode): boolean {
  if (primary === "select") return mode === "select";
  if (primary === "scale") return mode === "scale";
  if (primary === "move") return mode === "move";
  return false;
}

/** W tych trybach pokazujemy odległości wzdłuż krawędzi (jak przy najechaniu w select), także podczas rysowania. */
function modeShowsEdgeDistanceWhileDrawing(mode: Mode): boolean {
  return (
    mode === "freeDraw" ||
    mode === "drawFence" ||
    mode === "drawWall" ||
    mode === "drawKerb" ||
    mode === "drawFoundation" ||
    mode === "drawPathSlabs" ||
    mode === "drawPathConcreteSlabs" ||
    mode === "drawPathMonoblock" ||
    mode === "drawDrainage" ||
    mode === "drawCanalPipe" ||
    mode === "drawWaterPipe" ||
    mode === "drawCable"
  );
}

/** Touch toolbar row uses horizontal scroll + overflow-y hidden, which clips absolute dropdowns; fixed placement keeps panels hit-testable above the canvas. */
function useToolbarDropdownPanelStyle(
  triggerRef: React.RefObject<HTMLDivElement | null>,
  open: boolean,
  isMobile: boolean,
  minWidth: number
): CSSProperties {
  const [pos, setPos] = useState({ top: 0, left: 0, mw: minWidth });
  useLayoutEffect(() => {
    if (!open || !isMobile || !triggerRef.current) return;
    const el = triggerRef.current;
    const update = () => {
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, mw: Math.max(minWidth, r.width) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, isMobile, triggerRef, minWidth]);
  if (!isMobile) {
    return { position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 50, minWidth };
  }
  return { position: "fixed", top: pos.top, left: pos.left, marginTop: 0, zIndex: 200, minWidth: pos.mw };
}

type ActiveLayer = 1 | 2 | 3 | 4 | 5 | 6;
type ViewFilter = "all" | "linear" | "surface";

/** Geodezja (klik w punkty / karty) tylko na L1, L2, L3, L6 — na L4/L5 musi być wyłączona, inaczej przejmuje hit-testy pod wykop/przygotowanie. */
function isGeodesyInteractionLayer(L: ActiveLayer): boolean {
  return L === 1 || L === 2 || L === 3 || L === 6;
}

const SURFACE_CALC_TYPES = ["slab", "deck", "grass", "turf", "paving", "decorativeStones"] as const;
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

/**
 * Wykop / Przygotowanie: roboty ziemne liniowe muszą przechodzić filtr niezależnie od widoku L2 (np. „tylko powierzchnie”),
 * bo inaczej nie da się trafić w węzły (`hitTestPoint`) ani edytować głębokości — `passesViewFilter` wyklucza `isLinearElement` przy filtrze surface.
 */
function passesViewFilterWithGroundworkOnExcavationLayers(
  shape: Shape,
  viewFilter: ViewFilter,
  activeLayer: ActiveLayer,
): boolean {
  if ((activeLayer === 4 || activeLayer === 5) && shape.layer === 2 && isGroundworkLinear(shape)) return true;
  return passesViewFilter(shape, viewFilter, activeLayer);
}

function pdfExportMapRenderLayer(pdfLayer: number): ActiveLayer {
  if (pdfLayer === 101) return 1;
  if (pdfLayer === 102) return 2;
  return pdfLayer as ActiveLayer;
}

/** Which shapes contribute to the PDF page bounding box (matches typical dimmed+active composition per sheet). */
function pdfExportShapeContributesToBounds(shape: Shape, pdfLayer: number, viewFilter: ViewFilter): boolean {
  if (shape.removedFromCanvas) return false;
  const L = pdfExportMapRenderLayer(pdfLayer);
  if (shape.layer === 1) {
    return L === 1 || L === 2 || L === 3 || L === 4 || L === 5 || L === 6;
  }
  if (shape.layer !== 2) return false;
  if (L === 1 || L === 3) return true;
  if (L === 2 || L === 6) return passesViewFilter(shape, viewFilter, L);
  if (L === 4 || L === 5) return isGroundworkLinear(shape) && passesViewFilterWithGroundworkOnExcavationLayers(shape, viewFilter, L);
  return false;
}

function pdfExportCollectWorldPoints(shape: Shape): Point[] {
  const out: Point[] = [];
  const pushPts = (arr: Point[] | undefined) => {
    if (!arr) return;
    for (const p of arr) {
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out.push(p);
    }
  };
  if (isPathElement(shape) && shape.closed) {
    const outline = getPathPolygon(shape);
    if (outline.length >= 3) pushPts(outline);
    else pushPts(shape.points);
  } else if (isLinearElement(shape)) {
    if (shape.closed && shape.points.length >= 2) {
      const outline = computeLinearElementFillOutline(shape);
      if (outline.length >= 2) pushPts(outline);
      else pushPts(shape.points);
    } else {
      pushPts(shape.points);
    }
  } else if (shape.closed && shape.points.length >= 3) {
    pushPts(getEffectivePolygon(shape));
  } else {
    pushPts(shape.points);
  }
  const hps = shape.heightPoints;
  if (hps?.length) {
    for (const hp of hps) {
      if (hp && typeof hp.x === "number" && typeof hp.y === "number") out.push({ x: hp.x, y: hp.y });
    }
  }
  return out;
}

/** Pan/zoom so all relevant geometry fits in the canvas with margin (PDF / print snapshot). */
function computePdfFitCamera(
  shapes: Shape[],
  designSlopePoints: DesignSlopePoint[],
  pdfLayer: number,
  viewFilter: ViewFilter,
  canvasW: number,
  canvasH: number,
): { pan: Point; zoom: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  const expand = (p: Point) => {
    any = true;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };

  for (const shape of shapes) {
    if (!pdfExportShapeContributesToBounds(shape, pdfLayer, viewFilter)) continue;
    for (const p of pdfExportCollectWorldPoints(shape)) expand(p);
  }

  const L = pdfExportMapRenderLayer(pdfLayer);
  if ((L === 2 || L === 3 || L === 6) && designSlopePoints.length > 0) {
    for (const dsp of designSlopePoints) {
      const w = resolveDesignSlopeWorldPosition(dsp, shapes);
      if (w && Number.isFinite(w.x) && Number.isFinite(w.y)) expand(w);
    }
  }

  if (!any) return null;

  const geoPage = pdfLayer === 101 || pdfLayer === 102;
  const padPx = toPixels(geoPage ? 3.5 : 1.6);
  minX -= padPx;
  maxX += padPx;
  minY -= padPx;
  maxY += padPx;

  let bw = maxX - minX;
  let bh = maxY - minY;
  if (bw < 8) bw = 8;
  if (bh < 8) bh = 8;

  const screenPad = 32;
  const availW = Math.max(48, canvasW - 2 * screenPad);
  const availH = Math.max(48, canvasH - 2 * screenPad);

  const z = Math.min(availW / bw, availH / bh);
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    pan: { x: canvasW / 2 - cx * zoom, y: canvasH / 2 - cy * zoom },
    zoom,
  };
}

/**
 * Pan/zoom so all geometry that can appear on geodesy PDF sheets (101 L1 + 102 L2) fits — union of bounds from both pages.
 * Used for geodesy print preview and for PDF pages 101/102 so nothing from layer 1 or 2 is clipped.
 */
function computeGeodesyPdfFitCamera(
  shapes: Shape[],
  designSlopePoints: DesignSlopePoint[],
  viewFilter: ViewFilter,
  canvasW: number,
  canvasH: number,
): { pan: Point; zoom: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  const expand = (p: Point) => {
    any = true;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };

  for (const shape of shapes) {
    if (
      !pdfExportShapeContributesToBounds(shape, 101, viewFilter) &&
      !pdfExportShapeContributesToBounds(shape, 102, viewFilter)
    ) {
      continue;
    }
    for (const p of pdfExportCollectWorldPoints(shape)) expand(p);
  }

  if (designSlopePoints.length > 0) {
    for (const dsp of designSlopePoints) {
      const w = resolveDesignSlopeWorldPosition(dsp, shapes);
      if (w && Number.isFinite(w.x) && Number.isFinite(w.y)) expand(w);
    }
  }

  if (!any) return null;

  const padPx = toPixels(3.5);
  minX -= padPx;
  maxX += padPx;
  minY -= padPx;
  maxY += padPx;

  let bw = maxX - minX;
  let bh = maxY - minY;
  if (bw < 8) bw = 8;
  if (bh < 8) bh = 8;

  const screenPad = 40;
  const availW = Math.max(48, canvasW - 2 * screenPad);
  const availH = Math.max(48, canvasH - 2 * screenPad);

  const z = Math.min(availW / bw, availH / bh);
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    pan: { x: canvasW / 2 - cx * zoom, y: canvasH / 2 - cy * zoom },
    zoom,
  };
}

/** While drawing, no shape is excluded yet (first click) — same as {@link snapMagnet} but with L1/L2 + view filter. */
const DRAWING_SNAP_EXCLUDE_NONE = -1;

/**
 * Point/edge snap while drawing: same rules as {@link snapMagnet} (SNAP_MAGNET_PX, vertex then edge),
 * filtered to layers 1–2 + view filter, plus vertices/edges of the current open chain.
 * `drawingShapeIdx === DRAWING_SNAP_EXCLUDE_NONE` → do not exclude any shape (first point of a new element).
 */
function snapDrawingMagnet(
  point: Point,
  args: {
    drawingShapeIdx: number;
    shapes: Shape[];
    localPtChain: Point[];
    zoom: number;
    viewFilter: ViewFilter;
    activeLayer: ActiveLayer;
  },
): Point {
  const { drawingShapeIdx, shapes, localPtChain, zoom, viewFilter, activeLayer } = args;
  const th = SNAP_MAGNET_PX / zoom;
  let bestDist = th;
  let snapped: Point = { ...point };
  let didSnap = false;

  const considerPoint = (p: Point) => {
    const d = distance(point, p);
    if (d < bestDist) {
      bestDist = d;
      snapped = { ...p };
      didSnap = true;
    }
  };

  for (const p of localPtChain) considerPoint(p);

  for (let si = 0; si < shapes.length; si++) {
    if (drawingShapeIdx !== DRAWING_SNAP_EXCLUDE_NONE && si === drawingShapeIdx) continue;
    const sh = shapes[si];
    if (sh.layer !== 1 && sh.layer !== 2) continue;
    if (!passesViewFilter(sh, viewFilter, activeLayer)) continue;
    const pts = sh.points;
    for (const p of pts) considerPoint(p);
    const ecArc = sh.closed ? pts.length : pts.length - 1;
    for (let ei = 0; ei < ecArc; ei++) {
      const arcs = sh.edgeArcs?.[ei];
      if (!arcs?.length) continue;
      const A = pts[ei]!;
      const B = pts[(ei + 1) % pts.length]!;
      for (const ap of arcs) {
        considerPoint(arcPointToWorldOnCurve(A, B, arcs, ap));
      }
    }
  }

  if (didSnap && bestDist < th * 0.6) return snapped;
  if (didSnap) return snapped;

  bestDist = th;
  didSnap = false;
  const considerEdge = (a: Point, b: Point) => {
    const proj = projectOntoSegment(point, a, b);
    if (proj.t > 0.01 && proj.t < 0.99 && proj.dist < bestDist) {
      bestDist = proj.dist;
      snapped = { ...proj.proj };
      didSnap = true;
    }
  };

  for (let i = 0; i < localPtChain.length - 1; i++) {
    considerEdge(localPtChain[i]!, localPtChain[i + 1]!);
  }

  for (let si = 0; si < shapes.length; si++) {
    if (drawingShapeIdx !== DRAWING_SNAP_EXCLUDE_NONE && si === drawingShapeIdx) continue;
    const sh = shapes[si];
    if (sh.layer !== 1 && sh.layer !== 2) continue;
    if (!passesViewFilter(sh, viewFilter, activeLayer)) continue;
    const pts = sh.points;
    const ec = sh.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < ec; i++) {
      const j = (i + 1) % pts.length;
      const arcs = sh.edgeArcs?.[i];
      if (arcs && arcs.length > 0) {
        const pr = projectOntoArcEdge(point, pts[i]!, pts[j]!, arcs, 24);
        if (pr.t > 0.02 && pr.t < 0.98 && pr.dist < bestDist) {
          bestDist = pr.dist;
          snapped = { ...pr.proj };
          didSnap = true;
        }
      } else {
        considerEdge(pts[i]!, pts[j]!);
      }
    }
  }

  return didSnap ? snapped : point;
}

/** Axis-alignment to vertices already placed in the current polygon chain (green guides while drawing). */
const DRAW_SMART_GUIDE_PX = 8;

/** Same as point-drag: snap X/Y to any vertex when close (orthogonal / 90°–180° guides to other points). */
const DRAW_VERTEX_AXIS_ALIGN_PX = 10;

/** Closest vertex refs for horizontal/vertical alignment (same geometry as {@link applyVertexAxisAlignWhileDrawing}). */
function findVertexAxisAlignRefs(
  ep: Point,
  shapes: Shape[],
  drawingShapeIdx: number,
  zoom: number,
): { xRef: Point | null; yRef: Point | null } {
  const th = DRAW_VERTEX_AXIS_ALIGN_PX / zoom;
  let bestDx = th, bestDy = th;
  let xRef: Point | null = null, yRef: Point | null = null;
  const ds = shapes[drawingShapeIdx];
  const drawPts = ds?.points;
  const wbl = ds?.elementType === "wall" ? (ds.calculatorInputs?.wallBaselinePolyline as Point[] | undefined) : undefined;
  const selfChain = wbl && wbl.length > 0 ? wbl : drawPts;
  const skipPi = selfChain && selfChain.length >= 2 ? selfChain.length - 1 : -1;

  for (let si = 0; si < shapes.length; si++) {
    const pts = si === drawingShapeIdx && selfChain && selfChain.length > 0 ? selfChain : shapes[si].points;
    for (let pi = 0; pi < pts.length; pi++) {
      if (si === drawingShapeIdx && pi === skipPi) continue;
      const pt = pts[pi];
      const dx = Math.abs(ep.x - pt.x);
      const dy = Math.abs(ep.y - pt.y);
      if (dx < bestDx) { bestDx = dx; xRef = pt; }
      if (dy < bestDy) { bestDy = dy; yRef = pt; }
    }
  }
  return { xRef, yRef };
}

function applyVertexAxisAlignWhileDrawing(
  ep: Point,
  shapes: Shape[],
  drawingShapeIdx: number,
  zoom: number,
): Point {
  const { xRef, yRef } = findVertexAxisAlignRefs(ep, shapes, drawingShapeIdx, zoom);
  return { x: xRef?.x ?? ep.x, y: yRef?.y ?? ep.y };
}

/** When within {@link DRAW_SMART_GUIDE_PX}, snap X/Y to chain vertex axes so the point lies on the green guide lines (same as free polygon drawing). */
function snapPointToDrawingChainAxes(ep: Point, chain: Point[], zoom: number): Point {
  if (chain.length === 0) return ep;
  const th = DRAW_SMART_GUIDE_PX / zoom;
  let bestDx = th, bestDy = th;
  let sx: number | null = null, sy: number | null = null;
  for (const p of chain) {
    const dx = Math.abs(ep.x - p.x);
    const dy = Math.abs(ep.y - p.y);
    if (dx < bestDx) { bestDx = dx; sx = p.x; }
    if (dy < bestDy) { bestDy = dy; sy = p.y; }
  }
  return { x: sx ?? ep.x, y: sy ?? ep.y };
}

/**
 * Distance label for smart guides: near the preview point (cursor), not the segment midpoint — easier to read while drawing.
 * `stackIndex` offsets labels when several guides are active (e.g. corner snap).
 */
function screenPosForSmartGuideDistanceLabel(
  guide: { axis: "x" | "y"; worldValue: number },
  eMouse: Point,
  worldToScreen: (wx: number, wy: number) => { x: number; y: number },
  stackIndex: number,
): { x: number; y: number } {
  const snap = worldToScreen(eMouse.x, eMouse.y);
  const stack = stackIndex * 13;
  if (guide.axis === "x") {
    const east = eMouse.x >= guide.worldValue;
    return { x: snap.x + (east ? 22 : -22), y: snap.y - 15 - stack };
  }
  return { x: snap.x, y: snap.y - 15 - stack };
}

/**
 * Strip tools already snap to ref edges via {@link snapWorldPointForLinearDrawing}.
 * Independent X/Y pulls (vertex axis-align + chain axes) break slanted L1/L2 boundaries (wall/path sits half-on-half).
 */
function shouldSkipSnapPointToDrawingChainAxesForStrip(s: Shape): boolean {
  return isPolygonLinearElement(s) || isPathElement(s) || s.elementType === "fence";
}

/** Half strip width in **canvas world units** (same as {@link computeThickPolyline} / {@link toPixels}). */
function drawSnapHalfWidthWorld(drawingShape: Shape): number {
  if (isPolygonLinearElement(drawingShape)) return toPixels(getPolygonThicknessM(drawingShape)) / 2;
  if (isPathElement(drawingShape)) {
    const wM = Number(drawingShape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6;
    return toPixels(wM) / 2;
  }
  return toPixels(drawingShape.thickness ?? 0.10) / 2;
}

/** Largest closed L1 plot-like shape (excludes walls/fences) — interior hint when snapping a wall to an open chain on L1. */
function dominantClosedLayer1InteriorCentroid(
  shapes: Shape[],
  drawingShapeIdx: number,
  viewFilter: ViewFilter,
  activeLayer: ActiveLayer,
): Point | null {
  let bestA = 0;
  let bestC: Point | null = null;
  for (let si = 0; si < shapes.length; si++) {
    if (si === drawingShapeIdx) continue;
    const sh = shapes[si];
    if (sh.layer !== 1 || !sh.closed || sh.points.length < 3) continue;
    if (!passesViewFilter(sh, viewFilter, activeLayer)) continue;
    if (isPolygonLinearElement(sh) || sh.elementType === "fence" || isGroundworkLinear(sh)) continue;
    const a = shoelaceArea(sh.points);
    if (a > bestA) {
      bestA = a;
      bestC = centroid(sh.points);
    }
  }
  return bestC;
}

/** Prototype shape matching the first-click linear tool so {@link drawSnapHalfWidthWorld} matches the created element. */
function protoDrawingShapeForLinearMode(elementType: "fence" | "wall" | "kerb" | "foundation"): Shape {
  const base: Shape = {
    points: [],
    closed: false,
    label: "",
    layer: 2,
    lockedEdges: [],
    lockedAngles: [],
    heights: [],
    elementType,
    thickness: elementType === "foundation" ? 0.30 : 0.10,
  };
  if (elementType === "wall") {
    return {
      ...base,
      calculatorType: "wall",
      calculatorSubType: "block4",
      calculatorInputs: {
        layingMethod: "standing",
        height: "1",
        wallDrawBaseline: true,
        wallDrawFace: "left",
      },
    };
  }
  if (elementType === "kerb") {
    return {
      ...base,
      calculatorType: "kerbs",
      calculatorSubType: "kl",
      calculatorInputs: {},
    };
  }
  return base;
}

function pathRibbonScalePayloadForCorner(shape: Shape, pts: Point[]): ScaleCornerInfo["pathRibbonScale"] | undefined {
  if (!isPathElement(shape) || !shape.closed || !shape.calculatorInputs?.pathIsOutline) return undefined;
  const inputs = shape.calculatorInputs;
  const pathWM = Number(inputs.pathWidthM ?? 0.6) || 0.6;
  const pc = inputs.pathCenterline as Point[] | undefined;
  const po = inputs.pathCenterlineOriginal as Point[] | undefined;
  let cl: Point[] | null = null;
  if (pc && pc.length >= 2) cl = pc.map(p => ({ ...p }));
  else if (po && po.length >= 2) cl = po.map(p => ({ ...p }));
  else {
    const ex = extractPathRibbonCenterlineFromOutline(pts);
    if (ex.length >= 2) cl = ex.map(p => ({ ...p }));
  }
  if (!cl || cl.length < 2) return undefined;
  const V = cl.length;
  const storedSides = inputs.pathSegmentSides as ("left" | "right")[] | undefined;
  const segmentSides: ("left" | "right")[] =
    Array.isArray(storedSides) && storedSides.length === V - 1
      ? storedSides.map(s => s)
      : Array.from({ length: V - 1 }, () => "left" as const);
  return { pathWidthM: pathWM, startCenterline: cl, segmentSides };
}

function computeScaleCornerFrame(
  sc: ScaleCornerInfo,
  world: Point,
  shapes: Shape[],
  zoom: number
): { newPts: Point[]; ribbonCl: Point[] | undefined; ratio: number; ax: number; ay: number; snapOff: { x: number; y: number } } {
  const currentDist = distance(sc.anchor, world);
  const ratio = currentDist / sc.startDist;
  const ax = sc.anchor.x, ay = sc.anchor.y;
  const pr = sc.pathRibbonScale;
  let newPts: Point[];
  let ribbonCl: Point[] | undefined;
  if (pr && pr.startCenterline.length >= 2) {
    ribbonCl = pr.startCenterline.map(pt => ({
      x: ax + (pt.x - ax) * ratio,
      y: ay + (pt.y - ay) * ratio,
    }));
    const rebuilt = computePathOutlineFromSegmentSides(ribbonCl, pr.segmentSides, pr.pathWidthM);
    newPts =
      rebuilt.length >= 3
        ? rebuilt
        : sc.startPoints.map(pt => ({
            x: ax + (pt.x - ax) * ratio,
            y: ay + (pt.y - ay) * ratio,
          }));
  } else {
    newPts = sc.startPoints.map(pt => ({
      x: ax + (pt.x - ax) * ratio,
      y: ay + (pt.y - ay) * ratio,
    }));
  }
  const magThreshold = SNAP_MAGNET_PX / zoom;
  const draggedPt = newPts[sc.pointIdx] ?? newPts[0]!;
  const toMouse = { x: world.x - ax, y: world.y - ay };
  const len = Math.sqrt(toMouse.x * toMouse.x + toMouse.y * toMouse.y);
  const snapDir = len > 1 ? { x: toMouse.x / len, y: toMouse.y / len } : undefined;
  const snap = snapMagnet(draggedPt, shapes, sc.shapeIdx, magThreshold, snapDir);
  const snapOff = snap.didSnap ? { x: snap.snapped.x - draggedPt.x, y: snap.snapped.y - draggedPt.y } : { x: 0, y: 0 };
  if (snap.didSnap) {
    newPts = newPts.map(pt => ({ x: pt.x + snapOff.x, y: pt.y + snapOff.y }));
    if (ribbonCl) ribbonCl = ribbonCl.map(pt => ({ x: pt.x + snapOff.x, y: pt.y + snapOff.y }));
  }
  return { newPts, ribbonCl, ratio, ax, ay, snapOff };
}

/** Baseline face polyline while drawing wall before points are converted to strip outline (handles on corners). */
function getWallBaselinePolylineDuringDraw(s: Shape): Point[] | null {
  const bl = s.calculatorInputs?.wallBaselinePolyline as Point[] | undefined;
  if (bl && bl.length >= 1) return bl.map((p) => ({ ...p }));
  return null;
}

/** During wall draw with strip outline, `points` is the band outline; use `wallBaselinePolyline` for snap, angles, and previews. */
function wallBaselineChainForDrawing(s: Shape, fallbackPts: Point[]): Point[] {
  const wbl = s.elementType === "wall" ? (s.calculatorInputs?.wallBaselinePolyline as Point[] | undefined) : undefined;
  return wbl && wbl.length > 0 ? wbl : fallbackPts;
}

/** End wall/kerb/foundation as open strip polygon (corner handles on both sides), same thickness as closed loop. */
function finalizePolygonLinearDrawingOpen(shapes: Shape[], idx: number): Shape | null {
  const s = shapes[idx];
  if (!isPolygonLinearElement(s) || s.points.length < 2) return null;
  const pathPts = getLinearElementPath(s);
  const thicknessPx = toPixels(getPolygonThicknessM(s));
  const outline = computeThickPolyline(pathPts, thicknessPx);
  if (outline.length < 4) return null;
  const segLengths: number[] = [];
  for (let i = 0; i < pathPts.length - 1; i++) {
    segLengths.push(toMeters(distance(pathPts[i], pathPts[i + 1])));
  }
  const baseCalc = { ...(s.calculatorInputs ?? {}) };
  delete baseCalc.wallDrawBaseline;
  delete baseCalc.wallDrawFace;
  delete baseCalc.wallBaselinePolyline;
  const inputs: Record<string, unknown> = { ...baseCalc, segmentLengths: segLengths };
  if (s.elementType === "wall") {
    const defaultH = parseFloat(String(s.calculatorInputs?.height ?? "1")) || 1;
    inputs.segmentHeights = segLengths.map(() => ({ startH: defaultH, endH: defaultH }));
  }
  return {
    ...s,
    points: outline,
    closed: false,
    linearOpenStripOutline: true,
    drawingFinished: true,
    calculatorInputs: inputs,
  };
}

type LinearDrawSnapResult = { point: Point; wallFaceHint?: "left" | "right" };

type SegmentProjection = ReturnType<typeof projectOntoSegment>;

/** Direction from last chain point toward mouse — used to pick the correct edge at a polygon corner (two edges tie at dist 0). */
function stripStrokeDirectionForTie(ep: Point, localPtChain: Point[]): { x: number; y: number } {
  if (localPtChain.length >= 1) {
    const dx = ep.x - localPtChain[localPtChain.length - 1]!.x;
    const dy = ep.y - localPtChain[localPtChain.length - 1]!.y;
    const l = Math.hypot(dx, dy);
    if (l > 1e-12) return { x: dx / l, y: dy / l };
  }
  return { x: 1, y: 0 };
}

/**
 * At a corner, several edges have the same min distance to `out` (often 0). Prefer the edge whose tangent
 * aligns with stroke direction; if still tied, prefer the edge closest to `ep` (then tangent again).
 */
function pickEdgeAmongEqualOutDist(
  edges: { i: number; j: number; pr: SegmentProjection }[],
  poly: Point[],
  ep: Point,
  strokeDir: { x: number; y: number },
  getSegment: (i: number) => [Point, Point],
): { i: number; j: number; pr: SegmentProjection } {
  if (edges.length === 1) return edges[0]!;
  let minEp = Infinity;
  let sub: typeof edges = [];
  for (const e of edges) {
    const [a, b] = getSegment(e.i);
    const prEp = projectOntoSegment(ep, a, b);
    if (prEp.t < 0 || prEp.t > 1) continue;
    const d = prEp.dist;
    if (d < minEp - 1e-12) {
      minEp = d;
      sub = [e];
    } else if (Math.abs(d - minEp) < 1e-9) {
      sub.push(e);
    }
  }
  const pick = sub.length > 0 ? sub : edges;
  let best = pick[0]!;
  let bestScore = -1;
  for (const e of pick) {
    const pi = poly[e.i]!;
    const pj = poly[e.j]!;
    const edx = pj.x - pi.x;
    const edy = pj.y - pi.y;
    const el = Math.hypot(edx, edy);
    const tx = el > 1e-12 ? edx / el : 1;
    const ty = el > 1e-12 ? edy / el : 0;
    const score = Math.abs(tx * strokeDir.x + ty * strokeDir.y);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function outSnappedToReferencePolygonVertex(
  out: Point,
  shapes: Shape[],
  drawingShapeIdx: number,
  viewFilter: ViewFilter,
  activeLayer: ActiveLayer,
  tol: number,
): boolean {
  for (let si = 0; si < shapes.length; si++) {
    if (si === drawingShapeIdx) continue;
    const sh = shapes[si];
    if (sh.layer !== 1 && sh.layer !== 2) continue;
    if (!passesViewFilter(sh, viewFilter, activeLayer)) continue;
    const poly =
      sh.closed && sh.points.length >= 3
        ? isPolygonLinearElement(sh)
          ? sh.points
          : isPathElement(sh)
            ? getPathPolygon(sh)
            : sh.elementType === "polygon"
              ? sh.points
              : null
        : null;
    if (!poly) continue;
    for (const v of poly) {
      if (distance(out, v) < tol) return true;
    }
  }
  return false;
}

/**
 * Magnet snap + edge snap for strip drawing (wall, fence, path…).
 * Layer 1: snap on the reference edge; strip thickness goes **inward** (into the plot).
 * Layer 2: snap offset by half width **outward** so the strip does not overlap the L2 reference.
 * Path (slabs): use **on-edge** projection like L1 so centerline follows visible boundaries; halfW offset caused zig-zags when tracing adjacent edges.
 */
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
): LinearDrawSnapResult {
  const { drawingShapeIdx, shapes, localPtChain, drawingShape, zoom, viewFilter, activeLayer } = args;
  const out = snapDrawingMagnet(ep, {
    drawingShapeIdx,
    shapes,
    localPtChain,
    zoom,
    viewFilter,
    activeLayer,
  });

  const useEdgeOutside =
    isPolygonLinearElement(drawingShape) || isPathElement(drawingShape) || drawingShape.elementType === "fence";
  if (!useEdgeOutside) return { point: out };

  const halfW = drawSnapHalfWidthWorld(drawingShape);
  const eTh = SNAP_MAGNET_PX / zoom;
  type EdgeSnapMeta = {
    layer: LayerID;
    proj: Point;
    refCentroid: Point;
    edgeTx: number;
    edgeTy: number;
    /** Layer 1: direction into the garden (open chain snap or L1 linear polygon ref). */
    wallInteriorHint?: Point;
  };
  const edgeSnap = { bestD: eTh, bestQ: null as Point | null, bestEdgeMeta: null as EdgeSnapMeta | null };

  const considerClosedPoly = (poly: Point[], layer: LayerID, refShape: Shape) => {
    const n = poly.length;
    if (n < 3) return;
    const refCentroid = centroid(poly);
    const l1InteriorHint =
      layer === 1
        ? isPolygonLinearElement(refShape)
          ? dominantClosedLayer1InteriorCentroid(shapes, drawingShapeIdx, viewFilter, activeLayer) ?? refCentroid
          : refCentroid
        : undefined;
    let minOutDist = Infinity;
    const edgeCand: { i: number; j: number; pr: SegmentProjection }[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const pr = projectOntoSegment(out, poly[i], poly[j]);
      if (pr.t < 0 || pr.t > 1) continue;
      if (pr.dist < minOutDist - 1e-12) {
        minOutDist = pr.dist;
        edgeCand.length = 0;
        edgeCand.push({ i, j, pr });
      } else if (Math.abs(pr.dist - minOutDist) < 1e-9) {
        edgeCand.push({ i, j, pr });
      }
    }
    if (edgeCand.length === 0) return;
    const strokeDir = stripStrokeDirectionForTie(ep, localPtChain);
    const chosen = pickEdgeAmongEqualOutDist(
      edgeCand,
      poly,
      ep,
      strokeDir,
      (ii) => [poly[ii]!, poly[((ii + 1) % n)]!],
    );
    const i = chosen.i;
    const j = (i + 1) % n;
    const pr = projectOntoSegment(out, poly[i], poly[j]);
    if (pr.dist >= edgeSnap.bestD) return;
    const nrm = outwardUnitNormalForPolygonEdge(poly[i], poly[j], poly);
    const edx = poly[j].x - poly[i].x;
    const edy = poly[j].y - poly[i].y;
    const el = Math.hypot(edx, edy);
    const edgeTx = el > 1e-12 ? edx / el : 1;
    const edgeTy = el > 1e-12 ? edy / el : 0;
    edgeSnap.bestD = pr.dist;
    if (layer === 1) {
      edgeSnap.bestQ = { x: pr.proj.x, y: pr.proj.y };
      edgeSnap.bestEdgeMeta = {
        layer,
        proj: { ...pr.proj },
        refCentroid,
        edgeTx,
        edgeTy,
        wallInteriorHint: l1InteriorHint,
      };
    } else if (isPathElement(drawingShape)) {
      edgeSnap.bestQ = { x: pr.proj.x, y: pr.proj.y };
      edgeSnap.bestEdgeMeta = { layer, proj: { ...pr.proj }, refCentroid, edgeTx, edgeTy };
    } else {
      edgeSnap.bestQ = { x: pr.proj.x + nrm.x * halfW, y: pr.proj.y + nrm.y * halfW };
      edgeSnap.bestEdgeMeta = { layer, proj: { ...pr.proj }, refCentroid, edgeTx, edgeTy };
    }
  };

  const considerOpenCenterline = (pts: Point[], layer: LayerID) => {
    const n = pts.length;
    if (n < 2) return;
    const refCentroid = centroid(pts);
    let minOutDist = Infinity;
    const edgeCand: { i: number; j: number; pr: SegmentProjection }[] = [];
    for (let i = 0; i < n - 1; i++) {
      const j = i + 1;
      const pr = projectOntoSegment(out, pts[i], pts[j]);
      if (pr.t < 0 || pr.t > 1) continue;
      if (pr.dist < minOutDist - 1e-12) {
        minOutDist = pr.dist;
        edgeCand.length = 0;
        edgeCand.push({ i, j, pr });
      } else if (Math.abs(pr.dist - minOutDist) < 1e-9) {
        edgeCand.push({ i, j, pr });
      }
    }
    if (edgeCand.length === 0) return;
    const strokeDir = stripStrokeDirectionForTie(ep, localPtChain);
    const chosen = pickEdgeAmongEqualOutDist(edgeCand, pts, ep, strokeDir, (ii) => [pts[ii]!, pts[ii + 1]!]);
    const i = chosen.i;
    const j = chosen.j;
    const pr = projectOntoSegment(out, pts[i], pts[j]);
    if (pr.dist >= edgeSnap.bestD) return;
    const edx = pts[j].x - pts[i].x;
    const edy = pts[j].y - pts[i].y;
    const el = Math.hypot(edx, edy);
    const edgeTx = el > 1e-12 ? edx / el : 1;
    const edgeTy = el > 1e-12 ? edy / el : 0;
    edgeSnap.bestD = pr.dist;
    let qx = pr.proj.x;
    let qy = pr.proj.y;
    let wallInteriorHint: Point | undefined;
    if (layer === 1) {
      wallInteriorHint =
        dominantClosedLayer1InteriorCentroid(shapes, drawingShapeIdx, viewFilter, activeLayer) ?? refCentroid;
    } else if (isPathElement(drawingShape)) {
      qx = pr.proj.x;
      qy = pr.proj.y;
    } else {
      let nx = -edgeTy;
      let ny = edgeTx;
      let vx = pr.proj.x - refCentroid.x;
      let vy = pr.proj.y - refCentroid.y;
      if (localPtChain.length >= 1) {
        const prev = localPtChain[localPtChain.length - 1];
        vx = pr.proj.x - prev.x;
        vy = pr.proj.y - prev.y;
      }
      if (nx * vx + ny * vy < 0) {
        nx = -nx;
        ny = -ny;
      }
      qx = pr.proj.x + nx * halfW;
      qy = pr.proj.y + ny * halfW;
    }
    edgeSnap.bestQ = { x: qx, y: qy };
    edgeSnap.bestEdgeMeta = {
      layer,
      proj: { ...pr.proj },
      refCentroid,
      edgeTx,
      edgeTy,
      ...(wallInteriorHint ? { wallInteriorHint } : {}),
    };
  };

  for (let si = 0; si < shapes.length; si++) {
    if (si === drawingShapeIdx) continue;
    const sh = shapes[si];
    if (sh.layer !== 1 && sh.layer !== 2) continue;
    if (!passesViewFilter(sh, viewFilter, activeLayer)) continue;

    if (sh.closed && sh.points.length >= 3) {
      if (isPolygonLinearElement(sh)) considerClosedPoly(sh.points, sh.layer, sh);
      else if (isPathElement(sh)) considerClosedPoly(getPathPolygon(sh), sh.layer, sh);
      else if (sh.elementType === "polygon") considerClosedPoly(sh.points, sh.layer, sh);
    }
    if (isLinearElement(sh) && !isPolygonLinearElement(sh) && sh.points.length >= 2) {
      considerOpenCenterline(getLinearElementPath(sh), sh.layer);
    }
  }

  let resultPoint = edgeSnap.bestQ ?? out;
  const vertexTol = Math.max(1e-6, (SNAP_MAGNET_PX / zoom) * 1e-3);
  if (
    useEdgeOutside &&
    edgeSnap.bestQ &&
    distance(out, edgeSnap.bestQ) > vertexTol &&
    outSnappedToReferencePolygonVertex(out, shapes, drawingShapeIdx, viewFilter, activeLayer, vertexTol)
  ) {
    resultPoint = out;
  }
  const bestEdgeMeta = edgeSnap.bestEdgeMeta;

  let wallFaceHint: "left" | "right" | undefined;
  if (
    drawingShape.elementType === "wall" &&
    drawingShape.calculatorInputs?.wallDrawBaseline &&
    bestEdgeMeta
  ) {
    const canHintL1 = bestEdgeMeta.layer === 1;
    const canHintL2 = bestEdgeMeta.layer === 2 && localPtChain.length >= 1;
    if (!canHintL1 && !canHintL2) {
      // pierwszy punkt przy L2 — zostaw domyślny wallDrawFace
    } else {
      const nlx = -bestEdgeMeta.edgeTy;
      const nly = bestEdgeMeta.edgeTx;
      let tdx: number;
      let tdy: number;
      if (bestEdgeMeta.layer === 1) {
        const hint = bestEdgeMeta.wallInteriorHint ?? bestEdgeMeta.refCentroid;
        tdx = hint.x - bestEdgeMeta.proj.x;
        tdy = hint.y - bestEdgeMeta.proj.y;
      } else {
        const prev = localPtChain[localPtChain.length - 1]!;
        tdx = prev.x - bestEdgeMeta.proj.x;
        tdy = prev.y - bestEdgeMeta.proj.y;
      }
      const tl = Math.hypot(tdx, tdy);
      if (tl > 1e-9) {
        tdx /= tl;
        tdy /= tl;
        const align = nlx * tdx + nly * tdy;
        if (Math.abs(align) > 1e-4) {
          wallFaceHint = align > 0 ? "right" : "left";
        }
      }
    }
  }

  return wallFaceHint ? { point: resultPoint, wallFaceHint } : { point: resultPoint };
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
  decorativeStones: "calculator_type_decorativeStones",
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

/** Same matching as inside MasterProject (for shared vertex move logic). */
function linkedEntriesMatchForVertexMove(a: LinkedEntry, b: LinkedEntry): boolean {
  if (isArcEntry(a) && isArcEntry(b)) return a.si === b.si && a.edgeIdx === b.edgeIdx && a.arcId === b.arcId;
  if (!isArcEntry(a) && !isArcEntry(b)) return a.si === b.si && a.pi === b.pi;
  return false;
}

/**
 * Move one polygon vertex to a target world position — same geometry rules as interactive point drag
 * (strip outline rebuild for walls/paths, path ribbon centerline, linked vertices).
 * Used by "offset along line from point" so walls don't break when only one vertex moves.
 */
function moveVertexToTargetInShapes(
  prevShapes: Shape[],
  si: number,
  pi: number,
  target: Point,
  linkedGroups: LinkedEntry[][],
  pathRibbonDragStartOutline: Point[] | null,
): Shape[] {
  const n = [...prevShapes];
  const s0 = n[si];
  if (!s0 || pi < 0 || pi >= s0.points.length) return prevShapes;

  const s = { ...n[si] };
  const shape = s;
  const pts = shape.points;

  const dragEntry: LinkedEntry = { si, pi };
  const group = linkedGroups.find(g => g.some(lp => linkedEntriesMatchForVertexMove(lp, dragEntry)));

  const stripThicknessPxFor = (sh: Shape): number | null => {
    if (sh.lockedEdges && sh.lockedEdges.length > 0) return null;
    if (sh.lockedAngles && sh.lockedAngles.length > 0) return null;
    if (isPolygonLinearStripOutline(sh) && isPolygonLinearElement(sh)) {
      return toPixels(getPolygonThicknessM(sh));
    }
    if (sh.closed && sh.points.length >= 4 && sh.points.length % 2 === 0 && isPathElement(sh) && sh.calculatorInputs?.pathIsOutline) {
      return toPixels(Number(sh.calculatorInputs?.pathWidthM ?? 0.6) || 0.6);
    }
    return null;
  };

  if (group) {
    let anchor: Point = { x: target.x, y: target.y };
    const vertexMembers = group.filter(lp => !isArcEntry(lp));
    const stripEntries = vertexMembers.filter(lp => stripThicknessPxFor(n[lp.si]!) != null);
    stripEntries.sort((a, b) => {
      if (a.si === si && a.pi === pi) return -1;
      if (b.si === si && b.pi === pi) return 1;
      return a.si - b.si;
    });
    const processedStripSi = new Set<number>();
    for (const lp of stripEntries) {
      if (processedStripSi.has(lp.si)) continue;
      const sh = n[lp.si];
      if (!sh) continue;
      const tpx = stripThicknessPxFor(sh);
      if (tpx == null) continue;
      let reb: Point[] | null = null;
      let rebPathCl: Point[] | null = null;
      let stripAnchorIdx = lp.pi;
      if (sh.linearOpenStripOutline && !sh.closed) {
        reb = rebuildOpenStripOutlineFromVertexTarget(sh.points, lp.pi, anchor, tpx);
      } else if (isPathElement(sh) && sh.closed && sh.calculatorInputs?.pathIsOutline) {
        if (sh.points.length === 8 || sh.points.length === 4) {
          const sidesL =
            Array.isArray(sh.calculatorInputs.pathSegmentSides) &&
            (sh.calculatorInputs.pathSegmentSides as ("left" | "right")[]).length === 3
              ? (sh.calculatorInputs.pathSegmentSides as ("left" | "right")[])
              : (["left", "left", "left"] as ("left" | "right")[]);
          const pathWM = Number(sh.calculatorInputs.pathWidthM ?? 0.6) || 0.6;
          const pc = sh.calculatorInputs.pathCenterline as Point[] | undefined;
          const po = sh.calculatorInputs.pathCenterlineOriginal as Point[] | undefined;
          let cl0: Point[] =
            pc && pc.length === 4
              ? pc.map(p => ({ ...p }))
              : po && po.length === 4
                ? po.map(p => ({ ...p }))
                : (() => {
                    const ex = extractPathRibbonCenterlineFromOutline(sh.points);
                    return ex.length === 4 ? ex.map(p => ({ ...p })) : [];
                  })();
          if (cl0.length !== 4 && sh.points.length === 4) {
            const recL = recoverCenterlineQuadFromPairFourRibbonOutline(sh.points, toPixels(pathWM) / 2);
            if (recL && recL.length === 4) cl0 = recL.map(p => ({ ...p }));
          }
          if (cl0.length === 4) {
            let vSolver = lp.pi;
            if (sh.points.length === 4) {
              const o8 = computePathOutlineFromSegmentSides(cl0, sidesL, pathWM);
              if (o8.length === 8) {
                let bd = Infinity;
                for (let j = 0; j < 8; j++) {
                  const d = distance(sh.points[lp.pi]!, o8[j]!);
                  if (d < bd) {
                    bd = d;
                    vSolver = j;
                  }
                }
              }
            }
            let solvedL = rebuildRectangularPathRibbonFromOutlineDrag(cl0, sidesL, pathWM, vSolver, anchor);
            if (!solvedL && lp.si === si) {
              const snapL = pathRibbonDragStartOutline;
              if (snapL && snapL.length === sh.points.length) {
                const pairsL = pathRibbonLengthAnchorPairsFromOutlineSnap(snapL, lp.pi, cl0, sidesL, pathWM);
                if (pairsL && pairsL.length > 0) {
                  solvedL = rebuildRectangularPathRibbonLengthAnchorsFixed(
                    cl0,
                    sidesL,
                    pathWM,
                    vSolver,
                    anchor,
                    pairsL,
                  );
                }
              }
            }
            if (solvedL) {
              reb = solvedL.outline;
              rebPathCl = solvedL.centerline;
              stripAnchorIdx = vSolver;
            }
          }
        }
        if (reb == null && !(isPathElement(sh) && sh.closed && sh.calculatorInputs?.pathIsOutline)) {
          reb = rebuildPathClosedRibbonFromVertexTarget(sh.points, lp.pi, anchor, tpx);
          stripAnchorIdx = lp.pi;
        }
      } else {
        reb = rebuildClosedStripOutlineFromVertexTarget(sh.points, lp.pi, anchor, tpx);
      }
      if (reb) {
        let nextSh: Shape = { ...sh, points: reb, calculatorResults: undefined };
        if (isPathElement(sh) && sh.closed && sh.calculatorInputs?.pathIsOutline) {
          if (rebPathCl && rebPathCl.length >= 2) {
            nextSh = {
              ...nextSh,
              calculatorInputs: {
                ...sh.calculatorInputs,
                pathCenterline: rebPathCl.map(p => ({ ...p })),
                pathCenterlineOriginal: rebPathCl.map(p => ({ ...p })),
              },
            };
          } else {
            const cl = extractPathRibbonCenterlineFromOutline(reb);
            if (cl.length >= 2) {
              nextSh = {
                ...nextSh,
                calculatorInputs: {
                  ...sh.calculatorInputs,
                  pathCenterline: cl.map(p => ({ ...p })),
                  pathCenterlineOriginal: cl.map(p => ({ ...p })),
                },
              };
            }
          }
        }
        n[lp.si] = nextSh;
        anchor = { ...reb[stripAnchorIdx]! };
        processedStripSi.add(lp.si);
      }
    }
    for (const lp of vertexMembers) {
      if (processedStripSi.has(lp.si)) continue;
      const shSkip = n[lp.si];
      if (shSkip && isPathElement(shSkip) && shSkip.closed && shSkip.calculatorInputs?.pathIsOutline) continue;
      const ls = { ...n[lp.si]! };
      const lpts = [...ls.points];
      lpts[lp.pi] = { ...anchor };
      ls.points = lpts;
      ls.calculatorResults = undefined;
      n[lp.si] = ls;
    }
    for (const lp of group) {
      if (!isArcEntry(lp) || linkedEntriesMatchForVertexMove(lp, dragEntry)) continue;
      if (!n[lp.si]) continue;
      const ls = { ...n[lp.si]! };
      const lea = ls.edgeArcs ? [...ls.edgeArcs] : [];
      const lArcs = lea[lp.edgeIdx] ? [...lea[lp.edgeIdx]!] : [];
      const li = lArcs.findIndex(a => a.id === lp.arcId);
      if (li >= 0) {
        const lA = ls.points[lp.edgeIdx];
        const lB = ls.points[(lp.edgeIdx + 1) % ls.points.length];
        const { t: lt, offset: lo } = worldToArcPointOnCurve(lA, lB, lArcs, lArcs[li]!, anchor);
        lArcs[li] = { ...lArcs[li]!, t: lt, offset: lo };
        lea[lp.edgeIdx] = lArcs;
        ls.edgeArcs = lea;
        n[lp.si] = ls;
      }
    }
    return n;
  }

  const closedPathRibbonDrag =
    shape.closed &&
    pts.length >= 4 &&
    pts.length % 2 === 0 &&
    isPathElement(shape) &&
    Boolean(shape.calculatorInputs?.pathIsOutline);
  const polygonStrip = isPolygonLinearStripOutline(shape);
  const canStripRebuild =
    (polygonStrip || closedPathRibbonDrag) &&
    (!shape.lockedEdges || shape.lockedEdges.length === 0) &&
    (!shape.lockedAngles || shape.lockedAngles.length === 0);

  if (closedPathRibbonDrag) {
    const pathWMDrag = Number(shape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6;
    const pcDrag = shape.calculatorInputs?.pathCenterline as Point[] | undefined;
    const poDrag = shape.calculatorInputs?.pathCenterlineOriginal as Point[] | undefined;
    const clAny: Point[] | null =
      pcDrag && pcDrag.length >= 2 ? pcDrag.map(p => ({ ...p }))
      : poDrag && poDrag.length >= 2 ? poDrag.map(p => ({ ...p }))
      : null;
    if (clAny && clAny.length >= 2) {
      const V = clAny.length;
      const storedSides = shape.calculatorInputs?.pathSegmentSides as ("left" | "right")[] | undefined;
      const sidesAny: ("left" | "right")[] =
        Array.isArray(storedSides) && storedSides.length === V - 1
          ? storedSides
          : Array.from({ length: V - 1 }, () => "left" as const);
      const expectedOutLen = 2 * V;
      let viSolver = pi;
      if (pts.length !== expectedOutLen) {
        const o = computePathOutlineFromSegmentSides(clAny, sidesAny, pathWMDrag);
        if (o.length === expectedOutLen) {
          let bd = Infinity;
          for (let j = 0; j < o.length; j++) {
            const d = distance(pts[pi]!, o[j]!);
            if (d < bd) {
              bd = d;
              viSolver = j;
            }
          }
        }
      }
      let solvedGen: { outline: Point[]; centerline: Point[] } | null = null;
      if (V === 2) {
        solvedGen = rebuildPathRibbonSingleSegmentDrag(clAny, sidesAny, pathWMDrag, viSolver, target);
      } else {
        solvedGen = rebuildPathRibbonGeneralDrag(clAny, sidesAny, pathWMDrag, viSolver, target);
      }
      if (solvedGen) {
        n[si] = {
          ...s,
          points: solvedGen.outline,
          calculatorResults: undefined,
          calculatorInputs: {
            ...shape.calculatorInputs,
            pathCenterline: solvedGen.centerline.map(p => ({ ...p })),
            pathCenterlineOriginal: solvedGen.centerline.map(p => ({ ...p })),
          },
        };
        return n;
      }
    }
  }

  if (canStripRebuild) {
    const thicknessPx = isPathElement(shape) && closedPathRibbonDrag
      ? toPixels(Number(shape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6)
      : toPixels(getPolygonThicknessM(shape));
    let rebuilt: Point[] | null = null;
    if (closedPathRibbonDrag) {
      rebuilt = null;
    } else if (polygonStrip && !shape.closed && shape.linearOpenStripOutline) {
      rebuilt = rebuildOpenStripOutlineFromVertexTarget(pts, pi, target, thicknessPx);
    } else if (polygonStrip && shape.closed) {
      rebuilt = rebuildClosedStripOutlineFromVertexTarget(pts, pi, target, thicknessPx);
    }
    if (rebuilt) {
      let sNext: Shape = { ...s, points: rebuilt, calculatorResults: undefined };
      if (closedPathRibbonDrag) {
        const cl = extractPathRibbonCenterlineFromOutline(rebuilt);
        if (cl.length >= 2) {
          sNext = {
            ...sNext,
            calculatorInputs: {
              ...shape.calculatorInputs,
              pathCenterline: cl.map(p => ({ ...p })),
              pathCenterlineOriginal: cl.map(p => ({ ...p })),
            },
          };
        }
      }
      n[si] = sNext;
      return n;
    }
  }

  if (closedPathRibbonDrag) {
    const dx = target.x - pts[pi]!.x;
    const dy = target.y - pts[pi]!.y;
    const newPts = pts.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
    const pcF = shape.calculatorInputs?.pathCenterline as Point[] | undefined;
    const poF = shape.calculatorInputs?.pathCenterlineOriginal as Point[] | undefined;
    const tr = (arr: Point[]) => arr.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
    n[si] = {
      ...s,
      points: newPts,
      calculatorResults: undefined,
      calculatorInputs: {
        ...shape.calculatorInputs,
        ...(pcF && pcF.length >= 2 ? { pathCenterline: tr(pcF) } : {}),
        ...(poF && poF.length >= 2 ? { pathCenterlineOriginal: tr(poF) } : {}),
      },
    };
    return n;
  }

  const np = [...s.points];
  np[pi] = { x: target.x, y: target.y };
  let sFinal: Shape = { ...s, points: np, calculatorResults: undefined };
  if (closedPathRibbonDrag) {
    const cl = extractPathRibbonCenterlineFromOutline(np);
    if (cl.length >= 2) {
      sFinal = {
        ...sFinal,
        calculatorInputs: {
          ...shape.calculatorInputs,
          pathCenterline: cl.map(p => ({ ...p })),
          pathCenterlineOriginal: cl.map(p => ({ ...p })),
        },
      };
    }
  }
  n[si] = sFinal;
  return n;
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

/** Kształty, których wszystkie wierzchołki są w zaznaczeniu prostokątem (to samo co „pełne” figury w marquee). */
function getFullySelectedShapeIndicesFromPoints(selectedPoints: HitResult[], shapes: Shape[]): number[] {
  const byShape = new Map<number, Set<number>>();
  for (const sp of selectedPoints) {
    if (!byShape.has(sp.shapeIdx)) byShape.set(sp.shapeIdx, new Set());
    byShape.get(sp.shapeIdx)!.add(sp.pointIdx);
  }
  const out: number[] = [];
  for (const [si, pis] of byShape) {
    const pts = shapes[si]?.points;
    if (!pts || pts.length === 0) continue;
    if (pis.size === pts.length) out.push(si);
  }
  return out.sort((a, b) => a - b);
}

/** Vertex drag with optional rigid multi-select (rectangle / multi-point selection). */
function buildPointDragInfoWithMultiSelect(
  shapes: Shape[],
  ptHit: HitResult,
  world: Point,
  selectedPoints: HitResult[],
): { dragInfo: DragInfo; clearMultiSelection: boolean } {
  const inMulti =
    selectedPoints.length >= 2 &&
    selectedPoints.some(sp => sp.shapeIdx === ptHit.shapeIdx && sp.pointIdx === ptHit.pointIdx);
  let multiDragStartPositions: MultiDragVertexStart[] | undefined;
  if (inMulti) {
    const uniq = new Map<string, MultiDragVertexStart>();
    for (const sp of selectedPoints) {
      const k = `${sp.shapeIdx},${sp.pointIdx}`;
      const sh = shapes[sp.shapeIdx];
      if (!sh) continue;
      const denseCache =
        isLinearElement(sh) && isPolygonLinearStripOutline(sh) && sh.linearOpenStripOutline
          ? computeLinearElementFillOutline(sh)
          : undefined;
      const p = getLinearElementVertexGripWorld(sh, sp.pointIdx, denseCache);
      uniq.set(k, { shapeIdx: sp.shapeIdx, pointIdx: sp.pointIdx, x: p.x, y: p.y });
    }
    if (uniq.size >= 2) multiDragStartPositions = [...uniq.values()];
  }
  const clearMultiSelection = selectedPoints.length >= 2 && !inMulti;
  const hitShape = shapes[ptHit.shapeIdx];
  const denseForGrip =
    hitShape && isLinearElement(hitShape) && isPolygonLinearStripOutline(hitShape) && hitShape.linearOpenStripOutline
      ? computeLinearElementFillOutline(hitShape)
      : undefined;
  const startPoint = hitShape ? getLinearElementVertexGripWorld(hitShape, ptHit.pointIdx, denseForGrip) : { x: 0, y: 0 };
  return {
    dragInfo: {
      shapeIdx: ptHit.shapeIdx,
      pointIdx: ptHit.pointIdx,
      startMouse: { ...world },
      startPoint: { ...startPoint },
      ...(multiDragStartPositions ? { multiDragStartPositions } : {}),
    },
    clearMultiSelection,
  };
}

/** Path ribbon snapshots for rigid translate (slab/cobble pattern follows pathCenterline). */
function snapshotPathRibbonForDrag(inp: Record<string, unknown> | undefined): { startPathCenterline?: Point[]; startPathCenterlineOriginal?: Point[] } {
  const pc = inp?.pathCenterline as Point[] | undefined;
  const po = inp?.pathCenterlineOriginal as Point[] | undefined;
  return {
    startPathCenterline: pc && pc.length >= 2 ? pc.map(p => ({ ...p })) : undefined,
    startPathCenterlineOriginal: po && po.length >= 2 ? po.map(p => ({ ...p })) : undefined,
  };
}

function applyPathRibbonSnapTranslation(
  calculatorInputs: Record<string, unknown> | undefined,
  snap: { startPathCenterline?: Point[]; startPathCenterlineOriginal?: Point[] },
  dx: number,
  dy: number
): Record<string, unknown> | undefined {
  if (!calculatorInputs) return calculatorInputs;
  const { startPathCenterline: sPc, startPathCenterlineOriginal: sPo } = snap;
  if ((!sPc || sPc.length < 2) && (!sPo || sPo.length < 2)) return calculatorInputs;
  const next = { ...calculatorInputs };
  if (sPc && sPc.length >= 2) {
    next.pathCenterline = sPc.map(p => ({ x: p.x + dx, y: p.y + dy }));
  }
  if (sPo && sPo.length >= 2) {
    next.pathCenterlineOriginal = sPo.map(p => ({ x: p.x + dx, y: p.y + dy }));
  }
  return next;
}

function linkedPathSnapshotForShape(shape: Shape, shapes: Shape[]): { shapeIdx: number; startPathCenterline?: Point[]; startPathCenterlineOriginal?: Point[] } | undefined {
  const li = shape.linkedShapeIdx;
  if (li == null || !shapes[li]) return undefined;
  const snap = snapshotPathRibbonForDrag(shapes[li].calculatorInputs as Record<string, unknown>);
  if (!snap.startPathCenterline && !snap.startPathCenterlineOriginal) return undefined;
  return { shapeIdx: li, ...snap };
}

/** Layer-2 elements whose centroid lies inside any of the given L1 closed gardens (rigid garden drag). */
function collectGardenDragChildrenForShapeIndices(shapeIndices: number[], shapes: Shape[]): { idx: number; startPoints: Point[]; startVizPieces: GrassPiece[] | null; startPathCenterline?: Point[]; startPathCenterlineOriginal?: Point[] }[] {
  const children: { idx: number; startPoints: Point[]; startVizPieces: GrassPiece[] | null; startPathCenterline?: Point[]; startPathCenterlineOriginal?: Point[] }[] = [];
  const seen = new Set<number>();
  const indexSet = new Set(shapeIndices);
  for (const si of shapeIndices) {
    const hitShape = shapes[si];
    if (!hitShape || hitShape.layer !== 1 || !hitShape.closed || hitShape.points.length < 3) continue;
    for (let ci = 0; ci < shapes.length; ci++) {
      if (indexSet.has(ci) || shapes[ci].layer !== 2) continue;
      if (seen.has(ci)) continue;
      const c = centroid(shapes[ci].points);
      if (pointInPolygon(c, hitShape.points)) {
        seen.add(ci);
        children.push({
          idx: ci,
          startPoints: shapes[ci].points.map(p => ({ ...p })),
          startVizPieces: shapes[ci].calculatorInputs?.vizPieces
            ? (shapes[ci].calculatorInputs!.vizPieces as GrassPiece[]).map(p => ({ ...p }))
            : null,
          ...snapshotPathRibbonForDrag(shapes[ci].calculatorInputs as Record<string, unknown>),
        });
      }
    }
  }
  return children;
}

/** One entry per vertex: frame on the edge ending at that vertex (same convention as Połącz ramki). */
function remapFrameSidesEnabledAfterVertexInsert(
  oldFse: boolean[] | undefined,
  oldN: number,
  edgeIdx: number,
  insertIdx: number,
): boolean[] | undefined {
  if (!Array.isArray(oldFse) || oldFse.length === 0) return oldFse;
  const padded = Array.from({ length: oldN }, (_, i) => oldFse[i] !== false);
  const splitEndFlag = padded[(edgeIdx + 1) % oldN];
  return [...padded.slice(0, insertIdx), splitEndFlag, ...padded.slice(insertIdx)];
}

type FrameLinkedEdgeEntry = { myEdgeIdx: number; otherShapeIdx: number; otherEdgeIdx: number };

function shiftMyFrameLinksAfterEdgeInsert(links: FrameLinkedEdgeEntry[] | undefined, edgeIdx: number): FrameLinkedEdgeEntry[] | undefined {
  if (!links || links.length === 0) return links;
  return links.map(l => (l.myEdgeIdx > edgeIdx ? { ...l, myEdgeIdx: l.myEdgeIdx + 1 } : l));
}

/** Partner shapes store otherEdgeIdx → shift when target shape gains a vertex after edge `edgeIdx`. */
function patchOtherShapesFrameLinksAfterVertexInsert(n: Shape[], targetSi: number, edgeIdx: number): void {
  for (let i = 0; i < n.length; i++) {
    if (i === targetSi) continue;
    const sh = n[i];
    const links = sh.calculatorInputs?.frameLinkedEdges as FrameLinkedEdgeEntry[] | undefined;
    if (!links?.length) continue;
    if (!links.some(l => l.otherShapeIdx === targetSi && l.otherEdgeIdx > edgeIdx)) continue;
    const ci = { ...sh.calculatorInputs! };
    ci.frameLinkedEdges = links.map(l =>
      l.otherShapeIdx === targetSi && l.otherEdgeIdx > edgeIdx
        ? { ...l, otherEdgeIdx: l.otherEdgeIdx + 1 }
        : l
    );
    n[i] = { ...sh, calculatorInputs: ci };
  }
}

/** After deleting shape index `deletedSi`, fix vertex links and frame links so indices stay valid. */
function adjustLinkedGroupsAfterShapeDelete(groups: LinkedEntry[][], deletedSi: number): LinkedEntry[][] {
  return groups
    .map(g =>
      g
        .filter(e => e.si !== deletedSi)
        .map(e => {
          if (isArcEntry(e)) return e.si > deletedSi ? { ...e, si: e.si - 1 } : e;
          return e.si > deletedSi ? { ...e, si: e.si - 1 } : e;
        }),
    )
    .filter(g => g.length >= 2);
}

function remapShapesAfterShapeDelete(shapes: Shape[], deletedSi: number): Shape[] {
  return shapes.map(sh => {
    let out: Shape = sh;
    const links = sh.calculatorInputs?.frameLinkedEdges as FrameLinkedEdgeEntry[] | undefined;
    if (links?.length) {
      const needsFix = links.some(l => l.otherShapeIdx === deletedSi || l.otherShapeIdx > deletedSi);
      if (needsFix) {
        const newLinks = links
          .filter(l => l.otherShapeIdx !== deletedSi)
          .map(l => (l.otherShapeIdx > deletedSi ? { ...l, otherShapeIdx: l.otherShapeIdx - 1 } : l));
        out = {
          ...out,
          calculatorInputs: out.calculatorInputs ? { ...out.calculatorInputs, frameLinkedEdges: newLinks } : out.calculatorInputs,
        };
      }
    }
    const li = sh.linkedShapeIdx;
    if (li == null) return out;
    if (li === deletedSi) return { ...out, linkedShapeIdx: undefined };
    if (li > deletedSi) return { ...out, linkedShapeIdx: li - 1 };
    return out;
  });
}

function shiftShapeIdxAfterDelete(idx: number | null, deletedSi: number): number | null {
  if (idx == null) return null;
  if (idx === deletedSi) return null;
  return idx > deletedSi ? idx - 1 : idx;
}

/** One vertex removed → one edge gains arc control (same logic as context menu „Zmiana na arc point”). */
function mergeOneVertexToArcPointState(
  s: Shape,
  pi: number,
): { shape: Shape; newEdgeIdx: number; newArcId: string; mergedEdgeIdx: number } | null {
  const pts = s.points;
  const n = pts.length;
  if (n < 4 || pi < 0 || pi >= n) return null;
  const prev = (pi - 1 + n) % n;
  const next = (pi + 1) % n;
  const A = pts[prev];
  const B = pts[next];
  const V = pts[pi];
  const { t: chordT } = worldToArcPoint(A, B, V);
  const arcsPrev = (s.edgeArcs?.[prev] ?? []).map(a => ({ ...a, t: a.t * chordT }));
  const arcsNext = (s.edgeArcs?.[pi] ?? []).map(a => ({ ...a, t: chordT + (1 - chordT) * a.t }));
  const placeholder = { id: "__temp__", t: 0.5, offset: 0 };
  const { t, offset } = worldToArcPointOnCurve(A, B, [...arcsPrev, ...arcsNext, placeholder], placeholder, V);
  const newArc: ArcPoint = { id: crypto.randomUUID(), t, offset };
  const newEdgeIdx = pi > 0 ? prev : n - 2;
  const newPts = pts.filter((_, i) => i !== pi);
  const arcsPrevM = (s.edgeArcs?.[prev] ?? []).map(a => ({ ...a, t: a.t * t }));
  const arcsNextM = (s.edgeArcs?.[pi] ?? []).map(a => ({ ...a, t: t + (1 - t) * a.t }));
  const merged = [...arcsPrevM, ...arcsNextM, newArc].sort((a, b) => a.t - b.t);
  const oldArcs = s.edgeArcs || [];
  const newEdgeArcs: (ArcPoint[] | null)[] = [];
  for (let j = 0; j < n - 1; j++) {
    if (j < prev) newEdgeArcs.push(oldArcs[j] ?? null);
    else if (j === prev) newEdgeArcs.push(merged.length ? merged : null);
    else newEdgeArcs.push(oldArcs[j + 1] ?? null);
  }
  let sh: Shape = {
    ...s,
    points: newPts,
    edgeArcs: newEdgeArcs.some(a => a && a.length > 0) ? newEdgeArcs : undefined,
  };
  const nh = (s.heights || pts.map(() => 0)).filter((_, i) => i !== pi);
  sh.heights = nh;
  if (isGroundworkLinear(sh)) {
    const gb = (s.groundworkBurialDepthM || pts.map(() => 0)).filter((_, i) => i !== pi);
    sh.groundworkBurialDepthM = gb.length ? gb : undefined;
  }
  if (sh.elementType === "wall" && sh.calculatorInputs?.segmentHeights) {
    const inputs = { ...sh.calculatorInputs };
    const segHeights = [...(inputs.segmentHeights as Array<{ startH: number; endH: number }>)];
    if (pi < segHeights.length) segHeights.splice(pi, 1);
    inputs.segmentHeights = segHeights;
    sh.calculatorInputs = inputs;
  }
  sh.lockedEdges = s.lockedEdges.filter(e => e.idx !== prev && e.idx !== pi).map(e => e.idx > pi ? { ...e, idx: e.idx - 1 } : e);
  sh.lockedAngles = s.lockedAngles.filter(a => a !== pi).map(a => a > pi ? a - 1 : a);
  if (isPolygonLinearStripOutline(sh) || (isPathElement(sh) && Boolean(sh.calculatorInputs?.pathIsOutline))) {
    sh = applyStripParallelEdgeArcSync(sh);
  }
  return { shape: sh, newEdgeIdx, newArcId: newArc.id, mergedEdgeIdx: prev };
}

function mapLinkedGroupsAfterVertexToArc(
  groups: LinkedEntry[][],
  si: number,
  n: number,
  pi: number,
  newEdgeIdx: number,
  arcId: string,
  mergedEdgeIdx: number,
): LinkedEntry[][] {
  return groups
    .map(g =>
      g.map(p => {
        if (p.si === si && !isArcEntry(p) && p.pi === pi) return { si, pi: -1 as const, edgeIdx: newEdgeIdx, arcId };
        if (p.si === si && !isArcEntry(p) && p.pi > pi) return { ...p, pi: p.pi - 1 };
        if (p.si === si && isArcEntry(p) && p.edgeIdx > pi) return { ...p, edgeIdx: p.edgeIdx - 1 };
        if (p.si === si && isArcEntry(p) && p.edgeIdx === mergedEdgeIdx) return p;
        return p;
      }),
    )
    .filter(g => g.length >= 2);
}

export default function MasterProject() {
  const navigate = useNavigate();
  const { planId: urlPlanId } = useParams<{ planId?: string }>();
  const { user } = useAuthStore();
  const currentPlanIdRef = useRef<string | null>(urlPlanId ?? null);
  const [linkedEventId, setLinkedEventId] = useState<string | null>(null);
  const { t } = useTranslation(["project"]);
  const { currentTheme } = useTheme();
  const CC = currentTheme?.id === "light" ? C_LIGHT : C;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Keep receiving pointer/mouse up after cursor leaves canvas (selection drag, pan, etc.). */
  const canvasPointerCaptureIdRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRafRef = useRef<number | null>(null);
  /** Centerline (4 corners) at mousedown — secondary ribbon solvers use frozen outline anchors from snap. */
  const pathRibbonDragStartClRef = useRef<Point[] | null>(null);
  /** Outline points at mousedown (same length as shape.points) — length-neighbor anchor positions. */
  const pathRibbonDragStartOutlineRef = useRef<Point[] | null>(null);

  const [shapes, setShapes] = useState<Shape[]>([]);
  const [history, setHistory] = useState<Shape[][]>([]);
  const historyRef = useRef<Shape[][]>([]);
  const [selectedShapeIdx, setSelectedShapeIdx] = useState<number | null>(null);
  /** Multi whole-shape selection (Ctrl+click). Empty = fall back to {@link selectedShapeIdx} only. */
  const [selectedShapeIndices, setSelectedShapeIndices] = useState<number[]>([]);
  /** Ostatnio zcommitowana lista — przy drugim Ctrl+klik zamknięcie handleMouseDown widzi jeszcze []; ref jest aktualizowany co render. */
  const selectedShapeIndicesRef = useRef<number[]>([]);
  selectedShapeIndicesRef.current = selectedShapeIndices;
  const shapeSelectionSet = useMemo(() => {
    if (selectedShapeIndices.length > 0) return new Set(selectedShapeIndices);
    if (selectedShapeIdx !== null) return new Set([selectedShapeIdx]);
    return new Set<number>();
  }, [selectedShapeIndices, selectedShapeIdx]);
  const [mode, setMode] = useState<Mode>("select");
  const [drawingShapeIdx, setDrawingShapeIdx] = useState<number | null>(null);
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);

  useEffect(() => {
    if (!dragInfo) {
      pathRibbonDragStartClRef.current = null;
      pathRibbonDragStartOutlineRef.current = null;
    }
  }, [dragInfo]);
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
  /** focusGeodesyKey: geoEntryKey punktu klikniętego na planie — zapis tylko tego wiersza/vertexu; null = edycja zbiorcza (klik w kartę). */
  const [editingGeodesyCard, setEditingGeodesyCard] = useState<{
    cardInfo: GeodesyCardInfo;
    focusGeodesyKey: string | null;
    screenPos: { x: number; y: number };
  } | null>(null);
  const [cmEditDialog, setCmEditDialog] = useState<{
    shapeIdx: number;
    pointIdx: number;
    mode: "excavation" | "preparation" | "groundworkBurial";
    screenPos: { x: number; y: number };
  } | null>(null);
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
  const [shapeCreationModal, setShapeCreationModal] = useState<{ type: ShapeCreationKind } | null>(null);
  const shapeCreationBackdropDismiss = useBackdropPointerDismiss(() => setShapeCreationModal(null), shapeCreationModal !== null);
  const grassTrimBackdropDismiss = useBackdropPointerDismiss(() => setGrassTrimModal(null), grassTrimModal !== null);
  const adjustmentFillBackdropDismiss = useBackdropPointerDismiss(() => setAdjustmentFillModal(null), adjustmentFillModal !== null);
  const adjustmentExtendBackdropDismiss = useBackdropPointerDismiss(() => setAdjustmentExtendModal(null), adjustmentExtendModal !== null);
  const adjustmentSpreadBackdropDismiss = useBackdropPointerDismiss(() => setAdjustmentSpreadModal(null), adjustmentSpreadModal !== null);
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
  /** Punkty spadku projektowego (kotwica L1, styczniki L2/L3) — domyślne wysokości elementów L2. */
  const [designSlopePoints, setDesignSlopePoints] = useState<DesignSlopePoint[]>([]);
  const [designSlopeHeightModal, setDesignSlopeHeightModal] = useState<{ id: string; value: string } | null>(null);
  const smartGeodesyLabelsRef = useRef(new SmartGeodesyLabels());
  const [clusterTooltip, setClusterTooltip] = useState<{ x: number; y: number; labels: { text: string }[] } | null>(null);
  /** PDF export: render geodesy overlay for L1 or L2 without toggling the geodesy toolbar. */
  const [pdfGeodesyExportLayer, setPdfGeodesyExportLayer] = useState<null | 1 | 2>(null);
  const smartLabelLayoutKeyRef = useRef("");
  const [showAllArcPoints, setShowAllArcPoints] = useState(false);

  const isMobile = useMemo(() => typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0), []);
  const layersDropdownPanelStyle = useToolbarDropdownPanelStyle(layersDropdownRef, layersDropdownOpen, isMobile, 160);
  const modeDropdownPanelStyle = useToolbarDropdownPanelStyle(modeDropdownRef, modeDropdownOpen, isMobile, 140);
  const shapesDropdownPanelStyle = useToolbarDropdownPanelStyle(shapesDropdownRef, shapesDropdownOpen, isMobile, 140);
  const pathDropdownPanelStyle = useToolbarDropdownPanelStyle(pathDropdownRef, pathDropdownOpen, isMobile, 140);
  const linearDropdownPanelStyle = useToolbarDropdownPanelStyle(linearDropdownRef, linearDropdownOpen, isMobile, 140);
  const stairsDropdownPanelStyle = useToolbarDropdownPanelStyle(stairsDropdownRef, stairsDropdownOpen, isMobile, 160);
  const groundworkDropdownPanelStyle = useToolbarDropdownPanelStyle(groundworkDropdownRef, groundworkDropdownOpen, isMobile, 160);
  const pointRadiusEffective = isMobile ? POINT_RADIUS * 1.8 : POINT_RADIUS;
  const edgeHitThresholdEffective = isMobile ? EDGE_HIT_THRESHOLD * 1.8 : EDGE_HIT_THRESHOLD;
  const grassEdgeHitPxEffective = isMobile ? GRASS_EDGE_HIT_PX * 1.5 : GRASS_EDGE_HIT_PX;
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [namePromptShapeIdx, setNamePromptShapeIdx] = useState<number | null>(null);
  const [projectSummaryContextMenu, setProjectSummaryContextMenu] = useState<{ shapeIdx: number; x: number; y: number } | null>(null);
  const [projectSummaryDisplayPos, setProjectSummaryDisplayPos] = useState<{ x: number; y: number } | null>(null);
  const [shapeInputs, setShapeInputs] = useState({
    side: "4",
    width: "6",
    height: "4",
    base: "5",
    top: "3",
    bottom: "6",
    diameter: "4",
    name: "",
  });

  const screenToWorld = useCallback((sx: number, sy: number): Point => ({ x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom }), [pan, zoom]);
  const worldToScreen = useCallback((wx: number, wy: number): Point => ({ x: wx * zoom + pan.x, y: wy * zoom + pan.y }), [pan, zoom]);

  const transformStartVizPiecesRef = useRef<GrassPiece[] | null>(null);
  const gardenDragChildrenRef = useRef<{ idx: number; startPoints: Point[]; startVizPieces: GrassPiece[] | null; startPathCenterline?: Point[]; startPathCenterlineOriginal?: Point[] }[]>([]);
  const projectSummaryMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const arcSnapLockedTargetRef = useRef<{ si: number; ei: number; arcId: string } | null>(null);
  const arcSnapCacheRef = useRef<ArcPointCacheEntry[] | null>(null);
  const arcDragRafRef = useRef<number | null>(null);
  const arcDragPendingRef = useRef<{ mouseX: number; mouseY: number } | null>(null);

  const isOnActiveLayer = useCallback((si: number): boolean => {
    if (activeLayer === 3) return shapes[si]?.layer === 2; // Layer 3: treat Layer 2 shapes as active (same menu, points visibility)
    if (activeLayer === 4 || activeLayer === 5) return shapes[si]?.layer === 2; // Wykop / Przygotowanie — L2 only (edit values, not garden geometry)
    if (activeLayer === 6) return shapes[si]?.layer === 1 || shapes[si]?.layer === 2; // Adjustment: L1 + L2
    return shapes[si]?.layer === activeLayer;
  }, [shapes, activeLayer]);

  /** Include Layer 1 arc handles when snapping arc points in Layer 2 (garden reference). */
  const isOnActiveLayerForArcSnap = useCallback(
    (si: number): boolean => {
      if (activeLayer === 2 && shapes[si]?.layer === 1) return true;
      return isOnActiveLayer(si);
    },
    [shapes, activeLayer, isOnActiveLayer],
  );

  /** Cache of arc point positions (on curve) for snap during drag */
  const arcPointPositionCache = useMemo(
    () => buildArcPointPositionCache(shapes, isOnActiveLayerForArcSnap),
    [shapes, isOnActiveLayerForArcSnap],
  );

  /** For right-click scale: Layer 2 shapes when activeLayer=3, else normal active layer */
  const isOnActiveLayerForScale = useCallback((si: number): boolean => {
    if (activeLayer === 3) return shapes[si]?.layer === 2;
    if (activeLayer === 4 || activeLayer === 5) return false;
    if (activeLayer === 6) return shapes[si]?.layer === 1 || shapes[si]?.layer === 2;
    return shapes[si]?.layer === activeLayer;
  }, [shapes, activeLayer]);

  /** For linking / snap-to-neighbor: map canvas toolbar layer to shape.layer (L3 edits L2; L5 uses L1+L2). */
  const shapeLayerMatchesActiveCanvasLayer = useCallback((layer: LayerID): boolean => {
    if (activeLayer === 3) return layer === 2;
    if (activeLayer === 6) return layer === 1 || layer === 2;
    if (activeLayer === 4 || activeLayer === 5) return layer === 2;
    return layer === activeLayer;
  }, [activeLayer]);

  const l1GeometrySignature = useMemo(
    () =>
      shapes
        .map((s, i) => (s.layer === 1 && !s.removedFromCanvas ? `${i}:${JSON.stringify(s.points)}` : ""))
        .join("|"),
    [shapes],
  );

  useEffect(() => {
    let dspPatch: DesignSlopePoint[] | null = null;
    setShapes(prev => {
      const { nextShapes, nextDesignSlopePoints } = propagateDesignSlopesToLayer2(prev, designSlopePoints);
      if (nextDesignSlopePoints) dspPatch = nextDesignSlopePoints;
      return nextShapes ?? prev;
    });
    if (dspPatch) setDesignSlopePoints(dspPatch);
  }, [designSlopePoints, l1GeometrySignature]);

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

  /** Remove whole L2 shape and clear selection / pattern / object card (same as PPM „usuń” + Delete). */
  const deleteLayer2ElementFromContext = useCallback((si: number) => {
    saveHistory();
    setShapes(p => remapShapesAfterShapeDelete(p.filter((_, i) => i !== si), si));
    setLinkedGroups(prev => adjustLinkedGroupsAfterShapeDelete(prev, si));
    setSelectedShapeIdx(null);
    setSelectedPattern(prev => {
      if (!prev) return null;
      if (prev.shapeIdx === si) return null;
      if (prev.shapeIdx > si) return { ...prev, shapeIdx: prev.shapeIdx - 1 };
      return prev;
    });
    setObjectCardShapeIdx(prev => shiftShapeIdxAfterDelete(prev, si));
    setResultsModalShapeIdx(prev => shiftShapeIdxAfterDelete(prev, si));
    setContextMenu(null);
  }, [saveHistory]);

  const onCalculatorInputsChange = useCallback((idx: number, inputs: Record<string, any>) => {
    setShapes(p => {
      const n = [...p];
      const s = n[idx];
      if (!s) return p;
      let merged = { ...(s.calculatorInputs ?? {}), ...inputs };
      let allowPathWidthFromInputs = false;
      if (isPathElement(s)) {
        const pathKeys = ["pathWidthM", "pathCenterline", "pathSegmentSides", "pathIsOutline", "pathCenterlineOriginal", "vizSlabWidth", "vizSlabLength", "pathWidthMode"];
        allowPathWidthFromInputs =
          inputs.pathWidthM != null && inputs.pathWidthMode !== undefined && inputs.pathWidthMode !== null;
        for (const k of pathKeys) {
          if (s.calculatorInputs?.[k] === undefined) continue;
          if (allowPathWidthFromInputs && (k === "pathWidthM" || k === "pathWidthMode") && inputs[k] !== undefined) {
            merged[k] = inputs[k] as never;
            continue;
          }
          merged[k] = s.calculatorInputs[k];
        }
        if (merged.pathWidthM == null && s.calculatorInputs?.pathWidthCm != null) {
          merged.pathWidthM = Number(s.calculatorInputs.pathWidthCm) / 100;
        }
      }
      let nextShape: Shape = { ...s, calculatorInputs: merged };
      if (
        allowPathWidthFromInputs &&
        isPathElement(s) &&
        merged.pathIsOutline &&
        Array.isArray(merged.pathCenterline) &&
        (merged.pathCenterline as Point[]).length >= 2
      ) {
        const prevW = Number(s.calculatorInputs?.pathWidthM ?? 0.6) || 0.6;
        const nextW = Number(merged.pathWidthM ?? prevW) || prevW;
        if (Math.abs(nextW - prevW) > 1e-5) {
          const cl = merged.pathCenterline as Point[];
          const segmentSides = merged.pathSegmentSides as ("left" | "right")[] | undefined;
          const outline =
            Array.isArray(segmentSides) && segmentSides.length === cl.length - 1
              ? computePathOutlineFromSegmentSides(cl, segmentSides, nextW)
              : computeThickPolyline(cl, toPixels(nextW));
          if (outline.length >= 3) nextShape = { ...nextShape, points: outline };
        }
      }
      n[idx] = nextShape;
      return n;
    });
  }, []);

  const restoredFromDraftRef = useRef(false);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const planSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const planSavePendingRef = useRef(false);
  const isExportingRef = useRef(false);
  /** Set during PDF export before paint — mm per logical px for L1/L2 hybrid dimensions + legend column. */
  const pdfExportLayoutRef = useRef<{ mmPerLogicalPx: number; legendX_mm: number; legendW_mm: number } | null>(null);
  const [showPdfExportModal, setShowPdfExportModal] = useState(false);
  const [showGeodesyPrintPreview, setShowGeodesyPrintPreview] = useState(false);
  /** While geodesy PDF preview is open, keep canvas W×H as at open time so ResizeObserver cannot shrink the bitmap (avoids clipped plan). */
  const [geodesyPreviewCanvasLock, setGeodesyPreviewCanvasLock] = useState<{ w: number; h: number } | null>(null);
  const [pendingPdfLayers, setPendingPdfLayers] = useState<number[]>([]);
  const [hiddenGeodesyEntries, setHiddenGeodesyEntries] = useState<Set<string>>(() => new Set());
  const [geodesyPreviewDataUrl, setGeodesyPreviewDataUrl] = useState("");
  const [geodesyPrintPreviewTargetLayer, setGeodesyPrintPreviewTargetLayer] = useState<1 | 2>(1);
  const [geodesyPreviewListHighlightKey, setGeodesyPreviewListHighlightKey] = useState<string | null>(null);
  const prevLayerBeforeGeodesyPreviewRef = useRef<ActiveLayer | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [geodesyPrintPreviewCards, setGeodesyPrintPreviewCards] = useState<GeodesyCardInfo[]>([]);

  useEffect(() => {
    if (!showGeodesyPrintPreview) {
      setGeodesyPrintPreviewCards([]);
      return;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;
        /** During PDF generation the loop sets {@link activeLayer} per page; do not fall back to preview L1/L2 here. */
        const layerForCards: ActiveLayer =
          showGeodesyPrintPreview && !isExportingPdf
            ? ((pdfGeodesyExportLayer ?? geodesyPrintPreviewTargetLayer) as ActiveLayer)
            : activeLayer;
        const gLf = (s: Shape) => {
          if (s.layer === 1) return layerForCards === 1;
          return layerForCards === 2 || layerForCards === 3 || layerForCards === 6;
        };
        const geodesyFilter = (s: Shape) => {
          if (!gLf(s)) return false;
          if (!passesViewFilter(s, viewFilter, layerForCards)) return false;
          if (layerForCards === 6) return s.layer === 1 || s.layer === 2;
          return s.layer === layerForCards;
        };
        const geodesyHiddenActive =
          showGeodesyPrintPreview || (isExportingPdf && pdfGeodesyExportLayer != null);
        const geodesyHiddenKeysForDraw = geodesyHiddenActive ? hiddenGeodesyEntries : null;
        const smartLabels = smartGeodesyLabelsRef.current;
        const geodesyPdfPrintLabels =
          (isExportingRef.current || showGeodesyPrintPreview) && pdfGeodesyExportLayer != null;
        smartLabels.update(
          shapes,
          worldToScreen,
          pan,
          zoom,
          canvasSize.w,
          canvasSize.h,
          geodesyFilter,
          ctx,
          editingGeodesyCard?.cardInfo.group ?? null,
          geodesyHiddenKeysForDraw,
          layerForCards,
          currentTheme?.id === "light",
          geodesyPdfPrintLabels,
          getMmPerLogicalPxForDimensions(
            !!(isExportingPdf && pdfGeodesyExportLayer != null),
            pdfExportLayoutRef.current,
          ),
        );
        setGeodesyPrintPreviewCards(smartLabels.getCardsInfo());
      });
    });
    return () => cancelAnimationFrame(id);
  }, [
    showGeodesyPrintPreview,
    shapes,
    worldToScreen,
    activeLayer,
    viewFilter,
    hiddenGeodesyEntries,
    pan,
    zoom,
    canvasSize.w,
    canvasSize.h,
    isExportingPdf,
    pdfGeodesyExportLayer,
    geodesyPrintPreviewTargetLayer,
    editingGeodesyCard,
    currentTheme?.id,
  ]);

  useEffect(() => {
    if (!showGeodesyPrintPreview) return;
    setPdfGeodesyExportLayer(geodesyPrintPreviewTargetLayer);
    setActiveLayer(geodesyPrintPreviewTargetLayer);
  }, [showGeodesyPrintPreview, geodesyPrintPreviewTargetLayer]);

  const cmEditInitialCm = useMemo(() => {
    if (!cmEditDialog) return 0;
    const sh = shapes[cmEditDialog.shapeIdx];
    if (!sh) return 0;
    const { pointIdx, mode } = cmEditDialog;
    if (mode === "groundworkBurial") {
      const m = sh.groundworkBurialDepthM?.[pointIdx];
      const cm = m != null && !Number.isNaN(m) ? m * 100 : 0;
      return roundCmToOneMm(cm);
    }
    const v =
      mode === "excavation" ? getExcavationCmAtVertex(sh, pointIdx) : getPreparationCmAtVertex(sh, pointIdx);
    return roundCmToOneMm(v != null ? v : 0);
  }, [cmEditDialog, shapes]);

  const confirmCmEditDialog = useCallback(
    (parsed: number) => {
      if (!cmEditDialog || Number.isNaN(parsed)) {
        setCmEditDialog(null);
        return;
      }
      const { shapeIdx, pointIdx, mode } = cmEditDialog;
      saveHistory();
      setShapes(prev => {
        const n = [...prev];
        const sh0 = n[shapeIdx];
        if (!sh0) return prev;
        const sh = { ...sh0 };
        if (mode === "groundworkBurial") {
          const depthM = parsed / 100;
          const arr = sh.groundworkBurialDepthM ? [...sh.groundworkBurialDepthM] : sh.points.map(() => 0);
          while (arr.length < sh.points.length) arr.push(0);
          arr[pointIdx] = depthM;
          n[shapeIdx] = { ...sh, groundworkBurialDepthM: arr };
          return n;
        }
        const field = mode === "excavation" ? "excavationCm" : "preparationCm";
        const arr = sh[field] ? [...sh[field]!] : [];
        arr[pointIdx] = parsed;
        n[shapeIdx] = { ...sh, [field]: arr };
        return n;
      });
      setCmEditDialog(null);
    },
    [cmEditDialog, saveHistory],
  );

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
          applyPayload(payload as { shapes?: Shape[]; projectSettings?: ProjectSettings; pan?: Point; zoom?: number; activeLayer?: ActiveLayer; linkedGroups?: LinkedEntry[][]; designSlopePoints?: DesignSlopePoint[] });
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
        const draft = JSON.parse(raw) as { shapes?: Shape[]; projectSettings?: ProjectSettings; pan?: Point; zoom?: number; activeLayer?: ActiveLayer; linkedGroups?: LinkedEntry[][]; designSlopePoints?: DesignSlopePoint[]; savedAt?: string };
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
    function applyPayload(d: { shapes?: Shape[]; projectSettings?: ProjectSettings; pan?: Point; zoom?: number; activeLayer?: ActiveLayer; linkedGroups?: LinkedEntry[][]; designSlopePoints?: DesignSlopePoint[] }) {
      if (d.shapes?.length) {
        const migrated = ensureCanvasElementIds(
          d.shapes.map(s => {
            let x: Shape = (s as { layer?: number }).layer === 0 ? { ...(s as Shape), layer: 1 as LayerID } : (s as Shape);
            x = migrateLegacyCirclePolygon(x);
            return x;
          })
        );
        setShapes(migrated);
        historyRef.current = [];
        setHistory([]);
      }
      if (Array.isArray(d.designSlopePoints)) setDesignSlopePoints(d.designSlopePoints as DesignSlopePoint[]);
      else if (d.shapes?.length) setDesignSlopePoints([]);
      if (d.projectSettings) setProjectSettings({ ...DEFAULT_PROJECT_SETTINGS, ...d.projectSettings });
      if (d.pan) setPan(d.pan);
      if (typeof d.zoom === "number" && d.zoom >= MIN_ZOOM && d.zoom <= MAX_ZOOM) setZoom(d.zoom);
      if (typeof d.activeLayer === "number") {
        const rev = d.projectSettings?.canvasLayerRevision ?? 0;
        let al = d.activeLayer;
        if (rev < 2) {
          if (al === 4) al = 5;
          else if (al === 5) al = 6;
        }
        if (al === 1 || al === 2 || al === 3 || al === 4 || al === 5 || al === 6) setActiveLayer(al as ActiveLayer);
        else if (al === 0) setActiveLayer(1);
      }
      if (Array.isArray(d.linkedGroups)) setLinkedGroups(d.linkedGroups);
    }
    load();
  }, [urlPlanId]);

  useEffect(() => {
    if (!urlPlanId) {
      setLinkedEventId(null);
      return;
    }
    const cid = useAuthStore.getState().getCompanyId();
    if (!cid) return;
    getPlanRow(supabase, urlPlanId, cid)
      .then((row) => setLinkedEventId(row?.event_id ?? null))
      .catch(() => setLinkedEventId(null));
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
      const payload: CanvasPayload = { shapes, projectSettings, pan, zoom, activeLayer, linkedGroups, designSlopePoints, savedAt: new Date().toISOString() };
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
  }, [shapes, projectSettings, pan, zoom, activeLayer, linkedGroups, designSlopePoints, user?.id, urlPlanId, navigate]);

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
          const payload = { shapes, projectSettings, pan, zoom, activeLayer, linkedGroups, designSlopePoints, savedAt: new Date().toISOString() };
          localStorage.setItem(key, JSON.stringify(payload));
        } catch {
          // ignore
        }
      }, DRAFT_DEBOUNCE_MS);
      return () => {
        if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
      };
    }
  }, [shapes, projectSettings, pan, zoom, activeLayer, linkedGroups, designSlopePoints, projectSettings.title, doSavePlan]);

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
          } else if (
            shape.calculatorType === "paving" &&
            (inputs?.blockWidthCm || inputs?.blockLengthCm || inputs?.monoblockLayoutMode === "mix")
          ) {
            const usePathCobble = inputs?.pathCenterline && !inputs?.monoblockLayoutMode?.includes("mix");
            const cutsResult = usePathCobble
              ? computePathCobbleCuts(pathShape, inputs)
              : computeCobblestoneCuts(pathShape, inputs);
            const fullBlockCount = "fullSlabCount" in cutsResult ? (cutsResult as any).fullSlabCount : (cutsResult as any).fullBlockCount;
            const cutBlockCount = "cutSlabCount" in cutsResult ? (cutsResult as any).cutSlabCount : (cutsResult as any).cutBlockCount;
            const { wasteSatisfiedPositions, wasteAreaCm2, reusedAreaCm2 } = cutsResult;
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
      if (
        !isPathElement(shape) &&
        shape.calculatorType === "paving" &&
        shape.closed &&
        shape.points.length >= 3 &&
        (shape.calculatorInputs?.blockWidthCm ||
          shape.calculatorInputs?.blockLengthCm ||
          shape.calculatorInputs?.monoblockLayoutMode === "mix")
      ) {
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

    /**
     * Geodesy print preview: draw as target L1/L2 so adjustment/editor toolbar layer does not leak into the thumbnail.
     * PDF export loop: {@link activeLayer} is set per page (1–6, 101→1, 102→2); while {@link isExportingPdf}, must use that —
     * otherwise `pdfGeodesyExportLayer` is null for non-geodesy pages and `?? geodesyPrintPreviewTargetLayer` forces L1/L2 on every sheet.
     */
    const layerForRender: ActiveLayer =
      showGeodesyPrintPreview && !isExportingPdf
        ? ((pdfGeodesyExportLayer ?? geodesyPrintPreviewTargetLayer) as ActiveLayer)
        : activeLayer;
    /** Wymiary vs geodezja — zanim zdefiniowany zostanie geodesyLayerFilter w pętli głównej (ciemny L1 na L2). */
    const showGeodesyForDims = geodesyEnabled || pdfGeodesyExportLayer != null;

    const isLightCanvas = currentTheme?.id === "light";
    const canvasPrimLabelFill = isLightCanvas ? CC.text : "#ffffff";
    const extDimLine = isLightCanvas ? CC.textDim : GARDEN_EXTERIOR_DIM_LINE_COLOR;
    const extDimText = isLightCanvas ? CC.text : GARDEN_EXTERIOR_DIM_TEXT_COLOR;
    const linearDimPalette = {
      text: CC.text,
      textDim: CC.textDim,
      accent: CC.accent,
      angleText: CC.angleText,
      badge: CC.badge,
    };

    const _polyCache = new Map<number, Point[]>();
    const getCachedPoly = (si: number): Point[] => {
      if (_polyCache.has(si)) return _polyCache.get(si)!;
      const poly = getEffectivePolygon(shapes[si]);
      _polyCache.set(si, poly);
      return poly;
    };

    /** PDF export + geodesy print preview: same as printed PDF (micro-dots, no HUD). */
    const printPdf = isExportingRef.current || showGeodesyPrintPreview;
    const hideEdgeDimsGeoPdf = printPdf && pdfGeodesyExportLayer != null;
    const mmPerPxGeo = getMmPerLogicalPxForDimensions(
      !!(isExportingPdf && pdfGeodesyExportLayer != null),
      pdfExportLayoutRef.current,
    );
    /** Geodesy PDF: ~2 mm diameter vertex dots on paper; L1/L2 PDF: legacy micro-dots. */
    const PDF_VERTEX_DOT_R = hideEdgeDimsGeoPdf ? Math.max(0.9, 1 / mmPerPxGeo) : 1.15;
    const pdfOrEditorR = (r: number) => (printPdf ? PDF_VERTEX_DOT_R : r);

    ctx.fillStyle = CC.bg;
    ctx.fillRect(0, 0, W, H);

    if (pointOffsetAlongLinePick && !printPdf) {
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

    // Origin (hidden during PDF export / geodesy preview)
    if (!printPdf) {
      const o = worldToScreen(0, 0);
      ctx.strokeStyle = CC.textDim; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(o.x, 0); ctx.lineTo(o.x, H); ctx.moveTo(0, o.y); ctx.lineTo(W, o.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Effective mouse with shift: strict 45°/90° from last vertex (same for path, wall, fence, etc.)
    const eMouseRaw = (() => {
      if (!shiftHeld || drawingShapeIdx === null || !shapes[drawingShapeIdx]) return mouseWorld;
      const ds = shapes[drawingShapeIdx];
      const pts = ds.points;
      if (pts.length === 0) return mouseWorld;
      const chain = wallBaselineChainForDrawing(ds, pts);
      const lastRef = chain[chain.length - 1]!;
      return snapTo45(lastRef, mouseWorld);
    })();

    // Smart guides: free polygon = magnet + axis-align to current chain; linear/path = magnet (+ thick-edge) via snapWorldPointForLinearDrawing
    const smartGuides: { axis: "x" | "y"; worldValue: number; ptIdx: number; refWorld?: Point }[] = [];
    let eMouse = { ...eMouseRaw };
    if (drawingShapeIdx !== null && shapes[drawingShapeIdx]) {
      const drawPts = shapes[drawingShapeIdx].points;
      const ds = shapes[drawingShapeIdx];
      const snapChain = wallBaselineChainForDrawing(ds, drawPts);
      if (drawPts.length > 0) {
        if (isLinearElement(ds) || isPathElement(ds)) {
          const preLinear = shouldSkipSnapPointToDrawingChainAxesForStrip(ds)
            ? eMouseRaw
            : applyVertexAxisAlignWhileDrawing(eMouseRaw, shapes, drawingShapeIdx, zoom);
          eMouse = snapWorldPointForLinearDrawing(preLinear, {
            drawingShapeIdx,
            shapes,
            localPtChain: snapChain,
            drawingShape: ds,
            zoom,
            viewFilter,
            activeLayer,
          }).point;
          if (!shouldSkipSnapPointToDrawingChainAxesForStrip(ds)) {
            eMouse = snapPointToDrawingChainAxes(eMouse, snapChain, zoom);
          }
        } else {
          eMouse = snapDrawingMagnet(eMouseRaw, {
            drawingShapeIdx,
            shapes,
            localPtChain: drawPts,
            zoom,
            viewFilter,
            activeLayer,
          });
          const sgThreshold = DRAW_SMART_GUIDE_PX / zoom;
          let bestDx = sgThreshold, bestDy = sgThreshold;
          let snapXVal: number | null = null, snapYVal: number | null = null;
          let snapXIdx = -1, snapYIdx = -1;
          for (let i = 0; i < drawPts.length; i++) {
            const dx = Math.abs(eMouse.x - drawPts[i].x);
            const dy = Math.abs(eMouse.y - drawPts[i].y);
            if (dx < bestDx) { bestDx = dx; snapXVal = drawPts[i].x; snapXIdx = i; }
            if (dy < bestDy) { bestDy = dy; snapYVal = drawPts[i].y; snapYIdx = i; }
          }
          if (snapXVal !== null) { eMouse.x = snapXVal; smartGuides.push({ axis: "x", worldValue: snapXVal, ptIdx: snapXIdx }); }
          if (snapYVal !== null) { eMouse.y = snapYVal; smartGuides.push({ axis: "y", worldValue: snapYVal, ptIdx: snapYIdx }); }
        }
        if (isLinearElement(ds) || isPathElement(ds)) {
          const sgThreshold = DRAW_SMART_GUIDE_PX / zoom;
          for (let i = 0; i < snapChain.length; i++) {
            if (Math.abs(eMouse.x - snapChain[i].x) < sgThreshold) smartGuides.push({ axis: "x", worldValue: snapChain[i].x, ptIdx: i });
            if (Math.abs(eMouse.y - snapChain[i].y) < sgThreshold) smartGuides.push({ axis: "y", worldValue: snapChain[i].y, ptIdx: i });
          }
          // Strip tools skip axis snap (edge-follow); still show green guides to other vertices like terrain / free polygon
          if (shouldSkipSnapPointToDrawingChainAxesForStrip(ds)) {
            const { xRef, yRef } = findVertexAxisAlignRefs(eMouse, shapes, drawingShapeIdx, zoom);
            if (xRef) smartGuides.push({ axis: "x", worldValue: xRef.x, ptIdx: -1, refWorld: { ...xRef } });
            if (yRef) smartGuides.push({ axis: "y", worldValue: yRef.y, ptIdx: -1, refWorld: { ...yRef } });
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
        const dragSi = dragInfo.shapeIdx;
        const dragPi = dragInfo.pointIdx;
        /** When several vertices share the same axis (e.g. vertical wall), pick the neighbor along the chain, not index 0. */
        const pickBetterAxisAlign = (
          d: number,
          si: number,
          pi: number,
          bestD: number,
          bestSi: number,
          bestPi: number,
        ): boolean => {
          const eps = 1e-12;
          if (d < bestD - eps) return true;
          if (Math.abs(d - bestD) > eps) return false;
          const sameNew = si === dragSi;
          const sameOld = bestSi === dragSi;
          if (sameNew && sameOld) return Math.abs(pi - dragPi) < Math.abs(bestPi - dragPi);
          if (sameNew && !sameOld) return true;
          if (!sameNew && sameOld) return false;
          return false;
        };
        let bestDx = threshold, bestDy = threshold;
        let snapXVal: number | null = null, snapYVal: number | null = null;
        let snapXSi = -1, snapYSi = -1, snapXPi = -1, snapYPi = -1;
        for (let si = 0; si < shapes.length; si++) {
          const pts = shapes[si].points;
          for (let pi = 0; pi < pts.length; pi++) {
            if (si === dragSi && pi === dragPi) continue;
            const pt = pts[pi];
            const dx = Math.abs(draggedPt.x - pt.x);
            const dy = Math.abs(draggedPt.y - pt.y);
            if (pickBetterAxisAlign(dx, si, pi, bestDx, snapXSi, snapXPi)) {
              bestDx = dx;
              snapXVal = pt.x;
              snapXSi = si;
              snapXPi = pi;
            }
            if (pickBetterAxisAlign(dy, si, pi, bestDy, snapYSi, snapYPi)) {
              bestDy = dy;
              snapYVal = pt.y;
              snapYSi = si;
              snapYPi = pi;
            }
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
      if (shape.removedFromCanvas) return;
      if (layerForRender === 1 || layerForRender === 2) {
        if (shape.layer === layerForRender) return;
      }
      if (layerForRender === 4 || layerForRender === 5) {
        if (shape.layer === 2) return;
      }
      // Foundation: hide in L2 main and L3; show on wykop/prep
      if (shape.elementType === "foundation" && (layerForRender === 3 || layerForRender === 4 || layerForRender === 5)) return;
      // Groundwork linear: tylko Widok Wykop / Przygotowanie
      if (isGroundworkLinear(shape) && layerForRender !== 4 && layerForRender !== 5) return;
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

      if (!hideEdgeDimsGeoPdf && !showGeodesyForDims && layerForRender === 2 && shape.layer === 1 && shape.closed && pts.length >= 3) {
        const geoCompactDimL1 = showGeodesyForDims;
        const edgeLabelOffset = geoCompactDimL1 ? 26 : 42;
        const edgeFontPxInactive = geoCompactDimL1 ? 7 : 12;
        for (let i = 0; i < edgeCount; i++) {
          const j = (i + 1) % pts.length;
          const sa = worldToScreen(pts[i].x, pts[i].y);
          const sb = worldToScreen(pts[j].x, pts[j].y);
          const mid = midpoint(sa, sb);
          const norm = edgeNormalAngle(sa, sb);
          const arcs = shape.edgeArcs?.[i];
          const len = calcEdgeLengthWithArcs(pts[i], pts[j], arcs);
          const lenM = toMeters(len);
          const edgeAngle = Math.atan2(sb.y - sa.y, sb.x - sa.x);
          const textAngle = readableTextAngle(edgeAngle);
          if (!arcs?.length) {
            const out = edgeOutwardRadForL1Edge(shapes, si, i);
            if (out != null) {
              const dimLabel = formatDimensionCm(lenM);
              drawExteriorAlignedDimension(
                ctx,
                sa,
                sb,
                out,
                boundaryDimL1ExteriorOffsetScreenPx(zoom),
                dimLabel,
                GARDEN_EXTERIOR_DIM_LINE_COLOR,
                GARDEN_EXTERIOR_DIM_TEXT_COLOR,
                edgeFontPxInactive,
              );
              continue;
            }
          }
          const lx = mid.x - Math.cos(norm) * edgeLabelOffset;
          const ly = mid.y - Math.sin(norm) * edgeLabelOffset;
          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(textAngle);
          ctx.font = `${edgeFontPxInactive}px 'JetBrains Mono','Fira Code',monospace`;
          ctx.fillStyle = canvasPrimLabelFill;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(formatDimensionCm(lenM), 0, 0);
          ctx.restore();
        }
      }

      // No centroid m² here for dimmed L1/L2 — L1 garden has no area badge; L2 uses main pass / patterns.
    });

    // ── Layer 3: draw patterns on top of grey Layer 2 shapes (hidden in geodesy mode) ──
    if (layerForRender === 3 && !geodesyEnabled) {
      shapes.forEach((shape, si) => {
        if (shape.removedFromCanvas) return;
        if (!passesViewFilter(shape, viewFilter, layerForRender)) return;
        if (shape.layer !== 2) return;
        if (isPathElement(shape)) {
          if (!shape.closed) return;
          const outline = getPathPolygon(shape);
          if (outline.length < 3) return;
          const pathShape = { ...shape, points: outline, closed: true } as Shape;
          const isSel = shapeSelectionSet.has(si);
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
            const pathSlabDrawn = drawPathSlabPattern(ctx, pathShape, worldToScreen, zoom, true, !isSel, pathOffsetBySegOverride, shapes);
            if (!pathSlabDrawn) {
              drawSlabPattern(ctx, pathShape, worldToScreen, zoom, true, undefined, undefined, !isSel, canvasPrimLabelFill);
            }
            if (shouldDrawSlabFrameViz(shape.calculatorInputs)) {
              drawSlabFrame(ctx, pathShape, worldToScreen, zoom, shapes);
            }
          } else if (shape.calculatorType === "paving" && shape.calculatorInputs) {
            const pathOffsetBySegOverride = (patternDragInfo?.shapeIdx === si && patternDragInfo?.isPath && pathPatternLongOffsetPreview != null)
              ? { [pathPatternLongOffsetPreview.segmentIdx]: pathPatternLongOffsetPreview.value }
              : undefined;
            const pathCobbleDrawn = drawPathCobblePattern(ctx, pathShape, worldToScreen, zoom, true, !isSel, pathOffsetBySegOverride, shapes);
            if (!pathCobbleDrawn) {
              const pathOffsetOverride = (patternDragInfo?.shapeIdx === si && patternDragInfo?.isPath && pathPatternLongOffsetPreview != null && pathPatternLongOffsetPreview.segmentIdx === 0)
                ? pathPatternLongOffsetPreview.value
                : undefined;
              drawCobblestonePattern(ctx, pathShape, worldToScreen, zoom, true, undefined, undefined, !isSel, pathOffsetOverride, canvasPrimLabelFill);
            }
            if (shape.calculatorInputs?.addFrameToMonoblock && shape.calculatorInputs?.framePieceWidthCm) {
              drawMonoblockFrame(ctx, pathShape, worldToScreen, zoom);
            }
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
          if (shape.calculatorInputs?.pathIsOutline && outline.length >= 3) {
            if (printPdf) {
              for (let vi = 0; vi < outline.length; vi++) {
                const sp = worldToScreen(outline[vi].x, outline[vi].y);
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, PDF_VERTEX_DOT_R, 0, Math.PI * 2);
                ctx.fillStyle = CC.layer2Edge;
                ctx.fill();
                ctx.strokeStyle = "rgba(255,255,255,0.4)";
                ctx.lineWidth = 0.75;
                ctx.stroke();
              }
            } else if (shapeSelectionSet.has(si) || si === objectCardShapeIdx || selectedPattern?.shapeIdx === si) {
              const vtxR = POINT_RADIUS + 4;
              for (let vi = 0; vi < outline.length; vi++) {
                const sp = worldToScreen(outline[vi].x, outline[vi].y);
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, vtxR + 3, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(255,255,255,0.95)";
                ctx.fill();
                ctx.strokeStyle = "#1a2538";
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, vtxR, 0, Math.PI * 2);
                ctx.fillStyle = CC.accent;
                ctx.fill();
                ctx.strokeStyle = CC.point;
                ctx.lineWidth = 2;
                ctx.stroke();
              }
            }
          }
          return;
        }
        if (!shape.closed || shape.points.length < 3) return;
        const isSel = shapeSelectionSet.has(si);
        const slabOffset = patternDragInfo?.shapeIdx === si && patternDragInfo?.type === "slab" ? (patternDragPreview ?? patternDragInfo.startOffset) : undefined;
        const cobbleOffset = patternDragInfo?.shapeIdx === si && patternDragInfo?.type === "cobblestone" ? (patternDragPreview ?? patternDragInfo.startOffset) : undefined;
        const slabDir = patternRotateInfo?.shapeIdx === si && patternRotateInfo?.type === "slab" ? (patternRotatePreview ?? patternRotateInfo.startDirectionDeg) : undefined;
        const cobbleDir = patternRotateInfo?.shapeIdx === si && patternRotateInfo?.type === "cobblestone" ? (patternRotatePreview ?? patternRotateInfo.startDirectionDeg) : undefined;
        const grassDir = patternRotateInfo?.shapeIdx === si && patternRotateInfo?.type === "grass" ? (patternRotatePreview ?? patternRotateInfo.startDirectionDeg) : undefined;
        if (shape.calculatorType === "deck" && shape.calculatorInputs?.boardLength) {
          drawDeckPattern(ctx, shape, worldToScreen, zoom, !isSel);
        }
        if ((shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && shape.calculatorInputs?.vizSlabWidth) {
          drawSlabPattern(ctx, shape, worldToScreen, zoom, true, slabOffset, slabDir, !isSel, canvasPrimLabelFill);
          if (shouldDrawSlabFrameViz(shape.calculatorInputs)) {
            drawSlabFrame(ctx, shape, worldToScreen, zoom, shapes);
          }
        }
        if (shape.calculatorType === "paving" && shape.closed) {
          drawCobblestonePattern(ctx, shape, worldToScreen, zoom, true, cobbleOffset, cobbleDir, !isSel);
          if (shape.calculatorInputs?.addFrameToMonoblock && shape.calculatorInputs?.framePieceWidthCm) {
            drawMonoblockFrame(ctx, shape, worldToScreen, zoom);
          }
        }
        if (shape.calculatorType === "grass") {
          if (shouldDrawSlabFrameViz(shape.calculatorInputs)) {
            drawSlabFrame(ctx, shape, worldToScreen, zoom, shapes);
          }
          if ((shape.calculatorInputs?.vizPieces?.length ?? 0) > 0) {
            drawGrassPieces(ctx, shape, worldToScreen, zoom, isSel, grassScaleInfo, si, printPdf, grassDir, canvasPrimLabelFill, isLightCanvas);
          }
        }
        if (shape.calculatorType === "decorativeStones") {
          drawGravelPattern(ctx, shape, worldToScreen, zoom, !isSel);
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
      if (!printPdf) {
        shapes.forEach((shape, si) => {
          if (shape.removedFromCanvas) return;
          if (!passesViewFilter(shape, viewFilter, layerForRender)) return;
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
    }

    // ── Layer 4/5: Wykop / Przygotowanie — roboty ziemne liniowe (drenaż, rury, kabel)
    if (layerForRender === 4 || layerForRender === 5) {
      // Groundwork linear elements
      shapes.forEach((shape, si) => {
        if (shape.removedFromCanvas) return;
        if (shape.layer !== 2 || !isGroundworkLinear(shape)) return;
        if (!passesViewFilterWithGroundworkOnExcavationLayers(shape, viewFilter, layerForRender)) return;
        const pts = shape.points;
        if (pts.length < 1) return;
        if (pts.length >= 2) {
          drawLinearElement(
          ctx,
          shape,
          worldToScreen,
          zoom,
          shapeSelectionSet.has(si),
          false,
          undefined,
          true,
          linearDimPalette,
          null,
        );
        }
        pts.forEach((p, pi) => {
          const sp = worldToScreen(p.x, p.y);
          const isFirstOnly = si === drawingShapeIdx && pts.length === 1 && pi === 0;
          const r = pdfOrEditorR(isFirstOnly ? POINT_RADIUS + 2 : POINT_RADIUS * 0.8);
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
          ctx.fillStyle = CC.layer2Edge; ctx.fill();
          ctx.strokeStyle = CC.point; ctx.lineWidth = printPdf ? 0.85 : 2; ctx.stroke();
          if (isFirstOnly && !printPdf) {
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
        if (pts.length >= 2) drawShapeObjectLabel(ctx, shape, worldToScreen, shape.label || groundworkLabel(shape), zoom, canvasPrimLabelFill);
      });
    }

    // ── Draw active layer shapes ──────────────────────────
    const showGeodesy = geodesyEnabled || pdfGeodesyExportLayer != null;
    // Geodesy only for layer 1 when viewing layer 1; for layer 2 when viewing 2/3/6 (not wykop/prep 4–5)
    const geodesyLayerFilter = (s: Shape) => {
      if (s.layer === 1) return layerForRender === 1;
      return layerForRender === 2 || layerForRender === 3 || layerForRender === 6;
    };
    const geodesyGlobalRange = showGeodesy ? computeGlobalHeightRange(shapes, s =>
      geodesyLayerFilter(s) && (!(layerForRender === 3 || layerForRender === 6) ? s.layer === layerForRender : (s.layer === 1 || s.layer === 2))
    ) : undefined;

    const excavationGlobalRange =
      layerForRender === 4
        ? computeGlobalCmRange(shapes, "excavation", s => s.layer === 2 && passesViewFilter(s, viewFilter, layerForRender))
        : { min: 0, max: 0 };
    const preparationGlobalRange =
      layerForRender === 5
        ? computeGlobalCmRange(shapes, "preparation", s => s.layer === 2 && passesViewFilter(s, viewFilter, layerForRender))
        : { min: 0, max: 0 };

    const geodesyHiddenActive =
      showGeodesyPrintPreview || (isExportingPdf && pdfGeodesyExportLayer != null);
    const geodesyHiddenKeysForDraw = geodesyHiddenActive ? hiddenGeodesyEntries : null;

    /** Geodezja: layout etykiet przed kropkami — kolory kropek = {@link SmartGeodesyLabels.getGeodesyPointCanvasFill}. */
    if (showGeodesy) {
      const geodesyFilterPreDraw = (s: Shape) => {
        if (!geodesyLayerFilter(s)) return false;
        if (!passesViewFilter(s, viewFilter, layerForRender)) return false;
        if (layerForRender === 6) return s.layer === 1 || s.layer === 2;
        return s.layer === layerForRender;
      };
      const smartLabelsPre = smartGeodesyLabelsRef.current;
      const hiddenPrintKeyPre = geodesyHiddenActive ? [...hiddenGeodesyEntries].sort().join(";") : "";
      const slKeyPre = `${layerForRender}|${showGeodesy}|${pdfGeodesyExportLayer ?? ""}|${hiddenPrintKeyPre}|${hideEdgeDimsGeoPdf ? 1 : 0}`;
      if (smartLabelLayoutKeyRef.current !== slKeyPre) {
        smartLabelLayoutKeyRef.current = slKeyPre;
        smartLabelsPre.markDirty();
      }
      smartLabelsPre.update(
        shapes,
        worldToScreen,
        pan,
        zoom,
        canvasSize.w,
        canvasSize.h,
        geodesyFilterPreDraw,
        ctx,
        editingGeodesyCard?.cardInfo.group ?? null,
        geodesyHiddenKeysForDraw,
        layerForRender,
        currentTheme?.id === "light",
        hideEdgeDimsGeoPdf,
        getMmPerLogicalPxForDimensions(
          !!(isExportingPdf && pdfGeodesyExportLayer != null),
          pdfExportLayoutRef.current,
        ),
      );
    }

    const geoVertexDotFill = (si: number, pi: number) =>
      smartGeodesyLabelsRef.current.getGeodesyPointCanvasFill(`v|${si}|${pi}`) ??
      (isLightCanvas ? CC.text : "#ffffff");
    const geoHeightDotFill = (si: number, hpi: number) =>
      smartGeodesyLabelsRef.current.getGeodesyPointCanvasFill(`h|${si}|${hpi}`) ?? canvasPrimLabelFill;

    shapes.forEach((shape, si) => {
      if (shape.removedFromCanvas) return;
      if (!passesViewFilter(shape, viewFilter, layerForRender)) return;
      if (isGroundworkLinear(shape)) return;
      if (layerForRender === 6) { if (shape.layer !== 1 && shape.layer !== 2) return; }
      else if (layerForRender === 4 || layerForRender === 5) { if (shape.layer !== 2) return; }
      else if (layerForRender === 3) { if (shape.layer !== 2) return; }
      else if (shape.layer !== layerForRender) return;
      // Foundation visible only in Layer 4, hidden in Layer 2
      if (layerForRender === 2 && shape.elementType === "foundation") return;
      const pts = shape.points;
      if (pts.length < 1) return;
      const isSel = shapeSelectionSet.has(si);
      const isDraw = si === drawingShapeIdx;
      const isOpen = !shape.closed;
      const isL2 = shape.layer === 2;
      const geoDimCompact = showGeodesy && geodesyLayerFilter(shape);
      const edgeDimFont = EDGE_LENGTH_LABEL_FONT_STACK;
      const edgeLabelOffsetDim = geoDimCompact ? 30 : 44;
      const slopeLabelOffsetDim = geoDimCompact ? 28 : 52;
      const edgeFontPxExterior = EDGE_LENGTH_LABEL_FONT_PX;
      const edgeColor = isOpen ? CC.open : isL2 ? CC.layer2Edge : CC.edge;
      const edgeHovColor = isOpen ? CC.openHover : isL2 ? CC.layer2 : CC.edgeHover;

      if (isPathElement(shape)) {
        const outline = getPathPolygon(shape);
        const derivedRibbonCl = getPathRibbonDerivedCenterline(shape);
        // Match slab/cobble pattern: stored pathCenterline (ribbon edge) — not derived mid-outline, so dashed line aligns with pattern layout.
        const pts: Point[] =
          shape.calculatorInputs?.pathIsOutline && shape.calculatorInputs?.pathCenterlineOriginal
            ? (shape.calculatorInputs.pathCenterlineOriginal as Point[])
            : shape.calculatorInputs?.pathIsOutline && shape.calculatorInputs?.pathCenterline
              ? (shape.calculatorInputs.pathCenterline as Point[])
              : derivedRibbonCl && derivedRibbonCl.length >= 2
                ? derivedRibbonCl
                : shape.points;
        const pointsToShow = (shape.calculatorInputs?.pathIsOutline && shape.closed && outline.length >= 3) ? outline : pts;
        const inSegmentSideSelection = pathSegmentSideSelection && pathSegmentSideSelection.shapeIdx === si;
        if (inSegmentSideSelection) {
          const pathWidthM = Number(shape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6;
          const fullPx = toPixels(pathWidthM);
          const animT = (Date.now() % 1200) / 1200;
          const dashOffset = animT * 12;
          const selSides = pathSegmentSideSelection!.segmentSides;
          let segGuidePts = pts;
          if (shape.calculatorInputs?.pathIsOutline && shape.closed && pts.length < 4 && outline.length >= 6) {
            const ex = extractPathRibbonCenterlineFromOutline(outline);
            if (ex.length === 4) segGuidePts = ex;
          }
          for (let i = 0; i < segGuidePts.length - 1; i++) {
            const A = segGuidePts[i]!;
            const B = segGuidePts[i + 1]!;
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
            const outlineShape = { ...shape, points: outline, closed: true } as Shape;
            const pathHasArcs = !!(shape.edgeArcs?.some((a) => a && a.length > 0));
            ctx.beginPath();
            if (pathHasArcs) {
              const effFill = getEffectivePolygon(outlineShape);
              if (effFill.length >= 3) {
                drawSmoothPolygonPath(ctx, effFill, worldToScreen);
              } else {
                const s0 = worldToScreen(outline[0].x, outline[0].y);
                ctx.moveTo(s0.x, s0.y);
                for (let i = 1; i < outline.length; i++) {
                  const s = worldToScreen(outline[i].x, outline[i].y);
                  ctx.lineTo(s.x, s.y);
                }
                ctx.closePath();
              }
            } else {
              const s0 = worldToScreen(outline[0].x, outline[0].y);
              ctx.moveTo(s0.x, s0.y);
              for (let i = 1; i < outline.length; i++) {
                const s = worldToScreen(outline[i].x, outline[i].y);
                ctx.lineTo(s.x, s.y);
              }
              ctx.closePath();
            }
            if (layerForRender !== 3) {
              if (layerForRender === 4 && isL2 && shapeHasExcavationOrPrepData(shape, "excavation")) {
                fillShapeExcavationPrepHeatmap(ctx, shape, worldToScreen, "excavation", excavationGlobalRange);
              } else if (layerForRender === 5 && isL2 && shapeHasExcavationOrPrepData(shape, "preparation")) {
                fillShapeExcavationPrepHeatmap(ctx, shape, worldToScreen, "preparation", preparationGlobalRange);
              } else if ((layerForRender === 4 || layerForRender === 5) && isL2) {
                ctx.fillStyle = "rgba(138, 143, 168, 0.15)";
                ctx.fill();
              } else if (showGeodesy && geodesyLayerFilter(shape) && layerForRender !== 4 && layerForRender !== 5) {
                const interiorForHeatmap =
                  pathHasArcs && outlineShape.points.length >= 3
                    ? getEffectivePolygon(outlineShape)
                    : outline;
                fillShapeHeightHeatmap(ctx, shape, worldToScreen, geodesyGlobalRange, {
                  interiorPolygon: interiorForHeatmap.length >= 3 ? interiorForHeatmap : undefined,
                });
              } else {
                ctx.fillStyle = isSel ? "rgba(108,92,231,0.15)" : CC.layer2Dim;
                ctx.fill();
              }
            }
            if (layerForRender !== 3) {
              ctx.strokeStyle = isSel ? edgeHovColor : edgeColor;
              ctx.lineWidth = isSel ? 2.5 : 1.8;
              if (pathHasArcs) {
                const { points: effPts, edgeIndices } = getEffectivePolygonWithEdgeIndices(outlineShape);
                drawSmoothPolygonStroke(ctx, effPts, edgeIndices, worldToScreen, () => ({
                  strokeStyle: isSel ? edgeHovColor : edgeColor,
                  lineWidth: isSel ? 2.5 : 1.8,
                }));
              } else {
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
        }
        pointsToShow.forEach((p, pi) => {
          if (isVertexHiddenForGeodesyExportPreview(p.x, p.y, si, shape.points, geodesyHiddenKeysForDraw)) return;
          const sp = worldToScreen(p.x, p.y);
          const isH = hoveredPoint && hoveredPoint.shapeIdx === si && hoveredPoint.pointIdx === pi;
          const isD = dragInfo && dragInfo.shapeIdx === si && dragInfo.pointIdx === pi;
          if (showGeodesy && geodesyLayerFilter(shape)) {
            if (printPdf) {
              const rGeo = pdfOrEditorR(GEODESY_CANVAS_VERTEX_DOT_R);
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, rGeo, 0, Math.PI * 2);
              ctx.fillStyle = geoVertexDotFill(si, pi);
              ctx.fill();
              ctx.strokeStyle = isLightCanvas ? "rgba(15,23,42,0.55)" : "rgba(15,23,42,0.78)";
              ctx.lineWidth = hideEdgeDimsGeoPdf ? Math.max(0.35, 0.4 * mmPerPxGeo) : 1;
              ctx.stroke();
              return;
            }
            const rGeo = GEODESY_CANVAS_VERTEX_DOT_R * (isH || isD ? 1.45 : 1);
            if (isH || isD) {
              ctx.beginPath(); ctx.arc(sp.x, sp.y, rGeo + 4, 0, Math.PI * 2);
              ctx.fillStyle = "rgba(108,92,231,0.35)"; ctx.fill();
            }
            ctx.beginPath(); ctx.arc(sp.x, sp.y, rGeo, 0, Math.PI * 2);
            ctx.fillStyle = geoVertexDotFill(si, pi);
            ctx.fill();
            ctx.strokeStyle = "rgba(15,23,42,0.78)"; ctx.lineWidth = 1; ctx.stroke();
            if (!printPdf && isPointLinked(si, pi)) {
              ctx.beginPath(); ctx.arc(sp.x, sp.y, rGeo + 3, 0, Math.PI * 2);
              ctx.strokeStyle = CC.accent; ctx.lineWidth = 1; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
            }
            return;
          }
          let r = pdfOrEditorR(GEODESY_CANVAS_VERTEX_DOT_R * (isH || isD ? 1.45 : 1));
          const fc = CC.layer2Edge;
          const hc = CC.layer2;
          if (!printPdf && (isH || isD)) {
            ctx.beginPath(); ctx.arc(sp.x, sp.y, r + 5, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(108,92,231,0.4)"; ctx.fill();
          }
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isH || isD ? hc : fc; ctx.fill();
          ctx.strokeStyle = CC.point; ctx.lineWidth = printPdf ? 0.85 : 2; ctx.stroke();
        });
        if (
          (isSel || showAllArcPoints || layerForRender === 1 || layerForRender === 2 || layerForRender === 3 || layerForRender === 6) &&
          shape.edgeArcs &&
          pts.length >= 2
        ) {
          const linkedArcIdsForShape = new Set<string>();
          for (const g of linkedGroups) for (const p of g) { if (isArcEntry(p) && p.si === si && g.length >= 2) linkedArcIdsForShape.add(p.arcId); }
          if (shape.closed && shape.calculatorInputs?.pathIsOutline && outline.length >= 3) {
            const no = outline.length;
            for (let i = 0; i < no; i++) {
              const j = (i + 1) % no;
              const arcs = shape.edgeArcs[i];
              if (arcs && arcs.length > 0) {
                drawArcHandles(ctx, outline[i], outline[j], arcs, (wx, wy) => worldToScreen(wx, wy), hoveredArcPoint?.arcPoint?.id ?? null, linkedArcIdsForShape, printPdf);
              }
            }
          } else {
            for (let i = 0; i < pts.length - 1; i++) {
              const arcs = shape.edgeArcs[i];
              if (arcs && arcs.length > 0) {
                drawArcHandles(ctx, pts[i], pts[i + 1], arcs, (wx, wy) => worldToScreen(wx, wy), hoveredArcPoint?.arcPoint?.id ?? null, linkedArcIdsForShape, printPdf);
              }
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
          for (let gi = 0; gi < smartGuides.length; gi++) {
            const guide = smartGuides[gi]!;
            const gPt = guide.refWorld ?? pts[guide.ptIdx];
            if (!gPt) continue;
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
            ctx.beginPath();
            ctx.moveTo(sp.x, sp.y - 5); ctx.lineTo(sp.x + 5, sp.y); ctx.lineTo(sp.x, sp.y + 5); ctx.lineTo(sp.x - 5, sp.y);
            ctx.closePath(); ctx.fill();
            const snapPt = worldToScreen(eMouse.x, eMouse.y);
            ctx.beginPath();
            ctx.moveTo(snapPt.x, snapPt.y - 4); ctx.lineTo(snapPt.x + 4, snapPt.y);
            ctx.lineTo(snapPt.x, snapPt.y + 4); ctx.lineTo(snapPt.x - 4, snapPt.y);
            ctx.closePath(); ctx.fill();
            const lp = screenPosForSmartGuideDistanceLabel(guide, eMouse, worldToScreen, gi);
            ctx.font = "11px 'JetBrains Mono',monospace";
            ctx.fillStyle = "#27ae60"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
            ctx.fillText(formatDimensionCmFromPx(distance(gPt, eMouse)), lp.x, lp.y);
          }
          ctx.textBaseline = "alphabetic";
          const liveLen = distance(last, eMouse);
          const lmMid = midpoint(sl, sm);
          ctx.font = "12px 'JetBrains Mono',monospace";
          ctx.fillStyle = CC.text; ctx.textAlign = "center";
          ctx.fillText(formatDimensionCmFromPx(liveLen), lmMid.x, lmMid.y - 12);
          if (shiftHeld) {
            const snapped = snapTo45(last, mouseWorld);
            const dir = { x: snapped.x - last.x, y: snapped.y - last.y };
            const dLen = Math.hypot(dir.x, dir.y);
            if (dLen > 1) {
              const nx = dir.x / dLen, ny = dir.y / dLen, ext = 5000;
              const sA = worldToScreen(last.x - nx * ext, last.y - ny * ext);
              const sB = worldToScreen(last.x + nx * ext, last.y + ny * ext);
              ctx.strokeStyle = CC.snapLine; ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
              ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke();
              ctx.setLineDash([]);
            }
          }
          if (pts.length >= 2) {
            const prev = pts[pts.length - 2];
            const angle = angleDeg(prev, last, eMouse);
            const sc = worldToScreen(last.x, last.y);
            ctx.font = "11px 'JetBrains Mono',monospace";
            ctx.fillStyle = CC.angleText; ctx.textAlign = "center";
            ctx.fillText(angle.toFixed(1) + "°", sc.x, sc.y - 20);
          }
          if (pts.length >= 2) {
            const ss = worldToScreen(pts[0].x, pts[0].y);
            if (distance(sm, ss) < SNAP_TO_START_RADIUS) {
              ctx.beginPath(); ctx.arc(ss.x, ss.y, 14, 0, Math.PI * 2);
              ctx.strokeStyle = CC.accent; ctx.lineWidth = 2; ctx.stroke();
              ctx.font = "10px 'JetBrains Mono',monospace";
              ctx.fillStyle = CC.accent; ctx.fillText("Close", ss.x, ss.y - 20);
            }
          }
        }
        if (isL2 && !inSegmentSideSelection && layerForRender === 3) {
          if (shape.closed && outline.length >= 3) {
            const pathShapeForLabel = { ...shape, points: outline, closed: true } as Shape;
            const hasSlabViz =
              (shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") &&
              shape.calculatorInputs?.vizSlabWidth &&
              shape.calculatorInputs?.vizSlabLength;
            const hasPavingViz = shape.calculatorType === "paving" && shape.calculatorInputs;
            if (hasSlabViz) {
              drawPathSlabLabel(ctx, pathShapeForLabel, worldToScreen, zoom, canvasPrimLabelFill, true);
            } else if (hasPavingViz) {
              drawPathCobbleLabel(ctx, pathShapeForLabel, worldToScreen, zoom, canvasPrimLabelFill, true);
            } else {
              drawShapeObjectLabel(ctx, shape, worldToScreen, getPathLabel(shape), zoom, canvasPrimLabelFill);
            }
          } else {
            drawShapeObjectLabel(ctx, shape, worldToScreen, getPathLabel(shape), zoom, canvasPrimLabelFill);
          }
        }
        // Długości segmentów linii środkowej — główna pętla wymiarów jest po `return` dla path; bez tego brak etykiet na ścieżkach.
        if (
          layerForRender !== 3 &&
          !inSegmentSideSelection &&
          !hideEdgeDimsGeoPdf &&
          !(showGeodesy && geodesyLayerFilter(shape)) &&
          pts.length >= 2 &&
          (shape.closed ? pts.length >= 3 : true)
        ) {
          const pathEdgeCount = shape.closed ? pts.length : pts.length - 1;
          for (let i = 0; i < pathEdgeCount; i++) {
            const j = shape.closed ? (i + 1) % pts.length : i + 1;
            const arcs = shape.edgeArcs?.[i];
            const len = calcEdgeLengthWithArcs(pts[i]!, pts[j]!, arcs);
            const sa = worldToScreen(pts[i]!.x, pts[i]!.y);
            const sb = worldToScreen(pts[j]!.x, pts[j]!.y);
            const mid = midpoint(sa, sb);
            const norm = edgeNormalAngle(sa, sb);
            const edgeAngle = Math.atan2(sb.y - sa.y, sb.x - sa.x);
            const textAngle = readableTextAngle(edgeAngle);
            const hideDimInAdjustment = layerForRender === 6 && shape.layer === 1;
            const showEdgeLabel =
              !hideDimInAdjustment && !(editingDim && editingDim.shapeIdx === si && editingDim.edgeIdx === i);
            if (!showEdgeLabel) continue;
            const lenM = toMeters(len);
            let lx: number, ly: number;
            if (isL2 && shape.closed) {
              const edgeMidWorld = midpoint(pts[i]!, pts[j]!);
              const outRad = edgeOutwardRadForClosedPoly(pts, i);
              const off = toPixels(EDGE_LENGTH_LABEL_PERP_OFFSET_M);
              if (outRad != null) {
                const labelWorld = {
                  x: edgeMidWorld.x - Math.cos(outRad) * off,
                  y: edgeMidWorld.y - Math.sin(outRad) * off,
                };
                const sl = worldToScreen(labelWorld.x, labelWorld.y);
                lx = sl.x;
                ly = sl.y;
              } else {
                const ctr = pts.length >= 3 ? labelAnchorInsidePolygon(pts) : midpoint(pts[0]!, pts[1]!);
                const frac = 0.92;
                const labelWorld = { x: ctr.x + frac * (edgeMidWorld.x - ctr.x), y: ctr.y + frac * (edgeMidWorld.y - ctr.y) };
                const sl = worldToScreen(labelWorld.x, labelWorld.y);
                lx = sl.x;
                ly = sl.y;
              }
            } else {
              lx = mid.x - Math.cos(norm) * edgeLabelOffsetDim;
              ly = mid.y - Math.sin(norm) * edgeLabelOffsetDim;
            }
            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(textAngle);
            ctx.font = edgeDimFont;
            ctx.fillStyle = isL2 ? canvasPrimLabelFill : CC.text;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(formatDimensionCm(lenM), 0, 0);
            ctx.restore();
          }
        }
        return;
      }

      if (isLinearElement(shape)) {
        drawLinearElement(
          ctx,
          shape,
          worldToScreen,
          zoom,
          isSel,
          hoveredEdge?.shapeIdx === si,
          isL2 ? (pi: number) => isPointLinked(si, pi) : undefined,
          layerForRender === 4 ||
            layerForRender === 3 ||
            ((layerForRender === 2 || layerForRender === 5) && !isSel),
          linearDimPalette,
          null,
          showGeodesy && geodesyLayerFilter(shape),
        );
        if (shape.elementType === "fence" && shape.calculatorResults) {
          drawFencePostMarkers(ctx, shape, worldToScreen, zoom);
        }
        if (
          showGeodesy &&
          geodesyLayerFilter(shape) &&
          shape.layer !== 2 &&
          shape.elementType === "wall" &&
          (shape.heights?.some((h: number) => Math.abs(h) > 0.0001))
        ) {
          drawWallSlopeIndicators(ctx, shape, worldToScreen, isLightCanvas);
        }
        const gripDenseL2 =
          isPolygonLinearStripOutline(shape) && shape.linearOpenStripOutline ? computeLinearElementFillOutline(shape) : undefined;
        pts.forEach((_, pi) => {
          const p = getLinearElementVertexGripWorld(shape, pi, gripDenseL2);
          if (isVertexHiddenForGeodesyExportPreview(p.x, p.y, si, shape.points, geodesyHiddenKeysForDraw)) return;
          const sp = worldToScreen(p.x, p.y);
          const isH = hoveredPoint && hoveredPoint.shapeIdx === si && hoveredPoint.pointIdx === pi;
          const isD = dragInfo && dragInfo.shapeIdx === si && dragInfo.pointIdx === pi;
          if (showGeodesy && geodesyLayerFilter(shape)) {
            if (printPdf) return;
            const rGeo = GEODESY_CANVAS_VERTEX_DOT_R * (isH || isD ? 1.45 : 1);
            if (isH || isD) {
              ctx.beginPath(); ctx.arc(sp.x, sp.y, rGeo + 4, 0, Math.PI * 2);
              ctx.fillStyle = "rgba(108,92,231,0.35)"; ctx.fill();
            }
            ctx.beginPath(); ctx.arc(sp.x, sp.y, rGeo, 0, Math.PI * 2);
            ctx.fillStyle = geoVertexDotFill(si, pi);
            ctx.fill();
            ctx.strokeStyle = "rgba(15,23,42,0.78)"; ctx.lineWidth = 1; ctx.stroke();
            return;
          }
          let r = pdfOrEditorR(GEODESY_CANVAS_VERTEX_DOT_R * (isH || isD ? 1.45 : 1));
          let fc = CC.layer2Edge;
          let hc = CC.layer2;
          if (!printPdf && (isH || isD)) {
            ctx.beginPath(); ctx.arc(sp.x, sp.y, r + 5, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(108,92,231,0.4)"; ctx.fill();
          }
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isH || isD ? hc : fc; ctx.fill();
          ctx.strokeStyle = CC.point; ctx.lineWidth = printPdf ? 0.85 : 2; ctx.stroke();
        });
        if ((isSel || showAllArcPoints || layerForRender === 1 || layerForRender === 2 || layerForRender === 3 || layerForRender === 6) && shape.edgeArcs) {
          const linkedArcIdsForShape = new Set<string>();
          for (const g of linkedGroups) for (const p of g) { if (isArcEntry(p) && p.si === si && g.length >= 2) linkedArcIdsForShape.add(p.arcId); }
          const leEdgeCount = pts.length - 1;
          for (let i = 0; i < leEdgeCount; i++) {
            const arcs = shape.edgeArcs[i];
            if (arcs && arcs.length > 0) {
              drawArcHandles(ctx, pts[i], pts[i + 1], arcs, (wx, wy) => worldToScreen(wx, wy), hoveredArcPoint?.arcPoint?.id ?? null, linkedArcIdsForShape, printPdf);
            }
          }
        }
        if (isL2 && shouldDrawL2ShapeObjectName(shape, layerForRender)) {
          drawShapeObjectLabel(ctx, shape, worldToScreen, shape.label || "Element", zoom, canvasPrimLabelFill);
        }
        if (isDraw && pts.length > 0) {
          const guideChain = wallBaselineChainForDrawing(shape, pts);
          const last = guideChain.length > 0 ? guideChain[guideChain.length - 1]! : pts[pts.length - 1];
          const sl = worldToScreen(last.x, last.y);
          const sm = worldToScreen(eMouse.x, eMouse.y);
          ctx.strokeStyle = CC.open; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(sl.x, sl.y); ctx.lineTo(sm.x, sm.y); ctx.stroke();
          ctx.setLineDash([]);
          for (let gi = 0; gi < smartGuides.length; gi++) {
            const guide = smartGuides[gi]!;
            const gPt = guide.refWorld ?? guideChain[guide.ptIdx] ?? pts[guide.ptIdx];
            if (!gPt) continue;
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
            const lp = screenPosForSmartGuideDistanceLabel(guide, eMouse, worldToScreen, gi);
            ctx.font = "11px 'JetBrains Mono',monospace";
            ctx.fillStyle = "#27ae60"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
            ctx.fillText(formatDimensionCmFromPx(distM), lp.x, lp.y);
          }
          ctx.textBaseline = "alphabetic";
          const liveLen = distance(last, eMouse);
          const lm = midpoint(sl, sm);
          ctx.font = "12px 'JetBrains Mono',monospace";
          ctx.fillStyle = CC.text; ctx.textAlign = "center";
          ctx.fillText(formatDimensionCmFromPx(liveLen), lm.x, lm.y - 12);
          const wblDraw = shape.calculatorInputs?.wallBaselinePolyline as Point[] | undefined;
          if (shape.elementType === "wall" && wblDraw && wblDraw.length >= 2 && guideChain.length >= 2) {
            const prev = guideChain[guideChain.length - 2]!;
            const angle = angleDeg(prev, last, eMouse);
            const scAng = worldToScreen(last.x, last.y);
            ctx.font = "11px 'JetBrains Mono',monospace";
            ctx.fillStyle = CC.angleText; ctx.textAlign = "center";
            ctx.fillText(angle.toFixed(1) + "°", scAng.x, scAng.y - 20);
          }
          if (isPolygonLinearElement(shape) && shape.points.length >= 2) {
            const closeAnchor =
              shape.elementType === "wall" && (shape.calculatorInputs?.wallBaselinePolyline as Point[] | undefined)?.[0]
                ? (shape.calculatorInputs!.wallBaselinePolyline as Point[])[0]
                : pts[0];
            const ss = worldToScreen(closeAnchor.x, closeAnchor.y);
            if (distance(sm, ss) < SNAP_TO_START_RADIUS) {
              ctx.beginPath(); ctx.arc(ss.x, ss.y, 14, 0, Math.PI * 2);
              ctx.strokeStyle = CC.accent; ctx.lineWidth = 2; ctx.stroke();
              ctx.font = "10px 'JetBrains Mono',monospace";
              ctx.fillStyle = CC.accent; ctx.fillText("Close", ss.x, ss.y - 20);
            }
          }
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
        if (layerForRender !== 3) {
          if (layerForRender === 4 && isL2 && shapeHasExcavationOrPrepData(shape, "excavation")) {
            fillShapeExcavationPrepHeatmap(ctx, shape, worldToScreen, "excavation", excavationGlobalRange);
          } else if (layerForRender === 5 && isL2 && shapeHasExcavationOrPrepData(shape, "preparation")) {
            fillShapeExcavationPrepHeatmap(ctx, shape, worldToScreen, "preparation", preparationGlobalRange);
          } else if ((layerForRender === 4 || layerForRender === 5) && isL2) {
            ctx.fillStyle = "rgba(138, 143, 168, 0.15)";
            ctx.fill();
          } else if (showGeodesy && geodesyLayerFilter(shape) && layerForRender !== 4 && layerForRender !== 5) {
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
      if (layerForRender !== 3) {
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
        const hideDimInAdjustment = layerForRender === 6 && shape.layer === 1;
        const showEdgeLabel =
          !hideDimInAdjustment &&
          !hideEdgeDimsGeoPdf &&
          !(showGeodesy && geodesyLayerFilter(shape)) &&
          !(editingDim && editingDim.shapeIdx === si && editingDim.edgeIdx === i);
        const isL1StraightGardenDim =
          !isL2 && shape.layer === 1 && shape.closed && !(arcs && arcs.length > 0);
        const lenM = toMeters(len);
        if (showEdgeLabel && isL1StraightGardenDim) {
          const out = edgeOutwardRadForL1Edge(shapes, si, i);
          if (out != null) {
            const lineC = isLockedEdge ? CC.locked : isHov ? (isLightCanvas ? CC.accent : "#ffffff") : extDimLine;
            const textC = isLockedEdge ? CC.locked : isHov ? (isLightCanvas ? CC.accent : "#ffffff") : extDimText;
            const dimLabel = formatDimensionCm(lenM);
            drawExteriorAlignedDimension(ctx, sa, sb, out, boundaryDimL1ExteriorOffsetScreenPx(zoom), dimLabel, lineC, textC, edgeFontPxExterior);
          } else {
            const lx = mid.x - Math.cos(norm) * edgeLabelOffsetDim;
            const ly = mid.y - Math.sin(norm) * edgeLabelOffsetDim;
            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(textAngle);
            ctx.font = edgeDimFont;
            ctx.fillStyle = isLockedEdge ? CC.locked : isHov ? edgeHovColor : CC.text;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(formatDimensionCm(lenM), 0, 0);
            ctx.restore();
          }
        } else if (showEdgeLabel) {
          let lx: number, ly: number;
          if (isL2 && shape.closed) {
            const edgeMidWorld = midpoint(pts[i], pts[j]);
            const outRad = edgeOutwardRadForClosedPoly(pts, i);
            const off = toPixels(EDGE_LENGTH_LABEL_PERP_OFFSET_M);
            if (outRad != null) {
              const labelWorld = {
                x: edgeMidWorld.x - Math.cos(outRad) * off,
                y: edgeMidWorld.y - Math.sin(outRad) * off,
              };
              const sl = worldToScreen(labelWorld.x, labelWorld.y);
              lx = sl.x;
              ly = sl.y;
            } else {
              const effPts = hasArcsForStroke ? getEffectivePolygon(shape) : pts;
              const ctr = effPts.length >= 3 ? labelAnchorInsidePolygon(effPts) : midpoint(pts[0], pts[1] ?? pts[0]);
              const frac = 0.92;
              const labelWorld = { x: ctr.x + frac * (edgeMidWorld.x - ctr.x), y: ctr.y + frac * (edgeMidWorld.y - ctr.y) };
              const sl = worldToScreen(labelWorld.x, labelWorld.y);
              lx = sl.x;
              ly = sl.y;
            }
          } else {
            lx = mid.x - Math.cos(norm) * edgeLabelOffsetDim;
            ly = mid.y - Math.sin(norm) * edgeLabelOffsetDim;
          }
          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(textAngle);
          ctx.font = edgeDimFont;
          ctx.fillStyle = isL2 ? canvasPrimLabelFill : (isLockedEdge ? CC.locked : isHov ? edgeHovColor : CC.text);
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(formatDimensionCm(lenM), 0, 0);
          ctx.restore();
        }

        // Slope label in geodesy mode — arrow along edge, pointing downhill (high → low)
        // Slopes outside element, lengths inside (opposite sides to avoid overlap)
        // Layer 2: no slope overlays (same plan as L1 geodesy without % spadków)
        if (
          !hideDimInAdjustment &&
          showGeodesy &&
          geodesyLayerFilter(shape) &&
          shape.closed &&
          shape.layer !== 2 &&
          !(printPdf && pdfGeodesyExportLayer != null)
        ) {
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
            const stx = mid.x + Math.cos(norm) * slopeLabelOffsetDim;
            const sty = mid.y + Math.sin(norm) * slopeLabelOffsetDim;
            ctx.save();
            ctx.translate(stx, sty);
            ctx.rotate(textAngle);
            ctx.font = geoDimCompact ? "bold 11px 'JetBrains Mono',monospace" : "bold 20px 'JetBrains Mono',monospace";
            ctx.fillStyle = slopeColor(sl.severity);
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(formatSlope(sl), 0, 0);
            ctx.restore();
          } else if (sl) {
            const stx = mid.x + Math.cos(norm) * slopeLabelOffsetDim;
            const sty = mid.y + Math.sin(norm) * slopeLabelOffsetDim;
            ctx.save();
            ctx.translate(stx, sty);
            ctx.rotate(textAngle);
            ctx.font = geoDimCompact ? "bold 11px 'JetBrains Mono',monospace" : "bold 20px 'JetBrains Mono',monospace";
            ctx.fillStyle = slopeColor(sl.severity);
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(formatSlope(sl), 0, 0);
            ctx.restore();
          }
        }
      }
      }

      // Arc point handles (when selected, showAllArcPoints, or in L1/L2/L5 — same visibility as square points)
      if ((isSel || showAllArcPoints || layerForRender === 1 || layerForRender === 2 || layerForRender === 3 || layerForRender === 6) && shape.edgeArcs && !showGeodesy) {
        const linkedArcIdsForShape = new Set<string>();
        for (const g of linkedGroups) for (const p of g) { if (isArcEntry(p) && p.si === si && g.length >= 2) linkedArcIdsForShape.add(p.arcId); }
        for (let i = 0; i < edgeCount; i++) {
          const arcs = shape.edgeArcs[i];
          if (arcs && arcs.length > 0) {
            const j = (i + 1) % pts.length;
            drawArcHandles(ctx, pts[i], pts[j], arcs, (wx, wy) => worldToScreen(wx, wy), hoveredArcPoint?.arcPoint?.id ?? null, linkedArcIdsForShape, printPdf);
          }
        }
      }

      // Angles (interior) — wyłączone w geodezji, Wykop/Przygotowanie oraz na widoku warstwy 3 (kompozycja); na warstwie 2 widoczne przy zaznaczeniu
      if (shape.closed && pts.length >= 3 && isSel && !showGeodesy && !isCircleArcHandlesOnlyShape(shape) && layerForRender !== 3 && layerForRender !== 4 && layerForRender !== 5) {
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

      // Points (circle arc-only: no vertex squares — only arc handles)
      const gripDense =
        isLinearElement(shape) && isPolygonLinearStripOutline(shape) && shape.linearOpenStripOutline
          ? computeLinearElementFillOutline(shape)
          : undefined;
      if (!isCircleArcHandlesOnlyShape(shape)) pts.forEach((_, pi) => {
        const p = getLinearElementVertexGripWorld(shape, pi, gripDense);
        if (isVertexHiddenForGeodesyExportPreview(p.x, p.y, si, shape.points, geodesyHiddenKeysForDraw)) return;
        const sp = worldToScreen(p.x, p.y);
        const isH = hoveredPoint && hoveredPoint.shapeIdx === si && hoveredPoint.pointIdx === pi;
        const isD = dragInfo && dragInfo.shapeIdx === si && dragInfo.pointIdx === pi;
        if (showGeodesy && geodesyLayerFilter(shape)) {
          if (printPdf) {
            const rGeo = pdfOrEditorR(GEODESY_CANVAS_VERTEX_DOT_R);
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, rGeo, 0, Math.PI * 2);
            ctx.fillStyle = geoVertexDotFill(si, pi);
            ctx.fill();
            ctx.strokeStyle = isLightCanvas ? "rgba(15,23,42,0.55)" : "rgba(15,23,42,0.78)";
            ctx.lineWidth = hideEdgeDimsGeoPdf ? Math.max(0.35, 0.4 * mmPerPxGeo) : 1;
            ctx.stroke();
            return;
          }
          const rGeo = GEODESY_CANVAS_VERTEX_DOT_R * (isH || isD ? 1.45 : 1);
          if (!printPdf && (isH || isD)) {
            ctx.beginPath(); ctx.arc(sp.x, sp.y, rGeo + 4, 0, Math.PI * 2);
            ctx.fillStyle = isOpen ? CC.openGlow : isL2 ? "rgba(108,92,231,0.35)" : "rgba(147,197,253,0.35)"; ctx.fill();
          }
          ctx.beginPath(); ctx.arc(sp.x, sp.y, rGeo, 0, Math.PI * 2);
          ctx.fillStyle = geoVertexDotFill(si, pi);
          ctx.fill();
          ctx.strokeStyle = "rgba(15,23,42,0.78)"; ctx.lineWidth = 1; ctx.stroke();
          if (!printPdf && isPointLinked(si, pi)) {
            ctx.beginPath(); ctx.arc(sp.x, sp.y, rGeo + 3, 0, Math.PI * 2);
            ctx.strokeStyle = CC.accent; ctx.lineWidth = 1; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
          }
          return;
        }
        let r = (isH || isD ? POINT_RADIUS + 2 : POINT_RADIUS) * (isSel || isDraw ? 1 : 0.8);
        let fc = isOpen ? CC.open : isL2 ? CC.layer2Edge : CC.pointFill;
        let hc = isOpen ? CC.openHover : isL2 ? CC.layer2 : CC.pointHover;
        r = pdfOrEditorR(r);

        if (!printPdf && (isH || isD)) {
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r + 5, 0, Math.PI * 2);
          ctx.fillStyle = isOpen ? CC.openGlow : isL2 ? "rgba(108,92,231,0.4)" : CC.accentGlow; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isH || isD ? hc : fc; ctx.fill();
        ctx.strokeStyle = CC.point; ctx.lineWidth = printPdf ? 0.85 : 2; ctx.stroke();

        // Linked point indicator
        if (!printPdf && isPointLinked(si, pi)) {
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = CC.accent; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
        }
      });

      // Rotation handle
      if (!printPdf && isSel && shape.closed && pts.length >= 3 && !isDraw) {
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
        // Centroid m²: hide for Layer 1 (garden) in both L1/L2 views; Layer 2 uses pattern label or none.
        if (!hasPatternLabel && !isL2 && shape.layer !== 1) {
          const effPts = getCachedPoly(si);
          const area = areaM2(effPts);
          ctx.font = "bold 16px 'JetBrains Mono',monospace";
          ctx.fillStyle = canvasPrimLabelFill; ctx.textAlign = "center"; ctx.textBaseline = "middle";
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
            ctx.fillStyle = canvasPrimLabelFill;
            ctx.fillText(parts.join(" · "), sc.x, sc.y + 22);
          }
        }

        // Gradient arrow in geodesy mode — text placed opposite to arrow so it never overlaps
        if (
          showGeodesy &&
          geodesyLayerFilter(shape) &&
          shape.layer !== 2 &&
          !(printPdf && pdfGeodesyExportLayer != null)
        ) {
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
            ctx.font = geoDimCompact ? "bold 11px 'JetBrains Mono',monospace" : "bold 20px 'JetBrains Mono',monospace";
            ctx.fillStyle = isLightCanvas ? CC.text : slopeColor(grad.severity);
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(grad.magnitude.toFixed(1) + " cm/m", tx, ty);
          }
        }
      }

      if (isL2 && shouldDrawL2ShapeObjectName(shape, layerForRender)) {
        drawShapeObjectLabel(ctx, shape, worldToScreen, shape.label || "Element", zoom, canvasPrimLabelFill);
      }

      // Open shape label
      if (isOpen && pts.length >= 3) {
        const ctr = centroid(pts);
        const sc = worldToScreen(ctr.x, ctr.y);
        ctx.font = "12px 'JetBrains Mono',monospace";
        ctx.fillStyle = CC.open; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(t("project:canvas_unclosed_no_area"), sc.x, sc.y);
      }

      // Height labels (geodesy mode) — drawn via SmartGeodesyLabels below (avoids overlap at junctions)
      // Vertex height labels skipped here when showGeodesy

      // Punkty wysokościowe (Layer 1) — widoczne tylko w layer 1
      if (shape.layer === 1 && layerForRender === 1 && (shape.heightPoints?.length ?? 0) > 0) {
        const hpList = shape.heightPoints!;
        const isGeodesy = showGeodesy;
        if (isGeodesy && geodesyLayerFilter(shape)) {
          hpList.forEach((hp, hpi) => {
            if (geodesyHiddenKeysForDraw?.has(`h|${si}|${hpi}`)) return;
            const sp = worldToScreen(hp.x, hp.y);
            const isH = !printPdf && hoveredHeightPoint?.shapeIdx === si && hoveredHeightPoint?.heightPointIdx === hpi;
            const isEdit =
              !printPdf &&
              editingGeodesyCard?.cardInfo?.group?.some(
                p => !p.isVertex && p.shapeIdx === si && p.heightPointIdx === hpi,
              );
            const r = printPdf
              ? pdfOrEditorR(GEODESY_CANVAS_HEIGHT_DOT_R)
              : GEODESY_CANVAS_HEIGHT_DOT_R * (isH || isEdit ? 1.4 : 1);
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
            ctx.fillStyle = geoHeightDotFill(si, hpi);
            ctx.fill();
            ctx.strokeStyle = isH || isEdit
              ? "#93c5fd"
              : printPdf
                ? isLightCanvas
                  ? "rgba(15,23,42,0.55)"
                  : "rgba(15,23,42,0.78)"
                : "rgba(15,23,42,0.78)";
            ctx.lineWidth = printPdf
              ? Math.max(0.35, 0.4 * mmPerPxGeo)
              : isH || isEdit
                ? 1.5
                : 1;
            ctx.stroke();
          });
        } else {
        hpList.forEach((hp, hpi) => {
          if (geodesyHiddenKeysForDraw?.has(`h|${si}|${hpi}`)) return;
          const sp = worldToScreen(hp.x, hp.y);
          const isH = hoveredHeightPoint?.shapeIdx === si && hoveredHeightPoint?.heightPointIdx === hpi;
          const isEdit = editingGeodesyCard?.cardInfo?.group?.some(p => !p.isVertex && p.shapeIdx === si && p.heightPointIdx === hpi);
          const r = printPdf ? PDF_VERTEX_DOT_R : GEODESY_CANVAS_HEIGHT_DOT_R * (isH || isEdit ? 1.4 : 1);
          ctx.beginPath();
          if (printPdf) {
            ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
          } else {
            ctx.rect(sp.x - r, sp.y - r, r * 2, r * 2);
          }
          ctx.fillStyle = isGeodesy ? canvasPrimLabelFill : isH || isEdit ? CC.geo : CC.textDim;
          ctx.fill();
          ctx.strokeStyle = isGeodesy ? (isH || isEdit ? "#93c5fd" : "rgba(15,23,42,0.78)") : isH || isEdit ? "#fff" : CC.point;
          ctx.lineWidth = printPdf ? 0.85 : isH || isEdit ? 2 : 1;
          ctx.stroke();
          // Height label drawn via SmartGeodesyLabels (avoids overlap at junctions)
        });
        }
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
        for (let gi = 0; gi < smartGuides.length; gi++) {
          const guide = smartGuides[gi]!;
          const gPt = guide.refWorld ?? pts[guide.ptIdx];
          if (!gPt) continue;
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
          const lp = screenPosForSmartGuideDistanceLabel(guide, eMouse, worldToScreen, gi);
          ctx.font = "11px 'JetBrains Mono',monospace";
          ctx.fillStyle = "#27ae60"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.fillText(formatDimensionCmFromPx(distM), lp.x, lp.y);
        }
        ctx.textBaseline = "alphabetic";

        if (shiftHeld) {
          const snapped = snapTo45(last, mouseWorld);
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
        ctx.fillText(formatDimensionCmFromPx(liveLen), lm.x, lm.y - 12);

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
          ctx.fillText(formatDimensionCmFromPx(distM), lm.x, lm.y - 6);
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

    // Project design slope points (purple diamonds, L1 outline anchors) — visible on L2 / L3 / adjustment
    if (
      designSlopePoints.length > 0 &&
      (layerForRender === 2 || layerForRender === 3 || layerForRender === 6)
    ) {
      const r = printPdf ? PDF_VERTEX_DOT_R * 1.05 : GEODESY_CANVAS_VERTEX_DOT_R;
      ctx.textBaseline = "top";
      ctx.textAlign = "center";
      for (const dsp of designSlopePoints) {
        const w = resolveDesignSlopeWorldPosition(dsp, shapes);
        const sp = worldToScreen(w.x, w.y);
        if (printPdf) {
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
          ctx.fillStyle = "#9b59b6";
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.45)";
          ctx.lineWidth = 0.8;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(sp.x, sp.y - r);
          ctx.lineTo(sp.x + r, sp.y);
          ctx.lineTo(sp.x, sp.y + r);
          ctx.lineTo(sp.x - r, sp.y);
          ctx.closePath();
          ctx.fillStyle = "#9b59b6";
          ctx.fill();
          ctx.strokeStyle = isLightCanvas ? "rgba(30,41,59,0.88)" : "rgba(255,255,255,0.92)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        const hCm = dsp.height * 100;
        const label = `${hCm >= 0 ? "+" : ""}${hCm.toFixed(1)} cm`;
        ctx.font = "11px 'JetBrains Mono',monospace";
        ctx.fillStyle = canvasPrimLabelFill;
        ctx.fillText(label, sp.x, sp.y + (printPdf ? PDF_VERTEX_DOT_R * 1.05 : r) + 4);
      }
    }

    // Geodesy labels (smart layout: zoom-aware clustering, leaders) — overlap-safe; update() runs przed kropkami
    if (showGeodesy) {
      smartGeodesyLabelsRef.current.render(
        ctx,
        worldToScreen,
        hoveredPoint,
        hoveredHeightPoint,
        editingGeodesyCard?.cardInfo.group ?? null,
      );
    }

    // Wykop / Przygotowanie — cm labels (singletons: short text; clusters: named cards + leaders, jak geodezja)
    if (layerForRender === 4 || layerForRender === 5) {
      const mode = layerForRender === 4 ? "excavation" : "preparation";
      drawExcavationPrepCmLabels(
        ctx,
        shapes,
        worldToScreen,
        mode,
        sh => sh.layer === 2 && passesViewFilterWithGroundworkOnExcavationLayers(sh, viewFilter, layerForRender),
        hoveredPoint,
        (si, pi) =>
          cmEditDialog != null &&
          cmEditDialog.shapeIdx === si &&
          cmEditDialog.pointIdx === pi &&
          cmEditDialog.mode === mode,
        isLightCanvas,
      );
      drawGroundworkBurialLabels(
        ctx,
        shapes,
        worldToScreen,
        sh => sh.layer === 2 && passesViewFilterWithGroundworkOnExcavationLayers(sh, viewFilter, layerForRender),
        hoveredPoint,
        (si, pi) =>
          cmEditDialog != null &&
          cmEditDialog.shapeIdx === si &&
          cmEditDialog.pointIdx === pi &&
          cmEditDialog.mode === "groundworkBurial",
        isLightCanvas,
      );
    }

    // ── Layer 6: Adjustment — empty areas (red), overflow (red), overlaps (orange) ──
    if (layerForRender === 6) {
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
    if (!printPdf) {
      selectedPoints.forEach(({ shapeIdx: si, pointIdx: pi }) => {
        const shSel = shapes[si];
        if (shSel && shSel.points[pi]) {
          const denseSel =
            isLinearElement(shSel) && isPolygonLinearStripOutline(shSel) && shSel.linearOpenStripOutline
              ? computeLinearElementFillOutline(shSel)
              : undefined;
          const p = getLinearElementVertexGripWorld(shSel, pi, denseSel);
          const sp = worldToScreen(p.x, p.y);
          ctx.beginPath(); ctx.arc(sp.x, sp.y, POINT_RADIUS + 4, 0, Math.PI * 2);
          ctx.strokeStyle = CC.danger; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.beginPath(); ctx.arc(sp.x, sp.y, POINT_RADIUS + 8, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,71,87,0.15)"; ctx.fill();
        }
      });
    }

    // Offset-along-line: anchors — orange halos; moving vertex — same size, full green glow
    if (pointOffsetAlongLinePick && !printPdf) {
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
        if (!isOnActiveLayer(si) || !passesViewFilter(shapes[si], viewFilter, layerForRender)) continue;
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
    let hud = `${toMeters(mouseWorld.x).toFixed(2)}, ${toMeters(mouseWorld.y).toFixed(2)} m  |  zoom: ${(zoom * 100).toFixed(0)}%  |  Layer ${layerForRender}`;
    if (shiftHeld) hud += "  |  SNAP 45°";
    if (drawingShapeIdx !== null && mode === "freeDraw") hud += "  |  Drawing (Esc = cancel)";
    if (mode === "drawFence") hud += "  |  FENCE: click to place points, Esc to finish";
    else if (mode === "drawWall") hud += "  |  WALL: outer face; snap sets side (L1→in, L2→away); Tab = flip; Esc / RMB = finish";
    else if (mode === "drawKerb") hud += "  |  KERB: click to place points, Esc to finish";
    else if (mode === "drawFoundation") hud += "  |  FOUNDATION: click to place points, Esc to finish";
    else if (mode === "drawPathSlabs") hud += pathSegmentSideSelection ? "  |  PATH: click green or orange side for each segment" : "  |  PATH (Slabs): click points (like wall), snap to start to finish, then pick sides";
    else if (mode === "drawPathConcreteSlabs") hud += pathSegmentSideSelection ? "  |  PATH: click green or orange side for each segment" : "  |  PATH (Concrete Slabs): click points (like wall), snap to start to finish, then pick sides";
    else if (mode === "drawPathMonoblock") hud += pathSegmentSideSelection ? "  |  PATH: click green or orange side for each segment" : "  |  PATH (Monoblock): click points (like wall), snap to start to finish, then pick sides";
    if (mode === "scale") hud += "  |  SCALE: corner = proportional, edge = move";
    if (mode === "move") hud += "  |  MOVE: left click anywhere to pan";
    const canStartMeasure = selectedShapeIdx === null && selectedPoints.length === 0 && !selectionRect && !editingDim && !rotateInfo && !patternDragInfo && !patternRotateInfo && !shapeDragInfo && !edgeDragInfo;
    const measureAllowed = layerForRender === 1 || layerForRender === 2 || layerForRender === 3 || layerForRender === 6;
    if (measureStart !== null) hud += "  |  MEASURE: click point 2; click again to clear";
    else if (shiftHeld && canStartMeasure && measureAllowed) hud += "  |  SHIFT + click to start measure";
    if (geodesyEnabled) hud += "  |  GEODESY: click point → set height, click area → show height";
    if (!printPdf) ctx.fillText(hud, 10, H - 10);

    // Height tooltip (geodesy mode): click on L1 shape interior — only show in layer 1
    if (geodesyEnabled && layerForRender === 1 && clickedHeightTooltip) {
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
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(text, sp.x, sp.y - 14);
    }

    // Measure (Shift-based): line + distance label
    if (measureStart && !printPdf) {
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
    if (hoveredEdge && !printPdf) {
      const s = shapes[hoveredEdge.shapeIdx];
      const pts = s?.points;
      if (pts && pts.length >= 2) {
        const i = hoveredEdge.edgeIdx;
        const j = (i + 1) % pts.length;
        const A = pts[i];
        const B = pts[j];
        // Stale hover if vertex count changed but mousemove hasn't updated hit yet
        if (i >= 0 && i < pts.length && A != null && B != null) {
        const arcs = s.edgeArcs?.[i];
        const totalLen = calcEdgeLengthWithArcs(A, B, arcs);
        const distToA = hoveredEdge.t * totalLen;
        const distToB = (1 - hoveredEdge.t) * totalLen;
        const sA = worldToScreen(A.x, A.y);
        const sProj = worldToScreen(hoveredEdge.pos.x, hoveredEdge.pos.y);
        const sB = worldToScreen(B.x, B.y);
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
        ctx.fillStyle = extDimText;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.translate(lx1, ly1);
        ctx.rotate(textAngle);
        ctx.fillText(formatDimensionCmFromPx(distToA), 0, 0);
        ctx.restore();
        ctx.save();
        ctx.translate(lx2, ly2);
        ctx.rotate(textAngle);
        ctx.fillText(formatDimensionCmFromPx(distToB), 0, 0);
        ctx.restore();
        }
        // Layer 1 garden as reference in Layer 2: show small gray vertices while hovering an edge (snap targets)
        if (layerForRender === 2 && s.layer === 1 && pts.length >= 2) {
          const dotR = Math.max(2.2, (POINT_RADIUS * 0.45) * (zoom > 0.5 ? 1 : 0.85));
          for (let vi = 0; vi < pts.length; vi++) {
            const sv = worldToScreen(pts[vi].x, pts[vi].y);
            ctx.beginPath();
            ctx.arc(sv.x, sv.y, dotR, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(140, 145, 160, 0.92)";
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.55)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
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
  }, [shapes, designSlopePoints, selectedShapeIdx, selectedShapeIndices, shapeSelectionSet, selectedPattern, objectCardShapeIdx, patternDragInfo, patternDragPreview, pathPatternLongOffsetPreview, patternAlignedEdges, patternRotateInfo, patternRotatePreview, mode, drawingShapeIdx, mouseWorld, pan, zoom, canvasSize, geodesyPreviewCanvasLock, hoveredPoint, hoveredEdge, hoveredHeightPoint, dragInfo, editingDim, editingGeodesyCard, cmEditDialog, worldToScreen, shiftHeld, selectedPoints, selectionRect, rotateInfo, activeLayer, geodesyPrintPreviewTargetLayer, draggingGrassPiece, grassAlignedPolyEdges, clickedHeightTooltip, geodesyEnabled, showAllArcPoints, linkedGroups, viewFilter, adjustmentData, t, setAngleModal, currentTheme?.id, measureStart, measureEnd, pathSegmentSideSelection, shapeDragInfo, edgeDragInfo, pointOffsetAlongLinePick, offsetAlongLinePickPulse, isOnActiveLayer, pdfGeodesyExportLayer, showGeodesyPrintPreview, hiddenGeodesyEntries, isExportingPdf]);

  /** Geodesy PDF preview: fit camera so all L1+L2 geometry (same union as PDF pages 101+102) stays inside the canvas. */
  useLayoutEffect(() => {
    if (!showGeodesyPrintPreview) return;
    const w = geodesyPreviewCanvasLock?.w ?? canvasSize.w;
    const h = geodesyPreviewCanvasLock?.h ?? canvasSize.h;
    const fit = computeGeodesyPdfFitCamera(shapes, designSlopePoints, viewFilter, w, h);
    if (!fit) return;
    const epsP = 0.5;
    const epsZ = 1e-5;
    setPan(prev =>
      Math.abs(prev.x - fit.pan.x) < epsP && Math.abs(prev.y - fit.pan.y) < epsP ? prev : fit.pan,
    );
    setZoom(prev => (Math.abs(prev - fit.zoom) < epsZ ? prev : fit.zoom));
  }, [showGeodesyPrintPreview, shapes, designSlopePoints, viewFilter, geodesyPreviewCanvasLock, canvasSize.w, canvasSize.h]);

  /** Snapshot for geodesy print-preview modal — runs after canvas draw effect so toDataURL matches the latest layerForRender paint. */
  useEffect(() => {
    if (!showGeodesyPrintPreview) {
      setGeodesyPreviewDataUrl("");
      return;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const c = canvasRef.current;
        if (c) setGeodesyPreviewDataUrl(c.toDataURL("image/png"));
      });
    });
    return () => cancelAnimationFrame(id);
  }, [
    showGeodesyPrintPreview,
    hiddenGeodesyEntries,
    shapes,
    activeLayer,
    pdfGeodesyExportLayer,
    geodesyPrintPreviewTargetLayer,
    geodesyEnabled,
    pan,
    zoom,
    canvasSize,
    isExportingPdf,
  ]);

  // Clear height tooltip when disabling geodesy or switching away from layer 1
  useEffect(() => {
    if (!geodesyEnabled || activeLayer !== 1) setClickedHeightTooltip(null);
  }, [geodesyEnabled, activeLayer]);

  // Wykop / Przygotowanie: geodezja nie ma tu zastosowania; pozostawiona włączona z L2 przejmuje kliknięcia (cm wykopu nie działa).
  useEffect(() => {
    if (activeLayer === 4 || activeLayer === 5) {
      setGeodesyEnabled(false);
      setEditingGeodesyCard(null);
      setClickedHeightTooltip(null);
      setClusterTooltip(null);
    }
  }, [activeLayer]);

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
    if (
      selectedShapeIdx !== null &&
      isOnActiveLayer(selectedShapeIdx) &&
      passesViewFilterWithGroundworkOnExcavationLayers(shapes[selectedShapeIdx], viewFilter, activeLayer)
    ) {
      const s = shapes[selectedShapeIdx];
      if (!isCircleArcHandlesOnlyShape(s)) {
        const denseCache =
          isLinearElement(s) && isPolygonLinearStripOutline(s) && s.linearOpenStripOutline
            ? computeLinearElementFillOutline(s)
            : undefined;
        for (let pi = s.points.length - 1; pi >= 0; pi--)
          if (distance(wp, getLinearElementVertexGripWorld(s, pi, denseCache)) < r) return { shapeIdx: selectedShapeIdx, pointIdx: pi };
      }
    }
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (!isOnActiveLayer(si) || !passesViewFilterWithGroundworkOnExcavationLayers(shapes[si], viewFilter, activeLayer)) continue;
      const s = shapes[si];
      if (isCircleArcHandlesOnlyShape(s)) continue;
      const denseCache =
        isLinearElement(s) && isPolygonLinearStripOutline(s) && s.linearOpenStripOutline
          ? computeLinearElementFillOutline(s)
          : undefined;
      for (let pi = s.points.length - 1; pi >= 0; pi--)
        if (distance(wp, getLinearElementVertexGripWorld(s, pi, denseCache)) < r) return { shapeIdx: si, pointIdx: pi };
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

  const hitTestDesignSlopePoint = useCallback(
    (wp: Point): DesignSlopePoint | null => {
      if (activeLayer !== 2 && activeLayer !== 3) return null;
      if (designSlopePoints.length === 0) return null;
      const th = (pointRadiusEffective * 1.15) / zoom + 4;
      const r = th * (PIXELS_PER_METER / 80);
      for (let i = designSlopePoints.length - 1; i >= 0; i--) {
        const d = designSlopePoints[i]!;
        const w = resolveDesignSlopeWorldPosition(d, shapes);
        if (distance(wp, w) < r) return d;
      }
      return null;
    },
    [shapes, zoom, pointRadiusEffective, activeLayer, designSlopePoints],
  );

  /** Wierzchołek obrysu L1 (referencja przy edycji L2/L3), gdy nie ma tu punktu aktywnej warstwy. */
  const hitTestLayer1BoundaryVertex = useCallback(
    (wp: Point): HitResult | null => {
      if (activeLayer !== 2 && activeLayer !== 3) return null;
      const th = pointRadiusEffective / zoom + 4;
      const r = th * (PIXELS_PER_METER / 80);
      for (let si = shapes.length - 1; si >= 0; si--) {
        const sh = shapes[si];
        if (sh.removedFromCanvas || sh.layer !== 1 || !sh.closed || sh.points.length < 3) continue;
        if (!passesViewFilter(sh, viewFilter, activeLayer)) continue;
        for (let pi = sh.points.length - 1; pi >= 0; pi--) {
          if (distance(wp, sh.points[pi]!) < r) return { shapeIdx: si, pointIdx: pi };
        }
      }
      return null;
    },
    [shapes, zoom, pointRadiusEffective, activeLayer, viewFilter],
  );

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
    /** Layer 1 garden as snap reference while editing Layer 2: include edge interiors and near-vertex (corner) hits. */
    const testEdgeLayer1Ref = (si: number, i: number) => {
      const pts = shapes[si].points;
      const j = (i + 1) % pts.length;
      const arcs = shapes[si].edgeArcs?.[i];
      const pr = arcs && arcs.length > 0
        ? projectOntoArcEdge(wp, pts[i], pts[j], arcs, 24)
        : projectOntoSegment(wp, pts[i], pts[j]);
      if (pr.dist >= r) return null;
      const nearA = distance(wp, pts[i]) < r;
      const nearB = distance(wp, pts[j]) < r;
      const interior = pr.t > 0.02 && pr.t < 0.98;
      if (!interior && !nearA && !nearB) return null;
      return { shapeIdx: si, edgeIdx: i, pos: pr.proj, t: pr.t };
    };
    if (
      selectedShapeIdx !== null &&
      isOnActiveLayer(selectedShapeIdx) &&
      passesViewFilterWithGroundworkOnExcavationLayers(shapes[selectedShapeIdx], viewFilter, activeLayer)
    ) {
      const ec = shapes[selectedShapeIdx].closed ? shapes[selectedShapeIdx].points.length : shapes[selectedShapeIdx].points.length - 1;
      for (let i = 0; i < ec; i++) {
        const result = testEdge(selectedShapeIdx, i);
        if (result) return result;
      }
    }
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (!isOnActiveLayer(si) || !passesViewFilterWithGroundworkOnExcavationLayers(shapes[si], viewFilter, activeLayer)) continue;
      const ec = shapes[si].closed ? shapes[si].points.length : shapes[si].points.length - 1;
      for (let i = 0; i < ec; i++) {
        const result = testEdge(si, i);
        if (result) return result;
      }
    }
    if (activeLayer === 2 || activeLayer === 3) {
      for (let si = shapes.length - 1; si >= 0; si--) {
        const sh = shapes[si];
        if (sh.removedFromCanvas || sh.layer !== 1 || !passesViewFilter(sh, viewFilter, activeLayer)) continue;
        const pts = sh.points;
        if (pts.length < 2) continue;
        const ec = sh.closed ? pts.length : pts.length - 1;
        for (let i = 0; i < ec; i++) {
          const result = testEdgeLayer1Ref(si, i);
          if (result) return result;
        }
      }
    }
    return null;
  }, [shapes, zoom, isOnActiveLayer, selectedShapeIdx, viewFilter, edgeHitThresholdEffective, activeLayer]);

  const hitTestPointForScale = useCallback((wp: Point): HitResult | null => {
    const th = pointRadiusEffective / zoom + 4;
    const r = th * (PIXELS_PER_METER / 80);
    if (selectedShapeIdx !== null && isOnActiveLayerForScale(selectedShapeIdx) && passesViewFilter(shapes[selectedShapeIdx], viewFilter, activeLayer)) {
      const s = shapes[selectedShapeIdx];
      if (s.closed && !isLinearElement(s) && !isCircleArcHandlesOnlyShape(s)) {
        for (let pi = s.points.length - 1; pi >= 0; pi--)
          if (distance(wp, s.points[pi]) < r) return { shapeIdx: selectedShapeIdx, pointIdx: pi };
      }
    }
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (!isOnActiveLayerForScale(si) || !passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
      const s = shapes[si];
      if (!s.closed || isLinearElement(s) || isCircleArcHandlesOnlyShape(s)) continue;
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
    const priorityList =
      selectedShapeIndices.length > 0
        ? [...selectedShapeIndices].sort((a, b) => b - a)
        : selectedShapeIdx !== null
          ? [selectedShapeIdx]
          : [];
    for (const priSi of priorityList) {
      // Tylko kształty już zaznaczone — pozwól trafić w ciało mimo „nieaktywnej” warstwy paska (np. L1 przy widoku L3),
      // żeby grupowe przesuwanie działało po przełączeniu warstwy.
      if (!passesViewFilter(shapes[priSi], viewFilter, activeLayer)) continue;
      const s = shapes[priSi];
      if (s?.removedFromCanvas) continue;
      if (isPathElement(s) && hitTestPathElement(wp, s, zoom)) return priSi;
      if (!isLinearElement(s)) {
        const pts = s.points;
        if (s.closed && pts.length >= 3) {
          let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            if ((pts[i].y > wp.y) !== (pts[j].y > wp.y) && wp.x < ((pts[j].x - pts[i].x) * (wp.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x)
              inside = !inside;
          }
          if (inside) return priSi;
        }
      } else if (hitTestLinearElement(wp, s, zoom)) return priSi;
    }
    // Prefer linear elements and paths over polygons when both could match
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (shapes[si]?.removedFromCanvas) continue;
      if (!isOnActiveLayer(si) || !passesViewFilter(shapes[si], viewFilter, activeLayer)) continue;
      if (isPathElement(shapes[si]) && hitTestPathElement(wp, shapes[si], zoom)) return si;
      if (isLinearElement(shapes[si]) && hitTestLinearElement(wp, shapes[si], zoom)) return si;
    }
    for (let si = shapes.length - 1; si >= 0; si--) {
      if (shapes[si]?.removedFromCanvas) continue;
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
  }, [shapes, zoom, isOnActiveLayer, selectedShapeIdx, selectedShapeIndices, viewFilter, activeLayer]);

  const hitTestPattern = useCallback((wp: Point): { shapeIdx: number; type: "slab" | "grass" | "cobblestone"; grassJoinHit?: { pieceAIdx: number; pieceBIdx: number; edgeAIdx: number; isJoined: boolean }; grassPieceIdx?: number } | null => {
    for (let si = shapes.length - 1; si >= 0; si--) {
      const shape = shapes[si];
      if (shape.removedFromCanvas) continue;
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
      // Wall/kerb/foundation: no auto "open end" hit — use point selection + context menu to continue drawing.
      if (isPolygonLinearElement(s)) continue;
      if (distance(wp, s.points[s.points.length - 1]) < th) return { shapeIdx: si, end: "last" };
      if (distance(wp, s.points[0]) < th) return { shapeIdx: si, end: "first" };
    }
    return null;
  }, [shapes, zoom, isOnActiveLayer, viewFilter]);

  const arcHitThreshold = (pointRadiusEffective / zoom + 4) * (PIXELS_PER_METER / 80);
  const hitTestArcPointGlobal = useCallback((wp: Point): { shapeIdx: number; edgeIdx: number; arcPoint: ArcPoint } | null => {
    const testShape = (si: number) => {
      const s = shapes[si];
      if (s?.removedFromCanvas) return null;
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
    const arcPri =
      selectedShapeIndices.length > 0
        ? [...selectedShapeIndices].sort((a, b) => b - a)
        : selectedShapeIdx !== null
          ? [selectedShapeIdx]
          : [];
    const arcPriSet = new Set(arcPri);
    for (const si of arcPri) {
      const hit = testShape(si);
      if (hit) return hit;
    }
    // In L1/L2/L5 arcpoints are visible on all shapes — allow hit test on non-selected shapes too
    if (showAllArcPoints || activeLayer === 1 || activeLayer === 2 || activeLayer === 3 || activeLayer === 6) {
      for (let si = shapes.length - 1; si >= 0; si--) {
        if (arcPriSet.has(si)) continue;
        const hit = testShape(si);
        if (hit) return hit;
      }
    }
    return null;
  }, [shapes, selectedShapeIdx, selectedShapeIndices, zoom, isOnActiveLayer, viewFilter, showAllArcPoints, activeLayer]);

  const getWorldPos = useCallback((e: React.MouseEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return screenToWorld(e.clientX - r.left, e.clientY - r.top);
  }, [screenToWorld]);

  // ── Mouse Handlers ─────────────────────────────────────
  const skipBlurRef = useRef(false);
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
        const pathRibbonScaleRmb = pathRibbonScalePayloadForCorner(shapes[si], pts);
        pendingRightClickScaleRef.current = {
          type: "corner",
          data: {
            shapeIdx: si, pointIdx: ptHit.pointIdx, anchor,
            startMouse: { ...world }, startPoints: pts.map(p => ({ ...p })),
            startDist: startDist < 1 ? 1 : startDist,
            ...(pathRibbonScaleRmb ? { pathRibbonScale: pathRibbonScaleRmb } : {}),
          },
          startScreen,
        };
        return;
      }
      const edgeHit = hitTestEdgeForScale(world);
      const rmbEdgeShape = edgeHit ? shapes[edgeHit.shapeIdx] : null;
      if (
        edgeHit &&
        rmbEdgeShape?.closed &&
        !(isPathElement(rmbEdgeShape) && rmbEdgeShape.calculatorInputs?.pathIsOutline)
      ) {
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
    if (e.button === 0 || e.button === 1) {
      const ne = e.nativeEvent;
      if (ne instanceof PointerEvent && canvasRef.current) {
        canvasPointerCaptureIdRef.current = ne.pointerId;
        try {
          canvasRef.current.setPointerCapture(ne.pointerId);
        } catch {
          /* already captured or unsupported */
        }
      }
    }
    const world = getWorldPos(e);
    /** Użyj też e.ctrlKey — stan ctrlHeld z keydown często nie zdąży się zaktualizować przed pierwszym kliknięciem. */
    const multiMod = ctrlHeld || e.ctrlKey || e.metaKey;

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
    const measureAllowed = activeLayer === 1 || activeLayer === 2 || activeLayer === 3 || activeLayer === 6;
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
      const clickSnapChain = wallBaselineChainForDrawing(s, pts);
      let ep =
        shiftHeld && clickSnapChain.length > 0 ? snapTo45(clickSnapChain[clickSnapChain.length - 1]!, world) : world;
      let wallFaceHintFromSnap: "left" | "right" | undefined;

      if (isLinearElement(s) || isPathElement(s)) {
        if (!shouldSkipSnapPointToDrawingChainAxesForStrip(s)) {
          ep = applyVertexAxisAlignWhileDrawing(ep, shapes, drawingShapeIdx, zoom);
        }
        const wallBl = s.elementType === "wall" ? (s.calculatorInputs?.wallBaselinePolyline as Point[] | undefined) : undefined;
        const snapChain = wallBl && wallBl.length > 0 ? wallBl : pts;
        const snapRes = snapWorldPointForLinearDrawing(ep, {
          drawingShapeIdx,
          shapes,
          localPtChain: snapChain,
          drawingShape: s,
          zoom,
          viewFilter,
          activeLayer,
        });
        ep = snapRes.point;
        wallFaceHintFromSnap = snapRes.wallFaceHint;
        if (!shouldSkipSnapPointToDrawingChainAxesForStrip(s)) {
          ep = snapPointToDrawingChainAxes(ep, snapChain, zoom);
        }
      } else {
        ep = snapDrawingMagnet(ep, {
          drawingShapeIdx,
          shapes,
          localPtChain: pts,
          zoom,
          viewFilter,
          activeLayer,
        });
        const sgThreshold = DRAW_SMART_GUIDE_PX / zoom;
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
        const s = shapes[drawingShapeIdx];
        const closeAnchor =
          s.elementType === "wall" && (s.calculatorInputs?.wallBaselinePolyline as Point[] | undefined)?.[0]
            ? (s.calculatorInputs!.wallBaselinePolyline as Point[])[0]
            : pts[0];
        const ss = worldToScreen(closeAnchor.x, closeAnchor.y);
        const ms = worldToScreen(ep.x, ep.y);
        if (distance(ms, ss) < SNAP_TO_START_RADIUS) {
          saveHistory();
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
            const thicknessPx = toPixels(thicknessM);
            let closedCenterPts = pts;
            if (s.elementType === "wall" && s.calculatorInputs?.wallDrawBaseline) {
              const half = thicknessPx / 2;
              const face = s.calculatorInputs.wallDrawFace === "right" ? "right" : "left";
              const wb = s.calculatorInputs?.wallBaselinePolyline as Point[] | undefined;
              const baselineChain = wb && wb.length >= 2 ? wb : pts;
              closedCenterPts = baselineFacePolylineToCenterline(baselineChain, half, face, true);
            }
            const outline = computeThickPolylineClosed(closedCenterPts, thicknessPx);
            if (outline.length >= 3) {
              const segLengths = polygonToSegmentLengths(outline);
              setShapes(p => {
                const n = [...p];
                const sh = n[drawingShapeIdx];
                const baseCalc = { ...(sh.calculatorInputs ?? {}) };
                delete baseCalc.wallDrawBaseline;
                delete baseCalc.wallDrawFace;
                delete baseCalc.wallBaselinePolyline;
                const inputs: Record<string, unknown> = { ...baseCalc, segmentLengths: segLengths };
                if (sh.elementType === "wall") {
                  const defaultH = parseFloat(String(sh.calculatorInputs?.height ?? "1")) || 1;
                  inputs.segmentHeights = segLengths.map(() => ({ startH: defaultH, endH: defaultH }));
                }
                n[drawingShapeIdx] = { ...sh, points: outline, closed: true, linearOpenStripOutline: undefined, drawingFinished: true, calculatorInputs: inputs };
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
        const n = [...p];
        const sh = { ...n[drawingShapeIdx] };
        const inputs = { ...(sh.calculatorInputs ?? {}) };
        sh.heights = [...(sh.heights || []), 0];
        if (isGroundworkLinear(sh)) {
          sh.groundworkBurialDepthM = [...(sh.groundworkBurialDepthM || sh.points.map(() => 0)), 0];
        }
        if (wallFaceHintFromSnap && sh.elementType === "wall") {
          inputs.wallDrawFace = wallFaceHintFromSnap;
        }
        if (sh.elementType === "wall" && inputs.wallDrawBaseline) {
          const blStored = inputs.wallBaselinePolyline as Point[] | undefined;
          const baseline =
            blStored && blStored.length > 0 ? [...blStored, { ...ep }] : [...sh.points, { ...ep }];
          if (baseline.length >= 2) {
            const thicknessM = getPolygonThicknessM({ ...sh, calculatorInputs: inputs });
            const thicknessPx = toPixels(thicknessM);
            const half = thicknessPx / 2;
            const face = inputs.wallDrawFace === "right" ? "right" : "left";
            const centerPts = baselineFacePolylineToCenterline(baseline, half, face);
            if (centerPts.length >= 2) {
              const outline = computeThickPolyline(centerPts, thicknessPx);
              if (outline.length >= 4) {
                sh.points = outline;
                sh.linearOpenStripOutline = true;
                inputs.wallBaselinePolyline = baseline;
              } else {
                sh.points = baseline;
                delete inputs.wallBaselinePolyline;
                sh.linearOpenStripOutline = undefined;
              }
            } else {
              sh.points = baseline;
            }
          } else {
            sh.points = baseline;
          }
        } else {
          sh.points = [...sh.points, { ...ep }];
        }
        sh.calculatorInputs = inputs;
        n[drawingShapeIdx] = sh;
        return n;
      });
      return;
    }

    // Pick anchor vertex for "offset along line" (must run before geodesy / select so the second click is not swallowed)
    if (
      pointOffsetAlongLinePick &&
      mode === "select" &&
      drawingShapeIdx === null &&
      e.button === 0 &&
      (activeLayer === 1 || activeLayer === 2 || activeLayer === 6)
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
    if (geodesyEnabled && isGeodesyInteractionLayer(activeLayer)) {
      const geodesyFilter = (s: Shape) => {
        if (s.layer === 1 && activeLayer !== 1) return false;
        if (!passesViewFilter(s, viewFilter, activeLayer)) return false;
        if (activeLayer === 6) return s.layer === 1 || s.layer === 2;
        return s.layer === activeLayer;
      };
      const rect = canvasRef.current?.getBoundingClientRect();
      const ctx = canvasRef.current?.getContext("2d");
      if (rect && ctx) {
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        const smartLabelsHit = smartGeodesyLabelsRef.current;
        const badgeHit = smartLabelsHit.hitTestBadgeOrDot(canvasX, canvasY, worldToScreen);
        if (badgeHit?.type === "badge") {
          const labelTexts = badgeHit.cluster.labels.map(l => ({ text: l.text }));
          setClusterTooltip({ x: e.clientX, y: e.clientY, labels: labelTexts });
          return;
        }
        setClusterTooltip(null);

        const cardsInfo = smartGeodesyLabelsRef.current.getCardsInfo();
        const cardHit = hitTestGeodesyCard(canvasX, canvasY, cardsInfo);
        if (cardHit) {
          setClickedHeightTooltip(null);
          skipBlurRef.current = true;
          const card = cardsInfo[cardHit.cardIdx];
          setEditingGeodesyCard({ cardInfo: card, focusGeodesyKey: null, screenPos: { x: e.clientX, y: e.clientY } });
          setHeightValues(card.entries.map(ent => formatGeodesyHeightEditCm(ent.height)));
          setSelectedShapeIdx(card.group[0]?.shapeIdx ?? null);
          requestAnimationFrame(() => { skipBlurRef.current = false; });
          return;
        }
      }
      const hpHit = hitTestHeightPoint(world);
      if (hpHit) {
        setClickedHeightTooltip(null);
        skipBlurRef.current = true;
        if (rect && ctx) {
          const cardsInfo = smartGeodesyLabelsRef.current.getCardsInfo();
          const card = findCardForPoint(cardsInfo, { shapeIdx: hpHit.shapeIdx, heightPointIdx: hpHit.heightPointIdx });
          if (card) {
            const gp = findGeodesyHeightPointFromHit(shapes, geodesyFilter, hpHit);
            setEditingGeodesyCard({
              cardInfo: card,
              focusGeodesyKey: gp ? geoEntryKey(gp) : null,
              screenPos: { x: e.clientX, y: e.clientY },
            });
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
        skipBlurRef.current = true;
        if (rect && ctx) {
          const cardsInfo = smartGeodesyLabelsRef.current.getCardsInfo();
          const card = findCardForPoint(cardsInfo, { shapeIdx: ptHit.shapeIdx, pointIdx: ptHit.pointIdx });
          if (card) {
            const gp = findGeodesyVertexPointFromHit(shapes, geodesyFilter, ptHit);
            setEditingGeodesyCard({
              cardInfo: card,
              focusGeodesyKey: gp ? geoEntryKey(gp) : null,
              screenPos: { x: e.clientX, y: e.clientY },
            });
            setHeightValues(card.entries.map(ent => formatGeodesyHeightEditCm(ent.height)));
            setSelectedShapeIdx(ptHit.shapeIdx);
          }
        }
        requestAnimationFrame(() => { skipBlurRef.current = false; });
        return;
      }
      setEditingGeodesyCard(null);
      setSelectedShapeIdx(null);
      setClusterTooltip(null);
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
        const ptHitL3 = hitTestPoint(world);
        if (ptHitL3) {
          saveHistory();
          const hitShape = shapes[ptHitL3.shapeIdx];
          if (hitShape.closed && isPathElement(hitShape) && hitShape.calculatorInputs?.pathIsOutline) {
            const hp = hitShape.points;
            if (hp.length === 8 || hp.length === 4) {
              const pwm = Number(hitShape.calculatorInputs.pathWidthM ?? 0.6) || 0.6;
              const cl0 = resolvePathRibbonRectCenterline4(
                hp,
                pwm,
                hitShape.calculatorInputs.pathCenterline as Point[] | undefined,
                hitShape.calculatorInputs.pathCenterlineOriginal as Point[] | undefined,
              );
              pathRibbonDragStartClRef.current = cl0.length === 4 ? cl0.map(p => ({ ...p })) : null;
              pathRibbonDragStartOutlineRef.current = hp.map(p => ({ ...p }));
            } else {
              pathRibbonDragStartClRef.current = null;
              pathRibbonDragStartOutlineRef.current = null;
            }
          } else {
            pathRibbonDragStartClRef.current = null;
            pathRibbonDragStartOutlineRef.current = null;
          }
          const { dragInfo: diL3, clearMultiSelection: clearMultiL3 } = buildPointDragInfoWithMultiSelect(shapes, ptHitL3, world, selectedPoints);
          if (clearMultiL3) setSelectedPoints([]);
          setDragInfo(diL3);
          setSelectedShapeIdx(ptHitL3.shapeIdx);
          return;
        }
        const arcHitL3 = hitTestArcPointGlobal(world);
        if (arcHitL3) {
          saveHistory();
          const shapeA = shapes[arcHitL3.shapeIdx];
          const A = shapeA.points[arcHitL3.edgeIdx];
          const B = shapeA.points[(arcHitL3.edgeIdx + 1) % shapeA.points.length];
          const arcsL3 = shapeA.edgeArcs?.[arcHitL3.edgeIdx] ?? [];
          const startArcPointWorld = arcPointToWorldOnCurve(A, B, arcsL3, arcHitL3.arcPoint);
          arcSnapLockedTargetRef.current = null;
          arcSnapCacheRef.current = buildArcPointPositionCache(shapes, isOnActiveLayerForArcSnap);
          setArcDragInfo({
            shapeIdx: arcHitL3.shapeIdx,
            edgeIdx: arcHitL3.edgeIdx,
            arcPoint: arcHitL3.arcPoint,
            startMouse: { ...world },
            startArcPointWorld,
          });
          setSelectedShapeIdx(arcHitL3.shapeIdx);
          return;
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
            if (!multiMod) {
              const multiIndices =
                selectedShapeIndices.length >= 2 && selectedShapeIndices.includes(patternHit.shapeIdx)
                  ? [...new Set(selectedShapeIndices)].sort((a, b) => a - b)
                  : null;
              if (multiIndices) {
                saveHistory();
                transformStartVizPiecesRef.current = null;
                const starts: MultiShapeDragStart[] = multiIndices.map(sidx => ({
                  shapeIdx: sidx,
                  startPoints: shapes[sidx].points.map(p => ({ ...p })),
                  startVizPieces: shapes[sidx].calculatorInputs?.vizPieces
                    ? (shapes[sidx].calculatorInputs!.vizPieces as GrassPiece[]).map(p => ({ ...p }))
                    : null,
                  ...snapshotPathRibbonForDrag(shapes[sidx].calculatorInputs as Record<string, unknown>),
                  linkedPathSnapshot: linkedPathSnapshotForShape(shapes[sidx], shapes),
                }));
                setShapeDragInfo({
                  shapeIdx: patternHit.shapeIdx,
                  startMouse: { ...world },
                  startPoints: shapes[patternHit.shapeIdx].points.map(p => ({ ...p })),
                  multiShapeDragStarts: starts,
                });
                const gardenChildren = collectGardenDragChildrenForShapeIndices(multiIndices, shapes);
                const excludeDrag = new Set(multiIndices);
                gardenDragChildrenRef.current = gardenChildren.filter(c => !excludeDrag.has(c.idx));
                setPatternDragPreview(null);
                setPathPatternLongOffsetPreview(null);
                setPatternAlignedEdges([]);
                return;
              }
            }
            saveHistory();
            setSelectedShapeIndices([]);
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
        // Brak wzorca (np. zwykły L2 bez wizualizacji) — ta sama obsługa co poniżej: Ctrl + grupowy ruch całych kształtów.
        const shapeHitL3 = hitTestShape(world);
        if (shapeHitL3 !== null) {
          if (multiMod) {
            setSelectedPoints([]);
            setSelectedShapeIndices(prev => {
              const had = prev.includes(shapeHitL3);
              const nextSet = new Set(prev);
              if (had) nextSet.delete(shapeHitL3);
              else nextSet.add(shapeHitL3);
              const arr = [...nextSet].sort((a, b) => a - b);
              const nextPrimary = arr.length === 0 ? null : had ? (arr[0] ?? null) : shapeHitL3;
              setSelectedShapeIdx(nextPrimary);
              return arr;
            });
            return;
          }
          saveHistory();
          const latestIdxL3 = selectedShapeIndicesRef.current;
          const fullMarqueeL3 = getFullySelectedShapeIndicesFromPoints(selectedPoints, shapes);
          let multiIndicesL3 =
            latestIdxL3.length >= 2 && latestIdxL3.includes(shapeHitL3)
              ? [...new Set(latestIdxL3)].sort((a, b) => a - b)
              : null;
          if (multiIndicesL3 === null && fullMarqueeL3.length >= 2 && fullMarqueeL3.includes(shapeHitL3)) {
            multiIndicesL3 = fullMarqueeL3;
          }
          if (multiIndicesL3) {
            transformStartVizPiecesRef.current = null;
            const startsL3: MultiShapeDragStart[] = multiIndicesL3.map(si => ({
              shapeIdx: si,
              startPoints: shapes[si].points.map(p => ({ ...p })),
              startVizPieces: shapes[si].calculatorInputs?.vizPieces
                ? (shapes[si].calculatorInputs!.vizPieces as GrassPiece[]).map(p => ({ ...p }))
                : null,
              ...snapshotPathRibbonForDrag(shapes[si].calculatorInputs as Record<string, unknown>),
              linkedPathSnapshot: linkedPathSnapshotForShape(shapes[si], shapes),
            }));
            setSelectedShapeIndices(multiIndicesL3);
            setSelectedShapeIdx(shapeHitL3);
            setShapeDragInfo({
              shapeIdx: shapeHitL3,
              startMouse: { ...world },
              startPoints: shapes[shapeHitL3].points.map(p => ({ ...p })),
              multiShapeDragStarts: startsL3,
            });
            const gardenChildrenL3 = collectGardenDragChildrenForShapeIndices(multiIndicesL3, shapes);
            const excludeDragL3 = new Set(multiIndicesL3);
            gardenDragChildrenRef.current = gardenChildrenL3.filter(c => !excludeDragL3.has(c.idx));
          } else {
            setSelectedShapeIndices([]);
            setSelectedShapeIdx(shapeHitL3);
            setShapeDragInfo({
              shapeIdx: shapeHitL3,
              startMouse: { ...world },
              startPoints: shapes[shapeHitL3].points.map(p => ({ ...p })),
              ...snapshotPathRibbonForDrag(shapes[shapeHitL3].calculatorInputs as Record<string, unknown>),
              linkedPathSnapshot: linkedPathSnapshotForShape(shapes[shapeHitL3], shapes),
            });
            const hitShapeL3 = shapes[shapeHitL3];
            transformStartVizPiecesRef.current = hitShapeL3.calculatorInputs?.vizPieces
              ? (hitShapeL3.calculatorInputs.vizPieces as GrassPiece[]).map(p => ({ ...p })) : null;
            if (hitShapeL3.layer === 1 && hitShapeL3.closed && hitShapeL3.points.length >= 3) {
              const childrenL3: typeof gardenDragChildrenRef.current = [];
              for (let ci = 0; ci < shapes.length; ci++) {
                if (ci === shapeHitL3 || shapes[ci].layer !== 2) continue;
                const c = centroid(shapes[ci].points);
                if (pointInPolygon(c, hitShapeL3.points)) {
                  childrenL3.push({
                    idx: ci,
                    startPoints: shapes[ci].points.map(p => ({ ...p })),
                    startVizPieces: shapes[ci].calculatorInputs?.vizPieces
                      ? (shapes[ci].calculatorInputs!.vizPieces as GrassPiece[]).map(p => ({ ...p }))
                      : null,
                    ...snapshotPathRibbonForDrag(shapes[ci].calculatorInputs as Record<string, unknown>),
                  });
                }
              }
              gardenDragChildrenRef.current = childrenL3;
            } else {
              gardenDragChildrenRef.current = [];
            }
          }
          return;
        }
        setSelectedShapeIdx(null);
        setSelectedShapeIndices([]);
        if (multiMod) {
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

      /** Ctrl + multiselect albo prostokąt obejmujący co najmniej dwa pełne kształty (wszystkie wierzchołki) — pierwszeństwo grupowego ruchu z wypełnienia przed hitTestPoint. */
      const indicesSnap = selectedShapeIndicesRef.current;
      const fullShapeIndicesFromMarquee = getFullySelectedShapeIndicesFromPoints(selectedPoints, shapes);
      const treatWholeShapeMulti =
        indicesSnap.length >= 2 || fullShapeIndicesFromMarquee.length >= 2;
      const shapeHitBeforeVertex = treatWholeShapeMulti ? hitTestShape(world) : null;
      const skipVertexForWholeShapeMulti =
        shapeHitBeforeVertex !== null &&
        (indicesSnap.includes(shapeHitBeforeVertex) ||
          fullShapeIndicesFromMarquee.includes(shapeHitBeforeVertex));

      const ptHit = hitTestPoint(world);
      if (ptHit && !skipVertexForWholeShapeMulti) {
        if ((activeLayer === 4 || activeLayer === 5) && e.button === 0) {
          const shHit = shapes[ptHit.shapeIdx];
          if (shHit?.layer === 2 && passesViewFilterWithGroundworkOnExcavationLayers(shHit, viewFilter, activeLayer)) {
            if (isGroundworkLinear(shHit)) {
              setCmEditDialog({
                shapeIdx: ptHit.shapeIdx,
                pointIdx: ptHit.pointIdx,
                mode: "groundworkBurial",
                screenPos: { x: e.clientX, y: e.clientY },
              });
            } else {
              setCmEditDialog({
                shapeIdx: ptHit.shapeIdx,
                pointIdx: ptHit.pointIdx,
                mode: activeLayer === 4 ? "excavation" : "preparation",
                screenPos: { x: e.clientX, y: e.clientY },
              });
            }
            return;
          }
        }
        saveHistory();
        const hitShape = shapes[ptHit.shapeIdx];
        if (hitShape.closed && isPathElement(hitShape) && hitShape.calculatorInputs?.pathIsOutline) {
          const hp = hitShape.points;
          if (hp.length === 8 || hp.length === 4) {
            const pwm = Number(hitShape.calculatorInputs.pathWidthM ?? 0.6) || 0.6;
            const cl0 = resolvePathRibbonRectCenterline4(
              hp,
              pwm,
              hitShape.calculatorInputs.pathCenterline as Point[] | undefined,
              hitShape.calculatorInputs.pathCenterlineOriginal as Point[] | undefined,
            );
            pathRibbonDragStartClRef.current = cl0.length === 4 ? cl0.map(p => ({ ...p })) : null;
            pathRibbonDragStartOutlineRef.current = hp.map(p => ({ ...p }));
          } else {
            pathRibbonDragStartClRef.current = null;
            pathRibbonDragStartOutlineRef.current = null;
          }
        } else {
          pathRibbonDragStartClRef.current = null;
          pathRibbonDragStartOutlineRef.current = null;
        }
        const inMulti =
          selectedPoints.length >= 2 &&
          selectedPoints.some(sp => sp.shapeIdx === ptHit.shapeIdx && sp.pointIdx === ptHit.pointIdx);
        let multiDragStartPositions: MultiDragVertexStart[] | undefined;
        if (inMulti) {
          const uniq = new Map<string, MultiDragVertexStart>();
          for (const sp of selectedPoints) {
            const k = `${sp.shapeIdx},${sp.pointIdx}`;
            const sh = shapes[sp.shapeIdx];
            if (!sh) continue;
            const denseCache =
              isLinearElement(sh) && isPolygonLinearStripOutline(sh) && sh.linearOpenStripOutline
                ? computeLinearElementFillOutline(sh)
                : undefined;
            const p = getLinearElementVertexGripWorld(sh, sp.pointIdx, denseCache);
            uniq.set(k, { shapeIdx: sp.shapeIdx, pointIdx: sp.pointIdx, x: p.x, y: p.y });
          }
          if (uniq.size >= 2) multiDragStartPositions = [...uniq.values()];
        }
        if (selectedPoints.length >= 2 && !inMulti) setSelectedPoints([]);
        const dragHitShape = shapes[ptHit.shapeIdx];
        const denseDragStart =
          dragHitShape && isLinearElement(dragHitShape) && isPolygonLinearStripOutline(dragHitShape) && dragHitShape.linearOpenStripOutline
            ? computeLinearElementFillOutline(dragHitShape)
            : undefined;
        const vertexDragStart = dragHitShape
          ? getLinearElementVertexGripWorld(dragHitShape, ptHit.pointIdx, denseDragStart)
          : { x: 0, y: 0 };
        setDragInfo({
          shapeIdx: ptHit.shapeIdx,
          pointIdx: ptHit.pointIdx,
          startMouse: { ...world },
          startPoint: { ...vertexDragStart },
          ...(multiDragStartPositions ? { multiDragStartPositions } : {}),
        });
        setSelectedShapeIndices([]);
        setSelectedShapeIdx(ptHit.shapeIdx);
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
        arcSnapCacheRef.current = buildArcPointPositionCache(shapes, isOnActiveLayerForArcSnap);
        setArcDragInfo({ shapeIdx: arcHit.shapeIdx, edgeIdx: arcHit.edgeIdx, arcPoint: arcHit.arcPoint, startMouse: { ...world }, startArcPointWorld });
        setSelectedShapeIdx(arcHit.shapeIdx);
        return;
      }

      // Open endpoints (fence / freeDraw chains — not polygon linear walls; those use point menu)
      const openEnd = hitTestOpenEnd(world);
      if (openEnd) {
        const { shapeIdx: si, end } = openEnd;
        const pi = end === "first" ? 0 : shapes[si].points.length - 1;
        setDragInfo({ shapeIdx: si, pointIdx: pi, startMouse: { ...world }, startPoint: { ...shapes[si].points[pi] }, isOpenEnd: true, openEndSide: end });
        setSelectedShapeIdx(si);
        return;
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
        if (multiMod) {
          setSelectedPoints([]);
          setSelectedShapeIndices(prev => {
            const had = prev.includes(shapeHit);
            const nextSet = new Set(prev);
            if (had) nextSet.delete(shapeHit);
            else nextSet.add(shapeHit);
            const arr = [...nextSet].sort((a, b) => a - b);
            const nextPrimary = arr.length === 0 ? null : had ? (arr[0] ?? null) : shapeHit;
            setSelectedShapeIdx(nextPrimary);
            return arr;
          });
          return;
        }
        saveHistory();
        const latestIdx = selectedShapeIndicesRef.current;
        const fullFromMarquee = getFullySelectedShapeIndicesFromPoints(selectedPoints, shapes);
        let multiIndices =
          latestIdx.length >= 2 && latestIdx.includes(shapeHit)
            ? [...new Set(latestIdx)].sort((a, b) => a - b)
            : null;
        if (multiIndices === null && fullFromMarquee.length >= 2 && fullFromMarquee.includes(shapeHit)) {
          multiIndices = fullFromMarquee;
        }
        if (multiIndices) {
          transformStartVizPiecesRef.current = null;
          const starts: MultiShapeDragStart[] = multiIndices.map(si => ({
            shapeIdx: si,
            startPoints: shapes[si].points.map(p => ({ ...p })),
            startVizPieces: shapes[si].calculatorInputs?.vizPieces
              ? (shapes[si].calculatorInputs!.vizPieces as GrassPiece[]).map(p => ({ ...p }))
              : null,
            ...snapshotPathRibbonForDrag(shapes[si].calculatorInputs as Record<string, unknown>),
            linkedPathSnapshot: linkedPathSnapshotForShape(shapes[si], shapes),
          }));
          setSelectedShapeIndices(multiIndices);
          setSelectedShapeIdx(shapeHit);
          setShapeDragInfo({
            shapeIdx: shapeHit,
            startMouse: { ...world },
            startPoints: shapes[shapeHit].points.map(p => ({ ...p })),
            multiShapeDragStarts: starts,
          });
          const gardenChildren = collectGardenDragChildrenForShapeIndices(multiIndices, shapes);
          const excludeDrag = new Set(multiIndices);
          gardenDragChildrenRef.current = gardenChildren.filter(c => !excludeDrag.has(c.idx));
        } else {
          setSelectedShapeIndices([]);
          setSelectedShapeIdx(shapeHit);
          setShapeDragInfo({
            shapeIdx: shapeHit,
            startMouse: { ...world },
            startPoints: shapes[shapeHit].points.map(p => ({ ...p })),
            ...snapshotPathRibbonForDrag(shapes[shapeHit].calculatorInputs as Record<string, unknown>),
            linkedPathSnapshot: linkedPathSnapshotForShape(shapes[shapeHit], shapes),
          });
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
                  ...snapshotPathRibbonForDrag(shapes[ci].calculatorInputs as Record<string, unknown>),
                });
              }
            }
            gardenDragChildrenRef.current = children;
          } else {
            gardenDragChildrenRef.current = [];
          }
        }
        return;
      }

      setSelectedShapeIdx(null);
      setSelectedShapeIndices([]);
      if (multiMod) {
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
      const w0 = snapDrawingMagnet(world, {
        drawingShapeIdx: DRAWING_SNAP_EXCLUDE_NONE,
        shapes,
        localPtChain: [],
        zoom,
        viewFilter,
        activeLayer,
      });
      const newIdx = shapes.length;
      setShapes(p => [...p, { points: [{ ...w0 }], closed: false, label: "Free Draw", layer: (activeLayer === 3 || activeLayer === 4 || activeLayer === 5 ? 2 : activeLayer) as LayerID, lockedEdges: [], lockedAngles: [], heights: [0], elementType: "polygon", thickness: 0 }]);
      setDrawingShapeIdx(newIdx); setSelectedShapeIdx(newIdx);
    }

    // Path drawing modes (Slabs, Monoblock) — requires pathConfig from PathCreationModal
    if ((mode === "drawPathSlabs" || mode === "drawPathConcreteSlabs" || mode === "drawPathMonoblock") && pathConfig && drawingShapeIdx === null) {
      const elementType = mode === "drawPathSlabs" ? "pathSlabs" : mode === "drawPathConcreteSlabs" ? "pathConcreteSlabs" : "pathMonoblock";
      const w0 = snapDrawingMagnet(world, {
        drawingShapeIdx: DRAWING_SNAP_EXCLUDE_NONE,
        shapes,
        localPtChain: [],
        zoom,
        viewFilter,
        activeLayer,
      });
      const newIdx = shapes.length;
      setShapes(p => [...p, {
        points: [{ ...w0 }], closed: false,
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
            setShapes(p => { const n = [...p]; const s = { ...n[si] }; s.points = [...s.points].reverse(); if (s.heights && s.heights.length === s.points.length) s.heights = [...s.heights].reverse(); n[si] = s; return n; });
          }
          setDrawingShapeIdx(si); setSelectedShapeIdx(si); return;
        }
      }
      const protoLinear = protoDrawingShapeForLinearMode(elementType);
      const snapFirst = snapWorldPointForLinearDrawing(world, {
        drawingShapeIdx: DRAWING_SNAP_EXCLUDE_NONE,
        shapes,
        localPtChain: [],
        drawingShape: protoLinear,
        zoom,
        viewFilter,
        activeLayer,
      });
      const w0 = snapFirst.point;
      const newIdx = shapes.length;
      setShapes(p => [...p, {
        points: [{ ...w0 }], closed: false,
        label: elementType.charAt(0).toUpperCase() + elementType.slice(1),
        layer: 2 as LayerID,
        lockedEdges: [], lockedAngles: [], heights: [0],
        elementType: elementType as "fence" | "wall" | "kerb" | "foundation",
        thickness: elementType === "foundation" ? 0.30 : 0.10,
        ...(elementType === "wall" ? {
          calculatorType: "wall" as const,
          calculatorSubType: "block4",
          calculatorInputs: {
            layingMethod: "standing" as const,
            height: "1",
            wallDrawBaseline: true,
            wallDrawFace: (snapFirst.wallFaceHint ?? "left") as "left" | "right",
          },
        } : {}),
        ...(elementType === "kerb" ? {
          calculatorType: "kerbs" as const,
          calculatorSubType: "kl",
          calculatorInputs: {},
        } : {}),
      }]);
      setDrawingShapeIdx(newIdx); setSelectedShapeIdx(newIdx);
    }

    // Groundwork linear drawing modes (Drainage, Canal pipe, Water pipe, Cable) — tylko Wykop / Przygotowanie
    if ((mode === "drawDrainage" || mode === "drawCanalPipe" || mode === "drawWaterPipe" || mode === "drawCable") && drawingShapeIdx === null) {
      if (activeLayer !== 4 && activeLayer !== 5) return;
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
            setShapes(p => {
            const n = [...p];
            const s = { ...n[si] };
            s.points = [...s.points].reverse();
            if (s.groundworkBurialDepthM && s.groundworkBurialDepthM.length === s.points.length) {
              s.groundworkBurialDepthM = [...s.groundworkBurialDepthM].reverse();
            }
            n[si] = s;
            return n;
          });
          }
          setDrawingShapeIdx(si); setSelectedShapeIdx(si); return;
        }
      }
      const w0 = snapDrawingMagnet(world, {
        drawingShapeIdx: DRAWING_SNAP_EXCLUDE_NONE,
        shapes,
        localPtChain: [],
        zoom,
        viewFilter,
        activeLayer,
      });
      const newIdx = shapes.length;
      setShapes(p => [...p, {
        points: [{ ...w0 }], closed: false,
        label,
        layer: 2 as LayerID,
        lockedEdges: [], lockedAngles: [], heights: [0],
        groundworkBurialDepthM: [0],
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
        const pathRibbonScale = pathRibbonScalePayloadForCorner(shapes[si], pts);
        setScaleCorner({
          shapeIdx: si, pointIdx: ptHit.pointIdx, anchor,
          startMouse: { ...world }, startPoints: pts.map(p => ({ ...p })),
          startDist: startDist < 1 ? 1 : startDist,
          ...(pathRibbonScale ? { pathRibbonScale } : {}),
        });
        transformStartVizPiecesRef.current = shapes[si].calculatorInputs?.vizPieces
          ? (shapes[si].calculatorInputs!.vizPieces as GrassPiece[]).map(p => ({ ...p })) : null;
        return;
      }
      const edgeHit = hitTestEdge(world);
      const edgeShape = edgeHit ? shapes[edgeHit.shapeIdx] : null;
      if (
        edgeHit &&
        edgeShape?.closed &&
        !(isPathElement(edgeShape) && edgeShape.calculatorInputs?.pathIsOutline)
      ) {
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
      if (shapeHit !== null) { setSelectedShapeIdx(shapeHit); setSelectedShapeIndices([]); return; }
      setSelectedShapeIdx(null);
      setSelectedShapeIndices([]);
      setIsPanning(true); setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [mode, shapes, drawingShapeIdx, pathSegmentSideSelection, pathConfig, pan, zoom, shiftHeld, ctrlHeld, geodesyEnabled, getWorldPos, hitTestPoint, hitTestHeightPoint, hitTestEdge, hitTestShape, hitTestOpenEnd, hitTestPattern, hitTestPointForScale, hitTestEdgeForScale, hitTestGrassPieceEdge, hitTestArcPointGlobal, worldToScreen, saveHistory, selectedShapeIdx, selectedShapeIndices, isOnActiveLayer, activeLayer, editingGeodesyCard, measureStart, measureEnd, hoveredPoint, hoveredEdge, selectedPoints, selectionRect, editingDim, rotateInfo, patternDragInfo, patternRotateInfo, shapeDragInfo, edgeDragInfo, t, pointOffsetAlongLinePick, viewFilter]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const world = getWorldPos(e);

    const hasActiveCanvasDrag = !!(dragInfo || shapeDragInfo || edgeDragInfo);
    if (hasActiveCanvasDrag) {
      if (mouseRafRef.current != null) cancelAnimationFrame(mouseRafRef.current);
      mouseRafRef.current = null;
      setMouseWorld(world);
    } else {
      if (mouseRafRef.current != null) cancelAnimationFrame(mouseRafRef.current);
      mouseRafRef.current = requestAnimationFrame(() => {
        setMouseWorld(world);
      });
    }

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
          if (sc.pathRibbonScale) {
            const { newPts, ribbonCl, ratio, ax, ay, snapOff } = computeScaleCornerFrame(sc, world, shapes, zoom);
            setShapes(p => {
              const n = [...p]; const s = { ...n[sc.shapeIdx] }; s.points = newPts;
              if (ribbonCl && ribbonCl.length >= 2) {
                s.calculatorInputs = {
                  ...s.calculatorInputs,
                  pathCenterline: ribbonCl.map(pt => ({ ...pt })),
                  pathCenterlineOriginal: ribbonCl.map(pt => ({ ...pt })),
                };
              }
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
              n[sc.shapeIdx] = s; return n;
            });
          } else {
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
          }
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
      flushSync(() => {
        setShapes(p => {
          const n = [...p];
          const s = { ...n[edgeDragInfo.shapeIdx] };
          const pts = s.points;
          const ei = edgeDragInfo.edgeIdx;
          /** Strip rebuild adds delta to centerline from current outline — must be incremental vs pts, not total vs drag start (else each mousemove re-applies full offset). */
          const deltaStrip = { x: finalP0.x - pts[ei].x, y: finalP0.y - pts[ei].y };
          const stripLocked =
            (s.lockedEdges && s.lockedEdges.length > 0) || (s.lockedAngles && s.lockedAngles.length > 0);
          let rebuiltStrip: Point[] | null = null;
          if (
            isPolygonLinearStripOutline(s) &&
            isPolygonLinearElement(s) &&
            !stripLocked
          ) {
            const tpx = toPixels(getPolygonThicknessM(s));
            if (s.closed) {
              rebuiltStrip = rebuildClosedStripOutlineAfterEdgeTranslate(pts, ei, deltaStrip, tpx);
            } else if (s.linearOpenStripOutline) {
              rebuiltStrip = rebuildOpenStripOutlineAfterEdgeTranslate(pts, ei, deltaStrip, tpx);
            }
          }
          if (rebuiltStrip) {
            s.points = rebuiltStrip;
            s.calculatorResults = undefined;
          } else {
            const np = [...s.points];
            const endI = s.closed ? (edgeDragInfo.edgeIdx + 1) % np.length : edgeDragInfo.edgeIdx + 1;
            np[edgeDragInfo.edgeIdx] = finalP0;
            np[endI] = finalP1;
            s.points = np;
          }
          n[edgeDragInfo.shapeIdx] = s;
          if (s.linkedShapeIdx != null && n[s.linkedShapeIdx]) {
            n[s.linkedShapeIdx] = { ...n[s.linkedShapeIdx], points: [...s.points] };
          }
          return n;
        });
      });
      return;
    }

    if (shapeDragInfo) {
      const dx = world.x - shapeDragInfo.startMouse.x;
      const dy = world.y - shapeDragInfo.startMouse.y;
      const movedPts = shapeDragInfo.startPoints.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
      const magThreshold = SNAP_MAGNET_PX / zoom;
      const multi = shapeDragInfo.multiShapeDragStarts;
      /** Strip wall/kerb/foundation: many outline vertices + snapMagnetShape = rigid snap to foreign pts/edges → “jumpy” whole-shape drag. */
      const stripLinearWholeDragNoMagnet = (si: number): boolean => {
        const sh = shapes[si];
        return !!(sh && isPolygonLinearStripOutline(sh) && isPolygonLinearElement(sh));
      };
      const noMagSnap = { offset: { x: 0, y: 0 }, didSnap: false, snapTarget: null as Point | null };
      if (multi && multi.length >= 2) {
        const excludeSet = new Set(multi.map(m => m.shapeIdx));
        const skipMag = multi.some(m => stripLinearWholeDragNoMagnet(m.shapeIdx));
        const snap = skipMag ? noMagSnap : snapMagnetShapeExcluding(movedPts, shapes, excludeSet, magThreshold);
        const finalPts = snap.didSnap ? movedPts.map(pt => ({ x: pt.x + snap.offset.x, y: pt.y + snap.offset.y })) : movedPts;
        const totalDx = finalPts[0].x - shapeDragInfo.startPoints[0].x;
        const totalDy = finalPts[0].y - shapeDragInfo.startPoints[0].y;
        flushSync(() => {
          setShapes(p => {
            const n = [...p];
            for (const m of multi) {
              const s = { ...n[m.shapeIdx] };
              const newPts = m.startPoints.map(pt => ({ x: pt.x + totalDx, y: pt.y + totalDy }));
              s.points = newPts;
              const pathSnap = { startPathCenterline: m.startPathCenterline, startPathCenterlineOriginal: m.startPathCenterlineOriginal };
              let inputs: Record<string, unknown> = { ...s.calculatorInputs } as Record<string, unknown>;
              const pathMerged = applyPathRibbonSnapTranslation(inputs, pathSnap, totalDx, totalDy);
              if (pathMerged) inputs = pathMerged;
              if (m.startVizPieces && inputs.vizPieces) {
                inputs = { ...inputs, vizPieces: (m.startVizPieces as GrassPiece[]).map(pc => ({ ...pc, x: pc.x + totalDx, y: pc.y + totalDy })) };
              }
              s.calculatorInputs = inputs as typeof s.calculatorInputs;
              n[m.shapeIdx] = s;
              const li = s.linkedShapeIdx;
              if (li != null && n[li] && !excludeSet.has(li)) {
                const ls = { ...n[li], points: [...newPts] };
                const lp = m.linkedPathSnapshot;
                if (lp && lp.shapeIdx === li) {
                  const lm = applyPathRibbonSnapTranslation(ls.calculatorInputs as Record<string, unknown>, {
                    startPathCenterline: lp.startPathCenterline,
                    startPathCenterlineOriginal: lp.startPathCenterlineOriginal,
                  }, totalDx, totalDy);
                  if (lm) ls.calculatorInputs = lm as typeof ls.calculatorInputs;
                }
                n[li] = ls;
              }
            }
            for (const child of gardenDragChildrenRef.current) {
              if (excludeSet.has(child.idx)) continue;
              const cs = { ...n[child.idx] };
              cs.points = child.startPoints.map(pt => ({ x: pt.x + totalDx, y: pt.y + totalDy }));
              const cSnap = { startPathCenterline: child.startPathCenterline, startPathCenterlineOriginal: child.startPathCenterlineOriginal };
              let ci: Record<string, unknown> = { ...cs.calculatorInputs } as Record<string, unknown>;
              const cPathMerged = applyPathRibbonSnapTranslation(ci, cSnap, totalDx, totalDy);
              if (cPathMerged) ci = cPathMerged;
              if (child.startVizPieces && ci.vizPieces) {
                ci = { ...ci, vizPieces: child.startVizPieces.map(pc => ({ ...pc, x: pc.x + totalDx, y: pc.y + totalDy })) };
              }
              cs.calculatorInputs = ci as typeof cs.calculatorInputs;
              n[child.idx] = cs;
            }
            return n;
          });
        });
        return;
      }
      const skipMag = stripLinearWholeDragNoMagnet(shapeDragInfo.shapeIdx);
      const snap = skipMag ? noMagSnap : snapMagnetShape(movedPts, shapes, shapeDragInfo.shapeIdx, magThreshold);
      const finalPts = snap.didSnap ? movedPts.map(pt => ({ x: pt.x + snap.offset.x, y: pt.y + snap.offset.y })) : movedPts;
      const totalDx = finalPts[0].x - shapeDragInfo.startPoints[0].x;
      const totalDy = finalPts[0].y - shapeDragInfo.startPoints[0].y;
      flushSync(() => {
        setShapes(p => {
          const n = [...p];
          const s = { ...n[shapeDragInfo.shapeIdx] };
          s.points = finalPts;
          const pathSnap = {
            startPathCenterline: shapeDragInfo.startPathCenterline,
            startPathCenterlineOriginal: shapeDragInfo.startPathCenterlineOriginal,
          };
          let inputs: Record<string, unknown> = { ...s.calculatorInputs } as Record<string, unknown>;
          const pathMerged = applyPathRibbonSnapTranslation(inputs, pathSnap, totalDx, totalDy);
          if (pathMerged) inputs = pathMerged;
          // Move vizPieces (grass) with element
          if (transformStartVizPiecesRef.current && inputs.vizPieces) {
            inputs = { ...inputs, vizPieces: transformStartVizPiecesRef.current.map(pc => ({ ...pc, x: pc.x + totalDx, y: pc.y + totalDy })) };
          }
          s.calculatorInputs = inputs as typeof s.calculatorInputs;
          n[shapeDragInfo.shapeIdx] = s;
          if (s.linkedShapeIdx != null && n[s.linkedShapeIdx]) {
            const li = s.linkedShapeIdx;
            const ls = { ...n[li], points: [...finalPts] };
            const lp = shapeDragInfo.linkedPathSnapshot;
            if (lp && lp.shapeIdx === li) {
              const lm = applyPathRibbonSnapTranslation(ls.calculatorInputs as Record<string, unknown>, {
                startPathCenterline: lp.startPathCenterline,
                startPathCenterlineOriginal: lp.startPathCenterlineOriginal,
              }, totalDx, totalDy);
              if (lm) ls.calculatorInputs = lm as typeof ls.calculatorInputs;
            }
            n[li] = ls;
          }
          // Garden: move children (Layer 2 inside garden)
          for (const child of gardenDragChildrenRef.current) {
            const cs = { ...n[child.idx] };
            cs.points = child.startPoints.map(pt => ({ x: pt.x + totalDx, y: pt.y + totalDy }));
            const cSnap = { startPathCenterline: child.startPathCenterline, startPathCenterlineOriginal: child.startPathCenterlineOriginal };
            let ci: Record<string, unknown> = { ...cs.calculatorInputs } as Record<string, unknown>;
            const cPathMerged = applyPathRibbonSnapTranslation(ci, cSnap, totalDx, totalDy);
            if (cPathMerged) ci = cPathMerged;
            if (child.startVizPieces && ci.vizPieces) {
              ci = { ...ci, vizPieces: child.startVizPieces.map(pc => ({ ...pc, x: pc.x + totalDx, y: pc.y + totalDy })) };
            }
            cs.calculatorInputs = ci as typeof cs.calculatorInputs;
            n[child.idx] = cs;
          }
          return n;
        });
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

    // Scale corner: proportional scaling from anchor (path ribbon: scale centerline only, fixed pathWidthM)
    if (scaleCorner) {
      const { newPts, ribbonCl, ratio, ax, ay, snapOff } = computeScaleCornerFrame(scaleCorner, world, shapes, zoom);
      setShapes(p => {
        const n = [...p]; const s = { ...n[scaleCorner.shapeIdx] }; s.points = newPts;
        if (ribbonCl && ribbonCl.length >= 2) {
          const inputs = { ...s.calculatorInputs, pathCenterline: ribbonCl.map(pt => ({ ...pt })), pathCenterlineOriginal: ribbonCl.map(pt => ({ ...pt })) };
          s.calculatorInputs = inputs;
        }
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
          let s = { ...n[arcDragInfo.shapeIdx] };
          const edgeArcs = s.edgeArcs ? [...s.edgeArcs] : [];
          if (!edgeArcs[arcDragInfo.edgeIdx]) edgeArcs[arcDragInfo.edgeIdx] = [];
          const arcs = [...(edgeArcs[arcDragInfo.edgeIdx]!)];
          const idx = arcs.findIndex(ap => ap.id === arcDragInfo.arcPoint.id);
          if (idx >= 0) arcs[idx] = { ...arcs[idx], t, offset };
          edgeArcs[arcDragInfo.edgeIdx] = arcs;
          s.edgeArcs = edgeArcs;
          const ei = arcDragInfo.edgeIdx;
          const pts = s.points;
          const seg = stripPolygonEdgeToSegmentIndex(pts, ei);
          if (seg !== null && isPolygonLinearStripOutline(s)) {
            const par = stripOutlineParallelEdges(pts, seg);
            const leftEi = seg;
            const rightEi = stripOppositePolygonEdgeIndex(pts, leftEi);
            if (par && rightEi != null && ei === rightEi) {
              const rightList = s.edgeArcs?.[ei] ?? [];
              const leftCanon = mirrorArcPointsToOppositeChord(par.rightA, par.rightB, par.leftA, par.leftB, rightList);
              const lea = s.edgeArcs ? [...s.edgeArcs] : [];
              while (lea.length < pts.length) lea.push(null);
              lea[leftEi] = leftCanon.length ? leftCanon : null;
              s.edgeArcs = lea;
            }
            s = applyStripParallelEdgeArcSync(s);
          }
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
      const movingKeys = new Set(
        dragInfo.multiDragStartPositions && dragInfo.multiDragStartPositions.length >= 2
          ? dragInfo.multiDragStartPositions.map(m => `${m.shapeIdx},${m.pointIdx}`)
          : [`${dragInfo.shapeIdx},${dragInfo.pointIdx}`],
      );
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
        const ptsAlign = shapes[si].points;
        for (let pii = 0; pii < ptsAlign.length; pii++) {
          if (movingKeys.has(`${si},${pii}`)) continue;
          const pt = ptsAlign[pii];
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

      const multi = dragInfo.multiDragStartPositions;
      if (multi && multi.length >= 2) {
        const ddx = target.x - dragInfo.startPoint.x;
        const ddy = target.y - dragInfo.startPoint.y;
        flushSync(() => {
          setShapes(p => {
            const n = [...p];
            const byShape = new Map<number, Map<number, Point>>();
            for (const m of multi) {
              if (!byShape.has(m.shapeIdx)) byShape.set(m.shapeIdx, new Map());
              byShape.get(m.shapeIdx)!.set(m.pointIdx, { x: m.x + ddx, y: m.y + ddy });
            }
            for (const [si, ptMap] of byShape) {
              const s0 = n[si];
              if (!s0) continue;
              const lpts = [...s0.points];
              for (const [ppi, np] of ptMap) {
                if (ppi >= 0 && ppi < lpts.length) lpts[ppi] = { ...np };
              }
              let nextSh: Shape = { ...s0, points: lpts, calculatorResults: undefined };
              if (isPathElement(nextSh) && nextSh.closed && nextSh.calculatorInputs?.pathIsOutline) {
                const cl = extractPathRibbonCenterlineFromOutline(lpts);
                if (cl.length >= 2) {
                  nextSh = {
                    ...nextSh,
                    calculatorInputs: {
                      ...nextSh.calculatorInputs,
                      pathCenterline: cl.map(pt => ({ ...pt })),
                      pathCenterlineOriginal: cl.map(pt => ({ ...pt })),
                    },
                  };
                }
              }
              n[si] = nextSh;
            }
            return n;
          });
        });
        return;
      }

      flushSync(() => {
      setShapes(p => {
        const n = [...p];
        const s = { ...n[dragInfo.shapeIdx] };
        const shape = s;
        const pts = shape.points;
        const pi = dragInfo.pointIdx;

        const dragEntry: LinkedEntry = { si: dragInfo.shapeIdx, pi: dragInfo.pointIdx };
        const group = linkedGroups.find(g => g.some(lp => linkedEntriesMatch(lp, dragEntry)));

        const stripThicknessPxFor = (sh: Shape): number | null => {
          if (sh.lockedEdges && sh.lockedEdges.length > 0) return null;
          if (sh.lockedAngles && sh.lockedAngles.length > 0) return null;
          if (isPolygonLinearStripOutline(sh) && isPolygonLinearElement(sh)) {
            return toPixels(getPolygonThicknessM(sh));
          }
          if (sh.closed && sh.points.length >= 4 && sh.points.length % 2 === 0 && isPathElement(sh) && sh.calculatorInputs?.pathIsOutline) {
            return toPixels(Number(sh.calculatorInputs?.pathWidthM ?? 0.6) || 0.6);
          }
          return null;
        };

        // Linked points: rebuild closed strip (wall/path outline) so thickness stays valid; sync others to final anchor.
        if (group) {
          let anchor: Point = { x: target.x, y: target.y };
          const vertexMembers = group.filter(lp => !isArcEntry(lp));
          const stripEntries = vertexMembers.filter(lp => stripThicknessPxFor(n[lp.si]) != null);
          stripEntries.sort((a, b) => {
            if (a.si === dragInfo.shapeIdx && a.pi === dragInfo.pointIdx) return -1;
            if (b.si === dragInfo.shapeIdx && b.pi === dragInfo.pointIdx) return 1;
            return a.si - b.si;
          });
          const processedStripSi = new Set<number>();
          for (const lp of stripEntries) {
            if (processedStripSi.has(lp.si)) continue;
            const sh = n[lp.si];
            const tpx = stripThicknessPxFor(sh);
            if (tpx == null) continue;
            let reb: Point[] | null = null;
            let rebPathCl: Point[] | null = null;
            let stripAnchorIdx = lp.pi;
            if (sh.linearOpenStripOutline && !sh.closed) {
              reb = rebuildOpenStripOutlineFromVertexTarget(sh.points, lp.pi, anchor, tpx);
            } else if (isPathElement(sh) && sh.closed && sh.calculatorInputs?.pathIsOutline) {
              if (sh.points.length === 8 || sh.points.length === 4) {
                const sidesL =
                  Array.isArray(sh.calculatorInputs.pathSegmentSides) &&
                  (sh.calculatorInputs.pathSegmentSides as ("left" | "right")[]).length === 3
                    ? (sh.calculatorInputs.pathSegmentSides as ("left" | "right")[])
                    : (["left", "left", "left"] as ("left" | "right")[]);
                const pathWM = Number(sh.calculatorInputs.pathWidthM ?? 0.6) || 0.6;
                const pc = sh.calculatorInputs.pathCenterline as Point[] | undefined;
                const po = sh.calculatorInputs.pathCenterlineOriginal as Point[] | undefined;
                let cl0: Point[] =
                  pc && pc.length === 4
                    ? pc.map(p => ({ ...p }))
                    : po && po.length === 4
                      ? po.map(p => ({ ...p }))
                      : (() => {
                          const ex = extractPathRibbonCenterlineFromOutline(sh.points);
                          return ex.length === 4 ? ex.map(p => ({ ...p })) : [];
                        })();
                if (cl0.length !== 4 && sh.points.length === 4) {
                  const recL = recoverCenterlineQuadFromPairFourRibbonOutline(sh.points, toPixels(pathWM) / 2);
                  if (recL && recL.length === 4) cl0 = recL.map(p => ({ ...p }));
                }
                if (cl0.length === 4) {
                  let vSolver = lp.pi;
                  if (sh.points.length === 4) {
                    const o8 = computePathOutlineFromSegmentSides(cl0, sidesL, pathWM);
                    if (o8.length === 8) {
                      let bd = Infinity;
                      for (let j = 0; j < 8; j++) {
                        const d = distance(sh.points[lp.pi], o8[j]);
                        if (d < bd) {
                          bd = d;
                          vSolver = j;
                        }
                      }
                    }
                  }
                  let solvedL = rebuildRectangularPathRibbonFromOutlineDrag(cl0, sidesL, pathWM, vSolver, anchor);
                  if (!solvedL && lp.si === dragInfo.shapeIdx) {
                    const snapL = pathRibbonDragStartOutlineRef.current;
                    if (snapL && snapL.length === sh.points.length) {
                      const pairsL = pathRibbonLengthAnchorPairsFromOutlineSnap(snapL, lp.pi, cl0, sidesL, pathWM);
                      if (pairsL && pairsL.length > 0) {
                        solvedL = rebuildRectangularPathRibbonLengthAnchorsFixed(
                          cl0,
                          sidesL,
                          pathWM,
                          vSolver,
                          anchor,
                          pairsL,
                        );
                      }
                    }
                  }
                  if (solvedL) {
                    reb = solvedL.outline;
                    rebPathCl = solvedL.centerline;
                    stripAnchorIdx = vSolver;
                  }
                }
              }
              if (reb == null && !(isPathElement(sh) && sh.closed && sh.calculatorInputs?.pathIsOutline)) {
                reb = rebuildPathClosedRibbonFromVertexTarget(sh.points, lp.pi, anchor, tpx);
                stripAnchorIdx = lp.pi;
              }
            } else {
              reb = rebuildClosedStripOutlineFromVertexTarget(sh.points, lp.pi, anchor, tpx);
            }
            if (reb) {
              let nextSh: Shape = { ...sh, points: reb, calculatorResults: undefined };
              if (isPathElement(sh) && sh.closed && sh.calculatorInputs?.pathIsOutline) {
                if (rebPathCl && rebPathCl.length >= 2) {
                  nextSh = {
                    ...nextSh,
                    calculatorInputs: {
                      ...sh.calculatorInputs,
                      pathCenterline: rebPathCl.map(p => ({ ...p })),
                      pathCenterlineOriginal: rebPathCl.map(p => ({ ...p })),
                    },
                  };
                } else {
                  const cl = extractPathRibbonCenterlineFromOutline(reb);
                  if (cl.length >= 2) {
                    nextSh = {
                      ...nextSh,
                      calculatorInputs: {
                        ...sh.calculatorInputs,
                        pathCenterline: cl.map(p => ({ ...p })),
                        pathCenterlineOriginal: cl.map(p => ({ ...p })),
                      },
                    };
                  }
                }
              }
              n[lp.si] = nextSh;
              anchor = { ...reb[stripAnchorIdx] };
              processedStripSi.add(lp.si);
            }
          }
          for (const lp of vertexMembers) {
            if (processedStripSi.has(lp.si)) continue;
            const shSkip = n[lp.si];
            if (shSkip && isPathElement(shSkip) && shSkip.closed && shSkip.calculatorInputs?.pathIsOutline) continue;
            const ls = { ...n[lp.si] };
            const lpts = [...ls.points];
            lpts[lp.pi] = { ...anchor };
            ls.points = lpts;
            ls.calculatorResults = undefined;
            n[lp.si] = ls;
          }
          for (const lp of group) {
            if (!isArcEntry(lp) || linkedEntriesMatch(lp, dragEntry)) continue;
            if (!n[lp.si]) continue;
            const ls = { ...n[lp.si] };
            const lea = ls.edgeArcs ? [...ls.edgeArcs] : [];
            const lArcs = lea[lp.edgeIdx] ? [...lea[lp.edgeIdx]!] : [];
            const li = lArcs.findIndex(a => a.id === lp.arcId);
            if (li >= 0) {
              const lA = ls.points[lp.edgeIdx];
              const lB = ls.points[(lp.edgeIdx + 1) % ls.points.length];
              const { t: lt, offset: lo } = worldToArcPointOnCurve(lA, lB, lArcs, lArcs[li]!, anchor);
              lArcs[li] = { ...lArcs[li], t: lt, offset: lo };
              lea[lp.edgeIdx] = lArcs;
              ls.edgeArcs = lea;
              n[lp.si] = ls;
            }
          }
          return n;
        }

        const closedPathRibbonDrag =
          shape.closed &&
          pts.length >= 4 &&
          pts.length % 2 === 0 &&
          isPathElement(shape) &&
          Boolean(shape.calculatorInputs?.pathIsOutline);
        const polygonStrip = isPolygonLinearStripOutline(shape);
        const canStripRebuild =
          (polygonStrip || closedPathRibbonDrag) &&
          (!shape.lockedEdges || shape.lockedEdges.length === 0) &&
          (!shape.lockedAngles || shape.lockedAngles.length === 0);

        // General closed path ribbon drag — works for ANY centerline length (V=2,3,4,5…).
        // Uses pc/po directly (even if length 2), no recovery needed.
        if (closedPathRibbonDrag) {
          const pathWMDrag = Number(shape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6;
          const pcDrag = shape.calculatorInputs?.pathCenterline as Point[] | undefined;
          const poDrag = shape.calculatorInputs?.pathCenterlineOriginal as Point[] | undefined;
          const clAny: Point[] | null =
            pcDrag && pcDrag.length >= 2 ? pcDrag.map(p => ({ ...p }))
            : poDrag && poDrag.length >= 2 ? poDrag.map(p => ({ ...p }))
            : null;
          if (clAny && clAny.length >= 2) {
            const V = clAny.length;
            const storedSides = shape.calculatorInputs?.pathSegmentSides as ("left" | "right")[] | undefined;
            const sidesAny: ("left" | "right")[] =
              Array.isArray(storedSides) && storedSides.length === V - 1
                ? storedSides
                : Array.from({ length: V - 1 }, () => "left" as const);
            const expectedOutLen = 2 * V;
            let viSolver = pi;
            if (pts.length !== expectedOutLen) {
              const o = computePathOutlineFromSegmentSides(clAny, sidesAny, pathWMDrag);
              if (o.length === expectedOutLen) {
                let bd = Infinity;
                for (let j = 0; j < o.length; j++) {
                  const d = distance(pts[pi]!, o[j]!);
                  if (d < bd) { bd = d; viSolver = j; }
                }
              }
            }
            let solvedGen: { outline: Point[]; centerline: Point[] } | null = null;
            if (V === 2) {
              solvedGen = rebuildPathRibbonSingleSegmentDrag(clAny, sidesAny, pathWMDrag, viSolver, target);
            } else {
              solvedGen = rebuildPathRibbonGeneralDrag(clAny, sidesAny, pathWMDrag, viSolver, target);
            }
            if (solvedGen) {
              n[dragInfo.shapeIdx] = {
                ...s,
                points: solvedGen.outline,
                calculatorResults: undefined,
                calculatorInputs: {
                  ...shape.calculatorInputs,
                  pathCenterline: solvedGen.centerline.map(p => ({ ...p })),
                  pathCenterlineOriginal: solvedGen.centerline.map(p => ({ ...p })),
                },
              };
              return n;
            }
          }
        }

        if (canStripRebuild) {
          const thicknessPx = isPathElement(shape) && closedPathRibbonDrag
            ? toPixels(Number(shape.calculatorInputs?.pathWidthM ?? 0.6) || 0.6)
            : toPixels(getPolygonThicknessM(shape));
          let rebuilt: Point[] | null = null;
          if (closedPathRibbonDrag) {
            rebuilt = null;
          } else if (polygonStrip && !shape.closed && shape.linearOpenStripOutline) {
            rebuilt = rebuildOpenStripOutlineFromVertexTarget(pts, pi, target, thicknessPx);
          } else if (polygonStrip && shape.closed) {
            rebuilt = rebuildClosedStripOutlineFromVertexTarget(pts, pi, target, thicknessPx);
          }
          if (rebuilt) {
            let sNext: Shape = { ...s, points: rebuilt, calculatorResults: undefined };
            if (closedPathRibbonDrag) {
              const cl = extractPathRibbonCenterlineFromOutline(rebuilt);
              if (cl.length >= 2) {
                sNext = {
                  ...sNext,
                  calculatorInputs: {
                    ...shape.calculatorInputs,
                    pathCenterline: cl.map(p => ({ ...p })),
                    pathCenterlineOriginal: cl.map(p => ({ ...p })),
                  },
                };
              }
            }
            n[dragInfo.shapeIdx] = sNext;
            return n;
          }
        }

        if (closedPathRibbonDrag) {
          const dx = target.x - pts[pi].x;
          const dy = target.y - pts[pi].y;
          const newPts = pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
          const pcF = shape.calculatorInputs?.pathCenterline as Point[] | undefined;
          const poF = shape.calculatorInputs?.pathCenterlineOriginal as Point[] | undefined;
          const tr = (arr: Point[]) => arr.map(p => ({ x: p.x + dx, y: p.y + dy }));
          n[dragInfo.shapeIdx] = {
            ...s,
            points: newPts,
            calculatorResults: undefined,
            calculatorInputs: {
              ...shape.calculatorInputs,
              ...(pcF && pcF.length >= 2 ? { pathCenterline: tr(pcF) } : {}),
              ...(poF && poF.length >= 2 ? { pathCenterlineOriginal: tr(poF) } : {}),
            },
          };
          return n;
        }

        const np = [...s.points];
        np[dragInfo.pointIdx] = { x: target.x, y: target.y };
        let sFinal: Shape = { ...s, points: np, calculatorResults: undefined };
        if (closedPathRibbonDrag) {
          const cl = extractPathRibbonCenterlineFromOutline(np);
          if (cl.length >= 2) {
            sFinal = {
              ...sFinal,
              calculatorInputs: {
                ...shape.calculatorInputs,
                pathCenterline: cl.map(p => ({ ...p })),
                pathCenterlineOriginal: cl.map(p => ({ ...p })),
              },
            };
          }
        }
        n[dragInfo.shapeIdx] = sFinal;
        return n;
      });
      });
      return;
    }

    if (
      (mode === "select" || mode === "scale" || (geodesyEnabled && isGeodesyInteractionLayer(activeLayer))) &&
      drawingShapeIdx === null
    ) {
      const hpHit = hitTestHeightPoint(world);
      setHoveredHeightPoint(hpHit);
      const pt = hitTestPoint(world); setHoveredPoint(pt);
      const arcHit = hitTestArcPointGlobal(world);
      setHoveredArcPoint(arcHit);
      setHoveredEdge(pt || arcHit ? null : hitTestEdge(world));
    } else if (modeShowsEdgeDistanceWhileDrawing(mode)) {
      setHoveredHeightPoint(null);
      const pt = hitTestPoint(world);
      const arcHit = hitTestArcPointGlobal(world);
      setHoveredPoint(null);
      setHoveredArcPoint(null);
      setHoveredEdge(pt || arcHit ? null : hitTestEdge(world));
    }
  }, [isPanning, panStart, dragInfo, arcDragInfo, draggingGrassPiece, grassScaleInfo, patternDragInfo, patternRotateInfo, mode, shapes, shiftHeld, drawingShapeIdx, selectionRect, shapeDragInfo, edgeDragInfo, rotateInfo, scaleCorner, scaleEdge, getWorldPos, hitTestPoint, hitTestHeightPoint, hitTestEdge, hitTestArcPointGlobal, zoom, pan, canvasSize.w, canvasSize.h, geodesyEnabled, activeLayer, saveHistory, arcPointPositionCache, linkedGroups, isOnActiveLayer]);

  const handleMouseUp = useCallback(() => {
    const capId = canvasPointerCaptureIdRef.current;
    canvasPointerCaptureIdRef.current = null;
    if (capId != null && canvasRef.current) {
      try {
        if (canvasRef.current.hasPointerCapture(capId)) canvasRef.current.releasePointerCapture(capId);
      } catch {
        /* */
      }
    }
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
        if (shape.removedFromCanvas) return;
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

  /** Po setPointerCapture na canvasie mouseup nad toolbarem nie trafia w canvas — kończymy gest globalnie, żeby toolbar znowu reagował. */
  const handleMouseUpRef = useRef(handleMouseUp);
  handleMouseUpRef.current = handleMouseUp;
  useEffect(() => {
    const onWindowPointerUp = () => {
      handleMouseUpRef.current();
    };
    window.addEventListener("pointerup", onWindowPointerUp, true);
    window.addEventListener("mouseup", onWindowPointerUp, true);
    return () => {
      window.removeEventListener("pointerup", onWindowPointerUp, true);
      window.removeEventListener("mouseup", onWindowPointerUp, true);
    };
  }, []);

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

    // Ctrl/Cmd + wheel: vertical pan (wheel up → pan up / content moves up on screen)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const dy = wheelDeltaToPixels(e.deltaY, e.deltaMode) * WHEEL_PAN_SENSITIVITY;
      setPan(p => ({ x: p.x, y: p.y - dy }));
      return;
    }

    // Shift + wheel: horizontal pan (wheel up → left, wheel down → right)
    if (e.shiftKey) {
      e.preventDefault();
      const primary = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const dx = wheelDeltaToPixels(primary, e.deltaMode) * WHEEL_PAN_SENSITIVITY;
      setPan(p => ({ x: p.x - dx, y: p.y }));
      return;
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
          setShapes(p => {
            const n = [...p];
            const done = finalizePolygonLinearDrawingOpen(n, drawingShapeIdx);
            if (done) n[drawingShapeIdx] = done;
            return n;
          });
        } else {
          setShapes(p => { const n = [...p]; const sh = { ...n[drawingShapeIdx], drawingFinished: true }; n[drawingShapeIdx] = sh; return n; });
        }
      }
      setDrawingShapeIdx(null); setMode("select"); return;
    }
    const w = getWorldPos(e);
    if (activeLayer === 2 || activeLayer === 3) {
      const dspHit = hitTestDesignSlopePoint(w);
      if (dspHit) {
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          shapeIdx: -1,
          pointIdx: -1,
          edgeIdx: -1,
          designSlopePointId: dspHit.id,
        });
        return;
      }
    }
    if (activeLayer === 6) {
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
    if (activeLayer === 4 || activeLayer === 5) {
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
      const l1vL3 = hitTestLayer1BoundaryVertex(w);
      if (l1vL3) {
        setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: l1vL3.shapeIdx, pointIdx: l1vL3.pointIdx, edgeIdx: -1 });
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
    if (activeLayer === 2) {
      const l1v = hitTestLayer1BoundaryVertex(w);
      if (l1v) {
        setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: l1v.shapeIdx, pointIdx: l1v.pointIdx, edgeIdx: -1 });
        return;
      }
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
  }, [getWorldPos, hitTestPoint, hitTestHeightPoint, hitTestDesignSlopePoint, hitTestLayer1BoundaryVertex, hitTestArcPointGlobal, hitTestEdge, hitTestShape, hitTestPattern, shapes, drawingShapeIdx, activeLayer, zoom, viewFilter, pathSegmentSideSelection, worldToScreen]);

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
      if (
        isLinearElement(shape) &&
        isPolygonLinearElement(shape) &&
        (shape.closed || shape.linearOpenStripOutline) &&
        pts.length >= 4
      ) {
        // Wall/kerb/foundation stored as strip outline: dim hit follows centerline midpoints (linearElements.ts)
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
      if (isLinearElement(shape) && !shape.closed && !shape.linearOpenStripOutline && pts.length >= 2) {
        // Polyline linear elements (centerline storage): labels at midpoint + offset 14
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
      const edgeLabelOffset = 42;
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
      const targetEl = e.target as HTMLElement;
      const tag = targetEl?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || targetEl?.isContentEditable) {
        if (e.key === "Escape") {
          setEditingDim(null);
          setEditingGeodesyCard(null);
          setPointOffsetAlongLinePick(null);
          setPointOffsetAlongLineModal(null);
        }
        return;
      }
      // Arrow keys: pan canvas (Shift = larger step). Skip with Ctrl/Meta/Alt so browser/UI shortcuts keep working.
      if (
        (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        const step = e.shiftKey ? ARROW_PAN_STEP_PX * 3 : ARROW_PAN_STEP_PX;
        if (e.key === "ArrowLeft") setPan(p => ({ ...p, x: p.x + step }));
        else if (e.key === "ArrowRight") setPan(p => ({ ...p, x: p.x - step }));
        else if (e.key === "ArrowUp") setPan(p => ({ ...p, y: p.y + step }));
        else setPan(p => ({ ...p, y: p.y - step }));
        return;
      }
      // Layer shortcuts: 1–6 → switch layer
      if (["1", "2", "3", "4", "5", "6"].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
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
      if (e.key === "Tab" && drawingShapeIdx !== null && mode === "drawWall") {
        const ds = shapes[drawingShapeIdx];
        if (ds?.elementType === "wall" && ds.calculatorInputs?.wallDrawBaseline) {
          e.preventDefault();
          setShapes(p => {
            const n = [...p];
            const sh = { ...n[drawingShapeIdx] };
            const cur = sh.calculatorInputs?.wallDrawFace === "right" ? "right" : "left";
            const nextFace = cur === "left" ? "right" : "left";
            const wb = sh.calculatorInputs?.wallBaselinePolyline as Point[] | undefined;
            const inputs = { ...(sh.calculatorInputs ?? {}), wallDrawFace: nextFace };
            if (wb && wb.length >= 2) {
              const thicknessM = getPolygonThicknessM({ ...sh, calculatorInputs: inputs });
              const thicknessPx = toPixels(thicknessM);
              const half = thicknessPx / 2;
              const centerPts = baselineFacePolylineToCenterline(wb, half, nextFace);
              if (centerPts.length >= 2) {
                const outline = computeThickPolyline(centerPts, thicknessPx);
                if (outline.length >= 4) {
                  sh.points = outline;
                  sh.linearOpenStripOutline = true;
                  sh.calculatorInputs = inputs;
                  n[drawingShapeIdx] = sh;
                  return n;
                }
              }
            }
            sh.calculatorInputs = inputs;
            n[drawingShapeIdx] = sh;
            return n;
          });
          return;
        }
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
          if (s && s.points.length >= 2 && isPolygonLinearElement(s)) {
            saveHistory();
            setShapes(p => {
              const n = [...p];
              const done = finalizePolygonLinearDrawingOpen(n, drawingShapeIdx);
              if (done) n[drawingShapeIdx] = done;
              return n;
            });
          }
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
        if (drawingShapeIdx !== null) return;
        const siDel =
          selectedShapeIdx ??
          (activeLayer === 3 ? (objectCardShapeIdx ?? selectedPattern?.shapeIdx ?? null) : null);
        if (siDel !== null && shapes[siDel]) {
          deleteLayer2ElementFromContext(siDel);
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [mode, selectedShapeIdx, drawingShapeIdx, selectedPoints, saveHistory, undo, shapes, pathSegmentSideSelection, arcDragInfo, measureStart, activeLayer, geodesyEnabled, deleteLayer2ElementFromContext, objectCardShapeIdx, selectedPattern]);

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
    setShapes(p => [...p, factory(cx, cy, (activeLayer === 3 || activeLayer === 4 || activeLayer === 5 ? 2 : activeLayer) as LayerID)]);
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
        const label = (shapeInputs.name || "").trim() || t(`project:${projectShapeToolbarLabelKey(type)}`);
        if (type === "square") addShape((cx2, cy2, l) => ({ ...makeSquare(cx2, cy2, l, parseFloat(shapeInputs.side) || 4), label }));
        else if (type === "rectangle") addShape((cx2, cy2, l) => ({ ...makeRectangle(cx2, cy2, l, parseFloat(shapeInputs.width) || 6, parseFloat(shapeInputs.height) || 4), label }));
        else if (type === "triangle") addShape((cx2, cy2, l) => ({ ...makeTriangle(cx2, cy2, l, parseFloat(shapeInputs.base) || 5, parseFloat(shapeInputs.height) || 4), label }));
        else if (type === "trapezoid") addShape((cx2, cy2, l) => ({ ...makeTrapezoid(cx2, cy2, l, parseFloat(shapeInputs.top) || 3, parseFloat(shapeInputs.bottom) || 6, parseFloat(shapeInputs.height) || 4), label }));
        else if (type === "pentagon") addShape((cx2, cy2, l) => ({ ...makeRegularPolygon(cx2, cy2, l, 5, parseFloat(shapeInputs.side) || 4), label }));
        else if (type === "hexagon") addShape((cx2, cy2, l) => ({ ...makeRegularPolygon(cx2, cy2, l, 6, parseFloat(shapeInputs.side) || 4), label }));
        else if (type === "octagon") addShape((cx2, cy2, l) => ({ ...makeRegularPolygon(cx2, cy2, l, 8, parseFloat(shapeInputs.side) || 4), label }));
        else if (type === "circle") addShape((cx2, cy2, l) => ({ ...makeCircle(cx2, cy2, l, parseFloat(shapeInputs.diameter) || 4), label }));
        setShapeCreationModal(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shapeCreationModal, shapeInputs, addShape, t]);

  const removePoint = (si: number, pi: number) => {
    removeEntryAndLinked({ si, pi });
  };

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
        if (!s) continue;
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
            const pts = s.points;
            const seg = stripPolygonEdgeToSegmentIndex(pts, edgeIdx);
            if (seg !== null && isPolygonLinearStripOutline(s)) {
              const edgeArcs = s.edgeArcs ? [...s.edgeArcs] : [];
              const leftEi = seg;
              const arcs = (edgeArcs[leftEi] ?? []).filter(a => a.id !== arcId);
              edgeArcs[leftEi] = arcs.length > 0 ? arcs : null;
              s = { ...s, edgeArcs };
              s = applyStripParallelEdgeArcSync(s);
            } else {
              const edgeArcs = s.edgeArcs ? [...s.edgeArcs] : [];
              const arcs = (edgeArcs[edgeIdx] ?? []).filter(a => a.id !== arcId);
              edgeArcs[edgeIdx] = arcs.length > 0 ? arcs : null;
              s = { ...s, edgeArcs };
            }
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

    // Polygon wall/kerb/foundation (closed strip): map edge to segment and remove paired outline points
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

    // Open strip wall/kerb/foundation: rebuild from merged centerline
    if (isPolygonLinearElement(s) && s.linearOpenStripOutline && nPts >= 6) {
      const segIdx = openStripEdgeToCenterSegment(pts, edgeIdx);
      if (segIdx === null) return;
      const tpx = toPixels(getPolygonThicknessM(s));
      const newOutline = removeOpenStripSegmentAndRebuild(pts, segIdx, tpx);
      if (!newOutline || newOutline.length < 4) return;
      const segLengths = polygonToSegmentLengths(newOutline);
      setShapes(p => {
        const n = [...p];
        const sh = { ...n[si] };
        sh.points = newOutline;
        sh.linearOpenStripOutline = true;
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
        if (isGroundworkLinear(sh) && sh.groundworkBurialDepthM && sh.groundworkBurialDepthM.length === pts.length) {
          sh.groundworkBurialDepthM = sh.groundworkBurialDepthM.filter((_, i) => i !== 1);
        }
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
        if (isGroundworkLinear(sh) && sh.groundworkBurialDepthM && sh.groundworkBurialDepthM.length === pts.length) {
          sh.groundworkBurialDepthM = sh.groundworkBurialDepthM.slice(0, -1);
        }
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
      const gbFull = isGroundworkLinear(s) ? (s.groundworkBurialDepthM || pts.map(() => 0)) : null;
      const baseLabel = s.label || (s.elementType === "fence" ? "Fence" : s.elementType === "wall" ? "Wall" : s.elementType === "kerb" ? "Kerb" : "Foundation");
      const shape2: Shape = {
        ...s,
        points: pts2,
        label: `${baseLabel} 2`,
        heights: (s.heights || []).slice(edgeIdx + 1),
        ...(gbFull ? { groundworkBurialDepthM: gbFull.slice(edgeIdx + 1) } : {}),
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
        if (gbFull) sh1.groundworkBurialDepthM = gbFull.slice(0, edgeIdx + 1);
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
    const shRef = shapes[si];
    const denseRef =
      shRef && isLinearElement(shRef) && isPolygonLinearStripOutline(shRef) && shRef.linearOpenStripOutline
        ? computeLinearElementFillOutline(shRef)
        : undefined;
    const pt = shRef ? getLinearElementVertexGripWorld(shRef, pi, denseRef) : shapes[si].points[pi];
    const th = SNAP_MAGNET_PX / zoom * (PIXELS_PER_METER / 80);
    const out: { si: number; pi: number }[] = [];
    for (let osi = 0; osi < shapes.length; osi++) {
      if (osi === si) continue;
      if (!shapeLayerMatchesActiveCanvasLayer(shapes[osi].layer)) continue;
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
      if (!shapeLayerMatchesActiveCanvasLayer(shapes[osi].layer)) continue;
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
      if (!shapeLayerMatchesActiveCanvasLayer(shapes[osi].layer)) continue;
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
      if (!shapeLayerMatchesActiveCanvasLayer(shapes[osi].layer)) continue;
      const s = shapes[osi];
      for (let pi = 0; pi < s.points.length; pi++) {
        if (!isCircleArcHandlesOnlyShape(s) && distance(worldPos, s.points[pi]) < th) out.push({ si: osi, pi });
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
          if (isGroundworkLinear(s)) {
            const g0 = s.groundworkBurialDepthM || pts.map(() => 0);
            const gNew = (g0[e.edgeIdx] ?? 0) * (1 - e.t) + (g0[j] ?? 0) * e.t;
            updates.groundworkBurialDepthM = [...g0.slice(0, insertIdx), gNew, ...g0.slice(insertIdx)];
          }
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
          const oldN = pts.length;
          if (s.calculatorInputs) {
            const ci = { ...s.calculatorInputs, ...updates.calculatorInputs };
            const newFse = remapFrameSidesEnabledAfterVertexInsert(ci.frameSidesEnabled as boolean[] | undefined, oldN, e.edgeIdx, insertIdx);
            if (newFse) ci.frameSidesEnabled = newFse;
            const fle = shiftMyFrameLinksAfterEdgeInsert(ci.frameLinkedEdges as FrameLinkedEdgeEntry[] | undefined, e.edgeIdx);
            if (fle) ci.frameLinkedEdges = fle;
            updates.calculatorInputs = ci;
          }
          n[osi] = { ...s, ...updates };
          patchOtherShapesFrameLinksAfterVertexInsert(n, osi, e.edgeIdx);
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
      const oldN = s.points.length;
      const insertIdx = edgeIdx + 1;
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
      if (s.calculatorInputs) {
        const ci = { ...s.calculatorInputs };
        const newFse = remapFrameSidesEnabledAfterVertexInsert(ci.frameSidesEnabled as boolean[] | undefined, oldN, edgeIdx, insertIdx);
        if (newFse) ci.frameSidesEnabled = newFse;
        const fle = shiftMyFrameLinksAfterEdgeInsert(ci.frameLinkedEdges as FrameLinkedEdgeEntry[] | undefined, edgeIdx);
        if (fle) ci.frameLinkedEdges = fle;
        s.calculatorInputs = ci;
      }
      patchOtherShapesFrameLinksAfterVertexInsert(n, si2, edgeIdx);
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
      const si = m.moveShapeIdx;
      const pi = m.movePointIdx;
      const anchor = p[m.anchorShapeIdx]?.points[m.anchorPointIdx];
      const cur = p[si]?.points[pi];
      if (!anchor || !cur) return p;
      const vx = cur.x - anchor.x;
      const vy = cur.y - anchor.y;
      const L = Math.hypot(vx, vy);
      if (L < 1e-9) return p;
      const ux = vx / L;
      const uy = vy / L;
      const newPxLen = toPixels(val);
      const newPos = { x: anchor.x + ux * newPxLen, y: anchor.y + uy * newPxLen };
      let n = moveVertexToTargetInShapes(p, si, pi, newPos, linkedGroups, null);
      const s = n[si];
      if (s && s.linkedShapeIdx != null && n[s.linkedShapeIdx]) {
        n = [...n];
        n[s.linkedShapeIdx] = { ...n[s.linkedShapeIdx]!, points: [...s.points] };
      }
      return n;
    });
    setPointOffsetAlongLineModal(null);
  };

  const applyHeightEdit = (fromBlur = false, overrideHeights?: string[]) => {
    if (fromBlur && skipBlurRef.current) return;
    if (!editingGeodesyCard) return;
    const { cardInfo, focusGeodesyKey } = editingGeodesyCard;
    const vals = overrideHeights ?? heightValues;
    saveHistory();
    setShapes(p => {
      let n = [...p];
      for (let rowIdx = 0; rowIdx < cardInfo.entries.length; rowIdx++) {
        const entry = cardInfo.entries[rowIdx];
        if (
          focusGeodesyKey != null &&
          !entry.points.some(p => geoEntryKey(p) === focusGeodesyKey)
        ) {
          continue;
        }
        const valCm = parseFloat(vals[rowIdx] ?? "");
        if (isNaN(valCm)) continue;
        const val = valCm / 100;
        for (const pt of entry.points) {
          if (focusGeodesyKey != null && geoEntryKey(pt) !== focusGeodesyKey) continue;
          if (pt.isVertex && pt.pointIdx != null) {
            const s = { ...n[pt.shapeIdx] };
            const nh = [...(s.heights || s.points.map(() => 0))];
            while (nh.length < s.points.length) nh.push(0);
            nh[pt.pointIdx] = val;
            s.heights = nh;
            if (s.layer === 2) {
              const ov = [...(s.heightManualOverride ?? s.points.map(() => false))];
              while (ov.length < s.points.length) ov.push(false);
              ov[pt.pointIdx] = true;
              s.heightManualOverride = ov;
            }
            n[pt.shapeIdx] = s;
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
      let eventIdForLinkedPlan = linkedEventId;
      const planId = currentPlanIdRef.current;
      if (!eventIdForLinkedPlan && planId) {
        try {
          const row = await getPlanRow(supabase, planId, companyId);
          eventIdForLinkedPlan = row?.event_id ?? null;
        } catch {
          eventIdForLinkedPlan = null;
        }
      }

      if (eventIdForLinkedPlan) {
        if (!window.confirm(t("project:sync_event_confirm"))) {
          return;
        }
        await syncCanvasToEvent({
          supabase,
          eventId: eventIdForLinkedPlan,
          companyId,
          userId: user?.id,
          shapes,
        });
        clearDraft();
        navigate(`/events/${eventIdForLinkedPlan}`);
        return;
      }

      const eventId = await submitProject({
        shapes,
        projectSettings,
        supabase,
        companyId,
        userId: user?.id,
      });
      clearDraft();
      if (planId) {
        try {
          await linkPlanToEvent(supabase, planId, eventId, companyId);
        } catch {
          // non-fatal
        }
      }
      navigate(`/events/${eventId}`);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : err && typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Failed to create project";
      alert(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const LAYER_KEYS: Record<number, string> = {
    1: "garden_label",
    2: "elements_label",
    3: "pattern_label",
    4: "wykop_label",
    5: "preparation_label",
    6: "adjustment_label",
  };
  const PDF_PAGE_LABEL_KEYS: Record<number, string> = {
    ...LAYER_KEYS,
    101: "pdf_geodesy_layer1_label",
    102: "pdf_geodesy_layer2_label",
  };

  const handleExportPdf = async (layers: number[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const restoreLayer = prevLayerBeforeGeodesyPreviewRef.current ?? activeLayer;
    prevLayerBeforeGeodesyPreviewRef.current = null;
    const restorePan = { ...pan };
    const restoreZoom = zoom;
    const canvasLogicalW = geodesyPreviewCanvasLock?.w ?? canvasSize.w;
    const canvasLogicalH = geodesyPreviewCanvasLock?.h ?? canvasSize.h;
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
        const layer = layers[i];
        if (layer === 101) {
          setPdfGeodesyExportLayer(1);
          setActiveLayer(1);
        } else if (layer === 102) {
          setPdfGeodesyExportLayer(2);
          setActiveLayer(2);
        } else {
          setPdfGeodesyExportLayer(null);
          setActiveLayer(layer as ActiveLayer);
        }
        const fit =
          layer === 101 || layer === 102
            ? computeGeodesyPdfFitCamera(shapes, designSlopePoints, viewFilter, canvasLogicalW, canvasLogicalH)
            : computePdfFitCamera(shapes, designSlopePoints, layer, viewFilter, canvasLogicalW, canvasLogicalH);
        if (fit) {
          flushSync(() => {
            setPan(fit.pan);
            setZoom(fit.zoom);
          });
        } else {
          flushSync(() => {
            setPan({ x: canvasLogicalW / 2, y: canvasLogicalH / 2 });
            setZoom(1);
          });
        }
        const placement = computePdfImagePlacement({
          pdfWidthMm: pdfWidth,
          pdfHeightMm: pdfHeight,
          marginMm: margin,
          headerHmm: headerH,
          canvasBufferW: canvas.width,
          canvasBufferH: canvas.height,
          canvasLogicalW: canvasLogicalW,
          contentWidthFraction: 1,
        });
        pdfExportLayoutRef.current = {
          mmPerLogicalPx: placement.mmPerLogicalPx,
          legendX_mm: placement.legendX_mm,
          legendW_mm: placement.legendW_mm,
        };
        await waitPaint();
        const imgData = canvas.toDataURL("image/png");
        if (i > 0) pdf.addPage();
        pdf.setFontSize(11);
        const isLightPdf = currentTheme?.id === "light";
        pdf.setTextColor(isLightPdf ? 30 : 240, isLightPdf ? 41 : 240, isLightPdf ? 59 : 250);
        pdf.text(t(`project:${PDF_PAGE_LABEL_KEYS[layer] ?? "garden_label"}`), margin, margin + 8);
        pdf.addImage(imgData, "PNG", placement.imageX_mm, placement.imageY_mm, placement.drawW_mm, placement.drawH_mm);
      }
      const title = projectSettings.title?.trim() || "plan";
      pdf.save(`plan_${title.replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`);
      setShowPdfExportModal(false);
    } finally {
      isExportingRef.current = false;
      setIsExportingPdf(false);
      pdfExportLayoutRef.current = null;
      setPdfGeodesyExportLayer(null);
      setActiveLayer(restoreLayer);
      setPan(restorePan);
      setZoom(restoreZoom);
      setShowGeodesyPrintPreview(false);
      setGeodesyPreviewCanvasLock(null);
      setHiddenGeodesyEntries(new Set());
      setPendingPdfLayers([]);
      setGeodesyPreviewListHighlightKey(null);
    }
  };

  const handlePlanPdfLayersConfirm = (layers: number[]) => {
    const exportLayers = layers.filter((l) => l !== 6);
    if (exportLayers.length === 0) return;
    const hasGeo = exportLayers.some((l) => l === 101 || l === 102);
    if (hasGeo) {
      prevLayerBeforeGeodesyPreviewRef.current = activeLayer;
      setPendingPdfLayers(exportLayers);
      setHiddenGeodesyEntries(new Set());
      setGeodesyPreviewListHighlightKey(null);
      setGeodesyPreviewCanvasLock({ w: canvasSize.w, h: canvasSize.h });
      if (exportLayers.includes(101)) {
        setGeodesyPrintPreviewTargetLayer(1);
        setPdfGeodesyExportLayer(1);
        setActiveLayer(1);
      } else {
        setGeodesyPrintPreviewTargetLayer(2);
        setPdfGeodesyExportLayer(2);
        setActiveLayer(2);
      }
      setShowPdfExportModal(false);
      setShowGeodesyPrintPreview(true);
    } else {
      void handleExportPdf(exportLayers);
    }
  };

  const closeGeodesyPrintPreview = () => {
    setShowGeodesyPrintPreview(false);
    setGeodesyPreviewCanvasLock(null);
    setPdfGeodesyExportLayer(null);
    setPendingPdfLayers([]);
    setHiddenGeodesyEntries(new Set());
    setGeodesyPreviewListHighlightKey(null);
    const back = prevLayerBeforeGeodesyPreviewRef.current;
    prevLayerBeforeGeodesyPreviewRef.current = null;
    if (back != null) setActiveLayer(back);
  };

  const toggleGeodesyPreviewHiddenKeys = (keys: string[]) => {
    setHiddenGeodesyEntries(prev => {
      const next = new Set(prev);
      const allHidden = keys.length > 0 && keys.every(k => next.has(k));
      for (const k of keys) {
        if (allHidden) next.delete(k);
        else next.add(k);
      }
      return next;
    });
    if (keys.length > 0) setGeodesyPreviewListHighlightKey(keys[0]);
  };

  const handleGeodesyPreviewImageLogicalClick = (logicalX: number, logicalY: number) => {
    const layerForHit: ActiveLayer =
      showGeodesyPrintPreview && !isExportingPdf
        ? ((pdfGeodesyExportLayer ?? geodesyPrintPreviewTargetLayer) as ActiveLayer)
        : activeLayer;
    const gLf = (s: Shape) => {
      if (s.layer === 1) return layerForHit === 1;
      return layerForHit === 2 || layerForHit === 3 || layerForHit === 6;
    };
    const geodesyFilter = (s: Shape) => {
      if (!gLf(s)) return false;
      if (!passesViewFilter(s, viewFilter, layerForHit)) return false;
      if (layerForHit === 6) return s.layer === 1 || s.layer === 2;
      return s.layer === layerForHit;
    };
    const geodesyHiddenActive =
      showGeodesyPrintPreview || (isExportingPdf && pdfGeodesyExportLayer != null);
    const geodesyHiddenKeysForDraw = geodesyHiddenActive ? hiddenGeodesyEntries : null;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const smartLabelsForPreview = smartGeodesyLabelsRef.current;
    smartLabelsForPreview.update(
      shapes,
      worldToScreen,
      pan,
      zoom,
      canvasSize.w,
      canvasSize.h,
      geodesyFilter,
      ctx,
      editingGeodesyCard?.cardInfo.group ?? null,
      geodesyHiddenKeysForDraw,
      layerForHit,
      currentTheme?.id === "light",
    );
    const cardsInfo = smartLabelsForPreview.getCardsInfo();

    const entry = hitTestGeodesyCardEntryAtScreen(logicalX, logicalY, cardsInfo);
    if (entry?.points?.length) {
      toggleGeodesyPreviewHiddenKeys(entry.points.map(geoEntryKey));
      return;
    }

    const hit = hitTestNearestGeodesyPointAtScreen(logicalX, logicalY, shapes, geodesyFilter, worldToScreen, 22);
    if (!hit) return;
    toggleGeodesyPreviewHiddenKeys([geoEntryKey(hit)]);
  };

  let cursor = "default";
  if (mode === "freeDraw" || drawingShapeIdx !== null) cursor = "crosshair";
  const canStartMeasure = selectedShapeIdx === null && selectedPoints.length === 0 && !selectionRect && !editingDim && !rotateInfo && !patternDragInfo && !patternRotateInfo && !shapeDragInfo && !edgeDragInfo;
  const measureAllowed = activeLayer === 1 || activeLayer === 2 || activeLayer === 3 || activeLayer === 6;
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
        {/* Row 1: Layers */}
        <div className="toolbar-row">
          <div className="tool-group">
            <div ref={layersDropdownRef} style={{ position: "relative" }}>
              <button type="button" className={`dropdown-trigger ${layersDropdownOpen ? "active" : ""}`} onClick={() => setLayersDropdownOpen(v => !v)}>
                <span
                  className={`layer-dot ${
                    activeLayer === 1 ? "garden"
                      : activeLayer === 2 ? "elements"
                      : activeLayer === 3 ? "pattern"
                      : activeLayer === 4 ? "wykop"
                      : activeLayer === 5 ? "preparation"
                      : "adjustment"
                  }`}
                />
                {t(`project:${LAYER_KEYS[activeLayer] ?? "toolbar_layers"}`)}
                <svg className="dropdown-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {layersDropdownOpen && (
                <div style={{ ...layersDropdownPanelStyle, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                  {[
                    { layer: 1 as ActiveLayer, key: "garden_label", dotClass: "garden", count: l1Count },
                    { layer: 2 as ActiveLayer, key: "elements_label", dotClass: "elements", count: l2Count },
                    { layer: 3 as ActiveLayer, key: "pattern_label", dotClass: "pattern", count: null },
                    { layer: 4 as ActiveLayer, key: "wykop_label", dotClass: "wykop", count: null },
                    { layer: 5 as ActiveLayer, key: "preparation_label", dotClass: "preparation", count: null },
                    { layer: 6 as ActiveLayer, key: "adjustment_label", dotClass: "adjustment", count: null },
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
          </div>
          <div className="tb-spacer" />
        </div>

        {/* Row 2: Tools + Drawing + View filters + Delete + Counter — scrollable on mobile */}
        <div className={`toolbar-row ${isMobile ? "toolbar-row-scroll" : ""}`}>
          {/* Mode dropdown: Select, Scale, View (Rysuj jest obok kształtów na warstwach 1–2) */}
          <div className="tool-group">
            <div ref={modeDropdownRef} style={{ position: "relative" }}>
              <button type="button" className={`dropdown-trigger ${modeDropdownOpen || mode === "select" || mode === "scale" || mode === "move" ? "active" : ""}`} onClick={() => setModeDropdownOpen(v => !v)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {mode === "scale" && <><path d="M21 3L3 21" /><path d="M21 3h-6" /><path d="M21 3v6" /><path d="M3 21h6" /><path d="M3 21v-6" /></>}
                  {mode === "move" && <><path d="M5 9l-3 3 3 3" /><path d="M9 5l3-3 3 3" /><path d="M15 19l-3 3-3-3" /><path d="M19 9l3 3-3 3" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" /></>}
                  {(mode === "select" || mode === "freeDraw" || (mode !== "scale" && mode !== "move")) && <><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" /></>}
                </svg>
                {t(`project:${toolbarModeLabelKey(mode)}`)}
                <svg className="dropdown-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {modeDropdownOpen && (
                <div style={{ ...modeDropdownPanelStyle, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                  {([
                    { mode: "select" as const, key: "toolbar_select" },
                    { mode: "scale" as const, key: "toolbar_scale" },
                    { mode: "move" as const, key: "toolbar_view" },
                  ] as const).map(({ mode: m, key }) => {
                    const rowActive = isPrimaryToolbarModeActive(mode, m);
                    return (
                    <button key={key} type="button"
                      onClick={() => {
                        if (m === "select") { setDrawingShapeIdx(null); setMode("select"); }
                        else if (m === "scale") { setDrawingShapeIdx(null); setMode("scale"); }
                        else if (m === "move") { setDrawingShapeIdx(null); setMode("move"); setSelectedShapeIdx(null); }
                        setModeDropdownOpen(false);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px",
                        border: "none", background: rowActive ? "rgba(108,92,231,0.2)" : "transparent", color: "#dfe6f0",
                        cursor: "pointer", fontSize: 13, fontFamily: "inherit", borderRadius: 4, textAlign: "left",
                      }}
                      onMouseEnter={(e) => { if (!rowActive) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = rowActive ? "rgba(108,92,231,0.2)" : "transparent"; }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, flexShrink: 0 }}>
                        {m === "select" && <><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" /></>}
                        {m === "scale" && <><path d="M21 3L3 21" /><path d="M21 3h-6" /><path d="M21 3v6" /><path d="M3 21h6" /><path d="M3 21v-6" /></>}
                        {m === "move" && <><path d="M5 9l-3 3 3 3" /><path d="M9 5l3-3 3 3" /><path d="M15 19l-3 3-3-3" /><path d="M19 9l3 3-3 3" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" /></>}
                      </svg>
                      {t(`project:${key}`)}
                    </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="tb-sep" />

          {(activeLayer === 1 || activeLayer === 2) && (
            <>
              <div className="tool-group">
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
              <div className="tb-sep" />
            </>
          )}

          {/* Drawing tools */}
          <div className="tool-group">
            {(activeLayer === 1 || activeLayer === 2) && (
              <button
                type="button"
                className={`dropdown-trigger ${mode === "freeDraw" ? "active" : ""}`}
                onClick={() => { setMode("freeDraw"); setSelectedShapeIdx(null); }}
                title={t("project:toolbar_draw")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19l7-7 3 3-7 7-3-3z" />
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                  <path d="M2 2l7.586 7.586" />
                  <circle cx="11" cy="11" r="2" />
                </svg>
                {t("project:toolbar_draw")}
              </button>
            )}
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
                  <div style={{ ...shapesDropdownPanelStyle, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                    {[
                      { type: "square" as const, key: "toolbar_shape_square" },
                      { type: "rectangle" as const, key: "toolbar_shape_rectangle" },
                      { type: "triangle" as const, key: "toolbar_shape_triangle" },
                      { type: "trapezoid" as const, key: "toolbar_shape_trapezoid" },
                      { type: "pentagon" as const, key: "toolbar_shape_pentagon" },
                      { type: "hexagon" as const, key: "toolbar_shape_hexagon" },
                      { type: "octagon" as const, key: "toolbar_shape_octagon" },
                      { type: "circle" as const, key: "toolbar_shape_circle" },
                    ].map(({ type, key }) => (
                      <button key={key} type="button" onClick={() => { setShapeCreationModal({ type }); setShapesDropdownOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", background: "transparent", color: "#dfe6f0", cursor: "pointer", fontSize: 13, fontFamily: "inherit", borderRadius: 4, textAlign: "left" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        <ShapeDropdownItemIcon type={type} />
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
                  <div style={{ ...pathDropdownPanelStyle, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
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
                  <div style={{ ...linearDropdownPanelStyle, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
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
                  <div style={{ ...stairsDropdownPanelStyle, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
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
            {(activeLayer === 4 || activeLayer === 5) && (
              <div ref={groundworkDropdownRef} style={{ position: "relative" }}>
                <button type="button" className={`dropdown-trigger ${groundworkDropdownOpen || mode === "drawDrainage" || mode === "drawCanalPipe" || mode === "drawWaterPipe" || mode === "drawCable" ? "active" : ""}`} onClick={() => setGroundworkDropdownOpen(v => !v)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20L20 4" /><circle cx="4" cy="20" r="2" /><circle cx="20" cy="4" r="2" />
                  </svg>
                  {t("project:toolbar_groundwork")}
                  <svg className="dropdown-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {groundworkDropdownOpen && (
                  <div style={{ ...groundworkDropdownPanelStyle, background: "#1a2538", border: "1px solid #1e2b40", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
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
            <button type="button" className="delete-btn" onClick={() => {
              if (selectedShapeIdx == null) return;
              const si = selectedShapeIdx;
              saveHistory();
              setShapes(p => remapShapesAfterShapeDelete(p.filter((_, i) => i !== si), si));
              setLinkedGroups(prev => adjustLinkedGroupsAfterShapeDelete(prev, si));
              setSelectedShapeIdx(null);
              setSelectedPattern(prev => {
                if (!prev) return null;
                if (prev.shapeIdx === si) return null;
                if (prev.shapeIdx > si) return { ...prev, shapeIdx: prev.shapeIdx - 1 };
                return prev;
              });
              setObjectCardShapeIdx(prev => shiftShapeIdxAfterDelete(prev, si));
              setResultsModalShapeIdx(prev => shiftShapeIdxAfterDelete(prev, si));
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              {t("project:toolbar_delete")}
            </button>
          )}
          {selectedShapeIdx !== null && !drawingShapeIdx && <div className="tb-sep" />}

          <div className="shape-counter">
            <span>{activeLayer === 3 || activeLayer === 4 || activeLayer === 5 ? shapes.filter(s => s.layer === 1 || s.layer === 2).length : shapes.filter(s => s.layer === activeLayer).length}</span>
            {" "}{t("project:toolbar_shapes_word")}{" · "}
            <span>{shapes.filter(s => !s.closed && ((activeLayer === 3 || activeLayer === 4 || activeLayer === 5) ? (s.layer === 1 || s.layer === 2) : s.layer === activeLayer)).length}</span>
            {" "}{t("project:toolbar_open_word")}
          </div>
        </div>
      </div>

      {/* Canvas + Summary */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", overflow: "hidden" }}>
      <div ref={containerRef} style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden" }}>
        <canvas ref={canvasRef} style={{
          width: geodesyPreviewCanvasLock?.w ?? canvasSize.w,
          height: geodesyPreviewCanvasLock?.h ?? canvasSize.h,
          cursor,
          display: "block",
          touchAction: "none",
        }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
          onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} />

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
                <div>{t("project:canvas_shortcut_layer_6")}</div>
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
          <div ref={contextMenuRef} style={{ position: "fixed", left: (contextMenuDisplayPos ?? { x: contextMenu.x, y: contextMenu.y }).x, top: (contextMenuDisplayPos ?? { x: contextMenu.x, y: contextMenu.y }).y, background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, padding: 4, zIndex: 100, boxShadow: shadows.xl, minWidth: 160 }}>
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
        {contextMenu && contextMenu.designSlopePointId && (
          <div ref={contextMenuRef} style={{ position: "fixed", left: (contextMenuDisplayPos ?? { x: contextMenu.x, y: contextMenu.y }).x, top: (contextMenuDisplayPos ?? { x: contextMenu.x, y: contextMenu.y }).y, background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, padding: 4, zIndex: 100, boxShadow: shadows.xl, minWidth: 180 }}>
            <div style={{ fontSize: 11, color: CC.text, opacity: 0.9, padding: "4px 8px 6px", borderBottom: `1px solid ${CC.panelBorder}`, marginBottom: 4 }}>
              {t("project:design_slope_point_menu_title")}
            </div>
            <CtxItem
              label={t("project:design_slope_edit_height")}
              color={CC.geo}
              onClick={() => {
                const id = contextMenu.designSlopePointId!;
                const p = designSlopePoints.find(x => x.id === id);
                setDesignSlopeHeightModal({ id, value: p != null ? (p.height * 100).toFixed(2) : "0" });
                setContextMenu(null);
              }}
            />
            <CtxItem
              label={t("project:design_slope_remove")}
              color={CC.danger}
              onClick={() => {
                saveHistory();
                const id = contextMenu.designSlopePointId!;
                setDesignSlopePoints(prev => prev.filter(x => x.id !== id));
                setContextMenu(null);
              }}
            />
          </div>
        )}
        {contextMenu && !contextMenu.patternRotationHandle && !contextMenu.designSlopePointId && (
          <div ref={contextMenuRef} style={{ position: "fixed", left: (contextMenuDisplayPos ?? { x: contextMenu.x, y: contextMenu.y }).x, top: (contextMenuDisplayPos ?? { x: contextMenu.x, y: contextMenu.y }).y, background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, padding: 4, zIndex: 100, boxShadow: shadows.xl, minWidth: 160 }}>
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
              {(() => {
                const s = shapes[contextMenu.shapeIdx];
                if (!s || !isLinearElement(s) || s.closed || s.layer !== 2) return null;
                if (isPathElement(s) || isGroundworkLinear(s)) return null;
                if (s.points.length < 2) return null;
                if (drawingShapeIdx === contextMenu.shapeIdx) return null;
                const linearDrawMode: Mode | null =
                  s.elementType === "fence" ? "drawFence"
                  : s.elementType === "wall" ? "drawWall"
                  : s.elementType === "kerb" ? "drawKerb"
                  : s.elementType === "foundation" ? "drawFoundation"
                  : null;
                if (!linearDrawMode) return null;
                return (
                  <CtxItem
                    label={t("project:ctx_continue_linear_drawing")}
                    color={CC.accent}
                    onClick={() => {
                      const si = contextMenu.shapeIdx;
                      const pi = contextMenu.pointIdx;
                      saveHistory();
                      setShapes(prev => {
                        const n = [...prev];
                        const sh0 = n[si];
                        if (!sh0) return prev;
                        let sh: Shape = { ...sh0 };
                        const clicked = { ...sh.points[pi] };
                        if (isPolygonLinearElement(sh) && sh.linearOpenStripOutline && isOpenStripPolygonOutline(sh.points)) {
                          const cl = extractCenterlineFromOpenStripOutline(sh.points);
                          if (cl.length < 2) return prev;
                          let chain = cl.map(p => ({ ...p }));
                          const d0 = distance(clicked, cl[0]);
                          const d1 = distance(clicked, cl[cl.length - 1]);
                          if (d0 < d1) chain.reverse();
                          const h0 = sh.heights?.[0] ?? 0;
                          const segLengths: number[] = [];
                          for (let i = 0; i < chain.length - 1; i++) segLengths.push(toMeters(distance(chain[i], chain[i + 1])));
                          const inputs: Record<string, unknown> = { ...sh.calculatorInputs, segmentLengths: segLengths };
                          if (sh.elementType === "wall") {
                            const defaultH = parseFloat(String(sh.calculatorInputs?.height ?? "1")) || 1;
                            inputs.segmentHeights = segLengths.map(() => ({ startH: defaultH, endH: defaultH }));
                          }
                          sh = {
                            ...sh,
                            points: chain,
                            linearOpenStripOutline: undefined,
                            heights: chain.map(() => h0),
                            drawingFinished: undefined,
                            edgeArcs: undefined,
                            calculatorInputs: inputs,
                          };
                        } else {
                          let pts = sh.points.map(p => ({ ...p }));
                          let heights = sh.heights;
                          const p0 = pts[0];
                          const pL = pts[pts.length - 1];
                          const d0 = distance(clicked, p0);
                          const d1 = distance(clicked, pL);
                          if (d0 < d1) {
                            pts = [...pts].reverse();
                            if (heights && heights.length === pts.length) heights = [...heights].reverse();
                          }
                          sh = { ...sh, points: pts, heights: heights ?? sh.heights, drawingFinished: undefined };
                        }
                        n[si] = sh;
                        return n;
                      });
                      setMode(linearDrawMode);
                      setDrawingShapeIdx(si);
                      setSelectedShapeIdx(si);
                      setContextMenu(null);
                    }}
                  />
                );
              })()}
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
              {(activeLayer === 2 || activeLayer === 3) &&
                shapes[contextMenu.shapeIdx]?.layer === 1 &&
                shapes[contextMenu.shapeIdx]?.closed &&
                contextMenu.pointIdx >= 0 && (
                  <CtxItem
                    label={t("project:ctx_add_design_slope_point")}
                    color="#9b59b6"
                    onClick={() => {
                      saveHistory();
                      const si = contextMenu.shapeIdx;
                      const pi = contextMenu.pointIdx;
                      const sh = shapes[si];
                      if (!sh || pi < 0 || pi >= sh.points.length) {
                        setContextMenu(null);
                        return;
                      }
                      const vtx = sh.points[pi]!;
                      const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `dsp-${Date.now()}-${Math.random()}`;
                      setDesignSlopePoints(prev => {
                        const rest = prev.filter(x => !(x.sourceShapeIdx === si && x.pointIdx === pi));
                        return [...rest, { id, x: vtx.x, y: vtx.y, height: 0, sourceShapeIdx: si, pointIdx: pi }];
                      });
                      setContextMenu(null);
                    }}
                  />
                )}
              {shapes[contextMenu.shapeIdx] && (shapes[contextMenu.shapeIdx].layer === 1 || shapes[contextMenu.shapeIdx].layer === 2) && shapes[contextMenu.shapeIdx].points.length > 3 && (
                <CtxItem label="〰 Zmiana na arc point" color={CC.accent} onClick={() => {
                  saveHistory();
                  const si = contextMenu.shapeIdx, pi = contextMenu.pointIdx;
                  const s = shapes[si];
                  const pts = s.points;
                  const n = pts.length;
                  const piOpp = stripOppositeVertexIndex(pts, pi);
                  /** Path ribbon (same 2V layout as strip, but `isPolygonLinearStripOutline` is wall-only). */
                  const pathRibbonArcPair =
                    isPathElement(s) &&
                    Boolean(s.calculatorInputs?.pathIsOutline) &&
                    piOpp != null &&
                    piOpp !== pi;
                  const doPair =
                    piOpp != null &&
                    piOpp !== pi &&
                    (isPolygonLinearStripOutline(s) || pathRibbonArcPair);
                  if (doPair) {
                    const r1 = mergeOneVertexToArcPointState(s, pi);
                    if (!r1) {
                      setContextMenu(null);
                      return;
                    }
                    const pi2 = piOpp > pi ? piOpp - 1 : piOpp;
                    const r2 = mergeOneVertexToArcPointState(r1.shape, pi2);
                    if (!r2) {
                      if (pathRibbonArcPair) {
                        setContextMenu(null);
                        return;
                      }
                      setShapes(p => {
                        const n2 = [...p];
                        n2[si] = r1.shape;
                        return n2;
                      });
                      setLinkedGroups(lg =>
                        mapLinkedGroupsAfterVertexToArc(lg, si, n, pi, r1.newEdgeIdx, r1.newArcId, r1.mergedEdgeIdx),
                      );
                      setContextMenu(null);
                      return;
                    }
                    setShapes(p => {
                      const n2 = [...p];
                      let sh = { ...r2.shape };
                      if (pathRibbonArcPair && isPathElement(sh) && sh.calculatorInputs?.pathIsOutline) {
                        const cl = extractPathRibbonCenterlineFromOutline(sh.points);
                        if (cl.length >= 2) {
                          const ns = cl.length - 1;
                          const prevSides = sh.calculatorInputs.pathSegmentSides as ("left" | "right")[] | undefined;
                          const defaultSide =
                            prevSides?.find((x) => x === "left" || x === "right") ?? "left";
                          const newSides: ("left" | "right")[] =
                            prevSides && prevSides.length === ns
                              ? prevSides.map((x) => (x === "left" || x === "right" ? x : defaultSide))
                              : (Array(ns).fill(defaultSide) as ("left" | "right")[]);
                          sh = {
                            ...sh,
                            calculatorInputs: {
                              ...sh.calculatorInputs,
                              pathCenterline: cl.map((p) => ({ ...p })),
                              pathCenterlineOriginal: cl.map((p) => ({ ...p })),
                              pathSegmentSides: newSides,
                            },
                          };
                        }
                      }
                      n2[si] = sh;
                      return n2;
                    });
                    setLinkedGroups(lg => {
                      let g = mapLinkedGroupsAfterVertexToArc(lg, si, n, pi, r1.newEdgeIdx, r1.newArcId, r1.mergedEdgeIdx);
                      g = mapLinkedGroupsAfterVertexToArc(g, si, n - 1, pi2, r2.newEdgeIdx, r2.newArcId, r2.mergedEdgeIdx);
                      return g;
                    });
                    setContextMenu(null);
                    return;
                  }
                  const prev = (pi - 1 + n) % n, next = (pi + 1) % n;
                  const A = pts[prev], B = pts[next], V = pts[pi];
                  const { t: chordT } = worldToArcPoint(A, B, V);
                  const arcsPrev = (s.edgeArcs?.[prev] ?? []).map(a => ({ ...a, t: a.t * chordT }));
                  const arcsNext = (s.edgeArcs?.[pi] ?? []).map(a => ({ ...a, t: chordT + (1 - chordT) * a.t }));
                  const placeholder = { id: "__temp__", t: 0.5, offset: 0 };
                  const { t, offset } = worldToArcPointOnCurve(A, B, [...arcsPrev, ...arcsNext, placeholder], placeholder, V);
                  const newArc: ArcPoint = { id: crypto.randomUUID(), t, offset };
                  const newEdgeIdx = pi > 0 ? prev : n - 2;
                  setShapes(p => {
                    const n2 = [...p];
                    let sh = { ...n2[si] };
                    const newPts = pts.filter((_, i) => i !== pi);
                    const arcsPrevM = (sh.edgeArcs?.[prev] ?? []).map(a => ({ ...a, t: a.t * t }));
                    const arcsNextM = (sh.edgeArcs?.[pi] ?? []).map(a => ({ ...a, t: t + (1 - t) * a.t }));
                    const merged = [...arcsPrevM, ...arcsNextM, newArc].sort((a, b) => a.t - b.t);
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
                    if (isGroundworkLinear(sh)) {
                      const gb = (sh.groundworkBurialDepthM || pts.map(() => 0)).filter((_, i) => i !== pi);
                      sh.groundworkBurialDepthM = gb.length ? gb : undefined;
                    }
                    if (sh.elementType === "wall" && sh.calculatorInputs?.segmentHeights) {
                      const inputs = { ...sh.calculatorInputs };
                      const segHeights = [...(inputs.segmentHeights as Array<{ startH: number; endH: number }>)];
                      if (pi < segHeights.length) segHeights.splice(pi, 1);
                      inputs.segmentHeights = segHeights;
                      sh.calculatorInputs = inputs;
                    }
                    sh.lockedEdges = sh.lockedEdges.filter(e => e.idx !== prev && e.idx !== pi).map(e => e.idx > pi ? { ...e, idx: e.idx - 1 } : e);
                    sh.lockedAngles = sh.lockedAngles.filter(a => a !== pi).map(a => a > pi ? a - 1 : a);
                    if (isPolygonLinearStripOutline(sh) || (isPathElement(sh) && Boolean(sh.calculatorInputs?.pathIsOutline))) {
                      sh = applyStripParallelEdgeArcSync(sh);
                    }
                    if (isPathElement(sh) && sh.calculatorInputs?.pathIsOutline) {
                      const cl = extractPathRibbonCenterlineFromOutline(sh.points);
                      if (cl.length >= 2) {
                        const ns = cl.length - 1;
                        const prevSides = sh.calculatorInputs.pathSegmentSides as ("left" | "right")[] | undefined;
                        const defaultSide =
                          prevSides?.find((x) => x === "left" || x === "right") ?? "left";
                        const newSides: ("left" | "right")[] =
                          prevSides && prevSides.length === ns
                            ? prevSides.map((x) => (x === "left" || x === "right" ? x : defaultSide))
                            : (Array(ns).fill(defaultSide) as ("left" | "right")[]);
                        sh = {
                          ...sh,
                          calculatorInputs: {
                            ...sh.calculatorInputs,
                            pathCenterline: cl.map((p) => ({ ...p })),
                            pathCenterlineOriginal: cl.map((p) => ({ ...p })),
                            pathSegmentSides: newSides,
                          },
                        };
                      }
                    }
                    n2[si] = sh; return n2;
                  });
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
              {/* Frame link / unlink between touching shapes */}
              {(() => {
                const si = contextMenu.shapeIdx;
                const s = shapes[si];
                if (!s || !s.closed || s.points.length < 3) return null;
                const hasFrame = getTotalFrameInsetWidthCm(s.calculatorInputs) > 0;
                if (!hasFrame) return null;
                const partners = findAllSharedFrameEdgePartners(shapes, si)
                  .filter(p => getTotalFrameInsetWidthCm(shapes[p.otherIdx]?.calculatorInputs) > 0);
                if (partners.length === 0) return null;
                const existingLinks = (s.calculatorInputs?.frameLinkedEdges ?? []) as { myEdgeIdx: number; otherShapeIdx: number; otherEdgeIdx: number }[];
                const alreadyLinkedOthers = new Set(existingLinks.map(l => l.otherShapeIdx));
                const unlinked = partners.filter(p => !alreadyLinkedOthers.has(p.otherIdx));
                const linked = partners.filter(p => alreadyLinkedOthers.has(p.otherIdx));
                return (
                  <>
                    {unlinked.map(({ otherIdx, edges }) => {
                      const other = shapes[otherIdx];
                      const name = other?.label || other?.calculatorType || other?.elementType || "";
                      return (
                        <CtxItem
                          key={`flink-${otherIdx}`}
                          label={`🔗 Połącz ramki: ${name}`}
                          color={CC.accent}
                          onClick={() => {
                            saveHistory();
                            setShapes(prev => {
                              const n = [...prev];
                              const sA = { ...n[si] };
                              const sB = { ...n[otherIdx] };
                              const inpA = { ...(sA.calculatorInputs ?? {}) };
                              const inpB = { ...(sB.calculatorInputs ?? {}) };
                              const nEdgesA = sA.points.length;
                              const nEdgesB = sB.points.length;
                              const fseA: boolean[] = Array.isArray(inpA.frameSidesEnabled) && (inpA.frameSidesEnabled as boolean[]).length >= nEdgesA
                                ? [...inpA.frameSidesEnabled as boolean[]]
                                : Array.from({ length: nEdgesA }, (_, k) => (Array.isArray(inpA.frameSidesEnabled) ? (inpA.frameSidesEnabled as boolean[])[k] !== false : true));
                              const fseB: boolean[] = Array.isArray(inpB.frameSidesEnabled) && (inpB.frameSidesEnabled as boolean[]).length >= nEdgesB
                                ? [...inpB.frameSidesEnabled as boolean[]]
                                : Array.from({ length: nEdgesB }, (_, k) => (Array.isArray(inpB.frameSidesEnabled) ? (inpB.frameSidesEnabled as boolean[])[k] !== false : true));
                              const linksA: { myEdgeIdx: number; otherShapeIdx: number; otherEdgeIdx: number }[] = [...(inpA.frameLinkedEdges ?? [])];
                              const linksB: { myEdgeIdx: number; otherShapeIdx: number; otherEdgeIdx: number }[] = [...(inpB.frameLinkedEdges ?? [])];
                              for (const { edgeA, edgeB } of edges) {
                                const fseIdxA = (edgeA + 1) % nEdgesA;
                                const fseIdxB = (edgeB + 1) % nEdgesB;
                                if (fseIdxA < fseA.length) fseA[fseIdxA] = false;
                                if (fseIdxB < fseB.length) fseB[fseIdxB] = false;
                                if (!linksA.some(l => l.myEdgeIdx === edgeA && l.otherShapeIdx === otherIdx))
                                  linksA.push({ myEdgeIdx: edgeA, otherShapeIdx: otherIdx, otherEdgeIdx: edgeB });
                                if (!linksB.some(l => l.myEdgeIdx === edgeB && l.otherShapeIdx === si))
                                  linksB.push({ myEdgeIdx: edgeB, otherShapeIdx: si, otherEdgeIdx: edgeA });
                              }
                              inpA.frameSidesEnabled = fseA;
                              inpA.frameLinkedEdges = linksA;
                              inpB.frameSidesEnabled = fseB;
                              inpB.frameLinkedEdges = linksB;
                              n[si] = { ...sA, calculatorInputs: inpA };
                              n[otherIdx] = { ...sB, calculatorInputs: inpB };
                              return n;
                            });
                            setContextMenu(null);
                          }}
                        />
                      );
                    })}
                    {linked.map(({ otherIdx, edges }) => {
                      const other = shapes[otherIdx];
                      const name = other?.label || other?.calculatorType || other?.elementType || "";
                      return (
                        <CtxItem
                          key={`funlink-${otherIdx}`}
                          label={`✂ Rozłącz ramki: ${name}`}
                          color={CC.text}
                          onClick={() => {
                            saveHistory();
                            setShapes(prev => {
                              const n = [...prev];
                              const sA = { ...n[si] };
                              const sB = { ...n[otherIdx] };
                              const inpA = { ...(sA.calculatorInputs ?? {}) };
                              const inpB = { ...(sB.calculatorInputs ?? {}) };
                              const nEdgesA = sA.points.length;
                              const nEdgesB = sB.points.length;
                              const fseA: boolean[] = Array.isArray(inpA.frameSidesEnabled) && (inpA.frameSidesEnabled as boolean[]).length >= nEdgesA
                                ? [...inpA.frameSidesEnabled as boolean[]]
                                : Array.from({ length: nEdgesA }, (_, k) => (Array.isArray(inpA.frameSidesEnabled) ? (inpA.frameSidesEnabled as boolean[])[k] !== false : true));
                              const fseB: boolean[] = Array.isArray(inpB.frameSidesEnabled) && (inpB.frameSidesEnabled as boolean[]).length >= nEdgesB
                                ? [...inpB.frameSidesEnabled as boolean[]]
                                : Array.from({ length: nEdgesB }, (_, k) => (Array.isArray(inpB.frameSidesEnabled) ? (inpB.frameSidesEnabled as boolean[])[k] !== false : true));
                              for (const { edgeA, edgeB } of edges) {
                                const fseIdxA = (edgeA + 1) % nEdgesA;
                                const fseIdxB = (edgeB + 1) % nEdgesB;
                                if (fseIdxA < fseA.length) fseA[fseIdxA] = true;
                                if (fseIdxB < fseB.length) fseB[fseIdxB] = true;
                              }
                              inpA.frameSidesEnabled = fseA;
                              inpA.frameLinkedEdges = ((inpA.frameLinkedEdges ?? []) as any[]).filter((l: any) => l.otherShapeIdx !== otherIdx);
                              inpB.frameSidesEnabled = fseB;
                              inpB.frameLinkedEdges = ((inpB.frameLinkedEdges ?? []) as any[]).filter((l: any) => l.otherShapeIdx !== si);
                              n[si] = { ...sA, calculatorInputs: inpA };
                              n[otherIdx] = { ...sB, calculatorInputs: inpB };
                              return n;
                            });
                            setContextMenu(null);
                          }}
                        />
                      );
                    })}
                  </>
                );
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
              {(activeLayer === 2 || activeLayer === 3) &&
                shapes[contextMenu.shapeIdx]?.layer === 1 &&
                shapes[contextMenu.shapeIdx]?.closed &&
                contextMenu.edgeIdx >= 0 &&
                contextMenu.edgePos !== undefined &&
                contextMenu.edgeT !== undefined &&
                contextMenu.edgeT > 0.02 &&
                contextMenu.edgeT < 0.98 && (
                  <CtxItem
                    label={t("project:ctx_add_design_slope_point_edge")}
                    color="#9b59b6"
                    onClick={() => {
                      saveHistory();
                      const si = contextMenu.shapeIdx;
                      const ei = contextMenu.edgeIdx;
                      const tEdge = contextMenu.edgeT!;
                      const wp = contextMenu.edgePos!;
                      const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `dsp-${Date.now()}`;
                      setDesignSlopePoints(prev => {
                        const rest = prev.filter(
                          x => !(x.sourceShapeIdx === si && x.edgeIdx === ei && Math.abs((x.edgeT ?? 0) - tEdge) < 0.04),
                        );
                        return [...rest, { id, x: wp.x, y: wp.y, height: 0, sourceShapeIdx: si, edgeIdx: ei, edgeT: tEdge }];
                      });
                      setContextMenu(null);
                    }}
                  />
                )}
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
              {contextMenu.edgePos !== undefined && contextMenu.edgeT !== undefined && (() => {
                const sh = shapes[contextMenu.shapeIdx];
                if (!sh) return null;
                const polyOk =
                  !isLinearElement(sh) && !isPathElement(sh) && sh.closed && (sh.layer === 1 || sh.layer === 2);
                const stripWallOk =
                  isPolygonLinearStripOutline(sh) && isLinearElement(sh) && (sh.closed || Boolean(sh.linearOpenStripOutline)) && sh.layer === 2;
                if (!polyOk && !stripWallOk) return null;
                return (
                  <CtxItem label="〰 Dodaj arc point" color={CC.accent} onClick={() => {
                    saveHistory();
                    const si = contextMenu.shapeIdx, ei = contextMenu.edgeIdx;
                    const s0 = shapes[si];
                    const pts = s0.points;
                    const seg = stripPolygonEdgeToSegmentIndex(pts, ei);
                    const placeholder = { id: "__temp__", t: 0.5, offset: 0 };
                    setShapes(p => {
                      const n2 = [...p];
                      let s = { ...n2[si] };
                      const pts2 = s.points;
                      const nPts = pts2.length;
                      if (seg !== null && isPolygonLinearStripOutline(s)) {
                        const par = stripOutlineParallelEdges(pts2, seg);
                        if (!par) {
                          n2[si] = s;
                          return n2;
                        }
                        const leftEi = seg;
                        const onLeft = ei === leftEi;
                        const A = onLeft ? par.leftA : par.rightA;
                        const B = onLeft ? par.leftB : par.rightB;
                        const arcListClicked = s.edgeArcs?.[ei] ?? [];
                        const { t, offset } = worldToArcPointOnCurve(A, B, [...arcListClicked, placeholder], placeholder, contextMenu.edgePos!);
                        const newArc: ArcPoint = { id: crypto.randomUUID(), t, offset };
                        const mergedClicked = [...arcListClicked, newArc].sort((a, b) => a.t - b.t);
                        const ea = s.edgeArcs ? [...s.edgeArcs] : [];
                        while (ea.length < nPts) ea.push(null);
                        const canonicalLeft = onLeft
                          ? mergedClicked
                          : mirrorArcPointsToOppositeChord(par.rightA, par.rightB, par.leftA, par.leftB, mergedClicked);
                        ea[leftEi] = canonicalLeft.length ? canonicalLeft : null;
                        s.edgeArcs = ea;
                        s = applyStripParallelEdgeArcSync(s);
                      } else {
                        const Bidx2 = s.closed ? (ei + 1) % nPts : ei + 1;
                        if (Bidx2 >= nPts) {
                          n2[si] = s;
                          return n2;
                        }
                        const A = pts2[ei], B = pts2[Bidx2];
                        const arcList = s.edgeArcs?.[ei] ?? [];
                        const { t, offset } = worldToArcPointOnCurve(A, B, [...arcList, placeholder], placeholder, contextMenu.edgePos!);
                        const edgeArcs = s.edgeArcs ? [...s.edgeArcs] : [];
                        if (!edgeArcs[ei]) edgeArcs[ei] = [];
                        const arcs = [...(edgeArcs[ei]!), { id: crypto.randomUUID(), t, offset }].sort((a, b) => a.t - b.t);
                        edgeArcs[ei] = arcs;
                        s.edgeArcs = edgeArcs;
                      }
                      n2[si] = s;
                      return n2;
                    });
                    setContextMenu(null);
                  }} />
                );
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
              {!isLinearElement(shapes[contextMenu.shapeIdx]) && shapes[contextMenu.shapeIdx]?.layer === 2 &&
                !contextMenu.adjustmentEmpty && !contextMenu.adjustmentOverflow && !contextMenu.adjustmentOverlap && (
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
                <CtxItem label={t("project:ctx_remove_element")} color={CC.danger} onClick={() => deleteLayer2ElementFromContext(contextMenu.shapeIdx)} />
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
                <CtxItem label={t("project:ctx_remove_element")} color={CC.danger} onClick={() => deleteLayer2ElementFromContext(contextMenu.shapeIdx)} />
              </>
            )}
          </div>
        )}

        {projectSummaryContextMenu !== null && shapes[projectSummaryContextMenu.shapeIdx] && (
          <div ref={projectSummaryMenuRef} style={{ position: "fixed", left: (projectSummaryDisplayPos ?? { x: projectSummaryContextMenu.x, y: projectSummaryContextMenu.y }).x, top: (projectSummaryDisplayPos ?? { x: projectSummaryContextMenu.x, y: projectSummaryContextMenu.y }).y, background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, padding: 4, zIndex: 100, boxShadow: shadows.xl, minWidth: 160 }}>
            <div style={{ fontSize: 11, color: CC.text, opacity: 0.9, padding: "4px 8px 6px", borderBottom: `1px solid ${CC.panelBorder}`, marginBottom: 4 }}>
              {shapes[projectSummaryContextMenu.shapeIdx].label || translateCalculatorTypeLabel(shapes[projectSummaryContextMenu.shapeIdx].calculatorType ?? "", t) || t("project:summary_fallback_element")}
            </div>
            {shapes[projectSummaryContextMenu.shapeIdx]?.calculatorResults && (
              <CtxItem label={`📊 ${t("project:path_view_results")}`} color="#a29bfe" onClick={() => { setResultsModalShapeIdx(projectSummaryContextMenu.shapeIdx); setProjectSummaryContextMenu(null); }} />
            )}
            <CtxItem label={t("project:ctx_remove_element")} color={CC.danger} onClick={() => {
              const si = projectSummaryContextMenu.shapeIdx;
              saveHistory();
              setShapes(p => remapShapesAfterShapeDelete(p.filter((_, i) => i !== si), si));
              setLinkedGroups(prev => adjustLinkedGroupsAfterShapeDelete(prev, si));
              setSelectedShapeIdx(null);
              setSelectedPattern(prev => {
                if (!prev) return null;
                if (prev.shapeIdx === si) return null;
                if (prev.shapeIdx > si) return { ...prev, shapeIdx: prev.shapeIdx - 1 };
                return prev;
              });
              setObjectCardShapeIdx(prev => shiftShapeIdxAfterDelete(prev, si));
              setResultsModalShapeIdx(prev => shiftShapeIdxAfterDelete(prev, si));
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
            <div style={{ position: "fixed", left: dialogLeft, top: dialogTop, zIndex: 200, background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, boxShadow: shadows.modal, width: DIM_EDIT_DIALOG_W, boxSizing: "border-box" }} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Enter") applyDimEdit(); if (e.key === "Escape") setEditingDim(null); }}>
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
                boxShadow: shadows.modal,
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

        {designSlopeHeightModal && (() => {
          const m = designSlopeHeightModal;
          const pad = 12;
          const { left: dialogLeft, top: dialogTop } = clampCenteredFixedDialog(
            typeof window !== "undefined" ? window.innerWidth / 2 : 400,
            typeof window !== "undefined" ? window.innerHeight / 2 : 300,
            320,
            168,
            pad
          );
          const applyDesignSlopeHeight = () => {
            const v = parseFloat(m.value.replace(",", "."));
            if (Number.isNaN(v)) {
              setDesignSlopeHeightModal(null);
              return;
            }
            saveHistory();
            const valM = v / 100;
            setDesignSlopePoints(prev => prev.map(x => (x.id === m.id ? { ...x, height: valM } : x)));
            setDesignSlopeHeightModal(null);
          };
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
                boxShadow: shadows.modal,
                width: 320,
                boxSizing: "border-box",
              }}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === "Enter") applyDesignSlopeHeight();
                if (e.key === "Escape") setDesignSlopeHeightModal(null);
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 12, color: CC.text }}>{t("project:design_slope_height_modal_title")}</div>
              <div style={{ fontSize: 12, color: CC.textDim, marginBottom: 12 }}>{t("project:design_slope_height_modal_hint")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <input
                  autoFocus
                  type="number"
                  step={0.1}
                  value={m.value}
                  onChange={e => setDesignSlopeHeightModal({ id: m.id, value: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === "Enter") applyDesignSlopeHeight();
                    if (e.key === "Escape") setDesignSlopeHeightModal(null);
                  }}
                  style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }}
                />
                <span style={{ color: CC.textDim }}>cm</span>
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setDesignSlopeHeightModal(null)} style={{ padding: "8px 16px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, cursor: "pointer", fontSize: 13 }}>{t("project:set_angle_cancel")}</button>
                <button type="button" onClick={applyDesignSlopeHeight} style={{ padding: "8px 16px", background: CC.accent, border: "none", borderRadius: 6, color: CC.bg, cursor: "pointer", fontSize: 13 }}>{t("project:set_angle_apply")}</button>
              </div>
            </div>
          );
        })()}

        {editingGeodesyCard ? (() => {
          const { cardInfo, focusGeodesyKey, screenPos } = editingGeodesyCard;
          const rowsToRender =
            focusGeodesyKey != null
              ? cardInfo.entries
                  .map((entry, rowIdx) => ({ entry, rowIdx }))
                  .filter(({ entry }) => entry.points.some(p => geoEntryKey(p) === focusGeodesyKey))
              : cardInfo.entries.map((entry, rowIdx) => ({ entry, rowIdx }));
          if (rowsToRender.length === 0) return null;
          if (rowsToRender.length > 1) {
            return (
              <GeodesyHeightsBulkModal
                rows={rowsToRender.map(({ entry, rowIdx }) => ({
                  rowIdx,
                  label: entry.label,
                  initialCm: entry.height * 100,
                }))}
                baselineHeightValues={heightValues}
                position={screenPos}
                onConfirm={next => applyHeightEdit(false, next)}
                onCancel={() => setEditingGeodesyCard(null)}
              />
            );
          }
          const { entry, rowIdx } = rowsToRender[0];
          const parsedInitial = parseFloat(heightValues[rowIdx] ?? "");
          const initialCm = Number.isFinite(parsedInitial) ? parsedInitial : entry.height * 100;
          return (
            <GeodesyPointModal
              mode="height"
              pointId={geodesyEntryPointDisplayId(entry)}
              initialValue={initialCm}
              position={screenPos}
              onConfirm={val => {
                const merged = [...heightValues];
                merged[rowIdx] = String(val);
                applyHeightEdit(false, merged);
              }}
              onCancel={() => setEditingGeodesyCard(null)}
            />
          );
        })() : null}

        {clusterTooltip && (
          <div
            style={{
              position: "fixed",
              left: clusterTooltip.x + 12,
              top: clusterTooltip.y + 12,
              zIndex: 110,
              background: "rgba(26,26,46,0.96)",
              border: "1px solid rgba(74,158,255,0.6)",
              borderRadius: 6,
              padding: "6px 10px",
              font: "10px 'JetBrains Mono',monospace",
              color: "#e8eaf0",
              maxHeight: 200,
              overflowY: "auto",
              pointerEvents: "none",
              boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
            }}
          >
            {clusterTooltip.labels.map((l, i) => (
              <div key={i} style={{ padding: "2px 0", borderBottom: i < clusterTooltip.labels.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                {l.text}
              </div>
            ))}
          </div>
        )}

        {shapeCreationModal && (
          <div ref={shapeCreationBackdropDismiss.backdropRef} className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: colors.bgModalBackdrop, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onPointerDown={shapeCreationBackdropDismiss.onBackdropPointerDown}>
            <div className="canvas-modal-content" style={{ background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 320, boxShadow: shadows.modal }} onPointerDownCapture={shapeCreationBackdropDismiss.onPanelPointerDownCapture} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 600, marginBottom: 16, color: CC.text }}>
                {t(`project:${projectShapeToolbarLabelKey(shapeCreationModal.type)}`)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 120, fontSize: 13, color: CC.text }}>{t("project:shape_modal_name_label")}</span>
                  <input type="text" value={shapeInputs.name} onChange={e => setShapeInputs(p => ({ ...p, name: e.target.value }))}
                    placeholder={t(`project:${shapeNamePlaceholderKey(shapeCreationModal.type)}`)}
                    style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }} />
                </label>
                {shapeCreationModal.type === "square" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 120, fontSize: 13, color: CC.text }}>{t("project:shape_modal_side_m")}</span>
                    <input type="number" min="0.1" step="0.1" value={shapeInputs.side} onChange={e => setShapeInputs(p => ({ ...p, side: e.target.value }))}
                      style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }} />
                  </label>
                )}
                {(shapeCreationModal.type === "pentagon" || shapeCreationModal.type === "hexagon" || shapeCreationModal.type === "octagon") && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 120, fontSize: 13, color: CC.text }}>{t("project:shape_modal_side_length_m")}</span>
                    <input type="number" min="0.1" step="0.1" value={shapeInputs.side} onChange={e => setShapeInputs(p => ({ ...p, side: e.target.value }))}
                      style={{ flex: 1, padding: "6px 10px", background: CC.button, border: `1px solid ${CC.panelBorder}`, borderRadius: 6, color: CC.text, fontSize: 13 }} />
                  </label>
                )}
                {shapeCreationModal.type === "circle" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 120, fontSize: 13, color: CC.text }}>{t("project:shape_modal_diameter_m")}</span>
                    <input type="number" min="0.1" step="0.1" value={shapeInputs.diameter} onChange={e => setShapeInputs(p => ({ ...p, diameter: e.target.value }))}
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
                    const label = (shapeInputs.name || "").trim() || t(`project:${projectShapeToolbarLabelKey(type)}`);
                    if (type === "square") addShape((cx2, cy2, l) => ({ ...makeSquare(cx2, cy2, l, parseFloat(shapeInputs.side) || 4), label }));
                    else if (type === "rectangle") addShape((cx2, cy2, l) => ({ ...makeRectangle(cx2, cy2, l, parseFloat(shapeInputs.width) || 6, parseFloat(shapeInputs.height) || 4), label }));
                    else if (type === "triangle") addShape((cx2, cy2, l) => ({ ...makeTriangle(cx2, cy2, l, parseFloat(shapeInputs.base) || 5, parseFloat(shapeInputs.height) || 4), label }));
                    else if (type === "trapezoid") addShape((cx2, cy2, l) => ({ ...makeTrapezoid(cx2, cy2, l, parseFloat(shapeInputs.top) || 3, parseFloat(shapeInputs.bottom) || 6, parseFloat(shapeInputs.height) || 4), label }));
                    else if (type === "pentagon") addShape((cx2, cy2, l) => ({ ...makeRegularPolygon(cx2, cy2, l, 5, parseFloat(shapeInputs.side) || 4), label }));
                    else if (type === "hexagon") addShape((cx2, cy2, l) => ({ ...makeRegularPolygon(cx2, cy2, l, 6, parseFloat(shapeInputs.side) || 4), label }));
                    else if (type === "octagon") addShape((cx2, cy2, l) => ({ ...makeRegularPolygon(cx2, cy2, l, 8, parseFloat(shapeInputs.side) || 4), label }));
                    else if (type === "circle") addShape((cx2, cy2, l) => ({ ...makeCircle(cx2, cy2, l, parseFloat(shapeInputs.diameter) || 4), label }));
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
            layer={(activeLayer === 3 || activeLayer === 4 || activeLayer === 5 ? 2 : activeLayer) as LayerID}
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
            <div style={{ position: "fixed", left: dialogLeft, top: dialogTop, zIndex: 200, background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, boxShadow: shadows.modal, minWidth: 260 }} onClick={e => e.stopPropagation()}>
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
          <div ref={grassTrimBackdropDismiss.backdropRef} className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: colors.bgModalBackdrop, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onPointerDown={grassTrimBackdropDismiss.onBackdropPointerDown}>
            <div className="canvas-modal-content" style={{ background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 400, boxShadow: shadows.modal }} onPointerDownCapture={grassTrimBackdropDismiss.onPanelPointerDownCapture} onClick={e => e.stopPropagation()}>
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
          <div ref={adjustmentFillBackdropDismiss.backdropRef} className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: colors.bgModalBackdrop, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onPointerDown={adjustmentFillBackdropDismiss.onBackdropPointerDown}>
            <div className="canvas-modal-content" style={{ background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 400, boxShadow: shadows.modal }} onPointerDownCapture={adjustmentFillBackdropDismiss.onPanelPointerDownCapture} onClick={e => e.stopPropagation()}>
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
          <div ref={adjustmentExtendBackdropDismiss.backdropRef} className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: colors.bgModalBackdrop, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onPointerDown={adjustmentExtendBackdropDismiss.onBackdropPointerDown}>
            <div className="canvas-modal-content" style={{ background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 400, boxShadow: shadows.modal }} onPointerDownCapture={adjustmentExtendBackdropDismiss.onPanelPointerDownCapture} onClick={e => e.stopPropagation()}>
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
          <div ref={adjustmentSpreadBackdropDismiss.backdropRef} className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: colors.bgModalBackdrop, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onPointerDown={adjustmentSpreadBackdropDismiss.onBackdropPointerDown}>
            <div className="canvas-modal-content" style={{ background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 400, boxShadow: shadows.modal }} onPointerDownCapture={adjustmentSpreadBackdropDismiss.onPanelPointerDownCapture} onClick={e => e.stopPropagation()}>
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
        preparationSection={
          activeLayer === 5 ? (
            <PreparationSidebarContent
              shapes={shapes}
              soilType={(projectSettings.soilType || "clay") as "clay" | "sand" | "rock"}
              levelingMaterial={(projectSettings.levelingMaterial || "tape1") as "tape1" | "soil"}
              onGroundworkClick={(si) => shapes[si]?.calculatorResults && setResultsModalShapeIdx(si)}
            />
          ) : undefined
        }
      />
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
          onExport={handlePlanPdfLayersConfirm}
          isExporting={isExportingPdf}
        />
      )}

      {cmEditDialog && (
        <GeodesyPointModal
          key={`${cmEditDialog.shapeIdx}-${cmEditDialog.pointIdx}-${cmEditDialog.mode}`}
          mode={cmEditDialog.mode === "preparation" ? "preparation" : "depth"}
          pointId={cmEditDialog.pointIdx + 1}
          initialValue={cmEditInitialCm}
          position={cmEditDialog.screenPos}
          onConfirm={confirmCmEditDialog}
          onCancel={() => setCmEditDialog(null)}
        />
      )}

      {showGeodesyPrintPreview && (
        <GeodesyPrintPreviewModal
          isOpen={showGeodesyPrintPreview}
          onClose={closeGeodesyPrintPreview}
          onConfirmExport={() => void handleExportPdf(pendingPdfLayers)}
          isExporting={isExportingPdf}
          cardsInfo={geodesyPrintPreviewCards}
          hiddenEntries={hiddenGeodesyEntries}
          onToggleEntryKeys={toggleGeodesyPreviewHiddenKeys}
          previewDataUrl={geodesyPreviewDataUrl}
          onPreviewImageLogicalClick={handleGeodesyPreviewImageLogicalClick}
          devicePixelRatio={typeof window !== "undefined" ? window.devicePixelRatio : 1}
          highlightRowKey={geodesyPreviewListHighlightKey}
          showGeodesyLayerTabs={pendingPdfLayers.includes(101) && pendingPdfLayers.includes(102)}
          previewGeodesyLayer={geodesyPrintPreviewTargetLayer}
          onPreviewGeodesyLayerChange={setGeodesyPrintPreviewTargetLayer}
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

// ── NamePromptModal ────────────────────────────────────────────

function NamePromptModal({ initialLabel, onConfirm, onCancel }: { initialLabel: string; onConfirm: (val: string) => void; onCancel: () => void }) {
  const { t } = useTranslation(["project", "common"]);
  const { currentTheme } = useTheme();
  const CC = currentTheme?.id === "light" ? C_LIGHT : C;
  const [val, setVal] = useState(initialLabel);
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropDismiss = useBackdropPointerDismiss(onCancel, true);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div ref={backdropDismiss.backdropRef} className="canvas-modal-backdrop" style={{ position: "fixed", inset: 0, background: colors.bgModalBackdrop, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onPointerDown={backdropDismiss.onBackdropPointerDown}>
      <div className="canvas-modal-content" style={{ background: CC.panel, border: `1px solid ${CC.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 360, boxShadow: shadows.modal }} onPointerDownCapture={backdropDismiss.onPanelPointerDownCapture} onClick={e => e.stopPropagation()}>
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