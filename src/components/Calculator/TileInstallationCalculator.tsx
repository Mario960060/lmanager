import React, { useState, useEffect, useRef } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { carrierSpeeds, getMaterialCapacity } from '../../constants/materialCapacity';
import { translateTaskName, translateUnit } from '../../lib/translationMap';
import { colors, radii, fontSizes } from '../../themes/designTokens';
import { Button } from '../../themes/uiComponents';

interface TaskTemplate {
  id: string;
  name: string;
  unit: string;
  estimated_hours: number;
}

interface TileInstallationCalculatorProps {
  onResultsChange?: (results: any) => void;
  isInProjectCreating?: boolean;
  calculateTransport?: boolean;
  setCalculateTransport?: (value: boolean) => void;
  selectedTransportCarrier?: any;
  setSelectedTransportCarrier?: (value: any) => void;
  transportDistance?: string;
  setTransportDistance?: (value: string) => void;
  carriers?: any[];
  selectedExcavator?: any;
  /** From wall segments on canvas — area and dimensions auto-filled, read-only */
  fromWallSegments?: boolean;
  initialAreaM2?: number;
  initialWallLengthM?: number;
  initialWallHeightM?: number;
  /** Canvas Object Card dark UI */
  canvasMode?: boolean;
  /** When Wall Calculate is clicked, parent increments this to trigger tile calc */
  calculateTrigger?: number;
  /** Per-segment dimensions for slab count per wycinka */
  initialSegmentDimensions?: { length: number; height: number }[];
}

interface SlabDimension {
  width: number;
  height: number;
  label: string;
}

interface SlabCuttingBreakdown {
  fullSlabs: number;
  cutSlabs: {
    width: number;
    height: number;
    quantity: number;
    fullSlabsNeeded?: number;
  }[];
  totalCuts: number;
  totalFullSlabsNeeded?: number;
}

// Add Material interface for fetched materials
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

interface DiggingEquipment {
  id: string;
  name: string;
  'size (in tones)': number;
}

const SLAB_DIMENSIONS: SlabDimension[] = [
  { width: 120, height: 30, label: '120cm x 30cm' },
  { width: 80, height: 80, label: '80cm x 80cm' },
  { width: 90, height: 60, label: '90cm x 60cm' },
  { width: 80, height: 40, label: '80cm x 40cm' },
  { width: 60, height: 60, label: '60cm x 60cm' },
  { width: 60, height: 30, label: '60cm x 30cm' },
  { width: 30, height: 30, label: '30cm x 30cm' },
];

const GAP_OPTIONS = [2, 3, 4, 5];
const ADHESIVE_THICKNESS = [
  { value: 0.5, consumption: 6 },
  { value: 1, consumption: 12 }
];

const WallFinishCalculator: React.FC<TileInstallationCalculatorProps> = ({ 
  onResultsChange,
  isInProjectCreating = false,
  calculateTransport: propCalculateTransport,
  setCalculateTransport: propSetCalculateTransport,
  selectedTransportCarrier: propSelectedTransportCarrier,
  setSelectedTransportCarrier: propSetSelectedTransportCarrier,
  transportDistance: propTransportDistance,
  setTransportDistance: propSetTransportDistance,
  carriers: propCarriers = [],
  selectedExcavator: propSelectedExcavator,
  fromWallSegments = false,
  initialAreaM2,
  initialWallLengthM,
  initialWallHeightM,
  canvasMode = false,
  calculateTrigger = 0,
  initialSegmentDimensions,
}: TileInstallationCalculatorProps) => {
  const { t } = useTranslation(['calculator', 'utilities', 'common', 'units']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const [wallLength, setWallLength] = useState<string>(() =>
    fromWallSegments && initialWallLengthM != null ? initialWallLengthM.toFixed(3) : ''
  );
  const [wallHeight, setWallHeight] = useState<string>(() =>
    fromWallSegments && initialWallHeightM != null ? initialWallHeightM.toFixed(3) : ''
  );
  const defH = parseFloat(wallHeight) || 1;
  const [wallConfigMode, setWallConfigMode] = useState<'single' | 'segments'>('single');
  const [segmentLengthsLocal, setSegmentLengthsLocal] = useState<number[]>([]);
  const [segmentHeightsLocal, setSegmentHeightsLocal] = useState<Array<{ startH: number; endH: number }>>([]);
  const [selectedSlab, setSelectedSlab] = useState<SlabDimension>(SLAB_DIMENSIONS[0]);
  const [slabOrientation, setSlabOrientation] = useState<'long' | 'side'>('long');
  const [selectedGap, setSelectedGap] = useState<number>(GAP_OPTIONS[0]);
  const [lengthCutType, setLengthCutType] = useState<'1cut' | '2cuts'>('1cut');
  const [heightCutType, setHeightCutType] = useState<'1cut' | '2cuts'>('1cut');
  const [adhesiveThickness, setAdhesiveThickness] = useState<number>(ADHESIVE_THICKNESS[0].value);
  const [results, setResults] = useState<{
    totalSlabs: number;
    totalCuts: number;
    adhesiveNeeded: number;
    cuttingBreakdown: SlabCuttingBreakdown;
    taskBreakdown: { task: string; hours: number }[];
    materials: { name: string; amount: number; unit: string; price_per_unit: number | null; total_price: number | null }[];
    labor: number;
    slabsPerSegment?: number[];
  } | null>(null);
  const [slabType, setSlabType] = useState<'porcelain' | 'sandstones' | 'granite'>('porcelain');
  const [selectedGroutingId, setSelectedGroutingId] = useState<string>('');
  const [transportDistance, setTransportDistance] = useState<string>('30');
  const [calculateTransport, setCalculateTransport] = useState<boolean>(false);
  const [selectedTransportCarrier, setSelectedTransportCarrier] = useState<DiggingEquipment | null>(null);
  const [carriersLocal, setCarriersLocal] = useState<DiggingEquipment[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  const effectiveCalculateTransport = isInProjectCreating ? (propCalculateTransport ?? false) : calculateTransport;
  const effectiveSelectedTransportCarrier = isInProjectCreating ? (propSelectedTransportCarrier ?? null) : selectedTransportCarrier;
  const effectiveTransportDistance = isInProjectCreating && propTransportDistance ? propTransportDistance : transportDistance;

  // Use carriers from props if available (from ProjectCreating), otherwise use local state
  const carriers = propCarriers && propCarriers.length > 0 ? propCarriers : carriersLocal;

  // Sync transport props to local state when in ProjectCreating
  useEffect(() => {
    if (isInProjectCreating) {
      if (propCalculateTransport !== undefined) setCalculateTransport(propCalculateTransport);
      if (propSelectedTransportCarrier !== undefined) setSelectedTransportCarrier(propSelectedTransportCarrier);
      if (propTransportDistance !== undefined) setTransportDistance(propTransportDistance);
    }
  }, [
    isInProjectCreating,
    propCalculateTransport,
    propSelectedTransportCarrier,
    propTransportDistance
  ]);

  // Sync wall dimensions when from wall segments
  useEffect(() => {
    if (fromWallSegments && initialWallLengthM != null && initialWallHeightM != null) {
      setWallLength(initialWallLengthM.toFixed(3));
      setWallHeight(initialWallHeightM.toFixed(3));
    }
  }, [fromWallSegments, initialWallLengthM, initialWallHeightM]);

  const addSegment = () => {
    const len = segmentLengthsLocal.length > 0 ? segmentLengthsLocal[segmentLengthsLocal.length - 1] : 1;
    const h = segmentHeightsLocal.length > 0 ? (segmentHeightsLocal[segmentHeightsLocal.length - 1]?.startH ?? defH) : defH;
    setSegmentLengthsLocal((prev) => [...prev, len]);
    setSegmentHeightsLocal((prev) => [...prev, { startH: h, endH: h }]);
    setWallConfigMode('segments');
  };
  const removeSegment = (idx: number) => {
    setSegmentLengthsLocal((prev) => prev.filter((_, i) => i !== idx));
    setSegmentHeightsLocal((prev) => prev.filter((_, i) => i !== idx));
    if (segmentLengthsLocal.length <= 1) setWallConfigMode('single');
  };
  const updateSegmentLength = (idx: number, value: number) => {
    setSegmentLengthsLocal((prev) => {
      const next = [...prev];
      next[idx] = Math.max(0.01, value);
      return next;
    });
  };
  const updateSegmentHeight = (idx: number, field: 'startH' | 'endH', value: number) => {
    setSegmentHeightsLocal((prev) => {
      const next = [...prev];
      if (!next[idx]) next[idx] = { startH: defH, endH: defH };
      next[idx] = { ...next[idx], [field]: Math.max(0.01, value) };
      return next;
    });
  };
  const setAllSegmentHeights = (h: number) => {
    setSegmentHeightsLocal(segmentLengthsLocal.map(() => ({ startH: h, endH: h })));
  };

  // Add equipment fetching
  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const companyId = useAuthStore.getState().getCompanyId();
        if (!companyId) return;
        
        // Fetch carriers
        const { data: carrierData, error: carrierError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'barrows_dumpers')
          .eq('company_id', companyId);
        
        if (carrierError) throw carrierError;
        
        setCarriersLocal(carrierData || []);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    
    if (effectiveCalculateTransport) {
      fetchEquipment();
    }
  }, [effectiveCalculateTransport]);

  // Fetch all task templates (for tile installation)
  const { data: taskTemplates = [] }: UseQueryResult<TaskTemplate[]> = useQuery({
    queryKey: ['tile_task_templates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId || '')
        .order('name');
      if (error) throw error;
      return data as TaskTemplate[];
    },
    enabled: !!companyId
  });

  // Helper function to calculate material transport time
  const calculateMaterialTransportTime = (
    materialAmount: number,
    carrierSize: number,
    materialType: string,
    transportDistanceMeters: number
  ) => {
    const carrierSpeedData = carrierSpeeds.find(c => c.size === carrierSize);
    const carrierSpeed = carrierSpeedData?.speed || 4000;
    const materialCapacityUnits = getMaterialCapacity(materialType, carrierSize);
    const trips = Math.ceil(materialAmount / materialCapacityUnits);
    const timePerTrip = (transportDistanceMeters * 2) / carrierSpeed;
    const totalTransportTime = trips * timePerTrip;
    const normalizedTransportTime = (totalTransportTime * 30) / transportDistanceMeters;
    return { trips, totalTransportTime, normalizedTransportTime };
  };

  // Fetch cutting tasks
  const { data: cuttingTasks = [] }: UseQueryResult<TaskTemplate[]> = useQuery({
    queryKey: ['cutting_tile_tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId || '')
        .or('name.ilike.%cutting%,name.ilike.%cut%')
        .order('name');
      if (error) throw error;
      return data as TaskTemplate[];
    },
    enabled: !!companyId
  });

  // Fetch adhesive material from materials table
  const { data: materialsTable = [] }: UseQueryResult<Material[]> = useQuery({
    queryKey: ['materials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, description, unit, price, created_at')
        .order('name');
      if (error) throw error;
      return data as Material[];
    }
  });

  // Fetch grouting methods (tasks with 'grouting' in the name)
  const { data: groutingMethods = [], isLoading: isLoadingGrouting } = useQuery({
    queryKey: ['grouting_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .ilike('name', '%grouting%')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  const calculateResults = () => {
    let wallLengthCm: number;
    let wallHeightCm: number;
    let wallArea: number;

    let segmentDimensionsForCalc: { length: number; height: number }[] | undefined;
    if (fromWallSegments && initialAreaM2 != null && initialAreaM2 > 0) {
      wallArea = initialAreaM2;
      const len = initialWallLengthM ?? Math.sqrt(initialAreaM2);
      const h = len > 0 ? initialAreaM2 / len : Math.sqrt(initialAreaM2);
      wallLengthCm = len * 100;
      wallHeightCm = h * 100;
      segmentDimensionsForCalc = initialSegmentDimensions;
    } else if (fromWallSegments && (initialAreaM2 == null || initialAreaM2 <= 0)) {
      return; // No sides selected yet
    } else if (!fromWallSegments && wallConfigMode === 'segments' && segmentLengthsLocal.length > 0) {
      const hasInvalid = segmentLengthsLocal.some((l) => !l || l <= 0);
      if (hasInvalid) return;
      segmentDimensionsForCalc = segmentLengthsLocal.map((len, i) => {
        const sh = segmentHeightsLocal[i];
        const avgH = sh ? (sh.startH + sh.endH) / 2 : defH;
        return { length: len, height: avgH };
      });
      wallArea = segmentDimensionsForCalc.reduce((sum, s) => sum + s.length * s.height, 0);
      const totalLen = segmentDimensionsForCalc.reduce((sum, s) => sum + s.length, 0);
      wallLengthCm = totalLen * 100;
      wallHeightCm = totalLen > 0 ? (wallArea / totalLen) * 100 : defH * 100;
    } else {
      if (!wallLength || !wallHeight) return;
      wallLengthCm = parseFloat(wallLength) * 100;
      wallHeightCm = parseFloat(wallHeight) * 100;
      wallArea = (wallLengthCm * wallHeightCm) / 10000;
    }
    const gapCm = selectedGap / 10;

    // Determine slab dimensions based on orientation
    const slabWidth = slabOrientation === 'long' ? selectedSlab.width : selectedSlab.height;
    const slabHeight = slabOrientation === 'long' ? selectedSlab.height : selectedSlab.width;

    // Compute slabs per segment when we have segment dimensions (for materials/total)
    const segDims = segmentDimensionsForCalc ?? initialSegmentDimensions;
    const slabsPerSegment: number[] | undefined = segDims && segDims.length > 0
      ? segDims.map(({ length, height }) => {
          const lenCm = length * 100;
          const hCm = height * 100;
          const sL = Math.ceil((lenCm + gapCm) / (slabWidth + gapCm));
          const sH = Math.ceil((hCm + gapCm) / (slabHeight + gapCm));
          return sL * sH;
        })
      : undefined;

    // Calculate slabs needed for length and height
    const slabsInLength = Math.floor((wallLengthCm + gapCm) / (slabWidth + gapCm));
    const slabsInHeight = Math.floor((wallHeightCm + gapCm) / (slabHeight + gapCm));

    // Calculate remaining space
    const remainingLength = wallLengthCm - (slabsInLength * slabWidth + (slabsInLength) * gapCm);
    const remainingHeight = wallHeightCm - (slabsInHeight * slabHeight + (slabsInHeight) * gapCm);

    // Initialize arrays for different types of cuts
    const cutSlabs = [];
    let totalCuts = 0;

    // Calculate full-length slabs (not cut at the ends)
    let fullLengthSlabs = slabsInLength;
    let cutLengthPieces = 0;
    let cutLengthPieceWidth = 0;
    if (remainingLength > 0 && lengthCutType === '2cuts') {
      // For each row, (slabsInLength - 1) full-length slabs, 2 cut pieces at ends
      fullLengthSlabs = Math.max(0, slabsInLength - 1);
      cutLengthPieces = 2;
      cutLengthPieceWidth = (slabWidth + remainingLength) / 2;
    }

    // Calculate full-height slabs (not cut at the top/bottom)
    let fullHeightSlabs = slabsInHeight;
    let cutHeightPieces = 0;
    let cutHeightPieceHeight = 0;
    if (remainingHeight > 0 && heightCutType === '2cuts') {
      // For each column, (slabsInHeight - 1) full-height slabs, 2 cut pieces at top/bottom
      fullHeightSlabs = Math.max(0, slabsInHeight - 1);
      cutHeightPieces = 2;
      cutHeightPieceHeight = (slabHeight + remainingHeight) / 2;
    }

    // Calculate full slabs (full length and full height)
    let fullSlabs = fullLengthSlabs * fullHeightSlabs;

    // Add cut slabs for length (ends of each row)
    if (cutLengthPieces > 0) {
      cutSlabs.push({
        width: cutLengthPieceWidth,
        height: slabHeight,
        quantity: cutLengthPieces * fullHeightSlabs
      });
      totalCuts += cutLengthPieces * fullHeightSlabs;
    }

    // Add cut slabs for height (top/bottom of each column)
    if (cutHeightPieces > 0) {
      cutSlabs.push({
        width: slabWidth,
        height: cutHeightPieceHeight,
        quantity: cutHeightPieces * fullLengthSlabs
      });
      totalCuts += cutHeightPieces * fullLengthSlabs;
    }

    // Handle remaining length (1 cut at the end)
    if (remainingLength > 0 && lengthCutType === '1cut') {
      cutSlabs.push({
        width: remainingLength,
        height: slabHeight,
        quantity: fullHeightSlabs
      });
      totalCuts += fullHeightSlabs;
    }

    // Handle remaining height (1 cut at the top)
    if (remainingHeight > 0 && heightCutType === '1cut') {
      cutSlabs.push({
        width: slabWidth,
        height: remainingHeight,
        quantity: fullLengthSlabs
      });
      totalCuts += fullLengthSlabs;
    }

    // Handle corner cuts (where both length and height need cuts)
    if (remainingLength > 0 && remainingHeight > 0) {
      if (lengthCutType === '2cuts' && heightCutType === '2cuts') {
        // Four corner pieces
        cutSlabs.push({
          width: cutLengthPieceWidth,
          height: cutHeightPieceHeight,
          quantity: 4
        });
        totalCuts += 4;
      } else if (lengthCutType === '2cuts' && heightCutType === '1cut') {
        // Two pieces at ends, cut in height
        cutSlabs.push({
          width: cutLengthPieceWidth,
          height: remainingHeight,
          quantity: 2
        });
        totalCuts += 2;
      } else if (lengthCutType === '1cut' && heightCutType === '2cuts') {
        // Two pieces at top/bottom, cut in length
        cutSlabs.push({
          width: remainingLength,
          height: cutHeightPieceHeight,
          quantity: 2
        });
        totalCuts += 2;
      } else if (lengthCutType === '1cut' && heightCutType === '1cut') {
        // One corner piece
        cutSlabs.push({
          width: remainingLength,
          height: remainingHeight,
          quantity: 1
        });
        totalCuts += 1;
      }
    }

    // Add extra cuts for each corner cut
    cutSlabs.forEach(cut => {
      if (
        cut.width !== selectedSlab.width &&
        cut.height !== selectedSlab.height
      ) {
        totalCuts += cut.quantity;
      }
    });

    // Calculate adhesive needed (wallArea already set above)
    const adhesiveConsumption = ADHESIVE_THICKNESS.find(t => t.value === adhesiveThickness)?.consumption || 6;
    const adhesiveNeeded = wallArea * adhesiveConsumption;

    // Find adhesive in materials table
    const adhesiveMaterial = materialsTable.find((m: Material) => m.name.toLowerCase().includes('adhesive'));
    let materials: { name: string; amount: number; unit: string; price_per_unit: number | null; total_price: number | null }[] = [];
    if (adhesiveMaterial) {
      // Calculate number of bags based on the unit size
      // Try to extract the bag size from the unit string (e.g., '20 kg bag')
      const match = adhesiveMaterial.unit.match(/(\d+\.?\d*)\s*kg/i);
      let bagSize = 20; // default to 20 if not found
      if (match) {
        bagSize = parseFloat(match[1]);
      }
      const bagsNeeded = Math.max(1, Math.ceil(adhesiveNeeded / bagSize));
      materials.push({
        name: adhesiveMaterial.name,
        amount: bagsNeeded,
        unit: adhesiveMaterial.unit,
        price_per_unit: adhesiveMaterial.price ?? null,
        total_price: adhesiveMaterial.price ? bagsNeeded * adhesiveMaterial.price : null
      });
    }

    // Waste-aware slab counting: shared waste pool, process larger pieces first
    type WasteRect = { w: number; h: number };
    const waste: WasteRect[] = [];
    const cutSlabsWithFull: typeof cutSlabs = cutSlabs.map(c => ({ ...c, fullSlabsNeeded: 0 }));

    const addWaste = (w: number, h: number) => {
      if (w >= 1 && h >= 1) waste.push({ w, h });
    };

    const useFromWaste = (needW: number, needH: number): boolean => {
      const idx = waste.findIndex(r => r.w >= needW && r.h >= needH);
      if (idx < 0) return false;
      const r = waste[idx];
      waste.splice(idx, 1);
      if (r.w > needW) addWaste(r.w - needW, needH);
      if (r.h > needH) addWaste(needW, r.h - needH);
      return true;
    };

    const cutSlabsByArea = cutSlabsWithFull
      .map((c, i) => ({ ...c, idx: i, area: c.width * c.height }))
      .sort((a, b) => b.area - a.area);

    for (const cut of cutSlabsByArea) {
      let needed = cut.quantity;
      let slabsUsed = 0;
      while (needed > 0) {
        if (useFromWaste(cut.width, cut.height)) {
          needed--;
          continue;
        }
        const cols = Math.floor(slabWidth / cut.width);
        const rows = Math.floor(slabHeight / cut.height);
        const perSlab = cols * rows;
        const take = Math.min(needed, Math.max(1, perSlab));
        slabsUsed++;
        needed -= take;
        const usedRows = Math.ceil(take / cols);
        const usedCols = take <= cols ? take : cols;
        const usedW = usedCols * cut.width;
        const usedH = usedRows * cut.height;
        if (slabWidth > usedW) addWaste(slabWidth - usedW, slabHeight);
        if (slabHeight > usedH) addWaste(usedW, slabHeight - usedH);
      }
      cutSlabsWithFull[cut.idx].fullSlabsNeeded = slabsUsed;
    }

    let totalFullSlabsNeeded = fullSlabs + cutSlabsWithFull.reduce((s, c) => s + (c.fullSlabsNeeded ?? 0), 0);
    if (slabsPerSegment && slabsPerSegment.length > 0) {
      totalFullSlabsNeeded = slabsPerSegment.reduce((a, b) => a + b, 0);
    }

    if (totalFullSlabsNeeded > 0) {
      const slabMaterialLabel = slabType === 'porcelain' ? 'porcelain' : slabType === 'granite' ? 'granite' : 'sandstone';
      materials.unshift({
        name: `${slabMaterialLabel} slabs ${slabWidth}×${slabHeight}`,
        amount: totalFullSlabsNeeded,
        unit: 'pieces',
        price_per_unit: null,
        total_price: null
      });
    }

    const cuttingBreakdown: SlabCuttingBreakdown = {
      fullSlabs,
      cutSlabs: cutSlabsWithFull,
      totalCuts,
      totalFullSlabsNeeded
    };

    // Prepare task breakdown
    const tileTaskName = `Tile Installation ${selectedSlab.width} × ${selectedSlab.height}`;

    // Find the template for tile installation
    const tileTaskTemplate = taskTemplates.find(
      (t: TaskTemplate) => t.name.toLowerCase() === tileTaskName.toLowerCase()
    );
    const tileTaskTime = tileTaskTemplate?.estimated_hours ?? 0.5;
    const tileTaskTotal = wallArea * tileTaskTime;

    // Cutting tasks by length: available lengths 30, 40, 60, 90, 120 cm
    const CUT_LENGTHS = [30, 40, 60, 90, 120];
    const findClosestCutLength = (actual: number) =>
      CUT_LENGTHS.reduce((prev, curr) =>
        Math.abs(curr - actual) < Math.abs(prev - actual) ? curr : prev
      );
    const slabMaterialForTask = slabType === 'porcelain' ? 'porcelain' : slabType === 'granite' ? 'granite' : 'sandstone';

    const cutLengthCounts = new Map<number, number>();
    for (const cut of cutSlabsWithFull) {
      const isLengthCut = Math.abs(cut.width - slabWidth) > 0.1 && Math.abs(cut.height - slabHeight) < 0.1;
      const isHeightCut = Math.abs(cut.width - slabWidth) < 0.1 && Math.abs(cut.height - slabHeight) > 0.1;
      const isCornerCut = Math.abs(cut.width - slabWidth) > 0.1 && Math.abs(cut.height - slabHeight) > 0.1;
      if (isLengthCut) {
        const len = Math.round(slabHeight);
        cutLengthCounts.set(len, (cutLengthCounts.get(len) ?? 0) + cut.quantity);
      } else if (isHeightCut) {
        const len = Math.round(slabWidth);
        cutLengthCounts.set(len, (cutLengthCounts.get(len) ?? 0) + cut.quantity);
      } else if (isCornerCut) {
        const lenH = Math.round(slabWidth);
        const lenL = Math.round(slabHeight);
        cutLengthCounts.set(lenH, (cutLengthCounts.get(lenH) ?? 0) + cut.quantity);
        cutLengthCounts.set(lenL, (cutLengthCounts.get(lenL) ?? 0) + cut.quantity);
      }
    }

    const taskLengthCounts = new Map<number, number>();
    for (const [actualLen, count] of cutLengthCounts) {
      const taskLen = findClosestCutLength(actualLen);
      taskLengthCounts.set(taskLen, (taskLengthCounts.get(taskLen) ?? 0) + count);
    }
    const cuttingTaskBreakdown: { task: string; hours: number; amount: string; unit: string }[] = [];
    let cuttingTaskTotal = 0;
    for (const [taskLen, count] of taskLengthCounts) {
      const taskName = `cutting ${taskLen}cm ${slabMaterialForTask} slab`;
      const cuttingTask = cuttingTasks.find(
        (t: TaskTemplate) => t.name.toLowerCase() === taskName.toLowerCase()
      );
      const hoursPerCut = cuttingTask?.estimated_hours ?? 0.5;
      const hours = count * hoursPerCut;
      cuttingTaskTotal += hours;
      cuttingTaskBreakdown.push({
        task: taskName,
        hours,
        amount: `${count} pieces`,
        unit: 'pieces'
      });
    }

    const taskBreakdown: { task: string; hours: number; amount?: string; unit?: string }[] = [
      {
        task: `Tile Installation ${selectedSlab.width} x ${selectedSlab.height}`,
        hours: tileTaskTotal,
        amount: `${fullSlabs + cutSlabs.reduce((sum, cut) => sum + cut.quantity, 0)} pieces`,
        unit: 'pieces'
      },
      ...cuttingTaskBreakdown
    ];

    // Add grouting method if selected
    if (selectedGroutingId) {
      const groutingTask = groutingMethods.find((g: any) => g.id.toString() === selectedGroutingId);
      if (groutingTask && groutingTask.estimated_hours !== undefined && groutingTask.estimated_hours !== null) {
        let groutingHours = groutingTask.estimated_hours;
        const unitLower = groutingTask.unit ? groutingTask.unit.toLowerCase() : '';
        if (unitLower === 'm2' || unitLower === 'square meters') {
          groutingHours = wallArea * groutingTask.estimated_hours;
        }
        taskBreakdown.push({
          task: groutingTask.name || 'Grouting',
          hours: groutingHours,
          amount: `${wallArea} square meters`,
          unit: 'square meters'
        });
      }
    }

    // Calculate material transport times if "Calculate transport time" is checked
    let tileTransportTime = 0;
    let adhesiveTransportTime = 0;
    let normalizedTileTransportTime = 0;
    let normalizedAdhesiveTransportTime = 0;

    if (effectiveCalculateTransport) {
      let carrierSizeForTransport = 0.125;
      
      if (effectiveSelectedTransportCarrier) {
        carrierSizeForTransport = effectiveSelectedTransportCarrier["size (in tones)"] || 0.125;
      }

      // Calculate tile transport
      const totalTiles = fullSlabs + cutSlabs.reduce((sum, cut) => sum + cut.quantity, 0);
      if (totalTiles > 0) {
        const tileResult = calculateMaterialTransportTime(totalTiles, carrierSizeForTransport, 'slabs', parseFloat(effectiveTransportDistance) || 30);
        tileTransportTime = tileResult.totalTransportTime;
        normalizedTileTransportTime = tileResult.normalizedTransportTime;
      }

      // Calculate adhesive transport
      const match = adhesiveMaterial?.unit.match(/(\d+\.?\d*)\s*kg/i);
      let bagSize = 20;
      if (match) {
        bagSize = parseFloat(match[1]);
      }
      const bagsNeeded = Math.max(1, Math.ceil(adhesiveNeeded / bagSize));
      if (bagsNeeded > 0) {
        const adhesiveResult = calculateMaterialTransportTime(bagsNeeded, carrierSizeForTransport, 'cement', parseFloat(effectiveTransportDistance) || 30);
        adhesiveTransportTime = adhesiveResult.totalTransportTime;
        normalizedAdhesiveTransportTime = adhesiveResult.normalizedTransportTime;
      }

      // Add transport tasks
      if (tileTransportTime > 0) {
        taskBreakdown.push({
          task: 'transport tiles',
          hours: tileTransportTime,
          amount: `${totalTiles} pieces`,
          unit: 'pieces'
        });
      }

      if (adhesiveTransportTime > 0) {
        taskBreakdown.push({
          task: 'transport adhesive',
          hours: adhesiveTransportTime,
          amount: `${bagsNeeded} bags`,
          unit: 'bags'
        });
      }
    }

    const totalTransportTime = tileTransportTime + adhesiveTransportTime;

    const totalSlabsCount = slabsPerSegment && slabsPerSegment.length > 0
      ? slabsPerSegment.reduce((a, b) => a + b, 0)
      : fullSlabs + cutSlabs.reduce((sum, cut) => sum + cut.quantity, 0);
    const newResults = {
      totalSlabs: totalSlabsCount,
      totalCuts,
      adhesiveNeeded,
      cuttingBreakdown,
      taskBreakdown,
      materials,
      labor: tileTaskTotal + cuttingTaskTotal + totalTransportTime,
      ...(slabsPerSegment && { slabsPerSegment })
    };

    // Prepare formatted results for parent/modal (match other calculators)
    const formattedResults = {
      ...newResults,
      materials: materials.map(material => ({
        name: material.name,
        quantity: material.amount,
        unit: material.unit
      }))
    };

    setResults(newResults);
    if (onResultsChange) {
      console.debug('[TileInstallationCalculator] onResultsChange payload:', formattedResults);
      onResultsChange(formattedResults);
    }
  };

  // Auto-calculate when Wall Calculate is clicked (fromWallSegments + canvas mode)
  useEffect(() => {
    if (fromWallSegments && (canvasMode || isInProjectCreating) && calculateTrigger > 0 && (initialAreaM2 ?? 0) > 0) {
      calculateResults();
    }
  }, [calculateTrigger, fromWallSegments, canvasMode, isInProjectCreating, initialAreaM2]);

  // Scroll to results when they appear
  useEffect(() => {
    if (results && resultsRef.current) {
      setTimeout(() => {
        const modalContainer = resultsRef.current?.closest('[data-calculator-results]');
        if (modalContainer && resultsRef.current) {
          modalContainer.scrollTop = resultsRef.current.offsetTop - 100;
        } else {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [results]);

  const inputStyle = canvasMode
    ? { marginTop: 4, display: 'block', width: '100%', borderRadius: radii.md, border: `1px solid ${colors.borderInputDark}`, background: colors.bgInputDark, color: colors.textPrimaryLight, padding: '8px 12px', outline: 'none' } as React.CSSProperties
    : undefined;
  const inputCls = canvasMode ? undefined : "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500";
  const labelCls = canvasMode ? undefined : "block text-sm font-medium text-gray-700";
  const labelStyle = canvasMode ? { display: 'block', fontSize: 14, fontWeight: 500, color: colors.textCool } as React.CSSProperties : undefined;

  return (
    <div className={canvasMode ? "space-y-4" : "space-y-6"}>
      {!canvasMode && <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('calculator:tile_installation_calculator_title_alt')}</h2>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls} style={labelStyle}>{t('calculator:input_tile_wall_length_m')}</label>
          <input
            type="number"
            value={!fromWallSegments && wallConfigMode === 'segments' && segmentLengthsLocal.length > 0
              ? segmentLengthsLocal.reduce((a, b) => a + b, 0).toFixed(3)
              : wallLength}
            onChange={(e) => !fromWallSegments && wallConfigMode !== 'segments' && setWallLength(e.target.value)}
            readOnly={fromWallSegments || (wallConfigMode === 'segments' && segmentLengthsLocal.length > 0)}
            className={inputCls}
            style={inputStyle}
            placeholder={t('calculator:placeholder_enter_wall_length_tile')}
            step="0.01"
          />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>{t('calculator:input_tile_wall_height_m')}</label>
          <input
            type="number"
            value={!fromWallSegments && wallConfigMode === 'segments' && segmentHeightsLocal.length > 0
              ? (segmentHeightsLocal.reduce((sum, h) => sum + (h.startH + h.endH) / 2, 0) / segmentHeightsLocal.length).toFixed(2)
              : wallHeight}
            onChange={(e) => !fromWallSegments && wallConfigMode !== 'segments' && setWallHeight(e.target.value)}
            readOnly={fromWallSegments || (wallConfigMode === 'segments' && segmentLengthsLocal.length > 0)}
            className={inputCls}
            style={inputStyle}
            placeholder={t('calculator:placeholder_enter_wall_height_tile')}
            step="0.01"
          />
        </div>
      </div>

      {/* Wall configuration: Single / Segments — only when not from wall (standalone) */}
      {!fromWallSegments && (
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.textWarm ?? colors.textLabel, marginBottom: 6, display: 'block' }}>{t('calculator:wall_configuration_label')}</label>
          <div style={{ display: 'flex', background: colors.bgDeep ?? '#1a2332', borderRadius: 8, border: `1px solid ${colors.bgDeepBorder ?? 'rgba(255,255,255,0.06)'}`, padding: 3, gap: 3 }}>
            <button
              type="button"
              disabled={segmentLengthsLocal.length > 1}
              onClick={() => {
                if (segmentLengthsLocal.length <= 1) {
                  setWallConfigMode('single');
                  if (segmentLengthsLocal.length === 1) {
                    setWallLength(String(segmentLengthsLocal[0]));
                    setWallHeight(String(segmentHeightsLocal[0]?.startH ?? defH));
                  }
                }
              }}
              title={segmentLengthsLocal.length > 1 ? t('calculator:remove_segments_single') : undefined}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 6, border: 'none', background: wallConfigMode === 'single' ? (colors.greenBg ?? 'rgba(34,197,94,0.1)') : 'transparent',
                color: segmentLengthsLocal.length > 1 ? (colors.textDisabled ?? '#64748b') : (wallConfigMode === 'single' ? (colors.green ?? '#22c55e') : (colors.textLabel ?? '#94a3b8')), fontWeight: 600, fontSize: '0.82rem', cursor: segmentLengthsLocal.length > 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: segmentLengthsLocal.length > 1 ? 0.5 : 1
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x={3} y={8} width={18} height={8} rx={1} /></svg>
              {t('calculator:single_wall_label')}
            </button>
            <button
              type="button"
              onClick={() => setWallConfigMode('segments')}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 6, border: 'none', background: wallConfigMode === 'segments' ? (colors.greenBg ?? 'rgba(34,197,94,0.1)') : 'transparent',
                color: wallConfigMode === 'segments' ? (colors.green ?? '#22c55e') : (colors.textLabel ?? '#94a3b8'), fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x={2} y={8} width={5} height={8} rx={1} /><rect x={9} y={8} width={6} height={8} rx={1} /><rect x={17} y={8} width={5} height={8} rx={1} /></svg>
              {t('calculator:segments_label')} {segmentLengthsLocal.length > 0 && `(${segmentLengthsLocal.length})`}
            </button>
          </div>
          <div style={{ fontSize: fontSizes?.sm ?? 13, color: colors.textLabel ?? '#94a3b8', marginTop: 6 }}>
            {wallConfigMode === 'single' ? t('calculator:wall_config_single_desc') : t('calculator:wall_config_segments_desc')}
          </div>
        </div>
      )}

      {/* Segments table — when standalone and segments mode */}
      {!fromWallSegments && wallConfigMode === 'segments' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.textCool ?? '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x={2} y={8} width={5} height={8} rx={1} /><rect x={9} y={6} width={6} height={10} rx={1} /><rect x={17} y={9} width={5} height={7} rx={1} /></svg>
              {t('calculator:wall_segments_label')}
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.green ?? '#22c55e', background: colors.greenBg ?? 'rgba(34,197,94,0.1)', padding: '1px 8px', borderRadius: 10 }}>{segmentLengthsLocal.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setAllSegmentHeights(defH)} title={t('calculator:reset_heights_title')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: colors.textLabel ?? '#94a3b8', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                {t('calculator:reset_button')}
              </button>
              <button type="button" onClick={addSegment} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${colors.green ?? '#22c55e'}`, background: colors.greenBg ?? 'rgba(34,197,94,0.1)', color: colors.green ?? '#22c55e', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                + {t('calculator:segments_label')}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.68rem', color: colors.textLabel ?? '#94a3b8', fontWeight: 600 }}>{t('calculator:set_all_label')}</span>
            {[0.6, 1.0, 1.2, 1.5, 1.8, 2.0].map((h) => (
              <button key={h} type="button" onClick={() => setAllSegmentHeights(h)} style={{ padding: '3px 10px', borderRadius: 12, border: `1px solid ${colors.borderInputDark ?? 'rgba(255,255,255,0.1)'}`, background: 'transparent', color: colors.textLabel ?? '#94a3b8', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', fontWeight: 500, cursor: 'pointer' }}>
                {h === 1 || h === 2 ? `${h}.0m` : `${h}m`}
              </button>
            ))}
          </div>
          <div style={{ background: colors.bgDeep ?? '#1a2332', border: `1px solid ${colors.bgDeepBorder ?? 'rgba(255,255,255,0.06)'}`, borderRadius: 12, overflow: 'hidden', marginTop: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr 100px 100px 44px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textLabel ?? '#94a3b8', padding: '0 12px', textTransform: 'uppercase' }}>#</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textLabel ?? '#94a3b8', padding: '0 12px', textTransform: 'uppercase' }}>{t('calculator:length_label')}</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textLabel ?? '#94a3b8', padding: '0 12px', textTransform: 'uppercase', textAlign: 'center' }}>{t('calculator:segment_start_h')}</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textLabel ?? '#94a3b8', padding: '0 12px', textTransform: 'uppercase', textAlign: 'center' }}>{t('calculator:segment_end_h')}</span>
              <span></span>
            </div>
            {segmentLengthsLocal.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: colors.textLabel ?? '#94a3b8', fontSize: '0.85rem' }}>
                {t('calculator:no_segments_add')}
              </div>
            ) : (
              segmentLengthsLocal.map((segLen, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '46px 1fr 100px 100px 44px', alignItems: 'center', padding: 0, borderBottom: idx < segmentLengthsLocal.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: idx % 2 === 1 ? 'rgba(255,255,255,0.022)' : undefined }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', fontWeight: 600, color: colors.textLabel ?? '#94a3b8', textAlign: 'center', padding: '10px 0' }}>{idx + 1}</div>
                  <div style={{ padding: '5px 6px' }}>
                    <input type="number" value={segLen} step={0.01} min={0.01} onChange={(e) => updateSegmentLength(idx, parseFloat(e.target.value) || 0)} style={{ width: '100%', maxWidth: 120, padding: '6px 8px', background: colors.bgInputDark ?? '#0f172a', border: `1px solid ${colors.borderInputDark ?? 'rgba(255,255,255,0.1)'}`, borderRadius: 6, color: colors.textPrimaryLight ?? '#e2e8f0', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', textAlign: 'center', outline: 'none' }} />
                  </div>
                  <div style={{ padding: '5px 6px', display: 'flex', justifyContent: 'center' }}>
                    <input type="number" value={segmentHeightsLocal[idx]?.startH ?? defH} step={0.1} min={0.1} onChange={(e) => updateSegmentHeight(idx, 'startH', parseFloat(e.target.value) || 0)} style={{ width: '100%', maxWidth: 80, padding: '6px 8px', background: colors.bgInputDark ?? '#0f172a', border: `1px solid ${colors.borderInputDark ?? 'rgba(255,255,255,0.1)'}`, borderRadius: 6, color: colors.textPrimaryLight ?? '#e2e8f0', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', textAlign: 'center', outline: 'none' }} />
                  </div>
                  <div style={{ padding: '5px 6px', display: 'flex', justifyContent: 'center' }}>
                    <input type="number" value={segmentHeightsLocal[idx]?.endH ?? defH} step={0.1} min={0.1} onChange={(e) => updateSegmentHeight(idx, 'endH', parseFloat(e.target.value) || 0)} style={{ width: '100%', maxWidth: 80, padding: '6px 8px', background: colors.bgInputDark ?? '#0f172a', border: `1px solid ${colors.borderInputDark ?? 'rgba(255,255,255,0.1)'}`, borderRadius: 6, color: colors.textPrimaryLight ?? '#e2e8f0', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', textAlign: 'center', outline: 'none' }} />
                  </div>
                  <div style={{ padding: '5px', display: 'flex', justifyContent: 'center' }}>
                    <button type="button" onClick={() => removeSegment(idx)} title={t('calculator:remove_segment')} style={{ padding: 4, borderRadius: 4, border: 'none', background: 'transparent', color: colors.textLabel ?? '#94a3b8', cursor: 'pointer', fontSize: 14 }}>✕</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_tile_slab_dimensions')}</label>
        <select
          value={selectedSlab.label}
          onChange={(e) => {
            const selected = SLAB_DIMENSIONS.find(dim => dim.label === e.target.value);
            if (selected) setSelectedSlab(selected);
          }}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          {SLAB_DIMENSIONS.map((dim) => (
            <option key={dim.label} value={dim.label}>
              {dim.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_tile_slab_orientation')}</label>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
            <input
              type="radio"
              value="long"
              checked={slabOrientation === 'long'}
              onChange={(e) => setSlabOrientation(e.target.value as 'long' | 'side')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2">{t('calculator:input_tile_slabs_long_way')}</span>
          </label>
          <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
            <input
              type="radio"
              value="side"
              checked={slabOrientation === 'side'}
              onChange={(e) => setSlabOrientation(e.target.value as 'long' | 'side')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2">{t('calculator:input_tile_slabs_side_ways')}</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_tile_gaps')}</label>
        <select
          value={selectedGap}
          onChange={(e) => setSelectedGap(Number(e.target.value))}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          {GAP_OPTIONS.map((gap) => (
            <option key={gap} value={gap}>
              {gap}mm
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:input_tile_slab_cutting_length')}</label>
          <div className="grid grid-cols-1 gap-2">
            <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
              <input
                type="radio"
                value="1cut"
                checked={lengthCutType === '1cut'}
                onChange={(e) => setLengthCutType(e.target.value as '1cut' | '2cuts')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2">{t('calculator:input_tile_1cut_at_end')}</span>
            </label>
            <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
              <input
                type="radio"
                value="2cuts"
                checked={lengthCutType === '2cuts'}
                onChange={(e) => setLengthCutType(e.target.value as '1cut' | '2cuts')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2">{t('calculator:input_tile_2cuts_beginning_end')}</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:input_tile_slab_cutting_height')}</label>
          <div className="grid grid-cols-1 gap-2">
            <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
              <input
                type="radio"
                value="1cut"
                checked={heightCutType === '1cut'}
                onChange={(e) => setHeightCutType(e.target.value as '1cut' | '2cuts')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2">{t('calculator:input_tile_1cut_on_top')}</span>
            </label>
            <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
              <input
                type="radio"
                value="2cuts"
                checked={heightCutType === '2cuts'}
                onChange={(e) => setHeightCutType(e.target.value as '1cut' | '2cuts')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2">{t('calculator:input_tile_2cuts_bottom_top')}</span>
            </label>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:input_tile_adhesive_thickness')}</label>
        <select
          value={adhesiveThickness}
          onChange={(e) => setAdhesiveThickness(Number(e.target.value))}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          {ADHESIVE_THICKNESS.map((thickness) => (
            <option key={thickness.value} value={thickness.value}>
              {thickness.value} cm
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:type_of_slabs')}</label>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
            <input
              type="radio"
              value="porcelain"
              checked={slabType === 'porcelain'}
              onChange={() => setSlabType('porcelain')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2">{t('calculator:porcelain')}</span>
          </label>
          <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
            <input
              type="radio"
              value="sandstones"
              checked={slabType === 'sandstones'}
              onChange={() => setSlabType('sandstones')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2">{t('calculator:sandstones')}</span>
          </label>
          <label className="inline-flex items-center p-2 rounded-md hover:bg-gray-50">
            <input
              type="radio"
              value="granite"
              checked={slabType === 'granite'}
              onChange={() => setSlabType('granite')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2">{t('calculator:granite')}</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:grouting_method')}</label>
        <select
          value={selectedGroutingId}
          onChange={e => setSelectedGroutingId(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-select"
          disabled={isLoadingGrouting}
        >
          <option value="">{t('calculator:select_grouting_method_placeholder')}</option>
          {groutingMethods.map((method: any) => (
            <option key={method.id} value={method.id}>{method.name}</option>
          ))}
        </select>
        {isLoadingGrouting && <p className="text-sm text-gray-500 mt-1">{t('calculator:loading_grouting_methods')}</p>}
        <p className="text-xs text-red-600 mt-1">{t('calculator:grouting_method_note')}</p>
      </div>

      {!isInProjectCreating && (
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={calculateTransport}
            onChange={(e) => setCalculateTransport(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">{t('calculator:calculate_transport_time_label')}</span>
        </label>
      )}

      {/* Transport Carrier Selection */}
      {!isInProjectCreating && calculateTransport && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">{t('calculator:transport_carrier_label')}</label>
          <div className="space-y-2">
            <div 
              className="flex items-center p-2 cursor-pointer border-2 border-dashed border-gray-300 rounded"
              onClick={() => setSelectedTransportCarrier(null)}
            >
              <div className={`w-4 h-4 rounded-full border mr-2 ${
                selectedTransportCarrier === null 
                  ? 'border-gray-400' 
                  : 'border-gray-400'
              }`}>
                <div className={`w-2 h-2 rounded-full m-0.5 ${
                  selectedTransportCarrier === null 
                    ? 'bg-gray-400' 
                    : 'bg-transparent'
                }`}></div>
              </div>
              <div>
                <span className="text-gray-800">{t('calculator:default_wheelbarrow')}</span>
              </div>
            </div>
            {carriers && carriers.length > 0 && carriers.map((carrier) => (
              <div 
                key={carrier.id}
                className="flex items-center p-2 cursor-pointer"
                onClick={() => setSelectedTransportCarrier(carrier)}
              >
                <div className={`w-4 h-4 rounded-full border mr-2 ${
                  selectedTransportCarrier?.id === carrier.id 
                    ? 'border-gray-400' 
                    : 'border-gray-400'
                }`}>
                  <div className={`w-2 h-2 rounded-full m-0.5 ${
                    selectedTransportCarrier?.id === carrier.id 
                      ? 'bg-gray-400' 
                      : 'bg-transparent'
                  }`}></div>
                </div>
                <div>
                  <span className="text-gray-800">{carrier.name}</span>
                  <span className="text-sm text-gray-600 ml-2">({carrier["size (in tones)"]} tons)</span>
                </div>
              </div>
            ))}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('calculator:transport_distance_label')}</label>
              <input
                type="number"
                value={transportDistance}
                onChange={(e) => setTransportDistance(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder={t('calculator:enter_transport_distance')}
                min="0"
                step="1"
              />
            </div>
          </div>
        )}

      {!(fromWallSegments && (canvasMode || isInProjectCreating)) && (
        <div className="flex justify-center">
          <Button variant="accent" color={colors.accentBlue} onClick={calculateResults}>
            {t('calculator:calculate_button')}
          </Button>
        </div>
      )}

      {results && (
        <div className="mt-6 space-y-4" ref={resultsRef}>
          {/* Slab cutting breakdown first */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">{t('calculator:slab_cutting_breakdown_label')}</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('calculator:table_type_header')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('calculator:table_length_cm')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('calculator:table_height_cm')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('calculator:table_quantity_header')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Only show Full Slabs row if quantity > 0 */}
                  {results.cuttingBreakdown.fullSlabs > 0 && (
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {t('calculator:full_slabs_row')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {slabOrientation === 'long' ? selectedSlab.width : selectedSlab.height}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {slabOrientation === 'long' ? selectedSlab.height : selectedSlab.width}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {results.cuttingBreakdown.fullSlabs}
                      </td>
                    </tr>
                  )}
                  {/* Only show cut slabs with quantity > 0 */}
                  {results.cuttingBreakdown.cutSlabs.filter(cut => cut.quantity > 0).map((cut, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {cut.width === selectedSlab.width ? 'Height Cut' : 
                         cut.height === selectedSlab.height ? 'Length Cut' : 'Corner Cut'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {cut.width.toFixed(1)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {cut.height.toFixed(1)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {cut.fullSlabsNeeded != null
                          ? `${cut.quantity} (${cut.fullSlabsNeeded})`
                          : cut.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Slabs per segment (wycinka) when from wall or user-defined segments */}
          {results.slabsPerSegment && results.slabsPerSegment.length > 0 && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium text-gray-900 mb-4">{t('calculator:slabs_per_segment_label')}</h3>
              <div className="space-y-1 text-sm text-gray-700">
                {results.slabsPerSegment.map((count, i) => (
                  <div key={i}>Segment {i + 1}: {count} slabs</div>
                ))}
                <div className="font-semibold mt-2">Total: {results.slabsPerSegment.reduce((a, b) => a + b, 0)} slabs</div>
              </div>
            </div>
          )}

          {/* Task breakdown */}
          <div className="bg-transparent p-0">
            <div className="text-base font-medium text-gray-100 mb-1">{t('calculator:task_breakdown')}</div>
            <ul className="list-disc ml-6 text-gray-100">
              {results.taskBreakdown.map((task, index) => (
                <li key={index}>
                  <span className="font-bold">{translateTaskName(task.task, t)}:</span> {task.hours.toFixed(2)} {t('calculator:hours_suffix')}
                </li>
              ))}
            </ul>
          </div>

          {/* Total labor hours - only when not fromWallSegments canvas mode */}
          {!(fromWallSegments && (canvasMode || isInProjectCreating)) && (
            <div className="text-lg font-semibold mb-1">
              <span className="text-gray-100">{t('calculator:total_labor_hours')}</span>
              <span className="text-blue-400 text-2xl align-middle font-bold">{(results.labor).toFixed(2)} hours</span>
            </div>
          )}

          {/* Materials Breakdown Table - only when not fromWallSegments canvas mode */}
          {!(fromWallSegments && (canvasMode || isInProjectCreating)) && (
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">{t('calculator:materials_breakdown_label')}</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Material
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unit
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {results.materials.map((material, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{material.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{material.amount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{translateUnit(material.unit, t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WallFinishCalculator;
