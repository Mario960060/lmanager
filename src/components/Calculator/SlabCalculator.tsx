import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import SlabFrameCalculator from './SlabFrameCalculator';
import type {} from 'react/jsx-runtime';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit, translateMaterialName } from '../../lib/translationMap';
import { CompactorSelector, type CompactorOption } from './CompactorSelector';
import { calculateCompactingTime } from '../../lib/compactingCalculations';
import {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
  radii,
  gradients,
  shadows,
} from '../../themes/designTokens';
import {
  TextInput,
  CalculatorInputGrid,
  SelectDropdown,
  Checkbox,
  Button,
  Card,
  Label,
  HelperText,
  DataTable,
} from '../../themes/uiComponents';
import {
  computeSlabCuts,
  computePathSlabCuts,
  groupCutsByLength,
  parseSlabDimensions,
  type SlabCutsResult,
} from '../../projectmanagement/canvacreator/visualization/slabPattern';
import { distance, PIXELS_PER_METER, type Point } from '../../projectmanagement/canvacreator/geometry';
import { isPathElement, getPathPolygon } from '../../projectmanagement/canvacreator/linearElements';
import { getEffectivePolygon, getEffectivePolygonWithEdgeIndices } from '../../projectmanagement/canvacreator/arcMath';
import { FrameSidesSelector } from '../../projectmanagement/canvacreator/objectCard/FrameSidesSelector';
import { computeMonoblockFrameBlocks } from '../../projectmanagement/canvacreator/visualization/cobblestonePattern';

interface SlabType {
  id: string | number;
  name: string;
  unit: string;
  estimated_hours: number | null;
  is_porcelain: boolean;
}

interface Material {
  id?: string;
  name: string;
  description?: string | null;
  amount: number;
  unit: string;
  price?: number | null;
  price_per_unit: number | null;
  total_price: number | null;
  created_at?: string;
}

interface MaterialUsageConfig {
  calculator_id: string;
  material_id: string;
  company_id?: string;
}

interface DiggingEquipment {
  id: string;
  name: string;
  type: string;
  "size (in tones)": number | null;
  speed_m_per_hour?: number | null;
  company_id?: string | null;
  created_at?: string;
  description?: string | null;
  in_use_quantity?: number;
  quantity?: number;
  status?: string;
  updated_at?: string;
}

interface Shape {
  points: { x: number; y: number }[];
  closed: boolean;
  calculatorInputs?: Record<string, any>;
}

const SLAB_GROUT_OPTIONS_MM = [1, 2, 3, 4, 5, 10, 20] as const;

function parseFrameBorderRowCountFromSaved(c: Record<string, any> | undefined): string {
  const explicit = c?.frameBorderRowCount;
  if (explicit != null && explicit !== "") {
    const n = Math.floor(Number(explicit));
    if (Number.isFinite(n) && n >= 1) return String(Math.min(50, n));
  }
  if (Array.isArray(c?.frameBorderRows) && c.frameBorderRows.length > 0) {
    return String(Math.min(50, Math.max(1, c.frameBorderRows.length)));
  }
  return "1";
}

function snapGroutMmToOption(mm: number): number {
  let best: number = SLAB_GROUT_OPTIONS_MM[0];
  let bestD = Math.abs(mm - best);
  for (const x of SLAB_GROUT_OPTIONS_MM) {
    const d = Math.abs(mm - x);
    if (d < bestD) {
      best = x;
      bestD = d;
    }
  }
  return best;
}

function mergedSlabVizInputs(
  shape: Shape | undefined,
  savedInputs: Record<string, any>,
  vizGroutWidthMm: number,
  selectedSlabTypeName?: string
): Record<string, any> {
  const base = { ...(shape?.calculatorInputs ?? {}), ...savedInputs, vizGroutWidthMm };
  const w = Number(base.vizSlabWidth);
  const l = Number(base.vizSlabLength);
  if (w && l) return base;
  const dims = selectedSlabTypeName ? parseSlabDimensions(selectedSlabTypeName) : null;
  if (dims) {
    base.vizSlabWidth = dims.widthCm;
    base.vizSlabLength = dims.lengthCm;
  }
  return base;
}

function computeSlabPurchaseFromShape(
  shape: Shape | undefined,
  inputs: Record<string, any>
): Pick<SlabCutsResult, 'cuts' | 'cutSlabCount' | 'fullSlabCount'> & {
  slabsForCuts: number;
  slabsToBuy: number;
  slabAreaM2: number;
} | null {
  if (!shape?.closed || shape.points.length < 3) return null;
  const w = Number(inputs.vizSlabWidth);
  const l = Number(inputs.vizSlabLength);
  if (!w || !l) return null;
  const slabResult = inputs.pathCenterline
    ? computePathSlabCuts(shape as any, inputs)
    : computeSlabCuts(shape as any, inputs);
  const wasteN = Array.isArray(slabResult.wasteSatisfiedPositions) ? slabResult.wasteSatisfiedPositions.length : 0;
  const slabsForCuts = Math.max(0, slabResult.cutSlabCount - wasteN);
  const slabsToBuy = slabResult.fullSlabCount + slabsForCuts;
  const slabAreaM2 = (w / 100) * (l / 100);
  return {
    cuts: slabResult.cuts,
    cutSlabCount: slabResult.cutSlabCount,
    fullSlabCount: slabResult.fullSlabCount,
    slabsForCuts,
    slabsToBuy,
    slabAreaM2,
  };
}

interface SlabCalculatorProps {
  onResultsChange?: (results: any) => void;
  onInputsChange?: (inputs: Record<string, any>) => void;
  isInProjectCreating?: boolean;
  initialArea?: number;
  savedInputs?: Record<string, any>;
  shape?: Shape;
  calculateTransport?: boolean;
  setCalculateTransport?: (value: boolean) => void;
  selectedTransportCarrier?: any;
  setSelectedTransportCarrier?: (value: any) => void;
  transportDistance?: string;
  setTransportDistance?: (value: string) => void;
  carriers?: any[];
  selectedExcavator?: any;
  selectedCompactor?: any; // CompactorOption from project when in project mode
  recalculateTrigger?: number;
  /** When true, hide area, soil excess, transport, compactor, digging — for path edit */
  compactForPath?: boolean;
}

const SlabCalculator: React.FC<SlabCalculatorProps> = ({ 
  onResultsChange, 
  onInputsChange,
  isInProjectCreating = false,
  initialArea,
  savedInputs = {},
  shape,
  calculateTransport: propCalculateTransport,
  setCalculateTransport: propSetCalculateTransport,
  selectedTransportCarrier: propSelectedTransportCarrier,
  setSelectedTransportCarrier: propSetSelectedTransportCarrier,
  transportDistance: propTransportDistance,
  setTransportDistance: propSetTransportDistance,
  carriers: propCarriers = [],
  selectedExcavator: propSelectedExcavator,
  selectedCompactor: propSelectedCompactor,
  recalculateTrigger = 0,
  compactForPath = false,
}: SlabCalculatorProps) => {
  const companyId = useAuthStore(state => state.getCompanyId());
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const [calcLayoutNarrow, setCalcLayoutNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const on = () => setCalcLayoutNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const isConcrete = false; // SlabCalculator handles sandstones/porcelain only; concrete slabs use ConcreteSlabsCalculator
  const initArea = savedInputs?.area != null ? String(savedInputs.area) : (initialArea != null ? initialArea.toFixed(3) : '');
  const [area, setArea] = useState<string>(initArea);
  useEffect(() => {
    if (savedInputs?.area != null) setArea(String(savedInputs.area));
    else if (initialArea != null && isInProjectCreating) setArea(initialArea.toFixed(3));
  }, [savedInputs?.area, initialArea, isInProjectCreating]);
  const [tape1ThicknessCm, setTape1ThicknessCm] = useState<string>(savedInputs?.tape1ThicknessCm ?? '');
  const [mortarThicknessCm, setMortarThicknessCm] = useState<string>(savedInputs?.mortarThicknessCm ?? '');
  const [slabThicknessCm, setSlabThicknessCm] = useState<string>(savedInputs?.slabThicknessCm ?? '');
  const [selectedSlabId, setSelectedSlabId] = useState<string>(savedInputs?.selectedSlabId ?? '');
  const [soilExcessCm, setSoilExcessCm] = useState<string>(savedInputs?.soilExcessCm ?? '');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<{task: string, hours: number, amount: number | string, unit: string, normalizedHours?: number}[]>([]);
  const [selectedGroutingId, setSelectedGroutingId] = useState<string>(savedInputs?.selectedGroutingId ?? '');

  const externalGroutMm = useMemo(() => {
    const legacy = savedInputs?.vizGroutWidth != null ? Math.round(Number(savedInputs.vizGroutWidth) * 10) : undefined;
    const raw = Number(
      savedInputs?.vizGroutWidthMm ??
      shape?.calculatorInputs?.vizGroutWidthMm ??
      legacy ??
      5
    );
    const n = Number.isFinite(raw) && raw > 0 ? raw : 5;
    return snapGroutMmToOption(n);
  }, [
    savedInputs?.vizGroutWidthMm,
    savedInputs?.vizGroutWidth,
    shape?.calculatorInputs?.vizGroutWidthMm,
    shape?.calculatorInputs?.vizGroutWidth,
  ]);

  const [vizGroutWidthMm, setVizGroutWidthMm] = useState<number>(externalGroutMm);
  useEffect(() => {
    setVizGroutWidthMm(externalGroutMm);
  }, [externalGroutMm]);

  // Fetch task templates early (needed by onInputsChange useEffect below)
  const { data: taskTemplatesData, isLoading, error: fetchError }: UseQueryResult<SlabType[]> = useQuery({
    queryKey: ['task_templates', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return (data as Omit<SlabType, 'is_porcelain'>[]).map((item) => ({
        ...item,
        is_porcelain: (item.name?.toLowerCase() || '').includes('slab') && !(item.name?.toLowerCase() || '').includes('sandstone'),
      }));
    },
    enabled: !!companyId
  });
  const taskTemplates = useMemo(() => taskTemplatesData ?? [], [taskTemplatesData]);

  const slabTypeOptions = useMemo(
    () =>
      taskTemplates.filter((tpl: SlabType) => {
        const name = (tpl.name || '').toLowerCase();
        return name.includes('laying slabs') && !name.includes('(concrete)') && !name.includes('betonowe');
      }),
    [taskTemplates]
  );

  const [cutSlabs, setCutSlabs] = useState<string>(savedInputs?.cutSlabs ?? '');
  const [canvasCutSlabs, setCanvasCutSlabs] = useState<number | null>(null);
  const [canvasCutGroups, setCanvasCutGroups] = useState<{ lengthCm: number; count: number }[]>([]);

  const [addFrameBoard, setAddFrameBoard] = useState<boolean>(!!savedInputs?.addFrameBoard);
  const [isFrameModalOpen, setIsFrameModalOpen] = useState<boolean>(false);
  const [framePieceLengthCm, setFramePieceLengthCm] = useState<string>(String(savedInputs?.framePieceLengthCm ?? "90"));
  const [framePieceWidthCm, setFramePieceWidthCm] = useState<string>(String(savedInputs?.framePieceWidthCm ?? "15"));
  const [frameJointType, setFrameJointType] = useState<"butt" | "miter45">(
    savedInputs?.frameJointType === "butt" ? "butt" : "miter45"
  );
  const [frameBorderRowCount, setFrameBorderRowCount] = useState<string>(() => parseFrameBorderRowCountFromSaved(savedInputs));
  const [frameSidesEnabled, setFrameSidesEnabled] = useState<boolean[]>(Array.isArray(savedInputs?.frameSidesEnabled) ? savedInputs.frameSidesEnabled : []);
  const [frameBorderMaterial, setFrameBorderMaterial] = useState<"slab" | "cobble">(() =>
    savedInputs?.frameBorderMaterial === "cobble" ? "cobble" : "slab"
  );
  const [frameResults, setFrameResults] = useState<{
    totalFrameSlabs: number;
    totalHours: number;
    totalFrameAreaM2: number;
    sides: Array<{ length: number; slabs: number }>;
    taskName: string;
    task_id?: string;
    frameSlabsName?: string;
    framePieceLengthCm?: string;
    framePieceWidthCm?: string;
    frameRowsLabel?: string;
    cuttingHours: number;
    cuttingTaskName: string;
    cutting_task_id?: string;
    frameCobbleMode?: boolean;
  } | null>(null);

  /** Path modal passes selectedSlabId via savedInputs; compact mode has no slab dropdown — keep state in sync. */
  useEffect(() => {
    const sid = savedInputs?.selectedSlabId;
    if (sid == null || sid === '') return;
    const s = String(sid);
    if (slabTypeOptions.length === 0) return;
    const ok = slabTypeOptions.some((t: SlabType) => t.id.toString() === s);
    if (!ok) return;
    if (s !== selectedSlabId) setSelectedSlabId(s);
  }, [savedInputs?.selectedSlabId, slabTypeOptions, selectedSlabId]);

  /** Drop stale IDs (deleted tasks / old defaults) so lookup matches the slab-type dropdown. */
  useEffect(() => {
    if (slabTypeOptions.length === 0) return;
    if (!selectedSlabId) return;
    const ok = slabTypeOptions.some((t: SlabType) => t.id.toString() === selectedSlabId);
    if (!ok) setSelectedSlabId(String(slabTypeOptions[0].id));
  }, [slabTypeOptions, selectedSlabId]);

  // Ref to avoid infinite loop: only call onInputsChange when payload actually changed
  const lastInputsPayloadRef = useRef<string>('');
  const onInputsChangeRef = useRef(onInputsChange);
  onInputsChangeRef.current = onInputsChange;
  const onResultsChangeRef = useRef(onResultsChange);
  onResultsChangeRef.current = onResultsChange;

  useEffect(() => {
    const fn = onInputsChangeRef.current;
    if (fn && isInProjectCreating) {
      const selectedSlab = slabTypeOptions.find((t: SlabType) => t.id?.toString() === selectedSlabId);
      const selectedSlabName = selectedSlab?.name ?? "";
      const payload = {
        area: area,
        tape1ThicknessCm,
        mortarThicknessCm,
        slabThicknessCm,
        selectedSlabId,
        selectedSlabName,
        cutSlabs: String(isInProjectCreating ? (canvasCutSlabs ?? 0) : (cutSlabs || '0')),
        soilExcessCm,
        selectedGroutingId,
        addFrameBoard,
        frameBorderRowCount: addFrameBoard ? Math.max(1, Math.min(50, Math.floor(Number(frameBorderRowCount) || 1))) : undefined,
        framePieceLengthCm: addFrameBoard ? framePieceLengthCm : undefined,
        framePieceWidthCm: addFrameBoard ? framePieceWidthCm : undefined,
        frameJointType: addFrameBoard ? frameJointType : undefined,
        frameSidesEnabled: addFrameBoard ? frameSidesEnabled : undefined,
        frameBorderMaterial: addFrameBoard ? frameBorderMaterial : undefined,
        pathCornerType: savedInputs?.pathCornerType,
        vizGroutWidthMm,
      };
      const payloadStr = JSON.stringify(payload);
      if (payloadStr !== lastInputsPayloadRef.current) {
        lastInputsPayloadRef.current = payloadStr;
        fn(payload);
      }
    }
  }, [area, tape1ThicknessCm, mortarThicknessCm, slabThicknessCm, selectedSlabId, canvasCutSlabs, soilExcessCm, selectedGroutingId, addFrameBoard, frameBorderRowCount, framePieceLengthCm, framePieceWidthCm, frameJointType, frameSidesEnabled, frameBorderMaterial, savedInputs?.pathCornerType, isInProjectCreating, slabTypeOptions.length, vizGroutWidthMm]);

  useEffect(() => {
    if (!isInProjectCreating || !shape?.closed || shape.points.length < 3) {
      setCanvasCutSlabs((prev) => (prev !== null ? null : prev));
      setCanvasCutGroups((prev) => (prev.length > 0 ? [] : prev));
      return;
    }
    const selectedSlab = slabTypeOptions.find((t: SlabType) => t.id?.toString() === selectedSlabId);
    const inputs = mergedSlabVizInputs(shape, savedInputs, vizGroutWidthMm, selectedSlab?.name);
    if (!inputs.vizSlabWidth) {
      setCanvasCutSlabs((prev) => (prev !== null ? null : prev));
      setCanvasCutGroups((prev) => (prev.length > 0 ? [] : prev));
      return;
    }
    const slabResult = inputs?.pathCenterline ? computePathSlabCuts(shape as any, inputs) : computeSlabCuts(shape as any, inputs);
    const { cuts, cutSlabCount, fullSlabCount, wasteSatisfiedPositions, wasteAreaCm2, reusedAreaCm2 } = slabResult;
    const newGroups = cuts.length > 0 ? groupCutsByLength(cuts) : [];
    setCanvasCutSlabs((prev) => (prev === cutSlabCount ? prev : cutSlabCount));
    setCanvasCutGroups((prev) => {
      if (prev.length !== newGroups.length) return newGroups;
      const same = prev.every((p, i) => newGroups[i] && p.lengthCm === newGroups[i].lengthCm && p.count === newGroups[i].count);
      return same ? prev : newGroups;
    });
    const fn = onInputsChangeRef.current;
    if (fn) {
      const prev = shape.calculatorInputs ?? {};
      const next = {
        vizWasteSatisfied: wasteSatisfiedPositions ?? [],
        vizFullSlabCount: fullSlabCount,
        vizWasteAreaCm2: wasteAreaCm2,
        vizReusedAreaCm2: reusedAreaCm2,
        cutSlabs: String(cutSlabCount),
      };
      const numClose = (a: unknown, b: unknown, eps = 1e-4) => {
        const na = Number(a);
        const nb = Number(b);
        if (!Number.isFinite(na) && !Number.isFinite(nb)) return true;
        if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
        return Math.abs(na - nb) < eps;
      };
      const sameFull =
        Number(prev.vizFullSlabCount ?? 0) === Number(next.vizFullSlabCount ?? 0);
      const sameCutSlabs = String(prev.cutSlabs ?? '') === String(next.cutSlabs);
      const same =
        sameFull
        && numClose(prev.vizWasteAreaCm2, next.vizWasteAreaCm2)
        && numClose(prev.vizReusedAreaCm2, next.vizReusedAreaCm2)
        && sameCutSlabs
        && JSON.stringify(prev.vizWasteSatisfied ?? []) === JSON.stringify(next.vizWasteSatisfied);
      if (!same) {
        fn(next);
      }
    }
  }, [
    isInProjectCreating,
    shape?.calculatorInputs?.vizSlabWidth,
    shape?.calculatorInputs?.vizSlabLength,
    shape?.calculatorInputs?.vizDirection,
    shape?.calculatorInputs?.vizStartCorner,
    shape?.calculatorInputs?.vizPattern,
    shape?.calculatorInputs?.vizGroutWidthMm,
    shape?.calculatorInputs?.vizOriginOffsetX,
    shape?.calculatorInputs?.vizOriginOffsetY,
    shape?.calculatorInputs?.framePieceWidthCm,
    shape?.calculatorInputs?.frameBorderRowCount,
    shape?.calculatorInputs?.pathCenterline,
    shape?.calculatorInputs?.pathIsOutline,
    shape?.calculatorInputs?.slabOrientation,
    savedInputs?.vizSlabWidth,
    savedInputs?.vizSlabLength,
    savedInputs?.vizPattern,
    savedInputs?.vizDirection,
    savedInputs?.vizStartCorner,
    savedInputs?.selectedSlabName,
    JSON.stringify(shape?.points),
    shape?.closed,
    vizGroutWidthMm,
    selectedSlabId,
    slabTypeOptions.length,
  ]);

  // Fetch time estimates for cutting tasks (needed by frame auto-compute below)
  const { data: cuttingTasksData } = useQuery({
    queryKey: ['cutting_tasks', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('company_id', companyId)
        .or('name.ilike.%cutting%,name.ilike.%cut%')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });
  const cuttingTasks = cuttingTasksData ?? [];

  // Fetch task templates for slab frame laying (needed by frame auto-compute below)
  const { data: frameTaskTemplatesData } = useQuery({
    queryKey: ['slab_frame_tasks', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .or('name.ilike.%laying slab frame belove 0.3m2%,name.ilike.%laying slab frame above 0.3m2%')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });
  const frameTaskTemplates = useMemo(() => frameTaskTemplatesData ?? [], [frameTaskTemplatesData]);

  const selectedSlabTypeForFrame = useMemo(
    () => (selectedSlabId ? slabTypeOptions.find((t: SlabType) => t.id?.toString() === selectedSlabId) ?? null : null),
    [selectedSlabId, slabTypeOptions]
  );

  // Ref to avoid setState loop when shape reference changes but frame result is unchanged
  const lastFrameResultsRef = useRef<{ totalFrameSlabs: number; totalHours: number; totalFrameAreaM2: number } | null>(null);
  /** Manual “Calculate frame slabs” on canvas — bumps deps so the auto-compute effect re-runs */
  const [frameRecalcTick, setFrameRecalcTick] = useState(0);

  const clearFrameConfigInline = useCallback(() => {
    setFramePieceLengthCm("90");
    setFramePieceWidthCm("15");
    setFrameBorderRowCount("1");
    setFrameJointType("butt");
    lastFrameResultsRef.current = null;
    setFrameResults(null);
    if (shape) {
      if (isPathElement(shape)) {
        const pathPts = getPathPolygon(shape);
        if (pathPts && pathPts.length >= 3) {
          setFrameSidesEnabled(Array.from({ length: pathPts.length }, () => true));
        } else {
          setFrameSidesEnabled([]);
        }
      } else {
        const eff = getEffectivePolygonWithEdgeIndices(shape);
        const numLogicalEdges = Math.max(...eff.edgeIndices, -1) + 1;
        if (numLogicalEdges > 0) {
          setFrameSidesEnabled(Array.from({ length: numLogicalEdges }, () => true));
        } else {
          setFrameSidesEnabled([]);
        }
      }
    } else {
      setFrameSidesEnabled([]);
    }
    setFrameRecalcTick((x) => x + 1);
  }, [shape]);

  // Auto-compute frame sides from polygon edges when in canvas mode
  useEffect(() => {
    if (!isInProjectCreating || !addFrameBoard) {
      lastFrameResultsRef.current = null;
      return;
    }
    let pts: Point[];
    let edgeIndices: number[];
    if (shape && isPathElement(shape)) {
      const pathPts = getPathPolygon(shape);
      if (!pathPts || pathPts.length < 3 || !shape.closed) { lastFrameResultsRef.current = null; setFrameResults(null); return; }
      pts = pathPts;
      edgeIndices = pathPts.map((_, i) => i);
    } else if (shape) {
      const eff = getEffectivePolygonWithEdgeIndices(shape);
      if (!eff.points.length || eff.points.length < 3 || !shape.closed) { lastFrameResultsRef.current = null; setFrameResults(null); return; }
      pts = eff.points;
      edgeIndices = eff.edgeIndices;
    } else {
      lastFrameResultsRef.current = null;
      setFrameResults(null);
      return;
    }
    const numLogicalEdges = Math.max(...edgeIndices, -1) + 1;
    const rowCount = Math.max(1, Math.min(50, Math.floor(Number(frameBorderRowCount) || 1)));
    const pieceLen = parseFloat(framePieceLengthCm);
    const pieceWid = parseFloat(framePieceWidthCm);
    if (isNaN(pieceLen) || isNaN(pieceWid) || pieceLen <= 0 || pieceWid <= 0) {
      lastFrameResultsRef.current = null;
      setFrameResults(null);
      return;
    }

    if (frameBorderMaterial === "cobble") {
      const jointGapMm = Number(shape?.calculatorInputs?.jointGapMm ?? 1);
      const enabledSides =
        frameSidesEnabled.length >= numLogicalEdges ? frameSidesEnabled : Array.from({ length: numLogicalEdges }, () => true);
      const inputs: Record<string, any> = {
        addFrameToMonoblock: true,
        framePieceLengthCm: pieceLen,
        framePieceWidthCm: pieceWid,
        frameBorderRowCount: rowCount,
        frameJointType,
        frameSidesEnabled: enabledSides,
        jointGapMm,
      };
      const result = computeMonoblockFrameBlocks(shape as any, inputs);
      const layingHours = result.totalFrameBlocks / 60;
      const cutBlocksTask = (taskTemplates as any[])?.find(
        (t: any) => (t.name || "").toLowerCase().includes("cutting") && (t.name || "").toLowerCase().includes("block")
      );
      const hoursPerCut = cutBlocksTask?.estimated_hours ?? 2 / 60;
      const cuttingHours = result.frameAngleCuts * hoursPerCut;
      const nextResults = {
        totalFrameSlabs: result.totalFrameBlocks,
        totalHours: layingHours + cuttingHours,
        totalFrameAreaM2: result.totalFrameAreaM2,
        sides: result.sides.map((s) => ({ length: s.length, slabs: s.blocks })),
        taskName: "laying frame cobbles (60/h)",
        task_id: undefined,
        framePieceLengthCm,
        framePieceWidthCm,
        frameRowsLabel: rowCount > 1 ? `${rowCount}× (${pieceLen}×${pieceWid})` : `${pieceLen}×${pieceWid}`,
        cuttingHours,
        cuttingTaskName: result.frameAngleCuts > 0 ? "(cutting blocks) (frame)" : "",
        cutting_task_id: cutBlocksTask?.id,
        frameCobbleMode: true,
      };
      const prevRef = lastFrameResultsRef.current;
      const changed =
        !prevRef ||
        prevRef.totalFrameSlabs !== nextResults.totalFrameSlabs ||
        prevRef.totalHours !== nextResults.totalHours ||
        prevRef.totalFrameAreaM2 !== nextResults.totalFrameAreaM2;
      if (changed) {
        lastFrameResultsRef.current = {
          totalFrameSlabs: nextResults.totalFrameSlabs,
          totalHours: nextResults.totalHours,
          totalFrameAreaM2: nextResults.totalFrameAreaM2,
        };
        setFrameResults(nextResults);
      }
      return;
    }

    const groutMm = Number(shape?.calculatorInputs?.vizGroutWidthMm ?? (shape?.calculatorInputs?.vizGroutWidth != null ? Number(shape.calculatorInputs.vizGroutWidth) * 10 : 5));
    const groutM = groutMm / 1000;
    const enabled = frameSidesEnabled.length >= numLogicalEdges ? frameSidesEnabled : Array.from({ length: numLogicalEdges }, () => true);
    const edgeLengths: number[] = Array(numLogicalEdges).fill(0);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const edgeIdx = edgeIndices[j];
      const segLenM = distance(pts[i], pts[j]) / PIXELS_PER_METER;
      edgeLengths[edgeIdx] += segLenM;
    }

    let totalFrameSlabs = 0;
    let totalHours = 0;
    let totalFrameAreaM2 = 0;
    let totalCuts = 0;
    const sidesAll: Array<{ length: number; slabs: number }> = [];
    let primaryTaskName = "laying slab frame above 0.3m2";
    let primaryTaskId: string | undefined;

    const pieceLenM = pieceLen / 100;
    const stepM = pieceLenM + groutM;
    const widthM = pieceWid / 100;
    const pieceAreaM2 = (pieceLen / 100) * widthM;
    const taskName = pieceAreaM2 < 0.3 ? "laying slab frame belove 0.3m2" : "laying slab frame above 0.3m2";
    primaryTaskName = taskName;
    const frameTaskForRow = frameTaskTemplates.find((t: any) => t.name?.toLowerCase().includes(taskName.toLowerCase()));
    if (frameTaskForRow?.id) primaryTaskId = frameTaskForRow.id;

    for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
      const sides: Array<{ length: number; slabs: number }> = [];
      for (let e = 0; e < numLogicalEdges; e++) {
        if (enabled[e] === false) continue;
        const sideLengthM = edgeLengths[e];
        const slabsPerSide = Math.ceil((sideLengthM + groutM) / stepM);
        sides.push({ length: sideLengthM, slabs: slabsPerSide });
      }
      const rowSlabs = sides.reduce((sum, s) => sum + s.slabs, 0);
      totalFrameSlabs += rowSlabs;
      for (const s of sides) sidesAll.push(s);
      if (frameTaskForRow?.estimated_hours != null) {
        totalHours += rowSlabs * frameTaskForRow.estimated_hours;
      }
      totalFrameAreaM2 += sides.reduce((sum, s) => sum + s.length * widthM, 0);
      totalCuts += sides.length * 3;
    }

    const frameTask = frameTaskTemplates.find((t: any) => t.name?.toLowerCase().includes(primaryTaskName.toLowerCase()));
    const selectedSlabType = slabTypeOptions.find((t: SlabType) => t.id?.toString() === selectedSlabId);
    let cuttingHours = 0;
    let cuttingTaskName = "";
    let cuttingTaskId: string | undefined;
    if (selectedSlabType && totalCuts > 0) {
      const isPorcelain = (selectedSlabType.name || "").toLowerCase().includes("slab") && !(selectedSlabType.name || "").toLowerCase().includes("sandstone");
      const cuttingTaskSearchName = isPorcelain ? "cutting porcelain" : "cutting sandstones";
      const cuttingTask = (cuttingTasks as any[])?.find((t: any) => (t.name || "").toLowerCase().includes(cuttingTaskSearchName));
      if (cuttingTask?.estimated_hours != null) {
        cuttingHours = totalCuts * cuttingTask.estimated_hours;
        cuttingTaskName = `${cuttingTask.name} (frame)`;
        cuttingTaskId = cuttingTask.id;
      } else {
        const minutesPerCut = isPorcelain ? 6 : 4;
        cuttingHours = (totalCuts * minutesPerCut) / 60;
        cuttingTaskName = isPorcelain ? "Cutting porcelain (frame)" : "Cutting sandstones (frame)";
      }
    }
    const nextResults = {
      totalFrameSlabs,
      totalHours: totalHours + cuttingHours,
      totalFrameAreaM2,
      sides: sidesAll,
      taskName: frameTask?.name || primaryTaskName,
      task_id: frameTask?.id ?? primaryTaskId,
      framePieceLengthCm,
      framePieceWidthCm,
      frameRowsLabel: rowCount > 1 ? `${rowCount}× (${pieceLen}×${pieceWid})` : `${pieceLen}×${pieceWid}`,
      cuttingHours,
      cuttingTaskName,
      cutting_task_id: cuttingTaskId,
    };
    const prevRef = lastFrameResultsRef.current;
    const changed = !prevRef || prevRef.totalFrameSlabs !== nextResults.totalFrameSlabs || prevRef.totalHours !== nextResults.totalHours || prevRef.totalFrameAreaM2 !== nextResults.totalFrameAreaM2;
    if (changed) {
      lastFrameResultsRef.current = { totalFrameSlabs: nextResults.totalFrameSlabs, totalHours: nextResults.totalHours, totalFrameAreaM2: nextResults.totalFrameAreaM2 };
      setFrameResults(nextResults);
    }
  }, [isInProjectCreating, addFrameBoard, shape, frameSidesEnabled, frameBorderMaterial, frameJointType, shape?.calculatorInputs?.vizGroutWidthMm, shape?.calculatorInputs?.vizGroutWidth, shape?.calculatorInputs?.jointGapMm, frameBorderRowCount, framePieceLengthCm, framePieceWidthCm, frameTaskTemplates, cuttingTasks, taskTemplates, slabTypeOptions, selectedSlabId, frameRecalcTick]);

  const [calculateDigging, setCalculateDigging] = useState<boolean>(false);
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Use carriers from props if available (from ProjectCreating), otherwise use local state
  const carriers = propCarriers && propCarriers.length > 0 ? propCarriers : carriersLocal;
  const [soilTransportDistance, setSoilTransportDistance] = useState<string>('30');
  const [tape1TransportDistance, setTape1TransportDistance] = useState<string>('30');
  const [materialTransportDistance, setMaterialTransportDistance] = useState<string>('30'); // For slabs/sand/cement transport
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [transportDistance, setTransportDistance] = useState<string>('30'); // Local state for transport distance
  const [selectedCompactor, setSelectedCompactor] = useState<CompactorOption | null>(null);
  const effectiveCompactor = isInProjectCreating && propSelectedCompactor ? propSelectedCompactor : selectedCompactor;
  const effectiveCalculateTransport = isInProjectCreating ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSelectedTransportCarrier = isInProjectCreating ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;

  useEffect(() => {
    if (savedInputs?.addFrameBoard !== undefined) setAddFrameBoard((prev) => (!!savedInputs.addFrameBoard !== prev ? !!savedInputs.addFrameBoard : prev));
    if (savedInputs?.framePieceLengthCm != null) setFramePieceLengthCm((prev) => (String(savedInputs.framePieceLengthCm) !== prev ? String(savedInputs.framePieceLengthCm) : prev));
    if (savedInputs?.framePieceWidthCm != null) setFramePieceWidthCm((prev) => (String(savedInputs.framePieceWidthCm) !== prev ? String(savedInputs.framePieceWidthCm) : prev));
    if (savedInputs?.frameJointType === "butt" || savedInputs?.frameJointType === "miter45") setFrameJointType((prev) => (savedInputs.frameJointType !== prev ? savedInputs.frameJointType : prev));
    if (savedInputs?.frameBorderMaterial === "slab" || savedInputs?.frameBorderMaterial === "cobble") {
      const m = savedInputs.frameBorderMaterial as "slab" | "cobble";
      setFrameBorderMaterial((prev) => (m !== prev ? m : prev));
    }
    if (savedInputs?.frameBorderRowCount != null || savedInputs?.framePieceLengthCm != null || Array.isArray(savedInputs?.frameBorderRows)) {
      const next = parseFrameBorderRowCountFromSaved(savedInputs);
      setFrameBorderRowCount((prev) => (next !== prev ? next : prev));
    }
    if (Array.isArray(savedInputs?.frameSidesEnabled)) {
      const next = savedInputs.frameSidesEnabled;
      setFrameSidesEnabled((prev) => (JSON.stringify(prev) !== JSON.stringify(next) ? next : prev));
    }
  }, [savedInputs?.addFrameBoard, savedInputs?.frameBorderRowCount, savedInputs?.framePieceLengthCm, savedInputs?.framePieceWidthCm, savedInputs?.frameJointType, savedInputs?.frameSidesEnabled, savedInputs?.frameBorderMaterial, savedInputs?.frameBorderRows]);

  useEffect(() => {
    if (savedInputs?.tape1ThicknessCm != null && savedInputs.tape1ThicknessCm !== '') setTape1ThicknessCm((prev) => (String(savedInputs.tape1ThicknessCm) !== prev ? String(savedInputs.tape1ThicknessCm) : prev));
    if (savedInputs?.mortarThicknessCm != null && savedInputs.mortarThicknessCm !== '') setMortarThicknessCm((prev) => (String(savedInputs.mortarThicknessCm) !== prev ? String(savedInputs.mortarThicknessCm) : prev));
    if (savedInputs?.slabThicknessCm != null && savedInputs.slabThicknessCm !== '') setSlabThicknessCm((prev) => (String(savedInputs.slabThicknessCm) !== prev ? String(savedInputs.slabThicknessCm) : prev));
  }, [savedInputs?.tape1ThicknessCm, savedInputs?.mortarThicknessCm, savedInputs?.slabThicknessCm]);

  // Sync transport props to local state when in ProjectCreating (one-way: parent → child)
  useEffect(() => {
    if (!isInProjectCreating) return;
    if (propCalculateTransport !== undefined) setCalculateTransport((prev) => (propCalculateTransport !== prev ? propCalculateTransport : prev));
    if (propSelectedTransportCarrier !== undefined) setSelectedTransportCarrier((prev) => (propSelectedTransportCarrier !== prev ? propSelectedTransportCarrier : prev));
    if (propTransportDistance !== undefined) {
      setTransportDistance((prev) => (propTransportDistance !== prev ? propTransportDistance : prev));
      setMaterialTransportDistance((prev) => (propTransportDistance !== prev ? propTransportDistance : prev));
    }
  }, [
    isInProjectCreating,
    propCalculateTransport,
    propSelectedTransportCarrier,
    propTransportDistance
  ]);

  // Fetch grouting methods (tasks with 'grouting' in the name)
  const { data: groutingMethods = [], isLoading: isLoadingGrouting } = useQuery({
    queryKey: ['grouting_methods', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .ilike('name', '%grouting%')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch task template for final leveling type 1
  const { data: finalLevelingTypeOneTask } = useQuery({
    queryKey: ['final_leveling_type_one_task', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'final leveling (type 1)')
        .single();
      if (error) {
        console.error('Error fetching final leveling type 1 task:', error);
        throw error;
      }
      return data;
    },
    enabled: !!companyId
  });

  // Fetch task template for mixing mortar
  const { data: mixingMortarTask } = useQuery({
    queryKey: ['mixing_mortar_task', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .eq('name', 'mixing mortar')
        .single();
      if (error) {
        console.error('Error fetching mixing mortar task:', error);
        throw error;
      }
      return data;
    },
    enabled: !!companyId
  });

  // Fetch material usage configuration for Slab Calculator
  const { data: materialUsageConfig } = useQuery<MaterialUsageConfig[]>({
    queryKey: ['materialUsageConfig', 'slab', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('material_usage_configs')
        .select('calculator_id, material_id, company_id')
        .eq('calculator_id', 'slab')
        .eq('company_id', companyId);

      if (error) throw error;
      return data as MaterialUsageConfig[];
    },
    enabled: !!companyId
  });

  // Fetch mortar mix ratio config from universal table
  const { data: mortarMixRatioConfig } = useQuery<{ id: string; mortar_mix_ratio: string } | null>({
    queryKey: ['mortarMixRatio', 'slab', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId) return null;

      try {
        const { data, error } = await supabase
          .from('mortar_mix_ratios')
          .select('id, mortar_mix_ratio')
          .eq('company_id', companyId)
          .eq('type', 'slab')
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
      return data;
      } catch (err) {
        console.error('Error fetching mortar mix ratio:', err);
        return null;
      }
    },
    enabled: !!companyId
  });

  // Fetch details of the selected sand material
  const selectedSandMaterialId = materialUsageConfig?.[0]?.material_id;

  const { data: selectedSandMaterial } = useQuery<Material>({
    queryKey: ['material', selectedSandMaterialId || 'no-material', companyId || 'no-company'],
    queryFn: async () => {
      if (!companyId || !selectedSandMaterialId) {
        return { name: '', amount: 0, unit: '', price_per_unit: null, total_price: null } as Material;
      }
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, unit, price')
        .eq('company_id', companyId)
        .eq('id', selectedSandMaterialId)
        .single();

      if (error) throw error;
      return data as Material;
    },
    enabled: !!selectedSandMaterialId && !!companyId
  });

  // Add query for tape1 preparation tasks - REMOVED, now using exact template names from taskTemplates

  const fetchMaterialPrices = async (materials: Material[]) => {
    try {
      if (!companyId) return materials;
      const materialNames = materials.map(m => m.name);
      
      const { data, error } = await supabase
        .from('materials')
        .select('name, price')
        .eq('company_id', companyId)
        .in('name', materialNames);
      
      if (error) throw error;
      
      // Create a map of material names to prices
      const priceMap = (data as { name: string; price: number }[]).reduce((acc: Record<string, number>, item: { name: string; price: number }) => {
        acc[item.name] = item.price;
        return acc;
      }, {});
      
      // Update materials with prices
      return materials.map((material: Material) => ({
        ...material,
        price_per_unit: priceMap[material.name] || null,
        total_price: priceMap[material.name] ? priceMap[material.name] * material.amount : null
      }));
    } catch (err) {
      console.error('Error fetching material prices:', err);
      return materials.map(material => ({
        ...material,
        price_per_unit: null,
        total_price: null
      }));
    }
  };

  // Add equipment fetching (same logic as Canvas/EquipmentPanel - fetch all carriers without filtering)
  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const companyId = useAuthStore.getState().getCompanyId();
        if (!companyId) return;

        const [excRes, carRes] = await Promise.all([
          supabase.from('setup_digging').select('*').eq('type', 'excavator').eq('company_id', companyId),
          supabase.from('setup_digging').select('*').eq('type', 'barrows_dumpers').eq('company_id', companyId),
        ]);

        if (excRes.error) throw excRes.error;
        if (carRes.error) throw carRes.error;

        setExcavators(excRes.data || []);
        setCarriersLocal(carRes.data || []);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    if (calculateDigging || calculateTransport || (isInProjectCreating && propSelectedExcavator)) fetchEquipment();
  }, [calculateDigging, calculateTransport, isInProjectCreating, propSelectedExcavator]);

  // Add time estimate functions
  // Helper function to calculate material transport time
  const calculateMaterialTransportTime = (
    materialAmount: number,
    carrierSize: number,
    materialType: string,
    transportDistanceMeters: number
  ) => {
    const carrierSpeedData = carrierSpeeds.find(c => c.size === carrierSize);
    const carrierSpeed = carrierSpeedData?.speed || DEFAULT_CARRIER_SPEED_M_PER_H;
    const materialCapacityUnits = getMaterialCapacity(materialType, carrierSize);
    const trips = Math.ceil(materialAmount / materialCapacityUnits);
    const timePerTrip = (transportDistanceMeters * 2) / carrierSpeed;
    const totalTransportTime = trips * timePerTrip;
    const normalizedTransportTime = (totalTransportTime * 30) / transportDistanceMeters;
    return { trips, totalTransportTime, normalizedTransportTime };
  };

  // Helper function to parse mortar mix ratio and get cement proportion
  const getMortarMixRatioProportion = (mixRatio: string | undefined = '1:4'): { cementProportion: number; sandProportion: number } => {
    const ratio = mixRatio || '1:4';
    const [cementPart, sandPart] = ratio.split(':').map(Number);
    const totalParts = cementPart + sandPart;
    const cementProportion = cementPart / totalParts;
    const sandProportion = sandPart / totalParts;
    return { cementProportion, sandProportion };
  };

  // Define loading sand time estimates (same as preparation digger estimates)
  const loadingSandDiggerTimeEstimates = [
    { equipment: 'Shovel (1 Person)', sizeInTons: 0.02, timePerTon: 0.5 },
    { equipment: 'Digger 0.5T', sizeInTons: 0.5, timePerTon: 0.36 },
    { equipment: 'Digger 1T', sizeInTons: 1, timePerTon: 0.18 },
    { equipment: 'Digger 2T', sizeInTons: 2, timePerTon: 0.12 },
    { equipment: 'Digger 3-5T', sizeInTons: 3, timePerTon: 0.08 },
    { equipment: 'Digger 6-10T', sizeInTons: 6, timePerTon: 0.05 },
    { equipment: 'Digger 11-20T', sizeInTons: 11, timePerTon: 0.03 },
    { equipment: 'Digger 21-30T', sizeInTons: 21, timePerTon: 0.02 },
    { equipment: 'Digger 31-40T', sizeInTons: 31, timePerTon: 0.01 },
    { equipment: 'Digger 41-50T', sizeInTons: 41, timePerTon: 0.005 }
  ];

  const findLoadingSandTimeEstimate = (sizeInTons: number): number => {
    if (sizeInTons <= 0) return loadingSandDiggerTimeEstimates[0].timePerTon;
    
    for (let i = 0; i < loadingSandDiggerTimeEstimates.length - 1; i++) {
      if (
        sizeInTons >= loadingSandDiggerTimeEstimates[i].sizeInTons &&
        sizeInTons < loadingSandDiggerTimeEstimates[i + 1].sizeInTons
      ) {
        return loadingSandDiggerTimeEstimates[i].timePerTon;
      }
    }
    
    return loadingSandDiggerTimeEstimates[loadingSandDiggerTimeEstimates.length - 1].timePerTon;
  };

  const calculate = async () => {
    if (!area) {
      setCalculationError(t('calculator:enter_area'));
      return;
    }
    
    if (!tape1ThicknessCm) {
      setCalculationError(t('calculator:enter_aggregate_thickness'));
      return;
    }
    
    if (!mortarThicknessCm) {
      setCalculationError(t('calculator:enter_mortar_thickness'));
      return;
    }
    
    if (!slabThicknessCm) {
      setCalculationError(t('calculator:enter_slab_thickness'));
      return;
    }
    
    if (!selectedSlabId) {
      setCalculationError(t('calculator:select_slab_type'));
      return;
    }

    if (isLoading) {
      setCalculationError(t('calculator:loading_slab_types'));
      return;
    }

    // Same filter as the slab-type dropdown (laying slabs, not concrete)
    const selectedSlabType = slabTypeOptions.find((type: SlabType) => type.id.toString() === selectedSlabId);

    if (!selectedSlabType) {
      setCalculationError(t('calculator:slab_type_not_found', { id: selectedSlabId }));
      return;
    }
    
    setCalculationError(null);
    
    try {
      const areaNum = parseFloat(area);
      const vizInputs = mergedSlabVizInputs(shape, savedInputs, vizGroutWidthMm, selectedSlabType.name);
      const purchase = computeSlabPurchaseFromShape(shape, vizInputs);
      const cutGroupsForHours =
        purchase && purchase.cuts.length > 0 ? groupCutsByLength(purchase.cuts) : canvasCutGroups;
      // Convert cm to meters for calculations
      const tape1ThicknessM = parseFloat(tape1ThicknessCm) / 100; // cm to meters
      const mortarThicknessM = parseFloat(mortarThicknessCm) / 100; // cm to meters
      const slabThicknessM = parseFloat(slabThicknessCm) / 100; // cm to meters
      const soilExcessM = soilExcessCm ? parseFloat(soilExcessCm) / 100 : 0; // cm to meters
      const cutSlabsNum = isInProjectCreating
        ? (purchase?.cutSlabCount ?? canvasCutSlabs ?? 0)
        : (cutSlabs ? parseInt(cutSlabs) : 0);
      
      // Calculate effective area for regular slabs (subtract frame area if applicable)
      const frameAreaM2 = addFrameBoard && frameResults ? frameResults.totalFrameAreaM2 : 0;
      const effectiveAreaM2 = areaNum - frameAreaM2;
      
      // Calculate base hours needed for installation based on time estimator
      let mainTaskHours = 0;
      
      // Check if the selected task has a valid unit and estimated_hours
      if (selectedSlabType.unit && selectedSlabType.estimated_hours !== undefined) {
        const unitLower = selectedSlabType.unit.toLowerCase();
        if (unitLower === 'm2' || unitLower === 'square meters') {
          // Use effective area (total area minus frame area) for regular slab calculations
          mainTaskHours = effectiveAreaM2 * (selectedSlabType.estimated_hours || 0);
        } else {
          // For other units, use effective area
          mainTaskHours = effectiveAreaM2 * (selectedSlabType.estimated_hours || 0);
        }
      } else {
        console.warn('Selected task has no unit or estimated_hours:', selectedSlabType);
      }
      
      const isPorcelain = (selectedSlabType.name || '').toLowerCase().includes('slab') && 
        !(selectedSlabType.name || '').toLowerCase().includes('sandstone');
      const cuttingTaskName = isPorcelain ? 'cutting porcelain' : 'cutting sandstones';
      const cuttingTask = cuttingTasks.find(task => 
        (task.name || '').toLowerCase().includes(cuttingTaskName)
      );
      const hoursPerCut = cuttingTask?.estimated_hours ?? (isPorcelain ? 6 : 4) / 60;

      let cuttingHours = 0;
      const cuttingBreakdownEntries: { task: string; hours: number; amount: number; unit: string; event_task_id?: string }[] = [];
      if (cutGroupsForHours.length > 0) {
        for (const g of cutGroupsForHours) {
          const h = g.count * hoursPerCut;
          cuttingHours += h;
          cuttingBreakdownEntries.push({
            task: `(${g.count}) cutting ${g.lengthCm}cm`,
            hours: h,
            amount: g.count,
            unit: 'cuts',
            event_task_id: cuttingTask?.id,
          });
        }
      } else if (cutSlabsNum > 0) {
        cuttingHours = cutSlabsNum * hoursPerCut;
        cuttingBreakdownEntries.push({
          task: `(${cutSlabsNum}) ${cuttingTaskName}`,
          hours: cuttingHours,
          amount: cutSlabsNum,
          unit: 'slabs',
          event_task_id: cuttingTask?.id,
        });
      }
      
      // Calculate materials needed (slab thickness from user input)
      const totalDepthM = tape1ThicknessM + mortarThicknessM + slabThicknessM + soilExcessM;
      
      // Calculate soil to be dug out (area × total depth)
      const soilVolumeM3 = areaNum * totalDepthM;
      // Convert soil volume to tonnes (approximately 1.5 tonnes per cubic meter)
      const soilTonnes = soilVolumeM3 * 1.5;
      
      // Calculate tape1 needed (area × tape1 thickness)
      const tape1VolumeM3 = areaNum * tape1ThicknessM;
      // Convert tape1 volume to tonnes (approximately 2.1 tonnes per cubic meter)
      const tape1Tonnes = tape1VolumeM3 * 2.1;
      
      // Calculate mortar needed (area × mortar thickness)
      const mortarVolumeM3 = areaNum * mortarThicknessM;
      
      // Break down mortar into cement and sand using configurable mix ratio
      // Mortar mix ratio is stored in slab_mortar_mix_ratios table
      const mortarMixRatio = mortarMixRatioConfig?.mortar_mix_ratio || '1:4';
      const { cementProportion, sandProportion } = getMortarMixRatioProportion(mortarMixRatio);
      
      const cementVolume = mortarVolumeM3 * cementProportion * 1.3; // configured proportion + 30% extra cement
      const sandVolume = mortarVolumeM3 * sandProportion * 1.5; // configured proportion + 50% extra sand
      // Convert sand volume to tonnes (approximately 1.6 tonnes per cubic meter)
      const sandTonnes = sandVolume * 1.6;
      
      // Convert cement volume to bags (1 bag = 25kg = ~0.0167 cubic meters)
      const cementBags = cementVolume / 0.0167;
      
      // Get transport distance in meters (use project distance when in project mode)
      const transportDistanceMeters = parseFloat(isInProjectCreating && propTransportDistance ? propTransportDistance : materialTransportDistance) || 30;


      // Calculate material transport times if "Calculate transport time" is checked
      let slabTransportTime = 0;
      let sandTransportTime = 0;
      let cementTransportTime = 0;
      let normalizedSlabTransportTime = 0;
      let normalizedSandTransportTime = 0;
      let normalizedCementTransportTime = 0;
      let frameSlabTransportTime = 0;
      let normalizedFrameSlabTransportTime = 0;

      const mainFieldSlabPieces = areaNum * 2; // pole główne
      const frameSlabPieces =
        addFrameBoard && frameResults && frameResults.totalFrameSlabs > 0 ? frameResults.totalFrameSlabs : 0;

      if (effectiveCalculateTransport) {
        // Use selected transport carrier or default to wheelbarrow 0.125t
        let carrierSizeForTransport = 0.125;
        
        if (effectiveSelectedTransportCarrier) {
          carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
        }
        if (mainFieldSlabPieces > 0) {
          const slabResult = calculateMaterialTransportTime(mainFieldSlabPieces, carrierSizeForTransport, 'slabs', transportDistanceMeters);
          slabTransportTime = slabResult.totalTransportTime;
          normalizedSlabTransportTime = slabResult.normalizedTransportTime;
        }
        if (frameSlabPieces > 0) {
          const frameTx = calculateMaterialTransportTime(frameSlabPieces, carrierSizeForTransport, 'slabs', transportDistanceMeters);
          frameSlabTransportTime = frameTx.totalTransportTime;
          normalizedFrameSlabTransportTime = frameTx.normalizedTransportTime;
        }

        // Calculate sand transport
        if (sandTonnes > 0) {
          const sandResult = calculateMaterialTransportTime(sandTonnes, carrierSizeForTransport, 'sand', transportDistanceMeters);
          sandTransportTime = sandResult.totalTransportTime;
          normalizedSandTransportTime = sandResult.normalizedTransportTime;
        }

        // Calculate cement transport
        if (cementBags > 0) {
          const cementResult = calculateMaterialTransportTime(cementBags, carrierSizeForTransport, 'cement', transportDistanceMeters);
          cementTransportTime = cementResult.totalTransportTime;
          normalizedCementTransportTime = cementResult.normalizedTransportTime;
        }
      }
      
      // Calculate compacting time if compactor is selected
      let compactingTimeTotal = 0;
      let compactingCompactorName = '';

      if (effectiveCompactor && tape1ThicknessCm) {
        // Use tape1 thickness for compacting calculation in Slab Calculator (no sand layer)
        const compactingDepthCm = parseFloat(tape1ThicknessCm || '0');
        
        if (compactingDepthCm > 0) {
          // In Slab Calculator, we only compact type1 (tape1), not mortar
          const compactingCalc = calculateCompactingTime(effectiveCompactor, compactingDepthCm, 'type1');
          compactingTimeTotal = effectiveAreaM2 * compactingCalc.timePerM2 * compactingCalc.totalPasses;
          compactingCompactorName = compactingCalc.compactorTaskName;
        }
      }
      
      // Create task breakdown with only tasks that have time estimates
      const breakdown = [];
      
      // Only add main task if it has hours
      if (mainTaskHours > 0) {
        breakdown.push({ 
          task: `${selectedSlabType.name}`,
          event_task_id: selectedSlabType.id?.toString(),
          hours: mainTaskHours,
          amount: effectiveAreaM2,
          unit: 'square meters'
        });
      }
      
      // Add slab transport if applicable
      if (effectiveCalculateTransport && slabTransportTime > 0) {
        breakdown.push({
          task: 'transport slabs',
          hours: slabTransportTime,
          amount: `${mainFieldSlabPieces.toFixed(0)} pieces`,
          unit: 'pieces',
          normalizedHours: normalizedSlabTransportTime
        });
      }

      // Add sand transport if applicable
      if (effectiveCalculateTransport && sandTransportTime > 0) {
        breakdown.push({
          task: 'transport sand',
          hours: sandTransportTime,
          amount: `${sandTonnes.toFixed(2)} tonnes`,
          unit: 'tonnes',
          normalizedHours: normalizedSandTransportTime
        });
      }

      // Add cement transport if applicable
      if (effectiveCalculateTransport && cementTransportTime > 0) {
        breakdown.push({
          task: 'transport cement',
          hours: cementTransportTime,
          amount: `${cementBags.toFixed(0)} bags`,
          unit: 'bags',
          normalizedHours: normalizedCementTransportTime
        });
      }
      
      if (cuttingHours > 0) {
        for (const e of cuttingBreakdownEntries) {
          breakdown.push(e);
        }
      }
      
      // Add grouting method if selected
      if (selectedGroutingId) {
        const groutingTask = groutingMethods.find((g: any) => g.id.toString() === selectedGroutingId);
        if (groutingTask && groutingTask.estimated_hours !== undefined && groutingTask.estimated_hours !== null) {
          let groutingHours = groutingTask.estimated_hours;
          const unitLower = groutingTask.unit ? groutingTask.unit.toLowerCase() : '';
          if (unitLower === 'm2' || unitLower === 'square meters') {
            groutingHours = areaNum * groutingTask.estimated_hours;
          }
          breakdown.push({
            task: groutingTask.name || 'Grouting',
            event_task_id: groutingTask.id,
            hours: groutingHours,
            amount: areaNum,
            unit: groutingTask.unit || ''
          });
        }
      }
      
      // Add primer coating (slab backs) task
      // Extract slab size from selectedSlabType.name (e.g., "600x600", "1200x600")
      // Calculate number of slabs based on area
      const extractSlabSizeM2 = () => {
        const name = selectedSlabType.name.toLowerCase();
        // Check if it's a mix size slab
        if (name.includes('mix')) {
          // Mix size slabs: 3 slabs per m²
          return 1 / 3; // 0.333... m² per slab
        }
        // Try to find dimension pattern like "600x600" or "600 x 600"
        const match = name.match(/(\d+)\s*x\s*(\d+)/i);
        if (match) {
          const d1 = parseInt(match[1], 10);
          const d2 = parseInt(match[2], 10);
          // Values >= 100 are typically mm (e.g. 600x600), values < 100 are cm (e.g. 90x60)
          const inMm = d1 >= 100 && d2 >= 100;
          const dim1M = inMm ? d1 / 1000 : d1 / 100;
          const dim2M = inMm ? d2 / 1000 : d2 / 100;
          return dim1M * dim2M;
        }
        // Default to 0.36 m² (600x600mm) if can't extract
        return 0.36;
      };
      
      const slabSizeM2 = extractSlabSizeM2();
      const numberOfSlabs = Math.ceil(effectiveAreaM2 / slabSizeM2);
      
      if (numberOfSlabs > 0) {
        breakdown.push({
          task: 'Primer coating (slab backs)',
          hours: numberOfSlabs * (1 / 60), // 1 minute per slab = 0.01667 hours
          amount: numberOfSlabs,
          unit: 'slabs'
        });
      }

      // Add frame primer coating if applicable (slab frame only; cobble frame uses different material)
      if (addFrameBoard && frameResults && frameResults.totalFrameSlabs > 0 && !frameResults.frameCobbleMode) {
        breakdown.push({
          task: 'Primer coating (frame backs)',
          hours: frameResults.totalFrameSlabs * (0.5 / 60), // 0.5 minute per frame slab = 0.00833 hours
          amount: frameResults.totalFrameSlabs,
          unit: 'frame slabs'
        });
      }
      
      // Determine which excavator to use
      const activeExcavator = isInProjectCreating && propSelectedExcavator ? propSelectedExcavator : selectedExcavator;
      
      // Add digging time if selected
      // In project/canvas mode, include digging when an excavator is set (same idea as NaturalTurfCalculator).
      if ((calculateDigging || isInProjectCreating) && activeExcavator && tape1ThicknessM > 0) {
        // Calculate total excavation volume (soil volume)
        const totalExcavationVolumeM3 = soilVolumeM3; // Use the already calculated soil volume
        const totalTons = totalExcavationVolumeM3 * 1.5; // Use consistent 1.5 tonnes per cubic meter for soil

        // Add soil excavation time using NEW SYSTEM - exact template name matching
        let soilExcavationTime = 0;
        const excavatorSize = activeExcavator["size (in tones)"] || 0;
        const excavatorName = activeExcavator.name || '';

        // Find soil excavation template by exact name pattern (NEW SYSTEM)
        const soilExcavationTemplate = taskTemplates.find((template: any) => {
          const name = (template.name || '').toLowerCase();
          return name.includes('excavation soil') && 
                 name.includes(excavatorName.toLowerCase()) &&
                 name.includes(`(${excavatorSize}t)`);
        });

        if (soilExcavationTemplate && soilExcavationTemplate.estimated_hours) {
          // Use estimated_hours as rate per tonne and multiply by actual tonnage
          soilExcavationTime = soilExcavationTemplate.estimated_hours * totalTons;
        } else {
          console.warn('Soil excavation template not found for:', `Excavation soil with ${excavatorName} (${excavatorSize}t)`);
          soilExcavationTime = 0; // No fallback, template must exist
        }

        // Add tape1 loading time using NEW SYSTEM - exact template name matching
        let tape1LoadingTime = 0;
        if (tape1ThicknessM > 0) {
          // Use already calculated tape1 values with consistent density
          const tape1Tons = tape1VolumeM3 * 2.1; // Use consistent 2.1 tonnes per cubic meter for tape1
          
          // Find tape1 loading template by exact name pattern (NEW SYSTEM)
          const tape1Template = taskTemplates.find((template: any) => {
            const name = (template.name || '').toLowerCase();
            return name.includes('loading tape1') && 
                   name.includes(excavatorName.toLowerCase()) &&
                   name.includes(`(${excavatorSize}t)`);
          });

          if (tape1Template && tape1Template.estimated_hours) {
            // Use estimated_hours as rate per tonne and multiply by actual tonnage
            tape1LoadingTime = tape1Template.estimated_hours * tape1Tons;
          } else {
            console.warn('Tape1 loading template not found for:', `Loading tape1 with ${excavatorName} (${excavatorSize}t)`);
            tape1LoadingTime = 0; // No fallback, template must exist
          }
        }

        breakdown.push({
          task: 'Soil excavation',
          event_task_id: soilExcavationTemplate?.id,
          hours: soilExcavationTime,
          amount: totalTons,
          unit: 'tonnes'
        });

        if (tape1LoadingTime > 0) {
          const tape1Template = taskTemplates.find((template: any) => {
            const name = (template.name || '').toLowerCase();
            return name.includes('loading tape1') && 
                   name.includes(excavatorName.toLowerCase()) &&
                   name.includes(`(${excavatorSize}t)`);
          });
          
          breakdown.push({
            task: 'Loading tape1',
            event_task_id: tape1Template?.id,
            hours: tape1LoadingTime,
            amount: tape1Tonnes, // Use consistent calculation with material list
            unit: 'tonnes'
          });
        }

        // Add loading sand time if applicable
        let loadingSandTime = 0;
        if (sandTonnes > 0) {
          // Use loading sand time estimate based on excavator size
          const loadingSandTimePerTon = findLoadingSandTimeEstimate(excavatorSize);
          loadingSandTime = loadingSandTimePerTon * sandTonnes;
        }

        if (loadingSandTime > 0) {
          breakdown.push({
            task: 'Loading sand',
            hours: loadingSandTime,
            amount: sandTonnes,
            unit: 'tonnes'
          });
        }

        // Add transport tasks for soil and tape1 if carrier is selected and distance > 0
        if (selectedCarrier && selectedCarrier.speed_m_per_hour) {
          const soilDistanceMeters = parseFloat(soilTransportDistance) || 0;
          const tape1DistanceMeters = parseFloat(tape1TransportDistance) || 0;
          
          // Calculate soil transport
          if (soilDistanceMeters > 0 && totalTons > 0) {
            const soilCapacity = getMaterialCapacity('soil', selectedCarrier["size (in tones)"] || 0);
            const soilTrips = Math.ceil(totalTons / soilCapacity);
            const soilTransportTime = (soilTrips * soilDistanceMeters * 2) / selectedCarrier.speed_m_per_hour;
            
            breakdown.push({
              task: `Transporting soil (${soilDistanceMeters}m)`,
              hours: soilTransportTime,
              amount: totalTons,
              unit: 'tonnes'
            });
          }
          
          // Calculate tape1 transport
          if (tape1DistanceMeters > 0 && tape1ThicknessM > 0 && tape1Tonnes > 0) {
            const tape1Capacity = getMaterialCapacity('tape1', selectedCarrier["size (in tones)"] || 0);
            const tape1Trips = Math.ceil(tape1Tonnes / tape1Capacity);
            const tape1TransportTime = (tape1Trips * tape1DistanceMeters * 2) / selectedCarrier.speed_m_per_hour;
            
            breakdown.push({
              task: `Transporting tape1 (${tape1DistanceMeters}m)`,
              hours: tape1TransportTime,
              amount: tape1Tonnes,
              unit: 'tonnes'
            });
          }
        }
      }
      
      // Add frame results if applicable (dystans/nośnik z głównego Slab Calculator)
      if (addFrameBoard && frameResults) {
        breakdown.push({
          task: frameResults.taskName,
          event_task_id: frameResults.task_id,
          hours: frameResults.totalHours - frameResults.cuttingHours, // Just the laying hours
          amount: frameResults.totalFrameSlabs,
          unit: 'pieces'
        });
        
        if (frameResults.cuttingHours > 0) {
          const totalCuts = frameResults.sides.length * 3; // 3 cuts per side
          breakdown.push({
            task: frameResults.cuttingTaskName || 'Frame cutting',
            event_task_id: frameResults.cutting_task_id,
            hours: frameResults.cuttingHours,
            amount: totalCuts,
            unit: 'cuts'
          });
        }

        if (effectiveCalculateTransport && frameSlabTransportTime > 0 && frameResults.totalFrameAreaM2 > 0) {
          breakdown.push({
            task: 'transport frame slabs',
            hours: frameSlabTransportTime,
            amount: frameResults.totalFrameAreaM2,
            unit: 'square meters',
            normalizedHours: normalizedFrameSlabTransportTime
          });
        }
      }
      
      // Add compacting task if applicable
      if (compactingTimeTotal > 0 && compactingCompactorName) {
        breakdown.push({
          task: compactingCompactorName,
          hours: compactingTimeTotal,
          amount: effectiveAreaM2,
          unit: 'square meters'
        });
      }

      // Add final leveling type 1 task if available
      if (finalLevelingTypeOneTask && finalLevelingTypeOneTask.estimated_hours !== undefined && finalLevelingTypeOneTask.estimated_hours !== null) {
        breakdown.push({
          task: 'final leveling (type 1)',
          event_task_id: finalLevelingTypeOneTask.id,
          hours: effectiveAreaM2 * finalLevelingTypeOneTask.estimated_hours,
          amount: effectiveAreaM2,
          unit: 'square meters'
        });
      }

      // Add mixing mortar task if available
      if (mixingMortarTask && mixingMortarTask.estimated_hours !== undefined && mixingMortarTask.estimated_hours !== null) {
        // Calculate total mortar weight: cement (bags * 25kg) + sand (tonnes * 1000kg)
        const cementWeightKg = cementBags * 25;
        const sandWeightKg = sandTonnes * 1000;
        const totalMortarWeightKg = cementWeightKg + sandWeightKg;
        // Calculate number of batches (125kg per batch)
        const numberOfBatches = Math.ceil(totalMortarWeightKg / 125);
        if (numberOfBatches > 0) {
          breakdown.push({
            task: 'mixing mortar',
            hours: numberOfBatches * mixingMortarTask.estimated_hours,
            amount: numberOfBatches,
            unit: 'batch',
            event_task_id: mixingMortarTask.id
          });
        }
      }
      
      // Slab material in m²: full slabs + slabs needed for cuts (same as canvas label), else floor area
      const slabAreaM2 =
        purchase?.slabAreaM2 ??
        ((savedInputs?.vizSlabWidth != null && savedInputs?.vizSlabLength != null)
          ? (Number(savedInputs.vizSlabWidth) / 100) * (Number(savedInputs.vizSlabLength) / 100)
          : slabSizeM2);
      const slabMaterialM2 =
        purchase && purchase.slabsToBuy > 0 ? purchase.slabsToBuy * purchase.slabAreaM2 : effectiveAreaM2;
      const getSlabMaterialName = (name: string) => {
        const n = (name || '').toLowerCase();
        const sizeMatch = n.match(/(\d+)\s*x\s*(\d+)/i);
        const size = sizeMatch ? `${sizeMatch[1]}×${sizeMatch[2]}` : '90×60';
        if (n.includes('porcelain')) return `Porcelain ${size}`;
        if (n.includes('sandstone') || n.includes('piaskow')) return `Sandstone ${size}`;
        if (n.includes('granite') || n.includes('granit')) return `Granite ${size}`;
        return `Slabs ${size}`;
      };
      const slabMaterialName = getSlabMaterialName(selectedSlabType.name);

      // Prepare materials list (slab first, then others)
      const materialsList: Material[] = [
        { name: slabMaterialName, amount: Number(slabMaterialM2.toFixed(2)), unit: 'm²', price_per_unit: null, total_price: null },
        { name: 'Soil excavation', amount: Number(soilTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null },
        { name: selectedSandMaterial?.name || 'Sand', amount: Number(sandTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: selectedSandMaterial?.price || null, total_price: null },
        { name: 'tape1', amount: Number(tape1Tonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null },
        { name: 'Cement', amount: Math.ceil(cementBags), unit: 'bags', price_per_unit: null, total_price: null }
      ];
      
      // Add frame slabs to materials if applicable
      if (addFrameBoard && frameResults && frameResults.totalFrameSlabs > 0) {
        const frameLen = frameResults.framePieceLengthCm ?? framePieceLengthCm;
        const frameWid = frameResults.framePieceWidthCm ?? framePieceWidthCm;
        const frameLabel =
          frameResults.frameRowsLabel && frameResults.frameRowsLabel.includes("× (")
            ? `${t("calculator:frame_border_row_count_label")}: ${frameResults.frameRowsLabel}`
            : t("calculator:frame_slabs_format", { length: frameLen, width: frameWid });
        materialsList.push({
          name: frameLabel,
          amount: frameResults.totalFrameSlabs,
          unit: 'pieces',
          price_per_unit: null,
          total_price: null
        });
      }
      
      // Fetch prices for materials
      const materialsWithPrices = await fetchMaterialPrices(materialsList);

      const filteredBreakdown = breakdown.filter((item) => {
        const n = (item.task || '').toLowerCase();
        if (!n.includes('transport')) return true;
        if (n.includes('slurry') || n.includes('zawiesin')) return false;
        return true;
      });
      const hoursTotal = filteredBreakdown.reduce((sum, item) => sum + item.hours, 0);

      setMaterials(materialsWithPrices);
      setTotalHours(hoursTotal);
      setTaskBreakdown(filteredBreakdown);
    } catch (err) {
      console.error('Error in calculation:', err);
      setCalculationError(`${t('calculator:calculation_error')}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Add useEffect to notify parent of result changes
  useEffect(() => {
    if (totalHours !== null && materials.length > 0) {
      const formattedResults = {
        name: selectedSlabId ? slabTypeOptions.find((type: SlabType) => type.id.toString() === selectedSlabId)?.name || 'Slab Installation' : 'Slab Installation',
        amount: parseFloat(area) || 0,
        unit: 'square meters',
        hours_worked: totalHours,
        materials: materials.map(material => ({
          name: material.name,
          quantity: material.amount,
          unit: material.unit
        })),
        taskBreakdown: taskBreakdown.map(task => ({
          task: task.task,
          hours: task.hours,
          amount: task.amount,
          unit: task.unit
        }))
      };

      // Store results in data attribute
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }

      onResultsChangeRef.current?.(formattedResults);
    }
  }, [totalHours, materials, taskBreakdown, area, selectedSlabId, slabTypeOptions]);

  // Recalculate when project settings (transport, equipment) change — wait for task templates (avoids false "not found")
  useEffect(() => {
    if (recalculateTrigger <= 0 || !isInProjectCreating || isLoading) return;
    void calculate();
  }, [recalculateTrigger, isInProjectCreating, isLoading]);

  // Scroll to results when they appear
  useEffect(() => {
    if (materials.length > 0 && resultsRef.current) {
      setTimeout(() => {
        // Check if we're inside a modal (has ancestor with overflow-y-auto)
        const modalContainer = resultsRef.current?.closest('[data-calculator-results]');
        if (modalContainer && resultsRef.current) {
          // Scroll within the modal
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else {
          // Scroll the page
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [materials]);

  const selectedSlabName = slabTypeOptions.find((tpl: SlabType) => tpl.id?.toString() === selectedSlabId)?.name ?? '';
  const selectedGroutingName = groutingMethods.find((m: { id?: string | number; name?: string }) => (m.id?.toString() || String(m.id)) === selectedGroutingId)?.name ?? '';

  return (
    <div style={{ fontFamily: fonts.body, display: 'flex', flexDirection: 'column', gap: calcLayoutNarrow ? spacing.xl : spacing["6xl"] }}>
      {!compactForPath && (
        <>
          <h2 style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.extrabold, color: colors.textPrimary, fontFamily: fonts.display, letterSpacing: '0.3px', margin: `${spacing.md}px 0 ${spacing.sm}px` }}>
            {t('calculator:slab_installation_calculator_title')}
          </h2>
          <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, lineHeight: 1.5 }}>
            Calculate materials, time, and costs for slab installation projects.
          </p>
        </>
      )}

      <Card
        padding={
          calcLayoutNarrow
            ? `${spacing.md}px ${spacing.sm}px ${spacing.md}px`
            : `${spacing["6xl"]}px ${spacing["6xl"]}px ${spacing.md}px`
        }
        style={{ marginBottom: spacing["5xl"] }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `0 ${spacing["5xl"]}px` }}>
          {!compactForPath && (
            <TextInput
              label={t('calculator:input_area_m2')}
              value={area}
              onChange={setArea}
              placeholder={t('calculator:placeholder_enter_area_m2')}
              unit="m²"
            />
          )}
          <TextInput
            label={t('calculator:input_type1_thickness_cm')}
            value={tape1ThicknessCm}
            onChange={setTape1ThicknessCm}
            placeholder={t('calculator:placeholder_enter_thickness')}
            unit="cm"
          />
          <TextInput
            label={t('calculator:input_thickness_cm')}
            value={mortarThicknessCm}
            onChange={setMortarThicknessCm}
            placeholder={t('calculator:placeholder_enter_thickness')}
            unit="cm"
          />
          <TextInput
            label={t('calculator:input_slab_thickness_cm')}
            value={slabThicknessCm}
            onChange={setSlabThicknessCm}
            placeholder={t('calculator:placeholder_enter_thickness')}
            unit="cm"
          />
        </div>

        {!compactForPath && !isInProjectCreating && (
          <>
            <TextInput
              label={t('calculator:input_additional_soil_depth')}
              value={soilExcessCm}
              onChange={setSoilExcessCm}
              placeholder={t('calculator:placeholder_enter_depth_cm')}
              unit="cm"
              helperText={t('calculator:additional_depth_info')}
            />
            <TextInput
              label={t('calculator:slabs_to_cut_label')}
              value={cutSlabs}
              onChange={setCutSlabs}
              placeholder={t('calculator:placeholder_enter_number_cuts')}
              unit=""
              helperText={t('calculator:slabs_to_cut_helper')}
            />
          </>
        )}
        
        {!compactForPath && (
          <>
            <CalculatorInputGrid columns={2}>
              <SelectDropdown
                label={t('calculator:slab_type_label')}
                value={selectedSlabName}
                options={slabTypeOptions.map((type: SlabType) => ({
                  value: type.name,
                  label: translateTaskName(type.name, t),
                }))}
                onChange={(name) => {
                  const slab = slabTypeOptions.find((x: SlabType) => x.name === name);
                  setSelectedSlabId(slab?.id?.toString() ?? '');
                }}
                placeholder={t('calculator:select_slab_type_placeholder')}
                helperText={isLoading ? t('calculator:loading_slab_types') : fetchError ? t('calculator:error_loading_slab_types') : undefined}
              />
              <SelectDropdown
                label={t('calculator:grouting_method')}
                value={selectedGroutingName}
                options={groutingMethods.map((m: { name?: string }) => ({
                  value: m.name || 'Unknown',
                  label: translateTaskName(m.name, t),
                }))}
                onChange={(name) => {
                  const method = groutingMethods.find((x: { name?: string }) => (x.name || '') === name);
                  setSelectedGroutingId(method?.id?.toString() ?? '');
                }}
                placeholder={t('calculator:select_grouting_method_placeholder')}
                helperText={t('calculator:grouting_method_note_info')}
              />
            </CalculatorInputGrid>
            {isInProjectCreating && shape?.closed && shape.points.length >= 3 && (
              <div style={{ marginTop: spacing.xl, maxWidth: 400 }}>
                <SelectDropdown
                  label={t('calculator:slab_grout_joint_mm')}
                  value={String(vizGroutWidthMm)}
                  options={[...SLAB_GROUT_OPTIONS_MM].map((mm) => ({ value: String(mm), label: `${mm} mm` }))}
                  onChange={(val) => {
                    const n = parseInt(String(val), 10);
                    if (!Number.isFinite(n)) return;
                    if (!(SLAB_GROUT_OPTIONS_MM as readonly number[]).includes(n)) return;
                    setVizGroutWidthMm(n);
                  }}
                  helperText={t('calculator:slab_grout_joint_mm_hint')}
                />
              </div>
            )}
          </>
        )}
        {compactForPath && isInProjectCreating && shape?.closed && shape.points.length >= 3 && (
          <div style={{ marginBottom: spacing.lg, maxWidth: 400 }}>
            <SelectDropdown
              label={t('calculator:slab_grout_joint_mm')}
              value={String(vizGroutWidthMm)}
              options={[...SLAB_GROUT_OPTIONS_MM].map((mm) => ({ value: String(mm), label: `${mm} mm` }))}
              onChange={(val) => {
                const n = parseInt(String(val), 10);
                if (!Number.isFinite(n)) return;
                if (!(SLAB_GROUT_OPTIONS_MM as readonly number[]).includes(n)) return;
                setVizGroutWidthMm(n);
              }}
              helperText={t('calculator:slab_grout_joint_mm_hint')}
            />
          </div>
        )}
        
        {/* Compactor Type Selection - hidden in project mode (set in project card) and path mode */}
        {!isInProjectCreating && !compactForPath && (
          <CompactorSelector 
            selectedCompactor={selectedCompactor}
            onCompactorChange={setSelectedCompactor}
          />
        )}
        
        {!compactForPath && (
        <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: spacing.xl, marginTop: spacing.xs, marginBottom: spacing["3xl"] }}>
          <Checkbox
            label={t('calculator:add_frame_board_from_slabs')}
            checked={addFrameBoard}
            onChange={setAddFrameBoard}
          />
          {addFrameBoard && isInProjectCreating && (
            <div className="mt-2 space-y-2">
              <div style={{ marginBottom: spacing.md }}>
                <Label>{t("calculator:frame_border_material_label")}</Label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                  <button
                    type="button"
                    onClick={() => setFrameBorderMaterial("slab")}
                    style={{
                      padding: `${spacing.sm}px ${spacing.lg}px`,
                      borderRadius: radii.md,
                      border: `1px solid ${frameBorderMaterial === "slab" ? colors.accentBlueBorder : colors.borderDefault}`,
                      background: frameBorderMaterial === "slab" ? colors.bgHover : "transparent",
                      color: colors.textSecondary,
                      cursor: "pointer",
                      fontSize: fontSizes.sm,
                    }}
                  >
                    {t("calculator:frame_border_material_slab")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrameBorderMaterial("cobble")}
                    style={{
                      padding: `${spacing.sm}px ${spacing.lg}px`,
                      borderRadius: radii.md,
                      border: `1px solid ${frameBorderMaterial === "cobble" ? colors.accentBlueBorder : colors.borderDefault}`,
                      background: frameBorderMaterial === "cobble" ? colors.bgHover : "transparent",
                      color: colors.textSecondary,
                      cursor: "pointer",
                      fontSize: fontSizes.sm,
                    }}
                  >
                    {t("calculator:frame_border_material_cobble")}
                  </button>
                </div>
                <div style={{ marginTop: spacing.xs }}>
                  <HelperText>{t("calculator:frame_border_material_hint")}</HelperText>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 items-center frame-board-inline-inputs">
                <label className="flex items-center gap-2">
                  <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>
                    {frameBorderMaterial === "cobble" ? t("calculator:frame_piece_length_cobble_cm") : t("calculator:piece_length_cm_label")}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={framePieceLengthCm}
                    onChange={(e) => setFramePieceLengthCm(e.target.value)}
                    style={{ width: 80, padding: "4px 8px", fontSize: fontSizes.sm, border: `1px solid ${colors.borderDefault}`, borderRadius: radii.md, background: colors.bgInput, color: colors.textPrimary }}
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>
                    {frameBorderMaterial === "cobble" ? t("calculator:frame_piece_width_cobble_cm") : t("calculator:piece_width_cm_label")}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={framePieceWidthCm}
                    onChange={(e) => setFramePieceWidthCm(e.target.value)}
                    style={{ width: 80, padding: "4px 8px", fontSize: fontSizes.sm, border: `1px solid ${colors.borderDefault}`, borderRadius: radii.md, background: colors.bgInput, color: colors.textPrimary }}
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>{t("calculator:frame_border_row_count_label")}</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={frameBorderRowCount}
                    onChange={(e) => setFrameBorderRowCount(e.target.value)}
                    style={{ width: 64, padding: "4px 8px", fontSize: fontSizes.sm, border: `1px solid ${colors.borderDefault}`, borderRadius: radii.md, background: colors.bgInput, color: colors.textPrimary }}
                  />
                </label>
              </div>
              <div>
                <label style={{ display: "block", fontSize: fontSizes.sm, color: colors.textDim }}>{t("calculator:frame_joint_type_label")}</label>
                <select
                  value={frameJointType}
                  onChange={(e) => setFrameJointType(e.target.value as "butt" | "miter45")}
                  style={{ marginTop: spacing.sm, display: "block", maxWidth: 320, borderRadius: radii.md, border: `1px solid ${colors.borderDefault}`, background: colors.bgInput, color: colors.textPrimary, padding: "8px 12px", fontSize: fontSizes.sm, outline: "none" }}
                >
                  <option value="butt">{t("calculator:frame_joint_butt")}</option>
                  <option value="miter45">{t("calculator:frame_joint_miter45")}</option>
                </select>
              </div>
              {shape && (() => {
                if (isPathElement(shape)) {
                  const pts = getPathPolygon(shape);
                  if (!pts || pts.length < 3) return null;
                  return (
                    <div style={{ marginTop: 12 }}>
                      <FrameSidesSelector
                        points={pts}
                        frameSidesEnabled={frameSidesEnabled}
                        onChange={setFrameSidesEnabled}
                        width={280}
                        height={180}
                      />
                    </div>
                  );
                }
                const { points: pts, edgeIndices } = getEffectivePolygonWithEdgeIndices(shape);
                if (!pts || pts.length < 3) return null;
                return (
                  <div style={{ marginTop: 12 }}>
                    <FrameSidesSelector
                      points={pts}
                      edgeIndices={edgeIndices}
                      frameSidesEnabled={frameSidesEnabled}
                      onChange={setFrameSidesEnabled}
                      width={280}
                      height={180}
                    />
                  </div>
                );
              })()}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: spacing.sm,
                  marginTop: spacing.md,
                  alignItems: "stretch",
                }}
              >
                <button
                  type="button"
                  onClick={() => setFrameRecalcTick((x) => x + 1)}
                  style={{
                    flex: "1 1 160px",
                    minWidth: 120,
                    padding: `${spacing.sm}px ${spacing.xl}px`,
                    borderRadius: radii.md,
                    border: "none",
                    background: colors.green,
                    color: colors.textOnAccent,
                    fontWeight: fontWeights.medium,
                    fontSize: fontSizes.sm,
                    cursor: "pointer",
                  }}
                >
                  {t("calculator:calculate_frame_slabs_button")}
                </button>
                <button
                  type="button"
                  onClick={clearFrameConfigInline}
                  style={{
                    flex: "1 1 160px",
                    minWidth: 120,
                    padding: `${spacing.sm}px ${spacing.xl}px`,
                    borderRadius: radii.md,
                    border: `1px solid ${colors.borderDefault}`,
                    background: colors.bgElevated,
                    color: colors.textPrimary,
                    fontWeight: fontWeights.medium,
                    fontSize: fontSizes.sm,
                    cursor: "pointer",
                  }}
                >
                  {t("calculator:clear_all_button")}
                </button>
              </div>
            </div>
          )}
          {addFrameBoard && !isInProjectCreating && (
            <Button onClick={() => setIsFrameModalOpen(true)} variant="primary" fullWidth style={{ marginTop: spacing.lg, fontSize: fontSizes.md }}>
              {t('calculator:configure_frame_slabs_button')}
            </Button>
          )}
          {frameResults && (
            <div style={{ marginTop: spacing.md, padding: spacing.md, background: colors.bgSubtle, borderRadius: radii.lg, border: `1px solid ${colors.borderDefault}` }}>
              <p style={{ fontSize: fontSizes.base, color: colors.textSecondary, fontFamily: fonts.body }}>
                <strong>
                  {frameResults.frameRowsLabel && frameResults.frameRowsLabel.includes("× (")
                    ? `${t("calculator:frame_border_row_count_label")}: ${frameResults.frameRowsLabel}`
                    : t("calculator:frame_slabs_format", {
                        length: frameResults.framePieceLengthCm ?? framePieceLengthCm,
                        width: frameResults.framePieceWidthCm ?? framePieceWidthCm,
                      })}
                  :
                </strong>{" "}
                {frameResults.totalFrameSlabs} {t("units:pieces")}, {frameResults.totalHours.toFixed(2)} {t("calculator:hours_label")}
                <br />
                <strong>{t('calculator:frame_area_label')}:</strong> {frameResults.totalFrameAreaM2.toFixed(2)} m²
              </p>
            </div>
          )}
        </div>
        )}
        
        {!isInProjectCreating && !compactForPath && (
          <>
            <Checkbox label={t('calculator:calculate_digging_preparation')} checked={calculateDigging} onChange={setCalculateDigging} />
            <Checkbox label={t('calculator:calculate_transport_time')} checked={calculateTransport} onChange={setCalculateTransport} />
          </>
        )}

        {/* Equipment Selection */}
        {!compactForPath && calculateDigging && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.lg }}>{t('calculator:excavation_machinery')}</label>
              <div className="space-y-2">
                {excavators.length === 0 ? (
                  <p style={{ color: colors.textDim }}>{t('calculator:no_excavators_found')}</p>
                ) : (
                  excavators.map((excavator) => (
                    <div 
                      key={excavator.id}
                      className="flex items-center p-2 cursor-pointer"
                      onClick={() => setSelectedExcavator(excavator)}
                    >
                      <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.textSubtle}`, marginRight: spacing['2xl'] }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', margin: 2, background: selectedExcavator?.id === excavator.id ? colors.textSubtle : 'transparent' }}></div>
                      </div>
                      <div>
                        <span style={{ color: colors.textPrimary }}>{excavator.name}</span>
                        <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing['2xl'] }}>({excavator["size (in tones)"]} tons)</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.lg }}>{t('calculator:carrier_machinery')}</label>
              <div className="space-y-2">
                {carriers.length === 0 ? (
                  <p style={{ color: colors.textDim }}>{t('calculator:no_carriers_found')}</p>
                ) : (
                  carriers.map((carrier) => (
                    <div 
                      key={carrier.id}
                      className="flex items-center p-2 cursor-pointer"
                      onClick={() => setSelectedCarrier(carrier)}
                    >
                      <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.textSubtle}`, marginRight: spacing['2xl'] }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', margin: 2, background: selectedCarrier?.id === carrier.id ? colors.textSubtle : 'transparent' }}></div>
                      </div>
                      <div>
                        <span style={{ color: colors.textPrimary }}>{carrier.name}</span>
                        <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing['2xl'] }}>({carrier["size (in tones)"]} tons)</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Transport Distance for Soil and Tape1 */}
        {!isInProjectCreating && !compactForPath && calculateDigging && selectedCarrier && (
          <div className="mb-4">
            <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing['2xl'] }}>{t('calculator:transport_distance_label')}</label>
            <input
              type="number"
              value={soilTransportDistance}
              onChange={(e) => {
                setSoilTransportDistance(e.target.value);
                setTape1TransportDistance(e.target.value); // Sync both distances
              }}
              className="w-full p-2 border rounded-md"
              placeholder={t('calculator:placeholder_enter_transport_distance')}
              min="0"
              step="1"
            />
            <p style={{ fontSize: fontSizes.xs, color: colors.textDim, marginTop: spacing.sm }}>{t('calculator:set_to_zero_no_transport')}</p>
          </div>
        )}

        {/* Transport Carrier Selection */}
        {!isInProjectCreating && calculateTransport && (
          <>
            <div>
              <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing.lg }}>{t('calculator:transport_carrier')}</label>
              <div className="space-y-2">
                <div 
                  style={{ display: 'flex', alignItems: 'center', padding: spacing['2xl'], cursor: 'pointer', border: `2px dashed ${colors.borderDefault}`, borderRadius: radii.md }}
                  onClick={() => setSelectedTransportCarrier(null)}
                >
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.textSubtle}`, marginRight: spacing['2xl'] }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', margin: 2, background: selectedTransportCarrier === null ? colors.textSubtle : 'transparent' }}></div>
                  </div>
                  <div>
                    <span style={{ color: colors.textPrimary }}>{t('calculator:default_wheelbarrow')}</span>
                  </div>
                </div>
                {carriers.length > 0 && carriers.map((carrier) => (
                  <div 
                    key={carrier.id}
                    className="flex items-center p-2 cursor-pointer"
                    onClick={() => setSelectedTransportCarrier(carrier)}
                  >
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.textSubtle}`, marginRight: spacing['2xl'] }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', margin: 2, background: selectedTransportCarrier?.id === carrier.id ? colors.textSubtle : 'transparent' }}></div>
                    </div>
                    <div>
                      <span style={{ color: colors.textPrimary }}>{carrier.name}</span>
                      <span style={{ fontSize: fontSizes.sm, color: colors.textDim, marginLeft: spacing['2xl'] }}>({carrier["size (in tones)"]} tons)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Material Transport Distance */}
        {!isInProjectCreating && calculateTransport && (
          <div className="mb-4">
            <label style={{ display: 'block', fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textMuted, marginBottom: spacing['2xl'] }}>{t('calculator:transport_distance_label')}</label>
            <input
              type="number"
              value={materialTransportDistance}
              onChange={(e) => setMaterialTransportDistance(e.target.value)}
              className="w-full p-2 border rounded-md"
              placeholder={t('calculator:placeholder_enter_material_transport')}
              min="0"
              step="1"
            />
            <p style={{ fontSize: fontSizes.xs, color: colors.textDim, marginTop: spacing.sm }}>{t('calculator:distance_transporting_materials')}</p>
          </div>
        )}
        
        <Button
          onClick={calculate}
          disabled={isLoading}
          variant="primary"
          fullWidth
        >
          {isLoading ? t('calculator:loading_in_progress') : t('calculator:calculate_button')}
        </Button>
        
        {calculationError && (
          <div style={{ padding: spacing.md, background: 'rgba(239,68,68,0.15)', border: `1px solid ${colors.red}`, borderRadius: radii.lg, color: colors.textPrimary }}>
            {calculationError}
          </div>
        )}
        
        {totalHours !== null && (
          <div style={{ marginTop: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }} ref={resultsRef}>
            <Card style={{ background: gradients.blueCard, border: `1px solid ${colors.accentBlueBorder}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.lg }}>
                <span style={{ fontSize: fontSizes.md, color: colors.textSubtle, fontFamily: fonts.display, fontWeight: fontWeights.semibold }}>
                  {t('calculator:total_labor_hours_label')}
                </span>
                <span style={{ fontSize: fontSizes["4xl"], fontWeight: fontWeights.extrabold, color: colors.accentBlue, fontFamily: fonts.display }}>
                  {totalHours.toFixed(2)}
                </span>
                <span style={{ fontSize: fontSizes.md, color: colors.accentBlue, fontFamily: fonts.body, fontWeight: fontWeights.medium }}>
                  {t('calculator:hours_abbreviation')}
                </span>
              </div>
            </Card>
            
            <Card>
              <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display, letterSpacing: '0.3px', marginBottom: spacing["2xl"] }}>
                {t('calculator:task_breakdown_label')}
              </h3>
              <div style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii.lg, overflow: 'hidden' }}>
                {taskBreakdown.map((task: { task: string; hours: number }, index: number) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: `${spacing.lg}px ${spacing["2xl"]}px`,
                      background: index % 2 === 1 ? colors.bgTableRowAlt : undefined,
                      borderBottom: index < taskBreakdown.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
                    }}
                  >
                    <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>
                      {translateTaskName(task.task, t)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs }}>
                      <span style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textSecondary, fontFamily: fonts.display }}>
                        {task.hours.toFixed(2)}
                      </span>
                      <span style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>{t('calculator:hours_label')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            
            <DataTable
              columns={[
                { key: 'name', label: t('calculator:table_material_header'), width: '2fr' },
                { key: 'quantity', label: t('calculator:table_quantity_header'), width: '1fr' },
                { key: 'unit', label: t('calculator:table_unit_header'), width: '1fr' },
                { key: 'price', label: t('calculator:table_price_per_unit_header'), width: '1fr' },
                { key: 'total', label: t('calculator:table_total_header'), width: '1fr' },
              ]}
              rows={materials.map((m) => ({
                name: <span style={{ fontSize: fontSizes.base, color: colors.textMuted, fontFamily: fonts.body }}>{translateMaterialName(m.name, t)}</span>,
                quantity: <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>{m.amount.toFixed(2)}</span>,
                unit: <span style={{ fontSize: fontSizes.sm, color: colors.textDim }}>{translateUnit(m.unit, t)}</span>,
                price: <span style={{ fontSize: fontSizes.base, color: colors.textSubtle }}>{m.price_per_unit ? `£${m.price_per_unit.toFixed(2)}` : 'N/A'}</span>,
                total: <span style={{ fontSize: fontSizes.md, fontWeight: fontWeights.bold, color: colors.textSecondary }}>{m.total_price ? `£${m.total_price.toFixed(2)}` : 'N/A'}</span>,
              }))}
              footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: spacing.md }}>
                  <span style={{ fontSize: fontSizes.base, color: colors.textSubtle, fontFamily: fonts.display, fontWeight: fontWeights.semibold }}>
                    {t('calculator:total_cost_colon')}
                  </span>
                  <span style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.extrabold, color: colors.textPrimary, fontFamily: fonts.display }}>
                    {materials.some(m => m.total_price !== null)
                      ? `£${materials.reduce((sum, m) => sum + (m.total_price || 0), 0).toFixed(2)}`
                      : t('calculator:not_available')}
                  </span>
                </div>
              }
            />
          </div>
        )}
      </Card>
      
      {/* Slab Frame Calculator Modal */}
      <SlabFrameCalculator
        isOpen={isFrameModalOpen}
        onClose={() => setIsFrameModalOpen(false)}
        onResultsChange={(results) => setFrameResults(results)}
        selectedSlabType={selectedSlabTypeForFrame}
        cuttingTasks={cuttingTasks as any}
      />
    </div>
  );
};

export default SlabCalculator;
