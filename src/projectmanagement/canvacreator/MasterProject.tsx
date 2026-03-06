import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Point, Shape, LayerID, ArcPoint, DragInfo, ShapeDragInfo, RotateInfo, ScaleCornerInfo, ScaleEdgeInfo,
  HitResult, EdgeHitResult, OpenEndHit,
  SelectionRect, DimEdit, ContextMenuInfo, LinkedEntry, isArcEntry,
  PIXELS_PER_METER, GRID_SPACING, POINT_RADIUS, EDGE_HIT_THRESHOLD, GRASS_EDGE_HIT_PX,
  SNAP_TO_START_RADIUS, SNAP_TO_LAST_RADIUS, MIN_ZOOM, MAX_ZOOM, SNAP_MAGNET_PX, ARC_SNAP_PX, PATTERN_SNAP_PX,
  distance, toMeters, toPixels, formatLength, midpoint, angleDeg, areaM2, polylineLengthMeters,
  projectOntoSegment, edgeNormalAngle, snapTo45, snapTo45Soft, snapAngleTo45, snapShiftSmart, interiorAngleDir, centroid, labelAnchorInsidePolygon,
  constrainLockedEdges,
  snapMagnet, snapMagnetShape, pointInPolygon,
  makeSquare, makeRectangle, makeTriangle, makeTrapezoid, C,
} from "./geometry";
import { calcEdgeSlopes, calcShapeGradient, formatSlope, slopeColor, interpolateHeightAtPoint, fillShapeHeightHeatmap, computeGlobalHeightRange } from "./geodesy.ts";
import { isLinearElement, isGroundworkLinear, isPathElement, isPolygonLinearElement, groundworkLabel, drawLinearElement, drawLinearElementInactive, hitTestLinearElement, hitTestPathElement, computeThickPolyline, getPathPolygon, getLinearElementPath, getPolygonThicknessM, polygonToSegmentLengths, polygonEdgeToSegmentIndex, removeSegmentFromPolygonOutline } from "./linearElements";
import { drawShapeObjectLabel, drawExcavationLayers } from "./canvasRenderers";
import { drawDeckPattern } from "./visualization/deckBoards";
import { drawSlabPattern, drawPathSlabPattern, drawSlabFrame, computePatternSnap, computeSlabCuts, computePathSlabCuts } from "./visualization/slabPattern";
import { drawCobblestonePattern, drawMonoblockFrame, computeCobblestoneCuts } from "./visualization/cobblestonePattern";
import { drawFencePostMarkers, drawWallSlopeIndicators } from "./visualization/linearMarkers";
import { drawGrassPieces, hitTestGrassPiece, hitTestGrassPieceEdge, hitTestGrassJoinEdge, snapGrassPieceEdge, snapGrassPieceToPolygon, getJoinedGroup, validateCoverage, getEffectiveTotalArea, getEffectivePieceDimensionsForInput, type GrassPiece } from "./visualization/grassRolls";
import { ProjectSettings, DEFAULT_PROJECT_SETTINGS } from "./types";
import ObjectCardModal from "./objectCard/ObjectCardModal";
import StairsCreationModal from "./objectCard/StairsCreationModal";
import PathCreationModal, { type PathConfig } from "./objectCard/PathCreationModal";
import ResultsModal from "./objectCard/ResultsModal";
import WallSegmentHeightModal from "./WallSegmentHeightModal";
import ProjectSummaryPanel from "./ProjectSummaryPanel";
import ProjectCardModal from "./ProjectCardModal";
import { computePreparation } from "./preparationLogic";
import { computeEmptyAreas, computeOverflowAreas, computeOverlaps, clipShapeToGarden, removeOverlapFromShape, findTouchingElementsForEmptyArea, extendShapeToCoverEmptyArea, clipSurfaceToOutsideLinear, findSurfacesOverlappingLinear } from "./adjustmentLogic";
import { computeGroundworkLinearResults, isManualExcavation, getFoundationDiggingMethodFromExcavator } from "./GroundworkLinearCalculator";
import { drawAlternatingLinkedHalf } from "./linkedEdgeDrawing";
import { drawCurvedEdge, calcEdgeLengthWithArcs, getEffectivePolygon, getEffectivePolygonWithEdgeIndices, drawSmoothPolygonPath, drawSmoothPolygonStroke, projectOntoArcEdge, drawArcHandles, hitTestArcPoint, dragArcPoint, snapArcPoint, arcPointToWorld, worldToArcPoint } from "./arcMath";
import CreatePreviewModal from "./CreatePreviewModal";
import PlanPdfExportModal from "./PlanPdfExportModal";
import { submitProject } from "./projectSubmit";
import jsPDF from "jspdf";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../lib/store";
import { loadPlan, savePlan, linkPlanToEvent, type CanvasPayload } from "../../lib/plansService";
import { useTranslation } from "react-i18next";
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

export default function MasterProject() {
  const navigate = useNavigate();
  const { planId: urlPlanId } = useParams<{ planId?: string }>();
  const { user } = useAuthStore();
  const currentPlanIdRef = useRef<string | null>(urlPlanId ?? null);
  const { t } = useTranslation(["project"]);
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
  const [mouseWorld, setMouseWorld] = useState<Point>({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<ContextMenuInfo | null>(null);
  const [contextMenuDisplayPos, setContextMenuDisplayPos] = useState<{ x: number; y: number } | null>(null);
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>(1);
  const [selectedPattern, setSelectedPattern] = useState<{ shapeIdx: number; type: "slab" | "grass" | "cobblestone" } | null>(null);
  const [editingHeight, setEditingHeight] = useState<{ shapeIdx: number; pointIdx: number; heightPointIdx?: number; x: number; y: number } | null>(null);
  const [hoveredHeightPoint, setHoveredHeightPoint] = useState<{ shapeIdx: number; heightPointIdx: number } | null>(null);
  const [heightValue, setHeightValue] = useState("");
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
  const [adjustmentSpreadModal, setAdjustmentSpreadModal] = useState<{ shapeIdxA: number; shapeIdxB: number; overlapIdx: number } | null>(null);
  const [grassScaleInfo, setGrassScaleInfo] = useState<{ shapeIdx: number; pieceIdx: number; edge: "length_start" | "length_end"; startMouse: Point; startLength: number; startX: number; startY: number } | null>(null);
  const [grassAlignedPolyEdges, setGrassAlignedPolyEdges] = useState<number[]>([]);
  const [patternDragInfo, setPatternDragInfo] = useState<{ shapeIdx: number; type: "slab" | "cobblestone"; startMouse: Point; startOffset: Point } | null>(null);
  const [patternDragPreview, setPatternDragPreview] = useState<Point | null>(null);
  const [patternAlignedEdges, setPatternAlignedEdges] = useState<number[]>([]);
  const [patternRotateInfo, setPatternRotateInfo] = useState<{ shapeIdx: number; type: "slab" | "cobblestone" | "grass"; center: Point; startAngle: number; startDirectionDeg: number } | null>(null);
  const [patternRotatePreview, setPatternRotatePreview] = useState<number | null>(null);
  const [showRestoredToast, setShowRestoredToast] = useState(false);
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
  const [shapeCreationModal, setShapeCreationModal] = useState<{ type: "square" | "rectangle" | "triangle" | "trapezoid" } | null>(null);
  const [segmentHeightModal, setSegmentHeightModal] = useState<{ shapeIdx: number } | null>(null);
  const [resultsModalShapeIdx, setResultsModalShapeIdx] = useState<number | null>(null);
  const [showCreatePreview, setShowCreatePreview] = useState(false);
  const [recalculateTrigger, setRecalculateTrigger] = useState(0);
  const [geodesyEnabled, setGeodesyEnabled] = useState(false);
  const [showAllArcPoints, setShowAllArcPoints] = useState(false);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [dismissedLayerHints, setDismissedLayerHints] = useState<Set<number>>(new Set());
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

  const isOnActiveLayer = useCallback((si: number): boolean => {
    if (activeLayer === 3 || activeLayer === 4) return false; // Pattern and Preparation are read-only
    if (activeLayer === 5) return shapes[si]?.layer === 1 || shapes[si]?.layer === 2; // Adjustment: L1 + L2
    return shapes[si]?.layer === activeLayer;
  }, [shapes, activeLayer]);

  /** For right-click scale: Layer 2 shapes when activeLayer=3, else normal active layer */
  const isOnActiveLayerForScale = useCallback((si: number): boolean => {
    if (activeLayer === 3) return shapes[si]?.layer === 2;
    if (activeLayer === 4) return false;
    if (activeLayer === 5) return shapes[si]?.layer === 1 || shapes[si]?.layer === 2;
    return shapes[si]?.layer === activeLayer;
  }, [shapes, activeLayer]);

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
      n[idx] = { ...s, calculatorInputs: { ...(s.calculatorInputs ?? {}), ...inputs } };
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
  useEffect(() => {
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
    if (!shapesDropdownOpen && !pathDropdownOpen && !linearDropdownOpen && !groundworkDropdownOpen && !stairsDropdownOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (shapesDropdownRef.current && !shapesDropdownRef.current.contains(e.target as Node)) setShapesDropdownOpen(false);
      if (pathDropdownRef.current && !pathDropdownRef.current.contains(e.target as Node)) setPathDropdownOpen(false);
      if (linearDropdownRef.current && !linearDropdownRef.current.contains(e.target as Node)) setLinearDropdownOpen(false);
      if (groundworkDropdownRef.current && !groundworkDropdownRef.current.contains(e.target as Node)) setGroundworkDropdownOpen(false);
      if (stairsDropdownRef.current && !stairsDropdownRef.current.contains(e.target as Node)) setStairsDropdownOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [shapesDropdownOpen, pathDropdownOpen, linearDropdownOpen, groundworkDropdownOpen, stairsDropdownOpen]);

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
            const { wasteSatisfiedPositions } = computeCobblestoneCuts(pathShape, inputs);
            const cur = shape.calculatorInputs;
            if (!arrEqual(cur?.vizWasteSatisfied as string[] | undefined, wasteSatisfiedPositions ?? [])) {
              changed = true;
              return { ...shape, calculatorInputs: { ...shape.calculatorInputs, vizWasteSatisfied: wasteSatisfiedPositions ?? [] } };
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
        const { wasteSatisfiedPositions } = computeCobblestoneCuts(shape, inputs);
        const cur = shape.calculatorInputs;
        if (!arrEqual(cur?.vizWasteSatisfied as string[] | undefined, wasteSatisfiedPositions ?? [])) {
          changed = true;
          return { ...shape, calculatorInputs: { ...shape.calculatorInputs, vizWasteSatisfied: wasteSatisfiedPositions ?? [] } };
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

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Grid
    const gridPx = GRID_SPACING * PIXELS_PER_METER * zoom;
    if (gridPx > 8) {
      ctx.lineWidth = 1;
      for (let x = pan.x % gridPx; x < W; x += gridPx) {
        const wx = (x - pan.x) / zoom;
        ctx.strokeStyle = Math.abs(Math.round(wx / PIXELS_PER_METER) * PIXELS_PER_METER - wx) < 1 ? C.gridMajor : C.grid;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = pan.y % gridPx; y < H; y += gridPx) {
        const wy = (y - pan.y) / zoom;
        ctx.strokeStyle = Math.abs(Math.round(wy / PIXELS_PER_METER) * PIXELS_PER_METER - wy) < 1 ? C.gridMajor : C.grid;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    }

    // Origin (hidden during PDF export)
    if (!isExportingRef.current) {
      const o = worldToScreen(0, 0);
      ctx.strokeStyle = C.textDim; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
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

    // Smart guides: snap to aligned X/Y of existing points in drawing shape
    const SMART_GUIDE_SNAP_PX = 8;
    const smartGuides: { axis: "x" | "y"; worldValue: number; ptIdx: number }[] = [];
    let eMouse = { ...eMouseRaw };
    if (drawingShapeIdx !== null && shapes[drawingShapeIdx]) {
      const drawPts = shapes[drawingShapeIdx].points;
      if (drawPts.length > 0) {
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
          ctx.fillStyle = C.layer2Dim;
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
        ctx.fillStyle = shape.layer === 2 ? C.layer2Dim : C.inactiveShape;
        ctx.fill();
      }

      const edgeCount = shape.closed ? pts.length : pts.length - 1;
      const hasArcsInactiveStroke = !!(shape.edgeArcs?.some(a => a && a.length > 0));
      if (hasArcsInactiveStroke) {
        ctx.strokeStyle = C.inactiveEdge;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        drawSmoothPolygonPath(ctx, getCachedPoly(si), (wx, wy) => worldToScreen(wx, wy));
        ctx.stroke();
      } else {
        for (let i = 0; i < edgeCount; i++) {
          const j = (i + 1) % pts.length;
          const sa = worldToScreen(pts[i].x, pts[i].y);
          const sb = worldToScreen(pts[j].x, pts[j].y);
          ctx.strokeStyle = C.inactiveEdge;
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
        }
      }

      if (shape.closed && pts.length >= 3) {
        const effPts = getCachedPoly(si);
        const area = areaM2(effPts);
        const anchor = labelAnchorInsidePolygon(shape.points);
        const sc = worldToScreen(anchor.x, anchor.y);
        ctx.font = "bold 14px 'JetBrains Mono',monospace";
        ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(area.toFixed(2) + " m²", sc.x, sc.y);
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
          ctx.beginPath();
          const s0 = worldToScreen(outline[0].x, outline[0].y);
          ctx.moveTo(s0.x, s0.y);
          for (let i = 1; i < outline.length; i++) {
            const s = worldToScreen(outline[i].x, outline[i].y);
            ctx.lineTo(s.x, s.y);
          }
          ctx.closePath();
          ctx.fillStyle = isSel ? "rgba(108,92,231,0.15)" : C.layer2Dim;
          ctx.fill();
          if ((shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && shape.calculatorInputs?.vizSlabWidth) {
            if (!drawPathSlabPattern(ctx, pathShape, worldToScreen, zoom, true, !isSel)) {
              drawSlabPattern(ctx, pathShape, worldToScreen, zoom, true, undefined, undefined, !isSel);
            }
            if (shape.calculatorInputs?.framePieceWidthCm) {
              drawSlabFrame(ctx, pathShape, worldToScreen, zoom);
            }
          } else if (shape.calculatorType === "paving" && shape.calculatorInputs) {
            if (shape.calculatorInputs?.addFrameToMonoblock && shape.calculatorInputs?.framePieceWidthCm) {
              drawMonoblockFrame(ctx, pathShape, worldToScreen, zoom);
            }
            drawCobblestonePattern(ctx, pathShape, worldToScreen, zoom, true, undefined, undefined, !isSel);
          }
          ctx.strokeStyle = isSel ? "rgba(108,92,231,0.8)" : C.layer2Edge;
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
            drawGrassPieces(ctx, shape, worldToScreen, zoom, true, grassScaleInfo, si, isExportingRef.current, grassDir);
          }
        }
      });
      if (patternDragInfo && patternAlignedEdges.length > 0) {
        const si = patternDragInfo.shapeIdx;
        const shape = shapes[si];
        if (shape?.closed && shape.points.length >= 3) {
          const pts = shape.points;
          const alignedSet = new Set(patternAlignedEdges);
          ctx.strokeStyle = "#27ae60";
          ctx.lineWidth = 3;
          for (const ei of patternAlignedEdges) {
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
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(sc.x, minY - 5);
        ctx.lineTo(sc.x, handleY + 8);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(sc.x, handleY, 8, 0, Math.PI * 2);
        ctx.fillStyle = C.button;
        ctx.fill();
        ctx.strokeStyle = C.accent;
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
          ctx.fillStyle = C.layer2Edge; ctx.fill();
          ctx.strokeStyle = C.point; ctx.lineWidth = 2; ctx.stroke();
          if (isFirstOnly) {
            const animT = (Date.now() % 1500) / 1500;
            const pulse = r + 4 + Math.sin(animT * Math.PI * 2) * 3;
            ctx.beginPath(); ctx.arc(sp.x, sp.y, pulse, 0, Math.PI * 2);
            ctx.strokeStyle = C.open; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
            ctx.font = "10px 'JetBrains Mono',monospace";
            ctx.fillStyle = C.open; ctx.textAlign = "center";
            ctx.fillText(t("project:canvas_click_second_point"), sp.x, sp.y - 20);
          }
        });
        if (si === drawingShapeIdx && pts.length > 0) {
          const last = pts[pts.length - 1];
          const sl = worldToScreen(last.x, last.y);
          const sm = worldToScreen(eMouse.x, eMouse.y);
          ctx.strokeStyle = C.open; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(sl.x, sl.y); ctx.lineTo(sm.x, sm.y); ctx.stroke();
          ctx.setLineDash([]);
        }
        if (pts.length >= 2) drawShapeObjectLabel(ctx, shape, worldToScreen, shape.label || groundworkLabel(shape));
      });
    }

    // ── Draw active layer shapes ──────────────────────────
    const showGeodesy = geodesyEnabled;
    const geodesyGlobalRange = showGeodesy ? computeGlobalHeightRange(shapes, s =>
      (activeLayer === 3 || activeLayer === 5) ? (s.layer === 1 || s.layer === 2) : s.layer === activeLayer
    ) : undefined;

    shapes.forEach((shape, si) => {
      if (!passesViewFilter(shape, viewFilter, activeLayer)) return;
      if (activeLayer === 5) { if (shape.layer !== 1 && shape.layer !== 2) return; }
      else if (shape.layer !== activeLayer) return;
      // Foundation visible only in Layer 4, hidden in Layer 2
      if (activeLayer === 2 && shape.elementType === "foundation") return;
      const pts = shape.points;
      if (pts.length < 1) return;
      const isSel = si === selectedShapeIdx;
      const isDraw = si === drawingShapeIdx;
      const isOpen = !shape.closed;
      const isL2 = shape.layer === 2;
      const edgeColor = isOpen ? C.open : isL2 ? C.layer2Edge : C.edge;
      const edgeHovColor = isOpen ? C.openHover : isL2 ? C.layer2 : C.edgeHover;

      if (isPathElement(shape)) {
        const outline = getPathPolygon(shape);
        const pts = (shape.calculatorInputs?.pathIsOutline && shape.calculatorInputs?.pathCenterlineOriginal) ? (shape.calculatorInputs.pathCenterlineOriginal as Point[]) : (shape.calculatorInputs?.pathIsOutline && shape.calculatorInputs?.pathCenterline ? (shape.calculatorInputs.pathCenterline as Point[]) : shape.points);
        if (outline.length >= 3) {
            const pathShape = { ...shape, points: outline, closed: true } as Shape;
            ctx.beginPath();
            const s0 = worldToScreen(outline[0].x, outline[0].y);
            ctx.moveTo(s0.x, s0.y);
            for (let i = 1; i < outline.length; i++) {
              const s = worldToScreen(outline[i].x, outline[i].y);
              ctx.lineTo(s.x, s.y);
            }
            ctx.closePath();
            ctx.fillStyle = isSel ? "rgba(108,92,231,0.15)" : C.layer2Dim;
            ctx.fill();
            if ((shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs") && shape.calculatorInputs?.vizSlabWidth) {
              if (!drawPathSlabPattern(ctx, pathShape, worldToScreen, zoom, true, !isSel)) {
                drawSlabPattern(ctx, pathShape, worldToScreen, zoom, true, undefined, undefined, !isSel);
              }
              if (shape.calculatorInputs?.framePieceWidthCm) {
                drawSlabFrame(ctx, pathShape, worldToScreen, zoom);
              }
            } else if (shape.calculatorType === "paving" && shape.calculatorInputs) {
              if (shape.calculatorInputs?.addFrameToMonoblock && shape.calculatorInputs?.framePieceWidthCm) {
                drawMonoblockFrame(ctx, pathShape, worldToScreen, zoom);
              }
              drawCobblestonePattern(ctx, pathShape, worldToScreen, zoom, true, undefined, undefined, !isSel);
            }
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
        pts.forEach((p, pi) => {
          const sp = worldToScreen(p.x, p.y);
          const isH = hoveredPoint && hoveredPoint.shapeIdx === si && hoveredPoint.pointIdx === pi;
          const isD = dragInfo && dragInfo.shapeIdx === si && dragInfo.pointIdx === pi;
          const r = (isH || isD ? POINT_RADIUS + 2 : POINT_RADIUS) * (isSel || isDraw ? 1 : 0.8);
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isH || isD ? C.layer2 : C.layer2Edge; ctx.fill();
          ctx.strokeStyle = C.point; ctx.lineWidth = 2; ctx.stroke();
        });
        if ((isSel || showAllArcPoints) && shape.edgeArcs && pts.length >= 2) {
          const linkedArcIdsForShape = new Set<string>();
          for (const g of linkedGroups) for (const p of g) { if (isArcEntry(p) && p.si === si && g.length >= 2) linkedArcIdsForShape.add(p.arcId); }
          for (let i = 0; i < pts.length - 1; i++) {
            const arcs = shape.edgeArcs[i];
            if (arcs && arcs.length > 0) {
              drawArcHandles(ctx, pts[i], pts[i + 1], arcs, (wx, wy) => worldToScreen(wx, wy), hoveredArcPoint?.arcPoint?.id ?? null, linkedArcIdsForShape);
            }
          }
        }
        if (isDraw && pts.length > 0) {
          const last = pts[pts.length - 1];
          const sl = worldToScreen(last.x, last.y);
          const sm = worldToScreen(eMouse.x, eMouse.y);
          ctx.strokeStyle = C.open; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(sl.x, sl.y); ctx.lineTo(sm.x, sm.y); ctx.stroke();
          ctx.setLineDash([]);
        }
        if (isL2) drawShapeObjectLabel(ctx, shape, worldToScreen, shape.label || "Path");
        return;
      }

      if (isLinearElement(shape)) {
        drawLinearElement(ctx, shape, worldToScreen, zoom, isSel, hoveredEdge?.shapeIdx === si, isL2 ? (pi: number) => isPointLinked(si, pi) : undefined);
        if (shape.elementType === "fence" && shape.calculatorResults) {
          drawFencePostMarkers(ctx, shape, worldToScreen, zoom);
        }
        if (shape.elementType === "wall" && (shape.heights?.some((h: number) => Math.abs(h) > 0.0001))) {
          drawWallSlopeIndicators(ctx, shape, worldToScreen);
        }
        pts.forEach((p, pi) => {
          const sp = worldToScreen(p.x, p.y);
          const isH = hoveredPoint && hoveredPoint.shapeIdx === si && hoveredPoint.pointIdx === pi;
          const isD = dragInfo && dragInfo.shapeIdx === si && dragInfo.pointIdx === pi;
          const r = (isH || isD ? POINT_RADIUS + 2 : POINT_RADIUS) * (isSel || isDraw ? 1 : 0.8);
          const fc = C.layer2Edge;
          const hc = C.layer2;
          if (isH || isD) {
            ctx.beginPath(); ctx.arc(sp.x, sp.y, r + 5, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(108,92,231,0.4)"; ctx.fill();
          }
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isH || isD ? hc : fc; ctx.fill();
          ctx.strokeStyle = C.point; ctx.lineWidth = 2; ctx.stroke();
        });
        if ((isSel || showAllArcPoints) && shape.edgeArcs) {
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
        if (isL2) drawShapeObjectLabel(ctx, shape, worldToScreen, shape.label || "Element");
        if (isDraw && pts.length > 0) {
          const last = pts[pts.length - 1];
          const sl = worldToScreen(last.x, last.y);
          const sm = worldToScreen(eMouse.x, eMouse.y);
          ctx.strokeStyle = C.open; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
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
          }
          const liveLen = distance(last, eMouse);
          const lm = midpoint(sl, sm);
          ctx.font = "12px 'JetBrains Mono',monospace";
          ctx.fillStyle = C.text; ctx.textAlign = "center";
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
        if (showGeodesy) {
          fillShapeHeightHeatmap(ctx, shape, worldToScreen, geodesyGlobalRange);
        } else {
          ctx.fillStyle = isSel ? (isL2 ? "rgba(108,92,231,0.15)" : C.selectedFill) : (isL2 ? C.layer2Dim : C.shapeFill);
          ctx.fill();
        }

        if (isL2 && !geodesyEnabled && shape.calculatorType === "deck" && shape.calculatorInputs?.boardLength) {
          drawDeckPattern(ctx, shape, worldToScreen, zoom, !isSel);
        }
        if (isL2 && !geodesyEnabled && shape.calculatorType === "slab" && shape.calculatorInputs?.vizSlabWidth) {
          drawSlabPattern(ctx, shape, worldToScreen, zoom, true, undefined, undefined, !isSel);
          if (shape.calculatorInputs?.framePieceWidthCm) {
            drawSlabFrame(ctx, shape, worldToScreen, zoom);
          }
        }
        if (isL2 && !geodesyEnabled && shape.calculatorType === "paving" && shape.closed) {
          if (shape.calculatorInputs?.addFrameToMonoblock && shape.calculatorInputs?.framePieceWidthCm) {
            drawMonoblockFrame(ctx, shape, worldToScreen, zoom);
          }
          drawCobblestonePattern(ctx, shape, worldToScreen, zoom, true, undefined, undefined, !isSel);
        }
        if (isL2 && !geodesyEnabled && shape.calculatorType === "grass") {
          if (shape.calculatorInputs?.framePieceWidthCm) {
            drawSlabFrame(ctx, shape, worldToScreen, zoom);
          }
          if ((shape.calculatorInputs?.vizPieces?.length ?? 0) > 0) {
            drawGrassPieces(ctx, shape, worldToScreen, zoom, isSel, grassScaleInfo, si, isExportingRef.current);
          }
        }
      }

      const vizAlignedEdges = (shape.calculatorInputs?.vizAlignedEdges as number[] | undefined) ?? [];
      const edgeCount = shape.closed ? pts.length : pts.length - 1;
      const hasArcsForStroke = !!(shape.edgeArcs?.some(a => a && a.length > 0));
      if (hasArcsForStroke) {
        const { points: effPts, edgeIndices } = getEffectivePolygonWithEdgeIndices(shape);
        drawSmoothPolygonStroke(ctx, effPts, edgeIndices, (wx, wy) => worldToScreen(wx, wy), (edgeIdx) => {
          const isHov = hoveredEdge && hoveredEdge.shapeIdx === si && hoveredEdge.edgeIdx === edgeIdx;
          const isLockedEdge = shape.lockedEdges.some(e => e.idx === edgeIdx);
          const isAlignedEdge = isSel && vizAlignedEdges.includes(edgeIdx);
          return {
            strokeStyle: isAlignedEdge ? "#27ae60" : (isLockedEdge ? C.locked : isHov ? edgeHovColor : edgeColor),
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

        ctx.strokeStyle = isAlignedEdge ? "#27ae60" : (isLockedEdge ? C.locked : isHov ? edgeHovColor : edgeColor);
        ctx.lineWidth = isAlignedEdge ? 3 : (isSel ? 2.5 : 1.8);

        const arcs = shape.edgeArcs?.[i];
        if (!hasArcsForStroke && arcs && arcs.length > 0) {
          ctx.beginPath();
          ctx.moveTo(sa.x, sa.y);
          drawCurvedEdge(ctx, pts[i], pts[j], arcs, (wx, wy) => worldToScreen(wx, wy));
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
          ctx.fillStyle = C.locked; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("🔒", emid.x, emid.y - 14);
        }

        const len = calcEdgeLengthWithArcs(pts[i], pts[j], arcs);
        const mid = midpoint(sa, sb);
        const norm = edgeNormalAngle(sa, sb);
        const edgeLabelOffset = 28;
        const lx = mid.x + Math.cos(norm) * edgeLabelOffset, ly = mid.y + Math.sin(norm) * edgeLabelOffset;
        if (!(editingDim && editingDim.shapeIdx === si && editingDim.edgeIdx === i)) {
          ctx.font = "12px 'JetBrains Mono','Fira Code',monospace";
          ctx.fillStyle = isLockedEdge ? C.locked : isHov ? edgeHovColor : C.text;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(formatLength(len), lx, ly);
        }

        // Slope label in geodesy mode — arrow along edge, pointing downhill (high → low)
        // Text placed opposite to arrow direction so it never overlaps the arrow
        if (showGeodesy && shape.closed) {
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
            const slopeTextOffset = 18;
            const stx = lx - ux * slopeTextOffset;
            const sty = ly - uy * slopeTextOffset;
            ctx.font = "bold 10px 'JetBrains Mono',monospace";
            ctx.fillStyle = slopeColor(sl.severity);
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(formatSlope(sl), stx, sty);
          } else if (sl) {
            ctx.font = "bold 10px 'JetBrains Mono',monospace";
            ctx.fillStyle = slopeColor(sl.severity);
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(formatSlope(sl), lx, ly + 24);
          }
        }
      }

      // Arc point handles (when selected or showAllArcPoints, and shape has arcs)
      if ((isSel || showAllArcPoints) && shape.edgeArcs && !showGeodesy) {
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
          const isLockedAngle = shape.lockedAngles.includes(i);

          const cross = (prev.x - curr.x) * (next.y - curr.y) - (prev.y - curr.y) * (next.x - curr.x);
          const ccw = cross > 0;

          ctx.beginPath(); ctx.moveTo(sc.x, sc.y); ctx.arc(sc.x, sc.y, 25, d1, d2, !ccw); ctx.closePath();
          ctx.fillStyle = isLockedAngle ? "rgba(255,68,68,0.15)" : C.angleFill; ctx.fill();
          ctx.strokeStyle = isLockedAngle ? C.lockedAngle : C.angleStroke; ctx.lineWidth = isLockedAngle ? 2 : 1; ctx.stroke();

          const intDir = interiorAngleDir(pts, i);
          ctx.font = "11px 'JetBrains Mono',monospace";
          ctx.fillStyle = isLockedAngle ? C.lockedAngle : C.angleText; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText((isLockedAngle ? "🔒 " : "") + angle.toFixed(1) + "°", sc.x + Math.cos(intDir) * 39, sc.y + Math.sin(intDir) * 39);
        }
      }

      // Points
      pts.forEach((p, pi) => {
        const sp = worldToScreen(p.x, p.y);
        const isH = hoveredPoint && hoveredPoint.shapeIdx === si && hoveredPoint.pointIdx === pi;
        const isD = dragInfo && dragInfo.shapeIdx === si && dragInfo.pointIdx === pi;
        const r = (isH || isD ? POINT_RADIUS + 2 : POINT_RADIUS) * (isSel || isDraw ? 1 : 0.8);
        const fc = isOpen ? C.open : isL2 ? C.layer2Edge : C.pointFill;
        const hc = isOpen ? C.openHover : isL2 ? C.layer2 : C.pointHover;

        if (isH || isD) {
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r + 5, 0, Math.PI * 2);
          ctx.fillStyle = isOpen ? C.openGlow : isL2 ? "rgba(108,92,231,0.4)" : C.accentGlow; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isH || isD ? hc : fc; ctx.fill();
        ctx.strokeStyle = C.point; ctx.lineWidth = 2; ctx.stroke();

        // Linked point indicator
        if (isPointLinked(si, pi)) {
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
        }
      });

      // Rotation handle
      if (isSel && shape.closed && pts.length >= 3 && !isDraw) {
        let minY = Infinity;
        pts.forEach(p => { const sp = worldToScreen(p.x, p.y); if (sp.y < minY) minY = sp.y; });
        const ctr = centroid(pts);
        const sc = worldToScreen(ctr.x, ctr.y);
        const handleY = minY - 35;
        const hColor = isL2 ? C.layer2 : C.accent;
        ctx.strokeStyle = hColor; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(sc.x, minY - 5); ctx.lineTo(sc.x, handleY + 8); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(sc.x, handleY, 8, 0, Math.PI * 2);
        ctx.fillStyle = rotateInfo ? hColor : C.button; ctx.fill();
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
        const effPts = getCachedPoly(si);
        const area = areaM2(effPts);
        const anchor = labelAnchorInsidePolygon(shape.points);
        const sc = worldToScreen(anchor.x, anchor.y);
        ctx.font = "bold 16px 'JetBrains Mono',monospace";
        ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(area.toFixed(2) + " m²", sc.x, sc.y);

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
        if (showGeodesy) {
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
            ctx.font = "bold 10px 'JetBrains Mono',monospace";
            ctx.fillStyle = slopeColor(grad.severity);
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(grad.magnitude.toFixed(1) + " cm/m", tx, ty);
          }
        }
      }

      if (isL2) drawShapeObjectLabel(ctx, shape, worldToScreen, shape.label || "Element");

      // Open shape label
      if (isOpen && pts.length >= 3) {
        const ctr = centroid(pts);
        const sc = worldToScreen(ctr.x, ctr.y);
        ctx.font = "12px 'JetBrains Mono',monospace";
        ctx.fillStyle = C.open; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(t("project:canvas_unclosed_no_area"), sc.x, sc.y);
      }

      // Height labels (geodesy mode) — display in cm
      if (showGeodesy) {
        const heights = shape.heights || pts.map(() => 0);
        pts.forEach((p, pi) => {
          const sp = worldToScreen(p.x, p.y);
          const h = heights[pi] ?? 0;
          const hCm = h * 100;
          ctx.font = "bold 14px 'JetBrains Mono',monospace";
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.fillText((hCm >= 0 ? "+" : "") + hCm.toFixed(1) + " cm", sp.x, sp.y - 16);
        });
      }

      // Punkty wysokościowe (Layer 1) — widoczne zawsze, nie wpływają na geometrię
      if (shape.layer === 1 && (shape.heightPoints?.length ?? 0) > 0) {
        const hpList = shape.heightPoints!;
        const isGeodesy = showGeodesy;
        const r = (POINT_RADIUS * 0.9) * (isGeodesy ? 1 : 0.7);
        hpList.forEach((hp, hpi) => {
          const sp = worldToScreen(hp.x, hp.y);
          const isH = hoveredHeightPoint?.shapeIdx === si && hoveredHeightPoint?.heightPointIdx === hpi;
          const isEdit = editingHeight?.shapeIdx === si && editingHeight?.pointIdx === -1 && editingHeight?.heightPointIdx === hpi;
          ctx.beginPath();
          ctx.rect(sp.x - r, sp.y - r, r * 2, r * 2);
          ctx.fillStyle = isH || isEdit ? C.geo : (isGeodesy ? C.geo : C.textDim);
          ctx.fill();
          ctx.strokeStyle = isH || isEdit ? "#fff" : C.point;
          ctx.lineWidth = isH || isEdit ? 2 : 1;
          ctx.stroke();
          if (isGeodesy) {
            const hCm = hp.height * 100;
            ctx.font = "bold 14px 'JetBrains Mono',monospace";
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center"; ctx.textBaseline = "bottom";
            ctx.fillText((hCm >= 0 ? "+" : "") + hCm.toFixed(1) + " cm", sp.x, sp.y - r - 4);
          }
        });
      }

      // Rubber band
      if (isDraw && pts.length > 0) {
        const last = pts[pts.length - 1];
        const sl = worldToScreen(last.x, last.y);
        const sm = worldToScreen(eMouse.x, eMouse.y);

        ctx.strokeStyle = C.open; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
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
        }

        if (shiftHeld) {
          const snapped = isPathElement(shapes[drawingShapeIdx]) ? snapTo45Soft(last, mouseWorld) : snapTo45(last, mouseWorld);
          const dir = { x: snapped.x - last.x, y: snapped.y - last.y };
          const dLen = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
          if (dLen > 1) {
            const nx = dir.x / dLen, ny = dir.y / dLen, ext = 5000;
            const sA = worldToScreen(last.x - nx * ext, last.y - ny * ext);
            const sB = worldToScreen(last.x + nx * ext, last.y + ny * ext);
            ctx.strokeStyle = C.snapLine; ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
            ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        const liveLen = distance(last, eMouse);
        const lm = midpoint(sl, sm);
        ctx.font = "12px 'JetBrains Mono',monospace";
        ctx.fillStyle = C.text; ctx.textAlign = "center";
        ctx.fillText(formatLength(liveLen), lm.x, lm.y - 12);

        if (pts.length >= 2) {
          const prev = pts[pts.length - 2];
          const angle = angleDeg(prev, last, eMouse);
          const sc = worldToScreen(last.x, last.y);
          ctx.font = "11px 'JetBrains Mono',monospace";
          ctx.fillStyle = C.angleText; ctx.textAlign = "center";
          ctx.fillText(angle.toFixed(1) + "°", sc.x, sc.y - 20);
        }

        if (pts.length >= 3) {
          const ss = worldToScreen(pts[0].x, pts[0].y);
          if (distance(sm, ss) < SNAP_TO_START_RADIUS) {
            ctx.beginPath(); ctx.arc(ss.x, ss.y, 14, 0, Math.PI * 2);
            ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke();
            ctx.font = "10px 'JetBrains Mono',monospace";
            ctx.fillStyle = C.accent; ctx.fillText("Close", ss.x, ss.y - 20);
          }
        }
      }
    });

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
        ctx.fillStyle = C.adjustmentEmpty;
        ctx.fill();
        ctx.strokeStyle = C.adjustmentEmptyStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
      // Overflow — red fill + outline
      adjustmentData.overflowAreas.forEach(({ overflowPolygons }) => {
        overflowPolygons.forEach(poly => {
          ctx.beginPath();
          drawPolygon(poly);
          ctx.fillStyle = C.adjustmentOverflow;
          ctx.fill();
          ctx.strokeStyle = C.adjustmentOverflowStroke;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      });
      // Overlaps — dark orange
      adjustmentData.overlaps.forEach(({ overlapPolygon }) => {
        ctx.beginPath();
        drawPolygon(overlapPolygon);
        ctx.fillStyle = C.adjustmentOverlap;
        ctx.fill();
        ctx.strokeStyle = C.adjustmentOverlapStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

    // Pulsing indicator on open endpoints (never show for linear elements — fence, wall, kerb, foundation)
    if (mode === "select" && drawingShapeIdx === null) {
      shapes.forEach((shape) => {
        if (!passesViewFilter(shape, viewFilter, activeLayer)) return;
        if (shape.layer !== activeLayer) return;
        if (isLinearElement(shape)) return;
        if (!shape.closed && shape.points.length >= 1) {
          const ends = shape.points.length === 1 ? [shape.points[0]] : [shape.points[0], shape.points[shape.points.length - 1]];
          ends.forEach(lp => {
            const sp = worldToScreen(lp.x, lp.y);
            const pulseT = (Date.now() % 2000) / 2000;
            const pulse = 10 + Math.sin(pulseT * Math.PI * 2) * 3;
            ctx.beginPath(); ctx.arc(sp.x, sp.y, pulse, 0, Math.PI * 2);
            ctx.strokeStyle = C.open; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
            ctx.font = "10px 'JetBrains Mono',monospace";
            ctx.fillStyle = C.open; ctx.textAlign = "center";
            ctx.fillText(t("project:canvas_continue"), sp.x, sp.y - 18);
          });
        }
      });
    }

    // Selected points highlight
    selectedPoints.forEach(({ shapeIdx: si, pointIdx: pi }) => {
      if (shapes[si] && shapes[si].points[pi]) {
        const p = shapes[si].points[pi];
        const sp = worldToScreen(p.x, p.y);
        ctx.beginPath(); ctx.arc(sp.x, sp.y, POINT_RADIUS + 4, 0, Math.PI * 2);
        ctx.strokeStyle = C.danger; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(sp.x, sp.y, POINT_RADIUS + 8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,71,87,0.15)"; ctx.fill();
      }
    });

    // Selection rectangle
    if (selectionRect) {
      const x = Math.min(selectionRect.startX, selectionRect.endX);
      const y = Math.min(selectionRect.startY, selectionRect.endY);
      const w = Math.abs(selectionRect.endX - selectionRect.startX);
      const h = Math.abs(selectionRect.endY - selectionRect.startY);
      ctx.fillStyle = "rgba(255,71,87,0.08)"; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = C.danger; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    }

    // HUD
    ctx.font = "11px 'JetBrains Mono',monospace";
    ctx.fillStyle = C.textDim; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    let hud = `${toMeters(mouseWorld.x).toFixed(2)}, ${toMeters(mouseWorld.y).toFixed(2)} m  |  zoom: ${(zoom * 100).toFixed(0)}%  |  Layer ${activeLayer}`;
    if (shiftHeld) hud += "  |  SNAP 45°";
    if (drawingShapeIdx !== null && mode === "freeDraw") hud += "  |  Drawing (Esc = cancel)";
    if (mode === "drawFence") hud += "  |  FENCE: click to place points, Esc to finish";
    else if (mode === "drawWall") hud += "  |  WALL: click to place points, Esc to finish";
    else if (mode === "drawKerb") hud += "  |  KERB: click to place points, Esc to finish";
    else if (mode === "drawFoundation") hud += "  |  FOUNDATION: click to place points, Esc to finish";
    else if (mode === "drawPathSlabs") hud += "  |  PATH (Slabs): click to place points, PPM to finish";
    else if (mode === "drawPathConcreteSlabs") hud += "  |  PATH (Concrete Slabs): click to place points, PPM to finish";
    else if (mode === "drawPathMonoblock") hud += "  |  PATH (Monoblock): click to place points, PPM to finish";
    if (mode === "scale") hud += "  |  SCALE: corner = proportional, edge = move";
    if (mode === "move") hud += "  |  MOVE: left click anywhere to pan";
    if (geodesyEnabled) hud += "  |  GEODESY: click point → set height, click area → show height";
    ctx.fillText(hud, 10, H - 10);

    // Height tooltip (geodesy mode): click on L1 shape interior
    if (geodesyEnabled && clickedHeightTooltip) {
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
      ctx.fillStyle = C.geo;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(text, sp.x, sp.y - 14);
    }
  }, [shapes, selectedShapeIdx, selectedPattern, patternDragInfo, patternDragPreview, patternAlignedEdges, patternRotateInfo, patternRotatePreview, mode, drawingShapeIdx, mouseWorld, pan, zoom, canvasSize, hoveredPoint, hoveredEdge, hoveredHeightPoint, dragInfo, editingDim, worldToScreen, shiftHeld, selectedPoints, selectionRect, rotateInfo, activeLayer, draggingGrassPiece, grassAlignedPolyEdges, clickedHeightTooltip, geodesyEnabled, showAllArcPoints, linkedGroups, viewFilter, adjustmentData, t]);

  // Clear height tooltip when disabling geodesy
  useEffect(() => {
    if (!geodesyEnabled) setClickedHeightTooltip(null);
  }, [geodesyEnabled]);

  // Pulse animation
  useEffect(() => {
    if (shapes.some(s => !s.closed && s.layer === activeLayer) && drawingShapeIdx === null && mode === "select") {
      const id = setInterval(() => setMouseWorld(m => ({ ...m })), 50);
      return () => clearInterval(id);
    }
  }, [shapes, drawingShapeIdx, mode, activeLayer]);

  // ── Hit Tests (active layer only) ─────────────────────
  const hitTestPoint = useCallback((wp: Point): HitResult | null => {
    const th = POINT_RADIUS / zoom + 4;
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
  }, [shapes, zoom, isOnActiveLayer, selectedShapeIdx, viewFilter]);

  const hitTestHeightPoint = useCallback((wp: Point): { shapeIdx: number; heightPointIdx: number } | null => {
    const th = (POINT_RADIUS * 1.2) / zoom + 4;
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
  }, [shapes, zoom, isOnActiveLayer, selectedShapeIdx]);

  const hitTestEdge = useCallback((wp: Point): EdgeHitResult | null => {
    const th = EDGE_HIT_THRESHOLD / zoom + 2;
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
  }, [shapes, zoom, isOnActiveLayer, selectedShapeIdx, viewFilter]);

  const hitTestPointForScale = useCallback((wp: Point): HitResult | null => {
    const th = POINT_RADIUS / zoom + 4;
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
  }, [shapes, zoom, isOnActiveLayerForScale, selectedShapeIdx, viewFilter]);

  const hitTestEdgeForScale = useCallback((wp: Point): EdgeHitResult | null => {
    const th = EDGE_HIT_THRESHOLD / zoom + 2;
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
        const joinHit = hitTestGrassJoinEdge(wp, shape, GRASS_EDGE_HIT_PX / zoom);
        if (joinHit) return { shapeIdx: si, type: "grass", grassJoinHit: joinHit };
        const edgeHit = hitTestGrassPieceEdge(wp, shape, GRASS_EDGE_HIT_PX / zoom);
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
  }, [shapes, zoom, viewFilter]);

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

  const arcHitThreshold = (POINT_RADIUS / zoom + 4) * (PIXELS_PER_METER / 80);
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
    if (showAllArcPoints) {
      for (let si = shapes.length - 1; si >= 0; si--) {
        if (si === selectedShapeIdx) continue;
        const hit = testShape(si);
        if (hit) return hit;
      }
    }
    return null;
  }, [shapes, selectedShapeIdx, zoom, isOnActiveLayer, viewFilter, showAllArcPoints]);

  const getWorldPos = useCallback((e: React.MouseEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return screenToWorld(e.clientX - r.left, e.clientY - r.top);
  }, [screenToWorld]);

  // ── Mouse Handlers ─────────────────────────────────────
  const skipBlurRef = useRef(false);
  const applyHeightEditRef = useRef<((fromBlur?: boolean) => void) | null>(null);
  const heightInputSelectOnceRef = useRef(false);
  const rightClickScaleTriggeredRef = useRef(false);
  /** Pending right-click scale: activate only on drag (not on single click). Single click = context menu. */
  const RIGHT_CLICK_SCALE_DRAG_THRESHOLD_PX = 5;
  const EDGE_CLICK_DRAG_THRESHOLD_PX = 5;
  /** Pending edge add for linear elements: add point only on mouseup if no drag. Drag = move whole shape. */
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
    if (e.button === 0) {
      setDismissedLayerHints(prev => { const next = new Set(prev); next.add(activeLayer); return next; });
    }
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
          const edgeHit = hitTestGrassPieceEdge(world, shape, GRASS_EDGE_HIT_PX / zoom);
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

    // Currently drawing
    if (drawingShapeIdx !== null && shapes[drawingShapeIdx]) {
      const pts = shapes[drawingShapeIdx].points;
      const s = shapes[drawingShapeIdx];
      const snapFn = isPathElement(s) ? snapTo45Soft : snapTo45;
      let ep = shiftHeld && pts.length > 0 ? snapFn(pts[pts.length - 1], world) : world;

      // Smart guide alignment snap for placed point
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
            const pathWidthM = Number(s.calculatorInputs?.pathWidthM ?? 0.6) || 0.6;
            const thicknessPx = toPixels(pathWidthM);
            const pathPts = s.edgeArcs?.some(a => a && a.length > 0) ? getLinearElementPath(s) : s.points;
            const outline = computeThickPolyline(pathPts, thicknessPx);
            setShapes(p => {
              const n = [...p];
              const sh = n[drawingShapeIdx];
              if (outline.length >= 3) {
                n[drawingShapeIdx] = {
                  ...sh,
                  points: outline,
                  closed: true,
                  drawingFinished: true,
                  calculatorInputs: {
                    ...sh.calculatorInputs,
                    pathIsOutline: true,
                    pathCenterline: pathPts.map(p => ({ ...p })),
                    pathCenterlineOriginal: s.points.map(p => ({ ...p })),
                  },
                };
              } else {
                n[drawingShapeIdx] = { ...sh, closed: true, drawingFinished: true };
              }
              return n;
            });
            setPathConfig(null);
            if (!s.namePromptShown) setNamePromptShapeIdx(drawingShapeIdx);
            setDrawingShapeIdx(null); setSelectedShapeIdx(drawingShapeIdx); setMode("select"); return;
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
            const closedPath = [...pts, pts[0]];
            const thicknessM = getPolygonThicknessM(s);
            const outline = computeThickPolyline(closedPath, toPixels(thicknessM));
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
        const n = [...p]; const s = { ...n[drawingShapeIdx] };
        s.points = [...s.points, { ...ep }];
        s.heights = [...(s.heights || []), 0];
        n[drawingShapeIdx] = s; return n;
      });
      return;
    }

    // Geodesy (toggle): click point to edit height, or click L1 shape interior to show interpolated height.
    if (geodesyEnabled) {
      const hpHit = hitTestHeightPoint(world);
      if (hpHit) {
        setClickedHeightTooltip(null);
        if (editingHeight) applyHeightEditRef.current?.();
        skipBlurRef.current = true;
        heightInputSelectOnceRef.current = false;
        setSelectedShapeIdx(hpHit.shapeIdx);
        const hp = shapes[hpHit.shapeIdx].heightPoints![hpHit.heightPointIdx];
        const sp = worldToScreen(hp.x, hp.y);
        const r = canvasRef.current!.getBoundingClientRect();
        setEditingHeight({ shapeIdx: hpHit.shapeIdx, pointIdx: -1, heightPointIdx: hpHit.heightPointIdx, x: r.left + sp.x, y: r.top + sp.y - 30 });
        setHeightValue((hp.height * 100).toFixed(1)); // cm
        requestAnimationFrame(() => { skipBlurRef.current = false; });
        return;
      }
      const ptHit = hitTestPoint(world);
      if (ptHit) {
        setClickedHeightTooltip(null);
        if (editingHeight) applyHeightEditRef.current?.();
        skipBlurRef.current = true;
        heightInputSelectOnceRef.current = false;
        setSelectedShapeIdx(ptHit.shapeIdx);
        const sp = worldToScreen(shapes[ptHit.shapeIdx].points[ptHit.pointIdx].x, shapes[ptHit.shapeIdx].points[ptHit.pointIdx].y);
        const r = canvasRef.current!.getBoundingClientRect();
        const hM = shapes[ptHit.shapeIdx].heights?.[ptHit.pointIdx] ?? 0;
        setEditingHeight({ shapeIdx: ptHit.shapeIdx, pointIdx: ptHit.pointIdx, x: r.left + sp.x, y: r.top + sp.y - 30 });
        setHeightValue((hM * 100).toFixed(1)); // cm
        requestAnimationFrame(() => { skipBlurRef.current = false; });
        return;
      }
      applyHeightEditRef.current?.();
      setEditingHeight(null);
      setSelectedShapeIdx(null);
      // Click on L1 shape interior (not on vertex) → show interpolated height
      for (let si = shapes.length - 1; si >= 0; si--) {
        const shape = shapes[si];
        if (!passesViewFilter(shape, viewFilter, activeLayer)) continue;
        if (shape.layer !== 1 || !shape.closed || shape.points.length < 3) continue;
        if (!pointInPolygon(world, shape.points)) continue;
        const h = interpolateHeightAtPoint(shape, world);
        if (h !== null) {
          setClickedHeightTooltip({ world, shapeIdx: si, height: h });
        }
        return;
      }
      setClickedHeightTooltip(null);
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // Clear height UI when not in geodesy mode (we didn't enter the geodesy block above)
    setEditingHeight(null);
    setClickedHeightTooltip(null);

    // Select mode
    if (mode === "select") {
      if (activeLayer === 3) {
        // Check rotation handle first (above shape — may not be inside pattern hit area)
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          for (let si = 0; si < shapes.length; si++) {
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
              if (shape.calculatorType === "grass" && (shape.calculatorInputs?.vizPieces?.length ?? 0) > 0) {
                saveHistory();
                const dirDeg = Number(shape.calculatorInputs?.grassVizDirection ?? shape.calculatorInputs?.vizDirection ?? 0);
                setPatternRotateInfo({ shapeIdx: si, type: "grass", center: { ...ctr }, startAngle: Math.atan2(world.y - ctr.y, world.x - ctr.x), startDirectionDeg: dirDeg });
                setPatternRotatePreview(null);
                setSelectedPattern({ shapeIdx: si, type: "grass" });
                setSelectedShapeIdx(si);
                return;
              }
              if ((shape.calculatorType === "slab" || shape.calculatorType === "concreteSlabs" || shape.calculatorType === "paving") && shape.calculatorInputs?.vizSlabWidth) {
                saveHistory();
                const dirDeg = Number(shape.calculatorInputs?.vizDirection ?? 0);
                const patType = shape.calculatorType === "paving" ? "cobblestone" : "slab";
                setPatternRotateInfo({ shapeIdx: si, type: patType, center: { ...ctr }, startAngle: Math.atan2(world.y - ctr.y, world.x - ctr.x), startDirectionDeg: dirDeg });
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
            const edgeHit = hitTestGrassPieceEdge(world, shape, GRASS_EDGE_HIT_PX / zoom);
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
                saveHistory();
                const dirDeg = Number(shape.calculatorInputs?.vizDirection ?? 0);
                setPatternRotateInfo({ shapeIdx: patternHit.shapeIdx, type: patternHit.type, center: { ...ctr }, startAngle: Math.atan2(world.y - ctr.y, world.x - ctr.x), startDirectionDeg: dirDeg });
                setPatternRotatePreview(null);
                return;
              }
            }
            saveHistory();
            const inp = shapes[patternHit.shapeIdx].calculatorInputs ?? {};
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
        setIsPanning(true); setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
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
        setArcDragInfo({ shapeIdx: arcHit.shapeIdx, edgeIdx: arcHit.edgeIdx, arcPoint: arcHit.arcPoint, startMouse: { ...world } });
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
        if (isLinearElement(hitShape)) {
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
        saveHistory();
        const ns = [...shapes]; const s = { ...ns[edgeHit.shapeIdx] }; const np = [...s.points];
        const ei = edgeHit.edgeIdx;
        np.splice(ei + 1, 0, { ...edgeHit.pos }); s.points = np;
        // Update heights: insert 0 at new point position
        const nh = [...(s.heights || Array(s.points.length).fill(0))]; nh.splice(ei + 1, 0, 0); s.heights = nh;
        if (s.elementType === "wall" && s.calculatorInputs) {
          const inputs = { ...s.calculatorInputs };
          const segHeights = [...(inputs.segmentHeights as Array<{ startH: number; endH: number }> ?? [])];
          const defH = parseFloat(String(inputs.height ?? "1")) || 1;
          const newSeg = { startH: defH, endH: defH };
          if (segHeights.length === np.length - 2) {
            segHeights.splice(ei + 1, 0, newSeg);
            inputs.segmentHeights = segHeights;
          } else {
            inputs.segmentHeights = Array.from({ length: np.length - 1 }, () => ({ startH: defH, endH: defH }));
          }
          s.calculatorInputs = inputs;
        }
        // Update lockedEdges: shift indices after insertion, split the locked edge
        s.lockedEdges = s.lockedEdges.filter(e => e.idx !== ei).map(e => e.idx > ei ? { ...e, idx: e.idx + 1 } : e);
        // Update lockedAngles: shift indices after insertion
        s.lockedAngles = s.lockedAngles.map(a => a > ei ? a + 1 : a);
        ns[edgeHit.shapeIdx] = s;
        setShapes(ns); setSelectedShapeIdx(edgeHit.shapeIdx);
        setDragInfo({ shapeIdx: edgeHit.shapeIdx, pointIdx: ei + 1, startMouse: { ...world }, startPoint: { ...edgeHit.pos } });
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
      const label = mode === "drawPathSlabs" ? "Path Slabs" : mode === "drawPathConcreteSlabs" ? "Path Concrete Slabs" : "Path Monoblock";
      const newIdx = shapes.length;
      setShapes(p => [...p, {
        points: [{ ...world }], closed: false,
        label,
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
        thickness: 0.10,
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
  }, [mode, shapes, drawingShapeIdx, pan, zoom, shiftHeld, ctrlHeld, geodesyEnabled, getWorldPos, hitTestPoint, hitTestHeightPoint, hitTestEdge, hitTestShape, hitTestOpenEnd, hitTestPattern, hitTestPointForScale, hitTestEdgeForScale, hitTestGrassPieceEdge, worldToScreen, saveHistory, selectedShapeIdx, isOnActiveLayer, activeLayer, editingHeight]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const world = getWorldPos(e);

    cancelAnimationFrame(mouseRafRef.current);
    mouseRafRef.current = requestAnimationFrame(() => {
      setMouseWorld(world);
    });

    // Activate edge drag from pending edge add (linear elements): drag = move only that edge, click = add point
    const pendingEdge = pendingEdgeAddRef.current;
    if (pendingEdge && (e.buttons & 1)) {
      const r = canvasRef.current!.getBoundingClientRect();
      const screenX = e.clientX - r.left, screenY = e.clientY - r.top;
      const dist = Math.sqrt((screenX - pendingEdge.startScreen.x) ** 2 + (screenY - pendingEdge.startScreen.y) ** 2);
      if (dist >= EDGE_CLICK_DRAG_THRESHOLD_PX) {
        const si = pendingEdge.shapeIdx;
        const pts = shapes[si].points;
        const ei = pendingEdge.edgeIdx;
        const p0 = pts[ei];
        const p1 = pts[ei + 1];
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
        const dx = world.x - startMouse.x;
        const dy = world.y - startMouse.y;
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
      const dx = world.x - patternDragInfo.startMouse.x;
      const dy = world.y - patternDragInfo.startMouse.y;
      const rawOffset = { x: patternDragInfo.startOffset.x + dx, y: patternDragInfo.startOffset.y + dy };
      const shape = shapes[patternDragInfo.shapeIdx];
      if (shape) {
        const { snappedOffset, alignedEdges } = computePatternSnap(shape, rawOffset, PATTERN_SNAP_PX / zoom);
        setPatternDragPreview(snappedOffset);
        setPatternAlignedEdges(alignedEdges);
      } else {
        setPatternDragPreview(rawOffset);
        setPatternAlignedEdges([]);
      }
      return;
    }

    if (patternRotateInfo) {
      const currAngle = Math.atan2(world.y - patternRotateInfo.center.y, world.x - patternRotateInfo.center.x);
      const deltaDeg = ((currAngle - patternRotateInfo.startAngle) * 180) / Math.PI;
      let newDir = patternRotateInfo.startDirectionDeg + deltaDeg;
      newDir = ((newDir % 360) + 360) % 360;
      setPatternRotatePreview(snapAngleTo45(newDir));
      return;
    }

    // Linear element edge drag: move only the two endpoints of the edge, connected segments stretch/rotate
    if (edgeDragInfo) {
      const dx = world.x - edgeDragInfo.startMouse.x;
      const dy = world.y - edgeDragInfo.startMouse.y;
      const newP0 = { x: edgeDragInfo.startP0.x + dx, y: edgeDragInfo.startP0.y + dy };
      const newP1 = { x: edgeDragInfo.startP1.x + dx, y: edgeDragInfo.startP1.y + dy };
      const magThreshold = SNAP_MAGNET_PX / zoom;
      const edgeMid = midpoint(newP0, newP1);
      const snap = snapMagnet(edgeMid, shapes, edgeDragInfo.shapeIdx, magThreshold);
      const off = snap.didSnap ? { x: snap.snapped.x - edgeMid.x, y: snap.snapped.y - edgeMid.y } : { x: 0, y: 0 };
      const finalP0 = { x: newP0.x + off.x, y: newP0.y + off.y };
      const finalP1 = { x: newP1.x + off.x, y: newP1.y + off.y };
      setShapes(p => {
        const n = [...p];
        const s = { ...n[edgeDragInfo.shapeIdx] };
        const np = [...s.points];
        np[edgeDragInfo.edgeIdx] = finalP0;
        np[edgeDragInfo.edgeIdx + 1] = finalP1;
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
      const snap = snapMagnet(draggedPt, shapes, scaleCorner.shapeIdx, magThreshold);
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
      const snap = snapMagnet(edgeMid, shapes, scaleEdge.shapeIdx, magThreshold);
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
      const sw = screenToWorld(mouseX, mouseY);
      const A = shapes[arcDragInfo.shapeIdx].points[arcDragInfo.edgeIdx];
      const B = shapes[arcDragInfo.shapeIdx].points[(arcDragInfo.edgeIdx + 1) % shapes[arcDragInfo.shapeIdx].points.length];
      let { t, offset } = dragArcPoint(A, B, sw.x, sw.y);
      const magThreshold = ARC_SNAP_PX / zoom;
      const snapped = snapArcPoint(A, B, t, offset, shapes, arcDragInfo.shapeIdx, { shapeIdx: arcDragInfo.shapeIdx, edgeIdx: arcDragInfo.edgeIdx }, magThreshold);
      if (snapped.didSnap) { t = snapped.t; offset = snapped.offset; }
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
        // Move linked entries (arc or vertex) to match this arc point's new world position
        const dragEntry: LinkedEntry = { si: arcDragInfo.shapeIdx, pi: -1 as const, edgeIdx: arcDragInfo.edgeIdx, arcId: arcDragInfo.arcPoint.id };
        const group = linkedGroups.find(g => g.some(lp => linkedEntriesMatch(lp, dragEntry)));
        if (group) {
          const newWorldPos = arcPointToWorld(
            n[arcDragInfo.shapeIdx].points[arcDragInfo.edgeIdx],
            n[arcDragInfo.shapeIdx].points[(arcDragInfo.edgeIdx + 1) % n[arcDragInfo.shapeIdx].points.length],
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
                const { t: lt, offset: lo } = worldToArcPoint(lA, lB, newWorldPos);
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
      return;
    }

    if (dragInfo) {
      let target = world;
      const shape = shapes[dragInfo.shapeIdx]; const pts = shape.points; const pi = dragInfo.pointIdx;
      const prevI = (pi - 1 + pts.length) % pts.length, nextI = (pi + 1) % pts.length;

      // Locked angle: this point cannot move at all
      if (shape.closed && shape.lockedAngles.includes(pi)) {
        return; // don't move this point
      }

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
                  const { t: lt, offset: lo } = worldToArcPoint(lA, lB, target);
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
  }, [isPanning, panStart, dragInfo, arcDragInfo, draggingGrassPiece, grassScaleInfo, patternDragInfo, patternRotateInfo, mode, shapes, shiftHeld, drawingShapeIdx, selectionRect, shapeDragInfo, edgeDragInfo, rotateInfo, scaleCorner, scaleEdge, getWorldPos, hitTestPoint, hitTestHeightPoint, hitTestEdge, hitTestArcPointGlobal, zoom, geodesyEnabled, saveHistory]);

  const handleMouseUp = useCallback(() => {
    pendingRightClickScaleRef.current = null; // Clear pending if user released without dragging

    // Pending edge add (linear elements): add point only if user released without dragging
    const pendingEdge = pendingEdgeAddRef.current;
    if (pendingEdge) {
      pendingEdgeAddRef.current = null;
      saveHistory();
      const ei = pendingEdge.edgeIdx;
      const pos = pendingEdge.pos;
      setShapes(p => {
        const ns = [...p];
        const s = { ...ns[pendingEdge.shapeIdx] };
        const np = [...s.points];
        np.splice(ei + 1, 0, { ...pos });
        s.points = np;
        const nh = [...(s.heights || Array(s.points.length).fill(0))];
        nh.splice(ei + 1, 0, 0);
        s.heights = nh;
        if (s.elementType === "wall" && s.calculatorInputs) {
          const inputs = { ...s.calculatorInputs };
          const segHeights = [...(inputs.segmentHeights as Array<{ startH: number; endH: number }> ?? [])];
          const defH = parseFloat(String(inputs.height ?? "1")) || 1;
          const newSeg = { startH: defH, endH: defH };
          if (segHeights.length === np.length - 2) {
            segHeights.splice(ei + 1, 0, newSeg);
            inputs.segmentHeights = segHeights;
          } else {
            inputs.segmentHeights = Array.from({ length: np.length - 1 }, () => ({ startH: defH, endH: defH }));
          }
          s.calculatorInputs = inputs;
        }
        s.lockedEdges = s.lockedEdges.filter(e => e.idx !== ei).map(e => e.idx > ei ? { ...e, idx: e.idx + 1 } : e);
        s.lockedAngles = s.lockedAngles.map(a => a > ei ? a + 1 : a);
        ns[pendingEdge.shapeIdx] = s;
        return ns;
      });
      setSelectedShapeIdx(pendingEdge.shapeIdx);
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
          const effectiveAreaM2 = getEffectiveTotalArea(pieces);
          const vizPiecesWithEffective = pieces.map((p, i) => {
            const { effectiveWidthM, effectiveLengthM } = getEffectivePieceDimensionsForInput(p, pieces, i);
            return { ...p, effectiveWidthM, effectiveLengthM };
          });
          const inputs = { ...s.calculatorInputs, vizPieces: vizPiecesWithEffective, effectiveAreaM2, jointsLength: String(cov.joinLengthM.toFixed(2)), trimLength: String(cov.trimLengthM.toFixed(2)) };
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
          const effectiveAreaM2 = getEffectiveTotalArea(pieces);
          const vizPiecesWithEffective = pieces.map((p, i) => {
            const { effectiveWidthM, effectiveLengthM } = getEffectivePieceDimensionsForInput(p, pieces, i);
            return { ...p, effectiveWidthM, effectiveLengthM };
          });
          const inputs = { ...s.calculatorInputs, vizPieces: vizPiecesWithEffective, effectiveAreaM2, jointsLength: String(cov.joinLengthM.toFixed(2)), trimLength: String(cov.trimLengthM.toFixed(2)) };
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
      const finalOffset = patternDragPreview ?? patternDragInfo.startOffset;
      setShapes(p => {
        const n = [...p];
        const s = { ...n[si] };
        const inputs = { ...s.calculatorInputs, vizOriginOffsetX: finalOffset.x, vizOriginOffsetY: finalOffset.y, vizAlignedEdges: patternAlignedEdges ?? [] };
        n[si] = { ...s, calculatorInputs: inputs };
        return n;
      });
      setPatternDragInfo(null);
      setPatternDragPreview(null);
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
      setArcDragInfo(null);
      return;
    }
    if (selectionRect) {
      const minX = Math.min(selectionRect.startX, selectionRect.endX);
      const maxX = Math.max(selectionRect.startX, selectionRect.endX);
      const minY = Math.min(selectionRect.startY, selectionRect.endY);
      const maxY = Math.max(selectionRect.startY, selectionRect.endY);
      const selected: HitResult[] = [];
      shapes.forEach((shape, si) => {
        if (!isOnActiveLayer(si) || !passesViewFilter(shape, viewFilter, activeLayer)) return;
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
  }, [selectionRect, shapes, worldToScreen, dragInfo, mouseWorld, patternDragInfo, patternDragPreview, patternAlignedEdges, patternRotateInfo, patternRotatePreview, shapeDragInfo, rotateInfo, scaleCorner, scaleEdge, isOnActiveLayer, zoom, draggingGrassPiece, grassNearEdge, grassScaleInfo, viewFilter, arcDragInfo]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (e.buttons & 4) return; // Środkowy przycisk wciśnięty – nie zoomuj podczas panowania
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const f = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(z => {
      const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * f));
      const ratio = nz / z;
      setPan(p => ({ x: sx - ratio * (sx - p.x), y: sy - ratio * (sy - p.y) }));
      return nz;
    });
  }, []);

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
    if (drawingShapeIdx !== null) {
      const s = shapes[drawingShapeIdx];
      if (s && s.points.length >= 2 && isPathElement(s)) {
        saveHistory();
        const pathWidthM = Number(s.calculatorInputs?.pathWidthM ?? 0.6) || 0.6;
        const thicknessPx = toPixels(pathWidthM);
        const pathPts = s.edgeArcs?.some(a => a && a.length > 0) ? getLinearElementPath(s) : s.points;
        const outline = computeThickPolyline(pathPts, thicknessPx);
        setShapes(p => {
          const n = [...p];
          const sh = n[drawingShapeIdx];
          if (outline.length >= 3) {
            n[drawingShapeIdx] = {
              ...sh,
              points: outline,
              closed: true,
              drawingFinished: true,
              calculatorInputs: {
                ...sh.calculatorInputs,
                pathIsOutline: true,
                pathCenterline: pathPts.map(p => ({ ...p })),
                pathCenterlineOriginal: s.points.map(p => ({ ...p })),
              },
            };
          } else {
            n[drawingShapeIdx] = { ...sh, drawingFinished: true };
          }
          return n;
        });
        setPathConfig(null);
        if (!s.namePromptShown) setNamePromptShapeIdx(drawingShapeIdx);
        setDrawingShapeIdx(null); setMode("select"); return;
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
          const outline = computeThickPolyline(pathPts, toPixels(thicknessM));
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
      // Hit test adjustment areas (empty, overflow, overlap) — check polygons first
      for (let i = 0; i < adjustmentData.emptyAreas.length; i++) {
        if (pointInPolygon(w, adjustmentData.emptyAreas[i])) {
          setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: -1, pointIdx: -1, edgeIdx: -1, adjustmentEmpty: { emptyAreaIdx: i } });
          return;
        }
      }
      for (const { shapeIdx: si, overflowPolygons } of adjustmentData.overflowAreas) {
        for (let i = 0; i < overflowPolygons.length; i++) {
          if (pointInPolygon(w, overflowPolygons[i])) {
            setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: si, pointIdx: -1, edgeIdx: -1, adjustmentOverflow: { shapeIdx: si } });
            return;
          }
        }
      }
      for (let i = 0; i < adjustmentData.overlaps.length; i++) {
        const { shapeIdxA, shapeIdxB, overlapPolygon } = adjustmentData.overlaps[i];
        if (pointInPolygon(w, overlapPolygon)) {
          setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: shapeIdxA, pointIdx: -1, edgeIdx: -1, adjustmentOverlap: { shapeIdxA, shapeIdxB, overlapIdx: i } });
          return;
        }
      }
      // Fall through to normal shape/point/edge hit if not on adjustment area
    }
    if (activeLayer === 4) {
      // Larger hit radius for groundwork so PPM on segment reliably gives edge menu (Usuń segment)
      const th = GRASS_EDGE_HIT_PX / zoom + 4;
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
      // Check edge hit first — so PPM on linear segment gives edge menu (Usuń segment), not shape menu
      // When on layer 3, hitTestEdge uses isOnActiveLayer which is false; so we manually check layer 2 linear shapes
      // Groundwork is hidden on layer 3, so exclude it from edge hit
      const th = EDGE_HIT_THRESHOLD / zoom + 2;
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
      // Prefer linear elements (fence, wall) on layer 2 when right-clicking — e.g. fence on grass
      // Groundwork hidden on layer 3, so exclude from hit
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
      if (isPathElement(s) && s.calculatorInputs?.pathIsOutline && s.calculatorInputs?.pathCenterlineOriginal) {
        const outline = s.points;
        const n = outline.length / 2;
        if (edge.edgeIdx < n - 1) pathCenterlineEdgeIdx = edge.edgeIdx;
        else if (edge.edgeIdx === n - 1) pathCenterlineEdgeIdx = n - 2;
        else if (edge.edgeIdx >= n && edge.edgeIdx <= 2 * n - 2) pathCenterlineEdgeIdx = 2 * n - 2 - edge.edgeIdx;
      }
      setContextMenu({ x: e.clientX, y: e.clientY, shapeIdx: edge.shapeIdx, pointIdx: -1, edgeIdx: edge.edgeIdx, edgePos: edge.pos, edgeT: edge.t, pathCenterlineEdgeIdx });
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
  }, [getWorldPos, hitTestPoint, hitTestHeightPoint, hitTestArcPointGlobal, hitTestEdge, hitTestShape, hitTestPattern, shapes, drawingShapeIdx, activeLayer, zoom, viewFilter]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (activeLayer === 3 && selectedPattern) {
      setObjectCardShapeIdx(selectedPattern.shapeIdx);
      return;
    }
    for (let si = 0; si < shapes.length; si++) {
      if (!isOnActiveLayer(si)) continue;
      const pts = shapes[si].points;
      const ec = shapes[si].closed ? pts.length : pts.length - 1;
      for (let i = 0; i < ec; i++) {
        const j = (i + 1) % pts.length;
        const sa = worldToScreen(pts[i].x, pts[i].y), sb = worldToScreen(pts[j].x, pts[j].y);
        const mid = midpoint(sa, sb), norm = edgeNormalAngle(sa, sb);
        const lx = mid.x + Math.cos(norm) * 18, ly = mid.y + Math.sin(norm) * 18;
        const r = canvasRef.current!.getBoundingClientRect();
        if (Math.abs(e.clientX - r.left - lx) < 40 && Math.abs(e.clientY - r.top - ly) < 15) {
          setEditingDim({ shapeIdx: si, edgeIdx: i, x: e.clientX, y: e.clientY });
          setEditValue(toMeters(distance(pts[i], pts[j])).toFixed(3));
          return;
        }
      }
    }
  }, [shapes, worldToScreen, isOnActiveLayer, activeLayer, selectedPattern, viewFilter]);

  // ── Keyboard ───────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") { setEditingDim(null); setEditingHeight(null); }
        return;
      }
      if (e.key === "Escape") {
        if (drawingShapeIdx !== null) {
          const s = shapes[drawingShapeIdx];
          if (s && s.points.length >= 2 && (isLinearElement(s) || isPathElement(s)) && (["Wall", "Fence", "Kerb", "Foundation"].includes(s.label || "") || isPathElement(s)) && !s.namePromptShown) {
            setNamePromptShapeIdx(drawingShapeIdx);
          }
          if (s && isPathElement(s)) setPathConfig(null);
          setDrawingShapeIdx(null); setMode("select"); return;
        }
        setEditingDim(null); setEditingHeight(null); setContextMenu(null); setProjectSummaryContextMenu(null);
      }
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (editingDim || editingHeight) return; // don't delete while editing
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
  }, [mode, selectedShapeIdx, drawingShapeIdx, selectedPoints, saveHistory, undo, shapes]);

  // ── Actions ────────────────────────────────────────────
  const addShape = (factory: (cx: number, cy: number, layer: LayerID) => Shape) => {
    saveHistory();
    const cx = (canvasSize.w / 2 - pan.x) / zoom, cy = (canvasSize.h / 2 - pan.y) / zoom;
    setShapes(p => [...p, factory(cx, cy, (activeLayer === 3 || activeLayer === 4 ? 2 : activeLayer) as LayerID)]);
    setSelectedShapeIdx(shapes.length); setMode("select"); setDrawingShapeIdx(null);
  };

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

  const toggleLockAngle = (si: number, pi: number) => {
    setShapes(p => {
      const n = [...p]; const s = { ...n[si] };
      const locked = [...s.lockedAngles];
      const idx = locked.indexOf(pi);
      if (idx >= 0) locked.splice(idx, 1); else locked.push(pi);
      n[si] = { ...s, lockedAngles: locked }; return n;
    });
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

  /** Find all nearby linkable entries (vertices + arc points on other shapes) for a given world position. */
  const findNearbyLinkableEntries = (worldPos: Point, excludeSi: number, excludeArcId?: string): LinkedEntry[] => {
    const th = SNAP_MAGNET_PX / zoom * (PIXELS_PER_METER / 80);
    const out: LinkedEntry[] = [];
    for (let osi = 0; osi < shapes.length; osi++) {
      if (osi === excludeSi) continue;
      if (shapes[osi].layer !== activeLayer) continue;
      const s = shapes[osi];
      for (let pi = 0; pi < s.points.length; pi++) {
        if (distance(worldPos, s.points[pi]) < th) out.push({ si: osi, pi });
      }
      if (s.edgeArcs) {
        for (let ei = 0; ei < s.edgeArcs.length; ei++) {
          const arcs = s.edgeArcs[ei];
          if (!arcs) continue;
          for (const a of arcs) {
            if (a.id === excludeArcId) continue;
            const ap = arcPointToWorld(s.points[ei], s.points[(ei + 1) % s.points.length], a);
            if (distance(worldPos, ap) < th) out.push({ si: osi, pi: -1 as const, edgeIdx: ei, arcId: a.id });
          }
        }
      }
    }
    return out;
  };

  /** Link an arc point with nearby entries and edges. For edges: adds arc point (not vertex). */
  const linkArcPoint = (si: number, edgeIdx: number, ap: ArcPoint) => {
    const A = shapes[si].points[edgeIdx];
    const B = shapes[si].points[(edgeIdx + 1) % shapes[si].points.length];
    const sourcePos = arcPointToWorld(A, B, ap);
    const nearby = findNearbyLinkableEntries(sourcePos, si, ap.id);
    const edges = findAllEdgesPositionTouches(sourcePos, si);
    if (nearby.length === 0 && edges.length === 0) return;
    saveHistory();
    const arcEntry: LinkedEntry = { si, pi: -1 as const, edgeIdx, arcId: ap.id };
    const toLink: LinkedEntry[] = [arcEntry];
    setShapes(p => {
      let n = p.map(s => ({ ...s }));
      for (const lp of nearby) {
        if (!isArcEntry(lp) && n[lp.si]) {
          const s = n[lp.si]; const pts = [...s.points];
          pts[lp.pi] = { ...sourcePos }; n[lp.si] = { ...s, points: pts };
        }
        toLink.push(lp);
      }
      for (const e of edges) {
        const s = n[e.si];
        if (!s || s.points.length < 2) continue;
        const pts = s.points;
        const edgeA = pts[e.edgeIdx];
        const edgeB = pts[(e.edgeIdx + 1) % pts.length];
        const { t, offset } = worldToArcPoint(edgeA, edgeB, e.pos);
        const newArc: ArcPoint = { id: crypto.randomUUID(), t, offset };
        const edgeArcs = s.edgeArcs ? [...s.edgeArcs] : [];
        if (!edgeArcs[e.edgeIdx]) edgeArcs[e.edgeIdx] = [];
        const arcs = [...(edgeArcs[e.edgeIdx]!), newArc].sort((a, b) => a.t - b.t);
        edgeArcs[e.edgeIdx] = arcs;
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
      return arcPointToWorld(A, B, ap);
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
    const cur = distance(pts[ei], pts[j]);
    if (cur < 0.001) { setEditingDim(null); return; }
    const ratio = toPixels(val) / cur;
    const dx = pts[j].x - pts[ei].x, dy = pts[j].y - pts[ei].y;
    setShapes(p => {
      const n = [...p]; const s = { ...n[si] }; const np = [...s.points];
      np[j] = { x: pts[ei].x + dx * ratio, y: pts[ei].y + dy * ratio };
      s.points = np; n[si] = s; if (s.linkedShapeIdx != null && n[s.linkedShapeIdx]) n[s.linkedShapeIdx] = { ...n[s.linkedShapeIdx], points: [...np] }; return n;
    });
    setEditingDim(null);
  };

  const applyHeightEdit = (fromBlur = false) => {
    if (fromBlur && skipBlurRef.current) return;
    if (!editingHeight) return;
    const valCm = parseFloat(heightValue);
    if (isNaN(valCm)) { setEditingHeight(null); return; }
    const val = valCm / 100; // input in cm, store in meters
    const { shapeIdx: si, pointIdx: pi, heightPointIdx: hpi } = editingHeight;
    saveHistory();
    if (pi === -1 && hpi !== undefined) {
      setShapes(p => {
        const n = [...p]; const s = { ...n[si] };
        const hpList = [...(s.heightPoints ?? [])];
        if (hpi < hpList.length) {
          hpList[hpi] = { ...hpList[hpi], height: val };
          s.heightPoints = hpList;
          n[si] = s;
        }
        return n;
      });
      setEditingHeight(null);
      return;
    }
    setShapes(p => {
      const n = [...p];
      const s = { ...n[si] };
      const nh = [...(s.heights || s.points.map(() => 0))];
      while (nh.length < s.points.length) nh.push(0);
      nh[pi] = val; s.heights = nh;
      n[si] = s;
      const group = linkedGroups.find(g => g.some(lp => lp.si === si && lp.pi === pi));
      if (group) {
        for (const lp of group) {
          if (lp.si === si && lp.pi === pi) continue;
          if (n[lp.si]?.layer === 1) {
            const ls = { ...n[lp.si] };
            const lh = [...(ls.heights || ls.points.map(() => 0))];
            while (lh.length < ls.points.length) lh.push(0);
            lh[lp.pi] = val; ls.heights = lh; n[lp.si] = ls;
          }
        }
      }
      return n;
    });
    setEditingHeight(null);
  };
  applyHeightEditRef.current = applyHeightEdit;

  const switchLayer = (layer: ActiveLayer) => {
    setActiveLayer(layer);
    setSelectedShapeIdx(null);
    setDrawingShapeIdx(null);
    setClickedHeightTooltip(null);
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

  const LAYER_KEYS: Record<number, string> = { 1: "garden_label", 2: "elements_label", 3: "pattern_label", 4: "preparation_label" };

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
      const edgeHit = hitTestGrassPieceEdge(mouseWorld, shape, GRASS_EDGE_HIT_PX / zoom);
      if (edgeHit) cursor = "ew-resize";
    }
  }
  else if (isPanning) cursor = "grabbing";

  const l1Count = shapes.filter(s => s.layer === 1).length;
  const l2Count = shapes.filter(s => s.layer === 2).length;

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column", background: C.bg, fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace", color: C.text, overflow: "hidden", userSelect: "none" }}>
      {showRestoredToast && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: C.accent, color: C.bg, padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
          ✓ {t("project:restored_unsaved_sketch")}
        </div>
      )}
      {/* Toolbar — CAD Dark Professional */}
      <div className="toolbar-cad">
        {/* Row 1: Layer Tabs + Geodesy */}
        <div className="toolbar-row">
          <div className="layer-tabs">
            <button type="button" className={`layer-tab ${activeLayer === 1 ? "active" : ""}`} onClick={() => switchLayer(1)}>
              <span className="layer-dot garden" />
              {t("project:garden_label")}
              <span className="layer-count">{l1Count}</span>
            </button>
            <button type="button" className={`layer-tab ${activeLayer === 2 ? "active" : ""}`} onClick={() => switchLayer(2)}>
              <span className="layer-dot elements" />
              {t("project:elements_label")}
              <span className="layer-count">{l2Count}</span>
            </button>
            <button type="button" className={`layer-tab ${activeLayer === 3 ? "active" : ""}`} onClick={() => switchLayer(3)}>
              <span className="layer-dot pattern" />
              {t("project:pattern_label")}
            </button>
            <button type="button" className={`layer-tab ${activeLayer === 4 ? "active" : ""}`} onClick={() => switchLayer(4)}>
              <span className="layer-dot preparation" />
              {t("project:preparation_label")}
            </button>
            <button type="button" className={`layer-tab ${activeLayer === 5 ? "active" : ""}`} onClick={() => switchLayer(5)}>
              <span className="layer-dot adjustment" />
              {t("project:adjustment_label")}
            </button>
          </div>
          <div className="tb-spacer" />
          <button
            type="button"
            className={`geodesy-toggle ${geodesyEnabled ? "on" : "off"}`}
            onClick={() => { setGeodesyEnabled(v => !v); if (geodesyEnabled) setEditingHeight(null); }}
            title={geodesyEnabled ? t("project:toolbar_geodesy_on_tooltip") : t("project:toolbar_geodesy_off_tooltip")}
          >
            <span className="geodesy-indicator" />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3l4 8 5-5 7 11H0z" />
            </svg>
            {t("project:toolbar_geodesy")}
          </button>
        </div>

        {/* Row 2: Tools + Drawing + View filters + Delete + Counter */}
        <div className="toolbar-row">
          {/* Cursor / mode tools */}
          <div className="tool-group">
            <button type="button" className={`tool-btn ${mode === "select" && !drawingShapeIdx ? "active" : ""}`} onClick={() => { setDrawingShapeIdx(null); setMode("select"); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                <path d="M13 13l6 6" />
              </svg>
              {t("project:toolbar_select")}
            </button>
            <button type="button" className={`tool-btn ${mode === "freeDraw" ? "active" : ""}`} onClick={() => { setMode("freeDraw"); setSelectedShapeIdx(null); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" />
                <circle cx="11" cy="11" r="2" />
              </svg>
              {t("project:toolbar_draw")}
            </button>
            <button type="button" className={`tool-btn ${mode === "scale" ? "active" : ""}`} onClick={() => { setDrawingShapeIdx(null); setMode("scale"); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 3L3 21" /><path d="M21 3h-6" /><path d="M21 3v6" /><path d="M3 21h6" /><path d="M3 21v-6" />
              </svg>
              {t("project:toolbar_scale")}
            </button>
            <button type="button" className={`tool-btn ${mode === "move" ? "active" : ""}`} onClick={() => { setDrawingShapeIdx(null); setMode("move"); setSelectedShapeIdx(null); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 9l-3 3 3 3" /><path d="M9 5l3-3 3 3" /><path d="M15 19l-3 3-3-3" /><path d="M19 9l3 3-3 3" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" />
              </svg>
              {t("project:toolbar_view")}
            </button>
          </div>

          <div className="tb-sep" />

          {/* Drawing tools */}
          <div className="tool-group">
            {activeLayer !== 3 && (
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
                      { subType: "slabs" as const, icon: "▦", key: "toolbar_path_slabs", color: C.layer2Edge },
                      { subType: "concreteSlabs" as const, icon: "▣", key: "toolbar_path_concrete_slabs", color: C.layer2Edge },
                      { subType: "monoblock" as const, icon: "▤", key: "toolbar_path_monoblock", color: C.layer2Edge },
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
                      { mode: "drawFence" as const, icon: "⌇", key: "toolbar_linear_fence", color: C.fence },
                      { mode: "drawWall" as const, icon: "▥", key: "toolbar_linear_wall", color: C.wall },
                      { mode: "drawKerb" as const, icon: "╌", key: "toolbar_linear_kerb", color: C.kerb },
                      { mode: "drawFoundation" as const, icon: "▦", key: "toolbar_linear_foundation", color: C.foundation },
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
                      { mode: "drawDrainage" as const, icon: "⌇", key: "toolbar_groundwork_drainage", color: C.drainage },
                      { mode: "drawCanalPipe" as const, icon: "⌇", key: "toolbar_groundwork_canal_pipe", color: C.canalPipe },
                      { mode: "drawWaterPipe" as const, icon: "⌇", key: "toolbar_groundwork_water_pipe", color: C.waterPipe },
                      { mode: "drawCable" as const, icon: "⌇", key: "toolbar_groundwork_cable", color: C.cable },
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
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <canvas ref={canvasRef} style={{ width: canvasSize.w, height: canvasSize.h, cursor, display: "block" }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp} onContextMenu={handleContextMenu} onDoubleClick={handleDoubleClick} />

        {/* Porada + Skróty */}
        <div style={{ position: "absolute", bottom: 12, right: 12, zIndex: 40, display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={() => { setTipOpen(v => !v); setShortcutsOpen(false); }}
            style={{
              width: 28, height: 28, borderRadius: "50%", border: `1px solid ${C.panelBorder}`,
              background: C.button, color: C.textDim, cursor: "pointer", fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
            title={t("project:canvas_tip_title")}
          >
            💡
          </button>
          <button
            onClick={() => { setShortcutsOpen(v => !v); setTipOpen(false); }}
            style={{
              width: 28, height: 28, borderRadius: "50%", border: `1px solid ${C.panelBorder}`,
              background: C.button, color: C.textDim, cursor: "pointer", fontSize: 14, fontWeight: 600,
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
                background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 14,
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)", width: 380, fontSize: 12, lineHeight: 1.6, color: C.text,
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontWeight: 600, marginBottom: 8, color: C.accent }}>{t("project:canvas_tip_title")}</div>
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
                background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 14,
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)", width: 380, fontSize: 12, lineHeight: 1.7, color: C.text,
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontWeight: 600, marginBottom: 10, color: C.accent }}>{t("project:canvas_shortcuts_title")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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

        {contextMenu && (
          <div ref={contextMenuRef} style={{ position: "fixed", left: (contextMenuDisplayPos ?? { x: contextMenu.x, y: contextMenu.y }).x, top: (contextMenuDisplayPos ?? { x: contextMenu.x, y: contextMenu.y }).y, background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: 4, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,0.5)", minWidth: 160 }}>
            <div style={{ fontSize: 11, color: C.text, opacity: 0.9, padding: "4px 8px 6px", borderBottom: `1px solid ${C.panelBorder}`, marginBottom: 4 }}>
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
              <CtxItem label={t("project:adjustment_fill")} color={C.accent} onClick={() => {
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
                      const s = { ...n[touching[0]], points: newPts };
                      n[touching[0]] = s;
                      return n;
                    });
                  }
                  setContextMenu(null);
                  return;
                }
                setAdjustmentFillModal({ emptyAreaIdx });
                setContextMenu(null);
              }} />
            )}
            {contextMenu.adjustmentOverflow && (
              <CtxItem label={t("project:adjustment_hide")} color={C.accent} onClick={() => {
                const si = contextMenu.adjustmentOverflow!.shapeIdx;
                const newPts = clipShapeToGarden(shapes, si);
                if (newPts) {
                  saveHistory();
                  setShapes(p => {
                    const n = [...p];
                    const s = { ...n[si], points: newPts };
                    n[si] = s;
                    return n;
                  });
                }
                setContextMenu(null);
              }} />
            )}
            {contextMenu.adjustmentOverlap && (
              <>
                <CtxItem label={t("project:adjustment_remove_part_a")} color={C.danger} onClick={() => {
                  const { shapeIdxA, overlapIdx } = contextMenu.adjustmentOverlap!;
                  const overlap = adjustmentData.overlaps[overlapIdx]?.overlapPolygon;
                  if (!overlap) return;
                  const result = removeOverlapFromShape(shapes, shapeIdxA, overlap);
                  if (result && result.length > 0) {
                    saveHistory();
                    const newPts = result[0];
                    setShapes(p => {
                      const n = [...p];
                      const s = { ...n[shapeIdxA], points: newPts };
                      n[shapeIdxA] = s;
                      return n;
                    });
                  }
                  setContextMenu(null);
                }} />
                <CtxItem label={t("project:adjustment_remove_part_b")} color={C.danger} onClick={() => {
                  const { shapeIdxB, overlapIdx } = contextMenu.adjustmentOverlap!;
                  const overlap = adjustmentData.overlaps[overlapIdx]?.overlapPolygon;
                  if (!overlap) return;
                  const result = removeOverlapFromShape(shapes, shapeIdxB, overlap);
                  if (result && result.length > 0) {
                    saveHistory();
                    const newPts = result[0];
                    setShapes(p => {
                      const n = [...p];
                      const s = { ...n[shapeIdxB], points: newPts };
                      n[shapeIdxB] = s;
                      return n;
                    });
                  }
                  setContextMenu(null);
                }} />
                <CtxItem label={t("project:adjustment_spread")} color={C.accent} onClick={() => {
                  setAdjustmentSpreadModal({ ...contextMenu.adjustmentOverlap! });
                  setContextMenu(null);
                }} />
              </>
            )}
            {/* Grass join/unjoin menu */}
            {contextMenu.grassJoin && (
              <CtxItem label="🔗 Złącz roleki" color={C.accent} onClick={() => {
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
                    inputs.vizPieces = pieces;
                    n[shapeIdx] = { ...s, calculatorInputs: inputs };
                  }
                  return n;
                });
                setContextMenu(null);
                setGrassTrimModal({ shapeIdx, pieceAIdx: grassJoin.pieceAIdx, pieceBIdx: grassJoin.pieceBIdx, edgeIdx: grassJoin.edgeAIdx });
              }} />
            )}
            {contextMenu.heightPointIdx !== undefined && (
              <CtxItem label="✕ Usuń punkt wysokościowy" color={C.danger} onClick={() => {
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
                <CtxItem label="〰 Zmiana na square point" color={C.accent} onClick={() => {
                  saveHistory();
                  const si = contextMenu.shapeIdx, ei = contextMenu.edgeIdx, ap = contextMenu.arcPoint!;
                  const A = shapes[si].points[ei];
                  const B = shapes[si].points[(ei + 1) % shapes[si].points.length];
                  const worldPos = arcPointToWorld(A, B, ap);
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
                <CtxItem label="✕ Remove arc point" color={C.danger} onClick={() => {
                  const si = contextMenu.shapeIdx, ei = contextMenu.edgeIdx, ap = contextMenu.arcPoint!;
                  removeEntryAndLinked({ si, pi: -1 as const, edgeIdx: ei, arcId: ap.id });
                }} />
                {(() => {
                  const si = contextMenu.shapeIdx, ei = contextMenu.edgeIdx, ap = contextMenu.arcPoint!;
                  const isLinked = isArcPointLinked(si, ei, ap.id);
                  if (isLinked) {
                    return <CtxItem label="🔗 Unlink arc point" color={C.text} onClick={() => {
                      unlinkEntry({ si, pi: -1 as const, edgeIdx: ei, arcId: ap.id });
                    }} />;
                  }
                  const A = shapes[si].points[ei];
                  const B = shapes[si].points[(ei + 1) % shapes[si].points.length];
                  const worldPos = arcPointToWorld(A, B, ap);
                  const nearby = findNearbyLinkableEntries(worldPos, si, ap.id);
                  const edges = findAllEdgesPositionTouches(worldPos, si);
                  if (nearby.length === 0 && edges.length === 0) return null;
                  return <CtxItem label="🔗 Link arc point" color={C.accent} onClick={() => {
                    linkArcPoint(si, ei, ap);
                  }} />;
                })()}
              </>
            )}
            {contextMenu.grassPieceIdx != null && (
              <>
                <CtxItem label={t("project:grass_rotate_piece_90")} color={C.accent} onClick={() => {
                  const { shapeIdx, grassPieceIdx: pieceIdx } = contextMenu;
                  if (pieceIdx == null) return;
                  saveHistory();
                  setShapes(p => {
                    const n = [...p];
                    const s = { ...n[shapeIdx] };
                    const inputs = { ...s.calculatorInputs };
                    const pieces = [...(inputs.vizPieces as GrassPiece[])];
                    const piece = pieces[pieceIdx];
                    if (piece) {
                      pieces[pieceIdx] = { ...piece, rotation: (piece.rotation === 90 ? 0 : 90) as 0 | 90 };
                      inputs.vizPieces = pieces;
                      const cov = validateCoverage(s, pieces);
                      inputs.jointsLength = String(cov.joinLengthM.toFixed(2));
                      inputs.trimLength = String(cov.trimLengthM.toFixed(2));
                      n[shapeIdx] = { ...s, calculatorInputs: inputs };
                    }
                    return n;
                  });
                  setContextMenu(null);
                }} />
                <CtxItem label={t("project:grass_rotate_group_90")} color={C.accent} onClick={() => {
                  const { shapeIdx, grassPieceIdx: pieceIdx } = contextMenu;
                  if (pieceIdx == null) return;
                  saveHistory();
                  setShapes(p => {
                    const n = [...p];
                    const s = { ...n[shapeIdx] };
                    const inputs = { ...s.calculatorInputs };
                    const pieces = [...(inputs.vizPieces as GrassPiece[])];
                    const groupIndices = getJoinedGroup(pieces, pieceIdx);
                    for (const i of groupIndices) {
                      const piece = pieces[i];
                      if (piece) pieces[i] = { ...piece, rotation: (piece.rotation === 90 ? 0 : 90) as 0 | 90 };
                    }
                    inputs.vizPieces = pieces;
                    const cov = validateCoverage(s, pieces);
                    inputs.jointsLength = String(cov.joinLengthM.toFixed(2));
                    inputs.trimLength = String(cov.trimLengthM.toFixed(2));
                    n[shapeIdx] = { ...s, calculatorInputs: inputs };
                    return n;
                  });
                  setContextMenu(null);
                }} />
              </>
            )}
            {contextMenu.grassUnjoin && (
              <CtxItem label="✂ Rozłącz roleki" color={C.text} onClick={() => {
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
                    inputs.vizPieces = pieces;
                    const cov = validateCoverage(s, pieces);
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
              {shapes[contextMenu.shapeIdx]?.points.length > 3 && (
                <CtxItem label="✕ Remove point" color={C.danger} onClick={() => { removePoint(contextMenu.shapeIdx, contextMenu.pointIdx); }} />
              )}
              {shapes[contextMenu.shapeIdx] && (shapes[contextMenu.shapeIdx].layer === 1 || shapes[contextMenu.shapeIdx].layer === 2) && shapes[contextMenu.shapeIdx].points.length > 3 && (
                <CtxItem label="〰 Zmiana na arc point" color={C.accent} onClick={() => {
                  saveHistory();
                  const si = contextMenu.shapeIdx, pi = contextMenu.pointIdx;
                  const s = shapes[si]; const pts = s.points;
                  const n = pts.length;
                  const prev = (pi - 1 + n) % n, next = (pi + 1) % n;
                  const A = pts[prev], B = pts[next], V = pts[pi];
                  const { t, offset } = worldToArcPoint(A, B, V);
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
                <CtxItem
                  label={shapes[contextMenu.shapeIdx]?.lockedAngles.includes(contextMenu.pointIdx) ? "🔓 Unlock angle" : "🔒 Lock angle"}
                  color={shapes[contextMenu.shapeIdx]?.lockedAngles.includes(contextMenu.pointIdx) ? C.locked : C.text}
                  onClick={() => { toggleLockAngle(contextMenu.shapeIdx, contextMenu.pointIdx); setContextMenu(null); }}
                />
              )}
              {isPointLinked(contextMenu.shapeIdx, contextMenu.pointIdx) ? (
                <CtxItem label="🔗 Unlink point" color={C.text} onClick={() => unlinkPoint(contextMenu.shapeIdx, contextMenu.pointIdx)} />
              ) : (() => {
                const nearby = findAllNearbyPoints(contextMenu.shapeIdx, contextMenu.pointIdx);
                const edges = findAllEdgesPointTouches(contextMenu.shapeIdx, contextMenu.pointIdx);
                if (nearby.length > 0 || edges.length > 0) {
                  return <CtxItem label="🔗 Link all at point" color={C.accent} onClick={() => linkAllAtPoint(contextMenu.shapeIdx, contextMenu.pointIdx)} />;
                }
                return null;
              })()}
              {shapes[contextMenu.shapeIdx]?.layer === 2 && (
                <>
                  <div style={{ height: 1, background: C.panelBorder, margin: "4px 0" }} />
                  {shapes[contextMenu.shapeIdx]?.elementType === "wall" && (
                    <CtxItem label="↕ Ustaw wysokości segmentu" color={C.accent} onClick={() => { setSegmentHeightModal({ shapeIdx: contextMenu.shapeIdx }); setContextMenu(null); }} />
                  )}
                  {shapes[contextMenu.shapeIdx]?.calculatorResults && (
                    <CtxItem label={`📊 ${t("project:path_view_results")}`} color="#a29bfe" onClick={() => { setResultsModalShapeIdx(contextMenu.shapeIdx); setContextMenu(null); }} />
                  )}
                  <CtxItem label={shapes[contextMenu.shapeIdx]?.calculatorType ? `✏️ Edit Object Card (${shapes[contextMenu.shapeIdx].calculatorType})` : "✏️ Edit Object Card"} color={C.accent} onClick={() => { setObjectCardShapeIdx(contextMenu.shapeIdx); setContextMenu(null); }} />
                </>
              )}
            </>)}
            {/* Edge menu */}
            {contextMenu.edgeIdx >= 0 && (<>
              {isLinearElement(shapes[contextMenu.shapeIdx]) && shapes[contextMenu.shapeIdx].points.length >= 3 && (
                <CtxItem label="✕ Usuń segment" color={C.danger} onClick={() => { saveHistory(); removeLinearSegment(contextMenu.shapeIdx, contextMenu.edgeIdx); setContextMenu(null); setSelectedShapeIdx(null); }} />
              )}
              {isGroundworkLinear(shapes[contextMenu.shapeIdx]) && shapes[contextMenu.shapeIdx].points.length === 2 && (
                <CtxItem label="✕ Usuń element" color={C.danger} onClick={() => { saveHistory(); setShapes(p => p.filter((_, i) => i !== contextMenu.shapeIdx)); setContextMenu(null); setSelectedShapeIdx(null); }} />
              )}
              {isLinearElement(shapes[contextMenu.shapeIdx]) && (() => {
                const et = shapes[contextMenu.shapeIdx].elementType;
                const target = et === "fence" || et === "foundation" ? "wall" : et === "wall" ? "kerb" : "polygon";
                const label = target === "wall" ? t("project:align_to_wall") : target === "kerb" ? t("project:align_to_kerb") : t("project:align_to_plot");
                return <CtxItem label={label} color={C.accent} onClick={() => alignLinearSegmentTo(contextMenu.shapeIdx, contextMenu.edgeIdx, target)} />;
              })()}
              <CtxItem
                label={shapes[contextMenu.shapeIdx]?.lockedEdges.some(e => e.idx === contextMenu.edgeIdx) ? "🔓 Unlock length" : "🔒 Lock length"}
                color={shapes[contextMenu.shapeIdx]?.lockedEdges.some(e => e.idx === contextMenu.edgeIdx) ? C.locked : C.text}
                onClick={() => { toggleLockEdge(contextMenu.shapeIdx, contextMenu.edgeIdx); setContextMenu(null); }}
              />
              {contextMenu.pathCenterlineEdgeIdx !== undefined && contextMenu.edgePos !== undefined && (
                <CtxItem label="〰 Arc Point" color={C.accent} onClick={() => {
                  saveHistory();
                  const si = contextMenu.shapeIdx;
                  const ei = contextMenu.pathCenterlineEdgeIdx!;
                  const pts = (shapes[si].calculatorInputs?.pathCenterlineOriginal as Point[]) ?? shapes[si].points;
                  if (ei < 0 || ei >= pts.length - 1) return;
                  const A = pts[ei], B = pts[ei + 1];
                  const { t, offset } = worldToArcPoint(A, B, contextMenu.edgePos!);
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
              {shapes[contextMenu.shapeIdx]?.layer === 1 && contextMenu.edgePos !== undefined && contextMenu.edgeT !== undefined && (
                <CtxItem label="➕ Dodaj punkt" color={C.geo} onClick={() => {
                  insertPointOnEdge(contextMenu.shapeIdx, contextMenu.edgeIdx, contextMenu.edgePos!, contextMenu.edgeT!);
                }} />
              )}
              {!isLinearElement(shapes[contextMenu.shapeIdx]) && !isPathElement(shapes[contextMenu.shapeIdx]) && shapes[contextMenu.shapeIdx]?.closed && contextMenu.edgePos !== undefined && contextMenu.edgeT !== undefined && (shapes[contextMenu.shapeIdx].layer === 1 || shapes[contextMenu.shapeIdx].layer === 2) && (
                <CtxItem label="〰 Dodaj arc point" color={C.accent} onClick={() => {
                  saveHistory();
                  const si = contextMenu.shapeIdx, ei = contextMenu.edgeIdx;
                  const pts = shapes[si].points;
                  const A = pts[ei], B = pts[(ei + 1) % pts.length];
                  const { t, offset } = worldToArcPoint(A, B, contextMenu.edgePos!);
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
                  <div style={{ height: 1, background: C.panelBorder, margin: "4px 0" }} />
                  {shapes[contextMenu.shapeIdx]?.elementType === "wall" && (
                    <CtxItem label="↕ Ustaw wysokości segmentu" color={C.accent} onClick={() => { setSegmentHeightModal({ shapeIdx: contextMenu.shapeIdx }); setContextMenu(null); }} />
                  )}
                  {shapes[contextMenu.shapeIdx]?.calculatorResults && (
                    <CtxItem label={`📊 ${t("project:path_view_results")}`} color="#a29bfe" onClick={() => { setResultsModalShapeIdx(contextMenu.shapeIdx); setContextMenu(null); }} />
                  )}
                  <CtxItem label={shapes[contextMenu.shapeIdx]?.calculatorType ? `✏️ Edit Object Card (${shapes[contextMenu.shapeIdx].calculatorType})` : "✏️ Edit Object Card"} color={C.accent} onClick={() => { setObjectCardShapeIdx(contextMenu.shapeIdx); setContextMenu(null); }} />
                </>
              )}
            </>)}
            {/* Shape-level menu (Layer 1 Garden) */}
            {contextMenu.pointIdx === -1 && contextMenu.edgeIdx === -1 && shapes[contextMenu.shapeIdx]?.layer === 1 && shapes[contextMenu.shapeIdx]?.closed && (
              <>
                <div style={{ height: 1, background: C.panelBorder, margin: "4px 0" }} />
                {contextMenu.interiorWorldPos && (
                  <CtxItem
                    label="➕ Dodaj punkt wysokościowy"
                    color={C.geo}
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
                <div style={{ height: 1, background: C.panelBorder, margin: "4px 0" }} />
                {isGroundworkLinear(shapes[contextMenu.shapeIdx]) && (
                  <CtxItem label="✕ Usuń element" color={C.danger} onClick={() => { saveHistory(); setShapes(p => p.filter((_, i) => i !== contextMenu.shapeIdx)); setContextMenu(null); setSelectedShapeIdx(null); }} />
                )}
                {shapes[contextMenu.shapeIdx]?.elementType === "wall" && !isGroundworkLinear(shapes[contextMenu.shapeIdx]) && (
                  <CtxItem label="↕ Ustaw wysokości segmentu" color={C.accent} onClick={() => { setSegmentHeightModal({ shapeIdx: contextMenu.shapeIdx }); setContextMenu(null); }} />
                )}
                {isPolygonLinearElement(shapes[contextMenu.shapeIdx]) && findSurfacesOverlappingLinear(shapes, contextMenu.shapeIdx).length > 0 && (
                  <CtxItem label={t("project:align_surfaces_to_linear")} color={C.accent} onClick={() => {
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
                <CtxItem
                  label={shapes[contextMenu.shapeIdx]?.calculatorType ? `✏️ Edit Object Card (${shapes[contextMenu.shapeIdx].calculatorType})` : "✏️ Edit Object Card"}
                  color={C.accent}
                  onClick={() => { setObjectCardShapeIdx(contextMenu.shapeIdx); setContextMenu(null); }}
                />
                {shapes[contextMenu.shapeIdx]?.calculatorType && !isGroundworkLinear(shapes[contextMenu.shapeIdx]) && (
                  <CtxItem label="Remove Calculator" color={C.danger} onClick={() => {
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
          <div ref={projectSummaryMenuRef} style={{ position: "fixed", left: (projectSummaryDisplayPos ?? { x: projectSummaryContextMenu.x, y: projectSummaryContextMenu.y }).x, top: (projectSummaryDisplayPos ?? { x: projectSummaryContextMenu.x, y: projectSummaryContextMenu.y }).y, background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: 4, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,0.5)", minWidth: 160 }}>
            <div style={{ fontSize: 11, color: C.text, opacity: 0.9, padding: "4px 8px 6px", borderBottom: `1px solid ${C.panelBorder}`, marginBottom: 4 }}>
              {shapes[projectSummaryContextMenu.shapeIdx].label || shapes[projectSummaryContextMenu.shapeIdx].calculatorType || "Element"}
            </div>
            {shapes[projectSummaryContextMenu.shapeIdx]?.calculatorResults && (
              <CtxItem label={`📊 ${t("project:path_view_results")}`} color="#a29bfe" onClick={() => { setResultsModalShapeIdx(projectSummaryContextMenu.shapeIdx); setProjectSummaryContextMenu(null); }} />
            )}
            <CtxItem label="✕ Usuń element" color={C.danger} onClick={() => {
              saveHistory();
              setShapes(p => p.filter((_, i) => i !== projectSummaryContextMenu.shapeIdx));
              setSelectedShapeIdx(null);
              setProjectSummaryContextMenu(null);
            }} />
            <CtxItem label="✏️ Zmień nazwę" color={C.accent} onClick={() => {
              setNamePromptShapeIdx(projectSummaryContextMenu.shapeIdx);
              setProjectSummaryContextMenu(null);
            }} />
          </div>
        )}

        {editingDim && (
          <div style={{ position: "fixed", left: editingDim.x - 60, top: editingDim.y - 16, zIndex: 100 }}>
            <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") applyDimEdit(); if (e.key === "Escape") setEditingDim(null); }}
              onBlur={applyDimEdit}
              style={{ width: 100, padding: "4px 8px", background: C.panel, border: `2px solid ${C.accent}`, borderRadius: 4, color: C.text, fontFamily: "inherit", fontSize: 13, outline: "none", textAlign: "center" }}
              placeholder={t("project:meters_placeholder")} />
          </div>
        )}

        {editingHeight && (
          <div style={{ position: "fixed", left: editingHeight.x - 60, top: editingHeight.y - 36, zIndex: 100 }}>
            <input
              autoFocus
              value={heightValue}
              onChange={e => setHeightValue(e.target.value)}
              onFocus={e => {
                if (!heightInputSelectOnceRef.current) {
                  heightInputSelectOnceRef.current = true;
                  e.target.select();
                }
              }}
              onKeyDown={e => { if (e.key === "Enter") applyHeightEdit(); if (e.key === "Escape") setEditingHeight(null); }}
              onBlur={() => applyHeightEdit(true)}
              style={{ width: 120, padding: "4px 8px", background: C.panel, border: `2px solid ${C.geo}`, borderRadius: 4, color: C.geo, fontFamily: "inherit", fontSize: 13, outline: "none", textAlign: "center" }}
              placeholder="cm" />
          </div>
        )}

        {shapes.filter(s => s.layer === activeLayer).length === 0 && activeLayer !== 3 && activeLayer !== 4 && mode === "select" && !drawingShapeIdx && !dismissedLayerHints.has(activeLayer) && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", color: C.textDim, pointerEvents: "none" }}>
            <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>{activeLayer === 1 ? "⬡" : "◈"}</div>
            <div style={{ fontSize: 15, marginBottom: 8 }}>
              {activeLayer === 1 ? "Draw garden outline" : "Add internal elements (patio, grass, walls...)"}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.8 }}>
              Click edge → add point &nbsp;|&nbsp; Right-click point → remove<br />
              Drag point → edit &nbsp;|&nbsp; Double-click dimension → enter manually<br />
              Shift → snap 45° &nbsp;|&nbsp; Ctrl+drag → select points &nbsp;|&nbsp; Scroll → zoom<br />
              Ctrl+Z → undo &nbsp;|&nbsp; Free Draw: Right-click = cancel
            </div>
          </div>
        )}

        {shapeCreationModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setShapeCreationModal(null)}>
            <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 320, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 600, marginBottom: 16, color: C.text }}>
                {shapeCreationModal.type === "square" && t("project:toolbar_shape_square")}
                {shapeCreationModal.type === "rectangle" && t("project:toolbar_shape_rectangle")}
                {shapeCreationModal.type === "triangle" && t("project:toolbar_shape_triangle")}
                {shapeCreationModal.type === "trapezoid" && t("project:toolbar_shape_trapezoid")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 120, fontSize: 13, color: C.text }}>{t("project:shape_modal_name_label")}</span>
                  <input type="text" value={shapeInputs.name} onChange={e => setShapeInputs(p => ({ ...p, name: e.target.value }))}
                    placeholder={shapeCreationModal.type === "square" ? t("project:name_placeholder_patio") : shapeCreationModal.type === "rectangle" ? t("project:name_placeholder_terrace") : shapeCreationModal.type === "triangle" ? t("project:name_placeholder_flowerbed") : t("project:name_placeholder_border")}
                    style={{ flex: 1, padding: "6px 10px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
                </label>
                {shapeCreationModal.type === "square" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 120, fontSize: 13, color: C.text }}>{t("project:shape_modal_side_m")}</span>
                    <input type="number" min="0.1" step="0.1" value={shapeInputs.side} onChange={e => setShapeInputs(p => ({ ...p, side: e.target.value }))}
                      style={{ flex: 1, padding: "6px 10px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
                  </label>
                )}
                {shapeCreationModal.type === "rectangle" && (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: C.text }}>{t("project:shape_modal_width_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.width} onChange={e => setShapeInputs(p => ({ ...p, width: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: C.text }}>{t("project:shape_modal_height_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.height} onChange={e => setShapeInputs(p => ({ ...p, height: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
                    </label>
                  </>
                )}
                {shapeCreationModal.type === "triangle" && (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: C.text }}>{t("project:shape_modal_base_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.base} onChange={e => setShapeInputs(p => ({ ...p, base: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: C.text }}>{t("project:shape_modal_height_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.height} onChange={e => setShapeInputs(p => ({ ...p, height: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
                    </label>
                  </>
                )}
                {shapeCreationModal.type === "trapezoid" && (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: C.text }}>{t("project:shape_modal_top_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.top} onChange={e => setShapeInputs(p => ({ ...p, top: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: C.text }}>{t("project:shape_modal_bottom_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.bottom} onChange={e => setShapeInputs(p => ({ ...p, bottom: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 120, fontSize: 13, color: C.text }}>{t("project:shape_modal_height_m")}</span>
                      <input type="number" min="0.1" step="0.1" value={shapeInputs.height} onChange={e => setShapeInputs(p => ({ ...p, height: e.target.value }))}
                        style={{ flex: 1, padding: "6px 10px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
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
                  style={{ padding: "8px 16px", background: C.accent, border: "none", borderRadius: 6, color: C.bg, cursor: "pointer", fontSize: 13 }}
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

        {segmentHeightModal && shapes[segmentHeightModal.shapeIdx]?.elementType === "wall" && (
          <WallSegmentHeightModal
            shape={shapes[segmentHeightModal.shapeIdx]}
            onSave={(segHeights) => {
              saveHistory();
              setShapes(p => {
                const n = [...p];
                const s = { ...n[segmentHeightModal.shapeIdx] };
                s.calculatorInputs = { ...s.calculatorInputs, segmentHeights: segHeights };
                n[segmentHeightModal.shapeIdx] = s;
                return n;
              });
              setSegmentHeightModal(null);
            }}
            onClose={() => setSegmentHeightModal(null)}
          />
        )}

        {grassTrimModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setGrassTrimModal(null)}>
            <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 600, marginBottom: 12, color: C.text }}>Łączenie rolek trawy</div>
              <p style={{ fontSize: 13, color: C.textDim, marginBottom: 16, lineHeight: 1.5 }}>
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
                        const effectiveAreaM2 = getEffectiveTotalArea(pieces);
                        const vizPiecesWithEffective = pieces.map((p, i) => {
                          const { effectiveWidthM, effectiveLengthM } = getEffectivePieceDimensionsForInput(p, pieces, i);
                          return { ...p, effectiveWidthM, effectiveLengthM };
                        });
                        inputs.vizPieces = vizPiecesWithEffective;
                        inputs.effectiveAreaM2 = effectiveAreaM2;
                        const cov = validateCoverage(s, vizPiecesWithEffective);
                        inputs.jointsLength = String(cov.joinLengthM.toFixed(2));
                        inputs.trimLength = String(cov.trimLengthM.toFixed(2));
                        n[shapeIdx] = { ...s, calculatorInputs: inputs };
                      }
                      return n;
                    });
                    setGrassTrimModal(null);
                  }}
                  style={{ padding: "8px 16px", background: C.accent, border: "none", borderRadius: 6, color: C.bg, cursor: "pointer", fontSize: 13 }}
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
                      const cov = validateCoverage(s, pieces);
                      inputs.jointsLength = String(cov.joinLengthM.toFixed(2));
                      inputs.trimLength = String(cov.trimLengthM.toFixed(2));
                      n[shapeIdx] = { ...s, calculatorInputs: inputs };
                      return n;
                    });
                    setGrassTrimModal(null);
                  }}
                  style={{ padding: "8px 16px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, cursor: "pointer", fontSize: 13 }}
                >
                  Zostaw całą szerokość
                </button>
              </div>
            </div>
          </div>
        )}

        {adjustmentFillModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setAdjustmentFillModal(null)}>
            <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 600, marginBottom: 12, color: C.text }}>{t("project:adjustment_fill_pick")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {findTouchingElementsForEmptyArea(shapes, adjustmentData.emptyAreas[adjustmentFillModal.emptyAreaIdx] ?? []).map(si => {
                  const s = shapes[si];
                  const name = s?.label || s?.calculatorType || s?.elementType || `Element ${si + 1}`;
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
                            n[si] = { ...n[si], points: newPts };
                            return n;
                          });
                        }
                        setAdjustmentFillModal(null);
                      }}
                      style={{ padding: "10px 16px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, cursor: "pointer", fontSize: 13, textAlign: "left" }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setAdjustmentFillModal(null)} style={{ padding: "8px 16px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, cursor: "pointer", fontSize: 13 }}>{t("project:cancel_button")}</button>
            </div>
          </div>
        )}

        {adjustmentSpreadModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setAdjustmentSpreadModal(null)}>
            <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 600, marginBottom: 12, color: C.text }}>{t("project:adjustment_spread_pick")}</div>
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
                      style={{ padding: "10px 16px", background: C.accent, border: "none", borderRadius: 6, color: C.bg, cursor: "pointer", fontSize: 13 }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setAdjustmentSpreadModal(null)} style={{ padding: "8px 16px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, cursor: "pointer", fontSize: 13 }}>{t("project:cancel_button")}</button>
            </div>
          </div>
        )}

        {objectCardShapeIdx !== null && shapes[objectCardShapeIdx] && isPathElement(shapes[objectCardShapeIdx]) && (
          <PathCreationModal
            mode="edit"
            subType={shapes[objectCardShapeIdx].elementType === "pathSlabs" ? "slabs" : shapes[objectCardShapeIdx].elementType === "pathConcreteSlabs" ? "concreteSlabs" : "monoblock"}
            label={shapes[objectCardShapeIdx].label ?? (shapes[objectCardShapeIdx].elementType === "pathSlabs" ? "Path Slabs" : shapes[objectCardShapeIdx].elementType === "pathConcreteSlabs" ? "Path Concrete Slabs" : "Path Monoblock")}
            shape={shapes[objectCardShapeIdx]}
            shapeIdx={objectCardShapeIdx}
            shapes={shapes}
            onClose={() => setObjectCardShapeIdx(null)}
            onSave={(idx, updates) => {
              saveHistory();
              setShapes(p => {
                const n = [...p];
                n[idx] = { ...n[idx], ...updates };
                return n;
              });
              setObjectCardShapeIdx(null);
            }}
            onCalculatorInputsChange={onCalculatorInputsChange}
            onViewResults={(idx) => { setResultsModalShapeIdx(idx); setObjectCardShapeIdx(null); }}
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
          soilType={projectSettings.soilType ?? "clay"}
          levelingMaterial={projectSettings.levelingMaterial ?? "tape1"}
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
  const result = computePreparation(shapes, soilType, levelingMaterial);
  const groundworkShapes = shapes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.layer === 2 && isGroundworkLinear(s) && s.points.length >= 2);

  return (
    <div style={{
      width: 280,
      background: C.panel,
      borderLeft: `1px solid ${C.panelBorder}`,
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px",
        borderBottom: `1px solid ${C.panelBorder}`,
        fontSize: 14,
        fontWeight: 600,
        color: C.foundation,
      }}>
        {t("project:preparation_label")}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {groundworkShapes.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, marginBottom: 8, textTransform: "uppercase" }}>{t("project:groundwork_linear_label")}</div>
            {groundworkShapes.map(({ s, i }) => {
              const lenM = polylineLengthMeters(s.points);
              return (
                <div
                  key={i}
                  onClick={() => onGroundworkClick?.(i)}
                  style={{
                    padding: "10px 12px",
                    marginBottom: 8,
                    background: C.bg,
                    borderRadius: 8,
                    border: `1px solid ${C.panelBorder}`,
                    fontSize: 12,
                    cursor: s.calculatorResults ? "pointer" : "default",
                  }}
                >
                  <div style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>{s.label || groundworkLabel(s)}</div>
                  <div style={{ color: C.textDim, fontSize: 11 }}>{t("project:total_length")}: {lenM.toFixed(2)} m</div>
                  {s.calculatorResults && <div style={{ fontSize: 10, color: C.accent, marginTop: 4 }}>{t("project:click_view_results")}</div>}
                </div>
              );
            })}
          </div>
        )}
        {!result.validation.ok ? (
          <div style={{ fontSize: 12, color: C.danger }}>
            {result.validation.elementsWithoutHeights && result.validation.elementsWithoutHeights.length > 0 && (
              <div>{t("project:elements_without_heights")}: {result.validation.elementsWithoutHeights.join(", ")}. {t("project:add_heights_geodesy")}</div>
            )}
          </div>
        ) : result.elements.length === 0 && groundworkShapes.length === 0 ? (
          <div style={{ fontSize: 13, color: C.textDim, textAlign: "center", padding: 24 }}>
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
                  background: C.bg,
                  borderRadius: 8,
                  border: `1px solid ${C.panelBorder}`,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 600, color: C.text, marginBottom: 6 }}>{el.label}</div>
                <div style={{ color: C.textDim, fontSize: 11 }}>
                  {el.areaM2} m² · {t("project:excavation_label")}: {el.excavationM3} m³ ({el.excavationTonnes} t)
                </div>
                <div style={{ color: C.textDim, fontSize: 11 }}>
                  {t("project:fill_label")}: {el.fillM3} m³ ({el.fillTonnes} t) · {el.pctAreaNeedingFill}% {t("project:area_low")}
                </div>
              </div>
            ))}
            <div style={{
              marginTop: 12,
              padding: "12px",
              background: C.bg,
              borderRadius: 8,
              border: `1px solid ${C.panelBorder}`,
              fontSize: 13,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: C.textDim }}>{t("project:total_excavation")}</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{result.totalExcavationM3} m³</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: C.textDim }}>{t("project:total_fill")}</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{result.totalFillM3} m³</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: C.textDim }}>{t("project:excavation_tonnes")}</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{result.totalExcavationTonnes} t</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.textDim }}>{t("project:fill_tonnes")}</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{result.totalFillTonnes} t</span>
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
  const [val, setVal] = useState(initialLabel);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={onCancel}>
      <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 20, maxWidth: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 600, marginBottom: 12, color: C.text }}>{t("project:name_prompt_title")}</div>
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
          style={{ width: "100%", padding: "10px 12px", background: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 14 }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onCancel} style={{ padding: "8px 16px", background: C.button, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, cursor: "pointer" }}>{t("common:cancel")}</button>
          <button onClick={() => onConfirm(val.trim())} style={{ padding: "8px 16px", background: C.accent, border: "none", borderRadius: 6, color: C.bg, cursor: "pointer", fontWeight: 600 }}>OK</button>
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